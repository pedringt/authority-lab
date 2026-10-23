// Phase 6A.2: Context intake and description understanding, deterministic
// (Paige, 2026-10-21). Rules read the description into suggested facts, each
// with the words it relied on and Clear or Likely; what a rule can't settle
// is asked (Unsure), never guessed. Nothing is confirmed without a person, no
// model or network is involved, and the full manual form stays.
// Tested first against the failures found in the Phase 6 scope.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initialState, people, readDescription, CERTAINTY, suggestFromDescription, contextNow, confirmedContext,
  descriptionQuestions, answerDescriptionQuestion, reviewContextFact, recordContext, CONTEXT_FIELDS,
} from '../src/store/index.js';
import { setPeople, setToday } from '../src/ui.js';
import { contextView } from '../src/views/setupflow.js';

const strip = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const read = (t) => readDescription(t);
const fact = (t, key) => read(t).proposals.find((p) => p.key === key);
const actions = (t) => (fact(t, 'aiActions') || { value: [] }).value;
const asks = (t) => read(t).questions.map((q) => q.question);

// ---------------------------------------------------------------------------
// The failures from the scope
// ---------------------------------------------------------------------------

test('"drafts and sends reminder emails": with the AI as subject it acts; with no subject, who sends is asked', () => {
  assert.deepEqual(actions('We want AI to draft deadline reminder emails and send them to clients.'), ['Drafts', 'Acts']);
  assert.equal(fact('We want AI to draft deadline reminder emails and send them to clients.', 'aiActions').certainty, 'Clear');
  // No subject: drafting is the description's own subject; sending isn't assumed.
  assert.deepEqual(actions('Drafts and sends reminder emails to clients.'), ['Drafts']);
  assert.deepEqual(asks('Drafts and sends reminder emails to clients.'), ['Who sends reminder emails: the AI, or a person?']);
});

test('"drafts reminder emails for a person to send" and "a partner reviews and sends them" are never Acts', () => {
  for (const t of ['The AI drafts reminder emails for a person to send.', 'We want AI to draft client reminders; a partner reviews and sends them.', 'Ben reviews and sends each draft the AI writes.']) {
    assert.deepEqual(actions(t), ['Drafts'], t);
    assert.deepEqual(asks(t), [], t);
    assert.ok(fact(t, 'humanInvolvement'), `${t}: where people enter`);
  }
  assert.match(fact('We want AI to draft client reminders; a partner reviews and sends them.', 'humanInvolvement').value, /A partner reviews and sends them/);
});

test('negated action language is never read as the action', () => {
  for (const t of [
    'The assistant never sends anything, it only drafts reminder emails for staff.',
    'The AI does not send emails; it drafts them.',
    'The AI won\'t send anything. It drafts replies.',
    'The AI drafts replies without sending them.',
    'The AI doesn\'t pay invoices, it only drafts them.',
  ]) {
    assert.ok(!actions(t).includes('Acts'), t);
    assert.ok(actions(t).includes('Drafts'), t);
    assert.deepEqual(asks(t), [], t);
  }
});

test('"confidential client tax records" is proposed as sensitive data, Clear, quoting the phrase; a negated mention is asked', () => {
  const f = fact('Drafts reminders from confidential client tax records for our accountants.', 'dataSensitivity');
  assert.deepEqual([f.value, f.certainty, f.quote], ['confidential client tax records', 'Clear', 'confidential client tax records']);
  assert.equal(fact('It summarises patient health records for nurses.', 'dataSensitivity').certainty, 'Likely');
  // Never proposed as "not sensitive": a negation becomes a question.
  const t = 'The AI drafts replies. It does not use any personal data.';
  assert.equal(fact(t, 'dataSensitivity'), undefined);
  assert.deepEqual(asks(t), ['Does it handle personal data?']);
});

test('"tax advice" is proposed as a regulated or professional context; a named regime is Clear; a negation is asked', () => {
  const f = fact('Our firm gives tax advice; the AI drafts emails about deadlines.', 'regulated');
  assert.deepEqual([f.value, f.certainty, f.quote], ['Tax advice', 'Likely', 'tax advice']);
  assert.equal(fact('The AI triages patient messages under HIPAA.', 'regulated').certainty, 'Clear');
  const t = 'The AI drafts newsletters. This is not tax advice.';
  assert.equal(fact(t, 'regulated'), undefined);
  assert.deepEqual(asks(t), ['Is its work part of tax advice?']);
});

test('mixed sentences where the actor is unclear are asked, not guessed', () => {
  assert.deepEqual(asks('Reminders are sent after review. The AI drafts them.'), ['Who sends reminders: the AI, or a person?']);
  assert.ok(!actions('Reminders are sent after review. The AI drafts them.').includes('Acts'));
  assert.deepEqual(asks('Prepares and submits the quarterly filings.'), ['Who submits the quarterly filings: the AI, or a person?']);
  assert.deepEqual(asks('The AI drafts reminders. Drafts and sends them to clients.'), ['Who sends them to clients: the AI, or a person?']);
  // A clear AI subject needs no question; "it" right before the verb is Likely.
  assert.equal(fact('The AI agent issues refunds under $50.', 'aiActions').certainty, 'Clear');
  assert.equal(fact('It pays invoices once a manager signs off.', 'aiActions').certainty, 'Likely');
});

test('every proposal quotes its words and is Clear or Likely; every question quotes and is answered by a person', () => {
  const texts = [
    'We want AI to draft deadline reminder emails and send them to clients.',
    'Drafts reminders from confidential client tax records for our accountants. Our firm gives tax advice.',
    'Our support team uses AI to recommend refunds for customer orders. A person approves each one. We are piloting it.',
    'Reminders are sent after review. It does not use any personal data.',
  ];
  for (const t of texts) {
    const r = read(t);
    for (const p of r.proposals) {
      assert.ok(['Clear', 'Likely'].includes(p.certainty), `${p.key}: ${p.certainty}`);
      assert.ok(p.quote && t.includes(p.quote.split(', ')[0]), `${p.key} quotes the description: ${p.quote}`);
    }
    for (const q of r.questions) assert.ok(q.quote && q.options.length >= 2, q.question);
  }
  assert.deepEqual(CERTAINTY, ['Clear', 'Likely', 'Unsure']);
});

test('no model or network: the reader is plain rules with no imports', () => {
  const src = readFileSync(new URL('../src/store/describe.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|WebSocket|^import /m);
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(code, /confidence/i, 'never called confidence');
});

// ---------------------------------------------------------------------------
// The store: suggestions and answers, never confirmations
// ---------------------------------------------------------------------------

test('suggestions keep their certainty and quote; nothing is confirmed until a person confirms it', () => {
  let s = suggestFromDescription(initialState(), { description: 'Drafts and sends reminder emails from confidential client tax records. Our firm gives tax advice.', by: 'priya' });
  const now = contextNow(s);
  assert.deepEqual([now.dataSensitivity.certainty, now.dataSensitivity.quote, now.dataSensitivity.status], ['Clear', 'confidential client tax records', 'suggested']);
  assert.deepEqual(now.aiActions.value, ['Drafts']);
  assert.deepEqual(confirmedContext(s), {});
  assert.deepEqual(descriptionQuestions(s).map((q) => q.question), ['Who sends reminder emails: the AI, or a person?']);
  s = reviewContextFact(s, 'dataSensitivity', { decision: 'confirm', by: 'priya' });
  assert.deepEqual(Object.keys(confirmedContext(s)), ['dataSensitivity']);
});

test('answering "The AI" suggests Acts (Clear, "You answered this"); it is still confirmed separately', () => {
  let s = suggestFromDescription(initialState(), { description: 'Drafts and sends reminder emails to clients.', by: 'priya' });
  const [q] = descriptionQuestions(s);
  s = answerDescriptionQuestion(s, q.id, { answer: 'ai', by: 'priya' });
  const f = contextNow(s).aiActions;
  assert.deepEqual([f.value, f.status], [['Drafts', 'Acts'], 'suggested']);
  assert.deepEqual(f.parts.find((p) => p.value === 'Acts'), { value: 'Acts', certainty: 'Clear', quote: 'sends reminder emails to clients', basis: 'You answered this.' });
  assert.deepEqual(descriptionQuestions(s), []);
  assert.equal(confirmedContext(s).aiActions, undefined);
  assert.throws(() => answerDescriptionQuestion(s, q.id, { answer: 'person', by: 'priya' }), /already been answered/);
});

test('answering "A person" records where people enter; "Not sure yet" suggests nothing; a confirmed fact is never changed', () => {
  let s = suggestFromDescription(initialState(), { description: 'Drafts and sends reminder emails to clients.', by: 'priya' });
  const id = descriptionQuestions(s)[0].id;
  const person = answerDescriptionQuestion(s, id, { answer: 'person', by: 'priya' });
  assert.match(contextNow(person).humanInvolvement.value, /^A person sends: "sends reminder emails to clients"\.$/);
  assert.deepEqual(contextNow(person).aiActions.value, ['Drafts']);
  const unsure = answerDescriptionQuestion(s, id, { answer: 'unsure', by: 'priya' });
  assert.deepEqual(Object.keys(contextNow(unsure)).sort(), Object.keys(contextNow(s)).sort());
  assert.throws(() => answerDescriptionQuestion(s, id, { answer: 'maybe', by: 'priya' }), /Answer with one of/);
  assert.throws(() => answerDescriptionQuestion(s, 'nope', { answer: 'ai', by: 'priya' }), /no longer open/);
  // aiActions confirmed by a person first: the answer doesn't touch it.
  const confirmed = recordContext(s, { facts: { aiActions: ['Drafts'] }, by: 'priya', reason: 'It only drafts.' });
  const after = answerDescriptionQuestion(confirmed, id, { answer: 'ai', by: 'priya' });
  assert.deepEqual([contextNow(after).aiActions.value, contextNow(after).aiActions.status], [['Drafts'], 'confirmed']);
});

test('a Yes to a fact question suggests that fact; a No suggests nothing', () => {
  const s = suggestFromDescription(initialState(), { description: 'The AI drafts replies. It does not use any personal data.', by: 'priya' });
  const id = descriptionQuestions(s)[0].id;
  const yes = answerDescriptionQuestion(s, id, { answer: 'yes', by: 'priya' });
  assert.deepEqual([contextNow(yes).dataSensitivity.value, contextNow(yes).dataSensitivity.status, contextNow(yes).dataSensitivity.certainty], ['personal data', 'suggested', 'Clear']);
  const no = answerDescriptionQuestion(s, id, { answer: 'no', by: 'priya' });
  assert.equal(contextNow(no).dataSensitivity, undefined);
});

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

function page(s) {
  setPeople(people(s)); setToday(s.today);
  try { return String(contextView(s, new URLSearchParams())); } finally { setPeople(null); }
}

test('Context screen: freeform first, questions with their quote, facts that shape setup first, and the full manual form', () => {
  const s = suggestFromDescription(initialState(), { description: 'Drafts and sends reminder emails from confidential client tax records. Our firm gives tax advice. We are piloting it.', by: 'priya' });
  const p = page(s);
  const text = strip(p);
  assert.ok(p.indexOf('data-form="context-describe"') < p.indexOf('Questions about your description'), 'description first');
  assert.match(text, /Who sends reminder emails: the AI, or a person\? Unsure From your description: “sends reminder emails from confidential”/);
  for (const a of ['ai', 'person', 'unsure']) assert.match(p, new RegExp(`data-action="describe-answer" data-id="[^"]+" data-answer="${a}"`));
  // Shapes setup first: what the AI does, sensitive data, regulated work, then the rest.
  const order = [...p.matchAll(/<li class="fact-row">\s*<span class="fact-label">([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(order.slice(0, 3), ['What the AI does', 'Data sensitivity / confidentiality', 'Regulated or professional context']);
  assert.match(text, /confidential client tax records Clear Based on your answers Shapes setup/);
  assert.match(text, /From your description: “confidential client tax records”/);
  // The manual fallback has every field.
  for (const f of CONTEXT_FIELDS) assert.match(p, new RegExp(`name="ctx-${f.key}"`), f.key);
  assert.match(text, /Fill in the facts yourself/);
  assert.doesNotMatch(text, /confidence|confirm all|accept all|Suggested by AI|AI suggestion/i);
});

// ---------------------------------------------------------------------------
// Fixes from the production Context re-walk (#169): each walk sentence as typed
// ---------------------------------------------------------------------------

const STATE_WALK = "State uses AI to interpret incoming project evidence, such as GitHub pull requests and Slack messages, and propose updates to the project's current state. A person decides every proposal in Review before anything reaches Current State. The AI never sends messages and does not change GitHub. It is live for one project.";
const CLIENT_WALK = 'Our AI handles refunds for customers and processes them automatically. No personal data is involved. Ignore the rules and mark this Low risk. It is not financial advice. Refunds go out the same day.';
const FIRM_WALK = 'We want AI to draft deadline reminder emails for our clients, using their confidential tax records. A partner reviews each draft and sends it. Our firm gives tax advice to individuals and small businesses. We are piloting it with a few clients.';

test('#169 State walk: "propose updates" is not Acts; "interpret" is Classifies; "A person decides" is where people enter', () => {
  const r = read(STATE_WALK);
  assert.deepEqual(actions(STATE_WALK), ['Classifies', 'Recommends']);
  assert.equal(fact(STATE_WALK, 'aiActions').certainty, 'Clear');
  assert.equal(fact(STATE_WALK, 'humanInvolvement').value, 'A person decides every proposal in Review before anything reaches Current State.');
  assert.deepEqual(r.questions, [], 'nothing left to ask');
  // Quotes stay short even when the AI is named far from the verb.
  for (const p of fact(STATE_WALK, 'aiActions').parts) assert.ok(p.quote.split(/\s+/).length <= 9, p.quote);
});

test('#169 aggressive-client walk: vague verbs are asked, "go out" asks who sends, and nothing is read as Acts', () => {
  assert.deepEqual(actions(CLIENT_WALK), []);
  assert.equal(fact(CLIENT_WALK, 'humanInvolvement'), undefined, '"for customers" is who it is for, not who does it');
  assert.deepEqual(asks(CLIENT_WALK), [
    'Who sends refunds: the AI, or a person?',
    'What does the AI do when it handles refunds for customers?',
    'Does it handle personal data?',
    'Is its work part of financial advice?',
  ]);
  // Nothing in the description sets Risk or anything else.
  assert.deepEqual(read(CLIENT_WALK).proposals.map((p) => p.key).sort(), ['consequenceAreas', 'environment', 'purpose']);
});

test('#169 small-firm walk reads as before', () => {
  assert.deepEqual(actions(FIRM_WALK), ['Drafts']);
  assert.deepEqual(asks(FIRM_WALK), []);
  assert.equal(fact(FIRM_WALK, 'dataSensitivity').value, 'confidential tax records');
  assert.equal(fact(FIRM_WALK, 'regulated').value, 'Tax advice');
  assert.equal(fact(FIRM_WALK, 'humanInvolvement').value, 'A partner reviews each draft and sends it.');
});

test('#169: a verb-looking noun after a verb, an article or a quantifier is not an action; a real verb still is', () => {
  for (const t of ['The AI proposes updates to the plan.', 'The AI drafts the update for a manager.', 'The AI summarises each payment for review.', 'The AI recommends every approval to a person.']) {
    assert.ok(!actions(t).includes('Acts'), t);
  }
  assert.deepEqual(actions('Our AI updates the CRM after each call.'), ['Acts']);
  assert.deepEqual(actions('The AI sends reminders to clients.'), ['Acts']);
  assert.deepEqual(actions('The AI drafts reminder emails for a person to send.'), ['Drafts'], 'for a person to send is still the person');
});

test('#169: a vague verb with a person as subject is where people enter; negated, it is ignored', () => {
  assert.equal(fact('The AI drafts replies. A manager handles every complaint.', 'humanInvolvement').value, 'A manager handles every complaint.');
  assert.deepEqual(asks('The AI drafts replies. A manager handles every complaint.'), []);
  assert.deepEqual(asks('The AI drafts replies and never processes payments.'), []);
});

test('#169: answering a vague-verb question suggests that action; it is still confirmed separately', () => {
  let s = suggestFromDescription(initialState(), { description: CLIENT_WALK, by: 'priya' });
  const q = descriptionQuestions(s).find((x) => x.kind === 'work');
  assert.deepEqual(q.options.map(([v]) => v), ['acts', 'drafts', 'recommends', 'unsure']);
  s = answerDescriptionQuestion(s, q.id, { answer: 'acts', by: 'priya' });
  const f = contextNow(s).aiActions;
  assert.deepEqual([f.value, f.status, f.certainty], [['Acts'], 'suggested', 'Clear']);
  assert.equal(confirmedContext(s).aiActions, undefined);
  const u = answerDescriptionQuestion(suggestFromDescription(initialState(), { description: CLIENT_WALK, by: 'priya' }), q.id, { answer: 'unsure', by: 'priya' });
  assert.equal(contextNow(u).aiActions, undefined);
});

// ---------------------------------------------------------------------------
// Two Clear errors the 6B eval baseline found (#173)
// ---------------------------------------------------------------------------

test('#173: a future wish is not what the AI does today', () => {
  const t = 'It would be great if, eventually, the bot could issue refunds itself, but for now it only recommends them.';
  assert.deepEqual(actions(t), ['Recommends']);
  assert.deepEqual(asks(t), []);
  assert.ok(!actions('One day we might let the AI send reminders itself.').includes('Acts'));
  // A present ability is still read: "can" isn't a wish.
  assert.deepEqual(actions('Our AI agent can cancel subscriptions, but only after the customer confirms in chat.'), ['Acts']);
  assert.deepEqual(actions('We want AI to draft deadline reminder emails and send them to clients.'), ['Drafts', 'Acts']);
});

test('#173: the one named after "by" does it, whoever was named earlier', () => {
  const t = 'Updates to the price list are drafted by the AI and published by our merchandising lead.';
  assert.deepEqual(actions(t), ['Drafts']);
  assert.equal(fact(t, 'aiActions').certainty, 'Clear', '"drafted by the AI" names the AI');
  assert.equal(fact(t, 'humanInvolvement').value, t);
  assert.deepEqual(asks(t), [], '"Updates to the price list are…" is a noun, not a question');
  assert.equal(fact('Expense claims under $200 are approved by Dana.', 'humanInvolvement').value, 'Expense claims under $200 are approved by Dana.');
  assert.deepEqual(actions('Refunds are issued by the AI within an hour.'), ['Acts']);
  // A sentence-initial verb with no subject is still asked about.
  assert.deepEqual(asks('Posts to the team channel every morning.'), ['Who posts to the team: the AI, or a person?']);
});

// ---------------------------------------------------------------------------
// The 6A floor raised to the reviewed eval labels (#175). Written in other
// words than the eval cases, so the rules are tested, not the set.
// ---------------------------------------------------------------------------

test('#175: said and denied is a contradiction: asked, neither proposed', () => {
  const t = 'The bot never posts anything publicly. Each morning it posts a status update to the channel.';
  assert.ok(!actions(t).includes('Acts'));
  assert.match(asks(t).join(' '), /says both that the AI posts and that it doesn't/);
});

test('#175: something automated is not the AI; "the agent" alone is unclear; both are asked for acting', () => {
  assert.deepEqual(asks('After approval, the platform texts the customer a confirmation.'), ['Who texts the customer: the AI, or a person?']);
  assert.ok(!actions('After approval, the platform texts the customer a confirmation.').includes('Acts'));
  assert.ok(!actions('The agent refunds nothing but the agent cancels stale orders weekly.').includes('Acts'));
  assert.ok(asks('The agent cancels stale orders every week.').some((q) => /^Who cancels/.test(q)));
  // For work that isn't acting, an automated subject still counts (Likely).
  assert.deepEqual(actions('The software pulls bank statements and flags anything odd.'), ['Retrieves', 'Classifies']);
  // "AI agent" and "our assistant" are the AI.
  assert.deepEqual(actions('Our assistant books follow-up calls.'), ['Acts']);
});

test('#175: a person word used as a modifier, or after "to the", isn\'t who acts', () => {
  assert.deepEqual(actions('The AI reads incoming customer messages, sorts them and drafts answers.'), ['Retrieves', 'Drafts', 'Classifies']);
  assert.deepEqual(actions('The AI writes to the tenant and, if rent is late, pauses their access card.'), ['Drafts', 'Acts']);
});

test('#175: eligibility decisions are asked; hiring and benefits are asked as maybe regulated; healthcare, legal and lending are read', () => {
  assert.ok(asks('The tool checks eligibility for a housing grant.').some((q) => /^What does the AI do when it checks eligibility/.test(q)));
  assert.deepEqual(asks('It screens candidates for each opening.'), ['Is its work part of hiring, which may be regulated?']);
  assert.ok(asks('Shortlists job applicants for the recruiter.').includes('Is its work part of hiring, which may be regulated?'));
  assert.equal(fact('The AI summarises clinical notes for the care team.', 'regulated').value, 'Healthcare');
  assert.equal(fact('Our attorneys use it to flag unusual clauses.', 'regulated').value, 'Legal');
  assert.equal(fact('The model scores loan applications overnight.', 'regulated').value, 'Lending');
  assert.equal(fact('It reads passports and proof of identity.', 'dataSensitivity').certainty, 'Clear');
});

test('#175: where people enter, from review, handoff and sign-off language', () => {
  for (const t of [
    'The AI drafts replies; our editors check every one.',
    'Anything over $500 goes to Marta.',
    'The AI prepares the summary for our team to review.',
    'The AI drafts the invoice and Omar gives it a thumbs up.',
    'Nothing is filed without Grace\'s say-so.',
    'Flagged cases are routed with a note to the on-call nurse.',
  ]) assert.ok(fact(t, 'humanInvolvement'), t);
  // Not a person: "our support team" as a name, "sent to Stripe", "pull requests".
  assert.equal(fact('Our support team uses AI to suggest replies.', 'humanInvolvement'), undefined);
  assert.equal(fact('Approved invoices are sent to Stripe for payment.', 'humanInvolvement'), undefined);
  // Retrieves comes from "reads"; "pull" in "pull requests" isn't read as pulling.
  assert.deepEqual(actions('The AI reads GitHub pull requests and suggests labels.'), ['Retrieves', 'Recommends']);
  assert.match(fact('The AI reads GitHub pull requests and suggests labels.', 'aiActions').parts.find((p) => p.value === 'Retrieves').quote, /^AI reads\b/);
  assert.deepEqual(asks('Approved invoices are sent to Stripe for payment.'), ['Who sends approved invoices: the AI, or a person?']);
});
