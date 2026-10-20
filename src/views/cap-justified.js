// Product reset, Phase 5 (#147): Monitor's first question, "Is the current
// Authority still justified?". The Decision in force against current
// conditions, what changed since, what it means in plain words, material
// changes and the evidence they may affect, and what a person can do next.
// Nothing here changes Authority.

import { html, raw, badge, kv, fmtDate, personAt } from '../ui.js';
import {
  justification, levelName, LEVEL_PLAIN, reviewConditions, MATERIAL_CHANGE_AREAS, actor, namedOn, people, decisionRequired, capData,
} from '../store/index.js';

const TONE = { supported: 'pass', attention: 'watch', investigate: 'bad', unjustified: 'bad', restricted: 'bad', retired: 'neutral' };
const SEVERITY = {
  unjustified: ['fail', 'May no longer be justified'],
  investigate: ['fail', 'Investigate'],
  attention: ['watch', 'Needs attention'],
  info: ['neutral', 'For information'],
};
const OPTION_WORDS = { expand: 'Expand', 'expand-limits': 'Expand with limits', hold: 'Keep current limits', restrict: 'Reduce one level', suspend: 'Pause', redesign: 'Send back for redesign', retire: 'Retire', 'auto-restrict': 'Automatic restriction', define: 'Starting authority', 'not-delegated': 'Not delegated, by design' };

function verdict(j, cap) {
  const body = {
    supported: `Nothing found since the Decision in force calls ${cap.name}'s ${levelName(j.authority.level)} into question.`,
    attention: 'Something has changed that a person should look at. Authority hasn\'t changed.',
    investigate: 'Something needs looking into before relying on the current Authority. Authority hasn\'t changed.',
    unjustified: 'Something the current Authority rested on when it was decided no longer holds. Only a person can change Authority: look into it, and reduce or keep it in Decide.',
    restricted: `A safety limit agreed in advance was crossed, so ${cap.name} was moved back to ${levelName(j.authority.level)} automatically. A review comes before any new expansion.`,
    retired: `${cap.name} was retired on ${j.record ? fmtDate(j.record.date) : ''}. It no longer operates and gets no authority again; its history stays. To use it again, set up a new capability.`,
  }[j.key];
  return html`<div class="mon-verdict mon-answer is-${TONE[j.key]}" role="status"><span class="mon-verdict-title">${j.label}</span><p>${body}</p></div>`;
}

function currentState(state, cap, j) {
  const live = reviewConditions(state, cap.id);
  const b = [...live.boundaries.lines, ...live.boundaries.restrictions];
  const enforced = b.filter((x) => x.enforcement === 'enforced').length;
  const r = j.record;
  const who = r ? (r.authorizedBy === 'system' ? 'software, under a rule agreed in advance' : personAt(r.authorizedByAt, r.authorizedBy).name) : '';
  return kv([
    ['Authority now', html`<strong>Level ${j.authority.level} · ${j.authority.name}</strong>. ${LEVEL_PLAIN[j.authority.level] || ''}`],
    ['Decision in force', r ? html`<a href="#/records/${r.id}">${r.id}</a>: ${OPTION_WORDS[r.option] || r.option}, ${fmtDate(r.date)}, by ${who}` : html`<span class="muted">None recorded.</span>`],
    ...(j.basis && r && j.basis.id !== r.id ? [['Last decided by a person', html`<a href="#/records/${j.basis.id}">${j.basis.id}</a>, ${fmtDate(j.basis.date)}`]] : []),
    ['Boundaries', b.length ? `${b.length}, of which ${enforced} enforced by software; the rest are written and followed by people.` : 'None written yet.'],
    ['Automatic restriction', j.restricted ? html`${badge('fail', 'Active')} A review is needed before any expansion.` : j.reviewLock ? 'A review is needed before any expansion.' : 'None active.'],
    ...(j.paused ? [['Paused', html`Since ${fmtDate(j.paused.since)}.${j.paused.plannedReviewDate ? ` Planned review: ${fmtDate(j.paused.plannedReviewDate)}, a reminder to look again; nothing changes on that date.` : ''} Authority comes back only through a new Proposal.`]] : []),
  ]);
}

function changesList(j) {
  const r = j.record;
  const head = r ? `What changed since ${r.id} (${fmtDate(r.date)})` : 'What changed';
  const note = j.legacy ? html`<p class="muted small">${r && (r.option === 'define' || r.option === 'not-delegated') ? 'The Decision in force is the starting record' : 'The Decision in force was recorded before Decisions froze what they were based on'}, so there are no results to compare with: a Requirement not met now is the bar for the next level, not a sign about this one. What follows stands on its own.</p>` : '';
  if (!j.changes.length) return html`<section class="mon-block"><h2>${head}</h2>${note}<p>Nothing.</p></section>`;
  const order = ['unjustified', 'investigate', 'attention', 'info'];
  const sorted = j.changes.slice().sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  return html`<section class="mon-block"><h2>${head}</h2>${note}
    <ul class="plain-list mon-changes">${sorted.map((c) => html`<li>${badge(...SEVERITY[c.severity])} ${c.text}</li>`)}</ul>
    <p class="muted small">Compared with what the Decision in force froze, where it froze anything. Nothing here changes Authority: only an automatic restriction, agreed in advance, or a person's Decision does.</p></section>`;
}

// Material changes since the Decision in force and the earlier evidence each
// may affect: "may need new evidence", never "failed".
function materialChanges(state, cap, j) {
  const named = namedOn(state, cap.id, actor(state, cap.id));
  const form = html`<details class="mon-material-form"><summary>Record a material change</summary>
    <form data-form="record-material-change" data-capability="${cap.id}">
      <fieldset class="field"><legend>What changed</legend><div class="material-areas">${Object.entries(MATERIAL_CHANGE_AREAS).map(([k, label]) => html`<label class="check"><input type="checkbox" name="areas" value="${k}"><span>${label}</span></label>`)}</div></fieldset>
      <label class="field field-stack"><span>Describe the change</span><textarea name="description" rows="2" required></textarea></label>
      <label class="field"><span>Took effect on</span><input type="date" name="effectiveOn" value="${state.today}"></label>
      ${named ? '' : html`<p class="form-error" role="status">Only the Owner or someone named on ${cap.name} can record a material change.</p>`}
      <button class="btn btn-primary" type="submit" ${named ? '' : raw('disabled')}>Record the change</button>
      <p class="muted small">Recorded changes can't be edited. Recording one never changes Authority: it asks whether the evidence still applies.</p>
    </form></details>`;
  const impacts = j.materialImpact;
  return html`<section class="mon-block"><h2>Material changes</h2>
    ${impacts.length ? impacts.map(({ change: m, rows }) => html`<div class="mon-material">
      <p><strong>${m.areas.map((a) => MATERIAL_CHANGE_AREAS[a]).join(', ')}</strong>, effective ${fmtDate(m.effectiveOn)}: ${m.description} <span class="muted small">(${m.id}, recorded by ${personAt(m.byAt, m.by).name})</span></p>
      ${rows.length ? html`<p class="small">Evidence from before this change may no longer describe how ${cap.name} behaves. It still counts, and it hasn't failed; it may need new evidence:</p>
        <ul class="plain-list">${rows.map((r) => html`<li>${badge(r.onlyBefore ? 'watch' : 'neutral', r.onlyBefore ? 'May need new evidence' : 'Partly after')} ${r.label}${r.kind === 'target' ? ' (Target)' : ''}: ${r.onlyBefore ? `all ${r.before} piece${r.before === 1 ? '' : 's'} of its evidence came before the change` : `${r.before} before the change, ${r.after} after`}.</li>`)}</ul>`
        : html`<p class="small muted">No current result rests on evidence from before this change.</p>`}
    </div>`) : html`<p>None recorded since the Decision in force.</p>`}
    ${form}</section>`;
}

// What a person can do from here, through the mechanics that exist (#147).
// Pulling back or pausing is open to anyone named on the capability;
// expanding or restoring is a new Proposal and the Owner's Decision; retiring
// is the Owner's, and final.
function actions(state, cap, j) {
  const base = `#/capabilities/${cap.id}`;
  const by = actor(state, cap.id);
  const who = (people(state)[by] || { name: by }).name;
  const named = namedOn(state, cap.id, by);
  if (j.key === 'retired') {
    return html`<section class="mon-block mon-actions"><h2>What you can do</h2><p>Nothing changes a retired capability: no Decision or Proposal follows. Its records stay in <a href="${base}?tab=history">History</a>. To use this work again, <a href="#/capabilities/new">set up a new capability</a>.</p></section>`;
  }
  const level = cap.authority.level;
  const r = j.restoration;
  const owner = (people(state)[cap.owner] || { name: cap.owner }).name;
  return html`<section class="mon-block mon-actions"><h2>What you can do</h2>
    <dl class="kv">
      <div><dt>Investigate</dt><dd>Look into it without changing Authority: <a href="${base}?tab=decide&show=all">see all the evidence</a>, <a href="${base}/evidence/record">record a result</a>, <a href="${base}/evidence/judge">record a judgment</a>, or <a href="${base}/evidence/log">record an incident</a>.</dd></div>
      <div><dt>Reduce or pause</dt><dd>${level > 0 ? html`Reduce one level, or pause (all the way to Observe, with an optional date to look again). Anyone named on ${cap.name} can record it, with a reason; no Proposal is needed. <a class="btn btn-sm" href="${base}?tab=decide&reduce=1">Reduce or pause</a>` : 'Already at Observe: there is nothing to reduce.'}${named ? '' : html` <span class="muted small">(${who} isn't named on it.)</span>`}</dd></div>
      <div><dt>${r ? `Restore toward Level ${r.priorAuthority.level}` : 'Restore or expand'}</dt><dd>${r ? html`It was at Level ${r.priorAuthority.level}, ${r.priorAuthority.name}, until ${fmtDate(r.date)} (${r.how}). ` : ''}Never automatic, even after evidence improves${j.reviewLock ? '' : ' or a review is done'}. ${j.reviewLock ? 'First the review after the automatic restriction. Then a ' : 'A '}new Proposal, one level at a time, and the Owner's Decision. <a href="${base}?tab=decide">Decide</a></dd></div>
      <div><dt>Retire</dt><dd>Stop using it for good, keeping its history. Only the Owner (${owner}) can, with a reason, and it can't be undone. <a class="btn btn-sm" href="${base}?tab=decide&retire=1">Retire</a></dd></div>
    </dl></section>`;
}

export function justifiedSection(state, cap) {
  const j = justification(state, cap.id);
  return html`<section class="mon-justified"><h2 class="mon-question">Is the current Authority still justified?</h2>
    ${verdict(j, cap)}
    ${currentState(state, cap, j)}
    ${changesList(j)}
    ${materialChanges(state, cap, j)}
    ${actions(state, cap, j)}</section>`;
}

// Pulling back without a Proposal (#147): the store has always allowed a
// reduction without one; this is the screen for it. Same Decision, same
// record, same rules (anyone named; a reason). Nothing new is decided here.
export function reductionView(state, cap, check) {
  const d = capData(state, cap.id);
  const dec = d.decision;
  const by = actor(state, cap.id);
  const who = people(state)[by] || { name: by, role: '' };
  const cur = cap.authority.level;
  const opt = (option, label, desc, disabled = false) => html`<label class="decide-leaf ${disabled ? 'is-disabled' : ''}"><input type="radio" name="decision-option" value="${option}" data-action="select-option" data-capability="${cap.id}" ${dec.option === option ? raw('checked') : ''} ${disabled ? raw('disabled') : ''}><span><strong>${label}</strong> <span class="muted small">${desc}</span></span></label>`;
  return html`<div class="decide-flow">
    <div class="decide-head"><h2>Reduce or pause</h2><p class="muted">${cap.name} is at Level ${cur}, ${levelName(cur)}. Pulling back takes effect when recorded, needs no Proposal, and can be recorded by anyone named on it. Getting authority back later needs a new Proposal and the Owner's Decision.</p></div>
    <section class="decide-step"><h2>How far?</h2><div class="decide-choices">
      ${opt('restrict', cur > 0 ? `One level down, to ${levelName(cur - 1)}` : 'One level down', cur > 0 ? 'Recorded as Restrict.' : 'Already at Observe.', cur === 0)}
      ${opt('suspend', 'Pause: all the way to Observe', 'It sees requests but does nothing with them. Recorded as Suspend.', cur === 0)}
      ${opt('redesign', 'Send back for redesign', 'Back to Observe until it passes new tests. Recorded as Redesign.')}
    </div>
    ${dec.option === 'suspend' ? html`<label class="field"><span>Planned review date <span class="muted small">(optional: a reminder to look again; nothing changes on it)</span></span><input type="date" min="${state.today}" value="${dec.pauseReviewDate || ''}" data-action="set-pause-review" data-capability="${cap.id}"></label>` : ''}</section>
    <section class="decide-step"><h2>Why?</h2><label class="field field-stack"><span class="sr-only">Your reason</span><textarea rows="3" aria-label="Your reason" data-action="set-rationale" data-capability="${cap.id}">${dec.rationale}</textarea></label></section>
    <section class="decide-step"><h2>Record</h2>
      ${check.ok ? '' : html`<p class="muted small" role="status">${['restrict', 'suspend', 'redesign'].includes(dec.option) ? check.reason : 'Choose how far to pull back.'}</p>`}
      <button class="btn btn-primary decide-record" data-action="authorize" data-capability="${cap.id}" ${check.ok && ['restrict', 'suspend', 'redesign'].includes(dec.option) ? '' : raw('disabled')}>Record decision as ${who.name}</button>
      <p class="muted small">Recorded with your name, your reason and what was known. Records can't be edited.</p>
    </section>
    <p class="small"><a href="#/capabilities/${cap.id}?tab=monitor">← Back to Monitor</a></p>
  </div>`;
}


// Retire (#147, Q6): the Owner only, a reason, final.
export function retireView(state, cap) {
  const by = actor(state, cap.id);
  const who = people(state)[by] || { name: by };
  const owner = (people(state)[cap.owner] || { name: cap.owner }).name;
  const ok = by === cap.owner;
  return html`<div class="decide-flow">
    <div class="decide-head"><h2>Retire ${cap.name}</h2><p class="muted">Retiring stops using this capability for good. It moves to Observe, any open Proposal closes, and it gets no authority again: there is no Restore. Its history and records stay. To use this work again later, set up a new capability.</p></div>
    <form data-form="retire-capability" data-capability="${cap.id}">
      <label class="field field-stack"><span>Why it is being retired</span><textarea name="reason" rows="3" required></textarea></label>
      ${ok ? '' : html`<p class="form-error" role="status">Only the Owner, ${owner}, can retire it. ${who.name} can reduce or pause it instead.</p>`}
      <button class="btn btn-danger" type="submit" ${ok ? '' : raw('disabled')}>Retire as ${who.name}</button>
      <p class="muted small">Recorded with your name and reason. Records can't be edited.</p>
    </form>
    <p class="small"><a href="#/capabilities/${cap.id}?tab=monitor">← Back to Monitor</a></p>
  </div>`;
}

// What the Decide tab says for a retired capability.
export function retiredView(state, cap) {
  const rec = state.decisionRecords.filter((r) => r.capabilityId === cap.id && r.option === 'retire').at(-1);
  return html`<div class="decide-flow"><div class="decide-recorded" role="status">
    <p class="decide-big">Retired</p>
    ${rec ? html`<p class="muted">${personAt(rec.authorizedByAt, rec.authorizedBy).name} · ${fmtDate(rec.date)}</p><p>${rec.rationale}</p><p class="small"><a href="#/records/${rec.id}">See the decision record</a></p>` : ''}
    <p>${cap.name} no longer operates, and no Decision or Proposal can follow. To use this work again, set up a new capability.</p>
  </div></div>`;
}
