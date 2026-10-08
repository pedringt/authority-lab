import * as seed from '../data/seed.js';
import { html, badge, fmtDate, person } from '../ui.js';
import { getCapability, activityEvents, versionFor, KIND_LABELS_ALL, KIND_LABELS } from '../store/index.js';
import { diffValues, prettyPath } from '../diff.js';

const KIND_TONE = {
  authority: 'pass',
  restriction: 'fail',
  failure: 'fail',
  mitigation: 'watch',
  amendment: 'watch',
  milestone: 'neutral',
  review: 'neutral',
  criteria: 'neutral',
  'criteria-locked': 'neutral',
  'contract-finalized': 'pass',
  'contract-draft': 'neutral',
  'criteria-saved': 'neutral',
  'scenarios-saved': 'neutral',
  'criteria-locked': 'watch',
  decision: 'neutral',
  test: 'neutral',
};

export function activityView(state, query) {
  const full = query.get('view') === 'full';
  const kind = query.get('kind') || 'all';
  const capabilityId = query.get('capability') || 'all';
  const events = activityEvents(state, { full, kind, capabilityId });
  const surfacedCount = activityEvents(state, { kind, capabilityId }).length;
  const fullCount = activityEvents(state, { full: true, kind, capabilityId }).length;

  const link = (over) => {
    const q = new URLSearchParams({ view: full ? 'full' : 'default', kind, capability: capabilityId, ...over });
    return `#/activity?${q.toString()}`;
  };

  const kindsPresent = [...new Set(state.activity.map((e) => e.kind))];
  const capsPresent = state.capabilities.filter((c) => state.activity.some((e) => e.capabilityId === c.id));

  const filters = html`<div class="filter-bar">
    <div class="filter-group" role="group" aria-label="View">
      <a class="chip ${!full ? 'is-active' : ''}" href="${link({ view: 'default' })}">Important <span class="chip-count">${surfacedCount}</span></a>
      <a class="chip ${full ? 'is-active' : ''}" href="${link({ view: 'full' })}">Full history <span class="chip-count">${fullCount}</span></a>
    </div>
    <div class="filter-group" role="group" aria-label="Kind"><a class="chip ${kind === 'all' ? 'is-active' : ''}" href="${link({ kind: 'all' })}">All kinds</a>${kindsPresent.map((k) => html`<a class="chip ${kind === k ? 'is-active' : ''}" href="${link({ kind: k })}">${KIND_LABELS_ALL[k] || k}</a>`)}</div>
    <div class="filter-group" role="group" aria-label="Capability"><a class="chip ${capabilityId === 'all' ? 'is-active' : ''}" href="${link({ capability: 'all' })}">All capabilities</a>${capsPresent.map((c) => html`<a class="chip ${capabilityId === c.id ? 'is-active' : ''}" href="${link({ capability: c.id })}">${c.name}</a>`)}</div>
  </div>`;

  const items = events.map((a) => html`<li class="activity-item activity-${a.kind} ${a.surfaced ? '' : 'is-quiet'}">
    <div class="activity-date">${fmtDate(a.date)}</div>
    <div class="activity-body">
      <div class="activity-head">${badge(KIND_TONE[a.kind] || 'neutral', KIND_LABELS_ALL[a.kind] || a.kind)}<strong>${a.title}</strong>${a.surfaced ? '' : html`<span class="muted small">Full history only</span>`}</div>
      <p>${a.body}</p>
      ${a.kind === 'amendment' ? amendmentDetail(state, a) : ''}
      <div class="activity-meta"><a href="#/capabilities/${a.capabilityId}">${(getCapability(state, a.capabilityId) || { name: a.capabilityId }).name}</a>${a.link ? html` · <a href="${a.link}">Open</a>` : ''}</div>
    </div>
  </li>`);

  return html`<div class="page-head">
    <div>
      <p class="eyebrow">${seed.workspace.name} · ${seed.workflow.name}</p>
      <h1>Activity</h1>
      <p class="lede">An audit-style history. Everything is recorded; the default view shows decisions, automatic restrictions, test runs, pilot milestones, failures, mitigations, stakeholder reviews and amendments made after performance results were seen. Full history shows the rest.</p>
    </div>
  </div>
  ${filters}
  ${items.length ? html`<ol class="activity-list">${items}</ol>` : html`<p class="empty">No events match these filters.</p>`}`;
}

function amendmentDetail(state, a) {
  const v = versionFor(state, a.capabilityId, a.objectKind, a.version);
  if (!v) return '';
  return html`<details class="amendment">
    <summary>Before / after · ${KIND_LABELS[a.objectKind]} v${v.version - 1} → v${v.version}${v.afterEvidence ? html` ${badge('watch', 'After evidence')}` : ''}</summary>
    ${deviationsView(v)}
    ${diffTable(v.before, v.value)}
    <p class="muted small"><a href="#/capabilities/${a.capabilityId}/versions?kind=${a.objectKind}&version=${v.version}">All versions of the ${KIND_LABELS[a.objectKind].toLowerCase()}</a></p>
  </details>`;
}

export function deviationsView(v) {
  if (!v || !v.deviations || !v.deviations.length) return '';
  return html`<div class="deviations"><p class="fact-label">Risk-derived defaults loosened or removed</p><ul class="plain-list">${v.deviations.map((x) => html`<li>${badge('watch', x.change === 'removed' ? 'Removed' : 'Loosened')} ${x.label ? html`<strong>${x.label}</strong>: ` : ''}${x.from}${x.to ? html` → ${x.to}` : ''}</li>`)}</ul><p class="muted small">Reason: ${v.reason}</p></div>`;
}

export function diffTable(before, after) {
  const changes = diffValues(before, after);
  if (!changes.length) return html`<p class="muted small">No change in content.</p>`;
  return html`<table class="table table-diff">
    <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
    <tbody>${changes.map((c) => html`<tr class="diff-${c.type}">
      <td>${prettyPath(c.path) || '(value)'} <span class="muted small">${c.type}</span></td>
      <td class="diff-before">${c.before}</td>
      <td class="diff-after">${c.after}</td>
    </tr>`)}</tbody>
  </table>`;
}
