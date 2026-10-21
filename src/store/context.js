// Product reset, Phase 1 (#137): what is true about the situation around a
// capability. Three things, all recorded by people and never edited:
// - Context: the workflow the capabilities belong to (state.contextVersions).
// - Baseline: what one capability actually does today, including its
//   effective (de facto) authority where that differs from the recorded level
//   (capabilityData[id].baseline).
// - Material changes: changes that may make earlier Evidence less applicable
//   (capabilityData[id].materialChanges). Phase 1 records them; nothing reads
//   them to block or downgrade anything yet (Monitor is Phase 5).
//
// None of these change authority, the bar or approvals. Workspaces saved
// before #137 have none of them: every selector here reads a missing list as
// empty, so nothing is migrated or rewritten.

import { clone, getCapability, capData, updateCap, logEvent } from './state.js';
import { current, levelName } from './selectors.js';
import { people, requireActive, snapshotPerson, isActivePerson, isWorkspaceAdmin } from './people.js';
import { readDescription, CERTAINTY } from './describe.js';

// ---------------------------------------------------------------------------
// Who may record these (Paige, 2026-10-14, #137 item 5b): the capability's
// owner or a person named on it (Reviewer or Stakeholder). Context belongs to
// the workflow, so for Context it's a workspace admin or anyone who could
// record a capability's baseline.
// ---------------------------------------------------------------------------

export function namedOn(state, capabilityId, key) {
  const cap = getCapability(state, capabilityId);
  if (!cap || !isActivePerson(state, key)) return false;
  return cap.owner === key || current(state, capabilityId, 'stakeholders').some((st) => st.person === key);
}

function requireNamedOn(state, capabilityId, by, what) {
  requireActive(state, by, what);
  if (!namedOn(state, capabilityId, by)) throw new Error(`${people(state)[by].name} isn't the owner or named on ${getCapability(state, capabilityId).name}, so they can't ${what}.`);
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

// The structured facts Context can hold (#137). Later hybrid intake fills
// them from a free-form description; here they are plain fields. `options`
// lists allowed values for the choice fields; the rest are free text.
export const CONTEXT_FIELDS = [
  { key: 'purpose', label: 'Purpose and desired outcome' },
  { key: 'users', label: 'Users and operators' },
  { key: 'affectedPeople', label: 'People affected by the output' },
  { key: 'environment', label: 'Environment', options: ['Internal', 'External', 'Both', 'Unknown'] },
  { key: 'stage', label: 'Pilot or production', options: ['Pilot', 'Production', 'Both', 'Unknown'] },
  { key: 'dataSensitivity', label: 'Data sensitivity / confidentiality' },
  { key: 'regulated', label: 'Regulated or professional context' },
  { key: 'aiActions', label: 'What the AI does', multi: ['Retrieves', 'Drafts', 'Classifies', 'Recommends', 'Acts', 'Uses tools'] },
  { key: 'consequenceAreas', label: 'What it can affect', multi: ['People', 'Money', 'Rights', 'Accounts', 'Compliance', 'Safety'] },
  { key: 'reversibility', label: 'Reversibility' },
  { key: 'scale', label: 'Scale' },
  { key: 'evidenceSources', label: 'Available evidence sources' },
  { key: 'humanInvolvement', label: 'Where people enter the workflow' },
];
const FIELD = Object.fromEntries(CONTEXT_FIELDS.map((f) => [f.key, f]));

// A fact moves Suggested -> Reviewed -> Confirmed (docs/TEMPLATES.md). Only a
// confirmed fact may drive setup. A person typing a fact confirms it.
export const FACT_STATUSES = ['suggested', 'reviewed', 'confirmed'];
// Where a fact came from. 'ai' and 'template' facts arrive as suggestions.
// 'description': matched from the free-form description by keyword, shown as
// "Based on your answers" (#139); never presented as AI.
export const FACT_SOURCES = ['person', 'template', 'description', 'ai'];

function cleanFact(key, raw) {
  const f = FIELD[key];
  if (!f) throw new Error(`Unknown context fact: ${key}`);
  if (f.multi) {
    const list = Array.isArray(raw) ? raw : [raw];
    const bad = list.filter((x) => !f.multi.includes(x));
    if (bad.length) throw new Error(`${f.label}: "${bad[0]}" isn't one of ${f.multi.join(', ')}.`);
    return [...new Set(list)];
  }
  if (f.options) {
    if (!f.options.includes(raw)) throw new Error(`${f.label}: choose one of ${f.options.join(', ')}.`);
    return raw;
  }
  const t = String(raw ?? '').trim();
  if (!t) throw new Error(`${f.label} is empty.`);
  return t;
}

export function contextVersions(state) {
  return state.contextVersions || [];
}

// The facts in force: { key: { value, status, source, by, date } }.
export function contextNow(state) {
  const v = contextVersions(state).at(-1);
  return v ? v.value : {};
}

// Only confirmed facts may drive setup.
export function confirmedContext(state) {
  return Object.fromEntries(Object.entries(contextNow(state)).filter(([, f]) => f.status === 'confirmed').map(([k, f]) => [k, f.value]));
}

function canRecordContext(state, by) {
  if (isWorkspaceAdmin(state, by)) return true;
  return state.capabilities.some((c) => namedOn(state, c.id, by));
}

// The free-form description the facts were suggested from (#139). It is
// intake, not a fact: it never drives setup itself.
export function contextDescription(state) {
  const v = contextVersions(state).at(-1);
  return (v && v.description) || '';
}

function writeContext(state, facts, { by, reason, title, description, questions }) {
  requireActive(state, by, 'record the context');
  if (!canRecordContext(state, by)) throw new Error(`${people(state)[by].name} isn't a workspace admin or named on a capability, so they can't record the context.`);
  const why = (reason || '').trim();
  if (!why) throw new Error('Add a reason for the change.');
  const list = contextVersions(state);
  const prev = list.at(-1);
  const desc = description !== undefined ? String(description).trim() : (prev && prev.description) || '';
  // Questions from the description (6A.2) travel with each version until answered.
  const qs = questions !== undefined ? questions : (prev && prev.questions) || [];
  const next = { version: list.length + 1, date: state.today, author: by, authorAt: snapshotPerson(state, by), reason: why, before: prev ? clone(prev.value) : null, value: clone(facts), ...(desc ? { description: desc } : {}), ...(qs.length ? { questions: clone(qs) } : {}) };
  const s = { ...state, contextVersions: [...list, next] };
  return logEvent(s, { kind: 'context', title, body: `${people(state)[by].name}: ${why}`, link: '#/settings' });
}

// A person records facts directly: each one is confirmed, by them.
export function recordContext(state, { facts = {}, by, reason } = {}) {
  const keys = Object.keys(facts);
  if (!keys.length) throw new Error('Record at least one context fact.');
  const next = { ...contextNow(state) };
  for (const k of keys) next[k] = { value: cleanFact(k, facts[k]), status: 'confirmed', source: 'person', by, date: state.today };
  return writeContext(state, next, { by, reason, title: contextVersions(state).length ? 'Context updated' : 'Context recorded' });
}

// Suggestions from a template (or, later, AI) arrive unconfirmed. A confirmed
// fact is never overwritten by a suggestion. A suggestion read from the
// description (6A.2) also says how decisive its rule was (Clear or Likely),
// the words it relied on, and why.
const cleanMeta = (m) => (m ? {
  ...(CERTAINTY.includes(m.certainty) ? { certainty: m.certainty } : {}),
  ...(m.quote ? { quote: String(m.quote).slice(0, 240) } : {}),
  ...(m.basis ? { basis: String(m.basis).slice(0, 200) } : {}),
  ...(Array.isArray(m.parts) ? { parts: m.parts.map((p) => ({ value: p.value, certainty: p.certainty, quote: String(p.quote || '').slice(0, 240), ...(p.basis ? { basis: p.basis } : {}) })) } : {}),
} : {});
export function suggestContext(state, { facts = {}, source, by, reason, description, meta = {}, questions } = {}) {
  if (!['template', 'description', 'ai'].includes(source)) throw new Error('Suggestions come from a template, the description or AI.');
  const next = { ...contextNow(state) };
  for (const k of Object.keys(facts)) {
    if (next[k] && next[k].status === 'confirmed') continue;
    next[k] = { value: cleanFact(k, facts[k]), status: 'suggested', source, by: null, date: state.today, ...cleanMeta(meta[k]) };
  }
  return writeContext(state, next, { by, reason: reason || `Suggested from the ${source}.`, title: 'Context suggestions added', description, questions });
}

// One suggested fact at a time: reviewed, confirmed (optionally corrected) or
// rejected. There is no "confirm all".
export function reviewContextFact(state, key, { decision, value, by, reason } = {}) {
  const now = contextNow(state);
  const f = now[key];
  if (!f) throw new Error(`No ${FIELD[key] ? FIELD[key].label.toLowerCase() : key} to review.`);
  if (f.status === 'confirmed') throw new Error('That fact is already confirmed. Record a new value to change it.');
  const next = { ...now };
  if (decision === 'reject') delete next[key];
  else if (decision === 'review') next[key] = { ...f, status: 'reviewed', reviewedBy: by };
  else if (decision === 'confirm') next[key] = { ...f, value: value === undefined ? f.value : cleanFact(key, value), status: 'confirmed', by, date: state.today, ...(value !== undefined ? { corrected: true } : {}) };
  else throw new Error('Choose review, confirm or reject.');
  const label = FIELD[key].label;
  return writeContext(state, next, { by, reason: reason || `${label}: ${decision === 'reject' ? 'suggestion rejected' : decision === 'review' ? 'suggestion reviewed' : 'confirmed'}.`, title: 'Context fact reviewed' });
}

// ---------------------------------------------------------------------------
// Capability baseline: planned vs in use, and declared vs effective authority
// ---------------------------------------------------------------------------

export const LIFECYCLE = { planned: 'Planned or pilot', 'in-use': 'Already in use', 'not-recorded': 'Not recorded' };
export const BASELINE_FIELDS = [
  { key: 'currentBehavior', label: 'What it actually does today' },
  { key: 'humanInvolvement', label: 'Where people are involved today' },
  { key: 'permissions', label: 'Permissions and actions it has today' },
  { key: 'safeguards', label: 'Safeguards in place today' },
  { key: 'evidence', label: 'Evidence about it today' },
  { key: 'knownIssues', label: 'Known issues and exceptions' },
];

// Planned/in use from "What does it do today?" (Paige, 2026-10-14, #137 4A).
// "Not something to delegate" and no answer at all are not recorded.
const LIFECYCLE_FROM_TODAY = { nothing: 'planned', recommends: 'in-use', drafts: 'in-use', acts: 'in-use' };

export function baselineVersions(state, capabilityId) {
  return capData(state, capabilityId).baseline || [];
}

// The baseline in force. Without a recorded version, the default is derived,
// never stored: lifecycle from the "today" answer where there is one, and
// effective authority "not recorded". Software never infers effective
// authority from behaviour (#137 4A).
export function baselineNow(state, capabilityId) {
  const v = baselineVersions(state, capabilityId).at(-1);
  if (v) return { ...v.value, recorded: true, version: v.version };
  const cap = getCapability(state, capabilityId);
  // A capability set up through the setup flow (#139) was asked directly.
  if (cap && cap.setup && LIFECYCLE[cap.setup.lifecycle]) return { lifecycle: cap.setup.lifecycle, lifecycleFrom: 'setup', effective: { status: 'not-recorded' }, recorded: false, version: 0 };
  const lifecycle = (cap && cap.today && LIFECYCLE_FROM_TODAY[cap.today]) || 'not-recorded';
  return { lifecycle, lifecycleFrom: lifecycle === 'not-recorded' ? null : 'today', effective: { status: 'not-recorded' }, recorded: false, version: 0 };
}

// Declared authority is the recorded level; effective is what a person says
// it really does. `differs` only when both are known.
export function authorityBaseline(state, capabilityId) {
  const cap = getCapability(state, capabilityId);
  const b = baselineNow(state, capabilityId);
  const declared = { level: cap.authority.level, name: levelName(cap.authority.level) };
  const effective = b.effective && b.effective.status === 'recorded'
    ? { status: 'recorded', level: b.effective.level, name: levelName(b.effective.level), note: b.effective.note || '' }
    : { status: (b.effective && b.effective.status) || 'not-recorded' };
  return { declared, effective, differs: effective.status === 'recorded' && effective.level !== declared.level };
}

function cleanEffective(e) {
  if (!e || e.status === 'not-recorded') return { status: 'not-recorded' };
  if (e.status === 'unknown') return { status: 'unknown', note: (e.note || '').trim() };
  const level = Number(e.level);
  if (![0, 1, 2, 3, 4].includes(level)) throw new Error('Effective authority must be a level from 0 to 4, unknown, or not recorded.');
  const note = (e.note || '').trim();
  if (note.length < 10) throw new Error('Say how you know what it really does today (a sentence).');
  return { status: 'recorded', level, note };
}

// Record what the capability actually does today. A new version each time.
export function recordBaseline(state, capabilityId, { lifecycle, effective, fields = {}, by, reason } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  requireNamedOn(state, capabilityId, by, 'record what it does today');
  const why = (reason || '').trim();
  if (!why) throw new Error('Add a reason for the change.');
  const prev = baselineVersions(state, capabilityId).at(-1);
  const base = prev ? prev.value : { lifecycle: baselineNow(state, capabilityId).lifecycle, effective: { status: 'not-recorded' } };
  const value = { ...clone(base) };
  if (lifecycle !== undefined) {
    if (!LIFECYCLE[lifecycle]) throw new Error(`Lifecycle must be one of: ${Object.keys(LIFECYCLE).join(', ')}.`);
    value.lifecycle = lifecycle;
  }
  if (effective !== undefined) value.effective = cleanEffective(effective);
  for (const [k, v] of Object.entries(fields)) {
    if (!BASELINE_FIELDS.some((f) => f.key === k)) throw new Error(`Unknown baseline field: ${k}`);
    const t = String(v ?? '').trim();
    if (t) value[k] = t; else delete value[k];
  }
  const list = baselineVersions(state, capabilityId);
  const next = { version: list.length + 1, date: state.today, author: by, authorAt: snapshotPerson(state, by), reason: why, before: prev ? clone(prev.value) : null, value };
  const s = updateCap(state, capabilityId, (d) => ({ ...d, baseline: [...(d.baseline || []), next] }));
  const ab = authorityBaseline(s, capabilityId);
  return logEvent(s, {
    kind: 'baseline',
    title: list.length ? 'What it does today updated' : 'What it does today recorded',
    body: `${cap.name}: ${people(state)[by].name} recorded ${LIFECYCLE[value.lifecycle].toLowerCase()}${ab.effective.status === 'recorded' ? `, effective authority Level ${ab.effective.level} — ${ab.effective.name}` : ''}. ${why}`,
    capabilityId,
    link: `#/capabilities/${capabilityId}`,
  });
}

// ---------------------------------------------------------------------------
// Material changes
// ---------------------------------------------------------------------------

export const MATERIAL_CHANGE_AREAS = {
  model: 'Model', prompt: 'Prompt', tools: 'Tools', permissions: 'Permissions', workflow: 'Workflow',
  scope: 'Capability scope', users: 'Users', data: 'Data', context: 'Operating context', jurisdiction: 'Jurisdiction', boundaries: 'Boundaries',
};

export function materialChanges(state, capabilityId) {
  return capData(state, capabilityId).materialChanges || [];
}

// Record a material change. Append-only; it says which areas changed and
// when, so later phases can tell which Evidence came before it.
export function recordMaterialChange(state, capabilityId, { areas = [], description, effectiveOn, by } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  requireNamedOn(state, capabilityId, by, 'record a material change');
  const list = [...new Set(Array.isArray(areas) ? areas : [areas])];
  if (!list.length) throw new Error('Say what changed: model, prompt, tools, permissions, workflow, scope, users, data, context, jurisdiction or boundaries.');
  const bad = list.find((a) => !MATERIAL_CHANGE_AREAS[a]);
  if (bad) throw new Error(`Unknown kind of change: ${bad}`);
  const what = (description || '').trim();
  if (what.length < 10) throw new Error('Describe the change (a sentence).');
  const on = effectiveOn || state.today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) throw new Error('The date the change took effect must be YYYY-MM-DD.');
  const existing = materialChanges(state, capabilityId);
  const entry = { id: `MC-${capabilityId}-${existing.length + 1}`, areas: list, description: what, effectiveOn: on, recordedOn: state.today, by, byAt: snapshotPerson(state, by) };
  const s = updateCap(state, capabilityId, (d) => ({ ...d, materialChanges: [...(d.materialChanges || []), entry] }));
  return logEvent(s, {
    kind: 'material-change',
    surfaced: true,
    title: `Material change: ${list.map((a) => MATERIAL_CHANGE_AREAS[a].toLowerCase()).join(', ')}`,
    body: `${cap.name}: ${what} Recorded by ${people(state)[by].name}. Evidence from before ${on} may apply less.`,
    capabilityId,
    link: `#/capabilities/${capabilityId}`,
  });
}

// ---------------------------------------------------------------------------
// Context intake (#139, 6A.2): a free-form description, read by rules into
// suggested facts (src/store/describe.js). Deterministic assistance, labelled
// "Based on your answers", never AI. Every suggestion is confirmed one at a
// time; what the rules can't settle is asked.
// ---------------------------------------------------------------------------

// The facts a description suggests, as plain values (6A.2 reads them with
// src/store/describe.js; this keeps the earlier shape for callers).
export function interpretDescription(text) {
  return Object.fromEntries(readDescription(text).proposals.map((p) => [p.key, p.value]));
}

// Suggest facts from a description. Confirmed facts are never overwritten.
// What the rules can't settle is kept as questions for a person (6A.2).
export function suggestFromDescription(state, { description, by } = {}) {
  const t = String(description || '').trim();
  if (t.length < 20) throw new Error('Describe the product or workflow in a sentence or two first.');
  const { proposals, questions } = readDescription(t);
  const facts = Object.fromEntries(proposals.map((p) => [p.key, p.value]));
  const meta = Object.fromEntries(proposals.map((p) => [p.key, p]));
  return suggestContext(state, { facts, meta, questions, source: 'description', by, reason: proposals.length ? 'Suggested from the description.' : 'Description saved; nothing matched to suggest.', description: t });
}

// Questions from the description still waiting for an answer.
export function descriptionQuestions(state) {
  const v = contextVersions(state).at(-1);
  return ((v && v.questions) || []).filter((q) => !q.answer);
}

// A person answers one question. The answer is theirs, but what it implies
// still arrives as a suggestion to confirm, like every other fact: "the AI
// sends" adds Acts to what the AI does; "a person sends" goes to where
// people enter; a Yes to a fact question suggests that fact. "Not sure yet"
// suggests nothing. A confirmed fact is never changed by an answer.
export function answerDescriptionQuestion(state, id, { answer, by } = {}) {
  const v = contextVersions(state).at(-1);
  const list = (v && v.questions) || [];
  const q = list.find((x) => x.id === id);
  if (!q) throw new Error('That question is no longer open.');
  if (q.answer) throw new Error('That question has already been answered.');
  if (!q.options.some(([value]) => value === answer)) throw new Error(`Answer with one of: ${q.options.map(([, label]) => label).join(', ')}.`);
  const now = { ...contextNow(state) };
  const open = (key) => !(now[key] && now[key].status === 'confirmed');
  const said = { certainty: 'Clear', quote: q.quote, basis: 'You answered this.' };
  // A vague verb (#169) answered with what the AI does.
  const WORK = { acts: 'Acts', drafts: 'Drafts', recommends: 'Recommends' };
  const adds = q.kind === 'actor' && answer === 'ai' ? q.value : q.kind === 'work' ? WORK[answer] : null;
  if (adds && open('aiActions')) {
    const f = now.aiActions || { value: [], parts: [] };
    const value = cleanFact('aiActions', [...new Set([...(f.value || []), adds])]);
    const parts = [...(f.parts || []).filter((p) => p.value !== adds), { value: adds, ...said }];
    now.aiActions = { ...f, value, status: 'suggested', source: 'description', by: null, date: state.today, certainty: parts.every((p) => p.certainty === 'Clear') ? 'Clear' : 'Likely', quote: f.quote || q.quote, parts };
  }
  if (q.kind === 'actor' && answer === 'person' && open('humanInvolvement')) {
    const prev = now.humanInvolvement && now.humanInvolvement.value;
    const line = `A person ${q.verb === 'take action' ? 'takes action' : `${q.verb}${/(sh|ch|s|x)$/.test(q.verb) ? 'es' : 's'}`}: "${q.quote}".`;
    now.humanInvolvement = { value: cleanFact('humanInvolvement', prev ? `${prev} ${line}` : line), status: 'suggested', source: 'description', by: null, date: state.today, ...said };
  }
  if (q.kind === 'fact' && answer === 'yes' && open(q.field)) {
    now[q.field] = { value: cleanFact(q.field, q.value), status: 'suggested', source: 'description', by: null, date: state.today, ...said, quote: q.value };
  }
  const questions = list.map((x) => (x.id === id ? { ...x, answer, by, date: state.today } : x));
  const label = q.options.find(([value]) => value === answer)[1];
  return writeContext(state, now, { by, reason: `${q.question} ${label}.`, title: 'Question about the description answered', questions });
}
