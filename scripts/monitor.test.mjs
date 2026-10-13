// Monitor and History (redesign, 2026-10-12): each Monitor view leads with one
// verdict, the detail opens on demand, and History is one timeline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as seed from '../src/data/seed.js';
import {
  initialState, selectDecision, authorize, simulateBreach, recordReview, setActingAs, addCapability, setOutcome, OUTCOMES_MAX,
  callTool, proposeAmendment, approveProposal, current, versionsInForce,
} from '../src/store/index.js';
import { capabilityView } from '../src/views/capability.js';
import { logGate } from '../src/store/gatelog.js';
import { SWITCH_PERSON } from '../src/ui.js';

const RR = 'refund-recommendation';
const AC = 'account-closure';
const page = (s, id, q) => String(capabilityView(s, id, new URLSearchParams(q)));
const safe = (s, id = RR) => page(s, id, 'tab=monitor');
const value = (s, id = RR) => page(s, id, 'tab=monitor&show=value');
const history = (s, id = RR) => page(s, id, 'tab=history');
const verdicts = (html) => [...html.matchAll(/<div class="mon-verdict is-([a-z]+)"[^>]*><span class="mon-verdict-title">([^<]+)<\/span>/g)].map((m) => [m[1], m[2]]);
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, '\'').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const lineTitles = (html) => [...html.matchAll(/<details class="mh-line"[^>]*><summary><strong>([^<]+)<\/strong>/g)].map((m) => m[1]);

const expanded = () => authorize(selectDecision(initialState(), RR, 'expand-limits'), RR);
const breached = () => simulateBreach(expanded(), RR);
const REVIEW = { whatHappened: 'Three automatic refunds were wrong.', cause: 'Return status was not checked first.', changes: 'The rules now check the return before refunding.' };

// ---------------------------------------------------------------------------
// Still safe?
// ---------------------------------------------------------------------------

test('Still safe? within limits after an expansion: one verdict, the outcomes, then one-line disclosures', () => {
  const html = safe(expanded());
  assert.deepEqual(verdicts(html), [['pass', 'Within limits']], 'exactly one verdict');
  assert.match(text(html), /No safety limits have been crossed since autonomy was expanded on Oct 7\./);
  assert.match(text(html), /43 ran automatically 12 sent to human review 2 reversed by a reviewer 0 incidents/);
  assert.match(html, /simulated demo data/, 'the simulated monitoring numbers say so');
  assert.deepEqual(lineTitles(html), ['Safety limits', 'What the automation tried']);
  assert.match(html, /<span class="mh-line-meta">5 limits, all within range<\/span>/);
  assert.match(text(html), /2%, last 50 cases · limit 5% \(simulated\)/, 'each limit has its reading and its limit');
  assert.match(html, /counted from logged actions/);
  assert.match(text(html), /From logged actions so far: 0 ran automatically · 2 sent to human review · 0 blocked/);
  assert.match(html, /tab=decide&(amp;)?show=results/, 'the full gate activity is one link away');
  assert.match(html, /Rollout plan: Priya Natarajan · starts Oct 8 · review on Oct 22/);
  // The demo control sits in its own demo spot, after everything else.
  assert.match(html, /<div class="mon-demo"><span class="mon-demo-label">Demo<\/span>[\s\S]*data-action="simulate-breach" data-capability="refund-recommendation">Simulate a safety-limit breach<\/button>/);
  assert.ok(html.indexOf('mon-demo') > html.indexOf('Rollout plan'));
  assert.doesNotMatch(html, /data-form="record-review"|Needs review/);
  assert.doesNotMatch(html, /Expected impact|Return on investment|How reviewers are using it/, 'value lives in the other view');
});

test('Still safe? autonomy reduced: what happened, then who reviews it, following "Demo as"', () => {
  const s = breached();
  const maya = safe(s);
  assert.deepEqual(verdicts(maya), [['bad', 'Autonomy reduced']]);
  assert.match(text(maya), /Refund recommendation was moved back to Draft after crossing a safety limit on Oct 7\./);
  assert.match(text(maya), /6% across the rolling 50-case window \(limit 5%\)/);
  assert.match(text(maya), /A person approves every action until someone reviews what happened\./, 'what the reduced level means');
  assert.match(maya, /<h2>What happened<\/h2>/);
  assert.match(text(maya), /Automatic refund of \$48 approved where the item had not been returned\./);
  assert.ok(maya.indexOf('What happened') < maya.indexOf('Needs review</span></h2>'), 'what happened comes before the review');
  // Maya approved the expansion and isn't a Risk approver: she sees who can, and why not her.
  assert.doesNotMatch(maya, /data-form="record-review"/, 'no form for someone who can\'t record it');
  assert.match(text(maya), /A Risk approver must record the review: Daniel Okafor or Sofia Alvarez\./);
  assert.match(text(maya), /Maya Chen approved the autonomy change being reviewed, and nobody reviews their own decision\./);
  assert.ok(maya.includes(SWITCH_PERSON.replace(/"/g, '&quot;')));
  assert.equal((text(maya).match(/own decision/g) || []).length, 1, 'the reason is given once');
  assert.doesNotMatch(maya, /data-action="simulate-breach"/, 'nothing left to simulate');
  // Daniel is a Risk approver who didn't authorize it: he gets the form, with the fields main.js reads.
  const daniel = safe(setActingAs(s, 'daniel'));
  assert.deepEqual(verdicts(daniel), [['bad', 'Autonomy reduced']]);
  assert.match(daniel, /<form class="review-form" data-form="record-review" data-capability="refund-recommendation">/);
  for (const f of ['whatHappened', 'cause', 'changes']) assert.match(daniel, new RegExp(`name="${f}"`), f);
  assert.match(daniel, />Save review<\/button>/);
  assert.match(text(daniel), /Reviewing as Daniel Okafor/);
  assert.doesNotMatch(text(daniel), /must record the review/);
});

test('Still safe? after the review: still reduced, said once, with the review one line away', () => {
  const s = recordReview(breached(), RR, { by: 'daniel', ...REVIEW });
  const html = safe(s);
  assert.deepEqual(verdicts(html), [['watch', 'Autonomy reduced']]);
  assert.match(text(html), /Daniel Okafor reviewed it on Oct 7\. It stays at Draft until a change to its autonomy is approved in Decide\./);
  assert.doesNotMatch(html, /data-form="record-review"|Needs review/);
  assert.ok(lineTitles(html).includes('Post-incident reviews'));
  assert.match(text(html), /Return status was not checked first\./);
});

test('Still safe? a rule incident without a level change reads "Needs review"', () => {
  const s = simulateBreach(initialState(), AC);
  const owner = safe(s, AC);
  assert.deepEqual(verdicts(owner), [['bad', 'Needs review']]);
  assert.match(text(owner), /This limit opens an incident instead of reducing autonomy, so Account closure stays at Observe\./);
  assert.match(owner, /<h2>Review what happened<\/h2>/, 'the verdict already says "Needs review"; the section doesn\'t repeat it');
  assert.match(owner, /data-form="record-review" data-capability="account-closure"/, 'Daniel owns it and is a Risk approver');
  assert.match(text(owner), /Autonomy doesn't change\./);
  const maya = safe(setActingAs(s, 'maya'), AC);
  assert.doesNotMatch(maya, /data-form="record-review"/);
  assert.match(text(maya), /only a Risk approver can record this review/);
});

test('Still safe? nothing to monitor yet: a Level 1 capability with no safety limits, and limits that don\'t apply yet', () => {
  const s = addCapability(initialState(), { name: 'Warranty triage', summary: 'Sorts warranty claims.', owner: 'priya', risk: { impact: 'Low', reversibility: 'Easy to reverse', exposure: 'Internal only' }, startingLevel: 1 });
  const id = s.capabilities.at(-1).id;
  const added = safe(s, id);
  assert.deepEqual(verdicts(added), [['neutral', 'Nothing to monitor yet']]);
  assert.match(text(added), /Warranty triage's rules don't say when to reduce its autonomy, so nothing is checked automatically\./);
  assert.match(added, /tab=status&show=rules/);
  assert.doesNotMatch(added, /mon-stats|data-action="simulate-breach"|Within limits/);
  // The seeded capability at Draft: its limits start above Draft.
  const seeded = safe(initialState());
  assert.deepEqual(verdicts(seeded), [['neutral', 'Nothing to monitor yet']]);
  assert.match(text(seeded), /Its safety limits start applying once it has more autonomy than Draft\./);
  assert.match(seeded, /<span class="mh-line-meta">none apply at Draft yet<\/span>/);
});

// ---------------------------------------------------------------------------
// Delivering value?
// ---------------------------------------------------------------------------

test('Delivering value? on pilot numbers is "Too early to judge", neutral, not a failure', () => {
  const html = value(expanded());
  assert.deepEqual(verdicts(html), [['neutral', 'Too early to judge']]);
  assert.match(text(html), /0 of 3 rollout goals met so far\. It's day 3 of the rollout\. Pilot numbers fill the gap until enough production cases come in \(0 of 20 production cases recorded\)\./);
  assert.match(html, /<th>Goal<\/th><th>Expected<\/th><th>So far<\/th>/);
  assert.equal((html.match(/\(pilot · demo data\)/g) || []).length, 3, 'every pilot number is labelled');
  assert.doesNotMatch(html, /badge-fail|Not met</, 'no failure styling while it is too early');
  // ROI and adoption are one-line disclosures after the verdict and the goals; ROI doesn't lead.
  assert.deepEqual(lineTitles(html), ['Return on investment', 'How reviewers are using it']);
  const at = (s) => html.indexOf(s);
  assert.ok(at('mon-verdict') < at('<th>Goal') && at('<th>Goal') < at('Return on investment'));
  assert.match(html, /<span class="mh-line-meta">about \$4,041 a month, estimated<\/span>/);
  assert.match(html, /<details class="mh-line" ><summary><strong>Return on investment<\/strong>[\s\S]*data-form="roi-assumptions"[\s\S]*<\/details><\/div><\/details>/, 'the assumptions form is inside the ROI disclosure');
  assert.match(html, /<span class="mh-line-meta">2 early warnings, simulated demo data<\/span>/);
  assert.match(html, /Simulated demo data/);
});

test('Delivering value? on real logged numbers: too early until 20 production cases, then "N of M rollout goals on track", and misses count on the chip', () => {
  let s = selectDecision(initialState(), RR, 'expand-limits');
  const rows = [{ metric: 'Share done automatically', target: '≥ 50%' }, { metric: 'Escalation rate', target: '≤ 30%' }];
  for (let i = 0; i < OUTCOMES_MAX; i++) {
    const r = rows[i] || { metric: '', target: '' };
    s = setOutcome(setOutcome(s, RR, i, 'metric', r.metric), RR, i, 'target', r.target);
  }
  s = authorize(s, RR);
  const ticket = (o) => `TK-2${seed.systems.orders[o].customerId.slice(3)}`;
  for (const o of ['ORD-5001', 'ORD-5002', 'ORD-5004']) s = callTool(s, RR, { tool: 'issue_refund', args: { orderId: o, amount: 10, confidence: 95, instructionSource: 'customer' }, ticketId: ticket(o) }).state;
  // Three production actions are not enough to judge (Paige, 2026-10-12: 20 by default).
  const early = value(s);
  assert.deepEqual(verdicts(early), [['neutral', 'Too early to judge']]);
  assert.match(text(early), /Goals are judged once enough production cases are recorded: 3 of 20 production cases recorded\./);
  assert.match(early, /show=value"[^>]*>Delivering value\? <span class="chip-count">2<\/span>/, 'a goal not yet judged is not counted as missed');
  // Up to 20 production cases: 12 done automatically, 8 sent to a person.
  for (let i = 0; i < 9; i++) s = logGate(s, { capabilityId: RR, tool: 'issue_refund', verdict: 'allow', orderId: 'ORD-5001' });
  for (let i = 0; i < 8; i++) s = logGate(s, { capabilityId: RR, tool: 'issue_refund', verdict: 'needs-person', orderId: 'ORD-5005' });
  const html = value(s);
  assert.deepEqual(verdicts(html), [['watch', '1 of 2 rollout goals on track']]);
  assert.match(text(html), /Not on track yet: Escalation rate\./);
  assert.match(text(html), /\(Logged actions: This session\)/);
  assert.match(html, /show=value"[^>]*>Delivering value\? <span class="chip-count">3<\/span>/, 'one goal missed plus two adoption warnings');
});

test('Delivering value? with nothing to compare says so neutrally, in one sentence', () => {
  const seeded = value(initialState());
  assert.deepEqual(verdicts(seeded), [['neutral', 'No rollout goals to compare']], 'the decision in force predates rollout goals');
  const none = value(initialState(), AC);
  assert.deepEqual(verdicts(none), []);
  assert.match(text(none), /Nothing to judge yet\. Rollout goals appear here once Account closure's autonomy is expanded with an expected impact\./);
  assert.doesNotMatch(none, /mh-line/);
});

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

const timeline = (html) => [...html.matchAll(/<li class="hist-item[^"]*" data-kind="([a-z-]+)">\s*<div class="hist-when">([^<]+)<\/div>\s*<div class="hist-title">(?:<strong>)?([^<]+)/g)].map((m) => ({ kind: m[1], when: m[2], title: m[3].replace(/&gt;/g, '>').trim() }));
const MONTHS = { Aug: 8, Sep: 9, Oct: 10 };
const day = (w) => { const [m, d] = w.split(' '); return MONTHS[m] * 100 + Number(d); };

test('History: one timeline, newest first, of what happened to Refund recommendation', () => {
  const html = history(initialState());
  const items = timeline(html);
  assert.ok(items.length >= 8);
  for (let i = 1; i < items.length; i++) assert.ok(day(items[i - 1].when) >= day(items[i].when), `newest first: ${items[i - 1].when} before ${items[i].when}`);
  const titles = items.map((x) => x.title);
  assert.ok(titles.includes('Authority change #02: Recommend → Draft'));
  assert.ok(titles.includes('Test run: 24 of 26 passed'));
  assert.ok(titles.includes('Incident: fraud escalation missed'), 'incidents read without their id');
  assert.ok(titles.includes('Software gate added for fraud-flagged accounts'));
  assert.ok(titles.includes('Rules v1, Targets v1, Decision requirements v1, Risk profile v1 and Stakeholders v1 set by Maya Chen'), 'versions set together read as one line');
  assert.equal(items.at(-1).kind, 'version', 'the first versions came first');
  assert.match(text(html), /Expand, authorized by Maya Chen/);
  assert.match(html, /href="#\/records\/AC-02">Decision record<\/a> · <a href="#\/records\/AC-02\/brief">One-page brief<\/a>/);
  // Other capabilities' events stay out.
  assert.doesNotMatch(html, /Authority change #01|Authority change #03/);
  // Under the timeline: Versions, Proposed changes, and all activity.
  assert.deepEqual(lineTitles(html), ['Versions', 'Proposed changes']);
  assert.match(html, /<span class="mh-line-meta">Rules v1 · Targets v1 · Decision requirements v1 · Risk profile v1 · Stakeholders v1<\/span>/);
  for (const k of ['contract', 'criteria', 'requirements', 'stakeholders', 'risk']) assert.match(html, new RegExp(`versions\\?kind=${k}"`), k);
  assert.match(html, /<span class="mh-line-meta">none<\/span>/);
  assert.match(html, /<a href="#\/records\?show=activity&capability=refund-recommendation">All activity for Refund recommendation →<\/a>/);
  assert.ok(html.indexOf('hist-timeline') < html.indexOf('mh-lines'), 'the timeline leads');
});

test('History after authorize and a breach: the restriction, the incident it opened and the expansion, in order; then the review', () => {
  const titles = (s) => timeline(history(s)).map((x) => x.title);
  const a = titles(expanded());
  assert.equal(a[0], 'Authority change #04: Draft → Act Within Limits');
  const b = titles(breached());
  assert.deepEqual(b.slice(0, 3), ['Authority change #05: Act Within Limits → Draft', 'Incident: safety limit crossed', 'Authority change #04: Draft → Act Within Limits']);
  const html = history(breached());
  assert.match(text(html), /Automatic restriction after a safety limit was crossed: Severe error rate above 5%/);
  assert.match(text(html), /No one approved it at the time; the limit was agreed in advance\./);
  const reviewed = titles(recordReview(breached(), RR, { by: 'daniel', ...REVIEW }));
  assert.equal(reviewed[0], 'Post-incident review by Daniel Okafor');
});

test('History: an approved proposed change names the versions it made, and they aren\'t listed twice', () => {
  const loosened = current(initialState(), RR, 'requirements').map((r) => (r.id === 'high-value' ? { ...r, text: 'Minimum 15 high-value refund cases' } : r));
  let s = proposeAmendment(initialState(), RR, 'criteria', { value: { criteria: current(initialState(), RR, 'criteria'), requirements: loosened }, by: 'priya', reason: 'Volume is too low to reach 40 this quarter; 15 is what the pilot can produce.' });
  const open = history(s);
  assert.match(open, /<span class="mh-line-meta">1 in total, 1 waiting for approval<\/span>/);
  assert.match(open, /proposals\/P-1/);
  s = approveProposal(approveProposal(s, RR, 'P-1', { by: 'maya' }), RR, 'P-1', { by: 'daniel' });
  assert.equal(versionsInForce(s, RR).criteria, 2);
  const titles = timeline(history(s)).map((x) => x.title);
  assert.equal(titles[0], 'Proposed change to the targets approved: now Targets v2, Decision requirements v2');
  assert.ok(!titles.some((t) => /^Targets v2/.test(t)), 'not repeated as a separate version line');
  assert.match(history(s), /Targets v2 · Decision requirements v2/);
});

test('the minimum production sample: 20 by default, a goal can name its own, and only real actions count', async () => {
  const { MIN_PRODUCTION_CASES, goalSample, productionCases, expectedVsActual } = await import('../src/store/value.js');
  const { importantResults } = await import('../src/store/overview.js');
  assert.equal(MIN_PRODUCTION_CASES, 20);
  assert.equal(goalSample({ metric: 'Override rate', target: '≤ 8%' }), 20);
  assert.equal(goalSample({ metric: 'Override rate', target: '≤ 8% across at least 50 refunds' }), 50, 'a goal\'s own sample wins');
  assert.equal(goalSample({ metric: 'Resolution time over 1,200 cases', target: 'at least 50% faster' }), 1200);
  // Seeded and scripted dry-run actions never count as production.
  let s = expanded();
  assert.equal(productionCases(s, RR), 0, 'seeded gate events are demo data');
  s = logGate(s, { capabilityId: RR, tool: 'issue_refund', verdict: 'allow', source: 'mock' });
  s = logGate(s, { capabilityId: RR, tool: 'lookup_order', verdict: 'allow' });
  assert.equal(productionCases(s, RR), 0, 'a dry run and a read are not production cases');
  s = logGate(s, { capabilityId: RR, tool: 'issue_refund', verdict: 'allow', source: 'recorded' });
  s = logGate(s, { capabilityId: RR, tool: 'issue_refund', verdict: 'block' });
  assert.equal(productionCases(s, RR), 2);
  // Right after expanding, every goal is still on pilot numbers: none is judged,
  // so the Overview doesn't call any of them missed.
  const rows = expectedVsActual(expanded(), RR).rows;
  assert.ok(rows.length && rows.every((r) => r.judged === false));
  assert.ok(rows.some((r) => r.status === 'not-met'), 'the raw comparison is still there');
  assert.ok(!importantResults(expanded()).some((r) => r.label === 'Expected outcome missed'));
});
