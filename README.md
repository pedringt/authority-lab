# Authority Lab (prototype)

A product prototype for one question:

> Based on the evidence we have, what should this AI be allowed to do?

It walks one AI capability, **Refund recommendation** in the fictional Northstar Support workspace, through the full lifecycle: Define → Test → Pilot → Evaluate → Decide → Monitor. Authority is explicit, earned through evidence, conditional, reversible and authorized by a named person.

**AI interprets. Software enforces. Humans authorize.**

## Read about it

[docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) explains the product in plain terms: the building blocks, the screens, the demo story and what each control does.

## Run it

No build step, no dependencies, no network calls.

```bash
python3 -m http.server 8140
```

Then open http://localhost:8140/. Any static host (Vercel, GitHub Pages) serves it as-is.

## Test it

```bash
node --test scripts/*.test.mjs
```

The tests cover the state transitions: running the suite, authorizing each decision option, the automatic restriction on a threshold breach, the review-required lock, persistence and reset.

## Demo story

1. **Overview**: Refund recommendation needs an authority decision. 5 of 6 evidence requirements are met; high-value refunds are the gap.
2. **Capability → Contract**: what the AI may do, must ask about, must never do, and when software pulls authority back.
3. **Tests → Run test suite**: 24 of 26 pass. H-04 (fraud flag present) is a high-severity miss.
4. **Capability → Evidence**: 218 pilot cases at 94%, but 18 high-value cases at 83%.
5. **Capability → Stakeholders**: Support Operations wants to expand; Risk wants high-value cases held.
6. **Decisions → Open authority decision**: choose **Expand with limits**, set the conditions, read the plain-English preview, write the rationale, authorize.
7. **Decision record #04** is written with the evidence snapshot. The authority map updates.
8. **Capability → Monitoring → Simulate threshold breach**: severe errors exceed 5% of the rolling 50; software returns the capability to Draft, creates an alert, an activity event and a restriction record, and locks expansion until a review is recorded.
9. **Reset demo** (top right) restores the seeded state.

## Adding a capability

**Capabilities → Add capability** defines a new capability (name, summary, owner), its risk profile, and its starting authority: Level 0, Level 1, or "Not delegated, by design" with a rationale. It writes the capability's first decision record and lands on its **Setup** checklist. Every tab is always visible; empty tabs say what is missing and link to the next setup step. The **Acting as** picker in the top bar (default: the capability owner) is the author on records. Reset demo removes added capabilities.

## Building a contract

For a new capability, **Setup → Open the contract builder** starts from a template picked by the risk profile plus seeded keyword suggestions labelled "Suggested by AI". Each suggestion is accepted, edited or rejected on its own (no accept-all; rejections stay in the record), all five sections are confirmed, software checks block empty hard limits above Low impact, contradictions, restriction rules without a number or window, and financial capabilities without a value limit in "may" or "must ask", and a named person finalizes contract v1. Templates and suggestion rules live in `src/data/contract-templates.js`.

## Success criteria and evidence requirements

Setup step 3 opens an editor pre-filled from the risk profile, each row labelled with where its default came from. Saving writes v1 of both objects; saves before the first test run write new versions, one activity event per save. Core rows (quality, severe errors, minimum cases) cannot be removed, and loosening or removing a risk-derived default needs a reason that is kept on the version. The suite cannot run until they are saved, and the first run locks them (`criteriaLocked` = saved and `performanceResultsSeen`). After the lock the editor is read-only and changes go through a proposed amendment (#7). Defaults live in `src/data/criteria-defaults.js`.

## Amendments after evidence

Locked criteria, and the contract once a pilot has started, change through a proposal: a new version plus a reason, applied only after sign-off. The proposer never approves. Low/Medium impact: one approver (the owner, or another named stakeholder if the owner proposed). High impact or financial exposure: two distinct approvers, at least one from Risk. Contract proposals must pass the builder's checks. The sign-off screen shows readiness under both versions. Approvals and rejections are recorded; approving writes the versions with the approvals on them. The contract rule sits behind `SETTINGS.CONTRACT_EDITS_NEED_SIGNOFF_AFTER_PILOT` (on).

## A new capability, end to end

1. **Capabilities → Add capability**: name, summary, owner, risk profile, starting authority (Level 0 or 1). Writes the capability's first record.
2. **Setup → Open the contract builder**: template plus suggestions, review each one, confirm the sections, finalize contract v1.
3. **Setup → Open the editor**: success criteria and evidence requirements from the risk profile; save v1.
4. **Setup → Open the editor** (stakeholders): name the people whose positions will be recorded.
5. **Setup → Open the library**: add the starter set (20 scenarios, "Suggested by AI") or write your own; save.
6. **Tests → Run test suite**: results are simulated deterministically; the first run locks the criteria.
7. **Decision history → Propose a move to Level 2**, then **Authorize**: the capability's second record, status Pilot.

## Structure

- `src/data/seed.js`: all seeded data (workspace, capabilities, contract, criteria, 26 scenarios, pilot segments, evidence, stakeholders, decision records, activity, monitoring rule).
- `src/store.js`: pure state transitions plus a small persisted store. Everything that belongs to one capability (criteria, requirements, scenarios, pilot, evidence, stakeholders, test run, pending decision, monitoring) lives under `state.capabilityData[capabilityId]`, and every transition takes a capability id.
- Records come in three tiers: **decision records** (authority changes only, by a named person or by a software rule), **amendments** (versioned edits to the contract, criteria, evidence requirements, risk profile and stakeholders, each with author, reason, before/after and an "after evidence" flag), and the **activity log** (every event, with a `kind` and a `surfaced` flag; Activity shows surfaced events by default and everything under "Full history"). Version lists live under `capabilityData[id].versions` and the latest version is the only copy: views read the contract, risk profile, criteria, requirements and stakeholders through `current(state, capabilityId, kind)`, and a test fails if a view reads them any other way. The capability object holds identity (id, name, summary, owner) and current authority/status. `amend()` writes a new version and never edits an old one.
- `src/views/*.js`: one module per screen. Views render from state; they never mutate it.
- `src/diff.js`: a small structural diff used for amendment before/after tables and the Versions page.
- `src/ui.js`: escaping template tag and shared components (badges, authority labels, level scale, notices).
- `styles/app.css`: the design system. Color carries state (pass / watch / fail / insufficient / restricted / decision required) and is always paired with a label.

## Boundaries

Not an agent builder, prompt editor, eval platform, observability tool or compliance suite. Those would feed evidence into this. All data is fictional; there are no real customers, no money movement and no model calls.
