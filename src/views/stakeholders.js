import * as seed from '../data/seed.js';
import { html, raw, notice, section, person, fmtDateYear, selectField } from '../ui.js';
import { getCapability, current, versionList, actor, STANCES, versionsInForce } from '../store.js';

export function stakeholdersEditorView(state, capabilityId, query) {
  const cap = getCapability(state, capabilityId);
  if (!cap) return html`<div class="page-head"><h1>Capability not found</h1></div>`;
  const error = query.get('error');
  const acting = person(actor(state, capabilityId));
  const list = current(state, capabilityId, 'stakeholders');
  const existing = list.length ? list : [{ team: seed.people[cap.owner].team, person: cap.owner, stance: 'undecided', position: '', quote: '' }];
  const people = Object.entries(seed.people).map(([k, p]) => [k, `${p.name}, ${p.role}`]);
  const v = versionsInForce(state, capabilityId).stakeholders;
  const row = (st, i) => html`<tr>
    <td><input type="text" name="s-team" value="${st.team || ''}" maxlength="40" placeholder="e.g. Risk" aria-label="Team"></td>
    <td>${selectField(`s-person`, '', people, st.person || '', { placeholder: 'Choose a person' })}</td>
    <td><select name="s-stance" aria-label="Position">${STANCES.map(([k, l]) => html`<option value="${k}" ${k === (st.stance || 'undecided') ? raw('selected') : ''}>${l}</option>`)}</select></td>
    <td><input type="text" name="s-quote" value="${st.quote || ''}" maxlength="240" placeholder="Their reasoning, in their words" aria-label="Quote"></td>
    <td><button class="btn btn-sm btn-ghost" type="button" data-action="row-remove" aria-label="Remove stakeholder ${i + 1}">Remove</button></td>
  </tr>`;
  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a> · Setup step 4</p>
      <h1>Stakeholders</h1>
      <p class="lede">The people whose positions are recorded at decision time. Name them now; positions can be filled in when they are known and are never averaged into a score. A Risk stakeholder is needed to sign off amendments on high-impact or financial capabilities.</p>
    </div>
  </div>
  ${error ? notice('fail', 'Could not save', error) : ''}
  <form class="setup-form criteria-form" data-form="save-stakeholders" novalidate>
    <div class="card table-card"><table class="table table-edit">
      <thead><tr><th>Team</th><th>Person</th><th>Position</th><th>In their words</th><th></th></tr></thead>
      <tbody data-rows="stakeholders">${existing.map(row)}</tbody>
    </table></div>
    <button class="btn btn-sm" type="button" data-action="row-add" data-kind="stakeholders">Add stakeholder</button>
    <div class="card authorize">
      <p class="eyebrow">Save</p>
      <p class="muted small">Saving as <strong>${acting.name}</strong>, ${acting.role}, writes stakeholders v${v + 1} for ${cap.name}, dated ${fmtDateYear(state.today)}. Every save is a new version.</p>
      <button class="btn btn-primary btn-block" type="submit">${v ? 'Save new version' : 'Save stakeholders'}</button>
    </div>
  </form>
  <template id="row-stakeholders">${row({ team: '', person: '', stance: 'undecided', quote: '' }, 0)}</template>`;
}
