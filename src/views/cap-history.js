// History: the archive of decisions, changes and versions.

import * as seed from '../data/seed.js';
import { html, section, fmtDate, personAt, empty, authorityText, tabIntro } from '../ui.js';
import { versionList } from '../store/index.js';
import { proposalsList } from './proposals.js';

export function historyTab(state, cap) {
  const kinds = [['contract', 'Rules'], ['criteria', 'Targets'], ['requirements', 'Decision requirements'], ['stakeholders', 'Stakeholders'], ['risk', 'Risk profile']];
  const changes = ['contract', 'criteria', 'stakeholders'].map((k) => proposalsList(state, cap.id, k)).filter((x) => String(x));
  return html`${tabIntro('Every decision, change and version for this capability. Records never change once written.')}
    ${section('Authority decisions', decisionsTab(state, cap))}
    ${changes.length ? section('Proposed changes', html`${changes}`) : ''}
    ${section('Versions', html`<div class="card"><ul class="plain-list">${kinds.map(([k, label]) => { const n = versionList(state, cap.id, k).length; return html`<li>${n ? html`<a href="#/capabilities/${cap.id}/versions?kind=${k}">${label}</a>` : label} <span class="muted small">· ${n} version${n === 1 ? '' : 's'}</span></li>`; })}</ul></div>`)}
    <p class="small"><a href="#/records?show=activity&capability=${cap.id}">All activity for ${cap.name}</a></p>`;
}

export function decisionsTab(state, cap) {
  const records = state.decisionRecords.filter((x) => x.capabilityId === cap.id).slice().reverse();
  if (!records.length) return empty('No authority decisions yet.');
  return html`<div class="card table-card"><table class="table">
    <thead><tr><th>Record</th><th>Date</th><th>Change</th><th>Decision</th><th>Authorized by</th></tr></thead>
    <tbody>${records.map((x) => html`<tr>
      <td><a href="#/records/${x.id}">Authority change #${String(x.number).padStart(2, '0')}</a></td>
      <td>${fmtDate(x.date)}</td>
      <td>${x.previous ? html`${authorityText(x.previous, { short: true })} → ` : html`<span class="muted">New → </span>`}${authorityText(x.next, { short: true })}</td>
      <td>${optionLabel(x.option)}</td>
      <td>${personAt(x.authorizedByAt, x.authorizedBy).name}</td>
    </tr>`)}</tbody>
  </table></div>`;
}

export function optionLabel(option) {
  if (option === 'auto-restrict') return 'Automatic restriction';
  if (option === 'define') return 'Starting authority';
  if (option === 'not-delegated') return 'Not delegated, by design';
  const o = seed.DECISION_OPTIONS.find((x) => x.id === option);
  return o ? o.name : option;
}
