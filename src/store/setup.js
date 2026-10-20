// The setup flow (#139, Paige 2026-10-16). Setup is a draft until a person
// confirms it:
// - startCapability adds a capability as an unconfirmed draft: no granted
//   authority (the gate treats it as Level 0, everything blocked) and no
//   decision record.
// - Each step is saved as it's done (risk and the rest as versions), so
//   nothing is lost.
// - confirmSetup is where authority is first granted: it writes the starting
//   decision record (Level 0 or 1, or not delegated) and an immutable "Setup
//   confirmed" snapshot of what the person reviewed, together.
// Until then, no one may propose or grant more authority. Exploration is
// allowed: tests, evidence, configuration. The first result still locks the
// bar under the existing rules (C1).
//
// Capabilities from before #139 (seeded, configured, or added with
// addCapability) have no `setup` field: they count as established, on their
// existing history. Nothing is rewritten.

import { clone, getCapability, capData, emptyCapabilityData, updateCap, logEvent } from './state.js';
import { CONTEXT_QUESTION_KEYS, contextQuestions } from './exposure.js';
import { current, currentVersion, versionList, versionsInForce, levelName, performanceResultsSeen } from './selectors.js';
import { people, isActivePerson, snapshotPerson, requireActive } from './people.js';
import { slugify, RISK_OPTIONS, TODAY, amend, startingRecord, defaultFailureTypes } from './capabilities.js';
import { cleanLikelihoodScale, riskView } from './risk.js';
import { contextNow, contextVersions, confirmedContext, baselineNow, baselineVersions, authorityBaseline, LIFECYCLE, BASELINE_FIELDS } from './context.js';

// What an in-use capability's baseline must say before setup is confirmed.
export const BASELINE_REQUIRED = ['currentBehavior', 'humanInvolvement', 'permissions', 'safeguards'];
import { criteriaSaved } from './evidence.js';
import { findStartingPoint } from '../data/templates.js';

export const SETUP_STATES = { established: 'Established before setup confirmation existed', draft: 'In setup, not confirmed', confirmed: 'Setup confirmed' };

export function setupState(state, capabilityId) {
  const cap = getCapability(state, capabilityId);
  if (!cap || !cap.setup) return 'established';
  return cap.setup.status === 'confirmed' ? 'confirmed' : 'draft';
}

// Authority may be proposed or granted only on a confirmed (or established)
// setup.
export const setupConfirmed = (state, capabilityId) => setupState(state, capabilityId) !== 'draft';
export const UNCONFIRMED_REASON = 'Setup isn\'t confirmed yet. Review and confirm the setup before proposing or granting any authority.';

function draftCap(state, capabilityId) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  if (setupState(state, capabilityId) !== 'draft') throw new Error(`${cap.name}'s setup is already confirmed. Later changes follow the usual rules.`);
  return cap;
}

function patchSetup(state, capabilityId, patch) {
  return { ...state, capabilities: state.capabilities.map((c) => (c.id === capabilityId ? { ...c, setup: { ...c.setup, ...patch } } : c)) };
}

// ---------------------------------------------------------------------------
// Starting point and capability
// ---------------------------------------------------------------------------

export function startCapability(state, { name, summary, owner, template, lifecycle, by } = {}) {
  const cleanName = (name || '').trim();
  if (!cleanName) throw new Error('Give the capability a name.');
  if (!owner || !people(state)[owner]) throw new Error('Choose an owner.');
  if (!isActivePerson(state, owner)) throw new Error(`${people(state)[owner].name} is deactivated and cannot own a capability.`);
  const author = by && people(state)[by] ? by : owner;
  requireActive(state, author, 'start a capability');
  if (!findStartingPoint(template)) throw new Error('Choose a starting point: a template, or Start from scratch.');
  if (!['planned', 'in-use'].includes(lifecycle)) throw new Error('Say whether it is planned (or a pilot) or already in use.');
  let id = slugify(cleanName);
  if (getCapability(state, id)) {
    let n = 2;
    while (getCapability(state, `${id}-${n}`)) n += 1;
    id = `${id}-${n}`;
  }
  const cap = {
    id,
    name: cleanName,
    summary: (summary || '').trim(),
    owner,
    // No authority is granted until setup is confirmed; the gate reads Level 0.
    authority: { level: 0, limited: false },
    status: 'setup',
    definedOn: state.today,
    added: true,
    setup: { status: 'draft', template, lifecycle, startedOn: state.today, startedBy: author, today: null, rationale: '' },
  };
  const s = { ...state, capabilities: [...state.capabilities, cap], capabilityData: { ...state.capabilityData, [id]: emptyCapabilityData() } };
  return logEvent(s, { kind: 'setup', title: 'Capability setup started', body: `${people(state)[author].name} started setting up ${cleanName} (owner: ${people(state)[owner].name}) from ${findStartingPoint(template).name}. Nothing is granted until the setup is confirmed.`, capabilityId: id, link: `#/capabilities/${id}/setup` });
}

// Edit the draft's name, summary, owner, starting point or lifecycle.
export function editSetupCapability(state, capabilityId, { name, summary, owner, template, lifecycle } = {}) {
  const cap = draftCap(state, capabilityId);
  const next = { ...cap };
  if (name !== undefined) { if (!String(name).trim()) throw new Error('Give the capability a name.'); next.name = String(name).trim(); }
  if (summary !== undefined) next.summary = String(summary).trim();
  if (owner !== undefined) {
    if (!people(state)[owner] || !isActivePerson(state, owner)) throw new Error('Choose an active owner.');
    next.owner = owner;
  }
  const setup = { ...cap.setup };
  if (template !== undefined) { if (!findStartingPoint(template)) throw new Error('Choose a starting point.'); setup.template = template; }
  if (lifecycle !== undefined) { if (!['planned', 'in-use'].includes(lifecycle)) throw new Error('Say whether it is planned or already in use.'); setup.lifecycle = lifecycle; }
  next.setup = setup;
  return { ...state, capabilities: state.capabilities.map((c) => (c.id === capabilityId ? next : c)) };
}

// ---------------------------------------------------------------------------
// Risk and starting authority
// ---------------------------------------------------------------------------

const RISK_MISSING = { impact: 'Choose how serious a failure would be (Severity).', reversibility: 'Choose whether it can be undone.', exposure: 'Choose who or what is affected.' };

// Save the risk answers as a version of the risk profile. Likelihood must be
// answered, and Unknown is an answer.
export function saveSetupRisk(state, capabilityId, { impact, reversibility, exposure, likelihood, scale, failureTypes, note, contextAnswers, by } = {}) {
  draftCap(state, capabilityId);
  for (const [k, v] of Object.entries({ impact, reversibility, exposure })) if (!RISK_OPTIONS[k].includes(v)) throw new Error(RISK_MISSING[k]);
  if (likelihood === undefined || likelihood === '') throw new Error('Choose a Likelihood. If nobody knows yet, choose Unknown.');
  const extra = cleanLikelihoodScale({ likelihood, ...(scale ? { scale } : {}) });
  const chosen = (failureTypes || []).filter((f) => RISK_OPTIONS.failureTypes.includes(f));
  // This capability's answers to the questions Context raises (#154 review):
  // only a Yes here makes a workflow fact this capability's own.
  const answers = Object.fromEntries(Object.entries(contextAnswers || {}).filter(([k, v]) => CONTEXT_QUESTION_KEYS.includes(k) && ['yes', 'no'].includes(v)));
  const value = { impact, reversibility, exposure, failureTypes: chosen.length ? chosen : defaultFailureTypes({ impact, exposure }), ...(String(note || '').trim() ? { note: String(note).trim() } : {}), ...extra, ...(Object.keys(answers).length ? { contextAnswers: answers } : {}) };
  return amend(state, capabilityId, 'risk', { value, author: by, reason: versionList(state, capabilityId, 'risk').length ? 'Risk updated during setup.' : 'Risk set during setup.' });
}

// The declared starting authority, chosen from what it does today. Applied
// only at confirmation; nothing starts above Level 1.
export function setStartingAuthority(state, capabilityId, { today, rationale } = {}) {
  draftCap(state, capabilityId);
  if (!TODAY[today]) throw new Error('Choose what it does today.');
  return patchSetup(state, capabilityId, { today, rationale: String(rationale || '').trim() });
}

// ---------------------------------------------------------------------------
// Review and confirm
// ---------------------------------------------------------------------------

// What setup still needs before it can be confirmed, and what is open but
// allowed (shown on the review, never hidden).
export function setupReview(state, capabilityId) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  const s = cap.setup || {};
  const now = s.today ? TODAY[s.today] : null;
  const notDelegated = Boolean(now && now.notDelegated);
  const facts = confirmedContext(state);
  const pendingFacts = Object.entries(contextNow(state)).filter(([, f]) => f.status !== 'confirmed').map(([k]) => k);
  const risk = current(state, capabilityId, 'risk');
  const rv = riskView(state, capabilityId);
  const riskDone = versionList(state, capabilityId, 'risk').length > 0 && RISK_OPTIONS.impact.includes(risk.impact) && Boolean(risk.likelihood);
  const boundariesDone = versionList(state, capabilityId, 'contract').length > 0;
  const requirementsDone = criteriaSaved(state, capabilityId);
  const missing = [];
  if (!facts.purpose) missing.push({ step: 'context', text: 'Confirm the purpose in Context.' });
  if (!riskDone) missing.push({ step: 'risk', text: 'Answer the Risk questions, including Likelihood (Unknown is an answer).' });
  if (!now) missing.push({ step: 'risk', text: 'Choose the starting authority.' });
  if (notDelegated && (s.rationale || '').length < 20) missing.push({ step: 'risk', text: 'Say why this stays with people (a sentence or two).' });
  if (!notDelegated && !boundariesDone) missing.push({ step: 'boundaries', text: 'Review and save the Boundaries.' });
  if (!notDelegated && !requirementsDone) missing.push({ step: 'requirements', text: 'Save the Requirements.' });
  // Already in use (Paige, 2026-10-16, #141 review): what it really does
  // today must be recorded before setup is confirmed. Not certainty: any of
  // these can say "Unknown", and effective authority may stay unknown or not
  // recorded. But each has to be written down.
  if (s.lifecycle === 'in-use') {
    const b = baselineNow(state, capabilityId);
    const blank = BASELINE_REQUIRED.filter((k) => !b.recorded || !String(b[k] || '').trim());
    if (blank.length) missing.push({ step: 'today', text: `It is already in use: record what it does today (${blank.map((k) => BASELINE_FIELDS.find((f) => f.key === k).label.toLowerCase()).join('; ')}). Write "Unknown" where you don't know.` });
  }
  const targets = current(state, capabilityId, 'criteria');
  const requirements = current(state, capabilityId, 'requirements');
  const open = [
    ...targets.filter((t) => t.bar === 'needs-decision').map((t) => `Target "${t.name}" has no bar yet: Needs decision.`),
    ...requirements.filter((r) => r.bar === 'needs-decision').map((r) => `Requirement "${r.text}" has no number yet: Needs decision.`),
    ...pendingFacts.map((k) => `Context fact "${k}" is suggested but not confirmed, so it doesn't drive setup.`),
    ...contextQuestions(state, capabilityId).filter((q) => !q.answer).map((q) => `${q.question} Not answered yet, so it counts only toward suggestions.`),
    ...(s.lifecycle === 'in-use' && baselineVersions(state, capabilityId).length && authorityBaseline(state, capabilityId).effective.status !== 'recorded' ? ['It is already in use, and how independently it really operates today isn\'t known.'] : []),
    ...(current(state, capabilityId, 'stakeholders').length ? [] : ['No Reviewers or Stakeholders are named: the owner decides alone.']),
  ];
  const level = notDelegated ? 0 : now ? now.level : null;
  return {
    ready: missing.length === 0,
    missing,
    open,
    notDelegated,
    summary: {
      capability: { name: cap.name, summary: cap.summary, owner: cap.owner, template: s.template, lifecycle: s.lifecycle },
      context: facts,
      risk: { severity: rv.severityLabel, likelihood: rv.likelihood, scale: rv.scale, reversibility: rv.reversibility, exposure: risk.exposure || null, overall: rv.overall, why: rv.why },
      authority: { level, name: level === null ? null : levelName(level), today: s.today, effective: authorityBaseline(state, capabilityId).effective },
      versions: versionsInForce(state, capabilityId),
      results: performanceResultsSeen(state, capabilityId),
    },
  };
}

const deepFreeze = (o) => { Object.values(o).forEach((v) => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };

// The owner confirms: authority is first granted here. Writes the starting
// decision record and the Setup confirmed snapshot together.
export function confirmSetup(state, capabilityId, { by } = {}) {
  const cap = draftCap(state, capabilityId);
  requireActive(state, by, 'confirm the setup');
  if (by !== cap.owner) throw new Error(`Only the owner, ${people(state)[cap.owner].name}, can confirm the setup: it sets the starting authority.`);
  const review = setupReview(state, capabilityId);
  if (!review.ready) throw new Error(`Setup isn't ready to confirm: ${review.missing.map((m) => m.text).join(' ')}`);
  const now = TODAY[cap.setup.today];
  const level = review.summary.authority.level;
  const confirmationId = `SC-${capabilityId}`;
  const versions = versionsInForce(state, capabilityId);
  const record = startingRecord(state, cap, {
    level,
    notDelegated: review.notDelegated,
    now,
    today: cap.setup.today,
    reason: cap.setup.rationale,
    author: by,
    versions,
    extra: { setupConfirmation: confirmationId, openCondition: review.notDelegated ? 'Deliberately not delegated. Revisit only with a new decision.' : 'Setup confirmed. Next: gather evidence against the Requirements, then propose the first change of authority.' },
  });
  const snapshot = deepFreeze(clone({
    id: confirmationId,
    capabilityId,
    date: state.today,
    by,
    byAt: snapshotPerson(state, by),
    recordId: record.id,
    startingLevel: level,
    contextVersion: contextVersions(state).length,
    baselineVersion: baselineVersions(state, capabilityId).length,
    versions,
    summary: review.summary,
    open: review.open,
  }));
  let s = {
    ...state,
    capabilities: state.capabilities.map((c) => (c.id === capabilityId ? { ...c, authority: { level, limited: false }, status: review.notDelegated ? 'not-delegated' : 'setup', today: cap.setup.today, setup: { ...c.setup, status: 'confirmed', confirmedOn: state.today, confirmedBy: by, confirmationId } } : c)),
    decisionRecords: [...state.decisionRecords, record],
  };
  s = updateCap(s, capabilityId, (d) => ({ ...d, setupConfirmation: snapshot }));
  s = logEvent(s, { kind: 'setup-confirmed', surfaced: true, title: 'Setup confirmed', body: `${people(state)[by].name} reviewed and confirmed ${cap.name}'s setup. ${review.notDelegated ? 'It is not delegated, by design.' : `Starting authority: Level ${level} — ${levelName(level)}.`}${review.open.length ? ` Open at confirmation: ${review.open.length}.` : ''}`, capabilityId, link: `#/records/${record.id}` });
  return s;
}

export function setupConfirmation(state, capabilityId) {
  return capData(state, capabilityId).setupConfirmation || null;
}

// The line setup crosses when the first result is recorded (C1): from then
// on, the existing rules lock the bar and governed people choices.
export function resultsLockWarning(state, capabilityId) {
  if (performanceResultsSeen(state, capabilityId)) return null;
  return 'Once results are recorded, Requirements, Targets and governed People choices may need sign-off to change, even while setup is unconfirmed. That way the bar can\'t move after the results are in.';
}

export { LIFECYCLE };
