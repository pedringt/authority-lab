#!/usr/bin/env node
// Recorded agent runs (A6).
//
//   node agent/run.mjs --estimate [--model claude-opus-5-5]
//   node agent/run.mjs --dry-run
//   node agent/run.mjs --live --models claude-opus-5-5,claude-haiku-5-5 --budget 11.50
//
// --live calls a real model and costs money. It needs ANTHROPIC_API_KEY set
// in the shell (.env is never read) and --budget, a hard cap in dollars shared
// by every model in the invocation. It runs each model once over the fixture
// tickets, stops at once if the cap is reached or if any bait gets through,
// writes the recordings to src/data/agent-runs/, and prints the summary.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTickets, estimateCost, recordRun, validateRun, createBudget, PRICES, RUNS_DIR } from './runs.mjs';
import { mockModel } from './mock-model.mjs';
import { summarize, writeIndex } from './summary.mjs';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback; };
const tickets = loadTickets();
const here = dirname(fileURLToPath(import.meta.url));

function write(run, file) {
  const errors = validateRun(run);
  if (errors.length) throw new Error(`Not writing an invalid recording:\n${errors.join('\n')}`);
  writeFileSync(join(RUNS_DIR, file), `${JSON.stringify(run, null, 2)}\n`);
}

if (flag('estimate')) {
  const models = option('model', null) ? [option('model')] : Object.keys(PRICES);
  for (const m of models) {
    const e = estimateCost({ tickets, model: m });
    console.log(`${m}: ${e.tickets} tickets, up to ${e.calls.max} calls (about ${e.calls.expected} expected), max_tokens ${e.maxTokensPerCall} per call. Expected about $${e.dollars.expected.toFixed(2)}, at most $${e.dollars.worst.toFixed(2)}.`);
  }
  process.exit(0);
}

if (flag('dry-run')) {
  const run = await recordRun({ tickets, model: mockModel(), modelId: 'mock', source: 'mock', date: option('date', '2026-10-07') });
  write(run, 'dry-run-mock.json');
  writeIndex();
  console.error(`Dry run: ${run.tickets.length} tickets, ${run.tickets.flatMap((t) => t.steps).length} tool calls, ${run.usage.calls} mock model turns, no real model called.`);
  process.exit(0);
}

if (flag('live')) {
  const models = String(option('models', '')).split(',').filter(Boolean);
  const cap = Number(option('budget', NaN));
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!models.length || models.some((m) => !PRICES[m])) { console.error(`--models must list models with known prices: ${Object.keys(PRICES).join(', ')}.`); process.exit(1); }
  if (!(cap > 0)) { console.error('--budget <dollars> is required: a hard cap for the whole invocation.'); process.exit(1); }
  if (!apiKey) { console.error('ANTHROPIC_API_KEY is not set in this shell. It is only read from the shell environment, never from .env.'); process.exit(1); }
  const { liveModel } = await import('./live-model.mjs');
  for (const m of models) {
    const e = estimateCost({ tickets, model: m });
    console.error(`${m}: up to ${e.calls.max} calls, max_tokens ${e.maxTokensPerCall}; expected about $${e.dollars.expected.toFixed(2)}, at most $${e.dollars.worst.toFixed(2)}.`);
  }
  console.error(`Hard cap for this invocation: $${cap.toFixed(2)}.`);
  const date = option('date', new Date().toISOString().slice(0, 10));
  const budget = createBudget(cap);
  const runs = [];
  for (const m of models) {
    console.error(`Running ${m} on ${tickets.length} tickets…`);
    const run = await recordRun({ tickets, model: liveModel({ model: m, apiKey }), modelId: m, source: 'recorded', date, budget });
    write(run, `${date}-${m}.json`);
    runs.push(run);
    console.error(`${m}: ${run.usage.calls} calls, $${run.cost.toFixed(4)}. Spent so far $${budget.spent.toFixed(4)}.`);
    if (run.stoppedEarly) { console.error(`STOPPED: ${run.stoppedEarly.text}`); break; }
  }
  writeIndex();
  const text = summarize(runs, tickets, { cap });
  mkdirSync(join(here, 'runs'), { recursive: true });
  writeFileSync(join(here, 'runs', `summary-${date}.md`), `${text}\n`);
  console.log(text);
  process.exit(runs.some((r) => r.stoppedEarly) ? 2 : 0);
}

console.error('Use --estimate, --dry-run or --live.');
process.exit(1);
