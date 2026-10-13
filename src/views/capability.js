// One capability (redesign, 2026-10-12): its identity once, in a header panel
// with four tabs attached, each answering one question.
//   Status   What can it do now, and why?
//   Decide   Should its overall authority change?
//   Monitor  Is it still safe, and delivering value?
//   History  What happened before?
// Rules, approvals, evidence, tests and model runs live under these. Each tab
// is its own module; old tab names are rewritten in routes.js.

import { html, raw, notice, subNav } from '../ui.js';
import { getCapability, capData, waitingActions } from '../store/index.js';
import { testsView } from './tests.js';
import { evidenceView } from './evidence.js';
import { agentRunsView } from './agentruns.js';
import { summaryTab, contractTab, waitingTab } from './cap-status.js';
import { decisionTab, gateActivityCard, criteriaTab, requirementsTab, evidenceTab } from './cap-decide.js';
import { monitoringTab } from './cap-monitor.js';
import { historyTab } from './cap-history.js';
import { newTab } from '../routes.js';

export const TABS = [
  ['status', 'Status'],
  ['decide', 'Decide'],
  ['monitor', 'Monitor'],
  ['history', 'History'],
];
// Supporting evidence under Decide, until Decide folds it into one flow.
const EVIDENCE_VIEWS = [['results', 'Results'], ['all', 'All evidence'], ['requirements', 'Decision requirements'], ['targets', 'Targets'], ['tests', 'Tests'], ['runs', 'Model runs']];

export function capabilityView(state, id, query, { runs = null } = {}) {
  const cap = getCapability(state, id);
  if (!cap) return html`<div class="page-head"><h1>We couldn't find that capability.</h1></div>`;
  const d = capData(state, id);
  // An old tab name (links saved before the redesign) opens where it lives now.
  const old = newTab(query.get('tab'), query.get('show'));
  const requested = old ? old[0] : query.get('tab') || 'status';
  const tab = TABS.some(([k]) => k === requested) ? requested : 'status';
  const show = old ? old[1] : query.get('show');
  const base = `#/capabilities/${cap.id}`;
  const waiting = waitingActions(state, cap.id).length;

  let body;
  switch (tab) {
    case 'decide': {
      const v = EVIDENCE_VIEWS.some(([k]) => k === show) ? show : null;
      const views = subNav([{ href: `${base}?tab=decide`, label: 'Decision', active: !v }, ...EVIDENCE_VIEWS.map(([k, label]) => ({ href: `${base}?tab=decide&show=${k}`, label, active: v === k }))], 'Decide views');
      const inner = !v ? decisionTab(state, cap) : {
        results: () => html`${evidenceTab(state, cap, d)}${gateActivityCard(state, cap)}`,
        all: () => evidenceView(state, cap.id, query, { embedded: true }),
        requirements: () => requirementsTab(state, cap),
        targets: () => criteriaTab(state, cap),
        tests: () => testsView(state, cap.id, query, { embedded: true }),
        runs: () => agentRunsView(state, query, runs, { capabilityId: cap.id, embedded: true }),
      }[v]();
      body = html`${views}${inner}`;
      break;
    }
    case 'monitor': body = monitoringTab(state, cap, d, show); break;
    case 'history': body = historyTab(state, cap); break;
    default:
      body = show === 'rules' ? contractTab(state, cap, d)
        : show === 'approvals' ? waitingTab(state, cap, query)
          : summaryTab(state, cap, d);
  }

  const tabs = html`<nav class="ltabs" aria-label="${cap.name}">${TABS.map(([k, label]) => html`<a class="ltab ${k === tab ? 'is-active' : ''}" href="${base}?tab=${k}" ${k === tab ? raw('aria-current="page"') : ''}>${label}${k === 'status' && waiting ? html` <span class="nav-count" title="Actions waiting for a person">${waiting}</span>` : ''}</a>`)}</nav>`;
  return html`<header class="cap-header">
    <p class="crumb"><a href="#/capabilities">Capabilities</a> / ${cap.name}</p>
    <h1>${cap.name}</h1>
    <p class="cap-desc">${cap.summary}</p>
    ${tabs}
  </header>
  ${query.get('error') ? notice('fail', 'That didn\'t work', query.get('error')) : ''}
  ${query.get('tightened') ? notice('pass', 'Targets tightened', 'Every change only made a target stricter, so it applied straight away. Changes are kept in history.', { link: `${base}?tab=history`, linkText: 'See history' }) : ''}
  <div class="tab-panel">${body}</div>`;
}
