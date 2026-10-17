from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
import requests

from app import tastytrade
from app.settings import settings


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            response = requests.Response()
            response.status_code = self.status_code
            raise requests.HTTPError(f"{self.status_code}", response=response)

    def json(self):
        return self.payload


class FakeSession:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []

    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        return self.responses.pop(0)


@pytest.fixture
def session(monkeypatch):
    fake = FakeSession()
    monkeypatch.setattr(tastytrade, "_session", lambda: fake)
    return fake


ACCOUNTS = {"data": {"items": [{"account": {"account-number": "5WT1", "nickname": "Main"}}]}}


def test_request_json_uses_base_url_and_timeout(session):
    session.responses.append(FakeResponse({"data": {"items": []}}))

    tastytrade._request_json("GET", "/customers/me/accounts", headers={"Accept": "application/json"})

    method, url, kwargs = session.calls[0]
    assert method == "GET"
    assert url == f"{tastytrade.BASE_URL}/customers/me/accounts"
    assert kwargs["timeout"] == tastytrade.REQUEST_TIMEOUT_SECONDS == settings.tastytrade_timeout_seconds
    assert kwargs["headers"] == {"Accept": "application/json"}


def test_fetch_market_data_uses_shared_request_helper(session):
    session.responses.append(FakeResponse({"data": {"items": [{"symbol": "SPY", "mark": "500"}]}}))

    items = tastytrade.fetch_market_data("Bearer TOKEN", ["SPY"], [], [], [])

    assert items[0].symbol == "SPY"
    method, url, kwargs = session.calls[0]
    assert method == "GET" and url.endswith("/market-data/by-type")
    assert kwargs["headers"]["Authorization"] == "Bearer TOKEN"
    assert kwargs["headers"]["User-Agent"] == settings.tastytrade_user_agent
    assert kwargs["params"]["equity"] == "SPY"


def test_login_uses_form_content_type_and_timeout(session, monkeypatch):
    session.responses.append(FakeResponse({"access_token": "ACCESS", "token_type": "Bearer", "expires_in": "3600"}))
    monkeypatch.setenv("TASTYTRADE_SECRET", "SECRET")
    monkeypatch.setenv("TASTYTRADE_REFRESH", "REFRESH")

    token, _ = tastytrade.login_to_tastytrade()

    method, url, kwargs = session.calls[0]
    assert token == "Bearer ACCESS"
    assert method == "POST" and url.endswith("/oauth/token")
    assert kwargs["headers"]["Content-Type"] == "application/x-www-form-urlencoded"
    assert kwargs["data"]["grant_type"] == "refresh_token"


def test_a_rejected_token_is_refreshed_once_and_the_request_retried(session, monkeypatch):
    session.responses += [FakeResponse({}, status_code=401), FakeResponse(ACCOUNTS)]
    logins = []
    monkeypatch.setattr(tastytrade, "_login_and_store", lambda db: logins.append(db) or "Bearer FRESH")

    accounts = tastytrade.fetch_accounts("Bearer STALE")

    assert [a.account_number for a in accounts] == ["5WT1"]
    assert len(logins) == 1
    assert [call[2]["headers"]["Authorization"] for call in session.calls] == ["Bearer STALE", "Bearer FRESH"]


def test_a_second_401_is_raised_and_a_newer_cached_token_is_reused(session, monkeypatch):
    tastytrade._token_cache = ("Bearer NEWER", datetime.now(UTC) + timedelta(minutes=5))
    monkeypatch.setattr(tastytrade, "_login_and_store", lambda db: pytest.fail("should reuse the newer token"))
    session.responses += [FakeResponse({}, status_code=401), FakeResponse({}, status_code=401)]

    with pytest.raises(requests.HTTPError):
        tastytrade.fetch_watchlists("Bearer STALE")

    assert session.calls[1][2]["headers"]["Authorization"] == "Bearer NEWER"
    assert len(session.calls) == 2


def test_requests_without_a_token_are_not_refreshed(session, monkeypatch):
    monkeypatch.setattr(tastytrade, "_replace_rejected_token", lambda token: pytest.fail("no token to replace"))
    session.responses.append(FakeResponse({}, status_code=401))

    with pytest.raises(requests.HTTPError):
        tastytrade._request_json("POST", "/oauth/token", headers={"Accept": "application/json"})


def test_accounts_are_cached_per_token(session):
    session.responses += [FakeResponse(ACCOUNTS), FakeResponse(ACCOUNTS)]

    first = tastytrade.fetch_accounts("Bearer A")
    again = tastytrade.fetch_accounts("Bearer A")
    other = tastytrade.fetch_accounts("Bearer B")

    assert len(session.calls) == 2
    assert first == again == other
    first.clear()
    assert tastytrade.fetch_accounts("Bearer B")


def test_active_token_comes_from_memory_then_database_then_login(monkeypatch):
    expiration = datetime.now(UTC) + timedelta(hours=1)
    stored = SimpleNamespace(token="Bearer DB", expiration=expiration.replace(tzinfo=None))
    reads = []
    monkeypatch.setattr(tastytrade.crud, "get_session_token", lambda db: reads.append(db) or stored)

    assert tastytrade.get_active_token("db") == "Bearer DB"
    assert tastytrade.get_active_token("db") == "Bearer DB"
    assert reads == ["db"]

    tastytrade.reset_caches()
    stored.expiration = (datetime.now(UTC) - timedelta(seconds=1)).replace(tzinfo=None)
    saved = []
    monkeypatch.setattr(tastytrade, "login_to_tastytrade", lambda: ("Bearer NEW", expiration))
    monkeypatch.setattr(tastytrade.crud, "save_session_token", lambda db, token, exp: saved.append(token))
    assert tastytrade.get_active_token("db") == "Bearer NEW"
    assert saved == ["Bearer NEW"]


def test_only_reads_retry_on_throttling_and_gateway_errors():
    adapter = tastytrade._session().get_adapter("https://api.tastyworks.com")
    retry = adapter.max_retries
    assert retry.allowed_methods == frozenset({"GET"})
    assert set(retry.status_forcelist) == {429, 502, 503, 504}
    assert retry.read == 0
