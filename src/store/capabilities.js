// Adding a capability (#4) and amending its versioned objects.

import { clone, emptyCapabilityData, VERSIONED_KINDS, firstVersion, getCapability, capData, updateCap, logEvent } from './state.js';
import { currentVersion, performanceResultsSeen, authorityLabel } from './selectors.js';
import { people, isActivePerson, snapshotPerson } from './people.js';

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

// Add a capability (#4). Writes its first decision record (its starting
// authority, or "not delegated, by design") and version 1 of its risk profile.
// The contract, criteria, requirements and stakeholders get their first
// versions when they are authored.
export function addCapability(state, { name, summary, owner, risk, startingLevel, notDelegated = false, rationale = '', by } = {}) {
  const cleanName = (name || '').trim();
  if (!cleanName) throw new Error('Give the capability a name.');
  if (!owner || !people(state)[owner]) throw new Error('Choose an owner.');
  if (!isActivePerson(state, owner)) throw new Error(`${people(state)[owner].name} is deactivated and cannot own a capability.`);
  const r = risk || {};
  for (const k of ['impact', 'reversibility', 'exposure']) {
    if (!RISK_OPTIONS[k].includes(r[k])) throw new Error(RISK_MISSING[k]);
  }
  const level = notDelegated ? 0 : Number(startingLevel);
  if (!notDelegated && ![0, 1].includes(level)) throw new Error('Starting authority must be Level 0 or Level 1.');
  const reason = (rationale || '').trim();
  if (notDelegated && reason.length < 20) throw new Error('Say why the AI won\'t do this (a sentence or two).');
  const author = by && people(state)[by] ? by : owner;

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
  };
  const data = emptyCapabilityData();
  data.versions.risk = [firstVersion({ impact: r.impact, reversibility: r.reversibility, exposure: r.exposure, failureTypes: (r.failureTypes || []).filter((f) => RISK_OPTIONS.failureTypes.includes(f)), note: (r.note || '').trim() || undefined }, { date: state.today, author })];

  const number = state.decisionRecords.length + 1;
  const recordId = `AC-${String(number).padStart(2, '0')}`;
  const who = people(state)[author];
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
    versions: { contract: 0, criteria: 0, requirements: 0, risk: 1, stakeholders: 0 },
    scope: notDelegated
      ? 'Not delegated, by design. The AI doesn\'t do this. Giving it any authority later needs a new decision.'
      : level === 1
        ? 'Recommend. The AI may produce a recommendation for a person; it takes no action.'
        : 'Observe. The AI sees the work, but nothing it produces is used.',
    rationale: reason || (level === 1
      ? 'Starting at Recommend so recommendations can be compared with what people decide before any authority is granted.'
      : 'Starting at Observe. Authority is earned through evidence from this point.'),
    evidenceSnapshot: ['No evidence yet. This is the starting point.'],
    openCondition: notDelegated
      ? 'Deliberately not delegated. Revisit only with a new decision.'
      : 'Next: set the rules, targets and decision requirements, then run the first test.',
    conditions: null,
  };

  let s = {
    ...state,
    capabilities: [...state.capabilities, cap],
    capabilityData: { ...state.capabilityData, [id]: data },
    decisionRecords: [...state.decisionRecords, record],
  };
  s = logEvent(s, {
    kind: 'authority',
    title: notDelegated ? 'Capability added, not delegated by design' : `Capability added at ${authorityLabel(cap.authority)}`,
    body: `${cap.name} was added by ${who.name}${author !== owner ? ` (owner: ${people(state)[owner].name})` : ''}. ${notDelegated ? 'It stays at Level 0 by design.' : `Starting authority is ${authorityLabel(cap.authority)}.`} Risk: ${r.impact} impact, ${r.exposure.toLowerCase()}, ${r.reversibility.toLowerCase()}.`,
    capabilityId: id,
    link: `#/records/${recordId}`,
  });
  return s;
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

export const KIND_LABELS = { contract: 'Rules', criteria: 'Targets', requirements: 'Decision requirements', risk: 'Risk profile', stakeholders: 'Stakeholders' };

// Where each versioned object is shown on the capability page.
const KIND_TABS = { contract: '?tab=status&show=rules', risk: '?tab=status&show=rules', criteria: '?tab=decide&show=targets', requirements: '?tab=decide&show=requirements', stakeholders: '' };

// One message per risk question, matching the setup form.
const RISK_MISSING = { impact: 'Choose how serious a bad decision would be.', reversibility: 'Choose whether it can be undone.', exposure: 'Choose who or what is affected.' };
