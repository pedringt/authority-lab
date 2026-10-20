// Remediation 3 (#153): the setup model. Risk shapes the questions, and the
// kind of work decides which Boundary patterns fit (D4); a self-declared Low
// Risk can't erase safeguards (D5, R5-B); Requirements come first, with the
// bar beside each, while Requirements and Targets stay separate in the model
// (D8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState, capData, current, people, recordContext, suggestContext,
  startCapability, saveSetupRisk, setStartingAuthority, setupReview,
  startContractDraft, reviewSuggestion, confirmSection, finalizeContract, contractChecks, SECTION_KEYS,
  defaultsFor, saveCriteria, exposureFacts, lowRiskMismatch, workTypes, withBarsAsTargets,
} from '../src/store/index.js';
import { TEMPLATE_FAMILIES, BLANK } from '../src/data/templates.js';
import { setPeople, setToday } from '../src/ui.js';
import { riskStepView, reviewView } from '../src/views/setupflow.js';
import { contractBuilderView } from '../src/views/contract.js';
import { criteriaEditorView } from '../src/views/criteria.js';

const strip = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const withPurpose = (s = initialState()) => recordContext(s, { facts: { purpose: 'Help a small tax firm keep clients on time.' }, by: 'priya', reason: 'Kick-off notes.' });
function cap(template, risk, { context = null, s0 = null } = {}) {
  let s = s0 || withPurpose();
  if (context) s = recordContext(s, { facts: context, by: 'priya', reason: 'What we know about this work.' });
  s = startCapability(s, { name: 'Tax deadline reminders', summary: 'Drafts reminder emails about tax deadlines for clients.', owner: 'priya', template, lifecycle: 'planned', by: 'priya' });
  const id = s.capabilities.at(-1).id;
  s = saveSetupRisk(s, id, { impact: 'Medium', reversibility: 'Easy to reverse', exposure: 'Internal only', likelihood: 'Unknown', ...risk, by: 'priya' });
  s = setStartingAuthority(s, id, { today: 'recommends' });
  return [s, id];
}
const lines = (s, id) => capData(s, id).contractDraft.lines.map((l) => `${l.section}: ${l.text}`);
function reviewAll(s, id, decide = () => 'accept') {
  for (const l of capData(s, id).contractDraft.lines) {
    if (l.status !== 'pending') continue;
    const d = decide(l);
    s = d === 'accept' && l.original.includes(BLANK) ? reviewSuggestion(s, id, l.id, { decision: 'edit', text: l.original.replaceAll(BLANK, '2') }) : reviewSuggestion(s, id, l.id, { decision: d });
  }
  for (const k of SECTION_KEYS) s = confirmSection(s, id, k, true);
  return s;
}

test('D4: financial consequences on drafting work add review questions, never a money limit or high-value cases', () => {
  let [s, id] = cap('draft', { exposure: 'Financial / consequential' });
  s = startContractDraft(s, id, { by: 'priya' });
  const l = lines(s, id);
  assert.ok(!l.some((x) => /in value|money|\$/.test(x)), 'no money threshold for a drafting capability');
  assert.ok(l.includes('mustAsk: A qualified person reviews anything with legal, regulatory or financial consequences before it is used.'));
  assert.ok(l.includes('escalation: A statement can\'t be traced to an approved source.'));
  assert.ok(!defaultsFor(s, id).requirements.some((r) => r.id === 'high-value'));
  // Saving with no money line at all is fine.
  s = finalizeContract(reviewAll(s, id), id, { by: 'priya' });
  assert.equal(current(s, id, 'contract').mustAsk.some((t) => /value/.test(t)), false);
});

test('D4: work that acts on money is asked for a value limit, as a suggestion it can reject', () => {
  let [s, id] = cap('action', { exposure: 'Financial / consequential' });
  s = startContractDraft(s, id, { by: 'priya' });
  const l = lines(s, id);
  assert.ok(l.includes(`mustAsk: Any case above ${BLANK} in value.`));
  assert.ok(l.includes('mustNever: Move money to a destination that hasn\'t been approved.'));
  assert.ok(!l.some((x) => /qualified person reviews/.test(x)), 'acting work gets limits, not the professional-review line');
  assert.ok(defaultsFor(s, id).requirements.some((r) => r.id === 'high-value'));
  // Rejecting the money suggestions doesn't block saving.
  s = reviewAll(s, id, (x) => (/in value|Move money/.test(x.original) ? 'reject' : 'accept'));
  assert.ok(!contractChecks(s, id).some((c) => c.id === 'no-value-limit'));
  s = finalizeContract(s, id, { by: 'priya' });
  assert.ok(current(s, id, 'contract'));
});

test('D4: from scratch, confirmed Context decides the kind of work; money in Context counts', () => {
  const [s, id] = cap('scratch', {}, { context: { aiActions: ['Acts'], consequenceAreas: ['Money'] } });
  assert.deepEqual(workTypes(s, id), ['action']);
  const l = lines(startContractDraft(s, id, { by: 'priya' }), id);
  assert.ok(l.includes(`mustAsk: Any case above ${BLANK} in value.`));
});

test('D4: no refund-specific control in generic setup, for any kind of work or exposure', () => {
  for (const f of [...TEMPLATE_FAMILIES.map((x) => x.id), 'scratch']) {
    for (const exposure of ['Internal only', 'Customer-facing', 'Financial / consequential']) {
      const [s0, id] = cap(f, { exposure, impact: 'High', reversibility: 'Difficult to reverse' });
      const s = startContractDraft(s0, id, { by: 'priya' });
      const all = [...lines(s, id), ...defaultsFor(s, id).requirements.map((r) => r.text), ...defaultsFor(s, id).criteria.map((c) => c.name)].join(' | ');
      assert.doesNotMatch(all, /refund|chargeback|fraud|original card|original one/i, `${f} / ${exposure}`);
    }
  }
});

test('D5: Low stays the person\'s label, but confirmed facts show the mismatch and keep the baseline safeguards', () => {
  let [s, id] = cap('draft', { impact: 'Low', likelihood: 'Low', exposure: 'Customer-facing' }, { context: { regulated: 'Tax advice', dataSensitivity: 'Client financial records' } });
  const facts = exposureFacts(s, id).map((f) => f.key);
  assert.deepEqual(facts, ['customer', 'regulated', 'sensitive']);
  const m = lowRiskMismatch(s, id);
  assert.equal(m.title, 'You marked this Low Risk. These confirmed facts may warrant another look.');
  assert.match(m.text, /It is customer-facing; It works in a regulated or professional context \(Tax advice\); It handles sensitive data \(Client financial records\)\. You can keep Low: it's your judgment\./);
  assert.equal(current(s, id, 'risk').impact, 'Low', 'never overruled');
  s = startContractDraft(s, id, { by: 'priya' });
  assert.ok(lines(s, id).includes('mustAsk: Any case that mentions legal action, safety, or a complaint about the organization.'), 'the baseline line Low used to drop');
  assert.ok(lines(s, id).includes('mustNever: Use or share sensitive or confidential data beyond what the task needs.'));
  // Rejecting every Never allowed and pulled-back line is blocked, with the facts as the reason.
  s = reviewAll(s, id, (x) => (['mustNever', 'autoRestriction'].includes(x.section) ? 'reject' : 'accept'));
  const blocks = contractChecks(s, id).filter((c) => c.level === 'block').map((c) => c.text);
  assert.ok(blocks.some((t) => /Add at least one "Never allowed" rule\. It is marked Low, but it is customer-facing/.test(t)));
  assert.ok(blocks.some((t) => /Automation is pulled back if/.test(t)));
});

test('D5: Low with no exposure facts keeps today\'s lighter baseline, and suggested Context never counts', () => {
  let [s, id] = cap('draft', { impact: 'Low', likelihood: 'Low' });
  assert.equal(lowRiskMismatch(s, id), null);
  s = suggestContext(s, { facts: { regulated: 'Tax advice' }, source: 'description', by: 'priya', reason: 'From the description.' });
  assert.equal(exposureFacts(s, id).length, 0, 'a suggested fact is not confirmed');
  s = startContractDraft(s, id, { by: 'priya' });
  s = reviewAll(s, id, (x) => (['mustNever', 'autoRestriction'].includes(x.section) ? 'reject' : 'accept'));
  assert.ok(!contractChecks(s, id).some((c) => c.id === 'empty-never' || c.id === 'empty-auto'));
  // "No" or "Unknown" in a confirmed fact says nothing is there.
  const [s2, id2] = cap('draft', { impact: 'Low', likelihood: 'Low' }, { context: { regulated: 'No', dataSensitivity: 'Unknown' } });
  assert.equal(lowRiskMismatch(s2, id2), null);
});

test('D5 on screen: the risk step, the Boundaries builder and the review show the mismatch', () => {
  let [s, id] = cap('draft', { impact: 'Low', likelihood: 'Low', exposure: 'Customer-facing' });
  setPeople(people(s)); setToday(s.today);
  const msg = /You marked this Low Risk\. These confirmed facts may warrant another look\. It is customer-facing\. You can keep Low: it's your judgment\. The baseline safeguards stay either way\./;
  assert.match(strip(riskStepView(s, id, new URLSearchParams())), msg);
  assert.match(strip(reviewView(s, id, new URLSearchParams())), msg);
  s = startContractDraft(s, id, { by: 'priya' });
  assert.match(strip(contractBuilderView(s, id, new URLSearchParams())), msg);
  const [h, hid] = cap('draft', { impact: 'High', likelihood: 'Low', exposure: 'Customer-facing' });
  assert.doesNotMatch(strip(riskStepView(h, hid, new URLSearchParams())), /You marked this Low Risk/);
});

test('D8: Requirements first. Each asks what must be true, how you\'ll know, and the bar beside it', () => {
  let [s, id] = cap('draft', { exposure: 'Customer-facing' });
  s = finalizeContract(reviewAll(startContractDraft(s, id, { by: 'priya' }), id), id, { by: 'priya' });
  const d = defaultsFor(s, id);
  s = saveCriteria(s, id, { criteria: d.criteria, requirements: d.requirements, by: 'priya' });
  setPeople(people(s));
  const h = String(criteriaEditorView({ ...s, actingAs: 'priya' }, id, new URLSearchParams()));
  const t = strip(h);
  assert.match(h, /<h1>Requirements<\/h1>/);
  assert.match(t, /What must be true\? .*How will you know\?.*What bar, if measurable\?.*Does it block expansion\?/);
  // A suggested measurable Requirement carries its bar inline, as a Target.
  assert.match(h, /name="rt-name" value="Drafts needing major edits"/);
  assert.match(h, /name="rt-target" value="Needs decision"/);
  // The coverage rule says its number is in the wording.
  assert.match(t, /Replace "Needs decision" in the wording with the number/);
  assert.doesNotMatch(t, /Requirements and Targets/);
});

test('D8: the bar written beside a Requirement is saved as its Target; the model keeps both', () => {
  const out = withBarsAsTargets([], [
    { id: 'min-cases', text: 'Minimum 20 cases', kind: 'coverage' },
    { text: 'Drafts are factually accurate', judgment: 'evidence' },
    { text: 'The partner approves the templates', judgment: 'person' },
  ], [{}, { name: 'Factual error rate', target: '≤ 2%' }, { name: '', target: '' }]);
  assert.deepEqual(out.requirements.map((r) => r.id), ['min-cases', 'drafts-are-factually-accurate', 'the-partner-approves-the-templates'], 'a new Requirement gets its id so its bar can point to it');
  assert.deepEqual(out.criteria, [{ name: 'Factual error rate', target: '≤ 2%', note: '', requirement: 'drafts-are-factually-accurate' }]);
  // It saves through the normal path, linked.
  let [s, id] = cap('draft', {});
  const saved = saveCriteria(s, id, { ...withBarsAsTargets([], [{ id: 'min-cases', text: 'Minimum 20 cases', kind: 'coverage' }, { text: 'Drafts are factually accurate', judgment: 'evidence' }], [{}, { name: 'Factual error rate', target: '≤ 2%' }]), by: 'priya', reason: 'Our own bar, written by us.' });
  assert.deepEqual(current(saved, id, 'criteria').map((c) => [c.name, c.target, c.requirement]), [['Factual error rate', '≤ 2%', 'drafts-are-factually-accurate']]);
  // A bar beside a Requirement a person decides is refused, plainly.
  assert.throws(() => saveCriteria(s, id, { ...withBarsAsTargets([], [{ id: 'min-cases', text: 'Minimum 20 cases', kind: 'coverage' }, { text: 'The partner approves the templates', judgment: 'person' }], [{}, { name: 'Approval', target: '100%' }]), by: 'priya', reason: 'Our own bar, written by us.' }), /which a person decides/);
});

test('setup review: the Requirements card reads as one thing, with each bar beside its Requirement', () => {
  let [s, id] = cap('draft', { exposure: 'Customer-facing' });
  s = finalizeContract(reviewAll(startContractDraft(s, id, { by: 'priya' }), id), id, { by: 'priya' });
  const d = defaultsFor(s, id);
  s = saveCriteria(s, id, { criteria: d.criteria, requirements: d.requirements, by: 'priya' });
  setPeople(people(s)); setToday(s.today);
  const r = strip(reviewView(s, id, new URLSearchParams()));
  assert.match(r, /Requirements Minimum cases: Needs decision/);
  assert.match(r, /Measured as Drafts needing major edits, bar Needs decision/);
  assert.ok(setupReview(s, id));
});
