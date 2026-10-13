import * as seed from '../data/seed.js';
import { html, badge, section, fmtDate, evidenceDetail, lede, tabIntro } from '../ui.js';
import { capData, getCapability, current, workspaceOf, gateEvidence } from '../store/index.js';
import { requirementsList, proposedChangeLabel } from './cap-decide.js';
import { capabilityHeading, filterBar } from './tests.js';
import { evidenceSourcesCard } from './scenarios.js';
import { fromBadge, standingNote, provenanceDetails, configChangeNotices } from './provenance.js';
import { importedStanding, importedVerdicts } from '../store/index.js';

const STATUSES = [['all', 'All statuses'], ['pass', 'Pass'], ['watch', 'Needs attention'], ['insufficient', 'Not enough data'], ['fail', 'Fail'], ['recorded', 'Not judged yet']];
// The same words on the filter and on each item's badge.
const STATUS_LABEL = Object.fromEntries(STATUSES);

// The test-run item keeps its stored metric name (code and seed data find it
// by that name); it reads as plain words here.
const metricText = (e) => (e.source === 'Automated tests' && e.metric === 'Scenario pass rate' ? 'Tests passed' : e.metric);

export function evidenceView(state, capabilityId, query, { embedded = false } = {}) {
  const cap = getCapability(state, capabilityId);
  const d = capData(state, capabilityId);
  const source = query.get('source') || 'all';
  const status = query.get('status') || 'all';
  const segment = query.get('segment') || 'all';
  const risk = query.get('risk') || 'all';

  // Stored evidence plus what the gate log derives (A5), each labelled.
  // An imported result takes the status of the targets and requirements that
  // judge it (#120); one nothing judges stays "Not judged yet".
  const verdicts = importedVerdicts(state, capabilityId);
  const all = [...d.evidence.map((e) => (e.from === 'imported' && verdicts.has(e.id) ? { ...e, status: verdicts.get(e.id) } : e)), ...gateEvidence(state, capabilityId)];
  const seededIds = new Set(((seed.capabilityData[capabilityId] || {}).evidence || []).map((e) => e.id));
  const standing = importedStanding(state, capabilityId);
  const sources = [...new Set(all.map((e) => e.source))];
  const segments = [...new Set(all.map((e) => e.segment))];
  const risks = ['High', 'Medium', 'Low'];

  let items = all.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  if (source !== 'all') items = items.filter((e) => e.source === source);
  if (status !== 'all') items = items.filter((e) => e.status === status);
  if (segment !== 'all') items = items.filter((e) => e.segment === segment);
  if (risk !== 'all') items = items.filter((e) => e.risk === risk);

  const link = (over) => {
    const q = new URLSearchParams({ source, status, segment, risk, ...over });
    return `#/capabilities/${cap.id}?tab=decide&show=all&${q.toString()}`;
  };

  const counts = Object.fromEntries(STATUSES.map(([k]) => [k, all.filter((e) => e.status === k).length]));

  const filters = filterBar({
    selects: [
      { label: 'Status', value: status, options: STATUSES.map(([k, l]) => [k, k === 'all' ? l : `${l} (${counts[k]})`]), hrefFor: (k) => link({ status: k }) },
      { label: 'Source', value: source, options: [['all', 'All sources'], ...sources.map((s) => [s, s])], hrefFor: (s) => link({ source: s }) },
      { label: 'Segment', value: segment, options: [['all', 'All segments'], ...segments.map((s) => [s, s])], hrefFor: (s) => link({ segment: s }) },
      { label: 'Risk', value: risk, options: [['all', 'Any risk'], ...risks.map((s) => [s, `${s} risk`])], hrefFor: (s) => link({ risk: s }) },
    ],
    clearHref: `#/capabilities/${cap.id}?tab=decide&show=all`,
    active: [source, status, segment, risk].some((v) => v !== 'all'),
    showing: items.length,
    total: all.length,
    noun: 'items',
  });

  const cards = items.map((e) => html`<article class="card evidence-item evidence-${e.status}">
    <div class="evidence-head">
      <div><span class="eyebrow">${e.source}</span><h3>${metricText(e)}</h3>${fromBadge(e, seededIds)}${e.derived ? html`<span class="badge badge-neutral" title="Counted from every action the AI asked for. It updates as new actions happen and isn't a stored result.">Calculated from logged actions · ${e.origin}</span>` : ''}</div>
      ${badge(e.status, STATUS_LABEL[e.status])}
    </div>
    <p class="evidence-value">${e.value}</p>
    <p class="muted">${evidenceDetail(e)}</p>
    ${standingNote(standing.get(e.id))}
    <div class="evidence-meta"><span>${e.id}</span><span>${fmtDate(e.date)}</span><span>${e.segment === 'All' ? 'All segments' : e.segment}</span>${e.risk ? html`<span>${e.risk} risk</span>` : ''}${e.link ? (/^https:/.test(e.link) ? html`<a href="${e.link}" target="_blank" rel="noopener">View source</a>` : html`<a href="${e.link}">View source</a>`) : ''}</div>
    ${provenanceDetails(state, e)}
  </article>`);

  const head = embedded
    ? tabIntro(`What we know so far about how ${cap.name} performs.`, 'Evidence comes from tests, the pilot, reviewer decisions, day-to-day operations, cost, incidents, user feedback and stakeholder reviews. Each item links back to where it came from.')
    : html`<div class="page-head">
    <div>
      <p class="eyebrow">${workspaceOf(state).name} · <a href="#/capabilities/${cap.id}">${cap.name}</a></p>
      <h1>${capabilityHeading(state, cap, 'Evidence for', (id) => `#/capabilities/${id}?tab=decide&show=all`)}</h1>
      ${lede(`What we know so far about how ${cap.name} performs.`, 'Evidence comes from tests, the pilot, reviewer decisions, day-to-day operations, cost, incidents, user feedback and stakeholder reviews. Each item links back to where it came from.')}
    </div>
  </div>`;
  return html`${head}
  ${configChangeNotices(state, capabilityId)}
  ${all.length ? filters : ''}
  ${items.length ? html`<div class="evidence-grid">${cards}</div>` : html`<p class="empty">${all.length ? 'No evidence matches these filters.' : `No evidence yet for ${cap.name}. Run the tests or start a pilot to collect some.`}</p>`}
  ${d.evidence.length ? '' : evidenceSourcesCard()}
`;
}
