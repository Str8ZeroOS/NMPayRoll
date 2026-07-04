from __future__ import annotations
from datetime import date
from decimal import Decimal
from typing import Dict, List, Optional
from .models import BusinessLocationCode

class RateNotFoundError(Exception):
    pass

SEED_RATE_TABLE = [
    BusinessLocationCode(location_code="02-100", municipality="Albuquerque", county="Bernalillo", combined_rate=Decimal("0.07625"), effective_date=date(2025,7,1), expires_date=None),
    BusinessLocationCode(location_code="01-123", municipality="Santa Fe", county="Santa Fe", combined_rate=Decimal("0.081875"), effective_date=date(2025,7,1), expires_date=None),
    BusinessLocationCode(location_code="07-105", municipality="Las Cruces", county="Dona Ana", combined_rate=Decimal("0.0839"), effective_date=date(2025,7,1), expires_date=None),
]

class RateRepository:
    def __init__(self, rows=None):
        self._rows = rows if rows is not None else list(SEED_RATE_TABLE)
        self._index: Dict[str, List[BusinessLocationCode]] = {}
        for row in self._rows:
            self._index.setdefault(row.location_code, []).append(row)

    def get_rate(self, location_code: str, as_of: date) -> BusinessLocationCode:
        for row in self._index.get(location_code, []):
            if row.effective_date <= as_of and (row.expires_date is None or as_of <= row.expires_date):
                return row
        raise RateNotFoundError(f"No GRT rate found for {location_code!r} on {as_of.isoformat()}")

    def all_locations(self):
        return list(self._rows)