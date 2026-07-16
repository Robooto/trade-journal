from sqlalchemy.orm import Session

from app.models import BrokerActivityDispositionORM
from app.schemas.brokerage import (
    BrokerActivityDispositionRequestV1,
    BrokerActivityDispositionV1,
    BrokerActivityInboxV1,
)


def apply_activity_dispositions(
    db: Session,
    inbox: BrokerActivityInboxV1,
) -> BrokerActivityInboxV1:
    activity_ids = [event.activity_group_id for event in inbox.events]
    rows = []
    if activity_ids:
        rows = (
            db.query(BrokerActivityDispositionORM)
            .filter(
                BrokerActivityDispositionORM.session_date == inbox.session_date,
                BrokerActivityDispositionORM.activity_group_id.in_(activity_ids),
            )
            .all()
        )
    dispositions = {row.activity_group_id: row for row in rows}
    for event in inbox.events:
        row = dispositions.get(event.activity_group_id)
        if row:
            event.review_status = row.status
            event.journal_entry_id = row.journal_entry_id

    inbox.reviewed_count = sum(
        event.review_status == "reviewed" for event in inbox.events
    )
    inbox.skipped_count = sum(
        event.review_status == "skipped" for event in inbox.events
    )
    inbox.pending_count = len(inbox.events) - (
        inbox.reviewed_count + inbox.skipped_count
    )
    return inbox


def upsert_activity_disposition(
    db: Session,
    request: BrokerActivityDispositionRequestV1,
) -> BrokerActivityDispositionV1:
    activity_group_id = request.activity_group_id.strip()
    row = (
        db.query(BrokerActivityDispositionORM)
        .filter(
            BrokerActivityDispositionORM.activity_group_id == activity_group_id,
            BrokerActivityDispositionORM.session_date == request.session_date,
        )
        .one_or_none()
    )
    if row is None:
        row = BrokerActivityDispositionORM(
            activity_group_id=activity_group_id,
            session_date=request.session_date,
        )
        db.add(row)
    row.status = request.status.value
    row.journal_entry_id = request.journal_entry_id
    db.commit()
    db.refresh(row)
    return BrokerActivityDispositionV1(
        activity_group_id=row.activity_group_id,
        session_date=row.session_date,
        status=row.status,
        journal_entry_id=row.journal_entry_id,
        updated_at=row.updated_at,
    )
