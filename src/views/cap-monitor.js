// Monitor: is it still safe, and is it delivering value?

import { html, raw, section, badge, kv, fmtDate, person, personAt, notice, empty, rightsNote, subNav, SWITCH_PERSON } from '../ui.js';
import { authorityLabel, current, monitoringStatus, breachRule, levelName, reviewNeeded, reviewEligibility, actor, isHighOrFinancial, expectedVsActual, roi, roiVersions, currentRoiAssumptions, roiEditEligibility, ROI_FIELDS, grantingRecord, adoptionSignals } from '../store/index.js';

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

function reviewCard(state, cap, d) {
  const need = reviewNeeded(state, cap.id);
  const done = (d.reviews || []).slice().reverse();
  const recorded = done.map((rv) => html`<div class="card review-record"><p class="eyebrow">${rv.id} · Post-incident review · ${fmtDate(rv.date)}</p>
    ${kv([['Reviewed by', html`${personAt(rv.byAt, rv.by).name}${rightsNote(rv.byAt)}`], ['About', [rv.restrictionRecordId ? html`<a href="#/records/${rv.restrictionRecordId}">${rv.restrictionRecordId}</a>` : null, ...rv.incidentIds].filter(Boolean).map((x, i) => html`${i ? ', ' : ''}${x}`)], ['What happened', rv.whatHappened], ['Cause', rv.cause], ['What changed', rv.changes], ['Authority', html`Stayed at ${authorityLabel(rv.authorityAt)}. Giving it more authority again needs a proposed change and a named person's approval.`]])}
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

export function monitoringTab(state, cap, d, show = null) {
  const m = d.monitoring;
  const st = monitoringStatus(state, cap.id);
  const applying = st.rules.filter((r) => r.active).length;
  const demo = breachRule(state, cap.id);
  const head = m && m.breached && m.reviewId
    ? notice('watch', `The AI was moved back to ${levelName(cap.authority.level)} after crossing a safety limit. Review done.`, `It stays at ${authorityLabel(cap.authority)}. The limit it crossed: ${m.reading}. To give it more authority again, propose a change and get it approved. The review is below.`, { link: `#/records/${m.breachRecordId}`, linkText: 'Decision record' })
    : m && m.breached
    ? notice('fail', `The AI was moved back to ${levelName(cap.authority.level)} after crossing a safety limit.`, `It crossed this limit: ${m.reading}. Before it can get more authority again, someone has to review what happened (form below). Formally: automatic restriction.`, { link: `#/records/${m.breachRecordId}`, linkText: 'Decision record' })
    : m && m.recordId
      ? notice('pass', `Given more authority ${m.windowDays} days ago (simulated)`, 'We\'re watching closely for the first weeks. If any safety limit below is crossed, the AI\'s authority is reduced automatically, without waiting for someone to notice.', { link: `#/records/${m.recordId}`, linkText: 'Decision record' })
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
  const base = `#/capabilities/${cap.id}?tab=monitor`;
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
  const rollout = g && g.rolloutPlan ? html`<p class="small muted mon-rollout">Rollout plan: ${g.rolloutPlan.ownerAt ? g.rolloutPlan.ownerAt.name : g.rolloutPlan.owner} · starts ${fmtDate(g.rolloutPlan.startDate)} · review on ${fmtDate(g.rolloutPlan.reviewDate)} · <a href="#/records/${g.id}">See plan</a></p>` : '';
  return html`${views}${head}${rollout}${reviewCard(state, cap, d)}${metrics}${rulesCard(state, cap)}${fired}${opened}${control}`;
}

const sourceTag = (source, seeded) => html`<span class="muted small">${source}</span>${seeded ? html` ${badge('neutral', 'Demo data')}` : ''}`;

const money = (v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function adoptionCard(state, cap) {
  const signals = adoptionSignals(state, cap.id);
  const checked = 'Approvals made without real review, more and more reversals, approvals left waiting, and work done outside the AI.';
  const body = signals.length
    ? signals.map((x) => html`<div class="notice notice-watch adoption-signal" role="status"><div class="notice-body"><strong>${x.title}</strong>${x.simulated ? html` ${badge('neutral', 'Simulated')}` : ''}
        <p>${x.what}</p><p class="muted small">Why it matters: ${x.why}</p><p class="muted small">Data: ${x.source}.</p></div></div>`)
    : notice('pass', 'Nothing looks off', `Checked: ${checked}`);
  return section('How people are using it', body, { subtitle: `Early warnings only. They never block anything. ${signals.length ? `Checked: ${checked}` : ''}` });
}

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
  </table></div>`, { subtitle: html`From <a href="#/records/${record.id}">${record.id}</a>, the current decision. If we can't find a measured number for an outcome, it shows as "Not measured". We never guess.` });
}

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
