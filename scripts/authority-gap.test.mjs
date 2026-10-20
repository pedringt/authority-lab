// Remediation 1 (#149): declared vs actual behavior (D1, R1-B, R2-A), real
// workspaces beyond Draft (D2), written vs enforced Boundaries (D7), and the
// display fixes that came with them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initialState, startEmpty, setUpWorkspace, addPerson, addCapability, getCapability, capData, buildWorkspace, importEvidence,
  saveCriteria, saveStakeholders, mapEvidence, rowMetric, MANUAL_SOURCE, recordResult, recordJudgment,
  proposeAuthority, selectDecision, setRationale, setOutcome, setRolloutField, setResidualRisk, canAuthorize, authorize, people,
  justification, authorityGap, requirementsNow, overviewTodos, gapBlocks, recordBaseline, readyToPropose, retireCapability, authorityRows, actsThroughGate,
} from '../src/store/index.js';
import { stateWorkspace } from '../src/data/workspaces/state.js';
import { setPeople, setToday } from '../src/ui.js';
import { capabilityView } from '../src/views/capability.js';
import { capabilitiesView } from '../src/views/capabilities.js';
import { overviewView } from '../src/views/overview.js';

const ANA = 'ana-ruiz';
const BEN = 'ben-okoro';
const PAIGE = 'paige-edrington';
const ID = 'interpret-incoming-project-evidence';
const strip = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
const RUN = JSON.parse(readFileSync(new URL('../src/data/external-evidence/state-eval-review-gh-38411808397-1.json', import.meta.url), 'utf8'));

function stateWs() {
  const s = buildWorkspace(stateWorkspace, { today: '2026-10-20' });
  setPeople(people(s)); setToday(s.today);
  return s;
}
const page = (s, id, tab) => strip(capabilityView(s, id, new URLSearchParams(`tab=${tab}`)));

// A small firm, decided to Draft on hand-recorded evidence (as in #147).
function firmAtDraft() {
  let s = setUpWorkspace(startEmpty(), { workspace: { name: 'Ruiz Tax' }, workflow: { name: 'Client email' }, founder: { name: 'Ana Ruiz', title: 'Partner' } });
  s = addPerson(s, { name: 'Ben Okoro', title: 'Tax lead', team: 'Tax', by: ANA, reason: 'Reviews the drafts.' });
  s = addCapability(s, { name: 'Draft deadline emails', summary: 'Drafts emails reminding clients of tax deadlines.', owner: ANA, risk: { impact: 'Medium', reversibility: 'Easy to reverse', exposure: 'Customer-facing' }, today: 'recommends', by: ANA });
  const id = s.capabilities.at(-1).id;
  s = saveStakeholders(s, id, { stakeholders: [{ person: BEN, team: 'Tax', role: 'reviewer', stance: 'expand', position: 'Ready.' }], by: ANA });
  s = saveCriteria(s, id, { criteria: [], requirements: [{ id: 'min-cases', text: 'Minimum 20 cases', kind: 'coverage' }, { id: 'accuracy', text: 'Overall accuracy ≥ 90%', judgment: 'evidence' }, { id: 'templates', text: 'The tax lead has approved the templates', judgment: 'person' }], by: ANA, reason: 'Our own bar, written by us.' });
  s = mapEvidence(s, id, { rowKind: 'requirement', rowId: 'min-cases', measure: { source: MANUAL_SOURCE, metric: rowMetric('requirement', 'accuracy'), stat: 'sample' }, by: ANA });
  s = mapEvidence(s, id, { rowKind: 'requirement', rowId: 'accuracy', measure: { source: MANUAL_SOURCE, metric: rowMetric('requirement', 'accuracy'), stat: 'rate' }, by: ANA });
  s = recordResult(s, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 19, total: 20, kind: 'eval', by: BEN });
  s = recordJudgment(s, id, 'templates', { verdict: 'met', rationale: 'Approved on Oct 14.', by: BEN });
  s = proposeAuthority(s, id, 2, { by: ANA });
  return [decideAll(s, id, 'expand'), id];
}
function decideAll(s, id, option, by = ANA) {
  s = selectDecision(s, id, option);
  if (option === 'expand' || option === 'expand-limits') {
    s = setOutcome(setOutcome(s, id, 0, 'metric', 'Time to send reminders'), id, 0, 'target', 'at least 30% faster');
    s = setOutcome(setOutcome(s, id, 1, 'metric', 'Emails corrected'), id, 1, 'target', 'at most 10%');
    for (const [k, v] of Object.entries({ owner: by, scope: 'Every deadline email.', startDate: s.today, feedbackChannel: 'Office inbox', reviewerNotes: 'Read every one before it goes; nothing is sent without approval.', reviewDate: '2026-12-01' })) s = setRolloutField(s, id, k, v);
    s = setResidualRisk(s, id, { level: 'Moderate', note: 'Contained by review.' });
  }
  return authorize(setRationale(s, id, 'The evidence supports it and the risk is contained.'), id, { by });
}

test('State is approved for Recommend but observed at Draft: "Operating above approved Authority"', () => {
  const s = stateWs();
  const g = authorityGap(s, ID);
  assert.deepEqual([g.approved.level, g.observed.level, g.above], [1, 2, true]);
  const j = justification(s, ID);
  assert.equal(j.key, 'above');
  assert.equal(j.label, 'Operating above approved Authority');
  assert.equal(getCapability(s, ID).authority.level, 1, 'nothing changed on its own');
});

test('Monitor: the gap, both levels, the block, and the two ways to resolve it', () => {
  const m = page(stateWs(), ID, 'monitor');
  assert.match(m, /Operating above approved Authority Observed behavior: Level 2, Draft\. Approved Authority: Level 1, Recommend\. Further expansion is blocked until this is resolved\./);
  assert.match(m, /Resolve the gap Bring its behavior back within approved Authority\..*Or govern the observed behavior\..*one level at a time/);
  assert.match(m, /Reducing, pausing or retiring it is never blocked\./);
  assert.match(m, /Record what it does now/);
});

test('Status, Decide, Overview and Capabilities all show the gap', () => {
  const s = importEvidence(stateWs(), RUN);
  assert.match(page(s, ID, 'status'), /Operating above approved Authority.*Approved: Level 1, Recommend · Observed: Level 2, Draft\./);
  const d = page(s, ID, 'decide');
  assert.match(d, /Operating above approved Authority Observed behavior: Level 2, Draft\. Approved Authority: Level 1, Recommend\./);
  assert.match(d, /Propose Level 2: govern the observed behavior/);
  const row = authorityRows(s).find((r) => r.capabilityId === ID);
  assert.equal(row.level, 'Recommend · observed Draft');
  assert.deepEqual(row.next.badge, ['restricted', 'Above approved Authority']);
  assert.match(strip(overviewView(s)), /Recommend · observed Draft Above approved Authority/);
  assert.match(strip(capabilitiesView(s)), /Recommend · observed Draft · Above approved Authority/);
});

test('R2-A: governing the observed behavior is a normal Proposal, one level at a time; catching up clears the gap', () => {
  let s = importEvidence(stateWs(), RUN);
  assert.equal(readyToPropose(s, ID), true, 'Level 2 governs what it already does');
  assert.equal(gapBlocks(s, ID, 2), null);
  assert.match(gapBlocks(s, ID, 3), /Operating above approved Authority: it is approved for Level 1, Recommend, but observed at Level 2, Draft\. Further expansion is blocked/);
  s = proposeAuthority(s, ID, 2, { by: PAIGE });
  s = decideAll(s, ID, 'expand', PAIGE);
  assert.equal(getCapability(s, ID).authority.level, 2, 'declared caught up with observed');
  assert.equal(authorityGap(s, ID).above, false);
  assert.notEqual(justification(s, ID).key, 'above');
});

test('R2-A: recording behavior back within approved Authority clears the gap; Unknown is not a gap', () => {
  let s = stateWs();
  s = recordBaseline(s, ID, { effective: { level: 1, note: 'Proposals now only suggest; a person writes each change.' }, by: PAIGE, reason: 'We changed how State runs.' });
  assert.equal(authorityGap(s, ID).above, false);
  assert.notEqual(justification(s, ID).key, 'above');
  const u = recordBaseline(stateWs(), ID, { effective: { status: 'unknown', note: 'We are not sure what it does now.' }, by: PAIGE, reason: 'Checking.' });
  assert.equal(authorityGap(u, ID).above, false);
  assert.equal(authorityGap(u, ID).unknown, true);
});

test('R1-B: reducing, pausing and retiring are never blocked by the gap', () => {
  const s = stateWs();
  for (const option of ['restrict', 'suspend']) {
    const r = setRationale(selectDecision(s, ID, option), ID, 'Bring it back while we look at what it does.');
    assert.deepEqual(canAuthorize(r, ID, { by: PAIGE }), { ok: true }, option);
  }
  const retired = retireCapability(s, ID, { by: PAIGE, reason: 'We no longer use it.' });
  assert.equal(getCapability(retired, ID).status, 'retired');
});

test('the gap blocks expansion past the observed level at authorization too', () => {
  const s = stateWs();
  assert.equal(gapBlocks(s, ID, 1), null);
  assert.equal(gapBlocks(s, ID, 2), null);
  assert.ok(gapBlocks(s, ID, 3));
  assert.ok(gapBlocks(s, ID, 4));
  // A capability with no observed behavior recorded has no gap.
  assert.equal(authorityGap(initialState(), 'refund-recommendation').above, false);
});

test('D2: a real workspace can propose beyond Draft, one level at a time; Level 3 needs real use', () => {
  let [s, id] = firmAtDraft();
  assert.equal(getCapability(s, id).authority.level, 2);
  assert.equal(readyToPropose(s, id), false, 'eval results alone are not real use');
  setPeople(people(s)); setToday(s.today);
  assert.match(page({ ...s, actingAs: ANA }, id, 'decide'), /Level 3, Act Within Limits, needs at least 20 cases from real use/);
  s = recordResult(s, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 48, total: 50, kind: 'production', by: BEN });
  assert.equal(readyToPropose(s, id), true);
  assert.match(page({ ...s, actingAs: ANA }, id, 'decide'), /When the evidence supports more, it starts with a new Proposal\. Propose a move to Level 3/);
  assert.deepEqual(authorityRows(s).find((r) => r.capabilityId === id).next.badge, ['decision', 'Ready to propose']);
  s = proposeAuthority(s, id, 3, { by: ANA });
  s = decideAll(s, id, 'expand-limits');
  assert.equal(getCapability(s, id).authority.level, 3);
  // D7: outside the gate, no structured refund limits are invented.
  assert.equal(actsThroughGate(id), false);
  assert.equal(s.decisionRecords.at(-1).conditions, null);
  assert.match(s.decisionRecords.at(-1).scope || '', /only within its written Boundaries/);
  assert.equal(readyToPropose(s, id), true, 'Level 4 is offered next');
  assert.throws(() => proposeAuthority(s, id, 5, { by: ANA }));
});

test('D7: Boundaries say what is written and what software enforces', () => {
  const s = stateWs();
  const rules = strip(capabilityView(s, ID, new URLSearchParams('tab=status&show=rules')));
  assert.doesNotMatch(rules, /Software checks every action against these rules/);
  const nRules = strip(capabilityView(initialState(), 'refund-recommendation', new URLSearchParams('tab=status&show=rules')));
  assert.match(nRules, /Its actions go through a gate/);
});

test('display: Requirement results read differently, and no raw status key shows', () => {
  const s = stateWs();
  const d = String(capabilityView(s, ID, new URLSearchParams('tab=decide')));
  assert.match(d, /class="is-no-evidence">\s*<span class="req-mark" aria-hidden="true">○<\/span>/);
  assert.doesNotMatch(d, /No results yet: No results yet|Not met: Not yet measured/);
  assert.doesNotMatch(strip(d), /needs-decision|too-early|not-enough/);
  assert.match(strip(d), /Requirements \d+ of \d+ met/);
  assert.doesNotMatch(strip(d), /\bChecks\b|Decision requirements/);
});

test('display: a minimum-cases row with some cases is "Not enough evidence", never "No evidence yet"', () => {
  const s = initialState();
  setPeople(people(s)); setToday(s.today);
  const r = requirementsNow(s, 'refund-execution-high-value').find((x) => x.id === 'min-cases');
  assert.equal(r.result.status, 'not-enough');
  const d = strip(capabilityView(s, 'refund-execution-high-value', new URLSearchParams('tab=decide')));
  assert.match(d, /Minimum 200 pilot cases · Not enough evidence: 96/);
  assert.match(d, /No unresolved critical incidents · Not met:/);
});

test('the tagline says software enforces configured controls, not every Boundary', () => {
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal((index.match(/AI interprets\. Software enforces configured controls\. Humans authorize\./g) || []).length, 2, 'meta description and footer');
  assert.doesNotMatch(index, /Software enforces\. Humans/);
});

test('State\'s Status is truthful: set up, not "still being set up"; the gap is what happens next', () => {
  const st = page(stateWs(), ID, 'status');
  assert.doesNotMatch(st, /still being set up|Once setup is done/);
  assert.match(st, /What happens next Resolve the gap first: it is observed at Level 2, Draft, above its approved Level 1, Recommend\. Further expansion is blocked/);
  assert.match(st, /Next: resolve the gap/);
  // Once recorded back within approved Authority, it still isn't "being set up".
  const back = recordBaseline(stateWs(), ID, { effective: { level: 1, note: 'Proposals now only suggest; a person writes each change.' }, by: PAIGE, reason: 'We changed how State runs.' });
  assert.doesNotMatch(page(back, ID, 'status'), /still being set up/);
});

test('Overview → To do: the gap is an item with both levels and the block, ahead of evidence and decisions', () => {
  let s = stateWs();
  const todos = overviewTodos(s);
  const g = todos.find((t) => t.kind === 'gap');
  assert.ok(g, 'a to-do for the gap');
  assert.equal(todos[0], g, 'first, with no review open');
  assert.equal(g.title, 'Resolve: Interpret incoming project evidence is operating above approved Authority');
  assert.equal(g.sub, 'Approved: Level 1, Recommend · Observed: Level 2, Draft · Further expansion is blocked until this is resolved');
  assert.equal(g.href, `#/capabilities/${ID}?tab=monitor`);
  assert.equal(g.emphasis, true);
  assert.match(strip(overviewView(s)), /To do 2 Interpret incoming project evidence Resolve: Interpret incoming project evidence is operating above approved Authority/);
  // An open decision governing the gap still ranks after it.
  s = proposeAuthority(importEvidence(s, RUN), ID, 2, { by: PAIGE });
  assert.deepEqual(overviewTodos(s).map((t) => t.kind).slice(0, 2), ['gap', 'decision']);
  // Resolved: no item.
  const back = recordBaseline(stateWs(), ID, { effective: { level: 1, note: 'Proposals now only suggest; a person writes each change.' }, by: PAIGE, reason: 'We changed how State runs.' });
  assert.equal(overviewTodos(back).some((t) => t.kind === 'gap'), false);
});

test('the Proposal summary speaks of Boundaries, never "the Rules"', () => {
  let s = proposeAuthority(importEvidence(stateWs(), RUN), ID, 2, { by: PAIGE });
  const d = strip(capabilityView(s, ID, new URLSearchParams('tab=decide')));
  assert.doesNotMatch(d, /in the Rules|within the Rules/);
  assert.match(d, /Still needs a person/);
});
