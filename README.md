# Authority Lab (prototype)

A product prototype for one question:

> Based on the evidence we have, what should this AI be allowed to do?

It walks one AI capability, **Refund recommendation** in the fictional Northstar Support workspace, through the full lifecycle: Define → Test → Pilot → Evaluate → Decide → Monitor. Authority is explicit, earned through evidence, conditional, reversible and authorized by a named person.

**AI interprets. Software enforces configured controls. Humans authorize.**

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

A first visit opens a welcome page (`#/welcome`) with two paths: **Guided demo** (seven steps, `#/guide/1` to `#/guide/7`, on its own in-memory copy of the demo, so it never changes the workspace) and **Explore the finished workspace**. **Settings → Guided demo** opens it again. The story below is the workspace path.

1. **Overview**: To do leads with the decision on Refund recommendation: 5 of 6 checks met, and high-value refunds are the gap. Approvals needed shows two refunds waiting for a person; Important results shows the thin high-value data (18 cases at 83%).
2. **Capabilities → Refund recommendation → Status**: what it can do now (Draft: refunds are prepared automatically, a person approves every one), why it's there and what happens next. **Boundaries** opens a one-line summary; **All rules** shows what is allowed, what requires human review, what is never allowed, and when automation is pulled back.
3. **Decide → What do we know? → Tests → See every test and run the suite**, then **Run tests**: 24 of 26 pass. H-04 (fraud flag present) is a serious miss.
4. **Decide → Pilot results**: 218 cases at 94%, but 18 high-value cases at 83%.
5. **Decide → Stakeholder positions** (or **People involved** on Status): not unanimous. Support Operations wants to expand; Risk wants anything over $50 kept with a person.
6. **Decide, Your decision**: choose **Expand autonomy → Within limits**, check the limits, what should improve and the rollout plan (all prefilled for the demo), give a Residual Risk with why (yours to judge), write why you're deciding, and **Record decision** as the Owner.
7. **Authority change #04** (`AC-04`) is written with the evidence snapshot. Current autonomy on the Overview updates to Act within limits.
8. **Monitor → Still justified? → Simulate a safety-limit breach**: severe errors exceed 5% of the rolling 50; software moves the capability back to Draft, writes a restriction record, raises an alert and an activity event, and locks expansion until a review is recorded. The verdict reads "Autonomy reduced".
9. **Monitor → Needs review**: Refund recommendation is High impact, so switch **Demo as** to a Risk approver (Daniel Okafor or Sofia Alvarez), write what happened, the cause and what changes as a result, and **Save review**. The lock and alert clear; authority stays at Draft until a new proposal is authorized.
10. **Settings → Reset demo** (the gear at the top right) restores the seeded state.

## Where things are

A dark bar across the top holds three places: **Overview** (To do, Approvals needed, Important results, Current autonomy), **Capabilities** (one table, plus **Add capability**) and **Records** (Decisions and Activity). On the right sit **Demo as** (a demo stand-in for sign-in) and the **Settings** gear: **People**, **Workspace**, **Guided demo**, **Start empty** and **Reset demo**. A capability opens with a header panel and four tabs:

- **Status**: what it can do now, why it's here, what happens next, then. **Needs a decision** lists single actions waiting for a person; one-line **Boundaries** and **People involved** follow. The full rules are at `?tab=status&show=rules`; every waiting action at `?tab=status&show=approvals`.
- **Decide**: one flow (what changes if I approve this, what do we know, who has said what, Risk, the recommendation, your decision, limits, what should improve, rollout plan, why, review and record). A move up starts from a Proposal, frozen when a person proposes it; only the Owner records an expansion or a hold, after every Reviewer's position and a Residual Risk, and a stale Proposal is replaced, never edited (#144). Full evidence views open with `show=tests`, `runs`, `all`, `targets`, `requirements` or `results`.
- **Monitor**: **Still justified?** (is the current Authority still justified: the Decision in force against current conditions, material changes and the evidence they may affect, and Investigate, Reduce or Pause, Restore through a new Proposal, and Retire; then the automatic safety limits) and **Delivering value?**. When recorded behavior is above the approved Authority (State starts approved for Recommend, observed at Draft), it reads **Operating above approved Authority**, blocks expansion past the observed level, and offers two ways to resolve it (#149).
- **History**: one timeline of records, reviews, test runs, proposed changes and versions.

Old links (`#/tests`, `#/evidence`, `#/agent-runs`, `#/activity`, `#/decisions/…`, and old tabs such as `?tab=summary`, `?tab=rules`, `?tab=evidence`, `?tab=decision`, `?tab=monitoring`, `?tab=contract`, `?tab=criteria`, `?tab=waiting`) are rewritten to where they live now (`src/routes.js`).

## Standards

[docs/STANDARDS.md](docs/STANDARDS.md) maps Authority Lab's ideas (authority levels, human oversight, the audit trail, automatic restriction, the data boundary) to the NIST AI RMF, the EU AI Act and ISO/IEC 42001. These are learning notes, not a compliance claim. Every mapping links to its primary source, and anything uncertain is marked as such.

## Agent tooling (MCP)

`agent/` is an MCP server that gives a model the tools to look up orders, issue refunds and escalate to a person. Every call goes through the gate and the data filter in `src/store/`. It's separate from the static app: it has its own pinned dependencies and is never deployed. See [agent/README.md](agent/README.md) to run it with Claude Code or Claude Desktop.

## Evidence without integrations

A small team can collect evidence entirely inside Authority Lab (#142): record each test case's real outcome, record or upload results against a Requirement or Target, record a judgment on each Requirement a person decides, and log incidents, feedback and Impact. Compatible results add up; disagreement shows as Conflicting; every Requirement says why it is Met, Not met, Unknown, Conflicting or short of evidence. Only the Northstar demo simulates test results. See `docs/HOW_IT_WORKS.md`, "Collecting evidence without integrations".

## Evidence from other systems

An AI system that runs somewhere else can send evidence about one of its capabilities: one JSON envelope per run, committed to `src/data/external-evidence/` in a pull request and checked by CI. The site imports the committed files into the normal evidence list, labelled with their source. See [docs/EXTERNAL_EVIDENCE.md](docs/EXTERNAL_EVIDENCE.md).

Settings → Workspace also opens **State**, the first real client: a configuration of State's interpretation step, judged only by State's own eval runs (no fictional data). Visitors see its published record read-only; decisions become part of it when their file is committed to `src/data/published-records/`. Evidence sources (Settings → Evidence sources) show where a workspace's evidence comes from; the owner or a stakeholder can also record a result by hand. Each capability's **Configure evidence** maps sources to its checks and shows coverage; in the demo, Refund recommendation is judged by example (fictional) connected sources and a Risk review, and Monitor's Evidence line flags stale evidence and gaps.

## Starting empty

**Settings → Start empty** (the gear at the top right) swaps the Northstar demo for a blank workspace, after confirming that it erases all records (Reset demo asks the same). **Start a workspace** comes first: your name and title (you become its workspace admin) and the names of the workspace and its one workflow. One person is enough; a second admin or a Risk approver is asked for the first time an approval needs one ("You're the only person in this workspace: add someone on People first."). One bootstrap exception (the founding roster) breaks the deadlock: while you're the only workspace admin, you can make one other person a workspace admin without approval, recorded as a founding change. Nothing else skips approval: not the Risk approver right, and never a right to yourself. Once the second admin exists, the two of you set up Risk approvers and every other right through the normal approval rules. Then add the first capability. **Reset demo** brings Northstar back.

## Adding a capability

Since #139, **Capabilities → Add capability** starts a setup draft: Context, a starting point (eight template families or Start from scratch), the capability, Risk and authority, Boundaries, Requirements and Targets, Evidence and People, then **Review and confirm**, where the owner confirms and the starting decision record is written. Nothing is granted before that; suggestions never set numbers and are reviewed one at a time. See `docs/HOW_IT_WORKS.md`, "the setup flow". The paragraph below describes the earlier path, which the seeded and configured capabilities went through. Since #153, Boundary suggestions follow the kind of work (a value limit only for work that acts on money), a Low Risk label next to confirmed exposure facts shows a warning and keeps the baseline safeguards, and the Requirements step asks what must be true, how you'll know and the bar beside each.

**Capabilities → Add capability** asks four questions: What does it do? (name, one sentence), Who owns it?, What happens if it gets this wrong? (the risk profile), and What does it do today? The last is context, not authority: "Nothing yet" and "Not something to delegate" (which needs a reason) start at Level 0; "Recommends", "Drafts for approval" and "Already acts in some cases" start at Level 1, and formalizing any existing autonomy is the first authority decision. It writes the capability's first decision record and lands on its **Setup** checklist, grouped in three stages: Define, Test, Decide. Every tab is always visible; empty tabs say what is missing and link to the next setup step. The **Demo as** picker in the header (default: the capability owner) stands in for sign-in and is the author on records; only active people appear. Reset demo removes added capabilities.

## Building the rules (the delegation contract)

For a new capability, **Setup → Set the boundaries** (**Review the rules**) starts from a template picked by the risk profile plus seeded keyword suggestions labelled "Suggested by AI". Each suggestion is accepted, edited or rejected on its own (no accept-all; rejections stay in the record), all five sections are confirmed (The AI may, Ask a person for these cases, The AI must never, Ask a person whenever this comes up, Authority is reduced automatically when), software checks block empty hard limits above Low impact, contradictions, restriction rules without a number or window, and financial capabilities without a value limit in "may" or "must ask", and a named person saves the rules (**Save rules**) as contract v1. Templates and suggestion rules live in `src/data/contract-templates.js`.

## Success criteria and evidence requirements (Targets and Requirements in the app)

Setup's **Set what good looks like** (**Review the checks**) opens an editor pre-filled from the risk profile, each row labelled with where its default came from. Saving writes v1 of both objects; saves before the first test run write new versions, one activity event per save. Targets are optional and may be "Needs decision" (#137); the minimum-cases row cannot be removed, and loosening or removing a risk-derived default needs a reason that is kept on the version. The suite cannot run until they are saved, and the first run locks them (`criteriaLocked` = saved and `performanceResultsSeen`). After the lock the editor is read-only and changes go through a change request (**Request a change**, #7). Defaults live in `src/data/criteria-defaults.js`.

Each Requirement is hard (it blocks an expansion until it is Met) or a consideration (shown to the person deciding, never blocking). A Proposal can open while hard Requirements are unresolved; Decide shows why it isn't approvable yet (#151).

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

Expanding authority needs a pending proposal; restricting, suspending or redesigning does not, but still needs a named person, a rationale and a record. Status follows authority decisions only: In setup until a person authorizes the move to Draft, then Pilot. Each step must be real before the next: rules before targets, targets before tests, tests before a decision. The Setup page tracks them in three stages (Define, Test, Decide).

1. **Capabilities → Add capability**: the four questions; starts at Level 0 or 1. Writes the capability's first record.
2. **Setup → Set the boundaries**: template plus suggestions, review each one, confirm the sections, **Save rules** (contract v1).
3. **Setup → Set what good looks like**: targets and decision requirements from the risk profile; **Save targets** (v1).
4. **Setup → Configure evidence**: choose which evidence judges each decision requirement (a connected source, Authority Lab tests, or a manual review); **Review evidence coverage** shows what's covered.
5. **Setup → Fill the gaps** (optional): add test cases and run them, record a result by hand, or let a connected source send results. The first measured result locks the targets.
6. **Setup → Name who decides**: the people whose positions will be recorded (best before the first results: after them, changing who is involved needs sign-off).
7. **Setup or Decide → Propose a move to Level N** (once any measured result exists), then **Record decision** in the Decide flow: the capability's second record; a move to Draft sets status Pilot. Later levels follow the same way, one at a time, up to Level 4; Level 3 and above also need evidence from real use (#149).

## People and rights

The roster lives in versioned state (`state.roster`), seeded from `src/data/seed.js`. Each person has a name, title, team, `active` flag and explicit rights `{ riskApprover, workspaceAdmin }`. Only a workspace admin changes the roster (add, edit, deactivate; never delete), always with a reason, as a new version. Granting or removing a right, or deactivating a rights holder, is a proposal by an admin approved by someone else (a different admin, or an existing Risk approver for a Risk approver grant); the recipient of a grant never approves it; the last admin cannot be removed. The one exception is the founding roster (see Starting empty), which never applies to the demo because it starts with two admins. Deactivated people cannot act, propose, approve or be stakeholders. Seed admins: Maya Chen, Jonas Lindqvist. Seed Risk approvers: Daniel Okafor, Sofia Alvarez.

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
