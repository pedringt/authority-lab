// Evidence sources (#126): the workspace's list of where evidence comes from,
// and the form for a result a person records by hand. Connecting a system is
// the implementation team's job and never happens here; this page shows what
// is connected and what each source has sent.

import { html, notice, lede, fmtDate, badge, SWITCH_PERSON } from '../ui.js';
import { evidenceSources, SOURCE_KINDS, CONNECTIONS, getCapability, actor, manualEntryEligibility, people, workspaceOf } from '../store/index.js';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function sourcesView(state) {
  const sources = evidenceSources(state);
  const capName = (id) => (getCapability(state, id) || { name: id }).name;
  const connected = sources.filter((s) => s.connection === 'connected');
  const row = (s) => html`<tr>
    <td><strong>${s.name}</strong><div class="muted small">${s.description}</div></td>
    <td>${SOURCE_KINDS[s.kind] || s.kind}</td>
    <td>${s.connection === 'connected' ? badge('pass', CONNECTIONS.connected) : html`<span class="muted">${CONNECTIONS[s.connection]}</span>`}</td>
    <td>${s.metrics.length ? html`${s.metrics.map((m, i) => html`${i ? ', ' : ''}${m.label || m.metric}${m.segments.length ? html` <span class="muted small">(${plural(m.segments.length, 'segment')})</span>` : ''}`)}` : html`<span class="muted">Nothing yet</span>`}</td>
    <td>${s.lastReceived ? fmtDate(s.lastReceived) : html`<span class="muted">Never</span>`}<div class="muted small">Fresh for ${s.freshForDays} days</div></td>
    <td>${s.capabilities.length ? s.capabilities.map(capName).join(', ') : html`<span class="muted">None</span>`}</td>
  </tr>`;
  return html`<div class="page-head"><div>
      <p class="eyebrow">${workspaceOf(state).name} · Settings</p>
      <h1>Evidence sources</h1>
      ${lede('Where this workspace\'s evidence comes from.', 'Your implementation team connects systems such as an eval suite, a ticketing system or product analytics. Each one appears here once it sends evidence. You don\'t configure connections here: for each capability, you choose which results matter under its setup. Two sources are always available: Authority Lab\'s own tests, and manual review, a result a person records by hand. A workspace can start with those two and connect systems later.')}
    </div></div>
    ${connected.length ? '' : notice('neutral', 'No connected systems yet', 'Evidence can still come from Authority Lab tests and manual review. When a connected system sends its first evidence, it appears here.')}
    <div class="card table-card"><table class="table">
      <thead><tr><th>Source</th><th>Kind</th><th>Connection</th><th>Metrics it provides</th><th>Last data</th><th>Used by</th></tr></thead>
      <tbody>${sources.map(row)}</tbody>
    </table></div>`;
}

// Record a result by hand (#126): the owner or a named stakeholder.
export function recordEvidenceView(state, capabilityId, query) {
  const cap = getCapability(state, capabilityId);
  if (!cap) return notice('fail', 'Capability not found', 'It may have been removed.');
  const by = actor(state, capabilityId);
  const ok = manualEntryEligibility(state, capabilityId, by);
  const error = query.get('error');
  const back = `#/capabilities/${cap.id}?tab=decide&show=all`;
  return html`<div class="page-head"><div>
      <p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a> · Evidence</p>
      <h1>Record a result</h1>
      ${lede('A result a person measured: a review, an audit, a spot check.', 'It is kept exactly as recorded, labelled as recorded by hand with your name, and can\'t be edited later: a correction is a new result. A measured result counts like any other evidence, so the first one locks this capability\'s targets. A view or a recommendation is not a result: record it as a stakeholder position instead.')}
    </div></div>
    ${error ? notice('fail', 'Couldn\'t record the result', error) : ''}
    ${ok.ok ? '' : notice('watch', 'You can\'t record results for this capability', `${ok.reason}`)}
    <form class="card form-stack" data-form="record-evidence" data-capability="${cap.id}">
      <label>What was measured <input type="text" name="label" maxlength="80" required placeholder="Policy compliance in a Risk review"></label>
      <fieldset class="choice-row"><legend>Measured on</legend>
        <label><input type="radio" name="kind" value="production" checked> Real use</label>
        <label><input type="radio" name="kind" value="eval"> Test cases</label>
      </fieldset>
      <fieldset class="choice-row"><legend>The result</legend>
        <label><input type="radio" name="type" value="rate" checked> Some of a number of cases passed</label>
        <label><input type="radio" name="type" value="count"> A number of events (failures, incidents)</label>
        <label><input type="radio" name="type" value="value"> A single number</label>
      </fieldset>
      <div class="field-row">
        <label>Passed <input type="number" name="passed" min="0" step="1" inputmode="numeric"></label>
        <label>Events or number <input type="number" name="value" step="any"></label>
        <label>Out of how many cases <input type="number" name="total" min="0" step="1" inputmode="numeric"></label>
      </div>
      <div class="field-row">
        <label>Segment (optional) <input type="text" name="segment" maxlength="60" placeholder="High-value refunds"></label>
        <label>Severity (optional) <select name="severity"><option value="">None</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
        <label>Date <input type="date" name="observedAt" value="${state.today}"></label>
      </div>
      <label>Note (optional) <textarea name="note" maxlength="300" rows="2" placeholder="A sentence on how it was measured."></textarea></label>
      <label>Link to the source document (optional) <input type="url" name="url" maxlength="300" placeholder="https://"></label>
      <p class="muted small">Recording as <strong>${(people(state)[by] || { name: by }).name}</strong>.${ok.ok ? '' : ` ${SWITCH_PERSON}`}</p>
      <div class="form-actions"><button class="btn btn-primary" type="submit" ${ok.ok ? '' : 'disabled'}>Record result</button> <a class="btn btn-ghost" href="${back}">Cancel</a></div>
    </form>`;
}
