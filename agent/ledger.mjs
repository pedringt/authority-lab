// The paid-run ledger (agent/runs/ledger.md) and the standing monthly budget.
// Paige set it on 2026-10-10: $25 per calendar month (UTC). A request whose
// cap would take the month past the budget is refused before any call.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const LEDGER = join(here, 'runs', 'ledger.md');
export const MONTHLY_BUDGET = 25;

const dollars = (s) => Number(String(s).replace(/[$,]/g, '')) || 0;

// Rows of the ledger table: { date, pr, models, tickets, repeats, cap, cost, status }.
export function readLedger(file = LEDGER) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n')
    .filter((l) => /^\|\s*\d{4}-\d{2}-\d{2}\s*\|/.test(l))
    .map((l) => {
      const [date, pr, models, tickets, repeats, cap, cost, status] = l.split('|').slice(1, -1).map((c) => c.trim());
      return { date, pr, models, tickets, repeats: Number(repeats) || 1, cap: dollars(cap), cost: dollars(cost), status };
    });
}

// What the month (YYYY-MM of `date`) has spent, and what's left.
export function monthBudget(date, rows = readLedger(), budget = MONTHLY_BUDGET) {
  const month = date.slice(0, 7);
  const spent = rows.filter((r) => r.date.slice(0, 7) === month).reduce((t, r) => t + r.cost, 0);
  return { month, budget, spent: Math.round(spent * 10000) / 10000, remaining: Math.round((budget - spent) * 10000) / 10000 };
}

// Refuse a cap that the month can't cover.
export function checkCap(cap, date, rows = readLedger()) {
  const m = monthBudget(date, rows);
  if (cap > m.remaining) return { ok: false, ...m, text: `A $${cap.toFixed(2)} cap would go over the ${m.month} budget: $${m.spent.toFixed(2)} of $${m.budget.toFixed(2)} is spent, so $${m.remaining.toFixed(2)} is left.` };
  return { ok: true, ...m, text: `$${m.spent.toFixed(2)} of the $${m.budget.toFixed(2)} ${m.month} budget is spent; this cap leaves $${(m.remaining - cap).toFixed(2)} at most.` };
}

export function appendLedger(row, file = LEDGER) {
  const line = `| ${row.date} | ${row.pr || '—'} | ${row.models} | ${row.tickets} | ${row.repeats} | $${row.cap.toFixed(2)} | $${row.cost.toFixed(4)} | ${row.status} |`;
  const text = readFileSync(file, 'utf8').replace(/\n*$/, '\n');
  writeFileSync(file, `${text}${line}\n`);
  return line;
}
