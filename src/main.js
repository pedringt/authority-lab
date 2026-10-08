import * as seed from './data/seed.js';
import { createStore, getCapability, focusCapability, capData, actor, vagueNameWarning } from './store.js';
import { html } from './ui.js';
import { overviewView } from './views/overview.js';
import { capabilitiesView } from './views/capabilities.js';
import { capabilityView } from './views/capability.js';
import { testsView } from './views/tests.js';
import { evidenceView } from './views/evidence.js';
import { decisionsListView, decisionWorkspaceView, decisionRecordView } from './views/decisions.js';
import { activityView } from './views/activity.js';
import { versionsView } from './views/versions.js';
import { addCapabilityView, setupView } from './views/setup.js';
import { contractBuilderView } from './views/contract.js';
import { criteriaEditorView } from './views/criteria.js';
import { proposeView, proposalView } from './views/proposals.js';

const store = createStore({ storage: safeStorage() });
const app = document.getElementById('app');
const nav = document.getElementById('nav');
const acting = document.getElementById('acting');

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
      if (sub === 'new') { view = addCapabilityView(state, query); title = 'Add a capability'; }
      else if (sub && action === 'decision') { view = decisionWorkspaceView(state, sub); title = 'Authority decision'; }
      else if (sub && action === 'versions') { view = versionsView(state, sub, query); title = 'Versions'; }
      else if (sub && action === 'setup') { view = setupView(state, sub, query); title = 'Setup'; }
      else if (sub && action === 'contract' && parts[3] === 'build') { view = contractBuilderView(state, sub, query); title = 'Contract builder'; }
      else if (sub && action === 'criteria' && parts[3] === 'edit') { view = criteriaEditorView(state, sub, query); title = 'Success criteria'; }
      else if (sub && action === 'amend' && parts[3]) { view = proposeView(state, sub, parts[3], query); title = 'Amend'; }
      else if (sub && action === 'proposals' && parts[3]) { view = proposalView(state, sub, parts[3], query); title = 'Proposed amendment'; }
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

  // "Acting as" picker. Default is the owner of the capability in context.
  const contextCap = root === 'capabilities' && sub && sub !== 'new' ? sub : null;
  const current = actor(state, contextCap);
  const defaultOwner = contextCap && getCapability(state, contextCap) ? getCapability(state, contextCap).owner : focusCapability(state).owner;
  acting.innerHTML = String(html`<label class="acting"><span class="acting-label">Acting as</span><select data-action="set-acting" aria-label="Acting as">
    <option value="" ${state.actingAs ? '' : 'selected'}>${seed.people[defaultOwner].name} (owner)</option>
    ${Object.entries(seed.people).map(([k, p]) => html`<option value="${k}" ${state.actingAs === k ? 'selected' : ''}>${p.name} · ${p.role}</option>`)}
  </select></label>`);
  acting.dataset.current = current;

  const y = window.scrollY;
  const saved = captureForms();
  app.innerHTML = String(view);
  restoreForms(saved);
  if (lastRoute === location.hash) window.scrollTo(0, y); else window.scrollTo(0, 0);
  lastRoute = location.hash;
}
let lastRoute = null;

// Forms are uncontrolled; keep what the person typed across a re-render.
function captureForms() {
  const out = {};
  for (const form of app.querySelectorAll('[data-form]')) {
    const values = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox' || el.type === 'radio') values[`${el.name}=${el.value}`] = el.checked;
      else values[el.name] = el.value;
    }
    out[form.dataset.form] = values;
  }
  return out;
}
function restoreForms(saved) {
  for (const form of app.querySelectorAll('[data-form]')) {
    const values = saved[form.dataset.form];
    if (!values || form.dataset.form.startsWith('add-line-') || form.dataset.form === 'edit-line' || form.dataset.form === 'save-criteria' || form.dataset.form.startsWith('propose-') || form.dataset.form === 'reject-proposal') continue;
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox' || el.type === 'radio') { if (`${el.name}=${el.value}` in values) el.checked = values[`${el.name}=${el.value}`]; }
      else if (el.name in values) el.value = values[el.name];
    }
    const nameEl = form.querySelector('[data-action="check-name"]');
    if (nameEl) nameEl.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.tagName === 'INPUT' || btn.tagName === 'TEXTAREA') return;
  const action = btn.dataset.action;
  const capId = btn.dataset.capability;
  if (action === 'run-tests') { try { runSuite(capId); } catch (err) { alert(err.message); } }
  if (action === 'simulate-breach') store.dispatch('simulateBreach', capId);
  if (action === 'authorize') {
    try {
      store.dispatch('authorize', capId, { by: actor(store.get(), capId) });
      const rec = capData(store.get(), capId).decision.recordId;
      location.hash = `#/decisions/${rec}`;
    } catch (err) {
      alert(err.message);
    }
  }
  const builder = () => `#/capabilities/${capId}/contract/build`;
  const tryDispatch = (fn) => {
    try { fn(); if (location.hash.includes('?error=') || location.hash.includes('?edit=')) location.hash = builder(); }
    catch (err) { location.hash = `${builder()}?error=${encodeURIComponent(err.message)}`; }
  };
  if (action === 'contract-start') tryDispatch(() => store.dispatch('startContractDraft', capId, { by: actor(store.get(), capId) }));
  if (action === 'suggestion-accept') tryDispatch(() => store.dispatch('reviewSuggestion', capId, btn.dataset.line, { decision: 'accept' }));
  if (action === 'suggestion-reject') tryDispatch(() => store.dispatch('reviewSuggestion', capId, btn.dataset.line, { decision: 'reject' }));
  if (action === 'line-remove') tryDispatch(() => store.dispatch('removeContractLine', capId, btn.dataset.line));
  if (action === 'section-confirm') tryDispatch(() => store.dispatch('confirmSection', capId, btn.dataset.section, true));
  if (action === 'section-unconfirm') tryDispatch(() => store.dispatch('confirmSection', capId, btn.dataset.section, false));
  if (action === 'contract-finalize') {
    tryDispatch(() => store.dispatch('finalizeContract', capId, { by: actor(store.get(), capId) }));
    if (!location.hash.includes('?error=')) location.hash = `#/capabilities/${capId}?tab=contract`;
  }
  if (action === 'proposal-approve') {
    const pid = btn.dataset.proposal;
    try { store.dispatch('approveProposal', capId, pid, { by: actor(store.get(), capId) }); if (location.hash.includes('?error=')) location.hash = `#/capabilities/${capId}/proposals/${pid}`; }
    catch (err) { location.hash = `#/capabilities/${capId}/proposals/${pid}?error=${encodeURIComponent(err.message)}`; }
    return;
  }
  if (action === 'row-add') {
    const tpl = document.getElementById(`row-${btn.dataset.kind}`);
    const body = app.querySelector(`[data-rows="${btn.dataset.kind}"]`);
    if (tpl && body) { body.appendChild(tpl.content.cloneNode(true)); body.lastElementChild.querySelector('input[type=text]').focus(); }
    return;
  }
  if (action === 'row-remove') { btn.closest('tr').remove(); return; }
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
  if (el.dataset.action === 'set-acting') { store.dispatch('setActingAs', el.value || null); return; }
  if (el.dataset.action === 'choose-owner') { store.dispatch('setActingAs', el.value || null); return; }
  if (el.dataset.action === 'select-option') store.dispatch('selectDecision', capId, el.value);
  if (el.dataset.action === 'set-condition') {
    const key = el.dataset.key;
    const value = el.type === 'checkbox' ? el.checked : Number(el.value);
    store.dispatch('setCondition', capId, key, value);
  }
});

function readCriteriaRows(form) {
  const rows = (kind) => [...form.querySelectorAll(`[data-rows="${kind}"] tr`)];
  const val = (tr, name) => (tr.querySelector(`[name="${name}"]`) || {}).value || '';
  const criteria = rows('criteria').map((tr) => ({ id: val(tr, 'c-id') || undefined, name: val(tr, 'c-name'), target: val(tr, 'c-target'), note: val(tr, 'c-note'), source: val(tr, 'c-source') || undefined, current: val(tr, 'c-current') || undefined, status: val(tr, 'c-status') || undefined }));
  const requirements = rows('requirements').map((tr) => ({ id: val(tr, 'r-id') || undefined, text: val(tr, 'r-text'), source: val(tr, 'r-source') || undefined }));
  return { criteria, requirements };
}

document.addEventListener('submit', (e) => {
  const proposeForm = e.target.closest('[data-form="propose-criteria"], [data-form="propose-contract"]');
  if (proposeForm) {
    e.preventDefault();
    const capId = parseRoute().parts[1];
    const kind = proposeForm.dataset.form === 'propose-contract' ? 'contract' : 'criteria';
    const value = kind === 'contract'
      ? Object.fromEntries([...proposeForm.querySelectorAll('textarea')].map((t) => [t.name, t.value.split('\n')]))
      : readCriteriaRows(proposeForm);
    try {
      const before = capData(store.get(), capId).proposals.length;
      store.dispatch('proposeAmendment', capId, kind, { value, by: actor(store.get(), capId), reason: proposeForm.reason.value });
      const after = capData(store.get(), capId).proposals;
      location.hash = after.length > before ? `#/capabilities/${capId}/proposals/${after[after.length - 1].id}` : `#/capabilities/${capId}?tab=${kind === 'contract' ? 'contract' : 'criteria'}`;
    } catch (err) {
      location.hash = `#/capabilities/${capId}/amend/${kind}?error=${encodeURIComponent(err.message)}`;
    }
    return;
  }
  const rejectForm = e.target.closest('[data-form="reject-proposal"]');
  if (rejectForm) {
    e.preventDefault();
    const capId = parseRoute().parts[1];
    const pid = rejectForm.dataset.proposal;
    try { store.dispatch('rejectProposal', capId, pid, { by: actor(store.get(), capId), reason: rejectForm.reason.value }); location.hash = `#/capabilities/${capId}/proposals/${pid}`; render(); }
    catch (err) { location.hash = `#/capabilities/${capId}/proposals/${pid}?error=${encodeURIComponent(err.message)}`; }
    return;
  }
  const critForm = e.target.closest('[data-form="save-criteria"]');
  if (critForm) {
    e.preventDefault();
    const capId = parseRoute().parts[1];
    const { criteria, requirements } = readCriteriaRows(critForm);
    try {
      store.dispatch('saveCriteria', capId, { criteria, requirements, by: actor(store.get(), capId), reason: critForm.reason.value });
      location.hash = `#/capabilities/${capId}?tab=criteria`;
    } catch (err) {
      location.hash = `#/capabilities/${capId}/criteria/edit?error=${encodeURIComponent(err.message)}`;
    }
    return;
  }
  const lineForm = e.target.closest('[data-form^="add-line-"], [data-form="edit-line"]');
  if (lineForm) {
    e.preventDefault();
    const capId = parseRoute().parts[1];
    const text = new FormData(lineForm).get('text');
    const builder = `#/capabilities/${capId}/contract/build`;
    try {
      if (lineForm.dataset.form === 'edit-line') store.dispatch('editContractLine', capId, lineForm.dataset.line, text);
      else store.dispatch('addContractLine', capId, lineForm.dataset.section, text);
      if (location.hash !== builder) location.hash = builder; else render();
    } catch (err) {
      location.hash = `${builder}?error=${encodeURIComponent(err.message)}`;
    }
    return;
  }
  const form = e.target.closest('[data-form="add-capability"]');
  if (!form) return;
  e.preventDefault();
  const f = new FormData(form);
  const starting = f.get('starting');
  try {
    const before = store.get().capabilities.length;
    store.dispatch('addCapability', {
      name: f.get('name'),
      summary: f.get('summary'),
      owner: f.get('owner'),
      risk: { impact: f.get('impact'), reversibility: f.get('reversibility'), exposure: f.get('exposure'), failureTypes: f.getAll('failureTypes'), note: f.get('riskNote') },
      startingLevel: starting === 'not-delegated' ? 0 : Number(starting),
      notDelegated: starting === 'not-delegated',
      rationale: f.get('rationale'),
      by: actor(store.get()),
    });
    const added = store.get().capabilities[before];
    location.hash = `#/capabilities/${added.id}/setup`;
  } catch (err) {
    location.hash = `#/capabilities/new?error=${encodeURIComponent(err.message)}`;
  }
});

document.addEventListener('input', (e) => {
  const nameEl = e.target.closest('[data-action="check-name"]');
  if (nameEl) {
    const warn = nameEl.closest('form').querySelector('[data-name-warning]');
    const text = vagueNameWarning(nameEl.value);
    warn.textContent = text || '';
    warn.hidden = !text;
    return;
  }
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
