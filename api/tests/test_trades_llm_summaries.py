from datetime import date, timedelta

from app.schemas.trades import (
    LlmPositionsSummaryResponse,
    MarketDataSummaryResponse,
    VolatilityDataSummaryResponse,
)
from app.services.trades_service import (
    augment_positions_with_market_data,
    build_llm_positions_summary,
    build_market_data_summary,
    build_volatility_data_summary,
    group_positions_and_compute_totals,
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


def test_positions_summary_exposes_management_ready_risk_fields():
    expiration = (date.today() + timedelta(days=10)).isoformat()
    summary = build_llm_positions_summary(
        [
            {
                "account_number": "123",
                "nickname": "Main",
                "total_position_delta": 60,
                "total_beta_delta": 0.65,
                "total_beta_delta_raw": 0.65,
                "total_beta_delta_shares": 129.89,
                "total_theta": 10,
                "total_vega": -23,
                "total_gamma": -1,
                "groups": [
                    {
                        "underlying_symbol": "HOOD",
                        "expires_at": expiration,
                        "total_credit_received": 587.0,
                        "total_credit_points": 5.87,
                        "total_credit_dollars": 587.0,
                        "net_open_credit_or_debit_dollars": 587.0,
                        "current_value_dollars": 275.5,
                        "unrealized_pl_dollars": 311.5,
                        "days_to_nearest_expiration": 10,
                        "assignment_exposure_dollars": 7000.0,
                        "current_group_p_l": 311.5,
                        "percent_credit_received": 53,
                        "percent_credit_captured": 53.1,
                        "total_position_delta": 60,
                        "total_theta": 10,
                        "total_vega": -23,
                        "total_gamma": -1,
                        "beta_delta": 0.65,
                        "beta_delta_raw": 0.65,
                        "beta_delta_shares": 129.89,
                        "positions": [
                            {
                                "symbol": "HOOD_P",
                                "instrument-type": "Equity Option",
                                "underlying-symbol": "HOOD",
                                "expires-at": expiration,
                                "average-open-price": "5.87",
                                "quantity": "1",
                                "quantity-direction": "Short",
                                "multiplier": "100",
                                "strike": 70,
                                "option-type": "P",
                                "beta": 2.1649,
                                "market_data": {
                                    "mark": "2.755",
                                    "computed_position_delta": "60",
                                    "computed_position_theta": "10",
                                    "computed_position_vega": "-23",
                                    "computed_position_gamma": "-1",
                                },
                            }
                        ],
                    }
                ],
            }
        ]
    )

    parsed = LlmPositionsSummaryResponse.model_validate(summary)
    account = parsed.accounts[0]
    strategy_group = account.strategy_groups[0]
    group = account.groups[0]
    leg = group.positions[0]

    assert parsed.portfolio.unrealized_pl_dollars == 311.5
    assert parsed.portfolio.assignment_exposure_dollars == 7000.0
    assert account.total_beta_delta_shares == 129.89
    assert group.total_credit_points == 5.87
    assert group.total_credit_dollars == 587.0
    assert group.percent_credit_captured == 53.1
    assert group.beta_delta_raw == 0.65
    assert group.beta_delta_shares == 129.89
    assert group.delta_shares == 60
    assert group.theta_dollars_per_day == 10
    assert group.vega_dollars_per_vol_point == -23
    assert "near_50_percent_profit" in group.management_flags
    assert "assignment_exposure" in group.management_flags
    assert leg.open_value_dollars == 587.0
    assert leg.current_value_dollars == 275.5
    assert leg.unrealized_pl_dollars == 311.5
    assert leg.days_to_expiration == 10
    assert leg.assignment_exposure_dollars == 7000.0
    assert strategy_group.underlying_symbol == "HOOD"
    assert strategy_group.unrealized_pl_dollars == 311.5
    assert strategy_group.days_to_nearest_expiration == 10


def test_group_totals_compute_real_pl_credit_capture_and_normalized_greeks():
    positions_by_account = [
        {
            "account_number": "123",
            "nickname": "Main",
            "positions": [
                {
                    "instrument-type": "Equity Option",
                    "symbol": "HOOD_P",
                    "underlying-symbol": "HOOD",
                    "expires-at": (date.today() + timedelta(days=10)).isoformat(),
                    "average-open-price": "5.87",
                    "quantity": "1",
                    "quantity-direction": "Short",
                    "multiplier": None,
                    "strike": 70,
                    "option-type": "P",
                }
            ],
        }
    ]
    market_map = {
        "HOOD_P": {
            "mark": "2.755",
            "delta": "-0.6",
            "theta": "-0.1",
            "vega": "-0.23",
            "gamma": "-0.01",
        }
    }
    beta_map = {"HOOD": 2.1649}

    augment_positions_with_market_data(positions_by_account, market_map, beta_map)
    account = group_positions_and_compute_totals(positions_by_account, beta_map)[0]
    group = account["groups"][0]
    position = group["positions"][0]

    assert position["unrealized-pl-dollars"] == 311.5
    assert position["open-value-dollars"] == 587.0
    assert position["current-value-dollars"] == 275.5
    assert group["total_credit_points"] == 5.87
    assert group["total_credit_dollars"] == 587.0
    assert group["unrealized_pl_dollars"] == 311.5
    assert group["percent_credit_captured"] == 53.1
    assert group["assignment_exposure_dollars"] == 7000.0
    assert group["delta_shares"] == 60.0
    assert group["beta_delta_shares"] == 129.89
    assert group["theta_dollars_per_day"] == 10.0
    assert group["vega_dollars_per_vol_point"] == 23.0
    assert account["total_beta_delta_shares"] == 129.89
