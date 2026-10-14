# AI assistance in Authority Lab

Authority Lab uses AI to reduce blank-page effort, improve focus and teach good decision-making. AI does not replace human accountability.

## AI may

- interpret a free-form Context description into proposed structured facts;
- ask relevant follow-up questions;
- explain concepts in plain language;
- show examples;
- suggest risk areas to consider;
- suggest boundary categories;
- suggest Requirement and Target types;
- suggest evidence sources;
- identify possible Coverage gaps;
- point out stale, narrow or conflicting evidence;
- summarize evidence;
- compare candidate models/configurations;
- organize information for a current Proposal or Decision;
- generate temporary decision-focused UI;
- suggest questions to ask stakeholders;
- flag material changes that may make prior Evidence less applicable;
- suggest possible residual-risk concerns after Boundaries and other controls are applied.

## AI may not

- silently set Risk;
- silently set or change Authority;
- silently establish Boundaries;
- choose thresholds without explicit human confirmation;
- assign the Owner;
- decide that evidence is sufficient when deterministic rules say otherwise;
- waive a Requirement;
- approve a Proposal;
- make a Decision;
- hide consequential failed, stale or insufficient evidence;
- bulk-apply consequential configuration;
- declare Residual Risk acceptable on behalf of the Owner;
- treat a manually documented Boundary as technically enforced without verification.

## Coverage assistance

Deterministic Coverage checks may include:
- source mapped;
- result present;
- minimum sample met;
- freshness met;
- required evidence type present.

AI-assisted Coverage review may additionally flag:
- missing high-risk scenarios;
- evidence that is too narrow;
- meaningful source disagreement;
- lack of production evidence;
- blind spots suggested by Context.

Every AI-generated suggestion should include:
- the reason;
- the evidence or context behind it;
- what the user can do next.

## Help

Help should support:
- Help off for experienced operators;
- guided inline explanations/examples;
- contextual ask-for-help assistance.

Help should teach the user why a choice matters without making the choice for them.

## Generative UI

Generative UI is a presentation layer only.

AI may choose what to prioritize, summarize or collapse for the current task. Deterministic product rules decide:
- permissions;
- authority state;
- thresholds;
- blocking conditions;
- approval requirements;
- evidence records;
- decision records.

Required consequential information can never be omitted by the generative layer.

## Model/provider behavior

Authority Lab should be provider-neutral by design.

The prototype may use Claude only. A real implementation may evaluate or use OpenAI, Anthropic, Google, Azure-hosted models, self-hosted models or specialized models.

Record provider/model/version as provenance where relevant. Model choice should be visible, explainable and testable rather than silently routed.

A stronger model is not automatically safer. Candidate models should be evaluated on the actual capability, including quality, high-severity failures, latency, cost and operational constraints.
