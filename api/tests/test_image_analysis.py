#!/usr/bin/env python3
"""
Test script for the improved image analysis service
"""
import cv2
import numpy as np
import os
from app.services.image_analysis_service import ImageAnalysisService

def test_images():
    """Test the improved image analysis on the sample images"""
    service = ImageAnalysisService()
    
    # Get test directory path
    test_dir = os.path.dirname(__file__)
    
    # Load images directly
    sp500_path = os.path.join(test_dir, "20250707-045626-SP500.png")
    spequities_path = os.path.join(test_dir, "20250707-045626-SPEquities.png")
    
    sp500_img = cv2.imread(sp500_path)
    spequities_img = cv2.imread(spequities_path)
    
    if sp500_img is None or spequities_img is None:
        print("Error: Could not load images")
        return
    
    print("=== SP500 Analysis ===")
    sp500_crossing = service.detect_line_crossing(sp500_img)
    print(f"Crossing detected: {sp500_crossing}")
    
    print("\n=== SPEquities Analysis ===")
    spequities_crossing = service.detect_line_crossing(spequities_img)
    print(f"Crossing detected: {spequities_crossing}")
    
    print("\n=== Summary ===")
    print(f"SP500 should show NO crossing: {sp500_crossing}")
    print(f"SPEquities should show crossing: {spequities_crossing}")

if __name__ == "__main__":
    test_images()