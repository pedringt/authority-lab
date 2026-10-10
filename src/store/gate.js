// The gate (roadmap item 9, A1): decides whether an AI action may happen.
// Pure and deterministic: the same state and action always give the same
// verdict. One implementation; the agent tooling imports it from here.
//
// Verdicts: 'allow', 'needs-person' or 'block', each with the reason and the
// rule applied. Facts (order value, fraud flag, chargeback, customer, policy
// exception) come only from systems of record in state.systems, never from the
// model's arguments; a claim that contradicts the record blocks. The current
// authority level applies at once, including right after an automatic
// restriction. Contract lines software can't check are listed as not enforced
// rather than pretended.

import { TOOL_SCOPE } from '../data/seed.js';
import { getCapability } from './state.js';
import { current, levelName } from './selectors.js';

// The known tools. Which capabilities may use each one is seeded (TOOL_SCOPE).
export const TOOLS = {
  lookup_order: { kind: 'read', label: 'Look up an order', capabilities: TOOL_SCOPE.lookup_order },
  issue_refund: { kind: 'act', label: 'Issue a refund', capabilities: TOOL_SCOPE.issue_refund },
  escalate_to_human: { kind: 'escalate', label: 'Hand the case to a person', capabilities: TOOL_SCOPE.escalate_to_human },
};

// Look up a key the model supplied (an order id, a tool name) as an own
// property only: "constructor", "toString", "__proto__" and the like are
// built into every plain object and must never count as a record or a tool.
export const own = (obj, key) => (obj != null && typeof key === 'string' && Object.hasOwn(obj, key) ? obj[key] : undefined);

// The facts the gate will compare a model's claims against.
const FACTS = { orderValue: 'value', customerId: 'customerId', fraudFlag: 'fraudFlag', chargeback: 'chargeback', policyException: 'policyException' };

// Systems of record (A2). Each order's facts include the account's fraud flag
// and any active chargeback, taken from their own lists; an order that states
// them directly (test fixtures) keeps its own. Absent, the gate knows no orders.
export function systemsOf(state) {
  const s = state.systems || {};
  const fraud = new Set((s.fraudFlags || []).map((f) => f.customerId));
  const disputed = new Set((s.chargebacks || []).filter((c) => c.status === 'active').map((c) => c.orderId));
  // Null-prototype maps: no built-in name ("constructor", "__proto__") can be
  // mistaken for a record, whoever looks it up.
  const orders = Object.assign(Object.create(null), Object.fromEntries(Object.entries(s.orders || {}).map(([id, o]) => [id, { ...o, fraudFlag: o.fraudFlag ?? fraud.has(o.customerId), chargeback: o.chargeback ?? disputed.has(id) }])));
  const customers = Object.assign(Object.create(null), s.customers || {});
  const tickets = Object.assign(Object.create(null), s.tickets || {});
  return { orders, customers, tickets, refunds: s.refunds || [], escalations: s.escalations || [] };
}

// ---------------------------------------------------------------------------
// Structured terms read from the contract and the authorizing record
// ---------------------------------------------------------------------------

const money = (t) => { const m = t.match(/(?:over|above|more than|exceeds?)\s*\$\s?(\d+(?:\.\d+)?)/i); return m ? Number(m[1]) : null; };

// A contract line software can check, as a predicate on the action's facts.
// Lines it doesn't recognise return null and are listed as not enforced.
function recognise(line) {
  const t = line.toLowerCase();
  const n = money(line);
  if (/split/.test(t) && /refund/.test(t)) return { kind: 'split', test: (f) => f.priorOnOrder > 0 && f.cumulativeOrder > (f.splitLimit ?? Infinity), describe: 'splitting a refund across calls' };
  if (/different payment method/.test(t)) return { kind: 'payment-method', test: (f) => Boolean(f.args.paymentMethod) && f.args.paymentMethod !== f.order.paymentMethod, describe: 'a refund to a different payment method' };
  if (/fraud/.test(t)) return { kind: 'fraud', test: (f) => Boolean(f.order.fraudFlag), describe: 'a fraud flag on the account' };
  if (/chargeback/.test(t)) return { kind: 'chargeback', test: (f) => Boolean(f.order.chargeback), describe: 'an active chargeback' };
  if (/policy exception/.test(t)) return { kind: 'policy-exception', test: (f) => Boolean(f.order.policyException), describe: 'a policy exception' };
  // Confidence is whatever the model says it is: checked, but not verified.
  if (/confidence below\s*(\d+)/.test(t)) { const c = Number(t.match(/confidence below\s*(\d+)/)[1]); return { kind: 'confidence', modelReported: true, test: (f) => !(Number(f.args.confidence) >= c), describe: `model-reported confidence below ${c}%, not verified` }; }
  if (/missing order evidence/.test(t)) return { kind: 'no-order', test: (f) => !f.order.exists, describe: 'missing order evidence' };
  // Who gave the instruction (S04 option 2). The model reports it in
  // instructionSource (not verified); the ticket's sender comes from the
  // record. A person is needed unless both say "the order's customer".
  if (/someone other than the customer/.test(t) && /approval|instruction/.test(t)) return { kind: 'instruction-source', test: (f) => !f.sourceIsCustomer || !f.senderIsCustomer, describe: (f) => sourceWhy(f) };
  if (n !== null && /refund|execution/.test(t)) return { kind: 'amount', limit: n, test: (f) => Math.max(f.cumulativeOrder, f.cumulativeCustomerDay) > n, describe: `refunds over $${n}, counted per order and per customer per day` };
  return null;
}

// Why an instruction-source check fired, in words.
function sourceWhy(f) {
  if (!f.sourceGiven) return 'the model gave no instruction source; it is required';
  if (!f.sourceIsCustomer) return `the model says the instruction came from ${JSON.stringify(f.args.instructionSource)}, not the customer (model-reported, not verified)`;
  if (!f.ticket) return 'no ticket on record for this session, so the sender can\'t be checked';
  return 'the ticket\'s sender on record isn\'t the order\'s customer';
}

const says = (d, f) => (typeof d === 'function' ? d(f) : d);

// The record that granted the capability's current authority, if a person
// authorized it: its conditions are the Level 3 limits.
function grantingRecord(state, cap) {
  const recs = state.decisionRecords.filter((r) => r.capabilityId === cap.id && r.authorizedBy !== 'system' && r.next && r.next.level === cap.authority.level);
  return recs[recs.length - 1] || null;
}

// The limits as structured terms. Today these are the Expand-with-limits
// conditions recorded on the authorizing decision.
function limitTerms(conditions) {
  if (!conditions) return [];
  const out = [];
  if (conditions.maxValue != null) out.push({ kind: 'max-value', limit: conditions.maxValue, text: `Value at most $${conditions.maxValue}, per order and per customer per day`, test: (f) => f.cumulativeOrder <= conditions.maxValue && f.cumulativeCustomerDay <= conditions.maxValue });
  if (conditions.noFraudFlag) out.push({ kind: 'no-fraud', text: 'No fraud flag on the account', test: (f) => !f.order.fraudFlag });
  if (conditions.policyClear) out.push({ kind: 'policy-clear', text: 'Policy eligibility is clear', test: (f) => !f.order.policyException });
  if (conditions.maxDailyTotal != null) out.push({ kind: 'daily-total', limit: conditions.maxDailyTotal, text: `At most $${conditions.maxDailyTotal} refunded by this capability per day, across all customers`, test: (f) => f.capabilityDayTotal <= conditions.maxDailyTotal });
  if (conditions.maxDailyCount != null) out.push({ kind: 'daily-count', limit: conditions.maxDailyCount, text: `At most ${conditions.maxDailyCount} refunds by this capability per day, across all customers`, test: (f) => f.capabilityDayCount <= conditions.maxDailyCount });
  if (conditions.minConfidence != null) out.push({ kind: 'min-confidence', modelReported: true, text: `Model-reported confidence at least ${conditions.minConfidence}% (not verified)`, test: (f) => Number(f.args.confidence) >= conditions.minConfidence });
  if (conditions.noChargeback) out.push({ kind: 'no-chargeback', text: 'No active chargeback', test: (f) => !f.order.chargeback });
  return out;
}

// Everything the gate enforces for a capability, and what it can't.
export function enforcementTerms(state, capabilityId) {
  const cap = getCapability(state, capabilityId);
  const contract = current(state, capabilityId, 'contract');
  const read = (section) => (contract[section] || []).map((text) => ({ section, text, rule: recognise(text) }));
  const lines = [...read('mustNever'), ...read('mustAsk'), ...read('escalation')];
  const rec = cap ? grantingRecord(state, cap) : null;
  return {
    mustNever: lines.filter((l) => l.section === 'mustNever' && l.rule),
    mustAsk: lines.filter((l) => l.section === 'mustAsk' && l.rule),
    escalation: lines.filter((l) => l.section === 'escalation' && l.rule),
    limits: limitTerms(rec && rec.conditions),
    limitsFrom: rec && rec.conditions ? rec.id : null,
    unenforced: lines.filter((l) => !l.rule).map(({ section, text }) => ({ section, text })),
    // What software can't verify: lines it can't check at all, and checks that
    // rest on the model's own report (confidence). The latter still run, but
    // never count as a reason an action was allowed.
    notVerified: [
      ...lines.filter((l) => !l.rule).map(({ section, text }) => ({ section, text, why: 'Not enforced by software.' })),
      ...lines.filter((l) => l.rule && l.rule.modelReported).map(({ section, text }) => ({ section, text, why: 'Model-reported, not verified.' })),
      ...limitTerms(rec && rec.conditions).filter((l) => l.modelReported).map((l) => ({ section: 'limits', text: l.text, why: 'Model-reported, not verified.' })),
      ...lines.filter((l) => l.rule && l.rule.kind === 'instruction-source').map(({ section }) => ({ section, text: 'Who gave the instruction (instructionSource on issue_refund)', why: 'Model-reported, not verified. The ticket\'s sender is checked against the record.' })),
    ],
  };
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

const verdict = (v, reason, rule, extra = {}) => ({ verdict: v, reason, rule, ...extra });

// action: { tool, args: { orderId, amount, instructionSource, paymentMethod?, confidence?, customerId? }, claims?: { orderValue?, fraudFlag?, ... }, ticketId? }
// ticketId is set by the harness (the agent server or runner), never by the model.
export function checkAction(state, capabilityId, action = {}) {
  const tool = own(TOOLS, action.tool);
  if (!tool) return verdict('block', `"${action.tool}" is not a known tool.`, { kind: 'unknown-tool', text: 'Only listed tools can be used.' });
  const cap = getCapability(state, capabilityId);
  if (!cap) return verdict('block', `Unknown capability "${capabilityId}".`, { kind: 'unknown-capability', text: 'Every action belongs to a capability.' });
  if (tool.capabilities !== '*' && !tool.capabilities.includes(cap.id)) return verdict('block', `${tool.label} is not a tool of ${cap.name}.`, { kind: 'tool-scope', text: 'A capability can only use its own tools.' });
  const level = cap.authority.level;
  const at = { level };
  if (level === 0) return verdict('block', `${cap.name} is at Level 0, ${levelName(0)}: the AI produces no operational output.`, { kind: 'level-0', text: 'Level 0 blocks everything.' }, at);
  if (tool.kind === 'escalate') return verdict('allow', 'Handing a case to a person never needs permission.', { kind: 'escalate', text: 'Escalating to a person is always allowed above Level 0.' }, at);
  if (tool.kind === 'read') return verdict('allow', `Reading is allowed at ${levelName(level)}; the data filter decides what the model sees.`, { kind: 'read', text: 'Reads are allowed above Level 0.' }, at);
  if (level === 1) return verdict('block', `${cap.name} is at Level 1, ${levelName(1)}: it may recommend, not act.`, { kind: 'level-1', text: 'Level 1 blocks actions.' }, at);

  // Facts come only from the systems of record.
  const args = action.args || {};
  const { orders, refunds, tickets } = systemsOf(state);
  const rec = own(orders, args.orderId);
  if (!rec) return verdict('block', `No order "${args.orderId}" in the system of record.`, { kind: 'no-record', text: 'Facts come only from systems of record.' }, at);
  const order = { ...rec, exists: true };
  for (const [claim, field] of Object.entries(FACTS)) {
    const claimed = (action.claims || {})[claim] ?? (claim === 'customerId' ? args.customerId : undefined);
    if (claimed !== undefined && claimed !== order[field]) {
      return verdict('block', `The model's ${claim} (${JSON.stringify(claimed)}) contradicts the system of record (${JSON.stringify(order[field])}).`, { kind: 'fact-mismatch', text: 'A claim that contradicts the record blocks.' }, at);
    }
  }
  // The ticket this session is bound to, and who sent it. An id that isn't
  // on record blocks: the harness bound the session to something that
  // doesn't exist.
  const ticketGiven = action.ticketId != null;
  const ticket = ticketGiven ? own(tickets, action.ticketId) : undefined;
  if (ticketGiven && !ticket) return verdict('block', `No ticket "${action.ticketId}" in the system of record.`, { kind: 'no-record', text: 'Facts come only from systems of record.' }, at);
  const sender = ticket && ticket.sender ? ticket.sender : {};
  const senderIsCustomer = Boolean(ticket) && typeof sender.customerId === 'string' && sender.customerId === order.customerId;
  // The model's instructionSource: required, model-reported, not verified.
  // "customer" in any case or spacing is read as the customer, so a variant
  // spelling can't dodge the check below.
  const sourceGiven = typeof args.instructionSource === 'string' && args.instructionSource.trim() !== '';
  const sourceIsCustomer = sourceGiven && args.instructionSource.trim().toLowerCase() === 'customer';
  // Saying the customer asked when the ticket on record says otherwise is a
  // claim that contradicts the record: it blocks, and counts as a false claim.
  if (sourceIsCustomer && ticket && !senderIsCustomer) {
    const who = sender.customerId ? `customer ${JSON.stringify(sender.customerId)}` : sender.internal ? `${JSON.stringify(sender.internal)} (internal)` : 'unknown';
    return verdict('block', `The model says the customer gave the instruction, but ticket ${action.ticketId} on record was sent by ${who}, not ${order.customerId}.`, { kind: 'fact-mismatch', text: 'A claim that contradicts the record blocks.' }, at);
  }
  const amount = Number(args.amount);
  if (!(amount > 0)) return verdict('block', 'A refund needs a positive amount.', { kind: 'amount', text: 'A refund needs a positive amount.' }, at);
  const priorOnOrder = refunds.filter((r) => r.orderId === args.orderId).reduce((t, r) => t + r.amount, 0);
  const priorCustomerDay = refunds.filter((r) => r.customerId === order.customerId && r.date === state.today).reduce((t, r) => t + r.amount, 0);
  // Capability-wide: everything this capability refunded today, any customer.
  const capabilityToday = refunds.filter((r) => r.capabilityId === cap.id && r.date === state.today);
  if (priorOnOrder + amount > order.value) return verdict('block', `Refunds on ${args.orderId} would total $${priorOnOrder + amount}, more than the order's $${order.value}.`, { kind: 'over-order', text: 'Refunds never exceed the order value.' }, at);

  const terms = enforcementTerms(state, capabilityId);
  // The amount a "never split a refund" line protects: the contract's own
  // must-never amount if it has one, else the recorded value limit.
  const neverAmount = terms.mustNever.find((l) => l.rule.kind === 'amount');
  const maxValue = terms.limits.find((l) => l.kind === 'max-value');
  const splitLimit = neverAmount ? neverAmount.rule.limit : maxValue ? maxValue.limit : undefined;
  const facts = { order, args, ticket, sender, senderIsCustomer, sourceGiven, sourceIsCustomer, priorOnOrder, cumulativeOrder: priorOnOrder + amount, cumulativeCustomerDay: priorCustomerDay + amount, splitLimit, capabilityDayTotal: capabilityToday.reduce((t, r) => t + r.amount, 0) + amount, capabilityDayCount: capabilityToday.length + 1 };
  const fired = (list) => list.find((l) => l.rule.test(facts));
  const never = fired(terms.mustNever);
  if (never) return verdict('block', `Must never: ${never.text} (${says(never.rule.describe, facts)}).`, { kind: 'must-never', text: never.text }, at);
  // Every reason the action needs a person, in order. The verdict leads with
  // the first; `findings` keeps them all, so an approval can tell later
  // whether anything new appeared (A4).
  const needs = [];
  if (level === 2) needs.push(verdict('needs-person', `${cap.name} is at Level 2, ${levelName(2)}: every action needs a person.`, { kind: 'level-2', text: 'Level 2: a person approves every action.' }, at));
  for (const ask of terms.mustAsk.filter((l) => l.rule.test(facts))) needs.push(verdict('needs-person', `Must ask: ${ask.text} (${says(ask.rule.describe, facts)}).`, { kind: 'must-ask', text: ask.text }, at));
  for (const esc of terms.escalation.filter((l) => l.rule.test(facts))) needs.push(verdict('needs-person', `Escalate: ${esc.text} (${says(esc.rule.describe, facts)}).`, { kind: 'escalation', text: esc.text }, at));
  if (level === 3) {
    if (!terms.limits.length) needs.push(verdict('needs-person', `${cap.name} is at Level 3 but no structured limits are recorded, so software can't confirm the action is within limits.`, { kind: 'no-limits', text: 'Level 3 acts only within recorded limits.' }, at));
    for (const broken of terms.limits.filter((l) => !l.test(facts))) needs.push(verdict('needs-person', `Outside the limits set in ${terms.limitsFrom}: ${broken.text}.`, { kind: 'limit', text: broken.text }, at));
  }
  if (needs.length) return { ...needs[0], findings: needs.map((n) => ({ reason: n.reason, rule: n.rule })) };
  if (level === 3) {
    // The reason names only what software verified, never the model's own report.
    const verified = terms.limits.filter((l) => !l.modelReported);
    return verdict('allow', `Within every verified limit set in ${terms.limitsFrom}.`, { kind: 'within-limits', text: verified.map((l) => l.text).join('; ') }, at);
  }
  return verdict('allow', `${levelName(level)}: no must-ask or must-never applies.`, { kind: 'level-4', text: 'Level 4 acts unless a must-ask or must-never applies.' }, at);
}
