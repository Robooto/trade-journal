from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class SpreadOrderConfig(BaseModel):
    live_enabled: bool
    account_number: str | None
    width: int
    max_quantity: int
    tick: float


class SpreadLegsRequest(BaseModel):
    side: Literal["call", "put"]
    short_strike: float = Field(..., gt=0)


class SpreadQuote(BaseModel):
    side: Literal["call", "put"]
    expiration: date
    short_strike: float
    long_strike: float
    width: int
    short_symbol: str
    long_symbol: str
    short: dict[str, Any]
    long: dict[str, Any]
    natural: float | None
    mid: float | None
    suggested_price: float | None
    quoted_at: datetime


class SpreadPriceRequest(SpreadLegsRequest):
    price: float = Field(..., gt=0)
    quantity: int = 1


class SpreadPreview(BaseModel):
    account_number: str
    payload: dict[str, Any]
    buying_power_change: float | None
    fees: float | None
    warnings: list[str]


class SpreadSubmitRequest(SpreadPriceRequest):
    confirmed: bool = False


class SpreadReplaceRequest(BaseModel):
    price: float = Field(..., gt=0)
    confirmed: bool = False


class SpreadOrder(BaseModel):
    id: int
    session_date: date
    account_number: str
    side: str
    short_strike: float
    long_strike: float
    width: int
    quantity: int
    short_symbol: str
    long_symbol: str
    limit_price: float
    tasty_order_id: str | None
    status: str
    working: bool
    fill_credit: float | None
    events: list[dict[str, Any]]
    created_at: datetime
    updated_at: datetime


class SpreadOrderList(BaseModel):
    rows: list[SpreadOrder]
