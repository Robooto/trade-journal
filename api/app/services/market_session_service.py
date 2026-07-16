from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from zoneinfo import ZoneInfo

from pandas import Timestamp
from pandas.tseries.holiday import (
    AbstractHolidayCalendar,
    GoodFriday,
    Holiday,
    USLaborDay,
    USMartinLutherKingJr,
    USMemorialDay,
    USPresidentsDay,
    USThanksgivingDay,
    nearest_workday,
)


EASTERN = ZoneInfo("America/New_York")


def _new_year_observance(value):
    # Unlike most NYSE holidays, a Saturday New Year's Day does not close the
    # preceding Friday. A Sunday holiday closes the following Monday.
    if value.weekday() == 6:
        return value + timedelta(days=1)
    return value


class USEquityMarketHolidayCalendar(AbstractHolidayCalendar):
    rules = [
        Holiday(
            "New Year's Day",
            month=1,
            day=1,
            observance=_new_year_observance,
        ),
        USMartinLutherKingJr,
        USPresidentsDay,
        GoodFriday,
        USMemorialDay,
        Holiday(
            "Juneteenth",
            month=6,
            day=19,
            start_date=Timestamp("2022-01-01"),
            observance=nearest_workday,
        ),
        Holiday(
            "Independence Day",
            month=7,
            day=4,
            observance=nearest_workday,
        ),
        USLaborDay,
        USThanksgivingDay,
        Holiday(
            "Christmas Day",
            month=12,
            day=25,
            observance=nearest_workday,
        ),
    ]


# Full-day closures that are not described by the recurring holiday rules.
# These make historical review deterministic for the modern brokerage period.
EXCEPTIONAL_CLOSURES = {
    date(1994, 4, 27),  # President Nixon funeral
    date(2001, 9, 11),
    date(2001, 9, 12),
    date(2001, 9, 13),
    date(2001, 9, 14),
    date(2004, 6, 11),  # President Reagan funeral
    date(2007, 1, 2),  # President Ford funeral
    date(2012, 10, 29),  # Hurricane Sandy
    date(2012, 10, 30),
    date(2018, 12, 5),  # President George H.W. Bush funeral
    date(2025, 1, 9),  # President Carter funeral
}


@lru_cache(maxsize=32)
def _holiday_dates(year: int) -> frozenset[date]:
    calendar = USEquityMarketHolidayCalendar()
    holidays = calendar.holidays(
        start=f"{year - 1}-12-20",
        end=f"{year + 1}-01-10",
    )
    return frozenset(value.date() for value in holidays)


def is_us_equity_market_session(value: date) -> bool:
    return (
        value.weekday() < 5
        and value not in _holiday_dates(value.year)
        and value not in EXCEPTIONAL_CLOSURES
    )


def previous_us_equity_market_session(
    as_of: datetime | date | None = None,
) -> date:
    if as_of is None:
        local_date = datetime.now(timezone.utc).astimezone(EASTERN).date()
    elif isinstance(as_of, datetime):
        if as_of.tzinfo is None:
            raise ValueError("as_of datetime must include a timezone")
        local_date = as_of.astimezone(EASTERN).date()
    else:
        local_date = as_of

    candidate = local_date - timedelta(days=1)
    for _ in range(20):
        if is_us_equity_market_session(candidate):
            return candidate
        candidate -= timedelta(days=1)
    raise RuntimeError("Unable to resolve the previous U.S. equity market session.")
