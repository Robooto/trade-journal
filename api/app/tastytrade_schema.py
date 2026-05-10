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


class TastyComplexOrderResponse(TastyModel):
    pass
