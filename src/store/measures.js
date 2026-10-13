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

// The default minimum production sample before a production result is judged
// (Paige, 2026-10-12): the same 20 cases as rollout goals. A measure's own
// minSample wins.
export const MIN_PRODUCTION_SAMPLE = 20;

// What a measure compares. `rate` and `fail-rate` read a rate measurement as
// the share passed or failed; `share` reads a count against its sample; `count`
// and `value` read the number; `sample` reads the number of cases.
export const MEASURE_STATS = ['rate', 'fail-rate', 'share', 'count', 'value', 'sample'];
export const MEASURE_OPS = ['>=', '>', '<=', '<', '='];
const KEYS = ['metric', 'segment', 'stat', 'op', 'value', 'minSample', 'kind'];
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
  const standing = importedStanding(state, capabilityId);
  const seg = measure.segment || null;
  const items = capData(state, capabilityId).evidence.filter((e) => e.external && e.measure
    && e.measure.metric === measure.metric && (e.measure.segment || null) === seg
    && (!measure.kind || e.external.kind === measure.kind)
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
  const e = measuredEvidence(state, capabilityId, measure);
  if (!e) return { status: 'pending', text: 'No results yet' };
  const m = e.measure;
  const actual = reading(m, measure.stat);
  const sample = measurementSample(m);
  const base = { evidenceId: e.id, importId: e.external.importId, kind: e.external.kind, date: e.date, sample, actual };
  if (actual === null) return { ...base, status: 'pending', text: `This result can't be read as a ${measure.stat}` };
  const actualText = measure.stat === 'sample' ? casesText(actual) : `${fmt(actual, measure.stat)}${sample !== null ? ` across ${casesText(sample)}` : ''}`;
  const ok = compare(actual, measure.op, measure.value);
  const ceilingBreached = measure.stat === 'count' && ['<=', '<', '='].includes(measure.op) && !ok && actual > measure.value;
  const needed = e.external.kind === 'production' ? (measure.minSample || MIN_PRODUCTION_SAMPLE) : measure.minSample || 0;
  if (measure.stat !== 'sample' && !ceilingBreached && needed && (sample === null || sample < needed)) {
    const short = sample === null ? 'the sample size wasn\'t reported' : `${casesText(sample)} so far, ${needed} needed`;
    return { ...base, status: e.external.kind === 'production' ? 'too-early' : 'insufficient', text: `${actualText} (${short})`, needed };
  }
  return { ...base, status: ok ? 'pass' : 'fail', text: actualText, needed };
}

export const MEASURE_WORDS = { pass: 'Met', fail: 'Not met', 'too-early': 'Too early to judge', insufficient: 'Not enough data', pending: 'No results yet' };

// The targets as they stand now: a row with a measure takes its "now" and
// status from the imported evidence; other rows are as stored.
export function targetsNow(state, capabilityId) {
  return current(state, capabilityId, 'criteria').map((c) => {
    if (!c.measure) return c;
    const j = judgeMeasure(state, capabilityId, c.measure);
    return { ...c, current: j.text, status: j.status, judged: j };
  });
}

// The decision requirements as they stand now: met only on a pass.
export function requirementsNow(state, capabilityId) {
  return current(state, capabilityId, 'requirements').map((r) => {
    if (!r.measure) return r;
    const j = judgeMeasure(state, capabilityId, r.measure);
    const gap = j.status === 'pass' ? undefined
      : j.status === 'fail' ? `Measured ${j.text} in ${j.importId}.`
        : j.status === 'pending' ? 'No imported results measure this yet.'
          : `${MEASURE_WORDS[j.status]}: ${j.text}.`;
    return { ...r, current: j.text, met: j.status === 'pass', gap, judged: j };
  });
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
