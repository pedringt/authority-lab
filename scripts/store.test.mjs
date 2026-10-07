import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as seed from '../src/data/seed.js';
import {
  initialState, startTestRun, advanceTestRun, selectDecision, setCondition, setRationale,
  canAuthorize, authorize, simulateBreach, reset, readiness, testSummary, getCapability, capData,
  focusCapability, conditionsPreview, createStore, STORAGE_KEY,
  amend, currentVersion, versionsInForce, hasEvidence, isSurfaced, VERSIONED_KINDS,
} from '../src/store.js';

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
  assert.equal(s.version, 3);
  assert.equal(STORAGE_KEY, 'authority-lab-state-v3');
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
  mem.set(STORAGE_KEY, JSON.stringify({ version: 2, decisionRecords: [] }));
  assert.deepEqual(createStore({ storage }).get(), initialState());
});

// ---------------------------------------------------------------------------
// Three-tier record model (#2)
// ---------------------------------------------------------------------------

test('every capability starts with version 1 of each versioned object, matching its current value', () => {
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
    assert.deepEqual(currentVersion(s, c.id, 'contract').value, c.contract);
    assert.deepEqual(currentVersion(s, c.id, 'risk').value, c.risk);
    assert.deepEqual(currentVersion(s, c.id, 'criteria').value, d.criteria);
    assert.deepEqual(currentVersion(s, c.id, 'requirements').value, d.requirements);
    assert.deepEqual(currentVersion(s, c.id, 'stakeholders').value, d.stakeholders);
  }
  assert.deepEqual(versionsInForce(s, RR), { contract: 1, criteria: 1, requirements: 1, risk: 1, stakeholders: 1 });
});

test('every seeded activity event has a kind and is surfaced; every seeded record names its versions', () => {
  const s = initialState();
  for (const e of s.activity) {
    assert.ok(e.kind, e.id);
    assert.equal(e.surfaced, true, e.id);
    assert.equal(isSurfaced(e), true, e.id);
  }
  for (const r of s.decisionRecords) {
    assert.deepEqual(r.versions, { contract: 1, criteria: 1, requirements: 1, risk: 1, stakeholders: 1 }, r.id);
  }
});

test('amend writes a new version, keeps the old one intact, and updates the current value', () => {
  let s = initialState();
  const before = cap(s).contract;
  const value = { ...before, mustNever: [...before.mustNever, 'Issue a refund while a fraud review is open.'] };
  s = amend(s, RR, 'contract', { value, author: 'maya', reason: 'Close the gap found in INC-01.' });
  const v2 = currentVersion(s, RR, 'contract');
  assert.equal(v2.version, 2);
  assert.equal(v2.author, 'maya');
  assert.equal(v2.reason, 'Close the gap found in INC-01.');
  assert.deepEqual(v2.before, before);
  assert.deepEqual(v2.value, value);
  assert.deepEqual(cap(s).contract, value, 'current contract follows the latest version');
  const v1 = capData(s, RR).versions.contract[0];
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
  s = amend(s, RR, 'requirements', { value: capData(s, RR).requirements.map((r) => (r.id === 'high-value' ? { ...r, text: 'Minimum 30 high-value refund cases' } : r)), author: 'priya', reason: 'Lower the bar.' });
  assert.equal(currentVersion(s, RR, 'requirements').version, 2);
  assert.equal(capData(s, RR).requirements.find((r) => r.id === 'high-value').text, 'Minimum 30 high-value refund cases');
  s = amend(s, RR, 'criteria', { value: capData(s, RR).criteria.slice(0, 3), author: 'maya', reason: 'Trim.' });
  assert.equal(capData(s, RR).criteria.length, 3);
  s = amend(s, RR, 'risk', { value: { ...cap(s).risk, impact: 'Medium' }, author: 'daniel', reason: 'Reassessed.' });
  assert.equal(cap(s).risk.impact, 'Medium');
  s = amend(s, RR, 'stakeholders', { value: [], author: 'maya', reason: 'Reset positions.' });
  assert.deepEqual(capData(s, RR).stakeholders, []);
  assert.throws(() => amend(s, RR, 'contract', { value: {}, author: 'maya', reason: '' }), /reason/);
  assert.throws(() => amend(s, RR, 'contract', { value: {}, author: 'nobody', reason: 'x' }), /author/);
  assert.throws(() => amend(s, RR, 'pilot', { value: {}, author: 'maya', reason: 'x' }), /Unknown versioned/);
  assert.throws(() => amend(s, 'no-such', 'contract', { value: {}, author: 'maya', reason: 'x' }), /Unknown capability/);
});

test('afterEvidence is set from whether evidence existed, and decides whether the amendment is surfaced', () => {
  let s = initialState();
  assert.equal(hasEvidence(s, RR), true);
  assert.equal(hasEvidence(s, TC), false);
  s = amend(s, TC, 'contract', { value: { ...cap(s, TC).contract, may: [] }, author: 'priya', reason: 'Tighten before any evidence.' });
  assert.equal(currentVersion(s, TC, 'contract').afterEvidence, false);
  assert.equal(s.activity[0].kind, 'amendment');
  assert.equal(s.activity[0].surfaced, false, 'an amendment before evidence is recorded but not surfaced');
  assert.equal(s.activity[0].capabilityId, TC);
  s = amend(s, RR, 'criteria', { value: capData(s, RR).criteria, author: 'maya', reason: 'Re-saved after the pilot.' });
  assert.equal(currentVersion(s, RR, 'criteria').afterEvidence, true);
  assert.equal(s.activity[0].surfaced, true, 'an amendment after evidence is surfaced');
  assert.match(s.activity[0].body, /after evidence existed/);
});

test('decision records save the version numbers in force at the time', () => {
  let s = initialState();
  s = amend(s, RR, 'contract', { value: cap(s).contract, author: 'maya', reason: 'Re-confirmed.' });
  s = amend(s, RR, 'contract', { value: cap(s).contract, author: 'maya', reason: 'Re-confirmed again.' });
  s = amend(s, RR, 'criteria', { value: capData(s, RR).criteria, author: 'maya', reason: 'Re-confirmed.' });
  s = authorize(selectDecision(s, RR, 'expand-limits'), RR);
  const rec = s.decisionRecords[s.decisionRecords.length - 1];
  assert.deepEqual(rec.versions, { contract: 3, criteria: 2, requirements: 1, risk: 1, stakeholders: 1 });
  // A later amendment does not change the record.
  s = amend(s, RR, 'contract', { value: cap(s).contract, author: 'maya', reason: 'Later.' });
  assert.equal(s.decisionRecords[s.decisionRecords.length - 1].versions.contract, 3);
  // The automatic restriction record names versions too.
  s = simulateBreach(s, RR);
  assert.deepEqual(s.decisionRecords[s.decisionRecords.length - 1].versions, { contract: 4, criteria: 2, requirements: 1, risk: 1, stakeholders: 1 });
});

test('amend is available through the store and persists', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const store = createStore({ storage });
  store.dispatch('amend', RR, 'risk', { value: { ...cap(store.get()).risk, impact: 'Medium' }, author: 'daniel', reason: 'Reassessed.' });
  const again = createStore({ storage });
  assert.equal(currentVersion(again.get(), RR, 'risk').version, 2);
  assert.equal(cap(again.get()).risk.impact, 'Medium');
});
