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
import { externalSnapshot } from './external.js';
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

export function proposalStatus(state, capabilityId, id) {
  const d = capData(state, capabilityId).decision;
  if (d.proposed && d.proposalId === id) return 'open';
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
    requirementResults: reqs,
    targetResults: targets,
    readiness: { met: r.met, total: r.total },
    coverage: { text: coverageText(cov), sufficient: cov.sufficient, total: cov.total, gaps: cov.gaps.map((g) => ({ kind: g.kind, label: g.label, status: g.status })) },
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
export function freezeProposal(state, capabilityId, { level, by }) {
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

const KIND_WORDS = { contract: 'Rules (Boundaries)', criteria: 'Targets', requirements: 'Requirements', risk: 'Risk', stakeholders: 'People' };

// May the open Proposal be stale? Only what the recorded model already
// determines (#144): a newer version of anything it was reviewed against
// (Rules, Targets, Requirements, Risk, people), or a material change recorded
// after it opened. Requirement results that have moved since are listed as
// information, not counted as staleness (an open question for Paige, Q3).
// It never blocks: canAuthorize does not read it.
export function proposalStaleness(state, capabilityId, proposal = openAuthorityProposal(state, capabilityId)) {
  if (!proposal) return { stale: false, reasons: [], resultChanges: [] };
  const now = versionsInForce(state, capabilityId);
  const reasons = [];
  for (const k of VERSIONED_KINDS) {
    const then = proposal.versions[k] || 0;
    if ((now[k] || 0) > then) reasons.push({ kind: 'version', area: k, text: `${KIND_WORDS[k] || k} changed: v${then || 'none'} when proposed, v${now[k]} now.` });
  }
  const seen = new Set(proposal.materialChangesAtOpen || []);
  for (const m of materialChanges(state, capabilityId).filter((x) => !seen.has(x.id))) {
    reasons.push({ kind: 'material-change', id: m.id, text: `Material change recorded ${m.recordedOn}: ${m.description}` });
  }
  const nowReqs = new Map(requirementsNow(state, capabilityId).map((r) => [r.id, r]));
  const resultChanges = [];
  for (const r of proposal.requirementResults) {
    const n = nowReqs.get(r.id);
    if (!n) { resultChanges.push({ id: r.id, text: r.text, from: r.label, to: 'Removed' }); continue; }
    const to = n.result ? n.result.label : r.label;
    if (to !== r.label) resultChanges.push({ id: r.id, text: r.text, from: r.label, to });
  }
  for (const [id, n] of nowReqs) if (!proposal.requirementResults.some((r) => r.id === id)) resultChanges.push({ id, text: n.text, from: 'Not there', to: n.result ? n.result.label : '' });
  return { stale: reasons.length > 0, reasons, resultChanges };
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
