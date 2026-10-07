// Small rendering helpers. `html` escapes interpolated values; wrap trusted
// markup in `raw()` to pass it through. Arrays are joined.

import { STATUS_LABELS, AUTHORITY_LEVELS, people } from './data/seed.js';
import { authorityLabel } from './store.js';

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

export function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[m - 1]} ${d}`;
}

export function fmtDateYear(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[m - 1]} ${d}, ${y}`;
}

export function person(key) {
  if (key === 'system') return { name: 'Software rule', role: 'Automatic restriction', team: 'System' };
  return people[key] || { name: key, role: '', team: '' };
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

export function authorityBadge(auth) {
  const tone = auth.level >= 3 ? 'authority-act' : auth.level === 0 ? 'authority-none' : 'authority-human';
  return html`<span class="authority ${tone}" title="${AUTHORITY_LEVELS[auth.level].description}">${authorityLabel(auth)}</span>`;
}

export function levelScale(current, proposed) {
  return html`<ol class="level-scale" aria-label="Authority levels">${AUTHORITY_LEVELS.map((l) => {
    const cls = [
      'level-step',
      current && l.level === current.level ? 'is-current' : '',
      proposed && l.level === proposed.level ? 'is-proposed' : '',
      current && l.level < current.level ? 'is-below' : '',
    ].join(' ');
    return html`<li class="${cls}"><span class="level-num">L${l.level}</span><span class="level-name">${l.name}</span>${
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

export function empty(text) {
  return html`<p class="empty">${text}</p>`;
}

export function selectField(name, label, options, value, { placeholder } = {}) {
  return html`<label class="field field-stack"><span>${label}</span><select name="${name}">${placeholder ? html`<option value="" ${value ? '' : raw('selected')}>${placeholder}</option>` : ''}${options.map((o) => {
    const [v, text] = Array.isArray(o) ? o : [o, o];
    return html`<option value="${v}" ${v === value ? raw('selected') : ''}>${text}</option>`;
  })}</select></label>`;
}
