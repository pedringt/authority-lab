// The empty-workspace path (roadmap item 7): the setup screen shown on every
// route until the workspace is set up, and the empty state screens shown
// before the first capability exists. Setup asks only what's needed to start
// (Paige, 2026-10-12): the names, which have defaults, and the person starting
// it. Everyone else is added when they're needed.
import { html, notice } from '../ui.js';
import { workspaceOf, workflowOf } from '../store/index.js';

export const SETUP_DEFAULTS = { workspace: 'My workspace', workflow: 'Main workflow' };

// `draft` holds what was typed when a submit failed, so nothing is lost.
export function workspaceSetupView(state, query, draft = null) {
  const error = query.get('error');
  const d = draft || { workspace: { name: SETUP_DEFAULTS.workspace }, workflow: { name: SETUP_DEFAULTS.workflow }, founder: { name: '', title: '' } };
  const f = d.founder || { name: '', title: '' };
  return html`<div class="page-head">
    <div>
      <p class="eyebrow">New workspace</p>
      <h1>Start a workspace</h1>
      <p class="lede">Say who you are, then add the first capability.</p>
    </div>
  </div>
  ${error ? notice('fail', 'Could not start the workspace', error) : ''}
  <form class="setup-form workspace-form onboard-form" data-form="setup-workspace">
    <div class="onboard-group">
      <h2 class="onboard-q">Who's starting it?</h2>
      <div class="two-col">
        <label class="field field-stack"><span>Your name</span><input type="text" name="f-name" value="${f.name}" maxlength="60" autocomplete="name" required></label>
        <label class="field field-stack"><span>Your title</span><input type="text" name="f-title" value="${f.title}" maxlength="80" placeholder="e.g. Head of Support" required></label>
      </div>
      <p class="muted small">You'll be the workspace admin. You can do everything on your own until a change needs someone else's approval; Authority Lab says who to add at that point.</p>
    </div>
    <div class="onboard-group">
      <h2 class="onboard-q">What should we call it?</h2>
      <div class="two-col">
        <label class="field field-stack"><span>Workspace</span><input type="text" name="ws-name" value="${d.workspace.name}" maxlength="60" required></label>
        <label class="field field-stack"><span>Workflow</span><input type="text" name="wf-name" value="${d.workflow.name}" maxlength="60" required></label>
      </div>
      <p class="muted small">The workflow is where automation might help, like "Ticket handling". You can rename both later under Settings.</p>
    </div>
    <button class="btn btn-primary" type="submit">Start and add the first capability</button>
  </form>`;
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
    <p><strong>No capabilities yet.</strong> A capability is one piece of work in ${workflowOf(state).name} that could earn more autonomy, like "Recommend a refund". Add one to say what it does, who owns it and what happens if it gets it wrong.</p>
    <p><a class="btn btn-primary" href="#/capabilities/new">Add the first capability</a></p>
  </div>`;
}
