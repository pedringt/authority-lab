// Overview (redesign, 2026-10-12): one question, what needs action? Four
// sections across every capability, in this order: To do, Approvals needed,
// Important results, Current autonomy. Work shows as rows on dividers, not
// cards; detail lives one level down, in the capability.

import { html, badge, section, fmtDate } from '../ui.js';
import { levelName, workspaceOf, workflowOf, overviewTodos, overviewApprovals, importantResults, authorityRows } from '../store/index.js';

// The authority ladder as five small squares: filled up to the current level,
// dashed at a proposed one. Used by the capability's Status tab.
export function ladder(level, next = null) {
  return html`<span class="ladder" role="img" aria-label="Level ${level}, ${levelName(level)}">${[0, 1, 2, 3, 4].map((i) => html`<i class="${i <= level ? 'on' : i === next ? 'next' : ''}"></i>`)}</span>`;
}

const empty = (text) => html`<p class="ov-empty">${text}</p>`;
const yours = (mine) => (mine ? html` · <span class="ov-yours">yours</span>` : '');

// One work row: capability small above, the work, one supporting line, who it
// waits on, and the action on the right. Only the top to-do is emphasized.
function workRow({ cap, title, sub, meta, mine, emphasis, action, href }) {
  return html`<div class="ov-row ${emphasis ? 'is-hot' : ''}">
    <div class="ov-text">
      <p class="ov-cap">${cap}</p>
      <p class="ov-title">${title}</p>
      <p class="ov-sub">${sub}</p>
      <p class="ov-who">${meta.join(' · ')}${yours(mine)}</p>
    </div>
    <a class="btn btn-sm ${emphasis ? 'btn-primary' : ''}" href="${href}">${action} →</a>
  </div>`;
}

const todoRow = (t) => workRow({ ...t, meta: [`${t.ownerRole || 'Owner'}: ${t.ownerName}`] });

function resultRow(r) {
  return html`<div class="ov-result">
    <p class="ov-kind ov-kind-${r.tone}">${r.label}<a class="ov-result-cap" href="#/capabilities/${r.capabilityId}">${r.cap}</a></p>
    <div class="ov-text"><p class="ov-title">${r.text}</p>${r.so ? html`<p class="ov-so">${r.so}</p>` : ''}</div>
  </div>`;
}

function autonomyTable(rows) {
  return html`<div class="ov-table-wrap"><table class="ov-table">
    <thead><tr><th>Capability</th><th>What it handles now</th><th>Next</th></tr></thead>
    <tbody>${rows.map((r) => html`<tr>
      <td><a href="#/capabilities/${r.capabilityId}"><strong>${r.cap}</strong></a></td>
      <td>${r.plain}<div class="ov-level">${r.level}</div></td>
      <td class="ov-next">${r.next.badge ? html`${badge(...r.next.badge)} ` : ''}${r.next.text}</td>
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
  </div></div>`;
  const count = (n) => html`<span class="ov-count">${n}</span>`;
  return html`${head}
    ${section(html`To do ${todos.length ? count(todos.length) : ''}`, todos.length ? html`<div class="ov-rows">${todos.map(todoRow)}</div>` : empty('Nothing to do right now.'), { id: 'todo' })}
    ${section(html`Approvals needed ${approvals.length ? count(approvals.length) : ''}`, approvals.length ? html`<div class="ov-rows">${approvals.map(workRow)}</div>` : empty('Nothing is waiting for approval.'), { id: 'approvals' })}
    ${section('Important results', results.length ? html`<div class="ov-results">${results.map(resultRow)}</div>` : empty('No results are changing any capability\'s autonomy.'), { id: 'results' })}
    ${section('Current autonomy', autonomyTable(authorityRows(state)), { id: 'autonomy' })}`;
}
