// Configure evidence and review coverage (#126). The product person chooses
// which evidence judges each target and decision requirement, sees which have
// enough evidence, and gets a suggestion for each gap. Connecting systems is
// the implementation team's job and never happens here.

import { html, notice, lede, badge, fmtDate } from '../ui.js';
import {
  getCapability, actor, people, criteriaLocked, evidenceSources, evidenceCoverage, coverageText, COVERAGE_WORDS, MEASURE_STAT_WORDS, barFromWords, SOURCE_KINDS, TESTS_SOURCE, MANUAL_SOURCE, findSource, isCoverageRule, isIncidentRequirement, judgedBy, rowMetric,
} from '../store/index.js';
import { RESULT_STATUS_TONE, unlinkedNotice } from './lightweight.js';

const TONE = { covered: 'pass', stale: 'watch', insufficient: 'insufficient', 'no-data': 'neutral', 'no-source': 'neutral', 'needs-decision': 'decision', judged: 'pass', unknown: 'insufficient', conflicting: 'watch', incident: 'fail' };
const KIND_WORDS = { eval: 'test cases only', production: 'real use only' };

function mappingText(state, m, row = null) {
  if (!m) {
    const how = row && row.kind !== 'target' ? judgedBy(state, row.capabilityId, row) : null;
    return html`<span class="muted">${how === 'person' ? 'Judged by a person' : how === 'legacy' ? 'Not set yet (older Requirement)' : 'Not linked yet'}</span>`;
  }
  const src = m.source ? findSource(state, m.source) : null;
  return html`<strong>${src ? src.name : 'Any source'}</strong> · ${m.metric}${m.segment ? ` · ${m.segment}` : ''}<div class="muted small">${MEASURE_STAT_WORDS[m.stat] || m.stat}${m.minSample ? `, at least ${m.minSample} cases` : ''}${m.kind ? `, ${KIND_WORDS[m.kind]}` : ''}</div>`;
}

function coverageCell(c) {
  const detail = c.status === 'covered' ? `${c.judged.text}${c.passing ? '' : ' (not met)'}`
    : c.status === 'stale' ? `${c.judged.text}, ${c.age} days old`
      : c.status === 'insufficient' ? c.judged.text
        : c.status === 'no-data' ? 'Waiting for results'
          : c.status === 'judged' ? 'A person\'s judgment is on record'
          : c.status === 'incident' ? 'An open critical incident decides it'
            : c.status === 'unknown' ? 'Judged Unknown'
              : c.status === 'conflicting' ? 'The evidence disagrees'
                : c.status === 'needs-decision' ? 'No number yet'
                  : 'Not mapped';
  return html`${badge(TONE[c.status], COVERAGE_WORDS[c.status])}<div class="muted small">${detail}</div>`;
}

// What to do about a gap: never "you must write tests". Tests are one way.
function suggestion(state, cap, c) {
  const configure = `#/capabilities/${cap.id}/evidence/configure?row=${c.kind}:${c.id}`;
  const record = `#/capabilities/${cap.id}/evidence/record?row=${c.kind}:${c.id}`;
  const judge = `#/capabilities/${cap.id}/evidence/judge?row=${c.id}`;
  // Manual first (#142): every gap has a way to fill it without integrations.
  if (c.status === 'conflicting') return html`The evidence disagrees: ${c.row.result ? c.row.result.why : ''} Look into it, or collect more evidence. Conflicting is never a pass.`;
  if (c.status === 'unknown') return html`Judged Unknown. Record a judgment once you know. <a href="${judge}">Record judgment</a>`;
  if (c.status === 'needs-decision') return html`Decide its number first. <a href="#/capabilities/${cap.id}/criteria/edit">Requirements and Targets</a>`;
  if (c.status === 'no-source' && c.kind === 'requirement' && judgedBy(state, cap.id, c.row) === 'legacy') return html`An older Requirement that doesn't say how it is judged. Choose its evidence, or say how you'll know it is true. <a href="${configure}">Choose evidence</a>`;
  if (c.status === 'no-source' && c.kind === 'requirement' && judgedBy(state, cap.id, c.row) === 'person') return html`No metric: the Owner or a Reviewer judges it${isIncidentRequirement(c.row) ? ', and an open critical incident blocks it' : ''}. <a href="${judge}">Record judgment</a>${isIncidentRequirement(c.row) ? html` · <a href="#/capabilities/${cap.id}/evidence/log#incidents">Incidents</a>` : ''}`;
  if (c.status === 'no-source' && c.kind === 'target') return html`Record a result for it by hand or upload a file: that links it to manual results. Or choose another source. <a href="${record}">Record result</a> · <a href="${configure}">Choose evidence</a>`;
  if (c.status === 'no-source' && c.kind === 'requirement' && !isCoverageRule(c.row)) {
    // Evidence-judged with nothing chosen yet: through a linked Target, or its own evidence.
    if (c.row.result && /^Judged by its Target/.test(c.row.result.why || '')) return html`It is judged through its Target: record results there. <a href="${configure}">Choose evidence</a>`;
    return html`Evidence shows it, and none is chosen yet. Record its first result from its row (that links it to results people record here), or choose another source. <a href="${record}">Record result</a> · <a href="${configure}">Choose evidence</a>`;
  }
  const src = c.mapped && c.row.measure.source ? findSource(state, c.row.measure.source) : null;
  if (c.status === 'no-source') return html`Choose which evidence judges it: a connected source, Authority Lab tests, or a manual review. <a href="${configure}">Choose evidence</a>`;
  if (c.status === 'no-data') {
    if (src && src.id === TESTS_SOURCE) return html`Add test cases, run them through your AI, and record each outcome. <a href="#/tests?capability=${cap.id}">Test cases</a>`;
    if (src && src.id === MANUAL_SOURCE) return html`Record the result of a review by hand, or upload a file. <a href="${record}">Record result</a>`;
    return html`${src ? `Waiting for ${src.name} to send "${c.row.measure.metric}". ` : ''}Or record a result by hand, or choose another source. <a href="${record}">Record a result</a> · <a href="${configure}">Change evidence</a>`;
  }
  if (c.status === 'insufficient') return html`More cases are needed (${c.judged.text}). ${c.judged.kind === 'production' ? 'Real use builds this up: a pilot at Draft, or more production data from the source.' : 'A larger test or eval run, or a manual review of more cases.'}`;
  if (c.status === 'stale') return html`The newest result is ${c.age} days old${c.source ? `, past ${c.source.name}'s ${c.source.freshForDays}-day window` : ''}. Ask for a fresh run, or record a new result. It still counts until then.`;
  return '';
}

function editForm(state, cap, c, locked) {
  const sources = evidenceSources(state);
  // An unlinked row starts on results people record here, under the row's own
  // metric (#143 review), so nobody types a metric id; any other choice stays open.
  const m = c.row.measure || (isCoverageRule(c.row) ? {} : { source: MANUAL_SOURCE, metric: rowMetric(c.kind, c.id) });
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

// What a person can do for a row (#142): record a result or upload (rows
// measured by results people record, or a Target not linked yet), judge it
// (a person-judged Requirement), or choose its evidence. Decided by the row's
// structure only (Paige, #143 review), never by numbers in its wording.
function rowActions(state, cap, c) {
  const personJudged = c.kind === 'requirement' && judgedBy(state, cap.id, c.row) === 'person';
  const manual = c.row.measure && (c.row.measure.source === MANUAL_SOURCE || !c.row.measure.source);
  const linkedTarget = c.kind === 'requirement' && c.row.result && /^Judged by its Target/.test(c.row.result.why || '');
  // An evidence-judged Requirement records results when they come from
  // people (or no evidence is chosen yet); a person-judged one never does.
  const record = c.row.bar !== 'needs-decision' && (c.kind === 'target' ? (!c.row.measure || manual) : (!personJudged && !isCoverageRule(c.row) && !linkedTarget && (manual || !c.row.measure)));
  const noNumber = personJudged;
  // A Requirement a person is set to decide can't have evidence chosen; how
  // it is judged is changed in the Requirements editor (governed as usual).
  const explicitPerson = personJudged && c.row.judgment === 'person';
  // An older Requirement that doesn't say how it is judged (legacy): its
  // evidence can be chosen as before, or someone says how it is judged.
  if (c.kind === 'requirement' && judgedBy(state, cap.id, c.row) === 'legacy') return html`<a class="btn btn-sm" href="#/capabilities/${cap.id}/evidence/configure?row=${c.kind}:${c.id}">Choose evidence</a> <a class="btn btn-sm" href="#/capabilities/${cap.id}/${criteriaLocked(state, cap.id) ? 'amend/criteria' : 'criteria/edit'}">Set how it's judged</a>`;
  const evidenceLink = explicitPerson
    ? html`<a class="btn btn-sm" href="#/capabilities/${cap.id}/${criteriaLocked(state, cap.id) ? 'amend/criteria' : 'criteria/edit'}">Change how it's judged</a>`
    : html`<a class="btn btn-sm" href="#/capabilities/${cap.id}/evidence/configure?row=${c.kind}:${c.id}">${c.mapped ? 'Change evidence' : 'Choose evidence'}</a>`;
  return html`${record ? html`<a class="btn btn-sm btn-primary" href="#/capabilities/${cap.id}/evidence/record?row=${c.kind}:${c.id}">Record result</a> ` : ''}${noNumber ? html`<a class="btn btn-sm btn-primary" href="#/capabilities/${cap.id}/evidence/judge?row=${c.id}">Record judgment</a> ` : ''}${evidenceLink}`;
}

// The row's result and why (#142): Met, Not met, Unknown, Conflicting, Not
// enough evidence, No evidence yet or Needs decision.
function resultCell(c) {
  const r = c.row.result || (c.row.status ? { status: { pass: 'met', fail: 'not-met', conflicting: 'conflicting', insufficient: 'not-enough', 'too-early': 'not-enough', pending: 'no-evidence', 'needs-decision': 'needs-decision' }[c.row.status] || 'no-evidence' } : { status: 'no-evidence' });
  const words = { met: 'Met', 'not-met': 'Not met', unknown: 'Unknown', conflicting: 'Conflicting', 'not-enough': 'Not enough evidence', 'no-evidence': 'No evidence yet', 'needs-decision': 'Needs decision' };
  return html`${badge(RESULT_STATUS_TONE[r.status] || 'neutral', words[r.status])}${r.why ? html`<div class="muted small">${r.why}</div>` : ''}`;
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
    <thead><tr><th>${title === 'Requirements' ? 'Requirement' : 'Target'}</th><th>Evidence</th><th>Coverage</th><th>Result</th><th></th></tr></thead>
    <tbody>${list.map((c) => html`<tr class="${editing === c ? 'is-editing' : ''}"><td><strong>${c.label}</strong>${c.kind === 'target' ? html`<div class="muted small">${c.row.target}</div>` : ''}</td><td>${mappingText(state, c.row.measure, { ...c.row, kind: c.kind, capabilityId: cap.id })}</td><td>${coverageCell(c)}</td><td>${resultCell(c)}</td><td>${rowActions(state, cap, c)}</td></tr>`)}</tbody>
  </table></div></section>` : '');
  const gaps = cov.requirements.filter((c) => !['covered', 'judged', 'incident'].includes(c.status));
  return html`<div class="page-head"><div>
      <p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a> · Setup</p>
      <h1>Configure evidence</h1>
      ${lede('Choose which evidence judges each Requirement and Target, see what is covered, and see each result and why.', 'Your implementation team connects systems; each one shows up under Settings → Evidence sources once it sends results. Here you only decide what those results mean for this capability: which source and metric judge a row, and how to read it. The bar itself comes from the row\'s wording, so what people read and what software checks always agree. Authority Lab tests and a manual review are always available as sources. Evidence never changes authority on its own: a person decides.')}
    </div></div>
    ${error ? notice('fail', 'Couldn\'t save that', error) : ''}
    ${unlinkedNotice(state, cap, { here: true })}
    ${locked ? notice('watch', 'Results already exist', 'Changing which evidence judges a row is a change to the bar, so it is proposed and needs approval, like any other change to the targets.') : ''}
    <div class="coverage-summary card"><p class="decide-big">${coverageText(cov)}</p>
      <p class="muted small">${['covered', 'judged', 'stale', 'insufficient', 'conflicting', 'unknown', 'needs-decision', 'no-data', 'no-source'].map((st) => [st, cov.requirements.filter((c) => c.status === st).length]).filter(([, n]) => n).map(([st, n]) => `${n} ${COVERAGE_WORDS[st].toLowerCase()}`).join(' · ')}</p></div>
    ${editing ? editForm(state, cap, editing, locked) : ''}
    ${table('Requirements', cov.requirements)}
    ${gaps.length ? html`<section class="section"><h2>Fill the gaps</h2><ul class="plain-list gap-list">${gaps.map((c) => html`<li><strong>${c.label}:</strong> ${suggestion(state, cap, c)}</li>`)}</ul></section>` : ''}
    ${table('Targets', cov.targets)}
    <p class="small"><a href="#/tests?capability=${cap.id}">Test cases</a> · <a href="#/capabilities/${cap.id}/evidence/log">Incidents, feedback and Impact</a> · <a href="#/sources">Evidence sources</a> · <a href="#/capabilities/${cap.id}/setup">Setup</a></p>`;
}
