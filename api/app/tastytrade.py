import os
import requests
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from typing import Generic, Tuple, List, TypeVar

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
)


BASE_URL = settings.tastytrade_url
REQUEST_TIMEOUT_SECONDS = settings.tastytrade_timeout_seconds
USER_AGENT = settings.tastytrade_user_agent


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


def _request_json(method: str, path: str, **kwargs) -> dict:
    response = requests.request(
        method,
        f"{BASE_URL}{path}",
        timeout=REQUEST_TIMEOUT_SECONDS,
        **kwargs,
    )
    response.raise_for_status()
    return response.json()

def login_to_tastytrade() -> Tuple[str, datetime]:
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
    exp_dt = datetime.now(timezone.utc) + timedelta(seconds=max(expires_in - buffer_seconds, 0))
    bearer_token = f"{token_type} {access_token}".strip()
    return bearer_token, exp_dt

def get_active_token(db: Session) -> str:
    """
    Retrieve a valid access token, using a cached token if possible or logging in if needed.
    This function checks the token stored in the database and refreshes it if expired.
    """
    token_entry = crud.get_session_token(db)

    if token_entry:
        if token_entry.expiration.replace(tzinfo=timezone.utc) > datetime.now(timezone.utc):
            return token_entry.token
    # If no token found or it's expired, log in again to get a new token
    new_token, new_expiration = login_to_tastytrade()
    crud.save_session_token(db, new_token, new_expiration)
    return new_token

def _items_from_response(data: dict) -> list[dict]:
    return data.get("data", {}).get("items", [])


def fetch_accounts(token: str) -> List[TastyAccount]:
    """
    Fetch all accounts for the logged-in user via the Tastytrade API.

    Returns typed account models with account_number and nickname fields.
    """
    data = _request_json("GET", "/customers/me/accounts", headers=_headers(token))

    accounts: list[TastyAccount] = []
    for item in _items_from_response(data):
        acct = item.get("account", {})
        accounts.append(TastyAccount.model_validate(acct))
    return accounts

def fetch_positions(token: str, account_number: str) -> List[TastyPosition]:
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

def fetch_market_data(token: str, equity: List[str], equity_option: List[str], future: List[str], future_option: List[str]) -> List[TastyMarketData]:
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

def fetch_volatility_data(token: str, symbols: List[str]) -> List[TastyVolatilityMetric]:
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


def fetch_watchlists(token: str) -> List[TastyWatchlist]:
    data = _request_json("GET", "/watchlists", headers=_headers(token))
    return [
        TastyWatchlist.model_validate(item)
        for item in _items_from_response(data)
    ]


def fetch_orders(
    token: str,
    account_number: str,
    *,
    start_date: str,
    end_date: str,
    page_offset: int = 0,
    per_page: int = 250,
) -> TastyPage[TastyOrder]:
    _validate_page_window(
        start_date,
        end_date,
        per_page=per_page,
        maximum_per_page=250,
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
) -> List[TastyEarningsReport]:
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
