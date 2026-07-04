from fastapi import FastAPI
from compliance_os.api import router as compliance_router
from payroll_os.api import router as payroll_router

app = FastAPI(title="Str8ZeRO OS - Compliance + Payroll")
app.include_router(compliance_router, prefix="/compliance", tags=["compliance"])
app.include_router(payroll_router, prefix="/payroll", tags=["payroll"])