import * as seed from '../data/seed.js';
import { html, badge, metricCard, section, notice, authorityBadge, capStatusBadge, fmtDate } from '../ui.js';
import { getCapability, readiness, authorityLabel, testSummary } from '../store.js';

export function overviewView(state) {
  const cap = getCapability(state, 'refund-recommendation');
  const r = readiness(state);
  const p = seed.pilot;
  const tests = testSummary(state);
  const decided = Boolean(state.decision.recordId);
  const breached = state.monitoring && state.monitoring.breached;

  const header = html`<div class="page-head">
    <div>
      <p class="eyebrow">${seed.workspace.name} · ${seed.workflow.name}</p>
      <h1>Where do we need to make a decision?</h1>
      <p class="lede">One capability in this workflow is waiting on an authority decision. The evidence, the open gap and the disagreement are below.</p>
    </div>
  </div>`;

  const alerts = state.alerts.map((a) => notice('fail', a.title, a.body, { link: a.link, linkText: 'Open monitoring' }));

  // Current pilot / decision card
  let pilotCard;
  if (!decided) {
    pilotCard = html`<div class="card card-hero">
      <div class="hero-grid">
        <div>
          <p class="eyebrow">Current pilot</p>
          <h2 class="hero-title"><a href="#/capabilities/refund-recommendation">${cap.name}</a></h2>
          <p class="muted">${cap.summary}</p>
          <div class="hero-facts">
            <div><span class="fact-label">Status</span>${capStatusBadge('pilot')} <span class="muted">${cap.pilotLabel}, ${p.cases} cases since ${fmtDate(p.started)}</span></div>
            <div><span class="fact-label">Current authority</span>${authorityBadge(cap.authority)}</div>
            <div><span class="fact-label">Proposed authority</span>${authorityBadge(cap.proposed)}</div>
          </div>
        </div>
        <div class="hero-side">
          <p class="eyebrow">Decision readiness</p>
          <p class="readiness-big">${r.met} of ${r.total}<span> evidence requirements satisfied</span></p>
          ${r.unmet.map((u) => html`<div class="readiness-gap">${badge('insufficient')}<p>${u.gap}</p></div>`)}
          <a class="btn btn-primary" href="#/decisions/new">Open authority decision</a>
        </div>
      </div>
    </div>`;
  } else if (breached) {
    pilotCard = html`<div class="card card-hero card-hero-fail">
      <div class="hero-grid">
        <div>
          <p class="eyebrow">Review required</p>
          <h2 class="hero-title"><a href="#/capabilities/refund-recommendation">${cap.name}</a></h2>
          <p class="muted">Authority was reduced automatically by a monitoring rule. A human review is required before it can expand again.</p>
          <div class="hero-facts">
            <div><span class="fact-label">Status</span>${capStatusBadge(cap.status)}</div>
            <div><span class="fact-label">Current authority</span>${authorityBadge(cap.authority)}</div>
            <div><span class="fact-label">Before restriction</span>${authorityBadge(state.decisionRecords.find((d) => d.id === state.monitoring.breachRecordId).previous)}</div>
          </div>
        </div>
        <div class="hero-side">
          <p class="eyebrow">What happened</p>
          <p>${state.monitoring.severeErrorsInWindow} severe errors in the rolling ${state.monitoring.rollingWindow}-case window, against a limit of ${state.monitoring.thresholdPct}%.</p>
          <a class="btn" href="#/decisions/${state.monitoring.breachRecordId}">Open restriction record</a>
        </div>
      </div>
    </div>`;
  } else {
    const rec = state.decisionRecords.find((d) => d.id === state.decision.recordId);
    const m = state.monitoring;
    pilotCard = html`<div class="card card-hero">
      <div class="hero-grid">
        <div>
          <p class="eyebrow">${m ? 'Monitoring' : 'Decision recorded'}</p>
          <h2 class="hero-title"><a href="#/capabilities/refund-recommendation">${cap.name}</a></h2>
          <p class="muted">${rec.scope}</p>
          <div class="hero-facts">
            <div><span class="fact-label">Status</span>${capStatusBadge(cap.status)}</div>
            <div><span class="fact-label">Current authority</span>${authorityBadge(cap.authority)}</div>
            <div><span class="fact-label">Authorized by</span><span>${seed.people[rec.authorizedBy].name}, ${fmtDate(rec.date)}</span></div>
          </div>
        </div>
        <div class="hero-side">
          ${m ? html`
            <p class="eyebrow">Since expansion (simulated day ${m.windowDays})</p>
            <ul class="plain-list">
              <li>${m.autonomousActions} autonomous actions</li>
              <li>${m.escalated} escalated to a human</li>
              <li>${m.reversals} human reversals</li>
              <li>${m.incidents} incidents</li>
            </ul>
            <a class="btn" href="#/capabilities/refund-recommendation?tab=monitoring">Open monitoring</a>`
            : html`<p class="eyebrow">Record</p><a class="btn" href="#/decisions/${rec.id}">Open decision record</a>`}
        </div>
      </div>
    </div>`;
  }

  const evidenceCards = html`<div class="metric-grid">
    ${metricCard({ label: 'Quality', value: `${p.accuracy}%`, target: '≥ 92%', status: 'pass', href: '#/capabilities/refund-recommendation?tab=criteria' })}
    ${metricCard({ label: 'Severe errors', value: `${p.severeErrorRate}%`, target: '< 2%', status: 'pass', href: '#/capabilities/refund-recommendation?tab=criteria' })}
    ${metricCard({ label: 'Human overrides', value: `${p.overrideRate}%`, target: '< 20%', status: 'pass', href: '#/capabilities/refund-recommendation?tab=evidence' })}
    ${metricCard({ label: 'Resolution time', value: `${p.resolutionChange}%`, target: '−50%', status: 'watch', href: '#/capabilities/refund-recommendation?tab=criteria' })}
    ${metricCard({ label: 'AI cost / case', value: `$${p.costPerCase.toFixed(2)}`, target: '< $0.20', status: 'pass', href: '#/capabilities/refund-recommendation?tab=criteria' })}
    ${metricCard({ label: 'Adoption', value: `${p.acceptance}%`, target: '≥ 70%', status: 'pass', note: 'Acceptance, not correctness', href: '#/capabilities/refund-recommendation?tab=criteria' })}
  </div>`;

  const attention = html`<div class="attention-grid">
    <a class="card card-link attention" href="#/capabilities/refund-recommendation?tab=evidence">
      <div class="attention-head"><strong>High-value refunds</strong>${badge('insufficient')}</div>
      <p>Only 18 pilot cases over $100 have been observed, at 83% accuracy. The requirement is 40. Two of the pilot's three severe errors were in this segment.</p>
    </a>
    <a class="card card-link attention" href="#/capabilities/refund-recommendation?tab=stakeholders">
      <div class="attention-head"><strong>Stakeholder disagreement</strong>${badge('watch', 'Unresolved')}</div>
      <p>Support Operations recommends expanding the whole capability. Risk recommends keeping anything above $50 gated.</p>
    </a>
    <a class="card card-link attention" href="#/tests?filter=failed">
      <div class="attention-head"><strong>High-severity test failure</strong>${badge('fail', 'Mitigated')}</div>
      <p>Scenario H-04: a $420 request on a fraud-flagged account was recommended for refund. A software gate now blocks automatic action on fraud-flagged accounts.${tests.status === 'complete' ? ' Reproduced on today’s run.' : ''}</p>
    </a>
  </div>`;

  const recommendation = html`<div class="card recommendation">
    <p class="eyebrow">System recommendation</p>
    <p class="rec-summary">Evidence supports limited automatic refund approval for standard cases under $50. High-value refunds do not yet have enough evidence for expanded authority.</p>
    <p class="muted small">The system can recommend an authority change. It cannot authorize one. ${decided ? html`A decision was recorded on ${fmtDate(state.decisionRecords.find((d) => d.id === state.decision.recordId).date)}.` : html`<a href="#/decisions/new">Open the decision workspace</a> to decide.`}</p>
  </div>`;

  const map = html`<table class="table">
    <thead><tr><th>Capability</th><th>Authority</th><th>Status</th></tr></thead>
    <tbody>${state.capabilities.map((c) => html`<tr>
      <td><a href="#/capabilities/${c.id}">${c.name}</a></td>
      <td>${authorityLabel(c.authority)}</td>
      <td>${capStatusBadge(c.status)}</td>
    </tr>`)}</tbody>
  </table>`;

  return html`${header}
    ${alerts}
    ${pilotCard}
    ${section('Current evidence', evidenceCards, { subtitle: 'Each value is measured against a criterion set before the pilot started on Oct 1.' })}
    ${section('Attention needed', attention, { subtitle: 'Exceptions the aggregate numbers do not show.' })}
    ${section('Recommendation', recommendation)}
    ${section('What is the AI allowed to do here?', map, { subtitle: 'Authority is held per capability, not per workflow.', actions: html`<a class="btn btn-ghost" href="#/capabilities">Authority map</a>` })}`;
}
