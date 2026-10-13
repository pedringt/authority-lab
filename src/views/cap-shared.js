// Helpers shared by the capability tabs.

import { TOOLS, toolLabel } from '../store/index.js';

export const toolWords = (tool) => (Object.hasOwn(TOOLS, tool) ? toolLabel(tool) : 'Unknown tool');

// Each level's plain name, as the redesign says it (the seed's names stay in
// records and the decision flow).
export const LEVEL_TITLE = ['Observe', 'Recommend', 'Draft', 'Act within limits', 'Broad autonomy'];

// A recorded decision option in plain words. The record keeps the exact option.
export const OPTION_PLAIN = {
  'expand': 'expand autonomy, broadly',
  'expand-limits': 'expand autonomy, within limits',
  'hold': 'keep current limits',
  'restrict': 'reduce autonomy one level',
  'suspend': 'reduce autonomy all the way, to Observe',
  'redesign': 'pause and redesign',
  'auto-restrict': 'automatic restriction',
  'define': 'starting point',
  'not-delegated': 'not delegated, by design',
};

// The first sentence of a piece of text.
export const firstSentence = (text) => { const m = String(text || '').match(/^.*?[.!?](\s|$)/); return (m ? m[0] : String(text || '')).trim(); };
export const lowerFirst = (s) => String(s || '').replace(/^./, (c) => c.toLowerCase());
export const upperFirst = (s) => String(s || '').replace(/^./, (c) => c.toUpperCase());
