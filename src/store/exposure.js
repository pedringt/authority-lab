// Remediation 3 (#153): what is true about a capability's exposure, apart
// from the Risk label a person chose. Risk shapes the questions (D4); a
// self-declared Low Risk can't erase safeguards (D5, R5-B).
//
// Context informs setup; it does not silently determine it (Paige,
// 2026-10-20, #154 review). Two kinds of fact, kept apart:
// - Capability facts: this capability's own Risk answers, and its answers to
//   the questions Context raises ("This workflow handles client financial
//   records. Does this capability access or use them?"). Only these can show
//   the Low-Risk contradiction and require the baseline safeguards.
// - Workspace Context: confirmed facts about the whole workflow. They shape
//   which suggestions appear and which questions are asked, but never prove
//   that this capability itself handles sensitive data, money and so on.
// Authority Lab never changes the Risk label.

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
const lower = (list) => list.map((a) => a.toLowerCase()).join(', ');

// The questions confirmed workspace Context raises for one capability, each
// with this capability's answer ('yes', 'no' or null when unanswered).
export const CONTEXT_QUESTION_KEYS = ['sensitive', 'regulated', 'stakes'];
export function contextQuestions(state, capabilityId) {
  const ctx = confirmedContext(state);
  const answers = current(state, capabilityId, 'risk').contextAnswers || {};
  const out = [];
  if (says(ctx.dataSensitivity)) out.push({ key: 'sensitive', question: `This workflow handles ${String(ctx.dataSensitivity).trim().replace(/^./, (c) => c.toLowerCase())}. Does this capability access or use them?`, value: String(ctx.dataSensitivity).trim() });
  if (says(ctx.regulated)) out.push({ key: 'regulated', question: `This workflow is in a regulated or professional context (${String(ctx.regulated).trim()}). Is this capability's own work part of it?`, value: String(ctx.regulated).trim() });
  const stakes = (ctx.consequenceAreas || []).filter((a) => STAKES.includes(a));
  if (stakes.length) out.push({ key: 'stakes', question: `This workflow can affect ${lower(stakes)}. Can this capability itself affect them?`, value: stakes });
  return out.map((q) => ({ ...q, answer: ['yes', 'no'].includes(answers[q.key]) ? answers[q.key] : null }));
}

// Facts confirmed for this capability: its Risk answers, and a Yes to a
// question Context raised.
export function exposureFacts(state, capabilityId) {
  const risk = current(state, capabilityId, 'risk');
  const yes = Object.fromEntries(contextQuestions(state, capabilityId).filter((q) => q.answer === 'yes').map((q) => [q.key, q]));
  const out = [];
  if (risk.exposure === 'Customer-facing') out.push({ key: 'customer', label: 'It is customer-facing' });
  if (risk.exposure === 'Financial / consequential') out.push({ key: 'consequential', label: 'Its outputs have legal or financial consequences' });
  if (yes.regulated) out.push({ key: 'regulated', label: `Its work is part of a regulated or professional context (${yes.regulated.value})` });
  if (yes.sensitive) out.push({ key: 'sensitive', label: `It accesses or uses sensitive data (${yes.sensitive.value})` });
  if (risk.reversibility === 'Difficult to reverse') out.push({ key: 'irreversible', label: 'What it does is difficult to reverse' });
  if (yes.stakes) out.push({ key: 'stakes', label: `It can affect ${lower(yes.stakes.value)}`, areas: yes.stakes.value });
  return out;
}

// Money is at stake for this capability when its Risk answers say financial
// consequences, or it said Yes to affecting money.
export function moneyAtStake(state, capabilityId) {
  const risk = current(state, capabilityId, 'risk');
  return risk.exposure === 'Financial / consequential' || exposureFacts(state, capabilityId).some((f) => f.key === 'stakes' && f.areas.includes('Money'));
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
// Only capability facts count: a workflow's broad exposure isn't this
// capability's.
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

// What the suggestions are shaped by. Workspace Context counts here, unless
// this capability answered No to the question it raised: a suggestion can be
// rejected, so asking too much is safe; deciding too much isn't.
export function suggestionContext(state, capabilityId) {
  const facts = new Set(exposureFacts(state, capabilityId).map((f) => f.key));
  let money = moneyAtStake(state, capabilityId);
  for (const q of contextQuestions(state, capabilityId)) {
    if (q.answer === 'no') continue;
    facts.add(q.key);
    if (q.key === 'stakes' && q.value.includes('Money')) money = true;
  }
  return { families: workTypes(state, capabilityId), facts: [...facts], money };
}
