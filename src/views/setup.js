import * as seed from '../data/seed.js';
import { html, raw, badge, notice, selectField, person, section, kv, lede } from '../ui.js';
import { getCapability, capData, current, versionList, actor, vagueNameWarning, RISK_OPTIONS, authorityLabel, readiness, decisionRequired, lastDecisionId, activePeople, workflowOf } from '../store/index.js';

// Add a capability: define it, give it a risk profile, choose its starting
// authority. One page, three sections, one submit. Nothing starts above Level 1.
export function addCapabilityView(state, query) {
  const error = query.get('error');
  const acting = person(actor(state));
  const owners = Object.entries(activePeople(state)).map(([k, p]) => [k, `${p.name}, ${p.role}`]);
  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/capabilities">Capabilities</a> · ${workflowOf(state).name}</p>
      <h1>Add a capability</h1>
      ${lede('Add one thing the AI may eventually do on its own.', 'It starts at Level 0 (Observe) or Level 1 (Recommend). It gets more authority only after its rules, targets and tests are in place and someone records a decision.')}
    </div>
  </div>
  ${error ? notice('fail', 'Could not add the capability', error) : ''}
  <form class="setup-form" data-form="add-capability" novalidate>
    ${section('1. Describe it', html`<div class="card">
      <label class="field field-stack"><span>Name</span><input name="name" type="text" required maxlength="80" placeholder="e.g. Order status lookup" data-action="check-name" autocomplete="off"></label>
      <p class="form-hint muted small" data-name-warning hidden></p>
      <label class="field field-stack"><span>What it does</span><input name="summary" type="text" maxlength="160" placeholder="One sentence, e.g. Tells a customer where their order is, using the carrier feed."></label>
      ${selectField('owner', 'Owner', owners, actor(state), { action: 'choose-owner' })}
      <p class="muted small">Choosing an owner also switches "Acting as" to them. The record shows whoever is acting when you add it as the person who authorized it. If that person isn't the owner, the record names both.</p>
    </div>`, { subtitle: '"Handle refunds" is too broad. "Recommend a refund" is a capability: one action, small enough to have a single authority level.' })}

    ${section('2. Risk profile', html`<div class="card">
      <div class="three-col">
        ${selectField('impact', 'How serious would a bad decision be?', RISK_OPTIONS.impact, '', { placeholder: 'Choose' })}
        ${selectField('reversibility', 'Can it be undone?', RISK_OPTIONS.reversibility, '', { placeholder: 'Choose' })}
        ${selectField('exposure', 'Who or what is affected?', RISK_OPTIONS.exposure, '', { placeholder: 'Choose' })}
      </div>
      <p class="fact-label">What could go wrong?</p>
      <div class="check-grid">${RISK_OPTIONS.failureTypes.map((f) => html`<label class="check"><input type="checkbox" name="failureTypes" value="${f}"><span>${f}</span></label>`)}</div>
      <label class="field field-stack"><span>Note (optional)</span><input name="riskNote" type="text" maxlength="200" placeholder="What a mistake would cost, and who would notice."></label>
    </div>`, { subtitle: 'The riskier it is, the more evidence it needs before it gets more authority.' })}

    ${section('3. Starting authority', html`<div class="card">
      <div class="option-list" role="radiogroup" aria-label="Starting authority">
        <label class="option"><input type="radio" name="starting" value="0" checked><span class="option-body"><strong>Level 0 — Observe</strong><span class="muted small">The AI sees the work but produces nothing anyone acts on. The usual starting point.</span></span></label>
        <label class="option"><input type="radio" name="starting" value="1"><span class="option-body"><strong>Level 1 — Recommend</strong><span class="muted small">The AI suggests; a person decides. Start here if the AI already makes useful suggestions and you want to compare them with what people decide.</span></span></label>
        <label class="option"><input type="radio" name="starting" value="not-delegated"><span class="option-body"><strong>Not delegated, by design</strong><span class="muted small">The AI won't do this. It stays at Level 0 on purpose. Say why: this is recorded as a decision.</span></span></label>
      </div>
      <label class="field field-stack"><span>Why this starting point? <span class="muted small">(required if not delegated)</span></span><textarea name="rationale" rows="3" placeholder="e.g. We want to compare its suggestions with agents' decisions first."></textarea></label>
      <p class="muted small">This creates its first decision record, authorized by <strong>${acting.name}</strong> (${acting.role}) on ${seed.TODAY.replace(/(\d+)-(\d+)-(\d+)/, '$2/$3/$1')}. To record someone else, change "Acting as".</p>
      <button class="btn btn-primary" type="submit">Add capability</button>
    </div>`)}
  </form>`;
}

// What a capability still needs before its first authority decision.
export function setupSteps(state, capabilityId) {
  const cap = getCapability(state, capabilityId);
  const d = capData(state, capabilityId);
  const notDelegated = cap.status === 'not-delegated';
  const contractDone = versionList(state, capabilityId, 'contract').length > 0;
  const criteriaDone = versionList(state, capabilityId, 'criteria').length > 0 && versionList(state, capabilityId, 'requirements').length > 0;
  const stakeholdersDone = current(state, capabilityId, 'stakeholders').length > 0;
  const scenariosDone = d.scenarios.length > 0;
  const testsDone = Boolean(d.testRun.lastRun);
  const steps = [
    { id: 'define', title: 'Define the capability', done: true, text: `${cap.name} has an owner, a risk profile and a starting authority of ${authorityLabel(cap.authority)}.`, link: `#/capabilities/${cap.id}?tab=status&show=rules`, linkText: 'Risk profile' },
    { id: 'contract', title: 'Set the rules', done: contractDone, text: `What the AI may do, when it asks a person, what it must never do, and when its authority is reduced automatically. The starter rules are chosen from the risk profile.${d.contractDraft && !d.contractDraft.finalizedAt ? ' You have a draft in progress.' : ''}`, link: `#/capabilities/${cap.id}/contract/build`, linkText: d.contractDraft && !d.contractDraft.finalizedAt ? 'Continue the draft' : contractDone ? 'Rules' : 'Write the rules' },
    { id: 'criteria', title: 'Set targets and decision requirements', done: criteriaDone, text: 'Targets say what good looks like. Decision requirements say what must be true before authority changes. Both lock when the first test runs, so results can\'t move the goalposts.', link: `#/capabilities/${cap.id}/criteria/edit`, linkText: criteriaDone ? 'Targets' : 'Set targets' },
    { id: 'stakeholders', title: 'Name the stakeholders', done: stakeholdersDone, text: 'The people whose views are recorded with each authority decision. They are also who can approve changes.', link: `#/capabilities/${cap.id}/stakeholders/edit`, linkText: stakeholdersDone ? 'Stakeholders' : 'Name stakeholders' },
    { id: 'scenarios', title: 'Write the scenario library', done: scenariosDone, text: 'Typical, ambiguous, adversarial, high-impact and edge cases. Twenty to thirty is enough to start, and there is a starter set you can add.', link: `#/capabilities/${cap.id}/scenarios/edit`, linkText: scenariosDone ? 'Scenario library' : 'Open the library' },
    { id: 'tests', title: 'Run the test suite', done: testsDone, text: 'The first run produces the first evidence and locks the targets and decision requirements.', link: `#/capabilities/${cap.id}?tab=decide&show=tests`, linkText: 'Tests', needs: scenariosDone && criteriaDone },
    { id: 'decision', title: 'Decide the first authority change', done: Boolean(lastDecisionId(state, cap.id) && cap.authority.level >= 2), text: 'Usually a move to Draft (Level 2) for a small pilot. The owner decides; Authority Lab only recommends.', link: decisionRequired(state, cap.id) ? `#/capabilities/${cap.id}/decision` : null, linkText: 'Authority decision', needs: testsDone, propose: testsDone && !decisionRequired(state, cap.id) && cap.authority.level < 2 ? cap.authority.level + 1 : null },
  ];
  if (notDelegated) {
    return [steps[0], { id: 'not-delegated', title: 'Not delegated, by design', done: true, text: 'This capability stays at Level 0 on purpose. Giving it any authority later needs a new decision.', link: `#/records/${lastDecisionId(state, cap.id) || ''}`, linkText: 'Decision record' }];
  }
  let nextFound = false;
  return steps.map((st) => {
    const next = !st.done && !nextFound;
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
  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/capabilities">Capabilities</a> · <a href="#/capabilities/${cap.id}">${cap.name}</a></p>
      <h1>Setup</h1>
      ${lede(html`${done} of ${steps.length} steps done.`, 'Work through these in order: rules before targets, targets before tests, tests before a decision.')}
    </div>
  </div>
  <ol class="setup-steps">${steps.map((st, i) => html`<li class="card setup-step ${st.done ? 'is-done' : ''} ${st.next ? 'is-next' : ''} ${focus === st.id ? 'is-focus' : ''}" id="step-${st.id}">
    <div class="setup-step-head"><span class="req-mark" aria-hidden="true">${st.done ? '✓' : i + 1}</span><strong>${st.title}</strong>${st.done ? badge('pass', 'Done') : st.next ? badge('decision', 'Next') : badge('neutral', 'Later')}</div>
    <p class="muted">${st.text}</p>
    ${st.done && st.link ? html`<a href="${st.id === 'contract' ? `#/capabilities/${cap.id}?tab=status&show=rules` : st.id === 'criteria' ? `#/capabilities/${cap.id}?tab=decide&show=targets` : st.id === 'stakeholders' ? `#/capabilities/${cap.id}` : st.link}">${st.linkText}</a>` : ''}
    ${st.done && st.id === 'decision' && lastDecisionId(state, cap.id) ? html`<a href="#/records/${lastDecisionId(state, cap.id)}">Decision record</a>` : ''}
    ${!st.done && st.link && st.needs !== false ? html`<a class="btn btn-sm" href="${st.link}">${st.linkText}</a>` : ''}
    ${!st.done && st.propose ? html`<button class="btn btn-sm btn-primary" data-action="propose-authority" data-capability="${cap.id}" data-level="${st.propose}">Propose a move to Level ${st.propose}</button>` : ''}
    ${!st.done && st.soon ? html`<p class="muted small">Not available in this prototype yet: ${st.soon}.</p>` : ''}
    ${!st.done && st.needs === false ? html`<p class="muted small">Finish the earlier steps first.</p>` : ''}
  </li>`)}</ol>`;
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
