from __future__ import annotations

from datetime import datetime
from typing import List
from uuid import UUID
from sqlalchemy import desc
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models import JournalEntryORM, JournalReferenceORM, JournalTickerORM, EventORM, SessionTokenORM, PivotLevelORM
from app.schemas.journal import Event, JournalEntryCreate, JournalEntryUpdate
from app.schemas.pivots import PivotLevelCreate


def _normalize_tickers(tickers: List[str] | None) -> list[str]:
    return list(dict.fromkeys(
        ticker.strip().upper()
        for ticker in (tickers or [])
        if ticker and ticker.strip()
    ))


def _entries_query(db: Session, q: str | None = None, ticker: str | None = None):
    query = db.query(JournalEntryORM)
    search = (q or "").strip()
    if search:
        pattern = f"%{search}%"
        query = query.filter(or_(
            JournalEntryORM.notes.ilike(pattern),
            JournalEntryORM.ticker_rows.any(JournalTickerORM.symbol.ilike(pattern)),
        ))
    normalized_ticker = (ticker or "").strip().upper()
    if normalized_ticker:
        query = query.filter(
            JournalEntryORM.ticker_rows.any(JournalTickerORM.symbol == normalized_ticker)
        )
    return query


def count_entries(db: Session, q: str | None = None, ticker: str | None = None) -> int:
    """Return the number of journal entries matching the optional filters."""
    return _entries_query(db, q=q, ticker=ticker).count()


def get_entries(
    db: Session,
    skip: int = 0,
    limit: int = 20,
    q: str | None = None,
    ticker: str | None = None,
) -> List[JournalEntryORM]:
    """Return matching journal entries sorted newest-first by date."""
    return (
        _entries_query(db, q=q, ticker=ticker)
        .order_by(desc(JournalEntryORM.date), desc(JournalEntryORM.id))
        .offset(skip)
        .limit(limit)
        .all()
    )

def get_entry(db: Session, entry_id: UUID) -> JournalEntryORM | None:
    """
    Return a single entry by its UUID, or None if not found.
    """
    return db.get(JournalEntryORM, str(entry_id))


def create_entry(
    db: Session, entry_in: JournalEntryCreate
) -> JournalEntryORM:
    """
    Create a new JournalEntryORM (plus any nested events) and return it.
    """
    orm_entry = JournalEntryORM(
        date=entry_in.date,
        es_price=entry_in.es_price,
        delta=entry_in.delta,
        notes=entry_in.notes,
        market_direction=entry_in.market_direction,
    )

    if entry_in.source_url or entry_in.source_label:
        orm_entry.reference = JournalReferenceORM(
            url=(entry_in.source_url or "").strip() or None,
            label=(entry_in.source_label or "").strip() or None,
            entry=orm_entry,
        )

    for symbol in _normalize_tickers(entry_in.tickers):
        orm_entry.ticker_rows.append(JournalTickerORM(symbol=symbol, entry=orm_entry))

    for ev in entry_in.events:
        orm_ev = EventORM(
            time=ev.time,
            price=ev.price,
            note=ev.note,
            entry=orm_entry
        )
        orm_entry.events.append(orm_ev)

    db.add(orm_entry)
    db.commit()
    db.refresh(orm_entry)
    return orm_entry


def update_entry(
    db: Session,
    entry_id: UUID,
    changes: JournalEntryUpdate
) -> JournalEntryORM | None:
    """
    Apply partial updates to an existing entry. If `changes.events` is provided,
    it replaces the entire events list. Returns the updated ORM or None if not found.
    """
    orm_entry: JournalEntryORM | None = get_entry(db, entry_id)
    if not orm_entry:
        return None

    data = changes.model_dump(by_alias=False, exclude_unset=True)

    if "source_url" in data or "source_label" in data:
        current_url = orm_entry.reference.url if orm_entry.reference else None
        current_label = orm_entry.reference.label if orm_entry.reference else None
        source_url = (data.pop("source_url", current_url) or "").strip() or None
        source_label = (data.pop("source_label", current_label) or "").strip() or None
        if source_url or source_label:
            if orm_entry.reference is None:
                orm_entry.reference = JournalReferenceORM()
            orm_entry.reference.url = source_url
            orm_entry.reference.label = source_label
        else:
            orm_entry.reference = None

    if "tickers" in data:
        desired_tickers = set(_normalize_tickers(data.pop("tickers") or []))
        existing_tickers = {row.symbol: row for row in orm_entry.ticker_rows}
        for symbol, row in existing_tickers.items():
            if symbol not in desired_tickers:
                orm_entry.ticker_rows.remove(row)
        for symbol in sorted(desired_tickers - existing_tickers.keys()):
            orm_entry.ticker_rows.append(JournalTickerORM(symbol=symbol, entry=orm_entry))

    if "events" in data:
        # delete old events via relationship.clear()
        orm_entry.events.clear()
        db.flush()  # ensure deletes go through

        for ev in data["events"] or []:
            orm_ev = EventORM(
                time=ev["time"],
                price=ev["price"],
                note=ev["note"],
                entry=orm_entry
            )
            orm_entry.events.append(orm_ev)
        del data["events"]

    for field, value in data.items():
        setattr(orm_entry, field, value)

    db.commit()
    db.refresh(orm_entry)
    return orm_entry


def delete_entry(db: Session, entry_id: UUID) -> bool:
    """
    Delete an entry (and cascade-delete its events). Returns True if deleted,
    False if not found.
    """
    orm_entry = get_entry(db, entry_id)
    if not orm_entry:
        return False
    db.delete(orm_entry)
    db.commit()
    return True


def add_event_to_entry(
    db: Session,
    entry_id: UUID,
    event_in: Event
) -> JournalEntryORM | None:
    """
    Append a single Event (time, price, note) to the given entry’s events list.
    Returns updated JournalEntryORM or None if entry not found.
    """
    orm_entry = get_entry(db, entry_id)
    if not orm_entry:
        return None

    orm_ev = EventORM(
        time=event_in.time,
        price=event_in.price,
        note=event_in.note,
        entry=orm_entry
    )
    db.add(orm_ev)
    db.commit()
    db.refresh(orm_entry)
    return orm_entry

def get_session_token(db: Session):
    """Retrieve the stored OAuth token record (if any) from the database."""
    return db.query(SessionTokenORM).first()

def save_session_token(db: Session, token: str, expiration: datetime):
    """
    Create or update the OAuth access token record in the database.
    If a token record already exists, update it; otherwise insert a new record.
    Returns the saved SessionTokenORM object.
    """
    record = get_session_token(db)
    if record:
        # Update existing record
        record.token = token
        record.expiration = expiration
        db.commit()
        db.refresh(record)
    else:
        # Create new record
        record = SessionTokenORM(token=token, expiration=expiration)
        db.add(record)
        db.commit()
        db.refresh(record)
    return record


def _normalize_index(symbol: str | None) -> str:
    return (symbol or "SPX").upper()


def create_pivot_level(db: Session, pivot_in: PivotLevelCreate) -> PivotLevelORM:
    orm_pivot = PivotLevelORM(
        price=pivot_in.price,
        index=_normalize_index(pivot_in.index),
        date=pivot_in.date,
    )
    db.add(orm_pivot)
    db.commit()
    db.refresh(orm_pivot)
    return orm_pivot


def get_latest_pivot_level(db: Session, index: str = "SPX") -> PivotLevelORM | None:
    symbol = _normalize_index(index)
    return (
        db.query(PivotLevelORM)
        .filter(PivotLevelORM.index == symbol)
        .order_by(desc(PivotLevelORM.date), desc(PivotLevelORM.id))
        .first()
    )


def get_recent_pivot_levels(
    db: Session,
    *,
    limit: int = 7,
    index: str = "SPX",
) -> List[PivotLevelORM]:
    symbol = _normalize_index(index)
    limit = max(1, limit)
    return (
        db.query(PivotLevelORM)
        .filter(PivotLevelORM.index == symbol)
        .order_by(desc(PivotLevelORM.date), desc(PivotLevelORM.id))
        .limit(limit)
        .all()
    )
