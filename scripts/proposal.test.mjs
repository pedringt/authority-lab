// Product reset, Phase 4 (#144): the Proposal as a frozen review object, and
// the Decision that answers it. A person creates a Proposal; it freezes what
// they saw; later changes never rewrite it; the Decision record freezes what
// the person deciding saw, including the evidence behind each result. Paige's
// answers of 2026-10-19: the Owner records an expansion or a hold, anyone
// named records a reduction (Q1); every Reviewer gives a position before an
// expansion (Q2); a stale Proposal blocks an expansion and is replaced (Q3);
// an expansion needs a Residual Risk with a reason (Q4); the reason starts
// empty (Q5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initialState, startEmpty, setUpWorkspace, addPerson, addCapability, getCapability, capData, buildWorkspace,
  saveCriteria, saveScenarios, saveStakeholders, mapEvidence, rowMetric, MANUAL_SOURCE, recordResult, recordOutcome, recordJudgment,
  requirementsNow, proposeAuthority, selectDecision, setRationale, setOutcome, setRolloutField, setResidualRisk, canAuthorize, authorize,
  importEvidence, assessRisk, recordMaterialChange, current,
  authorityProposals, openAuthorityProposal, proposalStatus, proposalStaleness, positionsDiffer, proposalGaps,
  openProposal, approvalEligibility, approveProposal,
  replaceProposal, proposalClosures, reviewerInputMissing, decisionEligibility, uploadEvidence, advanceToday, findWorkspace, setActingAs,
} from '../src/store/index.js';
import { stateWorkspace } from '../src/data/workspaces/state.js';
import { setPeople, setToday } from '../src/ui.js';
import { people } from '../src/store/index.js';
import { capabilityView } from '../src/views/capability.js';
import { decisionRecordView } from '../src/views/decisions.js';
import { decisionBriefView } from '../src/views/brief.js';

const ANA = 'ana-ruiz';
const BEN = 'ben-okoro';
const CARA = 'cara-lim';
const RR = 'refund-recommendation';

// A small firm with only lightweight evidence (the #142 path): results and
// judgments recorded by hand, test outcomes from runs done elsewhere.
function firm() {
  let s = setUpWorkspace(startEmpty(), { workspace: { name: 'Ruiz Tax' }, workflow: { name: 'Client email' }, founder: { name: 'Ana Ruiz', title: 'Partner' } });
  s = addPerson(s, { name: 'Ben Okoro', title: 'Tax lead', team: 'Tax', by: ANA, reason: 'Reviews the drafts.' });
  s = addPerson(s, { name: 'Cara Lim', title: 'Office manager', team: 'Office', by: ANA, reason: 'Hears from clients.' });
  s = addCapability(s, { name: 'Draft deadline emails', summary: 'Drafts emails reminding clients of tax deadlines.', owner: ANA, risk: { impact: 'Medium', reversibility: 'Easy to reverse', exposure: 'Customer-facing' }, today: 'recommends', by: ANA });
  const id = s.capabilities.at(-1).id;
  s = saveStakeholders(s, id, { stakeholders: [{ person: BEN, team: 'Tax', role: 'reviewer', stance: 'expand', position: 'Ready for a Draft pilot.' }, { person: CARA, team: 'Office', stance: 'hold', position: 'Wait until tax season is over.' }], by: ANA });
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
  return [s, id];
}

function readyToRecord(s, id, by) {
  s = selectDecision(s, id, 'expand');
  s = setOutcome(setOutcome(s, id, 0, 'metric', 'Time to send reminders'), id, 0, 'target', 'at least 30% faster');
  s = setOutcome(setOutcome(s, id, 1, 'metric', 'Emails corrected'), id, 1, 'target', 'at most 10%');
  for (const [k, v] of Object.entries({ owner: by, scope: 'Every deadline email this season.', startDate: s.today, feedbackChannel: 'Office inbox', reviewerNotes: 'Read every draft before it goes; nothing is sent without approval.', reviewDate: '2026-12-01' })) s = setRolloutField(s, id, k, v);
  s = setResidualRisk(s, id, { level: 'Moderate', note: 'Every draft is read before it is sent.' });
  return setRationale(s, id, 'Every Requirement is met and a person approves every draft.');
}
const withStance = (s, id, stance) => saveStakeholders(s, id, { stakeholders: current(s, id, 'stakeholders').map((x) => (x.person === BEN ? { ...x, stance, position: stance === 'undecided' ? '' : x.position } : x)), by: ANA });

test('a person creates the Proposal; it is frozen with what they saw, and it is not a Decision', () => {
  const [s, id] = firm();
  assert.equal(authorityProposals(s, id).length, 0, 'nothing proposes on its own');
  assert.throws(() => proposeAuthority(s, id, 2, {}), /./, 'a named, active person proposes');
  const p = proposeAuthority(s, id, 2, { by: ANA });
  const prop = openAuthorityProposal(p, id);
  assert.equal(prop.id, 'AP-01');
  assert.equal(capData(p, id).decision.proposalId, 'AP-01');
  assert.equal(proposalStatus(p, id, 'AP-01'), 'open');
  assert.equal(prop.proposedBy, ANA);
  assert.equal(prop.proposedByAt.name, 'Ana Ruiz');
  assert.deepEqual([prop.from.level, prop.to.level], [1, 2]);
  assert.equal(getCapability(p, id).authority.level, 1, 'evidence never grants authority');
  assert.equal(p.decisionRecords.length, s.decisionRecords.length, 'no Decision is created');
  // What changes if this is approved.
  assert.match(prop.change.newlyPermitted[0], /Prepares the action\. A person approves every one\./);
  assert.match(prop.change.stillNeedsPerson[0], /approves every action before anything happens/);
  assert.ok(Array.isArray(prop.change.prohibited));
  // Results with reasons, coverage, positions, initial Risk, versions.
  assert.deepEqual(prop.requirementResults.map((r) => [r.id, r.label]), [['min-cases', 'Met'], ['accuracy', 'Met'], ['templates', 'Met']]);
  assert.match(prop.requirementResults[2].why, /Ben Okoro .* judged it met/);
  assert.match(prop.coverage.text, /^3 of 3 Requirements have sufficient evidence/);
  assert.deepEqual(prop.positions.map((x) => [x.name, x.role, x.stanceLabel]), [['Ben Okoro', 'Reviewer', 'Expand'], ['Cara Lim', 'Stakeholder', 'Hold']]);
  assert.equal(prop.risk.overall, 'Unknown', 'Likelihood not recorded: Unknown, never Low');
  assert.deepEqual(Object.keys(prop.versions), ['contract', 'criteria', 'requirements', 'risk', 'stakeholders']);
  // Frozen all the way down.
  assert.ok(Object.isFrozen(prop) && Object.isFrozen(prop.requirementResults[0]) && Object.isFrozen(prop.change.newlyPermitted));
  assert.throws(() => { prop.requirementResults[0].label = 'Not met'; }, TypeError);
  // The event says it is not a decision.
  assert.match(p.activity[0].body, /The Proposal \(AP-01\) is frozen as it was proposed\. It is not a decision/);
  // Q5: the reason starts empty; software never writes it.
  assert.equal(capData(p, id).decision.rationale, '');
});


test('Q3: a Proposal goes stale on versions, material changes, moved results and moved coverage, not on more of the same evidence', () => {
  const [s0, id] = firm();
  const s = proposeAuthority(s0, id, 2, { by: ANA });
  const frozen = JSON.stringify(openAuthorityProposal(s, id));
  // More evidence, same results and coverage: not stale.
  const more = recordResult(s, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 20, total: 20, kind: 'eval', by: BEN });
  assert.equal(proposalStaleness(more, id).stale, false);
  // A moved result: stale.
  const moved = recordJudgment(s, id, 'templates', { verdict: 'not-met', rationale: 'Template 3 still has the old date.', by: ANA });
  const st = proposalStaleness(moved, id);
  assert.equal(st.stale, true);
  assert.ok(st.reasons.some((r) => r.kind === 'result' && /"The tax lead has approved the email templates" changed: Met when proposed, Conflicting now\./.test(r.text)));
  assert.equal(JSON.stringify(openAuthorityProposal(moved, id)), frozen, 'never rewritten');
  // Moved coverage: the hand-recorded results age past their freshness window.
  const aged = advanceToday(s, '2027-03-01');
  const cov = proposalStaleness(aged, id);
  assert.ok(cov.reasons.some((r) => r.kind === 'coverage' && /sufficient when proposed, stale now/.test(r.text)), JSON.stringify(cov.reasons));
  // A new Risk version, or a material change: stale.
  const risk = assessRisk(s, id, { likelihood: 'Low', scale: 'One case', by: ANA, reason: 'Few emails a week.' });
  assert.match(proposalStaleness(risk, id).reasons[0].text, /^Risk changed: v1 when proposed, v2 now\.$/);
  const mc = recordMaterialChange(s, id, { areas: ['model'], description: 'Moved to a newer model.', by: ANA });
  assert.deepEqual(proposalStaleness(mc, id).reasons.map((r) => r.kind), ['material-change']);
});

test('Q3: a stale Proposal blocks an expansion, not keeping or pulling back; it is replaced, never refreshed', () => {
  const [s0, id] = firm();
  let s = readyToRecord(proposeAuthority(s0, id, 2, { by: ANA }), id, ANA);
  assert.throws(() => replaceProposal(s, id, { by: ANA }), /still describes current conditions/);
  s = assessRisk(s, id, { likelihood: 'Low', scale: 'One case', by: ANA, reason: 'Few emails a week.' });
  const blocked = canAuthorize(s, id, { by: ANA });
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /^The Proposal is stale: Risk changed: v1 when proposed, v2 now\. Replace it with a new Proposal before expanding\.$/);
  // Keeping the limits (Owner) and pulling back (anyone named) still work.
  assert.deepEqual(canAuthorize(setRationale(selectDecision(s, id, 'hold'), id, 'Holding while the risk is reassessed.'), id, { by: ANA }), { ok: true });
  const back = authorize(setRationale(selectDecision(s, id, 'restrict'), id, 'Pulling back while the risk is reassessed.'), id, { by: CARA });
  assert.equal(getCapability(back, id).authority.level, 0);
  assert.equal(back.decisionRecords.at(-1).proposalStale[0].kind, 'version', 'the record says it was stale');
  // Replace: a new frozen Proposal; the old one kept, marked replaced.
  const old = openAuthorityProposal(s, id);
  const r = replaceProposal(s, id, { by: ANA });
  const fresh = openAuthorityProposal(r, id);
  assert.equal(fresh.id, 'AP-02');
  assert.equal(fresh.replaces, 'AP-01');
  assert.equal(proposalStatus(r, id, 'AP-01'), 'replaced');
  assert.equal(JSON.stringify(authorityProposals(r, id)[0]), JSON.stringify(old), 'the old snapshot is unchanged');
  const closure = proposalClosures(r, id)[0];
  assert.deepEqual([closure.proposalId, closure.reason, closure.replacedBy, closure.by], ['AP-01', 'stale', 'AP-02', ANA]);
  assert.ok(Object.isFrozen(closure));
  assert.match(r.activity[0].title, /^Proposal AP-01 replaced by AP-02: it was stale$/);
  assert.equal(proposalStaleness(r, id).stale, false);
  setPeople(people(r));
  assert.match(String(capabilityView(r, id, new URLSearchParams('tab=history'))), /<strong>AP-01<\/strong>: Level 1 → Level 2, proposed by Ana Ruiz on .* · replaced by AP-02 because it was stale \(Ana Ruiz, /);
  const done = authorize(r, id, { by: ANA });
  assert.equal(done.decisionRecords.at(-1).proposalId, 'AP-02');
  assert.equal(getCapability(done, id).authority.level, 2);
});

test('Q1: the Owner records an expansion or a hold; anyone named records a reduction', () => {
  const [s0, id] = firm();
  let s = readyToRecord(proposeAuthority(s0, id, 2, { by: BEN }), id, ANA);
  assert.match(canAuthorize(s, id, { by: BEN }).reason, /^Only the Owner, Ana Ruiz, can record more authority for Draft deadline emails\./);
  assert.throws(() => authorize(s, id, { by: BEN }), /Only the Owner, Ana Ruiz/);
  assert.throws(() => authorize(setRationale(selectDecision(s, id, 'hold'), id, 'Holding until after tax season.'), id, { by: CARA }), /can record keeping the current limits/);
  // Anyone may propose; the Owner decides.
  assert.equal(authorize(s, id, { by: ANA }).decisionRecords.at(-1).authorizedBy, ANA);
  // A Reviewer or a Stakeholder may pull it back; someone not named may not.
  const dee = addPerson(s, { name: 'Dee Park', title: 'Intern', team: 'Office', by: ANA, reason: 'Helps with filing.' });
  const restrict = setRationale(selectDecision(dee, id, 'restrict'), id, 'Pulling back after a client complaint.');
  assert.equal(authorize(restrict, id, { by: CARA }).decisionRecords.at(-1).authorizedBy, CARA);
  assert.throws(() => authorize(restrict, id, { by: 'dee-park' }), /isn't the Owner or named on Draft deadline emails/);
  assert.equal(decisionEligibility(s, id, BEN, 'suspend').ok, true);
});

test('Q2: every active Reviewer gives a position before an expansion; giving one keeps the Proposal current; disagreement is shown, not a veto', () => {
  const [s0, id] = firm();
  // 1. A Proposal while Ben (Reviewer) has no position.
  let s = readyToRecord(proposeAuthority(withStance(s0, id, 'undecided'), id, 2, { by: ANA }), id, ANA);
  assert.deepEqual(reviewerInputMissing(s, id), [BEN]);
  assert.match(canAuthorize(s, id, { by: ANA }).reason, /^Every Reviewer gives a position before authority expands\. Still waiting for Ben Okoro\.$/);
  // Holding or pulling back doesn't wait for Reviewers.
  assert.deepEqual(canAuthorize(setRationale(selectDecision(s, id, 'hold'), id, 'Holding until Ben has looked.'), id, { by: ANA }), { ok: true });
  // 2. Ben records Hold. 3. The Proposal stays current (Paige, 2026-10-19).
  s = withStance(s, id, 'hold');
  assert.deepEqual(reviewerInputMissing(s, id), []);
  assert.equal(proposalStaleness(s, id).stale, false, 'reviewing is not a change to what was proposed');
  assert.equal(openAuthorityProposal(s, id).positions.find((p) => p.person === BEN).stance, 'undecided', 'the Proposal keeps the positions it was frozen with');
  // 4. The screen says Ben now says Hold, beside the positions when proposed.
  setPeople(people(s));
  const page = decide({ ...s, actingAs: ANA }, id);
  assert.match(page, /<strong>Ben Okoro \(Reviewer\) says Hold<\/strong>/);
  assert.match(page, /Positions have changed since it was proposed; these are the current ones\./);
  assert.doesNotMatch(page, /This Proposal is stale/);
  // 5. The Owner may still expand: a Reviewer's Hold is not a veto.
  assert.deepEqual(canAuthorize(s, id, { by: ANA }), { ok: true });
  const done = authorize(s, id, { by: ANA });
  // 6. The record freezes the Hold, and names the same Proposal.
  const rec = done.decisionRecords.at(-1);
  assert.equal(rec.proposalId, 'AP-01');
  assert.equal(rec.proposalStale, undefined);
  assert.deepEqual(rec.reviewed.positions.filter((p) => p.person === BEN).map((p) => [p.role, p.stance]), [['Reviewer', 'hold']]);
  // A Stakeholder with no position never blocks.
  const cara = saveStakeholders(s0, id, { stakeholders: current(s0, id, 'stakeholders').map((x) => (x.person === CARA ? { ...x, stance: 'undecided', position: '' } : x)), by: ANA });
  assert.deepEqual(reviewerInputMissing(cara, id), []);
});

test('Q3: who is named, or their role, changing after the Proposal makes it stale; a position never does', () => {
  const [s0, id] = firm();
  const s = readyToRecord(proposeAuthority(s0, id, 2, { by: ANA }), id, ANA);
  const list = current(s, id, 'stakeholders');
  // Reasoning and stance changes: still current.
  const reworded = saveStakeholders(s, id, { stakeholders: list.map((x) => (x.person === CARA ? { ...x, stance: 'expand', position: 'Fine after all.' } : x)), by: ANA });
  assert.equal(proposalStaleness(reworded, id).stale, false);
  // After results a membership or role change goes to sign-off; it counts
  // once it is approved and in force.
  const signedOff = (st) => {
    let x = st;
    for (const who of [BEN, CARA]) {
      const q = openProposal(x, id, 'stakeholders');
      if (q && approvalEligibility(x, id, q, who).ok) x = approveProposal(x, id, q.id, { by: who });
    }
    assert.equal(openProposal(x, id, 'stakeholders'), null, 'signed off');
    return x;
  };
  // Cara becomes a Reviewer: a role change, stale.
  const role = signedOff(saveStakeholders(s, id, { stakeholders: list.map((x) => (x.person === CARA ? { ...x, role: 'reviewer' } : x)), by: ANA }));
  const r = proposalStaleness(role, id);
  assert.equal(r.stale, true);
  assert.equal(r.reasons[0].kind, 'people');
  assert.match(r.reasons[0].text, /^Who is named, or as what, changed: Ben Okoro \(Reviewer\), Cara Lim \(Stakeholder\) when proposed; Ben Okoro \(Reviewer\), Cara Lim \(Reviewer\) now\.$/);
  assert.equal(canAuthorize(role, id, { by: ANA }).stale, true);
  // Cara removed: membership change, stale.
  const removed = signedOff(saveStakeholders(s, id, { stakeholders: list.filter((x) => x.person !== CARA), by: ANA }));
  assert.equal(proposalStaleness(removed, id).reasons[0].kind, 'people');
});

test('Q4: an expansion needs a Residual Risk with a reason; Unknown and High are valid; holds and reductions don\'t need one', () => {
  const [s0, id] = firm();
  const s = readyToRecord(proposeAuthority(s0, id, 2, { by: ANA }), id, ANA);
  assert.match(canAuthorize(setResidualRisk(s, id, { level: null }), id, { by: ANA }).reason, /^Residual Risk: choose Low, Moderate, High or Unknown\.$/);
  assert.match(canAuthorize(setResidualRisk(s, id, { level: 'Low', note: 'ok' }), id, { by: ANA }).reason, /^Residual Risk: say why, in a short sentence\.$/);
  for (const level of ['Unknown', 'High']) assert.deepEqual(canAuthorize(setResidualRisk(s, id, { level, note: 'We have not seen enough real use yet.' }), id, { by: ANA }), { ok: true }, level);
  const hold = setRationale(selectDecision(setResidualRisk(s, id, { level: null }), id, 'hold'), id, 'Holding until after tax season.');
  assert.deepEqual(canAuthorize(hold, id, { by: ANA }), { ok: true });
  // The existing rules stay: one level at a time, impact and rollout.
  assert.throws(() => proposeAuthority(s0, id, 3, { by: ANA }), /one level at a time/);
  assert.match(canAuthorize(setOutcome(s, id, 1, 'target', ''), id).reason, /^Expected impact/);
  assert.match(canAuthorize(setRolloutField(s, id, 'reviewDate', ''), id).reason, /^Rollout plan/);
});

test('Q5: no software-written reason; seeded demo wording is labelled, and says so on the record if left', () => {
  const [s0, id] = firm();
  const p = proposeAuthority(s0, id, 2, { by: ANA });
  assert.equal(capData(p, id).decision.rationale, '');
  assert.match(canAuthorize(selectDecision(p, id, 'hold'), id, { by: ANA }).reason, /Say why/);
  // Northstar's seeded decision keeps its demo wording, labelled.
  const demo = initialState();
  assert.equal(capData(demo, RR).decision.rationalePrefilled, true);
  const left = authorize(selectDecision(demo, RR, 'restrict'), RR, { by: 'maya' });
  assert.equal(left.decisionRecords.at(-1).rationalePrefilled, true);
  const edited = authorize(setRationale(selectDecision(demo, RR, 'restrict'), RR, 'Pulling back until high-value cases are tested.'), RR, { by: 'maya' });
  assert.equal(edited.decisionRecords.at(-1).rationalePrefilled, undefined);
  // After a decision the reason box is empty again.
  assert.equal(capData(edited, RR).decision.rationale, '');
});

const CSV = 'case,outcome,date\n' + Array.from({ length: 10 }, (_, i) => `${i + 1},${i === 3 ? 'fail' : 'pass'},2026-10-06`).join('\n') + '\n';

test('the Decision record freezes which evidence produced each result, with no integrations at all', () => {
  const [s0, id] = firm();
  // A second compatible result (combined) and an upload.
  let s = recordResult(s0, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 10, total: 10, kind: 'eval', by: ANA });
  s = uploadEvidence(s, id, { rowKind: 'requirement', rowId: 'accuracy', fileName: 'week1.csv', content: CSV, sourceLabel: 'Weekly review sheet', kind: 'eval', by: BEN });
  s = readyToRecord(proposeAuthority(s, id, 2, { by: ANA }), id, ANA);
  s = authorize(s, id, { by: ANA });
  const rec = s.decisionRecords.at(-1);
  assert.deepEqual(rec.evidenceSnapshot, [], 'the old summary has nothing for evidence recorded by hand');
  const ev = rec.reviewed.evidence;
  const acc = ev.rows.find((r) => r.id === 'accuracy');
  assert.equal(acc.results.length, 1);
  assert.equal(acc.results[0].itemIds.length, 3, 'every item behind the combined result');
  const items = acc.results[0].itemIds.map((x) => ev.items.find((i) => i.id === x));
  assert.deepEqual(items.map((i) => i.from).sort(), ['manual', 'manual', 'uploaded']);
  assert.deepEqual(items.filter((i) => i.recordedBy).map((i) => i.recordedBy).sort(), ['Ana Ruiz', 'Ben Okoro', 'Ben Okoro']);
  const up = items.find((i) => i.file);
  assert.deepEqual([up.file.name, up.file.importedBy, up.file.perCase, up.file.cases], ['week1.csv', 'Ben Okoro', true, 10]);
  const tpl = ev.rows.find((r) => r.id === 'templates');
  assert.equal(tpl.judgments.length, 1);
  const j = ev.judgments.find((x) => x.id === tpl.judgments[0]);
  assert.deepEqual([j.byName, j.role, j.verdict], ['Ben Okoro', 'reviewer', 'met']);
  assert.ok(Object.isFrozen(ev.items[0]));
  // The frozen Proposal carries the same provenance.
  assert.equal(authorityProposals(s, id)[0].evidence.rows.find((r) => r.id === 'accuracy').results[0].itemIds.length, 3);
});

test('a reduction closes the open Proposal; a decision opened before Proposals were frozen is shown as such', () => {
  const s = initialState();
  assert.equal(openAuthorityProposal(s, RR), null, 'the seeded pending decision has no snapshot');
  assert.equal(authorityProposals(s, RR).length, 0, 'none is invented for it');
  const r = authorize(setRationale(selectDecision(s, RR, 'restrict'), RR, 'Moving back while the high-value cases are reviewed.'), RR, { by: 'maya' });
  assert.equal(r.decisionRecords.at(-1).proposalLegacy, true);
  const [f0, id] = firm();
  let f = proposeAuthority(f0, id, 2, { by: ANA });
  f = authorize(setRationale(selectDecision(f, id, 'suspend'), id, 'Pausing for tax season; nothing changes for clients.'), id, { by: BEN });
  assert.equal(f.decisionRecords.at(-1).proposalId, 'AP-01');
  assert.equal(proposalStatus(f, id, 'AP-01'), 'decided');
});

test('positions that differ are shown as differing; gaps include Unknown Risk', () => {
  assert.equal(positionsDiffer([{ stance: 'expand' }, { stance: 'hold' }]), true);
  assert.equal(positionsDiffer([{ stance: 'expand' }, { stance: 'undecided' }]), false);
  const [s0, id] = firm();
  const prop = openAuthorityProposal(proposeAuthority(s0, id, 2, { by: ANA }), id);
  assert.deepEqual(proposalGaps(prop).map((g) => [g.label, g.result]), [['Overall Risk', 'Unknown']]);
});

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

const decide = (s, id) => String(capabilityView(s, id, new URLSearchParams('tab=decide')));

test('screen: the Decide tab answers "What changes if I approve this?"; a stale Proposal offers a replacement', () => {
  const [s0, id] = firm();
  setPeople(people(s0));
  setToday(s0.today);
  assert.match(decide(s0, id), /Proposing freezes what is shown below, as it is now/);
  let s = { ...proposeAuthority(s0, id, 2, { by: ANA }), actingAs: ANA };
  let page = decide(s, id);
  assert.match(page, /Proposal AP-01 · proposed by Ana Ruiz on .* · frozen as it was proposed\. A Proposal is not a decision\./);
  assert.match(page, /<h2>What changes if I approve this\?<\/h2>/);
  for (const h of ['Newly permitted', 'Still needs a person', 'Still prohibited']) assert.match(page, new RegExp(`<p class="fact-label">${h}</p>`));
  assert.match(page, /<strong>Positions differ<\/strong>/);
  assert.match(page, /name="residual-risk" value="Unknown"/);
  assert.match(page, /\(needed to expand; your judgment\)/);
  assert.match(page, /In your own words: it goes on the record as yours\./);
  s = assessRisk(readyToRecord(s, id, ANA), id, { likelihood: 'Low', scale: 'One case', by: ANA, reason: 'Few emails a week.' });
  page = decide(s, id);
  assert.match(page, /<strong>This Proposal is stale<\/strong>/);
  assert.match(page, /<li>Risk changed: v1 when proposed, v2 now\.<\/li>/);
  assert.match(page, /data-action="replace-proposal" data-capability="[^"]+">Replace with a new Proposal<\/button>/);
  assert.match(page, /Proposal is current<\/strong><span class="muted small">: it is stale/);
  assert.match(page, /data-action="authorize"[^>]*disabled/);
  page = decide(replaceProposal(s, id, { by: ANA }), id);
  assert.match(page, /Proposal AP-02 · .* It replaces AP-01, which was stale\./);
  assert.doesNotMatch(page, /data-action="authorize"[^>]*disabled/);
});

test('screen: a Reviewer with no position is waited for; a Reviewer against is shown plainly', () => {
  const [s0, id] = firm();
  setPeople(people(s0));
  let page = decide({ ...readyToRecord(proposeAuthority(withStance(s0, id, 'undecided'), id, 2, { by: ANA }), id, ANA), actingAs: ANA }, id);
  assert.match(page, /<strong>Waiting for Ben Okoro \(Reviewer\)<\/strong>/);
  assert.match(page, /href="#\/capabilities\/[^"]+\/stakeholders\/edit">Record a position<\/a>/);
  page = decide({ ...readyToRecord(proposeAuthority(withStance(s0, id, 'hold'), id, 2, { by: ANA }), id, ANA), actingAs: ANA }, id);
  assert.match(page, /<strong>Ben Okoro \(Reviewer\) says Hold<\/strong>/);
  assert.doesNotMatch(page, /data-action="authorize"[^>]*disabled/, 'not a veto');
});

test('screen: the seeded demo decision says it predates frozen Proposals, and its reason is labelled', () => {
  const s = initialState();
  setPeople(people(s));
  const page = decide(s, RR);
  assert.match(page, /<strong>This decision was opened before Proposals were frozen<\/strong>/);
  assert.match(page, /<strong>Prefilled for the demo\.<\/strong> Write your own reason/);
});

test('screen: a hand-recorded Decision shows the evidence it rested on; the brief never calls a real workspace a demo', () => {
  const [s0, id] = firm();
  let s = readyToRecord(proposeAuthority(s0, id, 2, { by: ANA }), id, ANA);
  s = authorize(s, id, { by: ANA });
  setPeople(people(s));
  const recId = s.decisionRecords.at(-1).id;
  const page = String(decisionRecordView(s, recId));
  assert.match(page, /<dt>Evidence at the time<\/dt><dd><ul class="plain-list provenance"><li><strong>Minimum 20 cases<\/strong>/);
  assert.match(page, /Overall accuracy ≥ 90%: 95% \(19 of 20\), recorded by Ben Okoro, /);
  assert.match(page, /Ben Okoro \(reviewer\) judged it met on [0-9-]+: All four templates approved on Oct 14\./);
  assert.doesNotMatch(page, /No evidence was recorded/);
  assert.match(page, /<dt>Proposal reviewed<\/dt><dd>AP-01, proposed by Ana Ruiz/);
  assert.match(page, /<dt>Residual Risk<\/dt><dd><strong>Moderate<\/strong>: Every draft is read before it is sent\./);
  const brief = String(decisionBriefView(s, recId));
  assert.match(brief, /Authority Lab · Ruiz Tax\.<\/p>/);
  assert.doesNotMatch(brief, /fictional demo data/);
  assert.match(brief, /<li>Overall accuracy ≥ 90%: /);
  assert.match(brief, /<li><strong>Proposal reviewed:<\/strong> AP-01<\/li>/);
  const demo = authorize(selectDecision(initialState(), RR, 'restrict'), RR, { by: 'maya' });
  assert.match(String(decisionBriefView(demo, demo.decisionRecords.at(-1).id)), /fictional demo data/);
  // History lists the Proposals and what became of them.
  assert.match(String(capabilityView(s, id, new URLSearchParams('tab=history'))), /<strong>AP-01<\/strong>: Level 1 → Level 2, proposed by Ana Ruiz on .* · decided/);
});

test('State: 5 of 5 evidence supports considering Draft, but no Proposal or Decision is assumed', () => {
  const run = JSON.parse(readFileSync(new URL('../src/data/external-evidence/state-eval-review-gh-38411808397-1.json', import.meta.url), 'utf8'));
  const ID = 'interpret-incoming-project-evidence';
  const s = importEvidence(buildWorkspace(stateWorkspace, { today: '2026-10-13' }), run);
  assert.equal(capData(s, ID).decision.proposed, null);
  assert.equal(authorityProposals(s, ID).length, 0);
  assert.equal(s.decisionRecords.filter((r) => r.capabilityId === ID).length, 1, 'only the starting record');
  const p = proposeAuthority(s, ID, 2, { by: 'paige-edrington' });
  const prop = openAuthorityProposal(p, ID);
  assert.equal(prop.readiness.met, 5);
  assert.equal(prop.externalEvidence[0].runs[0].id, run.id, 'imported evidence provenance is frozen with it');
  assert.ok(prop.evidence.rows.every((r) => r.results.every((x) => x.itemIds.length)), 'each imported result names its items');
  assert.equal(getCapability(p, ID).authority.level, 1);
});
