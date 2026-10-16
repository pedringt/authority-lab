// Evidence: test runs, success criteria and evidence requirements (#6),
// and the scenario library (#8).

import * as seed from '../data/seed.js';
import { defaultCriteria, defaultRequirements } from '../data/criteria-defaults.js';
import { starterScenarios } from '../data/scenario-templates.js';
import { findStartingPoint, START_FROM_SCRATCH, BASE_REQUIREMENTS, riskRequirements } from '../data/templates.js';
import { getCapability, capData, updateCap, logEvent } from './state.js';
import { current, currentVersion, versionsInForce, performanceResultsSeen, testSummary } from './selectors.js';
import { people, requireActive } from './people.js';
import { amend } from './capabilities.js';
import { measureProblems } from './measures.js';
import { isDemoWorkspace } from './lightweight.js';

export function startTestRun(state, capabilityId) {
  // Simulation is for the demo only (#142, P1): a real workspace records what
  // its AI actually did, one test case at a time.
  if (!isDemoWorkspace(state)) throw new Error('Authority Lab doesn\'t run your AI. Run each test case through it yourself, then record the outcome.');
  const d = capData(state, capabilityId);
  if (d.testRun.status === 'running' || !d.scenarios.length) return state;
  if (!criteriaSaved(state, capabilityId)) throw new Error('Set targets and decision requirements before the first test run. They lock when the first results come in, so the bar can\'t move after we see them.');
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
  // The run date is stored as runOn and formatted where it is shown, never
  // baked into the text.
  const detail =
    `${summary.failed} failure${summary.failed === 1 ? '' : 's'} (${summary.highSeverity} serious)` +
    (failed.length ? `: ${failed.map((s) => `${s.id} ${s.name} (${s.severity})`).join(', ')}. ` : '. ') +
    'Tests replay saved answers, so results stay the same until a test case changes.';
  const existing = d.evidence.find((e) => e.source === 'Automated tests' && e.metric === 'Scenario pass rate');
  const item = {
    ...(existing || { id: `EV-T${Date.now()}`, source: 'Automated tests', metric: 'Scenario pass rate', risk: 'High', segment: 'All', link: `#/tests?capability=${capabilityId}` }),
    value: `${summary.passed} of ${summary.total} passed`,
    status: summary.highSeverity ? 'watch' : summary.failed ? 'watch' : 'pass',
    date: state.today,
    runOn: state.today,
    from: 'workspace',
    detail,
  };
  const evidence = existing ? d.evidence.map((e) => (e === existing ? item : e)) : [item, ...d.evidence];
  const activity = [
    {
      id: `ACT-${Date.now()}`,
      date: state.today,
      kind: 'test',
      surfaced: true,
      title: 'Tests run',
      body: `${summary.passed} of ${summary.total} test cases passed, ${summary.highSeverity} serious failure${summary.highSeverity === 1 ? '' : 's'}. Saved to evidence as ${item.id}.`,
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
      title: 'Targets locked',
      body: `${cap.name}: the first test results are in, so the targets (version ${versionsInForce(s, capabilityId).criteria}) and decision requirements (version ${versionsInForce(s, capabilityId).requirements}) can't be changed directly now. That way the bar doesn't move after we've seen the results. To change them, propose a change and get it approved.`,
      capabilityId,
      link: `#/capabilities/${capabilityId}?tab=decide&show=targets`,
    });
  }
  return s;
}


// Saved means a non-empty version of the requirements exists, and targets
// were either set or deliberately left empty (#137: Targets are optional, so a
// save with none records `noTargets`). An empty seeded version 1 doesn't
// count.
export function criteriaSaved(state, capabilityId) {
  if (!current(state, capabilityId, 'requirements').length) return false;
  if (current(state, capabilityId, 'criteria').length) return true;
  const v = currentVersion(state, capabilityId, 'criteria');
  return Boolean(v && v.noTargets);
}

// Criteria lock (decision 6): saved, and performance results have been seen.
// Same definition as "after evidence" for amendments.
export function criteriaLocked(state, capabilityId) {
  return criteriaSaved(state, capabilityId) && performanceResultsSeen(state, capabilityId);
}

export function canRunSuite(state, capabilityId) {
  const d = capData(state, capabilityId);
  if (!d.scenarios.length) return { ok: false, reason: 'No test cases yet.' };
  if (!criteriaSaved(state, capabilityId)) return { ok: false, reason: 'Set targets and decision requirements first. They lock when the first results come in.' };
  if (d.testRun.status === 'running') return { ok: false, reason: 'The tests are already running.' };
  return { ok: true };
}

// The recommended Targets and Requirements. A capability set up through the
// setup flow (#139) gets suggestions with no numbers: measurable ones come
// with a Target whose bar is Needs decision, and the minimum-cases coverage
// rule waits for its number too. Capabilities from before #139 keep the
// defaults they were set up with.
export function defaultsFor(state, capabilityId) {
  const risk = current(state, capabilityId, 'risk');
  const cap = getCapability(state, capabilityId);
  if (cap && cap.setup) return suggestedChecks(risk, cap.setup.template);
  return { criteria: defaultCriteria(risk), requirements: defaultRequirements(risk) };
}

export const CHECK_SOURCES = { base: 'Authority Lab suggestion', template: 'Template suggestion', answers: 'Based on your answers' };

export function suggestedChecks(risk, templateId) {
  const family = findStartingPoint(templateId) || START_FROM_SCRATCH;
  const rows = [
    ...BASE_REQUIREMENTS.map((r) => ({ ...r, from: 'base' })),
    ...family.requirements.map((r) => ({ ...r, from: 'template' })),
    ...riskRequirements(risk).map((r) => ({ ...r, from: 'answers' })),
  ];
  const seen = new Set();
  const unique = rows.filter((r) => (seen.has(r.id) ? false : seen.add(r.id)));
  const requirements = unique.map(({ id, text, kind, bar, from, why }) => ({ id, text, source: CHECK_SOURCES[from], ...(kind ? { kind } : {}), ...(bar ? { bar } : {}), ...(why ? { why } : {}) }));
  const criteria = unique.filter((r) => r.target).map((r) => ({ id: r.target.id, name: r.target.name, target: NEEDS_DECISION_TEXT, bar: NEEDS_DECISION, note: r.target.note || '', requirement: r.id, source: CHECK_SOURCES[r.from] }));
  return { criteria, requirements };
}

export const slugId = (text, i) => (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || `item-${i + 1}`;

// The comparison a row's wording states: "≥ 92%", "at most 0", "< 3%",
// "Minimum 200 pilot cases", and "No unresolved critical incidents" (at most
// 0). null when the wording names no number.
export function barFromWords(text) {
  const t = String(text || '');
  const m = t.match(/(≥|>=|≤|<=|<|>|=|\bminimum\b|\bat least\b|\bmaximum\b|\bat most\b|\bno more than\b|\bexactly\b)\s*\$?\s*(\d+(?:\.\d+)?)/i);
  if (m) {
    const op = { '≥': '>=', '>=': '>=', minimum: '>=', 'at least': '>=', '≤': '<=', '<=': '<=', maximum: '<=', 'at most': '<=', 'no more than': '<=', '<': '<', '>': '>', '=': '=', exactly: '=' }[m[1].toLowerCase()];
    return { op, value: Number(m[2]) };
  }
  if (/^\s*(no|zero)\b/i.test(t)) return { op: '<=', value: 0 };
  return null;
}

// A measured row (#120) says its bar in words too, and the two must agree,
// so a person reading the row sees the bar software checks and the tightening
// rule (which reads the words) sees the same number.
function cleanMeasure(measure, words, what) {
  if (measure === undefined) return {};
  // null removes a mapping explicitly (Configure evidence, #126).
  if (measure === null) return { measure: null };
  const problems = measureProblems(measure);
  if (problems.length) throw new Error(`${what}: ${problems.join(' ')}`);
  if (measure.op !== '=') {
    const t = barFromWords(words);
    if (!t) throw new Error(`${what} is measured, so its wording has to name the number too (for example "≥ ${measure.value}").`);
    const atLeast = (op) => op === '>=' || op === '>';
    if (atLeast(t.op) !== atLeast(measure.op) || t.value !== measure.value) throw new Error(`${what} says "${words}" but its measure checks ${measure.op} ${measure.value}. Make them agree.`);
  }
  return { measure: { ...measure } };
}

// A Target whose bar nobody has decided yet (#137). It is neither met nor
// failed: it is unresolved, and says so.
export const NEEDS_DECISION = 'needs-decision';
export const NEEDS_DECISION_TEXT = 'Needs decision';
export const isUnresolvedTarget = (c) => Boolean(c) && c.bar === NEEDS_DECISION;
const saysNeedsDecision = (c) => c.bar === NEEDS_DECISION || /^\s*needs (a )?decision\.?\s*$/i.test(c.target || '');

// Targets are optional (#137, Paige 2026-10-14): an empty list is allowed.
// A row may name the Requirement it judges (`requirement`, a requirement id).
export function cleanCriteria(items) {
  if (items === undefined || items === null) items = [];
  if (!Array.isArray(items)) throw new Error('Targets must be a list.');
  const seen = new Set();
  return items.map((c, i) => {
    const name = (c.name || '').trim();
    if (!name) throw new Error(`Target ${i + 1} needs a measure and a value.`);
    let id = c.id || slugId(name, i);
    while (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    const link = c.requirement ? { requirement: String(c.requirement) } : {};
    if (saysNeedsDecision(c)) {
      if (c.measure) throw new Error(`Target "${name}" has no bar yet, so it can't be measured. Set its number first.`);
      return { id, name, target: NEEDS_DECISION_TEXT, bar: NEEDS_DECISION, current: 'No bar set yet', status: NEEDS_DECISION, note: (c.note || '').trim(), source: c.source || 'Written by hand', ...link };
    }
    const target = (c.target || '').trim();
    if (!target) throw new Error(`Target ${i + 1} needs a measure and a value.`);
    const status = c.status && c.status !== NEEDS_DECISION ? c.status : 'pending';
    return { id, name, target, current: c.current && c.current !== 'No bar set yet' ? c.current : 'Not yet measured', status, note: (c.note || '').trim(), source: c.source || 'Written by hand', ...link, ...cleanMeasure(c.measure, target, `Target "${name}"`) };
  });
}

// A Target that names a Requirement must name one that exists.
export function checkTargetLinks(criteria, requirements) {
  const ids = new Set(requirements.map((r) => r.id));
  const bad = criteria.find((c) => c.requirement && !ids.has(c.requirement));
  if (bad) throw new Error(`Target "${bad.name}" is for requirement "${bad.requirement}", which isn't in the list.`);
}

// Coverage rules (#137): how much evidence is enough to judge, kept apart
// from what the evidence must show. A requirement row is a coverage rule when
// it says so (`kind: 'coverage'`), counts cases (a measure on the sample
// size), or is the minimum-cases row.
export function isCoverageRule(r) {
  return Boolean(r) && (r.kind === 'coverage' || r.id === 'min-cases' || Boolean(r.measure && r.measure.stat === 'sample'));
}

export function cleanRequirements(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('Add at least one decision requirement.');
  const seen = new Set();
  return items.map((r, i) => {
    const text = (r.text || '').trim();
    if (!text) throw new Error(`Requirement ${i + 1} is empty: it needs text.`);
    let id = r.id || slugId(text, i);
    while (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    if (r.kind !== undefined && r.kind !== 'coverage') throw new Error(`Requirement "${text}": the only kind is "coverage".`);
    // Only a coverage rule may wait for its number (#139, C3); a measurable
    // Requirement's bar belongs on its Target.
    if (r.bar === NEEDS_DECISION || /\bneeds decision\b/i.test(text)) {
      if (!isCoverageRule(r)) throw new Error(`Requirement "${text}": only a coverage rule (how much evidence is enough) can wait for its number. Put the bar on a Target instead.`);
      if (r.measure) throw new Error(`Requirement "${text}" has no number yet, so it can't be measured. Set its number first.`);
      return { id, text, current: 'No number set yet', met: false, source: r.source || 'Written by hand', ...(r.kind === 'coverage' ? { kind: 'coverage' } : {}), bar: NEEDS_DECISION };
    }
    return { id, text, current: r.current || 'Not yet measured', met: Boolean(r.met), gap: r.gap, source: r.source || 'Written by hand', ...(r.kind === 'coverage' ? { kind: 'coverage' } : {}), ...cleanMeasure(r.measure, text, `Requirement "${text}"`) };
  });
}

// A measured row keeps its measure when a form edits only its words (the
// targets editor doesn't send measures): the measure's number follows the
// wording's number, in the same direction, so the two never disagree. A row
// that names its measure uses it; \`measure: null\` removes it. Shared by the
// targets editor and proposed target changes.
export function carryMeasure(row, base, words, label) {
  if (Object.hasOwn(row, 'measure')) {
    if (row.measure !== null) return row;
    const { measure, ...rest } = row;
    return rest;
  }
  if (!base || !base.measure) return row;
  // The measure follows the wording entirely (comparison and number); the
  // tightening rule, which reads the wording, decides whether it needs approval.
  const t = barFromWords(words);
  if (!t) throw new Error(`"${label}" is measured (${base.measure.op} ${base.measure.value}), so its wording must keep a number to check. To stop measuring it, remove its evidence under Configure evidence.`);
  return { ...row, measure: { ...base.measure, op: t.op, value: t.value } };
}

// A submitted row that repeats its stored measure unchanged (code that copies
// a row and edits only its words) hasn't changed how it is measured: drop the
// repeat so carryMeasure moves the number with the words.
const sameMeasure = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function unchangedMeasuresDropped(rows, baseRows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((r) => {
    const b = (baseRows || []).find((x) => x.id === r.id);
    if (r && r.measure && b && b.measure && sameMeasure(r.measure, b.measure)) { const { measure, ...rest } = r; return rest; }
    return r;
  });
}

// The next evidence id, "EV-nn": one past the highest in use. Counting the
// list would collide once imported items (named by their run) are in it.
export function nextEvidenceId(list) {
  const top = list.reduce((n, e) => { const m = /^EV-(\d+)$/.exec(e.id || ''); return m ? Math.max(n, Number(m[1])) : n; }, 0);
  return `EV-${String(top + 1).padStart(2, '0')}`;
}

// Rows that can be adjusted but never removed. Targets are optional since
// #137 (Paige, 2026-10-14), so no Target row is required; the minimum-cases
// row stays required, as a coverage rule.
export const CORE_CRITERIA = [];
export const CORE_REQUIREMENTS = ['min-cases'];
export const CORE_LABELS = { quality: 'a quality target', 'severe-errors': 'a serious-error target', 'min-cases': 'a minimum number of cases' };

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
    // Replacing a default's number with "Needs decision" removes a bar, so
    // it's recorded like any other weakening.
    if (a && isUnresolvedTarget(now)) { out.push({ id: d.id, change: 'unresolved', from: textOf(d), to: textOf(now) }); continue; }
    if (!a || !b) continue;
    const loosened = a.atLeast ? b.n < a.n : b.n > a.n;
    if (loosened) out.push({ id: d.id, change: 'loosened', from: textOf(d), to: textOf(now) });
  }
  return out;
}

export const DEVIATION_WORDS = { loosened: 'weakened', removed: 'removed', unresolved: 'left as Needs decision' };

// Save both objects before the first test run. Each save writes a new version
// (never an edit); once locked, changes go through a proposed amendment (#7).
export function saveCriteria(state, capabilityId, { criteria, requirements, by, reason } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  requireActive(state, by, 'save the targets');
  if (criteriaLocked(state, capabilityId)) throw new Error('These targets can\'t be changed directly now that results exist. Propose a change instead.');
  const baseC = current(state, capabilityId, 'criteria');
  const baseR = current(state, capabilityId, 'requirements');
  const c = cleanCriteria(unchangedMeasuresDropped(criteria, baseC)).map((x) => carryMeasure(x, baseC.find((b) => b.id === x.id), x.target, x.name));
  const r = cleanRequirements(unchangedMeasuresDropped(requirements, baseR)).map((x) => carryMeasure(x, baseR.find((b) => b.id === x.id), x.text, x.text));
  const missingCore = [...CORE_CRITERIA.filter((id) => !c.some((x) => x.id === id)), ...CORE_REQUIREMENTS.filter((id) => !r.some((x) => x.id === id))];
  if (missingCore.length) throw new Error(`You can change these but not remove them: ${missingCore.map((id) => CORE_LABELS[id]).join(', ')}.`);
  checkTargetLinks(c, r);
  const defaults = defaultsFor(state, capabilityId);
  const deviations = [
    ...defaultDeviations(defaults.criteria, c, (x) => x.target).map((x) => ({ ...x, kind: 'criteria', label: (defaults.criteria.find((y) => y.id === x.id) || {}).name })),
    ...defaultDeviations(defaults.requirements, r, (x) => x.text).map((x) => ({ ...x, kind: 'requirements', label: null })),
  ];
  const why = (reason || '').trim();
  if (deviations.length && why.length < 10) {
    throw new Error(`You weakened or removed a recommended safeguard, so add a short reason (${deviations.map((x) => `${x.label || x.from}: ${DEVIATION_WORDS[x.change] || x.change}`).join('; ')}).`);
  }
  const first = !criteriaSaved(state, capabilityId);
  const text = why || (first ? 'Saved before testing.' : 'Edited before testing.');
  const meta = (kind) => ({ deviations: deviations.filter((x) => x.kind === kind).map(({ id, change, from, to, label }) => ({ id, change, from, to, label })), ...(kind === 'criteria' && !c.length ? { noTargets: true } : {}) });
  let s = amend(state, capabilityId, 'criteria', { value: c, author: by, reason: text, meta: meta('criteria'), silent: true });
  s = amend(s, capabilityId, 'requirements', { value: r, author: by, reason: text, meta: meta('requirements'), silent: true });
  // One event per save, naming both version numbers.
  return logEvent(s, {
    kind: 'criteria-saved',
    title: first ? 'Targets and decision requirements saved' : 'Targets and decision requirements updated',
    body: `${cap.name}: ${c.length} target${c.length === 1 ? '' : 's'} and ${r.length} decision requirement${r.length === 1 ? '' : 's'} saved by ${people(state)[by].name} (targets v${versionsInForce(s, capabilityId).criteria}, requirements v${versionsInForce(s, capabilityId).requirements}).${deviations.length ? ` ${deviations.length} recommended safeguard${deviations.length === 1 ? ' was' : 's were'} weakened or removed: ${text}` : ''} They lock when the first test results come in.`,
    capabilityId,
    link: `#/capabilities/${capabilityId}?tab=decide&show=targets`,
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
    aiDecision: pass ? `${escalate ? 'Handed to a person' : 'Answered'} as expected: ${expected.charAt(0).toLowerCase()}${expected.slice(1)}.` : escalate ? 'Answered when it should have handed the case to a person.' : 'Gave an answer that didn\'t match what it should do.',
    outcome: pass ? (escalate ? 'Escalated correctly' : 'Correct output') : escalate ? 'Missed escalation' : 'Wrong output',
    explanation: pass ? 'Simulated result. The AI\'s answer matched what it should do.' : 'Simulated result. The AI\'s answer didn\'t match what it should do. Count this as a real failure when deciding on the pilot.',
    reviewer: pass ? (escalate ? 'Human took the case' : 'Approved as recommended') : 'Overridden by the reviewer',
    failureType: pass ? undefined : escalate ? 'Missing escalation' : 'Wrong answer',
    simulated: true,
  };
}

export const GROUP_PREFIX = { standard: 'S', ambiguous: 'A', adversarial: 'X', 'high-impact': 'H', edge: 'E' };

export function cleanScenarios(list, { simulate = true } = {}) {
  if (!Array.isArray(list)) throw new Error('Scenarios must be a list.');
  const counts = {};
  return list.map((sc, i) => {
    const group = seed.SCENARIO_GROUPS.some((g) => g.id === sc.group) ? sc.group : null;
    if (!group) throw new Error(`Test case ${i + 1} needs a type.`);
    const name = (sc.name || '').trim();
    const situation = (sc.situation || '').trim();
    const expected = (sc.expected || '').trim();
    if (!name || !situation || !expected) throw new Error(`Test case ${i + 1} needs a name, a situation and what it should do.`);
    counts[group] = (counts[group] || 0) + 1;
    const base = { id: sc.id || `${GROUP_PREFIX[group]}-${String(counts[group]).padStart(2, '0')}`, group, name, situation, expected, source: sc.source === 'ai' ? 'ai' : 'person' };
    // Keep a recorded result if the scenario text is unchanged; otherwise simulate.
    // Outside the demo, a test case carries no result of its own: its outcomes
    // are recorded by a person (#142).
    if (!simulate) return base;
    const keep = sc.pass !== undefined && sc.aiDecision && !sc.simulated ? { pass: sc.pass, severity: sc.severity, aiDecision: sc.aiDecision, outcome: sc.outcome, explanation: sc.explanation, reviewer: sc.reviewer, escalated: sc.escalated, incident: sc.incident, failureType: sc.failureType } : simulateScenario(base);
    return { ...base, ...keep };
  });
}

export function scenarioNudge(count) {
  if (count === 0) return 'No test cases yet. 20 to 30 is enough to start: a few of each type, including the hard ones.';
  if (count < 20) return `${count} test case${count === 1 ? '' : 's'}. Aim for 20 to 30 before the first run, with at least two of each type.`;
  if (count <= 30) return `${count} test cases. That's a good start.`;
  return `${count} test cases. More than 30 is fine; keep the types balanced.`;
}

// Replace the scenario library. Results are simulated deterministically when
// a scenario is new or changed. Not allowed after a test run has been
// recorded for this library (the recorded results are evidence).
export function saveScenarios(state, capabilityId, { scenarios, by } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  requireActive(state, by, 'save the test cases');
  const d = capData(state, capabilityId);
  const list = cleanScenarios(scenarios, { simulate: isDemoWorkspace(state) });
  const groups = new Set(list.map((sc) => sc.group));
  if (list.length && groups.size < 2) throw new Error('Include at least two types of case. One type alone doesn\'t show much.');
  let s = updateCap(state, capabilityId, { scenarios: list, testRun: d.testRun.lastRun ? { ...d.testRun, status: 'not-run', completed: [] } : d.testRun });
  return logEvent(s, {
    kind: 'scenarios-saved',
    title: 'Test cases saved',
    body: `${cap.name}: ${list.length} test case${list.length === 1 ? '' : 's'} across ${groups.size} type${groups.size === 1 ? '' : 's'} saved by ${people(state)[by].name}${list.some((x) => x.source === 'ai') ? ` (${list.filter((x) => x.source === 'ai').length} suggested by Authority Lab)` : ''}.`,
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
  if (!add.length) throw new Error('The suggested test cases are already added.');
  return saveScenarios(state, capabilityId, { scenarios: [...existing, ...add], by });
}
