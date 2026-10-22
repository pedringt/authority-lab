# 6B eval: reading a Context description

The gate for the first model use in 6B (Paige, 2026-10-22, decision 10 in `docs/DECISIONS.md`, "Phase 6B boundaries"). A model is chosen, and the live endpoint built, only if a model passes this eval. If no model passes, 6B doesn't ship for this surface, and that is a valid outcome.

## What's here

- `cases.json`: the gold set. Each case is a description and, per field, what a careful reader does. Every case starts as `"label": "draft"`. **A case counts only once Paige has reviewed its label** (`"label": "reviewed"`). Labels are product judgment.
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

## The set (draft, 60 cases)

- **20 known cases** (`k01`–`k20`): every failure 6A struggled with, including the three production walk sentences, nouns read as verbs, negations, unclear actors, "confidential client tax records" and "tax advice".
- **40 new cases** (`n01`–`n40`): paraphrases the rules miss, vague verbs, conditionals, contradictions, injected instructions, long multi-capability descriptions, and sensitive or regulated work described in other words.

## 6A baseline on the draft set

The rules get every known case right; their only extras are acceptable questions. On the new cases they:
- miss 28 facts;
- miss 4 questions;
- give one over-confident `acts` fact: `n24`, a contradiction, read at Likely instead of asked.

They give no wrong fact marked Clear. Two did (`n15`, a future wish read as current; `n39`, "published by our merchandising lead") until #173 fixed the rules. The remaining limits are recorded in the tests so a change is noticed. A model must not add wrong consequential facts of its own (gate check 7).

## Not built yet

The model runner waits for the labels to be reviewed. Planned:
- **Where:** in this folder, run through `run.mjs` conventions and the `model-run` workflow, with Paige's approval for each run and a row in `runs/ledger.md`.
- **Requests:** structured outputs with the 6A schema (decision 3), the prompt versioned, three runs per model, and Haiku 5.5, Sonnet 5.5 and Opus 5.5 compared.
- **Cost:** one pass of 60 cases on all three models is roughly $1–5 per run, so $3–15 for three runs. That's an estimate: dry-run and cap first. It counts against the $25 a month for `agent/` runs.
