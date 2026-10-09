// Monitoring: the restriction rules read from the contract, a simulated
// breach, and the automatic restriction it triggers.

import { getCapability, capData, updateCap } from './state.js';
import { versionsInForce, authorityLabel, current, currentVersion } from './selectors.js';
import { snapshotPerson } from './people.js';

// Restriction rules come from the contract's "Automatic restriction" lines
// (the contract wins, decided 2026-10-08). A line names its threshold, its
// window and the level it falls back to; a line that names no level falls back
// one level; a line that says the capability "stays at" a level opens an
// incident and leaves authority alone.
const LEVEL_NAMES = [['act within limits', 3], ['observe', 0], ['recommend', 1], ['draft', 2]];
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const num = (w) => (w in NUMBER_WORDS ? NUMBER_WORDS[w] : Number(w));

export function parseRestrictionLine(text) {
  const t = String(text || '').toLowerCase();
  const stays = /\bstays? at\b/.test(t);
  const to = t.match(/\breturns?\s+(?:the\s+capability\s+)?to\s+(act within limits|observe|recommend|draft)\b/);
  const fallback = to ? LEVEL_NAMES.find(([n]) => n === to[1])[1] : null;
  const pct = t.match(/\b(?:above|exceeds?|over|more than)\s+(\d+(?:\.\d+)?)\s*%/);
  const count = t.match(/^\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
  const rolling = t.match(/\brolling\s+(\d+)/);
  const days = t.match(/\b(\d+|seven|fourteen|thirty)[\s-]day/);
  return {
    text: String(text || ''),
    kind: stays ? 'incident' : 'restrict',
    threshold: pct ? { type: 'pct', value: Number(pct[1]) } : count ? { type: 'count', value: num(count[1]) } : null,
    window: rolling ? { cases: Number(rolling[1]) } : days ? { days: Number(days[1]) || { seven: 7, fourteen: 14, thirty: 30 }[days[1]] } : null,
    fallback,
  };
}

// The capability's rules under its current contract and authority. A rule is
// active while the capability is above its fallback level; an incident rule is
// always active.
export function restrictionRules(state, capabilityId) {
  const cap = getCapability(state, capabilityId);
  const contract = currentVersion(state, capabilityId, 'contract');
  const lines = current(state, capabilityId, 'contract').autoRestriction || [];
  const level = cap.authority.level;
  return lines.map((line, i) => {
    const r = parseRestrictionLine(line);
    if (r.kind === 'incident') return { ...r, id: `rule-${i + 1}`, contractVersion: contract && contract.version, fallback: null, defaulted: false, active: true };
    const named = r.fallback !== null;
    const fallback = named ? r.fallback : Math.max(0, level - 1);
    return { ...r, id: `rule-${i + 1}`, contractVersion: contract && contract.version, fallback, defaulted: !named, active: level > fallback };
  });
}

// Whether a reading crosses the rule: "above X%" is crossed above X; a count
// rule ("2 violations within 7 days") is crossed when the count reaches it.
export function ruleCrossed(rule, value) {
  if (value === null || value === undefined || !rule.threshold) return false;
  return rule.threshold.type === 'pct' ? value > rule.threshold.value : value >= rule.threshold.value;
}

// Monitoring runs whenever at least one of the contract's rules applies at the
// capability's current level (#49), at any level. Each rule carries its
// latest reading, or null when nothing has been measured.
export function monitoringStatus(state, capabilityId) {
  const readings = capData(state, capabilityId).ruleReadings || {};
  const rules = restrictionRules(state, capabilityId).map((r) => {
    const value = r.text in readings ? readings[r.text] : null;
    return { ...r, value, measured: value !== null, crossed: r.active && ruleCrossed(r, value) };
  });
  return { running: rules.some((r) => r.active), rules };
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
    sequence: state.decisionRecords.filter((r) => r.capabilityId === cap.id).length + 1,
    capabilityId: cap.id,
    date: state.today,
    previous,
    next,
    option: 'auto-restrict',
    owner: cap.owner,
    ownerAt: snapshotPerson(state, cap.owner),
    authorizedBy: 'system',
    authorizedByAt: null,
    versions: versionsInForce(state, capabilityId),
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
      kind: 'restriction',
      surfaced: true,
      title: 'Authority automatically restricted',
      body: `Severe error rate exceeded the allowed threshold (${pct}% against ${m.thresholdPct}% across ${m.rollingWindow} cases). ${cap.name} moved from ${authorityLabel(previous)} to ${authorityLabel(next)} by rule. Review item opened.`,
      capabilityId: cap.id,
      link: `#/decisions/${id}`,
    },
    {
      id: `ACT-${Date.now()}-a`,
      date: state.today,
      kind: 'failure',
      surfaced: true,
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
    c.id === cap.id ? { ...c, authority: next, status: 'review-required' } : c
  );

  const windowRule = restrictionRules(state, capabilityId).find((r) => r.window && r.window.cases === m.rollingWindow && r.threshold && r.threshold.type === 'pct');
  const s = updateCap(state, capabilityId, {
    evidence,
    ruleReadings: windowRule ? { ...(d.ruleReadings || {}), [windowRule.text]: pct } : d.ruleReadings,
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
