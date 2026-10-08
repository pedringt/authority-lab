import * as seed from '../data/seed.js';
import { html, raw, badge, notice, selectField, person, section, kv } from '../ui.js';
import { getCapability, capData, current, versionList, actor, vagueNameWarning, RISK_OPTIONS, authorityLabel, readiness, decisionRequired, lastDecisionId, activePeople } from '../store.js';

// Add a capability: define it, give it a risk profile, choose its starting
// authority. One page, three sections, one submit. Nothing starts above Level 1.
export function addCapabilityView(state, query) {
  const error = query.get('error');
  const acting = person(actor(state));
  const owners = Object.entries(activePeople(state)).map(([k, p]) => [k, `${p.name}, ${p.role}`]);
  return html`<div class="page-head">
    <div>
      <p class="eyebrow"><a href="#/capabilities">Capabilities</a> · ${seed.workflow.name}</p>
      <h1>Add a capability</h1>
      <p class="lede">One discrete thing the AI might be trusted to do in this workflow. It starts at Level 0 or Level 1; authority above that is earned through the contract, criteria, tests and a decision.</p>
    </div>
  </div>
  ${error ? notice('fail', 'Could not add the capability', error) : ''}
  <form class="setup-form" data-form="add-capability" novalidate>
    ${section('1. Define', html`<div class="card">
      <label class="field field-stack"><span>Name</span><input name="name" type="text" required maxlength="80" placeholder="e.g. Order status lookup" data-action="check-name" autocomplete="off"></label>
      <p class="form-hint muted small" data-name-warning hidden></p>
      <label class="field field-stack"><span>What it does</span><input name="summary" type="text" maxlength="160" placeholder="One sentence. e.g. Answers where an order is from the carrier feed."></label>
      ${selectField('owner', 'Owner', owners, actor(state), { action: 'choose-owner' })}
      <p class="muted small">Choosing an owner switches the demo picker ("Demo: acting as") to them. Whoever is acting when you submit is recorded as the authorizer; if that is not the owner, the record shows both.</p>
    </div>`, { subtitle: 'A capability is small enough to hold one authority level. "Handle refunds" is a process; "Recommend a refund" is a capability.' })}

    ${section('2. Risk profile', html`<div class="card">
      <div class="three-col">
        ${selectField('impact', 'Impact', RISK_OPTIONS.impact, '', { placeholder: 'Choose' })}
        ${selectField('reversibility', 'Reversibility', RISK_OPTIONS.reversibility, '', { placeholder: 'Choose' })}
        ${selectField('exposure', 'Exposure', RISK_OPTIONS.exposure, '', { placeholder: 'Choose' })}
      </div>
      <p class="fact-label">Failure types to watch</p>
      <div class="check-grid">${RISK_OPTIONS.failureTypes.map((f) => html`<label class="check"><input type="checkbox" name="failureTypes" value="${f}"><span>${f}</span></label>`)}</div>
      <label class="field field-stack"><span>Note (optional)</span><input name="riskNote" type="text" maxlength="200" placeholder="What a mistake costs, and who notices."></label>
    </div>`, { subtitle: 'The risk profile sets how much evidence an authority increase will need.' })}

    ${section('3. Starting authority', html`<div class="card">
      <div class="option-list" role="radiogroup" aria-label="Starting authority">
        <label class="option"><input type="radio" name="starting" value="0" checked><span class="option-body"><strong>Level 0 — Observe</strong><span class="muted small">The AI sees the input and produces nothing. The usual starting point.</span></span></label>
        <label class="option"><input type="radio" name="starting" value="1"><span class="option-body"><strong>Level 1 — Recommend</strong><span class="muted small">The AI suggests; a person decides. Use when you already have a working recommender to compare against people.</span></span></label>
        <label class="option"><input type="radio" name="starting" value="not-delegated"><span class="option-body"><strong>Not delegated, by design</strong><span class="muted small">Stays at Level 0 on purpose. Needs a written rationale; it is a decision, and it is recorded as one.</span></span></label>
      </div>
      <label class="field field-stack"><span>Rationale <span class="muted small">(required for "not delegated"; otherwise optional)</span></span><textarea name="rationale" rows="3" placeholder="Why this starting point."></textarea></label>
      <p class="muted small">Adding the capability writes its first decision record, authorized by <strong>${acting.name}</strong> (${acting.role}), dated ${seed.TODAY.replace(/(\d+)-(\d+)-(\d+)/, '$2/$3/$1')}. Change who is acting in the top bar.</p>
      <button class="btn btn-primary" type="submit">Add capability and write its first record</button>
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
    { id: 'define', title: 'Define the capability', done: true, text: `${cap.name} is defined with an owner and a risk profile. Its starting authority is ${authorityLabel(cap.authority)}.`, link: `#/capabilities/${cap.id}?tab=contract`, linkText: 'Risk profile' },
    { id: 'contract', title: 'Finalize the delegation contract', done: contractDone, text: `What the AI may do, must ask about, must never do, when it escalates, and when software pulls authority back. A template is picked by the risk profile.${d.contractDraft && !d.contractDraft.finalizedAt ? ' A draft is in progress.' : ''}`, link: `#/capabilities/${cap.id}/contract/build`, linkText: d.contractDraft && !d.contractDraft.finalizedAt ? 'Continue the draft' : contractDone ? 'Contract' : 'Open the contract builder' },
    { id: 'criteria', title: 'Save success criteria and evidence requirements', done: criteriaDone, text: 'What good looks like, as thresholds, and what must be true before the first authority change. These lock on the first test run.', link: `#/capabilities/${cap.id}/criteria/edit`, linkText: criteriaDone ? 'Success criteria' : 'Open the editor' },
    { id: 'stakeholders', title: 'Name the stakeholders', done: stakeholdersDone, text: 'The people whose positions are recorded at decision time.', link: `#/capabilities/${cap.id}/stakeholders/edit`, linkText: stakeholdersDone ? 'Stakeholders' : 'Open the editor' },
    { id: 'scenarios', title: 'Write the scenario library', done: scenariosDone, text: 'Standard, ambiguous, adversarial, high-impact and edge cases. Twenty to thirty is enough to start; a starter set is available.', link: `#/capabilities/${cap.id}/scenarios/edit`, linkText: scenariosDone ? 'Scenario library' : 'Open the library' },
    { id: 'tests', title: 'Run the test suite', done: testsDone, text: 'The first run locks the criteria and produces the first evidence.', link: `#/tests?capability=${cap.id}`, linkText: 'Testing ground', needs: scenariosDone && criteriaDone },
    { id: 'decision', title: 'Authorize the first authority change', done: Boolean(lastDecisionId(state, cap.id) && cap.authority.level >= 2), text: 'Usually a move to Draft with a small pilot scope. The owner authorizes; the system can only recommend.', link: decisionRequired(state, cap.id) ? `#/capabilities/${cap.id}/decision` : null, linkText: 'Authority decision', needs: testsDone, propose: testsDone && !decisionRequired(state, cap.id) && cap.authority.level < 2 ? cap.authority.level + 1 : null },
  ];
  if (notDelegated) {
    return [steps[0], { id: 'not-delegated', title: 'Not delegated, by design', done: true, text: 'This capability stays at Level 0 on purpose. Any later delegation starts with a new decision.', link: `#/decisions/${lastDecisionId(state, cap.id) || ''}`, linkText: 'Decision record' }];
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
      <p class="lede">${done} of ${steps.length} steps done. Each step has to be real before the next one means anything: a contract before criteria, criteria before tests, tests before a decision.</p>
    </div>
  </div>
  <ol class="setup-steps">${steps.map((st, i) => html`<li class="card setup-step ${st.done ? 'is-done' : ''} ${st.next ? 'is-next' : ''} ${focus === st.id ? 'is-focus' : ''}" id="step-${st.id}">
    <div class="setup-step-head"><span class="req-mark" aria-hidden="true">${st.done ? '✓' : i + 1}</span><strong>${st.title}</strong>${st.done ? badge('pass', 'Done') : st.next ? badge('decision', 'Next') : badge('neutral', 'Later')}</div>
    <p class="muted">${st.text}</p>
    ${st.done && st.link ? html`<a href="${st.id === 'contract' ? `#/capabilities/${cap.id}?tab=contract` : st.id === 'criteria' ? `#/capabilities/${cap.id}?tab=criteria` : st.id === 'stakeholders' ? `#/capabilities/${cap.id}?tab=stakeholders` : st.link}">${st.linkText}</a>` : ''}
    ${st.done && st.id === 'decision' && lastDecisionId(state, cap.id) ? html`<a href="#/decisions/${lastDecisionId(state, cap.id)}">Decision record</a>` : ''}
    ${!st.done && st.link && st.needs !== false ? html`<a class="btn btn-sm" href="${st.link}">${st.linkText}</a>` : ''}
    ${!st.done && st.propose ? html`<button class="btn btn-sm btn-primary" data-action="propose-authority" data-capability="${cap.id}" data-level="${st.propose}">Propose a move to Level ${st.propose}</button>` : ''}
    ${!st.done && st.soon ? html`<p class="muted small">Not available in this prototype yet: ${st.soon}.</p>` : ''}
    ${!st.done && st.needs === false ? html`<p class="muted small">Waiting on an earlier step.</p>` : ''}
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
