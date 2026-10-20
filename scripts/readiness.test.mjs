// Remediation 2 (#151): hard Requirements block expansion; considerations
// don't (D3). Northstar's high-value row is a consideration (R3-A). A Proposal
// can be opened while hard Requirements are unresolved; the expansion Decision
// is what's blocked (R4-A).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideWith, requirementsMet } from './helpers.mjs';
import {
  initialState, startEmpty, setUpWorkspace, addPerson, addCapability, getCapability, capData, current,
  saveCriteria, saveStakeholders, mapEvidence, rowMetric, MANUAL_SOURCE, recordResult, recordJudgment,
  proposeAuthority, replaceProposal, selectDecision, setRationale, setOutcome, setRolloutField, setResidualRisk, canAuthorize, authorize, people,
  readiness, isConsideration, classifyChange, reviewConditions,
} from '../src/store/index.js';
import { cleanRequirements } from '../src/store/evidence.js';
import { setPeople, setToday } from '../src/ui.js';
import { capabilityView } from '../src/views/capability.js';
import { decisionWorkspaceView } from '../src/views/decisions.js';
import { criteriaEditorView } from '../src/views/criteria.js';

const ANA = 'ana-ruiz';
const BEN = 'ben-okoro';
const RR = 'refund-recommendation';
const strip = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');

// A small firm with three hard Requirements and one consideration, results
// recorded by hand, and a Proposal open for Draft.
function firm({ accuracy = [19, 20], templates = 'met', consideration = true, extra = [] } = {}) {
  let s = setUpWorkspace(startEmpty(), { workspace: { name: 'Ruiz Tax' }, workflow: { name: 'Client email' }, founder: { name: 'Ana Ruiz', title: 'Partner' } });
  s = addPerson(s, { name: 'Ben Okoro', title: 'Tax lead', team: 'Tax', by: ANA, reason: 'Reviews the drafts.' });
  s = addCapability(s, { name: 'Draft deadline emails', summary: 'Drafts emails reminding clients of tax deadlines.', owner: ANA, risk: { impact: 'Medium', reversibility: 'Easy to reverse', exposure: 'Customer-facing' }, today: 'recommends', by: ANA });
  const id = s.capabilities.at(-1).id;
  s = saveStakeholders(s, id, { stakeholders: [{ person: BEN, team: 'Tax', role: 'reviewer', stance: 'expand', position: 'Ready.' }], by: ANA });
  s = saveCriteria(s, id, {
    criteria: [],
    requirements: [
      { id: 'min-cases', text: 'Minimum 20 cases', kind: 'coverage' },
      { id: 'accuracy', text: 'Overall accuracy ≥ 90%', judgment: 'evidence' },
      { id: 'templates', text: 'The tax lead has approved the templates', judgment: 'person' },
      { id: 'tone', text: 'Clients find the tone friendly', judgment: 'person', ...(consideration ? { consideration: true } : {}) },
      ...extra,
    ],
    by: ANA,
    reason: 'Our own bar, written by us.',
  });
  s = mapEvidence(s, id, { rowKind: 'requirement', rowId: 'min-cases', measure: { source: MANUAL_SOURCE, metric: rowMetric('requirement', 'accuracy'), stat: 'sample' }, by: ANA });
  s = mapEvidence(s, id, { rowKind: 'requirement', rowId: 'accuracy', measure: { source: MANUAL_SOURCE, metric: rowMetric('requirement', 'accuracy'), stat: 'rate' }, by: ANA });
  if (accuracy) s = recordResult(s, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: accuracy[0], total: accuracy[1], kind: 'eval', by: BEN });
  if (templates) s = recordJudgment(s, id, 'templates', { verdict: templates, rationale: 'Checked on Oct 14.', by: BEN });
  s = proposeAuthority(s, id, 2, { by: ANA });
  return [s, id];
}
function ready(s, id, option = 'expand') {
  s = decideWith(s, id, option);
  s = setOutcome(setOutcome(s, id, 0, 'metric', 'Time to send reminders'), id, 0, 'target', 'at least 30% faster');
  s = setOutcome(setOutcome(s, id, 1, 'metric', 'Emails corrected'), id, 1, 'target', 'at most 10%');
  for (const [k, v] of Object.entries({ owner: ANA, scope: 'Every deadline email.', startDate: s.today, feedbackChannel: 'Office inbox', reviewerNotes: 'Read every one before it goes; nothing is sent without approval.', reviewDate: '2026-12-01' })) s = setRolloutField(s, id, k, v);
  return setRationale(s, id, 'The evidence supports a Draft pilot with a person on every email.');
}

test('D3: with every hard Requirement Met, an open consideration does not block', () => {
  const [s, id] = firm();
  const r = readiness(s, id);
  assert.deepEqual([r.hardMet, r.hardTotal, r.considerationsOpen.map((x) => x.id)], [3, 3, ['tone']]);
  assert.deepEqual(canAuthorize(ready(s, id), id, { by: ANA }), { ok: true });
  const done = authorize(ready(s, id), id, { by: ANA });
  assert.equal(getCapability(done, id).authority.level, 2);
  assert.match(done.decisionRecords.at(-1).openCondition, /Every hard Requirement was met\. Considerations not met yet: Clients find the tone friendly/);
});

test('D3: a hard Requirement short of Met blocks the expansion, whatever the reason', () => {
  const block = (s, id) => canAuthorize(ready(s, id), id, { by: ANA });
  // Not met.
  let [s, id] = firm({ accuracy: [15, 20] });
  assert.match(block(s, id).reason, /Every hard Requirement has to be Met before authority expands\. Not yet: "Overall accuracy ≥ 90%" \(Not met\)/);
  assert.deepEqual(block(s, id).requirements, ['accuracy']);
  // Not enough evidence: 10 cases against a minimum of 20.
  [s, id] = firm({ accuracy: [10, 10] });
  assert.match(block(s, id).reason, /"Minimum 20 cases" \((Not enough evidence|Not met)\)/);
  // No evidence yet.
  [s, id] = firm({ accuracy: null });
  assert.match(block(s, id).reason, /"Overall accuracy ≥ 90%" \(No evidence yet\)/);
  // Unknown.
  [s, id] = firm({ templates: 'unknown' });
  assert.match(block(s, id).reason, /"The tax lead has approved the templates" \(Unknown\)/);
  // Conflicting.
  [s, id] = firm();
  s = recordJudgment(s, id, 'templates', { verdict: 'not-met', rationale: 'One template still names the wrong deadline.', by: ANA });
  assert.match(block(s, id).reason, /"The tax lead has approved the templates" \(Conflicting\)/);
  // A missing bar (needs decision) on a coverage rule.
  [s, id] = firm({ extra: [{ id: 'volume', text: 'Enough reminder volume: needs decision', kind: 'coverage', bar: 'needs-decision' }] });
  const nd = readiness(s, id).hardUnmet.find((x) => x.id === 'volume');
  assert.equal(nd.result.status, 'needs-decision');
  assert.match(block(s, id).reason, /"Enough reminder volume: needs decision" \(Needs decision\)/);
});

test('R4-A: the Proposal opens while hard Requirements are unresolved; holding, reducing and redesign stay open', () => {
  const [s, id] = firm({ accuracy: [15, 20] });
  assert.ok(capData(s, id).decision.proposed, 'proposed despite an unmet hard Requirement');
  for (const option of ['hold', 'restrict', 'suspend', 'redesign']) {
    const r = setRationale(selectDecision(s, id, option), id, 'Not yet: accuracy is below the bar.');
    assert.deepEqual(canAuthorize(r, id, { by: ANA }), { ok: true }, option);
  }
});

test('R4-A on screen: the Proposal says why it is not approvable, and Expand says why it is closed', () => {
  const [s, id] = firm({ accuracy: [15, 20] });
  setPeople(people(s)); setToday(s.today);
  const h = strip(decisionWorkspaceView({ ...s, actingAs: ANA }, id));
  assert.match(h, /Not approvable yet: a hard Requirement isn't met Authority can't expand until each of these is Met\./);
  assert.match(h, /Overall accuracy ≥ 90% · Not met/);
  assert.match(h, /Considerations, which don't block: Clients find the tone friendly\./);
  assert.match(h, /Expand autonomy .* Not available until every hard Requirement is met\. Not yet: Overall accuracy ≥ 90%\./);
  const raw = String(decisionWorkspaceView({ ...s, actingAs: ANA }, id));
  assert.match(raw, /value="expand" data-family="expand"[^>]*disabled/);
  // Met: no notice, Expand open.
  const [ok, id2] = firm();
  const h2 = strip(decisionWorkspaceView({ ...ok, actingAs: ANA }, id2));
  assert.doesNotMatch(h2, /Not approvable yet/);
});

test('R4-A: once the evidence meets the bar, the open Proposal is stale and is replaced, then decided', () => {
  let [s, id] = firm({ accuracy: null });
  s = ready(s, id);
  assert.match(canAuthorize(s, id, { by: ANA }).reason, /No evidence yet/);
  s = recordResult(s, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 19, total: 20, kind: 'eval', by: BEN });
  assert.match(canAuthorize(s, id, { by: ANA }).reason, /The Proposal is stale/);
  s = authorize(replaceProposal(s, id, { by: ANA }), id, { by: ANA });
  assert.equal(getCapability(s, id).authority.level, 2);
});

test('R3-A: Northstar\'s high-value row is a consideration, so Refund recommendation can still be decided', () => {
  const s = initialState();
  const hv = current(s, RR, 'requirements').find((r) => r.id === 'high-value');
  assert.equal(isConsideration(hv), true);
  assert.equal(readiness(s, RR).hardUnmet.length, 0);
  const done = authorize(setRationale(decideWith(s, RR, 'expand-limits'), RR, 'Standard refunds are ready; high-value stays with a person.'), RR, { by: 'maya' });
  assert.equal(getCapability(done, RR).authority.level, 3);
  assert.equal(reviewConditions(s, RR).requirementResults.find((r) => r.id === 'high-value').consideration, true, 'the Proposal and record keep which rows were considerations');
});

test('the model: a consideration is kept; the minimum-cases row is always hard', () => {
  const rows = cleanRequirements([{ id: 'min-cases', text: 'Minimum 20 cases', kind: 'coverage' }, { id: 'tone', text: 'Clients find the tone friendly', judgment: 'person', consideration: true }, { id: 'x', text: 'Another', judgment: 'person', consideration: false }]);
  assert.equal(rows[1].consideration, true);
  assert.equal(Object.hasOwn(rows[2], 'consideration'), false, 'hard is the default and isn\'t stored');
  assert.throws(() => cleanRequirements([{ id: 'min-cases', text: 'Minimum 20 cases', kind: 'coverage', consideration: true }]), /always a hard Requirement/);
  assert.throws(() => cleanRequirements([{ id: 'a', text: 'A', judgment: 'person', consideration: 'yes' }]), /hard or a consideration/);
});

test('after results, hard → consideration needs sign-off; consideration → hard is recorded (#155, R6)', () => {
  const [s, id] = firm();
  const soften = classifyChange(s, id, 'criteria', { criteria: current(s, id, 'criteria'), requirements: current(s, id, 'requirements').map((r) => (r.id === 'templates' ? { ...r, consideration: true } : r)) });
  assert.deepEqual(soften.governed, ['It makes "The tax lead has approved the templates" a consideration instead of a hard Requirement.']);
  const harden = classifyChange(s, id, 'criteria', { criteria: current(s, id, 'criteria'), requirements: current(s, id, 'requirements').map((r) => (r.id === 'tone' ? { ...r, consideration: false } : r)) });
  assert.deepEqual([harden.recorded, harden.governed, harden.raises], [['Makes "Clients find the tone friendly" a hard Requirement.'], [], true]);
});

test('screens: the Requirements list marks considerations, and its copy says hard Requirements block', () => {
  const s = initialState();
  setPeople(people(s)); setToday(s.today);
  const req = strip(capabilityView(s, RR, new URLSearchParams('tab=decide&show=requirements')));
  assert.match(req, /Every hard Requirement has to be Met before authority expands: Not met, Unknown, Conflicting, not enough evidence or a missing bar all block it\. A consideration is shown and recorded with the decision, but doesn't block\./);
  assert.doesNotMatch(req, /go ahead anyway/);
  assert.match(req, /Minimum 40 high-value refund cases Consideration · Not enough evidence: 18 of 40/);
  assert.match(req, /All 5 hard Requirements met · 1 consideration not met\. A consideration is weighed by the person deciding; it never blocks\./);
});

test('screens: the editors ask whether each Requirement blocks; minimum cases always does', () => {
  const s = addCapability(initialState(), { name: 'Order lookup', summary: 'Finds orders.', owner: 'priya', risk: { impact: 'Medium', reversibility: 'Easy to reverse', exposure: 'Customer-facing' }, startingLevel: 1 });
  setPeople(people(s));
  const h = String(criteriaEditorView({ ...s, actingAs: 'priya' }, 'order-lookup', new URLSearchParams()));
  assert.match(h, /<select name="r-weight" aria-label="Does it block expansion\?"><option value="hard" selected>Hard: blocks expansion until met<\/option><option value="consideration" >Consideration: shown, doesn't block<\/option><\/select>/);
  assert.match(h, /Hard: blocks expansion until met<\/span>/, 'minimum cases: no choice');
});

test('a failed measured Requirement says where the result came from, never a raw run id', () => {
  const [s, id] = firm({ accuracy: [15, 20] });
  const r = readiness(s, id).hardUnmet.find((x) => x.id === 'accuracy');
  assert.match(r.gap, /^Measured 75% across 20 cases, from /);
  assert.doesNotMatch(r.gap, /manual:/);
});

test('a case count short of its minimum is Not enough evidence, never Not met; hard still blocks, a consideration still doesn\'t', () => {
  // Hard: the firm's coverage rule with 10 of 20 cases blocks, as Not enough evidence.
  let [s, id] = firm({ accuracy: [10, 10] });
  const minc = readiness(s, id).hardUnmet.find((x) => x.id === 'min-cases');
  assert.equal(minc.result.status, 'not-enough');
  assert.equal(minc.result.label, 'Not enough evidence');
  assert.match(canAuthorize(ready(s, id), id, { by: ANA }).reason, /"Minimum 20 cases" \(Not enough evidence\)/);
  setPeople(people(s)); setToday(s.today);
  assert.match(strip(capabilityView({ ...s, actingAs: ANA }, id, new URLSearchParams('tab=decide&show=requirements'))), /Minimum 20 cases · Not enough evidence: 10 of 20/);
  // Consideration: Northstar's high-value row reads the same way and doesn't block.
  const n = initialState();
  const hv = readiness(n, RR).considerationsOpen.find((x) => x.id === 'high-value');
  assert.equal(hv.result.status, 'not-enough');
  assert.equal(hv.current, '18', 'the stored count stays bare for everything that reads it');
  assert.deepEqual(canAuthorize(setRationale(decideWith(n, RR, 'expand-limits'), RR, 'Standard refunds are ready; high-value stays with a person.'), RR, { by: 'maya' }), { ok: true });
  // A measured bar that is missed is still Not met.
  [s, id] = firm({ accuracy: [15, 20] });
  assert.equal(readiness(s, id).hardUnmet.find((x) => x.id === 'accuracy').result.status, 'not-met');
});
