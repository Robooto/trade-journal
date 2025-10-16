from __future__ import annotations

from datetime import datetime
from typing import List
from uuid import UUID
from sqlalchemy import desc
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import JournalEntryORM, EventORM, SessionTokenORM
from app.schema import JournalEntryCreate, JournalEntryUpdate, Event


def count_entries(db: Session) -> int:
    """
    Return the total number of journal entries in the database.
    """
    return db.query(func.count(JournalEntryORM.id)).scalar() or 0


def get_entries(
    db: Session,
    skip: int = 0,
    limit: int = 20
) -> List[JournalEntryORM]:
    """
    Return a page of journal entries, sorted newest-first by date.
    - skip: how many to skip (offset)
    - limit: how many to return
    By default, skip=0 and limit=20 (so you get the 20 most recent entries).
    """
    return (
        db.query(JournalEntryORM)
          .order_by(desc(JournalEntryORM.date))
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

    data = changes.model_dump(by_alias=True, exclude_unset=True)

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
