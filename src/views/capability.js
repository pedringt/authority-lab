import * as seed from '../data/seed.js';
import { DATA_FIELDS } from '../data/seed.js';
import { html, raw, section, badge, capStatusBadge, authorityBadge, levelScale, kv, fmtDate, person, personAt, notice, empty, warningNotice, authorityText, rightsNote, lede, subNav, tabIntro } from '../ui.js';
import { getCapability, capData, readiness, authorityLabel, testSummary, current, versionList, criteriaLocked, criteriaSaved, needsSignoff, decisionRequired, proposedAuthority, lastEvaluated, lastDecisionId, coverageWarnings, monitoringStatus, breachRule, levelName, reviewNeeded, reviewEligibility, actor, isHighOrFinancial, workflowOf, waitingActions, queueApprovers, queueEligibility, QUEUE_LIMIT, gateSummary, gateEvents, GATE_SOURCES, expectedVsActual, roi, roiVersions, currentRoiAssumptions, roiEditEligibility, ROI_FIELDS, grantingRecord, adoptionSignals, LEVEL_PLAIN, readinessText, overviewTodos, overviewApprovals } from '../store/index.js';
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
  if (!cap) return html`<div class="page-head"><h1>Capability not found</h1></div>`;
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
    ${tab === 'summary' ? '' : html`<div class="page-actions cap-level"><a href="${base}" title="${levelName(cap.authority.level)}">${ladder(cap.authority.level)} Level ${cap.authority.level}, ${levelName(cap.authority.level)}${cap.authority.limited ? ' (limited)' : ''}</a></div>`}
  </div>
  ${query.get('error') ? notice('fail', 'Could not complete that action', query.get('error')) : ''}
  ${query.get('tightened') ? notice('pass', 'Targets tightened', 'Every change only made a target stricter, so it applied straight away. Changes are kept in history.', { link: `#/capabilities/${cap.id}/versions?kind=criteria`, linkText: 'History' }) : ''}
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
        ? html`<p>${badge('decision', 'Ready to propose')} The test suite has run.</p><button class="btn btn-primary" data-action="propose-authority" data-capability="${cap.id}" data-level="${cap.authority.level + 1}">Propose a move to Level ${cap.authority.level + 1}</button>`
        : cap.status === 'not-delegated'
          ? html`<p>${badge('neutral', 'Not delegated, by design')}</p>`
          : held
            ? html`<p>${badge('restricted', 'Not yet')} Held until its condition is met.</p>`
            : html`<p>${badge('neutral', 'No decision open')} ${r.total ? readinessText(r) : ''}</p>`;

  const authority = html`<section class="card sum-authority">
    <div class="sum-now">
      <p class="fact-label">Current authority</p>
      <p class="sum-level">${ladder(cap.authority.level, pending && proposed ? proposed.level : null)}<span>Level ${cap.authority.level} · ${levelName(cap.authority.level)}${cap.authority.limited ? ' (limited)' : ''}</span></p>
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
  return html`${setup ? html`<div class="notice notice-neutral"><div class="notice-body"><strong>Setup: ${setup.title}</strong><p>${setup.text}</p></div><a class="notice-link" href="#/capabilities/${cap.id}/setup">Continue setup</a></div>` : ''}
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
    ${canPropose ? html`<div class="notice notice-neutral"><div class="notice-body"><strong>Ready for the first authority change</strong><p>The test suite has run. Propose a move to Level ${cap.authority.level + 1}, ${levelName(cap.authority.level + 1)}; a person then decides.</p></div><button class="btn btn-sm btn-primary" data-action="propose-authority" data-capability="${cap.id}" data-level="${cap.authority.level + 1}">Propose a move to Level ${cap.authority.level + 1}</button></div>` : ''}
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
    ['Impact', risk.impact],
    ['Reversibility', risk.reversibility],
    ['Exposure', risk.exposure],
    ['Failure types watched', (risk.failureTypes || []).join(', ') || 'None listed'],
    ...(risk.note ? [['Note', risk.note]] : []),
  ]), { subtitle: 'The risk profile sets how much evidence an authority increase needs.' });
  const contractVersions = versionList(state, cap.id, 'contract');
  if (!contractVersions.length) {
    return html`${emptyState(state, cap.id, d.contractDraft ? 'The contract draft is not finalized yet.' : 'No delegation contract yet.', 'contract')}${riskBlock}`;
  }
  const latest = contractVersions[contractVersions.length - 1];
  return html`
    ${tabIntro('What the AI may do on its own, what needs a person, and what it must never do.', 'The contract is enforced by software, not by the model\'s judgment.', html`<span class="muted">Version ${latest.version}, ${personAt(latest.authorAt, latest.author).name}, <a href="#/capabilities/${cap.id}/versions?kind=contract&version=${latest.version}">history</a>.</span> ${amendLink(state, cap.id, 'contract')}`)}
    ${proposalsList(state, cap.id, 'contract')}
    ${contractReviewView(contractVersions[0].review)}
    <div class="contract-grid">
      <div class="card contract-block contract-may"><h3>The AI may</h3>${list(c.may)}</div>
      <div class="card contract-block contract-never"><h3>The AI must never</h3>${list(c.mustNever)}</div>
      <div class="card contract-block contract-ask contract-wide"><h3>Ask a person when</h3>
        <div class="two-col"><div><p class="fact-label">For these cases</p>${list(c.mustAsk)}</div>
        <div><p class="fact-label">Whenever this comes up</p>${list(c.escalation)}${c.escalation.some((l) => /confidence/i.test(l)) ? html`<p class="muted small">Confidence is reported by the model, not verified. Software checks it but can't confirm it, and never treats it as a reason to allow.</p>` : ''}</div></div>
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

// Gate activity (A5): what the gate decided for this capability, rolled up,
// with the latest events and where they came from.
function gateActivityCard(state, cap) {
  const g = gateSummary(state, cap.id);
  if (!g.events) return section('Gate activity', html`<p class="empty">No gate events yet. Every action the AI asks for, and every decision on a waiting action, will show here.</p>`);
  const pct = (v) => (v == null ? '—' : `${v}%`);
  const recent = gateEvents(state, cap.id).slice(-10).reverse();
  const who = (e) => (e.actor === 'ai' ? 'AI' : person(e.actor).name);
  const verdictBadge = { allow: badge('pass', 'Allowed'), 'needs-person': badge('decision', 'Needs a person'), block: badge('fail', 'Blocked'), approved: badge('pass', 'Approved'), rejected: badge('neutral', 'Rejected') };
  return section('Gate activity', html`<div class="metric-grid metric-grid-4">
      <div class="metric card"><div class="metric-top"><span class="metric-label">Allowed automatically</span></div><div class="metric-value">${g.counts.allowed}</div><div class="metric-note">${pct(g.rates.automation)} of actions</div></div>
      <div class="metric card"><div class="metric-top"><span class="metric-label">Sent to a person</span></div><div class="metric-value">${g.counts.escalated}</div><div class="metric-note">${g.counts.approved} approved, ${g.counts.overridden} rejected</div></div>
      <div class="metric card"><div class="metric-top"><span class="metric-label">Blocked</span></div><div class="metric-value">${g.counts.blocked}</div><div class="metric-note">${pct(g.rates.block)} of actions · <span class="${g.mustNeverAttempts ? 'text-fail' : ''}">${g.mustNeverAttempts} must-never attempt${g.mustNeverAttempts === 1 ? '' : 's'}</span> · <span class="${g.falseClaims ? 'text-fail' : ''}">${g.falseClaims} false claim${g.falseClaims === 1 ? '' : 's'}</span></div></div>
      <div class="metric card"><div class="metric-top"><span class="metric-label">Refused at execution</span></div><div class="metric-value">${g.counts.refused}</div><div class="metric-note">approved, then re-checked</div></div>
    </div>
    <div class="card table-card"><table class="table"><thead><tr><th>Event</th><th>Who</th><th>What</th><th>Verdict</th><th>Rule</th><th>Source</th></tr></thead>
      <tbody>${recent.map((e) => html`<tr><td class="muted small">${e.id} · ${fmtDate(e.date)}</td><td>${who(e)}</td><td>${e.tool}${e.orderId ? ` ${e.orderId}` : ''}${e.queueId ? html` <span class="muted small">(${e.queueId})</span>` : ''}</td><td>${verdictBadge[e.verdict] || e.verdict}</td><td class="small">${e.rule ? e.rule.text : ''}</td><td class="muted small">${GATE_SOURCES[e.source] || e.source}</td></tr>`)}</tbody>
    </table></div>`, { subtitle: `${g.events} events, from: ${g.sources.map((x) => GATE_SOURCES[x] || x).join(', ')}. Every check the gate makes is logged; these counts feed the Evidence page and the restriction rules the gate can measure.` });
}

// "Waiting for a person" (A4): actions the gate sent to a person. A named,
// active stakeholder approves or rejects with a reason; approval re-runs the
// gate and executes only if nothing new appeared since it was queued.
function waitingTab(state, cap, query) {
  const all = (state.actionQueue || []).filter((x) => x.capabilityId === cap.id);
  const waiting = all.filter((x) => x.status === 'waiting');
  const decided = all.filter((x) => x.status !== 'waiting').reverse();
  const by = actor(state, cap.id);
  const who = person(by);
  const approvers = queueApprovers(state, cap.id).map((k) => person(k).name);
  const error = query.get('error');
  const statusBadge = { executed: badge('pass', 'Approved and executed'), rejected: badge('neutral', 'Rejected'), refused: badge('fail', 'Approved, refused at execution') };
  const card = (x) => {
    const e = queueEligibility(state, x.id, by);
    return html`<article class="card waiting-item" id="${x.id}">
      <div class="version-head"><div><span class="eyebrow">${x.id} · requested by the AI · ${fmtDate(x.date)} · at Level ${x.levelAtRequest}${x.follows ? html` · follows <a href="#${x.follows}">${x.follows}</a>` : ''}</span><h3>${describeAction(x)}</h3></div>${x.status === 'waiting' ? badge('decision', 'Waiting') : statusBadge[x.status]}</div>
      <p class="fact-label">Needs a person because</p>
      <ul class="plain-list">${x.findings.map((f) => html`<li>${f.rule.text}</li>`)}</ul>
      ${x.status === 'waiting'
        ? e.ok
          ? html`<form class="line-add decide-form" data-form="decide-action" data-id="${x.id}">
              <input type="text" name="reason" maxlength="240" placeholder="Reason (required)" aria-label="Reason">
              <button class="btn btn-sm btn-primary" type="submit" name="decision" value="approve">Approve as ${who.name}</button>
              <button class="btn btn-sm btn-danger" type="submit" name="decision" value="reject">Reject</button>
            </form>
            <p class="muted small">Approving re-runs the gate at that moment. If anything changed since it was queued (the capability was restricted, a cap was crossed, the order is now blocked), it won't execute and the reason is recorded.</p>`
          : html`<p class="muted small">${e.reason} Switch who is acting in the header.</p>`
        : html`${kv([['Decided by', html`${x.decision.byAt ? x.decision.byAt.name : x.decision.by}, ${fmtDate(x.decision.date)}`], ['Reason', x.decision.reason], ...(x.decision.refusal ? [['Not executed', x.decision.refusal]] : []), ...(x.decision.refundId ? [['Refund', x.decision.refundId]] : [])])}`}
    </article>`;
  };
  return html`
    ${error ? notice('fail', 'Could not record that decision', error) : ''}
    ${tabIntro('When the gate says an action needs a person, it waits here instead of running.', `${approvers.length ? `Who can decide: ${approvers.join(', ')} (the owner and the named stakeholders, active only).` : 'Nobody can decide: the capability has no active owner or stakeholders.'} The AI can ask; it can never approve. At most one action waits per order, and at most ${QUEUE_LIMIT} per capability; past that, new requests are blocked and an incident is opened.`)}
    ${section(`Waiting (${waiting.length})`, waiting.length ? html`${waiting.map(card)}` : html`<p class="empty">Nothing is waiting for a person.</p>`)}
    ${decided.length ? section('Decided', html`${decided.map(card)}`) : ''}`;
}

function describeAction(x) {
  const a = x.call.args || {};
  return x.call.tool === 'issue_refund' ? `Refund $${a.amount} on ${a.orderId}` : `${x.call.tool}${a.orderId ? ` on ${a.orderId}` : ''}`;
}

// The contract's data boundary (A2): what tool results may show the AI.
function dataBoundaryCard(c) {
  const seen = new Set(c.dataSeen || []);
  const shown = DATA_FIELDS.filter((f) => seen.has(f.id) && !f.restricted);
  const hidden = DATA_FIELDS.filter((f) => !seen.has(f.id) || f.restricted);
  return html`<div class="card contract-block contract-data">
    <h3>The AI can access</h3>
    ${Array.isArray(c.dataSeen)
      ? html`<div class="two-col data-columns"><div><p class="fact-label">Shown to the AI</p>${shown.length ? html`<ul class="contract-list">${shown.map((f) => html`<li>${f.label}</li>`)}</ul>` : html`<p class="muted">Nothing.</p>`}</div>
        <div><p class="fact-label">Never shown to the AI</p><ul class="contract-list">${hidden.map((f) => html`<li>${f.label}${f.restricted ? html` <span class="muted small">(restricted)</span>` : ''}</li>`)}</ul></div></div>`
      : html`<p class="muted">This contract has no data section, so tool results show the AI nothing from the systems of record.</p>`}
    <p class="muted small">Software filters every tool result to these fields before the model sees it. Card numbers and full addresses are restricted: no contract can list them. A refusal tells the model the rule, never the record.</p>
  </div>`;
}

function criteriaTab(state, cap) {
  const criteria = current(state, cap.id, 'criteria');
  if (!criteriaSaved(state, cap.id)) return emptyState(state, cap.id, 'No targets yet.', 'criteria');
  const locked = criteriaLocked(state, cap.id);
  const rows = criteria.map((c) => html`<tr>
    <td><strong>${c.name}</strong></td>
    <td>${c.target}</td>
    <td>${c.current}</td>
    <td>${c.status === 'pending' ? badge('neutral', 'Not yet measured') : badge(c.status)}</td>
    <td class="muted">${c.note}</td>
  </tr>`);
  const defining = state.decisionRecords.find((x) => x.capabilityId === cap.id && x.number === 2);
  const v = versionList(state, cap.id, 'criteria');
  return html`
    ${locked
      ? html`<div class="notice notice-watch"><div class="notice-body"><strong>Locked since the first performance results</strong><p>Criteria v${v.length} and requirements v${versionList(state, cap.id, 'requirements').length}. Changing the bar after seeing results needs a proposed amendment with sign-off.</p></div>${amendLink(state, cap.id, 'criteria')}</div>
        ${proposalsList(state, cap.id, 'criteria')}`
      : html`<div class="notice notice-neutral"><div class="notice-body"><strong>Open until the first test run</strong><p>Criteria v${v.length} and requirements v${versionList(state, cap.id, 'requirements').length}. Every save writes a new version; the first test run locks them.</p></div><a class="notice-link" href="#/capabilities/${cap.id}/criteria/edit">Edit</a></div>`}
    <p class="muted">${defining ? html`Defined before the pilot started, as part of authority change <a href="#/decisions/${defining.id}">${defining.id}</a>. ` : ''}These are the thresholds the decision is measured against, not a score.</p>
    ${rows.length ? html`<div class="card table-card"><table class="table table-criteria">
      <thead><tr><th>Criterion</th><th>Target</th><th>Current</th><th>Status</th><th>Note</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>` : empty('No success criteria defined.')}
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
  if (!reqs.length) return empty('No evidence requirements defined.');
  return html`<div class="card">
    <ul class="req-list">${reqs.map((q) => html`<li class="${q.met ? 'is-met' : 'is-unmet'}">
      <span class="req-mark" aria-hidden="true">${q.met ? '✓' : '⚠'}</span>
      <span class="req-text"><strong>${q.text}</strong><span class="muted"> · ${q.met ? 'Met' : 'Not met'}: ${q.current}</span>${q.gap ? html`<p class="req-gap">${q.gap}</p>` : ''}</span>
    </li>`)}</ul>
    <p class="muted small"><strong>${r.met} of ${r.total}</strong> requirements met.</p>
  </div>`;
}

function testingTab(state, cap) {
  const t = testSummary(state, cap.id);
  if (!t.total) return emptyState(state, cap.id, 'No scenarios yet.', 'scenarios');
  return html`
    <p class="muted">${t.total} scenarios. ${t.status === 'complete'
      ? html`Run today: ${t.passed} of ${t.total} passed, ${t.highSeverity} high-severity failure${t.highSeverity === 1 ? '' : 's'}.`
      : t.lastRun ? html`Last run ${fmtDate(t.lastRun)}: ${t.recorded.passed} of ${t.total} passed, ${t.recorded.highSeverity} high-severity failure${t.recorded.highSeverity === 1 ? '' : 's'}.` : 'Not yet run.'} <a href="#/tests?capability=${cap.id}">Open the testing ground</a> to run the suite and filter results.</p>
    ${scenarioTable(state, cap.id, { filter: 'failed', compact: true })}`;
}

function evidenceTab(state, cap, d) {
  const p = d.pilot;
  if (!p) return html`${emptyState(state, cap.id, d.evidence.length ? 'No pilot has been run for this capability.' : 'No evidence yet.', 'tests')}${d.evidence.length ? html`<p class="muted small">Other evidence is in the <a href="#/evidence?capability=${cap.id}">evidence repository</a>.</p>` : ''}${evidenceSourcesCard()}`;
  const rows = p.segments.map((s) => html`<tr class="${s.status === 'insufficient' ? 'row-insufficient' : ''}">
    <td><strong>${s.name}</strong></td>
    <td class="num">${s.cases}</td>
    <td class="num">${s.accuracy}%</td>
    <td class="num">${s.overrideRate}%</td>
    <td class="num">${s.severeErrors}</td>
    <td>${badge(s.status)}</td>
  </tr>`);
  const weak = p.segments.filter((s) => s.status === 'insufficient');
  const unmetReq = readiness(state, cap.id).unmet[0];
  return html`
    <div class="pilot-head">
      <div><p class="eyebrow">Limited pilot · ${fmtDate(p.started)} to ${p.ended ? fmtDate(p.ended) : 'Oct 6'}</p><p class="readiness-big">${p.cases}<span> real cases observed, every one reviewed by an agent</span></p></div>
      <div class="pilot-stats">
        <div><span class="fact-label">Overall accuracy</span><strong>${p.accuracy}%</strong></div>
        <div><span class="fact-label">Overridden</span><strong>${p.overrides} (${p.overrideRate}%)</strong></div>
        <div><span class="fact-label">Edited</span><strong>${p.edits} (${p.editRate}%)</strong></div>
        <div><span class="fact-label">Severe errors</span><strong>${p.severeErrors} (${p.severeErrorRate}%)</strong></div>
      </div>
    </div>
    <div class="card table-card"><table class="table">
      <thead><tr><th>Segment</th><th class="num">Cases</th><th class="num">Accuracy</th><th class="num">Override rate</th><th class="num">Severe errors</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${weak.map((s) => notice('insufficient', 'Overall performance looks good. One segment does not.', `${s.name} have ${s.cases} cases at ${s.accuracy}% accuracy and a ${s.overrideRate}% override rate. That is too few cases to conclude anything, and the aggregate ${p.accuracy}% hides it.${unmetReq ? ` The evidence requirement for this segment is ${unmetReq.text.toLowerCase().replace(/^minimum /, '')}.` : ''}`))}
    ${p.severeErrorList && p.severeErrorList.length ? section('Severe errors in the pilot', html`<div class="card"><ul class="plain-list">${p.severeErrorList.map((e) => html`<li><span class="muted">${fmtDate(e.date)} · ${p.segments.find((s) => s.id === e.segment).name}</span><br>${e.text}</li>`)}</ul><p class="muted small">All ${p.severeErrors} were caught in review before any action. That is what Draft authority is for; it is also why the override rate matters more than the raw error count.</p></div>`) : ''}
    ${current(state, cap.id, 'requirements').length ? section('Evidence requirements', requirementsList(state, cap.id)) : ''}
    <p class="muted small">All evidence for this capability is in the <a href="#/evidence?capability=${cap.id}">evidence repository</a>.</p>`;
}

function stakeholdersTab(state, cap, d) {
  const tone = { 'expand': 'watch', 'expand-limits': 'pass', 'hold': 'insufficient', 'restrict': 'restricted', 'undecided': 'neutral' };
  const stakeholders = current(state, cap.id, 'stakeholders');
  if (!stakeholders.length) return emptyState(state, cap.id, 'No stakeholders named yet.', 'stakeholders');
  const gated = needsSignoff(state, cap.id, 'stakeholders');
  const editLink = html`<p class="muted small"><a href="#/capabilities/${cap.id}/stakeholders/edit">Edit stakeholders</a> · every save is a new version${gated ? '; after performance results, adding or removing people or changing a team label needs sign-off' : ''}.</p>${proposalsList(state, cap.id, 'stakeholders')}`;
  const cards = stakeholders.map((s) => {
    const who = person(s.person);
    return html`<div class="card stakeholder">
      <div class="stakeholder-head"><div><strong>${s.team}</strong><div class="muted small">${who.name}, ${who.role}</div></div>${badge(tone[s.stance] || 'neutral', s.position)}</div>
      ${s.quote ? html`<blockquote>${s.quote}</blockquote>` : html`<p class="muted small">No position recorded yet.</p>`}
    </div>`;
  });
  const sum = d.stakeholderSummary;
  return html`
    <p class="muted">Positions recorded ${stakeholders[0] && stakeholders[0].date ? fmtDate(stakeholders[0].date) : 'Oct 6'}. They are kept as positions, not averaged into a score.</p>
    ${editLink}
    <div class="stakeholder-grid">${cards}</div>
    ${sum ? html`<div class="two-col">
      <div class="card"><p class="eyebrow">Consensus</p><p>${sum.consensus}</p></div>
      <div class="card card-watch"><p class="eyebrow">Unresolved disagreement</p><p>${sum.disagreement}</p></div>
    </div>` : ''}`;
}

function decisionsTab(state, cap) {
  const records = state.decisionRecords.filter((x) => x.capabilityId === cap.id).slice().reverse();
  if (!records.length) return empty('No authority decisions have been recorded for this capability.');
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

// The restriction rules, read from the contract's "Automatic restriction"
// lines, with their latest readings. A rule applies while the capability is
// above its fallback level.
function rulesCard(state, cap) {
  const { rules } = monitoringStatus(state, cap.id);
  const version = rules[0] && rules[0].contractVersion;
  const unit = (r) => (r.threshold && r.threshold.type === 'pct' ? '%' : '');
  const windowText = (r) => (!r.window ? '' : r.window.cases ? ` across the last ${r.window.cases} cases` : ` over the last ${r.window.days} days`);
  const status = (r) => {
    if (!r.active) return badge('neutral', `Applies above ${levelName(r.fallback)}`);
    if (!r.measured) return badge('neutral', 'No measurements yet');
    if (r.crossed) return badge('fail', r.kind === 'incident' ? 'Incident' : 'Over the limit');
    return badge('pass', 'Within limit');
  };
  const effect = (r) => r.kind === 'incident'
    ? 'Opens an incident; authority stays where it is.'
    : `Returns ${cap.name} to ${levelName(r.fallback)}${r.defaulted ? ' (one level down; the line names no level)' : ''}.`;
  const reading = (r) => {
    if (!r.active || !r.measured || !r.threshold) return '';
    const limit = r.threshold.type === 'pct' ? `limit ${r.threshold.value}%` : `limit ${r.threshold.value}`;
    const fill = Math.min(100, (r.value / r.threshold.value) * 80);
    return html`<div class="rule-reading ${r.crossed ? 'is-crossed' : ''}" role="img" aria-label="Reading ${r.value}${unit(r)}${windowText(r)}, ${limit}">
      <div class="rule-reading-bar"><span style="width:${fill}%"></span><i></i></div>
      <span class="small">Reading <strong>${r.value}${unit(r)}</strong>${windowText(r)} · ${limit} <span class="muted">(${r.fromGate ? 'measured from the gate log' : 'simulated'})</span></span>
    </div>`;
  };
  return section('Restriction rules', rules.length
    ? html`<div class="card"><ul class="rule-list">${rules.map((r) => html`<li><div class="rule-list-head"><span>${r.text}</span>${status(r)}</div>${reading(r)}<p class="muted small">${effect(r)}${r.threshold && r.window ? '' : ' The line has no number or window, so software cannot check it.'}</p></li>`)}</ul></div>`
    : html`<p class="empty">The contract has no automatic restriction lines.</p>`,
    { subtitle: `From the contract's automatic restriction conditions${version ? `, contract v${version}` : ''}. Software applies these; nobody has to notice a problem for them to fire.` });
}

// Post-incident review (#54): the form while a restriction or rule incident is
// open, then the recorded reviews. The owner or a Risk approver records it
// (a Risk approver for High/Financial); authority stays where the rule left it.
function reviewCard(state, cap, d) {
  const need = reviewNeeded(state, cap.id);
  const done = (d.reviews || []).slice().reverse();
  const recorded = done.map((rv) => html`<div class="card review-record"><p class="eyebrow">${rv.id} · Post-incident review · ${fmtDate(rv.date)}</p>
    ${kv([['Reviewed by', html`${personAt(rv.byAt, rv.by).name}${rightsNote(rv.byAt)}`], ['Covers', [rv.restrictionRecordId ? html`<a href="#/decisions/${rv.restrictionRecordId}">${rv.restrictionRecordId}</a>` : null, ...rv.incidentIds].filter(Boolean).map((x, i) => html`${i ? ', ' : ''}${x}`)], ['What happened', rv.whatHappened], ['Cause', rv.cause], ['What changed', rv.changes], ['Authority', html`Stayed at ${authorityLabel(rv.authorityAt)}. Expanding again needs a proposal and a named authorization.`]])}
  </div>`);
  if (!need.any) return recorded.length ? html`${recorded}` : '';
  const by = actor(state, cap.id);
  const who = person(by);
  const e = reviewEligibility(state, cap.id, by);
  const covers = [need.restriction ? `the automatic restriction (${d.monitoring && d.monitoring.breachRecordId})` : null, need.incidents.length ? need.incidents.map((x) => x.incidentId).join(', ') : null].filter(Boolean).join(' and ');
  return html`<form class="card review-form" data-form="record-review" data-capability="${cap.id}">
    <p class="eyebrow">Record the post-incident review</p>
    <p>Covers ${covers}. Recording it clears the review lock and the alert. ${need.restriction ? html`${cap.name} stays at ${authorityLabel(cap.authority)}; expanding again needs a proposal and a named authorization.` : 'Authority is unchanged.'}</p>
    <label class="field field-stack"><span>What happened</span><textarea name="whatHappened" rows="2" required></textarea></label>
    <label class="field field-stack"><span>Cause</span><textarea name="cause" rows="2" required></textarea></label>
    <label class="field field-stack"><span>What changed as a result</span><textarea name="changes" rows="2" required></textarea></label>
    <p class="muted small">Recording as <strong>${who.name}</strong>, ${who.role}. The owner or a Risk approver records the review${isHighOrFinancial(state, cap.id) ? '; for this High-impact or Financial capability, a Risk approver' : ''}, but not whoever authorized the expansion that was restricted.</p>
    ${e.ok ? '' : html`<p class="form-error" role="status">${e.reason} Switch who is acting in the header.</p>`}
    <button class="btn btn-primary" type="submit" ${e.ok ? '' : raw('disabled')}>Record review</button>
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
    ? notice('watch', 'Restricted by a contract rule, reviewed', `${cap.name} stays at ${authorityLabel(cap.authority)} after the contract rule was crossed: ${m.reading}. The review is recorded below; expanding again needs a proposal and a named authorization.`, { link: `#/decisions/${m.breachRecordId}`, linkText: 'Restriction record' })
    : m && m.breached
    ? notice('fail', 'Authority automatically restricted', `${cap.name} returned to ${authorityLabel(cap.authority)}. The contract rule was crossed: ${m.reading}. A human review is required before authority can expand again.`, { link: `#/decisions/${m.breachRecordId}`, linkText: 'Restriction record' })
    : m && m.recordId
      ? notice('pass', `Expanded ${m.windowDays} days ago (simulated)`, `Authority change ${m.recordId} is in its monitoring period. The restriction rules below are enforced by software; nobody has to notice a problem for them to fire.`, { link: `#/decisions/${m.recordId}`, linkText: 'Decision record' })
      : !st.rules.length
        ? notice('neutral', 'Nothing to monitor', `${cap.name}'s contract has no automatic restriction lines.`)
        : st.running
          ? notice('pass', 'Monitoring is running', `${applying} of ${st.rules.length} restriction rule${st.rules.length === 1 ? '' : 's'} appl${applying === 1 ? 'ies' : 'y'} to ${cap.name} at ${authorityLabel(cap.authority)}. Software checks ${applying === 1 ? 'it' : 'them'} against the readings below.`)
          : notice('neutral', 'No restriction rule applies yet', `${cap.name} is at ${authorityLabel(cap.authority)}. Its rules apply once it is above the level they return it to.`);
  const metrics = m && m.autonomousActions != null ? html`<div class="metric-grid metric-grid-4">
      <div class="metric card"><div class="metric-top"><span class="metric-label">Autonomous actions</span></div><div class="metric-value">${m.autonomousActions}</div></div>
      <div class="metric card"><div class="metric-top"><span class="metric-label">Escalated to a human</span></div><div class="metric-value">${m.escalated}</div></div>
      <div class="metric card"><div class="metric-top"><span class="metric-label">Human reversals</span></div><div class="metric-value">${m.reversals}</div></div>
      <div class="metric card"><div class="metric-top"><span class="metric-label">Incidents</span>${m.incidents ? badge('fail') : badge('pass')}</div><div class="metric-value">${m.incidents}</div></div>
    </div>` : '';
  const incidents = d.ruleIncidents || [];
  const fired = m && m.breached
    ? html`<div class="card rule-card is-breached"><p class="eyebrow">What fired</p><p>${m.rule}</p><ul class="plain-list"><li class="muted small">What went wrong:</li>${m.errors.map((e) => html`<li>${e}</li>`)}</ul>
        <p class="muted small">What happened when the rule fired: the reading crossed the contract's limit, ${cap.name} moved to ${levelName(cap.authority.level)}, a system event and a restriction record were created, the Overview shows an alert, and the Activity history records why.</p></div>`
    : '';
  const opened = incidents.length
    ? html`<div class="card rule-card is-breached"><p class="eyebrow">Incidents opened by a contract rule</p>${incidents.map((x) => html`<p><strong>${x.incidentId}</strong>, ${fmtDate(x.date)}: ${x.errors.join(' ')} <span class="muted small">Authority unchanged.</span></p>`)}</div>`
    : '';
  const control = demo
    ? html`<div class="card rule-card"><p class="eyebrow">Demo control</p><p class="muted small">This simulates a reading that crosses the rule "${demo.text}", to show what software does on its own.</p>
        <button class="btn btn-danger" data-action="simulate-breach" data-capability="${cap.id}">${demo.kind === 'incident' ? 'Simulate a rule incident' : 'Simulate threshold breach'}</button></div>`
    : '';
  const base = `#/capabilities/${cap.id}?tab=monitoring`;
  const missed = expectedVsActual(state, cap.id).rows.filter((r) => r.status === 'not-met').length;
  const warnings = adoptionSignals(state, cap.id).length;
  const value = show === 'value';
  const views = subNav([{ href: base, label: 'Still safe?', active: !value }, { href: `${base}&show=value`, label: 'Delivering value?', active: value, count: missed + warnings }], 'Monitoring views');
  if (value) {
    const parts = html`${expectedCard(state, cap)}${roiCard(state, cap)}${adoptionCard(state, cap)}`;
    return html`${views}${String(parts).trim() ? parts : html`<p class="empty">Nothing to show yet: value appears once an expansion is authorized with expected outcomes.</p>`}`;
  }
  // C1: the rollout plan of the decision in force, if it has one.
  const g = grantingRecord(state, cap.id);
  const rollout = g && g.rolloutPlan ? html`<p class="small muted mon-rollout">Rollout: ${g.rolloutPlan.ownerAt ? g.rolloutPlan.ownerAt.name : g.rolloutPlan.owner} · from ${fmtDate(g.rolloutPlan.startDate)} · review ${fmtDate(g.rolloutPlan.reviewDate)} · <a href="#/decisions/${g.id}">Plan</a></p>` : '';
  return html`${views}${head}${rollout}${reviewCard(state, cap, d)}${metrics}${rulesCard(state, cap)}${fired}${opened}${control}`;
}

// Where a number came from, always shown (B2): seeded demo data, or the gate log with its sources.
const sourceTag = (source, seeded) => html`<span class="muted small">${source}</span>${seeded ? html` ${badge('neutral', 'Seeded')}` : ''}`;
const money = (v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// Adoption signals (C2): warnings, never blocking, each with what it saw,
// why it matters and where the data came from.
function adoptionCard(state, cap) {
  const signals = adoptionSignals(state, cap.id);
  const checked = 'Rubber-stamping, rising overrides, escalations left waiting and work-arounds outside the agent.';
  const body = signals.length
    ? signals.map((x) => html`<div class="notice notice-watch adoption-signal" role="status"><div class="notice-body"><strong>${x.title}</strong>${x.simulated ? html` ${badge('neutral', 'Simulated')}` : ''}
        <p>${x.what}</p><p class="muted small">Why it matters: ${x.why}</p><p class="muted small">Source: ${x.source}.</p></div></div>`)
    : notice('pass', 'No adoption warnings', `Checked: ${checked}`);
  return section('Adoption signals', body, { subtitle: `Warnings only: they never block an action or a decision. ${signals.length ? `Checked: ${checked}` : ''}` });
}

// Expected vs actual (B2): each expected outcome on the record in force.
function expectedCard(state, cap) {
  const { record, rows } = expectedVsActual(state, cap.id);
  if (!record) return '';
  if (!rows.length) return section('Expected vs actual', html`<p class="empty">${record.id} was authorized before expected outcomes were required, so there is nothing to compare yet. The next expansion will carry them.</p>`);
  const tone = { met: 'pass', 'not-met': 'fail', 'not-measured': 'neutral' };
  const word = { met: 'Met', 'not-met': 'Not met', 'not-measured': 'Not measured' };
  return section('Expected vs actual', html`<div class="card table-card"><table class="table">
    <thead><tr><th>Expected outcome</th><th>Target</th><th>Actual</th><th>Status</th><th>Source</th></tr></thead>
    <tbody>${rows.map((r) => html`<tr>
      <td><strong>${r.metric}</strong>${r.measuredAs ? html`<div class="muted small">Compared with: ${r.measuredAs}</div>` : ''}</td>
      <td>${r.target}</td>
      <td>${r.actualText || html`<span class="muted">—</span>`}</td>
      <td>${badge(tone[r.status], word[r.status])}${r.status === 'not-met' ? html`<div class="muted small">${r.gapText}</div>` : r.note ? html`<div class="muted small">${r.note}</div>` : ''}</td>
      <td>${r.source ? sourceTag(r.source, r.seeded) : html`<span class="muted small">—</span>`}</td>
    </tr>`)}</tbody>
  </table></div>`, { subtitle: html`From <a href="#/decisions/${record.id}">${record.id}</a>, the decision in force. Each outcome is matched to a measured metric by its wording; one that doesn't match is shown as not measured, never guessed.` });
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
      <div class="metric card"><div class="metric-top"><span class="metric-label">Cases handled by the AI</span></div><div class="metric-value">${r.automated.toLocaleString('en-US')}</div><div class="metric-note">a month, at ${r.inputs.automationRate.value}% automation</div></div>
      <div class="metric card"><div class="metric-top"><span class="metric-label">Human hours saved</span></div><div class="metric-value">${Math.round(r.hoursSaved)}</div><div class="metric-note">${money(r.laborSaved)} a month</div></div>
      <div class="metric card"><div class="metric-top"><span class="metric-label">AI cost</span></div><div class="metric-value">${money(r.aiCost)}</div><div class="metric-note">a month, at $${r.inputs.aiCostPerCase.value.toFixed(2)} a case</div></div>
      <div class="metric card"><div class="metric-top"><span class="metric-label">Net a month</span>${badge(r.net >= 0 ? 'pass' : 'fail', r.roiPct != null ? `ROI ${r.roiPct}%` : '')}</div><div class="metric-value">${money(r.net)}</div><div class="metric-note">hours saved × hourly cost − AI cost</div></div>
    </div>` : html`<p class="empty">The ROI appears once there is an automation rate to work from: after an expansion to automatic action, from the monitoring window or the gate log.</p>`;
  const inputs = r ? html`<li><strong>Automation rate:</strong> ${r.inputs.automationRate.value}% · ${sourceTag(r.inputs.automationRate.source, r.inputs.automationRate.seeded)}</li>
      <li><strong>AI cost per case:</strong> $${r.inputs.aiCostPerCase.value.toFixed(2)} · ${sourceTag(r.inputs.aiCostPerCase.source, r.inputs.aiCostPerCase.seeded)}</li>` : '';
  const form = html`<details class="card"><summary>Change the assumptions (creates version ${a.version + 1})</summary>
    <form class="roi-form" data-form="roi-assumptions" data-capability="${cap.id}">
      <div class="roi-fields">${ROI_FIELDS.map((f) => html`<label class="field field-stack"><span>${f.label} (${f.unit})</span><input type="number" name="${f.key}" step="any" min="${f.min}" max="${f.max}" value="${a.values[f.key]}" required></label>`)}</div>
      <label class="field field-stack"><span>Why they changed</span><textarea name="reason" rows="2" required></textarea></label>
      ${e.ok ? '' : html`<p class="form-error" role="status">${e.reason} Switch who is acting in the header.</p>`}
      <button class="btn btn-primary" type="submit" ${e.ok ? '' : raw('disabled')}>Save as version ${a.version + 1}</button>
      <p class="muted small">Earlier versions never change. The owner or a named stakeholder can change them.</p>
    </form></details>`;
  return section('Return on investment', html`${result}
    <div class="card">
      <p class="eyebrow">Assumptions, version ${a.version}${a.seeded ? html` ${badge('neutral', 'Seeded demo data')}` : ''}</p>
      <ul class="plain-list">${ROI_FIELDS.map((f) => html`<li><strong>${f.label}:</strong> ${f.unit === '$' ? `$${a.values[f.key]}` : `${a.values[f.key].toLocaleString('en-US')} ${f.unit}`}</li>`)}${inputs}</ul>
      <p class="muted small">Set by ${by.name}, ${by.role}, on ${fmtDate(a.date)}. Reason: ${a.reason}</p>
      ${versions.length > 1 ? html`<details><summary>Earlier versions (${versions.length - 1})</summary><ul class="plain-list">${versions.slice(0, -1).reverse().map((v) => html`<li><strong>v${v.version}</strong>, ${fmtDate(v.date)}, ${personAt(v.byAt, v.by).name}: ${ROI_FIELDS.map((f) => `${f.label.toLowerCase()} ${v.values[f.key]}`).join('; ')}. <span class="muted small">${v.reason}</span></li>`)}</ul></details>` : ''}
    </div>${form}`, { subtitle: 'A simple monthly estimate: the human time saved on cases the AI handles on its own, less what the AI costs on every case. It leaves out review time on escalations and set-up costs.' });
}
