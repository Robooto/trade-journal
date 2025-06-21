import pytest


@pytest.mark.asyncio
async def test_trades_grouped(client, monkeypatch):
    """Verify /v1/trades groups positions and skips equity-only accounts."""

    # Mock tastytrade auth and fetch helpers
    def fake_token(db):
        return "FAKE"

    def fake_accounts(token):
        return [
            {"account_number": "123", "nickname": "Main"},
            {"account_number": "456", "nickname": "Other"},
        ]

    def fake_positions(token, acct):
        if acct == "123":
            return [
                {"instrument-type": "Equity", "underlying-symbol": "MSFT"},
                {
                    "instrument-type": "Equity Option",
                    "symbol": "SPY_C",
                    "underlying-symbol": "SPY",
                    "expires-at": "2024-01-19",
                    "cost-effect": "Credit",
                    "average-open-price": "2.5",
                    "close-price": "0.5",
                    "average-daily-market-close-price": "0.75",
                    "quantity": "1",
                    "quantity-direction": "Short",
                    "multiplier": "100",
                },
                {
                    "instrument-type": "Equity Option",
                    "symbol": "SPY_C",
                    "underlying-symbol": "SPY",
                    "expires-at": "2024-01-19",
                    "cost-effect": "Credit",
                    "average-open-price": "1.0",
                    "close-price": "0.2",
                    "average-daily-market-close-price": "0.30",
                    "quantity": "2",
                    "quantity-direction": "Short",
                    "multiplier": "100",
                },
            ]
        else:
            return [
                {"instrument-type": "Equity", "underlying-symbol": "AAPL"}
            ]

    def fake_vol(token, symbols):
        assert symbols == ["SPY"]
        return [{"symbol": "SPY", "implied-volatility-index-rank": "0.191"}]

    def fake_market(token, eq, eq_opt, future, future_opt):
        assert eq_opt == ["SPY_C"]
        assert future_opt == []
        return [{"symbol": "SPY_C", "mark": "10", "close": "9", "delta": "0.5"}]

    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.get_active_token", fake_token
    )
    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.fetch_accounts", fake_accounts
    )
    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.fetch_positions", fake_positions
    )
    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.fetch_volatility_data", fake_vol
    )
    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.fetch_market_data", fake_market
    )

    resp = await client.get("/v1/trades")
    assert resp.status_code == 200
    data = resp.json()

    assert data == {
        "accounts": [
            {
                "account_number": "123",
                "nickname": "Main",
                "groups": [
                    {
                        "underlying_symbol": "SPY",
                        "expires_at": "2024-01-19",
                        "total_credit_received": -3.5,
                        "current_group_price": -0.7,
                        "group_approximate_p_l": -2.8,
                        "percent_credit_received": 80,
                        "total_delta": -1.0,
                        "iv_rank": 19.1,
                        "positions": [
                            {
                                "instrument-type": "Equity Option",
                                "symbol": "SPY_C",
                                "underlying-symbol": "SPY",
                                "expires-at": "2024-01-19",
                                "cost-effect": "Credit",
                                "average-open-price": "2.5",
                                "close-price": "0.5",
                                "average-daily-market-close-price": "0.75",
                                "quantity": "1",
                                "quantity-direction": "Short",
                                "multiplier": "100",
                                "approximate-p-l": -750.0,
                                "market_data": {
                                    "symbol": "SPY_C",
                                    "mark": "10",
                                    "close": "9",
                                    "delta": "0.5",
                                    "computed_delta": -0.5,
                                },
                            },
                            {
                                "instrument-type": "Equity Option",
                                "symbol": "SPY_C",
                                "underlying-symbol": "SPY",
                                "expires-at": "2024-01-19",
                                "cost-effect": "Credit",
                                "average-open-price": "1.0",
                                "close-price": "0.2",
                                "average-daily-market-close-price": "0.30",
                                "quantity": "2",
                                "quantity-direction": "Short",
                                "multiplier": "100",
                                "approximate-p-l": -1800.0,
                                "market_data": {
                                    "symbol": "SPY_C",
                                    "mark": "10",
                                    "close": "9",
                                    "delta": "0.5",
                                    "computed_delta": -0.5,
                                },
                            },
                        ],
                    }
                ],
            }
        ]
    }


@pytest.mark.asyncio
async def test_market_data(client, monkeypatch):
    """Verify /v1/trades/market-data returns data from tastytrade helper."""

    def fake_token(db):
        return "FAKE"

    def fake_market(token, equity, equity_option, future, future_option):
        assert future == ["/ESU5"]
        return [{"symbol": "/ESU5", "mark": "100", "close": "90"}]

    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.get_active_token", fake_token
    )
    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.fetch_market_data", fake_market
    )

    resp = await client.post(
        "/v1/trades/market-data",
        json={
            "equity": [],
            "equity_option": [],
            "future": ["/ESU5"],
            "future_option": []
        }
    )
    assert resp.status_code == 200
    assert resp.json() == [{"symbol": "/ESU5", "mark": "100", "close": "90"}]


@pytest.mark.asyncio
async def test_volatility_future_dedup(client, monkeypatch):
    """Verify futures symbols are normalized and deduplicated when fetching IV rank."""

    def fake_token(db):
        return "FAKE"

    def fake_accounts(token):
        return [{"account_number": "789", "nickname": "Fut"}]

    def fake_positions(token, acct):
        # Two different contracts for the same underlying
        return [
            {
                "instrument-type": "Future Option",
                "symbol": "/ESU5O",
                "underlying-symbol": "/ESU5",
                "expires-at": "2025-06-20",
                "cost-effect": "Credit",
                "average-open-price": "1.0",
                "close-price": "0.5",
                "average-daily-market-close-price": "0.75",
                "quantity": "1",
            },
            {
                "instrument-type": "Future Option",
                "symbol": "/ESZ5O",
                "underlying-symbol": "/ESZ5",
                "expires-at": "2025-12-20",
                "cost-effect": "Credit",
                "average-open-price": "2.0",
                "close-price": "1.0",
                "average-daily-market-close-price": "1.5",
                "quantity": "1",
            },
        ]

    def fake_vol(token, symbols):
        # Should be deduplicated to just the root symbol
        assert symbols == ["/ES"]
        return [{"symbol": "/ES", "implied-volatility-index-rank": "0.25"}]

    def fake_market(token, eq, eq_opt, future, future_opt):
        assert future_opt == ["/ESU5O", "/ESZ5O"]
        return []

    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.get_active_token", fake_token
    )
    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.fetch_accounts", fake_accounts
    )
    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.fetch_positions", fake_positions
    )
    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.fetch_volatility_data", fake_vol
    )
    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.fetch_market_data", fake_market
    )

    resp = await client.get("/v1/trades")
    assert resp.status_code == 200
    data = resp.json()["accounts"][0]["groups"]
    assert len(data) == 2
    assert all(g["iv_rank"] == 25.0 for g in data)


@pytest.mark.asyncio
async def test_approximate_pl_long(client, monkeypatch):
    """Verify approximate P/L calculation for long positions."""

    def fake_token(db):
        return "FAKE"

    def fake_accounts(token):
        return [{"account_number": "111", "nickname": "Long"}]

    def fake_positions(token, acct):
        return [
            {
                "instrument-type": "Equity Option",
                "symbol": "SPY_C",
                "underlying-symbol": "SPY",
                "expires-at": "2024-01-19",
                "cost-effect": "Debit",
                "average-open-price": "2",
                "close-price": "1",
                "average-daily-market-close-price": "1.5",
                "quantity": "1",
                "quantity-direction": "Long",
                "multiplier": "100",
            }
        ]

    def fake_vol(token, symbols):
        assert symbols == ["SPY"]
        return [{"symbol": "SPY", "implied-volatility-index-rank": "0.2"}]

    def fake_market(token, eq, eq_opt, future, future_opt):
        assert eq_opt == ["SPY_C"]
        return [{"symbol": "SPY_C", "mark": "10", "close": "9"}]

    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.get_active_token", fake_token
    )
    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.fetch_accounts", fake_accounts
    )
    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.fetch_positions", fake_positions
    )
    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.fetch_volatility_data", fake_vol
    )
    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.fetch_market_data", fake_market
    )

    resp = await client.get("/v1/trades")
    assert resp.status_code == 200
    pos = resp.json()["accounts"][0]["groups"][0]["positions"][0]
    assert pos["approximate-p-l"] == 800.0
