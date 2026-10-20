// Coverage warnings (#25). Warnings never block anything; they explain a gap.

import { getCapability, capData } from './state.js';
import { current } from './selectors.js';
import { people, isActivePerson, isRiskApprover, RIGHT_LABELS } from './people.js';
import { namedStakeholders } from './proposals.js';

export function isHighOrFinancial(state, capabilityId) {
  const risk = current(state, capabilityId, 'risk');
  return risk.impact === 'High' || risk.exposure === 'Financial / consequential';
}

// Active Risk approvers among a capability's possible approvers. A High or
// Financial capability needs two, because one of them could be the proposer.
export function riskCoverage(state, capabilityId) {
  const approvers = namedStakeholders(state, capabilityId).filter((k) => isRiskApprover(state, k));
  const needed = isHighOrFinancial(state, capabilityId) ? 2 : 0;
  return { approvers, needed, short: approvers.length < needed };
}

export function coverageWarning(state, capabilityId) {
  const c = riskCoverage(state, capabilityId);
  if (!c.short) return null;
  const cap = getCapability(state, capabilityId);
  const names = c.approvers.map((k) => people(state)[k].name);
  return {
    id: `coverage-${capabilityId}`,
    capabilityId,
    kind: 'coverage',
    // The title is the fix. "Risk" means the Risk approver right on People,
    // never a team name.
    title: c.approvers.length === 0 ? `Add two Risk approvers to ${cap.name}` : `Add a second Risk approver to ${cap.name}`,
    body: `Changes to high-impact or financial capabilities need a Risk approval, and whoever proposes a change can't approve it, so two Risk approvers are needed. ${names.length ? `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} the only Risk approver${names.length === 1 ? '' : 's'} on its stakeholder list.` : 'Nobody on its stakeholder list is a Risk approver.'} Add an existing Risk approver as a stakeholder, or make someone already listed a Risk approver on People.`,
    link: `#/capabilities/${capabilityId}/stakeholders/edit`,
    linkText: 'Manage stakeholders',
    links: [
      { href: `#/capabilities/${capabilityId}/stakeholders/edit`, text: 'Manage stakeholders' },
      { href: '#/people', text: 'People' },
    ],
  };
}

// Can an open capability proposal still be completed by its frozen approvers,
// given who is active and who holds the Risk approver right now?
export function proposalSatisfiable(state, capabilityId, proposal) {
  if (!proposal || proposal.status !== 'open') return { ok: true, reason: null };
  const cap = getCapability(state, capabilityId);
  const req = proposal.required;
  const done = proposal.approvals;
  const eligible = (proposal.eligible || []).filter((k) => isActivePerson(state, k) && !done.some((a) => a.by === k));
  const riskDone = done.some((a) => a.role === 'risk');
  const left = req.approvers - done.length;
  if (left <= 0 && (!req.riskRequired || riskDone)) return { ok: true, reason: null };
  if (req.ownerOnly) {
    if (!isActivePerson(state, cap.owner) || !eligible.includes(cap.owner)) return { ok: false, reason: `Only the owner, ${people(state)[cap.owner].name}, can approve this, and they no longer can.` };
    return { ok: true, reason: null };
  }
  if (eligible.length < left) return { ok: false, reason: `It needs ${left} more approval${left === 1 ? '' : 's'}, but only ${eligible.length} of the people who could approve it ${eligible.length === 1 ? 'is' : 'are'} still active.` };
  if (req.riskRequired && !riskDone && !eligible.some((k) => isRiskApprover(state, k))) return { ok: false, reason: 'Risk approval still needed, and none of the people who can approve it is a Risk approver any more.' };
  return { ok: true, reason: null };
}

export function proposalWarning(state, capabilityId, proposal) {
  const r = proposalSatisfiable(state, capabilityId, proposal);
  if (r.ok) return null;
  const cap = getCapability(state, capabilityId);
  return {
    id: `proposal-${capabilityId}-${proposal.id}`,
    capabilityId,
    proposalId: proposal.id,
    kind: 'proposal',
    title: `This change to ${cap.name} can no longer be approved`,
    body: `${r.reason} Who can approve ${proposal.id} was set when it was proposed: ${(proposal.eligible || []).map((k) => people(state)[k] ? people(state)[k].name : k).join(', ')}. To go ahead, whoever proposed it withdraws it and proposes it again, so the current people can approve it.`,
    link: `#/capabilities/${capabilityId}/proposals/${proposal.id}`,
    linkText: 'Open the change request',
  };
}

// Every current warning in the workspace.
export function coverageWarnings(state, capabilityId = null) {
  const caps = capabilityId ? [getCapability(state, capabilityId)].filter(Boolean) : state.capabilities;
  const out = [];
  for (const c of caps) {
    const w = coverageWarning(state, c.id);
    if (w) out.push(w);
    for (const p of capData(state, c.id).proposals.filter((x) => x.status === 'open')) {
      const pw = proposalWarning(state, c.id, p);
      if (pw) out.push(pw);
    }
  }
  return out;
}

// What a roster change would do to coverage: the capabilities that would fall
// short and the open proposals that could no longer be signed off. Computed on
// a hypothetical roster; nothing is written.
export function rosterChangeImpact(state, { kind, person, right, grant } = {}) {
  const roster = people(state);
  const p = roster[person];
  if (!p) return { capabilities: [], proposals: [], any: false };
  let next;
  if (kind === 'deactivate') next = { ...p, active: false };
  else if (kind === 'rights' && RIGHT_LABELS[right]) next = { ...p, rights: { ...p.rights, [right]: Boolean(grant) } };
  else return { capabilities: [], proposals: [], any: false };
  const hypothetical = { ...state, roster: { ...state.roster, versions: [...state.roster.versions, { version: state.roster.versions.length + 1, value: { ...roster, [person]: next } }] } };
  const before = coverageWarnings(state).map((w) => w.id);
  const after = coverageWarnings(hypothetical).filter((w) => !before.includes(w.id));
  return {
    capabilities: after.filter((w) => w.kind === 'coverage').map((w) => ({ id: w.capabilityId, name: getCapability(state, w.capabilityId).name })),
    proposals: after.filter((w) => w.kind === 'proposal').map((w) => ({ id: w.proposalId, capabilityId: w.capabilityId, name: getCapability(state, w.capabilityId).name })),
    any: after.length > 0,
  };
}
