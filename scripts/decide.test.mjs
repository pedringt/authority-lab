// The Decide tab (redesign, 2026-10-12): one vertical flow answering "Should
// we change what this capability is allowed to do?", with one action at the
// end. These tests render the real views from the real seed and store.

import { test } from 'node:test';
import { decideWith } from './helpers.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initialState, selectDecision, setRationale, setActingAs, canAuthorize, authorize, simulateBreach,
  capData, proposeAuthority, people,
} from '../src/store/index.js';
import { setPeople, fmtDate } from '../src/ui.js';
import { capabilityView } from '../src/views/capability.js';
import { decisionWorkspaceView } from '../src/views/decisions.js';

const RR = 'refund-recommendation';
const TC = 'ticket-classification';
const HV = 'refund-execution-high-value';
const decide = (s, id = RR, q = '', opts = {}) => String(capabilityView(s, id, new URLSearchParams(`tab=decide${q}`), opts));
const steps = (page) => [...page.matchAll(/<p class="decide-step-n">Step (\d+)<\/p><h2>([^<]+)<\/h2>/g)].map((m) => `${m[1]} ${m[2]}`);
const lines = (page) => Object.fromEntries([...page.matchAll(/<details class="decide-line"><summary><strong>([^<]+)<\/strong><span class="decide-line-meta">([^<]*)<\/span>/g)].map((m) => [m[1], m[2]]));
const withCapData = (s, id, patch) => ({ ...s, capabilityData: { ...s.capabilityData, [id]: { ...capData(s, id), ...patch } } });
const withAuthority = (s, id, authority) => ({ ...s, capabilities: s.capabilities.map((c) => (c.id === id ? { ...c, authority } : c)) });
const count = (page, re) => (page.match(re) || []).length;

test('Decide: an open decision is one column, its steps in order, with one record button at the end', () => {
  const s = initialState();
  setPeople(people(s));
  const page = decide(s);
  assert.match(page, /<div class="decide-flow">/);
  assert.doesNotMatch(page, /decision-grid|decision-side|decision-main|decision-panel/, 'no two-column workspace');
  assert.doesNotMatch(page, /class="subnav"/, 'no chip row of evidence views');
  assert.match(page, /<h2>Should we expand autonomy for this capability\?<\/h2><p class="muted">A named person makes the call, and the decision is recorded\. Evidence never grants authority on its own\.<\/p>/);
  // Nothing chosen yet: the steps that depend on the choice aren't there.
  assert.deepEqual(steps(page), ['1 What changes if I approve this?', '2 What do we know?', '3 Who has said what?', '4 Risk', '5 Recommendation', '6 Your decision', '7 Why are you making this decision?', '8 Review and record']);
  assert.equal(count(page, /data-action="authorize"/g), 1, 'one action');
  assert.match(page, /<button class="btn btn-primary decide-record" data-action="authorize" data-capability="refund-recommendation" disabled>Record decision as Maya Chen<\/button>/);
  assert.ok(page.lastIndexOf('data-action="authorize"') > page.indexOf('<h2>Your decision</h2>'), 'the button comes last');
  // The button names whoever is deciding.
  assert.match(decide(setActingAs(s, 'priya')), />Record decision as Priya Natarajan<\/button>/);
});

test('Decide step 1: now and proposed, behaviour first and the level second', () => {
  const page = decide(initialState());
  const now = page.indexOf('<span class="muted small">Now</span>');
  const proposed = page.indexOf('<span class="muted small">Proposed</span>');
  assert.ok(now > 0 && proposed > now);
  assert.match(page, /Now<\/span><strong>Prepares the action\. A person approves every one\.<\/strong><span class="muted small">Level 2 · Draft<\/span>/);
  assert.match(page, /Proposed<\/span><strong>Runs automatically within limits\. Everything else goes to human review\.<\/strong><span class="muted small">Level 3 · Act Within Limits<\/span>/);
});

test('Decide step 2: one headline, the top gap, a serious failure, and one line per kind of evidence', () => {
  const s = initialState();
  const page = decide(s);
  assert.match(page, /<p class="decide-big">Ready: all 5 hard Requirements met · 1 consideration not met<\/p>/);
  assert.match(page, /<p>Still open: minimum 40 high-value refund cases \(now 18\)\.<\/p>/);
  assert.match(page, /<p class="decide-serious">Serious test failure: Fraud flag present\.<\/p>/);
  assert.deepEqual(lines(page), {
    Requirements: '5 of 6 met · 2 targets not met yet',
    Tests: '24 of 26 passed',
    // #126: the example connected sources and Daniel's review, with the weak high-value slice.
    'Evidence from sources': '4 sources: Support platform, Ticketing, Eval harness, Manual review · 1 weak',
    'Pilot results': '218 cases, 94% accurate',
    'Model runs': 'recorded, checked against the rules',
    'Stakeholder positions': 'not unanimous',
  });
  // Checks hold requirements and targets together, and say the bar was set first.
  assert.match(page, /What needs to be true first\./);
  assert.match(page, /Minimum 40 high-value refund cases/);
  assert.match(page, /<td>Speed<\/td><td>50% faster average resolution<\/td><td>42% faster<\/td><td>Not met yet<\/td>/);
  assert.match(page, /Set before the pilot started, so the bar didn't move after the results came in\./);
  // Pilot segments, with the weak one marked.
  assert.match(page, /<span class="decide-weak">High-value refunds \(&gt; \$100\): 83% \(18 cases\)<\/span>/);
  // Each line links to its full view; All evidence too.
  for (const v of ['requirements', 'targets', 'tests', 'results', 'runs', 'all']) assert.match(page, new RegExp(`href="#/capabilities/refund-recommendation\\?tab=decide&show=${v}"`), v);
  assert.match(page, />All evidence →<\/a>/);
  // Positions are listed as given.
  assert.match(page, /<strong>Risk:<\/strong> Hold high-value cases <span class="muted small">\(Daniel Okafor\)<\/span>/);
  // Once the recorded model runs have loaded, the line counts them.
  const index = JSON.parse(readFileSync(new URL('../src/data/agent-runs/index.json', import.meta.url), 'utf8'));
  const runs = index.runs.map((e) => ({ ...JSON.parse(readFileSync(new URL(`../src/data/agent-runs/${e.file}`, import.meta.url), 'utf8')), file: e.file, proof: e.proof || null }));
  const loaded = lines(decide(s, RR, '', { runs: { status: 'ready', runs } }));
  assert.match(loaded['Model runs'], /^\d+ runs, (nothing got through|\d+ got through)$/);
  // A capability with no recorded runs has no Model runs line.
  assert.equal(lines(decide(s, TC))['Model runs'], undefined);
});

test('Decide: the full evidence views open through show=, each with a way back and no chip row', () => {
  const s = initialState();
  const expect = { results: /What the AI tried/, all: /evidence-grid|No evidence matches/, requirements: /Minimum 40 high-value refund cases/, targets: /<th>Measure<\/th>/, tests: /data-action="run-tests"/, runs: /Loading model runs/ };
  for (const [show, re] of Object.entries(expect)) {
    const page = decide(s, RR, `&show=${show}`, { runs: { status: 'loading', runs: [] } });
    assert.match(page, /<p class="decide-back"><a href="#\/capabilities\/refund-recommendation\?tab=decide">← Back to the decision<\/a><\/p>/, show);
    assert.match(page, re, show);
    assert.doesNotMatch(page, /class="subnav"|data-action="authorize"/, show);
  }
  // An unknown view is the decision itself.
  assert.match(decide(s, RR, '&show=nonsense'), /<h2>Your decision<\/h2>/);
});

test('Decide step 3: the recommendation in plain words, worked out from the evidence', () => {
  const page = decide(initialState());
  assert.match(page, /<p><strong>Recommended: expand autonomy within limits\.<\/strong><\/p>\s*<p>Allow standard refunds up to \$50 to run automatically\. Keep high-value refunds under human review\.<\/p>\s*<p class="muted small">Worked out from the evidence\. You decide\.<\/p>/);
  // A capability without a recommendation skips the step.
  let s = withCapData(initialState(), RR, { recommendation: null });
  assert.doesNotMatch(decide(s), /<h2>Recommendation<\/h2>/);
  assert.equal(steps(decide(s))[4], '5 Your decision');
});

test('Decide step 4: four choices, a second question for Expand and Reduce, nothing chosen for the person', () => {
  const page = decide(initialState());
  const choices = [...page.matchAll(/<label class="decide-choice-main"><input type="radio" class="decide-family" name="decide-family" value="([^"]+)" data-family="([^"]+)"/g)].map((m) => [m[2], m[1]]);
  assert.deepEqual(choices, [['expand', 'expand'], ['hold', 'hold'], ['reduce', 'reduce'], ['redesign', 'redesign']]);
  assert.match(page, /<strong>Expand autonomy<\/strong>/);
  assert.match(page, /<strong>Keep current limits<\/strong>/);
  assert.match(page, /<strong>Reduce autonomy<\/strong>/);
  assert.match(page, /<strong>Send back for redesign<\/strong>/);
  // Expand asks within limits or broad; Reduce asks how far. Each final choice
  // names the recorded option, and dispatches the existing select-option.
  const leaves = [...page.matchAll(/<label class="decide-leaf"><input type="radio" name="decision-option" value="([^"]+)" data-action="select-option" data-capability="refund-recommendation" ><span>([^<]+)<\/span><span class="decide-maps">recorded as “([^”]+)”<\/span>/g)].map((m) => [m[2], m[1], m[3]]);
  assert.deepEqual(leaves, [['Within limits', 'expand-limits', 'Expand with limits'], ['Broad autonomy', 'expand', 'Expand'], ['One level down, to Recommend', 'restrict', 'Restrict'], ['Pause: all the way back to Observe', 'suspend', 'Suspend']]);
  assert.match(page, /value="hold" data-family="hold" data-action="select-option" data-capability="refund-recommendation"/);
  assert.match(page, /value="redesign" data-family="redesign" data-action="select-option" data-capability="refund-recommendation"/);
  assert.match(page, /recorded as “Hold”/);
  assert.match(page, /recorded as “Redesign”/);
  // Nothing is checked until the person picks.
  assert.doesNotMatch(page, /<input[^>]*\schecked/);
  assert.match(page, /Choose one: within limits, or broad autonomy\./);
  // The parent Expand and Reduce radios change nothing on their own: no
  // select-option, so no option is stored until the second choice.
  assert.match(page, /value="expand" data-family="expand"\s+><span>/);
  assert.match(page, /value="reduce" data-family="reduce"\s+><span>/);
  // Picking Within limits checks both levels and marks the stored family.
  const chosen = decide(decideWith(initialState(), RR, 'expand-limits'));
  assert.match(chosen, /value="expand" data-family="expand"\s+checked data-stored\s*>/);
  assert.match(chosen, /value="expand-limits" data-action="select-option" data-capability="refund-recommendation" checked>/);
  assert.equal(count(chosen, /data-stored/g), 1);
  // The page hides what depends on the option while a parent choice isn't finished.
  const css = readFileSync(new URL('../styles/redesign.css', import.meta.url), 'utf8');
  assert.match(css, /\.decide-flow:has\(\.decide-family:checked:not\(\[data-stored\]\)\) \.decide-after,/);
  assert.match(css, /\.decide-choice:has\(\.decide-family:checked\) \.decide-sub \{ display: flex; \}/);
});

test('Decide: each final choice maps to the option the store records', () => {
  const page = decide(initialState());
  const values = [...page.matchAll(/value="([^"]+)"[^>]*data-action="select-option"/g)].map((m) => m[1]);
  assert.deepEqual(values.sort(), ['expand', 'expand-limits', 'hold', 'redesign', 'restrict', 'suspend']);
  for (const option of values) {
    const s = decideWith(initialState(), RR, option);
    assert.equal(canAuthorize(s, RR).ok, true, option);
    assert.equal(authorize(s, RR).decisionRecords.at(-1).option, option, option);
  }
});

test('Decide: Residual Risk, limits, goals and the rollout plan appear only when they apply', () => {
  const at = (option) => steps(decide(decideWith(initialState(), RR, option))).map((x) => x.replace(/^\d+ /, ''));
  const base = ['What changes if I approve this?', 'What do we know?', 'Who has said what?', 'Risk', 'Recommendation', 'Your decision'];
  const end = ['Why are you making this decision?', 'Review and record'];
  // Phase 6A: Residual Risk is asked once the person chooses to expand.
  assert.deepEqual(at('expand-limits'), [...base, 'Residual Risk', 'Limits', 'What should improve?', 'Rollout plan', ...end]);
  assert.deepEqual(at('expand'), [...base, 'Residual Risk', 'What should improve?', 'Rollout plan', ...end]);
  for (const option of ['hold', 'restrict', 'suspend', 'redesign']) assert.deepEqual(at(option), [...base, ...end], option);
  const limits = decide(decideWith(initialState(), RR, 'expand-limits'));
  assert.match(limits, /data-action="set-condition" data-capability="refund-recommendation" data-key="maxValue"/);
  assert.match(limits, /2–4 measurable goals, compared with real results after rollout\./);
  assert.match(limits, /data-action="set-outcome"/);
  assert.match(limits, /data-action="set-rollout"/);
  assert.match(limits, /data-action="set-rationale"/);
  // What the choice would mean, from the store's own preview.
  assert.match(limits, /What this would mean:<\/strong> The AI would approve standard refunds of \$50 or less/);
  assert.match(decide(decideWith(initialState(), RR, 'hold')), /What this would mean:<\/strong> No change\. The AI stays at Draft while more evidence comes in\./);
});

test('Decide: the review step lists what is done and names what blocks recording', () => {
  const ready = decide(decideWith(initialState(), RR, 'hold'));
  assert.match(ready, /<li class="check-item is-done"><span class="check-mark" aria-hidden="true">✓<\/span> <strong>Decision: Keep current limits<\/strong><\/li>/);
  assert.match(ready, /Recorded as “Hold”, with your name \(Maya Chen, Support Product Lead\), your reason and this evidence\./);
  assert.doesNotMatch(ready, /data-action="authorize"[^>]*disabled/);
  const noWhy = decide(setRationale(decideWith(initialState(), RR, 'hold'), RR, 'short'));
  assert.match(noWhy, /is-blocked"><span class="check-mark" aria-hidden="true">✗<\/span> <strong>Your reason<\/strong><span class="muted small">: Say why/);
  assert.match(noWhy, /data-action="authorize"[^>]*disabled/);
  assert.equal(canAuthorize(setRationale(decideWith(initialState(), RR, 'hold'), RR, 'short'), RR).ok, false, 'the store agrees');
});

test('Decide: a choice that isn\'t open says why, right where it is', () => {
  // A proposal that no longer matches the level: Expand can't be chosen.
  let s = initialState();
  s = withCapData(s, RR, { decision: { ...capData(s, RR).decision, proposed: { level: 4, limited: false } } });
  const stale = decide(s);
  assert.match(stale, /value="expand" data-family="expand"\s+disabled>/);
  assert.match(stale, /Not available: this decision was opened for Level 4, but Refund recommendation is now at Level 2\. Expanding goes one level at a time, so Level 3 has to be proposed instead\./);
  // At Observe there is nothing lower; a move to Recommend has no limits to choose.
  let low = withAuthority(initialState(), RR, { level: 0, limited: false });
  low = withCapData(low, RR, { decision: { ...capData(low, RR).decision, proposed: { level: 1, limited: false } } });
  const page = decide(low);
  assert.match(page, /Not available: it is already at Observe, the lowest level\./);
  assert.match(page, /value="expand" data-family="expand" data-action="select-option"/, 'Expand is one choice when there are no limits to set');
  assert.doesNotMatch(page, /Within limits/);
});

test('Decide after recording: what was decided, who and when, what now runs automatically, and Next to Monitor', () => {
  const s0 = decideWith(initialState(), RR, 'expand-limits');
  const s = authorize(s0, RR);
  const rec = s.decisionRecords.at(-1);
  const page = decide(s);
  assert.match(page, /<p class="decide-big">Decision recorded: Expand autonomy, within limits<\/p>/);
  assert.match(page, new RegExp(`<p class="muted">Maya Chen · ${fmtDate(rec.date)}</p>`));
  assert.match(page, /Standard refunds up to \$50 now run automatically, capped at \$500 and 20 refunds a day\. Everything else, including larger, fraud-flagged, chargeback and unclear-policy cases, still needs human review\./);
  assert.match(page, /<a href="#\/capabilities\/refund-recommendation\?tab=monitor">Next: monitor the rollout →<\/a>/);
  assert.match(page, new RegExp(`<a href="#/records/${rec.id}">See the decision record</a>`));
  assert.doesNotMatch(page, /data-action="(authorize|select-option)"/, 'no form once recorded');
  // A hold says nothing changed.
  const held = decide(authorize(decideWith(initialState(), RR, 'hold'), RR));
  assert.match(held, /Decision recorded: Keep current limits/);
  assert.match(held, /No change\. Nothing runs automatically\. Refunds are drafted, and a person approves every one before anything happens\./);
});

test('Decide with no decision open: what has to happen first, the evidence, and no form', () => {
  const s = initialState();
  const tc = decide(s, TC);
  // Level 4 is offered now (#149), but its seeded results aren't real use.
  assert.match(tc, /<h2>No decision is open<\/h2><p>Level 4, Broad Delegation, needs at least 20 cases from real use/);
  assert.match(tc, /<h2>What do we know\?<\/h2>/);
  assert.match(tc, /<p class="decide-big">Ready: all 5 Requirements met<\/p>/);
  assert.doesNotMatch(tc, /data-action="(authorize|select-option|propose-authority)"/);
  assert.match(decide(s, 'account-closure'), /kept with people by design, so there is nothing to decide/);
  // Once the tests have run, the first move can be proposed, and proposing opens the flow.
  const tested = withCapData(s, HV, { testRun: { ...capData(s, HV).testRun, lastRun: s.today } });
  const ready = decide(tested, HV);
  assert.match(ready, /<h2>Ready to propose Level 2, Draft<\/h2>/);
  assert.match(ready, /data-action="propose-authority" data-capability="refund-execution-high-value" data-level="2">Propose a move to Level 2<\/button>/);
  const opened = decide(proposeAuthority(tested, HV, 2, { by: 'maya' }), HV);
  assert.match(opened, /<h2>Your decision<\/h2>/);
  assert.match(opened, /Proposed<\/span><strong>Prepares the action\. A person approves every one\.<\/strong>/);
});

test('Decide after an automatic restriction says once that a review comes first, and links to Monitor', () => {
  const s = simulateBreach(authorize(decideWith(initialState(), RR, 'expand-limits'), RR), RR);
  const page = decide(s);
  assert.match(page, /<strong>A review comes first<\/strong>/);
  assert.equal(count(page, /after crossing a safety limit/g), 1);
  assert.match(page, /href="#\/capabilities\/refund-recommendation\?tab=monitor">Record the review<\/a>/);
  assert.doesNotMatch(page, /Decision recorded|data-action="(authorize|propose-authority)"/);
});

test('Decide: authorizing through the store writes the same record as before the redesign', () => {
  const s = authorize(decideWith(initialState(), RR, 'expand-limits'), RR, { by: 'maya' });
  const rec = s.decisionRecords.at(-1);
  assert.equal(rec.option, 'expand-limits');
  assert.deepEqual(rec.previous, { level: 2, limited: false });
  assert.deepEqual(rec.next, { level: 3, limited: true });
  assert.equal(rec.authorizedBy, 'maya');
  assert.equal(rec.conditions.maxValue, 50);
  assert.equal(rec.expectedOutcomes.length, 3);
  assert.equal(rec.rolloutPlan.owner, 'priya');
  assert.match(rec.scope, /^The AI handles refunds of \$50 or less on its own/);
  assert.equal(capData(s, RR).decision.recordId, rec.id);
  assert.equal(capData(s, RR).decision.proposed, null);
  // The decision view's old name renders the same tab body.
  assert.equal(String(decisionWorkspaceView(s, RR)), String(decisionWorkspaceView(s, RR, new URLSearchParams())));
});

test('Decide routing: #/capabilities/<id>/decision renders the Decide tab, and recording lands on it', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const route = main.slice(main.indexOf("action === 'decision'"), main.indexOf("action === 'versions'"));
  assert.match(route, /q\.set\('tab', 'decide'\)/);
  assert.match(route, /capabilityView\(state, sub, q/);
  assert.match(route, /title = 'Decision'/);
  const handler = main.slice(main.indexOf("if (action === 'authorize')"), main.indexOf('const builder = '));
  assert.match(handler, /location\.hash = `#\/capabilities\/\$\{capId\}\?tab=decide`/);
});
