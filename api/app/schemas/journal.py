from datetime import date as Date, datetime
from enum import Enum
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
    delta: float | None = None
    notes: str
    market_direction: MarketDirection = Field(..., alias="marketDirection")
    events: list[Event] = Field(default_factory=list)
    tickers: list[str] = Field(default_factory=list)
    source_url: str | None = Field(None, alias="sourceUrl", max_length=2048)
    source_label: str | None = Field(None, alias="sourceLabel", max_length=120)

    model_config = {
        "populate_by_name": True,
        "from_attributes": True
    }


class JournalEntryCreate(JournalEntryBase):
    pass


class JournalEntryUpdate(BaseModel):
    date: Date | None = None
    es_price: float | None = Field(None, alias="esPrice")
    delta: float | None = None
    notes: str | None = None
    market_direction: MarketDirection | None = Field(None, alias="marketDirection")
    events: list[Event] | None = None
    tickers: list[str] | None = None
    source_url: str | None = Field(None, alias="sourceUrl", max_length=2048)
    source_label: str | None = Field(None, alias="sourceLabel", max_length=120)

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
    items: list[JournalEntry]
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
