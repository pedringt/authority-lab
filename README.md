# Authority Lab (prototype)

A product prototype for one question:

> Based on the evidence we have, what should this AI be allowed to do?

It walks one AI capability, **Refund recommendation** in the fictional Northstar Support workspace, through the full lifecycle: Define → Test → Pilot → Evaluate → Decide → Monitor. Authority is explicit, earned through evidence, conditional, reversible and authorized by a named person.

**AI interprets. Software enforces. Humans authorize.**

## Read about it

[docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) explains the product in plain terms: the building blocks, the screens, the demo story and what each control does.

[docs/DECISIONS.md](docs/DECISIONS.md) records every product decision with its reasoning, the loopholes found in review, and the roadmap.

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

1. **Overview**: To do leads with the decision on Refund recommendation: 5 of 6 checks met, and high-value refunds are the gap. Approvals needed shows two refunds waiting for a person; Important results shows the thin high-value data (18 cases at 83%).
2. **Capabilities → Refund recommendation → Rules**: what the AI may do, when it must ask a person, what it must never do, and when its authority is reduced automatically.
3. **Evidence → Tests → Run tests**: 24 of 26 pass. H-04 (fraud flag present) is a high-severity miss.
4. **Evidence → Results**: 218 pilot cases at 94%, but 18 high-value cases at 83%.
5. **Summary → People involved**: Support Operations wants to expand; Risk wants high-value cases held.
6. **Open the decision** (from the Overview, Summary or the Decision tab): choose **Expand with limits**, check the limits, the rollout plan and the expected impact (all prefilled for the demo), read what the option would mean, write why, and **Record decision**.
7. **Decision record #04** is written with the evidence snapshot. Current authority on the Overview updates.
8. **Monitoring → Still safe? → Simulate crossing the limit**: severe errors exceed 5% of the rolling 50; software moves the capability back to Draft ("The AI was moved back to Draft after crossing a safety limit."), creates an alert, an activity event and a restriction record, and locks expansion until a review is recorded.
9. **Monitoring → Review what happened**: Refund recommendation is High impact, so switch **Acting as** to a Risk approver (Daniel Okafor or Sofia Alvarez), write what happened, the cause and what changed, and **Save review**. The lock and alert clear; authority stays at Draft until a new proposal is authorized.
10. **Settings → Reset demo** (the gear at the top right) restores the seeded state.

## Where things are

Three places across the top: **Overview** (To do, Approvals needed, Important results, Current authority), **Capabilities** and **Records** (decision records and the Activity history). **Acting as** stays in the header; **People**, **Workspace**, **Start empty** and **Reset demo** are in the **Settings** menu (the gear, top right). A capability has six tabs: **Summary**, **Rules**, **Evidence** (Results, All evidence, Decision requirements, Targets, Tests, Model runs), **Decision** (the decision and Approvals), **Monitoring** (Still safe? and Delivering value?) and **History**. Stakeholder positions show in Summary and on the decision; **Manage stakeholders** opens the editor. Old links (`#/tests`, `#/evidence`, `#/agent-runs`, `#/activity`, `#/decisions/…`, and old tabs such as `?tab=contract`, `?tab=criteria`, `?tab=testing`, `?tab=waiting`, `?tab=stakeholders`) still open the right place (`src/routes.js`). Each page opens with one sentence; the rest is behind **How this works**.

## Standards

[docs/STANDARDS.md](docs/STANDARDS.md) maps Authority Lab's ideas (authority levels, human oversight, the audit trail, automatic restriction, the data boundary) to the NIST AI RMF, the EU AI Act and ISO/IEC 42001. These are learning notes, not a compliance claim. Every mapping links to its primary source, and anything uncertain is marked as such.

## Agent tooling (MCP)

`agent/` is an MCP server that gives a model the tools to look up orders, issue refunds and escalate to a person. Every call goes through the gate and the data filter in `src/store/`. It's separate from the static app: it has its own pinned dependencies and is never deployed. See [agent/README.md](agent/README.md) to run it with Claude Code or Claude Desktop.

## Starting empty

**Settings → Start empty** (the gear at the top right) swaps the Northstar demo for a blank workspace, after confirming that it erases all records (Reset demo asks the same). Setup comes first: name the workspace and its one workflow, record the founding roster (at least two workspace admins; rights are set directly only here, and governed from then on), and say which founding admin is setting it up. Then add the first capability. **Reset demo** brings Northstar back.

## Adding a capability

**Capabilities → Add capability** defines a new capability (name, summary, owner), its risk profile, and its starting authority: Level 0, Level 1, or "Not delegated, by design" with a rationale. It writes the capability's first decision record and lands on its **Setup** checklist. Every tab is always visible; empty tabs say what is missing and link to the next setup step. The **Acting as** picker in the header (default: the capability owner) stands in for sign-in and is the author on records; only active people appear. Reset demo removes added capabilities.

## Building the rules (the delegation contract)

For a new capability, **Setup → Write the rules** starts from a template picked by the risk profile plus seeded keyword suggestions labelled "Suggested by AI". Each suggestion is accepted, edited or rejected on its own (no accept-all; rejections stay in the record), all five sections are confirmed (The AI may, Ask a person for these cases, The AI must never, Ask a person whenever this comes up, Authority is reduced automatically when), software checks block empty hard limits above Low impact, contradictions, restriction rules without a number or window, and financial capabilities without a value limit in "may" or "must ask", and a named person saves the rules (**Save rules**) as contract v1. Templates and suggestion rules live in `src/data/contract-templates.js`.

## Success criteria and evidence requirements (Targets and Decision requirements in the app)

Setup step 3 (**Set targets**) opens an editor pre-filled from the risk profile, each row labelled with where its default came from. Saving writes v1 of both objects; saves before the first test run write new versions, one activity event per save. Core rows (quality, severe errors, minimum cases) cannot be removed, and loosening or removing a risk-derived default needs a reason that is kept on the version. The suite cannot run until they are saved, and the first run locks them (`criteriaLocked` = saved and `performanceResultsSeen`). After the lock the editor is read-only and changes go through a proposed change (**Propose a target change**, #7). Defaults live in `src/data/criteria-defaults.js`.

## Sign-off rules in one place

| Object | Needs sign-off from | Approvers |
|---|---|---|
| Criteria and requirements (Targets, Decision requirements) | the first performance results | Low/Medium: 1 (the owner, or another named stakeholder if the owner proposed). High or Financial: 2 distinct, at least one from Risk |
| Contract (Rules) | a pilot start (setting on) | same |
| Stakeholder membership and team labels | the first performance results | same; positions and reasoning stay direct |

**Tightening only skips sign-off.** A criteria/requirements change where every changed threshold only gets stricter (higher "at least", lower "at most", more required cases) and nothing is removed, added, renamed, reworded or loosened applies directly as a recorded amendment, if the owner or a named stakeholder makes it and no expansion decision is pending. Anything else, or any loosening anywhere, goes to sign-off.

The proposer never approves. Risk is the recorded Risk approver right, never a team. Eligible approvers are frozen when the proposal opens, infeasible proposals are refused with a reason, the proposer can withdraw, others can reject, and everything stays in the record.

## Amendments after evidence

Locked criteria, and the contract once a pilot has started, change through a proposal: a new version plus a reason, applied only after sign-off. The proposer never approves. Low/Medium impact: one approver (the owner, or another named stakeholder if the owner proposed). High impact or financial exposure: two distinct approvers, at least one from Risk. Contract proposals must pass the builder's checks. The sign-off screen shows readiness under both versions. Approvals and rejections are recorded; approving writes the versions with the approvals on them. The contract rule sits behind `SETTINGS.CONTRACT_EDITS_NEED_SIGNOFF_AFTER_PILOT` (on).

## A new capability, end to end

Expanding authority needs a pending proposal; restricting, suspending or redesigning does not, but still needs a named person, a rationale and a record. Status follows authority decisions only: In setup until a person authorizes the move to Draft, then Pilot. Each step must be real before the next: rules before targets, targets before tests, tests before a decision. The Setup page tracks them.

1. **Capabilities → Add capability**: name, summary, owner, risk profile, starting authority (Level 0 or 1). Writes the capability's first record.
2. **Setup → Write the rules**: template plus suggestions, review each one, confirm the sections, **Save rules** (contract v1).
3. **Setup → Set targets**: targets and decision requirements from the risk profile; save v1.
4. **Setup → Name stakeholders**: the people whose positions will be recorded.
5. **Setup → Open the library**: **Add 20 suggested cases** ("Suggested by AI") or write your own; **Save test cases**.
6. **Evidence → Tests → Run tests**: results are simulated deterministically; the first run locks the targets.
7. **Summary or Decision → Propose a move to Level 2**, then **Open the decision** and **Record decision**: the capability's second record, status Pilot.

## People and rights

The roster lives in versioned state (`state.roster`), seeded from `src/data/seed.js`. Each person has a name, title, team, `active` flag and explicit rights `{ riskApprover, workspaceAdmin }`. Only a workspace admin changes the roster (add, edit, deactivate; never delete), always with a reason, as a new version. Granting or removing a right, or deactivating a rights holder, is a proposal by an admin approved by someone else (a different admin, or an existing Risk approver for a Risk approver grant); the recipient of a grant never approves it; the last admin cannot be removed. Deactivated people cannot act, propose, approve or be stakeholders. Seed admins: Maya Chen, Jonas Lindqvist. Seed Risk approvers: Daniel Okafor, Sofia Alvarez.

## Coverage warnings

Warnings, never blocks: a High/Financial capability with fewer than two active Risk approvers among its possible approvers; an open proposal whose frozen approvers can no longer satisfy the rule (withdraw and re-propose); and, on the People page, what removing a right or deactivating someone would do to either. The reason is required; the impact is recorded on the roster change.

## Structure

- `src/data/seed.js`: all seeded data (workspace, capabilities, contract, criteria, 26 scenarios, pilot segments, evidence, stakeholders, decision records, activity, monitoring rule).
- `src/store/`: pure state transitions plus a small persisted store, split by responsibility (state shape, selectors, people, capabilities, contract, decisions, evidence, proposals, monitoring, coverage, persistence). `src/store/index.js` is the one public entry point. Everything that belongs to one capability (criteria, requirements, scenarios, pilot, evidence, stakeholders, test run, pending decision, monitoring) lives under `state.capabilityData[capabilityId]`, and every transition takes a capability id.
- Every record, version, approval, proposal and roster change saves the person as they were (name, title, team, rights). Views show that snapshot, so later roster changes never rewrite history.
- Records come in three tiers: **decision records** (authority changes only, by a named person or by a software rule), **amendments** (versioned edits to the contract, criteria, evidence requirements, risk profile and stakeholders, each with author, reason, before/after and an "after evidence" flag), and the **activity log** (every event, with a `kind` and a `surfaced` flag; Activity shows surfaced events under "Important" and everything under "Everything"). Version lists live under `capabilityData[id].versions` and the latest version is the only copy: views read the contract, risk profile, criteria, requirements and stakeholders through `current(state, capabilityId, kind)`, and a test fails if a view reads them any other way. The capability object holds identity (id, name, summary, owner) and current authority/status. `amend()` writes a new version and never edits an old one.
- `src/views/*.js`: one module per screen. Views render from state; they never mutate it.
- `src/diff.js`: a small structural diff used for amendment before/after tables and the Versions page.
- `src/ui.js`: escaping template tag and shared components (badges, authority labels, level scale, notices).
- `styles/app.css`: the design system. Color carries state (pass / watch / fail / insufficient / restricted / decision required) and is always paired with a label.

## Boundaries

Not an agent builder, prompt editor, eval platform, observability tool or compliance suite. Those would feed evidence into this. All data is fictional; there are no real customers, no money movement and no model calls.
