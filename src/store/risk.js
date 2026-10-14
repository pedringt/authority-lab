// Product reset, Phase 1 (#137): the simple default Risk model.
//
// Severity is the existing "how serious would a bad decision be" answer (the
// risk profile's `impact` field, not renamed). Likelihood and Scale are new,
// optional fields on the same versioned risk profile; a profile saved before
// #137 has neither, and reads as Likelihood Unknown and Scale not recorded.
// Reversibility is the existing answer.
//
// Overall Risk is derived, never stored or typed (Paige, 2026-10-14, #137
// 2B): a fixed table of Severity x Likelihood. Unknown Likelihood gives
// Unknown overall Risk, never Low. Every result says how it was reached.

import { getCapability } from './state.js';
import { current } from './selectors.js';
import { amend } from './capabilities.js';

// The same values as RISK_OPTIONS.impact (written out: capabilities.js
// imports this module).
export const RISK_SEVERITIES = ['Low', 'Medium', 'High'];
export const LIKELIHOODS = ['Low', 'Medium', 'High', 'Unknown'];
export const SCALES = ['One case', 'Many cases', 'Systemic', 'Unknown'];
export const OVERALL_RISKS = ['Low', 'Moderate', 'High', 'Unknown'];

// Severity -> Likelihood -> overall Risk.
export const OVERALL_RISK_TABLE = {
  Low: { Low: 'Low', Medium: 'Low', High: 'Moderate' },
  Medium: { Low: 'Low', Medium: 'Moderate', High: 'High' },
  High: { Low: 'Moderate', Medium: 'High', High: 'High' },
};

export function overallRisk(severity, likelihood) {
  if (!RISK_SEVERITIES.includes(severity)) return { overall: 'Unknown', why: 'Severity hasn\'t been set, so overall Risk is Unknown.' };
  if (!LIKELIHOODS.includes(likelihood) || likelihood === 'Unknown') return { overall: 'Unknown', why: `Severity is ${severity}, but Likelihood is Unknown, so overall Risk is Unknown. Unknown is never treated as Low.` };
  const overall = OVERALL_RISK_TABLE[severity][likelihood];
  return { overall, why: `${severity} Severity and ${likelihood} Likelihood give ${overall} overall Risk (fixed table).` };
}

// The Risk as the reset shows it, read from the current risk profile.
export function riskView(state, capabilityId) {
  const r = current(state, capabilityId, 'risk');
  const likelihood = LIKELIHOODS.includes(r.likelihood) ? r.likelihood : 'Unknown';
  return {
    severity: r.impact || null,
    likelihood,
    likelihoodRecorded: LIKELIHOODS.includes(r.likelihood),
    reversibility: r.reversibility || null,
    scale: SCALES.includes(r.scale) ? r.scale : null,
    ...overallRisk(r.impact, likelihood),
  };
}

export function cleanLikelihoodScale({ likelihood, scale } = {}) {
  const out = {};
  if (likelihood !== undefined) {
    if (!LIKELIHOODS.includes(likelihood)) throw new Error(`Likelihood must be one of: ${LIKELIHOODS.join(', ')}.`);
    out.likelihood = likelihood;
  }
  if (scale !== undefined) {
    if (!SCALES.includes(scale)) throw new Error(`Scale must be one of: ${SCALES.join(', ')}.`);
    out.scale = scale;
  }
  return out;
}

// Record Likelihood and/or Scale as a new version of the risk profile, like
// any other risk change (a named person and a reason). Severity and the other
// answers are carried over unchanged.
export function assessRisk(state, capabilityId, { likelihood, scale, by, reason } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  const add = cleanLikelihoodScale({ likelihood, scale });
  if (!Object.keys(add).length) throw new Error('Set Likelihood or Scale.');
  const value = { ...current(state, capabilityId, 'risk'), ...add };
  const s = amend(state, capabilityId, 'risk', { value, author: by, reason });
  const v = riskView(s, capabilityId);
  return { ...s, activity: [{ ...s.activity[0], body: `${s.activity[0].body} ${v.why}` }, ...s.activity.slice(1)] };
}
