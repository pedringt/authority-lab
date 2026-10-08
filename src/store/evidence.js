// Evidence: test runs, success criteria and evidence requirements (#6),
// and the scenario library (#8).

import * as seed from '../data/seed.js';
import { defaultCriteria, defaultRequirements } from '../data/criteria-defaults.js';
import { starterScenarios } from '../data/scenario-templates.js';
import { getCapability, capData, updateCap, logEvent, fmtLong } from './state.js';
import { current, versionsInForce, performanceResultsSeen, testSummary } from './selectors.js';
import { people, requireActive } from './people.js';
import { amend } from './capabilities.js';

export function startTestRun(state, capabilityId) {
  const d = capData(state, capabilityId);
  if (d.testRun.status === 'running' || !d.scenarios.length) return state;
  if (!criteriaSaved(state, capabilityId)) throw new Error('Save success criteria and evidence requirements before the first test run. The first run locks them.');
  return updateCap(state, capabilityId, { testRun: { ...d.testRun, status: 'running', completed: [] } });
}

export function advanceTestRun(state, capabilityId) {
  const d = capData(state, capabilityId);
  if (d.testRun.status !== 'running') return state;
  const next = d.scenarios.find((s) => !d.testRun.completed.includes(s.id));
  if (!next) return state;
  const completed = [...d.testRun.completed, next.id];
  const done = completed.length === d.scenarios.length;
  let s = updateCap(state, capabilityId, { testRun: { ...d.testRun, completed, status: done ? 'complete' : 'running' } });
  if (done) s = finishTestRun(s, capabilityId);
  return s;
}

export function finishTestRun(state, capabilityId) {
  const d = capData(state, capabilityId);
  const lockedBefore = criteriaLocked(state, capabilityId);
  const summary = testSummary(state, capabilityId);
  const failed = d.scenarios.filter((s) => !s.pass);
  const detail =
    `Run on ${fmtLong(state.today)} in this session. ${summary.failed} failure${summary.failed === 1 ? '' : 's'} (${summary.highSeverity} high severity)` +
    (failed.length ? `: ${failed.map((s) => `${s.id} ${s.name} (${s.severity})`).join(', ')}. ` : '. ') +
    'The suite replays recorded decisions, so results match the last recorded run until a scenario is re-recorded.';
  const existing = d.evidence.find((e) => e.source === 'Automated tests' && e.metric === 'Scenario pass rate');
  const item = {
    ...(existing || { id: `EV-T${Date.now()}`, source: 'Automated tests', metric: 'Scenario pass rate', risk: 'High', segment: 'All', link: `#/tests?capability=${capabilityId}` }),
    value: `${summary.passed} of ${summary.total} passed`,
    status: summary.highSeverity ? 'watch' : summary.failed ? 'watch' : 'pass',
    date: state.today,
    detail,
  };
  const evidence = existing ? d.evidence.map((e) => (e === existing ? item : e)) : [item, ...d.evidence];
  const activity = [
    {
      id: `ACT-${Date.now()}`,
      date: state.today,
      kind: 'test',
      surfaced: true,
      title: 'Test suite run',
      body: `${summary.passed} of ${summary.total} scenarios passed. ${summary.highSeverity} high-severity failure${summary.highSeverity === 1 ? '' : 's'}. Results recorded as evidence ${item.id}.`,
      capabilityId,
      link: `#/tests?capability=${capabilityId}`,
    },
    ...state.activity,
  ];
  let s = updateCap(state, capabilityId, { testRun: { ...d.testRun, status: 'complete', lastRun: state.today }, evidence });
  s = { ...s, activity };
  if (!lockedBefore && criteriaLocked(s, capabilityId)) {
    const cap = getCapability(s, capabilityId);
    s = logEvent(s, {
      kind: 'criteria-locked',
      title: 'Success criteria locked',
      body: `${cap.name}: the first test run produced performance results, so success criteria v${versionsInForce(s, capabilityId).criteria} and evidence requirements v${versionsInForce(s, capabilityId).requirements} are now locked. Changes need a proposed amendment with sign-off.`,
      capabilityId,
      link: `#/capabilities/${capabilityId}?tab=criteria`,
    });
  }
  return s;
}


// Saved means a non-empty version of both objects exists. Seeded capabilities
// without criteria carry an empty version 1, which does not count.
export function criteriaSaved(state, capabilityId) {
  return current(state, capabilityId, 'criteria').length > 0 && current(state, capabilityId, 'requirements').length > 0;
}

// Criteria lock (decision 6): saved, and performance results have been seen.
// Same definition as "after evidence" for amendments.
export function criteriaLocked(state, capabilityId) {
  return criteriaSaved(state, capabilityId) && performanceResultsSeen(state, capabilityId);
}

export function canRunSuite(state, capabilityId) {
  const d = capData(state, capabilityId);
  if (!d.scenarios.length) return { ok: false, reason: 'No scenarios yet.' };
  if (!criteriaSaved(state, capabilityId)) return { ok: false, reason: 'Save success criteria and evidence requirements first. The first run locks them.' };
  if (d.testRun.status === 'running') return { ok: false, reason: 'Already running.' };
  return { ok: true };
}

export function defaultsFor(state, capabilityId) {
  const risk = current(state, capabilityId, 'risk');
  return { criteria: defaultCriteria(risk), requirements: defaultRequirements(risk) };
}

export const slugId = (text, i) => (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || `item-${i + 1}`;

export function cleanCriteria(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('Add at least one success criterion.');
  const seen = new Set();
  return items.map((c, i) => {
    const name = (c.name || '').trim();
    const target = (c.target || '').trim();
    if (!name || !target) throw new Error(`Criterion ${i + 1} needs a name and a target.`);
    let id = c.id || slugId(name, i);
    while (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    return { id, name, target, current: c.current || 'Not yet measured', status: c.status || 'pending', note: (c.note || '').trim(), source: c.source || 'Written by hand' };
  });
}

export function cleanRequirements(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('Add at least one evidence requirement.');
  const seen = new Set();
  return items.map((r, i) => {
    const text = (r.text || '').trim();
    if (!text) throw new Error(`Requirement ${i + 1} needs text.`);
    let id = r.id || slugId(text, i);
    while (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    return { id, text, current: r.current || 'Not yet measured', met: Boolean(r.met), gap: r.gap, source: r.source || 'Written by hand' };
  });
}

// Rows that can be adjusted but never removed.
export const CORE_CRITERIA = ['quality', 'severe-errors'];
export const CORE_REQUIREMENTS = ['min-cases'];
export const CORE_LABELS = { quality: 'a quality threshold', 'severe-errors': 'a severe-error threshold', 'min-cases': 'a minimum case count' };

// A threshold's direction: "at least N" (≥, >, Minimum) is loosened by a
// lower N; "at most N" (≤, <, Maximum) is loosened by a higher N.
export function threshold(text) {
  const t = text || '';
  const m = t.match(/(≥|>=|≤|<=|<|>|\bminimum\b|\bat least\b|\bmaximum\b|\bat most\b)\s*\$?\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const op = m[1].toLowerCase();
  const atLeast = ['≥', '>=', '>', 'minimum', 'at least'].includes(op);
  return { atLeast, n: Number(m[2]) };
}

// Defaults that were removed or loosened, compared with the risk-derived
// defaults for this capability.
export function defaultDeviations(defaults, submitted, textOf) {
  const out = [];
  for (const d of defaults) {
    const now = submitted.find((x) => x.id === d.id);
    if (!now) { out.push({ id: d.id, change: 'removed', from: textOf(d), to: null }); continue; }
    const a = threshold(textOf(d));
    const b = threshold(textOf(now));
    if (!a || !b) continue;
    const loosened = a.atLeast ? b.n < a.n : b.n > a.n;
    if (loosened) out.push({ id: d.id, change: 'loosened', from: textOf(d), to: textOf(now) });
  }
  return out;
}

// Save both objects before the first test run. Each save writes a new version
// (never an edit); once locked, changes go through a proposed amendment (#7).
export function saveCriteria(state, capabilityId, { criteria, requirements, by, reason } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  requireActive(state, by, 'save the criteria');
  if (criteriaLocked(state, capabilityId)) throw new Error('Criteria are locked: performance results have been seen. Propose an amendment instead.');
  const c = cleanCriteria(criteria);
  const r = cleanRequirements(requirements);
  const missingCore = [...CORE_CRITERIA.filter((id) => !c.some((x) => x.id === id)), ...CORE_REQUIREMENTS.filter((id) => !r.some((x) => x.id === id))];
  if (missingCore.length) throw new Error(`Core rows can be adjusted but not removed: ${missingCore.map((id) => CORE_LABELS[id]).join(', ')}.`);
  const defaults = defaultsFor(state, capabilityId);
  const deviations = [
    ...defaultDeviations(defaults.criteria, c, (x) => x.target).map((x) => ({ ...x, kind: 'criteria', label: (defaults.criteria.find((y) => y.id === x.id) || {}).name })),
    ...defaultDeviations(defaults.requirements, r, (x) => x.text).map((x) => ({ ...x, kind: 'requirements', label: null })),
  ];
  const why = (reason || '').trim();
  if (deviations.length && why.length < 10) {
    throw new Error(`Removing or loosening a risk-derived default needs a short reason (${deviations.map((x) => `${x.label || x.from}: ${x.change}`).join('; ')}).`);
  }
  const first = !criteriaSaved(state, capabilityId);
  const text = why || (first ? 'Saved before testing.' : 'Edited before testing.');
  const meta = (kind) => ({ deviations: deviations.filter((x) => x.kind === kind).map(({ id, change, from, to, label }) => ({ id, change, from, to, label })) });
  let s = amend(state, capabilityId, 'criteria', { value: c, author: by, reason: text, meta: meta('criteria'), silent: true });
  s = amend(s, capabilityId, 'requirements', { value: r, author: by, reason: text, meta: meta('requirements'), silent: true });
  // One event per save, naming both version numbers.
  return logEvent(s, {
    kind: 'criteria-saved',
    title: first ? 'Success criteria and evidence requirements saved' : 'Success criteria and evidence requirements updated',
    body: `${cap.name}: ${c.length} criteria and ${r.length} evidence requirements saved by ${people(state)[by].name} (criteria v${versionsInForce(s, capabilityId).criteria}, requirements v${versionsInForce(s, capabilityId).requirements}).${deviations.length ? ` ${deviations.length} risk-derived default${deviations.length === 1 ? '' : 's'} ${deviations.length === 1 ? 'was' : 'were'} loosened or removed: ${text}` : ''} They lock on the first test run.`,
    capabilityId,
    link: `#/capabilities/${capabilityId}?tab=criteria`,
  });
}

// Deterministic simulated results for a person-written or starter scenario.
// The same scenario always gets the same result, so the suite replays.
export function hash(text) {
  let h = 2166136261;
  for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
export const FAIL_EVERY = { standard: 11, ambiguous: 7, adversarial: 6, 'high-impact': 5, edge: 5 };
export function simulateScenario(sc) {
  const h = hash(`${sc.group}|${sc.name}|${sc.situation}`);
  const pass = h % (FAIL_EVERY[sc.group] || 7) !== 0;
  const escalate = /escalat|route for human|approval|ask for/i.test(sc.expected || '');
  const severity = pass ? 'None' : sc.group === 'high-impact' || sc.group === 'adversarial' ? 'High' : 'Medium';
  const expected = (sc.expected || '').replace(/\.$/, '');
  return {
    pass,
    severity,
    escalated: pass && escalate,
    aiDecision: pass ? `${escalate ? 'Escalated' : 'Produced the output'} as expected: ${expected.charAt(0).toLowerCase()}${expected.slice(1)}.` : escalate ? 'Produced an output instead of escalating.' : 'Produced an output that did not match the expected behaviour.',
    outcome: pass ? (escalate ? 'Escalated correctly' : 'Correct output') : escalate ? 'Missed escalation' : 'Wrong output',
    explanation: pass ? 'Simulated result (seeded, deterministic). The recorded decision matched the expected behaviour.' : 'Simulated result (seeded, deterministic). The recorded decision did not match the expected behaviour; treat as a real failure for the purpose of the pilot decision.',
    reviewer: pass ? (escalate ? 'Human took the case' : 'Approved as recommended') : 'Overridden by the reviewer',
    failureType: pass ? undefined : escalate ? 'Missing escalation' : 'Wrong answer',
    simulated: true,
  };
}

export const GROUP_PREFIX = { standard: 'S', ambiguous: 'A', adversarial: 'X', 'high-impact': 'H', edge: 'E' };

export function cleanScenarios(list) {
  if (!Array.isArray(list)) throw new Error('Scenarios must be a list.');
  const counts = {};
  return list.map((sc, i) => {
    const group = seed.SCENARIO_GROUPS.some((g) => g.id === sc.group) ? sc.group : null;
    if (!group) throw new Error(`Scenario ${i + 1} needs a group.`);
    const name = (sc.name || '').trim();
    const situation = (sc.situation || '').trim();
    const expected = (sc.expected || '').trim();
    if (!name || !situation || !expected) throw new Error(`Scenario ${i + 1} needs a name, a situation and an expected behaviour.`);
    counts[group] = (counts[group] || 0) + 1;
    const base = { id: sc.id || `${GROUP_PREFIX[group]}-${String(counts[group]).padStart(2, '0')}`, group, name, situation, expected, source: sc.source === 'ai' ? 'ai' : 'person' };
    // Keep a recorded result if the scenario text is unchanged; otherwise simulate.
    const keep = sc.pass !== undefined && sc.aiDecision && !sc.simulated ? { pass: sc.pass, severity: sc.severity, aiDecision: sc.aiDecision, outcome: sc.outcome, explanation: sc.explanation, reviewer: sc.reviewer, escalated: sc.escalated, incident: sc.incident, failureType: sc.failureType } : simulateScenario(base);
    return { ...base, ...keep };
  });
}

export function scenarioNudge(count) {
  if (count === 0) return 'No scenarios yet. Twenty to thirty is enough to start: a few in every group, with the ugly ones included.';
  if (count < 20) return `${count} scenario${count === 1 ? '' : 's'}. Aim for 20 to 30 before the first run, with at least two in every group.`;
  if (count <= 30) return `${count} scenarios. That is a sound starting library.`;
  return `${count} scenarios. More than 30 is fine, but make sure the groups stay balanced.`;
}

// Replace the scenario library. Results are simulated deterministically when
// a scenario is new or changed. Not allowed after a test run has been
// recorded for this library (the recorded results are evidence).
export function saveScenarios(state, capabilityId, { scenarios, by } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  requireActive(state, by, 'save the scenario library');
  const d = capData(state, capabilityId);
  const list = cleanScenarios(scenarios);
  const groups = new Set(list.map((sc) => sc.group));
  if (list.length && groups.size < 2) throw new Error('Cover at least two groups; a library of one kind of case proves little.');
  let s = updateCap(state, capabilityId, { scenarios: list, testRun: d.testRun.lastRun ? { ...d.testRun, status: 'not-run', completed: [] } : d.testRun });
  return logEvent(s, {
    kind: 'scenarios-saved',
    title: 'Scenario library saved',
    body: `${cap.name}: ${list.length} scenarios across ${groups.size} group${groups.size === 1 ? '' : 's'} saved by ${people(state)[by].name}${list.some((x) => x.source === 'ai') ? ` (${list.filter((x) => x.source === 'ai').length} suggested by AI)` : ''}. ${scenarioNudge(list.length)}`,
    capabilityId,
    link: `#/capabilities/${capabilityId}/scenarios/edit`,
  });
}

export function addStarterScenarios(state, capabilityId, { by } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  const d = capData(state, capabilityId);
  const existing = d.scenarios;
  const have = new Set(existing.map((sc) => sc.name));
  const add = starterScenarios(cap).filter((sc) => !have.has(sc.name));
  if (!add.length) throw new Error('The starter set is already in the library.');
  return saveScenarios(state, capabilityId, { scenarios: [...existing, ...add], by });
}
