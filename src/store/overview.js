// The Overview's four lists (simplification pass, 2026-10-12; redesign the
// same day): to do, approvals needed, important results, and current
// autonomy. Pure; every item names its capability and, where there is one,
// the person it waits on.
//
// Each list only reads what the rest of the store already decides. Nothing
// here changes what the gate allows or who may approve.

import { getCapability, capData } from './state.js';
import { decisionRequired, proposedAuthority, readiness, levelName } from './selectors.js';
import { people, isRiskApprover, openRosterProposal, rosterApprovalEligibility, actor } from './people.js';
import { coverageWarnings } from './coverage.js';
import { waitingActions, queueApprovers, describe } from './queue.js';
import { namedStakeholders, approvalEligibility } from './proposals.js';
import { reviewNeeded } from './monitoring.js';
import { expectedVsActual } from './value.js';
import { setupState } from './setup.js';

// What each level lets the AI do, in a sentence a product person can read.
export const LEVEL_PLAIN = [
  'Watches only. A person does all the work.',
  'Suggests. A person decides and acts.',
  'Prepares the action. A person approves every one.',
  'Runs automatically within limits. Everything else goes to human review.',
  'Handles most cases automatically. A person handles the exceptions.',
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

// A requirement as concrete work, parsed from its text and current value:
// "Minimum 40 high-value refund cases" at 18 is "Collect 22 more high-value
// refund cases"; "Overall accuracy ≥ 90%" at 88% is "Raise accuracy to 90%".
// Anything it can't read falls back to "Meet: <requirement>".
const num = (v) => { const m = String(v ?? '').replace(/,/g, '').match(/^\s*(-?\d+(?:\.\d+)?)\s*%?\s*$/); return m ? Number(m[1]) : null; };
const metricWord = (text) => text.replace(/^overall\s+/i, '').replace(/^./, (c) => c.toLowerCase());
export function requirementWork(req) {
  const text = String(req.text || '').trim();
  // A number nobody has set yet (#139) is a decision to make, not a gap to close.
  if (req.bar === 'needs-decision' || req.unresolved) return { title: `Decide the bar: ${text.replace(/:\s*needs decision\.?$/i, '').replace(/^./, (c) => c.toLowerCase())}`, status: 'No number set yet: it needs a decision', short: 'A bar needs a decision' };
  const now = num(req.current);
  let m = text.match(/^(?:minimum|at least)\s+(\d[\d,]*)\s+(.+)$/i);
  if (m && now != null) {
    const target = Number(m[1].replace(/,/g, ''));
    if (target > now) return { title: `Collect ${target - now} more ${m[2]}`, status: `${now} of ${target} collected`, short: `${now} of ${target} ${m[2]}` };
  }
  m = text.match(/^(.+?)\s*(≥|>=|≤|<=)\s*(\d+(?:\.\d+)?)\s*(%?)$/);
  if (m && now != null) {
    const target = `${m[3]}${m[4]}`;
    const up = m[2] === '≥' || m[2] === '>=';
    return { title: `${up ? 'Raise' : 'Bring'} ${metricWord(m[1])} ${up ? 'to' : 'down to'} ${target}`, status: `Currently ${req.current}`, short: `${metricWord(m[1])} ${req.current}, needs ${target}` };
  }
  return { title: `Meet: ${text.replace(/^./, (c) => c.toLowerCase())}`, status: req.current != null && req.current !== '' ? `Now: ${req.current}` : '', short: null };
}

// "Return to Draft requires a redesigned check." → "A redesigned check."
const conditionText = (text) => String(text || '').replace(/^(?:a\s+)?return(?:ing)?\s+to\s+[\w ]+?\s+requires\s+/i, '').replace(/^./, (c) => c.toUpperCase());
const shortGap = (gap) => firstSentence(gap.gap || '').replace(/[.!?]$/, '').replace(/^./, (c) => c.toLowerCase()) || requirementWork(gap).short || gap.text;
const expandWords = (p) => (p.level >= 4 ? 'broadly' : p.level === 3 ? 'within limits' : `to ${levelName(p.level)}`);

// Concrete next actions, most urgent first. Each item is one work row: the
// capability, one title saying the work, one supporting line, the owner and
// whether it's for the person in "Demo as" (mine). Only the first item, when
// it is a review or an open decision, is emphasized.
export function overviewTodos(state, { fmt = (d) => d } = {}) {
  const me = actor(state);
  const out = [];
  for (const cap of state.capabilities) {
    const row = (item) => out.push({ capabilityId: cap.id, cap: cap.name, owner: cap.owner, ownerName: nameOf(state, cap.owner), mine: cap.owner === me, ...item });
    const link = (q = '') => `#/capabilities/${cap.id}${q}`;
    // A draft (#139): the one thing to do is finish and confirm the setup.
    if (setupState(state, cap.id) === 'draft') {
      row({ kind: 'setup', title: `Finish setting up ${cap.name}`, sub: 'The setup is a draft. Nothing is granted until the owner confirms it.', action: 'Open setup', href: link('/setup') });
      continue;
    }
    const review = reviewNeeded(state, cap.id);
    const auto = automaticRestriction(state, cap.id);
    if (review.restriction && auto) {
      row({ kind: 'review', urgent: true,
        title: `Review why ${cap.name} was moved back to ${levelName(auto.next.level)}`,
        sub: `Crossed a safety limit on ${fmt(auto.date)}: ${capData(state, cap.id).monitoring.reading}`,
        action: 'Record the review', href: link('?tab=monitor') });
    } else if (review.incidents.length) {
      row({ kind: 'review', urgent: true,
        title: `Review ${review.incidents.length === 1 ? 'an incident' : `${review.incidents.length} incidents`}`,
        sub: 'A safety limit was crossed; autonomy didn\'t change. A review comes before any expansion.',
        action: 'Record the review', href: link('?tab=monitor') });
    }
    if (decisionRequired(state, cap.id)) {
      const r = readiness(state, cap.id);
      row({ kind: 'decision',
        title: `Decide whether to expand autonomy ${expandWords(proposedAuthority(state, cap.id))}`,
        sub: [readinessText(r).replace(/\.$/, ''), r.unmet[0] ? shortGap(r.unmet[0]) : ''].filter(Boolean).join(' · '),
        action: 'Review', href: link('?tab=decide') });
    }
    const held = personRestriction(state, cap.id);
    if (held && held.openCondition && cap.status === 'restricted') {
      row({ kind: 'condition',
        title: `Complete the requirements to return to ${levelName(held.previous.level)}`,
        sub: conditionText(held.openCondition),
        action: 'Open', href: link('?tab=status') });
    } else if (cap.status !== 'not-delegated' && !review.any) {
      const r = readiness(state, cap.id);
      const gap = r.unmet[0];
      if (gap && cap.authority.level < 4) {
        const w = requirementWork(gap);
        row({ kind: 'evidence', title: w.title,
          sub: [w.status, readinessText(r).replace(/\.$/, '')].filter(Boolean).join(' · '),
          action: 'Open', href: link('?tab=status') });
      }
    }
  }
  for (const w of coverageWarnings(state)) {
    const cap = getCapability(state, w.capabilityId);
    const base = { capabilityId: cap.id, cap: cap.name, owner: cap.owner, ownerName: nameOf(state, cap.owner), mine: cap.owner === me };
    if (w.kind === 'coverage') {
      out.push({ ...base, kind: 'coverage',
        title: 'Add a second Risk approver',
        sub: 'Bigger changes here need two approvers, one from Risk, and too few stakeholders hold the Risk approver right.',
        action: 'Manage stakeholders', href: `#/capabilities/${cap.id}/stakeholders/edit` });
    } else {
      const p = capData(state, cap.id).proposals.find((x) => x.id === w.proposalId);
      out.push({ ...base, kind: 'stuck', ...(p ? { owner: p.proposedBy, ownerName: nameOf(state, p.proposedBy), mine: p.proposedBy === me, ownerRole: 'Proposed by' } : {}),
        title: 'Withdraw and re-propose a change that can no longer be approved',
        sub: 'The people who could approve it have changed since it was proposed.',
        action: 'Open', href: w.link });
    }
  }
  // Evidence work on a capability with an open decision sits next to it.
  const rank = { review: 0, decision: 1, stuck: 2, evidence: 3, condition: 4, coverage: 5 };
  const deciding = new Set(out.filter((t) => t.kind === 'decision').map((t) => t.capabilityId));
  const sorted = out.map((t, i) => [t, i]).sort(([a, i], [b, j]) => rank[a.kind] - rank[b.kind] || (deciding.has(b.capabilityId) - deciding.has(a.capabilityId)) || i - j).map(([t]) => t);
  return sorted.map((t, i) => ({ ...t, emphasis: i === 0 && (t.kind === 'review' || t.kind === 'decision') }));
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

// What a waiting action is, briefly: "$180 on ORD-5005, over $100" (the
// first rule that asks for a person, beyond the level itself).
function waitingText(x) {
  const a = x.call.args || {};
  const what = x.call.tool === 'issue_refund' ? `$${a.amount} on ${a.orderId}` : describe(x);
  const ask = (x.findings || []).find((f) => f.rule && f.rule.kind === 'must-ask');
  const why = ask ? ask.rule.text.replace(/[.!?]$/, '').replace(/^(?:refunds?|actions?)\s+/i, '').replace(/^./, (c) => c.toLowerCase()) : '';
  return why ? `${what}, ${why}` : what;
}

// Anything waiting on a named person to say yes or no. Each item is one work
// row, like a to-do: the capability, a title, one supporting line, then who
// it waits on (mine: the person in "Demo as" can approve it).
export function overviewApprovals(state, { fmt = (d) => d } = {}) {
  const me = actor(state);
  const out = [];
  for (const cap of state.capabilities) {
    const waiting = waitingActions(state, cap.id);
    if (waiting.length) {
      const refunds = waiting.every((x) => x.call.tool === 'issue_refund');
      const noun = refunds ? (waiting.length === 1 ? 'refund needs' : 'refunds need') : (waiting.length === 1 ? 'action needs' : 'actions need');
      const oldest = waiting.map((x) => x.date).sort()[0];
      const approvers = queueApprovers(state, cap.id);
      const others = approvers.filter((k) => k !== cap.owner);
      out.push({ kind: 'actions', capabilityId: cap.id, cap: cap.name,
        title: `${waiting.length} ${noun} human review`,
        sub: `${waiting.slice(0, 3).map(waitingText).join(' · ')}${waiting.length > 3 ? ` · and ${waiting.length - 3} more` : ''}`,
        meta: [`Waiting since ${fmt(oldest)}`, others.length ? 'the owner or any stakeholder can approve' : `only the owner, ${nameOf(state, cap.owner)}, can approve`],
        mine: approvers.includes(me),
        action: 'Review', href: `#/capabilities/${cap.id}?tab=status&show=approvals` });
    }
    for (const p of capData(state, cap.id).proposals.filter((x) => x.status === 'open')) {
      out.push({ kind: 'change', capabilityId: cap.id, cap: cap.name,
        title: `Review a proposed ${(CHANGE_KIND[p.kind] || 'change').toLowerCase()}`,
        sub: `${nameOf(state, p.proposedBy)} proposed it${p.date ? ` on ${fmt(p.date)}` : ''}: ${firstSentence(p.reason)}`,
        meta: [`${p.approvals.length} of ${p.required.approvers} approval${p.required.approvers === 1 ? '' : 's'}`, stillNeeded(state, cap.id, p).replace(/\.$/, '')],
        mine: approvalEligibility(state, cap.id, p, me).ok,
        action: 'Review', href: `#/capabilities/${cap.id}/proposals/${p.id}` });
    }
  }
  const rp = openRosterProposal(state);
  if (rp) {
    const target = nameOf(state, rp.person);
    out.push({ kind: 'people', capabilityId: null, cap: 'People',
      title: rp.kind === 'deactivate' ? `Deactivate ${target}` : `${rp.grant ? 'Give' : 'Remove'} ${target} ${rp.grant ? 'the' : 'from the'} ${rp.right === 'riskApprover' ? 'Risk approver' : 'workspace admin'} right`,
      sub: `${nameOf(state, rp.proposedBy)} proposed it${rp.reason ? `: ${firstSentence(rp.reason)}` : '.'}`,
      meta: [`Who can approve: ${list(rp.eligible.map((k) => nameOf(state, k)))}`],
      mine: rosterApprovalEligibility(state, rp, me).ok,
      action: 'Review', href: `#/people?proposal=${rp.id}` });
  }
  return out;
}

// Results that block, cause or call into question an authority level. Never
// a metrics feed: adoption warnings, ROI and gate counts stay in Monitoring.
// Each is a short kind label, what happened, and one line of what it means.
export function importantResults(state, { fmt = (d) => d } = {}) {
  const out = [];
  for (const cap of state.capabilities) {
    const d = capData(state, cap.id);
    const auto = automaticRestriction(state, cap.id);
    const add = (r) => out.push({ capabilityId: cap.id, cap: cap.name, ...r });
    if (auto && d.reviewRequired) {
      add({ tone: 'restricted', label: 'Moved back automatically',
        text: `Crossed a safety limit: ${d.monitoring.reading}.`,
        so: `Returned to ${levelName(auto.next.level)} on ${fmt(auto.date)}. A review comes before any expansion.` });
    }
    const held = personRestriction(state, cap.id);
    if (held && cap.status === 'restricted') {
      add({ tone: 'restricted', label: 'Moved back',
        text: `Returned to ${levelName(held.next.level)} on ${fmt(held.date)} by ${nameOf(state, held.authorizedBy)}.`,
        so: firstSentence(held.rationale) || held.openCondition });
    }
    for (const s of (d.pilot && d.pilot.segments) || []) {
      if (s.status !== 'insufficient') continue;
      add({ tone: 'insufficient', label: 'Under-tested',
        text: `${s.name}: ${s.accuracy}% accurate on only ${s.cases} cases.`,
        so: 'These cases stay under human review; any expansion would leave them out.' });
    }
    // A safety limit that moved the capability back is already the result
    // above; one that opened an incident without moving it is its own result.
    for (const e of d.evidence.filter((x) => x.source === 'Incident' && x.status === 'fail' && x.risk === 'High' && !(x.safetyLimit && auto && d.reviewRequired))) {
      const sentences = (String(e.detail || '').replace(/^Scenario [A-Z]-\d+:\s*/, '').match(/[^.!?]+[.!?]+/g) || []).map((x) => x.trim());
      const metric = e.metric.replace(/^[A-Z]+-\d+:\s*/, '').replace(/^./, (c) => c.toUpperCase()) + '.';
      const what = (sentences[0] || '').replace(/^./, (c) => c.toUpperCase());
      // Already the cause given under "Moved back": shown once.
      if (what && out.some((r) => r.capabilityId === cap.id && r.so === what)) continue;
      add({ tone: 'fail', label: e.safetyLimit ? 'Safety limit crossed' : 'Severe miss',
        text: what || metric,
        so: sentences[0] ? sentences[1] || metric : '' });
    }
    // Only a goal judged on enough production evidence counts as missed.
    for (const r of expectedVsActual(state, cap.id).rows.filter((x) => x.status === 'not-met' && x.judged)) {
      add({ tone: 'fail', label: 'Expected outcome missed',
        text: `${r.metric}: ${r.actualText}. The decision expected ${r.target}.`,
        so: 'That calls the case for the current autonomy into question.' });
    }
  }
  return out;
}

// What a capability handles now, in plain words: behaviour first, the level
// name is secondary. Uses the capability's own noun when it has one.
export function handlesNow(cap) {
  const many = cap.actionNoun || '';
  const one = many.replace(/s$/, '');
  const limits = cap.authority.limited ? ' within its daily limits' : ' within limits';
  return [
    'No automation; a person does all the work',
    `Suggests${many ? ` ${many}` : ''}; a person decides and acts`,
    one ? `Prepares each ${one}; a person approves every one` : 'Prepares the work; a person approves every action',
    `Handles ${many || 'cases'} on its own${limits}; everything else goes to human review`,
    `Handles most ${many || 'cases'} on its own; a person handles the exceptions`,
  ][cap.authority.level] || LEVEL_PLAIN[cap.authority.level] || '';
}

// One row per capability: what it handles now, and what's next. Only three
// states earn a badge in "next": Ready, Restricted and Needs review.
export function authorityRows(state) {
  return state.capabilities.map((cap) => {
    const r = readiness(state, cap.id);
    const review = reviewNeeded(state, cap.id);
    const held = personRestriction(state, cap.id);
    let next;
    if (setupState(state, cap.id) === 'draft') next = { badge: ['decision', 'In setup'], text: 'nothing granted until the setup is confirmed' };
    else if (review.restriction) next = { badge: ['restricted', 'Needs review'], text: 'before any expansion' };
    else if (decisionRequired(state, cap.id)) { const p = proposedAuthority(state, cap.id); next = { badge: ['decision', 'Ready'], text: `to decide on expanding ${p.level >= 4 ? 'broadly' : p.level === 3 ? 'within limits' : `to ${levelName(p.level)}`}` }; }
    else if (cap.status === 'not-delegated') next = { text: 'Not delegated, by design' };
    else if (held && cap.status === 'restricted') next = { badge: ['restricted', 'Restricted'], text: `until it meets the requirements to return to ${levelName(held.previous.level)}` };
    else if (review.any) next = { badge: ['restricted', 'Needs review'], text: 'an incident is open' };
    else if (r.total && r.met < r.total) { const w = requirementWork(r.unmet[0]); next = { text: w.short ? w.short.replace(/^./, (c) => c.toUpperCase()) : `${r.met} of ${r.total} checks met` }; }
    else next = { text: 'No change planned' };
    return { capabilityId: cap.id, cap: cap.name, authority: cap.authority, plain: handlesNow(cap),
      level: setupState(state, cap.id) === 'draft' ? 'Not granted yet' : `${levelName(cap.authority.level)}${cap.authority.limited ? ', with limits' : ''}`, movedBack: Boolean(review.restriction), next };
  });
}
