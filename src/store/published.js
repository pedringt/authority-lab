// Published records (Paige, 2026-10-13). In a client workspace, the record
// that every visitor sees is what has been published: a file committed to the
// repository, which only the workspace's owner can do. Anyone can try a
// decision in their own browser, but it stays there; publishing is the
// authorization. The configuration is the starting point, evidence arrives
// later, and a published decision comes last. Nothing here is configuration.
//
// A published file holds a decision's inputs and who made it, not the
// resulting state. On load it is replayed through the same transitions a
// person uses (propose, choose, outcomes, rollout, rationale, authorize), so a
// published file can't skip a governance check, and one that no longer
// replays (say, the evidence it rested on is gone) is shown as a problem
// instead of being trusted.

import { getCapability, capData } from './state.js';
import { proposeAuthority, selectDecision, setCondition, setRationale, setResidualRisk, setOutcome, setRolloutField, authorize, ROLLOUT_FIELDS, isExpansion } from './decisions.js';
import { people } from './people.js';

export const RECORD_SCHEMA = 'authority-lab-record/1';
const EXPANDING = new Set(['expand', 'expand-limits']);

// What to publish from a decision recorded in this browser: its inputs, who
// made it and when. Nothing derived.
export function publishableRecord(state, recordId) {
  const rec = state.decisionRecords.find((r) => r.id === recordId);
  if (!rec) throw new Error('That record no longer exists in this browser.');
  if (!state.clientWorkspace) throw new Error('Only records in a client workspace are published.');
  if (rec.authorizedBy === 'system' || rec.option === 'auto-restrict' || rec.sequence === 1) throw new Error('Only a decision a person made can be published; the starting record and automatic restrictions come from the configuration and the evidence.');
  const plan = rec.rolloutPlan ? Object.fromEntries(ROLLOUT_FIELDS.map((f) => [f.key, rec.rolloutPlan[f.key]]).filter(([, v]) => v !== undefined && v !== null && v !== '')) : null;
  return {
    schema: RECORD_SCHEMA,
    workspace: state.clientWorkspace.id,
    capabilityId: rec.capabilityId,
    recordId: rec.id,
    date: rec.date,
    option: rec.option,
    from: rec.previous.level,
    to: rec.next.level,
    by: rec.authorizedBy,
    byName: (rec.authorizedByAt || {}).name || (people(state)[rec.authorizedBy] || {}).name || rec.authorizedBy,
    rationale: rec.rationale,
    ...(rec.conditions ? { conditions: rec.conditions } : {}),
    ...(rec.expectedOutcomes && rec.expectedOutcomes.length ? { expectedOutcomes: rec.expectedOutcomes.map((o) => ({ metric: o.metric, target: o.target })) } : {}),
    ...(plan ? { rolloutPlan: plan } : {}),
    ...(rec.residualRisk ? { residualRisk: { level: rec.residualRisk.level, note: rec.residualRisk.note } } : {}),
  };
}

// Replay one published decision. Its date is the day it was made: the
// workspace's clock is set to it for the replay, then moved back to today.
export function replayPublished(state, entry) {
  if (!entry || entry.schema !== RECORD_SCHEMA) throw new Error(`Not a published record (schema must be "${RECORD_SCHEMA}").`);
  if (!state.clientWorkspace || entry.workspace !== state.clientWorkspace.id) throw new Error(`This record belongs to the "${entry.workspace}" workspace.`);
  const cap = getCapability(state, entry.capabilityId);
  if (!cap) throw new Error(`No capability "${entry.capabilityId}" in this workspace.`);
  if (cap.authority.level !== entry.from) throw new Error(`${entry.recordId} moved ${cap.name} from Level ${entry.from}, but it is at Level ${cap.authority.level} here.`);
  const today = state.today;
  let s = { ...state, today: entry.date };
  const id = entry.capabilityId;
  if (EXPANDING.has(entry.option) && !capData(s, id).decision.proposed) s = proposeAuthority(s, id, entry.to, { by: entry.by });
  s = selectDecision(s, id, entry.option);
  for (const [k, v] of Object.entries(entry.conditions || {})) s = setCondition(s, id, k, v);
  s = setRationale(s, id, entry.rationale);
  if (entry.residualRisk) s = setResidualRisk(s, id, entry.residualRisk);
  if (isExpansion(s, id, entry.option)) {
    (entry.expectedOutcomes || []).forEach((o, i) => { s = setOutcome(setOutcome(s, id, i, 'metric', o.metric), id, i, 'target', o.target); });
    for (const [k, v] of Object.entries(entry.rolloutPlan || {})) s = setRolloutField(s, id, k, v);
  }
  s = authorize(s, id, { by: entry.by });
  const rec = s.decisionRecords.at(-1);
  if (rec.next.level !== entry.to || rec.option !== entry.option) throw new Error(`${entry.recordId} replayed to Level ${rec.next.level} (${rec.option}), not Level ${entry.to} (${entry.option}).`);
  // The published copy is marked, with the id it had where it was made.
  const marked = { ...rec, published: { recordId: entry.recordId } };
  return { ...s, today: today > s.today ? today : s.today, decisionRecords: [...s.decisionRecords.slice(0, -1), marked] };
}

// Replay the committed records in order. Never throws: each is applied,
// already there, or refused with the reason, which the app shows.
export function applyPublishedRecords(state, files) {
  let s = state;
  const results = [];
  for (const { file, entry } of files) {
    if (!entry || !s.clientWorkspace || entry.workspace !== s.clientWorkspace.id) { results.push({ file, status: 'elsewhere' }); continue; }
    if (s.decisionRecords.some((r) => r.published && r.published.recordId === entry.recordId && r.capabilityId === entry.capabilityId)) { results.push({ file, status: 'already' }); continue; }
    try {
      s = replayPublished(s, entry);
      results.push({ file, status: 'applied' });
    } catch (e) {
      results.push({ file, status: 'refused', reason: e.message });
    }
  }
  return { state: s, results };
}

export const isPublished = (rec) => Boolean(rec && rec.published);
