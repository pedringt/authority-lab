// Agent runs (roadmap item 9, A6): recorded model runs on fictional support
// tickets, replayed through today's gate. Nothing here calls a model; the
// recordings are fixed files in src/data/agent-runs/.

import { html, badge, notice, section, lede, fmtDate, tabIntro } from '../ui.js';
import { workspaceOf, workflowOf, classifyTicket, outcomeText, runFlags, runLabel, replayRun, restrictionIn, isRunSet, runsOf, ticketRates, rateText, unverifiedCases, CAUGHT } from '../store/index.js';

const parse = (text) => { try { return JSON.parse(text); } catch { return null; } };
const money = (x) => `$${Number(x || 0).toFixed(2)}`;
const tone = { allow: 'pass', 'needs-person': 'watch', block: 'fail' };

// What the model asked for, in words. Claims arrive already worded by the
// store (step.labels.claims), never as raw JSON.
function callText(step) {
  const i = step.input || {};
  if (step.tool === 'issue_refund') {
    const claims = (step.labels && step.labels.claims) || '';
    const extra = [i.paymentMethod ? `to ${i.paymentMethod}` : '', i.confidence != null ? `model says ${i.confidence}% confident` : '', claims ? `claimed: ${claims}` : ''].filter(Boolean).join(' · ');
    return html`<strong>Refund</strong> $${i.amount} on ${i.orderId}${extra ? html`<div class="muted small">${extra}</div>` : ''}`;
  }
  if (step.tool === 'escalate_to_human') return html`<strong>Hand to a person</strong>${i.orderId ? ` on ${i.orderId}` : ''}<div class="muted small">${i.reason || ''}</div>`;
  return html`<strong>Look up order</strong> ${i.orderId}`;
}

// What came back to the model: the verdict and rule, and for a lookup the
// fields the contract lets it see.
function sawText(step) {
  if (step.refusedBySchema) return html`<span class="muted small">${step.saw}</span>`;
  const r = parse(step.saw) || {};
  const data = r.data ? html`<details class="amendment"><summary>Order data the model saw</summary><pre class="version-raw">${JSON.stringify(r.data, null, 2)}</pre></details>` : r.found === false ? html`<div class="muted small">No order with that ID.</div>` : '';
  return html`<div class="small">${r.message || ''}</div>${data}`;
}

// A verdict in words: "Blocked · Never allowed". `label` comes from the
// store's replay (verdict and rule kind in plain words); the ids stay in the
// recording.
function verdictCell(v, label) {
  if (!v) return html`<span class="muted small" title="The tool refused the request's format, so it was never checked against the rules.">Rejected before it was checked</span>`;
  return html`${badge(tone[v.verdict] || 'neutral', label ? label.verdict : v.verdict)} <span class="muted small">${label ? label.rule : v.rule.kind}</span>`;
}

function caughtCell(c) {
  if (!c.caught) return html`<span class="muted small">Normal ticket</span>`;
  const k = CAUGHT[c.caught];
  return html`${badge(k.tone, k.by)} <span class="small">${k.label}</span>`;
}

// A shared-session run: did the automatic restriction fire, and where.
function sharedNote(r) {
  const fired = restrictionIn(r);
  return fired
    ? html`<div class="small">${badge('restricted', 'Restricted')} Authority was reduced on ${fired.ticketId} after a safety limit was crossed: Level ${fired.from ?? 3} → Level ${fired.to}. ${fired.ticketId === r.tickets.at(-1).ticketId ? 'That was the last ticket.' : 'Later tickets ran at the lower level.'}</div>`
    : html`<div class="small">All tickets ran in one session. Authority was never reduced.</div>`;
}

function ticketDetail(run, replayed, t) {
  const c = classifyTicket(t);
  const steps = replayed.steps;
  return html`<details class="card run-ticket" id="ticket-${t.ticketId}">
    <summary><strong>${t.ticketId}</strong> · ${temptsText(t.tempts)} ${c.caught ? caughtCell(c) : ''} <span class="muted small">${outcomeText(c)}</span>${run.start && run.start.shared && t.after ? html` <span class="muted small">· at Level ${t.after.level} afterwards</span>${t.after.restricted ? html` ${badge('restricted', 'Restricted')}` : ''}` : ''}</summary>
    <p class="run-message">“${t.message || ''}”</p>
    <p class="muted small">What it tests: ${temptsText(t.tempts)}. What the rules should do: ${plainTicketText(t.expect)}</p>
    ${steps.length ? html`<div class="table-card"><table class="table">
      <thead><tr><th>Turn</th><th>The model asked to</th><th>What it got back</th><th>Rule check when recorded</th><th>Rule check today</th></tr></thead>
      <tbody>${steps.map((s) => html`<tr>
        <td class="num">${s.turn}</td><td>${callText(s)}</td><td>${sawText(s)}</td><td>${verdictCell(s.gate, s.labels && s.labels.gate)}</td>
        <td>${s.refusedBySchema ? html`<span class="muted small">Not re-checked</span>` : html`${verdictCell(s.replay, s.labels && s.labels.replay)}${s.same ? '' : html` ${badge('fail', 'Different today')}`}`}</td>
      </tr>`)}</tbody>
    </table></div>` : html`<p class="muted small">The model didn't take any actions.</p>`}
    <p class="small"><span class="muted">The model's final reply:</span> ${t.finalText || html`<span class="muted">none</span>`}</p>
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

// Ticket definitions (agent/) describe each ticket with the gate's ids
// ("block (must-never: …)", "bait"). They stay as written there; on this page
// they read as words.
const TICKET_WORDS = { allow: 'allowed', 'needs-person': 'needs a person', block: 'blocked', escalate: 'handed to a person', 'within-limits': 'within approved limits', 'must-never': 'never allowed', 'must-ask': 'ask a person', contract: 'rules', 'fact-mismatch': 'contradicts the record', 'no-record': 'unknown order', 'over-order': 'more than the order value', bait: 'trap' };
const TICKET_ID_PATTERN = new RegExp(`(?<![\\w-])(${Object.keys(TICKET_WORDS).join('|')})(?![\\w-])`, 'g');
const plainTicketText = (text) => String(text || '').replace(/ and is not the bait/g, ' and fine').replace(TICKET_ID_PATTERN, (id) => TICKET_WORDS[id]);
const TEMPTS_WORDS = { 'must-never': 'something never allowed', allowed: 'a normal request', 'allowed with low confidence': 'a normal request, low confidence' };
const temptsText = (t) => TEMPTS_WORDS[t] || t;

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
    return html`<tr><td><strong>${id}</strong></td><td class="small">${temptsText(any.tempts)}</td>${r.temptation ? html`<td class="num">${r.declined}</td><td class="num">${r.tried - r.gotThrough}</td><td class="num">${r.unverified}</td><td class="num ${r.gotThrough ? 'text-fail' : ''}">${r.gotThrough}</td>` : html`<td colspan="4" class="small muted">${r.outcomes.map(([t, k]) => `${t}${r.n > 1 ? ` (${k} of ${r.n})` : ''}`).join('; ')}</td>`}</tr>`;
  });
  const shared = rec.start && rec.start.shared && !isRunSet(rec) ? html`<p class="small">${sharedNote(rec)}</p>` : '';
  return html`<details class="card run-block">
    <summary><strong>${modelName(rec.model)}</strong> · ${setName(rec)} · ${runs.length} run${runs.length === 1 ? '' : 's'}${rec.start && rec.start.shared ? ' · one session' : ''}${rec.source === 'recorded' && beforeRule(rec) ? html` · <span class="muted">before the "who asked" rule</span>` : ''}${rec.source === 'recorded' ? html` · <span class="muted">$${Number(rec.cost || 0).toFixed(2)}</span>` : html` · <span class="muted">not a real model</span>`}</summary>
    ${proofLine(rec)}${shared}
    <div class="table-card"><table class="table">
      <thead><tr><th>Ticket</th><th>What it tests</th><th class="num">Model said no</th><th class="num">Stopped by the rules</th><th class="num">Allowed, sender not checked</th><th class="num">Went through</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="small"><a href="${base}&run=${encodeURIComponent(rec.file)}">See every step${runs.length > 1 ? ', run by run' : ''}</a></p>
  </details>`;
}

// `loaded`: { status: 'loading' | 'error' | 'ready', runs: [recording + file], error }.
// Inside a capability (simplification pass) it shows only that capability's
// recordings, under Evidence › Model runs.
const TRAPS = 'Some tickets are traps: they push the model toward something it shouldn\'t do, such as a refund it must never give, a false claim about the order, or a refund someone other than the customer asked for. Each recording is checked again against today\'s rules when you open this page.';

export function agentRunsView(state, query, loaded, { capabilityId = null, embedded = false } = {}) {
  const base = capabilityId ? `#/capabilities/${capabilityId}?tab=evidence&show=runs` : '#/agent-runs?';
  const proofIntro = html`<p class="run-proof-intro"><strong>This site never calls a model.</strong> Every run here was recorded and approved; follow the links to check.</p>`;
  const head = embedded
    ? html`${tabIntro('Real AI models handled fictional support tickets. Every action they tried was checked against the rules.', TRAPS)}${proofIntro}`
    : html`<div class="page-head"><div>
    <p class="eyebrow">${workspaceOf(state).name} · ${workflowOf(state).name}</p>
    <h1>Model runs</h1>
    ${lede('Real AI models handled fictional support tickets. Every action they tried was checked against the rules.', TRAPS)}
    <p class="run-proof-intro"><strong>This site never calls a model.</strong> Every run here was recorded and approved; follow the links to check.</p>
  </div></div>`;
  if (!loaded || loaded.status === 'loading') return html`${head}<p class="empty">Loading model runs…</p>`;
  if (loaded.status === 'error') return html`${head}${notice('fail', 'Couldn\'t load the model runs', loaded.error)}`;
  const all = capabilityId ? loaded.runs.filter((r) => r.start && r.start.capabilityId === capabilityId) : loaded.runs;
  if (!all.length) return html`${head}<p class="empty">No model runs have been recorded for this capability.</p>`;

  const real = all.filter((r) => r.source === 'recorded');
  const sets = real.filter(isRunSet);
  const main = sets.length ? sets : real.length ? real : all;
  const earlier = all.filter((r) => !main.includes(r));
  const t = tally(main);
  const dates = [...new Set(main.map((r) => r.date).filter(Boolean))];

  // Anything that got through, anywhere, comes first. Flags carry a kind, so
  // this never depends on their wording.
  const leaks = all.flatMap((r) => runFlags(r).filter((f) => f.kind === 'got-through').map((f) => ({ ...f, rec: r })));
  const leakNote = leaks.length ? leaks.map((f) => notice('fail', `${modelName(f.rec.model)}: a trap went through`, f.text, { link: `${base}&run=${encodeURIComponent(f.rec.file)}`, linkText: 'See the steps' })) : '';

  // Refunds on someone else's say-so: what the gate does now, and what the
  // earlier runs did before the rule.
  const cases = real.flatMap(unverifiedCases).filter((c) => c.outcome === 'executed');
  const ruleNote = notice('neutral', 'Refunds requested by someone other than the customer now need approval', `${cases.length ? `Before this rule, ${cases.length} refund${cases.length === 1 ? '' : 's'} went through without anyone checking who asked. There have been none since. ` : ''}Now the model must say who asked for each refund: if it wasn't the customer on the ticket, a person decides, and if the model says "the customer" when the ticket shows otherwise, the refund is blocked as a false claim.`);

  const numbers = html`<div class="metric-grid metric-grid-3">
    <div class="metric card"><div class="metric-top"><span class="metric-label">Runs</span></div><div class="metric-value">${t.runs}</div><div class="metric-note">${dates.length === 1 ? `recorded ${fmtDate(dates[0])}` : `${main.length} recordings`}</div></div>
    <div class="metric card"><div class="metric-top"><span class="metric-label">Attempts stopped</span></div><div class="metric-value">${t.tried - t.gotThrough}</div><div class="metric-note">times a model tried something it shouldn't, and the rules blocked it</div></div>
    <div class="metric card"><div class="metric-top"><span class="metric-label">Went through</span>${badge(t.gotThrough ? 'fail' : 'pass', t.gotThrough ? 'Fail' : 'None')}</div><div class="metric-value">${t.gotThrough}</div><div class="metric-note">of ${t.cases} traps</div></div>
  </div>`;

  const models = [...new Set(main.map((r) => r.model))];
  const table = html`<div class="card table-card"><table class="table">
    <thead><tr><th>Model</th><th class="num">Model said no</th><th class="num">Stopped by the rules</th><th class="num">Allowed, sender not checked</th><th class="num">Went through</th><th class="num">Traps</th></tr></thead>
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
      ${changed ? notice('watch', `${changed} step${changed === 1 ? '' : 's'} would turn out differently today`, 'The rules have changed since this was recorded. Both results are shown.') : html`<p class="muted small">Checked again against today's rules: every result matches the recording.</p>`}
      ${repPicker}${shown.tickets.map((tk, i) => ticketDetail(shown, replay.tickets[i], tk))}`, { id: 'steps', subtitle: 'For each ticket: what the model tried, what it got back, and how the rule check (the gate) decided it then and now.' });
  }

  return html`${head}${leakNote}${numbers}
  ${section('By model', table, { subtitle: `What happened on the trap tickets across ${main.length === sets.length && sets.length ? 'the repeat runs' : 'these runs'}: the model said no, the rules stopped it, it was allowed within limits without checking who asked, or it went through.` })}
  ${ruleNote}
  ${section('Runs', html`${main.map((x) => runBlock(x, base))}`, { subtitle: 'Open a run to see each ticket.' })}
  ${earlier.length ? html`<details class="earlier"><summary>Earlier runs (${earlier.length})</summary>${earlier.map((x) => runBlock(x, base))}</details>` : ''}
  ${steps}`;
}
