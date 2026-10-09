// Read-only derivations: versioned objects, activity, derived capability
// fields, readiness and test summaries.

import * as seed from '../data/seed.js';
import { VERSIONED_KINDS, getCapability, capData } from './state.js';

// The workspace and workflow from state. Saved state from before they moved
// into state falls back to the seed.
export function workspaceOf(state) {
  if (state.setupPending) return { id: 'new', name: 'New workspace', description: '' };
  return state.workspace || seed.workspace;
}

export function workflowOf(state) {
  if (state.setupPending) return { id: 'new', name: 'Workflow not set up', description: '' };
  return state.workflow || seed.workflow;
}

export function currentVersion(state, capabilityId, kind) {
  const list = capData(state, capabilityId).versions[kind] || [];
  return list[list.length - 1] || null;
}

export const EMPTY_CONTRACT = { may: [], mustAsk: [], mustNever: [], escalation: [], autoRestriction: [] };
export const EMPTY_RISK = { impact: '', reversibility: '', exposure: '', failureTypes: [] };

// The current value of a versioned object: the latest version. This is the
// only way views read the contract, risk profile, criteria, requirements and
// stakeholders.
export function current(state, capabilityId, kind) {
  const v = currentVersion(state, capabilityId, kind);
  if (v) return v.value;
  if (kind === 'contract') return EMPTY_CONTRACT;
  if (kind === 'risk') return EMPTY_RISK;
  return [];
}

export function versionList(state, capabilityId, kind) {
  return capData(state, capabilityId).versions[kind] || [];
}

export function versionsInForce(state, capabilityId) {
  return Object.fromEntries(VERSIONED_KINDS.map((k) => [k, (currentVersion(state, capabilityId, k) || { version: 0 }).version]));
}

// Evidence sources that are measured performance results, as opposed to
// opinions (stakeholder assessments, user feedback).
export const MEASURED_SOURCES = new Set(['Automated tests', 'Pilot outcomes', 'Human review', 'Operational metrics', 'Cost', 'Incident']);

// True once performance results have been seen for the capability: a recorded
// test run, a pilot, or a measured evidence item. Stakeholder assessments and
// user feedback alone do not count. This is the single definition used by
// amendments (afterEvidence) and by the criteria lock (#6).
export function performanceResultsSeen(state, capabilityId) {
  const d = capData(state, capabilityId);
  return Boolean(d.testRun.lastRun) || Boolean(d.pilot) || d.evidence.some((e) => MEASURED_SOURCES.has(e.source));
}

// Kinds shown in Activity by default (decision 3): decisions, automatic
// restrictions, test runs, pilot milestones, failures, criteria locked,
// contract finalized, plus mitigations and stakeholder reviews. Setup-type
// events (for example "criteria defined") sit in Full history. An amendment
// is surfaced only when it was made after performance results were seen.
export const SURFACED_KINDS = new Set(['authority', 'restriction', 'test', 'milestone', 'criteria-locked', 'contract-finalized', 'failure', 'review', 'mitigation', 'decision', 'proposal']);

export const KIND_LABELS_ALL = {
  authority: 'Authority', restriction: 'Automatic restriction', failure: 'Failure', mitigation: 'Mitigation', milestone: 'Milestone',
  review: 'Review', criteria: 'Criteria defined', 'criteria-locked': 'Criteria locked', 'contract-finalized': 'Contract finalized', 'contract-draft': 'Contract draft', 'criteria-saved': 'Criteria saved', 'scenarios-saved': 'Scenarios saved', proposal: 'Proposal', roster: 'Roster',
  decision: 'Decision', test: 'Test run', amendment: 'Amendment',
};

// Activity events for the Activity screen. Default: surfaced events only.
export function activityEvents(state, { full = false, kind = 'all', capabilityId = 'all' } = {}) {
  return state.activity.filter((e) =>
    (full || e.surfaced) && (kind === 'all' || e.kind === kind) && (capabilityId === 'all' || e.capabilityId === capabilityId));
}

export function versionFor(state, capabilityId, kind, number) {
  return (capData(state, capabilityId).versions[kind] || []).find((v) => v.version === number) || null;
}

// Amendments to the criteria or evidence requirements that were made after
// performance results were seen and that a decision record relied on
// (version 2 up to the version in force at the time of the record).
export function amendmentsAfterEvidenceFor(state, record) {
  if (!record.versions) return [];
  const out = [];
  for (const kind of ['criteria', 'requirements']) {
    const inForce = record.versions[kind] || 0;
    for (const v of capData(state, record.capabilityId).versions[kind] || []) {
      if (v.version > 1 && v.version <= inForce && v.afterEvidence) out.push({ kind, ...v });
    }
  }
  return out;
}

export function isSurfaced(event) {
  if (event.kind === 'amendment') return Boolean(event.afterEvidence);
  return SURFACED_KINDS.has(event.kind);
}

// Derived capability fields (#4 follow-up). Nothing stores these; they are
// computed from the decision records, the pending decision and the evidence,
// so they cannot drift.
export function lastDecisionId(state, capabilityId) {
  const recs = state.decisionRecords.filter((r) => r.capabilityId === capabilityId);
  return recs.length ? recs[recs.length - 1].id : null;
}

export function proposedAuthority(state, capabilityId) {
  return capData(state, capabilityId).decision.proposed || null;
}

export function decisionRequired(state, capabilityId) {
  return Boolean(proposedAuthority(state, capabilityId));
}

// The latest date evidence was gathered about the capability: a test run, an
// evidence item, or the pilot. Decisions are not evaluations. Falls back to
// the date it was defined.
export function lastEvaluated(state, capabilityId) {
  const cap = getCapability(state, capabilityId);
  const d = capData(state, capabilityId);
  const dates = [
    d.testRun.lastRun,
    ...d.evidence.map((e) => e.date),
    d.pilot ? (d.pilot.ended || d.pilot.lastCase) : null,
  ].filter(Boolean);
  if (!dates.length) return cap ? cap.definedOn || null : null;
  return dates.reduce((a, b) => (a > b ? a : b));
}

// The capability the workspace should be looking at: an alert first, then a
// pending decision, then an active monitoring period, then the most recently
// evaluated one.
export function focusCapability(state) {
  const caps = state.capabilities;
  const alerted = caps.find((c) => c.status === 'review-required');
  if (alerted) return alerted;
  const pending = caps.find((c) => decisionRequired(state, c.id));
  if (pending) return pending;
  const monitored = caps.find((c) => capData(state, c.id).monitoring);
  if (monitored) return monitored;
  // An empty workspace has no capability to focus on.
  return caps.slice().sort((a, b) => ((lastEvaluated(state, a.id) || '') < (lastEvaluated(state, b.id) || '') ? 1 : -1))[0] || null;
}

export function levelName(level) {
  const l = seed.AUTHORITY_LEVELS.find((x) => x.level === level);
  return l ? l.name : `Level ${level}`;
}

export function authorityLabel(auth, { short = false } = {}) {
  if (!auth) return '';
  const base = short ? `Level ${auth.level}` : `Level ${auth.level} — ${levelName(auth.level)}`;
  return auth.limited ? `${base} (limited)` : base;
}

export function readiness(state, capabilityId) {
  const reqs = current(state, capabilityId, 'requirements');
  const met = reqs.filter((r) => r.met).length;
  return { met, total: reqs.length, unmet: reqs.filter((r) => !r.met) };
}

export function testSummary(state, capabilityId) {
  const d = capData(state, capabilityId);
  const total = d.scenarios.length;
  const completedIds = new Set(d.testRun.completed);
  const completed = d.scenarios.filter((s) => completedIds.has(s.id));
  const failed = completed.filter((s) => !s.pass);
  const highSeverity = failed.filter((s) => s.severity === 'High');
  // The recorded result of the whole library, shown until the suite is run in
  // this session.
  const recordedFailed = d.scenarios.filter((s) => !s.pass);
  return {
    status: d.testRun.status,
    total,
    completed: completed.length,
    passed: completed.filter((s) => s.pass).length,
    failed: failed.length,
    highSeverity: highSeverity.length,
    lastRun: d.testRun.lastRun,
    recorded: {
      passed: total - recordedFailed.length,
      failed: recordedFailed.length,
      highSeverity: recordedFailed.filter((s) => s.severity === 'High').length,
    },
  };
}
