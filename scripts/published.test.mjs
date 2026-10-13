// Published records (Paige, 2026-10-13): a decision made in a browser becomes
// the real record only when it is committed, and it is replayed through the
// same checks on every load.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initialState, buildWorkspace, BUILT_IN_WORKSPACES, getCapability, importEvidence, importEvidenceFiles, proposeAuthority, selectDecision, setOutcome, setRolloutField, setRationale, authorize,
  publishableRecord, replayPublished, applyPublishedRecords, isPublished, RECORD_SCHEMA, people,
} from '../src/store/index.js';
import { stateWorkspace } from '../src/data/workspaces/state.js';
import { setPeople } from '../src/ui.js';
import { decisionRecordView } from '../src/views/decisions.js';

const ID = 'interpret-incoming-project-evidence';
const PAIGE = 'paige-edrington';
const evidenceDir = new URL('../src/data/external-evidence/', import.meta.url);
const committedEvidence = () => JSON.parse(readFileSync(new URL('index.json', evidenceDir), 'utf8')).files.map((file) => ({ file, envelope: JSON.parse(readFileSync(new URL(file, evidenceDir), 'utf8')) }));
// What a visitor's browser builds: configuration, then the committed evidence.
const base = () => importEvidenceFiles(buildWorkspace(stateWorkspace, { today: '2026-10-13' }), committedEvidence()).state;

// A Draft decision made in a browser, the way a person makes it.
function decideDraft(s, { rationale = 'All five checks are met on State\'s review suite run of Oct 13, with no unsafe-direction misses.' } = {}) {
  s = proposeAuthority(s, ID, 2, { by: PAIGE });
  s = selectDecision(s, ID, 'expand');
  s = setRationale(s, ID, rationale);
  s = setOutcome(setOutcome(s, ID, 0, 'metric', 'Scenarios passed'), ID, 0, 'target', '≥ 93%');
  s = setOutcome(setOutcome(s, ID, 1, 'metric', 'Unsafe-direction misses'), ID, 1, 'target', 'at most 0');
  for (const [k, v] of Object.entries({ owner: PAIGE, scope: 'Every Evidence interpretation in State; a person decides every proposal in Review.', startDate: '2026-10-13', feedbackChannel: 'GitHub issues on pedringt/ai-learning', reviewerNotes: 'Read each Review against its Evidence; nothing reaches Current State without your decision.', reviewDate: '2026-11-10' })) s = setRolloutField(s, ID, k, v);
  return authorize(s, ID, { by: PAIGE });
}

test('what is published from a browser decision: its inputs and who made it, nothing derived', () => {
  const made = decideDraft(base());
  const rec = made.decisionRecords.at(-1);
  const p = publishableRecord(made, rec.id);
  assert.equal(p.schema, RECORD_SCHEMA);
  assert.deepEqual([p.workspace, p.capabilityId, p.option, p.from, p.to, p.by, p.byName, p.date], ['state', ID, 'expand', 1, 2, PAIGE, 'Paige Edrington', '2026-10-13']);
  assert.deepEqual(p.expectedOutcomes, [{ metric: 'Scenarios passed', target: '≥ 93%' }, { metric: 'Unsafe-direction misses', target: 'at most 0' }]);
  assert.equal(p.rolloutPlan.reviewDate, '2026-11-10');
  assert.equal(p.rolloutPlan.ownerAt, undefined, 'nothing derived');
  assert.throws(() => publishableRecord(made, made.decisionRecords[0].id), /Only a decision a person made can be published/);
  assert.throws(() => publishableRecord(initialState(), 'AC-02'), /Only records in a client workspace/);
});

test('a published record replays through the same checks to the same decision, once', () => {
  const made = decideDraft(base());
  const entry = publishableRecord(made, made.decisionRecords.at(-1).id);
  const { state, results } = applyPublishedRecords(base(), [{ file: 'a.json', entry }]);
  assert.deepEqual(results.map((r) => r.status), ['applied']);
  assert.deepEqual(getCapability(state, ID).authority, { level: 2, limited: false });
  const rec = state.decisionRecords.at(-1);
  assert.ok(isPublished(rec));
  assert.equal(rec.date, '2026-10-13');
  assert.equal(rec.rationale, entry.rationale);
  assert.equal(rec.externalEvidence[0].runs[0].id, 'state:eval:review:gh-38411808397-1', 'the evidence it rested on is frozen on it');
  // Every load: already there, nothing doubled.
  const again = applyPublishedRecords(state, [{ file: 'a.json', entry }]);
  assert.deepEqual(again.results.map((r) => r.status), ['already']);
  assert.equal(again.state, state);
});

test('a published file can\'t skip a check: a jump, a thin rationale, or a decision without its evidence is refused', () => {
  const made = decideDraft(base());
  const entry = publishableRecord(made, made.decisionRecords.at(-1).id);
  const refused = (e, s = base()) => applyPublishedRecords(s, [{ file: 'x.json', entry: e }]).results[0];
  assert.match(refused({ ...entry, to: 4 }).reason, /Authority moves one level at a time/);
  assert.match(refused({ ...entry, rationale: 'ok' }).reason, /Say why/);
  // Without the evidence it rested on, there's nothing to propose on.
  assert.match(refused(entry, buildWorkspace(stateWorkspace, { today: '2026-10-13' })).reason, /There is no evidence yet/);
  assert.equal(refused({ ...entry, workspace: 'other' }).status, 'elsewhere');
  assert.equal(refused({ ...entry, from: 2 }).status, 'refused');
  assert.throws(() => replayPublished(base(), { ...entry, schema: 'nope/1' }), /Not a published record/);
});

test('the record page says whether a decision is published, and offers the file to commit when it isn\'t', () => {
  const made = decideDraft(base());
  const id = made.decisionRecords.at(-1).id;
  setPeople(people(made));
  const local = String(decisionRecordView(made, id));
  assert.match(local, /Not published: this decision exists only in this browser/);
  assert.match(local, /<textarea id="publish-json" class="publish-json" readonly rows="14">\{/);
  assert.match(local, /&quot;schema&quot;: &quot;authority-lab-record\/1&quot;/);
  const pub = applyPublishedRecords(base(), [{ file: 'a.json', entry: publishableRecord(made, id) }]).state;
  setPeople(people(pub));
  assert.match(String(decisionRecordView(pub, pub.decisionRecords.at(-1).id)), /<strong>Published<\/strong>/);
  // The demo never shows either.
  setPeople(people(initialState()));
  assert.doesNotMatch(String(decisionRecordView(initialState(), 'AC-02')), /Not published|publish-json/);
});

// Every committed record replays in its workspace, after the evidence, and is
// dated no earlier than the evidence it froze. CI runs this on the PR that
// publishes it, so a merged record is a valid one.
test('every committed published record replays cleanly, after its evidence', () => {
  const dir = new URL('../src/data/published-records/', import.meta.url);
  const index = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8'));
  assert.equal(index.schema, 'authority-lab-records-index/1');
  const files = index.files.map((file) => ({ file, entry: JSON.parse(readFileSync(new URL(file, dir), 'utf8')) }));
  for (const w of BUILT_IN_WORKSPACES.filter((x) => x.id !== 'northstar')) {
    const start = importEvidenceFiles(w.build({ today: '2026-10-13' }), committedEvidence()).state;
    const { state, results } = applyPublishedRecords(start, files);
    assert.deepEqual(results.filter((r) => r.status === 'refused'), [], w.id);
    for (const rec of state.decisionRecords.filter(isPublished)) {
      for (const st of rec.externalEvidence || []) for (const run of st.runs) assert.ok(run.observedAt.slice(0, 10) <= rec.date, `${rec.id} is dated before ${run.id}`);
    }
  }
});
