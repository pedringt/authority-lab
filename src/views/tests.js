import * as seed from '../data/seed.js';
import { html, raw, badge, section, notice, fmtDate } from '../ui.js';
import { testSummary, capData, getCapability, canRunSuite } from '../store.js';

const FILTERS = [
  ['all', 'All'],
  ['failed', 'Failed'],
  ['high', 'High severity'],
  ['escalated', 'Escalated'],
  ['passed', 'Passed'],
];

export function testsView(state, capabilityId, query) {
  const cap = getCapability(state, capabilityId);
  const t = testSummary(state, capabilityId);
  const filter = query.get('filter') || 'all';
  const group = query.get('group') || 'all';
  const d = capData(state, capabilityId);

  const gate = canRunSuite(state, capabilityId);
  const runControl = t.status === 'running'
    ? html`<button class="btn btn-primary" disabled>Running… ${t.completed} of ${t.total}</button>`
    : html`<button class="btn btn-primary" data-action="run-tests" data-capability="${cap.id}" ${gate.ok ? '' : raw('disabled')} title="${gate.ok ? '' : gate.reason}">${t.status === 'complete' ? 'Run test suite again' : 'Run test suite'}</button>${gate.ok || !t.total ? '' : html`<p class="muted small">${gate.reason} <a href="#/capabilities/${cap.id}/criteria/edit">Open the editor</a></p>`}`;

  const summaryLine = !t.total
    ? html`No scenarios have been written for ${cap.name} yet.`
    : t.status === 'complete'
      ? html`<strong>${t.passed} of ${t.total} passed</strong> on today's run. ${t.failed} failed, ${t.highSeverity} high severity. Results were recorded as evidence <a href="#/evidence?capability=${cap.id}&source=Automated%20tests">${d.evidence.find((e) => e.source === 'Automated tests' && e.metric === 'Scenario pass rate')?.id || ''}</a>.`
      : t.status === 'running'
        ? html`Running ${t.completed} of ${t.total} scenarios against the current contract.`
        : t.lastRun
          ? html`Last run ${fmtDate(t.lastRun)}: <strong>${t.recorded.passed} of ${t.total} passed</strong>, ${t.recorded.highSeverity} high-severity failure${t.recorded.highSeverity === 1 ? '' : 's'}. Run the suite to see per-scenario results from this session.`
          : html`Not yet run. Run the suite to see per-scenario results.`;

  const progress = t.status !== 'not-run'
    ? html`<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${t.total}" aria-valuenow="${t.completed}"><span style="width:${(t.completed / t.total) * 100}%"></span></div>`
    : '';

  const highFailures = d.scenarios.filter((s) => !s.pass && s.severity === 'High');
  const failureCallout = t.status === 'complete' && highFailures.length
    ? notice('fail', `${highFailures.length === 1 ? 'One high-severity failure' : `${highFailures.length} high-severity failures`}`, highFailures.map((s) => `${s.id}: ${s.name}. ${s.explanation.split('. ')[0]}.`).join(' ') + ' Linked from Evidence and from the authority decision.', { link: `#/tests?capability=${cap.id}&filter=high`, linkText: 'Show' })
    : '';

  const groupNames = seed.SCENARIO_GROUPS.map((g) => g.name.toLowerCase()).join(', ');

  return html`<div class="page-head">
    <div>
      <p class="eyebrow">${seed.workspace.name} · <a href="#/capabilities/${cap.id}">${cap.name}</a></p>
      <h1>Testing ground</h1>
      <p class="lede">${t.total} seeded scenarios in ${seed.SCENARIO_GROUPS.length} groups (${groupNames}), run against the capability's current contract. No real model call is made; results replay the recorded decisions so the demo is repeatable.</p>
    </div>
    <div class="page-actions">${runControl}</div>
  </div>
  ${capabilityPicker(state, cap.id, (id) => `#/tests?capability=${id}`)}
  <div class="card run-summary"><p>${summaryLine}</p>${progress}</div>
  ${failureCallout}
  ${scenarioTable(state, cap.id, { filter, group })}`;
}

// A small switcher so the testing ground and the evidence repository can show
// any capability that has data.
export function capabilityPicker(state, currentId, hrefFor) {
  const withData = state.capabilities.filter((c) => {
    const d = capData(state, c.id);
    return d.scenarios.length || d.evidence.length || c.id === currentId;
  });
  if (withData.length < 2) return '';
  return html`<div class="filter-bar"><div class="filter-group" role="group" aria-label="Capability">${withData.map((c) => html`<a class="chip ${c.id === currentId ? 'is-active' : ''}" href="${hrefFor(c.id)}">${c.name}</a>`)}</div></div>`;
}

export function scenarioTable(state, capabilityId, { filter = 'all', group = 'all', compact = false } = {}) {
  const t = testSummary(state, capabilityId);
  const d = capData(state, capabilityId);
  const completed = new Set(d.testRun.completed);
  const hasResults = t.status !== 'not-run';

  let rows = d.scenarios;
  if (group !== 'all') rows = rows.filter((s) => s.group === group);
  if (hasResults) {
    if (filter === 'failed') rows = rows.filter((s) => !s.pass);
    if (filter === 'high') rows = rows.filter((s) => s.severity === 'High');
    if (filter === 'escalated') rows = rows.filter((s) => s.escalated);
    if (filter === 'passed') rows = rows.filter((s) => s.pass);
  }

  const base = `#/tests?capability=${capabilityId}`;
  const filters = compact ? '' : html`<div class="filter-bar">
    <div class="filter-group" role="group" aria-label="Result filter">${FILTERS.map(([k, label]) => html`<a class="chip ${k === filter ? 'is-active' : ''}" href="${base}&filter=${k}&group=${group}">${label}${hasResults && k !== 'all' ? html` <span class="chip-count">${countFor(k)}</span>` : ''}</a>`)}</div>
    <div class="filter-group" role="group" aria-label="Category filter"><a class="chip ${group === 'all' ? 'is-active' : ''}" href="${base}&filter=${filter}&group=all">All groups</a>${seed.SCENARIO_GROUPS.map((g) => html`<a class="chip ${g.id === group ? 'is-active' : ''}" href="${base}&filter=${filter}&group=${g.id}">${g.name}</a>`)}</div>
    ${!hasResults && filter !== 'all' ? html`<p class="muted small">Result filters apply after the suite has run.</p>` : ''}
  </div>`;

  function countFor(k) {
    const all = d.scenarios.filter((s) => completed.has(s.id));
    if (k === 'failed') return all.filter((s) => !s.pass).length;
    if (k === 'high') return all.filter((s) => s.severity === 'High').length;
    if (k === 'escalated') return all.filter((s) => s.escalated).length;
    if (k === 'passed') return all.filter((s) => s.pass).length;
    return all.length;
  }

  if (compact && !hasResults) {
    rows = d.scenarios.filter((s) => !s.pass);
  }

  const groupName = (id) => (seed.SCENARIO_GROUPS.find((g) => g.id === id) || { name: id }).name;

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
            ${s.incident ? html`<div><dt>Incident</dt><dd><a href="#/evidence?capability=${capabilityId}&status=fail">${s.incident}</a> · linked from Evidence and the authority decision</dd></div>` : ''}`
            : html`<div><dt>AI decision</dt><dd class="muted">Run the suite to see the result.</dd></div>`}
        </dl>
      </div>
    </details>`;
  });

  return html`${filters}
    ${items.length ? html`<div class="scenario-list">${items}</div>` : html`<p class="empty">${d.scenarios.length ? 'No scenarios match this filter.' : 'No scenarios yet.'}</p>`}`;
}
