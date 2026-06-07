from datetime import datetime, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app import tastytrade
from app.db import get_db
from app.schemas.charts import (
    ChartResponse,
    EquityAnalysisPackageV1,
    PortfolioExposure,
    SourceStatus,
    SpotGammaContext,
)
from app.services.charts_service import get_chart_history
from app.services.equity_analysis_service import (
    create_package,
    find_portfolio_exposure,
    normalize_market,
    normalize_volatility,
    render_markdown,
)
from app.routers.v1.trades import _load_positions_data

router = APIRouter(
    prefix="/v1/charts",
    tags=["v1 – charts"]
)


@router.get("/history/{symbol}", response_model=ChartResponse)
async def get_symbol_history(
    symbol: str,
    resolution: str = Query(default="1d", description="Chart resolution (1d, 1h, 5m, etc.)"),
    from_ts: Optional[int] = Query(default=None, description="Start timestamp (Unix)"),
    to_ts: Optional[int] = Query(default=None, description="End timestamp (Unix)")
) -> ChartResponse:
    """
    Get historical chart data for a symbol from Yahoo Finance API.
    Returns data in TradingView-compatible format.
    
    Parameters:
    - **symbol**: Stock symbol (e.g., AAPL, TSLA, SPY)
    - **resolution**: Chart resolution - 1m, 5m, 15m, 30m, 1h, 1d, 1wk, 1mo
    - **from_ts**: Start timestamp (Unix). Defaults to 30 days ago if not provided
    - **to_ts**: End timestamp (Unix). Defaults to now if not provided
    
    Returns chart data with status "ok" and array of bars containing:
    - time: timestamp in milliseconds
    - open, high, low, close: price data
    - volume: trading volume
    """
    return get_chart_history(symbol, resolution, from_ts, to_ts)


@router.get(
    "/analysis-package/{symbol}",
    response_model=EquityAnalysisPackageV1,
    response_model_exclude_none=True,
)
def get_equity_analysis_package(
    symbol: str,
    resolution: str = Query(default="1d"),
    from_ts: Optional[int] = Query(default=None),
    to_ts: Optional[int] = Query(default=None),
    format: Literal["json", "markdown"] = Query(default="json"),
    sg_spot: Optional[float] = Query(default=None),
    sg_lvp: Optional[float] = Query(default=None),
    sg_hvp: Optional[float] = Query(default=None),
    sg_call_gamma: Optional[float] = Query(default=None),
    sg_put_gamma: Optional[float] = Query(default=None),
    sg_top_gamma_expiration: Optional[str] = Query(default=None),
    sg_gamma_strike: Optional[list[float]] = Query(default=None),
    sg_notes: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    """Build one versioned, LLM-friendly package for single-stock analysis."""
    symbol = symbol.strip().upper()
    now = datetime.now()
    resolved_to = to_ts or int(now.timestamp())
    resolved_from = from_ts or int((now - timedelta(days=60)).timestamp())
    as_of_date = datetime.fromtimestamp(resolved_to).date().isoformat()

    statuses = []
    warnings = []
    bars = []
    market = None
    volatility = None
    exposure = PortfolioExposure()

    try:
        bars = get_chart_history(
            symbol,
            resolution,
            resolved_from,
            resolved_to,
        ).bars
        statuses.append(SourceStatus(source="yahoo_chart", status="ok"))
    except Exception as exc:
        statuses.append(SourceStatus(
            source="yahoo_chart",
            status="unavailable",
            detail=str(getattr(exc, "detail", exc)),
        ))
        warnings.append("Chart history is unavailable; do not infer price structure.")

    token = None
    try:
        token = tastytrade.get_active_token(db)
    except Exception as exc:
        detail = str(exc)
        statuses.extend([
            SourceStatus(source="tastytrade_market", status="unavailable", detail=detail),
            SourceStatus(source="tastytrade_volatility", status="unavailable", detail=detail),
        ])
        warnings.append("Brokerage market and volatility context are unavailable.")

    if token is not None:
        try:
            market_items = tastytrade.fetch_market_data(token, [symbol], [], [], [])
            market_match = next(
                (
                    item for item in market_items
                    if normalize_market(item).get("symbol", "").upper() == symbol
                ),
                None,
            )
            if market_match is not None:
                market = normalize_market(market_match)
                statuses.append(SourceStatus(source="tastytrade_market", status="ok"))
            else:
                statuses.append(SourceStatus(
                    source="tastytrade_market",
                    status="unavailable",
                    detail="Symbol missing from broker response.",
                ))
                warnings.append("Current broker quote is unavailable.")
        except Exception as exc:
            statuses.append(SourceStatus(
                source="tastytrade_market",
                status="unavailable",
                detail=str(exc),
            ))
            warnings.append("Current broker quote is unavailable.")

        try:
            volatility_items = tastytrade.fetch_volatility_data(token, [symbol])
            volatility_match = next(
                (
                    item for item in volatility_items
                    if str(normalize_market(item).get("symbol", "")).upper() == symbol
                    or str(getattr(item, "symbol", "")).upper() == symbol
                    or (
                        isinstance(item, dict)
                        and str(item.get("symbol", "")).upper() == symbol
                    )
                ),
                None,
            )
            if volatility_match is not None:
                volatility = normalize_volatility(volatility_match)
                statuses.append(SourceStatus(source="tastytrade_volatility", status="ok"))
            else:
                statuses.append(SourceStatus(
                    source="tastytrade_volatility",
                    status="unavailable",
                    detail="Symbol missing from broker response.",
                ))
                warnings.append("Volatility and term-structure data are unavailable.")
        except Exception as exc:
            statuses.append(SourceStatus(
                source="tastytrade_volatility",
                status="unavailable",
                detail=str(exc),
            ))
            warnings.append("Volatility and term-structure data are unavailable.")

    try:
        exposure = find_portfolio_exposure(_load_positions_data(db), symbol)
        statuses.append(SourceStatus(source="portfolio_exposure", status="ok"))
    except Exception as exc:
        statuses.append(SourceStatus(
            source="portfolio_exposure",
            status="unavailable",
            detail=str(getattr(exc, "detail", exc)),
        ))
        warnings.append("Portfolio exposure is unavailable; position sizing cannot be assessed.")

    has_manual_spotgamma = any(value is not None for value in (
        sg_spot,
        sg_lvp,
        sg_hvp,
        sg_call_gamma,
        sg_put_gamma,
        sg_top_gamma_expiration,
        sg_notes,
    )) or bool(sg_gamma_strike)
    spotgamma = SpotGammaContext(
        source="manual" if has_manual_spotgamma else "unavailable",
        equity_hub_url="",
        spot=sg_spot,
        low_volatility_point=sg_lvp,
        high_volatility_point=sg_hvp,
        call_gamma_notional=sg_call_gamma,
        put_gamma_notional=sg_put_gamma,
        top_gamma_expiration=sg_top_gamma_expiration,
        major_gamma_strikes=sg_gamma_strike or [],
        notes=sg_notes,
    )
    if has_manual_spotgamma:
        statuses.append(SourceStatus(
            source="spotgamma_equity_hub",
            status="ok",
            detail="Structured values were supplied manually.",
        ))
    else:
        statuses.append(SourceStatus(
            source="spotgamma_equity_hub",
            status="partial",
            detail="Deep link supplied; structured gamma values have not been captured.",
        ))
        warnings.append(
            "SpotGamma values are unavailable. Open the Equity Hub link and supply "
            "structured levels before drawing gamma conclusions."
        )
    statuses.append(SourceStatus(
        source="catalysts",
        status="unavailable",
        detail="Earnings and event data are not yet supplied by this endpoint.",
    ))
    warnings.append(
        "Earnings and catalyst timing are unavailable; verify them before selecting a structure."
    )
    statuses.append(SourceStatus(
        source="option_chain",
        status="unavailable",
        detail="Current contracts, Greeks, quotes, and liquidity are not included.",
    ))
    warnings.append(
        "No option chain is included. Do not invent exact strikes, deltas, credits, or liquidity."
    )

    package = create_package(
        symbol=symbol,
        as_of_date=as_of_date,
        resolution=resolution,
        from_ts=resolved_from,
        to_ts=resolved_to,
        bars=bars,
        market=market,
        volatility=volatility,
        portfolio_exposure=exposure,
        spotgamma=spotgamma,
        source_status=statuses,
        warnings=warnings,
    )
    if format == "markdown":
        return PlainTextResponse(
            render_markdown(package),
            media_type="text/markdown",
        )
    return package
