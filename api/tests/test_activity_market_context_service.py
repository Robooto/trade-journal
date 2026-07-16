from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from app.schemas.brokerage import (
    BrokerActivityInboxV1,
    BrokerActivityReviewEventV1,
)
from app.schemas.charts import Bar, ChartResponse
from app.services.activity_market_context_service import (
    enrich_activity_market_context,
)


NEW_YORK = ZoneInfo("America/New_York")
SESSION_DATE = date(2026, 7, 15)


def timestamp_ms(hour: int, minute: int) -> int:
    return int(datetime(
        2026,
        7,
        15,
        hour,
        minute,
        tzinfo=NEW_YORK,
    ).timestamp() * 1000)


def chart(*bars: Bar) -> ChartResponse:
    return ChartResponse(s="ok", bars=list(bars))


def event(symbol: str = "AAPL") -> BrokerActivityReviewEventV1:
    return BrokerActivityReviewEventV1(
        activity_group_id=f"activity-{symbol}",
        session_date=SESSION_DATE,
        account_number="FAKE-OPTIONS",
        review_kind="opening",
        occurred_at=datetime(
            2026,
            7,
            15,
            18,
            2,
            tzinfo=timezone.utc,
        ),
        underlying_symbol=symbol,
        grouping_status="explicit",
        leg_count=0,
        legs=[],
        summary=f"{symbol} opening activity",
    )


def test_entry_time_context_uses_nearest_bar_and_session_facts():
    aapl = chart(
        Bar(
            time=timestamp_ms(9, 30),
            open=100,
            high=102,
            low=99,
            close=101,
            volume=100,
        ),
        Bar(
            time=timestamp_ms(14, 0),
            open=102,
            high=104,
            low=101,
            close=103,
            volume=200,
        ),
        Bar(
            time=timestamp_ms(15, 55),
            open=108,
            high=111,
            low=107,
            close=110,
            volume=300,
        ),
    )
    spy = chart(
        Bar(
            time=timestamp_ms(9, 30),
            open=600,
            high=602,
            low=599,
            close=601,
            volume=1000,
        ),
        Bar(
            time=timestamp_ms(14, 0),
            open=604,
            high=607,
            low=603,
            close=606,
            volume=1200,
        ),
        Bar(
            time=timestamp_ms(15, 55),
            open=608,
            high=610,
            low=607,
            close=609,
            volume=1400,
        ),
    )
    calls = []

    def fetcher(symbol, resolution, from_ts, to_ts):
        calls.append((symbol, resolution, from_ts, to_ts))
        return spy if symbol == "SPY" else aapl

    inbox = BrokerActivityInboxV1(
        session_date=SESSION_DATE,
        generated_at=datetime.now(timezone.utc),
        events=[event()],
        source_status=[],
    )

    result = enrich_activity_market_context(
        inbox,
        chart_fetcher=fetcher,
    )

    context = result.events[0].market_context
    assert context is not None
    assert context.underlying.status.value == "partial"
    assert context.underlying.match_quality == "nearest_5m_close"
    assert context.underlying.activity_price == 103
    assert context.underlying.minutes_from_activity == 2
    assert context.underlying.session_open == 100
    assert context.underlying.session_high == 111
    assert context.underlying.session_low == 99
    assert context.underlying.session_close == 110
    assert context.underlying.session_change_percent == 10
    assert context.underlying.activity_from_open_percent == 3
    assert len(context.underlying.bars) == 3
    assert context.benchmark.symbol == "SPY"
    assert context.benchmark.activity_price == 606
    assert context.benchmark.bars == []
    assert {call[0] for call in calls} == {"AAPL", "SPY"}


def test_entry_time_context_keeps_activity_when_chart_is_unavailable():
    def fail(*args):
        raise RuntimeError("upstream detail must not leak")

    inbox = BrokerActivityInboxV1(
        session_date=SESSION_DATE,
        generated_at=datetime.now(timezone.utc),
        events=[event()],
        source_status=[],
    )

    result = enrich_activity_market_context(
        inbox,
        chart_fetcher=fail,
    )

    context = result.events[0].market_context
    assert context is not None
    assert context.underlying.status.value == "unavailable"
    assert context.underlying.activity_price is None
    assert context.underlying.bars == []
    assert context.benchmark.status.value == "unavailable"
    assert "upstream detail" not in str(result.model_dump())
    assert result.events[0].summary == "AAPL opening activity"
