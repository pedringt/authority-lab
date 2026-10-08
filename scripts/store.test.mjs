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
} from '../src/store.js';
import { starterScenarios } from '../src/data/scenario-templates.js';
import { defaultCriteria, defaultRequirements } from '../src/data/criteria-defaults.js';
import { pickTemplate, suggestLines } from '../src/data/contract-templates.js';
import { diffValues } from '../src/diff.js';

const RR = 'refund-recommendation';
const TC = 'ticket-classification';
const cap = (s, id = RR) => getCapability(s, id);

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
  assert.equal(seed.stakeholders.length, 4);
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
  assert.equal(s.version, 9);
  assert.equal(STORAGE_KEY, 'authority-lab-state-v9');
  assert.deepEqual(Object.keys(s.capabilityData).sort(), seed.capabilities.map((c) => c.id).sort());
  assert.deepEqual(cap(s).authority, { level: 2, limited: false });
  assert.equal(cap(s).decisionRequired, true);
  assert.equal(capData(s, RR).scenarios.length, 26);
  assert.equal(capData(s, RR).evidence.length, 12);
  assert.equal(capData(s, RR).monitoring, null);
  assert.equal(capData(s, TC).scenarios.length, 0);
  assert.equal(capData(s, TC).pilot, null);
  assert.equal(s.alerts.length, 0);
  assert.equal(focusCapability(s).id, RR);
});

test('readiness is computed per capability', () => {
  const s = initialState();
  const r = readiness(s, RR);
  assert.equal(r.met, 5);
  assert.equal(r.total, 6);
  assert.equal(r.unmet[0].id, 'high-value');
  assert.deepEqual(readiness(s, TC), { met: 0, total: 0, unmet: [] });
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
  assert.equal(s.activity[0].kind, 'test');
  assert.equal(s.activity[0].surfaced, true);
  assert.equal(s.activity[0].capabilityId, RR);
  assert.equal(capData(s, TC).evidence.length, 0);
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
  assert.equal(cap(s).decisionRequired, false);
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
  // Breach is idempotent and cannot run without monitoring.
  assert.equal(simulateBreach(s, RR), s);
  const fresh = initialState();
  assert.equal(simulateBreach(fresh, RR), fresh);
  assert.equal(simulateBreach(fresh, TC), fresh);
});

test('after a breach, expansion cannot be authorized until review', () => {
  let s = simulateBreach(authorize(selectDecision(initialState(), RR, 'expand-limits'), RR), RR);
  s = { ...s, capabilities: s.capabilities.map((c) => (c.id === RR ? { ...c, decisionRequired: true } : c)) };
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
  assert.equal(cap(s, RR).decisionRequired, true);
  const rec = s.decisionRecords[s.decisionRecords.length - 1];
  assert.equal(rec.capabilityId, TC);
  assert.equal(rec.authorizedBy, 'priya');
  assert.deepEqual(rec.evidenceSnapshot, []);
  assert.equal(readiness(s, TC).total, 0);
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
  mem.set(STORAGE_KEY, JSON.stringify({ version: 8, decisionRecords: [] }));
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
  let s = initialState();
  assert.equal(performanceResultsSeen(s, RR), true);
  assert.equal(performanceResultsSeen(s, TC), false);
  s = amend(s, TC, 'contract', { value: { ...current(s, TC, 'contract'), may: [] }, author: 'priya', reason: 'Tighten before any evidence.' });
  assert.equal(currentVersion(s, TC, 'contract').afterEvidence, false);
  assert.equal(s.activity[0].kind, 'amendment');
  assert.equal(s.activity[0].surfaced, false, 'an amendment before evidence is recorded but not surfaced');
  assert.equal(s.activity[0].capabilityId, TC);
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
  let s = initialState();
  // Ticket classification: no results yet.
  assert.equal(performanceResultsSeen(s, TC), false);
  // A stakeholder assessment alone does not count.
  s = { ...s, capabilityData: { ...s.capabilityData, [TC]: { ...capData(s, TC), evidence: [{ id: 'X', source: 'Stakeholder assessment', metric: 'm', value: 'v', status: 'watch', risk: 'Low', segment: 'All', date: seed.TODAY, detail: '', link: '' }] } } };
  assert.equal(performanceResultsSeen(s, TC), false);
  // User feedback alone does not count either.
  s = { ...s, capabilityData: { ...s.capabilityData, [TC]: { ...capData(s, TC), evidence: [{ id: 'X', source: 'User feedback', metric: 'm', value: 'v', status: 'pass', risk: 'Low', segment: 'All', date: seed.TODAY, detail: '', link: '' }] } } };
  assert.equal(performanceResultsSeen(s, TC), false);
  // A measured item does.
  s = { ...s, capabilityData: { ...s.capabilityData, [TC]: { ...capData(s, TC), evidence: [{ id: 'X', source: 'Operational metrics', metric: 'm', value: 'v', status: 'pass', risk: 'Low', segment: 'All', date: seed.TODAY, detail: '', link: '' }] } } };
  assert.equal(performanceResultsSeen(s, TC), true);
  // So does a recorded test run with no evidence items at all.
  let t = initialState();
  t = { ...t, capabilityData: { ...t.capabilityData, [TC]: { ...capData(t, TC), testRun: { status: 'not-run', lastRun: '2026-10-01', completed: [] } } } };
  assert.equal(performanceResultsSeen(t, TC), true);
  // And a pilot.
  let u = initialState();
  u = { ...u, capabilityData: { ...u.capabilityData, [TC]: { ...capData(u, TC), pilot: { cases: 10, segments: [] } } } };
  assert.equal(performanceResultsSeen(u, TC), true);
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
  let s = initialState();
  s = amend(s, TC, 'risk', { value: { ...current(s, TC, 'risk'), impact: 'Medium' }, author: 'priya', reason: 'Reassessed.' });
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
  assert.equal(cap(s).decisionRequired, true);
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
  assert.deepEqual(namedStakeholders(s, RR).sort(), ['daniel', 'elena', 'maya', 'priya'].sort(), 'owner, listed stakeholders, Risk team');
  assert.deepEqual(namedStakeholders(s, TC).sort(), Object.keys(seed.people).sort(), 'no stakeholders listed: any named person');
  assert.equal(isRiskStakeholder(s, RR, 'daniel'), true);
  assert.equal(isRiskStakeholder(s, RR, 'elena'), false);
  // A stakeholder entry labelled Risk does not make someone Risk.
  const relabel = amend(s, RR, 'stakeholders', { value: current(s, RR, 'stakeholders').map((x) => (x.person === 'elena' ? { ...x, team: 'Risk' } : x)), author: 'maya', reason: 'Relabel for the test.' });
  assert.equal(isRiskStakeholder(relabel, RR, 'elena'), false);
  assert.equal(needsSignoff(s, RR, 'criteria'), true, 'refund criteria are locked');
  assert.equal(needsSignoff(s, TC, 'criteria'), false, 'ticket classification has no criteria, so nothing is locked');
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
  // Give ticket classification criteria and lock them with a run of borrowed scenarios.
  let s = initialState();
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
  let u = initialState();
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
  let v = initialState();
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
  assert.equal(getCapability(s, id).decisionRequired, true);
  assert.deepEqual(getCapability(s, id).proposed, { level: 2, limited: false });
  assert.equal(s.activity[0].kind, 'decision');
  assert.throws(() => proposeAuthority(s, id, 2, { by: 'priya' }), /already open/);
  s = authorize(selectDecision(s, id, 'expand'), id, { by: 'priya' });
  const c = getCapability(s, id);
  assert.deepEqual(c.authority, { level: 2, limited: false });
  assert.equal(c.status, 'pilot');
  assert.equal(c.decisionRequired, false);
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
  assert.equal(getCapability(store.get(), RR).decisionRequired, true);
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
  // Ticket classification (Low impact) with criteria locked: owner-proposed, so one other named stakeholder approves.
  let s = initialState();
  s = { ...s, capabilityData: { ...s.capabilityData, [TC]: { ...capData(s, TC), scenarios: seed.scenarios.slice(0, 2) } } };
  s = saveStakeholders(s, TC, { stakeholders: [{ team: 'Support Operations', person: 'priya' }, { team: 'Product', person: 'maya' }], by: 'priya' });
  const d = defaultsFor(s, TC);
  s = saveCriteria(s, TC, { criteria: d.criteria, requirements: d.requirements, by: 'priya' });
  s = runSuite(s, TC);
  const value = { criteria: current(s, TC, 'criteria'), requirements: current(s, TC, 'requirements').map((r) => (r.id === 'min-cases' ? { ...r, text: 'Minimum 30 pilot cases' } : r)) };
  s = proposeAmendment(s, TC, 'criteria', { value, by: 'priya', reason: 'Owner proposing; one other stakeholder must approve.' });
  const p = openProposal(s, TC, 'criteria');
  assert.deepEqual(p.eligible.sort(), ['daniel', 'maya'], 'listed stakeholders plus Risk, minus the proposer, at open time');
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
