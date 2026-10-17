
from pydantic import BaseModel, Field


class Position(BaseModel):
    """Generic position data with arbitrary fields."""

    approximate_p_l: float | None = Field(None, alias="approximate-p-l")
    unrealized_pl_dollars: float | None = Field(None, alias="unrealized-pl-dollars")
    open_value_dollars: float | None = Field(None, alias="open-value-dollars")
    current_value_dollars: float | None = Field(None, alias="current-value-dollars")
    net_open_credit_or_debit_dollars: float | None = Field(None, alias="net-open-credit-or-debit-dollars")
    net_current_value_dollars: float | None = Field(None, alias="net-current-value-dollars")
    beta: float | None = None
    strike: float | None = None
    option_type: str | None = Field(None, alias="option-type")

    model_config = {
        "populate_by_name": True,
        "extra": "allow",
        "from_attributes": True,
    }


class GroupedPositions(BaseModel):
    underlying_symbol: str
    expires_at: str
    expiration_dates: list[str] = Field(default_factory=list)
    strategy_label: str | None = None
    strategy_confidence: str | None = None
    grouping_source: str | None = None
    total_credit_received: float
    total_credit_points: float | None = None
    total_credit_dollars: float | None = None
    net_open_credit_or_debit_dollars: float | None = None
    open_value_dollars: float | None = None
    current_value_dollars: float | None = None
    gross_current_value_dollars: float | None = None
    unrealized_pl_dollars: float | None = None
    days_to_nearest_expiration: int | None = None
    assignment_exposure_dollars: float | None = None
    max_loss_dollars: float | None = None
    buying_power_effect_dollars: float | None = None
    current_group_p_l: float
    percent_credit_received: int | None = None
    percent_credit_captured: float | None = None
    percent_max_profit_or_target: float | None = None
    total_delta: float | None = None
    delta_shares: float | None = None
    theta_dollars_per_day: float | None = None
    vega_dollars_per_vol_point: float | None = None
    gamma_display: float | None = None
    total_position_delta: int | None = None
    total_theta: int | None = None
    total_vega: int | None = None
    total_gamma: int | None = None
    total_rho: int | None = None
    beta_delta: float | None = None
    beta_delta_raw: float | None = None
    beta_delta_shares: float | None = None
    iv_rank: float | None = Field(None, alias="iv_rank")
    iv_5d_change: float | None = Field(None, alias="iv_5d_change")
    positions: list[Position]

    model_config = {
        "populate_by_name": True,
        "from_attributes": True,
    }


class UnderlyingConcentration(BaseModel):
    underlying_symbol: str
    delta_shares: float
    beta_delta_shares: float
    absolute_beta_delta_share_percent: float | None = None
    group_count: int
    exposure_basis: str


class AccountPositions(BaseModel):
    account_number: str
    nickname: str
    groups: list[GroupedPositions]
    total_beta_delta: float | None = None
    total_beta_delta_raw: float | None = None
    total_beta_delta_shares: float | None = None
    delta_shares: float | None = None
    theta_dollars_per_day: float | None = None
    vega_dollars_per_vol_point: float | None = None
    gamma_display: float | None = None
    total_position_delta: int | None = None
    total_theta: int | None = None
    total_vega: int | None = None
    total_gamma: int | None = None
    total_rho: int | None = None
    percent_used_bp: int | None = None
    net_liquidating_value_dollars: float | None = None
    margin_equity_dollars: float | None = None
    used_derivative_buying_power_dollars: float | None = None
    derivative_buying_power_dollars: float | None = None
    equity_buying_power_dollars: float | None = None
    buying_power_utilization_percent: float | None = None
    buying_power_zone: str = "unavailable"
    theta_percent_of_net_liq_per_day: float | None = None
    vega_plus_one_point_dollars: float | None = None
    vega_plus_one_point_percent_of_net_liq: float | None = None
    underlying_concentrations: list[UnderlyingConcentration] = Field(default_factory=list)
    largest_underlying_concentration: UnderlyingConcentration | None = None
    balance_status: str = "unavailable"
    balance_warnings: list[str] = Field(default_factory=list)
    balance_fetched_at: str | None = None

    model_config = {
        "populate_by_name": True,
        "from_attributes": True,
    }


class PositionsResponse(BaseModel):
    accounts: list[AccountPositions]

    model_config = {
        "populate_by_name": True,
        "from_attributes": True,
    }


class MarketDataRequest(BaseModel):
    equity: list[str] = Field(default_factory=list)
    equity_option: list[str] = Field(default_factory=list)
    future: list[str] = Field(default_factory=list)
    future_option: list[str] = Field(default_factory=list)


class MarketDataSnapshot(BaseModel):
    symbol: str
    mark: float | None = None
    open: float | None = None
    close: float | None = None
    bid: float | None = None
    ask: float | None = None
    last: float | None = None
    beta: float | None = None
    delta: float | None = None
    theta: float | None = None
    vega: float | None = None
    gamma: float | None = None
    rho: float | None = None
    implied_volatility: float | None = None


class MarketDataSummaryResponse(BaseModel):
    items: list[MarketDataSnapshot]
    requested_symbols: list[str]
    missing_symbols: list[str]


class VolatilityDataRequest(BaseModel):
    symbols: list[str] = Field(default_factory=list)


class VolatilityDataSnapshot(BaseModel):
    symbol: str
    iv_rank_percent: float | None = None
    iv_5d_change_percent: float | None = None


class VolatilityDataSummaryResponse(BaseModel):
    items: list[VolatilityDataSnapshot]
    requested_symbols: list[str]
    missing_symbols: list[str]


class LlmPositionSummary(BaseModel):
    symbol: str | None = None
    instrument_type: str | None = None
    underlying_symbol: str | None = None
    expiration_date: str | None = None
    days_to_expiration: int | None = None
    quantity: int | None = None
    quantity_direction: str | None = None
    multiplier: int | None = None
    average_open_price: float | None = None
    mark: float | None = None
    unrealized_pl_dollars: float | None = None
    open_value_dollars: float | None = None
    current_value_dollars: float | None = None
    net_open_credit_or_debit_dollars: float | None = None
    net_current_value_dollars: float | None = None
    approximate_pl: float | None = None
    strike: float | None = None
    option_type: str | None = None
    delta: float | None = None
    delta_shares: float | None = None
    theta: float | None = None
    theta_dollars_per_day: float | None = None
    vega: float | None = None
    vega_dollars_per_vol_point: float | None = None
    gamma: float | None = None
    gamma_display: float | None = None
    rho: float | None = None
    assignment_exposure_dollars: float | None = None
    max_loss_dollars: float | None = None
    buying_power_effect_dollars: float | None = None


class LlmStrategySummary(BaseModel):
    label: str
    confidence: str
    reason: str


class LlmPositionGroupSummary(BaseModel):
    underlying_symbol: str
    expiration_date: str
    total_credit_received: float
    total_credit_points: float | None = None
    total_credit_dollars: float | None = None
    net_open_credit_or_debit_dollars: float | None = None
    open_value_dollars: float | None = None
    current_value_dollars: float | None = None
    gross_current_value_dollars: float | None = None
    unrealized_pl_dollars: float | None = None
    days_to_nearest_expiration: int | None = None
    assignment_exposure_dollars: float | None = None
    max_loss_dollars: float | None = None
    buying_power_effect_dollars: float | None = None
    current_pl: float
    percent_credit_received: int | None = None
    percent_credit_captured: float | None = None
    percent_max_profit_or_target: float | None = None
    total_delta: float | None = None
    total_position_delta: int | None = None
    beta_delta: float | None = None
    beta_delta_raw: float | None = None
    beta_delta_shares: float | None = None
    delta_shares: float | None = None
    theta: int | None = None
    theta_dollars_per_day: float | None = None
    vega: int | None = None
    vega_dollars_per_vol_point: float | None = None
    gamma: int | None = None
    gamma_display: float | None = None
    rho: int | None = None
    iv_rank_percent: float | None = None
    iv_5d_change_percent: float | None = None
    strategy: LlmStrategySummary | None = None
    management_flags: list[str] = Field(default_factory=list)
    positions: list[LlmPositionSummary]


class LlmUnderlyingStrategySummary(LlmStrategySummary):
    underlying_symbol: str
    leg_count: int
    expiration_dates: list[str]


class LlmStrategyGroupSummary(BaseModel):
    underlying_symbol: str
    strategy: LlmStrategySummary
    expiration_dates: list[str]
    leg_count: int
    legs: list[LlmPositionSummary]
    net_open_credit_or_debit_dollars: float | None = None
    current_value_dollars: float | None = None
    unrealized_pl_dollars: float | None = None
    percent_credit_captured: float | None = None
    percent_max_profit_or_target: float | None = None
    days_to_nearest_expiration: int | None = None
    theta_dollars_per_day: float | None = None
    vega_dollars_per_vol_point: float | None = None
    delta_shares: float | None = None
    gamma_display: float | None = None
    beta_delta_raw: float | None = None
    beta_delta_shares: float | None = None
    assignment_exposure_dollars: float | None = None
    max_loss_dollars: float | None = None
    buying_power_effect_dollars: float | None = None
    management_flags: list[str] = Field(default_factory=list)


class LlmAccountPositionsSummary(BaseModel):
    account_number: str
    nickname: str
    percent_used_bp: int | None = None
    net_liquidating_value_dollars: float | None = None
    margin_equity_dollars: float | None = None
    used_derivative_buying_power_dollars: float | None = None
    derivative_buying_power_dollars: float | None = None
    equity_buying_power_dollars: float | None = None
    buying_power_utilization_percent: float | None = None
    buying_power_zone: str = "unavailable"
    theta_percent_of_net_liq_per_day: float | None = None
    vega_plus_one_point_dollars: float | None = None
    vega_plus_one_point_percent_of_net_liq: float | None = None
    underlying_concentrations: list[UnderlyingConcentration] = Field(default_factory=list)
    largest_underlying_concentration: UnderlyingConcentration | None = None
    balance_status: str = "unavailable"
    balance_warnings: list[str] = Field(default_factory=list)
    balance_fetched_at: str | None = None
    total_beta_delta: float | None = None
    total_beta_delta_raw: float | None = None
    total_beta_delta_shares: float | None = None
    total_position_delta: int | None = None
    delta_shares: float | None = None
    theta: int | None = None
    theta_dollars_per_day: float | None = None
    vega: int | None = None
    vega_dollars_per_vol_point: float | None = None
    gamma: int | None = None
    gamma_display: float | None = None
    rho: int | None = None
    underlying_strategies: list[LlmUnderlyingStrategySummary] = Field(default_factory=list)
    strategy_groups: list[LlmStrategyGroupSummary] = Field(default_factory=list)
    groups: list[LlmPositionGroupSummary]


class LlmPortfolioSummary(BaseModel):
    account_count: int
    group_count: int
    strategy_group_count: int | None = None
    position_count: int
    percent_used_bp: int | None = None
    net_liquidating_value_dollars: float | None = None
    used_derivative_buying_power_dollars: float | None = None
    derivative_buying_power_dollars: float | None = None
    buying_power_utilization_percent: float | None = None
    theta_percent_of_net_liq_per_day: float | None = None
    vega_plus_one_point_dollars: float | None = None
    vega_plus_one_point_percent_of_net_liq: float | None = None
    balance_account_count: int = 0
    total_beta_delta: float | None = None
    total_beta_delta_raw: float | None = None
    total_beta_delta_shares: float | None = None
    total_position_delta: int | None = None
    delta_shares: float | None = None
    theta: int | None = None
    theta_dollars_per_day: float | None = None
    vega: int | None = None
    vega_dollars_per_vol_point: float | None = None
    gamma: int | None = None
    gamma_display: float | None = None
    rho: int | None = None
    unrealized_pl_dollars: float | None = None
    assignment_exposure_dollars: float | None = None
    max_loss_dollars: float | None = None
    buying_power_effect_dollars: float | None = None


class LlmPositionsSummaryResponse(BaseModel):
    portfolio: LlmPortfolioSummary
    units: dict[str, str]
    accounts: list[LlmAccountPositionsSummary]


class BracketOrderRequest(BaseModel):
    account_number: str = Field(..., alias="account-number")
    symbol: str
    instrument_type: str = Field(..., alias="instrument-type")
    quantity: int
    multiplier: int = 100
    quantity_direction: str = Field(..., alias="quantity-direction")
    cost_effect: str | None = Field(None, alias="cost-effect")
    entry_price: float = Field(..., alias="entry-price")
    take_profit_percent: float = Field(..., alias="take-profit-percent")
    stop_loss_percent: float = Field(..., alias="stop-loss-percent")
    dry_run: bool = Field(True, alias="dry-run")
    confirmed: bool = False

    model_config = {
        "populate_by_name": True,
        "from_attributes": True,
    }


class BracketOrderResponse(BaseModel):
    dry_run: bool = Field(..., alias="dry-run")
    payload: dict
    take_profit_price: float = Field(..., alias="take-profit-price")
    stop_loss_price: float = Field(..., alias="stop-loss-price")
    tasty_response: dict | None = Field(None, alias="tasty-response")

    model_config = {
        "populate_by_name": True,
        "from_attributes": True,
    }
