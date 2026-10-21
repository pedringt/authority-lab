// Phase 6A.1: the Decision workspace, deterministic (Paige, 2026-10-21).
// Only what the chosen decision needs is asked; a status band says what
// stands between the decision and an expansion; some rollout fields and
// expected outcomes come with a suggested value the person accepts one at a
// time, and the record notes the ones left unchanged (decision 2). The rules
// themselves don't change (decision 3): canAuthorize decides exactly as
// before, and nothing the adaptive layer does can drop what must be shown.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decideWith, TEST_RESIDUAL_RISK } from './helpers.mjs';
import {
  initialState, startEmpty, setUpWorkspace, addPerson, addCapability, capData, buildWorkspace, importEvidenceFiles,
  saveCriteria, saveStakeholders, mapEvidence, rowMetric, MANUAL_SOURCE, recordResult, recordJudgment, assessRisk,
  proposeAuthority, selectDecision, setRationale, setOutcome, setRolloutField, setResidualRisk, canAuthorize, authorize, people,
  decisionSuggestions, acceptDecisionSuggestion, acceptedUnchanged, suggestionInPlace, SUGGESTED_REVIEW_DAYS, DECISION_SUGGESTION_LABEL,
  publishableRecord, applyPublishedRecords, OUTCOMES_MAX,
} from '../src/store/index.js';
import { stateWorkspace } from '../src/data/workspaces/state.js';
import { setPeople, setToday } from '../src/ui.js';
import { capabilityView } from '../src/views/capability.js';
import { decisionRecordView } from '../src/views/decisions.js';

const ANA = 'ana-ruiz';
const BEN = 'ben-okoro';
const RR = 'refund-recommendation';
const strip = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const steps = (page) => [...String(page).matchAll(/<p class="decide-step-n">Step \d+<\/p><h2>([^<]+)<\/h2>/g)].map((m) => m[1]);
const view = (s, id, q = '') => { setPeople(people(s)); setToday(s.today); return String(capabilityView(s, id, new URLSearchParams(`tab=decide${q}`))); };

// The small firm: three hard Requirements and a consideration, a Reviewer,
// results recorded by hand, and a Proposal open for Draft.
function firm({ accuracy = [19, 20], templates = 'met', stance = 'expand', accuracyConsideration = false } = {}) {
  let s = setUpWorkspace(startEmpty(), { workspace: { name: 'Ruiz Tax' }, workflow: { name: 'Client email' }, founder: { name: 'Ana Ruiz', title: 'Partner' } });
  s = addPerson(s, { name: 'Ben Okoro', title: 'Tax lead', team: 'Tax', by: ANA, reason: 'Reviews the drafts.' });
  s = addCapability(s, { name: 'Draft deadline emails', summary: 'Drafts emails reminding clients of tax deadlines.', owner: ANA, risk: { impact: 'Medium', reversibility: 'Easy to reverse', exposure: 'Customer-facing' }, today: 'recommends', by: ANA });
  const id = s.capabilities.at(-1).id;
  s = saveStakeholders(s, id, { stakeholders: [{ person: BEN, team: 'Tax', role: 'reviewer', stance, position: stance === 'undecided' ? '' : 'My view.' }], by: ANA });
  s = saveCriteria(s, id, {
    criteria: [],
    requirements: [
      { id: 'min-cases', text: 'Minimum 20 cases', kind: 'coverage' },
      { id: 'accuracy', text: 'Overall accuracy ≥ 90%', judgment: 'evidence', ...(accuracyConsideration ? { consideration: true } : {}) },
      { id: 'templates', text: 'The tax lead has approved the templates', judgment: 'person', ...(accuracyConsideration ? { consideration: true } : {}) },
      { id: 'tone', text: 'Clients find the tone friendly', judgment: 'person', consideration: true },
    ],
    by: ANA,
    reason: 'Our own bar, written by us.',
  });
  s = mapEvidence(s, id, { rowKind: 'requirement', rowId: 'min-cases', measure: { source: MANUAL_SOURCE, metric: rowMetric('requirement', 'accuracy'), stat: 'sample' }, by: ANA });
  s = mapEvidence(s, id, { rowKind: 'requirement', rowId: 'accuracy', measure: { source: MANUAL_SOURCE, metric: rowMetric('requirement', 'accuracy'), stat: 'rate' }, by: ANA });
  if (accuracy) s = recordResult(s, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: accuracy[0], total: accuracy[1], kind: 'eval', by: BEN });
  if (templates) s = recordJudgment(s, id, 'templates', { verdict: templates, rationale: 'Checked on Oct 14.', by: BEN });
  s = proposeAuthority(s, id, 2, { by: ANA });
  return [{ ...s, actingAs: ANA }, id];
}

// Everything an expansion needs except the parts a suggestion can't give.
function rest(s, id) {
  s = setRolloutField(s, id, 'feedbackChannel', 'Office inbox');
  return setRolloutField(s, id, 'reviewerNotes', 'Read every one before it goes; nothing is sent without approval.');
}
const outcomes = (s, id) => setOutcome(setOutcome(setOutcome(setOutcome(s, id, 0, 'metric', 'Time to send reminders'), id, 0, 'target', 'at least 30% faster'), id, 1, 'metric', 'Emails corrected'), id, 1, 'target', 'at most 10%');

// ---------------------------------------------------------------------------
// Suggestions (decision 2)
// ---------------------------------------------------------------------------

test('6A: suggestions are computed from the record, each with its basis, and nothing is filled in until accepted', () => {
  const [s, id] = firm();
  const sug = decisionSuggestions(s, id);
  assert.deepEqual(Object.keys(sug.rollout).sort(), ['owner', 'reviewDate', 'scope', 'startDate']);
  assert.equal(sug.rollout.owner.value, ANA);
  assert.equal(sug.rollout.startDate.value, s.today);
  const days = (Date.parse(`${sug.rollout.reviewDate.value}T00:00:00Z`) - Date.parse(`${s.today}T00:00:00Z`)) / 86400000;
  assert.equal(days, SUGGESTED_REVIEW_DAYS);
  assert.equal(sug.rollout.scope.value, 'Drafts emails reminding clients of tax deadlines.');
  for (const v of Object.values(sug.rollout)) assert.ok(v.basis.length > 3);
  // No suggestion exists for the feedback channel, reviewer notes, Residual Risk or the reason.
  assert.equal(sug.rollout.feedbackChannel, undefined);
  assert.equal(sug.rollout.reviewerNotes, undefined);
  // Showing them changes nothing.
  const page = view(selectDecision(s, id, 'expand'), id);
  assert.match(page, new RegExp(`${DECISION_SUGGESTION_LABEL}:</span> <strong>Ana Ruiz</strong>`));
  assert.match(page, /data-action="accept-suggestion" data-capability="[^"]+" data-key="rollout\.owner">Use this<\/button>/);
  assert.deepEqual(capData(selectDecision(s, id, 'expand'), id).decision.rollout || {}, {});
});

test('6A: outcome suggestions come from measured Targets with a number; none when there are no Targets', () => {
  const s = initialState();
  const o = decisionSuggestions(s, RR).outcomes;
  assert.ok(o.length >= 1 && o.length <= OUTCOMES_MAX);
  assert.equal(o[0].key, 'outcome.quality');
  assert.deepEqual([o[0].metric, o[0].target], ['Quality', '≥ 92% correct decisions']);
  assert.match(o[0].basis, /the Target "Quality", now /);
  const [f, id] = firm();
  assert.deepEqual(decisionSuggestions(f, id).outcomes, []);
});

test('6A: accepting is one field at a time; an edit afterwards makes it the person\'s own; the record lists only what stayed unchanged', () => {
  let [s, id] = firm();
  s = selectDecision(s, id, 'expand');
  for (const k of ['rollout.owner', 'rollout.startDate', 'rollout.reviewDate', 'rollout.scope']) s = acceptDecisionSuggestion(s, id, k);
  assert.equal(capData(s, id).decision.rollout.owner, ANA);
  assert.ok(suggestionInPlace(s, id, 'rollout.scope'));
  // Ana rewrites the scope: it's hers now.
  s = setRolloutField(s, id, 'scope', 'Deadline emails for individual clients only.');
  assert.deepEqual(acceptedUnchanged(capData(s, id).decision).map((x) => x.label), ['Rollout owner', 'Start date', 'Review date']);
  s = setResidualRisk(rest(outcomes(s, id), id), id, TEST_RESIDUAL_RISK);
  s = setRationale(s, id, 'The evidence supports a Draft pilot with a person on every email.');
  assert.deepEqual(canAuthorize(s, id, { by: ANA }), { ok: true });
  const done = authorize(s, id, { by: ANA });
  const rec = done.decisionRecords.at(-1);
  assert.deepEqual(rec.suggestionsAccepted.map((x) => x.key), ['rollout.owner', 'rollout.startDate', 'rollout.reviewDate']);
  assert.ok(Object.isFrozen(rec.suggestionsAccepted));
  setPeople(people(done)); setToday(done.today);
  const page = strip(decisionRecordView(done, rec.id));
  assert.match(page, /Accepted suggestions Authority Lab suggestions that Ana Ruiz accepted and left unchanged\. Anything not listed here or marked "Prefilled for the demo" was entered by a person\./);
  assert.match(page, /Rollout owner: Ana Ruiz/);
  assert.doesNotMatch(page, /Scope: Drafts emails reminding/);
});

test('6A: accepted outcome suggestions go in the first free row; duplicates and full rows are refused', () => {
  let s = selectDecision(initialState(), RR, 'expand-limits');
  s = { ...s, capabilityData: { ...s.capabilityData, [RR]: { ...capData(s, RR), decision: { ...capData(s, RR).decision, outcomes: [], outcomesPrefilled: false } } } };
  s = acceptDecisionSuggestion(s, RR, 'outcome.quality');
  assert.deepEqual(capData(s, RR).decision.outcomes[0], { metric: 'Quality', target: '≥ 92% correct decisions' });
  assert.throws(() => acceptDecisionSuggestion(s, RR, 'outcome.quality'), /"Quality" is already an expected outcome/);
  for (let i = 1; i < OUTCOMES_MAX; i += 1) s = setOutcome(setOutcome(s, RR, i, 'metric', `Other ${i}`), RR, i, 'target', `${i}%`);
  const another = decisionSuggestions(s, RR).outcomes.find((o) => o.key !== 'outcome.quality');
  assert.throws(() => acceptDecisionSuggestion(s, RR, another.key), new RegExp(`All ${OUTCOMES_MAX} expected outcome rows are in use`));
});

test('6A: no suggestion can be accepted for Residual Risk, the reason or anything unknown, nor after the decision is recorded', () => {
  let [s, id] = firm();
  s = selectDecision(s, id, 'expand');
  for (const k of ['residualRisk', 'rationale', 'rollout.reviewerNotes', 'rollout.feedbackChannel', 'rollout.constructor', 'outcome.nope', '__proto__']) {
    assert.throws(() => acceptDecisionSuggestion(s, id, k), /There is no suggestion/, k);
  }
  const done = authorize(setRationale(selectDecision(s, id, 'hold'), id, 'Holding while more evidence comes in.'), id, { by: ANA });
  assert.throws(() => acceptDecisionSuggestion(done, id, 'rollout.owner'), /already been made/);
});

test('6A: accepting every suggestion never makes an expansion recordable on its own (no bypass)', () => {
  let [s, id] = firm();
  s = selectDecision(s, id, 'expand');
  for (const k of ['rollout.owner', 'rollout.startDate', 'rollout.reviewDate', 'rollout.scope']) s = acceptDecisionSuggestion(s, id, k);
  // Still needs outcomes, the remaining plan fields, Residual Risk and a reason.
  assert.match(canAuthorize(s, id, { by: ANA }).reason, /Say why/);
  s = setRationale(s, id, 'The evidence supports a Draft pilot with a person on every email.');
  assert.match(canAuthorize(s, id, { by: ANA }).reason, /Expected impact/);
  s = outcomes(s, id);
  assert.match(canAuthorize(s, id, { by: ANA }).reason, /Rollout plan/);
  s = rest(s, id);
  assert.match(canAuthorize(s, id, { by: ANA }).reason, /Residual Risk/);
  assert.equal(capData(s, id).decision.residualRisk, null, 'never suggested, never filled in');
  // And the rules that block an expansion still block it, suggestions or not.
  let [bad, bid] = firm({ accuracy: [15, 20] });
  bad = selectDecision(bad, bid, 'expand');
  for (const k of ['rollout.owner', 'rollout.startDate', 'rollout.reviewDate', 'rollout.scope']) bad = acceptDecisionSuggestion(bad, bid, k);
  bad = setResidualRisk(setRationale(rest(outcomes(bad, bid), bid), bid, 'The evidence supports a Draft pilot with a person on every email.'), bid, TEST_RESIDUAL_RISK);
  assert.match(canAuthorize(bad, bid, { by: ANA }).reason, /Every hard Requirement has to be Met/);
});

test('6A: a published record keeps which suggestions were accepted, and replay claims only what the values bear out', () => {
  const PAIGE = 'paige-edrington';
  const ID = 'interpret-incoming-project-evidence';
  const dir = new URL('../src/data/external-evidence/', import.meta.url);
  const files = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8')).files.map((file) => ({ file, envelope: JSON.parse(readFileSync(new URL(file, dir), 'utf8')) }));
  const base = () => importEvidenceFiles(buildWorkspace(stateWorkspace, { today: '2026-10-13' }), files).state;
  let s = proposeAuthority(base(), ID, 2, { by: PAIGE });
  s = decideWith(s, ID, 'expand');
  s = setRationale(s, ID, 'All five Requirements are met on State\'s review suite run of Oct 13, with no unsafe-direction misses.');
  s = setOutcome(setOutcome(s, ID, 0, 'metric', 'Scenarios passed'), ID, 0, 'target', '≥ 93%');
  s = setOutcome(setOutcome(s, ID, 1, 'metric', 'Unsafe-direction misses'), ID, 1, 'target', 'at most 0');
  for (const [k, v] of Object.entries({ scope: 'Every Evidence interpretation in State; a person decides every proposal in Review.', feedbackChannel: 'GitHub issues on pedringt/ai-learning', reviewerNotes: 'Read each Review against its Evidence; nothing reaches Current State without your decision.' })) s = setRolloutField(s, ID, k, v);
  for (const k of ['rollout.owner', 'rollout.startDate', 'rollout.reviewDate']) s = acceptDecisionSuggestion(s, ID, k);
  const made = authorize(s, ID, { by: PAIGE });
  const entry = publishableRecord(made, made.decisionRecords.at(-1).id);
  assert.deepEqual(entry.suggestionsAccepted.map((x) => x.key), ['rollout.owner', 'rollout.startDate', 'rollout.reviewDate']);
  const replayed = applyPublishedRecords(base(), [{ file: 'a.json', entry }]).state.decisionRecords.at(-1);
  assert.deepEqual(replayed.suggestionsAccepted.map((x) => x.key), ['rollout.owner', 'rollout.startDate', 'rollout.reviewDate']);
  // A file claiming a suggestion that isn't what was recorded: not listed.
  const forged = { ...entry, suggestionsAccepted: [...entry.suggestionsAccepted, { key: 'rollout.scope', value: 'Something else entirely.' }] };
  const r2 = applyPublishedRecords(base(), [{ file: 'b.json', entry: forged }]).state.decisionRecords.at(-1);
  assert.deepEqual(r2.suggestionsAccepted.map((x) => x.key), ['rollout.owner', 'rollout.startDate', 'rollout.reviewDate']);
});

// ---------------------------------------------------------------------------
// The adaptive flow
// ---------------------------------------------------------------------------

test('6A: Hold asks for a reason only; Expand adds Residual Risk, outcomes and the rollout plan; "Show every field" asks everything', () => {
  const [s, id] = firm();
  const base = ['What changes if I approve this?', 'What do we know?', 'Who has said what?', 'Risk', 'Your decision'];
  const end = ['Why are you making this decision?', 'Review and record'];
  assert.deepEqual(steps(view(s, id)), [...base, ...end]);
  assert.deepEqual(steps(view(selectDecision(s, id, 'hold'), id)), [...base, ...end]);
  assert.deepEqual(steps(view(selectDecision(s, id, 'expand'), id)), [...base, 'Residual Risk', 'What should improve?', 'Rollout plan', ...end]);
  assert.deepEqual(steps(view(s, id, '&fields=all')), [...base, 'What should improve?', 'Rollout plan', ...end]);
  assert.match(view(s, id, '&fields=all'), /name="residual-risk" value="Unknown"/);
  assert.match(view(s, id), /Only what your choice needs is asked\. <a href="#\/capabilities\/[^"]+\?tab=decide&fields=all">Show every field<\/a>/);
  // A Residual Risk already given is never hidden, whatever is chosen.
  const given = setResidualRisk(selectDecision(s, id, 'hold'), id, TEST_RESIDUAL_RISK);
  assert.ok(steps(view(given, id)).includes('Residual Risk'));
});

test('6A: the status band says what stands between the decision and an expansion', () => {
  let [s, id] = firm({ accuracy: [15, 20], stance: 'undecided' });
  let band = strip(view(s, id)).split('Where this stands')[1].split('Step 1')[0];
  assert.match(band, /Approved: Level 1, Recommend\. Proposed: Level 2, Draft\./);
  assert.match(band, /✗ Hard Requirements not Met: Overall accuracy ≥ 90% \(Not met\)\./);
  assert.match(band, /· Considerations not met, which don't block: Clients find the tone friendly\./);
  assert.match(band, /✗ Waiting for a position from Ben Okoro \(Reviewer\)\./);
  assert.match(band, /Keeping the current limits, reducing, pausing and redesign are never blocked by these\./);
  [s, id] = firm({ stance: 'hold' });
  band = strip(view(s, id)).split('Where this stands')[1].split('Step 1')[0];
  assert.match(band, /✓ Every hard Requirement is Met \(3\)\./);
  assert.match(band, /! Ben Okoro \(Reviewer\) says Hold\. Shown, never a veto\./);
});

// ---------------------------------------------------------------------------
// Invariants contract (Phase 6 scope): the adaptive layer may reorder and
// collapse; it never drops these. Checked with nothing chosen, Hold and
// Expand, with and without "Show every field".
// ---------------------------------------------------------------------------

function stateGap() {
  const PAIGE = 'paige-edrington';
  const ID = 'interpret-incoming-project-evidence';
  const dir = new URL('../src/data/external-evidence/', import.meta.url);
  const files = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8')).files.map((file) => ({ file, envelope: JSON.parse(readFileSync(new URL(file, dir), 'utf8')) }));
  const s = proposeAuthority(importEvidenceFiles(buildWorkspace(stateWorkspace, { today: '2026-10-20' }), files).state, ID, 2, { by: PAIGE });
  return [{ ...s, actingAs: PAIGE }, ID];
}

const CASES = {
  'hard Requirement not met': [() => firm({ accuracy: [15, 20] }), [/Overall accuracy ≥ 90%/, /Not met/, /Not approvable yet/]],
  'Unknown judgment': [() => firm({ templates: 'unknown' }), [/The tax lead has approved the templates/, /Unknown/]],
  'consideration open': [() => firm(), [/Clients find the tone friendly/, /don(&#39;|')t block/]],
  'no hard quality Requirement': [() => firm({ accuracyConsideration: true }), [/No hard quality Requirement is currently required for expansion\./]],
  'Reviewer position missing': [() => firm({ stance: 'undecided' }), [/Waiting for Ben Okoro \(Reviewer\)/]],
  'Reviewer disagrees': [() => firm({ stance: 'hold' }), [/Ben Okoro \(Reviewer\) says Hold/]],
  'stale Proposal': [() => { const [s, id] = firm(); return [assessRisk(s, id, { likelihood: 'Low', scale: 'One case', by: ANA, reason: 'Few emails a week.' }), id]; }, [/This Proposal is stale/, /The Proposal is stale/]],
  'operating above approved Authority': [stateGap, [/Operating above approved Authority/]],
};
// On every open decision, whatever the case.
const ALWAYS = [/Newly permitted/, /Still needs a person/, /Still prohibited/, /Initial Risk/, /Controls<\/dt>/, /Boundaries and how each is enforced/, /What do we know\?/, /Who has said what\?/, /Where this stands/, /Approved:<\/strong> Level/, /Record decision as/, /Records can(&#39;|')t be edited/];

for (const [name, [build, expected]] of Object.entries(CASES)) {
  test(`6A invariants: ${name} shows on every variant of the Decision workspace`, () => {
    const [s0, id] = build();
    for (const option of [null, 'hold', 'expand']) {
      const s = option ? selectDecision(s0, id, option) : s0;
      for (const q of ['', '&fields=all']) {
        const page = view(s, id, q);
        for (const re of [...expected, ...ALWAYS]) assert.match(page, re, `${name}, ${option || 'nothing chosen'}${q ? ', every field' : ''}: ${re}`);
        // Residual Risk is asked wherever it could be needed, never prefilled.
        if (option === 'expand' || q) assert.match(page, /name="residual-risk" value="Unknown"/);
        assert.doesNotMatch(page, /name="residual-risk" value="[^"]+" data-action="set-residual-risk" data-capability="[^"]+" checked/);
      }
    }
  });
}
