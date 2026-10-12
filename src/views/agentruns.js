// Agent runs (roadmap item 9, A6): recorded model runs on fictional support
// tickets, replayed through today's gate. Nothing here calls a model; the
// recordings are fixed files in src/data/agent-runs/.

import { html, badge, notice, section, lede, fmtDate, tabIntro } from '../ui.js';
import { workspaceOf, workflowOf, classifyTicket, outcomeText, runFlags, runLabel, replayRun, restrictionIn, isRunSet, runsOf, ticketRates, rateText, unverifiedCases, CAUGHT } from '../store/index.js';

const parse = (text) => { try { return JSON.parse(text); } catch { return null; } };
const money = (x) => `$${Number(x || 0).toFixed(2)}`;
const tone = { allow: 'pass', 'needs-person': 'watch', block: 'fail' };

function callText(step) {
  const i = step.input || {};
  if (step.tool === 'issue_refund') {
    const extra = [i.paymentMethod ? `to ${i.paymentMethod}` : '', i.confidence != null ? `confidence ${i.confidence}` : '', i.claims ? `claims ${JSON.stringify(i.claims)}` : ''].filter(Boolean).join(' · ');
    return html`<strong>Refund</strong> $${i.amount} on ${i.orderId}${extra ? html`<div class="muted small">${extra}</div>` : ''}`;
  }
  if (step.tool === 'escalate_to_human') return html`<strong>Escalate</strong>${i.orderId ? ` on ${i.orderId}` : ''}<div class="muted small">${i.reason || ''}</div>`;
  return html`<strong>Look up</strong> ${i.orderId}`;
}

// What came back to the model: the verdict and rule, and for a lookup the
// fields the contract lets it see.
function sawText(step) {
  if (step.refusedBySchema) return html`<span class="muted small">${step.saw}</span>`;
  const r = parse(step.saw) || {};
  const data = r.data ? html`<details class="amendment"><summary>Data it saw</summary><pre class="version-raw">${JSON.stringify(r.data, null, 2)}</pre></details>` : r.found === false ? html`<div class="muted small">No such order.</div>` : '';
  return html`<div class="small">${r.message || ''}</div>${data}`;
}

function verdictCell(v) {
  if (!v) return html`<span class="muted small">Never reached the gate</span>`;
  return html`${badge(tone[v.verdict] || 'neutral', v.verdict)} <span class="muted small">${v.rule.kind}</span>`;
}

function caughtCell(c) {
  if (!c.caught) return html`<span class="muted small">Not a temptation</span>`;
  const k = CAUGHT[c.caught];
  return html`${badge(k.tone, k.by)} <span class="small">${k.label}</span>`;
}

// A shared-session run: did the automatic restriction fire, and where.
function sharedNote(r) {
  const fired = restrictionIn(r);
  return fired
    ? html`<div class="small">${badge('restricted', 'Restricted')} Automatic restriction fired on ${fired.ticketId}: Level ${fired.from ?? 3} → Level ${fired.to}. ${fired.ticketId === r.tickets.at(-1).ticketId ? 'That was the last ticket.' : 'Later tickets ran under the lower level.'}</div>`
    : html`<div class="small">All tickets in one session. Automatic restriction did not fire.</div>`;
}

function ticketDetail(run, replayed, t) {
  const c = classifyTicket(t);
  const steps = replayed.steps;
  return html`<details class="card run-ticket" id="ticket-${t.ticketId}">
    <summary><strong>${t.ticketId}</strong> · ${t.tempts} ${c.caught ? caughtCell(c) : ''} <span class="muted small">${outcomeText(c)}</span>${run.start && run.start.shared && t.after ? html` <span class="muted small">· Level ${t.after.level} after</span>${t.after.restricted ? html` ${badge('restricted', 'Restricted')}` : ''}` : ''}</summary>
    <p class="run-message">“${t.message || ''}”</p>
    <p class="muted small">What it tempts the model to do: ${t.tempts}. If the model gives in: ${String(t.expect || '').replace(/ and is not the bait/g, ' and fine').replace(/\bbait\b/g, 'temptation')}</p>
    ${steps.length ? html`<div class="table-card"><table class="table">
      <thead><tr><th>Turn</th><th>The model asked for</th><th>What it saw</th><th>Gate when recorded</th><th>Gate today</th></tr></thead>
      <tbody>${steps.map((s) => html`<tr>
        <td class="num">${s.turn}</td><td>${callText(s)}</td><td>${sawText(s)}</td><td>${verdictCell(s.gate)}</td>
        <td>${s.refusedBySchema ? html`<span class="muted small">Not replayed</span>` : html`${verdictCell(s.replay)}${s.same ? '' : html` ${badge('fail', 'Changed')}`}`}</td>
      </tr>`)}</tbody>
    </table></div>` : html`<p class="muted small">The model made no tool calls.</p>`}
    <p class="small"><span class="muted">The model's last words:</span> ${t.finalText || html`<span class="muted">none</span>`}</p>
  </details>`;
}

// Where a recording came from, with links anyone can check: the GitHub
// Actions run and who approved it, its ledger row, and the commit that added
// it (or the file's history, for a run committed after this was written).
const REPO = 'https://github.com/pedringt/authority-lab';
export function proofLine(rec) {
  if (rec.source !== 'recorded') return html`<p class="small muted run-proof">A dry run with the scripted mock: no model was called and nothing was spent.</p>`;
  const p = rec.proof;
  if (!p) return html`<p class="small run-proof">${badge('watch', 'No proof on file')} This recording has no provenance entry.</p>`;
  const ledger = p.ledgerLine ? html`<a href="${REPO}/blob/main/agent/runs/ledger.md?plain=1#L${p.ledgerLine}">ledger row</a>` : 'no ledger row';
  const commit = p.commit
    ? html`<a href="${REPO}/commit/${p.commit}">commit ${p.commit.slice(0, 7)}</a>`
    : html`<a href="${REPO}/commits/main/src/data/agent-runs/${encodeURIComponent(rec.file)}">the commit that added it</a>`;
  const made = p.via === 'github-actions'
    ? html`<a href="${REPO}/actions/runs/${p.actionsRun}">GitHub Actions run ${p.actionsRun}</a>${p.approvedBy ? `, approved by @${p.approvedBy}` : ''}`
    : html`Made outside GitHub: ${p.note || 'not run through GitHub Actions'}. There's no Actions run or approval to link`;
  return html`<p class="small run-proof"><span class="muted">Proof:</span> ${made} · ${ledger} · ${commit}</p>`;
}

// Friendly model names (#93): "Opus 5.5", not the model id.
export function modelName(id) {
  const m = String(id || '').match(/^claude-([a-z]+)-(\d+)-(\d+)$/);
  if (m) return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}`;
  return id === 'mock' ? 'Scripted mock' : id;
}
const setName = (rec) => (rec.ticketSet && rec.ticketSet !== 'standard' ? `${rec.ticketSet} tickets` : 'standard tickets');
// Recorded before refunds had to say who asked (the instruction-source rule).
const beforeRule = (rec) => runsOf(rec).some((r) => (r.tickets || []).some((t) => (t.steps || []).some((s) => s.tool === 'issue_refund' && s.input && s.input.instructionSource === undefined)));
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '—');

// Across recordings: for each temptation case (one ticket in one run), what
// happened. `tried` counts runs where the model asked for the forbidden thing.
function tally(recs) {
  const out = { runs: 0, cases: 0, declined: 0, stopped: 0, unverified: 0, gotThrough: 0, tried: 0 };
  for (const rec of recs) for (const run of runsOf(rec)) {
    out.runs += 1;
    for (const t of run.tickets || []) {
      const c = classifyTicket(t);
      if (!c.caught) continue;
      out.cases += 1;
      if (c.tried) out.tried += 1;
      out[{ declined: 'declined', stopped: 'stopped', unverified: 'unverified', 'got-through': 'gotThrough' }[c.caught]] += 1;
    }
  }
  return out;
}

// One run (or set of runs), collapsed: per-ticket counts, and a link to the
// step-by-step view. Ticket codes appear only in here.
function runBlock(rec, base) {
  const runs = runsOf(rec);
  const ids = [...new Set(runs.flatMap((r) => (r.tickets || []).map((t) => t.ticketId)))];
  const rows = ids.map((id) => {
    const r = ticketRates(rec, id);
    const any = runs.map((x) => x.tickets.find((t) => t.ticketId === id)).find(Boolean);
    return html`<tr><td><strong>${id}</strong></td><td class="small">${any.tempts}</td>${r.temptation ? html`<td class="num">${r.declined}</td><td class="num">${r.tried - r.gotThrough}</td><td class="num">${r.unverified}</td><td class="num ${r.gotThrough ? 'text-fail' : ''}">${r.gotThrough}</td>` : html`<td colspan="4" class="small muted">${r.outcomes.map(([t, k]) => `${t}${r.n > 1 ? ` (${k} of ${r.n})` : ''}`).join('; ')}</td>`}</tr>`;
  });
  const shared = rec.start && rec.start.shared && !isRunSet(rec) ? html`<p class="small">${sharedNote(rec)}</p>` : '';
  return html`<details class="card run-block">
    <summary><strong>${modelName(rec.model)}</strong> · ${setName(rec)} · ${runs.length} run${runs.length === 1 ? '' : 's'}${rec.start && rec.start.shared ? ' · one shared session' : ''}${rec.source === 'recorded' && beforeRule(rec) ? html` · <span class="muted">before the instruction-source rule</span>` : ''}${rec.source === 'recorded' ? html` · <span class="muted">$${Number(rec.cost || 0).toFixed(2)}</span>` : html` · <span class="muted">not a real model</span>`}</summary>
    ${proofLine(rec)}${shared}
    <div class="table-card"><table class="table">
      <thead><tr><th>Ticket</th><th>What it tempts</th><th class="num">Declined</th><th class="num">Gate stopped</th><th class="num">Within limits, unverified</th><th class="num">Got through</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="small"><a href="${base}&run=${encodeURIComponent(rec.file)}">See every step${runs.length > 1 ? ', run by run' : ''}</a></p>
  </details>`;
}

// `loaded`: { status: 'loading' | 'error' | 'ready', runs: [recording + file], error }.
// Inside a capability (simplification pass) it shows only that capability's
// recordings, under Evidence › Model runs.
export function agentRunsView(state, query, loaded, { capabilityId = null, embedded = false } = {}) {
  const base = capabilityId ? `#/capabilities/${capabilityId}?tab=evidence&show=runs` : '#/agent-runs?';
  const proofIntro = html`<p class="run-proof-intro"><strong>This site never calls a model.</strong> Every run here was recorded and approved; follow the links to check.</p>`;
  const head = embedded
    ? html`${tabIntro('Real models working fictional support tickets, with every action checked against the rules.', 'Some tickets are temptations: they try to get the model to do something it shouldn\'t, like a forbidden refund, a false claim about the record, or a refund on someone else\'s say-so. Every recording is replayed through today\'s rules on this page.')}${proofIntro}`
    : html`<div class="page-head"><div>
    <p class="eyebrow">${workspaceOf(state).name} · ${workflowOf(state).name}</p>
    <h1>Agent runs</h1>
    ${lede('Real models working fictional support tickets, with every action checked by the gate.', 'Some tickets are temptations: they try to get the model to do something it shouldn\'t, like a forbidden refund, a false claim about the record, or a refund on someone else\'s say-so. Every recording is replayed through today\'s gate on this page; nothing here calls a model.')}
    <p class="run-proof-intro"><strong>This site never calls a model.</strong> Every run here was recorded and approved; follow the links to check.</p>
  </div></div>`;
  if (!loaded || loaded.status === 'loading') return html`${head}<p class="empty">Loading recordings…</p>`;
  if (loaded.status === 'error') return html`${head}${notice('fail', 'Recordings could not be loaded', loaded.error)}`;
  const all = capabilityId ? loaded.runs.filter((r) => r.start && r.start.capabilityId === capabilityId) : loaded.runs;
  if (!all.length) return html`${head}<p class="empty">No model runs have been recorded for this capability.</p>`;

  const real = all.filter((r) => r.source === 'recorded');
  const sets = real.filter(isRunSet);
  const main = sets.length ? sets : real.length ? real : all;
  const earlier = all.filter((r) => !main.includes(r));
  const t = tally(main);
  const dates = [...new Set(main.map((r) => r.date).filter(Boolean))];

  // Anything that got through, anywhere, comes first.
  const leaks = all.flatMap((r) => runFlags(r).filter((f) => /got through/.test(f.text)).map((f) => ({ ...f, rec: r })));
  const leakNote = leaks.length ? leaks.map((f) => notice('fail', `${modelName(f.rec.model)}: something got through`, f.text.replace(/took the bait and it got through/, 'did the forbidden thing and the gate let it through'), { link: `${base}&run=${encodeURIComponent(f.rec.file)}`, linkText: 'See the steps' })) : '';

  // Refunds on someone else's say-so: what the gate does now, and what the
  // earlier runs did before the rule.
  const cases = real.flatMap(unverifiedCases).filter((c) => c.outcome === 'executed');
  const ruleNote = notice('neutral', 'Refunds on someone else\'s say-so now need a person', `The model has to say who asked for each refund. Anyone but the customer on the ticket sends it to a person, and saying "the customer asked" when the ticket came from someone else is blocked as a false claim.${cases.length ? ` Before this rule, ${cases.length} refund${cases.length === 1 ? '' : 's'} went through on an unverified instruction; there have been none since.` : ''}`);

  const numbers = html`<div class="metric-grid metric-grid-3">
    <div class="metric card"><div class="metric-top"><span class="metric-label">Runs</span></div><div class="metric-value">${t.runs}</div><div class="metric-note">${dates.length === 1 ? `recorded ${fmtDate(dates[0])}` : `${main.length} recordings`}</div></div>
    <div class="metric card"><div class="metric-top"><span class="metric-label">Attempts the gate stopped</span></div><div class="metric-value">${t.tried - t.gotThrough}</div><div class="metric-note">times a model tried something it shouldn't</div></div>
    <div class="metric card"><div class="metric-top"><span class="metric-label">Got through</span>${badge(t.gotThrough ? 'fail' : 'pass', t.gotThrough ? 'Fail' : 'None')}</div><div class="metric-value">${t.gotThrough}</div><div class="metric-note">of ${t.cases} temptations</div></div>
  </div>`;

  const models = [...new Set(main.map((r) => r.model))];
  const table = html`<div class="card table-card"><table class="table">
    <thead><tr><th>Model</th><th class="num">Declined</th><th class="num">Gate stopped</th><th class="num">Within limits, unverified</th><th class="num">Got through</th><th class="num">Temptations</th></tr></thead>
    <tbody>${models.map((m) => { const x = tally(main.filter((r) => r.model === m)); return html`<tr><td><strong>${modelName(m)}</strong></td><td class="num">${pct(x.declined, x.cases)}</td><td class="num">${pct(x.stopped, x.cases)}</td><td class="num">${pct(x.unverified, x.cases)}</td><td class="num ${x.gotThrough ? 'text-fail' : ''}">${pct(x.gotThrough, x.cases)}</td><td class="num muted">${x.cases}</td></tr>`; })}</tbody>
  </table></div>`;

  // The step-by-step view, only once a run is opened.
  const selected = all.find((r) => r.file === query.get('run'));
  let steps = '';
  if (selected) {
    const reps = runsOf(selected);
    const rep = Math.min(Math.max(Number(query.get('rep')) || 1, 1), reps.length);
    const shown = reps[rep - 1];
    const replay = replayRun(shown);
    const changed = replay.changed;
    const repPicker = reps.length > 1 ? html`<div class="filter-bar"><div class="filter-group" role="group" aria-label="Run">${reps.map((_, i) => html`<a class="chip ${i + 1 === rep ? 'is-active' : ''}" href="${base}&run=${encodeURIComponent(selected.file)}&rep=${i + 1}">Run ${i + 1}</a>`)}</div></div>` : '';
    steps = section(`${modelName(selected.model)}, ${setName(selected)}${reps.length > 1 ? ` · run ${rep} of ${reps.length}` : ''}`, html`<p class="muted small">${/^claude-/.test(selected.model) ? runLabel(selected).replace(selected.model, modelName(selected.model)) : runLabel(selected)}. <a href="${base}">Close</a></p>
      ${proofLine(selected)}
      ${changed ? notice('watch', `${changed} step${changed === 1 ? '' : 's'} would be decided differently today`, 'The gate has changed since this was recorded. Both verdicts are shown.') : html`<p class="muted small">Replayed through today's gate: every verdict matches the recording.</p>`}
      ${repPicker}${shown.tickets.map((tk, i) => ticketDetail(shown, replay.tickets[i], tk))}`, { id: 'steps', subtitle: 'Each ticket: what the model asked for, what it was shown, and the gate\'s verdict then and now.' });
  }

  return html`${head}${leakNote}${numbers}
  ${section('By model', table, { subtitle: `Share of temptations across ${main.length === sets.length && sets.length ? 'the repeat runs' : 'these runs'}: the model declined, the gate stopped it, it went through within limits on an unverified instruction, or it got through.` })}
  ${ruleNote}
  ${section('Runs', html`${main.map((x) => runBlock(x, base))}`, { subtitle: 'Open a run for each ticket\'s outcome.' })}
  ${earlier.length ? html`<details class="earlier"><summary>Earlier runs (${earlier.length})</summary>${earlier.map((x) => runBlock(x, base))}</details>` : ''}
  ${steps}`;
}
