// The people roster (#22), governed roster changes (#23), and who is acting.

import * as seed from '../data/seed.js';
import { clone, getCapability, logEvent } from './state.js';
import { focusCapability } from './selectors.js';
import { rosterChangeImpact } from './coverage.js';

export function people(state) {
  const v = state.roster && state.roster.versions;
  return v && v.length ? v[v.length - 1].value : seed.people;
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
  if (!key || !personRecord(state, key)) throw new Error(`A named person must ${what}.`);
  if (!isActivePerson(state, key)) throw new Error(`${personRecord(state, key).name} is deactivated and cannot ${what}.`);
}

export function requireAdmin(state, key) {
  requireActive(state, key, 'change the roster');
  if (!isWorkspaceAdmin(state, key)) throw new Error(`${personRecord(state, key).name} is not a workspace admin. Only a workspace admin changes the roster.`);
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
  if (why.length < 5) throw new Error('A roster change needs a reason.');
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
  if (!p) throw new Error(`Unknown person: ${key}`);
  const next = { ...p, name: (name || p.name).trim(), role: (title || p.role).trim(), team: (team || p.team).trim() };
  if (!next.name || !next.role || !next.team) throw new Error('A person needs a name, a title and a team.');
  if (next.name === p.name && next.role === p.role && next.team === p.team) throw new Error('Nothing changed.');
  const why = (reason || '').trim();
  if (why.length < 5) throw new Error('A roster change needs a reason.');
  return writeRoster(state, { ...roster, [key]: next }, { author: by, reason: why, title: `Person updated: ${next.name}`, body: `${roster[by].name} updated ${p.name}${next.name !== p.name ? ` (now ${next.name})` : ''}: ${[next.role !== p.role ? `title ${p.role} → ${next.role}` : null, next.team !== p.team ? `team ${p.team} → ${next.team}` : null].filter(Boolean).join(', ') || 'name'}. ${why}`, meta: { change: { kind: 'edit', key } } });
}

// People are never deleted: records reference them. Deactivation keeps the
// record and removes the person from everything that needs a live person.
export function deactivatePerson(state, key, { by, reason } = {}) {
  requireAdmin(state, by);
  const roster = people(state);
  const p = roster[key];
  if (!p) throw new Error(`Unknown person: ${key}`);
  if (p.active === false) throw new Error(`${p.name} is already deactivated.`);
  const why = (reason || '').trim();
  if (why.length < 5) throw new Error('A roster change needs a reason.');
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
  if (p.rights && p.rights.workspaceAdmin && adminsLeft === 0) throw new Error('This would leave no workspace admin. Grant the right to someone else first.');
  const why = reason;
  const value = { ...roster, [key]: { ...p, active: false } };
  let s = writeRoster(state, value, { author: by, reason: why, title: `Person deactivated: ${p.name}`, body: `${roster[by].name} deactivated ${p.name}. ${why}`, surfaced: true, meta: { change: { kind: 'deactivate', key }, ...(meta || {}) } });
  if (s.actingAs === key) s = { ...s, actingAs: null };
  return s;
}


export const RIGHTS = [['riskApprover', 'Risk approver'], ['workspaceAdmin', 'Workspace admin']];
export const RIGHT_LABELS = Object.fromEntries(RIGHTS);

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
  return `${pr.grant ? 'Grant' : 'Remove'} ${RIGHT_LABELS[pr.right]}: ${name}`;
}

// A rights grant or removal, or the deactivation of a rights holder: proposed
// by an active workspace admin, approved by a different one. Nobody grants a
// right to themselves. The last workspace admin cannot be removed or deactivated.
export function proposeRosterChange(state, { kind, person, right, grant, by, reason } = {}) {
  requireAdmin(state, by);
  const roster = people(state);
  const target = roster[person];
  if (!target) throw new Error(`Unknown person: ${person}`);
  if (target.active === false) throw new Error(`${target.name} is deactivated.`);
  const why = (reason || '').trim();
  if (why.length < 5) throw new Error('A roster change needs a reason.');
  if (!['rights', 'deactivate'].includes(kind)) throw new Error(`Unknown roster change: ${kind}`);
  if (kind === 'rights') {
    if (!RIGHT_LABELS[right]) throw new Error(`Unknown right: ${right}`);
    const has = Boolean(target.rights && target.rights[right]);
    if (grant && person === by) throw new Error('Nobody grants a right to themselves. Ask another workspace admin to propose it.');
    if (grant && has) throw new Error(`${target.name} already holds the ${RIGHT_LABELS[right]} right.`);
    if (!grant && !has) throw new Error(`${target.name} does not hold the ${RIGHT_LABELS[right]} right.`);
    if (!grant && right === 'workspaceAdmin' && activeAdmins(state).filter((k) => k !== person).length === 0) throw new Error('This would leave no workspace admin. Grant the right to someone else first.');
  }
  if (kind === 'deactivate' && target.rights && target.rights.workspaceAdmin && activeAdmins(state).filter((k) => k !== person).length === 0) {
    throw new Error('This would leave no workspace admin. Grant the right to someone else first.');
  }
  if (openRosterProposal(state, person)) throw new Error(`A change for ${target.name} is already awaiting sign-off.`);
  // Who can approve: a different workspace admin. For a grant, never the
  // person receiving the right. A Risk approver grant can also be approved by
  // an existing Risk approver, so a grant to an admin still has an approver.
  const isGrant = kind === 'rights' && Boolean(grant);
  let eligible = activeAdmins(state).filter((k) => k !== by);
  if (isGrant && right === 'riskApprover') eligible = [...new Set([...eligible, ...Object.keys(activePeople(state)).filter((k) => isRiskApprover(state, k) && k !== by)])];
  if (isGrant) eligible = eligible.filter((k) => k !== person);
  if (!eligible.length) throw new Error(isGrant && right === 'riskApprover' ? 'No other workspace admin or Risk approver can sign this off.' : 'No other workspace admin can sign this off. Grant the Workspace admin right to someone else first.');
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
    title: `Roster change proposed: ${describeRosterChange(s, pr)}`,
    body: `${roster[by].name} proposed ${describeRosterChange(s, pr).toLowerCase()}. Needs a different workspace admin to approve. ${why}`,
    capabilityId: null,
    link: `#/people?proposal=${pr.id}`,
  });
}

export function rosterApprovalEligibility(state, pr, personKey) {
  if (!pr || pr.status !== 'open') return { ok: false, reason: 'This change is closed.' };
  const p = people(state)[personKey];
  if (!p) return { ok: false, reason: 'Choose who is acting.' };
  const isGrant = pr.kind === 'rights' && pr.grant;
  const riskGrant = isGrant && pr.right === 'riskApprover';
  if (personKey === pr.proposedBy) return { ok: false, reason: `${p.name} proposed this; someone else must approve it.` };
  if (isGrant && personKey === pr.person) return { ok: false, reason: `${p.name} is receiving this right and cannot approve their own grant.` };
  if (!isActivePerson(state, personKey)) return { ok: false, reason: `${p.name} is deactivated and cannot approve.` };
  const admin = isWorkspaceAdmin(state, personKey);
  const risk = riskGrant && isRiskApprover(state, personKey);
  if (!admin && !risk) return { ok: false, reason: riskGrant ? `${p.name} is neither a workspace admin nor a Risk approver.` : `${p.name} is not an active workspace admin.` };
  if (!pr.eligible.includes(personKey)) return { ok: false, reason: `${p.name} was not an eligible approver when this change was proposed.` };
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
    s = writeRoster(s, value, { author: pr.proposedBy, reason: pr.reason, surfaced: true, title: `${pr.grant ? 'Right granted' : 'Right removed'}: ${RIGHT_LABELS[pr.right]}, ${target.name}`, body: `Proposed by ${roster[pr.proposedBy].name}, approved by ${roster[by].name}${isWorkspaceAdmin(state, by) ? '' : ' (as a Risk approver)'}. ${pr.reason}`, meta: { change: { kind: pr.grant ? 'grant' : 'remove', key: pr.person, right: pr.right }, ...meta } });
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
  if (why.length < 5) throw new Error('A rejection needs a reason.');
  const s = { ...state, rosterProposals: state.rosterProposals.map((x) => (x.id === proposalId ? { ...x, status: 'rejected', rejection: { by, byAt: snapshotPerson(state, by), date: state.today, reason: why }, closedAt: state.today } : x)) };
  return logEvent(s, { kind: 'roster', surfaced: true, title: `Roster change rejected: ${describeRosterChange(s, pr)}`, body: `${people(s)[by].name} rejected the change proposed by ${people(s)[pr.proposedBy].name}. ${why}`, capabilityId: null, link: `#/people?proposal=${proposalId}` });
}

export function withdrawRosterChange(state, proposalId, { by, reason } = {}) {
  const pr = getRosterProposal(state, proposalId);
  if (!pr) throw new Error(`Unknown roster change: ${proposalId}`);
  if (pr.status !== 'open') throw new Error('This change is closed.');
  if (by !== pr.proposedBy) throw new Error('Only the proposer withdraws; others reject.');
  requireActive(state, by, 'withdraw a roster change');
  const why = (reason || '').trim();
  if (why.length < 5) throw new Error('A withdrawal needs a reason.');
  const s = { ...state, rosterProposals: state.rosterProposals.map((x) => (x.id === proposalId ? { ...x, status: 'withdrawn', withdrawal: { by, byAt: snapshotPerson(state, by), date: state.today, reason: why }, closedAt: state.today } : x)) };
  return logEvent(s, { kind: 'roster', surfaced: true, title: `Roster change withdrawn: ${describeRosterChange(s, pr)}`, body: `${people(s)[by].name} withdrew their proposal. ${why}`, capabilityId: null, link: `#/people?proposal=${proposalId}` });
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
