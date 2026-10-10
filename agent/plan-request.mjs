#!/usr/bin/env node
// The plan for a paid model run (A6), shown before anyone approves it. Used
// by the workflow's "plan" job, which has no environment and no secrets.
//
//   node agent/plan-request.mjs [--sha <commit>] [--changed <file>] [--ledger-also <file>] [--date YYYY-MM-DD]
//
// Reads agent/runs/request.json, checks it (models with known prices, ticket
// sets, repeats, a cap of at most $25 that fits the month's remaining
// standing budget), prints the plan as Markdown, and, on GitHub, writes the
// request's values to $GITHUB_OUTPUT. Exits 1 if the request isn't valid.

import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLedger, checkCap } from './ledger.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const option = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback; };

// Kept in step with PRICES and TICKET_SETS in runs.mjs (a test checks), so
// this script needs no dependencies.
export const KNOWN_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
export const KNOWN_SETS = ['standard', 'stress'];
export const REQUEST_CEILING = 25;

export function checkRequest(r) {
  const errors = [];
  const models = Array.isArray(r.models) ? r.models : [];
  const tickets = Array.isArray(r.tickets) && r.tickets.length ? r.tickets : ['standard'];
  const repeat = r.repeat == null ? 1 : Number(r.repeat);
  const budget = Number(r.budget);
  if (!models.length || models.some((m) => !KNOWN_MODELS.includes(m))) errors.push(`models must be from: ${KNOWN_MODELS.join(', ')}.`);
  if (tickets.some((t) => !KNOWN_SETS.includes(t))) errors.push(`tickets must be from: ${KNOWN_SETS.join(', ')}.`);
  if (!(Number.isInteger(repeat) && repeat >= 1 && repeat <= 20)) errors.push('repeat must be a whole number from 1 to 20.');
  if (!(budget > 0 && budget <= REQUEST_CEILING)) errors.push(`budget must be more than $0 and at most $${REQUEST_CEILING}.`);
  if (r.shared != null && typeof r.shared !== 'boolean') errors.push('shared must be true or false.');
  return { errors, request: { models, tickets, repeat, budget, shared: Boolean(r.shared) } };
}

export function planText({ request, sha, changed, room }) {
  const lines = [
    '## Paid model run: the plan to approve',
    '',
    `- **Commit:** \`${sha || 'unknown'}\` (the run job checks out exactly this commit)`,
    `- **Models:** ${request.models.join(', ')}`,
    `- **Tickets:** ${request.tickets.join(', ')}`,
    `- **Repeats:** ${request.repeat}`,
    `- **Cap:** $${request.budget.toFixed(2)}`,
    `- **Shared session:** ${request.shared ? 'yes' : 'no'}`,
    `- **Standing budget:** ${room.text}`,
    '',
    '**Files changed under `agent/`, `src/store/` and `.github/` compared with main:**',
    '',
    ...(changed.length ? changed.map((f) => `- \`${f}\``) : ['- none']),
  ];
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = join(here, 'runs', 'request.json');
  if (!existsSync(file)) { console.error('No agent/runs/request.json on this branch: nothing to run.'); process.exit(1); }
  let raw;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch (err) { console.error(`request.json is not valid JSON: ${err.message}`); process.exit(1); }
  const { errors, request } = checkRequest(raw);
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  const rows = readLedger();
  const also = option('ledger-also', null);
  if (also && existsSync(also)) { const seen = new Set(rows.map((r) => JSON.stringify(r))); for (const r of readLedger(also)) if (!seen.has(JSON.stringify(r))) rows.push(r); }
  const room = checkCap(request.budget, option('date', new Date().toISOString().slice(0, 10)), rows);
  const changedFile = option('changed', null);
  const changed = changedFile && existsSync(changedFile) ? readFileSync(changedFile, 'utf8').split('\n').filter(Boolean) : [];
  console.log(planText({ request, sha: option('sha', null), changed, room }));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, [
      `models=${request.models.join(',')}`,
      `tickets=${request.tickets.join(',')}`,
      `repeat=${request.repeat}`,
      `budget=${request.budget}`,
      `shared=${request.shared}`,
    ].join('\n') + '\n');
  }
  if (!room.ok) { console.error(`Refused: ${room.text}`); process.exit(1); }
}
