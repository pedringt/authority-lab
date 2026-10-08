// Application state for the prototype. Plain data, pure transitions, optional
// persistence. Views never mutate state directly; they dispatch actions.
// Everything that belongs to one capability lives under
// state.capabilityData[capabilityId].

import * as seed from './data/seed.js';
import { pickTemplate, suggestLines, CONTRACT_SECTIONS } from './data/contract-templates.js';
import { defaultCriteria, defaultRequirements } from './data/criteria-defaults.js';
import { starterScenarios } from './data/scenario-templates.js';

export const STORAGE_KEY = 'authority-lab-state-v12';

const clone = (v) => JSON.parse(JSON.stringify(v));

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

function firstVersion(value, { date, author }) {
  return { version: 1, date, author, reason: 'Initial version', afterEvidence: false, before: null, value: clone(value) };
}

function seededCapabilityData(id) {
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
  const capabilityData = Object.fromEntries(seed.capabilities.map((c) => {
    const d = seededCapabilityData(c.id);
    const sd = seed.capabilityData[c.id] || {};
    const stamp = { date: c.definedOn || seed.TODAY, author: c.owner };
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
    version: 12,
    today: seed.TODAY,
    // The people roster, versioned (#22). Version 1 is the seed. People are
    // never deleted; they are deactivated.
    roster: { versions: [{ version: 1, date: seed.TODAY, author: null, reason: 'Seed roster.', afterEvidence: false, before: null, value: clone(seed.people) }] },
    // Governed roster changes (#23): rights grants and removals, and the
    // deactivation of anyone holding a right. Never removed.
    rosterProposals: [],
    // Who is acting in the UI. null means "the owner of the capability in
    // context"; a person key overrides it (the "acting as" picker).
    actingAs: null,
    capabilities,
    capabilityData,
    decisionRecords: clone(seed.decisionRecords),
    activity: clone(seed.activity),
    alerts: [],
  };
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function getCapability(state, id) {
  return state.capabilities.find((c) => c.id === id);
}

export function capData(state, id) {
  return state.capabilityData[id] || emptyCapabilityData();
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

// ---------------------------------------------------------------------------
// People roster (#22)
// ---------------------------------------------------------------------------

export function people(state) {
  const v = state.roster && state.roster.versions;
  return v && v.length ? v[v.length - 1].value : seed.people;
}

export function personRecord(state, key) {
  return people(state)[key] || null;
}

export function activePeople(state) {
  return Object.fromEntries(Object.entries(people(state)).filter(([, p]) => p.active !== false));
}

export function isActivePerson(state, key) {
  const p = personRecord(state, key);
  return Boolean(p && p.active !== false);
}

export function isWorkspaceAdmin(state, key) {
  const p = personRecord(state, key);
  return Boolean(p && p.active !== false && p.rights && p.rights.workspaceAdmin);
}

export function isRiskApprover(state, key) {
  const p = personRecord(state, key);
  return Boolean(p && p.active !== false && p.rights && p.rights.riskApprover);
}

export function rosterVersions(state) {
  return (state.roster && state.roster.versions) || [];
}

function requireActive(state, key, what = 'act') {
  if (!key || !personRecord(state, key)) throw new Error(`A named person must ${what}.`);
  if (!isActivePerson(state, key)) throw new Error(`${personRecord(state, key).name} is deactivated and cannot ${what}.`);
}

function requireAdmin(state, key) {
  requireActive(state, key, 'change the roster');
  if (!isWorkspaceAdmin(state, key)) throw new Error(`${personRecord(state, key).name} is not a workspace admin. Only a workspace admin changes the roster.`);
}

function writeRoster(state, value, { author, reason, title, body, surfaced = false, meta = null }) {
  const prev = rosterVersions(state);
  const last = prev[prev.length - 1];
  const next = { version: (last ? last.version : 0) + 1, date: state.today, author, reason, afterEvidence: false, before: last ? clone(last.value) : null, value: clone(value), ...(meta ? clone(meta) : {}) };
  const s = { ...state, roster: { ...state.roster, versions: [...prev, next] } };
  return logEvent(s, { kind: 'roster', surfaced, title, body, capabilityId: null, link: '#/people' });
}

const personKey = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function addPerson(state, { name, title, team, by, reason } = {}) {
  requireAdmin(state, by);
  const n = (name || '').trim(); const t = (title || '').trim(); const tm = (team || '').trim();
  if (!n || !t || !tm) throw new Error('A person needs a name, a title and a team.');
  const why = (reason || '').trim();
  if (why.length < 5) throw new Error('A roster change needs a reason.');
  let key = personKey(n) || 'person';
  const roster = people(state);
  if (roster[key]) { let i = 2; while (roster[`${key}-${i}`]) i += 1; key = `${key}-${i}`; }
  const value = { ...roster, [key]: { name: n, role: t, team: tm, active: true, rights: { riskApprover: false, workspaceAdmin: false } } };
  return writeRoster(state, value, { author: by, reason: why, title: `Person added: ${n}`, body: `${roster[by].name} added ${n} (${t}, ${tm}). ${why}`, meta: { change: { kind: 'add', key } } });
}

export function editPerson(state, key, { name, title, team, by, reason } = {}) {
  requireAdmin(state, by);
  const roster = people(state);
  const p = roster[key];
  if (!p) throw new Error(`Unknown person: ${key}`);
  const next = { ...p, name: (name || p.name).trim(), role: (title || p.role).trim(), team: (team || p.team).trim() };
  if (!next.name || !next.role || !next.team) throw new Error('A person needs a name, a title and a team.');
  if (next.name === p.name && next.role === p.role && next.team === p.team) throw new Error('Nothing changed.');
  const why = (reason || '').trim();
  if (why.length < 5) throw new Error('A roster change needs a reason.');
  return writeRoster(state, { ...roster, [key]: next }, { author: by, reason: why, title: `Person updated: ${next.name}`, body: `${roster[by].name} updated ${p.name}${next.name !== p.name ? ` (now ${next.name})` : ''}: ${[next.role !== p.role ? `title ${p.role} → ${next.role}` : null, next.team !== p.team ? `team ${p.team} → ${next.team}` : null].filter(Boolean).join(', ') || 'name'}. ${why}`, meta: { change: { kind: 'edit', key } } });
}

// People are never deleted: records reference them. Deactivation keeps the
// record and removes the person from everything that needs a live person.
export function deactivatePerson(state, key, { by, reason } = {}) {
  requireAdmin(state, by);
  const roster = people(state);
  const p = roster[key];
  if (!p) throw new Error(`Unknown person: ${key}`);
  if (p.active === false) throw new Error(`${p.name} is already deactivated.`);
  const why = (reason || '').trim();
  if (why.length < 5) throw new Error('A roster change needs a reason.');
  // Anyone holding a right is deactivated through a proposal with a different
  // admin's sign-off (#23).
  if (p.rights && (p.rights.workspaceAdmin || p.rights.riskApprover)) {
    return proposeRosterChange(state, { kind: 'deactivate', person: key, by, reason: why });
  }
  return applyDeactivation(state, key, { by, reason: why });
}

function applyDeactivation(state, key, { by, reason, meta = null } = {}) {
  const roster = people(state);
  const p = roster[key];
  if (!p || p.active === false) throw new Error(`${p ? p.name : key} is not an active person.`);
  const adminsLeft = Object.entries(roster).filter(([k, x]) => k !== key && x.active !== false && x.rights && x.rights.workspaceAdmin).length;
  if (p.rights && p.rights.workspaceAdmin && adminsLeft === 0) throw new Error('This would leave no workspace admin. Grant the right to someone else first.');
  const why = reason;
  const value = { ...roster, [key]: { ...p, active: false } };
  let s = writeRoster(state, value, { author: by, reason: why, title: `Person deactivated: ${p.name}`, body: `${roster[by].name} deactivated ${p.name}. ${why}`, surfaced: true, meta: { change: { kind: 'deactivate', key }, ...(meta || {}) } });
  if (s.actingAs === key) s = { ...s, actingAs: null };
  return s;
}

// ---------------------------------------------------------------------------
// Governed roster changes (#23)
// ---------------------------------------------------------------------------

export const RIGHTS = [['riskApprover', 'Risk approver'], ['workspaceAdmin', 'Workspace admin']];
export const RIGHT_LABELS = Object.fromEntries(RIGHTS);

export function activeAdmins(state) {
  return Object.keys(activePeople(state)).filter((k) => isWorkspaceAdmin(state, k));
}

export function openRosterProposal(state, personKey = null) {
  return state.rosterProposals.find((p) => p.status === 'open' && (!personKey || p.person === personKey)) || null;
}

export function getRosterProposal(state, id) {
  return state.rosterProposals.find((p) => p.id === id) || null;
}

function describeRosterChange(state, pr) {
  const name = people(state)[pr.person] ? people(state)[pr.person].name : pr.person;
  if (pr.kind === 'deactivate') return `Deactivate ${name}`;
  return `${pr.grant ? 'Grant' : 'Remove'} ${RIGHT_LABELS[pr.right]}: ${name}`;
}

// A rights grant or removal, or the deactivation of a rights holder: proposed
// by an active workspace admin, approved by a different one. Nobody grants a
// right to themselves. The last workspace admin cannot be removed or deactivated.
export function proposeRosterChange(state, { kind, person, right, grant, by, reason } = {}) {
  requireAdmin(state, by);
  const roster = people(state);
  const target = roster[person];
  if (!target) throw new Error(`Unknown person: ${person}`);
  if (target.active === false) throw new Error(`${target.name} is deactivated.`);
  const why = (reason || '').trim();
  if (why.length < 5) throw new Error('A roster change needs a reason.');
  if (!['rights', 'deactivate'].includes(kind)) throw new Error(`Unknown roster change: ${kind}`);
  if (kind === 'rights') {
    if (!RIGHT_LABELS[right]) throw new Error(`Unknown right: ${right}`);
    const has = Boolean(target.rights && target.rights[right]);
    if (grant && person === by) throw new Error('Nobody grants a right to themselves. Ask another workspace admin to propose it.');
    if (grant && has) throw new Error(`${target.name} already holds the ${RIGHT_LABELS[right]} right.`);
    if (!grant && !has) throw new Error(`${target.name} does not hold the ${RIGHT_LABELS[right]} right.`);
    if (!grant && right === 'workspaceAdmin' && activeAdmins(state).filter((k) => k !== person).length === 0) throw new Error('This would leave no workspace admin. Grant the right to someone else first.');
  }
  if (kind === 'deactivate' && target.rights && target.rights.workspaceAdmin && activeAdmins(state).filter((k) => k !== person).length === 0) {
    throw new Error('This would leave no workspace admin. Grant the right to someone else first.');
  }
  if (openRosterProposal(state, person)) throw new Error(`A change for ${target.name} is already awaiting sign-off.`);
  const eligible = activeAdmins(state).filter((k) => k !== by);
  if (!eligible.length) throw new Error(`No other workspace admin can sign this off. Grant the Workspace admin right to someone else first.`);
  const pr = {
    id: `RP-${state.rosterProposals.length + 1}`,
    kind,
    person,
    right: kind === 'rights' ? right : null,
    grant: kind === 'rights' ? Boolean(grant) : null,
    proposedBy: by,
    date: state.today,
    reason: why,
    eligible,
    approvals: [],
    status: 'open',
    rejection: null,
    withdrawal: null,
    appliedVersion: null,
  };
  const s = { ...state, rosterProposals: [...state.rosterProposals, pr] };
  return logEvent(s, {
    kind: 'roster',
    surfaced: true,
    title: `Roster change proposed: ${describeRosterChange(s, pr)}`,
    body: `${roster[by].name} proposed ${describeRosterChange(s, pr).toLowerCase()}. Needs a different workspace admin to approve. ${why}`,
    capabilityId: null,
    link: `#/people?proposal=${pr.id}`,
  });
}

export function rosterApprovalEligibility(state, pr, personKey) {
  if (!pr || pr.status !== 'open') return { ok: false, reason: 'This change is closed.' };
  const p = people(state)[personKey];
  if (!p) return { ok: false, reason: 'Choose who is acting.' };
  if (personKey === pr.proposedBy) return { ok: false, reason: `${p.name} proposed this; a different workspace admin must approve it.` };
  if (!isWorkspaceAdmin(state, personKey)) return { ok: false, reason: `${p.name} is not an active workspace admin.` };
  if (!pr.eligible.includes(personKey)) return { ok: false, reason: `${p.name} was not an eligible approver when this change was proposed.` };
  return { ok: true, reason: null };
}

export function approveRosterChange(state, proposalId, { by } = {}) {
  const pr = getRosterProposal(state, proposalId);
  if (!pr) throw new Error(`Unknown roster change: ${proposalId}`);
  const e = rosterApprovalEligibility(state, pr, by);
  if (!e.ok) throw new Error(e.reason);
  const roster = people(state);
  const target = roster[pr.person];
  const approvals = [{ by, date: state.today }];
  let s = state;
  const meta = { proposalId, proposedBy: pr.proposedBy, approvals };
  if (pr.kind === 'deactivate') {
    s = applyDeactivation(s, pr.person, { by: pr.proposedBy, reason: pr.reason, meta });
  } else {
    if (!pr.grant && pr.right === 'workspaceAdmin' && activeAdmins(s).filter((k) => k !== pr.person).length === 0) throw new Error('This would leave no workspace admin.');
    const value = { ...roster, [pr.person]: { ...target, rights: { ...target.rights, [pr.right]: pr.grant } } };
    s = writeRoster(s, value, { author: pr.proposedBy, reason: pr.reason, surfaced: true, title: `${pr.grant ? 'Right granted' : 'Right removed'}: ${RIGHT_LABELS[pr.right]}, ${target.name}`, body: `Proposed by ${roster[pr.proposedBy].name}, approved by ${roster[by].name}. ${pr.reason}`, meta: { change: { kind: pr.grant ? 'grant' : 'remove', key: pr.person, right: pr.right }, ...meta } });
    if (!pr.grant && pr.right === 'workspaceAdmin' && s.actingAs === pr.person) s = s; // acting stays; they just lost the admin controls
  }
  const applied = rosterVersions(s).length;
  s = { ...s, rosterProposals: s.rosterProposals.map((x) => (x.id === proposalId ? { ...x, approvals, status: 'approved', appliedVersion: applied, closedAt: state.today } : x)) };
  return s;
}

export function rejectRosterChange(state, proposalId, { by, reason } = {}) {
  const pr = getRosterProposal(state, proposalId);
  if (!pr) throw new Error(`Unknown roster change: ${proposalId}`);
  const e = rosterApprovalEligibility(state, pr, by);
  if (!e.ok) throw new Error(e.reason);
  const why = (reason || '').trim();
  if (why.length < 5) throw new Error('A rejection needs a reason.');
  const s = { ...state, rosterProposals: state.rosterProposals.map((x) => (x.id === proposalId ? { ...x, status: 'rejected', rejection: { by, date: state.today, reason: why }, closedAt: state.today } : x)) };
  return logEvent(s, { kind: 'roster', surfaced: true, title: `Roster change rejected: ${describeRosterChange(s, pr)}`, body: `${people(s)[by].name} rejected the change proposed by ${people(s)[pr.proposedBy].name}. ${why}`, capabilityId: null, link: `#/people?proposal=${proposalId}` });
}

export function withdrawRosterChange(state, proposalId, { by, reason } = {}) {
  const pr = getRosterProposal(state, proposalId);
  if (!pr) throw new Error(`Unknown roster change: ${proposalId}`);
  if (pr.status !== 'open') throw new Error('This change is closed.');
  if (by !== pr.proposedBy) throw new Error('Only the proposer withdraws; others reject.');
  requireActive(state, by, 'withdraw a roster change');
  const why = (reason || '').trim();
  if (why.length < 5) throw new Error('A withdrawal needs a reason.');
  const s = { ...state, rosterProposals: state.rosterProposals.map((x) => (x.id === proposalId ? { ...x, status: 'withdrawn', withdrawal: { by, date: state.today, reason: why }, closedAt: state.today } : x)) };
  return logEvent(s, { kind: 'roster', surfaced: true, title: `Roster change withdrawn: ${describeRosterChange(s, pr)}`, body: `${people(s)[by].name} withdrew their proposal. ${why}`, capabilityId: null, link: `#/people?proposal=${proposalId}` });
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

// The person acting right now: the picked person, else the capability's owner,
// else the focus capability's owner. Used as the author of records and
// amendments.
export function actor(state, capabilityId) {
  if (state.actingAs && isActivePerson(state, state.actingAs)) return state.actingAs;
  const cap = capabilityId ? getCapability(state, capabilityId) : null;
  if (cap && isActivePerson(state, cap.owner)) return cap.owner;
  const focus = focusCapability(state);
  if (focus && isActivePerson(state, focus.owner)) return focus.owner;
  return Object.keys(activePeople(state))[0];
}

export function setActingAs(state, personKey) {
  if (personKey && !people(state)[personKey]) throw new Error(`Unknown person: ${personKey}`);
  if (personKey && !isActivePerson(state, personKey)) throw new Error(`${people(state)[personKey].name} is deactivated and cannot act.`);
  return { ...state, actingAs: personKey || null };
}

// A non-blocking warning when a capability name reads like more than one
// action or like a whole process.
export function vagueNameWarning(name) {
  const n = (name || '').trim();
  if (!n) return null;
  if (/\b(handle|handles|handling|manage|manages|managing)\b/i.test(n)) {
    return 'This name sounds like a whole process. A capability is one discrete thing the AI might do, small enough to hold one authority level.';
  }
  if (/\b\S+\s+and\s+\S+/i.test(n)) {
    return 'This name may describe two actions. Each action should be its own capability so it can hold its own authority.';
  }
  return null;
}

export function slugify(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'capability';
}

export const RISK_OPTIONS = {
  impact: ['Low', 'Medium', 'High'],
  reversibility: ['Easy to reverse', 'Recoverable with effort', 'Difficult to reverse'],
  exposure: ['Internal only', 'Customer-facing', 'Financial / consequential'],
  failureTypes: ['Wrong answer', 'Wrong action', 'Policy violation', 'Hallucination', 'Missing escalation', 'Excessive cost', 'User over-reliance', 'User rejection', 'Silent failure'],
};

// Add a capability (#4). Writes its first decision record (its starting
// authority, or "not delegated, by design") and version 1 of its risk profile.
// The contract, criteria, requirements and stakeholders get their first
// versions when they are authored.
export function addCapability(state, { name, summary, owner, risk, startingLevel, notDelegated = false, rationale = '', by } = {}) {
  const cleanName = (name || '').trim();
  if (!cleanName) throw new Error('A capability needs a name.');
  if (!owner || !people(state)[owner]) throw new Error('Choose an owner.');
  if (!isActivePerson(state, owner)) throw new Error(`${people(state)[owner].name} is deactivated and cannot own a capability.`);
  const r = risk || {};
  for (const k of ['impact', 'reversibility', 'exposure']) {
    if (!RISK_OPTIONS[k].includes(r[k])) throw new Error(`Choose a risk ${k}.`);
  }
  const level = notDelegated ? 0 : Number(startingLevel);
  if (!notDelegated && ![0, 1].includes(level)) throw new Error('Starting authority must be Level 0 or Level 1.');
  const reason = (rationale || '').trim();
  if (notDelegated && reason.length < 20) throw new Error('"Not delegated, by design" needs a written rationale.');
  const author = by && people(state)[by] ? by : owner;

  let id = slugify(cleanName);
  if (getCapability(state, id)) {
    let n = 2;
    while (getCapability(state, `${id}-${n}`)) n += 1;
    id = `${id}-${n}`;
  }

  const cap = {
    id,
    name: cleanName,
    summary: (summary || '').trim(),
    owner,
    authority: { level, limited: false },
    status: notDelegated ? 'not-delegated' : 'setup',
    definedOn: state.today,
    added: true,
  };
  const data = emptyCapabilityData();
  data.versions.risk = [firstVersion({ impact: r.impact, reversibility: r.reversibility, exposure: r.exposure, failureTypes: (r.failureTypes || []).filter((f) => RISK_OPTIONS.failureTypes.includes(f)), note: (r.note || '').trim() || undefined }, { date: state.today, author })];

  const number = state.decisionRecords.length + 1;
  const recordId = `AC-${String(number).padStart(2, '0')}`;
  const who = people(state)[author];
  const record = {
    id: recordId,
    number,
    sequence: 1,
    capabilityId: id,
    date: state.today,
    previous: null,
    next: { level, limited: false },
    option: notDelegated ? 'not-delegated' : 'define',
    owner,
    authorizedBy: author,
    versions: { contract: 0, criteria: 0, requirements: 0, risk: 1, stakeholders: 0 },
    scope: notDelegated
      ? 'Not delegated, by design. The AI produces no operational output for this capability. Any later delegation needs a new decision.'
      : level === 1
        ? 'Recommend. The AI may produce a recommendation for a person; it takes no action.'
        : 'Observe. The AI sees the input and produces no operational output.',
    rationale: reason || (level === 1
      ? 'Starting at Recommend so recommendations can be compared with what people decide before any authority is granted.'
      : 'Starting at Observe. Authority is earned through evidence from this point.'),
    evidenceSnapshot: ['No evidence yet. This is the starting point.'],
    openCondition: notDelegated
      ? 'Deliberately not delegated. Revisit only with a new decision.'
      : 'Finalize the delegation contract and save success criteria and evidence requirements before the first test run.',
    conditions: null,
  };

  let s = {
    ...state,
    capabilities: [...state.capabilities, cap],
    capabilityData: { ...state.capabilityData, [id]: data },
    decisionRecords: [...state.decisionRecords, record],
  };
  s = logEvent(s, {
    kind: 'authority',
    title: notDelegated ? 'Capability added, not delegated by design' : `Capability added at ${authorityLabel(cap.authority)}`,
    body: `${cap.name} was added by ${who.name}${author !== owner ? ` (owner: ${people(state)[owner].name})` : ''}. ${notDelegated ? 'It stays at Level 0 by design.' : `Starting authority is ${authorityLabel(cap.authority)}.`} Risk: ${r.impact} impact, ${r.exposure.toLowerCase()}, ${r.reversibility.toLowerCase()}.`,
    capabilityId: id,
    link: `#/decisions/${recordId}`,
  });
  return s;
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
  return caps.slice().sort((a, b) => ((lastEvaluated(state, a.id) || '') < (lastEvaluated(state, b.id) || '') ? 1 : -1))[0];
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

function actionNoun(cap) {
  return (cap && cap.actionNoun) || 'actions';
}

export function conditionsPreview(conditions, cap) {
  const noun = actionNoun(cap);
  const gated = [];
  if (conditions.noFraudFlag) gated.push('fraud-signaled');
  if (conditions.policyClear) gated.push('ambiguous');
  gated.push('high-value');
  if (conditions.policyClear) gated.push('policy-exception');
  if (conditions.noChargeback) gated.push('chargeback');
  return (
    `The AI can now automatically approve standard ${noun} of $${conditions.maxValue} or less when confidence is at least ${conditions.minConfidence}%. ` +
    `${capitalize(joinList(gated))} cases continue to require human review.`
  );
}

function joinList(items) {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function scopeText(option, conditions, cap, next = null) {
  const noun = actionNoun(cap);
  if (next && next.level === 2 && (option === 'expand' || option === 'expand-limits')) {
    return `Draft. The AI prepares ${noun} for a person to approve on every case; nothing happens without that approval. Limited pilot.`;
  }
  switch (option) {
    case 'expand':
      return `Automatic ${noun} on all eligible cases under approved policy conditions.`;
    case 'expand-limits':
      return `Automatic ${noun} ≤ $${conditions.maxValue} under approved policy conditions` +
        `${conditions.noFraudFlag ? ', no fraud flag' : ''}` +
        `${conditions.noChargeback ? ', no active chargeback' : ''}` +
        `, confidence ≥ ${conditions.minConfidence}%. Everything else requires human approval.`;
    case 'hold':
      return 'Authority unchanged. Draft with human approval on every case while more evidence is gathered.';
    case 'restrict':
      return `Recommend only. A human prepares and approves every decision.`;
    case 'suspend':
      return `Capability disabled. The AI observes requests but produces no output.`;
    case 'redesign':
      return 'Capability returned to development. No operational output until a new test cycle completes.';
    default:
      return '';
  }
}

export function nextAuthority(option, current, proposed = null) {
  const target = proposed && proposed.level > current.level ? proposed.level : 3;
  switch (option) {
    case 'expand': return { level: target, limited: false };
    case 'expand-limits': return { level: target, limited: true };
    case 'hold': return { ...current };
    case 'restrict': return { level: Math.max(0, current.level - 1), limited: false };
    case 'suspend': return { level: 0, limited: false };
    case 'redesign': return { level: 0, limited: false };
    default: return { ...current };
  }
}

export function evidenceSnapshot(state, capabilityId) {
  const d = capData(state, capabilityId);
  const p = d.pilot;
  const out = [];
  if (p) {
    out.push(
      `${p.cases} pilot cases`,
      `${p.accuracy}% decision accuracy`,
      `${p.severeErrorRate}% severe error rate`,
      `${p.overrideRate}% override rate`,
      `${Math.abs(p.resolutionChange)}% faster resolution`,
      `$${p.costPerCase.toFixed(2)} AI cost/case`,
    );
  }
  const t = testSummary(state, capabilityId);
  if (t.total) {
    const r = t.status === 'complete' ? { passed: t.passed, high: t.highSeverity } : { passed: t.recorded.passed, high: t.recorded.highSeverity };
    out.push(`${r.passed} of ${t.total} scenarios passed${r.high ? ` (${r.high} high-severity failure${r.high > 1 ? 's' : ''}, mitigated)` : ''}`);
  }
  readiness(state, capabilityId).unmet.forEach((u) => {
    const n = u.text.match(/\d+/);
    out.push(n ? `${u.current} ${u.text.replace(/^Minimum \d+ /, '').toLowerCase()} (requirement: ${n[0]})` : `${u.text}: ${u.current}`);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Transitions (pure: take state, return new state)
// ---------------------------------------------------------------------------

function updateCap(state, capabilityId, patch) {
  const current = capData(state, capabilityId);
  const next = typeof patch === 'function' ? patch(current) : { ...current, ...patch };
  return { ...state, capabilityData: { ...state.capabilityData, [capabilityId]: next } };
}

function logEvent(state, event) {
  const e = { id: `ACT-${Date.now()}-${state.activity.length}`, date: state.today, ...event };
  if (e.surfaced === undefined) e.surfaced = isSurfaced(e);
  return { ...state, activity: [e, ...state.activity] };
}

// Write a new version of a versioned object. The previous versions stay as
// they were. `author` is a person key; `reason` is required.
export function amend(state, capabilityId, kind, { value, author, reason, meta = null, silent = false }) {
  if (!VERSIONED_KINDS.includes(kind)) throw new Error(`Unknown versioned object: ${kind}`);
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  if (!author || !people(state)[author]) throw new Error('An amendment needs an author.');
  if (!isActivePerson(state, author)) throw new Error(`${people(state)[author].name} is deactivated and cannot author an amendment.`);
  if (!reason || !reason.trim()) throw new Error('An amendment needs a reason.');
  const d = capData(state, capabilityId);
  const prev = currentVersion(state, capabilityId, kind);
  const afterEvidence = performanceResultsSeen(state, capabilityId);
  const next = {
    version: (prev ? prev.version : 0) + 1,
    date: state.today,
    author,
    reason: reason.trim(),
    afterEvidence,
    before: prev ? clone(prev.value) : null,
    value: clone(value),
    ...(meta ? clone(meta) : {}),
  };
  const versions = { ...d.versions, [kind]: [...(d.versions[kind] || []), next] };
  // The version list is the only copy; the latest version is the current value.
  const s = updateCap(state, capabilityId, { versions });
  if (silent) return s;
  const who = people(state)[author];
  return logEvent(s, {
    kind: 'amendment',
    afterEvidence,
    objectKind: kind,
    version: next.version,
    title: next.version === 1 ? `${KIND_LABELS[kind]} v1 written` : `${KIND_LABELS[kind]} amended to v${next.version}`,
    body: `${who.name}: ${next.reason}${afterEvidence ? ' Made after evidence existed for this capability.' : ''}`,
    capabilityId,
    link: `#/capabilities/${capabilityId}?tab=${kind === 'risk' ? 'contract' : kind === 'requirements' ? 'criteria' : kind}`,
  });
}

export const KIND_LABELS = { contract: 'Contract', criteria: 'Success criteria', requirements: 'Evidence requirements', risk: 'Risk profile', stakeholders: 'Stakeholders' };

export function startTestRun(state, capabilityId) {
  const d = capData(state, capabilityId);
  if (d.testRun.status === 'running' || !d.scenarios.length) return state;
  if (!criteriaSaved(state, capabilityId)) throw new Error('Save success criteria and evidence requirements before the first test run. The first run locks them.');
  return updateCap(state, capabilityId, { testRun: { ...d.testRun, status: 'running', completed: [] } });
}

export function advanceTestRun(state, capabilityId) {
  const d = capData(state, capabilityId);
  if (d.testRun.status !== 'running') return state;
  const next = d.scenarios.find((s) => !d.testRun.completed.includes(s.id));
  if (!next) return state;
  const completed = [...d.testRun.completed, next.id];
  const done = completed.length === d.scenarios.length;
  let s = updateCap(state, capabilityId, { testRun: { ...d.testRun, completed, status: done ? 'complete' : 'running' } });
  if (done) s = finishTestRun(s, capabilityId);
  return s;
}

function finishTestRun(state, capabilityId) {
  const d = capData(state, capabilityId);
  const lockedBefore = criteriaLocked(state, capabilityId);
  const summary = testSummary(state, capabilityId);
  const failed = d.scenarios.filter((s) => !s.pass);
  const detail =
    `Run on ${fmtLong(state.today)} in this session. ${summary.failed} failure${summary.failed === 1 ? '' : 's'} (${summary.highSeverity} high severity)` +
    (failed.length ? `: ${failed.map((s) => `${s.id} ${s.name} (${s.severity})`).join(', ')}. ` : '. ') +
    'The suite replays recorded decisions, so results match the last recorded run until a scenario is re-recorded.';
  const existing = d.evidence.find((e) => e.source === 'Automated tests' && e.metric === 'Scenario pass rate');
  const item = {
    ...(existing || { id: `EV-T${Date.now()}`, source: 'Automated tests', metric: 'Scenario pass rate', risk: 'High', segment: 'All', link: `#/tests?capability=${capabilityId}` }),
    value: `${summary.passed} of ${summary.total} passed`,
    status: summary.highSeverity ? 'watch' : summary.failed ? 'watch' : 'pass',
    date: state.today,
    detail,
  };
  const evidence = existing ? d.evidence.map((e) => (e === existing ? item : e)) : [item, ...d.evidence];
  const activity = [
    {
      id: `ACT-${Date.now()}`,
      date: state.today,
      kind: 'test',
      surfaced: true,
      title: 'Test suite run',
      body: `${summary.passed} of ${summary.total} scenarios passed. ${summary.highSeverity} high-severity failure${summary.highSeverity === 1 ? '' : 's'}. Results recorded as evidence ${item.id}.`,
      capabilityId,
      link: `#/tests?capability=${capabilityId}`,
    },
    ...state.activity,
  ];
  let s = updateCap(state, capabilityId, { testRun: { ...d.testRun, status: 'complete', lastRun: state.today }, evidence });
  s = { ...s, activity };
  if (!lockedBefore && criteriaLocked(s, capabilityId)) {
    const cap = getCapability(s, capabilityId);
    s = logEvent(s, {
      kind: 'criteria-locked',
      title: 'Success criteria locked',
      body: `${cap.name}: the first test run produced performance results, so success criteria v${versionsInForce(s, capabilityId).criteria} and evidence requirements v${versionsInForce(s, capabilityId).requirements} are now locked. Changes need a proposed amendment with sign-off.`,
      capabilityId,
      link: `#/capabilities/${capabilityId}?tab=criteria`,
    });
  }
  return s;
}

export function selectDecision(state, capabilityId, option) {
  return updateCap(state, capabilityId, (d) => ({ ...d, decision: { ...d.decision, option } }));
}

export function setCondition(state, capabilityId, key, value) {
  return updateCap(state, capabilityId, (d) => ({ ...d, decision: { ...d.decision, conditions: { ...d.decision.conditions, [key]: value } } }));
}

export function setRationale(state, capabilityId, rationale) {
  return updateCap(state, capabilityId, (d) => ({ ...d, decision: { ...d.decision, rationale } }));
}

export function canAuthorize(state, capabilityId) {
  const d = capData(state, capabilityId).decision;
  if (!d.option) return { ok: false, reason: 'Choose a decision option first.' };
  if ((d.option === 'expand' || d.option === 'expand-limits') && !d.proposed) return { ok: false, reason: 'No authority change is proposed for this capability. Propose the next level first.' };
  if (!d.rationale || d.rationale.trim().length < 20) return { ok: false, reason: 'Write a decision rationale (at least a sentence).' };
  const expanding = d.option === 'expand' || d.option === 'expand-limits';
  if (expanding && capData(state, capabilityId).reviewRequired) {
    return { ok: false, reason: 'A post-incident review must be recorded before authority can expand again.' };
  }
  return { ok: true };
}

const STATUS_BY_OPTION = {
  'expand': 'monitoring',
  'expand-limits': 'monitoring',
  'hold': 'pilot',
  'restrict': 'restricted',
  'suspend': 'suspended',
  'redesign': 'redesign',
};

function openConditionText(option, state, capabilityId) {
  const unmet = readiness(state, capabilityId).unmet;
  switch (option) {
    case 'expand':
    case 'expand-limits':
      return unmet.length
        ? `${unmet.map((u) => `${u.text} not met (currently ${u.current})`).join('; ')}. Affected cases remain approval-required pending additional evidence.`
        : 'All evidence requirements were met at the time of the decision.';
    case 'hold':
      return unmet.length ? `Re-evaluate when: ${unmet.map((u) => u.text.toLowerCase()).join('; ')}.` : 'Re-evaluate on new evidence.';
    case 'restrict': return 'Return to the previous level requires a new decision with fresh evidence.';
    case 'suspend': return 'Re-enabling requires a new decision.';
    case 'redesign': return 'A new test cycle must complete before any authority is restored.';
    default: return '';
  }
}

export function authorize(state, capabilityId, { by = 'maya' } = {}) {
  const check = canAuthorize(state, capabilityId);
  if (!check.ok) throw new Error(check.reason);
  requireActive(state, by, 'authorize an authority change');
  const cap = getCapability(state, capabilityId);
  const d = capData(state, capabilityId);
  const option = d.decision.option;
  const previous = { ...cap.authority };
  const next = nextAuthority(option, previous, proposedAuthority(state, capabilityId));
  const number = state.decisionRecords.length + 1;
  const id = `AC-${String(number).padStart(2, '0')}`;

  const record = {
    id,
    number,
    sequence: state.decisionRecords.filter((r) => r.capabilityId === cap.id).length + 1,
    capabilityId: cap.id,
    date: state.today,
    previous,
    next,
    option,
    owner: cap.owner,
    authorizedBy: by,
    versions: versionsInForce(state, capabilityId),
    scope: scopeText(option, d.decision.conditions, cap, next),
    rationale: d.decision.rationale.trim(),
    evidenceSnapshot: evidenceSnapshot(state, capabilityId),
    openCondition: openConditionText(option, state, capabilityId),
    conditions: option === 'expand-limits' && next.level >= 3 ? { ...d.decision.conditions } : null,
  };

  const expandingTo = option === 'expand' || option === 'expand-limits' ? next.level : null;
  const statusAfter = expandingTo === 2 ? 'pilot' : expandingTo && expandingTo >= 3 ? 'monitoring' : STATUS_BY_OPTION[option];
  const capabilities = state.capabilities.map((c) =>
    c.id === cap.id
      ? {
          ...c,
          authority: next,
          status: statusAfter,
          pilotLabel: expandingTo === 2 ? 'Limited pilot' : undefined,
        }
      : c
  );

  const who = people(state)[by];
  const verb = {
    'expand': 'expanded', 'expand-limits': 'expanded', 'hold': 'held', 'restrict': 'restricted', 'suspend': 'suspended', 'redesign': 'returned to redesign',
  }[option];
  const activity = [
    {
      id: `ACT-${Date.now()}`,
      date: state.today,
      kind: 'authority',
      surfaced: true,
      title: `Authority ${verb}`,
      body: option === 'hold'
        ? `${cap.name} stays at ${authorityLabel(previous)}. Authorized by ${who.name}.`
        : `${cap.name} moved from ${authorityLabel(previous)} to ${authorityLabel(next)}. Authorized by ${who.name}.`,
      capabilityId: cap.id,
      link: `#/decisions/${id}`,
    },
    ...state.activity,
  ];

  // Monitoring applies to autonomous authority (Level 3 and above). A move to
  // Draft starts a pilot, which is human-approved on every case.
  const expanding = (option === 'expand' || option === 'expand-limits') && next.level >= 3;
  const rule = d.monitoringRule || { windowDays: 0, autonomousActions: 0, escalated: 0, reversals: 0, incidents: 0, rollingWindow: 50, severeErrorsInWindow: 0, thresholdPct: 5, rule: 'Authority automatically returns to Draft if the severe error rate exceeds 5% across the rolling 50-case window.' };
  const monitoring = expanding ? { ...rule, startedAt: state.today, breached: false, recordId: id, errors: [] } : null;

  const s = updateCap(state, capabilityId, { decision: { ...d.decision, recordId: id, proposed: null }, monitoring });
  return { ...s, capabilities, decisionRecords: [...state.decisionRecords, record], activity };
}

export function simulateBreach(state, capabilityId) {
  const d = capData(state, capabilityId);
  if (!d.monitoring || d.monitoring.breached) return state;
  const cap = getCapability(state, capabilityId);
  const previous = { ...cap.authority };
  const next = { level: 2, limited: false };
  const m = d.monitoring;
  const breach = d.breach || {
    severeErrorsInWindow: Math.floor((m.thresholdPct / 100) * m.rollingWindow) + 1,
    errors: ['Severe errors injected by the demo control.'],
  };
  const errors = breach.severeErrorsInWindow;
  const pct = Math.round((errors / m.rollingWindow) * 1000) / 10;
  const number = state.decisionRecords.length + 1;
  const id = `AC-${String(number).padStart(2, '0')}`;

  const record = {
    id,
    number,
    sequence: state.decisionRecords.filter((r) => r.capabilityId === cap.id).length + 1,
    capabilityId: cap.id,
    date: state.today,
    previous,
    next,
    option: 'auto-restrict',
    owner: cap.owner,
    authorizedBy: 'system',
    versions: versionsInForce(state, capabilityId),
    scope: 'Draft. Every decision requires human approval until a review is recorded.',
    rationale: `Automatic restriction. Severe error rate reached ${pct}% across the rolling ${m.rollingWindow}-case window, above the ${m.thresholdPct}% limit set in authority change ${m.recordId}. No human authorized this change; the rule was authorized in advance.`,
    evidenceSnapshot: [
      `${errors} severe errors in the last ${m.rollingWindow} autonomous cases (${pct}%)`,
      `${m.autonomousActions + 7} autonomous actions since expansion`,
      `Threshold: ${m.thresholdPct}%`,
    ],
    openCondition: 'Human review required before authority can expand again.',
    conditions: null,
  };

  const alert = {
    id: `ALERT-${Date.now()}`,
    date: state.today,
    severity: 'high',
    capabilityId: cap.id,
    title: 'Authority automatically restricted',
    body: `${cap.name} returned to Draft. Severe error rate reached ${pct}% in the rolling ${m.rollingWindow}-case window (limit ${m.thresholdPct}%). A human review is required before authority can expand again.`,
    link: `#/capabilities/${cap.id}?tab=monitoring`,
  };

  const activity = [
    {
      id: `ACT-${Date.now()}-b`,
      date: state.today,
      kind: 'restriction',
      surfaced: true,
      title: 'Authority automatically restricted',
      body: `Severe error rate exceeded the allowed threshold (${pct}% against ${m.thresholdPct}% across ${m.rollingWindow} cases). ${cap.name} moved from ${authorityLabel(previous)} to ${authorityLabel(next)} by rule. Review item opened.`,
      capabilityId: cap.id,
      link: `#/decisions/${id}`,
    },
    {
      id: `ACT-${Date.now()}-a`,
      date: state.today,
      kind: 'failure',
      surfaced: true,
      title: 'Monitoring threshold breached',
      body: `${errors} severe errors recorded in the rolling ${m.rollingWindow}-case window after expansion.`,
      capabilityId: cap.id,
      link: `#/capabilities/${cap.id}?tab=monitoring`,
    },
    ...state.activity,
  ];

  const incidentNumber = d.evidence.filter((e) => e.source === 'Incident').length + 1;
  const evidence = [
    {
      id: `EV-${String(d.evidence.length + 1).padStart(2, '0')}`,
      source: 'Incident',
      metric: `INC-${String(incidentNumber).padStart(2, '0')}: monitoring threshold breached`,
      value: `${pct}% severe errors in rolling ${m.rollingWindow}`,
      status: 'fail',
      risk: 'High',
      segment: 'Standard',
      date: state.today,
      detail: `${errors} severe errors in the rolling ${m.rollingWindow}-case window after expansion. ${breach.errors.join(' ')} Authority was returned to Draft automatically.`,
      link: `#/decisions/${id}`,
    },
    ...d.evidence,
  ];

  const capabilities = state.capabilities.map((c) =>
    c.id === cap.id ? { ...c, authority: next, status: 'review-required' } : c
  );

  const s = updateCap(state, capabilityId, {
    evidence,
    reviewRequired: true,
    monitoring: {
      ...m,
      breached: true,
      severeErrorsInWindow: errors,
      autonomousActions: m.autonomousActions + 7,
      incidents: (m.incidents || 0) + 1,
      errors: breach.errors,
      breachedAt: state.today,
      breachRecordId: id,
    },
  });
  return { ...s, capabilities, decisionRecords: [...state.decisionRecords, record], activity, alerts: [alert, ...state.alerts] };
}

export function reset() {
  return initialState();
}

// ---------------------------------------------------------------------------
// Store wrapper with persistence and subscriptions
// ---------------------------------------------------------------------------

export function createStore({ storage = null } = {}) {
  let state = load(storage) || initialState();
  const listeners = new Set();

  function set(next) {
    if (next === state) return;
    state = next;
    save(storage, state);
    listeners.forEach((fn) => fn(state));
  }

  return {
    get: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    dispatch(action, ...args) {
      const fn = ACTIONS[action];
      if (!fn) throw new Error(`Unknown action: ${action}`);
      set(fn(state, ...args));
    },
  };
}

const ACTIONS = {
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
  authorize,
  simulateBreach,
  reset,
};

function load(storage) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 12) return null;
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

function save(storage, state) {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be unavailable (private window, blocked). The app still works.
  }
}

export function fmtLong(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[m - 1]} ${d}, ${y}`;
}

// ---------------------------------------------------------------------------
// Contract builder (#5)
// ---------------------------------------------------------------------------

export const SECTION_KEYS = CONTRACT_SECTIONS.map(([k]) => k);
export const SECTION_LABELS = Object.fromEntries(CONTRACT_SECTIONS);

const norm = (t) => t.toLowerCase().replace(/[^a-z0-9$% ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function startContractDraft(state, capabilityId, { by } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  if (versionList(state, capabilityId, 'contract').length) throw new Error('This capability already has a finalized contract. Changes to it are amendments.');
  const d = capData(state, capabilityId);
  if (d.contractDraft && !d.contractDraft.finalizedAt) return state;
  const risk = current(state, capabilityId, 'risk');
  const template = pickTemplate(risk);
  let n = 0;
  const lines = [];
  for (const section of SECTION_KEYS) {
    for (const text of template.sections[section]) lines.push({ id: `L${++n}`, section, text, source: 'template', status: 'accepted', original: text });
  }
  for (const sug of suggestLines(cap.name, cap.summary)) {
    lines.push({ id: `L${++n}`, section: sug.section, text: sug.text, source: 'ai', status: 'pending', original: sug.text, because: sug.because });
  }
  const draft = {
    templateId: template.id,
    templateName: template.name,
    template: template.sections,
    startedAt: state.today,
    startedBy: by && people(state)[by] ? by : cap.owner,
    lines,
    nextId: n + 1,
    confirmed: Object.fromEntries(SECTION_KEYS.map((k) => [k, false])),
    finalizedAt: null,
  };
  const s = updateCap(state, capabilityId, { contractDraft: draft });
  return logEvent(s, {
    kind: 'contract-draft',
    title: 'Contract draft started',
    body: `${cap.name}: template "${template.name}" picked from the risk profile, with ${lines.filter((l) => l.source === 'ai').length} suggestions to review.`,
    capabilityId,
    link: `#/capabilities/${capabilityId}/contract/build`,
  });
}

function withDraft(state, capabilityId, fn) {
  const d = capData(state, capabilityId);
  if (!d.contractDraft) throw new Error('No contract draft. Start one first.');
  if (d.contractDraft.finalizedAt) throw new Error('This contract is finalized. Changes to it are amendments.');
  return updateCap(state, capabilityId, { contractDraft: fn(d.contractDraft) });
}

function unconfirm(draft, section) {
  return { ...draft, confirmed: { ...draft.confirmed, [section]: false } };
}

// Accept, edit or reject one AI suggestion. There is deliberately no
// "accept all"; each suggestion is reviewed on its own.
export function reviewSuggestion(state, capabilityId, lineId, { decision, text } = {}) {
  return withDraft(state, capabilityId, (draft) => {
    const line = draft.lines.find((l) => l.id === lineId);
    if (!line) throw new Error(`Unknown line: ${lineId}`);
    if (line.source !== 'ai') throw new Error('Only AI suggestions are reviewed this way.');
    if (!['accept', 'edit', 'reject'].includes(decision)) throw new Error(`Unknown decision: ${decision}`);
    let next;
    if (decision === 'accept') next = { ...line, status: 'accepted', text: line.original };
    if (decision === 'reject') next = { ...line, status: 'rejected' };
    if (decision === 'edit') {
      const t = (text || '').trim();
      if (!t) throw new Error('An edited suggestion needs text.');
      next = { ...line, status: t === line.original ? 'accepted' : 'edited', text: t };
    }
    return unconfirm({ ...draft, lines: draft.lines.map((l) => (l.id === lineId ? next : l)) }, line.section);
  });
}

export function addContractLine(state, capabilityId, section, text) {
  return withDraft(state, capabilityId, (draft) => {
    if (!SECTION_KEYS.includes(section)) throw new Error(`Unknown section: ${section}`);
    const t = (text || '').trim();
    if (!t) throw new Error('A line needs text.');
    const line = { id: `L${draft.nextId}`, section, text: t, source: 'person', status: 'accepted', original: t };
    return unconfirm({ ...draft, lines: [...draft.lines, line], nextId: draft.nextId + 1 }, section);
  });
}

export function editContractLine(state, capabilityId, lineId, text) {
  return withDraft(state, capabilityId, (draft) => {
    const line = draft.lines.find((l) => l.id === lineId);
    if (!line) throw new Error(`Unknown line: ${lineId}`);
    if (line.source === 'ai') return reviewSuggestionDraft(draft, line, text);
    const t = (text || '').trim();
    if (!t) throw new Error('A line needs text.');
    const next = { ...line, text: t, status: line.source === 'template' && t !== line.original ? 'edited' : line.status };
    return unconfirm({ ...draft, lines: draft.lines.map((l) => (l.id === lineId ? next : l)) }, line.section);
  });
}
function reviewSuggestionDraft(draft, line, text) {
  const t = (text || '').trim();
  if (!t) throw new Error('An edited suggestion needs text.');
  const next = { ...line, status: t === line.original ? 'accepted' : 'edited', text: t };
  return unconfirm({ ...draft, lines: draft.lines.map((l) => (l.id === line.id ? next : l)) }, line.section);
}

// Template and person lines can be removed; the removal is kept in the draft.
export function removeContractLine(state, capabilityId, lineId) {
  return withDraft(state, capabilityId, (draft) => {
    const line = draft.lines.find((l) => l.id === lineId);
    if (!line) throw new Error(`Unknown line: ${lineId}`);
    if (line.source === 'ai') throw new Error('Reject a suggestion instead of removing it.');
    return unconfirm({ ...draft, lines: draft.lines.map((l) => (l.id === lineId ? { ...l, status: 'removed' } : l)) }, line.section);
  });
}

export function confirmSection(state, capabilityId, section, confirmed = true) {
  return withDraft(state, capabilityId, (draft) => {
    if (!SECTION_KEYS.includes(section)) throw new Error(`Unknown section: ${section}`);
    if (confirmed && draft.lines.some((l) => l.section === section && l.status === 'pending')) {
      throw new Error('Review every suggestion in this section before confirming it.');
    }
    return { ...draft, confirmed: { ...draft.confirmed, [section]: Boolean(confirmed) } };
  });
}

// The contract a draft would produce: accepted, edited and person lines.
export function draftValue(draft) {
  const value = {};
  for (const k of SECTION_KEYS) value[k] = draft.lines.filter((l) => l.section === k && ['accepted', 'edited'].includes(l.status)).map((l) => l.text);
  return value;
}

const hasNumber = (t) => /\d/.test(t) || /\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(t);
const hasWindow = (t) => /\b(\d+|one|two|three|seven|fourteen|thirty)\s*(-|\s)?(day|days|hour|hours|week|weeks|case|cases|minute|minutes)\b/i.test(t) || /rolling/i.test(t);
const hasValueLimit = (t) => /\$\s?\d|\b\d+\s?(usd|eur|gbp|dollars)\b|\bvalue limit\b|\babove\s+\$?\d/i.test(t);

// Software checks on a contract value, shared by the builder and by contract
// proposals. `block` stops finalize or submission; `warn` does not.
export function contractValueChecks(state, capabilityId, value) {
  const risk = current(state, capabilityId, 'risk');
  const out = [];
  const aboveLow = risk.impact && risk.impact !== 'Low';
  if (aboveLow && !value.mustNever.length) out.push({ id: 'empty-never', level: 'block', section: 'mustNever', text: `"AI must never" cannot be empty for a ${risk.impact.toLowerCase()}-impact capability.` });
  if (aboveLow && !value.autoRestriction.length) out.push({ id: 'empty-auto', level: 'block', section: 'autoRestriction', text: `"Automatic restriction conditions" cannot be empty for a ${risk.impact.toLowerCase()}-impact capability. Software needs a rule to enforce.` });
  // Contradictions: the same line in "may" and in "must never" or "must ask".
  const may = value.may.map(norm);
  for (const t of value.mustNever) if (may.includes(norm(t))) out.push({ id: `contra-${norm(t).slice(0, 20)}`, level: 'block', section: 'mustNever', text: `"${t}" appears under both "AI may" and "AI must never".` });
  for (const t of value.mustAsk) if (may.includes(norm(t))) out.push({ id: `contra-ask-${norm(t).slice(0, 20)}`, level: 'block', section: 'mustAsk', text: `"${t}" appears under both "AI may" and "AI must ask".` });
  for (const t of value.autoRestriction) {
    if (!hasNumber(t) || !hasWindow(t)) out.push({ id: `rule-${norm(t).slice(0, 20)}`, level: 'block', section: 'autoRestriction', text: `"${t}" has no ${!hasNumber(t) ? 'number' : 'time or case window'}. A restriction rule needs a threshold and a window so software can apply it.` });
  }
  if (risk.exposure === 'Financial / consequential') {
    // A ceiling in "may" or a threshold in "must ask" counts. A limit that
    // only appears under "must never" is not an operating limit.
    const limited = [...value.may, ...value.mustAsk].some(hasValueLimit);
    if (!limited) out.push({ id: 'no-value-limit', level: 'block', section: 'mustAsk', text: 'This is a financial capability and the contract sets no value limit. Add a ceiling under "AI may" or a threshold such as "Refunds over $100" under "AI must ask". A limit that only appears under "AI must never" does not count.' });
  }
  for (const k of ['may', 'escalation']) if (!value[k].length) out.push({ id: `empty-${k}`, level: 'warn', section: k, text: `"${SECTION_LABELS[k]}" is empty.` });
  return out;
}

// Checks on the builder's draft: the value checks plus review completeness.
export function contractChecks(state, capabilityId) {
  const d = capData(state, capabilityId);
  const draft = d.contractDraft;
  if (!draft) return [];
  const out = contractValueChecks(state, capabilityId, draftValue(draft));
  const pending = draft.lines.filter((l) => l.status === 'pending').length;
  if (pending) out.push({ id: 'pending', level: 'block', section: null, text: `${pending} suggestion${pending === 1 ? '' : 's'} still to accept, edit or reject.` });
  const unconfirmed = SECTION_KEYS.filter((k) => !draft.confirmed[k]);
  if (unconfirmed.length) out.push({ id: 'unconfirmed', level: 'block', section: null, text: `${unconfirmed.length} section${unconfirmed.length === 1 ? '' : 's'} not yet confirmed: ${unconfirmed.map((k) => SECTION_LABELS[k]).join(', ')}.` });
  return out;
}

export function canFinalizeContract(state, capabilityId) {
  const blocks = contractChecks(state, capabilityId).filter((c) => c.level === 'block');
  return { ok: blocks.length === 0, blocks };
}

export function contractSummary(value, cap) {
  const name = cap ? cap.name : 'The capability';
  const list = (items) => items.map((t) => t.replace(/\.$/, '')).join('; ');
  const parts = [];
  if (value.may.length) parts.push(`${name} may: ${list(value.may)}.`);
  if (value.mustAsk.length) parts.push(`It must ask a person before: ${list(value.mustAsk)}.`);
  if (value.mustNever.length) parts.push(`It must never: ${list(value.mustNever)}.`);
  if (value.escalation.length) parts.push(`It hands the case to a person when: ${list(value.escalation)}.`);
  if (value.autoRestriction.length) parts.push(`Software pulls authority back when: ${list(value.autoRestriction)}.`);
  return parts.join(' ');
}

// A named person finalizes the draft into contract v1.
export function finalizeContract(state, capabilityId, { by } = {}) {
  const cap = getCapability(state, capabilityId);
  const d = capData(state, capabilityId);
  const draft = d.contractDraft;
  if (!draft) throw new Error('No contract draft to finalize.');
  if (draft.finalizedAt) throw new Error('This contract is already finalized.');
  requireActive(state, by, 'finalize the contract');
  const check = canFinalizeContract(state, capabilityId);
  if (!check.ok) throw new Error(`Cannot finalize: ${check.blocks.map((b) => b.text).join(' ')}`);
  const value = draftValue(draft);
  const ai = draft.lines.filter((l) => l.source === 'ai');
  const review = {
    templateId: draft.templateId,
    templateName: draft.templateName,
    suggestions: ai.length,
    accepted: ai.filter((l) => l.status === 'accepted').length,
    edited: ai.filter((l) => l.status === 'edited').length,
    rejected: ai.filter((l) => l.status === 'rejected').map((l) => ({ section: l.section, text: l.original, because: l.because })),
    added: draft.lines.filter((l) => l.source === 'person' && l.status !== 'removed').length,
    removed: draft.lines.filter((l) => l.source === 'template' && l.status === 'removed').map((l) => ({ section: l.section, text: l.original })),
    editedTemplate: draft.lines.filter((l) => l.source === 'template' && l.status === 'edited').map((l) => ({ section: l.section, before: l.original, after: l.text })),
  };
  const version = {
    version: 1,
    date: state.today,
    author: by,
    reason: `Finalized from template "${draft.templateName}". ${review.suggestions} AI suggestion${review.suggestions === 1 ? '' : 's'}: ${review.accepted} accepted, ${review.edited} edited, ${review.rejected.length} rejected. ${review.added} line${review.added === 1 ? '' : 's'} added by hand.`,
    afterEvidence: performanceResultsSeen(state, capabilityId),
    before: null,
    value,
    review,
  };
  let s = updateCap(state, capabilityId, {
    versions: { ...d.versions, contract: [version] },
    contractDraft: { ...draft, finalizedAt: state.today, finalizedBy: by },
  });
  s = logEvent(s, {
    kind: 'contract-finalized',
    title: 'Contract finalized',
    body: `${cap.name} contract v1 finalized by ${people(state)[by].name}. ${version.reason}`,
    capabilityId,
    link: `#/capabilities/${capabilityId}?tab=contract`,
  });
  return s;
}

// ---------------------------------------------------------------------------
// Success criteria and evidence requirements (#6)
// ---------------------------------------------------------------------------

// Saved means a non-empty version of both objects exists. Seeded capabilities
// without criteria carry an empty version 1, which does not count.
export function criteriaSaved(state, capabilityId) {
  return current(state, capabilityId, 'criteria').length > 0 && current(state, capabilityId, 'requirements').length > 0;
}

// Criteria lock (decision 6): saved, and performance results have been seen.
// Same definition as "after evidence" for amendments.
export function criteriaLocked(state, capabilityId) {
  return criteriaSaved(state, capabilityId) && performanceResultsSeen(state, capabilityId);
}

export function canRunSuite(state, capabilityId) {
  const d = capData(state, capabilityId);
  if (!d.scenarios.length) return { ok: false, reason: 'No scenarios yet.' };
  if (!criteriaSaved(state, capabilityId)) return { ok: false, reason: 'Save success criteria and evidence requirements first. The first run locks them.' };
  if (d.testRun.status === 'running') return { ok: false, reason: 'Already running.' };
  return { ok: true };
}

export function defaultsFor(state, capabilityId) {
  const risk = current(state, capabilityId, 'risk');
  return { criteria: defaultCriteria(risk), requirements: defaultRequirements(risk) };
}

const slugId = (text, i) => (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || `item-${i + 1}`;

function cleanCriteria(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('Add at least one success criterion.');
  const seen = new Set();
  return items.map((c, i) => {
    const name = (c.name || '').trim();
    const target = (c.target || '').trim();
    if (!name || !target) throw new Error(`Criterion ${i + 1} needs a name and a target.`);
    let id = c.id || slugId(name, i);
    while (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    return { id, name, target, current: c.current || 'Not yet measured', status: c.status || 'pending', note: (c.note || '').trim(), source: c.source || 'Written by hand' };
  });
}

function cleanRequirements(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('Add at least one evidence requirement.');
  const seen = new Set();
  return items.map((r, i) => {
    const text = (r.text || '').trim();
    if (!text) throw new Error(`Requirement ${i + 1} needs text.`);
    let id = r.id || slugId(text, i);
    while (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    return { id, text, current: r.current || 'Not yet measured', met: Boolean(r.met), gap: r.gap, source: r.source || 'Written by hand' };
  });
}

// Rows that can be adjusted but never removed.
export const CORE_CRITERIA = ['quality', 'severe-errors'];
export const CORE_REQUIREMENTS = ['min-cases'];
const CORE_LABELS = { quality: 'a quality threshold', 'severe-errors': 'a severe-error threshold', 'min-cases': 'a minimum case count' };

// A threshold's direction: "at least N" (≥, >, Minimum) is loosened by a
// lower N; "at most N" (≤, <, Maximum) is loosened by a higher N.
function threshold(text) {
  const t = text || '';
  const m = t.match(/(≥|>=|≤|<=|<|>|\bminimum\b|\bat least\b|\bmaximum\b|\bat most\b)\s*\$?\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const op = m[1].toLowerCase();
  const atLeast = ['≥', '>=', '>', 'minimum', 'at least'].includes(op);
  return { atLeast, n: Number(m[2]) };
}

// Defaults that were removed or loosened, compared with the risk-derived
// defaults for this capability.
export function defaultDeviations(defaults, submitted, textOf) {
  const out = [];
  for (const d of defaults) {
    const now = submitted.find((x) => x.id === d.id);
    if (!now) { out.push({ id: d.id, change: 'removed', from: textOf(d), to: null }); continue; }
    const a = threshold(textOf(d));
    const b = threshold(textOf(now));
    if (!a || !b) continue;
    const loosened = a.atLeast ? b.n < a.n : b.n > a.n;
    if (loosened) out.push({ id: d.id, change: 'loosened', from: textOf(d), to: textOf(now) });
  }
  return out;
}

// Save both objects before the first test run. Each save writes a new version
// (never an edit); once locked, changes go through a proposed amendment (#7).
export function saveCriteria(state, capabilityId, { criteria, requirements, by, reason } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  requireActive(state, by, 'save the criteria');
  if (criteriaLocked(state, capabilityId)) throw new Error('Criteria are locked: performance results have been seen. Propose an amendment instead.');
  const c = cleanCriteria(criteria);
  const r = cleanRequirements(requirements);
  const missingCore = [...CORE_CRITERIA.filter((id) => !c.some((x) => x.id === id)), ...CORE_REQUIREMENTS.filter((id) => !r.some((x) => x.id === id))];
  if (missingCore.length) throw new Error(`Core rows can be adjusted but not removed: ${missingCore.map((id) => CORE_LABELS[id]).join(', ')}.`);
  const defaults = defaultsFor(state, capabilityId);
  const deviations = [
    ...defaultDeviations(defaults.criteria, c, (x) => x.target).map((x) => ({ ...x, kind: 'criteria', label: (defaults.criteria.find((y) => y.id === x.id) || {}).name })),
    ...defaultDeviations(defaults.requirements, r, (x) => x.text).map((x) => ({ ...x, kind: 'requirements', label: null })),
  ];
  const why = (reason || '').trim();
  if (deviations.length && why.length < 10) {
    throw new Error(`Removing or loosening a risk-derived default needs a short reason (${deviations.map((x) => `${x.label || x.from}: ${x.change}`).join('; ')}).`);
  }
  const first = !criteriaSaved(state, capabilityId);
  const text = why || (first ? 'Saved before testing.' : 'Edited before testing.');
  const meta = (kind) => ({ deviations: deviations.filter((x) => x.kind === kind).map(({ id, change, from, to, label }) => ({ id, change, from, to, label })) });
  let s = amend(state, capabilityId, 'criteria', { value: c, author: by, reason: text, meta: meta('criteria'), silent: true });
  s = amend(s, capabilityId, 'requirements', { value: r, author: by, reason: text, meta: meta('requirements'), silent: true });
  // One event per save, naming both version numbers.
  return logEvent(s, {
    kind: 'criteria-saved',
    title: first ? 'Success criteria and evidence requirements saved' : 'Success criteria and evidence requirements updated',
    body: `${cap.name}: ${c.length} criteria and ${r.length} evidence requirements saved by ${people(state)[by].name} (criteria v${versionsInForce(s, capabilityId).criteria}, requirements v${versionsInForce(s, capabilityId).requirements}).${deviations.length ? ` ${deviations.length} risk-derived default${deviations.length === 1 ? '' : 's'} ${deviations.length === 1 ? 'was' : 'were'} loosened or removed: ${text}` : ''} They lock on the first test run.`,
    capabilityId,
    link: `#/capabilities/${capabilityId}?tab=criteria`,
  });
}

// ---------------------------------------------------------------------------
// Amendments after evidence need sign-off (#7)
// ---------------------------------------------------------------------------

// Assumption, not yet confirmed (decision 7): the same sign-off applies to
// contract edits once a pilot has started. One named setting so it can be
// switched off.
export const SETTINGS = { CONTRACT_EDITS_NEED_SIGNOFF_AFTER_PILOT: true };

// A pilot has started once a person has moved the capability to Draft or
// above, or pilot data exists.
export function pilotStarted(state, capabilityId) {
  const d = capData(state, capabilityId);
  return Boolean(d.pilot) || state.decisionRecords.some((r) => r.capabilityId === capabilityId && r.next && r.next.level >= 2 && r.authorizedBy !== 'system');
}

export function needsSignoff(state, capabilityId, kind) {
  if (kind === 'criteria') return criteriaLocked(state, capabilityId);
  if (kind === 'contract') return SETTINGS.CONTRACT_EDITS_NEED_SIGNOFF_AFTER_PILOT && pilotStarted(state, capabilityId);
  if (kind === 'stakeholders') return performanceResultsSeen(state, capabilityId);
  throw new Error(`Unknown amendment kind: ${kind}`);
}

// Membership (who) and team labels are governed; position, stance and
// reasoning are not.
export function stakeholderMembershipChanged(before, after) {
  const key = (list) => list.map((st) => `${st.person}|${st.team}`).sort().join(',');
  return key(before) !== key(after);
}

// Who must approve (decision 7, revised): the proposer never approves.
// Low/Medium impact: one approver, the owner, or any other named stakeholder
// if the owner proposed. High impact or Financial exposure: two distinct
// approvers, at least one from Risk. Owners can still propose.
export function signoffRequirements(state, capabilityId, proposedBy = null) {
  const cap = getCapability(state, capabilityId);
  const risk = current(state, capabilityId, 'risk');
  const high = risk.impact === 'High' || risk.exposure === 'Financial / consequential';
  if (high) return { approvers: 2, riskRequired: true, ownerOnly: false };
  const ownerProposed = Boolean(cap && proposedBy && proposedBy === cap.owner);
  return { approvers: 1, riskRequired: false, ownerOnly: !ownerProposed };
}

export function requirementLabel(req) {
  if (!req) return '';
  if (req.approvers === 1) return req.ownerOnly ? 'the owner' : 'one other named stakeholder (the owner proposed)';
  return 'two different approvers, at least one from Risk';
}

// Named stakeholders of a capability: the owner and the people in its
// stakeholder list. Whether one of them counts as Risk is decided by their
// team in the roster, not by the list. If no stakeholders are named yet, any
// named person.
export function namedStakeholders(state, capabilityId) {
  const cap = getCapability(state, capabilityId);
  const listed = current(state, capabilityId, 'stakeholders').map((st) => st.person).filter((k) => isActivePerson(state, k));
  if (!listed.length) return Object.keys(activePeople(state));
  return [...new Set([...(cap && isActivePerson(state, cap.owner) ? [cap.owner] : []), ...listed])];
}

// Risk eligibility is the recorded Risk approver right on an active person.
// Never a team name, never a stakeholder label.
export function isRiskStakeholder(state, capabilityId, personKey) {
  return isRiskApprover(state, personKey);
}

export function riskStakeholders(state, capabilityId) {
  return Object.keys(activePeople(state)).filter((k) => isRiskStakeholder(state, capabilityId, k));
}

export function openProposal(state, capabilityId, kind) {
  return capData(state, capabilityId).proposals.find((p) => p.kind === kind && p.status === 'open') || null;
}

export function getProposal(state, capabilityId, proposalId) {
  return capData(state, capabilityId).proposals.find((p) => p.id === proposalId) || null;
}

function cleanContractValue(value) {
  const v = {};
  for (const k of SECTION_KEYS) v[k] = (Array.isArray(value && value[k]) ? value[k] : []).map((t) => String(t).trim()).filter(Boolean);
  if (!v.may.length && !v.mustAsk.length && !v.mustNever.length) throw new Error('A contract needs at least one line.');
  return v;
}

// Submitted rows carry only what a person edits (name, target, note, text).
// Everything measured or recorded on the base row (current, status, met, gap,
// source) is kept, so the proposal's diff shows only the proposed change.
function cleanAmendmentValue(state, capabilityId, kind, value) {
  if (kind === 'contract') return cleanContractValue(value);
  if (kind === 'stakeholders') return cleanStakeholders(state, value);
  const c = cleanCriteria(value && value.criteria);
  const r = cleanRequirements(value && value.requirements);
  const missingCore = [...CORE_CRITERIA.filter((id) => !c.some((x) => x.id === id)), ...CORE_REQUIREMENTS.filter((id) => !r.some((x) => x.id === id))];
  if (missingCore.length) throw new Error(`Core rows can be adjusted but not removed: ${missingCore.map((id) => CORE_LABELS[id]).join(', ')}.`);
  const baseC = current(state, capabilityId, 'criteria');
  const baseR = current(state, capabilityId, 'requirements');
  const criteria = c.map((x) => { const b = baseC.find((y) => y.id === x.id); return b ? { ...b, name: x.name, target: x.target, note: x.note } : x; });
  const requirements = r.map((x) => { const b = baseR.find((y) => y.id === x.id); return b ? { ...b, text: x.text } : x; });
  return { criteria, requirements };
}

// Re-evaluate a requirement's "met" when its threshold changed and the current
// value is a number. Otherwise the stored judgment stands.
export function evaluateRequirement(req, baseReq) {
  const t = threshold(req.text);
  const base = baseReq ? threshold(baseReq.text) : null;
  const n = parseFloat(String(req.current || '').replace(/[^0-9.]/g, ''));
  if (!t || Number.isNaN(n) || !/^\s*\$?\d/.test(String(req.current || ''))) return Boolean(req.met);
  if (base && base.n === t.n && base.atLeast === t.atLeast) return Boolean(req.met);
  return t.atLeast ? n >= t.n : n < t.n;
}

// Readiness now and under a proposal, e.g. "5 of 6 met now, 6 of 6 under the proposal".
export function proposalReadiness(state, capabilityId, proposal) {
  const now = readiness(state, capabilityId);
  if (!proposal || proposal.kind !== 'criteria') return { now, proposed: null };
  const base = current(state, capabilityId, 'requirements');
  const reqs = proposal.value.requirements.map((r) => {
    const b = base.find((x) => x.id === r.id);
    const merged = { ...r, current: b ? b.current : r.current, met: b ? b.met : r.met, gap: b ? b.gap : r.gap };
    return { ...merged, met: evaluateRequirement(merged, b) };
  });
  return { now, proposed: { met: reqs.filter((r) => r.met).length, total: reqs.length, unmet: reqs.filter((r) => !r.met), requirements: reqs } };
}

function applyCriteriaDirect(state, capabilityId, value, by, reason) {
  return saveCriteria(state, capabilityId, { criteria: value.criteria, requirements: value.requirements, by, reason });
}

// Propose a change to locked criteria/requirements, or to the contract once a
// pilot has started. Before those points the change is applied directly as a
// new version. `by` is whoever is acting.
export function proposeAmendment(state, capabilityId, kind, { value, by, reason } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  requireActive(state, by, 'propose an amendment');
  const why = (reason || '').trim();
  if (why.length < 10) throw new Error('A proposal needs a reason (a sentence).');
  const clean = cleanAmendmentValue(state, capabilityId, kind, value);
  if (kind === 'contract') {
    const blocks = contractValueChecks(state, capabilityId, clean).filter((c) => c.level === 'block');
    if (blocks.length) throw new Error(`The proposed contract fails ${blocks.length} check${blocks.length === 1 ? '' : 's'}: | ${blocks.map((b) => b.text).join(' | ')}`);
  }
  if (!needsSignoff(state, capabilityId, kind)) {
    if (kind === 'criteria') return applyCriteriaDirect(state, capabilityId, clean, by, why);
    if (kind === 'stakeholders') return amend(state, capabilityId, 'stakeholders', { value: clean, author: by, reason: why });
    if (!versionList(state, capabilityId, 'contract').length) throw new Error('Finalize the contract in the builder first.');
    return amend(state, capabilityId, 'contract', { value: clean, author: by, reason: why });
  }
  if (openProposal(state, capabilityId, kind)) throw new Error('A proposal for this object is already awaiting sign-off. Approve or reject it first.');
  const required = signoffRequirements(state, capabilityId, by);
  const eligible = namedStakeholders(state, capabilityId).filter((k) => k !== by);
  const feasible = signoffFeasibility(state, capabilityId, required, eligible, by);
  if (!feasible.ok) throw new Error(feasible.reason);
  const d = capData(state, capabilityId);
  const v = versionsInForce(state, capabilityId);
  const proposal = {
    id: `P-${d.proposals.length + 1}`,
    kind,
    capabilityId,
    proposedBy: by,
    date: state.today,
    reason: why,
    value: clean,
    base: kind === 'contract' ? { contract: v.contract } : kind === 'stakeholders' ? { stakeholders: v.stakeholders } : { criteria: v.criteria, requirements: v.requirements },
    required,
    // Frozen when the proposal opens; later stakeholder edits do not change it.
    eligible,
    approvals: [],
    status: 'open',
    rejection: null,
    applied: null,
  };
  const s = updateCap(state, capabilityId, { proposals: [...d.proposals, proposal] });
  const who = people(state)[by];
  return logEvent(s, {
    kind: 'proposal',
    outcome: 'opened',
    title: `Amendment proposed: ${kind === 'contract' ? 'contract' : kind === 'stakeholders' ? 'stakeholders' : 'success criteria and evidence requirements'}`,
    body: `${cap.name}: ${who.name} proposed ${proposal.id} after evidence. Needs ${requirementLabel(proposal.required)}, never the proposer. Reason: ${why}`,
    capabilityId,
    link: `#/capabilities/${capabilityId}/proposals/${proposal.id}`,
  });
}

// Can the eligible approvers ever satisfy the rule? Checked when a proposal
// opens, so nothing is recorded that can never complete.
export function signoffFeasibility(state, capabilityId, required, eligible, proposedBy) {
  const cap = getCapability(state, capabilityId);
  const who = people(state)[proposedBy] ? people(state)[proposedBy].name : 'you';
  if (required.ownerOnly) {
    if (!eligible.includes(cap.owner)) return { ok: false, reason: `The owner (${people(state)[cap.owner].name}) must approve and is not available to. Ask someone else to propose.` };
    return { ok: true };
  }
  if (eligible.length < required.approvers) {
    return { ok: false, reason: `This needs ${required.approvers} approvers other than ${who}, and only ${eligible.length} named stakeholder${eligible.length === 1 ? ' is' : 's are'} eligible. Add stakeholders or ask someone else to propose.` };
  }
  if (required.riskRequired && !eligible.some((k) => isRiskStakeholder(state, capabilityId, k))) {
    return { ok: false, reason: `No Risk approver other than ${who}. Add another Risk person to the stakeholders or ask someone else to propose.` };
  }
  if (required.riskRequired && required.approvers === 2 && eligible.length === 1) {
    return { ok: false, reason: `Only one eligible approver other than ${who}; this needs two. Add stakeholders or ask someone else to propose.` };
  }
  return { ok: true };
}

export function roleLabel(role) {
  return role === 'owner' ? 'the owner' : role === 'risk' ? 'a Risk stakeholder' : 'a named stakeholder';
}

function roleFor(state, capabilityId, personKey) {
  const cap = getCapability(state, capabilityId);
  if (isRiskStakeholder(state, capabilityId, personKey)) return 'risk';
  if (cap && personKey === cap.owner) return 'owner';
  return 'stakeholder';
}

export function approvalsComplete(proposal) {
  const req = proposal.required;
  if (proposal.approvals.length < req.approvers) return false;
  if (req.riskRequired && !proposal.approvals.some((a) => a.role === 'risk')) return false;
  return true;
}

// Whether the acting person can approve this proposal now, and why not.
export function approvalEligibility(state, capabilityId, proposal, personKey) {
  const cap = getCapability(state, capabilityId);
  if (!proposal || proposal.status !== 'open') return { ok: false, role: null, reason: 'This proposal is closed.' };
  if (!personKey || !people(state)[personKey]) return { ok: false, role: null, reason: 'Choose who is acting.' };
  const name = people(state)[personKey].name;
  if (!isActivePerson(state, personKey)) return { ok: false, role: null, reason: `${name} is deactivated and cannot approve.` };
  if (personKey === proposal.proposedBy) return { ok: false, role: null, reason: `${name} proposed this; the proposer never approves.` };
  if (proposal.approvals.some((a) => a.by === personKey)) return { ok: false, role: null, reason: `${name} has already approved.` };
  const req = proposal.required;
  const role = roleFor(state, capabilityId, personKey);
  if (req.ownerOnly) {
    if (personKey !== cap.owner) return { ok: false, role: null, reason: `${name} cannot approve this. Needed: the owner (${people(state)[cap.owner].name}).` };
    return { ok: true, role: 'owner', reason: null };
  }
  const eligible = proposal.eligible || namedStakeholders(state, capabilityId);
  if (!eligible.includes(personKey)) return { ok: false, role: null, reason: `${name} was not an eligible approver when this proposal opened.` };
  // Last slot on a High/Financial proposal must be Risk if none has signed yet.
  const remaining = req.approvers - proposal.approvals.length;
  const riskStill = req.riskRequired && !proposal.approvals.some((a) => a.role === 'risk');
  if (riskStill && remaining <= 1 && role !== 'risk') {
    return { ok: false, role: null, reason: `${name} cannot take the last approval: at least one approver must be from Risk (${riskStakeholders(state, capabilityId).map((k) => people(state)[k].name).join(', ') || 'none named'}).` };
  }
  return { ok: true, role, reason: null };
}

export function approveProposal(state, capabilityId, proposalId, { by } = {}) {
  const cap = getCapability(state, capabilityId);
  const proposal = getProposal(state, capabilityId, proposalId);
  if (!proposal) throw new Error(`Unknown proposal: ${proposalId}`);
  const e = approvalEligibility(state, capabilityId, proposal, by);
  if (!e.ok) throw new Error(e.reason);
  const approvals = [...proposal.approvals, { by, role: e.role, date: state.today }];
  let next = { ...proposal, approvals };
  let s = state;
  const who = people(state)[by];
  if (!approvalsComplete(next)) {
    s = updateCap(s, capabilityId, { proposals: capData(s, capabilityId).proposals.map((p) => (p.id === proposalId ? next : p)) });
    const left = proposal.required.approvers - approvals.length;
    const riskStill = proposal.required.riskRequired && !approvals.some((a) => a.role === 'risk');
    return logEvent(s, {
      kind: 'proposal',
      outcome: 'approval',
      title: `Approval recorded on ${proposalId}`,
      body: `${cap.name}: ${who.name} approved as ${roleLabel(e.role)}. Still needed: ${left} more approver${left === 1 ? '' : 's'}${riskStill ? ', from Risk' : ''}.`,
      capabilityId,
      link: `#/capabilities/${capabilityId}/proposals/${proposalId}`,
    });
  }
  // Fully approved: apply as new versions, authored by the proposer, with the
  // approvals on the version.
  const meta = { proposalId, proposedBy: proposal.proposedBy, approvals };
  const applied = {};
  if (proposal.kind === 'contract') {
    s = amend(s, capabilityId, 'contract', { value: proposal.value, author: proposal.proposedBy, reason: proposal.reason, meta, silent: true });
    applied.contract = versionsInForce(s, capabilityId).contract;
  } else if (proposal.kind === 'stakeholders') {
    s = amend(s, capabilityId, 'stakeholders', { value: proposal.value, author: proposal.proposedBy, reason: proposal.reason, meta, silent: true });
    applied.stakeholders = versionsInForce(s, capabilityId).stakeholders;
  } else {
    const defaults = defaultsFor(s, capabilityId);
    const deviations = (kind, items, textOf) => defaultDeviations(defaults[kind], items, textOf).map((x) => ({ ...x, label: kind === 'criteria' ? (defaults.criteria.find((y) => y.id === x.id) || {}).name : null }));
    // Requirements keep their measured "current" values; "met" is re-evaluated
    // where the threshold changed and the value is a number.
    const requirements = proposalReadiness(s, capabilityId, proposal).proposed.requirements;
    const criteria = proposal.value.criteria;
    s = amend(s, capabilityId, 'criteria', { value: criteria, author: proposal.proposedBy, reason: proposal.reason, meta: { ...meta, deviations: deviations('criteria', criteria, (x) => x.target) }, silent: true });
    s = amend(s, capabilityId, 'requirements', { value: requirements, author: proposal.proposedBy, reason: proposal.reason, meta: { ...meta, deviations: deviations('requirements', requirements, (x) => x.text) }, silent: true });
    applied.criteria = versionsInForce(s, capabilityId).criteria;
    applied.requirements = versionsInForce(s, capabilityId).requirements;
  }
  next = { ...next, status: 'approved', applied, closedAt: state.today };
  s = updateCap(s, capabilityId, { proposals: capData(s, capabilityId).proposals.map((p) => (p.id === proposalId ? next : p)) });
  const label = proposal.kind === 'contract' ? `Contract amended to v${applied.contract}` : proposal.kind === 'stakeholders' ? `Stakeholders amended to v${applied.stakeholders}` : `Success criteria amended to v${applied.criteria}, evidence requirements to v${applied.requirements}`;
  return logEvent(s, {
    kind: 'amendment',
    afterEvidence: true,
    objectKind: proposal.kind === 'contract' ? 'contract' : proposal.kind === 'stakeholders' ? 'stakeholders' : 'criteria',
    version: proposal.kind === 'contract' ? applied.contract : proposal.kind === 'stakeholders' ? applied.stakeholders : applied.criteria,
    proposalId,
    title: `${label} after evidence`,
    body: `${cap.name}: proposed by ${people(state)[proposal.proposedBy].name}, approved by ${approvals.map((a) => `${people(state)[a.by].name} (${roleLabel(a.role)})`).join(' and ')}. ${proposal.reason}`,
    capabilityId,
    link: `#/capabilities/${capabilityId}/proposals/${proposalId}`,
  });
}

// The proposer withdraws an open proposal. Recorded with a reason, like a rejection.
export function withdrawProposal(state, capabilityId, proposalId, { by, reason } = {}) {
  const cap = getCapability(state, capabilityId);
  const proposal = getProposal(state, capabilityId, proposalId);
  if (!proposal) throw new Error(`Unknown proposal: ${proposalId}`);
  if (proposal.status !== 'open') throw new Error('This proposal is closed.');
  if (!by || by !== proposal.proposedBy) throw new Error('Only the proposer can withdraw a proposal; others reject it.');
  requireActive(state, by, 'withdraw a proposal');
  const why = (reason || '').trim();
  if (why.length < 10) throw new Error('A withdrawal needs a reason (a sentence).');
  const next = { ...proposal, status: 'withdrawn', withdrawal: { by, date: state.today, reason: why }, closedAt: state.today };
  const s = updateCap(state, capabilityId, { proposals: capData(state, capabilityId).proposals.map((p) => (p.id === proposalId ? next : p)) });
  return logEvent(s, {
    kind: 'proposal',
    outcome: 'withdrawn',
    title: `Amendment withdrawn: ${proposalId}`,
    body: `${cap.name}: ${people(state)[by].name} withdrew their proposal. ${why}`,
    capabilityId,
    link: `#/capabilities/${capabilityId}/proposals/${proposalId}`,
  });
}

export function rejectProposal(state, capabilityId, proposalId, { by, reason } = {}) {
  const cap = getCapability(state, capabilityId);
  const proposal = getProposal(state, capabilityId, proposalId);
  if (!proposal) throw new Error(`Unknown proposal: ${proposalId}`);
  if (proposal.status !== 'open') throw new Error('This proposal is closed.');
  requireActive(state, by, 'reject a proposal');
  if (by === proposal.proposedBy) throw new Error('The proposer withdraws rather than rejects; someone else must reject.');
  const why = (reason || '').trim();
  if (why.length < 10) throw new Error('A rejection needs a reason (a sentence).');
  const frozen = proposal.eligible || namedStakeholders(state, capabilityId);
  const eligible = by === cap.owner || isRiskStakeholder(state, capabilityId, by) || (!proposal.required.ownerOnly && frozen.includes(by));
  if (!eligible) throw new Error(`${people(state)[by].name} is not eligible to reject this: ${requirementLabel(proposal.required)} decide.`);
  const next = { ...proposal, status: 'rejected', rejection: { by, date: state.today, reason: why }, closedAt: state.today };
  const s = updateCap(state, capabilityId, { proposals: capData(state, capabilityId).proposals.map((p) => (p.id === proposalId ? next : p)) });
  return logEvent(s, {
    kind: 'proposal',
    outcome: 'rejected',
    title: `Amendment rejected: ${proposalId}`,
    body: `${cap.name}: ${people(state)[by].name} rejected the proposal by ${people(state)[proposal.proposedBy].name}. ${why}`,
    capabilityId,
    link: `#/capabilities/${capabilityId}/proposals/${proposalId}`,
  });
}

// ---------------------------------------------------------------------------
// Stakeholders and scenarios (#8)
// ---------------------------------------------------------------------------

export const STANCES = [['expand', 'Expand'], ['expand-limits', 'Expand with limits'], ['hold', 'Hold'], ['restrict', 'Restrict'], ['undecided', 'No position yet']];

function cleanStakeholders(state, stakeholders) {
  if (!Array.isArray(stakeholders) || !stakeholders.length) throw new Error('Name at least one stakeholder.');
  const seen = new Set();
  return stakeholders.map((st, i) => {
    const team = (st.team || '').trim();
    const person = st.person;
    if (!team) throw new Error(`Stakeholder ${i + 1} needs a team.`);
    if (!person || !people(state)[person]) throw new Error(`Stakeholder ${i + 1} needs a named person.`);
    if (!isActivePerson(state, person)) throw new Error(`${people(state)[person].name} is deactivated and cannot be a stakeholder.`);
    if (seen.has(person)) throw new Error(`${people(state)[person].name} is listed twice.`);
    seen.add(person);
    const stance = STANCES.some(([k]) => k === st.stance) ? st.stance : 'undecided';
    const position = (st.position || '').trim() || (STANCES.find(([k]) => k === stance) || [])[1] || 'No position yet';
    return { team, person, stance, position, quote: (st.quote || '').trim(), date: st.date || state.today };
  });
}

// Save the stakeholder list. Before performance results exist every save is a
// direct new version. After that, a change to who is listed or to a team
// label goes through a proposal with sign-off; position, stance and
// reasoning updates stay direct.
export function saveStakeholders(state, capabilityId, { stakeholders, by, reason } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  requireActive(state, by, 'save the stakeholders');
  const list = cleanStakeholders(state, stakeholders);
  const before = current(state, capabilityId, 'stakeholders');
  const first = !before.length;
  const why = (reason || '').trim() || (first ? 'Stakeholders named.' : 'Stakeholders updated.');
  if (needsSignoff(state, capabilityId, 'stakeholders') && stakeholderMembershipChanged(before, list)) {
    return proposeAmendment(state, capabilityId, 'stakeholders', { value: list, by, reason: (reason || '').trim() || 'Stakeholder membership change after performance results.' });
  }
  return amend(state, capabilityId, 'stakeholders', { value: list, author: by, reason: why });
}

// Deterministic simulated results for a person-written or starter scenario.
// The same scenario always gets the same result, so the suite replays.
function hash(text) {
  let h = 2166136261;
  for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
const FAIL_EVERY = { standard: 11, ambiguous: 7, adversarial: 6, 'high-impact': 5, edge: 5 };
export function simulateScenario(sc) {
  const h = hash(`${sc.group}|${sc.name}|${sc.situation}`);
  const pass = h % (FAIL_EVERY[sc.group] || 7) !== 0;
  const escalate = /escalat|route for human|approval|ask for/i.test(sc.expected || '');
  const severity = pass ? 'None' : sc.group === 'high-impact' || sc.group === 'adversarial' ? 'High' : 'Medium';
  const expected = (sc.expected || '').replace(/\.$/, '');
  return {
    pass,
    severity,
    escalated: pass && escalate,
    aiDecision: pass ? `${escalate ? 'Escalated' : 'Produced the output'} as expected: ${expected.charAt(0).toLowerCase()}${expected.slice(1)}.` : escalate ? 'Produced an output instead of escalating.' : 'Produced an output that did not match the expected behaviour.',
    outcome: pass ? (escalate ? 'Escalated correctly' : 'Correct output') : escalate ? 'Missed escalation' : 'Wrong output',
    explanation: pass ? 'Simulated result (seeded, deterministic). The recorded decision matched the expected behaviour.' : 'Simulated result (seeded, deterministic). The recorded decision did not match the expected behaviour; treat as a real failure for the purpose of the pilot decision.',
    reviewer: pass ? (escalate ? 'Human took the case' : 'Approved as recommended') : 'Overridden by the reviewer',
    failureType: pass ? undefined : escalate ? 'Missing escalation' : 'Wrong answer',
    simulated: true,
  };
}

const GROUP_PREFIX = { standard: 'S', ambiguous: 'A', adversarial: 'X', 'high-impact': 'H', edge: 'E' };

function cleanScenarios(list) {
  if (!Array.isArray(list)) throw new Error('Scenarios must be a list.');
  const counts = {};
  return list.map((sc, i) => {
    const group = seed.SCENARIO_GROUPS.some((g) => g.id === sc.group) ? sc.group : null;
    if (!group) throw new Error(`Scenario ${i + 1} needs a group.`);
    const name = (sc.name || '').trim();
    const situation = (sc.situation || '').trim();
    const expected = (sc.expected || '').trim();
    if (!name || !situation || !expected) throw new Error(`Scenario ${i + 1} needs a name, a situation and an expected behaviour.`);
    counts[group] = (counts[group] || 0) + 1;
    const base = { id: sc.id || `${GROUP_PREFIX[group]}-${String(counts[group]).padStart(2, '0')}`, group, name, situation, expected, source: sc.source === 'ai' ? 'ai' : 'person' };
    // Keep a recorded result if the scenario text is unchanged; otherwise simulate.
    const keep = sc.pass !== undefined && sc.aiDecision && !sc.simulated ? { pass: sc.pass, severity: sc.severity, aiDecision: sc.aiDecision, outcome: sc.outcome, explanation: sc.explanation, reviewer: sc.reviewer, escalated: sc.escalated, incident: sc.incident, failureType: sc.failureType } : simulateScenario(base);
    return { ...base, ...keep };
  });
}

export function scenarioNudge(count) {
  if (count === 0) return 'No scenarios yet. Twenty to thirty is enough to start: a few in every group, with the ugly ones included.';
  if (count < 20) return `${count} scenario${count === 1 ? '' : 's'}. Aim for 20 to 30 before the first run, with at least two in every group.`;
  if (count <= 30) return `${count} scenarios. That is a sound starting library.`;
  return `${count} scenarios. More than 30 is fine, but make sure the groups stay balanced.`;
}

// Replace the scenario library. Results are simulated deterministically when
// a scenario is new or changed. Not allowed after a test run has been
// recorded for this library (the recorded results are evidence).
export function saveScenarios(state, capabilityId, { scenarios, by } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  requireActive(state, by, 'save the scenario library');
  const d = capData(state, capabilityId);
  const list = cleanScenarios(scenarios);
  const groups = new Set(list.map((sc) => sc.group));
  if (list.length && groups.size < 2) throw new Error('Cover at least two groups; a library of one kind of case proves little.');
  let s = updateCap(state, capabilityId, { scenarios: list, testRun: d.testRun.lastRun ? { ...d.testRun, status: 'not-run', completed: [] } : d.testRun });
  return logEvent(s, {
    kind: 'scenarios-saved',
    title: 'Scenario library saved',
    body: `${cap.name}: ${list.length} scenarios across ${groups.size} group${groups.size === 1 ? '' : 's'} saved by ${people(state)[by].name}${list.some((x) => x.source === 'ai') ? ` (${list.filter((x) => x.source === 'ai').length} suggested by AI)` : ''}. ${scenarioNudge(list.length)}`,
    capabilityId,
    link: `#/capabilities/${capabilityId}/scenarios/edit`,
  });
}

export function addStarterScenarios(state, capabilityId, { by } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  const d = capData(state, capabilityId);
  const existing = d.scenarios;
  const have = new Set(existing.map((sc) => sc.name));
  const add = starterScenarios(cap).filter((sc) => !have.has(sc.name));
  if (!add.length) throw new Error('The starter set is already in the library.');
  return saveScenarios(state, capabilityId, { scenarios: [...existing, ...add], by });
}

// Open an authority decision for a capability: propose the next level. Needs
// a recorded test run. Used to take a new capability to Draft (its second record).
export function proposeAuthority(state, capabilityId, level, { by } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  requireActive(state, by, 'propose an authority change');
  if (decisionRequired(state, capabilityId)) throw new Error('A decision is already open for this capability.');
  if (cap.status === 'not-delegated') throw new Error('This capability is not delegated by design. Start with a new decision record if that should change.');
  const target = Number(level);
  if (target !== cap.authority.level + 1) throw new Error(`Authority moves one level at a time. The next level is ${cap.authority.level + 1}.`);
  if (!capData(state, capabilityId).testRun.lastRun) throw new Error('Run the test suite before proposing an authority change.');
  if (target >= 3 && !capData(state, capabilityId).pilot) throw new Error('Level 3 needs pilot evidence. Run a pilot at Draft first.');
  const d = capData(state, capabilityId);
  let s = updateCap(state, capabilityId, { decision: { ...d.decision, option: null, recordId: null, proposed: { level: target, limited: false }, rationale: d.decision.rationale || `Test results support a limited, human-approved pilot. Every case is approved by a person at ${levelName(target)}.` } });
  return logEvent(s, {
    kind: 'decision',
    title: `Authority decision opened: ${authorityLabel(cap.authority, { short: true })} → Level ${target}`,
    body: `${cap.name}: ${people(state)[by].name} proposed moving to ${authorityLabel({ level: target, limited: false })}. The system can recommend; a person authorizes.`,
    capabilityId,
    link: `#/capabilities/${capabilityId}/decision`,
  });
}
