import * as seed from './data/seed.js';
import { workspaceOf, setupPending, createStore, getCapability, focusCapability, capData, actor, vagueNameWarning, decisionRequired, people, activePeople, currentVersion } from './store/index.js';
import { html, setPeople, setToday, fmtDate } from './ui.js';
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
import { stakeholdersEditorView } from './views/stakeholders.js';
import { scenariosEditorView } from './views/scenarios.js';
import { peopleView } from './views/people.js';
import { workspaceSetupView, noCapabilitiesView, founderOptions, riskGapNote } from './views/workspace.js';
import { agentRunsView } from './views/agentruns.js';

const store = createStore({ storage: safeStorage() });
const app = document.getElementById('app');
const nav = document.getElementById('nav');
const acting = document.getElementById('acting');
const demoDate = document.getElementById('demo-date');
const brandWs = document.getElementById('brand-ws');
const footData = document.getElementById('foot-data');

const NAV = [
  ['overview', 'Overview'],
  ['capabilities', 'Capabilities'],
  ['tests', 'Tests'],
  ['evidence', 'Evidence'],
  ['decisions', 'Decisions'],
  ['activity', 'Activity'],
  ['agent-runs', 'Agent runs'],
  ['people', 'People'],
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

// Recorded agent runs (A6) are fixed files, fetched once on the first visit.
let agentRuns = null;
function loadAgentRuns() {
  if (agentRuns) return;
  agentRuns = { status: 'loading', runs: [] };
  const base = 'src/data/agent-runs/';
  fetch(`${base}index.json`, { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(`index.json: ${r.status}`); return r.json(); })
    .then((index) => Promise.all(index.runs.map((e) => fetch(`${base}${e.file}`, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(`${e.file}: ${r.status}`); return r.json(); }).then((run) => ({ ...run, file: e.file })))))
    .then((runs) => { agentRuns = { status: 'ready', runs }; })
    .catch((err) => { agentRuns = { status: 'error', runs: [], error: err.message }; })
    .then(() => { if (parseRoute().parts[0] === 'agent-runs') render(); });
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
  if (id && getCapability(state, id)) return id;
  const focus = focusCapability(state);
  return focus ? focus.id : null;
}

function render() {
  const state = store.get();
  setPeople(people(state));
  setToday(state.today);
  demoDate.textContent = fmtDate(state.today);
  brandWs.textContent = workspaceOf(state).name;
  footData.textContent = state.startedEmpty ? 'AI outputs are simulated; nothing calls a model.' : 'All data is seeded and fictional.';
  const { parts, query } = parseRoute();
  const [root, sub, action] = parts;
  let view;
  let title = 'Overview';
  const empty = !state.capabilities.length;
  if (setupPending(state)) { view = workspaceSetupView(state, query, setupDraft); title = 'Set up the workspace'; }
  else switch (root) {
    case 'capabilities':
      if (sub === 'new') { view = addCapabilityView(state, query); title = 'Add a capability'; }
      else if (sub && action === 'decision') { view = decisionWorkspaceView(state, sub, query); title = 'Authority decision'; }
      else if (sub && action === 'versions') { view = versionsView(state, sub, query); title = 'Versions'; }
      else if (sub && action === 'setup') { view = setupView(state, sub, query); title = 'Setup'; }
      else if (sub && action === 'contract' && parts[3] === 'build') { view = contractBuilderView(state, sub, query); title = 'Contract builder'; }
      else if (sub && action === 'criteria' && parts[3] === 'edit') { view = criteriaEditorView(state, sub, query); title = 'Success criteria'; }
      else if (sub && action === 'stakeholders' && parts[3] === 'edit') { view = stakeholdersEditorView(state, sub, query); title = 'Stakeholders'; }
      else if (sub && action === 'scenarios' && parts[3] === 'edit') { view = scenariosEditorView(state, sub, query); title = 'Scenario library'; }
      else if (sub && action === 'amend' && parts[3]) { view = proposeView(state, sub, parts[3], query); title = 'Amend'; }
      else if (sub && action === 'proposals' && parts[3]) { view = proposalView(state, sub, parts[3], query); title = 'Proposed amendment'; }
      else if (sub) { view = capabilityView(state, sub, query); title = getCapability(state, sub)?.name || 'Capability'; }
      else { view = capabilitiesView(state); title = 'Capabilities'; }
      break;
    case 'tests': view = empty ? noCapabilitiesView(state, 'Testing ground') : testsView(state, capabilityFor(state, query), query); title = 'Tests'; break;
    case 'evidence': view = empty ? noCapabilitiesView(state, 'Evidence') : evidenceView(state, capabilityFor(state, query), query); title = 'Evidence'; break;
    case 'decisions':
      if (sub) { view = decisionRecordView(state, sub); title = 'Decision record'; }
      else { view = decisionsListView(state); title = 'Decisions'; }
      break;
    case 'activity': view = activityView(state, query); title = 'Activity'; break;
    case 'people': view = peopleView(state, query); title = 'People'; break;
    case 'agent-runs': loadAgentRuns(); view = agentRunsView(state, query, agentRuns); title = 'Agent runs'; break;
    default: view = empty ? noCapabilitiesView(state, 'Where do we need to make a decision?') : overviewView(state); title = 'Overview';
  }
  document.title = `${title} · Authority Lab`;

  const pending = state.capabilities.filter((c) => decisionRequired(state, c.id)).length;
  const counts = {
    overview: state.alerts.length || pending,
    decisions: pending,
  };
  // Until the workspace is set up there is nothing to navigate to and nobody
  // to act as.
  if (setupPending(state)) { nav.innerHTML = ''; acting.innerHTML = ''; }
  else nav.innerHTML = String(html`${NAV.map(([k, label]) => html`<a class="nav-link ${root === k || (!root && k === 'overview') ? 'is-active' : ''}" href="#/${k}" ${root === k ? 'aria-current="page"' : ''}>${label}${counts[k] ? html`<span class="nav-count ${state.alerts.length && k === 'overview' ? 'is-alert' : ''}">${counts[k]}</span>` : ''}</a>`)}`);

  // "Acting as" picker. Default is the owner of the capability in context.
  const contextCap = root === 'capabilities' && sub && sub !== 'new' ? sub : null;
  const current = actor(state, contextCap);
  const focus = focusCapability(state);
  const defaultOwner = contextCap && getCapability(state, contextCap) ? getCapability(state, contextCap).owner : focus ? focus.owner : null;
  const roster = people(state);
  const defaultName = (roster[defaultOwner] || roster[current] || {}).name || 'Nobody yet';
  // A demo control: a real version would know who is signed in. Only active
  // people can be chosen.
  if (!setupPending(state)) acting.innerHTML = String(html`<label class="acting" title="Demo control. A real version would use sign-in; this picker stands in for it so the demo can show different people proposing, approving and authorizing.">
    <span class="acting-label">Acting as</span>
    <select data-action="set-acting" aria-label="Demo: acting as">
      <option value="" ${state.actingAs ? '' : 'selected'}>${defaultName}${defaultOwner ? ' (owner)' : ''}</option>
      ${Object.entries(activePeople(state)).map(([k, p]) => html`<option value="${k}" ${state.actingAs === k ? 'selected' : ''}>${p.name} · ${p.role}</option>`)}
    </select>
  </label>`);
  acting.dataset.current = current;

  const y = window.scrollY;
  const saved = captureForms();
  // Keep sections the person opened open across re-renders of the same page
  // (a test run re-renders on every step).
  const opened = lastRoute === location.hash ? [...app.querySelectorAll('details[id][open]')].map((el) => el.id) : [];
  app.innerHTML = String(view);
  restoreForms(saved);
  for (const id of opened) { const el = document.getElementById(id); if (el) el.open = true; }
  if (lastRoute === location.hash) window.scrollTo(0, y); else window.scrollTo(0, 0);
  lastRoute = location.hash;
}
let lastRoute = null;
// What was typed on the workspace setup form, kept across a refused submit.
let setupDraft = null;

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
    if (!values || form.dataset.form.startsWith('add-line-') || form.dataset.form === 'edit-line' || form.dataset.form === 'save-criteria' || form.dataset.form.startsWith('propose-') || form.dataset.form === 'reject-proposal' || form.dataset.form === 'withdraw-proposal' || form.dataset.form === 'save-stakeholders' || form.dataset.form.endsWith('-person') || form.dataset.form.endsWith('-roster') || form.dataset.form === 'save-scenarios' || form.dataset.form === 'setup-workspace') continue;
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

// Run a store action. If it throws, show the message inline on `errorRoute`
// (as an error= parameter). Anything the action does on success (navigating,
// clearing a stale error, re-rendering) stays inside `fn`.
function dispatchOr(errorRoute, fn) {
  try { fn(); }
  catch (err) { location.hash = `${errorRoute}${errorRoute.includes('?') ? '&' : '?'}error=${encodeURIComponent(err.message)}`; }
}

// On success, drop a stale error= (or edit=) by going back to `route`.
function clearErrorOn(route, ...params) {
  const query = new URLSearchParams(location.hash.split('?')[1] || '');
  if (params.some((p) => query.has(p))) location.hash = route;
}

// The current route without its error= parameter: where an action started
// from this page shows its error.
function here() {
  const [path, qs] = location.hash.split('?');
  const query = new URLSearchParams(qs || '');
  query.delete('error');
  return query.toString() ? `${path}?${query}` : path;
}

// The inline confirm step for the two buttons that erase every record.
let pendingErase = null;
const demoButtons = document.getElementById('demo-buttons');
const demoConfirm = document.getElementById('demo-confirm');
function askToErase(kind) {
  pendingErase = kind;
  document.getElementById('demo-confirm-go').textContent = kind === 'start-empty' ? 'Erase and start empty' : 'Erase and reset demo';
  demoButtons.hidden = true;
  demoConfirm.hidden = false;
  // The confirm takes the whole demo group, so the header stays one row.
  demoConfirm.closest('.demo-controls').classList.add('is-confirming');
  document.getElementById('demo-confirm-go').focus();
}
function closeEraseConfirm(restoreFocus = true) {
  const kind = pendingErase;
  pendingErase = null;
  demoConfirm.hidden = true;
  demoButtons.hidden = false;
  demoConfirm.closest('.demo-controls').classList.remove('is-confirming');
  if (restoreFocus && kind) demoButtons.querySelector(`[data-action="${kind}"]`).focus();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pendingErase) closeEraseConfirm(); });

// Row menus (details.menu) close on an outside click, on Escape, and after a choice.
document.addEventListener('click', (e) => {
  for (const m of document.querySelectorAll('details.menu[open]')) if (!m.contains(e.target) || e.target.closest('.menu-list a')) m.open = false;
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  for (const m of document.querySelectorAll('details.menu[open]')) { m.open = false; m.querySelector('summary').focus(); }
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.tagName === 'INPUT' || btn.tagName === 'TEXTAREA') return;
  const action = btn.dataset.action;
  const capId = btn.dataset.capability;
  if (action === 'run-tests') { const route = here(); dispatchOr(route, () => { runSuite(capId); clearErrorOn(route, 'error'); }); }
  if (action === 'simulate-breach') store.dispatch('simulateBreach', capId);
  if (action === 'authorize') {
    dispatchOr(here(), () => {
      store.dispatch('authorize', capId, { by: actor(store.get(), capId) });
      const rec = capData(store.get(), capId).decision.recordId;
      location.hash = `#/decisions/${rec}`;
    });
  }
  const builder = () => `#/capabilities/${capId}/contract/build`;
  const tryDispatch = (fn) => dispatchOr(builder(), () => { fn(); clearErrorOn(builder(), 'error', 'edit'); });
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
  if (action === 'starter-add') {
    const route = `#/capabilities/${capId}/scenarios/edit`;
    dispatchOr(route, () => { store.dispatch('addStarterScenarios', capId, { by: actor(store.get(), capId) }); clearErrorOn(route, 'error'); });
    return;
  }
  if (action === 'propose-authority') {
    dispatchOr(here(), () => { store.dispatch('proposeAuthority', capId, Number(btn.dataset.level), { by: actor(store.get(), capId) }); location.hash = `#/capabilities/${capId}/decision`; });
    return;
  }
  if (action === 'approve-roster') {
    dispatchOr('#/people', () => { store.dispatch('approveRosterChange', btn.dataset.proposal, { by: actor(store.get()) }); location.hash = `#/people?proposal=${btn.dataset.proposal}`; render(); });
    return;
  }
  if (action === 'proposal-approve') {
    const pid = btn.dataset.proposal;
    const route = `#/capabilities/${capId}/proposals/${pid}`;
    dispatchOr(route, () => { store.dispatch('approveProposal', capId, pid, { by: actor(store.get(), capId) }); clearErrorOn(route, 'error'); });
    return;
  }
  if (action === 'row-add') {
    const tpl = document.getElementById(`row-${btn.dataset.kind}`);
    const body = app.querySelector(`[data-rows="${btn.dataset.kind}"]`);
    if (tpl && body) { body.appendChild(tpl.content.cloneNode(true)); body.lastElementChild.querySelector('input[type=text]').focus(); }
    return;
  }
  if (action === 'row-remove') { btn.closest('tr').remove(); return; }
  // Start empty and Reset demo erase every record, so each asks first, inline.
  if (action === 'start-empty' || action === 'reset') askToErase(action);
  if (action === 'cancel-erase') closeEraseConfirm();
  if (action === 'confirm-erase') {
    const kind = pendingErase;
    closeEraseConfirm(false);
    store.dispatch(kind === 'start-empty' ? 'startEmpty' : 'reset');
    stopSuite();
    setupDraft = null;
    location.hash = '#/overview';
    render();
  }
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const capId = el.dataset.capability;
  // Heading capability selector and filter dropdowns: each option is a route.
  if (el.dataset.action === 'navigate') { location.hash = el.value; return; }
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
  const personForm = e.target.closest('[data-form="add-person"], [data-form="edit-person"], [data-form="deactivate-person"]');
  if (personForm) {
    e.preventDefault();
    const f = new FormData(personForm);
    const by = actor(store.get());
    dispatchOr('#/people', () => {
      if (personForm.dataset.form === 'add-person') store.dispatch('addPerson', { name: f.get('name'), title: f.get('title'), team: f.get('team'), by, reason: f.get('reason') });
      else if (personForm.dataset.form === 'edit-person') store.dispatch('editPerson', personForm.dataset.person, { name: f.get('name'), title: f.get('title'), team: f.get('team'), by, reason: f.get('reason') });
      else {
        const before = store.get().rosterProposals.length;
        store.dispatch('deactivatePerson', personForm.dataset.person, { by, reason: f.get('reason') });
        const after = store.get().rosterProposals;
        if (after.length > before) { location.hash = `#/people?proposal=${after[after.length - 1].id}`; return; }
      }
      location.hash = '#/people';
      render();
    });
    return;
  }
  const rosterForm = e.target.closest('[data-form="propose-roster"], [data-form="reject-roster"], [data-form="withdraw-roster"]');
  if (rosterForm) {
    e.preventDefault();
    const f = new FormData(rosterForm);
    const by = actor(store.get());
    dispatchOr('#/people', () => {
      if (rosterForm.dataset.form === 'propose-roster') {
        store.dispatch('proposeRosterChange', { kind: 'rights', person: rosterForm.dataset.person, right: rosterForm.dataset.right, grant: rosterForm.dataset.grant === '1', by, reason: f.get('reason') });
        const list = store.get().rosterProposals;
        location.hash = `#/people?proposal=${list[list.length - 1].id}`;
      } else if (rosterForm.dataset.form === 'reject-roster') {
        store.dispatch('rejectRosterChange', rosterForm.dataset.proposal, { by, reason: f.get('reason') });
        location.hash = `#/people?proposal=${rosterForm.dataset.proposal}`; render();
      } else {
        store.dispatch('withdrawRosterChange', rosterForm.dataset.proposal, { by, reason: f.get('reason') });
        location.hash = `#/people?proposal=${rosterForm.dataset.proposal}`; render();
      }
    });
    return;
  }
  const proposeForm = e.target.closest('[data-form="propose-criteria"], [data-form="propose-contract"]');
  if (proposeForm) {
    e.preventDefault();
    const capId = parseRoute().parts[1];
    const kind = proposeForm.dataset.form === 'propose-contract' ? 'contract' : 'criteria';
    const value = kind === 'contract'
      ? { ...Object.fromEntries([...proposeForm.querySelectorAll('textarea')].map((t) => [t.name, t.value.split('\n')])), dataSeen: [...proposeForm.querySelectorAll('[name="dataSeen"]:checked')].map((el) => el.value) }
      : readCriteriaRows(proposeForm);
    dispatchOr(`#/capabilities/${capId}/amend/${kind}`, () => {
      const before = capData(store.get(), capId).proposals.length;
      store.dispatch('proposeAmendment', capId, kind, { value, by: actor(store.get(), capId), reason: proposeForm.reason.value });
      const after = capData(store.get(), capId).proposals;
      // A tightening-only change applies without a proposal; say so on arrival.
      const tightened = kind === 'criteria' && after.length === before && (currentVersion(store.get(), capId, 'criteria') || {}).tighteningOnly;
      location.hash = after.length > before ? `#/capabilities/${capId}/proposals/${after[after.length - 1].id}` : `#/capabilities/${capId}?tab=${kind === 'contract' ? 'contract' : 'criteria'}${tightened ? `&tightened=${currentVersion(store.get(), capId, 'criteria').version}` : ''}`;
    });
    return;
  }
  const stForm = e.target.closest('[data-form="save-stakeholders"]');
  if (stForm) {
    e.preventDefault();
    const capId = parseRoute().parts[1];
    const val = (tr, name) => (tr.querySelector(`[name="${name}"]`) || {}).value || '';
    // Keep the recorded position text unless the stance was changed.
    const stakeholders = [...stForm.querySelectorAll('[data-rows="stakeholders"] tr')].map((tr) => ({ team: val(tr, 's-team'), person: val(tr, 's-person'), stance: val(tr, 's-stance'), position: val(tr, 's-stance') === val(tr, 's-stance-was') ? val(tr, 's-position') : '', quote: val(tr, 's-quote') }));
    dispatchOr(`#/capabilities/${capId}/stakeholders/edit`, () => {
      const before = capData(store.get(), capId).proposals.length;
      store.dispatch('saveStakeholders', capId, { stakeholders, by: actor(store.get(), capId) });
      const after = capData(store.get(), capId).proposals;
      location.hash = after.length > before ? `#/capabilities/${capId}/proposals/${after[after.length - 1].id}` : `#/capabilities/${capId}?tab=stakeholders`;
    });
    return;
  }
  const scForm = e.target.closest('[data-form="save-scenarios"]');
  if (scForm) {
    e.preventDefault();
    const capId = parseRoute().parts[1];
    const val = (tr, name) => (tr.querySelector(`[name="${name}"]`) || {}).value || '';
    const scenarios = [...scForm.querySelectorAll('[data-rows="scenarios"] tr')].map((tr) => ({ id: val(tr, 'sc-id') || undefined, source: val(tr, 'sc-source'), group: val(tr, 'sc-group'), name: val(tr, 'sc-name'), situation: val(tr, 'sc-situation'), expected: val(tr, 'sc-expected') }));
    dispatchOr(`#/capabilities/${capId}/scenarios/edit`, () => { store.dispatch('saveScenarios', capId, { scenarios, by: actor(store.get(), capId) }); location.hash = `#/tests?capability=${capId}`; });
    return;
  }
  const withdrawForm = e.target.closest('[data-form="withdraw-proposal"]');
  if (withdrawForm) {
    e.preventDefault();
    const capId = parseRoute().parts[1];
    const pid = withdrawForm.dataset.proposal;
    const route = `#/capabilities/${capId}/proposals/${pid}`;
    dispatchOr(route, () => { store.dispatch('withdrawProposal', capId, pid, { by: actor(store.get(), capId), reason: withdrawForm.reason.value }); location.hash = route; render(); });
    return;
  }
  const rejectForm = e.target.closest('[data-form="reject-proposal"]');
  if (rejectForm) {
    e.preventDefault();
    const capId = parseRoute().parts[1];
    const pid = rejectForm.dataset.proposal;
    const route = `#/capabilities/${capId}/proposals/${pid}`;
    dispatchOr(route, () => { store.dispatch('rejectProposal', capId, pid, { by: actor(store.get(), capId), reason: rejectForm.reason.value }); location.hash = route; render(); });
    return;
  }
  const reviewForm = e.target.closest('[data-form="record-review"]');
  if (reviewForm) {
    e.preventDefault();
    const capId = reviewForm.dataset.capability;
    const f = new FormData(reviewForm);
    dispatchOr(here(), () => {
      store.dispatch('recordReview', capId, { by: actor(store.get(), capId), whatHappened: f.get('whatHappened'), cause: f.get('cause'), changes: f.get('changes') });
      clearErrorOn(here(), 'error');
      render();
    });
    return;
  }
  // Approve or reject a waiting action (A4). The approver is whoever is acting.
  const decideForm = e.target.closest('[data-form="decide-action"]');
  if (decideForm) {
    e.preventDefault();
    const id = decideForm.dataset.id;
    const reason = new FormData(decideForm).get('reason');
    const decision = e.submitter && e.submitter.value === 'reject' ? 'rejectAction' : 'approveAction';
    const item = (store.get().actionQueue || []).find((x) => x.id === id);
    const route = `#/capabilities/${item ? item.capabilityId : ''}?tab=waiting`;
    dispatchOr(route, () => { store.dispatch(decision, id, { by: actor(store.get(), item && item.capabilityId), reason }); clearErrorOn(route, 'error'); render(); });
    return;
  }
  const renameForm = e.target.closest('[data-form="rename-workspace"]');
  if (renameForm) {
    e.preventDefault();
    const f = new FormData(renameForm);
    dispatchOr('#/people?workspace=edit', () => {
      store.dispatch('renameWorkspace', { workspace: { name: f.get('ws-name'), description: f.get('ws-description') }, workflow: { name: f.get('wf-name'), description: f.get('wf-description') }, by: actor(store.get()), reason: f.get('reason') });
      location.hash = '#/people';
      render();
    });
    return;
  }
  const wsForm = e.target.closest('[data-form="setup-workspace"]');
  if (wsForm) {
    e.preventDefault();
    const val = (el, name) => (el.querySelector(`[name="${name}"]`) || {}).value || '';
    const draft = {
      by: val(wsForm, 'ws-by'),
      workspace: { name: val(wsForm, 'ws-name'), description: val(wsForm, 'ws-description') },
      workflow: { name: val(wsForm, 'wf-name'), description: val(wsForm, 'wf-description') },
      people: [...wsForm.querySelectorAll('[data-rows="founders"] tr')].map((tr) => ({ name: val(tr, 'p-name'), title: val(tr, 'p-title'), team: val(tr, 'p-team'), workspaceAdmin: tr.querySelector('[name="p-admin"]').checked, riskApprover: tr.querySelector('[name="p-risk"]').checked })),
    };
    // Keep what was typed if setup is refused; drop it once it goes through.
    setupDraft = draft;
    dispatchOr('#/overview', () => { store.dispatch('setUpWorkspace', draft); setupDraft = null; location.hash = '#/overview'; render(); });
    return;
  }
  const critForm = e.target.closest('[data-form="save-criteria"]');
  if (critForm) {
    e.preventDefault();
    const capId = parseRoute().parts[1];
    const { criteria, requirements } = readCriteriaRows(critForm);
    dispatchOr(`#/capabilities/${capId}/criteria/edit`, () => {
      store.dispatch('saveCriteria', capId, { criteria, requirements, by: actor(store.get(), capId), reason: critForm.reason.value });
      location.hash = `#/capabilities/${capId}?tab=criteria`;
    });
    return;
  }
  const lineForm = e.target.closest('[data-form^="add-line-"], [data-form="edit-line"]');
  if (lineForm) {
    e.preventDefault();
    const capId = parseRoute().parts[1];
    const text = new FormData(lineForm).get('text');
    const builder = `#/capabilities/${capId}/contract/build`;
    dispatchOr(builder, () => {
      if (lineForm.dataset.form === 'edit-line') store.dispatch('editContractLine', capId, lineForm.dataset.line, text);
      else store.dispatch('addContractLine', capId, lineForm.dataset.section, text);
      if (location.hash !== builder) location.hash = builder; else render();
    });
    return;
  }
  const form = e.target.closest('[data-form="add-capability"]');
  if (!form) return;
  e.preventDefault();
  const f = new FormData(form);
  const starting = f.get('starting');
  dispatchOr('#/capabilities/new', () => {
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
  });
});

// The setup form's "Who is setting this up?" list and Risk approver note follow
// the roster rows as they are edited.
function readFounders(form) {
  const val = (el, name) => (el.querySelector(`[name="${name}"]`) || {}).value || '';
  return [...form.querySelectorAll('[data-rows="founders"] tr')].map((tr) => ({ name: val(tr, 'p-name'), workspaceAdmin: tr.querySelector('[name="p-admin"]').checked, riskApprover: tr.querySelector('[name="p-risk"]').checked }));
}
function refreshSetupForm(form) {
  const people = readFounders(form);
  const select = form.querySelector('[data-founders]');
  const chosen = select.value;
  select.innerHTML = String(founderOptions(people, chosen));
  const note = form.querySelector('[data-risk-gap]');
  const text = riskGapNote(people);
  note.textContent = text;
  note.hidden = !text;
}
for (const type of ['input', 'change', 'click']) {
  document.addEventListener(type, (e) => {
    const form = e.target.closest && e.target.closest('[data-form="setup-workspace"]');
    if (form && !e.target.matches('[data-founders]')) queueMicrotask(() => refreshSetupForm(form));
  });
}

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
