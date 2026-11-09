# Authority Lab v1: scope reconciliation

**Status:** Scope approved by Paige on 2026-11-09. Implementation hasn't started: each work item below needs its own issue and PR.

**Sources:** `docs/V1_SCOPE.md`, `docs/SETUP_FLOW.md`, `docs/DECISIONS.md`, a read-only gap audit of `main` and the live demo (2026-11-09), and Paige's review of four drafts.

## 1. Purpose

Parts of V1_SCOPE.md described things the app doesn't do. Most of these were model assistance, which has been paused since 2026-11-09 (`docs/DECISIONS.md`, "Phase 6B paused"). This document records how each gap is resolved for v1 and what "done" means for the remaining work. V1_SCOPE.md has been updated to describe what ships.

## 2. Decisions

| # | Item | v1 decision |
|---|---|---|
| D1 | AI-assisted Coverage suggestions | Model assistance is deferred. Rule-based suggestions stay, each labelled with its basis. Coverage sufficiency stays deterministic. |
| D2 | Generative UI | The existing rule-based adaptive presentation (Phase 6A) counts toward v1. V1_SCOPE drops the model requirement. |
| D3 | Material changes | Historical evidence is kept. The Owner reviews whether affected evidence still applies before it supports an expansion again. Evidence isn't invalidated automatically by change category. |
| D4 | Phase 7 redesign | Out of v1. Specific problems found in the final walkthrough are fixed one by one. |
| D5 | Stale evidence | No new block. The wording says age blocks only when a configured Requirement makes recency mandatory. |
| D6 | Undecided Targets | No new block. The wording says a Target may stay undecided until a dependent Requirement needs a bar. |

## 3. Work items and acceptance criteria (in priority order)

### W1. Material-change applicability review (D3)

**The current gap.** A material change makes the open Proposal stale. But `replaceProposal` clears that block in one step, and evidence from before the change keeps counting with no review.

**Rules:**
- **Who decides.** The Owner records each applicability decision. Reviewers may give input.
- **The three answers.** Each affected item (`materialChangeImpact`) is marked still applicable, partly applicable, or no longer applicable. Each answer needs a reason, and nothing is prefilled.
- **While awaiting review.** Affected evidence that hasn't been reviewed is excluded from current Requirement and Coverage calculations.
- **Partly applicable.** The evidence stays as supporting context, but can't on its own satisfy a hard Requirement. The review records what is still supported and what needs fresh evidence.
- **No longer applicable.** The evidence stops counting in current Requirements and Coverage. Past Decisions are unchanged. This classification alone doesn't reduce Authority.
- **Where it shows.** Unresolved reviews appear on both Monitor and Decide, each with a link to resolve them.

**Acceptance criteria:**
- **The block.** Any unresolved review blocks expansion (`canAuthorize`). Replacing the Proposal doesn't clear it.
- **Completing the reviews** clears only that block. Requirements and Coverage are recalculated with eligible evidence before any expansion is permitted, and expansion is available only if they pass.
- **History.** Original evidence is never edited or deleted. History shows the change and each review: who made it, the answer and the reason.
- **Tests:**
  - After a material change, replacing the Proposal still blocks.
  - Unreviewed affected evidence is excluded from current results.
  - Completed reviews clear only that block.
  - A "no longer applicable" item stays excluded.
  - A "partly applicable" item can't be the only support for a hard Requirement.
  - Past Decision records are unchanged.

### W2. Manual monitoring readings

**Rules:**
- **Who records.** The Owner or a configured Reviewer, attributed to the person recording. Being a Stakeholder doesn't grant this.
- **What a reading holds.** The rule, the measurement period, the source, the value and the units.
- **How it's judged.** Readings go through the existing deterministic restriction rules, the same as any other reading.
- **Corrections.** A correction is an attributed, superseding record with a reason, and the original is kept.
  - A correction never automatically restores Authority, and never erases an earlier restriction or incident.
  - Restoring Authority requires the existing post-incident review and a new authorized expansion, as applicable. A correction creates no shortcut.

**Acceptance criteria:**
- **Validation.** A reading must match the rule's units and measurement window, or it's refused with a reason.
- **No silent replacement.** An older or duplicate reading can't silently replace the current one. It can enter only as a correction.
- **The consequence comes first.** Before saving, the form shows the limit, the value and any restriction that would apply. Saving can't bypass a configured restriction.
- **Tests:**
  - The Owner and a Reviewer are allowed; a Stakeholder is refused.
  - A reading in the wrong units or window is refused.
  - A stale or duplicate reading is refused.
  - A reading over the limit triggers the restriction, and the warning shown before saving matches it.
  - A correction keeps the original, leaves the restriction and incident in place, and doesn't restore Authority.

### W3. Decision and Status display contracts

**The current gap.** The invariants contract (`phase6a.test.mjs`) checks that the Decision view shows current and proposed Authority, what blocks, what needs a person, what stays prohibited, and disagreement. It doesn't check serious failures, stale or insufficient evidence, or the full-record path. The Status tab has no contract.

**Acceptance criteria:**
- **Decision view.** The contract also asserts serious test failures, stale or insufficient evidence relevant to the proposed level, and the full-record path.
- **Status view.** A new contract asserts current Authority, blocking items, what needs a person, serious failures, and the full-record path.
- **The full-record path opens the complete record.** The test follows it and checks that the whole record renders. Presence alone doesn't pass.
- **Failures name the item.** Removing any asserted item fails the test and names it.

### W4. Minimum contextual Help

**The current gap.** Each screen has a "How this works" panel. The per-step Help that SETUP_FLOW.md describes doesn't exist.

**What it adds.** At each consequential choice: one line on why it matters, and one plain-language example. It's optional, collapsed by default, and never fills in an answer.

**The consequential choices:**
- the Risk answers;
- starting Authority;
- Boundaries and how each is enforced;
- Requirements, and Targets where measurable;
- Owner and Reviewer assignment;
- Residual Risk;
- the final authorization choice: expand, hold, reduce or pause;
- material-change applicability;
- a monitoring reading.

### W5. Small clarity fixes

- **#134.** A read-only summary of completed setup steps.
- **No Reviewers named.** Decide stops saying "Every Reviewer has given a position" and says none are configured.
- **D5 and D6 wording.** On Monitor, Decide step 2 and the setup Requirements step.

## 4. Rules

### C1. How changes since the Decision in force are graded

This replaces the mapping in `src/store/lifecycle.js` (`changesSinceDecision`) that was "documented for Paige to confirm" (#147, question 2). It is implemented with W3 or as its own issue.

**Principles:**
- Separate conditions that support the current Authority from Requirements for a future expansion.
- Separate safety concerns from oversight items, and both from value warnings.

**Levels, most serious first.** The headline is the highest level present, and everything else is listed below it.

| Level | Covers |
|---|---|
| 1. Restricted automatically | A restriction rule fired. *(unchanged)* |
| 2. Above approved Authority | Observed behaviour is above the approved level. *(unchanged)* |
| 3. **Safety concern** | An open critical incident, a safety limit crossed, or a restriction rule over its limit. It is always pinned at the top of Monitor. When it is the headline, any failed hard Requirement is shown directly beneath it. |
| 4. **May no longer be justified** | A **hard** Requirement that supported the current Authority is now Not met. "Supported" means it was Met in the Decision's frozen snapshot. Requirements for a future expansion never count here. |
| 5. **Investigation needed** | A hard Requirement that supported the current Authority now has a Conflicting result. It ranks below level 4, as in the code before this change. Conflict about a future expansion stays on Decide and blocks there under the existing rules. |
| 6. **Needs attention** | Oversight and evidence items (listed below). |
| 7. **Value warning** (separate) | A rollout goal missed on real numbers. It is shown under "Delivering value?" and doesn't set the "Still justified?" headline. |
| 8. Info | New evidence, improvements, approvals. *(unchanged)* |

**What "Needs attention" covers:**
- a consideration that went Met → Not met;
- worse Coverage;
- stale evidence;
- a material change, or an unresolved W1 review;
- disagreement, or a changed position;
- an open non-critical incident;
- review-quality adoption signals ("approvals may not be real reviews", "reviewers reversing more"), because they concern whether human control works;
- blocked attempts at something never allowed, labelled "Blocked". They escalate only when an incident or a configured rule warrants it; no new threshold is added.

**Examples:**

| Situation | Before | v1 |
|---|---|---|
| Hard "Accuracy ≥ 92%" was Met at the Decision; now 89% | May no longer be justified | May no longer be justified |
| Consideration "40 high-value cases" was Met; now Not met | May no longer be justified | Needs attention |
| A Level 4 Requirement added after the Level 3 Decision is Not met | Not graded | Not graded; shown on Decide as the next bar |
| Open critical incident; all Requirements still Met | Investigation needed | Safety concern, pinned |
| Critical incident open **and** a hard Requirement fell | Headline: may no longer be justified | Headline: safety concern, with the failed Requirement directly beneath |
| A hard Requirement that supported current Authority is now Conflicting | Investigation needed | Investigation needed |
| Restriction rule over its limit; restriction applied | Restricted automatically | Restricted automatically |
| "Approvals may not be real reviews" | Needs attention | Needs attention (oversight) |
| 3 blocked attempts at a never-allowed action | Needs attention | Needs attention, labelled "Blocked" |
| Rollout goal "handle time −20%" missed | Needs attention | Value warning |
| Stale evidence behind a hard Requirement, recency not required | Needs attention | Needs attention, with the D5 wording |

### C2. Contract edits after the pilot starts

This confirms the assumption in `src/store/proposals.js` (decision 7, `CONTRACT_EDITS_NEED_SIGNOFF_AFTER_PILOT`).

- **Sign-off stays on for v1,** through the existing authorized approval path.
- **The existing tightening-only exception is kept as it is.** Strictly tighter Targets and Requirements apply without sign-off. Only the Owner or a named Stakeholder can make such a change, and never while an expansion decision is pending.
- **Contract edits still need sign-off,** including tightening a Boundary. Extending the exception to contract edits would need its own definition and implementation. It isn't part of v1.

## 5. Out of v1

- Any model-assisted feature. 6B is paused, and any new attempt needs a fresh validation set.
- The Phase 7 redesign.
- Automatic material-change detection, or invalidation by change category.
- A full Help system.
- Extending the tightening-only exception to contract edits.
- Everything in V1_SCOPE's "Deliberately out of v1".
- These are unchanged:
  - The Question Investigator (#115–#117) stays parked.
  - #130 stays a recorded known limit.
  - #105 stays out unless it is added.

## 6. Definition of done

- V1_SCOPE.md is in line with D1–D6 (done in this change).
- W1–W5 are merged, each with its acceptance tests.
- C1 and C2 are implemented where they change behaviour, and recorded in DECISIONS.md (recorded in this change).
- A final walkthrough of the Northstar demo and the small-team path is done. Problems it finds are fixed (D4) or recorded as known limits.
- The app and agent test suites are green.
- **Historical eval versions and results are preserved.** The 6B experiments stay as recorded, attributed to the versions they tested. The integrity check separates two kinds of change:
  - **Expected product-code drift.** This is a fingerprinted file that the product legitimately changes, such as `src/store/describe.js` or the scorer. The check reports the drift ("results apply to the version frozen on 2026-11-08") without blocking ordinary product tests, and it still refuses a new run on that set. Today the check fails instead, so this needs a small change to `agent/describe-eval/freeze.mjs` and its tests, made when a fingerprinted file is first changed.
  - **Changes to the preserved experiment.** Archived labels, tags, results, audit files and other experiment files must not change. Any change to them still fails the integrity check.
  - Old held-out data is never re-frozen to imply fresh validation.
