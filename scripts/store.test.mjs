import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as seed from '../src/data/seed.js';
import {
  initialState, startTestRun, advanceTestRun, selectDecision, setCondition, setRationale,
  canAuthorize, authorize, simulateBreach, reset, readiness, testSummary, getCapability, capData,
  focusCapability, conditionsPreview, createStore, STORAGE_KEY,
  amend, currentVersion, versionsInForce, performanceResultsSeen, isSurfaced, VERSIONED_KINDS,
  activityEvents, amendmentsAfterEvidenceFor, versionFor, SURFACED_KINDS, current, versionList,
  addCapability, actor, setActingAs, vagueNameWarning, slugify,
  startContractDraft, reviewSuggestion, addContractLine, editContractLine, removeContractLine, confirmSection,
  contractChecks, canFinalizeContract, finalizeContract, draftValue, contractSummary, SECTION_KEYS,
  saveCriteria, criteriaSaved, criteriaLocked, canRunSuite, defaultsFor, defaultDeviations, CORE_CRITERIA, CORE_REQUIREMENTS,
  SETTINGS, pilotStarted, needsSignoff, signoffRequirements, isRiskStakeholder, proposeAmendment, approveProposal, rejectProposal,
  openProposal, getProposal, approvalEligibility, proposalReadiness, evaluateRequirement, approvalsComplete, namedStakeholders, contractValueChecks,
  saveStakeholders, saveScenarios, addStarterScenarios, simulateScenario, scenarioNudge, proposeAuthority, STANCES, stakeholderMembershipChanged,
  withdrawProposal, signoffFeasibility, decisionRequired, proposedAuthority, lastDecisionId, lastEvaluated,
  people, personRecord, activePeople, isActivePerson, isWorkspaceAdmin, isRiskApprover, rosterVersions, addPerson, editPerson, deactivatePerson,
  proposeRosterChange, approveRosterChange, rejectRosterChange, withdrawRosterChange, openRosterProposal, getRosterProposal, rosterApprovalEligibility, activeAdmins,
  snapshotPerson, riskCoverage, coverageWarning, proposalSatisfiable, proposalWarning, coverageWarnings, rosterChangeImpact, isHighOrFinancial,
  parseRestrictionLine, restrictionRules, monitoringStatus, ruleCrossed, breachRule,
} from '../src/store/index.js';
import { setPeople, personAt } from '../src/ui.js';
import { decisionRecordView } from '../src/views/decisions.js';
import { proposalView } from '../src/views/proposals.js';
import { versionsView } from '../src/views/versions.js';
import { starterScenarios } from '../src/data/scenario-templates.js';
import { defaultCriteria, defaultRequirements } from '../src/data/criteria-defaults.js';
import { pickTemplate, suggestLines } from '../src/data/contract-templates.js';
import { diffValues } from '../src/diff.js';

const RR = 'refund-recommendation';
const TC = 'ticket-classification';
const cap = (s, id = RR) => getCapability(s, id);

// A freshly added Low-impact capability with nothing else set up.
function blankCap(name = 'Ticket tagging', summary = 'Adds routing tags.') {
  const s = addCapability(initialState(), { name, summary, owner: 'priya', risk: { impact: 'Low', reversibility: 'Easy to reverse', exposure: 'Internal only' }, startingLevel: 0 });
  return [s, s.capabilities[s.capabilities.length - 1].id];
}

function runSuite(s, id = RR) {
  s = startTestRun(s, id);
  for (let i = 0; i < 100 && capData(s, id).testRun.status === 'running'; i++) s = advanceTestRun(s, id);
  return s;
}

test('seed is internally consistent', () => {
  assert.equal(seed.scenarios.length, 26);
  assert.equal(seed.scenarios.filter((s) => !s.pass).length, 2);
  assert.equal(seed.scenarios.filter((s) => s.severity === 'High').length, 1);
  assert.equal(seed.pilot.segments.reduce((n, s) => n + s.cases, 0), seed.pilot.cases);
  assert.equal(seed.capabilities.length, 5);
  assert.equal(seed.stakeholders.length, 5);
  const ids = new Set(seed.scenarios.map((s) => s.id));
  assert.equal(ids.size, 26, 'scenario ids are unique');
});

test('the capability id is hard-coded only in the seed', () => {
  const files = [];
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p);
  });
  walk(new URL('../src', import.meta.url).pathname);
  const offenders = files.filter((f) => !f.endsWith('/data/seed.js') && readFileSync(f, 'utf8').includes(RR));
  assert.deepEqual(offenders, []);
});

test('initial state: data is per capability', () => {
  const s = initialState();
  assert.equal(s.version, 14);
  assert.equal(STORAGE_KEY, 'authority-lab-state-v14');
  assert.deepEqual(Object.keys(s.capabilityData).sort(), seed.capabilities.map((c) => c.id).sort());
  assert.deepEqual(cap(s).authority, { level: 2, limited: false });
  assert.equal(decisionRequired(s, RR), true);
  assert.equal(capData(s, RR).scenarios.length, 26);
  assert.equal(capData(s, RR).evidence.length, 12);
  assert.equal(capData(s, RR).monitoring, null);
  assert.equal(capData(s, TC).scenarios.length, 0);
  assert.equal(capData(s, TC).pilot, null);
  assert.equal(capData(s, TC).evidence.length, 1, 'one measured item so its criteria read as locked');
  assert.equal(s.alerts.length, 0);
  assert.equal(focusCapability(s).id, RR);
});

test('readiness is computed per capability', () => {
  const s = initialState();
  const r = readiness(s, RR);
  assert.equal(r.met, 5);
  assert.equal(r.total, 6);
  assert.equal(r.unmet[0].id, 'high-value');
  assert.deepEqual([readiness(s, TC).met, readiness(s, TC).total], [5, 5], 'ticket classification has its own seeded requirements');
  const [b, bid] = blankCap();
  assert.deepEqual(readiness(b, bid), { met: 0, total: 0, unmet: [] });
  assert.deepEqual(readiness(s, 'no-such-capability'), { met: 0, total: 0, unmet: [] });
});

test('test suite runs to completion for one capability and updates its evidence only', () => {
  let s = startTestRun(initialState(), RR);
  assert.equal(capData(s, RR).testRun.status, 'running');
  assert.equal(capData(s, TC).testRun.status, 'not-run');
  s = runSuite(s);
  const t = testSummary(s, RR);
  assert.equal(t.status, 'complete');
  assert.equal(t.completed, 26);
  assert.equal(t.passed, 24);
  assert.equal(t.failed, 2);
  assert.equal(t.highSeverity, 1);
  const ev = capData(s, RR).evidence.find((e) => e.id === 'EV-01');
  assert.equal(ev.value, '24 of 26 passed');
  assert.equal(ev.date, seed.TODAY);
  assert.match(ev.detail, /H-04/);
  assert.equal(ev.runOn, seed.TODAY, 'the run date is stored as a field');
  assert.doesNotMatch(ev.detail, /\b20\d\d\b|Run on/, 'no date is baked into the stored text');
  assert.equal(s.activity[0].kind, 'test');
  assert.equal(s.activity[0].surfaced, true);
  assert.equal(s.activity[0].capabilityId, RR);
  assert.equal(capData(s, TC).evidence.length, 1, 'other capabilities untouched');
  // A capability without scenarios cannot start a run.
  assert.equal(startTestRun(s, TC), s);
});

test('authorize requires an option and a rationale', () => {
  let s = initialState();
  assert.equal(canAuthorize(s, RR).ok, false);
  s = selectDecision(s, RR, 'expand-limits');
  assert.equal(canAuthorize(s, RR).ok, true);
  s = setRationale(s, RR, '');
  assert.equal(canAuthorize(s, RR).ok, false);
  assert.throws(() => authorize(s, RR), /rationale/i);
});

test('expand with limits: authority changes, record is written with snapshot and conditions', () => {
  let s = selectDecision(initialState(), RR, 'expand-limits');
  s = setCondition(s, RR, 'maxValue', 50);
  s = authorize(s, RR, { by: 'maya' });
  assert.deepEqual(cap(s).authority, { level: 3, limited: true });
  assert.equal(cap(s).status, 'monitoring');
  assert.equal(decisionRequired(s, RR), false);
  const rec = s.decisionRecords[s.decisionRecords.length - 1];
  assert.equal(rec.id, 'AC-04');
  assert.equal(rec.number, 4);
  assert.equal(rec.capabilityId, RR);
  assert.equal(rec.authorizedBy, 'maya');
  assert.deepEqual(rec.previous, { level: 2, limited: false });
  assert.deepEqual(rec.next, { level: 3, limited: true });
  assert.ok(rec.evidenceSnapshot.includes('218 pilot cases'));
  assert.ok(rec.evidenceSnapshot.includes('18 high-value refund cases (requirement: 40)'));
  assert.equal(rec.conditions.maxValue, 50);
  assert.match(rec.scope, /Automatic refunds ≤ \$50/);
  assert.match(rec.openCondition, /currently 18/);
  const d = capData(s, RR);
  assert.ok(d.monitoring && d.monitoring.breached === false);
  assert.equal(d.decision.recordId, 'AC-04');
  assert.equal(s.activity[0].kind, 'authority');
  // Other capabilities are untouched.
  assert.deepEqual(cap(s, TC).authority, { level: 3, limited: false });
  assert.equal(capData(s, TC).monitoring, null);
});

test('authority can move down: restrict and suspend', () => {
  let s = authorize(selectDecision(initialState(), RR, 'restrict'), RR);
  assert.deepEqual(cap(s).authority, { level: 1, limited: false });
  assert.equal(cap(s).status, 'restricted');
  assert.equal(capData(s, RR).monitoring, null);
  s = authorize(selectDecision(initialState(), RR, 'suspend'), RR);
  assert.deepEqual(cap(s).authority, { level: 0, limited: false });
});

test('hold keeps authority and still writes a record', () => {
  const s = authorize(selectDecision(initialState(), RR, 'hold'), RR);
  assert.deepEqual(cap(s).authority, { level: 2, limited: false });
  assert.equal(s.decisionRecords.length, 4);
});

test('threshold breach restricts automatically, creates alert, event, record, review-required', () => {
  let s = authorize(selectDecision(initialState(), RR, 'expand-limits'), RR);
  s = simulateBreach(s, RR);
  assert.deepEqual(cap(s).authority, { level: 2, limited: false });
  assert.equal(cap(s).status, 'review-required');
  const d = capData(s, RR);
  assert.equal(d.reviewRequired, true);
  assert.equal(s.alerts.length, 1);
  assert.equal(s.alerts[0].capabilityId, RR);
  assert.equal(d.monitoring.breached, true);
  assert.equal(d.monitoring.severeErrorsInWindow, 3);
  const rec = s.decisionRecords[s.decisionRecords.length - 1];
  assert.equal(rec.authorizedBy, 'system');
  assert.equal(rec.option, 'auto-restrict');
  assert.equal(rec.next.level, 2);
  assert.equal(s.activity[0].kind, 'restriction');
  assert.equal(s.activity[1].kind, 'failure');
  assert.ok(s.activity.slice(0, 2).every((e) => e.surfaced === true));
  assert.ok(d.evidence.some((e) => e.id === 'EV-13' && e.status === 'fail' && /INC-02/.test(e.metric)));
  assert.equal(focusCapability(s).id, RR);
  // Earlier records are untouched.
  assert.equal(s.decisionRecords[3].id, 'AC-04');
  assert.deepEqual(s.decisionRecords[3].next, { level: 3, limited: true });
  // Breach is idempotent, and cannot run while no contract rule applies
  // (Refund recommendation at Draft: its rules return it to Draft).
  assert.equal(simulateBreach(s, RR), s);
  const fresh = initialState();
  assert.equal(simulateBreach(fresh, RR), fresh);
});

test('after a breach, expansion cannot be authorized until review', () => {
  let s = simulateBreach(authorize(selectDecision(initialState(), RR, 'expand-limits'), RR), RR);
  s = { ...s, capabilityData: { ...s.capabilityData, [RR]: { ...capData(s, RR), decision: { ...capData(s, RR).decision, proposed: { level: 3, limited: false } } } } };
  s = selectDecision(s, RR, 'expand');
  const check = canAuthorize(s, RR);
  assert.equal(check.ok, false);
  assert.match(check.reason, /review/i);
  // Restricting further is still allowed.
  assert.equal(canAuthorize(selectDecision(s, RR, 'restrict'), RR).ok, true);
});

test('a second capability gets its own decision and readiness, independent of the first', () => {
  let s = initialState();
  s = selectDecision(s, TC, 'restrict');
  s = setRationale(s, TC, 'Misroute rate climbed after the queue change; back to Draft while it is investigated.');
  assert.equal(canAuthorize(s, TC).ok, true);
  assert.equal(canAuthorize(s, RR).ok, false, 'refund recommendation still has no option selected');
  s = authorize(s, TC, { by: 'priya' });
  assert.deepEqual(cap(s, TC).authority, { level: 2, limited: false });
  assert.deepEqual(cap(s, RR).authority, { level: 2, limited: false });
  assert.equal(decisionRequired(s, RR), true);
  const rec = s.decisionRecords[s.decisionRecords.length - 1];
  assert.equal(rec.capabilityId, TC);
  assert.equal(rec.authorizedBy, 'priya');
  assert.deepEqual(rec.evidenceSnapshot, [], 'no pilot or scenarios, all requirements met');
  assert.deepEqual([readiness(s, TC).met, readiness(s, TC).total], [5, 5]);
  assert.equal(readiness(s, RR).met, 5);
  // The workspace still focuses on the capability with the pending decision.
  assert.equal(focusCapability(s).id, RR);
});

test('reset restores the seeded state', () => {
  let s = simulateBreach(authorize(selectDecision(initialState(), RR, 'expand-limits'), RR), RR);
  s = reset(s);
  assert.deepEqual(s, initialState());
});

test('conditions preview reads as plain English', () => {
  const text = conditionsPreview(seed.defaultConditions, seed.capabilities.find((c) => c.id === RR));
  assert.match(text, /standard refunds of \$50 or less/);
  assert.match(text, /at least 90%/);
  assert.match(text, /Fraud-signaled, ambiguous, high-value, policy-exception and chargeback cases continue to require human review\./);
  assert.match(conditionsPreview(seed.defaultConditions, seed.capabilities.find((c) => c.id === TC)), /standard actions of \$50/);
});

test('store persists per-capability state and discards an interrupted run on reload', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const store = createStore({ storage });
  store.dispatch('startTestRun', RR);
  store.dispatch('advanceTestRun', RR);
  assert.equal(JSON.parse(mem.get(STORAGE_KEY)).capabilityData[RR].testRun.status, 'running');
  const store2 = createStore({ storage });
  assert.equal(capData(store2.get(), RR).testRun.status, 'not-run');
  store2.dispatch('selectDecision', RR, 'hold');
  store2.dispatch('authorize', RR);
  const store3 = createStore({ storage });
  assert.equal(store3.get().decisionRecords.length, 4);
  store3.dispatch('reset');
  assert.deepEqual(store3.get(), initialState());
  // Older payloads are ignored.
  mem.set(STORAGE_KEY, JSON.stringify({ version: 13, decisionRecords: [] }));
  assert.deepEqual(createStore({ storage }).get(), initialState());
});

// ---------------------------------------------------------------------------
// Three-tier record model (#2)
// ---------------------------------------------------------------------------

test('every capability starts with version 1 of each versioned object; the latest version is the only copy', () => {
  const s = initialState();
  for (const c of s.capabilities) {
    const d = capData(s, c.id);
    for (const kind of VERSIONED_KINDS) {
      const v = currentVersion(s, c.id, kind);
      assert.equal(v.version, 1, `${c.id} ${kind}`);
      assert.equal(v.before, null);
      assert.equal(v.afterEvidence, false);
      assert.equal(v.author, c.owner);
    }
    const seeded = seed.capabilities.find((x) => x.id === c.id);
    assert.deepEqual(current(s, c.id, 'contract'), seeded.contract);
    assert.deepEqual(current(s, c.id, 'risk'), seeded.risk);
    assert.deepEqual(current(s, c.id, 'criteria'), (seed.capabilityData[c.id] || {}).criteria || []);
    assert.deepEqual(current(s, c.id, 'requirements'), (seed.capabilityData[c.id] || {}).requirements || []);
    assert.deepEqual(current(s, c.id, 'stakeholders'), (seed.capabilityData[c.id] || {}).stakeholders || []);
    // No cached copies anywhere.
    for (const k of ['contract', 'risk']) assert.equal(k in c, false, `${c.id} carries no ${k}`);
    for (const k of ['criteria', 'requirements', 'stakeholders']) assert.equal(k in d, false, `${c.id} data carries no ${k}`);
  }
  assert.deepEqual(versionsInForce(s, RR), { contract: 1, criteria: 1, requirements: 1, risk: 1, stakeholders: 1 });
});

test('every seeded activity event has a kind and a surfaced flag that matches the rule; every seeded record names its versions', () => {
  const s = initialState();
  for (const e of s.activity) {
    assert.ok(e.kind, e.id);
    assert.equal(isSurfaced(e), e.surfaced, `${e.id} surfaced flag matches the rule`);
  }
  const quiet = s.activity.filter((e) => !e.surfaced).map((e) => e.id);
  assert.deepEqual(quiet, ['ACT-03'], 'only "criteria defined" is a setup-type event in the seed');
  for (const r of s.decisionRecords) {
    assert.deepEqual(r.versions, { contract: 1, criteria: 1, requirements: 1, risk: 1, stakeholders: 1 }, r.id);
    assert.equal(r.sequence, 1, `${r.id} is its capability's first record`);
  }
});

test('amend writes a new version, keeps the old one intact, and updates the current value', () => {
  let s = initialState();
  const before = current(s, RR, 'contract');
  const value = { ...before, mustNever: [...before.mustNever, 'Issue a refund while a fraud review is open.'] };
  s = amend(s, RR, 'contract', { value, author: 'maya', reason: 'Close the gap found in INC-01.' });
  const v2 = currentVersion(s, RR, 'contract');
  assert.equal(v2.version, 2);
  assert.equal(v2.author, 'maya');
  assert.equal(v2.reason, 'Close the gap found in INC-01.');
  assert.deepEqual(v2.before, before);
  assert.deepEqual(v2.value, value);
  assert.deepEqual(current(s, RR, 'contract'), value, 'current contract is the latest version');
  const v1 = versionList(s, RR, 'contract')[0];
  assert.equal(v1.version, 1);
  assert.deepEqual(v1.value, before, 'version 1 is untouched');
  // The seed object was not mutated.
  assert.equal(seed.capabilities.find((c) => c.id === RR).contract.mustNever.length, 4);
  // Other capabilities and other kinds are untouched.
  assert.equal(currentVersion(s, TC, 'contract').version, 1);
  assert.equal(currentVersion(s, RR, 'criteria').version, 1);
});

test('amend covers criteria, requirements, risk and stakeholders, and rejects bad input', () => {
  let s = initialState();
  s = amend(s, RR, 'requirements', { value: current(s, RR, 'requirements').map((r) => (r.id === 'high-value' ? { ...r, text: 'Minimum 30 high-value refund cases' } : r)), author: 'priya', reason: 'Lower the bar.' });
  assert.equal(currentVersion(s, RR, 'requirements').version, 2);
  assert.equal(current(s, RR, 'requirements').find((r) => r.id === 'high-value').text, 'Minimum 30 high-value refund cases');
  assert.equal(readiness(s, RR).unmet[0].text, 'Minimum 30 high-value refund cases', 'readiness reads the latest version');
  s = amend(s, RR, 'criteria', { value: current(s, RR, 'criteria').slice(0, 3), author: 'maya', reason: 'Trim.' });
  assert.equal(current(s, RR, 'criteria').length, 3);
  s = amend(s, RR, 'risk', { value: { ...current(s, RR, 'risk'), impact: 'Medium' }, author: 'daniel', reason: 'Reassessed.' });
  assert.equal(current(s, RR, 'risk').impact, 'Medium');
  s = amend(s, RR, 'stakeholders', { value: [], author: 'maya', reason: 'Reset positions.' });
  assert.deepEqual(current(s, RR, 'stakeholders'), []);
  assert.throws(() => amend(s, RR, 'contract', { value: {}, author: 'maya', reason: '' }), /reason/);
  assert.throws(() => amend(s, RR, 'contract', { value: {}, author: 'nobody', reason: 'x' }), /author/);
  assert.throws(() => amend(s, RR, 'pilot', { value: {}, author: 'maya', reason: 'x' }), /Unknown versioned/);
  assert.throws(() => amend(s, 'no-such', 'contract', { value: {}, author: 'maya', reason: 'x' }), /Unknown capability/);
});

test('afterEvidence is set from whether evidence existed, and decides whether the amendment is surfaced', () => {
  let [s, bid] = blankCap();
  assert.equal(performanceResultsSeen(s, RR), true);
  assert.equal(performanceResultsSeen(s, TC), true, 'ticket classification has a measured item');
  assert.equal(performanceResultsSeen(s, bid), false);
  s = amend(s, bid, 'risk', { value: { ...current(s, bid, 'risk'), impact: 'Medium' }, author: 'priya', reason: 'Tighten before any evidence.' });
  assert.equal(currentVersion(s, bid, 'risk').afterEvidence, false);
  assert.equal(s.activity[0].kind, 'amendment');
  assert.equal(s.activity[0].surfaced, false, 'an amendment before evidence is recorded but not surfaced');
  assert.equal(s.activity[0].capabilityId, bid);
  s = amend(s, RR, 'criteria', { value: current(s, RR, 'criteria'), author: 'maya', reason: 'Re-saved after the pilot.' });
  assert.equal(currentVersion(s, RR, 'criteria').afterEvidence, true);
  assert.equal(s.activity[0].surfaced, true, 'an amendment after evidence is surfaced');
  assert.match(s.activity[0].body, /after evidence existed/);
});

test('decision records save the version numbers in force at the time', () => {
  let s = initialState();
  s = amend(s, RR, 'contract', { value: current(s, RR, 'contract'), author: 'maya', reason: 'Re-confirmed.' });
  s = amend(s, RR, 'contract', { value: current(s, RR, 'contract'), author: 'maya', reason: 'Re-confirmed again.' });
  s = amend(s, RR, 'criteria', { value: current(s, RR, 'criteria'), author: 'maya', reason: 'Re-confirmed.' });
  s = authorize(selectDecision(s, RR, 'expand-limits'), RR);
  const rec = s.decisionRecords[s.decisionRecords.length - 1];
  assert.deepEqual(rec.versions, { contract: 3, criteria: 2, requirements: 1, risk: 1, stakeholders: 1 });
  // A later amendment does not change the record.
  s = amend(s, RR, 'contract', { value: current(s, RR, 'contract'), author: 'maya', reason: 'Later.' });
  assert.equal(s.decisionRecords[s.decisionRecords.length - 1].versions.contract, 3);
  // The automatic restriction record names versions too.
  s = simulateBreach(s, RR);
  assert.deepEqual(s.decisionRecords[s.decisionRecords.length - 1].versions, { contract: 4, criteria: 2, requirements: 1, risk: 1, stakeholders: 1 });
});

test('amend is available through the store and persists', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const store = createStore({ storage });
  store.dispatch('amend', RR, 'risk', { value: { ...current(store.get(), RR, 'risk'), impact: 'Medium' }, author: 'daniel', reason: 'Reassessed.' });
  const again = createStore({ storage });
  assert.equal(currentVersion(again.get(), RR, 'risk').version, 2);
  assert.equal(current(again.get(), RR, 'risk').impact, 'Medium');
});

// ---------------------------------------------------------------------------
// Default activity view plus Full history (#3)
// ---------------------------------------------------------------------------

test('"after evidence" means performance results were seen, not opinions', () => {
  let [s, id] = blankCap();
  const item = (source, status) => ({ id: 'X', source, metric: 'm', value: 'v', status, risk: 'Low', segment: 'All', date: seed.TODAY, detail: '', link: '' });
  const withEvidence = (st, items) => ({ ...st, capabilityData: { ...st.capabilityData, [id]: { ...capData(st, id), evidence: items } } });
  assert.equal(performanceResultsSeen(s, id), false);
  // A stakeholder assessment alone does not count.
  assert.equal(performanceResultsSeen(withEvidence(s, [item('Stakeholder assessment', 'watch')]), id), false);
  // User feedback alone does not count either.
  assert.equal(performanceResultsSeen(withEvidence(s, [item('User feedback', 'pass')]), id), false);
  // A measured item does.
  assert.equal(performanceResultsSeen(withEvidence(s, [item('Operational metrics', 'pass')]), id), true);
  // So does a recorded test run with no evidence items at all.
  const ran = { ...s, capabilityData: { ...s.capabilityData, [id]: { ...capData(s, id), testRun: { status: 'not-run', lastRun: '2026-10-01', completed: [] } } } };
  assert.equal(performanceResultsSeen(ran, id), true);
  // And a pilot.
  const piloted = { ...s, capabilityData: { ...s.capabilityData, [id]: { ...capData(s, id), pilot: { cases: 10, segments: [] } } } };
  assert.equal(performanceResultsSeen(piloted, id), true);
});

test('default activity shows surfaced events; full history shows everything; filters apply to both', () => {
  const s = initialState();
  const dflt = activityEvents(s);
  const full = activityEvents(s, { full: true });
  assert.equal(full.length, s.activity.length);
  assert.equal(dflt.length, full.length - 1);
  assert.ok(!dflt.some((e) => e.id === 'ACT-03'));
  assert.ok(full.some((e) => e.id === 'ACT-03'));
  // Mitigations and stakeholder reviews stay visible by default.
  assert.ok(dflt.some((e) => e.kind === 'mitigation'));
  assert.ok(dflt.some((e) => e.kind === 'review'));
  assert.ok(!SURFACED_KINDS.has('criteria'));
  assert.deepEqual(activityEvents(s, { kind: 'authority' }).map((e) => e.id), ['ACT-05', 'ACT-04', 'ACT-02']);
  assert.deepEqual(activityEvents(s, { capabilityId: TC }).map((e) => e.id), ['ACT-02']);
  assert.deepEqual(activityEvents(s, { full: true, kind: 'criteria', capabilityId: RR }).map((e) => e.id), ['ACT-03']);
  assert.deepEqual(activityEvents(s, { kind: 'criteria' }), []);
});

test('amendments before evidence appear only in full history; after evidence they appear by default', () => {
  let [s, bid] = blankCap();
  s = amend(s, bid, 'risk', { value: { ...current(s, bid, 'risk'), impact: 'Medium' }, author: 'priya', reason: 'Reassessed.' });
  assert.equal(activityEvents(s).filter((e) => e.kind === 'amendment').length, 0);
  assert.equal(activityEvents(s, { full: true }).filter((e) => e.kind === 'amendment').length, 1);
  s = amend(s, RR, 'requirements', { value: current(s, RR, 'requirements'), author: 'maya', reason: 'Re-confirmed.' });
  assert.equal(activityEvents(s).filter((e) => e.kind === 'amendment').length, 1);
  const ev = activityEvents(s)[0];
  assert.equal(ev.objectKind, 'requirements');
  assert.equal(versionFor(s, RR, 'requirements', ev.version).version, 2);
  assert.equal(versionFor(s, RR, 'requirements', 9), null);
});

test('a decision relying on criteria amended after evidence is flagged; earlier and later records are not', () => {
  let s = initialState();
  // The seeded record AC-02 relied on v1 of everything: no note.
  assert.deepEqual(amendmentsAfterEvidenceFor(s, s.decisionRecords[1]), []);
  s = amend(s, RR, 'criteria', { value: current(s, RR, 'criteria').map((c) => (c.id === 'quality' ? { ...c, target: '≥ 90% correct decisions' } : c)), author: 'priya', reason: 'Lower the quality bar.' });
  s = authorize(selectDecision(s, RR, 'expand-limits'), RR);
  const rec = s.decisionRecords[s.decisionRecords.length - 1];
  const flagged = amendmentsAfterEvidenceFor(s, rec);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].kind, 'criteria');
  assert.equal(flagged[0].version, 2);
  assert.equal(flagged[0].author, 'priya');
  // A later amendment (v3) is not attributed to this record.
  s = amend(s, RR, 'criteria', { value: current(s, RR, 'criteria'), author: 'maya', reason: 'Later.' });
  assert.equal(amendmentsAfterEvidenceFor(s, rec).length, 1);
  // The seeded records still carry no note.
  assert.deepEqual(amendmentsAfterEvidenceFor(s, s.decisionRecords[1]), []);
  // A record without versions (pre-#2 shape) yields nothing rather than throwing.
  assert.deepEqual(amendmentsAfterEvidenceFor(s, { capabilityId: RR }), []);
});

test('diffValues reports added, removed and changed entries with readable paths', () => {
  const before = { may: ['a', 'b'], mustNever: ['x'], impact: 'High' };
  const after = { may: ['a', 'c'], mustNever: ['x'], impact: 'Medium' };
  const d = diffValues(before, after);
  assert.deepEqual(d.map((c) => [c.path, c.type]), [['may', 'removed'], ['may', 'added'], ['impact', 'changed']]);
  assert.equal(d[0].before, 'b');
  assert.equal(d[1].after, 'c');
  const keyed = diffValues([{ id: 'q', text: 'old' }, { id: 'r', text: 'r' }], [{ id: 'q', text: 'new' }, { id: 's', text: 's' }]);
  assert.deepEqual(keyed.map((c) => [c.path, c.type]), [['old › text', 'changed'], ['r', 'removed'], ['s', 'added']]);
  assert.deepEqual(diffValues(before, before), []);
});

// ---------------------------------------------------------------------------
// Latest version is the single source of truth (#4, PR A)
// ---------------------------------------------------------------------------

test('views read the contract, risk, criteria, requirements and stakeholders only through selectors', () => {
  const dir = new URL('../src/views', import.meta.url).pathname;
  // Allowed: a decision record's own version numbers, an evidence item's risk
  // level, the defaults object, and the versions-in-force number map.
  const allowed = [/\bx\.versions\b/g, /\brecord\.versions\b/g, /\be\.risk\b/g, /\bdefaults\.(criteria|requirements)\b/g, /\bv\.(criteria|requirements)\b/g, /\b(p\.value|p\.base|before)\.(contract|criteria|requirements|stakeholders)\b/g, /versionsInForce\([^)]*\)\.(contract|criteria|requirements|risk|stakeholders)\b/g];
  const forbidden = /\.(contract|criteria|requirements|stakeholders|versions)\b|\b(cap|c|capability)\.risk\b/g;
  const offenders = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    let src = readFileSync(`${dir}/${f}`, 'utf8');
    for (const a of allowed) src = src.replace(a, '');
    for (const m of src.matchAll(forbidden)) offenders.push(`${f}: ${m[0]}`);
  }
  assert.deepEqual(offenders, []);
});

test('the capability object carries no versioned content, and current() falls back safely', () => {
  const s = initialState();
  for (const c of s.capabilities) {
    assert.deepEqual(Object.keys(c).filter((k) => ['contract', 'risk', 'criteria', 'requirements', 'stakeholders', 'versions'].includes(k)), []);
  }
  assert.deepEqual(current(s, 'no-such', 'contract'), { may: [], mustAsk: [], mustNever: [], escalation: [], autoRestriction: [] });
  assert.deepEqual(current(s, 'no-such', 'criteria'), []);
  assert.equal(current(s, 'no-such', 'risk').impact, '');
  assert.deepEqual(versionList(s, 'no-such', 'contract'), []);
});

// ---------------------------------------------------------------------------
// Add capability, acting as (#4, PR B)
// ---------------------------------------------------------------------------

const LOW_RISK = { impact: 'Low', reversibility: 'Easy to reverse', exposure: 'Internal only', failureTypes: ['Wrong answer'] };

test('adding a capability writes its first record with real dates, risk v1, and nothing above Level 1', () => {
  let s = initialState();
  const before = s.decisionRecords.length;
  s = addCapability(s, { name: 'Order status lookup', summary: 'Answers where an order is.', owner: 'priya', risk: LOW_RISK, startingLevel: 1, by: 'priya' });
  const c = s.capabilities[s.capabilities.length - 1];
  assert.equal(c.id, 'order-status-lookup');
  assert.equal(c.name, 'Order status lookup');
  assert.deepEqual(c.authority, { level: 1, limited: false });
  assert.equal(c.status, 'setup');
  assert.equal(c.definedOn, seed.TODAY);
  assert.equal(lastEvaluated(s, c.id), seed.TODAY, 'no evidence yet: falls back to the defined-on date, which is today');
  assert.equal(lastDecisionId(s, c.id), s.decisionRecords[s.decisionRecords.length - 1].id);
  assert.equal(c.added, true);
  assert.deepEqual(Object.keys(c).filter((k) => ['contract', 'risk', 'criteria'].includes(k)), []);
  // Risk profile is version 1; the other objects have no version until authored.
  assert.equal(versionList(s, c.id, 'risk').length, 1);
  assert.equal(current(s, c.id, 'risk').impact, 'Low');
  assert.equal(currentVersion(s, c.id, 'risk').date, seed.TODAY);
  assert.equal(versionList(s, c.id, 'contract').length, 0);
  assert.deepEqual(current(s, c.id, 'contract').may, []);
  assert.deepEqual(readiness(s, c.id), { met: 0, total: 0, unmet: [] });
  // Record #01 for this capability.
  assert.equal(s.decisionRecords.length, before + 1);
  const rec = s.decisionRecords[s.decisionRecords.length - 1];
  assert.equal(rec.sequence, 1);
  assert.equal(rec.capabilityId, c.id);
  assert.equal(rec.previous, null);
  assert.deepEqual(rec.next, { level: 1, limited: false });
  assert.equal(rec.option, 'define');
  assert.equal(rec.authorizedBy, 'priya');
  assert.equal(rec.owner, 'priya');
  assert.equal(rec.date, seed.TODAY);
  assert.deepEqual(rec.versions, { contract: 0, criteria: 0, requirements: 0, risk: 1, stakeholders: 0 });
  assert.equal(s.activity[0].kind, 'authority');
  assert.equal(s.activity[0].capabilityId, c.id);
  // Starting above Level 1 is refused.
  assert.throws(() => addCapability(initialState(), { name: 'X', owner: 'priya', risk: LOW_RISK, startingLevel: 2 }), /Level 0 or Level 1/);
  assert.throws(() => addCapability(initialState(), { name: '', owner: 'priya', risk: LOW_RISK, startingLevel: 0 }), /name/);
  assert.throws(() => addCapability(initialState(), { name: 'X', owner: 'nobody', risk: LOW_RISK, startingLevel: 0 }), /owner/);
  assert.throws(() => addCapability(initialState(), { name: 'X', owner: 'priya', risk: { impact: 'High' }, startingLevel: 0 }), /reversibility/);
  // The seeded demo is untouched.
  assert.equal(decisionRequired(s, RR), true);
  assert.equal(focusCapability(s).id, RR);
});

test('whoever is acting is recorded as the authorizer, alongside the owner when they differ', () => {
  const s = addCapability(initialState(), { name: 'Order status lookup', owner: 'priya', risk: LOW_RISK, startingLevel: 0, by: 'daniel' });
  const rec = s.decisionRecords[s.decisionRecords.length - 1];
  assert.equal(rec.owner, 'priya');
  assert.equal(rec.authorizedBy, 'daniel');
  assert.match(s.activity[0].body, /added by Daniel Okafor \(owner: Priya Natarajan\)/);
  // Later records carry the owner too.
  const t = authorize(selectDecision(initialState(), RR, 'hold'), RR, { by: 'daniel' });
  const later = t.decisionRecords[t.decisionRecords.length - 1];
  assert.equal(later.owner, 'maya');
  assert.equal(later.authorizedBy, 'daniel');
});

test('"not delegated, by design" needs a rationale and is recorded as a decision', () => {
  assert.throws(() => addCapability(initialState(), { name: 'Account deletion', owner: 'daniel', risk: { ...LOW_RISK, impact: 'High' }, notDelegated: true, rationale: 'short' }), /rationale/);
  const s = addCapability(initialState(), { name: 'Account deletion', owner: 'daniel', risk: { ...LOW_RISK, impact: 'High', reversibility: 'Difficult to reverse' }, notDelegated: true, rationale: 'Deletion is irreversible and rare. A person does it.', by: 'daniel' });
  const c = s.capabilities[s.capabilities.length - 1];
  assert.equal(c.status, 'not-delegated');
  assert.deepEqual(c.authority, { level: 0, limited: false });
  const rec = s.decisionRecords[s.decisionRecords.length - 1];
  assert.equal(rec.option, 'not-delegated');
  assert.equal(rec.rationale, 'Deletion is irreversible and rare. A person does it.');
});

test('duplicate names get distinct ids; the second record for a capability is sequence 2', () => {
  let s = addCapability(initialState(), { name: 'Ticket classification', owner: 'priya', risk: LOW_RISK, startingLevel: 0 });
  assert.equal(s.capabilities[s.capabilities.length - 1].id, 'ticket-classification-2');
  assert.equal(slugify('  Draft & send replies!! '), 'draft-send-replies');
  // Authorize a hold on the seeded refund capability: that is its second record.
  s = authorize(selectDecision(s, RR, 'hold'), RR);
  assert.equal(s.decisionRecords[s.decisionRecords.length - 1].sequence, 2);
});

test('vague-name warning is non-blocking and only fires on process words or two actions', () => {
  assert.match(vagueNameWarning('Handle refunds'), /whole process/);
  assert.match(vagueNameWarning('Manage returns'), /whole process/);
  assert.match(vagueNameWarning('Draft and send replies'), /two actions/);
  assert.equal(vagueNameWarning('Refund recommendation'), null);
  assert.equal(vagueNameWarning(''), null);
  // The store still accepts a vague name.
  const s = addCapability(initialState(), { name: 'Handle refunds', owner: 'priya', risk: LOW_RISK, startingLevel: 0 });
  assert.equal(s.capabilities[s.capabilities.length - 1].name, 'Handle refunds');
});

test('acting as: defaults to the capability owner, can be overridden, and is the author on records', () => {
  let s = initialState();
  assert.equal(actor(s, RR), 'maya');
  assert.equal(actor(s, TC), 'priya');
  assert.equal(actor(s), 'maya', 'no capability in context: the focus capability owner');
  s = setActingAs(s, 'daniel');
  assert.equal(actor(s, RR), 'daniel');
  assert.equal(actor(s, TC), 'daniel');
  assert.throws(() => setActingAs(s, 'nobody'), /Unknown person/);
  s = authorize(selectDecision(s, RR, 'expand-limits'), RR, { by: actor(s, RR) });
  assert.equal(s.decisionRecords[s.decisionRecords.length - 1].authorizedBy, 'daniel');
  s = setActingAs(s, null);
  assert.equal(actor(s, TC), 'priya');
  assert.equal(s.actingAs, null);
});

test('reset removes added capabilities and the acting-as choice', () => {
  let s = addCapability(initialState(), { name: 'Order status lookup', owner: 'priya', risk: LOW_RISK, startingLevel: 1 });
  s = setActingAs(s, 'elena');
  assert.equal(s.capabilities.length, 6);
  s = reset(s);
  assert.equal(s.capabilities.length, 5);
  assert.equal(s.actingAs, null);
  assert.deepEqual(s, initialState());
});

// ---------------------------------------------------------------------------
// Contract builder (#5)
// ---------------------------------------------------------------------------

const FIN_RISK = { impact: 'High', reversibility: 'Recoverable with effort', exposure: 'Financial / consequential' };
function withNewCap(risk = FIN_RISK, name = 'Refund execution under $50', summary = 'Executes small refunds to the original card.') {
  const s = addCapability(initialState(), { name, summary, owner: 'priya', risk, startingLevel: 0 });
  return [s, s.capabilities[s.capabilities.length - 1].id];
}
function reviewAll(s, id, decision = 'accept') {
  for (const l of capData(s, id).contractDraft.lines.filter((l) => l.status === 'pending')) s = reviewSuggestion(s, id, l.id, { decision });
  return s;
}
function confirmAll(s, id) {
  for (const k of SECTION_KEYS) s = confirmSection(s, id, k, true);
  return s;
}

test('templates are picked by the risk profile and suggestions by keywords, deterministically', () => {
  const low = pickTemplate({ impact: 'Low', exposure: 'Internal only', reversibility: 'Easy to reverse' });
  const fin = pickTemplate(FIN_RISK);
  const irr = pickTemplate({ impact: 'High', exposure: 'Customer-facing', reversibility: 'Difficult to reverse' });
  assert.equal(low.id, 'low-internal');
  assert.equal(fin.id, 'high-financial');
  assert.equal(irr.id, 'high-customer-irreversible');
  assert.ok(fin.sections.mustAsk.some((t) => /fraud/i.test(t)));
  assert.ok(irr.sections.mustAsk.some((t) => /cannot be undone/.test(t)));
  assert.ok(fin.sections.autoRestriction.every((t) => /\d/.test(t)), 'template restriction rules carry numbers');
  const a = suggestLines('Refund execution', 'Executes refunds to the original card.');
  const b = suggestLines('Refund execution', 'Executes refunds to the original card.');
  assert.deepEqual(a, b);
  assert.ok(a.some((x) => x.section === 'mustNever' && /different payment method/.test(x.text)));
  assert.ok(a.every((x) => x.because === 'refund'));
  assert.deepEqual(suggestLines('Quarterly report', 'Nothing matches here.'), []);
  const ids = new Set(a.map((x) => `${x.section}|${x.text}`));
  assert.equal(ids.size, a.length, 'no duplicate suggestions');
});

test('starting a draft builds template lines (accepted) plus AI suggestions (pending), and refuses when a contract exists', () => {
  let [s, id] = withNewCap();
  s = startContractDraft(s, id, { by: 'priya' });
  const draft = capData(s, id).contractDraft;
  assert.equal(draft.templateId, 'high-financial');
  const tpl = draft.lines.filter((l) => l.source === 'template');
  const ai = draft.lines.filter((l) => l.source === 'ai');
  assert.ok(tpl.length > 10 && tpl.every((l) => l.status === 'accepted'));
  assert.ok(ai.length >= 4 && ai.every((l) => l.status === 'pending'));
  assert.deepEqual(Object.values(draft.confirmed), [false, false, false, false, false]);
  assert.equal(s.activity[0].kind, 'contract-draft');
  assert.equal(s.activity[0].surfaced, false, 'starting a draft is a setup-type event');
  // Starting again is a no-op while a draft is open.
  assert.equal(startContractDraft(s, id), s);
  // The seeded refund capability already has a contract.
  assert.throws(() => startContractDraft(initialState(), RR), /already has a finalized contract/);
});

test('suggestions are reviewed one at a time; edits keep the original; rejections are kept', () => {
  let [s, id] = withNewCap();
  s = startContractDraft(s, id);
  const ai = capData(s, id).contractDraft.lines.filter((l) => l.source === 'ai');
  s = reviewSuggestion(s, id, ai[0].id, { decision: 'accept' });
  assert.equal(capData(s, id).contractDraft.lines.filter((l) => l.status === 'pending').length, ai.length - 1, 'accepting one leaves the rest pending');
  s = reviewSuggestion(s, id, ai[1].id, { decision: 'edit', text: 'Refunds or credits over $75.' });
  const edited = capData(s, id).contractDraft.lines.find((l) => l.id === ai[1].id);
  assert.equal(edited.status, 'edited');
  assert.equal(edited.text, 'Refunds or credits over $75.');
  assert.equal(edited.original, ai[1].text);
  s = reviewSuggestion(s, id, ai[2].id, { decision: 'reject' });
  assert.equal(capData(s, id).contractDraft.lines.find((l) => l.id === ai[2].id).status, 'rejected');
  assert.ok(!draftValue(capData(s, id).contractDraft)[ai[2].section].includes(ai[2].text), 'rejected text is not in the contract');
  assert.throws(() => reviewSuggestion(s, id, ai[3].id, { decision: 'approve' }), /Unknown decision/);
  assert.throws(() => reviewSuggestion(s, id, ai[3].id, { decision: 'edit', text: '  ' }), /needs text/);
  const tpl = capData(s, id).contractDraft.lines.find((l) => l.source === 'template');
  assert.throws(() => reviewSuggestion(s, id, tpl.id, { decision: 'accept' }), /Only AI suggestions/);
  // A section cannot be confirmed while it has pending suggestions.
  const pendingSection = capData(s, id).contractDraft.lines.find((l) => l.status === 'pending').section;
  assert.throws(() => confirmSection(s, id, pendingSection, true), /Review every suggestion/);
});

test('lines can be added, edited and removed; any change unconfirms the section', () => {
  let [s, id] = withNewCap();
  s = startContractDraft(s, id);
  s = reviewAll(s, id);
  s = confirmSection(s, id, 'may', true);
  assert.equal(capData(s, id).contractDraft.confirmed.may, true);
  s = addContractLine(s, id, 'may', 'Read the refund policy effective on the order date.');
  assert.equal(capData(s, id).contractDraft.confirmed.may, false, 'adding a line unconfirms');
  assert.ok(draftValue(capData(s, id).contractDraft).may.includes('Read the refund policy effective on the order date.'));
  const tpl = capData(s, id).contractDraft.lines.find((l) => l.source === 'template' && l.section === 'mustNever');
  s = editContractLine(s, id, tpl.id, tpl.text + ' Ever.');
  assert.equal(capData(s, id).contractDraft.lines.find((l) => l.id === tpl.id).status, 'edited');
  s = removeContractLine(s, id, tpl.id);
  assert.equal(capData(s, id).contractDraft.lines.find((l) => l.id === tpl.id).status, 'removed');
  const ai = capData(s, id).contractDraft.lines.find((l) => l.source === 'ai');
  assert.throws(() => removeContractLine(s, id, ai.id), /Reject a suggestion/);
  assert.throws(() => addContractLine(s, id, 'nope', 'x'), /Unknown section/);
  assert.throws(() => addContractLine(s, id, 'may', ''), /needs text/);
});

test('software checks: empty hard limits above Low, contradictions, rules without a number or window, financial without a value limit', () => {
  let [s, id] = withNewCap();
  s = startContractDraft(s, id);
  s = reviewAll(s, id, 'reject');
  // Remove every "must never" and every restriction rule.
  for (const l of capData(s, id).contractDraft.lines.filter((l) => ['mustNever', 'autoRestriction'].includes(l.section) && l.source === 'template')) s = removeContractLine(s, id, l.id);
  let ids = contractChecks(s, id).map((c) => c.id);
  assert.ok(ids.includes('empty-never'));
  assert.ok(ids.includes('empty-auto'));
  // A rule with no number or window.
  s = addContractLine(s, id, 'autoRestriction', 'Too many errors returns the capability to Draft.');
  assert.ok(contractChecks(s, id).some((c) => c.id.startsWith('rule-') && /number/.test(c.text)));
  // A contradiction.
  s = addContractLine(s, id, 'may', 'Override a fraud restriction.');
  s = addContractLine(s, id, 'mustNever', 'Override a fraud restriction.');
  assert.ok(contractChecks(s, id).some((c) => c.id.startsWith('contra-')));
  // Financial without a value limit: remove template lines that mention value, and the "over $100" suggestion was rejected.
  for (const l of capData(s, id).contractDraft.lines.filter((l) => /value limit|above the value/i.test(l.text) && l.status !== 'removed' && l.source !== 'ai')) s = removeContractLine(s, id, l.id);
  assert.ok(contractChecks(s, id).some((c) => c.id === 'no-value-limit'));
  // A limit that only appears under "must never" does not count.
  s = addContractLine(s, id, 'mustNever', 'Issue a refund above $500.');
  assert.ok(contractChecks(s, id).some((c) => c.id === 'no-value-limit'), 'must never alone is not an operating limit');
  // A threshold under "must ask" does.
  s = addContractLine(s, id, 'mustAsk', 'Refunds over $100.');
  assert.ok(!contractChecks(s, id).some((c) => c.id === 'no-value-limit'));
  // So does a ceiling under "may".
  s = removeContractLine(s, id, capData(s, id).contractDraft.lines.find((l) => l.text === 'Refunds over $100.').id);
  assert.ok(contractChecks(s, id).some((c) => c.id === 'no-value-limit'));
  s = addContractLine(s, id, 'may', 'Issue refunds of $50 or less.');
  assert.ok(!contractChecks(s, id).some((c) => c.id === 'no-value-limit'));
  assert.equal(canFinalizeContract(s, id).ok, false);
  // Low impact, internal: empty hard limits are allowed.
  let [t, tid] = withNewCap({ impact: 'Low', reversibility: 'Easy to reverse', exposure: 'Internal only' }, 'Quarterly summary', 'Summarises the quarter.');
  t = startContractDraft(t, tid);
  for (const l of capData(t, tid).contractDraft.lines.filter((l) => ['mustNever', 'autoRestriction'].includes(l.section))) t = removeContractLine(t, tid, l.id);
  ids = contractChecks(t, tid).map((c) => c.id);
  assert.ok(!ids.includes('empty-never') && !ids.includes('empty-auto'));
});

test('finalize needs every suggestion reviewed, every section confirmed and no blocking check; it writes contract v1 with the review', () => {
  let [s, id] = withNewCap();
  s = startContractDraft(s, id);
  assert.throws(() => finalizeContract(s, id, { by: 'priya' }), /still to accept/);
  const ai = capData(s, id).contractDraft.lines.filter((l) => l.source === 'ai');
  s = reviewSuggestion(s, id, ai[0].id, { decision: 'reject' });
  for (const l of ai.slice(1)) s = reviewSuggestion(s, id, l.id, { decision: 'accept' });
  assert.throws(() => finalizeContract(s, id, { by: 'priya' }), /not yet confirmed/);
  s = confirmAll(s, id);
  assert.equal(canFinalizeContract(s, id).ok, true, JSON.stringify(contractChecks(s, id)));
  assert.throws(() => finalizeContract(s, id, {}), /named person/);
  const before = s.activity.length;
  s = finalizeContract(s, id, { by: 'daniel' });
  const v = currentVersion(s, id, 'contract');
  assert.equal(v.version, 1);
  assert.equal(v.author, 'daniel');
  assert.equal(v.date, seed.TODAY);
  assert.equal(v.afterEvidence, false);
  assert.deepEqual(Object.keys(v.value), SECTION_KEYS);
  assert.ok(v.value.mustNever.length > 0);
  assert.equal(v.review.rejected.length, 1);
  assert.equal(v.review.rejected[0].text, ai[0].text);
  assert.equal(v.review.accepted, ai.length - 1);
  assert.deepEqual(current(s, id, 'contract'), v.value);
  assert.equal(capData(s, id).contractDraft.finalizedAt, seed.TODAY);
  assert.equal(s.activity.length, before + 1);
  assert.equal(s.activity[0].kind, 'contract-finalized');
  assert.equal(s.activity[0].surfaced, true);
  // Status follows authority decisions only.
  assert.equal(getCapability(s, id).status, 'setup');
  assert.deepEqual(getCapability(s, id).authority, { level: 0, limited: false });
  // Finalized drafts are closed to edits.
  assert.throws(() => addContractLine(s, id, 'may', 'More.'), /finalized/);
  assert.throws(() => finalizeContract(s, id, { by: 'priya' }), /already finalized/);
  assert.throws(() => startContractDraft(s, id), /already has a finalized contract/);
  assert.match(contractSummary(v.value, getCapability(s, id)), /must never/);
});

test('contract builder actions are available through the store and survive reload', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const store = createStore({ storage });
  store.dispatch('addCapability', { name: 'Order status lookup', owner: 'priya', risk: { impact: 'Low', reversibility: 'Easy to reverse', exposure: 'Customer-facing' }, startingLevel: 1 });
  const id = store.get().capabilities[store.get().capabilities.length - 1].id;
  store.dispatch('startContractDraft', id, { by: 'priya' });
  const again = createStore({ storage });
  assert.ok(capData(again.get(), id).contractDraft);
  assert.equal(capData(again.get(), id).contractDraft.templateId, 'low-customer');
});

// ---------------------------------------------------------------------------
// Success criteria and evidence requirements (#6)
// ---------------------------------------------------------------------------

test('defaults come from the risk profile and say where they came from', () => {
  const high = defaultCriteria(FIN_RISK);
  const low = defaultCriteria({ impact: 'Low', exposure: 'Internal only', reversibility: 'Easy to reverse' });
  assert.equal(high.find((c) => c.id === 'quality').target, '≥ 92% correct decisions');
  assert.equal(low.find((c) => c.id === 'quality').target, '≥ 85% correct decisions');
  assert.equal(high.find((c) => c.id === 'quality').source, 'Default for High impact');
  assert.ok(high.every((c) => c.source));
  assert.ok(defaultCriteria({ ...FIN_RISK, exposure: 'Customer-facing' }).some((c) => c.id === 'customer-harm'));
  const req = defaultRequirements(FIN_RISK);
  assert.equal(req.find((r) => r.id === 'min-cases').text, 'Minimum 200 pilot cases');
  assert.ok(req.some((r) => r.id === 'high-value' && r.source === 'Default for financial exposure'));
  assert.ok(!defaultRequirements({ impact: 'Low', exposure: 'Internal only' }).some((r) => r.id === 'high-value'));
  assert.ok(defaultRequirements({ impact: 'High', exposure: 'Customer-facing', reversibility: 'Difficult to reverse' }).some((r) => r.id === 'reversal'));
  const [s, id] = withNewCap();
  assert.deepEqual(defaultsFor(s, id).criteria, high);
});

test('saving writes v1 of both; saving again before the lock writes v2; readiness reads the saved requirements', () => {
  let [s, id] = withNewCap();
  assert.equal(criteriaSaved(s, id), false);
  const d = defaultsFor(s, id);
  assert.throws(() => saveCriteria(s, id, { criteria: d.criteria, requirements: d.requirements }), /named person/);
  assert.throws(() => saveCriteria(s, id, { criteria: [], requirements: d.requirements, by: 'priya' }), /at least one success criterion/);
  assert.throws(() => saveCriteria(s, id, { criteria: [{ name: 'Quality', target: '' }], requirements: d.requirements, by: 'priya' }), /needs a name and a target/);
  assert.throws(() => saveCriteria(s, id, { criteria: d.criteria, requirements: [{ text: ' ' }], by: 'priya' }), /needs text/);
  s = saveCriteria(s, id, { criteria: d.criteria, requirements: d.requirements, by: 'priya' });
  assert.equal(criteriaSaved(s, id), true);
  assert.equal(criteriaLocked(s, id), false);
  assert.deepEqual(versionsInForce(s, id), { contract: 0, criteria: 1, requirements: 1, risk: 1, stakeholders: 0 });
  const saved = current(s, id, 'criteria');
  assert.equal(saved.find((c) => c.id === 'quality').current, 'Not yet measured');
  assert.equal(saved.find((c) => c.id === 'quality').status, 'pending');
  assert.equal(readiness(s, id).total, d.requirements.length);
  assert.equal(readiness(s, id).met, 0);
  assert.equal(s.activity[0].kind, 'criteria-saved');
  assert.equal(s.activity[0].surfaced, false);
  assert.equal(currentVersion(s, id, 'criteria').afterEvidence, false);
  // Edit before the lock: new versions, nothing overwritten.
  s = saveCriteria(s, id, { criteria: [...saved, { name: 'Refund cost', target: 'No unexplained increase above 5%' }], requirements: current(s, id, 'requirements'), by: 'priya', reason: 'Finance asked for a cost line.' });
  assert.equal(versionsInForce(s, id).criteria, 2);
  assert.equal(versionList(s, id, 'criteria')[0].value.length, saved.length);
  assert.equal(current(s, id, 'criteria').find((c) => c.name === 'Refund cost').source, 'Written by hand');
  assert.equal(currentVersion(s, id, 'criteria').reason, 'Finance asked for a cost line.');
});

test('the run gate: no run until criteria are saved; the first run locks them and surfaces one event', () => {
  // A new capability with scenarios borrowed from the seed.
  let [s, id] = withNewCap({ impact: 'Low', reversibility: 'Easy to reverse', exposure: 'Internal only' }, 'Ticket tagging', 'Adds routing tags.');
  s = { ...s, capabilityData: { ...s.capabilityData, [id]: { ...capData(s, id), scenarios: seed.scenarios.slice(0, 3) } } };
  assert.equal(canRunSuite(s, id).ok, false);
  assert.match(canRunSuite(s, id).reason, /Save success criteria/);
  assert.throws(() => startTestRun(s, id), /before the first test run/);
  const d = defaultsFor(s, id);
  s = saveCriteria(s, id, { criteria: d.criteria, requirements: d.requirements, by: 'priya' });
  assert.equal(canRunSuite(s, id).ok, true);
  assert.equal(criteriaLocked(s, id), false);
  s = runSuite(s, id);
  assert.equal(capData(s, id).testRun.status, 'complete');
  assert.equal(criteriaLocked(s, id), true, 'performanceResultsSeen after the first run');
  assert.equal(s.activity[0].kind, 'criteria-locked');
  assert.equal(s.activity[0].surfaced, true);
  assert.match(s.activity[0].body, /criteria v1 and evidence requirements v1/);
  // Locked: saving throws; a second run does not log the lock again.
  assert.throws(() => saveCriteria(s, id, { criteria: d.criteria, requirements: d.requirements, by: 'priya' }), /locked/);
  const before = s.activity.filter((e) => e.kind === 'criteria-locked').length;
  s = runSuite(s, id);
  assert.equal(s.activity.filter((e) => e.kind === 'criteria-locked').length, before);
  // A capability with no scenarios cannot run regardless.
  assert.equal(canRunSuite(initialState(), TC).ok, false);
  assert.match(canRunSuite(initialState(), TC).reason, /No scenarios/);
});

test('the seeded refund capability is already locked and its demo run logs no lock event', () => {
  let s = initialState();
  assert.equal(criteriaLocked(s, RR), true);
  assert.throws(() => saveCriteria(s, RR, { criteria: current(s, RR, 'criteria'), requirements: current(s, RR, 'requirements'), by: 'maya' }), /locked/);
  s = runSuite(s);
  assert.equal(s.activity.filter((e) => e.kind === 'criteria-locked').length, 0);
  assert.equal(s.activity[0].kind, 'test');
});

test('saveCriteria is available through the store', () => {
  const store = createStore({});
  store.dispatch('addCapability', { name: 'Order status lookup', owner: 'priya', risk: { impact: 'Low', reversibility: 'Easy to reverse', exposure: 'Customer-facing' }, startingLevel: 1 });
  const id = store.get().capabilities[store.get().capabilities.length - 1].id;
  const d = defaultsFor(store.get(), id);
  store.dispatch('saveCriteria', id, { criteria: d.criteria, requirements: d.requirements, by: 'priya' });
  assert.equal(criteriaSaved(store.get(), id), true);
});

test('loosening or removing a risk-derived default needs a reason, stored on the version; core rows cannot be removed; one event per save', () => {
  let [s, id] = withNewCap();
  const d = defaultsFor(s, id);
  const looser = d.criteria.map((c) => (c.id === 'quality' ? { ...c, target: '≥ 88% correct decisions' } : c));
  assert.throws(() => saveCriteria(s, id, { criteria: looser, requirements: d.requirements, by: 'priya' }), /needs a short reason/);
  assert.throws(() => saveCriteria(s, id, { criteria: looser, requirements: d.requirements, by: 'priya', reason: 'ok' }), /needs a short reason/, 'a reason must be more than a word');
  // Tightening needs no reason.
  const tighter = d.criteria.map((c) => (c.id === 'quality' ? { ...c, target: '≥ 95% correct decisions' } : c));
  assert.doesNotThrow(() => saveCriteria(s, id, { criteria: tighter, requirements: d.requirements, by: 'priya' }));
  // Core rows can be adjusted but not removed.
  assert.throws(() => saveCriteria(s, id, { criteria: d.criteria.filter((c) => c.id !== 'severe-errors'), requirements: d.requirements, by: 'priya', reason: 'Long enough reason.' }), /Core rows can be adjusted but not removed: a severe-error threshold/);
  assert.throws(() => saveCriteria(s, id, { criteria: d.criteria, requirements: d.requirements.filter((r) => r.id !== 'min-cases'), by: 'priya', reason: 'Long enough reason.' }), /a minimum case count/);
  assert.deepEqual(CORE_CRITERIA, ['quality', 'severe-errors']);
  assert.deepEqual(CORE_REQUIREMENTS, ['min-cases']);
  // Removing a non-core default and loosening a count, with a reason: stored on each version.
  const before = s.activity.length;
  const fewer = d.requirements.filter((r) => r.id !== 'high-value').map((r) => (r.id === 'min-cases' ? { ...r, text: 'Minimum 150 pilot cases' } : r));
  s = saveCriteria(s, id, { criteria: looser, requirements: fewer, by: 'priya', reason: 'Pilot volume is small; agreed with Risk.' });
  assert.equal(s.activity.length - before, 1, 'one event per save');
  assert.equal(s.activity[0].kind, 'criteria-saved');
  assert.match(s.activity[0].body, /criteria v1, requirements v1/);
  assert.match(s.activity[0].body, /loosened or removed: Pilot volume is small/);
  const cv = currentVersion(s, id, 'criteria');
  assert.deepEqual(cv.deviations, [{ id: 'quality', change: 'loosened', from: '≥ 92% correct decisions', to: '≥ 88% correct decisions', label: 'Quality' }]);
  assert.equal(cv.reason, 'Pilot volume is small; agreed with Risk.');
  const rv = currentVersion(s, id, 'requirements');
  assert.deepEqual(rv.deviations.map((x) => [x.id, x.change]), [['min-cases', 'loosened'], ['high-value', 'removed']]);
  // Detection handles both directions.
  assert.deepEqual(defaultDeviations([{ id: 'a', t: '< 2% errors' }], [{ id: 'a', t: '< 3% errors' }], (x) => x.t).map((x) => x.change), ['loosened']);
  assert.deepEqual(defaultDeviations([{ id: 'a', t: '< 2% errors' }], [{ id: 'a', t: '< 1% errors' }], (x) => x.t), []);
  assert.deepEqual(defaultDeviations([{ id: 'a', t: 'Minimum 200 cases' }], [{ id: 'a', t: 'Minimum 200 cases' }], (x) => x.t), []);
});

// ---------------------------------------------------------------------------
// Amendments after evidence need sign-off (#7)
// ---------------------------------------------------------------------------

function loosenedRequirements(s, id = RR) {
  return current(s, id, 'requirements').map((r) => (r.id === 'high-value' ? { ...r, text: 'Minimum 15 high-value refund cases' } : r));
}
const REASON = 'Volume is too low to reach 40 this quarter; 15 is what the pilot can produce.';

test('who must sign off follows the risk profile; the gate follows the lock and the pilot', () => {
  const s = initialState();
  assert.deepEqual(signoffRequirements(s, RR, 'priya'), { approvers: 2, riskRequired: true, ownerOnly: false }, 'High impact, financial');
  assert.deepEqual(signoffRequirements(s, RR, 'maya'), { approvers: 2, riskRequired: true, ownerOnly: false }, 'owner proposing on High still needs two incl. Risk');
  assert.deepEqual(signoffRequirements(s, TC, 'maya'), { approvers: 1, riskRequired: false, ownerOnly: true }, 'Low impact: the owner');
  assert.deepEqual(signoffRequirements(s, TC, 'priya'), { approvers: 1, riskRequired: false, ownerOnly: false }, 'Low impact, owner proposed: one other named stakeholder');
  assert.deepEqual(namedStakeholders(s, RR).sort(), ['daniel', 'elena', 'maya', 'priya', 'sofia'], 'owner and listed stakeholders');
  assert.deepEqual(namedStakeholders(s, TC).sort(), ['daniel', 'jonas', 'priya', 'sofia'], 'ticket classification: owner and listed people');
  const [nb, nbid] = blankCap();
  assert.deepEqual(namedStakeholders(nb, nbid).sort(), Object.keys(seed.people).sort(), 'no stakeholders listed: any named person');
  assert.equal(isRiskStakeholder(s, RR, 'daniel'), true);
  assert.equal(isRiskStakeholder(s, RR, 'elena'), false);
  // A stakeholder entry labelled Risk does not make someone Risk.
  const relabel = amend(s, RR, 'stakeholders', { value: current(s, RR, 'stakeholders').map((x) => (x.person === 'elena' ? { ...x, team: 'Risk' } : x)), author: 'maya', reason: 'Relabel for the test.' });
  assert.equal(isRiskStakeholder(relabel, RR, 'elena'), false);
  assert.equal(needsSignoff(s, RR, 'criteria'), true, 'refund criteria are locked');
  assert.equal(needsSignoff(s, TC, 'criteria'), true, 'ticket classification has seeded criteria and a measured item');
  const [b, bid] = blankCap();
  assert.equal(needsSignoff(b, bid, 'criteria'), false, 'a new capability has nothing locked');
  assert.equal(pilotStarted(s, RR), true);
  assert.equal(pilotStarted(s, 'account-closure'), false);
  assert.equal(needsSignoff(s, RR, 'contract'), true);
  assert.equal(needsSignoff(s, 'account-closure', 'contract'), false);
  assert.equal(SETTINGS.CONTRACT_EDITS_NEED_SIGNOFF_AFTER_PILOT, true, 'kept on');
  SETTINGS.CONTRACT_EDITS_NEED_SIGNOFF_AFTER_PILOT = false;
  try { assert.equal(needsSignoff(s, RR, 'contract'), false); } finally { SETTINGS.CONTRACT_EDITS_NEED_SIGNOFF_AFTER_PILOT = true; }
  assert.throws(() => needsSignoff(s, RR, 'risk'), /Unknown amendment kind/);
});

test('a proposal on locked criteria is recorded, shows readiness under both versions, and does not change anything yet', () => {
  let s = initialState();
  assert.throws(() => proposeAmendment(s, RR, 'criteria', { value: { criteria: current(s, RR, 'criteria'), requirements: loosenedRequirements(s) }, by: 'priya', reason: 'short' }), /needs a reason/);
  assert.throws(() => proposeAmendment(s, RR, 'criteria', { value: { criteria: current(s, RR, 'criteria').filter((c) => c.id !== 'quality'), requirements: loosenedRequirements(s) }, by: 'priya', reason: REASON }), /Core rows/);
  const before = versionsInForce(s, RR);
  s = proposeAmendment(s, RR, 'criteria', { value: { criteria: current(s, RR, 'criteria'), requirements: loosenedRequirements(s) }, by: 'priya', reason: REASON });
  const p = openProposal(s, RR, 'criteria');
  assert.equal(p.id, 'P-1');
  assert.equal(p.status, 'open');
  assert.equal(p.proposedBy, 'priya');
  assert.deepEqual(p.required, { approvers: 2, riskRequired: true, ownerOnly: false });
  assert.deepEqual(p.base, { criteria: 1, requirements: 1 });
  assert.deepEqual(versionsInForce(s, RR), before, 'nothing applied yet');
  assert.equal(readiness(s, RR).met, 5);
  const r = proposalReadiness(s, RR, p);
  assert.equal(`${r.now.met} of ${r.now.total}`, '5 of 6');
  assert.equal(`${r.proposed.met} of ${r.proposed.total}`, '6 of 6');
  assert.equal(s.activity[0].kind, 'proposal');
  assert.equal(s.activity[0].surfaced, true);
  assert.throws(() => proposeAmendment(s, RR, 'criteria', { value: { criteria: current(s, RR, 'criteria'), requirements: loosenedRequirements(s) }, by: 'maya', reason: REASON }), /already awaiting sign-off/);
  // evaluateRequirement only moves "met" when the threshold changed and the value is numeric.
  assert.equal(evaluateRequirement({ text: 'Minimum 15 cases', current: '18', met: false }, { text: 'Minimum 40 cases' }), true);
  assert.equal(evaluateRequirement({ text: 'Minimum 40 cases', current: '18', met: false }, { text: 'Minimum 40 cases' }), false);
  assert.equal(evaluateRequirement({ text: 'No unresolved critical incidents', current: 'INC-01 mitigated', met: true }, { text: 'No unresolved critical incidents' }), true);
  assert.equal(evaluateRequirement({ text: 'High-severity error rate < 1%', current: '1.4%', met: true }, { text: 'High-severity error rate < 2%' }), false);
});

test('the proposer cannot approve; the owner alone is not enough for High impact; a Risk stakeholder completes it and the versions are written', () => {
  let s = proposeAmendment(initialState(), RR, 'criteria', { value: { criteria: current(initialState(), RR, 'criteria'), requirements: loosenedRequirements(initialState()) }, by: 'priya', reason: REASON });
  assert.throws(() => approveProposal(s, RR, 'P-1', { by: 'priya' }), /the proposer never approves/);
  s = approveProposal(s, RR, 'P-1', { by: 'maya' });
  assert.equal(getProposal(s, RR, 'P-1').status, 'open', 'owner alone is not enough');
  assert.deepEqual(getProposal(s, RR, 'P-1').approvals.map((a) => [a.by, a.role]), [['maya', 'owner']]);
  assert.equal(versionsInForce(s, RR).requirements, 1);
  assert.throws(() => approveProposal(s, RR, 'P-1', { by: 'maya' }), /already approved/);
  // The last slot must be Risk when no Risk approval exists yet.
  assert.throws(() => approveProposal(s, RR, 'P-1', { by: 'elena' }), /at least one approver must be from Risk/);
  assert.match(approvalEligibility(s, RR, getProposal(s, RR, 'P-1'), 'elena').reason, /Daniel Okafor/);
  s = approveProposal(s, RR, 'P-1', { by: 'daniel' });
  const p = getProposal(s, RR, 'P-1');
  assert.equal(p.status, 'approved');
  assert.deepEqual(p.applied, { criteria: 2, requirements: 2 });
  assert.equal(readiness(s, RR).met, 6, 'met is re-evaluated against the new threshold');
  assert.equal(current(s, RR, 'requirements').find((r) => r.id === 'high-value').current, '18', 'measured value unchanged');
  const v = currentVersion(s, RR, 'requirements');
  assert.equal(v.author, 'priya');
  assert.equal(v.afterEvidence, true);
  assert.equal(v.proposalId, 'P-1');
  assert.deepEqual(v.approvals.map((a) => a.by), ['maya', 'daniel']);
  assert.deepEqual(v.deviations.map((x) => [x.id, x.change]), [['high-value', 'loosened']]);
  assert.equal(s.activity[0].kind, 'amendment');
  assert.equal(s.activity[0].surfaced, true);
  assert.match(s.activity[0].body, /approved by Maya Chen \(the owner\) and Daniel Okafor \(a Risk stakeholder\)/);
  // A later decision is flagged as relying on criteria amended after evidence.
  s = authorize(selectDecision(s, RR, 'expand-limits'), RR);
  const rec = s.decisionRecords[s.decisionRecords.length - 1];
  assert.equal(rec.versions.requirements, 2);
  assert.equal(amendmentsAfterEvidenceFor(s, rec).length, 2, 'criteria v2 and requirements v2 were both amended after evidence');
  assert.throws(() => approveProposal(s, RR, 'P-1', { by: 'daniel' }), /closed/);
});

test('low impact: the owner alone approves; a rejection is recorded with its reason and leaves versions untouched', () => {
  // A new Low-impact capability, with criteria locked by a run of borrowed scenarios.
  let [s, TC] = blankCap();
  s = { ...s, capabilityData: { ...s.capabilityData, [TC]: { ...capData(s, TC), scenarios: seed.scenarios.slice(0, 2) } } };
  const d = defaultsFor(s, TC);
  s = saveCriteria(s, TC, { criteria: d.criteria, requirements: d.requirements, by: 'priya' });
  s = runSuite(s, TC);
  assert.equal(criteriaLocked(s, TC), true);
  const value = { criteria: current(s, TC, 'criteria'), requirements: current(s, TC, 'requirements').map((r) => (r.id === 'min-cases' ? { ...r, text: 'Minimum 30 pilot cases' } : r)) };
  s = proposeAmendment(s, TC, 'criteria', { value, by: 'maya', reason: 'Classification volume is high; 30 cases is a week.' });
  assert.deepEqual(openProposal(s, TC, 'criteria').required, { approvers: 1, riskRequired: false, ownerOnly: true });
  // Reject path first, by the owner (priya), with a reason.
  assert.throws(() => rejectProposal(s, TC, 'P-1', { by: 'maya', reason: 'Changed my mind about it.' }), /withdraws rather than rejects/);
  assert.throws(() => rejectProposal(s, TC, 'P-1', { by: 'elena', reason: 'Not my area, but no.' }), /not eligible to reject/);
  assert.throws(() => rejectProposal(s, TC, 'P-1', { by: 'priya', reason: 'no' }), /needs a reason/);
  const beforeReject = versionsInForce(s, TC).requirements;
  const t = rejectProposal(s, TC, 'P-1', { by: 'priya', reason: 'Keep the default until the queue change settles.' });
  assert.equal(getProposal(t, TC, 'P-1').status, 'rejected');
  assert.equal(getProposal(t, TC, 'P-1').rejection.by, 'priya');
  assert.equal(versionsInForce(t, TC).requirements, beforeReject, 'a rejection writes no version');
  assert.equal(t.activity[0].kind, 'proposal');
  assert.equal(t.activity[0].outcome, 'rejected');
  assert.throws(() => approveProposal(t, TC, 'P-1', { by: 'priya' }), /closed/);
  // Approve path: owner alone completes it.
  const u = approveProposal(s, TC, 'P-1', { by: 'priya' });
  assert.equal(getProposal(u, TC, 'P-1').status, 'approved');
  assert.equal(versionsInForce(u, TC).requirements, beforeReject + 1);
});

test('before the gate, an amendment is applied directly; after a pilot starts, contract edits need the same sign-off (setting on)', () => {
  // Criteria not locked: direct new version.
  let [s, id] = withNewCap({ impact: 'Low', reversibility: 'Easy to reverse', exposure: 'Internal only' }, 'Quarterly summary', 'Summarises the quarter.');
  const d = defaultsFor(s, id);
  s = saveCriteria(s, id, { criteria: d.criteria, requirements: d.requirements, by: 'priya' });
  s = proposeAmendment(s, id, 'criteria', { value: { criteria: current(s, id, 'criteria'), requirements: current(s, id, 'requirements') }, by: 'priya', reason: 'Re-saved before any testing.' });
  assert.equal(capData(s, id).proposals.length, 0);
  assert.equal(versionsInForce(s, id).criteria, 2);
  // Contract on the seeded refund capability: pilot started, so a proposal.
  let t = initialState();
  const c = current(t, RR, 'contract');
  const value = { ...c, mustNever: [...c.mustNever, 'Issue a refund while a fraud review is open.'] };
  t = proposeAmendment(t, RR, 'contract', { value, by: 'maya', reason: 'Close the gap found in INC-01.' });
  const p = openProposal(t, RR, 'contract');
  assert.ok(p && p.kind === 'contract');
  assert.deepEqual(p.base, { contract: 1 });
  assert.deepEqual(p.required, { approvers: 2, riskRequired: true, ownerOnly: false }, 'owner proposed on High: still two approvers incl. Risk');
  assert.equal(versionsInForce(t, RR).contract, 1);
  assert.equal(proposalReadiness(t, RR, p).proposed, null, 'no readiness comparison for a contract');
  assert.throws(() => approveProposal(t, RR, 'P-1', { by: 'maya' }), /proposed this/);
  t = approveProposal(t, RR, 'P-1', { by: 'daniel' });
  assert.equal(getProposal(t, RR, 'P-1').status, 'open', 'Risk alone is one of two');
  t = approveProposal(t, RR, 'P-1', { by: 'priya' });
  assert.equal(getProposal(t, RR, 'P-1').status, 'approved');
  assert.equal(versionsInForce(t, RR).contract, 2);
  assert.ok(current(t, RR, 'contract').mustNever.includes('Issue a refund while a fraud review is open.'));
  assert.equal(currentVersion(t, RR, 'contract').afterEvidence, true);
  // When someone else proposes a High-impact change, both roles are needed.
  let w = proposeAmendment(initialState(), RR, 'contract', { value, by: 'priya', reason: 'Close the gap found in INC-01.' });
  assert.deepEqual(openProposal(w, RR, 'contract').required, { approvers: 2, riskRequired: true, ownerOnly: false });
  // With the setting off, the same edit on a fresh state is applied directly.
  SETTINGS.CONTRACT_EDITS_NEED_SIGNOFF_AFTER_PILOT = false;
  try {
    const u = proposeAmendment(initialState(), RR, 'contract', { value, by: 'maya', reason: 'Close the gap found in INC-01.' });
    assert.equal(versionsInForce(u, RR).contract, 2);
    assert.equal(capData(u, RR).proposals.length, 0);
  } finally { SETTINGS.CONTRACT_EDITS_NEED_SIGNOFF_AFTER_PILOT = true; }
});

test('proposal actions are available through the store', () => {
  const store = createStore({});
  store.dispatch('proposeAmendment', RR, 'criteria', { value: { criteria: current(store.get(), RR, 'criteria'), requirements: loosenedRequirements(store.get()) }, by: 'priya', reason: REASON });
  store.dispatch('approveProposal', RR, 'P-1', { by: 'maya' });
  store.dispatch('approveProposal', RR, 'P-1', { by: 'daniel' });
  assert.equal(getProposal(store.get(), RR, 'P-1').status, 'approved');
  const again = createStore({});
  again.dispatch('proposeAmendment', RR, 'criteria', { value: { criteria: current(again.get(), RR, 'criteria'), requirements: loosenedRequirements(again.get()) }, by: 'priya', reason: REASON });
  again.dispatch('rejectProposal', RR, 'P-1', { by: 'daniel', reason: 'Not without more cases.' });
  assert.equal(getProposal(again.get(), RR, 'P-1').status, 'rejected');
});

test('sign-off rule, the four requested cases', () => {
  const RSN = 'A sentence of reason for the record.';
  // 1. Owner proposes on High/Financial: two distinct approvers, at least one from Risk; the proposer never approves.
  let s = proposeAmendment(initialState(), RR, 'criteria', { value: { criteria: current(initialState(), RR, 'criteria'), requirements: loosenedRequirements(initialState()) }, by: 'maya', reason: RSN });
  let p = openProposal(s, RR, 'criteria');
  assert.deepEqual(p.required, { approvers: 2, riskRequired: true, ownerOnly: false });
  assert.throws(() => approveProposal(s, RR, p.id, { by: 'maya' }), /the proposer never approves/);
  s = approveProposal(s, RR, p.id, { by: 'elena' });
  assert.equal(getProposal(s, RR, p.id).status, 'open');
  assert.throws(() => approveProposal(s, RR, p.id, { by: 'priya' }), /from Risk/, 'the second must be Risk');
  s = approveProposal(s, RR, p.id, { by: 'daniel' });
  assert.equal(getProposal(s, RR, p.id).status, 'approved');
  assert.equal(approvalsComplete(getProposal(s, RR, p.id)), true);
  // 2. Non-owner proposes on High: owner + Risk works; Risk first then owner works too.
  let t = proposeAmendment(initialState(), RR, 'criteria', { value: { criteria: current(initialState(), RR, 'criteria'), requirements: loosenedRequirements(initialState()) }, by: 'priya', reason: RSN });
  t = approveProposal(t, RR, 'P-1', { by: 'daniel' });
  assert.equal(getProposal(t, RR, 'P-1').status, 'open');
  t = approveProposal(t, RR, 'P-1', { by: 'maya' });
  assert.equal(getProposal(t, RR, 'P-1').status, 'approved');
  assert.deepEqual(getProposal(t, RR, 'P-1').approvals.map((a) => a.role), ['risk', 'owner']);
  // 3. Owner proposes on Low: one other named stakeholder approves.
  let [u, TC] = blankCap();
  u = { ...u, capabilityData: { ...u.capabilityData, [TC]: { ...capData(u, TC), scenarios: seed.scenarios.slice(0, 2) } } };
  const d = defaultsFor(u, TC);
  u = saveCriteria(u, TC, { criteria: d.criteria, requirements: d.requirements, by: 'priya' });
  u = runSuite(u, TC);
  const value = { criteria: current(u, TC, 'criteria'), requirements: current(u, TC, 'requirements').map((r) => (r.id === 'min-cases' ? { ...r, text: 'Minimum 30 pilot cases' } : r)) };
  u = proposeAmendment(u, TC, 'criteria', { value, by: 'priya', reason: 'Owner proposing on a low-impact capability.' });
  assert.deepEqual(openProposal(u, TC, 'criteria').required, { approvers: 1, riskRequired: false, ownerOnly: false });
  assert.throws(() => approveProposal(u, TC, 'P-1', { by: 'priya' }), /the proposer never approves/);
  u = approveProposal(u, TC, 'P-1', { by: 'elena' });
  assert.equal(getProposal(u, TC, 'P-1').status, 'approved');
  assert.deepEqual(getProposal(u, TC, 'P-1').approvals.map((a) => [a.by, a.role]), [['elena', 'stakeholder']]);
  // 4. The proposer cannot approve in any case (non-owner on Low either).
  let v = blankCap()[0];
  v = { ...v, capabilityData: { ...v.capabilityData, [TC]: { ...capData(v, TC), scenarios: seed.scenarios.slice(0, 2) } } };
  v = saveCriteria(v, TC, { criteria: d.criteria, requirements: d.requirements, by: 'priya' });
  v = runSuite(v, TC);
  v = proposeAmendment(v, TC, 'criteria', { value, by: 'maya', reason: 'Non-owner proposing on a low-impact capability.' });
  assert.deepEqual(openProposal(v, TC, 'criteria').required, { approvers: 1, riskRequired: false, ownerOnly: true });
  assert.throws(() => approveProposal(v, TC, 'P-1', { by: 'maya' }), /the proposer never approves/);
  assert.throws(() => approveProposal(v, TC, 'P-1', { by: 'daniel' }), /Needed: the owner/);
  v = approveProposal(v, TC, 'P-1', { by: 'priya' });
  assert.equal(getProposal(v, TC, 'P-1').status, 'approved');
});

test('a proposed contract must pass the builder checks before it can be submitted', () => {
  const s = initialState();
  const c = current(s, RR, 'contract');
  // Empty hard limits on a High-impact capability.
  assert.throws(() => proposeAmendment(s, RR, 'contract', { value: { ...c, mustNever: [], autoRestriction: [] }, by: 'priya', reason: 'Trying to drop the hard limits.' }), /fails 2 checks/);
  // A contradiction.
  assert.throws(() => proposeAmendment(s, RR, 'contract', { value: { ...c, may: [...c.may, 'Override a fraud restriction.'] }, by: 'priya', reason: 'Trying to contradict a hard limit.' }), /appears under both/);
  // An unmeasurable restriction rule.
  assert.throws(() => proposeAmendment(s, RR, 'contract', { value: { ...c, autoRestriction: ['Too many errors returns the capability to Draft.'] }, by: 'priya', reason: 'A vague rule.' }), /has no number/);
  // Value limit only under "must never" on a financial capability.
  const noLimit = { ...c, mustAsk: c.mustAsk.filter((t) => !/\$/.test(t)), may: c.may.filter((t) => !/\$/.test(t)), mustNever: [...c.mustNever, 'Issue a refund above $500.'] };
  assert.throws(() => proposeAmendment(s, RR, 'contract', { value: noLimit, by: 'priya', reason: 'Moving the limit to must never.' }), /sets no value limit/);
  // A valid change goes through.
  const ok = proposeAmendment(s, RR, 'contract', { value: { ...c, mustNever: [...c.mustNever, 'Issue a refund while a fraud review is open.'] }, by: 'priya', reason: 'Close the gap found in INC-01.' });
  assert.ok(openProposal(ok, RR, 'contract'));
  assert.deepEqual(contractValueChecks(s, RR, c).filter((x) => x.level === 'block'), []);
});

// ---------------------------------------------------------------------------
// Stakeholders and scenarios (#8)
// ---------------------------------------------------------------------------

const MED_CF = { impact: 'Medium', reversibility: 'Easy to reverse', exposure: 'Customer-facing' };

test('stakeholders are saved as a version; positions default to "no position yet"; duplicates and unknown people are refused', () => {
  let [s, id] = withNewCap(MED_CF, 'Order status lookup', 'Answers where an order is.');
  assert.throws(() => saveStakeholders(s, id, { stakeholders: [], by: 'priya' }), /at least one/);
  assert.throws(() => saveStakeholders(s, id, { stakeholders: [{ team: 'Risk', person: 'nobody' }], by: 'priya' }), /named person/);
  assert.throws(() => saveStakeholders(s, id, { stakeholders: [{ team: 'Risk', person: 'daniel' }, { team: 'Risk', person: 'daniel' }], by: 'priya' }), /listed twice/);
  s = saveStakeholders(s, id, { stakeholders: [{ team: 'Support Operations', person: 'priya', stance: 'expand', quote: 'Ready.' }, { team: 'Risk', person: 'daniel' }], by: 'priya' });
  const list = current(s, id, 'stakeholders');
  assert.equal(list.length, 2);
  assert.equal(list[0].position, 'Expand');
  assert.equal(list[1].stance, 'undecided');
  assert.equal(list[1].position, 'No position yet');
  assert.equal(list[1].date, seed.TODAY);
  assert.equal(versionsInForce(s, id).stakeholders, 1);
  assert.equal(currentVersion(s, id, 'stakeholders').author, 'priya');
  assert.equal(s.activity[0].kind, 'amendment');
  assert.equal(s.activity[0].surfaced, false, 'before evidence');
  assert.ok(STANCES.some(([k]) => k === 'undecided'));
  // Named stakeholders now follow the list.
  assert.deepEqual(namedStakeholders(s, id).sort(), ['daniel', 'priya']);
  assert.equal(isRiskStakeholder(s, id, 'sofia'), true, 'Sofia is Risk by roster');
});

test('scenario results are simulated deterministically; the starter set covers all five groups and is labelled', () => {
  const a = simulateScenario({ group: 'high-impact', name: 'Risk flag present', situation: 'x', expected: 'Escalate to a person.' });
  const b = simulateScenario({ group: 'high-impact', name: 'Risk flag present', situation: 'x', expected: 'Escalate to a person.' });
  assert.deepEqual(a, b);
  assert.equal(a.simulated, true);
  const cap = { name: 'Order status lookup' };
  const starter = starterScenarios(cap);
  assert.equal(starter.length, 20);
  assert.deepEqual([...new Set(starter.map((x) => x.group))].sort(), ['adversarial', 'ambiguous', 'edge', 'high-impact', 'standard']);
  assert.ok(starter.every((x) => x.source === 'ai' && x.situation.startsWith('Order status lookup:')));
  let [s, id] = withNewCap(MED_CF, 'Order status lookup', 'Answers where an order is.');
  s = addStarterScenarios(s, id, { by: 'priya' });
  const list = capData(s, id).scenarios;
  assert.equal(list.length, 20);
  assert.ok(list.every((x) => typeof x.pass === 'boolean' && x.aiDecision && x.outcome));
  assert.ok(list.some((x) => !x.pass), 'a starter library has at least one failure');
  assert.deepEqual(list.slice(0, 4).map((x) => x.id), ['S-01', 'S-02', 'S-03', 'S-04']);
  assert.throws(() => addStarterScenarios(s, id, { by: 'priya' }), /already in the library/);
  assert.equal(s.activity[0].kind, 'scenarios-saved');
  assert.match(scenarioNudge(0), /No scenarios yet/);
  assert.match(scenarioNudge(12), /Aim for 20 to 30/);
  assert.match(scenarioNudge(24), /sound starting library/);
});

test('saving the library keeps recorded results for unchanged scenarios, simulates new ones, and clears a previous run', () => {
  let [s, id] = withNewCap(MED_CF, 'Order status lookup', 'Answers where an order is.');
  assert.throws(() => saveScenarios(s, id, { scenarios: [{ group: 'standard', name: 'A', situation: 'x', expected: 'y' }], by: 'priya' }), /at least two groups/);
  assert.throws(() => saveScenarios(s, id, { scenarios: [{ group: 'standard', name: '', situation: 'x', expected: 'y' }, { group: 'edge', name: 'B', situation: 'x', expected: 'y' }], by: 'priya' }), /needs a name/);
  s = addStarterScenarios(s, id, { by: 'priya' });
  const d = defaultsFor(s, id);
  s = saveCriteria(s, id, { criteria: d.criteria, requirements: d.requirements, by: 'priya' });
  s = runSuite(s, id);
  assert.equal(capData(s, id).testRun.status, 'complete');
  const before = capData(s, id).scenarios;
  s = saveScenarios(s, id, { scenarios: [...before, { group: 'standard', name: 'Written by hand', situation: 'A new case.', expected: 'Produce the output.' }], by: 'priya' });
  const after = capData(s, id).scenarios;
  assert.equal(after.length, 21);
  assert.deepEqual(after.slice(0, 20).map((x) => x.pass), before.map((x) => x.pass), 'unchanged scenarios keep their results');
  assert.equal(after[20].source, 'person');
  assert.equal(after[20].id, 'S-05');
  assert.equal(capData(s, id).testRun.status, 'not-run', 'a changed library clears the last run');
  assert.ok(capData(s, id).testRun.lastRun, 'the previous run stays on record');
});

test('a new capability can reach its second record: propose a move to Draft after the first run, then authorize it', () => {
  let s = addCapability(initialState(), { name: 'Order status lookup', summary: 'Answers where an order is.', owner: 'priya', risk: MED_CF, startingLevel: 1 });
  const id = s.capabilities[s.capabilities.length - 1].id;
  assert.throws(() => proposeAuthority(s, id, 2, { by: 'priya' }), /Run the test suite/);
  s = addStarterScenarios(s, id, { by: 'priya' });
  const d = defaultsFor(s, id);
  s = saveCriteria(s, id, { criteria: d.criteria, requirements: d.requirements, by: 'priya' });
  s = runSuite(s, id);
  assert.throws(() => proposeAuthority(s, id, 3, { by: 'priya' }), /one level at a time/);
  s = proposeAuthority(s, id, 2, { by: 'priya' });
  assert.equal(decisionRequired(s, id), true);
  assert.deepEqual(proposedAuthority(s, id), { level: 2, limited: false });
  assert.equal(s.activity[0].kind, 'decision');
  assert.throws(() => proposeAuthority(s, id, 2, { by: 'priya' }), /already open/);
  s = authorize(selectDecision(s, id, 'expand'), id, { by: 'priya' });
  const c = getCapability(s, id);
  assert.deepEqual(c.authority, { level: 2, limited: false });
  assert.equal(c.status, 'pilot');
  assert.equal(decisionRequired(s, id), false);
  const rec = s.decisionRecords[s.decisionRecords.length - 1];
  assert.equal(rec.sequence, 2);
  assert.equal(rec.capabilityId, id);
  assert.deepEqual(rec.previous, { level: 1, limited: false });
  assert.deepEqual(rec.next, { level: 2, limited: false });
  assert.match(rec.scope, /Draft/);
  assert.equal(rec.conditions, null);
  assert.equal(capData(s, id).monitoring, null, 'no monitoring at Draft');
  assert.ok(rec.evidenceSnapshot.some((x) => /of 20 scenarios passed/.test(x)));
  // Not-delegated capabilities cannot be proposed.
  const nd = addCapability(initialState(), { name: 'Account deletion', owner: 'daniel', risk: { impact: 'High', reversibility: 'Difficult to reverse', exposure: 'Customer-facing' }, notDelegated: true, rationale: 'Irreversible and rare; a person does it every time.' });
  assert.throws(() => proposeAuthority(nd, nd.capabilities[nd.capabilities.length - 1].id, 1, { by: 'daniel' }), /not delegated by design/);
});

test('end to end in the store: add → contract → criteria → stakeholders → scenarios → run → authorize move to Draft (the capability\'s second record)', () => {
  const store = createStore({});
  store.dispatch('addCapability', { name: 'Order status lookup', summary: 'Answers where an order is from the carrier feed.', owner: 'priya', risk: MED_CF, startingLevel: 1, by: 'priya' });
  const id = store.get().capabilities[store.get().capabilities.length - 1].id;
  // Contract.
  store.dispatch('startContractDraft', id, { by: 'priya' });
  for (const l of capData(store.get(), id).contractDraft.lines.filter((l) => l.status === 'pending')) store.dispatch('reviewSuggestion', id, l.id, { decision: 'accept' });
  for (const k of SECTION_KEYS) store.dispatch('confirmSection', id, k, true);
  store.dispatch('finalizeContract', id, { by: 'priya' });
  assert.equal(versionsInForce(store.get(), id).contract, 1);
  // Criteria.
  const d = defaultsFor(store.get(), id);
  store.dispatch('saveCriteria', id, { criteria: d.criteria, requirements: d.requirements, by: 'priya' });
  // Stakeholders.
  store.dispatch('saveStakeholders', id, { stakeholders: [{ team: 'Support Operations', person: 'priya', stance: 'expand' }, { team: 'Risk', person: 'daniel' }], by: 'priya' });
  // Scenarios and run.
  store.dispatch('addStarterScenarios', id, { by: 'priya' });
  assert.equal(canRunSuite(store.get(), id).ok, true);
  store.dispatch('startTestRun', id);
  while (capData(store.get(), id).testRun.status === 'running') store.dispatch('advanceTestRun', id);
  assert.equal(criteriaLocked(store.get(), id), true);
  // Decision.
  store.dispatch('proposeAuthority', id, 2, { by: 'priya' });
  store.dispatch('selectDecision', id, 'expand');
  store.dispatch('authorize', id, { by: 'priya' });
  const c = getCapability(store.get(), id);
  assert.deepEqual(c.authority, { level: 2, limited: false });
  assert.equal(c.status, 'pilot');
  const recs = store.get().decisionRecords.filter((r) => r.capabilityId === id);
  assert.deepEqual(recs.map((r) => r.sequence), [1, 2]);
  assert.deepEqual(recs[1].versions, { contract: 1, criteria: 1, requirements: 1, risk: 1, stakeholders: 1 });
  // The seeded demo is untouched.
  assert.equal(decisionRequired(store.get(), RR), true);
  assert.equal(readiness(store.get(), RR).met, 5);
});

// ---------------------------------------------------------------------------
// Sign-off loophole (PR #18 review)
// ---------------------------------------------------------------------------

test('loophole: relabelling a stakeholder as Risk after proposing cannot satisfy the Risk approval', () => {
  let s = initialState();
  const reqs = loosenedRequirements(s);
  s = proposeAmendment(s, RR, 'criteria', { value: { criteria: current(s, RR, 'criteria'), requirements: reqs }, by: 'maya', reason: REASON });
  // Maya then relabels Elena as Risk. After performance results, that is itself a proposal, not a direct edit.
  const relabelled = current(s, RR, 'stakeholders').map((x) => (x.person === 'elena' ? { ...x, team: 'Risk' } : x));
  s = saveStakeholders(s, RR, { stakeholders: relabelled, by: 'maya', reason: 'Relabel Elena as Risk.' });
  assert.equal(current(s, RR, 'stakeholders').find((x) => x.person === 'elena').team, 'Finance', 'the list did not change');
  assert.equal(openProposal(s, RR, 'stakeholders').id, 'P-2');
  // Even if it had applied, Elena is not Risk: her team in people is Finance.
  s = approveProposal(s, RR, 'P-1', { by: 'elena' });
  assert.throws(() => approveProposal(s, RR, 'P-1', { by: 'priya' }), /at least one approver must be from Risk/);
  assert.equal(getProposal(s, RR, 'P-1').status, 'open', 'P-1 does not apply without Daniel');
  assert.equal(versionsInForce(s, RR).requirements, 1);
  s = approveProposal(s, RR, 'P-1', { by: 'daniel' });
  assert.equal(getProposal(s, RR, 'P-1').status, 'approved');
});

test('eligible approvers are frozen when a proposal opens', () => {
  // A new Low-impact capability with criteria locked: owner-proposed, so one other named stakeholder approves.
  let [s, TC] = blankCap();
  s = { ...s, capabilityData: { ...s.capabilityData, [TC]: { ...capData(s, TC), scenarios: seed.scenarios.slice(0, 2) } } };
  s = saveStakeholders(s, TC, { stakeholders: [{ team: 'Support Operations', person: 'priya' }, { team: 'Product', person: 'maya' }], by: 'priya' });
  const d = defaultsFor(s, TC);
  s = saveCriteria(s, TC, { criteria: d.criteria, requirements: d.requirements, by: 'priya' });
  s = runSuite(s, TC);
  const value = { criteria: current(s, TC, 'criteria'), requirements: current(s, TC, 'requirements').map((r) => (r.id === 'min-cases' ? { ...r, text: 'Minimum 30 pilot cases' } : r)) };
  s = proposeAmendment(s, TC, 'criteria', { value, by: 'priya', reason: 'Owner proposing; one other stakeholder must approve.' });
  const p = openProposal(s, TC, 'criteria');
  assert.deepEqual(p.eligible.sort(), ['maya'], 'listed stakeholders minus the proposer, at open time');
  // Adding Elena afterwards (itself a proposal now) does not make her eligible on P-1.
  assert.throws(() => approveProposal(s, TC, 'P-1', { by: 'elena' }), /not an eligible approver when this proposal opened/);
  // Nor does an applied membership change: approve the membership proposal first, then retry.
  s = saveStakeholders(s, TC, { stakeholders: [...current(s, TC, 'stakeholders'), { team: 'Finance', person: 'elena' }], by: 'priya', reason: 'Add Finance.' });
  const sp = openProposal(s, TC, 'stakeholders');
  s = approveProposal(s, TC, sp.id, { by: 'maya' });
  assert.equal(getProposal(s, TC, sp.id).status, 'approved');
  assert.ok(current(s, TC, 'stakeholders').some((x) => x.person === 'elena'), 'Elena is now listed');
  assert.throws(() => approveProposal(s, TC, 'P-1', { by: 'elena' }), /not an eligible approver when this proposal opened/, 'P-1 keeps its frozen set');
  s = approveProposal(s, TC, 'P-1', { by: 'maya' });
  assert.equal(getProposal(s, TC, 'P-1').status, 'approved');
});

test('after performance results, membership and team changes to stakeholders go through sign-off; position changes stay direct', () => {
  let s = initialState();
  const before = current(s, RR, 'stakeholders');
  assert.equal(needsSignoff(s, RR, 'stakeholders'), true);
  // Position/stance/quote only: direct new version.
  const repositioned = before.map((x) => (x.person === 'elena' ? { ...x, stance: 'hold', position: 'Hold', quote: 'Changed my mind.' } : x));
  assert.equal(stakeholderMembershipChanged(before, repositioned), false);
  s = saveStakeholders(s, RR, { stakeholders: repositioned, by: 'maya', reason: 'Finance moved to hold.' });
  assert.equal(versionsInForce(s, RR).stakeholders, 2);
  assert.equal(capData(s, RR).proposals.length, 0);
  assert.equal(current(s, RR, 'stakeholders').find((x) => x.person === 'elena').stance, 'hold');
  // Removing someone: proposal.
  const removed = current(s, RR, 'stakeholders').filter((x) => x.person !== 'daniel');
  assert.equal(stakeholderMembershipChanged(current(s, RR, 'stakeholders'), removed), true);
  s = saveStakeholders(s, RR, { stakeholders: removed, by: 'maya', reason: 'Drop Risk from the list.' });
  const p = openProposal(s, RR, 'stakeholders');
  assert.ok(p);
  assert.deepEqual(p.required, { approvers: 2, riskRequired: true, ownerOnly: false });
  assert.equal(versionsInForce(s, RR).stakeholders, 2, 'nothing applied');
  assert.ok(current(s, RR, 'stakeholders').some((x) => x.person === 'daniel'));
  // Daniel can reject the proposal that would remove him.
  s = rejectProposal(s, RR, p.id, { by: 'daniel', reason: 'Risk stays on the list for this capability.' });
  assert.equal(getProposal(s, RR, p.id).status, 'rejected');
  // Before any results (a new capability), membership edits are direct.
  let [t, id] = withNewCap(MED_CF, 'Order status lookup', 'Answers where an order is.');
  t = saveStakeholders(t, id, { stakeholders: [{ team: 'Support Operations', person: 'priya' }], by: 'priya' });
  t = saveStakeholders(t, id, { stakeholders: [{ team: 'Support Operations', person: 'priya' }, { team: 'Risk', person: 'daniel' }], by: 'priya' });
  assert.equal(versionsInForce(t, id).stakeholders, 2);
  assert.equal(capData(t, id).proposals.length, 0);
});

// ---------------------------------------------------------------------------
// Seed setup data for mature capabilities (#14)
// ---------------------------------------------------------------------------

test('mature capabilities carry criteria, requirements and stakeholders in the editor shape; the refund demo is unchanged', () => {
  const s = initialState();
  for (const id of ['ticket-classification', 'response-drafting', 'refund-execution-high-value', 'account-closure']) {
    const c = current(s, id, 'criteria');
    const r = current(s, id, 'requirements');
    const st = current(s, id, 'stakeholders');
    assert.ok(c.length >= 5, `${id} criteria`);
    assert.ok(r.length >= 5, `${id} requirements`);
    assert.ok(st.length >= 3, `${id} stakeholders`);
    for (const x of c) assert.ok(x.id && x.name && x.target && x.current && x.status && x.source, `${id} criterion ${x.id} shape`);
    for (const x of r) assert.ok(x.id && x.text && x.current && typeof x.met === 'boolean' && x.source, `${id} requirement ${x.id} shape`);
    for (const x of st) assert.ok(x.team && seed.people[x.person] && x.stance && x.position && x.date, `${id} stakeholder shape`);
    assert.ok(CORE_CRITERIA.every((k) => c.some((x) => x.id === k)), `${id} has the core criteria`);
    assert.ok(CORE_REQUIREMENTS.every((k) => r.some((x) => x.id === k)), `${id} has the core requirement`);
    assert.equal(criteriaSaved(s, id), true);
    assert.equal(versionsInForce(s, id).criteria, 1);
  }
  // Results have been seen for the three with evidence, so their criteria read as locked; account closure has no results.
  assert.equal(criteriaLocked(s, 'ticket-classification'), true);
  assert.equal(criteriaLocked(s, 'response-drafting'), true);
  assert.equal(criteriaLocked(s, 'refund-execution-high-value'), true);
  assert.equal(criteriaLocked(s, 'account-closure'), false);
  // Readiness reflects each capability's story.
  assert.deepEqual([readiness(s, 'ticket-classification').met, readiness(s, 'ticket-classification').total], [5, 5]);
  assert.deepEqual([readiness(s, 'response-drafting').met, readiness(s, 'response-drafting').total], [4, 5]);
  assert.deepEqual([readiness(s, 'refund-execution-high-value').met, readiness(s, 'refund-execution-high-value').total], [4, 7]);
  assert.equal(readiness(s, 'account-closure').met, 0);
  // Account closure's criteria say why it stays at Level 0.
  const ac = current(s, 'account-closure', 'criteria');
  assert.ok(ac.some((x) => /Level 0 by design/.test(x.note)));
  assert.ok(current(s, 'account-closure', 'requirements').some((x) => /no level above Observe/.test(x.gap || '')));
  // The refund demo is unchanged.
  assert.equal(current(s, RR, 'criteria').length, 7);
  assert.equal(readiness(s, RR).met, 5);
  assert.equal(capData(s, RR).evidence.length, 12);
  assert.equal(current(s, RR, 'stakeholders').length, 5);
  assert.equal(focusCapability(s).id, RR);
  // Risk eligibility still comes from people, not from these lists.
  assert.equal(isRiskStakeholder(s, 'ticket-classification', 'jonas'), false);
});

// ---------------------------------------------------------------------------
// Feasibility at proposal time, and withdrawal (PR #19 review)
// ---------------------------------------------------------------------------

test('a proposal is refused when its eligible approvers can never satisfy the rule', () => {
  let s = initialState();
  const reqs = loosenedRequirements(s);
  const value = { criteria: current(s, RR, 'criteria'), requirements: reqs };
  // With Sofia on the list, Daniel can propose: Sofia is the other Risk approver.
  const ok = proposeAmendment(s, RR, 'criteria', { value, by: 'daniel', reason: REASON });
  assert.deepEqual(openProposal(ok, RR, 'criteria').eligible.sort(), ['elena', 'maya', 'priya', 'sofia']);
  // Remove Sofia from the list (direct amend in the test): Daniel's proposal could never complete, so it is refused.
  const noSofia = amend(s, RR, 'stakeholders', { value: current(s, RR, 'stakeholders').filter((x) => x.person !== 'sofia'), author: 'maya', reason: 'Test setup.' });
  assert.throws(() => proposeAmendment(noSofia, RR, 'criteria', { value, by: 'daniel', reason: REASON }), /No Risk approver other than Daniel Okafor. Add another Risk person to the stakeholders or ask someone else to propose/);
  assert.equal(capData(noSofia, RR).proposals.length, 0, 'nothing recorded');
  // Someone else proposing on the same list is fine: Daniel is the Risk approver.
  assert.ok(openProposal(proposeAmendment(noSofia, RR, 'criteria', { value, by: 'priya', reason: REASON }), RR, 'criteria'));
  // Too few approvers: a High-impact capability whose only listed people are the owner and one other.
  let [t, id] = withNewCap();
  t = saveStakeholders(t, id, { stakeholders: [{ team: 'Support Operations', person: 'priya' }, { team: 'Risk', person: 'daniel' }], by: 'priya' });
  t = addStarterScenarios(t, id, { by: 'priya' });
  const d = defaultsFor(t, id);
  t = saveCriteria(t, id, { criteria: d.criteria, requirements: d.requirements, by: 'priya' });
  t = runSuite(t, id);
  assert.throws(() => proposeAmendment(t, id, 'criteria', { value: { criteria: current(t, id, 'criteria'), requirements: current(t, id, 'requirements') }, by: 'priya', reason: 'Owner proposing with only one other person listed.' }), /needs 2 approvers other than Priya Natarajan, and only 1 named stakeholder is eligible/);
  // Direct check of the helper.
  assert.equal(signoffFeasibility(t, id, { approvers: 2, riskRequired: true, ownerOnly: false }, ['daniel', 'maya'], 'priya').ok, true);
  assert.match(signoffFeasibility(t, id, { approvers: 2, riskRequired: true, ownerOnly: false }, ['maya', 'elena'], 'priya').reason, /No Risk approver/);
});

test('the proposer can withdraw an open proposal; it is recorded with a reason and a new proposal can follow', () => {
  let s = initialState();
  const value = { criteria: current(s, RR, 'criteria'), requirements: loosenedRequirements(s) };
  s = proposeAmendment(s, RR, 'criteria', { value, by: 'priya', reason: REASON });
  assert.throws(() => withdrawProposal(s, RR, 'P-1', { by: 'maya', reason: 'Not mine to withdraw.' }), /Only the proposer can withdraw/);
  assert.throws(() => withdrawProposal(s, RR, 'P-1', { by: 'priya', reason: 'no' }), /needs a reason/);
  const before = s.activity.length;
  s = withdrawProposal(s, RR, 'P-1', { by: 'priya', reason: 'Waiting for the next twenty cases instead.' });
  const p = getProposal(s, RR, 'P-1');
  assert.equal(p.status, 'withdrawn');
  assert.equal(p.withdrawal.by, 'priya');
  assert.equal(p.withdrawal.reason, 'Waiting for the next twenty cases instead.');
  assert.equal(s.activity.length, before + 1);
  assert.equal(s.activity[0].kind, 'proposal');
  assert.equal(s.activity[0].outcome, 'withdrawn');
  assert.equal(versionsInForce(s, RR).requirements, 1, 'nothing applied');
  assert.throws(() => approveProposal(s, RR, 'P-1', { by: 'maya' }), /closed/);
  assert.throws(() => withdrawProposal(s, RR, 'P-1', { by: 'priya', reason: 'Withdrawing again.' }), /closed/);
  // A new proposal can open now.
  s = proposeAmendment(s, RR, 'criteria', { value, by: 'priya', reason: REASON });
  assert.equal(openProposal(s, RR, 'criteria').id, 'P-2');
  // Through the store too.
  const store = createStore({});
  store.dispatch('proposeAmendment', RR, 'criteria', { value, by: 'maya', reason: REASON });
  store.dispatch('withdrawProposal', RR, 'P-1', { by: 'maya', reason: 'Changed my mind after talking to Risk.' });
  assert.equal(getProposal(store.get(), RR, 'P-1').status, 'withdrawn');
});

// ---------------------------------------------------------------------------
// Derived capability fields (#4 follow-up)
// ---------------------------------------------------------------------------

test('decisionRequired, proposed, lastDecisionId and lastEvaluated are derived, never stored on the capability', () => {
  let s = initialState();
  for (const c of s.capabilities) {
    for (const k of ['decisionRequired', 'proposed', 'lastEvaluated', 'lastDecisionId']) assert.equal(k in c, false, `${c.id} stores no ${k}`);
  }
  // Seeded values match what the records and evidence say.
  assert.equal(decisionRequired(s, RR), true);
  assert.deepEqual(proposedAuthority(s, RR), { level: 3, limited: true });
  assert.equal(lastDecisionId(s, RR), 'AC-02');
  assert.equal(lastDecisionId(s, TC), 'AC-01');
  assert.equal(lastDecisionId(s, 'account-closure'), null);
  assert.equal(lastEvaluated(s, RR), '2026-10-06');
  assert.equal(lastEvaluated(s, TC), '2026-09-28');
  assert.equal(lastEvaluated(s, 'response-drafting'), '2026-10-02');
  assert.equal(lastEvaluated(s, 'refund-execution-high-value'), '2026-09-24');
  assert.equal(lastEvaluated(s, 'account-closure'), '2026-08-12', 'falls back to the defined-on date');
  assert.equal(decisionRequired(s, TC), false);
  assert.equal(proposedAuthority(s, TC), null);
  // Authorizing clears the pending decision and moves the derived fields.
  s = authorize(selectDecision(s, RR, 'expand-limits'), RR);
  assert.equal(decisionRequired(s, RR), false);
  assert.equal(proposedAuthority(s, RR), null);
  assert.equal(lastDecisionId(s, RR), 'AC-04');
  assert.equal(lastEvaluated(s, RR), '2026-10-06', 'a decision is not an evaluation');
  assert.equal('decisionRequired' in cap(s), false);
  // A breach writes an incident evidence item, which is an evaluation.
  s = simulateBreach(s, RR);
  assert.equal(lastDecisionId(s, RR), 'AC-05');
  assert.equal(lastEvaluated(s, RR), seed.TODAY);
  // Nothing proposed: cannot authorize.
  assert.match(canAuthorize(selectDecision(s, RR, 'expand'), RR).reason, /No authority change is proposed/);
  assert.equal(canAuthorize(selectDecision(s, RR, 'restrict'), RR).ok, true, 'restricting needs no proposed expansion');
  // A test run alone moves lastEvaluated.
  let [b, bid] = blankCap();
  assert.equal(lastEvaluated(b, bid), seed.TODAY, 'defined today, no evidence');
  const u = { ...b, capabilityData: { ...b.capabilityData, [bid]: { ...capData(b, bid), testRun: { status: 'not-run', lastRun: '2026-10-09', completed: [] } } } };
  assert.equal(lastEvaluated(u, bid), '2026-10-09');
});

test('views and the entry point read the derived fields only through selectors', () => {
  const files = [...readdirSync(new URL('../src/views', import.meta.url).pathname).map((f) => `../src/views/${f}`), '../src/main.js'];
  const forbidden = /\b(cap|c|capability|x|rec)\.(decisionRequired|proposed|lastEvaluated|lastDecisionId)\b/g;
  const offenders = [];
  for (const f of files) {
    if (!f.endsWith('.js')) continue;
    const src = readFileSync(new URL(f, import.meta.url).pathname, 'utf8');
    for (const m of src.matchAll(forbidden)) offenders.push(`${f}: ${m[0]}`);
  }
  assert.deepEqual(offenders, []);
});

// ---------------------------------------------------------------------------
// People roster in state (#22)
// ---------------------------------------------------------------------------

test('the roster is version 1 of the seed, with explicit rights; everything reads it from state', () => {
  const s = initialState();
  assert.equal(rosterVersions(s).length, 1);
  assert.deepEqual(Object.keys(people(s)).sort(), ['daniel', 'elena', 'jonas', 'maya', 'priya', 'sofia']);
  assert.equal(isWorkspaceAdmin(s, 'maya'), true);
  assert.equal(isWorkspaceAdmin(s, 'jonas'), true);
  assert.equal(isWorkspaceAdmin(s, 'priya'), false);
  assert.equal(isRiskApprover(s, 'daniel'), true);
  assert.equal(isRiskApprover(s, 'sofia'), true);
  assert.equal(isRiskApprover(s, 'maya'), false);
  assert.ok(Object.values(people(s)).every((p) => p.active === true && p.rights && 'riskApprover' in p.rights && 'workspaceAdmin' in p.rights));
  assert.equal(personRecord(s, 'nobody'), null);
});

test('only a workspace admin changes the roster, always with a reason; add, edit and deactivate write versions', () => {
  let s = initialState();
  assert.throws(() => addPerson(s, { name: 'Omar Haddad', title: 'Support Agent Lead', team: 'Support Operations', by: 'priya', reason: 'Joined the pilot team.' }), /not a workspace admin/);
  assert.throws(() => addPerson(s, { name: 'Omar Haddad', title: 'Support Agent Lead', team: 'Support Operations', by: 'maya', reason: '' }), /needs a reason/);
  assert.throws(() => addPerson(s, { name: 'Omar Haddad', title: '', team: 'Support Operations', by: 'maya', reason: 'Joined the pilot team.' }), /name, a title and a team/);
  const before = s.activity.length;
  s = addPerson(s, { name: 'Omar Haddad', title: 'Support Agent Lead', team: 'Support Operations', by: 'maya', reason: 'Joined the pilot team.' });
  assert.equal(rosterVersions(s).length, 2);
  assert.deepEqual(personRecord(s, 'omar-haddad'), { name: 'Omar Haddad', role: 'Support Agent Lead', team: 'Support Operations', active: true, rights: { riskApprover: false, workspaceAdmin: false } });
  assert.equal(rosterVersions(s)[1].author, 'maya');
  assert.equal(rosterVersions(s)[1].reason, 'Joined the pilot team.');
  assert.deepEqual(rosterVersions(s)[1].change, { kind: 'add', key: 'omar-haddad' });
  assert.equal(Object.keys(rosterVersions(s)[1].before).length, 6, 'before kept');
  assert.equal(s.activity.length, before + 1);
  assert.equal(s.activity[0].kind, 'roster');
  assert.equal(s.activity[0].surfaced, false);
  // Duplicate names get distinct keys.
  s = addPerson(s, { name: 'Omar Haddad', title: 'Analyst', team: 'Finance', by: 'jonas', reason: 'A second Omar.' });
  assert.ok(personRecord(s, 'omar-haddad-2'));
  // Edit name/title/team only.
  assert.throws(() => editPerson(s, 'omar-haddad', { by: 'priya', reason: 'Promoted to lead.' }), /not a workspace admin/);
  assert.throws(() => editPerson(s, 'omar-haddad', { by: 'maya', reason: 'Nothing happened here.' }), /Nothing changed/);
  s = editPerson(s, 'omar-haddad', { title: 'Support Team Lead', by: 'maya', reason: 'Promoted to lead.' });
  assert.equal(personRecord(s, 'omar-haddad').role, 'Support Team Lead');
  assert.equal(rosterVersions(s).length, 4);
  assert.match(s.activity[0].body, /title Support Agent Lead → Support Team Lead/);
  // Deactivate: never delete.
  s = deactivatePerson(s, 'omar-haddad-2', { by: 'jonas', reason: 'Left the company.' });
  assert.equal(isActivePerson(s, 'omar-haddad-2'), false);
  assert.ok(personRecord(s, 'omar-haddad-2'), 'still on the roster');
  assert.equal(s.activity[0].surfaced, true, 'a deactivation is worth seeing');
  assert.throws(() => deactivatePerson(s, 'omar-haddad-2', { by: 'jonas', reason: 'Again, please.' }), /already deactivated/);
  // Deactivating a rights holder is a proposal (#23); see the rights tests.
  assert.ok(openRosterProposal(deactivatePerson(s, 'jonas', { by: 'maya', reason: 'Moved to another team.' }), 'jonas'));
  // Rights are not editable here (#23).
  assert.equal(personRecord(s, 'omar-haddad').rights.workspaceAdmin, false);
});

test('a deactivated person cannot act, propose, approve, author or be a stakeholder, and leaves the pickers', () => {
  let s = initialState();
  s = { ...s, actingAs: 'elena' };
  s = deactivatePerson(s, 'elena', { by: 'maya', reason: 'Left the company.' });
  assert.equal(s.actingAs, null, 'acting-as falls back when the acting person is deactivated');
  assert.throws(() => setActingAs(s, 'elena'), /deactivated and cannot act/);
  assert.ok(!Object.keys(activePeople(s)).includes('elena'));
  assert.equal(actor(s, RR), 'maya');
  const value = { criteria: current(s, RR, 'criteria'), requirements: loosenedRequirements(s) };
  assert.throws(() => proposeAmendment(s, RR, 'criteria', { value, by: 'elena', reason: REASON }), /deactivated and cannot propose/);
  s = proposeAmendment(s, RR, 'criteria', { value, by: 'priya', reason: REASON });
  const p = openProposal(s, RR, 'criteria');
  assert.ok(!p.eligible.includes('elena'), 'not eligible when frozen');
  assert.throws(() => approveProposal(s, RR, p.id, { by: 'elena' }), /deactivated and cannot approve/);
  assert.throws(() => rejectProposal(s, RR, p.id, { by: 'elena', reason: 'Not from here.' }), /deactivated/);
  assert.throws(() => amend(s, RR, 'risk', { value: current(s, RR, 'risk'), author: 'elena', reason: 'Trying anyway.' }), /deactivated and cannot author/);
  assert.throws(() => authorize(selectDecision(s, RR, 'hold'), RR, { by: 'elena' }), /deactivated and cannot authorize/);
  assert.throws(() => addCapability(s, { name: 'X', owner: 'elena', risk: LOW_RISK, startingLevel: 0 }), /deactivated and cannot own/);
  // Stakeholder lists: cannot add; existing entries stop counting as named stakeholders.
  const [t, id] = withNewCap();
  assert.throws(() => saveStakeholders(deactivatePerson(t, 'elena', { by: 'maya', reason: 'Left the company.' }), id, { stakeholders: [{ team: 'Finance', person: 'elena' }], by: 'priya' }), /deactivated and cannot be a stakeholder/);
  assert.ok(!namedStakeholders(s, RR).includes('elena'));
  // The seeded positions on record still name her; history is not rewritten.
  assert.ok(current(s, RR, 'stakeholders').some((x) => x.person === 'elena'));
  // The demo is unchanged.
  assert.equal(readiness(s, RR).met, 5);
});

test('roster changes are available through the store and persist', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const store = createStore({ storage });
  store.dispatch('addPerson', { name: 'Omar Haddad', title: 'Support Agent Lead', team: 'Support Operations', by: 'maya', reason: 'Joined the pilot team.' });
  store.dispatch('editPerson', 'omar-haddad', { team: 'Support', by: 'jonas', reason: 'Team renamed.' });
  store.dispatch('deactivatePerson', 'omar-haddad', { by: 'jonas', reason: 'Left the company.' });
  const again = createStore({ storage });
  assert.equal(rosterVersions(again.get()).length, 4);
  assert.equal(isActivePerson(again.get(), 'omar-haddad'), false);
  again.dispatch('reset');
  assert.equal(rosterVersions(again.get()).length, 1);
});

// ---------------------------------------------------------------------------
// Approval rights as explicit, governed grants (#23)
// ---------------------------------------------------------------------------

test('repro: relabelling a team cannot create a Risk approver; the loosening does not apply without a Risk approver', () => {
  let s = initialState();
  s = editPerson(s, 'elena', { team: 'Risk', by: 'maya', reason: 'Relabel for the repro.' });
  assert.equal(personRecord(s, 'elena').team, 'Risk');
  assert.equal(isRiskApprover(s, 'elena'), false, 'team does not grant the right');
  assert.equal(isRiskStakeholder(s, RR, 'elena'), false);
  const value = { criteria: current(s, RR, 'criteria'), requirements: loosenedRequirements(s) };
  s = proposeAmendment(s, RR, 'criteria', { value, by: 'maya', reason: REASON });
  s = approveProposal(s, RR, 'P-1', { by: 'elena' });
  assert.throws(() => approveProposal(s, RR, 'P-1', { by: 'priya' }), /at least one approver must be from Risk/);
  assert.equal(getProposal(s, RR, 'P-1').status, 'open');
  assert.equal(versionsInForce(s, RR).requirements, 1, 'nothing applied');
  // Only a recorded right counts: Daniel completes it.
  s = approveProposal(s, RR, 'P-1', { by: 'daniel' });
  assert.equal(getProposal(s, RR, 'P-1').status, 'approved');
});

test('no team-based Risk logic remains in the store or the views', () => {
  const dir = new URL('../src', import.meta.url).pathname;
  const files = [...readdirSync(`${dir}/store`).map((f) => `${dir}/store/${f}`), ...readdirSync(`${dir}/views`).map((f) => `${dir}/views/${f}`), `${dir}/main.js`, `${dir}/ui.js`];
  const offenders = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/team\s*===?\s*['"]Risk['"]|['"]Risk['"]\s*===?\s*[\w.]*team/g)) offenders.push(`${f.split('/').slice(-2).join('/')}: ${m[0]}`);
  }
  assert.deepEqual(offenders, []);
});

test('rights are granted and removed through a proposal by an admin, approved by a different admin, never self-granted', () => {
  let s = initialState();
  assert.deepEqual(activeAdmins(s).sort(), ['jonas', 'maya']);
  assert.throws(() => proposeRosterChange(s, { kind: 'rights', person: 'elena', right: 'riskApprover', grant: true, by: 'priya', reason: 'Finance should sign off.' }), /not a workspace admin/);
  assert.throws(() => proposeRosterChange(s, { kind: 'rights', person: 'maya', right: 'riskApprover', grant: true, by: 'maya', reason: 'I want it.' }), /Nobody grants a right to themselves/);
  assert.throws(() => proposeRosterChange(s, { kind: 'rights', person: 'daniel', right: 'riskApprover', grant: true, by: 'maya', reason: 'Already has it.' }), /already holds/);
  assert.throws(() => proposeRosterChange(s, { kind: 'rights', person: 'elena', right: 'riskApprover', grant: false, by: 'maya', reason: 'Never had it.' }), /does not hold/);
  assert.throws(() => proposeRosterChange(s, { kind: 'rights', person: 'elena', right: 'riskApprover', grant: true, by: 'maya', reason: 'ok' }), /needs a reason/);
  s = proposeRosterChange(s, { kind: 'rights', person: 'elena', right: 'riskApprover', grant: true, by: 'maya', reason: 'Finance joins Risk sign-off.' });
  const pr = openRosterProposal(s, 'elena');
  assert.equal(pr.id, 'RP-1');
  assert.deepEqual(pr.eligible.sort(), ['daniel', 'jonas', 'sofia'], 'other active admins plus existing Risk approvers for a Risk approver grant, frozen');
  assert.equal(isRiskApprover(s, 'elena'), false, 'nothing applied yet');
  assert.equal(s.activity[0].kind, 'roster');
  assert.equal(s.activity[0].surfaced, true);
  assert.throws(() => approveRosterChange(s, 'RP-1', { by: 'maya' }), /someone else must approve/);
  assert.throws(() => approveRosterChange(s, 'RP-1', { by: 'priya' }), /neither a workspace admin nor a Risk approver/);
  assert.throws(() => proposeRosterChange(s, { kind: 'rights', person: 'elena', right: 'workspaceAdmin', grant: true, by: 'jonas', reason: 'Second change at once.' }), /already awaiting sign-off/);
  s = approveRosterChange(s, 'RP-1', { by: 'jonas' });
  assert.equal(getRosterProposal(s, 'RP-1').status, 'approved');
  assert.equal(isRiskApprover(s, 'elena'), true);
  const v = rosterVersions(s)[rosterVersions(s).length - 1];
  assert.equal(v.author, 'maya');
  assert.deepEqual(v.approvals.map((a) => a.by), ['jonas']);
  assert.deepEqual(v.change, { kind: 'grant', key: 'elena', right: 'riskApprover' });
  // Elena can now take the Risk slot on a capability proposal.
  const value = { criteria: current(s, RR, 'criteria'), requirements: loosenedRequirements(s) };
  let t = proposeAmendment(s, RR, 'criteria', { value, by: 'maya', reason: REASON });
  t = approveProposal(t, RR, 'P-1', { by: 'priya' });
  t = approveProposal(t, RR, 'P-1', { by: 'elena' });
  assert.equal(getProposal(t, RR, 'P-1').status, 'approved');
  // Removal: same path; reject and withdraw are recorded.
  s = proposeRosterChange(s, { kind: 'rights', person: 'elena', right: 'riskApprover', grant: false, by: 'jonas', reason: 'Finance steps back from Risk sign-off.' });
  assert.throws(() => rejectRosterChange(s, 'RP-2', { by: 'jonas', reason: 'Changed my mind.' }), /someone else must approve/);
  const rej = rejectRosterChange(s, 'RP-2', { by: 'maya', reason: 'Keep her on for the quarter.' });
  assert.equal(getRosterProposal(rej, 'RP-2').status, 'rejected');
  assert.equal(isRiskApprover(rej, 'elena'), true);
  assert.throws(() => withdrawRosterChange(s, 'RP-2', { by: 'maya', reason: 'Not mine.' }), /Only the proposer withdraws/);
  const wd = withdrawRosterChange(s, 'RP-2', { by: 'jonas', reason: 'Raised too early.' });
  assert.equal(getRosterProposal(wd, 'RP-2').status, 'withdrawn');
  s = approveRosterChange(s, 'RP-2', { by: 'maya' });
  assert.equal(isRiskApprover(s, 'elena'), false);
});

test('the last workspace admin cannot be removed or deactivated; a rights holder is deactivated only with sign-off', () => {
  let s = initialState();
  // Remove Jonas as admin (Maya proposes, Jonas... cannot approve his own removal? He is not the proposer, so he can).
  s = proposeRosterChange(s, { kind: 'rights', person: 'jonas', right: 'workspaceAdmin', grant: false, by: 'maya', reason: 'Jonas moves to another workspace.' });
  s = approveRosterChange(s, 'RP-1', { by: 'jonas' });
  assert.deepEqual(activeAdmins(s), ['maya']);
  // Now nothing about Maya's admin right can be proposed: removal would leave none, and no other admin could sign off anyway.
  assert.throws(() => proposeRosterChange(s, { kind: 'rights', person: 'maya', right: 'workspaceAdmin', grant: false, by: 'maya', reason: 'Stepping down.' }), /no workspace admin/);
  assert.throws(() => deactivatePerson(s, 'maya', { by: 'maya', reason: 'Leaving somehow.' }), /no workspace admin/);
  // Any other governed change now needs a second admin, which does not exist.
  assert.throws(() => proposeRosterChange(s, { kind: 'rights', person: 'elena', right: 'workspaceAdmin', grant: true, by: 'maya', reason: 'Finance needs an admin.' }), /No other workspace admin can sign this off/);
  // A Risk approver grant still has approvers: the existing Risk approvers.
  assert.deepEqual(openRosterProposal(proposeRosterChange(s, { kind: 'rights', person: 'elena', right: 'riskApprover', grant: true, by: 'maya', reason: 'Finance joins Risk sign-off.' }), 'elena').eligible.sort(), ['daniel', 'sofia']);
  // Deactivating a Risk approver goes through a proposal; a plain person does not.
  let t = initialState();
  const before = rosterVersions(t).length;
  t = deactivatePerson(t, 'daniel', { by: 'maya', reason: 'Leaving the company next month.' });
  assert.equal(rosterVersions(t).length, before, 'not applied yet');
  const pr = openRosterProposal(t, 'daniel');
  assert.equal(pr.kind, 'deactivate');
  assert.equal(isActivePerson(t, 'daniel'), true);
  t = approveRosterChange(t, pr.id, { by: 'jonas' });
  assert.equal(isActivePerson(t, 'daniel'), false);
  assert.equal(getRosterProposal(t, pr.id).status, 'approved');
  assert.equal(rosterVersions(t)[rosterVersions(t).length - 1].author, 'maya');
  // A person with no rights is deactivated directly.
  t = deactivatePerson(t, 'priya', { by: 'maya', reason: 'Left the company.' });
  assert.equal(isActivePerson(t, 'priya'), false);
  assert.equal(openRosterProposal(t, 'priya'), null);
  // Store actions.
  const store = createStore({});
  store.dispatch('proposeRosterChange', { kind: 'rights', person: 'elena', right: 'riskApprover', grant: true, by: 'maya', reason: 'Finance joins Risk sign-off.' });
  store.dispatch('approveRosterChange', 'RP-1', { by: 'jonas' });
  assert.equal(isRiskApprover(store.get(), 'elena'), true);
});

test('a grant cannot be approved by the person receiving it; a Risk approver grant can be approved by an existing Risk approver', () => {
  // Repro: Maya proposes the Risk approver right for Jonas; Jonas cannot approve his own grant.
  let s = initialState();
  s = proposeRosterChange(s, { kind: 'rights', person: 'jonas', right: 'riskApprover', grant: true, by: 'maya', reason: 'Engineering joins Risk sign-off.' });
  const pr = openRosterProposal(s, 'jonas');
  assert.ok(!pr.eligible.includes('jonas'), 'the recipient is not in the frozen set');
  assert.ok(!pr.eligible.includes('maya'), 'nor the proposer');
  assert.deepEqual(pr.eligible.sort(), ['daniel', 'sofia'], 'existing Risk approvers can sign a Risk approver grant');
  assert.throws(() => approveRosterChange(s, 'RP-1', { by: 'jonas' }), /receiving this right and cannot approve their own grant/);
  assert.equal(isRiskApprover(s, 'jonas'), false);
  s = approveRosterChange(s, 'RP-1', { by: 'sofia' });
  assert.equal(isRiskApprover(s, 'jonas'), true);
  assert.match(s.activity[0].body, /approved by Sofia Alvarez \(as a Risk approver\)/);
  // A grant to Maya (an admin) also has an approver: Jonas or a Risk approver, not Maya.
  let t = proposeRosterChange(initialState(), { kind: 'rights', person: 'maya', right: 'riskApprover', grant: true, by: 'jonas', reason: 'Product joins Risk sign-off.' });
  assert.deepEqual(openRosterProposal(t, 'maya').eligible.sort(), ['daniel', 'sofia']);
  assert.throws(() => approveRosterChange(t, 'RP-1', { by: 'maya' }), /cannot approve their own grant/);
  t = approveRosterChange(t, 'RP-1', { by: 'daniel' });
  assert.equal(isRiskApprover(t, 'maya'), true);
  // A workspace admin grant is admins only: a Risk approver cannot sign it, and the recipient cannot.
  let u = proposeRosterChange(initialState(), { kind: 'rights', person: 'priya', right: 'workspaceAdmin', grant: true, by: 'maya', reason: 'Operations needs an admin.' });
  assert.deepEqual(openRosterProposal(u, 'priya').eligible, ['jonas']);
  assert.throws(() => approveRosterChange(u, 'RP-1', { by: 'daniel' }), /not an active workspace admin/);
  assert.throws(() => approveRosterChange(u, 'RP-1', { by: 'priya' }), /cannot approve their own grant/);
  u = approveRosterChange(u, 'RP-1', { by: 'jonas' });
  assert.equal(isWorkspaceAdmin(u, 'priya'), true);
  // Removals keep the current rule: the subject may approve their own removal.
  let v = proposeRosterChange(initialState(), { kind: 'rights', person: 'jonas', right: 'workspaceAdmin', grant: false, by: 'maya', reason: 'Jonas moves to another workspace.' });
  v = approveRosterChange(v, 'RP-1', { by: 'jonas' });
  assert.equal(isWorkspaceAdmin(v, 'jonas'), false);
});

// ---------------------------------------------------------------------------
// Records keep history as it was (#24)
// ---------------------------------------------------------------------------

test('records, versions, approvals and proposals snapshot the person at write time; a later rename or rights change does not rewrite them', () => {
  let s = initialState();
  // Seeded records and first versions carry the seed roster.
  assert.deepEqual(s.decisionRecords[1].authorizedByAt, { key: 'maya', name: 'Maya Chen', title: 'Support Product Lead', team: 'Product', rights: { riskApprover: false, workspaceAdmin: true }, active: true });
  assert.equal(s.decisionRecords[1].ownerAt.key, 'maya');
  assert.equal(versionList(s, RR, 'contract')[0].authorAt.name, 'Maya Chen');
  assert.equal(snapshotPerson(s, 'system'), null);
  assert.equal(snapshotPerson(s, 'nobody'), null);
  // A capability proposal approved by Daniel as Risk, then Daniel loses the right and Maya is renamed.
  const value = { criteria: current(s, RR, 'criteria'), requirements: loosenedRequirements(s) };
  s = proposeAmendment(s, RR, 'criteria', { value, by: 'priya', reason: REASON });
  s = approveProposal(s, RR, 'P-1', { by: 'maya' });
  s = approveProposal(s, RR, 'P-1', { by: 'daniel' });
  s = authorize(selectDecision(s, RR, 'expand-limits'), RR, { by: 'maya' });
  const recId = lastDecisionId(s, RR);
  s = editPerson(s, 'maya', { name: 'Maya Chen-Ortiz', title: 'Director of Support Product', team: 'Support Product', by: 'jonas', reason: 'Promotion and name change.' });
  s = proposeRosterChange(s, { kind: 'rights', person: 'daniel', right: 'riskApprover', grant: false, by: 'jonas', reason: 'Daniel rotates off Risk sign-off.' });
  s = approveRosterChange(s, 'RP-1', { by: 'maya' });
  assert.equal(isRiskApprover(s, 'daniel'), false);
  assert.equal(people(s).maya.name, 'Maya Chen-Ortiz');
  // The record written before the changes keeps the old values.
  const rec = s.decisionRecords.find((r) => r.id === recId);
  assert.equal(rec.authorizedByAt.name, 'Maya Chen');
  assert.equal(rec.authorizedByAt.title, 'Support Product Lead');
  assert.equal(rec.authorizedByAt.team, 'Product');
  const p1 = getProposal(s, RR, 'P-1');
  assert.equal(p1.proposedByAt.name, 'Priya Natarajan');
  const danielApproval = p1.approvals.find((a) => a.by === 'daniel');
  assert.equal(danielApproval.byAt.rights.riskApprover, true, 'the approval keeps the right as it was');
  assert.equal(danielApproval.byAt.title, 'Risk & Compliance Lead');
  const applied = versionList(s, RR, 'requirements').find((v) => v.proposalId === 'P-1');
  assert.equal(applied.authorAt.name, 'Priya Natarajan');
  assert.equal(applied.approvals.find((a) => a.by === 'daniel').byAt.rights.riskApprover, true);
  // The roster proposal and versions snapshot too.
  const rp = getRosterProposal(s, 'RP-1');
  assert.equal(rp.personAt.rights.riskApprover, true, 'Daniel as he was when the removal was proposed');
  assert.equal(rp.approvals[0].byAt.name, 'Maya Chen-Ortiz', 'approved after the rename');
  const renameVersion = rosterVersions(s).find((v) => v.change && v.change.kind === 'edit' && v.change.key === 'maya');
  assert.equal(renameVersion.authorAt.name, 'Jonas Lindqvist');
  // A record written after the changes shows the new values.
  s = { ...s, capabilityData: { ...s.capabilityData, [RR]: { ...capData(s, RR), decision: { ...capData(s, RR).decision, proposed: { level: 4, limited: false } } } } };
  s = authorize(selectDecision(setRationale(s, RR, 'Testing the snapshot after a rename.'), RR, 'hold'), RR, { by: 'maya' });
  assert.equal(s.decisionRecords[s.decisionRecords.length - 1].authorizedByAt.name, 'Maya Chen-Ortiz');
  assert.equal(s.decisionRecords[s.decisionRecords.length - 1].authorizedByAt.title, 'Director of Support Product');
  // Views render the snapshot, not the current roster.
  setPeople(people(s));
  const html = String(decisionRecordView(s, recId));
  assert.ok(html.includes('Maya Chen</strong>'), 'old name on the old record');
  assert.ok(html.includes('Support Product Lead'));
  assert.ok(!html.includes('Chen-Ortiz'));
  const pv = String(proposalView(s, RR, 'P-1', new URLSearchParams('')));
  assert.ok(pv.includes('Risk approver at the time'));
  assert.ok(pv.includes('Priya Natarajan'));
  const vv = String(versionsView(s, RR, new URLSearchParams('kind=requirements')));
  assert.ok(vv.includes('Risk approver at the time'));
  setPeople(null);
  // The helper falls back to the roster only when no snapshot was saved.
  assert.equal(personAt(null, 'maya').snapshot, false);
  assert.equal(personAt(rec.authorizedByAt, 'maya').name, 'Maya Chen');
});

test('a deactivated person stays on the records they are on, as they were', () => {
  let s = initialState();
  s = proposeAmendment(s, RR, 'criteria', { value: { criteria: current(s, RR, 'criteria'), requirements: loosenedRequirements(s) }, by: 'elena', reason: REASON });
  s = deactivatePerson(s, 'elena', { by: 'maya', reason: 'Left the company.' });
  assert.equal(isActivePerson(s, 'elena'), false);
  const p = getProposal(s, RR, 'P-1');
  assert.equal(p.proposedByAt.name, 'Elena Rossi');
  assert.equal(p.proposedByAt.active, true, 'active when she proposed');
  setPeople(people(s));
  assert.ok(String(proposalView(s, RR, 'P-1', new URLSearchParams(''))).includes('Elena Rossi'));
  setPeople(null);
});

// ---------------------------------------------------------------------------
// Coverage warnings (#25). Never block; explain the gap; link to People.
// ---------------------------------------------------------------------------

function removeRight(s, person, right, by = 'maya', approver = 'jonas') {
  s = proposeRosterChange(s, { kind: 'rights', person, right, grant: false, by, reason: `${person} rotates off ${right}.` });
  const pr = openRosterProposal(s, person);
  return approveRosterChange(s, pr.id, { by: approver });
}

test('a High or Financial capability warns when fewer than two active Risk approvers are among its possible approvers', () => {
  let s = initialState();
  assert.equal(isHighOrFinancial(s, RR), true);
  assert.equal(isHighOrFinancial(s, TC), false);
  assert.deepEqual(riskCoverage(s, RR), { approvers: ['daniel', 'sofia'], needed: 2, short: false });
  assert.equal(coverageWarning(s, RR), null);
  assert.deepEqual(coverageWarnings(s), [], 'the seed has no gaps');
  // Low impact never needs Risk coverage.
  assert.equal(riskCoverage(s, TC).needed, 0);
  // Remove Sofia's right: Refund recommendation and the other High/Financial capabilities drop to one.
  s = removeRight(s, 'sofia', 'riskApprover');
  const w = coverageWarning(s, RR);
  assert.ok(w);
  assert.match(w.title, /only one active Risk approver/);
  assert.match(w.body, /Daniel Okafor is the only Risk approver/);
  assert.equal(w.link, '#/capabilities/refund-recommendation?tab=stakeholders');
  assert.deepEqual(w.links.map((l) => l.text), ['Stakeholders', 'People']);
  assert.ok(coverageWarnings(s).some((x) => x.capabilityId === 'account-closure'));
  assert.ok(!coverageWarnings(s).some((x) => x.capabilityId === TC));
  // Nothing is blocked: proposing on the capability still works (Daniel can be the Risk approver if someone else proposes).
  const value = { criteria: current(s, RR, 'criteria'), requirements: loosenedRequirements(s) };
  assert.ok(openProposal(proposeAmendment(s, RR, 'criteria', { value, by: 'priya', reason: REASON }), RR, 'criteria'));
  // Deactivating Daniel too: no Risk approver at all.
  s = proposeRosterChange(s, { kind: 'deactivate', person: 'daniel', by: 'maya', reason: 'Leaving the company.' });
  s = approveRosterChange(s, openRosterProposal(s, 'daniel').id, { by: 'jonas' });
  assert.match(coverageWarning(s, RR).title, /no active Risk approvers/);
  // Granting the right to a listed person clears it.
  s = proposeRosterChange(s, { kind: 'rights', person: 'elena', right: 'riskApprover', grant: true, by: 'maya', reason: 'Finance covers Risk sign-off.' });
  s = approveRosterChange(s, openRosterProposal(s, 'elena').id, { by: 'jonas' });
  s = proposeRosterChange(s, { kind: 'rights', person: 'priya', right: 'riskApprover', grant: true, by: 'maya', reason: 'Operations covers Risk sign-off.' });
  s = approveRosterChange(s, openRosterProposal(s, 'priya').id, { by: 'jonas' });
  assert.equal(coverageWarning(s, RR), null);
});

test('an open proposal is flagged when its frozen approvers can no longer satisfy the rule, and withdrawing is suggested', () => {
  let s = initialState();
  const value = { criteria: current(s, RR, 'criteria'), requirements: loosenedRequirements(s) };
  s = proposeAmendment(s, RR, 'criteria', { value, by: 'daniel', reason: REASON });
  const p = () => openProposal(s, RR, 'criteria') || getProposal(s, RR, 'P-1');
  assert.deepEqual(proposalSatisfiable(s, RR, p()), { ok: true, reason: null });
  assert.equal(proposalWarning(s, RR, p()), null);
  // Sofia is the only frozen approver with the Risk right. Remove it: the proposal cannot complete.
  s = removeRight(s, 'sofia', 'riskApprover');
  const w = proposalWarning(s, RR, p());
  assert.ok(w);
  assert.match(w.title, /P-1 on Refund recommendation can no longer be signed off/);
  assert.match(w.body, /none of the approvers frozen when it opened holds the Risk approver right now/);
  assert.match(w.body, /withdraw it and propose again/);
  assert.equal(w.link, '#/capabilities/refund-recommendation/proposals/P-1');
  assert.ok(coverageWarnings(s, RR).some((x) => x.kind === 'proposal'));
  // Approvals are still accepted where eligible; nothing is blocked, the gap is just explained.
  s = approveProposal(s, RR, 'P-1', { by: 'maya' });
  assert.equal(getProposal(s, RR, 'P-1').status, 'open');
  // The proposer withdraws; the warning goes with it.
  s = withdrawProposal(s, RR, 'P-1', { by: 'daniel', reason: 'Re-proposing with a fresh approver set.' });
  assert.deepEqual(coverageWarnings(s).filter((x) => x.kind === 'proposal'), []);
  // Deactivation of a frozen approver counts too (owner-only case).
  let [t, id] = blankCap();
  t = { ...t, capabilityData: { ...t.capabilityData, [id]: { ...capData(t, id), scenarios: seed.scenarios.slice(0, 2) } } };
  const d = defaultsFor(t, id);
  t = saveCriteria(t, id, { criteria: d.criteria, requirements: d.requirements, by: 'priya' });
  t = runSuite(t, id);
  t = proposeAmendment(t, id, 'criteria', { value: { criteria: current(t, id, 'criteria'), requirements: current(t, id, 'requirements') }, by: 'maya', reason: 'Non-owner proposing; the owner must approve.' });
  assert.equal(proposalSatisfiable(t, id, openProposal(t, id, 'criteria')).ok, true);
  t = deactivatePerson(t, 'priya', { by: 'maya', reason: 'Left the company.' });
  assert.match(proposalSatisfiable(t, id, openProposal(t, id, 'criteria')).reason, /owner .* can no longer do so/);
});

test('removing a right or deactivating someone shows the impact and still goes through with a reason', () => {
  let s = initialState();
  // Hypothetical only: nothing is written.
  const before = rosterVersions(s).length;
  const impact = rosterChangeImpact(s, { kind: 'rights', person: 'sofia', right: 'riskApprover', grant: false });
  assert.equal(rosterVersions(s).length, before);
  assert.equal(impact.any, true);
  assert.ok(impact.capabilities.some((c) => c.id === RR));
  assert.deepEqual(impact.proposals, []);
  // Granting never weakens coverage; Low-impact capabilities never appear.
  assert.equal(rosterChangeImpact(s, { kind: 'rights', person: 'elena', right: 'riskApprover', grant: true }).any, false);
  assert.ok(!impact.capabilities.some((c) => c.id === TC));
  // With an open proposal frozen on Sofia as the only Risk approver, deactivating her is named on the proposal side too.
  const value = { criteria: current(s, RR, 'criteria'), requirements: loosenedRequirements(s) };
  s = proposeAmendment(s, RR, 'criteria', { value, by: 'daniel', reason: REASON });
  const impact2 = rosterChangeImpact(s, { kind: 'deactivate', person: 'sofia' });
  assert.deepEqual(impact2.proposals.map((x) => x.id), ['P-1']);
  // The roster proposal records the impact; a reason is required; it is not blocked.
  assert.throws(() => proposeRosterChange(s, { kind: 'deactivate', person: 'sofia', by: 'maya', reason: '' }), /needs a reason/);
  s = proposeRosterChange(s, { kind: 'deactivate', person: 'sofia', by: 'maya', reason: 'Leaving the company; Risk cover to be rebuilt.' });
  const pr = openRosterProposal(s, 'sofia');
  assert.equal(pr.impact.any, true);
  assert.deepEqual(pr.impact.proposals.map((x) => x.id), ['P-1']);
  s = approveRosterChange(s, pr.id, { by: 'jonas' });
  assert.equal(isActivePerson(s, 'sofia'), false, 'went through');
  assert.ok(coverageWarnings(s).some((w) => w.kind === 'proposal' && w.proposalId === 'P-1'));
  // Direct deactivation of a person with no rights also records its impact on the version.
  let u = proposeAmendment(initialState(), RR, 'criteria', { value, by: 'daniel', reason: REASON });
  u = deactivatePerson(u, 'elena', { by: 'maya', reason: 'Left the company.' });
  const v = rosterVersions(u)[rosterVersions(u).length - 1];
  assert.equal(v.impact.any, false, 'Elena holds no right and is not needed for P-1');
  // The seeded demo story is unaffected.
  assert.deepEqual(coverageWarnings(initialState()), []);
});

test('no alert() pop-ups: every action error is shown inline on the page', () => {
  const dir = new URL('../src', import.meta.url).pathname;
  const files = [`${dir}/main.js`, `${dir}/ui.js`, ...readdirSync(`${dir}/views`).map((f) => `${dir}/views/${f}`)];
  const offenders = files.filter((f) => /\balert\(/.test(readFileSync(f, 'utf8'))).map((f) => f.split('/').slice(-2).join('/'));
  assert.deepEqual(offenders, []);
});

// ---------------------------------------------------------------------------
// Restriction rules come from the contract (#48)
// ---------------------------------------------------------------------------

test('restriction lines parse into threshold, window and fallback level', () => {
  assert.deepEqual(parseRestrictionLine('Misroute rate above 10% over 7 days returns the capability to Draft.'),
    { text: 'Misroute rate above 10% over 7 days returns the capability to Draft.', kind: 'restrict', threshold: { type: 'pct', value: 10 }, window: { days: 7 }, fallback: 2 });
  const words = parseRestrictionLine('Two confirmed hallucinated policy statements within 7 days returns the capability to Recommend.');
  assert.deepEqual([words.threshold, words.window, words.fallback], [{ type: 'count', value: 2 }, { days: 7 }, 1]);
  const rolling = parseRestrictionLine('Severe error rate above 5% across the rolling 50 autonomous cases returns the capability to Draft until reviewed.');
  assert.deepEqual([rolling.threshold, rolling.window, rolling.fallback], [{ type: 'pct', value: 5 }, { cases: 50 }, 2]);
  const incident = parseRestrictionLine('1 account change attempted by the AI in any 7-day window opens an incident; the capability stays at Observe.');
  assert.equal(incident.kind, 'incident');
  assert.equal(parseRestrictionLine('Error rate above 5% over 7 days pulls authority back.').fallback, null, 'no level named');
});

test('a rule is active only while the capability is above its fallback level; the contract decides the level', () => {
  const s = initialState();
  const rr = restrictionRules(s, RR);
  assert.equal(rr.length, 4, 'every contract line is a rule');
  assert.ok(rr.every((r) => r.fallback === 2 && !r.active), 'Refund recommendation is at Draft: its "returns to Draft" rules wait');
  assert.match(rr[0].text, /rolling 50/, 'the demo rule is in the contract');
  const up = { ...s, capabilities: s.capabilities.map((c) => (c.id === RR ? { ...c, authority: { level: 3, limited: true } } : c)) };
  assert.ok(restrictionRules(up, RR).every((r) => r.active), 'above Draft they apply');
  const [rd] = restrictionRules(s, 'response-drafting');
  assert.deepEqual([rd.fallback, rd.active], [1, true], 'a Draft-level contract rule runs at Draft (the contract wins)');
  const [rx] = restrictionRules(s, 'refund-execution-high-value');
  assert.deepEqual([rx.fallback, rx.active], [0, true]);
  const [ac] = restrictionRules(s, 'account-closure');
  assert.deepEqual([ac.kind, ac.active, ac.fallback], ['incident', true, null], 'an incident rule never changes authority');
});

test('a restriction line that names no level falls back one level', () => {
  let s = initialState();
  const v = current(s, 'ticket-classification', 'contract');
  s = amend(s, 'ticket-classification', 'contract', { value: { ...v, autoRestriction: ['Misroute rate above 10% over 7 days pulls authority back.'] }, author: 'maya', reason: 'Test: no level named.' });
  const [r] = restrictionRules(s, 'ticket-classification');
  assert.deepEqual([r.fallback, r.defaulted, r.active], [2, true, true]);
});

// ---------------------------------------------------------------------------
// Monitoring runs the contract's rules for every capability (#49)
// ---------------------------------------------------------------------------

test('monitoring runs wherever a contract rule applies, at any level, with its readings', () => {
  const s = initialState();
  const run = (id) => monitoringStatus(s, id);
  assert.equal(run('ticket-classification').running, true, 'Level 3');
  assert.equal(run('response-drafting').running, true, 'Level 2: the contract says so');
  assert.equal(run('refund-execution-high-value').running, true, 'Level 1');
  assert.equal(run(RR).running, false, 'Refund recommendation is at Draft and every rule returns it to Draft');
  const [tc] = run('ticket-classification').rules;
  assert.deepEqual([tc.value, tc.crossed], [3.8, false]);
  for (const c of s.capabilities) {
    const lines = current(s, c.id, 'contract').autoRestriction;
    for (const key of Object.keys(capData(s, c.id).ruleReadings)) assert.ok(lines.includes(key), `${c.id}: reading "${key}" matches a contract line`);
  }
});

test('a percentage rule is crossed above its limit, a count rule when the count reaches it', () => {
  const pct = { threshold: { type: 'pct', value: 10 } };
  const count = { threshold: { type: 'count', value: 2 } };
  assert.deepEqual([ruleCrossed(pct, 10), ruleCrossed(pct, 10.1)], [false, true]);
  assert.deepEqual([ruleCrossed(count, 1), ruleCrossed(count, 2)], [false, true]);
  assert.equal(ruleCrossed(pct, null), false, 'nothing measured is never a breach');
});

test('a capability added in the demo has rules but no measurements', () => {
  let s = initialState();
  s = addCapability(s, { name: 'Order lookup', summary: 'Finds an order from a ticket.', owner: 'maya', risk: LOW_RISK, startingLevel: 1, by: 'maya' });
  const id = s.capabilities[s.capabilities.length - 1].id;
  s = amend(s, id, 'contract', { value: { ...current(s, id, 'contract'), autoRestriction: ['Error rate above 10% over 7 days returns the capability to Draft.'] }, author: 'maya', reason: 'Test contract.' });
  const st = monitoringStatus(s, id);
  assert.equal(st.rules.length, 1);
  assert.deepEqual([st.rules[0].measured, st.rules[0].value, st.running], [false, null, false], 'no readings; at Level 1 a "returns to Draft" rule waits');
});

// ---------------------------------------------------------------------------
// Breach and fallback come from the contract (#50)
// ---------------------------------------------------------------------------

test('a breach returns the capability to the level its contract line names', () => {
  const s = initialState();
  const cases = [['ticket-classification', 2], ['response-drafting', 1], ['refund-execution-high-value', 0]];
  for (const [id, level] of cases) {
    const before = getCapability(s, id).authority.level;
    const b = simulateBreach(s, id);
    const c = getCapability(b, id);
    assert.deepEqual([c.authority.level, c.status, capData(b, id).reviewRequired], [level, 'review-required', true], id);
    const rec = b.decisionRecords[b.decisionRecords.length - 1];
    assert.deepEqual([rec.authorizedBy, rec.option, rec.previous.level, rec.next.level], ['system', 'auto-restrict', before, level], id);
    assert.ok(rec.rationale.includes(current(s, id, 'contract').autoRestriction[0]), `${id}: the record quotes the contract rule`);
    assert.equal(b.alerts[0].capabilityId, id);
    assert.ok(capData(b, id).evidence[0].source === 'Incident' && capData(b, id).evidence[0].status === 'fail');
    assert.equal(simulateBreach(b, id), b, 'idempotent');
    assert.equal(canAuthorize(selectDecision(b, id, 'expand'), id).ok, false, 'no expansion before review');
  }
});

test('the Refund recommendation demo breach still returns it to Draft from its contract rule', () => {
  let s = authorize(selectDecision(initialState(), RR, 'expand-limits'), RR);
  assert.ok(breachRule(s, RR), 'at Level 3 the rolling-window rule applies');
  s = simulateBreach(s, RR);
  const rec = s.decisionRecords[s.decisionRecords.length - 1];
  assert.deepEqual([rec.previous, rec.next], [{ level: 3, limited: true }, { level: 2, limited: false }]);
  assert.match(rec.rationale, /6% across the rolling 50-case window \(limit 5%\)/);
  assert.match(rec.rationale, /AC-04/);
  assert.equal(capData(s, RR).ruleReadings[current(s, RR, 'contract').autoRestriction[0]], 6);
});

test('an incident rule opens an incident and never changes authority', () => {
  const s = initialState();
  const b = simulateBreach(s, 'account-closure');
  assert.deepEqual(getCapability(b, 'account-closure').authority, getCapability(s, 'account-closure').authority);
  assert.equal(b.decisionRecords.length, s.decisionRecords.length, 'no decision record');
  assert.equal(capData(b, 'account-closure').reviewRequired, false);
  assert.equal(capData(b, 'account-closure').ruleIncidents.length, 1);
  assert.equal(capData(b, 'account-closure').evidence[0].source, 'Incident');
  assert.equal(simulateBreach(b, 'account-closure'), b, 'one incident per demo breach');
});

test('capabilities added in the demo have no simulated breach', () => {
  let s = addCapability(initialState(), { name: 'Order lookup', summary: 'Finds an order.', owner: 'maya', risk: LOW_RISK, startingLevel: 1, by: 'maya' });
  const id = s.capabilities[s.capabilities.length - 1].id;
  assert.equal(breachRule(s, id), null);
  assert.equal(simulateBreach(s, id), s);
});
