// Gate decisions as instrumentation (roadmap item 9, A5). Every check the gate
// makes, and every decision a person makes on a waiting action, is logged as
// an event: who, what, verdict, rule, outcome, when, and where it came from.
// The log rolls up into evidence (allowed, escalated, blocked, overridden) and
// into readings for restriction rules the gate can measure, so the existing
// restriction rules run on the agent's behaviour.
//
// Every event says where it came from: 'seeded' (the demo's starting data),
// 'session' (calls made in this browser or agent session) or 'recorded' (a
// real model run, A6). Nothing is presented as more real than it is.

import { getCapability, capData } from './state.js';
import { restrictionRules, ruleCrossed, applyBreach } from './monitoring.js';

export const GATE_SOURCES = { seeded: 'Seeded demo data', session: 'This session', recorded: 'Recorded from a real run' };

const log = (state) => state.gateLog || [];

// Append one event. `entry`: { capabilityId, actor, tool, orderId, verdict,
// rule, outcome, queueId, source }.
export function logGate(state, entry) {
  const list = log(state);
  const event = {
    id: `GL-${String(list.length + 1).padStart(4, '0')}`,
    date: state.today,
    seq: list.length + 1,
    source: 'session',
    actor: 'ai',
    ...entry,
    rule: entry.rule ? { kind: entry.rule.kind, text: entry.rule.text } : null,
  };
  return { ...state, gateLog: [...list, event] };
}

export function gateEvents(state, capabilityId = null) {
  return log(state).filter((e) => !capabilityId || e.capabilityId === capabilityId);
}

// The category each event counts under. Reads are logged but don't count as
// actions. A person's decision counts as overridden when they rejected what
// the AI asked for.
export function categoryOf(e) {
  if (e.actor !== 'ai') return e.outcome === 'rejected' ? 'overridden' : e.outcome === 'executed' ? 'approved' : e.outcome === 'refused' ? 'refused' : 'other';
  if (e.tool === 'lookup_order') return 'read';
  if (e.tool === 'escalate_to_human') return 'escalated';
  if (e.verdict === 'allow') return 'allowed';
  if (e.verdict === 'needs-person') return 'escalated';
  if (e.verdict === 'block') return 'blocked';
  return 'other';
}

// Counts and rates for a capability, with where the events came from.
export function gateSummary(state, capabilityId) {
  const events = gateEvents(state, capabilityId);
  const count = (c) => events.filter((e) => categoryOf(e) === c).length;
  const counts = { allowed: count('allowed'), escalated: count('escalated'), blocked: count('blocked'), overridden: count('overridden'), approved: count('approved'), refused: count('refused'), reads: count('read') };
  const actions = counts.allowed + counts.escalated + counts.blocked;
  const rate = (n) => (actions ? Math.round((n / actions) * 1000) / 10 : null);
  const sources = [...new Set(events.map((e) => e.source))];
  return {
    events: events.length,
    actions,
    counts,
    rates: { automation: rate(counts.allowed), escalation: rate(counts.escalated), block: rate(counts.blocked), override: counts.escalated ? Math.round((counts.overridden / counts.escalated) * 1000) / 10 : null },
    mustNeverAttempts: events.filter((e) => e.actor === 'ai' && e.rule && e.rule.kind === 'must-never').length,
    sources,
  };
}

// Evidence items derived from the gate log. Derived, not stored: they never
// count as "performance results seen" for the criteria lock, and they say
// where their numbers came from.
export function gateEvidence(state, capabilityId) {
  const g = gateSummary(state, capabilityId);
  if (!g.actions) return [];
  const origin = g.sources.map((s) => GATE_SOURCES[s] || s).join(', ');
  const base = { source: 'Gate log', segment: 'All', date: state.today, risk: 'High', link: `#/capabilities/${capabilityId}?tab=monitoring`, derived: true, origin };
  const pct = (v) => (v == null ? 'n/a' : `${v}%`);
  return [
    { ...base, id: 'GATE-1', metric: 'Actions allowed automatically', value: `${g.counts.allowed} of ${g.actions} (${pct(g.rates.automation)})`, status: 'pass', detail: `Actions the gate allowed without a person. From the gate log: ${origin}.` },
    { ...base, id: 'GATE-2', metric: 'Actions sent to a person', value: `${g.counts.escalated} of ${g.actions} (${pct(g.rates.escalation)})`, status: 'watch', detail: `Needs-person verdicts and hand-offs to a person. ${g.counts.approved} approved, ${g.counts.overridden} rejected (overridden), ${g.counts.refused} refused at execution. From the gate log: ${origin}.` },
    { ...base, id: 'GATE-3', metric: 'Actions blocked', value: `${g.counts.blocked} of ${g.actions} (${pct(g.rates.block)})`, status: g.mustNeverAttempts ? 'fail' : g.counts.blocked ? 'watch' : 'pass', detail: `Actions the gate refused, ${g.mustNeverAttempts} of them must-never attempts. From the gate log: ${origin}.` },
  ];
}

// A restriction rule the gate log can measure, recognised from its contract
// line. Today: attempts at a must-never action within a window of days.
export function gateMetricOf(rule) {
  const t = rule.text.toLowerCase();
  if (/must[- ]never/.test(t) && /attempt/.test(t)) return 'must-never-attempts';
  return null;
}

// The reading for a gate-measured rule: the AI's must-never attempts in the
// rule's window (days back from today, inclusive). Seeded events count only
// if they're in the window, like any other.
export function gateReading(state, capabilityId, rule) {
  if (gateMetricOf(rule) !== 'must-never-attempts') return null;
  const days = (rule.window && rule.window.days) || 7;
  const today = Date.parse(state.today);
  return gateEvents(state, capabilityId).filter((e) => e.actor === 'ai' && e.rule && e.rule.kind === 'must-never' && (today - Date.parse(e.date)) / 86400000 < days).length;
}

// After each gate event: if a gate-measured rule now applies and is crossed,
// the capability is restricted through the shared breach flow (once).
export function enforceGateRules(state, capabilityId) {
  const d = capData(state, capabilityId);
  if (!getCapability(state, capabilityId) || (d.monitoring && d.monitoring.breached) || d.reviewRequired) return state;
  for (const rule of restrictionRules(state, capabilityId)) {
    if (!rule.active || rule.kind !== 'restrict') continue;
    const value = gateReading(state, capabilityId, rule);
    if (value === null || !ruleCrossed(rule, value)) continue;
    const attempts = gateEvents(state, capabilityId).filter((e) => e.actor === 'ai' && e.rule && e.rule.kind === 'must-never').slice(-value);
    const errors = attempts.map((e) => `${e.id}: the AI tried ${e.tool}${e.orderId ? ` on ${e.orderId}` : ''} and the gate blocked it (${e.rule.text}).`);
    return applyBreach(state, capabilityId, rule, { value, errors });
  }
  return state;
}
