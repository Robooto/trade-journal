from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable, Optional
from urllib.parse import urlencode

from app.schemas.charts import (
    AnalysisWindow,
    Bar,
    CatalystContext,
    ChartFeatures,
    EquityAnalysisPackageV1,
    PortfolioExposure,
    SourceStatus,
    SpotGammaContext,
    VolatilitySnapshot,
    VolatilityTermPoint,
)


ANALYSIS_PROFILE = """Analyze this single-stock options setup using the supplied data.

Start with a data-quality check and say what is missing. Decide whether there is
an actionable setup before proposing a trade.

Evaluate:
- price trend, range, and important chart locations;
- implied volatility, IV rank, IV percentile, and term structure;
- earnings or other catalyst risk when known;
- SpotGamma levels only when structured SpotGamma fields are supplied;
- current portfolio exposure when supplied;
- whether premium is actually worth selling.

Match structure to regime:
- Favor credit structures only when volatility and the price/gamma setup support
  selling premium.
- Consider calendars, diagonals, debit spreads, or other defined-risk positive-
  vega structures when volatility is low or term structure supports them.
- Consider iron condors or flies only when a range or pinning thesis is supported.
- Prefer defined risk around catalysts, uncertain gamma, or incomplete data.
- Do not recommend naked calls. Recommend short puts or jade lizards only when
  assignment is explicitly acceptable and the data supports premium selling.

Do not invent SpotGamma levels, earnings dates, option strikes, deltas, credits,
or liquidity. Without a current option chain, recommend strategy families and
selection criteria rather than exact contracts.

Return:
1. Data quality and missing inputs
2. Regime classification
3. Price and volatility interpretation
4. Trade/no-trade verdict
5. Up to three ranked strategy families with rationale, invalidation, and the
   additional option-chain data needed for exact construction
6. What would change the verdict"""


def build_equity_hub_url(symbol: str, as_of_date: str) -> str:
    query = urlencode({
        "sym": symbol.upper(),
        "date": as_of_date,
        "eh-model": "synthoi",
    })
    return f"https://dashboard.spotgamma.com/equityhub?{query}"


def percent(value: Any) -> Optional[float]:
    number = number_or_none(value)
    return round(number * 100, 2) if number is not None else None


def number_or_none(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def tasty_dict(value: Any) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        return value.model_dump(by_alias=True, exclude_none=True)
    return dict(value) if isinstance(value, dict) else {}


def normalize_market(raw: Any) -> dict[str, Any]:
    item = tasty_dict(raw)
    aliases = {
        "symbol": ("symbol",),
        "mark": ("mark",),
        "open": ("open",),
        "close": ("close",),
        "last": ("last", "last-price"),
        "bid": ("bid",),
        "ask": ("ask",),
        "day_high": ("day-high-price", "high"),
        "day_low": ("day-low-price", "low"),
        "year_high": ("year-high-price",),
        "year_low": ("year-low-price",),
        "beta": ("beta",),
        "dividend_yield": ("dividend-yield",),
    }
    normalized: dict[str, Any] = {}
    for target, keys in aliases.items():
        value = next((item.get(key) for key in keys if item.get(key) is not None), None)
        if target == "symbol":
            if value:
                normalized[target] = str(value)
        else:
            parsed = number_or_none(value)
            if parsed is not None:
                normalized[target] = parsed
    return normalized


def normalize_volatility(raw: Any) -> VolatilitySnapshot:
    item = tasty_dict(raw)
    term = []
    for point in item.get("option-expiration-implied-volatilities", []) or []:
        term.append(VolatilityTermPoint(
            expiration_date=str(point.get("expiration-date", "")),
            implied_volatility_percent=percent(point.get("implied-volatility")),
            option_chain_type=point.get("option-chain-type"),
            settlement_type=point.get("settlement-type"),
        ))
    return VolatilitySnapshot(
        current_iv_percent=percent(item.get("implied-volatility-index")),
        iv_15_day_percent=percent(item.get("implied-volatility-index-15-day")),
        iv_rank_percent=percent(item.get("implied-volatility-index-rank")),
        iv_percentile_percent=percent(item.get("implied-volatility-percentile")),
        iv_5_day_change_percent=percent(item.get("implied-volatility-index-5-day-change")),
        corr_spy_3_month=number_or_none(item.get("corr-spy-3month")),
        liquidity_rating=number_or_none(item.get("liquidity-rating")),
        term_structure=term,
    )


def summarize_bars(bars: list[Bar]) -> ChartFeatures:
    if not bars:
        return ChartFeatures()
    first_close = bars[0].close
    last_close = bars[-1].close
    change_percent = None
    if first_close:
        change_percent = round((last_close / first_close - 1) * 100, 2)
    volumes = [bar.volume for bar in bars if bar.volume is not None]
    return ChartFeatures(
        bar_count=len(bars),
        first_close=first_close,
        last_close=last_close,
        change_percent=change_percent,
        window_high=max(bar.high for bar in bars),
        window_low=min(bar.low for bar in bars),
        average_volume=round(sum(volumes) / len(volumes), 2) if volumes else None,
    )


def find_portfolio_exposure(accounts: Iterable[dict], symbol: str) -> PortfolioExposure:
    symbol = symbol.upper()
    accounts = list(accounts)
    matches = []
    for account in accounts:
        for group in account.get("groups", []) or account.get("positions", []) or []:
            underlying = str(
                group.get("underlying_symbol")
                or group.get("underlying-symbol")
                or ""
            ).upper()
            if underlying == symbol:
                matches.append(group)
    percent_used_values = [
        number_or_none(account.get("percent_used_bp"))
        for account in accounts
        if number_or_none(account.get("percent_used_bp")) is not None
    ]
    account_percent_used_bp = (
        round(max(percent_used_values), 2) if percent_used_values else None
    )
    if not matches:
        return PortfolioExposure(
            status="ok",
            account_percent_used_bp=account_percent_used_bp,
            notes=["No matching open option groups found."],
        )

    buying_power = sum(
        number_or_none(
            group.get("buying_power_effect_dollars")
            or group.get("buying-power-effect-dollars")
            or group.get("buying_power_effect")
            or group.get("buying-power-effect")
        ) or 0
        for group in matches
    )
    beta_delta = sum(
        number_or_none(group.get("beta_delta") or group.get("beta-delta")) or 0
        for group in matches
    )
    return PortfolioExposure(
        status="ok",
        matching_groups=len(matches),
        buying_power_effect=round(buying_power, 2),
        beta_delta=round(beta_delta, 2),
        account_percent_used_bp=account_percent_used_bp,
        notes=["Existing exposure should be considered before adding correlated risk."],
    )


def create_package(
    *,
    symbol: str,
    as_of_date: str,
    resolution: str,
    from_ts: int,
    to_ts: int,
    bars: list[Bar],
    market: Optional[dict[str, Any]],
    volatility: Optional[VolatilitySnapshot],
    portfolio_exposure: PortfolioExposure,
    spotgamma: Optional[SpotGammaContext],
    source_status: list[SourceStatus],
    warnings: list[str],
) -> EquityAnalysisPackageV1:
    equity_hub_url = build_equity_hub_url(symbol, as_of_date)
    if spotgamma is not None:
        spotgamma.equity_hub_url = equity_hub_url
    return EquityAnalysisPackageV1(
        analysis_instructions=ANALYSIS_PROFILE,
        generated_at=datetime.now(timezone.utc),
        symbol=symbol.upper(),
        as_of_date=as_of_date,
        window=AnalysisWindow(
            resolution=resolution,
            from_ts=from_ts,
            to_ts=to_ts,
        ),
        equity_hub_url=equity_hub_url,
        market=market,
        volatility=volatility,
        chart_features=summarize_bars(bars),
        chart_bars=bars,
        spotgamma=spotgamma or SpotGammaContext(equity_hub_url=equity_hub_url),
        catalysts=CatalystContext(),
        portfolio_exposure=portfolio_exposure,
        source_status=source_status,
        warnings=warnings,
    )


def render_markdown(package: EquityAnalysisPackageV1) -> str:
    data = package.model_dump(mode="json", exclude_none=True)
    data.pop("analysis_instructions", None)
    lines = [
        f"# Equity Analysis Handoff - {package.symbol}",
        "",
        f"- Package: `{package.schema_version}`",
        f"- Analysis profile: `{package.analysis_profile}`",
        f"- Generated: {package.generated_at.isoformat()}",
        f"- As of: {package.as_of_date}",
        f"- SpotGamma Equity Hub: {package.equity_hub_url}",
        "",
        "## Analysis Instructions",
        "",
        package.analysis_instructions,
        "",
        "## Data Package",
        "",
        "```json",
    ]
    import json

    lines.append(json.dumps(data, indent=2))
    lines.extend(["```", ""])
    return "\n".join(lines)
