
'use strict';
const router = require('express').Router();
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const DATA = process.env.STR8ZERO_DATA || '/srv/str8zero-os/data';
fs.mkdirSync(DATA, { recursive: true });

// ── 2026 NM TAX CONSTANTS ─────────────────────────────────────────────────────
const NM_TAX = {
  // NM State Income Tax Brackets (2026) — Annual
  brackets: {
    single: [
      { min:0,      max:5500,  rate:0.017 },
      { min:5500,   max:11000, rate:0.032 },
      { min:11000,  max:16000, rate:0.047 },
      { min:16000,  max:Infinity, rate:0.049 },
    ],
    married: [
      { min:0,      max:8000,  rate:0.017 },
      { min:8000,   max:16000, rate:0.032 },
      { min:16000,  max:24000, rate:0.047 },
      { min:24000,  max:Infinity, rate:0.049 },
    ],
  },
  personalExemption: 4000,
  standardDeduction: { single: 6350, married: 12700 },
};

const FED_TAX = {
  // 2026 Federal brackets (single, annual)
  brackets: {
    single: [
      { min:0,       max:11600,  rate:0.10 },
      { min:11600,   max:47150,  rate:0.12 },
      { min:47150,   max:100525, rate:0.22 },
      { min:100525,  max:191950, rate:0.24 },
      { min:191950,  max:243725, rate:0.32 },
      { min:243725,  max:609350, rate:0.35 },
      { min:609350,  max:Infinity, rate:0.37 },
    ],
    married: [
      { min:0,       max:23200,  rate:0.10 },
      { min:23200,   max:94300,  rate:0.12 },
      { min:94300,   max:201050, rate:0.22 },
      { min:201050,  max:383900, rate:0.24 },
      { min:383900,  max:487450, rate:0.32 },
      { min:487450,  max:731200, rate:0.35 },
      { min:731200,  max:Infinity, rate:0.37 },
    ],
  },
  standardDeduction: { single: 14600, married: 29200 },
  ssRate: 0.062, ssWageBase: 176100,
  medicareRate: 0.0145, medicareExtra: 0.009, medicareExtraThreshold: 200000,
};

const NM_EMPLOYER = {
  suta: { newRate: 0.01, wageBase: 30100 },
  futa: { rate: 0.006, wageBase: 7000 }, // net after state credit
};

const NM_MIN_WAGE: Record<string,number> = {
  'Santa Fe': 15.40, 'Albuquerque': 12.00, 'Las Cruces': 13.01,
  'Taos': 12.00, 'Farmington': 12.00, 'Roswell': 12.00, 'default': 12.00,
};

// ── TAX CALCULATION HELPERS ───────────────────────────────────────────────────
function calcBracketTax(taxableIncome: number, brackets: any[]): number {
  let tax = 0;
  for (const b of brackets) {
    if (taxableIncome <= b.min) break;
    const taxable = Math.min(taxableIncome, b.max) - b.min;
    tax += taxable * b.rate;
  }
  return Math.max(0, tax);
}

function calcNMWithholding(annualGross: number, filing: string, exemptions: number): number {
  const brackets = NM_TAX.brackets[filing] || NM_TAX.brackets.single;
  const exemptionAmt = exemptions * NM_TAX.personalExemption;
  const stdDed = NM_TAX.standardDeduction[filing] || NM_TAX.standardDeduction.single;
  const taxable = Math.max(0, annualGross - stdDed - exemptionAmt);
  return calcBracketTax(taxable, brackets);
}

function calcFedWithholding(annualGross: number, filing: string, allowances: number): number {
  const brackets = FED_TAX.brackets[filing] || FED_TAX.brackets.single;
  const stdDed   = FED_TAX.standardDeduction[filing] || FED_TAX.standardDeduction.single;
  const allowAmt = allowances * 4300; // 2026 allowance value
  const taxable  = Math.max(0, annualGross - stdDed - allowAmt);
  return calcBracketTax(taxable, brackets);
}

// ── POST /api/payroll/calculate ───────────────────────────────────────────────
router.post('/calculate', (req: any, res: any) => {
  const {
    grossPay, payPeriod = 'biweekly', filingStatus = 'single',
    exemptions = 1, allowances = 1, ytdGross = 0,
    ytdSS = 0, city = 'Albuquerque', tipped = false, tipAmount = 0,
  } = req.body || {};

  if (!grossPay) return res.status(400).json({ error: 'grossPay required' });

  const gross    = parseFloat(grossPay);
  const ytd      = parseFloat(ytdGross);
  const periods  = { weekly:52, biweekly:26, semimonthly:24, monthly:12 };
  const perYear  = periods[payPeriod] || 26;
  const annualGross = gross * perYear;

  // SS (6.2% up to $176,100 wage base)
  const ssRemaining  = Math.max(0, FED_TAX.ssWageBase - ytd);
  const ssTaxable    = Math.min(gross, ssRemaining);
  const ssEmployee   = ssTaxable * FED_TAX.ssRate;

  // Medicare
  const medicareBase  = gross * FED_TAX.medicareRate;
  const medicareExtra = Math.max(0, (ytd + gross) - FED_TAX.medicareExtraThreshold) > 0
    ? gross * FED_TAX.medicareExtra : 0;
  const medicare = medicareBase + medicareExtra;

  // Federal withholding (annualized then divided)
  const fedAnnual  = calcFedWithholding(annualGross, filingStatus, allowances);
  const fedPeriod  = fedAnnual / perYear;

  // NM state withholding
  const nmAnnual = calcNMWithholding(annualGross, filingStatus, exemptions);
  const nmPeriod = nmAnnual / perYear;

  // Net pay
  const totalDeductions = ssEmployee + medicare + fedPeriod + nmPeriod;
  const netPay          = gross - totalDeductions;

  // Minimum wage check
  const minWage = NM_MIN_WAGE[city] || NM_MIN_WAGE.default;

  // Tipped employee check
  let tippedWarning = null;
  if (tipped) {
    const tips     = parseFloat(tipAmount) || 0;
    const baseRate = 3.00; // NM tipped minimum
    // If tips + $3 base < min wage, employer must make up difference
    const effectiveHourly = baseRate + (tips / 40); // assume 40hr week
    if (effectiveHourly < minWage) {
      tippedWarning = `WARNING: Employee effective rate $${effectiveHourly.toFixed(2)}/hr is below NM minimum of $${minWage}/hr. Employer must supplement $${(minWage - effectiveHourly).toFixed(2)}/hr. Source: NM DWS · NMSA §50-4-22`;
    }
  }

  res.json({
    input: { grossPay: gross, payPeriod, filingStatus, exemptions, allowances, city },
    employee: {
      grossPay:        gross.toFixed(2),
      socialSecurity:  ssEmployee.toFixed(2),
      medicare:        medicare.toFixed(2),
      federalTax:      fedPeriod.toFixed(2),
      nmStateTax:      nmPeriod.toFixed(2),
      totalDeductions: totalDeductions.toFixed(2),
      netPay:          netPay.toFixed(2),
    },
    annualized: {
      grossAnnual:    annualGross.toFixed(2),
      fedTaxAnnual:   fedAnnual.toFixed(2),
      nmTaxAnnual:    nmAnnual.toFixed(2),
      effectiveFedRate: ((fedAnnual / annualGross) * 100).toFixed(1) + '%',
      effectiveNMRate:  ((nmAnnual  / annualGross) * 100).toFixed(1) + '%',
    },
    minWage:  { city, rate: minWage, compliant: (gross / 80) >= minWage },
    tipped:   tippedWarning,
    sources:  ['IRS Pub 15-T 2026','NM TRD','NM DWS · NMSA §50-4-22'],
    calculatedAt: new Date().toISOString(),
  });
});

// ── POST /api/payroll/employer-cost ───────────────────────────────────────────
router.post('/employer-cost', (req: any, res: any) => {
  const { grossPay, ytdGross = 0, wcClass = 'general' } = req.body || {};
  if (!grossPay) return res.status(400).json({ error: 'grossPay required' });

  const gross = parseFloat(grossPay);
  const ytd   = parseFloat(ytdGross);

  // Employer SS match
  const ssRemaining = Math.max(0, FED_TAX.ssWageBase - ytd);
  const ssEmployer  = Math.min(gross, ssRemaining) * FED_TAX.ssRate;

  // Employer Medicare match
  const medicareEmployer = gross * FED_TAX.medicareRate;

  // FUTA (0.6% net on first $7,000)
  const futaRemaining = Math.max(0, NM_EMPLOYER.futa.wageBase - ytd);
  const futa          = Math.min(gross, futaRemaining) * NM_EMPLOYER.futa.rate;

  // NM SUTA (1.0% new employer on first $30,100)
  const sutaRemaining = Math.max(0, NM_EMPLOYER.suta.wageBase - ytd);
  const suta          = Math.min(gross, sutaRemaining) * NM_EMPLOYER.suta.newRate;

  // Workers comp estimate (varies by class code — general office ~$0.50/$100)
  const wcRates: Record<string,number> = {
    general: 0.005, restaurant: 0.025, construction: 0.08,
    clerical: 0.003, retail: 0.012, healthcare: 0.018,
  };
  const wcRate = wcRates[wcClass] || wcRates.general;
  const wc     = gross * wcRate;

  const totalCost    = gross + ssEmployer + medicareEmployer + futa + suta + wc;
  const burdenPct    = ((totalCost - gross) / gross * 100).toFixed(1);

  res.json({
    grossPay:         gross.toFixed(2),
    employerCosts: {
      socialSecurity: ssEmployer.toFixed(2),
      medicare:       medicareEmployer.toFixed(2),
      futa:           futa.toFixed(2),
      nmSUTA:         suta.toFixed(2),
      workersComp:    wc.toFixed(2),
      totalBurden:    (ssEmployer+medicareEmployer+futa+suta+wc).toFixed(2),
    },
    totalEmployerCost: totalCost.toFixed(2),
    laborBurdenPct:    burdenPct + '%',
    annualCost:        (totalCost * 26).toFixed(2),
    note: `For every $${gross.toFixed(0)} paid to employee, actual employer cost is $${totalCost.toFixed(2)} (${burdenPct}% burden)`,
    sources: ['IRS Pub 15 2026','NM DWS SUTA','NM WCA workers comp rates'],
    wcClass, calculatedAt: new Date().toISOString(),
  });
});

// ── POST /api/payroll/quarterly ───────────────────────────────────────────────
router.post('/quarterly', (req: any, res: any) => {
  const { employees = [], quarter = 'Q3', year = 2026 } = req.body || {};
  const quarterDates: Record<string,{start:string,end:string,due941:string,dueSUTA:string}> = {
    Q1: { start:'Jan 1',  end:'Mar 31', due941:'Apr 30', dueSUTA:'Apr 30' },
    Q2: { start:'Apr 1',  end:'Jun 30', due941:'Jul 31', dueSUTA:'Jul 31' },
    Q3: { start:'Jul 1',  end:'Sep 30', due941:'Oct 31', dueSUTA:'Oct 31' },
    Q4: { start:'Oct 1',  end:'Dec 31', due941:'Jan 31', dueSUTA:'Jan 31' },
  };
  const qDates = quarterDates[quarter] || quarterDates.Q3;
  const totalGross = employees.reduce((a:number,e:any) => a + parseFloat(e.gross||0), 0);
  const totalSS    = totalGross * FED_TAX.ssRate * 2; // both sides
  const totalMed   = totalGross * FED_TAX.medicareRate * 2;
  const totalSUTA  = Math.min(totalGross, employees.length * NM_EMPLOYER.suta.wageBase) * NM_EMPLOYER.suta.newRate;

  res.json({
    quarter, year, period: qDates,
    summary: {
      totalGrossPaid:     totalGross.toFixed(2),
      form941Liability:   (totalSS + totalMed).toFixed(2),
      nmSUTALiability:    totalSUTA.toFixed(2),
      employeeCount:      employees.length,
    },
    filingDeadlines: {
      form941:  `${qDates.due941} ${year + (quarter==='Q4'?1:0)} — File at irs.gov`,
      nmES903A: `${qDates.dueSUTA} ${year + (quarter==='Q4'?1:0)} — File at dws.state.nm.us`,
      form940:  'January 31 annually — FUTA annual return',
    },
    checkboxes: [
      { task:'Verify all employee W-4s are current', source:'IRS' },
      { task:'Reconcile gross wages to payroll records', source:'IRS Pub 15' },
      { task:'Deposit 941 taxes on schedule (monthly or semi-weekly)', source:'IRS' },
      { task:'File Form 941 by due date', source:'IRS · IRC §3102' },
      { task:'File NM ES-903A SUTA return', source:'NM DWS · NMSA §51-1-1' },
      { task:'Report any new hires within 20 days', source:'NM DWS · NMSA §40-5A-7' },
    ],
    sources: ['IRS Form 941','NM DWS ES-903A','NMSA §51-1-1'],
  });
});

// ── GET /api/payroll/nm-tax-tables ────────────────────────────────────────────
router.get('/nm-tax-tables', (_req: any, res: any) => {
  res.json({
    year: 2026,
    nmIncomeTax: {
      description: 'New Mexico Personal Income Tax Withholding Tables',
      source: 'NM TRD Publication FYI-104 · tax.newmexico.gov',
      brackets: NM_TAX.brackets,
      personalExemption: NM_TAX.personalExemption,
      standardDeduction: NM_TAX.standardDeduction,
    },
    federalTax: {
      ssRate: '6.2%', ssWageBase: '$176,100',
      medicareRate: '1.45%', medicareExtraRate: '0.9% over $200K',
      source: 'IRS Publication 15-T 2026',
    },
    nmEmployer: {
      suta: { newEmployerRate:'1.0%', wageBase:'$30,100', form:'ES-903A', source:'NM DWS' },
      futa: { netRate:'0.6%', wageBase:'$7,000', form:'940', source:'IRS' },
    },
    minWage: NM_MIN_WAGE,
  });
});

module.exports = { payrollRoutes: router };
