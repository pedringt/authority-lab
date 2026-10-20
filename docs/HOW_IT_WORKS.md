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

### The delegation contract (the rules, or boundaries, in the app)

Every capability has a **delegation contract**: the plain-language rules for what it may and may not do. The app calls them the **rules**, and the Status tab sums them up as **Boundaries**. They have five parts, shown in full under **Status → All rules** (`?tab=status&show=rules`) with these headings:

- **Allowed** (may): things it can do on its own, such as reading order history and recommending a refund.
- **Requires human review**, in two groups:
  - **For these cases** (must ask): things that always need a person, such as refunds over $100 or accounts with a fraud flag.
  - **Whenever this comes up** (escalation conditions): situations where the case goes to a person, such as low confidence, conflicting policy or a legal threat.
- **Never allowed** (must never): hard limits, such as refunding to a different card or changing who owns an account.
- **Automation is pulled back if** (automatic restriction conditions): measurable triggers that pull authority back without waiting for anyone, such as too many severe errors in a week.

The same page shows **Data it can access** (the data fields the model may see) and the risk profile. The rules builder still uses the formal headings (The AI may, Ask a person for these cases, and so on).

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

Evidence can also be **imported** from an AI system that runs somewhere else: one envelope per run, committed to the repo and checked by CI, carrying a summary and a reference back to the source, never its content (see `docs/EXTERNAL_EVIDENCE.md`). Each result lands in the same evidence list, labelled with its source and marked **Not judged yet** until a target is bound to it. A retry changes nothing; a correction is new evidence. Imported results count as performance results, so they lock the targets like a test run. Every item is labelled **Demo data**, **Recorded in this workspace** or **Imported from …**, and an imported one opens "Where this came from" with its run, versions and link. If a source's model, prompt, eval set or other version changes, results from the earlier configuration stay visible but are marked and never count toward targets; a decision record keeps the imported evidence and configuration in force when it was made.

**Workspaces.** Settings → Workspace switches between the Northstar demo (fictional) and **State**, a real client configuration: one person, one capability ("Interpret incoming project evidence", State's interpretation step), and one connected source, State's review eval suite. State holds no fictional data; until its results arrive, its checks show "no results yet". The demo is a sandbox saved in each visitor's browser. State shows its **published record**, read-only, to everyone: its configuration, the evidence committed so far, and the decisions published so far. "Try changes in this browser" (in the banner) lets anyone experiment there, marked as not published. A decision becomes part of the real record when its file (shown on the decision's record page) is committed to `src/data/published-records/`; it is then replayed through the same checks on every load.

**Evidence sources** (Settings → Evidence sources) list where a workspace's evidence comes from: Authority Lab tests and manual review are built in, and a connected system (an eval suite, a ticketing system, product analytics) appears once it sends its first evidence, with the metrics it has sent and when. Connecting a system is the implementation team's job; nothing on that page configures one. The owner or a named stakeholder can **Record a result** by hand (All evidence → Record a result): what was measured, on test cases or in real use, the result (passed of a number of cases, a number of events, or a single number), and optionally a segment, severity, note and link. It's kept exactly as recorded, labelled with who recorded it, and counts like any other measured result.

**Configure evidence** (on Setup, and at `#/capabilities/<id>/evidence/configure`) shows each decision requirement and target with the evidence that judges it and its coverage, a headline such as "5 of 6 decision requirements have sufficient evidence; "Minimum 40 high-value refund cases" still needs more cases (18 of 40 cases)", and a suggestion for each gap. In the demo, Refund recommendation is judged by example connected sources (a support platform, ticketing, an eval suite last run on Sep 3, so its quality target is stale) and a Risk review recorded by hand, all fictional and labelled demo data. Monitor's **Evidence** line lists what to look at: new evidence since the decision in force, stale evidence, coverage gaps, disagreement, and checks no longer met. Warnings only.

A target or decision requirement can be **measured** from imported evidence: it names an imported metric (and segment) and the bar, in words and as a number that must agree. Its "now" and status then come from the newest result under the current configuration, so readiness ("X of Y checks met") moves with real results. Production results on fewer than 20 cases (or a row's own minimum) are **Too early to judge**; an already-exceeded ceiling on severe failures fails at once. A contract's automatic-restriction line can be measured the same way from production results, and crossing it pulls authority back automatically. Evidence never grants more authority: a person decides.

Evidence is deliberately kept **segmented**. Refund recommendation scores 94% overall, but only 83% on high-value refunds, and there are only 18 of those. The aggregate number would hide that. The product shows it.

### Evidence requirements and decision readiness (Decision requirements in the app)

For a proposed change in authority, the team lists what must be true first. The app calls these **Decision requirements**. For the move from Level 2 to Level 3, there are six requirements: enough pilot cases, high enough accuracy, low enough severe-error and override rates, no unresolved critical incidents, and at least 40 high-value cases.

**Decision readiness** is simply how many of those are met. The demo shows "5 of 6 checks met" and names the one that is not. There is no readiness score or trust score, because a single number would hide which thing is missing.

### Stakeholder positions

Five people record where they stand: Support Operations, Product, two from Risk, and Finance. Each gives a position and a reason. The product summarises where they agree and where they do not, and never averages them into one opinion. Positions show on the capability's Status tab (**People involved**) and in the Decide flow (**Stakeholder positions**). Disagreement is useful information.

### The decision

When the evidence is in, a person opens the **authority decision** (the capability's **Decide** tab) and makes one of four plain choices. Each maps to one of six recorded options, and the screen says which ("recorded as …"):

| Choice in the app | Recorded option | Meaning |
|---|---|---|
| Expand autonomy → Within limits | Expand with limits | Let it act alone only under stated conditions |
| Expand autonomy → Broad autonomy | Expand | Move the whole capability up a level |
| Keep current limits | Hold | Keep things as they are and gather more evidence |
| Reduce autonomy → One level down | Restrict | Move it down a level |
| Reduce autonomy → All the way back to Observe | Suspend | Switch it off |
| Pause and redesign | Redesign | Send it back to development and testing |

Authority can go down as well as up. Nothing is chosen for the person, and the record keeps the exact option. Below Level 3, Expand autonomy has no second question. For Expand with limits, the conditions are called **Limits** in the app.

The flow shows a **Recommendation** ("Recommended: …") with its reasons behind "How it was worked out", under the line "Worked out from the evidence. You decide." It cannot authorize anything. A named person writes why and clicks **Record decision as <name>**. That click is what changes what the AI is allowed to do.

### The Proposal (#144)

A move up starts with a **Proposal**: anyone active clicks **Propose a move to Level N**. Proposing freezes what that person saw, and it isn't a decision: nothing changes for the AI, and the reason box starts empty. The Decide flow then opens on **What changes if I approve this?**: what the AI does now and would do, what becomes newly permitted, what still needs a person, what stays prohibited, and every Boundary marked as written or enforced. **What do we know?** shows today's evidence, with "When it was proposed" beneath it: the frozen Requirement and Target results, coverage, and the gaps, Unknowns and conflicts, plus anything that has moved since. **Who has said what?** shows Reviewers and Stakeholders side by side. A Reviewer with no position yet is waited for, and a Reviewer saying Hold or Restrict is shown plainly, though it isn't a veto. **Risk** shows the initial Risk and the controls, and asks the person deciding for a Residual Risk (Low, Moderate, High or Unknown, with why). Software never scores it.

**Who records it.** Only the Owner records more authority or keeping the current limits. Anyone named on the capability can record pulling it back (one level down, all the way to Observe, or redesign).

**Before authority expands**, every Reviewer has given a position, a Residual Risk with a reason is given, and the Proposal is current. A Proposal goes **stale** when, since it was frozen, any of these happens:

- the Rules, Targets, Requirements or Risk get a new version;
- who is named on the capability, or their role (Reviewer or Stakeholder), changes;
- a material change is recorded;
- a Requirement or Target result changes;
- a row's coverage changes state, for example from sufficient to stale.

More evidence that changes none of these doesn't make it stale, and neither does a Reviewer or Stakeholder giving or changing their position: that is reviewing it. The flow shows current positions beside the ones frozen with the Proposal, and the record keeps the positions in force when the Decision is made. A stale Proposal can't be expanded on. **Replace with a new Proposal** freezes a fresh one from today's conditions; the old one stays as it was, marked as replaced, and History lists both. Keeping the limits or pulling back works on a stale Proposal too, and the record says it was stale. The seeded Northstar decision was opened before Proposals were frozen, and the flow says so instead of showing a snapshot.

### The decision record

Every authorization writes a **decision record**: previous and new authority, the decision taken, who authorized it, the scope, the rationale, a snapshot of the evidence at that moment, any open condition, and which version of the contract, criteria, requirements, risk profile and stakeholders was in force (the "Based on" line, which links to those versions). People are saved as they were at that moment too: name, title, team and rights. The same is true of every version, approval, proposal and roster change. Renaming someone, changing their title or team, taking away a right or deactivating them later never rewrites what a record says; the record shows the person as they were, and a new record shows them as they are now. On screen a record is titled "Authority change #NN" (its id is `AC-NN`) and links to a one-page brief. Records are never edited. If something changes later, a new record is written and the old one stays as it was. Since #144 a record also names the Proposal it answered and freezes what the person deciding saw: Requirement and Target results with their reasons, coverage, Boundaries with enforcement, the initial Risk, the Residual Risk, every position, whether the Proposal was stale, and which evidence produced each result. That evidence covers results recorded by hand or uploaded (every item behind a combined result), test outcomes, people's judgments and incidents. So a decision made on evidence recorded by hand never has an empty "Evidence at the time". Months later, anyone can answer "why did we let the AI do this, and what did we know at the time?"

### Amendments (Proposed changes in the app)

The contract, success criteria, evidence requirements, risk profile and stakeholder list are versioned. Editing one writes a new version with the author, the reason, and what changed. The previous version stays exactly as it was, and every decision record names the version of each object that was in force when the decision was made.

An amendment made after performance results have been seen (a recorded test run, a pilot, or a measured evidence item; stakeholder assessments and user feedback alone do not count) is marked **After evidence**, because changing the bar after seeing the results is the kind of thing a reviewer should notice. A decision record that relied on criteria or requirements amended after evidence carries a "Criteria amended after evidence" note. In the seeded demo everything is at version 1; the setup flow and the sign-off rules that use amendments are being built in the open issues.

Every capability has a **Versions** page (from its History tab, or a decision record's "Based on" line) listing each version of its contract, criteria, requirements, risk profile and stakeholders, with who wrote it, why, and what changed from the version before.

### Is the current Authority still justified? (#147)

Monitor's first view, **Still justified?**, starts with that question. It shows:
- the Authority now and the Decision in force;
- the Boundaries, and any automatic restriction or review lock;
- **what changed since that Decision**, compared with what the Decision froze (its results, coverage, positions and the evidence behind each result);
- an answer in plain words: Current Authority still supported, Needs attention, Investigation needed, Authority may no longer be justified, or Restricted automatically.

There's no score. Each change has its own line saying how serious it is. A starting record, or a Decision made before Decisions froze what they were based on, has nothing to compare results with, and Monitor says so.

**Material changes** (model, prompt, tools, permissions, workflow, scope, users, data, operating context, jurisdiction, Boundaries) can be recorded from Monitor by the Owner or anyone named. For each change since the Decision, Monitor lists the Requirements and Targets whose current result rests on evidence from before the change: it "may need new evidence". It hasn't failed, and Authority doesn't change.

**What you can do:**
- **Investigate:** see the evidence, or record a result, a judgment or an incident. Nothing changes.
- **Reduce or pause:** reduce one level, **Pause** (all the way to Observe; recorded as Suspend, with an optional planned review date), or send it back for redesign. Anyone named can record it with a reason, and no Proposal is needed. The review date is a reminder; nothing changes on it.
- **Restore or expand:** never automatic. After a reduction, Pause or automatic restriction, Decide offers "Propose: restore toward Level N". It's the normal Proposal, one level at a time, shown with the earlier Authority, why it came down, any review and incidents, what has changed since, and new evidence.
- **Retire:** the Owner only, with a reason. It's final. The capability stops operating, any open Proposal closes, no Decision or Proposal can follow, and its history stays. Retired is not the same as "Not delegated, by design". To use the work again, set up a new capability.

**Operating above approved Authority** (#149) is one of the most serious states. When the recorded observed behavior (the baseline's effective level) is above the approved Authority, Monitor shows both, says further expansion is blocked, and offers two ways to resolve it: bring behavior back within approved Authority and record what it does now, or govern the observed behavior through the normal Proposal and Decision, one level at a time. Status, Decide, Overview and Capabilities show the gap too. It never blocks reducing, pausing, retiring or recording corrected behavior, and Authority Lab changes neither level on its own. State starts in this state: approved for Recommend, observed at Draft.

Apart from that one, none of Monitor's states blocks anything by itself. Exceptions aren't built yet: how they would interact with the runtime gate is still to be decided.

### Monitoring and automatic restriction

After authority expands, the capability enters a monitoring period. The product shows how many actions it has taken alone, how many it escalated, how many a person reversed, and how many incidents occurred.

Its **Still justified?** view continues, under **Automatic safety limits**, with a verdict (Within limits, Over a safety limit, Autonomy reduced, Needs review, or Nothing to monitor yet), then a **Safety limits** line listing the **restriction rules**, read straight from the contract's automatic restriction conditions: the contract is the source of truth. Each line names a threshold, a window and the level the capability falls back to (one level down if the line names none). A rule applies while the capability is above that level, so "returns the capability to Draft" waits until the capability is above Draft; a line that says the capability "stays at" a level opens an incident instead. Monitoring runs whenever at least one rule applies, at any level, and each rule shows its latest reading against its limit (simulated for the seeded capabilities; a capability added in the demo shows "No measurements yet"). For Refund recommendation: if severe errors exceed 5% of the last 50 autonomous cases, authority returns to Draft. Software applies these rules on its own. When a reading crosses a rule, the capability moves to the level the line names, an automatic decision record quotes the rule and the reading, and an alert, an incident and activity events are written; an incident rule opens an incident and raises an alert but leaves authority alone. On screen, the verdict reads "Autonomy reduced": "<capability> was moved back to <level> after crossing a safety limit on <date>." Each seeded capability has a demo control on its Monitor tab, **Simulate a safety-limit breach** (**Simulate a safety-limit incident** for Account closure, whose rule opens an incident); capabilities added in the demo don't.

After a restriction or a rule incident, the owner or a Risk approver (a Risk approver for a High-impact or Financial capability), but not whoever authorized the expansion that was restricted, records a **post-incident review** on the Monitor tab (a form headed "Needs review" after a restriction, or "Review what happened" after a rule incident, then **Save review**): what happened, the cause and what changed. It clears the review lock and the alert and closes the incident, but authority stays where the rule left it; expanding again goes through a proposal and a named authorization like any expansion. The restriction record shows that it was reviewed. A person has to review before authority can expand again.

This is the other half of the core principle. People grant authority; software can take it back.

### Activity

The **activity history** is an audit-style timeline: pilot started, failure found, gate added, threshold reached, stakeholders reviewed, authority expanded, threshold breached, authority restricted. Every entry links to the thing it describes, so you can follow the thread from evidence to discussion to decision to authority.

---

### Collecting evidence without integrations (#142)

A small team with no eval, observability or data stack can collect everything an authority decision needs inside Authority Lab. A capability's **Evidence** page (Configure evidence) lists each Requirement and Target with its evidence, its coverage and its **Result**: Met, Not met, Unknown, Conflicting, Not enough evidence, No evidence yet or Needs decision, each with the reason. Only Met counts toward readiness.

- **Test cases record real outcomes.** Outside the Northstar demo, Authority Lab never runs anything: the team runs each case through its real AI and uses **Record outcome** (Pass / Fail with severity / Unable to judge, what happened, an optional link). The latest outcome per case feeds the built-in tests source; Unable to judge is left out of the rate. Only the demo simulates, labelled as such.
- **Record result** on a Requirement measured by results people record, or on a Target, records a result by hand or **uploads** a CSV/JSON file: one row per case with an `outcome` column (totalled by Authority Lab), already-totalled rows (`passed`/`total`, or `value`), or an evidence envelope. A Target's first result links it to manual results. An evidence-judged Requirement with no evidence chosen yet is linked the same way by its first result, or through **Choose evidence**, which starts on results people record here. A person-judged Requirement never gets evidence chosen; changing how it is judged is an edit to the Requirement. After results exist, linking a row needs approval, as before. An upload stays in this browser and keeps its file name, source label, who imported it, and its dates and case counts.
- **Record judgment** on a Requirement a person decides (Met / Not met / Unknown, with a reason). Every Requirement says how it is judged ("How will you know this is true?": a person reviews and decides, or evidence shows it); it is set when the Requirement is suggested or written, never inferred from its wording. An evidence-judged Requirement with no evidence chosen yet reads No evidence yet; a coverage rule and a Requirement with linked Targets are always judged by evidence, and a Requirement with linked Targets takes their result. Older Requirements that don't say how they're judged (18 in the demo) keep their stored result and show "Not set yet (older Requirement)" with **Set how it's judged**. The Owner's and Reviewers' latest judgments decide it; a Stakeholder's is input only.
- **Incidents, feedback and Impact** are recorded on their own page. An open (or under-review) **critical** incident makes "No unresolved critical incidents" Not met; resolving it removes the blocker but doesn't show the Requirement met. Feedback judges nothing unless a row is mapped to the Feedback source (share of positive feedback, judged like real use). Impact is informational.
- **Results combine when compatible.** Results recorded by hand or uploaded for the same row, segment, evidence mode, kind of measurement and configuration, inside the 90-day window, add up: three reviews of 10 cases count as 30. A single value never combines. Connected sources keep their own rule (the newest run under the current configuration).
- **Disagreement is Conflicting.** When two current results judge the same row and one says met while another says not, or the Owner and a Reviewer disagree, the row is Conflicting: never a pass, and the page names the evidence that disagrees. Stale results don't create a conflict.
- Recorded outcomes and Met/Not met judgments count as results, so they lock the bar like a test run or an import; incidents, Unknown judgments, feedback and Impact don't. Before the first result, the screens that record one list the evidence-judged Requirements and Targets with no evidence linked yet (never a person-judged one), because linking them afterwards needs approval. Nothing here is ever edited: a correction is a new record.

### Setting up a new capability: the setup flow (#139)

Setup follows the reset's order, with related steps sharing a screen: **Context** → **Starting point and capability** → (if already in use) **What it does today** → **Risk and authority** → **Boundaries** → **Requirements and Targets** → **Evidence** → **People** → **Review and confirm**. The capability's **Setup** page lists the steps and where each stands.

- **Setup is a draft until the owner confirms it.** Adding a capability (**Capabilities → Add capability**) starts a draft: no authority is granted (the gate treats it as Level 0) and no decision record is written. Every step saves as you go. **Review and confirm** reads the whole setup back in plain language, lists what's missing and what's open (bars that still need a decision, unconfirmed Context, unknown effective authority), and only the owner can confirm. An already-in-use capability can't be confirmed until **What it does today** records its current behaviour, human involvement, permissions and safeguards ("Unknown" counts). Confirming writes the starting decision record (Level 0 or 1, or not delegated) and an immutable **Setup confirmed** snapshot of what was reviewed, together.
- **Confirmation gates authority, not exploration.** Before confirming you can write test cases, run tests, and configure or import evidence. Nobody can propose or grant more authority until setup is confirmed. The first recorded result still locks the Requirements, Targets and who is involved under the usual rules, even in a draft; setup warns before that line is crossed.
- **Context** belongs to the workflow. Describe it in your own words and Authority Lab suggests facts by simple keyword matching (labelled "Based on your answers", never AI). Each is confirmed, corrected or rejected on its own; only confirmed facts shape setup. Confirmed Context marks the template families that fit.
- **Starting point:** one of eight template families (Knowledge / Research, Draft / Create, Extract / Classify, Recommend, Customer / User Interaction, Workflow Automation, Action / Transaction, Monitor / Detect) or Start from scratch. Templates suggest; they never decide.
- **Risk and authority:** Severity (shown as Low / Moderate / High), Likelihood (Unknown is an answer), Scale, whether it can be undone, and who is affected. Overall Risk is worked out from the fixed table and explained. The starting authority comes from what it does today, at Level 1 at most; effective authority recorded under **What it does today** is shown beside it, never granted.
- **Boundaries:** every suggestion, from the template or the risk answers, is pending until it's accepted, edited or rejected on its own, and says where it came from ("Template suggestion", "Based on your answers"). Where a number goes, the suggestion has a blank (___) that a person fills in before it can be accepted. The review shows each saved line as a **Written Boundary** unless Authority Lab's gate actually checks it, and says that runtime limits are set on the authority decision that grants them.
- **Requirements and Targets:** suggestions are listed apart and added by ticking each one. None sets a number: a measurable Requirement comes with a Target whose bar is **Needs decision**, and the required minimum-cases coverage rule starts as "Minimum cases: Needs decision". Leaving a suggestion out needs a reason, as before.
- **People:** one Owner, then Reviewers (input required) and Stakeholders (involved or consulted). The approval rules underneath don't change.

Capabilities that existed before #139 (the Northstar demo's, State's) keep their history and are treated as already set up. The table below describes how they were set up.

### Setting up a new capability: the path at a glance

Everything in Authority Lab is done one capability at a time. A new capability goes through seven steps, in this order, and each step has to be real before the next one means anything:

| Step | Where | What it produces | Who |
|---|---|---|---|
| 1. Define | Capabilities → Add capability | The capability (name, summary, owner, risk profile, what it does today, starting authority at Level 0 or 1, or "not delegated, by design") and its **first decision record** | Whoever is acting; the record names the owner too |
| 2. Rules | Setup → Set the boundaries | **Contract v1**, from a risk-picked template plus seeded "Suggested by AI" lines, each accepted, edited or rejected one at a time, past the software checks | A named person saves the rules |
| 3. Targets | Setup → Set what good looks like | **Targets v1** and **decision requirements v1**, pre-filled from the risk profile, each row labelled with its source | Whoever is acting |
| 4. Configure evidence | Setup → Configure evidence | Which evidence judges each decision requirement and target: a connected source's metric, Authority Lab tests, or a manual review. The bar comes from the row's wording | Whoever is acting; after results, a proposed change with approval |
| 5. Coverage | Setup → Review evidence coverage | "X of Y decision requirements have sufficient evidence", and each row as sufficient, needs more cases, stale, no results yet or no source mapped | (read-only) |
| 6. Fill the gaps (optional) | Setup → Fill the gaps | Evidence where it's missing: test cases and a test run, a result recorded by hand, a pilot, or another connected source. Local tests are one way, not a requirement | Whoever is acting; manual results by the owner or a stakeholder |
| 7. Stakeholders | Setup → Name who decides | **Stakeholders v1**: team, person, position when known | Whoever is acting |
| 8. First authority change | Setup or Decide → Propose a move to Level N, then Record decision in the Decide flow | The capability's **second decision record**; a move to Draft sets status Pilot. Needs any measured result first (tests, an import, or a result recorded by hand) | A named person authorizes |

The first measured result, from any source, **locks** the targets and decision requirements. Expanding authority needs a pending proposal (the next level, proposed once any measured result exists; Level 3 also needs evidence from real use: a pilot or production results); restricting, suspending or redesigning does not, but still needs a named person, a rationale and a record. Status follows authority decisions only: a capability stays **In setup** until a person authorizes the move to Draft, then becomes **Pilot**. Saving the rules or the targets does not change it. Every tab of the capability is always visible; an empty tab says what is missing and links to the next step on the Setup page, which groups the steps in three stages, **Define** (what it does, its boundaries), **Evidence** (what good looks like, which evidence judges it, coverage, filling the gaps) and **Decide** (who decides, the first decision), and marks each step Done or Next. Fill the gaps is optional and never marked Next: a connected eval can be enough.

The sections that follow describe each step.

### Starting from an empty workspace

**Start empty**, in the Settings menu (the gear at the top right), swaps the Northstar demo for a blank workspace. Start empty and Reset demo both erase every record, so each first asks, inline, "This erases all records in this workspace. Continue?" Until it is set up, every page shows **Start a workspace**: who's starting it (your name and title) and what to call the workspace and its one workflow. The person starting it becomes the workspace admin, and **Start and add the first capability** opens Add capability.

One person can start a workspace. A second admin or a Risk approver is asked for the first time an approval actually needs one, and the approval checks are unchanged at that point; the refusal ends "You're the only person in this workspace: add someone on People first." Because a grant needs an approver who is neither the proposer nor the recipient, a lone admin could otherwise never give anyone a right. So the **founding roster** allows one bootstrap exception: while the workspace has only ever had one workspace admin, that admin can make one other person a workspace admin without approval, recorded as a founding change with no approvers and shown in Activity. No other right skips approval; the two admins set up Risk approvers through the normal process. Giving a right to yourself is refused; removals and deactivating a rights holder still need approval; once the second admin exists, the founding roster ends for good. The demo starts with two admins, so it never applies there. This rule is marked in DECISIONS as awaiting Paige's confirmation. Everything else works exactly as in the demo, and **Reset demo** brings Northstar back.

### Adding a capability

**Capabilities → Add capability** asks four questions on one page: **What does it do?** (name, one sentence), **Who owns it?** (choosing an owner switches Demo as to them), **What happens if it gets this wrong?** (impact, reversibility, exposure; failure types and a note are optional under "More detail") and **What does it do today?** The last answer is context, not authority: Nothing yet starts at Observe (Level 0); Recommends, Drafts for approval and Already acts in some cases start at Recommend (Level 1), with a note that existing autonomy is reviewed and formally approved as the first authority decision; Not something to delegate stays at Level 0 and needs a written reason. Nothing starts higher; authority above Level 1 is earned later.

Adding the capability writes its first decision record, dated today and authorized by whoever is acting, and version 1 of its risk profile. The contract, criteria, requirements and stakeholders have no versions until they are authored. A non-blocking warning appears when the name reads like a whole process ("handle", "manage") or like two actions joined by "and".

Every tab of a capability is always visible. A tab with nothing to show says what is missing and links to the **Setup** page, a checklist of the steps to the first authority decision in its three stages: Say what it does and what could go wrong, Set the boundaries (Define); Set what good looks like, Configure evidence, Review evidence coverage, Fill the gaps (Evidence); Name who decides, Make the first authority decision (Decide).

### Building the contract (the rules)

From a capability's Setup page (**Set the boundaries**, then **Review the rules**), or the **Set up rules** link on Status when there are no rules yet, a draft starts on the **Set up rules** page. A starter template is picked from the risk profile: higher impact adds hard limits and tighter escalation; financial exposure adds fraud, chargeback and value-limit lines; "difficult to reverse" adds an approval line for anything that cannot be undone. On top of the template, seeded suggestions are generated from the capability's name and summary by keyword, each labelled **Suggested by AI** with the word that triggered it. Nothing calls a model; the same name always gets the same suggestions.

Template lines start accepted. Each AI suggestion is pending until you **accept**, **edit** or **reject** it, one at a time; there is no accept-all. You can add your own lines, edit template lines, and remove them. Every change unconfirms its section, and all five sections must be confirmed again before finalizing. Rejected suggestions and removed template lines stay in the record.

In the builder the five sections are The AI may, Ask a person for these cases, The AI must never, Ask a person whenever this comes up, and Authority is reduced automatically when. Software checks run on the draft and block saving when: "The AI must never" or "Authority is reduced automatically when" is empty above Low impact; the same line appears under "may" and "must never" (or "ask a person for these cases"); a restriction rule has no number or no time/case window; a financial capability sets no value limit in "may" (a ceiling) or "ask a person for these cases" (a threshold); a limit that only appears under "must never" does not count. The "Approve the rules" panel shows a plain-English summary, what changed from the template, and who is saving. **Save rules** writes contract v1, with the full review behind it (template, suggestions accepted, edited and rejected, lines added by hand), and records a "Rules saved" event. It does not change authority or status; those follow decisions only.

### Setting Targets and Requirements

Setup's **Set what good looks like** (**Review the checks**) opens the **Targets and decision requirements** editor, pre-filled from the risk profile: quality and severe-error thresholds scale with impact, the minimum pilot size scales with impact, financial exposure adds a minimum number of high-value cases, customer-facing exposure adds a customer-visible-errors criterion, and difficult-to-reverse actions add a review-before-effect requirement. Every row says where its default came from; you can edit, remove and add rows. Targets are optional (#137): a capability may have Requirements and no Targets, and a Target whose number isn't settled can say **Needs decision**. One core row, the minimum case count (a coverage rule), can be adjusted but not removed. Lowering a default threshold, reducing a default case count or removing a default row needs a short reason, which is stored on the version and shown beside its diff. "Current" values are not typed; evidence fills them in later.

Saving writes targets (criteria) v1 and decision requirements v1, authored by whoever is acting. Before the first test run you can save again, and each save is a new version. The **Run tests** button stays disabled until both are saved, because the first run **locks** them: the moment performance results exist (a recorded test run, a pilot, or a measured evidence item, the same definition as "after evidence"), the editors become read-only and a "Targets locked" event is recorded. From then on, changing the bar is a proposed change with sign-off (**Propose a target change**, next section).

### Changing the bar after evidence: proposals and sign-off

Three objects are governed once there is something to protect. Changes to them become **proposals** (the new version plus a reason, recorded at once, applied only after sign-off) rather than direct edits:

| Object | Governed from | Direct edits still allowed |
|---|---|---|
| Targets and decision requirements | The first performance results (a recorded test run, a pilot, or a measured evidence item) | Tightening-only changes (applied directly and recorded, see below); before the lock every save is a new version |
| Contract (Rules) | The start of a pilot (a human-authorized move to Draft or above), while the `CONTRACT_EDITS_NEED_SIGNOFF_AFTER_PILOT` setting is on | Before a pilot starts |
| Stakeholders | The first performance results, for adding or removing people and for team labels | Position, stance and reasoning updates, always |

**Tightening only skips sign-off.** A change to locked criteria or requirements that only makes the bar stricter applies straight away, as a recorded amendment marked "tightening only" and shown in Activity. Software decides, not the proposer: every changed row must keep its exact wording, unit and comparison, and only its number may move, upward for an "at least" and downward for an "at most" (more required cases counts). Removing, adding, renaming or re-noting a row, an equal number, or any loosening anywhere sends the whole change to the normal proposal and sign-off. The shortcut is only for the capability owner or a named stakeholder, and never while an expansion decision is pending; otherwise a tightening goes to sign-off, and the proposal says why. The Decide flow lists every change to the bar since the decision opened.

**Who must approve.** The proposer never approves. For Low and Medium impact, one approver: the owner, or any other named stakeholder if the owner proposed. For High impact or financial exposure, two different approvers, at least one from Risk; the last slot is refused to a non-Risk person while no Risk approval exists. Owners can still propose. "Named stakeholders" are the owner and the people on the capability's list; whether one of them counts as Risk is the recorded Risk approver right on the People page, never a team name or a label on the list. Use the **Demo as** picker to propose and to approve as each person.

**What the sign-off screen shows.** The reason, how many approvers have signed and whether Risk has, who was eligible when the proposal opened, what would change, and, for criteria, readiness under both versions ("5 of 6 met now, 6 of 6 under the proposal") with a flag when the proposal makes the capability look more ready without new evidence.

**Outcomes.** Approving writes the new versions, authored by the proposer and carrying the approvals, and records a surfaced "amended after evidence" event; any later decision that relies on them is marked "Criteria amended after evidence". Rejecting (by an eligible approver) and withdrawing (by the proposer) both need a reason and stay in the record. One proposal per object can be open at a time.

A proposed contract must pass the same software checks as the builder's finalize step before it can be submitted. A proposal is refused at the moment it is made if the eligible approvers could never satisfy the rule (for example when the only Risk person on the list is the proposer); the message says what to do.

### Naming stakeholders

Setup's **Name who decides** opens a short editor: team, person, and, when known, their position and reasoning. Every save is a new version. Positions are kept as positions and shown on the capability's Status tab (**People involved**, where **Manage stakeholders** opens this editor) and in the Decide flow; they are never averaged into a score. A capability's named stakeholders are also who can sign off amendments, so a High-impact or financial capability needs someone from Risk on the list.

### Writing the scenario library

Setup's **Add test cases** opens the scenario library (**Test cases**): name, situation and expected behaviour in each of the five groups (standard, ambiguous, adversarial, high impact, edge). A starter set of twenty scenarios, four per group, phrased for the capability and labelled "Suggested by AI", gets a team past the blank page; the editor nudges toward twenty to thirty in total. Results are seeded and deterministic: a new or changed scenario gets a simulated result when it is saved, labelled "Simulated" in the test results, and the same scenario always gets the same result, so the suite replays. Changing the library after a run clears that run; the next run re-records. Until there is evidence, the evidence views (Decide → All evidence, or Pilot results) carry a placeholder card for the evidence sources a real deployment would connect.

### The first authority change

After the first test run, the Decide tab and the Setup page offer **Propose a move to Level N**, one level at a time. That opens the decision in the Decide flow: targets not yet measured, 0 of N checks met, the test results in the evidence snapshot, stakeholder positions where recorded. A person records the decision (**Record decision as <name>**) as whoever is in Demo as, which writes the capability's second record. A move to Draft sets the status to Pilot and starts no monitoring, because every case is approved by a person; monitoring begins only at Level 3.

### People

The **People** page (**Settings → People**, the gear at the top right) is the workspace roster, shown as a simple table: Person, Role (title and team), Can approve Risk changes, Workspace admin, and a **Manage** menu. The two rights are explicit and recorded. **Workspace admin** can change the roster; **Risk approver** can sign off as Risk. Rights are recorded on the person, never inferred from a team name. In the seed, Maya Chen and Jonas Lindqvist are workspace admins, and Daniel Okafor and Sofia Alvarez hold the Risk approver right.

Only a workspace admin adds a person, edits a name, title or team, or deactivates someone, and every change records the admin and a reason as a new roster version, with the history and a before/after diff on the page. Nobody is ever deleted: records, approvals and stakeholder lists keep referring to people after they are deactivated. A deactivated person cannot be the acting person, cannot propose, cannot approve, and cannot be added as a stakeholder, and drops out of the pickers.

Below the table and the open roster changes sits a **Workspace** section (**Settings → Workspace** jumps to it): the workspace and its workflow, with an **Edit** control for workspace admins. Renaming either, or changing a description, is a direct edit that needs a reason; it is recorded with who made it and shown in Activity. Records written before a rename keep the names in force when they were written, and a record page shows "as named then" alongside today's names.

Each row's **Manage** menu holds the admin actions for that person: edit name, title or team; grant or remove each right; deactivate. The person in Demo as is tagged "(you)" next to their name; **Add a person** (admins only) is below the table, and new people start with no rights.

Rights are governed. Granting or removing the Risk approver or workspace admin right, and deactivating anyone who holds a right, is a proposal made by a workspace admin and approved by someone else: a **different** workspace admin, or, for a Risk approver grant, an existing Risk approver. The proposer never approves. For a grant, the person receiving the right never approves either, so nobody grants a right to themselves and nobody waves through their own. For a removal, the person losing the right may approve it. A change that would leave no workspace admin is refused. The one exception is the founding roster (see Starting from an empty workspace), where a lone admin making a second workspace admin takes effect at once and is shown as "Took effect at once". Open roster changes, with approve, reject and withdraw, sit on the People page. Changing someone's team changes nothing about what they can approve: Risk eligibility is only ever the recorded right.

### Coverage warnings

Sign-off only works if the right people exist. Two warnings watch for that, and neither blocks anything; they explain the gap and point at the People page.

- **Risk coverage.** A High-impact or financial capability needs two approvers with at least one from Risk, and one of the two could be the proposer, so it needs at least two active Risk approvers among its possible approvers (the owner and the people on its stakeholder list). When it has fewer, the capability page and the People page say so and name who is left, linking to **Manage stakeholders** (usually the fix is adding an existing Risk approver to the list) and to People. The Overview's To do list shows one item per short capability ("Add a second Risk approver to …").
- **A proposal that can no longer complete.** A proposal freezes its eligible approvers when it opens. If one of them is deactivated or loses the Risk approver right and the rule can no longer be satisfied, the sign-off screen, the proposal lists and the Overview's To do list flag it and suggest that the proposer withdraw and propose again, which freezes a fresh set.

When a workspace admin proposes removing a right or deactivating someone, the form shows what that change would do to coverage: which capabilities would fall short and which open proposals could no longer complete. The change still goes through; the reason, which is always required, is where to say why. The impact is kept on the roster change so the approving admin sees it too.

### Demo as

The right end of the top bar has a picker labelled **Demo as** (styled as a demo control), the demo date, and the **Settings** menu (the gear) with People, Workspace, Guided demo, Start empty and Reset demo. It is a demo control: a real version would know who is signed in, and the picker stands in for sign-in so one visitor can show different people proposing, approving and authorizing. Only active people appear in it. It defaults to the owner of the capability you are looking at and can be switched to any named person; on the Add capability page, choosing an owner switches it to that owner. Whoever is acting is recorded as the author of records written from that screen: the first record when adding a capability, and the authorization on a decision. When the acting person is not the owner, the record shows both. This is what lets a proposer and an approver be different people. The guided demo has its own Demo as, on its own copy of the demo.

## 2. The screens

A first visit opens a **welcome** page (`#/welcome`, shown once and remembered in the browser): the idea in one sentence, four principles, and two paths. **Guided demo** (`#/guide/1` to `#/guide/7`) follows Refund recommendation in seven steps (Define the capability, Current autonomy, Set the boundaries, What would justify more autonomy, See the results, Make the decision, What happens if things go wrong). It runs on its own in-memory copy of the demo with the real store transitions, so the tests really run, the decision is really recorded and the breach and review really happen, but the workspace never changes. **Explore the finished workspace** opens the Overview. **Settings → Guided demo** opens the welcome page again.

A dark bar across the top holds three places: **Overview**, **Capabilities** and **Records**. On the right are **Demo as** and the **Settings** gear (People, Workspace, Guided demo, Start empty, Reset demo).

**Overview** answers "what needs action?" It has four sections of compact rows, in this order: **To do** (concrete next actions, most urgent first, such as a review after an automatic restriction or a decision that is ready), **Approvals needed** (actions waiting for a person and proposed changes, with who can approve), **Important results** (only results that block, cause or call into question an authority level), and **Current autonomy** (each capability, what it handles now, its level and what is next). Each row names its capability and the person it waits on.

**Capabilities** is one table: each capability, what it handles now, its autonomy level (with Restricted or Not delegated when that applies) and its owner, plus **Add capability**.

**A capability** opens with a header panel (its name and summary) carrying four tabs:

- **Status** answers "what can it do now, and why?" A short story gives the level in plain words, then **Why it's here**, **What happens next** and **Then**, with one link onward. **Needs a decision** lists single actions waiting for a person, with Approve and Reject (a reason is required); the tab shows a count when any are waiting. One-line **Boundaries** and **People involved** follow, each opening in place. The full rules are at `?tab=status&show=rules` (**All rules**), every waiting action and the decided ones at `?tab=status&show=approvals` (**All waiting actions**).
- **Decide** answers "should its overall authority change?" in one vertical flow: **What are we deciding?** (now and proposed), **What do we know?** (a headline such as "Almost ready: 5 of 6 checks met", then Checks, Tests, Pilot results, Model runs and Stakeholder positions, each a disclosure that opens in place), **Recommendation**, **Your decision** (the four choices), **Limits** (for Within limits), **What should improve?** and **Rollout plan** (when expanding), **Why are you making this decision?**, and **Review and record**, with a checklist and **Record decision as <name>**. The full evidence views open from links in the flow: `show=tests`, `show=runs`, `show=all`, `show=targets`, `show=requirements` and `show=results` (the pilot, its segments and **What the AI tried**), each with "Back to the decision". With no decision open, the tab says why and still shows What do we know?
- **Monitor** answers "is it still safe, and delivering value?" **Still safe?** leads with a verdict, then the outcomes since autonomy was expanded, the review when one is needed, one-line Safety limits, What the automation tried and Post-incident reviews, the rollout plan and the demo control. **Delivering value?** leads with a verdict on the rollout goals ("Too early to judge" until at least 20 production cases are recorded, or the number a goal names for itself; pilot and seeded numbers never count), then the goals, return on investment and how reviewers are using it.
- **History** is one timeline, newest first: authority changes (with their record and one-page brief), automatic restrictions, post-incident reviews, test runs, incidents, proposed changes and versions, then one-line Versions and Proposed changes and a link to the capability's activity.

Single actions waiting for a person sit under Status, not Decide: they are a different kind of decision from whether the capability's overall authority should change.

**Decide → Tests** is the testing ground: 26 scenarios in five groups (standard, ambiguous, adversarial, high impact, edge cases). Before the first run the groups are collapsed with their counts beside one **Run tests** button; after a run, groups with failures come first and open, and a filter bar narrows by result and group. Running the tests shows each scenario's expected behaviour, what the AI did, the outcome, the severity, and what the human reviewer decided. One scenario fails badly on purpose: a $420 refund on a fraud-flagged account was recommended instead of escalated.

**Records** has two views. **Decisions** lists every authority change; each opens its record ("Authority change #NN") and one-page brief. **Activity** is the timeline. Every event is recorded. The default view ("Important") shows decisions, automatic restrictions, test runs, pilot milestones, failures, mitigations, stakeholder reviews, and amendments made after evidence; "Everything" shows the rest, including setup-type events such as targets being defined and amendments made before any results existed. Both views filter by kind and by capability, and an amendment expands to a before/after table.

When an action can't go through (a missing rationale, a rule that refuses it), the reason appears as a notice on the same page. Dates read "Oct 7", with the year only when it differs from the current one.

Old addresses still work: `src/routes.js` rewrites the old tabs (`summary`, `rules`, `evidence`, `decision`, `monitoring`, `stakeholders`, and older names such as `contract`, `criteria`, `testing` and `waiting`) and the old Tests, Evidence, Agent runs, Activity and Decisions addresses to where they live now, keeping their filters.

---

## 3. The demo, step by step

The guided demo tells a short version of this story on its own copy of the demo. The full version, in the workspace:

1. **Overview.** To do leads with the decision on Refund recommendation: five of six checks met. High-value refunds are the gap, and Important results shows them (18 cases at 83%). Approvals needed shows two refunds waiting for a person.
2. **Capabilities, then Refund recommendation, Status.** It is at Draft: refunds are prepared automatically, and a person approves every one. Open **Boundaries**, then **All rules**: what is allowed, what requires human review, what is never allowed, and when automation is pulled back.
3. **Decide, What do we know?, Tests.** Follow **See every test and run the suite**, then **Run tests**. 24 of 26 pass. Filter to Failed and read H-04, the fraud-flag miss.
4. **Back to the decision, Pilot results.** 218 pilot cases at 94% overall. 18 high-value cases at 83%.
5. **Stakeholder positions** (or People involved on Status). Not unanimous: Support Operations wants to expand everything; Risk wants anything over $50 kept with a person.
6. **Recommendation.** "Recommended: expand autonomy within limits", worked out from the evidence.
7. **Your decision: Expand autonomy, then Within limits.** Check the limits (at most $50 each, at most $500 and 20 refunds a day, no fraud flag, clear policy, confidence at least 90%, no chargeback), what should improve and the rollout plan, all prefilled for the demo, and read what the choice would mean.
8. **Record decision.** Authority change #04 (`AC-04`) is written with the evidence snapshot. Current autonomy now shows Act within limits.
9. **Monitor, Still safe?, Simulate a safety-limit breach.** Three severe errors land in the rolling window. Software moves the capability back to Draft (the verdict reads "Autonomy reduced"), writes record #05, puts a review at the top of the Overview's To do list, and locks expansion until a review is recorded.
10. **Monitor, Needs review.** Refund recommendation is High impact, so switch Demo as to a Risk approver (Daniel Okafor or Sofia Alvarez). Write what happened, the cause and what changes as a result, then **Save review**. The lock and the alert clear, and the restriction record shows the review; authority stays at Draft until a new proposal is authorized.
11. **Settings → Reset demo** (the gear at the top right) puts everything back.

---

## 4. What the controls actually do

| Control | Effect |
|---|---|
| Guided demo / Explore the finished workspace | On the welcome page: start the seven-step guided demo on its own copy of the demo, or go to the Overview; either choice is remembered so the welcome page doesn't open again |
| Run tests (Decide → Tests) | Runs the 26 scenarios, records the result as evidence, adds an activity event |
| Your decision (four choices) | Expand autonomy (Within limits or Broad autonomy), Keep current limits, Reduce autonomy (One level down or All the way back to Observe) or Pause and redesign; each is recorded as Expand with limits, Expand, Hold, Restrict, Suspend or Redesign |
| Limits | Edit the authority conditions for Within limits; "What this would mean" updates in plain English |
| Record decision as <name> | Changes the capability's authority, writes an immutable record, starts monitoring if authority expanded |
| Simulate a safety-limit breach | On a seeded capability's Monitor tab (Simulate a safety-limit incident for Account closure), simulates a reading that crosses its contract rule; software moves it to the level the rule names, creates an alert, an incident, an event and a record, and requires review (an incident rule opens an incident only) |
| Add capability | Asks what it does, who owns it, what happens if it gets this wrong and what it does today; sets a starting level of 0 or 1 and writes its first decision record |
| Set the boundaries (rules builder) | Starts from a template, reviews each AI suggestion, runs the software checks, saves contract v1 with Save rules |
| Set what good looks like (targets editor) | Saves targets and decision requirements (defaults from the risk profile); the first test run locks them |
| Propose a change | After the lock (targets) or a pilot start (contract), submits a change for sign-off; approve or reject as whoever is in Demo as |
| Manage stakeholders / Name who decides (stakeholder editor) | Names the stakeholders and records positions when known; every save is a new version |
| Configure evidence | Maps a source's metric to a decision requirement or target (source, metric, segment, how to read it, an optional minimum sample, test cases or real use); the comparison and number come from the row's wording. Before results it saves; after, it proposes a change that needs approval |
| Add test cases (scenario library) | One way to fill a gap: adds a starter set (Add 20 suggested cases) or writes scenarios; results are seeded and deterministic, and Authority Lab tests then report tests passed (by type) and serious failures |
| Propose a move to Level N | On Setup or Decide, once any measured result exists, opens the authority decision; recording it writes the capability's next record |
| Needs a decision: Approve / Reject | On Status, the owner or a named stakeholder decides an action the gate sent to a person, with a reason; approving re-runs the gate first |
| Save review | Records the post-incident review after an automatic restriction or rule incident; clears the review lock and the alert, leaves authority where it is |
| People | Workspace admins add, edit and deactivate people, each change versioned with a reason; rights are shown, never inferred; a lone admin's grant of Workspace admin to one other person takes effect at once under the founding roster rule |
| Coverage warnings | Flag a High/Financial capability short of two active Risk approvers and any open proposal that can no longer complete; never block; the People page forms show the impact of a change before it is proposed |
| Demo as | A demo stand-in for sign-in; chooses who is authoring records from this screen, defaulting to the capability owner; only active people appear |
| Guided demo (Settings) | Opens the welcome page again |
| Start empty (Settings) | After an inline confirmation, swaps the demo for a blank workspace to start from scratch: your name and title, the workspace and its workflow |
| Reset demo (Settings) | After an inline confirmation, restores the seeded Northstar demo, removing any added capabilities or a workspace started empty |

State is kept in your browser, so you can refresh without losing your place. The guided demo's copy is kept in memory only.

---

## 5. How it is built

The prototype is a static web app: plain HTML, CSS and JavaScript, no build step, no dependencies, no server.

- `src/data/seed.js` holds all the fictional data: the workspace, capabilities, contracts, criteria, scenarios, pilot results, evidence, stakeholders, past decisions, activity and the monitoring rule.
- `src/store/` (imported through `src/store/index.js`) holds the rules for how state changes: running tests, choosing and authorizing a decision, the automatic restriction, reset. These are plain functions with tests.
- `src/store/gate.js` holds the gate, `checkAction`: whether an AI action may happen (allow, needs a person, block), by authority level, contract, recorded limits and the facts in systems of record. The agent's tools call it on every action, and what it decided shows under Decide → Pilot results (`show=results`), "What the AI tried", and in Monitor's "What the automation tried".
- `src/store/tools.js` holds the agent's tools, `lookup_order`, `issue_refund` and `escalate_to_human`. Each call goes through the gate, and only executes on an allow. Results are filtered to the contract's data section (**Data it can access**, under Status → All rules) against fictional seeded systems of record: orders, customers, fraud flags, chargebacks and a refund ledger. Card numbers and full addresses never reach the model.
- `src/store/queue.js` holds the queue of actions waiting for a person: actions the gate sent to a person wait under the capability's Status tab (**Needs a decision**, with all of them at `show=approvals`), and show in the Overview's Approvals needed. The owner or a named stakeholder approves or rejects each one, with a reason. Approving re-runs the gate first, and refuses if anything changed since the action was queued: a restriction, a crossed cap, or a newly blocked order. The demo opens with two refund requests waiting on Refund recommendation.
- `src/store/gatelog.js` logs every gate decision, and every person's decision on a waiting action. Each event is labelled seeded, this session, or recorded. Decide → Pilot results shows the counts and the latest events as **What the AI tried**. All evidence adds three items derived from the log (allowed, sent to a person, blocked), marked as derived. A restriction rule the log can measure, such as Refund recommendation's "3 attempts at a must-never action within 7 days", restricts the capability as soon as it's crossed.
- `src/store/external.js` holds the external evidence contract (`authority-lab-evidence/1`): `checkEvidence` validates an envelope, `importEvidence` adds it to the capability's evidence, and `importEvidenceFiles` imports the files committed under `src/data/external-evidence/`, which the app does on every load. Files that can't be imported are listed on Records.
- The product reset's model (#137) is in the store, mostly without screens yet: `src/store/context.js` (the workflow's Context, each capability's baseline of what it does today with declared vs effective authority, and material changes), `src/store/risk.js` (Severity, Likelihood, Scale and an overall Risk derived from a fixed table), and `src/store/boundaries.js` (the rules read as Boundaries, each marked enforced, model-reported or documented only, and the Owner / Reviewers / Stakeholders view). Targets are optional and may say **Needs decision**, shown as its own state, never as failed. A decision may carry an optional Residual Risk.
- `agent/` (not part of the deployed site) is an MCP server that offers those three tools to a model such as Claude, through the same gate and filter. See `agent/README.md` to connect it to Claude Code or Claude Desktop.
- `src/views/` holds one module per screen. Screens read state and draw it; they never change it directly.
- `styles/app.css` is the design. Colour always carries a state (pass, watch, fail, insufficient evidence, restricted, decision required) and is always paired with a word.

Nothing calls a model. Evidence from outside arrives as committed files (`src/data/external-evidence/`), never over the network. In a real version, more of the evidence would come from outside: a test harness, a ticketing system, a payments system, a model API, an eval framework. Authority Lab would sit above those systems and turn what they report into a decision about authority.

---

## 6. What it is not

Authority Lab is not an agent builder, a prompt editor, a model playground, an eval platform, an observability dashboard, a compliance suite or a ticketing system. Those tools produce evidence. This product turns evidence about an AI capability into an explicit, reviewable decision about what that capability is allowed to do.

---

## 7. Glossary

- **Authority**: what an AI capability is allowed to do, on a scale from Observe to Broad delegation.
- **Capability**: one discrete thing the AI might do inside a workflow.
- **Delegation contract** (the **rules** or **Boundaries** in the app): the written rules for a capability: allowed, requires human review (for these cases, and whenever this comes up), never allowed, and when automation is pulled back.
- **Evidence**: any measured or recorded fact about how the capability performs.
- **Success criteria** (**Targets** in the app): what "good enough" means for a capability.
- **Evidence requirement** (**Decision requirement** in the app): something that must be true before a specific authority change can be authorized.
- **Decision readiness**: how many decision requirements are met ("X of Y checks met"), and which are not.
- **Authority conditions** (**Limits** in the app): the conditions under which Expand with limits lets the AI act on its own.
- **Amendment** (**Proposed change** in the app): a rule, target or stakeholder change, applied directly or after **Approval** from **Who can approve**.
- **Approvals** (**Needs a decision** on Status): actions the gate sent to a person, waiting for someone to approve or reject them.
- **Recommendation**: the option the app works out from the evidence; it never authorizes anything.
- **Severe error**: a mistake with high impact, such as approving a fraudulent refund or denying a clearly valid one.
- **Override**: a reviewer rejected the AI's recommendation and did something else.
- **Edit**: a reviewer changed the recommendation before approving it.
- **Acceptance**: a reviewer approved the recommendation. Not the same as the recommendation being correct.
- **Decision record** ("Authority change #NN" on screen): the immutable write-up of one authority change.
- **Automatic restriction**: software reducing authority when a predefined threshold is crossed. On screen, Monitor's verdict "Autonomy reduced": "<capability> was moved back to <level> after crossing a safety limit."
- **Founding roster**: the one bootstrap exception: a workspace's only admin can make one other person a workspace admin without approval. Every other right, and every later change, follows the normal approval rules.
- **Monitoring period**: the time after an authority change when the capability is watched against its restriction rule.
