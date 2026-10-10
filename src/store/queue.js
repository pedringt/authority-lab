// "Waiting for a person" (roadmap item 9, A4). An action the gate says needs a
// person waits here. A named, active stakeholder of the capability approves
// or rejects it, always with a reason. The AI never can. Approval re-runs the
// gate at that moment and executes only if nothing changed that the approver
// didn't see; otherwise it is refused, with the reason, and nothing executes.

import { getCapability, capData, logEvent } from './state.js';
import { current } from './selectors.js';
import { people, isActivePerson, snapshotPerson } from './people.js';
import { checkAction, own } from './gate.js';
import { executeRefund } from './tools.js';
import { logGate } from './gatelog.js';

const items = (state) => state.actionQueue || [];
const orderOf = (call) => (call.args || {}).orderId || null;
const sameTarget = (a, b) => a.tool === b.tool && orderOf(a) === orderOf(b);

// At most this many actions wait for a person per capability (review, 2026-10-10).
export const QUEUE_LIMIT = 10;

// Who may decide: the capability owner and the people on its stakeholder list,
// active ones only. Unlike sign-off, an empty list never widens to everyone.
export function queueApprovers(state, capabilityId) {
  const cap = getCapability(state, capabilityId);
  if (!cap) return [];
  const listed = current(state, capabilityId, 'stakeholders').map((s) => s.person);
  return [...new Set([cap.owner, ...listed])].filter((k) => isActivePerson(state, k));
}

export function waitingActions(state, capabilityId = null) {
  return items(state).filter((x) => x.status === 'waiting' && (!capabilityId || x.capabilityId === capabilityId));
}

export function queuedAction(state, id) {
  return items(state).find((x) => x.id === id) || null;
}

// Put a needs-person call in the queue, or refuse it. A model can't flood the
// queue: at most one action waits per order per tool (any amount, any
// claims), and at most QUEUE_LIMIT wait per capability. A full queue opens an
// incident, once until it drains, so a person notices.
export function enqueue(state, capabilityId, call, check) {
  const existing = items(state).find((x) => x.status === 'waiting' && sameTarget(x.call, call));
  if (existing) return { state, refused: { kind: 'already-waiting', text: `Already waiting for a person: ${existing.id}.`, waitingId: existing.id } };
  if (waitingActions(state, capabilityId).length >= QUEUE_LIMIT) return { state: openQueueFullIncident(state, capabilityId), refused: { kind: 'queue-full', text: `Queue full: ${QUEUE_LIMIT} actions are already waiting for a person on this capability.` } };
  const cap = getCapability(state, capabilityId);
  // When the AI asks again after a refused approval, link it to the refused item.
  const refusedBefore = items(state).filter((x) => x.status === 'refused' && x.capabilityId === capabilityId && sameTarget(x.call, call)).at(-1);
  const item = {
    id: `WA-${String(items(state).length + 1).padStart(3, '0')}`,
    capabilityId,
    call: { tool: call.tool, args: { ...(call.args || {}) }, claims: call.claims ? { ...call.claims } : undefined },
    requestedBy: 'ai',
    date: state.today,
    // What a person is being asked to accept: every reason it needs a person,
    // and the authority in force then.
    rule: { kind: check.rule.kind, text: check.rule.text },
    reason: check.reason,
    findings: (check.findings || [{ reason: check.reason, rule: check.rule }]).map((f) => ({ reason: f.reason, rule: { kind: f.rule.kind, text: f.rule.text } })),
    levelAtRequest: cap.authority.level,
    status: 'waiting',
    decision: null,
    follows: refusedBefore ? refusedBefore.id : null,
  };
  return { state: { ...state, actionQueue: [...items(state), item] }, item };
}

// A full queue is an incident: an alert on the Overview, an incident evidence
// item and an activity event, once until the queue drains below the limit.
function openQueueFullIncident(state, capabilityId) {
  const d = capData(state, capabilityId);
  if (d.queueFull) return state;
  const cap = getCapability(state, capabilityId);
  const incidentNumber = d.evidence.filter((e) => e.source === 'Incident').length + 1;
  const incidentId = `INC-${String(incidentNumber).padStart(2, '0')}`;
  const evidence = [{ id: `EV-${String(d.evidence.length + 1).padStart(2, '0')}`, source: 'Incident', metric: `${incidentId}: waiting queue full`, value: `${QUEUE_LIMIT} actions waiting`, status: 'fail', risk: 'Medium', segment: 'All', date: state.today, detail: `${QUEUE_LIMIT} actions on ${cap.name} are waiting for a person, so new ones are blocked until some are decided. A model asking faster than people decide is worth a look.`, link: `#/capabilities/${cap.id}?tab=waiting` }, ...d.evidence];
  const s = { ...state, capabilityData: { ...state.capabilityData, [capabilityId]: { ...d, evidence, queueFull: { since: state.today, incidentId } } } };
  const alert = { id: `ALERT-${Date.now()}-q`, date: state.today, severity: 'medium', capabilityId, title: `Waiting queue full: ${cap.name}`, body: `${QUEUE_LIMIT} actions are waiting for a person; new ones are blocked until some are decided (${incidentId}).`, link: `#/capabilities/${cap.id}?tab=waiting` };
  return logEvent({ ...s, alerts: [alert, ...state.alerts] }, { kind: 'failure', surfaced: true, title: `Waiting queue full: ${cap.name}`, body: `${QUEUE_LIMIT} actions are waiting for a person, so new needs-person actions are blocked. ${incidentId} opened.`, capabilityId, link: `#/capabilities/${cap.id}?tab=waiting` });
}

// Once the queue is below the limit again, the full-queue incident closes and
// its alert clears.
function drainCheck(state, capabilityId) {
  const d = capData(state, capabilityId);
  if (!d.queueFull || waitingActions(state, capabilityId).length >= QUEUE_LIMIT) return state;
  return { ...state, capabilityData: { ...state.capabilityData, [capabilityId]: { ...d, queueFull: null } }, alerts: state.alerts.filter((a) => !(a.capabilityId === capabilityId && a.title.startsWith('Waiting queue full'))) };
}

// Can this person decide this item? Not the AI, not the system, not anyone
// deactivated, not anyone outside the capability's named stakeholders, and
// never twice.
export function queueEligibility(state, id, by) {
  const item = queuedAction(state, id);
  if (!item) return { ok: false, reason: `No waiting action "${id}".` };
  if (item.status !== 'waiting') return { ok: false, reason: `${item.id} was already ${item.status}${item.decision ? ` by ${item.decision.byAt ? item.decision.byAt.name : item.decision.by}` : ''}. Each action is decided once.` };
  if (by === 'ai' || by === 'system' || !own(people(state), by)) return { ok: false, reason: 'Only a named person can decide a waiting action. The AI never can.' };
  const p = people(state)[by];
  if (!isActivePerson(state, by)) return { ok: false, reason: `${p.name} is deactivated and can't decide waiting actions.` };
  if (!queueApprovers(state, item.capabilityId).includes(by)) return { ok: false, reason: `${p.name} isn't the owner or a named stakeholder of ${getCapability(state, item.capabilityId).name}.` };
  return { ok: true, reason: null };
}

// What the gate says now, compared with what the approver accepted. Execution
// goes ahead only if no review is pending, the authority didn't drop, nothing
// blocks it now, and every reason it needs a person now was already there
// when it was queued (the approver accepted those). Anything new refuses it.
export function recheckQueued(state, item) {
  const cap = getCapability(state, item.capabilityId);
  if (capData(state, item.capabilityId).reviewRequired) return { ok: false, reason: `${cap.name} was restricted automatically and is waiting for its post-incident review; nothing executes until then.` };
  if (cap.authority.level < item.levelAtRequest) return { ok: false, reason: `${cap.name}'s authority dropped from Level ${item.levelAtRequest} to Level ${cap.authority.level} since this was queued; it wasn't executed. The AI can ask again under the new level.` };
  const now = checkAction(state, item.capabilityId, item.call);
  if (now.verdict === 'block') return { ok: false, reason: `It's blocked now: ${now.reason}`, now };
  const accepted = new Set(item.findings.map((f) => `${f.rule.kind}|${f.rule.text}`));
  const added = (now.findings || []).filter((f) => !accepted.has(`${f.rule.kind}|${f.rule.text}`));
  if (added.length) return { ok: false, reason: `Things changed since it was queued: ${added.map((f) => f.reason).join(' ')}`, now };
  return { ok: true, reason: null, now };
}

function decide(state, id, by, status, reason, extra = {}) {
  const item = queuedAction(state, id);
  const decided = { ...item, status, decision: { by, byAt: snapshotPerson(state, by), reason, date: state.today, ...extra } };
  const s = drainCheck({ ...state, actionQueue: items(state).map((x) => (x.id === id ? decided : x)) }, item.capabilityId);
  // A person's decision is logged with the gate's events (A5).
  return logGate(s, { capabilityId: item.capabilityId, actor: by, tool: item.call.tool, orderId: (item.call.args || {}).orderId || null, verdict: status === 'rejected' ? 'rejected' : 'approved', rule: item.rule, outcome: status, queueId: item.id });
}

export function approveAction(state, id, { by, reason } = {}) {
  const e = queueEligibility(state, id, by);
  if (!e.ok) throw new Error(e.reason);
  const why = String(reason || '').trim();
  if (why.length < 10) throw new Error('An approval needs a reason (a sentence).');
  const item = queuedAction(state, id);
  const cap = getCapability(state, item.capabilityId);
  const who = people(state)[by];
  const check = recheckQueued(state, item);
  if (!check.ok) {
    // Refused at execution: recorded with who approved and why it didn't run.
    const s = decide(state, id, by, 'refused', why, { refusal: check.reason });
    return logEvent(s, { kind: 'failure', surfaced: true, title: `Approved action not executed: ${item.id}`, body: `${who.name} approved ${describe(item)} on ${cap.name}, but the gate's re-check refused it. ${check.reason}`, capabilityId: cap.id, link: `#/capabilities/${cap.id}?tab=waiting` });
  }
  let s = state;
  let execution = {};
  if (item.call.tool === 'issue_refund') {
    const r = executeRefund(s, item.capabilityId, item.call.args, by, { approvedVia: item.id });
    s = r.state;
    execution = { refundId: r.entry.id };
  }
  s = decide(s, id, by, 'executed', why, execution);
  return logEvent(s, { kind: 'decision', surfaced: true, title: `Waiting action approved and executed: ${item.id}`, body: `${who.name} approved ${describe(item)} on ${cap.name}. It needed a person because: ${item.rule.text} The gate re-checked it before it ran. Reason: ${why}`, capabilityId: cap.id, link: `#/capabilities/${cap.id}?tab=waiting` });
}

export function rejectAction(state, id, { by, reason } = {}) {
  const e = queueEligibility(state, id, by);
  if (!e.ok) throw new Error(e.reason);
  const why = String(reason || '').trim();
  if (why.length < 10) throw new Error('A rejection needs a reason (a sentence).');
  const item = queuedAction(state, id);
  const cap = getCapability(state, item.capabilityId);
  const s = decide(state, id, by, 'rejected', why);
  return logEvent(s, { kind: 'decision', surfaced: true, title: `Waiting action rejected: ${item.id}`, body: `${people(state)[by].name} rejected ${describe(item)} on ${cap.name}. Reason: ${why}`, capabilityId: cap.id, link: `#/capabilities/${cap.id}?tab=waiting` });
}

export function describe(item) {
  const a = item.call.args || {};
  return item.call.tool === 'issue_refund' ? `a $${a.amount} refund on ${a.orderId}` : `${item.call.tool}${a.orderId ? ` on ${a.orderId}` : ''}`;
}
