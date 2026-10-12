// The Overview's four lists (simplification pass, 2026-10-12): to do,
// approvals needed, important results, and current authority. Pure; every
// item names its capability and, where there is one, the person it waits on.
//
// Each list only reads what the rest of the store already decides. Nothing
// here changes what the gate allows or who may approve.

import { getCapability, capData } from './state.js';
import { decisionRequired, proposedAuthority, readiness, levelName } from './selectors.js';
import { people, isRiskApprover, openRosterProposal } from './people.js';
import { coverageWarnings } from './coverage.js';
import { waitingActions, queueApprovers, describe } from './queue.js';
import { namedStakeholders } from './proposals.js';
import { reviewNeeded } from './monitoring.js';
import { expectedVsActual } from './value.js';

// What each level lets the AI do, in a sentence a product person can read.
export const LEVEL_PLAIN = [
  'Watches only. A person does all the work.',
  'Suggests. A person decides and acts.',
  'Drafts. A person approves every action.',
  'Acts on its own within limits. Everything else goes to a person.',
  'Handles most cases on its own. A person handles the exceptions.',
];

const nameOf = (state, key) => (people(state)[key] || {}).name || key;
const list = (names) => (names.length <= 2 ? names.join(' or ') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`);
const firstSentence = (text) => { const m = String(text || '').match(/^.*?[.!?](\s|$)/); return (m ? m[0] : String(text || '')).trim(); };

// The last decision that moved a capability down, made by a person.
function personRestriction(state, capabilityId) {
  const recs = state.decisionRecords.filter((r) => r.capabilityId === capabilityId);
  const last = recs[recs.length - 1];
  return last && last.authorizedBy !== 'system' && last.previous && last.next.level < last.previous.level ? last : null;
}

// The automatic restriction a review is waiting on, if any.
function automaticRestriction(state, capabilityId) {
  const m = capData(state, capabilityId).monitoring;
  return m && m.breached && m.breachRecordId ? state.decisionRecords.find((r) => r.id === m.breachRecordId) || null : null;
}

export function readinessText(r) {
  if (!r.total) return 'No decision requirements set yet.';
  if (r.met === r.total) return `All ${r.total} checks met.`;
  return `${r.met} of ${r.total} checks met.`;
}

// Concrete next actions, most urgent first.
export function overviewTodos(state, { fmt = (d) => d } = {}) {
  const out = [];
  for (const cap of state.capabilities) {
    const owner = nameOf(state, cap.owner);
    const link = (q = '') => `#/capabilities/${cap.id}${q}`;
    const review = reviewNeeded(state, cap.id);
    const auto = automaticRestriction(state, cap.id);
    if (review.restriction && auto) {
      out.push({ kind: 'review', urgent: true, capabilityId: cap.id, cap: cap.name,
        title: `Review why ${cap.name} was moved back to ${levelName(auto.next.level)}`,
        why: `On ${fmt(auto.date)} it crossed a safety limit (${capData(state, cap.id).monitoring.reading}) and went back to ${levelName(auto.next.level)} automatically. It can't get more authority until someone records what happened and what changes.`,
        who: `Owner: ${owner}`, action: 'Record the review', href: link('?tab=monitoring') });
    } else if (review.incidents.length) {
      out.push({ kind: 'review', urgent: true, capabilityId: cap.id, cap: cap.name,
        title: `Review ${review.incidents.length === 1 ? 'an incident' : `${review.incidents.length} incidents`} on ${cap.name}`,
        why: 'A safety limit was crossed but authority didn\'t change. Record what happened before the capability can get more authority.',
        who: `Owner: ${owner}`, action: 'Record the review', href: link('?tab=monitoring') });
    }
    if (decisionRequired(state, cap.id)) {
      const p = proposedAuthority(state, cap.id);
      const r = readiness(state, cap.id);
      const gap = r.unmet[0];
      out.push({ kind: 'decision', lead: true, capabilityId: cap.id, cap: cap.name,
        title: `Decide whether ${cap.name} can move to Level ${p.level}, ${levelName(p.level)}${p.limited ? ', with limits' : ''}`,
        why: `${r.met === r.total ? 'Ready for a decision' : r.total - r.met === 1 ? 'Almost ready for a decision' : 'Not ready yet'}: ${readinessText(r).toLowerCase()}${gap ? ` Still open: ${firstSentence(gap.gap || gap.text)}` : ''}`,
        who: `Owner: ${owner}`, action: 'Open the decision', href: link('/decision') });
    }
    const held = personRestriction(state, cap.id);
    if (held && held.openCondition && cap.status === 'restricted') {
      out.push({ kind: 'condition', capabilityId: cap.id, cap: cap.name,
        title: `Meet the condition to move ${cap.name} back to ${levelName(held.previous.level)}`,
        why: held.openCondition,
        who: `Owner: ${owner}`, action: 'Open the capability', href: link() });
    } else if (cap.status !== 'not-delegated' && !review.any) {
      const r = readiness(state, cap.id);
      const gap = r.unmet[0];
      if (gap && cap.authority.level < 4) {
        out.push({ kind: 'evidence', capabilityId: cap.id, cap: cap.name,
          title: `Meet the open check: ${gap.text.replace(/^./, (c) => c.toLowerCase())}`,
          why: `${firstSentence(gap.gap || gap.text)} Now: ${gap.current}. ${readinessText(r)}`,
          who: `Owner: ${owner}`, action: 'See the evidence', href: link('?tab=evidence') });
      }
    }
  }
  for (const w of coverageWarnings(state)) {
    const cap = getCapability(state, w.capabilityId);
    if (w.kind === 'coverage') {
      out.push({ kind: 'coverage', capabilityId: cap.id, cap: cap.name,
        title: `Add a second Risk approver to ${cap.name}`,
        why: 'Bigger changes here need two approvers, one of them from Risk. There aren\'t enough people with the Risk approver right on this capability to cover that.',
        who: `Owner: ${nameOf(state, cap.owner)}`, action: 'Manage stakeholders', href: `#/capabilities/${cap.id}/stakeholders/edit` });
    } else {
      const p = capData(state, cap.id).proposals.find((x) => x.id === w.proposalId);
      out.push({ kind: 'stuck', capabilityId: cap.id, cap: cap.name,
        title: `This change to ${cap.name} can no longer be approved`,
        why: 'The people who could approve it have changed since it was proposed. Withdraw it and propose it again.',
        who: p ? `Proposed by ${nameOf(state, p.proposedBy)}` : '', action: 'Open the change', href: w.link });
    }
  }
  const rank = { review: 0, decision: 1, stuck: 2, condition: 3, coverage: 4, evidence: 5 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

const CHANGE_KIND = { contract: 'Rule change', criteria: 'Target change', stakeholders: 'Stakeholder change' };

// Who a proposed change still needs, in words.
export function stillNeeded(state, capabilityId, p) {
  const cap = getCapability(state, capabilityId);
  const req = p.required;
  const done = p.approvals.map((a) => a.by);
  if (req.ownerOnly) return `Waiting on the owner, ${nameOf(state, cap.owner)}.`;
  const eligible = (p.eligible || namedStakeholders(state, capabilityId)).filter((k) => k !== p.proposedBy && !done.includes(k));
  const riskStill = req.riskRequired && !p.approvals.some((a) => a.role === 'risk');
  if (riskStill) {
    const risk = eligible.filter((k) => isRiskApprover(state, k)).map((k) => nameOf(state, k));
    return `Risk approval still needed${risk.length ? `: ${list(risk)}` : ''}.`;
  }
  return `Who can approve: ${list(eligible.map((k) => nameOf(state, k)))}.`;
}

// Anything waiting on a named person to say yes or no.
export function overviewApprovals(state, { fmt = (d) => d } = {}) {
  const out = [];
  for (const cap of state.capabilities) {
    const waiting = waitingActions(state, cap.id);
    if (waiting.length) {
      const refunds = waiting.every((x) => x.call.tool === 'issue_refund');
      const noun = refunds ? (waiting.length === 1 ? 'refund needs' : 'refunds need') : (waiting.length === 1 ? 'action needs' : 'actions need');
      const oldest = waiting.map((x) => x.date).sort()[0];
      out.push({ kind: 'actions', capabilityId: cap.id, cap: cap.name,
        title: `${waiting.length} ${noun} a person to decide`,
        why: `${waiting.slice(0, 3).map((x) => describe(x).replace(/^a /, '')).join(', ')}${waiting.length > 3 ? ` and ${waiting.length - 3} more` : ''}. ${cap.authority.level <= 2 ? `The AI is at ${levelName(cap.authority.level)}, so every action needs a person.` : 'They fell outside the AI\'s approved limits, so they weren\'t processed automatically.'}`,
        who: `Who can approve: ${list(queueApprovers(state, cap.id).map((k) => nameOf(state, k)))}.`,
        since: `Waiting since ${fmt(oldest)}`, action: refunds ? 'Review the refunds' : 'Review the actions', href: `#/capabilities/${cap.id}?tab=decision&show=approvals` });
    }
    for (const p of capData(state, cap.id).proposals.filter((x) => x.status === 'open')) {
      out.push({ kind: 'change', capabilityId: cap.id, cap: cap.name,
        title: `${CHANGE_KIND[p.kind] || 'Proposed change'}: ${cap.name}`,
        why: `${nameOf(state, p.proposedBy)} proposed a change. ${p.reason}`,
        progress: [p.approvals.length, p.required.approvers],
        who: stillNeeded(state, cap.id, p),
        since: p.date ? `Proposed ${fmt(p.date)}` : '', action: 'Review the change', href: `#/capabilities/${cap.id}/proposals/${p.id}` });
    }
  }
  const rp = openRosterProposal(state);
  if (rp) {
    const target = nameOf(state, rp.person);
    out.push({ kind: 'people', capabilityId: null, cap: 'People',
      title: rp.kind === 'deactivate' ? `Deactivate ${target}` : `${rp.grant ? 'Give' : 'Remove'} ${target} ${rp.grant ? 'the' : 'from the'} ${rp.right === 'riskApprover' ? 'Risk approver' : 'workspace admin'} right`,
      why: `${nameOf(state, rp.proposedBy)} proposed this. ${rp.reason || ''}`.trim(),
      who: `Who can approve: ${list(rp.eligible.map((k) => nameOf(state, k)))}.`,
      since: '', action: 'Review the change', href: `#/people?proposal=${rp.id}` });
  }
  return out;
}

// Results that block, cause or call into question an authority level. Never
// a metrics feed: adoption warnings, ROI and gate counts stay in Monitoring.
export function importantResults(state, { fmt = (d) => d } = {}) {
  const out = [];
  for (const cap of state.capabilities) {
    const d = capData(state, cap.id);
    const auto = automaticRestriction(state, cap.id);
    if (auto && d.reviewRequired) {
      out.push({ tone: 'restricted', label: 'Moved back automatically', capabilityId: cap.id, cap: cap.name,
        text: `${cap.name} crossed a safety limit: ${d.monitoring.reading}.`,
        so: `It was moved back to ${levelName(auto.next.level)} on ${fmt(auto.date)}. A review comes before any more authority.` });
    }
    const held = personRestriction(state, cap.id);
    if (held && cap.status === 'restricted') {
      out.push({ tone: 'restricted', label: 'Moved back', capabilityId: cap.id, cap: cap.name,
        text: `Moved back to ${levelName(held.next.level)} on ${fmt(held.date)} by ${nameOf(state, held.authorizedBy)}.`,
        so: held.openCondition || firstSentence(held.rationale) });
    }
    for (const s of (d.pilot && d.pilot.segments) || []) {
      if (s.status !== 'insufficient') continue;
      out.push({ tone: 'insufficient', label: 'Not enough data yet', capabilityId: cap.id, cap: cap.name,
        text: `${s.name}: ${s.accuracy}% accurate, on only ${s.cases} cases.`,
        so: 'These cases stay with a person. Any move to more authority would leave them out.' });
    }
    for (const e of d.evidence.filter((x) => x.source === 'Incident' && x.status === 'fail' && x.risk === 'High')) {
      const sentences = (String(e.detail || '').replace(/^Scenario [A-Z]-\d+:\s*/, '').match(/[^.!?]+[.!?]+/g) || [e.detail || '']).map((x) => x.trim());
      out.push({ tone: 'fail', label: 'Severe failure', capabilityId: cap.id, cap: cap.name,
        text: e.metric.replace(/^[A-Z]+-\d+:\s*/, '').replace(/^./, (c) => c.toUpperCase()) + '.',
        so: sentences.slice(0, 2).join(' ').replace(/^./, (c) => c.toUpperCase()) });
    }
    for (const r of expectedVsActual(state, cap.id).rows.filter((x) => x.status === 'not-met')) {
      out.push({ tone: 'fail', label: 'Expected outcome missed', capabilityId: cap.id, cap: cap.name,
        text: `${r.metric}: ${r.actualText}. The decision expected ${r.target}.`,
        so: 'That calls the case for the current authority into question.' });
    }
  }
  return out;
}

// One row per capability: the authority now, in plain words, and what's next.
export function authorityRows(state) {
  return state.capabilities.map((cap) => {
    const r = readiness(state, cap.id);
    const review = reviewNeeded(state, cap.id);
    const held = personRestriction(state, cap.id);
    let next;
    if (review.restriction) next = { tone: 'restricted', text: 'Review needed before it can get more authority' };
    else if (decisionRequired(state, cap.id)) { const p = proposedAuthority(state, cap.id); next = { tone: 'decision', text: 'Ready for a decision', detail: `Proposed: Level ${p.level}, ${levelName(p.level)}${p.limited ? ', with limits' : ''}` }; }
    else if (cap.status === 'not-delegated') next = { tone: 'neutral', text: 'Not delegated, by design' };
    else if (held && cap.status === 'restricted') next = { tone: 'restricted', text: 'Held until a condition is met' };
    else if (r.total && r.met < r.total) next = { tone: 'insufficient', text: `Not yet: ${r.met} of ${r.total} checks met` };
    else next = { tone: 'neutral', text: 'No change planned' };
    return { capabilityId: cap.id, cap: cap.name, authority: cap.authority, plain: LEVEL_PLAIN[cap.authority.level], movedBack: Boolean(review.restriction), next };
  });
}

