// Routes (#93, simplification pass). Pure, so the tests can check old
// addresses without a browser.

import { AGENT_RUNS_CAPABILITY } from './data/seed.js';

// Old capability tabs and where they live now (#93, simplification pass,
// redesign): [tab, show]. Evidence views moved under Decide; rules, approvals
// and stakeholders under Status.
const EVIDENCE_SHOW = { results: 'results', evidence: 'results', all: 'all', requirements: 'requirements', targets: 'targets', criteria: 'targets', tests: 'tests', testing: 'tests', runs: 'runs' };
export function newTab(tab, show) {
  switch (tab) {
    case 'summary': case 'stakeholders': return ['status', null];
    case 'rules': case 'contract': return ['status', 'rules'];
    case 'waiting': return ['status', 'approvals'];
    case 'decision': return show === 'approvals' ? ['status', 'approvals'] : ['decide', null];
    case 'decisions': return show === 'waiting' ? ['status', 'approvals'] : ['history', null];
    case 'evidence': return ['decide', EVIDENCE_SHOW[show] || 'results'];
    case 'criteria': return ['decide', 'targets'];
    case 'testing': return ['decide', 'tests'];
    case 'monitoring': return ['monitor', show === 'value' ? 'value' : null];
    default: return null;
  }
}

// Old addresses keep working: each is rewritten to where its page lives now,
// keeping its filters, before anything renders. `focus` is the capability to
// use when an old address named none.
export function canonicalHash(hash, { focus = null } = {}) {
  const [path, qs = ''] = (hash || '#/overview').slice(1).split('?');
  const parts = path.split('/').filter(Boolean);
  const q = new URLSearchParams(qs);
  const at = (p, params) => { const s = params.toString(); return `#/${p}${s ? `?${s}` : ''}`; };
  // Evidence, tests and model runs moved into each capability, under Decide.
  const intoCapability = (id, show) => {
    q.delete('capability');
    q.delete('show');
    const rest = q.toString();
    return id ? `#/capabilities/${id}?tab=decide${show ? `&show=${show}` : ''}${rest ? `&${rest}` : ''}` : '#/capabilities';
  };
  if (parts[0] === 'tests' && parts.length === 1) return intoCapability(q.get('capability') || focus, 'tests');
  if (parts[0] === 'evidence' && parts.length === 1) return intoCapability(q.get('capability') || focus, q.get('show') === 'tests' ? 'tests' : 'all');
  if (parts[0] === 'agent-runs' && parts.length === 1) return intoCapability(AGENT_RUNS_CAPABILITY, 'runs');
  if (parts[0] === 'activity' && parts.length === 1) { q.set('show', 'activity'); return at('records', q); }
  if (parts[0] === 'decisions') return at(['records', ...parts.slice(1)].join('/'), q);
  if (parts[0] === 'capabilities' && parts.length === 2 && q.has('tab')) {
    const into = newTab(q.get('tab'), q.get('show'));
    if (into) {
      q.set('tab', into[0]);
      if (into[1]) q.set('show', into[1]); else q.delete('show');
      return at(parts.join('/'), q);
    }
  }
  return hash || '#/overview';
}
