// External evidence (#118): the domain-neutral evidence contract, importing an
// envelope into the normal evidence list, and the committed evidence files.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  initialState, capData, criteriaLocked, saveCriteria, defaultsFor, activityEvents, startEmpty, addCapability,
  checkEvidence, importEvidence, importEvidenceFiles, evidenceImports, findImport, measurementText, canonicalEvidence, EVIDENCE_SCHEMA, createStore, BUILT_IN_WORKSPACES,
} from '../src/store/index.js';
import { setPeople } from '../src/ui.js';
import { people } from '../src/store/index.js';
import { evidenceView } from '../src/views/evidence.js';

// Ticket classification is a seeded capability with no domain link to the
// sender: the contract has to work for any capability.
const TC = 'ticket-classification';
const LOW = { impact: 'Low', reversibility: 'Easy to reverse', exposure: 'Internal only' };

export const envelope = (over = {}) => ({
  schema: EVIDENCE_SCHEMA,
  id: 'acme:eval:run-0001',
  capabilityId: TC,
  source: { system: 'Acme', capability: 'Classifier', environment: 'staging' },
  kind: 'eval',
  observedAt: '2026-10-06',
  config: { provider: 'Example', model: 'model-a', prompt: 'p-3', evalSet: 'es-2', implementation: 'abc1234' },
  reference: { url: 'https://example.com/runs/0001', label: 'Run 0001' },
  measurements: [
    { metric: 'quality', label: 'Classification quality', type: 'rate', passed: 46, total: 50 },
    { metric: 'severe-failures', label: 'Severe failures', type: 'count', value: 1, total: 50, severity: 'high' },
    { metric: 'quality', label: 'Classification quality', type: 'rate', passed: 7, total: 10, segment: 'Ambiguous tickets' },
    { metric: 'latency-p95', label: 'Latency (p95)', type: 'value', value: 840, unit: 'ms' },
  ],
  ...over,
});

test('a valid envelope imports into the same evidence list as every other piece of evidence', () => {
  const s0 = initialState();
  const before = capData(s0, TC).evidence.length;
  const s = importEvidence(s0, envelope());
  const d = capData(s, TC);
  assert.equal(d.evidence.length, before + 4, 'one evidence item per measurement, not a parallel store');
  const items = d.evidence.filter((e) => e.from === 'imported');
  assert.deepEqual(items.map((e) => e.id), ['acme:eval:run-0001#quality', 'acme:eval:run-0001#severe-failures', 'acme:eval:run-0001#quality@ambiguous-tickets', 'acme:eval:run-0001#latency-p95']);
  const [q, sev, seg, lat] = items;
  assert.equal(q.source, 'Acme eval');
  assert.equal(q.value, '92% (46 of 50)');
  assert.equal(q.segment, 'All');
  assert.equal(q.date, '2026-10-06');
  assert.equal(q.status, 'recorded', 'not judged until a target is bound to it (#120)');
  assert.equal(sev.value, '1 in 50 cases');
  assert.equal(sev.risk, 'High');
  assert.equal(seg.segment, 'Ambiguous tickets');
  assert.equal(seg.value, '70% (7 of 10)');
  assert.equal(lat.value, '840 ms');
  assert.equal(q.link, 'https://example.com/runs/0001');
  assert.deepEqual(q.external, { importId: 'acme:eval:run-0001', system: 'Acme', capability: 'Classifier', environment: 'staging', kind: 'eval', config: { evalSet: 'es-2', implementation: 'abc1234', model: 'model-a', prompt: 'p-3', provider: 'Example' }, reference: { url: 'https://example.com/runs/0001', label: 'Run 0001' } });
  // The envelope is kept as received, once.
  assert.equal(evidenceImports(s, TC).length, 1);
  assert.equal(findImport(s, 'acme:eval:run-0001').importedOn, s.today);
  // And it's in Activity.
  const ev = activityEvents(s).find((e) => e.kind === 'evidence-imported');
  assert.equal(ev.title, 'Evidence imported from Acme');
  assert.match(ev.body, /Ticket classification: 4 results from Classifier \(an eval, 2026-10-06\), run acme:eval:run-0001\./);
});

test('imported results are performance results: they lock the targets, like a test run', () => {
  // A fresh capability with saved targets and no results yet.
  let s = addCapability(initialState(), { name: 'Summarise incoming notes', summary: 'Summarises notes for a reviewer.', owner: 'maya', risk: LOW, today: 'recommends', by: 'maya' });
  const id = s.capabilities.at(-1).id;
  const def = defaultsFor(s, id);
  s = saveCriteria(s, id, { criteria: def.criteria, requirements: def.requirements, by: 'maya' });
  assert.equal(criteriaLocked(s, id), false);
  s = importEvidence(s, envelope({ capabilityId: id }));
  assert.equal(criteriaLocked(s, id), true, 'the bar can no longer move after these results');
});

test('a retry with the same envelope changes nothing; the same id with different content is refused', () => {
  const s = importEvidence(initialState(), envelope());
  // Same content, keys in another order: a retry.
  const reordered = Object.fromEntries(Object.entries(envelope()).reverse());
  assert.equal(importEvidence(s, reordered), s, 'the same state object: nothing was added');
  assert.equal(capData(importEvidence(s, envelope()), TC).evidence.filter((e) => e.from === 'imported').length, 4);
  // Same id, changed result: refused, because imported evidence never changes.
  const changed = envelope({ measurements: [{ metric: 'quality', type: 'rate', passed: 50, total: 50 }] });
  assert.throws(() => importEvidence(s, changed), /already imported with different content\. Imported evidence never changes: send a correction as new evidence with its own id\./);
  // The same id can't be reused on another capability either.
  assert.throws(() => importEvidence(s, envelope({ capabilityId: 'refund-recommendation' })), /already imported with different content/);
  // A correction is new evidence with its own id.
  const corrected = importEvidence(s, { ...changed, id: 'acme:eval:run-0001-correction' });
  assert.equal(evidenceImports(corrected, TC).length, 2);
});

test('an unknown capability fails clearly, and so does a malformed envelope', () => {
  const s = initialState();
  assert.throws(() => importEvidence(s, envelope({ capabilityId: 'no-such-capability' })), /No capability "no-such-capability" in this workspace, so the evidence can't be imported\./);
  // Empty workspace: nothing to import into.
  assert.throws(() => importEvidence(startEmpty(s), envelope()), /No capability "ticket-classification"/);
  assert.throws(() => importEvidence(s, { ...envelope(), schema: 'other/1' }), /schema must be "authority-lab-evidence\/1"\./);
  assert.throws(() => importEvidence(s, null), /must be a JSON object/);
});

test('checkEvidence names every problem in plain words', () => {
  const bad = (over) => checkEvidence(envelope(over));
  assert.deepEqual(checkEvidence(envelope()), []);
  assert.match(bad({ id: 'X' }).join(' '), /id must be 3 to 120 characters/);
  assert.match(bad({ id: 'has spaces in it' }).join(' '), /id must be/);
  assert.match(bad({ kind: 'pilot' }).join(' '), /kind must be one of: eval, production/);
  assert.match(bad({ observedAt: 'yesterday' }).join(' '), /observedAt must be a date/);
  assert.match(bad({ observedAt: '2026-13-45' }).join(' '), /observedAt must be a date/);
  assert.match(bad({ source: { system: 'Acme' } }).join(' '), /source\.capability is required/);
  assert.match(bad({ measurements: [] }).join(' '), /at least one result/);
  assert.match(bad({ measurements: Array.from({ length: 41 }, (_, i) => ({ metric: `m-${i}`, type: 'count', value: 1 })) }).join(' '), /at most 40 results/);
  assert.match(bad({ measurements: [{ metric: 'q', type: 'rate', passed: 6, total: 5 }] }).join(' '), /passed can't be more than total/);
  assert.match(bad({ measurements: [{ metric: 'q', type: 'rate', passed: 0, total: 0 }] }).join(' '), /total above 0/);
  assert.match(bad({ measurements: [{ metric: 'q', type: 'count', value: 1.5 }] }).join(' '), /whole number value/);
  assert.match(bad({ measurements: [{ metric: 'q', type: 'count', value: 5, total: 2 }] }).join(' '), /can't be smaller than it/);
  assert.match(bad({ measurements: [{ metric: 'q', type: 'value', value: 'fast' }] }).join(' '), /a value needs a number/);
  assert.match(bad({ measurements: [{ metric: 'q', type: 'score' }] }).join(' '), /type must be one of: rate, count, value/);
  assert.match(bad({ measurements: [{ metric: 'q', type: 'count', value: 1, severity: 'critical' }] }).join(' '), /severity must be one of: low, medium, high/);
  assert.match(bad({ measurements: [{ metric: 'q', type: 'count', value: 1 }, { metric: 'q', type: 'count', value: 2 }] }).join(' '), /repeats q: send one result per metric and segment/);
  assert.match(bad({ reference: { url: 'http://example.com' } }).join(' '), /https link/);
  assert.match(bad({ reference: { url: 'javascript:alert(1)' } }).join(' '), /https link/);
});

test('only a summary and a reference get in: unknown fields and long text are refused', () => {
  const body = 'x'.repeat(2000);
  // A free-text field can't carry a document.
  assert.match(checkEvidence(envelope({ notes: body })).join(' '), /notes is longer than 300 characters/);
  assert.match(checkEvidence(envelope({ source: { system: 'Acme', capability: body } })).join(' '), /source\.capability is longer than 80/);
  assert.match(checkEvidence(envelope({ measurements: [{ metric: 'q', type: 'count', value: 1, segment: body }] })).join(' '), /segment is longer than 60/);
  // Neither can a field the contract doesn't have, at any level.
  assert.match(checkEvidence(envelope({ evidenceBody: 'the full text' })).join(' '), /The envelope has a field that isn't part of the contract: "evidenceBody"\. Send a summary and a reference, not the source's content\./);
  assert.match(checkEvidence(envelope({ source: { system: 'Acme', capability: 'C', content: 'x' } })).join(' '), /source has a field .*"content"/);
  assert.match(checkEvidence(envelope({ config: { model: 'm', systemPrompt: 'You are…' } })).join(' '), /config has a field .*"systemPrompt"/);
  assert.match(checkEvidence(envelope({ measurements: [{ metric: 'q', type: 'count', value: 1, examples: ['…'] }] })).join(' '), /measurements\[0\] has a field .*"examples"/);
  assert.match(checkEvidence(envelope({ reference: { url: 'https://example.com', label: 'L', token: 'secret' } })).join(' '), /reference has a field .*"token"/);
});

test('the contract is domain-neutral: nothing about refunds, support or any sender in the schema', () => {
  const src = readFileSync(new URL('../src/store/external.js', import.meta.url), 'utf8');
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(code, /refund|fraud|chargeback|order|customer|ticket|support|northstar|\bstate'?s\b|interpreter/i);
});

test('importing a batch of files never throws: each is imported, already there, elsewhere, or refused with the reason', () => {
  const s0 = initialState();
  const files = [
    { file: 'a.json', envelope: envelope() },
    { file: 'a-again.json', envelope: envelope() },
    { file: 'other-workspace.json', envelope: envelope({ id: 'acme:eval:other', capabilityId: 'not-in-this-workspace' }) },
    { file: 'broken.json', envelope: envelope({ id: 'acme:eval:broken', kind: 'pilot' }) },
    { file: 'b.json', envelope: envelope({ id: 'acme:production:0002', kind: 'production' }) },
  ];
  const { state, results } = importEvidenceFiles(s0, files);
  assert.deepEqual(results.map((r) => [r.file, r.status]), [['a.json', 'imported'], ['a-again.json', 'already'], ['other-workspace.json', 'elsewhere'], ['broken.json', 'refused'], ['b.json', 'imported']]);
  assert.match(results[3].reason, /kind must be one of/);
  assert.equal(evidenceImports(state, TC).length, 2);
  assert.equal(capData(state, TC).evidence.filter((e) => e.source === 'Acme production').length, 4);
  // Importing the same files again (every page load) changes nothing.
  assert.equal(importEvidenceFiles(state, files).state, state);
});

test('the store action imports files and persists them; a reload keeps exactly one copy', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const store = createStore({ storage });
  store.dispatch('importEvidenceFiles', [{ file: 'a.json', envelope: envelope() }]);
  const again = createStore({ storage });
  again.dispatch('importEvidenceFiles', [{ file: 'a.json', envelope: envelope() }]);
  assert.equal(evidenceImports(again.get(), TC).length, 1);
  // Reset demo brings back the seed; the app then imports the files again.
  again.dispatch('reset');
  assert.equal(evidenceImports(again.get(), TC).length, 0);
});

test('the evidence view shows imported items as not judged yet, with an external link that opens apart', () => {
  const s = importEvidence(initialState(), envelope());
  setPeople(people(s));
  const h = String(evidenceView(s, TC, new URLSearchParams(), { embedded: true }));
  assert.match(h, /<span class="eyebrow">Acme eval<\/span><h3>Classification quality<\/h3>/);
  assert.match(h, /badge-recorded">Not judged yet</);
  assert.match(h, /<a href="https:\/\/example\.com\/runs\/0001" target="_blank" rel="noopener">View source<\/a>/);
  // No made-up risk on a result that didn't say.
  assert.doesNotMatch(h, /null risk|undefined risk/);
});

test('measurementText reads each type plainly', () => {
  assert.equal(measurementText({ type: 'rate', passed: 1, total: 3 }), '33.3% (1 of 3)');
  assert.equal(measurementText({ type: 'count', value: 0 }), '0');
  assert.equal(measurementText({ type: 'count', value: 2, total: 1 }), '2 in 1 case');
  assert.equal(measurementText({ type: 'value', value: 0.04, unit: '$' }), '$0.04');
  assert.equal(measurementText({ type: 'value', value: 12.5, unit: '%' }), '12.5%');
  assert.deepEqual(Object.keys(canonicalEvidence({ b: 1, a: { d: 1, c: 2 } })), ['a', 'b']);
});

// Every committed envelope is valid and names a capability that exists. CI
// runs this on the sender's pull request, so a merged file is an accepted one.
test('every committed evidence file is listed, valid, unique and imports cleanly', () => {
  const dir = new URL('../src/data/external-evidence/', import.meta.url);
  const index = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8'));
  assert.equal(index.schema, 'authority-lab-evidence-index/1');
  assert.ok(Array.isArray(index.files));
  assert.equal(new Set(index.files).size, index.files.length, 'no file listed twice');
  const ids = new Set();
  for (const file of index.files) {
    assert.match(file, /^[a-z0-9][a-z0-9._-]*\.json$/, file);
    assert.ok(existsSync(new URL(file, dir)), `${file} is listed but missing`);
    const env = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
    assert.deepEqual(checkEvidence(env), [], file);
    assert.ok(!ids.has(env.id), `${file}: id ${env.id} is used twice`);
    ids.add(env.id);
  }
  // Each file imports into exactly one built-in workspace (#121, #518): the one
  // that has its capability. Elsewhere, it is skipped, never refused.
  const files = index.files.map((file) => ({ file, envelope: JSON.parse(readFileSync(new URL(file, dir), 'utf8')) }));
  const outcomes = BUILT_IN_WORKSPACES.map((w) => importEvidenceFiles(w.build({ today: '2026-10-13' }), files).results);
  for (const [i, f] of files.entries()) {
    const per = outcomes.map((r) => r[i].status);
    assert.ok(!per.includes('refused'), `${f.file}: ${outcomes.map((r) => r[i].reason).filter(Boolean).join(' ')}`);
    assert.equal(per.filter((x) => x === 'imported').length, 1, `${f.file} imports into exactly one built-in workspace`);
  }
});

// ---------------------------------------------------------------------------
// #119: provenance and version context
// ---------------------------------------------------------------------------

import { evidenceFrom, evidenceStreams, importedStanding, externalSnapshot, configChanges, selectDecision, authorize, startTestRun, advanceTestRun } from '../src/store/index.js';
import { decisionRecordView } from '../src/views/decisions.js';

const RR = 'refund-recommendation';
const run = (n, over = {}) => envelope({ id: `acme:eval:run-${n}`, ...over });
const evView = (s, id = TC) => { setPeople(people(s)); return String(evidenceView(s, id, new URLSearchParams(), { embedded: true })); };

test('every evidence item says where it came from: demo data, this workspace, imported, or calculated', () => {
  let s = importEvidence(initialState(), envelope());
  // A test run in this workspace.
  s = startTestRun(s, RR);
  for (let i = 0; i < 200 && capData(s, RR).testRun.status === 'running'; i++) s = advanceTestRun(s, RR);
  const rr = capData(s, RR).evidence;
  assert.equal(evidenceFrom(rr.find((e) => e.id === 'EV-02')), 'seeded');
  assert.equal(evidenceFrom(rr.find((e) => e.source === 'Automated tests')), 'workspace', 'a test run replaces the seeded item and is this workspace\'s');
  assert.equal(evidenceFrom(capData(s, TC).evidence.find((e) => e.from === 'imported')), 'imported');
  // Saved state from before `from` existed: the seed's ids decide.
  assert.equal(evidenceFrom({ id: 'EV-02' }, new Set(['EV-02'])), 'seeded');
  assert.equal(evidenceFrom({ id: 'EV-02', runOn: '2026-10-07' }, new Set(['EV-02'])), 'workspace');
  assert.equal(evidenceFrom({ id: 'EV-99' }, new Set(['EV-02'])), 'workspace');
  assert.equal(evidenceFrom({ id: 'X', derived: true }), 'calculated');
  // On screen: seeded demo evidence can't be mistaken for an import.
  const h = evView(s, RR);
  assert.match(h, /<h3>Decision accuracy<\/h3><span class="badge badge-neutral">Demo data<\/span>/);
  assert.match(h, /<h3>Tests passed<\/h3><span class="badge badge-neutral">Recorded in this workspace<\/span>/);
  assert.doesNotMatch(h, /Imported from/);
  assert.match(evView(s), /<h3>Classification quality<\/h3><span class="badge badge-imported" title="Sent by Acme; checked and imported\. It can't be edited\.">Imported from Acme<\/span>/);
});

test('an imported result shows its source, run, versions and link behind "Where this came from"', () => {
  const h = evView(importEvidence(initialState(), envelope()));
  const at = h.indexOf('<details class="provenance">');
  const d = h.slice(at, h.indexOf('</details>', at) + 10);
  assert.match(d, /<summary>Where this came from<\/summary>/);
  assert.match(d, /<dt>Source<\/dt><dd>Acme · Classifier \(staging\)<\/dd>/);
  assert.match(d, /<dt>Run<\/dt><dd>acme:eval:run-0001 · eval · <a href="https:\/\/example\.com\/runs\/0001" target="_blank" rel="noopener">Run 0001<\/a><\/dd>/);
  assert.match(d, /<dt>Configuration<\/dt><dd>Provider Example · Model model-a · Prompt p-3 · Implementation abc1234 · Eval set es-2<\/dd>/);
  assert.match(d, /<dt>Metric<\/dt><dd>latency-p95<\/dd>/, "the first card shown");
  // Seeded evidence has no such disclosure.
  // Seeded demo items that predate sources have none; the example ones (#126) do.
  const rrPage = evView(initialState(), RR);
  assert.equal((rrPage.match(/<summary>Where this came from<\/summary>/g) || []).length, capData(initialState(), RR).evidence.filter((e) => e.external).length);
  assert.doesNotMatch(rrPage.slice(rrPage.indexOf('EV-02'), rrPage.indexOf('</article>', rrPage.indexOf('EV-02'))), /Where this came from/);
});

test('a changed configuration is surfaced, and its earlier results are shown but never blended in', () => {
  let s = importEvidence(initialState(), run(1, { observedAt: '2026-10-01' }));
  s = importEvidence(s, run(2, { observedAt: '2026-10-05', config: { provider: 'Example', model: 'model-b', prompt: 'p-3', evalSet: 'es-2', implementation: 'abc1234' } }));
  const [st] = evidenceStreams(s, TC);
  assert.equal(st.latest.id, 'acme:eval:run-2');
  assert.deepEqual(st.change.changes, [{ key: 'model', label: 'Model', from: 'model-a', to: 'model-b' }]);
  const standing = importedStanding(s, TC);
  assert.equal(standing.get('acme:eval:run-1#quality').standing, 'other-config');
  assert.equal(standing.get('acme:eval:run-2#quality').standing, 'current');
  const h = evView(s);
  assert.match(h, /Acme Classifier: the eval configuration changed/);
  assert.match(h, /From run acme:eval:run-2 \(Oct 5\): Model model-a → model-b\. Earlier results are kept and shown, but only results from the current configuration count toward targets\./);
  assert.match(h, /Earlier configuration<\/span> Measured under a different configuration \(Model model-b → model-a\)|Earlier configuration<\/span> Measured under a different configuration \(Model model-a → model-b\)/);
  // A run that arrives late, dated before the newest, doesn't take over.
  const late = importEvidence(s, run(0, { observedAt: '2026-09-28', config: { model: 'model-z' } }));
  assert.equal(evidenceStreams(late, TC)[0].latest.id, 'acme:eval:run-2');
  assert.equal(importedStanding(late, TC).get('acme:eval:run-0#quality').standing, 'other-config');
});

test('a version reported on one side only counts as a change; eval and production are compared separately', () => {
  assert.deepEqual(configChanges({ model: 'a', prompt: 'p' }, { model: 'a' }), [{ key: 'prompt', label: 'Prompt', from: 'p', to: 'not reported' }]);
  assert.deepEqual(configChanges({}, {}), []);
  let s = importEvidence(initialState(), run(1));
  s = importEvidence(s, run(2, { kind: 'production', config: { model: 'model-a' } }));
  const streams = evidenceStreams(s, TC);
  assert.deepEqual(streams.map((x) => x.kind), ['eval', 'production']);
  assert.ok(streams.every((x) => !x.change), 'a production run without an eval set is no change to the eval stream');
  assert.equal(importedStanding(s, TC).get('acme:eval:run-1#quality').standing, 'current');
});

test('under the same configuration, a newer run replaces an older result for the same metric and segment only', () => {
  let s = importEvidence(initialState(), run(1, { observedAt: '2026-10-01' }));
  s = importEvidence(s, run(2, { observedAt: '2026-10-04', measurements: [{ metric: 'quality', type: 'rate', passed: 48, total: 50 }] }));
  const st = importedStanding(s, TC);
  assert.deepEqual(st.get('acme:eval:run-1#quality'), { standing: 'superseded', by: 'acme:eval:run-2', stream: 'Acme|Classifier|eval' });
  assert.equal(st.get('acme:eval:run-2#quality').standing, 'current');
  // run-2 didn't measure these, so run-1's still count.
  assert.equal(st.get('acme:eval:run-1#severe-failures').standing, 'current');
  assert.equal(st.get('acme:eval:run-1#quality@ambiguous-tickets').standing, 'current');
  assert.match(evView(s), /Replaced<\/span> A newer run \(acme:eval:run-2\) has this result, so this one doesn't count toward targets\./);
});

test('a decision record keeps the imported evidence and configuration in force when it was made', () => {
  let s = importEvidence(initialState(), run(1, { capabilityId: RR, observedAt: '2026-10-01' }));
  s = importEvidence(s, run(2, { capabilityId: RR, observedAt: '2026-10-05', config: { model: 'model-b' } }));
  s = authorize(selectDecision(s, RR, 'expand-limits'), RR);
  const rec = s.decisionRecords.at(-1);
  assert.deepEqual(JSON.parse(JSON.stringify(rec.externalEvidence.filter((x) => x.system === 'Acme'))), [{ system: 'Acme', capability: 'Classifier', kind: 'eval', runs: [{ id: 'acme:eval:run-2', observedAt: '2026-10-05', reference: { url: 'https://example.com/runs/0001', label: 'Run 0001' } }], config: { model: 'model-b' }, excluded: 4 }]);
  assert.ok(Object.isFrozen(rec.externalEvidence[0].config));
  // Later evidence doesn't rewrite it.
  const later = importEvidence(s, run(3, { capabilityId: RR, observedAt: '2026-10-07', config: { model: 'model-c' } }));
  assert.deepEqual(later.decisionRecords.at(-1).externalEvidence, rec.externalEvidence);
  // The demo's example sources are on it too (#126).
  assert.ok(rec.externalEvidence.some((x) => x.system === 'Support platform'));
  setPeople(people(later));
  const h = String(decisionRecordView(later, rec.id));
  assert.match(h, /<dt>Imported evidence<\/dt><dd><ul class="plain-list">[\s\S]*?<li><strong>Acme Classifier<\/strong> \(eval\): 1 run, latest Oct 5 · <a href="https:\/\/example\.com\/runs\/0001" target="_blank" rel="noopener">Run 0001<\/a>\. <span class="muted">Model model-b\.<\/span> 4 results from an earlier configuration left out\.<\/li><\/ul><\/dd>/);
  // A record with no imported evidence doesn't mention it: Ticket classification has none.
  assert.equal(externalSnapshot(initialState(), TC).length, 0);
});
