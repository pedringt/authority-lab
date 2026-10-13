// History: what happened before? The archive (redesign, 2026-10-12). One
// timeline, newest first, of this capability's decision records, automatic
// restrictions, post-incident reviews, test runs, incidents, proposed changes
// and version changes. Formal names and version numbers live here (and on the
// versions page), not on the day-to-day screens. Everything else opens
// underneath, one line each.

import * as seed from '../data/seed.js';
import { html, fmtDate, personAt, empty } from '../ui.js';
import { capData, versionList, VERSIONED_KINDS, KIND_LABELS, levelName, testSummary, activityEvents, decisionRequired } from '../store/index.js';
import { proposalsList } from './proposals.js';
import { line } from './cap-monitor.js';

const recordName = (x) => `Authority change #${String(x.number).padStart(2, '0')}`;
const levelWords = (auth) => (auth ? levelName(auth.level) : 'New');
const PROPOSAL_KIND = { contract: 'the rules', criteria: 'the targets', stakeholders: 'the stakeholders' };
// Activity worth its own line in the timeline. Records, incidents, reviews,
// tests, proposals and versions come from their own data, so their activity
// events would only repeat them; single waiting actions belong to Status.
const ACTIVITY_KINDS = new Set(['milestone', 'mitigation', 'review', 'roi-assumptions']);

// Every event for the capability: { date, order, key, title, sub }. `order`
// keeps same-day events in the order they happened.
export function historyEvents(state, cap) {
  const d = capData(state, cap.id);
  const out = [];
  const add = (date, order, item) => out.push({ date, order, ...item });

  // Decision records, including automatic restrictions.
  for (const x of state.decisionRecords.filter((r) => r.capabilityId === cap.id)) {
    const links = html`<a href="#/records/${x.id}">Decision record</a> · <a href="#/records/${x.id}/brief">One-page brief</a>`;
    if (x.option === 'auto-restrict') {
      add(x.date, 30 + x.number, { key: 'bad', kind: 'restriction', title: `${recordName(x)}: ${levelWords(x.previous)} → ${levelWords(x.next)}`, sub: html`Automatic restriction after a safety limit was crossed: ${(x.evidenceSnapshot || []).at(-1) ? `${x.evidenceSnapshot.at(-1).replace(/^Limit: /, '')}` : ''} No one approved it at the time; the limit was agreed in advance. · ${links}` });
    } else {
      add(x.date, 30 + x.number, { key: 'key', kind: 'decision', title: `${recordName(x)}: ${levelWords(x.previous)} → ${levelWords(x.next)}`, sub: html`${optionLabel(x.option)}, authorized by ${personAt(x.authorizedByAt, x.authorizedBy).name} · ${links}` });
    }
  }

  // Post-incident reviews.
  for (const rv of d.reviews || []) {
    add(rv.date, 60, { key: 'key', kind: 'review', title: `Post-incident review by ${personAt(rv.byAt, rv.by).name}`, sub: html`Cause: ${rv.cause} Autonomy stayed at ${levelWords(rv.authorityAt)}.${rv.restrictionRecordId ? html` · <a href="#/records/${rv.restrictionRecordId}">Decision record</a>` : ''}` });
  }

  // Incidents.
  // One opened by a safety limit sits between the record it followed and the
  // restriction it caused.
  for (const e of d.evidence.filter((x) => x.source === 'Incident')) {
    const caused = /#\/records\/AC-(\d+)/.exec(e.link || '');
    add(e.date, caused ? 30 + Number(caused[1]) - 0.5 : 20, { key: 'bad', kind: 'incident', title: `Incident: ${e.metric.replace(/^INC-\d+:\s*/, '')}`, sub: e.detail });
  }

  // The latest test run.
  if (d.testRun.lastRun) {
    const t = testSummary(state, cap.id);
    const ran = t.completed ? t : t.recorded;
    const total = t.completed ? t.completed : t.total;
    add(d.testRun.lastRun, 10, { kind: 'test', title: `Test run: ${ran.passed} of ${total} passed`, sub: html`${ran.highSeverity ? `${ran.highSeverity} high-severity failure${ran.highSeverity === 1 ? '' : 's'}. ` : ''}<a href="#/capabilities/${cap.id}?tab=decide&show=tests">Test results</a>` });
  }

  // Proposed changes, once decided. An approved one names the versions it made.
  const madeBy = new Set();
  for (const p of d.proposals.filter((x) => x.status !== 'open')) {
    const word = { approved: 'approved', rejected: 'rejected', withdrawn: 'withdrawn' }[p.status] || p.status;
    const applied = p.status === 'approved' && p.applied ? Object.entries(p.applied).filter(([k, n]) => VERSIONED_KINDS.includes(k) && n) : [];
    for (const [k, n] of applied) madeBy.add(`${k}:${n}`);
    add(p.closedAt || p.date, 50, { kind: 'proposal', title: `Proposed change to ${PROPOSAL_KIND[p.kind] || p.kind} ${word}${applied.length ? `: now ${applied.map(([k, n]) => `${KIND_LABELS[k]} v${n}`).join(', ')}` : ''}`, sub: html`Proposed by ${personAt(p.proposedByAt, p.proposedBy).name}: ${p.reason} · <a href="#/capabilities/${cap.id}/proposals/${p.id}">Proposed change</a>` });
  }

  // Version changes not already named by an approved proposal. Versions set on
  // the same day by the same person read as one line.
  const groups = new Map();
  for (const k of VERSIONED_KINDS) {
    for (const v of versionList(state, cap.id, k)) {
      if (madeBy.has(`${k}:${v.version}`)) continue;
      const g = `${v.date}|${v.author}|${v.version === 1 ? 'first' : v.reason}`;
      if (!groups.has(g)) groups.set(g, { date: v.date, who: personAt(v.authorAt, v.author).name, first: v.version === 1, reason: v.reason, items: [] });
      groups.get(g).items.push(`${KIND_LABELS[k]} v${v.version}`);
    }
  }
  for (const g of groups.values()) {
    const names = g.items.length > 1 ? `${g.items.slice(0, -1).join(', ')} and ${g.items.at(-1)}` : g.items[0];
    add(g.date, 5, { kind: 'version', title: `${names} ${g.first ? 'set' : 'changed'} by ${g.who}`, sub: g.first ? '' : g.reason });
  }

  // An open authority decision.
  if (decisionRequired(state, cap.id) && d.decision && d.decision.openedAt) {
    add(d.decision.openedAt, 70, { key: 'key', kind: 'open', title: 'Decision opened: should its autonomy change?', sub: html`<a href="#/capabilities/${cap.id}?tab=decide">Decide</a>` });
  }

  // Milestones, fixes, stakeholder reviews and ROI changes from Activity.
  for (const a of activityEvents(state, { capabilityId: cap.id, full: true })) {
    if (!ACTIVITY_KINDS.has(a.kind) || a.title === 'Review recorded') continue;
    add(a.date, 40, { kind: a.kind, title: a.title, sub: a.body });
  }

  // Newest first; on the same day, the later step first.
  return out.sort((a, b) => (a.date === b.date ? b.order - a.order : a.date < b.date ? 1 : -1));
}

export function historyTab(state, cap) {
  const events = historyEvents(state, cap);
  const timeline = events.length
    ? html`<ol class="hist-timeline">${events.map((e) => html`<li class="hist-item ${e.key ? `is-${e.key}` : ''}" data-kind="${e.kind}">
        <div class="hist-when">${fmtDate(e.date)}</div>
        <div class="hist-title">${e.key ? html`<strong>${e.title}</strong>` : e.title}</div>
        ${e.sub && String(e.sub).trim() ? html`<div class="hist-sub muted small">${e.sub}</div>` : ''}
      </li>`)}</ol>`
    : empty('Nothing has happened yet.');

  const kinds = VERSIONED_KINDS.map((k) => [k, KIND_LABELS[k], versionList(state, cap.id, k).length]);
  const versions = line('Versions', kinds.filter(([, , n]) => n).map(([, label, n]) => `${label} v${n}`).join(' · ') || 'none yet',
    html`<ul class="plain-list">${kinds.map(([k, label, n]) => html`<li>${n ? html`<a href="#/capabilities/${cap.id}/versions?kind=${k}">${label}</a>` : label} <span class="muted small">· ${n} version${n === 1 ? '' : 's'}</span></li>`)}</ul>
    <p class="muted small">Every change keeps the old version, who changed it and why.</p>`);

  const all = capData(state, cap.id).proposals;
  const open = all.filter((p) => p.status === 'open').length;
  const changes = ['contract', 'criteria', 'stakeholders'].map((k) => proposalsList(state, cap.id, k)).filter((x) => String(x));
  const proposed = line('Proposed changes', all.length ? `${all.length} in total${open ? `, ${open} waiting for approval` : ''}` : 'none',
    changes.length ? html`${changes}` : html`<p class="muted small">After results exist, changes to the rules, targets or stakeholders need approval. They appear here with their approvals.</p>`);

  return html`${timeline}
    <div class="mh-lines">${versions}${proposed}</div>
    <p class="small hist-activity"><a href="#/records?show=activity&capability=${cap.id}">All activity for ${cap.name} →</a></p>`;
}

export function optionLabel(option) {
  if (option === 'auto-restrict') return 'Automatic restriction';
  if (option === 'define') return 'Starting authority';
  if (option === 'not-delegated') return 'Not delegated, by design';
  const o = seed.DECISION_OPTIONS.find((x) => x.id === option);
  return o ? o.name : option;
}
