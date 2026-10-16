// Screens for the lightweight evidence path (#142): recording what a real AI
// did on each test case, judging Requirements with no metric, and the log of
// incidents, feedback and Impact. Every record is kept as entered.

import * as seed from '../data/seed.js';
import { html, raw, badge, notice, lede, fmtDate, SWITCH_PERSON } from '../ui.js';
import {
  getCapability, capData, current, actor, people, manualEntryEligibility, resultsLockWarning, judgeRole,
  OUTCOME_RESULTS, OUTCOME_SEVERITIES, outcomesNow, outcomeMeasurements, VERDICTS, judgmentsFor, requirementsNow, RESULT_WORDS,
  INCIDENT_SEVERITIES, INCIDENT_STATUSES, incidentsFor, incidentStatus, FEEDBACK_SENTIMENTS, feedbackFor, IMPACT_BASES, impactActuals,
} from '../store/index.js';

const name = (state, k) => (people(state)[k] || { name: k }).name;
const RESULT_TONE = { pass: 'pass', fail: 'fail', unable: 'insufficient' };
export const RESULT_STATUS_TONE = { met: 'pass', 'not-met': 'fail', unknown: 'insufficient', conflicting: 'watch', 'not-enough': 'insufficient', 'no-evidence': 'neutral', 'needs-decision': 'decision' };

const head = (cap, title, first, more) => html`<div class="page-head"><div>
  <p class="eyebrow"><a href="#/capabilities/${cap.id}">${cap.name}</a> · <a href="#/capabilities/${cap.id}/evidence/configure">Evidence</a></p>
  <h1>${title}</h1>${lede(first, more)}</div></div>`;

// ---------------------------------------------------------------------------
// Test cases in a real workspace: record each outcome
// ---------------------------------------------------------------------------

export function realTestsView(state, capabilityId, query, { embedded = false } = {}) {
  const cap = getCapability(state, capabilityId);
  const by = actor(state, capabilityId);
  const ok = manualEntryEligibility(state, capabilityId, by);
  const rows = outcomesNow(state, capabilityId);
  const [rate, serious] = outcomeMeasurements(state, capabilityId);
  const open = query.get('case');
  const warn = resultsLockWarning(state, capabilityId);
  const groupName = (id) => (seed.SCENARIO_GROUPS.find((g) => g.id === id) || { name: id }).name;
  const summary = rate
    ? html`<strong>${rate.passed} of ${rate.total} passed</strong> on their latest recorded outcome${serious.value ? `, ${serious.value} serious failure${serious.value === 1 ? '' : 's'}` : ''}. ${rows.filter((x) => x.outcome && x.outcome.result === 'unable').length ? `${rows.filter((x) => x.outcome && x.outcome.result === 'unable').length} unable to judge (left out). ` : ''}${rows.filter((x) => !x.outcome).length} not recorded yet.`
    : html`No outcomes recorded yet.`;
  const form = (sc) => html`<form class="form-stack outcome-form" data-form="record-outcome" data-capability="${cap.id}" data-scenario="${sc.id}">
      <fieldset class="choice-row"><legend>Outcome</legend>${Object.entries(OUTCOME_RESULTS).map(([k, v]) => html`<label><input type="radio" name="result" value="${k}" ${k === 'pass' ? raw('checked') : ''}> ${v}</label>`)}</fieldset>
      <label>If it failed, how serious <select name="severity"><option value="">Not a failure</option>${OUTCOME_SEVERITIES.map((v) => html`<option value="${v}">${v[0].toUpperCase()}${v.slice(1)}</option>`)}</select></label>
      <label>What actually happened <textarea name="happened" rows="2" maxlength="600" required placeholder="What your AI produced or did, in a sentence or two."></textarea></label>
      <label>Link (optional) <input type="url" name="reference" maxlength="300" placeholder="https://"></label>
      <div class="form-actions"><button class="btn btn-primary btn-sm" type="submit" ${ok.ok ? '' : raw('disabled')}>Record outcome</button></div>
    </form>`;
  const item = (x) => {
    const sc = x.scenario;
    const o = x.outcome;
    return html`<details class="scenario ${o ? `is-${o.result === 'pass' ? 'pass' : o.result === 'fail' ? 'fail' : 'pending'}` : 'is-pending'}" ${open === sc.id ? raw('open') : ''} id="case-${sc.id}">
      <summary><span class="scenario-id">${sc.id}</span><span class="scenario-name"><strong>${sc.name}</strong><span class="muted small"> · ${groupName(sc.group)}</span></span>
        <span class="scenario-status">${o ? html`${badge(RESULT_TONE[o.result], OUTCOME_RESULTS[o.result])}${o.severity ? html` <span class="badge badge-${o.severity === 'high' ? 'fail' : 'watch'}">${o.severity}</span>` : ''}` : html`<span class="badge badge-neutral">Not recorded</span>`}</span></summary>
      <div class="scenario-body">
        <dl class="kv kv-stack">
          <div><dt>Situation</dt><dd>${sc.situation}</dd></div>
          <div><dt>What it should do</dt><dd>${sc.expected}</dd></div>
          ${o ? html`<div><dt>What actually happened</dt><dd>${o.happened} <span class="muted small">Recorded by ${o.byAt.name}, ${fmtDate(o.date)}${o.reference ? html` · <a href="${o.reference}" rel="noopener">reference</a>` : ''}</span></dd></div>` : ''}
        </dl>
        ${form(sc)}
      </div>
    </details>`;
  };
  return html`${embedded ? '' : head(cap, `Test cases for ${cap.name}`, 'Run each case through your real AI, then record what happened.', 'Authority Lab doesn\'t run your AI or call any model. A case run again gets a new outcome; earlier outcomes stay on record. "Unable to judge" is neither a pass nor a fail.')}
  ${query.get('error') ? notice('fail', 'Couldn\'t record that', query.get('error')) : ''}
  ${warn && rows.length ? notice('watch', 'Before you record outcomes', warn) : ''}
  ${ok.ok ? '' : notice('watch', 'You can\'t record outcomes for this capability', `${ok.reason} ${SWITCH_PERSON}`)}
  <p>${summary} <a href="#/capabilities/${cap.id}/scenarios/edit">Edit test cases</a></p>
  ${rows.length ? html`<div class="scenario-list">${rows.map(item)}</div>` : html`<p class="empty">No test cases yet. <a href="#/capabilities/${cap.id}/scenarios/edit">Add some</a>.</p>`}`;
}

// ---------------------------------------------------------------------------
// Judge a Requirement with no metric
// ---------------------------------------------------------------------------

export function judgeView(state, capabilityId, query) {
  const cap = getCapability(state, capabilityId);
  const id = query.get('row');
  const row = requirementsNow(state, capabilityId).find((r) => r.id === id);
  if (!row) return html`${head(cap, 'Record a judgment', 'That Requirement no longer exists.')}`;
  const by = actor(state, capabilityId);
  const role = judgeRole(state, capabilityId, by);
  const { all } = judgmentsFor(state, capabilityId, id);
  return html`${head(cap, 'Record a judgment', row.text, 'For a Requirement with no metric, a person judges whether it is met. The Owner\'s and Reviewers\' judgments count; a Stakeholder\'s is recorded as input and never decides it. A judgment is evidence, not the authority decision, and it can\'t be edited later: a new judgment replaces your own earlier one.')}
  ${query.get('error') ? notice('fail', 'Couldn\'t record the judgment', query.get('error')) : ''}
  ${row.result ? notice(RESULT_STATUS_TONE[row.result.status] === 'pass' ? 'pass' : RESULT_STATUS_TONE[row.result.status] === 'fail' ? 'fail' : 'neutral', `Now: ${row.result.label}`, row.result.why || '') : ''}
  ${resultsLockWarning(state, capabilityId) ? notice('watch', 'Before you record a judgment', resultsLockWarning(state, capabilityId)) : ''}
  ${!role ? notice('watch', 'You can\'t judge this', `${name(state, by)} isn't the owner or named on ${cap.name}. ${SWITCH_PERSON}`) : role === 'stakeholder' ? notice('neutral', 'Recorded as input', `${name(state, by)} is a Stakeholder: this is recorded as input and doesn't decide the Requirement.`) : ''}
  <form class="card form-stack" data-form="record-judgment" data-capability="${cap.id}" data-row="${id}">
    <fieldset class="choice-row"><legend>Judgment</legend>${Object.entries(VERDICTS).map(([k, v]) => html`<label><input type="radio" name="verdict" value="${k}" ${k === 'met' ? raw('checked') : ''}> ${v}</label>`)}</fieldset>
    <label>Why <textarea name="rationale" rows="2" maxlength="400" required placeholder="What you checked, and what you found."></textarea></label>
    <label>Supporting reference (optional) <input type="text" name="reference" maxlength="300" placeholder="A link or document name"></label>
    <p class="muted small">Recording as <strong>${name(state, by)}</strong>${role ? ` (${role})` : ''}.</p>
    <div class="form-actions"><button class="btn btn-primary" type="submit" ${role ? '' : raw('disabled')}>Record judgment</button> <a class="btn btn-ghost" href="#/capabilities/${cap.id}/evidence/configure">Cancel</a></div>
  </form>
  ${all.length ? html`<section class="section"><h2>On record</h2><ul class="plain-list">${all.slice().reverse().map((j) => html`<li>${badge(j.verdict === 'met' ? 'pass' : j.verdict === 'not-met' ? 'fail' : 'insufficient', VERDICTS[j.verdict])} <strong>${j.byAt.name}</strong> (${j.role}${j.counts ? '' : ', input only'}), ${fmtDate(j.date)}: ${j.rationale}${j.reference ? html` <span class="muted small">· ${j.reference}</span>` : ''}</li>`)}</ul></section>` : ''}`;
}

// ---------------------------------------------------------------------------
// Incidents, feedback and Impact
// ---------------------------------------------------------------------------

export function logView(state, capabilityId, query) {
  const cap = getCapability(state, capabilityId);
  const by = actor(state, capabilityId);
  const ok = manualEntryEligibility(state, capabilityId, by);
  const role = judgeRole(state, capabilityId, by);
  const incidents = incidentsFor(state, capabilityId).slice().reverse();
  const feedback = feedbackFor(state, capabilityId).slice().reverse();
  const impact = impactActuals(state, capabilityId).slice().reverse();
  const disabled = ok.ok ? '' : raw('disabled');
  return html`${head(cap, 'Incidents, feedback and Impact', 'Things people record as they happen.', 'Incidents are evidence: an open critical incident blocks "No unresolved critical incidents". Feedback is context and judges nothing unless a Requirement is mapped to it. Impact is informational and never changes readiness. Nothing here is edited or removed later.')}
  ${query.get('error') ? notice('fail', 'Couldn\'t record that', query.get('error')) : ''}
  ${ok.ok ? '' : notice('watch', 'You can\'t record here', `${ok.reason} ${SWITCH_PERSON}`)}

  <section class="section" id="incidents"><h2>Incidents</h2>
    ${incidents.length ? html`<ul class="plain-list">${incidents.map((x) => html`<li class="card">
      <p>${badge(x.severity === 'critical' || x.severity === 'high' ? 'fail' : 'watch', INCIDENT_SEVERITIES[x.severity])} ${badge(incidentStatus(x) === 'resolved' ? 'pass' : 'decision', INCIDENT_STATUSES[incidentStatus(x)])} <strong>${x.id}</strong> · ${fmtDate(x.date)} · recorded by ${x.byAt.name}</p>
      <p>${x.what}${x.reference ? html` <span class="muted small">· ${x.reference}</span>` : ''}</p>
      <ul class="plain-list muted small">${x.statusLog.map((l) => html`<li>${fmtDate(l.date)}: ${INCIDENT_STATUSES[l.status]}, ${l.byAt.name}. ${l.note}</li>`)}</ul>
      ${role === 'owner' || role === 'reviewer' ? html`<form class="line-add" data-form="incident-status" data-capability="${cap.id}" data-incident="${x.id}"><select name="status" aria-label="New status">${Object.entries(INCIDENT_STATUSES).filter(([k]) => k !== incidentStatus(x)).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select><input type="text" name="note" maxlength="300" placeholder="Why the status changed" aria-label="Why"><button class="btn btn-sm" type="submit">Change status</button></form>` : ''}
    </li>`)}</ul>` : html`<p class="muted">No incidents recorded.</p>`}
    <form class="card form-stack" data-form="record-incident" data-capability="${cap.id}">
      <label>What happened <textarea name="what" rows="2" maxlength="600" required></textarea></label>
      <div class="field-row">
        <label>Severity <select name="severity">${Object.entries(INCIDENT_SEVERITIES).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label>
        <label>Status <select name="status">${Object.entries(INCIDENT_STATUSES).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label>
        <label>Date <input type="date" name="date" value="${state.today}"></label>
      </div>
      <label>Reference (optional) <input type="text" name="reference" maxlength="300"></label>
      <div class="form-actions"><button class="btn btn-primary" type="submit" ${disabled}>Record incident</button></div>
    </form>
  </section>

  <section class="section" id="feedback"><h2>Feedback</h2>
    ${feedback.length ? html`<ul class="plain-list">${feedback.map((f) => html`<li>${f.sentiment ? badge(f.sentiment === 'positive' ? 'pass' : f.sentiment === 'negative' ? 'fail' : 'neutral', FEEDBACK_SENTIMENTS[f.sentiment]) : ''} <strong>${f.from}</strong>, ${fmtDate(f.date)}${f.category ? ` · ${f.category}` : ''}: ${f.note} <span class="muted small">recorded by ${f.byAt.name}</span></li>`)}</ul>` : html`<p class="muted">No feedback recorded.</p>`}
    <form class="card form-stack" data-form="record-feedback" data-capability="${cap.id}">
      <div class="field-row">
        <label>From <input type="text" name="from" maxlength="80" required placeholder="A client, a reviewer, a channel"></label>
        <label>Sentiment (optional) <select name="sentiment"><option value="">None</option>${Object.entries(FEEDBACK_SENTIMENTS).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label>
        <label>Date <input type="date" name="date" value="${state.today}"></label>
      </div>
      <label>Feedback <textarea name="note" rows="2" maxlength="600" required></textarea></label>
      <div class="field-row"><label>Category (optional) <input type="text" name="category" maxlength="60"></label><label>Reference (optional) <input type="text" name="reference" maxlength="300"></label></div>
      <div class="form-actions"><button class="btn btn-primary" type="submit" ${disabled}>Record feedback</button></div>
    </form>
  </section>

  <section class="section" id="impact"><h2>Impact</h2>
    ${impact.length ? html`<ul class="plain-list">${impact.map((x) => html`<li><strong>${x.metric}</strong>: ${x.value !== undefined ? `${x.value}${x.unit ? ` ${x.unit}` : ''}` : x.result} ${badge('neutral', IMPACT_BASES[x.basis])} <span class="muted small">${x.period} · recorded by ${x.byAt.name}${x.note ? ` · ${x.note}` : ''}</span></li>`)}</ul>` : html`<p class="muted">No Impact recorded.</p>`}
    <form class="card form-stack" data-form="record-impact" data-capability="${cap.id}">
      <div class="field-row">
        <label>What <input type="text" name="metric" maxlength="80" required placeholder="Time saved"></label>
        <label>Number (optional) <input type="number" name="value" step="any"></label>
        <label>Unit (optional) <input type="text" name="unit" maxlength="12" placeholder="hours"></label>
      </div>
      <label>Or describe the result <input type="text" name="result" maxlength="300"></label>
      <div class="field-row">
        <label>Measured or estimated <select name="basis">${Object.entries(IMPACT_BASES).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label>
        <label>Period <input type="text" name="period" maxlength="60" required placeholder="October, week 2"></label>
      </div>
      <label>Note (optional) <input type="text" name="note" maxlength="300"></label>
      <div class="form-actions"><button class="btn btn-primary" type="submit" ${disabled}>Record Impact</button></div>
    </form>
  </section>
  <p><a class="btn" href="#/capabilities/${cap.id}/evidence/configure">Back to evidence</a></p>`;
}
