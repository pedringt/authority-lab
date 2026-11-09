## Re-scored with score-v2 and the question audit (heldout-2 set, readings of 2026-11-08)

No model calls: the saved readings, judged again. score-v1 is the scorer the published results used.

| Reader | Scorer | acts | sensitive | regulated | people | Consequential right per run | Gate per run | Work-type questions per run |
|---|---|---|---|---|---|---|---|---|
| 6A rules | score-v1 | 5/15 | 0/6 | 1/6 | 5/11 | 6 | fail | — |
| 6A rules | score-v2 | 5/15 | 0/6 | 1/6 | 5/11 | 6 | fail | 0 |
| claude-haiku-5-5 | score-v1 | 43/45 | 9/18 | 12/18 | 19/33 | 21, 21, 22 | fail, fail, fail | — |
| claude-haiku-5-5 | score-v2 | 44/45 | 9/18 | 12/18 | 19/33 | 22, 21, 22 | fail, fail, fail | 2, 0, 0 |
| claude-opus-5-5 | score-v1 | 41/45 | 14/18 | 16/18 | 21/33 | 24, 24, 23 | pass, fail, fail | — |
| claude-opus-5-5 | score-v2 | 41/45 | 14/18 | 16/18 | 21/33 | 24, 24, 23 | pass, fail, fail | 0, 0, 0 |
| claude-sonnet-5-5 | score-v1 | 45/45 | 10/18 | 12/18 | 20/33 | 22, 23, 22 | fail, fail, fail | — |
| claude-sonnet-5-5 | score-v2 | 45/45 | 10/18 | 12/18 | 20/33 | 22, 23, 22 | fail, fail, fail | 0, 0, 0 |

**6A rules:** 0 field results changed.
- score-v2 gate, run 1: No consequential fact marked Clear is wrong (g03:acts, g06:acts); No Acts where only a person acts or the action is negated (g03, g06); Every consequential case labelled ambiguous is asked (g01:regulated, g07:regulated, g08:acts, g09:regulated, g10:acts, g13:acts, g14:regulated); Better than 6A on paraphrase cases (5 correct vs 6A's 5)

**claude-haiku-5-5:** 1 field result changed.
- unneeded-question → correct: g06:acts (run 1)
- score-v2 gate, run 1: Every consequential case labelled ambiguous is asked (g09:regulated, g14:regulated)
- score-v2 gate, run 2: Every consequential case labelled ambiguous is asked (g09:regulated, g14:regulated)
- score-v2 gate, run 3: Every consequential case labelled ambiguous is asked (g09:regulated, g14:regulated)

**claude-opus-5-5:** 0 field results changed.
- score-v2 gate, run 2: Every consequential case labelled ambiguous is asked (g14:regulated)
- score-v2 gate, run 3: Every consequential case labelled ambiguous is asked (g14:regulated)

**claude-sonnet-5-5:** 0 field results changed.
- score-v2 gate, run 1: Every consequential case labelled ambiguous is asked (g09:regulated, g14:regulated)
- score-v2 gate, run 2: Every consequential case labelled ambiguous is asked (g09:regulated, g14:regulated)
- score-v2 gate, run 3: Every consequential case labelled ambiguous is asked (g09:regulated, g14:regulated)
