import * as seed from '../data/seed.js';
import { html, badge, fmtDate } from '../ui.js';
import { getCapability } from '../store.js';

const TYPE_TONE = {
  amendment: 'watch',
  authority: 'pass',
  restriction: 'fail',
  failure: 'fail',
  mitigation: 'watch',
  milestone: 'neutral',
  review: 'neutral',
  criteria: 'neutral',
  decision: 'neutral',
  test: 'neutral',
};
const TYPE_LABEL = {
  amendment: 'Amendment',
  authority: 'Authority',
  restriction: 'Automatic restriction',
  failure: 'Failure',
  mitigation: 'Mitigation',
  milestone: 'Milestone',
  review: 'Review',
  criteria: 'Criteria',
  decision: 'Decision',
  test: 'Test run',
};

export function activityView(state) {
  const items = state.activity.map((a) => html`<li class="activity-item activity-${a.kind}">
    <div class="activity-date">${fmtDate(a.date)}</div>
    <div class="activity-body">
      <div class="activity-head">${badge(TYPE_TONE[a.kind] || 'neutral', TYPE_LABEL[a.kind] || a.kind)}<strong>${a.title}</strong></div>
      <p>${a.body}</p>
      <div class="activity-meta"><a href="#/capabilities/${a.capabilityId}">${getCapability(state, a.capabilityId).name}</a>${a.link ? html` · <a href="${a.link}">Open</a>` : ''}</div>
    </div>
  </li>`);
  return html`<div class="page-head">
    <div>
      <p class="eyebrow">${seed.workspace.name} · ${seed.workflow.name}</p>
      <h1>Activity</h1>
      <p class="lede">An audit-style history. Follow any thread from evidence to discussion to decision to authority change.</p>
    </div>
  </div>
  <ol class="activity-list">${items}</ol>`;
}
