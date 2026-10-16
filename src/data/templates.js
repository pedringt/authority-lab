// Starting points for setup (#139, Paige 2026-10-16): eight template
// families plus Start from scratch, on one generic mechanism. A template
// prefills questions, examples and suggestions, never the answers: every
// Boundary, Requirement and Target it suggests is reviewed one at a time, and
// it never sets a number. Numbers are written as blanks ("___") a person
// fills in before a suggestion can be accepted.
//
// Plain data. Nothing here calls a model.

export const BLANK = '___';
export const hasBlank = (text) => String(text || '').includes(BLANK);

// Each family: what it covers, examples, the questions worth asking, and
// suggestions. `requirements` are what must be true; a `target` on one is the
// measure that judges it, suggested with its bar as Needs decision.
export const TEMPLATE_FAMILIES = [
  {
    id: 'knowledge',
    name: 'Knowledge / Research',
    description: 'Finds and summarizes information for a person.',
    examples: ['Legal research', 'Internal knowledge assistant', 'Policy lookup'],
    focus: ['Source quality', 'Citations and provenance', 'Unsupported claims', 'Freshness', 'Access permissions', 'Fact vs inference'],
    questions: ['Which sources may it use, and who keeps them current?', 'How will a reader tell a quoted fact from the AI\'s inference?', 'Who may see what it finds?'],
    boundaries: {
      may: ['Search and quote the approved sources.', 'Summarize what the sources say, with citations.'],
      mustAsk: ['Any answer the sources don\'t clearly support.'],
      mustNever: ['Present an inference as a sourced fact.', 'Use a source the reader isn\'t allowed to see.'],
      escalation: ['Sources conflict.', 'The newest relevant source is older than ' + BLANK + ' days.'],
      autoRestriction: [BLANK + ' unsupported claims within ' + BLANK + ' days return the capability to Recommend.'],
    },
    requirements: [
      { id: 'citations', text: 'Answers are supported by cited sources', target: { id: 'citation-accuracy', name: 'Citation accuracy', note: 'Share of answers whose citations support them.' } },
      { id: 'unsupported', text: 'Unsupported claims stay within their limit', target: { id: 'unsupported-claims', name: 'Unsupported claims', note: 'Claims with no supporting source.' } },
    ],
    evidence: ['Eval set of questions with known answers', 'Manual review of citations', 'Reader feedback'],
    failureTypes: ['Wrong answer', 'Hallucination', 'User over-reliance', 'Silent failure'],
  },
  {
    id: 'draft',
    name: 'Draft / Create',
    description: 'Writes something a person reviews before it is used.',
    examples: ['Email drafting', 'Memos', 'Marketing copy', 'Documentation', 'Code generation'],
    focus: ['Factuality', 'Inappropriate content', 'Intellectual property', 'Disclosure', 'Review before publication'],
    questions: ['Who reviews a draft before it is used or published?', 'Does the audience need to know AI helped write it?', 'What must a draft never say?'],
    boundaries: {
      may: ['Draft text from the inputs it is given.', 'Suggest revisions to a person\'s draft.'],
      mustAsk: ['Every use or publication. A person approves the final text.'],
      mustNever: ['Publish or send anything on its own.', 'Make a commitment on the organization\'s behalf.'],
      escalation: ['The request asks for something outside approved content.'],
      autoRestriction: [BLANK + ' confirmed factual errors in drafts within ' + BLANK + ' days return the capability to Recommend.'],
    },
    requirements: [
      { id: 'draft-quality', text: 'Drafts are usable with light edits', target: { id: 'edit-rate', name: 'Drafts needing major edits', note: 'Share of drafts a reviewer substantially rewrote.' } },
      { id: 'draft-facts', text: 'Factual errors in drafts stay within their limit', target: { id: 'draft-errors', name: 'Factual errors', note: 'Errors a reviewer found and corrected.' } },
    ],
    evidence: ['Reviewer edits and approvals', 'Sample review of drafts', 'Complaints or corrections'],
    failureTypes: ['Wrong answer', 'Hallucination', 'Policy violation', 'User over-reliance'],
  },
  {
    id: 'extract',
    name: 'Extract / Classify',
    description: 'Pulls fields out of documents or puts items into categories.',
    examples: ['Intake classification', 'Document extraction', 'Routing'],
    focus: ['Accuracy', 'False positives and negatives', 'Missed cases', 'Sensitive classes', 'Edge cases'],
    questions: ['Which mistakes cost more: a false positive or a missed case?', 'Are any categories sensitive (for example, about people)?', 'What happens to an item it can\'t classify?'],
    boundaries: {
      may: ['Assign a category or extract fields from the input.'],
      mustAsk: ['Any item in a sensitive category.'],
      mustNever: ['Act on the item beyond classifying it.'],
      escalation: ['The input doesn\'t fit any category.', 'Required fields are missing or unreadable.'],
      autoRestriction: ['Misclassification rate above ' + BLANK + '% over ' + BLANK + ' days returns the capability to Draft.'],
    },
    requirements: [
      { id: 'classification', text: 'Classification is accurate enough to rely on', target: { id: 'classification-accuracy', name: 'Classification accuracy', note: 'Checked against a person\'s labels.' } },
      { id: 'missed', text: 'Missed cases stay within their limit', target: { id: 'missed-cases', name: 'Missed cases', note: 'Items that should have been flagged and weren\'t.' } },
    ],
    evidence: ['Labelled test set', 'Sample review of live items', 'Corrections by people'],
    failureTypes: ['Wrong answer', 'Missing escalation', 'Silent failure'],
  },
  {
    id: 'recommend',
    name: 'Recommend',
    description: 'Suggests a decision; a person makes it.',
    examples: ['Refund recommendation', 'Prioritization', 'Next-best action'],
    focus: ['Recommendation quality', 'Explainability', 'Bias', 'Consequential recommendations', 'Over-reliance'],
    questions: ['Who acts on the recommendation, and can they see why it was made?', 'Could recommendations treat some people differently?', 'How will you tell agreement from rubber-stamping?'],
    boundaries: {
      may: ['Recommend a decision with its reasons.'],
      mustAsk: ['Every decision. A person makes it.'],
      mustNever: ['Carry out the decision itself.'],
      escalation: ['Information needed for the recommendation is missing.'],
      autoRestriction: [BLANK + ' recommendations later judged wrong within ' + BLANK + ' days return the capability to Recommend.'],
    },
    requirements: [
      { id: 'recommendation-quality', text: 'Recommendations are right often enough', target: { id: 'recommendation-quality', name: 'Recommendation quality', note: 'Judged by a reviewer against policy, not by whether it was accepted.' } },
      { id: 'overrides', text: 'People rarely need to override it', target: { id: 'override-rate', name: 'Override rate', note: 'Recommendations a person changed or rejected.' } },
    ],
    evidence: ['Reviewer agreement on a sample', 'Overrides and their reasons', 'Outcome follow-up'],
    failureTypes: ['Wrong answer', 'User over-reliance', 'Missing escalation'],
  },
  {
    id: 'interaction',
    name: 'Customer / User Interaction',
    description: 'Talks with customers or users directly.',
    examples: ['Chatbots', 'Support assistants', 'Onboarding assistants'],
    focus: ['Disclosure', 'Escalation', 'Harmful or inaccurate responses', 'Privacy', 'Accessibility', 'Customer impact'],
    questions: ['Do people know they are talking to an AI?', 'How quickly can they reach a person?', 'What personal information can it see or repeat?'],
    boundaries: {
      may: ['Answer questions from approved content.'],
      mustAsk: ['Anything about money, accounts or legal matters.'],
      mustNever: ['Claim to be a person.', 'Share another person\'s information.'],
      escalation: ['The person asks for a human.', 'The person is upset or at risk.'],
      autoRestriction: [BLANK + ' harmful or inaccurate responses within ' + BLANK + ' days return the capability to Draft.'],
    },
    requirements: [
      { id: 'responses', text: 'Responses are accurate and appropriate', target: { id: 'response-quality', name: 'Response quality', note: 'From a sample review of conversations.' } },
      { id: 'handoff', text: 'People who need a human reach one', target: { id: 'missed-handoffs', name: 'Missed hand-offs', note: 'Conversations that should have reached a person and didn\'t.' } },
    ],
    evidence: ['Conversation review', 'Customer feedback', 'Escalation logs'],
    failureTypes: ['Wrong answer', 'Hallucination', 'Missing escalation', 'User rejection'],
  },
  {
    id: 'automation',
    name: 'Workflow Automation',
    description: 'Moves work along between systems.',
    examples: ['Updating tickets', 'Scheduling', 'Creating tasks', 'Moving data between systems'],
    focus: ['Permissions', 'Reversibility', 'Exceptions', 'Auditability', 'Human hand-off'],
    questions: ['Which systems can it write to?', 'Can each change be undone, and by whom?', 'Where is every change logged?'],
    boundaries: {
      may: ['Make the listed updates in the listed systems.'],
      mustAsk: ['Any change that can\'t be undone.'],
      mustNever: ['Write to a system it isn\'t listed for.', 'Delete records.'],
      escalation: ['An update fails or conflicts with another change.'],
      autoRestriction: ['Failed or reverted updates above ' + BLANK + '% over ' + BLANK + ' days return the capability to Draft.'],
    },
    requirements: [
      { id: 'updates', text: 'Updates are correct', target: { id: 'update-accuracy', name: 'Correct updates', note: 'Checked against what a person would have done.' } },
      { id: 'audit', text: 'Every change it makes is logged and can be traced' },
    ],
    evidence: ['Change logs', 'Sample review of updates', 'Reverted changes'],
    failureTypes: ['Wrong action', 'Silent failure', 'Excessive cost'],
  },
  {
    id: 'action',
    name: 'Action / Transaction',
    description: 'Takes actions with real consequences.',
    examples: ['Issuing refunds', 'Changing account status', 'Sending external communication', 'Production changes'],
    focus: ['Authorization', 'Limits', 'Irreversible or high-impact actions', 'Rollback', 'Human approval'],
    questions: ['What is the most it could do in one action, and in one day?', 'How is a wrong action rolled back?', 'Who approves actions above a limit?'],
    boundaries: {
      may: ['Take the action within a limit of ' + BLANK + ' per case.'],
      mustAsk: ['Any action above the limit.', 'Any action that can\'t be undone.'],
      mustNever: ['Split an action to stay under a limit.', 'Act on a different target than the one requested.'],
      escalation: ['The facts in the system of record don\'t match the request.'],
      autoRestriction: [BLANK + ' actions later reversed within ' + BLANK + ' days return the capability to Draft.'],
    },
    requirements: [
      { id: 'actions', text: 'Actions are correct', target: { id: 'action-accuracy', name: 'Correct actions', note: 'Checked against policy by a reviewer.' } },
      { id: 'reversed', text: 'Reversed actions stay within their limit', target: { id: 'reversed-actions', name: 'Reversed actions', note: 'Actions a person had to undo.' } },
    ],
    evidence: ['Action logs', 'Reversals and disputes', 'Reviewer checks'],
    failureTypes: ['Wrong action', 'Policy violation', 'Excessive cost'],
  },
  {
    id: 'monitor',
    name: 'Monitor / Detect',
    description: 'Watches for something and raises an alert.',
    examples: ['Fraud alerts', 'Anomaly detection', 'Safety monitoring'],
    focus: ['Missed detections', 'False alarms', 'Response expectations', 'Monitoring gaps', 'Downstream action'],
    questions: ['Which costs more: a missed detection or a false alarm?', 'Who responds to an alert, and how fast?', 'What isn\'t it watching?'],
    boundaries: {
      may: ['Raise an alert with the evidence behind it.'],
      mustAsk: ['Any action taken because of an alert.'],
      mustNever: ['Suppress an alert on its own.'],
      escalation: ['It can\'t read the data it is meant to watch.'],
      autoRestriction: ['Missed detections above ' + BLANK + ' within ' + BLANK + ' days return the capability to Recommend.'],
    },
    requirements: [
      { id: 'detection', text: 'It catches what it should', target: { id: 'detection-rate', name: 'Detection rate', note: 'Known events it caught.' } },
      { id: 'false-alarms', text: 'False alarms stay manageable', target: { id: 'false-alarm-rate', name: 'False alarm rate', note: 'Alerts a person dismissed as wrong.' } },
    ],
    evidence: ['Known-event replay', 'Alert review', 'Missed-event reports'],
    failureTypes: ['Silent failure', 'Missing escalation', 'User over-reliance'],
  },
];

export const START_FROM_SCRATCH = {
  id: 'scratch',
  name: 'Start from scratch',
  description: 'No template. You write every Boundary and Requirement yourself; Authority Lab still suggests the ones every capability needs.',
  examples: [],
  focus: [],
  questions: [],
  boundaries: {},
  requirements: [],
  evidence: [],
  failureTypes: [],
};

export const STARTING_POINTS = [...TEMPLATE_FAMILIES, START_FROM_SCRATCH];
export const findStartingPoint = (id) => STARTING_POINTS.find((t) => t.id === id) || null;

// Which families fit what the AI does, from confirmed Context only. A
// suggestion to choose from, never a choice.
const FAMILY_FOR_ACTION = { Retrieves: 'knowledge', Drafts: 'draft', Classifies: 'extract', Recommends: 'recommend', Acts: 'action', 'Uses tools': 'automation' };
export function familiesFor(aiActions = []) {
  return [...new Set((aiActions || []).map((a) => FAMILY_FOR_ACTION[a]).filter(Boolean))];
}

// Requirements every capability gets suggested, whatever the template
// (Authority Lab suggestions). The minimum-cases coverage rule is required;
// its number starts as Needs decision.
export const BASE_REQUIREMENTS = [
  { id: 'min-cases', text: 'Minimum cases: Needs decision', kind: 'coverage', bar: 'needs-decision', required: true, why: 'There must be enough representative cases to judge it. You set how many.' },
  { id: 'accuracy', text: 'Overall quality meets its target', target: { id: 'quality', name: 'Quality', note: 'Correctness judged by a reviewer against policy, not by whether the output was accepted.' } },
  { id: 'severe', text: 'Serious errors stay within their limit', target: { id: 'severe-errors', name: 'Serious errors', note: 'Define what a serious error is for this capability.' } },
  { id: 'incidents', text: 'No unresolved critical incidents' },
];

// Suggestions the risk answers add (Based on your answers).
export function riskRequirements(risk = {}) {
  const out = [];
  if (risk.exposure === 'Customer-facing') out.push({ id: 'customer-harm', text: 'Customer-visible errors stay within their limit', target: { id: 'customer-harm', name: 'Customer-visible errors', note: 'Wrong output that reached a customer.' } });
  if (risk.exposure === 'Financial / consequential') out.push({ id: 'high-value', text: 'Minimum high-value cases: Needs decision', kind: 'coverage', bar: 'needs-decision', why: 'High-value cases need to be judged on their own.' });
  if (risk.reversibility === 'Difficult to reverse') out.push({ id: 'reversal', text: 'Every pilot action reviewed before it took effect' });
  return out;
}

// Boundary suggestions from the risk answers (Based on your answers): the
// generic safety lines, with blanks where a number goes.
export function riskBoundaries(risk = {}) {
  const out = { may: [], mustAsk: [], mustNever: ['Act outside the scope of this capability.'], escalation: ['Input is missing or unreadable.'], autoRestriction: [] };
  if (risk.impact && risk.impact !== 'Low') out.mustAsk.push('Any case that mentions legal action, safety, or a complaint about the organization.');
  if (risk.impact === 'High') out.mustNever.push('Modify a policy.');
  out.autoRestriction.push(BLANK + ' high-severity failures within ' + BLANK + ' days return the capability to Draft.');
  if (risk.exposure === 'Financial / consequential') {
    out.mustAsk.push('Any case above ' + BLANK + ' in value.');
    out.mustNever.push('Move money to a destination other than the original one.');
  }
  if (risk.exposure === 'Customer-facing') {
    out.mustNever.push('Send anything to a customer without a person approving it, until authority says otherwise.');
    out.escalation.push('Customer asks for a human.');
  }
  if (risk.reversibility === 'Difficult to reverse') out.mustAsk.push('Any action that cannot be undone.');
  return out;
}

