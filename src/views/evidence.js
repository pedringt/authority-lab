import * as seed from '../data/seed.js';
import { html, badge, section, fmtDate } from '../ui.js';
import { requirementsList } from './capability.js';

const STATUSES = [['all', 'All'], ['pass', 'Pass'], ['watch', 'Watch'], ['insufficient', 'Insufficient'], ['fail', 'Fail']];

export function evidenceView(state, query) {
  const source = query.get('source') || 'all';
  const status = query.get('status') || 'all';
  const segment = query.get('segment') || 'all';
  const risk = query.get('risk') || 'all';

  const sources = [...new Set(state.evidence.map((e) => e.source))];
  const segments = [...new Set(state.evidence.map((e) => e.segment))];
  const risks = ['High', 'Medium', 'Low'];

  let items = state.evidence.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  if (source !== 'all') items = items.filter((e) => e.source === source);
  if (status !== 'all') items = items.filter((e) => e.status === status);
  if (segment !== 'all') items = items.filter((e) => e.segment === segment);
  if (risk !== 'all') items = items.filter((e) => e.risk === risk);

  const link = (over) => {
    const q = new URLSearchParams({ source, status, segment, risk, ...over });
    return `#/evidence?${q.toString()}`;
  };

  const counts = {
    pass: state.evidence.filter((e) => e.status === 'pass').length,
    watch: state.evidence.filter((e) => e.status === 'watch').length,
    insufficient: state.evidence.filter((e) => e.status === 'insufficient').length,
    fail: state.evidence.filter((e) => e.status === 'fail').length,
  };

  const filters = html`<div class="filter-bar">
    <div class="filter-group" role="group" aria-label="Status">${STATUSES.map(([k, l]) => html`<a class="chip ${status === k ? 'is-active' : ''}" href="${link({ status: k })}">${l}${k !== 'all' ? html` <span class="chip-count">${counts[k]}</span>` : ''}</a>`)}</div>
    <div class="filter-group" role="group" aria-label="Source"><a class="chip ${source === 'all' ? 'is-active' : ''}" href="${link({ source: 'all' })}">All sources</a>${sources.map((s) => html`<a class="chip ${source === s ? 'is-active' : ''}" href="${link({ source: s })}">${s}</a>`)}</div>
    <div class="filter-group" role="group" aria-label="Segment"><a class="chip ${segment === 'all' ? 'is-active' : ''}" href="${link({ segment: 'all' })}">All segments</a>${segments.map((s) => html`<a class="chip ${segment === s ? 'is-active' : ''}" href="${link({ segment: s })}">${s}</a>`)}</div>
    <div class="filter-group" role="group" aria-label="Risk"><a class="chip ${risk === 'all' ? 'is-active' : ''}" href="${link({ risk: 'all' })}">Any risk</a>${risks.map((s) => html`<a class="chip ${risk === s ? 'is-active' : ''}" href="${link({ risk: s })}">${s} risk</a>`)}</div>
  </div>`;

  const cards = items.map((e) => html`<article class="card evidence-item evidence-${e.status}">
    <div class="evidence-head">
      <div><span class="eyebrow">${e.source} · ${e.id}</span><h3>${e.metric}</h3></div>
      ${badge(e.status)}
    </div>
    <p class="evidence-value">${e.value}</p>
    <p class="muted">${e.detail}</p>
    <div class="evidence-meta"><span>${fmtDate(e.date)}</span><span>${e.segment === 'All' ? 'All segments' : e.segment}</span><span>${e.risk} risk</span><a href="${e.link}">Source</a></div>
  </article>`);

  return html`<div class="page-head">
    <div>
      <p class="eyebrow">${seed.workspace.name} · Refund recommendation</p>
      <h1>Evidence</h1>
      <p class="lede">Everything the authority decision rests on, from automated tests, the pilot, human review, operations, cost, incidents, user feedback and stakeholder assessment. Each item links back to where it came from.</p>
    </div>
  </div>
  ${filters}
  ${items.length ? html`<div class="evidence-grid">${cards}</div>` : html`<p class="empty">No evidence matches these filters.</p>`}
  ${section('Evidence requirements for Level 2 → Level 3', requirementsList(), { subtitle: 'What has to be true before the proposed change can be authorized. Five of six are met.' })}`;
}
