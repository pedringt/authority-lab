// Minimum contextual Help (v1 W4, #185; Paige, 2026-11-10). At each
// consequential choice: one line on why it matters and one plain-language
// example. Collapsed by default, and it never fills in an answer: it holds no
// form controls and no actions.
//
// Paige's readings: one entry per choice, shown everywhere that choice is
// made; examples are generic and fixed, about made-up cases unrelated to the
// capability on screen, so none reads as a suggested answer.
//
// The copy is a draft for Paige's review before merge.

import { html } from '../ui.js';

export const HELP = {
  risk: {
    label: 'the Risk answers',
    why: 'Risk sets how much evidence and how many approvals later changes need, so answer for a failure that could realistically get through, not the usual case.',
    example: 'A tool that drafts internal meeting notes makes mistakes that are easy to undo and only reach staff: Low severity. A tool that changes payroll amounts makes mistakes that are hard to undo and reach people\'s pay: High severity.',
  },
  startingAuthority: {
    label: 'starting Authority',
    why: 'This is how independently it works from the day setup is confirmed. More comes only later, one level at a time, with evidence.',
    example: 'A new tool that sorts job applications starts at Recommend: it suggests how to group applications, and a person reviews and applies each suggestion.',
  },
  boundaries: {
    label: 'Boundaries and how each is enforced',
    why: 'Boundaries say where it must stop or involve a person. How each is enforced tells you whether software checks it, or whether people have to keep it.',
    example: '"Ask a person before deleting a client record" is enforced when software blocks the delete until someone approves it. Written down only, it relies on whoever runs the tool.',
  },
  requirements: {
    label: 'Requirements and Targets',
    why: 'Requirements are what must be true before it gets more authority. A Target puts a number on one where it can be measured, so the bar is set before the results come in.',
    // No number here: the Requirements page never shows a suggested bar.
    example: 'Requirement: "Wrong answers are rare." Target: the share of checked answers that are correct, with the bar your team chooses before any results are in.',
  },
  people: {
    label: 'Owner and Reviewer assignment',
    why: 'The Owner is accountable and records the decisions. Every active Reviewer\'s assessment must be recorded before any expansion; a Stakeholder\'s assessment is advisory.',
    example: 'For a tool that drafts invoices: the finance lead owns it, the accountant who checks the drafts is a Reviewer, and sales is a Stakeholder.',
  },
  residualRisk: {
    label: 'Residual Risk',
    why: 'Residual Risk is your judgment of what is left once the limits and human review are in place. It is recorded with the decision, and software never scores it.',
    example: 'A person still approves every outgoing letter, so a person has an opportunity to catch a bad draft before it is sent, though review can still miss errors: someone might judge that Low. If nobody has looked at the failures yet, Unknown is the honest answer.',
  },
  authorization: {
    label: 'the authorization choice',
    why: 'This is the decision itself. Recording it changes the authority recorded in Authority Lab: expanding grants more, keeping the limits holds it, and reducing or pausing pulls it back as soon as it is recorded. The tool itself changes only where its actions go through Authority Lab\'s gate or another integration enforces it. The record keeps your reason and what was known.',
    example: 'Accuracy meets the bar, but the evening shift hasn\'t been tested yet: keep the current limits, and say what evidence would change your mind.',
  },
  // Attached once #182 (material-change review) is merged.
  applicability: {
    label: 'material-change applicability',
    why: 'After a material change, earlier evidence may describe a system that no longer exists. Until you review it, it doesn\'t count.',
    example: 'After a model upgrade, the Owner might judge earlier accuracy results no longer applicable, while a check of the unchanged price list may remain applicable.',
  },
  // Attached once #183 (manual readings) is merged.
  reading: {
    label: 'a monitoring reading',
    why: 'The period and units must match the safety limit. Checking shows what saving would do; saving records the reading. Once the limit applies, which is while the capability is above the level the limit falls back to, a saved reading over the limit automatically reduces the authority recorded here. Before then, the reading is kept and nothing changes.',
    example: 'For the limit "Misfiled documents above 4% over 7 days": 3%, for Nov 1 to Nov 7, from the weekly filing audit.',
  },
};

// The collapsed Help for one choice. No inputs, buttons or actions inside.
export function helpFor(key) {
  const h = HELP[key];
  if (!h) throw new Error(`No Help for ${key}`);
  return html`<details class="help" data-help="${key}"><summary>Why this matters</summary><p>${h.why}</p><p><span class="help-k">Example:</span> ${h.example}</p></details>`;
}
