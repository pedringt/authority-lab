import * as seed from '../data/seed.js';
import { DATA_FIELDS } from '../data/seed.js';
import { html, raw, section, badge, capStatusBadge, authorityBadge, levelScale, kv, fmtDate, person, personAt, notice, empty, warningNotice, authorityText, rightsNote, lede, subNav, tabIntro, SWITCH_PERSON } from '../ui.js';
import { getCapability, capData, readiness, authorityLabel, testSummary, current, versionList, criteriaLocked, criteriaSaved, needsSignoff, decisionRequired, proposedAuthority, lastEvaluated, lastDecisionId, coverageWarnings, monitoringStatus, breachRule, levelName, reviewNeeded, reviewEligibility, actor, isHighOrFinancial, workflowOf, waitingActions, queueApprovers, queueEligibility, QUEUE_LIMIT, gateSummary, gateEvents, GATE_SOURCES, expectedVsActual, roi, roiVersions, currentRoiAssumptions, roiEditEligibility, ROI_FIELDS, grantingRecord, adoptionSignals, TOOLS, toolLabel, LEVEL_PLAIN, readinessText, overviewTodos, overviewApprovals } from '../store/index.js';
import { scenarioTable, testsView } from './tests.js';
import { evidenceView } from './evidence.js';
import { agentRunsView } from './agentruns.js';
import { ladder } from './overview.js';
import { emptyState, nextStep } from './setup.js';
import { contractReviewView } from './contract.js';
import { proposalsList, amendLink } from './proposals.js';
import { rolloutList } from './decisions.js';
import { evidenceSourcesCard } from './scenarios.js';

// Six tabs (simplification pass): the authority first, then the rules it
// works under, the evidence, the decision, how it's going, and the history.
// Stakeholders fold into Summary and Decision. Old tab names are rewritten
// in routes.js.
const TABS = [
  ['summary', 'Summary'],
  ['rules', 'Rules'],
  ['evidence', 'Evidence'],
  ['decision', 'Decision'],
  ['monitoring', 'Monitoring'],
  ['history', 'History'],
];
const EVIDENCE_VIEWS = [['results', 'Results'], ['all', 'All evidence'], ['requirements', 'Decision requirements'], ['targets', 'Targets'], ['tests', 'Tests'], ['runs', 'Model runs']];

export function capabilityView(state, id, query, { runs = null } = {}) {
  const cap = getCapability(state, id);
  if (!cap) return html`<div class="page-head"><h1>We couldn't find that capability.</h1></div>`;
  const d = capData(state, id);
  const requested = query.get('tab') || 'summary';
  const tab = TABS.some(([k]) => k === requested) ? requested : 'summary';
  const show = query.get('show');
  const waiting = waitingActions(state, cap.id).length;

  const tabs = html`<nav class="tabs" aria-label="Capability sections">${TABS
    .map(([k, label]) => html`<a class="tab ${k === tab ? 'is-active' : ''}" href="#/capabilities/${cap.id}?tab=${k}" ${k === tab ? raw('aria-current="page"') : ''}>${label}${k === 'decision' && waiting ? html` <span class="nav-count">${waiting}</span>` : ''}</a>`)}</nav>`;
  const base = `#/capabilities/${cap.id}`;

  let body;
  switch (tab) {
    case 'rules': body = contractTab(state, cap, d); break;
    case 'evidence': {
      const v = EVIDENCE_VIEWS.some(([k]) => k === show) ? show : 'results';
      const views = subNav(EVIDENCE_VIEWS.map(([k, label]) => ({ href: `${base}?tab=evidence${k === 'results' ? '' : `&show=${k}`}`, label, active: v === k })), 'Evidence views');
      const inner = {
        results: () => html`${evidenceTab(state, cap, d)}${gateActivityCard(state, cap)}`,
        all: () => evidenceView(state, cap.id, query, { embedded: true }),
        requirements: () => requirementsTab(state, cap),
        targets: () => criteriaTab(state, cap),
        tests: () => testsView(state, cap.id, query, { embedded: true }),
        runs: () => agentRunsView(state, query, runs, { capabilityId: cap.id, embedded: true }),
      }[v]();
      body = html`${views}${inner}`;
      break;
    }
    case 'decision': {
      const v = show === 'approvals' ? 'approvals' : 'decision';
      body = html`${subNav([{ href: `${base}?tab=decision`, label: 'Decision', active: v === 'decision' }, { href: `${base}?tab=decision&show=approvals`, label: 'Approvals', active: v === 'approvals', count: waiting }], 'Decision views')}${v === 'approvals' ? waitingTab(state, cap, query) : decisionTab(state, cap)}`;
      break;
    }
    case 'monitoring': body = monitoringTab(state, cap, d, show); break;
    case 'history': body = historyTab(state, cap); break;
    default: body = summaryTab(state, cap, d);
  }

  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/capabilities">Capabilities</a> · ${workflowOf(state).name}</p>
      <h1>${cap.name}</h1>
      ${lede(cap.summary)}
    </div>
    ${tab === 'summary' ? '' : html`<div class="page-actions cap-level"><a href="${base}" title="${levelName(cap.authority.level)}">${ladder(cap.authority.level)} Level ${cap.authority.level}, ${levelName(cap.authority.level)}${cap.authority.limited ? ', with limits' : ''}</a></div>`}
  </div>
  ${query.get('error') ? notice('fail', 'That didn\'t work', query.get('error')) : ''}
  ${query.get('tightened') ? notice('pass', 'Targets tightened', 'Every change only made a target stricter, so it applied straight away. Changes are kept in history.', { link: `#/capabilities/${cap.id}/versions?kind=criteria`, linkText: 'See history' }) : ''}
  ${tabs}
  <div class="tab-panel">${body}</div>`;
}

// Summary: the authority dominates. Below it, two small sections: the people
// involved, and this capability's open tasks and approvals.
function summaryTab(state, cap, d) {
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
    ? html`<p>${badge('restricted', 'Not yet')} A review comes first.</p><a class="btn btn-primary" href="#/capabilities/${cap.id}?tab=monitoring">Record the review</a>`
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

// Decision: the open decision (the workspace is one click away), or how to
// propose one. Approvals sit beside it as their own view.
function decisionTab(state, cap) {
  const d = capData(state, cap.id);
  const review = reviewNeeded(state, cap.id);
  const r = readiness(state, cap.id);
  if (decisionRequired(state, cap.id)) {
    const p = proposedAuthority(state, cap.id);
    return html`<div class="card decision-entry">
      <p class="eyebrow">Decision open</p>
      <h2>Should ${cap.name} move to Level ${p.level}, ${levelName(p.level)}${p.limited ? ', with limits' : ''}?</h2>
      <p>${readinessText(r)} ${r.unmet[0] ? `Still open: ${r.unmet[0].text}.` : ''}</p>
      <a class="btn btn-primary" href="#/capabilities/${cap.id}/decision">Open the decision</a>
    </div>`;
  }
  const canPropose = cap.status !== 'not-delegated' && cap.authority.level < 2 && d.testRun.lastRun && !review.any;
  const last = state.decisionRecords.filter((x) => x.capabilityId === cap.id).at(-1);
  return html`${review.any ? notice('restricted', 'A review comes first', 'No decision can open until someone records a review of what happened.', { link: `#/capabilities/${cap.id}?tab=monitoring`, linkText: 'Record the review' }) : ''}
    ${canPropose ? html`<div class="notice notice-neutral"><div class="notice-body"><strong>Ready for the first authority change</strong><p>The tests have run. You can now propose moving to Level ${cap.authority.level + 1}, ${levelName(cap.authority.level + 1)}. A person has to approve it, and the decision is recorded.</p></div><button class="btn btn-sm btn-primary" data-action="propose-authority" data-capability="${cap.id}" data-level="${cap.authority.level + 1}">Propose a move to Level ${cap.authority.level + 1}</button></div>` : ''}
    ${!review.any && !canPropose ? html`<p class="empty">No decision is open.</p>` : ''}
    ${last ? html`<p class="muted small">Last decision: <a href="#/decisions/${last.id}">${optionLabel(last.option)}, ${fmtDate(last.date)}</a>. Every decision is in <a href="#/capabilities/${cap.id}?tab=history">History</a>.</p>` : ''}`;
}

// History: where the formal record lives. Decisions, changes, versions and
// the capability's activity.
function historyTab(state, cap) {
  const kinds = [['contract', 'Rules'], ['criteria', 'Targets'], ['requirements', 'Decision requirements'], ['stakeholders', 'Stakeholders'], ['risk', 'Risk profile']];
  const changes = ['contract', 'criteria', 'stakeholders'].map((k) => proposalsList(state, cap.id, k)).filter((x) => String(x));
  return html`${tabIntro('Every decision, change and version for this capability. Records never change once written.')}
    ${section('Authority decisions', decisionsTab(state, cap))}
    ${changes.length ? section('Proposed changes', html`${changes}`) : ''}
    ${section('Versions', html`<div class="card"><ul class="plain-list">${kinds.map(([k, label]) => { const n = versionList(state, cap.id, k).length; return html`<li>${n ? html`<a href="#/capabilities/${cap.id}/versions?kind=${k}">${label}</a>` : label} <span class="muted small">· ${n} version${n === 1 ? '' : 's'}</span></li>`; })}</ul></div>`)}
    <p class="small"><a href="#/records?show=activity&capability=${cap.id}">All activity for ${cap.name}</a></p>`;
}

function contractTab(state, cap, d) {
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

// Tool ids in words, from the one list in the gate. Ids stay in model-run
// detail and records. A tool the gate doesn't know is never shown by id.
const toolWords = (tool) => (Object.hasOwn(TOOLS, tool) ? toolLabel(tool) : 'Unknown tool');

// What the AI tried (A5): what the rules allowed, sent to a person or blocked
// for this capability, rolled up, with the latest actions and where they came
// from. Event and queue ids stay out of the main columns.
function gateActivityCard(state, cap) {
  const g = gateSummary(state, cap.id);
  if (!g.events) return section('What the AI tried', html`<p class="empty">Nothing yet. Every action the AI asks for, and every approval decision, will show here.</p>`);
  const pct = (v) => (v == null ? '—' : `${v}%`);
  const recent = gateEvents(state, cap.id).slice(-10).reverse();
  const who = (e) => (e.actor === 'ai' ? 'AI' : person(e.actor).name);
  const verdictBadge = { allow: badge('pass', 'Allowed'), 'needs-person': badge('decision', 'Sent to a person'), block: badge('fail', 'Blocked'), approved: badge('pass', 'Approved'), rejected: badge('neutral', 'Rejected') };
  return section('What the AI tried', html`<div class="metric-grid metric-grid-4">
      <div class="metric card"><div class="metric-top"><span class="metric-label">Done automatically</span></div><div class="metric-value">${g.counts.allowed}</div><div class="metric-note">${pct(g.rates.automation)} of actions</div></div>
      <div class="metric card"><div class="metric-top"><span class="metric-label">Sent to a person</span></div><div class="metric-value">${g.counts.escalated}</div><div class="metric-note">${g.counts.approved} approved, ${g.counts.overridden} rejected</div></div>
      <div class="metric card"><div class="metric-top"><span class="metric-label">Blocked</span></div><div class="metric-value">${g.counts.blocked}</div><div class="metric-note">${pct(g.rates.block)} of actions · <span class="${g.mustNeverAttempts ? 'text-fail' : ''}">tried something never allowed ${g.mustNeverAttempts} time${g.mustNeverAttempts === 1 ? '' : 's'}</span> · <span class="${g.falseClaims ? 'text-fail' : ''}">${g.falseClaims} claim${g.falseClaims === 1 ? '' : 's'} that didn't match the records</span></div></div>
      <div class="metric card"><div class="metric-top"><span class="metric-label">Stopped after approval</span></div><div class="metric-value">${g.counts.refused}</div><div class="metric-note">approved, but things had changed by the time it ran</div></div>
    </div>
    <div class="card table-card"><table class="table"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Result</th><th>Why</th><th>Data</th></tr></thead>
      <tbody>${recent.map((e) => html`<tr><td class="muted small" title="${e.id}${e.queueId ? ` · ${e.queueId}` : ''}">${fmtDate(e.date)}</td><td>${who(e)}</td><td>${toolWords(e.tool)}${e.orderId ? ` on ${e.orderId}` : ''}</td><td>${verdictBadge[e.verdict] || badge('neutral', 'Other')}</td><td class="small">${e.rule ? e.rule.text : ''}</td><td class="muted small">${GATE_SOURCES[e.source] || e.source}</td></tr>`)}</tbody>
    </table></div>`, { subtitle: `${g.events} actions, from: ${g.sources.map((x) => GATE_SOURCES[x] || x).join(', ')}. Every action is checked against the rules and logged. These numbers feed the results and the safety limits.` });
}

// Approvals (A4): actions that need a person to decide. A named, active
// stakeholder approves or rejects with a reason; approval re-checks the rules
// and runs only if nothing new appeared since the AI asked.
function waitingTab(state, cap, query) {
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

// The contract's data boundary (A2): what tool results may show the AI.
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

// Status words at the call site: a target is met or not; a segment with too
// few cases says so.
const TARGET_WORDS = { pass: 'Met', watch: 'Not met yet', fail: 'Not met', insufficient: 'Not enough data yet' };
const SEGMENT_WORDS = { pass: 'Looks good', watch: 'Watch', fail: 'Problem', insufficient: 'Not enough data yet' };

function criteriaTab(state, cap) {
  const criteria = current(state, cap.id, 'criteria');
  if (!criteriaSaved(state, cap.id)) return emptyState(state, cap.id, 'No targets yet.', 'criteria');
  const locked = criteriaLocked(state, cap.id);
  const rows = criteria.map((c) => html`<tr>
    <td><strong>${c.name}</strong></td>
    <td>${c.target}</td>
    <td>${c.current}</td>
    <td>${c.status === 'pending' ? badge('neutral', 'Not measured yet') : badge(c.status, TARGET_WORDS[c.status])}</td>
    <td class="muted">${c.note}</td>
  </tr>`);
  const defining = state.decisionRecords.find((x) => x.capabilityId === cap.id && x.number === 2);
  return html`
    ${locked
      ? html`<div class="notice notice-watch"><div class="notice-body"><strong>These targets can't be changed directly now that results exist.</strong><p>To change them, propose a target change. It needs approval, so the bar can't move quietly after the results are in.</p></div>${amendLink(state, cap.id, 'criteria')}</div>
        ${proposalsList(state, cap.id, 'criteria')}`
      : html`<div class="notice notice-neutral"><div class="notice-body"><strong>You can still edit these targets</strong><p>They lock once the first tests run, so the bar can't move after results come in. Changes are kept in history.</p></div><a class="notice-link" href="#/capabilities/${cap.id}/criteria/edit">Edit</a></div>`}
    <p class="muted">${defining ? html`These targets were set before the pilot started (in <a href="#/decisions/${defining.id}">${defining.id}</a>), so the bar didn't move after the results came in. ` : ''}The decision is judged against them; they aren't a score.</p>
    ${rows.length ? html`<div class="card table-card"><table class="table table-criteria">
      <thead><tr><th>Measure</th><th>Target</th><th>Now</th><th>Status</th><th>Note</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>` : empty('No targets set.')}
`;
}

// Decision requirements: what has to be true before authority can expand.
function requirementsTab(state, cap) {
  if (!criteriaSaved(state, cap.id)) return emptyState(state, cap.id, 'No decision requirements yet.', 'criteria');
  return html`${tabIntro(`What we need before ${proposedChangeLabel(cap, state)}.`, 'A checklist, not a score. Every item has to be met, or a person has to decide to go ahead anyway and say why on the record.')}
    ${requirementsList(state, cap.id)}`;
}

export function proposedChangeLabel(cap, state) {
  const proposed = state ? proposedAuthority(state, cap.id) : null;
  return proposed ? `${authorityLabel(cap.authority, { short: true })} → ${authorityLabel(proposed, { short: true })}` : 'the next authority change';
}

export function requirementsList(state, capabilityId) {
  const r = readiness(state, capabilityId);
  const reqs = current(state, capabilityId, 'requirements');
  if (!reqs.length) return empty('No decision requirements set.');
  return html`<div class="card">
    <ul class="req-list">${reqs.map((q) => html`<li class="${q.met ? 'is-met' : 'is-unmet'}">
      <span class="req-mark" aria-hidden="true">${q.met ? '✓' : '⚠'}</span>
      <span class="req-text"><strong>${q.text}</strong><span class="muted"> · ${q.met ? 'Met' : 'Not met'}: ${q.current}</span>${q.gap ? html`<p class="req-gap">${q.gap}</p>` : ''}</span>
    </li>`)}</ul>
    <p class="muted small"><strong>${r.met} of ${r.total}</strong> checks met.</p>
  </div>`;
}

function testingTab(state, cap) {
  const t = testSummary(state, cap.id);
  if (!t.total) return emptyState(state, cap.id, 'No tests yet.', 'scenarios');
  return html`
    <p class="muted">${t.total} tests. ${t.status === 'complete'
      ? html`Today's run: ${t.passed} of ${t.total} passed, ${t.highSeverity} serious failure${t.highSeverity === 1 ? '' : 's'}.`
      : t.lastRun ? html`Last run ${fmtDate(t.lastRun)}: ${t.recorded.passed} of ${t.total} passed, ${t.recorded.highSeverity} serious failure${t.recorded.highSeverity === 1 ? '' : 's'}.` : 'Not run yet.'} <a href="#/capabilities/${cap.id}?tab=evidence&show=tests">Run the tests or see all results</a>.</p>
    ${scenarioTable(state, cap.id, { filter: 'failed', compact: true })}`;
}

function evidenceTab(state, cap, d) {
  const p = d.pilot;
  if (!p) return html`${emptyState(state, cap.id, d.evidence.length ? 'No pilot results yet.' : 'No evidence yet.', 'tests')}${d.evidence.length ? html`<p class="muted small">Other evidence is under <a href="#/capabilities/${cap.id}?tab=evidence&show=all">All evidence</a>.</p>` : ''}${evidenceSourcesCard()}`;
  const rows = p.segments.map((s) => html`<tr class="${s.status === 'insufficient' ? 'row-insufficient' : ''}">
    <td><strong>${s.name}</strong></td>
    <td class="num">${s.cases}</td>
    <td class="num">${s.accuracy}%</td>
    <td class="num">${s.overrideRate}%</td>
    <td class="num">${s.severeErrors}</td>
    <td>${badge(s.status, SEGMENT_WORDS[s.status])}</td>
  </tr>`);
  const weak = p.segments.filter((s) => s.status === 'insufficient');
  const unmetReq = readiness(state, cap.id).unmet[0];
  return html`
    <div class="pilot-head">
      <div><p class="eyebrow">Limited pilot · ${p.ended ? `${fmtDate(p.started)} to ${fmtDate(p.ended)}` : `since ${fmtDate(p.started)}`}</p><p class="readiness-big">${p.cases}<span> real cases, each checked by a support agent</span></p></div>
      <div class="pilot-stats">
        <div><span class="fact-label">Overall accuracy</span><strong>${p.accuracy}%</strong></div>
        <div><span class="fact-label">Replaced by a person</span><strong>${p.overrides} (${p.overrideRate}%)</strong></div>
        <div><span class="fact-label">Edited by a person</span><strong>${p.edits} (${p.editRate}%)</strong></div>
        <div><span class="fact-label">Severe errors</span><strong>${p.severeErrors} (${p.severeErrorRate}%)</strong></div>
      </div>
    </div>
    <div class="card table-card"><table class="table">
      <thead><tr><th>Type of case</th><th class="num">Cases</th><th class="num">Accuracy</th><th class="num">Replaced by a person</th><th class="num">Severe errors</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${weak.map((s) => notice('insufficient', 'Overall performance looks good. One segment does not.', `${s.name}: only ${s.cases} cases so far, at ${s.accuracy}% accuracy, and people replaced ${s.overrideRate}% of the AI's work. That's too few to draw a conclusion, and the overall ${p.accuracy}% hides it.${unmetReq ? ` Before expanding, we need ${unmetReq.text.toLowerCase().replace(/^minimum /, 'at least ')}.` : ''}`))}
    ${p.severeErrorList && p.severeErrorList.length ? section('Severe errors in the pilot', html`<div class="card"><ul class="plain-list">${p.severeErrorList.map((e) => html`<li><span class="muted">${fmtDate(e.date)} · ${p.segments.find((s) => s.id === e.segment).name}</span><br>${e.text}</li>`)}</ul><p class="muted small">A person caught all ${p.severeErrors} before anything happened. That's what Draft authority is for, and why how often people replace the AI's work matters more than the raw error count.</p></div>`) : ''}
    ${current(state, cap.id, 'requirements').length ? section('What we need before expanding', requirementsList(state, cap.id)) : ''}`;
}

// The latest date anyone recorded a position, or none: never a made-up date.
const positionsDate = (stakeholders) => stakeholders.map((s) => s.date).filter(Boolean).sort().at(-1) || null;

function stakeholdersTab(state, cap, d) {
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

function decisionsTab(state, cap) {
  const records = state.decisionRecords.filter((x) => x.capabilityId === cap.id).slice().reverse();
  if (!records.length) return empty('No authority decisions yet.');
  return html`<div class="card table-card"><table class="table">
    <thead><tr><th>Record</th><th>Date</th><th>Change</th><th>Decision</th><th>Authorized by</th></tr></thead>
    <tbody>${records.map((x) => html`<tr>
      <td><a href="#/decisions/${x.id}">Authority change #${String(x.number).padStart(2, '0')}</a></td>
      <td>${fmtDate(x.date)}</td>
      <td>${x.previous ? html`${authorityText(x.previous, { short: true })} → ` : html`<span class="muted">New → </span>`}${authorityText(x.next, { short: true })}</td>
      <td>${optionLabel(x.option)}</td>
      <td>${personAt(x.authorizedByAt, x.authorizedBy).name}</td>
    </tr>`)}</tbody>
  </table></div>`;
}

export function optionLabel(option) {
  if (option === 'auto-restrict') return 'Automatic restriction';
  if (option === 'define') return 'Starting authority';
  if (option === 'not-delegated') return 'Not delegated, by design';
  const o = seed.DECISION_OPTIONS.find((x) => x.id === option);
  return o ? o.name : option;
}

// Safety limits: the rules' "Authority is reduced automatically when" lines,
// with their latest readings. A limit applies while the capability is above
// its fallback level.
function rulesCard(state, cap) {
  const { rules } = monitoringStatus(state, cap.id);
  const unit = (r) => (r.threshold && r.threshold.type === 'pct' ? '%' : '');
  const windowText = (r) => (!r.window ? '' : r.window.cases ? ` across the last ${r.window.cases} cases` : ` over the last ${r.window.days} days`);
  const status = (r) => {
    if (!r.active) return badge('neutral', `Applies above ${levelName(r.fallback)}`);
    if (!r.measured) return badge('neutral', 'No data yet');
    if (r.crossed) return badge('fail', r.kind === 'incident' ? 'Incident' : 'Over the limit');
    return badge('pass', 'Within limit');
  };
  const effect = (r) => r.kind === 'incident'
    ? 'If crossed: an incident is opened; authority doesn\'t change.'
    : `If crossed: ${cap.name} goes back to ${levelName(r.fallback)}${r.defaulted ? ' (one level down, because the rule names no level)' : ''}.`;
  const reading = (r) => {
    if (!r.active || !r.measured || !r.threshold) return '';
    const limit = r.threshold.type === 'pct' ? `limit ${r.threshold.value}%` : `limit ${r.threshold.value}`;
    const fill = Math.min(100, (r.value / r.threshold.value) * 80);
    return html`<div class="rule-reading ${r.crossed ? 'is-crossed' : ''}" role="img" aria-label="Now ${r.value}${unit(r)}${windowText(r)}, ${limit}">
      <div class="rule-reading-bar"><span style="width:${fill}%"></span><i></i></div>
      <span class="small">Now <strong>${r.value}${unit(r)}</strong>${windowText(r)} · ${limit} <span class="muted">(${r.fromGate ? 'counted from logged actions' : 'simulated'})</span></span>
    </div>`;
  };
  return section('Safety limits', rules.length
    ? html`<div class="card"><ul class="rule-list">${rules.map((r) => html`<li><div class="rule-list-head"><span>${r.text}</span>${status(r)}</div>${reading(r)}<p class="muted small">${effect(r)}${r.threshold && r.window ? '' : ' This one can\'t be checked automatically: it has no number or time window. Add one in the rules.'}</p></li>`)}</ul></div>`
    : html`<p class="empty">No safety limits in the rules yet.</p>`,
    { subtitle: 'From the rules, under "Authority is reduced automatically when". These are checked automatically, so a problem is caught even if nobody is watching.' });
}

// Post-incident review (#54): the form while a restriction or rule incident is
// open, then the recorded reviews. The owner or a Risk approver records it
// (a Risk approver for High/Financial); authority stays where the rule left it.
function reviewCard(state, cap, d) {
  const need = reviewNeeded(state, cap.id);
  const done = (d.reviews || []).slice().reverse();
  const recorded = done.map((rv) => html`<div class="card review-record"><p class="eyebrow">${rv.id} · Post-incident review · ${fmtDate(rv.date)}</p>
    ${kv([['Reviewed by', html`${personAt(rv.byAt, rv.by).name}${rightsNote(rv.byAt)}`], ['About', [rv.restrictionRecordId ? html`<a href="#/decisions/${rv.restrictionRecordId}">${rv.restrictionRecordId}</a>` : null, ...rv.incidentIds].filter(Boolean).map((x, i) => html`${i ? ', ' : ''}${x}`)], ['What happened', rv.whatHappened], ['Cause', rv.cause], ['What changed', rv.changes], ['Authority', html`Stayed at ${authorityLabel(rv.authorityAt)}. Giving it more authority again needs a proposed change and a named person's approval.`]])}
  </div>`);
  if (!need.any) return recorded.length ? html`${recorded}` : '';
  const by = actor(state, cap.id);
  const who = person(by);
  const e = reviewEligibility(state, cap.id, by);
  const covers = [need.restriction ? `the automatic move back to ${levelName(cap.authority.level)} (${d.monitoring && d.monitoring.breachRecordId})` : null, need.incidents.length ? need.incidents.map((x) => x.incidentId).join(', ') : null].filter(Boolean).join(' and ');
  return html`<form class="card review-form" data-form="record-review" data-capability="${cap.id}">
    <p class="eyebrow">Review what happened</p>
    <p>About ${covers}. Saving this review clears the alert and lets anyone propose more authority again. ${need.restriction ? html`${cap.name} stays at ${authorityLabel(cap.authority)} until a change is approved.` : 'Authority doesn\'t change.'}</p>
    <label class="field field-stack"><span>What happened</span><textarea name="whatHappened" rows="2" required></textarea></label>
    <label class="field field-stack"><span>Cause</span><textarea name="cause" rows="2" required></textarea></label>
    <label class="field field-stack"><span>What changed as a result</span><textarea name="changes" rows="2" required></textarea></label>
    <p class="muted small">Recording as <strong>${who.name}</strong>, ${who.role}. Who can do this: ${isHighOrFinancial(state, cap.id) ? 'a Risk approver, because this capability is High impact or Financial' : 'the owner or a Risk approver'}, but not the person who approved the authority being reviewed. <span class="muted">(Formally: post-incident review.)</span></p>
    ${e.ok ? '' : html`<p class="form-error" role="status">${e.reason} ${SWITCH_PERSON}</p>`}
    <button class="btn btn-primary" type="submit" ${e.ok ? '' : raw('disabled')}>Save review</button>
  </form>${recorded}`;
}

// Two views (#95, renamed in the simplification pass): Still safe? and
// Delivering value? (is it worth it, and are people using it well?). The
// second view's chip counts what needs a look.
function monitoringTab(state, cap, d, show = null) {
  const m = d.monitoring;
  const st = monitoringStatus(state, cap.id);
  const applying = st.rules.filter((r) => r.active).length;
  const demo = breachRule(state, cap.id);
  const head = m && m.breached && m.reviewId
    ? notice('watch', `The AI was moved back to ${levelName(cap.authority.level)} after crossing a safety limit. Review done.`, `It stays at ${authorityLabel(cap.authority)}. The limit it crossed: ${m.reading}. To give it more authority again, propose a change and get it approved. The review is below.`, { link: `#/decisions/${m.breachRecordId}`, linkText: 'Decision record' })
    : m && m.breached
    ? notice('fail', `The AI was moved back to ${levelName(cap.authority.level)} after crossing a safety limit.`, `It crossed this limit: ${m.reading}. Before it can get more authority again, someone has to review what happened (form below). Formally: automatic restriction.`, { link: `#/decisions/${m.breachRecordId}`, linkText: 'Decision record' })
    : m && m.recordId
      ? notice('pass', `Given more authority ${m.windowDays} days ago (simulated)`, 'We\'re watching closely for the first weeks. If any safety limit below is crossed, the AI\'s authority is reduced automatically, without waiting for someone to notice.', { link: `#/decisions/${m.recordId}`, linkText: 'Decision record' })
      : !st.rules.length
        ? notice('neutral', 'No safety limits set', `${cap.name}'s rules don't say when to reduce its authority, so nothing is checked automatically. Add a line under "Authority is reduced automatically when".`)
        : st.running
          ? notice('pass', 'Being watched', `${applying} of ${st.rules.length} safety limit${st.rules.length === 1 ? '' : 's'} appl${applying === 1 ? 'ies' : 'y'} at ${authorityLabel(cap.authority)}. Each is checked automatically against the latest numbers below.`)
          : notice('neutral', 'No safety limits apply yet', `${cap.name} is at ${authorityLabel(cap.authority)}. Its safety limits start applying once it has more authority than they would take it back to.`);
  // Outcomes first: one grid, with its time frame in the title.
  const metrics = m && m.autonomousActions != null ? section('Since the AI was given more authority', html`<div class="metric-grid metric-grid-4">
      <div class="metric card"><div class="metric-top"><span class="metric-label">Completed automatically</span></div><div class="metric-value">${m.autonomousActions}</div></div>
      <div class="metric card"><div class="metric-top"><span class="metric-label">Sent to a person</span></div><div class="metric-value">${m.escalated}</div></div>
      <div class="metric card"><div class="metric-top"><span class="metric-label">Reversed by a reviewer</span></div><div class="metric-value">${m.reversals}</div></div>
      <div class="metric card"><div class="metric-top"><span class="metric-label">Incidents</span>${m.incidents ? badge('fail', 'Needs a look') : badge('pass', 'None')}</div><div class="metric-value">${m.incidents}</div></div>
    </div>`) : '';
  const incidents = d.ruleIncidents || [];
  const fired = m && m.breached
    ? html`<div class="card rule-card is-breached"><p class="eyebrow">The limit it crossed</p><p>${m.rule}</p><ul class="plain-list"><li class="muted small">What went wrong:</li>${m.errors.map((e) => html`<li>${e}</li>`)}</ul>
        <p class="muted small">What happened next: ${cap.name} moved back to ${levelName(cap.authority.level)} straight away, a decision record was written, and an alert appeared on the Overview. History shows why.</p></div>`
    : '';
  const opened = incidents.length
    ? html`<div class="card rule-card is-breached"><p class="eyebrow">Incidents from a safety limit</p>${incidents.map((x) => html`<p><strong>${x.incidentId}</strong>, ${fmtDate(x.date)}: ${x.errors.join(' ')} <span class="muted small">Authority didn't change.</span></p>`)}</div>`
    : '';
  const control = demo
    ? html`<div class="card rule-card"><p class="eyebrow">Demo control</p><p class="muted small">Pretend the AI crosses "${demo.text}" to see what happens automatically.</p>
        <button class="btn btn-danger" data-action="simulate-breach" data-capability="${cap.id}">${demo.kind === 'incident' ? 'Simulate an incident' : 'Simulate crossing the limit'}</button></div>`
    : '';
  const base = `#/capabilities/${cap.id}?tab=monitoring`;
  const missed = expectedVsActual(state, cap.id).rows.filter((r) => r.status === 'not-met').length;
  const warnings = adoptionSignals(state, cap.id).length;
  const value = show === 'value';
  const views = subNav([{ href: base, label: 'Still safe?', active: !value }, { href: `${base}&show=value`, label: 'Delivering value?', active: value, count: missed + warnings }], 'Monitoring views');
  if (value) {
    const parts = html`${expectedCard(state, cap)}${roiCard(state, cap)}${adoptionCard(state, cap)}`;
    return html`${views}${String(parts).trim() ? parts : html`<p class="empty">Nothing to show yet. This fills in once the AI is given more authority with an expected impact.</p>`}`;
  }
  // C1: the rollout plan of the decision in force, if it has one.
  const g = grantingRecord(state, cap.id);
  const rollout = g && g.rolloutPlan ? html`<p class="small muted mon-rollout">Rollout plan: ${g.rolloutPlan.ownerAt ? g.rolloutPlan.ownerAt.name : g.rolloutPlan.owner} · starts ${fmtDate(g.rolloutPlan.startDate)} · review on ${fmtDate(g.rolloutPlan.reviewDate)} · <a href="#/decisions/${g.id}">See plan</a></p>` : '';
  return html`${views}${head}${rollout}${reviewCard(state, cap, d)}${metrics}${rulesCard(state, cap)}${fired}${opened}${control}`;
}

// Where a number came from, always shown (B2): demo data, or the logged actions with their sources.
const sourceTag = (source, seeded) => html`<span class="muted small">${source}</span>${seeded ? html` ${badge('neutral', 'Demo data')}` : ''}`;
const money = (v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// Adoption signals (C2): warnings, never blocking, each with what it saw,
// why it matters and where the data came from.
function adoptionCard(state, cap) {
  const signals = adoptionSignals(state, cap.id);
  const checked = 'Approvals made without real review, more and more reversals, approvals left waiting, and work done outside the AI.';
  const body = signals.length
    ? signals.map((x) => html`<div class="notice notice-watch adoption-signal" role="status"><div class="notice-body"><strong>${x.title}</strong>${x.simulated ? html` ${badge('neutral', 'Simulated')}` : ''}
        <p>${x.what}</p><p class="muted small">Why it matters: ${x.why}</p><p class="muted small">Data: ${x.source}.</p></div></div>`)
    : notice('pass', 'Nothing looks off', `Checked: ${checked}`);
  return section('How people are using it', body, { subtitle: `Early warnings only. They never block anything. ${signals.length ? `Checked: ${checked}` : ''}` });
}

// Expected vs actual (B2): each expected outcome on the record in force.
function expectedCard(state, cap) {
  const { record, rows } = expectedVsActual(state, cap.id);
  if (!record) return '';
  if (!rows.length) return section('Expected impact vs actual', html`<p class="empty">${record.id} was approved before expected impact was recorded, so there's nothing to compare yet. The next authority change will include it.</p>`);
  const tone = { met: 'pass', 'not-met': 'fail', 'not-measured': 'neutral' };
  const word = { met: 'Met', 'not-met': 'Not met', 'not-measured': 'Not measured' };
  return section('Expected impact vs actual', html`<div class="card table-card"><table class="table">
    <thead><tr><th>Expected</th><th>Target</th><th>Actual</th><th>Status</th><th>Data</th></tr></thead>
    <tbody>${rows.map((r) => html`<tr>
      <td><strong>${r.metric}</strong>${r.measuredAs ? html`<div class="muted small">Measured as: ${r.measuredAs}</div>` : ''}</td>
      <td>${r.target}</td>
      <td>${r.actualText || html`<span class="muted">—</span>`}</td>
      <td>${badge(tone[r.status], word[r.status])}${r.status === 'not-met' ? html`<div class="muted small">${r.gapText}</div>` : r.note ? html`<div class="muted small">${r.note}</div>` : ''}</td>
      <td>${r.source ? sourceTag(r.source, r.seeded) : html`<span class="muted small">—</span>`}</td>
    </tr>`)}</tbody>
  </table></div>`, { subtitle: html`From <a href="#/decisions/${record.id}">${record.id}</a>, the current decision. If we can't find a measured number for an outcome, it shows as "Not measured". We never guess.` });
}

// A simple ROI (B2), every assumption visible, versioned with author and reason.
function roiCard(state, cap) {
  const a = currentRoiAssumptions(state, cap.id);
  if (!a) return '';
  const r = roi(state, cap.id);
  const who = actor(state, cap.id);
  const e = roiEditEligibility(state, cap.id, who);
  const by = personAt(a.byAt, a.by);
  const versions = roiVersions(state, cap.id);
  const result = r ? html`<div class="metric-grid metric-grid-4">
      <div class="metric card"><div class="metric-top"><span class="metric-label">Cases handled by the AI</span></div><div class="metric-value">${r.automated.toLocaleString('en-US')}</div><div class="metric-note">a month, with ${r.inputs.automationRate.value}% done automatically</div></div>
      <div class="metric card"><div class="metric-top"><span class="metric-label">Staff hours saved</span></div><div class="metric-value">${Math.round(r.hoursSaved)}</div><div class="metric-note">${money(r.laborSaved)} a month</div></div>
      <div class="metric card"><div class="metric-top"><span class="metric-label">AI cost</span></div><div class="metric-value">${money(r.aiCost)}</div><div class="metric-note">a month, at $${r.inputs.aiCostPerCase.value.toFixed(2)} a case</div></div>
      <div class="metric card"><div class="metric-top"><span class="metric-label">Net a month</span>${badge(r.net >= 0 ? 'pass' : 'fail', r.roiPct != null ? `ROI ${r.roiPct}%` : '')}</div><div class="metric-value">${money(r.net)}</div><div class="metric-note">hours saved × hourly cost − AI cost</div></div>
    </div>` : html`<p class="empty">ROI appears once the AI is completing some actions automatically, so we know how much work it takes on.</p>`;
  const inputs = r ? html`<li><strong>Share done automatically:</strong> ${r.inputs.automationRate.value}% · ${sourceTag(r.inputs.automationRate.source, r.inputs.automationRate.seeded)}</li>
      <li><strong>AI cost per case:</strong> $${r.inputs.aiCostPerCase.value.toFixed(2)} · ${sourceTag(r.inputs.aiCostPerCase.source, r.inputs.aiCostPerCase.seeded)}</li>` : '';
  const form = html`<details class="card"><summary>Change the assumptions</summary>
    <form class="roi-form" data-form="roi-assumptions" data-capability="${cap.id}">
      <div class="roi-fields">${ROI_FIELDS.map((f) => html`<label class="field field-stack"><span>${f.label} (${f.unit})</span><input type="number" name="${f.key}" step="any" min="${f.min}" max="${f.max}" value="${a.values[f.key]}" required></label>`)}</div>
      <label class="field field-stack"><span>Why you're changing them</span><textarea name="reason" rows="2" required></textarea></label>
      ${e.ok ? '' : html`<p class="form-error" role="status">${e.reason} ${SWITCH_PERSON}</p>`}
      <button class="btn btn-primary" type="submit" ${e.ok ? '' : raw('disabled')}>Save</button>
      <p class="muted small">Changes are kept in history. The owner or a named stakeholder can make them.</p>
    </form></details>`;
  return section('Return on investment', html`${result}
    <div class="card">
      <p class="eyebrow">Assumptions${a.seeded ? html` ${badge('neutral', 'Demo data')}` : ''}</p>
      <ul class="plain-list">${ROI_FIELDS.map((f) => html`<li><strong>${f.label}:</strong> ${f.unit === '$' ? `$${a.values[f.key]}` : `${a.values[f.key].toLocaleString('en-US')} ${f.unit}`}</li>`)}${inputs}</ul>
      <p class="muted small">Set by ${by.name}, ${by.role}, on ${fmtDate(a.date)}. Reason: ${a.reason}</p>
      ${versions.length > 1 ? html`<details><summary>History (${versions.length - 1})</summary><ul class="plain-list">${versions.slice(0, -1).reverse().map((v) => html`<li><strong>v${v.version}</strong>, ${fmtDate(v.date)}, ${personAt(v.byAt, v.by).name}: ${ROI_FIELDS.map((f) => `${f.label.toLowerCase()} ${v.values[f.key]}`).join('; ')}. <span class="muted small">${v.reason}</span></li>`)}</ul></details>` : ''}
    </div>${form}`, { subtitle: 'A rough monthly estimate: staff time saved on cases the AI completes, minus what the AI costs on every case. It doesn\'t count time spent on approvals or set-up costs.' });
}
