from datetime import date as Date, datetime
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
    date: Date
    es_price: float = Field(..., alias="esPrice")
    delta: Optional[float] = None
    notes: str
    market_direction: MarketDirection = Field(..., alias="marketDirection")
    events: List[Event] = Field(default_factory=list)
    tickers: List[str] = Field(default_factory=list)
    source_url: Optional[str] = Field(None, alias="sourceUrl", max_length=2048)
    source_label: Optional[str] = Field(None, alias="sourceLabel", max_length=120)

    model_config = {
        "populate_by_name": True,
        "from_attributes": True
    }


class JournalEntryCreate(JournalEntryBase):
    pass


class JournalEntryUpdate(BaseModel):
    date: Optional[Date] = None
    es_price: Optional[float] = Field(None, alias="esPrice")
    delta: Optional[float] = None
    notes: Optional[str] = None
    market_direction: Optional[MarketDirection] = Field(None, alias="marketDirection")
    events: Optional[List[Event]] = None
    tickers: Optional[List[str]] = None
    source_url: Optional[str] = Field(None, alias="sourceUrl", max_length=2048)
    source_label: Optional[str] = Field(None, alias="sourceLabel", max_length=120)

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
