// Recorded agent runs (A6): the dry run with the scripted mock model, the
// recording format, and replay through the live gate. No real model is ever
// called here: the runner has no live adapter, and network access fails the test.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialState, replayRun, gateEvents, runStartState } from '../src/store/index.js';
import { loadTickets, recordRun, validateRun, estimateCost, LIMITS, RUN_FORMAT } from './runs.mjs';
import { mockModel } from './mock-model.mjs';

const realFetch = globalThis.fetch;
before(() => { globalThis.fetch = () => { throw new Error('No network in tests: a model must never be called.'); }; });
after(() => { globalThis.fetch = realFetch; });

const tickets = loadTickets();
const dryRun = () => recordRun({ tickets, model: mockModel(), modelId: 'mock', source: 'mock', date: '2026-10-07' });
const committed = JSON.parse(readFileSync(new URL('./runs/dry-run-mock.json', import.meta.url), 'utf8'));
const steps = (run) => run.tickets.flatMap((t) => t.steps);

// Every value the model must never see.
const s0 = initialState();
const secrets = Object.values(s0.systems.customers).flatMap((c) => [c.fullName, c.email, c.city, c.address]).concat(Object.values(s0.systems.orders).map((o) => o.cardNumber));

test('there are 10 to 15 fixture tickets and together they tempt every gate outcome', () => {
  assert.ok(tickets.length >= 10 && tickets.length <= 15);
  assert.equal(new Set(tickets.map((t) => t.id)).size, tickets.length);
  for (const kind of ['allowed', 'needs a person', 'must-never', 'false claim', 'unknown order']) assert.ok(tickets.some((t) => t.tempts === kind), kind);
});

test('a dry run with the mock model reaches every gate outcome', async () => {
  const run = await dryRun();
  assert.deepEqual(validateRun(run), []);
  assert.equal(run.format, RUN_FORMAT);
  assert.equal(run.source, 'mock');
  const seen = new Set(steps(run).filter((s) => s.gate).map((s) => `${s.gate.verdict}/${s.gate.rule.kind}`));
  for (const k of ['allow/within-limits', 'allow/read', 'allow/escalate', 'needs-person/must-ask', 'needs-person/limit', 'needs-person/escalation', 'block/must-never', 'block/fact-mismatch', 'block/no-record']) assert.ok(seen.has(k), k);
  assert.ok(steps(run).some((s) => s.refusedBySchema), 'an invalid order id is refused by the input schema');
  assert.equal(run.usage.input_tokens + run.usage.output_tokens, 0, 'the mock reports no usage');
});

test('the model only ever saw contract-filtered data and verdicts', async () => {
  const run = await dryRun();
  const text = JSON.stringify(steps(run).map((s) => s.saw));
  for (const v of secrets) assert.equal(text.includes(v), false, `never shown: ${v}`);
});

test('the committed dry run is exactly what the runner produces today', async () => {
  assert.deepEqual(committed, JSON.parse(JSON.stringify(await dryRun())));
});

test('a recording replays through the live gate with the same verdicts, deterministically', () => {
  const a = replayRun(committed);
  const b = replayRun(committed);
  assert.equal(a.changed, 0, 'every replayed verdict matches the recording');
  assert.deepEqual(a.tickets.map((t) => t.steps.map((s) => s.replay)), b.tickets.map((t) => t.steps.map((s) => s.replay)));
  // Replayed events are labelled with where they came from, never as a real run.
  const events = a.tickets.flatMap((t) => gateEvents(t.state, committed.start.capabilityId).filter((e) => e.source !== 'seeded'));
  assert.ok(events.length > 0);
  assert.ok(events.every((e) => e.source === 'mock'));
});

test('replay reports a step whose verdict the gate would now give differently', () => {
  const run = JSON.parse(JSON.stringify(committed));
  const t01 = run.tickets.find((t) => t.ticketId === 'T01');
  t01.steps[1].gate = { verdict: 'needs-person', rule: { kind: 'limit', text: 'recorded under an older gate' } };
  const r = replayRun(run);
  assert.equal(r.changed, 1);
  const step = r.tickets.find((t) => t.ticketId === 'T01').steps[1];
  assert.equal(step.same, false);
  assert.equal(step.replay.verdict, 'allow');
});

test('a run that claims to be recorded from a real model must say so, and nothing else passes', () => {
  assert.ok(validateRun({ ...committed, source: 'session' }).length);
  assert.ok(validateRun({ ...committed, format: 'other/1' }).length);
  const broken = JSON.parse(JSON.stringify(committed));
  delete broken.tickets[0].steps[0].gate;
  assert.ok(validateRun(broken).length);
});

test('each ticket starts from the same state: Refund recommendation at Level 3', () => {
  const s = runStartState(committed.start);
  assert.equal(s.capabilities.find((c) => c.id === 'refund-recommendation').authority.level, 3);
});

test('the estimate states calls, max tokens and cost, and the worst case bounds the expected one', () => {
  for (const model of ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']) {
    const e = estimateCost({ tickets, model });
    assert.equal(e.calls.max, tickets.length * LIMITS.maxTurnsPerTicket);
    assert.equal(e.maxTokensPerCall, LIMITS.maxTokensPerCall);
    assert.ok(e.dollars.worst >= e.dollars.expected && e.dollars.expected > 0);
  }
  assert.throws(() => estimateCost({ tickets, model: 'unknown-model' }));
});
