import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, startTestRun, advanceTestRun, selectDecision, authorize, simulateBreach, recordReview, capData, getCapability, people } from '../src/store/index.js';
import { setPeople } from '../src/ui.js';
import { welcomeView, guideView, GUIDE_STEPS } from '../src/views/guide.js';

const RR = 'refund-recommendation';
const fresh = () => ({ state: initialState(), capabilityId: RR, role: 'maya', tested: false, decided: null, breached: false });
const text = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&gt;/g, '>').replace(/\s+/g, ' ');

test('the first visit offers a guided demo or the finished workspace, with the idea in plain product language', () => {
  const h = String(welcomeView());
  assert.match(h, /<h1>Decide when an AI workflow is ready for more autonomy\.<\/h1>/);
  for (const p of ['1. Start with limited autonomy', '2. Evaluate the results', '3. Make the decision', '4. Enforce the boundaries']) assert.ok(h.includes(p), p);
  assert.match(h, /href="#\/guide\/1" data-action="welcomed"><h2>Guided demo<\/h2>/);
  assert.match(h, /href="#\/overview" data-action="welcomed"><h2>Explore the finished workspace<\/h2>/);
  assert.doesNotMatch(text(h), /\bthe AI\b|\ban AI\b(?! workflow)/, 'no anthropomorphic AI phrasing');
});

test('the guided demo has seven steps, each teaching one idea, with the rail showing progress', () => {
  setPeople(people(initialState()));
  assert.deepEqual(GUIDE_STEPS, ['Define the capability', 'Current autonomy', 'Set the boundaries', 'What would justify more autonomy', 'See the results', 'Make the decision', 'What happens if things go wrong']);
  const g = fresh();
  const titles = GUIDE_STEPS.map((_, i) => String(guideView(g, i + 1)).match(/<h1>(.*?)<\/h1>/)[1]);
  assert.deepEqual(titles, ['We evaluate one capability at a time.', 'Autonomy is gradual, not on or off.', 'Set the boundaries first.', 'What would we need to see before expanding autonomy?', 'Overall performance is strong, but high-value refunds are still under-tested.', 'Should we expand autonomy for this capability?', 'Automation is pulled back automatically when a safety limit is crossed.']);
  const step3 = String(guideView(g, 3));
  assert.match(step3, /is-done[^]*is-done[^]*is-current"><a href="#\/guide\/3">Set the boundaries/);
  // Levels appear first at step 2, with the capability at Draft.
  assert.doesNotMatch(String(guideView(g, 1)), /guide-ladder/);
  assert.match(String(guideView(g, 2)), /<div class="is-now"><strong>Draft<\/strong>/);
  assert.match(String(guideView(g, 2)), /Moved to Draft on Sep 2, when Maya Chen approved the pilot\./);
  // Boundaries in plain words; the checks before results, without values.
  for (const b of ['Allowed', 'Requires human review', 'Never allowed', 'Automation is pulled back if']) assert.ok(step3.includes(b), b);
  const step4 = String(guideView(g, 4));
  assert.match(step4, /Minimum 40 high-value refund cases/);
  assert.doesNotMatch(step4, /18/, 'no results before the results step');
});

test('the guided demo waits for each action, and every action is a real store transition on its own copy', () => {
  const g = fresh();
  const workspace = initialState();
  // Step 5: Next waits for the tests.
  assert.match(String(guideView(g, 5)), /data-action="guide-run-tests"/);
  assert.match(String(guideView(g, 5)), /is-disabled" aria-disabled="true">Next/);
  let s = startTestRun(g.state, RR);
  for (let i = 0; i < 200 && capData(s, RR).testRun.status === 'running'; i++) s = advanceTestRun(s, RR);
  const tested = { ...g, state: s, tested: true };
  const five = text(guideView(tested, 5));
  assert.match(five, /5 of 6 checks met/);
  assert.match(five, /24 of 26 tests passed/);
  assert.match(five, /High-value refunds \(> \$100\) 18 of 40 needed 83%/);
  assert.match(String(guideView(tested, 5)), /btn btn-primary" href="#\/guide\/6">Next/);
  // Step 6: the recommendation, then the recorded decision in plain words.
  assert.match(text(guideView(tested, 6)), /Recommended: expand autonomy within limits\./);
  const a = authorize(selectDecision(s, RR, 'expand-limits'), RR, { by: 'maya' });
  const decided = { ...tested, state: a, decided: a.decisionRecords.at(-1).id };
  const six = text(guideView(decided, 6));
  assert.match(six, /Decision recorded: Expanded autonomy within limits/);
  assert.match(six, /Standard refunds up to \$50 can now run automatically, capped at \$500 per day\./);
  // Step 7: cross the limit; Maya can't review her own decision, Daniel can.
  assert.match(String(guideView(decided, 7)), /data-action="guide-breach"/);
  const b = { ...decided, state: simulateBreach(a, RR), breached: true };
  const asMaya = text(guideView(b, 7));
  assert.match(asMaya, /This capability was moved back to Draft after crossing a safety limit\./);
  assert.match(asMaya, /The person who approved the autonomy change can't review their own decision\./);
  assert.match(asMaya, /For the demo, switch to Daniel Okafor in "Demo as" above\./);
  const asDaniel = String(guideView({ ...b, role: 'daniel' }, 7));
  assert.match(asDaniel, /Reviewing as Daniel Okafor, Risk\./);
  assert.match(asDaniel, /data-form="guide-review"/);
  const reviewed = { ...b, role: 'daniel', state: recordReview(b.state, RR, { by: 'daniel', whatHappened: 'Two severe errors.', cause: 'Return status unchecked.', changes: 'Check return status first.' }) };
  const end = text(guideView(reviewed, 7));
  assert.match(end, /Review complete\. This capability stays at Draft for now\./);
  assert.match(end, /That's Authority Lab\./);
  // The workspace never changed: the guide works on its own copy.
  assert.deepEqual(getCapability(workspace, RR).authority, getCapability(initialState(), RR).authority);
  assert.equal(workspace.decisionRecords.length, initialState().decisionRecords.length);
});
