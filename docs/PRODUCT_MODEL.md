# Authority Lab product model

Authority Lab helps people decide what an AI capability should be allowed to do, based on context, risk, evidence and explicit human judgment.

It is designed for people responsible for AI use in a domain they understand: product people, AI consultants, engineers, operations leads, lawyers, client-side owners and other domain experts. They may or may not be AI specialists.

## Core model

### Context
The product, workflow or business process the AI capability belongs to.

Context includes enough information to understand purpose, users, affected people, environment, data, consequences, human involvement and available evidence. Context informs setup; it does not silently determine it.

### Capability
One specific thing the AI is being asked to do.

A capability should be narrow enough that its authority can be judged meaningfully.

### Authority
How independently the capability is allowed to operate.

Authority is permission, not model quality, confidence or risk.

### Boundaries
The conditions and limits on that authority.

Boundaries define what is allowed, what requires human review and what is prohibited. They may be conditional.

### Risk
Overall downside exposure if the capability fails or behaves incorrectly.

Risk combines:
- **Severity:** how serious the consequences would be.
- **Likelihood:** how likely the relevant failure appears to be.

Unknown is a valid likelihood state when evidence is insufficient.

### Requirements
What must be true before an authority change should be considered.

Requirements may concern evidence, safety, recency, approval, rollback, sample size, policy or other conditions. They are broader than performance metrics.

### Targets
Measurable quality or performance standards.

Targets may include pass rates, failure ceilings, correction rates or other capability-specific measures.

### Evidence
Information used to judge Requirements and Targets.

Examples include eval runs, production metrics, incidents, manual review, user feedback, support data, audits and pilot results.

Evidence supports a decision. It is not the decision.

### Coverage
Whether there is enough relevant, current and representative Evidence to judge a Requirement or Target.

Coverage must remain distinct from pass/fail. "Not enough evidence" is not the same as "failed."

### People
- **Owner:** one accountable person for authority decisions.
- **Reviewers:** people whose input is required.
- **Stakeholders:** other people involved, affected or consulted.

No authority change can be approved without an Owner.

### Proposal
A specific suggested change to Authority.

A Proposal explains what changes, why now, what Evidence supports it, what Boundaries remain and what gaps still exist.

A Proposal is not a Decision.

### Decision
The Owner's recorded human choice about a Proposal.

The Decision keeps the proposal, outcome, rationale, evidence available at the time, reviewer input and date/time. AI may summarize or prepare the decision workspace but cannot make the Decision.

### Monitor
Ongoing checking of whether current Authority is still justified.

Monitoring can surface new evidence, degradation, incidents, boundary violations, stale evidence, model/version changes, reviewer disagreement and unexpected operational effects. Monitoring may trigger attention or a new Proposal, but never changes Authority by itself.

### History
The audit trail of meaningful authority-related events.

History should explain how the capability reached its current state, not log every click.

### Impact
The value or benefit the capability is creating.

Examples include time saved, reduced review burden, throughput, cost, adoption, user satisfaction, fewer errors or faster turnaround.

Impact informs whether the capability is worthwhile. It never overrides Risk, safety or evidence requirements.

## Product loop

Context
→ Capability
→ Risk
→ Authority
→ Boundaries
→ Requirements + Targets
→ Evidence + Coverage
→ People
→ Proposal
→ Decision
→ Monitor
→ History
→ Impact

Monitoring can lead back to a new Proposal and Decision.

## Product positioning

Authority Lab is useful for:
- cautious teams that need evidence before expanding AI use;
- over-aggressive teams that need explicit limits and checks;
- AI consultancies helping clients run pilots;
- client-side teams running the process themselves;
- ongoing production review after a pilot succeeds.

The product should create value for a one-time pilot even if a team never adopts it as a permanent governance system.
