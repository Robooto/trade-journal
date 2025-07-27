import pytest
from unittest.mock import patch, MagicMock
import pandas as pd
import numpy as np
from datetime import datetime, timedelta


# Sample yfinance DataFrame response
sample_yfinance_data = pd.DataFrame({
    'Open': [100.0, 101.0, 102.0],
    'High': [105.0, 106.0, 107.0],
    'Low': [99.0, 100.0, 101.0],
    'Close': [103.0, 104.0, 105.0],
    'Volume': [1000000, 1100000, 1200000]
}, index=pd.DatetimeIndex([
    datetime(2022, 1, 1, 9, 30),
    datetime(2022, 1, 2, 9, 30),
    datetime(2022, 1, 3, 9, 30)
], name='Datetime'))

# Sample DataFrame with null values in OHLC
sample_yfinance_data_with_nulls = pd.DataFrame({
    'Open': [100.0, np.nan, 102.0],
    'High': [105.0, np.nan, 107.0],
    'Low': [99.0, np.nan, 101.0],
    'Close': [103.0, np.nan, 105.0],
    'Volume': [1000000, 1100000, 1200000]
}, index=pd.DatetimeIndex([
    datetime(2022, 1, 1, 9, 30),
    datetime(2022, 1, 2, 9, 30),
    datetime(2022, 1, 3, 9, 30)
], name='Datetime'))

# Empty DataFrame
empty_yfinance_data = pd.DataFrame()


@pytest.mark.asyncio
async def test_get_chart_history_success(client):
    """Test successful chart data retrieval with yfinance"""
    with patch('app.services.charts_service.yf.Ticker') as mock_ticker_class:
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = sample_yfinance_data
        mock_ticker_class.return_value = mock_ticker
        
        resp = await client.get("/v1/charts/history/AAPL")
        
        assert resp.status_code == 200
        data = resp.json()
        assert data["s"] == "ok"
        assert len(data["bars"]) == 3
        
        # Check first bar
        first_bar = data["bars"][0]
        assert first_bar["open"] == 100.0
        assert first_bar["high"] == 105.0
        assert first_bar["low"] == 99.0
        assert first_bar["close"] == 103.0
        assert first_bar["volume"] == 1000000
        
        # Verify yfinance was called correctly
        mock_ticker_class.assert_called_once_with('AAPL')
        mock_ticker.history.assert_called_once()


@pytest.mark.asyncio
async def test_get_chart_history_with_params(client):
    """Test chart data with custom parameters"""
    with patch('app.services.charts_service.yf.Ticker') as mock_ticker_class:
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = sample_yfinance_data
        mock_ticker_class.return_value = mock_ticker
        
        # Test with custom resolution and timestamps
        resp = await client.get(
            "/v1/charts/history/TSLA?resolution=1h&from_ts=1640995200&to_ts=1641168000"
        )
        
        assert resp.status_code == 200
        data = resp.json()
        assert data["s"] == "ok"
        
        # Verify the service was called with correct parameters
        mock_ticker_class.assert_called_once_with('TSLA')
        call_kwargs = mock_ticker.history.call_args[1]
        assert call_kwargs["interval"] == "1h"
        assert call_kwargs["auto_adjust"] is True
        assert call_kwargs["prepost"] is False
        assert call_kwargs["actions"] is False


@pytest.mark.asyncio
async def test_get_chart_history_default_timestamps(client):
    """Test that default timestamps are set correctly"""
    with patch('app.services.charts_service.yf.Ticker') as mock_ticker_class:
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = sample_yfinance_data
        mock_ticker_class.return_value = mock_ticker
        
        with patch('app.services.charts_service.datetime') as mock_datetime:
            # Mock current time
            mock_now = datetime(2024, 1, 15, 10, 0, 0)
            mock_datetime.now.return_value = mock_now
            mock_datetime.fromtimestamp.side_effect = datetime.fromtimestamp
            
            resp = await client.get("/v1/charts/history/SPY")
            
            assert resp.status_code == 200
            
            # Check that default timestamps were used (30 days ago to now)
            call_kwargs = mock_ticker.history.call_args[1]
            expected_end = mock_now
            expected_start = mock_now - timedelta(days=30)
            
            assert call_kwargs["end"] == expected_end
            assert call_kwargs["start"] == expected_start


@pytest.mark.asyncio
async def test_get_chart_history_filters_null_values(client):
    """Test that bars with null values are filtered out"""
    with patch('app.services.charts_service.yf.Ticker') as mock_ticker_class:
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = sample_yfinance_data_with_nulls
        mock_ticker_class.return_value = mock_ticker
        
        # Clear cache to ensure fresh request
        with patch('app.services.charts_service.get_cache') as mock_cache:
            mock_cache_obj = MagicMock()
            mock_cache_obj.get.return_value = None
            mock_cache.return_value = mock_cache_obj
            
            resp = await client.get("/v1/charts/history/AAPL")
            
            assert resp.status_code == 200
            data = resp.json()
            assert data["s"] == "ok"
            # Should only have 2 bars (first and third), middle one filtered out due to nulls
            assert len(data["bars"]) == 2
            
            # Check that returned bars have the correct values
            assert data["bars"][0]["open"] == 100.0
            assert data["bars"][1]["open"] == 102.0


@pytest.mark.asyncio
async def test_get_chart_history_empty_response(client):
    """Test handling of empty yfinance response"""
    with patch('app.services.charts_service.yf.Ticker') as mock_ticker_class:
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = empty_yfinance_data
        mock_ticker_class.return_value = mock_ticker
        
        resp = await client.get("/v1/charts/history/NOSYMBOL")
        
        assert resp.status_code == 404
        data = resp.json()
        assert "No data found for symbol" in data["detail"]


@pytest.mark.asyncio
async def test_get_chart_history_yfinance_error(client):
    """Test handling of yfinance exceptions"""
    with patch('app.services.charts_service.yf.Ticker') as mock_ticker_class:
        mock_ticker = MagicMock()
        mock_ticker.history.side_effect = Exception("yfinance error")
        mock_ticker_class.return_value = mock_ticker
        
        resp = await client.get("/v1/charts/history/INVALID")
        
        assert resp.status_code == 500
        data = resp.json()
        assert "Failed to fetch chart data" in data["detail"]


@pytest.mark.asyncio
async def test_get_chart_history_resolution_mapping(client):
    """Test that resolutions are mapped correctly to yfinance intervals"""
    test_cases = [
        ("5m", "5m"),
        ("15m", "15m"),
        ("30m", "30m"),
        ("1h", "1h"),
        ("1d", "1d"),
        ("1wk", "1wk"),
    ]
    
    for input_resolution, expected_interval in test_cases:
        with patch('app.services.charts_service.yf.Ticker') as mock_ticker_class:
            mock_ticker = MagicMock()
            mock_ticker.history.return_value = sample_yfinance_data
            mock_ticker_class.return_value = mock_ticker
            
            # Clear cache between test iterations to avoid cached responses
            with patch('app.services.charts_service.get_cache') as mock_cache:
                mock_cache_obj = MagicMock()
                mock_cache_obj.get.return_value = None
                mock_cache.return_value = mock_cache_obj
                
                resp = await client.get(f"/v1/charts/history/AAPL?resolution={input_resolution}")
                
                assert resp.status_code == 200
                # Verify yfinance was called correctly
                mock_ticker_class.assert_called_once_with('AAPL')
                call_kwargs = mock_ticker.history.call_args[1]
                assert call_kwargs["interval"] == expected_interval


@pytest.mark.asyncio
async def test_get_chart_history_volume_handling(client):
    """Test proper handling of volume data including nulls"""
    volume_test_data = pd.DataFrame({
        'Open': [100.0, 101.0],
        'High': [105.0, 106.0],
        'Low': [99.0, 100.0],
        'Close': [103.0, 104.0],
        'Volume': [1000000, np.nan]  # Second volume is null
    }, index=pd.DatetimeIndex([
        datetime(2022, 1, 1, 9, 30),
        datetime(2022, 1, 2, 9, 30)
    ], name='Datetime'))
    
    with patch('app.services.charts_service.yf.Ticker') as mock_ticker_class:
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = volume_test_data
        mock_ticker_class.return_value = mock_ticker
        
        # Clear cache to ensure fresh request
        with patch('app.services.charts_service.get_cache') as mock_cache:
            mock_cache_obj = MagicMock()
            mock_cache_obj.get.return_value = None
            mock_cache.return_value = mock_cache_obj
            
            resp = await client.get("/v1/charts/history/AAPL")
            
            assert resp.status_code == 200
            data = resp.json()
            assert len(data["bars"]) == 2
            
            # First bar should have correct volume
            assert data["bars"][0]["volume"] == 1000000
            # Second bar should have volume 0 (null converted to 0)
            assert data["bars"][1]["volume"] == 0


@pytest.mark.asyncio
async def test_get_chart_history_invalid_resolution_defaults(client):
    """Test that invalid resolution defaults to 1d"""
    with patch('app.services.charts_service.yf.Ticker') as mock_ticker_class:
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = sample_yfinance_data
        mock_ticker_class.return_value = mock_ticker
        
        resp = await client.get("/v1/charts/history/AAPL?resolution=invalid")
        
        assert resp.status_code == 200
        
        # Check that it defaulted to 1d interval
        call_kwargs = mock_ticker.history.call_args[1]
        assert call_kwargs["interval"] == "1d"


@pytest.mark.asyncio
async def test_get_chart_history_symbol_case_handling(client):
    """Test that symbols are properly converted to uppercase"""
    with patch('app.services.charts_service.yf.Ticker') as mock_ticker_class:
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = sample_yfinance_data
        mock_ticker_class.return_value = mock_ticker
        
        # Clear cache to ensure fresh request
        with patch('app.services.charts_service.get_cache') as mock_cache:
            mock_cache_obj = MagicMock()
            mock_cache_obj.get.return_value = None
            mock_cache.return_value = mock_cache_obj
            
            resp = await client.get("/v1/charts/history/aapl")  # lowercase
            
            assert resp.status_code == 200
            # Verify ticker was created with uppercase symbol
            mock_ticker_class.assert_called_once_with('AAPL')