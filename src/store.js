// Application state for the prototype. Plain data, pure transitions, optional
// persistence. Views never mutate state directly; they dispatch actions.
// Everything that belongs to one capability lives under
// state.capabilityData[capabilityId].

import * as seed from './data/seed.js';

export const STORAGE_KEY = 'authority-lab-state-v2';

const clone = (v) => JSON.parse(JSON.stringify(v));

export function emptyCapabilityData() {
  return {
    criteria: [],
    requirements: [],
    scenarios: [],
    pilot: null,
    evidence: [],
    stakeholders: [],
    stakeholderSummary: null,
    recommendation: null,
    monitoringRule: null,
    breach: null,
    testRun: { status: 'not-run', lastRun: null, completed: [] },
    decision: { option: null, conditions: { maxValue: 50, noFraudFlag: true, policyClear: true, minConfidence: 90, noChargeback: true }, rationale: '', recordId: null },
    monitoring: null,
    reviewRequired: false,
  };
}

function seededCapabilityData(id) {
  const base = emptyCapabilityData();
  const s = seed.capabilityData[id];
  if (!s) return base;
  return {
    ...base,
    criteria: clone(s.criteria || []),
    requirements: clone(s.requirements || []),
    scenarios: clone(s.scenarios || []),
    pilot: s.pilot ? clone(s.pilot) : null,
    evidence: clone(s.evidence || []),
    stakeholders: clone(s.stakeholders || []),
    stakeholderSummary: s.stakeholderSummary ? clone(s.stakeholderSummary) : null,
    recommendation: s.recommendation ? clone(s.recommendation) : null,
    monitoringRule: s.monitoringRule ? clone(s.monitoringRule) : null,
    breach: s.breach ? clone(s.breach) : null,
    testRun: { status: 'not-run', lastRun: s.lastTestRun || null, completed: [] },
    decision: {
      option: null,
      conditions: s.defaultConditions ? clone(s.defaultConditions) : base.decision.conditions,
      rationale: s.defaultRationale || '',
      recordId: null,
    },
  };
}

export function initialState() {
  return {
    version: 2,
    today: seed.TODAY,
    capabilities: clone(seed.capabilities),
    capabilityData: Object.fromEntries(seed.capabilities.map((c) => [c.id, seededCapabilityData(c.id)])),
    decisionRecords: clone(seed.decisionRecords),
    activity: clone(seed.activity),
    alerts: [],
  };
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function getCapability(state, id) {
  return state.capabilities.find((c) => c.id === id);
}

export function capData(state, id) {
  return state.capabilityData[id] || emptyCapabilityData();
}

// The capability the workspace should be looking at: an alert first, then a
// pending decision, then an active monitoring period, then the most recently
// evaluated one.
export function focusCapability(state) {
  const caps = state.capabilities;
  const alerted = caps.find((c) => c.status === 'review-required');
  if (alerted) return alerted;
  const pending = caps.find((c) => c.decisionRequired);
  if (pending) return pending;
  const monitored = caps.find((c) => capData(state, c.id).monitoring);
  if (monitored) return monitored;
  return caps.slice().sort((a, b) => (a.lastEvaluated < b.lastEvaluated ? 1 : -1))[0];
}

export function levelName(level) {
  const l = seed.AUTHORITY_LEVELS.find((x) => x.level === level);
  return l ? l.name : `Level ${level}`;
}

export function authorityLabel(auth, { short = false } = {}) {
  if (!auth) return '';
  const base = short ? `Level ${auth.level}` : `Level ${auth.level} — ${levelName(auth.level)}`;
  return auth.limited ? `${base} (limited)` : base;
}

export function readiness(state, capabilityId) {
  const reqs = capData(state, capabilityId).requirements;
  const met = reqs.filter((r) => r.met).length;
  return { met, total: reqs.length, unmet: reqs.filter((r) => !r.met) };
}

export function testSummary(state, capabilityId) {
  const d = capData(state, capabilityId);
  const total = d.scenarios.length;
  const completedIds = new Set(d.testRun.completed);
  const completed = d.scenarios.filter((s) => completedIds.has(s.id));
  const failed = completed.filter((s) => !s.pass);
  const highSeverity = failed.filter((s) => s.severity === 'High');
  // The recorded result of the whole library, shown until the suite is run in
  // this session.
  const recordedFailed = d.scenarios.filter((s) => !s.pass);
  return {
    status: d.testRun.status,
    total,
    completed: completed.length,
    passed: completed.filter((s) => s.pass).length,
    failed: failed.length,
    highSeverity: highSeverity.length,
    lastRun: d.testRun.lastRun,
    recorded: {
      passed: total - recordedFailed.length,
      failed: recordedFailed.length,
      highSeverity: recordedFailed.filter((s) => s.severity === 'High').length,
    },
  };
}

function actionNoun(cap) {
  return (cap && cap.actionNoun) || 'actions';
}

export function conditionsPreview(conditions, cap) {
  const noun = actionNoun(cap);
  const gated = [];
  if (conditions.noFraudFlag) gated.push('fraud-signaled');
  if (conditions.policyClear) gated.push('ambiguous');
  gated.push('high-value');
  if (conditions.policyClear) gated.push('policy-exception');
  if (conditions.noChargeback) gated.push('chargeback');
  return (
    `The AI can now automatically approve standard ${noun} of $${conditions.maxValue} or less when confidence is at least ${conditions.minConfidence}%. ` +
    `${capitalize(joinList(gated))} cases continue to require human review.`
  );
}

function joinList(items) {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function scopeText(option, conditions, cap) {
  const noun = actionNoun(cap);
  switch (option) {
    case 'expand':
      return `Automatic ${noun} on all eligible cases under approved policy conditions.`;
    case 'expand-limits':
      return `Automatic ${noun} ≤ $${conditions.maxValue} under approved policy conditions` +
        `${conditions.noFraudFlag ? ', no fraud flag' : ''}` +
        `${conditions.noChargeback ? ', no active chargeback' : ''}` +
        `, confidence ≥ ${conditions.minConfidence}%. Everything else requires human approval.`;
    case 'hold':
      return 'Authority unchanged. Draft with human approval on every case while more evidence is gathered.';
    case 'restrict':
      return `Recommend only. A human prepares and approves every decision.`;
    case 'suspend':
      return `Capability disabled. The AI observes requests but produces no output.`;
    case 'redesign':
      return 'Capability returned to development. No operational output until a new test cycle completes.';
    default:
      return '';
  }
}

export function nextAuthority(option, current) {
  switch (option) {
    case 'expand': return { level: 3, limited: false };
    case 'expand-limits': return { level: 3, limited: true };
    case 'hold': return { ...current };
    case 'restrict': return { level: Math.max(0, current.level - 1), limited: false };
    case 'suspend': return { level: 0, limited: false };
    case 'redesign': return { level: 0, limited: false };
    default: return { ...current };
  }
}

export function evidenceSnapshot(state, capabilityId) {
  const d = capData(state, capabilityId);
  const p = d.pilot;
  const out = [];
  if (p) {
    out.push(
      `${p.cases} pilot cases`,
      `${p.accuracy}% decision accuracy`,
      `${p.severeErrorRate}% severe error rate`,
      `${p.overrideRate}% override rate`,
      `${Math.abs(p.resolutionChange)}% faster resolution`,
      `$${p.costPerCase.toFixed(2)} AI cost/case`,
    );
  }
  const t = testSummary(state, capabilityId);
  if (t.total) {
    const r = t.status === 'complete' ? { passed: t.passed, high: t.highSeverity } : { passed: t.recorded.passed, high: t.recorded.highSeverity };
    out.push(`${r.passed} of ${t.total} scenarios passed${r.high ? ` (${r.high} high-severity failure${r.high > 1 ? 's' : ''}, mitigated)` : ''}`);
  }
  readiness(state, capabilityId).unmet.forEach((u) => {
    const n = u.text.match(/\d+/);
    out.push(n ? `${u.current} ${u.text.replace(/^Minimum \d+ /, '').toLowerCase()} (requirement: ${n[0]})` : `${u.text}: ${u.current}`);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Transitions (pure: take state, return new state)
// ---------------------------------------------------------------------------

function updateCap(state, capabilityId, patch) {
  const current = capData(state, capabilityId);
  const next = typeof patch === 'function' ? patch(current) : { ...current, ...patch };
  return { ...state, capabilityData: { ...state.capabilityData, [capabilityId]: next } };
}

export function startTestRun(state, capabilityId) {
  const d = capData(state, capabilityId);
  if (d.testRun.status === 'running' || !d.scenarios.length) return state;
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

function finishTestRun(state, capabilityId) {
  const d = capData(state, capabilityId);
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
      type: 'test',
      title: 'Test suite run',
      body: `${summary.passed} of ${summary.total} scenarios passed. ${summary.highSeverity} high-severity failure${summary.highSeverity === 1 ? '' : 's'}. Results recorded as evidence ${item.id}.`,
      capabilityId,
      link: `#/tests?capability=${capabilityId}`,
    },
    ...state.activity,
  ];
  const s = updateCap(state, capabilityId, { testRun: { ...d.testRun, status: 'complete', lastRun: state.today }, evidence });
  return { ...s, activity };
}

export function selectDecision(state, capabilityId, option) {
  return updateCap(state, capabilityId, (d) => ({ ...d, decision: { ...d.decision, option } }));
}

export function setCondition(state, capabilityId, key, value) {
  return updateCap(state, capabilityId, (d) => ({ ...d, decision: { ...d.decision, conditions: { ...d.decision.conditions, [key]: value } } }));
}

export function setRationale(state, capabilityId, rationale) {
  return updateCap(state, capabilityId, (d) => ({ ...d, decision: { ...d.decision, rationale } }));
}

export function canAuthorize(state, capabilityId) {
  const d = capData(state, capabilityId).decision;
  if (!d.option) return { ok: false, reason: 'Choose a decision option first.' };
  if (!d.rationale || d.rationale.trim().length < 20) return { ok: false, reason: 'Write a decision rationale (at least a sentence).' };
  const expanding = d.option === 'expand' || d.option === 'expand-limits';
  if (expanding && capData(state, capabilityId).reviewRequired) {
    return { ok: false, reason: 'A post-incident review must be recorded before authority can expand again.' };
  }
  return { ok: true };
}

const STATUS_BY_OPTION = {
  'expand': 'monitoring',
  'expand-limits': 'monitoring',
  'hold': 'pilot',
  'restrict': 'restricted',
  'suspend': 'suspended',
  'redesign': 'redesign',
};

function openConditionText(option, state, capabilityId) {
  const unmet = readiness(state, capabilityId).unmet;
  switch (option) {
    case 'expand':
    case 'expand-limits':
      return unmet.length
        ? `${unmet.map((u) => `${u.text} not met (currently ${u.current})`).join('; ')}. Affected cases remain approval-required pending additional evidence.`
        : 'All evidence requirements were met at the time of the decision.';
    case 'hold':
      return unmet.length ? `Re-evaluate when: ${unmet.map((u) => u.text.toLowerCase()).join('; ')}.` : 'Re-evaluate on new evidence.';
    case 'restrict': return 'Return to the previous level requires a new decision with fresh evidence.';
    case 'suspend': return 'Re-enabling requires a new decision.';
    case 'redesign': return 'A new test cycle must complete before any authority is restored.';
    default: return '';
  }
}

export function authorize(state, capabilityId, { by = 'maya' } = {}) {
  const check = canAuthorize(state, capabilityId);
  if (!check.ok) throw new Error(check.reason);
  const cap = getCapability(state, capabilityId);
  const d = capData(state, capabilityId);
  const option = d.decision.option;
  const previous = { ...cap.authority };
  const next = nextAuthority(option, previous);
  const number = state.decisionRecords.length + 1;
  const id = `AC-${String(number).padStart(2, '0')}`;

  const record = {
    id,
    number,
    capabilityId: cap.id,
    date: state.today,
    previous,
    next,
    option,
    authorizedBy: by,
    scope: scopeText(option, d.decision.conditions, cap),
    rationale: d.decision.rationale.trim(),
    evidenceSnapshot: evidenceSnapshot(state, capabilityId),
    openCondition: openConditionText(option, state, capabilityId),
    conditions: option === 'expand-limits' ? { ...d.decision.conditions } : null,
  };

  const capabilities = state.capabilities.map((c) =>
    c.id === cap.id
      ? {
          ...c,
          authority: next,
          status: STATUS_BY_OPTION[option],
          pilotLabel: undefined,
          decisionRequired: false,
          proposed: undefined,
          lastEvaluated: state.today,
          lastDecisionId: id,
        }
      : c
  );

  const who = seed.people[by];
  const verb = {
    'expand': 'expanded', 'expand-limits': 'expanded', 'hold': 'held', 'restrict': 'restricted', 'suspend': 'suspended', 'redesign': 'returned to redesign',
  }[option];
  const activity = [
    {
      id: `ACT-${Date.now()}`,
      date: state.today,
      type: 'authority',
      title: `Authority ${verb}`,
      body: option === 'hold'
        ? `${cap.name} stays at ${authorityLabel(previous)}. Authorized by ${who.name}.`
        : `${cap.name} moved from ${authorityLabel(previous)} to ${authorityLabel(next)}. Authorized by ${who.name}.`,
      capabilityId: cap.id,
      link: `#/decisions/${id}`,
    },
    ...state.activity,
  ];

  const expanding = option === 'expand' || option === 'expand-limits';
  const rule = d.monitoringRule || { windowDays: 0, autonomousActions: 0, escalated: 0, reversals: 0, incidents: 0, rollingWindow: 50, severeErrorsInWindow: 0, thresholdPct: 5, rule: 'Authority automatically returns to Draft if the severe error rate exceeds 5% across the rolling 50-case window.' };
  const monitoring = expanding ? { ...rule, startedAt: state.today, breached: false, recordId: id, errors: [] } : null;

  const s = updateCap(state, capabilityId, { decision: { ...d.decision, recordId: id }, monitoring });
  return { ...s, capabilities, decisionRecords: [...state.decisionRecords, record], activity };
}

export function simulateBreach(state, capabilityId) {
  const d = capData(state, capabilityId);
  if (!d.monitoring || d.monitoring.breached) return state;
  const cap = getCapability(state, capabilityId);
  const previous = { ...cap.authority };
  const next = { level: 2, limited: false };
  const m = d.monitoring;
  const breach = d.breach || {
    severeErrorsInWindow: Math.floor((m.thresholdPct / 100) * m.rollingWindow) + 1,
    errors: ['Severe errors injected by the demo control.'],
  };
  const errors = breach.severeErrorsInWindow;
  const pct = Math.round((errors / m.rollingWindow) * 1000) / 10;
  const number = state.decisionRecords.length + 1;
  const id = `AC-${String(number).padStart(2, '0')}`;

  const record = {
    id,
    number,
    capabilityId: cap.id,
    date: state.today,
    previous,
    next,
    option: 'auto-restrict',
    authorizedBy: 'system',
    scope: 'Draft. Every decision requires human approval until a review is recorded.',
    rationale: `Automatic restriction. Severe error rate reached ${pct}% across the rolling ${m.rollingWindow}-case window, above the ${m.thresholdPct}% limit set in authority change ${m.recordId}. No human authorized this change; the rule was authorized in advance.`,
    evidenceSnapshot: [
      `${errors} severe errors in the last ${m.rollingWindow} autonomous cases (${pct}%)`,
      `${m.autonomousActions + 7} autonomous actions since expansion`,
      `Threshold: ${m.thresholdPct}%`,
    ],
    openCondition: 'Human review required before authority can expand again.',
    conditions: null,
  };

  const alert = {
    id: `ALERT-${Date.now()}`,
    date: state.today,
    severity: 'high',
    capabilityId: cap.id,
    title: 'Authority automatically restricted',
    body: `${cap.name} returned to Draft. Severe error rate reached ${pct}% in the rolling ${m.rollingWindow}-case window (limit ${m.thresholdPct}%). A human review is required before authority can expand again.`,
    link: `#/capabilities/${cap.id}?tab=monitoring`,
  };

  const activity = [
    {
      id: `ACT-${Date.now()}-b`,
      date: state.today,
      type: 'restriction',
      title: 'Authority automatically restricted',
      body: `Severe error rate exceeded the allowed threshold (${pct}% against ${m.thresholdPct}% across ${m.rollingWindow} cases). ${cap.name} moved from ${authorityLabel(previous)} to ${authorityLabel(next)} by rule. Review item opened.`,
      capabilityId: cap.id,
      link: `#/decisions/${id}`,
    },
    {
      id: `ACT-${Date.now()}-a`,
      date: state.today,
      type: 'failure',
      title: 'Monitoring threshold breached',
      body: `${errors} severe errors recorded in the rolling ${m.rollingWindow}-case window after expansion.`,
      capabilityId: cap.id,
      link: `#/capabilities/${cap.id}?tab=monitoring`,
    },
    ...state.activity,
  ];

  const incidentNumber = d.evidence.filter((e) => e.source === 'Incident').length + 1;
  const evidence = [
    {
      id: `EV-${String(d.evidence.length + 1).padStart(2, '0')}`,
      source: 'Incident',
      metric: `INC-${String(incidentNumber).padStart(2, '0')}: monitoring threshold breached`,
      value: `${pct}% severe errors in rolling ${m.rollingWindow}`,
      status: 'fail',
      risk: 'High',
      segment: 'Standard',
      date: state.today,
      detail: `${errors} severe errors in the rolling ${m.rollingWindow}-case window after expansion. ${breach.errors.join(' ')} Authority was returned to Draft automatically.`,
      link: `#/decisions/${id}`,
    },
    ...d.evidence,
  ];

  const capabilities = state.capabilities.map((c) =>
    c.id === cap.id ? { ...c, authority: next, status: 'review-required', lastEvaluated: state.today, lastDecisionId: id } : c
  );

  const s = updateCap(state, capabilityId, {
    evidence,
    reviewRequired: true,
    monitoring: {
      ...m,
      breached: true,
      severeErrorsInWindow: errors,
      autonomousActions: m.autonomousActions + 7,
      incidents: (m.incidents || 0) + 1,
      errors: breach.errors,
      breachedAt: state.today,
      breachRecordId: id,
    },
  });
  return { ...s, capabilities, decisionRecords: [...state.decisionRecords, record], activity, alerts: [alert, ...state.alerts] };
}

export function reset() {
  return initialState();
}

// ---------------------------------------------------------------------------
// Store wrapper with persistence and subscriptions
// ---------------------------------------------------------------------------

export function createStore({ storage = null } = {}) {
  let state = load(storage) || initialState();
  const listeners = new Set();

  function set(next) {
    if (next === state) return;
    state = next;
    save(storage, state);
    listeners.forEach((fn) => fn(state));
  }

  return {
    get: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    dispatch(action, ...args) {
      const fn = ACTIONS[action];
      if (!fn) throw new Error(`Unknown action: ${action}`);
      set(fn(state, ...args));
    },
  };
}

const ACTIONS = {
  startTestRun,
  advanceTestRun,
  selectDecision,
  setCondition,
  setRationale,
  authorize,
  simulateBreach,
  reset,
};

function load(storage) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 2) return null;
    // A run interrupted by a reload restarts cleanly.
    for (const id of Object.keys(parsed.capabilityData || {})) {
      const d = parsed.capabilityData[id];
      if (d.testRun && d.testRun.status === 'running') d.testRun = { ...d.testRun, status: 'not-run', completed: [] };
    }
    return parsed;
  } catch {
    return null;
  }
}

function save(storage, state) {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be unavailable (private window, blocked). The app still works.
  }
}

export function fmtLong(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[m - 1]} ${d}, ${y}`;
}
