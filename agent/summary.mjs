// The run summary (A6): flags first, then the models side by side, then what
// each run cost. Built from recordings only, with the same classifier the
// "Agent runs" view uses.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyTicket, outcomeText, runFlags, runLabel, CAUGHT } from '../src/store/index.js';
import { RUNS_DIR, PRICES } from './runs.mjs';

const money = (x) => `$${x.toFixed(2)}`;

export function cellFor(run, ticketId) {
  const t = run.tickets.find((x) => x.ticketId === ticketId);
  if (!t) return 'not run';
  const c = classifyTicket(t);
  return c.caught ? `${CAUGHT[c.caught].label}: ${outcomeText(c).toLowerCase()}` : outcomeText(c);
}

export function summarize(runs, tickets, { cap = null } = {}) {
  const flags = runs.flatMap((r) => runFlags(r).map((f) => `${r.model}: ${f.text}`));
  const lines = [];
  lines.push(flags.length ? `> **⚠️ Flagged.**\n${flags.map((f) => `> - ${f}`).join('\n')}` : '**Nothing got through.** On every temptation ticket the model either declined or the gate stopped it.');
  lines.push('');
  lines.push(`| Ticket | Tempts | ${runs.map((r) => r.model).join(' | ')} |`);
  lines.push(`|---|---|${runs.map(() => '---').join('|')}|`);
  for (const t of tickets) lines.push(`| ${t.id} | ${t.tempts} | ${runs.map((r) => cellFor(r, t.id)).join(' | ')} |`);
  lines.push('');
  const tally = (r) => {
    const cs = r.tickets.map(classifyTicket).filter((c) => c.caught);
    return Object.keys(CAUGHT).map((k) => `${cs.filter((c) => c.caught === k).length} ${CAUGHT[k].label.toLowerCase()}`).join(', ');
  };
  lines.push('| Run | Temptation tickets | Model calls | Input tokens | Output tokens | Cost |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of runs) lines.push(`| ${runLabel(r)} | ${tally(r)} | ${r.usage.calls} | ${r.usage.input_tokens.toLocaleString('en-US')} | ${r.usage.output_tokens.toLocaleString('en-US')} | ${money(r.cost)} |`);
  const total = runs.reduce((t, r) => t + r.cost, 0);
  lines.push('');
  lines.push(`**Actual cost: ${money(total)}**${cap != null ? ` of the ${money(cap)} cap` : ''}, computed from each reply's reported usage at the prices in \`agent/runs.mjs\`.`);
  return lines.join('\n');
}

// The list of recordings the app loads, rebuilt from the files in RUNS_DIR:
// real runs first (newest first), then dry runs.
export function writeIndex(dir = RUNS_DIR) {
  const runs = readdirSync(dir).filter((f) => f.endsWith('.json') && !['tickets.json', 'index.json'].includes(f)).map((file) => {
    const r = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    return { file, source: r.source, model: r.model, date: r.date, label: runLabel(r) };
  });
  // Same date: in the order models are listed in PRICES (Opus, Sonnet, Haiku).
  const rank = (m) => { const i = Object.keys(PRICES).indexOf(m); return i < 0 ? 99 : i; };
  runs.sort((a, b) => (a.source === b.source ? (b.date || '').localeCompare(a.date || '') || rank(a.model) - rank(b.model) : a.source === 'recorded' ? -1 : 1));
  writeFileSync(join(dir, 'index.json'), `${JSON.stringify({ runs }, null, 2)}\n`);
  return runs;
}
