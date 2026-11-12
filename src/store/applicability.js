// v1 W1 (#182, Paige, 2026-11-09; docs/V1_RECONCILIATION.md): after a
// material change, the Owner reviews whether the evidence from before it
// still applies. One review per Requirement or Target row that the change
// affects (materialChangeImpact): the row's evidence observed before the
// change took effect.
//
// - Still applicable: the evidence counts again.
// - Partly applicable: kept as supporting context, with what is still
//   supported and what needs fresh evidence, but it doesn't count toward any
//   row's result (Paige: partly applicable evidence never counts on its own,
//   for every row).
// - No longer applicable: it doesn't count. Past Decisions keep what they
//   froze, and the classification alone never changes Authority.
// Until a row is reviewed, its evidence from before the change doesn't count
// either, and expansion is blocked (canAuthorize). Replacing a Proposal
// doesn't clear the block. Reviews are append-only; the latest per change and
// row stands, and History keeps every one.

import { getCapability, capData, updateCap, logEvent } from './state.js';
import { people, snapshotPerson, requireActive } from './people.js';
import { materialChanges } from './context.js';
import { materialChangeImpact } from './lifecycle.js';

export const APPLICABILITY = {
  applicable: 'Still applicable',
  partly: 'Partly applicable',
  'not-applicable': 'No longer applicable',
};
export const APPLICABILITY_REASON_MIN = 10;

const rowKey = (kind, id) => `${kind}:${id}`;
const cache = new WeakMap();

export function applicabilityReviews(state, capabilityId) {
  return capData(state, capabilityId).applicabilityReviews || [];
}

// Every material change with the rows it affects and each row's latest
// review; the rows still unreviewed; and, per row, the date before which its
// evidence doesn't count. Computed once per state.
export function applicabilityState(state, capabilityId) {
  let byCap = cache.get(state);
  if (!byCap) { byCap = new Map(); cache.set(state, byCap); }
  if (byCap.has(capabilityId)) return byCap.get(capabilityId);
  const changes = materialChanges(state, capabilityId);
  const empty = { changes: [], unresolved: [], cutoffs: new Map() };
  if (!changes.length) { byCap.set(capabilityId, empty); return empty; }
  const reviews = applicabilityReviews(state, capabilityId);
  const latest = new Map();
  for (const r of reviews) latest.set(`${r.changeId}|${rowKey(r.rowKind, r.rowId)}`, r);
  const cutoffs = new Map();
  const unresolved = [];
  const out = changes.map((change) => {
    const rows = materialChangeImpact(state, capabilityId, change).rows.map((row) => {
      const review = latest.get(`${change.id}|${rowKey(row.kind, row.id)}`) || null;
      const history = reviews.filter((r) => r.changeId === change.id && r.rowKind === row.kind && r.rowId === row.id);
      if (!review) unresolved.push({ changeId: change.id, ...row });
      if (!review || review.verdict !== 'applicable') {
        const k = rowKey(row.kind, row.id);
        if (!cutoffs.has(k) || cutoffs.get(k) < change.effectiveOn) cutoffs.set(k, change.effectiveOn);
      }
      return { ...row, review, history };
    });
    return { change, rows };
  });
  const result = { changes: out, unresolved, cutoffs };
  byCap.set(capabilityId, result);
  return result;
}

// The date before which a row's evidence doesn't count, or null.
export function excludedBefore(state, capabilityId, kind, id) {
  if (!materialChanges(state, capabilityId).length) return null;
  return applicabilityState(state, capabilityId).cutoffs.get(rowKey(kind, id)) || null;
}

export function unresolvedApplicability(state, capabilityId) {
  return applicabilityState(state, capabilityId).unresolved;
}

// What blocks an expansion because of unreviewed evidence, or null.
export function applicabilityBlocks(state, capabilityId) {
  const open = unresolvedApplicability(state, capabilityId);
  if (!open.length) return null;
  const owner = (people(state)[getCapability(state, capabilityId).owner] || {}).name || 'the Owner';
  return `After a material change, ${owner} reviews whether the earlier evidence still applies before authority expands. Not reviewed yet: ${open.map((r) => `${r.label} (${r.changeId})`).join('; ')}. Until then that evidence doesn't count.`;
}

// The Owner records whether a row's evidence from before a change still applies.
export function recordApplicability(state, capabilityId, { changeId, rowKind, rowId, verdict, reason, stillSupported, needsFresh, by } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  requireActive(state, by, 'review whether evidence still applies');
  if (by !== cap.owner) throw new Error(`Only the Owner, ${(people(state)[cap.owner] || { name: cap.owner }).name}, records whether evidence still applies after a material change. Reviewers can give their input to the Owner.`);
  const entry = applicabilityState(state, capabilityId).changes.find((c) => c.change.id === changeId);
  if (!entry) throw new Error(`Unknown material change: ${changeId}`);
  const row = entry.rows.find((r) => r.kind === rowKind && r.id === rowId);
  if (!row) throw new Error(`${changeId} doesn't affect that ${rowKind === 'target' ? 'Target' : 'Requirement'}: none of its evidence came before the change.`);
  if (!APPLICABILITY[verdict]) throw new Error('Choose still applicable, partly applicable or no longer applicable.');
  const why = String(reason || '').trim();
  if (why.length < APPLICABILITY_REASON_MIN) throw new Error('Say why, in a short sentence.');
  const supported = String(stillSupported || '').trim();
  const fresh = String(needsFresh || '').trim();
  if (verdict === 'partly' && (!supported || !fresh)) throw new Error('For partly applicable, say what the earlier evidence still supports and what needs fresh evidence.');
  const review = {
    id: `AR-${capabilityId}-${applicabilityReviews(state, capabilityId).length + 1}`,
    changeId, rowKind, rowId, rowLabel: row.label, verdict, reason: why,
    ...(verdict === 'partly' ? { stillSupported: supported, needsFresh: fresh } : {}),
    date: state.today, by, byAt: snapshotPerson(state, by),
  };
  const s = updateCap(state, capabilityId, (d) => ({ ...d, applicabilityReviews: [...(d.applicabilityReviews || []), review] }));
  const counts = verdict === 'applicable' ? 'It counts again.' : verdict === 'partly' ? 'It stays as supporting context and doesn\'t count toward the result.' : 'It no longer counts toward current results; past Decisions keep what they froze.';
  return logEvent(s, {
    kind: 'material-change',
    surfaced: true,
    title: `Evidence reviewed after ${changeId}: ${row.label}, ${APPLICABILITY[verdict].toLowerCase()}`,
    body: `${cap.name}: ${people(state)[by].name} judged the evidence from before ${entry.change.effectiveOn} ${APPLICABILITY[verdict].toLowerCase()} for "${row.label}". ${why} ${counts}`,
    capabilityId,
    link: `#/capabilities/${capabilityId}?tab=monitor`,
  });
}

// What is set aside for one row, display only (v1 wording, Paige,
// 2026-11-11): how many earlier results a material change keeps from
// counting, each change's state (one count, each reason), and how many
// imported results were measured under another configuration. null when
// nothing is set aside.
export function setAside(state, capabilityId, kind, id, otherConfig = 0) {
  const st = applicabilityState(state, capabilityId);
  const changes = [];
  let cutoff = null;
  let count = 0;
  for (const { change, rows } of st.changes) {
    const row = rows.find((r) => r.kind === kind && r.id === id);
    if (!row || (row.review && row.review.verdict === 'applicable')) continue;
    changes.push({ changeId: change.id, state: row.review ? row.review.verdict : 'pending' });
    // Everything before the latest such change is set aside, once.
    if (!cutoff || change.effectiveOn > cutoff) { cutoff = change.effectiveOn; count = row.before; }
  }
  if (!changes.length && !otherConfig) return null;
  return { count, changes, otherConfig };
}

const ASIDE_STATE = {
  pending: 'Earlier evidence needs review after a material change.',
  partly: 'Partly applicable. Supporting context only; not counted toward this result.',
  'not-applicable': 'No longer applicable.',
};
const results = (n) => `${n} earlier result${n === 1 ? '' : 's'}`;

// The note in words. One change: "2 earlier results await material-change
// review and are not counted." Several: one count, then each change's state.
export function setAsideNote(info) {
  const parts = [];
  if (info.changes.length === 1) {
    const c = info.changes[0];
    parts.push(c.state === 'pending'
      ? `${results(info.count)} await${info.count === 1 ? 's' : ''} material-change review (${c.changeId}) and ${info.count === 1 ? 'is' : 'are'} not counted.`
      : `${results(info.count)} ${info.count === 1 ? 'is' : 'are'} not counted after ${c.changeId}: ${ASIDE_STATE[c.state]}`);
  } else if (info.changes.length) {
    parts.push(`${results(info.count)} ${info.count === 1 ? 'is' : 'are'} not counted: ${info.changes.map((c) => `${c.changeId}: ${ASIDE_STATE[c.state]}`).join(' ')}`);
  }
  if (info.otherConfig) parts.push(`${info.otherConfig} imported result${info.otherConfig === 1 ? ' was' : 's were'} measured under another configuration and ${info.otherConfig === 1 ? 'is' : 'are'} set aside.`);
  return parts.join(' ');
}

