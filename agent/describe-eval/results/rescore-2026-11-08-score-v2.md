## Re-scored with score-v2 (tuned set, readings of 2026-11-08)

No model calls: the saved readings, judged again. score-v1 is the scorer the published results used.

| Reader | Scorer | acts | sensitive | regulated | people | Consequential right per run | Gate per run | Work-type questions per run |
|---|---|---|---|---|---|---|---|---|
| 6A rules | score-v1 | 56/60 | 8/11 | 12/14 | 29/29 | 76 | fail | — |
| 6A rules | score-v2 | 56/60 | 8/11 | 12/14 | 29/29 | 76 | fail | 0 |
| claude-haiku-5-5 | score-v1 | 99/180 | 10/33 | 25/42 | 71/87 | 45, 45, 44 | fail, fail, fail | — |
| claude-haiku-5-5 | score-v2 | 113/180 | 10/33 | 25/42 | 71/87 | 51, 48, 49 | fail, fail, fail | 19, 16, 20 |
| claude-opus-5-5 | score-v1 | 110/180 | 21/33 | 29/42 | 73/87 | 54, 52, 54 | fail, fail, fail | — |
| claude-opus-5-5 | score-v2 | 129/180 | 21/33 | 29/42 | 73/87 | 60, 59, 60 | fail, fail, fail | 21, 19, 19 |
| claude-sonnet-5-5 | score-v1 | 127/180 | 19/33 | 26/42 | 76/87 | 57, 59, 56 | fail, fail, fail | — |
| claude-sonnet-5-5 | score-v2 | 141/180 | 19/33 | 26/42 | 76/87 | 61, 63, 62 | fail, fail, fail | 18, 19, 17 |

**6A rules:** 0 field results changed.
- score-v2 gate, run 1: Better than 6A on paraphrase cases (28 correct vs 6A's 28)

**claude-haiku-5-5:** 20 field results changed.
- unneeded-question → correct: k04:acts (run 1), k15:acts (run 1), n03:acts (run 1), n11:acts (run 1), n16:acts (run 1), n25:acts (run 1), n33:acts (run 1), k15:acts (run 2), n03:acts (run 2), n16:acts (run 2), n33:acts (run 2), k04:acts (run 3), k15:acts (run 3), n08:acts (run 3), n11:acts (run 3), n16:acts (run 3), n33:acts (run 3)
- correct → missed-ask: n09:acts (run 1), n35:acts (run 2), n35:acts (run 3)
- score-v2 gate, run 1: No consequential fact marked Clear is wrong (n40:acts); Every consequential case labelled ambiguous is asked (n09:acts, n40:acts); No new wrong consequential fact compared with 6A (n40:acts); Better than 6A on paraphrase cases (16 correct vs 6A's 28)
- score-v2 gate, run 2: Every consequential case labelled ambiguous is asked (n35:acts); Better than 6A on paraphrase cases (16 correct vs 6A's 28)
- score-v2 gate, run 3: Every consequential case labelled ambiguous is asked (n35:acts); Better than 6A on paraphrase cases (18 correct vs 6A's 28)

**claude-opus-5-5:** 19 field results changed.
- unneeded-question → correct: k15:acts (run 1), n08:acts (run 1), n11:acts (run 1), n14:acts (run 1), n16:acts (run 1), n25:acts (run 1), k17:acts (run 2), n03:acts (run 2), n08:acts (run 2), n11:acts (run 2), n14:acts (run 2), n16:acts (run 2), n25:acts (run 2), n08:acts (run 3), n11:acts (run 3), n14:acts (run 3), n16:acts (run 3), n25:acts (run 3), n33:acts (run 3)
- score-v2 gate, run 1: Better than 6A on paraphrase cases (22 correct vs 6A's 28)
- score-v2 gate, run 2: Better than 6A on paraphrase cases (23 correct vs 6A's 28)
- score-v2 gate, run 3: Better than 6A on paraphrase cases (21 correct vs 6A's 28)

**claude-sonnet-5-5:** 20 field results changed.
- unneeded-question → correct: k15:acts (run 1), n08:acts (run 1), n16:acts (run 1), n20:acts (run 1), n33:acts (run 1), n03:acts (run 2), n08:acts (run 2), n11:acts (run 2), n16:acts (run 2), n20:acts (run 2), k15:acts (run 3), n03:acts (run 3), n08:acts (run 3), n11:acts (run 3), n16:acts (run 3), n20:acts (run 3), n33:acts (run 3)
- correct → missed-ask: n09:acts (run 1), n09:acts (run 2), n09:acts (run 3)
- score-v2 gate, run 1: No consequential fact marked Clear is wrong (n40:acts); Every consequential case labelled ambiguous is asked (n09:acts, n40:acts); No new wrong consequential fact compared with 6A (n40:acts); Better than 6A on paraphrase cases (20 correct vs 6A's 28)
- score-v2 gate, run 2: No consequential fact marked Clear is wrong (n40:acts); Every consequential case labelled ambiguous is asked (n09:acts, n40:acts); No new wrong consequential fact compared with 6A (n40:acts); Better than 6A on paraphrase cases (20 correct vs 6A's 28)
- score-v2 gate, run 3: No consequential fact marked Clear is wrong (n40:acts); Every consequential case labelled ambiguous is asked (n09:acts, n40:acts); No new wrong consequential fact compared with 6A (n40:acts); Better than 6A on paraphrase cases (19 correct vs 6A's 28)
