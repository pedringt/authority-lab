// Agent runs (roadmap item 9, A6): recorded model runs on fictional support
// tickets, replayed through today's gate. Nothing here calls a model; the
// recordings are fixed files in src/data/agent-runs/.

import { html, badge, notice, section } from '../ui.js';
import { workspaceOf, workflowOf, classifyTicket, outcomeText, runFlags, runLabel, replayRun, CAUGHT } from '../store/index.js';

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

function comparison(runs) {
  const ids = runs[0].tickets.map((t) => t.ticketId);
  for (const r of runs.slice(1)) for (const t of r.tickets) if (!ids.includes(t.ticketId)) ids.push(t.ticketId);
  const byId = (r, id) => r.tickets.find((t) => t.ticketId === id);
  return html`<div class="card table-card"><table class="table">
    <thead><tr><th>Ticket</th><th>Tempts</th>${runs.map((r) => html`<th>${r.model}<div class="muted small">${r.source === 'recorded' ? r.date : 'dry run'}</div></th>`)}</tr></thead>
    <tbody>${ids.map((id) => {
      const first = runs.map((r) => byId(r, id)).find(Boolean);
      return html`<tr><td><strong>${id}</strong></td><td class="small">${first.tempts}</td>${runs.map((r) => {
        const t = byId(r, id);
        if (!t) return html`<td class="muted small">Not run</td>`;
        const c = classifyTicket(t);
        return html`<td>${c.caught ? html`<div>${caughtCell(c)}</div>` : ''}<div class="small">${outcomeText(c)}</div></td>`;
      })}</tr>`;
    })}</tbody>
  </table></div>`;
}

function runCard(r, selected) {
  const cs = r.tickets.map(classifyTicket).filter((c) => c.caught);
  const n = (k) => cs.filter((c) => c.caught === k).length;
  return html`<a class="card card-link run-card ${selected ? 'is-selected' : ''}" href="#/agent-runs?run=${encodeURIComponent(r.file)}">
    <div class="small"><strong>${runLabel(r)}</strong></div>
    <div class="muted small">${r.usage.calls} model calls · ${r.usage.input_tokens.toLocaleString('en-US')} in / ${r.usage.output_tokens.toLocaleString('en-US')} out · ${money(r.cost)}</div>
    <div class="small">Temptations: ${n('declined')} declined by the model · ${n('stopped')} stopped by the gate · <span class="${n('got-through') ? 'text-fail' : ''}">${n('got-through')} got through</span></div>
    ${r.stoppedEarly ? html`<div class="small text-fail">Stopped early: ${r.stoppedEarly.text}</div>` : ''}
  </a>`;
}

function ticketDetail(run, replayed, t) {
  const c = classifyTicket(t);
  const steps = replayed.steps;
  return html`<details class="card run-ticket" id="ticket-${t.ticketId}">
    <summary><strong>${t.ticketId}</strong> · ${t.tempts} ${c.caught ? caughtCell(c) : ''} <span class="muted small">${outcomeText(c)}</span></summary>
    <p class="run-message">“${t.message || ''}”</p>
    <p class="muted small">Designed to tempt: ${t.tempts}. If it takes the bait: ${t.expect}</p>
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

// `loaded`: { status: 'loading' | 'error' | 'ready', runs: [recording + file], error }.
export function agentRunsView(state, query, loaded) {
  const head = html`<div class="page-head"><div>
    <p class="eyebrow">${workspaceOf(state).name} · ${workflowOf(state).name}</p>
    <h1>Agent runs</h1>
    <p class="lede">Model runs on fictional support tickets for Refund recommendation at Level 3, each tool call checked by the gate. Every recording is replayed through today's gate below. Nothing on this page calls a model.</p>
  </div></div>`;
  if (!loaded || loaded.status === 'loading') return html`${head}<p class="empty">Loading recordings…</p>`;
  if (loaded.status === 'error') return html`${head}${notice('fail', 'Recordings could not be loaded', loaded.error)}`;
  const runs = loaded.runs;
  if (!runs.length) return html`${head}<p class="empty">No recordings yet.</p>`;

  const real = runs.filter((r) => r.source === 'recorded');
  const compared = real.length ? real : runs;
  const flags = runs.flatMap((r) => runFlags(r).map((f) => ({ ...f, run: r })));
  const top = flags.length
    ? flags.map((f) => notice('fail', `${f.run.source === 'recorded' ? f.run.model : 'Dry run'}: flagged`, f.text, { link: `#/agent-runs?run=${encodeURIComponent(f.run.file)}`, linkText: 'See the steps' }))
    : notice('pass', 'Nothing got through', real.length ? 'On every temptation ticket, the model declined or the gate stopped it.' : 'No real run is recorded yet; only the dry run.');

  const selected = runs.find((r) => r.file === query.get('run')) || compared[0];
  const replay = replayRun(selected);
  const changed = replay.changed;

  return html`${head}${top}
  ${section('Who caught it', comparison(compared), { subtitle: html`For each temptation ticket: the model declined the bait, the model tried and the gate stopped it, or the model tried and it got through. The last must never happen. ${real.length ? '' : 'Showing the dry run until a real run is recorded.'}` })}
  ${section('Runs', html`<div class="run-cards">${runs.map((r) => runCard(r, r === selected))}</div>`, { subtitle: 'Cost is computed from the usage each reply reported.' })}
  ${section(runLabel(selected), html`${changed ? notice('watch', `${changed} step${changed === 1 ? '' : 's'} would be decided differently today`, 'The gate has changed since this was recorded. Both verdicts are shown.') : html`<p class="muted small">Replayed through today's gate: every verdict matches the recording.</p>`}
    ${selected.tickets.map((t, i) => ticketDetail(selected, replay.tickets[i], t))}`, { id: 'steps', subtitle: 'Each step: what the model asked for, what it was shown, and the gate\'s verdict then and now.' })}`;
}
