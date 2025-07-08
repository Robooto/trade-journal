"""
SpotGamma service for handling authentication and data fetching
"""
import os
import base64
import platform
import asyncio
from datetime import datetime
from typing import Tuple, List, Dict, Any
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class SpotGammaService:
    """Service for interacting with SpotGamma platform"""
    
    HIRO_SPY_URL = "https://dashboard.spotgamma.com/hiro?eh-model=legacy&sym=S%26P+500"
    HIRO_EQUITIES_URL = "https://dashboard.spotgamma.com/hiro?eh-model=legacy&sym=S%26P+Equities"
    
    def __init__(self):
        self.username = os.getenv("SPOTGAMMA_USERNAME")
        self.password = os.getenv("SPOTGAMMA_PASSWORD")
        
        if not self.username or not self.password:
            raise ValueError("SpotGamma credentials not configured")
    
    def _get_driver_config(self) -> Tuple[Service, webdriver.ChromeOptions]:
        """Configure Chrome driver based on platform"""
        options = webdriver.ChromeOptions()
        options.add_argument("--headless")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument('--remote-debugging-port=9222')
        options.add_argument("--window-size=1920,1080")
        
        is_pi = platform.machine().startswith(("arm", "aarch64"))
        if is_pi:
            options.binary_location = "/usr/bin/chromium"
            service = Service("/usr/bin/chromedriver")
        else:
            service = Service()
        
        return service, options
    
    def _login(self, driver: webdriver.Chrome) -> None:
        """Login to SpotGamma platform"""
        driver.get("https://dashboard.spotgamma.com/login")
        
        username_field = driver.find_element(By.ID, 'login-username')
        password_field = driver.find_element(By.ID, 'login-password')
        
        # Clear fields and enter credentials
        username_field.clear()
        password_field.clear()
        username_field.send_keys(self.username)
        password_field.send_keys(self.password)
        
        # Ensure the password field is fully populated
        WebDriverWait(driver, 10).until(
            lambda d: password_field.get_attribute("value") == self.password
        )
        
        # Click the login button
        driver.find_element(By.TAG_NAME, 'button').click()
        
        # Wait for the post-login page to load
        WebDriverWait(driver, 30).until(EC.url_contains("home"))
    
    def _capture_chart(self, driver: webdriver.Chrome, url: str) -> str:
        """Navigate to URL and return a base64 screenshot of the chart"""
        driver.get(url)
        
        # Wait for chart to load
        WebDriverWait(driver, 100).until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, 'button[aria-label="chart sizing options"]')
            )
        )
        
        # Click chart sizing options
        driver.find_element(By.CSS_SELECTOR, 'button[aria-label="chart sizing options"]').click()
        
        # Click open full screen
        open_full_btn = WebDriverWait(driver, 10).until(
            lambda d: d.find_element(By.XPATH, '//button[normalize-space(text())="Open Full Screen"]')
        )
        open_full_btn.click()
        
        return base64.b64encode(driver.get_screenshot_as_png()).decode("utf-8")
    
    def _capture_screenshots(self) -> Tuple[str, str]:
        """Capture screenshots from both SPY and Equities charts"""
        service, options = self._get_driver_config()
        driver = webdriver.Chrome(service=service, options=options)
        
        try:
            # Login
            self._login(driver)
            
            # Wait for navigation drawer
            WebDriverWait(driver, 30).until(
                EC.presence_of_element_located(
                    (By.CSS_SELECTOR, 'button[aria-label="open drawer"]')
                )
            )
            driver.find_element(By.CSS_SELECTOR, 'button[aria-label="open drawer"]').click()
            
            # Capture both charts
            spy_screenshot = self._capture_chart(driver, self.HIRO_SPY_URL)
            equities_screenshot = self._capture_chart(driver, self.HIRO_EQUITIES_URL)
            
            return spy_screenshot, equities_screenshot
            
        finally:
            driver.quit()
    
    async def get_hiro_screenshots(self) -> Dict[str, Any]:
        """Get Hiro screenshots asynchronously"""
        spy_img, equities_img = await asyncio.to_thread(self._capture_screenshots)
        
        # Generate timestamp
        ts = datetime.utcnow()
        timestamp = ts.isoformat() + "Z"
        safe_ts = ts.strftime("%Y%m%d-%H%M%S")
        
        images = [
            {"name": f"{safe_ts}-SP500.png", "data": spy_img, "source_url": self.HIRO_SPY_URL},
            {"name": f"{safe_ts}-SPEquities.png", "data": equities_img, "source_url": self.HIRO_EQUITIES_URL},
        ]
        
        return {"timestamp": timestamp, "images": images}