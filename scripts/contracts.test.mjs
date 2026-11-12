// v1 W3 (#184): display contracts. The Status tab always shows the current
// Authority, what still needs a person and the full-record path, and, when
// they apply, serious test failures and each thing blocking a change. The
// full-record path is followed: History must render the whole record.
// (The Decision view's contract is in phase6a.test.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decideWith } from './helpers.mjs';
import {
  initialState, startEmpty, setUpWorkspace, addPerson, addCapability, capData, buildWorkspace, importEvidenceFiles, saveStakeholders, saveCriteria,
  proposeAuthority, assessRisk, recordMaterialChange, advanceToday, mapEvidence, rowMetric, MANUAL_SOURCE, recordResult, authorize, simulateBreach, recordReview, people, versionList, VERSIONED_KINDS, authorityProposals,
} from '../src/store/index.js';
import { stateWorkspace } from '../src/data/workspaces/state.js';
import { setPeople, setToday } from '../src/ui.js';
import { capabilityView } from '../src/views/capability.js';

const RR = 'refund-recommendation';
const ANA = 'ana-ruiz';
const BEN = 'ben-okoro';
const render = (s, id, q) => { setPeople(people(s)); setToday(s.today); return String(capabilityView(s, id, new URLSearchParams(q))); };
const status = (s, id) => render(s, id, 'tab=status');

// A small firm with a Proposal open, a Reviewer who hasn't given a position,
// and a Proposal made stale by a new risk assessment.
function staleFirm() {
  let s = setUpWorkspace(startEmpty(), { workspace: { name: 'Ruiz Tax' }, workflow: { name: 'Client email' }, founder: { name: 'Ana Ruiz', title: 'Partner' } });
  s = addPerson(s, { name: 'Ben Okoro', title: 'Tax lead', team: 'Tax', by: ANA, reason: 'Reviews the drafts.' });
  s = addCapability(s, { name: 'Draft deadline emails', summary: 'Drafts emails reminding clients of tax deadlines.', owner: ANA, risk: { impact: 'Medium', reversibility: 'Easy to reverse', exposure: 'Customer-facing' }, today: 'recommends', by: ANA });
  const id = s.capabilities.at(-1).id;
  s = saveStakeholders(s, id, { stakeholders: [{ person: BEN, team: 'Tax', role: 'reviewer', stance: 'undecided', position: '' }], by: ANA });
  s = saveCriteria(s, id, { criteria: [], requirements: [{ id: 'min-cases', text: 'Minimum 20 cases', kind: 'coverage' }, { id: 'accuracy', text: 'Overall accuracy ≥ 90%', judgment: 'evidence' }], by: ANA, reason: 'Our own bar, written by us.' });
  s = mapEvidence(s, id, { rowKind: 'requirement', rowId: 'accuracy', measure: { source: MANUAL_SOURCE, metric: rowMetric('requirement', 'accuracy'), stat: 'rate' }, by: ANA });
  s = recordResult(s, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 19, total: 20, kind: 'eval', by: BEN });
  s = proposeAuthority(s, id, 2, { by: ANA });
  s = assessRisk(s, id, { likelihood: 'Low', scale: 'One case', by: ANA, reason: 'Few emails a week.' });
  return [{ ...s, actingAs: ANA }, id];
}
function stateGap() {
  const ID = 'interpret-incoming-project-evidence';
  const dir = new URL('../src/data/external-evidence/', import.meta.url);
  const files = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8')).files.map((file) => ({ file, envelope: JSON.parse(readFileSync(new URL(file, dir), 'utf8')) }));
  return [importEvidenceFiles(buildWorkspace(stateWorkspace, { today: '2026-10-20' }), files).state, ID];
}
const REVIEW = { whatHappened: 'Three automatic refunds were wrong.', cause: 'Return status was not checked first.', changes: 'The rules now check the return before refunding.' };
const breached = () => simulateBreach(authorize(decideWith(initialState(), RR, 'expand-limits'), RR), RR);

// Each case: the state, and what Needs attention must name (null: nothing to
// attend to, so the list isn't shown).
const CASES = {
  'Northstar decision open, with a serious test failure': [() => [initialState(), RR], { 'the serious test failure': /Serious test failure: Fraud flag present \(H-04\)\./ }],
  'automatic restriction awaiting review': [() => [breached(), RR], { 'the review lock': /Blocked: a post-incident review is needed before authority expands\./ }],
  'operating above approved Authority': [stateGap, { 'the Authority gap': /Blocked: operating above approved Authority \(observed at Level 2, Draft\)/ }],
  'stale Proposal, Reviewer position missing': [staleFirm, {
    'the stale Proposal': /Blocked: the Proposal is stale: /,
    'the missing Reviewer position': /Blocked: waiting for a position from Ben Okoro \(Reviewer\)\./,
  }],
  'material change with evidence not yet reviewed (v1 W1)': [() => [recordMaterialChange(advanceToday(initialState(), '2026-10-20'), RR, { areas: ['model'], description: 'Moved to a newer model.', effectiveOn: '2026-10-20', by: 'maya' }), RR], {
    'the unreviewed-evidence block': /Blocked: evidence from before a material change isn(&#39;|')t reviewed yet, so it doesn(&#39;|')t count: [^<]+\. <a class="small" href="#\/capabilities\/refund-recommendation\?tab=monitor">Review it in Monitor<\/a>/,
  }],
  'restricted by a person, nothing open': [() => [initialState(), 'refund-execution-high-value'], null],
};
// On every Status page.
const ALWAYS = {
  'current Authority': /<h2 class="st-title">[^<]+ <span class="st-lvl">Level \d<\/span>/,
  'what it does now': /<p class="st-now">[^<]+<\/p>/,
  'the full-record path': /<a href="#\/capabilities\/[^"]+\?tab=history">Full record<\/a>/,
};
const attention = (page) => (page.match(/<section class="st-attention"[\s\S]*?<\/section>/) || [''])[0];

for (const [name, [build, expected]] of Object.entries(CASES)) {
  test(`Status contract: ${name}`, () => {
    const [s, id] = build();
    const page = status(s, id);
    for (const [item, re] of Object.entries(ALWAYS)) assert.match(page, re, `${name}: missing ${item}`);
    // What still needs a person: the Boundaries' human-review lines, or, with
    // no Boundaries written yet, the level sentence.
    if (versionList(s, id, 'contract').length) assert.match(page, /<div class="st-k">Requires human review<\/div><ul><li>/, `${name}: missing what still needs a person`);
    else assert.match(page, /<p class="st-now">[^<]*a person[^<]*<\/p>/, `${name}: missing what still needs a person`);
    const list = attention(page);
    if (!expected) assert.equal(list, '', `${name}: Needs attention shows only when something applies`);
    else for (const [item, re] of Object.entries(expected)) assert.match(list, re, `${name}: Needs attention is missing ${item}`);
  });
}

test('Status contract: a serious failure is listed only once the suite has a result', () => {
  const s = initialState();
  const d = capData(s, RR);
  const unrun = { ...s, capabilityData: { ...s.capabilityData, [RR]: { ...d, testRun: { ...d.testRun, lastRun: null, status: 'not-run' } } } };
  assert.doesNotMatch(attention(status(unrun, RR)), /Serious test failure/);
});

// ---------------------------------------------------------------------------
// The full-record path opens the complete record
// ---------------------------------------------------------------------------

// Follow the Full record link from a page, render where it goes, and check
// the whole record is there: every decision record (including automatic
// restrictions), post-incident review, incident, the latest test run, every
// decided change request, every version, and every authority Proposal.
function followFullRecord(s, id, page, where) {
  const href = (page.match(/<a href="([^"]+)">Full record<\/a>/) || [])[1];
  assert.ok(href, `${where}: no Full record link`);
  const [path, qs] = href.replace(/^#/, '').split('?');
  assert.equal(path, `/capabilities/${id}`, `${where}: Full record goes to this capability`);
  const record = render(s, id, qs);
  const d = capData(s, id);
  for (const r of s.decisionRecords.filter((x) => x.capabilityId === id)) assert.match(record, new RegExp(`href="#/records/${r.id}"`), `${where}: History is missing decision record ${r.id}`);
  for (const rv of d.reviews || []) assert.match(record, new RegExp(`Post-incident review by ${rv.byAt.name}`), `${where}: History is missing review ${rv.id}`);
  const incidents = d.evidence.filter((e) => e.source === 'Incident').length;
  assert.equal((record.match(/data-kind="incident"/g) || []).length, incidents, `${where}: History lists every incident (${incidents})`);
  if (d.testRun.lastRun) assert.match(record, /data-kind="test"/, `${where}: History is missing the latest test run`);
  for (const p of d.proposals.filter((x) => x.status !== 'open')) assert.match(record, new RegExp(`/proposals/${p.id}"`), `${where}: History is missing change request ${p.id}`);
  for (const k of VERSIONED_KINDS) {
    const n = versionList(s, id, k).length;
    if (n) assert.match(record, new RegExp(`kind=${k}">[^<]+</a> <span class="muted small">· ${n} version`), `${where}: History is missing ${k} versions (${n})`);
  }
  for (const ap of authorityProposals(s, id)) assert.match(record, new RegExp(`<strong>${ap.id}</strong>`), `${where}: History is missing authority Proposal ${ap.id}`);
  return record;
}

test('the full-record path, from Status and from Decide, opens History with the whole record', () => {
  // A record with a decision, an automatic restriction, an incident, a
  // review and a test run.
  const s = recordReview(breached(), RR, { by: 'daniel', ...REVIEW });
  assert.ok(s.decisionRecords.filter((r) => r.capabilityId === RR).length >= 2);
  assert.ok((capData(s, RR).reviews || []).length === 1);
  const fromStatus = followFullRecord(s, RR, status(s, RR), 'Status');
  assert.match(fromStatus, /data-kind="restriction"/);
  assert.match(fromStatus, /data-kind="review"/);
  // Decide's band, on an open decision.
  const open = initialState();
  followFullRecord(open, RR, render(open, RR, 'tab=decide'), 'Decide');
  // A small firm, with frozen authority Proposals and versions.
  const [firm, id] = staleFirm();
  const record = followFullRecord(firm, id, status(firm, id), 'Status (firm)');
  assert.match(record, /<strong>AP-01<\/strong>/);
});
