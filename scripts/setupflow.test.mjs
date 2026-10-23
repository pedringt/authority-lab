// The setup flow (#139). Paige's decisions, 2026-10-16: setup is a draft
// until the owner confirms it; confirmation writes the starting decision
// record and a Setup confirmed snapshot together; it gates authority, not
// exploration; the first result still locks the bar (C1); templates suggest
// types, never numbers (C3); every Boundary suggestion is reviewed one at a
// time; deterministic suggestions say where they came from.
import { test } from 'node:test';
import { decideWith } from './helpers.mjs';
import assert from 'node:assert/strict';
import {
  initialState, getCapability, capData, current, versionList, people, checkAction,
  recordContext, reviewContextFact, suggestFromDescription, contextNow, contextDescription, confirmedContext, interpretDescription,
  startCapability, editSetupCapability, saveSetupRisk, setStartingAuthority, setupReview, confirmSetup, setupState, setupConfirmed, setupConfirmation, resultsLockWarning, UNCONFIRMED_REASON,
  startContractDraft, reviewSuggestion, addContractLine, confirmSection, finalizeContract, SECTION_KEYS, isSuggestion, suggestionOrigin, SUGGESTION_LABELS,
  defaultsFor, saveCriteria, criteriaLocked, requirementsNow, targetsNow, readiness, evidenceCoverage, coverageText,
  addStarterScenarios, startTestRun, advanceTestRun, proposeAuthority, selectDecision, setRationale, canAuthorize, authorize,
  baselineNow, baselineVersions, recordBaseline, findWorkspace, isCoverageRule,
} from '../src/store/index.js';
import { STARTING_POINTS, TEMPLATE_FAMILIES, BLANK, familiesFor } from '../src/data/templates.js';

const RISK = { impact: 'Medium', reversibility: 'Easy to reverse', exposure: 'Customer-facing', likelihood: 'Unknown' };
const withPurpose = (s = initialState()) => recordContext(s, { facts: { purpose: 'Resolve support tickets faster without wrong refunds.' }, by: 'priya', reason: 'Kick-off notes.' });
function draft(extra = {}) {
  const s = startCapability(withPurpose(), { name: 'Recommend a refund', summary: 'Recommends whether to refund a customer order.', owner: 'priya', template: 'recommend', lifecycle: 'planned', by: 'priya', ...extra });
  return [s, s.capabilities.at(-1).id];
}
function reviewAll(s, id) {
  for (const l of capData(s, id).contractDraft.lines) {
    if (l.status !== 'pending') continue;
    s = l.original.includes(BLANK)
      ? reviewSuggestion(s, id, l.id, { decision: 'edit', text: l.original.replaceAll(BLANK, '2').replace('$2', '$100') })
      : reviewSuggestion(s, id, l.id, { decision: 'accept' });
  }
  for (const k of SECTION_KEYS) s = confirmSection(s, id, k, true);
  return s;
}
function readyDraft() {
  let [s, id] = draft();
  s = saveSetupRisk(s, id, { ...RISK, by: 'priya' });
  s = setStartingAuthority(s, id, { today: 'recommends' });
  s = startContractDraft(s, id, { by: 'priya' });
  s = finalizeContract(reviewAll(s, id), id, { by: 'priya' });
  const d = defaultsFor(s, id);
  s = saveCriteria(s, id, { criteria: d.criteria, requirements: d.requirements, by: 'priya' });
  return [s, id];
}
function runSuite(s, id) {
  s = startTestRun(s, id);
  for (let i = 0; i < 100 && capData(s, id).testRun.status === 'running'; i++) s = advanceTestRun(s, id);
  return s;
}

// ---------------------------------------------------------------------------
// A draft grants nothing
// ---------------------------------------------------------------------------

test('a new capability is an unconfirmed draft: no decision record, no granted authority, blocked by the gate', () => {
  const s0 = withPurpose();
  const [s, id] = draft();
  assert.equal(setupState(s, id), 'draft');
  assert.equal(s.decisionRecords.length, s0.decisionRecords.length, 'adding it is not an authority decision');
  assert.deepEqual(getCapability(s, id).authority, { level: 0, limited: false });
  assert.equal(getCapability(s, id).status, 'setup');
  assert.equal(checkAction(s, id, { tool: 'lookup_order', args: { orderId: 'ORD-5001' } }).verdict, 'block');
  assert.throws(() => proposeAuthority(s, id, 1, { by: 'priya' }), new RegExp(UNCONFIRMED_REASON.slice(0, 30)));
  assert.equal(canAuthorize(decideWith(s, id, 'hold'), id).reason, UNCONFIRMED_REASON);
  assert.equal(s.activity[0].kind, 'setup');
  assert.throws(() => startCapability(s0, { name: 'X', owner: 'priya', template: 'nope', lifecycle: 'planned', by: 'priya' }), /starting point/);
  assert.throws(() => startCapability(s0, { name: 'X', owner: 'priya', template: 'draft', by: 'priya' }), /planned \(or a pilot\) or already in use/);
});

test('the draft can be edited; planned vs in use comes straight from setup', () => {
  let [s, id] = draft({ lifecycle: 'in-use' });
  assert.equal(baselineNow(s, id).lifecycle, 'in-use');
  assert.equal(baselineNow(s, id).lifecycleFrom, 'setup');
  s = editSetupCapability(s, id, { name: 'Recommend refunds', template: 'action', lifecycle: 'planned' });
  assert.deepEqual([getCapability(s, id).name, getCapability(s, id).setup.template, baselineNow(s, id).lifecycle], ['Recommend refunds', 'action', 'planned']);
});

// ---------------------------------------------------------------------------
// Risk and starting authority
// ---------------------------------------------------------------------------

test('Risk in setup needs a Likelihood answer, and Unknown is an answer', () => {
  const [s, id] = draft();
  assert.throws(() => saveSetupRisk(s, id, { ...RISK, likelihood: undefined, by: 'priya' }), /Choose a Likelihood\. If nobody knows yet, choose Unknown/);
  assert.throws(() => saveSetupRisk(s, id, { ...RISK, exposure: '', by: 'priya' }), /who or what is affected/);
  const r = saveSetupRisk(s, id, { ...RISK, scale: 'Many cases', by: 'priya' });
  assert.deepEqual([current(r, id, 'risk').likelihood, current(r, id, 'risk').scale, current(r, id, 'risk').exposure], ['Unknown', 'Many cases', 'Customer-facing']);
  assert.equal(versionList(r, id, 'risk').length, 1);
  assert.equal(versionList(saveSetupRisk(r, id, { ...RISK, likelihood: 'Moderate', by: 'priya' }), id, 'risk').length, 2, 'each save is a version');
});

test('the starting authority is chosen from what it does today and applied only at confirmation, never above Level 1', () => {
  const [s, id] = draft();
  const a = setStartingAuthority(s, id, { today: 'acts' });
  assert.equal(getCapability(a, id).authority.level, 0, 'nothing granted yet');
  assert.equal(getCapability(a, id).setup.today, 'acts');
  assert.throws(() => setStartingAuthority(s, id, { today: 'level-3' }), /what it does today/);
});

// ---------------------------------------------------------------------------
// Boundaries: every suggestion reviewed on its own, numbers left blank
// ---------------------------------------------------------------------------

test('every suggested Boundary is pending, says where it came from, and none is pre-accepted', () => {
  let [s, id] = draft();
  assert.throws(() => startContractDraft(s, id, { by: 'priya' }), /Answer the Risk questions first/);
  s = startContractDraft(saveSetupRisk(s, id, { ...RISK, by: 'priya' }), id, { by: 'priya' });
  const lines = capData(s, id).contractDraft.lines;
  assert.ok(lines.length > 8);
  assert.ok(lines.every((l) => isSuggestion(l) && l.status === 'pending'), 'a template never decides a Boundary');
  assert.deepEqual([...new Set(lines.map(suggestionOrigin))].sort(), ['answers', 'template']);
  assert.ok(lines.some((l) => suggestionOrigin(l) === 'answers' && l.because === 'your risk answers and confirmed Context'));
  assert.ok(!lines.some((l) => /refund or credit policy/.test(l.text)), 'the demo\'s keyword suggestions are not used here');
  assert.equal(SUGGESTION_LABELS.template, 'Template suggestion');
  assert.equal(SUGGESTION_LABELS.answers, 'Based on your answers');
  assert.ok(lines.every((l) => !/\d/.test(l.original.replaceAll(BLANK, ''))), 'no suggested Boundary carries a number');
  assert.throws(() => confirmSection(s, id, 'may', true), /every suggestion/);
});

test('a suggestion with a blank must be edited with a number; it can\'t be accepted as is', () => {
  let [s, id] = draft();
  s = startContractDraft(saveSetupRisk(s, id, { ...RISK, by: 'priya' }), id, { by: 'priya' });
  const blank = capData(s, id).contractDraft.lines.find((l) => l.original.includes(BLANK));
  assert.throws(() => reviewSuggestion(s, id, blank.id, { decision: 'accept' }), /blank for a number/);
  assert.throws(() => reviewSuggestion(s, id, blank.id, { decision: 'edit', text: blank.original }), /Fill in every blank/);
  const filled = reviewSuggestion(s, id, blank.id, { decision: 'edit', text: blank.original.replaceAll(BLANK, '3') });
  assert.equal(capData(filled, id).contractDraft.lines.find((l) => l.id === blank.id).status, 'edited');
  assert.equal(capData(reviewSuggestion(s, id, blank.id, { decision: 'reject' }), id).contractDraft.lines.find((l) => l.id === blank.id).status, 'rejected');
});

test('saving the Boundaries records how each suggestion was reviewed', () => {
  let [s, id] = draft();
  s = startContractDraft(saveSetupRisk(s, id, { ...RISK, by: 'priya' }), id, { by: 'priya' });
  s = addContractLine(s, id, 'mustNever', 'Recommend a refund above the order value.');
  s = finalizeContract(reviewAll(s, id), id, { by: 'priya' });
  const v = versionList(s, id, 'contract')[0];
  assert.equal(v.review.suggestions, capData(s, id).contractDraft.lines.filter(isSuggestion).length);
  assert.equal(v.review.added, 1);
  assert.match(v.reason, /^Started from Recommend\. \d+ suggestions: /);
  assert.doesNotMatch(v.reason, /AI/);
});

// ---------------------------------------------------------------------------
// Requirements and Targets: types, never numbers
// ---------------------------------------------------------------------------

test('suggested Requirements and Targets carry no numbers; measurable ones get a Target whose bar is Needs decision', () => {
  let [s, id] = draft();
  s = saveSetupRisk(s, id, { ...RISK, exposure: 'Financial / consequential', by: 'priya' });
  const d = defaultsFor(s, id);
  assert.ok(d.requirements.every((r) => !/\d/.test(r.text)), 'no suggested Requirement sets a number');
  assert.ok(d.criteria.length > 0 && d.criteria.every((c) => c.bar === 'needs-decision' && c.target === 'Needs decision' && d.requirements.some((r) => r.id === c.requirement)));
  const min = d.requirements.find((r) => r.id === 'min-cases');
  assert.deepEqual([min.kind, min.bar, isCoverageRule(min)], ['coverage', 'needs-decision', true]);
  // #153 (D4): high-value cases are a question only for work that acts on money.
  assert.ok(!d.requirements.some((r) => r.id === 'high-value'), 'financial consequences alone add no high-value rule');
  assert.ok(d.requirements.some((r) => r.source === 'Template suggestion'));
  assert.ok(d.requirements.some((r) => r.source === 'Authority Lab suggestion'));
  assert.ok(d.requirements.some((r) => r.id === 'incidents' && !d.criteria.some((c) => c.requirement === 'incidents')), 'a non-measurable Requirement needs no Target');
});

test('a coverage rule waiting for its number is unresolved, blocks readiness and can never be sufficient', () => {
  const [s, id] = readyDraft();
  const min = requirementsNow(s, id).find((r) => r.id === 'min-cases');
  assert.deepEqual([min.met, min.unresolved], [false, true]);
  assert.match(min.gap, /it needs a decision\. This isn't a failed result/);
  assert.ok(readiness(s, id).unresolved.some((r) => r.id === 'min-cases'));
  const cov = evidenceCoverage(s, id);
  assert.equal(cov.requirements.find((r) => r.id === 'min-cases').status, 'needs-decision');
  assert.match(coverageText(cov), /has no number yet: it needs a decision/);
  assert.ok(targetsNow(s, id).every((t) => t.status === 'needs-decision'));
  // Only a coverage rule may wait for its number.
  assert.throws(() => saveCriteria(s, id, { criteria: [], requirements: [...current(s, id, 'requirements'), { text: 'Accuracy: Needs decision' }], by: 'priya', reason: 'Long enough reason here.' }), /only a coverage rule/);
  // Setting the number resolves it.
  const set = saveCriteria(s, id, { criteria: current(s, id, 'criteria'), requirements: current(s, id, 'requirements').map((r) => (r.id === 'min-cases' ? { id: 'min-cases', text: 'Minimum 60 pilot cases', kind: 'coverage' } : r)), by: 'priya' });
  assert.equal(requirementsNow(set, id).find((r) => r.id === 'min-cases').unresolved, undefined);
});

// ---------------------------------------------------------------------------
// Exploration before confirmation, and the results lock (C1)
// ---------------------------------------------------------------------------

test('tests can run before confirmation, and the first result still locks the bar', () => {
  let [s, id] = readyDraft();
  assert.match(resultsLockWarning(s, id), /may need sign-off to change, even while setup is unconfirmed/);
  s = addStarterScenarios(s, id, { by: 'priya' });
  s = runSuite(s, id);
  assert.equal(setupState(s, id), 'draft');
  assert.equal(criteriaLocked(s, id), true, 'seeing results locks the bar, draft or not');
  assert.equal(resultsLockWarning(s, id), null);
  assert.throws(() => saveCriteria(s, id, { criteria: current(s, id, 'criteria'), requirements: current(s, id, 'requirements'), by: 'priya' }), /can't be changed directly now that results exist/);
  assert.throws(() => proposeAuthority(s, id, 1, { by: 'priya' }), /Setup isn't confirmed yet/, 'results alone never open authority');
});

// ---------------------------------------------------------------------------
// Review and confirm
// ---------------------------------------------------------------------------

test('the review lists what is missing, and what is open but allowed', () => {
  const [s, id] = draft();
  const r = setupReview(s, id);
  assert.equal(r.ready, false);
  assert.deepEqual(r.missing.map((m) => m.step), ['risk', 'risk', 'boundaries', 'requirements']);
  const [ready, rid] = readyDraft();
  const rr = setupReview(ready, rid);
  assert.equal(rr.ready, true);
  assert.ok(rr.open.some((o) => /Needs decision/.test(o)), 'unresolved bars are shown, not hidden');
  assert.deepEqual([rr.summary.risk.severity, rr.summary.risk.likelihood, rr.summary.risk.overall], ['Moderate', 'Unknown', 'Unknown']);
  assert.equal(rr.summary.authority.level, 1);
  // No purpose confirmed: not ready.
  const noPurpose = startCapability(initialState(), { name: 'Y', owner: 'priya', template: 'scratch', lifecycle: 'planned', by: 'priya' });
  assert.ok(setupReview(noPurpose, noPurpose.capabilities.at(-1).id).missing.some((m) => m.step === 'context'));
});

test('only the owner confirms; confirming writes the starting decision record and a frozen Setup confirmed snapshot together', () => {
  const [s, id] = readyDraft();
  const other = Object.keys(people(s)).find((k) => k !== 'priya');
  assert.throws(() => confirmSetup(s, id, { by: other }), /Only the owner/);
  const before = s.decisionRecords.length;
  const c = confirmSetup(s, id, { by: 'priya' });
  const rec = c.decisionRecords.at(-1);
  assert.equal(c.decisionRecords.length, before + 1);
  assert.deepEqual([rec.capabilityId, rec.sequence, rec.previous, rec.next.level, rec.option, rec.authorizedBy, rec.setupConfirmation], [id, 1, null, 1, 'define', 'priya', `SC-${id}`]);
  assert.deepEqual(rec.versions, { contract: 1, criteria: 1, requirements: 1, risk: 1, stakeholders: 0 });
  const snap = setupConfirmation(c, id);
  assert.deepEqual([snap.id, snap.recordId, snap.by, snap.startingLevel], [`SC-${id}`, rec.id, 'priya', 1]);
  assert.ok(Object.isFrozen(snap) && Object.isFrozen(snap.summary));
  assert.equal(setupState(c, id), 'confirmed');
  assert.equal(getCapability(c, id).authority.level, 1);
  assert.equal(c.activity[0].kind, 'setup-confirmed');
  assert.equal(c.activity[0].surfaced, true);
  assert.throws(() => confirmSetup(c, id, { by: 'priya' }), /already confirmed/);
  assert.throws(() => saveSetupRisk(c, id, { ...RISK, by: 'priya' }), /already confirmed/);
  // #177: the record links back to the confirmed setup; earlier records (no snapshot) don't.
  const recordPage = render(c, () => decisionRecordView(c, rec.id));
  assert.match(recordPage, new RegExp(`This record was written when the setup was confirmed \\(SC-${id}\\)`));
  assert.match(recordPage, new RegExp(`<a href="#/capabilities/${id}/setup/review">See the confirmed setup</a>`));
  assert.doesNotMatch(render(c, () => decisionRecordView(c, c.decisionRecords[0].id)), /See the confirmed setup/);
  // Authority can now be proposed once there's evidence.
  assert.throws(() => proposeAuthority(c, id, 2, { by: 'priya' }), /no evidence yet/);
});

test('"not something to delegate" confirms at Level 0 by design, without Boundaries or Requirements, and needs a reason', () => {
  let [s, id] = draft({ name: 'Close accounts', template: 'action' });
  s = saveSetupRisk(s, id, { ...RISK, impact: 'High', by: 'priya' });
  s = setStartingAuthority(s, id, { today: 'not-delegated', rationale: 'short' });
  assert.ok(setupReview(s, id).missing.some((m) => /stays with people/.test(m.text)));
  s = setStartingAuthority(s, id, { today: 'not-delegated', rationale: 'Closing an account can\'t be undone, so a person always does it.' });
  const c = confirmSetup(s, id, { by: 'priya' });
  assert.deepEqual([getCapability(c, id).status, getCapability(c, id).authority.level, c.decisionRecords.at(-1).option], ['not-delegated', 0, 'not-delegated']);
});

// Paige, 2026-10-16 (#141 review): an in-use capability's baseline is required
// before confirmation. Not certainty: "Unknown" is a valid entry.
function readyInUse() {
  let [s, id] = draft({ lifecycle: 'in-use', name: 'Tag tickets', template: 'extract' });
  s = saveSetupRisk(s, id, { ...RISK, by: 'priya' });
  s = setStartingAuthority(s, id, { today: 'acts' });
  s = startContractDraft(s, id, { by: 'priya' });
  s = finalizeContract(reviewAll(s, id), id, { by: 'priya' });
  const d = defaultsFor(s, id);
  s = saveCriteria(s, id, { criteria: d.criteria, requirements: d.requirements, by: 'priya' });
  return [s, id];
}
const BASELINE = { currentBehavior: 'Tags every ticket on arrival; agents can retag.', humanInvolvement: 'Agents see the tag and fix wrong ones.', permissions: 'Writes the tag field only.', safeguards: 'Unknown' };

test('an in-use capability can\'t be confirmed without a baseline of what it does today', () => {
  const [s, id] = readyInUse();
  const r = setupReview(s, id);
  assert.equal(r.ready, false);
  assert.match(r.missing.find((m) => m.step === 'today').text, /already in use: record what it does today/);
  assert.throws(() => confirmSetup(s, id, { by: 'priya' }), /record what it does today/);
  // Every one of the four is needed; a partial baseline still blocks.
  const partial = recordBaseline(s, id, { fields: { currentBehavior: BASELINE.currentBehavior }, by: 'priya', reason: 'Started.' });
  assert.match(setupReview(partial, id).missing.find((m) => m.step === 'today').text, /where people are involved today; permissions and actions it has today; safeguards in place today/);
});

test('a baseline can say "Unknown", and effective authority may stay unknown or not recorded', () => {
  const [s0, id] = readyInUse();
  for (const effective of [{ status: 'unknown' }, { status: 'not-recorded' }]) {
    const s = recordBaseline(s0, id, { fields: BASELINE, effective, by: 'priya', reason: 'What it does today.' });
    const r = setupReview(s, id);
    assert.equal(r.ready, true, effective.status);
    assert.ok(r.open.some((o) => /how independently it really operates today isn't known/.test(o)), 'shown as open, not blocking');
    const c = confirmSetup(s, id, { by: 'priya' });
    assert.equal(getCapability(c, id).authority.level, 1, 'declared start stays at Level 1, whatever it does today');
  }
  const known = recordBaseline(s0, id, { fields: BASELINE, effective: { level: 3, note: 'It files tags itself; nobody approves each one.' }, by: 'priya', reason: 'What it does today.' });
  assert.equal(setupReview(known, id).summary.authority.effective.level, 3);
  assert.equal(confirmSetup(known, id, { by: 'priya' }).decisionRecords.at(-1).next.level, 1);
});

test('a planned capability needs no baseline to be confirmed', () => {
  const [s, id] = readyDraft();
  assert.equal(getCapability(s, id).setup.lifecycle, 'planned');
  assert.equal(baselineVersions(s, id).length, 0);
  assert.equal(setupReview(s, id).ready, true);
  assert.ok(!setupReview(s, id).missing.some((m) => m.step === 'today'));
});

// ---------------------------------------------------------------------------
// Context intake
// ---------------------------------------------------------------------------

test('a description is matched into suggested facts; none drives setup until confirmed one at a time', () => {
  const s0 = initialState();
  assert.throws(() => suggestFromDescription(s0, { description: 'Too short', by: 'priya' }), /a sentence or two/);
  const text = 'Our support team uses AI to recommend refunds for customer orders. A person approves each one. We are piloting it.';
  let s = suggestFromDescription(s0, { description: text, by: 'priya' });
  assert.equal(contextDescription(s), text);
  assert.deepEqual(Object.fromEntries(Object.entries(contextNow(s)).map(([k, f]) => [k, f.status])), { aiActions: 'suggested', humanInvolvement: 'suggested', consequenceAreas: 'suggested', environment: 'suggested', stage: 'suggested', purpose: 'suggested' });
  // 6A.2: who does each action is read, so "A person approves each one" is where people enter.
  assert.equal(contextNow(s).humanInvolvement.value, 'A person approves each one.');
  assert.equal(contextNow(s).purpose.source, 'description');
  assert.deepEqual(confirmedContext(s), {});
  s = reviewContextFact(s, 'purpose', { decision: 'confirm', by: 'priya' });
  assert.deepEqual(Object.keys(confirmedContext(s)), ['purpose']);
  assert.deepEqual(interpretDescription(text).aiActions, ['Recommends']);
  assert.deepEqual(familiesFor(['Recommends', 'Drafts']), ['recommend', 'draft']);
});

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

test('eight template families plus Start from scratch, one shape, and no numbers anywhere', () => {
  assert.deepEqual(TEMPLATE_FAMILIES.map((t) => t.name), ['Knowledge / Research', 'Draft / Create', 'Extract / Classify', 'Recommend', 'Customer / User Interaction', 'Workflow Automation', 'Action / Transaction', 'Monitor / Detect']);
  assert.equal(STARTING_POINTS.at(-1).name, 'Start from scratch');
  for (const t of STARTING_POINTS) {
    assert.deepEqual(Object.keys(t).sort(), ['boundaries', 'description', 'evidence', 'examples', 'failureTypes', 'focus', 'id', 'name', 'questions', 'requirements']);
    for (const [section, lines] of Object.entries(t.boundaries)) {
      assert.ok(SECTION_KEYS.includes(section), `${t.id}: ${section}`);
      for (const line of lines) assert.ok(!/\d/.test(line), `${t.id}: "${line}" sets a number`);
    }
    for (const r of t.requirements) assert.ok(!/\d/.test(r.text), `${t.id}: "${r.text}"`);
  }
});

// ---------------------------------------------------------------------------
// Established capabilities are untouched
// ---------------------------------------------------------------------------

test('Northstar and State capabilities are established: no setup state, no records rewritten, authority works as before', () => {
  const s = initialState();
  for (const c of s.capabilities) {
    assert.equal(setupState(s, c.id), 'established');
    assert.equal(setupConfirmed(s, c.id), true);
    assert.equal(Object.hasOwn(c, 'setup'), false);
  }
  const st = findWorkspace('state').build({ today: '2026-10-16' });
  assert.equal(setupState(st, st.capabilities[0].id), 'established');
  // Their defaults are the ones they were set up with.
  assert.ok(defaultsFor(s, 'account-closure').criteria.some((c) => /\d/.test(c.target)));
});

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

import { setPeople, setToday } from '../src/ui.js';
import { contextView, setupHubView, reviewView, setupSequence } from '../src/views/setupflow.js';
import { criteriaEditorView } from '../src/views/criteria.js';
import { contractBuilderView } from '../src/views/contract.js';
import { summaryTab } from '../src/views/cap-status.js';
import { overviewTodos, authorityRows } from '../src/store/index.js';
import { decisionRecordView } from '../src/views/decisions.js';

const q = (str = '') => new URLSearchParams(str);
const strip = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, '\'').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
function render(s, view) {
  setPeople(people(s));
  setToday(s.today);
  try { return String(view()); } finally { setPeople(null); }
}

test('Context screen: each suggested fact has its own Confirm and Reject, no confirm-all, and nothing claims to be AI', () => {
  const s = suggestFromDescription(initialState(), { description: 'Our support team uses AI to recommend refunds for customer orders. We are piloting it.', by: 'priya' });
  const page = render(s, () => contextView(s, q()));
  assert.equal((page.match(/data-action="fact-confirm"/g) || []).length, Object.keys(contextNow(s)).length);
  assert.equal((page.match(/data-action="fact-reject"/g) || []).length, Object.keys(contextNow(s)).length);
  assert.doesNotMatch(strip(page), /confirm all|accept all/i);
  assert.match(strip(page), /Based on your answers/);
  assert.match(strip(page), /with simple rules, not AI/);
  assert.doesNotMatch(strip(page), /Suggested by AI/);
});

test('the setup hub follows the sequence; an in-use capability gets "What it does today"', () => {
  let [s, id] = draft();
  assert.deepEqual(setupSequence(s, id).map((st) => st.id), ['context', 'capability', 'risk', 'boundaries', 'requirements', 'evidence', 'people', 'review']);
  [s, id] = draft({ lifecycle: 'in-use', name: 'Tag tickets' });
  assert.deepEqual(setupSequence(s, id).map((st) => st.id).slice(0, 4), ['context', 'capability', 'today', 'risk']);
  const page = strip(render(s, () => setupHubView(s, id, q())));
  assert.match(page, /no authority can be proposed or granted until the setup is confirmed/);
  assert.match(page, /Answer the Risk questions first/);
});

test('the Requirements editor lists suggestions unticked, and warns before results', () => {
  let [s, id] = draft();
  s = saveSetupRisk(s, id, { ...RISK, by: 'priya' });
  const page = render(s, () => criteriaEditorView(s, id, q()));
  const boxes = page.match(/name="use-suggestion"[^>]*>/g) || [];
  assert.ok(boxes.length > 3);
  assert.ok(boxes.every((b) => !/checked/.test(b)), 'nothing is added for you');
  assert.match(strip(page), /Minimum cases: Needs decision/);
  assert.match(strip(page), /Once results are recorded, Requirements, Targets and governed People choices may need sign-off/);
  assert.doesNotMatch(strip(page), /≥ \d|\d+%/, 'no suggested number on the page');
});

test('the Boundaries builder labels suggestions by their source and offers "Fill in the number" instead of Accept for a blank', () => {
  let [s, id] = draft();
  s = startContractDraft(saveSetupRisk(s, id, { ...RISK, by: 'priya' }), id, { by: 'priya' });
  const page = render(s, () => contractBuilderView(s, id, q()));
  assert.match(page, /Template suggestion/);
  assert.match(page, /Based on your answers/);
  assert.match(page, /Fill in the number/);
  assert.doesNotMatch(page, /Suggested by AI/);
  const blanks = capData(s, id).contractDraft.lines.filter((l) => l.original.includes(BLANK)).length;
  const accepts = (page.match(/data-action="suggestion-accept"/g) || []).length;
  assert.equal(accepts, capData(s, id).contractDraft.lines.length - blanks);
});

test('the review screen: only the owner can confirm, Boundaries read as written vs enforced, and open items are listed', () => {
  const [s, id] = readyDraft();
  const asOwner = render({ ...s, actingAs: 'priya' }, () => reviewView({ ...s, actingAs: 'priya' }, id, q()));
  assert.match(asOwner, /data-action="confirm-setup"[^>]*>Confirm setup as/);
  assert.doesNotMatch(asOwner.match(/data-action="confirm-setup"[^>]*>/)[0], /disabled/);
  const other = Object.keys(people(s)).find((k) => k !== 'priya');
  const asOther = render({ ...s, actingAs: other }, () => reviewView({ ...s, actingAs: other }, id, q()));
  assert.match(asOther.match(/data-action="confirm-setup"[^>]*>/)[0], /disabled/);
  const text = strip(asOwner);
  assert.match(text, /Written Boundary/);
  assert.match(text, /It doesn't mean nothing is enforced/);
  assert.match(text, /Open, and allowed at confirmation/);
  assert.match(text, /Overall Risk Unknown/);
});

test('a draft says no authority is granted, everywhere it shows', () => {
  const [s, id] = draft();
  assert.match(strip(render(s, () => summaryTab(s, getCapability(s, id), capData(s, id)))), /No authority granted yet/);
  assert.ok(overviewTodos(s).some((t) => t.capabilityId === id && /Finish setting up/.test(t.title)));
  assert.equal(authorityRows(s).find((r) => r.capabilityId === id).level, 'Not granted yet');
});
