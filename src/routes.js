// Routes (#93, simplification pass). Pure, so the tests can check old
// addresses without a browser.

import { AGENT_RUNS_CAPABILITY } from './data/seed.js';

// Old capability tabs and where they live now: [tab, show].
const OLD_TABS = {
  contract: ['rules', null],
  stakeholders: ['summary', null],
  criteria: ['evidence', 'targets'],
  testing: ['evidence', 'tests'],
  waiting: ['decision', 'approvals'],
};

// Old addresses keep working: each is rewritten to where its page lives now,
// keeping its filters, before anything renders. `focus` is the capability to
// use when an old address named none.
export function canonicalHash(hash, { focus = null } = {}) {
  const [path, qs = ''] = (hash || '#/overview').slice(1).split('?');
  const parts = path.split('/').filter(Boolean);
  const q = new URLSearchParams(qs);
  const at = (p, params) => { const s = params.toString(); return `#/${p}${s ? `?${s}` : ''}`; };
  // Evidence, tests and model runs moved into each capability.
  const intoCapability = (id, show) => {
    q.delete('capability');
    q.delete('show');
    const rest = q.toString();
    return id ? `#/capabilities/${id}?tab=evidence${show ? `&show=${show}` : ''}${rest ? `&${rest}` : ''}` : '#/capabilities';
  };
  if (parts[0] === 'tests' && parts.length === 1) return intoCapability(q.get('capability') || focus, 'tests');
  if (parts[0] === 'evidence' && parts.length === 1) return intoCapability(q.get('capability') || focus, q.get('show') === 'tests' ? 'tests' : 'all');
  if (parts[0] === 'agent-runs' && parts.length === 1) return intoCapability(AGENT_RUNS_CAPABILITY, 'runs');
  if (parts[0] === 'activity' && parts.length === 1) { q.set('show', 'activity'); return at('records', q); }
  if (parts[0] === 'decisions') return at(['records', ...parts.slice(1)].join('/'), q);
  if (parts[0] === 'capabilities' && parts.length === 2) {
    const tab = q.get('tab');
    const show = q.get('show');
    let into = OLD_TABS[tab];
    if (tab === 'decisions') into = show === 'waiting' ? ['decision', 'approvals'] : ['history', null];
    if (tab === 'evidence' && show === 'criteria') into = ['evidence', 'targets'];
    if (tab === 'evidence' && show === 'testing') into = ['evidence', 'tests'];
    if (tab === 'evidence' && show === 'evidence') into = ['evidence', null];
    if (tab === 'monitoring' && show === 'health') into = ['monitoring', null];
    if (into) {
      q.set('tab', into[0]);
      if (into[1]) q.set('show', into[1]); else q.delete('show');
      return at(parts.join('/'), q);
    }
  }
  return hash || '#/overview';
}
