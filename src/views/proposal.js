// Product reset, Phase 4 (#144): the Proposal and the Decision as a person
// reviews them. The Proposal is shown as it was frozen; today's conditions
// sit beside it, never in place of it. Nothing here decides anything.

import { html, raw, badge, notice, fmtDate, personAt } from '../ui.js';
import {
  capData, ENFORCEMENT, RESIDUAL_RISK_LEVELS, reviewConditions, openAuthorityProposal, proposalStaleness,
  positionsDiffer, proposalGaps, levelName, LEVEL_PLAIN, decisionRequired,
} from '../store/index.js';

const ENFORCEMENT_TONE = { enforced: 'pass', 'model-reported': 'watch', documented: 'neutral' };
const enforcementBadge = (e) => badge(ENFORCEMENT_TONE[e] || 'neutral', e === 'documented' ? 'Written Boundary' : ENFORCEMENT[e] || e);
const RESULT_TONE = { met: 'pass', 'not-met': 'fail', conflicting: 'fail', unknown: 'watch', 'not-enough': 'watch', 'no-evidence': 'neutral', 'needs-decision': 'watch' };
const list = (items, empty = 'None listed.') => (items && items.length ? html`<ul class="plain-list">${items.map((x) => html`<li>${x}</li>`)}</ul>` : html`<p class="muted small">${empty}</p>`);

// The Proposal behind the open decision, its staleness, and what to show
// when the decision predates frozen Proposals.
export function openProposalState(state, cap) {
  const prop = openAuthorityProposal(state, cap.id);
  return { prop, staleness: prop ? proposalStaleness(state, cap.id, prop) : null, legacy: !prop && decisionRequired(state, cap.id) };
}

// Who proposed it and when, and whether it may be stale. Information only:
// it never blocks the decision.
export function proposalBanner(state, cap, { prop, staleness, legacy }) {
  if (legacy) {
    return notice('watch', 'This decision was opened before Proposals were frozen', 'There is no snapshot of what was proposed. Everything below is shown as it is now. A new proposal, opened after this decision is made, will be frozen when it is created.');
  }
  if (!prop) return '';
  const who = personAt(prop.proposedByAt, prop.proposedBy);
  const meta = html`<p class="muted small proposal-meta">Proposal ${prop.id} · proposed by ${who.name} on ${fmtDate(prop.openedAt)} · frozen as it was proposed. A Proposal is not a decision.</p>`;
  if (!staleness || !staleness.stale) return meta;
  return html`${meta}<div class="notice notice-watch" role="status"><div class="notice-body"><strong>This Proposal may be stale</strong>
    <p>Something it was reviewed against has changed since it was proposed:</p>
    <ul class="plain-list">${staleness.reasons.map((r) => html`<li>${r.text}</li>`)}</ul>
    <p class="small">The Proposal below is shown as it was frozen; today's conditions are under "What do we know?". The record will say that the Proposal may have been stale.</p></div></div>`;
}

// "What changes if I approve this?": current and proposed authority, what
// becomes newly permitted, what still needs a person, what stays prohibited,
// and the Boundaries with how each is enforced.
export function changeStep(state, cap, { prop }, proposed) {
  const snap = prop || { from: cap.authority, to: proposed, change: null, boundaries: reviewConditions(state, cap.id).boundaries };
  const side = (label, a, cls) => html`<div class="decide-${cls}"><span class="muted small">${label}</span><strong>${LEVEL_PLAIN[a.level]}</strong><span class="muted small">Level ${a.level} · ${levelName(a.level)}${a.limited && a.level !== 3 ? ' (limited)' : ''}</span></div>`;
  const change = html`<div class="decide-change">${side('Now', snap.from, 'from')}<span class="decide-arrow" aria-hidden="true">→</span>${side('Proposed', snap.to, 'to')}</div>`;
  const c = snap.change;
  const b = snap.boundaries;
  const lines = (section) => b.lines.filter((l) => l.section === section || (section === 'person' && (l.section === 'mustAsk' || l.section === 'escalation')));
  const withBadge = (l) => html`<span>${l.text}</span> ${enforcementBadge(l.enforcement)}`;
  const three = c ? html`<div class="proposal-three">
      <div><p class="fact-label">Newly permitted</p>${list(c.newlyPermitted)}${c.withinRules && c.withinRules.length ? html`<p class="fact-label">Only within the Rules, which don't change</p>${list(c.withinRules)}` : ''}</div>
      <div><p class="fact-label">Still needs a person</p>${list(c.stillNeedsPerson, 'Nothing listed in the Rules.')}</div>
      <div><p class="fact-label">Still prohibited</p>${list(c.prohibited, 'Nothing listed in the Rules.')}</div>
    </div>` : '';
  const bounds = html`<details class="how proposal-bounds"${c ? '' : raw(' open')}><summary>Boundaries and how each is enforced${prop ? ' (as proposed)' : ''}</summary>
      ${['may', 'person', 'mustNever'].map((s) => { const ls = lines(s); return ls.length ? html`<p class="fact-label">${{ may: 'Allowed', person: 'Needs human review', mustNever: 'Not allowed' }[s]}</p><ul class="plain-list">${ls.map((l) => html`<li>${withBadge(l)}</li>`)}</ul>` : ''; })}
      ${b.restrictions.length ? html`<p class="fact-label">Automation is pulled back if</p><ul class="plain-list">${b.restrictions.map((r) => html`<li>${withBadge(r)}</li>`)}</ul>` : ''}
      ${!b.lines.length && !b.restrictions.length ? html`<p class="muted small">No Boundaries written yet.</p>` : ''}
    </details>`;
  return html`${change}${three}${bounds}`;
}

// Requirement and Target results as they stood when it was proposed, what
// has moved since (information, not staleness), and the gaps.
export function frozenResults(prop, staleness) {
  if (!prop) return '';
  const gaps = proposalGaps(prop);
  const moved = staleness ? staleness.resultChanges : [];
  return html`<details class="how proposal-frozen"><summary>When it was proposed (${fmtDate(prop.openedAt)}): ${prop.readiness.met} of ${prop.readiness.total} Requirements met${moved.length ? ` · ${moved.length} result${moved.length === 1 ? ' has' : 's have'} moved since` : ''}</summary>
    <table class="table"><thead><tr><th>Requirement</th><th>Result then</th><th>Why</th></tr></thead>
      <tbody>${prop.requirementResults.map((r) => html`<tr><td>${r.text}</td><td>${badge(RESULT_TONE[r.status] || 'neutral', r.label)}</td><td class="small">${r.why}</td></tr>`)}</tbody></table>
    ${prop.targetResults.length ? html`<table class="table"><thead><tr><th>Target</th><th>Goal</th><th>Then</th><th>Result then</th></tr></thead>
      <tbody>${prop.targetResults.map((t) => html`<tr><td>${t.name}</td><td>${t.goal}</td><td>${t.current}</td><td>${t.label}</td></tr>`)}</tbody></table>` : ''}
    <p class="small"><strong>Coverage then:</strong> ${prop.coverage.text}</p>
    ${gaps.length ? html`<p class="fact-label">Gaps, Unknowns and conflicts then</p><ul class="plain-list">${gaps.map((g) => html`<li><strong>${g.label}:</strong> ${g.result}</li>`)}</ul>` : html`<p class="small">No gaps, Unknowns or conflicts were open.</p>`}
    ${moved.length ? html`<p class="fact-label">Results that have moved since</p><ul class="plain-list">${moved.map((m) => html`<li>${m.text}: ${m.from} → ${m.to}</li>`)}</ul><p class="muted small">Shown so you can see what moved. Whether a moved result makes the Proposal stale isn't decided yet.</p>` : ''}
  </details>`;
}

// Reviewers and Stakeholders side by side, each in their own words. A
// disagreement is said plainly and never averaged into one answer.
export function positionsStep(positions, { then = null } = {}) {
  const col = (role) => {
    const ps = positions.filter((p) => p.role === role);
    return html`<div><p class="fact-label">${role}s</p>${ps.length ? html`<ul class="plain-list proposal-positions">${ps.map((p) => html`<li><strong>${p.name}</strong>${p.team ? html` <span class="muted small">(${p.team})</span>` : ''}: ${p.stanceLabel}${p.position && p.position !== p.stanceLabel ? html`. ${p.position}` : ''}${p.quote ? html`<div class="muted small">“${p.quote}”</div>` : ''}</li>`)}</ul>` : html`<p class="muted small">None named.</p>`}</div>`;
  };
  const differ = positionsDiffer(positions);
  return html`${differ ? notice('watch', 'Positions differ', 'They are shown as each person gave them. Nothing here averages them or picks one.') : ''}
    <div class="proposal-two">${col('Reviewer')}${col('Stakeholder')}</div>
    ${then ? html`<p class="muted small">${then}</p>` : ''}`;
}

// Risk at decision time: the initial Risk, the controls that bear on it, and
// the Residual Risk a person gives, with their reason. No score. Optional.
export function riskStep(cap, dec, risk, b) {
  const enforced = b.lines.filter((l) => l.enforcement === 'enforced').length + b.restrictions.filter((r) => r.enforcement === 'enforced').length;
  const total = b.lines.length + b.restrictions.length;
  const rr = dec.residualRisk;
  const radio = (lvl) => html`<label class="check"><input type="radio" name="residual-risk" value="${lvl}" data-action="set-residual-risk" data-capability="${cap.id}" ${rr && rr.level === lvl ? raw('checked') : ''}><span>${lvl}</span></label>`;
  return html`<dl class="kv">
      <div><dt>Initial Risk</dt><dd><strong>${risk.overall}</strong> <span class="muted small">${risk.why}</span></dd></div>
      <div><dt>Controls</dt><dd>${total ? `${total} Boundar${total === 1 ? 'y' : 'ies'}, ${enforced} enforced by software; the rest are written and followed by people.` : 'No Boundaries written yet.'}</dd></div>
    </dl>
    <fieldset class="residual-risk"><legend>Residual Risk, once these controls are in place <span class="muted small">(optional; your judgment)</span></legend>
      <div class="residual-options">${RESIDUAL_RISK_LEVELS.map(radio)}</div>
      ${rr ? html`<label class="field field-stack"><span>Why</span><textarea rows="2" aria-label="Why this Residual Risk" data-action="set-residual-note" data-capability="${cap.id}">${rr.note || ''}</textarea></label>
        <p><button class="btn btn-sm" data-action="clear-residual-risk" data-capability="${cap.id}">Clear Residual Risk</button></p>` : ''}
    </fieldset>
    <p class="muted small">Software never scores this or decides whether it's acceptable. It goes on the record as you give it.</p>`;
}

// What the record froze, for the record page.
export function recordReviewed(state, x) {
  const v = x.reviewed;
  const prop = x.proposalId ? (capData(state, x.capabilityId).authorityProposals || []).find((p) => p.id === x.proposalId) : null;
  const rows = [];
  if (prop) {
    const who = personAt(prop.proposedByAt, prop.proposedBy);
    rows.push(['Proposal reviewed', html`${prop.id}, proposed by ${who.name} on ${fmtDate(prop.openedAt)}: Level ${prop.from.level} → Level ${prop.to.level}. ${prop.readiness.met} of ${prop.readiness.total} Requirements met when proposed.${x.proposalStale ? html`<div class="notice notice-watch"><div class="notice-body"><strong>The Proposal may have been stale when this was decided</strong><ul class="plain-list">${x.proposalStale.map((r) => html`<li>${r.text}</li>`)}</ul></div></div>` : ''}`]);
  } else if (x.proposalLegacy) {
    rows.push(['Proposal reviewed', html`<span class="muted">Opened before Proposals were frozen, so there is no snapshot of it.</span>`]);
  }
  if (x.residualRisk) {
    const by = personAt(x.residualRisk.byAt, x.residualRisk.by);
    rows.push(['Residual Risk', html`<strong>${x.residualRisk.level}</strong>${x.residualRisk.note ? html`: ${x.residualRisk.note}` : ''} <span class="muted small">(given by ${by.name})</span>`]);
  }
  if (!v) return rows;
  rows.push(['Initial Risk', html`${v.risk.overall} <span class="muted small">${v.risk.why}</span>`]);
  rows.push(['Requirements when decided', html`<ul class="plain-list">${v.requirementResults.map((r) => html`<li>${badge(RESULT_TONE[r.status] || 'neutral', r.label)} ${r.text}${r.status !== 'met' && r.why ? html` <span class="muted small">${r.why}</span>` : ''}</li>`)}</ul>${v.targetResults.length ? html`<p class="fact-label">Targets</p><ul class="plain-list">${v.targetResults.map((t) => html`<li>${t.name} (${t.goal}): ${t.label}${t.current ? `, ${t.current}` : ''}</li>`)}</ul>` : ''}<p class="small">${v.coverage.text}</p>`]);
  const bs = [...v.boundaries.lines, ...v.boundaries.restrictions];
  rows.push(['Boundaries when decided', bs.length ? html`<ul class="plain-list">${bs.map((l) => html`<li>${l.text} ${enforcementBadge(l.enforcement)}</li>`)}</ul>` : html`<span class="muted">None written.</span>`]);
  if (v.positions.length) rows.push(['Positions when decided', positionsStep(v.positions)]);
  return rows;
}
