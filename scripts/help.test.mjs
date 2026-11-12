// v1 W4 (#185): minimum contextual Help. Each consequential choice has a
// "why it matters" line and an example; it is collapsed by default, shown
// everywhere the choice is made, and holds nothing that could change a value.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState, recordMaterialChange, advanceToday, startEmpty, setUpWorkspace, addCapability, people, recordContext, startCapability, saveSetupRisk, setStartingAuthority, startContractDraft, selectDecision,
} from '../src/store/index.js';
import { setPeople, setToday } from '../src/ui.js';
import { HELP, helpFor } from '../src/views/help.js';
import { riskStepView, capabilityStepView, startView } from '../src/views/setupflow.js';
import { contractBuilderView } from '../src/views/contract.js';
import { criteriaEditorView } from '../src/views/criteria.js';
import { stakeholdersEditorView } from '../src/views/stakeholders.js';
import { proposeView } from '../src/views/proposals.js';
import { capabilityView } from '../src/views/capability.js';
import { guideView } from '../src/views/guide.js';

const RR = 'refund-recommendation';
const q = (s = '') => new URLSearchParams(s);
const helps = (page) => [...String(page).matchAll(/<details class="help" data-help="([a-zA-Z]+)">/g)].map((m) => m[1]);
const has = (page, key, where) => assert.ok(helps(page).includes(key), `${where}: no Help for ${HELP[key].label}`);
function draft() {
  let s = recordContext(initialState(), { facts: { purpose: 'Resolve support tickets faster.' }, by: 'priya', reason: 'Kick-off notes.' });
  s = startCapability(s, { name: 'Recommend a refund', summary: 'Recommends whether to refund a customer order.', owner: 'priya', template: 'recommend', lifecycle: 'planned', by: 'priya' });
  const id = s.capabilities.at(-1).id;
  setPeople(people(s)); setToday(s.today);
  return [s, id];
}

const CHOICES = ['risk', 'startingAuthority', 'boundaries', 'requirements', 'people', 'residualRisk', 'authorization', 'applicability', 'reading'];

test('every consequential choice has a "why it matters" line and an example', () => {
  assert.deepEqual(Object.keys(HELP).sort(), [...CHOICES].sort());
  for (const k of CHOICES) {
    assert.ok(HELP[k].why.length > 30, `${k}: why it matters`);
    assert.ok(HELP[k].example.length > 30, `${k}: an example`);
  }
});

test('Help is collapsed by default and holds nothing that could change a value', () => {
  for (const k of CHOICES) {
    const h = String(helpFor(k));
    assert.match(h, /^<details class="help" data-help="[a-zA-Z]+"><summary>Why this matters<\/summary>/, k);
    assert.doesNotMatch(h, /<details[^>]*\bopen\b/, `${k}: collapsed`);
    assert.doesNotMatch(h, /<(input|select|textarea|button|form|a)\b|data-action/, `${k}: no controls, links or actions`);
  }
  assert.throws(() => helpFor('nope'), /No Help for nope/);
});

test('the Help examples never suggest a number on the Requirements page', () => {
  assert.doesNotMatch(HELP.requirements.example, /\d/);
});

test('Help shows everywhere each choice is made', () => {
  const [s, id] = draft();
  // Setup: Risk, starting Authority, the Owner.
  const risk = String(riskStepView(s, id, q()));
  has(risk, 'risk', 'Setup, Risk and authority');
  has(risk, 'startingAuthority', 'Setup, Risk and authority');
  has(String(startView(s, q())), 'people', 'Add a capability');
  has(String(capabilityStepView(s, id, q())), 'people', 'Setup, Starting point and capability');
  // Boundaries: before and during the builder, and a change after results.
  const ready = setStartingAuthority(saveSetupRisk(s, id, { impact: 'Medium', reversibility: 'Easy to reverse', exposure: 'Customer-facing', likelihood: 'Unknown', by: 'priya' }), id, { today: 'recommends' });
  has(String(contractBuilderView(ready, id, q())), 'boundaries', 'Boundaries, before starting');
  has(String(contractBuilderView(startContractDraft(ready, id, { by: 'priya' }), id, q())), 'boundaries', 'Boundaries, the builder');
  // Requirements and Targets: setup, the editor, and a proposed change.
  has(String(criteriaEditorView(ready, id, q())), 'requirements', 'Setup, Requirements');
  const north = initialState();
  setPeople(people(north)); setToday(north.today);
  let firm = setUpWorkspace(startEmpty(), { workspace: { name: 'Ruiz Tax' }, workflow: { name: 'Client email' }, founder: { name: 'Ana Ruiz', title: 'Partner' } });
  firm = addCapability(firm, { name: 'Draft deadline emails', summary: 'Drafts emails reminding clients of tax deadlines.', owner: 'ana-ruiz', risk: { impact: 'Medium', reversibility: 'Easy to reverse', exposure: 'Customer-facing' }, today: 'recommends', by: 'ana-ruiz' });
  setPeople(people(firm)); setToday(firm.today);
  has(String(criteriaEditorView(firm, firm.capabilities.at(-1).id, q())), 'requirements', 'Targets and Requirements editor');
  setPeople(people(north)); setToday(north.today);
  has(String(proposeView(north, RR, 'criteria', q())), 'requirements', 'Propose a target change');
  has(String(proposeView(north, RR, 'contract', q())), 'boundaries', 'Propose a rules change');
  // People: setup People and the Stakeholders editor.
  has(String(stakeholdersEditorView(s, id, q())), 'people', 'Setup, People');
  has(String(stakeholdersEditorView(north, RR, q())), 'people', 'Stakeholders editor');
  // Decide: the authorization choice, Residual Risk, and Reduce or pause.
  const decide = (st, extra = '') => String(capabilityView(st, RR, q(`tab=decide${extra}`)));
  has(decide(north), 'authorization', 'Decide');
  has(decide(selectDecision(north, RR, 'expand-limits')), 'residualRisk', 'Decide, expand');
  has(String(capabilityView(north, 'ticket-classification', q('tab=decide&reduce=1'))), 'authorization', 'Reduce or pause');
  // Monitor: a material-change review and a reading (W1, W2).
  const changed = recordMaterialChange(advanceToday(north, '2026-10-20'), RR, { areas: ['model'], description: 'Moved to a newer model.', effectiveOn: '2026-10-20', by: 'maya' });
  setPeople(people(changed)); setToday(changed.today);
  const mon = String(capabilityView(changed, RR, q('tab=monitor')));
  has(mon, 'applicability', 'Monitor, material-change review');
  has(mon, 'reading', 'Monitor, record a reading');
  setPeople(people(north)); setToday(north.today);
  // The guided demo's decision step.
  has(String(guideView({ state: north, capabilityId: RR, role: 'maya', tested: true, decided: null, breached: false }, 6)), 'residualRisk', 'Guided demo, decision');
});

test('opening Help changes nothing: a page with every Help open holds the same values', () => {
  const [s, id] = draft();
  const page = String(riskStepView(s, id, q()));
  const values = (h) => [...h.matchAll(/<(input|select|textarea)[^>]*>/g)].map((m) => m[0]);
  const opened = page.replaceAll('<details class="help"', '<details open class="help"');
  assert.deepEqual(values(opened), values(page));
});
