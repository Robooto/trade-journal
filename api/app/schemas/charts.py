from datetime import datetime
from typing import Any, Literal

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
    bars: list[Bar]

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
    detail: str | None = None


class ChartFeatures(BaseModel):
    bar_count: int = 0
    first_close: float | None = None
    last_close: float | None = None
    change_percent: float | None = None
    window_high: float | None = None
    window_low: float | None = None
    average_volume: float | None = None


class VolatilityTermPoint(BaseModel):
    expiration_date: str
    implied_volatility_percent: float | None = None
    option_chain_type: str | None = None
    settlement_type: str | None = None


class VolatilitySnapshot(BaseModel):
    current_iv_percent: float | None = None
    iv_15_day_percent: float | None = None
    iv_rank_percent: float | None = None
    iv_percentile_percent: float | None = None
    iv_5_day_change_percent: float | None = None
    corr_spy_3_month: float | None = None
    liquidity_rating: float | None = None
    term_structure: list[VolatilityTermPoint] = Field(default_factory=list)


class SpotGammaContext(BaseModel):
    source: Literal["manual", "captured", "unavailable"] = "unavailable"
    equity_hub_url: str
    spot: float | None = None
    low_volatility_point: float | None = None
    high_volatility_point: float | None = None
    call_gamma_notional: float | None = None
    put_gamma_notional: float | None = None
    top_gamma_expiration: str | None = None
    major_gamma_strikes: list[float] = Field(default_factory=list)
    notes: str | None = None


class CatalystContext(BaseModel):
    source: Literal["manual", "captured", "unavailable"] = "unavailable"
    earnings_date: str | None = None
    earnings_time: str | None = None
    events: list[str] = Field(default_factory=list)
    notes: str | None = None


class PortfolioExposure(BaseModel):
    status: Literal["ok", "unavailable"] = "unavailable"
    matching_groups: int = 0
    buying_power_effect: float | None = None
    beta_delta: float | None = None
    account_percent_used_bp: float | None = None
    notes: list[str] = Field(default_factory=list)


class EquityAnalysisPackageV1(BaseModel):
    schema_version: Literal["equity-analysis-package.v1"] = "equity-analysis-package.v1"
    analysis_profile: Literal["sam-equity-options.v1"] = "sam-equity-options.v1"
    analysis_instructions: str
    generated_at: datetime
    symbol: str
    as_of_date: str
    window: AnalysisWindow
    equity_hub_url: str
    market: dict[str, Any] | None = None
    volatility: VolatilitySnapshot | None = None
    chart_features: ChartFeatures
    chart_bars: list[Bar] = Field(default_factory=list)
    spotgamma: SpotGammaContext
    catalysts: CatalystContext
    portfolio_exposure: PortfolioExposure
    source_status: list[SourceStatus]
    warnings: list[str] = Field(default_factory=list)
