import * as seed from '../data/seed.js';
import { html, raw, badge, section, notice, kv, authorityBadge, fmtDate, person, personAt, rightsNote, authorityText, lede } from '../ui.js';
import { getCapability, capData, readiness, authorityLabel, canAuthorize, conditionsPreview, scopeText, nextAuthority, amendmentsAfterEvidenceFor, KIND_LABELS, VERSIONED_KINDS, actor, requirementLabel, decisionRequired, proposedAuthority, reviewForRecord, workspaceOf, workflowOf, namesAtRecord, barChangesSinceDecisionOpened, isExpansion, outcomeChecks, OUTCOMES_MIN, OUTCOMES_MAX, rolloutChecks, ROLLOUT_REVIEW_WITHIN_DAYS, activePeople, rationaleOk, levelName, reviewNeeded, LEVEL_PLAIN } from '../store/index.js';
import { whatWeKnow } from './cap-decide.js';
import { optionLabel } from './cap-history.js';
import { externalRecordList } from './provenance.js';

// What a proposed change is about, in a sentence: "a target change".
const KIND_NOUN = { contract: 'rule', criteria: 'target', stakeholders: 'stakeholder' };
// What the AI acts on, e.g. "refunds" (the capability's own noun).
const actionNoun = (cap) => (cap && cap.actionNoun) || 'actions';

export function decisionsListView(state) {
  const records = state.decisionRecords.slice().reverse();
  const pending = state.capabilities.filter((c) => decisionRequired(state, c.id));
  const reviews = state.capabilities.filter((c) => capData(state, c.id).reviewRequired);
  return html`<div class="page-head">
    <div>
      <p class="eyebrow">${workspaceOf(state).name} · ${workflowOf(state).name}</p>
      <h1>Decisions</h1>
      ${lede('Every change to what an AI is allowed to do: who decided, why, and what evidence they saw.', 'Records can\'t be edited. A later decision adds a new record and leaves the old one as it was.')}
    </div>
    ${pending.length === 1 ? html`<div class="page-actions"><a class="btn btn-primary" href="#/capabilities/${pending[0].id}/decision">Open the decision</a></div>` : ''}
  </div>
  ${pending.map((c) => notice('decision', `Decision needed: ${c.name}`, `Someone has proposed moving ${c.name} from ${authorityLabel(c.authority)} to ${authorityLabel(proposedAuthority(state, c.id))}. ${readiness(state, c.id).met} of ${readiness(state, c.id).total} checks met.`, { link: `#/capabilities/${c.id}/decision`, linkText: 'Open' }))}
  ${state.capabilities.flatMap((c) => capData(state, c.id).proposals.filter((p) => p.status === 'open').map((p) => notice('watch', `Approval needed: ${c.name}`, `${person(p.proposedBy).name} proposed a ${KIND_NOUN[p.kind]} change. ${requirementLabel(p.required, p.approvals)}.`, { link: `#/capabilities/${c.id}/proposals/${p.id}`, linkText: 'Open' })))}
  ${reviews.map((c) => notice('fail', `Review needed before ${c.name} gets more authority`, `The AI was moved back to ${levelName(c.authority.level)} after crossing a safety limit. Before it can get more authority again, the owner or a Risk approver needs to record what happened and what changed (the post-incident review).`, { link: `#/capabilities/${c.id}?tab=monitor`, linkText: 'Record the review' }))}
  <div class="card table-card"><table class="table">
    <thead><tr><th>Record</th><th>Capability</th><th>Date</th><th>Change</th><th>Decision</th><th>Decided by</th></tr></thead>
    <tbody>${records.map((x) => html`<tr>
      <td><a href="#/records/${x.id}"><strong>Authority change #${String(x.number).padStart(2, '0')}</strong></a></td>
      <td>${getCapability(state, x.capabilityId).name}</td>
      <td>${fmtDate(x.date)}</td>
      <td>${x.previous ? html`${authorityText(x.previous, { short: true })} → ` : html`<span class="muted">New → </span>`}${authorityText(x.next, { short: true })}${x.previous && x.next.level < x.previous.level ? html` <span class="badge badge-restricted">Reduced</span>` : ''}</td>
      <td>${optionLabel(x.option)}</td>
      <td>${personAt(x.authorizedByAt, x.authorizedBy).name}</td>
    </tr>`)}</tbody>
  </table></div>`;
}

// What still stands between the person and recording (#96): each part of
// the decision done or not, with its first problem. canAuthorize stays the
// only judge: anything it refuses that no part explains is listed too.
export function checklist(state, cap, dec, check) {
  const expanding = isExpansion(state, cap.id, dec.option);
  const oc = expanding ? outcomeChecks(dec.outcomes) : null;
  const rc = expanding ? rolloutChecks(state, dec.rollout) : null;
  const items = [
    { label: dec.option ? `Decision: ${plainChoice(state, cap, dec.option)}` : 'Decision', ok: Boolean(dec.option), why: 'Choose one under "Your decision".' },
    ...(hasLimitsStep(state, cap, dec.option) ? [{ label: 'Limits', ok: true, why: '' }] : []),
    ...(expanding ? [{ label: 'What should improve', ok: oc.ok, why: oc.errors[0] }, { label: 'Rollout plan', ok: rc.ok, why: rc.errors[0] }] : []),
    { label: 'Your reason', ok: rationaleOk(dec.rationale), why: 'Say why you\'re making this decision (a sentence or more).' },
  ];
  const explained = items.some((i) => !i.ok);
  const extra = !check.ok && !explained ? html`<li class="check-item is-blocked"><span class="check-mark" aria-hidden="true">✗</span> ${check.reason}</li>` : '';
  return html`<ul class="checklist decide-review" role="status" aria-label="Before you record">${items.map((i) => html`<li class="check-item ${i.ok ? 'is-done' : 'is-blocked'}"><span class="check-mark" aria-hidden="true">${i.ok ? '✓' : '✗'}</span> <strong>${i.label}</strong>${i.ok ? '' : html`<span class="muted small">: ${i.why}</span>`}</li>`)}${extra}</ul>`;
}

// The rollout plan for an expansion (C1): every field required.
function rolloutCard(state, cap, dec) {
  const p = dec.rollout || {};
  const rc = rolloutChecks(state, p);
  const field = (key, label, input) => html`<label class="field field-stack"><span>${label}</span>${input}</label>`;
  const attrs = (key) => raw(`data-action="set-rollout" data-capability="${cap.id}" data-field="${key}"`);
  return html`<div class="card rollout">
    <div class="rollout-grid">
      ${field('owner', 'Rollout owner', html`<select ${attrs('owner')}><option value="" ${p.owner ? '' : raw('selected')}>Choose a person</option>${Object.entries(activePeople(state)).map(([k, v]) => html`<option value="${k}" ${p.owner === k ? raw('selected') : ''}>${v.name} · ${v.role}</option>`)}</select>`)}
      ${field('startDate', 'Start date', html`<input type="date" value="${p.startDate || ''}" min="${state.today}" ${attrs('startDate')}>`)}
      ${field('reviewDate', `Review date (within ${ROLLOUT_REVIEW_WITHIN_DAYS} days of the start)`, html`<input type="date" value="${p.reviewDate || ''}" ${attrs('reviewDate')}>`)}
      ${field('feedbackChannel', 'Feedback channel', html`<input type="text" maxlength="120" value="${p.feedbackChannel || ''}" placeholder="e.g. #refund-ai-feedback" ${attrs('feedbackChannel')}>`)}
    </div>
    ${field('scope', 'Scope: where it starts', html`<textarea rows="3" maxlength="300" placeholder="e.g. UK refunds under $50, weekdays only" ${attrs('scope')}>${p.scope || ''}</textarea>`)}
    ${field('reviewerNotes', 'What reviewers need to know (the people checking the automated work)', html`<textarea rows="4" maxlength="600" ${attrs('reviewerNotes')}>${p.reviewerNotes || ''}</textarea>`)}
    ${dec.rolloutPrefilled ? html`<p class="muted small"><strong>Prefilled for the demo.</strong> Edit it before you decide.</p>` : ''}
    ${rc.ok ? '' : html`<ul class="form-error plain-list">${rc.errors.map((e) => html`<li>${e}</li>`)}</ul>`}
  </div>`;
}

// The rollout plan as it stands on a record, or as it applies to a capability.
export function rolloutList(plan) {
  const o = plan.ownerAt || {};
  return html`<ul class="plain-list">
    <li><strong>Owner:</strong> ${o.name || plan.owner}${o.title ? `, ${o.title}` : ''}</li>
    <li><strong>Scope:</strong> ${plan.scope}</li>
    <li><strong>Starts:</strong> ${fmtDate(plan.startDate)} · <strong>Review:</strong> ${fmtDate(plan.reviewDate)}</li>
    <li><strong>Feedback:</strong> ${plan.feedbackChannel}</li>
    <li><strong>What reviewers need to know:</strong> ${plan.reviewerNotes}</li>
  </ul>`;
}

function impactCard(cap, dec) {
  const rows = Array.from({ length: OUTCOMES_MAX }, (_, i) => (dec.outcomes || [])[i] || { metric: '', target: '' });
  const oc = outcomeChecks(rows);
  return html`<div class="card impact">
    <div class="impact-rows">
      <span class="fact-label">What should improve</span><span class="fact-label">Target (with a number)</span>
      ${rows.map((o, i) => html`<input type="text" maxlength="80" aria-label="Target ${i + 1}: what should improve" placeholder="${i === 0 ? 'e.g. Resolution time' : ''}" value="${o.metric}" data-action="set-outcome" data-capability="${cap.id}" data-index="${i}" data-field="metric"><input type="text" maxlength="60" aria-label="Target ${i + 1}: number" placeholder="${i === 0 ? 'e.g. at least 35% faster' : ''}" value="${o.target}" data-action="set-outcome" data-capability="${cap.id}" data-index="${i}" data-field="target">`)}
    </div>
    ${dec.outcomesPrefilled ? html`<p class="muted small"><strong>Prefilled for the demo,</strong> a little above the pilot results. Edit them before you decide.</p>` : ''}
    ${oc.ok ? html`<p class="muted small">${oc.outcomes.length} target${oc.outcomes.length === 1 ? '' : 's'} set. Monitoring will compare them with the actual results.</p>` : html`<ul class="form-error plain-list">${oc.errors.map((e) => html`<li>${e}</li>`)}</ul>`}
  </div>`;
}

export function decisionRecordView(state, id) {
  const x = state.decisionRecords.find((r) => r.id === id);
  if (!x) return html`<div class="page-head"><h1>Record not found</h1></div>`;
  const cap = getCapability(state, x.capabilityId);
  const who = personAt(x.authorizedByAt, x.authorizedBy);
  const ownerAt = personAt(x.ownerAt, x.owner);
  const auto = x.authorizedBy === 'system';
  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/records">Decisions</a> · ${auto ? 'Automatic restriction' : 'Decided by a person'}</p>
      <h1>Authority change #${String(x.number).padStart(2, '0')}</h1>
      <p class="lede"><a href="#/capabilities/${cap.id}">${cap.name}</a> · ${fmtDate(x.date)} · ${recordNames(state, x)}</p>
    </div>
    <a class="btn btn-sm" href="#/records/${x.id}/brief">Decision brief (one page)</a>
  </div>
  ${auto ? notice('fail', `${(getCapability(state, x.capabilityId) || { name: 'This capability' }).name} was moved back to ${levelName(x.next.level)} after crossing a safety limit.`, 'No one made this change by hand. It followed a rule people agreed in advance ("Automation is pulled back if…"). People decide when autonomy expands; software pulls it back on its own when a limit is crossed. Formally, this is an automatic restriction.') : ''}
  ${auto && reviewForRecord(state, x.id) ? (() => { const rv = reviewForRecord(state, x.id); return notice('pass', `Reviewed by ${personAt(rv.byAt, rv.by).name} on ${fmtDate(rv.date)} (${rv.id})`, `What happened: ${rv.cause} What changed: ${rv.changes} The review is saved separately; this record stays as it was.`, { link: `#/capabilities/${cap.id}?tab=monitor`, linkText: 'See the review' }); })() : auto && capData(state, cap.id).reviewRequired ? notice('watch', 'Not reviewed yet', 'The owner or a Risk approver needs to record what happened and what changed (the post-incident review) on the Monitoring tab. Until then the AI can\'t get more authority.', { link: `#/capabilities/${cap.id}?tab=monitor`, linkText: 'Record the review' }) : ''}
  <div class="card record">
    <div class="record-change">
      <div><span class="fact-label">Previous</span>${x.previous ? authorityBadge(x.previous) : html`<span class="muted">None (new capability)</span>`}</div>
      <span class="record-arrow" aria-hidden="true">→</span>
      <div><span class="fact-label">New</span>${authorityBadge(x.next)}</div>
      <div><span class="fact-label">Decision</span><strong>${optionLabel(x.option)}</strong></div>
      <div><span class="fact-label">${auto ? 'Applied by' : 'Authorized by'}</span><strong>${who.name}</strong><div class="muted small">${who.role}${who.team ? html`, ${who.team}` : ''}${rightsNote(x.authorizedByAt)}</div></div>
      ${x.owner && x.owner !== x.authorizedBy ? html`<div><span class="fact-label">Owner</span><strong>${ownerAt.name}</strong><div class="muted small">${ownerAt.role}${ownerAt.team ? html`, ${ownerAt.team}` : ''}</div></div>` : ''}
    </div>
    ${kv([
      ['Scope', x.scope],
      ['Rationale', x.rationale],
      ['Evidence at the time', html`<ul class="plain-list">${x.evidenceSnapshot.map((e) => html`<li>${e}</li>`)}</ul>`],
      // #119: imported evidence in force, with the configuration it describes.
      ...(x.externalEvidence && x.externalEvidence.length ? [['Imported evidence', externalRecordList(x.externalEvidence)]] : []),
      ['Still to resolve', x.openCondition],
      // B1: what an expansion was expected to achieve, fixed on the record.
      ...(x.expectedOutcomes && x.expectedOutcomes.length
        ? [['Expected impact', html`<ul class="plain-list">${x.expectedOutcomes.map((o) => html`<li><strong>${o.metric}:</strong> ${o.target}</li>`)}</ul>${x.outcomesPrefilled ? html`<p class="muted small">Prefilled for the demo.</p>` : ''}`]]
        : x.previous && x.next && x.next.level > x.previous.level && x.authorizedBy !== 'system'
          ? [['Expected impact', html`<span class="muted">Not recorded: this decision was made before expected outcomes were required.</span>`]]
          : []),
      // C1: how the expansion went into service.
      ...(x.rolloutPlan
        ? [['Rollout plan', html`${rolloutList(x.rolloutPlan)}${x.rolloutPrefilled ? html`<p class="muted small">Prefilled for the demo.</p>` : ''}`]]
        : x.previous && x.next && x.next.level > x.previous.level && x.authorizedBy !== 'system'
          ? [['Rollout plan', html`<span class="muted">Not recorded: this decision was made before rollout plans were required.</span>`]]
          : []),
      ...(x.conditions ? [['Limits: the AI could act on its own when', html`<ul class="plain-list">
        <li>the amount is $${x.conditions.maxValue} or less</li>
        ${x.conditions.noFraudFlag ? html`<li>no fraud flag</li>` : ''}
        ${x.conditions.policyClear ? html`<li>policy eligibility is clear</li>` : ''}
        ${x.conditions.maxDailyTotal != null ? html`<li>at most $${x.conditions.maxDailyTotal} a day across all customers</li>` : ''}
        ${x.conditions.maxDailyCount != null ? html`<li>at most ${x.conditions.maxDailyCount} ${actionNoun(cap)} a day across all customers</li>` : ''}
        <li>confidence at least ${x.conditions.minConfidence}% <span class="muted small">(model-reported, not verified)</span></li>
        ${x.conditions.noChargeback ? html`<li>no active chargeback</li>` : ''}
      </ul>`]] : []),
    ])}
    ${x.versions ? html`<div class="record-foot"><span class="fact-label">Based on</span><div class="based-on">${VERSIONED_KINDS.map((k) => x.versions[k] ? html`<a href="#/capabilities/${cap.id}/versions?kind=${k}&version=${x.versions[k]}">${KIND_LABELS[k]} v${x.versions[k]}</a>` : html`<span class="muted">${KIND_LABELS[k]}: none yet</span>`)}</div></div>` : ''}
    ${amendedNote(state, x)}
    <p class="muted small record-foot">Record ${x.id}${x.sequence ? html`, record ${x.sequence} for ${cap.name}` : ''}, written ${fmtDate(x.date)}. Records can't be edited; a later decision adds a new one. Names and roles are shown as they were on that date.</p>
  </div>`;
}

// The workspace and workflow as named when the record was written (#60), with
// today's names alongside if they have changed since.
function recordNames(state, record) {
  const then = namesAtRecord(state, record);
  const label = `${then.workspace.name} · ${then.workflow.name}`;
  const now = `${workspaceOf(state).name} · ${workflowOf(state).name}`;
  return label === now ? label : html`${label} <span class="muted small">(as named then; now ${now})</span>`;
}

// The bar as it changed since this decision opened (roadmap item 8): every
// newer version of the criteria or requirements, each changed row marked
// stricter, looser or changed, with who did it and how it was approved.
export function barChangedNote(state, cap) {
  const changes = barChangesSinceDecisionOpened(state, cap.id);
  if (!changes.length) return '';
  const word = { stricter: 'made stricter', looser: 'made easier to meet', changed: 'changed', added: 'added', removed: 'removed' };
  return html`<div class="notice notice-watch" role="status"><div class="notice-body"><strong>Targets or decision requirements changed after this decision was opened</strong>
    <ul class="plain-list">${changes.map((c) => html`<li>${c.kind === 'criteria' ? 'Targets' : 'Decision requirements'} v${c.version}, ${fmtDate(c.date)}, ${personAt(c.authorAt, c.author).name}${c.proposalId ? html` (approved, <a href="#/capabilities/${cap.id}/proposals/${c.proposalId}">${c.proposalId}</a>)` : c.tighteningOnly ? ' (made stricter only, no approval needed)' : ''}: ${c.rows.length ? c.rows.map((r, i) => html`${i ? '; ' : ''}${r.label} ${word[r.change]}${r.from && r.to ? ` (${r.from} → ${r.to})` : ''}`) : 'nothing changed'}.</li>`)}</ul>
    <p class="small">"Ready for a decision?" uses the targets and checks as they are now.</p></div>
    <a class="notice-link" href="#/capabilities/${cap.id}/versions?kind=criteria">See history</a></div>`;
}

// Shown on a decision when the criteria or evidence requirements it relied on
// were amended after performance results had been seen.
export function amendedNote(state, record) {
  const amended = amendmentsAfterEvidenceFor(state, record);
  if (!amended.length) return '';
  const cap = getCapability(state, record.capabilityId);
  return notice('watch', 'Targets changed after results were seen', `This decision was judged against targets or checks that changed after the results were in. Check that the change was justified. ${amended.map((a) => `${person(a.author).name} changed the ${KIND_NOUN[a.kind] === 'target' ? 'targets' : 'decision requirements'} (v${a.version}): ${a.reason}`).join(' ')}`, { link: `#/capabilities/${cap.id}/versions?kind=${amended[0].kind}&version=${amended[0].version}`, linkText: 'See the change' });
}

// ---------------------------------------------------------------------------
// The Decide tab (redesign, 2026-10-12): one reading direction and one action
// at the end. canAuthorize stays the only judge of whether it can be recorded.
// ---------------------------------------------------------------------------

const optionName = (option) => (seed.DECISION_OPTIONS.find((o) => o.id === option) || { name: option }).name;
const familyOf = (option) => ({ expand: 'expand', 'expand-limits': 'expand', hold: 'hold', restrict: 'reduce', suspend: 'reduce', redesign: 'redesign' }[option] || null);

// Limits only mean something from Act within limits up; a move to Draft or
// below has a person approving every action anyway.
function hasLimitsStep(state, cap, option) {
  return option === 'expand-limits' && nextAuthority(option, cap.authority, proposedAuthority(state, cap.id)).level >= 3;
}

// The person's words for a recorded option, from where it would move.
function plainOption(option, previous, next) {
  switch (option) {
    case 'expand-limits': return next.level < 3 ? `Expand autonomy, to ${levelName(next.level)}` : 'Expand autonomy, within limits';
    case 'expand': return next.level < 3 ? `Expand autonomy, to ${levelName(next.level)}` : 'Expand autonomy, broadly';
    case 'hold': return 'Keep current limits';
    case 'restrict': return `Reduce autonomy one level, to ${levelName(next.level)}`;
    case 'suspend': return 'Reduce autonomy all the way, to Observe';
    case 'redesign': return 'Pause and redesign';
    default: return optionLabel(option);
  }
}

export function plainChoice(state, cap, option) {
  return plainOption(option, cap.authority, nextAuthority(option, cap.authority, proposedAuthority(state, cap.id)));
}

const RECOMMENDED = { 'expand-limits': 'expand autonomy within limits', expand: 'expand autonomy broadly', hold: 'keep current limits', restrict: 'reduce autonomy one level', suspend: 'reduce autonomy all the way, to Observe', redesign: 'pause and redesign' };

const join = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
const upper = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// What runs automatically now, and what still needs human review, once a
// decision is recorded. From the record, never from the open decision.
function nowSentence(cap, rec) {
  const noun = actionNoun(cap);
  const c = rec.conditions;
  const prefix = rec.option === 'hold' ? 'No change. ' : rec.next.level < rec.previous.level ? `Autonomy reduced to ${levelName(rec.next.level)}. ` : '';
  if (rec.next.level === 3 && c) {
    const caps = [c.maxDailyTotal != null ? `$${c.maxDailyTotal}` : null, c.maxDailyCount != null ? `${c.maxDailyCount} ${noun}` : null].filter(Boolean);
    const review = ['larger', ...(c.noFraudFlag ? ['fraud-flagged'] : []), ...(c.noChargeback ? ['chargeback'] : []), ...(c.policyClear ? ['unclear-policy'] : [])];
    return `${prefix}Standard ${noun} up to $${c.maxValue} now run automatically${caps.length ? `, capped at ${caps.join(' and ')} a day` : ''}. Everything else, including ${join(review)} cases, still needs human review.`;
  }
  const by = [
    'Nothing runs automatically, and nothing is produced. People do all the work.',
    'Nothing runs automatically. Suggestions only: a person decides and acts on every case.',
    `Nothing runs automatically. ${upper(noun)} are drafted, and a person approves every one before anything happens.`,
    `${upper(noun)} within the approved limits run automatically. Everything else needs human review.`,
    `Most ${noun} now run automatically. Anything the rules send to a person still needs human review.`,
  ];
  return `${prefix}${by[rec.next.level] || ''}`;
}

// Can a move one level up be proposed from here? Offered for the first moves
// (up to Draft), once the tests have run and no review is pending, as before
// the redesign. proposeAuthority still checks everything itself.
function proposable(state, cap, d, review) {
  return cap.status !== 'not-delegated' && cap.authority.level < 2 && Boolean(d.testRun.lastRun) && !review.any;
}

const proposeButton = (cap) => html`<button class="btn btn-primary" data-action="propose-authority" data-capability="${cap.id}" data-level="${cap.authority.level + 1}">Propose a move to Level ${cap.authority.level + 1}</button>`;

function recordedView(state, cap, rec) {
  const who = personAt(rec.authorizedByAt, rec.authorizedBy);
  const expanded = rec.next.level > rec.previous.level;
  return html`<div class="decide-flow">
    <div class="decide-recorded" role="status">
      <p class="decide-big">Decision recorded: ${plainOption(rec.option, rec.previous, rec.next)}</p>
      <p class="muted">${who.name} · ${fmtDate(rec.date)}</p>
      <p>${nowSentence(cap, rec)}</p>
      <p class="small"><a href="#/records/${rec.id}">See the decision record</a></p>
    </div>
    <p class="next-step"><a href="#/capabilities/${cap.id}?tab=monitor">${expanded ? 'Next: monitor the rollout →' : 'Next: check it in Monitor →'}</a></p>
  </div>`;
}

function noDecisionView(state, cap, d, { runs }) {
  const review = reviewNeeded(state, cap.id);
  const records = state.decisionRecords.filter((x) => x.capabilityId === cap.id);
  const last = records.at(-1);
  if (d.decision.recordId && last && last.id === d.decision.recordId && !review.any) return recordedView(state, cap, last);
  const n = cap.authority.level + 1;
  const tests = `#/capabilities/${cap.id}?tab=decide&show=tests`;
  let lead;
  if (review.any) {
    // Said once here; Monitor holds the review itself.
    lead = notice('restricted', 'A review comes first', review.restriction
      ? `${cap.name} was moved back to ${levelName(cap.authority.level)} after crossing a safety limit. Autonomy can't expand again until someone records what happened and what changed.`
      : 'A safety rule was crossed. Autonomy can\'t expand until someone records what happened and what changed.', { link: `#/capabilities/${cap.id}?tab=monitor`, linkText: 'Record the review' });
  } else if (proposable(state, cap, d, review)) {
    lead = html`<div class="decide-start"><h2>Ready to propose Level ${n}, ${levelName(n)}</h2>
      <p>${LEVEL_PLAIN[n]} A named person makes the call, and the decision is recorded.</p>
      ${proposeButton(cap)}</div>`;
  } else {
    const why = cap.status === 'not-delegated' ? 'This work is kept with people by design, so there is nothing to decide.'
      : n > 4 ? 'It already has the most autonomy there is.'
        : !d.testRun.lastRun ? html`Run the tests first. Then a move to Level ${n}, ${levelName(n)}, can be proposed. <a href="${tests}">Go to the tests</a>`
          : html`No one has proposed a move to Level ${n}, ${levelName(n)}, yet.`;
    lead = html`<div class="decide-start"><h2>No decision is open</h2><p>${why}</p></div>`;
  }
  return html`<div class="decide-flow">
    ${lead}
    <section class="decide-step"><h2>What do we know?</h2>${whatWeKnow(state, cap, { runs })}</section>
    ${last ? html`<p class="muted small">Last decision: <a href="#/records/${last.id}">${optionLabel(last.option)}, ${fmtDate(last.date)}</a>. Every decision is in <a href="#/capabilities/${cap.id}?tab=history">History</a>.</p>` : ''}
  </div>`;
}

// The Decide tab's body: the open decision as one flow, the decision just
// recorded, or what has to happen before there is one. Kept under its old
// name; #/capabilities/<id>/decision renders the Decide tab.
export function decisionWorkspaceView(state, capabilityId, query = new URLSearchParams(), { runs = null } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) return html`<p class="empty">We couldn't find that capability.</p>`;
  const d = capData(state, capabilityId);
  if (!decisionRequired(state, capabilityId)) return noDecisionView(state, cap, d, { runs });

  const dec = d.decision;
  const proposed = proposedAuthority(state, capabilityId);
  const check = canAuthorize(state, capabilityId);
  const rec = d.recommendation;
  const authorizer = person(actor(state, cap.id));
  const noun = actionNoun(cap);
  const cur = cap.authority.level;
  const oneUp = proposed.level === cur + 1;
  const fam = familyOf(dec.option);
  const expanding = isExpansion(state, cap.id, dec.option);
  const limits = hasLimitsStep(state, cap, dec.option);
  const c = dec.conditions;

  let n = 0;
  const step = (title, body, { id, sub } = {}) => html`<section class="decide-step"${id ? html` id="${id}"` : ''}><p class="decide-step-n">Step ${++n}</p><h2>${title}</h2>${sub ? html`<p class="muted small decide-step-sub">${sub}</p>` : ''}${body}</section>`;

  // Step 1: the change, as behaviour first and level second.
  const side = (label, level, limited, cls) => html`<div class="decide-${cls}"><span class="muted small">${label}</span><strong>${LEVEL_PLAIN[level]}</strong><span class="muted small">Level ${level} · ${levelName(level)}${limited && level !== 3 ? ' (limited)' : ''}</span></div>`;
  const change = html`<div class="decide-change">${side('Now', cur, cap.authority.limited, 'from')}<span class="decide-arrow" aria-hidden="true">→</span>${side('Proposed', proposed.level, proposed.limited, 'to')}</div>`;

  // Step 3: the recommendation, in the person's words.
  const recConditions = (seed.capabilityData[cap.id] || {}).defaultConditions || c;
  const recDetail = rec && rec.option === 'expand-limits'
    ? `Allow standard ${noun} up to $${recConditions.maxValue} to run automatically. Keep high-value ${noun} under human review.`
    : rec ? rec.summary : '';
  const recommendation = rec ? html`<div class="decide-rec">
    <p><strong>Recommended: ${RECOMMENDED[rec.option] || optionName(rec.option).toLowerCase()}.</strong></p>
    <p>${recDetail}</p>
    <p class="muted small">Worked out from the evidence. You decide.</p>
    ${rec.rationale && rec.rationale.length ? html`<details class="how"><summary>How it was worked out</summary><ul class="plain-list">${rec.rationale.map((x) => html`<li>${x}</li>`)}</ul></details>` : ''}
  </div>` : '';

  // Step 4: four plain choices. Expand and Reduce ask a second question;
  // nothing is chosen for the person. Each final choice says which recorded
  // option it is. A choice that isn't open says why, right there.
  const leaf = (option, label) => html`<label class="decide-leaf"><input type="radio" name="decision-option" value="${option}" data-action="select-option" data-capability="${cap.id}" ${dec.option === option ? raw('checked') : ''}><span>${label}</span><span class="decide-maps">recorded as “${optionName(option)}”</span></label>`;
  const choice = (key, title, desc, { option = null, subs = null, hint = '', note = '', disabled = false } = {}) => html`<div class="decide-choice ${fam === key ? 'is-on' : ''} ${disabled ? 'is-disabled' : ''}">
    <label class="decide-choice-main"><input type="radio" class="decide-family" name="decide-family" value="${option || key}" data-family="${key}" ${option ? raw(`data-action="select-option" data-capability="${cap.id}"`) : ''} ${fam === key ? raw('checked data-stored') : ''} ${disabled ? raw('disabled') : ''}><span><strong>${title}</strong><span class="decide-choice-desc">${desc}</span></span></label>
    ${option ? html`<span class="decide-maps">recorded as “${optionName(option)}”</span>` : ''}
    ${subs ? html`<div class="decide-sub" role="radiogroup" aria-label="${title}: which">${subs}</div><p class="decide-hint">${hint}</p>` : ''}
    ${note ? html`<p class="decide-note">${note}</p>` : ''}
  </div>`;
  const expandChoice = !oneUp
    ? choice('expand', 'Expand autonomy', 'Let more of this work run automatically.', { disabled: true, note: `Not available: this decision was opened for Level ${proposed.level}, but ${cap.name} is now at Level ${cur}. Expanding goes one level at a time, so Level ${cur + 1} has to be proposed instead.` })
    : proposed.level < 3
      ? choice('expand', 'Expand autonomy', `Move to ${levelName(proposed.level)}: ${LEVEL_PLAIN[proposed.level]}`, { option: 'expand', note: d.reviewRequired ? 'Not available until the review after the automatic restriction is recorded.' : '' })
      : choice('expand', 'Expand autonomy', `Let more of this work run automatically, at Level ${proposed.level}.`, {
        subs: html`${leaf('expand-limits', 'Within limits')}${leaf('expand', 'Broad autonomy')}`,
        hint: 'Choose one: within limits, or broad autonomy.',
        note: d.reviewRequired ? 'Not available until the review after the automatic restriction is recorded.' : '',
      });
  const reduceChoice = cur === 0
    ? choice('reduce', 'Reduce autonomy', 'Move it down the ladder.', { disabled: true, note: 'Not available: it is already at Observe, the lowest level.' })
    : choice('reduce', 'Reduce autonomy', 'Move it down the ladder.', {
      subs: html`${leaf('restrict', `One level down${cur > 1 ? `, to ${levelName(cur - 1)}` : ''}`)}${leaf('suspend', 'All the way back to Observe')}`,
      hint: cur === 1 ? 'Choose one. From Recommend, both end at Observe; the record keeps which you chose.' : 'Choose how far: one level down, or all the way back to Observe.',
    });
  const choices = html`<div class="decide-choices">
    ${expandChoice}
    ${choice('hold', 'Keep current limits', `Stay at ${levelName(cur)} while more evidence comes in.`, { option: 'hold' })}
    ${reduceChoice}
    ${choice('redesign', 'Pause and redesign', 'Stop all automation while it is reworked and tested again.', { option: 'redesign' })}
  </div>`;
  const next = dec.option ? nextAuthority(dec.option, cap.authority, proposed) : null;
  const preview = !dec.option ? ''
    : limits ? html`<p class="decide-means"><strong>What this would mean:</strong> ${conditionsPreview(c, cap)}</p>`
      : html`<p class="decide-means"><strong>What this would mean:</strong> ${scopeText(dec.option, c, cap, next)}${next.level !== cur || next.limited !== cap.authority.limited ? html` <span class="muted small">${cap.name} would move from ${authorityLabel(cap.authority)} to ${authorityLabel(next)}.</span>` : ''}</p>`;

  // Limits: when the automation may act on its own.
  const conditions = limits ? html`<div class="condition-grid">
      <label class="field"><span>Maximum amount (each)</span><span class="input-prefix">$<input type="number" min="5" max="500" step="5" value="${c.maxValue}" data-action="set-condition" data-capability="${cap.id}" data-key="maxValue"></span></label>
      <label class="field"><span>Daily total (all customers)</span><span class="input-prefix">$<input type="number" min="0" max="100000" step="50" value="${c.maxDailyTotal ?? ''}" data-action="set-condition" data-capability="${cap.id}" data-key="maxDailyTotal"></span></label>
      <label class="field"><span>Daily number (all customers)</span><span class="input-suffix"><input type="number" min="0" max="10000" step="1" value="${c.maxDailyCount ?? ''}" data-action="set-condition" data-capability="${cap.id}" data-key="maxDailyCount"> ${noun}</span></label>
      <label class="field"><span>Minimum confidence <span class="muted small">(model-reported, not verified)</span></span><span class="input-suffix"><input type="number" min="50" max="99" step="1" value="${c.minConfidence}" data-action="set-condition" data-capability="${cap.id}" data-key="minConfidence">%</span></label>
      <label class="check"><input type="checkbox" ${c.noFraudFlag ? raw('checked') : ''} data-action="set-condition" data-capability="${cap.id}" data-key="noFraudFlag"><span>No fraud flag on the account</span></label>
      <label class="check"><input type="checkbox" ${c.policyClear ? raw('checked') : ''} data-action="set-condition" data-capability="${cap.id}" data-key="policyClear"><span>Policy eligibility is clear (no exception needed)</span></label>
      <label class="check"><input type="checkbox" ${c.noChargeback ? raw('checked') : ''} data-action="set-condition" data-capability="${cap.id}" data-key="noChargeback"><span>No active chargeback</span></label>
    </div>
    <p class="muted small">Once the daily total or number is reached, further ${noun} go to a person. Confidence is model-reported: it is checked against your minimum but can't be verified, and a high score never lets an action through on its own.</p>
    ${!c.noFraudFlag ? notice('fail', 'Fraud-flagged accounts would be handled without a person.', 'Your rules send fraud-flagged accounts to a person. Those cases would still be stopped, but your limits should match your rules: tick "No fraud flag on the account".') : ''}
    ${c.maxValue > 100 ? notice('watch', 'This is above the $100 limit in your rules.', readiness(state, cap.id).unmet.length ? `The check "${readiness(state, cap.id).unmet[0].text}" isn't met yet (currently ${readiness(state, cap.id).unmet[0].current}).` : '') : ''}` : '';

  const reason = html`<label class="field field-stack"><span class="sr-only">Your reason</span><textarea rows="4" aria-label="Your reason" data-action="set-rationale" data-capability="${cap.id}">${dec.rationale}</textarea></label>`;

  const record = html`${checklist(state, cap, dec, check)}
    <button class="btn btn-primary decide-record" data-action="authorize" data-capability="${cap.id}" ${check.ok ? '' : raw('disabled')}>Record decision as ${authorizer.name}</button>
    <p class="muted small">${dec.option ? html`Recorded as “${optionName(dec.option)}”, with your name (${authorizer.name}, ${authorizer.role}), your reason and this evidence.` : 'Your name, your reason and this evidence are recorded with the decision.'} Records can't be edited.</p>`;

  return html`<div class="decide-flow">
    <div class="decide-head"><h2>Should we expand autonomy for this capability?</h2><p class="muted">A named person makes the call, and the decision is recorded.</p></div>
    ${step('What are we deciding?', change)}
    ${step('What do we know?', whatWeKnow(state, cap, { runs }))}
    ${rec ? step('Recommendation', recommendation) : ''}
    ${step('Your decision', html`${choices}<p class="decide-pending">Finish your choice above to continue.</p><div class="decide-after-means">${preview}</div>`, { id: 'decide-choice' })}
    <div class="decide-after">
      ${limits ? step('Limits', conditions, { sub: `${upper(noun)} run automatically only when all of these are true. Anything else goes to human review.` }) : ''}
      ${expanding ? step('What should improve?', impactCard(cap, dec), { sub: `${OUTCOMES_MIN}–${OUTCOMES_MAX} measurable goals, compared with real results after rollout. They can't be changed after you decide.` }) : ''}
      ${expanding ? step('Rollout plan', rolloutCard(state, cap, dec), { sub: 'Who runs the rollout, where it starts, and when it is reviewed. Saved with the decision; it can\'t be changed afterwards.' }) : ''}
      ${step('Why are you making this decision?', reason)}
      ${step('Review and record', record)}
    </div>
  </div>`;
}
