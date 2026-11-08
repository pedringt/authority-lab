# Question audit (policy audit-v1, draft for Paige's review)

The gate scores the 6B eval with **score-v2 plus a manual audit** (Paige, 2026-11-08). score-v2 counts a question about the kind of work apart from a question about whether the AI acts. A reader's own `about` tag isn't reliable enough to make that split: in the 2026-11-08 runs, Sonnet tagged a question about whether the AI decides eligibility as Classifies (n09), and Haiku tagged a question about whether the model sends the reply as Drafts (n35). So for the gate, a person classifies the questions from their wording.

## What is audited

Every question on `aiActions` asked by every reader in the run being judged: the 6A rules and each model, on every run. Everything goes through the same sheet and the same method.

## Blind

`audit.mjs sheet` writes the sheet. For each question it shows only:
- the question's wording;
- the words from the description that it quotes.

The sheet never shows:
- the case;
- the expected label;
- which reader asked it, or how many readers asked it;
- the reader's own `about` tag;
- the gate outcome.

Identical wording and quote appear once. Questions are listed in the order of their key, a hash, so the order says nothing about the reader or the case.

The auditor is Paige, or a reviewer given only the sheet. Claude drafted the prompt and has seen the labels and the results, so Claude doesn't audit.

## Classes

- **acts:** the question asks whether the AI itself does something to the world, or who does it. This includes a question that offers that as one possible answer ("does it send the reply itself, or does a person?", "does it decide eligibility or only extract details?"). It also includes an open question about what the AI does that the answer could settle either way ("What does the model do when it handles the first reply?").
- **work:** the question asks only which kind of work a task is, or how the AI does it (what it reads, which system it queries), and no answer it invites would say the AI acts.
- **other:** anything else.

## Records

- **Readings stay as they are.** The original readings and results are never edited.
- **Classes are kept separately,** in `results/audit-<date>[-<set>].json`, with the policy version, the auditor and the date.
- **The gate uses only a complete audit.** A question missing from the audit stops the score. Until an audit is complete, a run's score-v2 summary is provisional.
- **Changing these rules makes a new policy version.** It is recorded in the held-out freeze, so an audit made under another policy doesn't count for that set.
