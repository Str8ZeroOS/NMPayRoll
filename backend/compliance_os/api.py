from __future__ import annotations
from datetime import date
from fastapi import APIRouter, HTTPException
from .grt_calculator import GRTCalculator
from .grt_rates import RateNotFoundError, RateRepository
from .models import FilingScheduleRequest, GRTCalculationRequest, GRTCalculationResult

router = APIRouter()
_rate_repo = RateRepository()
_calculator = GRTCalculator(_rate_repo)

@router.post("/grt/calculate", response_model=GRTCalculationResult)
def calculate_grt(payload: GRTCalculationRequest):
    try:
        return _calculator.calculate(payload)
    except RateNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

@router.get("/grt/locations")
def list_locations():
    return [loc.model_dump(mode="json") for loc in _rate_repo.all_locations()]

@router.get("/health")
def health():
    return {"status": "ok", "module": "compliance_os"}