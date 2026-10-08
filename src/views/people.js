import { html, raw, badge, notice, section, person, fmtDateYear, fmtDate, kv } from '../ui.js';
import { people, activePeople, actor, isWorkspaceAdmin, rosterVersions, isActivePerson, RIGHTS, RIGHT_LABELS, openRosterProposal, getRosterProposal, rosterApprovalEligibility, activeAdmins } from '../store.js';
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
  const rightKey = query.get('right');
  const rightPerson = query.get('person');
  const rightGrant = query.get('grant') === '1';
  const focusProposal = query.get('proposal');
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
          <span><strong>Deactivate ${p.name}?</strong> <span class="muted small">They stay on every record they are on; they can no longer act, propose, approve or be a stakeholder.${p.rights && (p.rights.workspaceAdmin || p.rights.riskApprover) ? ' They hold a right, so this becomes a proposal for a different workspace admin to approve.' : ''}</span></span>
          <input type="text" name="reason" placeholder="Reason" maxlength="200" aria-label="Reason" required>
          <button class="btn btn-sm btn-danger" type="submit">Deactivate</button>
          <a class="btn btn-sm btn-ghost" href="#/people">Cancel</a>
        </form>
      </td></tr>`;
    }
    if (rightPerson === key && RIGHT_LABELS[rightKey] && admin) {
      return html`<tr class="is-editing"><td colspan="6">
        <form class="line-edit people-form" data-form="propose-roster" data-person="${key}" data-right="${rightKey}" data-grant="${rightGrant ? '1' : '0'}">
          <span><strong>${rightGrant ? 'Grant' : 'Remove'} ${RIGHT_LABELS[rightKey]}: ${p.name}</strong> <span class="muted small">Proposed by ${who.name}; approved by a different workspace admin${rightGrant && rightKey === 'riskApprover' ? ' or an existing Risk approver' : ''}, never by ${rightGrant ? 'the person receiving it' : 'the proposer'}.</span></span>
          <input type="text" name="reason" placeholder="Reason" maxlength="200" aria-label="Reason" required>
          <button class="btn btn-sm btn-primary" type="submit">Propose</button>
          <a class="btn btn-sm btn-ghost" href="#/people">Cancel</a>
        </form>
      </td></tr>`;
    }
    const pending = openRosterProposal(state, key);
    const holds = (r) => Boolean(p.rights && p.rights[r]);
    return html`<tr class="${p.active === false ? 'is-inactive' : ''}">
      <td><strong>${p.name}</strong>${p.active === false ? html` ${badge('neutral', 'Deactivated')}` : ''}</td>
      <td>${p.role}</td>
      <td>${p.team}</td>
      <td>${holds('workspaceAdmin') ? badge('decision', 'Workspace admin') : ''} ${holds('riskApprover') ? badge('restricted', 'Risk approver') : ''}${pending ? html` <a class="badge badge-watch" href="#/people?proposal=${pending.id}">${pending.id} pending</a>` : ''}
        ${admin && p.active !== false && !pending ? html`<div class="rights-actions">${RIGHTS.map(([r, label]) => html`<a class="muted small" href="#/people?person=${key}&right=${r}&grant=${holds(r) ? 0 : 1}">${holds(r) ? `Remove ${label.toLowerCase()}` : `Grant ${label.toLowerCase()}`}</a>`)}</div>` : ''}</td>
      <td class="muted small">${key === acting ? 'Acting now' : ''}</td>
      <td>${admin && p.active !== false && !pending ? html`<a class="btn btn-sm btn-ghost" href="#/people?edit=${key}">Edit</a> <a class="btn btn-sm btn-ghost" href="#/people?deactivate=${key}">Deactivate</a>` : ''}</td>
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
  <p class="muted small"><a href="#/people?inactive=${showInactive ? '0' : '1'}">${showInactive ? 'Hide' : 'Show'} deactivated people</a> · Rights are granted and removed, and rights holders deactivated, through a proposal by a workspace admin that someone else approves: a different workspace admin, or an existing Risk approver for a Risk approver grant. Neither the proposer nor the person receiving a right approves it. The last workspace admin cannot be removed.</p>
  ${rosterProposals(state, acting, focusProposal)}
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

function rosterProposals(state, acting, focusId) {
  const list = state.rosterProposals.slice().reverse();
  if (!list.length) return '';
  const roster = people(state);
  const describe = (pr) => `${pr.kind === 'deactivate' ? 'Deactivate' : pr.grant ? 'Grant' : 'Remove'} ${pr.kind === 'deactivate' ? '' : `${RIGHT_LABELS[pr.right]}: `}${roster[pr.person] ? roster[pr.person].name : pr.person}`;
  return section('Roster changes awaiting sign-off', html`${list.map((pr) => {
    const e = rosterApprovalEligibility(state, pr, acting);
    const status = pr.status === 'open' ? badge('decision', 'Awaiting sign-off') : pr.status === 'approved' ? badge('pass', 'Approved and applied') : pr.status === 'withdrawn' ? badge('neutral', 'Withdrawn') : badge('fail', 'Rejected');
    return html`<article class="card roster-proposal ${pr.id === focusId ? 'is-highlight' : ''}" id="${pr.id}">
      <div class="version-head"><div><span class="eyebrow">${pr.id} · ${fmtDateYear(pr.date)}</span><h3>${describe(pr)}</h3></div><div>${status}</div></div>
      ${kv([
        ['Proposed by', person(pr.proposedBy).name],
        ['Reason', pr.reason],
        ['Can approve', pr.eligible.map((k) => person(k).name).join(', ') || 'nobody'],
        ...(pr.approvals.length ? [['Approved by', pr.approvals.map((a) => `${person(a.by).name}, ${fmtDate(a.date)}`).join('; ')]] : []),
        ...(pr.rejection ? [['Rejected', `${person(pr.rejection.by).name}: ${pr.rejection.reason}`]] : []),
        ...(pr.withdrawal ? [['Withdrawn', `${person(pr.withdrawal.by).name}: ${pr.withdrawal.reason}`]] : []),
      ])}
      ${pr.status === 'open' ? html`<div class="roster-actions">
        ${e.ok ? html`<button class="btn btn-sm btn-primary" data-action="approve-roster" data-proposal="${pr.id}">Approve as ${person(acting).name}</button>` : html`<span class="muted small">${e.reason}</span>`}
        ${acting === pr.proposedBy
          ? html`<form class="line-add reject-form" data-form="withdraw-roster" data-proposal="${pr.id}"><input type="text" name="reason" placeholder="Reason for withdrawing…" aria-label="Withdrawal reason"><button class="btn btn-sm" type="submit">Withdraw</button></form>`
          : e.ok ? html`<form class="line-add reject-form" data-form="reject-roster" data-proposal="${pr.id}"><input type="text" name="reason" placeholder="Reason for rejecting…" aria-label="Rejection reason"><button class="btn btn-sm btn-danger" type="submit">Reject</button></form>` : ''}
      </div>` : ''}
    </article>`;
  })}`, { subtitle: 'Rights grants and removals, and the deactivation of anyone holding a right. The proposer never approves.' });
}
