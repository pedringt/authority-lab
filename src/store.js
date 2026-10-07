// Application state for the prototype. Plain data, pure transitions, optional
// persistence. Views never mutate state directly; they dispatch actions.

import * as seed from './data/seed.js';

export const STORAGE_KEY = 'delegation-manager-state-v1';

const clone = (v) => JSON.parse(JSON.stringify(v));

export function initialState() {
  return {
    version: 1,
    today: seed.TODAY,
    capabilities: clone(seed.capabilities),
    testRun: { status: 'not-run', lastRun: '2026-10-03', completed: [] },
    decision: {
      option: null,
      conditions: clone(seed.defaultConditions),
      rationale: seed.defaultRationale,
      recordId: null,
    },
    decisionRecords: clone(seed.decisionRecords),
    activity: clone(seed.activity),
    evidence: clone(seed.evidenceItems),
    monitoring: null,
    alerts: [],
    reviewRequired: false,
  };
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function getCapability(state, id) {
  return state.capabilities.find((c) => c.id === id);
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

export function readiness(state) {
  const reqs = seed.evidenceRequirements;
  const met = reqs.filter((r) => r.met).length;
  return { met, total: reqs.length, unmet: reqs.filter((r) => !r.met) };
}

export function testSummary(state) {
  const total = seed.scenarios.length;
  const completedIds = new Set(state.testRun.completed);
  const completed = seed.scenarios.filter((s) => completedIds.has(s.id));
  const failed = completed.filter((s) => !s.pass);
  const highSeverity = failed.filter((s) => s.severity === 'High');
  return {
    status: state.testRun.status,
    total,
    completed: completed.length,
    passed: completed.filter((s) => s.pass).length,
    failed: failed.length,
    highSeverity: highSeverity.length,
    lastRun: state.testRun.lastRun,
    // Seeded Oct 3 result, used until the suite is run in this session.
    seeded: { passed: 24, failed: 2, highSeverity: 1 },
  };
}

export function conditionsPreview(conditions) {
  const parts = [];
  parts.push(`standard refunds of $${conditions.maxValue} or less`);
  const gated = [];
  if (conditions.noFraudFlag) gated.push('fraud-signaled');
  if (conditions.policyClear) gated.push('ambiguous');
  gated.push('high-value');
  if (conditions.policyClear) gated.push('policy-exception');
  if (conditions.noChargeback) gated.push('chargeback');
  return (
    `The AI can now automatically approve ${parts.join(' ')} when confidence is at least ${conditions.minConfidence}%. ` +
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

export function scopeText(option, conditions) {
  switch (option) {
    case 'expand':
      return 'Automatic refunds on all eligible cases under approved policy conditions.';
    case 'expand-limits':
      return `Automatic refunds ≤ $${conditions.maxValue} under approved policy conditions` +
        `${conditions.noFraudFlag ? ', no fraud flag' : ''}` +
        `${conditions.noChargeback ? ', no active chargeback' : ''}` +
        `, confidence ≥ ${conditions.minConfidence}%. Everything else requires human approval.`;
    case 'hold':
      return 'Authority unchanged. Draft with human approval on every case while more evidence is gathered.';
    case 'restrict':
      return 'Recommend only. A human prepares and approves every refund decision.';
    case 'suspend':
      return 'Capability disabled. The AI observes refund requests but produces no output.';
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

export function evidenceSnapshot() {
  const p = seed.pilot;
  return [
    `${p.cases} pilot cases`,
    `${p.accuracy}% decision accuracy`,
    `${p.severeErrorRate}% severe error rate`,
    `${p.overrideRate}% override rate`,
    `${Math.abs(p.resolutionChange)}% faster resolution`,
    `$${p.costPerCase.toFixed(2)} AI cost/case`,
    '24 of 26 scenarios passed (1 high-severity failure, mitigated)',
    '18 high-value cases (requirement: 40)',
  ];
}

// ---------------------------------------------------------------------------
// Transitions (pure: take state, return new state)
// ---------------------------------------------------------------------------

export function startTestRun(state) {
  if (state.testRun.status === 'running') return state;
  return { ...state, testRun: { ...state.testRun, status: 'running', completed: [] } };
}

export function advanceTestRun(state) {
  if (state.testRun.status !== 'running') return state;
  const next = seed.scenarios.find((s) => !state.testRun.completed.includes(s.id));
  if (!next) return state;
  const completed = [...state.testRun.completed, next.id];
  const done = completed.length === seed.scenarios.length;
  let s = { ...state, testRun: { ...state.testRun, completed, status: done ? 'complete' : 'running' } };
  if (done) s = finishTestRun(s);
  return s;
}

function finishTestRun(state) {
  const summary = testSummary({ ...state, testRun: { ...state.testRun, status: 'complete' } });
  const evidence = state.evidence.map((e) =>
    e.id === 'EV-01'
      ? {
          ...e,
          value: `${summary.passed} of ${summary.total} passed`,
          date: state.today,
          detail: `Run on ${fmtLong(state.today)} in this session. ${summary.failed} failures (${summary.highSeverity} high severity). The fraud escalation miss (H-04) reproduced; the enforcement gate still blocks any automatic action on that class of case. The wrong-policy-version case (E-01) also reproduced because the suite replays the recorded Oct 3 decisions.`,
        }
      : e
  );
  const activity = [
    {
      id: `ACT-${Date.now()}`,
      date: state.today,
      type: 'test',
      title: 'Test suite run',
      body: `${summary.passed} of ${summary.total} scenarios passed. ${summary.highSeverity} high-severity failure. Results recorded as evidence EV-01.`,
      capabilityId: 'refund-recommendation',
      link: '#/tests',
    },
    ...state.activity,
  ];
  return { ...state, testRun: { ...state.testRun, status: 'complete', lastRun: state.today }, evidence, activity };
}

export function selectDecision(state, option) {
  return { ...state, decision: { ...state.decision, option } };
}

export function setCondition(state, key, value) {
  return { ...state, decision: { ...state.decision, conditions: { ...state.decision.conditions, [key]: value } } };
}

export function setRationale(state, rationale) {
  return { ...state, decision: { ...state.decision, rationale } };
}

export function canAuthorize(state) {
  const d = state.decision;
  if (!d.option) return { ok: false, reason: 'Choose a decision option first.' };
  if (!d.rationale || d.rationale.trim().length < 20) return { ok: false, reason: 'Write a decision rationale (at least a sentence).' };
  const expanding = d.option === 'expand' || d.option === 'expand-limits';
  if (expanding && state.reviewRequired) {
    return { ok: false, reason: 'A post-incident review must be recorded before authority can expand again.' };
  }
  return { ok: true };
}

export function authorize(state, { by = 'maya' } = {}) {
  const check = canAuthorize(state);
  if (!check.ok) throw new Error(check.reason);
  const cap = getCapability(state, 'refund-recommendation');
  const option = state.decision.option;
  const previous = { ...cap.authority };
  const next = nextAuthority(option, previous);
  const number = state.decisionRecords.length + 1;
  const id = `AC-${String(number).padStart(2, '0')}`;
  const openCondition = {
    'expand': 'All segments now autonomous. High-value and fraud-signaled performance must be reviewed at 40 cases each.',
    'expand-limits': 'High-value refunds remain approval-required pending additional evidence (40 cases, currently 18).',
    'hold': 'Re-evaluate when 40 high-value cases have been observed.',
    'restrict': 'Return to Draft requires a new decision with fresh evidence.',
    'suspend': 'Re-enabling requires a new decision.',
    'redesign': 'A new test cycle must complete before any authority is restored.',
  }[option];

  const record = {
    id,
    number,
    capabilityId: cap.id,
    date: state.today,
    previous,
    next,
    option,
    authorizedBy: by,
    scope: scopeText(option, state.decision.conditions),
    rationale: state.decision.rationale.trim(),
    evidenceSnapshot: evidenceSnapshot(),
    openCondition,
    conditions: option === 'expand-limits' ? { ...state.decision.conditions } : null,
  };

  const statusByOption = {
    'expand': 'monitoring',
    'expand-limits': 'monitoring',
    'hold': 'pilot',
    'restrict': 'restricted',
    'suspend': 'suspended',
    'redesign': 'redesign',
  };

  const capabilities = state.capabilities.map((c) =>
    c.id === cap.id
      ? {
          ...c,
          authority: next,
          status: statusByOption[option],
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
        ? `Refund recommendation stays at ${authorityLabel(previous)}. Authorized by ${who.name}.`
        : `Refund recommendation moved from ${authorityLabel(previous)} to ${authorityLabel(next)}. Authorized by ${who.name}.`,
      capabilityId: cap.id,
      link: `#/decisions/${id}`,
    },
    ...state.activity,
  ];

  const expanding = option === 'expand' || option === 'expand-limits';
  const monitoring = expanding
    ? { ...seed.monitoringSeed, startedAt: state.today, breached: false, recordId: id, errors: [] }
    : null;

  return {
    ...state,
    capabilities,
    decisionRecords: [...state.decisionRecords, record],
    activity,
    decision: { ...state.decision, recordId: id },
    monitoring,
  };
}

export function simulateBreach(state) {
  if (!state.monitoring || state.monitoring.breached) return state;
  const cap = getCapability(state, 'refund-recommendation');
  const previous = { ...cap.authority };
  const next = { level: 2, limited: false };
  const m = state.monitoring;
  const errors = seed.breachSeed.severeErrorsInWindow;
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
    scope: 'Draft. Every refund decision requires human approval until a review is recorded.',
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
    title: 'Authority automatically restricted',
    body: `Refund recommendation returned to Draft. Severe error rate reached ${pct}% in the rolling ${m.rollingWindow}-case window (limit ${m.thresholdPct}%). A human review is required before authority can expand again.`,
    link: '#/capabilities/refund-recommendation?tab=monitoring',
  };

  const activity = [
    {
      id: `ACT-${Date.now()}-b`,
      date: state.today,
      type: 'restriction',
      title: 'Authority automatically restricted',
      body: `Severe error rate exceeded the allowed threshold (${pct}% against ${m.thresholdPct}% across ${m.rollingWindow} cases). Refund recommendation moved from ${authorityLabel(previous)} to ${authorityLabel(next)} by rule. Review item opened.`,
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
      link: '#/capabilities/refund-recommendation?tab=monitoring',
    },
    ...state.activity,
  ];

  const evidence = [
    {
      id: 'EV-13',
      source: 'Incident',
      metric: 'INC-02: monitoring threshold breached',
      value: `${pct}% severe errors in rolling ${m.rollingWindow}`,
      status: 'fail',
      risk: 'High',
      segment: 'Standard',
      date: state.today,
      detail: `${errors} severe errors in the rolling ${m.rollingWindow}-case window after expansion. ${seed.breachSeed.errors.join(' ')} Authority was returned to Draft automatically.`,
      link: `#/decisions/${id}`,
    },
    ...state.evidence,
  ];

  const capabilities = state.capabilities.map((c) =>
    c.id === cap.id ? { ...c, authority: next, status: 'review-required', lastEvaluated: state.today, lastDecisionId: id } : c
  );

  return {
    ...state,
    capabilities,
    decisionRecords: [...state.decisionRecords, record],
    activity,
    evidence,
    alerts: [alert, ...state.alerts],
    reviewRequired: true,
    monitoring: {
      ...m,
      breached: true,
      severeErrorsInWindow: errors,
      autonomousActions: m.autonomousActions + 7,
      incidents: 1,
      errors: seed.breachSeed.errors,
      breachedAt: state.today,
      breachRecordId: id,
    },
  };
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
    if (!parsed || parsed.version !== 1) return null;
    // A run interrupted by a reload restarts cleanly.
    if (parsed.testRun && parsed.testRun.status === 'running') {
      parsed.testRun = { ...parsed.testRun, status: 'not-run', completed: [] };
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
