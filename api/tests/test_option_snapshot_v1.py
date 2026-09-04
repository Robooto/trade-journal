import pytest

from app.routers.v1 import broker
from app.tastytrade_schema import TastyMarketData


@pytest.mark.asyncio
async def test_nested_option_chain_is_versioned(client, monkeypatch):
    monkeypatch.setattr(broker.tastytrade, "get_active_token", lambda db: "Bearer FAKE")
    monkeypatch.setattr(broker.tastytrade, "fetch_nested_option_chain", lambda token, symbol: [
        {"expiration-date": "2026-08-14", "strikes": [{"strike-price": "6400", "call": "CALL", "put": "PUT"}]}
    ])

    response = await client.get("/v1/broker/option-chains/spx/nested")

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema_version"] == "option-chain-metadata.v1"
    assert payload["underlying_symbol"] == "SPX"
    assert payload["expirations"][0]["strikes"][0]["put"] == "PUT"


@pytest.mark.asyncio
async def test_option_quote_snapshot_preserves_missing_contracts(client, monkeypatch):
    monkeypatch.setattr(broker.tastytrade, "get_active_token", lambda db: "Bearer FAKE")
    monkeypatch.setattr(broker.tastytrade, "fetch_market_data", lambda token, equity, equity_option, future, future_option: [
        TastyMarketData(
            symbol="SPXW  260814P06400000", bid="2.10", ask="2.30", mark="2.20",
            delta="-0.15", open_interest="120",
        )
    ])

    response = await client.post("/v1/broker/option-quote-snapshots", json={
        "underlying_symbol": "SPX",
        "option_symbols": ["SPXW  260814P06400000", "MISSING"],
    })

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema_version"] == "option-quote-snapshot.v1"
    assert payload["observations"][0]["bid"] == 2.1
    assert payload["observations"][0]["open_interest"] == 120
    assert payload["observations"][0].get("quoted_at") is None
    assert payload["missing_option_symbols"] == ["MISSING"]
    assert payload["source"]["status"] == "partial"


@pytest.mark.asyncio
@pytest.mark.parametrize("timestamp_key", ["updated-at", "updatedAt"])
async def test_option_quote_preserves_provider_timestamp(client, monkeypatch, timestamp_key):
    monkeypatch.setattr(broker.tastytrade, "get_active_token", lambda db: "Bearer FAKE")
    monkeypatch.setattr(broker.tastytrade, "fetch_market_data", lambda *args, **kwargs: [
        TastyMarketData.model_validate({"symbol": "OPTION", timestamp_key: "2026-09-04T15:00:00Z"})
    ])
    response = await client.post("/v1/broker/option-quote-snapshots", json={
        "underlying_symbol": "SPX", "option_symbols": ["OPTION"],
    })
    assert response.status_code == 200
    assert response.json()["observations"][0]["quoted_at"] == "2026-09-04T15:00:00Z"
