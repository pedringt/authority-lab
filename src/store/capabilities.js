// Adding a capability (#4) and amending its versioned objects.

import { clone, emptyCapabilityData, VERSIONED_KINDS, firstVersion, getCapability, capData, updateCap, logEvent } from './state.js';
import { currentVersion, performanceResultsSeen, authorityLabel } from './selectors.js';
import { people, isActivePerson, snapshotPerson } from './people.js';
import { cleanLikelihoodScale } from './risk.js';

// A non-blocking warning when a capability name reads like more than one
// action or like a whole process.
export function vagueNameWarning(name) {
  const n = (name || '').trim();
  if (!n) return null;
  if (/\b(handle|handles|handling|manage|manages|managing)\b/i.test(n)) {
    return 'This sounds like a whole process. Name one action instead, e.g. "Recommend a refund" rather than "Handle refunds".';
  }
  if (/\b\S+\s+and\s+\S+/i.test(n)) {
    return 'This may be two actions. Add each one separately so each can earn its own authority.';
  }
  return null;
}

export function slugify(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'capability';
}

// The answers are also logic keys (contract templates, criteria defaults,
// coverage): change the questions around them, never these values.
export const RISK_OPTIONS = {
  impact: ['Low', 'Medium', 'High'],
  reversibility: ['Easy to reverse', 'Recoverable with effort', 'Difficult to reverse'],
  exposure: ['Internal only', 'Customer-facing', 'Financial / consequential'],
  failureTypes: ['Wrong answer', 'Wrong action', 'Policy violation', 'Hallucination', 'Missing escalation', 'Excessive cost', 'User over-reliance', 'User rejection', 'Silent failure'],
};

// "What does it do today?" (Paige, 2026-10-12) is context, not authority. Each
// answer maps to a starting level of 0 or 1; what it already does in the real
// world is recorded on the first decision record, and formalizing it is the
// first authority decision. Nothing starts above Level 1.
export const TODAY = {
  nothing: { level: 0, label: 'Nothing yet' },
  recommends: { level: 1, label: 'Recommends' },
  drafts: { level: 1, label: 'Drafts for approval', note: 'Today, this capability already drafts actions for people to approve. Authority Lab will start it at Recommend until that autonomy is reviewed and formally approved.' },
  acts: { level: 1, label: 'Already acts in some cases', note: 'Today, this capability already acts automatically in some cases. Authority Lab will start it at Recommend until that autonomy is reviewed and formally approved.' },
  'not-delegated': { level: 0, label: 'Not something to delegate', notDelegated: true },
};

// What could go wrong, when nobody picks: the failures every capability can
// have, plus the ones its risk profile makes likely.
export function defaultFailureTypes(risk = {}) {
  const out = ['Wrong answer', 'Missing escalation', 'Silent failure'];
  if (risk.exposure === 'Customer-facing') out.push('Hallucination', 'User over-reliance');
  if (risk.exposure === 'Financial / consequential') out.push('Wrong action', 'Policy violation');
  if (risk.impact === 'High' && !out.includes('Wrong action')) out.push('Wrong action');
  return RISK_OPTIONS.failureTypes.filter((f) => out.includes(f));
}

// Add a capability (#4). Writes its first decision record (its starting
// authority, or "not delegated, by design") and version 1 of its risk profile.
// The contract, criteria, requirements and stakeholders get their first
// versions when they are authored. `today` (a TODAY key) sets the starting
// level; without it, `startingLevel` and `notDelegated` do.
export function addCapability(state, { name, summary, owner, risk, startingLevel, notDelegated: notDelegatedArg = false, today = null, rationale = '', by } = {}) {
  const cleanName = (name || '').trim();
  if (!cleanName) throw new Error('Give the capability a name.');
  if (!owner || !people(state)[owner]) throw new Error('Choose an owner.');
  if (!isActivePerson(state, owner)) throw new Error(`${people(state)[owner].name} is deactivated and cannot own a capability.`);
  const r = risk || {};
  for (const k of ['impact', 'reversibility', 'exposure']) {
    if (!RISK_OPTIONS[k].includes(r[k])) throw new Error(RISK_MISSING[k]);
  }
  if (today !== null && !TODAY[today]) throw new Error('Choose what it does today.');
  const now = today ? TODAY[today] : null;
  const notDelegated = now ? Boolean(now.notDelegated) : notDelegatedArg;
  const level = now ? now.level : notDelegated ? 0 : Number(startingLevel);
  if (!notDelegated && ![0, 1].includes(level)) throw new Error('Starting authority must be Level 0 or Level 1.');
  const reason = (rationale || '').trim();
  if (notDelegated && reason.length < 20) throw new Error('Say why this stays with people (a sentence or two).');
  const author = by && people(state)[by] ? by : owner;
  const chosenFailures = (r.failureTypes || []).filter((f) => RISK_OPTIONS.failureTypes.includes(f));
  const failureTypes = chosenFailures.length ? chosenFailures : defaultFailureTypes(r);

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
    authority: { level, limited: false },
    status: notDelegated ? 'not-delegated' : 'setup',
    definedOn: state.today,
    added: true,
    ...(today ? { today } : {}),
  };
  const data = emptyCapabilityData();
  // Likelihood and Scale (#137) are optional here; without them Likelihood
  // reads as Unknown.
  data.versions.risk = [firstVersion({ impact: r.impact, reversibility: r.reversibility, exposure: r.exposure, failureTypes, note: (r.note || '').trim() || undefined, ...cleanLikelihoodScale({ likelihood: r.likelihood, scale: r.scale }) }, { date: state.today, author })];

  const record = startingRecord(state, { id, owner }, { level, notDelegated, now, today, reason, author, versions: { contract: 0, criteria: 0, requirements: 0, risk: 1, stakeholders: 0 } });
  const recordId = record.id;
  const who = people(state)[author];
  let s = {
    ...state,
    capabilities: [...state.capabilities, cap],
    capabilityData: { ...state.capabilityData, [id]: data },
    decisionRecords: [...state.decisionRecords, record],
  };
  s = logEvent(s, {
    kind: 'authority',
    title: notDelegated ? 'Capability added, not delegated by design' : `Capability added at ${authorityLabel(cap.authority)}`,
    body: `${cap.name} was added by ${who.name}${author !== owner ? ` (owner: ${people(state)[owner].name})` : ''}. ${notDelegated ? 'It stays at Level 0 by design.' : `Starting authority is ${authorityLabel(cap.authority)}.`}${now && now.note ? ` ${now.note}` : ''} Risk: ${r.impact} impact, ${r.exposure.toLowerCase()}, ${r.reversibility.toLowerCase()}.`,
    capabilityId: id,
    link: `#/records/${recordId}`,
  });
  return s;
}

// The first decision record: the capability's starting authority, or "not
// delegated, by design". Written when a capability is added through the old
// path, and at setup confirmation (#139).
export function startingRecord(state, cap, { level, notDelegated, now, today, reason, author, versions, extra = {} }) {
  const { id, owner } = cap;
  const number = state.decisionRecords.length + 1;
  const recordId = `AC-${String(number).padStart(2, '0')}`;
  const record = {
    id: recordId,
    number,
    sequence: 1,
    capabilityId: id,
    date: state.today,
    previous: null,
    next: { level, limited: false },
    option: notDelegated ? 'not-delegated' : 'define',
    owner,
    ownerAt: snapshotPerson(state, owner),
    authorizedBy: author,
    authorizedByAt: snapshotPerson(state, author),
    versions,
    // #147: the material changes known when this was recorded.
    materialChangesAtDecision: (((state.capabilityData || {})[id] || {}).materialChanges || []).map((m) => m.id),
    scope: notDelegated
      ? 'Not delegated, by design. The AI doesn\'t do this. Giving it any authority later needs a new decision.'
      : level === 1
        ? 'Recommend. The AI may produce a recommendation for a person; it takes no action.'
        : 'Observe. The AI sees the work, but nothing it produces is used.',
    rationale: [now && now.note, reason || (level === 1
      ? 'Starting at Recommend so recommendations can be compared with what people decide before any authority is granted.'
      : 'Starting at Observe. Authority is earned through evidence from this point.')].filter(Boolean).join(' '),
    evidenceSnapshot: ['No evidence yet. This is the starting point.'],
    openCondition: notDelegated
      ? 'Deliberately not delegated. Revisit only with a new decision.'
      : now && now.note
        ? 'Next: set the rules, Targets and Requirements, then run the first test. The first authority decision reviews what it already does today, one level at a time.'
        : 'Next: set the rules, Targets and Requirements, then run the first test.',
    // What it does in the real world today: context, never authority.
    ...(now ? { context: { today, label: now.label, note: now.note || null } } : {}),
    conditions: null,
    ...extra,
  };
  return record;
}

// Write a new version of a versioned object. The previous versions stay as
// they were. `author` is a person key; `reason` is required.
export function amend(state, capabilityId, kind, { value, author, reason, meta = null, silent = false }) {
  if (!VERSIONED_KINDS.includes(kind)) throw new Error(`Unknown versioned object: ${kind}`);
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  if (!author || !people(state)[author]) throw new Error('Choose who is acting.');
  if (!isActivePerson(state, author)) throw new Error(`${people(state)[author].name} is deactivated and can't make changes.`);
  if (!reason || !reason.trim()) throw new Error('Add a reason for the change.');
  const d = capData(state, capabilityId);
  const prev = currentVersion(state, capabilityId, kind);
  const afterEvidence = performanceResultsSeen(state, capabilityId);
  const next = {
    version: (prev ? prev.version : 0) + 1,
    date: state.today,
    author,
    authorAt: snapshotPerson(state, author),
    reason: reason.trim(),
    afterEvidence,
    before: prev ? clone(prev.value) : null,
    value: clone(value),
    ...(meta ? clone(meta) : {}),
  };
  const versions = { ...d.versions, [kind]: [...(d.versions[kind] || []), next] };
  // The version list is the only copy; the latest version is the current value.
  const s = updateCap(state, capabilityId, { versions });
  if (silent) return s;
  const who = people(state)[author];
  return logEvent(s, {
    kind: 'amendment',
    afterEvidence,
    objectKind: kind,
    version: next.version,
    title: next.version === 1 ? `${KIND_LABELS[kind]} set` : `${KIND_LABELS[kind]} changed`,
    body: `${who.name}: ${next.reason}${afterEvidence ? ' Changed after results were in.' : ''}`,
    capabilityId,
    link: `#/capabilities/${capabilityId}${KIND_TABS[kind]}`,
  });
}

export const KIND_LABELS = { contract: 'Rules', criteria: 'Targets', requirements: 'Requirements', risk: 'Risk profile', stakeholders: 'Stakeholders' };

// Where each versioned object is shown on the capability page.
const KIND_TABS = { contract: '?tab=status&show=rules', risk: '?tab=status&show=rules', criteria: '?tab=decide&show=targets', requirements: '?tab=decide&show=requirements', stakeholders: '' };

// One message per risk question, matching the setup form.
const RISK_MISSING = { impact: 'Choose how serious a bad decision would be.', reversibility: 'Choose whether it can be undone.', exposure: 'Choose who or what is affected.' };
