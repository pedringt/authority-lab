import { html, badge, notice, selectField, person, fmtDate } from '../ui.js';
import { getCapability, capData, current, versionList, actor, RISK_OPTIONS, authorityLabel, decisionRequired, lastDecisionId, activePeople, workflowOf, defaultsFor, performanceResultsSeen, evidenceCoverage, coverageText } from '../store/index.js';
import { pickTemplate } from '../data/contract-templates.js';

// The three risk questions, answered in plain words. The stored values are
// logic keys (RISK_OPTIONS), so only the labels change here.
export const RISK_ANSWERS = {
  impact: [['Low', 'Minor: easy to live with'], ['Medium', 'Noticeable: it costs time or money to fix'], ['High', 'Serious: real harm or loss']],
  reversibility: [['Easy to reverse', 'Yes, easily'], ['Recoverable with effort', 'Yes, with some effort'], ['Difficult to reverse', 'Hard or impossible to undo']],
  exposure: [['Internal only', 'Only our own team'], ['Customer-facing', 'Customers'], ['Financial / consequential', 'Money, or something with legal or financial consequences']],
};

// "What does it do today?" Context, not authority: every answer starts the
// capability at Level 0 or Level 1 (the store's TODAY map decides the level).
export const TODAY_CHOICES = [
  ['nothing', 'Nothing yet', 'People do this work today. It starts at Observe (Level 0): it watches, and nothing it produces is used.'],
  ['recommends', 'Recommends', 'It suggests; a person decides. It starts at Recommend (Level 1).'],
  ['drafts', 'Drafts for approval', 'It prepares the action and a person approves each one. It starts at Recommend (Level 1) until that is reviewed and formally approved.'],
  ['acts', 'Already acts in some cases', 'It takes the action automatically in some cases. It starts at Recommend (Level 1) until that autonomy is reviewed and formally approved.'],
  ['not-delegated', 'Not something to delegate', 'This stays with people, by design. It stays at Observe (Level 0), and the reason is recorded.'],
];

// Add a capability: four plain questions, one submit. Failure types and a
// starting rationale are optional; nothing starts above Level 1.
export function addCapabilityView(state, query) {
  const error = query.get('error');
  const acting = person(actor(state));
  const owners = Object.entries(activePeople(state)).map(([k, p]) => [k, `${p.name}, ${p.role}`]);
  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/capabilities">Capabilities</a> · ${workflowOf(state).name}</p>
      <h1>Add a capability</h1>
      <p class="lede">One piece of work that could earn more autonomy, like "Recommend a refund".</p>
    </div>
  </div>
  ${error ? notice('fail', 'Could not add the capability', error) : ''}
  <form class="setup-form onboard-form" data-form="add-capability" novalidate>
    <div class="onboard-group">
      <h2 class="onboard-q">What does it do?</h2>
      <label class="field field-stack"><span>Name</span><input name="name" type="text" required maxlength="80" placeholder="e.g. Recommend a refund" data-action="check-name" autocomplete="off"></label>
      <p class="form-hint muted small" data-name-warning hidden></p>
      <label class="field field-stack"><span>In one sentence</span><input name="summary" type="text" maxlength="160" placeholder="e.g. Reviews refund requests and recommends whether to issue one."></label>
    </div>

    <div class="onboard-group">
      <h2 class="onboard-q">Who owns it?</h2>
      ${selectField('owner', 'Owner', owners, actor(state), { action: 'choose-owner' })}
      <p class="muted small">Choosing an owner also switches "Demo as" to them.</p>
    </div>

    <div class="onboard-group">
      <h2 class="onboard-q">What happens if it gets this wrong?</h2>
      <div class="three-col">
        ${selectField('impact', 'How serious would a bad decision be?', RISK_ANSWERS.impact, '', { placeholder: 'Choose' })}
        ${selectField('reversibility', 'Can it be undone?', RISK_ANSWERS.reversibility, '', { placeholder: 'Choose' })}
        ${selectField('exposure', 'Who or what is affected?', RISK_ANSWERS.exposure, '', { placeholder: 'Choose' })}
      </div>
      <p class="muted small">The riskier it is, the more evidence it needs before it gets more autonomy.</p>
    </div>

    <div class="onboard-group">
      <h2 class="onboard-q">What does it do today?</h2>
      <div class="option-list" role="radiogroup" aria-label="What does it do today?">
        ${TODAY_CHOICES.map(([value, label, text]) => html`<label class="option"><input type="radio" name="today" value="${value}"><span class="option-body"><strong>${label}</strong><span class="muted small">${text}</span></span></label>`)}
      </div>
      <label class="field field-stack"><span>Why? <span class="muted small">(required if it stays with people)</span></span><textarea name="rationale" rows="2" placeholder="e.g. Deletion can't be undone and happens rarely. A person does it every time."></textarea></label>
    </div>

    <details class="onboard-more">
      <summary>More detail (optional)</summary>
      <p class="fact-label">What could go wrong?</p>
      <p class="muted small">Leave these blank to use the defaults for its risk profile.</p>
      <div class="check-grid">${RISK_OPTIONS.failureTypes.map((f) => html`<label class="check"><input type="checkbox" name="failureTypes" value="${f}"><span>${f}</span></label>`)}</div>
      <label class="field field-stack"><span>Note</span><input name="riskNote" type="text" maxlength="200" placeholder="What a mistake would cost, and who would notice."></label>
    </details>

    <p class="muted small">This writes its first decision record, authorized by <strong>${acting.name}</strong> (${acting.role}) on ${fmtDate(state.today)}.</p>
    <button class="btn btn-primary" type="submit">Add capability</button>
  </form>`;
}

// The setup steps, shown as three stages (#126, Paige 2026-10-13): Define;
// Evidence (what good looks like, which evidence judges it, what's covered,
// and filling the gaps, where tests are one way among several); Decide.
export const SETUP_STAGES = [
  { id: 'define', title: 'Define', text: 'What it does, what could go wrong, and its boundaries.' },
  { id: 'evidence', title: 'Evidence', text: 'What good looks like, which evidence shows it, and what is still missing.' },
  { id: 'decide', title: 'Decide', text: 'Who decides, and the authority decision.' },
];

const EXPOSURE_WORD = { 'Internal only': 'internal', 'Customer-facing': 'customer-facing', 'Financial / consequential': 'financial' };
const riskPhrase = (risk) => `${String(risk.impact || 'Medium').toLowerCase()}-impact ${EXPOSURE_WORD[risk.exposure] || 'internal'}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// What it already does in the real world, recorded when it was added.
function todayNote(state, cap) {
  const first = state.decisionRecords.find((r) => r.capabilityId === cap.id);
  return first && first.context && first.context.note ? first.context.note : null;
}

// What a capability still needs before its first authority decision. Each
// step starts from a strong default to review rather than a blank page.
export function setupSteps(state, capabilityId) {
  const cap = getCapability(state, capabilityId);
  const d = capData(state, capabilityId);
  const notDelegated = cap.status === 'not-delegated';
  const risk = current(state, capabilityId, 'risk');
  const contractDone = versionList(state, capabilityId, 'contract').length > 0;
  const criteriaDone = versionList(state, capabilityId, 'criteria').length > 0 && versionList(state, capabilityId, 'requirements').length > 0;
  const stakeholdersDone = current(state, capabilityId, 'stakeholders').length > 0;
  // Any measured result counts, from any source (#126): tests are one way.
  const hasResults = performanceResultsSeen(state, capabilityId);
  const cov = evidenceCoverage(state, capabilityId);
  const note = todayNote(state, cap);
  const draft = d.contractDraft && !d.contractDraft.finalizedAt;
  const template = pickTemplate(risk);
  const ruleCount = Object.values(template.sections).reduce((n, lines) => n + lines.length, 0);
  const defaults = defaultsFor(state, capabilityId);
  const steps = [
    { id: 'define', stage: 'define', title: 'Say what it does and what could go wrong', done: true, text: `${cap.name} has an owner and a risk profile, and starts at ${authorityLabel(cap.authority)}.${note ? ` ${note}` : ''}`, link: `#/capabilities/${cap.id}?tab=status&show=rules`, linkText: 'Risk profile' },
    { id: 'contract', stage: 'define', title: 'Set the boundaries', done: contractDone, text: contractDone ? 'What it may do on its own, when it asks a person, what it must never do, and when its autonomy is reduced automatically.' : `These are the default safety limits for this risk profile: ${plural(ruleCount, 'starter rule')} for a ${riskPhrase(risk)} capability. Review them, change what doesn't fit, then finalize.${draft ? ' You have a draft in progress.' : ''}`, link: `#/capabilities/${cap.id}/contract/build`, linkText: draft ? 'Continue the draft' : contractDone ? 'Rules' : 'Review the rules' },
    { id: 'criteria', stage: 'evidence', title: 'Set what good looks like', done: criteriaDone, text: criteriaDone ? 'Targets say what good looks like. Decision requirements say what must be true before authority changes. Both lock when the first results come in.' : `For a ${riskPhrase(risk)} capability, we recommend these checks: ${plural(defaults.criteria.length, 'target')} and ${plural(defaults.requirements.length, 'decision requirement')}. They lock when the first results come in, so results can't move the bar.`, link: `#/capabilities/${cap.id}/criteria/edit`, linkText: criteriaDone ? 'Targets' : 'Review the checks' },
    { id: 'configure', stage: 'evidence', title: 'Configure evidence', done: criteriaDone && cov.total > 0 && cov.mapped === cov.total, text: cov.mapped === cov.total && cov.total ? 'Every decision requirement says which evidence judges it.' : `Choose which evidence judges each decision requirement: a connected source, Authority Lab tests, or a manual review. ${cov.total ? `${cov.mapped} of ${cov.total} chosen so far.` : ''}`, link: `#/capabilities/${cap.id}/evidence/configure`, linkText: 'Configure evidence', needs: criteriaDone },
    { id: 'coverage', stage: 'evidence', title: 'Review evidence coverage', done: criteriaDone && cov.total > 0 && !cov.requirements.some((c) => c.status === 'no-source' || c.status === 'no-data'), text: criteriaDone ? `${coverageText(cov)}` : 'Once the checks are set, see which have enough evidence, which are stale, and which have none.', link: `#/capabilities/${cap.id}/evidence/configure`, linkText: 'Coverage', needs: criteriaDone },
    { id: 'gaps', stage: 'evidence', optional: true, title: 'Fill the gaps', done: criteriaDone && cov.total > 0 && cov.sufficient === cov.total, text: 'Where evidence is missing: add test cases, record a review by hand, run a pilot, or have another source connected. Not every capability needs local tests: a connected eval can be enough.', link: `#/capabilities/${cap.id}/evidence/configure`, linkText: 'See the gaps', needs: criteriaDone },
    { id: 'stakeholders', stage: 'decide', title: 'Name who decides', done: stakeholdersDone, text: stakeholdersDone ? 'Their views are recorded with each authority decision, and they can approve changes.' : 'The people whose views are recorded with each authority decision; they can also approve changes. Name them before the first results come in: after that, changing who is involved needs sign-off.', link: `#/capabilities/${cap.id}/stakeholders/edit`, linkText: stakeholdersDone ? 'Stakeholders' : 'Name the people' },
    { id: 'decision', stage: 'decide', title: 'Make the first authority decision', done: Boolean(lastDecisionId(state, cap.id) && cap.authority.level >= 2), text: note ? `Review the evidence, then decide. This is where what it already does today is reviewed and formally approved, one level at a time, starting with Draft (Level 2). A person decides; Authority Lab only recommends.` : 'Review the evidence, then decide. Usually a move to Draft (Level 2) for a small pilot. A person decides; Authority Lab only recommends.', link: decisionRequired(state, cap.id) ? `#/capabilities/${cap.id}/decision` : null, linkText: 'Authority decision', needs: hasResults, propose: hasResults && !decisionRequired(state, cap.id) && cap.authority.level < 2 ? cap.authority.level + 1 : null },
  ];
  if (notDelegated) {
    return [steps[0], { id: 'not-delegated', stage: 'define', title: 'Not delegated, by design', done: true, text: 'This capability stays at Level 0 on purpose. Giving it any authority later needs a new decision.', link: `#/records/${lastDecisionId(state, cap.id) || ''}`, linkText: 'Decision record' }];
  }
  let nextFound = false;
  return steps.map((st) => {
    // An optional step is never the one thing to do next.
    const next = !st.done && !st.optional && !nextFound;
    if (next) nextFound = true;
    return { ...st, next };
  });
}

export function nextStep(state, capabilityId) {
  return setupSteps(state, capabilityId).find((s) => s.next) || null;
}

export function setupView(state, capabilityId, query) {
  const cap = getCapability(state, capabilityId);
  if (!cap) return html`<div class="page-head"><h1>Capability not found</h1></div>`;
  const steps = setupSteps(state, capabilityId);
  const focus = query.get('step');
  const done = steps.filter((s) => s.done).length;
  const doneHref = (st) => (st.id === 'contract' ? `#/capabilities/${cap.id}?tab=status&show=rules` : st.id === 'criteria' ? `#/capabilities/${cap.id}?tab=decide&show=targets` : st.id === 'stakeholders' ? `#/capabilities/${cap.id}` : st.link);
  const stepItem = (st) => html`<li class="setup-step ${st.done ? 'is-done' : ''} ${st.next ? 'is-next' : ''} ${focus === st.id ? 'is-focus' : ''}" id="step-${st.id}">
    <div class="setup-step-head"><span class="req-mark" aria-hidden="true">${st.done ? '✓' : shown.indexOf(st) + 1}</span><strong>${st.title}</strong>${st.done ? html`<span class="muted small">Done</span>` : st.next ? badge('decision', 'Next') : ''}</div>
    <p class="muted">${st.text}</p>
    ${st.done && st.link ? html`<a href="${doneHref(st)}">${st.linkText}</a>` : ''}
    ${st.done && st.id === 'decision' && lastDecisionId(state, cap.id) ? html`<a href="#/records/${lastDecisionId(state, cap.id)}">Decision record</a>` : ''}
    ${!st.done && st.link && st.needs !== false ? html`<a class="btn btn-sm ${st.next ? 'btn-primary' : ''}" href="${st.link}">${st.linkText}</a>` : ''}
    ${!st.done && st.propose ? html`<button class="btn btn-sm btn-primary" data-action="propose-authority" data-capability="${cap.id}" data-level="${st.propose}">Propose a move to Level ${st.propose}</button>` : ''}
    ${!st.done && st.needs === false ? html`<p class="muted small">Finish the earlier steps first.</p>` : ''}
  </li>`;
  const stages = cap.status === 'not-delegated'
    ? [{ ...SETUP_STAGES[0], steps }]
    : SETUP_STAGES.map((stage) => ({ ...stage, steps: steps.filter((st) => st.stage === stage.id) }));
  // Numbered in the order shown.
  const shown = stages.flatMap((stage) => stage.steps);
  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/capabilities">Capabilities</a> · <a href="#/capabilities/${cap.id}">${cap.name}</a></p>
      <h1>Setup</h1>
      <p class="lede">${done} of ${steps.length} steps done.</p>
    </div>
  </div>
  <div class="setup-stages">${stages.map((stage, i) => {
    const n = stage.steps.filter((st) => st.done).length;
    return html`<section class="setup-stage ${n === stage.steps.length ? 'is-done' : ''}" id="stage-${stage.id}">
      <div class="setup-stage-head"><h2><span class="muted">${i + 1}.</span> ${stage.title}</h2><span class="muted small">${n} of ${stage.steps.length} done</span></div>
      <p class="muted small">${stage.text}</p>
      <ol class="setup-steps">${stage.steps.map(stepItem)}</ol>
    </section>`;
  })}</div>`;
}

// The empty state for a capability tab: what is missing and where to go next.
export function emptyState(state, capabilityId, what, stepId) {
  const steps = setupSteps(state, capabilityId);
  const step = steps.find((s) => s.id === stepId) || nextStep(state, capabilityId);
  const next = nextStep(state, capabilityId);
  return html`<div class="empty-state card">
    <p><strong>${what}</strong></p>
    ${step ? html`<p class="muted">${step.done ? step.text : `Next setup step: ${step.title.toLowerCase()}. ${step.text}`}</p>` : ''}
    <p>${step && !step.done && step.link && step.needs !== false ? html`<a class="btn btn-sm btn-primary" href="${step.link}">${step.linkText}</a> ` : ''}<a class="btn btn-sm" href="#/capabilities/${capabilityId}/setup?step=${step ? step.id : ''}">Open setup${next ? ` · ${next.title}` : ''}</a></p>
  </div>`;
}
