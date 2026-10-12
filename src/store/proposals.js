// Amendments after evidence need sign-off (#7), and stakeholders (#8).

import { getCapability, capData, updateCap, logEvent } from './state.js';
import { current, versionList, versionsInForce, performanceResultsSeen, readiness, decisionRequired } from './selectors.js';
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

// The approval rule in two forms. Without approvals, a sentence: "Two people
// must approve it, including someone with the Risk approver right." With the
// approvals so far, where it stands: "1 of 2 approvals · Risk approval still
// needed".
export function requirementLabel(req, approvals = null) {
  if (!req) return '';
  if (approvals) return approvalProgress({ required: req, approvals });
  if (req.approvers === 1) return req.ownerOnly ? 'The owner must approve it.' : 'One other stakeholder must approve it, because the owner proposed it.';
  return 'Two people must approve it, including someone with the Risk approver right.';
}

function approvalProgress(proposal) {
  const req = proposal.required;
  const n = proposal.approvals.length;
  const riskStill = req.riskRequired && !proposal.approvals.some((a) => a.role === 'risk');
  return `${n} of ${req.approvers} approval${req.approvers === 1 ? '' : 's'}${riskStill ? ' · Risk approval still needed' : ''}`;
}

// Named stakeholders of a capability: the owner and the people in its
// stakeholder list. Whether one of them counts as Risk is decided by the
// Risk approver right on their person record (set on People), never by the
// team typed in the list. If no stakeholders are named yet, any named person.
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

// What each kind of proposed change is called on screen and in Activity.
const CHANGE_KIND = { contract: 'Rule change', criteria: 'Target change', stakeholders: 'Stakeholder change' };

export function openProposal(state, capabilityId, kind) {
  return capData(state, capabilityId).proposals.find((p) => p.kind === kind && p.status === 'open') || null;
}

export function getProposal(state, capabilityId, proposalId) {
  return capData(state, capabilityId).proposals.find((p) => p.id === proposalId) || null;
}

export function cleanContractValue(value) {
  const v = {};
  for (const k of SECTION_KEYS) v[k] = (Array.isArray(value && value[k]) ? value[k] : []).map((t) => String(t).trim()).filter(Boolean);
  if (!v.may.length && !v.mustAsk.length && !v.mustNever.length) throw new Error('Add at least one rule.');
  // The structured data section (A2) travels with the contract when present.
  if (value && Array.isArray(value.dataSeen)) v.dataSeen = [...new Set(value.dataSeen.map((f) => String(f).trim()).filter(Boolean))];
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
  if (missingCore.length) throw new Error(`These rows are required. You can change their numbers but not remove them: ${missingCore.map((id) => CORE_LABELS[id]).join(', ')}.`);
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
      if (!b) return { ok: false, reason: `It adds "${label(a)}", and new rows always need approval.`, changes };
      for (const f of fixed) if (String(a[f] || '') !== String(b[f] || '')) return { ok: false, reason: `It changes the ${f} of "${label(b)}".`, changes };
      if (String(a[field] || '') === String(b[field] || '')) continue;
      const p = thresholdParts(b[field]);
      const q = thresholdParts(a[field]);
      if (!p || !q) return { ok: false, reason: `"${label(b)}" doesn't have a number we can compare.`, changes };
      if (p.skeleton !== q.skeleton) return { ok: false, reason: `"${label(b)}" changes more than its number (its wording, unit or comparison).`, changes };
      const stricter = p.atLeast ? q.n > p.n : q.n < p.n;
      if (!stricter) return { ok: false, reason: `"${label(b)}" ${q.n === p.n ? "isn't any stricter" : 'is made easier to meet'}: ${b[field]} → ${a[field]}.`, changes };
      changes.push({ kind, id: a.id, label: label(b), from: b[field], to: a[field] });
    }
  }
  if (!changes.length) return { ok: false, reason: 'Nothing is made stricter.', changes };
  return { ok: true, reason: null, changes };
}

// Who may use the tightening shortcut, and when (Paige, 2026-10-09): only the
// capability owner or a named stakeholder, and never while an expansion
// decision is pending, because raising the bar then can block the decision.
// Otherwise a tightening-only change goes to normal sign-off like any other.
export function tighteningShortcut(state, capabilityId, by) {
  if (!namedStakeholders(state, capabilityId).includes(by)) {
    const who = (people(state)[by] || { name: by }).name;
    return { ok: false, reason: `Only the owner or a listed stakeholder can make targets stricter without approval. ${who} isn't either, so this change needs approval.` };
  }
  if (decisionRequired(state, capabilityId)) return { ok: false, reason: 'A decision about more authority is open, so any target change needs approval until it is made.' };
  return { ok: true, reason: null };
}

// The bar (criteria and requirements) as it changed since the pending
// decision opened: every newer version, with each changed row marked stricter,
// looser or changed. Empty when no decision is pending or nothing changed.
export function barChangesSinceDecisionOpened(state, capabilityId) {
  const decision = capData(state, capabilityId).decision;
  const proposed = decision.proposed && decision.versionsAtOpen ? decision : null;
  if (!proposed) return [];
  const out = [];
  for (const [kind, field, label] of [['criteria', 'target', (x) => x.name], ['requirements', 'text', (x) => x.text]]) {
    for (const v of versionList(state, capabilityId, kind).filter((x) => x.version > (proposed.versionsAtOpen[kind] || 0))) {
      const before = v.before || [];
      const rows = [];
      for (const a of v.value) {
        const b = before.find((x) => x.id === a.id);
        if (!b) { rows.push({ label: label(a), change: 'added', to: a[field] }); continue; }
        if (String(a[field]) === String(b[field])) continue;
        const p = thresholdParts(b[field]);
        const q = thresholdParts(a[field]);
        const dir = p && q && p.skeleton === q.skeleton ? ((p.atLeast ? q.n > p.n : q.n < p.n) ? 'stricter' : 'looser') : 'changed';
        rows.push({ label: label(b), change: dir, from: b[field], to: a[field] });
      }
      for (const b of before) if (!v.value.some((a) => a.id === b.id)) rows.push({ label: label(b), change: 'removed', from: b[field] });
      // Both objects get a new version together; skip the one where no row changed.
      if (rows.length) out.push({ kind, version: v.version, date: v.date, author: v.author, authorAt: v.authorAt, reason: v.reason, tighteningOnly: Boolean(v.tighteningOnly), proposalId: v.proposalId || null, rows });
    }
  }
  return out;
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
  requireActive(state, by, 'propose a change');
  const why = (reason || '').trim();
  if (why.length < 10) throw new Error('Say why you\'re making this change (a sentence or more).');
  const clean = cleanAmendmentValue(state, capabilityId, kind, value);
  if (kind === 'contract') {
    const blocks = contractValueChecks(state, capabilityId, clean).filter((c) => c.level === 'block');
    if (blocks.length) throw new Error(`These rules can't be submitted yet. Fix ${blocks.length} problem${blocks.length === 1 ? '' : 's'}: | ${blocks.map((b) => b.text).join(' | ')}`);
  }
  if (!needsSignoff(state, capabilityId, kind)) {
    if (kind === 'criteria') return applyCriteriaDirect(state, capabilityId, clean, by, why);
    if (kind === 'stakeholders') return amend(state, capabilityId, 'stakeholders', { value: clean, author: by, reason: why });
    if (!versionList(state, capabilityId, 'contract').length) throw new Error('Set up the rules first.');
    return amend(state, capabilityId, 'contract', { value: clean, author: by, reason: why });
  }
  if (openProposal(state, capabilityId, kind)) throw new Error('A change to this already needs approval. It has to be approved, rejected or withdrawn first.');
  // A tightening-only change skips sign-off, but only for the owner or a named
  // stakeholder and only while no expansion decision is pending. If it would
  // have qualified otherwise, the proposal records why it didn't.
  let shortcutDeclined = null;
  if (kind === 'criteria') {
    const check = tighteningOnly({ criteria: current(state, capabilityId, 'criteria'), requirements: current(state, capabilityId, 'requirements') }, clean);
    if (check.ok) {
      const allowed = tighteningShortcut(state, capabilityId, by);
      if (allowed.ok) return applyTightening(state, capabilityId, clean, by, why, check.changes);
      shortcutDeclined = allowed.reason;
    }
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
    shortcutDeclined,
  };
  const s = updateCap(state, capabilityId, { proposals: [...d.proposals, proposal] });
  const who = people(state)[by];
  return logEvent(s, {
    kind: 'proposal',
    outcome: 'opened',
    title: `${CHANGE_KIND[kind]} proposed`,
    body: `${cap.name}: ${who.name} proposed a ${CHANGE_KIND[kind].toLowerCase()} after results were in. ${requirementLabel(proposal.required)} ${who.name} can't approve it. Reason: ${why}`,
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
    title: 'Targets made stricter after results were in',
    body: `${cap.name}: ${people(state)[by].name} made these stricter: ${changes.map((c) => `${c.label} (${c.from} → ${c.to})`).join('; ')}. No approval was needed because every change only made a target stricter and nothing was added, removed or reworded. Reason: ${reason}`,
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
    if (!eligible.includes(cap.owner)) return { ok: false, reason: `Only the owner, ${people(state)[cap.owner].name}, can approve this, and they can't right now (they proposed it or aren't active). Ask another stakeholder to propose it.` };
    return { ok: true };
  }
  if (eligible.length < required.approvers) {
    return { ok: false, reason: `This change needs ${required.approvers} approvers other than ${who}, but only ${eligible.length} stakeholder${eligible.length === 1 ? '' : 's'} can approve. Add stakeholders, or ask someone else to propose it.` };
  }
  if (required.riskRequired && !eligible.some((k) => isRiskStakeholder(state, capabilityId, k))) {
    return { ok: false, reason: `This needs a Risk approval, and no stakeholder other than ${who} holds the Risk approver right. Add a stakeholder who holds it (rights are set on People), or ask someone else to propose it.` };
  }
  if (required.riskRequired && required.approvers === 2 && eligible.length === 1) {
    return { ok: false, reason: `This needs two approvers other than ${who}, but only one person can approve. Add a stakeholder, or ask someone else to propose it.` };
  }
  return { ok: true };
}

// The capacity someone approved in, with its article: "approved as a Risk
// approver". Risk means the Risk approver right, not a stakeholder's team.
export function roleLabel(role) {
  return role === 'owner' ? 'the owner' : role === 'risk' ? 'a Risk approver' : 'a stakeholder';
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
  if (!proposal || proposal.status !== 'open') return { ok: false, role: null, reason: 'This change has already been closed.' };
  if (!personKey || !people(state)[personKey]) return { ok: false, role: null, reason: 'Choose who you\'re acting as (top of the page).' };
  const name = people(state)[personKey].name;
  if (!isActivePerson(state, personKey)) return { ok: false, role: null, reason: `${name}'s account is deactivated, so they can't approve.` };
  if (personKey === proposal.proposedBy) return { ok: false, role: null, reason: `${name} proposed this change, so they can't approve it. You can't approve your own change.` };
  if (proposal.approvals.some((a) => a.by === personKey)) return { ok: false, role: null, reason: `${name} has already approved.` };
  const req = proposal.required;
  const role = roleFor(state, capabilityId, personKey);
  if (req.ownerOnly) {
    if (personKey !== cap.owner) return { ok: false, role: null, reason: `${name} can't approve this. Only the owner, ${people(state)[cap.owner].name}, can.` };
    return { ok: true, role: 'owner', reason: null };
  }
  const eligible = proposal.eligible || namedStakeholders(state, capabilityId);
  if (!eligible.includes(personKey)) return { ok: false, role: null, reason: `${name} isn't on the list of who can approve this change. That list was fixed when it was proposed.` };
  // Last slot on a High/Financial proposal must be Risk if none has signed yet.
  const remaining = req.approvers - proposal.approvals.length;
  const riskStill = req.riskRequired && !proposal.approvals.some((a) => a.role === 'risk');
  if (riskStill && remaining <= 1 && role !== 'risk') {
    return { ok: false, role: null, reason: `Risk approval still needed. The last approval must come from someone with the Risk approver right (${riskStakeholders(state, capabilityId).map((k) => people(state)[k].name).join(', ') || 'no one holds it'}), so ${name} can't give it.` };
  }
  return { ok: true, role, reason: null };
}

export function approveProposal(state, capabilityId, proposalId, { by } = {}) {
  const cap = getCapability(state, capabilityId);
  const proposal = getProposal(state, capabilityId, proposalId);
  if (!proposal) throw new Error('This change couldn\'t be found.');
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
      title: `${who.name} approved a ${CHANGE_KIND[proposal.kind].toLowerCase()} (${approvalProgress(next)})`,
      body: `${cap.name}: ${who.name} approved as ${roleLabel(e.role)}. ${left} more approval${left === 1 ? '' : 's'} needed${riskStill ? (left === 1 ? ': Risk approval still needed' : ', including Risk') : ''}.`,
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
  return logEvent(s, {
    kind: 'amendment',
    afterEvidence: true,
    objectKind: proposal.kind === 'contract' ? 'contract' : proposal.kind === 'stakeholders' ? 'stakeholders' : 'criteria',
    version: proposal.kind === 'contract' ? applied.contract : proposal.kind === 'stakeholders' ? applied.stakeholders : applied.criteria,
    proposalId,
    title: `${CHANGE_KIND[proposal.kind]} approved and in effect`,
    body: `${cap.name}: proposed by ${people(state)[proposal.proposedBy].name}, approved by ${approvals.map((a) => `${people(state)[a.by].name} (${roleLabel(a.role)})`).join(' and ')}. Reason: ${proposal.reason}`,
    capabilityId,
    link: `#/capabilities/${capabilityId}/proposals/${proposalId}`,
  });
}

// The proposer withdraws an open proposal. Recorded with a reason, like a rejection.
export function withdrawProposal(state, capabilityId, proposalId, { by, reason } = {}) {
  const cap = getCapability(state, capabilityId);
  const proposal = getProposal(state, capabilityId, proposalId);
  if (!proposal) throw new Error('This change couldn\'t be found.');
  if (proposal.status !== 'open') throw new Error('This change has already been closed.');
  if (!by || by !== proposal.proposedBy) throw new Error('Only the person who proposed this change can withdraw it. Others can reject it.');
  requireActive(state, by, 'withdraw a change');
  const why = (reason || '').trim();
  if (why.length < 10) throw new Error('Say why you\'re withdrawing it (a sentence or more).');
  const next = { ...proposal, status: 'withdrawn', withdrawal: { by, byAt: snapshotPerson(state, by), date: state.today, reason: why }, closedAt: state.today };
  const s = updateCap(state, capabilityId, { proposals: capData(state, capabilityId).proposals.map((p) => (p.id === proposalId ? next : p)) });
  return logEvent(s, {
    kind: 'proposal',
    outcome: 'withdrawn',
    title: `${CHANGE_KIND[proposal.kind]} withdrawn`,
    body: `${cap.name}: ${people(state)[by].name} withdrew their proposed change. Reason: ${why}`,
    capabilityId,
    link: `#/capabilities/${capabilityId}/proposals/${proposalId}`,
  });
}

export function rejectProposal(state, capabilityId, proposalId, { by, reason } = {}) {
  const cap = getCapability(state, capabilityId);
  const proposal = getProposal(state, capabilityId, proposalId);
  if (!proposal) throw new Error('This change couldn\'t be found.');
  if (proposal.status !== 'open') throw new Error('This change has already been closed.');
  requireActive(state, by, 'reject a change');
  if (by === proposal.proposedBy) throw new Error('You proposed this change, so you can withdraw it instead of rejecting it.');
  const why = (reason || '').trim();
  if (why.length < 10) throw new Error('Say why you\'re rejecting it (a sentence or more).');
  const frozen = proposal.eligible || namedStakeholders(state, capabilityId);
  const eligible = by === cap.owner || isRiskStakeholder(state, capabilityId, by) || (!proposal.required.ownerOnly && frozen.includes(by));
  if (!eligible) throw new Error(`${people(state)[by].name} can't reject this change. Only the people who can approve it can reject it.`);
  const next = { ...proposal, status: 'rejected', rejection: { by, byAt: snapshotPerson(state, by), date: state.today, reason: why }, closedAt: state.today };
  const s = updateCap(state, capabilityId, { proposals: capData(state, capabilityId).proposals.map((p) => (p.id === proposalId ? next : p)) });
  return logEvent(s, {
    kind: 'proposal',
    outcome: 'rejected',
    title: `${CHANGE_KIND[proposal.kind]} rejected`,
    body: `${cap.name}: ${people(state)[by].name} rejected ${people(state)[proposal.proposedBy].name}'s proposed change. Reason: ${why}`,
    capabilityId,
    link: `#/capabilities/${capabilityId}/proposals/${proposalId}`,
  });
}


export const STANCES = [['expand', 'Expand'], ['expand-limits', 'Expand with limits'], ['hold', 'Hold'], ['restrict', 'Restrict'], ['undecided', 'No position yet']];

export function cleanStakeholders(state, stakeholders) {
  if (!Array.isArray(stakeholders) || !stakeholders.length) throw new Error('Add at least one stakeholder.');
  const seen = new Set();
  return stakeholders.map((st, i) => {
    const team = (st.team || '').trim();
    const person = st.person;
    if (!team) throw new Error(`Stakeholder ${i + 1} needs a team.`);
    if (!person || !people(state)[person]) throw new Error(`Stakeholder ${i + 1}: choose a named person.`);
    if (!isActivePerson(state, person)) throw new Error(`${people(state)[person].name}'s account is deactivated, so they can't be a stakeholder.`);
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
  requireActive(state, by, 'change the stakeholders');
  const list = cleanStakeholders(state, stakeholders);
  const before = current(state, capabilityId, 'stakeholders');
  const first = !before.length;
  const why = (reason || '').trim() || (first ? 'Stakeholders named.' : 'Stakeholders updated.');
  if (needsSignoff(state, capabilityId, 'stakeholders') && stakeholderMembershipChanged(before, list)) {
    return proposeAmendment(state, capabilityId, 'stakeholders', { value: list, by, reason: (reason || '').trim() || 'Stakeholders added or removed after results were seen.' });
  }
  return amend(state, capabilityId, 'stakeholders', { value: list, author: by, reason: why });
}
