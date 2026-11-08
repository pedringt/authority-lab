## 6B description-reading eval

Prompt describe-v2, effort medium, max_tokens 4000, set heldout-2. Scorer score-v2. Reviewed cases: 15. Cap: $7.00.

**Provisional:** score-v2 here uses each reader's own `about` tag. The gate result counts only after the blind question audit (AUDIT.md) and `rescore.mjs --audit`.

| Model | Run | Gate | Wrong at Clear | Wrong at Likely | Consequential right | Missed asks | Dropped (quotes) | Unusable | Cost | Per reading | p50 / p95 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| claude-haiku-5-5 | 1 | fail | 1 | 0 | 21 | 2 | 0 (0) | 0 | $0.0142 | $0.0009 | 6472 / 9195 ms |
| claude-haiku-5-5 | 2 | fail | 1 | 0 | 21 | 2 | 1 (0) | 0 | $0.0148 | $0.0010 | 6539 / 8966 ms |
| claude-haiku-5-5 | 3 | fail | 0 | 0 | 22 | 2 | 0 (0) | 0 | $0.0137 | $0.0009 | 5235 / 9094 ms |
| claude-sonnet-5-5 | 1 | fail | 0 | 0 | 22 | 2 | 0 (0) | 0 | $0.1593 | $0.0106 | 2934 / 4468 ms |
| claude-sonnet-5-5 | 2 | fail | 1 | 0 | 23 | 2 | 0 (0) | 0 | $0.1640 | $0.0109 | 3127 / 4324 ms |
| claude-sonnet-5-5 | 3 | fail | 0 | 0 | 22 | 2 | 1 (0) | 0 | $0.1563 | $0.0104 | 2904 / 3926 ms |
| claude-opus-5-5 | 1 | pass | 0 | 0 | 24 | 0 | 0 (0) | 0 | $0.4666 | $0.0311 | 8835 / 11126 ms |
| claude-opus-5-5 | 2 | fail | 0 | 0 | 24 | 1 | 0 (0) | 0 | $0.4587 | $0.0306 | 8550 / 10239 ms |
| claude-opus-5-5 | 3 | fail | 0 | 0 | 23 | 1 | 1 (0) | 0 | $0.4617 | $0.0308 | 9388 / 10625 ms |

**claude-haiku-5-5: does not pass**.
- Every consequential case labelled ambiguous is asked: g09:regulated, g14:regulated

**claude-sonnet-5-5: does not pass**.
- Every consequential case labelled ambiguous is asked: g09:regulated, g14:regulated

**claude-opus-5-5: does not pass**.
- Every consequential case labelled ambiguous is asked: g14:regulated

