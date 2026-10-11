// Where each real recording came from (src/data/agent-runs/provenance.json),
// so the Agent runs page can link its proof: the GitHub Actions run and who
// approved it, the ledger row, and the commit that added it.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RUNS_DIR, PROVENANCE } from './runs.mjs';

// The entry for a live run. On GitHub, the Actions run and its approver
// (APPROVED_BY, set by the workflow from the run's approvals). Anywhere else,
// it says the run was made outside GitHub. The commit isn't known until the
// recording is committed, so the page links the file's history instead.
export function proofFor({ env = process.env, ledgerLine } = {}) {
  if (env.GITHUB_RUN_ID) return { via: 'github-actions', actionsRun: Number(env.GITHUB_RUN_ID), approvedBy: env.APPROVED_BY || null, ledgerLine };
  return { via: 'local', ledgerLine, note: 'Run from a local machine, not through GitHub Actions' };
}

export function readProvenance(dir = RUNS_DIR) {
  const p = join(dir, PROVENANCE);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { runs: {} };
}

export function recordProof(file, entry, dir = RUNS_DIR) {
  const data = readProvenance(dir);
  data.runs = { ...(data.runs || {}), [file]: entry };
  writeFileSync(join(dir, PROVENANCE), `${JSON.stringify(data, null, 2)}\n`);
  return entry;
}
