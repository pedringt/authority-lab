import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as seed from '../src/data/seed.js';
import {
  initialState, startTestRun, advanceTestRun, selectDecision, setCondition, setRationale,
  canAuthorize, authorize, simulateBreach, reset, readiness, testSummary, getCapability,
  conditionsPreview, createStore, STORAGE_KEY,
} from '../src/store.js';

const cap = (s) => getCapability(s, 'refund-recommendation');

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

test('initial state: decision required, 5 of 6 requirements met', () => {
  const s = initialState();
  assert.deepEqual(cap(s).authority, { level: 2, limited: false });
  assert.equal(cap(s).decisionRequired, true);
  const r = readiness(s);
  assert.equal(r.met, 5);
  assert.equal(r.total, 6);
  assert.equal(r.unmet[0].id, 'high-value');
  assert.equal(s.monitoring, null);
  assert.equal(s.alerts.length, 0);
});

test('test suite runs to completion and updates evidence', () => {
  let s = startTestRun(initialState());
  assert.equal(s.testRun.status, 'running');
  for (let i = 0; i < 100 && s.testRun.status === 'running'; i++) s = advanceTestRun(s);
  const t = testSummary(s);
  assert.equal(t.status, 'complete');
  assert.equal(t.completed, 26);
  assert.equal(t.passed, 24);
  assert.equal(t.failed, 2);
  assert.equal(t.highSeverity, 1);
  const ev = s.evidence.find((e) => e.id === 'EV-01');
  assert.equal(ev.value, '24 of 26 passed');
  assert.equal(ev.date, seed.TODAY);
  assert.equal(s.activity[0].type, 'test');
});

test('authorize requires an option and a rationale', () => {
  let s = initialState();
  assert.equal(canAuthorize(s).ok, false);
  s = selectDecision(s, 'expand-limits');
  assert.equal(canAuthorize(s).ok, true);
  s = setRationale(s, '');
  assert.equal(canAuthorize(s).ok, false);
  assert.throws(() => authorize(s), /rationale/i);
});

test('expand with limits: authority changes, record is written with snapshot and conditions', () => {
  let s = selectDecision(initialState(), 'expand-limits');
  s = setCondition(s, 'maxValue', 50);
  s = authorize(s, { by: 'maya' });
  assert.deepEqual(cap(s).authority, { level: 3, limited: true });
  assert.equal(cap(s).status, 'monitoring');
  assert.equal(cap(s).decisionRequired, false);
  const rec = s.decisionRecords[s.decisionRecords.length - 1];
  assert.equal(rec.id, 'AC-04');
  assert.equal(rec.number, 4);
  assert.equal(rec.authorizedBy, 'maya');
  assert.deepEqual(rec.previous, { level: 2, limited: false });
  assert.deepEqual(rec.next, { level: 3, limited: true });
  assert.ok(rec.evidenceSnapshot.includes('218 pilot cases'));
  assert.equal(rec.conditions.maxValue, 50);
  assert.match(rec.scope, /≤ \$50/);
  assert.ok(s.monitoring && s.monitoring.breached === false);
  assert.equal(s.activity[0].type, 'authority');
  assert.equal(s.decision.recordId, 'AC-04');
});

test('authority can move down: restrict and suspend', () => {
  let s = authorize(selectDecision(initialState(), 'restrict'));
  assert.deepEqual(cap(s).authority, { level: 1, limited: false });
  assert.equal(cap(s).status, 'restricted');
  assert.equal(s.monitoring, null);
  s = authorize(selectDecision(initialState(), 'suspend'));
  assert.deepEqual(cap(s).authority, { level: 0, limited: false });
});

test('hold keeps authority and still writes a record', () => {
  const s = authorize(selectDecision(initialState(), 'hold'));
  assert.deepEqual(cap(s).authority, { level: 2, limited: false });
  assert.equal(s.decisionRecords.length, 4);
});

test('threshold breach restricts automatically, creates alert, event, record, review-required', () => {
  let s = authorize(selectDecision(initialState(), 'expand-limits'));
  s = simulateBreach(s);
  assert.deepEqual(cap(s).authority, { level: 2, limited: false });
  assert.equal(cap(s).status, 'review-required');
  assert.equal(s.reviewRequired, true);
  assert.equal(s.alerts.length, 1);
  assert.equal(s.monitoring.breached, true);
  assert.equal(s.monitoring.severeErrorsInWindow, 3);
  const rec = s.decisionRecords[s.decisionRecords.length - 1];
  assert.equal(rec.authorizedBy, 'system');
  assert.equal(rec.option, 'auto-restrict');
  assert.equal(rec.next.level, 2);
  assert.equal(s.activity[0].type, 'restriction');
  assert.equal(s.activity[1].type, 'failure');
  assert.ok(s.evidence.some((e) => e.id === 'EV-13' && e.status === 'fail'));
  // Earlier records are untouched.
  assert.equal(s.decisionRecords[3].id, 'AC-04');
  assert.deepEqual(s.decisionRecords[3].next, { level: 3, limited: true });
  // Breach is idempotent and cannot run without monitoring.
  assert.equal(simulateBreach(s), s);
  const fresh = initialState();
  assert.equal(simulateBreach(fresh), fresh);
});

test('after a breach, expansion cannot be authorized until review', () => {
  let s = simulateBreach(authorize(selectDecision(initialState(), 'expand-limits')));
  s = { ...s, capabilities: s.capabilities.map((c) => (c.id === 'refund-recommendation' ? { ...c, decisionRequired: true } : c)) };
  s = selectDecision(s, 'expand');
  const check = canAuthorize(s);
  assert.equal(check.ok, false);
  assert.match(check.reason, /review/i);
  // Restricting further is still allowed.
  assert.equal(canAuthorize(selectDecision(s, 'restrict')).ok, true);
});

test('reset restores the seeded state', () => {
  let s = simulateBreach(authorize(selectDecision(initialState(), 'expand-limits')));
  s = reset(s);
  assert.deepEqual(s, initialState());
});

test('conditions preview reads as plain English', () => {
  const text = conditionsPreview(seed.defaultConditions);
  assert.match(text, /\$50 or less/);
  assert.match(text, /at least 90%/);
  assert.match(text, /Fraud-signaled, ambiguous, high-value, policy-exception and chargeback cases continue to require human review\./);
});

test('store persists and discards an interrupted run on reload', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const store = createStore({ storage });
  store.dispatch('startTestRun');
  store.dispatch('advanceTestRun');
  assert.equal(JSON.parse(mem.get(STORAGE_KEY)).testRun.status, 'running');
  const store2 = createStore({ storage });
  assert.equal(store2.get().testRun.status, 'not-run');
  store2.dispatch('selectDecision', 'hold');
  store2.dispatch('authorize');
  const store3 = createStore({ storage });
  assert.equal(store3.get().decisionRecords.length, 4);
  store3.dispatch('reset');
  assert.deepEqual(store3.get(), initialState());
});
