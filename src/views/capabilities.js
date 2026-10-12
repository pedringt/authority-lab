import * as seed from '../data/seed.js';
import { html, section, capStatusBadge, authorityBadge, levelScale, fmtDate, person, levelTip, lede } from '../ui.js';
import { authorityLabel, current, decisionRequired, lastEvaluated, workspaceOf, workflowOf } from '../store/index.js';

export function capabilitiesView(state) {
  const rows = state.capabilities.map((c) => html`<tr>
    <td><a href="#/capabilities/${c.id}"><strong>${c.name}</strong></a><div class="muted small">${c.summary}</div></td>
    <td>${authorityBadge(c.authority)}</td>
    <td>${capStatusBadge(c.status)}${decisionRequired(state, c.id) ? html` <span class="badge badge-decision">Decision needed</span>` : ''}</td>
    <td class="muted">${current(state, c.id, 'risk').impact} impact · ${current(state, c.id, 'risk').exposure}</td>
    <td class="muted">${person(c.owner).name}</td>
    <td class="muted">${lastEvaluated(state, c.id) ? fmtDate(lastEvaluated(state, c.id)) : '—'}</td>
  </tr>`);

  const levels = html`<div class="level-legend">${seed.AUTHORITY_LEVELS.map((l) => html`<div class="level-legend-item" title="${levelTip(l.level)}"><strong>L${l.level} ${l.name}</strong><span>${l.description}</span></div>`)}</div>`;

  return html`<div class="page-head">
    <div>
      <p class="eyebrow">${workspaceOf(state).name} · ${workflowOf(state).name}</p>
      <h1>Capabilities</h1>
      ${lede('What the AI is allowed to do in this workflow, one capability at a time.', 'Each capability earns authority separately. Not everything should reach Level 4: two of these are meant to stay where they are.')}
    </div>
    <div class="page-actions"><a class="btn btn-primary" href="#/capabilities/new">Add capability</a></div>
  </div>
  <div class="card table-card">
    <table class="table">
      <thead><tr><th>Capability</th><th>Authority</th><th>Status</th><th>Risk</th><th>Owner</th><th>Last checked</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  ${section('Authority levels', levels, { subtitle: 'Only a person can move a capability up. Software moves it back down automatically if it crosses a safety limit.' })}`;
}
