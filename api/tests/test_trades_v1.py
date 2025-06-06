import pytest


@pytest.mark.asyncio
async def test_trades_grouped(client, monkeypatch):
    """Verify /v1/trades groups positions and skips equity-only accounts."""

    # Mock tastytrade auth and fetch helpers
    def fake_token(db):
        return "FAKE"

    def fake_accounts(token):
        return ["123", "456"]

    def fake_positions(token, acct):
        if acct == "123":
            return [
                {"instrument-type": "Equity", "underlying-symbol": "MSFT"},
                {
                    "instrument-type": "Option",
                    "underlying-symbol": "SPY",
                    "expires-at": "2024-01-19",
                    "cost-effect": "Credit",
                    "average-open-price": "2.5",
                    "close-price": "0.5",
                    "average-daily-market-close-price": "0.75",
                    "quantity": "1",
                },
                {
                    "instrument-type": "Option",
                    "underlying-symbol": "SPY",
                    "expires-at": "2024-01-19",
                    "cost-effect": "Credit",
                    "average-open-price": "1.0",
                    "close-price": "0.2",
                    "average-daily-market-close-price": "0.30",
                    "quantity": "2",
                },
            ]
        else:
            return [
                {"instrument-type": "Equity", "underlying-symbol": "AAPL"}
            ]

    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.get_active_token", fake_token
    )
    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.fetch_account_numbers", fake_accounts
    )
    monkeypatch.setattr(
        "app.routers.v1.trades.tastytrade.fetch_positions", fake_positions
    )

    resp = await client.get("/v1/trades")
    assert resp.status_code == 200
    data = resp.json()

    assert data == {
        "accounts": [
            {
                "account_number": "123",
                "groups": [
                    {
                        "underlying_symbol": "SPY",
                        "expires_at": "2024-01-19",
                        "total_credit_received": -3.5,
                        "current_group_price": -0.7,
                        "group_approximate_p_l": -2.8,
                        "percent-credit-received": 80,
                        "positions": [
                            {
                                "instrument-type": "Option",
                                "underlying-symbol": "SPY",
                                "expires-at": "2024-01-19",
                                "cost-effect": "Credit",
                                "average-open-price": "2.5",
                                "close-price": "0.5",
                                "average-daily-market-close-price": "0.75",
                                "quantity": "1",
                                "approximate-p-l": 1.75,
                            },
                            {
                                "instrument-type": "Option",
                                "underlying-symbol": "SPY",
                                "expires-at": "2024-01-19",
                                "cost-effect": "Credit",
                                "average-open-price": "1.0",
                                "close-price": "0.2",
                                "average-daily-market-close-price": "0.30",
                                "quantity": "2",
                                "approximate-p-l": 1.4,
                            },
                        ],
                    }
                ],
            }
        ]
    }
