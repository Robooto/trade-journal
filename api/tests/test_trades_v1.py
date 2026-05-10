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
        return [{
            "symbol": "SPY",
            "implied-volatility-index-rank": "0.191",
            "implied-volatility-index-5-day-change": "0.0123",
        }]

    def fake_market(token, eq, eq_opt, future, future_opt):
        assert eq == ["SPY"]
        assert eq_opt == ["SPY_C"]
        assert future == []
        assert future_opt == []
        return [
            {
                "symbol": "SPY_C",
                "mark": "10",
                "close": "9",
                "delta": "0.5",
                "theta": "-0.12",
                "vega": "0.08",
                "gamma": "0.01",
                "rho": "0.02",
            },
            {"symbol": "SPY", "beta": "1.2"},
        ]

    def fake_balance(token, acct):
        return {
            "used-derivative-buying-power": "500",
            "derivative-buying-power": "1000",
            "equity-buying-power": "500",
            "margin-equity": "1500",
        }

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
    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.fetch_account_balance", fake_balance
    )

    resp = await client.get("/v1/trades")
    assert resp.status_code == 200
    data = resp.json()

    assert data == {
        "accounts": [
            {
                "account_number": "123",
                "nickname": "Main",
                "total_beta_delta": -1.2,
                "total_position_delta": -15000,
                "total_theta": 3600,
                "total_vega": -2400,
                "total_gamma": -300,
                "total_rho": -600,
                "percent_used_bp": 33,
                "groups": [
                    {
                        "underlying_symbol": "SPY",
                        "expires_at": "2024-01-19",
                        "total_credit_received": 450.0,
                        "current_group_p_l": -2550.0,
                        "percent_credit_received": -566,
                        "total_delta": -1.0,
                        "total_position_delta": -15000,
                        "total_theta": 3600,
                        "total_vega": -2400,
                        "total_gamma": -300,
                        "total_rho": -600,
                        "beta_delta": -1.2,
                        "iv_rank": 19.1,
                        "iv_5d_change": 1.23,
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
                                "beta": 1.2,
                                "market_data": {
                                    "symbol": "SPY_C",
                                    "mark": "10",
                                    "close": "9",
                                    "delta": "0.5",
                                    "theta": "-0.12",
                                    "vega": "0.08",
                                    "gamma": "0.01",
                                    "rho": "0.02",
                                    "computed_delta": -0.5,
                                    "computed_position_delta": -50.0,
                                    "computed_position_theta": 12.0,
                                    "computed_position_vega": -8.0,
                                    "computed_position_gamma": -1.0,
                                    "computed_position_rho": -2.0,
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
                                "beta": 1.2,
                                "market_data": {
                                    "symbol": "SPY_C",
                                    "mark": "10",
                                    "close": "9",
                                    "delta": "0.5",
                                    "theta": "-0.12",
                                    "vega": "0.08",
                                    "gamma": "0.01",
                                    "rho": "0.02",
                                    "computed_delta": -0.5,
                                    "computed_position_delta": -100.0,
                                    "computed_position_theta": 24.0,
                                    "computed_position_vega": -16.0,
                                    "computed_position_gamma": -2.0,
                                    "computed_position_rho": -4.0,
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
        return [{
            "symbol": "/ES",
            "implied-volatility-index-rank": "0.25",
            "implied-volatility-index-5-day-change": "-0.034",
        }]

    def fake_market(token, eq, eq_opt, future, future_opt):
        assert eq == []
        assert eq_opt == []
        assert future == ["/ESU5", "/ESZ5"]
        assert future_opt == ["/ESU5O", "/ESZ5O"]
        return [
            {"symbol": "/ESU5", "beta": "1.0"},
            {"symbol": "/ESZ5", "beta": "1.1"},
        ]

    def fake_balance(token, acct):
        return {
            "used-derivative-buying-power": "100",
            "derivative-buying-power": "200",
            "equity-buying-power": "100",
        }

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
    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.fetch_account_balance", fake_balance
    )

    resp = await client.get("/v1/trades")
    assert resp.status_code == 200
    data = resp.json()["accounts"][0]["groups"]
    assert len(data) == 2
    assert all(g["iv_rank"] == 25.0 for g in data)
    assert all(g["iv_5d_change"] == -3.4 for g in data)


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
        return [{
            "symbol": "SPY",
            "implied-volatility-index-rank": "0.2",
            "implied-volatility-index-5-day-change": "0.005",
        }]

    def fake_market(token, eq, eq_opt, future, future_opt):
        assert eq == ["SPY"]
        assert eq_opt == ["SPY_C"]
        assert future == []
        assert future_opt == []
        return [
            {"symbol": "SPY_C", "mark": "10", "close": "9"},
            {"symbol": "SPY", "beta": "1"},
        ]

    def fake_balance(token, acct):
        return {
            "used-derivative-buying-power": "50",
            "derivative-buying-power": "100",
            "equity-buying-power": "50",
        }

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
    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.fetch_account_balance", fake_balance
    )

    resp = await client.get("/v1/trades")
    assert resp.status_code == 200
    pos = resp.json()["accounts"][0]["groups"][0]["positions"][0]
    assert pos["approximate-p-l"] == 800.0


@pytest.mark.asyncio
async def test_percent_credit_received_debit_spread(client, monkeypatch):
    """Percent calculation should handle debit spreads correctly."""

    def fake_token(db):
        return "FAKE"

    def fake_accounts(token):
        return [{"account_number": "333", "nickname": "Debit"}]

    def fake_positions(token, acct):
        return [
            {
                "instrument-type": "Equity Option",
                "symbol": "SPY_C1",
                "underlying-symbol": "SPY",
                "expires-at": "2024-01-19",
                "cost-effect": "Debit",
                "average-open-price": "2.0",
                "close-price": "2.0",
                "average-daily-market-close-price": "2.0",
                "quantity": "1",
                "quantity-direction": "Long",
                "multiplier": "100",
            },
            {
                "instrument-type": "Equity Option",
                "symbol": "SPY_C2",
                "underlying-symbol": "SPY",
                "expires-at": "2024-01-19",
                "cost-effect": "Credit",
                "average-open-price": "1.0",
                "close-price": "1.0",
                "average-daily-market-close-price": "1.0",
                "quantity": "1",
                "quantity-direction": "Short",
                "multiplier": "100",
            },
        ]

    def fake_vol(token, symbols):
        return []

    def fake_market(token, eq, eq_opt, future, future_opt):
        assert eq == ["SPY"]
        assert sorted(eq_opt) == ["SPY_C1", "SPY_C2"]
        assert future == []
        assert future_opt == []
        return [
            {"symbol": "SPY_C1", "mark": "2.5", "delta": "0.5"},
            {"symbol": "SPY_C2", "mark": "0.75", "delta": "0.3"},
            {"symbol": "SPY", "beta": "1"},
        ]

    def fake_balance(token, acct):
        return {
            "used-derivative-buying-power": "0",
            "derivative-buying-power": "0",
            "equity-buying-power": "0",
            "margin-equity": "1",
        }

    monkeypatch.setattr("app.routers.v1.trades.tastytrade.get_active_token", fake_token)
    monkeypatch.setattr("app.routers.v1.trades.tastytrade.fetch_accounts", fake_accounts)
    monkeypatch.setattr("app.routers.v1.trades.tastytrade.fetch_positions", fake_positions)
    monkeypatch.setattr("app.routers.v1.trades.tastytrade.fetch_volatility_data", fake_vol)
    monkeypatch.setattr("app.routers.v1.trades.tastytrade.fetch_market_data", fake_market)
    monkeypatch.setattr("app.routers.v1.trades.tastytrade.fetch_account_balance", fake_balance)

    resp = await client.get("/v1/trades")
    assert resp.status_code == 200
    group = resp.json()["accounts"][0]["groups"][0]
    assert group["total_credit_received"] == -100.0
    assert group["current_group_p_l"] == 75.0
    assert group["percent_credit_received"] == 75


@pytest.mark.asyncio
async def test_total_beta_delta(client, monkeypatch):
    """Verify total_beta_delta calculation per account."""

    def fake_token(db):
        return "FAKE"

    def fake_accounts(token):
        return [{"account_number": "222", "nickname": "Beta"}]

    def fake_positions(token, acct):
        return [
            {
                "instrument-type": "Equity Option",
                "symbol": "SPY_C",
                "underlying-symbol": "SPY",
                "expires-at": "2024-01-19",
                "cost-effect": "Credit",
                "average-open-price": "1.0",
                "close-price": "0.5",
                "average-daily-market-close-price": "0.75",
                "quantity": "1",
                "quantity-direction": "Short",
                "multiplier": "100",
            },
            {
                "instrument-type": "Future Option",
                "symbol": "/ESZ4O",
                "underlying-symbol": "/ESZ4",
                "expires-at": "2024-12-20",
                "cost-effect": "Credit",
                "average-open-price": "2.0",
                "close-price": "1.0",
                "average-daily-market-close-price": "1.5",
                "quantity": "1",
                "quantity-direction": "Long",
                "multiplier": "50",
            },
        ]

    def fake_vol(token, symbols):
        return []

    def fake_market(token, eq, eq_opt, future, future_opt):
        assert eq == ["SPY"]
        assert eq_opt == ["SPY_C"]
        assert future == ["/ESZ4"]
        assert future_opt == ["/ESZ4O"]
        return [
            {"symbol": "SPY_C", "mark": "10", "close": "9", "delta": "0.5"},
            {"symbol": "/ESZ4O", "mark": "10", "close": "9", "delta": "0.1"},
            {"symbol": "SPY", "beta": "1"},
            {"symbol": "/ESZ4", "beta": "2"},
        ]

    def fake_balance(token, acct):
        return {
            "used-derivative-buying-power": "200",
            "derivative-buying-power": "400",
            "equity-buying-power": "200",
        }

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
    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.fetch_account_balance", fake_balance
    )

    resp = await client.get("/v1/trades")
    assert resp.status_code == 200
    acct = resp.json()["accounts"][0]
    groups = acct["groups"]
    assert groups[0]["beta_delta"] == -0.5
    assert groups[1]["beta_delta"] == 0.2
    total = round(sum(g["beta_delta"] for g in groups if g["beta_delta"] is not None), 2)
    assert acct["total_beta_delta"] == total


@pytest.mark.asyncio
async def test_total_position_greeks(client, monkeypatch):
    """Verify quantity-scaled account and group Greek totals."""

    def fake_token(db):
        return "FAKE"

    def fake_accounts(token):
        return [{"account_number": "444", "nickname": "Greeks"}]

    def fake_positions(token, acct):
        return [
            {
                "instrument-type": "Equity Option",
                "symbol": "SPY_C",
                "underlying-symbol": "SPY",
                "expires-at": "2024-01-19",
                "average-open-price": "1.0",
                "quantity": "2",
                "quantity-direction": "Long",
                "multiplier": "100",
            },
            {
                "instrument-type": "Equity Option",
                "symbol": "SPY_P",
                "underlying-symbol": "SPY",
                "expires-at": "2024-01-19",
                "average-open-price": "1.0",
                "quantity": "1",
                "quantity-direction": "Short",
                "multiplier": "100",
            },
        ]

    def fake_vol(token, symbols):
        return []

    def fake_market(token, eq, eq_opt, future, future_opt):
        return [
            {
                "symbol": "SPY_C",
                "mark": "1.2",
                "delta": "0.45",
                "theta": "-0.10",
                "vega": "0.20",
                "gamma": "0.01",
                "rho": "0.03",
            },
            {
                "symbol": "SPY_P",
                "mark": "0.8",
                "delta": "-0.30",
                "theta": "-0.05",
                "vega": "0.15",
                "gamma": "0.02",
                "rho": "-0.01",
            },
            {"symbol": "SPY", "beta": "1"},
        ]

    def fake_balance(token, acct):
        return {"used-derivative-buying-power": "0", "margin-equity": "1"}

    monkeypatch.setattr("app.routers.v1.trades.tastytrade.get_active_token", fake_token)
    monkeypatch.setattr("app.routers.v1.trades.tastytrade.fetch_accounts", fake_accounts)
    monkeypatch.setattr("app.routers.v1.trades.tastytrade.fetch_positions", fake_positions)
    monkeypatch.setattr("app.routers.v1.trades.tastytrade.fetch_volatility_data", fake_vol)
    monkeypatch.setattr("app.routers.v1.trades.tastytrade.fetch_market_data", fake_market)
    monkeypatch.setattr("app.routers.v1.trades.tastytrade.fetch_account_balance", fake_balance)

    resp = await client.get("/v1/trades")
    assert resp.status_code == 200
    acct = resp.json()["accounts"][0]
    group = acct["groups"][0]

    assert group["total_position_delta"] == 12000
    assert group["total_theta"] == -1500
    assert group["total_vega"] == 2500
    assert group["total_gamma"] == 0
    assert group["total_rho"] == 700
    assert acct["total_theta"] == group["total_theta"]
    assert acct["total_vega"] == group["total_vega"]


@pytest.mark.asyncio
async def test_percent_used_bp(client, monkeypatch):
    """Verify percent_used_bp is calculated from account balance."""

    def fake_token(db):
        return "FAKE"

    def fake_accounts(token):
        return [{"account_number": "999", "nickname": "BP"}]

    def fake_positions(token, acct):
        return [
            {
                "instrument-type": "Equity Option",
                "symbol": "SPY_C",
                "underlying-symbol": "SPY",
                "expires-at": "2024-01-19",
                "cost-effect": "Credit",
                "average-open-price": "1.0",
                "close-price": "0.5",
                "average-daily-market-close-price": "0.75",
                "quantity": "1",
                "quantity-direction": "Short",
                "multiplier": "100",
            }
        ]

    def fake_vol(token, symbols):
        return []

    def fake_market(token, eq, eq_opt, future, future_opt):
        assert eq == ["SPY"]
        assert eq_opt == ["SPY_C"]
        assert future == []
        assert future_opt == []
        return [
            {"symbol": "SPY_C", "mark": "10", "close": "9"},
            {"symbol": "SPY", "beta": "1"},
        ]

    def fake_balance(token, acct):
        return {
            "used-derivative-buying-power": "300",
            "derivative-buying-power": "900",
            "equity-buying-power": "0",
            "margin-equity": "900",
        }

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
    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.fetch_account_balance", fake_balance
    )

    resp = await client.get("/v1/trades")
    assert resp.status_code == 200
    acct = resp.json()["accounts"][0]
    assert acct["percent_used_bp"] == 33
