// Starter contracts (#5). A template is picked by the risk profile; seeded,
// keyword-based "AI" suggestions are added from the capability's name and
// summary. Everything here is deterministic. Nothing calls a model.

export const CONTRACT_SECTIONS = [
  ['may', 'AI may'],
  ['mustAsk', 'AI must ask / require approval'],
  ['mustNever', 'AI must never'],
  ['escalation', 'Escalation conditions'],
  ['autoRestriction', 'Automatic restriction conditions'],
];

const BASE = {
  Low: {
    id: 'low',
    name: 'Low impact',
    may: ['Read the inputs needed for this capability.', 'Produce its output for a person or a downstream step.', 'Explain the reasoning behind its output.'],
    mustAsk: ['Any case the capability has not seen before (no matching precedent).'],
    mustNever: ['Act outside the scope of this capability.'],
    escalation: ['Confidence below 70%.', 'Input is missing or unreadable.'],
    autoRestriction: ['Error rate above 10% over 7 days returns the capability to Draft.'],
  },
  Medium: {
    id: 'medium',
    name: 'Medium impact',
    may: ['Read the inputs needed for this capability.', 'Produce its output for a person to approve.', 'Explain the reasoning behind its output.'],
    mustAsk: ['Any case the capability has not seen before (no matching precedent).', 'Any case that mentions legal action, safety, or a complaint about the company.'],
    mustNever: ['Act outside the scope of this capability.', 'Promise anything on behalf of the company.'],
    escalation: ['Confidence below 80%.', 'Conflicting source information.', 'Input is missing or unreadable.'],
    autoRestriction: ['Error rate above 8% over 7 days returns the capability to Draft.', '2 high-severity failures within 7 days return the capability to Draft.'],
  },
  High: {
    id: 'high',
    name: 'High impact',
    may: ['Read the inputs needed for this capability.', 'Prepare its output for a person to approve.', 'Explain the reasoning behind its output.'],
    mustAsk: ['Any case the capability has not seen before (no matching precedent).', 'Any case that mentions legal action, safety, or a complaint about the company.', 'Any policy exception.'],
    mustNever: ['Act outside the scope of this capability.', 'Promise anything on behalf of the company.', 'Change who owns or controls a customer account.', 'Modify a policy.'],
    escalation: ['Confidence below 85%.', 'Conflicting source information.', 'Input is missing or unreadable.', 'Customer threatens legal action.', 'Safety-sensitive content.'],
    autoRestriction: ['Error rate above 5% over 7 days returns the capability to Draft.', '2 high-severity failures within 7 days return the capability to Draft.'],
  },
};

const EXPOSURE_ADDENDA = {
  'Financial / consequential': {
    id: 'financial',
    mustAsk: ['Any case above the value limit set in this contract.', 'Accounts flagged for suspected fraud.', 'Cases with an active chargeback or dispute.'],
    mustNever: ['Move money to a destination other than the original one.', 'Override a fraud restriction.'],
    autoRestriction: ['Unexplained cost increase above 20% over 7 days returns the capability to Draft.'],
  },
  'Customer-facing': {
    id: 'customer',
    mustNever: ['Send anything to a customer without a person approving it, until authority says otherwise.', 'Quote a policy that is not in the approved policy set.'],
    escalation: ['Customer asks for a human.'],
  },
  'Internal only': { id: 'internal' },
};

export function pickTemplate(risk = {}) {
  const base = BASE[risk.impact] || BASE.Medium;
  const add = EXPOSURE_ADDENDA[risk.exposure] || EXPOSURE_ADDENDA['Internal only'];
  const sections = {};
  for (const [key] of CONTRACT_SECTIONS) sections[key] = [...(base[key] || []), ...(add[key] || [])];
  const reversible = risk.reversibility === 'Difficult to reverse';
  if (reversible) {
    sections.mustAsk = [...sections.mustAsk, 'Any action that cannot be undone.'];
  }
  return {
    id: `${base.id}-${add.id}${reversible ? '-irreversible' : ''}`,
    name: `${base.name} · ${risk.exposure || 'Internal only'}${reversible ? ' · difficult to reverse' : ''}`,
    sections,
  };
}

// Keyword rules. Each rule contributes suggestions when any of its keywords
// appears in the capability's name or summary. Suggestions carry the keyword
// that triggered them so the UI can say why.
const RULES = [
  {
    keywords: ['refund', 'credit', 'payment', 'charge', 'money', 'payout'],
    suggestions: [
      ['may', 'Review the order history and the refund or credit policy before recommending.'],
      ['mustAsk', 'Refunds or credits over $100.'],
      ['mustNever', 'Issue a refund or credit to a different payment method than the original.'],
      ['mustNever', 'Split an amount into smaller parts to stay under a limit.'],
      ['escalation', 'Missing order evidence.'],
    ],
  },
  {
    keywords: ['reply', 'respond', 'response', 'draft', 'message', 'email', 'answer'],
    suggestions: [
      ['may', 'Draft a reply using the ticket, the account history and approved help-center articles.'],
      ['mustAsk', 'Every send. A person approves the final text.'],
      ['mustNever', 'Send a reply.'],
      ['mustNever', 'Promise a refund, credit or policy exception in a reply.'],
      ['escalation', 'No supporting help-center article found.'],
      ['autoRestriction', '2 confirmed hallucinated policy statements within 7 days return the capability to Recommend.'],
    ],
  },
  {
    keywords: ['classif', 'route', 'routing', 'triage', 'tag', 'priorit', 'queue'],
    suggestions: [
      ['may', 'Assign a queue, priority and routing tags.'],
      ['mustNever', 'Close a ticket.'],
      ['escalation', 'Ticket language not supported.'],
      ['autoRestriction', 'Misroute rate above 10% over 7 days returns the capability to Draft.'],
    ],
  },
  {
    keywords: ['close', 'closure', 'delete', 'deletion', 'deactivat', 'suspend', 'account'],
    suggestions: [
      ['mustAsk', 'Every closure, deletion or suspension. A person confirms identity first.'],
      ['mustNever', 'Close, delete, suspend or modify an account on its own.'],
      ['escalation', 'The requester is not the account holder.'],
    ],
  },
  {
    keywords: ['order', 'status', 'lookup', 'shipment', 'tracking', 'carrier', 'delivery'],
    suggestions: [
      ['may', 'Read the order record and the carrier tracking feed.'],
      ['mustNever', 'Change an order, an address or a delivery date.'],
      ['escalation', 'Tracking shows delivered but the customer says it was not received.'],
    ],
  },
  {
    keywords: ['fraud', 'risk', 'chargeback', 'dispute'],
    suggestions: [
      ['mustAsk', 'Any account with an active fraud signal.'],
      ['mustNever', 'Override a fraud restriction.'],
      ['escalation', 'A fraud signal is present on the account.'],
    ],
  },
];

export function suggestLines(name = '', summary = '') {
  const text = `${name} ${summary}`.toLowerCase();
  const out = [];
  const seen = new Set();
  for (const rule of RULES) {
    const hit = rule.keywords.find((k) => text.includes(k));
    if (!hit) continue;
    for (const [section, line] of rule.suggestions) {
      const key = `${section}|${line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ section, text: line, because: hit });
    }
  }
  return out;
}
