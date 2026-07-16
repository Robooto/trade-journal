import logging
from datetime import date

import requests

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import tastytrade
from app.db import get_db
from app.schemas.brokerage import (
    AddWatchlistSymbolRequestV1,
    AddWatchlistSymbolResultV1,
    BrokerActivityInboxV1,
    BrokerWatchlistListV1,
    BrokerWatchlistSummaryV1,
    HoldingSnapshotV1,
    ResearchSymbolContextRequestV1,
    ResearchSymbolContextV1,
)
from app.settings import settings
from app.services.activity_inbox_service import fetch_activity_inbox
from app.services.brokerage_service import fetch_holding_snapshot
from app.services.research_context_orchestration import (
    fetch_research_symbol_context,
)
from app.services.trades_errors import TastytradeFetchError


router = APIRouter(prefix="/v1/broker", tags=["v1 - broker"])


def _token_or_403(db: Session) -> str:
    try:
        return tastytrade.get_active_token(db)
    except Exception as exc:
        logging.exception("Authentication to Tastytrade failed.")
        raise HTTPException(
            status_code=403,
            detail="Authentication to Tastytrade failed.",
        ) from exc


def _watchlist_summary(watchlist) -> BrokerWatchlistSummaryV1:
    symbols = [entry.symbol.upper() for entry in watchlist.watchlist_entries]
    return BrokerWatchlistSummaryV1(
        name=watchlist.name,
        group_name=watchlist.group_name,
        order_index=watchlist.order_index,
        symbols=symbols,
        symbol_count=len(symbols),
    )


@router.get(
    "/holdings",
    summary="Get normalized holdings for every brokerage account",
    response_model=HoldingSnapshotV1,
    response_model_exclude_none=True,
)
def get_holdings(db: Session = Depends(get_db)):
    """
    Return every brokerage account and asset class. Empty or temporarily
    unavailable accounts remain in the response with explicit source status.
    This route does not replace the option-specific /v1/trades projection.
    """
    token = _token_or_403(db)
    try:
        return fetch_holding_snapshot(token)
    except TastytradeFetchError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get(
    "/watchlists",
    summary="List private brokerage watchlists",
    response_model=BrokerWatchlistListV1,
)
def list_watchlists(db: Session = Depends(get_db)):
    token = _token_or_403(db)
    try:
        watchlists = tastytrade.fetch_watchlists(token)
    except requests.RequestException as exc:
        logging.exception("Fetching Tastytrade watchlists failed.")
        raise HTTPException(
            status_code=502,
            detail="Brokerage watchlists are unavailable.",
        ) from exc
    return BrokerWatchlistListV1(
        writes_enabled=settings.brokerage_watchlist_writes_enabled,
        watchlists=[_watchlist_summary(item) for item in watchlists],
    )


@router.post(
    "/watchlists/{watchlist_name}/symbols",
    summary="Add an equity symbol to a private brokerage watchlist",
    response_model=AddWatchlistSymbolResultV1,
)
def add_watchlist_symbol(
    watchlist_name: str,
    request: AddWatchlistSymbolRequestV1,
    db: Session = Depends(get_db),
):
    if not settings.brokerage_watchlist_writes_enabled:
        raise HTTPException(
            status_code=403,
            detail="Brokerage watchlist writes are disabled.",
        )
    token = _token_or_403(db)
    symbol = request.symbol.strip().upper()
    try:
        watchlist, added = tastytrade.add_symbol_to_watchlist(
            token,
            watchlist_name,
            symbol,
            instrument_type=request.instrument_type,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except requests.RequestException as exc:
        logging.exception("Updating a Tastytrade watchlist failed.")
        raise HTTPException(
            status_code=502,
            detail="Brokerage watchlist update failed.",
        ) from exc
    return AddWatchlistSymbolResultV1(
        watchlist=_watchlist_summary(watchlist),
        symbol=symbol,
        added=added,
    )


@router.get(
    "/activity-inbox",
    summary="Get normalized brokerage activity for one review session",
    response_model=BrokerActivityInboxV1,
    response_model_exclude_none=True,
)
def get_activity_inbox(
    session_date: date,
    db: Session = Depends(get_db),
):
    token = _token_or_403(db)
    try:
        return fetch_activity_inbox(token, session_date)
    except TastytradeFetchError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post(
    "/research-symbol-context",
    summary="Get and persist brokerage research context for symbols",
    response_model=ResearchSymbolContextV1,
    response_model_exclude_none=True,
)
def get_research_symbol_context(
    request: ResearchSymbolContextRequestV1,
    db: Session = Depends(get_db),
):
    """
    Join current brokerage market and volatility data, private watchlists,
    existing account exposure, and persisted five-session trends. Individual
    source failures remain explicit in the response instead of failing the
    complete batch.
    """
    token = _token_or_403(db)
    try:
        return fetch_research_symbol_context(
            db,
            token,
            request.symbols,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
