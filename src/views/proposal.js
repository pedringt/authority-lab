// Product reset, Phase 4 (#144): the Proposal and the Decision as a person
// reviews them. The Proposal is shown as it was frozen; today's conditions
// sit beside it, never in place of it. Nothing here decides anything.

import { html, raw, badge, notice, fmtDate, personAt } from '../ui.js';
import {
  capData, ENFORCEMENT, RESIDUAL_RISK_LEVELS, reviewConditions, openAuthorityProposal, proposalStaleness,
  positionsDiffer, proposalGaps, levelName, LEVEL_PLAIN, decisionRequired, proposalClosures, authorityProposals, proposalStatus,
  RESIDUAL_REASON_MIN,
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

// Who proposed it and when, what it replaced, and whether it is stale. A
// stale Proposal blocks an expansion until it is replaced by a new one; it
// never blocks keeping the limits or pulling authority back (#144, Q3).
export function proposalBanner(state, cap, { prop, staleness, legacy }) {
  if (legacy) {
    return notice('watch', 'This decision was opened before Proposals were frozen', 'There is no snapshot of what was proposed. Everything below is shown as it is now. A new proposal, opened after this decision is made, will be frozen when it is created.');
  }
  if (!prop) return '';
  const who = personAt(prop.proposedByAt, prop.proposedBy);
  const replaced = prop.replaces ? proposalClosures(state, cap.id).find((c) => c.proposalId === prop.replaces) : null;
  const meta = html`<p class="muted small proposal-meta">Proposal ${prop.id} · proposed by ${who.name} on ${fmtDate(prop.openedAt)} · frozen as it was proposed. A Proposal is not a decision.${replaced ? ` It replaces ${prop.replaces}, which was stale.` : ''}</p>`;
  if (!staleness || !staleness.stale) return meta;
  return html`${meta}<div class="notice notice-fail" role="alert"><div class="notice-body"><strong>This Proposal is stale</strong>
    <p>It no longer describes what you would approve. Since it was proposed:</p>
    <ul class="plain-list">${staleness.reasons.map((r) => html`<li>${r.text}</li>`)}</ul>
    <p class="small">Expanding needs a new Proposal, frozen from today's conditions. ${prop.id} stays as it was, marked as replaced. Keeping the current limits or pulling authority back doesn't need one.</p>
    <p><button class="btn btn-sm btn-primary" data-action="replace-proposal" data-capability="${cap.id}">Replace with a new Proposal</button></p></div></div>`;
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
      <div><p class="fact-label">Newly permitted</p>${list(c.newlyPermitted)}${c.withinRules && c.withinRules.length ? html`<p class="fact-label">Only within the Boundaries, which don't change</p>${list(c.withinRules)}` : ''}</div>
      <div><p class="fact-label">Still needs a person</p>${list(c.stillNeedsPerson, 'Nothing listed in the Boundaries.')}</div>
      <div><p class="fact-label">Still prohibited</p>${list(c.prohibited, 'Nothing listed in the Boundaries.')}</div>
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
  const moved = staleness ? [...staleness.resultChanges, ...(staleness.coverageChanges || []).map((c) => ({ ...c, from: `coverage ${c.from}`, to: `coverage ${c.to}` }))] : [];
  return html`<details class="how proposal-frozen"><summary>When it was proposed (${fmtDate(prop.openedAt)}): ${prop.readiness.met} of ${prop.readiness.total} Requirements met${moved.length ? ` · ${moved.length} result${moved.length === 1 ? ' has' : 's have'} moved since` : ''}</summary>
    <table class="table"><thead><tr><th>Requirement</th><th>Result then</th><th>Why</th></tr></thead>
      <tbody>${prop.requirementResults.map((r) => html`<tr><td>${r.text}${r.consideration ? html` <span class="req-weight">Consideration</span>` : ''}</td><td>${badge(RESULT_TONE[r.status] || 'neutral', r.label)}</td><td class="small">${r.why}</td></tr>`)}</tbody></table>
    ${prop.targetResults.length ? html`<table class="table"><thead><tr><th>Target</th><th>Goal</th><th>Then</th><th>Result then</th></tr></thead>
      <tbody>${prop.targetResults.map((t) => html`<tr><td>${t.name}</td><td>${t.goal}</td><td>${t.current}</td><td>${t.label}</td></tr>`)}</tbody></table>` : ''}
    <p class="small"><strong>Coverage then:</strong> ${prop.coverage.text}</p>
    ${gaps.length ? html`<p class="fact-label">Gaps, Unknowns and conflicts then</p><ul class="plain-list">${gaps.map((g) => html`<li><strong>${g.label}:</strong> ${g.result}</li>`)}</ul>` : html`<p class="small">No gaps, Unknowns or conflicts were open.</p>`}
    ${moved.length ? html`<p class="fact-label">Results that have moved since</p><ul class="plain-list">${moved.map((m) => html`<li>${m.text}: ${m.from} → ${m.to}</li>`)}</ul>` : ''}
  </details>`;
}

// Reviewers and Stakeholders side by side, each in their own words. A
// disagreement is said plainly and never averaged into one answer.
export function positionsStep(positions, { then = null, capId = null, missing = [] } = {}) {
  const col = (role) => {
    const ps = positions.filter((p) => p.role === role);
    return html`<div><p class="fact-label">${role}s</p>${ps.length ? html`<ul class="plain-list proposal-positions">${ps.map((p) => html`<li><strong>${p.name}</strong>${p.team ? html` <span class="muted small">(${p.team})</span>` : ''}: ${p.stanceLabel}${p.position && p.position !== p.stanceLabel ? html`. ${p.position}` : ''}${p.quote ? html`<div class="muted small">“${p.quote}”</div>` : ''}</li>`)}</ul>` : html`<p class="muted small">None named.</p>`}</div>`;
  };
  const differ = positionsDiffer(positions);
  // A Reviewer against expanding is said first and plainly; it isn't a veto
  // (#144, Q2). A Reviewer with no position yet blocks an expansion.
  const against = positions.filter((p) => p.role === 'Reviewer' && (p.stance === 'hold' || p.stance === 'restrict'));
  const waiting = positions.filter((p) => missing.includes(p.person));
  return html`${waiting.length ? html`<div class="notice notice-fail" role="alert"><div class="notice-body"><strong>Waiting for ${waiting.map((p) => p.name).join(', ')} (Reviewer${waiting.length === 1 ? '' : 's'})</strong><p>Every Reviewer gives a position before authority expands. Keeping the current limits or pulling authority back doesn't wait for them.</p></div>${capId ? html`<a class="notice-link" href="#/capabilities/${capId}/stakeholders/edit">Record a position</a>` : ''}</div>` : ''}
    ${against.length ? notice('watch', `${against.map((p) => `${p.name} (Reviewer) says ${p.stanceLabel}`).join('; ')}`, 'A Reviewer\'s position is shown, never averaged away. It doesn\'t decide for the Owner.') : ''}
    ${differ ? notice('watch', 'Positions differ', 'They are shown as each person gave them. Nothing here averages them or picks one.') : ''}
    <div class="proposal-two">${col('Reviewer')}${col('Stakeholder')}</div>
    ${then ? html`<p class="muted small">${then}</p>` : ''}`;
}

// Risk at decision time: the initial Risk, the controls that bear on it, and
// the Residual Risk a person gives, with their reason. No score. Optional.
// Phase 6A: the Residual Risk question can be asked apart, once the person
// has chosen to expand ({ residual: false } leaves it out here).
export function riskStep(cap, dec, risk, b, { residual = true } = {}) {
  const enforced = b.lines.filter((l) => l.enforcement === 'enforced').length + b.restrictions.filter((r) => r.enforcement === 'enforced').length;
  const total = b.lines.length + b.restrictions.length;
  return html`<dl class="kv">
      <div><dt>Initial Risk</dt><dd><strong>${risk.overall}</strong> <span class="muted small">${risk.why}</span></dd></div>
      <div><dt>Controls</dt><dd>${total ? `${total} Boundar${total === 1 ? 'y' : 'ies'}, ${enforced} enforced by software; the rest are written and followed by people.` : 'No Boundaries written yet.'}</dd></div>
    </dl>
    ${residual ? residualRiskField(cap, dec) : html`<p class="muted small">If you choose to expand, you'll be asked for the Residual Risk: what you judge is left once these controls are in place.</p>`}`;
}

// The Residual Risk a person gives, with their reason. Never suggested.
export function residualRiskField(cap, dec) {
  const rr = dec.residualRisk;
  const radio = (lvl) => html`<label class="check"><input type="radio" name="residual-risk" value="${lvl}" data-action="set-residual-risk" data-capability="${cap.id}" ${rr && rr.level === lvl ? raw('checked') : ''}><span>${lvl}</span></label>`;
  return html`<fieldset class="residual-risk"><legend>Residual Risk, once these controls are in place <span class="muted small">(needed to expand; your judgment)</span></legend>
      <div class="residual-options">${RESIDUAL_RISK_LEVELS.map(radio)}</div>
      ${rr ? html`<label class="field field-stack"><span>Why</span><textarea rows="2" aria-label="Why this Residual Risk" data-action="set-residual-note" data-capability="${cap.id}">${rr.note || ''}</textarea></label>
        <p><button class="btn btn-sm" data-action="clear-residual-risk" data-capability="${cap.id}">Clear Residual Risk</button></p>` : ''}
    </fieldset>
    <p class="muted small">Needed with a short reason before authority expands, not to keep the limits or pull back. Unknown and High are valid answers. Software never scores this or decides whether it's acceptable; it goes on the record as you give it.</p>`;
}

// Which evidence produced each result, in words (#144): one line per row,
// naming the results behind it (each item of a combined result), the
// judgments that decided it, the incidents that blocked it, and the Target it
// is judged through. Read only from a frozen snapshot.
const VERDICT_WORDS = { met: 'met', 'not-met': 'not met', unknown: 'Unknown' };
export function provenanceRows(ev) {
  if (!ev || !ev.rows) return [];
  const item = (id) => ev.items.find((x) => x.id === id);
  const itemText = (it) => {
    if (!it) return null;
    const who = it.file ? `uploaded ${it.file.name}${it.file.importedBy ? ` by ${it.file.importedBy}` : ''}${it.file.perCase && it.file.cases != null ? `, ${it.file.cases} cases judged` : ''}` : it.recordedBy ? `recorded by ${it.recordedBy}` : it.importId ? `from ${it.importId}` : it.source || '';
    return `${it.metric}: ${it.value}, ${who}${it.date ? `, ${it.date}` : ''} (${it.id})${it.demo ? ' [demo]' : ''}`;
  };
  return ev.rows.map((r) => {
    const parts = [];
    for (const res of r.results) {
      const items = res.itemIds.map(item).filter(Boolean);
      if (items.length) parts.push(...items.map(itemText));
      else if (res.evidenceId) parts.push(`${res.label}: ${res.text}${res.date ? `, ${res.date}` : ''} (${res.evidenceId})`);
    }
    if (r.source === 'authority-lab-tests' && ev.outcomes.length) parts.push(`Recorded test outcomes: ${ev.outcomes.map((o) => `${o.scenarioName} ${o.result} (${o.id}, ${o.byName}, ${o.date})`).join('; ')}`);
    for (const id of r.judgments) { const j = ev.judgments.find((x) => x.id === id); if (j) parts.push(`${j.byName} (${j.role}) judged it ${VERDICT_WORDS[j.verdict] || j.verdict} on ${j.date}: ${j.rationale}${j.reference ? ` [${j.reference.label || j.reference.url || j.reference}]` : ''} (${j.id})`); }
    for (const id of r.incidents) { const i = ev.incidents.find((x) => x.id === id); if (i) parts.push(`Open ${i.severity} incident ${i.id}: ${i.what}`); }
    if (r.targets && r.targets.length) parts.push(`Judged through its Target${r.targets.length === 1 ? '' : 's'} (${r.targets.join(', ')})`);
    return { label: r.label, kind: r.kind, parts };
  }).filter((r) => r.parts.length);
}

export function provenanceList(ev) {
  const rows = provenanceRows(ev);
  if (!rows.length) return '';
  return html`<ul class="plain-list provenance">${rows.map((r) => html`<li><strong>${r.label}</strong>${r.kind === 'target' ? html` <span class="muted small">(Target)</span>` : ''}<ul class="plain-list">${r.parts.map((p) => html`<li class="small">${p}</li>`)}</ul></li>`)}</ul>`;
}

// Every Proposal for a capability, newest first, with what became of it.
export function proposalHistory(state, cap) {
  const list = authorityProposals(state, cap.id).slice().reverse();
  if (!list.length) return '';
  const words = { open: 'open', decided: 'decided', replaced: 'replaced', closed: 'closed' };
  return html`<ul class="plain-list">${list.map((p) => {
    const st = proposalStatus(state, cap.id, p.id);
    const c = st === 'replaced' ? proposalClosures(state, cap.id).find((x) => x.proposalId === p.id) : null;
    const rec = st === 'decided' ? state.decisionRecords.find((r) => r.proposalId === p.id) : null;
    return html`<li><strong>${p.id}</strong>: Level ${p.from.level} → Level ${p.to.level}, proposed by ${personAt(p.proposedByAt, p.proposedBy).name} on ${fmtDate(p.openedAt)} · ${words[st]}${c ? html` by ${c.replacedBy} because it was stale (${personAt(c.byAt, c.by).name}, ${fmtDate(c.date)})` : ''}${rec ? html` (<a href="#/records/${rec.id}">${rec.id}</a>)` : ''}</li>`;
  })}</ul><p class="muted small">Proposals are never edited. A stale one is replaced by a new one and kept as it was.</p>`;
}

// What the record froze, for the record page.
export function recordReviewed(state, x) {
  const v = x.reviewed;
  const prop = x.proposalId ? (capData(state, x.capabilityId).authorityProposals || []).find((p) => p.id === x.proposalId) : null;
  const rows = [];
  if (prop) {
    const who = personAt(prop.proposedByAt, prop.proposedBy);
    rows.push(['Proposal reviewed', html`${prop.id}, proposed by ${who.name} on ${fmtDate(prop.openedAt)}: Level ${prop.from.level} → Level ${prop.to.level}. ${prop.readiness.met} of ${prop.readiness.total} Requirements met when proposed.${x.proposalStale ? html`<div class="notice notice-watch"><div class="notice-body"><strong>The Proposal was stale when this was decided</strong><ul class="plain-list">${x.proposalStale.map((r) => html`<li>${r.text}</li>`)}</ul></div></div>` : ''}`]);
  } else if (x.proposalLegacy) {
    rows.push(['Proposal reviewed', html`<span class="muted">Opened before Proposals were frozen, so there is no snapshot of it.</span>`]);
  }
  if (x.residualRisk) {
    const by = personAt(x.residualRisk.byAt, x.residualRisk.by);
    rows.push(['Residual Risk', html`<strong>${x.residualRisk.level}</strong>${x.residualRisk.note ? html`: ${x.residualRisk.note}` : ''} <span class="muted small">(given by ${by.name})</span>`]);
  }
  if (!v) return rows;
  rows.push(['Initial Risk', html`${v.risk.overall} <span class="muted small">${v.risk.why}</span>`]);
  rows.push(['Requirements when decided', html`<ul class="plain-list">${v.requirementResults.map((r) => html`<li>${badge(RESULT_TONE[r.status] || 'neutral', r.label)} ${r.text}${r.consideration ? html` <span class="req-weight">Consideration</span>` : ''}${r.status !== 'met' && r.why ? html` <span class="muted small">${r.why}</span>` : ''}</li>`)}</ul>${v.targetResults.length ? html`<p class="fact-label">Targets</p><ul class="plain-list">${v.targetResults.map((t) => html`<li>${t.name} (${t.goal}): ${t.label}${t.current ? `, ${t.current}` : ''}</li>`)}</ul>` : ''}<p class="small">${v.coverage.text}</p>`]);
  const bs = [...v.boundaries.lines, ...v.boundaries.restrictions];
  rows.push(['Boundaries when decided', bs.length ? html`<ul class="plain-list">${bs.map((l) => html`<li>${l.text} ${enforcementBadge(l.enforcement)}</li>`)}</ul>` : html`<span class="muted">None written.</span>`]);
  if (v.positions.length) rows.push(['Positions when decided', positionsStep(v.positions)]);
  return rows;
}
