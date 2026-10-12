// Expected vs actual, and a simple ROI (roadmap item 9, B2, #73).
//
// Each expected outcome on the decision record that granted the current
// authority (B1) is matched to a measured metric by a simple recogniser, like
// the gate's contract lines. Every actual says where it came from: the gate
// log (with its sources: seeded, this session, recorded, mock), or the seeded
// pilot and monitoring data. An outcome no recogniser matches is shown as not
// measured, never guessed.
//
// The ROI is deliberately simple, with every assumption visible. Assumptions
// change only as a new version, with who changed them and why.

import { getCapability, capData, updateCap, logEvent } from './state.js';
import { current } from './selectors.js';
import { people, snapshotPerson, isActivePerson } from './people.js';
import { gateEvents, categoryOf, GATE_SOURCES } from './gatelog.js';
import { parseTarget } from './decisions.js';

const SEEDED_PILOT = 'Demo data (pilot)';
const SEEDED_MONITORING = 'Demo data (since the AI was given more authority)';

// The decision record that granted the capability's current authority.
export function grantingRecord(state, capabilityId) {
  const cap = getCapability(state, capabilityId);
  if (!cap) return null;
  const recs = state.decisionRecords.filter((r) => r.capabilityId === cap.id && r.authorizedBy !== 'system' && r.next && r.next.level === cap.authority.level);
  return recs[recs.length - 1] || null;
}

// Rates the AI's actions produced. The gate log is the instrumentation (A5),
// but the two seeded waiting requests aren't a sample, so until the log has
// actions from a session or a recorded run, the seeded monitoring window is
// used instead, and labelled as such.
export function actionRates(state, capabilityId) {
  // Only real activity counts: seeded events are left out, so demo data never
  // mixes into a session's or a recorded run's rates.
  const live = gateEvents(state, capabilityId).filter((e) => e.source !== 'seeded');
  const count = (c) => live.filter((e) => categoryOf(e) === c).length;
  const allowed = count('allowed'); const escalated = count('escalated'); const blocked = count('blocked');
  const actions = allowed + escalated + blocked;
  if (actions) {
    const pct = (n) => Math.round((n / actions) * 1000) / 10;
    const sources = [...new Set(live.map((e) => e.source))];
    return { automation: pct(allowed), escalation: pct(escalated), block: pct(blocked), actions, automated: allowed, source: `Logged actions: ${sources.map((x) => GATE_SOURCES[x] || x).join(', ')}`, seeded: false };
  }
  const m = capData(state, capabilityId).monitoring;
  if (m && (m.autonomousActions || m.escalated)) {
    const total = m.autonomousActions + m.escalated;
    const pct = (n) => Math.round((n / total) * 1000) / 10;
    return { automation: pct(m.autonomousActions), escalation: pct(m.escalated), block: null, actions: total, automated: m.autonomousActions, source: SEEDED_MONITORING, seeded: true };
  }
  return null;
}

// The measured metrics, each with its unit, which direction is better, and
// the recogniser that matches an expected outcome's wording to it.
export const METRICS = [
  { id: 'override-rate', label: 'Reviewer reversal rate', unit: '%', better: 'lower', match: /override/i, actual: (s, c) => pilotValue(s, c, 'overrideRate') },
  { id: 'resolution', label: 'Resolution time (% faster)', unit: '%', better: 'higher', match: /resolution|resolve|handling time|time to/i, actual: (s, c) => { const p = capData(s, c).pilot; return p && p.resolutionChange != null ? { value: -p.resolutionChange, source: SEEDED_PILOT, seeded: true } : null; } },
  { id: 'ai-cost', label: 'AI cost per case', unit: '$', better: 'lower', match: /cost/i, actual: (s, c) => pilotValue(s, c, 'costPerCase') },
  { id: 'severe-error', label: 'Serious error rate', unit: '%', better: 'lower', match: /severe|error/i, actual: (s, c) => pilotValue(s, c, 'severeErrorRate') },
  { id: 'escalation', label: 'Share sent to a person', unit: '%', better: 'lower', match: /escalat/i, actual: (s, c) => rateValue(s, c, 'escalation') },
  { id: 'block', label: 'Share blocked', unit: '%', better: 'lower', match: /block/i, actual: (s, c) => rateValue(s, c, 'block') },
  { id: 'automation', label: 'Share done automatically', unit: '%', better: 'higher', match: /automat/i, actual: (s, c) => rateValue(s, c, 'automation') },
  { id: 'hours-saved', label: 'Staff hours saved a month', unit: 'h', better: 'higher', match: /hours? saved|time saved/i, actual: (s, c) => { const r = roi(s, c); return r ? { value: r.hoursSaved, source: `Estimate (ROI assumptions, version ${r.assumptions.version})`, seeded: r.seeded } : null; } },
];

function pilotValue(state, capabilityId, key) {
  const p = capData(state, capabilityId).pilot;
  return p && p[key] != null ? { value: p[key], source: SEEDED_PILOT, seeded: true } : null;
}
function rateValue(state, capabilityId, key) {
  const r = actionRates(state, capabilityId);
  return r && r[key] != null ? { value: r[key], source: r.source, seeded: r.seeded } : null;
}

export function recogniseMetric(text) {
  return METRICS.find((m) => m.match.test(text)) || null;
}

// Whether a target is a ceiling or a floor: its own words first ("≤",
// "at most", "at least"), else the metric's better direction.
function bound(target, metric) {
  if (/≤|<|at most|no more than|under|below|max/i.test(target)) return 'max';
  if (/≥|>|at least|no less than|over|above|min/i.test(target)) return 'min';
  return metric.better === 'lower' ? 'max' : 'min';
}

const fmt = (v, unit) => (unit === '$' ? `$${Number(v).toFixed(2)}` : unit === '%' ? `${Math.round(v * 10) / 10}%` : unit === 'h' ? `${Math.round(v)} h` : `${v}`);

// Each expected outcome on the record in force, with the matching actual,
// its source, and whether it's met.
export function expectedVsActual(state, capabilityId) {
  const rec = grantingRecord(state, capabilityId);
  if (!rec) return { record: null, rows: [] };
  const rows = (rec.expectedOutcomes || []).map((o) => {
    const metric = recogniseMetric(o.metric);
    if (!metric) return { ...o, metric: o.metric, measured: null, status: 'not-measured', note: 'We don\'t measure this yet.' };
    const actual = metric.actual(state, capabilityId);
    if (!actual) return { ...o, measuredAs: metric.label, status: 'not-measured', note: `No data yet for ${metric.label.toLowerCase()}.` };
    const t = parseTarget(o.target);
    // "−40%" on a time metric means 40% faster.
    const target = metric.id === 'resolution' ? Math.abs(t.value) : t.value;
    const b = bound(o.target, metric);
    const met = b === 'max' ? actual.value <= target : actual.value >= target;
    const gap = Math.round((actual.value - target) * 100) / 100;
    return {
      ...o, measuredAs: metric.label, unit: metric.unit, target: o.target, targetValue: target, bound: b,
      actual: actual.value, actualText: fmt(actual.value, metric.unit), source: actual.source, seeded: actual.seeded,
      // A gap on a percentage is in points: 42% against 50% is 8 points short.
      status: met ? 'met' : 'not-met', gapText: met ? 'Met' : `${metric.unit === '%' ? `${Math.round(Math.abs(gap) * 10) / 10} points` : fmt(Math.abs(gap), metric.unit)} ${b === 'max' ? 'over' : 'short of'} the target`,
    };
  });
  return { record: rec, rows };
}

// ---------------------------------------------------------------------------
// ROI assumptions, versioned
// ---------------------------------------------------------------------------

export const ROI_FIELDS = [
  { key: 'monthlyCases', label: 'Cases a month', unit: 'cases', min: 1, max: 1000000 },
  { key: 'humanMinutesPerCase', label: 'Human handling time per case', unit: 'minutes', min: 0.5, max: 600 },
  { key: 'humanCostPerHour', label: 'Loaded cost of a support hour', unit: '$', min: 1, max: 1000 },
];

export function roiVersions(state, capabilityId) {
  return capData(state, capabilityId).roiAssumptions || [];
}

export function currentRoiAssumptions(state, capabilityId) {
  const v = roiVersions(state, capabilityId);
  return v[v.length - 1] || null;
}

// Who may change the assumptions: the owner or a named stakeholder, active.
export function roiEditEligibility(state, capabilityId, by) {
  const cap = getCapability(state, capabilityId);
  if (!cap) return { ok: false, reason: 'Unknown capability.' };
  const roster = people(state);
  if (!by || by === 'ai' || by === 'system' || !Object.hasOwn(roster, by)) return { ok: false, reason: 'Only a named person can change the ROI assumptions.' };
  if (!isActivePerson(state, by)) return { ok: false, reason: `${roster[by].name} is deactivated, so can\'t change these.` };
  const listed = current(state, capabilityId, 'stakeholders').map((s) => s.person);
  if (by !== cap.owner && !listed.includes(by)) return { ok: false, reason: `${roster[by].name} isn't the owner or a named stakeholder of ${cap.name}.` };
  return { ok: true, reason: null };
}

// A new version of the assumptions. Earlier versions never change.
export function setRoiAssumptions(state, capabilityId, values, { by, reason } = {}) {
  const e = roiEditEligibility(state, capabilityId, by);
  if (!e.ok) throw new Error(e.reason);
  const why = String(reason || '').trim();
  if (why.length < 10) throw new Error('Add a sentence on why you\'re changing them.');
  const prev = currentRoiAssumptions(state, capabilityId);
  const next = {};
  for (const f of ROI_FIELDS) {
    const raw = values && values[f.key] !== undefined && values[f.key] !== '' ? values[f.key] : prev ? prev.values[f.key] : undefined;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < f.min || n > f.max) throw new Error(`${f.label} must be a number from ${f.min} to ${f.max}.`);
    next[f.key] = n;
  }
  if (prev && ROI_FIELDS.every((f) => prev.values[f.key] === next[f.key])) throw new Error('Nothing changed: these are the same as the current assumptions.');
  const version = { version: (prev ? prev.version : 0) + 1, values: next, by, byAt: snapshotPerson(state, by), reason: why, date: state.today, seeded: false };
  const cap = getCapability(state, capabilityId);
  const s = updateCap(state, capabilityId, (d) => ({ ...d, roiAssumptions: [...(d.roiAssumptions || []), version] }));
  // Its own kind, so Activity doesn't show it as a change to the bar.
  return logEvent(s, { kind: 'roi-assumptions', surfaced: true, title: `ROI assumptions changed (version ${version.version}): ${cap.name}`, body: `${people(state)[by].name} changed the ROI assumptions: ${ROI_FIELDS.filter((f) => !prev || prev.values[f.key] !== next[f.key]).map((f) => `${f.label.toLowerCase()} ${prev ? `${prev.values[f.key]} → ` : ''}${next[f.key]}`).join('; ')}. Reason: ${why}`, capabilityId, link: `#/capabilities/${capabilityId}?tab=monitoring&show=value` });
}

// The ROI, a month at a time. AI cost applies to every case; the human time
// saved is only on cases the AI handled on its own.
export function roi(state, capabilityId) {
  const a = currentRoiAssumptions(state, capabilityId);
  const rates = actionRates(state, capabilityId);
  const p = capData(state, capabilityId).pilot;
  if (!a || !rates || rates.automation == null || !p || p.costPerCase == null) return null;
  const v = a.values;
  const automated = v.monthlyCases * (rates.automation / 100);
  const hoursSaved = (automated * v.humanMinutesPerCase) / 60;
  const laborSaved = hoursSaved * v.humanCostPerHour;
  const aiCost = v.monthlyCases * p.costPerCase;
  const net = laborSaved - aiCost;
  const r2 = (x) => Math.round(x * 100) / 100;
  return {
    assumptions: a,
    inputs: { automationRate: { value: rates.automation, source: rates.source, seeded: rates.seeded }, aiCostPerCase: { value: p.costPerCase, source: SEEDED_PILOT, seeded: true } },
    automated: Math.round(automated), hoursSaved: r2(hoursSaved), laborSaved: r2(laborSaved), aiCost: r2(aiCost), net: r2(net),
    roiPct: aiCost > 0 ? Math.round((net / aiCost) * 100) : null,
    seeded: a.seeded || rates.seeded,
  };
}
