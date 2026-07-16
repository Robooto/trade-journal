from datetime import date, datetime, timezone

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.models import Base, ResearchMetricSnapshotORM
from app.schemas.brokerage import ResearchMetricObservationV1
from app.services.research_metric_store import (
    list_research_metric_history,
    upsert_research_metric,
)


def observation(
    observation_date: date,
    *,
    symbol: str = "aapl",
    iv_rank_percent: float | None = 42.0,
) -> ResearchMetricObservationV1:
    observed_at = datetime.combine(
        observation_date,
        datetime.min.time(),
        tzinfo=timezone.utc,
    )
    return ResearchMetricObservationV1(
        symbol=symbol,
        observation_date=observation_date,
        observed_at=observed_at,
        fetched_at=observed_at,
        mark=210.25,
        previous_close=208.0,
        iv_index_percent=31.2,
        iv_rank_percent=iv_rank_percent,
        iv_percentile_percent=54.0,
        iv_index_5_day_change_percent=3.2,
        liquidity_rating=5.0,
    )


def session():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    return Session(engine)


def test_upsert_normalizes_symbol_and_round_trips_values():
    with session() as db:
        saved = upsert_research_metric(
            db, observation(date(2026, 7, 15))
        )

        assert saved.schema_version == "research-metric-observation.v1"
        assert saved.symbol == "AAPL"
        assert saved.mark == 210.25
        assert saved.iv_rank_percent == 42.0
        assert saved.iv_index_5_day_change_percent == 3.2


def test_upsert_is_idempotent_for_symbol_date_and_source():
    with session() as db:
        upsert_research_metric(
            db,
            observation(date(2026, 7, 15), iv_rank_percent=42.0),
        )
        updated = upsert_research_metric(
            db,
            observation(date(2026, 7, 15), iv_rank_percent=47.5),
        )
        count = db.scalar(
            select(func.count()).select_from(ResearchMetricSnapshotORM)
        )

        assert count == 1
        assert updated.iv_rank_percent == 47.5


def test_history_is_ordered_and_supports_date_bounds():
    with session() as db:
        for day in (14, 15, 16):
            upsert_research_metric(
                db,
                observation(
                    date(2026, 7, day),
                    iv_rank_percent=float(day),
                ),
            )

        history = list_research_metric_history(
            db,
            " aapl ",
            start_date=date(2026, 7, 15),
            end_date=date(2026, 7, 16),
        )

        assert [item.observation_date for item in history] == [
            date(2026, 7, 15),
            date(2026, 7, 16),
        ]
        assert [item.iv_rank_percent for item in history] == [15.0, 16.0]


def test_iv_rank_and_broker_five_day_iv_change_remain_distinct():
    with session() as db:
        saved = upsert_research_metric(
            db,
            observation(date(2026, 7, 15), iv_rank_percent=42.0),
        )

        assert saved.iv_rank_percent == 42.0
        assert saved.iv_index_5_day_change_percent == 3.2


def test_partial_same_day_refresh_does_not_erase_existing_values():
    with session() as db:
        original = observation(date(2026, 7, 15), iv_rank_percent=42.0)
        upsert_research_metric(db, original)
        partial = original.model_copy(
            update={
                "mark": None,
                "iv_rank_percent": 47.5,
            }
        )

        updated = upsert_research_metric(db, partial)

        assert updated.mark == 210.25
        assert updated.iv_rank_percent == 47.5
