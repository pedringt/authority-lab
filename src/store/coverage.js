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
    title: `${cap.name} has ${c.approvers.length === 0 ? 'no' : 'only one'} active Risk approver${c.approvers.length === 1 ? '' : 's'} among its possible approvers`,
    body: `High-impact or financial changes need two approvers with at least one from Risk, and one of the two could be the proposer. ${names.length ? `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} the only Risk approver${names.length === 1 ? '' : 's'} on this capability's list.` : 'Nobody on this capability\u2019s list holds the Risk approver right.'} Usually the fix is adding an existing Risk approver to the stakeholders; otherwise grant the right to someone already listed.`,
    link: `#/capabilities/${capabilityId}?tab=stakeholders`,
    linkText: 'Stakeholders',
    links: [
      { href: `#/capabilities/${capabilityId}?tab=stakeholders`, text: 'Stakeholders' },
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
    if (!isActivePerson(state, cap.owner) || !eligible.includes(cap.owner)) return { ok: false, reason: `The owner (${people(state)[cap.owner].name}) must approve and can no longer do so.` };
    return { ok: true, reason: null };
  }
  if (eligible.length < left) return { ok: false, reason: `${left} more approver${left === 1 ? '' : 's'} needed but only ${eligible.length} of the approvers frozen when it opened ${eligible.length === 1 ? 'is' : 'are'} still active.` };
  if (req.riskRequired && !riskDone && !eligible.some((k) => isRiskApprover(state, k))) return { ok: false, reason: 'A Risk approval is still needed and none of the approvers frozen when it opened holds the Risk approver right now.' };
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
    title: `${proposal.id} on ${cap.name} can no longer be signed off as proposed`,
    body: `${r.reason} The approvers were frozen when the proposal opened (${(proposal.eligible || []).map((k) => people(state)[k] ? people(state)[k].name : k).join(', ')}). The proposer can withdraw it and propose again, which freezes a fresh set.`,
    link: `#/capabilities/${capabilityId}/proposals/${proposal.id}`,
    linkText: 'Open the proposal',
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
