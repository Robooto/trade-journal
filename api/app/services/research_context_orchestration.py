import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app import tastytrade
from app.schemas.brokerage import (
    DataStatus,
    HoldingSnapshotV1,
    ResearchMetricObservationV1,
    ResearchSymbolContextV1,
    SourceMetadataV1,
)
from app.services.brokerage_service import fetch_holding_snapshot
from app.services.research_context_service import (
    build_research_symbol_context,
)
from app.services.research_metric_store import (
    list_research_metric_history,
    upsert_research_metric,
)


_MARKET_TIMEZONE = ZoneInfo("America/New_York")
_SOURCE_WARNINGS = {
    "/watchlists": "Brokerage watchlists are unavailable.",
    "/market-data/by-type": "Current brokerage market data is unavailable.",
    "/market-metrics": "Current brokerage volatility metrics are unavailable.",
    "/brokerage/holding-snapshot": "Current brokerage exposure is unavailable.",
}
_STORAGE_ENDPOINT = "/research-metric-snapshots"


def _symbols(values: list[str]) -> list[str]:
    return list(
        dict.fromkeys(
            value.strip().upper() for value in values if value.strip()
        )
    )


def _empty_holding_snapshot(fetched_at: datetime) -> HoldingSnapshotV1:
    return HoldingSnapshotV1(
        generated_at=fetched_at,
        accounts=[],
        source_status=[],
    )


def _mark_source_unavailable(
    context: ResearchSymbolContextV1,
    endpoint: str,
) -> None:
    warning = _SOURCE_WARNINGS[endpoint]
    for source in context.source_status:
        if source.endpoint == endpoint:
            source.status = DataStatus.UNAVAILABLE
            source.warnings = [warning]
    for item in context.items:
        for source in item.source_status:
            if source.endpoint == endpoint:
                source.status = DataStatus.UNAVAILABLE
                source.warnings = [warning]
        if warning not in item.warnings:
            item.warnings.append(warning)


def _storage_source(
    fetched_at: datetime,
    *,
    status: DataStatus,
    warning: str | None = None,
) -> SourceMetadataV1:
    return SourceMetadataV1(
        source="trade-journal",
        endpoint=_STORAGE_ENDPOINT,
        fetched_at=fetched_at,
        status=status,
        warnings=[warning] if warning else [],
    )


def _persist_and_enrich(
    db: Session,
    context: ResearchSymbolContextV1,
    fetched_at: datetime,
) -> None:
    observation_date = fetched_at.astimezone(_MARKET_TIMEZONE).date()
    for item in context.items:
        if item.price.as_of is None and item.volatility.as_of is None:
            continue
        upsert_research_metric(
            db,
            ResearchMetricObservationV1(
                symbol=item.symbol,
                observation_date=observation_date,
                observed_at=fetched_at,
                fetched_at=fetched_at,
                mark=item.price.mark,
                previous_close=item.price.previous_close,
                iv_index_percent=item.volatility.iv_index_percent,
                iv_rank_percent=item.volatility.iv_rank_percent,
                iv_percentile_percent=(
                    item.volatility.iv_percentile_percent
                ),
                iv_index_5_day_change_percent=(
                    item.volatility.iv_index_5_day_change_percent
                ),
                liquidity_rating=item.volatility.liquidity_rating,
            ),
        )
        history = list_research_metric_history(
            db,
            item.symbol,
            end_date=observation_date,
            limit=6,
        )
        if len(history) != 6:
            continue
        baseline = history[0]
        current = history[-1]
        if baseline.mark not in (None, 0) and current.mark is not None:
            item.price.five_session_change_percent = round(
                (current.mark / baseline.mark - 1) * 100,
                2,
            )
        if (
            baseline.iv_rank_percent is not None
            and current.iv_rank_percent is not None
        ):
            item.volatility.iv_rank_5_day_change_percent = round(
                current.iv_rank_percent - baseline.iv_rank_percent,
                2,
            )


def fetch_research_symbol_context(
    db: Session,
    token: str,
    symbols: list[str],
    *,
    fetched_at: datetime | None = None,
) -> ResearchSymbolContextV1:
    fetched_at = fetched_at or datetime.now(timezone.utc)
    requested = _symbols(symbols)
    if not requested:
        raise ValueError("At least one non-empty symbol is required.")

    source_failures: set[str] = set()
    try:
        watchlists = tastytrade.fetch_watchlists(token)
    except Exception:
        logging.exception("Failed to fetch brokerage watchlists.")
        watchlists = []
        source_failures.add("/watchlists")

    try:
        market_data = tastytrade.fetch_market_data(
            token,
            requested,
            [],
            [],
            [],
        )
    except Exception:
        logging.exception("Failed to fetch brokerage market data.")
        market_data = []
        source_failures.add("/market-data/by-type")

    try:
        volatility_metrics = tastytrade.fetch_volatility_data(
            token,
            requested,
        )
    except Exception:
        logging.exception("Failed to fetch brokerage volatility metrics.")
        volatility_metrics = []
        source_failures.add("/market-metrics")

    try:
        holding_snapshot = fetch_holding_snapshot(
            token,
            fetched_at=fetched_at,
        )
    except Exception:
        logging.exception("Failed to fetch brokerage holding context.")
        holding_snapshot = _empty_holding_snapshot(fetched_at)
        source_failures.add("/brokerage/holding-snapshot")

    context = build_research_symbol_context(
        requested,
        watchlists=watchlists,
        market_data=market_data,
        volatility_metrics=volatility_metrics,
        holding_snapshot=holding_snapshot,
        fetched_at=fetched_at,
    )
    for endpoint in source_failures:
        _mark_source_unavailable(context, endpoint)

    try:
        _persist_and_enrich(db, context, fetched_at)
    except Exception:
        db.rollback()
        logging.exception("Failed to persist brokerage research metrics.")
        warning = "Daily research metric persistence is unavailable."
        source = _storage_source(
            fetched_at,
            status=DataStatus.UNAVAILABLE,
            warning=warning,
        )
        context.source_status.append(source)
        for item in context.items:
            item.source_status.append(source.model_copy(deep=True))
            item.warnings.append(warning)
    else:
        source = _storage_source(fetched_at, status=DataStatus.OK)
        context.source_status.append(source)
        for item in context.items:
            item.source_status.append(source.model_copy(deep=True))

    return context
