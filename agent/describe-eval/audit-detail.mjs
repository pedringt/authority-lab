#!/usr/bin/env node
// Every miss and every gate check, per reader and run, under score-v2 with a
// complete audit, beside the provisional score-v2 (the readers' own tags).
// No model calls; the saved readings are only read.
//
//   node agent/describe-eval/audit-detail.mjs --date 2026-11-08 --set heldout-2 --prompt describe-v2 --audit file [--write]

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDescription, CONTEXT_FIELDS } from '../../src/store/index.js';
import { scoreCase, gate } from './score.mjs';
import { loadCases } from './runner.mjs';
import { loadAudit, resultFiles, SET_FILES } from './audit.mjs';
import { auditCoverage } from './rescore.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ALLOWED = CONTEXT_FIELDS.map((f) => f.key);

export function auditDetail({ cases, results, audit }) {
  const { missing, extra } = auditCoverage({ cases, results, audit });
  if (missing.length || extra.length) throw new Error('The audit doesn\'t match these readings.');
  const byId = Object.fromEntries(cases.map((c) => [c.id, c]));
  const score = (c, reading, a) => scoreCase(c, reading || { proposals: [], questions: [] }, { allowedFields: ALLOWED, scorer: 'score-v2', audit: a });
  const base = (a) => cases.map((c) => score(c, readDescription(c.text), a));
  const readers = [{ name: '6A rules', runs: [cases.map((c) => ({ id: c.id, reading: readDescription(c.text) }))] }, ...results.map((r) => ({ name: r.model, runs: r.runs.filter((x) => !x.partial).map((x) => x.readings) }))];
  return readers.map((reader) => ({
    name: reader.name,
    runs: reader.runs.map((readings, i) => {
      const run = (a) => readings.map((r) => score(byId[r.id], r.reading, a));
      const audited = run(audit); const provisional = run(null);
      const misses = audited.flatMap((s) => Object.entries(s.fields).filter(([, x]) => x.result !== 'correct').map(([f, x]) => `${s.id}:${f} ${x.result}`));
      return { run: i + 1, misses, gate: gate(audited, base(audit)), provisionalGate: gate(provisional, base(null)) };
    }),
  }));
}

export function auditDetailText(rows, { set, date, auditFile }) {
  const lines = [`## Every miss and gate check, score-v2 with the audit (${set} set, readings of ${date})`, '', `Audit: \`${auditFile}\`. No model calls. "Provisional" is score-v2 on the readers' own \`about\` tags, before the audit.`, ''];
  for (const r of rows) for (const x of r.runs) {
    lines.push(`### ${r.name}${r.name === '6A rules' ? '' : `, run ${x.run}`}: ${x.gate.passed ? 'pass' : 'fail'} (provisional: ${x.provisionalGate.passed ? 'pass' : 'fail'})`, '');
    for (const c of x.gate.checks) lines.push(`- ${c.passed ? 'pass' : 'FAIL'}: ${c.name}${c.failures.length ? ` (${c.failures.join(', ')})` : ''}`);
    lines.push('', `Misses (${x.misses.length}): ${x.misses.length ? x.misses.join('; ') : 'none'}`, '');
  }
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const option = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback; };
  const date = option('date', null); const set = option('set', 'heldout-2'); const promptVersion = option('prompt', 'describe-v1'); const auditFile = option('audit', null);
  if (!date || !auditFile || !SET_FILES[set]) { console.error('Use: --date <date> --set <set> [--prompt <version>] --audit <file> [--write]'); process.exit(1); }
  const cases = loadCases(new URL(`./${SET_FILES[set]}`, import.meta.url));
  const results = resultFiles(date, set, promptVersion).map((f) => JSON.parse(readFileSync(join(here, 'results', f), 'utf8')));
  const text = auditDetailText(auditDetail({ cases, results, audit: loadAudit(auditFile) }), { set, date, auditFile: auditFile.replace(/^.*\/results\//, 'results/') });
  console.log(text);
  if (argv.includes('--write')) writeFileSync(join(here, 'results', `detail-${date}${set === 'tuned' ? '' : `-${set}`}${promptVersion === 'describe-v1' ? '' : `-${promptVersion}`}-score-v2-audited.md`), `${text}\n`);
}
