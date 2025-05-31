import uuid
from sqlalchemy import Column, String, Float, Date, Enum as SAEnum, ForeignKey, Integer
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

from schema import MarketDirection

Base = declarative_base()


class JournalEntryORM(Base):
    __tablename__ = "journal_entries"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    date = Column(Date, nullable=False)
    es_price = Column("es_price", Float, nullable=False)
    delta = Column(Float, nullable=False)
    notes = Column(String, nullable=False)
    market_direction = Column(
        SAEnum(MarketDirection, name="market_direction_enum"),
        nullable=False
    )

    events = relationship(
        "EventORM",
        back_populates="entry",
        cascade="all, delete-orphan",
        lazy="selectin"
    )


class EventORM(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entry_id = Column(String(36), ForeignKey("journal_entries.id"), nullable=False)
    time = Column(String, nullable=False)
    price = Column(Float, nullable=False)
    note = Column(String, nullable=False)
    entry = relationship("JournalEntryORM", back_populates="events")
