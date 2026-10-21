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
