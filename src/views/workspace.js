// The empty-workspace path (roadmap item 7): the setup screen shown on every
// route until the workspace, its workflow and the founding roster are set,
// and the empty state screens show before the first capability exists.
import { html, raw, notice } from '../ui.js';
import { MIN_FOUNDING_ADMINS, workspaceOf, workflowOf } from '../store/index.js';

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

// `draft` holds what was typed when a submit failed, so nothing is lost.
export function workspaceSetupView(state, query, draft = null) {
  const error = query.get('error');
  const d = draft || { workspace: { name: '', description: '' }, workflow: { name: '', description: '' }, people: [BLANK, BLANK, BLANK] };
  return html`<div class="page-head">
    <div>
      <p class="eyebrow">New workspace</p>
      <h1>Set up the workspace</h1>
      <p class="lede">Before any capability: name the workspace and its workflow, and record who is in it. Everything after this is governed by the same rules as the demo.</p>
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
      <p class="eyebrow">Founding roster</p>
      <p>The first people and their rights, recorded directly as roster version 1. After setup, every rights change is a proposal approved by a different workspace admin, so the founding roster needs <strong>at least ${MIN_FOUNDING_ADMINS} workspace admins</strong>. <strong>Risk approver</strong> is optional here; High-impact and Financial capabilities need it to sign off, and a warning explains any gap.</p>
      <div class="table-card"><table class="table table-edit table-founders">
        <thead><tr><th>Name</th><th>Title</th><th>Team</th><th>Workspace admin</th><th>Risk approver</th><th><span class="sr-only">Remove</span></th></tr></thead>
        <tbody data-rows="founders">${d.people.map(personRow)}</tbody>
      </table></div>
      <button class="btn btn-sm" type="button" data-action="row-add" data-kind="founders">Add a person</button>
      <p class="muted small">The first workspace admin listed sets the workspace up and is acting when it opens.</p>
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
    <p><strong>No capabilities yet.</strong> A capability is one discrete thing the AI might be trusted to do in ${workflowOf(state).name}. Add the first one to define its owner, risk profile and starting authority; its contract, criteria, scenarios and tests follow from there.</p>
    <p><a class="btn btn-primary" href="#/capabilities/new">Add the first capability</a></p>
  </div>`;
}
