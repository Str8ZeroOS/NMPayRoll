from __future__ import annotations
from decimal import Decimal
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field, model_validator

class EmployeeWageType(str, Enum):
    STANDARD = "standard"
    TIPPED = "tipped"

class GrossPayRequest(BaseModel):
    employee_id: str
    workweek_start: str
    regular_hours: Decimal = Field(..., ge=0)
    base_rate: Decimal = Field(..., gt=0)
    wage_type: EmployeeWageType = EmployeeWageType.STANDARD
    tips_reported: Decimal = Field(default=Decimal("0"), ge=0)
    jurisdiction: str = Field(default="US-NM")
    contractual_doubletime_hours: Decimal = Field(default=Decimal("0"), ge=0)
    contractual_doubletime_rate: Optional[Decimal] = Field(default=None, gt=0)

    @model_validator(mode="after")
    def _check_doubletime(self):
        if self.contractual_doubletime_hours > 0 and self.contractual_doubletime_rate is None:
            raise ValueError("contractual_doubletime_rate required when hours > 0")
        return self

class GrossPayResult(BaseModel):
    employee_id: str
    workweek_start: str
    jurisdiction: str
    minimum_wage_applied: Decimal
    straight_time_hours: Decimal
    overtime_hours: Decimal
    doubletime_hours: Decimal
    regular_pay: Decimal
    overtime_pay: Decimal
    doubletime_pay: Decimal
    tips_reported: Decimal
    tip_credit_makeup: Decimal
    gross_pay: Decimal
    notes: List[str] = Field(default_factory=list)