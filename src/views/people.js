import { html, raw, badge, notice, section, person, personAt, fmtDate, kv } from '../ui.js';
import { people, activePeople, actor, isWorkspaceAdmin, rosterVersions, isActivePerson, RIGHTS, RIGHT_LABELS, openRosterProposal, getRosterProposal, rosterApprovalEligibility, activeAdmins, rosterChangeImpact, coverageWarnings, workspaceOf, workflowOf } from '../store/index.js';
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
      return html`<tr class="is-editing"><td colspan="5">
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
      const impact = rosterChangeImpact(state, { kind: 'deactivate', person: key });
      return html`<tr class="is-editing"><td colspan="5">
        ${impactNote(impact)}
        <form class="line-edit people-form" data-form="deactivate-person" data-person="${key}">
          <span><strong>Deactivate ${p.name}?</strong> <span class="muted small">They stay on every record they are on; they can no longer act, propose, approve or be a stakeholder.${p.rights && (p.rights.workspaceAdmin || p.rights.riskApprover) ? ' They hold a right, so this becomes a proposal for a different workspace admin to approve.' : ''}</span></span>
          <input type="text" name="reason" placeholder="Reason" maxlength="200" aria-label="Reason" required>
          <button class="btn btn-sm btn-danger" type="submit">Deactivate</button>
          <a class="btn btn-sm btn-ghost" href="#/people">Cancel</a>
        </form>
      </td></tr>`;
    }
    if (rightPerson === key && RIGHT_LABELS[rightKey] && admin) {
      const impact = rosterChangeImpact(state, { kind: 'rights', person: key, right: rightKey, grant: rightGrant });
      return html`<tr class="is-editing"><td colspan="5">
        ${impactNote(impact)}
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
    // One "Manage" control per row: edit, grant or remove each right, deactivate.
    const manage = admin && p.active !== false && !pending ? html`<details class="menu">
        <summary class="btn btn-sm" aria-label="Manage ${p.name}">Manage <span aria-hidden="true">▾</span></summary>
        <div class="menu-list">
          <a href="#/people?edit=${key}">Edit name, title or team</a>
          ${RIGHTS.map(([r, label]) => html`<a href="#/people?person=${key}&right=${r}&grant=${holds(r) ? 0 : 1}">${holds(r) ? `Remove ${label.toLowerCase()}` : `Grant ${label.toLowerCase()}`}…</a>`)}
          <a class="menu-danger" href="#/people?deactivate=${key}">Deactivate…</a>
        </div>
      </details>` : '';
    return html`<tr class="${p.active === false ? 'is-inactive' : ''}">
      <td><strong>${p.name}</strong>${key === acting ? html` <span class="tag-acting">Acting now</span>` : ''}${p.active === false ? html` ${badge('neutral', 'Deactivated')}` : ''}</td>
      <td>${p.role}</td>
      <td>${p.team}</td>
      <td><div class="rights-badges">${holds('workspaceAdmin') ? badge('decision', 'Workspace admin') : ''}${holds('riskApprover') ? badge('restricted', 'Risk approver') : ''}${pending ? html`<a class="badge badge-watch" href="#/people?proposal=${pending.id}">${pending.id} pending</a>` : ''}</div></td>
      <td class="cell-manage">${manage}</td>
    </tr>`;
  };

  const versions = rosterVersions(state).slice().reverse();

  return html`<div class="page-head">
    <div>
      <p class="eyebrow">${workspaceOf(state).name}</p>
      <h1>People</h1>
      <p class="lede">Everyone who can act in this workspace. Rights are explicit and recorded: <strong>workspace admin</strong> changes the roster; <strong>Risk approver</strong> can sign off as Risk. Nobody is deleted; records keep referring to people after they are deactivated.</p>
    </div>
  </div>
  ${error ? notice('fail', query.get('workspace') === 'edit' ? 'Could not rename the workspace' : 'Could not change the roster', error) : ''}
  ${workspaceSection(state, admin, who, query.get('workspace') === 'edit')}
  ${coverageWarnings(state).map((w) => html`<div class="notice notice-watch" role="status"><div class="notice-body"><strong>${w.title}</strong><p>${w.body}</p></div><a class="notice-link" href="${w.link === '#/people' ? `#/capabilities/${w.capabilityId}` : w.link}">${w.link === '#/people' ? 'Capability' : w.linkText}</a></div>`)}
  ${admin ? '' : notice('neutral', `Acting as ${who.name}, who is not a workspace admin`, 'Only a workspace admin adds, edits or deactivates people. Switch who is acting in the top bar to see the controls.')}
  <div class="card progress-card"><div class="progress-facts">
    <div><span class="fact-label">Active people</span><strong>${Object.keys(activePeople(state)).length}</strong></div>
    <div><span class="fact-label">Workspace admins</span><strong>${admins}</strong></div>
    <div><span class="fact-label">Risk approvers</span><strong>${riskApprovers}</strong></div>
    <div><span class="fact-label">Roster version</span><strong>v${rosterVersions(state).length}</strong></div>
  </div></div>
  <div class="card table-card people-card"><table class="table table-people">
    <thead><tr><th>Name</th><th>Title</th><th>Team</th><th>Rights</th><th><span class="sr-only">Manage</span></th></tr></thead>
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
    ${kv([['Written', fmtDate(v.date)], ['By', v.author ? html`${personAt(v.authorAt, v.author).name}${v.approvals ? html` · approved by ${v.approvals.map((a) => personAt(a.byAt, a.by).name).join(', ')}` : ''}` : 'Seed'], ['Reason', v.reason]])}
    ${v.version > 1 ? html`<h4 class="version-sub">What changed from v${v.version - 1}</h4>${diffTable(flatten(v.before), flatten(v.value))}` : ''}
  </article>`)}`, { subtitle: 'Every change is a new version with its author and reason.' })}`;
}

// The "Workspace" section (#60): the workspace and its workflow, an Edit
// control for workspace admins (a direct edit with a required reason), and
// the history of every change.
function workspaceSection(state, admin, who, editing) {
  const ws = workspaceOf(state);
  const wf = workflowOf(state);
  const history = (state.workspaceHistory || []).slice().reverse();
  const body = editing && admin
    ? html`<form class="card setup-form" data-form="rename-workspace">
        <div class="two-col">
          <label class="field field-stack"><span>Workspace name</span><input type="text" name="ws-name" value="${ws.name}" maxlength="60" required></label>
          <label class="field field-stack"><span>Workflow name</span><input type="text" name="wf-name" value="${wf.name}" maxlength="60" required></label>
          <label class="field field-stack"><span>Workspace description</span><input type="text" name="ws-description" value="${ws.description}" maxlength="160"></label>
          <label class="field field-stack"><span>Workflow description</span><input type="text" name="wf-description" value="${wf.description}" maxlength="200"></label>
        </div>
        <label class="field field-stack"><span>Reason</span><input type="text" name="reason" maxlength="200" placeholder="Why the name or description is changing" required></label>
        <p class="muted small">Changing as <strong>${who.name}</strong>, ${who.role}. A direct edit by a workspace admin, recorded with your reason and shown in Activity. Records written before keep the names in force then.</p>
        <div class="roster-actions"><button class="btn btn-primary" type="submit">Save</button><a class="btn btn-ghost" href="#/people">Cancel</a></div>
      </form>`
    : html`<div class="card"><div class="version-head"><div>
        ${kv([['Workspace', html`<strong>${ws.name}</strong>${ws.description ? html`<div class="muted small">${ws.description}</div>` : ''}`], ['Workflow', html`<strong>${wf.name}</strong>${wf.description ? html`<div class="muted small">${wf.description}</div>` : ''}`]])}
      </div>${admin ? html`<a class="btn btn-sm" href="#/people?workspace=edit">Edit</a>` : ''}</div></div>`;
  const log = history.length
    ? html`<details class="amendment"><summary>${history.length} change${history.length === 1 ? '' : 's'} recorded</summary><ul class="plain-list">${history.map((h) => html`<li><strong>v${h.version}</strong>, ${fmtDate(h.date)}, ${personAt(h.authorAt, h.author).name}: ${h.before.workspace.name !== h.value.workspace.name ? html`workspace "${h.before.workspace.name}" → "${h.value.workspace.name}". ` : ''}${h.before.workflow.name !== h.value.workflow.name ? html`workflow "${h.before.workflow.name}" → "${h.value.workflow.name}". ` : ''}${h.before.workspace.description !== h.value.workspace.description || h.before.workflow.description !== h.value.workflow.description ? 'Description changed. ' : ''}<span class="muted">Reason: ${h.reason}</span></li>`)}</ul></details>`
    : '';
  return section('Workspace', html`${body}${log}`, { id: 'workspace', subtitle: admin ? 'Workspace admins can rename the workspace and its workflow; every change is recorded.' : 'Only a workspace admin can rename the workspace or workflow.' });
}

function flatten(roster) {
  return Object.entries(roster || {}).map(([key, p]) => ({ id: key, name: p.name, title: p.role, team: p.team, active: p.active !== false ? 'active' : 'deactivated', rights: [p.rights && p.rights.workspaceAdmin ? 'workspace admin' : null, p.rights && p.rights.riskApprover ? 'Risk approver' : null].filter(Boolean).join(', ') || 'none' }));
}

function rosterProposals(state, acting, focusId) {
  const list = state.rosterProposals.slice().reverse();
  if (!list.length) return '';
  const roster = people(state);
  const describe = (pr) => `${pr.kind === 'deactivate' ? 'Deactivate' : pr.grant ? 'Grant' : 'Remove'} ${pr.kind === 'deactivate' ? '' : `${RIGHT_LABELS[pr.right]}: `}${personAt(pr.personAt, pr.person).name}`;
  return section('Roster changes awaiting sign-off', html`${list.map((pr) => {
    const e = rosterApprovalEligibility(state, pr, acting);
    const status = pr.status === 'open' ? badge('decision', 'Awaiting sign-off') : pr.status === 'approved' ? badge('pass', 'Approved and applied') : pr.status === 'withdrawn' ? badge('neutral', 'Withdrawn') : badge('fail', 'Rejected');
    return html`<article class="card roster-proposal ${pr.id === focusId ? 'is-highlight' : ''}" id="${pr.id}">
      <div class="version-head"><div><span class="eyebrow">${pr.id} · ${fmtDate(pr.date)}</span><h3>${describe(pr)}</h3></div><div>${status}</div></div>
      ${kv([
        ['Proposed by', personAt(pr.proposedByAt, pr.proposedBy).name],
        ['Reason', pr.reason],
        ...(pr.impact && pr.impact.any ? [['Coverage impact', html`${pr.impact.capabilities.length ? html`Would leave ${pr.impact.capabilities.map((c) => c.name).join(', ')} short of two Risk approvers. ` : ''}${pr.impact.proposals.length ? html`Would leave ${pr.impact.proposals.map((x) => `${x.id} on ${x.name}`).join(', ')} unable to complete as proposed.` : ''}`]] : []),
        ['Can approve', pr.eligible.map((k) => person(k).name).join(', ') || 'nobody'],
        ...(pr.approvals.length ? [['Approved by', pr.approvals.map((a) => `${personAt(a.byAt, a.by).name}, ${fmtDate(a.date)}`).join('; ')]] : []),
        ...(pr.rejection ? [['Rejected', `${personAt(pr.rejection.byAt, pr.rejection.by).name}: ${pr.rejection.reason}`]] : []),
        ...(pr.withdrawal ? [['Withdrawn', `${personAt(pr.withdrawal.byAt, pr.withdrawal.by).name}: ${pr.withdrawal.reason}`]] : []),
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

// Shown on the propose-right and deactivate forms: what the change would do to
// coverage. A warning, never a block; the reason field is already required.
function impactNote(impact) {
  if (!impact || !impact.any) return '';
  return html`<div class="notice notice-watch impact-note" role="status"><div class="notice-body"><strong>This change would weaken sign-off coverage</strong><p>${impact.capabilities.length ? `${impact.capabilities.map((c) => c.name).join(', ')} would have fewer than two active Risk approvers among their possible approvers. ` : ''}${impact.proposals.length ? `${impact.proposals.map((x) => `${x.id} on ${x.name}`).join(', ')} could no longer be signed off as proposed; the proposer would need to withdraw and propose again. ` : ''}You can still go ahead; say why in the reason.</p></div></div>`;
}
