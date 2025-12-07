from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app import crud
from app.db import get_db
from app.schema import PivotLevel, PivotLevelCreate


router = APIRouter(
    prefix="/v1/pivots",
    tags=["v1 – pivot levels"],
)


@router.post("", response_model=PivotLevel, status_code=status.HTTP_201_CREATED)
async def create_pivot_level(
    pivot: PivotLevelCreate,
    db: Session = Depends(get_db),
):
    return crud.create_pivot_level(db, pivot)


@router.get("/latest", response_model=PivotLevel)
async def get_latest_pivot_level(
    index: str = Query("SPX"),
    db: Session = Depends(get_db),
):
    latest = crud.get_latest_pivot_level(db, index=index)
    if not latest:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No pivot levels recorded for this index")
    return latest


@router.get("/history", response_model=List[PivotLevel])
async def get_pivot_level_history(
    limit: int = Query(7, ge=1, le=30),
    index: str = Query("SPX"),
    db: Session = Depends(get_db),
):
    return crud.get_recent_pivot_levels(db, limit=limit, index=index)
