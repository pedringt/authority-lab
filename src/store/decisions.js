// Authority decisions and records: the decision workspace, the plain-English
// scope copy, authorizing, and proposing a new level.

import { getCapability, capData, updateCap, logEvent } from './state.js';
import { versionsInForce, proposedAuthority, decisionRequired, levelName, authorityLabel, readiness, testSummary } from './selectors.js';
import { people, snapshotPerson, requireActive, isActivePerson } from './people.js';

export function actionNoun(cap) {
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
    `The AI can now automatically approve standard ${noun} of $${conditions.maxValue} or less when its own reported confidence is at least ${conditions.minConfidence}% (model-reported, not verified)` +
    (conditions.maxDailyTotal != null || conditions.maxDailyCount != null ? `, up to ${[conditions.maxDailyTotal != null ? `$${conditions.maxDailyTotal}` : null, conditions.maxDailyCount != null ? `${conditions.maxDailyCount} ${noun}` : null].filter(Boolean).join(' and ')} a day across all customers. ` : '. ') +
    `${capitalize(joinList(gated))} cases continue to require human review.`
  );
}

export function joinList(items) {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}
export function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function scopeText(option, conditions, cap, next = null) {
  const noun = actionNoun(cap);
  if (next && next.level === 2 && (option === 'expand' || option === 'expand-limits')) {
    return `Draft. The AI prepares ${noun} for a person to approve on every case; nothing happens without that approval. Limited pilot.`;
  }
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

// An expansion moves exactly one level, to the open proposal. Without a
// proposal for the next level up there is no expansion: authority stays as
// it is (it never falls back to a default level).
export function nextAuthority(option, current, proposed = null) {
  const oneUp = proposed && proposed.level === current.level + 1 ? proposed.level : null;
  switch (option) {
    case 'expand': return oneUp ? { level: oneUp, limited: false } : { ...current };
    case 'expand-limits': return oneUp ? { level: oneUp, limited: true } : { ...current };
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

export function selectDecision(state, capabilityId, option) {
  return updateCap(state, capabilityId, (d) => ({ ...d, decision: { ...d.decision, option } }));
}

export function setCondition(state, capabilityId, key, value) {
  return updateCap(state, capabilityId, (d) => ({ ...d, decision: { ...d.decision, conditions: { ...d.decision.conditions, [key]: value } } }));
}

export function setRationale(state, capabilityId, rationale) {
  return updateCap(state, capabilityId, (d) => ({ ...d, decision: { ...d.decision, rationale } }));
}

// Expected impact (roadmap item 9, B1, #72). Authorizing an expansion (any
// decision that raises the level) needs 2 to 4 expected outcomes, each a
// metric with a numeric target. They go on the decision record and never
// change. Restrict, suspend, redesign and hold don't need them.
export const OUTCOMES_MIN = 2;
export const OUTCOMES_MAX = 4;

// The number in a target, with its unit: "−40%" → { value: -40, unit: '%' },
// "< $0.20" → { value: 0.2, unit: '$' }. Null when there is no number.
export function parseTarget(target) {
  const m = String(target || '').match(/([-−+])?\s*(\$)?\s*(\d+(?:\.\d+)?)\s*(%)?/);
  if (!m) return null;
  const sign = m[1] === '-' || m[1] === '−' ? -1 : 1;
  return { value: sign * Number(m[3]), unit: m[4] ? '%' : m[2] ? '$' : null };
}

// Filled rows (a metric or a target typed), and what's wrong with them.
export function outcomeChecks(outcomes) {
  const rows = (Array.isArray(outcomes) ? outcomes : []).map((o) => ({ metric: String((o && o.metric) || '').trim(), target: String((o && o.target) || '').trim() }));
  const filled = rows.filter((o) => o.metric || o.target);
  const errors = [];
  if (filled.length < OUTCOMES_MIN) errors.push(`Add at least ${OUTCOMES_MIN} expected outcomes, each with a number (for example "Resolution time: at least 35% faster").`);
  if (filled.length > OUTCOMES_MAX) errors.push(`At most ${OUTCOMES_MAX} expected outcomes.`);
  filled.forEach((o, i) => {
    if (o.metric.length < 3) errors.push(`Outcome ${i + 1} needs a metric.`);
    if (o.metric.length > 80 || o.target.length > 60) errors.push(`Outcome ${i + 1} is too long.`);
    if (!parseTarget(o.target)) errors.push(`Outcome ${i + 1} needs a target with a number.`);
  });
  const metrics = filled.map((o) => o.metric.toLowerCase());
  if (new Set(metrics).size !== metrics.length) errors.push('Each expected outcome needs a different metric.');
  return { ok: !errors.length, errors, outcomes: filled.map((o) => ({ ...o, ...parseTarget(o.target) })) };
}

// Does this decision raise the capability's authority?
export function isExpansion(state, capabilityId, option) {
  const cap = getCapability(state, capabilityId);
  if (!cap || !option) return false;
  return nextAuthority(option, cap.authority, proposedAuthority(state, capabilityId)).level > cap.authority.level;
}

// Edit one expected-outcome row on the open decision. Refused once the
// decision is recorded: the outcomes are part of the record from then on.
export function setOutcome(state, capabilityId, index, field, value) {
  if (!decisionRequired(state, capabilityId)) throw new Error('No decision is open. Expected outcomes are part of the decision record and can\'t be edited after authorization.');
  const i = Number(index);
  if (!(Number.isInteger(i) && i >= 0 && i < OUTCOMES_MAX)) throw new Error(`An expected outcome is row 1 to ${OUTCOMES_MAX}.`);
  if (field !== 'metric' && field !== 'target') throw new Error('An expected outcome has a metric and a target.');
  return updateCap(state, capabilityId, (d) => {
    const rows = Array.from({ length: OUTCOMES_MAX }, (_, k) => ({ metric: '', target: '', ...((d.decision.outcomes || [])[k] || {}) }));
    rows[i] = { ...rows[i], [field]: String(value ?? '') };
    return { ...d, decision: { ...d.decision, outcomes: rows, outcomesPrefilled: false } };
  });
}

// Rollout plan (roadmap item 9, C1, #74). Authorizing an expansion also needs
// a plan for putting it into service: who owns the rollout, its scope, when
// it starts, where feedback goes, what reviewers need to know, and when it's
// reviewed. Frozen on the record like the expected outcomes.
export const ROLLOUT_FIELDS = [
  { key: 'owner', label: 'Rollout owner' },
  { key: 'scope', label: 'Scope', min: 10, max: 300 },
  { key: 'startDate', label: 'Start date' },
  { key: 'feedbackChannel', label: 'Feedback channel', min: 3, max: 120 },
  { key: 'reviewerNotes', label: 'What reviewers need to know', min: 20, max: 600 },
  { key: 'reviewDate', label: 'Review date' },
];
// A review no later than this many days after the start.
export const ROLLOUT_REVIEW_WITHIN_DAYS = 90;

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const days = (a, b) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000;

export function rolloutChecks(state, plan) {
  const p = Object.fromEntries(ROLLOUT_FIELDS.map((f) => [f.key, String((plan && plan[f.key]) || '').trim()]));
  const errors = [];
  if (!p.owner || !Object.hasOwn(people(state), p.owner) || !isActivePerson(state, p.owner)) errors.push('Choose an active person as the rollout owner.');
  for (const f of ROLLOUT_FIELDS.filter((x) => x.min)) {
    if (p[f.key].length < f.min) errors.push(`${f.label}: ${f.key === 'reviewerNotes' ? 'say what reviewers need to know (a sentence or two)' : 'fill this in'}.`);
    if (p[f.key].length > f.max) errors.push(`${f.label} is too long.`);
  }
  if (!isDate(p.startDate)) errors.push('Start date: a date is needed.');
  else if (p.startDate < state.today) errors.push('Start date: a rollout can\'t start before the decision.');
  if (!isDate(p.reviewDate)) errors.push('Review date: a date is needed.');
  else if (isDate(p.startDate) && !(p.reviewDate > p.startDate)) errors.push('Review date: after the start date.');
  else if (isDate(p.startDate) && days(p.startDate, p.reviewDate) > ROLLOUT_REVIEW_WITHIN_DAYS) errors.push(`Review date: within ${ROLLOUT_REVIEW_WITHIN_DAYS} days of the start.`);
  return { ok: !errors.length, errors, plan: p };
}

// Edit one field of the rollout plan on the open decision. Refused once the
// decision is recorded: the plan is part of the record from then on.
export function setRolloutField(state, capabilityId, field, value) {
  if (!decisionRequired(state, capabilityId)) throw new Error('No decision is open. The rollout plan is part of the decision record and can\'t be edited after authorization.');
  if (!ROLLOUT_FIELDS.some((f) => f.key === field)) throw new Error('Not a field of the rollout plan.');
  return updateCap(state, capabilityId, (d) => ({ ...d, decision: { ...d.decision, rollout: { ...(d.decision.rollout || {}), [field]: String(value ?? '') }, rolloutPrefilled: false } }));
}

const deepFreeze = (o) => { Object.values(o).forEach((v) => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };

// The rationale rule, in one place: canAuthorize uses it, and the decision
// page's checklist shows it (#96).
export const RATIONALE_MIN = 20;
export const rationaleOk = (text) => Boolean(text) && String(text).trim().length >= RATIONALE_MIN;

export function canAuthorize(state, capabilityId) {
  const d = capData(state, capabilityId).decision;
  if (!d.option) return { ok: false, reason: 'Choose a decision option first.' };
  if ((d.option === 'expand' || d.option === 'expand-limits') && !d.proposed) return { ok: false, reason: 'No authority change is proposed for this capability. Propose the next level first.' };
  // Belt and braces: the proposal must be for exactly one level up from now.
  if (d.option === 'expand' || d.option === 'expand-limits') {
    const cap = getCapability(state, capabilityId);
    if (d.proposed.level !== cap.authority.level + 1) return { ok: false, reason: `The open proposal is for Level ${d.proposed.level}, but ${cap.name} is at Level ${cap.authority.level}. Propose the next level, Level ${cap.authority.level + 1}, again.` };
  }
  if (!rationaleOk(d.rationale)) return { ok: false, reason: 'Write a decision rationale (at least a sentence).' };
  if (isExpansion(state, capabilityId, d.option)) {
    const oc = outcomeChecks(d.outcomes);
    if (!oc.ok) return { ok: false, reason: `Expected impact: ${oc.errors[0]}` };
    const rc = rolloutChecks(state, d.rollout);
    if (!rc.ok) return { ok: false, reason: `Rollout plan: ${rc.errors[0]}` };
  }
  const expanding = d.option === 'expand' || d.option === 'expand-limits';
  if (expanding && capData(state, capabilityId).reviewRequired) {
    return { ok: false, reason: 'A post-incident review must be recorded before authority can expand again.' };
  }
  return { ok: true };
}

export const STATUS_BY_OPTION = {
  'expand': 'monitoring',
  'expand-limits': 'monitoring',
  'hold': 'pilot',
  'restrict': 'restricted',
  'suspend': 'suspended',
  'redesign': 'redesign',
};

export function openConditionText(option, state, capabilityId) {
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
  requireActive(state, by, 'authorize an authority change');
  const cap = getCapability(state, capabilityId);
  const d = capData(state, capabilityId);
  const option = d.decision.option;
  const previous = { ...cap.authority };
  const next = nextAuthority(option, previous, proposedAuthority(state, capabilityId));
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
    option,
    owner: cap.owner,
    ownerAt: snapshotPerson(state, cap.owner),
    authorizedBy: by,
    authorizedByAt: snapshotPerson(state, by),
    versions: versionsInForce(state, capabilityId),
    scope: scopeText(option, d.decision.conditions, cap, next),
    rationale: d.decision.rationale.trim(),
    evidenceSnapshot: evidenceSnapshot(state, capabilityId),
    openCondition: openConditionText(option, state, capabilityId),
    conditions: option === 'expand-limits' && next.level >= 3 ? { ...d.decision.conditions } : null,
    // B1: what this expansion is expected to achieve, fixed from here on.
    expectedOutcomes: next.level > previous.level ? deepFreeze(outcomeChecks(d.decision.outcomes).outcomes) : null,
    // Authorized as prefilled for the demo, unedited: the record says so.
    ...(next.level > previous.level && d.decision.outcomesPrefilled ? { outcomesPrefilled: true } : {}),
    // C1: how the expansion goes into service, fixed from here on.
    rolloutPlan: next.level > previous.level ? deepFreeze({ ...rolloutChecks(state, d.decision.rollout).plan, ownerAt: snapshotPerson(state, d.decision.rollout.owner) }) : null,
    ...(next.level > previous.level && d.decision.rolloutPrefilled ? { rolloutPrefilled: true } : {}),
  };

  const expandingTo = option === 'expand' || option === 'expand-limits' ? next.level : null;
  const statusAfter = expandingTo === 2 ? 'pilot' : expandingTo && expandingTo >= 3 ? 'monitoring' : STATUS_BY_OPTION[option];
  const capabilities = state.capabilities.map((c) =>
    c.id === cap.id
      ? {
          ...c,
          authority: next,
          status: statusAfter,
          pilotLabel: expandingTo === 2 ? 'Limited pilot' : undefined,
        }
      : c
  );

  const who = people(state)[by];
  const verb = {
    'expand': 'expanded', 'expand-limits': 'expanded', 'hold': 'held', 'restrict': 'restricted', 'suspend': 'suspended', 'redesign': 'returned to redesign',
  }[option];
  const activity = [
    {
      id: `ACT-${Date.now()}`,
      date: state.today,
      kind: 'authority',
      surfaced: true,
      title: `Authority ${verb}`,
      body: option === 'hold'
        ? `${cap.name} stays at ${authorityLabel(previous)}. Authorized by ${who.name}.`
        : `${cap.name} moved from ${authorityLabel(previous)} to ${authorityLabel(next)}. Authorized by ${who.name}.`,
      capabilityId: cap.id,
      link: `#/decisions/${id}`,
    },
    ...state.activity,
  ];

  // Monitoring applies to autonomous authority (Level 3 and above). A move to
  // Draft starts a pilot, which is human-approved on every case.
  const expanding = (option === 'expand' || option === 'expand-limits') && next.level >= 3;
  const rule = d.monitoringRule || { windowDays: 0, autonomousActions: 0, escalated: 0, reversals: 0, incidents: 0, rollingWindow: 50, severeErrorsInWindow: 0, thresholdPct: 5, rule: 'Authority automatically returns to Draft if the severe error rate exceeds 5% across the rolling 50-case window.' };
  const monitoring = expanding ? { ...rule, startedAt: state.today, breached: false, recordId: id, errors: [] } : null;

  let s = updateCap(state, capabilityId, { decision: { ...d.decision, recordId: id, proposed: null }, monitoring });
  s = { ...s, capabilities, decisionRecords: [...state.decisionRecords, record], activity };
  // A restrict, suspend or redesign decided while a proposal to expand was
  // open closes that proposal too, and says so.
  if (d.decision.proposed && next.level < previous.level) {
    s = logEvent(s, { kind: 'decision', surfaced: true, title: `Proposal closed: authority changed from Level ${previous.level} to Level ${next.level}`, body: `${cap.name}: the open proposal to move to Level ${d.decision.proposed.level} was closed by this ${option} decision (${id}). Any expansion needs a new proposal, one level up from Level ${next.level}.`, capabilityId: cap.id, link: `#/decisions/${id}` });
  }
  return s;
}

// Open an authority decision for a capability: propose the next level. Needs
// a recorded test run. Used to take a new capability to Draft (its second record).
export function proposeAuthority(state, capabilityId, level, { by } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  requireActive(state, by, 'propose an authority change');
  if (decisionRequired(state, capabilityId)) throw new Error('A decision is already open for this capability.');
  if (cap.status === 'not-delegated') throw new Error('This capability is not delegated by design. Start with a new decision record if that should change.');
  const target = Number(level);
  if (target !== cap.authority.level + 1) throw new Error(`Authority moves one level at a time. The next level is ${cap.authority.level + 1}.`);
  if (!capData(state, capabilityId).testRun.lastRun) throw new Error('Run the test suite before proposing an authority change.');
  if (target >= 3 && !capData(state, capabilityId).pilot) throw new Error('Level 3 needs pilot evidence. Run a pilot at Draft first.');
  const d = capData(state, capabilityId);
  let s = updateCap(state, capabilityId, { decision: { ...d.decision, option: null, recordId: null, proposed: { level: target, limited: false }, openedAt: state.today, versionsAtOpen: versionsInForce(state, capabilityId), rationale: d.decision.rationale || `Test results support a limited, human-approved pilot. Every case is approved by a person at ${levelName(target)}.` } });
  return logEvent(s, {
    kind: 'decision',
    title: `Authority decision opened: ${authorityLabel(cap.authority, { short: true })} → Level ${target}`,
    body: `${cap.name}: ${people(state)[by].name} proposed moving to ${authorityLabel({ level: target, limited: false })}. The system can recommend; a person authorizes.`,
    capabilityId,
    link: `#/capabilities/${capabilityId}/decision`,
  });
}
