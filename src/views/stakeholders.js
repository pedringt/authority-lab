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
  // In setup (#139): one Owner, then Reviewers and Stakeholders. Positions
  // belong to decisions, so setup doesn't ask for them (they're kept as they are).
  if (cap.setup) {
    const srow = (st, i) => html`<tr>
      <td><input type="hidden" name="s-position" value="${st.position || ''}"><input type="hidden" name="s-stance-was" value="${st.stance || ''}"><input type="hidden" name="s-stance" value="${st.stance || 'undecided'}"><input type="hidden" name="s-quote" value="${st.quote || ''}">${selectField('s-person', '', choices, st.person || '', { placeholder: 'Choose a person' })}</td>
      <td><select name="s-role" aria-label="Role"><option value="" ${st.role === 'reviewer' ? '' : raw('selected')}>Stakeholder: involved or consulted</option><option value="reviewer" ${st.role === 'reviewer' ? raw('selected') : ''}>Reviewer: their input is required</option></select></td>
      <td><input type="text" name="s-team" value="${st.team || ''}" maxlength="40" placeholder="e.g. Risk" aria-label="Team"></td>
      <td><button class="btn btn-sm btn-ghost" type="button" data-action="row-remove" aria-label="Remove person ${i + 1}">Remove</button></td>
    </tr>`;
    return html`<div class="page-head"><div>
      <p class="eyebrow"><a href="#/capabilities/${cap.id}/setup">${cap.name} · Setup</a></p>
      <h1>People</h1>
      ${lede(html`Owner: <strong>${people(state)[cap.owner].name}</strong>, the one accountable person. Only the owner confirms the setup and records authority decisions.`, 'Reviewers are people whose input is required; Stakeholders are involved or consulted. Who may approve changes, and when a Risk approver is needed, follows the approval rules underneath, which don\'t change here. The Risk approver right is set on People.')}
    </div></div>
    ${error ? notice('fail', 'Couldn\'t save', error) : ''}
    ${needsSignoff(state, capabilityId, 'stakeholders') ? notice('watch', 'Results are in', 'Adding or removing someone, changing their team, or changing whether they are a Reviewer is now submitted for approval.') : notice('neutral', 'Before results', 'Once results are recorded, changing who is involved needs sign-off, even while setup is unconfirmed.')}
    <form class="setup-form criteria-form" data-form="save-stakeholders" novalidate>
      <div class="card table-card"><table class="table table-edit">
        <thead><tr><th>Person</th><th>Role</th><th>Team</th><th></th></tr></thead>
        <tbody data-rows="stakeholders">${list.map(srow)}</tbody>
      </table></div>
      <button class="btn btn-sm" type="button" data-action="row-add" data-kind="stakeholders">Add a person</button>
      <div class="card authorize"><p class="muted small">Saving as <strong>${acting.name}</strong>, ${acting.role}.</p><button class="btn btn-primary btn-block" type="submit">Save people</button></div>
    </form>
    <template id="row-stakeholders">${srow({ team: '', person: '', stance: 'undecided', quote: '' }, 0)}</template>`;
  }
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
