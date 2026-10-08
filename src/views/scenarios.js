import * as seed from '../data/seed.js';
import { html, raw, badge, notice, section, person, fmtDateYear, selectField } from '../ui.js';
import { getCapability, capData, actor, scenarioNudge } from '../store/index.js';

export function scenariosEditorView(state, capabilityId, query) {
  const cap = getCapability(state, capabilityId);
  if (!cap) return html`<div class="page-head"><h1>Capability not found</h1></div>`;
  const error = query.get('error');
  const acting = person(actor(state, capabilityId));
  const d = capData(state, capabilityId);
  const list = d.scenarios;
  const counts = Object.fromEntries(seed.SCENARIO_GROUPS.map((g) => [g.id, list.filter((sc) => sc.group === g.id).length]));
  const groups = seed.SCENARIO_GROUPS.map((g) => [g.id, g.name]);
  const hasStarter = list.some((sc) => sc.source === 'ai');
  const row = (sc, i) => html`<tr>
    <td><input type="hidden" name="sc-id" value="${sc.id || ''}"><input type="hidden" name="sc-source" value="${sc.source || 'person'}">${selectField('sc-group', '', groups, sc.group || 'standard')}</td>
    <td><input type="text" name="sc-name" value="${sc.name || ''}" maxlength="60" placeholder="Short name" aria-label="Scenario name"></td>
    <td><input type="text" name="sc-situation" value="${sc.situation || ''}" maxlength="240" placeholder="What the AI sees" aria-label="Situation"></td>
    <td><input type="text" name="sc-expected" value="${sc.expected || ''}" maxlength="200" placeholder="What it should do" aria-label="Expected behaviour"></td>
    <td>${sc.source === 'ai' ? html`<span class="badge badge-insufficient">Suggested by AI</span>` : html`<span class="muted small">Written</span>`}</td>
    <td><button class="btn btn-sm btn-ghost" type="button" data-action="row-remove" aria-label="Remove scenario ${i + 1}">Remove</button></td>
  </tr>`;
  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a> · Setup step 5</p>
      <h1>Scenario library</h1>
      <p class="lede">Real-shaped cases in five groups: standard, ambiguous, adversarial, high impact and edge. Results are seeded and deterministic: the same scenario always gets the same recorded result, so the suite replays. ${d.testRun.lastRun ? 'Saving changes to the library clears the last run; the next run re-records results.' : ''}</p>
    </div>
    <div class="page-actions">${hasStarter ? '' : html`<button class="btn" data-action="starter-add" data-capability="${cap.id}">Add starter set · Suggested by AI</button><p class="muted small">20 scenarios, four per group, phrased for ${cap.name}.</p>`}</div>
  </div>
  ${error ? notice('fail', 'Could not save', error) : ''}
  <div class="card progress-card"><div class="progress-facts">
    <div><span class="fact-label">Scenarios</span><strong>${list.length}</strong></div>
    ${seed.SCENARIO_GROUPS.map((g) => html`<div><span class="fact-label">${g.name}</span><strong>${counts[g.id]}</strong></div>`)}
  </div><p class="muted small">${scenarioNudge(list.length)}</p></div>
  <form class="setup-form criteria-form" data-form="save-scenarios" novalidate>
    <div class="card table-card"><table class="table table-edit table-scenarios">
      <thead><tr><th>Group</th><th>Name</th><th>Situation</th><th>Expected behaviour</th><th>Source</th><th></th></tr></thead>
      <tbody data-rows="scenarios">${list.map(row)}</tbody>
    </table></div>
    <button class="btn btn-sm" type="button" data-action="row-add" data-kind="scenarios">Add scenario</button>
    <div class="card authorize">
      <p class="eyebrow">Save</p>
      <p class="muted small">Saving as <strong>${acting.name}</strong>, ${acting.role}, replaces the library for ${cap.name}, dated ${fmtDateYear(state.today)}. New or changed scenarios get a simulated, deterministic result when saved.</p>
      <button class="btn btn-primary btn-block" type="submit">Save scenario library</button>
    </div>
  </form>
  <template id="row-scenarios">${row({ group: 'standard', name: '', situation: '', expected: '', source: 'person' }, 0)}</template>`;
}

export function evidenceSourcesCard() {
  return html`<div class="card sources-card">
    <p class="eyebrow">Evidence sources</p>
    <p>In a real deployment, evidence would arrive from outside: a test harness, the ticketing system, reviewer decisions, the payments system, a model API's cost reporting, an eval framework. Authority Lab would sit above them and turn what they report into a decision about authority.</p>
    <ul class="plain-list muted small">
      <li>Test harness · not connected (this prototype replays recorded results)</li>
      <li>Ticketing system · not connected</li>
      <li>Reviewer decisions · not connected</li>
      <li>Payments and cost · not connected</li>
    </ul>
    <p class="muted small">Connectors are out of scope for the prototype. The evidence repository and the pilot segments show the shape the data would take.</p>
  </div>`;
}
