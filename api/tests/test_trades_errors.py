import pytest
from fastapi import HTTPException

from app.routers.v1 import trades
from app.services import trades_service
from app.services.trades_errors import TastytradeAuthError, TastytradeFetchError


def test_acquire_token_raises_domain_exception(monkeypatch):
    def fail(db):
        raise RuntimeError("bad auth")

    monkeypatch.setattr(trades_service.tastytrade, "get_active_token", fail)

    with pytest.raises(TastytradeAuthError, match="Authentication to Tastytrade failed"):
        trades_service.acquire_token(db=None)


def test_fetch_accounts_raises_domain_exception(monkeypatch):
    def fail(token):
        raise RuntimeError("bad accounts")

    monkeypatch.setattr(trades_service.tastytrade, "fetch_accounts", fail)

    with pytest.raises(TastytradeFetchError, match="Failed to fetch accounts"):
        trades_service.fetch_accounts("FAKE")


def test_router_translates_trade_service_exception(monkeypatch):
    def fail(db):
        raise TastytradeFetchError("Failed to fetch accounts: bad accounts")

    monkeypatch.setattr(trades, "acquire_token", lambda db: "FAKE")
    monkeypatch.setattr(trades, "fetch_accounts", fail)

    with pytest.raises(HTTPException) as exc_info:
        trades._load_positions_data(db=None)

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == "Failed to fetch accounts: bad accounts"


def test_router_auth_helper_returns_403(monkeypatch):
    def fail(db):
        raise RuntimeError("bad auth")

    monkeypatch.setattr(trades.tastytrade, "get_active_token", fail)

    with pytest.raises(HTTPException) as exc_info:
        trades._get_tastytrade_token_or_403(db=None)

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Authentication to Tastytrade failed: bad auth"


def test_router_market_data_helper_returns_500(monkeypatch):
    def fail(*args):
        raise RuntimeError("bad market data")

    monkeypatch.setattr(trades.tastytrade, "fetch_market_data", fail)

    with pytest.raises(HTTPException) as exc_info:
        trades._fetch_market_data_or_500("FAKE", [], [], [], [])

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == "Failed to fetch market data: bad market data"


def test_router_volatility_helper_returns_500(monkeypatch):
    def fail(*args):
        raise RuntimeError("bad volatility")

    monkeypatch.setattr(trades.tastytrade, "fetch_volatility_data", fail)

    with pytest.raises(HTTPException) as exc_info:
        trades._fetch_volatility_data_or_500("FAKE", ["SPY"])

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == "Failed to fetch volatility data: bad volatility"
