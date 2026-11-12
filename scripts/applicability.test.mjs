// v1 W1 (#182, Paige, 2026-11-09; docs/V1_RECONCILIATION.md): after a
// material change, the Owner reviews whether each affected row's earlier
// evidence still applies. Unreviewed earlier evidence doesn't count and
// blocks expansion; replacing the Proposal doesn't clear that; partly
// applicable evidence never counts toward a result; no longer applicable
// evidence stops counting; past Decisions are unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startEmpty, setUpWorkspace, addPerson, addCapability, saveCriteria, saveStakeholders, mapEvidence, rowMetric, MANUAL_SOURCE,
  recordResult, recordJudgment, recordMaterialChange, advanceToday, proposeAuthority, selectDecision, setRationale, setOutcome,
  setRolloutField, setResidualRisk, canAuthorize, replaceProposal, requirementsNow, evidenceCoverage, people,
  recordApplicability, unresolvedApplicability, applicabilityState, excludedBefore, materialChangeImpact, NONE_COUNTS, RESULT_WORDS, setAsideNote,
} from '../src/store/index.js';
import { setPeople, setToday } from '../src/ui.js';
import { capabilityView } from '../src/views/capability.js';

const ANA = 'ana-ruiz';
const BEN = 'ben-okoro';
const CARA = 'cara-lim';

// The small firm from lifecycle.test.mjs, at Recommend with every part of an
// expansion to Draft filled in: canAuthorize says yes.
function readyFirm() {
  let s = setUpWorkspace(startEmpty(), { workspace: { name: 'Ruiz Tax' }, workflow: { name: 'Client email' }, founder: { name: 'Ana Ruiz', title: 'Partner' } });
  s = addPerson(s, { name: 'Ben Okoro', title: 'Tax lead', team: 'Tax', by: ANA, reason: 'Reviews the drafts.' });
  s = addPerson(s, { name: 'Cara Lim', title: 'Office manager', team: 'Office', by: ANA, reason: 'Hears from clients.' });
  s = addCapability(s, { name: 'Draft deadline emails', summary: 'Drafts emails reminding clients of tax deadlines.', owner: ANA, risk: { impact: 'Medium', reversibility: 'Easy to reverse', exposure: 'Customer-facing' }, today: 'recommends', by: ANA });
  const id = s.capabilities.at(-1).id;
  s = saveStakeholders(s, id, { stakeholders: [{ person: BEN, team: 'Tax', role: 'reviewer', stance: 'expand', position: 'Ready for a Draft pilot.' }, { person: CARA, team: 'Office', stance: 'expand', position: 'Fine by me.' }], by: ANA });
  s = saveCriteria(s, id, {
    criteria: [],
    requirements: [
      { id: 'min-cases', text: 'Minimum 20 cases', kind: 'coverage' },
      { id: 'accuracy', text: 'Overall accuracy ≥ 90%', judgment: 'evidence' },
      { id: 'templates', text: 'The tax lead has approved the email templates', judgment: 'person' },
    ],
    by: ANA,
    reason: 'Our own bar for a first pilot, written by us.',
  });
  s = mapEvidence(s, id, { rowKind: 'requirement', rowId: 'min-cases', measure: { source: MANUAL_SOURCE, metric: rowMetric('requirement', 'accuracy'), stat: 'sample' }, by: ANA });
  s = mapEvidence(s, id, { rowKind: 'requirement', rowId: 'accuracy', measure: { source: MANUAL_SOURCE, metric: rowMetric('requirement', 'accuracy'), stat: 'rate' }, by: ANA });
  s = recordResult(s, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 19, total: 20, kind: 'eval', by: BEN });
  s = recordJudgment(s, id, 'templates', { verdict: 'met', rationale: 'All four templates approved on Oct 14.', by: BEN });
  s = proposeAuthority(s, id, 2, { by: ANA });
  s = selectDecision(s, id, 'expand');
  s = setOutcome(setOutcome(s, id, 0, 'metric', 'Time to send reminders'), id, 0, 'target', 'at least 30% faster');
  s = setOutcome(setOutcome(s, id, 1, 'metric', 'Emails corrected'), id, 1, 'target', 'at most 10%');
  for (const [k, v] of Object.entries({ owner: ANA, scope: 'Every deadline email this season.', startDate: s.today, feedbackChannel: 'Office inbox', reviewerNotes: 'Read every draft before it goes; nothing is sent without approval.', reviewDate: '2026-12-01' })) s = setRolloutField(s, id, k, v);
  s = setResidualRisk(s, id, { level: 'Moderate', note: 'Every draft is read before it is sent.' });
  s = setRationale(s, id, 'Every Requirement is met and a person approves every draft.');
  return [s, id];
}

// The same firm after a material change that every row's evidence predates.
function changed() {
  const [s0, id] = readyFirm();
  let s = advanceToday(s0, '2026-10-20');
  s = setRolloutField(s, id, 'startDate', s.today);
  s = recordMaterialChange(s, id, { areas: ['model'], description: 'Moved to a newer model for drafting.', effectiveOn: '2026-10-20', by: ANA });
  return [s, id, s0];
}
const status = (s, id) => Object.fromEntries(requirementsNow(s, id).map((r) => [r.id, r.result.status]));
const review = (s, id, rowId, verdict, extra = {}) => recordApplicability(s, id, { changeId: `MC-${id}-1`, rowKind: 'requirement', rowId, verdict, reason: 'Checked against the new model on ten emails.', by: ANA, ...extra });
const allApplicable = (s, id) => ['min-cases', 'accuracy', 'templates'].reduce((x, r) => review(x, id, r, 'applicable'), s);

test('the fixture is ready to expand before any change', () => {
  const [s, id] = readyFirm();
  assert.equal(canAuthorize(s, id, { by: ANA }).ok, true, canAuthorize(s, id, { by: ANA }).reason);
  assert.deepEqual(status(s, id), { 'min-cases': 'met', accuracy: 'met', templates: 'met' });
});

test('after a material change, unreviewed earlier evidence is excluded and expansion is blocked', () => {
  const [s, id] = changed();
  assert.deepEqual(unresolvedApplicability(s, id).map((r) => r.id), ['min-cases', 'accuracy', 'templates']);
  assert.equal(excludedBefore(s, id, 'requirement', 'accuracy'), '2026-10-20');
  // None of the earlier evidence counts, so nothing is Met any more.
  assert.deepEqual(status(s, id), { 'min-cases': 'no-evidence', accuracy: 'no-evidence', templates: 'no-evidence' });
  assert.equal(evidenceCoverage(s, id).sufficient, 0, 'Coverage is worked out from eligible evidence too');
  const c = canAuthorize(s, id, { by: ANA });
  assert.equal(c.ok, false);
  assert.equal(c.applicability, true);
  assert.match(c.reason, /Ana Ruiz reviews whether the earlier evidence still applies before authority expands\. Not reviewed yet: Minimum 20 cases \(MC-.*-1\); Overall accuracy ≥ 90%/);
  // The rows a change affects come from the evidence before any review excludes it.
  assert.equal(materialChangeImpact(s, id, applicabilityState(s, id).changes[0].change).rows.length, 3);
});

test('replacing the Proposal does not clear the unreviewed-evidence block', () => {
  const [s, id] = changed();
  const r = replaceProposal(s, id, { by: ANA });
  assert.equal(canAuthorize(r, id, { by: ANA }).applicability, true);
  assert.equal(unresolvedApplicability(r, id).length, 3);
});

test('completing the reviews clears only that block; Requirements are worked out again from eligible evidence', () => {
  const [s, id] = changed();
  let r = allApplicable(s, id);
  assert.equal(unresolvedApplicability(r, id).length, 0);
  assert.deepEqual(status(r, id), { 'min-cases': 'met', accuracy: 'met', templates: 'met' });
  // The Proposal is stale after the change: that block remains, as before W1.
  const c = canAuthorize(r, id, { by: ANA });
  assert.equal(c.ok, false);
  assert.equal(c.stale, true);
  r = replaceProposal(r, id, { by: ANA });
  assert.equal(canAuthorize(r, id, { by: ANA }).ok, true, canAuthorize(r, id, { by: ANA }).reason);
});

test('reviews done but evidence no longer applicable: expansion still waits on the recalculated Requirements', () => {
  const [s, id] = changed();
  let r = review(review(review(s, id, 'min-cases', 'applicable'), id, 'templates', 'applicable'), id, 'accuracy', 'not-applicable');
  assert.equal(unresolvedApplicability(r, id).length, 0);
  assert.equal(status(r, id).accuracy, 'no-evidence', 'no longer applicable evidence stays excluded');
  r = replaceProposal(r, id, { by: ANA });
  const c = canAuthorize(r, id, { by: ANA });
  assert.equal(c.ok, false);
  assert.equal(c.applicability, undefined);
  assert.deepEqual(c.requirements, ['accuracy']);
  // Fresh evidence after the change counts.
  r = recordResult(r, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 20, total: 20, kind: 'eval', by: BEN });
  assert.equal(status(r, id).accuracy, 'met');
});

test('partly applicable evidence is supporting context only: it never counts toward the result', () => {
  const [s, id] = changed();
  assert.throws(() => review(s, id, 'templates', 'partly'), /say what the earlier evidence still supports and what needs fresh evidence/);
  const r = review(allApplicable(s, id), id, 'templates', 'partly', { stillSupported: 'The wording of the four templates', needsFresh: 'Whether the new model keeps to them' });
  assert.equal(status(r, id).templates, 'no-evidence');
  const row = applicabilityState(r, id).changes[0].rows.find((x) => x.id === 'templates');
  assert.equal(row.review.verdict, 'partly');
  assert.equal(row.history.length, 2, 'every review is kept; the latest stands');
  assert.equal(row.review.stillSupported, 'The wording of the four templates');
});

test('only the Owner records applicability, with a reason, for a row the change affects', () => {
  const [s, id] = changed();
  assert.throws(() => review(s, id, 'accuracy', 'applicable', { by: BEN }), /Only the Owner, Ana Ruiz, records whether evidence still applies.*Reviewers can give their input/);
  assert.throws(() => review(s, id, 'accuracy', 'applicable', { reason: 'ok' }), /Say why/);
  assert.throws(() => review(s, id, 'accuracy', 'maybe'), /Choose still applicable, partly applicable or no longer applicable/);
  assert.throws(() => review(s, id, 'nope', 'applicable'), /doesn't affect that Requirement/);
  assert.throws(() => recordApplicability(s, id, { changeId: 'MC-x', rowKind: 'requirement', rowId: 'accuracy', verdict: 'applicable', reason: 'Checked it carefully.', by: ANA }), /Unknown material change/);
});

test('History keeps the change and every review; evidence and past Decision records are never changed', () => {
  const [s, id] = changed();
  const r = review(s, id, 'accuracy', 'not-applicable');
  assert.deepEqual(r.decisionRecords, s.decisionRecords);
  assert.deepEqual(r.capabilityData[id].evidence, s.capabilityData[id].evidence);
  assert.deepEqual(r.capabilityData[id].judgments, s.capabilityData[id].judgments);
  assert.equal(r.activity[0].kind, 'material-change');
  assert.equal(r.activity[0].surfaced, true);
  assert.match(r.activity[0].title, /^Evidence reviewed after MC-.*-1: Overall accuracy ≥ 90%, no longer applicable$/);
  assert.match(r.activity[0].body, /Ana Ruiz judged the evidence from before 2026-10-20 no longer applicable.*past Decisions keep what they froze/);
});

test('screens: Monitor lists each unreviewed row with the Owner\'s form; Decide shows the block with a link', () => {
  const [s, id] = changed();
  setPeople(people(s));
  setToday(s.today);
  const view = (st, q) => String(capabilityView(st, id, new URLSearchParams(q)));
  const mon = view({ ...s, actingAs: ANA }, 'tab=monitor');
  assert.match(mon, /3 Requirements or Targets rest on evidence from before a material change that you haven&#39;t reviewed\. Until then that evidence doesn't count, and authority can't expand\./);
  assert.equal((mon.match(/data-form="record-applicability"/g) || []).length, 3);
  const ben = view({ ...s, actingAs: BEN }, 'tab=monitor');
  assert.doesNotMatch(ben, /data-form="record-applicability"/);
  assert.match(ben, /that Ana Ruiz hasn&#39;t reviewed.*Reviewers can give their input to the Owner\./);
  const dec = view({ ...s, actingAs: ANA }, 'tab=decide');
  assert.match(dec, /Evidence from before a material change isn&#39;t reviewed yet, so it doesn&#39;t count: Minimum 20 cases; Overall accuracy ≥ 90%; The tax lead has approved the email templates\./);
  assert.match(dec, /href="#\/capabilities\/[^"]+\?tab=monitor">Review it in Monitor/);
  const done = view({ ...allApplicable(s, id), actingAs: ANA }, 'tab=monitor');
  assert.match(done, /Still applicable<\/span>/);
  assert.doesNotMatch(done, /that you haven&#39;t reviewed/);
});

test('History shows the material change and each review: who, the answer and the reason', () => {
  let [s, id] = changed();
  s = review(s, id, 'accuracy', 'partly', { stillSupported: 'The tone checks.', needsFresh: 'Accuracy on the new model.' });
  s = review(s, id, 'templates', 'applicable');
  setPeople(people(s)); setToday(s.today);
  const page = String(capabilityView(s, id, new URLSearchParams('tab=history'))).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, '\'').replace(/\s+/g, ' ');
  assert.match(page, /Material change: Model, effective Oct 20 Moved to a newer model for drafting\. Recorded by Ana Ruiz \(MC-[^)]+-1\)\./);
  assert.match(page, /Evidence reviewed after MC-[^:]+-1: Overall accuracy ≥ 90%, partly applicable By Ana Ruiz\. Checked against the new model on ten emails\. Still supported: The tone checks\. Needs fresh evidence: Accuracy on the new model\./);
  assert.match(page, /Evidence reviewed after MC-[^:]+-1: The tax lead has approved the email templates, still applicable By Ana Ruiz\./);
});

// ---------------------------------------------------------------------------
// Wording (Paige, 2026-11-11): the result keeps its status; a note says which
// evidence doesn't count and why. Display only.
// ---------------------------------------------------------------------------

const req = (s, id, rid) => requirementsNow(s, id).find((r) => r.id === rid);

test('wording: awaiting review reads "No evidence currently counts toward this result", with the count and the change; the status is unchanged', () => {
  const [s, id] = changed();
  const r = req(s, id, 'accuracy');
  assert.equal(r.result.status, 'no-evidence', 'no new state');
  assert.equal(r.result.label, NONE_COUNTS);
  assert.match(r.aside, /^\d+ earlier results? awaits? material-change review \(MC-[^)]+-1\) and (is|are) not counted\.$/);
  assert.equal(r.result.why, r.aside);
});

test('wording: "No evidence yet" stays for a Requirement with nothing recorded', () => {
  let s = setUpWorkspace(startEmpty(), { workspace: { name: 'Ruiz Tax' }, workflow: { name: 'Client email' }, founder: { name: 'Ana Ruiz', title: 'Partner' } });
  s = addCapability(s, { name: 'Draft deadline emails', summary: 'Drafts emails reminding clients of tax deadlines.', owner: ANA, risk: { impact: 'Medium', reversibility: 'Easy to reverse', exposure: 'Customer-facing' }, today: 'recommends', by: ANA });
  const id = s.capabilities.at(-1).id;
  s = saveCriteria(s, id, { criteria: [], requirements: [{ id: 'min-cases', text: 'Minimum 20 cases', kind: 'coverage' }, { id: 'signoff', text: 'The partner signs off the templates', judgment: 'person' }], by: ANA, reason: 'Our own bar.' });
  const r = req(s, id, 'signoff');
  assert.equal(r.result.label, RESULT_WORDS['no-evidence']);
  assert.equal(r.aside, undefined);
});

test('wording: partly applicable keeps the Owner\'s answer, "supporting context only; not counted"', () => {
  let [s, id] = changed();
  s = review(s, id, 'accuracy', 'partly', { stillSupported: 'The tone checks.', needsFresh: 'Accuracy on the new model.' });
  const r = req(s, id, 'accuracy');
  assert.equal(r.result.label, NONE_COUNTS);
  assert.match(r.aside, /not counted after MC-[^:]+-1: Partly applicable\. Supporting context only; not counted toward this result\.$/);
});

test('wording: mixed evidence keeps the result from the evidence that counts, with the note beside it', () => {
  let [s, id] = changed();
  s = recordResult(s, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 19, total: 20, kind: 'eval', by: BEN });
  const r = req(s, id, 'accuracy');
  assert.notEqual(r.result.status, 'no-evidence', 'judged on the new result');
  assert.notEqual(r.result.label, NONE_COUNTS);
  assert.match(r.aside, /await(s)? material-change review/);
});

test('wording: two changes give one count, then each change\'s state', () => {
  assert.equal(setAsideNote({ count: 3, changes: [{ changeId: 'MC-x-1', state: 'partly' }, { changeId: 'MC-x-2', state: 'pending' }], otherConfig: 0 }),
    '3 earlier results are not counted: MC-x-1: Partly applicable. Supporting context only; not counted toward this result. MC-x-2: Earlier evidence needs review after a material change.');
  assert.equal(setAsideNote({ count: 1, changes: [{ changeId: 'MC-x-1', state: 'not-applicable' }], otherConfig: 0 }), '1 earlier result is not counted after MC-x-1: No longer applicable.');
  assert.equal(setAsideNote({ count: 0, changes: [], otherConfig: 2 }), '2 imported results were measured under another configuration and are set aside.');
});

test('wording: once reviewed as still applicable, nothing is set aside', () => {
  let [s, id] = changed();
  s = allApplicable(s, id);
  for (const r of requirementsNow(s, id)) assert.equal(r.aside, undefined, r.id);
});

test('wording: frozen Decisions keep the labels they froze', () => {
  const [s, id, s0] = changed();
  const before = JSON.stringify(s0.decisionRecords);
  assert.equal(JSON.stringify(s.decisionRecords), before);
});

test('wording: a Requirement judged through its Target carries the Target\'s note, and never reads "No evidence yet" while results are set aside', () => {
  let s = setUpWorkspace(startEmpty(), { workspace: { name: 'Ruiz Tax' }, workflow: { name: 'Client email' }, founder: { name: 'Ana Ruiz', title: 'Partner' } });
  s = addCapability(s, { name: 'Draft deadline emails', summary: 'Drafts emails reminding clients of tax deadlines.', owner: ANA, risk: { impact: 'Medium', reversibility: 'Easy to reverse', exposure: 'Customer-facing' }, today: 'recommends', by: ANA });
  const id = s.capabilities.at(-1).id;
  s = saveCriteria(s, id, {
    criteria: [{ id: 'accuracy-t', name: 'Accuracy', target: '≥ 90%', requirement: 'acc' }],
    requirements: [{ id: 'min-cases', text: 'Minimum 20 cases', kind: 'coverage' }, { id: 'acc', text: 'Overall accuracy ≥ 90%', judgment: 'evidence' }],
    by: ANA, reason: 'Our own bar.',
  });
  s = mapEvidence(s, id, { rowKind: 'target', rowId: 'accuracy-t', measure: { source: MANUAL_SOURCE, metric: rowMetric('target', 'accuracy-t'), stat: 'rate' }, by: ANA });
  s = recordResult(s, id, { rowKind: 'target', rowId: 'accuracy-t', type: 'rate', passed: 10, total: 20, kind: 'eval', by: ANA });
  s = advanceToday(s, '2026-10-20');
  s = recordMaterialChange(s, id, { areas: ['model'], description: 'Moved to a newer model.', effectiveOn: '2026-10-20', by: ANA });
  let r = req(s, id, 'acc');
  assert.match(r.result.why, /^Judged by its Target: Accuracy:/);
  assert.equal(r.result.status, 'no-evidence', 'no new state');
  assert.equal(r.result.label, NONE_COUNTS);
  assert.match(r.aside, /^Through its Target Accuracy: 1 earlier result awaits material-change review \(MC-[^)]+-1\) and is not counted\.$/);
  assert.doesNotMatch(r.result.why, /No evidence yet/);
  // Mixed: a new result decides it; the earlier one stays visibly excluded.
  s = recordResult(s, id, { rowKind: 'target', rowId: 'accuracy-t', type: 'rate', passed: 19, total: 20, kind: 'eval', by: ANA });
  r = req(s, id, 'acc');
  assert.equal(r.result.status, 'met');
  assert.match(r.aside, /Through its Target Accuracy: 1 earlier result awaits material-change review/);
});
