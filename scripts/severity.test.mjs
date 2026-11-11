// v1 C1 (#187): how changes since the Decision in force are graded. Each
// example in docs/V1_RECONCILIATION.md section 4 is a test with its v1
// result. Nothing here changes Authority.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideWith } from './helpers.mjs';
import * as seed from '../src/data/seed.js';
import {
  initialState, startEmpty, setUpWorkspace, addPerson, addCapability, saveStakeholders, saveCriteria, mapEvidence, rowMetric, MANUAL_SOURCE,
  recordResult, recordJudgment, proposeAuthority, selectDecision, setOutcome, setRolloutField, setResidualRisk, setRationale, authorize,
  recordIncident, simulateBreach, callTool, getCapability, capData, people, justification, changesSinceDecision, OUTCOMES_MAX,
} from '../src/store/index.js';
import { logGate } from '../src/store/gatelog.js';
import { setPeople, setToday } from '../src/ui.js';
import { capabilityView } from '../src/views/capability.js';

const ANA = 'ana-ruiz';
const BEN = 'ben-okoro';
const CARA = 'cara-lim';
const RR = 'refund-recommendation';
const kinds = (s, id) => justification(s, id).changes.map((c) => `${c.severity}:${c.kind}`);
const monitor = (s, id) => { setPeople(people(s)); setToday(s.today); return String(capabilityView(s, id, new URLSearchParams('tab=monitor'))); };

// The small firm, decided to Draft on hand-recorded evidence. "Overall
// accuracy ≥ 92%" is hard; "Clients find the tone friendly" is a
// consideration, Met when decided.
function decidedFirm() {
  let s = setUpWorkspace(startEmpty(), { workspace: { name: 'Ruiz Tax' }, workflow: { name: 'Client email' }, founder: { name: 'Ana Ruiz', title: 'Partner' } });
  s = addPerson(s, { name: 'Ben Okoro', title: 'Tax lead', team: 'Tax', by: ANA, reason: 'Reviews the drafts.' });
  s = addPerson(s, { name: 'Cara Lim', title: 'Office manager', team: 'Office', by: ANA, reason: 'Hears from clients.' });
  s = addCapability(s, { name: 'Draft deadline emails', summary: 'Drafts emails reminding clients of tax deadlines.', owner: ANA, risk: { impact: 'Medium', reversibility: 'Easy to reverse', exposure: 'Customer-facing' }, today: 'recommends', by: ANA });
  const id = s.capabilities.at(-1).id;
  s = saveStakeholders(s, id, { stakeholders: [{ person: BEN, team: 'Tax', role: 'reviewer', stance: 'expand', position: 'Ready.' }, { person: CARA, team: 'Office', stance: 'expand', position: 'Fine by me.' }], by: ANA });
  s = saveCriteria(s, id, {
    criteria: [],
    requirements: [
      { id: 'min-cases', text: 'Minimum 20 cases', kind: 'coverage' },
      { id: 'accuracy', text: 'Overall accuracy ≥ 92%', judgment: 'evidence' },
      { id: 'templates', text: 'The tax lead has approved the email templates', judgment: 'person' },
      { id: 'tone', text: 'Clients find the tone friendly', judgment: 'person', consideration: true },
    ],
    by: ANA,
    reason: 'Our own bar, written by us.',
  });
  s = mapEvidence(s, id, { rowKind: 'requirement', rowId: 'min-cases', measure: { source: MANUAL_SOURCE, metric: rowMetric('requirement', 'accuracy'), stat: 'sample' }, by: ANA });
  s = mapEvidence(s, id, { rowKind: 'requirement', rowId: 'accuracy', measure: { source: MANUAL_SOURCE, metric: rowMetric('requirement', 'accuracy'), stat: 'rate' }, by: ANA });
  s = recordResult(s, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 19, total: 20, kind: 'eval', by: BEN });
  s = recordJudgment(s, id, 'templates', { verdict: 'met', rationale: 'All four templates approved on Oct 14.', by: BEN });
  s = recordJudgment(s, id, 'tone', { verdict: 'met', rationale: 'Clients said the tone was friendly.', by: BEN });
  s = proposeAuthority(s, id, 2, { by: ANA });
  s = selectDecision(s, id, 'expand');
  s = setOutcome(setOutcome(s, id, 0, 'metric', 'Time to send reminders'), id, 0, 'target', 'at least 30% faster');
  s = setOutcome(setOutcome(s, id, 1, 'metric', 'Emails corrected'), id, 1, 'target', 'at most 10%');
  for (const [k, v] of Object.entries({ owner: ANA, scope: 'Every deadline email this season.', startDate: s.today, feedbackChannel: 'Office inbox', reviewerNotes: 'Read every draft before it goes.', reviewDate: '2026-12-01' })) s = setRolloutField(s, id, k, v);
  s = setResidualRisk(s, id, { level: 'Moderate', note: 'Every draft is read before it is sent.' });
  s = authorize(setRationale(s, id, 'Every Requirement is met and a person approves every draft.'), id, { by: ANA });
  return [s, id];
}
const accuracyFell = (s, id) => recordResult(s, id, { rowKind: 'requirement', rowId: 'accuracy', type: 'rate', passed: 89, total: 100, kind: 'eval', by: BEN });
const critical = (s, id) => recordIncident(s, id, { what: 'An email went out with last year\'s deadline.', severity: 'critical', by: CARA });

test('the fixture: every Requirement Met when decided, and Authority still supported', () => {
  const [s, id] = decidedFirm();
  assert.deepEqual(justification(s, id).basis.reviewed.requirementResults.map((r) => [r.id, r.status, Boolean(r.consideration)]), [['min-cases', 'met', false], ['accuracy', 'met', false], ['templates', 'met', false], ['tone', 'met', true]]);
  assert.equal(justification(s, id).key, 'supported');
});

// ---------------------------------------------------------------------------
// The examples table
// ---------------------------------------------------------------------------

test('hard "Accuracy ≥ 92%" was Met at the Decision; now 89%: May no longer be justified', () => {
  const [s0, id] = decidedFirm();
  const s = accuracyFell(s0, id);
  const j = justification(s, id);
  assert.equal(j.key, 'unjustified');
  assert.ok(kinds(s, id).includes('unjustified:result'));
  assert.deepEqual(getCapability(s, id).authority, getCapability(s0, id).authority, 'nothing here changes Authority');
});

test('a consideration that was Met is now Not met: Needs attention, never "May no longer be justified"', () => {
  const [s0, id] = decidedFirm();
  const s = recordJudgment(s0, id, 'tone', { verdict: 'not-met', rationale: 'Two clients found the tone abrupt.', by: BEN });
  const j = justification(s, id);
  const tone = j.changes.find((c) => c.id === 'tone');
  assert.ok(tone, JSON.stringify(j.changes));
  assert.equal(tone.severity, 'attention');
  assert.equal(j.key, 'attention');
  assert.ok(!j.changes.some((c) => c.severity === 'unjustified'));
});

test('a Requirement added after the Decision in force is never graded against it: it is the next bar, on Decide', () => {
  const [s0, id] = decidedFirm();
  const d = capData(s0, id);
  const list = d.versions.requirements;
  const last = list.at(-1);
  const added = { ...last, version: last.version + 1, value: [...last.value, { id: 'level4', text: 'At least 200 cases without a serious error', judgment: 'person' }] };
  const s = { ...s0, capabilityData: { ...s0.capabilityData, [id]: { ...d, versions: { ...d.versions, requirements: [...list, added] } } } };
  const j = justification(s, id);
  assert.ok(!j.changes.some((c) => c.id === 'level4'), 'not graded');
  assert.equal(j.key, 'supported');
});

test('open critical incident, every Requirement still Met: Safety concern, pinned', () => {
  const [s0, id] = decidedFirm();
  const s = critical(s0, id);
  const j = justification(s, id);
  assert.equal(j.key, 'safety');
  assert.equal(j.label, 'Safety concern');
  assert.ok(kinds(s, id).includes('safety:incident'));
  const page = monitor(s, id);
  assert.match(page, /<section class="mon-block mon-pinned" aria-label="Safety concerns"><h2>Safety concern<\/h2>/);
  assert.ok(page.indexOf('mon-pinned') < page.indexOf('Is the current Authority still justified?'), 'pinned at the top');
  assert.deepEqual(getCapability(s, id).authority, getCapability(s0, id).authority);
});

test('critical incident open and a hard Requirement fell: Safety concern headline, the failed Requirement directly beneath', () => {
  const [s0, id] = decidedFirm();
  const s = accuracyFell(critical(s0, id), id);
  const j = justification(s, id);
  assert.equal(j.key, 'safety');
  const pinned = (monitor(s, id).match(/<section class="mon-block mon-pinned"[\s\S]*?<\/section>/) || [''])[0];
  assert.match(pinned, /Open critical incident[\s\S]*<\/li><li><span class="badge badge-fail">May no longer be justified<\/span> Requirement (&quot;|")Overall accuracy ≥ 92%(&quot;|"): Met when decided, Not met now\./);
});

test('a hard Requirement that supported current Authority is now Conflicting: Investigation needed', () => {
  const [s0, id] = decidedFirm();
  const s = recordJudgment(s0, id, 'templates', { verdict: 'not-met', rationale: 'Template 3 still has the old date.', by: ANA });
  assert.equal(justification(s, id).key, 'investigate');
  assert.ok(kinds(s, id).includes('investigate:result'));
});

test('restriction rule over its limit, restriction applied: Restricted automatically', () => {
  const s = simulateBreach(authorize(decideWith(initialState(), RR, 'expand-limits'), RR), RR);
  assert.equal(justification(s, RR).key, 'restricted');
  assert.equal(JSON.stringify(s.decisionRecords.at(-1).option), '"auto-restrict"');
});

test('a safety concern stays pinned under the "Restricted automatically" headline', () => {
  const restricted = simulateBreach(authorize(decideWith(initialState(), RR, 'expand-limits'), RR), RR);
  const s = recordIncident(restricted, RR, { what: 'A refund went to the wrong account.', severity: 'critical', by: 'maya' });
  const j = justification(s, RR);
  assert.equal(j.key, 'restricted');
  assert.ok(j.changes.some((c) => c.severity === 'safety' && c.kind === 'incident'));
  assert.match(monitor(s, RR), /<section class="mon-block mon-pinned"/);
});

test('"Approvals may not be real reviews": Needs attention (oversight)', () => {
  const s = authorize(decideWith(initialState(), RR, 'expand-limits'), RR);
  const c = justification(s, RR).changes.find((x) => x.kind === 'adoption' && /^Approvals may not be real reviews/.test(x.text));
  assert.equal(c.severity, 'attention');
});

test('3 blocked attempts at a never-allowed action: Needs attention, labelled "Blocked"', () => {
  let s = authorize(decideWith(initialState(), RR, 'expand-limits'), RR);
  for (let i = 0; i < 3; i++) s = logGate(s, { capabilityId: RR, tool: 'issue_refund', verdict: 'block', rule: { kind: 'must-never', text: 'Issue a refund to a different payment method.' } });
  const c = changesSinceDecision(s, RR).changes.find((x) => x.kind === 'boundary');
  assert.equal(c.severity, 'attention');
  assert.equal(c.label, 'Blocked');
  assert.equal(c.text, 'Blocked: 3 attempts at something never allowed.');
});

test('a rollout goal missed on real numbers: Value warning, which never sets the headline', () => {
  let s = decideWith(initialState(), RR, 'expand-limits');
  const rows = [{ metric: 'Share done automatically', target: '≥ 50%' }, { metric: 'Escalation rate', target: '≤ 30%' }];
  for (let i = 0; i < OUTCOMES_MAX; i++) {
    const r = rows[i] || { metric: '', target: '' };
    s = setOutcome(setOutcome(s, RR, i, 'metric', r.metric), RR, i, 'target', r.target);
  }
  s = authorize(s, RR);
  const ticket = (o) => `TK-2${seed.systems.orders[o].customerId.slice(3)}`;
  for (const o of ['ORD-5001', 'ORD-5002', 'ORD-5004']) s = callTool(s, RR, { tool: 'issue_refund', args: { orderId: o, amount: 10, confidence: 95, instructionSource: 'customer' }, ticketId: ticket(o) }).state;
  for (let i = 0; i < 9; i++) s = logGate(s, { capabilityId: RR, tool: 'issue_refund', verdict: 'allow', orderId: 'ORD-5001' });
  for (let i = 0; i < 8; i++) s = logGate(s, { capabilityId: RR, tool: 'issue_refund', verdict: 'needs-person', orderId: 'ORD-5005' });
  const j = justification(s, RR);
  const value = j.changes.filter((c) => c.severity === 'value');
  assert.deepEqual(value.map((c) => c.kind), ['impact']);
  assert.match(value[0].text, /^Rollout goal "Escalation rate" not met on real numbers/);
  // The headline is what it would be without it.
  const without = j.changes.filter((c) => c.severity !== 'value');
  assert.ok(!without.some((c) => c.kind === 'impact'));
  assert.equal(j.key, 'attention', 'set by the other changes (stale evidence, adoption), not the value warning');
  const page = monitor(s, RR);
  assert.match(page, /1 value warning: a rollout goal missed on real numbers\. <a href="#\/capabilities\/refund-recommendation\?tab=monitor&(amp;)?show=value">Delivering value\?<\/a> It doesn(&#39;|')t change this answer\./);
  assert.doesNotMatch((page.match(/<ul class="plain-list mon-changes">[\s\S]*?<\/ul>/) || [''])[0], /Escalation rate/, 'not listed under Still justified?');
});

test('stale evidence behind a Requirement, recency not required: Needs attention, with the D5 wording', () => {
  const s = authorize(decideWith(initialState(), RR, 'expand-limits'), RR);
  const c = justification(s, RR).changes.find((x) => x.kind === 'stale');
  assert.equal(c.severity, 'attention');
  assert.match(c.text, /rests on stale evidence\. Stale evidence still counts\. Its age blocks an expansion only when a Requirement makes recency mandatory, such as "Results from the last 30 days"\.$/);
});
