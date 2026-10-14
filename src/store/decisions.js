// Authority decisions and records: the decision workspace, the plain-English
// scope copy, authorizing, and proposing a new level.

import { getCapability, capData, updateCap, logEvent } from './state.js';
import { versionsInForce, proposedAuthority, decisionRequired, levelName, authorityLabel, readiness, testSummary, performanceResultsSeen } from './selectors.js';
import { people, snapshotPerson, requireActive, isActivePerson } from './people.js';
import { DECISION_OPTIONS } from '../data/seed.js';
import { externalSnapshot } from './external.js';

export function actionNoun(cap) {
  return (cap && cap.actionNoun) || 'actions';
}

// What Expand with limits would allow, shown before anyone has decided. It
// says what WOULD happen; the record's scope (scopeText) says what is in force.
export function conditionsPreview(conditions, cap) {
  const noun = actionNoun(cap);
  const gated = [];
  if (conditions.noFraudFlag) gated.push('fraud-flagged');
  if (conditions.policyClear) gated.push('unclear-policy');
  gated.push('high-value');
  if (conditions.policyClear) gated.push('policy-exception');
  if (conditions.noChargeback) gated.push('chargeback');
  return (
    `The AI would approve standard ${noun} of $${conditions.maxValue} or less on its own when its confidence is at least ${conditions.minConfidence}% (model-reported, not verified)` +
    (conditions.maxDailyTotal != null || conditions.maxDailyCount != null ? `, up to ${[conditions.maxDailyTotal != null ? `$${conditions.maxDailyTotal}` : null, conditions.maxDailyCount != null ? `${conditions.maxDailyCount} ${noun}` : null].filter(Boolean).join(' and ')} a day across all customers. ` : '. ') +
    `A person would still review ${joinList(gated)} cases.`
  );
}

export function joinList(items) {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}
export function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// The scope written on a decision record: what is in force once decided.
// `next` is the authority after the decision; without it the level-specific
// lines fall back to the capability's current level.
export function scopeText(option, conditions, cap, next = null) {
  const noun = actionNoun(cap);
  if (next && next.level === 2 && (option === 'expand' || option === 'expand-limits')) {
    return `The AI drafts ${noun} and a person approves every one before anything happens (Draft, limited pilot).`;
  }
  const level = (next || (cap && cap.authority) || { level: 0 }).level;
  switch (option) {
    case 'expand':
      return `The AI handles all eligible ${noun} on its own, within policy.`;
    case 'expand-limits':
      return `The AI handles ${noun} of $${conditions.maxValue} or less on its own, within policy` +
        `${conditions.noFraudFlag ? ', with no fraud flag' : ''}` +
        `${conditions.noChargeback ? ', with no active chargeback' : ''}` +
        `, when its confidence is at least ${conditions.minConfidence}% (model-reported, not verified). Everything else goes to a person.`;
    case 'hold':
      return `No change. The AI stays at ${levelName(level)} while more evidence comes in.`;
    case 'restrict':
      return level === 1 ? 'The AI only makes suggestions. A person prepares and approves every case.' : `Authority reduced. The AI moves down to ${levelName(level)}.`;
    case 'suspend':
      return 'The AI is switched off for this work. It sees requests but does nothing with them.';
    case 'redesign':
      return 'Sent back for changes. The AI does nothing for customers until it passes new tests.';
    default:
      return '';
  }
}

// An option's name for people ("Expand with limits"), never its id.
export function optionName(option) {
  return (DECISION_OPTIONS.find((o) => o.id === option) || { name: option }).name;
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
    out.push(n ? `${u.current} ${u.text.replace(/^Minimum \d+ /, '').toLowerCase()} (needed: ${n[0]})` : `${u.text}: ${u.current}`);
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

// Residual Risk (#137): the Risk left once the Boundaries and other controls
// are in place, as the person deciding sees it. Optional in Phase 1: when set
// it goes on the decision record and never changes; it is never required to
// authorize and software never sets it (Proposal/Decision is Phase 4).
export const RESIDUAL_RISK_LEVELS = ['Low', 'Moderate', 'High', 'Unknown'];
export function setResidualRisk(state, capabilityId, { level, note } = {}) {
  if (level === null) return updateCap(state, capabilityId, (d) => ({ ...d, decision: { ...d.decision, residualRisk: null } }));
  if (!RESIDUAL_RISK_LEVELS.includes(level)) throw new Error(`Residual risk must be one of: ${RESIDUAL_RISK_LEVELS.join(', ')}.`);
  return updateCap(state, capabilityId, (d) => ({ ...d, decision: { ...d.decision, residualRisk: { level, note: String(note || '').trim() } } }));
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
  if (filled.length < OUTCOMES_MIN) errors.push(`Add at least ${OUTCOMES_MIN} targets, each with a number (for example "Resolution time: at least 35% faster").`);
  if (filled.length > OUTCOMES_MAX) errors.push(`Use at most ${OUTCOMES_MAX} targets.`);
  filled.forEach((o, i) => {
    if (o.metric.length < 3) errors.push(`Target ${i + 1}: say what should improve.`);
    if (o.metric.length > 80 || o.target.length > 60) errors.push(`Target ${i + 1} is too long.`);
    if (!parseTarget(o.target)) errors.push(`Target ${i + 1} needs a number.`);
  });
  const metrics = filled.map((o) => o.metric.toLowerCase());
  if (new Set(metrics).size !== metrics.length) errors.push('Each target needs to measure something different.');
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
  if (!decisionRequired(state, capabilityId)) throw new Error('This decision has already been made, so its targets can\'t be changed.');
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
  if (!p.owner || !Object.hasOwn(people(state), p.owner) || !isActivePerson(state, p.owner)) errors.push('Choose a rollout owner (an active person).');
  for (const f of ROLLOUT_FIELDS.filter((x) => x.min)) {
    if (p[f.key].length < f.min) errors.push(`${f.label}: ${f.key === 'reviewerNotes' ? 'say what reviewers need to know (a sentence or two)' : 'fill this in'}.`);
    if (p[f.key].length > f.max) errors.push(`${f.label} is too long.`);
  }
  if (!isDate(p.startDate)) errors.push('Add a start date.');
  else if (p.startDate < state.today) errors.push('The start date can\'t be before the decision.');
  if (!isDate(p.reviewDate)) errors.push('Add a review date.');
  else if (isDate(p.startDate) && !(p.reviewDate > p.startDate)) errors.push('The review date must be after the start date.');
  else if (isDate(p.startDate) && days(p.startDate, p.reviewDate) > ROLLOUT_REVIEW_WITHIN_DAYS) errors.push(`The review date must be within ${ROLLOUT_REVIEW_WITHIN_DAYS} days of the start.`);
  return { ok: !errors.length, errors, plan: p };
}

// Edit one field of the rollout plan on the open decision. Refused once the
// decision is recorded: the plan is part of the record from then on.
export function setRolloutField(state, capabilityId, field, value) {
  if (!decisionRequired(state, capabilityId)) throw new Error('This decision has already been made, so its rollout plan can\'t be changed.');
  if (!ROLLOUT_FIELDS.some((f) => f.key === field)) throw new Error('Not a field of the rollout plan.');
  return updateCap(state, capabilityId, (d) => ({ ...d, decision: { ...d.decision, rollout: { ...(d.decision.rollout || {}), [field]: String(value ?? '') }, rolloutPrefilled: false } }));
}

const deepFreeze = (o) => { Object.values(o).forEach((v) => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };

// The rationale rule, in one place: canAuthorize uses it, and the decision
// page's checklist shows it (#96).
export const RATIONALE_MIN = 20;
export const rationaleOk = (text) => Boolean(text) && String(text).trim().length >= RATIONALE_MIN;
const RATIONALE_HINT = 'Say why you\'re making this decision (a sentence or more).';

export function canAuthorize(state, capabilityId) {
  const d = capData(state, capabilityId).decision;
  if (!d.option) return { ok: false, reason: 'Choose an option first.' };
  if ((d.option === 'expand' || d.option === 'expand-limits') && !d.proposed) return { ok: false, reason: 'No one has proposed more authority for this AI yet. Propose the next level first.' };
  // Belt and braces: the proposal must be for exactly one level up from now.
  if (d.option === 'expand' || d.option === 'expand-limits') {
    const cap = getCapability(state, capabilityId);
    if (d.proposed.level !== cap.authority.level + 1) return { ok: false, reason: `This decision was opened for Level ${d.proposed.level}, but ${cap.name} is now at Level ${cap.authority.level}. Propose Level ${cap.authority.level + 1} instead.` };
  }
  if (!rationaleOk(d.rationale)) return { ok: false, reason: RATIONALE_HINT };
  if (isExpansion(state, capabilityId, d.option)) {
    const oc = outcomeChecks(d.outcomes);
    if (!oc.ok) return { ok: false, reason: `Expected impact: ${oc.errors[0]}` };
    const rc = rolloutChecks(state, d.rollout);
    if (!rc.ok) return { ok: false, reason: `Rollout plan: ${rc.errors[0]}` };
  }
  const expanding = d.option === 'expand' || d.option === 'expand-limits';
  if (expanding && capData(state, capabilityId).reviewRequired) {
    return { ok: false, reason: 'The AI was moved back after crossing a safety limit. Record what happened (the post-incident review) before giving it more authority.' };
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
        ? `${unmet.map((u) => `${u.text} not met yet (currently ${u.current})`).join('; ')}. A person still approves those cases until there is more evidence.`
        : 'All checks were met when this decision was made.';
    case 'hold':
      return unmet.length ? `Decide again when: ${unmet.map((u) => u.text.toLowerCase()).join('; ')}.` : 'Decide again when there is new evidence.';
    case 'restrict': return 'Going back to the previous level needs a new decision with new evidence.';
    case 'suspend': return 'Turning it back on needs a new decision.';
    case 'redesign': return 'It needs to pass new tests before it gets any authority back.';
    default: return '';
  }
}

export function authorize(state, capabilityId, { by = 'maya' } = {}) {
  const check = canAuthorize(state, capabilityId);
  if (!check.ok) throw new Error(check.reason);
  requireActive(state, by, 'make this decision');
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
    // #119: imported evidence in force, with the configuration it describes.
    ...(externalSnapshot(state, capabilityId).length ? { externalEvidence: deepFreeze(externalSnapshot(state, capabilityId)) } : {}),
    openCondition: openConditionText(option, state, capabilityId),
    conditions: option === 'expand-limits' && next.level >= 3 ? { ...d.decision.conditions } : null,
    // B1: what this expansion is expected to achieve, fixed from here on.
    expectedOutcomes: next.level > previous.level ? deepFreeze(outcomeChecks(d.decision.outcomes).outcomes) : null,
    // Authorized as prefilled for the demo, unedited: the record says so.
    ...(next.level > previous.level && d.decision.outcomesPrefilled ? { outcomesPrefilled: true } : {}),
    // C1: how the expansion goes into service, fixed from here on.
    rolloutPlan: next.level > previous.level ? deepFreeze({ ...rolloutChecks(state, d.decision.rollout).plan, ownerAt: snapshotPerson(state, d.decision.rollout.owner) }) : null,
    ...(next.level > previous.level && d.decision.rolloutPrefilled ? { rolloutPrefilled: true } : {}),
    // #137: recorded only when the person deciding gave one.
    ...(d.decision.residualRisk ? { residualRisk: deepFreeze({ ...d.decision.residualRisk, by, byAt: snapshotPerson(state, by) }) } : {}),
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
  const title = {
    'expand': 'More authority given', 'expand-limits': 'More authority given, with limits', 'hold': 'Authority kept the same', 'restrict': 'Authority reduced', 'suspend': 'AI switched off', 'redesign': 'Sent back for changes',
  }[option];
  const activity = [
    {
      id: `ACT-${Date.now()}`,
      date: state.today,
      kind: 'authority',
      surfaced: true,
      title,
      body: option === 'hold'
        ? `${cap.name} stays at ${authorityLabel(previous)}. Decided by ${who.name}.`
        : `${cap.name} moved from ${authorityLabel(previous)} to ${authorityLabel(next)}. Decided by ${who.name}.`,
      capabilityId: cap.id,
      link: `#/records/${id}`,
    },
    ...state.activity,
  ];

  // Monitoring applies to autonomous authority (Level 3 and above). A move to
  // Draft starts a pilot, which is human-approved on every case.
  const expanding = (option === 'expand' || option === 'expand-limits') && next.level >= 3;
  const rule = d.monitoringRule || { windowDays: 0, autonomousActions: 0, escalated: 0, reversals: 0, incidents: 0, rollingWindow: 50, severeErrorsInWindow: 0, thresholdPct: 5, rule: 'If more than 5% of the last 50 cases have a severe error, the AI is moved back to Draft automatically.' };
  const monitoring = expanding ? { ...rule, startedAt: state.today, breached: false, recordId: id, errors: [] } : null;

  let s = updateCap(state, capabilityId, { decision: { ...d.decision, recordId: id, proposed: null, residualRisk: null }, monitoring });
  s = { ...s, capabilities, decisionRecords: [...state.decisionRecords, record], activity };
  // A restrict, suspend or redesign decided while a proposal to expand was
  // open closes that proposal too, and says so.
  if (d.decision.proposed && next.level < previous.level) {
    s = logEvent(s, { kind: 'decision', surfaced: true, title: `Proposal closed: authority changed from Level ${previous.level} to Level ${next.level}`, body: `${cap.name}: ${who.name} decided ${optionName(option)} (${id}), which moved it to Level ${next.level}, so the proposal to move to Level ${d.decision.proposed.level} was closed. To give it more authority later, propose Level ${next.level + 1}.`, capabilityId: cap.id, link: `#/records/${id}` });
  }
  return s;
}

// Evidence from real use (#126): a pilot, or any production result, imported
// or recorded by hand. Evals and in-app tests are not real use.
export function realUseEvidence(state, capabilityId) {
  const d = capData(state, capabilityId);
  return Boolean(d.pilot) || d.evidence.some((e) => e.external && e.external.kind === 'production');
}

// Open an authority decision for a capability: propose the next level. Needs
// a measured result from any source: an in-app test run, an imported result
// or one recorded by hand (Paige, 2026-10-13, #126; it was the in-app tests).
// Level 3 needs real-use evidence: a pilot, or production results from any
// source. Used to take a new capability to Draft (its second record).
export function proposeAuthority(state, capabilityId, level, { by } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error('This capability no longer exists.');
  requireActive(state, by, 'propose more authority');
  if (decisionRequired(state, capabilityId)) throw new Error('A decision is already open for this AI. Finish it first.');
  if (cap.status === 'not-delegated') throw new Error('This work is not delegated by design: it was deliberately kept with people, so the AI has no authority here.');
  const target = Number(level);
  if (target !== cap.authority.level + 1) throw new Error(`Authority moves one level at a time. The next level is ${cap.authority.level + 1}.`);
  if (!performanceResultsSeen(state, capabilityId)) throw new Error('There is no evidence yet. Run the tests, record a result, or have a connected source send results, then propose more authority.');
  if (target >= 3 && !realUseEvidence(state, capabilityId)) throw new Error('Level 3 needs evidence from real use: a pilot at Draft, or production results from a connected source or recorded by hand.');
  const d = capData(state, capabilityId);
  let s = updateCap(state, capabilityId, { decision: { ...d.decision, option: null, recordId: null, proposed: { level: target, limited: false }, residualRisk: null, openedAt: state.today, versionsAtOpen: versionsInForce(state, capabilityId), rationale: d.decision.rationale || `Test results support a limited, human-approved pilot. Every case is approved by a person at ${levelName(target)}.` } });
  return logEvent(s, {
    kind: 'decision',
    title: `More authority proposed: ${authorityLabel(cap.authority, { short: true })} → Level ${target}`,
    body: `${cap.name}: ${people(state)[by].name} proposed moving to ${authorityLabel({ level: target, limited: false })}. A person makes the decision.`,
    capabilityId,
    link: `#/capabilities/${capabilityId}/decision`,
  });
}
