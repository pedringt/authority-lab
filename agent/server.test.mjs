// The MCP server, driven by a real MCP client over an in-memory transport.
// Every call must pass through the gate and the data filter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { initialState, authorize, selectDecision, simulateBreach, callTool, checkAction } from '../src/store/index.js';
import { createAgentServer } from './gate-server.mjs';

const RR = 'refund-recommendation';
const expanded = () => authorize(selectDecision(initialState(), RR, 'expand-limits'), RR);

// The seeded ticket for an order's customer (TK-2001 to TK-2005), if any.
const ticketOf = (state, orderId) => {
  const o = Object.hasOwn(state.systems.orders, orderId) ? state.systems.orders[orderId] : null;
  const id = o ? `TK-2${o.customerId.slice(3)}` : null;
  return id && state.systems.tickets && Object.hasOwn(state.systems.tickets, id) ? id : null;
};

// One MCP session per ticket, all sharing one state, as a support team's
// agents would: a refund goes to the session bound to its order's customer's
// ticket (or, with `ticket`, a chosen one), and says the customer asked
// unless a test says otherwise (S04 option 2).
async function connect(start, capabilityId = RR, { ticket } = {}) {
  let state = start;
  const checks = [];
  const sessions = new Map();
  const open = async (ticketId) => {
    if (sessions.has(ticketId)) return sessions.get(ticketId);
    const server = createAgentServer({ capabilityId, ticketId, loadState: () => state, saveState: (next) => { state = next; }, onCheck: (c) => checks.push(c) });
    const client = new Client({ name: 'test', version: '0.0.0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    sessions.set(ticketId, client);
    return client;
  };
  const first = await open(ticket === undefined ? null : ticket);
  const call = async (name, args) => {
    const input = name === 'issue_refund' && !('instructionSource' in args) ? { ...args, instructionSource: 'customer' } : args;
    if (name === 'issue_refund' && input.instructionSource === null) delete input.instructionSource;
    const client = await open(ticket !== undefined ? ticket : name === 'issue_refund' ? ticketOf(state, args.orderId) : null);
    const r = await client.callTool({ name, arguments: input });
    return { raw: r, result: r.isError ? { error: r.content[0].text } : JSON.parse(r.content[0].text) };
  };
  return { client: first, call, get state() { return state; }, set state(s) { state = s; }, checks };
}

// Every value the model must never see.
const secrets = (s) => Object.values(s.systems.customers).flatMap((c) => [c.fullName, c.email, c.city, c.address]).concat(Object.values(s.systems.orders).map((o) => o.cardNumber));

test('the server exposes exactly the three tools, none of which takes a capability', async () => {
  const { client } = await connect(expanded());
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ['escalate_to_human', 'issue_refund', 'lookup_order']);
  for (const t of tools) assert.equal('capabilityId' in (t.inputSchema.properties || {}), false, `${t.name} takes no capability`);
});

test('a tool call returns exactly what the shared gate and filter return', async () => {
  const s = expanded();
  const { call } = await connect(s);
  for (const [name, args] of [['lookup_order', { orderId: 'ORD-5003' }], ['issue_refund', { orderId: 'ORD-5003', amount: 20, confidence: 95 }], ['issue_refund', { orderId: 'ORD-5001', amount: 30, confidence: 95 }]]) {
    const { result } = await call(name, args);
    const { confidence, ...rest } = args;
    const direct = callTool(s, RR, name === 'issue_refund' ? { tool: name, args: { ...rest, confidence, paymentMethod: undefined, instructionSource: 'customer' }, ticketId: ticketOf(s, args.orderId) } : { tool: name, args: rest }).result;
    assert.deepEqual(result, direct, `${name} ${args.orderId}`);
  }
});

test('a blocked or needs-person call never executes', async () => {
  const conn = await connect(expanded());
  const before = conn.state.systems.refunds.length;
  const fraud = await conn.call('issue_refund', { orderId: 'ORD-5003', amount: 20, confidence: 95 });
  assert.deepEqual([fraud.result.verdict, fraud.result.executed], ['block', false]);
  const lie = await conn.call('issue_refund', { orderId: 'ORD-5003', amount: 20, confidence: 95, claims: { fraudFlag: false } });
  assert.deepEqual([lie.result.verdict, lie.result.rule], ['block', 'fact-mismatch']);
  // ORD-5004 has an active chargeback: needs a person. (ORD-5005 already has a seeded request waiting.)
  const big = await conn.call('issue_refund', { orderId: 'ORD-5004', amount: 60, confidence: 95 });
  assert.deepEqual([big.result.verdict, big.result.executed], ['needs-person', false]);
  const again = await conn.call('issue_refund', { orderId: 'ORD-5005', amount: 150, confidence: 95 });
  assert.deepEqual([again.result.verdict, again.result.rule, again.result.executed], ['block', 'already-waiting', false]);
  assert.equal(conn.state.systems.refunds.length, before, 'the ledger is unchanged');
});

test('an allowed refund executes once; splitting the next one is refused', async () => {
  const conn = await connect(expanded());
  const first = await conn.call('issue_refund', { orderId: 'ORD-5001', amount: 30, confidence: 95 });
  assert.deepEqual([first.result.verdict, first.result.executed], ['allow', true]);
  assert.equal(conn.state.systems.refunds.at(-1).id, first.result.refundId);
  const second = await conn.call('issue_refund', { orderId: 'ORD-5002', amount: 25, confidence: 95 });
  assert.deepEqual([second.result.verdict, second.result.executed], ['needs-person', false], '$30 + $25 to one customer today is over $50');
});

test('after an automatic restriction the server applies the new level at once', async () => {
  const conn = await connect(expanded());
  assert.equal((await conn.call('issue_refund', { orderId: 'ORD-5001', amount: 10, confidence: 95 })).result.verdict, 'allow');
  conn.state = simulateBreach(conn.state, RR);
  const after = await conn.call('issue_refund', { orderId: 'ORD-5001', amount: 10, confidence: 95 });
  assert.deepEqual([after.result.verdict, after.result.rule], ['needs-person', 'level-2']);
});

test('a filtered field never leaves the server', async () => {
  for (const start of [initialState(), expanded()]) {
    for (const cap of [RR, 'refund-execution-high-value']) {
      const { call } = await connect(start, cap);
      const hidden = secrets(start);
      for (const orderId of Object.keys(start.systems.orders)) {
        for (const [name, args] of [
          ['lookup_order', { orderId }],
          ['issue_refund', { orderId, amount: 10, confidence: 95 }],
          ['issue_refund', { orderId, amount: 10, claims: { fraudFlag: false, orderValue: 1 } }],
          ['escalate_to_human', { orderId, reason: 'Checking.' }],
        ]) {
          const { raw } = await call(name, args);
          const text = JSON.stringify(raw);
          for (const secret of hidden) assert.equal(text.includes(secret), false, `${cap} ${name} ${orderId} leaked "${secret}"`);
        }
      }
    }
  }
});

test('a capability argument from the model is ignored; an unknown tool is refused', async () => {
  const { call, client } = await connect(initialState());
  // At Level 2 a refund needs a person, even if the model names a Level 3 capability.
  const r = await call('issue_refund', { orderId: 'ORD-5001', amount: 10, confidence: 95, capabilityId: 'ticket-classification' });
  assert.deepEqual([r.result.verdict, r.result.rule], ['needs-person', 'level-2']);
  const unknown = await client.callTool({ name: 'delete_account', arguments: {} });
  assert.equal(unknown.isError, true);
});

test('the full gate verdict is recorded for the operator, never sent to the model', async () => {
  const conn = await connect(expanded());
  const { raw } = await conn.call('issue_refund', { orderId: 'ORD-5003', amount: 20, confidence: 95, claims: { fraudFlag: false } });
  assert.match(conn.checks.at(-1).check.reason, /contradicts the system of record \(true\)/);
  assert.equal(JSON.stringify(raw).includes('contradicts the system of record'), false);
});

test('built-in object names are refused through the MCP server, at every level', async () => {
  const atLevel = (s, id, level) => ({ ...s, capabilities: s.capabilities.map((c) => (c.id === id ? { ...c, authority: { level, limited: level === 3 } } : c)) });
  const states = [['L0', initialState(), 'account-closure'], ['L1', initialState(), 'refund-execution-high-value'], ['L2', initialState(), RR], ['L3', expanded(), RR], ['L4', atLevel(expanded(), RR, 4), RR]];
  for (const [label, start, cap] of states) {
    const conn = await connect(start, cap);
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      for (const [tool, args] of [['issue_refund', { orderId: name, amount: 40, confidence: 99 }], ['lookup_order', { orderId: name }], ['escalate_to_human', { orderId: name, reason: 'Checking.' }]]) {
        const r = await conn.client.callTool({ name: tool, arguments: args });
        assert.equal(r.isError, true, `${label} ${tool} "${name}": the schema refuses it`);
        assert.equal(conn.state, start, `${label} ${tool} "${name}": nothing changes`);
      }
      // Second layer: if a malformed id ever reached the gate, it would still be refused.
      assert.equal(checkAction(start, cap, { tool: 'issue_refund', args: { orderId: name, amount: 40, confidence: 99 } }).verdict, 'block');
    }
  }
});

test('the order id schema accepts real ids and refuses anything else', async () => {
  const conn = await connect(expanded());
  assert.equal((await conn.client.callTool({ name: 'lookup_order', arguments: { orderId: 'ORD-5001' } })).isError ?? false, false);
  for (const bad of ['', 'ORD-1', '5001', 'ord-5001', 'ORD-5001; DROP', '../ORD-5001']) {
    assert.equal((await conn.client.callTool({ name: 'lookup_order', arguments: { orderId: bad } })).isError, true, `"${bad}"`);
  }
});

test('the model can ask, but never approve: a needs-person refund waits, and there is no approval tool', async () => {
  const conn = await connect(initialState());
  const r = await conn.call('issue_refund', { orderId: 'ORD-5001', amount: 20, confidence: 95 });
  assert.deepEqual([r.result.verdict, r.result.waiting, r.result.executed], ['needs-person', true, false]);
  assert.equal(conn.state.actionQueue.at(-1).id, r.result.queueId);
  for (const name of ['approve_action', 'reject_action', 'approveAction']) {
    assert.equal((await conn.client.callTool({ name, arguments: { id: r.result.queueId, by: 'priya', reason: 'Approving my own request.' } })).isError, true, name);
  }
  assert.equal(conn.state.actionQueue.at(-1).status, 'waiting');
});

test('through the MCP server, gate events are logged and three forbidden attempts restrict the capability', async () => {
  const { rejectAction } = await import('../src/store/index.js');
  const start = authorize(selectDecision(rejectAction(initialState(), 'WA-002', { by: 'daniel', reason: 'Clearing the seeded request.' }), RR, 'expand-limits'), RR);
  const conn = await connect(start);
  for (let i = 0; i < 3; i++) {
    const r = await conn.call('issue_refund', { orderId: 'ORD-5003', amount: 10 + i, confidence: 95 });
    assert.equal(r.result.verdict, 'block');
  }
  assert.equal(conn.state.gateLog.filter((e) => e.source === 'session' && e.rule.kind === 'must-never').length, 3);
  assert.equal(conn.state.capabilities.find((c) => c.id === RR).authority.level, 2, 'restricted by the gate-measured rule');
  const next = await conn.call('issue_refund', { orderId: 'ORD-5001', amount: 10, confidence: 95 });
  assert.deepEqual([next.result.verdict, next.result.rule], ['needs-person', 'level-2']);
});

test('instructionSource is required by the tool schema; a missing or blank one never reaches the gate', async () => {
  const conn = await connect(expanded(), RR, { ticket: 'TK-2001' });
  const { tools } = await conn.client.listTools();
  const refund = tools.find((t) => t.name === 'issue_refund');
  assert.ok(refund.inputSchema.required.includes('instructionSource'));
  assert.match(refund.inputSchema.properties.instructionSource.description, /not verified/);
  const before = conn.checks.length;
  for (const instructionSource of [null, '', '   ']) {
    const r = await conn.call('issue_refund', { orderId: 'ORD-5001', amount: 10, confidence: 95, instructionSource });
    assert.ok(r.raw.isError, `${JSON.stringify(instructionSource)} is refused by the schema`);
  }
  assert.equal(conn.checks.length, before, 'none of them reached the gate');
  assert.equal(conn.state.systems.refunds.length, 3, 'nothing executed');
});

test('the session\'s ticket is set by whoever starts the server; a model can\'t pick another', async () => {
  // Bound to Ruth's ticket, a refund on Jordan's order "from the customer" is a false claim.
  const conn = await connect(expanded(), RR, { ticket: 'TK-2004' });
  const r = await conn.call('issue_refund', { orderId: 'ORD-5001', amount: 10, confidence: 95, instructionSource: 'customer', ticketId: 'TK-2001' });
  assert.equal(r.result.rule, 'fact-mismatch');
  assert.equal(conn.checks.at(-1).ticketId, 'TK-2004');
  // Unbound (Claude Desktop without --ticket): the sender can't be checked, so a person decides.
  const free = await connect(expanded(), RR, { ticket: null });
  const w = await free.call('issue_refund', { orderId: 'ORD-5001', amount: 10, confidence: 95, instructionSource: 'customer' });
  assert.equal(w.result.verdict, 'needs-person');
});
