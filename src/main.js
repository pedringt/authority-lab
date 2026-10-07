import * as seed from './data/seed.js';
import { createStore, getCapability, readiness } from './store.js';
import { html, esc } from './ui.js';
import { overviewView } from './views/overview.js';
import { capabilitiesView } from './views/capabilities.js';
import { capabilityView } from './views/capability.js';
import { testsView } from './views/tests.js';
import { evidenceView } from './views/evidence.js';
import { decisionsListView, decisionWorkspaceView, decisionRecordView } from './views/decisions.js';
import { activityView } from './views/activity.js';

const store = createStore({ storage: safeStorage() });
const app = document.getElementById('app');
const nav = document.getElementById('nav');
const topbar = document.getElementById('topbar');

const NAV = [
  ['overview', 'Overview'],
  ['capabilities', 'Capabilities'],
  ['tests', 'Tests'],
  ['evidence', 'Evidence'],
  ['decisions', 'Decisions'],
  ['activity', 'Activity'],
];

function safeStorage() {
  try {
    const s = window.localStorage;
    s.setItem('__probe', '1');
    s.removeItem('__probe');
    return s;
  } catch {
    return null;
  }
}

function parseRoute() {
  const hash = location.hash || '#/overview';
  const [path, qs] = hash.slice(1).split('?');
  const parts = path.split('/').filter(Boolean);
  return { parts, query: new URLSearchParams(qs || '') };
}

function render() {
  const state = store.get();
  const { parts, query } = parseRoute();
  const [root, sub] = parts;
  let view;
  let title = 'Overview';
  switch (root) {
    case 'capabilities':
      if (sub) { view = capabilityView(state, sub, query); title = getCapability(state, sub)?.name || 'Capability'; }
      else { view = capabilitiesView(state); title = 'Capabilities'; }
      break;
    case 'tests': view = testsView(state, query); title = 'Tests'; break;
    case 'evidence': view = evidenceView(state, query); title = 'Evidence'; break;
    case 'decisions':
      if (sub === 'new') { view = decisionWorkspaceView(state); title = 'Authority decision'; }
      else if (sub) { view = decisionRecordView(state, sub); title = 'Decision record'; }
      else { view = decisionsListView(state); title = 'Decisions'; }
      break;
    case 'activity': view = activityView(state); title = 'Activity'; break;
    default: view = overviewView(state); title = 'Overview';
  }
  document.title = `${title} · Authority Lab`;

  const cap = getCapability(state, 'refund-recommendation');
  const counts = {
    overview: state.alerts.length || (cap.decisionRequired ? 1 : 0),
    decisions: cap.decisionRequired ? 1 : 0,
  };
  nav.innerHTML = String(html`${NAV.map(([k, label]) => html`<a class="nav-link ${root === k || (!root && k === 'overview') ? 'is-active' : ''}" href="#/${k}" ${root === k ? 'aria-current="page"' : ''}>${label}${counts[k] ? html`<span class="nav-count ${state.alerts.length && k === 'overview' ? 'is-alert' : ''}">${counts[k]}</span>` : ''}</a>`)}`);

  const y = window.scrollY;
  app.innerHTML = String(view);
  if (lastRoute === location.hash) window.scrollTo(0, y); else window.scrollTo(0, 0);
  lastRoute = location.hash;
}
let lastRoute = null;

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.tagName === 'INPUT' || btn.tagName === 'TEXTAREA') return;
  const action = btn.dataset.action;
  if (action === 'run-tests') runSuite();
  if (action === 'simulate-breach') store.dispatch('simulateBreach');
  if (action === 'authorize') {
    try {
      store.dispatch('authorize', { by: 'maya' });
      const rec = store.get().decision.recordId;
      location.hash = `#/decisions/${rec}`;
    } catch (err) {
      alert(err.message);
    }
  }
  if (action === 'reset') {
    store.dispatch('reset');
    stopSuite();
    location.hash = '#/overview';
    render();
  }
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.dataset.action === 'select-option') store.dispatch('selectDecision', el.value);
  if (el.dataset.action === 'set-condition') {
    const key = el.dataset.key;
    const value = el.type === 'checkbox' ? el.checked : Number(el.value);
    store.dispatch('setCondition', key, value);
  }
});

document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-action="set-rationale"]');
  if (!el) return;
  // Update state without a full re-render so the caret stays put.
  pendingRationale = el.value;
  clearTimeout(rationaleTimer);
  rationaleTimer = setTimeout(() => store.dispatch('setRationale', pendingRationale), 300);
});
let pendingRationale = null;
let rationaleTimer = null;

// Simulated suite execution: one scenario every ~110 ms.
let suiteTimer = null;
function runSuite() {
  stopSuite();
  store.dispatch('startTestRun');
  const tick = () => {
    store.dispatch('advanceTestRun');
    if (store.get().testRun.status === 'running') suiteTimer = setTimeout(tick, 110);
  };
  suiteTimer = setTimeout(tick, 250);
}
function stopSuite() {
  clearTimeout(suiteTimer);
  suiteTimer = null;
}

store.subscribe(render);
window.addEventListener('hashchange', render);
render();
