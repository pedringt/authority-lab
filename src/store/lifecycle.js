// Product reset, Phase 5 (#147): is the current Authority still justified?
//
// Monitor compares the Decision in force (its frozen snapshot, since #144)
// with current conditions, deterministically, and says what changed and what
// it means in plain words. Nothing here changes Authority: automatic
// restrictions stay where they were (monitoring.js), and every other change
// is a person's Decision. Nothing here scores anything.

import { getCapability, capData } from './state.js';
import { reviewConditions, evidenceProvenance } from './proposal.js';
import { materialChanges, MATERIAL_CHANGE_AREAS } from './context.js';
import { monitoringStatus, reviewNeeded } from './monitoring.js';
import { gateEvents, categoryOf } from './gatelog.js';
import { expectedVsActual } from './value.js';
import { adoptionSignals } from './adoption.js';
import { openCriticalIncidents, incidentsFor, incidentStatus } from './lightweight.js';
import { levelName } from './selectors.js';

// The plain-language states, from least to most serious. No score: the
// state is the most serious kind of change found, and every change says why.
export const JUSTIFICATION_STATES = {
  supported: 'Current Authority still supported',
  attention: 'Needs attention',
  investigate: 'Investigation needed',
  unjustified: 'Authority may no longer be justified',
  restricted: 'Restricted automatically',
};
const RANK = { info: 0, attention: 1, investigate: 2, unjustified: 3 };

// The Decision in force: the newest record for the capability (a person's, or
// an automatic restriction). `basis` is the newest person's Decision with a
// frozen snapshot to compare against; older records have none.
export function decisionInForce(state, capabilityId) {
  const recs = state.decisionRecords.filter((r) => r.capabilityId === capabilityId);
  const record = recs.at(-1) || null;
  const person = recs.filter((r) => r.authorizedBy !== 'system').at(-1) || null;
  const basis = person && person.reviewed ? person : null;
  // No snapshot to compare against: the starting record, or a Decision
  // recorded before snapshots existed.
  return { record, basis, legacy: Boolean(record && !basis) };
}

// Material changes recorded since the Decision in force. A record written
// since #147 lists the changes it knew of; an older one is compared by date,
// counting a change recorded the same day as since (shown rather than hidden).
export function materialChangesSince(state, capabilityId, record) {
  const all = materialChanges(state, capabilityId);
  if (!record) return all;
  if (record.materialChangesAtDecision) return all.filter((m) => !record.materialChangesAtDecision.includes(m.id));
  return all.filter((m) => m.recordedOn >= record.date);
}

// Which earlier evidence a material change may affect (#147). Deterministic
// and date-based only: for every Requirement and Target, the evidence behind
// its current result that was observed before the change took effect. That
// evidence "may need new evidence", never "failed" or "invalid": which kinds
// of change invalidate which sources isn't configured (an open question for
// Paige), and imported evidence measured under another configuration is
// already set aside by its own standing (external.js).
export function materialChangeImpact(state, capabilityId, change) {
  const ev = evidenceProvenance(state, capabilityId);
  const dated = (r) => [
    ...r.results.flatMap((x) => x.itemIds.map((id) => (ev.items.find((i) => i.id === id) || {}).date || x.date)),
    ...r.judgments.map((id) => (ev.judgments.find((j) => j.id === id) || {}).date),
    ...(r.source === 'authority-lab-tests' ? ev.outcomes.map((o) => o.date) : []),
  ].filter(Boolean);
  const rows = ev.rows.map((r) => {
    const dates = dated(r);
    if (!dates.length) return null;
    const before = dates.filter((d) => d < change.effectiveOn).length;
    if (!before) return null;
    return { kind: r.kind, id: r.id, label: r.label, before, after: dates.length - before, onlyBefore: before === dates.length };
  }).filter(Boolean);
  return { change, rows };
}

const changeOf = (severity, kind, text, extra = {}) => ({ severity, kind, text, ...extra });

// What changed since the Decision in force, compared with its frozen snapshot
// where there is one. Each change carries a severity:
// - unjustified: a Requirement or Target that was Met is now Not met;
// - investigate: a result is now Conflicting, a critical incident is open, a
//   rule incident awaits review, or a restriction rule reads over its limit;
// - attention: any other result or coverage change for the worse, stale
//   evidence, a material change, a position change or disagreement, an
//   attempt at something never allowed, a rollout goal missed on real
//   numbers, an adoption warning;
// - info: new evidence, improvements, people's approvals and overrides.
// (The mapping is documented for Paige to confirm, #147 question 2.)
export function changesSinceDecision(state, capabilityId) {
  const { record, basis, legacy } = decisionInForce(state, capabilityId);
  const since = record ? record.date : null;
  const live = reviewConditions(state, capabilityId);
  const out = [];
  if (basis && basis.reviewed) {
    const then = basis.reviewed;
    const results = (kind, thenRows, nowRows, name, met) => {
      const now = new Map(nowRows.map((r) => [r.id, r]));
      for (const r of thenRows) {
        const n = now.get(r.id);
        if (!n || n.status === r.status) continue;
        const sev = met(r.status) && (n.status === 'not-met' || n.status === 'fail') ? 'unjustified'
          : n.status === 'conflicting' ? 'investigate'
            : met(n.status) ? 'info' : 'attention';
        out.push(changeOf(sev, 'result', `${kind === 'target' ? 'Target' : 'Requirement'} "${name(r)}": ${r.label} when decided, ${n.label} now.`, { rowKind: kind, id: r.id }));
      }
    };
    results('requirement', then.requirementResults, live.requirementResults, (r) => r.text, (s) => s === 'met');
    results('target', then.targetResults || [], live.targetResults, (r) => r.name, (s) => s === 'pass');
    const nowCov = new Map(live.coverage.rows.map((r) => [`${r.kind}:${r.id}`, r]));
    for (const r of (then.coverage && then.coverage.rows) || []) {
      const n = nowCov.get(`${r.kind}:${r.id}`);
      if (!n || n.state === r.state) continue;
      out.push(changeOf(n.state === 'sufficient' ? 'info' : 'attention', 'coverage', `Coverage of "${r.label}": ${r.state} when decided, ${n.state} now.`, { rowKind: r.kind, id: r.id }));
    }
    const nowPos = new Map(live.positions.map((p) => [p.person, p]));
    for (const p of then.positions || []) {
      const n = nowPos.get(p.person);
      if (n && n.stance !== p.stance) out.push(changeOf('attention', 'position', `${p.name} (${n.role}): ${p.stanceLabel} when decided, ${n.stanceLabel} now.`));
    }
    const thenItems = new Set(((then.evidence || {}).items || []).map((i) => i.id));
    const fresh = capData(state, capabilityId).evidence.filter((e) => (e.external || e.from === 'manual' || e.from === 'uploaded') && !thenItems.has(e.id) && e.date >= since);
    if (fresh.length) out.push(changeOf('info', 'new-evidence', `${fresh.length} new evidence result${fresh.length === 1 ? '' : 's'} since the Decision in force.`));
  }
  // Without a snapshot (a starting record, or a Decision made before #144)
  // there is nothing to compare results with. Requirements are the bar for
  // the next level, so one not met now says nothing about the current
  // Authority on its own; only the signals below, which stand on their own,
  // are shown.
  for (const r of live.coverage.rows.filter((x) => x.state === 'stale')) {
    if (!out.some((c) => c.kind === 'coverage' && c.id === r.id)) out.push(changeOf('attention', 'stale', `"${r.label}" rests on stale evidence: it still counts, but may no longer describe today.`, { rowKind: r.kind, id: r.id }));
  }
  if (new Set(live.positions.map((p) => p.stance).filter((s) => s && s !== 'undecided')).size > 1) out.push(changeOf('attention', 'disagreement', 'Reviewers and Stakeholders don\'t agree on how much autonomy is right.'));
  for (const m of materialChangesSince(state, capabilityId, record)) {
    out.push(changeOf('attention', 'material-change', `Material change (${m.areas.map((a) => MATERIAL_CHANGE_AREAS[a].toLowerCase()).join(', ')}), effective ${m.effectiveOn}: ${m.description} Earlier evidence may need revalidating.`, { changeId: m.id }));
  }
  for (const x of openCriticalIncidents(state, capabilityId)) out.push(changeOf('investigate', 'incident', `Open critical incident ${x.id}: ${x.what}`));
  for (const x of incidentsFor(state, capabilityId).filter((i) => i.severity !== 'critical' && incidentStatus(i) !== 'resolved' && since && i.recordedOn >= since)) out.push(changeOf('attention', 'incident', `Open ${x.severity} incident ${x.id}: ${x.what}`));
  const need = reviewNeeded(state, capabilityId);
  for (const x of need.incidents) out.push(changeOf('investigate', 'rule-incident', `A safety limit was crossed on ${x.date} ("${x.rule}"), awaiting review.`));
  const st = monitoringStatus(state, capabilityId);
  for (const r of st.rules.filter((x) => x.crossed)) out.push(changeOf('investigate', 'limit', `"${r.text}" reads over its limit.`));
  const events = since ? gateEvents(state, capabilityId).filter((e) => e.date >= since && e.source !== 'seed') : [];
  const never = events.filter((e) => e.actor === 'ai' && e.rule && e.rule.kind === 'must-never').length;
  if (never) out.push(changeOf('attention', 'boundary', `${never} attempt${never === 1 ? '' : 's'} at something never allowed, all blocked.`));
  const count = (c) => events.filter((e) => categoryOf(e) === c).length;
  const overridden = count('overridden');
  const approved = count('approved');
  const blocked = count('blocked') - never;
  if (overridden || approved || blocked) out.push(changeOf('info', 'operation', [approved ? `${approved} needs-a-person action${approved === 1 ? '' : 's'} approved by a person` : null, overridden ? `${overridden} overridden (rejected) by a person` : null, blocked ? `${blocked} other action${blocked === 1 ? '' : 's'} blocked by the rules` : null].filter(Boolean).join('; ') + '.'));
  const v = expectedVsActual(state, capabilityId);
  for (const r of (v.rows || []).filter((x) => x.status === 'not-met' && x.judged)) out.push(changeOf('attention', 'impact', `Rollout goal "${r.metric}" not met on real numbers: ${r.actualText} against ${r.target}.`));
  for (const a of adoptionSignals(state, capabilityId)) out.push(changeOf('attention', 'adoption', `${a.title}${a.simulated ? ' (simulated)' : ''}.`));
  return { record, basis, legacy, changes: out };
}

// The answer to "Is the current Authority still justified?".
export function justification(state, capabilityId) {
  const cap = getCapability(state, capabilityId);
  const d = capData(state, capabilityId);
  const { record, basis, legacy, changes } = changesSinceDecision(state, capabilityId);
  const restricted = Boolean(d.reviewRequired && d.monitoring && d.monitoring.breached);
  const worst = changes.reduce((w, c) => (RANK[c.severity] > RANK[w] ? c.severity : w), 'info');
  const key = restricted ? 'restricted' : worst === 'info' ? 'supported' : worst;
  return {
    key,
    label: JUSTIFICATION_STATES[key],
    authority: { ...cap.authority, name: levelName(cap.authority.level) },
    record,
    basis,
    legacy,
    restricted,
    reviewLock: Boolean(d.reviewRequired),
    changes,
    materialImpact: materialChangesSince(state, capabilityId, record).map((m) => materialChangeImpact(state, capabilityId, m)),
  };
}

