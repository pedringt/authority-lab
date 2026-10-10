# Authority Lab: notes for Claude Code

A prototype for deciding what an AI capability should be allowed to do, based on evidence. **AI interprets. Software enforces. Humans authorize.**

Read before working:
- `docs/HOW_IT_WORKS.md`: the product, the screens and the rules as users see them.
- `docs/DECISIONS.md`: every product decision with its reasoning, the roadmap and what's next. Check it before changing any rule.

## Ground rules

- Static app: plain HTML/CSS/JS, no build step, no dependencies, no network or model calls. The one exception is the agent tooling: a top-level `agent/` folder may have its own `package.json` and dependencies (MCP SDK, Anthropic SDK), is never part of the deployed app, and imports the gate from `src/store/` (one implementation). Paid model calls from `agent/` need Paige's OK with the call count and estimated cost stated first. `.vercelignore` keeps `agent/` out of the deployed site. Its dependencies are pinned exactly and its tests run in CI (`npm test --prefix agent`). The MCP server acts for one capability fixed at start; no tool takes a capability argument. Everything presented as AI output is seeded and deterministic: contract suggestions and scenarios carry a "Suggested by AI" badge, and the decision workspace's recommendation is labelled "System recommendation".
- Errors from an action are shown inline on the page (an `error=` route parameter rendered as a notice), never in an `alert()` pop-up. A test enforces this.
- The store lives in `src/store/`; `src/store/index.js` is the only entry point. Views read state through selectors and never change it directly.
- Every new store transition gets a test in `scripts/*.test.mjs`. Run `npm test` before every push. CI runs it on Node 22 and 24.
- The seeded demo story in `README.md` must keep playing out unchanged.
- Update `README.md`, `docs/HOW_IT_WORKS.md` and `docs/DECISIONS.md` in the same PR when visible behaviour or a rule changes.

## Governance rules: never weaken these without Paige's explicit approval

- Records are immutable. Every authority level change writes a decision record. Edits create new versions and never overwrite.
- Records name the person who acted and keep their name, title, team and rights as they were at the time. They also keep the workspace and workflow names in force when written; a rename (a workspace admin's direct edit with a required reason) never rewrites them.
- After performance results exist (a test run, pilot or measured evidence), changes to criteria, requirements, stakeholder membership, and the contract once a pilot has started go through a proposal and sign-off. The one exception: a criteria/requirements change that software confirms is **tightening only** (every changed threshold strictly stricter, only its number changed, nothing removed, added, renamed, reworded or loosened) applies directly as a recorded amendment, surfaced in Activity, but only when the person is the capability owner or a named stakeholder and no expansion decision is pending. Anyone else, or any time a decision is pending, it goes to sign-off. Any loosening anywhere sends the whole change to sign-off. The decision workspace shows every change to the bar since the decision opened.
- The proposer never approves. Low/Medium impact needs one approver. High impact or Financial exposure needs two distinct approvers, at least one holding the Risk approver right.
- Risk approval is an explicit recorded right on a person. It is never inferred from a team name or a capability label.
- Rights are set directly only once: the founding roster at workspace setup (roster version 1), which needs at least two workspace admins and is authored by the founding admin who says they are setting it up. Every rights change after that is governed.
- Start empty and Reset demo erase every record, so each asks for confirmation inline first.
- Granting a right: the approver is neither the proposer nor the recipient. Approvers are frozen when a proposal opens. Proposals that can't be satisfied are refused when proposed.
- Expanding authority needs a pending proposal and goes one level at a time; each step needs its own evidence and authorization (no multi-level jumps). Pulling authority back is always possible, but still needs a named person, a rationale and a record.
- After an automatic restriction or a rule incident, the post-incident review is recorded by the owner or a Risk approver (a Risk approver for High impact or Financial exposure), never by the system or someone deactivated, and **never by the person who authorized the expansion that was restricted**. A review clears the lock but never restores authority.
- Authorizing an expansion requires an expected-impact statement (2–4 outcomes with numbers) and a rollout plan, both recorded on the decision record and immutable. Restrict, suspend and redesign don't need them. (Approved 2026-10-09; enforced once #72 and #74 are built.)
- The gate (`checkAction` in `src/store/gate.js`) is the one place that decides whether an AI action may happen: allow, needs a person, or block, always with the reason and rule. Level 0 blocks everything; Level 1 blocks actions; Level 2 needs a person for every action; Level 3 allows only within the recorded limits; Level 4 allows unless a must-ask or must-never applies. Must-never always blocks; must-ask always needs a person. Facts come only from systems of record, never the model's arguments, and a contradicting claim blocks. Cumulative limits count per order and per customer per day, and Expand-with-limits can cap the capability's whole day (total refunded and number of refunds, across all customers); over any of them, a person. Any id the model supplies (an order, a tool name) is looked up as an own property only, so built-in names like "constructor" or "__proto__" are never a record or a tool. Confidence is model-reported: it is checked, labelled "model-reported, not verified" wherever it appears, listed with what software can't verify, and never given as the reason an action was allowed. Contract lines software can't check are listed as not enforced, never pretended. The level in force applies at once, including right after an automatic restriction.
- The data boundary: every tool result is filtered to the contract's "data the AI may see" fields before the model sees it; a contract with no data section shows nothing from the records. Restricted fields (full card number, full address) never reach the model and no contract may list them. A refusal tells the model the verdict and rule, never the gate's full reason, which can quote record values. Tools execute only on an "allow".
- "Waiting for a person": an action the gate says needs a person waits in a queue. At most one action waits per order per tool (another request for that order, whatever the amount or claims, is refused: "already waiting for a person: WA-xxx"), and at most 10 per capability (past that, new requests are blocked as "queue full" and one incident is opened until it drains). A new request after a refused approval records "follows WA-xxx". Only an active owner or listed stakeholder of the capability may approve or reject it, with a reason, once; never the AI or the system, and an empty stakeholder list never widens to everyone. Approval re-runs the gate at that moment and executes only if no review is pending, the authority hasn't dropped, nothing blocks it now, and every reason it needs a person now was already there when it was queued; otherwise it's refused at execution with the reason recorded.
- Warnings explain and link to the fix; they never block.

When you change anything near these rules, write a test that tries to get around the rule and confirm it is refused.

## How to work

- One issue per branch and PR. The PR description is your report: what changed, the test count, screenshots for UI work (on the `pr-screenshots` branch, not `main`), and anything you weren't sure about.
- **You may merge on your own** only housekeeping with no behaviour change, and only when CI is green, the test count is the same or higher, and no existing test changed except import paths.
- **Leave open for Paige** anything visible to users, anything touching a governance rule, and anything you're unsure about.
- Stop and ask when something needs a product decision. Don't decide it and carry on.
- Production deploys from `main` (Vercel), so `main` must always be releasable. **Only merges to `main` deploy.** `vercel.json` turns off deployments for every other branch (`git.deploymentEnabled`), because Paige's plan limits deploys. Batch work so `main` takes as few merges as practical, and check a branch locally instead of expecting a preview link.
