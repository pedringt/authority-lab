# Standards map

> **Learning notes, not a compliance claim.** This maps Authority Lab's ideas to three frameworks, to learn how they relate. It is not legal advice, does not say Authority Lab complies with anything, and is not a substitute for reading the sources. Every mapping links to its primary source; anything that couldn't be checked against one is marked **uncertain**.

Researched and checked on 2026-10-10 against:

- **NIST AI Risk Management Framework 1.0** (NIST AI 100-1): the [PDF](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf) (the Core is in Tables 1–4, pp. 21–32), the [Core online](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/) and the [Playbook](https://airc.nist.gov/airmf-resources/playbook/). Quotes below were checked word for word against the PDF.
- **EU AI Act**, Regulation (EU) 2024/1689: [official text on EUR-Lex (ELI)](https://eur-lex.europa.eu/eli/reg/2024/1689/oj). Quotes were checked word for word against the official Publications Office copy. Articles are cited by number. Per-article links aren't given, because EUR-Lex's article anchors couldn't be checked from here.
- **ISO/IEC 42001:2023**, AI management systems: [ISO's page](https://www.iso.org/standard/42001). The standard itself is paid. Only what ISO publishes was used, and no clause numbers are given.

## Two things to know first

- **The EU articles below apply to high-risk AI systems only.** Articles 9, 10, 12, 13, 14, 19, 20, 26, 72 and 73 sit in the Act's high-risk chapters.
- **Dates are moving.** Article 113 of the original text says the Act "shall apply from 2 August 2026", with Article 6(1) obligations from 2 August 2027. Secondary sources report that a later amending act changed some of these dates. **Uncertain:** the amending act wasn't checked against the Official Journal, so check the consolidated text before relying on any date.

## 1. Authority levels (L0–L4), raised one level at a time by a named person

| Framework | Provision | What it says | Confidence |
|---|---|---|---|
| NIST | GOVERN 2.1 | "Roles and responsibilities and lines of communication related to mapping, measuring, and managing AI risks are documented and are clear…" | Verified |
| NIST | GOVERN 3.2 | "Policies and procedures are in place to define and differentiate roles and responsibilities for human-AI configurations and oversight of AI systems." | Verified |
| NIST | MAP 3.3 | "Targeted application scope is specified and documented based on the system's capability, established context, and AI system categorization." | Verified |
| EU | Art. 14(3) | Oversight measures "shall be commensurate with the risks, level of autonomy and context of use" of the system. | Verified |
| EU | Art. 26(2) | Deployers assign human oversight to natural persons with the "necessary competence, training and authority". | Verified |
| ISO | — | ISO's public material doesn't mention levels of autonomy or delegation. | Uncertain |

**Where Authority Lab goes beyond them:** none of the three defines a graded scale like L0–L4. The ladder, and the one-level-at-a-time rule, are Authority Lab's own.

## 2. Human oversight: a named person approves or rejects; the AI never approves

| Framework | Provision | What it says | Confidence |
|---|---|---|---|
| NIST | MAP 3.5 | "Processes for human oversight are defined, assessed, and documented in accordance with organizational policies from the GOVERN function." | Verified |
| NIST | MANAGE 4.1 | Post-deployment monitoring plans include mechanisms for "appeal and override". | Verified |
| EU | Art. 14(1) | High-risk systems are designed so they "can be effectively overseen by natural persons during the period in which they are in use". | Verified |
| EU | Art. 14(4)(d) | The people overseeing can decide not to use the system or "otherwise disregard, override or reverse the output". | Verified |
| EU | Art. 14(5) | For remote biometric identification only, no action unless the identification is "separately verified and confirmed by at least two natural persons". | Verified |
| ISO | — | Not visible in ISO's public material. | Uncertain |

**Where Authority Lab goes beyond them:** the Act requires that oversight be *possible* (override, stop, disregard). It doesn't require a queue where the AI waits for approval before acting. "The AI can never approve" is stricter than anything the Act states.

## 3. Audit trail: decision records that never change, a log of every gate decision, versioned contracts

| Framework | Provision | What it says | Confidence |
|---|---|---|---|
| NIST | GOVERN 1.4 | The risk management process and its outcomes are established through transparent policies, procedures and other controls. | Verified |
| NIST | MANAGE 4.3 | "Processes for tracking, responding to, and recovering from incidents and errors are followed and documented." | Verified |
| EU | Art. 12(1) | High-risk systems "shall technically allow for the automatic recording of events (logs) over the lifetime of the system". | Verified |
| EU | Art. 19(1), Art. 26(6) | Providers and deployers keep the logs under their control for at least six months, unless other law says otherwise. | Verified |
| ISO | — | ISO lists traceability and transparency among the standard's benefits. No clause can be cited from public material. | Uncertain |

**Where Authority Lab goes beyond them:** the Act requires logs, but doesn't say they must be immutable or carry a recorded rationale and evidence snapshot.

## 4. Automatic restriction when a rule is crossed, and a human review before expanding again

| Framework | Provision | What it says | Confidence |
|---|---|---|---|
| NIST | MANAGE 2.4 | "Mechanisms are in place and applied, and responsibilities are assigned and understood, to supersede, disengage, or deactivate AI systems that demonstrate performance or outcomes inconsistent with intended use." | Verified |
| NIST | MEASURE 2.4 | The system's functionality and behaviour "are monitored when in production". | Verified |
| NIST | MANAGE 2.4 (Playbook) | Suggests reviewing the thresholds that trigger disengagement, root-cause analysis, and criteria for redeploying. This is the closest match to "a review before expanding again". | Partially verified |
| EU | Art. 26(5) | Where deployers "have reason to consider" that use may present a risk under Article 79(1), they inform the provider or distributor and the market surveillance authority "and shall suspend the use of that system". | Verified |
| EU | Art. 72(1)–(2) | Providers run post-market monitoring that "actively and systematically" collects and analyses performance data. | Verified |
| EU | Art. 73 | Serious incidents are reported within 15 days at most, 2 days in some cases, and 10 days where a death is involved, and then investigated. | Verified |
| ISO | — | ISO describes the standard as a Plan-Do-Check-Act management system covering risk assessment and treatment. Clauses on incidents can't be cited. | Uncertain |

**Where Authority Lab goes beyond them:** none of the three requires authority to drop *automatically*. They describe human-run mechanisms and responsibilities.

## 5. Data boundary: the AI sees only the fields its contract allows, and facts come from systems of record

| Framework | Provision | What it says | Confidence |
|---|---|---|---|
| NIST | MEASURE 2.10 | "Privacy risk of the AI system – as identified in the MAP function – is examined and documented." | Verified |
| NIST | MEASURE 2.5 | The system to be deployed is demonstrated to be valid and reliable. | Verified |
| EU | Art. 10 | Data governance for training, validation and testing data sets. | Verified, but a weak fit |
| ISO | — | Not visible in ISO's public material. | Uncertain |

**A weak fit:** Article 10 is about the quality of training and test data, not about limiting which fields a model sees at runtime. Limiting fields fits privacy law (such as the GDPR) better, which isn't covered here. None of the three addresses blocking a model's claim that contradicts the system of record.

## What couldn't be checked

- **ISO/IEC 42001** clause numbers, its Annex A controls, and whether it covers human oversight, logging or data controls. The text is paid, and its preview needs accepting ISO's terms.
- **The amending act** reported to change the EU AI Act's dates.
- **Per-article links** into EUR-Lex, and per-subcategory links into the NIST Playbook (its pages have no anchors).
