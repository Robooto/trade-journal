from app.schemas.trades import (
    LlmPositionsSummaryResponse,
    MarketDataSummaryResponse,
    VolatilityDataSummaryResponse,
)
from app.services.trades_service import (
    build_llm_positions_summary,
    build_market_data_summary,
    build_volatility_data_summary,
)


def test_market_data_summary_normalizes_numeric_fields():
    summary = build_market_data_summary(
        [
            {
                "symbol": "SPY",
                "mark": "500.25",
                "open": "501.50",
                "close": "499.10",
                "beta": "1.1",
                "delta": "0.51",
                "theta": "-0.04",
                "vega": "0.18",
                "implied-volatility": "0.22",
            }
        ],
        ["SPY", "QQQ"],
    )

    parsed = MarketDataSummaryResponse.model_validate(summary)
    assert parsed.items[0].symbol == "SPY"
    assert parsed.items[0].mark == 500.25
    assert parsed.items[0].open == 501.50
    assert parsed.items[0].theta == -0.04
    assert parsed.items[0].implied_volatility == 0.22
    assert parsed.missing_symbols == ["QQQ"]


def test_market_data_summary_omits_null_fields():
    summary = build_market_data_summary(
        [{"symbol": "/ESM6", "mark": "7420.5", "close": "7419"}],
        ["/ESM6"],
    )

    item = summary["items"][0]
    assert item == {"symbol": "/ESM6", "mark": 7420.5, "close": 7419.0}
    assert "theta" not in item
    assert "implied_volatility" not in item


def test_volatility_summary_returns_percent_values():
    summary = build_volatility_data_summary(
        [
            {
                "symbol": "SPY",
                "implied-volatility-index-rank": "0.191",
                "implied-volatility-index-5-day-change": "-0.0123",
            }
        ],
        ["SPY"],
    )

    parsed = VolatilityDataSummaryResponse.model_validate(summary)
    assert parsed.items[0].iv_rank_percent == 19.1
    assert parsed.items[0].iv_5d_change_percent == -1.23


def test_positions_summary_removes_raw_broker_keys():
    summary = build_llm_positions_summary(
        [
            {
                "account_number": "123",
                "nickname": "Main",
                "percent_used_bp": 8,
                "total_beta_delta": -1.2,
                "total_theta": 59,
                "total_vega": -118,
                "groups": [
                    {
                        "underlying_symbol": "SPY",
                        "expires_at": "2024-01-19T20:15:00.000+00:00",
                        "total_credit_received": 450.0,
                        "current_group_p_l": -255.0,
                        "percent_credit_received": -56,
                        "total_delta": -1.0,
                        "total_position_delta": -100,
                        "beta_delta": -1.2,
                        "total_theta": 59,
                        "total_vega": -118,
                        "total_gamma": 0,
                        "total_rho": 1,
                        "iv_rank": 19.1,
                        "iv_5d_change": 1.23,
                        "positions": [
                            {
                                "symbol": "SPY_C",
                                "instrument-type": "Equity Option",
                                "underlying-symbol": "SPY",
                                "expires-at": "2024-01-19T20:15:00.000+00:00",
                                "average-open-price": "2.5",
                                "quantity": "1",
                                "quantity-direction": "Short",
                                "multiplier": "100",
                                "approximate-p-l": "-25",
                                "strike": 500,
                                "option-type": "C",
                                "market_data": {
                                    "mark": "2.25",
                                    "computed_position_delta": "-50",
                                    "computed_position_theta": "12",
                                    "computed_position_vega": "-8",
                                },
                            }
                        ],
                    }
                ],
            }
        ]
    )

    parsed = LlmPositionsSummaryResponse.model_validate(summary)
    portfolio = parsed.portfolio
    account = parsed.accounts[0]
    group = account.groups[0]
    position = group.positions[0]

    assert portfolio.account_count == 1
    assert portfolio.group_count == 1
    assert portfolio.position_count == 1
    assert portfolio.percent_used_bp == 8
    assert portfolio.theta == 59
    assert portfolio.vega == -118
    assert parsed.units["theta"] == "brokerage display integer"
    assert parsed.units["current_pl"] == "dollars"
    assert account.theta == 59
    assert account.vega == -118
    assert group.expiration_date == "2024-01-19"
    assert group.iv_rank_percent == 19.1
    assert position.instrument_type == "Equity Option"
    assert position.average_open_price == 2.5
    assert position.theta == 12


def test_positions_summary_includes_group_strategy():
    summary = build_llm_positions_summary(
        [
            {
                "account_number": "123",
                "nickname": "Main",
                "groups": [
                    {
                        "underlying_symbol": "SPY",
                        "expires_at": "2026-06-19",
                        "total_credit_received": 1,
                        "current_group_p_l": 0,
                        "positions": [
                            {
                                "option-type": "P",
                                "strike": 700,
                                "expires-at": "2026-06-19",
                                "quantity-direction": "Short",
                            },
                            {
                                "option-type": "C",
                                "strike": 760,
                                "expires-at": "2026-06-19",
                                "quantity-direction": "Short",
                            },
                            {
                                "option-type": "C",
                                "strike": 770,
                                "expires-at": "2026-06-19",
                                "quantity-direction": "Long",
                            },
                        ],
                    }
                ],
            }
        ]
    )

    parsed = LlmPositionsSummaryResponse.model_validate(summary)
    strategy = parsed.accounts[0].groups[0].strategy
    assert strategy is not None
    assert strategy.label == "jade_lizard"
    assert strategy.confidence == "high"


def test_positions_summary_includes_underlying_strategy_across_expirations():
    summary = build_llm_positions_summary(
        [
            {
                "account_number": "123",
                "nickname": "Main",
                "groups": [
                    {
                        "underlying_symbol": "SPY",
                        "expires_at": "2026-06-19",
                        "total_credit_received": 1,
                        "current_group_p_l": 0,
                        "positions": [
                            {
                                "option-type": "P",
                                "strike": 700,
                                "underlying-symbol": "SPY",
                                "expires-at": "2026-06-19",
                                "quantity-direction": "Short",
                            }
                        ],
                    },
                    {
                        "underlying_symbol": "SPY",
                        "expires_at": "2026-07-17",
                        "total_credit_received": 1,
                        "current_group_p_l": 0,
                        "positions": [
                            {
                                "option-type": "P",
                                "strike": 700,
                                "underlying-symbol": "SPY",
                                "expires-at": "2026-07-17",
                                "quantity-direction": "Long",
                            }
                        ],
                    },
                ],
            }
        ]
    )

    parsed = LlmPositionsSummaryResponse.model_validate(summary)
    strategies = parsed.accounts[0].underlying_strategies
    assert len(strategies) == 1
    assert strategies[0].underlying_symbol == "SPY"
    assert strategies[0].label == "calendar"
    assert strategies[0].expiration_dates == ["2026-06-19", "2026-07-17"]
