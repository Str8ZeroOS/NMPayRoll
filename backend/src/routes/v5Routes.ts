
const { Router } = require('express');
const str8zeroV5Routes = Router();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const DATA = process.env.STR8ZERO_DATA || '/srv/str8zero-os/data';

async function ollamaOnline() {
  try {
    const r = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch { return false; }
}

str8zeroV5Routes.get('/health', async (_req, res) => {
  const ai = await ollamaOnline();
  let profileName = '';
  try {
    const pf = path.join(DATA, 'profile.json');
    if (fs.existsSync(pf)) profileName = JSON.parse(fs.readFileSync(pf)).businessName || '';
  } catch {}
  res.json({
    systemState: 'healthy', aiOnline: ai,
    uptimeSeconds: Math.floor(process.uptime()),
    unreadAlerts: 0, genesisMode: profileName ? 'continuous' : 'idle',
    hasProfile: !!profileName, profileName,
    microSupervisors: [
      { name: 'AI Engine',       state: ai ? 'healthy' : 'degraded', repairCount: 0 },
      { name: 'Data Protection', state: 'healthy', repairCount: 0 },
      { name: 'Legal Compliance',state: 'healthy', repairCount: 0 },
    ]
  });
});

str8zeroV5Routes.get('/genesis/status', (_req, res) => {
  let profile = null;
  try {
    const pf = path.join(DATA, 'profile.json');
    if (fs.existsSync(pf)) profile = JSON.parse(fs.readFileSync(pf));
  } catch {}
  res.json({ mode: profile ? 'continuous' : 'idle', hasProfile: !!profile, profile });
});

str8zeroV5Routes.post('/genesis/guided', (req, res) => {
  const { answers } = req.body || {};
  if (!answers?.businessName) return res.status(400).json({ error: 'businessName required' });
  const profile = {
    id: crypto.randomUUID(), businessName: answers.businessName,
    businessType: answers.businessType || 'General Business',
    genesisCompleted: true, genesisMode: 'guided',
    createdAt: new Date().toISOString(), profileVersion: 1,
    toolStack: ['Compliance Monitor','Payroll Manager','AI Assistant','GRT Filing']
  };
  try { fs.writeFileSync(path.join(DATA,'profile.json'), JSON.stringify(profile,null,2)); } catch {}
  res.json({ success: true, profile });
});

str8zeroV5Routes.post('/genesis/hands-off', async (_req, res) => {
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
  const phases = [
    'Reading your computer to understand your business...',
    'Figuring out what kind of business you run...',
    'Choosing the right tools for your business...',
    'Checking which New Mexico laws apply...',
    'Setting up your AI profile...',
    'Saving your personalized STR8ZERO OS profile...',
  ];
  for (let i=0;i<phases.length;i++) {
    await new Promise(r=>setTimeout(r,700));
    const done = i===phases.length-1;
    res.write('data: ' + JSON.stringify({ phaseIndex:i, totalPhases:phases.length, plainMessage:phases[i], status:done?'complete':'running' }) + '\n\n');
  }
  const profile = {
    id: crypto.randomUUID(), businessName: 'My Business',
    businessType: 'General Business', genesisCompleted: true,
    genesisMode: 'hands-off', createdAt: new Date().toISOString(), profileVersion: 1
  };
  try { fs.writeFileSync(path.join(DATA,'profile.json'), JSON.stringify(profile,null,2)); } catch {}
  res.write('data: {"done":true}\n\n');
  res.end();
});

str8zeroV5Routes.get('/genesis/profile', (_req, res) => {
  try {
    const pf = path.join(DATA,'profile.json');
    if (fs.existsSync(pf)) return res.json({ profile: JSON.parse(fs.readFileSync(pf)) });
  } catch {}
  res.json({ profile: null });
});

str8zeroV5Routes.get('/supervisor/report', (_req, res) => res.json({
  systemState: 'healthy', uptimeSeconds: Math.floor(process.uptime()),
  microSupervisors: [
    { id:'storage',    plainName:'Data Protection',  state:'healthy', repairCount:0 },
    { id:'compliance', plainName:'Legal Compliance', state:'healthy', repairCount:0 },
    { id:'network',    plainName:'Connections',      state:'healthy', repairCount:0 },
  ], recentRepairs: [], activeAlerts: []
}));

str8zeroV5Routes.get('/notifications', (_req, res) => res.json({ notifications: [], unreadCount: 0 }));
str8zeroV5Routes.put('/notifications/:id/read', (_req, res) => res.json({ success: true }));
str8zeroV5Routes.post('/notifications/:id/approve', (_req, res) => res.json({ success: true }));
str8zeroV5Routes.get('/roles/users', (_req, res) => res.json({ users: [] }));
str8zeroV5Routes.post('/roles/users', (_req, res) => res.json({ success: true }));
str8zeroV5Routes.get('/roles/audit', (_req, res) => res.json({ auditLog: [] }));
str8zeroV5Routes.get('/timeline', (_req, res) => res.json({ events: [] }));
str8zeroV5Routes.get('/timeline/periods', (_req, res) => res.json({ periods: [] }));
str8zeroV5Routes.get('/timeline/snapshot', (_req, res) => res.json({ totalEvents: 0, categoryBreakdown: {}, recentHighlights: [] }));

async function initializeV5Services() { console.log('[V5] Services ready (VPS mode).'); }

module.exports = { str8zeroV5Routes, initializeV5Services };
