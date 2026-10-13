// Decide: should the capability's overall authority change? The evidence that supports the decision lives here.

import { html, raw, section, badge, fmtDate, person, notice, empty, tabIntro } from '../ui.js';
import { capData, readiness, authorityLabel, testSummary, current, criteriaLocked, criteriaSaved, decisionRequired, proposedAuthority, levelName, reviewNeeded, actor, gateSummary, gateEvents, GATE_SOURCES, readinessText } from '../store/index.js';
import { scenarioTable } from './tests.js';
import { emptyState } from './setup.js';
import { proposalsList, amendLink } from './proposals.js';
import { evidenceSourcesCard } from './scenarios.js';
import { toolWords } from './cap-shared.js';
import { optionLabel } from './cap-history.js';

export function decisionTab(state, cap) {
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
  return html`${review.any ? notice('restricted', 'A review comes first', 'No decision can open until someone records a review of what happened.', { link: `#/capabilities/${cap.id}?tab=monitor`, linkText: 'Record the review' }) : ''}
    ${canPropose ? html`<div class="notice notice-neutral"><div class="notice-body"><strong>Ready for the first authority change</strong><p>The tests have run. You can now propose moving to Level ${cap.authority.level + 1}, ${levelName(cap.authority.level + 1)}. A person has to approve it, and the decision is recorded.</p></div><button class="btn btn-sm btn-primary" data-action="propose-authority" data-capability="${cap.id}" data-level="${cap.authority.level + 1}">Propose a move to Level ${cap.authority.level + 1}</button></div>` : ''}
    ${!review.any && !canPropose ? html`<p class="empty">No decision is open.</p>` : ''}
    ${last ? html`<p class="muted small">Last decision: <a href="#/records/${last.id}">${optionLabel(last.option)}, ${fmtDate(last.date)}</a>. Every decision is in <a href="#/capabilities/${cap.id}?tab=history">History</a>.</p>` : ''}`;
}

export function gateActivityCard(state, cap) {
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

const TARGET_WORDS = { pass: 'Met', watch: 'Not met yet', fail: 'Not met', insufficient: 'Not enough data yet' };

const SEGMENT_WORDS = { pass: 'Looks good', watch: 'Watch', fail: 'Problem', insufficient: 'Not enough data yet' };

export function criteriaTab(state, cap) {
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
    <p class="muted">${defining ? html`These targets were set before the pilot started (in <a href="#/records/${defining.id}">${defining.id}</a>), so the bar didn't move after the results came in. ` : ''}The decision is judged against them; they aren't a score.</p>
    ${rows.length ? html`<div class="card table-card"><table class="table table-criteria">
      <thead><tr><th>Measure</th><th>Target</th><th>Now</th><th>Status</th><th>Note</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>` : empty('No targets set.')}
`;
}

export function requirementsTab(state, cap) {
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

export function testingTab(state, cap) {
  const t = testSummary(state, cap.id);
  if (!t.total) return emptyState(state, cap.id, 'No tests yet.', 'scenarios');
  return html`
    <p class="muted">${t.total} tests. ${t.status === 'complete'
      ? html`Today's run: ${t.passed} of ${t.total} passed, ${t.highSeverity} serious failure${t.highSeverity === 1 ? '' : 's'}.`
      : t.lastRun ? html`Last run ${fmtDate(t.lastRun)}: ${t.recorded.passed} of ${t.total} passed, ${t.recorded.highSeverity} serious failure${t.recorded.highSeverity === 1 ? '' : 's'}.` : 'Not run yet.'} <a href="#/capabilities/${cap.id}?tab=decide&show=tests">Run the tests or see all results</a>.</p>
    ${scenarioTable(state, cap.id, { filter: 'failed', compact: true })}`;
}

export function evidenceTab(state, cap, d) {
  const p = d.pilot;
  if (!p) return html`${emptyState(state, cap.id, d.evidence.length ? 'No pilot results yet.' : 'No evidence yet.', 'tests')}${d.evidence.length ? html`<p class="muted small">Other evidence is under <a href="#/capabilities/${cap.id}?tab=decide&show=all">All evidence</a>.</p>` : ''}${evidenceSourcesCard()}`;
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
