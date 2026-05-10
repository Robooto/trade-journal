from typing import List

from pydantic import BaseModel


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
