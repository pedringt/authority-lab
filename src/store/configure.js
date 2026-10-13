// Configure evidence (#126): the product person says which source's metric
// judges each target and decision requirement. The comparison and number come
// from the row's own wording, so the words a person reads and the check
// software runs can't disagree. Mapping is a change to how the bar is
// measured, so it goes through the usual paths: a direct save before any
// results exist, a proposed change with approval after.

import { getCapability } from './state.js';
import { current } from './selectors.js';
import { saveCriteria, criteriaLocked, barFromWords } from './evidence.js';
import { proposeAmendment } from './proposals.js';
import { measureProblems } from './measures.js';

export { barFromWords };

export const MEASURE_STAT_WORDS = {
  rate: 'Share that passed (%)',
  'fail-rate': 'Share that failed (%)',
  share: 'Events as a share of cases (%)',
  count: 'Number of events',
  value: 'The number itself',
  sample: 'Number of cases',
};

// Map (or unmap, with measure: null) one row. Returns the new state.
export function mapEvidence(state, capabilityId, { rowKind, rowId, measure, by, reason } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error('This capability no longer exists.');
  if (!['target', 'requirement'].includes(rowKind)) throw new Error('Choose a target or a decision requirement.');
  const criteria = current(state, capabilityId, 'criteria');
  const requirements = current(state, capabilityId, 'requirements');
  const rows = rowKind === 'target' ? criteria : requirements;
  const row = rows.find((r) => r.id === rowId);
  if (!row) throw new Error('That row no longer exists. Reload the page.');
  const words = rowKind === 'target' ? row.target : row.text;
  const label = rowKind === 'target' ? row.name : row.text;
  let next = null;
  if (measure) {
    const bar = barFromWords(words);
    if (!bar) throw new Error(`"${label}" doesn't say a number to check, such as "≥ 90%" or "at most 0". Change its wording first, then choose its evidence.`);
    const clean = Object.fromEntries(Object.entries({ source: measure.source || undefined, metric: (measure.metric || '').trim() || undefined, segment: (measure.segment || '').trim() || undefined, stat: measure.stat, op: bar.op, value: bar.value, minSample: measure.minSample ? Number(measure.minSample) : undefined, kind: measure.kind || undefined }).filter(([, v]) => v !== undefined));
    const problems = measureProblems(clean);
    if (problems.length) throw new Error(problems.join(' '));
    next = clean;
  } else if (!row.measure) {
    throw new Error(`"${label}" has no evidence mapped, so there is nothing to remove.`);
  }
  const edit = (list) => list.map((r) => (r.id === rowId ? { ...r, measure: next } : r));
  const value = rowKind === 'target' ? { criteria: edit(criteria), requirements } : { criteria, requirements: edit(requirements) };
  const why = String(reason || '').trim();
  if (!criteriaLocked(state, capabilityId)) {
    return saveCriteria(state, capabilityId, { ...value, by, reason: why || `Evidence ${next ? 'mapped' : 'unmapped'} for "${label}".` });
  }
  // After results, how a row is measured changes only with approval.
  if (why.length < 10) throw new Error('Results already exist, so changing which evidence judges this row needs approval. Say why (a sentence or more).');
  return proposeAmendment(state, capabilityId, 'criteria', { value, by, reason: why });
}
