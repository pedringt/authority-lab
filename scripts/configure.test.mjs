// Configure evidence, coverage, and the setup and proposing changes (#126,
// PR 2): the product person maps evidence to the bar, sees what is covered,
// and tests are one source among several.

import { test } from 'node:test';
import { decideWith, requirementsMet } from './helpers.mjs';
import assert from 'node:assert/strict';
import {
  setRationale,
  initialState, addCapability, defaultsFor, saveCriteria, current, criteriaLocked, openProposal, getCapability, capData, people, authorize, selectDecision, proposeAuthority,
  importEvidence, EVIDENCE_SCHEMA, recordManualEvidence, mapEvidence, barFromWords, evidenceCoverage, coverageText, rowCoverage, startTestRun, advanceTestRun, addStarterScenarios,
  saveStakeholders, realUseEvidence, findSource, setOutcome, setRolloutField, replaceProposal,
} from '../src/store/index.js';
import { setPeople } from '../src/ui.js';
import { configureEvidenceView } from '../src/views/configure.js';
import { setupSteps as setupStepsView } from '../src/views/setup.js';

const LOW = { impact: 'Low', reversibility: 'Easy to reverse', exposure: 'Internal only' };

// A new capability with the default checks saved, no results yet.
function fresh() {
  let s = addCapability(initialState(), { name: 'Summarise notes', summary: 'Summarises notes for a reviewer.', owner: 'maya', risk: LOW, today: 'recommends', by: 'maya' });
  const id = s.capabilities.at(-1).id;
  const d = defaultsFor(s, id);
  s = saveCriteria(s, id, { criteria: d.criteria, requirements: d.requirements, by: 'maya' });
  s = saveStakeholders(s, id, { stakeholders: [{ person: 'maya', team: 'Product', position: 'Owner', stance: 'expand', reasoning: 'I own it.' }, { person: 'priya', team: 'Support Operations', position: 'Reviewer', stance: 'expand', reasoning: 'My team reads the summaries.' }], by: 'maya' });
  return { s, id };
}
const evalEnv = (id, over = {}) => ({
  schema: EVIDENCE_SCHEMA, id: 'evals:eval:1', capabilityId: id, source: { system: 'Evals', capability: 'Notes suite' }, kind: 'eval', observedAt: '2026-10-05',
  measurements: [{ metric: 'answer-quality', type: 'rate', passed: 88, total: 100 }, { metric: 'answer-quality', type: 'rate', passed: 9, total: 12, segment: 'Long notes' }], ...over,
});
const req = (s, id, rid) => evidenceCoverage(s, id).requirements.find((r) => r.id === rid);

test('the bar comes from the wording, including "No …" as at most 0', () => {
  assert.deepEqual(barFromWords('Overall accuracy ≥ 85%'), { op: '>=', value: 85 });
  assert.deepEqual(barFromWords('High-severity error rate < 5%'), { op: '<', value: 5 });
  assert.deepEqual(barFromWords('Minimum 50 pilot cases'), { op: '>=', value: 50 });
  assert.deepEqual(barFromWords('at most 2 escalations'), { op: '<=', value: 2 });
  assert.deepEqual(barFromWords('No unresolved critical incidents'), { op: '<=', value: 0 });
  assert.equal(barFromWords('Key stakeholders agree'), null);
});

test('before results, mapping a row saves directly; the comparison and number come from its wording', () => {
  const { s: s0, id } = fresh();
  const s = mapEvidence(s0, id, { rowKind: 'requirement', rowId: 'accuracy', measure: { source: 'evals-notes-suite', metric: 'answer-quality', stat: 'rate' }, by: 'maya' });
  assert.deepEqual(current(s, id, 'requirements').find((r) => r.id === 'accuracy').measure, { source: 'evals-notes-suite', metric: 'answer-quality', stat: 'rate', op: '>=', value: 85 });
  assert.equal(openProposal(s, id, 'criteria'), null, 'no approval needed before results');
  // "No unresolved critical incidents" is decided by a person by default
  // (#143 review); choosing evidence for it is refused until it is changed
  // to be judged by evidence. Then it maps as at most 0.
  assert.throws(() => mapEvidence(s, id, { rowKind: 'requirement', rowId: 'incidents', measure: { source: 'manual-review', metric: 'unresolved-critical-incidents', stat: 'count' }, by: 'maya' }), /decided by a person, so evidence can't be chosen for it\. To measure it instead, change how it is judged in Requirements first\./);
  const measured = saveCriteria(s, id, { criteria: current(s, id, 'criteria'), requirements: current(s, id, 'requirements').map((r) => (r.id === 'incidents' ? { ...r, judgment: 'evidence' } : r)), by: 'maya', reason: 'Incidents are counted.' });
  const s2 = mapEvidence(measured, id, { rowKind: 'requirement', rowId: 'incidents', measure: { source: 'manual-review', metric: 'unresolved-critical-incidents', stat: 'count' }, by: 'maya' });
  assert.deepEqual(current(s2, id, 'requirements').find((r) => r.id === 'incidents').measure, { source: 'manual-review', metric: 'unresolved-critical-incidents', stat: 'count', op: '<=', value: 0 });
  // A row with no number in its words can't be measured.
  assert.throws(() => mapEvidence(s, id, { rowKind: 'target', rowId: 'confidence', measure: { metric: 'x', stat: 'rate' }, by: 'maya' }), /doesn't say a number to check/);
  // Removing a mapping; removing one that isn't there says so.
  const s3 = mapEvidence(s2, id, { rowKind: 'requirement', rowId: 'accuracy', measure: null, by: 'maya' });
  assert.equal(current(s3, id, 'requirements').find((r) => r.id === 'accuracy').measure, undefined);
  assert.throws(() => mapEvidence(s3, id, { rowKind: 'requirement', rowId: 'accuracy', measure: null, by: 'maya' }), /nothing to remove/);
});

test('the targets editor keeps a mapping when it saves words only, and moves its number with the words', () => {
  const { s: s0, id } = fresh();
  let s = mapEvidence(s0, id, { rowKind: 'requirement', rowId: 'accuracy', measure: { metric: 'answer-quality', stat: 'rate' }, by: 'maya' });
  // The editor sends rows without measures.
  const strip = (rows) => rows.map(({ measure, ...r }) => r);
  const reqs = strip(current(s, id, 'requirements')).map((r) => (r.id === 'accuracy' ? { ...r, text: 'Overall accuracy ≥ 90%' } : r));
  s = saveCriteria(s, id, { criteria: strip(current(s, id, 'criteria')), requirements: reqs, by: 'maya' });
  assert.equal(current(s, id, 'requirements').find((r) => r.id === 'accuracy').measure.value, 90);
});

test('after results, linking a row with no evidence is recorded; changing an existing link is a proposal (#155, R6)', () => {
  const { s: s0, id } = fresh();
  const s = importEvidence(s0, evalEnv(id));
  assert.equal(criteriaLocked(s, id), true);
  assert.throws(() => mapEvidence(s, id, { rowKind: 'requirement', rowId: 'accuracy', measure: { metric: 'answer-quality', stat: 'rate' }, by: 'maya' }), /Results already exist, so say why/);
  const linked = mapEvidence(s, id, { rowKind: 'requirement', rowId: 'accuracy', measure: { metric: 'answer-quality', stat: 'rate' }, by: 'maya', reason: 'Judge accuracy from the connected eval suite.' });
  assert.equal(openProposal(linked, id, 'criteria'), null, 'no approval to link an unlinked row');
  assert.equal(current(linked, id, 'requirements').find((r) => r.id === 'accuracy').measure.metric, 'answer-quality');
  const p = mapEvidence(linked, id, { rowKind: 'requirement', rowId: 'accuracy', measure: { metric: 'other-metric', stat: 'rate' }, by: 'maya', reason: 'Use the other metric instead.' });
  assert.ok(openProposal(p, id, 'criteria'), 'changing an existing link needs approval');
  assert.equal(current(p, id, 'requirements').find((r) => r.id === 'accuracy').measure.metric, 'answer-quality', 'nothing changes until it is approved');
});

test('coverage tells "no source", "no results", "needs more cases", "stale" and "covered" apart, whatever passes', () => {
  const { s: s0, id } = fresh();
  let s = s0;
  const map = (rowId, measure) => { s = mapEvidence(s, id, { rowKind: 'requirement', rowId, measure, by: 'maya' }); };
  map('accuracy', { source: 'evals-notes-suite', metric: 'answer-quality', stat: 'rate' });
  map('min-cases', { source: 'evals-notes-suite', metric: 'answer-quality', stat: 'sample' });
  map('severe', { source: 'evals-notes-suite', metric: 'answer-quality', stat: 'fail-rate', minSample: 500 });
  map('override', { source: 'manual-review', metric: 'override-rate', stat: 'value' });
  assert.equal(req(s, id, 'accuracy').status, 'no-data');
  assert.equal(req(s, id, 'incidents').status, 'no-source');
  s = importEvidence(s, evalEnv(id));
  assert.equal(req(s, id, 'accuracy').status, 'covered');
  assert.equal(req(s, id, 'accuracy').passing, true);
  assert.equal(req(s, id, 'min-cases').status, 'covered', '100 cases meets 50');
  assert.equal(req(s, id, 'severe').status, 'insufficient', '100 cases is short of its own 500');
  assert.equal(req(s, id, 'severe').judged.text, '12% across 100 cases (100 cases so far, 500 needed)');
  assert.equal(req(s, id, 'override').status, 'no-data');
  // Covered but failing is still covered: coverage isn't readiness.
  s = recordManualEvidence(s, id, { by: 'maya', label: 'Override rate', kind: 'production', type: 'value', value: '31', unit: '%', total: '40' });
  assert.equal(req(s, id, 'override').status, 'covered');
  assert.equal(req(s, id, 'override').passing, false);
  const cov = evidenceCoverage(s, id);
  assert.equal(cov.sufficient, 3);
  assert.equal(cov.total, 5);
  assert.equal(coverageText(cov), '3 of 5 Requirements have sufficient evidence; "High-severity error rate < 5%" still needs more cases (12% across 100 cases (100 cases so far, 500 needed)).');
  // Thirty-one days on, the eval is past its 30-day window: stale, still counted.
  const later = { ...s, today: '2026-11-05' };
  assert.equal(req(later, id, 'accuracy').status, 'stale');
  assert.equal(req(later, id, 'accuracy').age, 31);
  assert.equal(evidenceCoverage(later, id).sufficient, 3, 'stale evidence still counts');
  assert.equal(findSource(s, 'evals-notes-suite').freshForDays, 30);
});

test('Authority Lab tests are a source: tests passed by type and serious failures, read from the recorded run', () => {
  const { s: s0, id } = fresh();
  let s = mapEvidence(s0, id, { rowKind: 'requirement', rowId: 'accuracy', measure: { source: 'authority-lab-tests', metric: 'tests-passed', stat: 'rate' }, by: 'maya' });
  assert.equal(req(s, id, 'accuracy').status, 'no-data');
  s = addStarterScenarios(s, id, { by: 'maya' });
  s = startTestRun(s, id);
  for (let i = 0; i < 200 && capData(s, id).testRun.status === 'running'; i++) s = advanceTestRun(s, id);
  const c = req(s, id, 'accuracy');
  assert.ok(['covered', 'stale'].includes(c.status));
  const total = capData(s, id).scenarios.length;
  assert.match(c.judged.text, new RegExp(`across ${total} cases$`));
  const byType = rowCoverage(s, id, { measure: { source: 'authority-lab-tests', metric: 'tests-passed', segment: 'Adversarial', stat: 'rate', op: '>=', value: 50 } });
  assert.equal(byType.status, 'covered');
});

test('more authority can be proposed on any measured evidence, without in-app tests; Level 3 needs real use', () => {
  const { s: s0, id } = fresh();
  assert.throws(() => proposeAuthority(s0, id, 2, { by: 'maya' }), /There is no evidence yet/);
  // A connected eval alone is enough to open a decision about Draft.
  const s = importEvidence(s0, evalEnv(id));
  assert.equal(capData(s, id).testRun.lastRun, null, 'no in-app tests at all');
  const opened = proposeAuthority(s, id, 2, { by: 'maya' });
  assert.ok(opened.capabilityData[id].decision.proposed);
  assert.equal(setupStepsView(s, id).find((st) => st.id === 'decision').needs, true, 'setup offers the decision too');
  // At Draft, evals are not real use: Level 3 waits.
  let ready = decideWith(opened, id, 'expand');
  ready = setOutcome(setOutcome(ready, id, 0, 'metric', 'Summary accuracy'), id, 0, 'target', '≥ 90%');
  ready = setOutcome(setOutcome(ready, id, 1, 'metric', 'Time to read a note'), id, 1, 'target', 'at least 30% faster');
  for (const [k, v] of Object.entries({ owner: 'maya', scope: 'Summaries for the support queue only.', startDate: '2026-10-08', feedbackChannel: '#notes-feedback', reviewerNotes: 'Read each summary against its note.', reviewDate: '2026-10-21' })) ready = setRolloutField(ready, id, k, v);
  const atDraft = authorize(replaceProposal(requirementsMet(setRationale(ready, id, 'The connected eval meets every Requirement.'), id), id, { by: 'maya' }), id, { by: 'maya' });
  assert.equal(getCapability(atDraft, id).authority.level, 2);
  assert.equal(realUseEvidence(atDraft, id), false);
  assert.throws(() => proposeAuthority(atDraft, id, 3, { by: 'maya' }), /Level 3 needs evidence from real use/);
  // Production results, connected or recorded by hand, are real use.
  const prod = importEvidence(atDraft, evalEnv(id, { id: 'evals:production:1', kind: 'production', measurements: [{ metric: 'answer-quality', type: 'rate', passed: 40, total: 44 }] }));
  assert.ok(proposeAuthority(prod, id, 3, { by: 'maya' }).capabilityData[id].decision.proposed);
  const byHand = recordManualEvidence(atDraft, id, { by: 'maya', label: 'Reviewed summaries', kind: 'production', type: 'rate', passed: '19', total: '20' });
  assert.ok(proposeAuthority(byHand, id, 3, { by: 'maya' }).capabilityData[id].decision.proposed);
});

test('the Configure evidence page: coverage first, each row\'s evidence, gaps with ways to fill them, approval after results', () => {
  const { s: s0, id } = fresh();
  let s = mapEvidence(s0, id, { rowKind: 'requirement', rowId: 'accuracy', measure: { source: 'evals-notes-suite', metric: 'answer-quality', stat: 'rate' }, by: 'maya' });
  s = importEvidence(s, evalEnv(id));
  setPeople(people(s));
  const h = String(configureEvidenceView(s, id, new URLSearchParams()));
  assert.match(h, /<h1>Configure evidence<\/h1>/);
  assert.match(h, /<p class="decide-big">1 of 5 Requirements have sufficient evidence; &quot;Minimum 50 pilot cases&quot; has no evidence source mapped\.<\/p>/);
  assert.match(h, /<strong>Evals · Notes suite<\/strong> · answer-quality/);
  assert.match(h, /badge-pass">Sufficient evidence</);
  assert.match(h, /<h2>Fill the gaps<\/h2>[\s\S]*Choose which evidence judges it: a connected source, Authority Lab tests, or a manual review\./);
  assert.doesNotMatch(h, /Run the tests first|must (add|write) tests/i, 'tests are one option, never required');
  assert.match(h, /Results already exist/);
  const edit = String(configureEvidenceView(s, id, new URLSearchParams('row=requirement:severe')));
  assert.match(edit, /data-form="map-evidence" data-capability="summarise-notes" data-row="severe" data-kind="requirement"/);
  assert.match(edit, /The bar comes from its wording: <strong>less than 5<\/strong>\./);
  // #155: this row has no evidence yet, so linking it is recorded, not proposed.
  assert.match(edit, /Why \(results exist: linking it is recorded with your name, no approval needed\)/);
  assert.match(edit, />Record this link</);
  const mapped = String(configureEvidenceView(s, id, new URLSearchParams('row=requirement:accuracy')));
  assert.match(mapped, /Why \(results exist, so changing its evidence needs approval\)/);
  assert.match(mapped, />Propose this change</);
  // The setup checklist names the three evidence steps.
  const steps = setupStepsView(s, id).map((x) => x.title);
  assert.deepEqual(steps.slice(2, 6), ['Set what good looks like', 'Configure evidence', 'Review evidence coverage', 'Fill the gaps']);
});

// ---------------------------------------------------------------------------
// PR 3: the Northstar example and Monitor's evidence signals (#126)
// ---------------------------------------------------------------------------

import { evidenceSignals, evidenceSources as sourcesOf } from '../src/store/index.js';
import { evidenceView } from '../src/views/evidence.js';
import { capabilityView } from '../src/views/capability.js';

const RR = 'refund-recommendation';

test('the example: Refund recommendation is judged by a connected platform, ticketing, an eval suite and a manual review, and the story is unchanged', () => {
  const s = initialState();
  const cov = evidenceCoverage(s, RR);
  const by = Object.fromEntries(cov.requirements.map((r) => [r.id, r]));
  assert.deepEqual(Object.fromEntries(Object.entries(by).map(([k, r]) => [k, r.row.measure.source])), {
    'min-cases': 'support-platform-refund-decisions', accuracy: 'support-platform-refund-decisions', severe: 'ticketing-escalations',
    override: 'support-platform-refund-decisions', incidents: 'manual-review', 'high-value': 'support-platform-refund-decisions',
  });
  // The demo still reads 5 of 6, with the high-value gap in its own words.
  assert.equal(cov.requirements.filter((r) => r.row.met).length, 5);
  assert.equal(by['high-value'].row.current, '18');
  assert.match(by['high-value'].row.gap, /^High-value refund performance needs more evidence\./);
  assert.equal(by.severe.row.current, '1.4% across 218 cases');
  assert.equal(by.incidents.row.met, true, 'Daniel\'s review: 0 unresolved critical incidents');
  assert.equal(coverageText(cov), '5 of 6 Requirements have sufficient evidence; "Minimum 40 high-value refund cases" still needs more cases (18 of 40 cases).');
  // The eval suite last ran on Sep 3, past its 30-day window: the quality target is stale, still counted.
  const quality = cov.targets.find((t) => t.id === 'quality');
  assert.equal(quality.status, 'stale');
  assert.equal(quality.age, 34);
  // Everything about it says demo, nothing says live import.
  setPeople(people(s));
  const ev = String(evidenceView(s, RR, new URLSearchParams(), { embedded: true }));
  assert.match(ev, /Demo data · from Support platform/);
  assert.match(ev, /Demo data · recorded by Daniel Okafor/);
  assert.doesNotMatch(ev, /Imported from/);
  assert.ok(sourcesOf(s).filter((x) => x.example).every((x) => /fictional/.test(x.description)));
});

test('Monitor lists what to look at in the evidence; warnings never block', () => {
  const s = initialState();
  const kinds = evidenceSignals(s, RR).map((x) => x.kind);
  assert.deepEqual(kinds, ['new', 'stale', 'coverage', 'disagreement']);
  // A check that was met and now isn't is a reason to reconsider, not a block.
  const worse = importEvidence(s, { schema: EVIDENCE_SCHEMA, id: 'northstar:production:refund-pilot-2026-10-07', capabilityId: RR, source: { system: 'Support platform', capability: 'Refund decisions', environment: 'production' }, kind: 'production', observedAt: '2026-10-07', measurements: [{ metric: 'refund-decisions', type: 'rate', passed: 180, total: 220 }] });
  const sig = evidenceSignals(worse, RR);
  assert.ok(sig.some((x) => x.kind === 'reconsider' && /"Overall accuracy ≥ 92%" is not met now: 81.8% across 220 cases\./.test(x.what)));
  assert.equal(getCapability(worse, RR).authority.level, getCapability(s, RR).authority.level, 'evidence never changes authority by itself');
  setPeople(people(worse));
  const h = String(capabilityView(worse, RR, new URLSearchParams('tab=monitor')));
  assert.match(h, /<strong>Evidence<\/strong><span class="mh-line-meta">\d+ things to look at<\/span>/);
  assert.match(h, /badge-fail">Reconsider</);
  assert.match(h, /Warnings only: none of these blocks anything or changes authority\./);
});
