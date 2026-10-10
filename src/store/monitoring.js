// Monitoring: the restriction rules read from the contract, a simulated
// breach, and the automatic restriction it triggers.

import { getCapability, capData, updateCap } from './state.js';
import { versionsInForce, authorityLabel, current, currentVersion, levelName } from './selectors.js';
import { people, snapshotPerson, isActivePerson, isRiskApprover } from './people.js';
import { isHighOrFinancial } from './coverage.js';
import { gateMetricOf, gateReading } from './gatelog.js';

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
    // Rules the gate log can measure read it (A5); others read their readings.
    const fromGate = gateMetricOf(r) ? gateReading(state, capabilityId, r) : null;
    const value = fromGate !== null ? fromGate : Object.hasOwn(readings, r.text) ? readings[r.text] : null;
    return { ...r, value, measured: value !== null, crossed: r.active && ruleCrossed(r, value), fromGate: fromGate !== null };
  });
  return { running: rules.some((r) => r.active), rules };
}

// How a reading reads against its rule: "6% across the rolling 50-case window
// (limit 5%)", "2 in 7 days (limit 2)".
export function readingText(rule, value) {
  const t = rule.threshold;
  const w = rule.window || {};
  const span = w.cases ? ` across the rolling ${w.cases}-case window` : w.days ? ` over ${w.days} days` : '';
  return t && t.type === 'pct' ? `${value}%${span} (limit ${t.value}%)` : `${value}${w.days ? ` in ${w.days} days` : span} (limit ${t ? t.value : '?'})`;
}

const FALLBACK_SCOPE = {
  0: 'Observe. The AI produces no operational output until a review is recorded.',
  1: 'Recommend. The AI only recommends; a person decides every case until a review is recorded.',
  2: 'Draft. Every decision requires human approval until a review is recorded.',
  3: 'Act Within Limits. Automatic action only inside the recorded conditions until a review is recorded.',
};

// The demo breach for a seeded capability: the seeded breach names the
// contract rule it crosses and the reading that crosses it (#50). Capabilities
// added in the demo have no seeded breach, so nothing to simulate.
export function breachRule(state, capabilityId) {
  const d = capData(state, capabilityId);
  if (!d.breach || !d.breach.rule) return null;
  if ((d.monitoring && d.monitoring.breached) || (d.ruleIncidents || []).some((x) => x.rule === d.breach.rule)) return null;
  const rule = monitoringStatus(state, capabilityId).rules.find((r) => r.text === d.breach.rule);
  return rule && rule.active ? rule : null;
}

// Cross a contract rule. A restriction rule moves the capability to the level
// its line names (one level down if none), writes an automatic decision
// record, an alert, an incident and activity, and requires a review before
// authority can expand again. An incident rule opens an incident and leaves
// authority alone.
export function simulateBreach(state, capabilityId) {
  const rule = breachRule(state, capabilityId);
  if (!rule) return state;
  const d = capData(state, capabilityId);
  const m = d.monitoring;
  const breach = d.breach;
  // The rolling-window rule counts severe errors in the live window.
  const windowed = m && rule.window && rule.window.cases === m.rollingWindow && breach.severeErrorsInWindow;
  const value = windowed ? Math.round((breach.severeErrorsInWindow / m.rollingWindow) * 1000) / 10 : breach.value;
  return applyBreach(state, capabilityId, rule, { value, errors: breach.errors, severeErrorsInWindow: windowed ? breach.severeErrorsInWindow : null });
}

// Cross a contract rule with a reading: the shared breach flow, used by the
// seeded demo breach and by rules measured from the gate log (A5).
export function applyBreach(state, capabilityId, rule, { value, errors, severeErrorsInWindow = null }) {
  const d = capData(state, capabilityId);
  const cap = getCapability(state, capabilityId);
  const m = d.monitoring;
  const windowed = severeErrorsInWindow != null && m;
  const reading = readingText(rule, value);
  const contractV = rule.contractVersion ? `contract v${rule.contractVersion}` : 'the contract';
  const incidentNumber = d.evidence.filter((e) => e.source === 'Incident').length + 1;
  const incidentId = `INC-${String(incidentNumber).padStart(2, '0')}`;
  const evidenceId = `EV-${String(d.evidence.length + 1).padStart(2, '0')}`;
  const ruleReadings = { ...(d.ruleReadings || {}), [rule.text]: value };

  if (rule.kind === 'incident') {
    const evidence = [{ id: evidenceId, source: 'Incident', metric: `${incidentId}: contract rule triggered`, value: reading, status: 'fail', risk: 'High', segment: 'All', date: state.today, detail: `${errors.join(' ')} The contract rule "${rule.text}" opened this incident. Authority stays at ${authorityLabel(cap.authority)}.`, link: `#/capabilities/${cap.id}?tab=monitoring` }, ...d.evidence];
    const activity = [{ id: `ACT-${Date.now()}-i`, date: state.today, kind: 'failure', surfaced: true, title: 'Incident opened by a contract rule', body: `${cap.name}: ${errors.join(' ')} Authority unchanged.`, capabilityId: cap.id, link: `#/capabilities/${cap.id}?tab=monitoring` }, ...state.activity];
    const alert = { id: `ALERT-${Date.now()}`, date: state.today, severity: 'medium', capabilityId: cap.id, title: `Incident opened by a contract rule: ${cap.name}`, body: `${incidentId}: ${errors.join(' ')} Authority stays at ${authorityLabel(cap.authority)}.`, link: `#/capabilities/${cap.id}?tab=monitoring` };
    const s = updateCap(state, capabilityId, { evidence, ruleReadings, ruleIncidents: [...(d.ruleIncidents || []), { rule: rule.text, date: state.today, incidentId, evidenceId, errors: errors }] });
    return { ...s, activity, alerts: [alert, ...state.alerts] };
  }

  const previous = { ...cap.authority };
  const next = { level: rule.fallback, limited: false };
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
    scope: FALLBACK_SCOPE[next.level],
    rationale: `Automatic restriction. The contract rule "${rule.text}" was crossed: ${reading}. The rule was agreed in ${contractV}${m && m.recordId ? ` and in force since authority change ${m.recordId}` : ''}. No human authorized this change; the rule was authorized in advance.`,
    evidenceSnapshot: [
      ...(windowed ? [`${severeErrorsInWindow} severe errors in the last ${m.rollingWindow} autonomous cases (${value}%)`, `${m.autonomousActions + 7} autonomous actions since expansion`] : [`Reading: ${reading}`]),
      `Rule: ${rule.text}`,
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
    body: `${cap.name} returned to ${levelName(next.level)}. Reading ${reading}. A human review is required before authority can expand again.`,
    link: `#/capabilities/${cap.id}?tab=monitoring`,
  };
  const activity = [
    { id: `ACT-${Date.now()}-b`, date: state.today, kind: 'restriction', surfaced: true, title: 'Authority automatically restricted', body: `The contract rule was crossed: ${reading}. ${cap.name} moved from ${authorityLabel(previous)} to ${authorityLabel(next)} by rule. Review item opened.`, capabilityId: cap.id, link: `#/decisions/${id}` },
    { id: `ACT-${Date.now()}-a`, date: state.today, kind: 'failure', surfaced: true, title: 'Monitoring threshold breached', body: `${cap.name}: ${reading}. ${errors.length} error${errors.length === 1 ? '' : 's'} recorded.`, capabilityId: cap.id, link: `#/capabilities/${cap.id}?tab=monitoring` },
    ...state.activity,
  ];
  const evidence = [
    { id: evidenceId, source: 'Incident', metric: `${incidentId}: monitoring threshold breached`, value: reading, status: 'fail', risk: 'High', segment: 'Standard', date: state.today, detail: `${errors.join(' ')} Authority was returned to ${levelName(next.level)} automatically.`, link: `#/decisions/${id}` },
    ...d.evidence,
  ];
  const capabilities = state.capabilities.map((c) => (c.id === cap.id ? { ...c, authority: next, status: 'review-required' } : c));
  const s = updateCap(state, capabilityId, {
    evidence,
    ruleReadings,
    reviewRequired: true,
    monitoring: {
      ...(m || {}),
      breached: true,
      rule: rule.text,
      reading,
      errors: errors,
      breachedAt: state.today,
      breachRecordId: id,
      ...(windowed ? { severeErrorsInWindow: severeErrorsInWindow, autonomousActions: m.autonomousActions + 7, incidents: (m.incidents || 0) + 1 } : {}),
    },
  });
  return { ...s, capabilities, decisionRecords: [...state.decisionRecords, record], activity, alerts: [alert, ...state.alerts] };
}

// ---------------------------------------------------------------------------
// Post-incident review (#54)
// ---------------------------------------------------------------------------

// What a review would close: the review lock after an automatic restriction,
// and any rule incident not yet reviewed.
export function reviewNeeded(state, capabilityId) {
  const d = capData(state, capabilityId);
  const incidents = (d.ruleIncidents || []).filter((x) => !x.reviewId);
  return { restriction: Boolean(d.reviewRequired), incidents, any: Boolean(d.reviewRequired) || incidents.length > 0 };
}

// The human decision that set the authority an automatic restriction pulled
// back: the latest record before the restriction, made by a person, whose new
// level is the level the rule restricted from. null when there is no open
// restriction, or no such record (seeded authority with no record).
export function restrictedExpansion(state, capabilityId) {
  const d = capData(state, capabilityId);
  if (!d.reviewRequired || !d.monitoring || !d.monitoring.breachRecordId) return null;
  const restriction = state.decisionRecords.find((r) => r.id === d.monitoring.breachRecordId);
  if (!restriction || !restriction.previous) return null;
  const before = state.decisionRecords.filter((r) => r.capabilityId === capabilityId && r.number < restriction.number && r.authorizedBy !== 'system');
  const rec = before[before.length - 1];
  return rec && rec.next.level === restriction.previous.level ? rec : null;
}

// Who may record it: the owner or a Risk approver; for a High-impact or
// Financial capability, only a Risk approver. Never the system; never someone
// deactivated; and never the person who authorized the expansion that was
// automatically restricted (Paige, 2026-10-09): someone else looks at it.
export function reviewEligibility(state, capabilityId, personKey) {
  const cap = getCapability(state, capabilityId);
  const p = people(state)[personKey];
  if (!p) return { ok: false, reason: 'Choose who is acting.' };
  if (!isActivePerson(state, personKey)) return { ok: false, reason: `${p.name} is deactivated and cannot record a review.` };
  const risk = isRiskApprover(state, personKey);
  if (isHighOrFinancial(state, capabilityId) && !risk) return { ok: false, reason: `${cap.name} is High impact or Financial, so a Risk approver records the review. ${p.name} does not hold the Risk approver right.` };
  if (personKey !== cap.owner && !risk) return { ok: false, reason: `The owner (${people(state)[cap.owner].name}) or a Risk approver records the review.` };
  const expansion = restrictedExpansion(state, capabilityId);
  if (expansion && expansion.authorizedBy === personKey) return { ok: false, reason: `${p.name} authorized the expansion that was automatically restricted (${expansion.id}), so someone else records the review.` };
  return { ok: true, reason: null };
}

// Record the review. It clears the review lock, the capability's alerts and
// any open rule incident; authority stays where the rule left it, so expanding
// again still needs a proposal and a named authorization. Not a decision
// record: authority does not change.
export function recordReview(state, capabilityId, { by, whatHappened, cause, changes } = {}) {
  const need = reviewNeeded(state, capabilityId);
  if (!need.any) throw new Error('There is nothing to review: no automatic restriction or open rule incident.');
  const e = reviewEligibility(state, capabilityId, by);
  if (!e.ok) throw new Error(e.reason);
  const fields = { whatHappened: String(whatHappened || '').trim(), cause: String(cause || '').trim(), changes: String(changes || '').trim() };
  if (fields.whatHappened.length < 10) throw new Error('Say what happened (a sentence).');
  if (fields.cause.length < 10) throw new Error('Say what caused it (a sentence).');
  if (fields.changes.length < 10) throw new Error('Say what changed as a result (a sentence).');
  const d = capData(state, capabilityId);
  const cap = getCapability(state, capabilityId);
  const all = state.capabilities.flatMap((c) => capData(state, c.id).reviews || []);
  const id = `RV-${String(all.length + 1).padStart(2, '0')}`;
  const review = {
    id,
    date: state.today,
    by,
    byAt: snapshotPerson(state, by),
    ...fields,
    restrictionRecordId: need.restriction && d.monitoring ? d.monitoring.breachRecordId : null,
    incidentIds: need.incidents.map((x) => x.incidentId),
    authorityAt: { ...cap.authority },
  };
  const who = people(state)[by];
  const s = updateCap(state, capabilityId, {
    reviewRequired: false,
    reviews: [...(d.reviews || []), review],
    ruleIncidents: (d.ruleIncidents || []).map((x) => (x.reviewId ? x : { ...x, reviewId: id })),
    monitoring: d.monitoring ? { ...d.monitoring, reviewId: need.restriction ? id : d.monitoring.reviewId } : d.monitoring,
  });
  const capabilities = need.restriction ? s.capabilities.map((c) => (c.id === cap.id && c.status === 'review-required' ? { ...c, status: 'restricted' } : c)) : s.capabilities;
  const activity = [{
    id: `ACT-${Date.now()}-r`,
    date: state.today,
    kind: 'review',
    surfaced: true,
    title: 'Post-incident review recorded',
    body: `${who.name} reviewed ${[review.restrictionRecordId ? `the automatic restriction (${review.restrictionRecordId})` : null, review.incidentIds.length ? review.incidentIds.join(', ') : null].filter(Boolean).join(' and ')} on ${cap.name}. Cause: ${fields.cause} ${cap.name} stays at ${authorityLabel(cap.authority)}; expanding again needs a proposal and a named authorization.`,
    capabilityId: cap.id,
    link: `#/capabilities/${cap.id}?tab=monitoring`,
  }, ...s.activity];
  return { ...s, capabilities, activity, alerts: s.alerts.filter((a) => a.capabilityId !== cap.id) };
}

// The review that followed an automatic restriction record, if any.
export function reviewForRecord(state, recordId) {
  for (const c of state.capabilities) {
    const r = (capData(state, c.id).reviews || []).find((x) => x.restrictionRecordId === recordId);
    if (r) return r;
  }
  return null;
}
