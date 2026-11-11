// v1 W5 (#186): small clarity fixes. With no Reviewers, Decide says none are
// configured; stale evidence and undecided Targets are explained (D5, D6) on
// Monitor, Decide step 2 and the setup Requirements step, with no new block;
// completed setup steps say what was configured (#134).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideWith } from './helpers.mjs';
import {
  initialState, people, capData, current, recordContext, startCapability, saveSetupRisk, setStartingAuthority, startContractDraft, reviewSuggestion,
  confirmSection, finalizeContract, defaultsFor, saveCriteria, SECTION_KEYS, canAuthorize, evidenceCoverage,
  STALE_EVIDENCE_NOTE, UNDECIDED_TARGET_NOTE,
} from '../src/store/index.js';
import { BLANK } from '../src/data/templates.js';
import { setPeople, setToday } from '../src/ui.js';
import { capabilityView } from '../src/views/capability.js';
import { criteriaEditorView } from '../src/views/criteria.js';
import { setupSequence } from '../src/views/setupflow.js';

const RR = 'refund-recommendation';
const q = (s = '') => new URLSearchParams(s);
const text = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, '\'').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const band = (s, id = RR) => text(capabilityView(s, id, q('tab=decide'))).split('Where this stands')[1].split('Step 1')[0];
const show = (s) => { setPeople(people(s)); setToday(s.today); return s; };

// A setup draft with Boundaries and Requirements saved.
function readyDraft() {
  let s = recordContext(initialState(), { facts: { purpose: 'Resolve support tickets faster.' }, by: 'priya', reason: 'Kick-off notes.' });
  s = startCapability(s, { name: 'Recommend a refund', summary: 'Recommends whether to refund a customer order.', owner: 'priya', template: 'recommend', lifecycle: 'planned', by: 'priya' });
  const id = s.capabilities.at(-1).id;
  s = saveSetupRisk(s, id, { impact: 'Medium', reversibility: 'Easy to reverse', exposure: 'Customer-facing', likelihood: 'Unknown', by: 'priya' });
  s = setStartingAuthority(s, id, { today: 'recommends' });
  s = startContractDraft(s, id, { by: 'priya' });
  for (const l of capData(s, id).contractDraft.lines) {
    if (l.status !== 'pending') continue;
    s = l.original.includes(BLANK)
      ? reviewSuggestion(s, id, l.id, { decision: 'edit', text: l.original.replaceAll(BLANK, '2').replace('$2', '$100') })
      : reviewSuggestion(s, id, l.id, { decision: 'accept' });
  }
  for (const k of SECTION_KEYS) s = confirmSection(s, id, k, true);
  s = finalizeContract(s, id, { by: 'priya' });
  const d = defaultsFor(s, id);
  s = saveCriteria(s, id, { criteria: d.criteria, requirements: d.requirements, by: 'priya' });
  return [show(s), id];
}

// ---------------------------------------------------------------------------
// No Reviewers named
// ---------------------------------------------------------------------------

test('with no Reviewers configured, Decide says so instead of "Every Reviewer has given a position"', () => {
  const s = show(initialState());
  assert.equal(current(s, RR, 'stakeholders').some((x) => x.role === 'reviewer'), false, 'Northstar names no Reviewers');
  const b = band(s);
  assert.match(b, /· No Reviewers are configured, so no position is required before an expansion\. Name a Reviewer/);
  assert.doesNotMatch(b, /Every Reviewer has given a position/);
  assert.match(String(capabilityView(s, RR, q('tab=decide'))), /href="#\/capabilities\/refund-recommendation\/stakeholders\/edit">Name a Reviewer<\/a>/);
  // The record step's checklist says the same.
  const page = text(capabilityView(decideWith(s, RR, 'expand-limits'), RR, q('tab=decide')));
  assert.match(page, /No Reviewers are configured, so no position is required/);
  assert.doesNotMatch(page, /Every Reviewer has given a position/);
});

test('with a Reviewer configured, the existing wording stays', () => {
  let s = show(initialState());
  const list = current(s, RR, 'stakeholders').map((x) => (x.person === 'daniel' ? { ...x, role: 'reviewer' } : x));
  const d = capData(s, RR);
  s = { ...s, capabilityData: { ...s.capabilityData, [RR]: { ...d, versions: { ...d.versions, stakeholders: [...d.versions.stakeholders.slice(0, -1), { ...d.versions.stakeholders.at(-1), value: list }] } } } };
  assert.match(band(s), /✓ Every Reviewer has given a position\./);
  assert.doesNotMatch(band(s), /No Reviewers are configured/);
});

// ---------------------------------------------------------------------------
// D5 and D6: wording, no new block
// ---------------------------------------------------------------------------

test('D5 and D6 wording, as Paige approved it', () => {
  assert.equal(STALE_EVIDENCE_NOTE, 'Stale evidence still counts. Its age blocks an expansion only when a Requirement makes recency mandatory, such as "Results from the last 30 days".');
  assert.equal(UNDECIDED_TARGET_NOTE, 'A Target can stay "Needs decision" until a Requirement that depends on it needs a bar. Until then it neither passes nor fails.');
});

test('D5 and D6 show on Monitor, Decide step 2 and the setup Requirements step', () => {
  const s = show(initialState());
  const places = {
    'Monitor (Evidence line)': text(capabilityView(s, RR, q('tab=monitor'))),
    'Decide step 2 (Requirements line)': text(capabilityView(s, RR, q('tab=decide'))).split('What do we know?')[1],
  };
  const [draft, id] = readyDraft();
  places['setup Requirements step'] = text(criteriaEditorView(draft, id, q()));
  for (const [where, page] of Object.entries(places)) {
    assert.ok(page.includes(STALE_EVIDENCE_NOTE), `${where}: D5`);
    assert.ok(page.includes(UNDECIDED_TARGET_NOTE), `${where}: D6`);
  }
  // Visible, not tucked inside a collapsed section.
  const raw = String(criteriaEditorView(draft, id, q()));
  const at = raw.indexOf('A Target can stay');
  const before = raw.slice(0, at);
  assert.equal((before.match(/<details\b/g) || []).length, (before.match(/<\/details>/g) || []).length, 'setup Requirements step: D5 and D6 are not inside a collapsed section');
});

test('no new block: stale evidence still lets the seeded expansion be recorded', () => {
  const s = decideWith(show(initialState()), RR, 'expand-limits');
  assert.ok(evidenceCoverage(s, RR).targets.some((x) => x.status === 'stale'), 'Quality rests on stale evidence');
  assert.equal(canAuthorize(s, RR, { by: 'maya' }).ok, true);
});

// ---------------------------------------------------------------------------
// #134: completed setup steps say what was configured
// ---------------------------------------------------------------------------

test('#134: completed setup steps show a read-only summary of what was configured', () => {
  const [s, id] = readyDraft();
  const step = (k) => setupSequence(s, id).find((x) => x.id === k);
  const c = current(s, id, 'contract');
  assert.equal(step('boundaries').done, true);
  assert.equal(step('boundaries').text, `${c.may.length} allowed · ${c.mustAsk.length + c.escalation.length} require review · ${c.mustNever.length} never allowed · ${c.autoRestriction.length} safety limit${c.autoRestriction.length === 1 ? '' : 's'}.`);
  const reqs = current(s, id, 'requirements');
  const targets = current(s, id, 'criteria');
  assert.match(step('requirements').text, new RegExp(`^${reqs.length} Requirements configured \\(${reqs.filter((r) => !r.consideration).length} hard\\)\\. Targets: `));
  assert.ok(step('requirements').text.includes(`${targets[0].name} ${targets[0].target}`));
  if (targets.length > 3) assert.match(step('requirements').text, new RegExp(`and ${targets.length - 3} more\\.$`));
  const cov = evidenceCoverage(s, id);
  assert.match(step('evidence').text, new RegExp(`^${cov.mapped} of ${cov.total} Requirements mapped to evidence\\. `));
  // Nothing on the Setup page is an input: it is a summary.
  for (const k of ['boundaries', 'requirements', 'evidence']) assert.doesNotMatch(step(k).text, /<input|<select|<textarea/);
});
