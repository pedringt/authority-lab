# Handoff: Authority Lab product reset (started 2026-10-14; updated 2026-10-21)

## Read this first

Authority Lab is in a **product reset**, not a code reset.

The existing implementation contains useful governance/evidence/enforcement mechanics. Do not throw them away or start a visual rewrite.

Read in this order:

1. `CLAUDE.md` — non-negotiable working rules and governance invariants.
2. `docs/PRODUCT_MODEL.md`
3. `docs/PRODUCT_PRINCIPLES.md`
4. `docs/SETUP_FLOW.md`
5. `docs/V1_SCOPE.md`
6. `docs/TEMPLATES.md`
7. `docs/AI_ASSISTANCE.md`
8. `docs/GLOSSARY.md`
9. `docs/IMPLEMENTATION_PLAN.md`
10. `docs/DECISIONS.md` — existing mechanics/history.

Then inspect the repo/current PR state before coding.

## Why this reset happened

The prototype accumulated useful mechanics, but the product experience got ahead of Paige's product understanding. The reset reconstructs Authority Lab from the outside in.

The central job is now explicit:

> Help a person responsible for AI use in a domain they understand decide what an AI capability should be allowed to do now, why, and what evidence would justify changing that authority later.

AI/Claude may build mechanics, explain tradeoffs and suggest options. **Product decisions belong to Paige unless explicitly delegated.**

Do not silently fill in consequential setup choices because the answer looks obvious.

## Current product direction

Authority Lab should support:
- product people and AI consultants;
- client-side/domain experts who may not be AI experts;
- engineers when they are the accountable operator;
- small teams with little/no enterprise infrastructure;
- larger organizations with integrations and formal approval rules.

It should support both guided self-service and expert-led use.

The product must create value for a one-time pilot and continue to work for ongoing production use.

## Core lifecycle

Context
→ Capability
→ Risk
→ Authority
→ Boundaries
→ Requirements + Targets where needed
→ Evidence + Coverage
→ People
→ Proposal
→ Decision
→ Monitor
→ History / Impact
→ new Proposal/Decision when conditions change

Existing capabilities also need a baseline of what is actually happening today.

## Important terminology changes

Use in ordinary user-facing product language:
- **Boundaries**, not Rules as the main section/concept.
- **Requirements**, not Decision requirements.
- Targets only where a measurable bar is appropriate.
- Owner / Reviewers / Stakeholders as the simple people model.

Formal concepts such as controls, residual risk and enforcement can appear in deeper/technical layers.

Do not rename internal fields only for cosmetic consistency.

## What stays

Preserve and reuse:
- capability-level governance;
- existing authority ladder and one-level expansion rule;
- immutable records;
- human authorization;
- external/manual evidence;
- provenance;
- monitoring and restriction;
- post-incident review;
- gate/enforcement;
- waiting-for-person mechanics;
- approval safeguards;
- State workspace;
- expected-impact and rollout mechanics where they still fit.

## What changes

Primary reset work:
- richer hybrid Context intake;
- planned vs existing path;
- baseline/effective authority;
- simpler default Risk model;
- Boundaries as user-facing controls;
- Requirements separate from optional Targets;
- explicit Coverage semantics;
- simpler People surface with approval-policy rigor underneath;
- Proposal/Decision centered on exact authority change and residual risk;
- Monitor centered on whether current Authority remains justified;
- material-change revalidation;
- lightweight/manual paths for small organizations;
- consistent Unknown/unresolved states;
- exceptions/overrides/retirement;
- generative UI later as presentation only.

## What is parked

Do not work on these during the reset unless Paige explicitly reopens them:
- Question Investigator;
- additional agent/runtime expansion;
- broad GRC/inventory/compliance-platform features;
- more visual redesign;
- previously explored State-like redesign directions.

## Design status

**Visual redesign is paused.**

Earlier design artifacts and redesign notes in old handoffs/DECISIONS are historical context, not a current instruction to implement a visual target.

Do not start from old mockups.

The information architecture and product model must stabilize first.

## Where the phases stand

- **Phase 1 — data model (#137): done.** Merged to `main` in #138 (2026-10-16). Paige's answers and the follow-up notes are in `docs/DECISIONS.md` under "Product reset, Phase 1". Treat them as settled.
- **Phase 2 — setup flow (#139): done.** Merged to `main` in #141. Paige's answers (2026-10-16) are in `docs/DECISIONS.md` under "Product reset, Phase 2".
- **Phase 3 — lightweight evidence path (#142): done.** Merged to `main` in #143. Paige's answers P1–P8 are in `docs/DECISIONS.md` under "Product reset, Phase 3", with the implementation calls listed there.
- **Phase 4 — Proposal and Decision (#144): done.** Merged to `main` in #145 (1b1cabf, 2026-10-19) and smoke-tested on production. Paige's answers Q1–Q5 are in `docs/DECISIONS.md` under "Product reset, Phase 4".
- **Phase 5 — Monitor and lifecycle (#147): done.** Merged to `main` in #148 (6f4f6f6) and smoke-tested on production. Paige's answers Q1–Q9 (2026-10-19) are in `docs/DECISIONS.md` under "Product reset, Phase 5".
- **Deep review and remediation (2026-10-20).** Paige's decisions D1–D8 and mechanics R1–R6 are in `docs/DECISIONS.md` under "Remediation after the deep review". Four PRs, one at a time, each reviewed before the next: **PR 1** authority and trust (#149) — merged in #150 (3f2766b) and live; **PR 2** readiness gating (#151) — merged in #152 (7f03118) and live; **PR 3** setup model (#153) — merged in #154 (cb34335) and live; **PR 4** small-team governance (#155) — merged in #156 (5807f76) and live. The three scenario walks were re-run after remediation. **Guardrail pass** (#157: result entry, provisional links, optional formal Risk approvals, 20-case real-use floor, no-hard-quality warning, goalpost warning, Boundary labels) — merged in #158 (6092c56) and live; the small firm and aggressive client were re-walked on production and every guardrail held. The two findings from that walk (#159: case counts add up across test cases and real use instead of reading Conflicting; the no-hard-quality warning on Decide after a Decision) — merged in #160 (c4a3bef) and verified on production.
- **Phase 6 — adaptive UI: 6A.1 live, 6A.2 in review.** Scoped read-only on 2026-10-21; Paige's decisions 1–4 are in `docs/DECISIONS.md` under "Phase 6 scope, and 6A.1". **6A** is deterministic adaptive UI in the static app; **6B** is a model layer as progressive enhancement, only after Paige decides its architecture (where it runs, provider, privacy, cost, fallback, and the no-model-calls rule in `CLAUDE.md`). **6A.1, the Decision workspace (#161):** merged in #162 and live; re-walked on production (all guardrails held); display fixes merged in #164; naming opposing Reviewers and Stakeholders by role is #165 (PR #166). **6A.2, Context intake and description understanding (#167):** PR open, not merged; see "Phase 6A.2" in `docs/DECISIONS.md`. Next, each on Paige's word: merge, re-walk the three scenarios on 6A.2, then 6B.

Known follow-ups from Phase 2: the Decide, Monitor and record screens still say "Rules" and "Decision requirements"; the Status tab's rules panel doesn't yet separate the written Boundary from its enforcement the way setup's review does; the decision record doesn't link to its Setup confirmed snapshot.

No phase is approval to continue into the next one: 6B (any model call) and Phase 7 visual polish each wait for Paige.

See `docs/IMPLEMENTATION_PLAN.md`.

Do not continue into later phases just because a phase is green. Each phase should remain a controlled scope.

## State as a reality check

State remains the first real client workspace.

Do not add State-specific product code. Its configuration/evidence should continue to exercise generic Authority Lab behavior.

Also evaluate changes against a small-team scenario with no enterprise tooling.

## Existing repo status to preserve

On `main`, the prototype already includes:
- external evidence ingestion;
- evidence configuration/coverage;
- State workspace;
- decision records;
- monitoring/restriction;
- runtime enforcement/gate mechanics.

Known historical issue #130 remains about judging across runs vs newest run only. Do not opportunistically fold it into the reset unless the current issue specifically calls for it.

## Working discipline

- One issue per branch/PR.
- Stop for product decisions.
- No opportunistic cleanup.
- No paid model runs without Paige's approval and the required budget/call details.
- No merge/deploy/promotion without Paige explicitly naming the destination.
