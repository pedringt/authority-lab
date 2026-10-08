import * as seed from '../data/seed.js';
import { html, raw, badge, notice, section, person, fmtDate } from '../ui.js';
import { getCapability, current, versionList, actor, criteriaSaved, criteriaLocked, defaultsFor, versionsInForce, CORE_CRITERIA, CORE_REQUIREMENTS } from '../store/index.js';

// Editor for success criteria and evidence requirements (#6). Before the
// first test run the editors are open and every save is a new version. After
// the first run they are read-only and changes go through an amendment (#7).
export function criteriaEditorView(state, capabilityId, query) {
  const cap = getCapability(state, capabilityId);
  if (!cap) return html`<div class="page-head"><h1>Capability not found</h1></div>`;
  const error = query.get('error');
  const acting = person(actor(state, capabilityId));
  const saved = criteriaSaved(state, capabilityId);
  const locked = criteriaLocked(state, capabilityId);
  const defaults = defaultsFor(state, capabilityId);
  const risk = current(state, capabilityId, 'risk');
  const criteria = saved ? current(state, capabilityId, 'criteria') : defaults.criteria;
  const requirements = saved ? current(state, capabilityId, 'requirements') : defaults.requirements;
  const v = versionsInForce(state, capabilityId);

  if (locked) {
    return html`<div class="page-head"><div><p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a> · Setup step 3</p><h1>Success criteria and evidence requirements</h1><p class="lede">Locked. Performance results have been seen for ${cap.name}, so criteria v${v.criteria} and requirements v${v.requirements} cannot be edited in place.</p></div></div>
      ${notice('watch', 'Criteria are locked', 'Changing the bar after seeing results needs a proposed amendment with sign-off. The current versions are on the capability page.', { link: `#/capabilities/${cap.id}?tab=criteria`, linkText: 'Success criteria' })}
      <a class="btn btn-primary" href="#/capabilities/${cap.id}/amend/criteria">Propose amendment</a>`;
  }

  const row = (c, i) => html`<tr>
    <td><input type="hidden" name="c-id" value="${c.id || ''}"><input type="hidden" name="c-source" value="${c.source || ''}"><input type="text" name="c-name" value="${c.name}" maxlength="60" aria-label="Criterion name" required></td>
    <td><input type="text" name="c-target" value="${c.target}" maxlength="120" aria-label="Target" required></td>
    <td><input type="text" name="c-note" value="${c.note || ''}" maxlength="240" aria-label="Note"></td>
    <td class="muted small">${c.source || 'Written by hand'}</td>
    <td>${CORE_CRITERIA.includes(c.id) ? html`<span class="muted small" title="Core row: adjust the threshold, but it cannot be removed">Core</span>` : html`<button class="btn btn-sm btn-ghost" type="button" data-action="row-remove" aria-label="Remove criterion ${i + 1}">Remove</button>`}</td>
  </tr>`;
  const rrow = (r, i) => html`<tr>
    <td><input type="hidden" name="r-id" value="${r.id || ''}"><input type="hidden" name="r-source" value="${r.source || ''}"><input type="text" name="r-text" value="${r.text}" maxlength="120" aria-label="Requirement" required></td>
    <td class="muted small">${r.source || 'Written by hand'}</td>
    <td>${CORE_REQUIREMENTS.includes(r.id) ? html`<span class="muted small" title="Core row: adjust the count, but it cannot be removed">Core</span>` : html`<button class="btn btn-sm btn-ghost" type="button" data-action="row-remove" aria-label="Remove requirement ${i + 1}">Remove</button>`}</td>
  </tr>`;

  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a> · Setup step 3</p>
      <h1>Success criteria and evidence requirements</h1>
      <p class="lede">What good looks like, as thresholds, and what must be true before the first authority change. ${saved ? `Criteria v${v.criteria} and requirements v${v.requirements} are saved; every save writes a new version.` : `Defaults come from the risk profile (${risk.impact || 'unknown'} impact, ${(risk.exposure || 'unknown').toLowerCase()}${risk.reversibility === 'Difficult to reverse' ? ', difficult to reverse' : ''}); each row says where it came from.`} These lock on the first test run.</p>
    </div>
  </div>
  ${error ? notice('fail', 'Could not save', error) : ''}
  <form class="setup-form criteria-form" data-form="save-criteria" novalidate>
    ${section('Success criteria', html`<div class="card table-card"><table class="table table-edit">
      <thead><tr><th>Criterion</th><th>Target</th><th>Note</th><th>Source</th><th></th></tr></thead>
      <tbody data-rows="criteria">${criteria.map(row)}</tbody>
    </table></div>
    <button class="btn btn-sm" type="button" data-action="row-add" data-kind="criteria">Add criterion</button>`, { subtitle: 'Measurable thresholds. "Current" values are filled by evidence, not typed here.' })}

    ${section('Evidence requirements', html`<div class="card table-card"><table class="table table-edit">
      <thead><tr><th>Must be true before the first authority change</th><th>Source</th><th></th></tr></thead>
      <tbody data-rows="requirements">${requirements.map(rrow)}</tbody>
    </table></div>
    <button class="btn btn-sm" type="button" data-action="row-add" data-kind="requirements">Add requirement</button>`, { subtitle: 'A checklist, not a score. Readiness is "N of M met".' })}

    <div class="card authorize">
      <p class="eyebrow">Save</p>
      <label class="field field-stack"><span>Reason <span class="muted small">(required if a risk-derived default is loosened or removed; otherwise optional)</span></span><input type="text" name="reason" maxlength="200" placeholder="${saved ? 'What changed and why.' : 'Saved before testing.'}"></label>
      <p class="muted small">Core rows (a quality threshold, a severe-error threshold, a minimum case count) can be adjusted but not removed. Lowering a default threshold, reducing a case count or removing a default row is kept on the version with your reason.</p>
      <p class="muted small">Saving as <strong>${acting.name}</strong>, ${acting.role}, writes ${saved ? `criteria v${v.criteria + 1} and requirements v${v.requirements + 1}` : 'criteria v1 and requirements v1'} for ${cap.name}, dated ${fmtDate(state.today)}. Until the first test run you can save again; after it, changes need a proposed amendment.</p>
      <button class="btn btn-primary btn-block" type="submit">${saved ? 'Save new versions' : 'Save criteria and requirements'}</button>
    </div>
  </form>
  <template id="row-criteria">${row({ id: '', name: '', target: '', note: '', source: 'Written by hand' }, 0)}</template>
  <template id="row-requirements">${rrow({ id: '', text: '', source: 'Written by hand' }, 0)}</template>`;
}
