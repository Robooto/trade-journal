from datetime import date, datetime
from enum import Enum
from typing import Any, List, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class MarketDirection(str, Enum):
    up = "up"
    down = "down"


class Event(BaseModel):
    time: str
    price: float
    note: str

    model_config = {
        "from_attributes": True
    }


class JournalEntryBase(BaseModel):
    date: date
    es_price: float = Field(..., alias="esPrice")
    delta: float
    notes: str
    market_direction: MarketDirection = Field(..., alias="marketDirection")
    events: List[Event] = []

    model_config = {
        "populate_by_name": True,
        "from_attributes": True
    }


class JournalEntryCreate(JournalEntryBase):
    pass


class JournalEntryUpdate(BaseModel):
    date: Optional[date]
    es_price: Optional[float] = Field(None, alias="esPrice")
    delta: Optional[float] = None
    notes: Optional[str] = None
    market_direction: Optional[MarketDirection] = Field(None, alias="marketDirection")
    events: Optional[List[Event]] = None

    model_config = {
        "populate_by_name": True,
        "from_attributes": False
    }


class JournalEntry(JournalEntryBase):
    id: UUID = Field(default_factory=uuid4)

    model_config = {
        "populate_by_name": True,
        "from_attributes": True
    }

class PaginatedEntries(BaseModel):
    total: int
    items: List[JournalEntry]
    skip: int
    limit: int

    model_config = {
        "populate_by_name": True,
        "from_attributes": True
    }

class SessionTokenBase(BaseModel):
    token: str
    expiration: datetime

    model_config = {
        "from_attributes": True
    }

class SessionToken(SessionTokenBase):
    id: int

    model_config = {
        "from_attributes": True
    }


class Position(BaseModel):
    """Generic position data with arbitrary fields."""

    approximate_p_l: Optional[float] = Field(None, alias="approximate-p-l")

    model_config = {
        "populate_by_name": True,
        "extra": "allow",
        "from_attributes": True,
    }


class GroupedPositions(BaseModel):
    underlying_symbol: str
    expires_at: str
    total_credit_received: float
    current_group_price: float
    group_approximate_p_l: float
    percent_credit_received: Optional[int] = None
    iv_rank: Optional[float] = Field(None, alias="iv_rank")
    positions: List[Position]

    model_config = {
        "populate_by_name": True,
        "from_attributes": True,
    }


class AccountPositions(BaseModel):
    account_number: str
    nickname: str
    groups: List[GroupedPositions]

    model_config = {
        "populate_by_name": True,
        "from_attributes": True,
    }


class PositionsResponse(BaseModel):
    accounts: List[AccountPositions]

    model_config = {
        "populate_by_name": True,
        "from_attributes": True,
    }

