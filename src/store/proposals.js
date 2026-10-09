// Amendments after evidence need sign-off (#7), and stakeholders (#8).

import { getCapability, capData, updateCap, logEvent } from './state.js';
import { current, versionList, versionsInForce, performanceResultsSeen, readiness } from './selectors.js';
import { people, activePeople, isActivePerson, isRiskApprover, snapshotPerson, requireActive } from './people.js';
import { amend } from './capabilities.js';
import { SECTION_KEYS, contractValueChecks } from './contract.js';
import { criteriaLocked, defaultsFor, cleanCriteria, cleanRequirements, CORE_LABELS, threshold, defaultDeviations, saveCriteria, CORE_CRITERIA, CORE_REQUIREMENTS } from './evidence.js';

// Assumption, not yet confirmed (decision 7): the same sign-off applies to
// contract edits once a pilot has started. One named setting so it can be
// switched off.
export const SETTINGS = { CONTRACT_EDITS_NEED_SIGNOFF_AFTER_PILOT: true };

// A pilot has started once a person has moved the capability to Draft or
// above, or pilot data exists.
export function pilotStarted(state, capabilityId) {
  const d = capData(state, capabilityId);
  return Boolean(d.pilot) || state.decisionRecords.some((r) => r.capabilityId === capabilityId && r.next && r.next.level >= 2 && r.authorizedBy !== 'system');
}

export function needsSignoff(state, capabilityId, kind) {
  if (kind === 'criteria') return criteriaLocked(state, capabilityId);
  if (kind === 'contract') return SETTINGS.CONTRACT_EDITS_NEED_SIGNOFF_AFTER_PILOT && pilotStarted(state, capabilityId);
  if (kind === 'stakeholders') return performanceResultsSeen(state, capabilityId);
  throw new Error(`Unknown amendment kind: ${kind}`);
}

// Membership (who) and team labels are governed; position, stance and
// reasoning are not.
export function stakeholderMembershipChanged(before, after) {
  const key = (list) => list.map((st) => `${st.person}|${st.team}`).sort().join(',');
  return key(before) !== key(after);
}

// Who must approve (decision 7, revised): the proposer never approves.
// Low/Medium impact: one approver, the owner, or any other named stakeholder
// if the owner proposed. High impact or Financial exposure: two distinct
// approvers, at least one from Risk. Owners can still propose.
export function signoffRequirements(state, capabilityId, proposedBy = null) {
  const cap = getCapability(state, capabilityId);
  const risk = current(state, capabilityId, 'risk');
  const high = risk.impact === 'High' || risk.exposure === 'Financial / consequential';
  if (high) return { approvers: 2, riskRequired: true, ownerOnly: false };
  const ownerProposed = Boolean(cap && proposedBy && proposedBy === cap.owner);
  return { approvers: 1, riskRequired: false, ownerOnly: !ownerProposed };
}

export function requirementLabel(req) {
  if (!req) return '';
  if (req.approvers === 1) return req.ownerOnly ? 'the owner' : 'one other named stakeholder (the owner proposed)';
  return 'two different approvers, at least one from Risk';
}

// Named stakeholders of a capability: the owner and the people in its
// stakeholder list. Whether one of them counts as Risk is decided by their
// team in the roster, not by the list. If no stakeholders are named yet, any
// named person.
export function namedStakeholders(state, capabilityId) {
  const cap = getCapability(state, capabilityId);
  const listed = current(state, capabilityId, 'stakeholders').map((st) => st.person).filter((k) => isActivePerson(state, k));
  if (!listed.length) return Object.keys(activePeople(state));
  return [...new Set([...(cap && isActivePerson(state, cap.owner) ? [cap.owner] : []), ...listed])];
}

// Risk eligibility is the recorded Risk approver right on an active person.
// Never a team name, never a stakeholder label.
export function isRiskStakeholder(state, capabilityId, personKey) {
  return isRiskApprover(state, personKey);
}

export function riskStakeholders(state, capabilityId) {
  return Object.keys(activePeople(state)).filter((k) => isRiskStakeholder(state, capabilityId, k));
}

export function openProposal(state, capabilityId, kind) {
  return capData(state, capabilityId).proposals.find((p) => p.kind === kind && p.status === 'open') || null;
}

export function getProposal(state, capabilityId, proposalId) {
  return capData(state, capabilityId).proposals.find((p) => p.id === proposalId) || null;
}

export function cleanContractValue(value) {
  const v = {};
  for (const k of SECTION_KEYS) v[k] = (Array.isArray(value && value[k]) ? value[k] : []).map((t) => String(t).trim()).filter(Boolean);
  if (!v.may.length && !v.mustAsk.length && !v.mustNever.length) throw new Error('A contract needs at least one line.');
  return v;
}

// Submitted rows carry only what a person edits (name, target, note, text).
// Everything measured or recorded on the base row (current, status, met, gap,
// source) is kept, so the proposal's diff shows only the proposed change.
export function cleanAmendmentValue(state, capabilityId, kind, value) {
  if (kind === 'contract') return cleanContractValue(value);
  if (kind === 'stakeholders') return cleanStakeholders(state, value);
  const c = cleanCriteria(value && value.criteria);
  const r = cleanRequirements(value && value.requirements);
  const missingCore = [...CORE_CRITERIA.filter((id) => !c.some((x) => x.id === id)), ...CORE_REQUIREMENTS.filter((id) => !r.some((x) => x.id === id))];
  if (missingCore.length) throw new Error(`Core rows can be adjusted but not removed: ${missingCore.map((id) => CORE_LABELS[id]).join(', ')}.`);
  const baseC = current(state, capabilityId, 'criteria');
  const baseR = current(state, capabilityId, 'requirements');
  const criteria = c.map((x) => { const b = baseC.find((y) => y.id === x.id); return b ? { ...b, name: x.name, target: x.target, note: x.note } : x; });
  const requirements = r.map((x) => { const b = baseR.find((y) => y.id === x.id); return b ? { ...b, text: x.text } : x; });
  return { criteria, requirements };
}

// Re-evaluate a requirement's "met" when its threshold changed and the current
// value is a number. Otherwise the stored judgment stands.
export function evaluateRequirement(req, baseReq) {
  const t = threshold(req.text);
  const base = baseReq ? threshold(baseReq.text) : null;
  const n = parseFloat(String(req.current || '').replace(/[^0-9.]/g, ''));
  if (!t || Number.isNaN(n) || !/^\s*\$?\d/.test(String(req.current || ''))) return Boolean(req.met);
  if (base && base.n === t.n && base.atLeast === t.atLeast) return Boolean(req.met);
  return t.atLeast ? n >= t.n : n < t.n;
}

// Readiness now and under a proposal, e.g. "5 of 6 met now, 6 of 6 under the proposal".
export function proposalReadiness(state, capabilityId, proposal) {
  const now = readiness(state, capabilityId);
  if (!proposal || proposal.kind !== 'criteria') return { now, proposed: null };
  const base = current(state, capabilityId, 'requirements');
  const reqs = proposal.value.requirements.map((r) => {
    const b = base.find((x) => x.id === r.id);
    const merged = { ...r, current: b ? b.current : r.current, met: b ? b.met : r.met, gap: b ? b.gap : r.gap };
    return { ...merged, met: evaluateRequirement(merged, b) };
  });
  return { now, proposed: { met: reqs.filter((r) => r.met).length, total: reqs.length, unmet: reqs.filter((r) => !r.met), requirements: reqs } };
}

// ---------------------------------------------------------------------------
// Tightening-only amendments skip sign-off (roadmap item 8, Paige 2026-10-09)
// ---------------------------------------------------------------------------

// A threshold line split into its comparison, its number, and everything else
// (the number replaced by #). Two lines compare only when everything but the
// number is identical: same wording, same unit, same comparison.
export function thresholdParts(text) {
  const t = String(text || '');
  const m = t.match(/(≥|>=|≤|<=|<|>|\bminimum\b|\bat least\b|\bmaximum\b|\bat most\b)(\s*\$?\s*)(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const atLeast = ['≥', '>=', '>', 'minimum', 'at least'].includes(m[1].toLowerCase());
  const at = m.index + m[1].length + m[2].length;
  return { atLeast, n: Number(m[3]), skeleton: t.slice(0, at) + '#' + t.slice(at + m[3].length) };
}

// Software decides what "tightening only" means: every changed criterion or
// requirement is stricter (a higher "at least", a lower "at most", more
// required cases) and nothing else about it changed; nothing is removed,
// added, reworded, renamed or loosened. Anything else needs sign-off.
export function tighteningOnly(base, next) {
  const changes = [];
  const kinds = [
    ['criteria', 'target', (x) => x.name, ['name', 'note']],
    ['requirements', 'text', (x) => x.text, []],
  ];
  for (const [kind, field, label, fixed] of kinds) {
    const before = base[kind] || [];
    const after = next[kind] || [];
    for (const b of before) if (!after.some((a) => a.id === b.id)) return { ok: false, reason: `It removes "${label(b)}".`, changes };
    for (const a of after) {
      const b = before.find((x) => x.id === a.id);
      if (!b) return { ok: false, reason: `It adds "${label(a)}", which software can't compare with anything.`, changes };
      for (const f of fixed) if (String(a[f] || '') !== String(b[f] || '')) return { ok: false, reason: `It changes the ${f} of "${label(b)}".`, changes };
      if (String(a[field] || '') === String(b[field] || '')) continue;
      const p = thresholdParts(b[field]);
      const q = thresholdParts(a[field]);
      if (!p || !q) return { ok: false, reason: `"${label(b)}" has no threshold software can compare.`, changes };
      if (p.skeleton !== q.skeleton) return { ok: false, reason: `"${label(b)}" changes more than its number (its wording, unit or comparison).`, changes };
      const stricter = p.atLeast ? q.n > p.n : q.n < p.n;
      if (!stricter) return { ok: false, reason: `"${label(b)}" is ${q.n === p.n ? 'not stricter' : 'loosened'}: ${b[field]} → ${a[field]}.`, changes };
      changes.push({ kind, id: a.id, label: label(b), from: b[field], to: a[field] });
    }
  }
  if (!changes.length) return { ok: false, reason: 'Nothing is tightened.', changes };
  return { ok: true, reason: null, changes };
}

export function applyCriteriaDirect(state, capabilityId, value, by, reason) {
  return saveCriteria(state, capabilityId, { criteria: value.criteria, requirements: value.requirements, by, reason });
}

// Propose a change to locked criteria/requirements, or to the contract once a
// pilot has started. Before those points the change is applied directly as a
// new version. `by` is whoever is acting.
export function proposeAmendment(state, capabilityId, kind, { value, by, reason } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  requireActive(state, by, 'propose an amendment');
  const why = (reason || '').trim();
  if (why.length < 10) throw new Error('A proposal needs a reason (a sentence).');
  const clean = cleanAmendmentValue(state, capabilityId, kind, value);
  if (kind === 'contract') {
    const blocks = contractValueChecks(state, capabilityId, clean).filter((c) => c.level === 'block');
    if (blocks.length) throw new Error(`The proposed contract fails ${blocks.length} check${blocks.length === 1 ? '' : 's'}: | ${blocks.map((b) => b.text).join(' | ')}`);
  }
  if (!needsSignoff(state, capabilityId, kind)) {
    if (kind === 'criteria') return applyCriteriaDirect(state, capabilityId, clean, by, why);
    if (kind === 'stakeholders') return amend(state, capabilityId, 'stakeholders', { value: clean, author: by, reason: why });
    if (!versionList(state, capabilityId, 'contract').length) throw new Error('Finalize the contract in the builder first.');
    return amend(state, capabilityId, 'contract', { value: clean, author: by, reason: why });
  }
  if (openProposal(state, capabilityId, kind)) throw new Error('A proposal for this object is already awaiting sign-off. Approve or reject it first.');
  if (kind === 'criteria') {
    const check = tighteningOnly({ criteria: current(state, capabilityId, 'criteria'), requirements: current(state, capabilityId, 'requirements') }, clean);
    if (check.ok) return applyTightening(state, capabilityId, clean, by, why, check.changes);
  }
  const required = signoffRequirements(state, capabilityId, by);
  const eligible = namedStakeholders(state, capabilityId).filter((k) => k !== by);
  const feasible = signoffFeasibility(state, capabilityId, required, eligible, by);
  if (!feasible.ok) throw new Error(feasible.reason);
  const d = capData(state, capabilityId);
  const v = versionsInForce(state, capabilityId);
  const proposal = {
    id: `P-${d.proposals.length + 1}`,
    kind,
    capabilityId,
    proposedBy: by,
    proposedByAt: snapshotPerson(state, by),
    date: state.today,
    reason: why,
    value: clean,
    base: kind === 'contract' ? { contract: v.contract } : kind === 'stakeholders' ? { stakeholders: v.stakeholders } : { criteria: v.criteria, requirements: v.requirements },
    required,
    // Frozen when the proposal opens; later stakeholder edits do not change it.
    eligible,
    approvals: [],
    status: 'open',
    rejection: null,
    applied: null,
  };
  const s = updateCap(state, capabilityId, { proposals: [...d.proposals, proposal] });
  const who = people(state)[by];
  return logEvent(s, {
    kind: 'proposal',
    outcome: 'opened',
    title: `Amendment proposed: ${kind === 'contract' ? 'contract' : kind === 'stakeholders' ? 'stakeholders' : 'success criteria and evidence requirements'}`,
    body: `${cap.name}: ${who.name} proposed ${proposal.id} after evidence. Needs ${requirementLabel(proposal.required)}, never the proposer. Reason: ${why}`,
    capabilityId,
    link: `#/capabilities/${capabilityId}/proposals/${proposal.id}`,
  });
}

// Apply a tightening-only change straight away: new versions of both objects,
// authored by whoever is acting, marked as tightening only, with a surfaced
// amendment event after evidence. No proposal, no approvers.
function applyTightening(state, capabilityId, value, by, reason, changes) {
  const cap = getCapability(state, capabilityId);
  const requirements = proposalReadiness(state, capabilityId, { kind: 'criteria', value }).proposed.requirements;
  const meta = { tighteningOnly: true, tightened: changes };
  let s = amend(state, capabilityId, 'criteria', { value: value.criteria, author: by, reason, meta, silent: true });
  s = amend(s, capabilityId, 'requirements', { value: requirements, author: by, reason, meta, silent: true });
  const v = versionsInForce(s, capabilityId);
  return logEvent(s, {
    kind: 'amendment',
    afterEvidence: true,
    objectKind: 'criteria',
    version: v.criteria,
    tighteningOnly: true,
    title: `Success criteria tightened to v${v.criteria}, evidence requirements to v${v.requirements} after evidence`,
    body: `${cap.name}: ${people(state)[by].name} tightened ${changes.map((c) => `${c.label} (${c.from} → ${c.to})`).join('; ')}. Tightening only, so no sign-off: software checked that every change is stricter and nothing was removed, added, reworded or loosened. Reason: ${reason}`,
    capabilityId,
    link: `#/capabilities/${capabilityId}/versions?kind=criteria&version=${v.criteria}`,
  });
}

// Can the eligible approvers ever satisfy the rule? Checked when a proposal
// opens, so nothing is recorded that can never complete.
export function signoffFeasibility(state, capabilityId, required, eligible, proposedBy) {
  const cap = getCapability(state, capabilityId);
  const who = people(state)[proposedBy] ? people(state)[proposedBy].name : 'you';
  if (required.ownerOnly) {
    if (!eligible.includes(cap.owner)) return { ok: false, reason: `The owner (${people(state)[cap.owner].name}) must approve and is not available to. Ask someone else to propose.` };
    return { ok: true };
  }
  if (eligible.length < required.approvers) {
    return { ok: false, reason: `This needs ${required.approvers} approvers other than ${who}, and only ${eligible.length} named stakeholder${eligible.length === 1 ? ' is' : 's are'} eligible. Add stakeholders or ask someone else to propose.` };
  }
  if (required.riskRequired && !eligible.some((k) => isRiskStakeholder(state, capabilityId, k))) {
    return { ok: false, reason: `No Risk approver other than ${who}. Add another Risk person to the stakeholders or ask someone else to propose.` };
  }
  if (required.riskRequired && required.approvers === 2 && eligible.length === 1) {
    return { ok: false, reason: `Only one eligible approver other than ${who}; this needs two. Add stakeholders or ask someone else to propose.` };
  }
  return { ok: true };
}

export function roleLabel(role) {
  return role === 'owner' ? 'the owner' : role === 'risk' ? 'a Risk stakeholder' : 'a named stakeholder';
}

export function roleFor(state, capabilityId, personKey) {
  const cap = getCapability(state, capabilityId);
  if (isRiskStakeholder(state, capabilityId, personKey)) return 'risk';
  if (cap && personKey === cap.owner) return 'owner';
  return 'stakeholder';
}

export function approvalsComplete(proposal) {
  const req = proposal.required;
  if (proposal.approvals.length < req.approvers) return false;
  if (req.riskRequired && !proposal.approvals.some((a) => a.role === 'risk')) return false;
  return true;
}

// Whether the acting person can approve this proposal now, and why not.
export function approvalEligibility(state, capabilityId, proposal, personKey) {
  const cap = getCapability(state, capabilityId);
  if (!proposal || proposal.status !== 'open') return { ok: false, role: null, reason: 'This proposal is closed.' };
  if (!personKey || !people(state)[personKey]) return { ok: false, role: null, reason: 'Choose who is acting.' };
  const name = people(state)[personKey].name;
  if (!isActivePerson(state, personKey)) return { ok: false, role: null, reason: `${name} is deactivated and cannot approve.` };
  if (personKey === proposal.proposedBy) return { ok: false, role: null, reason: `${name} proposed this; the proposer never approves.` };
  if (proposal.approvals.some((a) => a.by === personKey)) return { ok: false, role: null, reason: `${name} has already approved.` };
  const req = proposal.required;
  const role = roleFor(state, capabilityId, personKey);
  if (req.ownerOnly) {
    if (personKey !== cap.owner) return { ok: false, role: null, reason: `${name} cannot approve this. Needed: the owner (${people(state)[cap.owner].name}).` };
    return { ok: true, role: 'owner', reason: null };
  }
  const eligible = proposal.eligible || namedStakeholders(state, capabilityId);
  if (!eligible.includes(personKey)) return { ok: false, role: null, reason: `${name} was not an eligible approver when this proposal opened.` };
  // Last slot on a High/Financial proposal must be Risk if none has signed yet.
  const remaining = req.approvers - proposal.approvals.length;
  const riskStill = req.riskRequired && !proposal.approvals.some((a) => a.role === 'risk');
  if (riskStill && remaining <= 1 && role !== 'risk') {
    return { ok: false, role: null, reason: `${name} cannot take the last approval: at least one approver must be from Risk (${riskStakeholders(state, capabilityId).map((k) => people(state)[k].name).join(', ') || 'none named'}).` };
  }
  return { ok: true, role, reason: null };
}

export function approveProposal(state, capabilityId, proposalId, { by } = {}) {
  const cap = getCapability(state, capabilityId);
  const proposal = getProposal(state, capabilityId, proposalId);
  if (!proposal) throw new Error(`Unknown proposal: ${proposalId}`);
  const e = approvalEligibility(state, capabilityId, proposal, by);
  if (!e.ok) throw new Error(e.reason);
  const approvals = [...proposal.approvals, { by, byAt: snapshotPerson(state, by), role: e.role, date: state.today }];
  let next = { ...proposal, approvals };
  let s = state;
  const who = people(state)[by];
  if (!approvalsComplete(next)) {
    s = updateCap(s, capabilityId, { proposals: capData(s, capabilityId).proposals.map((p) => (p.id === proposalId ? next : p)) });
    const left = proposal.required.approvers - approvals.length;
    const riskStill = proposal.required.riskRequired && !approvals.some((a) => a.role === 'risk');
    return logEvent(s, {
      kind: 'proposal',
      outcome: 'approval',
      title: `Approval recorded on ${proposalId}`,
      body: `${cap.name}: ${who.name} approved as ${roleLabel(e.role)}. Still needed: ${left} more approver${left === 1 ? '' : 's'}${riskStill ? ', from Risk' : ''}.`,
      capabilityId,
      link: `#/capabilities/${capabilityId}/proposals/${proposalId}`,
    });
  }
  // Fully approved: apply as new versions, authored by the proposer, with the
  // approvals on the version.
  const meta = { proposalId, proposedBy: proposal.proposedBy, approvals };
  const applied = {};
  if (proposal.kind === 'contract') {
    s = amend(s, capabilityId, 'contract', { value: proposal.value, author: proposal.proposedBy, reason: proposal.reason, meta, silent: true });
    applied.contract = versionsInForce(s, capabilityId).contract;
  } else if (proposal.kind === 'stakeholders') {
    s = amend(s, capabilityId, 'stakeholders', { value: proposal.value, author: proposal.proposedBy, reason: proposal.reason, meta, silent: true });
    applied.stakeholders = versionsInForce(s, capabilityId).stakeholders;
  } else {
    const defaults = defaultsFor(s, capabilityId);
    const deviations = (kind, items, textOf) => defaultDeviations(defaults[kind], items, textOf).map((x) => ({ ...x, label: kind === 'criteria' ? (defaults.criteria.find((y) => y.id === x.id) || {}).name : null }));
    // Requirements keep their measured "current" values; "met" is re-evaluated
    // where the threshold changed and the value is a number.
    const requirements = proposalReadiness(s, capabilityId, proposal).proposed.requirements;
    const criteria = proposal.value.criteria;
    s = amend(s, capabilityId, 'criteria', { value: criteria, author: proposal.proposedBy, reason: proposal.reason, meta: { ...meta, deviations: deviations('criteria', criteria, (x) => x.target) }, silent: true });
    s = amend(s, capabilityId, 'requirements', { value: requirements, author: proposal.proposedBy, reason: proposal.reason, meta: { ...meta, deviations: deviations('requirements', requirements, (x) => x.text) }, silent: true });
    applied.criteria = versionsInForce(s, capabilityId).criteria;
    applied.requirements = versionsInForce(s, capabilityId).requirements;
  }
  next = { ...next, status: 'approved', applied, closedAt: state.today };
  s = updateCap(s, capabilityId, { proposals: capData(s, capabilityId).proposals.map((p) => (p.id === proposalId ? next : p)) });
  const label = proposal.kind === 'contract' ? `Contract amended to v${applied.contract}` : proposal.kind === 'stakeholders' ? `Stakeholders amended to v${applied.stakeholders}` : `Success criteria amended to v${applied.criteria}, evidence requirements to v${applied.requirements}`;
  return logEvent(s, {
    kind: 'amendment',
    afterEvidence: true,
    objectKind: proposal.kind === 'contract' ? 'contract' : proposal.kind === 'stakeholders' ? 'stakeholders' : 'criteria',
    version: proposal.kind === 'contract' ? applied.contract : proposal.kind === 'stakeholders' ? applied.stakeholders : applied.criteria,
    proposalId,
    title: `${label} after evidence`,
    body: `${cap.name}: proposed by ${people(state)[proposal.proposedBy].name}, approved by ${approvals.map((a) => `${people(state)[a.by].name} (${roleLabel(a.role)})`).join(' and ')}. ${proposal.reason}`,
    capabilityId,
    link: `#/capabilities/${capabilityId}/proposals/${proposalId}`,
  });
}

// The proposer withdraws an open proposal. Recorded with a reason, like a rejection.
export function withdrawProposal(state, capabilityId, proposalId, { by, reason } = {}) {
  const cap = getCapability(state, capabilityId);
  const proposal = getProposal(state, capabilityId, proposalId);
  if (!proposal) throw new Error(`Unknown proposal: ${proposalId}`);
  if (proposal.status !== 'open') throw new Error('This proposal is closed.');
  if (!by || by !== proposal.proposedBy) throw new Error('Only the proposer can withdraw a proposal; others reject it.');
  requireActive(state, by, 'withdraw a proposal');
  const why = (reason || '').trim();
  if (why.length < 10) throw new Error('A withdrawal needs a reason (a sentence).');
  const next = { ...proposal, status: 'withdrawn', withdrawal: { by, byAt: snapshotPerson(state, by), date: state.today, reason: why }, closedAt: state.today };
  const s = updateCap(state, capabilityId, { proposals: capData(state, capabilityId).proposals.map((p) => (p.id === proposalId ? next : p)) });
  return logEvent(s, {
    kind: 'proposal',
    outcome: 'withdrawn',
    title: `Amendment withdrawn: ${proposalId}`,
    body: `${cap.name}: ${people(state)[by].name} withdrew their proposal. ${why}`,
    capabilityId,
    link: `#/capabilities/${capabilityId}/proposals/${proposalId}`,
  });
}

export function rejectProposal(state, capabilityId, proposalId, { by, reason } = {}) {
  const cap = getCapability(state, capabilityId);
  const proposal = getProposal(state, capabilityId, proposalId);
  if (!proposal) throw new Error(`Unknown proposal: ${proposalId}`);
  if (proposal.status !== 'open') throw new Error('This proposal is closed.');
  requireActive(state, by, 'reject a proposal');
  if (by === proposal.proposedBy) throw new Error('The proposer withdraws rather than rejects; someone else must reject.');
  const why = (reason || '').trim();
  if (why.length < 10) throw new Error('A rejection needs a reason (a sentence).');
  const frozen = proposal.eligible || namedStakeholders(state, capabilityId);
  const eligible = by === cap.owner || isRiskStakeholder(state, capabilityId, by) || (!proposal.required.ownerOnly && frozen.includes(by));
  if (!eligible) throw new Error(`${people(state)[by].name} is not eligible to reject this: ${requirementLabel(proposal.required)} decide.`);
  const next = { ...proposal, status: 'rejected', rejection: { by, byAt: snapshotPerson(state, by), date: state.today, reason: why }, closedAt: state.today };
  const s = updateCap(state, capabilityId, { proposals: capData(state, capabilityId).proposals.map((p) => (p.id === proposalId ? next : p)) });
  return logEvent(s, {
    kind: 'proposal',
    outcome: 'rejected',
    title: `Amendment rejected: ${proposalId}`,
    body: `${cap.name}: ${people(state)[by].name} rejected the proposal by ${people(state)[proposal.proposedBy].name}. ${why}`,
    capabilityId,
    link: `#/capabilities/${capabilityId}/proposals/${proposalId}`,
  });
}


export const STANCES = [['expand', 'Expand'], ['expand-limits', 'Expand with limits'], ['hold', 'Hold'], ['restrict', 'Restrict'], ['undecided', 'No position yet']];

export function cleanStakeholders(state, stakeholders) {
  if (!Array.isArray(stakeholders) || !stakeholders.length) throw new Error('Name at least one stakeholder.');
  const seen = new Set();
  return stakeholders.map((st, i) => {
    const team = (st.team || '').trim();
    const person = st.person;
    if (!team) throw new Error(`Stakeholder ${i + 1} needs a team.`);
    if (!person || !people(state)[person]) throw new Error(`Stakeholder ${i + 1} needs a named person.`);
    if (!isActivePerson(state, person)) throw new Error(`${people(state)[person].name} is deactivated and cannot be a stakeholder.`);
    if (seen.has(person)) throw new Error(`${people(state)[person].name} is listed twice.`);
    seen.add(person);
    const stance = STANCES.some(([k]) => k === st.stance) ? st.stance : 'undecided';
    const position = (st.position || '').trim() || (STANCES.find(([k]) => k === stance) || [])[1] || 'No position yet';
    return { team, person, stance, position, quote: (st.quote || '').trim(), date: st.date || state.today };
  });
}

// Save the stakeholder list. Before performance results exist every save is a
// direct new version. After that, a change to who is listed or to a team
// label goes through a proposal with sign-off; position, stance and
// reasoning updates stay direct.
export function saveStakeholders(state, capabilityId, { stakeholders, by, reason } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  requireActive(state, by, 'save the stakeholders');
  const list = cleanStakeholders(state, stakeholders);
  const before = current(state, capabilityId, 'stakeholders');
  const first = !before.length;
  const why = (reason || '').trim() || (first ? 'Stakeholders named.' : 'Stakeholders updated.');
  if (needsSignoff(state, capabilityId, 'stakeholders') && stakeholderMembershipChanged(before, list)) {
    return proposeAmendment(state, capabilityId, 'stakeholders', { value: list, by, reason: (reason || '').trim() || 'Stakeholder membership change after performance results.' });
  }
  return amend(state, capabilityId, 'stakeholders', { value: list, author: by, reason: why });
}
