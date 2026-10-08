// Contract builder (#5).

import { pickTemplate, suggestLines, CONTRACT_SECTIONS } from '../data/contract-templates.js';
import { getCapability, capData, updateCap, logEvent } from './state.js';
import { current, versionList, performanceResultsSeen } from './selectors.js';
import { people, snapshotPerson, requireActive } from './people.js';

export const SECTION_KEYS = CONTRACT_SECTIONS.map(([k]) => k);
export const SECTION_LABELS = Object.fromEntries(CONTRACT_SECTIONS);

export const norm = (t) => t.toLowerCase().replace(/[^a-z0-9$% ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function startContractDraft(state, capabilityId, { by } = {}) {
  const cap = getCapability(state, capabilityId);
  if (!cap) throw new Error(`Unknown capability: ${capabilityId}`);
  if (versionList(state, capabilityId, 'contract').length) throw new Error('This capability already has a finalized contract. Changes to it are amendments.');
  const d = capData(state, capabilityId);
  if (d.contractDraft && !d.contractDraft.finalizedAt) return state;
  const risk = current(state, capabilityId, 'risk');
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
    title: 'Contract draft started',
    body: `${cap.name}: template "${template.name}" picked from the risk profile, with ${lines.filter((l) => l.source === 'ai').length} suggestions to review.`,
    capabilityId,
    link: `#/capabilities/${capabilityId}/contract/build`,
  });
}

export function withDraft(state, capabilityId, fn) {
  const d = capData(state, capabilityId);
  if (!d.contractDraft) throw new Error('No contract draft. Start one first.');
  if (d.contractDraft.finalizedAt) throw new Error('This contract is finalized. Changes to it are amendments.');
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
    if (line.source !== 'ai') throw new Error('Only AI suggestions are reviewed this way.');
    if (!['accept', 'edit', 'reject'].includes(decision)) throw new Error(`Unknown decision: ${decision}`);
    let next;
    if (decision === 'accept') next = { ...line, status: 'accepted', text: line.original };
    if (decision === 'reject') next = { ...line, status: 'rejected' };
    if (decision === 'edit') {
      const t = (text || '').trim();
      if (!t) throw new Error('An edited suggestion needs text.');
      next = { ...line, status: t === line.original ? 'accepted' : 'edited', text: t };
    }
    return unconfirm({ ...draft, lines: draft.lines.map((l) => (l.id === lineId ? next : l)) }, line.section);
  });
}

export function addContractLine(state, capabilityId, section, text) {
  return withDraft(state, capabilityId, (draft) => {
    if (!SECTION_KEYS.includes(section)) throw new Error(`Unknown section: ${section}`);
    const t = (text || '').trim();
    if (!t) throw new Error('A line needs text.');
    const line = { id: `L${draft.nextId}`, section, text: t, source: 'person', status: 'accepted', original: t };
    return unconfirm({ ...draft, lines: [...draft.lines, line], nextId: draft.nextId + 1 }, section);
  });
}

export function editContractLine(state, capabilityId, lineId, text) {
  return withDraft(state, capabilityId, (draft) => {
    const line = draft.lines.find((l) => l.id === lineId);
    if (!line) throw new Error(`Unknown line: ${lineId}`);
    if (line.source === 'ai') return reviewSuggestionDraft(draft, line, text);
    const t = (text || '').trim();
    if (!t) throw new Error('A line needs text.');
    const next = { ...line, text: t, status: line.source === 'template' && t !== line.original ? 'edited' : line.status };
    return unconfirm({ ...draft, lines: draft.lines.map((l) => (l.id === lineId ? next : l)) }, line.section);
  });
}
export function reviewSuggestionDraft(draft, line, text) {
  const t = (text || '').trim();
  if (!t) throw new Error('An edited suggestion needs text.');
  const next = { ...line, status: t === line.original ? 'accepted' : 'edited', text: t };
  return unconfirm({ ...draft, lines: draft.lines.map((l) => (l.id === line.id ? next : l)) }, line.section);
}

// Template and person lines can be removed; the removal is kept in the draft.
export function removeContractLine(state, capabilityId, lineId) {
  return withDraft(state, capabilityId, (draft) => {
    const line = draft.lines.find((l) => l.id === lineId);
    if (!line) throw new Error(`Unknown line: ${lineId}`);
    if (line.source === 'ai') throw new Error('Reject a suggestion instead of removing it.');
    return unconfirm({ ...draft, lines: draft.lines.map((l) => (l.id === lineId ? { ...l, status: 'removed' } : l)) }, line.section);
  });
}

export function confirmSection(state, capabilityId, section, confirmed = true) {
  return withDraft(state, capabilityId, (draft) => {
    if (!SECTION_KEYS.includes(section)) throw new Error(`Unknown section: ${section}`);
    if (confirmed && draft.lines.some((l) => l.section === section && l.status === 'pending')) {
      throw new Error('Review every suggestion in this section before confirming it.');
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
  if (aboveLow && !value.mustNever.length) out.push({ id: 'empty-never', level: 'block', section: 'mustNever', text: `"AI must never" cannot be empty for a ${risk.impact.toLowerCase()}-impact capability.` });
  if (aboveLow && !value.autoRestriction.length) out.push({ id: 'empty-auto', level: 'block', section: 'autoRestriction', text: `"Automatic restriction conditions" cannot be empty for a ${risk.impact.toLowerCase()}-impact capability. Software needs a rule to enforce.` });
  // Contradictions: the same line in "may" and in "must never" or "must ask".
  const may = value.may.map(norm);
  for (const t of value.mustNever) if (may.includes(norm(t))) out.push({ id: `contra-${norm(t).slice(0, 20)}`, level: 'block', section: 'mustNever', text: `"${t}" appears under both "AI may" and "AI must never".` });
  for (const t of value.mustAsk) if (may.includes(norm(t))) out.push({ id: `contra-ask-${norm(t).slice(0, 20)}`, level: 'block', section: 'mustAsk', text: `"${t}" appears under both "AI may" and "AI must ask".` });
  for (const t of value.autoRestriction) {
    if (!hasNumber(t) || !hasWindow(t)) out.push({ id: `rule-${norm(t).slice(0, 20)}`, level: 'block', section: 'autoRestriction', text: `"${t}" has no ${!hasNumber(t) ? 'number' : 'time or case window'}. A restriction rule needs a threshold and a window so software can apply it.` });
  }
  if (risk.exposure === 'Financial / consequential') {
    // A ceiling in "may" or a threshold in "must ask" counts. A limit that
    // only appears under "must never" is not an operating limit.
    const limited = [...value.may, ...value.mustAsk].some(hasValueLimit);
    if (!limited) out.push({ id: 'no-value-limit', level: 'block', section: 'mustAsk', text: 'This is a financial capability and the contract sets no value limit. Add a ceiling under "AI may" or a threshold such as "Refunds over $100" under "AI must ask". A limit that only appears under "AI must never" does not count.' });
  }
  for (const k of ['may', 'escalation']) if (!value[k].length) out.push({ id: `empty-${k}`, level: 'warn', section: k, text: `"${SECTION_LABELS[k]}" is empty.` });
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
  if (unconfirmed.length) out.push({ id: 'unconfirmed', level: 'block', section: null, text: `${unconfirmed.length} section${unconfirmed.length === 1 ? '' : 's'} not yet confirmed: ${unconfirmed.map((k) => SECTION_LABELS[k]).join(', ')}.` });
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
  if (value.autoRestriction.length) parts.push(`Software pulls authority back when: ${list(value.autoRestriction)}.`);
  return parts.join(' ');
}

// A named person finalizes the draft into contract v1.
export function finalizeContract(state, capabilityId, { by } = {}) {
  const cap = getCapability(state, capabilityId);
  const d = capData(state, capabilityId);
  const draft = d.contractDraft;
  if (!draft) throw new Error('No contract draft to finalize.');
  if (draft.finalizedAt) throw new Error('This contract is already finalized.');
  requireActive(state, by, 'finalize the contract');
  const check = canFinalizeContract(state, capabilityId);
  if (!check.ok) throw new Error(`Cannot finalize: ${check.blocks.map((b) => b.text).join(' ')}`);
  const value = draftValue(draft);
  const ai = draft.lines.filter((l) => l.source === 'ai');
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
    reason: `Finalized from template "${draft.templateName}". ${review.suggestions} AI suggestion${review.suggestions === 1 ? '' : 's'}: ${review.accepted} accepted, ${review.edited} edited, ${review.rejected.length} rejected. ${review.added} line${review.added === 1 ? '' : 's'} added by hand.`,
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
    title: 'Contract finalized',
    body: `${cap.name} contract v1 finalized by ${people(state)[by].name}. ${version.reason}`,
    capabilityId,
    link: `#/capabilities/${capabilityId}?tab=contract`,
  });
  return s;
}
