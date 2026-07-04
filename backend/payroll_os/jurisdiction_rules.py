from __future__ import annotations
import json
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Dict, List, Optional

DATA_DIR = Path(__file__).parent / "data"

class UnknownJurisdictionError(Exception):
    pass

class UnverifiedJurisdictionError(Exception):
    pass

class NoBundleForDateError(Exception):
    pass

@dataclass(frozen=True)
class ResolvedWageRules:
    jurisdiction_id: str
    state_id: str
    minimum_wage: Decimal
    tipped_minimum_cash_wage: Optional[Decimal]
    overtime_threshold_hours: Decimal
    overtime_multiplier: Decimal
    daily_overtime: bool
    doubletime: bool
    source_notes: List[str]

class JurisdictionRules:
    def __init__(self, data_dir=None):
        self._data_dir = data_dir or DATA_DIR
        self._registry: Dict[str, dict] = self._load_registry()
        self._bundle_cache: Dict[str, dict] = {}

    def _load_registry(self):
        with open(self._data_dir / "jurisdictions.json") as f:
            return {e["jurisdiction_id"]: e for e in json.load(f)}

    def _load_state_bundle(self, state_id, pay_period_date):
        suffix = state_id.split("-")[-1].lower()
        filename = f"us_{suffix}_{pay_period_date.year}.json"
        if filename not in self._bundle_cache:
            path = self._data_dir / filename
            if not path.exists():
                raise NoBundleForDateError(f"No bundle for {state_id} covering {pay_period_date}")
            with open(path) as f:
                self._bundle_cache[filename] = json.load(f)
        bundle = self._bundle_cache[filename]
        start = date.fromisoformat(bundle["effective_start"])
        end = date.fromisoformat(bundle["effective_end"])
        if not (start <= pay_period_date <= end):
            raise NoBundleForDateError(f"Bundle {filename} does not cover {pay_period_date}")
        return bundle

    def resolve(self, work_jurisdiction_id: str, pay_period_date: date) -> ResolvedWageRules:
        if work_jurisdiction_id not in self._registry:
            raise UnknownJurisdictionError(f"{work_jurisdiction_id!r} not in registry")
        entry = self._registry[work_jurisdiction_id]
        state_id = entry["parent"] or entry["jurisdiction_id"]
        bundle = self._load_state_bundle(state_id, pay_period_date)
        local = next((o for o in bundle.get("local_overrides",[]) if o["jurisdiction_id"]==work_jurisdiction_id), None)
        if local is None:
            min_wage = Decimal(str(bundle["minimum_wage"]))
            tipped = Decimal(str(bundle["tipped_minimum_cash_wage"])) if bundle.get("tipped_minimum_cash_wage") else None
        else:
            if local["minimum_wage"] is None:
                raise UnverifiedJurisdictionError(f"{work_jurisdiction_id!r} has minimum_wage=null in bundle")
            min_wage = Decimal(str(local["minimum_wage"]))
            tipped = Decimal(str(local["tipped_minimum_cash_wage"])) if local.get("tipped_minimum_cash_wage") else None
        ot = bundle["overtime_rule"]
        return ResolvedWageRules(
            jurisdiction_id=work_jurisdiction_id, state_id=state_id,
            minimum_wage=min_wage, tipped_minimum_cash_wage=tipped,
            overtime_threshold_hours=Decimal(str(ot["threshold_hours"])),
            overtime_multiplier=Decimal(str(ot["multiplier"])),
            daily_overtime=ot["daily_overtime"], doubletime=ot["doubletime"],
            source_notes=bundle["metadata"]["source_notes"],
        )

    def list_known_jurisdictions(self):
        return list(self._registry.keys())