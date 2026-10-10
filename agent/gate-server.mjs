// The Authority Lab MCP server (roadmap item 9, A3). It exposes the agent's
// three tools over MCP. Every call goes through the same gate and data filter
// the app uses, imported from src/store/: there is one implementation.
//
// The server acts for one capability, fixed when it starts. No tool takes a
// capability argument, so a model can't switch to a more permissive one.
// Likewise the ticket: whoever starts the server binds it to one ticket in
// the system of record (or none), and no tool takes a ticket argument.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callTool, getCapability, toolCall } from '../src/store/index.js';

// A second layer in front of the gate: an order id must look like one. The
// gate itself looks ids up as own properties, so "constructor" and friends
// are refused either way.
export const ORDER_ID = z.string().regex(/^ORD-\d{4,}$/, 'An order id looks like ORD-5001.');

const TOOL_DOCS = {
  lookup_order: 'Look up an order in the system of record. You see only the fields this capability\'s contract allows.',
  issue_refund: 'Issue a refund on an order. Software decides whether it may happen now, needs a person, or is blocked. Only an allowed refund executes. Say who gave the instruction in instructionSource: "customer" only if the customer on this ticket asked; otherwise the name or role of whoever did.',
  escalate_to_human: 'Hand the case to a person, with your reason. Always allowed above Level 0.',
};

// loadState() returns the current state; saveState(next) stores it when a call
// changed something; onCheck(check) receives the gate's full verdict for the
// record (it can quote record values, so it never goes to the model).
export function createAgentServer({ capabilityId, ticketId = null, loadState, saveState = () => {}, onCheck = () => {} }) {
  if (!getCapability(loadState(), capabilityId)) throw new Error(`Unknown capability "${capabilityId}".`);
  const server = new McpServer({ name: 'authority-lab', version: '0.1.0' });

  // Tool input becomes a gate call the same way a replay rebuilds it (A6).
  const run = (tool, input) => {
    const state = loadState();
    const { args, claims } = toolCall(tool, input);
    const call = { tool, args, claims, ...(ticketId != null ? { ticketId } : {}) };
    const { state: next, result, check } = callTool(state, capabilityId, call);
    onCheck({ tool, args, claims, ticketId, check });
    if (next !== state) saveState(next);
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  };

  server.registerTool('lookup_order', {
    description: TOOL_DOCS.lookup_order,
    inputSchema: { orderId: ORDER_ID.describe('The order id, e.g. ORD-5001') },
  }, (input) => run('lookup_order', input));

  server.registerTool('issue_refund', {
    description: TOOL_DOCS.issue_refund,
    inputSchema: {
      orderId: ORDER_ID,
      amount: z.number().describe('Refund amount in dollars'),
      confidence: z.number().min(0).max(100).optional().describe('Your confidence, 0-100'),
      instructionSource: z.string().trim().min(1).describe('Who gave the instruction for this refund: "customer" if the customer on this ticket asked, otherwise the name or role of whoever did. Required. Model-reported, not verified: software checks the ticket\'s sender against the record.'),
      paymentMethod: z.string().optional().describe('Only if refunding to a method other than the original'),
      claims: z.object({
        orderValue: z.number().optional(),
        customerId: z.string().optional(),
        fraudFlag: z.boolean().optional(),
        chargeback: z.boolean().optional(),
        policyException: z.boolean().optional(),
      }).optional().describe('Facts you believe about the order. Software checks them against the record; a wrong one blocks the refund.'),
    },
  }, (input) => run('issue_refund', input));

  server.registerTool('escalate_to_human', {
    description: TOOL_DOCS.escalate_to_human,
    inputSchema: { reason: z.string(), orderId: ORDER_ID.optional() },
  }, (input) => run('escalate_to_human', input));

  return server;
}
