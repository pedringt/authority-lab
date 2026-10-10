// Replaying recorded agent runs through the live gate (roadmap item 9, A6).
// A recording (agent/runs/*.json) lists what a model asked for on each ticket
// and what the gate said at the time. Replay feeds the same calls through
// today's gate, from the same starting state, and reports both verdicts side
// by side. It is deterministic: the same recording and the same gate always
// give the same result, and no model is involved.

import { initialState } from './state.js';
import { selectDecision, authorize } from './decisions.js';
import { callTool } from './tools.js';

// The starting state a recording names: the seed, optionally after the
// capability's pending decision is authorized with the given option.
export function runStartState(start) {
  let s = initialState();
  if (start.authorize) s = authorize(selectDecision(s, start.capabilityId, start.authorize), start.capabilityId);
  return s;
}

// How a tool's input becomes a gate call. The MCP server uses this too, so a
// recorded input replays exactly as the server handled it: claims travel
// apart from the arguments.
export function toolCall(tool, input = {}) {
  if (tool === 'issue_refund') {
    const { orderId, amount, confidence, paymentMethod, claims } = input;
    return { tool, args: { orderId, amount, confidence, paymentMethod }, claims };
  }
  if (tool === 'escalate_to_human') return { tool, args: { reason: input.reason, orderId: input.orderId } };
  return { tool, args: { orderId: input.orderId } };
}

// Replay one ticket, from a fresh start state or (in a shared-session run)
// from the previous ticket's state. Steps the input schema refused never
// reached the gate, so they are reported but not replayed.
export function replayTicket(run, ticket, from = null) {
  const source = run.source === 'recorded' ? 'recorded' : 'mock';
  let state = from || runStartState(run.start);
  const steps = ticket.steps.map((step) => {
    if (step.refusedBySchema) return { ...step, replay: null, same: true };
    const out = callTool(state, run.start.capabilityId, toolCall(step.tool, step.input), { source });
    state = out.state;
    const replay = { verdict: out.check.verdict, rule: { kind: out.check.rule.kind, text: out.check.rule.text }, reason: out.check.reason };
    const same = Boolean(step.gate) && step.gate.verdict === replay.verdict && step.gate.rule.kind === replay.rule.kind;
    return { ...step, replay, same };
  });
  return { ticketId: ticket.ticketId, steps, state, changed: steps.filter((s) => !s.same).length };
}

export function replayRun(run) {
  let carried = null;
  const tickets = run.tickets.map((t) => {
    const r = replayTicket(run, t, run.start.shared ? carried : null);
    carried = r.state;
    return r;
  });
  return { source: run.source, model: run.model, date: run.date, tickets, changed: tickets.reduce((n, t) => n + t.changed, 0) };
}

// Replay a recording: one run, or every run of a run set.
export function replayRecording(rec) {
  return (Array.isArray(rec.runs) ? rec.runs : [rec]).map((r) => replayRun(r));
}
