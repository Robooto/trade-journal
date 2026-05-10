from typing import List

from pydantic import BaseModel


class HiroScreenshotImage(BaseModel):
    name: str
    data: str
    source_url: str

    model_config = {
        "from_attributes": True,
    }


class HiroScreenshotsResponse(BaseModel):
    timestamp: str
    images: List[HiroScreenshotImage]

    model_config = {
        "from_attributes": True,
    }
