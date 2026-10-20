// Product reset, Phase 5 (#147): is the current Authority still justified?
// Monitor compares the Decision in force with current conditions, says what
// changed and what it means, shows which evidence a material change may
// affect, and offers the existing ways to pull back. Monitoring never
// increases or restores Authority; only an automatic restriction, agreed in
// advance, lowers it without a person.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decideWith } from './helpers.mjs';
import {
  initialState, startEmpty, setUpWorkspace, addPerson, addCapability, getCapability, capData, current, buildWorkspace, importEvidence, findWorkspace,
  saveCriteria, saveStakeholders, mapEvidence, rowMetric, MANUAL_SOURCE, recordResult, recordJudgment, recordIncident, recordMaterialChange, advanceToday,
  proposeAuthority, selectDecision, setRationale, setOutcome, setRolloutField, setResidualRisk, canAuthorize, authorize, simulateBreach, recordReview, setActingAs, people,
  justification, changesSinceDecision, materialChangeImpact, decisionInForce, JUSTIFICATION_STATES,
} from '../src/store/index.js';
import { logGate } from '../src/store/gatelog.js';
import { stateWorkspace } from '../src/data/workspaces/state.js';
import { setPeople, setToday } from '../src/ui.js';
import { capabilityView } from '../src/views/capability.js';

const ANA = 'ana-ruiz';
const BEN = 'ben-okoro';
const CARA = 'cara-lim';
const RR = 'refund-recommendation';

// The small firm from #142/#144, decided to Draft by Ana on hand-recorded
// evidence. No integrations.
function decidedFirm() {
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
  s = authorize(setRationale(s, id, 'Every Requirement is met and a person approves every draft.'), id, { by: ANA });
  return [s, id];
}
const kinds = (j) => j.changes.map((c) => `${c.severity}:${c.kind}`);

test('right after a Decision, its Authority is still supported, and the record knows which material changes it saw', () => {
  const [s, id] = decidedFirm();
  const j = justification(s, id);
  assert.equal(j.key, 'supported');
  assert.equal(j.label, 'Current Authority still supported');
  assert.equal(j.record.id, s.decisionRecords.at(-1).id);
  assert.equal(j.basis.id, j.record.id);
  assert.equal(j.legacy, false);
  assert.deepEqual(j.authority, { level: 2, limited: false, name: 'Draft' });
  assert.deepEqual(j.record.materialChangesAtDecision, []);
  assert.deepEqual(Object.keys(JUSTIFICATION_STATES), ['supported', 'attention', 'investigate', 'unjustified', 'restricted', 'above', 'retired']);
});

test('more of the same evidence is information; a result that slips says the Authority may no longer be justified, and changes nothing', () => {
  const [s0, id] = decidedFirm();
  const more = recordResult(s0, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 10, total: 10, kind: 'eval', by: BEN });
  assert.equal(justification(more, id).key, 'supported');
  assert.deepEqual(kinds(justification(more, id)), ['info:new-evidence']);
  const slipped = recordResult(s0, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 2, total: 10, kind: 'eval', by: BEN });
  const j = justification(slipped, id);
  assert.equal(j.key, 'unjustified');
  assert.equal(j.label, 'Authority may no longer be justified');
  assert.ok(j.changes.some((c) => c.severity === 'unjustified' && /Requirement "Overall accuracy ≥ 90%": Met when decided, Not met now\./.test(c.text)), JSON.stringify(j.changes));
  assert.deepEqual(getCapability(slipped, id).authority, { level: 2, limited: false }, 'monitoring never changes Authority');
  assert.equal(JSON.stringify(slipped.decisionRecords.at(-1)), JSON.stringify(s0.decisionRecords.at(-1)), 'the Decision in force is never rewritten');
});

test('a conflict, an open critical incident or a limit over its reading calls for investigation; a moved position or disagreement for attention', () => {
  const [s0, id] = decidedFirm();
  const conflict = recordJudgment(s0, id, 'templates', { verdict: 'not-met', rationale: 'Template 3 still has the old date.', by: ANA });
  assert.equal(justification(conflict, id).key, 'investigate');
  const incident = recordIncident(s0, id, { what: 'An email went out with last year\'s deadline.', severity: 'critical', by: CARA });
  const ji = justification(incident, id);
  assert.equal(ji.key, 'investigate');
  assert.ok(kinds(ji).includes('investigate:incident'));
  const moved = saveStakeholders(s0, id, { stakeholders: current(s0, id, 'stakeholders').map((x) => (x.person === CARA ? { ...x, stance: 'hold', position: 'Clients are confused.' } : x)), by: ANA });
  const jm = justification(moved, id);
  assert.equal(jm.key, 'attention', 'disagreement stays a warning (#147 question 3)');
  assert.ok(jm.changes.some((c) => c.kind === 'position' && /Cara Lim \(Stakeholder\): Expand when decided, Hold now\./.test(c.text)));
  assert.ok(kinds(jm).includes('attention:disagreement'));
  assert.deepEqual(getCapability(incident, id).authority.level, 2);
});

test('a material change asks whether earlier evidence still applies: "may need new evidence", never failed, and Authority unchanged', () => {
  const [s0, id] = decidedFirm();
  let s = advanceToday(s0, '2026-10-20');
  s = recordMaterialChange(s, id, { areas: ['model', 'prompt'], description: 'Moved to a newer model and rewrote the prompt.', effectiveOn: '2026-10-20', by: ANA });
  const j = justification(s, id);
  assert.equal(j.key, 'attention');
  assert.ok(j.changes.some((c) => c.kind === 'material-change' && /^Material change \(model, prompt\), effective 2026-10-20: Moved to a newer model and rewrote the prompt\. Earlier evidence may need revalidating\.$/.test(c.text)));
  assert.equal(j.materialImpact.length, 1);
  const rows = j.materialImpact[0].rows;
  assert.deepEqual(rows.map((r) => [r.id, r.onlyBefore]), [['min-cases', true], ['accuracy', true], ['templates', true]]);
  // No row is called failed: results are what they were.
  assert.ok(current(s, id, 'requirements').length === 3);
  assert.equal(j.changes.filter((c) => c.severity === 'unjustified').length, 0);
  assert.deepEqual(getCapability(s, id).authority, { level: 2, limited: false });
  // New evidence after the change: that row is now partly after.
  s = recordResult(s, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 10, total: 10, kind: 'eval', by: BEN });
  const after = materialChangeImpact(s, id, j.materialImpact[0].change).rows.find((r) => r.id === 'accuracy');
  assert.deepEqual([after.onlyBefore, after.after > 0], [false, true]);
  // A change known before the Decision isn't "since" it.
  const [f0, fid] = decidedFirm();
  assert.equal(justification(f0, fid).materialImpact.length, 0);
});

test('an attempt at something never allowed since the Decision needs attention; approvals and overrides are information', () => {
  const s0 = authorize(decideWith(initialState(), RR, 'expand-limits'), RR);
  let s = logGate(s0, { capabilityId: RR, tool: 'issue_refund', verdict: 'block', rule: { kind: 'must-never', text: 'Issue a refund to a different payment method.' } });
  s = logGate(s, { capabilityId: RR, tool: 'issue_refund', actor: 'person', outcome: 'rejected' });
  const j = changesSinceDecision(s, RR);
  assert.ok(j.changes.some((c) => c.kind === 'boundary' && c.severity === 'attention' && /^1 attempt at something never allowed, all blocked\.$/.test(c.text)));
  assert.ok(j.changes.some((c) => c.kind === 'operation' && c.severity === 'info' && /1 overridden \(rejected\) by a person/.test(c.text)));
});

test('an automatic restriction reads "Restricted automatically"; a review lifts the lock but never restores Authority', () => {
  const expanded = authorize(decideWith(initialState(), RR, 'expand-limits'), RR);
  const s = simulateBreach(expanded, RR);
  const j = justification(s, RR);
  assert.equal(j.key, 'restricted');
  assert.equal(j.label, 'Restricted automatically');
  assert.equal(j.record.authorizedBy, 'system');
  assert.equal(j.reviewLock, true);
  const reviewed = recordReview(s, RR, { by: 'daniel', whatHappened: 'Three automatic refunds were wrong.', cause: 'Return status was not checked first.', changes: 'The rules now check the return before refunding.' });
  const jr = justification(reviewed, RR);
  assert.notEqual(jr.key, 'restricted');
  assert.equal(jr.reviewLock, false);
  assert.deepEqual(getCapability(reviewed, RR).authority, getCapability(s, RR).authority, 'never restored by a review');
});

test('State: its starting record has nothing to compare with, so unmet next-level Requirements say nothing about Recommend; a material change asks for re-evaluation', () => {
  const ID = 'interpret-incoming-project-evidence';
  const s0 = buildWorkspace(stateWorkspace, { today: '2026-10-19' });
  const j0 = justification(s0, ID);
  // Approved for Recommend, observed at Draft (#149): above approved Authority.
  assert.equal(j0.key, 'above');
  assert.equal(j0.legacy, true);
  assert.equal(j0.record.option, 'define');
  const run = JSON.parse(readFileSync(new URL('../src/data/external-evidence/state-eval-review-gh-38411808397-1.json', import.meta.url), 'utf8'));
  let s = importEvidence(s0, run);
  assert.equal(justification(s, ID).key, 'above');
  assert.equal(justification(s, ID).materialImpact.length, 0);
  s = advanceToday(s, '2026-10-21');
  s = recordMaterialChange(s, ID, { areas: ['model'], description: 'State moved its interpretation to a newer model.', effectiveOn: '2026-10-21', by: 'paige-edrington' });
  const j = justification(s, ID);
  assert.equal(j.key, 'above', 'the gap outranks the change; the change is still listed');
  assert.ok(j.materialImpact[0].rows.length >= 5, 'every Requirement judged by the imported run predates the change');
  assert.ok(j.materialImpact[0].rows.every((r) => r.onlyBefore));
  assert.deepEqual(getCapability(s, ID).authority, getCapability(s0, ID).authority, 'Authority intact');
  assert.equal(s.decisionRecords.filter((r) => r.capabilityId === ID).length, 1, 'no Decision assumed');
});

test('pulling back needs no Proposal and is open to anyone named; getting Authority back is a new Proposal', () => {
  const [s0, id] = decidedFirm();
  const r = setRationale(selectDecision(s0, id, 'restrict'), id, 'Clients are confused by the drafts; back to Recommend.');
  assert.deepEqual(canAuthorize(r, id, { by: CARA }), { ok: true });
  const back = authorize(r, id, { by: CARA });
  assert.equal(getCapability(back, id).authority.level, 1);
  assert.equal(decisionInForce(back, id).record.authorizedBy, CARA);
  // Restoring Draft is a new Proposal for the next level, never automatic.
  const again = recordResult(back, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 30, total: 30, kind: 'eval', by: BEN });
  assert.equal(getCapability(again, id).authority.level, 1);
  assert.ok(proposeAuthority(again, id, 2, { by: ANA }).capabilityData[id].decision.proposed);
});

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

const monitor = (s, id) => String(capabilityView(s, id, new URLSearchParams('tab=monitor')));

test('screen: Monitor asks "Is the current Authority still justified?" first, with the Decision in force and what changed', () => {
  const [s0, id] = decidedFirm();
  setPeople(people(s0));
  setToday(s0.today);
  const s = recordResult(s0, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 2, total: 10, kind: 'eval', by: BEN });
  const page = monitor(s, id);
  assert.match(page, /class="chip is-active"[^>]*>Still justified\?/);
  assert.ok(page.indexOf('Is the current Authority still justified?') < page.indexOf('Automatic safety limits'), 'the question comes first');
  assert.match(page, /<div class="mon-verdict mon-answer is-bad" role="status"><span class="mon-verdict-title">Authority may no longer be justified<\/span>/);
  assert.match(page, /<dt>Decision in force<\/dt><dd><a href="#\/records\/AC-\d+">AC-\d+<\/a>: Expand, .*, by Ana Ruiz<\/dd>/);
  assert.match(page, /<h2>What changed since AC-\d+ \(/);
  assert.match(page, /May no longer be justified<\/span> Requirement &quot;Overall accuracy ≥ 90%&quot;: Met when decided, Not met now\./);
  assert.match(page, /href="#\/capabilities\/[^"]+\?tab=decide&reduce=1">Reduce or pause<\/a>/);
  assert.match(page, /Restore or expand<\/dt><dd>Never automatic/);
  assert.match(page, /<dt>Retire<\/dt><dd>Stop using it for good, keeping its history\. Only the Owner \(Ana Ruiz\) can/);
});

test('screen: a material change shows which evidence it may affect, and the form only works for someone named', () => {
  const [s0, id] = decidedFirm();
  setPeople(people(s0));
  let s = advanceToday(s0, '2026-10-20');
  s = recordMaterialChange(s, id, { areas: ['tools'], description: 'Added a tool that reads the client calendar.', effectiveOn: '2026-10-20', by: ANA });
  setToday(s.today);
  const page = monitor({ ...s, actingAs: ANA }, id);
  assert.match(page, /<strong>Tools<\/strong>, effective Oct 20: Added a tool that reads the client calendar\./);
  assert.match(page, /It still counts, and it hasn't failed; it may need new evidence:/);
  assert.match(page, /May need new evidence<\/span> Overall accuracy ≥ 90%: all 1 piece of its evidence came before the change\./);
  assert.match(page, /data-form="record-material-change"/);
  assert.doesNotMatch(page, /Only the Owner or someone named/);
  const dee = addPerson(s, { name: 'Dee Park', title: 'Intern', team: 'Office', by: ANA, reason: 'Helps with filing.' });
  assert.match(monitor({ ...dee, actingAs: 'dee-park' }, id), /Only the Owner or someone named on Draft deadline emails can record a material change\./);
});

test('screen: pulling back from Monitor opens a reduction with no Proposal, recorded by whoever is named', () => {
  const [s0, id] = decidedFirm();
  setPeople(people(s0));
  const decide = (s) => String(capabilityView(s, id, new URLSearchParams('tab=decide&reduce=1')));
  let page = decide({ ...s0, actingAs: CARA });
  assert.match(page, /<h2>Reduce or pause<\/h2>/);
  assert.match(page, /One level down, to Recommend/);
  assert.match(page, /data-action="authorize"[^>]*disabled>Record decision as Cara Lim/);
  const chosen = setRationale(selectDecision({ ...s0, actingAs: CARA }, id, 'suspend'), id, 'Pausing while clients are confused.');
  page = decide(chosen);
  assert.doesNotMatch(page, /data-action="authorize"[^>]*disabled/);
});

test('a material change recorded the same day as the Decision in force still counts as since it', () => {
  const ID = 'interpret-incoming-project-evidence';
  const s0 = buildWorkspace(stateWorkspace, { today: '2026-10-19' });
  assert.deepEqual(s0.decisionRecords.find((r) => r.capabilityId === ID).materialChangesAtDecision, [], 'the starting record lists what it knew');
  const s = recordMaterialChange(s0, ID, { areas: ['model'], description: 'State moved its interpretation to a newer model.', by: 'paige-edrington' });
  assert.equal(justification(s, ID).materialImpact.length, 1);
  assert.equal(justification(s, ID).key, 'above');
  // An automatic restriction records what it knew too.
  const r = simulateBreach(authorize(decideWith(initialState(), RR, 'expand-limits'), RR), RR);
  assert.deepEqual(r.decisionRecords.at(-1).materialChangesAtDecision, []);
});

test('screen: after pulling back, Decide offers a new Proposal for the next level; nothing is restored by itself', () => {
  const [s0, id] = decidedFirm();
  setPeople(people(s0));
  const back = authorize(setRationale(selectDecision(s0, id, 'restrict'), id, 'A wrong deadline reached a client; back to suggestions.'), id, { by: CARA });
  const page = String(capabilityView({ ...back, actingAs: ANA }, id, new URLSearchParams('tab=decide')));
  assert.match(page, /Decision recorded: Reduce autonomy one level, to Recommend/);
  assert.match(page, /Getting authority back is never automatic: it starts with a new Proposal, one level at a time\./);
  assert.match(page, /data-action="propose-authority" data-capability="[^"]+" data-level="2">Propose: restore toward Level 2<\/button>/);
});

// ---------------------------------------------------------------------------
// Pause, Restore, Retire (Paige, 2026-10-19, Q4–Q6) and no new blocks (Q9)
// ---------------------------------------------------------------------------

import { setPauseReviewDate, retireCapability, RETIRED_REASON, restorationContext, openAuthorityProposal, authorityProposals } from '../src/store/index.js';
import { optionLabel } from '../src/views/cap-history.js';

const paused = () => {
  const [s0, id] = decidedFirm();
  let s = selectDecision(s0, id, 'suspend');
  s = setPauseReviewDate(s, id, '2026-11-01');
  s = authorize(setRationale(s, id, 'A wrong deadline reached a client; pausing until we know why.'), id, { by: CARA });
  return [s, id];
};

test('1. Pause records the Suspend Decision with a reason and an optional review date, and never restores itself', () => {
  const [s0, id] = decidedFirm();
  assert.match(canAuthorize(setRationale(selectDecision(s0, id, 'suspend'), id, ''), id, { by: CARA }).reason, /Say why/, 'a reason is required');
  assert.throws(() => setPauseReviewDate(s0, id, '2026-10-01'), /can't be before today/);
  assert.throws(() => setPauseReviewDate(s0, id, 'next week'), /must be a date/);
  const [s, pid] = paused();
  const rec = s.decisionRecords.at(-1);
  assert.deepEqual([rec.option, rec.next.level, rec.plannedReviewDate, rec.authorizedBy], ['suspend', 0, '2026-11-01', CARA]);
  assert.equal(getCapability(s, pid).status, 'suspended');
  assert.equal(optionLabel('suspend'), 'Pause');
  const j = justification(s, pid);
  assert.deepEqual(j.paused, { since: rec.date, plannedReviewDate: '2026-11-01' });
  // The review date passing changes nothing; neither does better evidence.
  let later = advanceToday(s, '2026-12-01');
  later = recordResult(later, pid, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 40, total: 40, kind: 'eval', by: BEN });
  assert.equal(getCapability(later, pid).authority.level, 0);
  assert.equal(later.decisionRecords.length, s.decisionRecords.length, 'no Decision without a person');
  // Without a date, a Pause is just as valid.
  const [f0, fid] = decidedFirm();
  const plain = authorize(setRationale(selectDecision(f0, fid, 'suspend'), fid, 'Pausing over the holidays, no new reminders.'), fid, { by: ANA });
  assert.equal(plain.decisionRecords.at(-1).plannedReviewDate, undefined);
});

test('2. a paused capability comes back only through new Proposals, one level at a time', () => {
  const [s, id] = paused();
  assert.throws(() => proposeAuthority(s, id, 2, { by: ANA }), /one level at a time\. The next level is 1/);
  const p = proposeAuthority(s, id, 1, { by: ANA });
  assert.equal(openAuthorityProposal(p, id).to.level, 1);
  setPeople(people(s));
  assert.match(String(capabilityView({ ...s, actingAs: ANA }, id, new URLSearchParams('tab=decide'))), />Propose Level 1: restoring toward Level 2<\/button>/);
  assert.equal(getCapability(p, id).authority.level, 0, 'proposing restores nothing');
});

test('3. a restoring Proposal carries why it came down and what changed, without changing any rule', () => {
  const [s0, id] = paused();
  let s = recordResult(s0, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 20, total: 20, kind: 'eval', by: BEN });
  const ctx = restorationContext(s, id);
  assert.deepEqual([ctx.option, ctx.how, ctx.priorAuthority.level, ctx.by], ['suspend', 'paused', 2, 'Cara Lim']);
  assert.match(ctx.reason, /^A wrong deadline reached a client/);
  assert.equal(ctx.newEvidence, 1);
  s = proposeAuthority(s, id, 1, { by: ANA });
  const prop = openAuthorityProposal(s, id);
  assert.equal(prop.restoration.recordId, s0.decisionRecords.at(-1).id, 'frozen with the Proposal');
  setPeople(people(s));
  const page = String(capabilityView({ ...s, actingAs: ANA }, id, new URLSearchParams('tab=decide')));
  assert.match(page, /<h2>Restore toward Level 2, Draft<\/h2>/);
  assert.match(page, /This Proposal is the normal one, one level at a time: nothing is skipped and no rule is relaxed\./);
  assert.match(page, /<dt>Why it came down<\/dt><dd>A wrong deadline reached a client; pausing until we know why\.<\/dd>/);
  assert.match(page, /<dt>New evidence since<\/dt><dd>1 result\.<\/dd>/);
  // Same rules as any expansion: Owner-only, Residual Risk, impact, rollout.
  const ready = setRationale(selectDecision(s, id, 'expand'), id, 'Fixed the date source; back to suggestions first.');
  assert.match(canAuthorize(ready, id, { by: ANA }).reason, /^Expected impact|^Rollout plan|^Residual Risk/);
  assert.match(canAuthorize(ready, id, { by: CARA }).reason, /./);
  // An automatic restriction gives the same context, with its review.
  const auto = simulateBreach(authorize(decideWith(initialState(), RR, 'expand-limits'), RR), RR);
  const reviewed = recordReview(auto, RR, { by: 'daniel', whatHappened: 'Three automatic refunds were wrong.', cause: 'Return status was not checked first.', changes: 'The rules now check the return before refunding.' });
  const rc = restorationContext(reviewed, RR);
  assert.deepEqual([rc.option, rc.priorAuthority.level, rc.review.by], ['auto-restrict', 3, 'Daniel Okafor']);
});

test('4. Retire is the Owner\'s, needs a reason and is final', () => {
  const [s0, id] = decidedFirm();
  assert.throws(() => retireCapability(s0, id, { by: BEN, reason: 'We no longer send these emails at all.' }), /Only the Owner, Ana Ruiz, can retire Draft deadline emails/);
  assert.throws(() => retireCapability(s0, id, { by: ANA, reason: 'Done.' }), /Say why it is being retired/);
  const s = retireCapability(s0, id, { by: ANA, reason: 'We now send deadline reminders from the tax software instead.' });
  const rec = s.decisionRecords.at(-1);
  assert.deepEqual([rec.option, rec.previous.level, rec.next.level, rec.authorizedBy], ['retire', 2, 0, ANA]);
  assert.equal(getCapability(s, id).status, 'retired');
  assert.ok(Object.isFrozen(rec.reviewed));
  assert.throws(() => retireCapability(s, id, { by: ANA, reason: 'Trying again to be certain it is retired.' }), /already retired/);
  for (const option of ['restrict', 'hold', 'expand', 'suspend']) {
    assert.deepEqual(canAuthorize(setRationale(selectDecision(s, id, option), id, 'Trying to change a retired capability.'), id, { by: ANA }), { ok: false, reason: RETIRED_REASON });
  }
  assert.equal(justification(s, id).key, 'retired');
  // An open Proposal closes when it is retired.
  const open = proposeAuthority(authorize(setRationale(selectDecision(s0, id, 'restrict'), id, 'Back to Recommend while we decide what to do.'), id, { by: ANA }), id, 2, { by: ANA });
  const r2 = retireCapability(open, id, { by: ANA, reason: 'We decided to stop using it instead of restoring it.' });
  assert.equal(r2.decisionRecords.at(-1).proposalClosed, 'AP-02');
  assert.equal(capData(r2, id).decision.proposed, null);
});

test('5. Retired is distinct from "Not delegated, by design"', () => {
  const [s0, id] = decidedFirm();
  const s = retireCapability(s0, id, { by: ANA, reason: 'We now send deadline reminders from the tax software instead.' });
  assert.notEqual(getCapability(s, id).status, 'not-delegated');
  assert.equal(optionLabel('retire'), 'Retired');
  assert.equal(optionLabel('not-delegated'), 'Not delegated, by design');
  assert.ok(s.decisionRecords.filter((r) => r.capabilityId === id).some((r) => r.next.level === 2), 'it was used before it was retired');
});

test('6. a retired capability keeps its history and can\'t start a new Proposal', async () => {
  const [s0, id] = decidedFirm();
  const before = s0.decisionRecords.filter((r) => r.capabilityId === id).map((r) => JSON.stringify(r));
  const s = retireCapability(s0, id, { by: ANA, reason: 'We now send deadline reminders from the tax software instead.' });
  assert.deepEqual(s.decisionRecords.filter((r) => r.capabilityId === id).slice(0, -1).map((r) => JSON.stringify(r)), before, 'earlier records unchanged');
  assert.equal(authorityProposals(s, id).length, 1, 'its Proposals stay');
  assert.throws(() => proposeAuthority(s, id, 1, { by: ANA }), /retired/);
  setPeople(people(s));
  const decide = String(capabilityView({ ...s, actingAs: ANA }, id, new URLSearchParams('tab=decide')));
  assert.match(decide, /<p class="decide-big">Retired<\/p>/);
  assert.doesNotMatch(decide, /data-action="propose-authority"/);
  const mon = String(capabilityView({ ...s, actingAs: ANA }, id, new URLSearchParams('tab=monitor')));
  assert.match(mon, /<span class="mon-verdict-title">Retired<\/span>/);
  assert.match(mon, /Nothing changes a retired capability/);
  assert.match(String(capabilityView(s, id, new URLSearchParams('tab=history'))), /Retired/);
  const { capabilitiesView } = await import('../src/views/capabilities.js');
  const list = String(capabilitiesView(s));
  assert.match(list, /<td>Retired: it no longer operates<\/td>\s*<td>Retired<\/td>/);
  assert.doesNotMatch(list, /Observe · Retired/);
});

test('7. Monitor states never add an authorization block', () => {
  const [s0, id] = decidedFirm();
  const holdOk = (s) => canAuthorize(setRationale(selectDecision(s, id, 'hold'), id, 'Keeping Draft while we look into it.'), id, { by: ANA });
  const backOk = (s) => canAuthorize(setRationale(selectDecision(s, id, 'restrict'), id, 'Back to Recommend while we look into it.'), id, { by: CARA });
  const unjustified = recordResult(s0, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 2, total: 10, kind: 'eval', by: BEN });
  const investigate = recordIncident(s0, id, { what: 'An email went out with last year\'s deadline.', severity: 'critical', by: CARA });
  const attention = recordMaterialChange(advanceToday(s0, '2026-10-20'), id, { areas: ['model'], description: 'Moved to a newer model.', by: ANA });
  for (const [s, key] of [[s0, 'supported'], [unjustified, 'unjustified'], [investigate, 'investigate'], [attention, 'attention']]) {
    assert.equal(justification(s, id).key, key);
    assert.deepEqual(holdOk(s), { ok: true }, `hold under ${key}`);
    assert.deepEqual(backOk(s), { ok: true }, `reduce under ${key}`);
  }
});

test('screen: the reduction screen calls Suspend "Pause" and offers an optional review date', () => {
  const [s0, id] = decidedFirm();
  setPeople(people(s0));
  setToday(s0.today);
  const page = String(capabilityView(selectDecision({ ...s0, actingAs: CARA }, id, 'suspend'), id, new URLSearchParams('tab=decide&reduce=1')));
  assert.match(page, /<strong>Pause: all the way to Observe<\/strong> <span class="muted small">It sees requests but does nothing with them\. Recorded as Suspend\.<\/span>/);
  assert.match(page, /Planned review date <span class="muted small">\(optional: a reminder to look again; nothing changes on it\)<\/span>/);
  assert.match(page, /data-action="set-pause-review"/);
  const retire = String(capabilityView({ ...s0, actingAs: CARA }, id, new URLSearchParams('tab=decide&retire=1')));
  assert.match(retire, /Only the Owner, Ana Ruiz, can retire it\. Cara Lim can reduce or pause it instead\./);
  assert.match(retire, /type="submit" disabled>Retire as Cara Lim/);
});

test('screen: a retired capability reads "Retired", never Observe; a paused one still reads "Observe · Paused"', async () => {
  const [s0, id] = decidedFirm();
  const s = retireCapability(s0, id, { by: ANA, reason: 'We now send deadline reminders from the tax software instead.' });
  setPeople(people(s));
  const { capabilitiesView } = await import('../src/views/capabilities.js');
  const { overviewView } = await import('../src/views/overview.js');
  const { decisionRecordView, decisionsListView } = await import('../src/views/decisions.js');
  const { decisionBriefView } = await import('../src/views/brief.js');
  const strip = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const rowOf = (h) => (strip(h).match(/Draft deadline emails[^|]*?(?=Ana Ruiz|$)/) || [''])[0];
  assert.doesNotMatch(rowOf(capabilitiesView(s)), /Observe/, 'Capabilities list');
  assert.match(strip(overviewView(s)), /Retired/);
  const status = strip(capabilityView(s, id, new URLSearchParams('tab=status')));
  assert.match(status, /Retired It no longer operates\. Its history and records are kept\./);
  assert.match(status, /Retired by Ana Ruiz on .*\. We now send deadline reminders from the tax software instead\./);
  assert.doesNotMatch(status, /Level 0|Observe/);
  assert.match(strip(capabilityView(s, id, new URLSearchParams('tab=monitor'))), /Approved Authority Retired ?\. It no longer operates\./);
  const rec = s.decisionRecords.at(-1);
  assert.equal(rec.next.level, 0, 'internally Level 0');
  assert.match(String(decisionRecordView(s, rec.id)), /<span class="fact-label">New<\/span><strong>Retired<\/strong><div class="muted small">No operating authority<\/div>/);
  assert.match(strip(decisionsListView(s)), /Level 2 → Retired Retired/);
  assert.match(String(decisionBriefView(s, rec.id)), /Draft deadline emails: Level 2 → Retired<\/h1>/);
  // Pause is a temporary Level 0: it still reads Observe.
  const p = authorize(setRationale(selectDecision(s0, id, 'suspend'), id, 'Pausing over the holidays, no new reminders.'), id, { by: ANA });
  assert.match(strip(capabilitiesView(p)), /Observe · Paused/);
});
