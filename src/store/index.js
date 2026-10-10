// Application state for the prototype. Plain data, pure transitions, optional
// persistence. Views never mutate state directly; they dispatch actions.
// Everything that belongs to one capability lives under
// state.capabilityData[capabilityId].
//
// This file is the store's public API. Views, main.js and tests import from
// here only; the modules behind it are split by responsibility.

export { emptyCapabilityData, VERSIONED_KINDS, initialState, getCapability, capData, reset } from './state.js';
export { workspaceOf, workflowOf, currentVersion, EMPTY_CONTRACT, EMPTY_RISK, current, versionList, versionsInForce, MEASURED_SOURCES, performanceResultsSeen, SURFACED_KINDS, KIND_LABELS_ALL, activityEvents, versionFor, amendmentsAfterEvidenceFor, isSurfaced, lastDecisionId, proposedAuthority, decisionRequired, lastEvaluated, focusCapability, levelName, authorityLabel, readiness, testSummary } from './selectors.js';
export { people, personRecord, activePeople, isActivePerson, isWorkspaceAdmin, isRiskApprover, rosterVersions, snapshotPerson, addPerson, editPerson, deactivatePerson, RIGHTS, RIGHT_LABELS, activeAdmins, openRosterProposal, getRosterProposal, proposeRosterChange, rosterApprovalEligibility, approveRosterChange, rejectRosterChange, withdrawRosterChange, actor, setActingAs } from './people.js';
export { vagueNameWarning, slugify, RISK_OPTIONS, addCapability, amend, KIND_LABELS } from './capabilities.js';
export { SECTION_KEYS, SECTION_LABELS, startContractDraft, reviewSuggestion, addContractLine, editContractLine, removeContractLine, confirmSection, draftValue, contractValueChecks, contractChecks, canFinalizeContract, contractSummary, finalizeContract } from './contract.js';
export { conditionsPreview, scopeText, nextAuthority, evidenceSnapshot, selectDecision, setCondition, setRationale, canAuthorize, authorize, proposeAuthority } from './decisions.js';
export { startTestRun, advanceTestRun, criteriaSaved, criteriaLocked, canRunSuite, defaultsFor, CORE_CRITERIA, CORE_REQUIREMENTS, defaultDeviations, saveCriteria, simulateScenario, scenarioNudge, saveScenarios, addStarterScenarios } from './evidence.js';
export { SETTINGS, pilotStarted, needsSignoff, stakeholderMembershipChanged, signoffRequirements, requirementLabel, namedStakeholders, isRiskStakeholder, riskStakeholders, openProposal, getProposal, evaluateRequirement, proposalReadiness, proposeAmendment, signoffFeasibility, roleLabel, approvalsComplete, approvalEligibility, approveProposal, withdrawProposal, rejectProposal, STANCES, saveStakeholders, thresholdParts, tighteningOnly, tighteningShortcut, barChangesSinceDecisionOpened } from './proposals.js';
export { simulateBreach, parseRestrictionLine, restrictionRules, ruleCrossed, monitoringStatus, breachRule, readingText, reviewNeeded, reviewEligibility, recordReview, reviewForRecord, restrictedExpansion } from './monitoring.js';
export { isHighOrFinancial, riskCoverage, coverageWarning, proposalSatisfiable, proposalWarning, coverageWarnings, rosterChangeImpact } from './coverage.js';
export { STORAGE_KEY, createStore } from './persist.js';
export { startEmpty, setupPending, setUpWorkspace, MIN_FOUNDING_ADMINS, foundingRiskGap, renameWorkspace, namesAtRecord } from './workspace.js';
export { TOOLS, systemsOf, enforcementTerms, checkAction } from './gate.js';
export { dataSeen, filterForModel, callTool } from './tools.js';
