// Remediation 3 (#153): what is true about a capability's exposure, apart
// from the Risk label a person chose. Risk shapes the questions (D4); a
// self-declared Low Risk can't erase safeguards (D5, R5-B). The facts come
// from the risk answers and from Context a person confirmed; suggested
// Context never counts. Authority Lab never changes the Risk label: it shows
// the contradiction and keeps the baseline safeguards.

import { getCapability } from './state.js';
import { current } from './selectors.js';
import { confirmedContext } from './context.js';
import { riskView } from './risk.js';
import { familiesFor } from '../data/templates.js';

// A free-text fact counts only when it says something is there: "No",
// "None" or "Unknown" don't.
const says = (v) => {
  const t = String(v || '').trim();
  return Boolean(t) && !/^(no|none|n\/a|not\b|nothing|unknown)/i.test(t);
};
const STAKES = ['Money', 'Rights', 'Accounts', 'Safety'];

export function exposureFacts(state, capabilityId) {
  const risk = current(state, capabilityId, 'risk');
  const ctx = confirmedContext(state);
  const out = [];
  if (risk.exposure === 'Customer-facing' || ['External', 'Both'].includes(ctx.environment)) out.push({ key: 'customer', label: 'It is customer-facing' });
  if (risk.exposure === 'Financial / consequential') out.push({ key: 'consequential', label: 'Its outputs have legal or financial consequences' });
  if (says(ctx.regulated)) out.push({ key: 'regulated', label: `It works in a regulated or professional context (${String(ctx.regulated).trim()})` });
  if (says(ctx.dataSensitivity)) out.push({ key: 'sensitive', label: `It handles sensitive data (${String(ctx.dataSensitivity).trim()})` });
  if (risk.reversibility === 'Difficult to reverse') out.push({ key: 'irreversible', label: 'What it does is difficult to reverse' });
  const stakes = (ctx.consequenceAreas || []).filter((a) => STAKES.includes(a));
  if (stakes.length) out.push({ key: 'stakes', label: `It can affect ${stakes.map((a) => a.toLowerCase()).join(', ')}`, areas: stakes });
  return out;
}

// Money is at stake when the risk answers say financial consequences or
// confirmed Context says it can affect money.
export function moneyAtStake(state, capabilityId) {
  const risk = current(state, capabilityId, 'risk');
  return risk.exposure === 'Financial / consequential' || (confirmedContext(state).consequenceAreas || []).includes('Money');
}

// The kind of work, which decides which Boundary patterns are relevant: the
// setup starting point, or for Start from scratch the families confirmed
// Context points to (what the AI does).
export function workTypes(state, capabilityId) {
  const cap = getCapability(state, capabilityId);
  const t = cap && cap.setup && cap.setup.template;
  if (t && t !== 'scratch') return [t];
  return familiesFor(confirmedContext(state).aiActions || []);
}

// R5-B: Low stays the person's label, but they see what it contradicts.
export function lowRiskMismatch(state, capabilityId) {
  const risk = current(state, capabilityId, 'risk');
  const rv = riskView(state, capabilityId);
  if (risk.impact !== 'Low' && rv.overall !== 'Low') return null;
  const facts = exposureFacts(state, capabilityId);
  if (!facts.length) return null;
  return {
    facts,
    title: 'You marked this Low Risk. These confirmed facts may warrant another look.',
    text: `${facts.map((f) => f.label).join('; ')}. You can keep Low: it's your judgment. The baseline safeguards stay either way.`,
  };
}

// What the suggestions are shaped by, in one place.
export function suggestionContext(state, capabilityId) {
  return { families: workTypes(state, capabilityId), facts: exposureFacts(state, capabilityId).map((f) => f.key), money: moneyAtStake(state, capabilityId) };
}
