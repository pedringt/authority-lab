// The run summary (A6): flags first, then the models side by side, then what
// each run cost. Built from recordings only, with the same classifier the
// "Agent runs" view uses.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyTicket, outcomeText, runFlags, runLabel, restrictionIn, CAUGHT } from '../src/store/index.js';
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
  const head = (r) => `${r.model}${r.start && r.start.shared ? ' (shared session)' : ''}`;
  lines.push(`| Ticket | Tempts | ${runs.map(head).join(' | ')} |`);
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
  for (const r of runs.filter((x) => x.start && x.start.shared)) {
    const fired = restrictionIn(r);
    lines.push('');
    lines.push(fired
      ? `**Shared session (${r.model}): automatic restriction fired on ${fired.ticketId}**, taking Refund recommendation from Level ${fired.from ?? 3} to Level ${fired.to}. ${fired.ticketId === r.tickets.at(-1).ticketId ? 'That was the last ticket, so no ticket ran under the lower level.' : 'Later tickets ran under the lower level.'}`
      : `**Shared session (${r.model}): automatic restriction did not fire.**`);
  }
  // Recordings keep the ticket text they ran with; say where it differs from today's.
  for (const r of runs) {
    const changed = r.tickets.filter((t) => { const now = tickets.find((x) => x.id === t.ticketId); return now && t.message && now.message !== t.message; }).map((t) => t.ticketId);
    if (changed.length) { lines.push(''); lines.push(`_${runLabel(r)} ran ${changed.join(', ')} with their earlier wording; the recording keeps the text the model actually saw._`); }
  }
  const total = runs.reduce((t, r) => t + r.cost, 0);
  lines.push('');
  lines.push(`**Actual cost: ${money(total)}**${cap != null ? ` of the ${money(cap)} cap` : ''}. Cost is computed from the token usage each reply reported, priced with the price table (\`PRICES\`) in \`agent/runs.mjs\`, not from the Console's billing.`);
  return lines.join('\n');
}

// The list of recordings the app loads, rebuilt from the files in RUNS_DIR:
// real runs first (newest first), then dry runs.
export function writeIndex(dir = RUNS_DIR) {
  const runs = readdirSync(dir).filter((f) => f.endsWith('.json') && !['tickets.json', 'index.json'].includes(f)).map((file) => {
    const r = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    return { file, source: r.source, model: r.model, date: r.date, ...(r.start && r.start.shared ? { shared: true } : {}), label: runLabel(r) };
  });
  // Same date: in the order models are listed in PRICES (Opus, Sonnet, Haiku).
  const rank = (m) => { const i = Object.keys(PRICES).indexOf(m); return i < 0 ? 99 : i; };
  runs.sort((a, b) => (a.source === b.source ? (b.date || '').localeCompare(a.date || '') || rank(a.model) - rank(b.model) || Number(Boolean(a.shared)) - Number(Boolean(b.shared)) : a.source === 'recorded' ? -1 : 1));
  writeFileSync(join(dir, 'index.json'), `${JSON.stringify({ runs }, null, 2)}\n`);
  return runs;
}
