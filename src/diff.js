// A small structural diff for versioned objects: arrays of strings, arrays of
// objects with ids, plain objects and primitives. Returns a flat list of
// changes with a readable path, for the amendment before/after view.

function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function show(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(show).join('; ');
  if (isObj(v)) return Object.entries(v).map(([k, x]) => `${k}: ${show(x)}`).join(', ');
  return String(v);
}
function label(item) {
  if (isObj(item)) return item.name || item.text || item.team || item.id || show(item);
  return show(item);
}

export function diffValues(before, after, path = '') {
  const changes = [];
  if (Array.isArray(before) && Array.isArray(after)) {
    const keyed = before.every((x) => isObj(x) && x.id) && after.every((x) => isObj(x) && x.id);
    if (keyed) {
      const b = new Map(before.map((x) => [x.id, x]));
      const a = new Map(after.map((x) => [x.id, x]));
      for (const [id, x] of b) {
        if (!a.has(id)) changes.push({ path: join(path, label(x)), type: 'removed', before: show(x), after: '' });
        else changes.push(...diffValues(x, a.get(id), join(path, label(x))));
      }
      for (const [id, x] of a) if (!b.has(id)) changes.push({ path: join(path, label(x)), type: 'added', before: '', after: show(x) });
      return changes;
    }
    const bs = before.map(show);
    const as = after.map(show);
    bs.forEach((x, i) => { if (!as.includes(x)) changes.push({ path, type: 'removed', before: show(before[i]), after: '' }); });
    as.forEach((x, i) => { if (!bs.includes(x)) changes.push({ path, type: 'added', before: '', after: show(after[i]) }); });
    return changes;
  }
  if (isObj(before) && isObj(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    for (const k of keys) {
      if (!(k in after)) changes.push({ path: join(path, k), type: 'removed', before: show(before[k]), after: '' });
      else if (!(k in before)) changes.push({ path: join(path, k), type: 'added', before: '', after: show(after[k]) });
      else changes.push(...diffValues(before[k], after[k], join(path, k)));
    }
    return changes;
  }
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    changes.push({ path, type: 'changed', before: show(before), after: show(after) });
  }
  return changes;
}

function join(path, k) { return path ? `${path} › ${k}` : String(k); }

export const FIELD_LABELS = {
  may: 'AI may', mustAsk: 'AI must ask', mustNever: 'AI must never', escalation: 'Escalation conditions', autoRestriction: 'Automatic restriction conditions',
  impact: 'Impact', reversibility: 'Reversibility', exposure: 'Exposure', failureTypes: 'Failure types', note: 'Note',
  target: 'Target', current: 'Current', status: 'Status', name: 'Name', text: 'Requirement', met: 'Met', gap: 'Gap',
  position: 'Position', stance: 'Stance', quote: 'Quote', team: 'Team', person: 'Person',
};

export function prettyPath(path) {
  return path.split(' › ').map((p) => FIELD_LABELS[p] || p).join(' › ');
}
