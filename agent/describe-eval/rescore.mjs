#!/usr/bin/env node
// Re-score saved readings with another scorer version: no model calls, no cost.
// The saved result files are only read, never changed.
//
//   node agent/describe-eval/rescore.mjs --date 2026-11-08 --set tuned|heldout|heldout-2 [--prompt describe-v2] [--scorer score-v2] [--audit file] [--write]
//
// Prints, for the 6A rules and each saved model, per-field counts, the
// consequential fields right per run and the gate per run, under score-v1 and
// the chosen scorer, and every field whose result differs between them.
// score-v1 is first checked against the saved reports, so a mismatch is caught.
// --audit applies a complete blind question audit (AUDIT.md) to score-v2;
// without one, score-v2 relies on each reader's own `about` and is provisional.
// --write saves the text in results/rescore-<date>[-<set>]-<scorer>[-audited].md.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDescription, CONTEXT_FIELDS } from '../../src/store/index.js';
import { scoreCase, summarise, gate, CONSEQUENTIAL, SCORERS } from './score.mjs';
import { loadCases } from './runner.mjs';
import { loadAudit, resultFiles, SET_FILES } from './audit.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ALLOWED = CONTEXT_FIELDS.map((f) => f.key);
const FIELDS = ['acts', 'sensitive', 'regulated', 'people'];

export function rescore({ cases, results, scorer, audit = null }) {
  const byId = Object.fromEntries(cases.map((c) => [c.id, c]));
  const score = (c, reading, s) => scoreCase(c, reading || { proposals: [], questions: [] }, { allowedFields: ALLOWED, scorer: s, audit: s === 'score-v1' ? null : audit });
  const readers = [{ name: '6A rules', runs: [cases.map((c) => ({ id: c.id, reading: readDescription(c.text) }))] }, ...results.map((r) => ({ name: r.model, runs: r.runs.filter((x) => !x.partial).map((x) => x.readings) }))];
  const base = (s) => cases.map((c) => score(c, readDescription(c.text), s));
  return readers.map((reader) => {
    const per = (s) => reader.runs.map((readings) => readings.map((r) => score(byId[r.id], r.reading, s)));
    const v1 = per('score-v1'); const vN = per(scorer);
    const sum = (runs) => {
      const counts = Object.fromEntries(FIELDS.map((f) => [f, { right: 0, of: 0 }]));
      for (const run of runs) for (const s of run) for (const [f, x] of Object.entries(s.fields)) { counts[f].of += 1; if (x.result === 'correct') counts[f].right += 1; }
      const consequential = runs.map((run) => run.reduce((n, s) => n + CONSEQUENTIAL.filter((f) => s.fields[f] && s.fields[f].result === 'correct').length, 0));
      return { counts, consequential };
    };
    const changes = [];
    v1.forEach((run, i) => run.forEach((s, j) => { for (const f of Object.keys(s.fields)) { const a = s.fields[f].result; const b = vN[i][j].fields[f].result; if (a !== b) changes.push({ run: i + 1, id: s.id, field: f, from: a, to: b }); } }));
    return {
      name: reader.name,
      v1: { ...sum(v1), gate: v1.map((run) => gate(run, base('score-v1')).passed) },
      vN: { ...sum(vN), gate: vN.map((run) => gate(run, base(scorer))), workTypeQuestions: vN.map((run) => summarise(run).workTypeQuestions || 0) },
      changes,
    };
  });
}

export function rescoreText(rows, { scorer, set, date, audited = false }) {
  const c = (x) => FIELDS.map((f) => `${x.counts[f].right}/${x.counts[f].of}`).join(' | ');
  const lines = [`## Re-scored with ${scorer}${audited ? ' and the question audit' : ''} (${set} set, readings of ${date})`, '', `No model calls: the saved readings, judged again. score-v1 is the scorer the published results used.${scorer === 'score-v2' && !audited ? ' Without an audit, score-v2 relies on each reader\'s own `about` tag: provisional.' : ''}`, ''];
  lines.push('| Reader | Scorer | acts | sensitive | regulated | people | Consequential right per run | Gate per run | Work-type questions per run |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    lines.push(`| ${r.name} | score-v1 | ${c(r.v1)} | ${r.v1.consequential.join(', ')} | ${r.v1.gate.map((p) => (p ? 'pass' : 'fail')).join(', ')} | — |`);
    lines.push(`| ${r.name} | ${scorer} | ${c(r.vN)} | ${r.vN.consequential.join(', ')} | ${r.vN.gate.map((g) => (g.passed ? 'pass' : 'fail')).join(', ')} | ${r.vN.workTypeQuestions.join(', ')} |`);
  }
  for (const r of rows) {
    lines.push('', `**${r.name}:** ${r.changes.length} field result${r.changes.length === 1 ? '' : 's'} changed.`);
    const groups = {};
    for (const x of r.changes) (groups[`${x.from} → ${x.to}`] ||= []).push(`${x.id}:${x.field}${r.name === '6A rules' ? '' : ` (run ${x.run})`}`);
    for (const [k, v] of Object.entries(groups)) lines.push(`- ${k}: ${v.join(', ')}`);
    const failing = r.vN.gate.map((g, i) => ({ i, g })).filter(({ g }) => !g.passed);
    for (const { i, g } of failing) lines.push(`- ${scorer} gate, run ${i + 1}: ${g.checks.filter((x) => !x.passed).map((x) => `${x.name} (${x.failures.join(', ')})`).join('; ')}`);
  }
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const option = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback; };
  const date = option('date', null); const set = option('set', 'tuned'); const scorer = option('scorer', 'score-v2');
  if (!date) { console.error('--date is required (the date of the saved results).'); process.exit(1); }
  if (!SCORERS.includes(scorer)) { console.error(`--scorer must be one of: ${SCORERS.join(', ')}.`); process.exit(1); }
  const SETS = SET_FILES;
  if (!SETS[set]) { console.error(`--set must be one of: ${Object.keys(SETS).join(', ')}.`); process.exit(1); }
  const cases = loadCases(new URL(`./${SETS[set]}`, import.meta.url));
  const promptVersion = option('prompt', 'describe-v1');
  const files = resultFiles(date, set, promptVersion);
  const auditFile = option('audit', null);
  const audit = auditFile ? loadAudit(auditFile) : null;
  if (audit && scorer !== 'score-v2') { console.error('--audit applies to score-v2 only.'); process.exit(1); }
  const results = files.map((f) => JSON.parse(readFileSync(join(here, 'results', f), 'utf8')));
  // score-v1 must reproduce the saved reports before anything else is trusted.
  for (const r of results) for (const run of r.runs.filter((x) => !x.partial)) {
    const now = summarise(run.readings.map((x) => scoreCase(cases.find((c) => c.id === x.id), x.reading, { allowedFields: ALLOWED, scorer: 'score-v1' })));
    if (JSON.stringify(now.results) !== JSON.stringify(run.report.totals.results)) { console.error(`score-v1 doesn't reproduce the saved report for ${r.model} run ${run.run}.`); process.exit(1); }
  }
  const text = rescoreText(rescore({ cases, results, scorer, audit }), { scorer, set, date, audited: !!audit });
  console.log(text);
  if (argv.includes('--write')) writeFileSync(join(here, 'results', `rescore-${date}${set === 'tuned' ? '' : `-${set}`}${promptVersion === 'describe-v1' ? '' : `-${promptVersion}`}-${scorer}${audit ? '-audited' : ''}.md`), `${text}\n`);
}
