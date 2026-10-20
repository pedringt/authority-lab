// Product reset, Phase 5 (#147): Monitor's first question, "Is the current
// Authority still justified?". The Decision in force against current
// conditions, what changed since, what it means in plain words, material
// changes and the evidence they may affect, and what a person can do next.
// Nothing here changes Authority.

import { html, raw, badge, kv, fmtDate, personAt } from '../ui.js';
import {
  justification, levelName, LEVEL_PLAIN, reviewConditions, MATERIAL_CHANGE_AREAS, actor, namedOn, people, decisionRequired, capData,
} from '../store/index.js';

const TONE = { supported: 'pass', attention: 'watch', investigate: 'bad', unjustified: 'bad', restricted: 'bad' };
const SEVERITY = {
  unjustified: ['fail', 'May no longer be justified'],
  investigate: ['fail', 'Investigate'],
  attention: ['watch', 'Needs attention'],
  info: ['neutral', 'For information'],
};
const OPTION_WORDS = { expand: 'Expand', 'expand-limits': 'Expand with limits', hold: 'Keep current limits', restrict: 'Reduce one level', suspend: 'Suspend', redesign: 'Redesign', 'auto-restrict': 'Automatic restriction', define: 'Starting authority', 'not-delegated': 'Not delegated, by design' };

function verdict(j, cap) {
  const body = {
    supported: `Nothing found since the Decision in force calls ${cap.name}'s ${levelName(j.authority.level)} into question.`,
    attention: 'Something has changed that a person should look at. Authority hasn\'t changed.',
    investigate: 'Something needs looking into before relying on the current Authority. Authority hasn\'t changed.',
    unjustified: 'Something the current Authority rested on when it was decided no longer holds. Only a person can change Authority: look into it, and reduce or keep it in Decide.',
    restricted: `A safety limit agreed in advance was crossed, so ${cap.name} was moved back to ${levelName(j.authority.level)} automatically. A review comes before any new expansion.`,
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

// What a person can do from here, through the mechanics that exist. Pulling
// back is open to anyone named on the capability; expanding or restoring is
// a new Proposal and the Owner's Decision.
function actions(state, cap, j) {
  const base = `#/capabilities/${cap.id}`;
  const by = actor(state, cap.id);
  const named = namedOn(state, cap.id, by);
  const canReduce = cap.authority.level > 0 || cap.status !== 'redesign';
  const open = decisionRequired(state, cap.id);
  return html`<section class="mon-block mon-actions"><h2>What you can do</h2>
    <dl class="kv">
      <div><dt>Investigate</dt><dd>Look into it without changing Authority: <a href="${base}?tab=decide&show=all">see all the evidence</a>, <a href="${base}/evidence/record">record a result</a>, <a href="${base}/evidence/judge">record a judgment</a>, or <a href="${base}/evidence/log">record an incident</a>.</dd></div>
      <div><dt>Pull back</dt><dd>${canReduce ? html`Reduce one level, suspend (all the way to Observe), or send it back for redesign. Anyone named on ${cap.name} can record it, with a reason; no Proposal is needed. <a class="btn btn-sm" href="${base}?tab=decide&reduce=1">${open ? 'Decide' : 'Pull back authority'}</a>${named ? '' : html` <span class="muted small">(${(people(state)[by] || { name: by }).name} isn't named on it.)</span>`}` : 'Nothing to pull back.'}</dd></div>
      <div><dt>Restore or expand</dt><dd>Never automatic, even after evidence improves or a review is done. ${j.reviewLock ? 'First the review after the automatic restriction. Then a ' : 'A '}new Proposal, one level at a time, and the Owner's Decision. <a href="${base}?tab=decide">Decide</a></dd></div>
      <div><dt>Pause or retire</dt><dd class="muted">Not built yet: how they differ from Suspend, who may retire and whether it can be undone are open questions (#147).</dd></div>
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
    <div class="decide-head"><h2>Pull back authority</h2><p class="muted">${cap.name} is at Level ${cur}, ${levelName(cur)}. Pulling back takes effect when recorded, needs no Proposal, and can be recorded by anyone named on it. Getting authority back later needs a new Proposal and the Owner's Decision.</p></div>
    <section class="decide-step"><h2>How far?</h2><div class="decide-choices">
      ${opt('restrict', cur > 0 ? `One level down, to ${levelName(cur - 1)}` : 'One level down', cur > 0 ? 'Recorded as Restrict.' : 'Already at Observe.', cur === 0)}
      ${opt('suspend', 'All the way to Observe', 'Recorded as Suspend: it sees requests but does nothing with them.', cur === 0)}
      ${opt('redesign', 'Pause and redesign', 'Recorded as Redesign: back to Observe until it passes new tests.')}
    </div></section>
    <section class="decide-step"><h2>Why?</h2><label class="field field-stack"><span class="sr-only">Your reason</span><textarea rows="3" aria-label="Your reason" data-action="set-rationale" data-capability="${cap.id}">${dec.rationale}</textarea></label></section>
    <section class="decide-step"><h2>Record</h2>
      ${check.ok ? '' : html`<p class="muted small" role="status">${['restrict', 'suspend', 'redesign'].includes(dec.option) ? check.reason : 'Choose how far to pull back.'}</p>`}
      <button class="btn btn-primary decide-record" data-action="authorize" data-capability="${cap.id}" ${check.ok && ['restrict', 'suspend', 'redesign'].includes(dec.option) ? '' : raw('disabled')}>Record decision as ${who.name}</button>
      <p class="muted small">Recorded with your name, your reason and what was known. Records can't be edited.</p>
    </section>
    <p class="small"><a href="#/capabilities/${cap.id}?tab=monitor">← Back to Monitor</a></p>
  </div>`;
}

