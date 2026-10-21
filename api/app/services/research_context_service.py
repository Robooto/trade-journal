from datetime import date, datetime
from collections.abc import Iterable, Mapping, Sequence
from zoneinfo import ZoneInfo

from app.schemas.brokerage import (
    AssetClass,
    DataStatus,
    EarningsContextV1,
    ExposureContextV1,
    HoldingSnapshotV1,
    PriceContextV1,
    ProfileContextV1,
    ResearchSymbolContextV1,
    ResearchSymbolItemV1,
    SourceMetadataV1,
    VolatilityContextV1,
    WatchlistMembershipV1,
)
from app.tastytrade_schema import (
    TastyMarketData,
    TastyVolatilityMetric,
    TastyWatchlist,
)
from app.services.values import fraction_to_percent, tasty_dict, to_float


_MARKET_TIMEZONE = ZoneInfo("America/New_York")
_EARNINGS_TIMES = {"AMC": "after_close", "BMO": "before_open"}
_UNVERIFIED_EARNINGS = EarningsContextV1(
    status="unavailable",
    detail="Upcoming earnings date has not been verified.",
)


def _normalize_symbols(symbols: Sequence[str]) -> list[str]:
    return list(dict.fromkeys(
        symbol.strip().upper() for symbol in symbols if symbol.strip()
    ))


def _source(
    endpoint: str,
    fetched_at: datetime,
    *,
    available: bool,
    missing_fields: list[str] | None = None,
) -> SourceMetadataV1:
    missing_fields = missing_fields or []
    if not available:
        status = DataStatus.UNAVAILABLE
    elif missing_fields:
        status = DataStatus.PARTIAL
    else:
        status = DataStatus.OK
    return SourceMetadataV1(
        source="tastytrade",
        endpoint=endpoint,
        fetched_at=fetched_at,
        status=status,
        missing_fields=missing_fields,
    )


def _watchlist_memberships(
    watchlists: Iterable[TastyWatchlist | Mapping],
) -> dict[str, list[WatchlistMembershipV1]]:
    memberships: dict[str, list[WatchlistMembershipV1]] = {}
    for value in watchlists:
        watchlist = tasty_dict(value)
        name = str(watchlist.get("name") or "")
        group_name = watchlist.get("group-name")
        for entry in watchlist.get("watchlist-entries", []) or []:
            symbol = str(entry.get("symbol") or "").strip().upper()
            if not symbol:
                continue
            memberships.setdefault(symbol, []).append(
                WatchlistMembershipV1(
                    name=name,
                    group_name=group_name,
                    source="private",
                )
            )
    return memberships


def _exposure_by_symbol(
    snapshot: HoldingSnapshotV1,
) -> dict[str, ExposureContextV1]:
    raw: dict[str, dict] = {}
    for account in snapshot.accounts:
        for holding in account.holdings:
            symbol = holding.underlying_symbol.upper()
            item = raw.setdefault(
                symbol,
                {
                    "account_numbers": set(),
                    "asset_classes": set(),
                    "net_underlying_quantity": 0.0,
                    "has_equity": False,
                    "option_position_count": 0,
                },
            )
            item["account_numbers"].add(account.account_number)
            item["asset_classes"].add(holding.asset_class)
            if holding.asset_class == AssetClass.EQUITY:
                item["net_underlying_quantity"] += holding.signed_quantity
                item["has_equity"] = True
            elif holding.asset_class in {
                AssetClass.EQUITY_OPTION,
                AssetClass.FUTURE_OPTION,
            }:
                item["option_position_count"] += 1

    return {
        symbol: ExposureContextV1(
            is_held=True,
            account_numbers=sorted(item["account_numbers"]),
            asset_classes=sorted(
                item["asset_classes"], key=lambda value: value.value
            ),
            net_underlying_quantity=(
                round(item["net_underlying_quantity"], 4)
                if item["has_equity"]
                else None
            ),
            option_position_count=item["option_position_count"],
        )
        for symbol, item in raw.items()
    }

def _holding_source(
    snapshot: HoldingSnapshotV1,
) -> SourceMetadataV1:
    statuses = [source.status for source in snapshot.source_status]
    if statuses and all(
        status == DataStatus.UNAVAILABLE for status in statuses
    ):
        status = DataStatus.UNAVAILABLE
    elif any(status != DataStatus.OK for status in statuses):
        status = DataStatus.PARTIAL
    else:
        status = DataStatus.OK
    warnings = list(
        dict.fromkeys(
            warning
            for source in snapshot.source_status
            for warning in source.warnings
        )
    )
    missing_fields = list(
        dict.fromkeys(
            field
            for source in snapshot.source_status
            for field in source.missing_fields
        )
    )
    return SourceMetadataV1(
        source="trade-journal",
        endpoint="/brokerage/holding-snapshot",
        fetched_at=snapshot.generated_at,
        status=status,
        missing_fields=missing_fields,
        warnings=warnings,
    )


def _date_or_none(value) -> date | None:
    try:
        return date.fromisoformat(str(value)[:10]) if value else None
    except ValueError:
        return None


def _text_or_none(value) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text or None


def _metric_earnings(metric: Mapping, today: date) -> EarningsContextV1:
    """Use tastytrade's expected report date only when it is still ahead."""
    earnings = metric.get("earnings")
    if not isinstance(earnings, Mapping) or earnings.get("visible") is False:
        return _UNVERIFIED_EARNINGS.model_copy()
    report_date = _date_or_none(earnings.get("expected-report-date"))
    if report_date is None or report_date < today:
        return EarningsContextV1(
            status="unavailable",
            detail="tastytrade has no upcoming report date.",
        )
    time_of_day = _text_or_none(earnings.get("time-of-day"))
    return EarningsContextV1(
        status="estimated" if earnings.get("estimated") else "confirmed",
        earnings_date=report_date,
        earnings_time=_EARNINGS_TIMES.get(time_of_day or "", time_of_day),
        source="tastytrade /market-metrics",
    )


def _metric_profile(metric: Mapping) -> ProfileContextV1:
    # tastytrade fills non-payers with placeholder ex-dates (1970-01-01, or a
    # years-old date for SPX) and ETFs or indexes with a zero market cap.
    pays_dividend = bool(to_float(metric.get("dividend-rate-per-share")))
    market_cap = to_float(metric.get("market-cap"))
    # Cboe-listed indexes (SPX, VIX, XSP) have no shares to borrow.
    is_cboe_index = metric.get("listed-market") == "XCBO"
    return ProfileContextV1(
        sector=_text_or_none(metric.get("sector")),
        industry=_text_or_none(metric.get("industry")),
        market_cap=market_cap or None,
        beta=to_float(metric.get("beta")),
        dividend_yield_percent=fraction_to_percent(
            metric.get("dividend-yield")
        ),
        dividend_ex_date=(
            _date_or_none(metric.get("dividend-ex-date"))
            if pays_dividend
            else None
        ),
        lendability=(
            None
            if is_cboe_index
            else _text_or_none(metric.get("lendability"))
        ),
    )


def build_research_symbol_context(
    symbols: Sequence[str],
    *,
    watchlists: Iterable[TastyWatchlist | Mapping],
    market_data: Iterable[TastyMarketData | Mapping],
    volatility_metrics: Iterable[TastyVolatilityMetric | Mapping],
    holding_snapshot: HoldingSnapshotV1,
    fetched_at: datetime,
    earnings_by_symbol: Mapping[str, EarningsContextV1] | None = None,
) -> ResearchSymbolContextV1:
    requested = _normalize_symbols(symbols)
    watchlist_map = _watchlist_memberships(watchlists)
    market_map = {
        str(item.get("symbol") or "").upper(): item
        for item in map(tasty_dict, market_data)
        if item.get("symbol")
    }
    volatility_map = {
        str(item.get("symbol") or "").upper(): item
        for item in map(tasty_dict, volatility_metrics)
        if item.get("symbol")
    }
    exposure_map = _exposure_by_symbol(holding_snapshot)
    today = fetched_at.astimezone(_MARKET_TIMEZONE).date()
    holding_source = _holding_source(holding_snapshot)
    earnings_map = {
        symbol.upper(): value
        for symbol, value in (earnings_by_symbol or {}).items()
    }

    items: list[ResearchSymbolItemV1] = []
    missing_symbols: list[str] = []
    for symbol in requested:
        market = market_map.get(symbol)
        volatility = volatility_map.get(symbol)
        memberships = watchlist_map.get(symbol, [])
        exposure = exposure_map.get(symbol, ExposureContextV1())
        earnings = earnings_map.get(symbol) or (
            _metric_earnings(volatility, today)
            if volatility
            else _UNVERIFIED_EARNINGS.model_copy()
        )

        mark = to_float(market.get("mark")) if market else None
        previous_close = to_float(market.get("close")) if market else None
        day_change = None
        if mark is not None and previous_close:
            day_change = round((mark / previous_close - 1) * 100, 2)

        price_missing = []
        if market is not None and mark is None:
            price_missing.append("mark")
        metric_missing = []
        if volatility is not None:
            for field in (
                "implied-volatility-index",
                "implied-volatility-index-rank",
            ):
                if volatility.get(field) in (None, ""):
                    metric_missing.append(field)

        source_status = [
            _source(
                "/market-data/by-type",
                fetched_at,
                available=market is not None,
                missing_fields=price_missing,
            ),
            _source(
                "/market-metrics",
                fetched_at,
                available=volatility is not None,
                missing_fields=metric_missing,
            ),
            holding_source.model_copy(deep=True),
            _source("/watchlists", fetched_at, available=True),
        ]

        warnings = []
        if market is None:
            warnings.append("Current market data is unavailable.")
        if volatility is None:
            warnings.append("Current volatility metrics are unavailable.")
        if earnings.status == "unavailable":
            warnings.append("Upcoming earnings date is unavailable.")

        has_any_data = bool(
            market
            or volatility
            or memberships
            or exposure.is_held
            or earnings.status != "unavailable"
        )
        if not has_any_data:
            missing_symbols.append(symbol)

        items.append(
            ResearchSymbolItemV1(
                symbol=symbol,
                watchlists=memberships,
                price=PriceContextV1(
                    mark=mark,
                    previous_close=previous_close,
                    day_change_percent=day_change,
                    as_of=fetched_at if market else None,
                ),
                volatility=VolatilityContextV1(
                    iv_index_percent=fraction_to_percent(
                        volatility.get("implied-volatility-index")
                    ) if volatility else None,
                    iv_rank_percent=fraction_to_percent(
                        volatility.get("implied-volatility-index-rank")
                    ) if volatility else None,
                    iv_percentile_percent=fraction_to_percent(
                        volatility.get("implied-volatility-percentile")
                    ) if volatility else None,
                    iv_index_5_day_change_percent=fraction_to_percent(
                        volatility.get(
                            "implied-volatility-index-5-day-change"
                        )
                    ) if volatility else None,
                    iv_rank_source=_text_or_none(
                        volatility.get("implied-volatility-index-rank-source")
                    ) if volatility else None,
                    iv_index_15_day_percent=fraction_to_percent(
                        volatility.get("implied-volatility-index-15-day")
                    ) if volatility else None,
                    # tastytrade already reports these four in percentage points.
                    iv_30_day_percent=to_float(
                        volatility.get("implied-volatility-30-day")
                    ) if volatility else None,
                    hv_30_day_percent=to_float(
                        volatility.get("historical-volatility-30-day")
                    ) if volatility else None,
                    hv_60_day_percent=to_float(
                        volatility.get("historical-volatility-60-day")
                    ) if volatility else None,
                    hv_90_day_percent=to_float(
                        volatility.get("historical-volatility-90-day")
                    ) if volatility else None,
                    iv_hv_30_day_difference_points=to_float(
                        volatility.get("iv-hv-30-day-difference")
                    ) if volatility else None,
                    liquidity_rating=to_float(
                        volatility.get("liquidity-rating")
                    ) if volatility else None,
                    liquidity_rank=to_float(
                        volatility.get("liquidity-rank")
                    ) if volatility else None,
                    as_of=fetched_at if volatility else None,
                ),
                earnings=earnings,
                profile=(
                    _metric_profile(volatility)
                    if volatility
                    else ProfileContextV1()
                ),
                exposure=exposure,
                source_status=source_status,
                warnings=warnings,
            )
        )

    market_missing = [
        f"symbols.{symbol}" for symbol in requested if symbol not in market_map
    ]
    volatility_missing = [
        f"symbols.{symbol}"
        for symbol in requested
        if symbol not in volatility_map
    ]
    return ResearchSymbolContextV1(
        generated_at=fetched_at,
        requested_symbols=requested,
        items=items,
        missing_symbols=missing_symbols,
        source_status=[
            _source("/watchlists", fetched_at, available=True),
            _source(
                "/market-data/by-type",
                fetched_at,
                available=bool(market_map),
                missing_fields=market_missing,
            ),
            _source(
                "/market-metrics",
                fetched_at,
                available=bool(volatility_map),
                missing_fields=volatility_missing,
            ),
            holding_source,
        ],
    )
