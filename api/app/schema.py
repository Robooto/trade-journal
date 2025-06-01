from datetime import date
from enum import Enum
from typing import List, Optional
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
    delta: Optional[float]
    notes: Optional[str]
    market_direction: Optional[MarketDirection] = Field(None, alias="marketDirection")
    events: Optional[List[Event]]

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
