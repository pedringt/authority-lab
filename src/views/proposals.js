import * as seed from '../data/seed.js';
import { html, raw, badge, notice, section, person, personAt, rightsNote, fmtDate, kv, warningNotice } from '../ui.js';
import { getCapability, capData, current, versionList, actor, needsSignoff, signoffRequirements, requirementLabel, roleLabel, openProposal, getProposal, approvalEligibility, approvalsComplete, proposalReadiness, contractValueChecks, SECTION_KEYS, SECTION_LABELS, CORE_CRITERIA, CORE_REQUIREMENTS, KIND_LABELS, proposalWarning } from '../store/index.js';
import { diffTable } from './activity.js';

const KIND_TITLE = { criteria: 'success criteria and evidence requirements', contract: 'contract', stakeholders: 'stakeholders' };

// Propose (or, before the gate, apply) a change to a locked object.
export function proposeView(state, capabilityId, kind, query) {
  const cap = getCapability(state, capabilityId);
  if (!cap) return html`<div class="page-head"><h1>Capability not found</h1></div>`;
  if (kind === 'stakeholders') return html`<div class="page-head"><div><p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a></p><h1>Amend the stakeholders</h1><p class="lede">Stakeholders are edited in their editor. After performance results, a change to who is listed or to a team label becomes a proposal with sign-off; position and reasoning updates apply directly.</p></div></div>${notice('neutral', 'Use the stakeholder editor', 'Save there; the store decides whether sign-off is needed.', { link: `#/capabilities/${cap.id}/stakeholders/edit`, linkText: 'Stakeholder editor' })}`;
  if (!['criteria', 'contract'].includes(kind)) return html`<div class="page-head"><h1>Unknown amendment</h1></div>`;
  const error = query.get('error');
  const acting = person(actor(state, capabilityId));
  const gated = needsSignoff(state, capabilityId, kind);
  const required = signoffRequirements(state, capabilityId, actor(state, capabilityId));
  const open = openProposal(state, capabilityId, kind);
  const hasContract = versionList(state, capabilityId, 'contract').length > 0;
  const hasCriteria = versionList(state, capabilityId, 'criteria').length > 0;

  if (kind === 'contract' && !hasContract) return html`<div class="page-head"><div><h1>Amend the contract</h1><p class="lede">${cap.name} has no finalized contract yet.</p></div></div>${notice('neutral', 'Nothing to amend', 'Finalize the contract in the builder first.', { link: `#/capabilities/${cap.id}/contract/build`, linkText: 'Contract builder' })}`;
  if (kind === 'criteria' && !hasCriteria) return html`<div class="page-head"><div><h1>Amend the success criteria</h1><p class="lede">${cap.name} has no saved criteria yet.</p></div></div>${notice('neutral', 'Nothing to amend', 'Save the criteria in the editor first.', { link: `#/capabilities/${cap.id}/criteria/edit`, linkText: 'Criteria editor' })}`;
  if (open) return html`<div class="page-head"><div><p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a></p><h1>Amend the ${KIND_TITLE[kind]}</h1></div></div>${notice('watch', `${open.id} is awaiting sign-off`, `${personAt(open.proposedByAt, open.proposedBy).name} proposed a change on ${fmtDate(open.date)}. Approve or reject it before proposing another.`, { link: `#/capabilities/${cap.id}/proposals/${open.id}`, linkText: 'Open the proposal' })}`;

  const head = html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a> · ${gated ? 'Proposed amendment' : 'Amendment'}</p>
      <h1>Amend the ${KIND_TITLE[kind]}</h1>
      <p class="lede">${gated
        ? kind === 'criteria'
          ? `Performance results have been seen, so the criteria are locked. Your change becomes a proposal that needs ${requirementLabel(required)} to approve; the proposer never approves.`
          : `A pilot has started, so contract edits need sign-off (${requirementLabel(required)}; the proposer never approves). This rule is a setting that can be switched off.`
        : `No sign-off is needed yet: ${kind === 'criteria' ? 'the criteria are not locked' : 'no pilot has started'}. Saving writes a new version directly.`}</p>
    </div>
  </div>
  ${error ? (error.includes(' | ')
    ? html`<div class="notice notice-fail" role="alert"><div class="notice-body"><strong>${error.split(' | ')[0]}</strong><ul class="plain-list">${error.split(' | ').slice(1).filter(Boolean).map((t) => html`<li>${t}</li>`)}</ul></div></div>`
    : notice('fail', 'Could not submit', error)) : ''}`;

  if (kind === 'contract') {
    const c = current(state, capabilityId, 'contract');
    const currentChecks = contractValueChecks(state, capabilityId, c);
    return html`${head}
    ${notice('neutral', 'The same checks as the builder apply before you can submit', 'Empty hard limits above Low impact, a line under both "may" and "must never" or "must ask", a restriction rule with no number or window, and a financial capability with no value limit under "may" or "must ask" all block submission.')}
    ${currentChecks.filter((x) => x.level === 'block').length ? notice('watch', 'The current contract would not pass these checks as it stands', currentChecks.filter((x) => x.level === 'block').map((x) => x.text).join(' ')) : ''}
    <form class="setup-form" data-form="propose-contract" novalidate>
      ${SECTION_KEYS.map((k) => html`<div class="card"><label class="field field-stack"><span>${SECTION_LABELS[k]} <span class="muted small">one line per row</span></span><textarea name="${k}" rows="${Math.max(3, c[k].length + 1)}">${c[k].join('\\n')}</textarea></label></div>`)}
      ${reasonAndSubmit(state, cap, kind, gated, required, acting)}
    </form>`;
  }

  const criteria = current(state, capabilityId, 'criteria');
  const requirements = current(state, capabilityId, 'requirements');
  const row = (x, i) => html`<tr>
    <td><input type="hidden" name="c-id" value="${x.id || ''}"><input type="hidden" name="c-source" value="${x.source || ''}"><input type="hidden" name="c-current" value="${x.current || ''}"><input type="hidden" name="c-status" value="${x.status || ''}"><input type="text" name="c-name" value="${x.name}" maxlength="60" aria-label="Criterion name"></td>
    <td><input type="text" name="c-target" value="${x.target}" maxlength="120" aria-label="Target"></td>
    <td><input type="text" name="c-note" value="${x.note || ''}" maxlength="240" aria-label="Note"></td>
    <td>${CORE_CRITERIA.includes(x.id) ? html`<span class="muted small">Core</span>` : html`<button class="btn btn-sm btn-ghost" type="button" data-action="row-remove" aria-label="Remove criterion ${i + 1}">Remove</button>`}</td>
  </tr>`;
  const rrow = (x, i) => html`<tr>
    <td><input type="hidden" name="r-id" value="${x.id || ''}"><input type="hidden" name="r-source" value="${x.source || ''}"><input type="text" name="r-text" value="${x.text}" maxlength="120" aria-label="Requirement"></td>
    <td class="muted small">${x.current || ''}</td>
    <td>${CORE_REQUIREMENTS.includes(x.id) ? html`<span class="muted small">Core</span>` : html`<button class="btn btn-sm btn-ghost" type="button" data-action="row-remove" aria-label="Remove requirement ${i + 1}">Remove</button>`}</td>
  </tr>`;
  return html`${head}
  <form class="setup-form criteria-form" data-form="propose-criteria" novalidate>
    ${section('Success criteria', html`<div class="card table-card"><table class="table table-edit"><thead><tr><th>Criterion</th><th>Target</th><th>Note</th><th></th></tr></thead><tbody data-rows="criteria">${criteria.map(row)}</tbody></table></div><button class="btn btn-sm" type="button" data-action="row-add" data-kind="criteria">Add criterion</button>`)}
    ${section('Evidence requirements', html`<div class="card table-card"><table class="table table-edit"><thead><tr><th>Requirement</th><th>Current</th><th></th></tr></thead><tbody data-rows="requirements">${requirements.map(rrow)}</tbody></table></div><button class="btn btn-sm" type="button" data-action="row-add" data-kind="requirements">Add requirement</button>`, { subtitle: 'Measured values stay as they are; "met" is re-evaluated where a threshold changes.' })}
    ${reasonAndSubmit(state, cap, kind, gated, required, acting)}
  </form>
  <template id="row-criteria">${row({ id: '', name: '', target: '', note: '', source: 'Written by hand' }, 0)}</template>
  <template id="row-requirements">${rrow({ id: '', text: '', source: 'Written by hand' }, 0)}</template>`;
}

function reasonAndSubmit(state, cap, kind, gated, required, acting) {
  return html`<div class="card authorize">
    <p class="eyebrow">${gated ? 'Propose' : 'Save'}</p>
    <label class="field field-stack"><span>Reason</span><input type="text" name="reason" maxlength="240" placeholder="Why the bar should change." required></label>
    <p class="muted small">${gated
      ? `Proposing as ${acting.name}, ${acting.role}. The proposal is recorded now; the new version is written only after ${requirementLabel(required)} approve. ${acting.name} cannot approve their own proposal. Rejected proposals are kept in the record.`
      : `Saving as ${acting.name}, ${acting.role}, writes a new version of the ${KIND_TITLE[kind]} for ${cap.name}.`}</p>
    <button class="btn btn-primary btn-block" type="submit">${gated ? 'Submit proposal for sign-off' : 'Save new version'}</button>
  </div>`;
}

// The sign-off screen for one proposal.
export function proposalView(state, capabilityId, proposalId, query) {
  const cap = getCapability(state, capabilityId);
  const p = cap ? getProposal(state, capabilityId, proposalId) : null;
  if (!cap || !p) return html`<div class="page-head"><h1>Proposal not found</h1></div>`;
  const error = query.get('error');
  const acting = actor(state, capabilityId);
  const who = person(acting);
  const elig = approvalEligibility(state, capabilityId, p, acting);
  const r = proposalReadiness(state, capabilityId, p);
  const req = p.required;
  const riskDone = p.approvals.some((a) => a.role === 'risk');
  const status = p.status === 'open' ? badge('decision', 'Awaiting sign-off') : p.status === 'approved' ? badge('pass', 'Approved and applied') : p.status === 'withdrawn' ? badge('neutral', 'Withdrawn') : badge('fail', 'Rejected');

  const before = p.kind === 'contract'
    ? versionList(state, capabilityId, 'contract').find((v) => v.version === p.base.contract)?.value
    : p.kind === 'stakeholders'
      ? versionList(state, capabilityId, 'stakeholders').find((v) => v.version === p.base.stakeholders)?.value
      : { criteria: versionList(state, capabilityId, 'criteria').find((v) => v.version === p.base.criteria)?.value, requirements: versionList(state, capabilityId, 'requirements').find((v) => v.version === p.base.requirements)?.value };
  const stakeholderKey = (list) => (list || []).map((st) => ({ id: st.person, person: person(st.person).name, team: st.team, position: st.position }));
  const diff = p.kind === 'contract'
    ? diffTable(before, p.value)
    : p.kind === 'stakeholders'
      ? diffTable(stakeholderKey(before), stakeholderKey(p.value))
      : html`<h4 class="version-sub">Success criteria</h4>${diffTable(before.criteria, p.value.criteria)}<h4 class="version-sub">Evidence requirements</h4>${diffTable(before.requirements, p.value.requirements)}`;

  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a> · Proposed amendment</p>
      <h1>${p.id}: ${p.kind === 'contract' ? 'Contract' : p.kind === 'stakeholders' ? 'Stakeholders' : 'Success criteria and evidence requirements'}</h1>
      <p class="lede">Proposed by <strong>${personAt(p.proposedByAt, p.proposedBy).name}</strong> on ${fmtDate(p.date)}, against ${p.kind === 'contract' ? `contract v${p.base.contract}` : p.kind === 'stakeholders' ? `stakeholders v${p.base.stakeholders}` : `criteria v${p.base.criteria} and requirements v${p.base.requirements}`}. ${status}</p>
    </div>
  </div>
  ${error ? notice('fail', 'Could not record that', error) : ''}
  ${(() => { const w = proposalWarning(state, capabilityId, p); return w ? warningNotice({ ...w, link: acting === p.proposedBy ? '#withdraw' : '#/people', linkText: acting === p.proposedBy ? 'Withdraw below' : 'People' }) : ''; })()}
  <div class="card">${kv([
    ['Reason', p.reason],
    ['Sign-off needed', html`${badge(p.approvals.length >= req.approvers ? 'pass' : 'neutral', `${p.approvals.length} of ${req.approvers} approver${req.approvers === 1 ? '' : 's'}`)} ${req.riskRequired ? html`<span class="signoff-role">${riskDone ? badge('pass', 'Risk: approved') : badge('neutral', 'Risk: pending')}</span>` : ''} <span class="muted small">${requirementLabel(req)}; the proposer never approves. Risk means the recorded Risk approver right.</span>`],
    ['Eligible approvers', html`<span class="muted small">Frozen when the proposal opened: ${(p.eligible || []).map((k) => person(k).name).join(', ') || 'none'}.</span>`],
    ['Approvals so far', p.approvals.length ? html`<ul class="plain-list">${p.approvals.map((a) => html`<li>${personAt(a.byAt, a.by).name} as ${roleLabel(a.role)}, ${fmtDate(a.date)}${rightsNote(a.byAt)}</li>`)}</ul>` : html`<span class="muted">None yet</span>`],
    ...(p.rejection ? [['Rejected', html`${personAt(p.rejection.byAt, p.rejection.by).name}, ${fmtDate(p.rejection.date)}: ${p.rejection.reason}`]] : []),
    ...(p.withdrawal ? [['Withdrawn', html`${personAt(p.withdrawal.byAt, p.withdrawal.by).name}, ${fmtDate(p.withdrawal.date)}: ${p.withdrawal.reason}`]] : []),
    ...(p.applied ? [['Applied as', Object.entries(p.applied).map(([k, v]) => `${KIND_LABELS[k]} v${v}`).join(', ')]] : []),
  ])}</div>

  ${p.kind === 'criteria' ? section('Readiness under both versions', html`<div class="card readiness-compare">
    <div><span class="fact-label">Now</span><strong>${r.now.met} of ${r.now.total} met</strong>${r.now.unmet.length ? html`<p class="muted small">Unmet: ${r.now.unmet.map((u) => u.text).join('; ')}</p>` : ''}</div>
    <div><span class="fact-label">Under the proposal</span><strong>${r.proposed.met} of ${r.proposed.total} met</strong>${r.proposed.unmet.length ? html`<p class="muted small">Unmet: ${r.proposed.unmet.map((u) => u.text).join('; ')}</p>` : ''}</div>
    ${r.proposed.met > r.now.met ? notice('watch', 'The proposal makes the capability look more ready without new evidence.', 'That can be right (a requirement was mis-set) or a way of moving the bar after seeing the results. Approvers should say which.') : ''}
  </div>`, { subtitle: 'Measured values stay the same; only the thresholds move.' }) : ''}

  ${section('What would change', html`<div class="card">${diff}</div>`)}

  ${p.status === 'open' ? section('Sign-off', html`<div class="card authorize">
    <p class="eyebrow">Acting as ${who.name}, ${who.role}</p>
    ${elig.ok
      ? html`<p>${who.name} can approve as ${roleLabel(elig.role)}.</p><button class="btn btn-primary" data-action="proposal-approve" data-capability="${cap.id}" data-proposal="${p.id}">Approve as ${roleLabel(elig.role)}</button>`
      : html`<p class="muted">${elig.reason}</p>`}
    ${acting === p.proposedBy
      ? html`<form class="line-add reject-form" data-form="withdraw-proposal" data-proposal="${p.id}">
          <input type="text" name="reason" maxlength="240" placeholder="Reason for withdrawing…" aria-label="Withdrawal reason">
          <button class="btn btn-sm" type="submit">Withdraw</button>
        </form>`
      : html`<form class="line-add reject-form" data-form="reject-proposal" data-proposal="${p.id}">
          <input type="text" name="reason" maxlength="240" placeholder="Reason for rejecting…" aria-label="Rejection reason">
          <button class="btn btn-sm btn-danger" type="submit">Reject</button>
        </form>`}
    <p class="muted small">Switch who is acting in the top bar to approve as someone else. The proposer can withdraw; others reject. Both stay in the record.</p>
  </div>`) : ''}`;
}

// Open and closed proposals for one object, shown on its tab.
export function proposalsList(state, capabilityId, kind) {
  const list = capData(state, capabilityId).proposals.filter((p) => p.kind === kind);
  if (!list.length) return '';
  return html`<div class="card"><p class="eyebrow">Proposed amendments</p><ul class="plain-list">${list.slice().reverse().map((p) => html`<li><a href="#/capabilities/${capabilityId}/proposals/${p.id}">${p.id}</a> · ${personAt(p.proposedByAt, p.proposedBy).name}, ${fmtDate(p.date)} · ${p.status === 'open' ? badge('decision', 'Awaiting sign-off') : p.status === 'approved' ? badge('pass', 'Approved') : p.status === 'withdrawn' ? badge('neutral', 'Withdrawn') : badge('fail', 'Rejected')}${proposalWarning(state, capabilityId, p) ? html` ${badge('watch', 'Cannot complete as proposed')}` : ''} <span class="muted small">${p.reason}</span></li>`)}</ul></div>`;
}

export function amendLink(state, capabilityId, kind) {
  const gated = needsSignoff(state, capabilityId, kind);
  const open = openProposal(state, capabilityId, kind);
  if (open) return html`<a class="btn btn-sm" href="#/capabilities/${capabilityId}/proposals/${open.id}">Open proposal ${open.id}</a>`;
  return html`<a class="btn btn-sm" href="#/capabilities/${capabilityId}/amend/${kind}">${gated ? 'Propose amendment' : 'Amend'}</a>`;
}
