// Capabilities (redesign, 2026-10-12): one simple table, in the Overview's
// style. What each capability handles now comes first; the level name is a
// plain column, and only a restriction is called out.
import { html, person } from '../ui.js';
import { authorityRows, workspaceOf, workflowOf, getCapability, setupState } from '../store/index.js';

export function capabilitiesView(state) {
  const rows = authorityRows(state).map((r) => {
    const cap = getCapability(state, r.capabilityId);
    return html`<tr>
      <td><a href="#/capabilities/${r.capabilityId}"><strong>${r.cap}</strong></a></td>
      <td>${r.plain}</td>
      <td>${setupState(state, cap.id) === 'draft' ? 'Not granted yet · setup not confirmed' : html`${r.level}${cap.status === 'restricted' ? ' · Restricted' : cap.status === 'not-delegated' ? ' · Not delegated' : cap.status === 'suspended' ? ' · Paused' : ''}${r.above ? ' · Above approved Authority' : ''}`}</td>
      <td class="muted">${person(cap.owner).name}</td>
    </tr>`;
  });

  return html`<div class="page-head">
    <div>
      <p class="eyebrow">${workspaceOf(state).name} · ${workflowOf(state).name}</p>
      <h1>Capabilities</h1>
    </div>
    <div class="page-actions"><a class="btn btn-primary" href="#/capabilities/new">Add capability</a></div>
  </div>
  <div class="ov-table-wrap">
    <table class="ov-table">
      <thead><tr><th>Capability</th><th>What it handles now</th><th>Autonomy</th><th>Owner</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}
