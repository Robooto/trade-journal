from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field, model_validator


Decision = Literal["take", "pass"]
TradeType = Literal["bull_put_credit", "bear_call_credit"]
PACIFIC = ZoneInfo("America/Los_Angeles")


class Spx0DteHumanDecisionCreate(BaseModel):
    session_date: date
    trace_ts: datetime
    capture_id: str = Field(min_length=1, max_length=128)
    decision: Decision
    trade_type: TradeType | None = None
    notes: str | None = Field(default=None, max_length=2000)

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def validate_capture_identity(self):
        if self.decision == "take" and self.trade_type is None:
            raise ValueError("take decisions require a trade_type")
        if self.trace_ts.tzinfo is None:
            raise ValueError("trace_ts must include a timezone")
        if self.trace_ts.astimezone(PACIFIC).date() != self.session_date:
            raise ValueError("session_date must match trace_ts in America/Los_Angeles")
        return self


class Spx0DteHumanDecision(BaseModel):
    schema_version: Literal["spx-0dte-human-decision.v1"] = "spx-0dte-human-decision.v1"
    id: int
    session_date: date
    trace_ts: datetime
    capture_id: str
    decision: Decision
    trade_type: TradeType | None
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True, "extra": "forbid"}


class Spx0DteHumanDecisionList(BaseModel):
    schema_version: Literal["spx-0dte-human-decision-list.v1"] = "spx-0dte-human-decision-list.v1"
    rows: list[Spx0DteHumanDecision]

    model_config = {"extra": "forbid"}
