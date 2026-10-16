import * as seed from '../data/seed.js';
import { html, raw, notice, section, person, fmtDate, selectField, lede } from '../ui.js';
import { getCapability, current, versionList, actor, STANCES, versionsInForce, needsSignoff, openProposal, activePeople, people } from '../store/index.js';

export function stakeholdersEditorView(state, capabilityId, query) {
  const cap = getCapability(state, capabilityId);
  if (!cap) return html`<div class="page-head"><h1>Capability not found</h1></div>`;
  const error = query.get('error');
  const acting = person(actor(state, capabilityId));
  const list = current(state, capabilityId, 'stakeholders');
  const existing = list.length ? list : [{ team: people(state)[cap.owner].team, person: cap.owner, stance: 'undecided', position: '', quote: '' }];
  const choices = Object.entries(activePeople(state)).map(([k, p]) => [k, `${p.name}, ${p.role}`]);
  const v = versionsInForce(state, capabilityId).stakeholders;
  const row = (st, i) => html`<tr>
    <td><input type="hidden" name="s-position" value="${st.position || ''}"><input type="hidden" name="s-stance-was" value="${st.stance || ''}"><input type="hidden" name="s-role" value="${st.role === 'reviewer' ? 'reviewer' : ''}"><input type="text" name="s-team" value="${st.team || ''}" maxlength="40" placeholder="e.g. Risk" aria-label="Team"></td>
    <td>${selectField(`s-person`, '', choices, st.person || '', { placeholder: 'Choose a person' })}</td>
    <td><select name="s-stance" aria-label="Position">${STANCES.map(([k, l]) => html`<option value="${k}" ${k === (st.stance || 'undecided') ? raw('selected') : ''}>${l}</option>`)}</select></td>
    <td><input type="text" name="s-quote" value="${st.quote || ''}" maxlength="240" placeholder="Their reasoning, in their words" aria-label="Their reasoning"></td>
    <td><button class="btn btn-sm btn-ghost" type="button" data-action="row-remove" aria-label="Remove stakeholder ${i + 1}">Remove</button></td>
  </tr>`;
  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a> · Setup step 4</p>
      <h1>Stakeholders</h1>
      ${lede('The people whose view counts when this AI\'s authority changes.', 'Add them now and fill in positions when you know them. Positions are shown side by side, never averaged into a score. For high-impact or financial AI, changes need two approvals, one of them from a stakeholder with the Risk approver right. That right is set on People; the team typed here doesn\'t make anyone a Risk approver.')}
    </div>
  </div>
  ${error ? notice('fail', 'Couldn\'t save', error) : ''}
  ${needsSignoff(state, capabilityId, 'stakeholders') ? notice('watch', 'Adding or removing people now needs approval', 'Now that results exist, adding or removing someone, or changing their team, is submitted for approval. Updates to positions and reasoning still save straight away. Who counts as Risk comes from the Risk approver right on People, not from the team in this list.', { link: '#/people', linkText: 'People' }) : ''}
  ${openProposal(state, capabilityId, 'stakeholders') ? notice('decision', 'A stakeholder change needs approval', 'Someone already proposed a stakeholder change. It has to be approved, rejected or withdrawn before another can be proposed.', { link: `#/capabilities/${cap.id}/proposals/${openProposal(state, capabilityId, 'stakeholders').id}`, linkText: 'Open' }) : ''}
  <form class="setup-form criteria-form" data-form="save-stakeholders" novalidate>
    <div class="card table-card"><table class="table table-edit">
      <thead><tr><th>Team</th><th>Person</th><th>Position</th><th>In their words</th><th></th></tr></thead>
      <tbody data-rows="stakeholders">${existing.map(row)}</tbody>
    </table></div>
    <button class="btn btn-sm" type="button" data-action="row-add" data-kind="stakeholders">Add stakeholder</button>
    <div class="card authorize">
      <p class="eyebrow">Save</p>
      <p class="muted small">Saving as <strong>${acting.name}</strong>, ${acting.role}. Changes are kept in history.${needsSignoff(state, capabilityId, 'stakeholders') ? ' If you add or remove someone, the change is submitted for approval instead.' : ''}</p>
      <button class="btn btn-primary btn-block" type="submit">${v ? 'Save changes' : 'Save stakeholders'}</button>
    </div>
  </form>
  <template id="row-stakeholders">${row({ team: '', person: '', stance: 'undecided', quote: '' }, 0)}</template>`;
}
