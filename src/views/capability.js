import * as seed from '../data/seed.js';
import { html, raw, section, badge, capStatusBadge, authorityBadge, levelScale, kv, fmtDate, fmtDateYear, person, notice, empty } from '../ui.js';
import { getCapability, capData, readiness, authorityLabel, testSummary } from '../store.js';
import { scenarioTable } from './tests.js';

const TABS = [
  ['contract', 'Contract'],
  ['criteria', 'Success criteria'],
  ['testing', 'Testing'],
  ['evidence', 'Evidence'],
  ['stakeholders', 'Stakeholders'],
  ['decisions', 'Decision history'],
  ['monitoring', 'Monitoring'],
];

// Tabs appear when the capability has something to show in them. Empty
// states for new capabilities arrive with the setup flow (#4).
function tabAvailable(key, d) {
  switch (key) {
    case 'criteria': return d.criteria.length > 0 || d.requirements.length > 0;
    case 'testing': return d.scenarios.length > 0;
    case 'evidence': return Boolean(d.pilot) || d.evidence.length > 0;
    case 'stakeholders': return d.stakeholders.length > 0;
    case 'monitoring': return Boolean(d.monitoring) || Boolean(d.monitoringRule);
    default: return true;
  }
}

export function capabilityView(state, id, query) {
  const cap = getCapability(state, id);
  if (!cap) return html`<div class="page-head"><h1>Capability not found</h1></div>`;
  const d = capData(state, id);
  const requested = query.get('tab') || 'contract';
  const tab = tabAvailable(requested, d) ? requested : 'contract';
  const r = readiness(state, id);
  const owner = person(cap.owner);

  const summary = html`<div class="card cap-summary">
    <div class="cap-summary-grid">
      ${kv([
        ['Status', html`${capStatusBadge(cap.status)}${cap.pilotLabel ? html` <span class="muted">${cap.pilotLabel}</span>` : ''}`],
        ['Current authority', authorityBadge(cap.authority)],
        ['Proposed authority', cap.proposed ? authorityBadge(cap.proposed) : html`<span class="muted">None proposed</span>`],
        ['Risk', html`${cap.risk.impact} impact · ${cap.risk.exposure} · ${cap.risk.reversibility}`],
        ['Owner', html`${owner.name}, ${owner.role}`],
        ['Last evaluated', fmtDateYear(cap.lastEvaluated)],
        ['Evidence readiness', r.total
          ? html`${r.met} of ${r.total} requirements met${cap.decisionRequired ? html` · <a href="#/capabilities/${cap.id}/decision">Open decision</a>` : ''}`
          : html`<span class="muted">${cap.evidenceNote || 'No evidence requirements defined.'}</span>`],
      ])}
    </div>
    ${levelScale(cap.authority, cap.decisionRequired ? cap.proposed : null)}
  </div>`;

  const tabs = html`<nav class="tabs" aria-label="Capability sections">${TABS
    .filter(([k]) => tabAvailable(k, d))
    .map(([k, label]) => html`<a class="tab ${k === tab ? 'is-active' : ''}" href="#/capabilities/${cap.id}?tab=${k}" ${k === tab ? raw('aria-current="page"') : ''}>${label}</a>`)}</nav>`;

  let body;
  switch (tab) {
    case 'criteria': body = criteriaTab(state, cap, d); break;
    case 'testing': body = testingTab(state, cap); break;
    case 'evidence': body = evidenceTab(state, cap, d); break;
    case 'stakeholders': body = stakeholdersTab(d); break;
    case 'decisions': body = decisionsTab(state, cap); break;
    case 'monitoring': body = monitoringTab(cap, d); break;
    default: body = contractTab(cap);
  }

  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/capabilities">Capabilities</a> · ${seed.workflow.name}</p>
      <h1>${cap.name}</h1>
      <p class="lede">${cap.summary}${cap.risk.note ? html` ${cap.risk.note}` : ''}</p>
    </div>
  </div>
  ${summary}
  ${tabs}
  <div class="tab-panel">${body}</div>`;
}

function contractTab(cap) {
  const c = cap.contract;
  const list = (items) => html`<ul class="contract-list">${items.map((i) => html`<li>${i}</li>`)}</ul>`;
  return html`
    <p class="muted">The delegation contract states what the AI may do on its own, what needs a person, and what it must never do. The contract is enforced by software, not by the model's judgment.</p>
    <div class="contract-grid">
      <div class="card contract-block contract-may"><h3>AI may</h3>${list(c.may)}</div>
      <div class="card contract-block contract-ask"><h3>AI must ask / require approval</h3>${list(c.mustAsk)}</div>
      <div class="card contract-block contract-never"><h3>AI must never</h3>${list(c.mustNever)}</div>
      <div class="card contract-block contract-escalate"><h3>Escalation conditions</h3>${list(c.escalation)}</div>
    </div>
    <div class="card contract-block contract-auto">
      <h3>Automatic restriction conditions</h3>
      ${list(c.autoRestriction)}
      <p class="muted small">Humans authorize expanded authority. Software may automatically reduce authority when one of these predefined conditions is triggered.</p>
    </div>
    ${section('Risk profile', kv([
      ['Impact', cap.risk.impact],
      ['Reversibility', cap.risk.reversibility],
      ['Exposure', cap.risk.exposure],
      ['Failure types watched', cap.risk.failureTypes.join(', ')],
    ]), { subtitle: 'The risk profile sets how much evidence an authority increase needs.' })}`;
}

function criteriaTab(state, cap, d) {
  const rows = d.criteria.map((c) => html`<tr>
    <td><strong>${c.name}</strong></td>
    <td>${c.target}</td>
    <td>${c.current}</td>
    <td>${badge(c.status)}</td>
    <td class="muted">${c.note}</td>
  </tr>`);
  const defining = state.decisionRecords.find((x) => x.capabilityId === cap.id && x.number === 2);
  return html`
    <p class="muted">Defined before the pilot started${defining ? html`, as part of authority change <a href="#/decisions/${defining.id}">${defining.id}</a>` : ''}. These are the thresholds the decision is measured against, not a score.</p>
    ${rows.length ? html`<div class="card table-card"><table class="table table-criteria">
      <thead><tr><th>Criterion</th><th>Target</th><th>Current</th><th>Status</th><th>Note</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>` : empty('No success criteria defined.')}
    ${d.requirements.length ? section(`Evidence requirements for ${proposedChangeLabel(cap)}`, requirementsList(state, cap.id), { subtitle: 'A checklist, not a readiness score.' }) : ''}`;
}

export function proposedChangeLabel(cap) {
  return cap.proposed ? `${authorityLabel(cap.authority, { short: true })} → ${authorityLabel(cap.proposed, { short: true })}` : 'the next authority change';
}

export function requirementsList(state, capabilityId) {
  const r = readiness(state, capabilityId);
  const reqs = capData(state, capabilityId).requirements;
  if (!reqs.length) return empty('No evidence requirements defined.');
  return html`<div class="card">
    <ul class="req-list">${reqs.map((q) => html`<li class="${q.met ? 'is-met' : 'is-unmet'}">
      <span class="req-mark" aria-hidden="true">${q.met ? '✓' : '⚠'}</span>
      <span class="req-text"><strong>${q.text}</strong><span class="muted"> · ${q.met ? 'Met' : 'Not met'}: ${q.current}</span>${q.gap ? html`<p class="req-gap">${q.gap}</p>` : ''}</span>
    </li>`)}</ul>
    <p class="muted small"><strong>${r.met} of ${r.total}</strong> requirements met.</p>
  </div>`;
}

function testingTab(state, cap) {
  const t = testSummary(state, cap.id);
  return html`
    <p class="muted">${t.total} scenarios. ${t.status === 'complete'
      ? html`Run today: ${t.passed} of ${t.total} passed, ${t.highSeverity} high-severity failure${t.highSeverity === 1 ? '' : 's'}.`
      : t.lastRun ? html`Last run ${fmtDate(t.lastRun)}: ${t.recorded.passed} of ${t.total} passed, ${t.recorded.highSeverity} high-severity failure${t.recorded.highSeverity === 1 ? '' : 's'}.` : 'Not yet run.'} <a href="#/tests?capability=${cap.id}">Open the testing ground</a> to run the suite and filter results.</p>
    ${scenarioTable(state, cap.id, { filter: 'failed', compact: true })}`;
}

function evidenceTab(state, cap, d) {
  const p = d.pilot;
  if (!p) return html`${empty('No pilot has been run for this capability.')}${d.evidence.length ? html`<p class="muted small">Other evidence is in the <a href="#/evidence?capability=${cap.id}">evidence repository</a>.</p>` : ''}`;
  const rows = p.segments.map((s) => html`<tr class="${s.status === 'insufficient' ? 'row-insufficient' : ''}">
    <td><strong>${s.name}</strong></td>
    <td class="num">${s.cases}</td>
    <td class="num">${s.accuracy}%</td>
    <td class="num">${s.overrideRate}%</td>
    <td class="num">${s.severeErrors}</td>
    <td>${badge(s.status)}</td>
  </tr>`);
  const weak = p.segments.filter((s) => s.status === 'insufficient');
  const unmetReq = readiness(state, cap.id).unmet[0];
  return html`
    <div class="pilot-head">
      <div><p class="eyebrow">Limited pilot · ${fmtDate(p.started)} to ${p.ended ? fmtDate(p.ended) : 'Oct 6'}</p><p class="readiness-big">${p.cases}<span> real cases observed, every one reviewed by an agent</span></p></div>
      <div class="pilot-stats">
        <div><span class="fact-label">Overall accuracy</span><strong>${p.accuracy}%</strong></div>
        <div><span class="fact-label">Overridden</span><strong>${p.overrides} (${p.overrideRate}%)</strong></div>
        <div><span class="fact-label">Edited</span><strong>${p.edits} (${p.editRate}%)</strong></div>
        <div><span class="fact-label">Severe errors</span><strong>${p.severeErrors} (${p.severeErrorRate}%)</strong></div>
      </div>
    </div>
    <div class="card table-card"><table class="table">
      <thead><tr><th>Segment</th><th class="num">Cases</th><th class="num">Accuracy</th><th class="num">Override rate</th><th class="num">Severe errors</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${weak.map((s) => notice('insufficient', 'Overall performance looks good. One segment does not.', `${s.name} have ${s.cases} cases at ${s.accuracy}% accuracy and a ${s.overrideRate}% override rate. That is too few cases to conclude anything, and the aggregate ${p.accuracy}% hides it.${unmetReq ? ` The evidence requirement for this segment is ${unmetReq.text.toLowerCase().replace(/^minimum /, '')}.` : ''}`))}
    ${p.severeErrorList && p.severeErrorList.length ? section('Severe errors in the pilot', html`<div class="card"><ul class="plain-list">${p.severeErrorList.map((e) => html`<li><span class="muted">${fmtDate(e.date)} · ${p.segments.find((s) => s.id === e.segment).name}</span><br>${e.text}</li>`)}</ul><p class="muted small">All ${p.severeErrors} were caught in review before any action. That is what Draft authority is for; it is also why the override rate matters more than the raw error count.</p></div>`) : ''}
    ${d.requirements.length ? section('Evidence requirements', requirementsList(state, cap.id)) : ''}
    <p class="muted small">All evidence for this capability is in the <a href="#/evidence?capability=${cap.id}">evidence repository</a>.</p>`;
}

function stakeholdersTab(d) {
  const tone = { 'expand': 'watch', 'expand-limits': 'pass', 'hold': 'insufficient' };
  const cards = d.stakeholders.map((s) => {
    const who = person(s.person);
    return html`<div class="card stakeholder">
      <div class="stakeholder-head"><div><strong>${s.team}</strong><div class="muted small">${who.name}, ${who.role}</div></div>${badge(tone[s.stance] || 'neutral', s.position)}</div>
      <blockquote>${s.quote}</blockquote>
    </div>`;
  });
  const sum = d.stakeholderSummary;
  return html`
    <p class="muted">Positions recorded ${d.stakeholders[0] && d.stakeholders[0].date ? fmtDate(d.stakeholders[0].date) : 'Oct 6'}. They are kept as positions, not averaged into a score.</p>
    <div class="stakeholder-grid">${cards}</div>
    ${sum ? html`<div class="two-col">
      <div class="card"><p class="eyebrow">Consensus</p><p>${sum.consensus}</p></div>
      <div class="card card-watch"><p class="eyebrow">Unresolved disagreement</p><p>${sum.disagreement}</p></div>
    </div>` : ''}`;
}

function decisionsTab(state, cap) {
  const records = state.decisionRecords.filter((x) => x.capabilityId === cap.id).slice().reverse();
  if (!records.length) return empty('No authority decisions have been recorded for this capability.');
  return html`<div class="card table-card"><table class="table">
    <thead><tr><th>Record</th><th>Date</th><th>Change</th><th>Decision</th><th>Authorized by</th></tr></thead>
    <tbody>${records.map((x) => html`<tr>
      <td><a href="#/decisions/${x.id}">Authority change #${String(x.number).padStart(2, '0')}</a></td>
      <td>${fmtDate(x.date)}</td>
      <td>${authorityLabel(x.previous, { short: true })} → ${authorityLabel(x.next, { short: true })}</td>
      <td>${optionLabel(x.option)}</td>
      <td>${person(x.authorizedBy).name}</td>
    </tr>`)}</tbody>
  </table></div>`;
}

export function optionLabel(option) {
  if (option === 'auto-restrict') return 'Automatic restriction';
  const o = seed.DECISION_OPTIONS.find((x) => x.id === option);
  return o ? o.name : option;
}

function monitoringTab(cap, d) {
  const m = d.monitoring;
  if (!m) {
    return html`${notice('neutral', 'Monitoring is not active.', `${cap.name} is at ${authorityLabel(cap.authority)}. A monitoring period starts when authority is expanded. The automatic restriction rule below applies from that point.`)}
      ${d.monitoringRule ? html`<div class="card"><p class="eyebrow">Automatic restriction rule</p><p>${d.monitoringRule.rule}</p></div>` : ''}`;
  }
  const pct = Math.round((m.severeErrorsInWindow / m.rollingWindow) * 1000) / 10;
  const over = pct > m.thresholdPct;
  return html`
    ${m.breached
      ? notice('fail', 'Authority automatically restricted', `Severe error rate reached ${pct}% across the rolling ${m.rollingWindow}-case window, above the ${m.thresholdPct}% limit. ${cap.name} returned to ${authorityLabel(cap.authority)}. A human review is required before authority can expand again.`, { link: `#/decisions/${m.breachRecordId}`, linkText: 'Restriction record' })
      : notice('pass', `Expanded ${m.windowDays} days ago (simulated)`, `Authority change ${m.recordId} is in its monitoring period. The restriction rule below is enforced by software; nobody has to notice a problem for it to fire.`, { link: `#/decisions/${m.recordId}`, linkText: 'Decision record' })}
    <div class="metric-grid metric-grid-4">
      <div class="metric card"><div class="metric-top"><span class="metric-label">Autonomous actions</span></div><div class="metric-value">${m.autonomousActions}</div></div>
      <div class="metric card"><div class="metric-top"><span class="metric-label">Escalated to a human</span></div><div class="metric-value">${m.escalated}</div></div>
      <div class="metric card"><div class="metric-top"><span class="metric-label">Human reversals</span></div><div class="metric-value">${m.reversals}</div></div>
      <div class="metric card"><div class="metric-top"><span class="metric-label">Incidents</span>${m.incidents ? badge('fail') : badge('pass')}</div><div class="metric-value">${m.incidents}</div></div>
    </div>
    <div class="card rule-card ${over ? 'is-breached' : ''}">
      <div class="rule-head"><p class="eyebrow">Automatic restriction rule</p>${over ? badge('fail', 'Breached') : badge('pass', 'Within limit')}</div>
      <p>${m.rule}</p>
      <div class="rule-meter" role="img" aria-label="${m.severeErrorsInWindow} severe errors in the last ${m.rollingWindow} cases, ${pct}% against a ${m.thresholdPct}% limit">
        <div class="rule-meter-bar"><span style="width:${Math.min(100, pct * 10)}%"></span><i style="left:${m.thresholdPct * 10}%"></i></div>
        <div class="rule-meter-label">${m.severeErrorsInWindow} of the last ${m.rollingWindow} autonomous cases were severe errors (${pct}%). Limit ${m.thresholdPct}%.</div>
      </div>
      ${m.breached
        ? html`<ul class="plain-list"><li class="muted small">Errors in the window:</li>${m.errors.map((e) => html`<li>${e}</li>`)}</ul>
          <p class="muted small">What happened when the rule fired: the metric crossed the threshold, the capability changed from autonomous to approval-required, a system event and a restriction record were created, the Overview shows an alert, and the Activity history records why.</p>`
        : html`<p class="muted small">Demo control. This injects severe errors into the rolling window to show what the rule does.</p>
          <button class="btn btn-danger" data-action="simulate-breach" data-capability="${cap.id}">Simulate threshold breach</button>`}
    </div>`;
}
