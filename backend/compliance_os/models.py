from __future__ import annotations
from datetime import date
from decimal import Decimal
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, field_validator

class FilingFrequency(str, Enum):
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    SEMIANNUAL = "semiannual"

class BusinessLocationCode(BaseModel):
    location_code: str = Field(..., min_length=6, max_length=6)
    municipality: str
    county: str
    combined_rate: Decimal = Field(..., gt=0, lt=Decimal("0.15"))
    effective_date: date
    expires_date: Optional[date] = None

    @field_validator("location_code")
    @classmethod
    def _location_code_format(cls, v: str) -> str:
        parts = v.split("-")
        if len(parts) != 2 or not all(p.isdigit() for p in parts) or len(parts[0]) != 2 or len(parts[1]) != 3:
            raise ValueError("location_code must match TRD format NN-NNN")
        return v

class GRTCalculationRequest(BaseModel):
    gross_receipts: Decimal = Field(..., ge=0)
    location_code: str = Field(..., min_length=6, max_length=6)
    period_end: date
    deductions: Decimal = Field(default=Decimal("0"), ge=0)

class GRTCalculationResult(BaseModel):
    location_code: str
    municipality: str
    county: str
    rate_applied: Decimal
    rate_effective_date: date
    gross_receipts: Decimal
    deductions: Decimal
    taxable_receipts: Decimal
    tax_due: Decimal
    period_end: date

class FilingFrequency(str, Enum):
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    SEMIANNUAL = "semiannual"

class FilingScheduleRequest(BaseModel):
    average_monthly_liability: Decimal = Field(..., ge=0)

class FilingScheduleResult(BaseModel):
    frequency: FilingFrequency
    reason: str
    next_deadline: date
