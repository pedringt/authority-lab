import * as seed from '../data/seed.js';
import { html, raw, badge, notice, section, person, fmtDateYear } from '../ui.js';
import { getCapability, capData, current, versionList, actor, contractChecks, canFinalizeContract, draftValue, contractSummary, SECTION_KEYS, SECTION_LABELS } from '../store.js';
import { diffTable } from './activity.js';

const SECTION_HELP = {
  may: 'What the AI can do on its own, inside this capability.',
  mustAsk: 'What always needs a person, even after authority expands.',
  mustNever: 'Hard limits. Software enforces these regardless of what the AI recommends.',
  escalation: 'When the AI hands the case to a person instead of producing an output.',
  autoRestriction: 'Measurable triggers that pull authority back automatically. Each needs a number and a time or case window.',
};

export function contractBuilderView(state, capabilityId, query) {
  const cap = getCapability(state, capabilityId);
  if (!cap) return html`<div class="page-head"><h1>Capability not found</h1></div>`;
  const d = capData(state, capabilityId);
  const draft = d.contractDraft;
  const risk = current(state, capabilityId, 'risk');
  const acting = person(actor(state, capabilityId));
  const error = query.get('error');

  if (versionList(state, capabilityId, 'contract').length) {
    return html`<div class="page-head"><div><p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a></p><h1>Contract builder</h1><p class="lede">${cap.name} already has a finalized contract (v${versionList(state, capabilityId, 'contract').length}). Changes to a finalized contract are amendments.</p></div></div>
      ${notice('neutral', 'Nothing to build', 'Read the contract on the capability page. Amendment sign-off arrives with #7.', { link: `#/capabilities/${cap.id}?tab=contract`, linkText: 'Contract' })}`;
  }

  if (!draft) {
    return html`<div class="page-head"><div><p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a> · Setup step 2</p><h1>Contract builder</h1><p class="lede">A starter contract is picked from the risk profile (${risk.impact || 'unknown'} impact, ${(risk.exposure || 'unknown exposure').toLowerCase()}). Seeded suggestions are added from the capability's name and summary, each labelled <strong>Suggested by AI</strong>. You review every suggestion one by one, confirm all five sections, pass the software checks, and a named person finalizes contract v1.</p></div></div>
      ${error ? notice('fail', 'Could not start the draft', error) : ''}
      <div class="card"><p>Starting as <strong>${acting.name}</strong>, ${acting.role}.</p><button class="btn btn-primary" data-action="contract-start" data-capability="${cap.id}">Start from the template</button></div>`;
  }

  const checks = contractChecks(state, capabilityId);
  const blocks = checks.filter((c) => c.level === 'block');
  const warns = checks.filter((c) => c.level === 'warn');
  const pending = draft.lines.filter((l) => l.status === 'pending').length;
  const confirmedCount = SECTION_KEYS.filter((k) => draft.confirmed[k]).length;
  const editing = query.get('edit');
  const value = draftValue(draft);
  const can = canFinalizeContract(state, capabilityId);

  const sections = SECTION_KEYS.map((k) => {
    const lines = draft.lines.filter((l) => l.section === k);
    const active = lines.filter((l) => l.status !== 'rejected' && l.status !== 'removed');
    const rejected = lines.filter((l) => l.status === 'rejected' || l.status === 'removed');
    const sectionPending = lines.filter((l) => l.status === 'pending').length;
    const sectionChecks = checks.filter((c) => c.section === k);
    return html`<section class="card contract-section contract-section-${k} ${draft.confirmed[k] ? 'is-confirmed' : ''}" id="section-${k}">
      <div class="contract-section-head">
        <div><h3>${SECTION_LABELS[k]}</h3><p class="muted small">${SECTION_HELP[k]}</p></div>
        <div>${draft.confirmed[k] ? badge('pass', 'Confirmed') : sectionPending ? badge('watch', `${sectionPending} to review`) : badge('neutral', 'Not confirmed')}</div>
      </div>
      ${sectionChecks.map((c) => notice(c.level === 'block' ? 'fail' : 'watch', c.level === 'block' ? 'Blocks finalize' : 'Check', c.text))}
      <ul class="contract-lines">${active.map((l) => lineView(cap, l, editing === l.id))}</ul>
      ${rejected.length ? html`<details class="rejected"><summary>${rejected.length} rejected or removed (kept in the record)</summary><ul class="contract-lines">${rejected.map((l) => html`<li class="contract-line is-rejected"><span class="line-text">${l.original}</span>${sourceBadge(l)}</li>`)}</ul></details>` : ''}
      <form class="line-add" data-form="add-line-${k}" data-section="${k}">
        <input type="text" name="text" placeholder="Add a line…" maxlength="200" aria-label="Add a line to ${SECTION_LABELS[k]}">
        <button class="btn btn-sm" type="submit">Add</button>
      </form>
      <div class="contract-section-foot">
        ${draft.confirmed[k]
          ? html`<button class="btn btn-sm btn-ghost" data-action="section-unconfirm" data-capability="${cap.id}" data-section="${k}">Unconfirm</button>`
          : html`<button class="btn btn-sm" data-action="section-confirm" data-capability="${cap.id}" data-section="${k}" ${sectionPending ? raw('disabled') : ''}>Confirm section</button>`}
        ${sectionPending ? html`<span class="muted small">Review every suggestion first.</span>` : ''}
      </div>
    </section>`;
  });

  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a> · Setup step 2</p>
      <h1>Contract builder</h1>
      <p class="lede">Template <strong>${draft.templateName}</strong>, picked from the risk profile. ${draft.lines.filter((l) => l.source === 'ai').length} suggestions from the name and summary, labelled "Suggested by AI". Each is accepted, edited or rejected on its own; there is no accept-all. Rejected suggestions stay in the record.</p>
    </div>
  </div>
  ${error ? notice('fail', 'Could not apply that change', error) : ''}
  <div class="card progress-card">
    <div class="progress-facts">
      <div><span class="fact-label">Sections confirmed</span><strong>${confirmedCount} of ${SECTION_KEYS.length}</strong></div>
      <div><span class="fact-label">Suggestions to review</span><strong>${pending}</strong></div>
      <div><span class="fact-label">Blocking checks</span><strong>${blocks.length}</strong></div>
      <div><span class="fact-label">Acting as</span><strong>${acting.name}</strong></div>
    </div>
  </div>
  <div class="contract-builder">${sections}</div>

  ${section('Software checks', html`<div class="card">${checks.length ? html`<ul class="check-list">${checks.map((c) => html`<li>${badge(c.level === 'block' ? 'fail' : 'watch', c.level === 'block' ? 'Blocks' : 'Warning')} ${c.text}${c.section ? html` <span class="muted">(${SECTION_LABELS[c.section]})</span>` : ''}</li>`)}</ul>` : html`<p class="muted">All checks pass.</p>`}</div>`, { subtitle: 'Empty hard limits above Low impact, contradictions, restriction rules without a number or window, and financial capabilities without a value limit all block finalize.' })}

  ${section('Finalize', html`
    <div class="card">
      <p class="eyebrow">Plain-English summary</p>
      <p>${contractSummary(value, cap) || html`<span class="muted">Nothing accepted yet.</span>`}</p>
    </div>
    <div class="card">
      <p class="eyebrow">What changed from the template</p>
      ${diffTable(draft.template, value)}
    </div>
    <div class="card authorize">
      <p class="eyebrow">Human finalization</p>
      <p class="muted small">Finalizing as <strong>${acting.name}</strong>, ${acting.role}, creates contract v1 for ${cap.name}, dated ${fmtDateYear(state.today)}. The contract is enforced by software; later changes are amendments with their own record. This does not change authority: ${cap.name} stays at its current level until a decision is authorized.</p>
      ${can.ok ? '' : html`<ul class="plain-list form-error">${can.blocks.map((b) => html`<li>${b.text}</li>`)}</ul>`}
      <button class="btn btn-primary btn-block" data-action="contract-finalize" data-capability="${cap.id}" ${can.ok ? '' : raw('disabled')}>Finalize contract v1</button>
    </div>`, { subtitle: `${warns.length ? `${warns.length} warning${warns.length === 1 ? '' : 's'} do not block.` : ''}` })}`;
}

function sourceBadge(l) {
  if (l.source === 'ai') return html`<span class="badge badge-insufficient">Suggested by AI${l.status === 'accepted' ? ' · accepted' : l.status === 'edited' ? ' · edited' : l.status === 'rejected' ? ' · rejected' : ''}</span>${l.because ? html`<span class="muted small"> matched "${l.because}"</span>` : ''}`;
  if (l.source === 'template') return html`<span class="badge badge-neutral">Template${l.status === 'edited' ? ' · edited' : l.status === 'removed' ? ' · removed' : ''}</span>`;
  return html`<span class="badge badge-pass">Added</span>`;
}

function lineView(cap, l, editing) {
  if (editing) {
    return html`<li class="contract-line is-editing">
      <form class="line-edit" data-form="edit-line" data-line="${l.id}">
        <input type="text" name="text" value="${l.text}" maxlength="200" aria-label="Edit line">
        <button class="btn btn-sm btn-primary" type="submit">Save</button>
        <a class="btn btn-sm btn-ghost" href="#/capabilities/${cap.id}/contract/build">Cancel</a>
      </form>
    </li>`;
  }
  if (l.status === 'pending') {
    return html`<li class="contract-line is-pending">
      <span class="line-text">${l.text}</span>
      ${sourceBadge(l)}
      <span class="line-actions">
        <button class="btn btn-sm" data-action="suggestion-accept" data-capability="${cap.id}" data-line="${l.id}">Accept</button>
        <a class="btn btn-sm" href="#/capabilities/${cap.id}/contract/build?edit=${l.id}">Edit</a>
        <button class="btn btn-sm btn-ghost" data-action="suggestion-reject" data-capability="${cap.id}" data-line="${l.id}">Reject</button>
      </span>
    </li>`;
  }
  return html`<li class="contract-line">
    <span class="line-text">${l.text}</span>
    ${sourceBadge(l)}
    <span class="line-actions">
      <a class="btn btn-sm btn-ghost" href="#/capabilities/${cap.id}/contract/build?edit=${l.id}">Edit</a>
      ${l.source === 'ai'
        ? html`<button class="btn btn-sm btn-ghost" data-action="suggestion-reject" data-capability="${cap.id}" data-line="${l.id}">Reject</button>`
        : html`<button class="btn btn-sm btn-ghost" data-action="line-remove" data-capability="${cap.id}" data-line="${l.id}">Remove</button>`}
    </span>
  </li>`;
}

// The review behind a finalized contract version, shown on the contract tab
// and the Versions page.
export function contractReviewView(review) {
  if (!review) return '';
  return html`<details class="amendment"><summary>How this contract was built · template "${review.templateName}", ${review.suggestions} AI suggestions (${review.accepted} accepted, ${review.edited} edited, ${review.rejected.length} rejected), ${review.added} added by hand</summary>
    ${review.rejected.length ? html`<p class="fact-label">Rejected suggestions (kept in the record)</p><ul class="contract-lines">${review.rejected.map((r) => html`<li class="contract-line is-rejected"><span class="line-text">${r.text}</span><span class="badge badge-insufficient">Suggested by AI · rejected</span><span class="muted small">${SECTION_LABELS[r.section]}</span></li>`)}</ul>` : ''}
    ${review.removed.length ? html`<p class="fact-label">Template lines removed</p><ul class="contract-lines">${review.removed.map((r) => html`<li class="contract-line is-rejected"><span class="line-text">${r.text}</span><span class="muted small">${SECTION_LABELS[r.section]}</span></li>`)}</ul>` : ''}
    ${review.editedTemplate.length ? html`<p class="fact-label">Template lines edited</p><ul class="contract-lines">${review.editedTemplate.map((r) => html`<li class="contract-line"><span class="line-text"><span class="diff-before">${r.before}</span> → <span class="diff-after">${r.after}</span></span></li>`)}</ul>` : ''}
  </details>`;
}
