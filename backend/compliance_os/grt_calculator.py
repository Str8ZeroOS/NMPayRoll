from __future__ import annotations
from decimal import ROUND_HALF_UP, Decimal
from .grt_rates import RateRepository
from .models import GRTCalculationRequest, GRTCalculationResult

CENT = Decimal("0.01")

class GRTCalculator:
    def __init__(self, rate_repository: RateRepository):
        self._rates = rate_repository

    def calculate(self, request: GRTCalculationRequest) -> GRTCalculationResult:
        if request.deductions > request.gross_receipts:
            raise ValueError("deductions cannot exceed gross_receipts")
        rate_row = self._rates.get_rate(request.location_code, as_of=request.period_end)
        taxable_receipts = request.gross_receipts - request.deductions
        tax_due = (taxable_receipts * rate_row.combined_rate).quantize(CENT, rounding=ROUND_HALF_UP)
        return GRTCalculationResult(
            location_code=rate_row.location_code, municipality=rate_row.municipality,
            county=rate_row.county, rate_applied=rate_row.combined_rate,
            rate_effective_date=rate_row.effective_date, gross_receipts=request.gross_receipts,
            deductions=request.deductions, taxable_receipts=taxable_receipts,
            tax_due=tax_due, period_end=request.period_end,
        )