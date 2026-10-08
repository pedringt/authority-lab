import * as seed from '../data/seed.js';
import { html, section, capStatusBadge, authorityBadge, levelScale, fmtDate, person, levelTip } from '../ui.js';
import { authorityLabel, current, decisionRequired, lastEvaluated } from '../store/index.js';

export function capabilitiesView(state) {
  const rows = state.capabilities.map((c) => html`<tr>
    <td><a href="#/capabilities/${c.id}"><strong>${c.name}</strong></a><div class="muted small">${c.summary}</div></td>
    <td>${authorityBadge(c.authority)}</td>
    <td>${capStatusBadge(c.status)}${decisionRequired(state, c.id) ? html` <span class="badge badge-decision">Decision required</span>` : ''}</td>
    <td class="muted">${current(state, c.id, 'risk').impact} impact · ${current(state, c.id, 'risk').exposure}</td>
    <td class="muted">${person(c.owner).name}</td>
    <td class="muted">${lastEvaluated(state, c.id) ? fmtDate(lastEvaluated(state, c.id)) : '—'}</td>
  </tr>`);

  const levels = html`<div class="level-legend">${seed.AUTHORITY_LEVELS.map((l) => html`<div class="level-legend-item" title="${levelTip(l.level)}"><strong>L${l.level} ${l.name}</strong><span>${l.description}</span></div>`)}</div>`;

  return html`<div class="page-head">
    <div>
      <p class="eyebrow">${seed.workspace.name} · ${seed.workflow.name}</p>
      <h1>Authority map</h1>
      <p class="lede">What the AI is allowed to do in this workflow, one capability at a time. Authority is earned per capability. Not every capability should reach Level 4; two here are intended to stay where they are.</p>
    </div>
    <div class="page-actions"><a class="btn btn-primary" href="#/capabilities/new">Add capability</a></div>
  </div>
  <div class="card table-card">
    <table class="table">
      <thead><tr><th>Capability</th><th>Authority</th><th>Status</th><th>Risk</th><th>Owner</th><th>Last evaluated</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  ${section('Authority levels', levels, { subtitle: 'Humans authorize moves up this scale. Software may move a capability down when a predefined condition is triggered.' })}`;
}
