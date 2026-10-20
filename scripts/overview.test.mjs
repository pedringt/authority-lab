// Overview and Capabilities list (redesign, 2026-10-12): what needs action,
// as work rows that say the work, marked for the person in "Demo as".
import { test } from 'node:test';
import { decideWith } from './helpers.mjs';
import assert from 'node:assert/strict';
import {
  initialState, selectDecision, authorize, simulateBreach, setActingAs, people, proposeAmendment, current,
} from '../src/store/index.js';
import { requirementWork } from '../src/store/overview.js';
import { setPeople } from '../src/ui.js';
import { overviewView } from '../src/views/overview.js';
import { capabilitiesView } from '../src/views/capabilities.js';

const RR = 'refund-recommendation';
const TC = 'ticket-classification';

function render(s) {
  setPeople(people(s));
  return String(overviewView(s));
}
const part = (out, from, to) => out.slice(out.indexOf(`id="${from}"`), to ? out.indexOf(`id="${to}"`) : undefined);
const rows = (html) => html.split('<div class="ov-row ').slice(1);
const count = (html, re) => (html.match(re) || []).length;
const titleOf = (row) => (row.match(/<p class="ov-title">([^<]*)<\/p>/) || [])[1];

test('every to-do and approval is one compact row: capability, one title, one supporting line, the owner, one action', () => {
  const out = render(initialState());
  const all = [...rows(part(out, 'todo', 'approvals')), ...rows(part(out, 'approvals', 'results'))];
  assert.ok(all.length >= 5);
  for (const r of all) {
    for (const cls of ['ov-cap', 'ov-title', 'ov-sub', 'ov-who']) assert.equal(count(r, new RegExp(`class="${cls}"`, 'g')), 1, `${cls} once in: ${titleOf(r)}`);
    assert.equal(count(r, /<a class="btn/g), 1, 'one action, on the right');
    assert.doesNotMatch(r, /class="card|<h3|class="badge/, 'a row on a divider, not a card, and no badges');
    const cap = (r.match(/<p class="ov-cap">([^<]*)<\/p>/) || [])[1];
    assert.ok(!titleOf(r).includes(cap), `the capability isn't repeated in the title: ${titleOf(r)}`);
  }
  // Owners are plain metadata.
  assert.match(part(out, 'todo', 'approvals'), /<p class="ov-who">Owner: Priya Natarajan<\/p>/);
  // No intro paragraph under the title.
  assert.doesNotMatch(out, /class="lede"/);
});

test('to-do titles say the work, derived from the seeded requirements and decision', () => {
  const todo = part(render(initialState()), 'todo', 'approvals');
  const titles = rows(todo).map(titleOf);
  assert.deepEqual(titles, [
    'Decide whether to expand autonomy within limits',
    'Collect 22 more high-value refund cases',
    'Raise accuracy to 90%',
    'Complete the requirements to return to Draft',
  ]);
  assert.match(todo, /Decide whether to expand autonomy within limits<\/p>\s*<p class="ov-sub">5 of 6 Requirements met · high-value refund performance needs more evidence<\/p>/);
  assert.match(todo, /Collect 22 more high-value refund cases<\/p>\s*<p class="ov-sub">18 of 40 collected · 5 of 6 Requirements met<\/p>/);
  assert.match(todo, /Raise accuracy to 90%<\/p>\s*<p class="ov-sub">Currently 88% · 4 of 5 Requirements met<\/p>/);
  assert.match(todo, /Complete the requirements to return to Draft<\/p>\s*<p class="ov-sub">A redesigned idempotency check and 100 clean executions in a replay environment\.<\/p>/);
  // Links: the decision opens Decide; the open requirements open Status.
  assert.match(todo, /href="#\/capabilities\/refund-recommendation\?tab=decide">Review →/);
  assert.match(todo, /href="#\/capabilities\/response-drafting\?tab=status">Open →/);
  assert.match(todo, /href="#\/capabilities\/refund-execution-high-value\?tab=status">Open →/);
  // No mechanism-first wording left.
  assert.doesNotMatch(todo, /Meet the open check|Meet the condition|can move to Level/);
});

test('requirement parsing is generic and falls back to "Meet:" when it cannot read the text', () => {
  assert.equal(requirementWork({ text: 'Minimum 200 pilot cases', current: '96' }).title, 'Collect 104 more pilot cases');
  assert.equal(requirementWork({ text: 'At least 1,000 tickets', current: '250' }).title, 'Collect 750 more tickets');
  assert.equal(requirementWork({ text: 'Severe error rate ≤ 2%', current: '3%' }).title, 'Bring severe error rate down to 2%');
  assert.equal(requirementWork({ text: 'Overall accuracy ≥ 99%', current: 'Not measured' }).title, 'Meet: overall accuracy ≥ 99%');
  assert.equal(requirementWork({ text: 'A 30-day restore for closed accounts exists in production', current: 'Does not exist' }).title, 'Meet: a 30-day restore for closed accounts exists in production');
});

test('only the most important to-do is emphasized: an open decision, or a review ahead of it', () => {
  let out = render(initialState());
  assert.equal(count(out, /class="ov-row is-hot"/g), 1);
  assert.match(part(out, 'todo', 'approvals'), /^[^]*?<div class="ov-row is-hot">\s*<div class="ov-text">\s*<p class="ov-cap">Refund recommendation<\/p>\s*<p class="ov-title">Decide whether/);
  // A review on another capability outranks the decision, which loses its emphasis.
  out = render(simulateBreach(initialState(), TC));
  const todo = part(out, 'todo', 'approvals');
  assert.equal(count(out, /is-hot/g), 1);
  assert.match(todo, /^[^]*?<div class="ov-row is-hot">\s*<div class="ov-text">\s*<p class="ov-cap">Ticket classification<\/p>\s*<p class="ov-title">Review why Ticket classification was moved back to/);
  assert.match(todo, /<div class="ov-row ">\s*<div class="ov-text">\s*<p class="ov-cap">Refund recommendation<\/p>\s*<p class="ov-title">Decide whether/);
  // Nothing in Approvals is emphasized.
  assert.doesNotMatch(part(out, 'approvals', 'results'), /is-hot|btn-primary/);
});

test('approvals: what is waiting, since when, who can approve, and a link to Status › approvals', () => {
  const ap = part(render(initialState()), 'approvals', 'results');
  assert.match(ap, /<p class="ov-title">2 refunds need human review<\/p>\s*<p class="ov-sub">\$48 on ORD-5006 · \$180 on ORD-5005, over \$100<\/p>/);
  assert.match(ap, /Waiting since Oct 7 · the owner or any stakeholder can approve/);
  assert.match(ap, /href="#\/capabilities\/refund-recommendation\?tab=status&amp;show=approvals">Review →/);
  assert.doesNotMatch(ap, /a person to decide|The AI is at/);
});

test('"yours" follows "Demo as": the owner sees their to-dos; anyone who may approve sees the approvals', () => {
  let s = initialState();
  const yoursTitles = (out, from, to) => rows(part(out, from, to)).filter((r) => /<span class="ov-yours">yours<\/span>/.test(r)).map(titleOf);
  // Maya (the default, owner of Refund recommendation).
  let out = render(setActingAs(s, 'maya'));
  assert.deepEqual(yoursTitles(out, 'todo', 'approvals'), ['Decide whether to expand autonomy within limits', 'Collect 22 more high-value refund cases']);
  assert.deepEqual(yoursTitles(out, 'approvals', 'results'), ['2 refunds need human review']);
  // Daniel owns the restricted refund execution, and is a stakeholder on refund recommendation.
  out = render(setActingAs(s, 'daniel'));
  assert.deepEqual(yoursTitles(out, 'todo', 'approvals'), ['Complete the requirements to return to Draft']);
  assert.deepEqual(yoursTitles(out, 'approvals', 'results'), ['2 refunds need human review']);
  // Plain text, not a badge.
  assert.match(out, /Owner: Daniel Okafor · <span class="ov-yours">yours<\/span>/);
  // A proposed change: the proposer can't approve it, so it isn't theirs; Risk's is.
  s = proposeAmendment(s, RR, 'criteria', { value: { criteria: current(s, RR, 'criteria'), requirements: current(s, RR, 'requirements').map((r) => (r.id === 'high-value' ? { ...r, text: 'Minimum 15 high-value refund cases' } : r)) }, by: 'priya', reason: 'Volume is too low to reach 40 this quarter.' });
  out = render(setActingAs(s, 'priya'));
  assert.ok(!yoursTitles(out, 'approvals', 'results').includes('Review a proposed target change'));
  out = render(setActingAs(s, 'daniel'));
  assert.ok(yoursTitles(out, 'approvals', 'results').includes('Review a proposed target change'));
  assert.match(out, /0 of 2 approvals · Risk approval still needed: Daniel Okafor or Sofia Alvarez · <span class="ov-yours">yours<\/span>/);
});

test('important results: a quiet list, each with a short kind, what happened and one line of what it means', () => {
  const out = render(initialState());
  const res = part(out, 'results', 'autonomy');
  const items = res.split('<div class="ov-result">').slice(1);
  assert.deepEqual(items.map((r) => (r.match(/class="ov-kind[^"]*">([^<]*)</) || [])[1]), ['Under-tested', 'Severe miss', 'Moved back']);
  for (const r of items) {
    assert.equal(count(r, /class="ov-title"/g), 1);
    assert.equal(count(r, /class="ov-so"/g), 1);
    assert.match(r, /class="ov-result-cap" href="#\/capabilities\//);
  }
  assert.doesNotMatch(res, /class="card|class="badge/);
  assert.match(res, /High-value refunds \(&gt; \$100\): 83% accurate on only 18 cases\.<\/p><p class="ov-so">These cases stay under human review; any expansion would leave them out\./);
  assert.match(res, /A \$420 request on a fraud-flagged account was recommended for refund\./);
  assert.match(res, /Returned to Recommend on Sep 24 by Daniel Okafor\.<\/p><p class="ov-so">A retry executed a \$180 refund twice for one order\./);
  // The duplicate refund is said once, as the reason it was moved back.
  assert.equal(count(res, /\$180 refund twice/g), 1);
  // No anthropomorphic wording anywhere on the page.
  assert.doesNotMatch(out, /the AI\b/i);
});

test('current autonomy: a compact table that leads with what each capability handles now', () => {
  const out = render(initialState());
  const t = part(out, 'autonomy');
  assert.match(t, /<th>Capability<\/th><th>What it handles now<\/th><th>Next<\/th>/);
  assert.match(t, /<strong>Refund recommendation<\/strong><\/a><\/td>\s*<td>Prepares each refund; a person approves every one<div class="ov-level">Draft<\/div><\/td>\s*<td class="ov-next"><span class="badge badge-decision">Ready<\/span> to decide on expanding within limits<\/td>/);
  assert.match(t, /<td>No automation; a person does all the work<div class="ov-level">Observe<\/div><\/td>\s*<td class="ov-next">Not delegated, by design<\/td>/);
  assert.match(t, /<td class="ov-next">Accuracy 88%, needs 90%<\/td>/);
  assert.match(t, /<span class="badge badge-restricted">Restricted<\/span> until it meets the requirements to return to Draft/);
  // Badges only for Ready, Restricted and Needs review; levels are a quiet line, no ladder.
  for (const b of t.match(/class="badge [^"]*">[^<]*/g)) assert.match(b, />(Ready|Restricted|Needs review)$/);
  assert.doesNotMatch(t, /class="ladder"|Level \d/);
});

test('after expand-with-limits and a crossed limit: the review leads, emphasized, and the decision has gone', () => {
  const s = simulateBreach(authorize(decideWith(initialState(), RR, 'expand-limits'), RR), RR);
  const out = render(s);
  const todo = rows(part(out, 'todo', 'approvals'));
  assert.match(todo[0], /^is-hot">/);
  assert.equal(titleOf(todo[0]), 'Review why Refund recommendation was moved back to Draft');
  assert.match(todo[0], /<p class="ov-sub">Crossed a safety limit on Oct 7: [^<]*\(limit 5%\)<\/p>/);
  assert.match(todo[0], /href="#\/capabilities\/refund-recommendation\?tab=monitor">Record the review →/);
  assert.equal(count(out, /is-hot/g), 1);
  assert.doesNotMatch(out, /Decide whether to expand/);
  assert.match(part(out, 'results', 'autonomy'), /Moved back automatically<a[^>]*>Refund recommendation<\/a><\/p>\s*<div class="ov-text"><p class="ov-title">Crossed a safety limit: [^<]*<\/p><p class="ov-so">Returned to Draft on Oct 7\. A review comes before any expansion\./);
  assert.match(part(out, 'autonomy'), /<span class="badge badge-restricted">Needs review<\/span> before any expansion/);
});

test('the Capabilities list is the same simple table: capability, what it handles now, autonomy, owner', () => {
  const s = initialState();
  setPeople(people(s));
  const out = String(capabilitiesView(s));
  assert.match(out, /<th>Capability<\/th><th>What it handles now<\/th><th>Autonomy<\/th><th>Owner<\/th>/);
  assert.match(out, /<strong>Refund execution &gt; \$50<\/strong><\/a><\/td>\s*<td>Suggests; a person decides and acts<\/td>\s*<td>Recommend · Restricted<\/td>\s*<td class="muted">Daniel Okafor<\/td>/);
  assert.match(out, /<td>Draft<\/td>\s*<td class="muted">Maya Chen<\/td>/);
  assert.match(out, /href="#\/capabilities\/new">Add capability/);
  for (const c of s.capabilities) assert.ok(out.includes(`href="#/capabilities/${c.id}"><strong>${c.name.replace('>', '&gt;')}</strong>`), c.name);
  assert.doesNotMatch(out, /class="card|level-legend|class="badge|class="lede"/, 'no cards, no level legend, no badges');
});
