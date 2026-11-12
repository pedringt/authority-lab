// QA findings on the released v1 (2026-11-12): Monitor's "What changed"
// said "No results yet" for results set aside by a material change; typed
// notes ending in a full stop rendered with two; each applicability review
// form needs its own key so a refused one keeps what was typed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideWith } from './helpers.mjs';
import {
  initialState, authorize, advanceToday, recordMaterialChange, recordApplicability, justification, people,
} from '../src/store/index.js';
import { setPeople, setToday, sentence } from '../src/ui.js';
import { capabilityView } from '../src/views/capability.js';

const RR = 'refund-recommendation';
const page = (s, q) => { setPeople(people(s)); setToday(s.today); return String(capabilityView(s, RR, new URLSearchParams(q))); };
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, '\'').replace(/&quot;/g, '"').replace(/\s+/g, ' ');

// Northstar's refund capability expanded (a Decision with a frozen snapshot),
// then a model change two weeks later.
function changed() {
  let s = authorize(decideWith(initialState(), RR, 'expand-limits'), RR);
  s = advanceToday(s, '2026-10-20');
  return recordMaterialChange(s, RR, { areas: ['model'], description: 'Moved to a newer model.', effectiveOn: '2026-10-20', by: 'maya' });
}

test('Monitor "What changed": results set aside by a material change never read "No results yet"', () => {
  const s = changed();
  const results = justification(s, RR).changes.filter((c) => c.kind === 'result');
  assert.ok(results.length, 'the change set results aside');
  for (const c of results) {
    assert.doesNotMatch(c.text, /No results yet now|No evidence yet now/, c.text);
    assert.match(c.text, /(No results currently count|No evidence currently counts toward this result) now\. .*await(s)? material-change review \(MC-[^)]+\) and (is|are) not counted\./, c.text);
  }
  assert.doesNotMatch(text(page(s, 'tab=monitor')), /No results yet now/);
});

test('typed notes end with one full stop: no ".." in Monitor or History', () => {
  assert.equal(sentence('Approved the design.'), 'Approved the design.');
  assert.equal(sentence('Approved the design'), 'Approved the design.');
  assert.equal(sentence('Is it right?'), 'Is it right?');
  assert.equal(sentence('  '), '');
  let s = changed();
  const row = justification(s, RR).materialImpact[0].rows[0];
  s = recordApplicability(s, RR, { changeId: `MC-${RR}-1`, rowKind: row.kind, rowId: row.id, verdict: 'partly', reason: 'Checked on ten cases.', stillSupported: 'The tone of the design.', needsFresh: 'Accuracy on the new model.', by: 'maya' });
  for (const q of ['tab=monitor', 'tab=history']) {
    const h = text(page(s, q));
    assert.match(h, /The tone of the design\. Needs fresh evidence: Accuracy on the new model\./, q);
    assert.doesNotMatch(h, /[a-z]\.\.\s/, `${q}: no doubled full stop`);
  }
});

test('each applicability review form has its own key, so a refused one keeps its own input', () => {
  const h = page(changed(), 'tab=monitor');
  const keys = [...h.matchAll(/data-form="record-applicability" data-key="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 1);
  assert.equal(new Set(keys).size, keys.length, 'unique per change and row');
});
