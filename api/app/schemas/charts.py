from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class Bar(BaseModel):
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: int

    model_config = {
        "from_attributes": True,
    }


class ChartResponse(BaseModel):
    s: str
    bars: List[Bar]

    model_config = {
        "from_attributes": True,
    }


class AnalysisWindow(BaseModel):
    resolution: str
    from_ts: int
    to_ts: int


class SourceStatus(BaseModel):
    source: str
    status: Literal["ok", "partial", "unavailable"]
    detail: Optional[str] = None


class ChartFeatures(BaseModel):
    bar_count: int = 0
    first_close: Optional[float] = None
    last_close: Optional[float] = None
    change_percent: Optional[float] = None
    window_high: Optional[float] = None
    window_low: Optional[float] = None
    average_volume: Optional[float] = None


class VolatilityTermPoint(BaseModel):
    expiration_date: str
    implied_volatility_percent: Optional[float] = None
    option_chain_type: Optional[str] = None
    settlement_type: Optional[str] = None


class VolatilitySnapshot(BaseModel):
    current_iv_percent: Optional[float] = None
    iv_15_day_percent: Optional[float] = None
    iv_rank_percent: Optional[float] = None
    iv_percentile_percent: Optional[float] = None
    iv_5_day_change_percent: Optional[float] = None
    corr_spy_3_month: Optional[float] = None
    liquidity_rating: Optional[float] = None
    term_structure: List[VolatilityTermPoint] = Field(default_factory=list)


class SpotGammaContext(BaseModel):
    source: Literal["manual", "captured", "unavailable"] = "unavailable"
    equity_hub_url: str
    spot: Optional[float] = None
    low_volatility_point: Optional[float] = None
    high_volatility_point: Optional[float] = None
    call_gamma_notional: Optional[float] = None
    put_gamma_notional: Optional[float] = None
    top_gamma_expiration: Optional[str] = None
    major_gamma_strikes: List[float] = Field(default_factory=list)
    notes: Optional[str] = None


class CatalystContext(BaseModel):
    source: Literal["manual", "captured", "unavailable"] = "unavailable"
    earnings_date: Optional[str] = None
    earnings_time: Optional[str] = None
    events: List[str] = Field(default_factory=list)
    notes: Optional[str] = None


class PortfolioExposure(BaseModel):
    status: Literal["ok", "unavailable"] = "unavailable"
    matching_groups: int = 0
    buying_power_effect: Optional[float] = None
    beta_delta: Optional[float] = None
    account_percent_used_bp: Optional[float] = None
    notes: List[str] = Field(default_factory=list)


class EquityAnalysisPackageV1(BaseModel):
    schema_version: Literal["equity-analysis-package.v1"] = "equity-analysis-package.v1"
    analysis_profile: Literal["sam-equity-options.v1"] = "sam-equity-options.v1"
    analysis_instructions: str
    generated_at: datetime
    symbol: str
    as_of_date: str
    window: AnalysisWindow
    equity_hub_url: str
    market: Optional[Dict[str, Any]] = None
    volatility: Optional[VolatilitySnapshot] = None
    chart_features: ChartFeatures
    chart_bars: List[Bar] = Field(default_factory=list)
    spotgamma: SpotGammaContext
    catalysts: CatalystContext
    portfolio_exposure: PortfolioExposure
    source_status: List[SourceStatus]
    warnings: List[str] = Field(default_factory=list)
