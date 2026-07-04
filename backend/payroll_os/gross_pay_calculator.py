from __future__ import annotations
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from .jurisdiction_rules import JurisdictionRules
from .models import EmployeeWageType, GrossPayRequest, GrossPayResult

CENT = Decimal("0.01")
_default_rules = JurisdictionRules()

class MinimumWageViolationError(Exception):
    pass

def _round(v): return v.quantize(CENT, rounding=ROUND_HALF_UP)

def calculate_gross_pay(request: GrossPayRequest, rules: JurisdictionRules = _default_rules) -> GrossPayResult:
    notes = []
    resolved = rules.resolve(request.jurisdiction, date.fromisoformat(request.workweek_start))
    threshold = resolved.overtime_threshold_hours
    straight_time_hours = min(request.regular_hours, threshold)
    overtime_hours = max(Decimal("0"), request.regular_hours - threshold)

    if request.wage_type == EmployeeWageType.STANDARD:
        if request.base_rate < resolved.minimum_wage:
            raise MinimumWageViolationError(f"base_rate {request.base_rate} below {resolved.minimum_wage}")
        applicable_minimum = resolved.minimum_wage
    else:
        tipped_floor = resolved.tipped_minimum_cash_wage
        if tipped_floor is None:
            raise MinimumWageViolationError(f"No verified tipped rate for {request.jurisdiction}")
        if request.base_rate < tipped_floor:
            raise MinimumWageViolationError(f"base_rate {request.base_rate} below tipped floor {tipped_floor}")
        applicable_minimum = resolved.minimum_wage

    regular_pay = _round(straight_time_hours * request.base_rate)
    overtime_pay = _round(overtime_hours * request.base_rate * resolved.overtime_multiplier)
    doubletime_hours = request.contractual_doubletime_hours
    doubletime_pay = Decimal("0")
    if doubletime_hours > 0:
        doubletime_pay = _round(doubletime_hours * request.contractual_doubletime_rate)
        notes.append("Double-time applied per contractual request -- not statutory in NM.")

    tip_credit_makeup = Decimal("0")
    if request.wage_type == EmployeeWageType.TIPPED:
        total_hours = straight_time_hours + overtime_hours + doubletime_hours
        required = _round(total_hours * applicable_minimum)
        earned = regular_pay + overtime_pay + doubletime_pay + request.tips_reported
        if earned < required:
            tip_credit_makeup = _round(required - earned)
            notes.append(f"Tip credit makeup {tip_credit_makeup} applied.")

    return GrossPayResult(
        employee_id=request.employee_id, workweek_start=request.workweek_start,
        jurisdiction=request.jurisdiction, minimum_wage_applied=applicable_minimum,
        straight_time_hours=straight_time_hours, overtime_hours=overtime_hours,
        doubletime_hours=doubletime_hours, regular_pay=regular_pay,
        overtime_pay=overtime_pay, doubletime_pay=doubletime_pay,
        tips_reported=request.tips_reported, tip_credit_makeup=tip_credit_makeup,
        gross_pay=_round(regular_pay+overtime_pay+doubletime_pay+tip_credit_makeup),
        notes=notes,
    )