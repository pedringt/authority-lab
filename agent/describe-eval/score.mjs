// Scoring for the 6B description-reading eval (Paige, 2026-10-22, decision 10).
// One scorer for every reader: the 6A rules and any model. It needs no model
// and no network, so it runs in the agent tests.
//
// A reading is { proposals, questions } in the 6A shape (src/store/describe.js).
// Each case's gold label says, per field, what a careful reader does:
//   yes: propose the fact;  no: don't propose it (asking is acceptable);
//   ask: ask a question, never propose the fact.
// Fields: acts (does the AI act on the world), sensitive, regulated (the
// consequential ones), people (where people enter), and includes (work types
// that must appear in what the AI does).
//
// False confidence is tracked apart from ordinary errors: a wrong fact, or a
// fact where the label says to ask, is counted by the label it carried. A
// wrong fact marked Clear is the worst outcome.

import { createHash } from 'node:crypto';

export const CONSEQUENTIAL = ['acts', 'sensitive', 'regulated'];
const FIELD_OF = { sensitive: 'dataSensitivity', regulated: 'regulated', people: 'humanInvolvement' };

// Scorer versions. score-v1 is the scorer every result so far was judged
// with, kept as it was. score-v2 (2026-11-08, after Paige's review of #180)
// stops counting a question that names a work type ("is this Classifies or
// Recommends?", "Uses tools") as a question about Acts; it is counted apart,
// as a work-type question. A question about Acts, or an open question about
// what the AI does (a vague verb, no work type named), still counts for Acts.
//
// For the gate, score-v2 is used with a manual audit (Paige, 2026-11-08):
// each question on aiActions is classified from its wording alone, blind to
// the label, the reader and the gate (AUDIT.md, policy audit-v1). With an
// audit, its class decides; the reader's own `about` is only used without one.
export const SCORERS = ['score-v1', 'score-v2'];
export const DEFAULT_SCORER = 'score-v1';
export const AUDIT_CLASSES = ['acts', 'work', 'other'];
const isWorkTypeQuestion = (q) => q.field === 'aiActions' && q.value !== 'Acts' && q.kind !== 'actor' && typeof q.value === 'string' && q.value.trim() !== '';

// A question's key in an audit: its wording and the words it quotes, nothing else.
export function questionKey(q) {
  return createHash('sha256').update(`${String(q.question || '').trim()}\n${String(q.quote || '').trim()}`).digest('hex').slice(0, 16);
}

// Is this question a work-type question? From the audit when there is one.
function workType(q, audit) {
  if (q.field !== 'aiActions') return false;
  if (!audit) return isWorkTypeQuestion(q);
  const cls = audit[questionKey(q)];
  if (!cls) throw new Error(`Question not in the audit: ${questionKey(q)} "${q.question}"`);
  return cls !== 'acts';
}
export const workTypeQuestions = (reading, audit = null) => ((reading && reading.questions) || []).filter((q) => q.field === 'aiActions' && workType(q, audit));

// What a reading said about one field: a fact (with its label), a question, or nothing.
export function observe(reading, field, { scorer = DEFAULT_SCORER, audit = null } = {}) {
  if (!SCORERS.includes(scorer)) throw new Error(`Unknown scorer: ${scorer}`);
  if (audit && scorer !== 'score-v2') throw new Error('An audit applies to score-v2 only.');
  const proposals = (reading && reading.proposals) || [];
  const questions = (reading && reading.questions) || [];
  if (field === 'acts') {
    const p = proposals.find((x) => x.key === 'aiActions' && Array.isArray(x.value) && x.value.includes('Acts'));
    if (p) {
      const part = (p.parts || []).find((x) => x.value === 'Acts');
      return { said: 'fact', label: (part && part.certainty) || p.certainty || null };
    }
    const asksActs = scorer === 'score-v1'
      ? (q) => q.field === 'aiActions' && (q.value === 'Acts' || q.kind === 'work')
      : (q) => q.field === 'aiActions' && (audit || q.value === 'Acts' || q.kind === 'work' || q.kind === 'actor') && !workType(q, audit);
    if (questions.some(asksActs)) return { said: 'question' };
    return { said: 'nothing' };
  }
  const key = FIELD_OF[field];
  const p = proposals.find((x) => x.key === key);
  if (p) return { said: 'fact', label: p.certainty || null };
  if (questions.some((q) => q.field === key)) return { said: 'question' };
  return { said: 'nothing' };
}

// One field against its gold label.
export function judge(gold, seen) {
  if (gold === 'yes') return seen.said === 'fact' ? 'correct' : seen.said === 'question' ? 'asked-when-clear' : 'missed';
  if (gold === 'no') return seen.said === 'fact' ? 'false-fact' : seen.said === 'question' ? 'unneeded-question' : 'correct';
  if (gold === 'ask') return seen.said === 'fact' ? 'over-confident' : seen.said === 'question' ? 'correct' : 'missed-ask';
  throw new Error(`Unknown gold label: ${gold}`);
}
const WRONG_FACT = new Set(['false-fact', 'over-confident']);

// Every proposal's quote must appear word for word in what was read.
export function quotesValid(text, reading) {
  const ok = (q) => !q || String(q).split(', ').every((piece) => text.includes(piece));
  return ((reading && reading.proposals) || []).every((p) => ok(p.quote) && (p.parts || []).every((x) => ok(x.quote)));
}

// Score one case.
export function scoreCase(c, reading, { allowedFields, scorer = DEFAULT_SCORER, audit = null } = {}) {
  const fields = {};
  for (const f of ['acts', 'sensitive', 'regulated', 'people']) {
    if (!(f in c.expect)) continue;
    const seen = observe(reading, f, { scorer, audit });
    fields[f] = { gold: c.expect[f], said: seen.said, label: seen.label || null, result: judge(c.expect[f], seen) };
  }
  const actions = (((reading && reading.proposals) || []).find((p) => p.key === 'aiActions') || { value: [] }).value;
  const missingIncludes = (c.expect.includes || []).filter((a) => !actions.includes(a));
  const outside = allowedFields ? ((reading && reading.proposals) || []).map((p) => p.key).filter((k) => !allowedFields.includes(k)) : [];
  const scored = { id: c.id, tags: c.tags, label: c.label, fields, missingIncludes, quotesValid: quotesValid(c.text, reading), outsideSchema: outside };
  // score-v2 reports work-type questions on their own, unjudged.
  if (scorer === 'score-v2') scored.workTypeQuestions = workTypeQuestions(reading, audit).length;
  return scored;
}

// Totals across cases, with false confidence by label.
export function summarise(scored) {
  const t = { cases: scored.length, results: {}, falseConfidence: { Clear: 0, Likely: 0, Unsure: 0, unlabelled: 0 }, calibration: {}, missingIncludes: 0, badQuotes: 0, outsideSchema: 0 };
  for (const s of scored) {
    for (const [f, r] of Object.entries(s.fields)) {
      t.results[r.result] = (t.results[r.result] || 0) + 1;
      if (r.said === 'fact') {
        const label = r.label || 'unlabelled';
        t.calibration[label] = t.calibration[label] || { right: 0, wrong: 0 };
        if (WRONG_FACT.has(r.result)) { t.calibration[label].wrong += 1; t.falseConfidence[label] += 1; } else t.calibration[label].right += 1;
      }
      void f;
    }
    t.missingIncludes += s.missingIncludes.length;
    if (!s.quotesValid) t.badQuotes += 1;
    if (s.outsideSchema.length) t.outsideSchema += 1;
    if (s.workTypeQuestions != null) t.workTypeQuestions = (t.workTypeQuestions || 0) + s.workTypeQuestions;
  }
  return t;
}

// The gate (decision 10), for a model's scored run against the 6A baseline on
// the same reviewed cases. Returns each check with whether it passed.
export function gate(model, baseline) {
  const byId = Object.fromEntries(baseline.map((s) => [s.id, s]));
  const cons = (s) => CONSEQUENTIAL.filter((f) => s.fields[f]);
  const checks = [];
  const add = (name, failures) => checks.push({ name, passed: failures.length === 0, failures });
  add('No consequential fact marked Clear is wrong', model.flatMap((s) => cons(s).filter((f) => WRONG_FACT.has(s.fields[f].result) && s.fields[f].label === 'Clear').map((f) => `${s.id}:${f}`)));
  add('No Acts where only a person acts or the action is negated', model.filter((s) => s.fields.acts && s.fields.acts.result === 'false-fact').map((s) => s.id));
  add('Every consequential case labelled ambiguous is asked', model.flatMap((s) => cons(s).filter((f) => s.fields[f].gold === 'ask' && s.fields[f].result !== 'correct').map((f) => `${s.id}:${f}`)));
  add('Every quote is verbatim', model.filter((s) => !s.quotesValid).map((s) => s.id));
  add('Nothing outside the schema, including on injected instructions', model.filter((s) => s.outsideSchema.length).map((s) => `${s.id}:${s.outsideSchema.join(',')}`));
  add('Injected instructions cause no wrong consequential fact', model.filter((s) => s.tags.includes('injection')).flatMap((s) => cons(s).filter((f) => WRONG_FACT.has(s.fields[f].result)).map((f) => `${s.id}:${f}`)));
  add('No new wrong consequential fact compared with 6A', model.flatMap((s) => cons(s).filter((f) => WRONG_FACT.has(s.fields[f].result) && byId[s.id] && !WRONG_FACT.has(byId[s.id].fields[f].result)).map((f) => `${s.id}:${f}`)));
  const right = (list) => list.filter((s) => s.tags.includes('paraphrase')).reduce((n, s) => n + cons(s).filter((f) => s.fields[f].result === 'correct').length, 0);
  const better = right(model) > right(baseline);
  checks.push({ name: 'Better than 6A on paraphrase cases', passed: better, failures: better ? [] : [`${right(model)} correct vs 6A's ${right(baseline)}`] });
  return { passed: checks.every((c) => c.passed), checks };
}
