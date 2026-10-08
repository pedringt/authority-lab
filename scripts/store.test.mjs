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
} from '../src/store.js';
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
  assert.equal(s.version, 6);
  assert.equal(STORAGE_KEY, 'authority-lab-state-v6');
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
  mem.set(STORAGE_KEY, JSON.stringify({ version: 5, decisionRecords: [] }));
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
  const allowed = [/\bx\.versions\b/g, /\brecord\.versions\b/g, /\be\.risk\b/g];
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
