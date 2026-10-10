// The agent's tools (roadmap item 9, A2): lookup_order, issue_refund and
// escalate_to_human. Every call goes through the gate first. What the model
// gets back is filtered to the contract's "data the AI may see" section, and
// a refusal tells it the rule, never the record's values.

import { DATA_FIELDS } from '../data/seed.js';
import { getCapability } from './state.js';
import { current } from './selectors.js';
import { checkAction, systemsOf } from './gate.js';

const RESTRICTED = new Set(DATA_FIELDS.filter((f) => f.restricted).map((f) => f.id));

// The fields this capability's model may see: the contract's list, minus any
// restricted field (defence in depth; the contract checks refuse them too).
// A contract with no data section shows nothing from the records.
export function dataSeen(state, capabilityId) {
  const c = current(state, capabilityId, 'contract');
  return (Array.isArray(c.dataSeen) ? c.dataSeen : []).filter((f) => !RESTRICTED.has(f));
}

// Everything the systems of record hold about an order, before filtering.
function fullView(state, orderId) {
  const { orders, customers, refunds } = systemsOf(state);
  const o = orders[orderId];
  if (!o) return null;
  const c = customers[o.customerId] || {};
  return {
    order: { id: orderId, date: o.date, items: o.items, value: o.value, status: o.status, refundedSoFar: refunds.filter((r) => r.orderId === orderId).reduce((t, r) => t + r.amount, 0), paymentMethod: o.paymentMethod, cardNumber: o.cardNumber },
    customer: { id: o.customerId, firstName: c.firstName, fullName: c.fullName, email: c.email, city: c.city, address: c.address, accountSince: c.accountSince },
    flags: { fraud: o.fraudFlag, chargeback: o.chargeback, policyException: Boolean(o.policyException) },
  };
}

// Keep only the allowed fields ("order.value" keeps view.order.value).
export function filterForModel(view, allowed) {
  const out = {};
  for (const id of allowed) {
    const [group, field] = id.split('.');
    if (!view[group] || !(field in view[group])) continue;
    out[group] = out[group] || {};
    out[group][field] = view[group][field];
  }
  return out;
}

// What the model is told about a verdict: the verdict and the rule, never the
// gate's full reason, which can quote record values the model may not see.
const told = (check) => ({ verdict: check.verdict, rule: check.rule.kind, message: check.rule.text });

// Run one tool call. Returns the next state (unchanged unless the call
// executed) and the result the model sees. `check` is the gate's full
// verdict, kept for the record (A5 logs it).
export function callTool(state, capabilityId, call = {}) {
  const check = checkAction(state, capabilityId, call);
  const result = { tool: call.tool, ...told(check), executed: false };
  if (check.verdict !== 'allow') return { state, result, check };
  const args = call.args || {};

  if (call.tool === 'lookup_order') {
    const view = fullView(state, args.orderId);
    return { state, result: { ...result, executed: true, found: Boolean(view), data: view ? filterForModel(view, dataSeen(state, capabilityId)) : null }, check };
  }

  const sys = state.systems || {};
  if (call.tool === 'issue_refund') {
    const order = systemsOf(state).orders[args.orderId];
    const ledger = sys.refunds || [];
    const entry = { id: `RF-${String(ledger.length + 1).padStart(4, '0')}`, orderId: args.orderId, customerId: order.customerId, amount: Number(args.amount), date: state.today, by: 'ai', capabilityId };
    return { state: { ...state, systems: { ...sys, refunds: [...ledger, entry] } }, result: { ...result, executed: true, refundId: entry.id, amount: entry.amount }, check };
  }

  if (call.tool === 'escalate_to_human') {
    const list = sys.escalations || [];
    const cap = getCapability(state, capabilityId);
    const entry = { id: `ESC-${String(list.length + 1).padStart(3, '0')}`, capabilityId, orderId: args.orderId || null, reason: String(args.reason || '').trim() || 'No reason given.', date: state.today, owner: cap.owner };
    return { state: { ...state, systems: { ...sys, escalations: [...list, entry] } }, result: { ...result, executed: true, escalationId: entry.id }, check };
  }
  return { state, result, check };
}
