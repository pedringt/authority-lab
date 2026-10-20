// Amendments after evidence need sign-off (#7), and stakeholders (#8).

import { getCapability, capData, updateCap, logEvent } from './state.js';
import { current, versionList, versionsInForce, performanceResultsSeen, readiness, decisionRequired } from './selectors.js';
import { people, activePeople, isActivePerson, isRiskApprover, snapshotPerson, requireActive, soloHint } from './people.js';
import { amend } from './capabilities.js';
import { SECTION_KEYS, SECTION_LABELS, contractValueChecks, norm } from './contract.js';
import { requirementsNow, judgeMeasure } from './measures.js';
import { effectiveJudgment } from './lightweight.js';
import { criteriaLocked, defaultsFor, cleanCriteria, cleanRequirements, checkTargetLinks, isUnresolvedTarget, CORE_LABELS, threshold, defaultDeviations, saveCriteria, CORE_CRITERIA, CORE_REQUIREMENTS, carryMeasure, unchangedMeasuresDropped } from './evidence.js';

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

// Membership (who), team labels and roles are governed; position, stance
// and reasoning are not.
export function stakeholderMembershipChanged(before, after) {
  // A role change (Stakeholder <-> Reviewer) changes who must give input, so
  // it is governed like membership (#137).
  const key = (list) => list.map((st) => `${st.person}|${st.team}|${peopleRoleOf(st)}`).sort().join(',');
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
  // Restriction lines measured from imported evidence (#120) keep their
  // measure while the line itself is kept.
  if (value && value.ruleMeasures && typeof value.ruleMeasures === 'object') {
    const kept = Object.entries(value.ruleMeasures).filter(([line]) => v.autoRestriction.includes(line));
    if (kept.length) v.ruleMeasures = Object.fromEntries(kept);
  }
  return v;
}

// Submitted rows carry only what a person edits (name, target, note, text).
// Everything measured or recorded on the base row (current, status, met, gap,
// source) is kept, so the proposal's diff shows only the proposed change.
export function cleanAmendmentValue(state, capabilityId, kind, value) {
  if (kind === 'contract') return cleanContractValue(value);
  if (kind === 'stakeholders') return cleanStakeholders(state, value);
  const c = cleanCriteria(unchangedMeasuresDropped(value && value.criteria, current(state, capabilityId, 'criteria')));
  const r = cleanRequirements(unchangedMeasuresDropped(value && value.requirements, current(state, capabilityId, 'requirements')));
  const missingCore = [...CORE_CRITERIA.filter((id) => !c.some((x) => x.id === id)), ...CORE_REQUIREMENTS.filter((id) => !r.some((x) => x.id === id))];
  if (missingCore.length) throw new Error(`These rows are required. You can change their numbers but not remove them: ${missingCore.map((id) => CORE_LABELS[id]).join(', ')}.`);
  const baseC = current(state, capabilityId, 'criteria');
  const baseR = current(state, capabilityId, 'requirements');
  const unmeasured = ({ measure, ...rest }) => rest;
  // What the person edits on a target: its name, bar, note, and the
  // requirement it judges. A bar newly set where it said "Needs decision"
  // starts unmeasured; a bar newly cleared to "Needs decision" is unresolved.
  const edited = (x, b) => {
    const { bar, requirement, ...rest } = unmeasured(b);
    const status = isUnresolvedTarget(x) ? { bar: x.bar, status: x.status, current: x.current } : isUnresolvedTarget(b) ? { status: 'pending', current: 'Not yet measured' } : {};
    return { ...rest, name: x.name, target: x.target, note: x.note, ...status, ...(x.requirement ? { requirement: x.requirement } : {}) };
  };
  const criteria = c.map((x) => { const b = baseC.find((y) => y.id === x.id); return b ? carryMeasure({ ...edited(x, b), ...(Object.hasOwn(x, 'measure') ? { measure: x.measure } : {}) }, b, x.target, x.name) : x; });
  const requirements = r.map((x) => {
    const b = baseR.find((y) => y.id === x.id);
    if (!b) return x;
    const { kind, bar, ...bRest } = unmeasured(b);
    // A coverage rule's number set, or cleared to Needs decision (#139).
    const status = x.bar ? { bar: x.bar, current: x.current, met: false } : bar ? { current: 'Not yet measured', met: false } : {};
    const { judgment: bJudgment, consideration: bConsideration, ...bRest2 } = bRest;
    // How it is judged is part of the Requirement (#143 review): kept unless the change says otherwise.
    const judgment = x.judgment || bJudgment;
    // Hard or consideration (#151): kept unless the change says, either way.
    const raw = ((value && value.requirements) || []).find((y) => y && y.id === x.id) || {};
    const consideration = Object.hasOwn(raw, 'consideration') ? Boolean(raw.consideration) : Boolean(bConsideration);
    return carryMeasure({ ...bRest2, text: x.text, ...(x.kind ? { kind: x.kind } : {}), ...(judgment ? { judgment } : {}), ...(consideration ? { consideration: true } : {}), ...status, ...(Object.hasOwn(x, 'measure') ? { measure: x.measure } : {}) }, b, x.text, x.text);
  });
  checkTargetLinks(criteria, requirements);
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
  const base = requirementsNow(state, capabilityId);
  const reqs = proposal.value.requirements.map((r) => {
    // A proposed measure is judged against the evidence as it stands (#120).
    if (r.measure) { const j = judgeMeasure(state, capabilityId, r.measure); return { ...r, current: j.text, met: j.status === 'pass' }; }
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
    ['criteria', 'target', (x) => x.name, ['name', 'note', 'requirement', 'bar']],
    ['requirements', 'text', (x) => x.text, ['kind', 'bar', 'judgment', 'consideration']],
  ];
  for (const [kind, field, label, fixed] of kinds) {
    const before = base[kind] || [];
    const after = next[kind] || [];
    for (const b of before) if (!after.some((a) => a.id === b.id)) return { ok: false, reason: `It removes "${label(b)}".`, changes };
    for (const a of after) {
      const b = before.find((x) => x.id === a.id);
      if (!b) return { ok: false, reason: `It adds "${label(a)}", and new rows always need approval.`, changes };
      for (const f of fixed) {
        // How a Requirement is judged compares as it effectively is: saying
        // "evidence" for a row that already has a measure is no change; giving
        // a legacy row its judgment, or changing one, is (#143 review).
        const same = f === 'judgment' ? effectiveJudgment(a) === effectiveJudgment(b) : String(a[f] || '') === String(b[f] || '');
        if (!same) return { ok: false, reason: f === 'judgment' ? `It changes how "${label(b)}" is judged.` : f === 'consideration' ? `It changes whether "${label(b)}" is a hard Requirement or a consideration.` : `It changes the ${f} of "${label(b)}".`, changes };
      }
      // How a row is measured (#120) may change only in its number, which
      // must move with the wording; anything else is a different bar.
      const rest = (m) => (m ? JSON.stringify({ ...m, value: undefined }) : null);
      if (rest(a.measure) !== rest(b.measure)) return { ok: false, reason: `It changes how "${label(b)}" is measured.`, changes };
      if (a.measure && b.measure && a.measure.value !== b.measure.value && String(a[field] || '') === String(b[field] || '')) return { ok: false, reason: `It changes how "${label(b)}" is measured.`, changes };
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
      if (rows.length) out.push({ kind, version: v.version, date: v.date, author: v.author, authorAt: v.authorAt, reason: v.reason, tighteningOnly: Boolean(v.tighteningOnly), recorded: Boolean(v.recorded), proposalId: v.proposalId || null, rows });
    }
  }
  return out;
}

export function applyCriteriaDirect(state, capabilityId, value, by, reason) {
  return saveCriteria(state, capabilityId, { criteria: value.criteria, requirements: value.requirements, by, reason });
}

// ---------------------------------------------------------------------------
// What needs sign-off after results (#155, D6, R6; Paige, 2026-10-20).
// Changing the decision bar is governed; completing or strengthening it is
// recorded, with a named person and a reason, and no approval:
//   recorded: linking a Requirement or Target that had no evidence; adding a
//     Reviewer or Stakeholder; tightening a bar; consideration -> hard;
//     adding a Requirement; adding or tightening a Boundary.
//   governed: loosening a Target or bar; removing a hard Requirement; hard ->
//     consideration; changing an existing evidence mapping or source; a
//     Boundary change that permits more; removing a Reviewer; changing
//     Reviewer <-> Stakeholder.
// The recorded list is exhaustive: anything it doesn't name keeps sign-off,
// as before. One governed part makes the whole change governed.
// ---------------------------------------------------------------------------

const RESTRICTIVE = ['mustAsk', 'mustNever', 'escalation', 'autoRestriction'];
const measureRest = (m) => (m ? JSON.stringify({ ...m, value: undefined }) : null);

// Compare a row's bar wording; 'stricter', 'same' or a reason it's not.
function barMove(before, after) {
  if (String(before || '') === String(after || '')) return 'same';
  const p = thresholdParts(before);
  const q = thresholdParts(after);
  if (!p || !q) return 'no-number';
  if (p.skeleton !== q.skeleton) return 'reworded';
  if (q.n === p.n) return 'rewritten';
  return (p.atLeast ? q.n > p.n : q.n < p.n) ? 'stricter' : 'looser';
}

function classifyCriteria(base, next) {
  const out = { recorded: [], governed: [], raises: false };
  const rec = (t, raises = false) => { out.recorded.push(t); if (raises) out.raises = true; };
  const gov = (t) => out.governed.push(t);
  const evidenceMove = (b, a, label) => {
    if (!b.measure && a.measure) rec(`Links "${label}" to its evidence.`);
    else if (b.measure && !a.measure) gov(`It removes the evidence that judges "${label}".`);
    else if (b.measure && a.measure && measureRest(b.measure) !== measureRest(a.measure)) gov(`It changes the evidence that judges "${label}".`);
  };
  const bar = (b, a, field, label) => {
    const move = barMove(b[field], a[field]);
    if (move === 'stricter') rec(`Tightens "${label}": ${b[field]} → ${a[field]}.`, true);
    else if (move === 'looser') gov(`It loosens "${label}": ${b[field]} → ${a[field]}.`);
    else if (move === 'reworded') gov(`It rewords "${label}", not only its number.`);
    else if (move === 'rewritten') gov(`It rewrites "${label}" without making it stricter.`);
    else if (move === 'no-number') gov(`It changes "${label}" in a way that can't be compared as stricter: ${b[field]} → ${a[field]}.`);
    else if (b.measure && a.measure && b.measure.value !== a.measure.value) gov(`It changes how "${label}" is measured.`);
  };
  const br = base.requirements || [];
  const nr = next.requirements || [];
  for (const b of br) if (!nr.some((a) => a.id === b.id)) gov(b.consideration ? `It removes the consideration "${b.text}".` : `It removes the hard Requirement "${b.text}".`);
  for (const a of nr) {
    const b = br.find((x) => x.id === a.id);
    if (!b) { rec(`Adds the Requirement "${a.text}"${a.consideration ? ', as a consideration' : ''}.`, !a.consideration); continue; }
    if (b.consideration && !a.consideration) rec(`Makes "${b.text}" a hard Requirement.`, true);
    if (!b.consideration && a.consideration) gov(`It makes "${b.text}" a consideration instead of a hard Requirement.`);
    if (effectiveJudgment(a) !== effectiveJudgment(b)) gov(`It changes how "${b.text}" is judged.`);
    for (const f of ['kind', 'bar']) if (String(a[f] || '') !== String(b[f] || '')) gov(`It changes the ${f === 'bar' ? 'bar' : 'kind'} of "${b.text}".`);
    evidenceMove(b, a, b.text);
    bar(b, a, 'text', b.text);
  }
  const bc = base.criteria || [];
  const nc = next.criteria || [];
  for (const b of bc) if (!nc.some((a) => a.id === b.id)) gov(`It removes the Target "${b.name}".`);
  for (const a of nc) {
    const b = bc.find((x) => x.id === a.id);
    if (!b) { gov(`It adds the Target "${a.name}".`); continue; }
    for (const f of ['name', 'note', 'requirement', 'bar']) if (String(a[f] || '') !== String(b[f] || '')) gov(`It changes the ${f === 'requirement' ? 'Requirement it judges' : f} of "${b.name}".`);
    evidenceMove(b, a, b.name);
    bar(b, a, 'target', b.name);
  }
  return out;
}

function classifyStakeholders(base, next, nameOf = (k) => k) {
  const out = { recorded: [], governed: [], raises: false };
  const role = (st) => (peopleRoleOf(st) === 'reviewer' ? 'Reviewer' : 'Stakeholder');
  for (const b of base) {
    const a = next.find((x) => x.person === b.person);
    if (!a) { out.governed.push(`It removes ${role(b)} ${nameOf(b.person)}.`); continue; }
    if (role(a) !== role(b)) out.governed.push(`It changes ${nameOf(b.person)} from ${role(b)} to ${role(a)}.`);
    if (String(a.team || '') !== String(b.team || '')) out.governed.push(`It changes ${nameOf(b.person)}'s team label.`);
  }
  for (const a of next) if (!base.some((b) => b.person === a.person)) out.recorded.push(`Adds ${nameOf(a.person)} as a ${role(a)}.`);
  return out;
}

function classifyContract(base, next) {
  const out = { recorded: [], governed: [], raises: false };
  const n = (list) => (list || []).map(norm);
  for (const k of SECTION_KEYS) {
    const b = base[k] || [];
    const a = next[k] || [];
    const added = a.filter((t) => !n(b).includes(norm(t)));
    const removed = b.filter((t) => !n(a).includes(norm(t)));
    const label = SECTION_LABELS[k];
    if (RESTRICTIVE.includes(k)) {
      for (const t of added) out.recorded.push(`Adds the Boundary "${t}" under "${label}".`);
      for (const t of removed) out.governed.push(`It removes the Boundary "${t}" from "${label}", which permits more.`);
    } else {
      for (const t of removed) out.recorded.push(`No longer allows "${t}".`);
      for (const t of added) out.governed.push(`It allows "${t}", which permits more.`);
    }
  }
  const bd = base.dataSeen || [];
  const ad = next.dataSeen || [];
  for (const f of ad) if (!bd.includes(f)) out.governed.push(`It lets the AI see "${f}".`);
  for (const f of bd) if (!ad.includes(f)) out.recorded.push(`Stops the AI seeing "${f}".`);
  const bm = base.ruleMeasures || {};
  const am = next.ruleMeasures || {};
  for (const line of new Set([...Object.keys(bm), ...Object.keys(am)])) {
    if (JSON.stringify(bm[line] || null) === JSON.stringify(am[line] || null)) continue;
    const newLine = !(base.autoRestriction || []).includes(line) && (next.autoRestriction || []).includes(line);
    if (newLine && !bm[line]) continue;
    out.governed.push(`It changes how "${line}" is measured.`);
  }
  for (const k of Object.keys(next)) if (![...SECTION_KEYS, 'dataSeen', 'ruleMeasures'].includes(k) && JSON.stringify(next[k]) !== JSON.stringify(base[k])) out.governed.push(`It changes ${k}.`);
  return out;
}

// What a change after results is: what it records, what needs sign-off, and
// whether it raises the decision bar.
export function classifyChange(state, capabilityId, kind, value) {
  if (kind === 'criteria') return classifyCriteria({ criteria: current(state, capabilityId, 'criteria'), requirements: current(state, capabilityId, 'requirements') }, value);
  if (kind === 'stakeholders') return classifyStakeholders(current(state, capabilityId, 'stakeholders'), value, (k) => (people(state)[k] || { name: k }).name);
  if (kind === 'contract') return classifyContract(current(state, capabilityId, 'contract'), value);
  throw new Error(`Unknown amendment kind: ${kind}`);
}

// Who may make a recorded change: the owner or someone named on the
// capability. While an expansion decision is open, a change that raises the
// bar still needs approval, because it could block that decision (Paige,
// 2026-10-09); linking evidence, adding people and adding Boundaries don't.
export function recordedChange(state, capabilityId, by, c) {
  if (!namedStakeholders(state, capabilityId).includes(by)) {
    const who = (people(state)[by] || { name: by }).name;
    return { ok: false, reason: `Only the owner or someone named on it can make this change without approval. ${who} isn't either, so it needs approval.` };
  }
  if (c.raises && decisionRequired(state, capabilityId)) return { ok: false, reason: 'A decision about more authority is open, so a change that raises the bar needs approval until it is made.' };
  return { ok: true, reason: null };
}

const RECORDED_TITLE = { criteria: 'Requirements or Targets changed after results, recorded', stakeholders: 'People added after results, recorded', contract: 'Boundaries tightened, recorded' };
function applyRecorded(state, capabilityId, kind, value, by, reason, changes) {
  const cap = getCapability(state, capabilityId);
  const meta = { recorded: true, changes };
  let s;
  if (kind === 'criteria') {
    const requirements = proposalReadiness(state, capabilityId, { kind: 'criteria', value }).proposed.requirements;
    // A capability with no Targets keeps saying so, or the bar would unlock.
    s = amend(state, capabilityId, 'criteria', { value: value.criteria, author: by, reason, meta: { ...meta, ...(value.criteria.length ? {} : { noTargets: true }) }, silent: true });
    s = amend(s, capabilityId, 'requirements', { value: requirements, author: by, reason, meta, silent: true });
  } else {
    s = amend(state, capabilityId, kind, { value, author: by, reason, meta, silent: true });
  }
  const v = versionsInForce(s, capabilityId);
  return logEvent(s, {
    kind: 'amendment',
    afterEvidence: true,
    objectKind: kind,
    version: v[kind],
    recorded: true,
    title: RECORDED_TITLE[kind],
    body: `${cap.name}: ${people(state)[by].name} recorded this without approval, because it only completes or strengthens the bar: ${changes.join(' ')} Reason: ${reason}`,
    capabilityId,
    link: `#/capabilities/${capabilityId}/versions?kind=${kind}&version=${v[kind]}`,
  });
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
  // R6 (#155): a change that only completes or strengthens the bar is
  // recorded, not approved, when the owner or someone named makes it. If it
  // would have qualified otherwise, the proposal records why it didn't.
  const c = classifyChange(state, capabilityId, kind, clean);
  let shortcutDeclined = null;
  if (c.recorded.length && !c.governed.length) {
    const allowed = recordedChange(state, capabilityId, by, c);
    if (allowed.ok) return applyRecorded(state, capabilityId, kind, clean, by, why, c.recorded);
    shortcutDeclined = allowed.reason;
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
    // Why it needs sign-off (#155), in the person's words.
    needsSignoffBecause: c.governed,
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

// Can the eligible approvers ever satisfy the rule? Checked when a proposal
// opens, so nothing is recorded that can never complete.
export function signoffFeasibility(state, capabilityId, required, eligible, proposedBy) {
  const cap = getCapability(state, capabilityId);
  const who = people(state)[proposedBy] ? people(state)[proposedBy].name : 'you';
  if (required.ownerOnly) {
    if (!eligible.includes(cap.owner)) return { ok: false, reason: `Only the owner, ${people(state)[cap.owner].name}, can approve this, and they can't right now (they proposed it or aren't active). Ask another stakeholder to propose it${soloHint(state)}` };
    return { ok: true };
  }
  if (eligible.length < required.approvers) {
    return { ok: false, reason: `This change needs ${required.approvers} approvers other than ${who}, but only ${eligible.length} stakeholder${eligible.length === 1 ? '' : 's'} can approve. Add stakeholders, or ask someone else to propose it${soloHint(state)}` };
  }
  if (required.riskRequired && !eligible.some((k) => isRiskStakeholder(state, capabilityId, k))) {
    return { ok: false, reason: `This needs a Risk approval, and no stakeholder other than ${who} holds the Risk approver right. Add a stakeholder who holds it (rights are set on People), or ask someone else to propose it${soloHint(state)}` };
  }
  if (required.riskRequired && required.approvers === 2 && eligible.length === 1) {
    return { ok: false, reason: `This needs two approvers other than ${who}, but only one person can approve. Add a stakeholder, or ask someone else to propose it${soloHint(state)}` };
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
    s = amend(s, capabilityId, 'criteria', { value: criteria, author: proposal.proposedBy, reason: proposal.reason, meta: { ...meta, deviations: deviations('criteria', criteria, (x) => x.target), ...(criteria.length ? {} : { noTargets: true }) }, silent: true });
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
    body: `${cap.name}: ${people(state)[by].name} withdrew their change request. Reason: ${why}`,
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
    body: `${cap.name}: ${people(state)[by].name} rejected ${people(state)[proposal.proposedBy].name}'s change request. Reason: ${why}`,
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
    // Reviewer (input required) or Stakeholder (involved, consulted) (#137).
    // An entry without a role is a Stakeholder (Paige, 2026-10-14: existing
    // entries stay Stakeholders; Reviewers start empty).
    if (st.role !== undefined && !Object.hasOwn(PEOPLE_ROLES, st.role)) throw new Error(`Stakeholder ${i + 1}: the role must be Reviewer or Stakeholder.`);
    return { team, person, stance, position, quote: (st.quote || '').trim(), date: st.date || state.today, ...(st.role === 'reviewer' ? { role: 'reviewer' } : {}) };
  });
}

// The two named roles on a capability, besides its one Owner (#137).
export const PEOPLE_ROLES = { reviewer: 'Reviewer', stakeholder: 'Stakeholder' };
export const peopleRoleOf = (entry) => (entry && entry.role === 'reviewer' ? 'reviewer' : 'stakeholder');

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
