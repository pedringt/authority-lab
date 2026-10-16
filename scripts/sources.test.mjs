// Evidence sources and manual evidence (#126, PR 1): sources are a workspace
// object, a connected system registers itself by sending evidence, and a
// person can record a result by hand, kept as recorded.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState, startEmpty, capData, getCapability, people, setActingAs, activityEvents, deactivatePerson, addCapability, defaultsFor, saveCriteria, criteriaLocked,
  importEvidence, EVIDENCE_SCHEMA, evidenceSources, findSource, sourceOfItem, recordManualEvidence, manualEntryEligibility, startTestRun, advanceTestRun,
  evidenceFrom, judgeMeasure, BUILT_IN_SOURCES, TESTS_SOURCE, MANUAL_SOURCE,
} from '../src/store/index.js';
import { setPeople } from '../src/ui.js';
import { sourcesView, recordEvidenceView } from '../src/views/sources.js';
import { evidenceView } from '../src/views/evidence.js';

const RR = 'refund-recommendation';
const TC = 'ticket-classification';
const LOW = { impact: 'Low', reversibility: 'Easy to reverse', exposure: 'Internal only' };
const env = (over = {}) => ({
  schema: EVIDENCE_SCHEMA, id: 'acme:eval:1', capabilityId: TC, source: { system: 'Acme', capability: 'Classifier' }, kind: 'eval', observedAt: '2026-10-05',
  measurements: [{ metric: 'quality', label: 'Classification quality', type: 'rate', passed: 46, total: 50 }, { metric: 'quality', label: 'Classification quality', type: 'rate', passed: 8, total: 10, segment: 'Ambiguous' }],
  ...over,
});
const manual = (s, over = {}) => recordManualEvidence(s, RR, { by: 'maya', label: 'Policy compliance in a Risk review', kind: 'production', type: 'rate', passed: '18', total: '20', ...over });

test('every workspace has the three built-in sources; the demo adds three example ones; Start empty keeps only the built-ins', () => {
  const ids = (s) => evidenceSources(s).map((x) => x.id);
  assert.deepEqual(ids(initialState()), [TESTS_SOURCE, MANUAL_SOURCE, 'feedback', 'support-platform-refund-decisions', 'ticketing-escalations', 'eval-harness-refund-suite']);
  assert.ok(evidenceSources(initialState()).slice(3).every((x) => x.example && x.connection === 'connected'));
  const s = importEvidence(initialState(), env());
  assert.equal(evidenceSources(s).length, 7);
  assert.deepEqual(ids(startEmpty(s)), [TESTS_SOURCE, MANUAL_SOURCE, 'feedback']);
  assert.deepEqual(BUILT_IN_SOURCES.map((x) => x.connection), ['built-in', 'manual', 'manual']);
});

test('a connected system becomes a source the first time it sends evidence, and shows what it has sent', () => {
  let s = importEvidence(initialState(), env());
  const src = findSource(s, 'acme-classifier');
  assert.equal(src.name, 'Acme · Classifier');
  assert.equal(src.kind, 'eval');
  assert.equal(src.connection, 'connected');
  assert.equal(src.freshForDays, 30, 'evals stay fresh for 30 days');
  assert.deepEqual(src.metrics, [{ metric: 'quality', label: 'Classification quality', type: 'rate', segments: ['Ambiguous'] }]);
  assert.equal(src.lastReceived, '2026-10-05');
  assert.deepEqual(src.capabilities, [TC]);
  assert.equal(activityEvents(s).filter((e) => e.kind === 'evidence-source').length, 1);
  assert.match(activityEvents(s).find((e) => e.kind === 'evidence-source').title, /^Evidence source connected: Acme · Classifier$/);
  // A second run from the same system is no new source.
  s = importEvidence(s, env({ id: 'acme:production:2', kind: 'production', observedAt: '2026-10-06', measurements: [{ metric: 'escalations', type: 'count', value: 2, total: 40 }] }));
  assert.equal(evidenceSources(s).filter((x) => x.id.startsWith('acme')).length, 1);
  assert.equal(activityEvents(s).filter((e) => e.kind === 'evidence-source').length, 1);
  assert.equal(findSource(s, 'acme-classifier').lastReceived, '2026-10-06');
  // Every imported item names its source.
  assert.ok(capData(s, TC).evidence.filter((e) => e.external).every((e) => sourceOfItem(e) === 'acme-classifier'));
});

test('test runs belong to the built-in tests source; seeded demo items to none', () => {
  let s = startTestRun(initialState(), RR);
  for (let i = 0; i < 200 && capData(s, RR).testRun.status === 'running'; i++) s = advanceTestRun(s, RR);
  const items = capData(s, RR).evidence;
  assert.equal(sourceOfItem(items.find((e) => e.source === 'Automated tests')), TESTS_SOURCE);
  assert.equal(sourceOfItem(items.find((e) => e.id === 'EV-02')), null);
  assert.equal(findSource(s, TESTS_SOURCE).lastReceived, s.today);
  // The seeded test runs count too: the tests source reports through recorded runs.
  assert.ok(findSource(initialState(), TESTS_SOURCE).capabilities.includes(RR));
});

test('the owner or a named stakeholder records a result by hand; it is kept as recorded, with who recorded it', () => {
  const s = manual(initialState());
  const item = capData(s, RR).evidence.find((e) => e.from === 'manual');
  assert.equal(item.id, 'manual:refund-recommendation:1#policy-compliance-in-a-risk-review');
  assert.equal(item.value, '90% (18 of 20)');
  assert.equal(item.sourceId, MANUAL_SOURCE);
  assert.equal(item.recordedBy.name, 'Maya Chen');
  assert.equal(item.external.kind, 'production');
  assert.equal(evidenceFrom(item), 'manual');
  assert.equal(findSource(s, MANUAL_SOURCE).lastReceived, s.today);
  assert.equal(evidenceSources(s).length, evidenceSources(initialState()).length, 'a hand-recorded result registers no new source');
  const ev = activityEvents(s).find((e) => e.kind === 'evidence-imported');
  assert.equal(ev.title, 'Result recorded by Maya Chen');
  assert.match(ev.body, /Refund recommendation: Policy compliance in a Risk review, 90% \(18 of 20\) \(in real use, 2026-10-07\), recorded by hand\./);
  // A named stakeholder may; the next one gets its own id.
  const s2 = manual(s, { by: 'daniel', label: 'Escalations reviewed', type: 'count', value: '1', total: '20', severity: 'high' });
  assert.equal(capData(s2, RR).evidence.filter((e) => e.from === 'manual' && !e.demo).length, 2);
  assert.ok(capData(s2, RR).evidence.some((e) => e.id === 'manual:refund-recommendation:2#escalations-reviewed' && e.risk === 'High'));
});

test('nobody else may record one: not a non-stakeholder, not someone deactivated, and an empty list means the owner alone', () => {
  const s = initialState();
  assert.equal(manualEntryEligibility(s, RR, 'jonas').ok, false);
  assert.throws(() => manual(s, { by: 'jonas' }), /Jonas Lindqvist isn't the owner or a named stakeholder of Refund recommendation, so they can't record evidence for it\./);
  // Elena is a listed stakeholder with no rights, so she is deactivated directly.
  assert.equal(manualEntryEligibility(s, RR, 'elena').ok, true);
  const gone = deactivatePerson(s, 'elena', { by: 'maya', reason: 'Left the company for this test.' });
  assert.throws(() => manual(gone, { by: 'elena' }), /deactivated/);
  // A capability with no stakeholders listed: the owner, and nobody else.
  const added = addCapability(s, { name: 'Summarise notes', summary: 'Summarises notes.', owner: 'priya', risk: LOW, today: 'recommends', by: 'priya' });
  const id = added.capabilities.at(-1).id;
  assert.equal(manualEntryEligibility(added, id, 'priya').ok, true);
  assert.equal(manualEntryEligibility(added, id, 'maya').ok, false);
});

test('manual results are checked in plain words before anything is recorded', () => {
  const s = initialState();
  assert.throws(() => manual(s, { label: ' ' }), /Say what was measured\./);
  assert.throws(() => manual(s, { kind: '' }), /test cases or on real use/);
  assert.throws(() => manual(s, { passed: '21', total: '20' }), /passed can't be more than the total/);
  assert.throws(() => manual(s, { passed: '1.5' }), /whole numbers/);
  assert.throws(() => manual(s, { type: 'count', value: '3', total: '2' }), /at least as large as the number of events/);
  assert.throws(() => manual(s, { type: 'value', value: 'fast' }), /Give the number\./);
  assert.throws(() => manual(s, { note: 'x'.repeat(301) }), /notes is longer than 300 characters/);
});

test('a measured manual result counts like any other: it locks the targets and can judge a measured row', () => {
  let s = addCapability(initialState(), { name: 'Summarise notes', summary: 'Summarises notes.', owner: 'maya', risk: LOW, today: 'recommends', by: 'maya' });
  const id = s.capabilities.at(-1).id;
  const def = defaultsFor(s, id);
  s = saveCriteria(s, id, { criteria: def.criteria, requirements: def.requirements, by: 'maya' });
  assert.equal(criteriaLocked(s, id), false);
  s = recordManualEvidence(s, id, { by: 'maya', label: 'Summary accuracy', kind: 'eval', type: 'rate', passed: '19', total: '20' });
  assert.equal(criteriaLocked(s, id), true);
  assert.equal(judgeMeasure(s, id, { metric: 'summary-accuracy', stat: 'rate', op: '>=', value: 90 }).status, 'pass');
});

test('screens: the sources page lists built-in and connected sources; the form is for the owner or a stakeholder only', () => {
  const s = importEvidence(initialState(), env());
  setPeople(people(s));
  const h = String(sourcesView(s));
  assert.match(h, /<h1>Evidence sources<\/h1>/);
  assert.match(h, /<strong>Authority Lab tests<\/strong>[\s\S]*?<strong>Manual review<\/strong>[\s\S]*?<strong>Acme · Classifier<\/strong>/);
  assert.match(h, /badge-pass">Connected</);
  assert.match(h, /Classification quality <span class="muted small">\(1 segment\)<\/span>/);
  assert.doesNotMatch(String(sourcesView(initialState())), /credential|API key|token|password|<input/i, 'no connection settings here');
  assert.match(String(sourcesView(startEmpty(initialState()))), /No connected systems yet/);
  const form = String(recordEvidenceView(s, RR, new URLSearchParams()));
  assert.match(form, /data-form="record-evidence" data-capability="refund-recommendation"/);
  assert.match(form, /Recording as <strong>Maya Chen<\/strong>/);
  assert.doesNotMatch(form, /type="submit" disabled/);
  const blocked = String(recordEvidenceView(setActingAs(s, 'jonas'), RR, new URLSearchParams()));
  assert.match(blocked, /type="submit" disabled/);
  assert.match(blocked, /isn&#39;t the owner or a named stakeholder/);
  // The evidence list offers it, and labels the result by who recorded it.
  const list = String(evidenceView(manual(s), RR, new URLSearchParams(), { embedded: true }));
  assert.match(list, /href="#\/capabilities\/refund-recommendation\/evidence\/record">Record a result</);
  assert.match(list, /badge-imported" title="Recorded by hand and kept as recorded\. It can't be edited\.">Recorded by Maya Chen</);
  assert.match(list, /<dt>Source<\/dt><dd>Manual review, recorded by Maya Chen, Support Product Lead<\/dd>/);
});
