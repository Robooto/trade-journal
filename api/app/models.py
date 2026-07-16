import uuid
from sqlalchemy import Column, String, Float, Date, Enum as SAEnum, ForeignKey, Integer, DateTime, UniqueConstraint, func
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import relationship

from app.schemas.journal import MarketDirection

Base = declarative_base()


class JournalEntryORM(Base):
    __tablename__ = "journal_entries"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    date = Column(Date, nullable=False)
    es_price = Column("es_price", Float, nullable=False)
    delta = Column(Float, nullable=True)
    notes = Column(String, nullable=False)
    market_direction = Column(
        SAEnum(MarketDirection, name="market_direction_enum"),
        nullable=False
    )

    reference = relationship(
        "JournalReferenceORM",
        back_populates="entry",
        cascade="all, delete-orphan",
        lazy="selectin",
        uselist=False
    )

    @property
    def source_url(self):
        return self.reference.url if self.reference else None

    @property
    def source_label(self):
        return self.reference.label if self.reference else None

    ticker_rows = relationship(
        "JournalTickerORM",
        back_populates="entry",
        cascade="all, delete-orphan",
        lazy="selectin"
    )

    @property
    def tickers(self):
        return [row.symbol for row in self.ticker_rows]

    events = relationship(
        "EventORM",
        back_populates="entry",
        cascade="all, delete-orphan",
        lazy="selectin"
    )


class JournalReferenceORM(Base):
    __tablename__ = "journal_entry_references"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entry_id = Column(String(36), ForeignKey("journal_entries.id"), nullable=False, unique=True, index=True)
    label = Column(String(120), nullable=True)
    url = Column(String(2048), nullable=True)
    entry = relationship("JournalEntryORM", back_populates="reference")

class JournalTickerORM(Base):
    __tablename__ = "journal_entry_tickers"
    __table_args__ = (UniqueConstraint("entry_id", "symbol", name="uq_journal_entry_ticker"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    entry_id = Column(String(36), ForeignKey("journal_entries.id"), nullable=False, index=True)
    symbol = Column(String(16), nullable=False, index=True)
    entry = relationship("JournalEntryORM", back_populates="ticker_rows")

class EventORM(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entry_id = Column(String(36), ForeignKey("journal_entries.id"), nullable=False)
    time = Column(String, nullable=False)
    price = Column(Float, nullable=False)
    note = Column(String, nullable=False)
    entry = relationship("JournalEntryORM", back_populates="events")


class SessionTokenORM(Base):
    __tablename__ = "session_tokens"
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(128), nullable=False)       # session token string
    expiration = Column(DateTime, nullable=False)     # expiration timestamp (UTC)


class PivotLevelORM(Base):
    __tablename__ = "pivot_levels"

    id = Column(Integer, primary_key=True, autoincrement=True)
    price = Column(Float, nullable=False)
    index = Column(String(16), nullable=False, default="SPX")
    date = Column(Date, nullable=False, server_default=func.current_date())


class ResearchMetricSnapshotORM(Base):
    __tablename__ = "research_metric_snapshots"
    __table_args__ = (
        UniqueConstraint(
            "symbol",
            "observation_date",
            "source",
            name="uq_research_metric_symbol_date_source",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(16), nullable=False, index=True)
    observation_date = Column(Date, nullable=False, index=True)
    observed_at = Column(DateTime, nullable=False)
    fetched_at = Column(DateTime, nullable=False)
    source = Column(String(32), nullable=False, default="tastytrade")
    mark = Column(Float, nullable=True)
    previous_close = Column(Float, nullable=True)
    iv_index_percent = Column(Float, nullable=True)
    iv_rank_percent = Column(Float, nullable=True)
    iv_percentile_percent = Column(Float, nullable=True)
    iv_index_5_day_change_percent = Column(Float, nullable=True)
    liquidity_rating = Column(Float, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class BrokerActivityDispositionORM(Base):
    __tablename__ = "broker_activity_dispositions"
    __table_args__ = (
        UniqueConstraint(
            "activity_group_id",
            "session_date",
            name="uq_broker_activity_disposition_group_session",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    activity_group_id = Column(String(512), nullable=False, index=True)
    session_date = Column(Date, nullable=False, index=True)
    status = Column(String(16), nullable=False)
    journal_entry_id = Column(String(36), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
