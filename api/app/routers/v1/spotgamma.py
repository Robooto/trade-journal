"""
SpotGamma API routes for fetching screenshots and analyzing chart data
"""
from fastapi import APIRouter, HTTPException, UploadFile

from app.services.spotgamma_service import SpotGammaService
from app.services.image_analysis_service import ImageAnalysisService
from app.schema import HiroScreenshotsResponse

router = APIRouter(prefix="/v1/spotgamma", tags=["v1 – spotgamma"])


@router.get("/hiro", summary="Fetch SpotGamma Hiro screenshots", response_model=HiroScreenshotsResponse)
async def hiro_screens():
    """Fetch SpotGamma Hiro screenshots for SPY and Equities"""
    try:
        service = SpotGammaService()
        return await service.get_hiro_screenshots()
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to capture screenshots: {str(e)}")


@router.post("/detect-crossing", summary="Detect crossing in SpotGamma images")
async def detect_crossing_endpoint(img1: UploadFile, img2: UploadFile):
    """
    Detects line crossings in two SpotGamma chart images.
    Analyzes orange and blue line intersections in the uploaded images.
    """
    try:
        analysis_service = ImageAnalysisService()
        return analysis_service.analyze_chart_crossing(img1, img2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to analyze images: {str(e)}")