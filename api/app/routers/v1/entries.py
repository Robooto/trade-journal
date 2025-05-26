from fastapi import APIRouter, HTTPException, status
from uuid import UUID

from ...models import JournalEntry, JournalEntryCreate, JournalEntryUpdate, Event
from typing import Dict, List

router = APIRouter(
    prefix="/v1/entries",
    tags=["v1 – journal entries"],
)

# in-memory store for now
_db: Dict[UUID, JournalEntry] = {}


@router.get("/", response_model=List[JournalEntry])
async def list_entries():
    return list(_db.values())


@router.post(
    "/",
    response_model=JournalEntry,
    status_code=status.HTTP_201_CREATED
)
async def create_entry(entry: JournalEntryCreate):
    new = JournalEntry(**entry.dict(by_alias=True))
    _db[new.id] = new
    return new


@router.get("/{entry_id}", response_model=JournalEntry)
async def get_entry(entry_id: UUID):
    entry = _db.get(entry_id)
    if not entry:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    return entry


@router.put("/{entry_id}", response_model=JournalEntry)
async def update_entry(entry_id: UUID, changes: JournalEntryUpdate):
    existing = _db.get(entry_id)
    if not existing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    updated = existing.copy(update=changes.dict(by_alias=True, exclude_unset=True))
    _db[entry_id] = updated
    return updated


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(entry_id: UUID):
    if entry_id not in _db:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    del _db[entry_id]


@router.post(
    "/{entry_id}/events",
    response_model=JournalEntry,
    status_code=status.HTTP_201_CREATED,
    summary="Add an intra-day event to a journal entry"
)
async def add_event_to_entry(entry_id: UUID, event: Event):
    """
    Append a single Event (time, price, note) to the given entry's events list.
    """
    entry = _db.get(entry_id)
    if not entry:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")

    entry.events.append(event)
    _db[entry_id] = entry
    return entry
