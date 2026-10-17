// The lightweight evidence path (#142). Paige's answers P1–P8, 2026-10-16:
// a small team with no governance, eval, observability or data stack can
// collect enough credible evidence inside Authority Lab for an authority
// decision, on the same model as the committed-file path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState, startEmpty, setUpWorkspace, addPerson, addCapability, getCapability, capData, current, findWorkspace, advanceToday,
  saveCriteria, saveScenarios, saveStakeholders, startTestRun, criteriaLocked, performanceResultsSeen, readiness, requirementsNow, evidenceCoverage, coverageText, evidenceSources, mapEvidence, proposeAuthority,
  isDemoWorkspace, recordOutcome, outcomesNow, outcomeMeasurements, recordJudgment, judgmentsFor, recordIncident, setIncidentStatus, incidentsFor, incidentStatus,
  recordFeedback, recordImpactActual, impactActuals, recordResult, judgedBy, unlinkedBeforeResults, rowMetric, uploadEvidence, parseCsv, measurementsFromRows, evidenceImports, MANUAL_SOURCE, FEEDBACK_SOURCE,
} from '../src/store/index.js';

// A small accounting firm: Ana runs it alone at first, then names Ben as a
// Reviewer and Cara as a Stakeholder. No integrations of any kind.
const ANA = 'ana-ruiz';
const BEN = 'ben-okoro';
const CARA = 'cara-lim';
function firm() {
  let s = setUpWorkspace(startEmpty(), { workspace: { name: 'Ruiz Tax' }, workflow: { name: 'Client email' }, founder: { name: 'Ana Ruiz', title: 'Partner' } });
  s = addPerson(s, { name: 'Ben Okoro', title: 'Tax lead', team: 'Tax', by: ANA, reason: 'Reviews the drafts.' });
  s = addPerson(s, { name: 'Cara Lim', title: 'Office manager', team: 'Office', by: ANA, reason: 'Hears from clients.' });
  s = addCapability(s, { name: 'Draft deadline emails', summary: 'Drafts emails reminding clients of tax deadlines.', owner: ANA, risk: { impact: 'Medium', reversibility: 'Easy to reverse', exposure: 'Customer-facing' }, today: 'recommends', by: ANA });
  const id = s.capabilities.at(-1).id;
  s = saveStakeholders(s, id, { stakeholders: [{ person: BEN, team: 'Tax', role: 'reviewer' }, { person: CARA, team: 'Office' }], by: ANA });
  s = saveCriteria(s, id, {
    criteria: [],
    requirements: [
      { id: 'min-cases', text: 'Minimum 20 cases', kind: 'coverage' },
      { id: 'accuracy', text: 'Overall accuracy ≥ 90%' },
      { id: 'incidents', text: 'No unresolved critical incidents' },
      { id: 'templates', text: 'The tax lead has approved the email templates' },
    ],
    by: ANA,
    reason: 'Our own bar for a first pilot, written by us.',
  });
  return [s, id];
}
const req = (s, id, rid) => requirementsNow(s, id).find((r) => r.id === rid);
const SCENARIOS = [
  { group: 'standard', name: 'April deadline reminder', situation: 'Client files every April.', expected: 'A correct reminder with the right date.' },
  { group: 'standard', name: 'Extension already filed', situation: 'Client has an extension.', expected: 'No reminder for the April date.' },
  { group: 'edge', name: 'Two businesses', situation: 'Client owns two businesses with different year ends.', expected: 'One reminder per business.' },
];

// ---------------------------------------------------------------------------
// P1: the demo may simulate; a real workspace records real outcomes
// ---------------------------------------------------------------------------

test('only the Northstar demo may simulate; a workspace started empty, or State, is real', () => {
  assert.equal(isDemoWorkspace(initialState()), true);
  const [s, id] = firm();
  assert.equal(isDemoWorkspace(s), false);
  assert.equal(isDemoWorkspace(findWorkspace('state').build({ today: '2026-10-16' })), false);
  const withCases = saveScenarios(s, id, { scenarios: SCENARIOS, by: ANA });
  assert.ok(capData(withCases, id).scenarios.every((sc) => sc.pass === undefined && !sc.simulated), 'a real test case carries no result of its own');
  assert.throws(() => startTestRun(withCases, id), /Authority Lab doesn't run your AI/);
  assert.equal(performanceResultsSeen(withCases, id), false, 'writing test cases is not a result');
});

test('recording outcomes: Pass / Fail (with severity) / Unable to judge; unable is neither; nothing is overwritten', () => {
  let [s, id] = firm();
  s = saveScenarios(s, id, { scenarios: SCENARIOS, by: ANA });
  const [a, b, c] = capData(s, id).scenarios.map((x) => x.id);
  assert.throws(() => recordOutcome(s, id, a, { result: 'fail', happened: 'It gave the wrong date.', by: ANA }), /how serious/);
  assert.throws(() => recordOutcome(s, id, a, { result: 'maybe', happened: 'Hmm.', by: ANA }), /Pass, Fail or Unable/);
  assert.throws(() => recordOutcome(s, id, a, { result: 'pass', happened: '', by: ANA }), /what actually happened/);
  s = recordOutcome(s, id, c, { result: 'unable', happened: 'We had no two-business client to try.', by: ANA });
  assert.equal(performanceResultsSeen(s, id), false, 'Unable to judge is not a result');
  assert.deepEqual(outcomeMeasurements(s, id), []);
  s = recordOutcome(s, id, a, { result: 'pass', happened: 'Right date, right tone.', by: BEN });
  s = recordOutcome(s, id, b, { result: 'fail', severity: 'high', happened: 'Sent a reminder despite the extension.', by: BEN });
  assert.equal(performanceResultsSeen(s, id), true);
  const [rate, serious] = outcomeMeasurements(s, id);
  assert.deepEqual([rate.passed, rate.total, serious.value], [1, 2, 1], 'unable is left out of the rate');
  // Run again: a new outcome, the old one kept.
  s = recordOutcome(s, id, b, { result: 'pass', happened: 'Fixed the extension check; now skipped.', by: BEN });
  assert.equal(capData(s, id).outcomes.length, 4);
  assert.equal(outcomesNow(s, id).find((x) => x.scenario.id === b).outcome.result, 'pass');
  assert.equal(capData(s, id).outcomes.find((o) => o.scenarioId === b).result, 'fail', 'the earlier outcome is still on record');
  const outsider = addPerson(s, { name: 'Dee Park', title: 'Intern', team: 'Office', by: ANA, reason: 'Joins the office.' });
  assert.throws(() => recordOutcome(outsider, id, a, { result: 'pass', happened: 'Looked fine.', by: 'dee-park' }), /isn't the owner or a named stakeholder/);
});

test('in the demo, simulation still works and is the only kind of run there', () => {
  const s = initialState();
  const tc = 'ticket-classification';
  assert.doesNotThrow(() => startTestRun(saveScenarios(s, tc, { scenarios: SCENARIOS, by: getCapability(s, tc).owner }), tc));
});

// ---------------------------------------------------------------------------
// A: recording a result from the row
// ---------------------------------------------------------------------------

test('a result recorded from a Requirement links that row to manual results first, so no metric id is typed', () => {
  let [s, id] = firm();
  s = recordResult(s, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 9, total: 10, kind: 'eval', by: BEN });
  const r = current(s, id, 'requirements').find((x) => x.id === 'accuracy');
  assert.deepEqual(r.measure, { source: MANUAL_SOURCE, metric: rowMetric('requirement', 'accuracy'), stat: 'rate', op: '>=', value: 90 });
  assert.equal(req(s, id, 'accuracy').result.status, 'met');
  assert.equal(criteriaLocked(s, id), true, 'the first result locks the bar, as before');
  // After results, linking another row needs approval.
  const other = saveCriteria(firm()[0], id, { criteria: [], requirements: [...current(s, id, 'requirements').map(({ measure, ...x }) => x), { id: 'speed', text: 'At least 50% faster' }], by: ANA, reason: 'Adding speed.' });
  const locked = recordResult(other, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 9, total: 10, kind: 'eval', by: BEN });
  assert.throws(() => recordResult(locked, id, { rowKind: 'requirement', rowId: 'speed', type: 'value', value: 55, kind: 'eval', by: BEN }), /linking evidence to "At least 50% faster" needs approval/);
  assert.throws(() => recordResult(s, id, { rowKind: 'requirement', rowId: 'templates', type: 'rate', passed: 1, total: 1, kind: 'eval', by: BEN }), /doesn't say a number to check\. Judge it instead/);
  assert.throws(() => recordResult(s, id, { rowKind: 'requirement', rowId: 'min-cases', type: 'rate', passed: 1, total: 1, kind: 'eval', by: BEN }), /coverage rule/);
});

// ---------------------------------------------------------------------------
// P4: compatible results combine; P5: disagreement is Conflicting
// ---------------------------------------------------------------------------

test('three compatible manual reviews of 10 cases give 30 cases; the results themselves stay as they were', () => {
  let [s, id] = firm();
  for (const passed of [9, 8, 10]) s = recordResult(s, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed, total: 10, kind: 'eval', by: BEN });
  const r = req(s, id, 'accuracy');
  assert.deepEqual([r.judged.sample, r.judged.combined, r.result.status], [30, 3, 'met']);
  assert.match(r.result.why, /27 of 30|90%/);
  assert.match(r.result.why, /3 compatible results combined/);
  assert.equal(capData(s, id).evidence.filter((e) => e.measure && e.measure.metric === rowMetric('requirement', 'accuracy')).length, 3, 'three results on record, unchanged');
  // Different evidence modes don't combine: real use stands apart.
  const prod = recordResult(s, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 10, total: 40, kind: 'production', by: BEN });
  assert.equal(req(prod, id, 'accuracy').judged.results.length, 2, 'two independent results: test cases and real use');
  assert.equal(req(prod, id, 'accuracy').result.status, 'conflicting', 'and they disagree');
});

test('Conflicting never counts as met, shows which evidence disagrees, and stale evidence doesn\'t conflict', () => {
  let [s, id] = firm();
  // Single values don't combine: each judges on its own.
  s = saveCriteria(s, id, { criteria: [], requirements: [...current(s, id, 'requirements'), { id: 'speed', text: 'At least 50% faster' }], by: ANA, reason: 'Adding speed.' });
  s = recordResult(s, id, { rowKind: 'requirement', rowId: 'speed', type: 'value', value: 60, kind: 'eval', by: BEN });
  const later = recordResult(s, id, { rowKind: 'requirement', rowId: 'speed', type: 'value', value: 30, kind: 'eval', by: ANA });
  const r = req(later, id, 'speed');
  assert.equal(r.result.status, 'conflicting');
  assert.equal(r.met, false);
  assert.match(r.result.why, /Results disagree: Recorded by .* says (met|not met).*; Recorded by .* says (met|not met)/);
  assert.equal(evidenceCoverage(later, id).requirements.find((c) => c.id === 'speed').status, 'conflicting');
  assert.ok(readiness(later, id).unmet.some((x) => x.id === 'speed'));
  // The same disagreement with the older result past its window: no conflict, the fresh one decides.
  const aged = advanceToday(s, '2027-02-01');
  const fresh = recordResult(aged, id, { rowKind: 'requirement', rowId: 'speed', type: 'value', value: 30, kind: 'eval', by: ANA });
  assert.equal(req(fresh, id, 'speed').result.status, 'not-met');
});

// ---------------------------------------------------------------------------
// P2: judgments on Requirements with no metric
// ---------------------------------------------------------------------------

test('the Owner or a Reviewer judges a Requirement with no metric; a Stakeholder\'s input never decides it', () => {
  let [s, id] = firm();
  assert.equal(req(s, id, 'templates').result.status, 'no-evidence');
  assert.throws(() => recordJudgment(s, id, 'templates', { verdict: 'met', rationale: 'ok', by: BEN }), /Say why/);
  // Measured by structure: a linked measure, a linked Target, or a coverage rule.
  const linked = recordResult(s, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 9, total: 10, kind: 'eval', by: BEN });
  assert.throws(() => recordJudgment(linked, id, 'accuracy', { verdict: 'met', rationale: 'Looks accurate to me.', by: BEN }), /is judged by its evidence, not by a person/);
  assert.throws(() => recordJudgment(s, id, 'min-cases', { verdict: 'met', rationale: 'We reviewed plenty.', by: BEN }), /coverage rule/);
  const input = recordJudgment(s, id, 'templates', { verdict: 'met', rationale: 'Clients like the new wording.', by: CARA });
  assert.equal(req(input, id, 'templates').result.status, 'no-evidence', 'Stakeholder input alone satisfies nothing');
  assert.match(req(input, id, 'templates').result.why, /Stakeholder input: Cara Lim says met \(input doesn't decide it\)/);
  assert.equal(performanceResultsSeen(input, id), false);
  s = recordJudgment(input, id, 'templates', { verdict: 'met', rationale: 'I approved all four templates on Oct 14.', reference: 'https://example.com/templates', by: BEN });
  assert.equal(req(s, id, 'templates').result.status, 'met');
  assert.equal(performanceResultsSeen(s, id), true, 'a judgment is a result: the bar locks');
  // The Owner may judge their own capability; disagreement is Conflicting.
  const split = recordJudgment(s, id, 'templates', { verdict: 'not-met', rationale: 'Template 3 still has the old date.', by: ANA });
  assert.equal(req(split, id, 'templates').result.status, 'conflicting');
  // Each person's newer judgment replaces their own older one; the record keeps both.
  const settled = recordJudgment(split, id, 'templates', { verdict: 'met', rationale: 'Template 3 fixed and rechecked.', by: ANA });
  assert.equal(req(settled, id, 'templates').result.status, 'met');
  assert.equal(judgmentsFor(settled, id, 'templates').all.length, 4);
  const unsure = recordJudgment(recordJudgment(firm()[0], id, 'templates', { verdict: 'unknown', rationale: 'Haven\'t seen template 4 yet.', by: BEN }), id, 'templates', { verdict: 'unknown', rationale: 'Not sure either way yet.', by: ANA });
  assert.equal(req(unsure, id, 'templates').result.status, 'unknown');
  assert.equal(req(unsure, id, 'templates').met, false);
  assert.equal(performanceResultsSeen(unsure, id), false, 'Unknown is not a result');
});

test('a Requirement with no metric is judged by a person even when its wording has a number (#143 review)', () => {
  let [s, id] = firm();
  s = saveCriteria(s, id, { criteria: [], requirements: [...current(s, id, 'requirements'), { id: 'all-four', text: 'All 4 templates have been approved' }], by: ANA, reason: 'Adding the template check.' });
  assert.equal(judgedBy(s, id, current(s, id, 'requirements').find((r) => r.id === 'all-four')), 'person');
  s = recordJudgment(s, id, 'all-four', { verdict: 'met', rationale: 'Ben approved all four on Oct 14.', by: BEN });
  assert.equal(req(s, id, 'all-four').result.status, 'met');
  // A linked Target makes a Requirement evidence-judged, whatever its wording.
  let [t] = firm();
  t = saveCriteria(t, id, { criteria: [{ name: 'Template approval', target: 'Needs decision', requirement: 'templates' }], requirements: current(t, id, 'requirements'), by: ANA, reason: 'Measure template approval.' });
  assert.equal(judgedBy(t, id, current(t, id, 'requirements').find((r) => r.id === 'templates')), 'evidence');
  assert.throws(() => recordJudgment(t, id, 'templates', { verdict: 'met', rationale: 'All approved on Oct 14.', by: BEN }), /a Target is linked to it/);
});

test('before the first result, the Requirements and Targets with no evidence linked are listed; after, nothing is', () => {
  let [s, id] = firm();
  assert.deepEqual(unlinkedBeforeResults(s, id), ['Minimum 20 cases', 'Overall accuracy ≥ 90%', 'No unresolved critical incidents', 'The tax lead has approved the email templates']);
  s = recordResult(s, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 9, total: 10, kind: 'eval', by: BEN });
  assert.equal(unlinkedBeforeResults(s, id), null, 'results exist: the existing lock rule applies, unchanged');
});

// ---------------------------------------------------------------------------
// P6: incidents
// ---------------------------------------------------------------------------

test('an open critical incident makes "No unresolved critical incidents" Not met; resolving removes the blocker but proves nothing alone', () => {
  let [s, id] = firm();
  s = recordJudgment(s, id, 'incidents', { verdict: 'met', rationale: 'No incidents so far in the pilot.', by: BEN });
  assert.equal(req(s, id, 'incidents').result.status, 'met');
  const minor = recordIncident(s, id, { what: 'One email used last year\'s date.', severity: 'high', by: CARA });
  assert.equal(req(minor, id, 'incidents').result.status, 'met', 'only a critical incident blocks this Requirement');
  s = recordIncident(s, id, { what: 'An email told a client the wrong filing deadline; they nearly missed it.', severity: 'critical', by: CARA });
  const inc = incidentsFor(s, id)[0];
  assert.equal(req(s, id, 'incidents').result.status, 'not-met');
  assert.match(req(s, id, 'incidents').result.why, /An open critical incident: IN-.*Resolving it removes this blocker/);
  assert.throws(() => setIncidentStatus(s, id, inc.id, { status: 'resolved', note: 'Fixed.', by: CARA }), /Only the owner or a Reviewer/);
  s = setIncidentStatus(s, id, inc.id, { status: 'under-review', note: 'Looking at the prompt.', by: BEN });
  assert.equal(req(s, id, 'incidents').result.status, 'not-met', 'under review is still unresolved');
  s = setIncidentStatus(s, id, inc.id, { status: 'resolved', note: 'Date source fixed and retested.', by: ANA });
  assert.equal(incidentStatus(incidentsFor(s, id)[0]), 'resolved');
  assert.equal(incidentsFor(s, id)[0].statusLog.length, 3, 'the incident and its history stay');
  assert.equal(req(s, id, 'incidents').result.status, 'met', 'back to the judgment on record');
  // Without a judgment, resolving proves nothing by itself.
  let [t] = firm();
  t = recordIncident(t, id, { what: 'Wrong deadline sent to a client by email.', severity: 'critical', by: ANA });
  t = setIncidentStatus(t, id, incidentsFor(t, id)[0].id, { status: 'resolved', note: 'Fixed and checked.', by: ANA });
  assert.equal(req(t, id, 'incidents').result.status, 'no-evidence');
  assert.equal(performanceResultsSeen(t, id), false, 'an incident is evidence and a lifecycle event, not a performance result: it doesn\'t lock the bar (#143 review)');
  assert.equal(criteriaLocked(t, id), false);
});

// ---------------------------------------------------------------------------
// P7, P8: feedback is context; Impact is informational
// ---------------------------------------------------------------------------

test('feedback is context: it changes nothing unless a row is explicitly mapped to it', () => {
  let [s, id] = firm();
  const before = readiness(s, id);
  s = recordFeedback(s, id, { from: 'Client: Lee & Co', note: 'The reminder was clear and on time.', sentiment: 'positive', by: CARA });
  s = recordFeedback(s, id, { from: 'Client: Ortiz', note: 'Confusing subject line.', sentiment: 'negative', category: 'wording', by: CARA });
  assert.deepEqual(readiness(s, id), before);
  assert.equal(performanceResultsSeen(s, id), false);
  assert.ok(evidenceSources(s).some((x) => x.id === FEEDBACK_SOURCE));
  // A Requirement explicitly judged by feedback.
  s = saveCriteria(s, id, { criteria: [], requirements: [...current(s, id, 'requirements'), { id: 'acceptance', text: 'Client feedback at least 75% positive' }], by: ANA, reason: 'Clients must accept it.' });
  s = mapEvidence(s, id, { rowKind: 'requirement', rowId: 'acceptance', measure: { source: FEEDBACK_SOURCE, metric: 'positive-feedback', stat: 'rate' }, by: ANA });
  // Feedback is real use, so it waits for the usual 20 before it's judged.
  assert.equal(req(s, id, 'acceptance').result.status, 'not-enough');
  assert.match(req(s, id, 'acceptance').current, /50% across 2 cases \(2 cases so far, 20 needed\)/);
  for (let i = 0; i < 18; i++) s = recordFeedback(s, id, { from: `Client ${i}`, note: 'Clear and useful.', sentiment: 'positive', by: CARA });
  assert.equal(req(s, id, 'acceptance').result.status, 'met');
});

test('Impact actuals are recorded and never touch readiness', () => {
  let [s, id] = firm();
  const before = readiness(s, id);
  assert.throws(() => recordImpactActual(s, id, { metric: 'Time saved', basis: 'measured', period: 'October', by: ANA }), /a number or describe/);
  assert.throws(() => recordImpactActual(s, id, { metric: 'Time saved', value: 6, period: 'October', by: ANA }), /measured or estimated/);
  s = recordImpactActual(s, id, { metric: 'Time saved', value: 6, unit: 'h', basis: 'estimated', period: 'October, week 2', by: ANA });
  s = recordImpactActual(s, id, { metric: 'Client confusion', result: 'Fewer "which deadline?" calls', basis: 'measured', period: 'October', by: CARA });
  assert.equal(impactActuals(s, id).length, 2);
  assert.deepEqual(readiness(s, id), before);
  assert.equal(performanceResultsSeen(s, id), false);
});

// ---------------------------------------------------------------------------
// P3: uploads
// ---------------------------------------------------------------------------

const PER_CASE = 'case,outcome,severity,date,segment\n1,pass,,2026-10-10,Individuals\n2,pass,,2026-10-10,Individuals\n3,fail,high,2026-10-11,Businesses\n4,unable,,2026-10-11,Businesses\n5,pass,,2026-10-12,"Businesses"\n';

test('per-case CSV rows are totalled, unable is left out, and segments are kept', () => {
  const rows = parseCsv(PER_CASE);
  assert.equal(rows.length, 5);
  const r = measurementsFromRows(rows, { metric: 'm', label: 'Accuracy' });
  assert.deepEqual(r.measurements.map((m) => [m.segment || 'all', m.passed, m.total]), [['all', 3, 4], ['Individuals', 2, 2], ['Businesses', 1, 2]]);
  assert.deepEqual([r.perCase, r.cases, r.unable, r.serious, r.dates.at(-1)], [true, 4, 1, 1, '2026-10-12']);
  assert.throws(() => measurementsFromRows(parseCsv('case,outcome\n1,great\n'), { metric: 'm', label: 'x' }), /Row 2: the outcome must be pass, fail or unable/);
  const agg = measurementsFromRows(parseCsv('passed,total,segment\n18,20,\n'), { metric: 'm', label: 'x' });
  assert.deepEqual([agg.perCase, agg.measurements[0].passed, agg.measurements[0].total], [false, 18, 20]);
});

test('an upload goes through the evidence checks, carries its provenance, stays in this browser, and combines with manual results', () => {
  let [s, id] = firm();
  assert.throws(() => uploadEvidence(s, id, { rowKind: 'requirement', rowId: 'accuracy', fileName: 'week1.csv', content: PER_CASE, kind: 'eval', by: BEN }), /source label/);
  assert.throws(() => uploadEvidence(s, id, { rowKind: 'requirement', rowId: 'accuracy', fileName: 'week1.xlsx', content: 'x', sourceLabel: 'Review sheet', kind: 'eval', by: BEN }), /\.csv or \.json/);
  const sources = evidenceSources(s).length;
  s = uploadEvidence(s, id, { rowKind: 'requirement', rowId: 'accuracy', fileName: 'week1.csv', content: PER_CASE, sourceLabel: 'Weekly review sheet', kind: 'eval', by: BEN });
  const imp = evidenceImports(s).find((x) => x.via === 'upload');
  assert.deepEqual([imp.provenance.fileName, imp.provenance.sourceLabel, imp.provenance.importedBy.name, imp.provenance.cases, imp.provenance.unable, imp.provenance.lastDate, imp.provenance.browserLocal], ['week1.csv', 'Weekly review sheet', 'Ben Okoro', 4, 1, '2026-10-12', true]);
  assert.equal(evidenceSources(s).length, sources, 'an upload registers no new connected source');
  assert.equal(capData(s, id).evidence.filter((e) => e.from === 'uploaded').length, 3);
  // Plus a manual review of 16 cases: compatible, so 20 cases in all.
  s = recordResult(s, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 15, total: 16, kind: 'eval', by: BEN });
  const r = req(s, id, 'accuracy');
  assert.deepEqual([r.judged.combined, r.judged.sample], [2, 20]);
  // A JSON evidence envelope uploads as it is.
  const env = { schema: 'authority-lab-evidence/1', id: 'acme:run-9', capabilityId: 'anything', source: { system: 'Acme', capability: 'Drafts' }, kind: 'eval', observedAt: '2026-10-12', measurements: [{ metric: 'quality', type: 'rate', passed: 9, total: 10 }] };
  const j = uploadEvidence(s, id, { fileName: 'run9.json', content: JSON.stringify(env), sourceLabel: 'Acme export', kind: 'eval', by: BEN });
  assert.ok(capData(j, id).evidence.some((e) => e.external.importId === 'acme:run-9' && e.from === 'uploaded'));
});

// ---------------------------------------------------------------------------
// End to end: the small firm reaches a defensible decision with no integrations
// ---------------------------------------------------------------------------

test('the small firm, end to end: outcomes, judgments, an incident and a manual review are enough to propose authority', () => {
  let [s, id] = firm();
  s = mapEvidence(s, id, { rowKind: 'requirement', rowId: 'min-cases', measure: { source: MANUAL_SOURCE, metric: rowMetric('requirement', 'accuracy'), stat: 'sample' }, by: ANA });
  // A weekly review sheet, uploaded first (it links the row while nothing is
  // recorded yet), and a manual review.
  s = uploadEvidence(s, id, { rowKind: 'requirement', rowId: 'accuracy', fileName: 'week1.csv', content: PER_CASE, sourceLabel: 'Weekly review sheet', kind: 'eval', by: BEN });
  s = recordResult(s, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 15, total: 16, kind: 'eval', by: BEN });
  // Test cases, run through the real AI outside Authority Lab, outcomes recorded.
  s = saveScenarios(s, id, { scenarios: SCENARIOS, by: ANA });
  for (const sc of capData(s, id).scenarios) s = recordOutcome(s, id, sc.id, { result: 'pass', happened: 'Did what we expected.', by: BEN });
  // An incident, handled.
  s = recordIncident(s, id, { what: 'One email had last year\'s deadline; caught before sending.', severity: 'critical', by: CARA });
  assert.equal(readiness(s, id).unmet.some((r) => r.id === 'incidents'), true);
  s = setIncidentStatus(s, id, incidentsFor(s, id)[0].id, { status: 'resolved', note: 'Date source fixed; 16 more checked.', by: BEN });
  // Judgments where there's no metric.
  s = recordJudgment(s, id, 'incidents', { verdict: 'met', rationale: 'The one critical incident is resolved and retested.', by: BEN });
  s = recordJudgment(s, id, 'templates', { verdict: 'met', rationale: 'All four templates approved on Oct 14.', by: BEN });
  // Every Requirement says why, and all are met.
  const rows = requirementsNow(s, id);
  for (const r of rows) assert.equal(r.result.status, 'met', `${r.text}: ${r.result.why}`);
  assert.match(coverageText(evidenceCoverage(s, id)), /^4 of 4 Requirements have sufficient evidence\.$/);
  const p = proposeAuthority(s, id, 2, { by: ANA });
  assert.equal(getCapability(p, id).authority.level, 1, 'evidence never grants authority: a proposal is open for a person to decide');
  assert.ok(capData(p, id).decision.proposed);
});

test('State\'s committed-file path is judged exactly as before', () => {
  const s = findWorkspace('state').build({ today: '2026-10-16' });
  const id = s.capabilities[0].id;
  assert.ok(requirementsNow(s, id).every((r) => r.result.status === 'no-evidence'));
  assert.ok(evidenceSources(s).some((x) => x.id === 'state-evidence-interpretation'));
});

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

import { setPeople, setToday } from '../src/ui.js';
import { testsView } from '../src/views/tests.js';
import { configureEvidenceView } from '../src/views/configure.js';
import { recordEvidenceView } from '../src/views/sources.js';
import { judgeView, logView } from '../src/views/lightweight.js';
import { people } from '../src/store/index.js';

const q = (str = '') => new URLSearchParams(str);
const strip = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, '\'').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
function render(s, view) {
  setPeople(people(s));
  setToday(s.today);
  try { return String(view()); } finally { setPeople(null); }
}

test('screens: a real workspace records outcomes instead of running tests', () => {
  let [s, id] = firm();
  s = saveScenarios(s, id, { scenarios: SCENARIOS, by: ANA });
  const page = render(s, () => testsView(s, id, q()));
  assert.doesNotMatch(page, /data-action="run-tests"/);
  assert.equal((page.match(/data-form="record-outcome"/g) || []).length, 3);
  assert.match(strip(page), /Authority Lab doesn't run your AI or call any model/);
  assert.doesNotMatch(strip(page), /simulated/i);
});

test('screens: the evidence page shows each Requirement\'s result and why, with a manual way to fill each gap', () => {
  let [s, id] = firm();
  s = recordResult(s, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 9, total: 10, kind: 'eval', by: BEN });
  const page = render(s, () => configureEvidenceView(s, id, q()));
  const text = strip(page);
  assert.match(text, /Result/);
  assert.match(text, /Met: 90% across 10 cases/);
  assert.match(page, /evidence\/judge\?row=templates">Record judgment/);
  assert.match(page, /evidence\/record\?row=requirement:accuracy">Record result/);
  assert.match(text, /No metric: the Owner or a Reviewer judges it, and an open critical incident blocks it/);
});

test('screens: recording against a row offers an upload that says it stays in this browser; judgments and the log render', () => {
  const [s, id] = firm();
  const rec = strip(render(s, () => recordEvidenceView(s, id, q('row=requirement:accuracy'))));
  assert.match(rec, /For: Overall accuracy ≥ 90%/);
  assert.match(rec, /Stays in this browser/);
  assert.match(rec, /one row per case/);
  const judge = strip(render({ ...s, actingAs: CARA }, () => judgeView({ ...s, actingAs: CARA }, id, q('row=templates'))));
  assert.match(judge, /Recorded as input/);
  const log = strip(render(s, () => logView(s, id, q())));
  for (const h of ['Incidents', 'Feedback', 'Impact']) assert.match(log, new RegExp(h));
  assert.match(log, /Impact is informational and never changes readiness/);
});

test('screens: before the first outcome, the test-case page names the rows with no evidence linked and points to linking them first', () => {
  let [s, id] = firm();
  s = saveScenarios(s, id, { scenarios: SCENARIOS, by: ANA });
  const page = strip(render(s, () => testsView(s, id, q())));
  assert.match(page, /Some Requirements are not linked to evidence yet/);
  assert.match(page, /Once you record results, changing those links may require approval\. Not linked yet: Minimum 20 cases; Overall accuracy ≥ 90%/);
  assert.match(page, /Link them first/);
  const after = recordOutcome(s, id, capData(s, id).scenarios[0].id, { result: 'pass', happened: 'Right date, right tone.', by: BEN });
  assert.doesNotMatch(strip(render(after, () => testsView(after, id, q()))), /not linked to evidence yet/);
});
