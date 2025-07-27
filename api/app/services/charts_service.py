import logging
from datetime import datetime, timedelta
from typing import List, Optional

import pandas as pd
import yfinance as yf
from fastapi import HTTPException

from app.schema import Bar, ChartResponse
from app.services.cache_service import get_cache, create_cache_key

logger = logging.getLogger(__name__)


def get_chart_history(
    symbol: str,
    resolution: str = "1d",
    from_ts: Optional[int] = None,
    to_ts: Optional[int] = None
) -> ChartResponse:
    """
    Fetch historical chart data for a symbol using yfinance library.
    Returns data in TradingView-compatible format.
    
    Args:
        symbol: Stock symbol (e.g., 'AAPL', 'TSLA', 'SPX')
        resolution: Chart resolution (1d, 1h, 5m, etc.)
        from_ts: Start timestamp (Unix), defaults to 30 days ago
        to_ts: End timestamp (Unix), defaults to now
        
    Returns:
        ChartResponse with status and bars data
        
    Raises:
        HTTPException: For API errors or invalid data
    """
    # Set default timestamps if not provided
    now = datetime.now()
    if to_ts is None:
        to_ts = int(now.timestamp())
    if from_ts is None:
        from_ts = int((now - timedelta(days=30)).timestamp())
    
    # Check cache first
    cache = get_cache()
    cache_key = create_cache_key(symbol.upper(), resolution, from_ts, to_ts)
    
    cached_response = cache.get(cache_key)
    if cached_response is not None:
        logger.info(f"Returning cached data for {symbol}")
        return cached_response
    
    try:
        # Convert timestamps to datetime objects for yfinance
        start_date = datetime.fromtimestamp(from_ts)
        end_date = datetime.fromtimestamp(to_ts)
        
        # Map resolution to yfinance interval format
        interval_map = {
            "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
            "1h": "1h", "1d": "1d", "1wk": "1wk", "1mo": "1mo"
        }
        yf_interval = interval_map.get(resolution, "1d")
        
        logger.info(f"Fetching {symbol} data from {start_date.date()} to {end_date.date()} with {yf_interval} interval")
        
        # Create ticker object and fetch data
        ticker = yf.Ticker(symbol.upper())
        
        # Fetch historical data
        hist_data = ticker.history(
            start=start_date,
            end=end_date,
            interval=yf_interval,
            auto_adjust=True,  # Adjust for splits and dividends
            prepost=False,  # Don't include pre/post market data
            actions=False   # Don't include dividend/split actions for cleaner data
        )
        
        # Check if data was returned
        if hist_data.empty:
            logger.warning(f"No data found for symbol {symbol}")
            raise HTTPException(
                status_code=404,
                detail=f"No data found for symbol '{symbol}'. Please check the symbol and try again."
            )
        
        # Build bars from DataFrame
        bars = _build_bars_from_dataframe(hist_data)
        
        # Create response
        chart_response = ChartResponse(s="ok", bars=bars)
        
        # Cache the response (TTL varies by resolution for optimal caching)
        cache_ttl = _get_cache_ttl(resolution)
        cache.set(cache_key, chart_response, ttl=cache_ttl)
        
        logger.info(f"Successfully retrieved and cached {len(bars)} bars for {symbol}")
        return chart_response
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error fetching chart data for {symbol}: {str(e)}")
        
        # Handle specific yfinance/Yahoo Finance errors
        if "No data found" in str(e) or "404" in str(e):
            raise HTTPException(
                status_code=404,
                detail=f"Symbol '{symbol}' not found. Please check the symbol and try again."
            )
        elif "Too Many Requests" in str(e) or "429" in str(e):
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please wait a moment and try again."
            )
        else:
            raise HTTPException(
                status_code=500,
                detail="Failed to fetch chart data. Please try again later."
            )


def _build_bars_from_dataframe(df) -> List[Bar]:
    """
    Build list of Bar objects from yfinance pandas DataFrame.
    
    Args:
        df: Pandas DataFrame from yfinance with OHLCV data
        
    Returns:
        List of Bar objects with valid data
    """
    bars = []
    
    for index, row in df.iterrows():
        # Skip rows with null values in OHLC data
        if (pd.isna(row['Open']) or pd.isna(row['High']) or 
            pd.isna(row['Low']) or pd.isna(row['Close'])):
            continue
            
        # Convert timestamp to milliseconds for TradingView
        timestamp_ms = int(index.timestamp() * 1000)
        
        bar = Bar(
            time=timestamp_ms,
            open=float(row['Open']),
            high=float(row['High']),
            low=float(row['Low']),
            close=float(row['Close']),
            volume=int(row['Volume']) if not pd.isna(row['Volume']) else 0
        )
        bars.append(bar)
    
    return bars


def _get_cache_ttl(resolution: str) -> int:
    """
    Get appropriate cache TTL based on resolution.
    Higher frequency data gets shorter cache time.
    
    Args:
        resolution: Chart resolution
        
    Returns:
        Cache TTL in seconds
    """
    ttl_map = {
        "1m": 60,        # 1 minute
        "5m": 300,       # 5 minutes
        "15m": 600,      # 10 minutes
        "30m": 1200,     # 20 minutes
        "1h": 1800,      # 30 minutes
        "1d": 3600,      # 1 hour
        "1wk": 7200,     # 2 hours
        "1mo": 14400,    # 4 hours
    }
    return ttl_map.get(resolution, 1800)  # Default 30 minutes