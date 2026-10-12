import * as seed from '../data/seed.js';
import { html, raw, badge, section, notice, kv, authorityBadge, levelScale, fmtDate, person, personAt, rightsNote, authorityText, lede } from '../ui.js';
import { getCapability, capData, readiness, authorityLabel, canAuthorize, conditionsPreview, scopeText, nextAuthority, amendmentsAfterEvidenceFor, versionsInForce, KIND_LABELS, VERSIONED_KINDS, current, actor, requirementLabel, decisionRequired, proposedAuthority, reviewForRecord, workspaceOf, workflowOf, namesAtRecord, barChangesSinceDecisionOpened, isExpansion, outcomeChecks, OUTCOMES_MIN, OUTCOMES_MAX, rolloutChecks, ROLLOUT_REVIEW_WITHIN_DAYS, activePeople, rationaleOk, levelName } from '../store/index.js';
import { requirementsList, optionLabel } from './capability.js';

// What a proposed change is about, in a sentence: "a target change".
const KIND_NOUN = { contract: 'rule', criteria: 'target', stakeholders: 'stakeholder' };
// What the AI acts on, e.g. "refunds" (the capability's own noun).
const actionNoun = (cap) => (cap && cap.actionNoun) || 'actions';

export function decisionsListView(state) {
  const records = state.decisionRecords.slice().reverse();
  const pending = state.capabilities.filter((c) => decisionRequired(state, c.id));
  const reviews = state.capabilities.filter((c) => capData(state, c.id).reviewRequired);
  return html`<div class="page-head">
    <div>
      <p class="eyebrow">${workspaceOf(state).name} · ${workflowOf(state).name}</p>
      <h1>Decisions</h1>
      ${lede('Every change to what an AI is allowed to do: who decided, why, and what evidence they saw.', 'Records can\'t be edited. A later decision adds a new record and leaves the old one as it was.')}
    </div>
    ${pending.length === 1 ? html`<div class="page-actions"><a class="btn btn-primary" href="#/capabilities/${pending[0].id}/decision">Open the decision</a></div>` : ''}
  </div>
  ${pending.map((c) => notice('decision', `Decision needed: ${c.name}`, `Someone has proposed moving ${c.name} from ${authorityLabel(c.authority)} to ${authorityLabel(proposedAuthority(state, c.id))}. ${readiness(state, c.id).met} of ${readiness(state, c.id).total} checks met.`, { link: `#/capabilities/${c.id}/decision`, linkText: 'Open' }))}
  ${state.capabilities.flatMap((c) => capData(state, c.id).proposals.filter((p) => p.status === 'open').map((p) => notice('watch', `Approval needed: ${c.name}`, `${person(p.proposedBy).name} proposed a ${KIND_NOUN[p.kind]} change. ${requirementLabel(p.required, p.approvals)}.`, { link: `#/capabilities/${c.id}/proposals/${p.id}`, linkText: 'Open' })))}
  ${reviews.map((c) => notice('fail', `Review needed before ${c.name} gets more authority`, `The AI was moved back to ${levelName(c.authority.level)} after crossing a safety limit. Before it can get more authority again, the owner or a Risk approver needs to record what happened and what changed (the post-incident review).`, { link: `#/capabilities/${c.id}?tab=monitoring`, linkText: 'Record the review' }))}
  <div class="card table-card"><table class="table">
    <thead><tr><th>Record</th><th>Capability</th><th>Date</th><th>Change</th><th>Decision</th><th>Decided by</th></tr></thead>
    <tbody>${records.map((x) => html`<tr>
      <td><a href="#/records/${x.id}"><strong>Authority change #${String(x.number).padStart(2, '0')}</strong></a></td>
      <td>${getCapability(state, x.capabilityId).name}</td>
      <td>${fmtDate(x.date)}</td>
      <td>${x.previous ? html`${authorityText(x.previous, { short: true })} → ` : html`<span class="muted">New → </span>`}${authorityText(x.next, { short: true })}${x.previous && x.next.level < x.previous.level ? html` <span class="badge badge-restricted">Reduced</span>` : ''}</td>
      <td>${optionLabel(x.option)}</td>
      <td>${personAt(x.authorizedByAt, x.authorizedBy).name}</td>
    </tr>`)}</tbody>
  </table></div>`;
}

// The expected-impact rows for an expansion (B1): a metric and a target with
// a number, up to four. Problems show inline; the Authorize button says why
// it's disabled.
// What still stands between the person and Authorize (#96): each step done
// or not, with its first problem, linking to it. canAuthorize stays the only
// judge: anything it refuses that no step explains is listed too.
export function checklist(state, cap, dec, check) {
  const expanding = isExpansion(state, cap.id, dec.option);
  const oc = expanding ? outcomeChecks(dec.outcomes) : null;
  const rc = expanding ? rolloutChecks(state, dec.rollout) : null;
  const items = [
    { href: '#decision-panel', label: 'Option', ok: Boolean(dec.option), why: 'Choose an option.' },
    ...(dec.option === 'expand-limits' ? [{ href: '#step-conditions', label: 'Limits', ok: true, why: '' }] : []),
    ...(expanding ? [{ href: '#step-rollout', label: 'Rollout plan', ok: rc.ok, why: rc.errors[0] }, { href: '#step-impact', label: 'Expected impact', ok: oc.ok, why: oc.errors[0] }] : []),
    { href: '#step-rationale', label: 'Your reason', ok: rationaleOk(dec.rationale), why: 'Say why you\'re making this decision (a sentence or more).' },
  ];
  const explained = items.some((i) => !i.ok);
  const extra = !check.ok && !explained ? html`<li class="check-item is-blocked"><span class="check-mark" aria-hidden="true">✗</span> ${check.reason}</li>` : '';
  return html`<ul class="checklist" role="status" aria-label="Before you can decide">${items.map((i) => html`<li class="check-item ${i.ok ? 'is-done' : 'is-blocked'}"><span class="check-mark" aria-hidden="true">${i.ok ? '✓' : '✗'}</span> <a href="${i.href}">${i.label}</a>${i.ok ? '' : html`<span class="muted small">: ${i.why}</span>`}</li>`)}${extra}</ul>`;
}

// The rollout plan for an expansion (C1): every field required.
function rolloutCard(state, cap, dec) {
  const p = dec.rollout || {};
  const rc = rolloutChecks(state, p);
  const field = (key, label, input) => html`<label class="field field-stack"><span>${label}</span>${input}</label>`;
  const attrs = (key) => raw(`data-action="set-rollout" data-capability="${cap.id}" data-field="${key}"`);
  return html`<div class="card rollout">
    <div class="rollout-grid">
      ${field('owner', 'Rollout owner', html`<select ${attrs('owner')}><option value="" ${p.owner ? '' : raw('selected')}>Choose a person</option>${Object.entries(activePeople(state)).map(([k, v]) => html`<option value="${k}" ${p.owner === k ? raw('selected') : ''}>${v.name} · ${v.role}</option>`)}</select>`)}
      ${field('startDate', 'Start date', html`<input type="date" value="${p.startDate || ''}" min="${state.today}" ${attrs('startDate')}>`)}
      ${field('reviewDate', `Review date (within ${ROLLOUT_REVIEW_WITHIN_DAYS} days of the start)`, html`<input type="date" value="${p.reviewDate || ''}" ${attrs('reviewDate')}>`)}
      ${field('feedbackChannel', 'Feedback channel', html`<input type="text" maxlength="120" value="${p.feedbackChannel || ''}" placeholder="e.g. #refund-ai-feedback" ${attrs('feedbackChannel')}>`)}
    </div>
    ${field('scope', 'Scope: where it starts', html`<textarea rows="3" maxlength="300" placeholder="e.g. UK refunds under $50, weekdays only" ${attrs('scope')}>${p.scope || ''}</textarea>`)}
    ${field('reviewerNotes', 'What reviewers need to know (the people checking the AI\'s work)', html`<textarea rows="4" maxlength="600" ${attrs('reviewerNotes')}>${p.reviewerNotes || ''}</textarea>`)}
    ${dec.rolloutPrefilled ? html`<p class="muted small"><strong>Prefilled for the demo.</strong> Edit it before you decide.</p>` : ''}
    ${rc.ok ? '' : html`<ul class="form-error plain-list">${rc.errors.map((e) => html`<li>${e}</li>`)}</ul>`}
  </div>`;
}

// The rollout plan as it stands on a record, or as it applies to a capability.
export function rolloutList(plan) {
  const o = plan.ownerAt || {};
  return html`<ul class="plain-list">
    <li><strong>Owner:</strong> ${o.name || plan.owner}${o.title ? `, ${o.title}` : ''}</li>
    <li><strong>Scope:</strong> ${plan.scope}</li>
    <li><strong>Starts:</strong> ${fmtDate(plan.startDate)} · <strong>Review:</strong> ${fmtDate(plan.reviewDate)}</li>
    <li><strong>Feedback:</strong> ${plan.feedbackChannel}</li>
    <li><strong>What reviewers need to know:</strong> ${plan.reviewerNotes}</li>
  </ul>`;
}

function impactCard(cap, dec) {
  const rows = Array.from({ length: OUTCOMES_MAX }, (_, i) => (dec.outcomes || [])[i] || { metric: '', target: '' });
  const oc = outcomeChecks(rows);
  return html`<div class="card impact">
    <div class="impact-rows">
      <span class="fact-label">What should improve</span><span class="fact-label">Target (with a number)</span>
      ${rows.map((o, i) => html`<input type="text" maxlength="80" aria-label="Target ${i + 1}: what should improve" placeholder="${i === 0 ? 'e.g. Resolution time' : ''}" value="${o.metric}" data-action="set-outcome" data-capability="${cap.id}" data-index="${i}" data-field="metric"><input type="text" maxlength="60" aria-label="Target ${i + 1}: number" placeholder="${i === 0 ? 'e.g. at least 35% faster' : ''}" value="${o.target}" data-action="set-outcome" data-capability="${cap.id}" data-index="${i}" data-field="target">`)}
    </div>
    ${dec.outcomesPrefilled ? html`<p class="muted small"><strong>Prefilled for the demo,</strong> a little above the pilot results. Edit them before you decide.</p>` : ''}
    ${oc.ok ? html`<p class="muted small">${oc.outcomes.length} target${oc.outcomes.length === 1 ? '' : 's'} set. Monitoring will compare them with the actual results.</p>` : html`<ul class="form-error plain-list">${oc.errors.map((e) => html`<li>${e}</li>`)}</ul>`}
  </div>`;
}

export function decisionRecordView(state, id) {
  const x = state.decisionRecords.find((r) => r.id === id);
  if (!x) return html`<div class="page-head"><h1>Record not found</h1></div>`;
  const cap = getCapability(state, x.capabilityId);
  const who = personAt(x.authorizedByAt, x.authorizedBy);
  const ownerAt = personAt(x.ownerAt, x.owner);
  const auto = x.authorizedBy === 'system';
  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/records">Decisions</a> · ${auto ? 'Automatic restriction' : 'Decided by a person'}</p>
      <h1>Authority change #${String(x.number).padStart(2, '0')}</h1>
      <p class="lede"><a href="#/capabilities/${cap.id}">${cap.name}</a> · ${fmtDate(x.date)} · ${recordNames(state, x)}</p>
    </div>
    <a class="btn btn-sm" href="#/records/${x.id}/brief">Decision brief (one page)</a>
  </div>
  ${auto ? notice('fail', `The AI was moved back to ${levelName(x.next.level)} after crossing a safety limit.`, 'No one made this change by hand. It followed a rule people agreed in advance ("Authority is reduced automatically when…"). People decide when the AI gets more authority; Authority Lab can take authority away on its own when a limit is crossed. Formally, this is an automatic restriction.') : ''}
  ${auto && reviewForRecord(state, x.id) ? (() => { const rv = reviewForRecord(state, x.id); return notice('pass', `Reviewed by ${personAt(rv.byAt, rv.by).name} on ${fmtDate(rv.date)} (${rv.id})`, `What happened: ${rv.cause} What changed: ${rv.changes} The review is saved separately; this record stays as it was.`, { link: `#/capabilities/${cap.id}?tab=monitoring`, linkText: 'See the review' }); })() : auto && capData(state, cap.id).reviewRequired ? notice('watch', 'Not reviewed yet', 'The owner or a Risk approver needs to record what happened and what changed (the post-incident review) on the Monitoring tab. Until then the AI can\'t get more authority.', { link: `#/capabilities/${cap.id}?tab=monitoring`, linkText: 'Record the review' }) : ''}
  <div class="card record">
    <div class="record-change">
      <div><span class="fact-label">Previous</span>${x.previous ? authorityBadge(x.previous) : html`<span class="muted">None (new capability)</span>`}</div>
      <span class="record-arrow" aria-hidden="true">→</span>
      <div><span class="fact-label">New</span>${authorityBadge(x.next)}</div>
      <div><span class="fact-label">Decision</span><strong>${optionLabel(x.option)}</strong></div>
      <div><span class="fact-label">${auto ? 'Applied by' : 'Authorized by'}</span><strong>${who.name}</strong><div class="muted small">${who.role}${who.team ? html`, ${who.team}` : ''}${rightsNote(x.authorizedByAt)}</div></div>
      ${x.owner && x.owner !== x.authorizedBy ? html`<div><span class="fact-label">Owner</span><strong>${ownerAt.name}</strong><div class="muted small">${ownerAt.role}${ownerAt.team ? html`, ${ownerAt.team}` : ''}</div></div>` : ''}
    </div>
    ${kv([
      ['Scope', x.scope],
      ['Rationale', x.rationale],
      ['Evidence at the time', html`<ul class="plain-list">${x.evidenceSnapshot.map((e) => html`<li>${e}</li>`)}</ul>`],
      ['Still to resolve', x.openCondition],
      // B1: what an expansion was expected to achieve, fixed on the record.
      ...(x.expectedOutcomes && x.expectedOutcomes.length
        ? [['Expected impact', html`<ul class="plain-list">${x.expectedOutcomes.map((o) => html`<li><strong>${o.metric}:</strong> ${o.target}</li>`)}</ul>${x.outcomesPrefilled ? html`<p class="muted small">Prefilled for the demo.</p>` : ''}`]]
        : x.previous && x.next && x.next.level > x.previous.level && x.authorizedBy !== 'system'
          ? [['Expected impact', html`<span class="muted">Not recorded: this decision was made before expected outcomes were required.</span>`]]
          : []),
      // C1: how the expansion went into service.
      ...(x.rolloutPlan
        ? [['Rollout plan', html`${rolloutList(x.rolloutPlan)}${x.rolloutPrefilled ? html`<p class="muted small">Prefilled for the demo.</p>` : ''}`]]
        : x.previous && x.next && x.next.level > x.previous.level && x.authorizedBy !== 'system'
          ? [['Rollout plan', html`<span class="muted">Not recorded: this decision was made before rollout plans were required.</span>`]]
          : []),
      ...(x.conditions ? [['Limits: the AI could act on its own when', html`<ul class="plain-list">
        <li>the amount is $${x.conditions.maxValue} or less</li>
        ${x.conditions.noFraudFlag ? html`<li>no fraud flag</li>` : ''}
        ${x.conditions.policyClear ? html`<li>policy eligibility is clear</li>` : ''}
        ${x.conditions.maxDailyTotal != null ? html`<li>at most $${x.conditions.maxDailyTotal} a day across all customers</li>` : ''}
        ${x.conditions.maxDailyCount != null ? html`<li>at most ${x.conditions.maxDailyCount} ${actionNoun(cap)} a day across all customers</li>` : ''}
        <li>confidence at least ${x.conditions.minConfidence}% <span class="muted small">(model-reported, not verified)</span></li>
        ${x.conditions.noChargeback ? html`<li>no active chargeback</li>` : ''}
      </ul>`]] : []),
    ])}
    ${x.versions ? html`<div class="record-foot"><span class="fact-label">Based on</span><div class="based-on">${VERSIONED_KINDS.map((k) => x.versions[k] ? html`<a href="#/capabilities/${cap.id}/versions?kind=${k}&version=${x.versions[k]}">${KIND_LABELS[k]} v${x.versions[k]}</a>` : html`<span class="muted">${KIND_LABELS[k]}: none yet</span>`)}</div></div>` : ''}
    ${amendedNote(state, x)}
    <p class="muted small record-foot">Record ${x.id}${x.sequence ? html`, record ${x.sequence} for ${cap.name}` : ''}, written ${fmtDate(x.date)}. Records can't be edited; a later decision adds a new one. Names and roles are shown as they were on that date.</p>
  </div>`;
}

// The workspace and workflow as named when the record was written (#60), with
// today's names alongside if they have changed since.
function recordNames(state, record) {
  const then = namesAtRecord(state, record);
  const label = `${then.workspace.name} · ${then.workflow.name}`;
  const now = `${workspaceOf(state).name} · ${workflowOf(state).name}`;
  return label === now ? label : html`${label} <span class="muted small">(as named then; now ${now})</span>`;
}

// The bar as it changed since this decision opened (roadmap item 8): every
// newer version of the criteria or requirements, each changed row marked
// stricter, looser or changed, with who did it and how it was approved.
function barChangedNote(state, cap) {
  const changes = barChangesSinceDecisionOpened(state, cap.id);
  if (!changes.length) return '';
  const word = { stricter: 'made stricter', looser: 'made easier to meet', changed: 'changed', added: 'added', removed: 'removed' };
  return html`<div class="notice notice-watch" role="status"><div class="notice-body"><strong>Targets or decision requirements changed after this decision was opened</strong>
    <ul class="plain-list">${changes.map((c) => html`<li>${c.kind === 'criteria' ? 'Targets' : 'Decision requirements'} v${c.version}, ${fmtDate(c.date)}, ${personAt(c.authorAt, c.author).name}${c.proposalId ? html` (approved, <a href="#/capabilities/${cap.id}/proposals/${c.proposalId}">${c.proposalId}</a>)` : c.tighteningOnly ? ' (made stricter only, no approval needed)' : ''}: ${c.rows.length ? c.rows.map((r, i) => html`${i ? '; ' : ''}${r.label} ${word[r.change]}${r.from && r.to ? ` (${r.from} → ${r.to})` : ''}`) : 'nothing changed'}.</li>`)}</ul>
    <p class="small">"Ready for a decision?" uses the targets and checks as they are now.</p></div>
    <a class="notice-link" href="#/capabilities/${cap.id}/versions?kind=criteria">See history</a></div>`;
}

// Shown on a decision when the criteria or evidence requirements it relied on
// were amended after performance results had been seen.
export function amendedNote(state, record) {
  const amended = amendmentsAfterEvidenceFor(state, record);
  if (!amended.length) return '';
  const cap = getCapability(state, record.capabilityId);
  return notice('watch', 'Targets changed after results were seen', `This decision was judged against targets or checks that changed after the results were in. Check that the change was justified. ${amended.map((a) => `${person(a.author).name} changed the ${KIND_NOUN[a.kind] === 'target' ? 'targets' : 'decision requirements'} (v${a.version}): ${a.reason}`).join(' ')}`, { link: `#/capabilities/${cap.id}/versions?kind=${amended[0].kind}&version=${amended[0].version}`, linkText: 'See the change' });
}

export function decisionWorkspaceView(state, capabilityId, query = new URLSearchParams()) {
  const cap = getCapability(state, capabilityId);
  if (!cap) return html`<div class="page-head"><h1>Capability not found</h1></div>`;
  const d = capData(state, capabilityId);
  const r = readiness(state, capabilityId);
  const dec = d.decision;

  const pending = decisionRequired(state, capabilityId);
  const proposed = proposedAuthority(state, capabilityId);
  if (dec.recordId && !pending) {
    const rec = state.decisionRecords.find((x) => x.id === dec.recordId);
    return html`<div class="page-head"><div><p class="eyebrow"><a href="#/records">Decisions</a></p><h1>Authority decision</h1><p class="lede">This decision was made on ${fmtDate(rec.date)}. See the record: <a href="#/records/${rec.id}">Authority change #${String(rec.number).padStart(2, '0')}</a>.</p></div></div>
      ${d.reviewRequired
        ? notice('fail', 'Review needed', `After this decision, the AI was moved back to ${levelName(cap.authority.level)} after crossing a safety limit. Record what happened and what changed (the post-incident review) before giving it more authority again.`, { link: `#/capabilities/${cap.id}?tab=monitoring`, linkText: 'Record the review' })
        : notice('pass', 'Decision recorded', `${cap.name} is at ${authorityLabel(cap.authority)}. To try the decision again, use Reset demo.`, { link: `#/capabilities/${cap.id}?tab=monitoring`, linkText: 'Monitoring' })}`;
  }

  if (!pending) {
    return html`<div class="page-head"><div><p class="eyebrow"><a href="#/records">Decisions</a></p><h1>Authority decision</h1><p class="lede">Nothing to decide right now. ${cap.name} is at ${authorityLabel(cap.authority)}, and no one has proposed a change.</p></div></div>`;
  }

  const check = canAuthorize(state, capabilityId);
  const rec = d.recommendation;
  // A compact radio list: one line per option, its description as a tooltip.
  const options = seed.DECISION_OPTIONS.map((o) => html`<label class="option-row ${dec.option === o.id ? 'is-selected' : ''} ${rec && o.id === rec.option ? 'is-recommended' : ''}" title="${o.description}">
    <input type="radio" name="decision-option" value="${o.id}" ${dec.option === o.id ? raw('checked') : ''} data-action="select-option" data-capability="${cap.id}">
    <span class="option-row-name">${o.name}</span>${rec && o.id === rec.option ? html`<span class="badge badge-neutral">Recommended</span>` : ''}
  </label>`);
  const chosen = seed.DECISION_OPTIONS.find((o) => o.id === dec.option);

  const c = dec.conditions;
  const noun = actionNoun(cap);
  const conditions = dec.option === 'expand-limits' ? html`<div class="card conditions">
    <p class="eyebrow">Limits</p>
    <p>The AI can act on its own only when all of these are true. Everything else goes to a person to approve.</p>
    <div class="condition-grid">
      <label class="field"><span>Maximum amount (each)</span><span class="input-prefix">$<input type="number" min="5" max="500" step="5" value="${c.maxValue}" data-action="set-condition" data-capability="${cap.id}" data-key="maxValue"></span></label>
      <label class="field"><span>Daily total (all customers)</span><span class="input-prefix">$<input type="number" min="0" max="100000" step="50" value="${c.maxDailyTotal ?? ''}" data-action="set-condition" data-capability="${cap.id}" data-key="maxDailyTotal"></span></label>
      <label class="field"><span>Daily number (all customers)</span><span class="input-suffix"><input type="number" min="0" max="10000" step="1" value="${c.maxDailyCount ?? ''}" data-action="set-condition" data-capability="${cap.id}" data-key="maxDailyCount"> ${actionNoun(cap)}</span></label>
      <label class="field"><span>Minimum confidence <span class="muted small">(model-reported, not verified)</span></span><span class="input-suffix"><input type="number" min="50" max="99" step="1" value="${c.minConfidence}" data-action="set-condition" data-capability="${cap.id}" data-key="minConfidence">%</span></label>
      <label class="check"><input type="checkbox" ${c.noFraudFlag ? raw('checked') : ''} data-action="set-condition" data-capability="${cap.id}" data-key="noFraudFlag"><span>No fraud flag on the account</span></label>
      <label class="check"><input type="checkbox" ${c.policyClear ? raw('checked') : ''} data-action="set-condition" data-capability="${cap.id}" data-key="policyClear"><span>Policy eligibility is clear (no exception needed)</span></label>
      <label class="check"><input type="checkbox" ${c.noChargeback ? raw('checked') : ''} data-action="set-condition" data-capability="${cap.id}" data-key="noChargeback"><span>No active chargeback</span></label>
    </div>
    <p class="muted small">Once the daily total or number is reached, further ${noun} go to a person. Confidence is what the AI reports about itself: Authority Lab checks it against your minimum but can't verify it, and a high score never lets an action through on its own. The summary in Step 1 updates as you change these.</p>
  </div>` : '';
  const conditionWarnings = dec.option === 'expand-limits' ? html`
    ${!c.noFraudFlag ? notice('fail', 'Fraud-flagged accounts would be handled without a person.', 'Your rules say the AI must ask a person about fraud-flagged accounts. Those cases would still be stopped, but your limits should match your rules: tick "No fraud flag on the account".') : ''}
    ${c.maxValue > 100 ? notice('watch', 'This is above the $100 limit in your rules.', r.unmet.length ? `The check "${r.unmet[0].text}" isn't met yet (currently ${r.unmet[0].current}).` : '') : ''}` : '';
  const preview = !dec.option
    ? html`<p class="muted">Choose an option to see what it would allow.</p>`
    : dec.option === 'expand-limits'
      ? html`<p>${conditionsPreview(c, cap)}</p>`
      : html`<p>${scopeText(dec.option, c, cap, nextAuthority(dec.option, cap.authority, proposed))}</p><p class="muted small">${cap.name} would move from ${authorityLabel(cap.authority)} to ${authorityLabel(nextAuthority(dec.option, cap.authority, proposed))}.</p>`;

  const criteria = current(state, cap.id, 'criteria');
  const stakeholders = current(state, cap.id, 'stakeholders');
  const criteriaRows = criteria.map((s) => html`<tr><td>${s.name}</td><td>${s.target}</td><td>${s.current}</td><td>${badge(s.status)}</td></tr>`);
  const stakeholderTone = { 'expand': 'watch', 'expand-limits': 'pass', 'hold': 'insufficient' };
  const authorizer = person(actor(state, cap.id));

  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/records">Decisions</a> · <a href="#/capabilities/${cap.id}">${cap.name}</a></p>
      <h1>Should ${cap.name} get more authority?</h1>
      ${lede('You\'re deciding whether this AI should get more authority. Review the evidence, set any limits, and record why you\'re comfortable with the change.', rec ? 'Authority Lab summarizes the evidence and suggests an option. You make the decision, and your name goes on the record.' : null)}
    </div>
  </div>
  <div class="card">${levelScale(cap.authority, proposed)}</div>

  <div class="decision-grid">
    <div class="decision-main">
      ${!dec.option ? html`<div class="card step-hint"><p><strong>Step 1:</strong> choose an option. The steps it needs will appear here.</p></div>` : ''}
      ${conditions ? section('Step 2 · Limits', conditions, { id: 'step-conditions', subtitle: 'When the AI may act on its own. Anything outside these limits goes to a person.' }) : ''}
      ${isExpansion(state, cap.id, dec.option) ? section('Step 3 · Rollout plan', rolloutCard(state, cap, dec), { id: 'step-rollout', subtitle: 'Who runs the rollout, where it starts, and when you\'ll check how it\'s going. It is saved with the decision and can\'t be changed after you decide.' }) : ''}
      ${isExpansion(state, cap.id, dec.option) ? section('Step 4 · Expected impact', impactCard(cap, dec), { id: 'step-impact', subtitle: `What should improve if we make this change? Set ${OUTCOMES_MIN}–${OUTCOMES_MAX} measurable targets now. We'll compare them with the actual results after rollout. They can't be changed after you decide.` }) : ''}
      <details class="context" open><summary>Evidence, recommendation and stakeholder positions</summary>
      ${section('Evidence', html`
        ${barChangedNote(state, cap)}
        ${amendedNote(state, { capabilityId: cap.id, versions: versionsInForce(state, cap.id) })}
        ${criteriaRows.length ? html`<div class="card table-card"><table class="table"><thead><tr><th>Measure</th><th>Target</th><th>Current</th><th>Status</th></tr></thead><tbody>${criteriaRows}</tbody></table></div>` : ''}
        ${requirementsList(state, cap.id)}`, { subtitle: r.total ? `Ready for a decision? ${r.met} of ${r.total} checks met.${r.unmet.length ? ` Not yet met: ${r.unmet.map((u) => u.text.toLowerCase()).join('; ')}.` : ''}` : 'No decision requirements set yet.' })}

      ${rec ? section('Recommendation', html`<div class="card recommendation">
        <p class="rec-summary">${rec.summary}</p>
        <ul class="plain-list">${rec.rationale.map((x) => html`<li>${x}</li>`)}</ul>
        <p class="muted small">${rec.caveat}</p>
      </div>`, { subtitle: 'Worked out from the evidence. You decide.' }) : ''}

      ${stakeholders.length ? section('Stakeholder positions', html`<div class="card"><ul class="position-list">${stakeholders.map((s) => html`<li><span class="position-team">${s.team}</span>${badge(stakeholderTone[s.stance] || 'neutral', s.position)}<span class="muted small">${person(s.person).name}</span></li>`)}</ul>
        ${d.stakeholderSummary ? html`<p><strong>Where people agree:</strong> ${d.stakeholderSummary.consensus}</p>
        <p><strong>Still disagree on:</strong> ${d.stakeholderSummary.disagreement} <a href="#/capabilities/${cap.id}?tab=summary">All positions</a></p>` : ''}</div>`) : ''}
      </details>
    </div>

    <div class="decision-side">
      <div class="card decision-panel" id="decision-panel">
        <p class="eyebrow">Step 1 · Choose an option</p>
        <div class="option-rows" role="radiogroup" aria-label="Decision options">${options}</div>
        <p class="muted small">You can also give the AI less authority.</p>
        <div class="preview"><span class="fact-label">${chosen ? html`What this would mean: <strong>${chosen.name}</strong>` : 'What this would mean'}</span>${preview}</div>
        ${conditionWarnings}
        <label class="field field-stack" id="step-rationale"><span>Step 5 · Why are you making this decision?</span><textarea rows="4" data-action="set-rationale" data-capability="${cap.id}">${dec.rationale}</textarea></label>
        <p class="muted small">You're deciding as <strong>${authorizer.name}</strong>, ${authorizer.role}. This changes what the AI can do for real customers. Your decision, your reason and the evidence above are saved as a permanent record.</p>
        ${query.get('error') ? notice('fail', 'Couldn\'t record the decision', query.get('error')) : ''}
        ${checklist(state, cap, dec, check)}
        <button class="btn btn-primary btn-block" data-action="authorize" data-capability="${cap.id}" ${check.ok ? '' : raw('disabled')}>Record decision</button>
      </div>
    </div>
  </div>`;
}
