import * as seed from '../data/seed.js';
import { html, raw, badge, notice, section, person, fmtDate, selectField, lede } from '../ui.js';
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
    <td><input type="text" name="sc-name" value="${sc.name || ''}" maxlength="60" placeholder="Short name" aria-label="Test case name"></td>
    <td><input type="text" name="sc-situation" value="${sc.situation || ''}" maxlength="240" placeholder="What the AI sees" aria-label="Situation"></td>
    <td><input type="text" name="sc-expected" value="${sc.expected || ''}" maxlength="200" placeholder="What it should do" aria-label="What it should do"></td>
    <td>${sc.source === 'ai' ? html`<span class="badge badge-insufficient">Suggested by AI</span>` : html`<span class="muted small">Written by your team</span>`}</td>
    <td><button class="btn btn-sm btn-ghost" type="button" data-action="row-remove" aria-label="Remove test case ${i + 1}">Remove</button></td>
  </tr>`;
  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a> · Setup step 5</p>
      <h1>Test cases</h1>
      ${lede(`Realistic cases to test ${cap.name} on, in five types: standard, ambiguous, adversarial, high impact and edge cases.`, html`In this demo, each case gets a fixed simulated result, so the same case always gives the same answer. ${d.testRun.lastRun ? 'Saving changes clears the last run; run the tests again to get new results.' : ''}`)}
    </div>
    <div class="page-actions">${hasStarter ? '' : html`<button class="btn" data-action="starter-add" data-capability="${cap.id}">Add 20 suggested cases</button><p class="muted small">Suggested by AI for ${cap.name}: four of each type. Edit or remove any of them.</p>`}</div>
  </div>
  ${error ? notice('fail', 'Couldn\'t save the test cases', error) : ''}
  <div class="card progress-card"><div class="progress-facts">
    <div><span class="fact-label">Test cases</span><strong>${list.length}</strong></div>
    ${seed.SCENARIO_GROUPS.map((g) => html`<div><span class="fact-label">${g.name}</span><strong>${counts[g.id]}</strong></div>`)}
  </div><p class="muted small">${scenarioNudge(list.length)}</p></div>
  <form class="setup-form criteria-form" data-form="save-scenarios" novalidate>
    <div class="card table-card"><table class="table table-edit table-scenarios">
      <thead><tr><th>Type</th><th>Name</th><th>Situation</th><th>What it should do</th><th>Source</th><th></th></tr></thead>
      <tbody data-rows="scenarios">${list.map(row)}</tbody>
    </table></div>
    <button class="btn btn-sm" type="button" data-action="row-add" data-kind="scenarios">Add a case</button>
    <div class="card authorize">
      <p class="eyebrow">Save</p>
      <p class="muted small">Saving as <strong>${acting.name}</strong>, ${acting.role}. This replaces the test cases for ${cap.name}. New or changed cases get a simulated result.</p>
      <button class="btn btn-primary btn-block" type="submit">Save test cases</button>
    </div>
  </form>
  <template id="row-scenarios">${row({ group: 'standard', name: '', situation: '', expected: '', source: 'person' }, 0)}</template>`;
}

export function evidenceSourcesCard() {
  return html`<div class="card sources-card">
    <p class="eyebrow">Where evidence comes from</p>
    <p>In a real deployment, evidence would come in from the tools your team already uses: test tools, the ticketing system, reviewer decisions, payments and model cost reports. Authority Lab would collect it and use it to decide how much the AI may do.</p>
    <ul class="plain-list muted small">
      <li>Test tools · not connected (this demo replays saved results)</li>
      <li>Ticketing system · not connected</li>
      <li>Reviewer decisions · not connected</li>
      <li>Payments and cost · not connected</li>
    </ul>
    <p class="muted small">This demo doesn't connect to outside tools. The evidence and the pilot segments show what the data would look like.</p>
  </div>`;
}
