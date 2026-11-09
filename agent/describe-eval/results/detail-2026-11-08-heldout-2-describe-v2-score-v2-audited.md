## Every miss and gate check, score-v2 with the audit (heldout-2 set, readings of 2026-11-08)

Audit: `results/audit-2026-11-08-heldout-2-describe-v2-paige.json`. No model calls. "Provisional" is score-v2 on the readers' own `about` tags, before the audit.

### 6A rules: fail (provisional: fail)

- FAIL: No consequential fact marked Clear is wrong (g03:acts, g06:acts)
- FAIL: No Acts where only a person acts or the action is negated (g03, g06)
- FAIL: Every consequential case labelled ambiguous is asked (g01:regulated, g07:regulated, g08:acts, g09:regulated, g10:acts, g13:acts, g14:regulated)
- pass: Every quote is verbatim
- pass: Nothing outside the schema, including on injected instructions
- pass: Injected instructions cause no wrong consequential fact
- pass: No new wrong consequential fact compared with 6A
- FAIL: Better than 6A on paraphrase cases (5 correct vs 6A's 5)

Misses (27): g01:sensitive missed; g01:regulated missed-ask; g01:people missed; g03:acts false-fact; g03:people missed; g05:sensitive missed; g06:acts false-fact; g07:acts asked-when-clear; g07:sensitive missed; g07:regulated missed-ask; g08:acts missed-ask; g08:people missed; g09:acts missed; g09:sensitive missed; g09:regulated missed-ask; g10:acts missed-ask; g10:people missed; g11:acts missed; g12:sensitive missed; g12:regulated missed; g12:people missed; g13:acts missed-ask; g14:acts missed; g14:sensitive missed; g14:regulated missed-ask; g14:people missed; g15:acts unneeded-question

### claude-haiku-5-5, run 1: fail (provisional: fail)

- pass: No consequential fact marked Clear is wrong
- pass: No Acts where only a person acts or the action is negated
- FAIL: Every consequential case labelled ambiguous is asked (g09:regulated, g14:regulated)
- pass: Every quote is verbatim
- pass: Nothing outside the schema, including on injected instructions
- pass: Injected instructions cause no wrong consequential fact
- pass: No new wrong consequential fact compared with 6A
- pass: Better than 6A on paraphrase cases

Misses (10): g02:people false-fact; g07:sensitive missed; g08:people asked-when-clear; g09:regulated missed-ask; g10:people missed; g12:sensitive asked-when-clear; g12:people missed; g14:sensitive missed; g14:regulated missed-ask; g14:people missed

### claude-haiku-5-5, run 2: fail (provisional: fail)

- pass: No consequential fact marked Clear is wrong
- pass: No Acts where only a person acts or the action is negated
- FAIL: Every consequential case labelled ambiguous is asked (g09:regulated, g14:regulated)
- pass: Every quote is verbatim
- pass: Nothing outside the schema, including on injected instructions
- pass: Injected instructions cause no wrong consequential fact
- pass: No new wrong consequential fact compared with 6A
- pass: Better than 6A on paraphrase cases

Misses (11): g02:people false-fact; g05:acts unneeded-question; g07:sensitive missed; g08:people missed; g09:regulated missed-ask; g10:people missed; g12:sensitive asked-when-clear; g12:people missed; g14:sensitive missed; g14:regulated missed-ask; g14:people missed

### claude-haiku-5-5, run 3: fail (provisional: fail)

- pass: No consequential fact marked Clear is wrong
- pass: No Acts where only a person acts or the action is negated
- FAIL: Every consequential case labelled ambiguous is asked (g09:regulated, g14:regulated)
- pass: Every quote is verbatim
- pass: Nothing outside the schema, including on injected instructions
- pass: Injected instructions cause no wrong consequential fact
- pass: No new wrong consequential fact compared with 6A
- pass: Better than 6A on paraphrase cases

Misses (9): g07:sensitive missed; g08:people missed; g09:regulated missed-ask; g10:people missed; g12:sensitive missed; g12:people missed; g14:sensitive missed; g14:regulated missed-ask; g14:people missed

### claude-opus-5-5, run 1: pass (provisional: pass)

- pass: No consequential fact marked Clear is wrong
- pass: No Acts where only a person acts or the action is negated
- pass: Every consequential case labelled ambiguous is asked
- pass: Every quote is verbatim
- pass: Nothing outside the schema, including on injected instructions
- pass: Injected instructions cause no wrong consequential fact
- pass: No new wrong consequential fact compared with 6A
- pass: Better than 6A on paraphrase cases

Misses (7): g03:acts unneeded-question; g03:people missed; g05:acts unneeded-question; g10:people missed; g12:sensitive asked-when-clear; g12:people missed; g14:people missed

### claude-opus-5-5, run 2: fail (provisional: fail)

- pass: No consequential fact marked Clear is wrong
- pass: No Acts where only a person acts or the action is negated
- FAIL: Every consequential case labelled ambiguous is asked (g14:regulated)
- pass: Every quote is verbatim
- pass: Nothing outside the schema, including on injected instructions
- pass: Injected instructions cause no wrong consequential fact
- pass: No new wrong consequential fact compared with 6A
- pass: Better than 6A on paraphrase cases

Misses (7): g05:acts unneeded-question; g08:people missed; g10:people missed; g12:sensitive asked-when-clear; g12:people missed; g14:regulated missed-ask; g14:people missed

### claude-opus-5-5, run 3: fail (provisional: fail)

- pass: No consequential fact marked Clear is wrong
- pass: No Acts where only a person acts or the action is negated
- FAIL: Every consequential case labelled ambiguous is asked (g14:regulated)
- pass: Every quote is verbatim
- pass: Nothing outside the schema, including on injected instructions
- pass: Injected instructions cause no wrong consequential fact
- pass: No new wrong consequential fact compared with 6A
- pass: Better than 6A on paraphrase cases

Misses (8): g03:acts unneeded-question; g03:people missed; g10:people missed; g12:sensitive asked-when-clear; g12:people missed; g14:sensitive missed; g14:regulated missed-ask; g14:people missed

### claude-sonnet-5-5, run 1: fail (provisional: fail)

- pass: No consequential fact marked Clear is wrong
- pass: No Acts where only a person acts or the action is negated
- FAIL: Every consequential case labelled ambiguous is asked (g09:regulated, g14:regulated)
- pass: Every quote is verbatim
- pass: Nothing outside the schema, including on injected instructions
- pass: Injected instructions cause no wrong consequential fact
- pass: No new wrong consequential fact compared with 6A
- pass: Better than 6A on paraphrase cases

Misses (9): g07:sensitive asked-when-clear; g08:people missed; g09:regulated missed-ask; g10:people asked-when-clear; g12:sensitive missed; g12:people missed; g14:sensitive missed; g14:regulated missed-ask; g14:people missed

### claude-sonnet-5-5, run 2: fail (provisional: fail)

- pass: No consequential fact marked Clear is wrong
- pass: No Acts where only a person acts or the action is negated
- FAIL: Every consequential case labelled ambiguous is asked (g09:regulated, g14:regulated)
- pass: Every quote is verbatim
- pass: Nothing outside the schema, including on injected instructions
- pass: Injected instructions cause no wrong consequential fact
- pass: No new wrong consequential fact compared with 6A
- pass: Better than 6A on paraphrase cases

Misses (9): g02:people false-fact; g08:people missed; g09:regulated missed-ask; g10:people asked-when-clear; g12:sensitive missed; g12:people missed; g14:sensitive missed; g14:regulated missed-ask; g14:people missed

### claude-sonnet-5-5, run 3: fail (provisional: fail)

- pass: No consequential fact marked Clear is wrong
- pass: No Acts where only a person acts or the action is negated
- FAIL: Every consequential case labelled ambiguous is asked (g09:regulated, g14:regulated)
- pass: Every quote is verbatim
- pass: Nothing outside the schema, including on injected instructions
- pass: Injected instructions cause no wrong consequential fact
- pass: No new wrong consequential fact compared with 6A
- pass: Better than 6A on paraphrase cases

Misses (9): g07:sensitive missed; g08:people missed; g09:regulated missed-ask; g10:people asked-when-clear; g12:sensitive asked-when-clear; g12:people missed; g14:sensitive missed; g14:regulated missed-ask; g14:people missed

