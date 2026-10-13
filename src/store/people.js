// The people roster (#22), governed roster changes (#23), and who is acting.

import * as seed from '../data/seed.js';
import { clone, getCapability, logEvent } from './state.js';
import { focusCapability } from './selectors.js';
import { rosterChangeImpact } from './coverage.js';

export function people(state) {
  const v = state.roster && state.roster.versions;
  if (v && v.length) return v[v.length - 1].value;
  // An empty workspace has nobody until setup records the founding roster.
  return state.setupPending ? {} : seed.people;
}

export function personRecord(state, key) {
  return people(state)[key] || null;
}

export function activePeople(state) {
  return Object.fromEntries(Object.entries(people(state)).filter(([, p]) => p.active !== false));
}

export function isActivePerson(state, key) {
  const p = personRecord(state, key);
  return Boolean(p && p.active !== false);
}

export function isWorkspaceAdmin(state, key) {
  const p = personRecord(state, key);
  return Boolean(p && p.active !== false && p.rights && p.rights.workspaceAdmin);
}

export function isRiskApprover(state, key) {
  const p = personRecord(state, key);
  return Boolean(p && p.active !== false && p.rights && p.rights.riskApprover);
}

export function rosterVersions(state) {
  return (state.roster && state.roster.versions) || [];
}

// A person as they were at the moment a record was written: name, title,
// team and rights. Records keep this so later roster changes never rewrite
// history (#24). `system` and unknown keys snapshot to null.
export function snapshotPerson(state, key) {
  const p = key ? people(state)[key] : null;
  if (!p) return null;
  return { key, name: p.name, title: p.role, team: p.team, rights: { riskApprover: Boolean(p.rights && p.rights.riskApprover), workspaceAdmin: Boolean(p.rights && p.rights.workspaceAdmin) }, active: p.active !== false };
}

export const withSnap = (state, list) => list.map((a) => (a && a.by && !a.byAt ? { ...a, byAt: snapshotPerson(state, a.by) } : a));

export function requireActive(state, key, what = 'act') {
  if (!key || !personRecord(state, key)) throw new Error(`Choose who is acting before you ${what}.`);
  if (!isActivePerson(state, key)) throw new Error(`${personRecord(state, key).name} is deactivated and cannot ${what}.`);
}

export function requireAdmin(state, key) {
  requireActive(state, key, 'change people or rights');
  if (!isWorkspaceAdmin(state, key)) throw new Error(`${personRecord(state, key).name} isn't a workspace admin. Switch "Demo as" to a workspace admin to change people or rights.`);
}

export function writeRoster(state, value, { author, reason, title, body, surfaced = false, meta = null }) {
  const prev = rosterVersions(state);
  const last = prev[prev.length - 1];
  const next = { version: (last ? last.version : 0) + 1, date: state.today, author, authorAt: snapshotPerson(state, author), reason, afterEvidence: false, before: last ? clone(last.value) : null, value: clone(value), ...(meta ? clone(meta) : {}) };
  const s = { ...state, roster: { ...state.roster, versions: [...prev, next] } };
  return logEvent(s, { kind: 'roster', surfaced, title, body, capabilityId: null, link: '#/people' });
}

export const personKey = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function addPerson(state, { name, title, team, by, reason } = {}) {
  requireAdmin(state, by);
  const n = (name || '').trim(); const t = (title || '').trim(); const tm = (team || '').trim();
  if (!n || !t || !tm) throw new Error('A person needs a name, a title and a team.');
  const why = (reason || '').trim();
  if (why.length < 5) throw new Error('Add a reason (a few words).');
  let key = personKey(n) || 'person';
  const roster = people(state);
  if (roster[key]) { let i = 2; while (roster[`${key}-${i}`]) i += 1; key = `${key}-${i}`; }
  const value = { ...roster, [key]: { name: n, role: t, team: tm, active: true, rights: { riskApprover: false, workspaceAdmin: false } } };
  return writeRoster(state, value, { author: by, reason: why, title: `Person added: ${n}`, body: `${roster[by].name} added ${n} (${t}, ${tm}). ${why}`, meta: { change: { kind: 'add', key } } });
}

export function editPerson(state, key, { name, title, team, by, reason } = {}) {
  requireAdmin(state, by);
  const roster = people(state);
  const p = roster[key];
  if (!p) throw new Error('That person wasn\'t found. Reload and try again.');
  const next = { ...p, name: (name || p.name).trim(), role: (title || p.role).trim(), team: (team || p.team).trim() };
  if (!next.name || !next.role || !next.team) throw new Error('A person needs a name, a title and a team.');
  if (next.name === p.name && next.role === p.role && next.team === p.team) throw new Error('Nothing to save: the name, title and team are unchanged.');
  const why = (reason || '').trim();
  if (why.length < 5) throw new Error('Add a reason (a few words).');
  return writeRoster(state, { ...roster, [key]: next }, { author: by, reason: why, title: `Person updated: ${next.name}`, body: `${roster[by].name} updated ${p.name}${next.name !== p.name ? ` (now ${next.name})` : ''}: ${[next.role !== p.role ? `title ${p.role} → ${next.role}` : null, next.team !== p.team ? `team ${p.team} → ${next.team}` : null].filter(Boolean).join(', ') || 'name'}. ${why}`, meta: { change: { kind: 'edit', key } } });
}

// People are never deleted: records reference them. Deactivation keeps the
// record and removes the person from everything that needs a live person.
export function deactivatePerson(state, key, { by, reason } = {}) {
  requireAdmin(state, by);
  const roster = people(state);
  const p = roster[key];
  if (!p) throw new Error('That person wasn\'t found. Reload and try again.');
  if (p.active === false) throw new Error(`${p.name} is already deactivated.`);
  const why = (reason || '').trim();
  if (why.length < 5) throw new Error('Add a reason (a few words).');
  // Anyone holding a right is deactivated through a proposal with a different
  // admin's sign-off (#23).
  if (p.rights && (p.rights.workspaceAdmin || p.rights.riskApprover)) {
    return proposeRosterChange(state, { kind: 'deactivate', person: key, by, reason: why });
  }
  return applyDeactivation(state, key, { by, reason: why, meta: { impact: rosterChangeImpact(state, { kind: 'deactivate', person: key }) } });
}

export function applyDeactivation(state, key, { by, reason, meta = null } = {}) {
  const roster = people(state);
  const p = roster[key];
  if (!p || p.active === false) throw new Error(`${p ? p.name : key} is not an active person.`);
  const adminsLeft = Object.entries(roster).filter(([k, x]) => k !== key && x.active !== false && x.rights && x.rights.workspaceAdmin).length;
  if (p.rights && p.rights.workspaceAdmin && adminsLeft === 0) throw new Error('Make someone else a workspace admin first. The workspace always needs at least one.');
  const why = reason;
  const value = { ...roster, [key]: { ...p, active: false } };
  let s = writeRoster(state, value, { author: by, reason: why, title: `Person deactivated: ${p.name}`, body: `${roster[by].name} deactivated ${p.name}. ${why}`, surfaced: true, meta: { change: { kind: 'deactivate', key }, ...(meta || {}) } });
  if (s.actingAs === key) s = { ...s, actingAs: null };
  return s;
}


export const RIGHTS = [['riskApprover', 'Risk approver'], ['workspaceAdmin', 'Workspace admin']];
export const RIGHT_LABELS = Object.fromEntries(RIGHTS);
// The right as it reads mid-sentence: "Make Jonas a Risk approver".
export const RIGHT_NOUNS = { riskApprover: 'Risk approver', workspaceAdmin: 'workspace admin' };

export function activeAdmins(state) {
  return Object.keys(activePeople(state)).filter((k) => isWorkspaceAdmin(state, k));
}

export function openRosterProposal(state, personKey = null) {
  return state.rosterProposals.find((p) => p.status === 'open' && (!personKey || p.person === personKey)) || null;
}

export function getRosterProposal(state, id) {
  return state.rosterProposals.find((p) => p.id === id) || null;
}

export function describeRosterChange(state, pr) {
  const name = people(state)[pr.person] ? people(state)[pr.person].name : pr.person;
  if (pr.kind === 'deactivate') return `Deactivate ${name}`;
  return pr.grant ? `Make ${name} a ${RIGHT_NOUNS[pr.right]}` : `Remove ${name} as ${RIGHT_NOUNS[pr.right]}`;
}

// The founding roster (Paige, 2026-10-12: one person can start a workspace).
// Until the workspace has ever had two active workspace admins, it is in its
// founding state. The one exception that state allows (Paige, 2026-10-12) is
// the smallest that breaks the deadlock: the sole admin may make ONE other
// person a workspace admin without approval, recorded. Nothing else skips
// approval: no other right, and never a right to yourself. Once the second
// admin exists the founding state ends for good, and the two admins set up
// Risk approvers and every other right through the normal process. The demo
// starts with two admins, so it is never founding.
export function foundingRoster(state) {
  if (state.setupPending) return false;
  const admins = (value) => Object.values(value || {}).filter((p) => p.active !== false && p.rights && p.rights.workspaceAdmin).length;
  const versions = rosterVersions(state);
  if (!versions.length) return false;
  return versions.every((v) => admins(v.value) < 2);
}

// The just-in-time message for an approval nobody else can give yet: what to
// add, and where.
export const NEEDS_SECOND_ADMIN = 'Make someone else a workspace admin first: as the only admin, you can do that straight away. Then the two of you approve changes like this one.';

// A rights grant or removal, or the deactivation of a rights holder: proposed
// by an active workspace admin, approved by a different one. Nobody grants a
// right to themselves. The last workspace admin cannot be removed or
// deactivated. While the workspace is founding, making one other person a
// workspace admin applies at once (see foundingRoster); nothing else does.
export function proposeRosterChange(state, { kind, person, right, grant, by, reason } = {}) {
  requireAdmin(state, by);
  const roster = people(state);
  const target = roster[person];
  if (!target) throw new Error('That person wasn\'t found. Reload and try again.');
  if (target.active === false) throw new Error(`${target.name} is deactivated, so their rights can't be changed.`);
  const why = (reason || '').trim();
  if (why.length < 5) throw new Error('Add a reason (a few words).');
  if (!['rights', 'deactivate'].includes(kind)) throw new Error(`Unknown roster change: ${kind}`);
  if (kind === 'rights') {
    if (!RIGHT_LABELS[right]) throw new Error(`Unknown right: ${right}`);
    const has = Boolean(target.rights && target.rights[right]);
    if (grant && person === by) throw new Error('You can\'t grant a right to yourself. Ask another workspace admin to propose it.');
    if (grant && has) throw new Error(`${target.name} is already a ${RIGHT_NOUNS[right]}.`);
    if (!grant && !has) throw new Error(`${target.name} isn't a ${RIGHT_NOUNS[right]}.`);
    if (!grant && right === 'workspaceAdmin' && activeAdmins(state).filter((k) => k !== person).length === 0) throw new Error('Make someone else a workspace admin first. The workspace always needs at least one.');
  }
  if (kind === 'deactivate' && target.rights && target.rights.workspaceAdmin && activeAdmins(state).filter((k) => k !== person).length === 0) {
    throw new Error('Make someone else a workspace admin first. The workspace always needs at least one.');
  }
  if (openRosterProposal(state, person)) throw new Error(`A change for ${target.name} is already waiting for approval. Approve, reject or withdraw it first.`);
  const isGrant = kind === 'rights' && Boolean(grant);
  if (isGrant && right === 'workspaceAdmin' && foundingRoster(state)) return applyFoundingGrant(state, { person, right, by, reason: why });
  // Who can approve: a different workspace admin. For a grant, never the
  // person receiving the right. A Risk approver grant can also be approved by
  // an existing Risk approver, so a grant to an admin still has an approver.
  let eligible = activeAdmins(state).filter((k) => k !== by);
  if (isGrant && right === 'riskApprover') eligible = [...new Set([...eligible, ...Object.keys(activePeople(state)).filter((k) => isRiskApprover(state, k) && k !== by)])];
  if (isGrant) eligible = eligible.filter((k) => k !== person);
  if (!eligible.length) {
    // Just in time: a one-admin workspace is told what to add to approve this.
    if (foundingRoster(state)) throw new Error(`You're the only workspace admin, and you can't approve your own change. ${NEEDS_SECOND_ADMIN}`);
    throw new Error(isGrant && right === 'riskApprover' ? 'Nobody else can approve this. It needs another workspace admin or a Risk approver.' : 'Nobody else can approve this. Make someone else a workspace admin first.');
  }
  const impact = rosterChangeImpact(state, { kind, person, right, grant });
  const pr = {
    id: `RP-${state.rosterProposals.length + 1}`,
    kind,
    person,
    impact,
    right: kind === 'rights' ? right : null,
    grant: kind === 'rights' ? Boolean(grant) : null,
    proposedBy: by,
    proposedByAt: snapshotPerson(state, by),
    personAt: snapshotPerson(state, person),
    date: state.today,
    reason: why,
    eligible,
    approvals: [],
    status: 'open',
    rejection: null,
    withdrawal: null,
    appliedVersion: null,
  };
  const s = { ...state, rosterProposals: [...state.rosterProposals, pr] };
  return logEvent(s, {
    kind: 'roster',
    surfaced: true,
    title: `Proposed: ${describeRosterChange(s, pr)}`,
    body: `${roster[by].name} proposed: ${describeRosterChange(s, pr)}. Waiting for approval from ${eligible.map((k) => roster[k].name).join(', ')}. ${why}`,
    capabilityId: null,
    link: `#/people?proposal=${pr.id}`,
  });
}

// A grant while the founding roster is open: recorded as a rights change that
// took effect at once (status "founding", no approvals), plus the roster
// version it wrote. Never to the person giving it (checked by the caller).
function applyFoundingGrant(state, { person, right, by, reason }) {
  const roster = people(state);
  const target = roster[person];
  const value = { ...roster, [person]: { ...target, rights: { ...target.rights, [right]: true } } };
  const closes = right === 'workspaceAdmin';
  let s = writeRoster(state, value, {
    author: by,
    reason,
    surfaced: true,
    title: `${target.name} is now a ${RIGHT_NOUNS[right]}`,
    body: `${roster[by].name} gave ${target.name} the ${RIGHT_LABELS[right]} right while setting up the workspace's first people, so it took effect at once.${closes ? ' There are now two workspace admins: from here on, changing anyone\'s rights needs the other admin\'s approval.' : ''} ${reason}`,
    meta: { change: { kind: 'grant', key: person, right }, founding: true },
  });
  const pr = {
    id: `RP-${state.rosterProposals.length + 1}`,
    kind: 'rights',
    person,
    impact: { capabilities: [], proposals: [], any: false },
    right,
    grant: true,
    proposedBy: by,
    proposedByAt: snapshotPerson(state, by),
    personAt: snapshotPerson(state, person),
    date: state.today,
    reason,
    eligible: [],
    approvals: [],
    status: 'founding',
    founding: true,
    rejection: null,
    withdrawal: null,
    appliedVersion: rosterVersions(s).length,
    closedAt: state.today,
  };
  s = { ...s, rosterProposals: [...s.rosterProposals, pr] };
  return s;
}

export function rosterApprovalEligibility(state, pr, personKey) {
  if (!pr || pr.status !== 'open') return { ok: false, reason: 'This change has already been approved, rejected or withdrawn.' };
  const p = people(state)[personKey];
  if (!p) return { ok: false, reason: 'Choose who is acting.' };
  const isGrant = pr.kind === 'rights' && pr.grant;
  const riskGrant = isGrant && pr.right === 'riskApprover';
  if (personKey === pr.proposedBy) return { ok: false, reason: `${p.name} proposed this; someone else must approve it.` };
  if (isGrant && personKey === pr.person) return { ok: false, reason: `${p.name} is receiving this right and cannot approve their own grant.` };
  if (!isActivePerson(state, personKey)) return { ok: false, reason: `${p.name} is deactivated and cannot approve.` };
  const admin = isWorkspaceAdmin(state, personKey);
  const risk = riskGrant && isRiskApprover(state, personKey);
  if (!admin && !risk) return { ok: false, reason: riskGrant ? `${p.name} is neither a workspace admin nor a Risk approver.` : `${p.name} isn't a workspace admin.` };
  if (!pr.eligible.includes(personKey)) return { ok: false, reason: `${p.name} can't approve this. Only the people listed under "Who can approve" can.` };
  return { ok: true, reason: null };
}

export function approveRosterChange(state, proposalId, { by } = {}) {
  const pr = getRosterProposal(state, proposalId);
  if (!pr) throw new Error(`Unknown roster change: ${proposalId}`);
  const e = rosterApprovalEligibility(state, pr, by);
  if (!e.ok) throw new Error(e.reason);
  const roster = people(state);
  const target = roster[pr.person];
  const approvals = [{ by, byAt: snapshotPerson(state, by), date: state.today }];
  let s = state;
  const meta = { proposalId, proposedBy: pr.proposedBy, approvals };
  if (pr.kind === 'deactivate') {
    s = applyDeactivation(s, pr.person, { by: pr.proposedBy, reason: pr.reason, meta });
  } else {
    if (!pr.grant && pr.right === 'workspaceAdmin' && activeAdmins(s).filter((k) => k !== pr.person).length === 0) throw new Error('This would leave no workspace admin.');
    const value = { ...roster, [pr.person]: { ...target, rights: { ...target.rights, [pr.right]: pr.grant } } };
    s = writeRoster(s, value, { author: pr.proposedBy, reason: pr.reason, surfaced: true, title: pr.grant ? `${target.name} is now a ${RIGHT_NOUNS[pr.right]}` : `${target.name} is no longer a ${RIGHT_NOUNS[pr.right]}`, body: `Proposed by ${roster[pr.proposedBy].name}, approved by ${roster[by].name}${isWorkspaceAdmin(state, by) ? '' : ' (as a Risk approver)'}. ${pr.reason}`, meta: { change: { kind: pr.grant ? 'grant' : 'remove', key: pr.person, right: pr.right }, ...meta } });
    if (!pr.grant && pr.right === 'workspaceAdmin' && s.actingAs === pr.person) s = s; // acting stays; they just lost the admin controls
  }
  const applied = rosterVersions(s).length;
  s = { ...s, rosterProposals: s.rosterProposals.map((x) => (x.id === proposalId ? { ...x, approvals, status: 'approved', appliedVersion: applied, closedAt: state.today } : x)) };
  return s;
}

export function rejectRosterChange(state, proposalId, { by, reason } = {}) {
  const pr = getRosterProposal(state, proposalId);
  if (!pr) throw new Error(`Unknown roster change: ${proposalId}`);
  const e = rosterApprovalEligibility(state, pr, by);
  if (!e.ok) throw new Error(e.reason);
  const why = (reason || '').trim();
  if (why.length < 5) throw new Error('Add a reason for rejecting.');
  const s = { ...state, rosterProposals: state.rosterProposals.map((x) => (x.id === proposalId ? { ...x, status: 'rejected', rejection: { by, byAt: snapshotPerson(state, by), date: state.today, reason: why }, closedAt: state.today } : x)) };
  return logEvent(s, { kind: 'roster', surfaced: true, title: `Rejected: ${describeRosterChange(s, pr)}`, body: `${people(s)[by].name} rejected the change proposed by ${people(s)[pr.proposedBy].name}. ${why}`, capabilityId: null, link: `#/people?proposal=${proposalId}` });
}

export function withdrawRosterChange(state, proposalId, { by, reason } = {}) {
  const pr = getRosterProposal(state, proposalId);
  if (!pr) throw new Error(`Unknown roster change: ${proposalId}`);
  if (pr.status !== 'open') throw new Error('This change has already been approved, rejected or withdrawn.');
  if (by !== pr.proposedBy) throw new Error('Only the person who proposed this can withdraw it. Others can reject it.');
  requireActive(state, by, 'withdraw this change');
  const why = (reason || '').trim();
  if (why.length < 5) throw new Error('Add a reason for withdrawing.');
  const s = { ...state, rosterProposals: state.rosterProposals.map((x) => (x.id === proposalId ? { ...x, status: 'withdrawn', withdrawal: { by, byAt: snapshotPerson(state, by), date: state.today, reason: why }, closedAt: state.today } : x)) };
  return logEvent(s, { kind: 'roster', surfaced: true, title: `Withdrawn: ${describeRosterChange(s, pr)}`, body: `${people(s)[by].name} withdrew it. ${why}`, capabilityId: null, link: `#/people?proposal=${proposalId}` });
}

// The person acting right now: the picked person, else the capability's owner,
// else the focus capability's owner. Used as the author of records and
// amendments.
export function actor(state, capabilityId) {
  if (state.actingAs && isActivePerson(state, state.actingAs)) return state.actingAs;
  const cap = capabilityId ? getCapability(state, capabilityId) : null;
  if (cap && isActivePerson(state, cap.owner)) return cap.owner;
  const focus = focusCapability(state);
  if (focus && isActivePerson(state, focus.owner)) return focus.owner;
  return Object.keys(activePeople(state))[0];
}

export function setActingAs(state, personKey) {
  if (personKey && !people(state)[personKey]) throw new Error(`Unknown person: ${personKey}`);
  if (personKey && !isActivePerson(state, personKey)) throw new Error(`${people(state)[personKey].name} is deactivated and cannot act.`);
  return { ...state, actingAs: personKey || null };
}

// Just in time (redesign): when the only person in a workspace hits a step
// that needs someone else, say what to add. Empty otherwise.
export function soloHint(state) {
  return Object.keys(activePeople(state)).length === 1 ? ' You\'re the only person in this workspace: add someone on People first.' : '';
}
