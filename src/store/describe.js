// Reading a free-form description (Phase 6A.2, Paige, 2026-10-21). The
// deterministic path: rules, no model. Each proposed fact says how decisive
// its rule was (Clear or Likely) and quotes the words it relied on. What a
// rule can't settle (who does an action, a negated or conditional mention of
// sensitive data or regulated work) becomes a question for the person, marked
// Unsure, instead of a guess. Nothing here records anything: the store turns
// proposals into suggested facts that a person confirms one at a time.
//
// Clear / Likely / Unsure is never called "confidence" and never a number.
// Here it says how decisive the pattern was; a later model layer (6B) would
// say how strongly the model supports the reading, with the same words.

export const CERTAINTY = ['Clear', 'Likely', 'Unsure'];

// Verbs by what the AI would be doing. "Acts" verbs are the consequential ones:
// they're only proposed when the AI is clearly the one acting.
const VERBS = [
  ['Acts', /\b(send|sends|sent|sending|issue|issues|issued|issuing|pay|pays|paid|paying|update|updates|updated|updating|close|closes|closed|closing|delete|deletes|deleted|deleting|execute|executes|executed|executing|submit|submits|submitted|submitting|publish|publishes|published|publishing|post|posts|posted|posting|cancel|cancels|cancelled|canceled|cancelling|approve|approves|approved|approving|takes action|take action|go out|goes out|went out|going out)\b/gi],
  ['Drafts', /\b(draft|drafts|drafted|drafting|write|writes|wrote|writing|compose|composes|composed|composing|prepare|prepares|prepared|preparing|reply|replies|replied|replying|respond|responds|responded|responding)\b/gi],
  ['Recommends', /\b(recommend\w*|suggest\w*|propos\w*|prioriti[sz]\w*)\b/gi],
  ['Classifies', /\b(classif\w*|categori[sz]\w*|tag|tags|tagged|tagging|triage\w*|route|routes|routed|routing|extract\w*|interpret\w*)\b/gi],
  ['Retrieves', /\b(search\w*|look(?:s|ed|ing)? ?up|lookup|find|finds|found|finding|retriev\w*|research\w*|summari[sz]\w*)\b/gi],
];
// Verbs that don't say what the AI does (#169): with the AI or no one as the
// subject they're asked about, never read as an action; with a person as the
// subject, they say where people enter.
const VAGUE = /\b(handle|handles|handled|handling|process|processes|processed|processing|manage|manages|managed|managing|takes care of|take care of|deals with|deal with|decide|decides|decided|deciding|automate|automates|automated|automating)\b/gi;
const VAGUE_PRESENT = { handle: 'handles', process: 'processes', manage: 'manages', 'take care of': 'takes care of', 'deal with': 'deals with', decide: 'decides', automate: 'automates' };
const vagueBase = (w) => { const x = w.toLowerCase(); return Object.keys(VAGUE_PRESENT).find((b) => x === b || x === VAGUE_PRESENT[b] || x.startsWith(b.replace(/e$/, ''))) || x; };

// A verb-looking word used as a noun (#169): "propose updates", "the draft",
// "every proposal". The word before it is an article, a possessive or a
// quantifier, or another verb.
const DETERMINERS = new Set(['the', 'a', 'an', 'any', 'its', 'their', 'our', 'your', 'his', 'her', 'my', 'each', 'every', 'some', 'these', 'those', 'this', 'that', 'all', 'no', 'of', 'for', 'with']);
const ANY_VERB = [...VERBS.map(([, re]) => new RegExp(re.source, 'i')), new RegExp(VAGUE.source, 'i')];
function nounUse(sentence, m) {
  const prev = (sentence.slice(0, m.index).match(/([\w'-]+)\W*$/) || [])[1];
  if (!prev) return false;
  if (DETERMINERS.has(prev.toLowerCase())) return true;
  return ANY_VERB.some((re) => new RegExp(`^(?:${re.source})$`, 'i').test(prev));
}

const TOOL_WORDS = /\b(tools?|APIs?|integrations?|system of record)\b/i;

// Who does it. AI first, so "AI agent" is the AI, not a person.
const AI_ACTOR = /\b(?:AI(?:\s+agents?|\s+assistants?)?|A\.I\.|the assistant|an assistant|the model|the bot|chatbot|LLM|copilot)\b/gi;
const PERSON_ACTOR = /\b(?:a person|a human|humans?|someone|people|staff|our team|the team|team members?|we|I|they|partners?|accountants?|lawyers?|attorneys?|reviewers?|managers?|clerks?|employees?|agents?|nurses?|doctors?|clinicians?|analysts?|operators?|the owner|tax lead|admins?|clients?|customers?|users?)\b/gi;
// A named person right before what they do ("Ben reviews and sends them").
const NAME_ACTOR = /\b[A-Z][a-z]+(?= (?:reviews|checks|approves|sends|signs|reads)\b)/g;
// "it" counts as the AI only right before its verb ("it only drafts").
const IT_SUBJECT = /\bit\s+(?:(?:only|also|then|just|will|would|can|could|should|may|might|automatically|always|usually|sometimes)\s+){0,3}$/i;
const NEGATION = /\b(?:never|not|no longer|without|cannot|can't|won't|doesn't|don't|isn't|aren't|nor|no)\b|n't\b/i;
const PASSIVE = /\b(?:is|are|was|were|be|been|being|gets?|got)\s+(?:\w+ly\s+)?$/i;

const sentencesOf = (text) => String(text || '').split(/(?<=[.!?;])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
const words = (s, n) => s.trim().split(/\s+/).slice(0, n).join(' ');
const tidy = (s) => s.replace(/\s+/g, ' ').replace(/^[,;:\s]+|[,;:\s]+$/g, '').trim();

const PREPOSITION_BEFORE = /\b(?:for|to|from|with|about|of|on|at|into|by|toward|towards)\s+$/i;

// The nearest actor before position `at` in the sentence.
function actorBefore(sentence, at) {
  const before = sentence.slice(0, at);
  if (IT_SUBJECT.test(before)) return { kind: 'ai', certainty: 'Likely', start: before.search(/\bit\s+[^]*$/i) };
  const found = [];
  const ai = [];
  for (const m of before.matchAll(AI_ACTOR)) { ai.push([m.index, m.index + m[0].length]); found.push({ kind: 'ai', certainty: 'Clear', start: m.index, end: m.index + m[0].length }); }
  for (const m of [...before.matchAll(PERSON_ACTOR), ...before.matchAll(NAME_ACTOR)]) {
    const end = m.index + m[0].length;
    if (ai.some(([a, b]) => m.index < b && end > a)) continue;
    // After a preposition a person is who it's for, not who does it ("refunds
    // for customers"), unless the verb follows as "to <verb>" ("for a person
    // to send") (#169).
    if (PREPOSITION_BEFORE.test(before.slice(0, m.index)) && !/^\s+to\s+$/i.test(before.slice(end))) continue;
    found.push({ kind: 'person', certainty: 'Clear', start: m.index, end });
  }
  if (!found.length) return null;
  return found.sort((a, b) => b.end - a.end)[0];
}

// The plain form of an acting verb, for asking about it ("sent" -> "sends").
const IRREGULAR = { sent: 'send', paid: 'pay', 'takes action': 'take action', 'take action': 'take action', 'go out': 'send', 'goes out': 'send', 'went out': 'send', 'going out': 'send' };
const ACT_BASES = ['send', 'issue', 'pay', 'update', 'close', 'delete', 'execute', 'submit', 'publish', 'post', 'cancel', 'approve'];
function baseOf(word) {
  const w = word.toLowerCase();
  if (IRREGULAR[w]) return IRREGULAR[w];
  return ACT_BASES.find((b) => w === b || w.startsWith(b) || w.startsWith(b.replace(/e$/, ''))) || w;
}
const thirdPerson = (base) => (base === 'take action' ? 'takes action' : /(sh|ch|s|x)$/.test(base) ? `${base}es` : `${base}s`);
const STOP_TAIL = /\s+(?:to|for|from|with|by|of|on|in|at|after|before|and|or|the|a|an)$/i;

// One verb occurrence: who does it, and whether it's negated or passive.
function readVerb(sentence, m) {
  const before = sentence.slice(0, m.index);
  const actor = actorBefore(sentence, m.index);
  const span = actor ? sentence.slice(actor.start, m.index) : before.split(/\s+/).slice(-4).join(' ');
  const negated = NEGATION.test(span.split(/\s+/).slice(-4).join(' '));
  // "Refunds go out" says what goes, not who sends it: read like a passive.
  const passive = PASSIVE.test(before) || /^go(?:es|ing)? out$|^went out$/i.test(m[0]);
  // Quotes stay short (#169): the actor and verb when they're close, else the
  // last few words before the verb.
  const gap = actor ? sentence.slice(actor.end ?? actor.start, m.index).trim().split(/\s+/).filter(Boolean).length : 0;
  const near = (n) => { const ws = [...before.matchAll(/\S+/g)].slice(-n); return ws.length ? ws[0].index : m.index; };
  const quoteStart = actor && gap <= 4 ? actor.start : actor ? near(3) : Math.max(0, before.lastIndexOf(' ', Math.max(0, m.index - 2)) + 1);
  const after = sentence.slice(m.index + m[0].length);
  const quote = tidy(`${sentence.slice(quoteStart, m.index)}${m[0]} ${words(after.replace(/[.!?;].*$/, ''), 4)}`);
  let object = passive
    ? tidy(before.replace(PASSIVE, '')).split(/\s+/).slice(-2).join(' ')
    // "sends them to clients": keep the pronoun when a preposition follows it.
    : tidy(words(after.replace(/^\s*(?:them|it)\b(?!\s+(?:to|for|from|with|by|on|at|after|before)\b)/i, '').replace(/[.!?;,].*$/, ''), 3));
  while (STOP_TAIL.test(` ${object}`)) object = object.replace(STOP_TAIL, '').trim();
  return { actor, negated, passive, quote: quote.replace(/^(?:and|or|then)\s+/i, ''), object };
}

// Data sensitivity: a strong word is Clear; a domain record is Likely.
const STRONG_DATA = /\b(confidential|sensitive|private|personal(?:ly identifiable)?|PII|PHI|social security(?: numbers?)?|SSNs?|passwords?|credit cards?|bank (?:accounts?|details)|account numbers?)\b/gi;
const DOMAIN_DATA = /\b(tax|financial|medical|health|patient|payroll|salary|HR|personnel|student|legal)\s+(?:\w+\s+)?(records?|data|information|returns?|files|history|documents|details)\b/gi;
const HEAD_NOUN = /^((?:\s+[\w-]+){0,3}?)\s+(records?|data|information|returns?|files|history|documents|details|numbers?)\b/i;

// Regulated or professional work.
const REGIMES = /\b(HIPAA|GDPR|FINRA|SOX|PCI(?:-DSS)?|FCA|SEC|FDA|regulated|regulation|regulatory|licensed|compliance)\b/g;
const PROFESSIONAL = /\b(tax|legal|medical|financial|investment|clinical|insurance|accounting|audit)\s+(advice|guidance|opinions?|decisions?|filings?|returns?|claims?|diagnos\w*)\b/gi;

const negatedBefore = (sentence, at) => NEGATION.test(sentence.slice(Math.max(0, at - 40), at).split(/\s+/).slice(-4).join(' '));

// Existing keyword facts (#139), now with a quote: Likely at most.
const AREA_WORDS = [
  ['People', /\b(customers?|patients?|employees?|applicants?|users?|clients?)\b/i],
  ['Money', /\b(refunds?|payments?|money|credits?|invoices?|prices?|\$\d[\d,.]*)/i],
  ['Rights', /\b(rights|eligib\w*|benefits?|appeals?)\b/i],
  ['Accounts', /\b(accounts?|login|log-in)\b/i],
  ['Compliance', /\b(complian\w*|regulat\w*|legal|law|audit\w*|polic(?:y|ies))\b/i],
  ['Safety', /\b(safety|harm\w*|medical|health|injur\w*)\b/i],
];
const quoteAround = (text, re) => { const m = String(text).match(re); return m ? m[0] : null; };

// Read a description. Returns { proposals, questions }:
// proposals: { key, value, certainty, quote, basis, parts? } for Context
// fields; questions: { id, kind, field, value, quote, question, options }.
export function readDescription(text) {
  const t = String(text || '');
  const proposals = [];
  const questions = [];
  const actions = new Map();
  const people = [];

  for (const sentence of sentencesOf(t)) {
    for (const [action, re] of VERBS) {
      for (const m of sentence.matchAll(re)) {
        if (nounUse(sentence, m)) continue;
        const v = readVerb(sentence, m);
        if (v.negated) continue;
        const who = v.passive ? null : v.actor;
        if (who && who.kind === 'person') {
          if (action === 'Acts' && !people.includes(sentence)) people.push(sentence);
          continue;
        }
        if (who && who.kind === 'ai') {
          const prev = actions.get(action);
          if (!prev || (prev.certainty !== 'Clear' && who.certainty === 'Clear')) actions.set(action, { value: action, certainty: who.certainty, quote: v.quote });
          continue;
        }
        // No actor (or a passive): the description's own subject for most
        // work, but never for acting on the world. That one is asked.
        if (action === 'Acts') {
          const id = `actor:${m[0].toLowerCase()}:${v.object.toLowerCase()}`;
          if (!questions.some((q) => q.id === id)) {
            questions.push({ id, kind: 'actor', field: 'aiActions', value: 'Acts', verb: baseOf(m[0]), quote: v.quote, question: `Who ${thirdPerson(baseOf(m[0]))}${v.object ? ` ${v.object.toLowerCase()}` : ''}: the AI, or a person?`, options: [['ai', 'The AI'], ['person', 'A person'], ['unsure', 'Not sure yet']] });
          }
          continue;
        }
        if (!actions.has(action)) actions.set(action, { value: action, certainty: 'Likely', quote: v.quote });
      }
    }
  }
  // Vague verbs (#169): asked once per sentence, never read as an action.
  for (const sentence of sentencesOf(t)) {
    for (const m of sentence.matchAll(VAGUE)) {
      if (nounUse(sentence, m)) continue;
      const v = readVerb(sentence, m);
      if (v.negated) continue;
      if (v.actor && v.actor.kind === 'person' && !v.passive) { if (!people.includes(sentence)) people.push(sentence); continue; }
      if (questions.some((q) => q.kind === 'work' && q.sentence === sentence)) continue;
      const base = vagueBase(m[0]);
      questions.push({ id: `work:${base}:${v.object.toLowerCase()}`, kind: 'work', field: 'aiActions', sentence, quote: v.quote, question: `What does the AI do when it ${VAGUE_PRESENT[base] || m[0].toLowerCase()}${v.object ? ` ${v.object.toLowerCase()}` : ''}?`, options: [['acts', 'Acts on its own'], ['drafts', 'Drafts for a person to send'], ['recommends', 'Recommends; a person decides'], ['unsure', 'Not sure yet']] });
    }
  }
  // An action someone answered or a clear AI action makes the question moot.
  const asked = questions.filter((q) => !(q.value === 'Acts' && actions.has('Acts')));
  questions.length = 0;
  questions.push(...asked);
  const toolQuote = quoteAround(t, TOOL_WORDS);
  if (toolQuote && !actions.has('Uses tools')) actions.set('Uses tools', { value: 'Uses tools', certainty: 'Likely', quote: toolQuote });
  if (actions.size) {
    const ORDER = ['Retrieves', 'Drafts', 'Classifies', 'Recommends', 'Acts', 'Uses tools'];
    const parts = [...actions.values()].sort((a, b) => ORDER.indexOf(a.value) - ORDER.indexOf(b.value));
    proposals.push({ key: 'aiActions', value: parts.map((p) => p.value), certainty: parts.every((p) => p.certainty === 'Clear') ? 'Clear' : 'Likely', quote: parts[0].quote, basis: 'What the AI is said to do, read from who does each action.', parts });
  }
  if (people.length) proposals.push({ key: 'humanInvolvement', value: people.map((x) => `${x.charAt(0).toUpperCase()}${x.slice(1)}`).join(' '), certainty: 'Likely', quote: people[0], basis: 'A person, not the AI, does this.' });

  // Data sensitivity.
  const data = [];
  for (const sentence of sentencesOf(t)) {
    for (const m of sentence.matchAll(STRONG_DATA)) {
      const rest = sentence.slice(m.index + m[0].length).match(HEAD_NOUN);
      const phrase = tidy(`${m[0]}${rest ? `${rest[1]} ${rest[2]}` : ''}`);
      data.push({ phrase, certainty: 'Clear', negated: negatedBefore(sentence, m.index), at: [sentence, m.index] });
    }
    for (const m of sentence.matchAll(DOMAIN_DATA)) {
      if (data.some((d) => d.at[0] === sentence && d.phrase.toLowerCase().includes(m[0].toLowerCase()))) continue;
      data.push({ phrase: tidy(m[0]), certainty: 'Likely', negated: negatedBefore(sentence, m.index), at: [sentence, m.index] });
    }
  }
  const dataYes = data.filter((d) => !d.negated);
  if (dataYes.length) proposals.push({ key: 'dataSensitivity', value: dataYes.map((d) => d.phrase).join('; '), certainty: dataYes.some((d) => d.certainty === 'Clear') ? 'Clear' : 'Likely', quote: dataYes[0].phrase, basis: 'Words that name sensitive or confidential data.' });
  for (const d of data.filter((x) => x.negated)) questions.push({ id: `data:${d.phrase.toLowerCase()}`, kind: 'fact', field: 'dataSensitivity', value: d.phrase, quote: tidy(d.at[0]), question: `Does it handle ${d.phrase}?`, options: [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure yet']] });

  // Regulated or professional context.
  const reg = [];
  for (const sentence of sentencesOf(t)) {
    for (const m of sentence.matchAll(PROFESSIONAL)) reg.push({ phrase: tidy(m[0]), certainty: 'Likely', negated: negatedBefore(sentence, m.index), sentence });
    for (const m of sentence.matchAll(REGIMES)) reg.push({ phrase: m[0], certainty: 'Clear', negated: negatedBefore(sentence, m.index), sentence });
  }
  const regYes = reg.filter((r) => !r.negated);
  if (regYes.length) proposals.push({ key: 'regulated', value: [...new Set(regYes.map((r) => r.phrase))].map((p) => `${p.charAt(0).toUpperCase()}${p.slice(1)}`).join('; '), certainty: regYes.some((r) => r.certainty === 'Clear') ? 'Clear' : 'Likely', quote: regYes[0].phrase, basis: 'Words that name regulated or professional work.' });
  for (const r of reg.filter((x) => x.negated)) questions.push({ id: `regulated:${r.phrase.toLowerCase()}`, kind: 'fact', field: 'regulated', value: r.phrase, quote: tidy(r.sentence), question: `Is its work part of ${r.phrase}?`, options: [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure yet']] });

  // The keyword facts from #139, each with what it matched.
  const areas = AREA_WORDS.map(([a, re]) => [a, quoteAround(t, re)]).filter(([, q]) => q);
  if (areas.length) proposals.push({ key: 'consequenceAreas', value: areas.map(([a]) => a), certainty: 'Likely', quote: areas.map(([, q]) => q).join(', '), basis: 'Words that name who or what it can affect.' });
  const external = quoteAround(t, /\b(customers?|clients?|public|external|patients?|users?)\b/i);
  const internal = quoteAround(t, /\b(internal|our team|staff|employees?|in-house)\b/i);
  if (external || internal) proposals.push({ key: 'environment', value: external && internal ? 'Both' : external ? 'External' : 'Internal', certainty: 'Likely', quote: [external, internal].filter(Boolean).join(', '), basis: 'Who it faces.' });
  const pilot = quoteAround(t, /\bpilot\w*/i);
  const live = quoteAround(t, /\bproduction\b|\blive\b|\bin use\b/i);
  if (pilot || live) proposals.push({ key: 'stage', value: pilot && live ? 'Both' : pilot ? 'Pilot' : 'Production', certainty: 'Likely', quote: [pilot, live].filter(Boolean).join(', '), basis: 'Whether it is a pilot or in production.' });
  // The purpose is a whole sentence, so semicolons don't split it.
  const sentences = t.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  const purpose = sentences.find((x) => /\bAI\b/.test(x)) || sentences[0];
  if (purpose) proposals.push({ key: 'purpose', value: purpose, certainty: 'Likely', quote: purpose, basis: 'The sentence that says what the AI is for.' });
  return { proposals, questions };
}
