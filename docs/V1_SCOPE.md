# Authority Lab v1 scope

Reconciled with what ships on 2026-11-09 (Paige). The decisions, the remaining work and its acceptance criteria are in `docs/V1_RECONCILIATION.md`.

## Required during initial setup

- Context
- Capability
- Owner
- Risk
- Authority
- Boundaries
- Requirements

Targets are required where a Requirement is meaningfully measurable. A Target may stay undecided until a Requirement that depends on it needs a bar.

## Required before increasing Authority

- relevant Targets;
- Evidence;
- sufficient Coverage (deterministic; evidence age blocks only when a configured Requirement makes recency mandatory);
- required Reviewers, if configured;
- a specific Proposal.

## Required to change Authority

- explicit human Decision by the Owner;
- all deterministic approval rules satisfied.

## Ongoing after a Decision

- Monitor;
- History;
- new Evidence and Coverage;
- future Proposals and Decisions.

## Optional / can come later in the workflow

- Impact tracking;
- additional Stakeholders;
- advanced technical detail;
- detailed model comparisons;
- framework/compliance packs;
- specialized monitoring beyond the core safety/quality signals.

## v1 includes

- guided self-service and expert-led use;
- templates plus Start from scratch;
- Help/guidance: "How this works" on each screen, plus a line on why it matters and an example at each consequential choice;
- rule-based Coverage suggestions, each labelled with its basis (model assistance is deferred);
- a rule-based adaptive presentation for focus and clarity;
- deterministic authority rules;
- human-confirmed consequential configuration;
- provider-neutral data model;
- technical drill-down;
- plain-language presentation layer;
- native lightweight/manual paths for core evidence, incidents, monitoring, reviewer input and Impact tracking;
- lightweight built-in eval configuration plus manual/file/external evidence paths;
- residual-risk review during Proposal/Decision;
- material-change review: the Owner records whether each affected piece of Evidence is still, partly or no longer applicable; unreviewed affected Evidence doesn't count and blocks expansion, and the original Evidence stays in History.

## Adaptive presentation in v1

The presentation is rule-based in v1. It may:
- prioritize relevant evidence;
- emphasize warnings;
- collapse less relevant supporting detail;
- choose which controls/actions to surface prominently;
- summarize the current decision in plain language.

It must always surface, when applicable:
- current Authority;
- proposed Authority change;
- failed high-severity checks;
- stale or insufficient evidence that affects the decision;
- stakeholder/reviewer disagreement;
- anything blocking a change;
- what still requires a human;
- what remains prohibited.

A full-record path must always be available.

## Deliberately out of v1

- model-assisted features (Context intake, Coverage suggestions, generated presentation): Phase 6B is paused;
- the Phase 7 visual redesign;
- automatic material-change detection, or invalidating Evidence by change category;
- full regulatory compliance certification;
- enterprise-wide shadow-AI discovery;
- universal automatic enforcement across external systems;
- full identity/access management;
- full security-scanning or red-team platform;
- model inventory management;
- vendor-risk management;
- automated legal/compliance conclusions;
- organization-wide policy authoring;
- giant enterprise risk registers;
- replacing dedicated enterprise evaluation, observability, GRC or AI-inventory platforms.

Authority Lab's job remains narrow: help people decide what an AI capability should be allowed to do, understand why, and revisit that decision as evidence changes.
