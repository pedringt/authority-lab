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
