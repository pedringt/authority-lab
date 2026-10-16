import * as seed from '../data/seed.js';
import { html, raw, badge, notice, section, person, fmtDate, lede } from '../ui.js';
import { getCapability, current, versionList, actor, criteriaSaved, criteriaLocked, defaultsFor, versionsInForce, CORE_CRITERIA, CORE_REQUIREMENTS, resultsLockWarning, isCoverageRule } from '../store/index.js';

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
    return html`<div class="page-head"><div><p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a> · Setup step 3</p><h1>Targets and decision requirements</h1><p class="lede">These targets can't be changed directly now that results exist.</p></div></div>
      ${notice('watch', 'Propose a change instead', 'Submit a target change for review. It takes effect once it is approved. The current targets are on the capability page.', { link: `#/capabilities/${cap.id}?tab=decide&show=targets`, linkText: 'Current targets' })}
      <a class="btn btn-primary" href="#/capabilities/${cap.id}/amend/criteria">Propose a target change</a>`;
  }

  if (cap.setup) return setupChecksView(state, cap, { error, acting, saved, defaults, criteria: saved ? criteria : [], requirements: saved ? requirements : defaults.requirements.filter((r) => CORE_REQUIREMENTS.includes(r.id)) });

  const row = (c, i) => html`<tr>
    <td><input type="hidden" name="c-id" value="${c.id || ''}"><input type="hidden" name="c-requirement" value="${c.requirement || ''}"><input type="hidden" name="c-source" value="${c.source || ''}"><input type="text" name="c-name" value="${c.name}" maxlength="60" aria-label="Measure" required></td>
    <td><input type="text" name="c-target" value="${c.target}" maxlength="120" aria-label="Target" required></td>
    <td><input type="text" name="c-note" value="${c.note || ''}" maxlength="240" aria-label="Note"></td>
    <td class="muted small">${c.source || 'Written by hand'}</td>
    <td>${CORE_CRITERIA.includes(c.id) ? html`<span class="muted small" title="You can change the threshold but not remove this row.">Required</span>` : html`<button class="btn btn-sm btn-ghost" type="button" data-action="row-remove" aria-label="Remove target ${i + 1}">Remove</button>`}</td>
  </tr>`;
  const rrow = (r, i) => html`<tr>
    <td><input type="hidden" name="r-id" value="${r.id || ''}"><input type="hidden" name="r-kind" value="${r.kind || ''}"><input type="hidden" name="r-source" value="${r.source || ''}"><input type="text" name="r-text" value="${r.text}" maxlength="120" aria-label="Check" required></td>
    <td class="muted small">${r.source || 'Written by hand'}</td>
    <td>${CORE_REQUIREMENTS.includes(r.id) ? html`<span class="muted small" title="You can change the number but not remove this row.">Required</span>` : html`<button class="btn btn-sm btn-ghost" type="button" data-action="row-remove" aria-label="Remove check ${i + 1}">Remove</button>`}</td>
  </tr>`;

  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a> · Setup step 3</p>
      <h1>Targets and decision requirements</h1>
      ${lede('What good looks like, in numbers, and what we need before giving the AI any authority.', html`${saved ? 'Saved. Changes are kept in history.' : `Starting values come from the risk profile (${risk.impact || 'unknown'} impact, ${(risk.exposure || 'unknown').toLowerCase()}${risk.reversibility === 'Difficult to reverse' ? ', difficult to reverse' : ''}). Each row shows where it came from.`} Once the first test runs, these can only be changed with approval.`)}
    </div>
  </div>
  ${error ? notice('fail', 'Couldn\'t save', error) : ''}
  <form class="setup-form criteria-form" data-form="save-criteria" novalidate>
    ${section('Targets', html`<div class="card table-card"><table class="table table-edit">
      <thead><tr><th>Measure</th><th>Target</th><th>Note</th><th>Source</th><th></th></tr></thead>
      <tbody data-rows="criteria">${criteria.map(row)}</tbody>
    </table></div>
    <button class="btn btn-sm" type="button" data-action="row-add" data-kind="criteria">Add target</button>`, { subtitle: 'Numbers to hit. Current results come from testing and the pilot, not typed here.' })}

    ${section('Decision requirements', html`<div class="card table-card"><table class="table table-edit">
      <thead><tr><th>Must be true before the AI gets any authority</th><th>Source</th><th></th></tr></thead>
      <tbody data-rows="requirements">${requirements.map(rrow)}</tbody>
    </table></div>
    <button class="btn btn-sm" type="button" data-action="row-add" data-kind="requirements">Add check</button>`, { subtitle: 'What we need before expanding. A checklist, not a score: "Ready for a decision?" shows as "X of Y checks met".' })}

    <div class="card authorize">
      <p class="eyebrow">Save</p>
      <label class="field field-stack"><span>Why are you changing this? <span class="muted small">(Required if you lower or remove a starting value from the risk profile.)</span></span><input type="text" name="reason" maxlength="200" placeholder="${saved ? 'What changed and why.' : 'e.g. First version, before testing.'}"></label>
      <p class="muted small">Targets are optional: keep only the ones that make sense to measure, and write "Needs decision" where the number isn't settled yet. The minimum-cases row can be adjusted but not removed. If you lower a starting value or remove a row, your reason is saved with the change.</p>
      <p class="muted small">Saving as <strong>${acting.name}</strong>, ${acting.role}. Changes are kept in history. You can keep editing until the first test runs; after that, changes need approval.</p>
      <button class="btn btn-primary btn-block" type="submit">${saved ? 'Save changes' : 'Save targets'}</button>
    </div>
  </form>
  <template id="row-criteria">${row({ id: '', name: '', target: '', note: '', source: 'Written by hand' }, 0)}</template>
  <template id="row-requirements">${rrow({ id: '', text: '', source: 'Written by hand' }, 0)}</template>`;
}

// Requirements, then Targets only where a Requirement needs a measurable bar
// (#139). Suggestions are listed apart and added one by one, by ticking each;
// none has a number. The minimum-cases coverage rule is always there, and its
// number starts as Needs decision.
function setupChecksView(state, cap, { error, acting, saved, defaults, criteria, requirements }) {
  const reqIds = new Set(requirements.map((r) => r.id));
  const tIds = new Set(criteria.map((c) => c.id));
  const sugReqs = defaults.requirements.filter((r) => !reqIds.has(r.id));
  const sugTargets = defaults.criteria.filter((c) => !tIds.has(c.id));
  const reqChoices = requirements.map((r) => [r.id, r.text]);
  const warn = resultsLockWarning(state, cap.id);
  const rrow = (r, i) => html`<tr>
    <td><input type="hidden" name="r-id" value="${r.id || ''}"><input type="hidden" name="r-kind" value="${r.kind || ''}"><input type="hidden" name="r-source" value="${r.source || ''}"><input type="text" name="r-text" value="${r.text}" maxlength="120" aria-label="Requirement" required>${r.bar === 'needs-decision' ? html`<span class="muted small">Coverage rule: replace "Needs decision" with the number, e.g. "Minimum 50 cases", when you've decided.</span>` : ''}</td>
    <td>${r.bar === 'needs-decision' ? badge('decision', 'Needs decision') : isCoverageRule(r) ? html`<span class="muted small">Coverage rule</span>` : ''}</td>
    <td class="muted small">${r.source || 'Written by hand'}</td>
    <td>${CORE_REQUIREMENTS.includes(r.id) ? html`<span class="muted small" title="You can set its number but not remove it.">Required</span>` : html`<button class="btn btn-sm btn-ghost" type="button" data-action="row-remove" aria-label="Remove requirement ${i + 1}">Remove</button>`}</td>
  </tr>`;
  const trow = (c, i) => html`<tr>
    <td><input type="hidden" name="c-id" value="${c.id || ''}"><input type="hidden" name="c-source" value="${c.source || ''}"><input type="text" name="c-name" value="${c.name}" maxlength="60" aria-label="Measure" required></td>
    <td><input type="text" name="c-target" value="${c.target}" maxlength="120" aria-label="Bar" placeholder="e.g. ≥ 90%, or Needs decision" required></td>
    <td><select name="c-requirement" aria-label="For requirement"><option value="">Not tied to one</option>${reqChoices.map(([id, text]) => html`<option value="${id}" ${id === c.requirement ? raw('selected') : ''}>${text}</option>`)}</select></td>
    <td><input type="text" name="c-note" value="${c.note || ''}" maxlength="240" aria-label="Note"></td>
    <td><button class="btn btn-sm btn-ghost" type="button" data-action="row-remove" aria-label="Remove target ${i + 1}">Remove</button></td>
  </tr>`;
  const pick = (kind, row, label, extra) => html`<li><label class="check"><input type="checkbox" name="use-suggestion" value="${JSON.stringify({ kind, row })}"><span><strong>${label}</strong> ${badge('insufficient', row.source)}${extra ? html` <span class="muted small">${extra}</span>` : ''}</span></label></li>`;
  return html`<div class="page-head"><div>
    <p class="eyebrow"><a href="#/capabilities/${cap.id}/setup">${cap.name} · Setup</a></p>
    <h1>Requirements and Targets</h1>
    ${lede('What must be true before we\'d consider giving it more authority and, only where it can be measured, the bar that judges it.', 'Suggestions say where they came from and never set a number: a measurable one comes with a Target whose bar is Needs decision until you choose it. Tick each suggestion you want; nothing is added for you.')}
  </div></div>
  ${error ? notice('fail', 'Couldn\'t save', error) : ''}
  ${warn ? notice('watch', 'Before you record results', warn) : ''}
  <form class="setup-form criteria-form" data-form="save-criteria" novalidate>
    ${section('Requirements', html`<div class="card table-card"><table class="table table-edit">
      <thead><tr><th>What must be true</th><th></th><th>Source</th><th></th></tr></thead>
      <tbody data-rows="requirements">${requirements.map(rrow)}</tbody>
    </table></div>
    <button class="btn btn-sm" type="button" data-action="row-add" data-kind="requirements">Add a Requirement</button>
    ${sugReqs.length ? html`<div class="card"><p class="fact-label">Suggested Requirements</p><ul class="plain-list">${sugReqs.map((r) => pick('requirement', r, r.text, r.why || (defaults.criteria.some((c) => c.requirement === r.id) ? 'measurable: its Target is suggested below' : '')))}</ul></div>` : ''}`, { subtitle: 'Safety, evidence, sample size, recency, approval or policy conditions. A coverage rule says how much evidence is enough to judge.' })}
    ${section('Targets', html`<div class="card table-card"><table class="table table-edit">
      <thead><tr><th>Measure</th><th>Bar</th><th>For requirement</th><th>Note</th><th></th></tr></thead>
      <tbody data-rows="criteria">${criteria.map(trow)}</tbody>
    </table></div>
    <button class="btn btn-sm" type="button" data-action="row-add" data-kind="criteria">Add a Target</button>
    ${sugTargets.length ? html`<div class="card"><p class="fact-label">Suggested Targets (bar: Needs decision)</p><ul class="plain-list">${sugTargets.map((c) => pick('target', c, c.name, `for "${(defaults.requirements.find((r) => r.id === c.requirement) || {}).text || c.requirement}". Add that Requirement too.`))}</ul></div>` : ''}`, { subtitle: 'Optional. Only where a Requirement needs a measurable bar. "Needs decision" is unresolved: never a pass, never a fail.' })}
    <div class="card authorize">
      <p class="eyebrow">Save</p>
      <label class="field field-stack"><span>Why? <span class="muted small">(Required when you leave out a suggestion or remove a row.)</span></span><input type="text" name="reason" maxlength="200" placeholder="e.g. Speed doesn't matter for this capability."></label>
      <p class="muted small">Saving as <strong>${acting.name}</strong>, ${acting.role}. Changes are kept in history.</p>
      <button class="btn btn-primary btn-block" type="submit">${saved ? 'Save changes' : 'Save Requirements and Targets'}</button>
    </div>
  </form>
  <template id="row-criteria">${trow({ id: '', name: '', target: '', note: '', source: 'Written by hand' }, 0)}</template>
  <template id="row-requirements">${rrow({ id: '', text: '', source: 'Written by hand' }, 0)}</template>`;
}
