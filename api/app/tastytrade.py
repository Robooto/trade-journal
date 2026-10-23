import logging
import os
import threading
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Generic, TypeVar
from urllib.parse import quote

import requests
from requests.adapters import HTTPAdapter
from sqlalchemy.orm import Session
from urllib3.util.retry import Retry

from app import crud
from app.settings import settings
from app.tastytrade_schema import (
    TastyAccount,
    TastyAccountBalance,
    TastyComplexOrderResponse,
    TastyEarningsReport,
    TastyMarketData,
    TastyOrder,
    TastyPosition,
    TastyTransaction,
    TastyVolatilityMetric,
    TastyWatchlist,
    TastyWatchlistEntry,
)


BASE_URL = settings.tastytrade_url
REQUEST_TIMEOUT_SECONDS = settings.tastytrade_timeout_seconds
USER_AGENT = settings.tastytrade_user_agent
ACCOUNTS_TTL_SECONDS = 300

logger = logging.getLogger(__name__)

# Reads retry briefly on throttling and gateway errors. Nothing is re-sent once a
# request reached tastytrade (read=0), and non-GET requests never retry on status.
_RETRY = Retry(
    total=2,
    connect=2,
    read=0,
    status=2,
    backoff_factor=0.3,
    status_forcelist=(429, 502, 503, 504),
    allowed_methods=frozenset({"GET"}),
    respect_retry_after_header=False,
    raise_on_status=False,
)
_session_lock = threading.Lock()
_shared_session: requests.Session | None = None

_token_lock = threading.Lock()
_token_cache: tuple[str, datetime] | None = None
_accounts_cache: dict[str, tuple[float, list[TastyAccount]]] = {}


def _session() -> requests.Session:
    """One keep-alive session shared by every thread, so calls reuse warm TLS connections.

    urllib3's connection pool is thread-safe; the pool is sized for the parallel
    per-account reads plus concurrent API requests.
    """
    global _shared_session
    if _shared_session is None:
        with _session_lock:
            if _shared_session is None:
                session = requests.Session()
                adapter = HTTPAdapter(pool_connections=2, pool_maxsize=16, max_retries=_RETRY)
                session.mount("https://", adapter)
                session.mount("http://", adapter)
                _shared_session = session
    return _shared_session


def reset_caches() -> None:
    """Forget the cached access token and account list (tests, credential changes)."""
    global _token_cache
    with _token_lock:
        _token_cache = None
    _accounts_cache.clear()


def _headers(token: str | None = None, *, content_type: str | None = None) -> dict[str, str]:
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    }
    if token:
        headers["Authorization"] = token
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def _send(method: str, path: str, **kwargs) -> requests.Response:
    return _session().request(
        method,
        f"{BASE_URL}{path}",
        timeout=REQUEST_TIMEOUT_SECONDS,
        **kwargs,
    )


def _request_json(method: str, path: str, **kwargs) -> dict:
    response = _send(method, path, **kwargs)
    headers = kwargs.get("headers") or {}
    rejected = headers.get("Authorization")
    if response.status_code == 401 and rejected:
        # A 401 means nothing was executed, so one retry with a fresh token is safe for any method.
        fresh = _replace_rejected_token(rejected)
        if fresh:
            kwargs["headers"] = {**headers, "Authorization": fresh}
            response = _send(method, path, **kwargs)
    response.raise_for_status()
    return response.json()

def login_to_tastytrade() -> tuple[str, datetime]:
    """
    Authenticate with the Tastytrade API and get an OAuth access token.
    Returns a tuple of (auth_header_value, expiration_datetime).
    """

    client_secret = os.getenv("TASTYTRADE_SECRET")
    refresh_token = os.getenv("TASTYTRADE_REFRESH")
    if not client_secret or not refresh_token:
        raise RuntimeError("Tastytrade OAuth credentials not set in environment variables.")

    payload = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_secret": client_secret,
    }

    data = _request_json(
        "POST",
        "/oauth/token",
        data=payload,
        headers=_headers(content_type="application/x-www-form-urlencoded"),
    )

    access_token = data["access_token"]
    token_type = data.get("token_type", "Bearer")
    expires_value = data.get("expires_in", 0)
    try:
        expires_in = int(float(expires_value))
    except (TypeError, ValueError):
        expires_in = 0
    buffer_seconds = 30  # refresh a little early to avoid using an expired token
    exp_dt = datetime.now(UTC) + timedelta(seconds=max(expires_in - buffer_seconds, 0))
    bearer_token = f"{token_type} {access_token}".strip()
    return bearer_token, exp_dt

def get_active_token(db: Session) -> str:
    """
    Return a valid access token: from memory, then the database, else a fresh login.
    The lock makes concurrent requests share one refresh instead of each logging in.
    """
    global _token_cache
    with _token_lock:
        now = datetime.now(UTC)
        if _token_cache and _token_cache[1] > now:
            return _token_cache[0]
        token_entry = crud.get_session_token(db)
        if token_entry:
            expiration = token_entry.expiration.replace(tzinfo=UTC)
            if expiration > now:
                _token_cache = (token_entry.token, expiration)
                return token_entry.token
        return _login_and_store(db)


def _login_and_store(db: Session) -> str:
    """Log in and persist the token; the caller holds ``_token_lock``."""
    global _token_cache
    new_token, new_expiration = login_to_tastytrade()
    crud.save_session_token(db, new_token, new_expiration)
    _token_cache = (new_token, new_expiration)
    return new_token


def _replace_rejected_token(rejected: str) -> str | None:
    """tastytrade refused a token before its recorded expiry: refresh once, shared by concurrent callers."""
    with _token_lock:
        if _token_cache and _token_cache[0] != rejected and _token_cache[1] > datetime.now(UTC):
            return _token_cache[0]
        from app.db import SessionLocal

        db = SessionLocal()
        try:
            logger.warning("Tastytrade rejected the cached access token; refreshing it.")
            return _login_and_store(db)
        except Exception:
            logger.exception("Tastytrade token refresh after a 401 failed.")
            return None
        finally:
            db.close()

def _items_from_response(data: dict) -> list[dict]:
    return data.get("data", {}).get("items", [])


def fetch_accounts(token: str) -> list[TastyAccount]:
    """
    Fetch all accounts for the logged-in user via the Tastytrade API.

    Returns typed account models with account_number and nickname fields. The list
    rarely changes, so it is cached per token for a few minutes.
    """
    cached = _accounts_cache.get(token)
    if cached and time.monotonic() - cached[0] < ACCOUNTS_TTL_SECONDS:
        return list(cached[1])
    data = _request_json("GET", "/customers/me/accounts", headers=_headers(token))

    accounts: list[TastyAccount] = []
    for item in _items_from_response(data):
        acct = item.get("account", {})
        accounts.append(TastyAccount.model_validate(acct))
    _accounts_cache.clear()
    _accounts_cache[token] = (time.monotonic(), accounts)
    return list(accounts)

def fetch_positions(token: str, account_number: str) -> list[TastyPosition]:
    """
    Retrieve all positions for a given account from the Tastytrade API.
    Returns a list of position dictionaries for the specified account.
    """
    data = _request_json(
        "GET",
        f"/accounts/{account_number}/positions?net-positions=true&include-marks=true",
        headers=_headers(token),
    )

    return [TastyPosition.model_validate(item) for item in _items_from_response(data)]

def fetch_nested_option_chain(token: str, symbol: str) -> list[dict]:
    """Fetch contract metadata grouped by expiration and strike."""
    normalized = symbol.strip().upper()
    if not normalized:
        raise ValueError("An underlying symbol is required.")
    data = _request_json(
        "GET", f"/option-chains/{quote(normalized, safe='')}/nested", headers=_headers(token)
    )
    return list(_items_from_response(data))

def fetch_market_data(token: str, equity: list[str], equity_option: list[str], future: list[str], future_option: list[str]) -> list[TastyMarketData]:
    """
    Fetch market data for the given symbols from the Tastytrade API.
    Returns a list of market data dictionaries.
    """
    params = {
        "equity": ",".join(equity),
        "equity-option": ",".join(equity_option),
        "future": ",".join(future),
        "future-option": ",".join(future_option)
    }
    data = _request_json(
        "GET",
        "/market-data/by-type",
        headers=_headers(token),
        params=params,
    )
    return [TastyMarketData.model_validate(item) for item in _items_from_response(data)]

def fetch_volatility_data(token: str, symbols: list[str]) -> list[TastyVolatilityMetric]:
    """
    Fetch volatility data for the given symbols from the Tastytrade API.
    Returns a list of volatility data dictionaries.
    """
    params = {
        "symbols": ",".join(symbols)
    }
    data = _request_json(
        "GET",
        "/market-metrics",
        headers=_headers(token),
        params=params,
    )
    return [TastyVolatilityMetric.model_validate(item) for item in _items_from_response(data)]

def fetch_account_balance(token: str, account_number: str) -> TastyAccountBalance:
    """
    Fetch the account balance for a specific account from the Tastytrade API.
    Returns a dictionary with balance information.
    """
    data = _request_json(
        "GET",
        f"/accounts/{account_number}/balances",
        headers=_headers(token),
    )

    return TastyAccountBalance.model_validate(data["data"])


def place_complex_order(token: str, account_number: str, payload: dict) -> TastyComplexOrderResponse:
    """
    Submit a complex order (OCO/OTO/etc.) to the Tastytrade API.
    Returns the raw API response data.
    """
    data = _request_json(
        "POST",
        f"/accounts/{account_number}/complex-orders",
        headers=_headers(token, content_type="application/json"),
        json=payload,
    )
    return TastyComplexOrderResponse.model_validate(data.get("data", data))

def _order_path(account_number: str, order_id: str | int | None = None, *, dry_run: bool = False) -> str:
    path = f"/accounts/{quote(account_number, safe='')}/orders"
    if dry_run:
        return path + "/dry-run"
    return path if order_id is None else f"{path}/{quote(str(order_id), safe='')}"


def dry_run_order(token: str, account_number: str, payload: dict) -> dict:
    """Validate an order without placing it; returns buying-power effect, fees and warnings."""
    data = _request_json("POST", _order_path(account_number, dry_run=True),
                         headers=_headers(token, content_type="application/json"), json=payload)
    return data.get("data", data)


def place_order(token: str, account_number: str, payload: dict) -> dict:
    """Place an order. Money-moving: POSTs are never retried (see _RETRY)."""
    data = _request_json("POST", _order_path(account_number),
                         headers=_headers(token, content_type="application/json"), json=payload)
    return data.get("data", data)


def fetch_order(token: str, account_number: str, order_id: str | int) -> dict:
    data = _request_json("GET", _order_path(account_number, order_id), headers=_headers(token))
    return data.get("data", data)


def fetch_live_orders(token: str, account_number: str) -> list[dict]:
    """Orders that are working or finished within the last day."""
    data = _request_json("GET", _order_path(account_number) + "/live", headers=_headers(token))
    return list(_items_from_response(data))


def replace_order(token: str, account_number: str, order_id: str | int, payload: dict) -> dict:
    """Cancel-replace a working order; only price, order type and time in force may differ."""
    data = _request_json("PUT", _order_path(account_number, order_id),
                         headers=_headers(token, content_type="application/json"), json=payload)
    return data.get("data", data)


def cancel_order(token: str, account_number: str, order_id: str | int) -> dict:
    data = _request_json("DELETE", _order_path(account_number, order_id), headers=_headers(token))
    return data.get("data", data)


PageItem = TypeVar("PageItem")


@dataclass(frozen=True)
class TastyPage(Generic[PageItem]):
    items: list[PageItem]
    page_offset: int
    per_page: int
    total_items: int | None
    total_pages: int | None
    has_more: bool


def _validate_page_window(
    start_date: str,
    end_date: str,
    *,
    per_page: int,
    maximum_per_page: int,
) -> None:
    try:
        start = datetime.strptime(start_date, "%Y-%m-%d").date()
        end = datetime.strptime(end_date, "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValueError("Dates must use YYYY-MM-DD format.") from exc
    if start > end:
        raise ValueError("start_date must be on or before end_date.")
    if not 1 <= per_page <= maximum_per_page:
        raise ValueError(
            f"per_page must be between 1 and {maximum_per_page}."
        )


def _page_from_response(
    data: dict,
    model_type,
    *,
    page_offset: int,
    per_page: int,
) -> TastyPage:
    items = [
        model_type.model_validate(item)
        for item in _items_from_response(data)
    ]
    pagination = data.get("data", {}).get("pagination", {}) or {}
    actual_offset = int(pagination.get("page-offset", page_offset))
    actual_per_page = int(pagination.get("per-page", per_page))
    total_items = pagination.get("total-items")
    total_pages = pagination.get("total-pages")
    total_items = int(total_items) if total_items is not None else None
    total_pages = int(total_pages) if total_pages is not None else None
    if total_pages is not None:
        has_more = actual_offset + 1 < total_pages
    elif total_items is not None:
        has_more = (actual_offset + 1) * actual_per_page < total_items
    else:
        has_more = len(items) >= actual_per_page
    return TastyPage(
        items=items,
        page_offset=actual_offset,
        per_page=actual_per_page,
        total_items=total_items,
        total_pages=total_pages,
        has_more=has_more,
    )


def fetch_watchlists(token: str) -> list[TastyWatchlist]:
    data = _request_json("GET", "/watchlists", headers=_headers(token))
    return [
        TastyWatchlist.model_validate(item)
        for item in _items_from_response(data)
    ]


def add_symbol_to_watchlist(
    token: str,
    watchlist_name: str,
    symbol: str,
    *,
    instrument_type: str = "Equity",
) -> tuple[TastyWatchlist, bool]:
    """Append one symbol while preserving every existing watchlist property."""
    requested_name = watchlist_name.strip()
    normalized_symbol = symbol.strip().upper()
    if not requested_name:
        raise ValueError("Watchlist name is required.")
    if not normalized_symbol:
        raise ValueError("Symbol is required.")

    watchlists = fetch_watchlists(token)
    watchlist = next(
        (
            item
            for item in watchlists
            if item.name.casefold() == requested_name.casefold()
        ),
        None,
    )
    if watchlist is None:
        raise LookupError("Brokerage watchlist not found.")
    if any(
        entry.symbol.upper() == normalized_symbol
        for entry in watchlist.watchlist_entries
    ):
        return watchlist, False

    entries = [
        entry.to_tasty_dict()
        for entry in watchlist.watchlist_entries
    ]
    entries.append(
        TastyWatchlistEntry(
            symbol=normalized_symbol,
            instrument_type=instrument_type,
        ).to_tasty_dict()
    )
    payload = {
        "name": watchlist.name,
        "watchlist-entries": entries,
    }
    if watchlist.group_name is not None:
        payload["group-name"] = watchlist.group_name
    if watchlist.order_index is not None:
        payload["order-index"] = watchlist.order_index

    _request_json(
        "PUT",
        f"/watchlists/{quote(watchlist.name, safe='')}",
        headers=_headers(token, content_type="application/json"),
        json=payload,
    )
    return TastyWatchlist.model_validate(payload), True


def fetch_orders(
    token: str,
    account_number: str,
    *,
    start_date: str,
    end_date: str,
    page_offset: int = 0,
    per_page: int = 100,
) -> TastyPage[TastyOrder]:
    _validate_page_window(
        start_date,
        end_date,
        per_page=per_page,
        maximum_per_page=100,
    )
    params = {
        "start-date": start_date,
        "end-date": end_date,
        "sort": "Asc",
        "page-offset": page_offset,
        "per-page": per_page,
    }
    data = _request_json(
        "GET",
        f"/accounts/{account_number}/orders",
        headers=_headers(token),
        params=params,
    )
    return _page_from_response(
        data, TastyOrder, page_offset=page_offset, per_page=per_page
    )


def fetch_transactions(
    token: str,
    account_number: str,
    *,
    start_date: str,
    end_date: str,
    page_offset: int = 0,
    per_page: int = 2000,
) -> TastyPage[TastyTransaction]:
    _validate_page_window(
        start_date,
        end_date,
        per_page=per_page,
        maximum_per_page=2000,
    )
    params = {
        "start-date": start_date,
        "end-date": end_date,
        "sort": "Asc",
        "page-offset": page_offset,
        "per-page": per_page,
    }
    data = _request_json(
        "GET",
        f"/accounts/{account_number}/transactions",
        headers=_headers(token),
        params=params,
    )
    return _page_from_response(
        data, TastyTransaction, page_offset=page_offset, per_page=per_page
    )


def fetch_historical_earnings(
    token: str,
    symbol: str,
    *,
    start_date: str,
    end_date: str,
) -> list[TastyEarningsReport]:
    _validate_page_window(
        start_date,
        end_date,
        per_page=1,
        maximum_per_page=1,
    )
    data = _request_json(
        "GET",
        (
            "/market-metrics/historic-corporate-events/"
            f"earnings-reports/{symbol.upper()}"
        ),
        headers=_headers(token),
        params={"start-date": start_date, "end-date": end_date},
    )
    return [
        TastyEarningsReport.model_validate(item)
        for item in _items_from_response(data)
    ]
