// Status tab (redesign, 2026-10-12): what can this capability do now, and why?
// One narrative, each state explained once, the waiting actions, and one line
// each for boundaries and people. Uses the real seed and store transitions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState, authorize, selectDecision, simulateBreach, addCapability, setActingAs, people, approveAction, rejectAction, waitingActions, capData,
} from '../src/store/index.js';
import { setPeople } from '../src/ui.js';
import { capabilityView } from '../src/views/capability.js';

const RR = 'refund-recommendation';
const RX = 'refund-execution-high-value';
const AC = 'account-closure';

const page = (s, id, q = '') => { setPeople(people(s)); return String(capabilityView(s, id, new URLSearchParams(q))); };
const story = (h) => h.slice(h.indexOf('<section class="st-story"'), h.indexOf('</section>', h.indexOf('<section class="st-story"')));
const count = (h, re) => (h.match(new RegExp(re, 'g')) || []).length;
const OLD_LABELS = /Next possible level|Main concern|Ready for a decision\?|Open tasks and approvals/;
const nextLinks = (h) => [...story(h).matchAll(/<p class="st-next"><a href="([^"]+)">Next: ([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]);

// What every Status page promises, whatever the state.
function onePage(h, kind) {
  assert.doesNotMatch(h, OLD_LABELS, 'the old Summary boxes are gone');
  assert.equal(count(h, 'What happens next'), 1, 'exactly one "What happens next" statement');
  assert.equal(count(h, 'class="st-chapter"><span class="st-k">What happens next'), 1);
  assert.match(story(h), new RegExp(`data-next="${kind}"`));
  assert.ok(nextLinks(h).length <= 1, 'at most one Next link');
  assert.match(h, /<b>People involved: \d+<\/b>/, 'people as one line');
  assert.match(h, /href="#\/capabilities\/[^"]+\/stakeholders\/edit">Manage stakeholders/);
}

const breached = () => simulateBreach(authorize(selectDecision(initialState(), RR, 'expand-limits'), RR), RR);

test('Status, Refund recommendation (a decision is open): the level in plain words, why, the decision, what it unlocks, one link to Decide', () => {
  const s = initialState();
  const h = page(s, RR);
  onePage(h, 'decision');
  const st = story(h);
  assert.match(st, /<h2 class="st-title">Draft <span class="st-lvl">Level 2<\/span> <\/h2>/, 'plain name, quiet level, no badge when nothing is wrong');
  assert.match(st, /Refunds are prepared automatically\. A person approves every one before it takes effect\./);
  assert.match(st, /Why it&#39;s here<\/span><p>Moved to Draft on Sep 2 by Maya Chen \(expand autonomy\)\. The pilot that followed is done: 218 cases, 94% accurate\./);
  assert.match(st, /What happens next<\/span><p>Decide whether it moves to Act within limits\. 5 of 6 checks are met; still open: high-value refund performance needs more evidence\./);
  assert.match(st, /Then<\/span><p>Standard refunds up to \$50 would run without review\. Everything else stays under human review\./);
  assert.deepEqual(nextLinks(h), [[`#/capabilities/${RR}?tab=decide`, 'review the evidence and decide whether autonomy should expand →']]);
  assert.match(st, /Owner: Maya Chen/);
  assert.doesNotMatch(st, /View boundaries/, 'boundaries and history links are for a restricted capability');
  // The readiness is said once on the page.
  assert.equal(count(h, '5 of 6 checks'), 1);
});

test('Status: the actions waiting for a person, as rows with the approve/reject form, and who is approving', () => {
  const s = initialState();
  const h = page(s, RR);
  assert.match(h, /<h2>Needs a decision <span class="st-n">2 refunds<\/span><\/h2>/);
  for (const x of waitingActions(s, RR)) {
    assert.match(h, new RegExp(`<form class="st-act" data-form="decide-action" data-id="${x.id}">\\s*<input type="text" name="reason"`), x.id);
  }
  assert.equal(count(h, 'name="decision" value="approve">Approve</button>'), 2);
  assert.equal(count(h, 'name="decision" value="reject">Reject</button>'), 2);
  assert.match(h, /Refund \$180 on ORD-5005<\/div><div class="st-row-sub">[^<]*Refunds over \$100\. Any policy exception\./, 'each row says why it needs a person');
  assert.match(h, /Approving as <strong>Maya Chen<\/strong>; a reason is required\./);
  assert.match(h, new RegExp(`href="#/capabilities/${RR}\\?tab=status&show=approvals">All waiting actions →`));
  // Someone who can't decide sees why, just in time, and how to switch people.
  const asJonas = page(setActingAs(s, 'jonas'), RR);
  assert.doesNotMatch(asJonas, /data-form="decide-action"/);
  // The heading is neutral, so it never says "your" decision to someone who can't make it (review, 2026-10-12).
  assert.match(asJonas, /<h2>Needs a decision <span class="st-n">2 refunds<\/span><\/h2>/);
  assert.doesNotMatch(asJonas, /Needs your decision/);
  assert.match(asJonas, /Jonas Lindqvist isn&#39;t the owner or a named stakeholder of Refund recommendation\. For the demo, switch people in &quot;Demo as&quot; at the top\./);
  // A Risk stakeholder can approve too, and the page says it's them.
  assert.match(page(setActingAs(s, 'daniel'), RR), /Approving as <strong>Daniel Okafor<\/strong>; a reason is required\./);
  // Nothing waiting: no section at all.
  assert.doesNotMatch(page(s, RX), /Needs a decision/);
});

test('Status: boundaries and people are one line each, opened on demand', () => {
  const s = initialState();
  const h = page(s, RR);
  assert.match(h, /<summary><b>Boundaries<\/b><span class="st-meta-text">4 allowed · 10 require human review · 4 never allowed<\/span><span class="st-open">View<\/span><\/summary>/);
  for (const k of ['Allowed', 'Requires human review', 'Never allowed']) assert.match(h, new RegExp(`<div class="st-k">${k}</div>`), k);
  assert.match(h, /Automation is pulled back if severe error rate above 5% across the rolling 50 autonomous cases, if 2 high-severity policy violations within 7 days, or if another of its 5 safety limits is crossed\./);
  assert.match(h, new RegExp(`href="#/capabilities/${RR}\\?tab=status&show=rules">All rules →`));
  assert.match(h, /<summary><b>People involved: 5<\/b><span class="st-meta-text">Not unanimous: authority for high-value refunds\.<\/span><span class="st-open">View positions<\/span><\/summary>/);
  assert.match(h, /Daniel Okafor<\/strong> <span class="muted">Risk<\/span>: <span class="st-pos st-pos-hold">Hold high-value cases/);
  // Without a written summary, positions are counted by stance.
  assert.match(page(s, RX), /<b>People involved: 5<\/b><span class="st-meta-text">All 5 agree: restrict\.<\/span>/);
  assert.match(page(s, 'ticket-classification'), /<b>People involved: 4<\/b><span class="st-meta-text">Positions: 3 expand with limits, 1 expand\.<\/span>/);
});

test('Status, Refund execution > $50 (restricted by a person): Recommend only, why, the open condition, and what it leads to, each said once', () => {
  const s = initialState();
  const h = page(s, RX);
  onePage(h, 'held');
  const st = story(h);
  assert.match(st, /<h2 class="st-title">Recommend only <span class="st-lvl">Level 1<\/span> <span class="badge badge-restricted">Restricted<\/span><\/h2>/);
  assert.equal(count(h, 'class="badge'), 1, 'one state badge on the page');
  assert.match(st, /Why it&#39;s here<\/span><p>Moved back from Draft on Sep 24 by Daniel Okafor \(reduce autonomy one level\)\. A retry executed a \$180 refund twice for one order\./);
  assert.match(st, /What happens next<\/span><p>Return to Draft requires a redesigned idempotency check and 100 clean executions in a replay environment\./);
  assert.match(st, /Then<\/span><p>It can be reconsidered for Draft\./);
  assert.equal(count(h, 'idempotency check and 100 clean'), 1, 'the condition is stated once');
  assert.deepEqual(nextLinks(h), [], 'nothing to do on another tab until the condition is met');
  assert.match(st, new RegExp(`Owner: Daniel Okafor</span><a href="#/capabilities/${RX}\\?tab=status&show=rules">View boundaries</a><a href="#/capabilities/${RX}\\?tab=history">View history</a>`));
});

test('Status, Account closure (not delegated): says so once, with what would reopen it, and no link onward', () => {
  const h = page(initialState(), AC);
  onePage(h, 'not-delegated');
  const st = story(h);
  assert.match(st, /<h2 class="st-title">Observe <span class="st-lvl">Level 0<\/span> <\/h2>/);
  assert.match(st, /What happens next<\/span><p>Nothing is planned: it isn&#39;t delegated, by design\./);
  assert.match(st, /Then<\/span><p>It can be reconsidered once this is true: a 30-day restore for closed accounts exists in production\./);
  // Once in the page's own words (stakeholders' recorded positions may say it too).
  assert.equal(count(h.slice(0, h.indexOf('st-people-line')), 'delegated, by design'), 1);
  assert.deepEqual(nextLinks(h), []);
});

test('Status after expand-limits and a crossed safety limit: a review is needed, and who can record it depends on who is acting', () => {
  const s = breached();
  const asMaya = page(s, RR);
  onePage(asMaya, 'review');
  const st = story(asMaya);
  assert.match(st, /<h2 class="st-title">Draft <span class="st-lvl">Level 2<\/span> <span class="badge badge-restricted">Needs review<\/span><\/h2>/);
  assert.match(st, /Why it&#39;s here<\/span><p>Moved back from Act within limits automatically on Oct 7\. It crossed a safety limit: 6% across the rolling 50-case window \(limit 5%\)\./);
  assert.match(st, /What happens next<\/span><p>A review of what happened comes before any more autonomy\. Daniel Okafor or Sofia Alvarez can record it\./, 'Maya authorized the expansion and is not a Risk approver');
  assert.match(st, /Then<\/span><p>After the review, a return to Act within limits can be proposed and decided again\./);
  assert.deepEqual(nextLinks(asMaya), [[`#/capabilities/${RR}?tab=monitor`, 'record the review →']]);
  assert.equal(count(asMaya, 'crossed a safety limit'), 1, 'the crossing is explained once');
  assert.doesNotMatch(st, /You can record it/);
  // Daniel, a Risk approver who didn't authorize the expansion, is told it's his to record.
  const asDaniel = page(setActingAs(s, 'daniel'), RR);
  assert.match(story(asDaniel), /What happens next<\/span><p>A review of what happened comes before any more autonomy\. You can record it\./);
  // The waiting actions are still here, for whoever may decide them.
  assert.match(asDaniel, /Approving as <strong>Daniel Okafor<\/strong>/);
});

test('Status, a newly added capability: the setup stage as the one next statement, linking to Setup', () => {
  const s = addCapability(initialState(), { name: 'Order status lookup', summary: 'Answers where an order is.', owner: 'priya', risk: { impact: 'Low', reversibility: 'Easy to reverse', exposure: 'Internal only' }, startingLevel: 1, by: 'priya' });
  const id = 'order-status-lookup';
  const h = page(s, id);
  onePage(h, 'setup');
  const st = story(h);
  assert.match(st, /<h2 class="st-title">Recommend <span class="st-lvl">Level 1<\/span> <\/h2>/);
  assert.match(st, /Why it&#39;s here<\/span><p>Added by Priya Natarajan on Oct 7\. Starting at Recommend/);
  assert.match(st, /What happens next<\/span><p>It&#39;s still being set up\. Next setup step: set the boundaries\./);
  assert.deepEqual(nextLinks(h), [[`#/capabilities/${id}/setup?step=contract`, 'set the boundaries →']]);
  assert.match(h, /<b>Boundaries<\/b><span class="st-meta-text">No rules yet\.<\/span><a class="st-open" href="#\/capabilities\/order-status-lookup\/contract\/build">Set up rules →/);
  assert.match(h, /<b>People involved: 1<\/b><span class="st-meta-text">Only the owner, Priya Natarajan, so far\.<\/span>/);
  assert.doesNotMatch(h, /Needs a decision/);
});

test('Status › Rules: Allowed, Requires human review (two groups), Never allowed, pulled back if, data and risk, every line kept', () => {
  const s = initialState();
  const h = page(s, RR, 'tab=status&show=rules');
  const order = ['Allowed', 'Requires human review', 'Never allowed', 'Automation is pulled back if', 'Data it can access', 'Risk profile'];
  const at = order.map((t) => h.indexOf(`<h3>${t}</h3>`));
  assert.ok(at.every((i) => i > 0), 'every section is there');
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'in order');
  const c = capData(s, RR).versions.contract.at(-1).value;
  for (const line of [...c.may, ...c.mustAsk, ...c.escalation, ...c.mustNever, ...c.autoRestriction]) assert.ok(h.includes(line.replace(/&/g, '&amp;').replace(/'/g, '&#39;')), line);
  assert.match(h, /For these cases<\/p>[\s\S]*Whenever this comes up<\/p>/);
  assert.match(h, /Changes are kept in <a href="#\/capabilities\/refund-recommendation\/versions\?kind=contract&version=1">history<\/a>/);
  assert.match(h, /Propose a change<\/a>/);
  for (const q of ['How serious would a bad decision be?', 'Can it be undone?', 'Who or what is affected?']) assert.ok(h.includes(q), q);
  assert.doesNotMatch(h, /class="card contract-block/, 'sections on dividers, not cards');
});

test('Status › Approvals: the same rows, and decided actions below with who decided and why', () => {
  let s = initialState();
  const [first, second] = waitingActions(s, RR).map((x) => x.id);
  s = rejectAction(s, first, { by: 'maya', reason: 'Item was never returned.' });
  const h = page(s, RR, 'tab=status&show=approvals');
  assert.match(h, /<h2>Needs a decision <span class="st-n">1 refund<\/span><\/h2>/);
  assert.match(h, new RegExp(`data-form="decide-action" data-id="${second}"`));
  assert.doesNotMatch(h, new RegExp(`data-form="decide-action" data-id="${first}"`), 'a decided action has no form');
  assert.match(h, /<h2>Decided <span class="st-n">1<\/span><\/h2>/);
  assert.ok(h.indexOf('Needs a decision') < h.indexOf('<h2>Decided'), 'decided ones below');
  assert.match(h, /<dt>Reason<\/dt><dd>Item was never returned\.<\/dd>/);
  assert.match(h, /<dt>Decided by<\/dt><dd>Maya Chen, Oct 7<\/dd>/);
  // The Status page shows only what still waits.
  assert.match(page(s, RR), /Needs a decision <span class="st-n">1 refund<\/span>/);
  // Once nothing waits, the Status section disappears and Approvals says so.
  s = approveAction(s, second, { by: 'daniel', reason: 'Policy exception is documented.' });
  assert.doesNotMatch(page(s, RR), /Needs a decision/);
  assert.match(page(s, RR, 'tab=status&show=approvals'), /Nothing needs approval\./);
});

test('The autonomy ladder names the level for screen readers, not a count (review, 2026-10-12)', async () => {
  const { ladder } = await import('../src/views/overview.js');
  assert.match(String(ladder(3)), /role="img" aria-label="Level 3, Act Within Limits"/);
  assert.match(String(ladder(0, 1)), /aria-label="Level 0, Observe"/);
  for (let l = 0; l <= 4; l++) assert.doesNotMatch(String(ladder(l)), / of 4/);
});
