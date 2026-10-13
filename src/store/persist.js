// The store wrapper: dispatch, subscriptions, and localStorage persistence.

import { initialState, reset } from './state.js';
import { addPerson, editPerson, deactivatePerson, proposeRosterChange, approveRosterChange, rejectRosterChange, withdrawRosterChange, setActingAs } from './people.js';
import { addCapability, amend } from './capabilities.js';
import { startContractDraft, reviewSuggestion, addContractLine, editContractLine, removeContractLine, confirmSection, finalizeContract } from './contract.js';
import { selectDecision, setCondition, setRationale, setOutcome, setRolloutField, authorize, proposeAuthority } from './decisions.js';
import { setRoiAssumptions } from './value.js';
import { startTestRun, advanceTestRun, saveCriteria, saveScenarios, addStarterScenarios } from './evidence.js';
import { proposeAmendment, approveProposal, withdrawProposal, rejectProposal, saveStakeholders } from './proposals.js';
import { simulateBreach, recordReview } from './monitoring.js';
import { startEmpty, setUpWorkspace, renameWorkspace } from './workspace.js';
import { approveAction, rejectAction } from './queue.js';
import { importEvidenceFiles } from './external.js';
import { recordManualEvidence } from './sources.js';
import { advanceToday } from './workspaces.js';
import { mapEvidence } from './configure.js';

export const STORAGE_KEY = 'authority-lab-state-v14';


// One store per workspace (#121): \`key\` is where it is saved, \`build\` makes it
// from scratch, which is also what Reset does. The defaults are the demo's.
export function createStore({ storage = null, key = STORAGE_KEY, build = initialState } = {}) {
  let state = load(storage, key) || build();
  const listeners = new Set();

  function set(next) {
    if (next === state) return;
    state = next;
    save(storage, state, key);
    listeners.forEach((fn) => fn(state));
  }

  return {
    get: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    dispatch(action, ...args) {
      if (action === 'reset') { set(build()); return; }
      const fn = ACTIONS[action];
      if (!fn) throw new Error(`Unknown action: ${action}`);
      set(fn(state, ...args));
    },
  };
}

export const ACTIONS = {
  amend,
  addPerson,
  editPerson,
  deactivatePerson,
  proposeRosterChange,
  approveRosterChange,
  rejectRosterChange,
  withdrawRosterChange,
  saveCriteria,
  saveStakeholders,
  saveScenarios,
  addStarterScenarios,
  proposeAuthority,
  proposeAmendment,
  approveProposal,
  rejectProposal,
  withdrawProposal,
  addCapability,
  setActingAs,
  startContractDraft,
  reviewSuggestion,
  addContractLine,
  editContractLine,
  removeContractLine,
  confirmSection,
  finalizeContract,
  startTestRun,
  advanceTestRun,
  selectDecision,
  setCondition,
  setRationale,
  setOutcome,
  setRolloutField,
  authorize,
  simulateBreach,
  recordReview,
  startEmpty,
  setUpWorkspace,
  renameWorkspace,
  approveAction,
  rejectAction,
  setRoiAssumptions,
  importEvidenceFiles: (state, files) => importEvidenceFiles(state, files).state,
  recordManualEvidence,
  mapEvidence,
  advanceToday,
  reset,
};

export function load(storage, key = STORAGE_KEY) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 14) return null;
    // A run interrupted by a reload restarts cleanly.
    for (const id of Object.keys(parsed.capabilityData || {})) {
      const d = parsed.capabilityData[id];
      if (d.testRun && d.testRun.status === 'running') d.testRun = { ...d.testRun, status: 'not-run', completed: [] };
    }
    return parsed;
  } catch {
    return null;
  }
}

export function save(storage, state, key = STORAGE_KEY) {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(state));
  } catch {
    // Storage may be unavailable (private window, blocked). The app still works.
  }
}
