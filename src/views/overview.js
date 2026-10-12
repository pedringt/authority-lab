// Overview (simplification pass, 2026-10-12): four sections across every
// capability, in this order: To do, Approvals needed, Important results,
// Current authority. Detail lives one level down, in the capability.

import { html, badge, section, fmtDate } from '../ui.js';
import { workspaceOf, workflowOf, levelName, overviewTodos, overviewApprovals, importantResults, authorityRows } from '../store/index.js';

// The authority ladder as five small squares: filled up to the current level,
// dashed at a proposed one.
export function ladder(level, next = null) {
  return html`<span class="ladder" role="img" aria-label="Level ${level} of 4">${[0, 1, 2, 3, 4].map((i) => html`<i class="${i <= level ? 'on' : i === next ? 'next' : ''}"></i>`)}</span>`;
}

const empty = (text) => html`<p class="ov-empty">${text}</p>`;

function todoCard(t) {
  return html`<div class="card ov-item ${t.lead ? 'is-lead' : ''} ${t.urgent ? 'is-urgent' : ''}">
    <div class="ov-text">
      <p class="eyebrow">${t.cap}</p>
      <h3>${t.title}</h3>
      <p class="ov-why">${t.why}</p>
      ${t.who ? html`<p class="ov-meta">${t.who}</p>` : ''}
    </div>
    <a class="btn ${t.lead || t.urgent ? 'btn-primary' : ''}" href="${t.href}">${t.action}</a>
  </div>`;
}

function approvalCard(a) {
  const progress = a.progress ? html`<span class="ov-progress" aria-hidden="true">${Array.from({ length: a.progress[1] }, (_, i) => html`<i class="${i < a.progress[0] ? 'on' : ''}"></i>`)}</span><strong>${a.progress[0]} of ${a.progress[1]} approvals.</strong> ` : '';
  return html`<div class="card ov-item">
    <div class="ov-text">
      <p class="eyebrow">${a.cap}</p>
      <h3>${a.title}</h3>
      <p class="ov-why">${a.why}</p>
      <p class="ov-who">${progress}${a.who}</p>
      ${a.since ? html`<p class="ov-meta">${a.since}</p>` : ''}
    </div>
    <a class="btn" href="${a.href}">${a.action}</a>
  </div>`;
}

function resultRow(r) {
  return html`<div class="ov-result">
    ${badge(r.tone, r.label)}
    <div class="ov-text"><strong>${r.text}</strong><p class="ov-so">${r.so}</p></div>
    <a class="small muted" href="#/capabilities/${r.capabilityId}">${r.cap}</a>
  </div>`;
}

function authorityTable(rows) {
  return html`<div class="card table-card"><table class="table ov-authority">
    <thead><tr><th>Capability</th><th>Current authority</th><th>Next</th></tr></thead>
    <tbody>${rows.map((r) => html`<tr>
      <td><a href="#/capabilities/${r.capabilityId}"><strong>${r.cap}</strong></a></td>
      <td><span class="ov-level">${ladder(r.authority.level)} Level ${r.authority.level}, ${levelName(r.authority.level)}${r.authority.limited ? ', with limits' : ''}</span>${r.movedBack ? html` ${badge('restricted', 'Moved back')}` : ''}<div class="ov-plain">${r.plain}</div></td>
      <td>${badge(r.next.tone, r.next.text)}${r.next.detail ? html`<div class="ov-plain">${r.next.detail}</div>` : ''}</td>
    </tr>`)}</tbody>
  </table></div>`;
}

export function overviewView(state) {
  const fmt = (d) => fmtDate(d);
  const todos = overviewTodos(state, { fmt });
  const approvals = overviewApprovals(state, { fmt });
  const results = importantResults(state, { fmt });
  const head = html`<div class="page-head"><div>
    <p class="eyebrow">${workspaceOf(state).name} · ${workflowOf(state).name}</p>
    <h1>Overview</h1>
    <p class="lede">What the AI is allowed to do across this workflow, and what needs you.</p>
  </div></div>`;
  const count = (n) => html`<span class="ov-count">${n}</span>`;
  return html`${head}
    ${section(html`To do ${todos.length ? count(todos.length) : ''}`, todos.length ? html`<div class="ov-list">${todos.map(todoCard)}</div>` : empty('Nothing to do right now.'), { id: 'todo' })}
    ${section(html`Approvals needed ${approvals.length ? count(approvals.length) : ''}`, approvals.length ? html`<div class="ov-list">${approvals.map(approvalCard)}</div>` : empty('Nothing is waiting for approval.'), { id: 'approvals' })}
    ${section('Important results', results.length ? html`<div class="card ov-results">${results.map(resultRow)}</div>` : empty('No results are changing what the AI may do.'), { id: 'results', subtitle: 'Only results that change what the AI may do.' })}
    ${section('Current authority', authorityTable(authorityRows(state)), { id: 'authority' })}`;
}
