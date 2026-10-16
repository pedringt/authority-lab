// The setup flow (#139): Context → Starting point → Capability → Risk →
// Authority → Boundaries → Requirements → Targets → Evidence → People →
// Review and confirm. Related steps share a screen; the order and the review
// boundary stay clear. Setup is a draft until the owner confirms it.
//
// Suggestions here are deterministic (templates, the risk answers, keyword
// matching on what was typed). They say where they came from and are never
// called AI.

import { html, raw, badge, notice, selectField, person, fmtDate, lede } from '../ui.js';
import {
  getCapability, capData, current, versionList, actor, activePeople, workflowOf, RISK_OPTIONS, levelName,
  CONTEXT_FIELDS, contextNow, confirmedContext, contextDescription, LIFECYCLE, BASELINE_FIELDS, baselineNow, baselineVersions, authorityBaseline,
  LIKELIHOODS, SCALES, SEVERITY_LABELS, riskView, setupState, setupReview, setupConfirmation, resultsLockWarning,
  boundaries, ENFORCEMENT, peopleModel, criteriaSaved, evidenceCoverage, coverageText, performanceResultsSeen, enforcementTerms,
} from '../store/index.js';
import { STARTING_POINTS, findStartingPoint, familiesFor } from '../data/templates.js';
import { TODAY_CHOICES, RISK_ANSWERS } from './setup.js';

const FIELD = Object.fromEntries(CONTEXT_FIELDS.map((f) => [f.key, f]));
const factText = (v) => (Array.isArray(v) ? v.join(', ') : v);
const SOURCE_WORDS = { person: 'Entered by a person', description: 'Based on your answers', template: 'Template suggestion', ai: 'AI suggestion' };

// Severity in plain words; the stored keys stay Low / Medium / High.
export const SEVERITY_ANSWERS = RISK_ANSWERS.impact.map(([v, text]) => [v, `${SEVERITY_LABELS[v]}: ${text.split(': ')[1] || text}`]);

const stepHead = (cap, title, first, more) => html`<div class="page-head"><div>
  <p class="eyebrow"><a href="#/capabilities">Capabilities</a> · ${cap ? html`<a href="#/capabilities/${cap.id}/setup">${cap.name} · Setup</a>` : 'Setup'}</p>
  <h1>${title}</h1>${lede(first, more)}</div></div>`;

const draftNotice = (state, cap) => (setupState(state, cap.id) === 'draft'
  ? notice('neutral', 'This setup is a draft', 'Everything here is saved as you go. Nothing is granted until the owner reviews and confirms the setup.')
  : '');

// ---------------------------------------------------------------------------
// Context (the workflow's, shared by its capabilities)
// ---------------------------------------------------------------------------

export function contextView(state, query) {
  const error = query.get('error');
  const facts = contextNow(state);
  const suggested = Object.entries(facts).filter(([, f]) => f.status !== 'confirmed');
  const confirmed = Object.entries(facts).filter(([, f]) => f.status === 'confirmed');
  const back = query.get('next');
  const input = (f) => {
    const now = facts[f.key] && facts[f.key].status === 'confirmed' ? facts[f.key].value : null;
    if (f.multi) return html`<fieldset class="field field-stack"><legend>${f.label}</legend><div class="check-grid">${f.multi.map((o) => html`<label class="check"><input type="checkbox" name="ctx-${f.key}" value="${o}" ${now && now.includes(o) ? raw('checked') : ''}><span>${o}</span></label>`)}</div></fieldset>`;
    if (f.options) return selectField(`ctx-${f.key}`, f.label, f.options, now || '', { placeholder: 'Not answered' });
    return html`<label class="field field-stack"><span>${f.label}</span><input type="text" name="ctx-${f.key}" value="${now || ''}" maxlength="240"></label>`;
  };
  return html`${stepHead(null, 'Context', `Tell us about the product or workflow ${workflowOf(state).name} belongs to.`, 'Start in your own words. Authority Lab picks out facts it can match by keyword and asks you to confirm each one; only confirmed facts shape the rest of setup. This is simple keyword matching, not AI.')}
  ${error ? notice('fail', 'Couldn\'t save that', error) : ''}
  <form class="setup-form onboard-form card" data-form="context-describe">
    <div class="onboard-group">
      <h2 class="onboard-q">Describe it</h2>
      <label class="field field-stack"><span>What it is, who uses it, who is affected, and where people are involved</span><textarea name="description" rows="4" maxlength="2000" placeholder="e.g. Our support team uses AI to recommend refunds for customer orders. A person approves each one. We are piloting it.">${contextDescription(state)}</textarea></label>
    </div>
    <button class="btn btn-primary" type="submit">Suggest facts from this</button>
  </form>
  ${suggested.length ? html`<section class="card"><h2>To confirm</h2><p class="muted small">Confirm, correct or reject each one. There's no confirm-all.</p>
    <ul class="plain-list">${suggested.map(([k, f]) => html`<li class="fact-row">
      <span class="fact-label">${FIELD[k].label}</span> <strong>${factText(f.value)}</strong> ${badge('insufficient', SOURCE_WORDS[f.source] || f.source)}
      <div class="row-actions"><button class="btn btn-sm btn-primary" data-action="fact-confirm" data-key="${k}">Confirm</button><button class="btn btn-sm btn-ghost" data-action="fact-reject" data-key="${k}">Reject</button>
      ${FIELD[k].multi || FIELD[k].options ? '' : html`<form class="line-add" data-form="fact-correct" data-key="${k}"><input type="text" name="value" value="${f.value}" aria-label="Correct ${FIELD[k].label}"><button class="btn btn-sm" type="submit">Correct and confirm</button></form>`}</div>
    </li>`)}</ul></section>` : ''}
  <form class="setup-form onboard-form card" data-form="context-facts">
    <h2>Confirmed facts</h2>
    <p class="muted small">${confirmed.length ? `${confirmed.length} confirmed.` : 'None yet.'} Anything you fill in or change here is confirmed by you. Leave a field empty if it doesn't apply or isn't known.</p>
    ${CONTEXT_FIELDS.map(input)}
    <label class="field field-stack"><span>Why are you recording this?</span><input type="text" name="reason" value="Recorded during setup." maxlength="200"></label>
    <button class="btn btn-primary" type="submit">Save confirmed facts</button>
  </form>
  <p>${back ? html`<a class="btn" href="${back}">Back to setup</a>` : html`<a class="btn" href="#/capabilities/new">Next: choose a starting point</a>`}</p>`;
}

// ---------------------------------------------------------------------------
// Starting point and capability (a new draft)
// ---------------------------------------------------------------------------

function templateChoices(state, chosen) {
  const fits = familiesFor(confirmedContext(state).aiActions);
  return html`<div class="option-list" role="radiogroup" aria-label="Starting point">${STARTING_POINTS.map((t) => html`<label class="option"><input type="radio" name="template" value="${t.id}" ${t.id === chosen ? raw('checked') : ''}><span class="option-body"><strong>${t.name}</strong>${fits.includes(t.id) ? badge('decision', 'Fits your answers') : ''}<span class="muted small">${t.description}${t.examples.length ? ` For example: ${t.examples.join(', ')}.` : ''}</span></span></label>`)}</div>
  <p class="muted small">A template prefills questions and suggestions, never the answers: every suggestion it makes is reviewed one at a time, and it never sets a number.${fits.length ? ' "Fits your answers" comes from the confirmed Context.' : ''}</p>`;
}

const lifecycleChoices = (chosen) => html`<div class="option-list" role="radiogroup" aria-label="Planned or in use">
  <label class="option"><input type="radio" name="lifecycle" value="planned" ${chosen === 'planned' ? raw('checked') : ''}><span class="option-body"><strong>Planned, or a pilot</strong><span class="muted small">It isn't doing this work for real yet.</span></span></label>
  <label class="option"><input type="radio" name="lifecycle" value="in-use" ${chosen === 'in-use' ? raw('checked') : ''}><span class="option-body"><strong>Already in use</strong><span class="muted small">It does this work today. You'll record what it actually does, including how independently it really operates.</span></span></label>
</div>`;

export function startView(state, query) {
  const error = query.get('error');
  const owners = Object.entries(activePeople(state)).map(([k, p]) => [k, `${p.name}, ${p.role}`]);
  const purpose = confirmedContext(state).purpose;
  return html`${stepHead(null, 'Add a capability', 'Choose a starting point, then say what specific thing the AI is being given permission to do.', 'One discrete thing, like "Recommend a refund". If it sounds like a whole process, split it into separate capabilities. Nothing is granted until the setup is confirmed.')}
  ${error ? notice('fail', 'Couldn\'t start the capability', error) : ''}
  ${purpose ? notice('neutral', 'Context', `Purpose: ${purpose}`, { link: '#/setup/context?next=%23%2Fcapabilities%2Fnew', linkText: 'Edit Context' }) : notice('watch', 'Context comes first', 'Describe the product or workflow and confirm its purpose. You can start the capability now, but setup can\'t be confirmed without it.', { link: '#/setup/context?next=%23%2Fcapabilities%2Fnew', linkText: 'Add Context' })}
  <form class="setup-form onboard-form" data-form="start-capability" novalidate>
    <div class="onboard-group"><h2 class="onboard-q">Starting point</h2>${templateChoices(state, '')}</div>
    <div class="onboard-group">
      <h2 class="onboard-q">What specific thing are we giving AI permission to do?</h2>
      <label class="field field-stack"><span>Name</span><input name="name" type="text" required maxlength="80" placeholder="e.g. Recommend a refund" data-action="check-name" autocomplete="off"></label>
      <p class="form-hint muted small" data-name-warning hidden></p>
      <label class="field field-stack"><span>What it does, who it helps, and what it produces</span><input name="summary" type="text" maxlength="160" placeholder="e.g. Reviews refund requests and recommends whether to issue one."></label>
    </div>
    <div class="onboard-group"><h2 class="onboard-q">Is it already in use?</h2>${lifecycleChoices('')}</div>
    <div class="onboard-group"><h2 class="onboard-q">Who owns it?</h2>${selectField('owner', 'Owner', owners, actor(state), { action: 'choose-owner' })}<p class="muted small">One accountable person. Only the owner can confirm the setup.</p></div>
    <button class="btn btn-primary" type="submit">Start setup</button>
  </form>`;
}

export function capabilityStepView(state, capabilityId, query) {
  const cap = getCapability(state, capabilityId);
  const error = query.get('error');
  const owners = Object.entries(activePeople(state)).map(([k, p]) => [k, `${p.name}, ${p.role}`]);
  return html`${stepHead(cap, 'Starting point and capability', 'What it does, where it starts from, and who owns it.')}
  ${draftNotice(state, cap)}${error ? notice('fail', 'Couldn\'t save that', error) : ''}
  <form class="setup-form onboard-form" data-form="setup-capability" data-capability="${cap.id}" novalidate>
    <div class="onboard-group"><h2 class="onboard-q">Starting point</h2>${templateChoices(state, cap.setup.template)}</div>
    <div class="onboard-group"><h2 class="onboard-q">Capability</h2>
      <label class="field field-stack"><span>Name</span><input name="name" type="text" value="${cap.name}" maxlength="80"></label>
      <label class="field field-stack"><span>What it does, who it helps, and what it produces</span><input name="summary" type="text" value="${cap.summary}" maxlength="160"></label>
    </div>
    <div class="onboard-group"><h2 class="onboard-q">Is it already in use?</h2>${lifecycleChoices(cap.setup.lifecycle)}</div>
    <div class="onboard-group">${selectField('owner', 'Owner', owners, cap.owner)}</div>
    <button class="btn btn-primary" type="submit">Save</button>
  </form>`;
}

// ---------------------------------------------------------------------------
// What it does today (already in use)
// ---------------------------------------------------------------------------

export function todayStepView(state, capabilityId, query) {
  const cap = getCapability(state, capabilityId);
  const error = query.get('error');
  const b = baselineNow(state, capabilityId);
  const e = b.effective || { status: 'not-recorded' };
  const effValue = e.status === 'recorded' ? String(e.level) : e.status === 'unknown' ? 'unknown' : '';
  return html`${stepHead(cap, 'What it does today', 'Record what it actually does now, not what the policy says.', 'Documented policy and real operation often differ. Effective authority is how independently it really operates today. It is recorded separately and never changes the authority Authority Lab grants.')}
  ${draftNotice(state, cap)}${error ? notice('fail', 'Couldn\'t save that', error) : ''}
  <form class="setup-form onboard-form" data-form="setup-today" data-capability="${cap.id}">
    ${BASELINE_FIELDS.map((f) => html`<label class="field field-stack"><span>${f.label}</span><textarea name="b-${f.key}" rows="2" maxlength="600">${b[f.key] || ''}</textarea></label>`)}
    <div class="onboard-group"><h2 class="onboard-q">How independently does it really operate today?</h2>
      ${selectField('effective', 'Effective authority', [['unknown', 'Not sure'], ...[0, 1, 2, 3, 4].map((l) => [String(l), `Level ${l} — ${levelName(l)}`])], effValue, { placeholder: 'Not recorded' })}
      <label class="field field-stack"><span>How do you know? <span class="muted small">(required with a level)</span></span><input type="text" name="effective-note" value="${e.note || ''}" maxlength="300"></label>
    </div>
    <label class="field field-stack"><span>Why are you recording this?</span><input type="text" name="reason" value="${baselineVersions(state, capabilityId).length ? '' : 'What it does today, recorded during setup.'}" maxlength="200"></label>
    <button class="btn btn-primary" type="submit">Save</button>
  </form>`;
}

// ---------------------------------------------------------------------------
// Risk and starting authority
// ---------------------------------------------------------------------------

export function riskStepView(state, capabilityId, query) {
  const cap = getCapability(state, capabilityId);
  const error = query.get('error');
  const r = current(state, capabilityId, 'risk');
  const v = riskView(state, capabilityId);
  const saved = versionList(state, capabilityId, 'risk').length > 0;
  const ab = authorityBaseline(state, capabilityId);
  return html`${stepHead(cap, 'Risk and authority', 'What could go wrong, how serious it would be, and how independently the AI should operate right now.', 'Risk informs Authority. Overall Risk is worked out from Severity and Likelihood with a fixed table, never typed in.')}
  ${draftNotice(state, cap)}${error ? notice('fail', 'Couldn\'t save that', error) : ''}
  ${saved ? notice(v.overall === 'Unknown' ? 'watch' : 'neutral', `Overall Risk: ${v.overall}`, v.why) : ''}
  <form class="setup-form onboard-form" data-form="setup-risk" data-capability="${cap.id}" novalidate>
    <div class="onboard-group"><h2 class="onboard-q">Risk</h2>
      <div class="three-col">
        ${selectField('impact', 'Severity: how serious would a failure be?', SEVERITY_ANSWERS, r.impact || '', { placeholder: 'Choose' })}
        ${selectField('likelihood', 'Likelihood: how likely does a failure seem?', LIKELIHOODS.map((l) => [l, l === 'Unknown' ? 'Unknown: not enough to say yet' : l]), r.likelihood || '', { placeholder: 'Choose' })}
        ${selectField('scale', 'Scale: how far could one failure reach?', SCALES.map((x) => [x, x]), r.scale || '', { placeholder: 'Not answered' })}
      </div>
      <div class="two-col">
        ${selectField('reversibility', 'Can it be undone?', RISK_ANSWERS.reversibility, r.reversibility || '', { placeholder: 'Choose' })}
        ${selectField('exposure', 'Who or what is affected?', RISK_ANSWERS.exposure, r.exposure || '', { placeholder: 'Choose' })}
      </div>
      <p class="muted small">Who is affected also decides how many people must approve later changes, and which Boundaries are suggested.</p>
      <details class="onboard-more"><summary>What could go wrong (optional)</summary>
        <div class="check-grid">${RISK_OPTIONS.failureTypes.map((f) => html`<label class="check"><input type="checkbox" name="failureTypes" value="${f}" ${(r.failureTypes || []).includes(f) ? raw('checked') : ''}><span>${f}</span></label>`)}</div>
        <label class="field field-stack"><span>Note</span><input name="riskNote" type="text" value="${r.note || ''}" maxlength="200"></label>
      </details>
    </div>
    <div class="onboard-group"><h2 class="onboard-q">Authority: how independently should it operate right now?</h2>
      <p class="muted small">This is where it starts once the setup is confirmed: Level 0 or Level 1 at most. More authority is earned later, one level at a time, with evidence.${ab.effective.status === 'recorded' ? ` What it does today was recorded as Level ${ab.effective.level} — ${ab.effective.name}; formalizing that is a later, explicit authority decision.` : ''}</p>
      <div class="option-list" role="radiogroup" aria-label="Starting authority">${TODAY_CHOICES.map(([value, label, text]) => html`<label class="option"><input type="radio" name="today" value="${value}" ${cap.setup.today === value ? raw('checked') : ''}><span class="option-body"><strong>${label}</strong><span class="muted small">${text}</span></span></label>`)}</div>
      <label class="field field-stack"><span>Why? <span class="muted small">(required if it stays with people)</span></span><textarea name="rationale" rows="2">${cap.setup.rationale || ''}</textarea></label>
    </div>
    <button class="btn btn-primary" type="submit">Save</button>
  </form>`;
}

// ---------------------------------------------------------------------------
// The hub: the sequence, where each step stands
// ---------------------------------------------------------------------------

export function setupSequence(state, capabilityId) {
  const cap = getCapability(state, capabilityId);
  const base = `#/capabilities/${cap.id}`;
  const facts = confirmedContext(state);
  const pending = Object.values(contextNow(state)).filter((f) => f.status !== 'confirmed').length;
  const v = riskView(state, capabilityId);
  const riskSaved = versionList(state, capabilityId, 'risk').length > 0;
  const notDelegated = cap.setup.today === 'not-delegated';
  const draftLines = capData(state, capabilityId).contractDraft;
  const boundariesSaved = versionList(state, capabilityId, 'contract').length > 0;
  const reqs = criteriaSaved(state, capabilityId);
  const cov = evidenceCoverage(state, capabilityId);
  const pm = peopleModel(state, capabilityId);
  const { stakeholders: others } = pm;
  const steps = [
    { id: 'context', title: 'Context', done: Boolean(facts.purpose), text: facts.purpose ? `Purpose: ${facts.purpose}${pending ? ` · ${pending} suggested fact${pending === 1 ? '' : 's'} still to confirm` : ''}` : 'Describe the product or workflow and confirm its purpose.', link: `#/setup/context?next=${encodeURIComponent(`${base}/setup`)}` },
    { id: 'capability', title: 'Starting point and capability', done: true, text: `${findStartingPoint(cap.setup.template).name} · ${LIFECYCLE[cap.setup.lifecycle]} · Owner: ${person(cap.owner).name}`, link: `${base}/setup/capability` },
    ...(cap.setup.lifecycle === 'in-use' ? [{ id: 'today', title: 'What it does today', done: baselineVersions(state, capabilityId).length > 0, text: baselineVersions(state, capabilityId).length ? `Effective authority: ${authorityBaseline(state, capabilityId).effective.status === 'recorded' ? `Level ${authorityBaseline(state, capabilityId).effective.level} — ${authorityBaseline(state, capabilityId).effective.name}` : authorityBaseline(state, capabilityId).effective.status === 'unknown' ? 'not sure' : 'not recorded'}` : 'It is already in use: record what it really does today.', link: `${base}/setup/today` }] : []),
    { id: 'risk', title: 'Risk and authority', done: riskSaved && Boolean(cap.setup.today), text: riskSaved ? `Overall Risk ${v.overall} (Severity ${v.severityLabel}, Likelihood ${v.likelihood}).${cap.setup.today ? ` Starts at ${notDelegated ? 'Level 0, not delegated' : `Level ${cap.setup.today === 'nothing' ? 0 : 1}`} once confirmed.` : ' Choose the starting authority.'}` : 'Severity, Likelihood, Scale, who is affected, and where it starts.', link: `${base}/setup/risk` },
    ...(notDelegated ? [] : [
      { id: 'boundaries', title: 'Boundaries', done: boundariesSaved, text: boundariesSaved ? 'Saved.' : draftLines ? `${draftLines.lines.filter((l) => l.status === 'pending').length} suggestions still to review.` : 'Where it must stop or involve a person. Every suggestion is reviewed one at a time.', link: `${base}/contract/build`, needs: riskSaved, needsText: 'Answer the Risk questions first.' },
      { id: 'requirements', title: 'Requirements and Targets', done: reqs, text: reqs ? `${current(state, capabilityId, 'requirements').length} Requirements, ${current(state, capabilityId, 'criteria').length} Targets.` : 'What must be true before it gets more authority, and a measurable bar only where one is needed.', link: `${base}/criteria/edit`, needs: riskSaved, needsText: 'Answer the Risk questions first.' },
      { id: 'evidence', title: 'Evidence', optional: true, done: reqs && cov.total > 0 && cov.mapped === cov.total, text: reqs ? coverageText(cov) : 'Which evidence will judge each Requirement.', link: `${base}/evidence/configure`, needs: reqs, needsText: 'Save the Requirements first.' },
    ]),
    { id: 'people', title: 'People', optional: true, done: current(state, capabilityId, 'stakeholders').length > 0, text: `Owner: ${person(pm.owner).name}. ${pm.reviewers.length} Reviewer${pm.reviewers.length === 1 ? '' : 's'}, ${others.length} Stakeholder${others.length === 1 ? '' : 's'}.`, link: `${base}/stakeholders/edit` },
    { id: 'review', title: 'Review and confirm', done: setupState(state, capabilityId) === 'confirmed', text: setupState(state, capabilityId) === 'confirmed' ? `Confirmed by ${person(cap.setup.confirmedBy).name} on ${fmtDate(cap.setup.confirmedOn)}.` : 'See the whole setup in plain language. The owner confirms it; that grants the starting authority.', link: `${base}/setup/review` },
  ];
  return steps;
}

export function setupHubView(state, capabilityId, query) {
  const cap = getCapability(state, capabilityId);
  const steps = setupSequence(state, capabilityId);
  const confirmed = setupState(state, capabilityId) === 'confirmed';
  const warn = resultsLockWarning(state, capabilityId);
  return html`${stepHead(cap, 'Setup', confirmed ? 'Setup confirmed.' : 'A draft until the owner confirms it.', confirmed ? 'Later changes follow the usual rules: after results, the bar and who is involved change only through a proposal and sign-off.' : 'Save each step as you go. You can write test cases, run tests and connect evidence before confirming, but no authority can be proposed or granted until the setup is confirmed.')}
  ${query.get('error') ? notice('fail', 'Couldn\'t do that', query.get('error')) : ''}
  ${!confirmed && warn && criteriaSaved(state, capabilityId) ? notice('watch', 'Before you record results', warn) : ''}
  ${!confirmed && performanceResultsSeen(state, capabilityId) ? notice('watch', 'Results are in', 'Requirements, Targets and who is involved now change only through a proposal and sign-off, even though the setup isn\'t confirmed yet.') : ''}
  <ol class="setup-steps card">${steps.map((st, i) => html`<li class="setup-step ${st.done ? 'is-done' : ''}" id="step-${st.id}">
    <div class="setup-step-head"><span class="req-mark" aria-hidden="true">${st.done ? '✓' : i + 1}</span><strong>${st.title}</strong>${st.done ? html`<span class="muted small">Done</span>` : st.optional ? html`<span class="muted small">Optional for confirmation</span>` : ''}</div>
    <p class="muted">${st.text}</p>
    ${st.needs === false ? html`<p class="muted small">${st.needsText}</p>` : html`<a class="btn btn-sm ${!st.done && st.id === 'review' ? 'btn-primary' : ''}" href="${st.link}">${st.done ? 'Open' : st.id === 'review' ? 'Review' : 'Start'}</a>`}
  </li>`)}</ol>`;
}

// ---------------------------------------------------------------------------
// Boundaries as written, with how each is made real
// ---------------------------------------------------------------------------

const ENFORCEMENT_TONE = { enforced: 'pass', 'model-reported': 'watch', documented: 'neutral' };
export function boundariesSummary(state, capabilityId) {
  const b = boundaries(state, capabilityId);
  const terms = enforcementTerms(state, capabilityId);
  return html`${b.categories.map((c) => html`<div class="boundary-group"><p class="fact-label">${c.label}</p>${c.lines.length ? html`<ul class="plain-list">${c.lines.map((l) => html`<li><span>${l.text}</span> ${badge(ENFORCEMENT_TONE[l.enforcement], l.enforcement === 'documented' ? 'Written Boundary' : ENFORCEMENT[l.enforcement])}${l.conditional ? html` <span class="muted small">conditional</span>` : ''}</li>`)}</ul>` : html`<p class="muted small">${c.key === 'alwaysHuman' ? 'Nothing listed separately yet.' : 'None.'}</p>`}</div>`)}
  ${b.restrictions.length ? html`<div class="boundary-group"><p class="fact-label">Automation is pulled back if</p><ul class="plain-list">${b.restrictions.map((r) => html`<li><span>${r.text}</span> ${badge(ENFORCEMENT_TONE[r.enforcement], r.enforcement === 'documented' ? 'Written Boundary' : ENFORCEMENT[r.enforcement])}</li>`)}</ul></div>` : ''}
  <p class="muted small">"Written Boundary" describes the line itself: Authority Lab doesn't check that sentence. It doesn't mean nothing is enforced.${b.actsThroughGate ? ' This capability\'s actions go through Authority Lab\'s gate; lines it checks say so.' : ' This capability\'s actions don\'t go through Authority Lab\'s gate, so its Boundaries are kept by the people and systems that run it.'} Runtime limits such as amounts per case or per day are set on the authority decision that grants them${terms.limits.length ? `; in force now: ${terms.limits.map((l) => l.text).join('; ')}` : ', and none are in force yet'}.</p>`;
}

// ---------------------------------------------------------------------------
// Review and confirm
// ---------------------------------------------------------------------------

export function reviewView(state, capabilityId, query) {
  const cap = getCapability(state, capabilityId);
  const error = query.get('error');
  const r = setupReview(state, capabilityId);
  const s = r.summary;
  const confirmed = setupState(state, capabilityId) === 'confirmed';
  const snap = setupConfirmation(state, capabilityId);
  const acting = actor(state, capabilityId);
  const isOwner = acting === cap.owner;
  const ctx = Object.entries(s.context);
  const reqs = current(state, capabilityId, 'requirements');
  const targets = current(state, capabilityId, 'criteria');
  const pm = peopleModel(state, capabilityId);
  const { stakeholders: others } = pm;
  const sentence = s.authority.level === null ? 'Its starting authority hasn\'t been chosen.' : r.notDelegated ? 'It is not delegated, by design: it stays at Level 0 and the reason is recorded.' : `Once confirmed it starts at Level ${s.authority.level} — ${s.authority.name}. More authority is earned later, one level at a time.`;
  const { versions: sv } = snap || {};
  const { contract: vB, criteria: vT, requirements: vR, risk: vK, stakeholders: vP } = sv || {};
  return html`${stepHead(cap, 'Review and confirm', confirmed ? 'The setup as it is now. What was confirmed is kept unchanged in the snapshot.' : 'Read the setup back in plain language, then confirm it.', 'Risk informs Authority. Authority is constrained by Boundaries. Together they define the operating envelope.')}
  ${error ? notice('fail', 'Couldn\'t confirm', error) : ''}
  ${confirmed && snap ? notice('pass', 'Setup confirmed', `Confirmed by ${snap.byAt.name} on ${fmtDate(snap.date)}, at Level ${snap.startingLevel}. The snapshot kept what was reviewed: Boundaries v${vB}, Targets v${vT}, Requirements v${vR}, Risk v${vK}, people v${vP}, Context v${snap.contextVersion}${snap.open.length ? `, with ${snap.open.length} item${snap.open.length === 1 ? '' : 's'} open` : ''}. The starting decision record is ${snap.recordId}.`, { link: `#/records/${snap.recordId}`, linkText: 'Decision record' }) : ''}
  <section class="card"><h2>${cap.name}</h2>
    <p>${cap.summary || 'No summary.'} Owned by <strong>${person(cap.owner).name}</strong>. ${LIFECYCLE[s.capability.lifecycle]}. Starting point: ${findStartingPoint(s.capability.template).name}.</p>
    <p><strong>${confirmed ? `It started at Level ${snap ? snap.startingLevel : getCapability(state, capabilityId).authority.level}.` : sentence}</strong>${s.authority.effective && s.authority.effective.status === 'recorded' ? ` What it does today was recorded as Level ${s.authority.effective.level} — ${s.authority.effective.name}; that is shown, not granted.` : ''}</p>
  </section>
  <section class="card"><h2>Context</h2>${ctx.length ? html`<ul class="plain-list">${ctx.map(([k, v]) => html`<li><span class="fact-label">${FIELD[k].label}</span> ${factText(v)}</li>`)}</ul>` : html`<p class="muted">No confirmed facts.</p>`}</section>
  <section class="card"><h2>Risk</h2><p>Overall Risk <strong>${s.risk.overall}</strong>. ${s.risk.why}</p><p class="muted small">Scale: ${s.risk.scale || 'not answered'}. Can it be undone: ${s.risk.reversibility || 'not answered'}. Affected: ${s.risk.exposure || 'not answered'}.</p></section>
  ${r.notDelegated ? '' : html`<section class="card"><h2>Boundaries</h2>${versionList(state, capabilityId, 'contract').length ? boundariesSummary(state, capabilityId) : html`<p class="muted">Not saved yet.</p>`}</section>
  <section class="card"><h2>Requirements and Targets</h2>${reqs.length ? html`<ul class="plain-list">${reqs.map((q) => html`<li>${q.text}${q.kind === 'coverage' ? html` <span class="muted small">coverage rule</span>` : ''}${q.bar === 'needs-decision' ? html` ${badge('decision', 'Needs decision')}` : ''}${targets.filter((t) => t.requirement === q.id).map((t) => html`<div class="muted small">Target: ${t.name}, ${t.bar === 'needs-decision' ? html`${badge('decision', 'Needs decision')}` : t.target}</div>`)}</li>`)}</ul>${targets.filter((t) => !t.requirement).length ? html`<p class="muted small">Other Targets: ${targets.filter((t) => !t.requirement).map((t) => `${t.name} (${t.target})`).join('; ')}</p>` : ''}` : html`<p class="muted">Not saved yet.</p>`}</section>
  <section class="card"><h2>Evidence</h2><p>${criteriaSaved(state, capabilityId) ? coverageText(evidenceCoverage(state, capabilityId)) : 'Set the Requirements first.'}</p></section>`}
  <section class="card"><h2>People</h2><p>Owner: <strong>${person(pm.owner).name}</strong>. Reviewers: ${pm.reviewers.length ? pm.reviewers.map((k) => person(k).name).join(', ') : 'none'}. Stakeholders: ${others.length ? others.map((k) => person(k).name).join(', ') : 'none'}.</p></section>
  ${r.open.length ? html`<section class="card"><h2>Open, and allowed at confirmation</h2><ul class="plain-list">${r.open.map((o) => html`<li>${o}</li>`)}</ul></section>` : ''}
  ${confirmed ? '' : r.ready ? html`<div class="card authorize">
      <p class="eyebrow">Confirm</p>
      <p>Confirming records what you reviewed here, unchanged, and sets the starting authority. ${isOwner ? '' : html`<strong>Only the owner, ${person(cap.owner).name}, can confirm.</strong> Switch "Demo as" to them.`}</p>
      <button class="btn btn-primary btn-block" data-action="confirm-setup" data-capability="${cap.id}" ${isOwner ? '' : raw('disabled')}>Confirm setup as ${person(acting).name}</button>
    </div>` : notice('watch', 'Not ready to confirm', html`<ul class="plain-list">${r.missing.map((m) => html`<li>${m.text}</li>`)}</ul>`)}
  <p><a class="btn" href="#/capabilities/${cap.id}/setup">Back to setup</a></p>`;
}
