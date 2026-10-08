// Small rendering helpers. `html` escapes interpolated values; wrap trusted
// markup in `raw()` to pass it through. Arrays are joined.

import { STATUS_LABELS, AUTHORITY_LEVELS, TODAY, people as seedPeople } from './data/seed.js';
import { authorityLabel } from './store/index.js';

export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s));

function render(value) {
  if (value == null || value === false) return '';
  if (value instanceof Raw) return value.s;
  if (Array.isArray(value)) return value.map(render).join('');
  return esc(value);
}

export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += render(values[i]);
  });
  return new Raw(out);
}

// One date format everywhere: "Oct 7", with the year only when it is not the
// current year ("Dec 12, 2025"). The current year is the workspace's today,
// which main.js sets from state on every render.
let today = TODAY;
export function setToday(iso) { today = iso || TODAY; }

export function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return y === Number(today.slice(0, 4)) ? `${months[m - 1]} ${d}` : `${months[m - 1]} ${d}, ${y}`;
}

// The roster the helpers resolve people against. main.js sets it from state
// on every render; tests and node renders get the seed unless they set one.
let roster = seedPeople;
export function setPeople(map) { roster = map || seedPeople; }

export function person(key) {
  if (key === 'system') return { name: 'Software rule', role: 'Automatic restriction', team: 'System' };
  return roster[key] || { name: key, role: '', team: '' };
}

// A person as a record saved them. Records written before snapshots existed
// fall back to the current roster.
export function personAt(snapshot, key) {
  if (snapshot) return { name: snapshot.name, role: snapshot.title, team: snapshot.team, rights: snapshot.rights || {}, snapshot: true };
  return { ...person(key), rights: {}, snapshot: false };
}

// "Risk approver at the time" style note for an approval or author snapshot.
export function rightsNote(snapshot) {
  if (!snapshot || !snapshot.rights) return '';
  const r = [];
  if (snapshot.rights.riskApprover) r.push('Risk approver');
  if (snapshot.rights.workspaceAdmin) r.push('workspace admin');
  return r.length ? html`<span class="muted small"> · ${r.join(', ')} at the time</span>` : '';
}

// Status tokens: pass | watch | fail | insufficient | restricted | decision | neutral
const STATUS_WORDS = {
  pass: 'Pass',
  watch: 'Watch',
  fail: 'Fail',
  insufficient: 'Insufficient evidence',
  restricted: 'Restricted',
  decision: 'Decision required',
  neutral: '',
};

export function badge(status, label) {
  const text = label != null ? label : STATUS_WORDS[status] || status;
  return html`<span class="badge badge-${status}">${text}</span>`;
}

export function capStatusBadge(status) {
  const tone = {
    setup: 'neutral',
    stable: 'pass',
    pilot: 'neutral',
    'decision-required': 'decision',
    monitoring: 'watch',
    restricted: 'restricted',
    'review-required': 'fail',
    'not-delegated': 'neutral',
    suspended: 'restricted',
    redesign: 'restricted',
  }[status] || 'neutral';
  const label = STATUS_LABELS[status] || { suspended: 'Suspended', redesign: 'In redesign' }[status] || status;
  return badge(tone, label);
}

// The tooltip on every authority level: what the level lets the AI do.
export function levelTip(level) {
  const l = AUTHORITY_LEVELS[level];
  return l ? `Level ${l.level}, ${l.name}: ${l.description}` : '';
}

// An authority label in running text or a table cell, with the level tooltip.
export function authorityText(auth, opts) {
  return html`<span class="has-tip" title="${levelTip(auth.level)}">${authorityLabel(auth, opts)}</span>`;
}

export function authorityBadge(auth) {
  const tone = auth.level >= 3 ? 'authority-act' : auth.level === 0 ? 'authority-none' : 'authority-human';
  return html`<span class="authority ${tone}" title="${levelTip(auth.level)}">${authorityLabel(auth)}</span>`;
}

export function levelScale(current, proposed) {
  return html`<ol class="level-scale" aria-label="Authority levels">${AUTHORITY_LEVELS.map((l) => {
    const cls = [
      'level-step',
      current && l.level === current.level ? 'is-current' : '',
      proposed && l.level === proposed.level ? 'is-proposed' : '',
      current && l.level < current.level ? 'is-below' : '',
    ].join(' ');
    return html`<li class="${cls}" title="${levelTip(l.level)}"><span class="level-num">L${l.level}</span><span class="level-name">${l.name}</span>${
      current && l.level === current.level ? html`<span class="level-tag">Current</span>` : ''
    }${proposed && l.level === proposed.level && (!current || current.level !== l.level) ? html`<span class="level-tag level-tag-proposed">Proposed</span>` : ''}</li>`;
  })}</ol>`;
}

export function metricCard({ label, value, target, status, note, href }) {
  const inner = html`
    <div class="metric-top"><span class="metric-label">${label}</span>${badge(status)}</div>
    <div class="metric-value">${value}</div>
    ${target ? html`<div class="metric-target">Target: ${target}</div>` : ''}
    ${note ? html`<div class="metric-note">${note}</div>` : ''}`;
  return href
    ? html`<a class="metric card card-link" href="${href}">${inner}</a>`
    : html`<div class="metric card">${inner}</div>`;
}

export function section(title, body, { subtitle, actions, id } = {}) {
  return html`<section class="section"${id ? html` id="${id}"` : ''}>
    <div class="section-head">
      <div><h2>${title}</h2>${subtitle ? html`<p class="section-sub">${subtitle}</p>` : ''}</div>
      ${actions ? html`<div class="section-actions">${actions}</div>` : ''}
    </div>
    ${body}
  </section>`;
}

export function kv(pairs) {
  return html`<dl class="kv">${pairs.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>`;
}

export function notice(tone, title, body, { link, linkText } = {}) {
  return html`<div class="notice notice-${tone}" role="${tone === 'fail' ? 'alert' : 'status'}">
    <div class="notice-body"><strong>${title}</strong>${body ? html`<p>${body}</p>` : ''}</div>
    ${link ? html`<a class="notice-link" href="${link}">${linkText || 'Open'}</a>` : ''}
  </div>`;
}

// A coverage warning (#25): explains a gap, links to People, never blocks.
export function warningNotice(w) {
  const links = w.links || [{ href: w.link, text: w.linkText }];
  return html`<div class="notice notice-watch" role="status"><div class="notice-body"><strong>${w.title}</strong><p>${w.body}</p></div><span class="notice-links">${links.map((l, i) => html`${i ? ' · ' : ''}<a class="notice-link" href="${l.href}">${l.text}</a>`)}</span></div>`;
}

export function empty(text) {
  return html`<p class="empty">${text}</p>`;
}

export function selectField(name, label, options, value, { placeholder, action } = {}) {
  return html`<label class="field field-stack"><span>${label}</span><select name="${name}" ${action ? html`data-action="${action}"` : ''}>${placeholder ? html`<option value="" ${value ? '' : raw('selected')}>${placeholder}</option>` : ''}${options.map((o) => {
    const [v, text] = Array.isArray(o) ? o : [o, o];
    return html`<option value="${v}" ${v === value ? raw('selected') : ''}>${text}</option>`;
  })}</select></label>`;
}
