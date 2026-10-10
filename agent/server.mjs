#!/usr/bin/env node
// Run the Authority Lab MCP server over stdio, for Claude Code or Claude
// Desktop. See README.md.
//
//   node agent/server.mjs --capability refund-recommendation [--expand] [--fresh]
//
// --capability  the capability the agent acts for (default refund-recommendation)
// --expand      start from the demo story's authorized expansion (Expand with
//               limits), if a decision is pending for the capability
// --fresh       discard the saved session and start again from the seed
//
// The session's state (refund ledger, escalations) is kept in
// agent/.state/<capability>.json so refunds add up across calls. Gate verdicts,
// with their full reasons, go to stderr; stdout carries only MCP messages.

import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initialState, authorize, selectDecision, decisionRequired, getCapability } from '../src/store/index.js';
import { createAgentServer } from './gate-server.mjs';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback; };

const capabilityId = option('capability', 'refund-recommendation');
const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, '.state', `${capabilityId}.json`);
if (flag('fresh') && existsSync(file)) rmSync(file);

function seedState() {
  let s = initialState();
  if (!getCapability(s, capabilityId)) throw new Error(`Unknown capability "${capabilityId}".`);
  if (flag('expand')) {
    if (!decisionRequired(s, capabilityId)) throw new Error(`--expand: no decision is pending for ${capabilityId}.`);
    s = authorize(selectDecision(s, capabilityId, 'expand-limits'), capabilityId);
  }
  return s;
}

let state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : seedState();
const save = (next) => { state = next; mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(next)); };
save(state);

const server = createAgentServer({
  capabilityId,
  loadState: () => state,
  saveState: save,
  onCheck: ({ tool, check }) => process.stderr.write(`[gate] ${tool}: ${check.verdict} (${check.rule.kind}) ${check.reason}\n`),
});
process.stderr.write(`[authority-lab] ${getCapability(state, capabilityId).name} at Level ${getCapability(state, capabilityId).authority.level}; state in ${file}\n`);
await server.connect(new StdioServerTransport());
