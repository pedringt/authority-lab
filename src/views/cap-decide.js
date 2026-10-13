// Decide: should we change what this capability is allowed to do? One
// reading direction (redesign, 2026-10-12): what's being decided, what we
// know, the recommendation, the person's decision, and one button to record
// it. The full evidence views (tests, model runs, all evidence, targets,
// requirements, pilot results) stay one link away, through `show=`.

import { html, raw, section, badge, fmtDate, person, notice, empty, tabIntro } from '../ui.js';
import { capData, readiness, authorityLabel, testSummary, current, currentVersion, criteriaLocked, criteriaSaved, proposedAuthority, gateSummary, gateEvents, GATE_SOURCES, versionsInForce , targetsNow, requirementsNow, importedStanding, importedVerdicts, evidenceStreams} from '../store/index.js';
import { AGENT_RUNS_CAPABILITY } from '../data/seed.js';
import { testsView } from './tests.js';
import { emptyState } from './setup.js';
import { proposalsList, amendLink } from './proposals.js';
import { evidenceSourcesCard } from './scenarios.js';
import { evidenceView } from './evidence.js';
import { agentRunsView, runsSummary } from './agentruns.js';
import { toolWords } from './cap-shared.js';
import { decisionWorkspaceView, barChangedNote, amendedNote } from './decisions.js';

// The full evidence views under Decide, each with a way back.
const SUB_VIEWS = ['results', 'all', 'requirements', 'targets', 'tests', 'runs'];

export function decideTab(state, cap, query, show, { runs = null } = {}) {
  const base = `#/capabilities/${cap.id}?tab=decide`;
  if (!SUB_VIEWS.includes(show)) return decisionWorkspaceView(state, cap.id, query, { runs });
  const d = capData(state, cap.id);
  const inner = {
    results: () => html`${evidenceTab(state, cap, d)}${gateActivityCard(state, cap)}`,
    all: () => evidenceView(state, cap.id, query, { embedded: true }),
    requirements: () => requirementsTab(state, cap),
    targets: () => criteriaTab(state, cap),
    tests: () => testsView(state, cap.id, query, { embedded: true }),
    runs: () => agentRunsView(state, query, runs, { capabilityId: cap.id, embedded: true }),
  }[show]();
  return html`<p class="decide-back"><a href="${base}">← Back to the decision</a></p>${inner}`;
}

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

// "Almost ready: 5 of 6 checks met", from the decision requirements.
export function readyHeadline(r) {
  if (!r.total) return 'Not ready yet: no checks set';
  if (r.met === r.total) return `Ready: all ${plural(r.total, 'check')} met`;
  if (r.total - r.met === 1) return `Almost ready: ${r.met} of ${r.total} checks met`;
  return `Not ready yet: ${r.met} of ${r.total} checks met`;
}

// Were the bar's current versions set before the pilot started?
function setBeforePilot(state, cap, d) {
  if (!d.pilot || !d.pilot.started) return null;
  const dates = ['criteria', 'requirements'].map((k) => (currentVersion(state, cap.id, k) || {}).date).filter(Boolean);
  if (!dates.length) return null;
  return dates.every((x) => x < d.pilot.started);
}

// One evidence line: a disclosure that opens in place.
const line = (title, meta, inner) => html`<details class="decide-line"><summary><strong>${title}</strong><span class="decide-line-meta">${meta}</span><span class="decide-line-open" aria-hidden="true">View</span></summary><div class="decide-line-inner">${inner}</div></details>`;

// What do we know? One headline, the top open gap, a serious problem if
// there is one, then one line per kind of evidence, each opening in place
// and linking to its full view. Shared by the open decision and the
// no-decision state.
export function whatWeKnow(state, cap, { runs = null } = {}) {
  const d = capData(state, cap.id);
  const base = `#/capabilities/${cap.id}?tab=decide`;
  const r = readiness(state, cap.id);
  const t = testSummary(state, cap.id);
  const p = d.pilot;
  const gap = r.unmet[0];
  const serious = t.lastRun || t.status === 'complete' ? d.scenarios.filter((x) => !x.pass && x.severity === 'High') : [];
  const reqs = requirementsNow(state, cap.id);
  const criteria = targetsNow(state, cap.id);
  const before = setBeforePilot(state, cap, d);
  const targetsOpen = criteria.filter((c) => c.status !== 'pass').length;

  const checks = html`<p class="decide-line-lead">What needs to be true first.</p>
    ${reqs.length ? requirementsList(state, cap.id) : html`<p class="muted">No decision requirements set yet.${criteriaSaved(state, cap.id) ? '' : html` <a href="#/capabilities/${cap.id}/criteria/edit">Set them</a>`}</p>`}
    ${criteria.length ? html`<table class="table decide-targets"><thead><tr><th>Target</th><th>Goal</th><th>Now</th><th>Status</th></tr></thead>
      <tbody>${criteria.map((c) => html`<tr><td>${c.name}</td><td>${c.target}</td><td>${c.current}</td><td>${c.status === 'pending' ? html`<span class="muted">Not measured yet</span>` : c.judged && ['fail', 'insufficient', 'too-early'].includes(c.status) ? html`<span class="decide-weak">${TARGET_WORDS[c.status]}</span>` : TARGET_WORDS[c.status] || c.status}</td></tr>`)}</tbody></table>` : ''}
    ${before === true ? html`<p class="muted small">Set before the pilot started, so the bar didn't move after the results came in.</p>` : before === false ? html`<p class="muted small">Changed after the pilot started. Every change is in <a href="#/capabilities/${cap.id}/versions?kind=criteria">history</a>.</p>` : ''}
    <p class="small"><a href="${base}&show=requirements">Decision requirements</a> · <a href="${base}&show=targets">Targets</a></p>`;

  const testsMeta = !t.total ? 'none yet'
    : t.status === 'complete' ? `${t.passed} of ${t.total} passed today`
      : t.lastRun ? `${t.recorded.passed} of ${t.total} passed` : 'not run yet';
  const firstSentence = (text) => (String(text || '').match(/^.*?\.(\s|$)/) || [String(text || '')])[0].trim();
  const tests = html`${serious.length ? html`<ul class="plain-list">${serious.map((x) => html`<li><strong>${x.name}</strong> <span class="muted small">(${x.id}, serious)</span>: ${firstSentence(x.explanation)}</li>`)}</ul>` : t.total && (t.lastRun || t.status === 'complete') ? html`<p>No serious failures.</p>` : ''}
    <p class="small"><a href="${base}&show=tests">${t.total ? 'See every test and run the suite →' : 'Add tests →'}</a></p>`;

  const pilot = p ? html`<p>${p.segments.map((x, i) => html`${i ? ' · ' : ''}<span class="${x.status === 'insufficient' || x.status === 'fail' ? 'decide-weak' : ''}">${x.name}: ${x.accuracy}% (${plural(x.cases, 'case')})</span>`)}</p>
    <p class="small"><a href="${base}&show=results">Full pilot results and every logged action →</a></p>`
    : html`<p class="muted">No pilot yet.</p><p class="small"><a href="${base}&show=results">Logged actions →</a></p>`;

  const rs = runsSummary(runs, cap.id);
  const hasRuns = rs || cap.id === AGENT_RUNS_CAPABILITY;
  const modelRuns = html`<p>Real models handled fictional trap tickets, and every action they tried was checked against the rules. This site never calls a model: every run was recorded and approved.</p>
    <p class="small"><a href="${base}&show=runs">See the model runs →</a></p>`;

  const stakeholders = current(state, cap.id, 'stakeholders');
  const stances = new Set(stakeholders.map((x) => x.stance));
  const positions = html`<ul class="plain-list">${stakeholders.map((x) => html`<li><strong>${x.team}:</strong> ${x.position} <span class="muted small">(${person(x.person).name})</span></li>`)}</ul>
    ${d.stakeholderSummary ? html`<p><strong>Agree:</strong> ${d.stakeholderSummary.consensus}</p><p><strong>Still disagree:</strong> ${d.stakeholderSummary.disagreement}</p>` : ''}`;

  return html`<div class="decide-know">
      <p class="decide-big">${readyHeadline(r)}</p>
      ${gap ? html`<p>Still open: ${gap.text.charAt(0).toLowerCase()}${gap.text.slice(1)} (now ${gap.current}).</p>` : ''}
      ${serious.length ? html`<p class="decide-serious">Serious test failure${serious.length === 1 ? '' : 's'}: ${serious.map((x, i) => html`${i ? '; ' : ''}${x.name}`)}.</p>` : ''}
    </div>
    ${barChangedNote(state, cap)}
    ${amendedNote(state, { capabilityId: cap.id, versions: versionsInForce(state, cap.id) })}
    <div class="decide-lines">
      ${line('Checks', `${r.total ? `${r.met} of ${r.total} met` : 'none set'}${targetsOpen ? ` · ${plural(targetsOpen, 'target')} not met yet` : ''}`, checks)}
      ${line('Tests', testsMeta, tests)}
      ${importedLine(state, cap, base, line)}
      ${line('Pilot results', p ? `${p.cases} cases, ${p.accuracy}% accurate` : 'none yet', pilot)}
      ${hasRuns ? line('Model runs', rs ? `${plural(rs.runs, 'run')}, ${rs.gotThrough ? `${rs.gotThrough} got through` : 'nothing got through'}` : 'recorded, checked against the rules', modelRuns) : ''}
      ${line('Stakeholder positions', !stakeholders.length ? 'none recorded' : stances.size > 1 ? 'not unanimous' : 'all agree', stakeholders.length ? positions : html`<p class="muted">No positions recorded yet.</p>`)}
    </div>
    <p class="small decide-all"><a href="${base}&show=all">All evidence →</a></p>`;
}

// Imported results (#120), one stream at a time: each current result with its
// segments beneath it, so a weak segment is never averaged away. A result
// judged not met, or not enough data, is marked.
function importedLine(state, cap, base, line) {
  const streams = evidenceStreams(state, cap.id);
  if (!streams.length) return '';
  const standing = importedStanding(state, cap.id);
  const verdicts = importedVerdicts(state, cap.id);
  const items = capData(state, cap.id).evidence.filter((e) => e.external && (standing.get(e.id) || {}).standing === 'current');
  const weak = (e) => ['fail', 'insufficient'].includes(verdicts.get(e.id));
  const body = html`${streams.map((st) => {
    const mine = items.filter((e) => e.external.importId && st.currentRuns.some((x) => x.id === e.external.importId) && e.external.kind === st.kind);
    const overall = mine.filter((e) => e.segment === 'All');
    const segs = (metric) => mine.filter((e) => e.segment !== 'All' && e.measure.metric === metric);
    const orphanSegs = mine.filter((e) => e.segment !== 'All' && !overall.some((o) => o.measure.metric === e.measure.metric));
    const row = (e) => html`<span class="${weak(e) ? 'decide-weak' : ''}">${e.segment === 'All' ? e.metric : e.segment}: ${e.value}${weak(e) ? ` (${verdicts.get(e.id) === 'fail' ? 'not met' : 'not enough data'})` : ''}</span>`;
    return html`<p><strong>${st.system} ${st.capability}</strong> <span class="muted small">(${st.kind}, latest ${fmtDate(st.latest.envelope.observedAt.slice(0, 10))})</span></p>
      <ul class="plain-list">${overall.map((e) => html`<li>${row(e)}${segs(e.measure.metric).length ? html`<ul class="plain-list imported-segs">${segs(e.measure.metric).map((x) => html`<li>${row(x)}</li>`)}</ul>` : ''}</li>`)}${orphanSegs.map((e) => html`<li>${row(e)}</li>`)}</ul>`;
  })}
    <p class="small"><a href="${base}&show=all">Every imported result, where it came from and its versions →</a></p>`;
  const weakCount = items.filter(weak).length;
  const runs = streams.reduce((n, st) => n + st.currentRuns.length, 0);
  return line('Imported results', `${runs} run${runs === 1 ? '' : 's'} from ${[...new Set(streams.map((s) => s.system))].join(', ')}${weakCount ? ` · ${weakCount} weak` : ''}`, body);
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

const TARGET_WORDS = { pass: 'Met', watch: 'Not met yet', fail: 'Not met', insufficient: 'Not enough data yet', 'too-early': 'Too early to judge' };

const SEGMENT_WORDS = { pass: 'Looks good', watch: 'Watch', fail: 'Problem', insufficient: 'Not enough data yet' };

export function criteriaTab(state, cap) {
  const criteria = targetsNow(state, cap.id);
  if (!criteriaSaved(state, cap.id)) return emptyState(state, cap.id, 'No targets yet.', 'criteria');
  const locked = criteriaLocked(state, cap.id);
  const rows = criteria.map((c) => html`<tr>
    <td><strong>${c.name}</strong></td>
    <td>${c.target}</td>
    <td>${c.current}</td>
    <td>${c.status === 'pending' ? badge('neutral', c.judged ? 'No results yet' : 'Not measured yet') : badge(c.status === 'too-early' ? 'insufficient' : c.status, TARGET_WORDS[c.status])}</td>
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
  const reqs = requirementsNow(state, capabilityId);
  if (!reqs.length) return empty('No decision requirements set.');
  return html`<div class="card">
    <ul class="req-list">${reqs.map((q) => html`<li class="${q.met ? 'is-met' : 'is-unmet'}">
      <span class="req-mark" aria-hidden="true">${q.met ? '✓' : '⚠'}</span>
      <span class="req-text"><strong>${q.text}</strong><span class="muted"> · ${q.met ? 'Met' : q.judged && ['too-early', 'insufficient', 'pending'].includes(q.judged.status) ? TARGET_WORDS[q.judged.status] || 'No results yet' : 'Not met'}: ${q.current}</span>${q.gap ? html`<p class="req-gap">${q.gap}</p>` : ''}</span>
    </li>`)}</ul>
    <p class="muted small"><strong>${r.met} of ${r.total}</strong> checks met.</p>
  </div>`;
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
