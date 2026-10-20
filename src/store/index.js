// Application state for the prototype. Plain data, pure transitions, optional
// persistence. Views never mutate state directly; they dispatch actions.
// Everything that belongs to one capability lives under
// state.capabilityData[capabilityId].
//
// This file is the store's public API. Views, main.js and tests import from
// here only; the modules behind it are split by responsibility.

export { emptyCapabilityData, VERSIONED_KINDS, initialState, getCapability, capData, reset } from './state.js';
export { workspaceOf, workflowOf, currentVersion, EMPTY_CONTRACT, EMPTY_RISK, current, versionList, versionsInForce, MEASURED_SOURCES, performanceResultsSeen, SURFACED_KINDS, KIND_LABELS_ALL, activityEvents, versionFor, recordVersion, amendmentsAfterEvidenceFor, isSurfaced, lastDecisionId, proposedAuthority, decisionRequired, lastEvaluated, focusCapability, levelName, authorityLabel, readiness, isConsideration, testSummary } from './selectors.js';
export { people, personRecord, activePeople, isActivePerson, isWorkspaceAdmin, isRiskApprover, rosterVersions, snapshotPerson, addPerson, editPerson, deactivatePerson, RIGHTS, RIGHT_LABELS, activeAdmins, openRosterProposal, getRosterProposal, proposeRosterChange, rosterApprovalEligibility, approveRosterChange, rejectRosterChange, withdrawRosterChange, actor, setActingAs, soloHint, foundingRoster } from './people.js';
export { vagueNameWarning, slugify, RISK_OPTIONS, addCapability, amend, KIND_LABELS } from './capabilities.js';
export { SECTION_KEYS, SECTION_LABELS, startContractDraft, reviewSuggestion, addContractLine, editContractLine, removeContractLine, confirmSection, draftValue, contractValueChecks, contractChecks, canFinalizeContract, contractSummary, finalizeContract } from './contract.js';
export { RESIDUAL_RISK_LEVELS, setResidualRisk, conditionsPreview, scopeText, nextAuthority, evidenceSnapshot, selectDecision, setCondition, setRationale, canAuthorize, authorize, proposeAuthority, OUTCOMES_MIN, OUTCOMES_MAX, parseTarget, outcomeChecks, isExpansion, setOutcome, ROLLOUT_FIELDS, ROLLOUT_REVIEW_WITHIN_DAYS, rolloutChecks, setRolloutField, rationaleOk, realUseEvidence, readyToPropose, RESIDUAL_REASON_MIN, OWNER_DECIDES, decisionEligibility, reviewerInputMissing, replaceProposal, RETIRED_REASON, isRetired, setPauseReviewDate, retireCapability } from './decisions.js';
export { NEEDS_DECISION, NEEDS_DECISION_TEXT, JUDGMENTS, JUDGMENT_WORDS, isUnresolvedTarget, isCoverageRule, checkTargetLinks, DEVIATION_WORDS, startTestRun, advanceTestRun, criteriaSaved, criteriaLocked, canRunSuite, defaultsFor, CORE_CRITERIA, CORE_REQUIREMENTS, defaultDeviations, saveCriteria, simulateScenario, scenarioNudge, saveScenarios, addStarterScenarios } from './evidence.js';
export { SETTINGS, pilotStarted, needsSignoff, stakeholderMembershipChanged, signoffRequirements, requirementLabel, namedStakeholders, isRiskStakeholder, riskStakeholders, openProposal, getProposal, evaluateRequirement, proposalReadiness, proposeAmendment, signoffFeasibility, roleLabel, approvalsComplete, approvalEligibility, approveProposal, withdrawProposal, rejectProposal, STANCES, PEOPLE_ROLES, peopleRoleOf, saveStakeholders, thresholdParts, tighteningOnly, tighteningShortcut, barChangesSinceDecisionOpened } from './proposals.js';
export { simulateBreach, parseRestrictionLine, restrictionRules, ruleCrossed, monitoringStatus, breachRule, readingText, reviewNeeded, reviewEligibility, recordReview, reviewForRecord, restrictedExpansion } from './monitoring.js';
export { isHighOrFinancial, riskCoverage, coverageWarning, proposalSatisfiable, proposalWarning, coverageWarnings, rosterChangeImpact } from './coverage.js';
export { STORAGE_KEY, createStore } from './persist.js';
export { RECORD_SCHEMA, publishableRecord, replayPublished, applyPublishedRecords, isPublished } from './published.js';
export { DEMO_WORKSPACE, BUILT_IN_WORKSPACES, findWorkspace, storageKeyFor, realToday, buildWorkspace, advanceToday } from './workspaces.js';
export { startEmpty, setupPending, setUpWorkspace, MIN_FOUNDING_ADMINS, foundingRiskGap, renameWorkspace, namesAtRecord } from './workspace.js';
export { TOOLS, systemsOf, enforcementTerms, checkAction, VERDICT_LABELS, RULE_KIND_LABELS, verdictLabel, ruleKindLabel, toolLabel, claimsText, claimPhrase } from './gate.js';
export { dataSeen, filterForModel, callTool, fileTicket } from './tools.js';
export { QUEUE_LIMIT, queueApprovers, waitingActions, queuedAction, queueEligibility, recheckQueued, approveAction, rejectAction } from './queue.js';
export { GATE_SOURCES, logGate, gateEvents, categoryOf, gateSummary, gateEvidence, gateMetricOf, gateReading, enforceGateRules } from './gatelog.js';
export { applyBreach } from './monitoring.js';
export { runStartState, REPLAY_RESIDUAL_RISK, toolCall, replayTicket, replayRun } from './replay.js';
export { CAUGHT, isBait, stepOutcome, classifyTicket, outcomeText, runFlags, runLabel, restrictionIn, isRunSet, runsOf, ticketRates, rateText, isUnverified, unverifiedCases, setTicketDefinitions } from './agentruns.js';
export { replayRecording } from './replay.js';
export { grantingRecord, actionRates, METRICS, recogniseMetric, expectedVsActual, ROI_FIELDS, roiVersions, currentRoiAssumptions, roiEditEligibility, setRoiAssumptions, roi } from './value.js';
export { ADOPTION_THRESHOLDS, adoptionSignals } from './adoption.js';
export { barFromWords, MEASURE_STAT_WORDS, mapEvidence } from './configure.js';
export { MIN_PRODUCTION_SAMPLE, MEASURE_STATS, MEASURE_OPS, MEASURE_WORDS, measureProblems, measuredEvidence, judgeMeasure, targetsNow, requirementsNow, importedVerdicts, ruleMeasureOf, importedRuleReading, COVERAGE_WORDS, RESULT_WORDS, rowCoverage, evidenceCoverage, coverageText, evidenceSignals } from './measures.js';
export { enforceImportedRules } from './monitoring.js';
export { SOURCE_KINDS, FRESH_DAYS, CONNECTIONS, TESTS_SOURCE, MANUAL_SOURCE, BUILT_IN_SOURCES, sourceIdFor, sourceOfItem, evidenceSources, findSource, registerSource, manualEntryEligibility, recordManualEvidence } from './sources.js';
export { EVIDENCE_SCHEMA, EVIDENCE_KINDS, MEASUREMENT_TYPES, SEVERITIES, CONFIG_KEYS, CONFIG_LABELS, MAX_MEASUREMENTS, checkEvidence, canonicalEvidence, evidenceImports, findImport, measurementText, measurementSample, importEvidence, importEvidenceFiles, FROM_LABELS, evidenceFrom, configChanges, changesText, evidenceStreams, importedStanding, externalSnapshot } from './external.js';
export { LEVEL_PLAIN, readinessText, overviewTodos, stillNeeded, overviewApprovals, importantResults, authorityRows } from './overview.js';
// Product reset, Phase 1 (#137).
export { CONTEXT_FIELDS, FACT_STATUSES, FACT_SOURCES, contextVersions, contextNow, confirmedContext, recordContext, suggestContext, reviewContextFact, LIFECYCLE, BASELINE_FIELDS, baselineVersions, baselineNow, authorityBaseline, recordBaseline, MATERIAL_CHANGE_AREAS, materialChanges, recordMaterialChange, namedOn } from './context.js';
export { BOUNDARY_CATEGORIES, ENFORCEMENT, actsThroughGate, boundaries, peopleModel } from './boundaries.js';
export { RISK_SEVERITIES, SEVERITY_LABELS, LIKELIHOODS, SCALES, OVERALL_RISKS, OVERALL_RISK_TABLE, overallRisk, riskView, assessRisk } from './risk.js';
// Product reset, Phase 2: the setup flow (#139).
export { SETUP_STATES, BASELINE_REQUIRED, setupState, setupConfirmed, UNCONFIRMED_REASON, startCapability, editSetupCapability, saveSetupRisk, setStartingAuthority, setupReview, confirmSetup, setupConfirmation, resultsLockWarning } from './setup.js';
export { contextDescription, interpretDescription, suggestFromDescription } from './context.js';
export { SUGGESTION_LABELS, isSuggestion, suggestionOrigin } from './contract.js';
export { CHECK_SOURCES, suggestedChecks } from './evidence.js';
// Product reset, Phase 3: the lightweight evidence path (#142).
export { isDemoWorkspace, judgedBy, effectiveJudgment, unlinkedBeforeResults, judgeRole, OUTCOME_RESULTS, OUTCOME_SEVERITIES, recordOutcome, outcomesNow, VERDICTS, recordJudgment, judgmentsFor, INCIDENT_SEVERITIES, INCIDENT_STATUSES, recordIncident, setIncidentStatus, incidentStatus, incidentsFor, openCriticalIncidents, isIncidentRequirement, FEEDBACK_SENTIMENTS, FEEDBACK_SOURCE, recordFeedback, feedbackFor, feedbackMeasurements, IMPACT_BASES, recordImpactActual, impactActuals, rowMetric, linkRowForResults, recordResult, parseCsv, measurementsFromRows, rowsFromFile, uploadEvidence } from './lightweight.js';
export { outcomeMeasurements } from './sources.js';
// Product reset, Phase 4: the Proposal as a frozen review object (#144).
export { authorityProposals, findAuthorityProposal, openAuthorityProposal, proposalStatus, proposalClosures, evidenceProvenance, coverageState, reviewConditions, freezeProposal, proposalStaleness, positionsDiffer, proposalGaps } from './proposal.js';
// Product reset, Phase 5: is the current Authority still justified? (#147).
export { JUSTIFICATION_STATES, decisionInForce, materialChangesSince, materialChangeImpact, changesSinceDecision, justification, restorationContext, authorityGap, gapBlocks } from './lifecycle.js';
