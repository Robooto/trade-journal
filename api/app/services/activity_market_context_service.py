from collections.abc import Callable
from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

from app.schemas.brokerage import (
    BrokerActivityInboxV1,
    BrokerActivityMarketBarV1,
    BrokerActivityMarketContextV1,
    BrokerActivitySymbolContextV1,
    DataStatus,
)
from app.schemas.charts import ChartResponse
from app.services.charts_service import get_chart_history


NEW_YORK = ZoneInfo("America/New_York")
SESSION_OPEN = time(9, 30)
SESSION_CLOSE = time(16, 0)
MAX_MATCH_MINUTES = 15.0
BENCHMARK_SYMBOL = "SPY"
YAHOO_SYMBOLS = {
    "SPX": "^GSPC",
    "NDX": "^NDX",
    "RUT": "^RUT",
    "VIX": "^VIX",
}


ChartFetcher = Callable[[str, str, int, int], ChartResponse]


def enrich_activity_market_context(
    inbox: BrokerActivityInboxV1,
    *,
    chart_fetcher: ChartFetcher | None = None,
    benchmark_symbol: str = BENCHMARK_SYMBOL,
) -> BrokerActivityInboxV1:
    events_with_symbols = [
        event for event in inbox.events if event.underlying_symbol
    ]
    if not events_with_symbols:
        return inbox

    fetcher = chart_fetcher or get_chart_history
    symbols = {
        event.underlying_symbol.strip().upper()
        for event in events_with_symbols
        if event.underlying_symbol and event.underlying_symbol.strip()
    }
    benchmark_symbol = benchmark_symbol.strip().upper()
    symbols.add(benchmark_symbol)

    from_ts, to_ts = _session_window(inbox.session_date)
    bars_by_symbol = {}
    unavailable_symbols = set()
    for symbol in sorted(symbols):
        source_symbol = _source_symbol(symbol)
        try:
            response = fetcher(
                source_symbol,
                "5m",
                from_ts,
                to_ts,
            )
            bars = _session_bars(response, inbox.session_date)
            if bars:
                bars_by_symbol[symbol] = bars
            else:
                unavailable_symbols.add(symbol)
        except Exception:
            unavailable_symbols.add(symbol)

    for event in events_with_symbols:
        symbol = event.underlying_symbol.strip().upper()
        underlying = _symbol_context(
            symbol,
            event.occurred_at,
            bars_by_symbol.get(symbol, []),
            include_bars=True,
        )
        benchmark = _symbol_context(
            benchmark_symbol,
            event.occurred_at,
            bars_by_symbol.get(benchmark_symbol, []),
            include_bars=False,
        )
        warnings = list(dict.fromkeys([
            *underlying.warnings,
            *benchmark.warnings,
        ]))
        event.market_context = BrokerActivityMarketContextV1(
            underlying=underlying,
            benchmark=benchmark,
            warnings=warnings,
        )
        if symbol in unavailable_symbols:
            event.warnings = list(dict.fromkeys([
                *event.warnings,
                f"Entry-time price context is unavailable for {symbol}.",
            ]))

    return inbox


def _session_window(session_date: date) -> tuple[int, int]:
    start = datetime.combine(
        session_date,
        time(9, 25),
        tzinfo=NEW_YORK,
    )
    end = datetime.combine(
        session_date,
        time(16, 5),
        tzinfo=NEW_YORK,
    )
    return int(start.timestamp()), int(end.timestamp())


def _session_bars(
    response: ChartResponse,
    session_date: date,
):
    result = []
    for bar in response.bars:
        observed = datetime.fromtimestamp(
            bar.time / 1000,
            tz=timezone.utc,
        ).astimezone(NEW_YORK)
        if (
            observed.date() == session_date
            and SESSION_OPEN <= observed.time().replace(tzinfo=None) <= SESSION_CLOSE
        ):
            result.append(bar)
    return sorted(result, key=lambda bar: bar.time)


def _symbol_context(
    symbol: str,
    occurred_at: datetime,
    bars,
    *,
    include_bars: bool,
) -> BrokerActivitySymbolContextV1:
    source_symbol = _source_symbol(symbol)
    if not bars:
        return BrokerActivitySymbolContextV1(
            symbol=symbol,
            source_symbol=source_symbol,
            status=DataStatus.UNAVAILABLE,
            warnings=[
                f"Five-minute historical bars are unavailable for {symbol}."
            ],
        )

    session_open = float(bars[0].open)
    session_close = float(bars[-1].close)
    session_high = max(float(bar.high) for bar in bars)
    session_low = min(float(bar.low) for bar in bars)
    occurred_utc = _as_utc(occurred_at)
    nearest = min(
        bars,
        key=lambda bar: abs(
            (bar.time / 1000) - occurred_utc.timestamp()
        ),
    )
    nearest_at = datetime.fromtimestamp(
        nearest.time / 1000,
        tz=timezone.utc,
    )
    difference_minutes = abs(
        (nearest_at - occurred_utc).total_seconds()
    ) / 60
    matched = difference_minutes <= MAX_MATCH_MINUTES
    activity_price = float(nearest.close) if matched else None
    match_quality = "nearest_5m_close" if matched else "session_only"
    warnings = []
    if matched:
        warnings.append(
            f"{symbol} activity price is estimated from the nearest "
            "five-minute bar close."
        )
    else:
        warnings.append(
            f"No {symbol} five-minute bar was within "
            f"{MAX_MATCH_MINUTES:.0f} minutes of the activity."
        )

    return BrokerActivitySymbolContextV1(
        symbol=symbol,
        source_symbol=source_symbol,
        status=DataStatus.PARTIAL,
        activity_price=_round(activity_price),
        matched_at=nearest_at if matched else None,
        match_quality=match_quality,
        minutes_from_activity=(
            round(difference_minutes, 2) if matched else None
        ),
        session_open=_round(session_open),
        session_high=_round(session_high),
        session_low=_round(session_low),
        session_close=_round(session_close),
        session_change_percent=_percent_change(
            session_close,
            session_open,
        ),
        activity_from_open_percent=(
            _percent_change(activity_price, session_open)
            if activity_price is not None
            else None
        ),
        bars=(
            [
                BrokerActivityMarketBarV1(**bar.model_dump())
                for bar in bars
            ]
            if include_bars
            else []
        ),
        warnings=warnings,
    )


def _source_symbol(symbol: str) -> str:
    return YAHOO_SYMBOLS.get(symbol, symbol)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _percent_change(value: float, base: float) -> float | None:
    if not base:
        return None
    return round(((value - base) / base) * 100, 3)


def _round(value: float | None) -> float | None:
    return round(value, 4) if value is not None else None
