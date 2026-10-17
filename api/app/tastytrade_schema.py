from typing import Any

from pydantic import BaseModel, Field


class TastyModel(BaseModel):
    model_config = {
        "extra": "allow",
        "populate_by_name": True,
    }

    def to_tasty_dict(self) -> dict[str, Any]:
        return self.model_dump(by_alias=True, exclude_none=True)


class TastyAccount(TastyModel):
    account_number: str = Field("", alias="account-number")
    nickname: str = ""


class TastyPosition(TastyModel):
    instrument_type: str = Field("", alias="instrument-type")
    symbol: str | None = None
    underlying_symbol: str | None = Field(None, alias="underlying-symbol")
    expires_at: str | None = Field(None, alias="expires-at")
    cost_effect: str | None = Field(None, alias="cost-effect")
    average_open_price: str | int | float | None = Field(
        None, alias="average-open-price"
    )
    close_price: str | int | float | None = Field(None, alias="close-price")
    average_daily_market_close_price: str | int | float | None = Field(
        None, alias="average-daily-market-close-price"
    )
    quantity: str | int | None = None
    quantity_direction: str | None = Field(None, alias="quantity-direction")
    multiplier: str | int | None = None
    ext_group_fill_id: str | None = Field(None, alias="ext-group-fill-id")
    group_fill_id: str | None = Field(None, alias="group-fill-id")


class TastyMarketData(TastyModel):
    symbol: str
    updated_at: str | None = Field(None, alias="updated-at")
    mark: str | int | float | None = None
    bid: str | int | float | None = None
    ask: str | int | float | None = None
    bid_size: str | int | float | None = Field(None, alias="bid-size")
    ask_size: str | int | float | None = Field(None, alias="ask-size")
    volume: str | int | float | None = None
    open_interest: str | int | float | None = Field(None, alias="open-interest")
    open: str | int | float | None = None
    close: str | int | float | None = None
    beta: str | int | float | None = None
    delta: str | int | float | None = None
    theta: str | int | float | None = None
    vega: str | int | float | None = None
    gamma: str | int | float | None = None
    rho: str | int | float | None = None
    volatility: str | int | float | None = None
    theo_price: str | int | float | None = Field(None, alias="theo-price")


class TastyVolatilityMetric(TastyModel):
    symbol: str
    implied_volatility_index_rank: str | int | float | None = Field(
        None, alias="implied-volatility-index-rank"
    )
    implied_volatility_index_5_day_change: str | int | float | None = Field(
        None, alias="implied-volatility-index-5-day-change"
    )
    implied_volatility_index: str | int | float | None = Field(None, alias="implied-volatility-index")
    implied_volatility_percentile: str | int | float | None = Field(None, alias="implied-volatility-percentile")
    implied_volatility_30_day: str | int | float | None = Field(None, alias="implied-volatility-30-day")
    historical_volatility_30_day: str | int | float | None = Field(None, alias="historical-volatility-30-day")
    historical_volatility_60_day: str | int | float | None = Field(None, alias="historical-volatility-60-day")
    historical_volatility_90_day: str | int | float | None = Field(None, alias="historical-volatility-90-day")
    iv_hv_30_day_difference: str | int | float | None = Field(None, alias="iv-hv-30-day-difference")
    implied_volatility_updated_at: str | None = Field(None, alias="implied-volatility-updated-at")
    option_expiration_implied_volatilities: list[dict[str, Any]] | None = Field(
        None, alias="option-expiration-implied-volatilities"
    )


class TastyAccountBalance(TastyModel):
    used_derivative_buying_power: str | int | float | None = Field(
        None, alias="used-derivative-buying-power"
    )
    derivative_buying_power: str | int | float | None = Field(
        None, alias="derivative-buying-power"
    )
    equity_buying_power: str | int | float | None = Field(
        None, alias="equity-buying-power"
    )
    margin_equity: str | int | float | None = Field(None, alias="margin-equity")
    net_liquidating_value: str | int | float | None = Field(
        None, alias="net-liquidating-value"
    )


class TastyComplexOrderResponse(TastyModel):
    pass


class TastyWatchlistEntry(TastyModel):
    symbol: str
    instrument_type: str | None = Field(None, alias="instrument-type")


class TastyWatchlist(TastyModel):
    name: str
    group_name: str | None = Field(None, alias="group-name")
    order_index: int | None = Field(None, alias="order-index")
    watchlist_entries: list[TastyWatchlistEntry] = Field(
        default_factory=list, alias="watchlist-entries"
    )


class TastyOrderLeg(TastyModel):
    symbol: str
    instrument_type: str = Field("", alias="instrument-type")
    action: str | None = None
    quantity: str | int | float | None = None


class TastyOrder(TastyModel):
    id: str | int
    account_number: str | None = Field(None, alias="account-number")
    underlying_symbol: str | None = Field(None, alias="underlying-symbol")
    status: str | None = None
    order_type: str | None = Field(None, alias="order-type")
    price: str | int | float | None = None
    price_effect: str | None = Field(None, alias="price-effect")
    received_at: str | None = Field(None, alias="received-at")
    legs: list[TastyOrderLeg] = Field(default_factory=list)


class TastyTransaction(TastyModel):
    id: str | int
    account_number: str | None = Field(None, alias="account-number")
    transaction_type: str | None = Field(None, alias="transaction-type")
    transaction_sub_type: str | None = Field(
        None, alias="transaction-sub-type"
    )
    transaction_date: str | None = Field(None, alias="transaction-date")
    executed_at: str | None = Field(None, alias="executed-at")
    created_at: str | None = Field(None, alias="created-at")
    description: str | None = None
    symbol: str | None = None
    underlying_symbol: str | None = Field(None, alias="underlying-symbol")
    instrument_type: str | None = Field(None, alias="instrument-type")
    action: str | None = None
    quantity: str | int | float | None = None
    price: str | int | float | None = None
    value: str | int | float | None = None
    value_effect: str | None = Field(None, alias="value-effect")
    net_value: str | int | float | None = Field(None, alias="net-value")
    net_value_effect: str | None = Field(None, alias="net-value-effect")
    commission: str | int | float | None = None
    clearing_fees: str | int | float | None = Field(
        None, alias="clearing-fees"
    )
    regulatory_fees: str | int | float | None = Field(
        None, alias="regulatory-fees"
    )
    order_id: str | int | None = Field(None, alias="order-id")
    leg_count: int | None = Field(None, alias="leg-count")
    ext_group_fill_id: str | None = Field(None, alias="ext-group-fill-id")


class TastyEarningsReport(TastyModel):
    occurred_date: str = Field(..., alias="occurred-date")
    eps: str | int | float | None = None
