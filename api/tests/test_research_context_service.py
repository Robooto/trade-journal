import json
from datetime import date, datetime, timezone
from pathlib import Path

from app.schemas.brokerage import DataStatus, EarningsContextV1
from app.services.brokerage_normalizer import build_holding_snapshot
from app.services.research_context_service import build_research_symbol_context
from app.tastytrade_schema import (
    TastyAccount,
    TastyMarketData,
    TastyPosition,
    TastyVolatilityMetric,
    TastyWatchlist,
)


FIXTURE_DIR = Path(__file__).parent / "fixtures" / "tastytrade"
FETCHED_AT = datetime(2026, 7, 15, 12, 0, tzinfo=timezone.utc)


def load_fixture(name: str) -> dict:
    with (FIXTURE_DIR / name).open() as fixture:
        return json.load(fixture)


def fixture_items(name: str) -> list[dict]:
    return load_fixture(name)["data"]["items"]


def holding_snapshot():
    accounts = [
        TastyAccount.model_validate(item["account"])
        for item in fixture_items("accounts_wave1.json")
    ]
    positions = {
        "FAKE-OPTIONS": [
            TastyPosition.model_validate(item)
            for item in fixture_items("positions_FAKE_OPTIONS.json")
        ],
        "FAKE-HOLD": [
            TastyPosition.model_validate(item)
            for item in fixture_items("positions_FAKE_HOLD.json")
        ],
        "FAKE-MIXED": [
            TastyPosition.model_validate(item)
            for item in fixture_items("positions_FAKE_MIXED.json")
        ],
    }
    return build_holding_snapshot(accounts, positions, fetched_at=FETCHED_AT)


def test_research_context_joins_watchlists_holdings_price_and_volatility():
    watchlists = [
        TastyWatchlist.model_validate(item)
        for item in fixture_items("watchlists.json")
    ]
    market_data = [
        TastyMarketData.model_validate(item)
        for item in fixture_items("market_data_research.json")
    ]
    volatility = [
        TastyVolatilityMetric.model_validate(item)
        for item in fixture_items("market_metrics_research.json")
    ]

    context = build_research_symbol_context(
        ["aapl", "NVDA", "UNKNOWN", "AAPL"],
        watchlists=watchlists,
        market_data=market_data,
        volatility_metrics=volatility,
        holding_snapshot=holding_snapshot(),
        fetched_at=FETCHED_AT,
    )

    assert context.schema_version == "research-symbol-context.v1"
    assert context.requested_symbols == ["AAPL", "NVDA", "UNKNOWN"]
    assert context.missing_symbols == ["UNKNOWN"]
    assert context.source_status[1].status == DataStatus.PARTIAL
    assert context.source_status[1].missing_fields == ["symbols.UNKNOWN"]
    assert context.source_status[2].status == DataStatus.PARTIAL
    assert context.source_status[2].missing_fields == ["symbols.UNKNOWN"]

    aapl = next(item for item in context.items if item.symbol == "AAPL")
    assert [watchlist.name for watchlist in aapl.watchlists] == ["Core Options"]
    assert aapl.price.mark == 210
    assert aapl.price.day_change_percent == 0.72
    assert aapl.volatility.iv_index_percent == 28.5
    assert aapl.volatility.iv_rank_percent == 44
    assert aapl.volatility.iv_percentile_percent == 61
    assert aapl.volatility.iv_index_5_day_change_percent == 1.8
    assert aapl.volatility.iv_rank_5_day_change_percent is None
    assert aapl.exposure.is_held is True
    assert aapl.exposure.account_numbers == ["FAKE-HOLD", "FAKE-OPTIONS"]
    assert aapl.exposure.net_underlying_quantity == 25
    assert aapl.exposure.option_position_count == 2
    assert aapl.earnings.status == "unavailable"

    unknown = next(item for item in context.items if item.symbol == "UNKNOWN")
    assert unknown.source_status[0].status == DataStatus.UNAVAILABLE
    assert unknown.source_status[1].status == DataStatus.UNAVAILABLE
    assert len(unknown.warnings) == 3


def test_research_context_accepts_only_explicit_upcoming_earnings_context():
    context = build_research_symbol_context(
        ["AAPL"],
        watchlists=[],
        market_data=[],
        volatility_metrics=[],
        holding_snapshot=holding_snapshot(),
        fetched_at=FETCHED_AT,
        earnings_by_symbol={
            "AAPL": EarningsContextV1(
                status="confirmed",
                earnings_date=date(2026, 7, 30),
                earnings_time="after_close",
                source="verified-provider",
            )
        },
    )

    aapl = context.items[0]
    assert aapl.earnings.status == "confirmed"
    assert aapl.earnings.earnings_date == date(2026, 7, 30)
    assert "Upcoming earnings date is unavailable." not in aapl.warnings


def test_missing_mark_is_partial_not_silently_ok():
    context = build_research_symbol_context(
        ["NVDA"],
        watchlists=[],
        market_data=[{"symbol": "NVDA", "close": "173.25"}],
        volatility_metrics=[],
        holding_snapshot=holding_snapshot(),
        fetched_at=FETCHED_AT,
    )

    nvda = context.items[0]
    market_source = nvda.source_status[0]
    assert market_source.status == DataStatus.PARTIAL
    assert market_source.missing_fields == ["mark"]


def test_incomplete_account_positions_mark_exposure_partial():
    snapshot = holding_snapshot()
    snapshot.source_status[0].status = DataStatus.UNAVAILABLE
    snapshot.source_status[0].warnings = [
        "Brokerage positions are unavailable for this account."
    ]

    context = build_research_symbol_context(
        ["AAPL"],
        watchlists=[],
        market_data=[],
        volatility_metrics=[],
        holding_snapshot=snapshot,
        fetched_at=FETCHED_AT,
    )

    aggregate = next(
        source
        for source in context.source_status
        if source.endpoint == "/brokerage/holding-snapshot"
    )
    item_source = next(
        source
        for source in context.items[0].source_status
        if source.endpoint == "/brokerage/holding-snapshot"
    )
    assert aggregate.status == DataStatus.PARTIAL
    assert item_source.status == DataStatus.PARTIAL
    assert aggregate.warnings == [
        "Brokerage positions are unavailable for this account."
    ]
