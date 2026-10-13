// The first-run choice and the guided demo (redesign, 2026-10-12).
//
// The guided demo follows one capability, Refund recommendation, from human
// review to limited autonomy and back. It runs on its own copy of the demo
// state, so nothing it does touches the workspace, and every step uses the
// real store: the test suite really runs, the decision is really authorized,
// the safety limit is really crossed and the review is really recorded. Each
// step teaches one idea, and concepts appear only when they're needed.

import { html, fmtDate } from '../ui.js';
import { getCapability, capData, current, readiness, testSummary, levelName, reviewEligibility, reviewNeeded, people, workspaceOf, workflowOf } from '../store/index.js';

export const GUIDE_STEPS = ['Define the capability', 'Current autonomy', 'Set the boundaries', 'What would justify more autonomy', 'See the results', 'Make the decision', 'What happens if things go wrong'];

const LADDER = [
  ['Observe', 'Watches; produces nothing'],
  ['Recommend', 'Suggests; a person decides'],
  ['Draft', 'Prepares the action; a person approves every one'],
  ['Act within limits', 'Runs automatically inside limits'],
  ['Broad autonomy', 'Handles most cases automatically'],
];

// The first visit: the idea in one sentence, the four principles, two paths.
export function welcomeView() {
  return html`<div class="welcome">
    <p class="eyebrow">Authority Lab</p>
    <h1>Decide when an AI workflow is ready for more autonomy.</h1>
    <p class="welcome-idea">Use test results and production evidence to decide how much autonomy to allow. People set the boundaries, and software enforces them.</p>
    <div class="welcome-four">
      <div><strong>1. Start with limited autonomy</strong>Define what the workflow can do and where human review is required.</div>
      <div><strong>2. Evaluate the results</strong>Tests, pilot data and real outcomes show whether more autonomy is justified.</div>
      <div><strong>3. Make the decision</strong>A named person approves any increase in autonomy.</div>
      <div><strong>4. Enforce the boundaries</strong>Software keeps execution inside the approved limits and pulls it back when a safety threshold is crossed.</div>
    </div>
    <div class="welcome-paths">
      <a class="welcome-path is-main" href="#/guide/1" data-action="welcomed"><h2>Guided demo</h2><p>Follow a refund workflow from human review to limited autonomous execution. About 5 minutes.</p><span>Start the guided demo →</span></a>
      <a class="welcome-path" href="#/overview" data-action="welcomed"><h2>Explore the finished workspace</h2><p>Explore five AI capabilities operating at different levels of autonomy.</p><span>Explore →</span></a>
    </div>
  </div>`;
}

const teach = (title, text) => html`<div class="guide-teach"><h1>${title}</h1><p>${text}</p></div>`;

// `g`: { state, role, tested, decided, breached, reviewed } (see main.js).
export function guideView(g, step) {
  const n = Math.min(Math.max(Number(step) || 1, 1), GUIDE_STEPS.length);
  const s = g.state;
  const cap = getCapability(s, g.capabilityId);
  const d = capData(s, cap.id);
  const ready = { 5: g.tested, 6: g.decided, 7: true }[n] ?? true;
  const rail = html`<nav class="guide-rail" aria-label="Guided demo steps"><p class="eyebrow">Guided demo</p><ol>${GUIDE_STEPS.map((t, i) => html`<li class="${i + 1 < n ? 'is-done' : i + 1 === n ? 'is-current' : ''}"><a href="#/guide/${i + 1}">${t}</a></li>`)}</ol>
    <p class="small muted">Runs on its own copy of the demo. <a href="#/overview">Leave the guide</a></p></nav>`;
  const nav = html`<div class="guide-nav">${n > 1 ? html`<a class="btn" href="#/guide/${n - 1}">← Back</a>` : html`<span></span>`}${n < GUIDE_STEPS.length ? (ready ? html`<a class="btn btn-primary" href="#/guide/${n + 1}">Next →</a>` : html`<span class="btn btn-primary is-disabled" aria-disabled="true">Next →</span>`) : ''}</div>`;
  let body;
  if (n === 1) {
    body = html`${teach('We evaluate one capability at a time.', 'Refund recommendation is separate from refund execution, so each can have its own limits, evidence and level of autonomy.')}
      <div class="guide-panel"><p class="eyebrow">${workspaceOf(s).name} · ${workflowOf(s).name}</p><h2>${cap.name}</h2><p>${cap.summary}</p></div>`;
  } else if (n === 2) {
    const rec = s.decisionRecords.filter((r) => r.capabilityId === cap.id).at(-1);
    body = html`${teach('Autonomy is gradual, not on or off.', 'Right now, refund drafts are generated automatically, but a person approves every one before it goes out. That\'s the Draft level.')}
      <div class="guide-ladder">${LADDER.map(([t, text], i) => html`<div class="${i === cap.authority.level ? 'is-now' : ''}"><strong>${t}</strong>${text}</div>`)}</div>
      ${rec ? html`<p class="small muted">Moved to ${levelName(rec.next.level)} on ${fmtDate(rec.date)}, when ${people(s)[rec.authorizedBy] ? people(s)[rec.authorizedBy].name : rec.authorizedBy} approved the pilot.</p>` : ''}`;
  } else if (n === 3) {
    body = html`${teach('Set the boundaries first.', 'Define what can happen automatically, when human review is required, and what is never allowed. Software checks every action against those rules rather than relying on model judgment.')}
      <div class="guide-panel">${boundaries(current(s, cap.id, 'contract'))}</div>`;
  } else if (n === 4) {
    body = html`${teach('What would we need to see before expanding autonomy?', 'These checks were set before the pilot, so the bar doesn\'t move after the results come in.')}
      <p class="small muted">Evaluated after the pilot.</p>
      <ul class="guide-checks">${current(s, cap.id, 'requirements').map((r) => html`<li>${r.text}</li>`)}</ul>`;
  } else if (n === 5) {
    const t = testSummary(s, cap.id);
    const r = readiness(s, cap.id);
    const p = d.pilot;
    const weak = p.segments.filter((x) => x.status === 'insufficient');
    const gap = r.unmet[0];
    body = html`${teach('Overall performance is strong, but high-value refunds are still under-tested.', `The test suite and ${p.cases}-case pilot look good overall. High-value refunds are the remaining evidence gap, and that should shape the decision.`)}
      ${g.tested ? html`<div class="guide-panel"><p class="guide-big">${r.met} of ${r.total} checks met</p>
          <p>${t.passed} of ${t.total} tests passed. One severe miss: a $420 refund recommended on a fraud-flagged account. Automatic action is now blocked whenever an account has a fraud flag.</p>
          <table class="table guide-table"><thead><tr><th>Type of case</th><th class="num">Cases</th><th class="num">Accuracy</th></tr></thead><tbody>${p.segments.map((x) => html`<tr class="${weak.includes(x) ? 'is-weak' : ''}"><td>${x.name}</td><td class="num">${weak.includes(x) && gap ? `${x.cases} of ${String(gap.text).match(/\d+/) ? String(gap.text).match(/\d+/)[0] : '?'} needed` : x.cases}</td><td class="num">${x.accuracy}%</td></tr>`)}</tbody></table></div>`
        : html`<div class="guide-panel"><p>Run the test suite and reveal the pilot results.</p><p><button class="btn btn-primary" data-action="guide-run-tests">Run the tests</button></p></div>`}`;
  } else if (n === 6) {
    const rec = g.decided ? s.decisionRecords.find((x) => x.id === g.decided) : null;
    const c = (rec && rec.conditions) || d.decision.conditions;
    body = html`${teach('Should we expand autonomy for this capability?', 'A named person makes the call, and the decision is recorded. The evidence supports automatic handling for standard refunds up to $50, with larger refunds staying under human review.')}
      ${rec ? html`<div class="guide-recorded"><p class="guide-big">Decision recorded: Expanded autonomy within limits</p><p class="muted">${rec.authorizedByAt ? rec.authorizedByAt.name : rec.authorizedBy} · ${fmtDate(rec.date)}</p>
          <p>Standard refunds up to $${c.maxValue} can now run automatically, capped at $${c.maxDailyTotal} per day. Fraud flags, chargebacks and unclear policy still require human review.</p></div>`
        : html`<div class="guide-panel"><p class="guide-rec"><strong>Recommended: expand autonomy within limits.</strong><br><span class="muted">Allow standard refunds up to $${c.maxValue} to run automatically. Keep high-value refunds under human review.</span></p>
          <ul class="guide-choices"><li class="is-on"><strong>Expand autonomy</strong> <span class="pill is-on">Within limits</span> <span class="pill">Broad autonomy</span></li><li>Keep current limits</li><li>Reduce autonomy</li><li>Pause and redesign</li></ul>
          <p class="small muted">Limits, rollout goals, the rollout plan and the reason are prefilled for the demo.</p>
          <p><button class="btn btn-primary" data-action="guide-decide">Record decision as ${people(s).maya.name}</button></p></div>`}`;
  } else {
    const restricted = reviewNeeded(s, cap.id).restriction;
    const m = d.monitoring;
    const e = reviewEligibility(s, cap.id, g.role);
    const who = people(s)[g.role];
    body = html`${teach('Automation is pulled back automatically when a safety limit is crossed.', 'The system enforces this on its own. A review is required before autonomy can expand again.')}
      ${!g.breached ? html`<div class="guide-verdict"><strong>Within limits</strong><p>No safety limits have been crossed since autonomy was expanded.</p><p><button class="btn" data-action="guide-breach">Simulate a safety-limit breach</button></p></div>`
        : restricted ? html`<div class="guide-verdict is-bad"><strong>This capability was moved back to ${levelName(getCapability(s, cap.id).authority.level)} after crossing a safety limit.</strong><p>Severe errors reached ${m.reading}. Every refund now requires human review.</p></div>
          <div class="guide-panel"><h2>Review what happened</h2>
          ${e.ok ? html`<p class="small muted">Reviewing as ${who.name}, Risk.</p><form data-form="guide-review"><label class="guide-field">What happened?<textarea name="whatHappened" rows="2">Two severe errors on partially returned orders.</textarea></label><p><button class="btn btn-primary" type="submit">Save review</button></p></form>`
            : html`<p>A Risk approver must record the review. The person who approved the autonomy change can't review their own decision.</p><p><strong>For the demo, switch to Daniel Okafor in "Demo as" above.</strong></p>`}</div>`
          : html`<div class="guide-verdict"><strong>Review complete. This capability stays at ${levelName(getCapability(s, cap.id).authority.level)} for now.</strong><p>Any future increase in autonomy needs new evidence and a new decision.</p></div>
          <div class="guide-done"><p class="guide-big">That's Authority Lab.</p><p>Evidence shows when more autonomy is justified, people approve the change, and software keeps execution inside the approved limits.</p></div>
          <p class="guide-end"><a class="btn btn-primary" href="#/overview">Explore the finished workspace →</a> <a class="btn" href="#/capabilities/refund-execution-high-value">Look at another capability →</a></p>`}`;
  }
  return html`<div class="guide">${rail}<div class="guide-main">${body}${nav}</div></div>`;
}

// The boundaries, in the demo's words: allowed, human review, never, and
// what pulls automation back.
function boundaries(c) {
  const list = (items) => html`<ul>${items.map((i) => html`<li>${i}</li>`)}</ul>`;
  return html`<div class="guide-bounds">
      <div><p class="eyebrow">Allowed</p>${list(c.may)}</div>
      <div><p class="eyebrow">Requires human review</p>${list([...c.mustAsk, ...c.escalation])}</div>
      <div><p class="eyebrow">Never allowed</p>${list(c.mustNever)}</div>
    </div>
    <p class="guide-pullback"><strong>Automation is pulled back if</strong> any of these happens:</p>${list(c.autoRestriction)}`;
}

