// The lightweight evidence path (#142, Paige 2026-10-16). Everything a small
// team with no governance, eval, observability or data stack needs to collect
// credible evidence inside Authority Lab, on the same evidence model as the
// committed-file path:
// - test-case outcomes a person records after running the case through their
//   real AI (P1);
// - human judgments on Requirements that have no metric (P2);
// - results recorded against a Requirement or Target row, and uploads (P3);
// - incidents (P6), feedback (P7) and Impact actuals (P8).
// Every record here is append-only: never edited, never removed.
//
// Nothing here calls a model or runs an eval.

import { getCapability, capData, updateCap, logEvent } from './state.js';
import { current, performanceResultsSeen } from './selectors.js';
import { people, snapshotPerson, requireActive } from './people.js';
import { peopleRoleOf } from './proposals.js';
import { manualEntryEligibility, recordManualEvidence, MANUAL_SOURCE } from './sources.js';
import { importEvidence, EVIDENCE_SCHEMA, evidenceImports, checkEvidence } from './external.js';
import { saveCriteria, criteriaLocked, barFromWords, isCoverageRule } from './evidence.js';

const text = (v, max = 600) => String(v ?? '').trim().slice(0, max);
const dateOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const ref = (r) => (r && String(r).trim() ? String(r).trim().slice(0, 300) : null);

// ---------------------------------------------------------------------------
// The demo may simulate; nothing else may (P1)
// ---------------------------------------------------------------------------

// The seeded Northstar demo. A client workspace (State) or one started empty
// is real: no simulated result ever counts there.
export const isDemoWorkspace = (state) => !state.clientWorkspace && !state.startedEmpty;

// ---------------------------------------------------------------------------
// Who may record
// ---------------------------------------------------------------------------

function requireNamed(state, capabilityId, by, what) {
  requireActive(state, by, what);
  const ok = manualEntryEligibility(state, capabilityId, by);
  if (!ok.ok) throw new Error(ok.reason.replace('record evidence', what));
}

// The Owner or a Reviewer (P2): their judgment counts. A Stakeholder's is
// input only.
export function judgeRole(state, capabilityId, by) {
  const cap = getCapability(state, capabilityId);
  if (!cap) return null;
  if (by === cap.owner) return 'owner';
  const entry = current(state, capabilityId, 'stakeholders').find((st) => st.person === by);
  if (!entry) return null;
  return peopleRoleOf(entry) === 'reviewer' ? 'reviewer' : 'stakeholder';
}

// ---------------------------------------------------------------------------
// Test-case outcomes (P1)
// ---------------------------------------------------------------------------

export const OUTCOME_RESULTS = { pass: 'Pass', fail: 'Fail', unable: 'Unable to judge' };
export const OUTCOME_SEVERITIES = ['low', 'medium', 'high'];

// Record what happened when a person ran one test case through their real AI.
// A case run again gets a new outcome; the earlier one stays on record.
export function recordOutcome(state, capabilityId, scenarioId, { result, severity, happened, reference, by } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  requireNamed(state, capabilityId, by, 'record an outcome');
  const sc = capData(state, capabilityId).scenarios.find((x) => x.id === scenarioId);
  if (!sc) throw new Error('That test case no longer exists.');
  if (!OUTCOME_RESULTS[result]) throw new Error('Choose Pass, Fail or Unable to judge.');
  if (result === 'fail' && !OUTCOME_SEVERITIES.includes(severity)) throw new Error('Say how serious the failure was.');
  const what = text(happened);
  if (what.length < 5) throw new Error('Say what actually happened (a sentence).');
  const list = capData(state, capabilityId).outcomes || [];
  const entry = { id: `OC-${capabilityId}-${list.length + 1}`, scenarioId, scenarioName: sc.name, group: sc.group, result, ...(result === 'fail' ? { severity } : {}), happened: what, reference: ref(reference), date: state.today, by, byAt: snapshotPerson(state, by) };
  const s = updateCap(state, capabilityId, (d) => ({ ...d, outcomes: [...(d.outcomes || []), entry] }));
  return logEvent(s, { kind: 'test', title: 'Test outcome recorded', body: `${cap.name}: "${sc.name}" ${OUTCOME_RESULTS[result].toLowerCase()}${result === 'fail' ? ` (${severity})` : ''}, recorded by ${people(state)[by].name}.`, capabilityId, link: `#/tests?capability=${capabilityId}` });
}

// The latest outcome of each current test case.
export function outcomesNow(state, capabilityId) {
  const d = capData(state, capabilityId);
  const latest = new Map();
  for (const o of d.outcomes || []) latest.set(o.scenarioId, o);
  return d.scenarios.map((sc) => ({ scenario: sc, outcome: latest.get(sc.id) || null }));
}

// ---------------------------------------------------------------------------
// Judgments on Requirements with no metric (P2)
// ---------------------------------------------------------------------------

export const VERDICTS = { met: 'Met', 'not-met': 'Not met', unknown: 'Unknown' };

// How a Requirement is judged, from its configured structure only (Paige,
// 2026-10-17, #143 review): by evidence when it has a measure, a linked
// Target, is a coverage rule, or still waits for its number; otherwise by a
// person. Never inferred from its wording: "All 4 templates have been
// approved" is judged by a person.
export function judgedBy(state, capabilityId, req) {
  if (!req) return null;
  if (req.measure || req.bar === 'needs-decision' || isCoverageRule(req)) return 'evidence';
  if (current(state, capabilityId, 'criteria').some((c) => c.requirement === req.id)) return 'evidence';
  return 'person';
}

// Before the first result (Paige, #143 review): which Requirements and
// Targets judged by evidence have no evidence linked yet. Once results exist,
// linking one needs approval, so a one-person team is told first.
export function unlinkedBeforeResults(state, capabilityId) {
  if (performanceResultsSeen(state, capabilityId)) return null;
  // Only rows judged by evidence that still need their evidence chosen: a
  // coverage rule, or an evidence-judged Requirement, with no measure, and any
  // Target with a bar and no measure. Person-judged Requirements need no link;
  // a Requirement judged through its Target is covered by the Target's entry.
  const criteria = current(state, capabilityId, 'criteria');
  const rows = [
    ...current(state, capabilityId, 'requirements').filter((r) => !r.measure && r.bar !== 'needs-decision' && judgedBy(state, capabilityId, r) === 'evidence' && !criteria.some((c) => c.requirement === r.id)).map((r) => r.text),
    ...criteria.filter((c) => !c.measure && c.bar !== 'needs-decision').map((c) => c.name),
  ];
  return rows.length ? rows : null;
}

export function recordJudgment(state, capabilityId, requirementId, { verdict, rationale, reference, by } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  requireActive(state, by, 'record a judgment');
  const role = judgeRole(state, capabilityId, by);
  if (!role) throw new Error(`${people(state)[by].name} isn't the owner or named on ${cap.name}, so they can't judge its Requirements.`);
  const req = current(state, capabilityId, 'requirements').find((r) => r.id === requirementId);
  if (!req) throw new Error('That Requirement no longer exists.');
  // Only a Requirement with no metric is judged by a person (P2), decided
  // from its structure, never from its wording.
  if (judgedBy(state, capabilityId, req) !== 'person') throw new Error(`"${req.text}" is judged by its evidence${isCoverageRule(req) ? ' (it is a coverage rule)' : req.measure ? '' : ' (a Target is linked to it)'}, not by a person.`);
  if (req.bar === 'needs-decision') throw new Error(`"${req.text}" has no number yet. Set it before judging it.`);
  if (!VERDICTS[verdict]) throw new Error('Choose Met, Not met or Unknown.');
  const why = text(rationale, 400);
  if (why.length < 10) throw new Error('Say why (a sentence).');
  const list = capData(state, capabilityId).judgments || [];
  const entry = { id: `JD-${capabilityId}-${list.length + 1}`, requirementId, requirementText: req.text, verdict, rationale: why, reference: ref(reference), role, counts: role !== 'stakeholder', date: state.today, by, byAt: snapshotPerson(state, by) };
  const s = updateCap(state, capabilityId, (d) => ({ ...d, judgments: [...(d.judgments || []), entry] }));
  return logEvent(s, { kind: 'judgment', title: role === 'stakeholder' ? 'Stakeholder input recorded' : 'Requirement judged', body: `${cap.name}: ${people(state)[by].name} (${role}) judged "${req.text}" ${VERDICTS[verdict].toLowerCase()}. ${why}${role === 'stakeholder' ? ' Stakeholder input doesn\'t satisfy a Requirement by itself.' : ''}`, capabilityId, link: `#/capabilities/${capabilityId}/evidence/configure` });
}

// Each person's latest judgment of a Requirement; input from Stakeholders is
// kept apart and never counts.
export function judgmentsFor(state, capabilityId, requirementId) {
  const all = (capData(state, capabilityId).judgments || []).filter((j) => j.requirementId === requirementId);
  const latest = new Map();
  for (const j of all) latest.set(j.by, j);
  const now = [...latest.values()];
  return { counting: now.filter((j) => j.counts), input: now.filter((j) => !j.counts), all };
}

// ---------------------------------------------------------------------------
// Incidents (P6)
// ---------------------------------------------------------------------------

export const INCIDENT_SEVERITIES = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
export const INCIDENT_STATUSES = { open: 'Open', 'under-review': 'Under review', resolved: 'Resolved' };

export function recordIncident(state, capabilityId, { what, severity, date, status = 'open', reference, by } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  requireNamed(state, capabilityId, by, 'record an incident');
  const desc = text(what);
  if (desc.length < 10) throw new Error('Say what happened (a sentence).');
  if (!INCIDENT_SEVERITIES[severity]) throw new Error('Choose how serious it was.');
  if (!INCIDENT_STATUSES[status]) throw new Error('Choose its status.');
  const on = date || state.today;
  if (!dateOk(on)) throw new Error('The date must be YYYY-MM-DD.');
  const list = capData(state, capabilityId).incidents || [];
  const entry = { id: `IN-${capabilityId}-${list.length + 1}`, what: desc, severity, date: on, reference: ref(reference), recordedOn: state.today, by, byAt: snapshotPerson(state, by), statusLog: [{ status, date: state.today, by, byAt: snapshotPerson(state, by), note: 'Recorded.' }] };
  const s = updateCap(state, capabilityId, (d) => ({ ...d, incidents: [...(d.incidents || []), entry] }));
  return logEvent(s, { kind: 'failure', surfaced: true, title: `Incident recorded: ${INCIDENT_SEVERITIES[severity]}`, body: `${cap.name}: ${desc} Recorded by ${people(state)[by].name}, ${INCIDENT_STATUSES[status].toLowerCase()}.`, capabilityId, link: `#/capabilities/${capabilityId}/evidence/log` });
}

// A status change is appended; the incident itself never changes or goes.
export function setIncidentStatus(state, capabilityId, incidentId, { status, note, by } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  requireActive(state, by, 'change an incident\'s status');
  const role = judgeRole(state, capabilityId, by);
  if (role !== 'owner' && role !== 'reviewer') throw new Error(`Only the owner or a Reviewer of ${cap.name} can change an incident's status.`);
  const inc = (capData(state, capabilityId).incidents || []).find((x) => x.id === incidentId);
  if (!inc) throw new Error('That incident no longer exists.');
  if (!INCIDENT_STATUSES[status]) throw new Error('Choose its status.');
  if (incidentStatus(inc) === status) throw new Error(`It is already ${INCIDENT_STATUSES[status].toLowerCase()}.`);
  const why = text(note, 300);
  if (why.length < 5) throw new Error('Say why the status changed.');
  const s = updateCap(state, capabilityId, (d) => ({ ...d, incidents: d.incidents.map((x) => (x.id === incidentId ? { ...x, statusLog: [...x.statusLog, { status, date: state.today, by, byAt: snapshotPerson(state, by), note: why }] } : x)) }));
  return logEvent(s, { kind: 'failure', surfaced: true, title: `Incident ${INCIDENT_STATUSES[status].toLowerCase()}`, body: `${cap.name}: ${inc.what} ${people(state)[by].name}: ${why}`, capabilityId, link: `#/capabilities/${capabilityId}/evidence/log` });
}

export const incidentStatus = (inc) => inc.statusLog.at(-1).status;
export const incidentsFor = (state, capabilityId) => capData(state, capabilityId).incidents || [];
export const openCriticalIncidents = (state, capabilityId) => incidentsFor(state, capabilityId).filter((x) => x.severity === 'critical' && incidentStatus(x) !== 'resolved');
// The Requirement an open critical incident blocks deterministically.
export const isIncidentRequirement = (r) => Boolean(r) && (r.id === 'incidents' || /\bno (unresolved|open) critical incidents?\b/i.test(r.text || ''));

// ---------------------------------------------------------------------------
// Feedback (P7): context unless a Requirement is mapped to it
// ---------------------------------------------------------------------------

export const FEEDBACK_SENTIMENTS = { positive: 'Positive', neutral: 'Neutral', negative: 'Negative' };
export const FEEDBACK_SOURCE = 'feedback';

export function recordFeedback(state, capabilityId, { from, date, note, sentiment, category, reference, by } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  requireNamed(state, capabilityId, by, 'record feedback');
  const who = text(from, 80);
  if (!who) throw new Error('Say who the feedback came from (a person, team or channel).');
  const body = text(note, 600);
  if (body.length < 5) throw new Error('Write down the feedback.');
  if (sentiment && !FEEDBACK_SENTIMENTS[sentiment]) throw new Error('Sentiment must be positive, neutral or negative.');
  const on = date || state.today;
  if (!dateOk(on)) throw new Error('The date must be YYYY-MM-DD.');
  const list = capData(state, capabilityId).feedback || [];
  const entry = { id: `FB-${capabilityId}-${list.length + 1}`, from: who, date: on, note: body, ...(sentiment ? { sentiment } : {}), ...(text(category, 60) ? { category: text(category, 60) } : {}), reference: ref(reference), recordedOn: state.today, by, byAt: snapshotPerson(state, by) };
  const s = updateCap(state, capabilityId, (d) => ({ ...d, feedback: [...(d.feedback || []), entry] }));
  return logEvent(s, { kind: 'feedback', title: 'Feedback recorded', body: `${cap.name}: from ${who}${sentiment ? ` (${sentiment})` : ''}. ${body}`, capabilityId, link: `#/capabilities/${capabilityId}/evidence/log` });
}

export const feedbackFor = (state, capabilityId) => capData(state, capabilityId).feedback || [];

// Feedback as a measurement, read only when a Requirement or Target is mapped
// to the feedback source: the share of feedback with a sentiment that is
// positive.
export function feedbackMeasurements(state, capabilityId) {
  const rated = feedbackFor(state, capabilityId).filter((f) => f.sentiment);
  if (!rated.length) return [];
  const date = rated.reduce((d, f) => (f.date > d ? f.date : d), '');
  return [{ metric: 'positive-feedback', label: 'Positive feedback', type: 'rate', passed: rated.filter((f) => f.sentiment === 'positive').length, total: rated.length, date }];
}

// ---------------------------------------------------------------------------
// Impact actuals (P8): informational, never part of readiness
// ---------------------------------------------------------------------------

export const IMPACT_BASES = { measured: 'Measured', estimated: 'Estimated' };

export function recordImpactActual(state, capabilityId, { metric, value, unit, result, basis, period, note, reference, by } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  requireNamed(state, capabilityId, by, 'record Impact');
  const name = text(metric, 80);
  if (!name) throw new Error('Say what was measured (for example, time saved).');
  const num = value === '' || value === undefined || value === null ? null : Number(value);
  if (num !== null && !Number.isFinite(num)) throw new Error('The value must be a number.');
  const qual = text(result, 300);
  if (num === null && !qual) throw new Error('Give a number or describe the result.');
  if (!IMPACT_BASES[basis]) throw new Error('Say whether it was measured or estimated.');
  const when = text(period, 60);
  if (!when) throw new Error('Say the period or date it covers.');
  const list = capData(state, capabilityId).impactActuals || [];
  const entry = { id: `IM-${capabilityId}-${list.length + 1}`, metric: name, ...(num !== null ? { value: num } : {}), ...(text(unit, 12) ? { unit: text(unit, 12) } : {}), ...(qual ? { result: qual } : {}), basis, period: when, note: text(note, 300), reference: ref(reference), recordedOn: state.today, by, byAt: snapshotPerson(state, by) };
  const s = updateCap(state, capabilityId, (d) => ({ ...d, impactActuals: [...(d.impactActuals || []), entry] }));
  return logEvent(s, { kind: 'impact', title: 'Impact recorded', body: `${cap.name}: ${name}, ${num !== null ? `${num}${entry.unit ? ` ${entry.unit}` : ''}` : qual} (${IMPACT_BASES[basis].toLowerCase()}, ${when}). Informational: Impact never changes readiness.`, capabilityId, link: `#/capabilities/${capabilityId}/evidence/log` });
}

export const impactActuals = (state, capabilityId) => capData(state, capabilityId).impactActuals || [];

// ---------------------------------------------------------------------------
// Recording a result from the row (A), and uploads (P3)
// ---------------------------------------------------------------------------

const ROW_STAT = { rate: 'rate', count: 'count', value: 'value' };
export const rowMetric = (rowKind, rowId) => `${rowKind === 'target' ? 't' : 'r'}-${String(rowId).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.slice(0, 60);

function findRow(state, capabilityId, rowKind, rowId) {
  const rows = rowKind === 'target' ? current(state, capabilityId, 'criteria') : current(state, capabilityId, 'requirements');
  const row = rows.find((r) => r.id === rowId);
  if (!row) throw new Error('That Requirement or Target no longer exists.');
  return row;
}

// The metric a row's results are recorded under. A row with no evidence
// linked yet is linked to manual results here, before any results exist (the
// usual rule); after results, linking it needs a proposal (Configure evidence).
export function linkRowForResults(state, capabilityId, { rowKind, rowId, type, kind, by }) {
  const row = findRow(state, capabilityId, rowKind, rowId);
  const label = rowKind === 'target' ? row.name : row.text;
  if (row.bar === 'needs-decision') throw new Error(`"${label}" has no bar yet: decide its number first.`);
  if (rowKind === 'requirement' && isCoverageRule(row)) throw new Error(`"${label}" is a coverage rule: it counts cases in other results. Choose which under Configure evidence.`);
  if (row.measure) {
    if (row.measure.source && row.measure.source !== MANUAL_SOURCE) throw new Error(`"${label}" is judged by another source. Record results for it there, or change its evidence under Configure evidence.`);
    if (row.measure.kind && kind && row.measure.kind !== kind) throw new Error(`"${label}" counts ${row.measure.kind === 'eval' ? 'test-case results' : 'real-use results'} only.`);
    return { state, metric: row.measure.metric };
  }
  // A Requirement is measured only by its configured structure (#143
  // review): recording a result never turns a person-judged one into a
  // measured one. Choose its evidence first (Configure evidence). A Target is
  // measurable by definition, so its first result links it.
  if (rowKind === 'requirement') {
    const linkedTarget = current(state, capabilityId, 'criteria').some((c) => c.requirement === rowId);
    throw new Error(linkedTarget ? `"${label}" is judged by its Target. Record results for the Target.` : `"${label}" is judged by a person: record a judgment. To measure it instead, choose its evidence first.`);
  }
  const words = row.target;
  const bar = barFromWords(words);
  if (!bar) throw new Error(`"${label}" doesn't say a number to check. Give it a number first.`);
  if (criteriaLocked(state, capabilityId)) throw new Error(`Results already exist, so linking evidence to "${label}" needs approval. Propose it under Configure evidence.`);
  const metric = rowMetric(rowKind, rowId);
  const stat = ROW_STAT[type];
  if (!stat) throw new Error('Choose what kind of result this is.');
  const measure = { source: MANUAL_SOURCE, metric, stat, op: bar.op, value: bar.value };
  const edit = (list) => list.map((r) => (r.id === rowId ? { ...r, measure } : r));
  const criteria = current(state, capabilityId, 'criteria');
  const requirements = current(state, capabilityId, 'requirements');
  const s = saveCriteria(state, capabilityId, { criteria: edit(criteria), requirements, by, reason: `Results for "${label}" are recorded by people.` });
  return { state: s, metric };
}

// Record evidence against one Requirement or Target row.
export function recordResult(state, capabilityId, { rowKind, rowId, by, ...fields } = {}) {
  requireNamed(state, capabilityId, by, 'record evidence');
  const row = findRow(state, capabilityId, rowKind, rowId);
  const linked = linkRowForResults(state, capabilityId, { rowKind, rowId, type: fields.type, kind: fields.kind, by });
  return recordManualEvidence(linked.state, capabilityId, { ...fields, by, label: fields.label || (rowKind === 'target' ? row.name : row.text), metric: linked.metric });
}

// --- Uploads --------------------------------------------------------------

// A small CSV reader: a header row, commas, double-quoted fields.
export function parseCsv(textIn) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const t = String(textIn || '').replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const PASS_WORDS = new Set(['pass', 'passed', 'yes', 'y', 'true', 'ok', 'correct', 'met', '1']);
const FAIL_WORDS = new Set(['fail', 'failed', 'no', 'n', 'false', 'wrong', 'incorrect', 'not met', '0']);
const UNABLE_WORDS = new Set(['unable', 'unable to judge', 'unknown', 'n/a', 'na', 'skip', 'skipped', '']);

// Turn uploaded rows into measurements. Per-case rows (an outcome column) are
// totalled by segment; already-totalled rows say passed and total, or a value.
export function measurementsFromRows(rows, { metric, label }) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('The file has no rows.');
  const keys = Object.keys(rows[0]);
  const outcomeKey = ['outcome', 'result', 'pass', 'passed', 'status'].find((k) => keys.includes(k) && !keys.includes('total'));
  const dates = rows.map((r) => r.date || r.observed_at || r.observedat || '').filter(dateOk).sort();
  if (outcomeKey) {
    const bySeg = new Map();
    const unknownRows = [];
    rows.forEach((r, i) => {
      const v = String(r[outcomeKey] ?? '').trim().toLowerCase();
      const seg = (r.segment || '').trim();
      const cur = bySeg.get(seg) || { passed: 0, total: 0, unable: 0, serious: 0 };
      if (PASS_WORDS.has(v)) { cur.passed += 1; cur.total += 1; } else if (FAIL_WORDS.has(v)) { cur.total += 1; if (/^(high|critical|serious)$/i.test(r.severity || '')) cur.serious += 1; } else if (UNABLE_WORDS.has(v)) cur.unable += 1; else unknownRows.push(i + 2);
      bySeg.set(seg, cur);
    });
    if (unknownRows.length) throw new Error(`Row${unknownRows.length === 1 ? '' : 's'} ${unknownRows.slice(0, 5).join(', ')}: the outcome must be pass, fail or unable to judge.`);
    const all = [...bySeg.values()].reduce((a, b) => ({ passed: a.passed + b.passed, total: a.total + b.total, unable: a.unable + b.unable, serious: a.serious + b.serious }), { passed: 0, total: 0, unable: 0, serious: 0 });
    if (!all.total) throw new Error('No case in the file was judged pass or fail.');
    const out = [{ metric, label, type: 'rate', passed: all.passed, total: all.total }];
    for (const [seg, c] of bySeg) if (seg && c.total) out.push({ metric, label, type: 'rate', passed: c.passed, total: c.total, segment: seg.slice(0, 60) });
    return { measurements: out.slice(0, 40), perCase: true, cases: all.total, unable: all.unable, serious: all.serious, dates };
  }
  const out = rows.map((r, i) => {
    const seg = (r.segment || '').trim();
    if (r.passed !== undefined && r.total !== undefined && r.passed !== '' && r.total !== '') {
      const p = Number(r.passed); const t = Number(r.total);
      if (!Number.isInteger(p) || !Number.isInteger(t) || t <= 0 || p < 0 || p > t) throw new Error(`Row ${i + 2}: passed and total must be whole numbers, with passed no more than total.`);
      return { metric, label, type: 'rate', passed: p, total: t, ...(seg ? { segment: seg.slice(0, 60) } : {}) };
    }
    if (r.value !== undefined && r.value !== '') {
      const v = Number(r.value);
      if (!Number.isFinite(v)) throw new Error(`Row ${i + 2}: the value must be a number.`);
      const isCount = (r.type || '').toLowerCase() === 'count';
      if (isCount && (!Number.isInteger(v) || v < 0)) throw new Error(`Row ${i + 2}: a count must be a whole number.`);
      const t = r.total !== undefined && r.total !== '' ? Number(r.total) : undefined;
      return { metric, label, type: isCount ? 'count' : 'value', value: v, ...(t !== undefined && Number.isInteger(t) && t >= 0 ? { total: t } : {}), ...(seg ? { segment: seg.slice(0, 60) } : {}) };
    }
    throw new Error(`Row ${i + 2}: give an outcome per case, or passed and total, or a value.`);
  });
  return { measurements: out.slice(0, 40), perCase: false, cases: out.reduce((n, m) => n + (m.total || 0), 0), dates };
}

// Read an uploaded file's text into rows: CSV, or JSON (an array of rows, or
// an evidence envelope, imported as it is).
export function rowsFromFile(fileName, content) {
  const name = String(fileName || '');
  if (/\.json$/i.test(name)) {
    let data;
    try { data = JSON.parse(content); } catch { throw new Error(`${name} isn't valid JSON.`); }
    if (data && data.schema === EVIDENCE_SCHEMA) return { envelope: data };
    if (!Array.isArray(data)) throw new Error(`${name}: JSON must be a list of rows or an evidence envelope.`);
    return { rows: data.map((r) => Object.fromEntries(Object.entries(r || {}).map(([k, v]) => [k.toLowerCase().replace(/[^a-z0-9]+/g, '_'), v === null || v === undefined ? '' : String(v)]))) };
  }
  if (/\.csv$/i.test(name)) return { rows: parseCsv(content) };
  throw new Error('Upload a .csv or .json file.');
}

// Import an uploaded file against a Requirement or Target row. It is kept only
// in this browser's workspace, goes through the same checks as any evidence,
// and carries its provenance.
export function uploadEvidence(state, capabilityId, { rowKind, rowId, fileName, content, sourceLabel, kind, by } = {}) {
  requireNamed(state, capabilityId, by, 'upload evidence');
  const name = text(fileName, 120);
  if (!name) throw new Error('Choose a file.');
  const label = text(sourceLabel, 80);
  if (!label) throw new Error('Say where the file came from (a source label, such as "Weekly review sheet").');
  if (!['eval', 'production'].includes(kind)) throw new Error('Say whether these are test-case results or real use.');
  const parsed = rowsFromFile(name, content);
  const n = evidenceImports(state).filter((x) => x.via === 'upload').length + 1;
  let s = state;
  let envelope;
  let summary;
  if (parsed.envelope) {
    envelope = { ...parsed.envelope, capabilityId };
    summary = { perCase: false, cases: null, dates: [String(envelope.observedAt || '').slice(0, 10)] };
  } else {
    const row = findRow(state, capabilityId, rowKind, rowId);
    const result = measurementsFromRows(parsed.rows, { metric: 'pending', label: (rowKind === 'target' ? row.name : row.text).slice(0, 80) });
    const linked = linkRowForResults(state, capabilityId, { rowKind, rowId, type: result.measurements[0].type, kind, by });
    s = linked.state;
    const measurements = result.measurements.map((m) => ({ ...m, metric: linked.metric }));
    const observed = result.dates.at(-1) || state.today;
    envelope = { schema: EVIDENCE_SCHEMA, id: `upload:${capabilityId}:${n}`, capabilityId, source: { system: 'Upload', capability: label }, kind, observedAt: observed, measurements, notes: `Uploaded from ${name}${result.perCase ? `: ${result.cases} cases judged${result.unable ? `, ${result.unable} unable to judge` : ''}` : ''}.`.slice(0, 300) };
    summary = { perCase: result.perCase, cases: result.cases, unable: result.unable || 0, dates: result.dates };
  }
  const errors = checkEvidence(envelope);
  if (errors.length) throw new Error(`${name} can't be imported: ${errors.join(' ')}`);
  const provenance = { fileName: name, sourceLabel: label, importedOn: state.today, importedBy: snapshotPerson(state, by), perCase: summary.perCase, cases: summary.cases, ...(summary.unable ? { unable: summary.unable } : {}), firstDate: summary.dates[0] || null, lastDate: summary.dates.at(-1) || null, browserLocal: true };
  return importEvidence(s, envelope, { via: 'upload', sourceId: MANUAL_SOURCE, recordedBy: snapshotPerson(state, by), provenance });
}

