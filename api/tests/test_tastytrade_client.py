from app import tastytrade
from app.settings import settings


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


def test_request_json_uses_base_url_and_timeout(monkeypatch):
    captured = {}

    def fake_request(method, url, **kwargs):
        captured["method"] = method
        captured["url"] = url
        captured["kwargs"] = kwargs
        return FakeResponse({"data": {"items": []}})

    monkeypatch.setattr(tastytrade.requests, "request", fake_request)

    tastytrade._request_json("GET", "/customers/me/accounts", headers={"Accept": "application/json"})

    assert captured["method"] == "GET"
    assert captured["url"] == f"{tastytrade.BASE_URL}/customers/me/accounts"
    assert captured["kwargs"]["timeout"] == tastytrade.REQUEST_TIMEOUT_SECONDS
    assert tastytrade.REQUEST_TIMEOUT_SECONDS == settings.tastytrade_timeout_seconds
    assert captured["kwargs"]["headers"] == {"Accept": "application/json"}


def test_fetch_market_data_uses_shared_request_helper(monkeypatch):
    captured = {}

    def fake_request(method, url, **kwargs):
        captured["method"] = method
        captured["url"] = url
        captured["kwargs"] = kwargs
        return FakeResponse({
            "data": {
                "items": [
                    {
                        "symbol": "SPY",
                        "mark": "500",
                    }
                ]
            }
        })

    monkeypatch.setattr(tastytrade.requests, "request", fake_request)

    items = tastytrade.fetch_market_data("Bearer TOKEN", ["SPY"], [], [], [])

    assert items[0].symbol == "SPY"
    assert captured["method"] == "GET"
    assert captured["url"].endswith("/market-data/by-type")
    assert captured["kwargs"]["timeout"] == tastytrade.REQUEST_TIMEOUT_SECONDS
    assert captured["kwargs"]["headers"]["Authorization"] == "Bearer TOKEN"
    assert captured["kwargs"]["headers"]["User-Agent"] == settings.tastytrade_user_agent
    assert captured["kwargs"]["params"]["equity"] == "SPY"


def test_login_uses_form_content_type_and_timeout(monkeypatch):
    captured = {}

    def fake_request(method, url, **kwargs):
        captured["method"] = method
        captured["url"] = url
        captured["kwargs"] = kwargs
        return FakeResponse({
            "access_token": "ACCESS",
            "token_type": "Bearer",
            "expires_in": "3600",
        })

    monkeypatch.setenv("TASTYTRADE_SECRET", "SECRET")
    monkeypatch.setenv("TASTYTRADE_REFRESH", "REFRESH")
    monkeypatch.setattr(tastytrade.requests, "request", fake_request)

    token, _ = tastytrade.login_to_tastytrade()

    assert token == "Bearer ACCESS"
    assert captured["method"] == "POST"
    assert captured["url"].endswith("/oauth/token")
    assert captured["kwargs"]["timeout"] == tastytrade.REQUEST_TIMEOUT_SECONDS
    assert captured["kwargs"]["headers"]["Content-Type"] == "application/x-www-form-urlencoded"
    assert captured["kwargs"]["data"]["grant_type"] == "refresh_token"
