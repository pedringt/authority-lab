// Monitoring: a simulated breach and the automatic restriction it triggers.

import { getCapability, capData, updateCap } from './state.js';
import { versionsInForce, authorityLabel } from './selectors.js';
import { snapshotPerson } from './people.js';

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
