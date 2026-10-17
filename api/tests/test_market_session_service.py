from datetime import date, datetime, UTC

import pytest

from app.services.market_session_service import (
    is_us_equity_market_session,
    previous_us_equity_market_session,
)


@pytest.mark.parametrize(
    ("as_of", "expected"),
    [
        (date(2026, 7, 20), date(2026, 7, 17)),
        # Independence Day is Saturday in 2026, so Friday is closed.
        (date(2026, 7, 6), date(2026, 7, 2)),
        # Good Friday precedes Easter Monday.
        (date(2026, 4, 6), date(2026, 4, 2)),
        # Juneteenth is Friday in 2026.
        (date(2026, 6, 22), date(2026, 6, 18)),
        # A Saturday New Year's Day does not close the preceding Friday.
        (date(2022, 1, 3), date(2021, 12, 31)),
        # The Carter national day of mourning was an exceptional closure.
        (date(2025, 1, 10), date(2025, 1, 8)),
    ],
)
def test_previous_session_handles_weekends_holidays_and_closures(
    as_of,
    expected,
):
    assert previous_us_equity_market_session(as_of) == expected


def test_datetime_uses_new_york_calendar_date():
    assert previous_us_equity_market_session(
        datetime(2026, 7, 16, 3, 0, tzinfo=UTC)
    ) == date(2026, 7, 14)


def test_naive_datetime_is_rejected():
    with pytest.raises(ValueError, match="timezone"):
        previous_us_equity_market_session(datetime(2026, 7, 16, 5, 0))


def test_session_predicate_covers_regular_and_holiday_dates():
    assert is_us_equity_market_session(date(2026, 7, 2))
    assert not is_us_equity_market_session(date(2026, 7, 3))
    assert not is_us_equity_market_session(date(2026, 7, 4))


def test_latest_completed_session_switches_to_today_after_the_close():
    from datetime import datetime
    from zoneinfo import ZoneInfo
    from app.services.market_session_service import latest_completed_us_equity_market_session

    eastern = ZoneInfo("America/New_York")
    friday = date(2026, 10, 16)
    assert latest_completed_us_equity_market_session(datetime(2026, 10, 16, 9, 0, tzinfo=eastern)) == date(2026, 10, 15)
    assert latest_completed_us_equity_market_session(datetime(2026, 10, 16, 15, 59, tzinfo=eastern)) == date(2026, 10, 15)
    assert latest_completed_us_equity_market_session(datetime(2026, 10, 16, 16, 0, tzinfo=eastern)) == friday
    assert latest_completed_us_equity_market_session(datetime(2026, 10, 17, 11, 0, tzinfo=eastern)) == friday  # Saturday
    assert latest_completed_us_equity_market_session(datetime(2026, 10, 19, 8, 0, tzinfo=eastern)) == friday  # Monday pre-open
    assert latest_completed_us_equity_market_session(datetime(2026, 11, 26, 18, 0, tzinfo=eastern)) == date(2026, 11, 25)  # Thanksgiving
