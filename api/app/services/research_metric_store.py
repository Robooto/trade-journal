from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ResearchMetricSnapshotORM
from app.schemas.brokerage import ResearchMetricObservationV1


_VALUE_FIELDS = (
    "observed_at",
    "fetched_at",
    "mark",
    "previous_close",
    "iv_index_percent",
    "iv_rank_percent",
    "iv_percentile_percent",
    "iv_index_5_day_change_percent",
    "liquidity_rating",
)


def _normalized(
    observation: ResearchMetricObservationV1,
) -> ResearchMetricObservationV1:
    return observation.model_copy(
        update={"symbol": observation.symbol.strip().upper()}
    )


def upsert_research_metric(
    db: Session,
    observation: ResearchMetricObservationV1,
) -> ResearchMetricObservationV1:
    observation = _normalized(observation)
    existing = db.scalar(
        select(ResearchMetricSnapshotORM).where(
            ResearchMetricSnapshotORM.symbol == observation.symbol,
            ResearchMetricSnapshotORM.observation_date
            == observation.observation_date,
            ResearchMetricSnapshotORM.source == observation.source,
        )
    )
    if existing is None:
        existing = ResearchMetricSnapshotORM(
            symbol=observation.symbol,
            observation_date=observation.observation_date,
            source=observation.source,
        )
        db.add(existing)

    for field in _VALUE_FIELDS:
        setattr(existing, field, getattr(observation, field))
    db.commit()
    db.refresh(existing)
    return _to_schema(existing)


def list_research_metric_history(
    db: Session,
    symbol: str,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[ResearchMetricObservationV1]:
    statement = select(ResearchMetricSnapshotORM).where(
        ResearchMetricSnapshotORM.symbol == symbol.strip().upper()
    )
    if start_date is not None:
        statement = statement.where(
            ResearchMetricSnapshotORM.observation_date >= start_date
        )
    if end_date is not None:
        statement = statement.where(
            ResearchMetricSnapshotORM.observation_date <= end_date
        )
    rows = db.scalars(
        statement.order_by(ResearchMetricSnapshotORM.observation_date)
    ).all()
    return [_to_schema(row) for row in rows]


def _to_schema(
    row: ResearchMetricSnapshotORM,
) -> ResearchMetricObservationV1:
    return ResearchMetricObservationV1(
        symbol=row.symbol,
        observation_date=row.observation_date,
        observed_at=row.observed_at,
        fetched_at=row.fetched_at,
        source=row.source,
        mark=row.mark,
        previous_close=row.previous_close,
        iv_index_percent=row.iv_index_percent,
        iv_rank_percent=row.iv_rank_percent,
        iv_percentile_percent=row.iv_percentile_percent,
        iv_index_5_day_change_percent=row.iv_index_5_day_change_percent,
        liquidity_rating=row.liquidity_rating,
    )
