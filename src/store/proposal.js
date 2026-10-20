// Product reset, Phase 4 (#144): the Proposal as a frozen review object.
//
// A Proposal is one concrete proposed authority change, created only when a
// person proposes it (proposeAuthority). At that moment it freezes what a
// reviewer needs to answer "What changes if I approve this?": current and
// proposed authority, what becomes newly permitted, what still needs a
// person, what stays prohibited, the Boundaries and how each is enforced,
// Requirement and Target results with their reasons, coverage, gaps,
// Unknowns and conflicts, Reviewer and Stakeholder positions, the initial
// Risk, and the versions and provenance it rests on. Later evidence or
// configuration never rewrites it. A Proposal is not a Decision.
//
// Proposals are append-only, in capabilityData.authorityProposals. Whether
// one is open, decided or closed is derived (from the open decision and the
// records), never written back onto the frozen object.

import { getCapability, capData } from './state.js';
import { current, versionsInForce, readiness, levelName } from './selectors.js';
import { VERSIONED_KINDS } from './state.js';
import { requirementsNow, targetsNow, evidenceCoverage, coverageText, MEASURE_WORDS, RESULT_WORDS } from './measures.js';
import { boundaries, peopleModel } from './boundaries.js';
import { riskView } from './risk.js';
import { materialChanges, baselineNow, contextVersions } from './context.js';
import { externalSnapshot, measurementText } from './external.js';
import { rowCoverage } from './measures.js';
import { TESTS_SOURCE } from './sources.js';
import { outcomesNow, incidentsFor, incidentStatus } from './lightweight.js';
import { people, snapshotPerson } from './people.js';
import { peopleRoleOf, STANCES } from './proposals.js';
import { LEVEL_PLAIN } from './overview.js';

const deepFreeze = (o) => { Object.values(o).forEach((v) => { if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v); }); return Object.freeze(o); };
const clone = (x) => JSON.parse(JSON.stringify(x));

export function authorityProposals(state, capabilityId) {
  return capData(state, capabilityId).authorityProposals || [];
}

export function findAuthorityProposal(state, capabilityId, id) {
  return authorityProposals(state, capabilityId).find((p) => p.id === id) || null;
}

// The open decision's Proposal. Null when no decision is open, or when the
// open decision predates frozen Proposals (the seeded demo's pending
// decision): that one is shown as opened before snapshots existed, never
// given a snapshot after the fact.
export function openAuthorityProposal(state, capabilityId) {
  const d = capData(state, capabilityId).decision;
  if (!d.proposed || !d.proposalId) return null;
  return findAuthorityProposal(state, capabilityId, d.proposalId);
}

// A Proposal replaced because it was stale (#144, Q3): the closure is its
// own append-only entry; the frozen Proposal itself never changes.
export function proposalClosures(state, capabilityId) {
  return capData(state, capabilityId).proposalClosures || [];
}

export function proposalStatus(state, capabilityId, id) {
  const d = capData(state, capabilityId).decision;
  if (d.proposed && d.proposalId === id) return 'open';
  if (proposalClosures(state, capabilityId).some((c) => c.proposalId === id)) return 'replaced';
  const rec = state.decisionRecords.find((r) => r.proposalId === id);
  if (rec) return 'decided';
  return 'closed';
}

const STANCE_WORDS = Object.fromEntries(STANCES);

// The conditions a person reviews, read from the store as they are now. Used
// to freeze a Proposal when it is opened and a Decision when it is recorded,
// so both say the same things in the same shape.
export function reviewConditions(state, capabilityId) {
  const reqs = requirementsNow(state, capabilityId).map((r) => ({
    id: r.id,
    text: r.text,
    status: r.result ? r.result.status : (r.met ? 'met' : 'no-evidence'),
    label: r.result ? r.result.label : (r.met ? RESULT_WORDS.met : RESULT_WORDS['no-evidence']),
    why: (r.result && r.result.why) || r.gap || '',
    current: r.current || '',
  }));
  const targets = targetsNow(state, capabilityId).map((t) => ({
    id: t.id,
    name: t.name,
    goal: t.bar === 'needs-decision' ? 'No bar set yet' : t.target || '',
    status: t.status || 'pending',
    label: MEASURE_WORDS[t.status] || t.status || MEASURE_WORDS.pending,
    current: t.current || '',
    ...(t.requirement ? { requirement: t.requirement } : {}),
  }));
  const cov = evidenceCoverage(state, capabilityId);
  const b = boundaries(state, capabilityId);
  const pm = peopleModel(state, capabilityId);
  const roster = people(state);
  const positions = current(state, capabilityId, 'stakeholders').map((st) => ({
    person: st.person,
    name: (roster[st.person] || {}).name || st.person,
    team: st.team || '',
    role: peopleRoleOf(st) === 'reviewer' ? 'Reviewer' : 'Stakeholder',
    stance: st.stance || 'undecided',
    stanceLabel: STANCE_WORDS[st.stance] || STANCE_WORDS.undecided,
    position: st.position || '',
    quote: st.quote || '',
    date: st.date || null,
  }));
  const r = readiness(state, capabilityId);
  return {
    evidence: evidenceProvenance(state, capabilityId),
    requirementResults: reqs,
    targetResults: targets,
    readiness: { met: r.met, total: r.total },
    coverage: {
      text: coverageText(cov),
      sufficient: cov.sufficient,
      total: cov.total,
      gaps: cov.gaps.map((g) => ({ kind: g.kind, label: g.label, status: g.status })),
      rows: [...cov.requirements, ...cov.targets].map((x) => ({ kind: x.kind, id: x.id, label: x.label, status: x.status, state: coverageState(x.status) })),
    },
    boundaries: {
      lines: b.categories.flatMap((c) => c.lines.map((l) => ({ category: c.label || c.key, section: l.section, text: l.text, enforcement: l.enforcement }))),
      restrictions: b.restrictions.map((x) => ({ text: x.text, enforcement: x.enforcement })),
      actsThroughGate: b.actsThroughGate,
    },
    owner: pm.owner,
    ownerAt: pm.owner ? snapshotPerson(state, pm.owner) : null,
    positions,
    risk: riskView(state, capabilityId),
  };
}

// Coverage in the terms that matter to a decision (Paige, 2026-10-19, Q3):
// sufficient, insufficient, stale, conflicting, missing, plus Unknown and
// needs a decision. A judged or incident-bearing row counts as sufficient
// evidence, as evidenceCoverage counts it.
const COVERAGE_STATE = { covered: 'sufficient', judged: 'sufficient', incident: 'sufficient', stale: 'stale', insufficient: 'insufficient', conflicting: 'conflicting', unknown: 'unknown', 'no-data': 'missing', 'no-source': 'missing', 'needs-decision': 'needs-decision' };
const COVERAGE_WORDS = { sufficient: 'sufficient', stale: 'stale', insufficient: 'insufficient', conflicting: 'conflicting', unknown: 'judged Unknown', missing: 'missing', 'needs-decision': 'needs a decision' };
export const coverageState = (status) => COVERAGE_STATE[status] || status;

// Which evidence produced each result (Paige, 2026-10-19): for every
// Requirement and Target, the results that judged it and the evidence items
// behind them (including each item in a combined result), the judgments that
// decided a person-judged row, the incidents that blocked one, and the Target
// a Requirement is judged through. Items, judgments, test outcomes and
// incidents are listed once, by id, with what's needed to say where each came
// from. Imported evidence keeps its own snapshot (externalSnapshot) too.
export function evidenceProvenance(state, capabilityId) {
  const d = capData(state, capabilityId);
  const used = new Set();
  const judgmentIds = new Set();
  const incidentIds = new Set();
  let testsUsed = false;
  const resultsOf = (j) => (j && j.results ? j.results : j && j.evidenceId ? [j] : []).map((x) => {
    (x.itemIds || []).forEach((id) => used.add(id));
    return { evidenceId: x.evidenceId, label: x.label || '', date: x.date || null, kind: x.kind || null, status: x.status, text: x.text || '', sample: x.sample ?? null, stale: Boolean(x.stale), itemIds: [...(x.itemIds || [])], combined: x.combined || 1 };
  });
  const rowRefs = (kind, row) => {
    const refs = { kind, id: row.id, label: kind === 'requirement' ? row.text : row.name, results: [], judgments: [], incidents: [], targets: [] };
    if (row.measure) {
      if (row.measure.source === TESTS_SOURCE) testsUsed = true;
      refs.source = row.measure.source || null;
      refs.results = resultsOf(row.judged);
    }
    (row.judgments || []).forEach((id) => { judgmentIds.add(id); refs.judgments.push(id); });
    (row.incidentsOpen || []).forEach((id) => { incidentIds.add(id); refs.incidents.push(id); });
    if (kind === 'requirement' && !row.measure) refs.targets = targetsNow(state, capabilityId).filter((t) => t.requirement === row.id && t.bar !== 'needs-decision').map((t) => t.id);
    return refs;
  };
  const rows = [
    ...requirementsNow(state, capabilityId).map((r) => rowRefs('requirement', r)),
    ...targetsNow(state, capabilityId).map((t) => rowRefs('target', t)),
  ];
  const items = d.evidence.filter((e) => used.has(e.id)).map((e) => ({
    id: e.id,
    from: e.from || null,
    source: e.source || null,
    sourceId: e.sourceId || null,
    metric: e.metric || '',
    value: e.measure ? measurementText(e.measure) : e.value || '',
    date: e.date || null,
    ...(e.recordedBy ? { recordedBy: e.recordedBy.name } : {}),
    ...(e.provenance ? { file: { name: e.provenance.fileName, label: e.provenance.sourceLabel, importedOn: e.provenance.importedOn, importedBy: (e.provenance.importedBy || {}).name || null, perCase: Boolean(e.provenance.perCase), cases: e.provenance.cases ?? null, firstDate: e.provenance.firstDate || null, lastDate: e.provenance.lastDate || null } } : {}),
    ...(e.external ? { importId: e.external.importId, kind: e.external.kind, reference: e.external.reference || null } : {}),
    ...(e.demo ? { demo: true } : {}),
  }));
  const judgments = (d.judgments || []).filter((j) => judgmentIds.has(j.id)).map((j) => ({ id: j.id, requirementId: j.requirementId, verdict: j.verdict, rationale: j.rationale, reference: j.reference || null, role: j.role, date: j.date, by: j.by, byName: (j.byAt || {}).name || j.by }));
  const outcomes = testsUsed ? outcomesNow(state, capabilityId).filter((x) => x.outcome).map(({ outcome: o }) => ({ id: o.id, scenarioId: o.scenarioId, scenarioName: o.scenarioName, result: o.result, ...(o.severity ? { severity: o.severity } : {}), date: o.date, byName: (o.byAt || {}).name || o.by, reference: o.reference || null })) : [];
  const incidents = incidentsFor(state, capabilityId).filter((x) => incidentIds.has(x.id)).map((x) => ({ id: x.id, severity: x.severity, status: incidentStatus(x), what: x.what, date: x.date }));
  return { rows, items, judgments, outcomes, incidents };
}

// The words a reviewer needs for the change itself. Newly permitted is what
// the proposed level allows that the current one doesn't; the Rules' "may"
// lines are listed separately, because the Rules don't change with the level.
// What still needs a person and what stays prohibited come from the Rules as
// they are now. Nothing here is a judgment of the change.
function changeText(state, capabilityId, from, to) {
  const contract = current(state, capabilityId, 'contract');
  const lines = (k) => (contract[k] || []).slice();
  const personLevel = to.level <= 2 ? [`At ${levelName(to.level)} a person still ${to.level === 2 ? 'approves every action before anything happens' : 'decides and acts on every case'}.`] : [];
  return {
    now: LEVEL_PLAIN[from.level] || '',
    proposed: LEVEL_PLAIN[to.level] || '',
    newlyPermitted: [LEVEL_PLAIN[to.level] || `Level ${to.level}`],
    withinRules: lines('may'),
    stillNeedsPerson: [...personLevel, ...lines('mustAsk'), ...lines('escalation')],
    prohibited: lines('mustNever'),
  };
}

// Freeze a new Proposal. Called by proposeAuthority after all its checks;
// never on its own, and never by software deciding to propose.
export function freezeProposal(state, capabilityId, { level, by, replaces = null }) {
  const cap = getCapability(state, capabilityId);
  const from = { ...cap.authority };
  const to = { level, limited: false };
  const all = state.capabilities.reduce((n, c) => n + authorityProposals(state, c.id).length, 0);
  const id = `AP-${String(all + 1).padStart(2, '0')}`;
  const base = baselineNow(state, capabilityId);
  return deepFreeze(clone({
    id,
    capabilityId,
    openedAt: state.today,
    proposedBy: by,
    proposedByAt: snapshotPerson(state, by),
    ...(replaces ? { replaces } : {}),
    from,
    to,
    change: changeText(state, capabilityId, from, to),
    ...reviewConditions(state, capabilityId),
    versions: versionsInForce(state, capabilityId),
    contextVersion: contextVersions(state).length,
    baselineVersion: base.version || 0,
    materialChangesAtOpen: materialChanges(state, capabilityId).map((m) => m.id),
    evidenceAtOpen: capData(state, capabilityId).evidence.length,
    externalEvidence: externalSnapshot(state, capabilityId),
  }));
}

const namesText = (positions) => (positions.length ? positions.map((p) => `${p.name} (${p.role})`).join(', ') : 'no one');
const KIND_WORDS = { contract: 'Rules (Boundaries)', criteria: 'Targets', requirements: 'Requirements', risk: 'Risk', stakeholders: 'People' };

// Is the open Proposal stale? (Paige, 2026-10-19, Q3.) It is when, since it
// was frozen:
// - a versioned object it was reviewed against has a newer version (Rules,
//   Targets, Requirements, Risk); for people, only a change to who is named
//   or their role (Reviewer or Stakeholder), never a position;
// - a material change was recorded;
// - a Requirement or Target result changed (Met to Not met, Unknown to Met…);
// - a row's coverage changed state (sufficient, insufficient, stale,
//   conflicting, missing…).
// More evidence that leaves every result and coverage state as it was is
// not staleness. A stale Proposal blocks an expansion (canAuthorize) and is
// replaced, never refreshed in place (replaceProposal).
export function proposalStaleness(state, capabilityId, proposal = openAuthorityProposal(state, capabilityId)) {
  if (!proposal) return { stale: false, reasons: [], resultChanges: [] };
  const now = versionsInForce(state, capabilityId);
  const live = reviewConditions(state, capabilityId);
  const reasons = [];
  for (const k of VERSIONED_KINDS) {
    const then = proposal.versions[k] || 0;
    if (!((now[k] || 0) > then)) continue;
    // People: only who is named, and as Reviewer or Stakeholder, counts.
    // A position, stance or reasoning given after the Proposal opened is part
    // of reviewing it, not a change to what it describes (Paige, 2026-10-19).
    if (k === 'stakeholders') {
      const roles = (list) => list.map((p) => `${p.person}:${p.role}`).sort().join('|');
      if (roles(proposal.positions || []) === roles(live.positions)) continue;
      reasons.push({ kind: 'people', area: k, text: `Who is named, or as what, changed: ${namesText(proposal.positions || [])} when proposed; ${namesText(live.positions)} now.` });
      continue;
    }
    reasons.push({ kind: 'version', area: k, text: `${KIND_WORDS[k] || k} changed: v${then || 'none'} when proposed, v${now[k]} now.` });
  }
  const seen = new Set(proposal.materialChangesAtOpen || []);
  for (const m of materialChanges(state, capabilityId).filter((x) => !seen.has(x.id))) {
    reasons.push({ kind: 'material-change', id: m.id, text: `Material change recorded ${m.recordedOn}: ${m.description}` });
  }
  const resultChanges = [];
  const compare = (kind, thenRows, nowRows, name) => {
    const nowById = new Map(nowRows.map((r) => [r.id, r]));
    for (const r of thenRows) {
      const n = nowById.get(r.id);
      if (n && n.status !== r.status) resultChanges.push({ kind, id: r.id, text: name(r), from: r.label, to: n.label });
    }
  };
  compare('requirement', proposal.requirementResults, live.requirementResults, (r) => r.text);
  compare('target', proposal.targetResults || [], live.targetResults, (r) => r.name);
  for (const c of resultChanges) reasons.push({ kind: 'result', id: c.id, text: `${c.kind === 'target' ? 'Target' : 'Requirement'} "${c.text}" changed: ${c.from} when proposed, ${c.to} now.` });
  const thenCov = (proposal.coverage && proposal.coverage.rows) || [];
  const nowCov = new Map(live.coverage.rows.map((r) => [`${r.kind}:${r.id}`, r]));
  const coverageChanges = [];
  for (const r of thenCov) {
    const n = nowCov.get(`${r.kind}:${r.id}`);
    if (n && n.state !== r.state) coverageChanges.push({ kind: r.kind, id: r.id, text: r.label, from: r.state, to: n.state });
  }
  for (const c of coverageChanges) reasons.push({ kind: 'coverage', id: c.id, text: `Coverage of "${c.text}" changed: ${COVERAGE_WORDS[c.from] || c.from} when proposed, ${COVERAGE_WORDS[c.to] || c.to} now.` });
  return { stale: reasons.length > 0, reasons, resultChanges, coverageChanges };
}

// Positions differ when two people have taken different stances. Shown, never
// averaged or resolved into one answer.
export function positionsDiffer(positions) {
  return new Set((positions || []).filter((p) => p.stance && p.stance !== 'undecided').map((p) => p.stance)).size > 1;
}

// What a reviewer still doesn't know: rows that aren't Met, Targets with no
// result, Unknown overall Risk. Read from a frozen snapshot or a live one.
export function proposalGaps(snap) {
  const rows = (snap.requirementResults || []).filter((r) => r.status !== 'met').map((r) => ({ kind: 'requirement', label: r.text, result: r.label, why: r.why }));
  const targets = (snap.targetResults || []).filter((t) => t.status !== 'pass').map((t) => ({ kind: 'target', label: t.name, result: t.label, why: t.current }));
  const risk = snap.risk && snap.risk.overall === 'Unknown' ? [{ kind: 'risk', label: 'Overall Risk', result: 'Unknown', why: snap.risk.why }] : [];
  return [...rows, ...targets, ...risk];
}
