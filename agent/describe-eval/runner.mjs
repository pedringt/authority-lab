// The 6B description-reading eval runner (Paige, 2026-10-22). It reads each
// reviewed case with a model, checks the reply (decisions 3 and 6), scores
// it with the same scorer as the 6A rules, and applies the gate (decision
// 10). Three runs per model by default. A model is any object with
// respond(request) -> { text, stop_reason, usage }: the live adapter in
// run.mjs, or the mock here, which needs no network.

import { readFileSync } from 'node:fs';
import { readDescription, CONTEXT_FIELDS } from '../../src/store/index.js';
import { PRICES, costOf } from '../runs.mjs';
import { PROMPT_VERSION, SYSTEM, OUTPUT_SCHEMA, MAX_TOKENS, EFFORT, buildRequest, checkReply } from './prompt.mjs';
import { scoreCase, summarise, gate, CONSEQUENTIAL } from './score.mjs';

export const RESULT_FORMAT = 'authority-lab-describe-eval/1';
export const DEFAULT_REPEAT = 3;
const ALLOWED = CONTEXT_FIELDS.map((f) => f.key);

// Only reviewed cases count (decision 10).
export function loadCases(file = new URL('./cases.json', import.meta.url)) {
  return JSON.parse(readFileSync(file, 'utf8')).cases.filter((c) => c.label === 'reviewed');
}

// The 6A rules on the same cases: the baseline every gate compares against.
export const baselineScores = (cases) => cases.map((c) => scoreCase(c, readDescription(c.text), { allowedFields: ALLOWED }));

// Tokens for one request. Expected: about four characters a token, and a
// typical reply (some thinking at medium effort, then the JSON). Worst: two
// characters a token (as the budget guard assumes) and max_tokens out.
export const TYPICAL_OUTPUT = 900;
function requestChars(text) { return SYSTEM.length + JSON.stringify(OUTPUT_SCHEMA).length + text.length + 40; }

export function estimateEval({ cases, models, repeat = DEFAULT_REPEAT }) {
  const rows = models.map((model) => {
    const p = PRICES[model];
    if (!p) throw new Error(`No price for "${model}".`);
    let inExp = 0; let inWorst = 0;
    for (const c of cases) { inExp += Math.ceil(requestChars(c.text) / 4); inWorst += Math.ceil(requestChars(c.text) / 2); }
    const calls = cases.length * repeat;
    const tokens = { expected: { input: inExp * repeat, output: TYPICAL_OUTPUT * calls }, worst: { input: inWorst * repeat, output: MAX_TOKENS * calls } };
    const dollars = (t) => (t.input * p.input + t.output * p.output) / 1e6;
    return { model, calls, tokens, dollars: { expected: dollars(tokens.expected), worst: dollars(tokens.worst) } };
  });
  const sum = (k) => rows.reduce((n, r) => n + r.dollars[k], 0);
  return { cases: cases.length, repeat, promptVersion: PROMPT_VERSION, effort: EFFORT, maxTokens: MAX_TOKENS, rows, calls: rows.reduce((n, r) => n + r.calls, 0), dollars: { expected: sum('expected'), worst: sum('worst') } };
}

// One reading: call, parse, check, score.
async function readOne({ c, model, modelId, budget }) {
  const request = buildRequest(c.text);
  if (budget) budget.before(modelId, { system: request.system, tools: [], messages: request.messages, maxTokens: request.maxTokens });
  const t0 = Date.now();
  const reply = await model.respond(request);
  const latencyMs = Date.now() - t0;
  let raw = null; let parseError = null;
  if (reply.stop_reason !== 'end_turn') parseError = `stopped: ${reply.stop_reason}`;
  else { try { raw = JSON.parse(reply.text); } catch (err) { parseError = `not JSON: ${err.message}`; } }
  // A reply that can't be used is scored as saying nothing: the 6A fallback
  // covers it in the product, and here it counts as missed, never as right.
  const { reading, dropped } = raw ? checkReply(c.text, raw) : { reading: { proposals: [], questions: [] }, dropped: [] };
  return { id: c.id, stop_reason: reply.stop_reason, usage: reply.usage || {}, cost: costOf(modelId, reply.usage || {}), latencyMs, parseError, raw, reading, dropped, score: scoreCase(c, reading, { allowedFields: ALLOWED }) };
}

const pct = (xs, q) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

// What one run of one model says, with the gate.
export function runReport(readings, baseline) {
  const scores = readings.map((r) => r.score);
  const t = summarise(scores);
  const consequentialRight = scores.reduce((n, s) => n + CONSEQUENTIAL.filter((f) => s.fields[f] && s.fields[f].result === 'correct').length, 0);
  const lat = readings.map((r) => r.latencyMs);
  const cost = readings.reduce((n, r) => n + r.cost, 0);
  return {
    totals: t,
    consequentialRight,
    unusable: readings.filter((r) => r.parseError).map((r) => `${r.id}: ${r.parseError}`),
    dropped: readings.reduce((n, r) => n + r.dropped.length, 0),
    droppedQuotes: readings.reduce((n, r) => n + r.dropped.filter((d) => d.why === 'quote not in the description').length, 0),
    cost,
    costPerReading: readings.length ? cost / readings.length : 0,
    latencyMs: { p50: pct(lat, 0.5), p95: pct(lat, 0.95) },
    gate: gate(scores, baseline),
  };
}

// Every run of one model. Each finished run is handed to onRun at once, so a
// stop partway keeps what was done.
export async function evalModel({ cases, model, modelId, repeat = DEFAULT_REPEAT, budget = null, date, onRun = null, onCase = null }) {
  const baseline = baselineScores(cases);
  const result = { format: RESULT_FORMAT, promptVersion: PROMPT_VERSION, effort: EFFORT, maxTokens: MAX_TOKENS, model: modelId, date, repeat, cases: cases.length, runs: [], stoppedEarly: null };
  for (let k = 1; k <= repeat; k++) {
    const readings = [];
    try {
      for (const c of cases) {
        const r = await readOne({ c, model, modelId, budget });
        readings.push(r);
        if (onCase) onCase(k, readings.length);
        // After the reading is kept, so a call that reaches the cap is still recorded.
        if (budget) budget.after(modelId, r.usage);
      }
    } catch (err) {
      result.stoppedEarly = { run: k, after: readings.length, reason: err.code === 'budget' ? 'cap' : 'error', text: err.message };
      if (readings.length) result.runs.push({ run: k, partial: true, readings, report: runReport(readings, baseline.filter((b) => readings.some((r) => r.id === b.id))) });
      if (onRun) onRun(result);
      break;
    }
    result.runs.push({ run: k, readings, report: runReport(readings, baseline) });
    if (onRun) onRun(result);
  }
  result.cost = result.runs.reduce((n, r) => n + r.report.cost, 0);
  // The gate holds only if every complete run passes it (decision 10).
  const complete = result.runs.filter((r) => !r.partial);
  result.passed = complete.length === repeat && complete.every((r) => r.report.gate.passed);
  return result;
}

// The 6A rules as a model, in the model's own output shape: used for the dry
// run and the tests, so the whole pipeline runs with no network. Its usage is
// zero, so it costs nothing.
export function mockModel() {
  return {
    async respond(request) {
      const text = request.messages[0].content.replace(/^Description:\n"""\n/, '').replace(/\n"""$/, '');
      const r = readDescription(text);
      const proposals = [];
      for (const p of r.proposals) {
        if (p.key === 'aiActions') for (const part of p.parts || p.value.map((v) => ({ value: v, certainty: p.certainty, quote: p.quote }))) proposals.push({ key: 'aiActions', values: [part.value], certainty: part.certainty, quote: part.quote, basis: p.basis || '', rationale: '' });
        else proposals.push({ key: p.key, values: Array.isArray(p.value) ? p.value : [p.value], certainty: p.certainty, quote: String(p.quote).split(', ')[0], basis: p.basis || '', rationale: '' });
      }
      const questions = r.questions.map((q) => ({ field: q.field, about: q.kind === 'actor' ? 'Acts' : '', question: q.question, quote: q.quote }));
      return { text: JSON.stringify({ proposals, questions }), stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 } };
    },
  };
}

// The results as Markdown, for the run summary and the PR.
export function resultsText(results, { cap = null } = {}) {
  const lines = ['## 6B description-reading eval', '', `Prompt ${results[0] ? results[0].promptVersion : ''}, effort ${EFFORT}, max_tokens ${MAX_TOKENS}. Reviewed cases: ${results[0] ? results[0].cases : 0}.${cap != null ? ` Cap: $${cap.toFixed(2)}.` : ''}`, ''];
  lines.push('| Model | Run | Gate | Wrong at Clear | Wrong at Likely | Consequential right | Missed asks | Dropped (quotes) | Unusable | Cost | Per reading | p50 / p95 |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const res of results) {
    for (const r of res.runs) {
      const rep = r.report;
      lines.push(`| ${res.model} | ${r.run}${r.partial ? ' (partial)' : ''} | ${rep.gate.passed ? 'pass' : 'fail'} | ${rep.totals.falseConfidence.Clear} | ${rep.totals.falseConfidence.Likely} | ${rep.consequentialRight} | ${rep.totals.results['missed-ask'] || 0} | ${rep.dropped} (${rep.droppedQuotes}) | ${rep.unusable.length} | $${rep.cost.toFixed(4)} | $${rep.costPerReading.toFixed(4)} | ${rep.latencyMs.p50 ?? '-'} / ${rep.latencyMs.p95 ?? '-'} ms |`);
    }
  }
  lines.push('');
  for (const res of results) {
    lines.push(`**${res.model}: ${res.passed ? 'passes the gate in every run' : 'does not pass'}**${res.stoppedEarly ? ` (stopped in run ${res.stoppedEarly.run}: ${res.stoppedEarly.text})` : ''}.`);
    const failing = [...new Set(res.runs.flatMap((r) => r.report.gate.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.failures.slice(0, 6).join(', ')}${c.failures.length > 6 ? '…' : ''}`)))];
    for (const f of failing) lines.push(`- ${f}`);
    lines.push('');
  }
  return lines.join('\n');
}
