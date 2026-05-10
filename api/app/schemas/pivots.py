from datetime import date
from typing import Any, Mapping

from pydantic import BaseModel, model_validator


class PivotLevelBase(BaseModel):
    price: float
    index: str
    date: date

    model_config = {
        "populate_by_name": True,
        "from_attributes": True,
    }

    @model_validator(mode="before")
    @classmethod
    def apply_defaults(cls, values: Any) -> Any:
        if isinstance(values, Mapping):
            data = dict(values)
            data.setdefault("index", "SPX")
            data.setdefault("date", date.today())
            return data
        return values


class PivotLevelCreate(PivotLevelBase):
    pass


class PivotLevel(PivotLevelBase):
    id: int

    model_config = {
        "populate_by_name": True,
        "from_attributes": True,
    }
