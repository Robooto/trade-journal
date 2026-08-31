from datetime import date, datetime

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models import Base
from app.routers.v1.spx_0dte_decisions import create_human_decision, list_human_decisions
from app.schemas.spx_0dte_decisions import Spx0DteHumanDecisionCreate


def session() -> Session:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    return Session(engine)


def payload(**values) -> Spx0DteHumanDecisionCreate:
    data = dict(
        session_date=date(2026, 8, 31),
        trace_ts=datetime.fromisoformat("2026-08-31T08:20:00-07:00"),
        capture_id="capture-0820",
        decision="take",
        trade_type="bull_put_credit",
        notes="Support held; accepting the paper setup.",
    )
    data.update(values)
    return Spx0DteHumanDecisionCreate(**data)


def test_human_decision_is_append_only_and_session_capture_scoped():
    with session() as db:
        created = create_human_decision(payload(), db)
        try:
            create_human_decision(payload(decision="pass"), db)
        except HTTPException as exc:
            assert exc.status_code == 409
        else:
            raise AssertionError("duplicate capture decision should conflict")
        next_session = create_human_decision(payload(
            session_date=date(2026, 9, 1),
            trace_ts=datetime.fromisoformat("2026-09-01T08:20:00-07:00"),
        ), db)
        listed = list_human_decisions(
            capture_id="capture-0820", session_date=date(2026, 8, 31), limit=250, db=db,
        )

    assert created.decision == "take"
    assert len(listed.rows) == 1
    assert listed.rows[0].capture_id == "capture-0820"
    assert next_session.session_date == date(2026, 9, 1)


def test_take_requires_supported_trade_type_but_pass_may_omit_it():
    try:
        Spx0DteHumanDecisionCreate(
            session_date=date(2026, 8, 31),
            trace_ts=datetime.fromisoformat("2026-08-31T08:30:00-07:00"),
            capture_id="capture-invalid",
            decision="take",
            notes="Missing type",
        )
    except ValidationError as exc:
        assert "take decisions require a trade_type" in str(exc)
    else:
        raise AssertionError("take without trade_type should fail validation")

    passed = Spx0DteHumanDecisionCreate(
        session_date=date(2026, 8, 31),
        trace_ts=datetime.fromisoformat("2026-08-31T08:40:00-07:00"),
        capture_id="capture-pass",
        decision="pass",
        notes="Too close to invalidation.",
    )
    assert passed.trade_type is None


def test_capture_date_must_match_timezone_aware_trace_timestamp():
    for trace_ts, message in (
        (datetime(2026, 8, 31, 8, 40), "trace_ts must include a timezone"),
        (
            datetime.fromisoformat("2026-09-01T08:40:00-07:00"),
            "session_date must match trace_ts",
        ),
    ):
        try:
            payload(trace_ts=trace_ts)
        except ValidationError as exc:
            assert message in str(exc)
        else:
            raise AssertionError("invalid capture identity should fail validation")
