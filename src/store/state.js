// The state shape: initial and seeded state, the per-capability data
// helpers, and the event log every transition writes to.

import * as seed from '../data/seed.js';
import { isSurfaced } from './selectors.js';
import { snapshotPerson } from './people.js';
import { callTool } from './tools.js';

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
    decision: { option: null, conditions: { maxValue: 50, noFraudFlag: true, policyClear: true, minConfidence: 90, noChargeback: true, maxDailyTotal: 500, maxDailyCount: 20 }, rationale: '', recordId: null, proposed: null },
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
    // ROI assumptions, one entry per version (B2). Seeded ones say so.
    roiAssumptions: clone(s.roiAssumptions || []),
    testRun: { status: 'not-run', lastRun: s.lastTestRun || null, completed: [] },
    decision: {
      option: null,
      conditions: s.defaultConditions ? clone(s.defaultConditions) : base.decision.conditions,
      rationale: s.defaultRationale || '',
      // Expected impact for an expansion (B1), prefilled for the seeded decision.
      outcomes: s.defaultOutcomes ? clone(s.defaultOutcomes) : [],
      // Shown as "prefilled for the demo" until someone edits them.
      outcomesPrefilled: Boolean(s.defaultOutcomes),
      // The rollout plan for an expansion (C1), prefilled for the seeded decision.
      rollout: s.defaultRollout ? clone(s.defaultRollout) : {},
      rolloutPrefilled: Boolean(s.defaultRollout),
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
    // A seeded pending decision opened on the seeded versions (version 1).
    if (d.decision.proposed) d.decision = { ...d.decision, versionsAtOpen: Object.fromEntries(Object.keys(d.versions).map((k) => [k, 1])) };
    return [c.id, d];
  }));
  // The capability object holds identity and current authority/status only.
  // The contract and risk profile live in the version lists; the pending
  // decision, last decision and last-evaluated date are derived by selectors.
  const capabilities = seed.capabilities.map(({ contract, risk, proposed, decisionRequired, lastEvaluated, lastDecisionId, ...rest }) => clone(rest));
  const base = {
    version: 14,
    today: seed.TODAY,
    // The workspace and its one workflow (roadmap item 7). Seeded here so an
    // empty workspace can set its own.
    workspace: clone(seed.workspace),
    workflow: clone(seed.workflow),
    // Systems of record (roadmap item 9, A2): orders, customers, fraud flags,
    // chargebacks, the refund ledger and escalations. The gate reads facts
    // only from here.
    systems: clone(seed.systems),
    // "Waiting for a person" (A4): actions the gate sent to a person.
    actionQueue: [],
    // Every gate check and every decision on a waiting action (A5).
    gateLog: [],
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
  // Seeded requests go through the real gate, so the queue holds exactly what it would.
  return seed.waitingRequests.reduce((st, r) => callTool(st, r.capabilityId, r.call, { source: 'seeded' }).state, base);
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

// When authority drops for any reason (an automatic restriction, a restrict,
// suspend or redesign decision), an open proposal to expand closes: it was
// made from a level the capability no longer has. A new proposal, from the
// new level, is required (#89 review: a proposal for Level 4 survived a
// restriction to Level 2 and was then authorized, L2 to L4 in one step).
export function closeOpenProposal(state, capabilityId, previous, next) {
  const d = capData(state, capabilityId);
  const p = d && d.decision && d.decision.proposed;
  if (!p || !(next.level < previous.level)) return state;
  const s = updateCap(state, capabilityId, (x) => ({ ...x, decision: { ...x.decision, proposed: null, option: null, openedAt: null, versionsAtOpen: null, outcomes: [], outcomesPrefilled: false, rollout: {}, rolloutPrefilled: false } }));
  const cap = getCapability(state, capabilityId);
  return logEvent(s, { kind: 'decision', surfaced: true, title: `Proposal closed: authority changed from Level ${previous.level} to Level ${next.level}`, body: `${cap.name}: the open proposal to move to Level ${p.level} was made at Level ${previous.level}. Authority is now Level ${next.level}, so the proposal is closed. Any expansion needs a new proposal, one level up from Level ${next.level}.`, capabilityId, link: `#/capabilities/${capabilityId}/decision` });
}

export function reset() {
  return initialState();
}
