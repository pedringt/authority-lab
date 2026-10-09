// The empty-workspace path (roadmap item 7): start from a blank workspace, then
// set up the workspace, its one workflow and the founding roster before
// anything else. The founding roster is recorded directly as roster version 1,
// the way the seed is; every rights change after it is governed.

import { initialState, clone } from './state.js';
import { personKey, snapshotPerson } from './people.js';

const slug = (text, fallback) => (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback;

// A blank workspace waiting for setup: no capabilities, records, people or
// activity. Demo date and settings are unchanged.
export function startEmpty() {
  const base = initialState();
  return {
    ...base,
    setupPending: true,
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
  };
}

export function setupPending(state) {
  return Boolean(state.setupPending);
}

// At least two workspace admins: a rights change needs a different admin to
// approve it, so one admin could never grant anyone a right.
export const MIN_FOUNDING_ADMINS = 2;

export function setUpWorkspace(state, { workspace = {}, workflow = {}, people = [] } = {}) {
  if (!state.setupPending) throw new Error('This workspace is already set up.');
  const ws = { name: String(workspace.name || '').trim(), description: String(workspace.description || '').trim() };
  const wf = { name: String(workflow.name || '').trim(), description: String(workflow.description || '').trim() };
  if (ws.name.length < 2) throw new Error('Name the workspace.');
  if (wf.name.length < 2) throw new Error('Name the workflow.');
  const rows = people
    .map((p) => ({ name: String(p.name || '').trim(), title: String(p.title || '').trim(), team: String(p.team || '').trim(), workspaceAdmin: Boolean(p.workspaceAdmin), riskApprover: Boolean(p.riskApprover) }))
    .filter((p) => p.name || p.title || p.team);
  if (rows.some((p) => !p.name || !p.title || !p.team)) throw new Error('Every person needs a name, a title and a team.');
  if (rows.length < 2) throw new Error('The founding roster needs at least two people.');
  const keys = rows.map((p) => personKey(p.name));
  if (new Set(keys).size !== keys.length) throw new Error('Two people have the same name. Make each name distinct.');
  const admins = rows.filter((p) => p.workspaceAdmin);
  if (admins.length < MIN_FOUNDING_ADMINS) throw new Error(`The founding roster needs at least ${MIN_FOUNDING_ADMINS} workspace admins, because every later rights change needs a different admin to approve it.`);

  const value = Object.fromEntries(rows.map((p, i) => [keys[i], { name: p.name, role: p.title, team: p.team, active: true, rights: { riskApprover: p.riskApprover, workspaceAdmin: p.workspaceAdmin } }]));
  const founder = keys[rows.indexOf(admins[0])];
  const rosterState = { roster: { versions: [{ value }] } };
  const version = { version: 1, date: state.today, author: founder, authorAt: snapshotPerson(rosterState, founder), reason: 'Founding roster, recorded at workspace setup.', afterEvidence: false, before: null, value: clone(value) };
  const riskNames = rows.filter((p) => p.riskApprover).map((p) => p.name);
  const event = {
    id: `ACT-${Date.now()}-w`,
    date: state.today,
    kind: 'milestone',
    surfaced: true,
    title: 'Workspace set up',
    body: `${ws.name}, workflow ${wf.name}. Founding roster of ${rows.length}: workspace admins ${admins.map((p) => p.name).join(', ')}; Risk approvers ${riskNames.length ? riskNames.join(', ') : 'none yet'}. From here, every rights change is a proposal approved by a different admin.`,
    capabilityId: null,
    link: '#/people',
  };
  return {
    ...state,
    setupPending: false,
    workspace: { id: slug(ws.name, 'workspace'), ...ws },
    workflow: { id: slug(wf.name, 'workflow'), ...wf },
    roster: { versions: [version] },
    actingAs: founder,
    activity: [event, ...state.activity],
  };
}
