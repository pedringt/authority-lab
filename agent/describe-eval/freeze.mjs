#!/usr/bin/env node
// Freezing a held-out set (Paige, 2026-11-08). Once its labels are reviewed,
// everything that decides whether a run passes is recorded by hash: the
// labels, the 6A rules (src/store/describe.js) and the prompt; for heldout-2
// also the tags with their paraphrase reasons, the scorer and the question
// audit policy (AUDIT.md). A held-out run, and the tests, refuse the set if
// any of them has changed since: none may be tuned on these cases.
//
//   node agent/describe-eval/freeze.mjs [--set heldout-2]          # check (exit 1 if not frozen or changed)
//   node agent/describe-eval/freeze.mjs --set heldout-2 --show     # what a freeze would record now
//   node agent/describe-eval/freeze.mjs --set heldout-2 --write    # record the freeze, after Paige's review
//
// The first set's freeze (heldout.json, describe-v1) recorded fewer things;
// a set is checked against exactly what its own freeze recorded.

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// What each set is frozen with.
export const FREEZE_CONFIG = {
  heldout: { file: 'heldout.json', prompt: 'prompt.mjs' },
  'heldout-2': { file: 'heldout-2.json', prompt: 'prompt-v2.mjs', scorer: 'score-v2', auditPolicy: 'audit-v1' },
};
const url = (path) => new URL(path, import.meta.url);
const RULES = url('../../src/store/describe.js');
const sha = (text) => createHash('sha256').update(text).digest('hex');
const readSet = (name) => JSON.parse(readFileSync(url(`./${FREEZE_CONFIG[name].file}`), 'utf8'));

// What the freeze covers, as it is now.
export async function fingerprint(name = 'heldout') {
  const cfg = FREEZE_CONFIG[name];
  if (!cfg) throw new Error(`Unknown set: ${name}`);
  const set = readSet(name);
  const { PROMPT_VERSION } = await import(`./${cfg.prompt}`);
  const f = {
    labelsSha256: sha(JSON.stringify(set.cases.map((c) => ({ id: c.id, text: c.text, expect: c.expect, label: c.label })))),
    rulesSha256: sha(readFileSync(RULES, 'utf8')),
    promptSha256: sha(readFileSync(url(`./${cfg.prompt}`), 'utf8')),
    promptVersion: PROMPT_VERSION,
  };
  if (name === 'heldout') return f;
  return {
    ...f,
    promptFile: cfg.prompt,
    tagsSha256: sha(JSON.stringify(set.cases.map((c) => ({ id: c.id, tags: c.tags, paraphraseReason: c.paraphraseReason || null })))),
    scorer: cfg.scorer,
    scorerSha256: sha(readFileSync(url('./score.mjs'), 'utf8')),
    auditPolicy: cfg.auditPolicy,
    auditPolicySha256: sha(readFileSync(url('./AUDIT.md'), 'utf8')),
  };
}

const NAMES = {
  labelsSha256: 'the labels', rulesSha256: 'the 6A rules (src/store/describe.js)', promptSha256: 'the prompt', promptVersion: 'the prompt version', promptFile: 'the prompt file',
  tagsSha256: 'the tags or paraphrase reasons', scorer: 'the scorer version', scorerSha256: 'the scorer (score.mjs)', auditPolicy: 'the audit policy version', auditPolicySha256: 'the audit policy (AUDIT.md)',
};

// Is the set frozen, and unchanged since? Returns the reasons it isn't.
export async function freezeProblems(name = 'heldout') {
  const set = readSet(name);
  if (!set.frozen) return ['the held-out set is not frozen yet'];
  if (!set.cases.every((c) => c.label === 'reviewed')) return ['a held-out label is not reviewed'];
  const now = await fingerprint(name);
  return Object.keys(NAMES).filter((k) => k in set.frozen && set.frozen[k] !== now[k]).map((k) => `${NAMES[k]} changed since the freeze on ${set.frozen.date}`);
}

// Before a freeze: what must hold. The gate's comparison with 6A needs
// paraphrase cases, each with its reason.
export function freezeReadiness(name) {
  const set = readSet(name);
  const problems = [];
  if (!set.cases.every((c) => c.label === 'reviewed')) problems.push(`${set.cases.filter((c) => c.label !== 'reviewed').length} label(s) not reviewed`);
  if (name !== 'heldout') {
    const para = set.cases.filter((c) => c.tags.includes('paraphrase'));
    if (para.length < 5) problems.push(`only ${para.length} paraphrase case(s)`);
    const noReason = para.filter((c) => !c.paraphraseReason).map((c) => c.id);
    if (noReason.length) problems.push(`paraphrase case(s) without a reason: ${noReason.join(', ')}`);
    const stray = set.cases.filter((c) => c.paraphraseReason && !c.tags.includes('paraphrase')).map((c) => c.id);
    if (stray.length) problems.push(`a paraphrase reason without the tag: ${stray.join(', ')}`);
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--set'); const name = i >= 0 ? argv[i + 1] : 'heldout';
  if (!FREEZE_CONFIG[name]) { console.error(`--set must be one of: ${Object.keys(FREEZE_CONFIG).join(', ')}.`); process.exit(1); }
  if (argv.includes('--show')) {
    const problems = freezeReadiness(name);
    console.log(JSON.stringify(await fingerprint(name), null, 2));
    console.log(problems.length ? `Not ready to freeze: ${problems.join('; ')}.` : 'Ready to freeze.');
  } else if (argv.includes('--write')) {
    const problems = freezeReadiness(name);
    if (problems.length) { console.error(`Not ready to freeze: ${problems.join('; ')}.`); process.exit(1); }
    const set = readSet(name);
    const date = new Date().toISOString().slice(0, 10);
    set.frozen = { date, reviewedBy: 'Paige', ...(await fingerprint(name)) };
    writeFileSync(url(`./${FREEZE_CONFIG[name].file}`), `${JSON.stringify(set, null, 2)}\n`);
    console.log(`Frozen on ${date}: ${set.cases.length} labels, ${set.frozen.promptVersion}${set.frozen.scorer ? `, ${set.frozen.scorer} with ${set.frozen.auditPolicy}` : ''}.`);
  } else {
    const problems = await freezeProblems(name);
    console.log(problems.length ? `Not usable: ${problems.join('; ')}.` : 'Frozen and unchanged.');
    process.exit(problems.length ? 1 : 0);
  }
}
