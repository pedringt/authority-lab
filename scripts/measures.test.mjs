// Measured targets, requirements and restriction rules (#120): imported
// evidence judged through the same targets, readiness and monitoring every
// capability uses. Set up through the normal path: a new capability whose
// targets are saved before any results, then evidence imported.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState, addCapability, saveCriteria, defaultsFor, capData, getCapability, current, amend, readiness,
  importEvidence, EVIDENCE_SCHEMA, targetsNow, requirementsNow, judgeMeasure, importedVerdicts, monitoringStatus, restrictionRules,
  contractValueChecks, proposeAmendment, tighteningOnly, people, MIN_PRODUCTION_SAMPLE, reviewNeeded,
} from '../src/store/index.js';
import { setPeople } from '../src/ui.js';
import { capabilityView } from '../src/views/capability.js';
import { evidenceView } from '../src/views/evidence.js';

const LOW = { impact: 'Low', reversibility: 'Easy to reverse', exposure: 'Internal only' };
const M = {
  quality: { metric: 'quality', stat: 'rate', op: '>=', value: 85 },
  severe: { metric: 'severe-failures', stat: 'share', op: '<', value: 5 },
  ambiguous: { metric: 'quality', segment: 'Ambiguous', stat: 'rate', op: '>=', value: 85, minSample: 10 },
  cases: { metric: 'quality', stat: 'sample', op: '>=', value: 50 },
  falseCertainty: { metric: 'false-certainty', stat: 'count', op: '<=', value: 0 },
};

// A capability with measured targets and requirements, saved before results.
function setup() {
  let s = addCapability(initialState(), { name: 'Summarise incoming notes', summary: 'Summarises notes for a reviewer.', owner: 'maya', risk: LOW, today: 'recommends', by: 'maya' });
  const id = s.capabilities.at(-1).id;
  const def = defaultsFor(s, id);
  const criteria = [
    ...def.criteria.map((c) => (c.id === 'quality' ? { ...c, measure: M.quality } : c.id === 'severe-errors' ? { ...c, measure: M.severe } : c)),
    { id: 'quality-ambiguous', name: 'Quality on ambiguous notes', target: '≥ 85% correct on ambiguous notes', measure: M.ambiguous },
  ];
  const requirements = [
    ...def.requirements.map((r) => (r.id === 'min-cases' ? { ...r, measure: M.cases } : r.id === 'accuracy' ? { ...r, measure: M.quality } : r.id === 'severe' ? { ...r, measure: M.severe } : r)),
    { id: 'no-false-certainty', text: 'At most 0 severe false-certainty failures', measure: M.falseCertainty },
  ];
  s = saveCriteria(s, id, { criteria, requirements, by: 'maya' });
  return { s, id };
}

const env = (id, over = {}) => ({
  schema: EVIDENCE_SCHEMA, id: 'src:eval:1', capabilityId: id,
  source: { system: 'Src', capability: 'Notes' }, kind: 'eval', observedAt: '2026-10-05', config: { model: 'm-1', prompt: 'p-1' },
  measurements: [
    { metric: 'quality', type: 'rate', passed: 57, total: 60 },
    { metric: 'quality', type: 'rate', passed: 11, total: 12, segment: 'Ambiguous' },
    { metric: 'severe-failures', type: 'count', value: 1, total: 60, severity: 'high' },
    { metric: 'false-certainty', type: 'count', value: 0, total: 60, severity: 'high' },
  ],
  ...over,
});
const req = (s, id, rid) => requirementsNow(s, id).find((r) => r.id === rid);
const tgt = (s, id, cid) => targetsNow(s, id).find((c) => c.id === cid);

test('imported evidence judges the measured targets and requirements; unmeasured rows are as stored', () => {
  const { s: s0, id } = setup();
  // Before any results: measured rows say so, and nothing is met.
  assert.equal(tgt(s0, id, 'quality').status, 'pending');
  assert.equal(tgt(s0, id, 'quality').current, 'No results yet');
  assert.equal(readiness(s0, id).met, 0);
  const s = importEvidence(s0, env(id));
  assert.equal(tgt(s, id, 'quality').status, 'pass');
  assert.equal(tgt(s, id, 'quality').current, '95% across 60 cases');
  assert.equal(tgt(s, id, 'severe-errors').current, '1.7% across 60 cases');
  assert.equal(tgt(s, id, 'severe-errors').status, 'pass');
  assert.equal(tgt(s, id, 'quality-ambiguous').status, 'pass');
  assert.equal(tgt(s, id, 'speed').status, 'pending', 'an unmeasured target is untouched');
  assert.deepEqual(['min-cases', 'accuracy', 'severe', 'no-false-certainty'].map((r) => req(s, id, r).met), [true, true, true, true]);
  assert.equal(req(s, id, 'min-cases').current, '60');
  const r = readiness(s, id);
  assert.equal(r.met, 4);
  assert.deepEqual(r.unmet.map((x) => x.id), ['override', 'incidents'], 'rows nothing measures still need a person to judge them');
  // The stored versions are untouched: judgments are computed, never written.
  assert.equal(current(s, id, 'criteria').find((c) => c.id === 'quality').current, 'Not yet measured');
});

test('a weak segment stays visible and fails on its own, however good the overall result', () => {
  const { s: s0, id } = setup();
  const s = importEvidence(s0, env(id, { measurements: [
    { metric: 'quality', type: 'rate', passed: 58, total: 60 },
    { metric: 'quality', type: 'rate', passed: 7, total: 12, segment: 'Ambiguous' },
  ] }));
  assert.equal(tgt(s, id, 'quality').status, 'pass');
  assert.equal(tgt(s, id, 'quality-ambiguous').status, 'fail');
  assert.equal(tgt(s, id, 'quality-ambiguous').current, '58.3% across 12 cases');
  // The evidence list marks the segment's result, not the overall one.
  const v = importedVerdicts(s, id);
  assert.equal(v.get('src:eval:1#quality'), 'pass');
  assert.equal(v.get('src:eval:1#quality@ambiguous'), 'fail');
  setPeople(people(s));
  const ev = String(evidenceView(s, id, new URLSearchParams(), { embedded: true }));
  assert.match(ev, /evidence-item evidence-fail">[\s\S]*?Ambiguous/);
  // Decide lists it under its metric, marked weak.
  const h = String(capabilityView(s, id, new URLSearchParams('tab=decide')));
  assert.match(h, /Evidence from sources[\s\S]*?1 source: Src · 1 weak/);
  assert.match(h, /<ul class="plain-list imported-segs"><li><span class="decide-weak">Ambiguous: 58\.3% \(7 of 12\) \(not met\)<\/span><\/li><\/ul>/);
  // Fewer ambiguous cases than the target's own minimum: not enough data, not a pass.
  const few = importEvidence(s0, env(id, { measurements: [{ metric: 'quality', type: 'rate', passed: 6, total: 6, segment: 'Ambiguous' }] }));
  assert.equal(tgt(few, id, 'quality-ambiguous').status, 'insufficient');
  assert.equal(tgt(few, id, 'quality-ambiguous').current, '100% across 6 cases (6 cases so far, 10 needed)');
});

test('one severe failure blocks readiness on its own, even when everything else is strong', () => {
  const { s: s0, id } = setup();
  const s = importEvidence(s0, env(id, { measurements: [
    { metric: 'quality', type: 'rate', passed: 60, total: 60 },
    { metric: 'severe-failures', type: 'count', value: 0, total: 60 },
    { metric: 'false-certainty', type: 'count', value: 1, total: 60, severity: 'high' },
  ] }));
  assert.equal(req(s, id, 'accuracy').met, true);
  assert.equal(req(s, id, 'no-false-certainty').met, false);
  assert.equal(req(s, id, 'no-false-certainty').gap, 'Measured 1 across 60 cases, from Src · Notes.');
  assert.ok(readiness(s, id).unmet.some((x) => x.id === 'no-false-certainty'));
  // Even below the production sample: a failure that happened can't be outvoted by more cases.
  const prod = importEvidence(s0, env(id, { id: 'src:production:1', kind: 'production', measurements: [{ metric: 'false-certainty', type: 'count', value: 1, total: 3 }] }));
  assert.equal(judgeMeasure(prod, id, { ...M.falseCertainty, kind: 'production' }).status, 'fail');
});

test('production results are too early to judge below 20 cases, or the number a row names', () => {
  const { s: s0, id } = setup();
  assert.equal(MIN_PRODUCTION_SAMPLE, 20);
  const at = (n, passed) => importEvidence(s0, env(id, { id: `src:production:${n}`, kind: 'production', measurements: [{ metric: 'quality', type: 'rate', passed, total: n }] }));
  const early = at(12, 2);
  assert.equal(tgt(early, id, 'quality').status, 'too-early', 'never shown as missed');
  assert.equal(tgt(early, id, 'quality').current, '16.7% across 12 cases (12 cases so far, 20 needed)');
  assert.equal(req(early, id, 'accuracy').met, false);
  assert.match(req(early, id, 'accuracy').gap, /^Too early to judge: /);
  assert.equal(importedVerdicts(early, id).get('src:production:12#quality'), 'insufficient', 'the evidence list says not enough data, not fail');
  setPeople(people(early));
  assert.match(String(capabilityView(early, id, new URLSearchParams('tab=decide&show=targets'))), /<td>16\.7% across 12 cases \(12 cases so far, 20 needed\)<\/td>\s*<td><span class="badge badge-insufficient">Too early to judge<\/span><\/td>/);
  // At the default sample it's judged.
  assert.equal(tgt(at(20, 19), id, 'quality').status, 'pass');
  assert.equal(tgt(at(20, 10), id, 'quality').status, 'fail');
  // A row's own sample wins over the default.
  const own = { ...M.quality, minSample: 50 };
  assert.equal(judgeMeasure(at(30, 29), id, own).status, 'too-early');
  assert.equal(judgeMeasure(at(50, 49), id, own).status, 'pass');
});

test('results from an earlier configuration never judge a row', () => {
  const { s: s0, id } = setup();
  let s = importEvidence(s0, env(id));
  s = importEvidence(s, env(id, { id: 'src:eval:2', observedAt: '2026-10-06', config: { model: 'm-2', prompt: 'p-1' }, measurements: [{ metric: 'severe-failures', type: 'count', value: 0, total: 40 }] }));
  // Quality was only measured under m-1, so under m-2 it has no result yet.
  assert.equal(tgt(s, id, 'quality').status, 'pending');
  assert.equal(tgt(s, id, 'severe-errors').current, '0% across 40 cases');
});

test('evidence never grants autonomy: every check met changes no level, decision or record', () => {
  const { s: s0, id } = setup();
  const before = getCapability(s0, id).authority;
  const s = importEvidence(s0, env(id));
  assert.deepEqual(getCapability(s, id).authority, before);
  assert.equal(s.decisionRecords.length, s0.decisionRecords.length);
  assert.deepEqual(capData(s, id).decision, capData(s0, id).decision);
});

test('measured rows must say their number in words, and the two must agree', () => {
  const { s, id } = setup();
  assert.throws(() => saveCriteria(s, id, { criteria: [...current(s, id, 'criteria')].map((c) => (c.id === 'quality' ? { ...c, measure: { ...M.quality, value: 80 } } : c)), requirements: current(s, id, 'requirements'), by: 'maya' }),
    /Target "Quality" says "≥ 85% correct decisions" but its measure checks >= 80\. Make them agree\./);
  assert.throws(() => saveCriteria(s, id, { criteria: [...current(s, id, 'criteria'), { name: 'Tone', target: 'Reads kindly', measure: { metric: 'tone', stat: 'rate', op: '>=', value: 90 } }], requirements: current(s, id, 'requirements'), by: 'maya' }),
    /Target "Tone" is measured, so its wording has to name the number too/);
  assert.throws(() => saveCriteria(s, id, { criteria: [...current(s, id, 'criteria'), { name: 'X', target: '≥ 1', measure: { metric: 'x', stat: 'mean', op: '>=', value: 1, weight: 2 } }], requirements: current(s, id, 'requirements'), by: 'maya' }),
    /A measure has a field it doesn't use: "weight"\. A measure's stat must be one of/);
});

test('after results, a measured row\'s number moves with its wording, and nothing else about its measure changes without approval', () => {
  const { s: s0, id } = setup();
  const s = importEvidence(s0, env(id));
  const base = { criteria: current(s, id, 'criteria'), requirements: current(s, id, 'requirements') };
  const edit = (fn) => ({ criteria: base.criteria.map(fn), requirements: base.requirements });
  // Wording only, stricter: the shortcut applies and the measure follows.
  const stricter = edit((c) => (c.id === 'quality' ? { ...c, target: '≥ 90% correct decisions' } : c));
  const s2 = proposeAmendment(s, id, 'criteria', { value: { criteria: stricter.criteria.map(({ measure, ...c }) => c), requirements: base.requirements.map(({ measure, ...r }) => r) }, by: 'maya', reason: 'Raise the quality bar after the first eval.' });
  assert.deepEqual(current(s2, id, 'criteria').find((c) => c.id === 'quality').measure, { ...M.quality, value: 90 });
  assert.equal(tgt(s2, id, 'quality').status, 'pass', '95% still meets 90%');
  // A different metric with the same words is a different bar: approval.
  const swapped = tighteningOnly(base, edit((c) => (c.id === 'quality' ? { ...c, measure: { ...M.quality, metric: 'other' } } : c)));
  assert.equal(swapped.ok, false);
  assert.equal(swapped.reason, 'It changes how "Quality" is measured.');
  // A measure number changed without the words: also a different bar.
  assert.equal(tighteningOnly(base, edit((c) => (c.id === 'quality' ? { ...c, measure: { ...M.quality, value: 95 } } : c))).ok, false);
  // Wording that drops the number can't keep a measure.
  assert.throws(() => proposeAmendment(s, id, 'criteria', { value: { criteria: base.criteria.map(({ measure, ...c }) => (c.id === 'quality' ? { ...c, target: 'Mostly correct' } : c)), requirements: base.requirements.map(({ measure, ...r }) => r) }, by: 'maya', reason: 'Simplify the wording of the bar.' }),
    /"Quality" is measured \(>= 85\), so its wording must keep a number to check\./);
});

// A safety limit measured from imported production evidence.
const LINE = 'Severe false-certainty rate above 2% across the rolling 50 cases returns the capability to Observe until reviewed';
function withRule(s, id, measure = { metric: 'false-certainty', stat: 'share', op: '>', value: 2 }) {
  const c = current(s, id, 'contract');
  return amend(s, id, 'contract', { value: { ...c, autoRestriction: [LINE], ruleMeasures: { [LINE]: measure } }, author: 'maya', reason: 'Measure the false-certainty limit from production evidence.' });
}

test('a production result that crosses a measured safety limit pulls authority back automatically', () => {
  const { s: s0, id } = setup();
  const s1 = withRule(s0, id);
  const rule = restrictionRules(s1, id)[0];
  assert.equal(rule.active, true, 'it applies at Recommend, above its fallback of Observe');
  // An eval never feeds a safety limit: it isn't the system in service.
  const evalOnly = importEvidence(s1, env(id, { measurements: [{ metric: 'false-certainty', type: 'count', value: 9, total: 60 }] }));
  assert.equal(monitoringStatus(evalOnly, id).rules[0].measured, false);
  assert.equal(getCapability(evalOnly, id).authority.level, 1);
  // Production, too few cases for a percentage: shown, too early, not crossed.
  const early = importEvidence(s1, env(id, { id: 'src:production:1', kind: 'production', measurements: [{ metric: 'false-certainty', type: 'count', value: 2, total: 10 }] }));
  const r = monitoringStatus(early, id).rules[0];
  assert.equal(r.value, 20);
  assert.equal(r.imported.early, true);
  assert.equal(r.crossed, false);
  assert.equal(getCapability(early, id).authority.level, 1);
  // Enough cases, over the limit: restricted through the shared breach flow.
  const over = importEvidence(s1, env(id, { id: 'src:production:2', kind: 'production', measurements: [{ metric: 'false-certainty', type: 'count', value: 3, total: 60 }] }));
  assert.equal(getCapability(over, id).authority.level, 0);
  const rec = over.decisionRecords.at(-1);
  assert.equal(rec.option, 'auto-restrict');
  assert.equal(rec.authorizedBy, 'system');
  assert.match(rec.evidenceSnapshot.join(' '), /Measured: 5%/);
  assert.equal(reviewNeeded(over, id).any, true);
  // The same file again (every page load) doesn't restrict twice.
  assert.equal(importEvidence(over, env(id, { id: 'src:production:2', kind: 'production', measurements: [{ metric: 'false-certainty', type: 'count', value: 3, total: 60 }] })), over);
  setPeople(people(over));
  assert.match(String(capabilityView(early, id, new URLSearchParams('tab=monitor'))), /Too early to judge<\/span> 20% across 10 cases · limit 2% <span class="muted small">\(imported, src:production:1; 50 cases needed\)/);
});

test('a measured safety limit must name a rule that exists and a valid measure', () => {
  const { s, id } = setup();
  const c = current(withRule(s, id), id, 'contract');
  assert.deepEqual(contractValueChecks(s, id, c).filter((x) => x.id.startsWith('measure')), []);
  const orphan = contractValueChecks(s, id, { ...c, ruleMeasures: { 'No such line': { metric: 'x', stat: 'count', op: '>', value: 1 } } });
  assert.match(orphan.find((x) => x.id.startsWith('measure-orphan')).text, /isn't one of the automatic-restriction rules/);
  const bad = contractValueChecks(s, id, { ...c, ruleMeasures: { [LINE]: { metric: 'x', stat: 'count', op: 'over', value: 1 } } });
  assert.equal(bad.find((x) => x.id.startsWith('measure-bad')).level, 'block');
});
