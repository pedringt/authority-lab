// Evidence sources (#126): where a workspace's evidence comes from. The
// implementation team connects systems; each connected system appears here as
// a source once it sends evidence (or is registered in the workspace's data).
// The product person never configures a connection here. They decide what a
// source's metrics mean for each capability (Configure evidence).
//
// Two sources are built in: Authority Lab's own tests, and manual review (a
// result a person records by hand). Integrations are optional: a workspace can
// run on those two alone and connect systems later. Vendor names belong in
// example data only.

import * as seed from '../data/seed.js';
import { getCapability, capData, logEvent } from './state.js';
import { people, isActivePerson, snapshotPerson, requireActive } from './people.js';
import { current } from './selectors.js';
import { importEvidence, evidenceImports, EVIDENCE_SCHEMA } from './external.js';

export const SOURCE_KINDS = {
  eval: 'Eval suite',
  production: 'Production data',
  ticketing: 'Ticketing',
  analytics: 'Product analytics',
  monitoring: 'Monitoring',
  'manual-review': 'Manual review',
  tests: 'Authority Lab tests',
};
// How long a source's data stays fresh, by kind (Paige, 2026-10-13). Stale
// evidence still counts; it is shown as stale and raises a Monitor warning.
export const FRESH_DAYS = { eval: 30, production: 14, ticketing: 14, analytics: 14, monitoring: 14, 'manual-review': 90, tests: 30 };
export const CONNECTIONS = { connected: 'Connected', manual: 'Entered by people', 'built-in': 'Built in' };

export const TESTS_SOURCE = 'authority-lab-tests';
export const MANUAL_SOURCE = 'manual-review';
export const BUILT_IN_SOURCES = [
  { id: TESTS_SOURCE, name: 'Authority Lab tests', kind: 'tests', connection: 'built-in', description: 'Test cases written and run in Authority Lab.', freshForDays: FRESH_DAYS.tests,
    metrics: [{ metric: 'tests-passed', label: 'Tests passed', type: 'rate', segments: [] }, { metric: 'serious-test-failures', label: 'Serious test failures', type: 'count', segments: [] }] },
  { id: MANUAL_SOURCE, name: 'Manual review', kind: 'manual-review', connection: 'manual', description: 'A result a person records by hand: a review, an audit, a spot check.', freshForDays: FRESH_DAYS['manual-review'] },
];

const slug = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
// A connected system's source id, from what its envelopes say they are.
export const sourceIdFor = (system, capability) => slug(`${system} ${capability}`);

// The source an evidence item came from, or null for seeded demo items that
// predate sources (they keep their free-text source).
export function sourceOfItem(e) {
  if (e.sourceId) return e.sourceId;
  if (e.external) return sourceIdFor(e.external.system, e.external.capability);
  if (e.source === 'Automated tests' && e.runOn) return TESTS_SOURCE;
  return null;
}

// Every source in the workspace, with what it has sent: the metrics seen (by
// id, with a label and type) and when data last arrived, across capabilities.
export function evidenceSources(state) {
  const registered = state.evidenceSources || [];
  const all = [...BUILT_IN_SOURCES, ...registered.filter((s) => !BUILT_IN_SOURCES.some((b) => b.id === s.id))];
  const items = Object.keys(state.capabilityData || {}).flatMap((id) => capData(state, id).evidence.map((e) => ({ ...e, capabilityId: id })));
  return all.map((src) => {
    const mine = items.filter((e) => sourceOfItem(e) === src.id);
    const metrics = new Map((src.metrics || []).map((m) => [m.metric, { ...m, segments: [...(m.segments || [])] }]));
    for (const e of mine) {
      if (!e.measure) continue;
      const m = metrics.get(e.measure.metric) || { metric: e.measure.metric, label: e.metric, type: e.measure.type, segments: [] };
      if (e.measure.segment && !m.segments.includes(e.measure.segment)) m.segments.push(e.measure.segment);
      metrics.set(e.measure.metric, m);
    }
    const last = mine.reduce((d, e) => (e.date > d ? e.date : d), '');
    return { ...src, metrics: [...metrics.values()], lastReceived: last || null, capabilities: [...new Set(mine.map((e) => e.capabilityId))] };
  });
}

export const findSource = (state, id) => evidenceSources(state).find((s) => s.id === id) || null;

// An import registers its connected system as a source the first time it
// sends evidence, so the product person sees it without anyone configuring it.
export function registerSource(state, { system, capability, kind }) {
  const id = sourceIdFor(system, capability);
  if (BUILT_IN_SOURCES.some((b) => b.id === id) || (state.evidenceSources || []).some((s) => s.id === id)) return state;
  const src = { id, name: `${system} · ${capability}`, kind, connection: 'connected', description: `Connected: sends evidence from ${system}.`, freshForDays: FRESH_DAYS[kind] || 30, registeredOn: state.today };
  const s = { ...state, evidenceSources: [...(state.evidenceSources || []), src] };
  return logEvent(s, { kind: 'evidence-source', surfaced: true, title: `Evidence source connected: ${src.name}`, body: `${src.name} sent its first evidence. Choose what its results mean for a capability under that capability's Configure evidence.`, link: '#/sources' });
}

// Who may record a result by hand: the capability's owner or a person listed
// as its stakeholder, while active (Paige, 2026-10-13). An empty stakeholder
// list means the owner alone, never everyone.
export function manualEntryEligibility(state, capabilityId, by) {
  const cap = getCapability(state, capabilityId);
  if (!cap) return { ok: false, reason: 'This capability no longer exists.' };
  const p = people(state)[by];
  if (!p) return { ok: false, reason: 'Choose who is recording this.' };
  if (!isActivePerson(state, by)) return { ok: false, reason: `${p.name} is deactivated and can't record evidence.` };
  const listed = current(state, capabilityId, 'stakeholders').map((s) => s.person);
  if (by !== cap.owner && !listed.includes(by)) return { ok: false, reason: `${p.name} isn't the owner or a named stakeholder of ${cap.name}, so they can't record evidence for it.` };
  return { ok: true, reason: null };
}

// A result a person records by hand. It travels the same path as imported
// evidence (one envelope, the same checks, immutable once recorded), marked
// manual and naming who recorded it. A measured result counts like any other.
export function recordManualEvidence(state, capabilityId, { by, label, kind, type, passed, total, value, unit, segment, severity, observedAt, note, url } = {}) {
  requireActive(state, by, 'record evidence');
  const ok = manualEntryEligibility(state, capabilityId, by);
  if (!ok.ok) throw new Error(ok.reason);
  const name = String(label || '').trim();
  if (!name) throw new Error('Say what was measured.');
  if (!['eval', 'production'].includes(kind)) throw new Error('Say whether this was measured on test cases or on real use.');
  const num = (v) => (v === '' || v === undefined || v === null ? undefined : Number(v));
  const whole = (v) => Number.isInteger(num(v)) && num(v) >= 0;
  if (!['rate', 'count', 'value'].includes(type)) throw new Error('Choose what kind of result this is.');
  if (type === 'rate' && !(whole(passed) && whole(total) && num(total) > 0)) throw new Error('Give how many cases passed and out of how many, as whole numbers.');
  if (type === 'rate' && num(passed) > num(total)) throw new Error('More cases passed than were checked: passed can\'t be more than the total.');
  if (type === 'count' && !whole(value)) throw new Error('Give the number of events as a whole number.');
  if (type === 'count' && num(total) !== undefined && (!whole(total) || num(total) < num(value))) throw new Error('The number of cases has to be a whole number at least as large as the number of events.');
  if (type === 'value' && !Number.isFinite(num(value))) throw new Error('Give the number.');
  const m = { metric: slug(name) || 'result', label: name.slice(0, 80), type };
  if (type === 'rate') Object.assign(m, { passed: num(passed), total: num(total) });
  else if (type === 'count') Object.assign(m, { value: num(value), ...(num(total) !== undefined ? { total: num(total) } : {}) });
  else Object.assign(m, { value: num(value), ...(unit ? { unit } : {}), ...(num(total) !== undefined ? { total: num(total) } : {}) });
  if (segment && String(segment).trim()) m.segment = String(segment).trim();
  if (severity) m.severity = severity;
  const n = evidenceImports(state).filter((x) => x.via === 'manual').length + 1;
  const envelope = {
    schema: EVIDENCE_SCHEMA,
    id: `manual:${capabilityId}:${n}`,
    capabilityId,
    source: { system: 'Manual review', capability: people(state)[by].name.slice(0, 80) },
    kind,
    observedAt: observedAt || state.today,
    measurements: [m],
    ...(note && String(note).trim() ? { notes: String(note).trim() } : {}),
    ...(url && String(url).trim() ? { reference: { url: String(url).trim(), label: 'Source document' } } : {}),
  };
  return importEvidence(state, envelope, { via: 'manual', sourceId: MANUAL_SOURCE, recordedBy: snapshotPerson(state, by) });
}

// The built-in tests source's results, read from the capability's recorded
// test run (nothing is copied into the evidence list a second time): tests
// passed, overall and by type of test case, and serious failures. Empty until
// a run is recorded.
export function testMeasurements(state, capabilityId) {
  const d = capData(state, capabilityId);
  if (!d.testRun.lastRun || !d.scenarios.length) return [];
  const sc = d.scenarios;
  const groupName = (g) => (seed.SCENARIO_GROUPS.find((x) => x.id === g) || { name: g }).name;
  const out = [
    { metric: 'tests-passed', label: 'Tests passed', type: 'rate', passed: sc.filter((x) => x.pass).length, total: sc.length },
    { metric: 'serious-test-failures', label: 'Serious test failures', type: 'count', value: sc.filter((x) => !x.pass && x.severity === 'High').length, total: sc.length, severity: 'high' },
  ];
  for (const g of [...new Set(sc.map((x) => x.group))]) {
    const group = sc.filter((x) => x.group === g);
    out.push({ metric: 'tests-passed', label: 'Tests passed', type: 'rate', passed: group.filter((x) => x.pass).length, total: group.length, segment: groupName(g) });
  }
  return out.map((m) => ({ ...m, date: d.testRun.lastRun }));
}
