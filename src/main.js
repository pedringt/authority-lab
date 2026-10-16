import * as seed from './data/seed.js';
import { initialState, startTestRun, advanceTestRun, selectDecision, authorize, simulateBreach, recordReview, setTicketDefinitions, workspaceOf, setupPending, createStore, getCapability, focusCapability, capData, actor, vagueNameWarning, decisionRequired, people, activePeople, currentVersion, importEvidenceFiles , findWorkspace, storageKeyFor, realToday, BUILT_IN_WORKSPACES, DEMO_WORKSPACE, applyPublishedRecords, publishableRecord, contextNow, CONTEXT_FIELDS, BASELINE_FIELDS } from './store/index.js';
import { html, setPeople, setToday, fmtDate, subNav, notice } from './ui.js';
import { canonicalHash } from './routes.js';
import { overviewView } from './views/overview.js';
import { capabilitiesView } from './views/capabilities.js';
import { capabilityView } from './views/capability.js';
import { decisionsListView, decisionWorkspaceView, decisionRecordView } from './views/decisions.js';
import { activityView } from './views/activity.js';
import { versionsView } from './views/versions.js';
import { setupView } from './views/setup.js';
import { contextView, startView, capabilityStepView, todayStepView, riskStepView, setupHubView, reviewView } from './views/setupflow.js';
import { contractBuilderView } from './views/contract.js';
import { criteriaEditorView } from './views/criteria.js';
import { proposeView, proposalView } from './views/proposals.js';
import { stakeholdersEditorView } from './views/stakeholders.js';
import { scenariosEditorView } from './views/scenarios.js';
import { peopleView } from './views/people.js';
import { workspaceSetupView, noCapabilitiesView } from './views/workspace.js';
import { decisionBriefView } from './views/brief.js';
import { welcomeView, guideView, GUIDE_STEPS } from './views/guide.js';
import { sourcesView, recordEvidenceView } from './views/sources.js';
import { configureEvidenceView } from './views/configure.js';

// Which built-in workspace is open (#121): the demo, or a client's real
// configuration. Each is its own store, saved under its own key.
const WORKSPACE_KEY = 'authority-lab-workspace';
const openWorkspace = findWorkspace((() => { try { return window.localStorage.getItem(WORKSPACE_KEY); } catch { return null; } })());
// A client workspace shows its published record to everyone, read-only
// (Paige, 2026-10-13). There are no accounts, so anyone may switch on "Try
// changes in this browser"; what they do stays in their browser, marked as
// not published. Only a committed record is the real one.
const EDIT_KEY = `authority-lab-edit:${openWorkspace.id}`;
const clientWs = openWorkspace.id !== DEMO_WORKSPACE;
const editing = clientWs && (() => { try { return window.localStorage.getItem(EDIT_KEY) === '1'; } catch { return false; } })();
// Read-only, a client workspace is rebuilt on every load and never saved.
const store = createStore({ storage: !clientWs || editing ? safeStorage() : null, key: storageKeyFor(openWorkspace.id), build: () => openWorkspace.build() });
const isClient = () => Boolean(store.get().clientWorkspace);
const readOnly = () => isClient() && !editing;
// What a read-only workspace still does by itself: take in committed evidence
// and published records, keep its calendar, and let "Demo as" switch.
const READ_ONLY_OK = new Set(['importEvidenceFiles', 'applyPublishedRecords', 'advanceToday', 'setActingAs', 'reset']);
let readOnlyTried = false;
const dispatchAny = store.dispatch;
store.dispatch = (action, ...args) => {
  if (readOnly() && !READ_ONLY_OK.has(action)) { readOnlyTried = true; render(); return; }
  return dispatchAny(action, ...args);
};
// A client workspace runs on the real calendar, so freshness is real.
if (isClient()) store.dispatch('advanceToday', realToday());
const app = document.getElementById('app');
const nav = document.getElementById('nav');
const acting = document.getElementById('acting');
const demoDate = document.getElementById('demo-date');
const brandWs = document.getElementById('brand-ws');
const footData = document.getElementById('foot-data');

// Three top-level places (simplification pass). Evidence, tests and model
// runs live inside each capability; People and the workspace are in the
// Settings menu.
const NAV = [
  ['overview', 'Overview'],
  ['capabilities', 'Capabilities'],
  ['records', 'Records'],
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
    .then((index) => Promise.all([
      ...index.runs.map((e) => fetch(`${base}${e.file}`, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(`${e.file}: ${r.status}`); return r.json(); }).then((run) => ({ ...run, file: e.file, proof: e.proof || null }))),
      // Today's ticket definitions, for rules older recordings don't carry.
      ...['tickets.json', 'stress-tickets.json'].map((f) => fetch(`${base}${f}`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : { tickets: [] })).then((d) => ({ definitions: d.tickets }))),
    ]))
    .then((all) => { setTicketDefinitions(all.filter((x) => x.definitions).flatMap((x) => x.definitions)); agentRuns = { status: 'ready', runs: all.filter((x) => !x.definitions) }; })
    .catch((err) => { agentRuns = { status: 'error', runs: [], error: err.message }; })
    .then(() => { const { parts, query } = parseRoute(); if (parts[0] === 'capabilities' && query.get('tab') === 'decide') render(); });
}

// External evidence (#118): envelopes committed under
// src/data/external-evidence/, imported on every load and again after a reset.
// Importing is idempotent, so a file already in the workspace changes nothing.
// A file that can't be imported is listed on Records, never dropped quietly.
let externalFiles = null;
let externalProblems = [];
function loadExternalEvidence() {
  const base = 'src/data/external-evidence/';
  fetch(`${base}index.json`, { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(`index.json: ${r.status}`); return r.json(); })
    .then((index) => Promise.all((index.files || []).map((file) => fetch(`${base}${file}`, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((envelope) => ({ file, envelope }), (err) => ({ file, error: `couldn't be read (${err.message})` })))))
    .then((files) => { externalFiles = files; applyExternalEvidence(); })
    .catch((err) => { externalProblems = [{ file: 'index.json', reason: `The list of evidence files couldn't be read (${err.message}).` }]; render(); });
}
// Published records (src/data/published-records/), replayed after the
// evidence they rest on. A record that won't replay is listed, not trusted.
let publishedFiles = null;
let publishedProblems = [];
function loadPublishedRecords() {
  const base = 'src/data/published-records/';
  fetch(`${base}index.json`, { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(`index.json: ${r.status}`); return r.json(); })
    .then((index) => Promise.all((index.files || []).map((file) => fetch(`${base}${file}`, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((entry) => ({ file, entry }), (err) => ({ file, error: `couldn't be read (${err.message})` })))))
    .then((files) => { publishedFiles = files; applyExternalEvidence(); })
    .catch((err) => { publishedFiles = []; publishedProblems = [{ file: 'index.json', reason: `The list of published records couldn't be read (${err.message}).` }]; applyExternalEvidence(); });
}
function applyExternalEvidence() {
  if (!externalFiles || !publishedFiles) return;
  const readable = externalFiles.filter((f) => f.envelope);
  const { results } = importEvidenceFiles(store.get(), readable);
  externalProblems = [...externalFiles.filter((f) => f.error).map((f) => ({ file: f.file, reason: f.error })), ...results.filter((r) => r.status === 'refused')];
  store.dispatch('importEvidenceFiles', readable);
  const records = publishedFiles.filter((f) => f.entry);
  const replay = applyPublishedRecords(store.get(), records);
  publishedProblems = [...publishedFiles.filter((f) => f.error).map((f) => ({ file: f.file, reason: f.error })), ...replay.results.filter((r) => r.status === 'refused')];
  store.dispatch('applyPublishedRecords', records);
  render();
}
const externalNotice = () => html`${externalProblems.length
  ? notice('fail', `${externalProblems.length === 1 ? 'One evidence file' : `${externalProblems.length} evidence files`} couldn't be imported`, html`${externalProblems.map((p) => html`${p.file}: ${p.reason}<br>`)}`)
  : ''}${publishedProblems.length
  ? notice('fail', `${publishedProblems.length === 1 ? 'One published record' : `${publishedProblems.length} published records`} couldn't be replayed`, html`${publishedProblems.map((p) => html`${p.file}: ${p.reason}<br>`)}`)
  : ''}`;

// The banner on every page of a client workspace: what you're looking at, and
// whether anything you do here is the real record.
const workspaceBanner = () => (!isClient() ? '' : editing
  ? notice('watch', 'Trying changes in this browser', html`Nothing you do here is published: the real ${openWorkspace.name} record is what's been committed to the repository. <button class="btn btn-sm" data-action="toggle-edit">Stop and show the published record</button>`)
  : notice(readOnlyTried ? 'watch' : 'neutral', readOnlyTried ? 'That would change the published record' : `The published ${openWorkspace.name} record`, html`${readOnlyTried ? 'This workspace is read-only here. ' : ''}A real configuration, its evidence and the decisions published so far. To try something, use the Northstar demo, or <button class="btn btn-sm" data-action="toggle-edit">try changes in this browser</button> (they stay in this browser and aren't published).`));

// Where an old address that named no capability should go.
const focusId = () => { const f = focusCapability(store.get()); return f ? f.id : null; };

// The guided demo (redesign) runs on its own copy of the demo state, in
// memory only, so it never touches the workspace. Its "Demo as" is its own.
let guide = null;
function newGuide() {
  const state = initialState();
  return { state, capabilityId: focusCapability(state).id, role: focusCapability(state).owner, tested: false, decided: null, breached: false };
}
const guideDo = {
  runTests() { let s = startTestRun(guide.state, guide.capabilityId); for (let i = 0; i < 200 && capData(s, guide.capabilityId).testRun.status === 'running'; i++) s = advanceTestRun(s, guide.capabilityId); guide = { ...guide, state: s, tested: true }; },
  decide() { const owner = getCapability(guide.state, guide.capabilityId).owner; const s = authorize(selectDecision(guide.state, guide.capabilityId, 'expand-limits'), guide.capabilityId, { by: owner }); guide = { ...guide, state: s, decided: s.decisionRecords.at(-1).id }; },
  breach() { guide = { ...guide, state: simulateBreach(guide.state, guide.capabilityId), breached: true }; },
};
// Opening a later step directly does the earlier steps' actions first.
function guideAt(step) {
  if (!guide) guide = newGuide();
  if (step > 5 && !guide.tested) guideDo.runTests();
  if (step > 6 && !guide.decided) guideDo.decide();
  return guide;
}
const WELCOMED = 'authority-lab-welcomed';
const welcomed = () => { try { return window.localStorage.getItem(WELCOMED) === '1'; } catch { return true; } };

function parseRoute() {
  const hash = canonicalHash(location.hash || '#/overview', { focus: focusId() });
  const [path, qs] = hash.slice(1).split('?');
  const parts = path.split('/').filter(Boolean);
  return { parts, query: new URLSearchParams(qs || '') };
}

function render() {
  // An old address is rewritten in place, without adding a history entry.
  const canon = canonicalHash(location.hash, { focus: focusId() });
  if (location.hash && canon !== location.hash) history.replaceState(null, '', canon);
  // A first visit opens on the welcome choice (redesign), once.
  if (!welcomed() && (!location.hash || location.hash === '#/' || location.hash === '#/overview') && !setupPending(store.get())) history.replaceState(null, '', '#/welcome');
  const state = store.get();
  setPeople(people(state));
  setToday(state.today);
  demoDate.textContent = fmtDate(state.today);
  brandWs.textContent = workspaceOf(state).name;
  footData.textContent = state.clientWorkspace ? 'Real configuration. Evidence comes only from the connected source; nothing here calls a model.' : state.startedEmpty ? 'AI responses here are simulated. Nothing calls a real model.' : 'All data is fictional demo data.';
  renderWorkspaceMenu();
  const { parts, query } = parseRoute();
  const [root, sub, action] = parts;
  let view;
  let title = 'Overview';
  const empty = !state.capabilities.length;
  if (setupPending(state)) { view = workspaceSetupView(state, query, setupDraft); title = 'Set up your workspace'; }
  else switch (root) {
    case 'capabilities':
      if (sub === 'new') { view = startView(state, query); title = 'Add a capability'; }
      else if (sub && action === 'setup' && parts[3] && getCapability(state, sub) && getCapability(state, sub).setup) {
        // The setup flow's own steps (#139).
        const STEP = { capability: [capabilityStepView, 'Starting point and capability'], today: [todayStepView, 'What it does today'], risk: [riskStepView, 'Risk and authority'], review: [reviewView, 'Review and confirm'] }[parts[3]];
        if (STEP) { view = STEP[0](state, sub, query); title = STEP[1]; } else { view = setupHubView(state, sub, query); title = 'Setup'; }
      }
      else if (sub && action === 'decision') {
        // The decision lives in the capability's Decide tab (redesign).
        const q = new URLSearchParams(query);
        q.set('tab', 'decide');
        q.delete('show');
        view = capabilityView(state, sub, q, { runs: agentRuns });
        title = 'Decision';
      }
      else if (sub && action === 'evidence' && parts[3] === 'configure') { view = configureEvidenceView(state, sub, query); title = 'Configure evidence'; }
      else if (sub && action === 'evidence' && parts[3] === 'record') { view = recordEvidenceView(state, sub, query); title = 'Record a result'; }
      else if (sub && action === 'versions') { view = versionsView(state, sub, query); title = 'History'; }
      else if (sub && action === 'setup') { view = getCapability(state, sub) && getCapability(state, sub).setup ? setupHubView(state, sub, query) : setupView(state, sub, query); title = 'Setup'; }
      else if (sub && action === 'contract' && parts[3] === 'build') { view = contractBuilderView(state, sub, query); title = 'Boundaries'; }
      else if (sub && action === 'criteria' && parts[3] === 'edit') { view = criteriaEditorView(state, sub, query); title = getCapability(state, sub) && getCapability(state, sub).setup ? 'Requirements and Targets' : 'Targets and decision requirements'; }
      else if (sub && action === 'stakeholders' && parts[3] === 'edit') { view = stakeholdersEditorView(state, sub, query); title = 'Stakeholders'; }
      else if (sub && action === 'scenarios' && parts[3] === 'edit') { view = scenariosEditorView(state, sub, query); title = 'Tests'; }
      else if (sub && action === 'amend' && parts[3]) { view = proposeView(state, sub, parts[3], query); title = 'Propose a change'; }
      else if (sub && action === 'proposals' && parts[3]) { view = proposalView(state, sub, parts[3], query); title = 'Proposed change'; }
      else if (sub) {
        // Decide summarizes the recorded model runs; its runs view lists them.
        if (query.get('tab') === 'decide' && (!query.get('show') || query.get('show') === 'runs')) loadAgentRuns();
        view = capabilityView(state, sub, query, { runs: agentRuns });
        title = getCapability(state, sub)?.name || 'Capability';
      }
      else { view = capabilitiesView(state); title = 'Capabilities'; }
      break;
    case 'setup':
      // The workflow's Context (#139), the first step of setup.
      view = contextView(state, query);
      title = 'Context';
      break;
    case 'records': {
      // Decision records and the activity history, one place (#93).
      if (sub && action === 'brief') { view = decisionBriefView(state, sub); title = 'Decision brief'; break; }
      if (sub) { view = decisionRecordView(state, sub); title = 'Decision record'; break; }
      const showActivity = query.get('show') === 'activity';
      const pendingCount = state.capabilities.filter((c) => decisionRequired(state, c.id)).length;
      const tabs = subNav([{ href: '#/records', label: 'Decisions', active: !showActivity, count: pendingCount }, { href: '#/records?show=activity', label: 'Activity', active: showActivity }], 'Record views');
      view = html`${externalNotice()}${tabs}${showActivity ? activityView(state, query) : decisionsListView(state)}`;
      title = showActivity ? 'Activity' : 'Decisions';
      break;
    }
    case 'people': view = peopleView(state, query); title = 'People'; break;
    case 'sources': view = sourcesView(state); title = 'Evidence sources'; break;
    case 'welcome': view = welcomeView(); title = 'Welcome'; break;
    case 'guide': { const n = Math.min(Math.max(Number(sub) || 1, 1), GUIDE_STEPS.length); view = guideView(guideAt(n), n); title = `Guided demo: ${GUIDE_STEPS[n - 1]}`; break; }
    default: view = empty ? noCapabilitiesView(state, 'Overview') : overviewView(state); title = 'Overview';
  }
  document.title = `${title} · Authority Lab`;

  const pending = state.capabilities.filter((c) => decisionRequired(state, c.id)).length;
  const counts = {
    overview: state.alerts.length || pending,
    records: pending,
  };
  // Until the workspace is set up there is nothing to navigate to and nobody
  // to act as.
  if (setupPending(state)) { nav.innerHTML = ''; acting.innerHTML = ''; }
  else nav.innerHTML = String(html`${NAV.map(([k, label]) => html`<a class="nav-link ${root === k || (!root && k === 'overview') ? 'is-active' : ''}" href="#/${k}" ${root === k ? 'aria-current="page"' : ''}>${label}${counts[k] ? html`<span class="nav-count ${state.alerts.length && k === 'overview' ? 'is-alert' : ''}">${counts[k]}</span>` : ''}</a>`)}`);

  // "Demo as" picker (redesign): a demo control, marked as one. Default is the
  // owner of the capability in context.
  const contextCap = root === 'capabilities' && sub && sub !== 'new' ? sub : null;
  const current = actor(state, contextCap);
  const focus = focusCapability(state);
  const defaultOwner = contextCap && getCapability(state, contextCap) ? getCapability(state, contextCap).owner : focus ? focus.owner : null;
  const roster = people(state);
  const defaultName = (roster[defaultOwner] || roster[current] || {}).name || 'Nobody yet';
  // A demo control: a real version would know who is signed in. Only active
  // people can be chosen.
  const inGuide = root === 'guide';
  if (inGuide && guide) {
    // The guided demo's own role, on its own copy of the demo.
    acting.innerHTML = String(html`<label class="acting" title="Demo only. Switch people here to see how approvals work."><span class="acting-label">Demo as</span>
      <select data-action="set-acting" aria-label="Demo as">${Object.entries(activePeople(guide.state)).map(([k, p]) => html`<option value="${k}" ${guide.role === k ? 'selected' : ''}>${p.name} · ${p.role}</option>`)}</select></label>`);
  } else if (!setupPending(state)) acting.innerHTML = String(html`<label class="acting" title="Demo only. In a real product you'd be signed in. Switch people here to see how proposing, approving and deciding work for each role.">
    <span class="acting-label">Demo as</span>
    <select data-action="set-acting" aria-label="Demo as">
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
  // A field being typed into (expected impact, rationale) keeps its focus and
  // caret across the re-render its own debounced dispatch causes.
  const focused = document.activeElement && app.contains(document.activeElement) && ['set-outcome', 'set-rationale', 'set-rollout'].includes(document.activeElement.dataset.action)
    ? { action: document.activeElement.dataset.action, index: document.activeElement.dataset.index || '', field: document.activeElement.dataset.field || '', start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd }
    : null;
  app.innerHTML = String(html`${workspaceBanner()}${view}`);
  restoreForms(saved);
  if (focused && lastRoute === location.hash) {
    const el = [...app.querySelectorAll(`[data-action="${focused.action}"]`)].find((x) => (x.dataset.index || '') === focused.index && (x.dataset.field || '') === focused.field);
    if (el) { el.focus(); try { el.setSelectionRange(focused.start, focused.end); } catch { /* not a text field */ } }
  }
  for (const id of opened) { const el = document.getElementById(id); if (el) el.open = true; }
  if (lastRoute === location.hash) window.scrollTo(0, y); else window.scrollTo(0, 0);
  // Settings → Workspace opens People at the workspace section.
  if (lastRoute !== location.hash && root === 'people' && query.get('focus') === 'workspace') { const ws = document.getElementById('workspace'); if (ws) ws.scrollIntoView(); }
  // Opening a model run shows its steps.
  if (lastRoute !== location.hash && query.get('run')) { const st = document.getElementById('steps'); if (st) st.scrollIntoView(); }
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
    // Ticked suggestions (#139) survive a refused save; the rows re-render from state.
    if (values && form.dataset.form === 'save-criteria') for (const el of form.querySelectorAll('[name="use-suggestion"]')) { if (`use-suggestion=${el.value}` in values) el.checked = values[`use-suggestion=${el.value}`]; }
    if (!values || form.dataset.form.startsWith('add-line-') || form.dataset.form === 'edit-line' || form.dataset.form === 'save-criteria' || form.dataset.form.startsWith('propose-') || form.dataset.form === 'reject-proposal' || form.dataset.form === 'withdraw-proposal' || form.dataset.form === 'save-stakeholders' || form.dataset.form.endsWith('-person') || form.dataset.form.endsWith('-roster') || form.dataset.form === 'save-scenarios' || form.dataset.form === 'setup-workspace' || form.dataset.form === 'roi-assumptions' || form.dataset.form === 'context-facts') continue;
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
// The workspace switcher, in the Settings menu. A client workspace offers
// Reset (back to its configuration) but not Start empty.
function renderWorkspaceMenu() {
  const list = document.getElementById('workspace-list');
  if (!list) return;
  list.innerHTML = BUILT_IN_WORKSPACES.map((w) => `<button class="menu-item${w.id === openWorkspace.id ? ' is-current' : ''}" data-action="switch-workspace" data-workspace="${w.id}" ${w.id === openWorkspace.id ? 'aria-current="true"' : ''}>${w.name} <span class="muted small">${w.note}</span></button>`).join('');
  const startEmpty = document.querySelector('[data-action="start-empty"]');
  if (startEmpty) startEmpty.hidden = isClient();
  const resetBtn = document.querySelector('[data-action="reset"]');
  const label = document.getElementById('demo-label');
  if (label) label.textContent = isClient() ? 'This workspace' : 'Demo';
  const note = document.querySelector('.menu-note');
  if (note) note.textContent = isClient() ? `${openWorkspace.name} is a real configuration: no fictional data, and nothing here calls a model.` : 'Demo data only. No real customers, money or model calls.';
  if (resetBtn) { resetBtn.textContent = isClient() ? 'Reset workspace' : 'Reset demo'; resetBtn.title = isClient() ? `Bring ${openWorkspace.name} back to its configuration` : 'Bring back the original Northstar demo'; }
}
const demoConfirm = document.getElementById('demo-confirm');
function askToErase(kind) {
  pendingErase = kind;
  document.getElementById('demo-confirm-go').textContent = kind === 'start-empty' ? 'Erase and start empty' : isClient() ? 'Erase and reset the workspace' : 'Erase and reset the demo';
  demoButtons.open = false;
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
  if (restoreFocus && kind) demoButtons.querySelector('summary').focus();
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
  // The welcome choice is remembered, so it shows once.
  if (action === 'welcomed') { try { window.localStorage.setItem(WELCOMED, '1'); } catch { /* storage blocked: it shows again next visit */ } }
  // The guided demo acts on its own copy of the demo state.
  if (action === 'guide-run-tests' || action === 'guide-decide' || action === 'guide-breach') {
    guideAt(1);
    guideDo[{ 'guide-run-tests': 'runTests', 'guide-decide': 'decide', 'guide-breach': 'breach' }[action]]();
    render();
    return;
  }
  if (action === 'simulate-breach') store.dispatch('simulateBreach', capId);
  // Context facts are reviewed one at a time (#139).
  if (action === 'fact-confirm' || action === 'fact-reject') {
    const route = here();
    dispatchOr(route, () => { store.dispatch('reviewContextFact', btn.dataset.key, { decision: action === 'fact-confirm' ? 'confirm' : 'reject', by: actor(store.get()) }); clearErrorOn(route, 'error'); render(); });
  }
  if (action === 'confirm-setup') {
    const route = `#/capabilities/${capId}/setup/review`;
    dispatchOr(route, () => { store.dispatch('confirmSetup', capId, { by: actor(store.get(), capId) }); location.hash = route; render(); });
  }
  if (action === 'authorize') {
    dispatchOr(here(), () => {
      store.dispatch('authorize', capId, { by: actor(store.get(), capId) });
      // Land on Decide, which says what was decided and points to Monitor.
      location.hash = `#/capabilities/${capId}?tab=decide`;
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
    if (!location.hash.includes('?error=')) location.hash = getCapability(store.get(), capId).setup ? `#/capabilities/${capId}/setup` : `#/capabilities/${capId}?tab=status&show=rules`;
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
  if (action === 'toggle-edit') {
    try { if (editing) window.localStorage.removeItem(EDIT_KEY); else window.localStorage.setItem(EDIT_KEY, '1'); } catch { /* storage blocked */ }
    location.reload();
  }
  if (action === 'copy-publish') {
    const ta = document.getElementById('publish-json');
    if (ta) { ta.select(); try { navigator.clipboard.writeText(ta.value); btn.textContent = 'Copied'; } catch { /* select is enough */ } }
  }
  if (action === 'switch-workspace') {
    try { window.localStorage.setItem(WORKSPACE_KEY, btn.dataset.workspace); } catch { /* storage blocked: the demo stays open */ }
    location.hash = '#/overview';
    location.reload();
  }
  // The decision brief's Print button (D1).
  if (action === 'print') window.print();
  if (action === 'cancel-erase') closeEraseConfirm();
  if (action === 'confirm-erase') {
    const kind = pendingErase;
    closeEraseConfirm(false);
    store.dispatch(kind === 'start-empty' ? 'startEmpty' : 'reset');
    applyExternalEvidence();
    readOnlyTried = false;
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
  if (el.dataset.action === 'set-acting') {
    if (parseRoute().parts[0] === 'guide' && guide) { guide = { ...guide, role: el.value }; render(); return; }
    store.dispatch('setActingAs', el.value || null);
    return;
  }
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
  const criteria = rows('criteria').map((tr) => ({ id: val(tr, 'c-id') || undefined, name: val(tr, 'c-name'), target: val(tr, 'c-target'), note: val(tr, 'c-note'), source: val(tr, 'c-source') || undefined, current: val(tr, 'c-current') || undefined, status: val(tr, 'c-status') || undefined, requirement: val(tr, 'c-requirement') || undefined }));
  const requirements = rows('requirements').map((tr) => ({ id: val(tr, 'r-id') || undefined, text: val(tr, 'r-text'), source: val(tr, 'r-source') || undefined, kind: val(tr, 'r-kind') || undefined }));
  return { criteria, requirements };
}

document.addEventListener('submit', (e) => {
  const guideReview = e.target.closest('[data-form="guide-review"]');
  if (guideReview && guide) {
    e.preventDefault();
    const f = new FormData(guideReview);
    const text = String(f.get('whatHappened') || '').trim();
    guide = { ...guide, state: recordReview(guide.state, guide.capabilityId, { by: guide.role, whatHappened: text, cause: 'Return status was not checked before refunding.', changes: 'Check return status before any automatic refund.' }) };
    render();
    return;
  }
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
    const stakeholders = [...stForm.querySelectorAll('[data-rows="stakeholders"] tr')].map((tr) => ({ team: val(tr, 's-team'), person: val(tr, 's-person'), stance: val(tr, 's-stance'), position: val(tr, 's-stance') === val(tr, 's-stance-was') ? val(tr, 's-position') : '', quote: val(tr, 's-quote'), ...(val(tr, 's-role') ? { role: val(tr, 's-role') } : {}) }));
    dispatchOr(`#/capabilities/${capId}/stakeholders/edit`, () => {
      const before = capData(store.get(), capId).proposals.length;
      store.dispatch('saveStakeholders', capId, { stakeholders, by: actor(store.get(), capId) });
      const after = capData(store.get(), capId).proposals;
      location.hash = after.length > before ? `#/capabilities/${capId}/proposals/${after[after.length - 1].id}` : getCapability(store.get(), capId).setup ? `#/capabilities/${capId}/setup` : `#/capabilities/${capId}?tab=status`;
    });
    return;
  }
  const scForm = e.target.closest('[data-form="save-scenarios"]');
  if (scForm) {
    e.preventDefault();
    const capId = parseRoute().parts[1];
    const val = (tr, name) => (tr.querySelector(`[name="${name}"]`) || {}).value || '';
    const scenarios = [...scForm.querySelectorAll('[data-rows="scenarios"] tr')].map((tr) => ({ id: val(tr, 'sc-id') || undefined, source: val(tr, 'sc-source'), group: val(tr, 'sc-group'), name: val(tr, 'sc-name'), situation: val(tr, 'sc-situation'), expected: val(tr, 'sc-expected') }));
    dispatchOr(`#/capabilities/${capId}/scenarios/edit`, () => { store.dispatch('saveScenarios', capId, { scenarios, by: actor(store.get(), capId) }); location.hash = `#/capabilities/${capId}?tab=decide&show=tests`; });
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
  // ROI assumptions (B2): a new version, with who and why.
  const roiForm = e.target.closest('[data-form="roi-assumptions"]');
  if (roiForm) {
    e.preventDefault();
    const capId = roiForm.dataset.capability;
    const f = new FormData(roiForm);
    dispatchOr(here(), () => {
      store.dispatch('setRoiAssumptions', capId, { monthlyCases: f.get('monthlyCases'), humanMinutesPerCase: f.get('humanMinutesPerCase'), humanCostPerHour: f.get('humanCostPerHour') }, { by: actor(store.get(), capId), reason: f.get('reason') });
      clearErrorOn(here(), 'error');
      render();
    });
    return;
  }
  // Record a result by hand (#126): kept as recorded, with who recorded it.
  const evForm = e.target.closest('[data-form="record-evidence"]');
  if (evForm) {
    e.preventDefault();
    const capId = evForm.dataset.capability;
    const f = new FormData(evForm);
    const v = (k) => (f.get(k) || '').toString();
    dispatchOr(here(), () => {
      store.dispatch('recordManualEvidence', capId, { by: actor(store.get(), capId), label: v('label'), kind: v('kind'), type: v('type'), passed: v('passed'), total: v('total'), value: v('value'), segment: v('segment'), severity: v('severity'), observedAt: v('observedAt'), note: v('note'), url: v('url') });
      location.hash = `#/capabilities/${capId}?tab=decide&show=all`;
    });
    return;
  }
  // Configure evidence (#126): map or unmap one row; after results, a proposal.
  const mapForm = e.target.closest('[data-form="map-evidence"]');
  if (mapForm) {
    e.preventDefault();
    const capId = mapForm.dataset.capability;
    const f = new FormData(mapForm);
    const v = (k) => (f.get(k) || '').toString();
    const unmap = e.submitter && e.submitter.value === 'unmap';
    const measure = unmap ? null : { source: v('source'), metric: v('metric'), segment: v('segment'), stat: v('stat'), minSample: v('minSample'), kind: v('kind') };
    dispatchOr(here(), () => {
      store.dispatch('mapEvidence', capId, { rowKind: mapForm.dataset.kind, rowId: mapForm.dataset.row, measure, by: actor(store.get(), capId), reason: v('reason') });
      location.hash = `#/capabilities/${capId}/evidence/configure`;
    });
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
    // Stay where the decision was made: Status or the full approvals list.
    const route = here();
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
      workspace: { name: val(wsForm, 'ws-name') },
      workflow: { name: val(wsForm, 'wf-name') },
      founder: { name: val(wsForm, 'f-name'), title: val(wsForm, 'f-title') },
    };
    // Keep what was typed if setup is refused; drop it once it goes through.
    setupDraft = draft;
    dispatchOr('#/overview', () => { store.dispatch('setUpWorkspace', draft); setupDraft = null; location.hash = '#/setup/context'; render(); });
    return;
  }
  const critForm = e.target.closest('[data-form="save-criteria"]');
  if (critForm) {
    e.preventDefault();
    const capId = parseRoute().parts[1];
    const { criteria, requirements } = readCriteriaRows(critForm);
    dispatchOr(`#/capabilities/${capId}/criteria/edit`, () => {
      // Suggestions are added one by one, by ticking each (#139).
      const picked = [...critForm.querySelectorAll('[name="use-suggestion"]:checked')].map((el) => JSON.parse(el.value));
      store.dispatch('saveCriteria', capId, { criteria: [...criteria, ...picked.filter((x) => x.kind === 'target').map((x) => x.row)], requirements: [...requirements, ...picked.filter((x) => x.kind === 'requirement').map((x) => x.row)], by: actor(store.get(), capId), reason: critForm.reason.value });
      location.hash = getCapability(store.get(), capId).setup ? `#/capabilities/${capId}/setup` : `#/capabilities/${capId}?tab=decide&show=targets`;
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
  // The setup flow (#139). Each form saves one step of a draft.
  const setupForm = e.target.closest('[data-form="context-describe"], [data-form="context-facts"], [data-form="fact-correct"], [data-form="start-capability"], [data-form="setup-capability"], [data-form="setup-today"], [data-form="setup-risk"]');
  if (!setupForm) return;
  e.preventDefault();
  const f = new FormData(setupForm);
  const kind = setupForm.dataset.form;
  const route = here();
  const by = actor(store.get(), setupForm.dataset.capability);
  const sid = setupForm.dataset.capability;
  dispatchOr(route, () => {
    if (kind === 'context-describe') store.dispatch('suggestFromDescription', { description: f.get('description'), by });
    if (kind === 'fact-correct') store.dispatch('reviewContextFact', setupForm.dataset.key, { decision: 'confirm', value: f.get('value'), by });
    if (kind === 'context-facts') {
      const now = contextNow(store.get());
      const facts = {};
      for (const fld of CONTEXT_FIELDS) {
        const v = fld.multi ? f.getAll(`ctx-${fld.key}`) : String(f.get(`ctx-${fld.key}`) || '').trim();
        const empty = fld.multi ? !v.length : !v;
        const was = now[fld.key] && now[fld.key].status === 'confirmed' ? now[fld.key].value : null;
        if (empty || JSON.stringify(v) === JSON.stringify(was)) continue;
        facts[fld.key] = v;
      }
      if (Object.keys(facts).length) store.dispatch('recordContext', { facts, by, reason: f.get('reason') });
    }
    if (kind === 'start-capability') {
      const before = store.get().capabilities.length;
      store.dispatch('startCapability', { name: f.get('name'), summary: f.get('summary'), owner: f.get('owner'), template: f.get('template'), lifecycle: f.get('lifecycle'), by: actor(store.get()) });
      location.hash = `#/capabilities/${store.get().capabilities[before].id}/setup`;
      return;
    }
    if (kind === 'setup-capability') store.dispatch('editSetupCapability', sid, { name: f.get('name'), summary: f.get('summary'), owner: f.get('owner'), template: f.get('template') || undefined, lifecycle: f.get('lifecycle') || undefined });
    if (kind === 'setup-today') {
      const eff = f.get('effective');
      const fields = Object.fromEntries(BASELINE_FIELDS.map((b) => [b.key, f.get(`b-${b.key}`) || '']));
      store.dispatch('recordBaseline', sid, { fields, effective: eff === '' ? { status: 'not-recorded' } : eff === 'unknown' ? { status: 'unknown', note: f.get('effective-note') } : { level: Number(eff), note: f.get('effective-note') }, by, reason: f.get('reason') });
    }
    if (kind === 'setup-risk') {
      store.dispatch('saveSetupRisk', sid, { impact: f.get('impact'), likelihood: f.get('likelihood'), scale: f.get('scale') || undefined, reversibility: f.get('reversibility'), exposure: f.get('exposure'), failureTypes: f.getAll('failureTypes'), note: f.get('riskNote'), by });
      if (f.get('today')) store.dispatch('setStartingAuthority', sid, { today: f.get('today'), rationale: f.get('rationale') });
    }
    if (sid && kind !== 'setup-risk') { location.hash = `#/capabilities/${sid}/setup`; return; }
    clearErrorOn(route, 'error');
    render();
  });
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
  const ro = e.target.closest('[data-action="set-rollout"]');
  if (ro) {
    // Rollout plan (C1): one field at a time, debounced like the rationale.
    const { capability, field } = ro.dataset;
    const value = ro.value;
    clearTimeout(outcomeTimers[`rollout-${field}`]);
    outcomeTimers[`rollout-${field}`] = setTimeout(() => store.dispatch('setRolloutField', capability, field, value), ro.tagName === 'SELECT' || ro.type === 'date' ? 0 : 300);
    return;
  }
  const out = e.target.closest('[data-action="set-outcome"]');
  if (out) {
    // Expected impact (B1): one row field at a time, debounced like the rationale.
    const { capability, index, field } = out.dataset;
    const value = out.value;
    clearTimeout(outcomeTimers[`${index}-${field}`]);
    outcomeTimers[`${index}-${field}`] = setTimeout(() => store.dispatch('setOutcome', capability, Number(index), field, value), 300);
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
const outcomeTimers = {};

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
loadExternalEvidence();
loadPublishedRecords();
