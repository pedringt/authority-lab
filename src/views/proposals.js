import * as seed from '../data/seed.js';
import { DATA_FIELDS } from '../data/seed.js';
import { judgmentField, weightField } from './criteria.js';
import { html, raw, badge, notice, section, person, personAt, rightsNote, fmtDate, kv, warningNotice, lede } from '../ui.js';
import { getCapability, capData, current, versionList, actor, needsSignoff, signoffRequirements, requirementLabel, roleLabel, openProposal, getProposal, approvalEligibility, approvalsComplete, proposalReadiness, contractValueChecks, SECTION_KEYS, SECTION_LABELS, CORE_CRITERIA, CORE_REQUIREMENTS, KIND_LABELS, proposalWarning } from '../store/index.js';
import { diffTable } from './activity.js';

// A proposed change's name, and what it changes.
const KIND_TITLE = { criteria: 'Target change', contract: 'Rule change', stakeholders: 'Stakeholder change' };
const KIND_OBJECT = { criteria: 'Targets and Requirements', contract: 'rules', stakeholders: 'stakeholders' };

// Propose (or, before the gate, apply) a change to a locked object.
export function proposeView(state, capabilityId, kind, query) {
  const cap = getCapability(state, capabilityId);
  if (!cap) return html`<div class="page-head"><h1>Capability not found</h1></div>`;
  if (kind === 'stakeholders') return html`<div class="page-head"><div><p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a></p><h1>Change the stakeholders</h1>${lede('Stakeholders are changed from the stakeholder list.', 'Once results exist, adding or removing someone, or changing their team, needs approval. Updating someone\'s position or reasoning saves straight away.')}</div></div>${notice('neutral', 'Change stakeholders from the list', 'We\'ll tell you there if the change needs approval.', { link: `#/capabilities/${cap.id}/stakeholders/edit`, linkText: 'Manage stakeholders' })}`;
  if (!['criteria', 'contract'].includes(kind)) return html`<div class="page-head"><h1>Page not found</h1></div>`;
  const error = query.get('error');
  const acting = person(actor(state, capabilityId));
  const gated = needsSignoff(state, capabilityId, kind);
  const required = signoffRequirements(state, capabilityId, actor(state, capabilityId));
  const open = openProposal(state, capabilityId, kind);
  const hasContract = versionList(state, capabilityId, 'contract').length > 0;
  const hasCriteria = versionList(state, capabilityId, 'criteria').length > 0;

  if (kind === 'contract' && !hasContract) return html`<div class="page-head"><div><h1>Change the rules</h1><p class="lede">${cap.name} doesn't have rules yet.</p></div></div>${notice('neutral', 'Nothing to change yet', 'Set up the rules first.', { link: `#/capabilities/${cap.id}/contract/build`, linkText: 'Set up rules' })}`;
  if (kind === 'criteria' && !hasCriteria) return html`<div class="page-head"><div><h1>Change the targets</h1><p class="lede">${cap.name} doesn't have saved targets yet.</p></div></div>${notice('neutral', 'Nothing to change yet', 'Set the targets first.', { link: `#/capabilities/${cap.id}/criteria/edit`, linkText: 'Set targets' })}`;
  if (open) return html`<div class="page-head"><div><p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a></p><h1>Change the ${KIND_OBJECT[kind]}</h1></div></div>${notice('watch', `A ${KIND_TITLE[kind].toLowerCase()} already needs approval`, `${personAt(open.proposedByAt, open.proposedBy).name} proposed it on ${fmtDate(open.date)}. It has to be approved, rejected or withdrawn before anyone proposes another.`, { link: `#/capabilities/${cap.id}/proposals/${open.id}`, linkText: 'Review the change' })}`;

  const head = html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a> · ${gated ? `Change request: ${KIND_TITLE[kind].toLowerCase()}` : KIND_TITLE[kind]}</p>
      <h1>Change the ${KIND_OBJECT[kind]}</h1>
      <p class="lede">${gated
        ? kind === 'criteria'
          ? `These targets can't be changed directly now that results exist. Submit the change for review. ${requirementLabel(required)} You can't approve your own change.`
          : `The AI is already in use (a pilot has started), so rule changes need approval. ${requirementLabel(required)} You can't approve your own change.`
        : `No approval needed yet: ${kind === 'criteria' ? 'no results exist yet' : 'no pilot has started'}. Your change saves straight away. Changes are kept in history.`}</p>
    </div>
  </div>
  ${error ? (error.includes(' | ')
    ? html`<div class="notice notice-fail" role="alert"><div class="notice-body"><strong>${error.split(' | ')[0]}</strong><ul class="plain-list">${error.split(' | ').slice(1).filter(Boolean).map((t) => html`<li>${t}</li>`)}</ul></div></div>`
    : notice('fail', 'Couldn\'t submit the change', error)) : ''}`;

  if (kind === 'contract') {
    const c = current(state, capabilityId, 'contract');
    const currentChecks = contractValueChecks(state, capabilityId, c);
    return html`${head}
    <div class="notice notice-neutral" role="status"><div class="notice-body"><strong>Your rules need to pass the same checks as when they were set up</strong><p>You can't submit if:</p><ul class="plain-list"><li>"${SECTION_LABELS.mustNever}" is empty, for anything above Low impact</li><li>the same line appears under "${SECTION_LABELS.may}" and under "${SECTION_LABELS.mustAsk}" or "${SECTION_LABELS.mustNever}"</li><li>an "${SECTION_LABELS.autoRestriction}" line has no number or time window</li><li>a financial AI has no money limit under "${SECTION_LABELS.may}" or "${SECTION_LABELS.mustAsk}"</li></ul></div></div>
    ${currentChecks.filter((x) => x.level === 'block').length ? notice('watch', 'Your current rules don\'t pass these checks yet. Fix them in this change.', currentChecks.filter((x) => x.level === 'block').map((x) => x.text).join(' ')) : ''}
    <form class="setup-form" data-form="propose-contract" novalidate>
      ${SECTION_KEYS.map((k) => html`<div class="card"><label class="field field-stack"><span>${SECTION_LABELS[k]} <span class="muted small">one item per line</span></span><textarea name="${k}" rows="${Math.max(3, c[k].length + 1)}">${c[k].join('\\n')}</textarea></label></div>`)}
      ${dataSeenFieldset(c)}
      ${reasonAndSubmit(state, cap, kind, gated, required, acting)}
    </form>`;
  }

  const criteria = current(state, capabilityId, 'criteria');
  const requirements = current(state, capabilityId, 'requirements');
  const row = (x, i) => html`<tr>
    <td><input type="hidden" name="c-id" value="${x.id || ''}"><input type="hidden" name="c-requirement" value="${x.requirement || ''}"><input type="hidden" name="c-source" value="${x.source || ''}"><input type="hidden" name="c-current" value="${x.current || ''}"><input type="hidden" name="c-status" value="${x.status || ''}"><input type="text" name="c-name" value="${x.name}" maxlength="60" aria-label="Measure"></td>
    <td><input type="text" name="c-target" value="${x.target}" maxlength="120" aria-label="Target"></td>
    <td><input type="text" name="c-note" value="${x.note || ''}" maxlength="240" aria-label="Note"></td>
    <td>${CORE_CRITERIA.includes(x.id) ? html`<span class="muted small" title="You can change the threshold but not remove this row.">Required</span>` : html`<button class="btn btn-sm btn-ghost" type="button" data-action="row-remove" aria-label="Remove target ${i + 1}">Remove</button>`}</td>
  </tr>`;
  const rrow = (x, i) => html`<tr>
    <td><input type="hidden" name="r-id" value="${x.id || ''}"><input type="hidden" name="r-kind" value="${x.kind || ''}"><input type="hidden" name="r-source" value="${x.source || ''}"><input type="text" name="r-text" value="${x.text}" maxlength="120" aria-label="Requirement">${judgmentField(x)}${weightField(x)}</td>
    <td class="muted small">${x.current || ''}</td>
    <td>${CORE_REQUIREMENTS.includes(x.id) ? html`<span class="muted small" title="You can change the number but not remove this row.">Required</span>` : html`<button class="btn btn-sm btn-ghost" type="button" data-action="row-remove" aria-label="Remove check ${i + 1}">Remove</button>`}</td>
  </tr>`;
  return html`${head}
  <form class="setup-form criteria-form" data-form="propose-criteria" novalidate>
    ${section('Targets', html`<div class="card table-card"><table class="table table-edit"><thead><tr><th>Measure</th><th>Target</th><th>Note</th><th></th></tr></thead><tbody data-rows="criteria">${criteria.map(row)}</tbody></table></div><button class="btn btn-sm" type="button" data-action="row-add" data-kind="criteria">Add target</button>`)}
    ${section('Requirements', html`<div class="card table-card"><table class="table table-edit"><thead><tr><th>Requirement</th><th>Current</th><th></th></tr></thead><tbody data-rows="requirements">${requirements.map(rrow)}</tbody></table></div><button class="btn btn-sm" type="button" data-action="row-add" data-kind="requirements">Add Requirement</button>`, { subtitle: 'What we need before expanding. Current results don\'t change; if you change a threshold, we re-check whether it\'s met.' })}
    ${reasonAndSubmit(state, cap, kind, gated, required, acting)}
  </form>
  <template id="row-criteria">${row({ id: '', name: '', target: '', note: '', source: 'Written by hand' }, 0)}</template>
  <template id="row-requirements">${rrow({ id: '', text: '', source: 'Written by hand' }, 0)}</template>`;
}

// The contract's structured data section (A2): which fields tool results may
// show the AI. Restricted fields are shown but can't be chosen.
function dataSeenFieldset(c) {
  const seen = new Set(c.dataSeen || []);
  return html`<div class="card"><fieldset class="data-seen"><legend>The AI can access <span class="muted small">The AI only sees these fields, even when a tool returns more.</span></legend>
    <div class="check-grid">${DATA_FIELDS.map((f) => html`<label class="check"><input type="checkbox" name="dataSeen" value="${f.id}" ${seen.has(f.id) ? raw('checked') : ''} ${f.restricted ? raw('disabled') : ''}><span>${f.label}${f.restricted ? html` <span class="muted small">(never shown to the AI)</span>` : ''}</span></label>`)}</div>
  </fieldset></div>`;
}

function reasonAndSubmit(state, cap, kind, gated, required, acting) {
  return html`<div class="card authorize">
    <p class="eyebrow">${gated ? 'Submit for approval' : 'Save'}</p>
    <label class="field field-stack"><span>Why are you making this change?</span><input type="text" name="reason" maxlength="240" placeholder="${kind === 'criteria' ? 'e.g. The sample size was set too low for this volume.' : 'e.g. Fraud-flagged accounts should always go to a person.'}" required></label>
    <p class="muted small">${gated
      ? `You're submitting as ${acting.name}, ${acting.role}. Nothing changes until it is approved. ${requirementLabel(required)} You can't approve your own change. Approved, rejected and withdrawn changes are all kept in history.`
      : `Saving as ${acting.name}, ${acting.role}. Changes are kept in history.`}</p>
    ${gated && kind === 'criteria' ? html`<p class="small tighten-hint"><strong>Only making targets stricter?</strong> If every change raises a minimum, lowers a maximum or asks for more cases, and nothing is added, removed, renamed or reworded, it saves straight away without approval. This applies if you're the owner or a listed stakeholder and no decision about more authority is open. Any other change needs approval.</p>` : ''}
    <button class="btn btn-primary btn-block" type="submit">${gated ? 'Submit for approval' : 'Save changes'}</button>
  </div>`;
}

// The sign-off screen for one proposal.
export function proposalView(state, capabilityId, proposalId, query) {
  const cap = getCapability(state, capabilityId);
  const p = cap ? getProposal(state, capabilityId, proposalId) : null;
  if (!cap || !p) return html`<div class="page-head"><h1>Change not found</h1></div>`;
  const error = query.get('error');
  const acting = actor(state, capabilityId);
  const who = person(acting);
  const elig = approvalEligibility(state, capabilityId, p, acting);
  const r = proposalReadiness(state, capabilityId, p);
  const req = p.required;
  const riskDone = p.approvals.some((a) => a.role === 'risk');
  const status = p.status === 'open' ? badge('decision', 'Approval needed') : p.status === 'approved' ? badge('pass', 'Approved and in effect') : p.status === 'withdrawn' ? badge('neutral', 'Withdrawn') : badge('fail', 'Rejected');

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
      : html`<h4 class="version-sub">Targets</h4>${diffTable(before.criteria, p.value.criteria)}<h4 class="version-sub">Requirements</h4>${diffTable(before.requirements, p.value.requirements)}`;

  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a> · Change request ${p.id}</p>
      <h1>${KIND_TITLE[p.kind]}</h1>
      <p class="lede">${status} Proposed by <strong>${personAt(p.proposedByAt, p.proposedBy).name}</strong> on ${fmtDate(p.date)}.</p>
    </div>
  </div>
  ${error ? notice('fail', 'Couldn\'t save that', error) : ''}
  ${p.needsSignoffBecause && p.needsSignoffBecause.length ? notice('neutral', 'Why this needs sign-off', html`<ul class="plain-list">${p.needsSignoffBecause.map((x) => html`<li>${x}</li>`)}</ul><p class="small">Completing or strengthening the bar (linking evidence a row didn't have, adding people, Requirements or Boundaries, or tightening a bar) is recorded without approval. Changing or loosening it isn't.</p>`) : ''}
  ${p.shortcutDeclined ? notice('neutral', 'This change could be recorded without approval, but it still needs it', p.shortcutDeclined) : ''}
  ${(() => { const w = proposalWarning(state, capabilityId, p); return w ? warningNotice({ ...w, link: acting === p.proposedBy ? '#withdraw' : '#/people', linkText: acting === p.proposedBy ? 'Withdraw it' : 'Manage people' }) : ''; })()}
  <div class="card">${kv([
    ['Why', p.reason],
    ['Approvals', html`${badge(p.approvals.length >= req.approvers ? 'pass' : 'neutral', `${p.approvals.length} of ${req.approvers} approval${req.approvers === 1 ? '' : 's'}`)} ${req.riskRequired ? html`<span class="signoff-role">${riskDone ? badge('pass', 'Risk approved') : badge('neutral', 'Risk approval still needed')}</span>` : ''} <span class="muted small">${requirementLabel(req)} The person who proposed it can't approve it. Risk approval comes from someone with the Risk approver right (set on People).</span>`],
    ['Who can approve', html`<span class="muted small">${(p.eligible || []).map((k) => person(k).name).join(', ') || 'No one'}. This list was fixed when the change was requested.</span>`],
    ['Approvals so far', p.approvals.length ? html`<ul class="plain-list">${p.approvals.map((a) => html`<li>${personAt(a.byAt, a.by).name} as ${roleLabel(a.role)}, ${fmtDate(a.date)}${rightsNote(a.byAt)}</li>`)}</ul>` : html`<span class="muted">None yet</span>`],
    ...(p.rejection ? [['Rejected', html`${personAt(p.rejection.byAt, p.rejection.by).name}, ${fmtDate(p.rejection.date)}: ${p.rejection.reason}`]] : []),
    ...(p.withdrawal ? [['Withdrawn', html`${personAt(p.withdrawal.byAt, p.withdrawal.by).name}, ${fmtDate(p.withdrawal.date)}: ${p.withdrawal.reason}`]] : []),
    ...(p.applied ? [['Now in effect as', Object.entries(p.applied).map(([k, v]) => `${KIND_LABELS[k]} v${v}`).join(', ')]] : []),
  ])}</div>

  ${p.kind === 'criteria' ? section('Ready for a decision? Before and after this change', html`<div class="card readiness-compare">
    <div><span class="fact-label">Today</span><strong>${r.now.met} of ${r.now.total} Requirements met</strong>${r.now.unmet.length ? html`<p class="muted small">Not met: ${r.now.unmet.map((u) => u.text).join('; ')}</p>` : ''}</div>
    <div><span class="fact-label">If approved</span><strong>${r.proposed.met} of ${r.proposed.total} Requirements met</strong>${r.proposed.unmet.length ? html`<p class="muted small">Not met: ${r.proposed.unmet.map((u) => u.text).join('; ')}</p>` : ''}</div>
    ${r.proposed.met > r.now.met ? notice('watch', 'This change makes the AI look more ready, with no new evidence.', 'That can be fine if a check was set wrong. It can also be moving the goalposts after seeing the results. Approve only if you are satisfied it is the first; otherwise reject it and say why.') : ''}
  </div>`, { subtitle: 'Results stay the same; only the thresholds change.' }) : ''}

  ${section('What would change', html`<div class="card">${diff}</div>`)}

  ${p.status === 'open' ? section('Approval', html`<div class="card authorize">
    <p class="eyebrow">Demo as ${who.name}, ${who.role}</p>
    ${elig.ok
      ? html`<p>${who.name} can approve as ${roleLabel(elig.role)}.</p>${p.required.riskAck ? html`<label class="check"><input type="checkbox" id="risk-ack-${p.id}" data-risk-ack="${p.id}"><span>I've considered what could go wrong with this change, and I accept the risk.</span></label>` : ''}<button class="btn btn-primary" data-action="proposal-approve" data-capability="${cap.id}" data-proposal="${p.id}">Approve</button>`
      : html`<p class="muted">${elig.reason}</p>`}
    ${acting === p.proposedBy
      ? html`<form class="line-add reject-form" data-form="withdraw-proposal" data-proposal="${p.id}">
          <input type="text" name="reason" maxlength="240" placeholder="Why are you withdrawing it?" aria-label="Withdrawal reason">
          <button class="btn btn-sm" type="submit">Withdraw</button>
        </form>`
      : html`<form class="line-add reject-form" data-form="reject-proposal" data-proposal="${p.id}">
          <input type="text" name="reason" maxlength="240" placeholder="Why are you rejecting it?" aria-label="Rejection reason">
          <button class="btn btn-sm btn-danger" type="submit">Reject</button>
        </form>`}
    <p class="muted small">To approve as someone else, switch the person at the top of the page. The person who requested a change can withdraw it; anyone else who can approve it can reject it. Both are kept in history.</p>
  </div>`) : ''}`;
}

// Open and closed proposals for one object, shown on its tab.
export function proposalsList(state, capabilityId, kind) {
  const list = capData(state, capabilityId).proposals.filter((p) => p.kind === kind);
  if (!list.length) return '';
  return html`<div class="card"><p class="eyebrow">Change requests</p><ul class="plain-list">${list.slice().reverse().map((p) => html`<li><a href="#/capabilities/${capabilityId}/proposals/${p.id}">${p.id}</a> · ${personAt(p.proposedByAt, p.proposedBy).name}, ${fmtDate(p.date)} · ${p.status === 'open' ? badge('decision', 'Approval needed') : p.status === 'approved' ? badge('pass', 'Approved') : p.status === 'withdrawn' ? badge('neutral', 'Withdrawn') : badge('fail', 'Rejected')}${proposalWarning(state, capabilityId, p) ? html` ${badge('watch', 'Can no longer be approved')}` : ''} <span class="muted small">${p.reason}</span></li>`)}</ul></div>`;
}

export function amendLink(state, capabilityId, kind) {
  const gated = needsSignoff(state, capabilityId, kind);
  const open = openProposal(state, capabilityId, kind);
  if (open) return html`<a class="btn btn-sm" href="#/capabilities/${capabilityId}/proposals/${open.id}">Open the change request</a>`;
  return html`<a class="btn btn-sm" href="#/capabilities/${capabilityId}/amend/${kind}">${gated ? 'Request a change' : 'Edit'}</a>`;
}
