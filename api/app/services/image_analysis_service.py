"""
Image analysis service for detecting line intersections in SpotGamma charts
"""
import cv2
import numpy as np
from typing import List, Tuple
from fastapi import HTTPException, UploadFile


class ImageAnalysisService:
    """Service for analyzing chart images and detecting line intersections"""
    
    def __init__(self):
        # Color definitions in RGB
        self.orange_rgb = (216, 114, 58)
        self.blue_rgb = (58, 121, 216)
        
        # Convert to BGR for OpenCV
        self.orange_bgr = np.uint8([[[self.orange_rgb[2], self.orange_rgb[1], self.orange_rgb[0]]]])
        self.blue_bgr = np.uint8([[[self.blue_rgb[2], self.blue_rgb[1], self.blue_rgb[0]]]])
        
        # Convert to HSV for color detection
        self.orange_hsv = cv2.cvtColor(self.orange_bgr, cv2.COLOR_BGR2HSV)[0, 0]
        self.blue_hsv = cv2.cvtColor(self.blue_bgr, cv2.COLOR_BGR2HSV)[0, 0]
        
        # Tolerance for color detection
        self.tolerance = {"hue": 10, "saturation": 80, "value": 80}
        
        # Calculate color ranges
        self._calculate_color_ranges()
    
    def _calculate_color_ranges(self) -> None:
        """Calculate HSV color ranges for orange and blue"""
        dh, ds, dv = self.tolerance["hue"], self.tolerance["saturation"], self.tolerance["value"]
        
        # Orange color range
        self.lower_orange = np.array([
            max(0, self.orange_hsv[0] - dh),
            max(0, self.orange_hsv[1] - ds),
            max(0, self.orange_hsv[2] - dv),
        ], dtype=np.uint8)
        
        self.upper_orange = np.array([
            min(179, self.orange_hsv[0] + dh),
            255,
            255,
        ], dtype=np.uint8)
        
        # Blue color range
        self.lower_blue = np.array([
            max(0, self.blue_hsv[0] - dh),
            max(0, self.blue_hsv[1] - ds),
            max(0, self.blue_hsv[2] - dv),
        ], dtype=np.uint8)
        
        self.upper_blue = np.array([
            min(179, self.blue_hsv[0] + dh),
            255,
            255,
        ], dtype=np.uint8)
    
    def load_image_from_upload(self, file: UploadFile) -> np.ndarray:
        """Load image from FastAPI UploadFile"""
        data = file.file.read()
        img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            raise HTTPException(status_code=400, detail=f"Cannot decode image {file.filename}")
        return img
    
    def create_color_mask(self, hsv: np.ndarray, color: str) -> np.ndarray:
        """Create binary mask for specified color"""
        if color == 'orange':
            return cv2.inRange(hsv, self.lower_orange, self.upper_orange)
        elif color == 'blue':
            return cv2.inRange(hsv, self.lower_blue, self.upper_blue)
        else:
            raise ValueError(f"Unsupported color: {color!r}. Use 'orange' or 'blue'.")
    
    def extract_line_segments(self, mask: np.ndarray) -> List[Tuple[Tuple[int, int], Tuple[int, int]]]:
        """Extract line segments from binary mask using HoughLinesP"""
        # Clean up the mask
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
        
        # Detect lines using Probabilistic Hough Transform
        lines = cv2.HoughLinesP(
            mask,
            rho=1,
            theta=np.pi / 180,
            threshold=20,
            minLineLength=14,
            maxLineGap=5
        )
        
        if lines is None:
            return []
        
        return [((x1, y1), (x2, y2)) for [[x1, y1, x2, y2]] in lines]
    
    def _ccw(self, A: Tuple[int, int], B: Tuple[int, int], C: Tuple[int, int]) -> bool:
        """Test if points A, B, C are listed in counter-clockwise order"""
        return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0])
    
    def _segments_intersect(self, s1: Tuple[Tuple[int, int], Tuple[int, int]], 
                           s2: Tuple[Tuple[int, int], Tuple[int, int]]) -> bool:
        """Check if two line segments intersect"""
        A, B = s1
        C, D = s2
        return (self._ccw(A, C, D) != self._ccw(B, C, D)) and (self._ccw(A, B, C) != self._ccw(A, B, D))
    
    def detect_line_crossing(self, img: np.ndarray, color1: str = "orange", color2: str = "blue") -> bool:
        """Detect if lines of color1 cross lines of color2"""
        # Convert to HSV for better color detection
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        
        # Create masks for both colors
        mask1 = self.create_color_mask(hsv, color1)
        mask2 = self.create_color_mask(hsv, color2)
        
        # Extract line segments
        segments1 = self.extract_line_segments(mask1)
        segments2 = self.extract_line_segments(mask2)
        
        # Check for intersections
        for s1 in segments1:
            for s2 in segments2:
                if self._segments_intersect(s1, s2):
                    print(f">>> Line intersection detected: {s1} crosses {s2}")
                    return True
        
        return False
    
    def analyze_chart_crossing(self, img1: UploadFile, img2: UploadFile) -> dict:
        """Analyze both charts for line crossings"""
        # Load images
        image1 = self.load_image_from_upload(img1)
        img1.file.close()
        
        image2 = self.load_image_from_upload(img2)
        img2.file.close()
        
        # Detect crossings
        crossing1 = self.detect_line_crossing(image1)
        crossing2 = self.detect_line_crossing(image2)
        
        return {
            img1.filename: crossing1,
            img2.filename: crossing2
        }