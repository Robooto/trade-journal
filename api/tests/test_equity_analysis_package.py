from unittest.mock import patch

import pytest

from app.schemas.charts import Bar, ChartResponse
from app.services.equity_analysis_service import (
    build_equity_hub_url,
    find_portfolio_exposure,
    normalize_volatility,
    summarize_bars,
)


def test_build_equity_hub_url_uses_symbol_and_date():
    url = build_equity_hub_url("nvda", "2026-06-08")

    assert url == (
        "https://dashboard.spotgamma.com/equityhub"
        "?sym=NVDA&date=2026-06-08&eh-model=synthoi"
    )


def test_normalize_volatility_scales_percentages_and_term_structure():
    snapshot = normalize_volatility({
        "symbol": "NVDA",
        "implied-volatility-index": "0.42",
        "implied-volatility-index-15-day": "0.39",
        "implied-volatility-index-rank": "0.31",
        "implied-volatility-percentile": "0.67",
        "implied-volatility-index-5-day-change": "-0.025",
        "corr-spy-3month": "1.25",
        "liquidity-rating": 4,
        "option-expiration-implied-volatilities": [
            {
                "expiration-date": "2026-06-19",
                "implied-volatility": "0.45",
                "option-chain-type": "Standard",
            }
        ],
    })

    assert snapshot.current_iv_percent == 42
    assert snapshot.iv_15_day_percent == 39
    assert snapshot.iv_rank_percent == 31
    assert snapshot.iv_percentile_percent == 67
    assert snapshot.iv_5_day_change_percent == -2.5
    assert snapshot.corr_spy_3_month == 1.25
    assert snapshot.term_structure[0].implied_volatility_percent == 45


def test_summarize_bars_builds_compact_features():
    features = summarize_bars([
        Bar(time=1, open=99, high=102, low=98, close=100, volume=1000),
        Bar(time=2, open=100, high=111, low=99, close=110, volume=3000),
    ])

    assert features.bar_count == 2
    assert features.change_percent == 10
    assert features.window_high == 111
    assert features.window_low == 98
    assert features.average_volume == 2000


def test_find_portfolio_exposure_uses_normalized_group_fields():
    exposure = find_portfolio_exposure(
        [{
            "groups": [{
                "underlying_symbol": "NVDA",
                "buying_power_effect_dollars": 1250.5,
                "beta_delta": 32.25,
            }],
            "percent_used_bp": 42,
        }],
        "nvda",
    )

    assert exposure.status == "ok"
    assert exposure.matching_groups == 1
    assert exposure.buying_power_effect == 1250.5
    assert exposure.beta_delta == 32.25
    assert exposure.account_percent_used_bp == 42


@pytest.mark.asyncio
async def test_analysis_package_json_includes_all_source_boundaries(client):
    chart = ChartResponse(
        s="ok",
        bars=[
            Bar(time=1, open=99, high=102, low=98, close=100, volume=1000),
            Bar(time=2, open=100, high=106, low=99, close=105, volume=2000),
        ],
    )
    market = [{"symbol": "NVDA", "mark": "105.25", "beta": "1.7"}]
    volatility = [{
        "symbol": "NVDA",
        "implied-volatility-index": "0.42",
        "implied-volatility-index-rank": "0.31",
        "option-expiration-implied-volatilities": [],
    }]

    with (
        patch("app.routers.v1.charts.get_chart_history", return_value=chart),
        patch("app.routers.v1.charts.tastytrade.get_active_token", return_value="token"),
        patch("app.routers.v1.charts.tastytrade.fetch_market_data", return_value=market),
        patch("app.routers.v1.charts.tastytrade.fetch_volatility_data", return_value=volatility),
        patch("app.routers.v1.charts._load_positions_data", return_value=[]),
    ):
        response = await client.get(
            "/v1/charts/analysis-package/NVDA"
            "?resolution=1d&from_ts=100&to_ts=200"
        )

    assert response.status_code == 200
    data = response.json()
    assert data["schema_version"] == "equity-analysis-package.v1"
    assert data["analysis_profile"] == "sam-equity-options.v1"
    assert "Decide whether there is\nan actionable setup" in data["analysis_instructions"]
    assert data["market"]["mark"] == 105.25
    assert data["volatility"]["iv_rank_percent"] == 31
    assert data["chart_features"]["change_percent"] == 5
    assert data["spotgamma"]["source"] == "unavailable"
    assert data["catalysts"]["source"] == "unavailable"
    assert data["portfolio_exposure"]["status"] == "ok"
    assert any("No option chain" in warning for warning in data["warnings"])
    assert any(
        item["source"] == "spotgamma_equity_hub" and item["status"] == "partial"
        for item in data["source_status"]
    )


@pytest.mark.asyncio
async def test_analysis_package_accepts_manual_spotgamma_fields(client):
    with (
        patch(
            "app.routers.v1.charts.get_chart_history",
            return_value=ChartResponse(s="ok", bars=[]),
        ),
        patch(
            "app.routers.v1.charts.tastytrade.get_active_token",
            side_effect=RuntimeError("broker offline"),
        ),
        patch("app.routers.v1.charts._load_positions_data", return_value=[]),
    ):
        response = await client.get(
            "/v1/charts/analysis-package/NVDA"
            "?from_ts=100&to_ts=200"
            "&sg_lvp=170&sg_hvp=190&sg_gamma_strike=175&sg_gamma_strike=185"
        )

    assert response.status_code == 200
    data = response.json()
    assert data["spotgamma"]["source"] == "manual"
    assert data["spotgamma"]["low_volatility_point"] == 170
    assert data["spotgamma"]["high_volatility_point"] == 190
    assert data["spotgamma"]["major_gamma_strikes"] == [175, 185]
    assert not any(
        "SpotGamma values are unavailable" in warning for warning in data["warnings"]
    )


@pytest.mark.asyncio
async def test_analysis_package_markdown_is_complete_handoff(client):
    with (
        patch(
            "app.routers.v1.charts.get_chart_history",
            return_value=ChartResponse(s="ok", bars=[]),
        ),
        patch(
            "app.routers.v1.charts.tastytrade.get_active_token",
            side_effect=RuntimeError("broker offline"),
        ),
        patch(
            "app.routers.v1.charts._load_positions_data",
            side_effect=RuntimeError("positions offline"),
        ),
    ):
        response = await client.get(
            "/v1/charts/analysis-package/AAPL"
            "?from_ts=100&to_ts=200&format=markdown"
        )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/markdown")
    text = response.text
    assert "# Equity Analysis Handoff - AAPL" in text
    assert "## Analysis Instructions" in text
    assert "## Data Package" in text
    assert '"schema_version": "equity-analysis-package.v1"' in text
    assert "Do not invent SpotGamma levels" in text
