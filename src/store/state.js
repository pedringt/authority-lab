// The state shape: initial and seeded state, the per-capability data
// helpers, and the event log every transition writes to.

import * as seed from '../data/seed.js';
import { isSurfaced } from './selectors.js';
import { snapshotPerson } from './people.js';

export const clone = (v) => JSON.parse(JSON.stringify(v));

export function emptyCapabilityData() {
  return {
    scenarios: [],
    pilot: null,
    evidence: [],
    stakeholderSummary: null,
    recommendation: null,
    monitoringRule: null,
    breach: null,
    testRun: { status: 'not-run', lastRun: null, completed: [] },
    decision: { option: null, conditions: { maxValue: 50, noFraudFlag: true, policyClear: true, minConfidence: 90, noChargeback: true }, rationale: '', recordId: null, proposed: null },
    monitoring: null,
    // Simulated readings for the contract's restriction rules, keyed by the
    // rule's line (#49). Empty until something is measured.
    ruleReadings: {},
    // Incidents opened by a contract's incident rules (#50). Never removed.
    ruleIncidents: [],
    // Post-incident reviews (#54). Immutable; never removed.
    reviews: [],
    reviewRequired: false,
    // Contract builder draft (#5). null until started; kept after finalize so
    // the review (including rejected suggestions) stays on record.
    contractDraft: null,
    // Proposed amendments awaiting or past sign-off (#7). Never removed.
    proposals: [],
    // Versioned objects (decision 2). Each entry is a list of versions; the
    // current value is the last one. Versions are never edited.
    versions: { contract: [], criteria: [], requirements: [], risk: [], stakeholders: [] },
  };
}

export const VERSIONED_KINDS = ['contract', 'criteria', 'requirements', 'risk', 'stakeholders'];

export function firstVersion(value, { date, author, authorAt = null }) {
  return { version: 1, date, author, authorAt, reason: 'Initial version', afterEvidence: false, before: null, value: clone(value) };
}

export function seededCapabilityData(id) {
  const base = emptyCapabilityData();
  const s = seed.capabilityData[id];
  if (!s) return base;
  return {
    ...base,
    scenarios: clone(s.scenarios || []),
    pilot: s.pilot ? clone(s.pilot) : null,
    evidence: clone(s.evidence || []),
    stakeholderSummary: s.stakeholderSummary ? clone(s.stakeholderSummary) : null,
    recommendation: s.recommendation ? clone(s.recommendation) : null,
    monitoringRule: s.monitoringRule ? clone(s.monitoringRule) : null,
    breach: s.breach ? clone(s.breach) : null,
    ruleReadings: clone(s.ruleReadings || {}),
    testRun: { status: 'not-run', lastRun: s.lastTestRun || null, completed: [] },
    decision: {
      option: null,
      conditions: s.defaultConditions ? clone(s.defaultConditions) : base.decision.conditions,
      rationale: s.defaultRationale || '',
      recordId: null,
      // The pending authority change, if a decision is open.
      proposed: s.pendingDecision ? clone(s.pendingDecision) : null,
    },
  };
}

export function initialState() {
  const seedState = { roster: { versions: [{ value: seed.people }] } };
  const capabilityData = Object.fromEntries(seed.capabilities.map((c) => {
    const d = seededCapabilityData(c.id);
    const sd = seed.capabilityData[c.id] || {};
    const stamp = { date: c.definedOn || seed.TODAY, author: c.owner, authorAt: snapshotPerson(seedState, c.owner) };
    d.versions = {
      contract: [firstVersion(c.contract, stamp)],
      criteria: [firstVersion(sd.criteria || [], stamp)],
      requirements: [firstVersion(sd.requirements || [], stamp)],
      risk: [firstVersion(c.risk, stamp)],
      stakeholders: [firstVersion(sd.stakeholders || [], stamp)],
    };
    return [c.id, d];
  }));
  // The capability object holds identity and current authority/status only.
  // The contract and risk profile live in the version lists; the pending
  // decision, last decision and last-evaluated date are derived by selectors.
  const capabilities = seed.capabilities.map(({ contract, risk, proposed, decisionRequired, lastEvaluated, lastDecisionId, ...rest }) => clone(rest));
  return {
    version: 14,
    today: seed.TODAY,
    // The people roster, versioned (#22). Version 1 is the seed. People are
    // never deleted; they are deactivated.
    roster: { versions: [{ version: 1, date: seed.TODAY, author: null, authorAt: null, reason: 'Seed roster.', afterEvidence: false, before: null, value: clone(seed.people) }] },
    // Governed roster changes (#23): rights grants and removals, and the
    // deactivation of anyone holding a right. Never removed.
    rosterProposals: [],
    // Who is acting in the UI. null means "the owner of the capability in
    // context"; a person key overrides it (the "acting as" picker).
    actingAs: null,
    capabilities,
    capabilityData,
    decisionRecords: clone(seed.decisionRecords).map((r) => ({ ...r, authorizedByAt: snapshotPerson(seedState, r.authorizedBy), ownerAt: snapshotPerson(seedState, r.owner || (seed.capabilities.find((c) => c.id === r.capabilityId) || {}).owner) })),
    activity: clone(seed.activity),
    alerts: [],
  };
}


export function getCapability(state, id) {
  return state.capabilities.find((c) => c.id === id);
}

export function capData(state, id) {
  return state.capabilityData[id] || emptyCapabilityData();
}


export function updateCap(state, capabilityId, patch) {
  const current = capData(state, capabilityId);
  const next = typeof patch === 'function' ? patch(current) : { ...current, ...patch };
  return { ...state, capabilityData: { ...state.capabilityData, [capabilityId]: next } };
}

export function logEvent(state, event) {
  const e = { id: `ACT-${Date.now()}-${state.activity.length}`, date: state.today, ...event };
  if (e.surfaced === undefined) e.surfaced = isSurfaced(e);
  return { ...state, activity: [e, ...state.activity] };
}

export function reset() {
  return initialState();
}
