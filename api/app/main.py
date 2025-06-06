import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app import models
from app.db import engine, Base
from app.routers.v1 import hello as hello_v1, entries as entries_v1, trades as trades_v1

models.Base.metadata.create_all(bind=engine)
app = FastAPI(
    title="Trade Journal API",
    description="Backend for your Trade Journal app",
    version="0.1.0"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],          # GET, POST, PUT, DELETE, OPTIONS…
    allow_headers=["*"],          # allow Authorization, Content-Type, etc.
)

logging.basicConfig(level=logging.ERROR)

app.include_router(hello_v1.router)
app.include_router(entries_v1.router)
app.include_router(trades_v1.router)

@app.on_event("startup")
async def startup_event():
    print("🚀 App starting…")

@app.exception_handler(Exception)
async def log_exceptions(request: Request, exc: Exception):
    logging.exception(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )
