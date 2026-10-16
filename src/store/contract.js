// Rules builder (#5). In code these are still "the contract"; on screen they
// are "Rules".

import { pickTemplate, suggestLines, CONTRACT_SECTIONS } from '../data/contract-templates.js';
import { findStartingPoint, START_FROM_SCRATCH, riskBoundaries, hasBlank } from '../data/templates.js';
import { DATA_FIELDS } from '../data/seed.js';
import { getCapability, capData, updateCap, logEvent } from './state.js';
import { current, versionList, performanceResultsSeen } from './selectors.js';
import { people, snapshotPerson, requireActive } from './people.js';
import { measureProblems } from './measures.js';

export const SECTION_KEYS = CONTRACT_SECTIONS.map(([k]) => k);
export const SECTION_LABELS = Object.fromEntries(CONTRACT_SECTIONS);

export const norm = (t) => t.toLowerCase().replace(/[^a-z0-9$% ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function startContractDraft(state, capabilityId, { by } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  if (versionList(state, capabilityId, 'contract').length) throw new Error('These rules are already set. To change them, propose a change.');
  const d = capData(state, capabilityId);
  if (d.contractDraft && !d.contractDraft.finalizedAt) return state;
  const risk = current(state, capabilityId, 'risk');
  if (cap.setup) return startSetupBoundaries(state, cap, risk, by);
  const template = pickTemplate(risk);
  let n = 0;
  const lines = [];
  for (const section of SECTION_KEYS) {
    for (const text of template.sections[section]) lines.push({ id: `L${++n}`, section, text, source: 'template', status: 'accepted', original: text });
  }
  for (const sug of suggestLines(cap.name, cap.summary)) {
    lines.push({ id: `L${++n}`, section: sug.section, text: sug.text, source: 'ai', status: 'pending', original: sug.text, because: sug.because });
  }
  const draft = {
    templateId: template.id,
    templateName: template.name,
    template: template.sections,
    startedAt: state.today,
    startedBy: by && people(state)[by] ? by : cap.owner,
    lines,
    nextId: n + 1,
    confirmed: Object.fromEntries(SECTION_KEYS.map((k) => [k, false])),
    finalizedAt: null,
  };
  const s = updateCap(state, capabilityId, { contractDraft: draft });
  return logEvent(s, {
    kind: 'contract-draft',
    title: 'Rules draft started',
    body: `${cap.name}: started from the "${template.name}" starter rules (chosen from its risk profile), with ${lines.filter((l) => l.source === 'ai').length} suggestions based on its name and summary to review.`,
    capabilityId,
    link: `#/capabilities/${capabilityId}/contract/build`,
  });
}

// A capability set up through the setup flow (#139): every line is a
// suggestion reviewed on its own (from the template or the risk answers),
// none is pre-accepted, and numbers are blanks a person fills in. The old
// keyword suggestions from the name and summary were written for the demo's
// support domain ("accountant" matched "account"), so the template families
// replace them here.
export const SUGGESTION_LABELS = { template: 'Template suggestion', answers: 'Based on your answers', 'authority-lab': 'Authority Lab suggestion', ai: 'AI suggestion' };
// Lines a person must review: suggestions, and the old keyword lines ('ai'),
// which were always deterministic and now read "Based on your answers".
export const isSuggestion = (l) => l.source === 'suggestion' || l.source === 'ai';
export const suggestionOrigin = (l) => (l.source === 'ai' ? 'answers' : l.origin);

function startSetupBoundaries(state, cap, risk, by) {
  if (!risk.impact) throw new Error('Answer the Risk questions first: the Boundary suggestions depend on them.');
  const family = findStartingPoint(cap.setup.template) || START_FROM_SCRATCH;
  const lines = [];
  const seen = new Set();
  let n = 0;
  const push = (section, text, origin, because) => {
    const key = `${section}|${norm(text)}`;
    if (seen.has(key)) return;
    seen.add(key);
    lines.push({ id: `L${++n}`, section, text, source: 'suggestion', origin, status: 'pending', original: text, because });
  };
  for (const section of SECTION_KEYS) for (const text of family.boundaries[section] || []) push(section, text, 'template', family.name);
  const fromRisk = riskBoundaries(risk);
  for (const section of SECTION_KEYS) for (const text of fromRisk[section] || []) push(section, text, 'answers', 'your risk answers');
  const draft = {
    templateId: family.id,
    templateName: family.name,
    template: family.boundaries,
    startedAt: state.today,
    startedBy: by && people(state)[by] ? by : cap.owner,
    lines,
    nextId: n + 1,
    confirmed: Object.fromEntries(SECTION_KEYS.map((k) => [k, false])),
    finalizedAt: null,
  };
  const s = updateCap(state, cap.id, { contractDraft: draft });
  return logEvent(s, { kind: 'contract-draft', title: 'Boundaries draft started', body: `${cap.name}: ${lines.length} suggested Boundaries to review one at a time (from ${family.name} and the risk answers).`, capabilityId: cap.id, link: `#/capabilities/${cap.id}/contract/build` });
}

export function withDraft(state, capabilityId, fn) {
  const d = capData(state, capabilityId);
  if (!d.contractDraft) throw new Error('Start a rules draft first.');
  if (d.contractDraft.finalizedAt) throw new Error('These rules are already set. To change them, propose a change.');
  return updateCap(state, capabilityId, { contractDraft: fn(d.contractDraft) });
}

export function unconfirm(draft, section) {
  return { ...draft, confirmed: { ...draft.confirmed, [section]: false } };
}

// Accept, edit or reject one AI suggestion. There is deliberately no
// "accept all"; each suggestion is reviewed on its own.
export function reviewSuggestion(state, capabilityId, lineId, { decision, text } = {}) {
  return withDraft(state, capabilityId, (draft) => {
    const line = draft.lines.find((l) => l.id === lineId);
    if (!line) throw new Error(`Unknown line: ${lineId}`);
    if (!isSuggestion(line)) throw new Error('Only suggestions are reviewed this way.');
    if (!['accept', 'edit', 'reject'].includes(decision)) throw new Error(`Unknown decision: ${decision}`);
    let next;
    // A suggestion with a blank needs its number from a person (#139).
    if (decision === 'accept' && hasBlank(line.original)) throw new Error('This suggestion has a blank for a number. Edit it and fill in the number, or reject it.');
    if (decision === 'accept') next = { ...line, status: 'accepted', text: line.original };
    if (decision === 'reject') next = { ...line, status: 'rejected' };
    if (decision === 'edit') {
      const t = (text || '').trim();
      if (!t) throw new Error('Type the rule, or reject the suggestion.');
      if (hasBlank(t)) throw new Error('Fill in every blank (___) with a number first.');
      next = { ...line, status: t === line.original ? 'accepted' : 'edited', text: t };
    }
    return unconfirm({ ...draft, lines: draft.lines.map((l) => (l.id === lineId ? next : l)) }, line.section);
  });
}

export function addContractLine(state, capabilityId, section, text) {
  return withDraft(state, capabilityId, (draft) => {
    if (!SECTION_KEYS.includes(section)) throw new Error(`Unknown section: ${section}`);
    const t = (text || '').trim();
    if (!t) throw new Error('Type the rule first.');
    const line = { id: `L${draft.nextId}`, section, text: t, source: 'person', status: 'accepted', original: t };
    return unconfirm({ ...draft, lines: [...draft.lines, line], nextId: draft.nextId + 1 }, section);
  });
}

export function editContractLine(state, capabilityId, lineId, text) {
  return withDraft(state, capabilityId, (draft) => {
    const line = draft.lines.find((l) => l.id === lineId);
    if (!line) throw new Error(`Unknown line: ${lineId}`);
    if (isSuggestion(line)) return reviewSuggestionDraft(draft, line, text);
    const t = (text || '').trim();
    if (!t) throw new Error('Type the rule first.');
    const next = { ...line, text: t, status: line.source === 'template' && t !== line.original ? 'edited' : line.status };
    return unconfirm({ ...draft, lines: draft.lines.map((l) => (l.id === lineId ? next : l)) }, line.section);
  });
}
export function reviewSuggestionDraft(draft, line, text) {
  const t = (text || '').trim();
  if (!t) throw new Error('Type the rule, or reject the suggestion.');
  if (hasBlank(t)) throw new Error('Fill in every blank (___) with a number first.');
  const next = { ...line, status: t === line.original ? 'accepted' : 'edited', text: t };
  return unconfirm({ ...draft, lines: draft.lines.map((l) => (l.id === line.id ? next : l)) }, line.section);
}

// Template and person lines can be removed; the removal is kept in the draft.
export function removeContractLine(state, capabilityId, lineId) {
  return withDraft(state, capabilityId, (draft) => {
    const line = draft.lines.find((l) => l.id === lineId);
    if (!line) throw new Error(`Unknown line: ${lineId}`);
    if (isSuggestion(line)) throw new Error('Reject this suggestion instead, so the decision is kept.');
    return unconfirm({ ...draft, lines: draft.lines.map((l) => (l.id === lineId ? { ...l, status: 'removed' } : l)) }, line.section);
  });
}

export function confirmSection(state, capabilityId, section, confirmed = true) {
  return withDraft(state, capabilityId, (draft) => {
    if (!SECTION_KEYS.includes(section)) throw new Error(`Unknown section: ${section}`);
    if (confirmed && draft.lines.some((l) => l.section === section && l.status === 'pending')) {
      throw new Error('Accept, edit or reject every suggestion in this section first.');
    }
    return { ...draft, confirmed: { ...draft.confirmed, [section]: Boolean(confirmed) } };
  });
}

// The contract a draft would produce: accepted, edited and person lines.
export function draftValue(draft) {
  const value = {};
  for (const k of SECTION_KEYS) value[k] = draft.lines.filter((l) => l.section === k && ['accepted', 'edited'].includes(l.status)).map((l) => l.text);
  return value;
}

export const hasNumber = (t) => /\d/.test(t) || /\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(t);
export const hasWindow = (t) => /\b(\d+|one|two|three|seven|fourteen|thirty)\s*(-|\s)?(day|days|hour|hours|week|weeks|case|cases|minute|minutes)\b/i.test(t) || /rolling/i.test(t);
export const hasValueLimit = (t) => /\$\s?\d|\b\d+\s?(usd|eur|gbp|dollars)\b|\bvalue limit\b|\babove\s+\$?\d/i.test(t);

// Software checks on a contract value, shared by the builder and by contract
// proposals. `block` stops finalize or submission; `warn` does not.
export function contractValueChecks(state, capabilityId, value) {
  const risk = current(state, capabilityId, 'risk');
  const out = [];
  const aboveLow = risk.impact && risk.impact !== 'Low';
  if (aboveLow && !value.mustNever.length) out.push({ id: 'empty-never', level: 'block', section: 'mustNever', text: `Add at least one "${SECTION_LABELS.mustNever}" rule. ${risk.impact}-impact capabilities need one.` });
  if (aboveLow && !value.autoRestriction.length) out.push({ id: 'empty-auto', level: 'block', section: 'autoRestriction', text: `Add at least one rule under "${SECTION_LABELS.autoRestriction}". For a ${risk.impact.toLowerCase()}-impact capability, software needs a limit it can enforce.` });
  // The data section lists known fields only, never a restricted one (A2).
  for (const f of value.dataSeen || []) {
    const known = DATA_FIELDS.find((x) => x.id === f);
    if (!known) out.push({ id: `data-unknown-${f}`, level: 'block', section: 'dataSeen', text: `"${f}" isn't data any connected tool provides.` });
    else if (known.restricted) out.push({ id: `data-restricted-${f}`, level: 'block', section: 'dataSeen', text: `${known.label} is restricted and never reaches the AI, so the rules can't include it.` });
  }
  // A measured restriction line (#120) names a line that exists, and a valid measure.
  for (const [line, m] of Object.entries(value.ruleMeasures || {})) {
    if (!(value.autoRestriction || []).includes(line)) out.push({ id: `measure-orphan-${norm(line).slice(0, 20)}`, level: 'block', section: 'autoRestriction', text: `A measure is set for "${line}", which isn't one of the automatic-restriction rules.` });
    const problems = measureProblems(m);
    if (problems.length) out.push({ id: `measure-bad-${norm(line).slice(0, 20)}`, level: 'block', section: 'autoRestriction', text: `"${line}": ${problems.join(' ')}` });
  }
  // Contradictions: the same line in "may" and in "must never" or "must ask".
  const may = value.may.map(norm);
  for (const t of value.mustNever) if (may.includes(norm(t))) out.push({ id: `contra-${norm(t).slice(0, 20)}`, level: 'block', section: 'mustNever', text: `"${t}" is under both "${SECTION_LABELS.may}" and "${SECTION_LABELS.mustNever}". Keep it in one.` });
  for (const t of value.mustAsk) if (may.includes(norm(t))) out.push({ id: `contra-ask-${norm(t).slice(0, 20)}`, level: 'block', section: 'mustAsk', text: `"${t}" is under both "${SECTION_LABELS.may}" and "${SECTION_LABELS.mustAsk}". Keep it in one.` });
  for (const t of value.autoRestriction) {
    if (!hasNumber(t) || !hasWindow(t)) out.push({ id: `rule-${norm(t).slice(0, 20)}`, level: 'block', section: 'autoRestriction', text: `"${t}" has no ${!hasNumber(t) ? 'number' : 'time or case window'}. It needs a number and a time or case window, e.g. "above 5% over 7 days", so software can check it.` });
  }
  if (risk.exposure === 'Financial / consequential') {
    // A ceiling in "may" or a threshold in "must ask" counts. A limit that
    // only appears under "must never" is not an operating limit.
    const limited = [...value.may, ...value.mustAsk].some(hasValueLimit);
    if (!limited) out.push({ id: 'no-value-limit', level: 'block', section: 'mustAsk', text: `Set a money limit: these rules set no value limit for a financial capability. Add a ceiling under "${SECTION_LABELS.may}", or a threshold like "Refunds over $100" under "${SECTION_LABELS.mustAsk}". A limit that appears only under "${SECTION_LABELS.mustNever}" doesn't count.` });
  }
  for (const k of ['may', 'escalation']) if (!value[k].length) out.push({ id: `empty-${k}`, level: 'warn', section: k, text: `"${SECTION_LABELS[k]}" has no rules yet.` });
  return out;
}

// Checks on the builder's draft: the value checks plus review completeness.
export function contractChecks(state, capabilityId) {
  const d = capData(state, capabilityId);
  const draft = d.contractDraft;
  if (!draft) return [];
  const out = contractValueChecks(state, capabilityId, draftValue(draft));
  const pending = draft.lines.filter((l) => l.status === 'pending').length;
  if (pending) out.push({ id: 'pending', level: 'block', section: null, text: `${pending} suggestion${pending === 1 ? '' : 's'} still to accept, edit or reject.` });
  const unconfirmed = SECTION_KEYS.filter((k) => !draft.confirmed[k]);
  if (unconfirmed.length) out.push({ id: 'unconfirmed', level: 'block', section: null, text: `Confirm ${unconfirmed.length} section${unconfirmed.length === 1 ? '' : 's'}: ${unconfirmed.map((k) => SECTION_LABELS[k]).join(', ')}.` });
  return out;
}

export function canFinalizeContract(state, capabilityId) {
  const blocks = contractChecks(state, capabilityId).filter((c) => c.level === 'block');
  return { ok: blocks.length === 0, blocks };
}

export function contractSummary(value, cap) {
  const name = cap ? cap.name : 'The capability';
  const list = (items) => items.map((t) => t.replace(/\.$/, '')).join('; ');
  const parts = [];
  if (value.may.length) parts.push(`${name} may: ${list(value.may)}.`);
  if (value.mustAsk.length) parts.push(`It must ask a person before: ${list(value.mustAsk)}.`);
  if (value.mustNever.length) parts.push(`It must never: ${list(value.mustNever)}.`);
  if (value.escalation.length) parts.push(`It hands the case to a person when: ${list(value.escalation)}.`);
  if (value.autoRestriction.length) parts.push(`Its authority is reduced automatically when: ${list(value.autoRestriction)}.`);
  return parts.join(' ');
}

// A named person finalizes the draft into contract v1.
export function finalizeContract(state, capabilityId, { by } = {}) {
  const cap = getCapability(state, capabilityId);
  const d = capData(state, capabilityId);
  const draft = d.contractDraft;
  if (!draft) throw new Error('There\'s no rules draft to save.');
  if (draft.finalizedAt) throw new Error('These rules are already saved.');
  requireActive(state, by, 'save the rules');
  const check = canFinalizeContract(state, capabilityId);
  if (!check.ok) throw new Error(`Can't save the rules yet: ${check.blocks.map((b) => b.text).join(' ')}`);
  const value = draftValue(draft);
  const ai = draft.lines.filter(isSuggestion);
  const review = {
    templateId: draft.templateId,
    templateName: draft.templateName,
    suggestions: ai.length,
    accepted: ai.filter((l) => l.status === 'accepted').length,
    edited: ai.filter((l) => l.status === 'edited').length,
    rejected: ai.filter((l) => l.status === 'rejected').map((l) => ({ section: l.section, text: l.original, because: l.because })),
    added: draft.lines.filter((l) => l.source === 'person' && l.status !== 'removed').length,
    removed: draft.lines.filter((l) => l.source === 'template' && l.status === 'removed').map((l) => ({ section: l.section, text: l.original })),
    editedTemplate: draft.lines.filter((l) => l.source === 'template' && l.status === 'edited').map((l) => ({ section: l.section, before: l.original, after: l.text })),
  };
  const version = {
    version: 1,
    date: state.today,
    author: by,
    authorAt: snapshotPerson(state, by),
    reason: `Started from ${getCapability(state, capabilityId).setup ? `${draft.templateName}` : `the "${draft.templateName}" starter rules`}. ${review.suggestions} suggestion${review.suggestions === 1 ? '' : 's'}: ${review.accepted} accepted, ${review.edited} edited, ${review.rejected.length} rejected. ${review.added} ${getCapability(state, capabilityId).setup ? 'Boundar' : 'rule'}${review.added === 1 ? (getCapability(state, capabilityId).setup ? 'y' : '') : (getCapability(state, capabilityId).setup ? 'ies' : 's')} added by hand.`,
    afterEvidence: performanceResultsSeen(state, capabilityId),
    before: null,
    value,
    review,
  };
  let s = updateCap(state, capabilityId, {
    versions: { ...d.versions, contract: [version] },
    contractDraft: { ...draft, finalizedAt: state.today, finalizedBy: by },
  });
  s = logEvent(s, {
    kind: 'contract-finalized',
    title: 'Rules saved',
    body: `${cap.name} rules saved by ${people(state)[by].name}. ${version.reason}`,
    capabilityId,
    link: `#/capabilities/${capabilityId}?tab=status&show=rules`,
  });
  return s;
}
