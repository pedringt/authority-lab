import * as seed from '../data/seed.js';
import { html, badge, section, fmtDate } from '../ui.js';
import { capData, getCapability, current } from '../store/index.js';
import { requirementsList, proposedChangeLabel } from './capability.js';
import { capabilityHeading, filterBar } from './tests.js';
import { evidenceSourcesCard } from './scenarios.js';

const STATUSES = [['all', 'All statuses'], ['pass', 'Pass'], ['watch', 'Watch'], ['insufficient', 'Insufficient'], ['fail', 'Fail']];

export function evidenceView(state, capabilityId, query) {
  const cap = getCapability(state, capabilityId);
  const d = capData(state, capabilityId);
  const source = query.get('source') || 'all';
  const status = query.get('status') || 'all';
  const segment = query.get('segment') || 'all';
  const risk = query.get('risk') || 'all';

  const sources = [...new Set(d.evidence.map((e) => e.source))];
  const segments = [...new Set(d.evidence.map((e) => e.segment))];
  const risks = ['High', 'Medium', 'Low'];

  let items = d.evidence.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  if (source !== 'all') items = items.filter((e) => e.source === source);
  if (status !== 'all') items = items.filter((e) => e.status === status);
  if (segment !== 'all') items = items.filter((e) => e.segment === segment);
  if (risk !== 'all') items = items.filter((e) => e.risk === risk);

  const link = (over) => {
    const q = new URLSearchParams({ capability: cap.id, source, status, segment, risk, ...over });
    return `#/evidence?${q.toString()}`;
  };

  const counts = Object.fromEntries(STATUSES.map(([k]) => [k, d.evidence.filter((e) => e.status === k).length]));

  const filters = filterBar({
    selects: [
      { label: 'Status', value: status, options: STATUSES.map(([k, l]) => [k, k === 'all' ? l : `${l} (${counts[k]})`]), hrefFor: (k) => link({ status: k }) },
      { label: 'Source', value: source, options: [['all', 'All sources'], ...sources.map((s) => [s, s])], hrefFor: (s) => link({ source: s }) },
      { label: 'Segment', value: segment, options: [['all', 'All segments'], ...segments.map((s) => [s, s])], hrefFor: (s) => link({ segment: s }) },
      { label: 'Risk', value: risk, options: [['all', 'Any risk'], ...risks.map((s) => [s, `${s} risk`])], hrefFor: (s) => link({ risk: s }) },
    ],
    clearHref: `#/evidence?capability=${cap.id}`,
    active: [source, status, segment, risk].some((v) => v !== 'all'),
    showing: items.length,
    total: d.evidence.length,
    noun: 'items',
  });

  const cards = items.map((e) => html`<article class="card evidence-item evidence-${e.status}">
    <div class="evidence-head">
      <div><span class="eyebrow">${e.source} · ${e.id}</span><h3>${e.metric}</h3></div>
      ${badge(e.status)}
    </div>
    <p class="evidence-value">${e.value}</p>
    <p class="muted">${e.detail}</p>
    <div class="evidence-meta"><span>${fmtDate(e.date)}</span><span>${e.segment === 'All' ? 'All segments' : e.segment}</span><span>${e.risk} risk</span><a href="${e.link}">Source</a></div>
  </article>`);

  return html`<div class="page-head">
    <div>
      <p class="eyebrow">${seed.workspace.name} · <a href="#/capabilities/${cap.id}">${cap.name}</a></p>
      <h1>${capabilityHeading(state, cap, 'Evidence for', (id) => `#/evidence?capability=${id}`)}</h1>
      <p class="lede">Everything the authority decision rests on, from automated tests, the pilot, human review, operations, cost, incidents, user feedback and stakeholder assessment. Each item links back to where it came from.</p>
    </div>
  </div>
  ${d.evidence.length ? filters : ''}
  ${items.length ? html`<div class="evidence-grid">${cards}</div>` : html`<p class="empty">${d.evidence.length ? 'No evidence matches these filters.' : `No evidence has been recorded for ${cap.name}.`}</p>`}
  ${d.evidence.length ? '' : evidenceSourcesCard()}
  ${current(state, cap.id, 'requirements').length ? section(`Evidence requirements for ${proposedChangeLabel(cap, state)}`, requirementsList(state, cap.id), { subtitle: 'What has to be true before the proposed change can be authorized.' }) : ''}`;
}
