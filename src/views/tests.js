import * as seed from '../data/seed.js';
import { html, raw, badge, section, notice, fmtDate } from '../ui.js';
import { testSummary } from '../store.js';

const FILTERS = [
  ['all', 'All'],
  ['failed', 'Failed'],
  ['high', 'High severity'],
  ['escalated', 'Escalated'],
  ['passed', 'Passed'],
];

export function testsView(state, query) {
  const t = testSummary(state);
  const filter = query.get('filter') || 'all';
  const group = query.get('group') || 'all';

  const runControl = t.status === 'running'
    ? html`<button class="btn btn-primary" disabled>Running… ${t.completed} of ${t.total}</button>`
    : html`<button class="btn btn-primary" data-action="run-tests">${t.status === 'complete' ? 'Run test suite again' : 'Run test suite'}</button>`;

  const summaryLine = t.status === 'complete'
    ? html`<strong>${t.passed} of ${t.total} passed</strong> on today's run. ${t.failed} failed, ${t.highSeverity} high severity. Results were recorded as evidence <a href="#/evidence">EV-01</a>.`
    : t.status === 'running'
      ? html`Running ${t.completed} of ${t.total} scenarios against the current contract.`
      : html`Last run ${fmtDate(t.lastRun)}: <strong>${t.seeded.passed} of ${t.total} passed</strong>, ${t.seeded.highSeverity} high-severity failure. Run the suite to see per-scenario results from this session.`;

  const progress = t.status !== 'not-run'
    ? html`<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${t.total}" aria-valuenow="${t.completed}"><span style="width:${(t.completed / t.total) * 100}%"></span></div>`
    : '';

  const failureCallout = t.status === 'complete'
    ? notice('fail', 'One high-severity failure', 'H-04: a $420 refund on a fraud-flagged account was recommended instead of escalated. The enforcement gate added Oct 4 means this cannot become an automatic action, but the recommendation is still wrong. This failure is linked from Evidence and from the authority decision.', { link: '#/tests?filter=high', linkText: 'Show it' })
    : '';

  return html`<div class="page-head">
    <div>
      <p class="eyebrow">${seed.workspace.name} · Refund recommendation</p>
      <h1>Testing ground</h1>
      <p class="lede">Twenty-six seeded scenarios in five groups, run against the capability's current contract. No real model call is made; results replay the recorded decisions so the demo is repeatable.</p>
    </div>
    <div class="page-actions">${runControl}</div>
  </div>
  <div class="card run-summary"><p>${summaryLine}</p>${progress}</div>
  ${failureCallout}
  ${scenarioTable(state, { filter, group })}`;
}

export function scenarioTable(state, { filter = 'all', group = 'all', compact = false } = {}) {
  const t = testSummary(state);
  const completed = new Set(state.testRun.completed);
  const hasResults = t.status !== 'not-run';

  let rows = seed.scenarios;
  if (group !== 'all') rows = rows.filter((s) => s.group === group);
  if (hasResults) {
    if (filter === 'failed') rows = rows.filter((s) => !s.pass);
    if (filter === 'high') rows = rows.filter((s) => s.severity === 'High');
    if (filter === 'escalated') rows = rows.filter((s) => s.escalated);
    if (filter === 'passed') rows = rows.filter((s) => s.pass);
  }

  const filters = compact ? '' : html`<div class="filter-bar">
    <div class="filter-group" role="group" aria-label="Result filter">${FILTERS.map(([k, label]) => html`<a class="chip ${k === filter ? 'is-active' : ''}" href="#/tests?filter=${k}&group=${group}">${label}${hasResults && k !== 'all' ? html` <span class="chip-count">${countFor(k)}</span>` : ''}</a>`)}</div>
    <div class="filter-group" role="group" aria-label="Category filter"><a class="chip ${group === 'all' ? 'is-active' : ''}" href="#/tests?filter=${filter}&group=all">All groups</a>${seed.SCENARIO_GROUPS.map((g) => html`<a class="chip ${g.id === group ? 'is-active' : ''}" href="#/tests?filter=${filter}&group=${g.id}">${g.name}</a>`)}</div>
    ${!hasResults && filter !== 'all' ? html`<p class="muted small">Result filters apply after the suite has run.</p>` : ''}
  </div>`;

  function countFor(k) {
    const all = seed.scenarios.filter((s) => completed.has(s.id));
    if (k === 'failed') return all.filter((s) => !s.pass).length;
    if (k === 'high') return all.filter((s) => s.severity === 'High').length;
    if (k === 'escalated') return all.filter((s) => s.escalated).length;
    if (k === 'passed') return all.filter((s) => s.pass).length;
    return all.length;
  }

  if (compact && !hasResults) {
    rows = seed.scenarios.filter((s) => !s.pass);
  }

  const groupName = (id) => seed.SCENARIO_GROUPS.find((g) => g.id === id).name;

  const items = rows.map((s) => {
    const done = hasResults && completed.has(s.id);
    const pendingRun = t.status === 'running' && !done;
    const showResult = done || (compact && !hasResults);
    const cls = ['scenario', showResult ? (s.pass ? 'is-pass' : 'is-fail') : 'is-pending', s.severity === 'High' ? 'is-high' : ''].join(' ');
    return html`<details class="${cls}" ${showResult && !s.pass ? raw('open') : ''}>
      <summary>
        <span class="scenario-id">${s.id}</span>
        <span class="scenario-name"><strong>${s.name}</strong><span class="muted small"> · ${groupName(s.group)}</span></span>
        <span class="scenario-status">
          ${showResult ? badge(s.pass ? 'pass' : 'fail') : pendingRun ? html`<span class="badge badge-neutral">Running</span>` : html`<span class="badge badge-neutral">Not run</span>`}
          ${showResult && s.severity !== 'None' ? html`<span class="badge badge-${s.severity === 'High' ? 'fail' : 'watch'}">${s.severity} severity</span>` : ''}
          ${showResult && s.escalated ? html`<span class="badge badge-neutral">Escalated</span>` : ''}
        </span>
      </summary>
      <div class="scenario-body">
        <dl class="kv kv-stack">
          <div><dt>Scenario</dt><dd>${s.situation}</dd></div>
          <div><dt>Expected behavior</dt><dd>${s.expected}</dd></div>
          ${showResult ? html`
            <div><dt>AI decision</dt><dd>${s.aiDecision}</dd></div>
            <div><dt>Outcome</dt><dd>${s.outcome}${s.failureType ? html` <span class="muted">(${s.failureType})</span>` : ''}</dd></div>
            <div><dt>Explanation</dt><dd>${s.explanation}</dd></div>
            <div><dt>Human reviewer</dt><dd>${s.reviewer}</dd></div>
            ${s.incident ? html`<div><dt>Incident</dt><dd><a href="#/evidence?status=fail">${s.incident}</a> · linked from Evidence and the authority decision</dd></div>` : ''}`
            : html`<div><dt>AI decision</dt><dd class="muted">Run the suite to see the result.</dd></div>`}
        </dl>
      </div>
    </details>`;
  });

  return html`${filters}
    ${items.length ? html`<div class="scenario-list">${items}</div>` : html`<p class="empty">No scenarios match this filter.</p>`}`;
}
