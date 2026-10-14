# Authority Lab first-time setup

The setup should teach the mental model as the user works. It should not require the user to understand Authority Lab before starting.

## 1. Context

Prompt: **Tell us about the product or workflow.**

Use a hybrid intake:
1. free-form description;
2. AI extracts likely structured facts;
3. user confirms or corrects them;
4. Authority Lab asks only relevant follow-up questions.

Useful structured facts include:
- purpose and desired outcome;
- users/operators;
- people affected by the output;
- internal vs external use;
- pilot vs production;
- data sensitivity/confidentiality;
- regulated or professional context;
- whether AI retrieves, drafts, classifies, recommends, acts or uses tools;
- whether it can affect people, money, rights, accounts, compliance or safety;
- reversibility and scale;
- available evidence sources;
- where humans enter the workflow.

Consequential facts must be confirmed before they influence setup.

## 2. Starting point

Choose:
- a template;
- a template to customize;
- Start from scratch.

Authority Lab may recommend a likely template based on Context, but the user chooses.

## 3. Capability

Prompt: **What specific thing are we giving AI permission to do?**

Capture a short plain-language definition:
- what it does;
- who it helps;
- what output or action it produces.

Do not put model names, prompts or implementation details in the basic capability definition.

## 4. Risk

Prompt: **What could go wrong, how serious would it be, and how likely does it seem?**

Default view:
- overall Risk: Low / Moderate / High;
- Severity;
- Likelihood, including Unknown.

Optional drill-down can cover people/customer, financial, legal/compliance, privacy/security, operational and safety consequences, plus reversibility and scale.

## 5. Authority

Prompt: **How independently should the AI operate right now?**

Authority is the current permission level, not the aspirational end state.

Every level should explain:
- what the AI may do;
- what still requires a person.

## 6. Boundaries

Prompt: **Where should the AI stop or involve a person?**

Boundaries may be conditional and should cover:
- allowed;
- needs human review;
- prohibited.

Use plain behavioral language rather than implementation language.

## 7. Requirements

Prompt: **What must be true before we would consider giving it more authority?**

Requirements may concern safety, evidence, sample size, recency, approval, rollback, policy or other conditions.

## 8. Targets

Prompt: **What measurable performance would count as good enough?**

Only ask for Targets where measurement makes sense.

Templates may suggest target types but must not silently choose thresholds.

## 9. Evidence

Prompt: **How will we know?**

Map Requirements and Targets to relevant sources:
- evals;
- production metrics;
- manual review;
- incidents;
- user/customer feedback;
- support data;
- audits;
- pilot results.

## 10. People

Assign:
- one Owner;
- required Reviewers;
- optional Stakeholders.

No authority change can be approved without an Owner.

## 11. Review setup

Authority Lab presents the setup back in plain language:
- capability;
- current Authority;
- important Boundaries;
- Risk;
- Requirements and Targets;
- Evidence and Coverage gaps;
- Owner/Reviewers/Stakeholders;
- possible blind spots or contradictions.

The user explicitly confirms the setup.

## Optional during setup

Impact can be configured during a pilot if a baseline already exists, but it should not block first-time setup.

## Help

At every step, optional Help may provide:
- why this question matters;
- plain-language examples;
- contextual suggestions;
- questions to ask stakeholders;
- deeper explanation on request.

AI guidance remains advisory.
