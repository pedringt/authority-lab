// Product reset, Phase 4 (#144): the Proposal as a frozen review object, and
// the Decision that answers it. A person creates a Proposal; it freezes what
// they saw; later changes never rewrite it; the Decision record freezes what
// the person deciding saw. Nothing here adds an approval rule, a Decision
// outcome, a Residual Risk rule or a block.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initialState, startEmpty, setUpWorkspace, addPerson, addCapability, getCapability, capData, buildWorkspace,
  saveCriteria, saveScenarios, saveStakeholders, mapEvidence, rowMetric, MANUAL_SOURCE, recordResult, recordOutcome, recordJudgment,
  requirementsNow, proposeAuthority, selectDecision, setRationale, setOutcome, setRolloutField, setResidualRisk, canAuthorize, authorize,
  importEvidence, assessRisk, recordMaterialChange, current,
  authorityProposals, openAuthorityProposal, proposalStatus, proposalStaleness, positionsDiffer, proposalGaps,
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
  return setRationale(s, id, 'Every Requirement is met and a person approves every draft.');
}

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
});

test('later evidence and configuration never rewrite a Proposal; staleness comes only from versions and material changes', () => {
  const [s0, id] = firm();
  const s = proposeAuthority(s0, id, 2, { by: ANA });
  const frozen = JSON.stringify(openAuthorityProposal(s, id));
  // A moved result: listed, not counted as staleness (open question Q3).
  let t = recordJudgment(s, id, 'templates', { verdict: 'not-met', rationale: 'Template 3 still has the old date.', by: ANA });
  assert.equal(requirementsNow(t, id).find((r) => r.id === 'templates').result.label, 'Conflicting');
  assert.equal(JSON.stringify(openAuthorityProposal(t, id)), frozen);
  let st = proposalStaleness(t, id);
  assert.equal(st.stale, false);
  assert.deepEqual(st.resultChanges.map((r) => [r.id, r.from, r.to]), [['templates', 'Met', 'Conflicting']]);
  // A new Risk version: stale, with the reason.
  t = assessRisk(t, id, { likelihood: 'Low', scale: 'One case', by: ANA, reason: 'Few emails a week.' });
  st = proposalStaleness(t, id);
  assert.equal(st.stale, true);
  assert.match(st.reasons[0].text, /^Risk changed: v1 when proposed, v2 now\.$/);
  // A material change recorded after it opened: stale too.
  const m = recordMaterialChange(s, id, { areas: ['model'], description: 'Moved to a newer model.', by: ANA });
  assert.deepEqual(proposalStaleness(m, id).reasons.map((r) => r.kind), ['material-change']);
  assert.equal(JSON.stringify(openAuthorityProposal(t, id)), frozen, 'still as proposed');
  // Never a block: canAuthorize doesn't read it.
  const ready = readyToRecord(t, id, ANA);
  assert.deepEqual(canAuthorize(ready, id), { ok: true });
});

test('the Decision record names the Proposal and freezes what the person deciding saw', () => {
  const [s0, id] = firm();
  let s = proposeAuthority(s0, id, 2, { by: ANA });
  s = assessRisk(s, id, { likelihood: 'Low', scale: 'One case', by: ANA, reason: 'Few emails a week.' });
  s = readyToRecord(s, id, ANA);
  s = setResidualRisk(s, id, { level: 'Low', note: 'Every draft is read before sending.' });
  s = authorize(s, id, { by: ANA });
  const rec = s.decisionRecords.at(-1);
  assert.equal(rec.proposalId, 'AP-01');
  assert.equal(proposalStatus(s, id, 'AP-01'), 'decided');
  assert.equal(capData(s, id).decision.proposalId, null);
  assert.match(rec.proposalStale[0].text, /^Risk changed/, 'the record says the Proposal may have been stale');
  assert.deepEqual(rec.reviewed.requirementResults.map((r) => r.label), ['Met', 'Met', 'Met']);
  assert.equal(rec.reviewed.risk.overall, 'Low', 'initial Risk as it stood when decided');
  assert.equal(rec.residualRisk.level, 'Low');
  assert.equal(rec.residualRisk.by, ANA);
  assert.equal(rec.reviewed.positions.length, 2);
  assert.ok(rec.reviewed.boundaries);
  assert.ok(Object.isFrozen(rec.reviewed) && Object.isFrozen(rec.reviewed.requirementResults[0]));
  // Changes after the decision touch neither the record nor the Proposal.
  const before = JSON.stringify(rec);
  const after = recordJudgment(s, id, 'templates', { verdict: 'not-met', rationale: 'Template 3 still has the old date.', by: ANA });
  assert.equal(JSON.stringify(after.decisionRecords.at(-1)), before);
  assert.equal(authorityProposals(after, id).length, 1);
});

test('Residual Risk stays optional, and the existing rules are unchanged', () => {
  const [s0, id] = firm();
  const s = readyToRecord(proposeAuthority(s0, id, 2, { by: ANA }), id, ANA);
  assert.deepEqual(canAuthorize(s, id), { ok: true }, 'no Residual Risk needed');
  // One level at a time, expected impact and rollout still required.
  assert.throws(() => proposeAuthority(s0, id, 3, { by: ANA }), /one level at a time/);
  const noImpact = setOutcome(s, id, 1, 'target', '');
  assert.match(canAuthorize(noImpact, id).reason, /^Expected impact/);
  const noRollout = setRolloutField(s, id, 'reviewDate', '');
  assert.match(canAuthorize(noRollout, id).reason, /^Rollout plan/);
  assert.throws(() => setResidualRisk(s, id, { level: 'Medium' }), /Residual risk must be one of: Low, Moderate, High, Unknown/);
});

test('a reduction closes the open Proposal; a decision opened before Proposals were frozen is shown as such', () => {
  const s = initialState();
  assert.equal(openAuthorityProposal(s, RR), null, 'the seeded pending decision has no snapshot');
  assert.equal(authorityProposals(s, RR).length, 0, 'none is invented for it');
  let r = setRationale(selectDecision(s, RR, 'restrict'), RR, 'Moving back while the high-value cases are reviewed.');
  r = authorize(r, RR, { by: 'maya' });
  const rec = r.decisionRecords.at(-1);
  assert.equal(rec.proposalLegacy, true);
  assert.equal(rec.proposalId, undefined);
  // A fresh Proposal, then a reduction: closed, never decided.
  const [f0, id] = firm();
  let f = proposeAuthority(f0, id, 2, { by: ANA });
  f = authorize(setRationale(selectDecision(f, id, 'suspend'), id, 'Pausing for tax season; nothing changes for clients.'), id, { by: ANA });
  const red = f.decisionRecords.at(-1);
  assert.equal(red.proposalId, 'AP-01', 'the decision answered the Proposal');
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

test('screen: the Decide tab answers "What changes if I approve this?" from the frozen Proposal', () => {
  const [s0, id] = firm();
  setPeople(people(s0));
  setToday(s0.today);
  const before = decide(s0, id);
  assert.match(before, /Proposing freezes what is shown below, as it is now/);
  let s = proposeAuthority(s0, id, 2, { by: ANA });
  let page = decide(s, id);
  assert.match(page, /Proposal AP-01 · proposed by Ana Ruiz on .* · frozen as it was proposed\. A Proposal is not a decision\./);
  assert.match(page, /<h2>What changes if I approve this\?<\/h2>/);
  for (const h of ['Newly permitted', 'Still needs a person', 'Still prohibited']) assert.match(page, new RegExp(`<p class="fact-label">${h}</p>`));
  assert.match(page, /<strong>Positions differ<\/strong>/);
  assert.match(page, /<p class="fact-label">Reviewers<\/p><ul class="plain-list proposal-positions"><li><strong>Ben Okoro<\/strong>/);
  assert.match(page, /name="residual-risk" value="Unknown"/);
  assert.match(page, /Software never scores this or decides whether it's acceptable\./);
  assert.doesNotMatch(page, /This Proposal may be stale/);
  // A new Risk version: the banner says so, with the reason; the button is
  // still governed only by canAuthorize.
  s = assessRisk(s, id, { likelihood: 'Low', scale: 'One case', by: ANA, reason: 'Few emails a week.' });
  page = decide(readyToRecord(s, id, ANA), id);
  assert.match(page, /<strong>This Proposal may be stale<\/strong>/);
  assert.match(page, /<li>Risk changed: v1 when proposed, v2 now\.<\/li>/);
  assert.match(page, /data-action="authorize" data-capability="[^"]+" >Record decision/);
});

test('screen: the seeded demo decision says it predates frozen Proposals', () => {
  const s = initialState();
  setPeople(people(s));
  const page = decide(s, RR);
  assert.match(page, /<strong>This decision was opened before Proposals were frozen<\/strong>/);
  assert.doesNotMatch(page, /Proposal AP-/);
});

test('screen: the record shows the Proposal reviewed, Residual Risk and what was frozen', () => {
  const [s0, id] = firm();
  let s = readyToRecord(proposeAuthority(s0, id, 2, { by: ANA }), id, ANA);
  s = setResidualRisk(s, id, { level: 'Moderate', note: 'Clients might act on a wrong date before we catch it.' });
  s = authorize(s, id, { by: ANA });
  setPeople(people(s));
  const page = String(decisionRecordView(s, s.decisionRecords.at(-1).id));
  assert.match(page, /<dt>Proposal reviewed<\/dt><dd>AP-01, proposed by Ana Ruiz/);
  assert.match(page, /<dt>Residual Risk<\/dt><dd><strong>Moderate<\/strong>: Clients might act on a wrong date before we catch it\./);
  assert.match(page, /<dt>Requirements when decided<\/dt>/);
  assert.match(page, /<dt>Boundaries when decided<\/dt><dd><span class="muted">None written\.<\/span>/);
  assert.match(page, /<dt>Positions when decided<\/dt>/);
  const brief = String(decisionBriefView(s, s.decisionRecords.at(-1).id));
  assert.match(brief, /<li><strong>Residual Risk:<\/strong> Moderate: Clients might act/);
  assert.match(brief, /<li><strong>Proposal reviewed:<\/strong> AP-01<\/li>/);
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
  assert.equal(getCapability(p, ID).authority.level, 1);
});
