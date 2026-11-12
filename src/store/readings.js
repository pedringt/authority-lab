// v1 W2 (#183, Paige, 2026-11-09; docs/V1_RECONCILIATION.md): manual
// readings for restriction rules, for a team with no gate log or import.
//
// - Who: the Owner or a configured Reviewer, attributed to the person
//   recording. Being a Stakeholder doesn't grant it.
// - What: the rule, the measurement period, the source, the value and units.
// - Judged by the existing restriction rules, like any other reading: one
//   over the limit restricts through the shared breach flow (applyBreach).
// - Corrections supersede a named reading, with a reason. The original is
//   kept, and a correction never restores Authority or erases a restriction
//   or incident: that still takes the post-incident review and a new decision.
//
// Paige's readings (2026-11-10):
// - Only rules nothing else measures take manual readings; a rule read from
//   the gate log or from imported production results refuses them.
// - The period matches the rule's window exactly: a 7-day rule needs a 7-day
//   period ending no later than today; a rolling 50-case rule needs 50 cases.
//   A rule with no number or no window can't take one.
// - The period end decides staleness: a new reading must end after the
//   current one. Same or earlier enters only as a correction.
// - The form checks first (the limit, the value, what would happen) and saves
//   second; saving runs the same check, so it can't skip a restriction.

import { getCapability, capData, updateCap, logEvent } from './state.js';
import { people, snapshotPerson, requireActive, isActivePerson } from './people.js';
import { current, levelName } from './selectors.js';
import { restrictionRules, ruleCrossed, applyBreach, readingText } from './monitoring.js';
import { gateMetricOf } from './gatelog.js';
import { ruleMeasureOf } from './measures.js';

export const READING_UNITS = { pct: '%', count: 'count' };
export const READING_REASON_MIN = 10;

const DAY = 86400000;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(s));
const spanDays = (start, end) => Math.round((Date.parse(end) - Date.parse(start)) / DAY) + 1;
const unitOf = (rule) => (rule.threshold && rule.threshold.type === 'pct' ? '%' : '');

export function manualReadings(state, capabilityId) {
  return capData(state, capabilityId).manualReadings || [];
}

// Readings no correction has replaced.
function standing(list) {
  const replaced = new Set(list.filter((r) => r.correctsId).map((r) => r.correctsId));
  return list.filter((r) => !replaced.has(r.id));
}

// The rule's current manual reading: the standing one with the latest period
// end (the later record breaks a tie). null when none.
export function currentReading(state, capabilityId, ruleText, list = manualReadings(state, capabilityId)) {
  const mine = standing(list.filter((r) => r.rule === ruleText));
  return mine.reduce((best, r) => (!best || r.periodEnd > best.periodEnd || (r.periodEnd === best.periodEnd && r.seq > best.seq) ? r : best), null);
}

// Why a rule can't take a manual reading, or null when it can.
export function manualReadingBlocked(state, capabilityId, rule) {
  if (gateMetricOf(rule)) return 'This limit is counted from logged actions, so it doesn\'t take manual readings.';
  if (ruleMeasureOf(state, capabilityId, rule)) return 'This limit reads imported production results, so it doesn\'t take manual readings.';
  if (!rule.threshold || !rule.window) return 'This limit has no number or no time window, so a reading can\'t be checked against it. Add them in the rules.';
  return null;
}

// Each rule with whether it takes manual readings, and its current one.
export function readingRules(state, capabilityId) {
  return restrictionRules(state, capabilityId).map((r) => ({ ...r, blocked: manualReadingBlocked(state, capabilityId, r), current: currentReading(state, capabilityId, r.text) }));
}

// Who may record: the Owner or a configured Reviewer, active.
export function readingEligibility(state, capabilityId, personKey) {
  const cap = getCapability(state, capabilityId);
  const p = people(state)[personKey];
  if (!p) return { ok: false, reason: 'Choose who is acting.' };
  if (!isActivePerson(state, personKey)) return { ok: false, reason: `${p.name} is deactivated and can't record a reading.` };
  const reviewer = current(state, capabilityId, 'stakeholders').some((st) => st.person === personKey && st.role === 'reviewer');
  if (personKey !== cap.owner && !reviewer) return { ok: false, reason: `Only the Owner (${(people(state)[cap.owner] || { name: cap.owner }).name}) or a configured Reviewer can record a reading. ${p.name} isn't one.` };
  return { ok: true, reason: null };
}

// What would happen if this rule's current value became `value`: mirrors the
// enforcement that runs on save (enforceReading), so the warning shown first
// is the outcome saving gives.
function consequenceOf(state, capabilityId, rule, value) {
  const cap = getCapability(state, capabilityId);
  const d = capData(state, capabilityId);
  const limit = `${rule.threshold.value}${unitOf(rule)}`;
  if (!rule.active) return { kind: 'inactive', text: `This limit applies only above ${levelName(rule.fallback)}. ${cap.name} is at ${levelName(cap.authority.level)}, so nothing happens.` };
  if (!ruleCrossed(rule, value)) return { kind: 'none', text: `Within the limit (${limit}). Nothing changes.` };
  if ((d.monitoring && d.monitoring.breached) || d.reviewRequired) return { kind: 'held', text: `Over the limit (${limit}). ${cap.name} has already been moved back by a safety limit, so no second automatic restriction runs. The reading is kept and shown as over the limit.` };
  if (rule.kind === 'incident') {
    if ((d.ruleIncidents || []).some((x) => x.rule === rule.text)) return { kind: 'held', text: `Over the limit (${limit}). An incident for this limit is already on record, so no new one opens.` };
    return { kind: 'incident', text: `Over the limit (${limit}): an incident opens and someone must review it. Autonomy doesn't change.` };
  }
  return { kind: 'restrict', text: `Over the limit (${limit}): ${cap.name} moves back to ${levelName(rule.fallback)} automatically, and someone must review what happened before its autonomy can expand again.` };
}

const clean = (input) => ({
  ruleId: String(input.ruleId || ''),
  value: input.value === '' || input.value == null ? null : Number(input.value),
  units: String(input.units || ''),
  periodStart: String(input.periodStart || ''),
  periodEnd: String(input.periodEnd || ''),
  cases: input.cases === '' || input.cases == null ? null : Number(input.cases),
  source: String(input.source || '').trim(),
  correctsId: String(input.correctsId || '') || null,
  reason: String(input.reason || '').trim(),
});

// Check a reading without saving it: every reason it would be refused, and,
// when it wouldn't, the limit, the value and what saving would do. `by` is
// who is recording.
export function checkReading(state, capabilityId, input = {}) {
  const cap = getCapability(state, capabilityId);
  const x = clean(input);
  if (!cap) return { ok: false, errors: [`Unknown capability: ${capabilityId}`], input: x };
  const errors = [];
  const who = readingEligibility(state, capabilityId, input.by);
  if (!who.ok) errors.push(who.reason);
  const rule = restrictionRules(state, capabilityId).find((r) => r.id === x.ruleId);
  if (!rule) return { ok: false, errors: [...errors, 'Choose the limit this reading is for.'], input: x };
  const blocked = manualReadingBlocked(state, capabilityId, rule);
  if (blocked) return { ok: false, errors: [...errors, blocked], rule, input: x };
  const pct = rule.threshold.type === 'pct';
  // Units and value.
  if (x.units !== (pct ? READING_UNITS.pct : READING_UNITS.count)) errors.push(pct ? 'This limit is a percentage: record the reading in %.' : 'This limit is a count: record the reading as a count, not a percentage.');
  if (x.value === null || !Number.isFinite(x.value)) errors.push('Enter the measured value.');
  else if (pct && (x.value < 0 || x.value > 100)) errors.push('A percentage is between 0 and 100.');
  else if (!pct && (x.value < 0 || !Number.isInteger(x.value))) errors.push('A count is a whole number, 0 or more.');
  // The measurement period, against the rule's window.
  if (!isDate(x.periodStart) || !isDate(x.periodEnd)) errors.push('Enter the first and last day of the measurement period.');
  else if (x.periodEnd < x.periodStart) errors.push('The period ends before it starts.');
  else if (x.periodEnd > state.today) errors.push(`The period can't end after today (${state.today}).`);
  else if (rule.window.days && spanDays(x.periodStart, x.periodEnd) !== rule.window.days) errors.push(`This limit is measured over ${rule.window.days} days, so the period needs to be ${rule.window.days} days long; this one is ${spanDays(x.periodStart, x.periodEnd)}.`);
  if (rule.window.cases && x.cases !== rule.window.cases) errors.push(`This limit is measured across the last ${rule.window.cases} cases, so the reading needs to cover exactly ${rule.window.cases} cases.`);
  if (x.source.length < 3) errors.push('Say where the number comes from (the report, export or check).');
  // A new reading must be newer than the current one; anything else is a
  // correction of a named reading, with a reason.
  const list = manualReadings(state, capabilityId);
  const now = currentReading(state, capabilityId, rule.text, list);
  if (x.correctsId) {
    const target = list.find((r) => r.id === x.correctsId);
    if (!target || target.rule !== rule.text) errors.push('Choose a reading of this limit to correct.');
    else if (!standing(list).includes(target)) errors.push(`${target.id} has already been corrected; correct the reading that replaced it.`);
    if (x.reason.length < READING_REASON_MIN) errors.push('Say why you are correcting it, in a short sentence.');
  } else if (now && isDate(x.periodEnd) && x.periodEnd <= now.periodEnd) {
    errors.push(`The current reading (${now.id}) covers a period ending ${now.periodEnd}. An older or duplicate reading can't replace it; enter it as a correction of a reading, with a reason.`);
  }
  if (errors.length) return { ok: false, errors, rule, input: x };
  // What would be current after saving, and what that does.
  const draft = { id: '(new)', seq: Infinity, rule: rule.text, value: x.value, periodEnd: x.periodEnd, correctsId: x.correctsId };
  const after = currentReading(state, capabilityId, rule.text, [...list, draft]);
  const consequence = consequenceOf(state, capabilityId, rule, after.value);
  return {
    ok: true,
    errors: [],
    rule,
    input: x,
    limit: `${rule.threshold.value}${unitOf(rule)}`,
    reading: readingText(rule, x.value),
    becomesCurrent: after === draft,
    currentValue: after.value,
    consequence,
  };
}

// Record the reading, then run the restriction rules on it.
export function recordReading(state, capabilityId, input = {}) {
  requireActive(state, input.by, 'record a reading');
  const check = checkReading(state, capabilityId, input);
  if (!check.ok) throw new Error(check.errors.join(' '));
  const { rule, input: x } = check;
  const cap = getCapability(state, capabilityId);
  const list = manualReadings(state, capabilityId);
  const reading = {
    id: `RD-${capabilityId}-${list.length + 1}`,
    seq: list.length + 1,
    rule: rule.text,
    ruleId: rule.id,
    contractVersion: rule.contractVersion,
    value: x.value,
    units: x.units,
    periodStart: x.periodStart,
    periodEnd: x.periodEnd,
    ...(rule.window.cases ? { cases: x.cases } : {}),
    source: x.source,
    ...(x.correctsId ? { correctsId: x.correctsId, reason: x.reason } : {}),
    date: state.today,
    by: input.by,
    byAt: snapshotPerson(state, input.by),
  };
  const next = [...list, reading];
  const now = currentReading(state, capabilityId, rule.text, next);
  const d = capData(state, capabilityId);
  let s = updateCap(state, capabilityId, { manualReadings: next, ruleReadings: { ...(d.ruleReadings || {}), [rule.text]: now.value } });
  const who = people(state)[input.by].name;
  s = logEvent(s, {
    kind: 'reading',
    surfaced: x.correctsId != null || check.consequence.kind === 'restrict' || check.consequence.kind === 'incident',
    title: x.correctsId ? `Reading corrected: ${reading.id} replaces ${x.correctsId}` : `Reading recorded: ${readingText(rule, x.value)}`,
    body: `${cap.name}: ${who} recorded ${readingText(rule, x.value)} for "${rule.text}", ${x.periodStart} to ${x.periodEnd}, from ${x.source}.${x.correctsId ? ` It corrects ${x.correctsId}: ${x.reason} A correction doesn't restore autonomy or remove any restriction or incident.` : ''}`,
    capabilityId,
    link: `#/capabilities/${capabilityId}?tab=monitor`,
  });
  return enforceReading(s, capabilityId, rule, reading);
}

// The same enforcement as the gate log and imports: a current reading over an
// active limit restricts once, through the shared breach flow.
function enforceReading(state, capabilityId, rule, reading) {
  const now = currentReading(state, capabilityId, rule.text);
  const c = consequenceOf(state, capabilityId, rule, now.value);
  if (c.kind !== 'restrict' && c.kind !== 'incident') return state;
  const who = (reading.byAt && reading.byAt.name) || people(state)[reading.by].name;
  const errors = [`${now.id}: ${now.value}${unitOf(rule)}${now.cases ? ` across ${now.cases} cases` : ''}, ${now.periodStart} to ${now.periodEnd}, from ${now.source}. Recorded by ${who}.`];
  return applyBreach(state, capabilityId, rule, { value: now.value, errors });
}
