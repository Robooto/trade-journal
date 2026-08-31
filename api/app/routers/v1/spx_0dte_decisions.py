from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Spx0DteHumanDecisionORM
from app.schemas.spx_0dte_decisions import (
    Spx0DteHumanDecision,
    Spx0DteHumanDecisionCreate,
    Spx0DteHumanDecisionList,
)


router = APIRouter(prefix="/v1/0dte-decisions", tags=["v1 – SPX 0DTE decisions"])


@router.post("", response_model=Spx0DteHumanDecision, status_code=status.HTTP_201_CREATED)
def create_human_decision(
    payload: Spx0DteHumanDecisionCreate,
    db: Session = Depends(get_db),
):
    row = Spx0DteHumanDecisionORM(**payload.model_dump())
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A human decision is already frozen for this TRACE capture.",
        ) from exc
    db.refresh(row)
    return row


@router.get("", response_model=Spx0DteHumanDecisionList)
def list_human_decisions(
    capture_id: str | None = Query(default=None, min_length=1, max_length=128),
    session_date: date | None = Query(default=None),
    limit: int = Query(default=250, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    query = db.query(Spx0DteHumanDecisionORM)
    if capture_id is not None:
        query = query.filter(Spx0DteHumanDecisionORM.capture_id == capture_id)
    if session_date is not None:
        query = query.filter(Spx0DteHumanDecisionORM.session_date == session_date)
    rows = query.order_by(
        Spx0DteHumanDecisionORM.trace_ts.asc(),
        Spx0DteHumanDecisionORM.id.asc(),
    ).limit(limit).all()
    return Spx0DteHumanDecisionList(rows=rows)
