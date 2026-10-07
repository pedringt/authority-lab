import { createStore, getCapability, focusCapability, capData } from './store.js';
import { html } from './ui.js';
import { overviewView } from './views/overview.js';
import { capabilitiesView } from './views/capabilities.js';
import { capabilityView } from './views/capability.js';
import { testsView } from './views/tests.js';
import { evidenceView } from './views/evidence.js';
import { decisionsListView, decisionWorkspaceView, decisionRecordView } from './views/decisions.js';
import { activityView } from './views/activity.js';
import { versionsView } from './views/versions.js';

const store = createStore({ storage: safeStorage() });
const app = document.getElementById('app');
const nav = document.getElementById('nav');

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

// Tests and Evidence are per capability; without one in the query they show
// the capability the workspace is focused on.
function capabilityFor(state, query) {
  const id = query.get('capability');
  return id && getCapability(state, id) ? id : focusCapability(state).id;
}

function render() {
  const state = store.get();
  const { parts, query } = parseRoute();
  const [root, sub, action] = parts;
  let view;
  let title = 'Overview';
  switch (root) {
    case 'capabilities':
      if (sub && action === 'decision') { view = decisionWorkspaceView(state, sub); title = 'Authority decision'; }
      else if (sub && action === 'versions') { view = versionsView(state, sub, query); title = 'Versions'; }
      else if (sub) { view = capabilityView(state, sub, query); title = getCapability(state, sub)?.name || 'Capability'; }
      else { view = capabilitiesView(state); title = 'Capabilities'; }
      break;
    case 'tests': view = testsView(state, capabilityFor(state, query), query); title = 'Tests'; break;
    case 'evidence': view = evidenceView(state, capabilityFor(state, query), query); title = 'Evidence'; break;
    case 'decisions':
      if (sub) { view = decisionRecordView(state, sub); title = 'Decision record'; }
      else { view = decisionsListView(state); title = 'Decisions'; }
      break;
    case 'activity': view = activityView(state, query); title = 'Activity'; break;
    default: view = overviewView(state); title = 'Overview';
  }
  document.title = `${title} · Authority Lab`;

  const pending = state.capabilities.filter((c) => c.decisionRequired).length;
  const counts = {
    overview: state.alerts.length || pending,
    decisions: pending,
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
  const capId = btn.dataset.capability;
  if (action === 'run-tests') runSuite(capId);
  if (action === 'simulate-breach') store.dispatch('simulateBreach', capId);
  if (action === 'authorize') {
    try {
      store.dispatch('authorize', capId, { by: getCapability(store.get(), capId).owner });
      const rec = capData(store.get(), capId).decision.recordId;
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
  const capId = el.dataset.capability;
  if (el.dataset.action === 'select-option') store.dispatch('selectDecision', capId, el.value);
  if (el.dataset.action === 'set-condition') {
    const key = el.dataset.key;
    const value = el.type === 'checkbox' ? el.checked : Number(el.value);
    store.dispatch('setCondition', capId, key, value);
  }
});

document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-action="set-rationale"]');
  if (!el) return;
  // Update state without a full re-render so the caret stays put.
  const capId = el.dataset.capability;
  const value = el.value;
  clearTimeout(rationaleTimer);
  rationaleTimer = setTimeout(() => store.dispatch('setRationale', capId, value), 300);
});
let rationaleTimer = null;

// Simulated suite execution: one scenario every ~110 ms.
let suiteTimer = null;
function runSuite(capId) {
  stopSuite();
  store.dispatch('startTestRun', capId);
  const tick = () => {
    store.dispatch('advanceTestRun', capId);
    if (capData(store.get(), capId).testRun.status === 'running') suiteTimer = setTimeout(tick, 110);
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
