// Guardrail pass before Phase 6 (#157): measurement-aware result entry;
// links Authority Lab made are provisional; formal Risk approvals are an
// optional policy; a 20-case real-use floor for Level 3+; a warning when no
// quality Requirement is hard; an accurate goalpost warning; Written vs
// Enforced on each Boundary line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideWith } from './helpers.mjs';
import {
  initialState, startEmpty, setUpWorkspace, addPerson, addCapability, capData, current, currentVersion, getCapability,
  saveCriteria, saveStakeholders, mapEvidence, recordResult, recordManualEvidence, MANUAL_SOURCE, rowMetric, targetsNow, criteriaLocked,
  proposeAmendment, openProposal, approveProposal, proposeAuthority, setRationale, setOutcome, setRolloutField, setResidualRisk, selectDecision, authorize,
  formalRiskApprovals, setFormalRiskApprovals, coverageWarning, reviewEligibility, realUseEvidence, realUseCases, readyToPropose,
  noHardQuality, amendmentsAfterEvidenceFor, buildWorkspace, people, provisionalLink, signoffRequirements, requirementsNow,
} from '../src/store/index.js';
const readinessRow = (s, id, rid) => requirementsNow(s, id).find((r) => r.id === rid);
import { stateWorkspace } from '../src/data/workspaces/state.js';
import { setPeople, setToday } from '../src/ui.js';
import { capabilityView } from '../src/views/capability.js';

const ANA = 'ana-ruiz';
const BEN = 'ben-okoro';
const CARA = 'cara-lim';
const strip = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');

// Ana's firm. `exposure` decides whether changes are consequential.
function firm({ exposure = 'Customer-facing', reviewer = true, target = '≤ 5% of drafts' } = {}) {
  let s = setUpWorkspace(startEmpty(), { workspace: { name: 'Ruiz Tax' }, workflow: { name: 'Client email' }, founder: { name: 'Ana Ruiz', title: 'Partner' } });
  s = addPerson(s, { name: 'Ben Okoro', title: 'Tax lead', team: 'Tax', by: ANA, reason: 'Reviews the drafts.' });
  s = addPerson(s, { name: 'Cara Lim', title: 'Office manager', team: 'Office', by: ANA, reason: 'Hears from clients.' });
  s = addCapability(s, { name: 'Draft deadline emails', summary: 'Drafts emails reminding clients of tax deadlines.', owner: ANA, risk: { impact: 'Medium', reversibility: 'Easy to reverse', exposure }, today: 'recommends', by: ANA });
  const id = s.capabilities.at(-1).id;
  if (reviewer) s = saveStakeholders(s, id, { stakeholders: [{ person: BEN, team: 'Tax', role: 'reviewer', stance: 'expand', position: 'Ready.' }], by: ANA });
  s = saveCriteria(s, id, {
    criteria: [{ id: 'errors', name: 'Factual errors', target, requirement: 'facts' }],
    requirements: [{ id: 'min-cases', text: 'Minimum 20 cases', kind: 'coverage' }, { id: 'facts', text: 'Drafts are factually accurate', judgment: 'evidence' }],
    by: ANA,
    reason: 'Our own bar, written by us.',
  });
  return [s, id];
}
const target = (s, id) => targetsNow(s, id).find((t) => t.id === 'errors');

test('result entry reads the bar: 1 factual error in 25 drafts against "≤ 5%" is 4%, Met', () => {
  let [s, id] = firm();
  s = recordResult(s, id, { rowKind: 'target', rowId: 'errors', type: 'rate', passed: '1', total: '25', kind: 'eval', by: BEN });
  const m = current(s, id, 'criteria')[0].measure;
  assert.deepEqual([m.stat, m.op, m.value, m.auto], ['fail-rate', '<=', 5, true], 'an "at most" share counts the problem');
  assert.deepEqual([target(s, id).status, target(s, id).current], ['pass', '4% across 25 cases']);
  // Counting the other way gives the same answer when the person says so.
  let [t, tid] = firm();
  t = recordResult(t, tid, { rowKind: 'target', rowId: 'errors', type: 'rate', passed: '24', total: '25', kind: 'eval', counts: 'passed', by: BEN });
  assert.deepEqual([target(t, tid).status, target(t, tid).current], ['pass', '4% across 25 cases']);
  // An "at least" bar counts passes.
  let [u, uid] = firm({ target: '≥ 90% of drafts correct' });
  u = recordResult(u, uid, { rowKind: 'target', rowId: 'errors', type: 'rate', passed: '19', total: '20', kind: 'eval', by: BEN });
  assert.equal(current(u, uid, 'criteria')[0].measure.stat, 'rate');
  assert.equal(target(u, uid).status, 'pass');
  // More problems than cases is refused.
  assert.throws(() => recordResult(firm()[0], id, { rowKind: 'target', rowId: 'errors', type: 'rate', passed: '30', total: '25', kind: 'eval', by: BEN }), /between 0 and the number of cases/);
});

test('result entry asks when the bar does not say which way a share counts', () => {
  const [s, id] = firm({ target: '= 10% of drafts flagged' });
  assert.throws(() => recordResult(s, id, { rowKind: 'target', rowId: 'errors', type: 'rate', passed: '2', total: '20', kind: 'eval', by: BEN }), /doesn't say whether its share counts problems or passes/);
  const t = recordResult(s, id, { rowKind: 'target', rowId: 'errors', type: 'rate', passed: '2', total: '20', kind: 'eval', counts: 'problem', by: BEN });
  assert.equal(current(t, id, 'criteria')[0].measure.stat, 'fail-rate');
});

test('a link Authority Lab made is provisional: correcting it after results is recorded, even for a consequential capability with no one else', () => {
  let [s, id] = firm({ exposure: 'Financial / consequential', reviewer: false, target: '≥ 95% of drafts' });
  s = recordResult(s, id, { rowKind: 'target', rowId: 'errors', type: 'rate', passed: '1', total: '25', kind: 'eval', counts: 'passed', by: ANA });
  assert.equal(criteriaLocked(s, id), true);
  assert.equal(provisionalLink(s, id, 'criteria', 'errors'), true);
  s = mapEvidence(s, id, { rowKind: 'target', rowId: 'errors', measure: { source: MANUAL_SOURCE, metric: rowMetric('target', 'errors'), stat: 'fail-rate' }, by: ANA, reason: 'It counts drafts with errors.' });
  assert.equal(openProposal(s, id, 'criteria'), null, 'no approval for fixing a software mistake');
  assert.deepEqual(currentVersion(s, id, 'criteria').changes, ['Corrects the link Authority Lab made for "Factual errors".']);
  assert.equal(current(s, id, 'criteria')[0].measure.auto, undefined, 'now a person\'s choice');
  assert.equal(provisionalLink(s, id, 'criteria', 'errors'), false);
  // Changing it again is a change to a link a person chose: governed.
  assert.throws(() => mapEvidence(s, id, { rowKind: 'target', rowId: 'errors', measure: { source: MANUAL_SOURCE, metric: rowMetric('target', 'errors'), stat: 'rate' }, by: ANA, reason: 'Back to passes.' }), /Name a Reviewer/);
});

test('a provisional link stops being provisional once an expansion Decision relied on it', () => {
  let [s, id] = firm();
  s = mapEvidence(s, id, { rowKind: 'requirement', rowId: 'min-cases', measure: { source: MANUAL_SOURCE, metric: rowMetric('target', 'errors'), stat: 'sample' }, by: ANA });
  s = recordResult(s, id, { rowKind: 'target', rowId: 'errors', type: 'rate', passed: '1', total: '25', kind: 'eval', by: BEN });
  s = proposeAuthority(s, id, 2, { by: ANA });
  s = selectDecision(s, id, 'expand');
  s = setOutcome(setOutcome(s, id, 0, 'metric', 'Time to send'), id, 0, 'target', 'at least 30% faster');
  s = setOutcome(setOutcome(s, id, 1, 'metric', 'Emails corrected'), id, 1, 'target', 'at most 10%');
  for (const [k, v] of Object.entries({ owner: ANA, scope: 'Every deadline email.', startDate: s.today, feedbackChannel: 'Office inbox', reviewerNotes: 'Read every draft before it goes out.', reviewDate: '2026-12-01' })) s = setRolloutField(s, id, k, v);
  s = authorize(setRationale(setResidualRisk(s, id, { level: 'Moderate', note: 'A person reads every one.' }), id, 'Every hard Requirement is met.'), id, { by: ANA });
  assert.equal(provisionalLink(s, id, 'criteria', 'errors'), false);
  const p = mapEvidence(s, id, { rowKind: 'target', rowId: 'errors', measure: { source: MANUAL_SOURCE, metric: rowMetric('target', 'errors'), stat: 'rate' }, by: ANA, reason: 'Count passes instead.' });
  assert.ok(openProposal(p, id, 'criteria'), 'after a Decision relied on it, changing it is governed');
});

test('formal Risk approvals are an optional policy: a consequential change needs a named Reviewer who acknowledges the risk', () => {
  let [s, id] = firm({ exposure: 'Financial / consequential' });
  assert.equal(formalRiskApprovals(s), false, 'real workspaces start without it');
  assert.equal(formalRiskApprovals(initialState()), true, 'the Northstar demo has Risk approvers');
  assert.deepEqual(signoffRequirements(s, id, ANA), { approvers: 1, riskRequired: false, ownerOnly: false, reviewerRequired: true, riskAck: true });
  assert.equal(coverageWarning(s, id), null, 'no "add a second Risk approver" for a small firm');
  s = recordResult(s, id, { rowKind: 'target', rowId: 'errors', type: 'rate', passed: '1', total: '25', kind: 'eval', by: BEN });
  const loosen = { criteria: current(s, id, 'criteria').map((c) => ({ ...c, target: '≤ 10% of drafts' })), requirements: current(s, id, 'requirements') };
  s = proposeAmendment(s, id, 'criteria', { value: loosen, by: ANA, reason: 'Five percent is out of reach this season.' });
  const p = openProposal(s, id, 'criteria');
  assert.deepEqual(p.eligible, [BEN], 'a Reviewer, never Cara, who is only a person in the workspace');
  assert.throws(() => approveProposal(s, id, p.id, { by: BEN }), /confirm that you've considered what could go wrong/);
  s = approveProposal(s, id, p.id, { by: BEN, riskAck: true });
  assert.equal(current(s, id, 'criteria')[0].target, '≤ 10% of drafts');
  assert.equal(capData(s, id).proposals.at(-1).approvals[0].riskAck, true);
  // With no Reviewer named, it says what to do.
  let [t, tid] = firm({ exposure: 'Financial / consequential', reviewer: false });
  t = recordResult(t, tid, { rowKind: 'target', rowId: 'errors', type: 'rate', passed: '1', total: '25', kind: 'eval', by: ANA });
  assert.throws(() => proposeAmendment(t, tid, 'criteria', { value: loosen, by: ANA, reason: 'Five percent is out of reach this season.' }), /a named Reviewer must approve it and acknowledge the risk.*Name a Reviewer for Draft deadline emails first/);
});

test('a workspace admin can turn formal Risk approvals on, with a reason; then the two-approver rule applies', () => {
  let [s, id] = firm({ exposure: 'Financial / consequential' });
  assert.throws(() => setFormalRiskApprovals(s, { on: true, by: BEN, reason: 'We have a compliance lead.' }), /isn't a workspace admin/);
  assert.throws(() => setFormalRiskApprovals(s, { on: true, by: ANA, reason: 'x' }), /Say why/);
  s = setFormalRiskApprovals(s, { on: true, by: ANA, reason: 'We hired a compliance lead.' });
  assert.equal(formalRiskApprovals(s), true);
  assert.deepEqual(signoffRequirements(s, id, ANA), { approvers: 2, riskRequired: true, ownerOnly: false });
  assert.equal(s.activity[0].title, 'Formal Risk approvals turned on');
});

test('without formal Risk approvals, a named Reviewer can record a safety review', () => {
  const [s, id] = firm({ exposure: 'Financial / consequential' });
  assert.deepEqual(reviewEligibility(s, id, BEN), { ok: true, reason: null });
  assert.match(reviewEligibility(s, id, CARA).reason, /Only the owner \(Ana Ruiz\) or a named Reviewer/);
});

test('Level 3 needs at least 20 real-use cases; results for one metric add up, different metrics don\'t', () => {
  let [s, id] = firm();
  const prod = (x, metric, n) => recordManualEvidence(x, id, { by: BEN, label: metric, metric, kind: 'production', type: 'rate', passed: String(n), total: String(n) });
  assert.equal(realUseEvidence(prod(s, 'sent', 19), id), false);
  assert.equal(realUseCases(prod(s, 'sent', 19), id), 19);
  assert.equal(realUseEvidence(prod(s, 'sent', 20), id), true);
  assert.equal(realUseEvidence(prod(prod(s, 'sent', 10), 'sent', 10), id), true, 'two batches of the same measure');
  assert.equal(realUseEvidence(prod(prod(s, 'sent', 15), 'other', 15), id), false, 'different metrics may share cases');
  assert.equal(realUseEvidence({ ...s, capabilityData: { ...s.capabilityData, [id]: { ...capData(s, id), pilot: { cases: 25 } } } }, id), true, 'a pilot of 25 cases');
});

test('a warning, never a block, when no quality Requirement is hard', () => {
  let [s, id] = firm();
  assert.equal(noHardQuality(s, id), false);
  s = saveCriteria(s, id, { criteria: current(s, id, 'criteria'), requirements: current(s, id, 'requirements').map((r) => (r.id === 'facts' ? { ...r, consideration: true } : r)), by: ANA, reason: 'Just counting cases for now.' });
  assert.equal(noHardQuality(s, id), true);
  setPeople(people(s)); setToday(s.today);
  assert.match(strip(capabilityView({ ...s, actingAs: ANA }, id, new URLSearchParams('tab=decide'))), /No hard quality Requirement is currently required for expansion\. Only how many cases there are has to be met\./);
});

test('linking evidence after results is not flagged as "changed after results"; tightening still is', () => {
  let [s, id] = firm();
  s = recordResult(s, id, { rowKind: 'target', rowId: 'errors', type: 'rate', passed: '1', total: '25', kind: 'eval', by: BEN });
  s = mapEvidence(s, id, { rowKind: 'requirement', rowId: 'min-cases', measure: { source: MANUAL_SOURCE, metric: rowMetric('target', 'errors'), stat: 'sample' }, by: ANA, reason: 'Count the drafts Ben checks.' });
  assert.equal(currentVersion(s, id, 'requirements').linksOnly, true);
  const rec = (x) => ({ capabilityId: id, versions: { criteria: currentVersion(x, id, 'criteria').version, requirements: currentVersion(x, id, 'requirements').version } });
  assert.deepEqual(amendmentsAfterEvidenceFor(s, rec(s)), []);
  setPeople(people(s)); setToday(s.today);
  assert.doesNotMatch(strip(capabilityView({ ...s, actingAs: ANA }, id, new URLSearchParams('tab=decide'))), /Targets changed after results were seen/);
  const t = proposeAmendment(s, id, 'criteria', { value: { criteria: current(s, id, 'criteria').map((c) => ({ ...c, target: '≤ 3% of drafts' })), requirements: current(s, id, 'requirements') }, by: ANA, reason: 'Raise the bar for errors.' });
  assert.equal(amendmentsAfterEvidenceFor(t, rec(t)).length > 0, true);
});

test('each Boundary line on Status says Written or Enforced', () => {
  const st = buildWorkspace(stateWorkspace, { today: '2026-10-20' });
  setPeople(people(st)); setToday(st.today);
  const h = strip(capabilityView(st, 'interpret-incoming-project-evidence', new URLSearchParams('tab=status&show=rules')));
  assert.match(h, /Bypass Review\. Written Boundary/);
  assert.doesNotMatch(h, /Enforced Boundary/);
  const n = initialState();
  setPeople(people(n)); setToday(n.today);
  assert.match(strip(capabilityView(n, 'refund-recommendation', new URLSearchParams('tab=status&show=rules'))), /Enforced Boundary/);
});

test('screens: the result form says what "How many" counts; Configure offers "Record this correction"; approving asks for the risk acknowledgment', async () => {
  const { recordEvidenceView } = await import('../src/views/sources.js');
  const { configureEvidenceView } = await import('../src/views/configure.js');
  const { proposalView } = await import('../src/views/proposals.js');
  let [s, id] = firm({ exposure: 'Financial / consequential' });
  setPeople(people(s)); setToday(s.today);
  const form = String(recordEvidenceView({ ...s, actingAs: BEN }, id, new URLSearchParams('row=target:errors')));
  assert.match(form, /<input type="radio" name="counts" value="problem" checked> cases with the problem/);
  assert.match(strip(form), /Set from the bar: ≤ 5% of drafts\./);
  assert.match(form, /value="rate" checked> A share: some of a number of cases/, 'never "passed" when the row counts problems');
  s = recordResult(s, id, { rowKind: 'target', rowId: 'errors', type: 'rate', passed: '1', total: '25', kind: 'eval', by: BEN });
  const cfg = strip(configureEvidenceView({ ...s, actingAs: ANA }, id, new URLSearchParams('row=target:errors')));
  assert.match(cfg, /Why \(Authority Lab made this link: correcting it is recorded with your name, no approval needed\)/);
  assert.match(cfg, /Record this correction/);
  s = proposeAmendment(s, id, 'criteria', { value: { criteria: current(s, id, 'criteria').map((c) => ({ ...c, target: '≤ 10% of drafts' })), requirements: current(s, id, 'requirements') }, by: ANA, reason: 'Five percent is out of reach this season.' });
  const pv = String(proposalView({ ...s, actingAs: BEN }, id, openProposal(s, id, 'criteria').id, new URLSearchParams()));
  assert.match(strip(pv), /I've considered what could go wrong with this change, and I accept the risk\./);
});

test('#159: a case count adds test and real-use cases up; it is never Conflicting', () => {
  let [s, id] = firm();
  s = mapEvidence(s, id, { rowKind: 'requirement', rowId: 'min-cases', measure: { source: MANUAL_SOURCE, metric: rowMetric('target', 'errors'), stat: 'sample' }, by: ANA });
  s = recordResult(s, id, { rowKind: 'target', rowId: 'errors', type: 'rate', passed: '1', total: '25', kind: 'eval', by: BEN });
  s = recordResult(s, id, { rowKind: 'target', rowId: 'errors', type: 'rate', passed: '0', total: '2', kind: 'production', by: BEN });
  const min = (x) => readinessRow(x, id, 'min-cases');
  assert.equal(min(s).result.status, 'met', 'not Conflicting');
  assert.equal(min(s).current, '27 (25 from test cases, 2 from real use)');
  // Below the minimum across all sources, it is short of evidence, not a conflict.
  let [t, tid] = firm();
  t = mapEvidence(t, tid, { rowKind: 'requirement', rowId: 'min-cases', measure: { source: MANUAL_SOURCE, metric: rowMetric('target', 'errors'), stat: 'sample' }, by: ANA });
  t = recordResult(t, tid, { rowKind: 'target', rowId: 'errors', type: 'rate', passed: '0', total: '10', kind: 'eval', by: BEN });
  t = recordResult(t, tid, { rowKind: 'target', rowId: 'errors', type: 'rate', passed: '0', total: '5', kind: 'production', by: BEN });
  assert.equal(readinessRow(t, tid, 'min-cases').result.status, 'not-enough');
});

test('#159: the no-quality warning shows right after a Decision, where the next Proposal is offered', () => {
  let [s, id] = firm();
  s = saveCriteria(s, id, { criteria: current(s, id, 'criteria'), requirements: current(s, id, 'requirements').map((r) => (r.id === 'facts' ? { ...r, consideration: true } : r)), by: ANA, reason: 'Just counting cases for now.' });
  s = mapEvidence(s, id, { rowKind: 'requirement', rowId: 'min-cases', measure: { source: MANUAL_SOURCE, metric: rowMetric('target', 'errors'), stat: 'sample' }, by: ANA });
  s = recordResult(s, id, { rowKind: 'target', rowId: 'errors', type: 'rate', passed: '1', total: '25', kind: 'eval', by: BEN });
  s = saveStakeholders(s, id, { stakeholders: current(s, id, 'stakeholders').map((p) => ({ ...p, position: 'Ready for a pilot.' })), by: BEN });
  s = proposeAuthority(s, id, 2, { by: ANA });
  s = selectDecision(s, id, 'expand');
  s = setOutcome(setOutcome(s, id, 0, 'metric', 'Time to send'), id, 0, 'target', 'at least 30% faster');
  s = setOutcome(setOutcome(s, id, 1, 'metric', 'Emails corrected'), id, 1, 'target', 'at most 10%');
  for (const [k, v] of Object.entries({ owner: ANA, scope: 'Every deadline email.', startDate: s.today, feedbackChannel: 'Office inbox', reviewerNotes: 'Read every draft before it goes out.', reviewDate: '2026-12-01' })) s = setRolloutField(s, id, k, v);
  s = authorize(setRationale(setResidualRisk(s, id, { level: 'Moderate', note: 'A person reads every one.' }), id, 'Every hard Requirement is met; a person reads each email.'), id, { by: ANA });
  setPeople(people(s)); setToday(s.today);
  const h = strip(capabilityView({ ...s, actingAs: ANA }, id, new URLSearchParams('tab=decide')));
  assert.match(h, /Decision recorded: Expand autonomy, to Draft/);
  assert.match(h, /No hard quality Requirement is currently required for expansion\./);
});
