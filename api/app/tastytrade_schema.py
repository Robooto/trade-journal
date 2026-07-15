from typing import Any, Optional

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
    symbol: Optional[str] = None
    underlying_symbol: Optional[str] = Field(None, alias="underlying-symbol")
    expires_at: Optional[str] = Field(None, alias="expires-at")
    cost_effect: Optional[str] = Field(None, alias="cost-effect")
    average_open_price: Optional[str | int | float] = Field(
        None, alias="average-open-price"
    )
    close_price: Optional[str | int | float] = Field(None, alias="close-price")
    average_daily_market_close_price: Optional[str | int | float] = Field(
        None, alias="average-daily-market-close-price"
    )
    quantity: Optional[str | int] = None
    quantity_direction: Optional[str] = Field(None, alias="quantity-direction")
    multiplier: Optional[str | int] = None


class TastyMarketData(TastyModel):
    symbol: str
    mark: Optional[str | int | float] = None
    open: Optional[str | int | float] = None
    close: Optional[str | int | float] = None
    beta: Optional[str | int | float] = None
    delta: Optional[str | int | float] = None
    theta: Optional[str | int | float] = None
    vega: Optional[str | int | float] = None
    gamma: Optional[str | int | float] = None
    rho: Optional[str | int | float] = None


class TastyVolatilityMetric(TastyModel):
    symbol: str
    implied_volatility_index_rank: Optional[str | int | float] = Field(
        None, alias="implied-volatility-index-rank"
    )
    implied_volatility_index_5_day_change: Optional[str | int | float] = Field(
        None, alias="implied-volatility-index-5-day-change"
    )


class TastyAccountBalance(TastyModel):
    used_derivative_buying_power: Optional[str | int | float] = Field(
        None, alias="used-derivative-buying-power"
    )
    derivative_buying_power: Optional[str | int | float] = Field(
        None, alias="derivative-buying-power"
    )
    equity_buying_power: Optional[str | int | float] = Field(
        None, alias="equity-buying-power"
    )
    margin_equity: Optional[str | int | float] = Field(None, alias="margin-equity")
    net_liquidating_value: Optional[str | int | float] = Field(
        None, alias="net-liquidating-value"
    )


class TastyComplexOrderResponse(TastyModel):
    pass


class TastyWatchlistEntry(TastyModel):
    symbol: str
    instrument_type: Optional[str] = Field(None, alias="instrument-type")


class TastyWatchlist(TastyModel):
    name: str
    group_name: Optional[str] = Field(None, alias="group-name")
    order_index: Optional[int] = Field(None, alias="order-index")
    watchlist_entries: list[TastyWatchlistEntry] = Field(
        default_factory=list, alias="watchlist-entries"
    )


class TastyOrderLeg(TastyModel):
    symbol: str
    instrument_type: str = Field("", alias="instrument-type")
    action: Optional[str] = None
    quantity: Optional[str | int | float] = None


class TastyOrder(TastyModel):
    id: str | int
    account_number: Optional[str] = Field(None, alias="account-number")
    underlying_symbol: Optional[str] = Field(None, alias="underlying-symbol")
    status: Optional[str] = None
    order_type: Optional[str] = Field(None, alias="order-type")
    price: Optional[str | int | float] = None
    price_effect: Optional[str] = Field(None, alias="price-effect")
    received_at: Optional[str] = Field(None, alias="received-at")
    legs: list[TastyOrderLeg] = Field(default_factory=list)


class TastyTransaction(TastyModel):
    id: str | int
    account_number: Optional[str] = Field(None, alias="account-number")
    transaction_type: Optional[str] = Field(None, alias="transaction-type")
    transaction_sub_type: Optional[str] = Field(
        None, alias="transaction-sub-type"
    )
    transaction_date: Optional[str] = Field(None, alias="transaction-date")
    executed_at: Optional[str] = Field(None, alias="executed-at")
    created_at: Optional[str] = Field(None, alias="created-at")
    description: Optional[str] = None
    symbol: Optional[str] = None
    underlying_symbol: Optional[str] = Field(None, alias="underlying-symbol")
    instrument_type: Optional[str] = Field(None, alias="instrument-type")
    action: Optional[str] = None
    quantity: Optional[str | int | float] = None
    price: Optional[str | int | float] = None
    value: Optional[str | int | float] = None
    value_effect: Optional[str] = Field(None, alias="value-effect")
    net_value: Optional[str | int | float] = Field(None, alias="net-value")
    net_value_effect: Optional[str] = Field(None, alias="net-value-effect")
    commission: Optional[str | int | float] = None
    clearing_fees: Optional[str | int | float] = Field(
        None, alias="clearing-fees"
    )
    regulatory_fees: Optional[str | int | float] = Field(
        None, alias="regulatory-fees"
    )
    order_id: Optional[str | int] = Field(None, alias="order-id")
    leg_count: Optional[int] = Field(None, alias="leg-count")
    ext_group_fill_id: Optional[str] = Field(None, alias="ext-group-fill-id")


class TastyEarningsReport(TastyModel):
    occurred_date: str = Field(..., alias="occurred-date")
    eps: Optional[str | int | float] = None
