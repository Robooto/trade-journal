from typing import Optional

from fastapi import APIRouter, Query

from app.schema import ChartResponse
from app.services.charts_service import get_chart_history

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