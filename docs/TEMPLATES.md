# Authority Lab templates

## Principle

**Templates prefill the questions, not the answers.**

Templates reduce setup effort, not responsibility.

They may provide:
- structure;
- common categories;
- example wording;
- likely evidence types;
- common stakeholder roles;
- suggested questions;
- likely areas of risk or boundaries.

They must not silently decide:
- Risk;
- Severity or Likelihood;
- starting or future Authority;
- actual Boundaries;
- thresholds;
- Owner;
- mandatory Reviewers;
- evidence sufficiency;
- a Proposal or Decision.

Consequential template suggestions should move through:
**Suggested → Reviewed → Confirmed**

Do not provide a one-click "confirm all" for consequential configuration.

## v1 template families

### Knowledge / Research
Examples: legal research, internal knowledge assistant, policy lookup.

Likely focus:
- source quality;
- citations/provenance;
- unsupported claims;
- freshness;
- access permissions;
- fact vs inference.

### Draft / Create
Examples: email drafting, memos, marketing copy, documentation, code generation.

Likely focus:
- factuality;
- inappropriate content;
- IP;
- disclosure;
- review before publication.

### Extract / Classify
Examples: intake classification, document extraction, routing.

Likely focus:
- accuracy;
- false positives/negatives;
- missed cases;
- sensitive classes;
- edge cases.

### Recommend
Examples: refund recommendation, prioritization, next-best action.

Likely focus:
- recommendation quality;
- explainability;
- bias;
- consequential recommendations;
- over-reliance.

### Customer / User Interaction
Examples: chatbots, support assistants, onboarding assistants.

Likely focus:
- disclosure;
- escalation;
- harmful/inaccurate responses;
- privacy;
- accessibility;
- customer impact.

### Workflow Automation
Examples: updating tickets, scheduling, creating tasks, moving data between systems.

Likely focus:
- permissions;
- reversibility;
- exceptions;
- auditability;
- human handoff.

### Action / Transaction
Examples: issuing refunds, changing account status, sending external communication, production changes.

Likely focus:
- authorization;
- limits;
- irreversible/high-impact actions;
- rollback;
- human approval.

### Monitor / Detect
Examples: fraud alerts, anomaly detection, safety monitoring.

Likely focus:
- missed detections;
- false alarms;
- response expectations;
- monitoring gaps;
- downstream action.

### Start from scratch
A first-class option, not an advanced mode.

## Context overlays

Do not create a separate template for every industry.

Instead apply contextual overlays such as:
- regulated/professional;
- legal;
- financial;
- health/safety;
- sensitive/confidential data;
- customer-facing;
- affected people/fairness;
- external publication;
- production/system access.

Overlays add relevant questions and suggested considerations without changing the underlying product model.

## Agentic overlay

Agentic behavior is an overlay, not a template.

If the AI can independently choose steps, tools or actions while pursuing a goal, add questions for:
- available tools;
- read vs write permissions;
- credential scope;
- per-action authorization;
- memory;
- loop/step limits;
- spend limits;
- external communication;
- side effects;
- sandboxing;
- audit logging.

## Organization templates

Later, organizations or consultancies may save reusable templates from successful work. These remain starting points and never bypass review.
