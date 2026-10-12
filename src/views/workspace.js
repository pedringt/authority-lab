// The empty-workspace path (roadmap item 7): the setup screen shown on every
// route until the workspace, its workflow and the founding roster are set,
// and the empty state screens show before the first capability exists.
import { html, raw, notice, lede } from '../ui.js';
import { MIN_FOUNDING_ADMINS, foundingRiskGap, workspaceOf, workflowOf } from '../store/index.js';

const BLANK = { name: '', title: '', team: '', workspaceAdmin: false, riskApprover: false };

function personRow(p) {
  return html`<tr>
    <td><input type="text" name="p-name" value="${p.name}" maxlength="60" aria-label="Name"></td>
    <td><input type="text" name="p-title" value="${p.title}" maxlength="80" aria-label="Title"></td>
    <td><input type="text" name="p-team" value="${p.team}" maxlength="40" aria-label="Team"></td>
    <td class="cell-check"><input type="checkbox" name="p-admin" ${p.workspaceAdmin ? raw('checked') : ''} aria-label="Workspace admin"></td>
    <td class="cell-check"><input type="checkbox" name="p-risk" ${p.riskApprover ? raw('checked') : ''} aria-label="Risk approver"></td>
    <td><button class="btn btn-sm btn-ghost" type="button" data-action="row-remove" aria-label="Remove this person">Remove</button></td>
  </tr>`;
}

// Who can set the workspace up: the founding admins typed so far. main.js
// rebuilds this list as the roster is edited.
export function founderOptions(people, chosen) {
  const admins = people.filter((p) => p.workspaceAdmin && String(p.name || '').trim());
  if (!admins.length) return html`<option value="">Mark at least two workspace admins first</option>`;
  return html`<option value="" ${chosen ? '' : raw('selected')}>Choose a workspace admin</option>${admins.map((p) => html`<option value="${p.name.trim()}" ${p.name.trim() === chosen ? raw('selected') : ''}>${p.name.trim()}</option>`)}`;
}

// The non-blocking note when fewer than two Risk approvers are listed.
export function riskGapNote(people) {
  const n = foundingRiskGap(people);
  return n === null ? '' : `Mark two Risk approvers now if you can. ${n === 0 ? 'None are' : 'Only one is'} marked. You can continue without them, but changes to high-impact or financial capabilities can't be approved until there are two. After setup, each new Risk approver needs another admin's approval.`;
}

// `draft` holds what was typed when a submit failed, so nothing is lost.
export function workspaceSetupView(state, query, draft = null) {
  const error = query.get('error');
  const d = draft || { workspace: { name: '', description: '' }, workflow: { name: '', description: '' }, people: [BLANK, BLANK, BLANK], by: '' };
  const gap = riskGapNote(d.people);
  return html`<div class="page-head">
    <div>
      <p class="eyebrow">New workspace</p>
      <h1>Set up the workspace</h1>
      ${lede('Name the workspace and the workflow where AI might help, then add the people who will make decisions.', 'After this, the workspace works the same way as the demo.')}
    </div>
  </div>
  ${error ? notice('fail', 'Could not set up the workspace', error) : ''}
  <form class="setup-form workspace-form" data-form="setup-workspace">
    <div class="card">
      <p class="eyebrow">Workspace</p>
      <label class="field field-stack"><span>Name</span><input type="text" name="ws-name" value="${d.workspace.name}" maxlength="60" placeholder="e.g. Acme Help" required></label>
      <label class="field field-stack"><span>Description</span><input type="text" name="ws-description" value="${d.workspace.description}" maxlength="160" placeholder="What the organization does"></label>
    </div>
    <div class="card">
      <p class="eyebrow">Workflow</p>
      <p class="muted small">One workflow per workspace for now. Every capability belongs to it.</p>
      <label class="field field-stack"><span>Name</span><input type="text" name="wf-name" value="${d.workflow.name}" maxlength="60" placeholder="e.g. Ticket handling" required></label>
      <label class="field field-stack"><span>Description</span><input type="text" name="wf-description" value="${d.workflow.description}" maxlength="200" placeholder="Where work comes from and where AI might help"></label>
    </div>
    <div class="card">
      <p class="eyebrow">People</p>
      <p>Add <strong>at least ${MIN_FOUNDING_ADMINS} workspace admins</strong>. After setup, giving someone a right or removing one needs a second admin's approval, so one admin alone can't change anything. <strong>Risk approvers</strong> are optional now, but changes to high-impact or financial capabilities can't be approved without them.</p>
      <div class="table-card"><table class="table table-edit table-founders">
        <thead><tr><th>Name</th><th>Title</th><th>Team</th><th>Workspace admin</th><th>Risk approver</th><th><span class="sr-only">Remove</span></th></tr></thead>
        <tbody data-rows="founders">${d.people.map(personRow)}</tbody>
      </table></div>
      <button class="btn btn-sm" type="button" data-action="row-add" data-kind="founders">Add a person</button>
      <p class="notice notice-watch risk-gap" data-risk-gap role="status" ${gap ? '' : raw('hidden')}>${gap}</p>
    </div>
    <div class="card">
      <label class="field field-stack"><span>Who is setting this up?</span>
        <select name="ws-by" data-founders required>${founderOptions(d.people, d.by)}</select></label>
      <p class="muted small">Choose one of the workspace admins above. They're recorded as setting up the workspace, and you'll be acting as them when it opens.</p>
    </div>
    <button class="btn btn-primary" type="submit">Set up the workspace</button>
  </form>
  <template id="row-founders">${personRow(BLANK)}</template>`;
}

// Shown where a screen needs a capability and the workspace has none yet.
export function noCapabilitiesView(state, title) {
  return html`<div class="page-head">
    <div>
      <p class="eyebrow">${workspaceOf(state).name} · ${workflowOf(state).name}</p>
      <h1>${title}</h1>
    </div>
  </div>
  <div class="card empty-state">
    <p><strong>No capabilities yet.</strong> A capability is one thing the AI may eventually do on its own in ${workflowOf(state).name}, like "Recommend a refund". Add one to give it an owner, a risk profile and a starting authority. Rules, targets, scenarios and tests come next.</p>
    <p><a class="btn btn-primary" href="#/capabilities/new">Add the first capability</a></p>
  </div>`;
}
