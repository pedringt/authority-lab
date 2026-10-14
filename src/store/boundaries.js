// Product reset, Phase 1 (#137): the user-facing model over existing data.
// Nothing here is stored; it reads the rules (the contract) and the people
// list as they are and says what they mean in the reset's terms.

import { getCapability } from './state.js';
import { current } from './selectors.js';
import { TOOLS, enforcementTerms } from './gate.js';
import { gateMetricOf } from './gatelog.js';
import { restrictionRules } from './monitoring.js';
import { ruleMeasureOf } from './measures.js';
import { peopleRoleOf } from './proposals.js';

// ---------------------------------------------------------------------------
// Boundaries
// ---------------------------------------------------------------------------

// The user-facing categories (docs/IMPLEMENTATION_PLAN.md) and the rules
// sections that feed them. "What must always stay human" has no section of
// its own yet; whether to add one is a setup question for Phase 2.
export const BOUNDARY_CATEGORIES = [
  { key: 'allowed', label: 'Allowed', sections: ['may'] },
  { key: 'review', label: 'Needs human review', sections: ['mustAsk', 'escalation'] },
  { key: 'notAllowed', label: 'Not allowed', sections: ['mustNever'] },
  { key: 'alwaysHuman', label: 'What must always stay human', sections: [] },
];
const CATEGORY_OF = Object.fromEntries(BOUNDARY_CATEGORIES.flatMap((c) => c.sections.map((s) => [s, c.key])));

// How a Boundary is made real. A Boundary is "enforced" only when software
// actually checks it: the gate recognises the line and the capability's
// actions go through the gate. Everything else is "documented": written down,
// followed by people, not checked by Authority Lab. A check that rests on the
// model's own report is "model-reported", never "enforced".
export const ENFORCEMENT = {
  enforced: 'Enforced by Authority Lab',
  'model-reported': 'Checked against the model\'s own report (not verified)',
  documented: 'Documented only',
};

// Does this capability's real work pass through the gate? Only a capability
// with an action tool does; reading and handing off aren't actions.
export function actsThroughGate(capabilityId) {
  return Object.values(TOOLS).some((t) => t.kind === 'act' && (t.capabilities === '*' || t.capabilities.includes(capabilityId)));
}

export function boundaries(state, capabilityId) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  const contract = current(state, capabilityId, 'contract');
  const gated = actsThroughGate(capabilityId);
  const terms = enforcementTerms(state, capabilityId);
  const recognised = [...terms.mustNever, ...terms.mustAsk, ...terms.escalation];
  const enforcementOf = (section, text) => {
    if (!gated) return 'documented';
    const hit = recognised.find((l) => l.section === section && l.text === text);
    if (!hit) return 'documented';
    return hit.rule.modelReported ? 'model-reported' : 'enforced';
  };
  const lines = Object.keys(CATEGORY_OF).flatMap((section) => (contract[section] || []).map((text) => ({
    category: CATEGORY_OF[section],
    section,
    text,
    conditional: section === 'mustAsk' || section === 'escalation',
    enforcement: enforcementOf(section, text),
  })));
  // "Automation is pulled back if": a control on authority itself, not a
  // Boundary category. Enforced only when software measures it (the gate's
  // log, or imported production evidence); simulated readings don't count.
  const restrictions = restrictionRules(state, capabilityId).map((r) => ({
    section: 'autoRestriction',
    text: r.text,
    enforcement: (gated && gateMetricOf(r)) || ruleMeasureOf(state, capabilityId, r) ? 'enforced' : 'documented',
  }));
  return {
    categories: BOUNDARY_CATEGORIES.map((c) => ({ ...c, lines: lines.filter((l) => l.category === c.key) })),
    restrictions,
    actsThroughGate: gated,
  };
}

// ---------------------------------------------------------------------------
// People: one Owner, Reviewers, Stakeholders
// ---------------------------------------------------------------------------

// The simple people model. The approval rules underneath (who signs off,
// Risk approvers, proposer never approves) are unchanged and still read the
// whole named list.
export function peopleModel(state, capabilityId) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  const list = current(state, capabilityId, 'stakeholders');
  return {
    owner: cap.owner,
    reviewers: list.filter((st) => peopleRoleOf(st) === 'reviewer').map((st) => st.person),
    stakeholders: list.filter((st) => peopleRoleOf(st) === 'stakeholder').map((st) => st.person),
  };
}
