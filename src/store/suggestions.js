// Suggested values in the Decision workspace (Phase 6A, Paige, 2026-10-21,
// decision 2). Authority Lab offers a value for some rollout fields and some
// expected outcomes, computed from the record. Nothing is filled in until a
// person accepts it, one field at a time, and the record says which accepted
// values were left unchanged. Residual Risk and the person's reason never get
// a suggestion. Deterministic: no model is involved.

import { getCapability, capData, updateCap } from './state.js';
import { decisionRequired } from './selectors.js';
import { isActivePerson } from './people.js';
import { targetsNow } from './measures.js';
import { ROLLOUT_REVIEW_WITHIN_DAYS, OUTCOMES_MAX, parseTarget } from './decisions.js';

export const DECISION_SUGGESTION_LABEL = 'Authority Lab suggestion';
// How far after the start the suggested review date falls. Inside the
// ROLLOUT_REVIEW_WITHIN_DAYS window; the person can pick any valid date.
export const SUGGESTED_REVIEW_DAYS = 30;

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// What Authority Lab would suggest for this decision, each with its basis.
// rollout: { owner, startDate, reviewDate, scope } (any may be missing);
// outcomes: one per measured Target whose bar has a number.
export function decisionSuggestions(state, capabilityId) {
  const cap = getCapability(state, capabilityId);
  const d = capData(state, capabilityId).decision;
  const rollout = {};
  if (cap.owner && isActivePerson(state, cap.owner)) rollout.owner = { value: cap.owner, basis: 'the capability\'s Owner' };
  rollout.startDate = { value: state.today, basis: 'today' };
  const chosen = (d.rollout || {}).startDate;
  const start = isDate(chosen) && chosen >= state.today ? chosen : state.today;
  rollout.reviewDate = { value: addDays(start, SUGGESTED_REVIEW_DAYS), basis: `${SUGGESTED_REVIEW_DAYS} days after the start, inside the ${ROLLOUT_REVIEW_WITHIN_DAYS}-day limit` };
  const summary = String(cap.summary || '').trim();
  if (summary.length >= 10 && summary.length <= 300) rollout.scope = { value: summary, basis: 'the capability\'s summary' };
  const outcomes = targetsNow(state, capabilityId)
    .filter((t) => t.bar !== 'needs-decision' && t.current && t.name && t.target && parseTarget(t.target))
    .filter((t) => t.name.length <= 80 && t.target.length <= 60)
    .slice(0, OUTCOMES_MAX)
    .map((t) => ({ key: `outcome.${t.id}`, metric: t.name, target: t.target, basis: `the Target "${t.name}", now ${t.current}` }));
  return { rollout, outcomes };
}

const sameOutcome = (row, o) => row && String(row.metric || '').trim() === o.metric && String(row.target || '').trim() === o.target;

// Is the suggestion already in place (accepted, or typed to the same value)?
export function suggestionInPlace(state, capabilityId, key) {
  const d = capData(state, capabilityId).decision;
  const s = decisionSuggestions(state, capabilityId);
  if (key.startsWith('rollout.')) {
    const field = key.slice('rollout.'.length);
    return Boolean(s.rollout[field]) && (d.rollout || {})[field] === s.rollout[field].value;
  }
  const o = s.outcomes.find((x) => x.key === key);
  return Boolean(o) && (d.outcomes || []).some((row) => sameOutcome(row, o));
}

// A published record's accepted suggestions, put back on replay (the person
// accepted them when the decision was made). acceptedUnchanged still checks
// each against the values replayed, so nothing is claimed that isn't there.
export function restoreAccepted(state, capabilityId, list) {
  const accepted = Object.fromEntries((Array.isArray(list) ? list : []).filter((x) => x && typeof x.key === 'string' && (x.key.startsWith('rollout.') || x.key.startsWith('outcome.'))).map((x) => [x.key, x.value]));
  return updateCap(state, capabilityId, (d) => ({ ...d, decision: { ...d.decision, accepted } }));
}

// Accept one suggestion: the person's explicit act, one field at a time.
// key: "rollout.<field>" or "outcome.<targetId>". The accepted value is kept
// so the record can say if it went in unchanged.
export function acceptDecisionSuggestion(state, capabilityId, key) {
  if (!decisionRequired(state, capabilityId)) throw new Error('This decision has already been made, so nothing can be added to it.');
  const s = decisionSuggestions(state, capabilityId);
  if (typeof key === 'string' && key.startsWith('rollout.')) {
    const field = key.slice('rollout.'.length);
    const sug = Object.hasOwn(s.rollout, field) ? s.rollout[field] : null;
    if (!sug) throw new Error('There is no suggestion for that field.');
    return updateCap(state, capabilityId, (d) => ({ ...d, decision: { ...d.decision, rollout: { ...(d.decision.rollout || {}), [field]: sug.value }, rolloutPrefilled: false, accepted: { ...(d.decision.accepted || {}), [key]: sug.value } } }));
  }
  const o = s.outcomes.find((x) => x.key === key);
  if (!o) throw new Error('There is no suggestion for that outcome.');
  const rows = Array.from({ length: OUTCOMES_MAX }, (_, k) => ({ metric: '', target: '', ...((capData(state, capabilityId).decision.outcomes || [])[k] || {}) }));
  if (rows.some((row) => sameOutcome(row, o))) throw new Error(`"${o.metric}" is already an expected outcome.`);
  const free = rows.findIndex((row) => !String(row.metric || '').trim() && !String(row.target || '').trim());
  if (free < 0) throw new Error(`All ${OUTCOMES_MAX} expected outcome rows are in use. Clear one to add this.`);
  rows[free] = { metric: o.metric, target: o.target };
  return updateCap(state, capabilityId, (d) => ({ ...d, decision: { ...d.decision, outcomes: rows, outcomesPrefilled: false, accepted: { ...(d.decision.accepted || {}), [key]: { metric: o.metric, target: o.target } } } }));
}
