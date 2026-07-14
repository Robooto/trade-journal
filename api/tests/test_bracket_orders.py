from types import SimpleNamespace

import pytest


REQUEST = {
    "account-number": "5WT00000",
    "symbol": "SPY  260717P00500000",
    "instrument-type": "Equity Option",
    "quantity": 1,
    "multiplier": 100,
    "quantity-direction": "Short",
    "cost-effect": "Credit",
    "entry-price": 2.0,
    "take-profit-percent": 50,
    "stop-loss-percent": 150,
}


@pytest.mark.asyncio
async def test_bracket_order_defaults_to_preview(client, monkeypatch):
    def fail_if_called(*args, **kwargs):
        raise AssertionError("A preview must not fetch credentials or place an order")

    monkeypatch.setattr("app.routers.v1.trades._get_tastytrade_token_or_403", fail_if_called)
    monkeypatch.setattr("app.routers.v1.trades._place_complex_order_or_500", fail_if_called)

    response = await client.post("/v1/trades/bracket-orders", json=REQUEST)

    assert response.status_code == 200
    assert response.json()["dry-run"] is True
    assert response.json()["take-profit-price"] == 1.0
    assert response.json()["stop-loss-price"] == 5.0


@pytest.mark.asyncio
async def test_live_bracket_order_requires_server_enable(client, monkeypatch):
    monkeypatch.setattr(
        "app.routers.v1.trades.settings",
        SimpleNamespace(live_trading_enabled=False),
    )
    response = await client.post(
        "/v1/trades/bracket-orders",
        json={**REQUEST, "dry-run": False, "confirmed": True},
    )

    assert response.status_code == 503
    assert "disabled" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_live_bracket_order_requires_explicit_confirmation(client, monkeypatch):
    monkeypatch.setattr(
        "app.routers.v1.trades.settings",
        SimpleNamespace(live_trading_enabled=True),
    )
    response = await client.post(
        "/v1/trades/bracket-orders",
        json={**REQUEST, "dry-run": False, "confirmed": False},
    )

    assert response.status_code == 400
    assert "confirmed" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_confirmed_live_bracket_order_submits(client, monkeypatch):
    monkeypatch.setattr(
        "app.routers.v1.trades.settings",
        SimpleNamespace(live_trading_enabled=True),
    )
    monkeypatch.setattr("app.routers.v1.trades._get_tastytrade_token_or_403", lambda db: "TOKEN")

    placed = {}

    def fake_place(token, account_number, payload):
        placed.update(token=token, account_number=account_number, payload=payload)
        return {"status": "accepted"}

    monkeypatch.setattr("app.routers.v1.trades._place_complex_order_or_500", fake_place)
    response = await client.post(
        "/v1/trades/bracket-orders",
        json={**REQUEST, "dry-run": False, "confirmed": True},
    )

    assert response.status_code == 200
    assert response.json()["dry-run"] is False
    assert response.json()["tasty-response"] == {"status": "accepted"}
    assert placed["account_number"] == REQUEST["account-number"]
    assert placed["payload"]["type"] == "OCO"