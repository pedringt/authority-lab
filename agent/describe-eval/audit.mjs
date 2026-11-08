#!/usr/bin/env node
// The blind question audit (AUDIT.md, policy audit-v1). No model calls.
//
//   node agent/describe-eval/audit.mjs sheet --date 2026-11-08 --set tuned|heldout|heldout-2 [--prompt describe-v2] [--out file]
//   node agent/describe-eval/audit.mjs check --audit results/audit-2026-11-08.json
//
// sheet: every aiActions question from the 6A rules and the saved model
// readings of that date and set, with only its wording and quote, merged by
// key and listed in key order. The class is left empty for the auditor.
// check: every question has a class from AUDIT_CLASSES; prints the counts.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDescription } from '../../src/store/index.js';
import { questionKey, AUDIT_CLASSES } from './score.mjs';
import { loadCases } from './runner.mjs';

export const AUDIT_POLICY = 'audit-v1';
const here = dirname(fileURLToPath(import.meta.url));
export const SET_FILES = { tuned: 'cases.json', heldout: 'heldout.json', 'heldout-2': 'heldout-2.json' };

// Saved result files for a date, set and prompt. Older results don't record
// their set, which is then read from the file name.
export function resultFiles(date, set, promptVersion = 'describe-v1') {
  const setOf = (f, r) => r.set || (f.startsWith(`${date}-heldout-2-`) ? 'heldout-2' : f.startsWith(`${date}-heldout-`) ? 'heldout' : 'tuned');
  return readdirSync(join(here, 'results')).filter((f) => f.startsWith(`${date}-`) && f.endsWith('.json')).filter((f) => {
    const r = JSON.parse(readFileSync(join(here, 'results', f), 'utf8'));
    return r.format && setOf(f, r) === set && r.promptVersion === promptVersion;
  });
}

// The blind sheet: wording and quote only.
export function auditSheet({ cases, results }) {
  const all = [
    ...cases.flatMap((c) => readDescription(c.text).questions),
    ...results.flatMap((r) => r.runs.flatMap((run) => run.readings.flatMap((x) => (x.reading && x.reading.questions) || []))),
  ].filter((q) => q.field === 'aiActions');
  const byKey = new Map();
  for (const q of all) { const key = questionKey(q); if (!byKey.has(key)) byKey.set(key, { key, question: String(q.question || '').trim(), quote: String(q.quote || '').trim(), class: null }); }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

// An audit file as { key: class }, refusing an incomplete or off-policy one.
export function loadAudit(file) {
  const a = JSON.parse(readFileSync(file, 'utf8'));
  if (a.policy !== AUDIT_POLICY) throw new Error(`Audit policy is ${a.policy}, not ${AUDIT_POLICY}.`);
  const bad = a.questions.filter((q) => !AUDIT_CLASSES.includes(q.class));
  if (bad.length) throw new Error(`${bad.length} question(s) without a class from ${AUDIT_CLASSES.join(', ')}.`);
  return Object.fromEntries(a.questions.map((q) => [q.key, q.class]));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, ...argv] = process.argv.slice(2);
  const option = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback; };
  if (cmd === 'sheet') {
    const date = option('date', null); const set = option('set', 'tuned');
    if (!date || !SET_FILES[set]) { console.error(`Use: sheet --date <date> --set ${Object.keys(SET_FILES).join('|')}`); process.exit(1); }
    const cases = loadCases(new URL(`./${SET_FILES[set]}`, import.meta.url));
    const promptVersion = option('prompt', 'describe-v1');
    const results = resultFiles(date, set, promptVersion).map((f) => JSON.parse(readFileSync(join(here, 'results', f), 'utf8')));
    const questions = auditSheet({ cases, results });
    const out = option('out', join(here, 'results', `audit-${date}${set === 'tuned' ? '' : `-${set}`}${promptVersion === 'describe-v1' ? '' : `-${promptVersion}`}.json`));
    writeFileSync(out, `${JSON.stringify({ policy: AUDIT_POLICY, source: { date, set, promptVersion }, auditor: null, auditedOn: null, questions }, null, 2)}\n`);
    console.log(`${questions.length} questions to classify, written to ${out}.`);
  } else if (cmd === 'check') {
    const audit = loadAudit(option('audit', ''));
    const counts = {};
    for (const c of Object.values(audit)) counts[c] = (counts[c] || 0) + 1;
    console.log(`Complete: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
  } else { console.error('Use: sheet or check.'); process.exit(1); }
}
