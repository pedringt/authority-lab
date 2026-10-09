# Decisions and roadmap

The product decisions behind Authority Lab, why they were made, and what's next. Newest decisions are at the end of each section. When a PR changes or implements one of these, update this file in the same PR.

## Principle

**AI interprets. Software enforces. Humans authorize.** The AI reads cases and recommends. Software applies the limits and can pull authority back automatically. Only a named person can give the AI more authority.

## Decisions

### Records

- **Record everything; surface selectively.** Every setup and governance change is captured, attributed, timestamped and immutable. There are three tiers: decision records (authority changes only), amendments (versioned edits to contract, criteria, requirements, risk profile, stakeholders) and the activity log (every event). Screens show the useful events by default; everything else sits in "Full history".
- **Every authority level change writes a decision record**, including a capability's starting level and "Not delegated, by design" (which needs a rationale).
- **Decision records save the versions in force** (contract, criteria, requirements, risk, stakeholders) as well as the evidence.
- **Record numbers are workspace-wide.** The footer shows the per-capability sequence ("record 1 for X"). Say "the capability's first record", not "record #01".
- **Records name who acted.** When the person acting differs from the owner, both are shown. Records keep the person's name, title, team and rights as they were at the time, so later roster changes never rewrite history.

### Status and evidence

- **Status follows authority decisions only.** A capability is "In setup" until a person authorizes the move to Draft, then "Pilot". Finalizing a contract or saving criteria doesn't change status.
- **"After evidence" means performance results were seen:** a recorded test run, a pilot, or measured evidence. Opinions (stakeholder assessments, user feedback) don't count. One function (`performanceResultsSeen`) serves both amendments and the criteria lock.
- **"Last evaluated" means evidence only:** the last test run, evidence item date or pilot end, falling back to the defined-on date. Decisions don't count. A Hold decision on stale evidence shouldn't make a capability look fresh.

### Setup

- **Setup is per capability**, not a workspace-wide wizard. A capability starts at Level 0 or 1, or "Not delegated, by design". Nothing starts at Draft or above.
- **Starter contract: template plus AI suggestions.** The risk profile picks a template. Seeded AI suggestions add capability-specific rules, each reviewed one at a time with no "accept all". Rejected suggestions are kept. All five sections must be confirmed. "Must never" and "Automatic restriction" can't be empty above Low impact. Software blocks contradictions, restriction rules with no number or window, and Financial capabilities without a value limit under "May" or "Must ask". A named person finalizes version 1. Contract proposals run the same checks.
- **Criteria are locked by the first test run.** Defaults come from the risk profile and show their source. Before the lock, loosening or removing a default needs a reason stored on the version. Core rows (quality, severe errors, minimum cases) can be adjusted but not removed.

### Sign-off

- **Amendments after evidence need sign-off**, not just a flag. Applies to criteria and requirements once locked, stakeholder membership and teams once results exist, and the contract once a pilot has started (behind one setting, on by default). Updating a stakeholder's position or reasoning stays a direct edit.
- **Approver rule.** The proposer never approves. Low/Medium impact: one approver (the owner, or another named stakeholder if the owner proposed). High impact or Financial: two distinct approvers, at least one with the Risk approver right. The sign-off screen shows readiness under both the current and proposed versions.
- **Approvers are frozen when a proposal opens.** A proposal the eligible approvers could never satisfy is refused when proposed. Proposers can withdraw. Rejections and withdrawals need a reason.
- **Expanding needs a pending proposal and moves one level at a time; pulling back doesn't need a proposal.** Restrict, Suspend and Redesign still need a named person, a rationale and a record.

### People and roles

- **The roster is versioned state.** People are deactivated, never deleted, because records refer to them. Deactivated people can't act, propose, approve, own a capability or be stakeholders.
- **Workspace admins make roster changes.** Granting or removing a right, or deactivating someone who holds one, is a proposal approved by a different admin.
- **Risk approval is an explicit, recorded right**, independent of team names.
- **Grants:** the approver is neither the proposer nor the recipient. A Risk approver grant can be approved by a different admin or by an existing Risk approver. A person may consent to their own removal. The last workspace admin can't be removed.
- **Warnings never block.** Coverage warnings appear when a High/Financial capability has fewer than two active Risk approvers among its owner and stakeholders, and when an open proposal can no longer be satisfied. They link to the Stakeholders tab and the People page.
- **"Demo · acting as"** stands in for sign-in and is labelled as a demo control.

### Interface

- **Demo controls are grouped apart from the app.** The header has two rows: the brand and one grouped demo area (acting as, the demo date, Reset demo), then the section tabs, which never scroll sideways at 1024px and wider. (#38)
- **Section tabs are quiet.** Underlined tabs start flush with the brand, with an even gap; the active tab is underlined on the header's bottom border instead of a filled pill, and counts are small tinted badges (red only for an alert). (#47)
- **The decision stays together.** In the decision workspace the options, the chosen option's plain-English preview, the rationale and the Authorize button share one panel that stays in view while the evidence scrolls. (#41)
- **One filter pattern.** Tests and Evidence name their capability in the heading as a selector, with the other filters on one labelled bar with "Clear filters" and a "Showing X of Y" count. (#39)
- **No wall of "Not run".** Before the first run, Tests shows the scenario groups collapsed with counts and one Run action; after a run, groups with failures come first and open. (#40)
- **One control per person.** The People table shows rights as badges only; editing, granting or removing rights, and deactivating sit behind one "Manage" menu per row. (#42)
- **One date format.** "Oct 7", with the year only when it isn't the workspace's current year. Dates are stored as data and formatted when shown, never baked into stored text. Every authority level has a tooltip with its description. (#43)
- **Errors are inline, never pop-ups.** Every action that can fail shows its error on the page it was started from. A test keeps `alert()` out of the UI. (#36, #44)

### Monitoring (roadmap item 6: #48, #49, #50)

- **Restriction rules come from the contract.** Each capability's monitoring rules are derived from its contract's "Automatic restriction" lines, using the number and window the contract checks already require. No separate rule editor. (Decided 2026-10-08.)
- **"Simulate threshold breach" stays on the seeded capabilities only.** Capabilities added in the demo get monitoring but no simulate button. (Decided 2026-10-08.)
- **The contract wins on when and how far.** A rule runs at whatever level the capability is at, as long as the capability is above the level the line falls back to ("returns the capability to Draft" waits until the capability is above Draft). The fallback level is the one the line names; a line that names none falls back one level. A line that says the capability "stays at" a level opens an incident and doesn't change authority. This replaced two earlier recommendations (monitor only from Level 3; always one level down) once the seeded contracts showed Level 1–2 rules and named fallback levels. Review is still required before authority expands again. (Decided 2026-10-08.)
- **Monitoring runs wherever a rule applies.** A capability is monitored whenever at least one of its contract's rules applies at its current level; it is not tied to an expansion. Each rule shows its latest reading against its limit: "above X%" is crossed above X, a count rule when the count reaches it. Seeded capabilities carry simulated readings; added capabilities have none until something is measured. (#49)
- **A breach follows its contract line.** Crossing a restriction rule moves the capability to the level the line names, writes an automatic decision record quoting the rule and the reading, raises an alert and an incident, and requires review before authority expands again. Crossing an incident rule opens an incident and raises an Overview alert, but writes no decision record and changes no authority. Each seeded capability has one seeded breach naming the rule it crosses. (#50)
- **Refund recommendation's demo rule is in its contract.** "Severe error rate above 5% across the rolling 50 autonomous cases returns the capability to Draft until reviewed" was added to its seeded contract, so the demo breach comes from the contract like every other rule. (#48)

## Loopholes found in review, and their fixes

Each one now has a test that tries the bypass and confirms it is refused.

1. An owner proposing on a High/Financial capability needed only one approver, because of a role dedup. Fixed with approver counts.
2. Relabelling a stakeholder as "Risk" let the proposer pick their own Risk approver. Fixed: Risk comes from the person, approvers are frozen, and membership changes need sign-off.
3. A proposal from the only Risk person could never complete and blocked the item. Fixed with a feasibility check, withdrawal, and a second Risk person in the seed.
4. An admin editing someone's team made them a Risk approver. Fixed with the explicit Risk approver right.
5. The person receiving a right could approve their own grant. Fixed: the recipient can't approve.

Lesson: most gaps came from assumptions about who people are and what role they hold. Test those first.

## Roadmap

1. ~~Setup per capability~~ (done).
2. ~~People and roles~~ (done).
3. ~~Housekeeping: CI, error handling, store split~~ (done: #35, #36, #37).
4. ~~UI readability pass~~ (done: #38–#44): two-row header, filter bar, collapsed test groups, sticky decision panel, People "Manage" menu, one date format, level tooltips, inline errors instead of pop-ups.
5. ~~Header nav cleanup~~ (done: #47). The section tabs don't line up with the brand, and their spacing comes only from pill padding. Proposed: underline tabs flush with the brand, an even gap, the active tab underlined on the header's bottom border, quieter count badges. Nothing added.
6. ~~Monitoring and automatic restriction for every capability~~ (done: #48 rules from the contract, #49 running them for every capability, #50 breach and fallback).
7. Empty-workspace path: set up the workspace and workflow first.
8. Smaller rule changes: lighter sign-off for amendments that only tighten criteria; multi-level jumps and their decision rule.
9. Real evidence integrations (test harness, ticketing, reviewer decisions, cost). These end the self-contained prototype and need their own planning.
