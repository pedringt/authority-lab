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
  assert.deepEqual(Object.keys(JUSTIFICATION_STATES), ['supported', 'attention', 'investigate', 'unjustified', 'restricted']);
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
  assert.equal(j0.key, 'supported');
  assert.equal(j0.legacy, true);
  assert.equal(j0.record.option, 'define');
  const run = JSON.parse(readFileSync(new URL('../src/data/external-evidence/state-eval-review-gh-38411808397-1.json', import.meta.url), 'utf8'));
  let s = importEvidence(s0, run);
  assert.equal(justification(s, ID).key, 'supported');
  s = advanceToday(s, '2026-10-21');
  s = recordMaterialChange(s, ID, { areas: ['model'], description: 'State moved its interpretation to a newer model.', effectiveOn: '2026-10-21', by: 'paige-edrington' });
  const j = justification(s, ID);
  assert.equal(j.key, 'attention');
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
  assert.match(page, /href="#\/capabilities\/[^"]+\?tab=decide&reduce=1">Pull back authority<\/a>/);
  assert.match(page, /Restore or expand<\/dt><dd>Never automatic/);
  assert.match(page, /Pause or retire<\/dt><dd class="muted">Not built yet/);
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
  assert.match(page, /<h2>Pull back authority<\/h2>/);
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
  assert.equal(justification(s, ID).key, 'attention');
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
  assert.match(page, /Getting authority back is never automatic: it starts with a new Proposal\./);
  assert.match(page, /data-action="propose-authority" data-capability="[^"]+" data-level="2">Propose a move to Level 2<\/button>/);
});
