// Decision brief (roadmap item 9, D1, #76): one printable page for a
// leadership reader. Built only from the decision record and the versions
// that were in force when it was written, so it reads the same later,
// whatever has changed since.

import { html, fmtDate, personAt } from '../ui.js';
import { getCapability, recordVersion, levelName, isDemoWorkspace, workspaceOf } from '../store/index.js';
import { provenanceRows } from './proposal.js';

const levelText = (a) => (a ? `Level ${a.level}, ${levelName(a.level)}${a.limited ? ' (limited)' : ''}` : 'none (new capability)');
const block = (title, body) => html`<section class="brief-block"><h2>${title}</h2>${body}</section>`;
const none = (text) => html`<p class="muted">${text}</p>`;

// Positions as recorded, grouped by stance, and whether they agree.
function disagreement(state, rec) {
  const v = recordVersion(state, rec, 'stakeholders');
  const list = v && Array.isArray(v.value) ? v.value.filter((s) => s.position) : [];
  if (!list.length) return none('No stakeholder positions were recorded.');
  const stances = [...new Set(list.map((s) => s.position))];
  return html`<p>${stances.length > 1 ? `People disagreed: ${stances.length} different positions among ${list.length} people.` : `Everyone agreed (${list.length} ${list.length === 1 ? 'person' : 'people'}).`}</p>
    <ul class="brief-list">${list.map((s) => html`<li><strong>${s.team}</strong> (${personAt(null, s.person).name}): ${s.position}</li>`)}</ul>`;
}

// The automatic restriction lines in the contract version in force.
function pullBack(state, rec) {
  const c = recordVersion(state, rec, 'contract');
  const lines = c && c.value && Array.isArray(c.value.autoRestriction) ? c.value.autoRestriction : [];
  if (!lines.length) return none('The rules at the time didn\'t say when authority is reduced automatically.');
  return html`<ul class="brief-list">${lines.map((l) => html`<li>${l}</li>`)}</ul><p class="muted">If one of these happens, the AI is moved back a level automatically. Someone must then record what happened (the post-incident review) before it can get more authority again.</p>`;
}

function watch(rec) {
  const p = rec.rolloutPlan;
  const items = [];
  if (p) items.push(html`<li><strong>Rollout:</strong> ${p.ownerAt ? p.ownerAt.name : p.owner} owns it, from ${fmtDate(p.startDate)}; review on <strong>${fmtDate(p.reviewDate)}</strong>.</li>`, html`<li><strong>Feedback:</strong> ${p.feedbackChannel}</li>`);
  if (rec.openCondition) items.push(html`<li><strong>Still to resolve:</strong> ${rec.openCondition}</li>`);
  return items.length ? html`<ul class="brief-list">${items}</ul>` : none('No rollout plan was recorded.');
}

// Initial Risk and the Residual Risk the person deciding gave (#144), from
// the record. No score; nothing here judges whether it was acceptable.
function risk(rec) {
  const items = [];
  if (rec.reviewed) items.push(html`<li><strong>Initial Risk:</strong> ${rec.reviewed.risk.overall}</li>`);
  if (rec.residualRisk) items.push(html`<li><strong>Residual Risk:</strong> ${rec.residualRisk.level}${rec.residualRisk.note ? `: ${rec.residualRisk.note}` : ''}</li>`);
  if (rec.proposalId) items.push(html`<li><strong>Proposal reviewed:</strong> ${rec.proposalId}${rec.proposalStale ? ' (it was stale: something it was reviewed against had changed)' : ''}</li>`);
  return items.length ? html`<ul class="brief-list">${items}</ul>` : none('Not recorded: this decision was made before Risk was frozen on records.');
}

export function decisionBriefView(state, recordId) {
  const rec = state.decisionRecords.find((r) => r.id === recordId);
  if (!rec) return html`<div class="page-head"><h1>Record not found</h1></div>`;
  const cap = getCapability(state, rec.capabilityId);
  const who = personAt(rec.authorizedByAt, rec.authorizedBy);
  const auto = rec.authorizedBy === 'system';
  // #144: evidence recorded by hand has no summary line; say what each
  // result rested on instead.
  const prov = rec.reviewed && rec.reviewed.evidence ? provenanceRows(rec.reviewed.evidence) : [];
  const ev = [...(rec.evidenceSnapshot || []), ...((rec.evidenceSnapshot || []).length ? [] : prov.map((r) => `${r.label}: ${r.parts.join('; ')}`))].slice(0, 8);
  const c = rec.conditions;
  return html`<article class="brief">
    <div class="brief-actions no-print"><a href="#/records/${rec.id}">← Decision record ${rec.id}</a> <button class="btn btn-primary btn-sm" data-action="print">Print this page</button></div>
    <header class="brief-head">
      <p class="eyebrow">Decision brief · ${rec.id}</p>
      <h1>${cap ? cap.name : rec.capabilityId}: ${rec.previous ? `Level ${rec.previous.level}` : 'new'} → ${rec.option === 'retire' ? 'Retired' : `Level ${rec.next.level}`}</h1>
      <p class="brief-meta">${fmtDate(rec.date)} · ${auto ? `The AI was moved back to ${levelName(rec.next.level)} after crossing a safety limit (automatic restriction)` : html`Authorized by <strong>${who.name}</strong>, ${who.role}`} · ${levelText(rec.previous)} → <strong>${rec.option === 'retire' ? 'Retired, no operating authority' : levelText(rec.next)}</strong></p>
    </header>
    <div class="brief-grid">
      ${block('What changed', html`<p>${rec.scope}</p>${c ? html`<p class="muted">Limits: up to $${c.maxValue}${c.maxDailyTotal != null ? `, $${c.maxDailyTotal} a day in all` : ''}${c.maxDailyCount != null ? `, ${c.maxDailyCount} ${(cap && cap.actionNoun) || 'actions'} a day in all` : ''}${c.noFraudFlag ? ', no fraud flag' : ''}${c.noChargeback ? ', no chargeback' : ''}${c.policyClear ? ', clear policy' : ''}, confidence at least ${c.minConfidence}% (model-reported, not verified).</p>` : ''}`)}
      ${block('Why', html`<p>${rec.rationale}</p>`)}
      ${block('The evidence', ev.length ? html`<ul class="brief-list">${ev.map((e) => html`<li>${e}</li>`)}</ul>` : none('No evidence snapshot was recorded.'))}
      ${block('Where people stood', auto ? none('Not applicable: no person decided this.') : disagreement(state, rec))}
      ${block('Expected impact', rec.expectedOutcomes && rec.expectedOutcomes.length
        ? html`<ul class="brief-list">${rec.expectedOutcomes.map((o) => html`<li><strong>${o.metric}:</strong> ${o.target}</li>`)}</ul>`
        : none(auto || !(rec.previous && rec.next.level > rec.previous.level) ? 'Not applicable: authority did not expand.' : 'Not recorded: this decision was made before expected outcomes were required.'))}
      ${block('Risk', risk(rec))}
      ${block('What we\'ll watch', watch(rec))}
      ${block('When it gets pulled back', pullBack(state, rec))}
    </div>
    <p class="brief-foot muted">Built only from decision record ${rec.id} and the rules and stakeholders in place on that date, so it reads the same later. Authority Lab · ${isDemoWorkspace(state) ? 'fictional demo data' : workspaceOf(state).name}.</p>
  </article>`;
}
