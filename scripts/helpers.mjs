// Shared by the test files. Since #144 every expansion needs a Residual Risk
// (Paige, 2026-10-19, Q4). Tests about something else choose their option
// through decideWith, which gives an expansion one; scripts/proposal.test.mjs
// tests the requirement itself.
import { selectDecision, setResidualRisk } from '../src/store/index.js';

export const TEST_RESIDUAL_RISK = { level: 'Moderate', note: 'Limits and human review keep it contained.' };
export function decideWith(state, capabilityId, option) {
  const s = selectDecision(state, capabilityId, option);
  return option === 'expand' || option === 'expand-limits' ? setResidualRisk(s, capabilityId, TEST_RESIDUAL_RISK) : s;
}
