// Monitor: was the decision good, and is it still safe? Two views, each
// leading with one verdict (redesign, 2026-10-12): Still safe? (Within limits,
// Autonomy reduced, Needs review, or Nothing to monitor yet) and Delivering
// value? (rollout goals against what actually happened). What explains the
// verdict follows; the mechanisms open on demand, one line each.

import { html, raw, badge, kv, fmtDate, person, personAt, rightsNote, subNav, SWITCH_PERSON } from '../ui.js';
import { authorityLabel, monitoringStatus, breachRule, levelName, reviewNeeded, reviewEligibility, restrictedExpansion, actor, isHighOrFinancial, activePeople, expectedVsActual, roi, roiVersions, currentRoiAssumptions, roiEditEligibility, ROI_FIELDS, grantingRecord, adoptionSignals, gateSummary, GATE_SOURCES } from '../store/index.js';

const PILOT = 'Demo data (pilot)';
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const money = (v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// One verdict: a left-border block, not a card. tone: pass, bad, watch, neutral.
const verdict = (tone, title, body) => html`<div class="mon-verdict is-${tone}" role="status"><span class="mon-verdict-title">${title}</span>${body ? html`<p>${body}</p>` : ''}</div>`;

// A one-line disclosure: the name, a short reading, and the detail on demand.
export const line = (title, meta, inner, { open = false } = {}) => html`<details class="mh-line" ${open ? raw('open') : ''}><summary><strong>${title}</strong><span class="mh-line-meta">${meta}</span><span class="mh-line-open">View</span></summary><div class="mh-line-inner">${inner}</div></details>`;
const lines = (...items) => {
  const shown = items.filter((x) => x && String(x).trim());
  return shown.length ? html`<div class="mh-lines">${shown}</div>` : '';
};

// ---------------------------------------------------------------------------
// Still safe?
// ---------------------------------------------------------------------------

function safetyVerdict(state, cap, d, st) {
  const m = d.monitoring;
  const need = reviewNeeded(state, cap.id);
  const crossed = st.rules.filter((r) => r.crossed);
  if (m && m.breached && (need.restriction || !m.reviewId)) {
    const rec = state.decisionRecords.find((r) => r.id === m.breachRecordId);
    const now = rec && rec.scope ? ` ${rec.scope.replace(/^[^.]+\.\s*/, '')}` : '';
    return verdict('bad', 'Autonomy reduced', `${cap.name} was moved back to ${levelName(cap.authority.level)} after crossing a safety limit on ${fmtDate(m.breachedAt)}. The limit: "${m.rule}" It reached ${m.reading}.${now}`);
  }
  if (need.incidents.length) {
    const x = need.incidents[need.incidents.length - 1];
    return verdict('bad', 'Needs review', `A safety limit was crossed on ${fmtDate(x.date)}: "${x.rule}" This limit opens an incident instead of reducing autonomy, so ${cap.name} stays at ${levelName(cap.authority.level)}. Someone needs to review what happened.`);
  }
  if (m && m.breached) {
    const rv = (d.reviews || []).find((r) => r.id === m.reviewId);
    return verdict('watch', 'Autonomy reduced', `${cap.name} was moved back to ${levelName(cap.authority.level)} after crossing a safety limit on ${fmtDate(m.breachedAt)}.${rv ? ` ${personAt(rv.byAt, rv.by).name} reviewed it on ${fmtDate(rv.date)}.` : ''} It stays at ${levelName(cap.authority.level)} until a change to its autonomy is approved in Decide.`);
  }
  if (crossed.length) return verdict('bad', 'Over a safety limit', `${crossed.map((r) => `"${r.text}"`).join(' ')} The latest reading is over the limit.`);
  if (!st.rules.length) return verdict('neutral', 'Nothing to monitor yet', html`${cap.name}'s rules don't say when to reduce its autonomy, so nothing is checked automatically. Add a line under "Automation is pulled back if" in <a href="#/capabilities/${cap.id}?tab=status&show=rules">the rules</a>.`);
  if (!st.running) {
    const lowest = Math.min(...st.rules.map((r) => r.fallback));
    return verdict('neutral', 'Nothing to monitor yet', `${cap.name} is at ${levelName(cap.authority.level)}. Its safety limits start applying once it has more autonomy than ${levelName(lowest)}.`);
  }
  const g = grantingRecord(state, cap.id);
  const expanded = g && g.previous && g.next.level > g.previous.level;
  const lastReview = (d.reviews || []).at(-1);
  const since = lastReview ? `since the review on ${fmtDate(lastReview.date)}` : expanded ? `since autonomy was expanded on ${fmtDate(g.date)}` : null;
  const applying = st.rules.filter((r) => r.active).length;
  return verdict('pass', 'Within limits', since
    ? `No safety limits have been crossed ${since}.`
    : `No safety limits have been crossed. ${plural(applying, 'limit applies', 'limits apply')} at ${levelName(cap.authority.level)}, checked automatically.`);
}

// The outcomes since autonomy was expanded, as plain numbers.
function outcomeStats(m) {
  if (!m || m.autonomousActions == null) return '';
  return html`<div class="mon-stats">
    <span><strong>${m.autonomousActions}</strong>ran automatically</span>
    <span><strong>${m.escalated}</strong>sent to human review</span>
    <span><strong>${m.reversals}</strong>reversed by a reviewer</span>
    <span><strong>${m.incidents}</strong>${m.incidents === 1 ? 'incident' : 'incidents'}</span>
  </div>
  <p class="muted small mon-stats-note">Since autonomy was expanded · simulated demo data</p>`;
}

function whatHappened(state, cap, d) {
  const m = d.monitoring;
  const need = reviewNeeded(state, cap.id);
  const errors = m && m.breached && need.restriction ? m.errors : need.incidents.flatMap((x) => x.errors);
  if (!need.any || !errors || !errors.length) return '';
  return html`<section class="mon-block"><h2>What happened</h2><ul class="plain-list">${errors.map((e) => html`<li>${e}</li>`)}</ul>
    ${need.restriction ? html`<p class="muted small">The change happened straight away, without waiting for anyone: the limit was agreed in advance. <a href="#/records/${m.breachRecordId}">Decision record</a></p>` : ''}</section>`;
}

// Who records the review depends on "Demo as": the form for someone who can,
// and for anyone else, who can and why not.
function reviewSection(state, cap) {
  const need = reviewNeeded(state, cap.id);
  if (!need.any) return '';
  const by = actor(state, cap.id);
  const who = person(by);
  const e = reviewEligibility(state, cap.id, by);
  const high = isHighOrFinancial(state, cap.id);
  const expansion = need.restriction ? restrictedExpansion(state, cap.id) : null;
  const heading = need.restriction ? badge('fail', 'Needs review') : 'Review what happened';
  const effect = need.restriction ? `${cap.name} stays at ${levelName(cap.authority.level)} until a change is approved.` : 'Autonomy doesn\'t change.';
  if (!e.ok) {
    const can = Object.keys(activePeople(state)).filter((k) => reviewEligibility(state, cap.id, k).ok).map((k) => person(k).name);
    const lead = high ? 'A Risk approver must record the review' : 'The owner or a Risk approver must record the review';
    const names = can.length ? `: ${can.length > 1 ? `${can.slice(0, -1).join(', ')} or ${can.at(-1)}` : can[0]}.` : '. No one can at the moment: add a Risk approver in People.';
    const why = expansion && expansion.authorizedBy === by
      ? `${who.name} approved the autonomy change being reviewed, and nobody reviews their own decision.`
      : e.reason;
    return html`<section class="mon-block mon-review"><h2>${heading}</h2>
      <p>${lead}${names} ${effect}</p>
      <p class="muted small">${why} ${SWITCH_PERSON}</p></section>`;
  }
  return html`<section class="mon-block mon-review"><h2>${heading}</h2>
    <form class="review-form" data-form="record-review" data-capability="${cap.id}">
      <p class="muted small">Reviewing as ${who.name}, ${who.role}. Saving it clears the alert. ${effect}</p>
      <label class="field field-stack"><span>What happened</span><textarea name="whatHappened" rows="2" required></textarea></label>
      <label class="field field-stack"><span>Cause</span><textarea name="cause" rows="2" required></textarea></label>
      <label class="field field-stack"><span>What changes as a result</span><textarea name="changes" rows="2" required></textarea></label>
      <button class="btn btn-primary" type="submit">Save review</button>
    </form></section>`;
}

function safetyLimitsLine(state, cap, st) {
  if (!st.rules.length) return '';
  const unit = (r) => (r.threshold && r.threshold.type === 'pct' ? '%' : '');
  const span = (r) => (!r.window ? '' : r.window.cases ? `, last ${r.window.cases} cases` : `, ${r.window.days} days`);
  const reading = (r) => {
    if (!r.threshold || !r.window) return html`<span class="muted">Can't be checked automatically: add a number and a time window in the rules.</span>`;
    if (!r.active) return html`<span class="muted">Applies above ${levelName(r.fallback)}</span>`;
    if (!r.measured) return html`<span class="muted">No data yet · limit ${r.threshold.value}${unit(r)}</span>`;
    // Imported production results (#120) name their run; a percentage on too
    // few cases is shown as too early, never as over the limit.
    if (r.imported) return html`${r.crossed ? badge('fail', 'Over the limit') : r.imported.early ? badge('insufficient', 'Too early to judge') : ''} ${r.value}${unit(r)}${r.imported.sample !== null ? ` across ${r.imported.sample} cases` : ''} · limit ${r.threshold.value}${unit(r)} <span class="muted small">(imported, ${r.imported.importId}${r.imported.early ? `; ${r.imported.needed} cases needed` : ''})</span>`;
    return html`${r.crossed ? badge('fail', 'Over the limit') : ''} ${r.value}${unit(r)}${span(r)} · limit ${r.threshold.value}${unit(r)} <span class="muted small">(${r.fromGate ? 'counted from logged actions' : 'simulated'})</span>`;
  };
  const effect = (r) => (r.kind === 'incident' ? 'If crossed: an incident opens; autonomy doesn\'t change.' : `If crossed: back to ${levelName(r.fallback)}${r.defaulted ? ' (one level down: the rule names no level)' : ''}.`);
  const active = st.rules.filter((r) => r.active);
  const over = st.rules.filter((r) => r.crossed).length;
  const meta = over ? `${over} over the limit` : active.length ? `${plural(active.length, 'limit')}, all within range` : `none apply at ${levelName(cap.authority.level)} yet`;
  return line('Safety limits', meta, html`<table class="table mon-limits"><tbody>${st.rules.map((r) => html`<tr><td>${r.text}<div class="muted small">${effect(r)}</div></td><td class="mon-reading">${reading(r)}</td></tr>`)}</tbody></table>
    <p class="muted small">From the rules, under "Automation is pulled back if". Checked automatically, so a problem is caught even if nobody is watching.</p>`);
}

// A compact summary of the gate log: what the automation tried to do.
function triedLine(state, cap) {
  const g = gateSummary(state, cap.id);
  const results = `#/capabilities/${cap.id}?tab=decide&show=results`;
  if (!g.events) return line('What the automation tried', 'nothing logged yet', html`<p>Every action is checked against the rules and logged; nothing has been logged for ${cap.name} yet.</p>`);
  const flags = [g.mustNeverAttempts ? `tried something never allowed ${plural(g.mustNeverAttempts, 'time')}` : null, g.falseClaims ? plural(g.falseClaims, 'claim') + ' that didn\'t match the records' : null].filter(Boolean);
  return line('What the automation tried', 'every action checked against the rules', html`<p>From logged actions so far: ${g.counts.allowed} ran automatically · ${g.counts.escalated} sent to human review · ${g.counts.blocked} blocked${flags.length ? html` · <span class="text-fail">${flags.join(' · ')}</span>` : ''}</p>
    <p class="muted small">Data: ${g.sources.map((x) => GATE_SOURCES[x] || x).join(', ')}. <a href="${results}">Each action, with its reason</a></p>`);
}

function rolloutLine(state, cap) {
  const g = grantingRecord(state, cap.id);
  if (!g || !g.rolloutPlan) return '';
  const p = g.rolloutPlan;
  return html`<p class="small muted mon-rollout">Rollout plan: ${p.ownerAt ? p.ownerAt.name : person(p.owner).name} · starts ${fmtDate(p.startDate)} · review on ${fmtDate(p.reviewDate)} · <a href="#/records/${g.id}">See plan</a></p>`;
}

function reviewsLine(d) {
  const done = (d.reviews || []).slice().reverse();
  if (!done.length) return '';
  const last = done[0];
  return line('Post-incident reviews', `latest by ${personAt(last.byAt, last.by).name} on ${fmtDate(last.date)}`, html`${done.map((rv) => html`<div class="mon-review-record">
    ${kv([['Reviewed by', html`${personAt(rv.byAt, rv.by).name}, ${fmtDate(rv.date)}${rightsNote(rv.byAt)}`], ['What happened', rv.whatHappened], ['Cause', rv.cause], ['What changed', rv.changes], ['Autonomy', `Stayed at ${authorityLabel(rv.authorityAt)}. Expanding it again needs a decision.`]])}
    ${rv.restrictionRecordId ? html`<p class="small"><a href="#/records/${rv.restrictionRecordId}">Decision record</a></p>` : ''}</div>`)}`);
}

function demoControl(state, cap) {
  const demo = breachRule(state, cap.id);
  if (!demo) return '';
  return html`<div class="mon-demo"><span class="mon-demo-label">Demo</span>
    <p class="small">See what happens automatically when "${demo.text}" is crossed.</p>
    <button class="btn btn-sm btn-danger" data-action="simulate-breach" data-capability="${cap.id}">${demo.kind === 'incident' ? 'Simulate a safety-limit incident' : 'Simulate a safety-limit breach'}</button></div>`;
}

function stillSafe(state, cap, d) {
  const st = monitoringStatus(state, cap.id);
  return html`${safetyVerdict(state, cap, d, st)}
    ${outcomeStats(d.monitoring)}
    ${whatHappened(state, cap, d)}
    ${reviewSection(state, cap)}
    ${lines(safetyLimitsLine(state, cap, st), triedLine(state, cap), reviewsLine(d))}
    ${rolloutLine(state, cap)}
    ${demoControl(state, cap)}`;
}

// ---------------------------------------------------------------------------
// Delivering value?
// ---------------------------------------------------------------------------

// Judging the rollout needs production evidence (Paige, 2026-10-12): while any
// goal is still measured on pilot or demo numbers, or fewer production cases
// are recorded than it needs (20 by default), the verdict is neutral: too
// early, not failed.
function valueJudgement(state, cap) {
  const { record, rows } = expectedVsActual(state, cap.id);
  const measured = rows.filter((r) => r.status !== 'not-measured');
  const met = rows.filter((r) => r.status === 'met').length;
  const tooEarly = measured.some((r) => !r.judged);
  const sample = measured.reduce((acc, r) => (r.sample && r.sample.needed > acc.needed ? r.sample : acc), { needed: 0, have: 0 });
  return { record, rows, measured, met, tooEarly, sample, pilot: measured.some((r) => r.seeded), notMet: rows.filter((r) => r.status === 'not-met' && r.judged).length };
}

function valueVerdict(cap, d, v) {
  const goals = plural(v.rows.length, 'rollout goal');
  if (!v.rows.length) return verdict('neutral', 'No rollout goals to compare', 'The decision in force was approved before rollout goals were recorded. The next change to its autonomy will include them.');
  if (!v.measured.length) return verdict('neutral', 'Not measured yet', `None of the ${goals} has a measured number yet. We never guess.`);
  if (v.tooEarly) {
    const cases = `${v.sample.have} of ${v.sample.needed} production cases recorded`;
    const why = v.pilot
      ? `${d.monitoring && d.monitoring.windowDays ? `It's day ${d.monitoring.windowDays} of the rollout. ` : ''}Pilot numbers fill the gap until enough production cases come in (${cases}).`
      : `Goals are judged once enough production cases are recorded: ${cases}.`;
    return verdict('neutral', 'Too early to judge', `${v.met} of ${goals} met so far. ${why}`);
  }
  const off = v.rows.filter((r) => r.status !== 'met').map((r) => r.metric);
  return verdict(off.length ? 'watch' : 'pass', `${v.met} of ${goals} on track`, off.length ? `Not on track yet: ${off.join('; ')}.` : 'Every goal set when autonomy was expanded is being met.');
}

function sourceLabel(r) {
  if (!r.source) return '';
  if (r.source === PILOT) return '(pilot · demo data)';
  return r.seeded ? `(${r.source.replace(/^Demo data \((.*)\)$/, '$1')} · demo data)` : `(${r.source})`;
}

function goalsTable(v) {
  if (!v.rows.length) return '';
  const word = { met: badge('pass', 'Met'), 'not-met': badge('fail', 'Not met') };
  return html`<div class="table-wrap mon-goals"><table class="table">
    <thead><tr><th>Goal</th><th>Expected</th><th>So far</th></tr></thead>
    <tbody>${v.rows.map((r) => html`<tr>
      <td>${r.metric}${r.measuredAs ? html`<div class="muted small">Measured as: ${r.measuredAs}</div>` : ''}</td>
      <td>${r.target}</td>
      <td>${r.status === 'not-measured'
        ? html`<span class="muted">Not measured</span><div class="muted small">${r.note}</div>`
        : html`${r.actualText} <span class="muted small">${sourceLabel(r)}</span>${v.tooEarly ? '' : html` ${word[r.status]}`}${r.status === 'not-met' ? html`<div class="muted small">${r.gapText}${v.tooEarly ? ' so far' : ''}</div>` : ''}`}</td>
    </tr>`)}</tbody>
  </table></div>
  <p class="muted small">From <a href="#/records/${v.record.id}">the decision in force</a>. An outcome with no measured number shows as "Not measured".</p>`;
}

function roiLine(state, cap) {
  const a = currentRoiAssumptions(state, cap.id);
  if (!a) return '';
  const r = roi(state, cap.id);
  const who = actor(state, cap.id);
  const e = roiEditEligibility(state, cap.id, who);
  const by = personAt(a.byAt, a.by);
  const versions = roiVersions(state, cap.id);
  const tag = (x) => (x.seeded ? ' (demo data)' : ` (${x.source})`);
  const sum = r
    ? html`<p>${a.values.monthlyCases.toLocaleString('en-US')} cases a month, ${r.inputs.automationRate.value}% done automatically, ${a.values.humanMinutesPerCase} minutes each at $${a.values.humanCostPerHour} an hour: about ${Math.round(r.hoursSaved)} staff hours saved (${money(r.laborSaved)}), less ${money(r.aiCost)} of AI cost at $${r.inputs.aiCostPerCase.value.toFixed(2)} a case. Net about ${money(r.net)} a month${r.roiPct != null ? `, ROI ${r.roiPct}%` : ''}.</p>
      <p class="muted small">Share done automatically${tag(r.inputs.automationRate)} · AI cost per case${tag(r.inputs.aiCostPerCase)}. It doesn't count time spent on approvals or set-up costs.</p>`
    : html`<p>The estimate appears once ${cap.name} completes some actions automatically, so we know how much work it takes on.</p>`;
  const form = html`<details class="mon-roi-edit"><summary>Change the assumptions</summary>
    <form class="roi-form" data-form="roi-assumptions" data-capability="${cap.id}">
      <div class="roi-fields">${ROI_FIELDS.map((f) => html`<label class="field field-stack"><span>${f.label} (${f.unit})</span><input type="number" name="${f.key}" step="any" min="${f.min}" max="${f.max}" value="${a.values[f.key]}" required></label>`)}</div>
      <label class="field field-stack"><span>Why you're changing them</span><textarea name="reason" rows="2" required></textarea></label>
      ${e.ok ? '' : html`<p class="form-error" role="status">${e.reason} ${SWITCH_PERSON}</p>`}
      <button class="btn btn-primary" type="submit" ${e.ok ? '' : raw('disabled')}>Save</button>
      <p class="muted small">Changes are kept in history. The owner or a named stakeholder can make them.</p>
    </form></details>`;
  return line('Return on investment', r ? `about ${money(r.net)} a month, estimated` : 'not yet', html`${sum}
    <p class="mon-sub">Assumptions${a.seeded ? ' (demo data)' : ''}</p>
    <ul class="plain-list">${ROI_FIELDS.map((f) => html`<li>${f.label}: ${f.unit === '$' ? `$${a.values[f.key]}` : `${a.values[f.key].toLocaleString('en-US')} ${f.unit}`}</li>`)}</ul>
    <p class="muted small">Set by ${by.name}, ${by.role}, on ${fmtDate(a.date)}. Reason: ${a.reason}</p>
    ${versions.length > 1 ? html`<details><summary>Earlier assumptions (${versions.length - 1})</summary><ul class="plain-list">${versions.slice(0, -1).reverse().map((x) => html`<li>v${x.version}, ${fmtDate(x.date)}, ${personAt(x.byAt, x.by).name}: ${ROI_FIELDS.map((f) => `${f.label.toLowerCase()} ${x.values[f.key]}`).join('; ')}. <span class="muted small">${x.reason}</span></li>`)}</ul></details>` : ''}
    ${form}`);
}

function adoptionLine(state, cap) {
  const signals = adoptionSignals(state, cap.id);
  const checked = 'approvals made without real review, more and more reversals, approvals left waiting, and work done outside the automation.';
  const simulated = signals.length && signals.every((x) => x.simulated);
  const meta = signals.length ? `${plural(signals.length, 'early warning')}${simulated ? ', simulated demo data' : ''}` : 'nothing looks off';
  return line('How reviewers are using it', meta, html`<p class="muted small">Early warnings only. They never block anything. Checked: ${checked}</p>
    ${signals.length
      ? signals.map((x) => html`<div class="mon-signal"><p><strong>${x.title}</strong>${x.simulated ? html` <span class="muted small">(simulated)</span>` : ''}</p><p>${x.what}</p><p class="muted small">Why it matters: ${x.why}</p><p class="muted small">Data: ${x.source}.</p></div>`)
      : html`<p>Nothing looks off.</p>`}`);
}

function deliveringValue(state, cap, d, v) {
  const extra = lines(roiLine(state, cap), adoptionSignals(state, cap.id).length || v.record ? adoptionLine(state, cap) : '');
  if (!v.record) {
    const none = html`<p class="empty">Nothing to judge yet. Rollout goals appear here once ${cap.name}'s autonomy is expanded with an expected impact.</p>`;
    return html`${none}${extra}`;
  }
  return html`${valueVerdict(cap, d, v)}${goalsTable(v)}${extra}`;
}

export function monitoringTab(state, cap, d, show = null) {
  const base = `#/capabilities/${cap.id}?tab=monitor`;
  const v = valueJudgement(state, cap);
  const value = show === 'value';
  // The Value chip counts what needs a look: goals missed on real numbers, and
  // adoption warnings. Goals judged on pilot numbers don't count yet.
  const look = v.notMet + adoptionSignals(state, cap.id).length;
  const views = subNav([{ href: base, label: 'Still safe?', active: !value }, { href: `${base}&show=value`, label: 'Delivering value?', active: value, count: look }], 'Monitoring views');
  return html`${views}<div class="mon">${value ? deliveringValue(state, cap, d, v) : stillSafe(state, cap, d)}</div>`;
}
