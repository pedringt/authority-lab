// Built-in workspaces and State, the first real client (#121). State is
// configuration only, built by the same transitions anyone uses; nothing in
// the product knows about it, and nothing fictional is added to it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  initialState, createStore, STORAGE_KEY, BUILT_IN_WORKSPACES, findWorkspace, storageKeyFor, buildWorkspace, advanceToday, DEMO_WORKSPACE,
  getCapability, capData, current, people, evidenceSources, evidenceCoverage, coverageText, readiness, requirementsNow, targetsNow, contractChecks,
  importEvidence, importEvidenceFiles, proposeAuthority, selectDecision, setOutcome, setRolloutField, authorize, criteriaLocked, realUseEvidence, evidenceSignals,
} from '../src/store/index.js';
import { stateWorkspace } from '../src/data/workspaces/state.js';
import { setupSteps } from '../src/views/setup.js';

const ID = 'interpret-incoming-project-evidence';
const PAIGE = 'paige-edrington';
const build = () => buildWorkspace(stateWorkspace, { today: '2026-10-13' });

// The envelope State's verification run produced on Oct 13 (#517, run
// 38411808397): real aggregates, no content.
const REAL_RUN = JSON.parse('{"schema": "authority-lab-evidence/1", "id": "state:eval:review:gh-38411808397-1", "capabilityId": "interpret-incoming-project-evidence", "source": {"system": "State", "capability": "Evidence interpretation", "environment": "github-actions staging"}, "kind": "eval", "observedAt": "2026-10-13T14:15:49Z", "config": {"provider": "anthropic", "model": "claude-haiku-5-5", "prompt": "p-3c1347d6ec36", "implementation": "c4c51185bac2", "evalSet": "review-16-6fdace93940a"}, "measurements": [{"metric": "scenarios-passed", "label": "Scenarios passed", "type": "rate", "passed": 16, "total": 16}, {"metric": "interpretation-quality", "label": "Interpretation quality", "type": "rate", "passed": 16, "total": 16}, {"metric": "high-severity-failures", "label": "High-severity scenarios failed", "type": "count", "value": 0, "total": 16, "severity": "high"}, {"metric": "review-routing-misses", "label": "Consequential evidence that missed Review", "type": "count", "value": 0, "total": 12, "severity": "high"}, {"metric": "unnecessary-reviews", "label": "Reviews raised when none was needed", "type": "count", "value": 0, "total": 4, "severity": "low"}, {"metric": "errors", "label": "Scenarios that errored", "type": "count", "value": 0, "total": 16}, {"metric": "unsafe-direction-misses", "label": "Unconfirmed things proposed as settled", "type": "count", "value": 0, "total": 11, "severity": "high"}, {"metric": "scenarios-passed", "label": "Scenarios passed", "type": "rate", "passed": 10, "total": 10, "segment": "High-severity scenarios"}, {"metric": "scenarios-passed", "label": "Scenarios passed", "type": "rate", "passed": 5, "total": 5, "segment": "Medium-severity scenarios"}, {"metric": "scenarios-passed", "label": "Scenarios passed", "type": "rate", "passed": 1, "total": 1, "segment": "Low-severity scenarios"}, {"metric": "scenarios-passed", "label": "Scenarios passed", "type": "rate", "passed": 5, "total": 5, "segment": "Stale or conflicting evidence"}, {"metric": "scenarios-passed", "label": "Scenarios passed", "type": "rate", "passed": 9, "total": 9, "segment": "False certainty"}, {"metric": "scenarios-passed", "label": "Scenarios passed", "type": "rate", "passed": 3, "total": 3, "segment": "Authority"}], "notes": "Controlled synthetic scenarios from State\'s review interpretation suite, read as a rate (RELEASE.md). Aggregates only.", "reference": {"url": "https://github.com/pedringt/ai-learning/actions/runs/38411808397/attempts/1", "label": "GitHub Actions run 38411808397"}}');

test('the demo and State are separate built-in workspaces, each saved under its own key', () => {
  assert.deepEqual(BUILT_IN_WORKSPACES.map((w) => [w.id, w.name, w.note]), [['northstar', 'Northstar Support', 'Demo, fictional'], ['state', 'State', 'Real configuration']]);
  assert.equal(storageKeyFor(DEMO_WORKSPACE), STORAGE_KEY, 'the demo keeps its old key, so saved demos survive');
  assert.equal(storageKeyFor('state'), `${STORAGE_KEY}:state`);
  assert.equal(findWorkspace('nope').id, DEMO_WORKSPACE);
  // Two stores in one browser never share state; Reset rebuilds the open one.
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const demo = createStore({ storage, key: storageKeyFor('northstar'), build: () => initialState() });
  const st = createStore({ storage, key: storageKeyFor('state'), build });
  st.dispatch('advanceToday', '2026-10-20');
  assert.equal(st.get().today, '2026-10-20');
  assert.equal(demo.get().today, '2026-10-07');
  assert.equal(createStore({ storage, key: storageKeyFor('state'), build }).get().today, '2026-10-20', 'saved under its key');
  st.dispatch('reset');
  assert.equal(st.get().today, '2026-10-13', 'Reset brings State back to its configuration');
  assert.equal(getCapability(st.get(), ID).name, 'Interpret incoming project evidence');
});

test('State is one real person and one capability that drafts today, so it starts at Recommend', () => {
  const s = build();
  assert.deepEqual(Object.keys(people(s)), [PAIGE], 'nobody is invented');
  assert.equal(s.workspace.name, 'State');
  assert.equal(s.clientWorkspace.real, true);
  const cap = getCapability(s, ID);
  assert.deepEqual(cap.authority, { level: 1, limited: false });
  assert.equal(cap.owner, PAIGE);
  assert.match(s.decisionRecords[0].context.note, /already drafts actions for people to approve/);
  assert.equal(s.decisionRecords.length, 1, 'no decision is made for anyone');
  assert.deepEqual(current(s, ID, 'risk').impact, 'Medium');
});

test('its rules are exactly the configured ones, built and finalized through the builder', () => {
  const s = build();
  const c = current(s, ID, 'contract');
  assert.deepEqual(c.mustNever, stateWorkspace.capabilities[0].rules.mustNever);
  assert.ok(c.may.includes('Decide that Evidence needs no Review, keeping it as Evidence only.'), '"no review needed" is in its allowed behaviour (Paige, Oct 13)');
  assert.ok(c.may.some((x) => /Slack conversation/.test(x)));
  assert.equal(contractChecks(s, ID).filter((x) => x.level === 'block').length, 0);
  // Every template line and suggestion was reviewed, and the rejections kept.
  const draft = capData(s, ID).contractDraft;
  assert.ok(draft.finalizedAt);
  assert.ok(draft.lines.filter((l) => l.source === 'ai').every((l) => l.status === 'rejected'));
});

test('no fictional evidence: State starts with none, and the gaps show as gaps', () => {
  const s = build();
  assert.equal(capData(s, ID).evidence.length, 0);
  assert.deepEqual(evidenceSources(s).map((x) => x.id), ['authority-lab-tests', 'manual-review', 'state-evidence-interpretation']);
  assert.ok(evidenceSources(s).every((x) => !x.example));
  assert.equal(coverageText(evidenceCoverage(s, ID)), '0 of 5 decision requirements have sufficient evidence; "Minimum 16 eval scenarios in a run" has no results yet.');
  assert.throws(() => proposeAuthority(s, ID, 2, { by: PAIGE }), /There is no evidence yet/);
  const steps = Object.fromEntries(setupSteps(s, ID).map((x) => [x.id, x.done]));
  assert.deepEqual(steps, { define: true, contract: true, criteria: true, configure: true, coverage: false, gaps: false, stakeholders: true, decision: false });
});

test('State\'s real run is judged through the normal model: the approved bar, Draft can be proposed, Level 3 waits for real use', () => {
  let s = importEvidence(build(), REAL_RUN);
  assert.equal(criteriaLocked(s, ID), true);
  assert.equal(coverageText(evidenceCoverage(s, ID)), '5 of 5 decision requirements have sufficient evidence.');
  assert.equal(readiness(s, ID).met, 5);
  assert.deepEqual(requirementsNow(s, ID).map((r) => r.current), ['16', '100% across 16 cases', '0 across 11 cases', '0 across 12 cases', '100% across 10 cases']);
  assert.ok(targetsNow(s, ID).every((t) => t.status === 'pass'));
  assert.deepEqual(evidenceSignals(s, ID), []);
  // A person, not the evidence, moves it to Draft.
  s = proposeAuthority(s, ID, 2, { by: PAIGE });
  s = selectDecision(s, ID, 'expand');
  s = setOutcome(setOutcome(s, ID, 0, 'metric', 'Scenarios passed'), ID, 0, 'target', '≥ 93%');
  s = setOutcome(setOutcome(s, ID, 1, 'metric', 'Unsafe-direction misses'), ID, 1, 'target', 'at most 0');
  for (const [k, v] of Object.entries({ owner: PAIGE, scope: 'Every Evidence interpretation in State; a person decides every proposal in Review.', startDate: '2026-10-13', feedbackChannel: 'GitHub issues on pedringt/ai-learning', reviewerNotes: 'Read each Review against its Evidence; nothing reaches Current State without your decision.', reviewDate: '2026-11-10' })) s = setRolloutField(s, ID, k, v);
  s = authorize(s, ID, { by: PAIGE });
  assert.deepEqual(getCapability(s, ID).authority, { level: 2, limited: false });
  const rec = s.decisionRecords.at(-1);
  assert.equal(rec.externalEvidence[0].runs[0].id, 'state:eval:review:gh-38411808397-1');
  assert.equal(rec.externalEvidence[0].config.prompt, 'p-3c1347d6ec36');
  // Evals aren't real use.
  assert.equal(realUseEvidence(s, ID), false);
  assert.throws(() => proposeAuthority(s, ID, 3, { by: PAIGE }), /Level 3 needs evidence from real use/);
});

test('Decide doesn\'t call one person with no position "all agree"', async () => {
  const { capabilityView } = await import('../src/views/capability.js');
  const { setPeople } = await import('../src/ui.js');
  const s = importEvidence(build(), REAL_RUN);
  setPeople(people(s));
  const h = String(capabilityView(s, ID, new URLSearchParams('tab=decide')));
  assert.match(h, /<strong>Stakeholder positions<\/strong><span class="decide-line-meta">no positions yet<\/span>/);
});

test('the State envelope belongs to the State workspace only: elsewhere in the demo', () => {
  const { results } = importEvidenceFiles(initialState(), [{ file: 'state.json', envelope: REAL_RUN }]);
  assert.deepEqual(results.map((r) => r.status), ['elsewhere']);
});

test('a client workspace runs on the real calendar, forward only', () => {
  const s = build();
  assert.equal(advanceToday(s, '2026-10-20').today, '2026-10-20');
  assert.equal(advanceToday(s, '2026-10-01'), s);
});

test('nothing in the product knows State: its ids appear only in its configuration file', () => {
  const offenders = [];
  for (const dir of ['../src/store', '../src/views', '../src']) {
    const path = new URL(`${dir}/`, import.meta.url);
    for (const f of readdirSync(path)) {
      if (!f.endsWith('.js')) continue;
      const src = readFileSync(new URL(f, path), 'utf8');
      if (/state-evidence-interpretation|interpret-incoming-project-evidence|paige-edrington|Evidence interpretation/.test(src)) offenders.push(`${dir}/${f}`);
    }
  }
  assert.deepEqual(offenders, []);
});
