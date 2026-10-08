import { html, raw, badge, notice, section, person, fmtDateYear, fmtDate, kv } from '../ui.js';
import { people, activePeople, actor, isWorkspaceAdmin, rosterVersions, isActivePerson } from '../store.js';
import { diffTable } from './activity.js';

// The people roster (#22). Workspace admins add, edit and deactivate; nobody
// deletes. Rights are shown here and changed through #23.
export function peopleView(state, query) {
  const error = query.get('error');
  const acting = actor(state);
  const admin = isWorkspaceAdmin(state, acting);
  const who = person(acting);
  const roster = people(state);
  const editing = query.get('edit');
  const deactivating = query.get('deactivate');
  const showInactive = query.get('inactive') === '1';
  const entries = Object.entries(roster).filter(([, p]) => showInactive || p.active !== false);
  const admins = Object.values(roster).filter((p) => p.active !== false && p.rights && p.rights.workspaceAdmin).length;
  const riskApprovers = Object.values(roster).filter((p) => p.active !== false && p.rights && p.rights.riskApprover).length;

  const row = ([key, p]) => {
    if (editing === key && admin) {
      return html`<tr class="is-editing"><td colspan="6">
        <form class="line-edit people-form" data-form="edit-person" data-person="${key}">
          <input type="text" name="name" value="${p.name}" maxlength="60" aria-label="Name" required>
          <input type="text" name="title" value="${p.role}" maxlength="80" aria-label="Title" required>
          <input type="text" name="team" value="${p.team}" maxlength="40" aria-label="Team" required>
          <input type="text" name="reason" placeholder="Reason for the change" maxlength="200" aria-label="Reason" required>
          <button class="btn btn-sm btn-primary" type="submit">Save</button>
          <a class="btn btn-sm btn-ghost" href="#/people">Cancel</a>
        </form>
      </td></tr>`;
    }
    if (deactivating === key && admin) {
      return html`<tr class="is-editing"><td colspan="6">
        <form class="line-edit people-form" data-form="deactivate-person" data-person="${key}">
          <span><strong>Deactivate ${p.name}?</strong> <span class="muted small">They stay on every record they are on; they can no longer act, propose, approve or be a stakeholder.</span></span>
          <input type="text" name="reason" placeholder="Reason" maxlength="200" aria-label="Reason" required>
          <button class="btn btn-sm btn-danger" type="submit">Deactivate</button>
          <a class="btn btn-sm btn-ghost" href="#/people">Cancel</a>
        </form>
      </td></tr>`;
    }
    return html`<tr class="${p.active === false ? 'is-inactive' : ''}">
      <td><strong>${p.name}</strong>${p.active === false ? html` ${badge('neutral', 'Deactivated')}` : ''}</td>
      <td>${p.role}</td>
      <td>${p.team}</td>
      <td>${p.rights && p.rights.workspaceAdmin ? badge('decision', 'Workspace admin') : ''} ${p.rights && p.rights.riskApprover ? badge('restricted', 'Risk approver') : ''}</td>
      <td class="muted small">${key === acting ? 'Acting now' : ''}</td>
      <td>${admin && p.active !== false ? html`<a class="btn btn-sm btn-ghost" href="#/people?edit=${key}">Edit</a> <a class="btn btn-sm btn-ghost" href="#/people?deactivate=${key}">Deactivate</a>` : ''}</td>
    </tr>`;
  };

  const versions = rosterVersions(state).slice().reverse();

  return html`<div class="page-head">
    <div>
      <p class="eyebrow">Northstar Support</p>
      <h1>People</h1>
      <p class="lede">Everyone who can act in this workspace. Rights are explicit and recorded: <strong>workspace admin</strong> changes the roster; <strong>Risk approver</strong> can sign off as Risk. Nobody is deleted; records keep referring to people after they are deactivated.</p>
    </div>
  </div>
  ${error ? notice('fail', 'Could not change the roster', error) : ''}
  ${admin ? '' : notice('neutral', `Acting as ${who.name}, who is not a workspace admin`, 'Only a workspace admin adds, edits or deactivates people. Switch who is acting in the top bar to see the controls.')}
  <div class="card progress-card"><div class="progress-facts">
    <div><span class="fact-label">Active people</span><strong>${Object.keys(activePeople(state)).length}</strong></div>
    <div><span class="fact-label">Workspace admins</span><strong>${admins}</strong></div>
    <div><span class="fact-label">Risk approvers</span><strong>${riskApprovers}</strong></div>
    <div><span class="fact-label">Roster version</span><strong>v${rosterVersions(state).length}</strong></div>
  </div></div>
  <div class="card table-card"><table class="table table-people">
    <thead><tr><th>Name</th><th>Title</th><th>Team</th><th>Rights</th><th></th><th></th></tr></thead>
    <tbody>${entries.map(row)}</tbody>
  </table></div>
  <p class="muted small"><a href="#/people?inactive=${showInactive ? '0' : '1'}">${showInactive ? 'Hide' : 'Show'} deactivated people</a> · Rights are granted and removed through a proposal signed off by a different workspace admin (coming with #23).</p>
  ${admin ? section('Add a person', html`<form class="setup-form" data-form="add-person"><div class="card">
    <div class="three-col">
      <label class="field field-stack"><span>Name</span><input type="text" name="name" maxlength="60" required></label>
      <label class="field field-stack"><span>Title</span><input type="text" name="title" maxlength="80" required></label>
      <label class="field field-stack"><span>Team</span><input type="text" name="team" maxlength="40" required></label>
    </div>
    <label class="field field-stack"><span>Reason</span><input type="text" name="reason" maxlength="200" placeholder="Why they are being added" required></label>
    <p class="muted small">Added by <strong>${who.name}</strong>, ${who.role}, as a new roster version. New people hold no rights.</p>
    <button class="btn btn-primary" type="submit">Add person</button>
  </div></form>`) : ''}
  ${section('Roster history', html`${versions.map((v) => html`<article class="card version"><div class="version-head"><div><span class="eyebrow">Roster · version ${v.version}</span><h3>${v.version === 1 ? 'Seed roster' : v.reason}</h3></div></div>
    ${kv([['Written', fmtDateYear(v.date)], ['By', v.author ? person(v.author).name : 'Seed'], ['Reason', v.reason]])}
    ${v.version > 1 ? html`<h4 class="version-sub">What changed from v${v.version - 1}</h4>${diffTable(flatten(v.before), flatten(v.value))}` : ''}
  </article>`)}`, { subtitle: 'Every change is a new version with its author and reason.' })}`;
}

function flatten(roster) {
  return Object.entries(roster || {}).map(([key, p]) => ({ id: key, name: p.name, title: p.role, team: p.team, active: p.active !== false ? 'active' : 'deactivated', rights: [p.rights && p.rights.workspaceAdmin ? 'workspace admin' : null, p.rights && p.rights.riskApprover ? 'Risk approver' : null].filter(Boolean).join(', ') || 'none' }));
}
