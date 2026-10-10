#!/usr/bin/env node
// Recorded agent runs (A6).
//
//   node agent/run.mjs --estimate [--models a,b] [--tickets standard,stress] [--repeat 5]
//   node agent/run.mjs --dry-run
//   node agent/run.mjs --live --models claude-haiku-5-5 --budget 0.50 [--shared]
//   node agent/run.mjs --live --models claude-haiku-5-5,claude-sonnet-5-5 --tickets standard,stress --repeat 5 --budget 15 --pr 87
//   node agent/run.mjs --summary
//
// --live calls a real model and costs money. It needs ANTHROPIC_API_KEY set
// in the shell (.env is never read) and --budget, a hard cap in dollars shared
// by everything in the invocation. The cap must fit in the month's remaining
// standing budget (agent/runs/ledger.md); otherwise nothing runs. For each
// ticket set and model in turn it records one run, or with --repeat N a set of
// N independent runs, and stops at once if the cap is reached or if any bait
// gets through. Every invocation adds a row to the ledger, even one that
// stops early or fails partway.
// --shared runs every ticket of a run in one session, so cumulative rules carry over.
// --summary rebuilds the summary from every real recording in the index.

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTickets, estimateCost, recordRun, recordRepeats, validateRun, createBudget, observedCostPerTicket, PRICES, RUNS_DIR, TICKET_SETS } from './runs.mjs';
import { mockModel } from './mock-model.mjs';
import { summarize, writeIndex } from './summary.mjs';
import { readLedger, checkCap, appendLedger, updateLedger } from './ledger.mjs';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback; };
const list = (name, fallback) => String(option(name, fallback)).split(',').map((x) => x.trim()).filter(Boolean);
const here = dirname(fileURLToPath(import.meta.url));
const ticketSets = list('tickets', 'standard');
if (ticketSets.some((s) => !TICKET_SETS[s])) { console.error(`--tickets must be from: ${Object.keys(TICKET_SETS).join(', ')}.`); process.exit(1); }
const repeat = Number(option('repeat', 1));
if (!(Number.isInteger(repeat) && repeat >= 1 && repeat <= 20)) { console.error('--repeat must be a whole number from 1 to 20.'); process.exit(1); }
const ticketsBySet = Object.fromEntries(Object.keys(TICKET_SETS).map((s) => [s, loadTickets(s)]));

function write(rec, file) {
  const errors = validateRun(rec);
  if (errors.length) throw new Error(`Not writing an invalid recording:\n${errors.join('\n')}`);
  writeFileSync(join(RUNS_DIR, file), `${JSON.stringify(rec, null, 2)}\n`);
}

// A file name that never overwrites an earlier recording.
function fileFor(date, model, set, { shared, repeat: n }) {
  const base = `${date}-${model}${shared ? '-shared' : ''}${set !== 'standard' ? `-${set}` : ''}${n > 1 ? `-x${n}` : ''}`;
  let name = `${base}.json`;
  for (let i = 2; existsSync(join(RUNS_DIR, name)); i++) name = `${base}-${i}.json`;
  return name;
}

function recordedRecordings() {
  const index = JSON.parse(readFileSync(join(RUNS_DIR, 'index.json'), 'utf8'));
  return index.runs.filter((e) => e.source === 'recorded').map((e) => JSON.parse(readFileSync(join(RUNS_DIR, e.file), 'utf8')));
}

function writeSummary(recs, opts = {}) {
  const text = summarize(recs, ticketsBySet, opts);
  const date = recs.map((r) => r.date).sort().at(-1);
  mkdirSync(join(here, 'runs'), { recursive: true });
  writeFileSync(join(here, 'runs', `summary-${date}.md`), `${text}\n`);
  return text;
}

if (flag('summary')) {
  console.log(writeSummary(recordedRecordings()));
  process.exit(0);
}

if (flag('estimate')) {
  const models = list('models', Object.keys(PRICES).join(','));
  let worst = 0; let expected = 0; let observed = 0; let calls = 0;
  for (const set of ticketSets) {
    for (const m of models) {
      const e = estimateCost({ tickets: ticketsBySet[set], model: m });
      const o = observedCostPerTicket(m);
      const obs = o ? o.perTicket * ticketsBySet[set].length * repeat : null;
      worst += e.dollars.worst * repeat; expected += e.dollars.expected * repeat; observed += obs || e.dollars.expected * repeat; calls += e.calls.max * repeat;
      console.log(`${set} × ${repeat} on ${m}: ${ticketsBySet[set].length} tickets, up to ${e.calls.max * repeat} calls, max_tokens ${e.maxTokensPerCall}. Estimated about $${(e.dollars.expected * repeat).toFixed(2)}${obs != null ? `, about $${obs.toFixed(2)} at the rate observed in earlier runs (${o.basis})` : ''}; at most $${(e.dollars.worst * repeat).toFixed(2)}.`);
    }
  }
  console.log(`Total: up to ${calls} calls. Estimated about $${expected.toFixed(2)} (about $${observed.toFixed(2)} at observed rates); worst case $${worst.toFixed(2)}.`);
  process.exit(0);
}

if (flag('dry-run')) {
  const run = await recordRun({ tickets: ticketsBySet.standard, model: mockModel(), modelId: 'mock', source: 'mock', date: option('date', '2026-10-07') });
  write(run, 'dry-run-mock.json');
  const stress = await recordRun({ tickets: ticketsBySet.stress, model: mockModel(), modelId: 'mock', source: 'mock', date: option('date', '2026-10-07'), ticketSet: 'stress' });
  write(stress, 'dry-run-mock-stress.json');
  writeIndex();
  console.error(`Dry run: ${run.tickets.length} standard and ${stress.tickets.length} stress tickets, no real model called.`);
  process.exit(0);
}

if (flag('live')) {
  const models = list('models', '');
  const cap = Number(option('budget', NaN));
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const shared = flag('shared');
  const pr = option('pr', null);
  const date = option('date', new Date().toISOString().slice(0, 10));
  if (!models.length || models.some((m) => !PRICES[m])) { console.error(`--models must list models with known prices: ${Object.keys(PRICES).join(', ')}.`); process.exit(1); }
  if (!(cap > 0)) { console.error('--budget <dollars> is required: a hard cap for the whole invocation.'); process.exit(1); }
  // The standing budget: the ledger here, plus (on GitHub) main's ledger, so
  // runs on other branches count too.
  const also = option('ledger-also', null);
  const rows = readLedger();
  if (also && existsSync(also)) { const seen = new Set(rows.map((r) => JSON.stringify(r))); for (const r of readLedger(also)) if (!seen.has(JSON.stringify(r))) rows.push(r); }
  const room = checkCap(cap, date, rows);
  if (!room.ok) { console.error(`Refused: ${room.text}`); process.exit(1); }
  if (!apiKey) { console.error('ANTHROPIC_API_KEY is not set in this shell. It is only read from the shell environment, never from .env.'); process.exit(1); }
  const { liveModel } = await import('./live-model.mjs');
  for (const set of ticketSets) for (const m of models) {
    const e = estimateCost({ tickets: ticketsBySet[set], model: m });
    console.error(`${set} × ${repeat} on ${m}: up to ${e.calls.max * repeat} calls; estimated about $${(e.dollars.expected * repeat).toFixed(2)}, at most $${(e.dollars.worst * repeat).toFixed(2)}.`);
  }
  console.error(`Hard cap for this invocation: $${cap.toFixed(2)}. ${room.text}`);
  // The ledger row is written now and kept current after every call, so a
  // run that is cancelled or killed partway still shows what it spent.
  const marker = `running (${process.pid}-${Date.now()})`;
  const base = { date, pr: pr ? `#${pr}` : '—', models: models.join(', ') + (shared ? ' (shared session)' : ''), tickets: ticketSets.join(', '), repeats: repeat, cap };
  appendLedger({ ...base, cost: 0, status: marker });
  const budget = createBudget(cap, { onSpend: (spent) => updateLedger(marker, { ...base, cost: spent, status: marker }) });
  const recs = [];
  let status = 'finished';
  let closed = false;
  const close = (final) => {
    if (closed) return;
    closed = true;
    updateLedger(marker, { ...base, cost: budget.spent, status: final.replace(/\|/g, '/') });
    writeIndex();
  };
  // Cancelled or timed out on GitHub: close the row and keep what's saved.
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { console.error(`${sig}: closing the ledger row at $${budget.spent.toFixed(4)}.`); close(`cancelled (${sig}) partway`); process.exit(130); });
  try {
    outer: for (const set of ticketSets) {
      for (const m of models) {
        console.error(`Running ${m} on the ${set} tickets${repeat > 1 ? ` × ${repeat}` : ''}…`);
        const file = fileFor(date, m, set, { shared, repeat });
        const opts = { tickets: ticketsBySet[set], model: liveModel({ model: m, apiKey }), modelId: m, source: 'recorded', date, budget, shared, ticketSet: set };
        // Each finished run of a set is saved at once, not only at the end.
        const rec = repeat > 1 ? await recordRepeats({ ...opts, repeat, onProgress: (partial) => { write(partial, file); writeIndex(); } }) : await recordRun(opts);
        write(rec, file);
        writeIndex();
        recs.push(rec);
        console.error(`${m}, ${set}: ${rec.usage.calls} calls, $${rec.cost.toFixed(4)}. Spent so far $${budget.spent.toFixed(4)}.`);
        if (rec.stoppedEarly) { status = `stopped early: ${rec.stoppedEarly.reason}`; console.error(`STOPPED: ${rec.stoppedEarly.text}`); break outer; }
      }
    }
  } catch (err) {
    status = `failed: ${err.message.split('\n')[0].slice(0, 80)}`;
    console.error(`FAILED: ${err.message}`);
  } finally {
    close(status);
  }
  if (recs.length) {
    writeIndex();
    writeSummary(recordedRecordings());
    console.log(summarize(recs, ticketsBySet, { cap }));
  }
  process.exit(status === 'finished' ? 0 : status.startsWith('stopped') ? 2 : 1);
}

console.error('Use --estimate, --dry-run, --live or --summary.');
process.exit(1);
