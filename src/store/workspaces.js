// Built-in workspaces (#121). Northstar is the fictional demo. Any other
// built-in workspace is a client configuration (src/data/workspaces/*.js):
// plain data, turned into a workspace by buildWorkspace, which runs the same
// store transitions a person would: set up the workspace, add a capability,
// build and finalize its rules, save its targets with the evidence that
// judges them, name its stakeholders. Nothing in the core knows any client.
//
// Each workspace is its own state, persisted under its own key, so switching
// never mixes a client's real configuration with the demo.

import { initialState } from './state.js';
import { startEmpty, setUpWorkspace } from './workspace.js';
import { addCapability } from './capabilities.js';
import { startContractDraft, reviewSuggestion, removeContractLine, addContractLine, confirmSection, finalizeContract, SECTION_KEYS } from './contract.js';
import { saveCriteria } from './evidence.js';
import { saveStakeholders } from './proposals.js';
import { recordBaseline } from './context.js';
import { capData } from './state.js';
import { personKey } from './people.js';
import { stateWorkspace } from '../data/workspaces/state.js';
import { STORAGE_KEY } from './persist.js';

export const DEMO_WORKSPACE = 'northstar';

// The workspaces this build ships with, in the order the switcher lists them.
export const BUILT_IN_WORKSPACES = [
  { id: DEMO_WORKSPACE, name: 'Northstar Support', note: 'Demo, fictional', build: () => initialState() },
  { id: stateWorkspace.id, name: stateWorkspace.workspace.name, note: stateWorkspace.note, build: (opts) => buildWorkspace(stateWorkspace, opts) },
];
export const findWorkspace = (id) => BUILT_IN_WORKSPACES.find((w) => w.id === id) || BUILT_IN_WORKSPACES[0];
// Where a workspace is saved in the browser. The demo keeps its old key.
export const storageKeyFor = (id) => (id === DEMO_WORKSPACE ? STORAGE_KEY : `${STORAGE_KEY}:${id}`);

// Today's date, as data (YYYY-MM-DD).
export const realToday = () => new Date().toISOString().slice(0, 10);

// Build a workspace from a client configuration. `today` defaults to the real
// date: a client workspace isn't on the demo's clock.
export function buildWorkspace(config, { today = realToday() } = {}) {
  let s = { ...startEmpty(initialState()), today };
  s = setUpWorkspace(s, { workspace: config.workspace, workflow: config.workflow, founder: config.founder });
  const by = personKey(config.founder.name);
  // Sources the implementation team has connected; the product person maps them.
  s = { ...s, evidenceSources: (config.sources || []).map((src) => ({ ...src, connection: 'connected' })), clientWorkspace: { id: config.id, real: Boolean(config.real), note: config.note || '' } };
  for (const c of config.capabilities || []) {
    s = addCapability(s, { name: c.name, summary: c.summary, owner: by, risk: c.risk, today: c.today, by });
    const id = s.capabilities.at(-1).id;
    // The rules, through the builder: every suggestion and template line is
    // reviewed, the client's own lines are added, each section confirmed.
    s = startContractDraft(s, id, { by });
    for (const line of capData(s, id).contractDraft.lines) {
      if (line.source === 'ai') s = reviewSuggestion(s, id, line.id, { decision: 'reject' });
      else s = removeContractLine(s, id, line.id);
    }
    for (const section of SECTION_KEYS) for (const text of (c.rules[section] || [])) s = addContractLine(s, id, section, text);
    for (const section of SECTION_KEYS) s = confirmSection(s, id, section, true);
    s = finalizeContract(s, id, { by });
    s = saveCriteria(s, id, { criteria: c.targets, requirements: c.requirements, by, reason: c.criteriaReason });
    if (c.stakeholders && c.stakeholders.length) s = saveStakeholders(s, id, { stakeholders: c.stakeholders.map((x) => ({ ...x, person: personKey(x.name) })), by });
    // What it actually does today (#137), when the configuration records it.
    if (c.baseline) s = recordBaseline(s, id, { ...c.baseline, by });
  }
  return s;
}

// A client workspace runs on the real calendar: on load, move its date
// forward to today (never back), so freshness is measured against now.
export function advanceToday(state, date) {
  return date > state.today ? { ...state, today: date } : state;
}
