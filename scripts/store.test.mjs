import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as seed from '../src/data/seed.js';
import {
  initialState, startTestRun, advanceTestRun, selectDecision, setCondition, setRationale,
  canAuthorize, authorize, simulateBreach, reset, readiness, testSummary, getCapability, capData,
  focusCapability, conditionsPreview, createStore, STORAGE_KEY,
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
  assert.equal(s.version, 2);
  assert.equal(STORAGE_KEY, 'authority-lab-state-v2');
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
  assert.equal(s.activity[0].type, 'test');
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
  assert.equal(s.activity[0].type, 'authority');
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
  assert.equal(s.activity[0].type, 'restriction');
  assert.equal(s.activity[1].type, 'failure');
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
  // A v1 payload is ignored.
  mem.set(STORAGE_KEY, JSON.stringify({ version: 1, decisionRecords: [] }));
  assert.deepEqual(createStore({ storage }).get(), initialState());
});
