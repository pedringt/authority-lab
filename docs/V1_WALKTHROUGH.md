# Authority Lab v1: final walkthrough script

**Purpose.** This is the walkthrough in the definition of done in `docs/V1_RECONCILIATION.md` (section 6). It walks the Northstar demo and the small-team path, and checks each v1 item where it shows.
- For each problem: fix it (D4: one by one) or record it as a known limit.
- Never invent evidence. The data is the demo's own, or what you enter.

**Where.**
- The combined preview (`preview/v1-combined`), served locally, before any merge.
- Or the live site once #188–#193 are merged.
- Start each path with fresh browser storage (a private window, or clear site data).

**Walked in the browser by Claude (2026-11-11, local preview).** These two flows were unverified until then. Paige hasn't walked them yet.
- **Finishing the Boundaries builder (B1):** passed.
  - The suggestions that were complete were accepted.
  - The two safety-limit suggestions with blanks couldn't be accepted until their numbers were filled in.
  - All five sections were confirmed, then saved.
  - The Setup page read "2 allowed · 4 require review · 3 never allowed · 2 safety limits."
- **A Reviewer recording a reading (B3):** passed.
  - Ben Okoro was added and named as Reviewer. With "Demo as" set to him, the form said "Recording as Ben Okoro, Tax lead."
  - A count reading for a 7-day limit was checked and saved, and listed as recorded by him.
  - Because setup wasn't confirmed, the capability was at Observe, so the check said "This limit doesn't apply yet": nothing happened, as designed.
  - **This passed for recording and attribution only.** It doesn't show a limit being enforced: that needs a capability above the limit's fallback level (see A3, where a reading over the limit restricts Refund recommendation).
- **The real date in a new empty workspace (#195)** (walked by Claude, 2026-11-11):
  - The workspace opened on Nov 11, the real date.
  - A reading for Nov 5 to Nov 11 (ending today) was accepted and recorded.
  - A reading ending tomorrow was refused twice over. The date field blocked it ("Value must be 11/11/2026 or earlier"). With that browser check bypassed, the app refused it too: "The period can't end after today (2026-11-11)."
- **Local date (#195)** (walked by Claude at 4:07 pm on Nov 11, Pacific time, which was already Nov 12 in UTC):
  - A new empty workspace showed Nov 11 and saved 2026-11-11 as its date.
  - A reading ending Nov 11 was accepted and recorded, dated Nov 11.
  - A reading ending Nov 12 was refused: "The period can't end after today (2026-11-11)."
  - Reopening: the saved workspace's date was set back to Nov 10 and the page reloaded. It advanced to Nov 11, and the recorded reading kept its dates.
  - **Not walked:** the change at actual local midnight. It's covered by a test pinned to Pacific time: 4:30 pm on Nov 11 gives Nov 11, and reopening at 0:30 am on Nov 12 advances to Nov 12.
- **Mixed evidence (#194)** (walked by Claude, 2026-11-11), on a small-team capability. The Requirement "Overall accuracy ≥ 90%" is judged through its Target "Accuracy", with results recorded by hand.
  1. A result on Nov 9: 50% across 20 cases, Not met.
  2. A material change effective Nov 10: the Target read "No results currently count", with "1 earlier result awaits material-change review (MC-…) and is not counted."
  3. A new result on Nov 11: the Target read 95% across 20 cases, Met, with the same note. The Requirement read Met, with "Through its Target Accuracy: 1 earlier result awaits material-change review … and is not counted."
- **Coverage labels on Configure evidence (#196)** (walked by Claude, 2026-11-11), on a small-team capability:
  - **"Overall accuracy ≥ 90%"** (evaluated through its Target): "Evaluated against Target · Target: Accuracy (Not yet measured)" before any result, then "Target: Accuracy (95% across 20 cases)", Met.
  - **"The tax lead has approved the templates"** (human judgment): "Judged by a person · A person's judgment is on record" once judged.
  - The evaluation rules and the sufficiency counts are unchanged.
  - The judgment in this check was dated 2026-11-12 at 4 pm on Nov 11, Pacific time, because the app then used the UTC date. **Fixed on #195:** the real date is now the local calendar date (see below).
  - **A defect found here, now fixed on #194 and covered by a test:** the Requirement had read "No evidence yet" while nothing counted, and Met with no note afterwards. The intermediate state was checked by the test, not re-walked.

**How to record findings.** Use one line per finding:
- the path and step;
- what you saw;
- expected or not;
- fix or known limit.

---

## Path A: Northstar demo (Refund recommendation)

### A1. Status (W3, C1)

- [ ] **Current Authority** is the first thing: Draft, Level 2, and what it does now in one sentence.
- [ ] **Needs attention** lists the serious test failure, "Fraud flag present (H-04)", with "See the tests".
- [ ] **Full record** is next to the Owner and opens **History**. History should list:
  - every decision record;
  - test runs;
  - versions;
  - change requests.
- [ ] **What still needs a person:** the level sentence, and the Boundaries line ("require human review").

### A2. Decide (W3, W4, W5)

- [ ] **"Where this stands"** shows:
  - Approved and Proposed Authority;
  - hard Requirements;
  - considerations not met;
  - both opposing Stakeholders, named;
  - **"No Reviewers are configured, so no position is required before an expansion."**, with "Name a Reviewer";
  - **"Stale evidence: Quality (34 days old). Stale evidence still counts. Its age blocks an expansion only when a Requirement makes recency mandatory…"**;
  - **"Not enough evidence yet: Minimum 40 high-value refund cases (18 of 40 cases)."**;
  - **Full record**.
- [ ] **Step 2, "What do we know?"**
  - The Requirements line carries the D5 and D6 sentences.
  - "Serious test failure: Fraud flag present" shows.
- [ ] **"Your decision"** has a collapsed **Why this matters**. Opening it changes no answer.
- [ ] **Choose Expand.** Residual Risk has its own **Why this matters**, and no level is preselected.
- [ ] **The record step's checklist** says "No Reviewers are configured, so no position is required".

**Record the expansion.** Fill in Residual Risk and a reason, then record it as Maya Chen.

### A3. Monitor, Still justified? (C1, W2)

- [ ] **The answer.**
  - Right after the decision it reads "Current Authority still supported", or "Needs attention" for:
    - stale evidence (in the D5 wording);
    - disagreement;
    - the simulated adoption warnings.
  - No "May no longer be justified" from Targets or considerations.
- [ ] **Record a reading.**
  - [ ] **Who:** the form is there for Maya, the Owner.
  - [ ] **Help:** a collapsed **Why this matters**.
  - [ ] **Refusals.** Each gives its reason:
    - the wrong units;
    - a 6-day period on a 7-day limit;
    - a period ending after today.
  - [ ] **Not offered:** the "3 forbidden attempts or false claims" limit says it's counted from logged actions.
  - [ ] **Within the limit:** "Error rate above 8% over 7 days" with 3% for the last 7 days. **Check reading** gives "Nothing changes". **Save reading** records it.
  - [ ] **Duplicate:** the same period again is refused, and it says to enter it as a correction.
  - [ ] **Over the limit:** a correction of that reading to 9%, with a reason. **Check** gives "Saving restricts autonomy". **Save** moves the capability to Draft, with a decision record that quotes the rule and the reading.
- [ ] **After the restriction.**
  - The answer reads "Restricted automatically".
  - Status's Needs attention shows "Blocked: a post-incident review is needed…".
- [ ] **Switch "Demo as"** to a Stakeholder (Priya). The reading form is replaced by who can record and why.

### A4. A material change (W1)

Use a fresh demo for this part.

- [ ] **Record the change.** On Monitor, record a material change: Model, "Moved to a newer model". It lists the affected Requirements and Targets, each "Not reviewed yet".
- [ ] **The block shows** in three places:
  - Status, Needs attention: "Blocked: evidence from before a material change isn't reviewed yet…";
  - Decide, "Where this stands": the same block, with "Review it in Monitor";
  - **Known open question:** affected Requirements read "No evidence yet" while awaiting review. Decide whether that label should change.
- [ ] **Review one row as the Owner.**
  - **Help:** **Why this matters** shows.
  - **Partly applicable** needs what is still supported and what needs fresh evidence. That row's evidence still doesn't count.
  - **Still applicable** makes it count again.
- [ ] **Replacing the Proposal** doesn't clear the block. Only completing the reviews does.
- [ ] **History** keeps the change and every review.

### A5. Monitor, safety concern (C1)

- [ ] **Record a critical incident.** On Ticket classification, under Investigate, "record an incident", record one with severity critical.
- [ ] **Safety concern** is pinned above "Is the current Authority still justified?", and the answer reads "Safety concern".
- [ ] **Authority is unchanged.**
- [ ] **Value warnings.** On "Delivering value?", a goal missed on real numbers is a value warning. It doesn't change the "Still justified?" answer, which only points to it.

---

## Path B: Small team (start empty)

### B1. Setup (W4, W5 / #134)

- [ ] **Start a workspace from empty** (Welcome, then your own workspace), and add a capability.
- [ ] **Finish the Boundaries builder.** Review every suggestion, fill in the number on any suggestion with a blank, confirm each section, and save. Then check the Setup page's Boundaries summary. (Walked by Claude, Nov 11.)
- [ ] **Why this matters** is collapsed at each of these, and opening it fills nothing in:
  - the Owner choice;
  - the Risk answers;
  - starting Authority;
  - Boundaries;
  - Requirements;
  - People.
- [ ] **The Requirements step** shows the D5 and D6 sentences.
  - No suggested number appears anywhere: suggestions and the Help example both leave the bar to you.
- [ ] **The Setup page** summarizes each completed step:
  - Boundaries: "N allowed · N require review · N never allowed · N safety limits";
  - Requirements: "N Requirements configured (N hard). Targets: …";
  - Evidence: "N of N Requirements mapped to evidence."

### B2. People and Decide

- [ ] **Name a Reviewer.** Decide shows "Waiting for a position from …" until they give one. Then it shows "Every Reviewer has given a position."
- [ ] **No Reviewer named.** Decide shows the "No Reviewers are configured" line.

### B3. Monitor without integrations (W2)

- [ ] **Record a reading.** Switch "Demo as" to the named Reviewer and record a reading. The Owner can record one too, and a Stakeholder can't. (The Reviewer case was walked by Claude, Nov 11.)
- [ ] **The small-team flow is possible end to end** with no gate log or import:
  - recording results;
  - a decision;
  - a reading;
  - a review.

---

## Release plan (approved by Paige, 2026-11-11)

**One deployment, from one release PR.** Vercel deploys only `main`.

1. **`release/v1`** is cut from `main` (e80e8e0). #188–#193 now target it, and nothing is merged yet.
2. **Merge the work into `release/v1`,** each with Paige's go, in this order:
   1. #188 (W1);
   2. #194 (the wording; retargeted to `release/v1` after #188);
   3. #189 (W2);
   4. #190 (W3);
   5. #192 (W5);
   6. #193 (C1);
   7. #195 (the real local date);
   8. #196 ("Evaluated against Target"; after #188 and #194, which touch the same code);
   9. #191 (W4).

   Each is rebased and its CI checked before it merges.
3. **One integration PR into `release/v1`** carries what only the preview has today:
   - Status's "Needs attention" lists the W1 unreviewed-evidence block (needs W1 and W3);
   - Help on the W1 and W2 forms (needs W1, W2 and W4);
   - the shared D5 wording in W3's and C1's lines (needs W3, W5 and C1);
   - this script, `docs/V1_WALKTHROUGH.md`.
4. **Check that `release/v1` matches the reviewed preview.**
   - `git diff preview/v1-combined release/v1` is empty, or differs only in merge history.
   - Both suites pass.
   - Paige's walk of the preview stands for `release/v1`.
5. **One release PR, `release/v1` → `main`,** with Paige's named go. That is one deploy. Then check the live site.

## After the walk

- [ ] **Decide each finding:** fix now (D4), or record it as a known limit.
- [ ] **Merge #188–#193** to main, each with its destination named.
- [ ] **Turn the preview follow-ups into PRs once the PRs they need are merged:**
  - Status lists the W1 block (needs #188 and #190).
  - Help on the W1 and W2 forms (needs #188, #189 and #191).
  - The shared D5 wording in W3 and C1 (needs #190, #192 and #193).
- [ ] **Run both suites on main** (`node --test scripts/*.test.mjs`; `npm test --prefix agent`), then check the live site.
