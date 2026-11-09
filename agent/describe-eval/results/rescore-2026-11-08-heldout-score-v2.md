## Re-scored with score-v2 (heldout set, readings of 2026-11-08)

No model calls: the saved readings, judged again. score-v1 is the scorer the published results used. Without an audit, score-v2 relies on each reader's own `about` tag: provisional.

| Reader | Scorer | acts | sensitive | regulated | people | Consequential right per run | Gate per run | Work-type questions per run |
|---|---|---|---|---|---|---|---|---|
| 6A rules | score-v1 | 8/15 | 2/4 | 1/6 | 2/8 | 11 | fail | — |
| 6A rules | score-v2 | 8/15 | 2/4 | 1/6 | 2/8 | 11 | fail | 0 |
| claude-haiku-5-5 | score-v1 | 29/45 | 2/12 | 6/18 | 21/24 | 14, 12, 11 | fail, fail, fail | — |
| claude-haiku-5-5 | score-v2 | 34/45 | 2/12 | 6/18 | 21/24 | 15, 14, 13 | fail, fail, fail | 5, 9, 9 |
| claude-opus-5-5 | score-v1 | 32/45 | 8/12 | 11/18 | 19/24 | 16, 16, 19 | pass, fail, pass | — |
| claude-opus-5-5 | score-v2 | 38/45 | 8/12 | 11/18 | 19/24 | 19, 19, 19 | pass, fail, pass | 9, 10, 6 |
| claude-sonnet-5-5 | score-v1 | 30/45 | 3/12 | 2/18 | 21/24 | 11, 11, 13 | fail, fail, fail | — |
| claude-sonnet-5-5 | score-v2 | 40/45 | 3/12 | 2/18 | 21/24 | 16, 15, 14 | fail, fail, fail | 15, 11, 9 |

**6A rules:** 0 field results changed.
- score-v2 gate, run 1: Every consequential case labelled ambiguous is asked (h04:regulated, h05:acts, h09:regulated, h13:regulated); Better than 6A on paraphrase cases (3 correct vs 6A's 3)

**claude-haiku-5-5:** 5 field results changed.
- unneeded-question → correct: h12:acts (run 1), h04:acts (run 2), h11:acts (run 2), h08:acts (run 3), h11:acts (run 3)
- score-v2 gate, run 1: Every consequential case labelled ambiguous is asked (h09:regulated, h13:regulated); Better than 6A on paraphrase cases (3 correct vs 6A's 3)
- score-v2 gate, run 2: Every consequential case labelled ambiguous is asked (h01:acts, h13:regulated); No new wrong consequential fact compared with 6A (h01:acts); Better than 6A on paraphrase cases (3 correct vs 6A's 3)
- score-v2 gate, run 3: Every consequential case labelled ambiguous is asked (h01:acts, h04:regulated, h09:regulated); No new wrong consequential fact compared with 6A (h01:acts)

**claude-opus-5-5:** 6 field results changed.
- unneeded-question → correct: h02:acts (run 1), h08:acts (run 1), h11:acts (run 1), h08:acts (run 2), h11:acts (run 2), h12:acts (run 2)
- score-v2 gate, run 2: Every consequential case labelled ambiguous is asked (h01:acts, h13:regulated); No new wrong consequential fact compared with 6A (h01:acts)

**claude-sonnet-5-5:** 10 field results changed.
- unneeded-question → correct: h02:acts (run 1), h07:acts (run 1), h08:acts (run 1), h11:acts (run 1), h12:acts (run 1), h07:acts (run 2), h08:acts (run 2), h11:acts (run 2), h12:acts (run 2), h11:acts (run 3)
- score-v2 gate, run 1: Every consequential case labelled ambiguous is asked (h01:acts, h04:regulated, h09:regulated); No new wrong consequential fact compared with 6A (h01:acts)
- score-v2 gate, run 2: Every consequential case labelled ambiguous is asked (h01:acts, h04:regulated, h09:regulated, h13:regulated); No new wrong consequential fact compared with 6A (h01:acts)
- score-v2 gate, run 3: Every consequential case labelled ambiguous is asked (h01:acts, h04:regulated, h09:regulated, h13:regulated); No new wrong consequential fact compared with 6A (h01:acts)
