// v1 W2 (#183): manual monitoring readings. The Owner or a configured
// Reviewer records a reading for a restriction rule; it goes through the same
// restriction rules as any other reading; a correction supersedes a reading
// without restoring anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideWith } from './helpers.mjs';
import {
  initialState, authorize, setActingAs, getCapability, capData, current, monitoringStatus, reviewNeeded,
  readingRules, readingEligibility, checkReading, recordReading, currentReading, manualReadings,
} from '../src/store/index.js';
import { updateCap } from '../src/store/state.js';
import { capabilityView } from '../src/views/capability.js';

const RR = 'refund-recommendation';
const ERROR_RATE = 'rule-3'; // "Error rate above 8% over 7 days returns … to Draft"
const VIOLATIONS = 'rule-2'; // "2 high-severity policy violations within 7 days …"
const SEVERE = 'rule-1'; // "… above 5% across the rolling 50 autonomous cases …"
const GATE = 'rule-5'; // counted from logged actions

// Northstar's refund capability after the Level 3 expansion (today Oct 7),
// with Daniel configured as a Reviewer. Maya is the Owner; Priya stays a
// Stakeholder.
function expanded() {
  const s = authorize(decideWith(initialState(), RR, 'expand-limits'), RR);
  const d = capData(s, RR);
  const list = d.versions.stakeholders;
  const last = list.at(-1);
  const value = last.value.map((x) => (x.person === 'daniel' ? { ...x, role: 'reviewer' } : x));
  return updateCap(s, RR, { versions: { ...d.versions, stakeholders: [...list.slice(0, -1), { ...last, value }] } });
}
const WEEK = { periodStart: '2026-10-01', periodEnd: '2026-10-07' };
const read = (over = {}) => ({ by: 'maya', ruleId: ERROR_RATE, value: 3, units: '%', ...WEEK, source: 'Weekly QA sample', ...over });
const text = (html) => String(html).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, '\'').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const monitor = (s, q = '') => String(capabilityView(s, RR, new URLSearchParams(`tab=monitor${q}`)));

test('the fixture: Maya owns it, Daniel is a configured Reviewer, Priya is a Stakeholder', () => {
  const s = expanded();
  assert.equal(getCapability(s, RR).owner, 'maya');
  assert.deepEqual(current(s, RR, 'stakeholders').filter((x) => x.role === 'reviewer').map((x) => x.person), ['daniel']);
  assert.ok(current(s, RR, 'stakeholders').some((x) => x.person === 'priya' && x.role !== 'reviewer'));
});

test('the Owner and a Reviewer may record a reading; a Stakeholder is refused', () => {
  const s = expanded();
  assert.equal(readingEligibility(s, RR, 'maya').ok, true);
  assert.equal(readingEligibility(s, RR, 'daniel').ok, true);
  assert.equal(readingEligibility(s, RR, 'priya').ok, false);
  const byOwner = recordReading(s, RR, read());
  assert.equal(manualReadings(byOwner, RR).at(-1).by, 'maya');
  assert.equal(manualReadings(byOwner, RR).at(-1).byAt.name, 'Maya Chen');
  const byReviewer = recordReading(s, RR, read({ by: 'daniel' }));
  assert.equal(manualReadings(byReviewer, RR).at(-1).by, 'daniel', 'attributed to the person recording');
  assert.throws(() => recordReading(s, RR, read({ by: 'priya' })), /Only the Owner \(Maya Chen\) or a configured Reviewer can record a reading/);
});

test('a reading holds the rule, the period, the source, the value and the units', () => {
  const s = recordReading(expanded(), RR, read({ value: 4.5 }));
  const r = manualReadings(s, RR).at(-1);
  assert.match(r.rule, /^Error rate above 8% over 7 days/);
  assert.deepEqual([r.periodStart, r.periodEnd, r.source, r.value, r.units], ['2026-10-01', '2026-10-07', 'Weekly QA sample', 4.5, '%']);
  const rule = monitoringStatus(s, RR).rules.find((x) => x.id === ERROR_RATE);
  assert.equal(rule.value, 4.5, 'the current reading is what Monitor judges');
  assert.equal(rule.crossed, false);
});

test('a reading in the wrong units or for the wrong window is refused with a reason', () => {
  const s = expanded();
  assert.throws(() => recordReading(s, RR, read({ units: 'count' })), /This limit is a percentage: record the reading in %/);
  assert.throws(() => recordReading(s, RR, read({ ruleId: VIOLATIONS, units: '%', value: 1 })), /This limit is a count/);
  assert.throws(() => recordReading(s, RR, read({ ruleId: VIOLATIONS, units: 'count', value: 1.5 })), /A count is a whole number/);
  assert.throws(() => recordReading(s, RR, read({ periodStart: '2026-10-02' })), /measured over 7 days, so the period needs to be 7 days long; this one is 6/);
  assert.throws(() => recordReading(s, RR, read({ periodStart: '2026-09-30' })), /this one is 8/);
  assert.throws(() => recordReading(s, RR, read({ periodStart: '2026-10-02', periodEnd: '2026-10-08' })), /can't end after today/);
  assert.throws(() => recordReading(s, RR, read({ ruleId: SEVERE, cases: 40 })), /needs to cover exactly 50 cases/);
  assert.ok(checkReading(s, RR, read({ ruleId: SEVERE, cases: 50 })).ok, 'a rolling-case rule takes the case count');
  assert.throws(() => recordReading(s, RR, read({ source: '' })), /Say where the number comes from/);
});

test('a rule measured from logged actions refuses manual readings', () => {
  const s = expanded();
  const rule = readingRules(s, RR).find((r) => r.id === GATE);
  assert.match(rule.blocked, /counted from logged actions/);
  assert.throws(() => recordReading(s, RR, read({ ruleId: GATE, units: 'count', value: 0 })), /counted from logged actions/);
});

test('a stale or duplicate reading is refused; it can enter only as a correction', () => {
  const s = recordReading(expanded(), RR, read());
  // The same period again, and an older one.
  assert.throws(() => recordReading(s, RR, read({ value: 4 })), /The current reading \(RD-refund-recommendation-1\) covers a period ending 2026-10-07\. An older or duplicate reading can't replace it/);
  assert.throws(() => recordReading(s, RR, read({ periodStart: '2026-09-24', periodEnd: '2026-09-30' })), /An older or duplicate reading can't replace it/);
  assert.equal(currentReading(s, RR, manualReadings(s, RR)[0].rule).value, 3, 'the current reading is untouched');
  // A correction needs a reason.
  assert.throws(() => recordReading(s, RR, read({ value: 4, correctsId: 'RD-refund-recommendation-1' })), /Say why you are correcting it/);
  const fixed = recordReading(s, RR, read({ value: 4, correctsId: 'RD-refund-recommendation-1', reason: 'The QA sample double-counted two tickets.' }));
  assert.equal(manualReadings(fixed, RR).length, 2, 'the original is kept');
  assert.equal(currentReading(fixed, RR, manualReadings(s, RR)[0].rule).id, 'RD-refund-recommendation-2');
  // A reading already corrected can't be corrected again.
  assert.throws(() => recordReading(fixed, RR, read({ value: 5, correctsId: 'RD-refund-recommendation-1', reason: 'Another look at the sample.' })), /has already been corrected/);
});

test('a reading over the limit restricts, and the warning shown before saving matches what saving does', () => {
  const s = expanded();
  const check = checkReading(s, RR, read({ value: 9 }));
  assert.equal(check.ok, true);
  assert.equal(check.limit, '8%');
  assert.equal(check.reading, '9% over 7 days (limit 8%)');
  assert.equal(check.consequence.kind, 'restrict');
  assert.match(check.consequence.text, /moves back to Draft automatically/);
  const after = recordReading(s, RR, read({ value: 9 }));
  assert.equal(getCapability(after, RR).authority.level, 2, 'restricted to the level the rule names');
  assert.equal(reviewNeeded(after, RR).restriction, true);
  const rec = after.decisionRecords.at(-1);
  assert.equal(rec.option, 'auto-restrict');
  assert.match(rec.rationale, /Error rate above 8% over 7 days/);
  assert.match(capData(after, RR).monitoring.errors[0], /RD-refund-recommendation-1: 9%, 2026-10-01 to 2026-10-07, from Weekly QA sample\. Recorded by Maya Chen\./);
  // Within the limit: nothing happens, as shown.
  const ok = checkReading(s, RR, read({ value: 2 }));
  assert.equal(ok.consequence.kind, 'none');
  assert.equal(getCapability(recordReading(s, RR, read({ value: 2 })), RR).authority.level, 3);
});

test('a correction keeps the original, leaves the restriction and incident in place, and restores nothing', () => {
  const restricted = recordReading(expanded(), RR, read({ value: 9 }));
  const incidents = capData(restricted, RR).evidence.filter((e) => e.source === 'Incident').length;
  const check = checkReading(restricted, RR, read({ value: 3, correctsId: 'RD-refund-recommendation-1', reason: 'The export included test tickets.' }));
  // At Draft the limit no longer applies, so the check says nothing happens.
  assert.equal(check.consequence.kind, 'inactive');
  const fixed = recordReading(restricted, RR, read({ value: 3, correctsId: 'RD-refund-recommendation-1', reason: 'The export included test tickets.' }));
  assert.equal(manualReadings(fixed, RR).find((r) => r.id === 'RD-refund-recommendation-1').value, 9, 'the original reading is kept as it was');
  assert.equal(getCapability(fixed, RR).authority.level, 2, 'authority stays where the restriction left it');
  assert.equal(reviewNeeded(fixed, RR).restriction, true, 'the post-incident review is still required');
  assert.equal(capData(fixed, RR).monitoring.breached, true);
  assert.equal(capData(fixed, RR).evidence.filter((e) => e.source === 'Incident').length, incidents, 'the incident stays on record');
  assert.equal(fixed.decisionRecords.length, restricted.decisionRecords.length, 'no new decision');
  assert.match(fixed.activity[0].body, /A correction doesn't restore autonomy or remove any restriction or incident/);
});

test('a correction that crosses the limit restricts like any reading', () => {
  const s = recordReading(expanded(), RR, read({ value: 3 }));
  const check = checkReading(s, RR, read({ value: 9, correctsId: 'RD-refund-recommendation-1', reason: 'The first count missed a batch.' }));
  assert.equal(check.consequence.kind, 'restrict');
  assert.equal(getCapability(recordReading(s, RR, read({ value: 9, correctsId: 'RD-refund-recommendation-1', reason: 'The first count missed a batch.' })), RR).authority.level, 2);
});

test('Monitor: the reading form checks first, then saves; a Stakeholder sees who can', () => {
  const s = expanded();
  const html = monitor(s);
  assert.match(html, /data-form="record-reading"/);
  assert.match(text(html), /Record a reading/);
  assert.doesNotMatch(html, /name="save"/, 'no save before a check');
  const check = checkReading(s, RR, read({ value: 9 }));
  const checked = String(capabilityView(s, RR, new URLSearchParams('tab=monitor'), { readingCheck: { capabilityId: RR, result: check } }));
  assert.match(text(checked), /Limit 8% · Reading 9% over 7 days \(limit 8%\)/);
  assert.match(text(checked), /moves back to Draft automatically/);
  assert.match(checked, /name="save"/);
  // A Stakeholder is told who can record, and gets no form.
  const priya = monitor(setActingAs(s, 'priya'));
  assert.doesNotMatch(priya, /data-form="record-reading"/);
  assert.match(text(priya), /Only the Owner \(Maya Chen\) or a configured Reviewer can record a reading\. Priya Natarajan isn't one\./);
  // A recorded reading shows its source on the limit.
  const after = recordReading(s, RR, read({ value: 4 }));
  assert.match(text(monitor(after)), /4%, 7 days · limit 8% \(recorded by Maya Chen, Weekly QA sample\)/);
});
