from datetime import date, datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import tastytrade
from app.models import Base
from app.schemas.brokerage import (
    DataStatus,
    HoldingSnapshotV1,
    ResearchMetricObservationV1,
)
from app.services import research_context_orchestration as orchestration
from app.services.research_metric_store import upsert_research_metric
from app.tastytrade_schema import TastyMarketData, TastyVolatilityMetric


FETCHED_AT = datetime(2026, 7, 15, 13, 20, tzinfo=timezone.utc)


def session():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    return Session(engine)


def empty_holdings():
    return HoldingSnapshotV1(
        generated_at=FETCHED_AT,
        accounts=[],
        source_status=[],
    )


def test_batch_context_persists_and_calculates_five_session_trends(
    monkeypatch,
):
    monkeypatch.setattr(tastytrade, "fetch_watchlists", lambda token: [])
    monkeypatch.setattr(
        tastytrade,
        "fetch_market_data",
        lambda token, equity, equity_option, future, future_option: [
            TastyMarketData(symbol="AAPL", mark="110", close="108")
        ],
    )
    monkeypatch.setattr(
        tastytrade,
        "fetch_volatility_data",
        lambda token, symbols: [
            TastyVolatilityMetric.model_validate(
                {
                    "symbol": "AAPL",
                    "implied-volatility-index": "0.31",
                    "implied-volatility-index-rank": "0.50",
                    "implied-volatility-percentile": "0.62",
                    "implied-volatility-index-5-day-change": "0.04",
                    "liquidity-rating": "5",
                }
            )
        ],
    )
    monkeypatch.setattr(
        orchestration,
        "fetch_holding_snapshot",
        lambda token, fetched_at: empty_holdings(),
    )

    with session() as db:
        for days_ago in range(5, 0, -1):
            observed_at = FETCHED_AT - timedelta(days=days_ago)
            upsert_research_metric(
                db,
                ResearchMetricObservationV1(
                    symbol="AAPL",
                    observation_date=observed_at.date(),
                    observed_at=observed_at,
                    fetched_at=observed_at,
                    mark=100 + (5 - days_ago),
                    iv_rank_percent=40 + (5 - days_ago),
                ),
            )

        context = orchestration.fetch_research_symbol_context(
            db,
            "Bearer FAKE",
            [" aapl ", "AAPL"],
            fetched_at=FETCHED_AT,
        )

    assert context.requested_symbols == ["AAPL"]
    item = context.items[0]
    assert item.price.five_session_change_percent == 10.0
    assert item.volatility.iv_rank_5_day_change_percent == 10.0
    assert item.volatility.iv_index_5_day_change_percent == 4.0
    assert context.source_status[-1].status == DataStatus.OK


def test_batch_context_chunks_large_symbol_sets(monkeypatch):
    market_batches = []
    volatility_batches = []
    monkeypatch.setattr(tastytrade, "fetch_watchlists", lambda token: [])

    def fetch_market_data(
        token,
        equity,
        equity_option,
        future,
        future_option,
    ):
        market_batches.append(equity)
        return []

    def fetch_volatility_data(token, symbols):
        volatility_batches.append(symbols)
        return []

    monkeypatch.setattr(tastytrade, "fetch_market_data", fetch_market_data)
    monkeypatch.setattr(
        tastytrade,
        "fetch_volatility_data",
        fetch_volatility_data,
    )
    monkeypatch.setattr(
        orchestration,
        "fetch_holding_snapshot",
        lambda token, fetched_at: empty_holdings(),
    )

    symbols = [f"SYM{index}" for index in range(101)]
    with session() as db:
        context = orchestration.fetch_research_symbol_context(
            db,
            "Bearer FAKE",
            symbols,
            fetched_at=FETCHED_AT,
        )

    assert [len(batch) for batch in market_batches] == [100, 1]
    assert [len(batch) for batch in volatility_batches] == [100, 1]
    assert context.requested_symbols == symbols


def test_batch_context_preserves_partial_source_failures(monkeypatch):
    def fail(*args, **kwargs):
        raise RuntimeError("private upstream detail")

    monkeypatch.setattr(tastytrade, "fetch_watchlists", fail)
    monkeypatch.setattr(tastytrade, "fetch_market_data", fail)
    monkeypatch.setattr(
        tastytrade,
        "fetch_volatility_data",
        lambda token, symbols: [
            TastyVolatilityMetric.model_validate(
                {
                    "symbol": "NVDA",
                    "implied-volatility-index-rank": "0.44",
                }
            )
        ],
    )
    monkeypatch.setattr(orchestration, "fetch_holding_snapshot", fail)

    with session() as db:
        context = orchestration.fetch_research_symbol_context(
            db,
            "Bearer FAKE",
            ["NVDA"],
            fetched_at=FETCHED_AT,
        )

    statuses = {
        source.endpoint: source.status for source in context.source_status
    }
    assert statuses["/watchlists"] == DataStatus.UNAVAILABLE
    assert statuses["/market-data/by-type"] == DataStatus.UNAVAILABLE
    assert statuses["/market-metrics"] in {
        DataStatus.OK,
        DataStatus.PARTIAL,
    }
    item = context.items[0]
    assert item.volatility.iv_rank_percent == 44.0
    assert "private upstream detail" not in str(context.model_dump())


def test_batch_context_survives_persistence_failure(monkeypatch):
    monkeypatch.setattr(tastytrade, "fetch_watchlists", lambda token: [])
    monkeypatch.setattr(
        tastytrade,
        "fetch_market_data",
        lambda token, equity, equity_option, future, future_option: [
            TastyMarketData(symbol="AAPL", mark="110", close="108")
        ],
    )
    monkeypatch.setattr(
        tastytrade,
        "fetch_volatility_data",
        lambda token, symbols: [],
    )
    monkeypatch.setattr(
        orchestration,
        "fetch_holding_snapshot",
        lambda token, fetched_at: empty_holdings(),
    )

    def fail_persistence(*args, **kwargs):
        raise RuntimeError("private database detail")

    monkeypatch.setattr(
        orchestration,
        "upsert_research_metric",
        fail_persistence,
    )

    with session() as db:
        context = orchestration.fetch_research_symbol_context(
            db,
            "Bearer FAKE",
            ["AAPL"],
            fetched_at=FETCHED_AT,
        )

    storage = context.source_status[-1]
    assert storage.status == DataStatus.UNAVAILABLE
    assert storage.warnings == [
        "Daily research metric persistence is unavailable."
    ]
    assert context.items[0].price.mark == 110.0
    assert "private database detail" not in str(context.model_dump())
