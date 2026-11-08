#!/usr/bin/env node
// Freezing a held-out set (Paige, 2026-11-08). Once its labels are reviewed,
// everything that decides whether a run passes is recorded by hash: the
// labels, the 6A rules (src/store/describe.js) and the prompt; for heldout-2
// also the tags with their paraphrase reasons, v1's prompt module (v2 imports
// its schema, settings and reply checks), the rendered prompt and schema, the
// scorer and the question audit policy (AUDIT.md). A held-out run, and the
// tests, refuse the set if any of them has changed since, or if a field the
// set's freeze must record is missing: none may be tuned on these cases.
//
//   node agent/describe-eval/freeze.mjs [--set heldout-2]          # check (exit 1 if not frozen or changed)
//   node agent/describe-eval/freeze.mjs --set heldout-2 --show     # what a freeze would record now
//   node agent/describe-eval/freeze.mjs --set heldout-2 --write    # mark the labels reviewed and freeze, after Paige's approval
//
// The first set's freeze (heldout.json, describe-v1) recorded fewer things;
// it is checked against its own (legacy) list.

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// What each set is frozen with, and the fields its freeze must record.
const LEGACY_FIELDS = ['labelsSha256', 'rulesSha256', 'promptSha256', 'promptVersion'];
export const FREEZE_CONFIG = {
  heldout: { file: 'heldout.json', prompt: 'prompt.mjs', required: LEGACY_FIELDS },
  'heldout-2': {
    file: 'heldout-2.json', prompt: 'prompt-v2.mjs', promptDeps: ['prompt.mjs'], scorer: 'score-v2', auditPolicy: 'audit-v1',
    required: [...LEGACY_FIELDS, 'promptFile', 'promptDepsSha256', 'promptRenderedSha256', 'tagsSha256', 'scorer', 'scorerSha256', 'auditPolicy', 'auditPolicySha256'],
  },
};
const url = (path) => new URL(path, import.meta.url);
const RULES = url('../../src/store/describe.js');
const sha = (text) => createHash('sha256').update(text).digest('hex');
const config = (name) => { const cfg = FREEZE_CONFIG[name]; if (!cfg) throw new Error(`Unknown set: ${name}`); return cfg; };
export const readSet = (name) => JSON.parse(readFileSync(url(`./${config(name).file}`), 'utf8'));

// What the freeze covers, for a set as given (by default, as it is on disk).
export async function fingerprint(name = 'heldout', set = readSet(name)) {
  const cfg = config(name);
  const prompt = await import(`./${cfg.prompt}`);
  const f = {
    labelsSha256: sha(JSON.stringify(set.cases.map((c) => ({ id: c.id, text: c.text, expect: c.expect, label: c.label })))),
    rulesSha256: sha(readFileSync(RULES, 'utf8')),
    promptSha256: sha(readFileSync(url(`./${cfg.prompt}`), 'utf8')),
    promptVersion: prompt.PROMPT_VERSION,
  };
  if (name === 'heldout') return f;
  return {
    ...f,
    promptFile: cfg.prompt,
    promptDepsSha256: sha(cfg.promptDeps.map((d) => `${d}\n${readFileSync(url(`./${d}`), 'utf8')}`).join('\n')),
    // What the model is actually sent, including the Context fields it lists.
    promptRenderedSha256: sha(JSON.stringify({ system: prompt.SYSTEM, schema: prompt.OUTPUT_SCHEMA, maxTokens: prompt.MAX_TOKENS, effort: prompt.EFFORT })),
    tagsSha256: sha(JSON.stringify(set.cases.map((c) => ({ id: c.id, tags: c.tags, paraphraseReason: c.paraphraseReason || null })))),
    scorer: cfg.scorer,
    scorerSha256: sha(readFileSync(url('./score.mjs'), 'utf8')),
    auditPolicy: cfg.auditPolicy,
    auditPolicySha256: sha(readFileSync(url('./AUDIT.md'), 'utf8')),
  };
}

const NAMES = {
  labelsSha256: 'the labels', rulesSha256: 'the 6A rules (src/store/describe.js)', promptSha256: 'the prompt', promptVersion: 'the prompt version', promptFile: 'the prompt file',
  promptDepsSha256: 'the prompt modules it imports (prompt.mjs)', promptRenderedSha256: 'the prompt and schema as sent', tagsSha256: 'the tags or paraphrase reasons',
  scorer: 'the scorer version', scorerSha256: 'the scorer (score.mjs)', auditPolicy: 'the audit policy version', auditPolicySha256: 'the audit policy (AUDIT.md)',
};

// Is the set frozen, complete and unchanged since? Returns the reasons it isn't.
export async function freezeProblems(name = 'heldout', set = readSet(name)) {
  if (!set.frozen) return ['the held-out set is not frozen yet'];
  if (!set.cases.every((c) => c.label === 'reviewed')) return ['a held-out label is not reviewed'];
  const missing = config(name).required.filter((k) => !(k in set.frozen));
  if (missing.length) return [`the freeze is missing ${missing.map((k) => NAMES[k]).join(', ')}`];
  const now = await fingerprint(name, set);
  return config(name).required.filter((k) => set.frozen[k] !== now[k]).map((k) => `${NAMES[k]} changed since the freeze on ${set.frozen.date}`);
}

// Before a freeze: what must hold for the set as given. The gate's comparison
// with 6A needs paraphrase cases, each with its reason.
export function freezeReadiness(name, set = readSet(name)) {
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

// The approved freeze, built in memory: every draft label marked reviewed,
// validated, then fingerprinted, so the labels and the freeze are written together.
export async function prepareFreeze(name, set = readSet(name), { date = new Date().toISOString().slice(0, 10), reviewedBy = 'Paige' } = {}) {
  if (set.frozen) return { problems: [`already frozen on ${set.frozen.date}`] };
  const next = { ...set, cases: set.cases.map((c) => ({ ...c, label: 'reviewed' })) };
  const problems = freezeReadiness(name, next);
  if (problems.length) return { problems };
  next.frozen = { date, reviewedBy, ...(await fingerprint(name, next)) };
  const after = await freezeProblems(name, next);
  return after.length ? { problems: after } : { set: next, problems: [] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--set'); const name = i >= 0 ? argv[i + 1] : 'heldout';
  if (!FREEZE_CONFIG[name]) { console.error(`--set must be one of: ${Object.keys(FREEZE_CONFIG).join(', ')}.`); process.exit(1); }
  if (argv.includes('--show')) {
    const { set, problems } = await prepareFreeze(name);
    if (problems.length) { console.log(`Not ready to freeze: ${problems.join('; ')}.`); process.exit(1); }
    console.log(JSON.stringify(set.frozen, null, 2));
    console.log('Ready to freeze (labels would be marked reviewed).');
  } else if (argv.includes('--write')) {
    const { set, problems } = await prepareFreeze(name);
    if (problems.length) { console.error(`Not frozen: ${problems.join('; ')}.`); process.exit(1); }
    writeFileSync(url(`./${FREEZE_CONFIG[name].file}`), `${JSON.stringify(set, null, 2)}\n`);
    console.log(`Frozen on ${set.frozen.date}: ${set.cases.length} labels reviewed, ${set.frozen.promptVersion}${set.frozen.scorer ? `, ${set.frozen.scorer} with ${set.frozen.auditPolicy}` : ''}.`);
  } else {
    const problems = await freezeProblems(name);
    console.log(problems.length ? `Not usable: ${problems.join('; ')}.` : 'Frozen and unchanged.');
    process.exit(problems.length ? 1 : 0);
  }
}
