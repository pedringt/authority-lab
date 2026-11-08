## 6B description-reading eval

Prompt describe-v1, effort medium, max_tokens 4000. Reviewed cases: 15. Cap: $5.00.

| Model | Run | Gate | Wrong at Clear | Wrong at Likely | Consequential right | Missed asks | Dropped (quotes) | Unusable | Cost | Per reading | p50 / p95 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| claude-haiku-5-5 | 1 | fail | 0 | 0 | 14 | 2 | 0 (0) | 0 | $0.0136 | $0.0009 | 6073 / 9425 ms |
| claude-haiku-5-5 | 2 | fail | 0 | 1 | 12 | 1 | 2 (0) | 0 | $0.0141 | $0.0009 | 6508 / 10277 ms |
| claude-haiku-5-5 | 3 | fail | 0 | 1 | 11 | 2 | 1 (0) | 0 | $0.0139 | $0.0009 | 7250 / 9947 ms |
| claude-sonnet-5-5 | 1 | fail | 0 | 1 | 11 | 2 | 0 (0) | 0 | $0.1446 | $0.0096 | 4158 / 5777 ms |
| claude-sonnet-5-5 | 2 | fail | 0 | 1 | 11 | 3 | 0 (0) | 0 | $0.1431 | $0.0095 | 3967 / 6281 ms |
| claude-sonnet-5-5 | 3 | fail | 0 | 1 | 13 | 3 | 1 (0) | 0 | $0.1435 | $0.0096 | 4415 / 5971 ms |
| claude-opus-5-5 | 1 | pass | 0 | 0 | 16 | 0 | 0 (0) | 0 | $0.4249 | $0.0283 | 9111 / 12643 ms |
| claude-opus-5-5 | 2 | fail | 0 | 1 | 16 | 1 | 0 (0) | 0 | $0.4136 | $0.0276 | 8569 / 12069 ms |
| claude-opus-5-5 | 3 | pass | 0 | 0 | 19 | 0 | 0 (0) | 0 | $0.4156 | $0.0277 | 8722 / 11631 ms |

**claude-haiku-5-5: does not pass**.
- Every consequential case labelled ambiguous is asked: h09:regulated, h13:regulated
- Better than 6A on paraphrase cases: 3 correct vs 6A's 3
- Every consequential case labelled ambiguous is asked: h01:acts, h13:regulated
- No new wrong consequential fact compared with 6A: h01:acts
- Better than 6A on paraphrase cases: 2 correct vs 6A's 3
- Every consequential case labelled ambiguous is asked: h01:acts, h04:regulated, h09:regulated

**claude-sonnet-5-5: does not pass**.
- Every consequential case labelled ambiguous is asked: h01:acts, h04:regulated, h09:regulated
- No new wrong consequential fact compared with 6A: h01:acts
- Better than 6A on paraphrase cases: 2 correct vs 6A's 3
- Every consequential case labelled ambiguous is asked: h01:acts, h04:regulated, h09:regulated, h13:regulated
- Better than 6A on paraphrase cases: 3 correct vs 6A's 3

**claude-opus-5-5: does not pass**.
- Every consequential case labelled ambiguous is asked: h01:acts, h13:regulated
- No new wrong consequential fact compared with 6A: h01:acts
- Better than 6A on paraphrase cases: 3 correct vs 6A's 3

