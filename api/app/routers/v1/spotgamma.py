from fastapi import APIRouter, HTTPException, UploadFile
import os
import platform
import base64
import numpy as np
import cv2
from typing import Tuple, List
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import asyncio

HIRO_SPY_URL = "https://dashboard.spotgamma.com/hiro?eh-model=legacy&sym=S%26P+500"
HIRO_EQUITIES_URL = "https://dashboard.spotgamma.com/hiro?eh-model=legacy&sym=S%26P+Equities"

router = APIRouter(prefix="/v1/spotgamma", tags=["v1 – spotgamma"])

def login(driver, username: str, password: str) -> None:
    driver.get("https://dashboard.spotgamma.com/login")
    username_field = driver.find_element(By.ID, 'login-username')
    password_field = driver.find_element(By.ID, 'login-password')

    # Clear fields and enter credentials
    username_field.clear()
    password_field.clear()
    username_field.send_keys(username)
    password_field.send_keys(password)

    # Ensure the password field is fully populated
    WebDriverWait(driver, 10).until(
        lambda d: password_field.get_attribute("value") == password
    )

    # Click the login button
    driver.find_element(By.TAG_NAME, 'button').click()

    # Wait for the post-login page to load
    WebDriverWait(driver, 30).until(EC.url_contains("dashboard"))

@router.get("/hiro", summary="Fetch SpotGamma Hiro screenshots")
async def hiro_screens():
    username = os.getenv("SPOTGAMMA_USERNAME")
    password = os.getenv("SPOTGAMMA_PASSWORD")
    if not username or not password:
        raise HTTPException(status_code=500, detail="SpotGamma credentials not configured")

    def capture_chart(driver, url: str) -> str:
        """Navigate to ``url`` and return a base64 screenshot of the chart."""
        driver.get(url)
        WebDriverWait(driver, 100).until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, 'button[aria-label="chart sizing options"]')
            )
        )
        driver.find_element(By.CSS_SELECTOR, 'button[aria-label="chart sizing options"]').click()
        open_full_btn = WebDriverWait(driver, 10).until(
            lambda d: d.find_element(By.XPATH, '//button[normalize-space(text())="Open Full Screen"]')
        )
        open_full_btn.click()
        return base64.b64encode(driver.get_screenshot_as_png()).decode("utf-8")

    def capture():
        options = webdriver.ChromeOptions()
        options.add_argument("--headless")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument('--remote-debugging-port=9222')
        options.add_argument("--window-size=1920,1080")
        print(">>> Platform", platform.machine())
        is_pi = platform.machine().startswith(("arm", "aarch64"))
        if is_pi:
            options.binary_location = "/usr/bin/chromium"
            service = Service("/usr/bin/chromedriver")
        else:
            # Rely on PATH or defaults on local/WSL
            service = Service()

        driver = webdriver.Chrome(service=service, options=options)
        try:
            login(driver, username, password)
            img1 = base64.b64encode(driver.get_screenshot_as_png()).decode("utf-8")
            img2 = capture_chart(driver, HIRO_EQUITIES_URL)
            # WebDriverWait(driver, 30).until(
            #     EC.presence_of_element_located(
            #         (By.CSS_SELECTOR, 'button[aria-label="open drawer"]')
            #     )
            # )
            # driver.find_element(By.CSS_SELECTOR, 'button[aria-label="open drawer"]').click()
            #
            # img1 = capture_chart(driver, HIRO_SPY_URL)
            # img2 = capture_chart(driver, HIRO_EQUITIES_URL)
        finally:
            driver.quit()
        return img1, img2

    img1, img2 = await asyncio.to_thread(capture)

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
        minLineLength=14,  # allow shorter bits
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

