// Where evidence came from (#119): one label per item (demo data, recorded in
// this workspace, imported, calculated), the source and version context of
// imported results behind a disclosure, and a plain warning when a source's
// configuration changed, so results from different configurations are never
// read as one.

import { html, badge, kv, fmtDate, notice } from '../ui.js';
import { CONFIG_KEYS, CONFIG_LABELS, FROM_LABELS, evidenceFrom, evidenceStreams, changesText, findImport } from '../store/index.js';

const KIND_WORDS = { eval: 'eval', production: 'production' };

export const configLine = (config = {}) => CONFIG_KEYS.filter((k) => config[k] !== undefined).map((k) => `${CONFIG_LABELS[k]} ${config[k]}`).join(' · ');

const refLink = (r, fallback = 'View source') => (r && r.url ? html`<a href="${r.url}" target="_blank" rel="noopener">${r.label || fallback}</a>` : '');

// The origin label on an evidence card.
export function fromBadge(e, seededIds) {
  const from = evidenceFrom(e, seededIds);
  if (from === 'imported') return html`<span class="badge badge-imported" title="Sent by ${e.external.system}; checked and imported. It can't be edited.">Imported from ${e.external.system}</span>`;
  if (from === 'calculated') return '';
  return html`<span class="badge badge-neutral">${FROM_LABELS[from]}</span>`;
}

// Whether an imported result counts toward targets, and if not, why.
export function standingNote(st) {
  if (!st || st.standing === 'current') return '';
  if (st.standing === 'superseded') return html`<p class="evidence-standing">${badge('neutral', 'Replaced')} A newer run (${st.by}) has this result, so this one doesn't count toward targets.</p>`;
  return html`<p class="evidence-standing">${badge('watch', 'Earlier configuration')} Measured under a different configuration (${changesText(st.changes)}), so it's shown but doesn't count toward targets.</p>`;
}

// The full source and version context of an imported result, closed by default.
export function provenanceDetails(state, e) {
  if (!e.external) return '';
  const x = e.external;
  const imp = findImport(state, x.importId);
  const env = imp ? imp.envelope : {};
  return html`<details class="provenance"><summary>Where this came from</summary>${kv([
    ['Source', `${x.system} · ${x.capability}${x.environment ? ` (${x.environment})` : ''}`],
    ['Run', html`${x.importId} · ${KIND_WORDS[x.kind]}${x.reference ? html` · ${refLink(x.reference)}` : ''}`],
    ['Observed', env.observedAt ? env.observedAt.replace('T', ' ') : fmtDate(e.date)],
    ['Imported', imp ? fmtDate(imp.importedOn) : '?'],
    ['Configuration', configLine(x.config) || html`<span class="muted">No versions reported.</span>`],
    ...(e.measure && e.measure.metric ? [['Metric', `${e.measure.metric}${e.measure.segment ? ` · ${e.measure.segment}` : ''}${e.measure.severity ? ` · ${e.measure.severity} severity` : ''}`]] : []),
  ])}</details>`;
}

// One warning per source whose configuration changed since its earlier runs.
export function configChangeNotices(state, capabilityId) {
  return evidenceStreams(state, capabilityId).filter((s) => s.change).map((s) => notice('watch',
    `${s.system} ${s.capability}: the ${KIND_WORDS[s.kind]} configuration changed`,
    `From run ${s.change.runId} (${fmtDate(s.change.since)}): ${changesText(s.change.changes)}. Earlier results are kept and shown, but only results from the current configuration count toward targets.`));
}

// The imported evidence frozen onto a decision record.
export function externalRecordList(list) {
  return html`<ul class="plain-list">${list.map((s) => html`<li><strong>${s.system} ${s.capability}</strong> (${KIND_WORDS[s.kind]}): ${s.runs.length} run${s.runs.length === 1 ? '' : 's'}, latest ${fmtDate(s.runs.at(-1).observedAt.slice(0, 10))}${s.runs.at(-1).reference ? html` · ${refLink(s.runs.at(-1).reference)}` : ''}.${configLine(s.config) ? html` <span class="muted">${configLine(s.config)}.</span>` : ''}${s.excluded ? ` ${s.excluded} result${s.excluded === 1 ? '' : 's'} from an earlier configuration left out.` : ''}</li>`)}</ul>`;
}
