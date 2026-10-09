import * as seed from '../data/seed.js';
import { html, raw, badge, section, notice, fmtDate } from '../ui.js';
import { testSummary, capData, getCapability, canRunSuite, workspaceOf } from '../store/index.js';

const FILTERS = [
  ['all', 'All results'],
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
      ? html`<strong>${t.passed} of ${t.total} passed</strong> on today's run.${d.scenarios.some((x) => x.simulated) ? ' Results are simulated (seeded, deterministic).' : ''} ${t.failed} failed, ${t.highSeverity} high severity. Results were recorded as evidence <a href="#/evidence?capability=${cap.id}&source=Automated%20tests">${d.evidence.find((e) => e.source === 'Automated tests' && e.metric === 'Scenario pass rate')?.id || ''}</a>.`
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
      <p class="eyebrow">${workspaceOf(state).name} · <a href="#/capabilities/${cap.id}">${cap.name}</a></p>
      <h1>${capabilityHeading(state, cap, 'Tests for', (id) => `#/tests?capability=${id}`)}</h1>
      <p class="lede">The testing ground: ${t.total} seeded scenarios in ${seed.SCENARIO_GROUPS.length} groups (${groupNames}), run against the capability's current contract. No real model call is made; results replay the recorded decisions so the demo is repeatable.</p>
    </div>
    ${t.status === 'not-run' && t.total ? '' : html`<div class="page-actions">${runControl}</div>`}
  </div>
  ${query.get('error') ? notice('fail', 'Could not run the test suite', query.get('error')) : ''}
  ${cap.added ? html`<p class="muted small"><a href="#/capabilities/${cap.id}/scenarios/edit">Edit the scenario library</a></p>` : ''}
  <div class="card run-summary ${t.status === 'not-run' && t.total ? 'is-cta' : ''}"><p>${summaryLine}</p>${t.status === 'not-run' && t.total ? html`<div class="run-cta">${runControl}</div>` : ''}${progress}</div>
  ${failureCallout}
  ${scenarioTable(state, cap.id, { filter, group })}`;
}

// The page heading names the capability, as a selector when more than one
// capability has data: "Evidence for: Refund recommendation ▾".
export function capabilityHeading(state, cap, label, hrefFor) {
  const withData = state.capabilities.filter((c) => {
    const d = capData(state, c.id);
    return d.scenarios.length || d.evidence.length || c.id === cap.id;
  });
  if (withData.length < 2) return html`${label}: ${cap.name}`;
  return html`<label class="heading-picker"><span>${label}:</span>
    <select data-action="navigate" aria-label="${label}: capability">${withData.map((c) => html`<option value="${hrefFor(c.id)}" ${c.id === cap.id ? raw('selected') : ''}>${c.name}</option>`)}</select></label>`;
}

// One labelled filter bar: a dropdown per filter, "Clear filters" and a
// "Showing X of Y" count. Each option's value is the route it leads to.
export function filterBar({ selects, clearHref, active, showing, total, noun }) {
  return html`<div class="filter-bar filter-bar-select" role="group" aria-label="Filters">
    <span class="filter-bar-label">Filter</span>
    ${selects.map((f) => html`<label class="filter-select ${f.value !== 'all' ? 'is-set' : ''}"><span>${f.label}</span>
      <select data-action="navigate" ${f.disabled ? raw(`disabled title="${f.disabled}"`) : ''}>${f.options.map(([v, l]) => html`<option value="${f.hrefFor(v)}" ${v === f.value ? raw('selected') : ''}>${l}</option>`)}</select></label>`)}
    ${active ? html`<a class="filter-clear" href="${clearHref}">Clear filters</a>` : ''}
    <span class="filter-count">Showing ${showing} of ${total} ${noun}</span>
  </div>`;
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
  const filters = compact || !d.scenarios.length ? '' : filterBar({
    selects: [
      { label: 'Result', value: hasResults ? filter : 'all', options: FILTERS.map(([k, label]) => [k, hasResults && k !== 'all' ? `${label} (${countFor(k)})` : label]), hrefFor: (k) => `${base}&filter=${k}&group=${group}`, disabled: hasResults ? '' : 'Result filters apply after the suite has run.' },
      { label: 'Group', value: group, options: [['all', 'All groups'], ...seed.SCENARIO_GROUPS.map((g) => [g.id, g.name])], hrefFor: (g) => `${base}&filter=${filter}&group=${g}` },
    ],
    clearHref: base,
    active: group !== 'all' || (hasResults && filter !== 'all'),
    showing: rows.length,
    total: d.scenarios.length,
    noun: 'scenarios',
  });

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

  const item = (s) => {
    const done = hasResults && completed.has(s.id);
    const pendingRun = t.status === 'running' && !done;
    const showResult = done || (compact && !hasResults);
    const cls = ['scenario', showResult ? (s.pass ? 'is-pass' : 'is-fail') : 'is-pending', s.severity === 'High' ? 'is-high' : ''].join(' ');
    return html`<details class="${cls}" ${showResult && !s.pass ? raw('open') : ''}>
      <summary>
        <span class="scenario-id">${s.id}</span>
        <span class="scenario-name"><strong>${s.name}</strong><span class="muted small"> · ${groupName(s.group)}</span>${s.source === 'ai' ? html` <span class="badge badge-insufficient">Suggested by AI</span>` : ''}</span>
        <span class="scenario-status">
          ${showResult ? badge(s.pass ? 'pass' : 'fail') : pendingRun ? html`<span class="badge badge-neutral">Running</span>` : html`<span class="badge badge-neutral">Not run</span>`}
          ${showResult && s.severity !== 'None' ? html`<span class="badge badge-${s.severity === 'High' ? 'fail' : 'watch'}">${s.severity} severity</span>` : ''}
          ${showResult && s.escalated ? html`<span class="badge badge-neutral">Escalated</span>` : ''}
          ${showResult && s.simulated ? html`<span class="badge badge-neutral" title="Seeded, deterministic result; no model was called">Simulated</span>` : ''}
        </span>
      </summary>
      <div class="scenario-body">
        <dl class="kv kv-stack">
          <div><dt>Scenario</dt><dd>${s.situation}</dd></div>
          <div><dt>Expected behavior</dt><dd>${s.expected}</dd></div>
          ${showResult ? html`
            <div><dt>AI decision</dt><dd>${s.aiDecision}${s.simulated ? html` <span class="muted small">(simulated)</span>` : ''}</dd></div>
            <div><dt>Outcome</dt><dd>${s.outcome}${s.failureType ? html` <span class="muted">(${s.failureType})</span>` : ''}</dd></div>
            <div><dt>Explanation</dt><dd>${s.explanation}</dd></div>
            <div><dt>Human reviewer</dt><dd>${s.reviewer}</dd></div>
            ${s.incident ? html`<div><dt>Incident</dt><dd><a href="#/evidence?capability=${capabilityId}&status=fail">${s.incident}</a> · linked from Evidence and the authority decision</dd></div>` : ''}`
            : html`<div><dt>AI decision</dt><dd class="muted">Run the suite to see the result.</dd></div>`}
        </dl>
      </div>
    </details>`;
  };

  const empty = html`<p class="empty">${d.scenarios.length ? 'No scenarios match this filter.' : 'No scenarios yet.'}</p>`;
  if (compact) return html`${filters}${rows.length ? html`<div class="scenario-list">${rows.map(item)}</div>` : empty}`;
  if (!rows.length) return html`${filters}${empty}`;

  // The full list is grouped. Before a run every group is collapsed with its
  // count; after a run, groups with failures come first and are open.
  const filtering = group !== 'all' || (hasResults && filter !== 'all');
  const groupIds = [...seed.SCENARIO_GROUPS.map((g) => g.id), ...new Set(d.scenarios.map((s) => s.group).filter((g) => !seed.SCENARIO_GROUPS.some((x) => x.id === g)))];
  let groups = groupIds.map((id) => {
    const all = d.scenarios.filter((s) => s.group === id);
    const run = all.filter((s) => completed.has(s.id));
    return { id, all, run, failed: run.filter((s) => !s.pass), shown: rows.filter((s) => s.group === id) };
  }).filter((x) => x.shown.length);
  if (hasResults) groups = [...groups.filter((x) => x.failed.length), ...groups.filter((x) => !x.failed.length)];

  const groupCount = (x) => {
    if (t.status === 'complete') return `${x.run.length - x.failed.length} of ${x.all.length} passed`;
    if (t.status === 'running') return `${x.run.length} of ${x.all.length} run`;
    return `${x.all.length} scenario${x.all.length === 1 ? '' : 's'}`;
  };
  const sections = groups.map((x) => html`<details class="scenario-group ${x.failed.length ? 'has-fail' : ''}" id="scenario-group-${x.id}" ${filtering || x.failed.length ? raw('open') : ''}>
    <summary>
      <span class="scenario-group-name">${groupName(x.id)}</span>
      <span class="scenario-group-count">${groupCount(x)}${filtering && x.shown.length !== x.all.length ? ` · ${x.shown.length} shown` : ''}</span>
      <span class="scenario-status">${x.failed.length ? html`<span class="badge badge-fail">${x.failed.length} failed</span>` : hasResults && t.status === 'complete' ? badge('pass') : !hasResults ? html`<span class="badge badge-neutral">Not run</span>` : ''}</span>
    </summary>
    <div class="scenario-list">${x.shown.map(item)}</div>
  </details>`);

  return html`${filters}<div class="scenario-groups">${sections}</div>`;
}
