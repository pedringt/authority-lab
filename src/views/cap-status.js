// Status: what can this capability do now, and why? One narrative (the level
// in plain words, why it's there, what happens next and what that unlocks),
// then the actions waiting for a person, and one line each for its boundaries
// and the people involved. The full rules and every waiting action open as
// sub-views (?tab=status&show=rules, ?tab=status&show=approvals).

import { DATA_FIELDS } from '../data/seed.js';
import { setupSequence } from './setupflow.js';
import { html, badge, kv, fmtDate, person, personAt, notice, tabIntro, SWITCH_PERSON } from '../ui.js';
import { setupState, STANCES, readiness, current, versionList, criteriaSaved, needsSignoff, decisionRequired, proposedAuthority, levelName, reviewNeeded, reviewEligibility, activePeople, actor, queueApprovers, queueEligibility, QUEUE_LIMIT, readinessText, authorityGap, actsThroughGate } from '../store/index.js';
import { emptyState, nextStep } from './setup.js';
import { contractReviewView } from './contract.js';
import { proposalsList, amendLink } from './proposals.js';
import { toolWords, LEVEL_TITLE, OPTION_PLAIN, firstSentence, lowerFirst, upperFirst } from './cap-shared.js';

const list = (names) => (names.length <= 2 ? names.join(' or ') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The capability's own noun ("refunds") when the data has one.
const nounOf = (cap) => cap.actionNoun || null;

// The limits in force: the conditions on the record that granted this level.
function limitsInForce(state, cap) {
  if (!cap.authority.limited) return null;
  const rec = state.decisionRecords.filter((r) => r.capabilityId === cap.id && r.authorizedBy !== 'system' && r.next && r.next.level === cap.authority.level && r.conditions).at(-1);
  return rec ? rec.conditions : null;
}

// What a level means for this capability, in plain words. `would` phrases it
// as what would happen after a decision.
function levelSentence(cap, level, conditions, { would = false, notDelegated = false } = {}) {
  const noun = nounOf(cap);
  const v = (now, then) => (would ? then : now);
  switch (level) {
    case 0: return notDelegated
      ? 'A person handles every case. The capability sees the work but does nothing with it.'
      : v('It watches only. A person does all the work.', 'It would watch only. A person would do all the work.');
    case 1: return noun
      ? v(`It can suggest ${noun}, but a person decides and carries out every one.`, `It would suggest ${noun}, and a person would decide and carry out every one.`)
      : v('It can suggest an action, but a person still decides and carries it out.', 'It would suggest actions, and a person would decide and carry them out.');
    case 2: return noun
      ? v(`${upperFirst(noun)} are prepared automatically. A person approves every one before it takes effect.`, `${upperFirst(noun)} would be prepared automatically, and a person would approve every one before it takes effect.`)
      : v('Its work is prepared automatically. A person approves every action before it takes effect.', 'Its work would be prepared automatically, and a person would approve every action before it takes effect.');
    case 3: return conditions && conditions.maxValue != null && noun
      ? v(`Standard ${noun} up to $${conditions.maxValue} run without review. Everything else goes to human review.`, `Standard ${noun} up to $${conditions.maxValue} would run without review. Everything else stays under human review.`)
      : v('It acts on its own within the recorded limits. Everything else goes to human review.', 'It would act on its own within agreed limits. Everything else would stay under human review.');
    default: return v(`It handles most ${noun || 'cases'} on its own. A person handles the exceptions.`, `It would handle most ${noun || 'cases'} on its own, and a person would handle the exceptions.`);
  }
}

// The decision a person made that moved a capability down, while it's held there.
function heldRecord(state, cap) {
  const last = state.decisionRecords.filter((r) => r.capabilityId === cap.id).at(-1);
  return last && last.authorizedBy !== 'system' && last.previous && last.next.level < last.previous.level && cap.status === 'restricted' ? last : null;
}

// "Why it's here": the latest decision record for the capability, in words.
function whyHere(state, cap, d) {
  const rec = state.decisionRecords.filter((r) => r.capabilityId === cap.id).at(-1);
  if (!rec) {
    // Seeded capabilities with no record yet: their recorded background.
    const note = (String(cap.evidenceNote || '').match(/[^.!?]+[.!?]+/g) || []).slice(0, 2).join('').trim();
    return note || null;
  }
  const date = fmtDate(rec.date);
  const at = LEVEL_TITLE[rec.next.level];
  if (rec.authorizedBy === 'system') {
    const reading = d.monitoring && d.monitoring.breachRecordId === rec.id ? d.monitoring.reading : null;
    return `Moved back from ${LEVEL_TITLE[rec.previous.level]} automatically on ${date}. ${reading ? `It crossed a safety limit: ${reading}.` : firstSentence(rec.rationale)}`;
  }
  const who = personAt(rec.authorizedByAt, rec.authorizedBy).name;
  if (rec.option === 'retire') return `Retired by ${who} on ${date}. ${firstSentence(rec.rationale)}`;
  if (!rec.previous) {
    return rec.option === 'not-delegated'
      ? `Kept with people by ${who} on ${date} (${OPTION_PLAIN['not-delegated']}). ${firstSentence(rec.rationale)}`
      : `Added by ${who} on ${date}${rec.rationale.includes(at) ? '' : `, starting at ${at}`}. ${firstSentence(rec.rationale)}`;
  }
  // "Broadly" only describes a move to the top level.
  const option = rec.option === 'expand' && rec.next.level < 4 ? 'expand autonomy' : OPTION_PLAIN[rec.option] || rec.option;
  if (rec.next.level > rec.previous.level) {
    const p = d.pilot;
    const since = p && p.started && p.started >= rec.date;
    const results = since && p.ended
      ? `The pilot that followed is done: ${p.cases} cases, ${p.accuracy}% accurate.`
      : since ? `Its pilot has been running since ${fmtDate(p.started)}: ${p.cases} cases so far.`
        : (rec.evidenceSnapshot || []).length ? `Based on ${rec.evidenceSnapshot.slice(0, 2).join(' and ')}.` : firstSentence(rec.rationale);
    return `Moved to ${at} on ${date} by ${who} (${option}). ${results}`;
  }
  if (rec.next.level < rec.previous.level) return `Moved back from ${LEVEL_TITLE[rec.previous.level]} on ${date} by ${who} (${option}). ${firstSentence(rec.rationale)}`;
  return `Kept at ${at} on ${date} by ${who} (${option}). ${firstSentence(rec.rationale)}`;
}

// Who may record the post-incident review, and whether the person in "Demo as" is one of them.
function reviewers(state, cap) {
  return Object.keys(activePeople(state)).filter((k) => reviewEligibility(state, cap.id, k).ok);
}

// The one statement of what happens next, chosen by state in priority order,
// with what it leads to and the one link onward.
export function nextFor(state, cap, d) {
  const base = `#/capabilities/${cap.id}`;
  const review = reviewNeeded(state, cap.id);
  const by = actor(state, cap.id);
  if (review.any) {
    const who = reviewers(state, cap);
    const can = who.includes(by) ? 'You can record it.' : who.length ? `${list(who.map((k) => person(k).name))} can record it.` : 'Nobody can record it yet: name an owner or a Risk approver.';
    const auto = review.restriction && d.monitoring && d.monitoring.breachRecordId ? state.decisionRecords.find((r) => r.id === d.monitoring.breachRecordId) : null;
    return {
      kind: 'review',
      text: review.restriction
        ? `A review of what happened comes before any more autonomy. ${can}`
        : `A safety limit was crossed on ${fmtDate(review.incidents[0].date)} without changing authority. A review of what happened comes before any more autonomy. ${can}`,
      then: auto ? `After the review, a return to ${LEVEL_TITLE[auto.previous.level]} can be proposed and decided again. The review itself doesn't restore it.` : 'After the review, more autonomy can be considered again.',
      link: { href: `${base}?tab=monitor`, text: 'Next: record the review' },
    };
  }
  if (decisionRequired(state, cap.id)) {
    const p = proposedAuthority(state, cap.id);
    const r = readiness(state, cap.id);
    const gap = r.unmet[0];
    const checks = r.total ? (r.met === r.total ? ` All ${r.total} Requirements are met.` : ` ${r.met} of ${r.total} Requirements are met; still open: ${lowerFirst(firstSentence(gap.gap || gap.text))}`) : '';
    return {
      kind: 'decision',
      text: `Decide whether it moves to ${LEVEL_TITLE[p.level]}${p.limited && p.level !== 3 ? ', with limits' : ''}.${checks}`,
      then: levelSentence(cap, p.level, p.limited ? d.decision.conditions : null, { would: true }),
      link: { href: `${base}?tab=decide`, text: 'Next: review the evidence and decide whether autonomy should expand' },
    };
  }
  const held = heldRecord(state, cap);
  if (held && held.openCondition) {
    return { kind: 'held', text: held.openCondition, then: `It can be reconsidered for ${LEVEL_TITLE[held.previous.level]}.`, link: null };
  }
  if (cap.status === 'retired') {
    return { kind: 'retired', text: 'Retired: it no longer operates, and no Decision or Proposal can follow. Its history stays. To use this work again, set up a new capability.', then: null, link: null };
  }
  if (cap.status === 'not-delegated') {
    const condition = readiness(state, cap.id).unmet.find((x) => x.source === 'Written by hand');
    return { kind: 'not-delegated', text: 'Nothing is planned: it isn\'t delegated, by design. Changing that takes a new decision.', then: condition ? `It can be reconsidered once this is true: ${lowerFirst(condition.text)}.` : null, link: null };
  }
  // Operating above approved Authority (#149) comes before any other work.
  const g = authorityGap(state, cap.id);
  if (g.above) {
    return {
      kind: 'gap',
      text: `Resolve the gap first: it is observed at Level ${g.observed.level}, ${g.observed.name}, above its approved Level ${g.approved.level}, ${g.approved.name}. Further expansion is blocked until its behavior comes back within approved Authority or the observed behavior is governed through a Proposal.`,
      then: `A move to ${LEVEL_TITLE[cap.authority.level + 1]} can be proposed now to govern what it already does.`,
      link: { href: `${base}?tab=monitor`, text: 'Next: resolve the gap' },
    };
  }
  // Setup is unfinished only while its Boundaries or Requirements are missing
  // (#149): a capability whose first authority change is still to come, like
  // State, is set up, not "still being set up".
  const setup = !versionList(state, cap.id, 'contract').length || !criteriaSaved(state, cap.id) ? nextStep(state, cap.id) : null;
  if (setup) {
    return {
      kind: 'setup',
      text: `It's still being set up. Next setup step: ${lowerFirst(setup.title)}.`,
      then: 'Once setup is done, the first change to its authority can be proposed and decided.',
      link: { href: `${base}/setup?step=${setup.id}`, text: `Next: ${lowerFirst(setup.title)}` },
    };
  }
  const r = readiness(state, cap.id);
  const gap = r.unmet[0];
  if (gap && cap.authority.level < 4) {
    return {
      kind: 'evidence',
      text: `More evidence first: ${lowerFirst(gap.text)} (now ${gap.current}). ${readinessText(r)}`,
      then: `A move to ${LEVEL_TITLE[cap.authority.level + 1]} can then be proposed.`,
      link: { href: `${base}?tab=decide`, text: 'Next: see the evidence' },
    };
  }
  return { kind: 'none', text: 'Nothing is open. It keeps working inside its boundaries.', then: null, link: { href: `${base}?tab=monitor`, text: 'Next: check it\'s still safe' } };
}

// The page's title, its state badge and the sentence of what it does now.
function story(state, cap, d) {
  const review = reviewNeeded(state, cap.id);
  const level = cap.authority.level;
  const restricted = cap.status === 'restricted';
  const retired = cap.status === 'retired';
  const title = retired ? 'Retired' : restricted && level === 1 ? 'Recommend only' : LEVEL_TITLE[level];
  const gap = authorityGap(state, cap.id);
  const state1 = review.any ? badge('restricted', 'Needs review') : restricted ? badge('restricted', 'Restricted') : gap.above ? badge('restricted', 'Operating above approved Authority') : '';
  const why = whyHere(state, cap, d);
  const next = nextFor(state, cap, d);
  const chapter = (k, body) => html`<div class="st-chapter"><span class="st-k">${k}</span><p>${body}</p></div>`;
  const base = `#/capabilities/${cap.id}`;
  const pulledBack = restricted || cap.status === 'review-required';
  return html`<section class="st-story" data-next="${next.kind}">
    <h2 class="st-title">${title}${retired ? '' : html` <span class="st-lvl">Level ${level}</span>`} ${state1}</h2>
    <p class="st-now">${retired ? 'It no longer operates. Its history and records are kept.' : levelSentence(cap, level, limitsInForce(state, cap), { notDelegated: cap.status === 'not-delegated' })}</p>
    ${gap.above ? html`<p class="st-gap"><strong>Approved: Level ${gap.approved.level}, ${gap.approved.name} · Observed: Level ${gap.observed.level}, ${gap.observed.name}.</strong> Further expansion is blocked until this is resolved. <a href="${`#/capabilities/${cap.id}?tab=monitor`}">Resolve it in Monitor</a></p>` : ''}
    <div class="st-chapters">
      ${why ? chapter('Why it\'s here', why) : ''}
      ${chapter('What happens next', next.text)}
      ${next.then ? chapter('Then', next.then) : ''}
    </div>
    ${next.link ? html`<p class="st-next"><a href="${next.link.href}">${next.link.text} →</a></p>` : ''}
    <p class="st-meta"><span>Owner: ${person(cap.owner).name}</span>${pulledBack ? html`<a href="${base}?tab=status&show=rules">View boundaries</a><a href="${base}?tab=history">View history</a>` : ''}</p>
  </section>`;
}

// The status page itself (capability.js calls it summaryTab).
export function summaryTab(state, cap, d) {
  // A draft (#139) has no authority to describe yet; setup is where it stands.
  if (setupState(state, cap.id) === 'draft') {
    const next = setupSequence(state, cap.id).find((st) => !st.done && !st.optional);
    return html`<section class="card"><h2>No authority granted yet</h2><p class="muted">The setup is a draft. Once the owner confirms it, the starting authority is set and recorded.</p>${next ? html`<p>Next setup step: <strong>${next.title}</strong>. ${next.text}</p>` : ''}<p><a class="btn btn-primary" href="#/capabilities/${cap.id}/setup">Open setup</a></p></section>`;
  }
  return html`${story(state, cap, d)}
    ${waitingSection(state, cap)}
    <section class="st-lines">
      ${boundariesLine(state, cap)}
      ${peopleLine(state, cap, d)}
    </section>`;
}

// ---------------------------------------------------------------------------
// Actions waiting for a person
// ---------------------------------------------------------------------------

function describeAction(x) {
  const a = x.call.args || {};
  return x.call.tool === 'issue_refund' ? `Refund $${a.amount} on ${a.orderId}` : `${toolWords(x.call.tool)}${a.orderId ? ` on ${a.orderId}` : ''}`;
}

const waitingNoun = (items) => {
  const refunds = items.length && items.every((x) => x.call.tool === 'issue_refund');
  return refunds ? plural(items.length, 'refund', 'refunds') : plural(items.length, 'action', 'actions');
};

// One waiting action as a row: what it is, why it needs a person, and the
// approve/reject form when the person in "Demo as" may decide.
function actionRow(state, x, by) {
  const e = queueEligibility(state, x.id, by);
  const why = x.findings.map((f) => f.rule.text).join(' ');
  return html`<div class="st-row" id="${x.id}">
    <div><div class="st-row-title">${describeAction(x)}</div><div class="st-row-sub">${why}</div>
      <div class="st-row-meta">Asked ${fmtDate(x.date)}${x.follows ? html` · <a href="#${x.follows}">asked again after an earlier request</a>` : ''} · ${x.id}</div></div>
    ${e.ok ? html`<form class="st-act" data-form="decide-action" data-id="${x.id}">
        <input type="text" name="reason" maxlength="240" placeholder="Why? (required)" aria-label="Reason for ${describeAction(x)}">
        <button class="btn btn-sm" type="submit" name="decision" value="reject">Reject</button>
        <button class="btn btn-sm btn-primary" type="submit" name="decision" value="approve">Approve</button>
      </form>` : ''}
  </div>`;
}

// Who is deciding, once for the list: "Approving as …", or why they can't.
function decidingLine(state, cap, waiting, by) {
  const e = queueEligibility(state, waiting[0].id, by);
  return e.ok
    ? html`Approving as <strong>${person(by).name}</strong>; a reason is required.`
    : html`${e.reason} ${SWITCH_PERSON}`;
}

function waitingSection(state, cap) {
  const waiting = (state.actionQueue || []).filter((x) => x.capabilityId === cap.id && x.status === 'waiting');
  if (!waiting.length) return '';
  const by = actor(state, cap.id);
  return html`<section class="st-section st-waiting">
    <h2>Needs a decision <span class="st-n">${waitingNoun(waiting)}</span></h2>
    <div class="st-rows">${waiting.map((x) => actionRow(state, x, by))}</div>
    <p class="small muted st-after">${decidingLine(state, cap, waiting, by)} <a href="#/capabilities/${cap.id}?tab=status&show=approvals">All waiting actions →</a></p>
  </section>`;
}

export function waitingTab(state, cap, query) {
  const all = (state.actionQueue || []).filter((x) => x.capabilityId === cap.id);
  const waiting = all.filter((x) => x.status === 'waiting');
  const decided = all.filter((x) => x.status !== 'waiting').reverse();
  const by = actor(state, cap.id);
  const approvers = queueApprovers(state, cap.id).map((k) => person(k).name);
  const error = query.get('error');
  const outcome = { executed: badge('pass', 'Approved and done'), rejected: 'Rejected', refused: badge('fail', 'Approved, but not carried out') };
  const decidedRow = (x) => html`<div class="st-row" id="${x.id}">
    <div><div class="st-row-title">${describeAction(x)}</div><div class="st-row-sub">${x.findings.map((f) => f.rule.text).join(' ')}</div>
      ${kv([['Decided by', html`${x.decision.byAt ? x.decision.byAt.name : x.decision.by}, ${fmtDate(x.decision.date)}`], ['Reason', x.decision.reason], ...(x.decision.refusal ? [['Why it didn\'t run', x.decision.refusal]] : []), ...(x.decision.refundId ? [['Refund', x.decision.refundId]] : [])])}
      <div class="st-row-meta">Asked ${fmtDate(x.date)} · ${x.id}</div></div>
    <div class="st-outcome">${outcome[x.status]}</div>
  </div>`;
  const n = waiting.length;
  const why = cap.authority.level <= 2
    ? `At ${levelName(cap.authority.level)}, every action needs a person to approve it.`
    : 'They fell outside the approved limits, so they weren\'t carried out automatically.';
  const intro = n
    ? why
    : 'Actions that need human review wait here for a person to approve or reject.';
  return html`
    ${error ? notice('fail', 'Couldn\'t save your decision', error) : ''}
    ${tabIntro(intro, `${approvers.length ? `Who can approve: ${approvers.join(', ')} (the owner and named stakeholders who are active).` : `Nobody can approve yet: ${cap.name} has no active owner or stakeholders. Add one under Manage stakeholders.`} The capability can ask but can never approve its own request. When someone approves, the action is checked against the rules again before it runs; if anything has changed since it was asked (authority was reduced, a limit was reached or the order is now blocked), it doesn't run, and the reason is saved. Only one request per order can wait at a time, and at most ${QUEUE_LIMIT} for this capability. Past that, new requests are blocked and an incident is opened.`)}
    <section class="st-section st-waiting">
      <h2>Needs a decision <span class="st-n">${n ? waitingNoun(waiting) : 'none'}</span></h2>
      ${n ? html`<div class="st-rows">${waiting.map((x) => actionRow(state, x, by))}</div><p class="small muted st-after">${decidingLine(state, cap, waiting, by)}</p>` : html`<p class="empty">Nothing needs approval.</p>`}
    </section>
    ${decided.length ? html`<section class="st-section"><h2>Decided <span class="st-n">${decided.length}</span></h2><div class="st-rows">${decided.map(decidedRow)}</div></section>` : ''}`;
}

// ---------------------------------------------------------------------------
// Boundaries
// ---------------------------------------------------------------------------

// "Automation is pulled back if …": each automatic-restriction line without
// its consequence clause.
function pullBackSentence(lines) {
  const conds = lines.map((l) => lowerFirst(l.replace(/\.$/, '').replace(/\s+(returns?|opens?|moves?|sends?)\b.*$/i, '')));
  if (!conds.length) return null;
  if (conds.length === 1) return `Automation is pulled back if ${conds[0]}.`;
  const shown = conds.slice(0, 2);
  const rest = conds.length - shown.length;
  return rest
    ? `Automation is pulled back if ${shown.join(', if ')}, or if another of its ${conds.length} safety limits is crossed.`
    : `Automation is pulled back if ${shown[0]}, or if ${shown[1]}.`;
}

function boundariesLine(state, cap) {
  const base = `#/capabilities/${cap.id}`;
  const c = current(state, cap.id, 'contract');
  if (!versionList(state, cap.id, 'contract').length) {
    return html`<div class="st-line st-line-plain"><b>Boundaries</b><span class="st-meta-text">No rules yet.</span><a class="st-open" href="${base}/contract/build">Set up rules →</a></div>`;
  }
  const review = [...c.mustAsk, ...c.escalation];
  const few = (items) => html`<ul>${items.slice(0, 3).map((i) => html`<li>${i}</li>`)}${items.length > 3 ? html`<li class="muted">and ${items.length - 3} more</li>` : ''}</ul>`;
  const pull = pullBackSentence(c.autoRestriction);
  return html`<details class="st-line st-bounds-line">
    <summary><b>Boundaries</b><span class="st-meta-text">${c.may.length} allowed · ${review.length} require human review · ${c.mustNever.length} never allowed</span><span class="st-open">View</span></summary>
    <div class="st-inner">
      <div class="st-bounds">
        <div><div class="st-k">Allowed</div>${few(c.may)}</div>
        <div><div class="st-k">Requires human review</div>${few(review)}</div>
        <div><div class="st-k">Never allowed</div>${few(c.mustNever)}</div>
      </div>
      ${pull ? html`<p class="st-pull">${pull}</p>` : ''}
      <p class="small"><a href="${base}?tab=status&show=rules">All rules →</a></p>
    </div>
  </details>`;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const positionsDate = (stakeholders) => stakeholders.map((s) => s.date).filter(Boolean).sort().at(-1) || null;

// One sentence for the people line: where they disagree, or what they agree on.
function peopleSummary(stakeholders, sum) {
  if (sum && sum.disagreement) return `Not unanimous: ${lowerFirst(firstSentence(sum.disagreement)).replace(/\.$/, '')}.`;
  if (sum && sum.consensus) return firstSentence(sum.consensus);
  // Otherwise, counted by stance: "All 5 agree: restrict." / "Positions: 3 expand with limits, 1 expand."
  const label = Object.fromEntries(STANCES);
  const counts = new Map();
  for (const s of stakeholders) { const k = s.stance && s.stance !== 'undecided' && label[s.stance] ? s.stance : 'undecided'; counts.set(k, (counts.get(k) || 0) + 1); }
  const undecided = counts.get('undecided') || 0;
  counts.delete('undecided');
  if (!counts.size) return 'No positions recorded yet.';
  const groups = [...counts].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${lowerFirst(label[k])}`);
  const tail = undecided ? `; ${undecided} with no position yet` : '';
  if (counts.size === 1 && !undecided) return `All ${stakeholders.length} agree: ${lowerFirst(label[[...counts.keys()][0]])}.`;
  return `Positions: ${groups.join(', ')}${tail}.`;
}

function peopleLine(state, cap, d) {
  const stakeholders = current(state, cap.id, 'stakeholders');
  const count = stakeholders.length + (stakeholders.some((s) => s.person === cap.owner) ? 0 : 1);
  const manage = html`<a href="#/capabilities/${cap.id}/stakeholders/edit">Manage stakeholders</a>`;
  if (!stakeholders.length) {
    return html`<div class="st-line st-line-plain"><b>People involved: ${count}</b><span class="st-meta-text">Only the owner, ${person(cap.owner).name}, so far.</span><span class="st-open">${manage}</span></div>`;
  }
  return html`<details class="st-line st-people-line">
    <summary><b>People involved: ${count}</b><span class="st-meta-text">${peopleSummary(stakeholders, d.stakeholderSummary)}</span><span class="st-open">View positions</span></summary>
    <div class="st-inner">${positions(state, cap, d)}<p class="small">${manage}</p></div>
  </details>`;
}

// Every position as it was given, with the reason, not averaged into a score.
function positions(state, cap, d) {
  const stakeholders = current(state, cap.id, 'stakeholders');
  const gated = needsSignoff(state, cap.id, 'stakeholders');
  const when = positionsDate(stakeholders);
  const sum = d.stakeholderSummary;
  return html`<p class="muted">${when ? `Positions as of ${fmtDate(when)}. ` : ''}Each view is shown as it was given, not averaged into a score.</p>
    <ul class="st-positions">${stakeholders.map((s) => {
      const who = person(s.person);
      return html`<li><div><strong>${who.name}</strong> <span class="muted">${s.team}${s.person === cap.owner ? ' · owner' : ''}</span>: <span class="st-pos st-pos-${s.stance || 'undecided'}">${s.position || 'No position yet'}</span></div>${s.quote ? html`<p class="st-quote">${s.quote}</p>` : ''}</li>`;
    })}</ul>
    ${sum ? html`<p><span class="st-k">Where people agree</span> ${sum.consensus}</p><p><span class="st-k">Where people still disagree</span> ${sum.disagreement}</p>` : ''}
    ${gated ? html`<p class="muted small">Now that results are in, adding or removing people or changing a team label needs approval. Changes are kept in history.</p>` : ''}
    ${proposalsList(state, cap.id, 'stakeholders')}`;
}

// ---------------------------------------------------------------------------
// The full rules (?tab=status&show=rules)
// ---------------------------------------------------------------------------

export function contractTab(state, cap, d) {
  const c = current(state, cap.id, 'contract');
  const risk = current(state, cap.id, 'risk');
  const lines = (items) => (items.length ? html`<ul class="contract-list">${items.map((i) => html`<li>${i}</li>`)}</ul>` : html`<p class="muted">None.</p>`);
  const part = (cls, title, body) => html`<section class="st-rule ${cls}"><h3>${title}</h3>${body}</section>`;
  const riskBlock = part('st-rule-risk', 'Risk profile', html`<p class="muted small">The higher the risk, the more evidence it needs before its autonomy expands.</p>${kv([
    ['How serious would a bad decision be?', risk.impact],
    ['Can it be undone?', risk.reversibility],
    ['Who or what is affected?', risk.exposure],
    ['Mistakes we watch for', (risk.failureTypes || []).join(', ') || 'None listed'],
    ...(risk.note ? [['Note', risk.note]] : []),
  ])}`);
  const contractVersions = versionList(state, cap.id, 'contract');
  if (!contractVersions.length) {
    return html`${emptyState(state, cap.id, d.contractDraft ? 'The rules are still a draft.' : 'No rules yet.', 'contract')}${riskBlock}`;
  }
  const latest = contractVersions[contractVersions.length - 1];
  return html`
    ${tabIntro('What this capability may do on its own, what requires human review, and what is never allowed.', actsThroughGate(cap.id) ? 'Its actions go through a gate: software checks each one against the lines marked as enforced before it happens, and the model\'s own judgment can\'t override them.' : 'Each line says how it is enforced. Its actions don\'t go through a gate, so written Boundaries are followed by people, not checked by software.', html`<span class="muted">Last changed by ${personAt(latest.authorAt, latest.author).name}. Changes are kept in <a href="#/capabilities/${cap.id}/versions?kind=contract&version=${latest.version}">history</a>.</span> ${amendLink(state, cap.id, 'contract')}`)}
    ${proposalsList(state, cap.id, 'contract')}
    ${contractReviewView(contractVersions[0].review)}
    <div class="st-rules">
      ${part('st-rule-may', 'Allowed', lines(c.may))}
      ${part('st-rule-ask', 'Requires human review', html`<div class="st-two"><div><p class="fact-label">For these cases</p>${lines(c.mustAsk)}</div>
        <div><p class="fact-label">Whenever this comes up</p>${lines(c.escalation)}${c.escalation.some((l) => /confidence/i.test(l)) ? html`<p class="muted small">Confidence is reported by the model and can't be verified, so low confidence can send a case to human review, but high confidence never lets an action through on its own.</p>` : ''}</div></div>`)}
      ${part('st-rule-never', 'Never allowed', lines(c.mustNever))}
      ${part('st-rule-auto', 'Automation is pulled back if', html`${lines(c.autoRestriction)}<p class="muted small">Only a person can expand autonomy. Software pulls it back on its own when one of these happens.</p>`)}
      ${dataBoundary(c)}
      ${riskBlock}
    </div>`;
}

function dataBoundary(c) {
  const seen = new Set(c.dataSeen || []);
  const shown = DATA_FIELDS.filter((f) => seen.has(f.id) && !f.restricted);
  const hidden = DATA_FIELDS.filter((f) => !seen.has(f.id) || f.restricted);
  return html`<section class="st-rule st-rule-data">
    <h3>Data it can access</h3>
    ${Array.isArray(c.dataSeen)
      ? html`<div class="st-two"><div><p class="fact-label">Can access</p>${shown.length ? html`<ul class="contract-list">${shown.map((f) => html`<li>${f.label}</li>`)}</ul>` : html`<p class="muted">Nothing.</p>`}</div>
        <div><p class="fact-label">Can't access</p><ul class="contract-list">${hidden.map((f) => html`<li>${f.label}${f.restricted ? html` <span class="muted small">(never allowed)</span>` : ''}</li>`)}</ul></div></div>`
      : html`<p class="muted">No data access is set in the rules, so the AI sees nothing from your systems.</p>`}
    <p class="muted small">The model only ever sees these fields. Card numbers and full addresses are never shared, whatever the rules say. When something is withheld, the model is told which rule applied, not what the record says.</p>
  </section>`;
}
