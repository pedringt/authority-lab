// Measured targets, requirements and restriction rules (#120). A target or
// decision requirement row, or a contract restriction line, may carry a
// `measure`: which imported metric judges it, and how. Imported evidence
// (#118) then sets its status through the same targets, readiness and
// monitoring every capability uses. Rows without a measure keep their stored
// status, as before.
//
// What this replaces: until now a target's "now" and status, and whether a
// requirement was met, were stored text on the row, set by hand or by the
// seed. Nothing computed them from evidence. That was the general assumption
// the first real external capability exposed, not anything about refunds.
//
// What it never does: grant authority. A judged requirement changes readiness,
// which is advice for a person; only a recorded decision changes a level.

import { capData, getCapability } from './state.js';
import { current } from './selectors.js';
import { importedStanding, measurementSample } from './external.js';
import { sourceOfItem, findSource, testMeasurements, TESTS_SOURCE, FRESH_DAYS } from './sources.js';
import { isCoverageRule } from './evidence.js';
import { judgedBy } from './lightweight.js';
import { feedbackMeasurements, FEEDBACK_SOURCE, judgmentsFor, openCriticalIncidents, isIncidentRequirement, VERDICTS } from './lightweight.js';

// The default minimum production sample before a production result is judged
// (Paige, 2026-10-12): the same 20 cases as rollout goals. A measure's own
// minSample wins.
export const MIN_PRODUCTION_SAMPLE = 20;

// What a measure compares. `rate` and `fail-rate` read a rate measurement as
// the share passed or failed; `share` reads a count against its sample; `count`
// and `value` read the number; `sample` reads the number of cases.
export const MEASURE_STATS = ['rate', 'fail-rate', 'share', 'count', 'value', 'sample'];
export const MEASURE_OPS = ['>=', '>', '<=', '<', '='];
// `source` (#126) names the evidence source the metric comes from; without it,
// any source's result for the metric counts.
const KEYS = ['source', 'metric', 'segment', 'stat', 'op', 'value', 'minSample', 'kind'];
const PCT = new Set(['rate', 'fail-rate', 'share']);

export function measureProblems(m) {
  if (m === undefined || m === null) return [];
  if (typeof m !== 'object' || Array.isArray(m)) return ['A measure must be an object.'];
  const out = [];
  for (const k of Object.keys(m)) if (!KEYS.includes(k)) out.push(`A measure has a field it doesn't use: "${k}".`);
  if (typeof m.metric !== 'string' || !/^[a-z0-9][a-z0-9-]{0,59}$/.test(m.metric)) out.push('A measure needs the metric id it reads.');
  if (m.segment !== undefined && (typeof m.segment !== 'string' || !m.segment.trim() || m.segment.length > 60)) out.push('A measure\'s segment must be short text.');
  if (!MEASURE_STATS.includes(m.stat)) out.push(`A measure's stat must be one of: ${MEASURE_STATS.join(', ')}.`);
  if (!MEASURE_OPS.includes(m.op)) out.push(`A measure's comparison must be one of: ${MEASURE_OPS.join(' ')}.`);
  if (typeof m.value !== 'number' || !Number.isFinite(m.value)) out.push('A measure needs a number to compare with.');
  if (m.minSample !== undefined && (!Number.isInteger(m.minSample) || m.minSample < 1)) out.push('A measure\'s minimum sample must be a whole number of cases.');
  if (m.kind !== undefined && !['eval', 'production'].includes(m.kind)) out.push('A measure\'s kind must be eval or production.');
  if (m.source !== undefined && (typeof m.source !== 'string' || !/^[a-z0-9][a-z0-9-]{0,59}$/.test(m.source))) out.push('A measure\'s source must be an evidence source id.');
  return out;
}

// The reading a measurement gives for a stat, or null when it can't.
function reading(m, stat) {
  const sample = measurementSample(m);
  if (stat === 'sample') return sample;
  if (stat === 'rate') return m.type === 'rate' ? (m.passed / m.total) * 100 : null;
  if (stat === 'fail-rate') return m.type === 'rate' ? ((m.total - m.passed) / m.total) * 100 : null;
  if (stat === 'share') return m.type === 'count' && m.total ? (m.value / m.total) * 100 : m.type === 'value' && m.unit === '%' ? m.value : null;
  if (stat === 'count') return m.type === 'count' ? m.value : null;
  return m.type === 'value' ? m.value : null;
}

const compare = (a, op, b) => (op === '>=' ? a >= b : op === '>' ? a > b : op === '<=' ? a <= b : op === '<' ? a < b : a === b);
const round = (n) => Math.round(n * 10) / 10;
const fmt = (n, stat) => (PCT.has(stat) ? `${round(n)}%` : `${round(n)}`);
const casesText = (n) => `${n} case${n === 1 ? '' : 's'}`;

// The newest current imported result for a measure: the right metric and
// segment, measured under its stream's current configuration (#119), of the
// right kind when the measure names one.
export function measuredEvidence(state, capabilityId, measure) {
  // Authority Lab's own tests are read from the recorded run (#126).
  if (measure.source === TESTS_SOURCE) {
    const m = testMeasurements(state, capabilityId).find((x) => x.metric === measure.metric && (x.segment || null) === (measure.segment || null));
    if (!m || (measure.kind && measure.kind !== 'eval')) return null;
    const { date, label, ...measured } = m;
    return { id: `tests:${capabilityId}#${m.metric}${m.segment ? `@${m.segment}` : ''}`, date, metric: label, sourceId: TESTS_SOURCE, measure: measured, external: { importId: `test run on ${date}`, kind: 'eval' } };
  }
  const standing = importedStanding(state, capabilityId);
  const seg = measure.segment || null;
  const items = capData(state, capabilityId).evidence.filter((e) => e.external && e.measure
    && e.measure.metric === measure.metric && (e.measure.segment || null) === seg
    && (!measure.kind || e.external.kind === measure.kind)
    && (!measure.source || sourceOfItem(e) === measure.source)
    && (standing.get(e.id) || {}).standing === 'current');
  return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0] || null;
}

// Judge a measure against the imported evidence:
// - `pending`: nothing measured yet;
// - `insufficient`: an eval result on fewer cases than the measure's minSample;
// - `too-early`: a production result below its minimum sample (20 by
//   default), never shown or counted as missed;
// - `pass` / `fail`.
// One exception to the sample rule: a ceiling on a count ("at most 0 severe
// failures") that's already exceeded fails at once. More cases can't undo a
// failure that happened, and one severe failure must be able to block.
export function judgeMeasure(state, capabilityId, measure) {
  const candidates = candidateResults(state, capabilityId, measure);
  if (!candidates.length) return { status: 'pending', text: 'No results yet' };
  const judged = candidates.map((c) => judgeOne(state, measure, c));
  const decisive = judged.filter((j) => j.status === 'pass' || j.status === 'fail');
  // Stale results never create a conflict (#142, P5); they still count when
  // nothing fresher judges the row.
  const fresh = decisive.filter((j) => !j.stale);
  const pool = fresh.length ? fresh : decisive;
  const newest = (list) => list.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];
  if (pool.some((j) => j.status === 'pass') && pool.some((j) => j.status === 'fail')) {
    const says = (j) => `${j.label} says ${j.status === 'pass' ? 'met' : 'not met'} (${j.text})`;
    return { ...newest(pool), status: 'conflicting', text: `Results disagree: ${pool.map(says).join('; ')}`, results: judged, conflict: pool.map((j) => j.evidenceId) };
  }
  const pick = pool.length ? newest(pool) : newest(judged);
  return { ...pick, results: judged };
}

// Every current result that judges a measure (#142): one per connected
// stream (its newest under the current configuration), Authority Lab's tests
// or the feedback source when the measure names them, and the lightweight
// results (recorded by hand or uploaded), combined where compatible.
function candidateResults(state, capabilityId, measure) {
  if (measure.source === TESTS_SOURCE) {
    const e = measuredEvidence(state, capabilityId, measure);
    return e ? [{ ...e, label: 'Authority Lab tests', freshForDays: FRESH_DAYS.tests }] : [];
  }
  if (measure.source === FEEDBACK_SOURCE) {
    const m = feedbackMeasurements(state, capabilityId).find((x) => x.metric === measure.metric && !measure.segment);
    if (!m) return [];
    const { date, label, ...measured } = m;
    return [{ id: `feedback:${capabilityId}#${m.metric}`, date, metric: label, sourceId: FEEDBACK_SOURCE, measure: measured, external: { importId: 'recorded feedback', kind: 'production' }, label: 'Feedback', freshForDays: FRESH_DAYS.feedback, itemIds: [] }];
  }
  const standing = importedStanding(state, capabilityId);
  const seg = measure.segment || null;
  const matching = capData(state, capabilityId).evidence.filter((e) => e.external && e.measure
    && e.measure.metric === measure.metric && (e.measure.segment || null) === seg
    && (!measure.kind || e.external.kind === measure.kind)
    && (!measure.source || sourceOfItem(e) === measure.source));
  const lightweight = matching.filter(isLightweight);
  const imported = matching.filter((e) => !isLightweight(e) && (standing.get(e.id) || {}).standing === 'current');
  const src = (e) => findSource(state, sourceOfItem(e));
  const out = imported.map((e) => ({ ...e, label: (src(e) || { name: e.source }).name, freshForDays: (src(e) || {}).freshForDays ?? null, itemIds: [e.id] }));
  return [...out, ...combineLightweight(state, lightweight)];
}

// Recorded by hand or uploaded (#142): the results that combine.
const isLightweight = (e) => e.from === 'manual' || e.from === 'uploaded';
const daysOld = (state, date) => Math.round((Date.parse(state.today) - Date.parse(date)) / 86400000);

// Compatible lightweight results combine (#142, P4): the same metric and
// segment (already matched), the same evidence mode, the same kind of
// measurement and unit, the same configuration, all inside the freshness
// window. A rate adds its cases; a count adds its events (and cases, when
// every result gives them); a single value never combines, so each stands on
// its own. The results themselves are never changed.
function combineLightweight(state, items) {
  if (!items.length) return [];
  const fresh = FRESH_DAYS['manual-review'];
  const inWindow = items.filter((e) => daysOld(state, e.date) <= fresh);
  // Nothing in the window: the newest result alone, which shows as stale.
  const pool = inWindow.length ? inWindow : [items.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0]];
  const groups = new Map();
  for (const e of pool) {
    const m = e.measure;
    const key = m.type === 'value' ? `value|${e.id}` : `${m.type}|${m.unit || ''}|${e.external.kind}|${JSON.stringify(e.external.config || {})}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  return [...groups.values()].map((list) => {
    const sorted = list.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const top = sorted[0];
    if (list.length === 1) return { ...top, label: lightweightLabel(top), freshForDays: fresh, itemIds: [top.id], combined: 1 };
    const m = top.measure;
    const sum = (k) => list.reduce((n, e) => n + (e.measure[k] || 0), 0);
    const measure = m.type === 'rate'
      ? { ...m, passed: sum('passed'), total: sum('total') }
      : { ...m, value: sum('value'), ...(list.every((e) => Number.isInteger(e.measure.total)) ? { total: sum('total') } : { total: undefined }) };
    if (measure.total === undefined) delete measure.total;
    return { ...top, id: `combined:${list.map((e) => e.id).join('+')}`.slice(0, 200), measure, label: `${list.length} combined results`, freshForDays: fresh, itemIds: sorted.map((e) => e.id), combined: list.length };
  });
}
const lightweightLabel = (e) => (e.from === 'uploaded' ? `Upload (${e.provenance ? e.provenance.fileName : e.external.capability})` : `Recorded by ${e.recordedBy ? e.recordedBy.name : e.external.capability}`);

function judgeOne(state, measure, e) {
  const m = e.measure;
  const actual = reading(m, measure.stat);
  const sample = measurementSample(m);
  const age = e.date ? daysOld(state, e.date) : null;
  const stale = e.freshForDays != null && age !== null && age > e.freshForDays;
  const base = { evidenceId: e.id, importId: e.external.importId, kind: e.external.kind, date: e.date, sample, actual, label: e.label || e.metric, itemIds: e.itemIds || [e.id], combined: e.combined || 1, stale };
  if (actual === null) return { ...base, status: 'pending', text: `This result can't be read as a ${measure.stat}` };
  // A case count reads as the bare number ("now 18" against "Minimum 40 … cases").
  const actualText = measure.stat === 'sample' ? `${actual}` : `${fmt(actual, measure.stat)}${sample !== null ? ` across ${casesText(sample)}` : ''}`;
  const ok = compare(actual, measure.op, measure.value);
  const ceilingBreached = measure.stat === 'count' && ['<=', '<', '='].includes(measure.op) && !ok && actual > measure.value;
  const needed = e.external.kind === 'production' ? (measure.minSample || MIN_PRODUCTION_SAMPLE) : measure.minSample || 0;
  if (measure.stat !== 'sample' && !ceilingBreached && needed && (sample === null || sample < needed)) {
    const short = sample === null ? 'the sample size wasn\'t reported' : `${casesText(sample)} so far, ${needed} needed`;
    return { ...base, status: e.external.kind === 'production' ? 'too-early' : 'insufficient', text: `${actualText} (${short})`, needed };
  }
  return { ...base, status: ok ? 'pass' : 'fail', text: actualText, needed };
}

export const MEASURE_WORDS = { pass: 'Met', fail: 'Not met', 'too-early': 'Too early to judge', insufficient: 'Not enough data', pending: 'No results yet', 'needs-decision': 'Needs decision', conflicting: 'Conflicting' };

// The targets as they stand now: a row with a measure takes its "now" and
// status from the imported evidence; other rows are as stored.
export function targetsNow(state, capabilityId) {
  return current(state, capabilityId, 'criteria').map((c) => {
    // No bar yet (#137): unresolved, never pass or fail.
    if (c.bar === 'needs-decision') return { ...c, status: 'needs-decision', current: 'No bar set yet' };
    if (!c.measure) return c;
    const j = judgeMeasure(state, capabilityId, c.measure);
    return { ...c, current: j.text, status: j.status, judged: j };
  });
}

// The decision requirements as they stand now: met only on a pass. A
// requirement judged by a Target whose bar still needs a decision (#137) is
// unresolved: not met, because nobody has said what "met" is, and never
// described as a failed result.
export function requirementsNow(state, capabilityId) {
  const unresolved = current(state, capabilityId, 'criteria').filter((c) => c.bar === 'needs-decision' && c.requirement);
  return current(state, capabilityId, 'requirements').map((row) => {
    // A coverage rule waiting for its number (#139): unresolved, not failed.
    if (row.bar === 'needs-decision') return withResult({ ...row, current: 'No number set yet', met: false, unresolved: true, gap: 'Its number hasn\'t been set: it needs a decision. This isn\'t a failed result.' }, 'needs-decision');
    const r = row.measure ? judgedRequirement(state, capabilityId, row) : personJudged(state, capabilityId, row);
    const open = unresolved.filter((c) => c.requirement === r.id);
    if (!open.length) return r;
    const gap = `${open.map((c) => `"${c.name}"`).join(' and ')} ${open.length === 1 ? 'has' : 'have'} no bar yet: it needs a decision. This isn't a failed result.`;
    return withResult({ ...r, met: false, unresolved: true, gap: r.met || !r.gap ? gap : `${r.gap} Also, ${gap.charAt(0).toLowerCase()}${gap.slice(1)}` }, 'needs-decision');
  });
}

// Every Requirement's result and why (#142, J): Met, Not met, Unknown,
// Conflicting, Not enough evidence, No evidence yet or Needs decision. Only
// Met counts toward readiness; none of the others is ever a pass.
export const RESULT_WORDS = { met: 'Met', 'not-met': 'Not met', unknown: 'Unknown', conflicting: 'Conflicting', 'not-enough': 'Not enough evidence', 'no-evidence': 'No evidence yet', 'needs-decision': 'Needs decision' };
const RESULT_OF = { pass: 'met', fail: 'not-met', conflicting: 'conflicting', insufficient: 'not-enough', 'too-early': 'not-enough', pending: 'no-evidence' };
function withResult(r, status, why) {
  return { ...r, result: { status, label: RESULT_WORDS[status], why: why || r.gap || (status === 'met' ? `Met: ${r.current}.` : '') } };
}

// A Requirement with no metric (#142): an open critical incident blocks the
// incidents Requirement (P6); otherwise the Owner's and Reviewers' latest
// judgments decide it (P2), and if they disagree it is Conflicting.
// Stakeholder input never decides it. With no judgment at all, a row keeps
// whatever it already had (the seeded demo's stored results).
function personJudged(state, capabilityId, row) {
  if (isIncidentRequirement(row)) {
    const open = openCriticalIncidents(state, capabilityId);
    if (open.length) {
      const why = `${open.length === 1 ? 'An open critical incident' : `${open.length} open critical incidents`}: ${open.map((x) => `${x.id} (${x.what.slice(0, 80)})`).join('; ')}. Resolving ${open.length === 1 ? 'it' : 'them'} removes this blocker; it doesn't by itself show the Requirement is met.`;
      return withResult({ ...row, met: false, current: 'Open critical incident', gap: why, incidentsOpen: open.map((x) => x.id) }, 'not-met', why);
    }
  }
  // Judgments decide only a Requirement a person judges (by its structure).
  const { counting, input } = judgedBy(state, capabilityId, row) === 'person' ? judgmentsFor(state, capabilityId, row.id) : { counting: [], input: [] };
  const note = input.length ? ` Stakeholder input: ${input.map((j) => `${j.byAt.name} says ${VERDICTS[j.verdict].toLowerCase()}`).join('; ')} (input doesn't decide it).` : '';
  const decisive = counting.filter((j) => j.verdict !== 'unknown');
  const said = (j) => `${j.byAt.name} (${j.role}) judged it ${VERDICTS[j.verdict].toLowerCase()} on ${j.date}: ${j.rationale}`;
  if (decisive.some((j) => j.verdict === 'met') && decisive.some((j) => j.verdict === 'not-met')) {
    const why = `Judgments disagree: ${decisive.map(said).join(' / ')}. Look into it, or collect more evidence.${note}`;
    return withResult({ ...row, met: false, conflicting: true, current: 'Judgments disagree', gap: why, judgments: decisive.map((j) => j.id) }, 'conflicting', why);
  }
  if (decisive.length) {
    const met = decisive.every((j) => j.verdict === 'met');
    const why = `${decisive.map(said).join(' / ')}.${note}`;
    return withResult({ ...row, met, current: met ? 'Judged met' : 'Judged not met', gap: met ? undefined : why, judgments: decisive.map((j) => j.id) }, met ? 'met' : 'not-met', why);
  }
  if (counting.length) {
    const why = `${counting.map(said).join(' / ')}. Unknown is neither met nor failed.${note}`;
    return withResult({ ...row, met: false, current: 'Judged unknown', gap: why, judgments: counting.map((j) => j.id) }, 'unknown', why);
  }
  if (row.met) return withResult(row, 'met', `Met: ${row.current}.${note}`);
  const by = judgedBy(state, capabilityId, row);
  const how = by === 'person' ? 'the Owner or a Reviewer can record a judgment' : isCoverageRule(row) ? 'choose which results it counts' : 'record a result, upload a file, or choose its evidence';
  const why = row.gap || `No evidence yet: ${how}.${note}`;
  return withResult({ ...row, gap: why }, 'no-evidence', why);
}

function judgedRequirement(state, capabilityId, r) {
  if (!r.measure) return r;
  {
    const j = judgeMeasure(state, capabilityId, r.measure);
    // A row's own explanation of its gap, written by a person, is kept while
    // the gap is open; the generated sentence is the fallback.
    const gap = j.status === 'pass' ? undefined
      : j.status === 'conflicting' ? `${j.text}. Conflicting evidence is never a pass: look into it, or collect more.`
      : r.gap ? r.gap
      : j.status === 'fail' ? `Measured ${j.text} in ${j.importId}.`
        : j.status === 'pending' ? 'No results measure this yet.'
          : `${MEASURE_WORDS[j.status]}: ${j.text}.`;
    const from = j.combined > 1 ? ` (${j.combined} compatible results combined)` : '';
    const why = j.status === 'pass' ? `Met: ${j.text}${from || `, from ${j.label}`}.` : `${gap}${from && j.status !== 'conflicting' ? from : ''}`;
    return withResult({ ...r, current: j.text, met: j.status === 'pass', gap, judged: j, ...(j.status === 'conflicting' ? { conflicting: true } : {}) }, RESULT_OF[j.status] || 'no-evidence', why);
  }
}

// How each current imported result reads against the rows bound to it, for
// the evidence list: the worst status of any target or requirement that
// judged it.
const RANK = { fail: 4, insufficient: 3, watch: 2, pass: 1 };
export function importedVerdicts(state, capabilityId) {
  const out = new Map();
  const rows = [...targetsNow(state, capabilityId), ...requirementsNow(state, capabilityId)].filter((r) => r.judged && r.judged.evidenceId);
  for (const r of rows) {
    // Too few cases is "not enough data" on the result, never a failed result.
    const s = r.judged.status === 'too-early' || (r.measure.stat === 'sample' && r.judged.status === 'fail') ? 'insufficient' : r.judged.status;
    if (!RANK[s]) continue;
    const prev = out.get(r.judged.evidenceId);
    if (!prev || RANK[s] > RANK[prev]) out.set(r.judged.evidenceId, s);
  }
  return out;
}

// Restriction rules measured from imported production evidence: the contract
// carries `ruleMeasures`, keyed by the restriction line's text. Only
// production results count; a test or eval is not the system in service.
export function ruleMeasureOf(state, capabilityId, rule) {
  const measures = current(state, capabilityId, 'contract').ruleMeasures || {};
  const m = Object.hasOwn(measures, rule.text) ? measures[rule.text] : null;
  return m && !measureProblems(m).length ? { ...m, kind: 'production' } : null;
}

// The reading for a rule bound to imported evidence, or null. A percentage
// rule waits for its minimum sample (it would be a verdict on a handful of
// cases); a count rule ("2 … within 7 days") reads at once.
export function importedRuleReading(state, capabilityId, rule) {
  const m = ruleMeasureOf(state, capabilityId, rule);
  if (!m || !getCapability(state, capabilityId)) return null;
  const e = measuredEvidence(state, capabilityId, m);
  if (!e) return null;
  const value = reading(e.measure, m.stat);
  if (value === null) return null;
  const sample = measurementSample(e.measure);
  const needed = m.minSample || (rule.window && rule.window.cases) || MIN_PRODUCTION_SAMPLE;
  const early = rule.threshold && rule.threshold.type === 'pct' && (sample === null || sample < needed);
  return { value: round(value), sample, needed, early, evidenceId: e.id, importId: e.external.importId };
}

// ---------------------------------------------------------------------------
// Evidence coverage (#126): which rows have enough evidence to judge, apart
// from whether they pass. "4 of 5 decision requirements have sufficient
// evidence" is about coverage; "X of Y checks met" is readiness.
// ---------------------------------------------------------------------------

export const COVERAGE_WORDS = {
  covered: 'Sufficient evidence',
  stale: 'Stale',
  insufficient: 'Needs more cases',
  'no-data': 'No results yet',
  'no-source': 'No source mapped',
  'needs-decision': 'Needs decision',
  judged: 'Judged by a person',
  incident: 'Open incident on record',
  unknown: 'Unknown',
  conflicting: 'Conflicting evidence',
};

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// One row's coverage. A row with no measure has no source mapped: a person
// judges it, as before. Stale evidence is older than its source's freshness
// window; it still counts (Paige, 2026-10-13), it's only flagged.
export function rowCoverage(state, capabilityId, row) {
  // A coverage rule whose number nobody has set (#139) can't be sufficient.
  if (row.bar === 'needs-decision') return { status: 'needs-decision', mapped: false };
  if (!row.measure) {
    // A person's judgment, or an open critical incident, is the evidence for
    // a Requirement with no metric (#142).
    const st = row.result && row.result.status;
    if (row.incidentsOpen) return { status: 'incident', mapped: false };
    if (st === 'met' || st === 'not-met') return { status: 'judged', mapped: false };
    if (st === 'unknown' || st === 'conflicting') return { status: st, mapped: false };
    return { status: 'no-source', mapped: false };
  }
  const j = judgeMeasure(state, capabilityId, row.measure);
  if (j.status === 'conflicting') return { status: 'conflicting', mapped: true, judged: j, source: row.measure.source ? findSource(state, row.measure.source) : null };
  const source = row.measure.source ? findSource(state, row.measure.source) : null;
  if (j.status === 'pending') return { status: 'no-data', mapped: true, judged: j, source };
  if (j.status === 'insufficient' || j.status === 'too-early') return { status: 'insufficient', mapped: true, judged: j, source };
  // A minimum-cases requirement that isn't met is a volume gap: more cases are
  // needed, which is coverage, not a failing result.
  if (row.measure.stat === 'sample' && j.status === 'fail') return { status: 'insufficient', mapped: true, judged: { ...j, text: `${j.actual} of ${row.measure.value} cases` }, source };
  const item = capData(state, capabilityId).evidence.find((e) => e.id === j.evidenceId);
  const src = source || (item ? findSource(state, sourceOfItem(item)) : null);
  const fresh = src ? src.freshForDays : null;
  const age = j.date ? daysBetween(j.date, state.today) : null;
  const stale = fresh !== null && age !== null && age > fresh;
  return { status: stale ? 'stale' : 'covered', mapped: true, judged: j, source: src, age, stale, passing: j.status === 'pass' };
}

export function evidenceCoverage(state, capabilityId) {
  const reqs = requirementsNow(state, capabilityId).map((r) => ({ kind: 'requirement', id: r.id, label: r.text, row: r, ...rowCoverage(state, capabilityId, r) }));
  const targets = targetsNow(state, capabilityId).map((c) => ({ kind: 'target', id: c.id, label: c.name, row: c, ...rowCoverage(state, capabilityId, c) }));
  const count = (list, ...st) => list.filter((x) => st.includes(x.status)).length;
  return {
    requirements: reqs,
    targets,
    // Stale evidence still counts as evidence; it is flagged, not discarded.
    sufficient: count(reqs, 'covered', 'stale', 'judged', 'incident'),
    total: reqs.length,
    mapped: reqs.filter((x) => x.mapped).length,
    gaps: reqs.filter((x) => !['covered', 'judged', 'incident'].includes(x.status)),
  };
}

// The coverage headline: "4 of 5 decision requirements have sufficient
// evidence; Minimum 40 high-value cases still needs more cases (18 of 40)."
export function coverageText(cov) {
  if (!cov.total) return 'No Requirements yet.';
  const head = `${cov.sufficient} of ${cov.total} Requirement${cov.total === 1 ? ' has' : 's have'} sufficient evidence`;
  const gap = cov.gaps.find((g) => g.status === 'conflicting') || cov.gaps.find((g) => g.status === 'needs-decision') || cov.gaps.find((g) => g.status === 'insufficient') || cov.gaps.find((g) => g.status === 'no-data') || cov.gaps.find((g) => g.status === 'no-source') || cov.gaps.find((g) => g.status === 'stale') || cov.gaps.find((g) => g.status === 'unknown');
  if (!gap) return `${head}.`;
  const why = gap.status === 'conflicting' ? 'has conflicting evidence'
    : gap.status === 'unknown' ? 'was judged Unknown'
    : gap.status === 'needs-decision' ? 'has no number yet: it needs a decision'
    : gap.status === 'insufficient' ? `still needs more cases (${gap.judged.text})`
    : gap.status === 'no-data' ? 'has no results yet'
      : gap.status === 'stale' ? `has stale evidence (${gap.age} days old)`
        : 'has no evidence source mapped';
  return `${head}; "${gap.label}" ${why}.`;
}

// ---------------------------------------------------------------------------
// Evidence signals for Monitor (#126): what has changed in the evidence since
// the decision in force, and anything that should make a person look again.
// Warnings only: like every warning here, they never block (Paige, 2026-10-13).
// ---------------------------------------------------------------------------

export function evidenceSignals(state, capabilityId) {
  const records = state.decisionRecords.filter((r) => r.capabilityId === capabilityId);
  const inForce = records.at(-1) || null;
  const since = inForce ? inForce.date : null;
  const cov = evidenceCoverage(state, capabilityId);
  const all = [...cov.requirements, ...cov.targets];
  const out = [];
  const link = (show) => `#/capabilities/${capabilityId}/evidence/configure${show ? `?row=${show}` : ''}`;
  const fresh = capData(state, capabilityId).evidence.filter((e) => e.external && since && e.date > since);
  if (fresh.length) {
    const runs = new Set(fresh.map((e) => e.external.importId)).size;
    out.push({ id: 'new', kind: 'new', date: since, record: inForce.id, what: `${runs} new evidence result${runs === 1 ? '' : 's'} since the decision in force`, why: 'The decision was made on older evidence; see whether anything it relied on has moved.', link: `#/capabilities/${capabilityId}?tab=decide&show=all` });
  }
  for (const r of all.filter((x) => x.status === 'stale')) {
    out.push({ id: `stale-${r.kind}-${r.id}`, kind: 'stale', what: `"${r.label}" rests on evidence ${r.age} days old${r.source ? `, past ${r.source.name}'s ${r.source.freshForDays}-day window` : ''}.`, why: 'It still counts, but it may no longer describe how the capability behaves today.', link: link(`${r.kind}:${r.id}`) });
  }
  const gaps = cov.requirements.filter((r) => ['insufficient', 'no-data', 'no-source'].includes(r.status));
  if (gaps.length) {
    out.push({ id: 'coverage', kind: 'coverage', what: coverageText(cov), why: 'A decision requirement without sufficient evidence is judged by people alone, or not at all.', link: link() });
  }
  const stances = new Set(current(state, capabilityId, 'stakeholders').map((s) => s.stance).filter(Boolean));
  if (stances.size > 1) {
    out.push({ id: 'disagreement', kind: 'disagreement', what: 'Stakeholders don\'t agree on how much autonomy is right.', why: 'Their positions are recorded with each decision; a change in evidence is a good moment to ask again.', link: `#/capabilities/${capabilityId}?tab=status&show=people` });
  }
  // A check that counts cases is a coverage gap, not a reason to reconsider.
  for (const r of cov.requirements.filter((x) => (x.status === 'covered' || x.status === 'stale') && !x.passing && x.row.measure.stat !== 'sample')) {
    out.push({ id: `reconsider-${r.id}`, kind: 'reconsider', what: `"${r.label}" is not met now: ${r.judged.text}.`, why: `Consider whether the authority in force${inForce ? ` (${inForce.id})` : ''} still fits. Only a person can change it; evidence never does.`, link: `#/capabilities/${capabilityId}?tab=decide` });
  }
  return out;
}
