import { html, badge, fmtDateYear, person, personAt, rightsNote, empty, kv } from '../ui.js';
import { getCapability, versionList, VERSIONED_KINDS, KIND_LABELS } from '../store.js';
import { diffTable, deviationsView } from './activity.js';
import { contractReviewView } from './contract.js';

// Every version of one versioned object for one capability, newest first.
export function versionsView(state, capabilityId, query) {
  const cap = getCapability(state, capabilityId);
  if (!cap) return html`<div class="page-head"><h1>Capability not found</h1></div>`;
  const kind = VERSIONED_KINDS.includes(query.get('kind')) ? query.get('kind') : 'contract';
  const highlight = Number(query.get('version')) || null;
  const versions = versionList(state, capabilityId, kind).slice().reverse();

  const tabs = html`<nav class="tabs" aria-label="Versioned objects">${VERSIONED_KINDS.map((k) => html`<a class="tab ${k === kind ? 'is-active' : ''}" href="#/capabilities/${cap.id}/versions?kind=${k}">${KIND_LABELS[k]} <span class="muted small">v${versionList(state, capabilityId, k).length}</span></a>`)}</nav>`;

  const items = versions.map((v) => {
    const who = personAt(v.authorAt, v.author);
    return html`<article class="card version ${v.version === highlight ? 'is-highlight' : ''}" id="v${v.version}">
      <div class="version-head">
        <div><span class="eyebrow">${KIND_LABELS[kind]} · version ${v.version}</span><h3>${v.version === 1 ? 'Initial version' : v.reason}</h3></div>
        <div class="version-badges">${v.version === versions[0].version ? badge('pass', 'Current') : ''}${v.afterEvidence ? badge('watch', 'After evidence') : ''}</div>
      </div>
      ${kv([
        ['Written', fmtDateYear(v.date)],
        ['Author', html`${who.name}${who.role ? html`, ${who.role}` : ''}${rightsNote(v.authorAt)}${v.approvals ? html`<div class="muted small">Approved by ${v.approvals.map((a, i) => html`${i ? ', ' : ''}${personAt(a.byAt, a.by).name}${a.role ? ` (as ${a.role === 'risk' ? 'Risk approver' : a.role === 'owner' ? 'owner' : 'stakeholder'})` : ''}${rightsNote(a.byAt)}`)}</div>` : ''}`],
        ['Reason', v.reason],
      ])}
      ${v.review ? contractReviewView(v.review) : ''}
      ${deviationsView(v)}
      ${v.version > 1 ? html`<h4 class="version-sub">What changed from v${v.version - 1}</h4>${diffTable(v.before, v.value)}` : html`<details class="amendment"><summary>Contents</summary><pre class="version-raw">${JSON.stringify(v.value, null, 2)}</pre></details>`}
    </article>`;
  });

  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/capabilities">Capabilities</a> · <a href="#/capabilities/${cap.id}">${cap.name}</a></p>
      <h1>Versions</h1>
      <p class="lede">Every version of the ${cap.name} ${KIND_LABELS[kind].toLowerCase()}. Versions are written, never edited. Decision records name the version that was in force when they were made.</p>
    </div>
  </div>
  ${tabs}
  ${items.length ? items : empty('No versions recorded.')}`;
}
