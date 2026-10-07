import * as seed from '../data/seed.js';
import { html, badge, metricCard, section, notice, authorityBadge, capStatusBadge, fmtDate } from '../ui.js';
import { focusCapability, capData, readiness, authorityLabel, testSummary, current } from '../store.js';

function firstSentences(text, n) {
  const parts = text.match(/[^.!?]+[.!?]+(\s|$)/g) || [text];
  return parts.slice(0, n).join('').trim();
}

export function overviewView(state) {
  const cap = focusCapability(state);
  const d = capData(state, cap.id);
  const r = readiness(state, cap.id);
  const p = d.pilot;
  const tests = testSummary(state, cap.id);
  const decided = Boolean(d.decision.recordId);
  const breached = d.monitoring && d.monitoring.breached;

  const header = html`<div class="page-head">
    <div>
      <p class="eyebrow">${seed.workspace.name} · ${seed.workflow.name}</p>
      <h1>Where do we need to make a decision?</h1>
      <p class="lede">${cap.decisionRequired
        ? 'One capability in this workflow is waiting on an authority decision. The evidence, the open gap and the disagreement are below.'
        : breached
          ? 'One capability was restricted automatically and needs a human review before its authority can expand again.'
          : 'No capability is waiting on an authority decision. The most recent change and its monitoring are below.'}</p>
    </div>
  </div>`;

  const alerts = state.alerts.map((a) => notice('fail', a.title, a.body, { link: a.link, linkText: 'Open monitoring' }));

  let pilotCard;
  if (cap.decisionRequired) {
    pilotCard = html`<div class="card card-hero">
      <div class="hero-grid">
        <div>
          <p class="eyebrow">Current pilot</p>
          <h2 class="hero-title"><a href="#/capabilities/${cap.id}">${cap.name}</a></h2>
          <p class="muted">${cap.summary}</p>
          <div class="hero-facts">
            <div><span class="fact-label">Status</span>${capStatusBadge(cap.status)} ${p ? html`<span class="muted">${cap.pilotLabel || ''}${cap.pilotLabel ? ', ' : ''}${p.cases} cases since ${fmtDate(p.started)}</span>` : ''}</div>
            <div><span class="fact-label">Current authority</span>${authorityBadge(cap.authority)}</div>
            <div><span class="fact-label">Proposed authority</span>${authorityBadge(cap.proposed)}</div>
          </div>
        </div>
        <div class="hero-side">
          <p class="eyebrow">Decision readiness</p>
          <p class="readiness-big">${r.met} of ${r.total}<span> evidence requirements satisfied</span></p>
          ${r.unmet.map((u) => html`<div class="readiness-gap">${badge('insufficient')}<p>${u.gap || `${u.text}: currently ${u.current}.`}</p></div>`)}
          <a class="btn btn-primary" href="#/capabilities/${cap.id}/decision">Open authority decision</a>
        </div>
      </div>
    </div>`;
  } else if (breached) {
    const rec = state.decisionRecords.find((x) => x.id === d.monitoring.breachRecordId);
    pilotCard = html`<div class="card card-hero card-hero-fail">
      <div class="hero-grid">
        <div>
          <p class="eyebrow">Review required</p>
          <h2 class="hero-title"><a href="#/capabilities/${cap.id}">${cap.name}</a></h2>
          <p class="muted">Authority was reduced automatically by a monitoring rule. A human review is required before it can expand again.</p>
          <div class="hero-facts">
            <div><span class="fact-label">Status</span>${capStatusBadge(cap.status)}</div>
            <div><span class="fact-label">Current authority</span>${authorityBadge(cap.authority)}</div>
            <div><span class="fact-label">Before restriction</span>${authorityBadge(rec.previous)}</div>
          </div>
        </div>
        <div class="hero-side">
          <p class="eyebrow">What happened</p>
          <p>${d.monitoring.severeErrorsInWindow} severe errors in the rolling ${d.monitoring.rollingWindow}-case window, against a limit of ${d.monitoring.thresholdPct}%.</p>
          <a class="btn" href="#/decisions/${rec.id}">Open restriction record</a>
        </div>
      </div>
    </div>`;
  } else {
    const rec = state.decisionRecords.find((x) => x.id === (d.decision.recordId || cap.lastDecisionId));
    const m = d.monitoring;
    pilotCard = html`<div class="card card-hero">
      <div class="hero-grid">
        <div>
          <p class="eyebrow">${m ? 'Monitoring' : 'Decision recorded'}</p>
          <h2 class="hero-title"><a href="#/capabilities/${cap.id}">${cap.name}</a></h2>
          <p class="muted">${rec ? rec.scope : cap.summary}</p>
          <div class="hero-facts">
            <div><span class="fact-label">Status</span>${capStatusBadge(cap.status)}</div>
            <div><span class="fact-label">Current authority</span>${authorityBadge(cap.authority)}</div>
            ${rec ? html`<div><span class="fact-label">Authorized by</span><span>${(seed.people[rec.authorizedBy] || { name: 'Software rule' }).name}, ${fmtDate(rec.date)}</span></div>` : ''}
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
            <a class="btn" href="#/capabilities/${cap.id}?tab=monitoring">Open monitoring</a>`
            : rec ? html`<p class="eyebrow">Record</p><a class="btn" href="#/decisions/${rec.id}">Open decision record</a>` : ''}
        </div>
      </div>
    </div>`;
  }

  const criteria = current(state, cap.id, 'criteria');
  const criterion = (id) => criteria.find((c) => c.id === id);
  const evidenceCards = p ? html`<div class="metric-grid">
    ${metricCard({ label: 'Quality', value: `${p.accuracy}%`, target: '≥ 92%', status: criterion('quality')?.status || 'neutral', href: `#/capabilities/${cap.id}?tab=criteria` })}
    ${metricCard({ label: 'Severe errors', value: `${p.severeErrorRate}%`, target: '< 2%', status: criterion('severe-errors')?.status || 'neutral', href: `#/capabilities/${cap.id}?tab=criteria` })}
    ${metricCard({ label: 'Human overrides', value: `${p.overrideRate}%`, target: '< 20%', status: p.overrideRate < 20 ? 'pass' : 'fail', href: `#/capabilities/${cap.id}?tab=evidence` })}
    ${metricCard({ label: 'Resolution time', value: `${p.resolutionChange}%`, target: '−50%', status: criterion('speed')?.status || 'neutral', href: `#/capabilities/${cap.id}?tab=criteria` })}
    ${metricCard({ label: 'AI cost / case', value: `$${p.costPerCase.toFixed(2)}`, target: '< $0.20', status: criterion('cost')?.status || 'neutral', href: `#/capabilities/${cap.id}?tab=criteria` })}
    ${metricCard({ label: 'Adoption', value: `${p.acceptance}%`, target: '≥ 70%', status: criterion('adoption')?.status || 'neutral', note: 'Acceptance, not correctness', href: `#/capabilities/${cap.id}?tab=criteria` })}
  </div>` : html`<p class="empty">No pilot evidence has been collected for ${cap.name}.</p>`;

  // Exceptions the aggregate numbers do not show: weak segments, disagreement, incidents.
  const attention = [];
  (p ? p.segments : []).filter((s) => s.status === 'insufficient').forEach((s) => {
    attention.push(html`<a class="card card-link attention" href="#/capabilities/${cap.id}?tab=evidence">
      <div class="attention-head"><strong>${s.name.replace(/ \(.*\)$/, '')}</strong>${badge('insufficient')}</div>
      <p>Only ${s.cases} pilot cases have been observed, at ${s.accuracy}% accuracy and a ${s.overrideRate}% override rate. ${s.severeErrors ? `${s.severeErrors} of the pilot's ${p.severeErrors} severe errors were in this segment.` : ''}</p>
    </a>`);
  });
  if (d.stakeholderSummary && d.stakeholderSummary.disagreement) {
    attention.push(html`<a class="card card-link attention" href="#/capabilities/${cap.id}?tab=stakeholders">
      <div class="attention-head"><strong>Stakeholder disagreement</strong>${badge('watch', 'Unresolved')}</div>
      <p>${d.stakeholderSummary.disagreement}</p>
    </a>`);
  }
  d.evidence.filter((e) => e.source === 'Incident' && e.status === 'fail').slice(0, 1).forEach((e) => {
    attention.push(html`<a class="card card-link attention" href="${e.link}">
      <div class="attention-head"><strong>${e.metric}</strong>${badge('fail', e.value.includes('mitigated') ? 'Mitigated' : 'Fail')}</div>
      <p>${firstSentences(e.detail, 2)}${tests.status === 'complete' && d.scenarios.some((sc) => sc.incident && e.metric.includes(sc.incident)) ? ' Reproduced on today’s run.' : ''}</p>
    </a>`);
  });

  const rec = d.recommendation;
  const recommendation = rec ? html`<div class="card recommendation">
    <p class="eyebrow">System recommendation</p>
    <p class="rec-summary">${rec.overviewSummary || rec.summary}</p>
    <p class="muted small">The system can recommend an authority change. It cannot authorize one. ${decided ? html`A decision was recorded on ${fmtDate(state.decisionRecords.find((x) => x.id === d.decision.recordId).date)}.` : html`<a href="#/capabilities/${cap.id}/decision">Open the decision workspace</a> to decide.`}</p>
  </div>` : '';

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
    ${section('Current evidence', evidenceCards, { subtitle: p ? `Each value is measured against a criterion set before the pilot started on ${fmtDate(p.started)}.` : undefined })}
    ${attention.length ? section('Attention needed', html`<div class="attention-grid">${attention}</div>`, { subtitle: 'Exceptions the aggregate numbers do not show.' }) : ''}
    ${recommendation ? section('Recommendation', recommendation) : ''}
    ${section('What is the AI allowed to do here?', map, { subtitle: 'Authority is held per capability, not per workflow.', actions: html`<a class="btn btn-ghost" href="#/capabilities">Authority map</a>` })}`;
}
