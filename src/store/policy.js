// Approval policy (#157). Formal Risk approvals (a person with the
// workspace-wide Risk approver right must approve consequential changes, and
// two approvals are needed) are an organization's choice, not a default: a
// three-person firm has no Risk department. Without the policy, a
// consequential governed change needs a named Reviewer, or the owner when a
// Reviewer proposed it, who explicitly acknowledges the risk.

import { logEvent } from './state.js';
import { people, isWorkspaceAdmin, requireActive } from './people.js';

export const formalRiskApprovals = (state) => Boolean(state.policies && state.policies.formalRiskApprovals);

// A workspace admin turns the policy on or off, with a reason; it's recorded.
export function setFormalRiskApprovals(state, { on, by, reason } = {}) {
  requireActive(state, by, 'change the approval policy');
  if (!isWorkspaceAdmin(state, by)) throw new Error(`${people(state)[by].name} isn't a workspace admin, so they can't change the approval policy.`);
  const why = String(reason || '').trim();
  if (why.length < 10) throw new Error('Say why you\'re changing the approval policy (a sentence or more).');
  if (formalRiskApprovals(state) === Boolean(on)) return state;
  const s = { ...state, policies: { ...(state.policies || {}), formalRiskApprovals: Boolean(on) } };
  return logEvent(s, {
    kind: 'roster',
    surfaced: true,
    title: on ? 'Formal Risk approvals turned on' : 'Formal Risk approvals turned off',
    body: `${people(state)[by].name} ${on ? 'turned on formal Risk approvals: consequential changes now need two approvers, one with the Risk approver right' : 'turned off formal Risk approvals: consequential changes now need a named Reviewer who acknowledges the risk'}. Reason: ${why}`,
    capabilityId: null,
    link: '#/workspace',
  });
}
