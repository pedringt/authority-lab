// Configure evidence and review coverage (#126). The product person chooses
// which evidence judges each target and decision requirement, sees which have
// enough evidence, and gets a suggestion for each gap. Connecting systems is
// the implementation team's job and never happens here.

import { html, notice, lede, badge, fmtDate } from '../ui.js';
import {
  getCapability, actor, people, criteriaLocked, evidenceSources, evidenceCoverage, coverageText, COVERAGE_WORDS, MEASURE_STAT_WORDS, barFromWords, SOURCE_KINDS, TESTS_SOURCE, MANUAL_SOURCE, findSource,
} from '../store/index.js';

const TONE = { covered: 'pass', stale: 'watch', insufficient: 'insufficient', 'no-data': 'neutral', 'no-source': 'neutral' };
const KIND_WORDS = { eval: 'test cases only', production: 'real use only' };

function mappingText(state, m) {
  if (!m) return html`<span class="muted">A person judges this.</span>`;
  const src = m.source ? findSource(state, m.source) : null;
  return html`<strong>${src ? src.name : 'Any source'}</strong> · ${m.metric}${m.segment ? ` · ${m.segment}` : ''}<div class="muted small">${MEASURE_STAT_WORDS[m.stat] || m.stat}${m.minSample ? `, at least ${m.minSample} cases` : ''}${m.kind ? `, ${KIND_WORDS[m.kind]}` : ''}</div>`;
}

function coverageCell(c) {
  const detail = c.status === 'covered' ? `${c.judged.text}${c.passing ? '' : ' (not met)'}`
    : c.status === 'stale' ? `${c.judged.text}, ${c.age} days old`
      : c.status === 'insufficient' ? c.judged.text
        : c.status === 'no-data' ? 'Waiting for results'
          : 'Not mapped';
  return html`${badge(TONE[c.status], COVERAGE_WORDS[c.status])}<div class="muted small">${detail}</div>`;
}

// What to do about a gap: never "you must write tests". Tests are one way.
function suggestion(state, cap, c) {
  const configure = `#/capabilities/${cap.id}/evidence/configure?row=${c.kind}:${c.id}`;
  const record = `#/capabilities/${cap.id}/evidence/record`;
  const src = c.mapped && c.row.measure.source ? findSource(state, c.row.measure.source) : null;
  if (c.status === 'no-source') return html`Choose which evidence judges it: a connected source, Authority Lab tests, or a manual review. <a href="${configure}">Choose evidence</a>`;
  if (c.status === 'no-data') {
    if (src && src.id === TESTS_SOURCE) return html`Add test cases and run them. <a href="#/capabilities/${cap.id}/scenarios/edit">Test cases</a>`;
    if (src && src.id === MANUAL_SOURCE) return html`Record the result of a review by hand. <a href="${record}">Record a result</a>`;
    return html`${src ? `Waiting for ${src.name} to send "${c.row.measure.metric}". ` : ''}Or record a result by hand, or choose another source. <a href="${record}">Record a result</a> · <a href="${configure}">Change evidence</a>`;
  }
  if (c.status === 'insufficient') return html`More cases are needed (${c.judged.text}). ${c.judged.kind === 'production' ? 'Real use builds this up: a pilot at Draft, or more production data from the source.' : 'A larger test or eval run, or a manual review of more cases.'}`;
  if (c.status === 'stale') return html`The newest result is ${c.age} days old${c.source ? `, past ${c.source.name}'s ${c.source.freshForDays}-day window` : ''}. Ask for a fresh run, or record a new result. It still counts until then.`;
  return '';
}

function editForm(state, cap, c, locked) {
  const sources = evidenceSources(state);
  const m = c.row.measure || {};
  const words = c.kind === 'target' ? c.row.target : c.row.text;
  const bar = barFromWords(words);
  const metrics = sources.flatMap((s) => s.metrics.map((x) => ({ ...x, source: s.name })));
  const segments = [...new Set(metrics.flatMap((x) => x.segments || []))];
  const opWords = { '>=': 'at least', '>': 'more than', '<=': 'at most', '<': 'less than', '=': 'exactly' };
  return html`<form class="card form-stack" data-form="map-evidence" data-capability="${cap.id}" data-row="${c.id}" data-kind="${c.kind}">
    <h2>${c.label}</h2>
    <p class="muted">${bar ? html`The bar comes from its wording: <strong>${opWords[bar.op]} ${bar.value}</strong>.` : html`Its wording doesn't say a number to check. Change the wording first (it may need approval), then choose its evidence.`}</p>
    <label>Source <select name="source"><option value="">Any source</option>${sources.map((s) => html`<option value="${s.id}" ${m.source === s.id ? 'selected' : ''}>${s.name} (${SOURCE_KINDS[s.kind] || s.kind})</option>`)}</select></label>
    <label>Metric <input type="text" name="metric" list="metric-options" value="${m.metric || ''}" maxlength="60" required placeholder="answer-quality"></label>
    <datalist id="metric-options">${metrics.map((x) => html`<option value="${x.metric}">${x.label || x.metric} · ${x.source}</option>`)}</datalist>
    <div class="field-row">
      <label>Read it as <select name="stat">${Object.entries(MEASURE_STAT_WORDS).map(([k, v]) => html`<option value="${k}" ${(m.stat || 'rate') === k ? 'selected' : ''}>${v}</option>`)}</select></label>
      <label>Segment (optional) <input type="text" name="segment" list="segment-options" value="${m.segment || ''}" maxlength="60"></label>
      <datalist id="segment-options">${segments.map((x) => html`<option value="${x}"></option>`)}</datalist>
    </div>
    <div class="field-row">
      <label>At least this many cases (optional) <input type="number" name="minSample" min="1" step="1" value="${m.minSample || ''}"></label>
      <label>Count results from <select name="kind"><option value="">Test cases and real use</option><option value="eval" ${m.kind === 'eval' ? 'selected' : ''}>Test cases only</option><option value="production" ${m.kind === 'production' ? 'selected' : ''}>Real use only</option></select></label>
    </div>
    ${locked ? html`<label>Why (results exist, so this change needs approval) <input type="text" name="reason" maxlength="240" required placeholder="A sentence on why this evidence should judge it"></label>` : ''}
    <div class="form-actions">
      <button class="btn btn-primary" type="submit" name="op" value="map" ${bar ? '' : 'disabled'}>${locked ? 'Propose this change' : 'Save'}</button>
      ${c.mapped ? html`<button class="btn" type="submit" name="op" value="unmap">${locked ? 'Propose removing it' : 'Remove the mapping'}</button>` : ''}
      <a class="btn btn-ghost" href="#/capabilities/${cap.id}/evidence/configure">Cancel</a>
    </div>
    <p class="muted small">Acting as <strong>${(people(state)[actor(state, cap.id)] || {}).name}</strong>.</p>
  </form>`;
}

export function configureEvidenceView(state, capabilityId, query) {
  const cap = getCapability(state, capabilityId);
  if (!cap) return notice('fail', 'Capability not found', 'It may have been removed.');
  const cov = evidenceCoverage(state, capabilityId);
  const locked = criteriaLocked(state, capabilityId);
  const error = query.get('error');
  const [editKind, editId] = (query.get('row') || '').split(':');
  const editing = [...cov.requirements, ...cov.targets].find((c) => c.kind === editKind && c.id === editId);
  const table = (title, list) => (list.length ? html`<section class="section"><h2>${title}</h2><div class="card table-card"><table class="table">
    <thead><tr><th>${title === 'Decision requirements' ? 'Requirement' : 'Target'}</th><th>Evidence</th><th>Coverage</th><th></th></tr></thead>
    <tbody>${list.map((c) => html`<tr class="${editing === c ? 'is-editing' : ''}"><td><strong>${c.label}</strong>${c.kind === 'target' ? html`<div class="muted small">${c.row.target}</div>` : ''}</td><td>${mappingText(state, c.row.measure)}</td><td>${coverageCell(c)}</td><td><a class="btn btn-sm" href="#/capabilities/${cap.id}/evidence/configure?row=${c.kind}:${c.id}">${c.mapped ? 'Change' : 'Choose evidence'}</a></td></tr>`)}</tbody>
  </table></div></section>` : '');
  const gaps = cov.requirements.filter((c) => c.status !== 'covered');
  return html`<div class="page-head"><div>
      <p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a> · Setup</p>
      <h1>Configure evidence</h1>
      ${lede('Choose which evidence judges each decision requirement and target, then see what is covered.', 'Your implementation team connects systems; each one shows up under Settings → Evidence sources once it sends results. Here you only decide what those results mean for this capability: which source and metric judge a row, and how to read it. The bar itself comes from the row\'s wording, so what people read and what software checks always agree. Authority Lab tests and a manual review are always available as sources. Evidence never changes authority on its own: a person decides.')}
    </div></div>
    ${error ? notice('fail', 'Couldn\'t save that', error) : ''}
    ${locked ? notice('watch', 'Results already exist', 'Changing which evidence judges a row is a change to the bar, so it is proposed and needs approval, like any other change to the targets.') : ''}
    <div class="coverage-summary card"><p class="decide-big">${coverageText(cov)}</p>
      <p class="muted small">${['covered', 'stale', 'insufficient', 'no-data', 'no-source'].map((st) => [st, cov.requirements.filter((c) => c.status === st).length]).filter(([, n]) => n).map(([st, n]) => `${n} ${COVERAGE_WORDS[st].toLowerCase()}`).join(' · ')}</p></div>
    ${editing ? editForm(state, cap, editing, locked) : ''}
    ${table('Decision requirements', cov.requirements)}
    ${gaps.length ? html`<section class="section"><h2>Fill the gaps</h2><ul class="plain-list gap-list">${gaps.map((c) => html`<li><strong>${c.label}:</strong> ${suggestion(state, cap, c)}</li>`)}</ul></section>` : ''}
    ${table('Targets', cov.targets)}
    <p class="small"><a href="#/sources">Evidence sources</a> · <a href="#/capabilities/${cap.id}/setup">Setup</a></p>`;
}
