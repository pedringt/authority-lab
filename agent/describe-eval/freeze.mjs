#!/usr/bin/env node
// Freezing the held-out set (Paige, 2026-11-08). Once its labels are
// reviewed, the labels, the 6A rules (src/store/describe.js) and the prompt
// (prompt.mjs) are recorded by hash. A held-out run, and the tests, refuse to
// use the set if any of the three has changed since: neither the rules nor
// the prompt may be tuned on these cases.
//
//   node agent/describe-eval/freeze.mjs          # check (exit 1 if not frozen or changed)
//   node agent/describe-eval/freeze.mjs --write  # record the freeze, after Paige's review

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PROMPT_VERSION } from './prompt.mjs';

const HELDOUT = new URL('./heldout.json', import.meta.url);
const RULES = new URL('../../src/store/describe.js', import.meta.url);
const PROMPT = new URL('./prompt.mjs', import.meta.url);
const sha = (text) => createHash('sha256').update(text).digest('hex');

// What the freeze covers, as it is now.
export function fingerprint() {
  const set = JSON.parse(readFileSync(HELDOUT, 'utf8'));
  return {
    labelsSha256: sha(JSON.stringify(set.cases.map((c) => ({ id: c.id, text: c.text, expect: c.expect, label: c.label })))),
    rulesSha256: sha(readFileSync(RULES, 'utf8')),
    promptSha256: sha(readFileSync(PROMPT, 'utf8')),
    promptVersion: PROMPT_VERSION,
  };
}

// Is the set frozen, and unchanged since? Returns the reasons it isn't.
export function freezeProblems() {
  const set = JSON.parse(readFileSync(HELDOUT, 'utf8'));
  if (!set.frozen) return ['the held-out set is not frozen yet'];
  if (!set.cases.every((c) => c.label === 'reviewed')) return ['a held-out label is not reviewed'];
  const now = fingerprint();
  const names = { labelsSha256: 'the labels', rulesSha256: 'the 6A rules (src/store/describe.js)', promptSha256: 'the prompt (prompt.mjs)', promptVersion: 'the prompt version' };
  return Object.keys(names).filter((k) => set.frozen[k] !== now[k]).map((k) => `${names[k]} changed since the freeze on ${set.frozen.date}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--write')) {
    const set = JSON.parse(readFileSync(HELDOUT, 'utf8'));
    if (!set.cases.every((c) => c.label === 'reviewed')) { console.error('Every held-out label must be reviewed before the freeze.'); process.exit(1); }
    const date = new Date().toISOString().slice(0, 10);
    set.frozen = { date, reviewedBy: 'Paige', ...fingerprint() };
    writeFileSync(HELDOUT, `${JSON.stringify(set, null, 2)}\n`);
    console.log(`Frozen on ${date}: ${set.cases.length} labels, rules and prompt ${set.frozen.promptVersion}.`);
  } else {
    const problems = freezeProblems();
    console.log(problems.length ? `Not usable: ${problems.join('; ')}.` : 'Frozen and unchanged.');
    process.exit(problems.length ? 1 : 0);
  }
}
