// The empty-workspace path (roadmap item 7): start from a blank workspace, then
// set up the workspace, its one workflow and the person starting it before
// anything else. That person is recorded directly as roster version 1, the way
// the seed is. Until a second workspace admin exists they complete the founding
// roster just in time (see foundingRoster in people.js); after that, every
// rights change is governed.

import { initialState, clone } from './state.js';
import { personKey, snapshotPerson, people, requireAdmin } from './people.js';
import { workspaceOf, workflowOf } from './selectors.js';

const slug = (text, fallback) => (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback;

// A blank workspace waiting for setup: no capabilities, records, people or
// activity. Demo date and settings are unchanged.
export function startEmpty() {
  const base = initialState();
  return {
    ...base,
    setupPending: true,
    // A workspace set up from scratch, not the seeded Northstar demo.
    startedEmpty: true,
    workspace: null,
    workflow: null,
    roster: { versions: [] },
    rosterProposals: [],
    actingAs: null,
    capabilities: [],
    capabilityData: {},
    decisionRecords: [],
    activity: [],
    alerts: [],
    evidenceSources: [],
    // A new workspace has nothing waiting and no gate history.
    actionQueue: [],
    gateLog: [],
    // A new workspace has no systems of record connected yet.
    systems: { customers: {}, orders: {}, fraudFlags: [], chargebacks: [], refunds: [], escalations: [] },
  };
}

export function setupPending(state) {
  return Boolean(state.setupPending);
}

// One person can start a workspace (Paige, 2026-10-12): the person starting it
// is its first workspace admin. A second admin or a Risk approver is asked for
// only when an approval actually needs one (see proposeRosterChange).
export const MIN_FOUNDING_ADMINS = 1;

// `founder` is the person starting the workspace ({ name, title, team? }): they
// become its first workspace admin and the author of roster version 1. The
// older form, a `people` list plus `by` (the name of a listed workspace admin
// who is setting it up), still works; either way nobody else is required.
export function setUpWorkspace(state, { workspace = {}, workflow = {}, founder = null, people = [], by = '' } = {}) {
  if (!state.setupPending) throw new Error('This workspace is already set up.');
  const ws = { name: String(workspace.name || '').trim(), description: String(workspace.description || '').trim() };
  const wf = { name: String(workflow.name || '').trim(), description: String(workflow.description || '').trim() };
  if (ws.name.length < 2) throw new Error('Name the workspace.');
  if (wf.name.length < 2) throw new Error('Name the workflow.');
  const listed = founder
    ? [{ ...founder, team: String(founder.team || '').trim() || ws.name, workspaceAdmin: true }, ...people]
    : people;
  if (founder && !String(founder.name || '').trim()) throw new Error('Add your name.');
  if (founder && !String(founder.title || '').trim()) throw new Error('Add your title.');
  const rows = listed
    .map((p) => ({ name: String(p.name || '').trim(), title: String(p.title || '').trim(), team: String(p.team || '').trim(), workspaceAdmin: Boolean(p.workspaceAdmin), riskApprover: Boolean(p.riskApprover) }))
    .filter((p) => p.name || p.title || p.team);
  if (rows.some((p) => !p.name || !p.title || !p.team)) throw new Error('Every person needs a name, a title and a team.');
  if (!rows.length) throw new Error('Add the person starting the workspace.');
  const keys = rows.map((p) => personKey(p.name));
  if (new Set(keys).size !== keys.length) throw new Error('Two people have the same name. Make each name distinct.');
  const admins = rows.filter((p) => p.workspaceAdmin);

  const byKey = founder ? keys[0] : personKey(by);
  if (!byKey) throw new Error('Choose who is setting this up.');
  if (!admins.some((p) => personKey(p.name) === byKey)) throw new Error(`${String(by).trim()} isn't marked as a workspace admin. Choose a workspace admin to set this up.`);
  const value = Object.fromEntries(rows.map((p, i) => [keys[i], { name: p.name, role: p.title, team: p.team, active: true, rights: { riskApprover: p.riskApprover, workspaceAdmin: p.workspaceAdmin } }]));
  const rosterState = { roster: { versions: [{ value }] } };
  const version = { version: 1, date: state.today, author: byKey, authorAt: snapshotPerson(rosterState, byKey), reason: 'People added when the workspace was set up.', afterEvidence: false, before: null, value: clone(value) };
  const riskNames = rows.filter((p) => p.riskApprover).map((p) => p.name);
  const alone = rows.length === 1;
  const event = {
    id: `ACT-${Date.now()}-w`,
    date: state.today,
    kind: 'milestone',
    surfaced: true,
    title: 'Workspace set up',
    body: alone
      ? `${value[byKey].name} set up ${ws.name} for the ${wf.name} workflow and is its workspace admin. Another person is asked for when an approval first needs one.`
      : `${value[byKey].name} set up ${ws.name} for the ${wf.name} workflow with ${rows.length} people. Workspace admins: ${admins.map((p) => p.name).join(', ')}. Risk approvers: ${riskNames.length ? riskNames.join(', ') : 'none yet'}.${admins.length > 1 ? ' From now on, changing anyone\'s rights needs a second admin\'s approval.' : ''}`,
    capabilityId: null,
    link: '#/people',
  };
  return {
    ...state,
    setupPending: false,
    workspace: { id: slug(ws.name, 'workspace'), ...ws },
    workflow: { id: slug(wf.name, 'workflow'), ...wf },
    roster: { versions: [version] },
    actingAs: byKey,
    activity: [event, ...state.activity],
  };
}

// How many Risk approvers a founding list names, when fewer than two. Setup no
// longer asks for any (a Risk approver is asked for when a change first needs
// one); kept for the store's public API.
export function foundingRiskGap(people = []) {
  const n = people.filter((p) => p && p.riskApprover && String(p.name || '').trim()).length;
  return n < 2 ? n : null;
}

// ---------------------------------------------------------------------------
// Renaming the workspace and workflow (#60)
// ---------------------------------------------------------------------------

// A direct edit by a workspace admin with a required reason (Paige,
// 2026-10-09): it changes nobody's rights or authority, so no sign-off. Every
// change is kept in state.workspaceHistory with its author, reason, before and
// after, and is surfaced in Activity. Records written before a rename keep the
// names in force when they were written (see namesAtRecord).
export function renameWorkspace(state, { workspace = {}, workflow = {}, by, reason } = {}) {
  if (state.setupPending) throw new Error('Set up the workspace first.');
  requireAdmin(state, by);
  const why = String(reason || '').trim();
  if (why.length < 10) throw new Error('Add a reason for the change (a sentence).');
  const before = { workspace: { ...workspaceOf(state) }, workflow: { ...workflowOf(state) } };
  const next = {
    workspace: { ...before.workspace, name: String(workspace.name ?? before.workspace.name).trim(), description: String(workspace.description ?? before.workspace.description).trim() },
    workflow: { ...before.workflow, name: String(workflow.name ?? before.workflow.name).trim(), description: String(workflow.description ?? before.workflow.description).trim() },
  };
  if (next.workspace.name.length < 2) throw new Error('Name the workspace.');
  if (next.workflow.name.length < 2) throw new Error('Name the workflow.');
  const same = (a, b) => a.name === b.name && a.description === b.description;
  if (same(before.workspace, next.workspace) && same(before.workflow, next.workflow)) throw new Error('Nothing to save: the names and descriptions are unchanged.');
  const history = state.workspaceHistory || [];
  const entry = {
    version: history.length + 2,
    date: state.today,
    author: by,
    authorAt: snapshotPerson(state, by),
    reason: why,
    // Decision records numbered up to here were written under the old names.
    recordsBefore: state.decisionRecords.length,
    before,
    value: next,
  };
  const changed = [
    before.workspace.name !== next.workspace.name ? `workspace "${before.workspace.name}" → "${next.workspace.name}"` : null,
    before.workflow.name !== next.workflow.name ? `workflow "${before.workflow.name}" → "${next.workflow.name}"` : null,
    before.workspace.description !== next.workspace.description ? 'workspace description' : null,
    before.workflow.description !== next.workflow.description ? 'workflow description' : null,
  ].filter(Boolean);
  const event = { id: `ACT-${Date.now()}-n`, date: state.today, kind: 'workspace', surfaced: true, title: 'Workspace details changed', body: `${people(state)[by].name} changed the ${changed.join(', ')}. Reason: ${endSentence(why)} Older records keep the names they were made under.`, capabilityId: null, link: '#/people?focus=workspace' };
  return { ...state, workspace: next.workspace, workflow: next.workflow, workspaceHistory: [...history, entry], activity: [event, ...state.activity] };
}

// A reason typed without a final full stop still ends its sentence, so the
// next sentence doesn't run into it.
const endSentence = (text) => (/[.!?]$/.test(text) ? text : `${text}.`);

// The workspace and workflow names in force when a decision record was
// written: the "before" of the first rename made after it, else the current.
export function namesAtRecord(state, record) {
  const later = (state.workspaceHistory || []).find((h) => record.number <= h.recordsBefore);
  return later ? later.before : { workspace: workspaceOf(state), workflow: workflowOf(state) };
}
