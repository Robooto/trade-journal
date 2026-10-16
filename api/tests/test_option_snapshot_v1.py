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

@pytest.mark.asyncio
@pytest.mark.parametrize('upstream, expected, hint', [(429, 429, '900'), (401, 403, None), (503, 503, '900')])
async def test_quote_retry_status_preserves_throttling_and_stops_auth(client, monkeypatch, upstream, expected, hint):
    import requests
    monkeypatch.setattr(broker.tastytrade, 'get_active_token', lambda db: 'Bearer FAKE')
    def failure(*args):
        response = requests.Response(); response.status_code = upstream
        response.headers['Retry-After'] = '99999'
        raise requests.HTTPError('private upstream body', response=response)
    monkeypatch.setattr(broker.tastytrade, 'fetch_market_data', failure)
    response = await client.post('/v1/broker/option-quote-snapshots', json={'underlying_symbol':'SPX', 'option_symbols':['OPTION']})
    assert response.status_code == expected
    assert response.headers.get('retry-after') == hint
    assert 'private upstream body' not in response.text


@pytest.mark.asyncio
async def test_model_values_are_opt_in(client, monkeypatch):
    monkeypatch.setattr(broker.tastytrade, "get_active_token", lambda db: "Bearer FAKE")
    monkeypatch.setattr(broker.tastytrade, "fetch_market_data", lambda *args: [
        TastyMarketData.model_validate({"symbol": "OPT", "bid": "1.0", "ask": "1.1", "delta": "-0.2", "rho": "-0.01",
                                        "volatility": "0.21", "theo-price": "1.04"})
    ])
    plain = await client.post("/v1/broker/option-quote-snapshots", json={"underlying_symbol": "SPX", "option_symbols": ["OPT"]})
    observation = plain.json()["observations"][0]
    assert "implied_volatility" not in observation and "theo_price" not in observation and "rho" not in observation

    modeled = await client.post("/v1/broker/option-quote-snapshots", json={
        "underlying_symbol": "SPX", "option_symbols": ["OPT"], "include_model_values": True})
    observation = modeled.json()["observations"][0]
    assert observation["implied_volatility"] == 0.21
    assert observation["theo_price"] == 1.04
    assert observation["rho"] == -0.01
    assert observation["delta"] == -0.2


@pytest.mark.asyncio
async def test_market_metrics_normalizes_expiration_iv_and_caches(client, monkeypatch):
    from app.tastytrade_schema import TastyVolatilityMetric
    broker._MARKET_METRICS_CACHE.clear()
    calls = []
    monkeypatch.setattr(broker.tastytrade, "get_active_token", lambda db: "Bearer FAKE")

    def fetch(token, symbols):
        calls.append(symbols)
        return [TastyVolatilityMetric.model_validate({
            "symbol": "SPX", "implied-volatility-index": "0.1966", "implied-volatility-index-rank": "0.51",
            "implied-volatility-percentile": "0.62", "historical-volatility-30-day": "0.15",
            "iv-hv-30-day-difference": "0.04", "implied-volatility-updated-at": "2026-10-16T20:00:00Z",
            "option-expiration-implied-volatilities": [
                {"expiration-date": "2026-10-19", "settlement-type": "PM", "option-chain-type": "Standard", "implied-volatility": "0.1445"},
                {"expiration-date": "not-a-date", "implied-volatility": "0.3"},
            ]})]
    monkeypatch.setattr(broker.tastytrade, "fetch_volatility_data", fetch)

    first = await client.get("/v1/broker/market-metrics", params={"symbols": "spx, QQQ"})
    assert first.status_code == 200
    payload = first.json()
    assert payload["schema_version"] == "market-metrics.v1"
    metric = payload["metrics"][0]
    assert metric["implied_volatility_index"] == 0.1966 and metric["iv_hv_30_day_difference"] == 0.04
    assert metric["expiration_implied_volatilities"] == [
        {"expiration_date": "2026-10-19", "settlement_type": "PM", "option_chain_type": "Standard", "implied_volatility": 0.1445}]
    assert payload["missing_symbols"] == ["QQQ"] and payload["source"]["status"] == "partial"
    second = await client.get("/v1/broker/market-metrics", params={"symbols": "SPX,QQQ"})
    assert second.json()["cached"] is True and len(calls) == 1
    assert (await client.get("/v1/broker/market-metrics", params={"symbols": ","})).status_code == 422


@pytest.mark.asyncio
async def test_market_metrics_auth_failure_is_403(client, monkeypatch):
    import requests
    broker._MARKET_METRICS_CACHE.clear()
    monkeypatch.setattr(broker.tastytrade, "get_active_token", lambda db: "Bearer FAKE")

    def failure(*args):
        response = requests.Response(); response.status_code = 401
        raise requests.HTTPError("private", response=response)
    monkeypatch.setattr(broker.tastytrade, "fetch_volatility_data", failure)
    response = await client.get("/v1/broker/market-metrics", params={"symbols": "SPX"})
    assert response.status_code == 403
