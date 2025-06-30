from fastapi import APIRouter, HTTPException, UploadFile
import os
import base64
import numpy as np
import cv2
from typing import Tuple, List
from datetime import datetime
from playwright.async_api import async_playwright
from pathlib import Path

HIRO_SPY_URL = "https://dashboard.spotgamma.com/hiro?eh-model=legacy&sym=S%26P+500"
HIRO_EQUITIES_URL = "https://dashboard.spotgamma.com/hiro?eh-model=legacy&sym=S%26P+Equities"

router = APIRouter(prefix="/v1/spotgamma", tags=["v1 – spotgamma"])

async def login(page, username: str, password: str) -> None:
    await page.goto("https://dashboard.spotgamma.com/login")
    await page.fill('input[type="text"]', username)
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
        await page.get_by_role("button", name="open drawer").click()
        await page.get_by_role("button", name="chart sizing options").click()
        await page.get_by_role("button", name="Open Full Screen").click()
        shot1 = await page.screenshot()
        img1 = base64.b64encode(shot1).decode("utf-8")

        await page.goto(HIRO_EQUITIES_URL)
        await page.wait_for_load_state('networkidle')
        await page.get_by_role("button", name="chart sizing options").click()
        await page.get_by_role("button", name="Open Full Screen").click()
        shot2 = await page.screenshot()
        img2 = base64.b64encode(shot2).decode("utf-8")

        await browser.close()

    ts = datetime.utcnow()
    timestamp = ts.isoformat() + "Z"
    safe_ts = ts.strftime("%Y%m%d-%H%M%S")
    images = [
        {"name": f"{safe_ts}-SP500.png", "data": img1},
        {"name": f"{safe_ts}-SPEquities.png", "data": img2},
    ]
    return {"timestamp": timestamp, "images": images}


def load_image(file: UploadFile) -> np.ndarray:
    """Read an UploadFile into an OpenCV BGR image."""
    data = file.file.read()
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail=f"Cannot decode image {file.filename}")
    return img

# Your target colors in RGB
orange_rgb = (216, 114,  58)  # (R, G, B)
blue_rgb   = ( 58, 121, 216)

# Convert to BGR for OpenCV
orange_bgr = np.uint8([[[orange_rgb[2], orange_rgb[1], orange_rgb[0]]]])
blue_bgr   = np.uint8([[[blue_rgb[2],   blue_rgb[1],   blue_rgb[0]  ]]])

# Convert those single‐pixel BGRs into HSV
orange_hsv = cv2.cvtColor(orange_bgr, cv2.COLOR_BGR2HSV)[0,0]
blue_hsv   = cv2.cvtColor(blue_bgr,   cv2.COLOR_BGR2HSV)[0,0]

# Tolerance “wiggle” around each HSV center
dh, ds, dv = 10, 80, 80

lower_orange = np.array([
    max(0, orange_hsv[0] - dh),
    max(0, orange_hsv[1] - ds),
    max(0, orange_hsv[2] - dv),
], dtype=np.uint8)
upper_orange = np.array([
    min(179, orange_hsv[0] + dh),
    255,
    255,
], dtype=np.uint8)

lower_blue = np.array([
    max(0, blue_hsv[0] - dh),
    max(0, blue_hsv[1] - ds),
    max(0, blue_hsv[2] - dv),
], dtype=np.uint8)
upper_blue = np.array([
    min(179, blue_hsv[0] + dh),
    255,
    255,
], dtype=np.uint8)

def mask_for_color(hsv: np.ndarray, color: str) -> np.ndarray:
    """Return a binary mask for one of your two colors."""
    if color == 'orange':
        return cv2.inRange(hsv, lower_orange, upper_orange)
    elif color == 'blue':
        return cv2.inRange(hsv, lower_blue,   upper_blue)
    else:
        raise ValueError(f"Unsupported color: {color!r}. Use 'orange' or 'blue'.")


def extract_line_segments(mask: np.ndarray) -> List[Tuple[Tuple[int,int],Tuple[int,int]]]:
    """Use HoughLinesP to pull out line segments from a binary mask."""
    # clean up
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3,3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    # detect lines
    lines = cv2.HoughLinesP(
        mask, rho=1, theta=np.pi / 180,
        threshold=20,  # lower threshold to pick up fainter segments
        minLineLength=20,  # allow shorter bits
        maxLineGap=5  # bridge slightly larger gaps
    )
    if lines is None:
        return []
    return [((x1, y1), (x2, y2)) for [[x1, y1, x2, y2]] in lines]


def ccw(A, B, C):
    """Tests if the points A,B,C are listed in counter-clockwise order."""
    return (C[1]-A[1]) * (B[0]-A[0]) > (B[1]-A[1]) * (C[0]-A[0])


def segments_intersect(s1, s2) -> bool:
    """Return True if segment s1 intersects s2. Each segment is ((x1,y1),(x2,y2))."""
    A, B = s1
    C, D = s2
    # general intersection test
    return (ccw(A, C, D) != ccw(B, C, D)) and (ccw(A, B, C) != ccw(A, B, D))

DEFAULT_COLOR_1 = "orange"
DEFAULT_COLOR_2 = "blue"


def detect_cross(img: np.ndarray) -> bool:
    """Return True if a line of DEFAULT_COLOR_1 crosses a line of DEFAULT_COLOR_2."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    mask1 = mask_for_color(hsv, DEFAULT_COLOR_1)
    mask2 = mask_for_color(hsv, DEFAULT_COLOR_2)

    segs1 = extract_line_segments(mask1)
    segs2 = extract_line_segments(mask2)

    for s1 in segs1:
        for s2 in segs2:
            if segments_intersect(s1, s2):
                print(">>> Hough intersection:", s1, s2)
                return True

    return False

@router.post("/detect-crossing", summary="Detect crossing in SpotGamma images")
async def detect_crossing_endpoint(img1: UploadFile, img2: UploadFile):
    """
    Detects a cross in two SpotGamma images.
    This is a placeholder function and should be implemented with actual logic.
    """
    # Load images
    im1 = load_image(img1)
    img1.file.close()
    im2 = load_image(img2)
    img2.file.close()

    crosses1 = detect_cross(im1)
    crosses2 = detect_cross(im2)
    result = {
        img1.filename: crosses1,
        img2.filename: crosses2
    }

    return result

