import { html, badge, fmtDate, person, personAt, rightsNote, empty, kv, lede } from '../ui.js';
import { getCapability, versionList, VERSIONED_KINDS, KIND_LABELS, SECTION_LABELS } from '../store/index.js';
import { DATA_FIELDS } from '../data/seed.js';
import { diffTable, deviationsView } from './activity.js';
import { contractReviewView } from './contract.js';

// A first version's contents, readably: lists as lists, rows as a table,
// named fields with their labels. Never raw JSON.
const FIELD_LABELS = { ...SECTION_LABELS, dataSeen: 'The AI can access', person: 'Person', team: 'Team', position: 'Position', quote: 'In their words', name: 'Measure', target: 'Target', note: 'Note', text: 'Check', current: 'Current', source: 'Source', met: 'Met', status: 'Status', gap: 'Gap', date: 'Date' };
const HIDDEN = new Set(['id', 'stance']);
const fieldLabel = (k) => FIELD_LABELS[k] || (String(k).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/^./, (c) => c.toUpperCase()));
function cell(key, v) {
  if (v == null || v === '') return html`<span class="muted">none</span>`;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (key === 'person') return person(v).name;
  if (key === 'status') return badge(v);
  if (key === 'dataSeen' && Array.isArray(v)) return v.length ? v.map((f) => (DATA_FIELDS.find((x) => x.id === f) || { label: f }).label).join(', ') : html`<span class="muted">none</span>`;
  return contentsView(v);
}
export function contentsView(value) {
  if (Array.isArray(value)) {
    if (!value.length) return html`<span class="muted">none</span>`;
    if (value.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
      const keys = [...new Set(value.flatMap((x) => Object.keys(x)))].filter((k) => !HIDDEN.has(k));
      return html`<table class="table"><thead><tr>${keys.map((k) => html`<th>${fieldLabel(k)}</th>`)}</tr></thead><tbody>${value.map((x) => html`<tr>${keys.map((k) => html`<td>${cell(k, x[k])}</td>`)}</tr>`)}</tbody></table>`;
    }
    return html`<ul class="plain-list">${value.map((x) => html`<li>${contentsView(x)}</li>`)}</ul>`;
  }
  if (value && typeof value === 'object') return kv(Object.entries(value).filter(([k]) => !HIDDEN.has(k)).map(([k, v]) => [fieldLabel(k), cell(k, v)]));
  return value == null || value === '' ? html`<span class="muted">none</span>` : String(value);
}

// Every version of one versioned object for one capability, newest first.
export function versionsView(state, capabilityId, query) {
  const cap = getCapability(state, capabilityId);
  if (!cap) return html`<div class="page-head"><h1>Capability not found</h1></div>`;
  const kind = VERSIONED_KINDS.includes(query.get('kind')) ? query.get('kind') : 'contract';
  const highlight = Number(query.get('version')) || null;
  const versions = versionList(state, capabilityId, kind).slice().reverse();

  const tabs = html`<nav class="tabs" aria-label="What changed">${VERSIONED_KINDS.map((k) => html`<a class="tab ${k === kind ? 'is-active' : ''}" href="#/capabilities/${cap.id}/versions?kind=${k}">${KIND_LABELS[k]} <span class="muted small">v${versionList(state, capabilityId, k).length}</span></a>`)}</nav>`;

  const items = versions.map((v) => {
    const who = personAt(v.authorAt, v.author);
    return html`<article class="card version ${v.version === highlight ? 'is-highlight' : ''}" id="v${v.version}">
      <div class="version-head">
        <div><span class="eyebrow">${KIND_LABELS[kind]} · version ${v.version}</span><h3>${v.version === 1 ? 'First version' : v.reason}</h3></div>
        <div class="version-badges">${v.version === versions[0].version ? badge('pass', 'In use') : ''}${v.afterEvidence ? badge('watch', 'Changed after results') : ''}${v.tighteningOnly ? html` <span class="badge badge-pass" title="Every change made a target stricter; nothing was added, removed or reworded.">Stricter only, no approval needed</span>` : ''}</div>
      </div>
      ${kv([
        ['Date', fmtDate(v.date)],
        ['Changed by', html`${who.name}${who.role ? html`, ${who.role}` : ''}${rightsNote(v.authorAt)}${v.approvals ? html`<div class="muted small">Approved by ${v.approvals.map((a, i) => html`${i ? ', ' : ''}${personAt(a.byAt, a.by).name}${a.role ? ` (as ${a.role === 'risk' ? 'Risk approver' : a.role === 'owner' ? 'owner' : 'stakeholder'})` : ''}${rightsNote(a.byAt)}`)}</div>` : ''}`],
        ['Why', v.reason],
      ])}
      ${v.review ? contractReviewView(v.review) : ''}
      ${deviationsView(v)}
      ${v.version > 1 ? html`<h4 class="version-sub">What changed from v${v.version - 1}</h4>${diffTable(v.before, v.value)}` : html`<details class="amendment"><summary>Full contents</summary>${contentsView(v.value)}</details>`}
    </article>`;
  });

  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/capabilities">Capabilities</a> · <a href="#/capabilities/${cap.id}">${cap.name}</a></p>
      <h1>History</h1>
      ${lede(html`Every change to ${cap.name}'s ${KIND_LABELS[kind].toLowerCase()}.`, 'Past versions can\'t be edited. Each decision record links to the version that was in use when it was made.')}
    </div>
  </div>
  ${tabs}
  ${items.length ? items : empty('No changes yet.')}`;
}
