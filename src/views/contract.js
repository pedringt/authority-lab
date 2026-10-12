import * as seed from '../data/seed.js';
import { html, raw, badge, notice, section, person, fmtDate, lede } from '../ui.js';
import { getCapability, capData, current, versionList, actor, contractChecks, canFinalizeContract, draftValue, contractSummary, SECTION_KEYS, SECTION_LABELS } from '../store/index.js';
import { diffTable } from './activity.js';

const SECTION_HELP = {
  may: 'What the AI can do on its own, inside this capability.',
  mustAsk: 'What always needs a person, even after the AI gets more authority.',
  mustNever: 'Hard limits. Software blocks these whatever the AI suggests.',
  escalation: 'When the AI should stop and hand the case to a person.',
  autoRestriction: 'Measurable limits that move the AI back automatically. Each needs a number and a time period or number of cases.',
};

export function contractBuilderView(state, capabilityId, query) {
  const cap = getCapability(state, capabilityId);
  if (!cap) return html`<div class="page-head"><h1>We couldn't find that capability.</h1></div>`;
  const d = capData(state, capabilityId);
  const draft = d.contractDraft;
  const risk = current(state, capabilityId, 'risk');
  const acting = person(actor(state, capabilityId));
  const error = query.get('error');

  if (versionList(state, capabilityId, 'contract').length) {
    return html`<div class="page-head"><div><p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a></p><h1>Set up rules</h1><p class="lede">${cap.name} already has rules. To change them, propose a rule change; it needs approval.</p></div></div>
      ${notice('neutral', 'Rules are already set', 'See them on the capability\'s Rules tab, where you can also propose a change.', { link: `#/capabilities/${cap.id}?tab=rules`, linkText: 'See rules' })}`;
  }

  if (!draft) {
    return html`<div class="page-head"><div><p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a> · Setup step 2</p><h1>Set up rules</h1>${lede(html`We'll start you with rules suited to this risk level (${risk.impact || 'unknown'} impact, ${(risk.exposure || 'unknown exposure').toLowerCase()}).`, html`We also add suggestions based on the capability's name and summary, each marked <strong>Suggested by AI</strong>. Review each one, confirm every section, fix anything the checks flag, and then a named person saves the rules.`)}</div></div>
      ${error ? notice('fail', 'We couldn\'t start the rules', error) : ''}
      <div class="card"><p>Starting as <strong>${acting.name}</strong>, ${acting.role}.</p><button class="btn btn-primary" data-action="contract-start" data-capability="${cap.id}">Start with suggested rules</button></div>`;
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
      ${sectionChecks.map((c) => notice(c.level === 'block' ? 'fail' : 'watch', c.level === 'block' ? 'Must fix before saving' : 'Check', c.text))}
      <ul class="contract-lines">${active.map((l) => lineView(cap, l, editing === l.id))}</ul>
      ${rejected.length ? html`<details class="rejected"><summary>${rejected.length} rejected or removed (kept in history)</summary><ul class="contract-lines">${rejected.map((l) => html`<li class="contract-line is-rejected"><span class="line-text">${l.original}</span>${sourceBadge(l)}</li>`)}</ul></details>` : ''}
      <form class="line-add" data-form="add-line-${k}" data-section="${k}">
        <input type="text" name="text" placeholder="Add a rule…" maxlength="200" aria-label="Add a rule to ${SECTION_LABELS[k]}">
        <button class="btn btn-sm" type="submit">Add</button>
      </form>
      <div class="contract-section-foot">
        ${draft.confirmed[k]
          ? html`<button class="btn btn-sm btn-ghost" data-action="section-unconfirm" data-capability="${cap.id}" data-section="${k}">Undo confirm</button>`
          : html`<button class="btn btn-sm" data-action="section-confirm" data-capability="${cap.id}" data-section="${k}" ${sectionPending ? raw('disabled') : ''}>Confirm section</button>`}
        ${sectionPending ? html`<span class="muted small">Review every suggestion first.</span>` : ''}
      </div>
    </section>`;
  });

  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a> · Setup step 2</p>
      <h1>Set up rules</h1>
      ${lede(html`Starting rules: <strong>${draft.templateName}</strong>, suited to this risk level.`, html`${draft.lines.filter((l) => l.source === 'ai').length} suggestions are based on the name and summary, marked "Suggested by AI". Accept, edit or reject each one; there's no accept-all, on purpose. Rejected suggestions are kept in history.`)}
    </div>
  </div>
  ${error ? notice('fail', 'We couldn\'t make that change', error) : ''}
  <div class="card progress-card">
    <div class="progress-facts">
      <div><span class="fact-label">Sections confirmed</span><strong>${confirmedCount} of ${SECTION_KEYS.length}</strong></div>
      <div><span class="fact-label">Suggestions to review</span><strong>${pending}</strong></div>
      <div><span class="fact-label">Issues to fix</span><strong>${blocks.length}</strong></div>
      <div><span class="fact-label">Acting as</span><strong>${acting.name}</strong></div>
    </div>
  </div>
  <div class="contract-builder">${sections}</div>

  ${section('Checks', html`<div class="card">${checks.length ? html`<ul class="check-list">${checks.map((c) => html`<li>${badge(c.level === 'block' ? 'fail' : 'watch', c.level === 'block' ? 'Must fix' : 'Warning')} ${c.text}${c.section ? html` <span class="muted">(${SECTION_LABELS[c.section]})</span>` : ''}</li>`)}</ul>` : html`<p class="muted">All checks passed.</p>`}</div>`, { subtitle: 'You can\'t save until these are fixed: an empty "The AI must never" or "Authority is reduced automatically when" section (unless impact is Low), rules that contradict each other, safety limits without a number or time period, and a financial capability without a spending limit.' })}

  ${section('Save the rules', html`
    <div class="card">
      <p class="eyebrow">Summary</p>
      <p>${contractSummary(value, cap) || html`<span class="muted">Nothing accepted yet.</span>`}</p>
    </div>
    <div class="card">
      <p class="eyebrow">What you changed from the suggested rules</p>
      ${diffTable(draft.template, value)}
    </div>
    <div class="card authorize">
      <p class="eyebrow">Approve the rules</p>
      <p class="muted small">Saving as <strong>${acting.name}</strong>, ${acting.role}, on ${fmtDate(state.today)}. This doesn't change what the AI is allowed to do yet: ${cap.name} stays at its current level until someone makes an authority decision. Software will check every action against these rules. Later changes need approval, and changes are kept in history.</p>
      ${can.ok ? '' : html`<ul class="plain-list form-error">${can.blocks.map((b) => html`<li>${b.text}</li>`)}</ul>`}
      <button class="btn btn-primary btn-block" data-action="contract-finalize" data-capability="${cap.id}" ${can.ok ? '' : raw('disabled')}>Save rules</button>
    </div>`, { subtitle: `${warns.length ? `${warns.length} warning${warns.length === 1 ? '' : 's'} won't stop you saving.` : ''}` })}`;
}

function sourceBadge(l) {
  if (l.source === 'ai') return html`<span class="badge badge-insufficient">Suggested by AI${l.status === 'accepted' ? ' · accepted' : l.status === 'edited' ? ' · edited' : l.status === 'rejected' ? ' · rejected' : ''}</span>${l.because ? html`<span class="muted small"> because it mentions "${l.because}"</span>` : ''}`;
  if (l.source === 'template') return html`<span class="badge badge-neutral">Suggested rule${l.status === 'edited' ? ' · edited' : l.status === 'removed' ? ' · removed' : ''}</span>`;
  return html`<span class="badge badge-pass">Added by you</span>`;
}

function lineView(cap, l, editing) {
  if (editing) {
    return html`<li class="contract-line is-editing">
      <form class="line-edit" data-form="edit-line" data-line="${l.id}">
        <input type="text" name="text" value="${l.text}" maxlength="200" aria-label="Edit rule">
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

// How the rules were first set up, shown on the Rules tab and the History
// (versions) page.
export function contractReviewView(review) {
  if (!review) return '';
  return html`<details class="amendment"><summary>How these rules were set up · started from "${review.templateName}", ${review.suggestions} AI suggestions (${review.accepted} accepted, ${review.edited} edited, ${review.rejected.length} rejected), ${review.added} added by hand</summary>
    ${review.rejected.length ? html`<p class="fact-label">Rejected suggestions (kept in history)</p><ul class="contract-lines">${review.rejected.map((r) => html`<li class="contract-line is-rejected"><span class="line-text">${r.text}</span><span class="badge badge-insufficient">Suggested by AI · rejected</span><span class="muted small">${SECTION_LABELS[r.section]}</span></li>`)}</ul>` : ''}
    ${review.removed.length ? html`<p class="fact-label">Suggested rules removed</p><ul class="contract-lines">${review.removed.map((r) => html`<li class="contract-line is-rejected"><span class="line-text">${r.text}</span><span class="muted small">${SECTION_LABELS[r.section]}</span></li>`)}</ul>` : ''}
    ${review.editedTemplate.length ? html`<p class="fact-label">Suggested rules edited</p><ul class="contract-lines">${review.editedTemplate.map((r) => html`<li class="contract-line"><span class="line-text"><span class="diff-before">${r.before}</span> → <span class="diff-after">${r.after}</span></span></li>`)}</ul>` : ''}
  </details>`;
}
