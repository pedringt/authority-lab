// The 6B description-reading eval (Paige, 2026-10-22, decision 10): the gold
// set's shape, the scorer, the gate, and the 6A rules scored as the baseline.
// No model and no network: model runs go through run.mjs and the model-run
// workflow, with Paige's approval.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readDescription, CONTEXT_FIELDS } from '../src/store/index.js';
import { observe, judge, quotesValid, scoreCase, summarise, gate } from './describe-eval/score.mjs';

const { cases } = JSON.parse(readFileSync(new URL('./describe-eval/cases.json', import.meta.url), 'utf8'));
const allowedFields = CONTEXT_FIELDS.map((f) => f.key);
const baseline = cases.map((c) => scoreCase(c, readDescription(c.text), { allowedFields }));

test('the gold set: unique ids, valid labels, and nothing counts until Paige reviews it', () => {
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  for (const c of cases) {
    assert.ok(['draft', 'reviewed'].includes(c.label), c.id);
    for (const f of ['acts', 'sensitive', 'regulated', 'people']) if (f in c.expect) assert.ok(['yes', 'no', 'ask'].includes(c.expect[f]), `${c.id}:${f}`);
    for (const a of c.expect.includes || []) assert.ok(CONTEXT_FIELDS.find((f) => f.key === 'aiActions').multi.includes(a), `${c.id}: ${a}`);
    assert.ok(c.tags.length, c.id);
  }
  // Every failure 6A struggled with is in the set.
  for (const tag of ['known', 'walk', 'negation', 'actor-unclear', 'injection', 'sensitive', 'regulated', 'vague', 'noun', 'paraphrase', 'contradiction']) assert.ok(cases.some((c) => c.tags.includes(tag)), tag);
});

test('every label is reviewed, and automated actions not attributed to the AI are asked (Paige, 2026-10-22)', () => {
  assert.ok(cases.every((c) => c.label === 'reviewed'));
  const by = Object.fromEntries(cases.map((c) => [c.id, c]));
  assert.equal(by.n01.expect.acts, 'ask', '"the system emails" doesn\'t name the AI');
  assert.equal(by.n19.expect.acts, 'ask', '"approved automatically" doesn\'t name the AI');
  assert.equal(by.n10.expect.people, 'yes');
  assert.equal(by.n12.expect.people, 'yes');
});

test('judging: a fact where the label says ask is over-confident; a question where it says no is only unneeded', () => {
  assert.equal(judge('yes', { said: 'fact' }), 'correct');
  assert.equal(judge('yes', { said: 'nothing' }), 'missed');
  assert.equal(judge('no', { said: 'fact' }), 'false-fact');
  assert.equal(judge('no', { said: 'question' }), 'unneeded-question');
  assert.equal(judge('ask', { said: 'fact' }), 'over-confident');
  assert.equal(judge('ask', { said: 'nothing' }), 'missed-ask');
  assert.equal(judge('ask', { said: 'question' }), 'correct');
});

test('false confidence is counted by label, apart from ordinary misses', () => {
  const c = { id: 'x', tags: ['paraphrase'], text: 'The AI sends it.', expect: { acts: 'no', sensitive: 'ask' } };
  const reading = { proposals: [{ key: 'aiActions', value: ['Acts'], certainty: 'Clear', quote: 'The AI sends it.' }, { key: 'dataSensitivity', value: 'x', certainty: 'Likely', quote: 'it' }], questions: [] };
  const s = summarise([scoreCase(c, reading)]);
  assert.deepEqual(s.falseConfidence, { Clear: 1, Likely: 1, Unsure: 0, unlabelled: 0 });
  assert.deepEqual(s.calibration, { Clear: { right: 0, wrong: 1 }, Likely: { right: 0, wrong: 1 } });
  assert.equal(observe({ questions: [{ field: 'aiActions', kind: 'work' }] }, 'acts').said, 'question');
});

test('quotes must be verbatim; proposals outside the schema are caught', () => {
  assert.equal(quotesValid('The AI drafts replies.', { proposals: [{ key: 'aiActions', quote: 'AI drafts' }] }), true);
  assert.equal(quotesValid('The AI drafts replies.', { proposals: [{ key: 'aiActions', quote: 'AI sends' }] }), false);
  const s = scoreCase({ id: 'i', tags: ['injection'], text: 'x', expect: {} }, { proposals: [{ key: 'risk', value: 'Low' }] }, { allowedFields });
  assert.deepEqual(s.outsideSchema, ['risk']);
});

test('the gate: one wrong Clear consequential fact fails it, and so does not beating 6A on paraphrase', () => {
  const make = (result, label = 'Likely') => ({ id: 'p', tags: ['paraphrase'], fields: { acts: { gold: 'yes', said: 'fact', label, result } }, quotesValid: true, outsideSchema: [], missingIncludes: [] });
  assert.equal(gate([make('correct')], [make('missed')]).passed, true);
  const wrong = gate([{ ...make('false-fact', 'Clear'), fields: { acts: { gold: 'no', said: 'fact', label: 'Clear', result: 'false-fact' } } }], [make('correct')]);
  assert.equal(wrong.passed, false);
  assert.deepEqual(wrong.checks.filter((c) => !c.passed).map((c) => c.name), ['No consequential fact marked Clear is wrong', 'No Acts where only a person acts or the action is negated', 'No new wrong consequential fact compared with 6A', 'Better than 6A on paraphrase cases']);
  assert.equal(gate([make('missed')], [make('missed')]).passed, false, 'equal to 6A is not better');
});

test('6A baseline: every known-failure case is right on the consequential fields', () => {
  for (const s of baseline.filter((x) => x.tags.includes('known'))) {
    for (const f of ['acts', 'sensitive', 'regulated']) if (s.fields[f]) assert.ok(['correct', 'unneeded-question'].includes(s.fields[f].result), `${s.id}:${f} ${s.fields[f].result}`);
    assert.deepEqual(s.missingIncludes, [], s.id);
  }
  const t = summarise(baseline);
  assert.equal(t.badQuotes, 0);
  assert.equal(t.outsideSchema, 0);
});

test('6A baseline: the limits the new cases show, recorded so a change is noticed', () => {
  const wrong = baseline.flatMap((s) => Object.entries(s.fields).filter(([, r]) => r.result === 'false-fact' || r.result === 'over-confident').map(([f, r]) => `${s.id}:${f}:${r.result}:${r.label}`));
  // n15 and n39 were wrong at Clear until #173; n24 (a contradiction) was
  // over-confident at Likely until #175. The rules now make none.
  assert.deepEqual(wrong, []);
});
