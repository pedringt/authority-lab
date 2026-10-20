// Product reset, Phase 1 (#137): the data model can represent the reset's
// concepts, and the Northstar and State workspaces still behave as before.
// Paige's answers (2026-10-14): Targets optional (1A), overall Risk derived
// from Severity x Likelihood (2B), existing named people stay Stakeholders
// (3B), effective authority only as recorded (4A), "Needs decision" is
// unresolved, neither pass nor fail (5f).
import { test } from 'node:test';
import { decideWith } from './helpers.mjs';
import assert from 'node:assert/strict';
import {
  initialState, getCapability, capData, current, currentVersion, versionList, addCapability, people,
  saveCriteria, criteriaSaved, criteriaLocked, defaultsFor, targetsNow, requirementsNow, readiness, proposeAmendment, openProposal, tighteningOnly,
  saveStakeholders, namedStakeholders, peopleModel, PEOPLE_ROLES,
  baselineNow, authorityBaseline, recordBaseline, baselineVersions, LIFECYCLE,
  recordContext, suggestContext, reviewContextFact, contextNow, confirmedContext, contextVersions,
  recordMaterialChange, materialChanges, MATERIAL_CHANGE_AREAS,
  riskView, overallRisk, assessRisk, OVERALL_RISK_TABLE, LIKELIHOODS, SCALES, SEVERITY_LABELS,
  boundaries, BOUNDARY_CATEGORIES, actsThroughGate,
  selectDecision, setRationale, setResidualRisk, authorize, publishableRecord,
  findWorkspace, isCoverageRule, isUnresolvedTarget, createStore, STORAGE_KEY,
} from '../src/store/index.js';

const RR = 'refund-recommendation';
const TC = 'ticket-classification';
const LOW = { impact: 'Low', reversibility: 'Easy to reverse', exposure: 'Internal only' };
const add = (s, extra = {}) => {
  const n = addCapability(s, { name: 'Tag tickets', summary: 'Adds routing tags.', owner: 'priya', risk: LOW, startingLevel: 0, ...extra });
  return [n, n.capabilities.at(-1).id];
};
const stateWs = () => findWorkspace('state').build({ today: '2026-10-14' });
const stateCap = (s) => s.capabilities[0].id;

// ---------------------------------------------------------------------------
// Planned vs existing; declared vs effective authority
// ---------------------------------------------------------------------------

test('planned vs in use comes from "What does it do today?"; without an answer it is not recorded', () => {
  const s0 = initialState();
  for (const c of s0.capabilities) assert.equal(baselineNow(s0, c.id).lifecycle, 'not-recorded', `${c.id} has no answer, so nothing is assumed`);
  const cases = { nothing: 'planned', recommends: 'in-use', drafts: 'in-use', acts: 'in-use', 'not-delegated': 'not-recorded' };
  for (const [today, lifecycle] of Object.entries(cases)) {
    const [s, id] = add(s0, { today, rationale: 'This stays with the people who own it today.' });
    assert.equal(baselineNow(s, id).lifecycle, lifecycle, today);
    assert.equal(baselineNow(s, id).recorded, false, 'derived, never stored');
    assert.equal(baselineVersions(s, id).length, 0);
  }
  assert.deepEqual(Object.keys(LIFECYCLE), ['planned', 'in-use', 'not-recorded']);
});

test('effective authority is never inferred: a capability that drafts today still reads "not recorded" until a person records it', () => {
  const [s, id] = add(initialState(), { today: 'drafts' });
  assert.deepEqual(authorityBaseline(s, id), { declared: { level: 1, name: 'Recommend' }, effective: { status: 'not-recorded' }, differs: false });
  const r = recordBaseline(s, id, { effective: { level: 2, note: 'Every reply it drafts is sent after an agent approves it.' }, fields: { currentBehavior: 'Drafts replies for agents to approve.' }, by: 'priya', reason: 'What it does today.' });
  const ab = authorityBaseline(r, id);
  assert.deepEqual([ab.declared.level, ab.effective.status, ab.effective.level, ab.effective.name, ab.differs], [1, 'recorded', 2, 'Draft', true]);
  assert.equal(getCapability(r, id).authority.level, 1, 'recording what it does today never changes authority');
  assert.equal(r.decisionRecords.length, s.decisionRecords.length, 'and writes no decision record');
  assert.equal(baselineNow(r, id).currentBehavior, 'Drafts replies for agents to approve.');
  assert.equal(r.activity[0].kind, 'baseline');
  // "Unknown" is a recorded answer too, and is not a difference.
  const u = recordBaseline(r, id, { effective: { status: 'unknown' }, by: 'priya', reason: 'We are not sure any more.' });
  assert.deepEqual([authorityBaseline(u, id).effective.status, authorityBaseline(u, id).differs], ['unknown', false]);
});

test('the baseline is versioned: a new version each time, earlier versions untouched', () => {
  const [s, id] = add(initialState(), { today: 'acts' });
  const a = recordBaseline(s, id, { lifecycle: 'in-use', fields: { safeguards: 'Daily spot checks.' }, by: 'priya', reason: 'First look.' });
  const b = recordBaseline(a, id, { fields: { safeguards: 'Daily spot checks and a weekly audit.', knownIssues: 'Misses some urgent tags.' }, by: 'priya', reason: 'Audit added.' });
  const [v1, v2] = baselineVersions(b, id);
  assert.deepEqual([v1.version, v2.version], [1, 2]);
  assert.equal(v1.value.safeguards, 'Daily spot checks.');
  assert.equal(v2.before.safeguards, 'Daily spot checks.');
  assert.equal(v2.value.knownIssues, 'Misses some urgent tags.');
  assert.equal(baselineVersions(a, id).length, 1, 'the earlier state is unchanged');
});

test('recording a baseline is refused without a reason, from someone not named on the capability, or with a bad level', () => {
  const [s, id] = add(initialState());
  assert.throws(() => recordBaseline(s, id, { lifecycle: 'in-use', by: 'priya' }), /Add a reason/);
  const outsider = Object.keys(people(s)).find((k) => k !== 'priya');
  assert.throws(() => recordBaseline(s, id, { lifecycle: 'in-use', by: outsider, reason: 'x' }), /isn't the owner or named on/);
  assert.throws(() => recordBaseline(s, id, { effective: { level: 5, note: 'A long enough note.' }, by: 'priya', reason: 'x' }), /level from 0 to 4/);
  assert.throws(() => recordBaseline(s, id, { effective: { level: 2, note: 'short' }, by: 'priya', reason: 'x' }), /how you know/);
  assert.throws(() => recordBaseline(s, id, { lifecycle: 'retired', by: 'priya', reason: 'x' }), /Lifecycle must be one of/);
});

// ---------------------------------------------------------------------------
// Risk
// ---------------------------------------------------------------------------

test('Likelihood defaults to Unknown, and Unknown Likelihood makes overall Risk Unknown, never Low', () => {
  const s = initialState();
  for (const c of s.capabilities) {
    const v = riskView(s, c.id);
    assert.equal(v.likelihood, 'Unknown');
    assert.equal(v.likelihoodRecorded, false);
    assert.equal(v.overall, 'Unknown');
    assert.equal(v.scale, null, 'scale is not recorded');
    assert.equal(v.severity, current(s, c.id, 'risk').impact, 'Severity is the existing "how serious" answer');
  }
  for (const sev of ['Low', 'Medium', 'High']) assert.equal(overallRisk(sev, 'Unknown').overall, 'Unknown');
  assert.match(overallRisk('Low', 'Unknown').why, /never treated as Low/);
  assert.equal(overallRisk('', 'High').overall, 'Unknown');
  assert.ok(LIKELIHOODS.includes('Unknown'));
});

test('overall Risk follows the fixed table and says how it got there', () => {
  for (const [sev, row] of Object.entries(OVERALL_RISK_TABLE)) for (const [lik, want] of Object.entries(row)) {
    const r = overallRisk(sev, lik);
    assert.equal(r.overall, want);
    assert.match(r.why, new RegExp(`${SEVERITY_LABELS[sev]} Severity and ${lik} Likelihood give ${want}`));
  }
  // Paige's table (R1 A): the standard 3x3, cell by cell.
  assert.deepEqual(OVERALL_RISK_TABLE, {
    Low: { Low: 'Low', Moderate: 'Low', High: 'Moderate' },
    Medium: { Low: 'Low', Moderate: 'Moderate', High: 'High' },
    High: { Low: 'Moderate', Moderate: 'High', High: 'High' },
  });
  assert.deepEqual(LIKELIHOODS, ['Low', 'Moderate', 'High', 'Unknown']);
  assert.deepEqual(SCALES, ['One case', 'Many cases', 'Systemic', 'Unknown']);
  assert.equal(overallRisk('High', 'Low').overall, 'Moderate', 'Severity alone never decides it');
  assert.match(overallRisk('Medium', 'Moderate').why, /^Moderate Severity and Moderate Likelihood give Moderate overall Risk/);
  const s = assessRisk(initialState(), TC, { likelihood: 'Moderate', scale: 'Many cases', by: 'priya', reason: 'From last month\'s audit.' });
  const v = riskView(s, TC);
  assert.deepEqual([v.likelihood, v.likelihoodRecorded, v.scale], ['Moderate', true, 'Many cases']);
  assert.equal(v.overall, OVERALL_RISK_TABLE[v.severity].Moderate);
  assert.equal(versionList(s, TC, 'risk').length, 2, 'a new version of the risk profile');
  assert.equal(currentVersion(s, TC, 'risk').before.likelihood, undefined, 'the earlier version is unchanged');
  assert.match(s.activity[0].body, /fixed table/);
  assert.throws(() => assessRisk(s, TC, { likelihood: 'Rare', by: 'priya', reason: 'x' }), /Likelihood must be one of/);
  assert.throws(() => assessRisk(s, TC, { by: 'priya', reason: 'x' }), /Set Likelihood or Scale/);
  const [a, id] = add(initialState(), { risk: { ...LOW, likelihood: 'High' } });
  assert.equal(riskView(a, id).overall, OVERALL_RISK_TABLE.Low.High);
});

// ---------------------------------------------------------------------------
// Requirements and Targets
// ---------------------------------------------------------------------------

test('a capability can have Requirements with no Targets; the choice is recorded', () => {
  const [s, id] = add(initialState());
  const d = defaultsFor(s, id);
  const saved = saveCriteria(s, id, { criteria: [], requirements: d.requirements, by: 'priya', reason: 'No measurable bar makes sense for tagging yet.' });
  assert.equal(criteriaSaved(saved, id), true);
  assert.deepEqual(current(saved, id, 'criteria'), []);
  assert.equal(currentVersion(saved, id, 'criteria').noTargets, true);
  assert.deepEqual(targetsNow(saved, id), []);
  assert.equal(requirementsNow(saved, id).length, d.requirements.length);
  // The minimum-cases row is still required, and is a coverage rule.
  assert.throws(() => saveCriteria(s, id, { criteria: [], requirements: d.requirements.filter((r) => r.id !== 'min-cases'), by: 'priya', reason: 'Long enough reason.' }), /a minimum number of cases/);
  assert.equal(isCoverageRule(d.requirements.find((r) => r.id === 'min-cases')), true);
  assert.equal(isCoverageRule(d.requirements.find((r) => r.id === 'accuracy')), false);
  assert.equal(isCoverageRule({ id: 'x', text: 'At least 3 reviewers looked', kind: 'coverage' }), true);
  // An empty seeded version never counted as saved, and still doesn't.
  assert.equal(criteriaSaved(s, id), false);
});

test('a measurable Requirement can have a Target whose bar still needs a decision: unresolved, never pass or fail', () => {
  const [s, id] = add(initialState());
  const d = defaultsFor(s, id);
  const criteria = [...d.criteria, { name: 'Tag accuracy on urgent tickets', target: 'Needs decision', requirement: 'accuracy' }];
  const saved = saveCriteria(s, id, { criteria, requirements: d.requirements, by: 'priya' });
  const t = targetsNow(saved, id).find((x) => x.name === 'Tag accuracy on urgent tickets');
  assert.deepEqual([t.bar, t.status, t.target, t.current], ['needs-decision', 'needs-decision', 'Needs decision', 'No bar set yet']);
  assert.equal(isUnresolvedTarget(t), true);
  const r = requirementsNow(saved, id).find((x) => x.id === 'accuracy');
  assert.equal(r.met, false, 'it can\'t be met while nobody has said what met is');
  assert.equal(r.unresolved, true);
  assert.match(r.gap, /no bar yet: it needs a decision\. This isn't a failed result\./);
  const rd = readiness(saved, id);
  assert.deepEqual(rd.unresolved.map((x) => x.id), ['accuracy']);
  assert.ok(rd.unmet.some((x) => x.id === 'accuracy'), 'it still blocks readiness');
  // Other rows are unaffected.
  assert.ok(requirementsNow(saved, id).filter((x) => x.id !== 'accuracy').every((x) => !x.unresolved));
});

test('a "Needs decision" Target can\'t carry a measure or point at a missing Requirement, and replacing a default bar with it needs a reason', () => {
  const [s, id] = add(initialState());
  const d = defaultsFor(s, id);
  const m = { source: 'x', metric: 'y', stat: 'rate', op: '>=', value: 90, kind: 'eval' };
  assert.throws(() => saveCriteria(s, id, { criteria: [{ name: 'Q', target: 'Needs decision', measure: m }], requirements: d.requirements, by: 'priya', reason: 'Long enough reason.' }), /no bar yet, so it can't be measured/);
  assert.throws(() => saveCriteria(s, id, { criteria: [{ name: 'Q', target: '≥ 90%', requirement: 'nope' }], requirements: d.requirements, by: 'priya', reason: 'Long enough reason.' }), /requirement "nope", which isn't in the list/);
  const unsure = d.criteria.map((c) => (c.id === 'quality' ? { ...c, target: 'Needs decision' } : c));
  assert.throws(() => saveCriteria(s, id, { criteria: unsure, requirements: d.requirements, by: 'priya' }), /Quality: left as Needs decision/);
  const ok = saveCriteria(s, id, { criteria: unsure, requirements: d.requirements, by: 'priya', reason: 'We have no baseline for quality yet.' });
  assert.deepEqual(currentVersion(ok, id, 'criteria').deviations.map((x) => [x.id, x.change]), [['quality', 'unresolved']]);
});

test('setting the number for a "Needs decision" Target after results goes through sign-off, never directly', () => {
  // Refund recommendation has results, so its bar is locked.
  let s = initialState();
  assert.equal(criteriaLocked(s, RR), true);
  const base = { criteria: current(s, RR, 'criteria'), requirements: current(s, RR, 'requirements') };
  // An unmeasured Target (a measured one has to drop its measure first; see below).
  const k = base.criteria.findIndex((c) => !c.measure);
  assert.ok(k >= 0);
  // Leaving a Target as "Needs decision" after results is itself a change to the bar: sign-off.
  const unsure = { ...base, criteria: base.criteria.map((c, i) => (i === k ? { ...c, target: 'Needs decision' } : c)) };
  assert.equal(tighteningOnly(base, unsure).ok, false);
  // And so is resolving one: choosing a number after seeing results is never "tightening only".
  const before = { ...base, criteria: base.criteria.map((c, i) => (i === k ? { ...c, target: 'Needs decision', bar: 'needs-decision' } : c)) };
  const after = { ...base, criteria: base.criteria.map((c, i) => (i === k ? { ...c, target: '≥ 99% correct decisions' } : c)) };
  assert.equal(tighteningOnly(before, after).ok, false);
  assert.throws(() => saveCriteria(s, RR, { ...after, by: 'priya' }), /can't be changed directly now that results exist/);
  s = proposeAmendment(s, RR, 'criteria', { value: unsure, by: 'priya', reason: 'We no longer trust the original quality bar.' });
  const p = openProposal(s, RR, 'criteria');
  assert.equal(p.status, 'open');
  assert.equal(p.value.criteria[k].bar, 'needs-decision');
  // A measured Target can't silently lose its number.
  const measured = base.criteria.findIndex((c) => c.measure);
  assert.throws(() => proposeAmendment(initialState(), RR, 'criteria', { value: { ...base, criteria: base.criteria.map((c, i) => (i === measured ? { ...c, target: 'Needs decision' } : c)) }, by: 'priya', reason: 'We no longer trust the original bar.' }), /must keep a number/);
});

// ---------------------------------------------------------------------------
// Boundaries: documented vs enforced
// ---------------------------------------------------------------------------

test('a Boundary is "enforced" only when the gate checks it for a capability that acts through the gate', () => {
  const s = initialState();
  assert.deepEqual(BOUNDARY_CATEGORIES.map((c) => c.label), ['Allowed', 'Needs human review', 'Not allowed', 'What must always stay human']);
  assert.equal(actsThroughGate(RR), true);
  const b = boundaries(s, RR);
  const all = b.categories.flatMap((c) => c.lines);
  assert.ok(all.some((l) => l.enforcement === 'enforced'), 'some of its rules are checked by the gate');
  assert.ok(all.filter((l) => l.category === 'allowed').every((l) => l.enforcement === 'documented'), 'allowed lines are documented: nothing checks them');
  for (const l of all.filter((x) => x.enforcement === 'enforced')) assert.notEqual(l.category, 'allowed');
  assert.ok(all.some((l) => /confidence/i.test(l.text) && l.enforcement === 'model-reported'), 'a check on the model\'s own report is never "enforced"');
  assert.equal(b.categories.find((c) => c.key === 'alwaysHuman').lines.length, 0, 'no section feeds it yet');
  // The same kind of line on a capability that doesn't act through the gate is documented only.
  assert.equal(actsThroughGate(TC), false);
  assert.ok(boundaries(s, TC).categories.flatMap((c) => c.lines).every((l) => l.enforcement === 'documented'));
  assert.ok(boundaries(s, TC).restrictions.every((r) => r.enforcement === 'documented'), 'simulated readings are not enforcement');
});

test('State\'s Boundaries are all documented only: nothing claims enforcement Authority Lab can\'t show', () => {
  const s = stateWs();
  const b = boundaries(s, stateCap(s));
  assert.equal(b.actsThroughGate, false);
  assert.ok(b.categories.flatMap((c) => c.lines).length > 10);
  assert.ok([...b.categories.flatMap((c) => c.lines), ...b.restrictions].every((l) => l.enforcement === 'documented'));
});

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

test('one Owner, Reviewers and Stakeholders; existing named people stay Stakeholders and Reviewers start empty', () => {
  const s = initialState();
  for (const c of s.capabilities) {
    const pm = peopleModel(s, c.id);
    assert.equal(pm.owner, c.owner);
    assert.deepEqual(pm.reviewers, []);
    assert.deepEqual(pm.stakeholders, current(s, c.id, 'stakeholders').map((x) => x.person));
  }
  assert.deepEqual(PEOPLE_ROLES, { reviewer: 'Reviewer', stakeholder: 'Stakeholder' });
  const st = stateWs();
  assert.deepEqual(peopleModel(st, stateCap(st)), { owner: 'paige-edrington', reviewers: [], stakeholders: ['paige-edrington'] });
});

test('naming a Reviewer is stored on the entry; the approval rules underneath are unchanged', () => {
  const [s0, id] = add(initialState());
  const others = Object.keys(people(s0)).filter((k) => k !== 'priya').slice(0, 2);
  const s = saveStakeholders(s0, id, { stakeholders: [{ person: others[0], team: 'Risk', role: 'reviewer' }, { person: others[1], team: 'Support' }], by: 'priya' });
  assert.deepEqual(peopleModel(s, id), { owner: 'priya', reviewers: [others[0]], stakeholders: [others[1]] });
  assert.equal(current(s, id, 'stakeholders')[0].role, 'reviewer');
  assert.equal(Object.hasOwn(current(s, id, 'stakeholders')[1], 'role'), false, 'a Stakeholder needs no role field');
  assert.deepEqual(namedStakeholders(s, id).sort(), ['priya', ...others].sort(), 'Reviewers and Stakeholders are both named, as before');
  assert.throws(() => saveStakeholders(s0, id, { stakeholders: [{ person: others[0], team: 'Risk', role: 'approver' }], by: 'priya' }), /Reviewer or Stakeholder/);
});

test('after results, making a Stakeholder a Reviewer goes through sign-off like any membership change', () => {
  const s = initialState();
  const list = current(s, RR, 'stakeholders');
  const promoted = list.map((x, i) => (i === 0 ? { ...x, role: 'reviewer' } : x));
  const after = saveStakeholders(s, RR, { stakeholders: promoted, by: 'priya', reason: 'Risk input is required from now on.' });
  assert.deepEqual(current(after, RR, 'stakeholders'), list, 'nothing changes directly');
  assert.equal(openProposal(after, RR, 'stakeholders').status, 'open');
});

// ---------------------------------------------------------------------------
// Material changes
// ---------------------------------------------------------------------------

test('a material change is recorded, append-only and surfaced, and changes nothing else', () => {
  const s = initialState();
  const owner = getCapability(s, RR).owner;
  const a = recordMaterialChange(s, RR, { areas: ['model', 'prompt'], description: 'Moved to a newer model and rewrote the system prompt.', effectiveOn: '2026-10-01', by: owner });
  const b = recordMaterialChange(a, RR, { areas: 'tools', description: 'Added a tool that reads the refund ledger.', by: owner });
  const list = materialChanges(b, RR);
  assert.deepEqual(list.map((x) => [x.id, x.areas.join('+'), x.effectiveOn]), [[`MC-${RR}-1`, 'model+prompt', '2026-10-01'], [`MC-${RR}-2`, 'tools', s.today]]);
  assert.equal(materialChanges(a, RR).length, 1, 'the earlier state is unchanged');
  assert.equal(b.activity[0].kind, 'material-change');
  assert.equal(b.activity[0].surfaced, true);
  assert.match(a.activity[0].body, /Evidence from before 2026-10-01 may apply less/);
  // Phase 1 records only: authority, readiness and evidence are as they were.
  assert.deepEqual(getCapability(b, RR).authority, getCapability(s, RR).authority);
  assert.deepEqual(readiness(b, RR), readiness(s, RR));
  assert.deepEqual(capData(b, RR).evidence, capData(s, RR).evidence);
  assert.ok(Object.keys(MATERIAL_CHANGE_AREAS).includes('jurisdiction'));
  assert.throws(() => recordMaterialChange(s, RR, { areas: [], description: 'Something changed here.', by: owner }), /Say what changed/);
  assert.throws(() => recordMaterialChange(s, RR, { areas: ['vibes'], description: 'Something changed here.', by: owner }), /Unknown kind of change/);
  assert.throws(() => recordMaterialChange(s, RR, { areas: ['model'], description: 'New.', by: owner }), /Describe the change/);
  const outsider = Object.keys(people(s)).find((k) => !namedStakeholders(s, RR).includes(k));
  if (outsider) assert.throws(() => recordMaterialChange(s, RR, { areas: ['model'], description: 'Something changed here.', by: outsider }), /isn't the owner or named on/);
});

// ---------------------------------------------------------------------------
// Residual Risk
// ---------------------------------------------------------------------------

function restrictTC(s, by) {
  s = decideWith(s, TC, 'restrict');
  return setRationale(s, TC, 'Pulling it back while the new tag set is checked by hand for a week.');
}

test('Residual Risk is optional; when given it goes on the decision record, frozen, and is cleared for the next decision', () => {
  const s0 = initialState();
  const by = getCapability(s0, TC).owner;
  const without = authorize(restrictTC(s0, by), TC, { by });
  assert.equal(Object.hasOwn(without.decisionRecords.at(-1), 'residualRisk'), false, 'never required, never invented');
  let s = setResidualRisk(restrictTC(s0, by), TC, { level: 'Moderate', note: 'Misrouted urgent tickets are still possible.' });
  s = authorize(s, TC, { by });
  const rec = s.decisionRecords.at(-1);
  assert.deepEqual([rec.residualRisk.level, rec.residualRisk.note, rec.residualRisk.by], ['Moderate', 'Misrouted urgent tickets are still possible.', by]);
  assert.ok(Object.isFrozen(rec.residualRisk));
  assert.equal(capData(s, TC).decision.residualRisk, null, 'the next decision starts without one');
  assert.throws(() => setResidualRisk(s0, TC, { level: 'Medium' }), /Low, Moderate, High, Unknown/);
});

test('a published State record keeps its Residual Risk', () => {
  let s = stateWs();
  const id = stateCap(s);
  s = decideWith(s, id, 'hold');
  s = setRationale(s, id, 'Keeping Recommend until the next full suite run is in.');
  s = setResidualRisk(s, id, { level: 'Low', note: 'Every proposal is decided by a person.' });
  s = authorize(s, id, { by: 'paige-edrington' });
  const pub = publishableRecord(s, s.decisionRecords.at(-1).id);
  assert.deepEqual(pub.residualRisk, { level: 'Low', note: 'Every proposal is decided by a person.' });
});

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

test('Context: facts a person records are confirmed; suggestions stay unconfirmed until reviewed one at a time', () => {
  const s0 = initialState();
  assert.deepEqual(contextNow(s0), {});
  let s = recordContext(s0, { facts: { purpose: 'Resolve support tickets faster without wrong refunds.', environment: 'External', aiActions: ['Recommends', 'Acts'] }, by: 'priya', reason: 'Kick-off notes.' });
  assert.deepEqual(confirmedContext(s), { purpose: 'Resolve support tickets faster without wrong refunds.', environment: 'External', aiActions: ['Recommends', 'Acts'] });
  s = suggestContext(s, { facts: { dataSensitivity: 'Customer contact details and order history.', environment: 'Internal' }, source: 'template', by: 'priya' });
  assert.equal(contextNow(s).dataSensitivity.status, 'suggested');
  assert.equal(contextNow(s).environment.value, 'External', 'a suggestion never overwrites a confirmed fact');
  assert.equal(Object.hasOwn(confirmedContext(s), 'dataSensitivity'), false, 'a suggestion can\'t drive setup');
  s = reviewContextFact(s, 'dataSensitivity', { decision: 'confirm', value: 'Customer contact details, order history and payment status.', by: 'priya' });
  assert.equal(confirmedContext(s).dataSensitivity, 'Customer contact details, order history and payment status.');
  assert.equal(contextNow(s).dataSensitivity.corrected, true);
  assert.equal(contextVersions(s).length, 3);
  assert.equal(contextVersions(s)[0].value.purpose.status, 'confirmed', 'earlier versions are unchanged');
  assert.throws(() => reviewContextFact(s, 'dataSensitivity', { decision: 'confirm', by: 'priya' }), /already confirmed/);
  assert.throws(() => recordContext(s0, { facts: { environment: 'Mars' }, by: 'priya', reason: 'x' }), /choose one of/);
  assert.throws(() => recordContext(s0, { facts: { aiActions: ['Dreams'] }, by: 'priya', reason: 'x' }), /isn't one of/);
  assert.throws(() => recordContext(s0, { facts: { mood: 'good' }, by: 'priya', reason: 'x' }), /Unknown context fact/);
  assert.throws(() => suggestContext(s0, { facts: { purpose: 'x' }, source: 'person', by: 'priya' }), /template, the description or AI/);
});

// ---------------------------------------------------------------------------
// Backward compatibility
// ---------------------------------------------------------------------------

test('Northstar keeps its story: no baseline, context or material changes are invented, and the storage key is unchanged', () => {
  const s = initialState();
  assert.equal(STORAGE_KEY, 'authority-lab-state-v14');
  assert.equal(s.version, 14);
  assert.equal(Object.hasOwn(s, 'contextVersions'), false);
  for (const c of s.capabilities) {
    assert.deepEqual(capData(s, c.id).baseline, []);
    assert.deepEqual(capData(s, c.id).materialChanges, []);
    assert.equal(authorityBaseline(s, c.id).effective.status, 'not-recorded');
  }
});

test('a workspace saved before #137 (no new fields) still loads and reads with defaults', () => {
  const old = JSON.parse(JSON.stringify(initialState()));
  for (const d of Object.values(old.capabilityData)) { delete d.baseline; delete d.materialChanges; }
  const storage = { data: { [STORAGE_KEY]: JSON.stringify(old) }, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = v; } };
  const store = createStore({ storage });
  const s = store.get();
  assert.equal(Object.hasOwn(capData(s, RR), 'baseline'), false, 'nothing is migrated in place');
  assert.deepEqual(baselineVersions(s, RR), []);
  assert.deepEqual(materialChanges(s, RR), []);
  assert.equal(baselineNow(s, RR).lifecycle, 'not-recorded');
  assert.equal(riskView(s, RR).overall, 'Unknown');
  store.dispatch('recordMaterialChange', RR, { areas: ['data'], description: 'Started reading the chargeback feed.', by: getCapability(s, RR).owner });
  assert.equal(materialChanges(store.get(), RR).length, 1);
});

test('State: effective Draft is recorded from its configuration, declared stays Recommend, and its evidence mapping is unchanged', () => {
  const s = stateWs();
  const id = stateCap(s);
  const ab = authorityBaseline(s, id);
  assert.deepEqual([ab.declared.level, ab.effective.status, ab.effective.level, ab.differs], [1, 'recorded', 2, true]);
  const [v] = baselineVersions(s, id);
  assert.equal(v.author, 'paige-edrington');
  assert.equal(v.value.lifecycle, 'in-use');
  assert.equal(riskView(s, id).overall, 'Unknown', 'Likelihood was never given, so it stays Unknown');
  // Targets and requirements are exactly the configured ones, all measured, none unresolved.
  assert.ok(current(s, id, 'criteria').every((c) => c.measure && !c.bar));
  assert.equal(readiness(s, id).unresolved.length, 0);
  assert.equal(isCoverageRule(current(s, id, 'requirements').find((r) => r.id === 'min-cases')), true);
});

// ---------------------------------------------------------------------------
// The editors keep the new fields on save (a save sends only what the form holds)
// ---------------------------------------------------------------------------

test('the stakeholders and targets editors carry the Reviewer role, the Target-to-Requirement link and the coverage kind', async () => {
  const { setPeople } = await import('../src/ui.js');
  const { stakeholdersEditorView } = await import('../src/views/stakeholders.js');
  const { criteriaEditorView } = await import('../src/views/criteria.js');
  const [s0, id] = add(initialState());
  const other = Object.keys(people(s0)).find((k) => k !== 'priya');
  const d = defaultsFor(s0, id);
  let s = saveStakeholders(s0, id, { stakeholders: [{ person: other, team: 'Risk', role: 'reviewer' }], by: 'priya' });
  s = saveCriteria(s, id, { criteria: [...d.criteria, { name: 'Urgent tag accuracy', target: 'Needs decision', requirement: 'accuracy' }], requirements: d.requirements.map((r) => (r.id === 'override' ? { ...r, kind: 'coverage' } : r)), by: 'priya' });
  setPeople(people(s));
  try {
    assert.match(String(stakeholdersEditorView(s, id, new URLSearchParams(''))), /name="s-role" value="reviewer"/);
    const html = String(criteriaEditorView(s, id, new URLSearchParams('')));
    assert.match(html, /name="c-requirement" value="accuracy"/);
    assert.match(html, /name="r-kind" value="coverage"/);
  } finally { setPeople(null); }
  // Reading the row back as the form does keeps the Reviewer, so a stance edit is not a membership change.
  const resent = current(s, id, 'stakeholders').map(({ team, person, stance, role }) => ({ team, person, stance, ...(role ? { role } : {}) }));
  assert.deepEqual(peopleModel(saveStakeholders(s, id, { stakeholders: resent, by: 'priya' }), id).reviewers, [other]);
});
