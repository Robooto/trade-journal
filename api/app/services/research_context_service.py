from datetime import datetime
from typing import Iterable, Mapping, Sequence

from app.schemas.brokerage import (
    AssetClass,
    DataStatus,
    EarningsContextV1,
    ExposureContextV1,
    HoldingSnapshotV1,
    PriceContextV1,
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


def _as_dict(value) -> dict:
    if hasattr(value, "to_tasty_dict"):
        return value.to_tasty_dict()
    if isinstance(value, Mapping):
        return dict(value)
    raise TypeError(f"Unsupported broker value: {type(value)!r}")


def _number(value) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _percent(value) -> float | None:
    number = _number(value)
    return round(number * 100, 2) if number is not None else None


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
        watchlist = _as_dict(value)
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
        for item in map(_as_dict, market_data)
        if item.get("symbol")
    }
    volatility_map = {
        str(item.get("symbol") or "").upper(): item
        for item in map(_as_dict, volatility_metrics)
        if item.get("symbol")
    }
    exposure_map = _exposure_by_symbol(holding_snapshot)
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
        earnings = earnings_map.get(
            symbol,
            EarningsContextV1(
                status="unavailable",
                detail="Upcoming earnings date has not been verified.",
            ),
        )

        mark = _number(market.get("mark")) if market else None
        previous_close = _number(market.get("close")) if market else None
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
                    iv_index_percent=_percent(
                        volatility.get("implied-volatility-index")
                    ) if volatility else None,
                    iv_rank_percent=_percent(
                        volatility.get("implied-volatility-index-rank")
                    ) if volatility else None,
                    iv_percentile_percent=_percent(
                        volatility.get("implied-volatility-percentile")
                    ) if volatility else None,
                    iv_index_5_day_change_percent=_percent(
                        volatility.get(
                            "implied-volatility-index-5-day-change"
                        )
                    ) if volatility else None,
                    liquidity_rating=_number(
                        volatility.get("liquidity-rating")
                    ) if volatility else None,
                    as_of=fetched_at if volatility else None,
                ),
                earnings=earnings,
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
