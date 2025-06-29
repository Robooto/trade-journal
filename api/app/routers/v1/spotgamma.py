from fastapi import APIRouter, HTTPException
import os
import base64
from playwright.async_api import async_playwright

HIRO_SPY_URL = "https://dashboard.spotgamma.com/hiro?eh-model=legacy&sym=S%26P+500"
HIRO_EQUITIES_URL = "https://dashboard.spotgamma.com/hiro?eh-model=legacy&sym=S%26P+Equities"

router = APIRouter(prefix="/v1/spotgamma", tags=["v1 – spotgamma"])

async def login(page, username: str, password: str) -> None:
    await page.goto("https://dashboard.spotgamma.com/login")
    await page.fill('input[type="email"]', username)
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')
    await page.wait_for_load_state('networkidle')

@router.get("/hiro", summary="Fetch SpotGamma Hiro screenshots")
async def hiro_screens():
    username = os.getenv("SPOTGAMMA_USERNAME")
    password = os.getenv("SPOTGAMMA_PASSWORD")
    if not username or not password:
        raise HTTPException(status_code=500, detail="SpotGamma credentials not configured")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        context = await browser.new_context()
        page = await context.new_page()
        await login(page, username, password)

        await page.goto(HIRO_SPY_URL)
        await page.wait_for_load_state('networkidle')
        shot1 = await page.screenshot()
        img1 = base64.b64encode(shot1).decode("utf-8")

        await page.goto(HIRO_EQUITIES_URL)
        await page.wait_for_load_state('networkidle')
        shot2 = await page.screenshot()
        img2 = base64.b64encode(shot2).decode("utf-8")

        await browser.close()

    return {"images": [img1, img2]}
