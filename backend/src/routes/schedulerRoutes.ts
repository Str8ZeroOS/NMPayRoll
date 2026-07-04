
'use strict';
const router = require('express').Router();
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const DATA = process.env.STR8ZERO_DATA || '/srv/str8zero-os/data';
const SCHED_FILE = path.join(DATA, 'schedule.json');
const EMP_FILE   = path.join(DATA, 'employees.json');
fs.mkdirSync(DATA, { recursive: true });

function loadFile(f: string, def: any) { try { return JSON.parse(fs.readFileSync(f,'utf8')); } catch { return def; } }
function saveFile(f: string, d: any)   { try { fs.writeFileSync(f,JSON.stringify(d,null,2)); } catch {} }

const NM_MIN_WAGE: Record<string,number> = { 'Santa Fe':15.40,'Albuquerque':12.00,'default':12.00 };

// ── EMPLOYEES ─────────────────────────────────────────────────────────────────
router.get('/employees', (_req: any, res: any) => {
  res.json({ employees: loadFile(EMP_FILE,[]), source:'STR8ZERO OS Employee Registry' });
});

router.post('/employees', (req: any, res: any) => {
  const { name, role, hourlyRate, city='Albuquerque', tipped=false, hireDate, weeklyHours=40 } = req.body||{};
  if (!name||!hourlyRate) return res.status(400).json({ error:'name and hourlyRate required' });
  const minWage = NM_MIN_WAGE[city]||NM_MIN_WAGE.default;
  const rate    = parseFloat(hourlyRate);
  const emps    = loadFile(EMP_FILE,[]);
  const emp     = { id:crypto.randomUUID(), name, role:role||'Staff', hourlyRate:rate, city,
    tipped, hireDate:hireDate||new Date().toISOString().slice(0,10), weeklyHours,
    addedAt:new Date().toISOString(),
    compliance: {
      meetsMinWage: tipped ? (rate >= 3.00) : (rate >= minWage),
      minWageRequired: tipped ? 3.00 : minWage,
      warning: (!tipped && rate < minWage) ? `BELOW NM MINIMUM: $${minWage}/hr required in ${city}. Source: NM DWS · NMSA §50-4-22` : null,
    }
  };
  emps.unshift(emp); if(emps.length>200) emps.splice(200);
  saveFile(EMP_FILE, emps);
  res.json({ success:true, employee:emp });
});

router.delete('/employees/:id', (req: any, res: any) => {
  let emps = loadFile(EMP_FILE,[]);
  emps = emps.filter((e:any) => e.id !== req.params.id);
  saveFile(EMP_FILE, emps);
  res.json({ success:true });
});

// ── SHIFTS ────────────────────────────────────────────────────────────────────
router.get('/shifts', (req: any, res: any) => {
  const { week, employeeId } = req.query;
  let shifts = loadFile(SCHED_FILE,[]);
  if (week)       shifts = shifts.filter((s:any) => s.week === week);
  if (employeeId) shifts = shifts.filter((s:any) => s.employeeId === employeeId);
  res.json({ shifts, total:shifts.length });
});

router.post('/shifts', (req: any, res: any) => {
  const { employeeId, date, startTime, endTime, role, notes } = req.body||{};
  if (!employeeId||!date||!startTime||!endTime) return res.status(400).json({ error:'employeeId, date, startTime, endTime required' });

  const [sh,sm] = startTime.split(':').map(Number);
  const [eh,em] = endTime.split(':').map(Number);
  const hours   = Math.max(0, ((eh*60+em)-(sh*60+sm))/60);
  const week    = getWeek(new Date(date));
  const shifts  = loadFile(SCHED_FILE,[]);
  const emps    = loadFile(EMP_FILE,[]);
  const emp     = emps.find((e:any) => e.id === employeeId);

  // NM labor law checks
  const warnings: string[] = [];
  if (hours > 8)  warnings.push('Shift exceeds 8 hours — NM overtime rules may apply for weekly hours over 40. NMSA §50-4-22');
  if (hours > 12) warnings.push('ALERT: 12+ hour shift. Ensure breaks per NM labor law.');

  // Check weekly hours for this employee this week
  const weekShifts = shifts.filter((s:any) => s.employeeId===employeeId && s.week===week);
  const weeklyHrs  = weekShifts.reduce((a:number,s:any)=>a+s.hours,0) + hours;
  if (weeklyHrs > 40) warnings.push(`Overtime triggered: ${weeklyHrs.toFixed(1)} hrs this week. Overtime pay required at 1.5x rate after 40 hrs. FLSA + NM NMSA §50-4-22`);

  const shift = { id:crypto.randomUUID(), employeeId, employeeName:emp?.name||'Unknown',
    date, startTime, endTime, hours:parseFloat(hours.toFixed(2)), week, role:role||emp?.role||'Staff',
    notes:notes||'', estimatedPay:emp ? (hours * emp.hourlyRate).toFixed(2) : null,
    overtimePay: weeklyHrs>40 && emp ? ((weeklyHrs-40)*emp.hourlyRate*0.5).toFixed(2) : null,
    warnings, createdAt:new Date().toISOString() };

  shifts.unshift(shift); if(shifts.length>2000) shifts.splice(2000);
  saveFile(SCHED_FILE, shifts);
  res.json({ success:true, shift, warnings });
});

router.delete('/shifts/:id', (req: any, res: any) => {
  let shifts = loadFile(SCHED_FILE,[]);
  shifts = shifts.filter((s:any) => s.id !== req.params.id);
  saveFile(SCHED_FILE, shifts);
  res.json({ success:true });
});

// ── WEEKLY SUMMARY ────────────────────────────────────────────────────────────
router.get('/summary/:week', (req: any, res: any) => {
  const shifts = loadFile(SCHED_FILE,[]).filter((s:any) => s.week===req.params.week);
  const emps   = loadFile(EMP_FILE,[]);
  const byEmp: Record<string,any> = {};
  for (const s of shifts) {
    if (!byEmp[s.employeeId]) byEmp[s.employeeId] = { employeeId:s.employeeId, name:s.employeeName, shifts:[], totalHours:0, regularHours:0, overtimeHours:0, estimatedPay:0, warnings:[] };
    byEmp[s.employeeId].shifts.push(s);
    byEmp[s.employeeId].totalHours += s.hours;
    byEmp[s.employeeId].warnings.push(...(s.warnings||[]));
  }
  for (const id in byEmp) {
    const e   = byEmp[id];
    const emp = emps.find((x:any) => x.id===id);
    e.regularHours  = Math.min(e.totalHours, 40);
    e.overtimeHours = Math.max(0, e.totalHours-40);
    if (emp) {
      e.regularPay  = (e.regularHours * emp.hourlyRate).toFixed(2);
      e.overtimePay = (e.overtimeHours * emp.hourlyRate * 1.5).toFixed(2);
      e.estimatedPay= (parseFloat(e.regularPay)+parseFloat(e.overtimePay)).toFixed(2);
    }
    e.warnings = [...new Set(e.warnings)];
  }
  const totalPayroll = Object.values(byEmp).reduce((a:number,e:any)=>a+parseFloat(e.estimatedPay||0),0);
  res.json({ week:req.params.week, employees:Object.values(byEmp), totalPayroll:totalPayroll.toFixed(2), totalShifts:shifts.length, complianceNote:'Overtime calculated per FLSA 40hr/week rule. NM follows federal FLSA standards.' });
});

// ── COMPLIANCE CHECK ──────────────────────────────────────────────────────────
router.get('/compliance', (_req: any, res: any) => {
  const emps = loadFile(EMP_FILE,[]);
  const issues: any[] = [];
  for (const e of emps) {
    const min = NM_MIN_WAGE[e.city]||NM_MIN_WAGE.default;
    if (!e.tipped && e.hourlyRate < min) issues.push({ employee:e.name, issue:`Below NM minimum wage: $${e.hourlyRate}/hr < $${min}/hr required in ${e.city}`, severity:'CRITICAL', source:'NM DWS · NMSA §50-4-22' });
    if (e.tipped && e.hourlyRate < 3.00) issues.push({ employee:e.name, issue:`Tipped employee base rate $${e.hourlyRate}/hr below NM minimum $3.00/hr`, severity:'CRITICAL', source:'NM DWS · NMSA §50-4-22' });
    const daysSinceHire = Math.floor((Date.now()-new Date(e.hireDate).getTime())/86400000);
    if (daysSinceHire <= 20) issues.push({ employee:e.name, issue:`New hire — must file NM New Hire Report within 20 days (${20-daysSinceHire} days remaining)`, severity:'ACTION', source:'NM DWS · NMSA §40-5A-7' });
  }
  res.json({ totalEmployees:emps.length, issues, compliant:issues.length===0, checkedAt:new Date().toISOString() });
});

function getWeek(d: Date): string {
  const s = new Date(d); s.setHours(0,0,0,0); s.setDate(s.getDate()-s.getDay());
  return s.toISOString().slice(0,10);
}

module.exports = { schedulerRoutes: router };
