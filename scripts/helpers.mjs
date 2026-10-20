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

// Since #151 a hard Requirement that isn't Met blocks an expansion. Tests
// about something else meet every hard Requirement through this, as if the
// evidence had come in; scripts/readiness.test.mjs tests the gate itself.
// It rewrites the stored rows in place (no new version), so nothing else
// about the capability changes.
export function requirementsMet(state, capabilityId) {
  const d = state.capabilityData[capabilityId];
  const list = d.versions.requirements || [];
  if (!list.length) return state;
  const last = list[list.length - 1];
  const value = last.value.map((r) => (r.consideration ? r : { ...r, met: true, current: r.current && r.current !== 'Not yet measured' && r.current !== 'No number set yet' ? r.current : 'Met', gap: undefined, measure: undefined, bar: undefined }));
  return { ...state, capabilityData: { ...state.capabilityData, [capabilityId]: { ...d, versions: { ...d.versions, requirements: [...list.slice(0, -1), { ...last, value }] } } } };
}
