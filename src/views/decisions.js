import * as seed from '../data/seed.js';
import { html, raw, badge, section, notice, kv, authorityBadge, levelScale, fmtDate, fmtDateYear, person, capStatusBadge } from '../ui.js';
import { getCapability, readiness, authorityLabel, canAuthorize, conditionsPreview, scopeText, nextAuthority } from '../store.js';
import { requirementsList, optionLabel } from './capability.js';

export function decisionsListView(state) {
  const cap = getCapability(state, 'refund-recommendation');
  const records = state.decisionRecords.slice().reverse();
  const pending = cap.decisionRequired;
  return html`<div class="page-head">
    <div>
      <p class="eyebrow">${seed.workspace.name} · ${seed.workflow.name}</p>
      <h1>Decisions</h1>
      <p class="lede">Every authority change, who authorized it, and the evidence it rested on at the time. Records are not edited after they are written.</p>
    </div>
    ${pending ? html`<div class="page-actions"><a class="btn btn-primary" href="#/decisions/new">Open authority decision</a></div>` : ''}
  </div>
  ${pending ? notice('decision', 'Decision required: Refund recommendation', `Proposed change from ${authorityLabel(cap.authority)} to ${authorityLabel(cap.proposed)}. ${readiness(state).met} of ${readiness(state).total} evidence requirements met.`, { link: '#/decisions/new', linkText: 'Open' }) : ''}
  ${state.reviewRequired ? notice('fail', 'Review required before any expansion', 'Refund recommendation was restricted automatically. A post-incident review must be recorded before authority can expand again.', { link: `#/decisions/${state.monitoring.breachRecordId}`, linkText: 'Restriction record' }) : ''}
  <div class="card table-card"><table class="table">
    <thead><tr><th>Record</th><th>Capability</th><th>Date</th><th>Change</th><th>Decision</th><th>Authorized by</th></tr></thead>
    <tbody>${records.map((d) => html`<tr>
      <td><a href="#/decisions/${d.id}"><strong>Authority change #${String(d.number).padStart(2, '0')}</strong></a></td>
      <td>${getCapability(state, d.capabilityId).name}</td>
      <td>${fmtDate(d.date)}</td>
      <td>${authorityLabel(d.previous, { short: true })} → ${authorityLabel(d.next, { short: true })}${d.next.level < d.previous.level ? html` <span class="badge badge-restricted">Down</span>` : ''}</td>
      <td>${optionLabel(d.option)}</td>
      <td>${person(d.authorizedBy).name}</td>
    </tr>`)}</tbody>
  </table></div>`;
}

export function decisionRecordView(state, id) {
  const d = state.decisionRecords.find((x) => x.id === id);
  if (!d) return html`<div class="page-head"><h1>Record not found</h1></div>`;
  const cap = getCapability(state, d.capabilityId);
  const who = person(d.authorizedBy);
  const auto = d.authorizedBy === 'system';
  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/decisions">Decisions</a> · ${auto ? 'Automatic restriction' : 'Human authorization'}</p>
      <h1>Authority change #${String(d.number).padStart(2, '0')}</h1>
      <p class="lede"><a href="#/capabilities/${cap.id}">${cap.name}</a> · ${fmtDateYear(d.date)}</p>
    </div>
  </div>
  ${auto ? notice('fail', 'This change was made by a software rule, not by a person.', 'The rule was authorized in advance as part of the expansion decision. Humans authorize expanded authority; software may reduce it when a predefined condition is triggered.') : ''}
  <div class="card record">
    <div class="record-change">
      <div><span class="fact-label">Previous</span>${authorityBadge(d.previous)}</div>
      <span class="record-arrow" aria-hidden="true">→</span>
      <div><span class="fact-label">New</span>${authorityBadge(d.next)}</div>
      <div><span class="fact-label">Decision</span><strong>${optionLabel(d.option)}</strong></div>
      <div><span class="fact-label">${auto ? 'Applied by' : 'Authorized by'}</span><strong>${who.name}</strong><div class="muted small">${who.role}</div></div>
    </div>
    ${kv([
      ['Scope', d.scope],
      ['Rationale', d.rationale],
      ['Evidence snapshot', html`<ul class="plain-list">${d.evidenceSnapshot.map((e) => html`<li>${e}</li>`)}</ul>`],
      ['Open condition', d.openCondition],
      ...(d.conditions ? [['Automatic action allowed when', html`<ul class="plain-list">
        <li>value ≤ $${d.conditions.maxValue}</li>
        ${d.conditions.noFraudFlag ? html`<li>no fraud flag</li>` : ''}
        ${d.conditions.policyClear ? html`<li>policy eligibility is clear</li>` : ''}
        <li>confidence ≥ ${d.conditions.minConfidence}%</li>
        ${d.conditions.noChargeback ? html`<li>no active chargeback</li>` : ''}
      </ul>`]] : []),
    ])}
    <p class="muted small record-foot">Record ${d.id}, written ${fmtDateYear(d.date)}. Decision records are immutable; a later change creates a new record and leaves this one as it was.</p>
  </div>`;
}

export function decisionWorkspaceView(state) {
  const cap = getCapability(state, 'refund-recommendation');
  const r = readiness(state);
  const d = state.decision;

  if (d.recordId && !cap.decisionRequired) {
    const rec = state.decisionRecords.find((x) => x.id === d.recordId);
    return html`<div class="page-head"><div><p class="eyebrow"><a href="#/decisions">Decisions</a></p><h1>Authority decision</h1><p class="lede">This decision was recorded as <a href="#/decisions/${rec.id}">Authority change #${String(rec.number).padStart(2, '0')}</a> on ${fmtDateYear(rec.date)}.</p></div></div>
      ${state.reviewRequired
        ? notice('fail', 'Review required', 'Authority was restricted automatically after the decision. A post-incident review must be recorded before a new expansion can be authorized. Use Reset demo to replay the flow.', { link: `#/decisions/${state.monitoring.breachRecordId}`, linkText: 'Restriction record' })
        : notice('pass', 'Authority is set', `${cap.name} is at ${authorityLabel(cap.authority)}. A new decision would create a new record; this prototype replays the flow through Reset demo.`, { link: '#/capabilities/refund-recommendation?tab=monitoring', linkText: 'Monitoring' })}`;
  }

  const check = canAuthorize(state);
  const options = seed.DECISION_OPTIONS.map((o) => html`<label class="option ${d.option === o.id ? 'is-selected' : ''} ${o.id === seed.systemRecommendation.option ? 'is-recommended' : ''}">
    <input type="radio" name="decision-option" value="${o.id}" ${d.option === o.id ? raw('checked') : ''} data-action="select-option">
    <span class="option-body"><strong>${o.name}</strong><span class="muted small">${o.description}</span>${o.id === seed.systemRecommendation.option ? html`<span class="badge badge-neutral">Recommended</span>` : ''}</span>
  </label>`);

  const c = d.conditions;
  const conditions = d.option === 'expand-limits' ? html`<div class="card conditions">
    <p class="eyebrow">Authority conditions</p>
    <p>AI may automatically issue refunds when all of these hold. Everything else requires human approval.</p>
    <div class="condition-grid">
      <label class="field"><span>Maximum value</span><span class="input-prefix">$<input type="number" min="5" max="500" step="5" value="${c.maxValue}" data-action="set-condition" data-key="maxValue"></span></label>
      <label class="field"><span>Minimum confidence</span><span class="input-suffix"><input type="number" min="50" max="99" step="1" value="${c.minConfidence}" data-action="set-condition" data-key="minConfidence">%</span></label>
      <label class="check"><input type="checkbox" ${c.noFraudFlag ? raw('checked') : ''} data-action="set-condition" data-key="noFraudFlag"><span>No fraud flag on the account</span></label>
      <label class="check"><input type="checkbox" ${c.policyClear ? raw('checked') : ''} data-action="set-condition" data-key="policyClear"><span>Policy eligibility is clear (no exception needed)</span></label>
      <label class="check"><input type="checkbox" ${c.noChargeback ? raw('checked') : ''} data-action="set-condition" data-key="noChargeback"><span>No active chargeback</span></label>
    </div>
    <div class="preview"><span class="fact-label">Plain-English preview</span><p>${conditionsPreview(c)}</p></div>
    ${!c.noFraudFlag ? notice('fail', 'Fraud-flagged accounts would be eligible for automatic refunds.', 'The contract lists fraud-flagged accounts under MUST ASK, and INC-01 showed the AI missing that signal. The enforcement gate added Oct 4 still blocks the action, but the condition should match the contract.') : ''}
    ${c.maxValue > 100 ? notice('watch', 'This exceeds the $100 approval line in the contract.', 'High-value refunds have 18 pilot cases at 83% accuracy. The evidence requirement for that segment is not met.') : ''}
  </div>` : d.option ? html`<div class="card conditions"><p class="eyebrow">Resulting authority</p><p>${scopeText(d.option, c)}</p><p class="muted small">${cap.name} would move from ${authorityLabel(cap.authority)} to ${authorityLabel(nextAuthority(d.option, cap.authority))}.</p></div>` : '';

  const criteriaRows = seed.successCriteria.map((s) => html`<tr><td>${s.name}</td><td>${s.target}</td><td>${s.current}</td><td>${badge(s.status)}</td></tr>`);

  const stakeholderTone = { 'expand': 'watch', 'expand-limits': 'pass', 'hold': 'insufficient' };

  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/decisions">Decisions</a> · <a href="#/capabilities/refund-recommendation">${cap.name}</a></p>
      <h1>Authority decision</h1>
      <p class="lede">Current: <strong>${authorityLabel(cap.authority)}</strong>. Proposed: <strong>${authorityLabel(cap.proposed)}</strong>. The system has summarized the evidence and made a recommendation. A named person decides.</p>
    </div>
  </div>
  <div class="card">${levelScale(cap.authority, cap.proposed)}</div>

  <div class="decision-grid">
    <div class="decision-main">
      ${section('Evidence summary', html`
        <div class="card table-card"><table class="table"><thead><tr><th>Criterion</th><th>Target</th><th>Current</th><th>Status</th></tr></thead><tbody>${criteriaRows}</tbody></table></div>
        ${requirementsList()}`, { subtitle: `${r.met} of ${r.total} evidence requirements met. The unresolved one is high-value refund volume.` })}

      ${section('System recommendation', html`<div class="card recommendation">
        <p class="rec-summary">${seed.systemRecommendation.summary}</p>
        <ul class="plain-list">${seed.systemRecommendation.rationale.map((x) => html`<li>${x}</li>`)}</ul>
        <p class="muted small">${seed.systemRecommendation.caveat}</p>
      </div>`)}

      ${section('Stakeholder positions', html`<div class="card"><ul class="position-list">${seed.stakeholders.map((s) => html`<li><span class="position-team">${s.team}</span>${badge(stakeholderTone[s.stance], s.position)}<span class="muted small">${person(s.person).name}</span></li>`)}</ul>
        <p><strong>Consensus:</strong> ${seed.stakeholderSummary.consensus}</p>
        <p><strong>Unresolved:</strong> ${seed.stakeholderSummary.disagreement} <a href="#/capabilities/refund-recommendation?tab=stakeholders">Full positions</a></p></div>`)}
    </div>

    <div class="decision-side">
      ${section('Decision', html`<div class="option-list" role="radiogroup" aria-label="Decision options">${options}</div>`, { subtitle: 'Authority can move down as well as up.' })}
      ${conditions}
      <div class="card authorize">
        <p class="eyebrow">Human authorization</p>
        <label class="field field-stack"><span>Decision rationale</span><textarea rows="5" data-action="set-rationale">${d.rationale}</textarea></label>
        <p class="muted small">Authorizing as <strong>${person('maya').name}</strong>, ${person('maya').role}. This action changes what the AI is allowed to do in production for ${cap.name}. It writes an immutable decision record with the evidence snapshot above.</p>
        ${check.ok ? '' : html`<p class="form-error" role="status">${check.reason}</p>`}
        <button class="btn btn-primary btn-block" data-action="authorize" ${check.ok ? '' : raw('disabled')}>Authorize authority change</button>
      </div>
    </div>
  </div>`;
}
