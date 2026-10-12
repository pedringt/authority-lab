// Adoption signals (roadmap item 9, C2, #75): warnings on the Monitoring tab,
// never blocking. Each says what it saw, why it matters and where the data
// came from. Nothing here changes what the gate allows or what a person can
// authorize.
//
// Two signals read real data from the workspace (the waiting queue and the
// refund ledger). The two that need timing or a weekly series the demo can't
// produce read simulated seed data, and say so.

import { getCapability, capData } from './state.js';
import { grantingRecord } from './value.js';

export const ADOPTION_THRESHOLDS = {
  // Rubber-stamping: nearly everything approved, over enough decisions, or
  // decisions faster than anyone can read the case.
  approvalRatePct: 95,
  minDecisions: 10,
  fastMedianSeconds: 15,
  // Rising overrides: up in each of the last three weeks, by this much in all.
  overrideRisePoints: 3,
  // Escalations left waiting: more than this many days in the queue.
  waitDays: 2,
};

const SIMULATED = 'Simulated demo data';
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

// Rubber-stamping: decisions on waiting actions (real) plus the simulated
// review log, which is the only place decision times exist.
function rubberStamping(state, capabilityId, t) {
  const real = (state.actionQueue || []).filter((x) => x.capabilityId === capabilityId && x.decision && x.decision.by);
  const log = (capData(state, capabilityId).adoption || {}).reviewLog || [];
  const decisions = real.length + log.length;
  if (decisions < t.minDecisions) return null;
  const approved = real.filter((x) => x.status === 'executed' || x.status === 'refused').length + log.filter((x) => x.outcome === 'approved').length;
  const rate = Math.round((approved / decisions) * 1000) / 10;
  const timed = log.map((x) => x.seconds).filter((x) => typeof x === 'number');
  const fast = timed.length ? median(timed) : null;
  const reasons = [];
  if (rate >= t.approvalRatePct) reasons.push(`${rate}% of ${decisions} decisions were approvals (warning at ${t.approvalRatePct}% or more)`);
  if (fast !== null && fast < t.fastMedianSeconds) reasons.push(`the median review took ${fast} seconds (warning under ${t.fastMedianSeconds})`);
  if (!reasons.length) return null;
  return {
    id: 'rubber-stamping',
    title: 'Approvals may not be real reviews',
    what: `${reasons.join('; ')}.`,
    why: 'When nearly everything is approved, or approved this fast, people may be clicking through without reading. Then asking a person doesn\'t protect anything.',
    source: log.length ? `${real.length ? `${real.length} real approval decisions and ` : ''}${log.length} simulated reviews (${SIMULATED}; only the simulated reviews have timings)` : `${real.length} real approval decisions`,
    simulated: log.length > 0,
  };
}

// Rising overrides: a weekly override-rate series (simulated in the demo).
function risingOverrides(state, capabilityId, t) {
  const weeks = ((capData(state, capabilityId).adoption || {}).overrideWeeks || []).slice(-4);
  if (weeks.length < 4) return null;
  const rates = weeks.map((w) => w.rate);
  const rising = rates.every((r, i) => i === 0 || r > rates[i - 1]);
  const rise = Math.round((rates[3] - rates[0]) * 10) / 10;
  if (!rising || rise < t.overrideRisePoints) return null;
  return {
    id: 'rising-overrides',
    title: 'Reviewers are reversing more',
    what: `The share of AI decisions reversed rose every week for three weeks: ${weeks.map((w) => `${w.rate}%`).join(' → ')} (up ${rise} points; warning at ${t.overrideRisePoints}).`,
    why: 'People reversing more of the AI\'s decisions week after week suggests its quality or fit is slipping, before any safety limit is crossed.',
    source: `Weekly reversal rates (${SIMULATED})`,
    simulated: true,
  };
}

// Escalations left waiting: actions in the queue longer than the threshold.
function waitingTooLong(state, capabilityId, t) {
  const old = (state.actionQueue || []).filter((x) => x.capabilityId === capabilityId && x.status === 'waiting' && daysBetween(x.date, state.today) > t.waitDays);
  if (!old.length) return null;
  const oldest = Math.max(...old.map((x) => daysBetween(x.date, state.today)));
  return {
    id: 'waiting-too-long',
    title: 'Approvals left waiting',
    what: `${old.length} action${old.length === 1 ? '' : 's'} ha${old.length === 1 ? 's' : 've'} waited for approval more than ${t.waitDays} days (oldest: ${oldest} days): ${old.map((x) => x.id).join(', ')}.`,
    why: 'Customers wait while these sit. If it keeps happening, people may start working around the AI, or approving in bulk to clear the list.',
    source: 'Actions that need approval (this workspace)',
    simulated: false,
  };
}

// Work-arounds: refunds people issued themselves, not through the agent or
// an approved waiting action, since the expansion in force.
function workarounds(state, capabilityId) {
  const rec = grantingRecord(state, capabilityId);
  if (!rec || !(rec.next && rec.next.level >= 3)) return null;
  const cap = getCapability(state, capabilityId);
  const manual = ((state.systems || {}).refunds || []).filter((r) => r.date >= rec.date && r.by !== 'ai' && !r.approvedVia && (!r.capabilityId || r.capabilityId === cap.id));
  if (!manual.length) return null;
  return {
    id: 'workarounds',
    title: 'Refunds done by hand',
    what: `${manual.length} refund${manual.length === 1 ? ' was' : 's were'} issued by hand since ${rec.id} (${rec.date}), not by the AI or through an approval: ${manual.map((r) => `${r.id} on ${r.orderId}`).join(', ')}.`,
    why: 'Work done outside the AI doesn\'t show up in the logged actions, the evidence or the safety limits. It usually means the process is getting in people\'s way.',
    source: 'Refund records (this workspace)',
    simulated: false,
  };
}

// Every signal that's raised now, in a fixed order.
export function adoptionSignals(state, capabilityId, thresholds = ADOPTION_THRESHOLDS) {
  if (!getCapability(state, capabilityId)) return [];
  return [rubberStamping(state, capabilityId, thresholds), risingOverrides(state, capabilityId, thresholds), waitingTooLong(state, capabilityId, thresholds), workarounds(state, capabilityId)].filter(Boolean);
}
