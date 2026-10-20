// Remediation 4 (#155): small-team governance (D6, R6). After results,
// changing the decision bar needs sign-off; completing or strengthening it is
// recorded with a named person and a reason, and no approval. The original
// trap: Ana, with Ben as her only Reviewer, couldn't finish configuring how
// an existing bar is measured without recruiting Ben to approve it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startEmpty, setUpWorkspace, addPerson, addCapability, capData, current, currentVersion, versionsInForce,
  saveCriteria, saveStakeholders, mapEvidence, rowMetric, MANUAL_SOURCE, recordResult, recordJudgment, criteriaLocked,
  proposeAmendment, openProposal, approveProposal, proposeAuthority, classifyChange, people, amend,
} from '../src/store/index.js';
import { setPeople, setToday } from '../src/ui.js';
import { proposalView } from '../src/views/proposals.js';

const ANA = 'ana-ruiz';
const BEN = 'ben-okoro';
const CARA = 'cara-lim';
const strip = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');

// Ana's three-person firm. "Minimum 20 cases" has no evidence linked yet
// when the first result comes in, which locks the bar.
function firm() {
  let s = setUpWorkspace(startEmpty(), { workspace: { name: 'Ruiz Tax' }, workflow: { name: 'Client email' }, founder: { name: 'Ana Ruiz', title: 'Partner' } });
  s = addPerson(s, { name: 'Ben Okoro', title: 'Tax lead', team: 'Tax', by: ANA, reason: 'Reviews the drafts.' });
  s = addPerson(s, { name: 'Cara Lim', title: 'Office manager', team: 'Office', by: ANA, reason: 'Hears from clients.' });
  s = addCapability(s, { name: 'Draft deadline emails', summary: 'Drafts emails reminding clients of tax deadlines.', owner: ANA, risk: { impact: 'Medium', reversibility: 'Easy to reverse', exposure: 'Customer-facing' }, today: 'recommends', by: ANA });
  const id = s.capabilities.at(-1).id;
  s = saveStakeholders(s, id, { stakeholders: [{ person: BEN, team: 'Tax', role: 'reviewer', stance: 'expand', position: 'Ready.' }], by: ANA });
  s = saveCriteria(s, id, {
    criteria: [],
    requirements: [
      { id: 'min-cases', text: 'Minimum 20 cases', kind: 'coverage' },
      { id: 'accuracy', text: 'Overall accuracy ≥ 90%', judgment: 'evidence' },
      { id: 'templates', text: 'The tax lead has approved the templates', judgment: 'person' },
      { id: 'tone', text: 'Clients find the tone friendly', judgment: 'person', consideration: true },
    ],
    by: ANA,
    reason: 'Our own bar, written by us.',
  });
  s = mapEvidence(s, id, { rowKind: 'requirement', rowId: 'accuracy', measure: { source: MANUAL_SOURCE, metric: rowMetric('requirement', 'accuracy'), stat: 'rate' }, by: ANA });
  s = recordResult(s, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 19, total: 20, kind: 'eval', by: BEN });
  return [s, id];
}
const reqs = (s, id, fn) => ({ criteria: current(s, id, 'criteria'), requirements: fn(current(s, id, 'requirements')) });
const WHY = 'Finishing the setup we agreed on.';

test('the small-firm trap: Ana links the existing bar to its evidence herself, with no approval from Ben', () => {
  let [s, id] = firm();
  assert.equal(criteriaLocked(s, id), true, 'results exist');
  const v = versionsInForce(s, id);
  s = mapEvidence(s, id, { rowKind: 'requirement', rowId: 'min-cases', measure: { source: MANUAL_SOURCE, metric: rowMetric('requirement', 'accuracy'), stat: 'sample' }, by: ANA, reason: 'Count the cases we already record for accuracy.' });
  assert.equal(capData(s, id).proposals.length, 0, 'nothing for Ben to approve');
  assert.equal(current(s, id, 'requirements').find((r) => r.id === 'min-cases').measure.stat, 'sample');
  // Audit history is kept: a new version, who, why, and what was recorded.
  const rv = currentVersion(s, id, 'requirements');
  assert.deepEqual([rv.version, rv.author, rv.recorded, rv.afterEvidence], [v.requirements + 1, ANA, true, true]);
  assert.deepEqual(rv.changes, ['Links "Minimum 20 cases" to its evidence.']);
  assert.equal(rv.reason, 'Count the cases we already record for accuracy.');
  assert.equal(criteriaLocked(s, id), true, 'a recorded change never unlocks the bar');
  assert.match(s.activity[0].body, /Ana Ruiz recorded this without approval, because it only completes or strengthens the bar: Links "Minimum 20 cases" to its evidence\./);
  // Changing that link later is a change to the bar: Ben signs off.
  s = mapEvidence(s, id, { rowKind: 'requirement', rowId: 'min-cases', measure: { source: MANUAL_SOURCE, metric: rowMetric('requirement', 'min-cases'), stat: 'sample' }, by: ANA, reason: 'Use its own count instead.' });
  const p = openProposal(s, id, 'criteria');
  assert.deepEqual(p.needsSignoffBecause, ['It changes the evidence that judges "Minimum 20 cases".']);
  assert.deepEqual(p.eligible, [BEN]);
});

test('recorded, no approval: add a Reviewer or Stakeholder, tighten a bar, consideration → hard, add a Requirement', () => {
  let [s, id] = firm();
  // Adding Cara as a Reviewer: she doesn't approve her own addition, and nor does Ben.
  s = saveStakeholders(s, id, { stakeholders: [...current(s, id, 'stakeholders'), { person: CARA, team: 'Office', role: 'reviewer', stance: 'undecided' }], by: ANA, reason: 'Cara hears from clients first.' });
  assert.equal(openProposal(s, id, 'stakeholders'), null);
  assert.ok(current(s, id, 'stakeholders').some((x) => x.person === CARA));
  assert.deepEqual(currentVersion(s, id, 'stakeholders').changes, ['Adds Cara Lim as a Reviewer.'], 'names, never ids');
  const change = (fn, why = WHY) => proposeAmendment(s, id, 'criteria', { value: reqs(s, id, fn), by: ANA, reason: why });
  for (const [label, fn] of [
    ['tighten', (r) => r.map((x) => (x.id === 'accuracy' ? { ...x, text: 'Overall accuracy ≥ 95%' } : x))],
    ['consideration → hard', (r) => r.map((x) => (x.id === 'tone' ? { ...x, consideration: false } : x))],
    ['add a Requirement', (r) => [...r, { id: 'opt-out', text: 'Clients can opt out of reminders', judgment: 'person' }]],
  ]) {
    const t = change(fn);
    assert.equal(openProposal(t, id, 'criteria'), null, label);
    assert.equal(currentVersion(t, id, 'requirements').recorded, true, label);
  }
});

test('governed, sign-off: loosen a bar, remove a hard Requirement, hard → consideration, remove a Reviewer, change a role', () => {
  let [s, id] = firm();
  const opens = (kind, value, expected) => {
    const t = proposeAmendment(s, id, kind, { value, by: ANA, reason: WHY });
    const p = openProposal(t, id, kind);
    assert.ok(p, expected);
    assert.ok(p.needsSignoffBecause.some((x) => x.includes(expected)), `${expected}: ${p.needsSignoffBecause.join(' | ')}`);
    assert.equal(versionsInForce(t, id)[kind === 'criteria' ? 'requirements' : kind], versionsInForce(s, id)[kind === 'criteria' ? 'requirements' : kind], 'nothing applied');
  };
  opens('criteria', reqs(s, id, (r) => r.map((x) => (x.id === 'accuracy' ? { ...x, text: 'Overall accuracy ≥ 80%' } : x))), 'It loosens "Overall accuracy ≥ 90%"');
  opens('criteria', reqs(s, id, (r) => r.filter((x) => x.id !== 'templates')), 'It removes the hard Requirement "The tax lead has approved the templates"');
  opens('criteria', reqs(s, id, (r) => r.map((x) => (x.id === 'templates' ? { ...x, consideration: true } : x))), 'consideration instead of a hard Requirement');
  s = saveStakeholders(s, id, { stakeholders: [...current(s, id, 'stakeholders'), { person: CARA, team: 'Office', role: 'stakeholder', stance: 'undecided' }], by: ANA, reason: 'Cara hears from clients first.' });
  opens('stakeholders', current(s, id, 'stakeholders').filter((x) => x.person !== BEN), 'It removes Reviewer Ben Okoro');
  opens('stakeholders', current(s, id, 'stakeholders').map((x) => (x.person === CARA ? { ...x, role: 'reviewer' } : x)), 'It changes Cara Lim from Stakeholder to Reviewer');
  // Mixed: one governed part makes the whole change governed.
  opens('criteria', reqs(s, id, (r) => [...r.map((x) => (x.id === 'accuracy' ? { ...x, text: 'Overall accuracy ≥ 80%' } : x)), { id: 'extra', text: 'An extra check', judgment: 'person' }]), 'It loosens');
});

test('Boundaries after a pilot: adding or tightening is recorded; permitting more is governed', () => {
  let [s, id] = firm();
  s = amend(s, id, 'contract', { value: { may: ['Draft reminder emails.'], mustAsk: ['Every send.'], mustNever: ['Send an email on its own.'], escalation: ['A client disputes a deadline.'], autoRestriction: ['2 wrong deadlines within 7 days return it to Recommend.'] }, author: ANA, reason: 'Our Boundaries.' });
  s = { ...s, capabilityData: { ...s.capabilityData, [id]: { ...capData(s, id), pilot: { cases: 20 } } } };
  const c = current(s, id, 'contract');
  const added = proposeAmendment(s, id, 'contract', { value: { ...c, mustNever: [...c.mustNever, 'Quote a fee.'] }, by: ANA, reason: 'A client asked about fees.' });
  assert.equal(openProposal(added, id, 'contract'), null);
  assert.deepEqual(currentVersion(added, id, 'contract').changes, ['Adds the Boundary "Quote a fee." under "Never allowed".']);
  const allowed = proposeAmendment(s, id, 'contract', { value: { ...c, may: [...c.may, 'Send reminders on its own.'] }, by: ANA, reason: 'Ready for more.' });
  assert.deepEqual(openProposal(allowed, id, 'contract').needsSignoffBecause, ['It allows "Send reminders on its own.", which permits more.']);
  const loosened = proposeAmendment(s, id, 'contract', { value: { ...c, mustAsk: [] }, by: ANA, reason: 'Stop asking before every send.' });
  assert.deepEqual(openProposal(loosened, id, 'contract').needsSignoffBecause, ['It removes the Boundary "Every send." from "Requires human review, for these cases", which permits more.']);
});

test('guards: only someone named records; a bar raised during an open decision still needs approval', () => {
  let [s, id] = firm();
  // Someone not named on the capability: sign-off, with the reason.
  s = addPerson(s, { name: 'Dev Patel', title: 'Contractor', team: 'IT', by: ANA, reason: 'Helps with tooling.' });
  const outsider = Object.keys(people(s)).find((k) => people(s)[k].name === 'Dev Patel');
  const t = proposeAmendment(s, id, 'criteria', { value: reqs(s, id, (r) => r.map((x) => (x.id === 'accuracy' ? { ...x, text: 'Overall accuracy ≥ 95%' } : x))), by: outsider, reason: WHY });
  assert.match(openProposal(t, id, 'criteria').shortcutDeclined, /Only the owner or someone named on it can make this change without approval/);
  // An open expansion decision: raising the bar needs approval; linking evidence doesn't.
  s = recordJudgment(s, id, 'templates', { verdict: 'met', rationale: 'All four templates approved on Oct 14.', by: BEN });
  s = proposeAuthority(s, id, 2, { by: ANA });
  const raised = proposeAmendment(s, id, 'criteria', { value: reqs(s, id, (r) => r.map((x) => (x.id === 'accuracy' ? { ...x, text: 'Overall accuracy ≥ 95%' } : x))), by: ANA, reason: WHY });
  assert.match(openProposal(raised, id, 'criteria').shortcutDeclined, /A decision about more authority is open, so a change that raises the bar needs approval/);
  const linked = mapEvidence(s, id, { rowKind: 'requirement', rowId: 'min-cases', measure: { source: MANUAL_SOURCE, metric: rowMetric('requirement', 'accuracy'), stat: 'sample' }, by: ANA, reason: 'Count the cases we already record.' });
  assert.equal(openProposal(linked, id, 'criteria'), null, 'linking evidence never waits on a decision');
});

test('classifyChange names each part in plain words', () => {
  const [s, id] = firm();
  const c = classifyChange(s, id, 'criteria', reqs(s, id, (r) => [...r.map((x) => (x.id === 'accuracy' ? { ...x, text: 'Overall accuracy ≥ 95%' } : x.id === 'tone' ? { ...x, consideration: false } : x))]));
  assert.deepEqual(c, { recorded: ['Tightens "Overall accuracy ≥ 90%": Overall accuracy ≥ 90% → Overall accuracy ≥ 95%.', 'Makes "Clients find the tone friendly" a hard Requirement.'], governed: [], raises: true });
});

test('screen: a proposal says why it needs sign-off', () => {
  let [s, id] = firm();
  s = proposeAmendment(s, id, 'criteria', { value: reqs(s, id, (r) => r.filter((x) => x.id !== 'templates')), by: ANA, reason: WHY });
  setPeople(people(s)); setToday(s.today);
  const h = strip(proposalView({ ...s, actingAs: BEN }, id, openProposal(s, id, 'criteria').id, new URLSearchParams()));
  assert.match(h, /Why this needs sign-off It removes the hard Requirement "The tax lead has approved the templates"\. Completing or strengthening the bar .* is recorded without approval\./);
  s = approveProposal(s, id, 'P-1', { by: BEN });
  assert.ok(!current(s, id, 'requirements').some((x) => x.id === 'templates'));
});
