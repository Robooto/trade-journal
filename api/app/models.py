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


class JournalEntryBase(BaseModel):
    date: date
    es_price: float = Field(..., alias="esPrice")
    delta: float
    notes: str
    market_direction: MarketDirection = Field(..., alias="marketDirection")
    events: List[Event] = []


class JournalEntryCreate(JournalEntryBase):
    pass


class JournalEntryUpdate(BaseModel):
    date: Optional[date]
    es_price: Optional[float] = Field(None, alias="esPrice")
    delta: Optional[float]
    notes: Optional[str]
    market_direction: Optional[MarketDirection] = Field(None, alias="marketDirection")
    events: Optional[List[Event]]


class JournalEntry(JournalEntryBase):
    id: UUID = Field(default_factory=uuid4)
