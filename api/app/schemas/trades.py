from typing import List, Optional

from pydantic import BaseModel, Field


class Position(BaseModel):
    """Generic position data with arbitrary fields."""

    approximate_p_l: Optional[float] = Field(None, alias="approximate-p-l")
    beta: Optional[float] = None
    strike: Optional[float] = None
    option_type: Optional[str] = Field(None, alias="option-type")

    model_config = {
        "populate_by_name": True,
        "extra": "allow",
        "from_attributes": True,
    }


class GroupedPositions(BaseModel):
    underlying_symbol: str
    expires_at: str
    total_credit_received: float
    current_group_p_l: float
    percent_credit_received: Optional[int] = None
    total_delta: Optional[float] = None
    total_position_delta: Optional[int] = None
    total_theta: Optional[int] = None
    total_vega: Optional[int] = None
    total_gamma: Optional[int] = None
    total_rho: Optional[int] = None
    beta_delta: Optional[float] = None
    iv_rank: Optional[float] = Field(None, alias="iv_rank")
    iv_5d_change: Optional[float] = Field(None, alias="iv_5d_change")
    positions: List[Position]

    model_config = {
        "populate_by_name": True,
        "from_attributes": True,
    }


class AccountPositions(BaseModel):
    account_number: str
    nickname: str
    groups: List[GroupedPositions]
    total_beta_delta: Optional[float] = None
    total_position_delta: Optional[int] = None
    total_theta: Optional[int] = None
    total_vega: Optional[int] = None
    total_gamma: Optional[int] = None
    total_rho: Optional[int] = None
    percent_used_bp: Optional[int] = None

    model_config = {
        "populate_by_name": True,
        "from_attributes": True,
    }


class PositionsResponse(BaseModel):
    accounts: List[AccountPositions]

    model_config = {
        "populate_by_name": True,
        "from_attributes": True,
    }


class MarketDataRequest(BaseModel):
    equity: List[str] = Field(default_factory=list)
    equity_option: List[str] = Field(default_factory=list)
    future: List[str] = Field(default_factory=list)
    future_option: List[str] = Field(default_factory=list)


class MarketDataSnapshot(BaseModel):
    symbol: str
    mark: Optional[float] = None
    open: Optional[float] = None
    close: Optional[float] = None
    bid: Optional[float] = None
    ask: Optional[float] = None
    last: Optional[float] = None
    beta: Optional[float] = None
    delta: Optional[float] = None
    theta: Optional[float] = None
    vega: Optional[float] = None
    gamma: Optional[float] = None
    rho: Optional[float] = None
    implied_volatility: Optional[float] = None


class MarketDataSummaryResponse(BaseModel):
    items: List[MarketDataSnapshot]
    requested_symbols: List[str]
    missing_symbols: List[str]


class VolatilityDataRequest(BaseModel):
    symbols: List[str] = Field(default_factory=list)


class VolatilityDataSnapshot(BaseModel):
    symbol: str
    iv_rank_percent: Optional[float] = None
    iv_5d_change_percent: Optional[float] = None


class VolatilityDataSummaryResponse(BaseModel):
    items: List[VolatilityDataSnapshot]
    requested_symbols: List[str]
    missing_symbols: List[str]


class LlmPositionSummary(BaseModel):
    symbol: Optional[str] = None
    instrument_type: Optional[str] = None
    underlying_symbol: Optional[str] = None
    expiration_date: Optional[str] = None
    quantity: Optional[int] = None
    quantity_direction: Optional[str] = None
    multiplier: Optional[int] = None
    average_open_price: Optional[float] = None
    mark: Optional[float] = None
    approximate_pl: Optional[float] = None
    strike: Optional[float] = None
    option_type: Optional[str] = None
    delta: Optional[float] = None
    theta: Optional[float] = None
    vega: Optional[float] = None
    gamma: Optional[float] = None
    rho: Optional[float] = None


class LlmStrategySummary(BaseModel):
    label: str
    confidence: str
    reason: str


class LlmPositionGroupSummary(BaseModel):
    underlying_symbol: str
    expiration_date: str
    total_credit_received: float
    current_pl: float
    percent_credit_received: Optional[int] = None
    total_delta: Optional[float] = None
    total_position_delta: Optional[int] = None
    beta_delta: Optional[float] = None
    theta: Optional[int] = None
    vega: Optional[int] = None
    gamma: Optional[int] = None
    rho: Optional[int] = None
    iv_rank_percent: Optional[float] = None
    iv_5d_change_percent: Optional[float] = None
    strategy: Optional[LlmStrategySummary] = None
    positions: List[LlmPositionSummary]


class LlmUnderlyingStrategySummary(LlmStrategySummary):
    underlying_symbol: str
    leg_count: int
    expiration_dates: List[str]


class LlmAccountPositionsSummary(BaseModel):
    account_number: str
    nickname: str
    percent_used_bp: Optional[int] = None
    total_beta_delta: Optional[float] = None
    total_position_delta: Optional[int] = None
    theta: Optional[int] = None
    vega: Optional[int] = None
    gamma: Optional[int] = None
    rho: Optional[int] = None
    underlying_strategies: List[LlmUnderlyingStrategySummary] = Field(default_factory=list)
    groups: List[LlmPositionGroupSummary]


class LlmPortfolioSummary(BaseModel):
    account_count: int
    group_count: int
    position_count: int
    percent_used_bp: Optional[int] = None
    total_beta_delta: Optional[float] = None
    total_position_delta: Optional[int] = None
    theta: Optional[int] = None
    vega: Optional[int] = None
    gamma: Optional[int] = None
    rho: Optional[int] = None


class LlmPositionsSummaryResponse(BaseModel):
    portfolio: LlmPortfolioSummary
    units: dict[str, str]
    accounts: List[LlmAccountPositionsSummary]


class BracketOrderRequest(BaseModel):
    account_number: str = Field(..., alias="account-number")
    symbol: str
    instrument_type: str = Field(..., alias="instrument-type")
    quantity: int
    multiplier: int = 100
    quantity_direction: str = Field(..., alias="quantity-direction")
    cost_effect: Optional[str] = Field(None, alias="cost-effect")
    entry_price: float = Field(..., alias="entry-price")
    take_profit_percent: float = Field(..., alias="take-profit-percent")
    stop_loss_percent: float = Field(..., alias="stop-loss-percent")
    dry_run: bool = Field(False, alias="dry-run")

    model_config = {
        "populate_by_name": True,
        "from_attributes": True,
    }


class BracketOrderResponse(BaseModel):
    dry_run: bool = Field(..., alias="dry-run")
    payload: dict
    take_profit_price: float = Field(..., alias="take-profit-price")
    stop_loss_price: float = Field(..., alias="stop-loss-price")
    tasty_response: Optional[dict] = Field(None, alias="tasty-response")

    model_config = {
        "populate_by_name": True,
        "from_attributes": True,
    }
