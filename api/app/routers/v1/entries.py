from fastapi import APIRouter, HTTPException, Depends, status
from uuid import UUID
from sqlalchemy.orm import Session

from app.db import get_db
from app.schema import JournalEntry, JournalEntryCreate, JournalEntryUpdate, Event, PaginatedEntries

from app import crud

router = APIRouter(
    prefix="/v1/entries",
    tags=["v1 – journal entries"],
)

@router.get("", response_model=PaginatedEntries)
async def list_entries(*, skip: int = 0, limit: int = 20, db: Session = Depends(get_db)):
    total = crud.count_entries(db)
    items = crud.get_entries(db, skip=skip, limit=limit)
    return PaginatedEntries(total=total, items=items, skip=skip, limit=limit)


@router.post(
    "",
    response_model=JournalEntry,
    status_code=status.HTTP_201_CREATED
)
async def create_entry(entry: JournalEntryCreate, db: Session = Depends(get_db)):
    new_entry = crud.create_entry(db, entry)
    return new_entry


@router.get("/{entry_id}", response_model=JournalEntry)
async def get_entry(entry_id: UUID, db: Session = Depends(get_db)):
    """
    Fetch a single entry by its UUID (including events).
    """
    orm_entry = crud.get_entry(db, entry_id)
    if not orm_entry:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    return orm_entry


@router.put("/{entry_id}", response_model=JournalEntry)
async def update_entry(
    entry_id: UUID,
    changes: JournalEntryUpdate,
    db: Session = Depends(get_db)
):
    """
    Update an entry’s fields. If `events` is provided, it will replace all events.
    """
    updated = crud.update_entry(db, entry_id, changes)
    if not updated:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    return updated


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(entry_id: UUID, db: Session = Depends(get_db)):
    """
    Delete an entry and all its nested events.
    """
    success = crud.delete_entry(db, entry_id)
    if not success:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    return None


@router.post(
    "/{entry_id}/events",
    response_model=JournalEntry,
    status_code=status.HTTP_201_CREATED,
    summary="Add an intra-day event to a journal entry"
)
async def add_event_to_entry(
    entry_id: UUID,
    event: Event,
    db: Session = Depends(get_db)
):
    """
    Append a single Event (time, price, note) to the given entry’s events list.
    """
    updated = crud.add_event_to_entry(db, entry_id, event)
    if not updated:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    return updated