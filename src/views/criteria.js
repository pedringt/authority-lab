import * as seed from '../data/seed.js';
import { html, raw, badge, notice, section, person, fmtDate, lede } from '../ui.js';
import { getCapability, current, versionList, actor, criteriaSaved, criteriaLocked, defaultsFor, versionsInForce, CORE_CRITERIA, CORE_REQUIREMENTS, resultsLockWarning, isCoverageRule, JUDGMENTS, JUDGMENT_WORDS, effectiveJudgment } from '../store/index.js';

// How will you know this is true? (#143 review) Asked for every Requirement
// and stored on it, never inferred from its wording. A coverage rule is
// always judged by evidence.
export function judgmentField(r) {
  if (isCoverageRule(r)) return html`<span class="muted small">Judged by evidence (coverage rule)</span>`;
  // Pre-selected when the row already says it (stored, or a measure). An
  // older row that doesn't say is left unset until someone answers; a new
  // row must answer.
  const now = effectiveJudgment(r);
  const isNew = !r.id;
  return html`<select name="r-judgment" aria-label="How will you know this is true?" ${isNew ? raw('required') : ''}><option value="" ${now ? '' : raw('selected')}>${isNew ? 'How will you know this is true?' : 'Not set yet (older Requirement)'}</option>${JUDGMENTS.map((k) => html`<option value="${k}" ${now === k ? raw('selected') : ''}>${JUDGMENT_WORDS[k]}</option>`)}</select>`;
}

// Hard or consideration (#151, D3), asked for every Requirement. The
// minimum-cases row is the baseline amount of evidence and stays hard.
export function weightField(r) {
  if (r.id === 'min-cases') return html`<span class="muted small">Hard: blocks expansion until met</span>`;
  return html`<select name="r-weight" aria-label="Does it block expansion?"><option value="hard" ${r.consideration ? '' : raw('selected')}>Hard: blocks expansion until met</option><option value="consideration" ${r.consideration ? raw('selected') : ''}>Consideration: shown, doesn't block</option></select>`;
}

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
    return html`<div class="page-head"><div><p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a> · Setup step 3</p><h1>Targets and Requirements</h1><p class="lede">These targets can't be changed directly now that results exist.</p></div></div>
      ${notice('watch', 'Request a change instead', 'Submit a target change for review. It takes effect once it is approved. The current targets are on the capability page.', { link: `#/capabilities/${cap.id}?tab=decide&show=targets`, linkText: 'Current targets' })}
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
    <td><input type="hidden" name="r-id" value="${r.id || ''}"><input type="hidden" name="r-kind" value="${r.kind || ''}"><input type="hidden" name="r-source" value="${r.source || ''}"><input type="text" name="r-text" value="${r.text}" maxlength="120" aria-label="Requirement" required>${judgmentField(r)}${weightField(r)}</td>
    <td class="muted small">${r.source || 'Written by hand'}</td>
    <td>${CORE_REQUIREMENTS.includes(r.id) ? html`<span class="muted small" title="You can change the number but not remove this row.">Required</span>` : html`<button class="btn btn-sm btn-ghost" type="button" data-action="row-remove" aria-label="Remove check ${i + 1}">Remove</button>`}</td>
  </tr>`;

  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a> · Setup step 3</p>
      <h1>Targets and Requirements</h1>
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

    ${section('Requirements', html`<div class="card table-card"><table class="table table-edit">
      <thead><tr><th>Must be true before the AI gets any authority</th><th>Source</th><th></th></tr></thead>
      <tbody data-rows="requirements">${requirements.map(rrow)}</tbody>
    </table></div>
    <button class="btn btn-sm" type="button" data-action="row-add" data-kind="requirements">Add Requirement</button>`, { subtitle: 'What we need before expanding. A checklist, not a score. A hard Requirement blocks expansion until it is met; a consideration is shown to the person deciding but doesn\'t block.' })}

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
  // Requirements first (#153, D8): each Requirement asks what must be true,
  // how you'll know, and the bar if it's measurable. The bar is saved as the
  // Requirement's Target, so the model keeps both; a person sees one thing.
  const reqIds = new Set(requirements.map((r) => r.id));
  const tIds = new Set(criteria.map((c) => c.id));
  const firstTarget = new Map();
  for (const c of criteria) if (c.requirement && reqIds.has(c.requirement) && !firstTarget.has(c.requirement)) firstTarget.set(c.requirement, c);
  const inline = new Set([...firstTarget.values()].map((c) => c.id));
  const others = criteria.filter((c) => !inline.has(c.id));
  const sugReqs = defaults.requirements.filter((r) => !reqIds.has(r.id));
  const targetsFor = (id) => defaults.criteria.filter((c) => c.requirement === id && !tIds.has(c.id));
  const sugBars = defaults.criteria.filter((c) => !tIds.has(c.id) && reqIds.has(c.requirement));
  const reqChoices = requirements.map((r) => [r.id, r.text]);
  const warn = resultsLockWarning(state, cap.id);
  const barFields = (r, t) => (isCoverageRule(r)
    ? html`<p class="muted small">${r.bar === 'needs-decision' ? html`${badge('decision', 'Needs decision')} Replace "Needs decision" in the wording with the number, e.g. "Minimum 50 cases", when you've decided.` : 'Its number is in the wording: how many cases are enough to judge.'}</p>`
    : html`<div class="req-bar"><input type="hidden" name="rt-id" value="${t ? t.id : ''}"><input type="hidden" name="rt-source" value="${t ? t.source || '' : ''}"><input type="hidden" name="rt-note" value="${t ? t.note || '' : ''}">
      <label class="field"><span>Measured as</span><input type="text" name="rt-name" value="${t ? t.name : ''}" maxlength="60" placeholder="e.g. Factual error rate"></label>
      <label class="field"><span>Bar</span><input type="text" name="rt-target" value="${t ? t.target : ''}" maxlength="120" placeholder="e.g. ≤ 2%, or Needs decision"></label>
    </div><p class="muted small">Only when evidence shows it. Leave both empty if a person decides it, or if it isn't measured.</p>`);
  const rrow = (r, i) => html`<tr class="req-row">
    <td><input type="hidden" name="r-id" value="${r.id || ''}"><input type="hidden" name="r-kind" value="${r.kind || ''}"><input type="hidden" name="r-source" value="${r.source || ''}">
      <label class="field field-stack"><span>What must be true?</span><input type="text" name="r-text" value="${r.text}" maxlength="120" aria-label="What must be true?" required></label>
      <div class="req-how"><span class="fact-label">How will you know?</span> ${judgmentField(r)}</div>
      <div class="req-what-bar"><span class="fact-label">What bar, if measurable?</span>${barFields(r, firstTarget.get(r.id))}</div>
      <div class="req-blocks"><span class="fact-label">Does it block expansion?</span> ${weightField(r)}</div>
    </td>
    <td class="muted small">${r.source || 'Written by hand'}</td>
    <td>${CORE_REQUIREMENTS.includes(r.id) ? html`<span class="muted small" title="You can set its number but not remove it.">Required</span>` : html`<button class="btn btn-sm btn-ghost" type="button" data-action="row-remove" aria-label="Remove requirement ${i + 1}">Remove</button>`}</td>
  </tr>`;
  const trow = (c, i) => html`<tr>
    <td><input type="hidden" name="c-id" value="${c.id || ''}"><input type="hidden" name="c-source" value="${c.source || ''}"><input type="text" name="c-name" value="${c.name}" maxlength="60" aria-label="Measure" required></td>
    <td><input type="text" name="c-target" value="${c.target}" maxlength="120" aria-label="Bar" placeholder="e.g. ≥ 90%, or Needs decision" required></td>
    <td><select name="c-requirement" aria-label="For requirement"><option value="">Not tied to one</option>${reqChoices.map(([id, text]) => html`<option value="${id}" ${id === c.requirement ? raw('selected') : ''}>${text}</option>`)}</select></td>
    <td><input type="text" name="c-note" value="${c.note || ''}" maxlength="240" aria-label="Note"></td>
    <td><button class="btn btn-sm btn-ghost" type="button" data-action="row-remove" aria-label="Remove measure ${i + 1}">Remove</button></td>
  </tr>`;
  const pickReq = (r) => {
    const ts = targetsFor(r.id);
    return html`<li><label class="check"><input type="checkbox" name="use-suggestion" value="${JSON.stringify({ kind: 'requirement', row: r, targets: ts })}"><span><strong>${r.text}</strong> ${badge('insufficient', r.source)}${ts.length ? html` <span class="muted small">measured as ${ts.map((t) => t.name).join(', ')}, bar Needs decision</span>` : r.why ? html` <span class="muted small">${r.why}</span>` : ''}</span></label></li>`;
  };
  const pickBar = (c) => html`<li><label class="check"><input type="checkbox" name="use-suggestion" value="${JSON.stringify({ kind: 'target', row: c })}"><span><strong>${c.name}</strong> for "${(requirements.find((r) => r.id === c.requirement) || {}).text}" ${badge('insufficient', c.source)} <span class="muted small">bar Needs decision</span></span></label></li>`;
  return html`<div class="page-head"><div>
    <p class="eyebrow"><a href="#/capabilities/${cap.id}/setup">${cap.name} · Setup</a></p>
    <h1>Requirements</h1>
    ${lede('What must be true before we\'d consider giving it more authority, how you\'ll know, and the bar where it can be measured.', 'Suggestions say where they came from and never set a number: a measurable one comes with its bar as Needs decision until you choose it. Tick each suggestion you want; nothing is added for you. Each Requirement is hard (it blocks expansion until met) unless you make it a consideration.')}
  </div></div>
  ${error ? notice('fail', 'Couldn\'t save', error) : ''}
  ${warn ? notice('watch', 'Before you record results', warn) : ''}
  <form class="setup-form criteria-form" data-form="save-criteria" novalidate>
    ${section('Requirements', html`<div class="card table-card"><table class="table table-edit req-table">
      <thead><tr><th>Requirement</th><th>Source</th><th></th></tr></thead>
      <tbody data-rows="requirements">${requirements.map(rrow)}</tbody>
    </table></div>
    <button class="btn btn-sm" type="button" data-action="row-add" data-kind="requirements">Add a Requirement</button>
    ${sugReqs.length ? html`<div class="card"><p class="fact-label">Suggested Requirements</p><ul class="plain-list">${sugReqs.map(pickReq)}</ul></div>` : ''}
    ${sugBars.length ? html`<div class="card"><p class="fact-label">Suggested bars for your Requirements</p><ul class="plain-list">${sugBars.map(pickBar)}</ul></div>` : ''}`, { subtitle: 'Safety, evidence, sample size, recency, approval or policy conditions. A coverage rule says how much evidence is enough to judge.' })}
    <details class="card other-measures"${others.length ? raw(' open') : ''}><summary>Other measures${others.length ? ` (${others.length})` : ''} <span class="muted small">optional: a second bar for a Requirement, or a measure not tied to one</span></summary>
      <table class="table table-edit">
        <thead><tr><th>Measure</th><th>Bar</th><th>For requirement</th><th>Note</th><th></th></tr></thead>
        <tbody data-rows="criteria">${others.map(trow)}</tbody>
      </table>
      <button class="btn btn-sm" type="button" data-action="row-add" data-kind="criteria">Add a measure</button>
      <p class="muted small">"Needs decision" is unresolved: never a pass, never a fail.</p>
    </details>
    <div class="card authorize">
      <p class="eyebrow">Save</p>
      <label class="field field-stack"><span>Why? <span class="muted small">(Required when you leave out a suggestion or remove a row.)</span></span><input type="text" name="reason" maxlength="200" placeholder="e.g. Speed doesn't matter for this capability."></label>
      <p class="muted small">Saving as <strong>${acting.name}</strong>, ${acting.role}. Changes are kept in history.</p>
      <button class="btn btn-primary btn-block" type="submit">${saved ? 'Save changes' : 'Save Requirements'}</button>
    </div>
  </form>
  <template id="row-criteria">${trow({ id: '', name: '', target: '', note: '', source: 'Written by hand' }, 0)}</template>
  <template id="row-requirements">${rrow({ id: '', text: '', source: 'Written by hand' }, 0)}</template>`;
}
