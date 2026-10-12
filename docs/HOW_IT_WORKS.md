# How Authority Lab works

Authority Lab is a prototype of a product that helps a team answer one question about an AI system:

> Based on the evidence we have, what should this AI be allowed to do?

Building an AI workflow is getting easier. Deciding how much to let it do on its own is still hard. Authority Lab is the place where a team tests an AI capability, collects evidence, argues about it, and then makes a deliberate, recorded decision about its authority.

The whole product rests on one rule:

> **AI interprets. Software enforces. Humans authorize.**

The AI reads cases and makes recommendations. Software applies the limits and can pull authority back automatically. Only a named person can give the AI more authority.

Everything in the prototype is fictional. There are no real customers, no real money and no real AI calls. The data is seeded so the same story plays out every time.

---

## 1. The building blocks

### Workspace and workflow

A **workspace** is a team. The demo workspace is **Northstar Support**, the customer support team of an online store.

A **workflow** is a business process the team runs. The demo workflow is **Customer Support Resolution**: a ticket comes in, someone works out what the customer needs, and the problem gets fixed.

### Capability

A **capability** is one discrete thing the AI might be trusted to do inside a workflow. Northstar Support has five:

| Capability | What it does |
|---|---|
| Ticket classification | Puts an incoming ticket in the right queue with the right priority |
| Response drafting | Writes a reply for an agent to edit and send |
| Refund recommendation | Looks at a refund request and says whether to issue it |
| Refund execution > $50 | Actually moves the money for refunds over $50 |
| Account closure | Closes a customer's account |

Each capability holds its own authority. Being good at classifying tickets says nothing about whether the AI should be issuing refunds. That is why they are judged one at a time.

The demo follows **Refund recommendation**.

### Authority levels

Authority is a scale, not a switch:

| Level | Name | What the AI can do |
|---|---|---|
| 0 | Observe | Sees the input, produces nothing |
| 1 | Recommend | Suggests an answer to a person |
| 2 | Draft | Prepares the action, but a person must approve it before anything happens |
| 3 | Act within limits | Acts on its own when predefined conditions are met; everything else goes to a person |
| 4 | Broad delegation | Handles most cases alone, with monitoring and exception handling |

Not every capability should climb the scale. Account closure is at Level 0 on purpose, because closing an account is hard to undo and happens rarely. Level 1 or 2 can be the right permanent home for a capability.

### The delegation contract (Rules in the app)

Every capability has a **delegation contract**: the plain-language rules for what it may and may not do. The app calls it **Rules**. It has five parts, shown on the Rules tab under these headings:

- **The AI may**: things it can do on its own, such as reading order history and recommending a refund.
- **Ask a person when**, in two groups:
  - **For these cases** (must ask): things that always need a person, such as refunds over $100 or accounts with a fraud flag.
  - **Whenever this comes up** (escalation conditions): situations where the AI hands the case to a person, such as low confidence, conflicting policy or a legal threat.
- **The AI must never**: hard limits, such as refunding to a different card or changing who owns an account.
- **Authority is reduced automatically when** (automatic restriction conditions): measurable triggers that pull authority back without waiting for anyone, such as too many severe errors in a week.

The Rules tab also shows **The AI can access**: the data fields the AI may see.

The contract is enforced by software, not by the model's good behaviour. In the demo, a software gate blocks any automatic action on a fraud-flagged account even though the AI once recommended one.

### Risk profile

Each capability carries a simple risk profile: how much **impact** a mistake has, how easy it is to **reverse**, and who is **exposed** (internal only, customer-facing, or financial). A higher-risk capability needs more evidence before its authority grows. Refund recommendation is high impact, financially consequential and recoverable with effort.

### Success criteria (Targets in the app)

Before any testing starts, the team writes down what "good enough" means. The app calls these **Targets**. For Refund recommendation the criteria are quality (at least 92% correct), severe error rate (under 2%), human review burden (no more than 30% of cases needing meaningful correction), speed, cost per case, agent adoption, and stakeholder confidence.

Two of these deserve a note:

- **Adoption is not correctness.** Agents accepting 78% of recommendations does not prove the recommendations are right. The product tracks separately how often accepted recommendations matched an independent reviewer.
- **Stakeholder confidence stays qualitative.** It is a set of positions, not a number.

### Evidence

**Evidence** is anything that tells the team how the capability actually performs. It comes from several sources: automated test scenarios, the live pilot, human reviewers, operational metrics, cost, incidents, user feedback and stakeholder assessments. Every piece of evidence has a status: pass, watch, insufficient evidence, or fail.

Evidence is deliberately kept **segmented**. Refund recommendation scores 94% overall, but only 83% on high-value refunds, and there are only 18 of those. The aggregate number would hide that. The product shows it.

### Evidence requirements and decision readiness (Decision requirements in the app)

For a proposed change in authority, the team lists what must be true first. The app calls these **Decision requirements**. For the move from Level 2 to Level 3, there are six requirements: enough pilot cases, high enough accuracy, low enough severe-error and override rates, no unresolved critical incidents, and at least 40 high-value cases.

**Decision readiness** is simply how many of those are met. The demo shows "5 of 6 checks met" and names the one that is not. There is no readiness score or trust score, because a single number would hide which thing is missing.

### Stakeholder positions

Five people record where they stand: Support Operations, Product, two from Risk, and Finance. Each gives a position and a reason. The product summarises where they agree and where they do not, and never averages them into one opinion. Positions show on the capability's Summary (People involved) and on the decision. Disagreement is useful information.

### The decision

When the evidence is in, a person opens the **authority decision** and chooses one of six options:

| Option | Meaning |
|---|---|
| Expand | Move the whole capability up a level |
| Expand with limits | Let it act alone only under stated conditions |
| Hold | Keep things as they are and gather more evidence |
| Restrict | Move it down a level |
| Suspend | Switch it off |
| Redesign | Send it back to development and testing |

Authority can go down as well as up. All six are first-class choices. For Expand with limits, the conditions are called **Limits** in the app.

The decision page shows a **Recommendation** with its reasons, under the line "Worked out from the evidence. You decide." It cannot authorize anything. A named person writes a rationale and clicks **Record decision**. That click is what changes what the AI is allowed to do.

### The decision record

Every authorization writes a **decision record**: previous and new authority, the decision taken, who authorized it, the scope, the rationale, a snapshot of the evidence at that moment, any open condition, and which version of the contract, criteria, requirements, risk profile and stakeholders was in force (the "Based on" line, which links to those versions). People are saved as they were at that moment too: name, title, team and rights. The same is true of every version, approval, proposal and roster change. Renaming someone, changing their title or team, taking away a right or deactivating them later never rewrites what a record says; the record shows the person as they were, and a new record shows them as they are now. Records are never edited. If something changes later, a new record is written and the old one stays as it was. Months later, anyone can answer "why did we let the AI do this, and what did we know at the time?"

### Amendments (Proposed changes in the app)

The contract, success criteria, evidence requirements, risk profile and stakeholder list are versioned. Editing one writes a new version with the author, the reason, and what changed. The previous version stays exactly as it was, and every decision record names the version of each object that was in force when the decision was made.

An amendment made after performance results have been seen (a recorded test run, a pilot, or a measured evidence item; stakeholder assessments and user feedback alone do not count) is marked **After evidence**, because changing the bar after seeing the results is the kind of thing a reviewer should notice. A decision record that relied on criteria or requirements amended after evidence carries a "Criteria amended after evidence" note. In the seeded demo everything is at version 1; the setup flow and the sign-off rules that use amendments are being built in the open issues.

Every capability has a **Versions** page (from its History tab, or a decision record's "Based on" line) listing each version of its contract, criteria, requirements, risk profile and stakeholders, with who wrote it, why, and what changed from the version before.

### Monitoring and automatic restriction

After authority expands, the capability enters a monitoring period. The product shows how many actions it has taken alone, how many it escalated, how many a person reversed, and how many incidents occurred.

Its **Still safe?** view also shows the **restriction rules** (headed "Safety limits"), read straight from the contract's automatic restriction conditions: the contract is the source of truth. Each line names a threshold, a window and the level the capability falls back to (one level down if the line names none). A rule applies while the capability is above that level, so "returns the capability to Draft" waits until the capability is above Draft; a line that says the capability "stays at" a level opens an incident instead. Monitoring runs whenever at least one rule applies, at any level, and each rule shows its latest reading against its limit (simulated for the seeded capabilities; a capability added in the demo shows "No measurements yet"). For Refund recommendation: if severe errors exceed 5% of the last 50 autonomous cases, authority returns to Draft. Software applies these rules on its own. When a reading crosses a rule, the capability moves to the level the line names, an automatic decision record quotes the rule and the reading, and an alert, an incident and activity events are written; an incident rule opens an incident and raises an alert but leaves authority alone. On screen, an automatic restriction reads "The AI was moved back to <level> after crossing a safety limit." Each seeded capability has a demo control on its Monitoring tab, **Simulate crossing the limit** (**Simulate an incident** for Account closure, whose rule opens an incident); capabilities added in the demo don't.

After a restriction or a rule incident, the owner or a Risk approver (a Risk approver for a High-impact or Financial capability), but not whoever authorized the expansion that was restricted, records a **post-incident review** on the Monitoring tab (the "Review what happened" form, then **Save review**): what happened, the cause and what changed. It clears the review lock and the alert and closes the incident, but authority stays where the rule left it; expanding again goes through a proposal and a named authorization like any expansion. The restriction record shows that it was reviewed. A person has to review before authority can expand again.

This is the other half of the core principle. People grant authority; software can take it back.

### Activity

The **activity history** is an audit-style timeline: pilot started, failure found, gate added, threshold reached, stakeholders reviewed, authority expanded, threshold breached, authority restricted. Every entry links to the thing it describes, so you can follow the thread from evidence to discussion to decision to authority.

---

### Setting up a new capability: the path at a glance

Everything in Authority Lab is done one capability at a time. A new capability goes through seven steps, in this order, and each step has to be real before the next one means anything:

| Step | Where | What it produces | Who |
|---|---|---|---|
| 1. Define | Capabilities → Add capability | The capability (name, summary, owner, risk profile, starting authority at Level 0 or 1, or "not delegated, by design") and its **first decision record** | Whoever is acting; the record names the owner too |
| 2. Rules | Setup → Write the rules | **Contract v1**, from a risk-picked template plus seeded "Suggested by AI" lines, each accepted, edited or rejected one at a time, past the software checks | A named person saves the rules |
| 3. Targets | Setup → Set targets | **Targets v1** and **decision requirements v1**, pre-filled from the risk profile, each row labelled with its source | Whoever is acting |
| 4. Stakeholders | Setup → Name stakeholders | **Stakeholders v1**: team, person, position when known | Whoever is acting |
| 5. Scenarios | Setup → Open the library | The library (a 20-scenario starter set is available), with seeded, deterministic results | Whoever is acting |
| 6. Test run | Evidence → Tests → Run tests | The first evidence, and the **lock** on targets and decision requirements | Anyone |
| 7. First authority change | Summary or Decision → Propose a move to Level N, then Open the decision and Record decision | The capability's **second decision record**; a move to Draft sets status Pilot | A named person authorizes |

Expanding authority needs a pending proposal (the next level, proposed after a test run); restricting, suspending or redesigning does not, but still needs a named person, a rationale and a record. Status follows authority decisions only: a capability stays **In setup** until a person authorizes the move to Draft, then becomes **Pilot**. Saving the rules or the targets does not change it. Every tab of the capability is always visible; an empty tab says what is missing and links to the next step on the Setup page, which tracks the seven steps as Done, Next or Later.

The sections that follow describe each step.

### Starting from an empty workspace

**Start empty**, in the Settings menu (the gear at the top right, beside Reset demo), swaps the Northstar demo for a blank workspace. Both buttons erase every record, so each first asks, inline, "This erases all records in this workspace. Continue?" Until it is set up, every page shows **Set up the workspace**: name the workspace and its one workflow, and record the **founding roster**, the first people with their titles, teams and rights. The founding roster is the only time rights are set directly; it needs at least two workspace admins, because every later rights change is a proposal that a different admin approves. Risk approvers are optional at setup, and coverage warnings explain any gap once High-impact or Financial capabilities exist. The form asks **who is setting this up**, one of the founding admins, and records them as the author of the founding roster; they are acting when the workspace opens. If fewer than two Risk approvers are listed, a note explains that High-impact and Financial changes can't be signed off until the right is granted; it doesn't block setup. From there the Overview points to **Add the first capability**, and everything works exactly as in the demo. **Reset demo** brings Northstar back.

### Adding a capability

**Capabilities → Add capability** walks one capability through the first three setup steps on one page: define it (name, one-line summary, owner), give it a risk profile (impact, reversibility, exposure, failure types to watch), and choose its starting authority. The starting authority is Level 0, Level 1, or "Not delegated, by design", which needs a written rationale. Nothing starts higher; authority above Level 1 is earned later.

Adding the capability writes its first decision record, dated today and authorized by whoever is acting, and version 1 of its risk profile. The contract, criteria, requirements and stakeholders have no versions until they are authored. A non-blocking warning appears when the name reads like a whole process ("handle", "manage") or like two actions joined by "and".

Every tab of a capability is always visible. A tab with nothing to show says what is missing and links to the **Setup** page, a checklist of the steps to the first authority decision: define, contract, criteria and requirements, stakeholders, scenarios, test run, decision. Steps whose editors are not built yet say so.

### Building the contract (the rules)

From a capability's Setup page (or the empty Rules tab), **Write the rules** starts a draft on the **Set up rules** page. A starter template is picked from the risk profile: higher impact adds hard limits and tighter escalation; financial exposure adds fraud, chargeback and value-limit lines; "difficult to reverse" adds an approval line for anything that cannot be undone. On top of the template, seeded suggestions are generated from the capability's name and summary by keyword, each labelled **Suggested by AI** with the word that triggered it. Nothing calls a model; the same name always gets the same suggestions.

Template lines start accepted. Each AI suggestion is pending until you **accept**, **edit** or **reject** it, one at a time; there is no accept-all. You can add your own lines, edit template lines, and remove them. Every change unconfirms its section, and all five sections must be confirmed again before finalizing. Rejected suggestions and removed template lines stay in the record.

In the builder the five sections are The AI may, Ask a person for these cases, The AI must never, Ask a person whenever this comes up, and Authority is reduced automatically when. Software checks run on the draft and block saving when: "The AI must never" or "Authority is reduced automatically when" is empty above Low impact; the same line appears under "may" and "must never" (or "ask a person for these cases"); a restriction rule has no number or no time/case window; a financial capability sets no value limit in "may" (a ceiling) or "ask a person for these cases" (a threshold); a limit that only appears under "must never" does not count. The "Approve the rules" panel shows a plain-English summary, what changed from the template, and who is saving. **Save rules** writes contract v1, with the full review behind it (template, suggestions accepted, edited and rejected, lines added by hand), and records a "Rules saved" event. It does not change authority or status; those follow decisions only.

### Setting targets and decision requirements

Setup step 3 (**Set targets**) opens the **Targets and decision requirements** editor, pre-filled from the risk profile: quality and severe-error thresholds scale with impact, the minimum pilot size scales with impact, financial exposure adds a minimum number of high-value cases, customer-facing exposure adds a customer-visible-errors criterion, and difficult-to-reverse actions add a review-before-effect requirement. Every row says where its default came from; you can edit, remove and add rows. Three core rows (a quality threshold, a severe-error threshold, a minimum case count) can be adjusted but not removed. Lowering a default threshold, reducing a default case count or removing a default row needs a short reason, which is stored on the version and shown beside its diff. "Current" values are not typed; evidence fills them in later.

Saving writes targets (criteria) v1 and decision requirements v1, authored by whoever is acting. Before the first test run you can save again, and each save is a new version. The **Run tests** button stays disabled until both are saved, because the first run **locks** them: the moment performance results exist (a recorded test run, a pilot, or a measured evidence item, the same definition as "after evidence"), the editors become read-only and a "Targets locked" event is recorded. From then on, changing the bar is a proposed change with sign-off (**Propose a target change**, next section).

### Changing the bar after evidence: proposals and sign-off

Three objects are governed once there is something to protect. Changes to them become **proposals** (the new version plus a reason, recorded at once, applied only after sign-off) rather than direct edits:

| Object | Governed from | Direct edits still allowed |
|---|---|---|
| Targets and decision requirements | The first performance results (a recorded test run, a pilot, or a measured evidence item) | Tightening-only changes (applied directly and recorded, see below); before the lock every save is a new version |
| Contract (Rules) | The start of a pilot (a human-authorized move to Draft or above), while the `CONTRACT_EDITS_NEED_SIGNOFF_AFTER_PILOT` setting is on | Before a pilot starts |
| Stakeholders | The first performance results, for adding or removing people and for team labels | Position, stance and reasoning updates, always |

**Tightening only skips sign-off.** A change to locked criteria or requirements that only makes the bar stricter applies straight away, as a recorded amendment marked "tightening only" and shown in Activity. Software decides, not the proposer: every changed row must keep its exact wording, unit and comparison, and only its number may move, upward for an "at least" and downward for an "at most" (more required cases counts). Removing, adding, renaming or re-noting a row, an equal number, or any loosening anywhere sends the whole change to the normal proposal and sign-off. The shortcut is only for the capability owner or a named stakeholder, and never while an expansion decision is pending; otherwise a tightening goes to sign-off, and the proposal says why. The decision workspace lists every change to the bar since the decision opened.

**Who must approve.** The proposer never approves. For Low and Medium impact, one approver: the owner, or any other named stakeholder if the owner proposed. For High impact or financial exposure, two different approvers, at least one from Risk; the last slot is refused to a non-Risk person while no Risk approval exists. Owners can still propose. "Named stakeholders" are the owner and the people on the capability's list; whether one of them counts as Risk is the recorded Risk approver right on the People page, never a team name or a label on the list. Use the **Acting as** picker to propose and to approve as each person.

**What the sign-off screen shows.** The reason, how many approvers have signed and whether Risk has, who was eligible when the proposal opened, what would change, and, for criteria, readiness under both versions ("5 of 6 met now, 6 of 6 under the proposal") with a flag when the proposal makes the capability look more ready without new evidence.

**Outcomes.** Approving writes the new versions, authored by the proposer and carrying the approvals, and records a surfaced "amended after evidence" event; any later decision that relies on them is marked "Criteria amended after evidence". Rejecting (by an eligible approver) and withdrawing (by the proposer) both need a reason and stay in the record. One proposal per object can be open at a time.

A proposed contract must pass the same software checks as the builder's finalize step before it can be submitted. A proposal is refused at the moment it is made if the eligible approvers could never satisfy the rule (for example when the only Risk person on the list is the proposer); the message says what to do.

### Naming stakeholders

Setup step 4 is a short editor: team, person, and, when known, their position and reasoning. Every save is a new version. Positions are kept as positions and shown in the capability's Summary (People involved, where **Manage stakeholders** opens this editor) and in the decision workspace; they are never averaged into a score. A capability's named stakeholders are also who can sign off amendments, so a High-impact or financial capability needs someone from Risk on the list.

### Writing the scenario library

Setup step 5 is the scenario library: name, situation and expected behaviour in each of the five groups (standard, ambiguous, adversarial, high impact, edge). A starter set of twenty scenarios, four per group, phrased for the capability and labelled "Suggested by AI", gets a team past the blank page; the editor nudges toward twenty to thirty in total. Results are seeded and deterministic: a new or changed scenario gets a simulated result when it is saved, labelled "Simulated" in the test results, and the same scenario always gets the same result, so the suite replays. Changing the library after a run clears that run; the next run re-records. Evidence › All evidence carries a placeholder card for the evidence sources a real deployment would connect.

### The first authority change

After the first test run, the Summary, the Decision tab and the Setup page offer **Propose a move to Level N**, one level at a time. That opens the authority decision for the capability: targets not yet measured, 0 of N checks met, the test results in the evidence snapshot, stakeholder positions where recorded. A person records the decision (**Record decision**) as whoever is acting, which writes the capability's second record. A move to Draft sets the status to Pilot and starts no monitoring, because every case is approved by a person; monitoring begins only at Level 3.

### People

The **People** page (**Settings → People**, the gear at the top right) is the workspace roster: name, title, team, whether the person is active, and two explicit, recorded rights. **Workspace admin** can change the roster; **Risk approver** can sign off as Risk. Rights are recorded on the person, never inferred from a team name. In the seed, Maya Chen and Jonas Lindqvist are workspace admins, and Daniel Okafor and Sofia Alvarez hold the Risk approver right.

Only a workspace admin adds a person, edits a name, title or team, or deactivates someone, and every change records the admin and a reason as a new roster version, with the history and a before/after diff on the page. Nobody is ever deleted: records, approvals and stakeholder lists keep referring to people after they are deactivated. A deactivated person cannot be the acting person, cannot propose, cannot approve, and cannot be added as a stakeholder, and drops out of the pickers.

The page opens with a **Workspace** section (**Settings → Workspace** jumps to it): the workspace and its workflow, with an **Edit** control for workspace admins. Renaming either, or changing a description, is a direct edit that needs a reason; it is recorded with who made it and shown in Activity. Records written before a rename keep the names in force when they were written, and a record page shows "as named then" alongside today's names.

Each row's **Manage** menu holds the admin actions for that person: edit name, title or team; grant or remove each right; deactivate. The person currently acting is tagged "Acting now" next to their name.

Rights are governed. Granting or removing the Risk approver or workspace admin right, and deactivating anyone who holds a right, is a proposal made by a workspace admin and approved by someone else: a **different** workspace admin, or, for a Risk approver grant, an existing Risk approver. The proposer never approves. For a grant, the person receiving the right never approves either, so nobody grants a right to themselves and nobody waves through their own. For a removal, the person losing the right may approve it. A change that would leave no workspace admin is refused. Open roster changes, with approve, reject and withdraw, sit on the People page. Changing someone's team changes nothing about what they can approve: Risk eligibility is only ever the recorded right.

### Coverage warnings

Sign-off only works if the right people exist. Two warnings watch for that, and neither blocks anything; they explain the gap and point at the People page.

- **Risk coverage.** A High-impact or financial capability needs two approvers with at least one from Risk, and one of the two could be the proposer, so it needs at least two active Risk approvers among its possible approvers (the owner and the people on its stakeholder list). When it has fewer, the capability page and the People page say so and name who is left, linking to **Manage stakeholders** (usually the fix is adding an existing Risk approver to the list) and to People. The Overview's To do list shows one item per short capability ("Add a second Risk approver to …").
- **A proposal that can no longer complete.** A proposal freezes its eligible approvers when it opens. If one of them is deactivated or loses the Risk approver right and the rule can no longer be satisfied, the sign-off screen, the proposal lists and the Overview's To do list flag it and suggest that the proposer withdraw and propose again, which freezes a fresh set.

When a workspace admin proposes removing a right or deactivating someone, the form shows what that change would do to coverage: which capabilities would fall short and which open proposals could no longer complete. The change still goes through; the reason, which is always required, is where to say why. The impact is kept on the roster change so the approving admin sees it too.

### Acting as

The header's demo area (top right) has a **Demo** label, a picker labelled **Acting as**, the demo date, and the **Settings** menu (the gear) with People, Workspace, Start empty and Reset demo. It is a demo control: a real version would know who is signed in, and the picker stands in for sign-in so one visitor can show different people proposing, approving and authorizing. Only active people appear in it. It defaults to the owner of the capability you are looking at and can be switched to any named person; on the Add capability page, choosing an owner switches it to that owner. Whoever is acting is recorded as the author of records written from that screen: the first record when adding a capability, and the authorization on a decision. When the acting person is not the owner, the record shows both. This is what lets a proposer and an approver be different people when sign-off rules arrive.

## 2. The screens

The top navigation has three places: **Overview**, **Capabilities** and **Records**. People, Workspace, Start empty and Reset demo sit in the **Settings** menu (the gear, top right), next to **Acting as**. Each page opens with one sentence, with more behind **How this works**.

**Overview** answers "what needs me, and what is the AI allowed to do?" It has four sections, in this order: **To do** (concrete next actions, most urgent first, such as a review after an automatic restriction or a decision that is ready), **Approvals needed** (actions waiting for a person and proposed changes, with who can approve), **Important results** (only results that block, cause or call into question an authority level), and **Current authority** (each capability's level in plain words and what is next). Each item names its capability and the person it waits on.

**Capabilities** is the authority map: every capability, its current authority, status, risk, owner and last evaluation, plus the Add capability button. This is the page for "what is the AI actually allowed to do here?"

**Capability detail** is the full picture of one capability, with six tabs:

- **Summary** leads with the authority: the level, what it means, the next possible level, the main concern, and whether a decision is ready. Below it are the people involved (with their positions and **Manage stakeholders**) and this capability's open tasks and approvals.
- **Rules**: the delegation contract, the data the AI can access, and the risk profile.
- **Evidence**, with six views: **Results** (the pilot, its segments and what the AI tried), **All evidence** (filterable by status, source, segment and risk), **Decision requirements**, **Targets**, **Tests** and **Model runs**.
- **Decision**: the open decision, one click from the decision workspace, with **Approvals** (actions waiting for a person) beside it; the tab shows a count when any are waiting.
- **Monitoring**, with two views: **Still safe?** (status, review, counters, safety limits and the demo control) and **Delivering value?** (expected impact vs actual, return on investment and how people are using it).
- **History**: the decision records, proposed changes, versions and a link to the capability's activity.

Outside the Summary, the level shows once at the top right of the capability.

**Evidence → Tests** is the testing ground: 26 scenarios in five groups (standard, ambiguous, adversarial, high impact, edge cases). Before the first run the groups are collapsed with their counts beside one **Run tests** button; after a run, groups with failures come first and open, and a filter bar narrows by result and group. Running the tests shows each scenario's expected behaviour, what the AI did, the outcome, the severity, and what the human reviewer decided. One scenario fails badly on purpose: a $420 refund on a fraud-flagged account was recommended instead of escalated.

**Records → Decisions** lists every authority change and opens the decision workspace for the pending one. The workspace is a set of numbered steps: choose an option, Limits (for Expand with limits), the rollout plan, the expected impact, and why. The options, the "What this would mean" preview, the rationale, a checklist of the steps and the **Record decision** button share one panel that stays in view; the evidence, the recommendation and stakeholder positions sit in an open section beside them.

When an action can't go through (a missing rationale, a rule that refuses it), the reason appears as a notice on the same page. Dates read "Oct 7", with the year only when it differs from the current one, and hovering any authority level shows what it allows.

**Records → Activity** is the timeline. Every event is recorded. The default view ("Important") shows decisions, automatic restrictions, test runs, pilot milestones, failures, mitigations, stakeholder reviews, and amendments made after evidence; "Everything" shows the rest, including setup-type events such as targets being defined and amendments made before any results existed. Both views filter by kind and by capability, and an amendment expands to a before/after table.

Old addresses still work: `src/routes.js` rewrites the old tabs and the old Tests, Evidence, Agent runs, Activity and Decisions addresses to where they live now.

---

## 3. The demo, step by step

1. **Overview.** To do leads with the decision on Refund recommendation: five of six checks met. High-value refunds are the gap, and Important results shows them (18 cases at 83%).
2. **Capabilities, then Refund recommendation, Rules tab.** Read the rules: what the AI may do, when it must ask a person, what it must never do.
3. **Evidence tab, Tests, Run tests.** 24 of 26 pass. Open the failed filter and read H-04, the fraud-flag miss.
4. **Evidence tab, Results.** 218 pilot cases at 94% overall. 18 high-value cases at 83%.
5. **Summary tab, People involved.** Operations wants to expand everything. Risk wants anything over $50 kept with a person.
6. **Open the decision** (from the Overview, the Summary or the Decision tab). The evidence, the recommendation and the positions sit beside the decision panel.
7. **Choose Expand with limits.** Set the limits (value at most $50, no fraud flag, clear policy, confidence at least 90%, no chargeback), and check the rollout plan and the expected impact, both prefilled for the demo. Read what the option would mean.
8. **Record decision.** Record #04 is written with the evidence snapshot. Current authority now shows Level 3 (with limits).
9. **Monitoring tab, Still safe?, Simulate crossing the limit.** Three severe errors land in the rolling window. Software moves the capability back to Draft ("The AI was moved back to Draft after crossing a safety limit."), writes record #05, puts a review at the top of the Overview's To do list, and locks expansion until a review is recorded.
10. **Monitoring tab, Review what happened.** Refund recommendation is High impact, so switch Acting as to a Risk approver (Daniel Okafor or Sofia Alvarez). Write what happened, the cause and what changed, then **Save review**. The lock and the alert clear, and the restriction record shows the review; authority stays at Draft until a new proposal is authorized.
11. **Settings → Reset demo** (the gear at the top right) puts everything back.

---

## 4. What the controls actually do

| Control | Effect |
|---|---|
| Run tests | Runs the 26 scenarios, records the result as evidence, adds an activity event |
| Decision options | Choose Expand, Expand with limits, Hold, Restrict, Suspend or Redesign |
| Limits | Edit the authority conditions for Expand with limits; the preview updates in plain English |
| Record decision | Changes the capability's authority, writes an immutable record, starts monitoring if authority expanded |
| Simulate crossing the limit | On a seeded capability (Simulate an incident for Account closure), simulates a reading that crosses its contract rule; software moves it to the level the rule names, creates an alert, an incident, an event and a record, and requires review (an incident rule opens an incident only) |
| Add capability | Defines a capability, its risk profile and starting authority; writes its first decision record |
| Write the rules (contract builder) | Starts from a template, reviews each AI suggestion, runs the software checks, saves contract v1 with Save rules |
| Set targets (targets editor) | Saves targets and decision requirements (defaults from the risk profile); the first test run locks them |
| Propose a change | After the lock (targets) or a pilot start (contract), submits a change for sign-off; approve or reject as whoever is acting |
| Manage stakeholders (stakeholder editor) | Names the stakeholders and records positions when known; every save is a new version |
| Open the library (scenario library) | Adds a starter set (Add 20 suggested cases) or writes scenarios; results are seeded and deterministic |
| Propose a move to Level N | After the first run, opens the authority decision for a new capability; recording the decision writes its second record |
| Approvals: Approve / Reject | On Decision › Approvals, the owner or a named stakeholder decides an action the gate sent to a person, with a reason; approving re-runs the gate first |
| Save review | Records the post-incident review after an automatic restriction or rule incident; clears the review lock and the alert, leaves authority where it is |
| People | Workspace admins add, edit and deactivate people, each change versioned with a reason; rights are shown, never inferred |
| Coverage warnings | Flag a High/Financial capability short of two active Risk approvers and any open proposal that can no longer complete; never block; the People page forms show the impact of a change before it is proposed |
| Acting as | A demo stand-in for sign-in; chooses who is authoring records from this screen, defaulting to the capability owner; only active people appear |
| Start empty (Settings) | After an inline confirmation, swaps the demo for a blank workspace to set up from scratch: workspace, workflow, founding roster and who is setting it up |
| Reset demo (Settings) | After an inline confirmation, restores the seeded Northstar demo, removing any added capabilities or a workspace started empty |

State is kept in your browser, so you can refresh without losing your place.

---

## 5. How it is built

The prototype is a static web app: plain HTML, CSS and JavaScript, no build step, no dependencies, no server.

- `src/data/seed.js` holds all the fictional data: the workspace, capabilities, contracts, criteria, scenarios, pilot results, evidence, stakeholders, past decisions, activity and the monitoring rule.
- `src/store/` (imported through `src/store/index.js`) holds the rules for how state changes: running tests, choosing and authorizing a decision, the automatic restriction, reset. These are plain functions with tests.
- `src/store/gate.js` holds the gate, `checkAction`: whether an AI action may happen (allow, needs a person, block), by authority level, contract, recorded limits and the facts in systems of record. The agent's tools call it on every action, and what it decided shows under Evidence › Results, "What the AI tried".
- `src/store/tools.js` holds the agent's tools, `lookup_order`, `issue_refund` and `escalate_to_human`. Each call goes through the gate, and only executes on an allow. Results are filtered to the contract's data section (**The AI can access**, on the Rules tab) against fictional seeded systems of record: orders, customers, fraud flags, chargebacks and a refund ledger. Card numbers and full addresses never reach the model.
- `src/store/queue.js` holds the queue of actions waiting for a person: actions the gate sent to a person wait on the capability's Decision › **Approvals** view, and show in the Overview's Approvals needed. The owner or a named stakeholder approves or rejects each one, with a reason. Approving re-runs the gate first, and refuses if anything changed since the action was queued: a restriction, a crossed cap, or a newly blocked order. The demo opens with two refund requests waiting on Refund recommendation.
- `src/store/gatelog.js` logs every gate decision, and every person's decision on a waiting action. Each event is labelled seeded, this session, or recorded. Evidence › Results shows the counts and the latest events as **What the AI tried**. All evidence adds three items derived from the log (allowed, sent to a person, blocked), marked as derived. A restriction rule the log can measure, such as Refund recommendation's "3 attempts at a must-never action within 7 days", restricts the capability as soon as it's crossed.
- `agent/` (not part of the deployed site) is an MCP server that offers those three tools to a model such as Claude, through the same gate and filter. See `agent/README.md` to connect it to Claude Code or Claude Desktop.
- `src/views/` holds one module per screen. Screens read state and draw it; they never change it directly.
- `styles/app.css` is the design. Colour always carries a state (pass, watch, fail, insufficient evidence, restricted, decision required) and is always paired with a word.

Nothing calls a model. In a real version, the evidence would come from outside: a test harness, a ticketing system, a payments system, a model API, an eval framework. Authority Lab would sit above those systems and turn what they report into a decision about authority.

---

## 6. What it is not

Authority Lab is not an agent builder, a prompt editor, a model playground, an eval platform, an observability dashboard, a compliance suite or a ticketing system. Those tools produce evidence. This product turns evidence about an AI capability into an explicit, reviewable decision about what that capability is allowed to do.

---

## 7. Glossary

- **Authority**: what an AI capability is allowed to do, on a scale from Observe to Broad delegation.
- **Capability**: one discrete thing the AI might do inside a workflow.
- **Delegation contract** (**Rules** in the app): the written rules for a capability: may, ask a person (for these cases, and whenever this comes up), must never, and when authority is reduced automatically.
- **Evidence**: any measured or recorded fact about how the capability performs.
- **Success criteria** (**Targets** in the app): what "good enough" means for a capability.
- **Evidence requirement** (**Decision requirement** in the app): something that must be true before a specific authority change can be authorized.
- **Decision readiness**: how many decision requirements are met ("X of Y checks met"), and which are not.
- **Authority conditions** (**Limits** in the app): the conditions under which Expand with limits lets the AI act on its own.
- **Amendment** (**Proposed change** in the app): a rule, target or stakeholder change, applied directly or after **Approval** from **Who can approve**.
- **Approvals**: actions the gate sent to a person, waiting for someone to approve or reject them.
- **Recommendation**: the option the app works out from the evidence; it never authorizes anything.
- **Severe error**: a mistake with high impact, such as approving a fraudulent refund or denying a clearly valid one.
- **Override**: a reviewer rejected the AI's recommendation and did something else.
- **Edit**: a reviewer changed the recommendation before approving it.
- **Acceptance**: a reviewer approved the recommendation. Not the same as the recommendation being correct.
- **Decision record**: the immutable write-up of one authority change.
- **Automatic restriction**: software reducing authority when a predefined threshold is crossed. On screen: "The AI was moved back to <level> after crossing a safety limit."
- **Monitoring period**: the time after an authority change when the capability is watched against its restriction rule.
