// Status: what the capability can do now, and why; its rules, the actions waiting for a person, and the people involved.

import { DATA_FIELDS } from '../data/seed.js';
import { html, section, badge, kv, fmtDate, person, personAt, notice, empty, tabIntro, SWITCH_PERSON } from '../ui.js';
import { readiness, current, versionList, criteriaSaved, needsSignoff, decisionRequired, proposedAuthority, levelName, reviewNeeded, actor, queueApprovers, queueEligibility, QUEUE_LIMIT, LEVEL_PLAIN, readinessText, overviewTodos, overviewApprovals } from '../store/index.js';
import { ladder } from './overview.js';
import { emptyState, nextStep } from './setup.js';
import { contractReviewView } from './contract.js';
import { proposalsList, amendLink } from './proposals.js';
import { toolWords } from './cap-shared.js';

export function summaryTab(state, cap, d) {
  const r = readiness(state, cap.id);
  const review = reviewNeeded(state, cap.id);
  const pending = decisionRequired(state, cap.id);
  const proposed = proposedAuthority(state, cap.id);
  const auto = review.restriction && d.monitoring && d.monitoring.breachRecordId ? state.decisionRecords.find((x) => x.id === d.monitoring.breachRecordId) : null;
  const recs = state.decisionRecords.filter((x) => x.capabilityId === cap.id);
  const last = recs[recs.length - 1];
  const held = last && last.authorizedBy !== 'system' && last.previous && last.next.level < last.previous.level && cap.status === 'restricted' ? last : null;
  const canPropose = !pending && cap.status !== 'not-delegated' && cap.authority.level < 2 && d.testRun.lastRun && !review.any;
  const next = pending ? proposed : cap.status === 'not-delegated' || cap.authority.level >= 4 ? null : { level: cap.authority.level + 1, limited: false };
  const unmet = r.unmet[0];
  const severe = d.evidence.find((e) => e.source === 'Incident' && e.status === 'fail' && e.risk === 'High');

  const fact = (k, v) => html`<div class="sum-fact"><p class="fact-label">${k}</p><div>${v}</div></div>`;
  const concern = auto
    ? html`<strong>It crossed a safety limit</strong><p>${d.monitoring.reading}. It was moved back automatically on ${fmtDate(auto.date)}.</p>`
    : review.incidents.length ? html`<strong>An incident needs a review</strong><p>A safety limit was crossed; authority didn't change.</p>`
    : held ? html`<strong>Held after a problem</strong><p>${held.openCondition || held.rationale}</p>`
    : unmet ? html`<strong>${unmet.text}</strong><p>${unmet.gap || `Now: ${unmet.current}.`}</p>`
    : severe ? html`<strong>${severe.metric.replace(/^[A-Z]+-\d+:\s*/, '').replace(/^./, (c) => c.toUpperCase())}</strong><p>${severe.value}.</p>`
    : html`<span class="muted">Nothing open.</span>`;
  const ready = review.any
    ? html`<p>${badge('restricted', 'Not yet')} A review comes first.</p><a class="btn btn-primary" href="#/capabilities/${cap.id}?tab=monitor">Record the review</a>`
    : pending
      ? html`<p>${badge('decision', r.met === r.total ? 'Ready' : r.total - r.met === 1 ? 'Almost' : 'Not yet')} ${readinessText(r)}</p><a class="btn btn-primary" href="#/capabilities/${cap.id}/decision">Open the decision</a>`
      : canPropose
        ? html`<p>${badge('decision', 'Ready to propose')} The tests have run.</p><button class="btn btn-primary" data-action="propose-authority" data-capability="${cap.id}" data-level="${cap.authority.level + 1}">Propose a move to Level ${cap.authority.level + 1}</button>`
        : cap.status === 'not-delegated'
          ? html`<p>${badge('neutral', 'Not delegated, by design')}</p>`
          : held
            ? html`<p>${badge('restricted', 'Not yet')} Held until its condition is met.</p>`
            : html`<p>${badge('neutral', 'No decision open')} ${r.total ? readinessText(r) : ''}</p>`;

  const authority = html`<section class="card sum-authority">
    <div class="sum-now">
      <p class="fact-label">Current authority</p>
      <p class="sum-level">${ladder(cap.authority.level, pending && proposed ? proposed.level : null)}<span>Level ${cap.authority.level} · ${levelName(cap.authority.level)}${cap.authority.limited ? ', with limits' : ''}</span></p>
      <p class="sum-means">${LEVEL_PLAIN[cap.authority.level]}</p>
      ${auto ? html`<p class="sum-note">The AI was moved back to ${levelName(auto.next.level)} on ${fmtDate(auto.date)} after crossing a safety limit. It was at Level ${auto.previous.level} before. <span class="muted">(Automatic restriction)</span></p>` : ''}
      ${held ? html`<p class="sum-note">Moved back to ${levelName(held.next.level)} on ${fmtDate(held.date)} by ${personAt(held.authorizedByAt, held.authorizedBy).name}.</p>` : ''}
    </div>
    <div class="sum-facts">
      ${fact('Next possible level', next ? html`<strong>Level ${next.level}, ${levelName(next.level)}${next.limited ? ', with limits' : ''}</strong><p>${LEVEL_PLAIN[next.level]}</p>` : html`<span class="muted">${cap.status === 'not-delegated' ? 'None: not delegated, by design.' : 'None: this is the top level.'}</span>`)}
      ${fact('Main concern', concern)}
      ${fact('Ready for a decision?', ready)}
    </div>
  </section>`;

  const stakeholders = current(state, cap.id, 'stakeholders');
  const owner = person(cap.owner);
  const sum = d.stakeholderSummary;
  const peopleCard = html`<section class="card sum-small">
    <h2>People involved</h2>
    <ul class="sum-people">
      ${stakeholders.some((s) => s.person === cap.owner) ? '' : html`<li><span><strong>${owner.name}</strong> <span class="muted">owner</span></span><span></span></li>`}
      ${stakeholders.map((s) => html`<li><span><strong>${person(s.person).name}</strong> <span class="muted">${s.team}${s.person === cap.owner ? ' · owner' : ''}</span></span><span class="sum-pos sum-pos-${s.stance || 'undecided'}">${s.position || 'No position yet'}</span></li>`)}
    </ul>
    ${sum && sum.disagreement ? html`<p class="small muted">Not unanimous: ${sum.disagreement}</p>` : ''}
    <p class="small sum-links"><a href="#/capabilities/${cap.id}/stakeholders/edit">Manage stakeholders</a></p>
    ${stakeholders.length ? html`<details class="sum-all"><summary>All positions and reasons</summary>${stakeholdersTab(state, cap, d)}</details>` : ''}
  </section>`;

  const fmt = (x) => fmtDate(x);
  const tasks = [
    ...overviewTodos(state, { fmt }).filter((t) => t.capabilityId === cap.id).map((t) => ({ text: t.title, href: t.href, tone: t.urgent ? 'restricted' : 'decision', label: 'To do' })),
    ...overviewApprovals(state, { fmt }).filter((a) => a.capabilityId === cap.id).map((a) => ({ text: a.title, href: a.href, tone: 'decision', label: 'Approval' })),
  ];
  const tasksCard = html`<section class="card sum-small">
    <h2>Open tasks and approvals</h2>
    ${tasks.length ? html`<ul class="sum-tasks">${tasks.map((t) => html`<li><a href="${t.href}">${t.text}</a>${badge(t.tone, t.label)}</li>`)}</ul>` : html`<p class="muted">Nothing open.</p>`}
  </section>`;

  const setup = !versionList(state, cap.id, 'contract').length || !criteriaSaved(state, cap.id) ? nextStep(state, cap.id) : null;
  return html`${setup ? html`<div class="notice notice-neutral"><div class="notice-body"><strong>Next setup step: ${setup.title}</strong><p>${setup.text}</p></div><a class="notice-link" href="#/capabilities/${cap.id}/setup">Continue setup</a></div>` : ''}
    ${authority}
    <div class="sum-below">${peopleCard}${tasksCard}</div>`;
}

export function contractTab(state, cap, d) {
  const c = current(state, cap.id, 'contract');
  const risk = current(state, cap.id, 'risk');
  const list = (items) => html`<ul class="contract-list">${items.map((i) => html`<li>${i}</li>`)}</ul>`;
  const riskBlock = section('Risk profile', kv([
    ['How serious would a bad decision be?', risk.impact],
    ['Can it be undone?', risk.reversibility],
    ['Who or what is affected?', risk.exposure],
    ['Mistakes we watch for', (risk.failureTypes || []).join(', ') || 'None listed'],
    ...(risk.note ? [['Note', risk.note]] : []),
  ]), { subtitle: 'The higher the risk, the more evidence we need before giving the AI more authority.' });
  const contractVersions = versionList(state, cap.id, 'contract');
  if (!contractVersions.length) {
    return html`${emptyState(state, cap.id, d.contractDraft ? 'The rules are still a draft.' : 'No rules yet.', 'contract')}${riskBlock}`;
  }
  const latest = contractVersions[contractVersions.length - 1];
  return html`
    ${tabIntro('What the AI may do on its own, what needs a person, and what it must never do.', 'Software checks every action against these rules. The AI\'s own judgment can\'t override them.', html`<span class="muted">Last changed by ${personAt(latest.authorAt, latest.author).name}. Changes are kept in <a href="#/capabilities/${cap.id}/versions?kind=contract&version=${latest.version}">history</a>.</span> ${amendLink(state, cap.id, 'contract')}`)}
    ${proposalsList(state, cap.id, 'contract')}
    ${contractReviewView(contractVersions[0].review)}
    <div class="contract-grid">
      <div class="card contract-block contract-may"><h3>The AI may</h3>${list(c.may)}</div>
      <div class="card contract-block contract-never"><h3>The AI must never</h3>${list(c.mustNever)}</div>
      <div class="card contract-block contract-ask contract-wide"><h3>Ask a person when</h3>
        <div class="two-col"><div><p class="fact-label">For these cases</p>${list(c.mustAsk)}</div>
        <div><p class="fact-label">Whenever this comes up</p>${list(c.escalation)}${c.escalation.some((l) => /confidence/i.test(l)) ? html`<p class="muted small">The AI reports its own confidence. We can't verify it, so low confidence can send a case to a person, but high confidence never lets an action through on its own.</p>` : ''}</div></div>
      </div>
    </div>
    <div class="card contract-block contract-auto">
      <h3>Authority is reduced automatically when</h3>
      ${list(c.autoRestriction)}
      <p class="muted small">Only a person can give the AI more authority. Software can take it away on its own when one of these happens.</p>
    </div>
    ${dataBoundaryCard(c)}
    ${riskBlock}`;
}

export function waitingTab(state, cap, query) {
  const all = (state.actionQueue || []).filter((x) => x.capabilityId === cap.id);
  const waiting = all.filter((x) => x.status === 'waiting');
  const decided = all.filter((x) => x.status !== 'waiting').reverse();
  const by = actor(state, cap.id);
  const who = person(by);
  const approvers = queueApprovers(state, cap.id).map((k) => person(k).name);
  const error = query.get('error');
  const statusBadge = { executed: badge('pass', 'Approved and done'), rejected: badge('neutral', 'Rejected'), refused: badge('fail', 'Approved, but not carried out') };
  const card = (x) => {
    const e = queueEligibility(state, x.id, by);
    return html`<article class="card waiting-item" id="${x.id}">
      <div class="version-head"><div><span class="eyebrow">AI request · ${fmtDate(x.date)} · at Level ${x.levelAtRequest}${x.follows ? html` · <a href="#${x.follows}">asked again after an earlier request</a>` : ''} <span class="muted">(${x.id})</span></span><h3>${describeAction(x)}</h3></div>${x.status === 'waiting' ? badge('decision', 'Needs approval') : statusBadge[x.status]}</div>
      <p class="fact-label">Why it needs a person</p>
      <ul class="plain-list">${x.findings.map((f) => html`<li>${f.rule.text}</li>`)}</ul>
      ${x.status === 'waiting'
        ? e.ok
          ? html`<form class="line-add decide-form" data-form="decide-action" data-id="${x.id}">
              <input type="text" name="reason" maxlength="240" placeholder="Why? (required)" aria-label="Reason">
              <button class="btn btn-sm btn-primary" type="submit" name="decision" value="approve">Approve</button>
              <button class="btn btn-sm btn-danger" type="submit" name="decision" value="reject">Reject</button>
            </form>
            <p class="muted small">Deciding as <strong>${who.name}</strong>. A reason is required either way. When you approve, the action is checked against the rules again before it runs. If anything has changed since the AI asked (for example, authority was reduced, a limit was reached or the order is now blocked), it won't run, and the reason is saved.</p>`
          : html`<p class="muted small">${e.reason} ${SWITCH_PERSON}</p>`
        : html`${kv([['Decided by', html`${x.decision.byAt ? x.decision.byAt.name : x.decision.by}, ${fmtDate(x.decision.date)}`], ['Reason', x.decision.reason], ...(x.decision.refusal ? [['Why it didn\'t run', x.decision.refusal]] : []), ...(x.decision.refundId ? [['Refund', x.decision.refundId]] : [])])}`}
    </article>`;
  };
  const n = waiting.length;
  const why = cap.authority.level <= 2
    ? `At ${levelName(cap.authority.level)}, every action needs a person to approve it.`
    : 'They fell outside the AI\'s approved limits, so they weren\'t carried out automatically.';
  const intro = n
    ? `${n} ${n === 1 ? 'action needs' : 'actions need'} a person to decide. ${why}`
    : 'Actions the AI isn\'t allowed to take on its own wait here for a person to approve or reject.';
  return html`
    ${error ? notice('fail', 'Couldn\'t save your decision', error) : ''}
    ${tabIntro(intro, `${approvers.length ? `Who can approve: ${approvers.join(', ')} (the owner and named stakeholders who are active).` : `Nobody can approve yet: ${cap.name} has no active owner or stakeholders. Add one under Manage stakeholders.`} The AI can ask but can never approve its own request. Only one request per order can wait at a time, and at most ${QUEUE_LIMIT} for this capability. Past that, new requests are blocked and an incident is opened.`)}
    ${section(`Needs approval (${n})`, n ? html`${waiting.map(card)}` : html`<p class="empty">Nothing needs approval.</p>`)}
    ${decided.length ? section('Decided', html`${decided.map(card)}`) : ''}`;
}

function describeAction(x) {
  const a = x.call.args || {};
  return x.call.tool === 'issue_refund' ? `Refund $${a.amount} on ${a.orderId}` : `${toolWords(x.call.tool)}${a.orderId ? ` on ${a.orderId}` : ''}`;
}

function dataBoundaryCard(c) {
  const seen = new Set(c.dataSeen || []);
  const shown = DATA_FIELDS.filter((f) => seen.has(f.id) && !f.restricted);
  const hidden = DATA_FIELDS.filter((f) => !seen.has(f.id) || f.restricted);
  return html`<div class="card contract-block contract-data">
    <h3>The AI can access</h3>
    ${Array.isArray(c.dataSeen)
      ? html`<div class="two-col data-columns"><div><p class="fact-label">Can access</p>${shown.length ? html`<ul class="contract-list">${shown.map((f) => html`<li>${f.label}</li>`)}</ul>` : html`<p class="muted">Nothing.</p>`}</div>
        <div><p class="fact-label">Can't access</p><ul class="contract-list">${hidden.map((f) => html`<li>${f.label}${f.restricted ? html` <span class="muted small">(never allowed)</span>` : ''}</li>`)}</ul></div></div>`
      : html`<p class="muted">No data access is set in the rules, so the AI sees nothing from your systems.</p>`}
    <p class="muted small">The AI only ever sees these fields. Card numbers and full addresses are never shared, whatever the rules say. When something is withheld, the AI is told which rule applied, not what the record says.</p>
  </div>`;
}

const positionsDate = (stakeholders) => stakeholders.map((s) => s.date).filter(Boolean).sort().at(-1) || null;

export function stakeholdersTab(state, cap, d) {
  const tone = { 'expand': 'watch', 'expand-limits': 'pass', 'hold': 'insufficient', 'restrict': 'restricted', 'undecided': 'neutral' };
  const stakeholders = current(state, cap.id, 'stakeholders');
  if (!stakeholders.length) return emptyState(state, cap.id, 'No stakeholders named yet.', 'stakeholders');
  const gated = needsSignoff(state, cap.id, 'stakeholders');
  const editLink = html`<p class="muted small"><a href="#/capabilities/${cap.id}/stakeholders/edit">Edit stakeholders</a>. ${gated ? 'Now that results are in, adding or removing people or changing a team label needs approval. ' : ''}Changes are kept in history.</p>${proposalsList(state, cap.id, 'stakeholders')}`;
  const cards = stakeholders.map((s) => {
    const who = person(s.person);
    return html`<div class="card stakeholder">
      <div class="stakeholder-head"><div><strong>${s.team}</strong><div class="muted small">${who.name}, ${who.role}</div></div>${badge(tone[s.stance] || 'neutral', s.position)}</div>
      ${s.quote ? html`<blockquote>${s.quote}</blockquote>` : html`<p class="muted small">No position recorded yet.</p>`}
    </div>`;
  });
  const sum = d.stakeholderSummary;
  return html`
    <p class="muted">${positionsDate(stakeholders) ? `Positions as of ${fmtDate(positionsDate(stakeholders))}. ` : ''}Each view is shown as it was given, not averaged into a score.</p>
    ${editLink}
    <div class="stakeholder-grid">${cards}</div>
    ${sum ? html`<div class="two-col">
      <div class="card"><p class="eyebrow">Where people agree</p><p>${sum.consensus}</p></div>
      <div class="card card-watch"><p class="eyebrow">Where people still disagree</p><p>${sum.disagreement}</p></div>
    </div>` : ''}`;
}
