from fastapi import APIRouter

router = APIRouter(
    prefix="/v1",        # everything in this router is under /v1
    tags=["v1 – health"]
)

@router.get("/", summary="Health check")
async def read_root():
    return {"message": "Hello, Trade Journal v1!"}