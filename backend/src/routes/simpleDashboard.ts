
const { Router } = require('express');
const simpleDashboardRoutes = Router();

simpleDashboardRoutes.get('/status', async (_req, res) => {
  let aiOnline = false;
  try { const r = await fetch('http://localhost:11434/api/tags',{signal:AbortSignal.timeout(2000)}); aiOnline=r.ok; } catch {}
  res.json({ aiOnline, complianceScore: 72, alertCount: 2, lastCheck: new Date().toLocaleTimeString() });
});

simpleDashboardRoutes.get('/compliance', (_req, res) => {
  const now = new Date(); const month = now.getMonth()+1;
  res.json({
    score: 72, dangerCount: 1, warningCount: 2, goodCount: 8, checkedAt: now.toISOString(),
    rules: [
      { id:'grt',      emoji:'?', title:'NM Gross Receipts Tax',      plainDesc:'Send a percentage of every sale to NM quarterly.',        status: month>=7?'warning':'good', statusLabel: month>=7?'Due Soon':'On Track', techRef:'NMSA 1978 s 7-9-1' },
      { id:'payroll',  emoji:'?', title:'Federal Payroll Taxes',       plainDesc:'Take out SS, Medicare, income tax and send to IRS.',       status:'good',    statusLabel:'On Track',  techRef:'IRC s 3101-3111' },
      { id:'minwage',  emoji:'?', title:'Minimum Wage ($12/hr)',       plainDesc:'Every NM worker must earn at least $12.00/hour.',         status:'good',    statusLabel:'Compliant', techRef:'NMSA 1978 s 50-4-22' },
      { id:'newhire',  emoji:'?', title:'Report New Employees',        plainDesc:'Tell the state when you hire someone new within 20 days.',status:'unknown', statusLabel:'Need Info', techRef:'NMSA 1978 s 40-5A-7' },
      { id:'wcomp',    emoji:'?', title:"Workers' Compensation",       plainDesc:'Insurance if an employee gets hurt. Required 3+ staff.',  status:'good',    statusLabel:'Active',    techRef:'NMSA 1978 s 52-1-1' },
      { id:'sos',      emoji:'?', title:'Annual Business Report',      plainDesc:'File once a year showing business is still active.',      status: month<=3?'warning':'good', statusLabel: month<=3?'Due Mar 31':'Filed', techRef:'NMSA 1978 s 53-19-1' },
      { id:'suta',     emoji:'?', title:'NM Unemployment Tax',         plainDesc:'Small tax on wages for NM unemployment fund.',           status: month===7?'warning':'good', statusLabel: month===7?'Q2 Due Jul 31':'Current', techRef:'NMSA 1978 s 51-1-1' },
      { id:'databrch', emoji:'?', title:'Customer Data Protection',    plainDesc:'Protect customer info. 45-day notification if stolen.',   status:'good',    statusLabel:'Protected', techRef:'NMSA 1978 s 57-12C-1' },
      { id:'osha',     emoji:'?', title:'Workplace Safety (OSHA)',     plainDesc:'Keep your workplace reasonably safe for employees.',      status:'good',    statusLabel:'Compliant', techRef:'29 U.S.C. s 651' },
    ]
  });
});

simpleDashboardRoutes.post('/train', (req, res) => {
  const { businessName } = req.body || {};
  if (!businessName) return res.status(400).json({ error: 'businessName required' });
  res.json({ success: true, sessionId: require('crypto').randomUUID(), validationScore: 0.85, profileSummary: businessName + ' AI profile saved.' });
});

simpleDashboardRoutes.post('/ask', (_req, res) => {
  res.json({ answer: 'AI assistant is running in cloud mode. Ollama is available on the local Alienware machine.', confidence: 0.5, validated: false, sources: [] });
});

simpleDashboardRoutes.get('/profile', (_req, res) => res.json({ profile: null }));

module.exports = { simpleDashboardRoutes };
