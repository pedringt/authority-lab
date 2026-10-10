#!/usr/bin/env node
// Recorded agent runs (A6). Today this only does dry runs with the scripted
// mock model and prints cost estimates. It cannot call a real model: there is
// no live adapter until Paige OKs the cost (docs/plans/A6-recorded-runs.md).
//
//   node agent/run.mjs --estimate [--model claude-opus-5-5]
//   node agent/run.mjs --dry-run [--out agent/runs/dry-run-mock.json]

import { writeFileSync } from 'node:fs';
import { loadTickets, estimateCost, recordRun, validateRun, PRICES } from './runs.mjs';
import { mockModel } from './mock-model.mjs';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback; };
const tickets = loadTickets();

if (flag('live')) {
  console.error('Live runs are not available yet. They need Paige\'s OK on the model, call count and cost first (docs/plans/A6-recorded-runs.md).');
  process.exit(1);
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
  const errors = validateRun(run);
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  const out = option('out', null);
  const json = `${JSON.stringify(run, null, 2)}\n`;
  if (out) writeFileSync(out, json); else process.stdout.write(json);
  const steps = run.tickets.flatMap((t) => t.steps);
  console.error(`Dry run: ${run.tickets.length} tickets, ${steps.length} tool calls, ${run.usage.calls} mock model turns, no real model called.`);
  process.exit(0);
}

console.error('Use --estimate or --dry-run.');
process.exit(1);
