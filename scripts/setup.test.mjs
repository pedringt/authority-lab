// Setup and onboarding (redesign, 2026-10-12). Two rule changes recorded by
// Paige in docs/DECISIONS.md: one person can start a workspace, and "What does
// it do today?" is context, not authority.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState, startEmpty, setUpWorkspace, setupPending, people, rosterVersions, activeAdmins, isWorkspaceAdmin, isRiskApprover,
  addPerson, proposeRosterChange, approveRosterChange, rosterApprovalEligibility, openRosterProposal, deactivatePerson,
  addCapability, getCapability, capData, current, startContractDraft, reviewSuggestion, confirmSection, finalizeContract, SECTION_KEYS,
  saveCriteria, defaultsFor, saveStakeholders, addStarterScenarios, startTestRun, advanceTestRun, proposeAuthority, selectDecision,
  setOutcome, setRolloutField, authorize, proposeAmendment, versionList, RISK_OPTIONS,
  mapEvidence, recordManualEvidence, startCapability,
} from '../src/store/index.js';
import { setPeople, setToday } from '../src/ui.js';
import { workspaceSetupView } from '../src/views/workspace.js';
import { setupView, setupSteps, SETUP_STAGES, RISK_ANSWERS, TODAY_CHOICES } from '../src/views/setup.js';
import { startView, riskStepView } from '../src/views/setupflow.js';
import { STARTING_POINTS } from '../src/data/templates.js';
import { peopleView } from '../src/views/people.js';
import { decisionRecordView } from '../src/views/decisions.js';

const LOW = { impact: 'Low', reversibility: 'Easy to reverse', exposure: 'Internal only' };
const FIN = { impact: 'High', reversibility: 'Difficult to reverse', exposure: 'Financial / consequential' };
const q = (s = '') => new URLSearchParams(s);
const text = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, '\'').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ');

// A workspace started by one person, Ana.
function solo() {
  return setUpWorkspace(startEmpty(), { workspace: { name: 'My workspace' }, workflow: { name: 'Main workflow' }, founder: { name: 'Ana Ruiz', title: 'Head of Support' } });
}
function render(s, view) {
  setPeople(people(s));
  setToday(s.today);
  try { return view(); } finally { setPeople(null); }
}
function runSuite(s, id) {
  s = startTestRun(s, id);
  for (let i = 0; i < 100 && capData(s, id).testRun.status === 'running'; i++) s = advanceTestRun(s, id);
  return s;
}
const lastCap = (s) => s.capabilities[s.capabilities.length - 1].id;

// ---------------------------------------------------------------------------
// A. One person can start a workspace
// ---------------------------------------------------------------------------

test('one person sets up a workspace and becomes its workspace admin; no Risk approver is needed', () => {
  const s = solo();
  assert.equal(setupPending(s), false);
  assert.deepEqual(Object.keys(people(s)), ['ana-ruiz']);
  assert.deepEqual(activeAdmins(s), ['ana-ruiz']);
  assert.equal(isRiskApprover(s, 'ana-ruiz'), false);
  assert.equal(s.actingAs, 'ana-ruiz');
  const [v] = rosterVersions(s);
  assert.deepEqual([v.version, v.author, v.authorAt.name, v.value['ana-ruiz'].role], [1, 'ana-ruiz', 'Ana Ruiz', 'Head of Support']);
  assert.equal(v.value['ana-ruiz'].team, 'My workspace', 'team is optional and defaults to the workspace name');
  assert.match(s.activity[0].body, /^Ana Ruiz set up My workspace for the Main workflow workflow and is its workspace admin\. Another person is asked for when an approval first needs one\.$/);
  assert.throws(() => setUpWorkspace(startEmpty(), { workspace: { name: 'W1' }, workflow: { name: 'F1' }, founder: { name: '', title: 'Lead' } }), /Add your name/);
  assert.throws(() => setUpWorkspace(startEmpty(), { workspace: { name: 'W1' }, workflow: { name: 'F1' }, founder: { name: 'Ana', title: '' } }), /Add your title/);
});

test('the setup screen asks only for the names (with defaults) and the person starting it', () => {
  const page = String(workspaceSetupView(startEmpty(), q()));
  assert.match(page, /name="ws-name" value="My workspace"/);
  assert.match(page, /name="wf-name" value="Main workflow"/);
  assert.match(page, /name="f-name"/);
  assert.match(page, /name="f-title"/);
  assert.ok(!/p-admin|p-risk|ws-by|Risk approver/.test(page), 'no founding roster, admin count or Risk prompt');
  assert.match(text(page), /Start and add the first capability/);
});

test('a one-person workspace adds a capability and takes it all the way to its first authority decision alone', () => {
  let s = solo();
  s = addCapability(s, { name: 'Order lookup', summary: 'Finds an order from a ticket.', owner: 'ana-ruiz', risk: LOW, today: 'recommends', by: 'ana-ruiz' });
  const id = lastCap(s);
  s = startContractDraft(s, id, { by: 'ana-ruiz' });
  for (const l of capData(s, id).contractDraft.lines.filter((x) => x.status === 'pending')) s = reviewSuggestion(s, id, l.id, { decision: 'accept' });
  for (const k of SECTION_KEYS) s = confirmSection(s, id, k, true);
  s = finalizeContract(s, id, { by: 'ana-ruiz' });
  assert.equal(versionList(s, id, 'contract').length, 1);
  const d = defaultsFor(s, id);
  s = saveCriteria(s, id, { criteria: d.criteria, requirements: d.requirements, by: 'ana-ruiz' });
  s = saveStakeholders(s, id, { stakeholders: [{ person: 'ana-ruiz', team: 'Support', position: 'Support', stance: 'support', reasoning: 'I own it.' }], by: 'ana-ruiz' });
  // Configure evidence (#126): which evidence judges each requirement. Three
  // from Authority Lab's own tests, two from a review recorded by hand.
  const map = (rowId, measure) => { s = mapEvidence(s, id, { rowKind: 'requirement', rowId, measure, by: 'ana-ruiz' }); };
  map('min-cases', { source: 'authority-lab-tests', metric: 'tests-passed', stat: 'sample' });
  map('accuracy', { source: 'authority-lab-tests', metric: 'tests-passed', stat: 'rate' });
  map('severe', { source: 'authority-lab-tests', metric: 'serious-test-failures', stat: 'share' });
  map('override', { source: 'manual-review', metric: 'override-rate', stat: 'value' });
  map('incidents', { source: 'manual-review', metric: 'unresolved-critical-incidents', stat: 'count' });
  assert.equal(setupSteps(s, id).find((st) => st.id === 'configure').done, true, 'every requirement says which evidence judges it');
  assert.equal(setupSteps(s, id).find((st) => st.id === 'coverage').done, false, 'no results yet');
  s = addStarterScenarios(s, id, { by: 'ana-ruiz' });
  s = runSuite(s, id);
  s = recordManualEvidence(s, id, { by: 'ana-ruiz', label: 'Override rate', kind: 'eval', type: 'value', value: '12', unit: '%' });
  s = recordManualEvidence(s, id, { by: 'ana-ruiz', label: 'Unresolved critical incidents', kind: 'eval', type: 'count', value: '0' });
  assert.equal(setupSteps(s, id).find((st) => st.id === 'coverage').done, true, 'every requirement has results');
  s = proposeAuthority(s, id, 2, { by: 'ana-ruiz' });
  s = selectDecision(s, id, 'expand');
  s = setOutcome(setOutcome(s, id, 0, 'metric', 'Lookup accuracy'), id, 0, 'target', '≥ 95%');
  s = setOutcome(setOutcome(s, id, 1, 'metric', 'Time to first response'), id, 1, 'target', 'at least 25% faster');
  for (const [k, v] of Object.entries({ owner: 'ana-ruiz', scope: 'Lookups for the billing queue only.', startDate: '2026-10-08', feedbackChannel: '#lookup-feedback', reviewerNotes: 'Check each draft before sending it.', reviewDate: '2026-10-21' })) s = setRolloutField(s, id, k, v);
  s = authorize(s, id, { by: 'ana-ruiz' });
  assert.deepEqual(getCapability(s, id).authority, { level: 2, limited: false });
  assert.equal(setupSteps(s, id).filter((st) => !st.optional).every((st) => st.done), true, 'every required setup step done by one person');
});

test('a roster change that needs a second approver is refused just in time, naming what to add', () => {
  let s = solo();
  s = addPerson(s, { name: 'Ben Okoro', title: 'Ops Lead', team: 'Operations', by: 'ana-ruiz', reason: 'Joins the pilot.' });
  // The founding exception covers only making a second admin (Paige, 2026-10-12):
  // a sole admin can't hand out any other right without approval.
  const JIT = /You're the only workspace admin, and you can't approve your own change\. Make someone else a workspace admin first: as the only admin, you can do that straight away\. Then the two of you approve changes like this one\./;
  assert.throws(() => proposeRosterChange(s, { kind: 'rights', person: 'ben-okoro', right: 'riskApprover', grant: true, by: 'ana-ruiz', reason: 'Ben covers Risk sign-off.' }), JIT);
  assert.equal(isRiskApprover(s, 'ben-okoro'), false, 'no Risk approver right without approval');
  assert.equal(s.rosterProposals.length, 0, 'nothing applied or opened');
  // The People page shows the refusal with a link to where to add someone.
  const msg = "You're the only workspace admin, and you can't approve your own change. Make someone else a workspace admin first: as the only admin, you can do that straight away. Then the two of you approve changes like this one.";
  const page = render(s, () => String(peopleView(s, q(`error=${encodeURIComponent(msg)}`))));
  assert.match(page, /Make someone else a workspace admin first/);
  assert.match(page, /<a class="notice-link" href="#\/people\?focus=add">Add person<\/a>/);
  assert.match(page, /data-form="add-person"/);
  // The Risk approver form says so before anyone submits it.
  const riskForm = render(s, () => text(peopleView(s, q('person=ben-okoro&right=riskApprover&grant=1'))));
  assert.match(riskForm, /You're the only workspace admin, so nobody can approve this yet\. Make someone else a workspace admin first; then the two of you set up Risk approvers\./);
  // Making Ben the second admin is the one thing that applies at once.
  s = proposeRosterChange(s, { kind: 'rights', person: 'ben-okoro', right: 'workspaceAdmin', grant: true, by: 'ana-ruiz', reason: 'A second admin.' });
  assert.equal(isWorkspaceAdmin(s, 'ben-okoro'), true);
  // After that, taking a right away or deactivating a rights holder needs the other admin.
  s = proposeRosterChange(s, { kind: 'rights', person: 'ben-okoro', right: 'workspaceAdmin', grant: false, by: 'ana-ruiz', reason: 'Changed my mind.' });
  assert.ok(openRosterProposal(s, 'ben-okoro'), 'a proposal, not applied');
  assert.equal(isWorkspaceAdmin(s, 'ben-okoro'), true);
});

test('once a second workspace admin exists, rights changes are governed again and the other admin approves', () => {
  let s = solo();
  s = addPerson(s, { name: 'Ben Okoro', title: 'Ops Lead', team: 'Operations', by: 'ana-ruiz', reason: 'Joins the pilot.' });
  s = addPerson(s, { name: 'Cara Ng', title: 'Risk Lead', team: 'Risk', by: 'ana-ruiz', reason: 'Risk sign-off.' });
  s = proposeRosterChange(s, { kind: 'rights', person: 'ben-okoro', right: 'workspaceAdmin', grant: true, by: 'ana-ruiz', reason: 'A second admin.' });
  assert.equal(isWorkspaceAdmin(s, 'ben-okoro'), true);
  const founding = s.rosterProposals.at(-1);
  assert.deepEqual([founding.status, founding.founding, founding.approvals.length, founding.eligible.length], ['founding', true, 0, 0], 'recorded as taking effect at once, with no approver');
  assert.equal(rosterVersions(s).at(-1).founding, true);
  assert.match(s.activity[0].body, /There are now two workspace admins: from here on, changing anyone's rights needs the other admin's approval\./);
  // From now on the same kind of grant opens a proposal.
  s = proposeRosterChange(s, { kind: 'rights', person: 'cara-ng', right: 'riskApprover', grant: true, by: 'ana-ruiz', reason: 'Cara covers Risk sign-off.' });
  const pr = openRosterProposal(s, 'cara-ng');
  assert.ok(pr, 'a proposal, not applied');
  assert.equal(isRiskApprover(s, 'cara-ng'), false);
  assert.deepEqual(pr.eligible, ['ben-okoro']);
  assert.throws(() => approveRosterChange(s, pr.id, { by: 'ana-ruiz' }), /proposed this/);
  assert.throws(() => approveRosterChange(s, pr.id, { by: 'cara-ng' }), /receiving this right/);
  s = approveRosterChange(s, pr.id, { by: 'ben-okoro' });
  assert.equal(isRiskApprover(s, 'cara-ng'), true);
});

test('nobody approves their own change: no self-grant, and the founding roster never reopens', () => {
  let s = solo();
  assert.throws(() => proposeRosterChange(s, { kind: 'rights', person: 'ana-ruiz', right: 'riskApprover', grant: true, by: 'ana-ruiz', reason: 'I can sign off Risk.' }), /can't grant a right to yourself/);
  assert.throws(() => proposeRosterChange(s, { kind: 'rights', person: 'ana-ruiz', right: 'workspaceAdmin', grant: false, by: 'ana-ruiz', reason: 'Stepping down.' }), /Make someone else a workspace admin first/, 'the last admin cannot be removed');
  s = addPerson(s, { name: 'Ben Okoro', title: 'Ops Lead', team: 'Operations', by: 'ana-ruiz', reason: 'Joins the pilot.' });
  s = proposeRosterChange(s, { kind: 'rights', person: 'ben-okoro', right: 'workspaceAdmin', grant: true, by: 'ana-ruiz', reason: 'A second admin.' });
  // Ben steps down as admin, approved by... only Ana can, and she isn't the proposer.
  s = proposeRosterChange(s, { kind: 'rights', person: 'ben-okoro', right: 'workspaceAdmin', grant: false, by: 'ben-okoro', reason: 'Moving teams.' });
  s = approveRosterChange(s, openRosterProposal(s, 'ben-okoro').id, { by: 'ana-ruiz' });
  assert.deepEqual(activeAdmins(s), ['ana-ruiz']);
  // Back to one admin, but the founding roster is complete for good.
  assert.throws(() => proposeRosterChange(s, { kind: 'rights', person: 'ben-okoro', right: 'workspaceAdmin', grant: true, by: 'ana-ruiz', reason: 'Back again.' }), /Nobody else can approve this/);
  assert.equal(isWorkspaceAdmin(s, 'ben-okoro'), false);
  // The demo started with two admins, so it is never founding: grants are proposals.
  const demo = proposeRosterChange(initialState(), { kind: 'rights', person: 'elena', right: 'riskApprover', grant: true, by: 'maya', reason: 'Finance joins Risk sign-off.' });
  assert.equal(openRosterProposal(demo, 'elena').status, 'open');
  assert.equal(isRiskApprover(demo, 'elena'), false);
});

test('a capability change after results needs someone else, so a one-person workspace is refused and the proposer never approves', () => {
  let s = solo();
  s = addCapability(s, { name: 'Order lookup', owner: 'ana-ruiz', risk: LOW, today: 'nothing', by: 'ana-ruiz' });
  const id = lastCap(s);
  const d = defaultsFor(s, id);
  s = saveCriteria(s, id, { criteria: d.criteria, requirements: d.requirements, by: 'ana-ruiz' });
  s = addStarterScenarios(s, id, { by: 'ana-ruiz' });
  s = runSuite(s, id);
  const loosened = { criteria: current(s, id, 'criteria'), requirements: current(s, id, 'requirements').filter((r) => r.id !== 'incidents') };
  assert.throws(() => proposeAmendment(s, id, 'criteria', { value: loosened, by: 'ana-ruiz', reason: 'Incidents are tracked elsewhere for this one.' }), /other than Ana Ruiz/);
  // Just in time: the refusal says what to add when nobody else exists.
  assert.throws(() => proposeAmendment(s, id, 'criteria', { value: loosened, by: 'ana-ruiz', reason: 'Incidents are tracked elsewhere for this one.' }), /You're the only person in this workspace: add someone on People first\./);
  // With a second person named, the same change opens, and Ana still can't approve it.
  s = addPerson(s, { name: 'Ben Okoro', title: 'Ops Lead', team: 'Operations', by: 'ana-ruiz', reason: 'Joins the pilot.' });
  s = proposeAmendment(s, id, 'criteria', { value: loosened, by: 'ana-ruiz', reason: 'Incidents are tracked elsewhere for this one.' });
  const p = capData(s, id).proposals.at(-1);
  assert.equal(p.status, 'open');
  assert.ok(!p.eligible.includes('ana-ruiz'));
});

test('the People page: Person, Role, Can approve Risk changes, Workspace admin, with Manage; approval mechanics only when they matter', () => {
  const demo = initialState();
  const page = render(demo, () => String(peopleView(demo, q())));
  assert.match(page, /<thead><tr><th>Person<\/th><th>Role<\/th><th>Can approve Risk changes<\/th><th>Workspace admin<\/th><th><span class="sr-only">Manage<\/span><\/th><\/tr><\/thead>/);
  assert.match(text(page), /Daniel Okafor Risk & Compliance Lead Risk Yes No/);
  assert.match(page, /aria-label="Manage Priya Natarajan"/);
  assert.ok(!/Who can approve|frozen|There must always be at least one workspace admin|Active people/.test(page), 'no approval mechanics up front');
  // Proposing a grant explains who approves, at that moment.
  const form = render(demo, () => text(peopleView(demo, q('person=elena&right=riskApprover&grant=1'))));
  assert.match(form, /You're proposing this, so another workspace admin or a current Risk approver must approve it; Elena Rossi can't approve their own grant\./);
  // In a one-person workspace, the same form says it takes effect at once.
  let s = solo();
  s = addPerson(s, { name: 'Ben Okoro', title: 'Ops Lead', team: 'Operations', by: 'ana-ruiz', reason: 'Joins the pilot.' });
  const soloForm = render(s, () => text(peopleView(s, q('person=ben-okoro&right=workspaceAdmin&grant=1'))));
  assert.match(soloForm, /You're the only workspace admin, so making a second one takes effect straight away\. From then on, changing anyone's rights needs the other admin's approval\./);
  // Nobody is offered a right for themselves.
  const own = render(s, () => String(peopleView(s, q())));
  assert.ok(!own.includes('person=ana-ruiz&amp;right=riskApprover&amp;grant=1') && !own.includes('person=ana-ruiz&right=riskApprover&grant=1'));
});

// ---------------------------------------------------------------------------
// B. "What does it do today?" is context, not authority
// ---------------------------------------------------------------------------

test('each "What does it do today?" answer maps to Level 0 or 1, never above, with its context on the first record', () => {
  const NOTE = {
    drafts: 'Today, this capability already drafts actions for people to approve. Authority Lab will start it at Recommend until that autonomy is reviewed and formally approved.',
    acts: 'Today, this capability already acts automatically in some cases. Authority Lab will start it at Recommend until that autonomy is reviewed and formally approved.',
  };
  const expected = { nothing: 0, recommends: 1, drafts: 1, acts: 1, 'not-delegated': 0 };
  for (const [today, level] of Object.entries(expected)) {
    const s = addCapability(solo(), { name: `Refunds ${today}`, owner: 'ana-ruiz', risk: FIN, today, rationale: today === 'not-delegated' ? 'Money leaves the company; a person does this every time.' : '', by: 'ana-ruiz' });
    const cap = getCapability(s, lastCap(s));
    const rec = s.decisionRecords.at(-1);
    assert.deepEqual([cap.authority.level, rec.next.level], [level, level], today);
    assert.ok(cap.authority.level <= 1, `${today}: nothing starts above Level 1`);
    assert.equal(cap.status, today === 'not-delegated' ? 'not-delegated' : 'setup', today);
    assert.equal(rec.context.today, today);
    assert.equal(rec.context.note, NOTE[today] || null, today);
    if (NOTE[today]) {
      assert.ok(rec.rationale.startsWith(NOTE[today]), `${today}: the note leads the record's rationale`);
      assert.match(rec.openCondition, /The first authority decision reviews what it already does today/);
      assert.ok(s.activity[0].body.includes(NOTE[today]));
      // Shown in setup and on the record.
      const steps = render(s, () => text(setupView(s, cap.id, q())));
      assert.ok(steps.includes(NOTE[today]), `${today}: setup shows it`);
      assert.match(steps, /This is where what it already does today is reviewed and formally approved, one level at a time/);
      assert.ok(render(s, () => text(decisionRecordView(s, rec.id))).includes(NOTE[today]), `${today}: the record shows it`);
    }
  }
  assert.throws(() => addCapability(solo(), { name: 'X', owner: 'ana-ruiz', risk: FIN, today: 'broad', by: 'ana-ruiz' }), /Choose what it does today/);
  assert.throws(() => addCapability(solo(), { name: 'X', owner: 'ana-ruiz', risk: FIN, today: '', by: 'ana-ruiz' }), /Choose what it does today/);
  assert.throws(() => addCapability(solo(), { name: 'X', owner: 'ana-ruiz', risk: FIN, today: 'not-delegated', rationale: 'short', by: 'ana-ruiz' }), /Say why this stays with people/);
});

test('failure types are optional: defaults follow the risk profile, and a choice is kept', () => {
  let s = addCapability(solo(), { name: 'Refund execution', owner: 'ana-ruiz', risk: FIN, today: 'nothing', by: 'ana-ruiz' });
  const failures = current(s, lastCap(s), 'risk').failureTypes;
  assert.ok(failures.length >= 3);
  assert.ok(failures.includes('Wrong action') && failures.includes('Policy violation'), 'financial exposure adds its likely failures');
  assert.ok(failures.every((f) => RISK_OPTIONS.failureTypes.includes(f)));
  s = addCapability(solo(), { name: 'Tagging', owner: 'ana-ruiz', risk: { ...LOW, failureTypes: ['User rejection'] }, today: 'nothing', by: 'ana-ruiz' });
  assert.deepEqual(current(s, lastCap(s), 'risk').failureTypes, ['User rejection']);
});

test('the setup screens ask plain questions; answers map to the stored risk values (#139)', () => {
  let s = solo();
  const start = render(s, () => String(startView(s, q())));
  const words = text(start);
  for (const h of ['Starting point', 'What specific thing are we giving AI permission to do?', 'Is it already in use?', 'Who owns it?']) assert.ok(words.includes(h), h);
  for (const t of STARTING_POINTS) assert.match(start, new RegExp(`name="template" value="${t.id}"`));
  s = startCapability(s, { name: 'Tagging', owner: 'ana-ruiz', template: 'extract', lifecycle: 'planned', by: 'ana-ruiz' });
  const page = render(s, () => String(riskStepView(s, lastCap(s), q())));
  for (const k of ['impact', 'reversibility', 'exposure']) {
    assert.deepEqual(RISK_ANSWERS[k].map(([v]) => v), RISK_OPTIONS[k], `${k}: every stored value has a plain answer`);
  }
  assert.match(page, /<option value="Medium"[^>]*>Moderate: /, 'Severity reads Moderate; the stored key stays Medium');
  for (const [v, label] of TODAY_CHOICES) {
    assert.match(page, new RegExp(`name="today" value="${v}"`));
    assert.ok(text(page).includes(label));
  }
  assert.match(page, /name="likelihood"[\s\S]*Unknown: not enough to say yet/);
  assert.ok(!/the AI (may|won't|suggests|sees)/.test(page), 'no anthropomorphic phrasing');
  assert.ok(!/Suggested by AI/.test(start + page));
});

// ---------------------------------------------------------------------------
// The seven steps as three stages
// ---------------------------------------------------------------------------

test('setup shows its steps as Define, Evidence and Decide; tests are one way to fill a gap, not a step (#126)', () => {
  const s = addCapability(solo(), { name: 'Refund execution', owner: 'ana-ruiz', risk: FIN, today: 'acts', by: 'ana-ruiz' });
  const id = lastCap(s);
  const steps = setupSteps(s, id);
  assert.deepEqual(steps.map((st) => st.id), ['define', 'contract', 'criteria', 'configure', 'coverage', 'gaps', 'stakeholders', 'decision']);
  assert.deepEqual(SETUP_STAGES.map((st) => st.title), ['Define', 'Evidence', 'Decide']);
  assert.deepEqual(SETUP_STAGES.map((stage) => steps.filter((st) => st.stage === stage.id).map((st) => st.id)), [['define', 'contract'], ['criteria', 'configure', 'coverage', 'gaps'], ['stakeholders', 'decision']]);
  assert.equal(steps.find((st) => st.next).id, 'contract');
  assert.deepEqual([steps.find((st) => st.id === 'configure').needs, steps.find((st) => st.id === 'decision').needs], [false, false], 'evidence waits for the checks; the decision waits for any evidence');
  assert.equal(steps.find((st) => st.id === 'gaps').optional, true, 'filling gaps is optional: a connected eval can be enough');
  const page = render(s, () => String(setupView(s, id, q())));
  const words = text(page);
  assert.equal((page.match(/class="setup-stage /g) || []).length, 3);
  assert.match(words, /1\. Define 1 of 2 done[\s\S]*2\. Evidence 0 of 4 done[\s\S]*3\. Decide 0 of 2 done/);
  // Strong defaults to review, derived from the risk profile.
  assert.match(words, /These are the default safety limits for this risk profile: \d+ starter rules for a high-impact financial capability\./);
  assert.match(words, /For a high-impact financial capability, we recommend these checks: 7 targets and 7 decision requirements\./);
  assert.match(words, /Configure evidence[\s\S]*a connected source, Authority Lab tests, or a manual review/);
  assert.match(words, /Not every capability needs local tests: a connected eval can be enough\./);
  assert.match(words, /Name them before the first results come in/);
});

test('a capability that stays with people shows only its definition and the not-delegated step', () => {
  const s = addCapability(solo(), { name: 'Account deletion', owner: 'ana-ruiz', risk: FIN, today: 'not-delegated', rationale: 'Deletion cannot be undone; a person does it every time.', by: 'ana-ruiz' });
  const id = lastCap(s);
  assert.deepEqual(setupSteps(s, id).map((st) => st.id), ['define', 'not-delegated']);
  const page = render(s, () => String(setupView(s, id, q())));
  assert.equal((page.match(/class="setup-stage /g) || []).length, 1);
  assert.match(text(page), /Not delegated, by design/);
});
