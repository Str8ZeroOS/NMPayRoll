from __future__ import annotations
from fastapi import APIRouter, HTTPException
from .gross_pay_calculator import MinimumWageViolationError, calculate_gross_pay
from .jurisdiction_rules import JurisdictionRules, NoBundleForDateError, UnknownJurisdictionError, UnverifiedJurisdictionError
from .models import GrossPayRequest, GrossPayResult

router = APIRouter()
_rules = JurisdictionRules()

@router.post("/gross-pay/calculate", response_model=GrossPayResult)
def calculate(payload: GrossPayRequest):
    try:
        return calculate_gross_pay(payload)
    except UnknownJurisdictionError as e:
        raise HTTPException(404, detail=str(e))
    except (UnverifiedJurisdictionError, NoBundleForDateError) as e:
        raise HTTPException(422, detail=str(e))
    except MinimumWageViolationError as e:
        raise HTTPException(400, detail=str(e))

@router.get("/jurisdictions")
def list_jurisdictions():
    return {"known_jurisdictions": _rules.list_known_jurisdictions()}

@router.get("/health")
def health():
    return {"status": "ok", "module": "payroll_os"}