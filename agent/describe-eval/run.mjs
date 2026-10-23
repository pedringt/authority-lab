#!/usr/bin/env node
// The 6B description-reading eval (Paige, 2026-10-22, decision 10).
//
//   node agent/describe-eval/run.mjs --estimate [--models a,b,c] [--repeat 3]
//   node agent/describe-eval/run.mjs --dry-run [--repeat 3]
//   node agent/describe-eval/run.mjs --live --models claude-haiku-5-5,claude-sonnet-5-5,claude-opus-5-5 --repeat 3 --budget 10 [--pr 172]
//
// --estimate prints the call count and the expected and worst-case cost.
// --dry-run runs the whole pipeline on the reviewed cases with the mock model
// (the 6A rules in the model's output shape): no network, no cost.
// --live calls real models and costs money. Like agent/run.mjs it reads the
// API key only from the shell environment (never .env), needs --budget, a
// hard cap for the whole invocation, refuses a cap the month's standing budget
// can't cover (agent/runs/ledger.md), keeps its ledger row current after every
// call, and saves each finished run at once. It is run on GitHub through the
// model-run workflow, with Paige's approval.

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRICES, createBudget } from '../runs.mjs';
import { readLedger, checkCap, appendLedger, updateLedger } from '../ledger.mjs';
import { loadCases, estimateEval, evalModel, mockModel, resultsText, DEFAULT_REPEAT } from './runner.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const RESULTS = join(here, 'results');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback; };
const list = (name, fallback) => String(option(name, fallback)).split(',').map((x) => x.trim()).filter(Boolean);
const repeat = Number(option('repeat', DEFAULT_REPEAT));
if (!(Number.isInteger(repeat) && repeat >= 1 && repeat <= 10)) { console.error('--repeat must be a whole number from 1 to 10.'); process.exit(1); }
const cases = loadCases();
if (!cases.length) { console.error('No reviewed cases: nothing counts until Paige reviews the labels.'); process.exit(1); }

function fileFor(date, model) {
  mkdirSync(RESULTS, { recursive: true });
  let name = `${date}-${model}.json`;
  for (let i = 2; existsSync(join(RESULTS, name)); i++) name = `${date}-${model}-${i}.json`;
  return join(RESULTS, name);
}
const save = (file, result) => writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);

export function estimateText(e) {
  const money = (x) => `$${x.toFixed(2)}`;
  const lines = [`${e.cases} reviewed cases × ${e.repeat} runs, prompt ${e.promptVersion}, effort ${e.effort}, max_tokens ${e.maxTokens}.`];
  for (const r of e.rows) lines.push(`- ${r.model}: ${r.calls} calls. Expected about ${money(r.dollars.expected)} (${r.tokens.expected.input.toLocaleString('en-US')} tokens in, ${r.tokens.expected.output.toLocaleString('en-US')} out); worst case ${money(r.dollars.worst)}.`);
  lines.push(`Total: ${e.calls} calls. Expected about ${money(e.dollars.expected)}; worst case ${money(e.dollars.worst)}.`);
  return lines.join('\n');
}

if (flag('estimate')) {
  console.log(estimateText(estimateEval({ cases, models: list('models', Object.keys(PRICES).join(',')), repeat })));
  process.exit(0);
}

if (flag('dry-run')) {
  const date = option('date', new Date().toISOString().slice(0, 10));
  const result = await evalModel({ cases, model: mockModel(), modelId: 'mock-6a-rules', repeat, date });
  console.log(resultsText([result]));
  console.error(`Dry run: ${cases.length} cases × ${repeat} runs through the mock model (the 6A rules). No network, no cost, nothing saved.`);
  process.exit(0);
}

if (flag('live')) {
  const models = list('models', '');
  const cap = Number(option('budget', NaN));
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const pr = option('pr', null);
  const date = option('date', new Date().toISOString().slice(0, 10));
  if (!models.length || models.some((m) => !PRICES[m])) { console.error(`--models must list models with known prices: ${Object.keys(PRICES).join(', ')}.`); process.exit(1); }
  if (!(cap > 0)) { console.error('--budget <dollars> is required: a hard cap for the whole invocation.'); process.exit(1); }
  const also = option('ledger-also', null);
  const rows = readLedger();
  if (also && existsSync(also)) { const seen = new Set(rows.map((r) => JSON.stringify(r))); for (const r of readLedger(also)) if (!seen.has(JSON.stringify(r))) rows.push(r); }
  const room = checkCap(cap, date, rows);
  if (!room.ok) { console.error(`Refused: ${room.text}`); process.exit(1); }
  if (!apiKey) { console.error('ANTHROPIC_API_KEY is not set in this shell. It is only read from the shell environment, never from .env.'); process.exit(1); }
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey, maxRetries: 1 });
  const live = (model) => ({
    async respond(request) {
      const reply = await client.messages.create({ model, max_tokens: request.maxTokens, system: request.system, messages: request.messages, output_config: request.outputConfig });
      const text = (reply.content.find((b) => b.type === 'text') || { text: '' }).text;
      return { text, stop_reason: reply.stop_reason, usage: reply.usage };
    },
  });
  console.error(estimateText(estimateEval({ cases, models, repeat })));
  console.error(`Hard cap for this invocation: $${cap.toFixed(2)}. ${room.text}`);
  const marker = `running (${process.pid}-${Date.now()})`;
  const base = { date, pr: pr ? `#${pr}` : '—', models: models.join(', '), tickets: `describe-eval (${cases.length} cases)`, repeats: repeat, cap };
  appendLedger({ ...base, cost: 0, status: marker });
  const budget = createBudget(cap, { onSpend: (spent) => updateLedger(marker, { ...base, cost: spent, status: marker }) });
  const results = [];
  let status = 'finished';
  let closed = false;
  const close = (final) => { if (closed) return; closed = true; updateLedger(marker, { ...base, cost: budget.spent, status: final.replace(/\|/g, '/') }); };
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { console.error(`${sig}: closing the ledger row at $${budget.spent.toFixed(4)}.`); close(`cancelled (${sig}) partway`); process.exit(130); });
  try {
    for (const m of models) {
      console.error(`Running ${m}: ${cases.length} cases × ${repeat}…`);
      const file = fileFor(date, m);
      const result = await evalModel({ cases, model: live(m), modelId: m, repeat, budget, date, onRun: (partial) => save(file, partial) });
      save(file, result);
      results.push(result);
      console.error(`${m}: $${result.cost.toFixed(4)}; ${result.passed ? 'passes' : 'does not pass'}. Spent so far $${budget.spent.toFixed(4)}.`);
      if (result.stoppedEarly) { status = `stopped early: ${result.stoppedEarly.reason}`; console.error(`STOPPED: ${result.stoppedEarly.text}`); break; }
    }
  } catch (err) {
    status = `failed: ${err.message.split('\n')[0].slice(0, 80)}`;
    console.error(`FAILED: ${err.message}`);
  } finally {
    close(status);
  }
  if (results.length) {
    const text = resultsText(results, { cap });
    writeFileSync(join(RESULTS, `summary-${date}.md`), `${text}\n`);
    console.log(text);
  }
  process.exit(status === 'finished' ? 0 : status.startsWith('stopped') ? 2 : 1);
}

console.error('Use --estimate, --dry-run or --live.');
process.exit(1);
