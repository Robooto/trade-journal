import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import tastytrade
from app.db import get_db
from app.schemas.brokerage import (
    HoldingSnapshotV1,
    ResearchSymbolContextRequestV1,
    ResearchSymbolContextV1,
)
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
