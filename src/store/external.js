// External evidence (#118): a small, domain-neutral contract for evidence from
// an AI capability that runs somewhere else. The first sender is State's
// Evidence Interpreter, but nothing here knows about State, refunds or any
// other domain.
//
// Transport (Paige, 2026-10-12): git. A sender commits one envelope per run
// to src/data/external-evidence/ in a pull request; CI checks every file with
// checkEvidence, so a merged file is an acknowledged one. The app imports the
// committed files through importEvidence, the same transition a test or any
// other transport would use.
//
// An envelope carries a summary and a reference back to the source, never the
// source's content: every key is allowlisted and every string is short, so a
// project's documents can't ride along in a free-text field.

import { getCapability, capData, updateCap, logEvent } from './state.js';

export const EVIDENCE_SCHEMA = 'authority-lab-evidence/1';
export const EVIDENCE_KINDS = ['eval', 'production'];
export const MEASUREMENT_TYPES = ['rate', 'count', 'value'];
export const SEVERITIES = ['low', 'medium', 'high'];
export const CONFIG_KEYS = ['provider', 'model', 'prompt', 'implementation', 'evalSet', 'toolPolicy'];
export const CONFIG_LABELS = { provider: 'Provider', model: 'Model', prompt: 'Prompt', implementation: 'Implementation', evalSet: 'Eval set', toolPolicy: 'Tool policy' };
export const MAX_MEASUREMENTS = 40;

const KEYS = {
  top: ['schema', 'id', 'capabilityId', 'source', 'kind', 'observedAt', 'config', 'reference', 'measurements', 'notes'],
  source: ['system', 'capability', 'environment'],
  reference: ['url', 'label'],
  measurement: ['metric', 'label', 'type', 'passed', 'total', 'value', 'unit', 'segment', 'severity'],
};
const SHORT = 120;
const ID = /^[a-z0-9][a-z0-9:._-]{2,119}$/;
const METRIC = /^[a-z0-9][a-z0-9-]{0,59}$/;
const DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;
const UNITS = ['', '%', '$', 'ms', 's', 'cases'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isCount = (v) => Number.isInteger(v) && v >= 0;

// Every problem with an envelope, as plain sentences. An empty list means it
// can be imported (whether its capability exists is checked on import).
export function checkEvidence(env) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!isObj(env)) return ['The evidence must be a JSON object.'];
  const extra = (obj, allowed, where) => Object.keys(obj).filter((k) => !allowed.includes(k)).forEach((k) => err(`${where} has a field that isn't part of the contract: "${k}". Send a summary and a reference, not the source's content.`));
  const text = (v, where, { required = false, max = SHORT } = {}) => {
    if (v === undefined || v === null) { if (required) err(`${where} is required.`); return; }
    if (typeof v !== 'string' || !v.trim()) err(`${where} must be non-empty text.`);
    else if (v.length > max) err(`${where} is longer than ${max} characters.`);
  };

  extra(env, KEYS.top, 'The envelope');
  if (env.schema !== EVIDENCE_SCHEMA) err(`schema must be "${EVIDENCE_SCHEMA}".`);
  if (typeof env.id !== 'string' || !ID.test(env.id)) err('id must be 3 to 120 characters: lowercase letters, digits and : . _ - (a stable id for the run, the same on every retry).');
  if (typeof env.capabilityId !== 'string' || !METRIC.test(env.capabilityId)) err('capabilityId must be an Authority Lab capability id.');
  if (!isObj(env.source)) err('source is required: { system, capability }.');
  else {
    extra(env.source, KEYS.source, 'source');
    text(env.source.system, 'source.system', { required: true, max: 60 });
    text(env.source.capability, 'source.capability', { required: true, max: 80 });
    text(env.source.environment, 'source.environment', { max: 40 });
  }
  if (!EVIDENCE_KINDS.includes(env.kind)) err(`kind must be one of: ${EVIDENCE_KINDS.join(', ')}.`);
  if (typeof env.observedAt !== 'string' || !DATE.test(env.observedAt) || Number.isNaN(Date.parse(env.observedAt))) err('observedAt must be a date (YYYY-MM-DD) or an ISO date and time.');
  if (env.config !== undefined) {
    if (!isObj(env.config)) err('config must be an object of version strings.');
    else {
      extra(env.config, CONFIG_KEYS, 'config');
      for (const k of CONFIG_KEYS) text(env.config[k], `config.${k}`);
    }
  }
  if (env.reference !== undefined) {
    if (!isObj(env.reference)) err('reference must be { url, label }.');
    else {
      extra(env.reference, KEYS.reference, 'reference');
      text(env.reference.label, 'reference.label', { max: 80 });
      if (env.reference.url !== undefined && (typeof env.reference.url !== 'string' || !/^https:\/\/[^\s]+$/.test(env.reference.url) || env.reference.url.length > 300)) err('reference.url must be an https link of at most 300 characters.');
    }
  }
  text(env.notes, 'notes', { max: 300 });

  if (!Array.isArray(env.measurements) || !env.measurements.length) err('measurements must list at least one result.');
  else if (env.measurements.length > MAX_MEASUREMENTS) err(`measurements can list at most ${MAX_MEASUREMENTS} results.`);
  else {
    const seen = new Set();
    env.measurements.forEach((m, i) => {
      const at = `measurements[${i}]`;
      if (!isObj(m)) { err(`${at} must be an object.`); return; }
      extra(m, KEYS.measurement, at);
      if (typeof m.metric !== 'string' || !METRIC.test(m.metric)) err(`${at}.metric must be a short id: lowercase letters, digits and hyphens.`);
      text(m.label, `${at}.label`, { max: 80 });
      text(m.segment, `${at}.segment`, { max: 60 });
      if (m.severity !== undefined && !SEVERITIES.includes(m.severity)) err(`${at}.severity must be one of: ${SEVERITIES.join(', ')}.`);
      if (!MEASUREMENT_TYPES.includes(m.type)) err(`${at}.type must be one of: ${MEASUREMENT_TYPES.join(', ')}.`);
      if (m.type === 'rate') {
        if (!isCount(m.passed) || !isCount(m.total) || m.total === 0) err(`${at}: a rate needs whole numbers passed and total, with total above 0.`);
        else if (m.passed > m.total) err(`${at}: passed can't be more than total.`);
        if (m.value !== undefined) err(`${at}: a rate is passed of total; leave value out.`);
      }
      if (m.type === 'count') {
        if (!isCount(m.value)) err(`${at}: a count needs a whole number value.`);
        if (m.total !== undefined && (!isCount(m.total) || (isCount(m.value) && m.value > m.total))) err(`${at}: total, when given, is the sample the count came from and can't be smaller than it.`);
      }
      if (m.type === 'value') {
        if (typeof m.value !== 'number' || !Number.isFinite(m.value)) err(`${at}: a value needs a number.`);
        if (m.total !== undefined && !isCount(m.total)) err(`${at}: total, when given, must be a whole number.`);
      }
      if (m.unit !== undefined && !UNITS.includes(m.unit)) err(`${at}.unit must be one of: ${UNITS.filter(Boolean).join(', ')}.`);
      const key = `${m.metric}|${m.segment || ''}`;
      if (seen.has(key)) err(`${at} repeats ${m.metric}${m.segment ? ` for ${m.segment}` : ''}: send one result per metric and segment.`);
      seen.add(key);
    });
  }
  return errors;
}

// Keys sorted at every level, so the same envelope compares equal however its
// fields were ordered when it was written.
export function canonicalEvidence(v) {
  if (Array.isArray(v)) return v.map(canonicalEvidence);
  if (!isObj(v)) return v;
  return Object.fromEntries(Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => [k, canonicalEvidence(v[k])]));
}
const same = (a, b) => JSON.stringify(canonicalEvidence(a)) === JSON.stringify(canonicalEvidence(b));

// Every import in the workspace, newest last.
export function evidenceImports(state, capabilityId = null) {
  const ids = capabilityId ? [capabilityId] : Object.keys(state.capabilityData);
  return ids.flatMap((id) => (capData(state, id).imports || []).map((x) => ({ ...x, capabilityId: id })));
}
export const findImport = (state, id) => evidenceImports(state).find((x) => x.id === id) || null;

// How a measurement reads: "92% (46 of 50)", "1 in 50 cases", "840 ms".
export function measurementText(m) {
  if (m.type === 'rate') return `${Math.round((m.passed / m.total) * 1000) / 10}% (${m.passed} of ${m.total})`;
  const n = m.unit === '$' ? `$${m.value}` : `${m.value}${m.unit && m.unit !== 'cases' ? (m.unit === '%' ? '%' : ` ${m.unit}`) : ''}`;
  return m.total !== undefined ? `${n} in ${m.total} case${m.total === 1 ? '' : 's'}` : n;
}

// The sample a measurement came from, when it says.
export const measurementSample = (m) => (m.type === 'rate' ? m.total : m.total !== undefined ? m.total : null);

const RISK_OF = { high: 'High', medium: 'Medium', low: 'Low' };

// One evidence item per measurement, in the same list as every other piece of
// evidence. `from: 'imported'` and `external` say where it came from; the
// measurement itself is kept so targets can be judged from it (#120).
function itemsFor(env) {
  const external = {
    importId: env.id,
    system: env.source.system,
    capability: env.source.capability,
    environment: env.source.environment || null,
    kind: env.kind,
    config: env.config ? canonicalEvidence(env.config) : {},
    reference: env.reference || null,
  };
  return env.measurements.map((m) => ({
    id: `${env.id}#${m.metric}${m.segment ? `@${m.segment.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : ''}`,
    from: 'imported',
    source: `${env.source.system} ${env.kind === 'eval' ? 'eval' : 'production'}`,
    metric: m.label || m.metric,
    value: measurementText(m),
    status: 'recorded',
    risk: RISK_OF[m.severity] || null,
    segment: m.segment || 'All',
    date: env.observedAt.slice(0, 10),
    detail: env.notes || `Imported from ${env.source.system} (${env.source.capability}), run ${env.id}.`,
    link: (env.reference && env.reference.url) || null,
    measure: canonicalEvidence(m),
    external,
  }));
}

// Import one envelope into its capability's evidence. Imported evidence is
// immutable: the same envelope again (a retry) changes nothing and returns
// the same state; the same id with different content is refused, because a
// correction arrives as new evidence with its own id.
export function importEvidence(state, env, { via = 'file' } = {}) {
  const errors = checkEvidence(env);
  if (errors.length) throw new Error(`This evidence can't be imported: ${errors.join(' ')}`);
  const cap = getCapability(state, env.capabilityId);
  if (!cap) throw new Error(`No capability "${env.capabilityId}" in this workspace, so the evidence can't be imported.`);
  const prior = findImport(state, env.id);
  if (prior) {
    if (prior.capabilityId === env.capabilityId && same(prior.envelope, env)) return state;
    throw new Error(`Evidence ${env.id} was already imported with different content. Imported evidence never changes: send a correction as new evidence with its own id.`);
  }
  const items = itemsFor(env);
  const record = { id: env.id, importedOn: state.today, via, envelope: canonicalEvidence(env) };
  const s = updateCap(state, cap.id, (d) => ({ ...d, imports: [...(d.imports || []), record], evidence: [...items, ...d.evidence] }));
  return logEvent(s, {
    kind: 'evidence-imported',
    surfaced: true,
    title: `Evidence imported from ${env.source.system}`,
    body: `${cap.name}: ${items.length} result${items.length === 1 ? '' : 's'} from ${env.source.capability} (${env.kind === 'eval' ? 'an eval' : 'production'}, ${env.observedAt.slice(0, 10)}), run ${env.id}.`,
    capabilityId: cap.id,
    link: `#/capabilities/${cap.id}?tab=decide&show=all`,
  });
}

// Import a batch of committed envelopes. Never throws: each one is imported,
// already there, for a capability in another workspace, or refused with the
// reason, so one bad file can't stop the rest and every failure is visible.
export function importEvidenceFiles(state, files) {
  const results = [];
  let s = state;
  for (const { file, envelope } of files) {
    const id = envelope && envelope.id;
    try {
      if (isObj(envelope) && typeof envelope.capabilityId === 'string' && !getCapability(s, envelope.capabilityId) && !checkEvidence(envelope).length) {
        results.push({ file, id, status: 'elsewhere' });
        continue;
      }
      const next = importEvidence(s, envelope);
      results.push({ file, id, status: next === s ? 'already' : 'imported' });
      s = next;
    } catch (e) {
      results.push({ file, id, status: 'refused', reason: e.message });
    }
  }
  return { state: s, results };
}
