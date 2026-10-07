import * as seed from '../data/seed.js';
import { html, raw, badge, section, notice, kv, authorityBadge, levelScale, fmtDate, fmtDateYear, person } from '../ui.js';
import { getCapability, capData, readiness, authorityLabel, canAuthorize, conditionsPreview, scopeText, nextAuthority, amendmentsAfterEvidenceFor, versionsInForce, KIND_LABELS, VERSIONED_KINDS, current, actor } from '../store.js';
import { requirementsList, optionLabel } from './capability.js';

export function decisionsListView(state) {
  const records = state.decisionRecords.slice().reverse();
  const pending = state.capabilities.filter((c) => c.decisionRequired);
  const reviews = state.capabilities.filter((c) => capData(state, c.id).reviewRequired);
  return html`<div class="page-head">
    <div>
      <p class="eyebrow">${seed.workspace.name} · ${seed.workflow.name}</p>
      <h1>Decisions</h1>
      <p class="lede">Every authority change, who authorized it, and the evidence it rested on at the time. Records are not edited after they are written.</p>
    </div>
    ${pending.length === 1 ? html`<div class="page-actions"><a class="btn btn-primary" href="#/capabilities/${pending[0].id}/decision">Open authority decision</a></div>` : ''}
  </div>
  ${pending.map((c) => notice('decision', `Decision required: ${c.name}`, `Proposed change from ${authorityLabel(c.authority)} to ${authorityLabel(c.proposed)}. ${readiness(state, c.id).met} of ${readiness(state, c.id).total} evidence requirements met.`, { link: `#/capabilities/${c.id}/decision`, linkText: 'Open' }))}
  ${reviews.map((c) => notice('fail', `Review required before any expansion: ${c.name}`, 'Authority was restricted automatically. A post-incident review must be recorded before authority can expand again.', { link: `#/decisions/${capData(state, c.id).monitoring.breachRecordId}`, linkText: 'Restriction record' }))}
  <div class="card table-card"><table class="table">
    <thead><tr><th>Record</th><th>Capability</th><th>Date</th><th>Change</th><th>Decision</th><th>Authorized by</th></tr></thead>
    <tbody>${records.map((x) => html`<tr>
      <td><a href="#/decisions/${x.id}"><strong>Authority change #${String(x.number).padStart(2, '0')}</strong></a></td>
      <td>${getCapability(state, x.capabilityId).name}</td>
      <td>${fmtDate(x.date)}</td>
      <td>${x.previous ? html`${authorityLabel(x.previous, { short: true })} → ` : html`<span class="muted">New → </span>`}${authorityLabel(x.next, { short: true })}${x.previous && x.next.level < x.previous.level ? html` <span class="badge badge-restricted">Down</span>` : ''}</td>
      <td>${optionLabel(x.option)}</td>
      <td>${person(x.authorizedBy).name}</td>
    </tr>`)}</tbody>
  </table></div>`;
}

export function decisionRecordView(state, id) {
  const x = state.decisionRecords.find((r) => r.id === id);
  if (!x) return html`<div class="page-head"><h1>Record not found</h1></div>`;
  const cap = getCapability(state, x.capabilityId);
  const who = person(x.authorizedBy);
  const auto = x.authorizedBy === 'system';
  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/decisions">Decisions</a> · ${auto ? 'Automatic restriction' : 'Human authorization'}</p>
      <h1>Authority change #${String(x.number).padStart(2, '0')}</h1>
      <p class="lede"><a href="#/capabilities/${cap.id}">${cap.name}</a> · ${fmtDateYear(x.date)}</p>
    </div>
  </div>
  ${auto ? notice('fail', 'This change was made by a software rule, not by a person.', 'The rule was authorized in advance as part of the expansion decision. Humans authorize expanded authority; software may reduce it when a predefined condition is triggered.') : ''}
  <div class="card record">
    <div class="record-change">
      <div><span class="fact-label">Previous</span>${x.previous ? authorityBadge(x.previous) : html`<span class="muted">None (new capability)</span>`}</div>
      <span class="record-arrow" aria-hidden="true">→</span>
      <div><span class="fact-label">New</span>${authorityBadge(x.next)}</div>
      <div><span class="fact-label">Decision</span><strong>${optionLabel(x.option)}</strong></div>
      <div><span class="fact-label">${auto ? 'Applied by' : 'Authorized by'}</span><strong>${who.name}</strong><div class="muted small">${who.role}</div></div>
    </div>
    ${kv([
      ['Scope', x.scope],
      ['Rationale', x.rationale],
      ['Evidence snapshot', html`<ul class="plain-list">${x.evidenceSnapshot.map((e) => html`<li>${e}</li>`)}</ul>`],
      ['Open condition', x.openCondition],
      ...(x.conditions ? [['Automatic action allowed when', html`<ul class="plain-list">
        <li>value ≤ $${x.conditions.maxValue}</li>
        ${x.conditions.noFraudFlag ? html`<li>no fraud flag</li>` : ''}
        ${x.conditions.policyClear ? html`<li>policy eligibility is clear</li>` : ''}
        <li>confidence ≥ ${x.conditions.minConfidence}%</li>
        ${x.conditions.noChargeback ? html`<li>no active chargeback</li>` : ''}
      </ul>`]] : []),
    ])}
    ${x.versions ? html`<div class="record-foot"><span class="fact-label">Based on</span><div class="based-on">${VERSIONED_KINDS.map((k) => x.versions[k] ? html`<a href="#/capabilities/${cap.id}/versions?kind=${k}&version=${x.versions[k]}">${KIND_LABELS[k]} v${x.versions[k]}</a>` : html`<span class="muted">${KIND_LABELS[k]}: none yet</span>`)}</div></div>` : ''}
    ${amendedNote(state, x)}
    <p class="muted small record-foot">Record ${x.id}${x.sequence ? html`, record ${x.sequence} for ${cap.name}` : ''}, written ${fmtDateYear(x.date)}. Decision records are immutable; a later change creates a new record and leaves this one as it was.</p>
  </div>`;
}

// Shown on a decision when the criteria or evidence requirements it relied on
// were amended after performance results had been seen.
export function amendedNote(state, record) {
  const amended = amendmentsAfterEvidenceFor(state, record);
  if (!amended.length) return '';
  const cap = getCapability(state, record.capabilityId);
  return notice('watch', 'Criteria amended after evidence', `${amended.map((a) => `${KIND_LABELS[a.kind]} v${a.version} by ${person(a.author).name}: ${a.reason}`).join(' ')} The bar this decision was measured against changed after results were seen.`, { link: `#/capabilities/${cap.id}/versions?kind=${amended[0].kind}&version=${amended[0].version}`, linkText: 'See the change' });
}

export function decisionWorkspaceView(state, capabilityId) {
  const cap = getCapability(state, capabilityId);
  if (!cap) return html`<div class="page-head"><h1>Capability not found</h1></div>`;
  const d = capData(state, capabilityId);
  const r = readiness(state, capabilityId);
  const dec = d.decision;

  if (dec.recordId && !cap.decisionRequired) {
    const rec = state.decisionRecords.find((x) => x.id === dec.recordId);
    return html`<div class="page-head"><div><p class="eyebrow"><a href="#/decisions">Decisions</a></p><h1>Authority decision</h1><p class="lede">This decision was recorded as <a href="#/decisions/${rec.id}">Authority change #${String(rec.number).padStart(2, '0')}</a> on ${fmtDateYear(rec.date)}.</p></div></div>
      ${d.reviewRequired
        ? notice('fail', 'Review required', 'Authority was restricted automatically after the decision. A post-incident review must be recorded before a new expansion can be authorized. Use Reset demo to replay the flow.', { link: `#/decisions/${d.monitoring.breachRecordId}`, linkText: 'Restriction record' })
        : notice('pass', 'Authority is set', `${cap.name} is at ${authorityLabel(cap.authority)}. A new decision would create a new record; this prototype replays the flow through Reset demo.`, { link: `#/capabilities/${cap.id}?tab=monitoring`, linkText: 'Monitoring' })}`;
  }

  if (!cap.decisionRequired) {
    return html`<div class="page-head"><div><p class="eyebrow"><a href="#/decisions">Decisions</a></p><h1>Authority decision</h1><p class="lede">No authority change is proposed for ${cap.name}. It is at ${authorityLabel(cap.authority)}.</p></div></div>`;
  }

  const check = canAuthorize(state, capabilityId);
  const rec = d.recommendation;
  const options = seed.DECISION_OPTIONS.map((o) => html`<label class="option ${dec.option === o.id ? 'is-selected' : ''} ${rec && o.id === rec.option ? 'is-recommended' : ''}">
    <input type="radio" name="decision-option" value="${o.id}" ${dec.option === o.id ? raw('checked') : ''} data-action="select-option" data-capability="${cap.id}">
    <span class="option-body"><strong>${o.name}</strong><span class="muted small">${o.description}</span>${rec && o.id === rec.option ? html`<span class="badge badge-neutral">Recommended</span>` : ''}</span>
  </label>`);

  const c = dec.conditions;
  const conditions = dec.option === 'expand-limits' ? html`<div class="card conditions">
    <p class="eyebrow">Authority conditions</p>
    <p>AI may automatically act when all of these hold. Everything else requires human approval.</p>
    <div class="condition-grid">
      <label class="field"><span>Maximum value</span><span class="input-prefix">$<input type="number" min="5" max="500" step="5" value="${c.maxValue}" data-action="set-condition" data-capability="${cap.id}" data-key="maxValue"></span></label>
      <label class="field"><span>Minimum confidence</span><span class="input-suffix"><input type="number" min="50" max="99" step="1" value="${c.minConfidence}" data-action="set-condition" data-capability="${cap.id}" data-key="minConfidence">%</span></label>
      <label class="check"><input type="checkbox" ${c.noFraudFlag ? raw('checked') : ''} data-action="set-condition" data-capability="${cap.id}" data-key="noFraudFlag"><span>No fraud flag on the account</span></label>
      <label class="check"><input type="checkbox" ${c.policyClear ? raw('checked') : ''} data-action="set-condition" data-capability="${cap.id}" data-key="policyClear"><span>Policy eligibility is clear (no exception needed)</span></label>
      <label class="check"><input type="checkbox" ${c.noChargeback ? raw('checked') : ''} data-action="set-condition" data-capability="${cap.id}" data-key="noChargeback"><span>No active chargeback</span></label>
    </div>
    <div class="preview"><span class="fact-label">Plain-English preview</span><p>${conditionsPreview(c, cap)}</p></div>
    ${!c.noFraudFlag ? notice('fail', 'Fraud-flagged accounts would be eligible for automatic action.', 'The contract lists fraud-flagged accounts under MUST ASK. The enforcement gate still blocks the action, but the condition should match the contract.') : ''}
    ${c.maxValue > 100 ? notice('watch', 'This exceeds the $100 approval line in the contract.', r.unmet.length ? `The evidence requirement "${r.unmet[0].text}" is not met (currently ${r.unmet[0].current}).` : '') : ''}
  </div>` : dec.option ? html`<div class="card conditions"><p class="eyebrow">Resulting authority</p><p>${scopeText(dec.option, c, cap)}</p><p class="muted small">${cap.name} would move from ${authorityLabel(cap.authority)} to ${authorityLabel(nextAuthority(dec.option, cap.authority))}.</p></div>` : '';

  const criteria = current(state, cap.id, 'criteria');
  const stakeholders = current(state, cap.id, 'stakeholders');
  const criteriaRows = criteria.map((s) => html`<tr><td>${s.name}</td><td>${s.target}</td><td>${s.current}</td><td>${badge(s.status)}</td></tr>`);
  const stakeholderTone = { 'expand': 'watch', 'expand-limits': 'pass', 'hold': 'insufficient' };
  const authorizer = person(actor(state, cap.id));

  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/decisions">Decisions</a> · <a href="#/capabilities/${cap.id}">${cap.name}</a></p>
      <h1>Authority decision</h1>
      <p class="lede">Current: <strong>${authorityLabel(cap.authority)}</strong>. Proposed: <strong>${authorityLabel(cap.proposed)}</strong>. ${rec ? 'The system has summarized the evidence and made a recommendation. ' : ''}A named person decides.</p>
    </div>
  </div>
  <div class="card">${levelScale(cap.authority, cap.proposed)}</div>

  <div class="decision-grid">
    <div class="decision-main">
      ${section('Evidence summary', html`
        ${amendedNote(state, { capabilityId: cap.id, versions: versionsInForce(state, cap.id) })}
        ${criteriaRows.length ? html`<div class="card table-card"><table class="table"><thead><tr><th>Criterion</th><th>Target</th><th>Current</th><th>Status</th></tr></thead><tbody>${criteriaRows}</tbody></table></div>` : ''}
        ${requirementsList(state, cap.id)}`, { subtitle: r.total ? `${r.met} of ${r.total} evidence requirements met.${r.unmet.length ? ` Unresolved: ${r.unmet.map((u) => u.text.toLowerCase()).join('; ')}.` : ''}` : 'No evidence requirements defined.' })}

      ${rec ? section('System recommendation', html`<div class="card recommendation">
        <p class="rec-summary">${rec.summary}</p>
        <ul class="plain-list">${rec.rationale.map((x) => html`<li>${x}</li>`)}</ul>
        <p class="muted small">${rec.caveat}</p>
      </div>`) : ''}

      ${stakeholders.length ? section('Stakeholder positions', html`<div class="card"><ul class="position-list">${stakeholders.map((s) => html`<li><span class="position-team">${s.team}</span>${badge(stakeholderTone[s.stance] || 'neutral', s.position)}<span class="muted small">${person(s.person).name}</span></li>`)}</ul>
        ${d.stakeholderSummary ? html`<p><strong>Consensus:</strong> ${d.stakeholderSummary.consensus}</p>
        <p><strong>Unresolved:</strong> ${d.stakeholderSummary.disagreement} <a href="#/capabilities/${cap.id}?tab=stakeholders">Full positions</a></p>` : ''}</div>`) : ''}
    </div>

    <div class="decision-side">
      ${section('Decision', html`<div class="option-list" role="radiogroup" aria-label="Decision options">${options}</div>`, { subtitle: 'Authority can move down as well as up.' })}
      ${conditions}
      <div class="card authorize">
        <p class="eyebrow">Human authorization</p>
        <label class="field field-stack"><span>Decision rationale</span><textarea rows="5" data-action="set-rationale" data-capability="${cap.id}">${dec.rationale}</textarea></label>
        <p class="muted small">Authorizing as <strong>${authorizer.name}</strong>, ${authorizer.role}. This action changes what the AI is allowed to do in production for ${cap.name}. It writes an immutable decision record with the evidence snapshot above.</p>
        ${check.ok ? '' : html`<p class="form-error" role="status">${check.reason}</p>`}
        <button class="btn btn-primary btn-block" data-action="authorize" data-capability="${cap.id}" ${check.ok ? '' : raw('disabled')}>Authorize authority change</button>
      </div>
    </div>
  </div>`;
}
