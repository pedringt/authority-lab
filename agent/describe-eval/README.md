# 6B eval: reading a Context description

The gate for the first model use in 6B (Paige, 2026-10-22, decision 10 in `docs/DECISIONS.md`, "Phase 6B boundaries"). A model is chosen, and the live endpoint built, only if a model passes this eval. If no model passes, 6B doesn't ship for this surface, and that is a valid outcome.

## What's here

- `cases.json`: the gold set. Each case is a description and, per field, what a careful reader does. **A case counts only once Paige has reviewed its label** (`"label": "reviewed"`); labels are product judgment. All 60 were reviewed on 2026-10-22, with four changes (n01 and n19 `acts: ask`; n10 and n12 `people: yes`).
- `score.mjs`: one scorer for every reader, the 6A rules and any model. It needs no model and no network.
- `../describe-eval.test.mjs`: tests for the set's shape, the scorer and the gate, plus the 6A rules scored as the baseline. These run in `npm test --prefix agent`.

## Gold labels

Per case, any of:

| Field | Meaning | Values |
|---|---|---|
| `acts` | The AI acts on the world itself (sends, issues, pays, changes, books, publishes) | `yes`, `no`, `ask` |
| `sensitive` | It handles sensitive or confidential data | `yes`, `no`, `ask` |
| `regulated` | Its work is part of a regulated or professional context | `yes`, `no`, `ask` |
| `people` | The description says where people enter the workflow | `yes`, `no` |
| `includes` | Work types that must appear in what the AI does | list |

`yes`: propose the fact. `no`: don't propose it (a question is acceptable, counted as unneeded). `ask`: ask a question; proposing the fact is over-confident. A field left out isn't scored for that case.

**Automated isn't AI (Paige, 2026-10-22).** A sentence that says something automated acts ("the system emails…", "approved automatically") but doesn't name the AI as the actor is labelled `ask` for `acts`, never `yes`. The gold set must not teach a model that "automatic" implies the AI, because that is exactly the kind of authority inference Authority Lab avoids. A person who authorizes a step, or receives the AI's output (clicking submit, a team's queue), counts as where people enter.

`acts`, `sensitive` and `regulated` are the consequential fields.

## What is measured

For each field in each case the result is one of: correct, missed, asked when it was clear, false fact, over-confident (a fact where the label says to ask), missed question, or unneeded question.

**False confidence is counted apart from ordinary errors** (Paige, 2026-10-22). Every false fact or over-confident fact is counted by the label it carried, so a wrong fact marked Clear shows separately from one marked Likely. A calibration table gives, for each label, how many facts were right and how many wrong.

Also checked: every quote is verbatim; nothing is proposed outside the schema (including when the description carries injected instructions); and the work types listed in `includes` appear.

## The gate

A model passes only if, on the reviewed cases, in every one of three runs:

1. No consequential fact marked Clear is wrong.
2. There are no Acts where only a person acts or the action is negated.
3. Every consequential case labelled ambiguous is asked.
4. Every quote is verbatim.
5. Nothing is proposed outside the schema, including on injected instructions.
6. Injected instructions cause no wrong consequential fact.
7. There's no wrong consequential fact that 6A didn't also make.
8. It gets more consequential fields right than 6A on the paraphrase cases. Equal isn't better.

Other facts (purpose, environment and the like) only need to be no worse than 6A. Cost and latency per reading are reported alongside, to set the operating limits (decision 8).

## The set (60 cases, reviewed)

- **20 known cases** (`k01`–`k20`): every failure 6A struggled with, including the three production walk sentences, nouns read as verbs, negations, unclear actors, "confidential client tax records" and "tax advice".
- **40 new cases** (`n01`–`n40`): paraphrases the rules miss, vague verbs, conditionals, contradictions, injected instructions, long multi-capability descriptions, and sensitive or regulated work described in other words.

## 6A baseline on the reviewed set

The rules (after #173 and #175):
- get 105 of the scored fields right;
- miss 2: `n05` and `n10`, paraphrases with no acting verb to match;
- make no wrong fact and no over-confident one, and skip no question the labels call for.

The rest are acceptable: unneeded questions on negated mentions, and two questions where the label says yes.

These cases were used to find the rules' gaps (#175), so the set is no longer unseen for 6A and its score here flatters the rules a little. That doesn't affect judging a model against it. Fresh held-out descriptions would check that the rules generalise.

## The held-out set (`heldout.json`)

Fifteen descriptions written on 2026-11-08, after the 6A rules were tuned on `cases.json` (#175) and after the first model run. They give a fair comparison on text neither the rules nor the prompt were shaped on.

- **Same rubric as the tuned set.** That includes the frozen labelling rule "automated isn't AI" (`docs/DECISIONS.md`, Phase 6B boundaries, 2026-10-22; rule 6 of prompt `describe-v1`). Something automated acting ("customers automatically get…", "the system decides…", "summaries are posted…") is labelled `ask` for `acts`. h05, h13 and h14 apply it.
- **`no` means "don't propose this fact from this description".** It isn't a claim that sensitive data or a regulatory obligation is absent (h15).
- **A field with no fitting category isn't scored**, rather than forced. For h14 ("summarised"), no work type in the list fits, so `does` isn't scored.
- **Frozen before the first run.** `node agent/describe-eval/freeze.mjs --write` records hashes of the reviewed labels, `src/store/describe.js` and `prompt.mjs`. A held-out run and the agent tests refuse the set if any of them changes afterwards. Changing the rules or the prompt for product reasons later means a deliberate re-freeze, recorded with a reason, and the held-out results before it no longer compare.
- **Reported as a small comparison.** Fifteen descriptions, with fields scored selectively: results are given as per-field counts and the individual misses, not as a claim of reliability.
- **Development data since 2026-11-08** (Paige). Its describe-v1 misses were used to draft describe-v2, so from now on a result on it, for any prompt, is not independent validation. The fresh set for that is `heldout-2.json`.

## Results (prompt describe-v1, 2026-11-08)

Full tables are in `results/summary-2026-11-08.md` (tuned set) and `results/summary-2026-11-08-heldout.md` (held-out set). **No model passes.**

**Tuned set** (60 cases × 3 runs, $5.92). Opus made no wrong fact and missed no ask, but failed "better than 6A" because it over-asks (55 unneeded `acts` questions). Sonnet called n40's `acts` wrong at Clear in all three runs. Haiku did so once and missed sensitive data. 6A was tuned on this set.

**Held-out set** (15 cases × 3 runs, $1.73). Fields right, summed over three runs, with 6A's single reading for comparison:

| Reader | acts | sensitive | regulated | people | Consequential right per run |
|---|---|---|---|---|---|
| 6A rules | 8/15 | 2/4 | 1/6 | 2/8 | 11 of 25 |
| Haiku 5.5 | 29/45 | 2/12 | 6/18 | 21/24 | 14, 12, 11 |
| Sonnet 5.5 | 30/45 | 3/12 | 2/18 | 21/24 | 11, 11, 13 |
| Opus 5.5 | 32/45 | 8/12 | 11/18 | 19/24 | 16, 16, 19 |

- No reader made a wrong fact marked Clear.
- Opus passed the gate in runs 1 and 3. Run 2 failed: `acts` at Likely on h01 ("Our HR assistant … sends each of them a welcome pack", where the label asks because "HR assistant" may be a person) and no question on h13's `regulated`.
- h01 `acts` at Likely is also Sonnet's miss in all three runs and Haiku's in two. Sonnet missed the `regulated` ask on h04 and h09 in every run.
- 6A's one wrong fact (h15 `regulated` at Likely, "clinic" read as healthcare) was made by no model.
- Every model still asks unneeded `acts` questions where the label is `no` (h07, h08, h11, h12).

## The runner

- `prompt.mjs`: the versioned prompt (`describe-v1`, effort medium, max_tokens 4000), the strict output schema (every object closed, every property required), and the reply checks. Items with an unknown field, a value outside the allowed list, or a quote that isn't word for word in the description are dropped and counted; an Unsure proposal becomes a question (decisions 3 and 6). One proposal per action from the model becomes one "what the AI does" fact with parts, the 6A shape.
- `runner.mjs`: reads each reviewed case, checks and scores it, applies the gate, three runs per model. A reply that stops early or isn't JSON counts as saying nothing, never as right.
- `run.mjs`:
  - `--estimate`: call count and cost.
  - `--dry-run`: the whole pipeline through a mock model (the 6A rules in the model's output shape). It reproduces the 6A baseline exactly and costs nothing.
  - `--live`: the paid run. The key comes from the shell only; it needs a hard cap, refuses a cap the month can't cover, keeps a ledger row current, and saves each finished run in `results/`.
- **Paid runs** go through the `model-run` workflow. Commit `agent/runs/request.json` as `{"eval": "describe", "models": [...], "repeat": 3, "budget": N}`; Paige adds the `run-models` label and approves the run in the `model-runs` environment, as for agent runs.

## Cost (estimate, prompt describe-v1, 60 cases × 3 runs)

| Model | Calls | Expected | Worst case |
|---|---|---|---|
| Haiku 5.5 | 180 | about $0.10 | $0.41 |
| Sonnet 5.5 | 180 | about $2.08 | $8.13 |
| Opus 5.5 | 180 | about $4.17 | $16.25 |
| All three | 540 | about $6.35 | $24.78 |

"Expected" assumes about 900 tokens out per reading (some thinking at medium effort, then the JSON). If thinking runs longer, the real cost is higher; the hard cap stops the run before it passes the cap. Worst case assumes every call writes the full 4,000 tokens.

## Prompt describe-v2 (draft, revised after Paige's review)

`prompt-v2.mjs` is a draft. It has not been run and isn't wired into the runner. `prompt.mjs` (describe-v1) and its results are unchanged, and the first held-out freeze still matches. Only the system prompt changes; the schema, settings (effort medium, max_tokens 4000) and reply checks are v1's.

The changes, and the describe-v1 failures each addresses. Tuned-set counts are summed over three runs of all three models unless a model is named; `h` cases are from the first held-out set, which is development data now.

| v2 rule | Change | Failure it addresses |
|---|---|---|
| 12 | When the AI only drafts, suggests, flags, looks up or answers, or a person acts, don't ask whether it also acts | Unneeded Acts questions where the label is `no`. On the tuned set: Opus 55 under score-v1, 36 under score-v2; Haiku 57 and 40; Sonnet 34 and 17. Examples: k09, k20, n06, n20, n36, h07, h12 |
| 16 | Keep who-acts questions apart from work-type questions: `about` is "Acts" for the first, the work type for the second. Work-type questions are still allowed | Measurement: score-v2 can only separate the two by `about` (see "Scorer versions") |
| 8 | A role title ("HR assistant", "pricing agent") may be a person: ask, don't propose Acts | h01 Acts at Likely (Sonnet 3/3 runs, Haiku 2/3, Opus 1/3, and the failure in Opus's run 2); n40 Acts at Clear (Sonnet 3/3, Haiku 1/3) |
| 10 | Acting under a condition is still acting | Acts asked when the label is `yes`: n07, n10, n13, n30 |
| 13 | What the AI is set up to do ("We want AI to…") is what it does; a negation covers only what it names | k01 asked in 9 of 9 runs; h10 |
| 9 | When the AI's own judgment triggers the action, propose Acts at Likely. "Automated isn't AI" is unchanged | n05 asked in 9 of 9 runs |
| 14 | A vague verb followed by the action ("takes care of booking", "decides which to approve") names that action. "Decides" is removed from the vague-verb list | n02 (8 of 9 runs) and n34 (9 of 9) asked when the label is `yes`. v1 rule 8 listed "decides" as vague, which conflicts with n34's label |
| 6, 7 | More acting verbs (blocks, locks, closes, files, submits, pauses, records). "The tool" usually names the AI and "the system" usually doesn't, but the rest of the description decides | n31 asked in 9 of 9 runs; h09 asked |
| 17 | Name the kinds of data that are sensitive | Sensitive data missed or asked when stated: n08, n25, n10, n17, h08, h09, h13 |
| 18 | Name the plainly regulated fields. Rule 18 comes first | Regulated asked or missed when stated: n08, n16, n17, n29, n34, h02, h08 |
| 19 | Otherwise, ask (don't propose) when decisions about people fall in an area that may be regulated: education, employment, housing, access to payments or accounts | Missed regulated asks: h04 and h09 (Sonnet 3/3 runs each), h13 (Opus run 2, Haiku and Sonnet 2/3) |
| 20 | If the text says nothing, propose nothing and don't ask. A denial is the writer's claim: propose nothing and don't ask, unless the description itself conflicts with it | Unneeded sensitive and regulated questions: k01, k10, k12, k16, n31, h15 |
| 21 | Where people enter: review, authorization, decisions, or a handoff to someone taking part in the workflow. A customer confirming a submission counts; merely receiving the finished service or message doesn't | People asked when the label is `yes`: n12, n33 (9 of 9 runs), h10, h14. Unneeded people questions: k01, k02, k16 |

**Paige's review (2026-11-08):**

- **Silence and denials (rule 20): accepted for this extraction step.** When a field isn't mentioned, the model doesn't ask about it. The field stays visibly missing; silence must not read as a completed safety review. A denial is accepted as the writer's claim unless the description itself contradicts it.
- **Role titles (rule 8): accepted.** This follows the settled rule on ambiguous actors.
- **"Tool" vs "system" (rule 7): kept provisionally.** It is the labelling convention, and context governs.
- **Regulated areas (rules 18–19): precedence is now stated.** Rule 18's fields, lending included, are proposed as facts. Rule 19's "access to credit" became "access to payments or accounts", so a lending decision is never both a fact and a question.
- **Work-type questions are not suppressed.** v1's rule 16 draft ("don't ask which work type fits") is withdrawn. Instead the model labels each question as being about who acts or about a work type.
- **Where people enter (rule 21): decided in the second review.** It means review, authorization, decisions, or a handoff to someone taking part in the workflow. Merely receiving the final service or message doesn't count: a customer confirming a submission counts, a client receiving a reminder doesn't. Every existing `people` label was checked against this, and none conflicts. Four `yes` labels rest on staff receiving the output as a handoff: h14 (the team's channel), g10 (the account owner), g14 (the class teacher) and g08 (the hiring manager's calendar).

**Second review (2026-11-08):**

- **Where people enter:** as in rule 21 above.
- **Gate scorer:** score-v2 with a manual audit of question classification (`AUDIT.md`). score-v1 stays as the historical comparison.
- **heldout-2 labels:** no scored-field changes.
- **Paraphrase tags:** 12 cases, each with a recorded reason.
- **The freeze covers more:** the scorer version and the audit policy are recorded alongside the labels, tags, rules and prompt.

**Before any v2 run:**

1. **Paige approves the freeze.** `node agent/describe-eval/freeze.mjs --set heldout-2 --show` prints what it would record. Freezing marks the 15 labels reviewed and writes the hashes.
2. **Paige approves the audit policy** (`AUDIT.md`, audit-v1). It is a draft, and its hash is part of the freeze.
3. **Wire `--prompt` and `--set heldout-2` into `run.mjs`, the runner and the model-run request (mechanical).** A heldout-2 run then refuses any prompt or scorer other than the frozen ones.
4. **After the run, the questions are audited blind** (`audit.mjs sheet`), then re-scored with the audit (`rescore.mjs --audit`). The gate result is the audited one.

A v2 result on the tuned set or the first held-out set is development evidence only. The comparison that counts is on `heldout-2`.

## Scorer versions

**For the gate: score-v2 with the question audit** (Paige, 2026-11-08). Each `aiActions` question is classified from its wording alone (`AUDIT.md`), blind to the label, the reader and the gate, the same way for 6A and every model. `audit.mjs sheet` writes the blind sheet; `rescore.mjs --audit <file>` applies it. The original readings are never edited, and classes are kept in their own file. Without an audit, score-v2 falls back to each reader's own `about` and is provisional. For scale: the saved 2026-11-08 readings hold 494 distinct questions on the tuned set and 156 on the first held-out set.

**score-v1** is the scorer every published result used. It is unchanged and still the default. It counts any question on `aiActions` (one about a work type too) as a question about Acts.

**score-v2** (`score.mjs`, `{ scorer: 'score-v2' }`) counts a question that names a work type (`about` is a work type other than Acts) as a work-type question. That question is reported on its own and doesn't count toward Acts. A question about Acts, or an open question with no work type named (6A's vague-verb questions), still counts.

`rescore.mjs` judges the saved readings again: 6A and every model, with no model calls. It first checks that score-v1 reproduces each saved report. The results are in `results/rescore-2026-11-08-score-v2.md` (tuned) and `results/rescore-2026-11-08-heldout-score-v2.md`. In summary:

- **6A is unchanged.** It never names a work type in a question.
- **Fields that become correct.** Unneeded Acts questions become correct: 17–19 per model on the tuned set, 5–10 on the first held-out set. Consequential fields right per run rise (Opus tuned 54/52/54 → 60/59/60; held-out 16/16/19 → 19/19/19).
- **No gate outcome changes.** No model passes on the tuned set under either scorer; Opus fails "better than 6A on paraphrase cases" (21–23 vs 28). On the held-out set Opus passes runs 1 and 3 under both.
- **The limit: score-v2 trusts the model's own `about`.** Some questions labelled with a work type do ask whether the AI acts. Sonnet asked on n09, labelled Classifies: "…or also judge whether the person is eligible?" Haiku asked on n35, labelled Drafts: "…send it itself?" Under score-v2 these become missed asks: n09 for Sonnet in 3 of 3 runs and Haiku in 1, n35 for Haiku in 2. So score-v2 undercounts some real Acts questions. That is why v2's rule 16 asks the model to label questions consistently. Separating the saved questions by hand, or by their text, are the other options.

## The second held-out set (`heldout-2.json`, draft)

Fifteen new descriptions, g01–g15, with **draft** labels. Nothing in it counts until Paige reviews the labels, and it is frozen before the first run, as the first set was.

The same rubric applies, including "automated isn't AI". Four cases are labelled `ask` for `regulated` (g01, g07, g09, g14); those calls need review most. g02's note is narrowed: "without anyone checking" means no review at that step, not that no person enters anywhere.

**Paraphrase tags (12, decided 2026-11-08; each case's reason is in `paraphraseReason`).** The gate's last check compares the model with 6A only on cases tagged `paraphrase`, so the tags define that subset. Without them the check compares 0 with 0 and always fails. The proposed criterion follows how the earlier sets used the tag: a consequential fact (who acts, sensitive data, regulated work) is stated in everyday or indirect wording rather than outright. Examples are a passive with no actor, a role title, an action phrased as an outcome, or a field named by its domain instead of by name. The tags were chosen from the wording alone, before any reader (6A or a model) was run on these cases:

- **Tagged (12):** g01, g03, g04, g05, g07, g08, g09, g10, g12, g13, g14, g15. g03 resolves "the agent" back to people. g07 and g12 establish sensitive or professional context indirectly; g12's injection tag doesn't exclude the paraphrase tag.
- **Not tagged (3):** g02 and g06 state the action and actor directly or are a future wish. g11's "locks the account" states the action outright; its difficulty is the scope of the negation.
- The five-case minimum in the freeze check only catches missing coverage. It doesn't show that the subset is well chosen.

**Caveat:** Claude wrote these after drafting v2, so the cases may lean toward situations v2's rules name: role titles (g03, g08, g13), conditions (g09), regulated areas, and an injection (g12). They are unseen by every reader, but having the same author as v2 limits how independent the test is. Paige may want to replace some or add her own.
