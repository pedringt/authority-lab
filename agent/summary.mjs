// The run summary (A6): flags first, then each ticket set with the
// recordings side by side, then what each recording cost. Built from
// recordings only, with the same classifier the "Agent runs" view uses.
// A run set (several independent runs) shows rates, not single outcomes.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyTicket, runFlags, runLabel, restrictionIn, rateText, runsOf, unverifiedCases, setTicketDefinitions, CAUGHT } from '../src/store/index.js';
import { RUNS_DIR, PRICES, NOT_RECORDINGS } from './runs.mjs';

const money = (x) => `$${x.toFixed(2)}`;
const setOf = (rec) => rec.ticketSet || 'standard';

export function cellFor(rec, ticketId) {
  return rateText(rec, ticketId);
}

// `ticketsBySet`: { standard: [...], stress: [...] }, or a plain array of the
// standard tickets.
export function summarize(recs, ticketsBySet, { cap = null } = {}) {
  const sets = Array.isArray(ticketsBySet) ? { standard: ticketsBySet } : ticketsBySet;
  // Today's definitions, for rules older recordings don't carry.
  setTicketDefinitions(Object.values(sets).flat());
  const flags = recs.flatMap((r) => runFlags(r).map((f) => `${r.model}${setOf(r) !== 'standard' ? ` (${setOf(r)})` : ''}: ${f.text}`));
  const lines = [];
  lines.push(flags.length ? `> **⚠️ Flagged.**\n${flags.map((f) => `> - ${f}`).join('\n')}` : '**Nothing got through.** No bait executed: on every temptation ticket the model declined or the gate stopped it.');
  // Refunds within limits on an instruction nobody verified: not a breach,
  // but not "stopped" either. What decided each was the model's own confidence.
  const cases = recs.flatMap(unverifiedCases);
  if (cases.length) {
    const executed = cases.filter((c) => c.outcome === 'executed');
    const runsWith = new Set(executed.map((c) => `${c.model}|${c.run}|${c.ticketId}`)).size;
    lines.push('');
    lines.push(`**Within limits, on an unverified instruction:** ${runsWith} run${runsWith === 1 ? '' : 's'} refunded on an instruction nobody verified. Each request, and what decided it:`);
    lines.push('');
    for (const c of cases) lines.push(`- ${c.model}${c.run ? ` run ${c.run}` : ''}, ${c.ticketId}: $${c.amount} at model-reported confidence ${c.confidence ?? 'none'}${c.earlierConfidence.length ? ` (earlier in the ticket: ${c.earlierConfidence.join(', ')})` : ''} → ${c.outcome === 'executed' ? 'executed' : c.outcome === 'waiting' ? `sent to a person (${c.rule})` : `${c.outcome} (${c.rule})`}`);
    lines.push('');
    lines.push('_Open question for Paige (docs/DECISIONS.md): whether a person sees a refund like this depends only on the confidence the model reports about itself. The gate is unchanged until Paige chooses an option._');
  }
  const head = (r) => `${r.model}${r.start && r.start.shared ? ' (shared session)' : ''}${Array.isArray(r.runs) ? ` (${r.runs.length} runs)` : ''}`;
  for (const [set, tickets] of Object.entries(sets)) {
    const here = recs.filter((r) => setOf(r) === set);
    if (!here.length) continue;
    lines.push('');
    if (new Set(recs.map(setOf)).size > 1) lines.push(`**${set[0].toUpperCase()}${set.slice(1)} tickets**`, '');
    lines.push(`| Ticket | Tempts | ${here.map(head).join(' | ')} |`);
    lines.push(`|---|---|${here.map(() => '---').join('|')}|`);
    for (const t of tickets) lines.push(`| ${t.id} | ${t.tempts} | ${here.map((r) => cellFor(r, t.id)).join(' | ')} |`);
  }
  lines.push('');
  const tally = (r) => {
    const cs = runsOf(r).flatMap((x) => x.tickets.map(classifyTicket)).filter((c) => c.caught);
    return Object.keys(CAUGHT).map((k) => `${cs.filter((c) => c.caught === k).length} ${CAUGHT[k].label.toLowerCase()}`).join(', ');
  };
  lines.push('| Recording | Temptation tickets (all runs) | Model calls | Input tokens | Output tokens | Cost |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of recs) lines.push(`| ${runLabel(r)} | ${tally(r)} | ${r.usage.calls} | ${r.usage.input_tokens.toLocaleString('en-US')} | ${r.usage.output_tokens.toLocaleString('en-US')} | ${money(r.cost)} |`);
  for (const r of recs.filter((x) => x.start && x.start.shared)) {
    for (const [i, run] of runsOf(r).entries()) {
      const fired = restrictionIn(run);
      const which = runsOf(r).length > 1 ? `, run ${i + 1}` : '';
      lines.push('');
      lines.push(fired
        ? `**Shared session (${r.model}${which}): automatic restriction fired on ${fired.ticketId}**, taking Refund recommendation from Level ${fired.from ?? 3} to Level ${fired.to}. ${fired.ticketId === run.tickets.at(-1).ticketId ? 'That was the last ticket, so no ticket ran under the lower level.' : 'Later tickets ran under the lower level.'}`
        : `**Shared session (${r.model}${which}): automatic restriction did not fire.**`);
    }
  }
  // Recordings keep the ticket text they ran with; say where it differs from today's.
  for (const r of recs) {
    const now = sets[setOf(r)] || [];
    const changed = [...new Set(runsOf(r).flatMap((x) => x.tickets).filter((t) => { const n = now.find((y) => y.id === t.ticketId); return n && t.message && n.message !== t.message; }).map((t) => t.ticketId))];
    if (changed.length) { lines.push(''); lines.push(`_${runLabel(r)} ran ${changed.join(', ')} with their earlier wording; the recording keeps the text the model actually saw._`); }
  }
  const total = recs.reduce((t, r) => t + r.cost, 0);
  lines.push('');
  lines.push(`**Actual cost: ${money(total)}**${cap != null ? ` of the ${money(cap)} cap` : ''}. Cost is computed from the token usage each reply reported, priced with the price table (\`PRICES\`) in \`agent/runs.mjs\`, not from the Console's billing.`);
  return lines.join('\n');
}

// The list of recordings the app loads, rebuilt from the files in RUNS_DIR:
// real runs first (newest first), then dry runs.
export function writeIndex(dir = RUNS_DIR) {
  const runs = readdirSync(dir).filter((f) => f.endsWith('.json') && !NOT_RECORDINGS.includes(f)).map((file) => {
    const r = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    return { file, source: r.source, model: r.model, date: r.date, ...(r.ticketSet && r.ticketSet !== 'standard' ? { ticketSet: r.ticketSet } : {}), ...(Array.isArray(r.runs) ? { runs: r.runs.length } : {}), ...(r.start && r.start.shared ? { shared: true } : {}), label: runLabel(r) };
  });
  // Same date: in the order models are listed in PRICES (Opus, Sonnet, Haiku),
  // standard before stress, single runs before run sets, independent before shared.
  const rank = (m) => { const i = Object.keys(PRICES).indexOf(m); return i < 0 ? 99 : i; };
  const key = (r) => [r.ticketSet ? 1 : 0, rank(r.model), r.runs ? 1 : 0, r.shared ? 1 : 0];
  const cmp = (a, b) => { const x = key(a); const y = key(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return a.file.localeCompare(b.file); };
  runs.sort((a, b) => (a.source === b.source ? (b.date || '').localeCompare(a.date || '') || cmp(a, b) : a.source === 'recorded' ? -1 : 1));
  writeFileSync(join(dir, 'index.json'), `${JSON.stringify({ runs }, null, 2)}\n`);
  return runs;
}
