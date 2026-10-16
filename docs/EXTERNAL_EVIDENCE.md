# Sending evidence to Authority Lab

How an AI system that runs somewhere else sends Authority Lab evidence about one of its capabilities. The contract is domain-neutral: nothing in it knows about refunds, support or any particular sender. State's Evidence Interpreter is the first sender (#121).

## How it travels

The site is static and never calls out, so evidence travels through git (Paige, 2026-10-12):

1. The sender writes one **envelope** per run: a JSON file named after the run, under `src/data/external-evidence/`, and adds the file name to `index.json` there.
2. It opens a pull request to `pedringt/authority-lab`. CI checks every file (`scripts/external.test.mjs`, "every committed evidence file…"). A file that fails is refused there, with the reason, before anything is merged.
3. **A merged file is an acknowledged one.** Until the pull request is merged, the sender should treat the run as not delivered.
4. The app imports every listed file on load and again after Reset demo. Importing is idempotent: a file already in the workspace changes nothing. A file that still can't be imported (a bad file that reached `main` some other way, or one that can't be read) is listed on **Records** with the reason; it is never dropped quietly.

Retries are safe: the same envelope sent again, under the same id, is a no-op. The same id with different content is refused, because **imported evidence never changes**: a correction is new evidence with its own id.

The first delivery (#518): `state-eval-review-gh-38411808397-1.json`, from State's review interpretation suite, copied unchanged from the run's `authority-lab-evidence-<run>-<attempt>` artifact. CI also checks that every file imports into exactly one built-in workspace.

## The envelope (`authority-lab-evidence/1`)

```json
{
  "schema": "authority-lab-evidence/1",
  "id": "acme:eval:run-0001",
  "capabilityId": "ticket-classification",
  "source": { "system": "Acme", "capability": "Classifier", "environment": "staging" },
  "kind": "eval",
  "observedAt": "2026-10-06",
  "config": { "provider": "Example", "model": "model-a", "prompt": "p-3", "implementation": "abc1234", "evalSet": "es-2", "toolPolicy": "tp-1" },
  "reference": { "url": "https://example.com/runs/0001", "label": "Run 0001" },
  "measurements": [
    { "metric": "quality", "label": "Classification quality", "type": "rate", "passed": 46, "total": 50 },
    { "metric": "quality", "label": "Classification quality", "type": "rate", "passed": 7, "total": 10, "segment": "Ambiguous tickets" },
    { "metric": "severe-failures", "label": "Severe failures", "type": "count", "value": 1, "total": 50, "severity": "high" },
    { "metric": "latency-p95", "label": "Latency (p95)", "type": "value", "value": 840, "unit": "ms" }
  ],
  "notes": "Optional, at most 300 characters."
}
```

| Field | Required | What it is |
|---|---|---|
| `schema` | yes | Always `authority-lab-evidence/1`. |
| `id` | yes | A stable id for the run, the same on every retry: 3–120 characters of lowercase letters, digits and `: . _ -`. Unique across the workspace. |
| `capabilityId` | yes | The Authority Lab capability the evidence is about. |
| `source` | yes | `system` and `capability` (who produced it), optional `environment`. |
| `kind` | yes | `eval` (a test or eval set) or `production` (real use). |
| `observedAt` | yes | When the run happened: `YYYY-MM-DD` or an ISO date and time. |
| `config` | no | Version strings for what produced the result: `provider`, `model`, `prompt`, `implementation`, `evalSet`, `toolPolicy`. |
| `reference` | no | `url` (https) and `label`: where to see the full run in the source system. |
| `measurements` | yes | 1 to 40 results, at most one per metric and segment. |
| `notes` | no | A short note, at most 300 characters. |

A measurement has a `metric` id (lowercase letters, digits, hyphens), an optional `label`, `segment` and `severity` (`low`, `medium`, `high`), and one of three types:

- **`rate`**: `passed` of `total` (whole numbers, total above 0).
- **`count`**: a whole-number `value`, optionally with the `total` sample it came from.
- **`value`**: any number, with an optional `unit` (`%`, `$`, `ms`, `s`, `cases`) and optional `total`.

## What stays out

Authority Lab gets a summary and a reference, never the source's content. Every key is allowlisted at every level, so a field the contract doesn't have (a document body, a system prompt, examples, a token) is refused, and every text field is short. The source system stays the record of the detailed run; follow `reference.url` to see it.

## Results people record or upload (#142)

The same envelope carries results a person records in Authority Lab (**Record result**) and files they upload (CSV or JSON). They differ from a connected sender in one way: compatible results add up instead of the newest replacing the rest (same metric, segment, `kind`, measurement type, unit and configuration, inside the 90-day manual window). Three reviews of 10 cases count as 30. A single `value` never adds up. An upload stays in the browser it was made in; a committed file is still the way to share evidence.

## Versions and comparability

Send every version you know in `config`, the same way on every run. Authority Lab groups runs by source system, source capability and kind (eval or production). The newest run by `observedAt` sets the current configuration; results from a different configuration (any version changed, added or dropped) are shown as **Earlier configuration** and don't count toward targets. Under the same configuration, a newer run's result for a metric and segment replaces the older one. A decision record keeps the configuration in force when it was made.

## Getting your results judged

A capability's targets, decision requirements and safety limits can be **measured** from your metrics: each names a `metric` id (and `segment`), what to read (`rate`, `fail-rate`, `share`, `count`, `value` or `sample`), a comparison and a number. Use the same metric ids and segment names on every run. Production results need at least 20 cases (or the row's own minimum) before they're judged; until then they're "Too early to judge". Only production results feed safety limits.

## What happens to it

Each measurement becomes one item in the capability's evidence, next to tests, pilots and everything else, marked as imported and labelled with its source. Imported results count as performance results, so they lock the capability's targets the way a first test run does. They're shown as **Not judged yet** until a target or decision requirement is bound to the metric (#120). Evidence on its own never changes a capability's authority: a person decides.
