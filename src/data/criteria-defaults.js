// Default success criteria and evidence requirements (#6), derived from the
// risk profile. Each default says where it came from so the editor can show
// it. Nothing here is measured; "current" values are filled by evidence.

const QUALITY = { Low: 85, Medium: 90, High: 92 };
const SEVERE = { Low: 5, Medium: 3, High: 2 };
const CASES = { Low: 50, Medium: 100, High: 200 };

export function defaultCriteria(risk = {}) {
  const impact = QUALITY[risk.impact] ? risk.impact : 'Medium';
  const from = `Default for ${impact} impact`;
  const items = [
    { id: 'quality', name: 'Quality', target: `≥ ${QUALITY[impact]}% correct decisions`, source: from, note: 'Correctness is judged by a reviewer against policy, not by whether the recommendation was accepted.' },
    { id: 'severe-errors', name: 'Severe error rate', target: `< ${SEVERE[impact]}% high-impact errors`, source: from, note: 'Define what a severe error is for this capability before the pilot.' },
    { id: 'review-burden', name: 'Human review burden', target: '≤ 30% of cases need meaningful correction', source: 'Default for every capability', note: 'Edited plus overridden, out of all reviewed cases.' },
    { id: 'speed', name: 'Speed', target: '50% faster average resolution', source: 'Default for every capability', note: 'Compared with the same cases handled without the AI.' },
    { id: 'cost', name: 'Cost', target: 'AI operating cost < $0.20 per case', source: 'Default for every capability', note: 'Model and retrieval cost only. Reviewer time is review burden.' },
    { id: 'adoption', name: 'Adoption', target: '≥ 70% recommendation acceptance', source: 'Default for every capability', note: 'Acceptance is not correctness. Sample accepted recommendations against an independent reviewer.' },
    { id: 'confidence', name: 'Stakeholder confidence', target: 'Key stakeholders agree the proposed authority is appropriate', source: 'Default for every capability', note: 'Kept qualitative. Positions are recorded at decision time, not averaged.' },
  ];
  if (risk.exposure === 'Customer-facing') {
    items.splice(2, 0, { id: 'customer-harm', name: 'Customer-visible errors', target: '0 customer-visible errors that a person would have caught', source: 'Default for customer-facing exposure', note: 'Any wrong output that reached a customer.' });
  }
  return items;
}

export function defaultRequirements(risk = {}) {
  const impact = QUALITY[risk.impact] ? risk.impact : 'Medium';
  const from = `Default for ${impact} impact`;
  const items = [
    { id: 'min-cases', text: `Minimum ${CASES[impact]} pilot cases`, source: from },
    { id: 'accuracy', text: `Overall accuracy ≥ ${QUALITY[impact]}%`, source: from },
    { id: 'severe', text: `High-severity error rate < ${SEVERE[impact]}%`, source: from },
    { id: 'override', text: 'Override rate < 20%', source: 'Default for every capability' },
    { id: 'incidents', text: 'No unresolved critical incidents', source: 'Default for every capability' },
  ];
  if (risk.exposure === 'Financial / consequential') {
    items.push({ id: 'high-value', text: 'Minimum 40 high-value cases', source: 'Default for financial exposure' });
  }
  if (risk.reversibility === 'Difficult to reverse') {
    items.push({ id: 'reversal', text: 'Every pilot action reviewed before it took effect', source: 'Default for difficult-to-reverse actions' });
  }
  return items;
}
