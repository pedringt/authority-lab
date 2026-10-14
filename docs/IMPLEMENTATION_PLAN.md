# Authority Lab product reset: implementation plan

This plan turns the 2026-10-14 product reset into implementation work without discarding the useful mechanics already in the prototype.

## Read first

Before coding, read:

1. `CLAUDE.md` — repository working rules and governance invariants
2. `docs/HANDOFF.md` — current handoff and stop conditions
3. `docs/PRODUCT_MODEL.md` — the reset product model
4. `docs/PRODUCT_PRINCIPLES.md`
5. `docs/SETUP_FLOW.md`
6. `docs/V1_SCOPE.md`
7. `docs/TEMPLATES.md`
8. `docs/AI_ASSISTANCE.md`
9. `docs/GLOSSARY.md`
10. `docs/DECISIONS.md` — existing mechanics and historical decisions

Where the reset docs conflict with older interface/setup wording, the reset docs govern product direction. Existing safety/governance invariants in `CLAUDE.md` remain in force unless Paige explicitly changes them.

## Product goal

Authority Lab helps a person responsible for AI use in a domain they understand answer:

> What should this AI capability be allowed to do now, why, and what evidence would justify changing that authority later?

It should work for both:
- a small team with no enterprise governance/eval/observability stack; and
- a larger organization with integrations and formal approval policies.

The product is not becoming a general GRC, model inventory, observability or compliance-certification platform.

## What to preserve

Do not throw away working mechanics that already fit the reset:

- capability as the governed unit;
- explicit authority levels and one-level-at-a-time expansion;
- immutable decision/history records;
- human authorization;
- evidence ingestion, external evidence and manual evidence;
- evidence provenance;
- monitoring and automatic restriction;
- post-incident review;
- runtime gate/enforcement;
- waiting-for-a-person mechanics;
- approval separation and existing governance safeguards;
- expected-impact and rollout concepts;
- State as the first real client workspace.

The reset is primarily about making the product model, setup path and default experience match how a real operator would reason about authority.

## Terminology decisions

Use these user-facing terms:

- **Context**
- **Capability**
- **Authority**
- **Boundaries** — replaces the current primary user-facing label "Rules"
- **Risk**
- **Severity**
- **Likelihood**
- **Requirements** — replaces "Decision requirements" in ordinary UI
- **Targets**
- **Evidence**
- **Coverage**
- **Owner**
- **Reviewers**
- **Stakeholders**
- **Proposal**
- **Decision**
- **Monitor**
- **History**
- **Impact**

Formal/technical concepts may still use:
- **controls** — Boundaries and other mechanisms that reduce/manage Risk;
- **enforcement** — how software actually makes a Boundary real;
- **residual risk** — Risk remaining after controls.

Do not rename internal data structures merely for cosmetic consistency unless an implementation change requires it.

## Key reset rules

### Setup is user-shaped, not system-shaped

Desired conceptual setup:

Context
→ Starting point/template
→ Capability
→ Risk
→ Authority
→ Boundaries
→ Requirements
→ Targets where needed
→ Evidence
→ People
→ Review/confirm

The user should answer understandable questions. Authority Lab may assemble structured configuration underneath.

### Context is hybrid

Context begins with free-form description. AI may extract proposed structured facts and ask targeted follow-ups.

Consequential inferred facts must be explicitly confirmed before driving setup.

### Templates are scaffolding

Templates prefill questions, examples and structure, not consequential answers.

Consequential suggestions move through:
**Suggested → Reviewed → Confirmed**

No bulk acceptance for consequential AI-generated configuration.

### Capability is specific

A capability is one discrete thing AI is being asked to do.

If a description is too broad, AI may suggest splitting it into narrower capabilities, but a human confirms the split.

Capture whether the capability is:
- planned/pilot; or
- already in use.

### Existing capabilities need a baseline

For an existing capability capture:
- what it actually does today;
- current human involvement;
- current permissions/actions;
- current safeguards;
- current evidence;
- known issues/exceptions;
- declared authority vs effective/de facto authority where they differ.

Do not assume the documented policy matches actual operation.

### Risk is simple by default

Default surface:
- overall Risk;
- Severity;
- Likelihood, including **Unknown**;
- reversibility;
- scale.

Deeper consequence dimensions are optional drill-down.

Risk informs Authority. Authority is constrained by Boundaries. Together they define the operating envelope.

### Boundaries

User-facing categories:
- Allowed
- Needs human review
- Not allowed
- What must always stay human

Boundaries may be conditional.

Keep a distinction between:
- **documented Boundary**; and
- **technically verified/enforced Boundary**.

Never present a manually documented rule as technically enforced without evidence/integration.

### Requirements and Targets

**Requirements = what must be true.**

**Targets = measurable bars used to judge some Requirements.**

Targets are not universally required.

If a measurable requirement has no defensible threshold yet, support **Needs decision** rather than encouraging fake precision.

Keep distinct:
- Target;
- evidence/coverage rule;
- Result;
- Coverage.

### Evidence and Coverage

Authority Lab is eval-aware, not eval-centric.

Support:
- external evals;
- lightweight built-in test cases/evals;
- manual reviews;
- file uploads;
- production metrics;
- incidents;
- feedback;
- audits;
- pilot results.

Coverage sufficiency comes from explicit configured rules and deterministic completeness checks.

AI may flag likely blind spots, but it does not invent the sufficiency standard or override configured rules.

Unknown/not-enough evidence is neither Pass nor Fail.

### Small-team requirement

Every core workflow needs a native lightweight/manual path.

A small company must not need an enterprise GRC, data warehouse, observability platform, IAM suite or eval vendor to reach and record a defensible authority decision.

Integrations improve convenience, automation and confidence; they do not unlock the basic product.

### People and approval policy

Default mental model:
- one **Owner**;
- required **Reviewers**;
- optional **Stakeholders**.

Keep sophisticated approval rules underneath where useful.

Product principle:
> People are simple; approval rules can be sophisticated.

Do not expose enterprise rights machinery in the default setup unless the organization needs it.

### Proposal

A Proposal is one concrete proposed authority change.

It must answer:
- what changes;
- what becomes newly permitted;
- what still requires a person;
- what Boundaries remain;
- which Requirements/Targets are satisfied;
- Evidence and Coverage;
- disagreements/gaps;
- initial Risk and Residual Risk;
- expected Impact if available.

The Proposal is a frozen review object. If material evidence/configuration changes during review, surface that it may be stale and require refresh/replacement.

AI may suggest that a Proposal is worth considering. It must not silently create/approve an authority change.

### Decision

The Owner records the human Decision.

The decision surface should make before/after behavior concrete.

Capture:
- Proposal reviewed;
- Owner;
- required Reviewer input;
- Evidence/Coverage at decision time;
- Boundaries/controls;
- Residual Risk;
- outcome;
- short rationale;
- timestamp.

AI may prepare/summarize. It may not make the Decision.

### Monitor

Core question:
> Is the current Authority still justified?

Watch:
- new Evidence;
- Coverage changes;
- incidents/failures;
- Boundary stress/violations;
- reviewer disagreement;
- operational/Impact changes;
- material changes to model, prompt, tools, permissions, workflow, scope, users, data or jurisdiction.

A material change may make prior Evidence less applicable. Surface this explicitly.

Monitor never automatically expands or restores Authority.

### Reduction, pause and recovery

Increasing Authority requires evidence and approval.

Reducing or pausing Authority should be faster/easier.

Support:
- Reduce;
- Pause;
- Investigate;
- Restore via a new human Decision;
- Retire.

Authority is never automatically restored after metrics improve.

### Exceptions and overrides

Distinguish:
- normal operation;
- approved temporary exception;
- human override;
- blocked attempted violation.

Exceptions should be narrow and temporary by default.

Repeated exceptions should flag that the Boundary may not match real practice.

A human override cannot bypass a configured non-overridable/prohibited rule.

### Unknown and unresolved states

Support uncertainty explicitly:
- Unknown;
- Not enough evidence;
- Conflicting evidence;
- Not applicable;
- Needs decision.

Unknown must never silently count as Pass.

### Impact

Impact means business/operational value, not downside severity.

Impact may be optional at initial setup and more important during pilot/production review.

High Impact never overrides uncontrolled Risk or failed Requirements.

### Generative UI

Generative UI is a v1 requirement, but implement it only after deterministic data/model behavior is stable.

It may adapt presentation, prioritization, summaries and progressive disclosure.

It may not change:
- Authority;
- permissions;
- thresholds;
- approval rules;
- evidence records;
- blocking conditions;
- Decision records.

Consequential information must always surface when applicable.

## Implementation sequence

### Phase 1 — data-model and setup foundations

Goal: make the underlying model capable of representing the reset before redesigning the UI.

Add/adapt representation for:
- richer Context;
- planned vs existing capability;
- baseline/effective authority;
- Risk + Severity + Likelihood + reversibility + scale;
- Boundaries as the user-facing control model;
- Requirements independent of Targets;
- optional/unresolved Targets;
- Owner/Reviewer/Stakeholder model;
- material changes;
- residual risk.

Preserve existing records/evidence/decision mechanics.

No broad visual redesign in this phase.

### Phase 2 — setup flow

Build the user-shaped setup sequence.

Use deterministic placeholder assistance where model calls are unavailable in the static app. Do not quietly turn seeded/simulated suggestions into claims of live AI.

Keep every consequential suggestion individually reviewable.

### Phase 3 — lightweight evidence path

Ensure every evidence/governance workflow works without enterprise integrations:
- basic built-in test cases/evals;
- manual review;
- uploads/imports;
- manual incidents;
- manual monitoring result;
- reviewer input;
- manual Impact.

Reuse existing external-evidence and manual-evidence machinery.

### Phase 4 — Proposal and Decision

Adapt the existing decision flow to the reset:
- concrete before/after behavior;
- residual risk;
- reviewer disagreement;
- frozen proposal snapshot;
- stale-proposal handling after material change.

Preserve immutable records and existing authorization invariants.

### Phase 5 — Monitor and lifecycle edges

Center Monitor on current Authority justification.

Add:
- material-change revalidation;
- reduce/pause/investigate/restore/retire;
- exception/override records;
- repeated-exception signals;
- consistent unresolved states.

### Phase 6 — generative/adaptive UI

Only after deterministic behavior is stable.

Build a presentation layer that prioritizes what matters now, always exposes consequential states and always offers the full record.

### Phase 7 — visual redesign

Do last.

Do not reuse the previously rejected State-like mock directions. Revisit hierarchy and visual language after the information architecture is stable.

## Parked work

Do not pull these into the reset unless Paige explicitly reopens them:

- Question Investigator;
- additional agent/runtime expansion beyond what is needed to preserve current enforcement;
- broad enterprise AI inventory/GRC features;
- compliance certification;
- vendor-risk platform;
- model-inventory platform;
- deep observability replacement;
- additional visual redesign before the model/setup work.

## Reality checks

Use both of these when evaluating each phase:

### State
The first real client workspace. Changes must still make sense for a real capability whose evidence comes from another system.

### Small team
Imagine a small professional-services firm with no dedicated AI governance/eval/observability stack. The same decision model must remain usable through manual/lightweight paths.

## Stop conditions for Claude Code

Stop and ask Paige before:
- making a new product decision not captured in these docs;
- weakening/reinterpreting an existing governance invariant;
- choosing between materially different UX models;
- expanding scope into parked work;
- making paid model calls;
- changing destination/promotion behavior.

Do not treat a plausible answer as authorization to decide it yourself.

## Promotion

Follow `CLAUDE.md`.

Implementation approval is not approval to merge to `main`, deploy, or publish. Paige must explicitly name the destination for every promotion.
