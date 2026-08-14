console.log('[ScriptVault] Service worker starting...');

// Firefox exposes the same API surface as `menus`; keep the shared runtime
// using Chrome's `contextMenus` name.
if (typeof chrome !== 'undefined' && !chrome.contextMenus && chrome.menus) {
  chrome.contextMenus = chrome.menus;
}

// ============================================================================
// Debug Logger — conditional logging based on settings
// ============================================================================

/**
 * Log a debug message. Only outputs if debugMode is enabled in settings.
 * Falls back to no-op in production to avoid Chrome DevTools spam.
 * @param {...any} args - Arguments to log
 */
let _debugEnabled = false;
function debugLog(...args: any[]) {
  if (_debugEnabled) console.log('[ScriptVault]', ...args);
}
function debugWarn(...args: any[]) {
  if (_debugEnabled) console.warn('[ScriptVault]', ...args);
}
async function mergeScriptText(base: any, local: any, remote: any) {
  if (typeof ScriptAnalyzer !== 'undefined' && typeof ScriptAnalyzer.mergeText === 'function') {
    return ScriptAnalyzer.mergeText(base, local, remote);
  }
  if (typeof ScriptAnalyzer !== 'undefined' && typeof ScriptAnalyzer._ensureOffscreen === 'function') {
    const ready = await ScriptAnalyzer._ensureOffscreen();
    if (!ready) throw new Error('No script merge engine available');
    return chrome.runtime.sendMessage({
      type: 'offscreen_merge',
      base,
      local,
      remote
    });
  }
  throw new Error('No script merge engine available');
}

const SYNC_SAFE_SCRIPT_SETTING_KEYS = new Set([
  'autoUpdate',
  'notifyUpdates',
  'runAt',
  'injectInto',
  'frameMode',
  'notifyErrors',
  'notes',
  'useOriginalIncludes',
  'useOriginalMatches',
  'useOriginalExcludes',
  'userIncludes',
  'userMatches',
  'userExcludes',
  'userConfig',
  'pinned',
  'perfBudget',
  'syncValues',
  'tags',
  'localLibraries',
]);

const LOCAL_ONLY_SCRIPT_SETTING_KEYS = new Set([
  'userModified',
  'mergeConflict',
  'syncLock',
  'allowBroadHostAccess',
  'sourceIdentityChanged',
  '_failedRequires',
  '_failedRequireErrors',
  '_registrationError',
  '_gmValueSyncConflictCount',
]);

const SRI_REQUIRE_UNPINNED_REQUIRE_ERROR = 'blocked: unpinned @require under SRI Require';
const HTTP_REQUIRE_UNPINNED_REQUIRE_ERROR = 'blocked: unpinned http @require; add a verifiable #sha256= integrity fragment';
const SYNC_FIRST_RUN_REGISTRATION_HOLD_MS = 90 * 1000;
const SYNC_FIRST_RUN_REGISTRATION_HOLD_STORAGE_KEY = 'syncFirstRunRegistrationHoldStartedAt';
const SYNC_FIRST_RUN_REGISTRATION_TIMEOUT_NOTIFICATION_ID = 'sync-first-run-registration-timeout';

function cloneScriptSettingValue(value: any) {
  if (value == null || typeof value !== 'object') return value;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (_) {
      // Fall through to JSON clone.
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return undefined;
  }
}

function cloneSyncSafeScriptSettings(settings: any) {
  if (!settings || typeof settings !== 'object') return {};
  const result: any = {};
  for (const [key, value] of Object.entries(settings)) {
    if (!SYNC_SAFE_SCRIPT_SETTING_KEYS.has(key) || LOCAL_ONLY_SCRIPT_SETTING_KEYS.has(key)) {
      continue;
    }
    result[key] = key === 'localLibraries' && typeof LocalLibraries !== 'undefined'
      ? LocalLibraries.normalizeLocalLibrarySnapshots(value)
      : cloneScriptSettingValue(value);
  }
  return result;
}

function mergeSyncedScriptSettings(localSettings: any, remoteSettings: any, options: any = {}) {
  return {
    ...((localSettings && typeof localSettings === 'object') ? localSettings : {}),
    ...cloneSyncSafeScriptSettings(remoteSettings),
    ...(options.mergeConflict ? { mergeConflict: true } : {})
  };
}

function sanitizeSyncScriptForEnvelope(script: any) {
  return {
    ...script,
    settings: cloneSyncSafeScriptSettings(script.settings)
  };
}

function sanitizeSyncEnvelopeForUpload(envelope: any) {
  const scripts = (envelope.scripts || []).map((script: any) => sanitizeSyncScriptForEnvelope(script));
  const valueBundles = sanitizeValueBundlesForUpload({ ...envelope, scripts });
  const sanitized = {
    ...envelope,
    scripts
  };
  delete sanitized.valueBundles;
  if (Object.keys(valueBundles).length > 0) sanitized.valueBundles = valueBundles;
  return sanitized;
}

function sanitizeValueBundlesForUpload(envelope: any) {
  const result: any = {};
  const scriptsById = new Map((envelope.scripts || []).map((script: any) => [script.id, script]));
  const sourceBundles = getSyncEnvelopeValueBundles(envelope);

  for (const [scriptId, bundle] of Object.entries(sourceBundles) as Array<[string, any]>) {
    const script = scriptsById.get(scriptId);
    if (!script || !shouldSyncScriptValuesForSync(script)) continue;
    if (!isPlainObject(bundle) || bundle.schema !== GM_VALUE_SYNC_SCHEMA || bundle.scriptId !== scriptId) continue;
    if (!isPlainObject(bundle.values)) continue;
    const rebuilt = buildGmValueSyncBundleForSync(script, bundle.values, {
      lastValueUpdatedAt: getValueBundleLastUpdatedAt(bundle),
      keyMetadata: getValueBundleKeyMetadata(bundle)
    });
    if (rebuilt.bundle) result[scriptId] = rebuilt.bundle;
  }

  return result;
}

function getSyncEnvelopeValueBundles(envelope: any) {
  return isPlainObject(envelope?.valueBundles) ? envelope.valueBundles : {};
}

function getValueBundleLastUpdatedAt(bundle: any) {
  if (!isPlainObject(bundle)) return undefined;
  const timestamp = Number(bundle.lastValueUpdatedAt);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined;
  return Math.floor(timestamp);
}

function summarizeValueBundleTimestampFreshness(bundles: any, lastSync: any) {
  const summary = {
    withTimestamps: 0,
    missingTimestamps: 0,
    olderThanLastSync: 0,
    newerThanLastSync: 0
  };
  const lastSyncTimestamp = Number(lastSync);
  const hasLastSync = Number.isFinite(lastSyncTimestamp) && lastSyncTimestamp > 0;
  for (const bundle of Object.values(bundles || {}) as any[]) {
    const updatedAt = getValueBundleLastUpdatedAt(bundle);
    if (!updatedAt) {
      summary.missingTimestamps++;
      continue;
    }
    summary.withTimestamps++;
    if (hasLastSync && updatedAt < lastSyncTimestamp) summary.olderThanLastSync++;
    if (hasLastSync && updatedAt > lastSyncTimestamp) summary.newerThanLastSync++;
  }
  return summary;
}

function setValueBundleMetadataKey(record: any, key: any, value: any) {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true
  });
}

function getValueBundleKeyMetadata(bundle: any) {
  if (!isPlainObject(bundle) || !isPlainObject(bundle.keyMetadata)) return undefined;
  const metadata = {};
  for (const [key, entry] of Object.entries(bundle.keyMetadata) as Array<[string, any]>) {
    const timestamp = isPlainObject(entry) ? Number(entry.updatedAt) : Number(entry);
    if (Number.isFinite(timestamp) && timestamp > 0) {
      setValueBundleMetadataKey(metadata, key, { updatedAt: Math.floor(timestamp) });
    }
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function getValueBundleKeyUpdatedAt(metadata: any, key: any) {
  if (!metadata) return null;
  const timestamp = Number(metadata[key]?.updatedAt);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return Math.floor(timestamp);
}

function createEmptyRemoteValueBundleSelection() {
  return { valueBundles: {}, ignored: 0, warnings: 0 };
}

function createEmptyRemoteValueBundleApplyResult() {
  return {
    applied: 0,
    skippedNonEmpty: 0,
    skippedUserModified: 0,
    skippedUnavailable: 0,
    failures: 0,
    writeFailureRetryReady: 0,
    preservedValueBundles: {},
    preservedRemoteNewer: 0,
    preservedLocalNewer: 0,
    preservedSameTimestamp: 0,
    preservedRemoteTimestampOnly: 0,
    preservedLocalTimestampOnly: 0,
    preservedTimestampUnknown: 0,
    preservedCandidateMergeReady: 0,
    preservedCandidateMergeManualReview: 0,
    preservedCandidateMergeUnavailable: 0,
    preservedCandidateResultKeyTotal: 0,
    preservedCandidateAutoSelectedKeyTotal: 0,
    preservedCandidateReviewKeyTotal: 0,
    preservedCandidateAcceptedResultKeyTotal: 0,
    preservedCandidateBlockedSameTimestamp: 0,
    preservedCandidateBlockedUnknownTimestamp: 0,
    preservedCandidateBlockedOneSidedTimestamp: 0,
    preservedCandidateBlockedUnavailable: 0,
    preservedCandidateBlockedNoCandidateKeys: 0
  };
}

function summarizeRemoteValueBundleApplyResult(result: any) {
  const summary = {
    applied: result.applied,
    preserved: Object.keys(result.preservedValueBundles).length,
    conflictBlocked: result.skippedNonEmpty + result.skippedUserModified,
    skippedNonEmpty: result.skippedNonEmpty,
    skippedUserModified: result.skippedUserModified,
    skippedUnavailable: result.skippedUnavailable,
    failures: result.failures,
    ...(result.writeFailureRetryReady > 0
      ? { writeFailureRetryReady: result.writeFailureRetryReady }
      : {}),
    preservedRemoteNewer: result.preservedRemoteNewer,
    preservedLocalNewer: result.preservedLocalNewer,
    preservedSameTimestamp: result.preservedSameTimestamp,
    preservedRemoteTimestampOnly: result.preservedRemoteTimestampOnly,
    preservedLocalTimestampOnly: result.preservedLocalTimestampOnly,
    preservedTimestampUnknown: result.preservedTimestampUnknown,
    preservedCandidateMergeReady: result.preservedCandidateMergeReady,
    preservedCandidateMergeManualReview: result.preservedCandidateMergeManualReview,
    preservedCandidateMergeUnavailable: result.preservedCandidateMergeUnavailable,
    preservedCandidateResultKeyTotal: result.preservedCandidateResultKeyTotal,
    preservedCandidateAutoSelectedKeyTotal: result.preservedCandidateAutoSelectedKeyTotal,
    preservedCandidateReviewKeyTotal: result.preservedCandidateReviewKeyTotal,
    preservedCandidateAcceptedResultKeyTotal: result.preservedCandidateAcceptedResultKeyTotal,
    preservedCandidateBlockedSameTimestamp: result.preservedCandidateBlockedSameTimestamp,
    preservedCandidateBlockedUnknownTimestamp: result.preservedCandidateBlockedUnknownTimestamp,
    preservedCandidateBlockedOneSidedTimestamp: result.preservedCandidateBlockedOneSidedTimestamp,
    preservedCandidateBlockedUnavailable: result.preservedCandidateBlockedUnavailable,
    preservedCandidateBlockedNoCandidateKeys: result.preservedCandidateBlockedNoCandidateKeys
  };
  return Object.values(summary).some(value => value > 0) ? summary : null;
}

function selectApplicableRemoteValueBundles(remote: any, targetScripts: any = []) {
  const sourceBundles = getSyncEnvelopeValueBundles(remote);
  if (Object.keys(sourceBundles).length === 0) return createEmptyRemoteValueBundleSelection();

  const result: any = createEmptyRemoteValueBundleSelection();
  const scriptsById = new Map(targetScripts.map((script: any) => [script.id, script]));

  for (const [scriptId, bundle] of Object.entries(sourceBundles) as Array<[string, any]>) {
    const script = scriptsById.get(scriptId);
    if (!script || !shouldSyncScriptValuesForSync(script)) {
      result.ignored++;
      continue;
    }
    if (!isPlainObject(bundle) || bundle.schema !== GM_VALUE_SYNC_SCHEMA || bundle.scriptId !== scriptId) {
      result.ignored++;
      continue;
    }
    if (!isPlainObject(bundle.values)) {
      result.ignored++;
      continue;
    }

    const rebuilt = buildGmValueSyncBundleForSync(script, bundle.values, {
      lastValueUpdatedAt: getValueBundleLastUpdatedAt(bundle),
      keyMetadata: getValueBundleKeyMetadata(bundle)
    });
    result.warnings += (Object.values(rebuilt.warningCounts) as any[])
      .reduce((sum, count) => sum + (Number(count) || 0), 0);
    if (rebuilt.bundle) {
      result.valueBundles[scriptId] = rebuilt.bundle;
    } else {
      result.ignored++;
    }
  }

  return result;
}

function countRemoteValueBundlesApplyReady(selection: any, local: any) {
  let ready = 0;
  let conflictBlocked = 0;
  let candidateMergeReady = 0;
  let candidateMergeManualReview = 0;
  let candidateMergeUnavailable = 0;
  let mergeSimulationReadyPreviewOnlyResultKeyTotal = 0;
  let mergeSimulationManualReviewResultKeyTotal = 0;
  let mergeSimulationUnavailableResultKeyTotal = 0;
  let candidateMergeBlockedSameTimestamp = 0;
  let candidateMergeBlockedUnknownTimestamp = 0;
  let candidateMergeBlockedOneSidedTimestamp = 0;
  let candidateMergeBlockedUnavailable = 0;
  let candidateMergeBlockedNoCandidateKeys = 0;
  let candidateResultKeyTotal = 0;
  let candidateAutoSelectedKeyTotal = 0;
  let candidateReviewKeyTotal = 0;
  let candidateAcceptedResultKeyTotal = 0;
  const conflicts: any = [];
  const localBundles = getSyncEnvelopeValueBundles(local);
  const localScriptIds = new Set(
    Array.isArray(local?.scripts) ? local.scripts.map((script: any) => script.id) : []
  );

  const addConflict = (reason: any, remoteBundle: any, localBundle: any) => {
    conflictBlocked++;
    const preview = buildValueBundleConflictPreview(reason, remoteBundle, localBundle);
    const candidateResultKeyCount = preview.candidateResultKeyCount ?? 0;
    if (preview.candidateMergeSimulation === 'ready-preview-only') {
      candidateMergeReady++;
      candidateAcceptedResultKeyTotal += candidateResultKeyCount;
      mergeSimulationReadyPreviewOnlyResultKeyTotal += candidateResultKeyCount;
    } else if (preview.candidateMergeSimulation === 'unavailable') {
      candidateMergeUnavailable++;
      mergeSimulationUnavailableResultKeyTotal += candidateResultKeyCount;
    } else {
      candidateMergeManualReview++;
      mergeSimulationManualReviewResultKeyTotal += candidateResultKeyCount;
    }
    if (preview.candidateMergeBlockReason === 'same-timestamp') candidateMergeBlockedSameTimestamp++;
    else if (preview.candidateMergeBlockReason === 'unknown-timestamp') candidateMergeBlockedUnknownTimestamp++;
    else if (preview.candidateMergeBlockReason === 'one-sided-timestamp') candidateMergeBlockedOneSidedTimestamp++;
    else if (preview.candidateMergeBlockReason === 'local-bundle-unavailable') candidateMergeBlockedUnavailable++;
    else if (preview.candidateMergeBlockReason === 'no-candidate-keys') candidateMergeBlockedNoCandidateKeys++;
    candidateResultKeyTotal += candidateResultKeyCount;
    candidateAutoSelectedKeyTotal += preview.candidateAutoSelectedKeyCount ?? 0;
    candidateReviewKeyTotal += preview.candidateReviewKeyCount ?? 0;
    if (conflicts.length < 20) {
      conflicts.push(preview);
    }
  };

  for (const [scriptId, remoteBundle] of Object.entries(selection.valueBundles)) {
    const localBundle = localBundles[scriptId];
    if (!isPlainObject(localBundle) && localScriptIds.has(scriptId)) {
      addConflict('local-bundle-unavailable', remoteBundle, localBundle);
    } else if (!isPlainObject(localBundle) || Number(localBundle.keyCount) === 0) {
      ready++;
    } else {
      addConflict('local-values-present', remoteBundle, localBundle);
    }
  }

  return {
    ready,
    conflictBlocked,
    conflicts,
    candidateMergeReady,
    candidateMergeManualReview,
    candidateMergeUnavailable,
    mergeSimulationReadyPreviewOnlyResultKeyTotal,
    mergeSimulationManualReviewResultKeyTotal,
    mergeSimulationUnavailableResultKeyTotal,
    candidateMergeBlockedSameTimestamp,
    candidateMergeBlockedUnknownTimestamp,
    candidateMergeBlockedOneSidedTimestamp,
    candidateMergeBlockedUnavailable,
    candidateMergeBlockedNoCandidateKeys,
    candidateResultKeyTotal,
    candidateAutoSelectedKeyTotal,
    candidateReviewKeyTotal,
    candidateAcceptedResultKeyTotal
  };
}

function safeValueBundleMetric(value: any) {
  return Math.max(0, Number(value) || 0);
}

function compareValueBundleLastWrite(localTimestamp: any, remoteTimestamp: any) {
  if (localTimestamp && remoteTimestamp) {
    if (localTimestamp > remoteTimestamp) return 'local-newer';
    if (remoteTimestamp > localTimestamp) return 'remote-newer';
    return 'same';
  }
  if (localTimestamp) return 'local-timestamp-only';
  if (remoteTimestamp) return 'remote-timestamp-only';
  return 'unknown';
}

function countPreservedValueBundleTimestampHint(result: any, localBundle: any, remoteBundle: any) {
  const localLastValueUpdatedAt = getValueBundleLastUpdatedAt(localBundle) ?? null;
  const remoteLastValueUpdatedAt = getValueBundleLastUpdatedAt(remoteBundle) ?? null;
  const hint = compareValueBundleLastWrite(localLastValueUpdatedAt, remoteLastValueUpdatedAt);
  if (hint === 'remote-newer') result.preservedRemoteNewer++;
  else if (hint === 'local-newer') result.preservedLocalNewer++;
  else if (hint === 'same') result.preservedSameTimestamp++;
  else if (hint === 'remote-timestamp-only') result.preservedRemoteTimestampOnly++;
  else if (hint === 'local-timestamp-only') result.preservedLocalTimestampOnly++;
  else result.preservedTimestampUnknown++;
}

function countPreservedValueBundleCandidateMerge(result: any, localBundle: any, remoteBundle: any) {
  const hasLocalBundle = isPlainObject(localBundle);
  const keyCounts = hasLocalBundle
    ? countValueBundleKeyOverlap(
      localBundle.values,
      remoteBundle.values,
      getValueBundleKeyMetadata(localBundle),
      getValueBundleKeyMetadata(remoteBundle)
    )
    : null;
  const candidateMerge = buildValueBundleCandidateMergePlan(keyCounts);
  const candidateGate = buildValueBundleCandidateMergeGate(keyCounts, candidateMerge);
  const candidateResult = buildValueBundleCandidateMergeResult(keyCounts, candidateMerge, candidateGate);
  if (candidateGate.gate === 'ready') result.preservedCandidateMergeReady++;
  else if (candidateGate.gate === 'unavailable') result.preservedCandidateMergeUnavailable++;
  else result.preservedCandidateMergeManualReview++;
  if (candidateGate.blockReason === 'same-timestamp') result.preservedCandidateBlockedSameTimestamp++;
  else if (candidateGate.blockReason === 'unknown-timestamp') result.preservedCandidateBlockedUnknownTimestamp++;
  else if (candidateGate.blockReason === 'one-sided-timestamp') result.preservedCandidateBlockedOneSidedTimestamp++;
  else if (candidateGate.blockReason === 'local-bundle-unavailable') result.preservedCandidateBlockedUnavailable++;
  else if (candidateGate.blockReason === 'no-candidate-keys') result.preservedCandidateBlockedNoCandidateKeys++;
  result.preservedCandidateResultKeyTotal += candidateResult.resultKeyCount ?? 0;
  result.preservedCandidateAutoSelectedKeyTotal += candidateResult.autoSelectedKeyCount ?? 0;
  result.preservedCandidateReviewKeyTotal += candidateResult.reviewKeyCount ?? 0;
  if (candidateGate.gate === 'ready') {
    result.preservedCandidateAcceptedResultKeyTotal += candidateResult.resultKeyCount ?? 0;
  }
}

function preserveRemoteValueBundle(result: any, scriptId: any, remoteBundle: any, localBundle: any) {
  result.preservedValueBundles[scriptId] = remoteBundle;
  countPreservedValueBundleTimestampHint(result, localBundle, remoteBundle);
  countPreservedValueBundleCandidateMerge(result, localBundle, remoteBundle);
}

function buildValueBundleConflictPreview(reason: any, remoteBundle: any, localBundle: any) {
  const hasLocalBundle = isPlainObject(localBundle);
  const localKeyMetadata = hasLocalBundle ? getValueBundleKeyMetadata(localBundle) : undefined;
  const remoteKeyMetadata = getValueBundleKeyMetadata(remoteBundle);
  const keyCounts = hasLocalBundle
    ? countValueBundleKeyOverlap(localBundle.values, remoteBundle.values, localKeyMetadata, remoteKeyMetadata)
    : null;
  const localLastValueUpdatedAt = hasLocalBundle
    ? getValueBundleLastUpdatedAt(localBundle) ?? null
    : null;
  const remoteLastValueUpdatedAt = getValueBundleLastUpdatedAt(remoteBundle) ?? null;
  const candidateMerge = buildValueBundleCandidateMergePlan(keyCounts);
  const candidateGate = buildValueBundleCandidateMergeGate(keyCounts, candidateMerge);
  const candidateResult = buildValueBundleCandidateMergeResult(keyCounts, candidateMerge, candidateGate);
  return {
    reason,
    localKeyCount: hasLocalBundle ? safeValueBundleMetric(localBundle.keyCount) : null,
    remoteKeyCount: safeValueBundleMetric(remoteBundle.keyCount),
    localBytes: hasLocalBundle ? safeValueBundleMetric(localBundle.bytes) : null,
    remoteBytes: safeValueBundleMetric(remoteBundle.bytes),
    overlappingKeyCount: keyCounts?.overlapping ?? null,
    localOnlyKeyCount: keyCounts?.localOnly ?? null,
    remoteOnlyKeyCount: keyCounts?.remoteOnly ?? null,
    localLastValueUpdatedAt,
    remoteLastValueUpdatedAt,
    lastWriteHint: compareValueBundleLastWrite(localLastValueUpdatedAt, remoteLastValueUpdatedAt),
    overlappingRemoteNewerKeyCount: keyCounts?.overlappingRemoteNewer ?? null,
    overlappingLocalNewerKeyCount: keyCounts?.overlappingLocalNewer ?? null,
    overlappingSameTimestampKeyCount: keyCounts?.overlappingSameTimestamp ?? null,
    overlappingRemoteTimestampOnlyKeyCount: keyCounts?.overlappingRemoteTimestampOnly ?? null,
    overlappingLocalTimestampOnlyKeyCount: keyCounts?.overlappingLocalTimestampOnly ?? null,
    overlappingUnknownTimestampKeyCount: keyCounts?.overlappingUnknownTimestamp ?? null,
    candidateMergePlan: candidateMerge.plan,
    candidateRemoteKeyCount: candidateMerge.remoteKeyCount,
    candidateLocalKeyCount: candidateMerge.localKeyCount,
    candidateSameTimestampKeyCount: candidateMerge.sameTimestampKeyCount,
    candidateManualKeyCount: candidateMerge.manualKeyCount,
    candidateOneSidedTimestampKeyCount: candidateGate.oneSidedTimestampKeyCount,
    candidateResultKeyCount: candidateResult.resultKeyCount,
    candidateAutoSelectedKeyCount: candidateResult.autoSelectedKeyCount,
    candidateReviewKeyCount: candidateResult.reviewKeyCount,
    candidateMergeGate: candidateGate.gate,
    candidateMergeBlockReason: candidateGate.blockReason,
    candidateMergeSimulation: getValueBundleCandidateMergeSimulation(candidateGate.gate)
  };
}

function buildValueBundleCandidateMergePlan(keyCounts: any) {
  if (!keyCounts) {
    return {
      plan: 'unavailable',
      remoteKeyCount: null,
      localKeyCount: null,
      sameTimestampKeyCount: null,
      manualKeyCount: null
    };
  }
  const remoteKeyCount = keyCounts.remoteOnly
    + keyCounts.overlappingRemoteNewer
    + keyCounts.overlappingRemoteTimestampOnly;
  const localKeyCount = keyCounts.localOnly
    + keyCounts.overlappingLocalNewer
    + keyCounts.overlappingLocalTimestampOnly;
  const sameTimestampKeyCount = keyCounts.overlappingSameTimestamp;
  const manualKeyCount = keyCounts.overlappingUnknownTimestamp;
  let plan = 'manual-review';
  if (manualKeyCount > 0 || sameTimestampKeyCount > 0) plan = 'manual-review';
  else if (remoteKeyCount > 0 && localKeyCount > 0) plan = 'timestamp-guided';
  else if (remoteKeyCount > 0) plan = 'remote-preferred';
  else if (localKeyCount > 0) plan = 'local-preferred';
  return { plan, remoteKeyCount, localKeyCount, sameTimestampKeyCount, manualKeyCount };
}

function isValueBundleCandidateMergeAcceptanceReady(keyCounts: any, candidateMerge: any, oneSidedTimestampKeyCount: any) {
  const candidateKeyCount = (candidateMerge.remoteKeyCount ?? 0) + (candidateMerge.localKeyCount ?? 0);
  const resultKeyCount = keyCounts.localOnly + keyCounts.remoteOnly + keyCounts.overlapping;
  const reviewKeyCount = (candidateMerge.sameTimestampKeyCount ?? 0)
    + (candidateMerge.manualKeyCount ?? 0)
    + oneSidedTimestampKeyCount;
  return candidateKeyCount > 0
    && candidateKeyCount === resultKeyCount
    && reviewKeyCount === 0;
}

function buildValueBundleCandidateMergeGate(keyCounts: any, candidateMerge: any) {
  if (!keyCounts) {
    return {
      gate: 'unavailable',
      blockReason: 'local-bundle-unavailable',
      oneSidedTimestampKeyCount: null
    };
  }
  const oneSidedTimestampKeyCount = keyCounts.overlappingRemoteTimestampOnly
    + keyCounts.overlappingLocalTimestampOnly;
  if (candidateMerge.manualKeyCount && candidateMerge.manualKeyCount > 0) {
    return { gate: 'manual-review', blockReason: 'unknown-timestamp', oneSidedTimestampKeyCount };
  }
  if (candidateMerge.sameTimestampKeyCount && candidateMerge.sameTimestampKeyCount > 0) {
    return { gate: 'manual-review', blockReason: 'same-timestamp', oneSidedTimestampKeyCount };
  }
  if (oneSidedTimestampKeyCount > 0) {
    return { gate: 'manual-review', blockReason: 'one-sided-timestamp', oneSidedTimestampKeyCount };
  }
  const candidateKeyCount = (candidateMerge.remoteKeyCount ?? 0) + (candidateMerge.localKeyCount ?? 0);
  if (candidateKeyCount <= 0) {
    return { gate: 'manual-review', blockReason: 'no-candidate-keys', oneSidedTimestampKeyCount };
  }
  if (!isValueBundleCandidateMergeAcceptanceReady(keyCounts, candidateMerge, oneSidedTimestampKeyCount)) {
    return { gate: 'manual-review', blockReason: 'unknown-timestamp', oneSidedTimestampKeyCount };
  }
  return { gate: 'ready', blockReason: 'none', oneSidedTimestampKeyCount };
}

function getValueBundleCandidateMergeSimulation(gate: any) {
  if (gate === 'ready') return 'ready-preview-only';
  if (gate === 'unavailable') return 'unavailable';
  return 'manual-review';
}

function buildValueBundleCandidateMergeResult(keyCounts: any, candidateMerge: any, candidateGate: any) {
  if (!keyCounts) {
    return { resultKeyCount: null, autoSelectedKeyCount: null, reviewKeyCount: null };
  }
  const resultKeyCount = keyCounts.localOnly + keyCounts.remoteOnly + keyCounts.overlapping;
  const autoSelectedKeyCount = (candidateMerge.remoteKeyCount ?? 0) + (candidateMerge.localKeyCount ?? 0);
  const reviewKeyCount = (candidateMerge.sameTimestampKeyCount ?? 0)
    + (candidateMerge.manualKeyCount ?? 0)
    + (candidateGate.oneSidedTimestampKeyCount ?? 0);
  return { resultKeyCount, autoSelectedKeyCount, reviewKeyCount };
}

function countValueBundleKeyOverlap(localValues: any, remoteValues: any, localKeyMetadata: any, remoteKeyMetadata: any) {
  const localKeys = new Set(isPlainObject(localValues) ? Object.keys(localValues) : []);
  const remoteKeys = new Set(isPlainObject(remoteValues) ? Object.keys(remoteValues) : []);
  let overlapping = 0;
  let localOnly = 0;
  let remoteOnly = 0;
  let overlappingRemoteNewer = 0;
  let overlappingLocalNewer = 0;
  let overlappingSameTimestamp = 0;
  let overlappingRemoteTimestampOnly = 0;
  let overlappingLocalTimestampOnly = 0;
  let overlappingUnknownTimestamp = 0;

  for (const key of localKeys) {
    if (remoteKeys.has(key)) {
      overlapping++;
      const hint = compareValueBundleLastWrite(
        getValueBundleKeyUpdatedAt(localKeyMetadata, key),
        getValueBundleKeyUpdatedAt(remoteKeyMetadata, key)
      );
      if (hint === 'remote-newer') overlappingRemoteNewer++;
      else if (hint === 'local-newer') overlappingLocalNewer++;
      else if (hint === 'same') overlappingSameTimestamp++;
      else if (hint === 'remote-timestamp-only') overlappingRemoteTimestampOnly++;
      else if (hint === 'local-timestamp-only') overlappingLocalTimestampOnly++;
      else overlappingUnknownTimestamp++;
    } else {
      localOnly++;
    }
  }
  for (const key of remoteKeys) {
    if (!localKeys.has(key)) remoteOnly++;
  }

  return {
    overlapping,
    localOnly,
    remoteOnly,
    overlappingRemoteNewer,
    overlappingLocalNewer,
    overlappingSameTimestamp,
    overlappingRemoteTimestampOnly,
    overlappingLocalTimestampOnly,
    overlappingUnknownTimestamp
  };
}

async function applyRemoteValueBundlesWhenLocalEmpty(selection: any, currentScripts: any = [], localValueBundles: any = {}) {
  const result = createEmptyRemoteValueBundleApplyResult();
  const bundles = Object.entries(selection.valueBundles) as Array<[string, any]>;
  if (bundles.length === 0) return result;

  if (
    typeof ScriptValues === 'undefined' ||
    typeof ScriptValues?.getAll !== 'function' ||
    typeof ScriptValues?.setAll !== 'function'
  ) {
    result.skippedUnavailable = bundles.length;
    for (const [scriptId, bundle] of bundles) {
      preserveRemoteValueBundle(result, scriptId, bundle, localValueBundles[scriptId]);
    }
    return result;
  }

  const scriptsById = new Map(currentScripts.map((script: any) => [script.id, script]));

  for (const [scriptId, bundle] of bundles) {
    const currentScript: any = scriptsById.get(scriptId);
    const localBundle = localValueBundles[scriptId];
    if (currentScript?.settings?.userModified) {
      result.skippedUserModified++;
      preserveRemoteValueBundle(result, scriptId, bundle, localBundle);
      continue;
    }

    let localValues: any = null;
    try {
      localValues = await ScriptValues.getAll(scriptId);
    } catch (_) {
      result.failures++;
      preserveRemoteValueBundle(result, scriptId, bundle, localBundle);
      continue;
    }

    if (Object.keys(localValues || {}).length > 0) {
      result.skippedNonEmpty++;
      preserveRemoteValueBundle(result, scriptId, bundle, localBundle);
      continue;
    }

    try {
      await ScriptValues.setAll(scriptId, bundle.values);
      result.applied++;
    } catch (_) {
      result.failures++;
      result.writeFailureRetryReady++;
      preserveRemoteValueBundle(result, scriptId, bundle, localBundle);
    }
  }

  return result;
}

async function markSyncEncryptionEstablished(settings: any) {
  if (settings?.syncEncryptionEnabled && !settings?.syncEncryptionEstablished) {
    try { await SettingsManager.set('syncEncryptionEstablished', true); } catch (_) { /* best effort */ }
  }
}

async function readSyncEnvelopeFromRemote(remoteEnvelope: any, settings: any) {
  if (typeof SyncCrypto !== 'undefined' && typeof SyncCrypto.decryptSyncEnvelope === 'function') {
    const decrypted = await SyncCrypto.decryptSyncEnvelope(remoteEnvelope, settings);
    if (
      remoteEnvelope &&
      typeof SyncCrypto.isEncryptedSyncEnvelope === 'function' &&
      SyncCrypto.isEncryptedSyncEnvelope(remoteEnvelope)
    ) {
      await markSyncEncryptionEstablished(settings);
    }
    return decrypted;
  }
  return remoteEnvelope || null;
}

async function prepareSyncEnvelopeForRemoteUpload(envelope: any, settings: any) {
  const sanitized = sanitizeSyncEnvelopeForUpload(envelope);
  if (typeof SyncCrypto !== 'undefined' && typeof SyncCrypto.prepareSyncEnvelopeForUpload === 'function') {
    return await SyncCrypto.prepareSyncEnvelopeForUpload(sanitized, settings);
  }
  return sanitized;
}

// Load debug setting on startup (async — logs before this completes go to console.log)
(async () => {
  try {
    const data = await chrome.storage.local.get('settings');
    _debugEnabled = data.settings?.debugMode === true;
  } catch {}
})();

// ============================================================================
// Session State — persist GM_* runtime maps to chrome.storage.session so
// onclose / onclick / onclose callbacks survive MV3 service-worker termination.
// chrome.storage.session is in-memory but persists across SW restarts within
// the browser session, which is exactly the GM_openInTab / GM_notification
// / GM_download callback lifetime.
// ============================================================================
const SessionState = {
  _NC_KEY: 'sessionNotifCallbacks',
  _OTT_KEY: 'sessionOpenTabTrackers',
  _AWT_KEY: 'sessionAudioWatchedTabs',
  _PD_KEY: 'sessionPendingDownloads',
  _HYDRATE_TIMEOUT_MS: 5_000,
  _hydrated: false,
  async hydrate() {
    if (this._hydrated) return;
    this._hydrated = true;
    if (!chrome?.storage?.session) return;
    let timeoutId: any = null;
    try {
      const data: any = await Promise.race([
        chrome.storage.session.get([this._NC_KEY, this._OTT_KEY, this._AWT_KEY, this._PD_KEY]),
        new Promise(resolve => {
          timeoutId = setTimeout(() => resolve(null), this._HYDRATE_TIMEOUT_MS);
        }),
      ]);
      if (!data || typeof data !== 'object') return;
      const nc = data[this._NC_KEY];
      if (nc && typeof nc === 'object') {
        if (!self._notifCallbacks) self._notifCallbacks = new Map();
        for (const [k, v] of Object.entries(nc)) self._notifCallbacks.set(k, v);
      }
      const ott = data[this._OTT_KEY];
      if (ott && typeof ott === 'object') {
        if (!self._openTabTrackers) self._openTabTrackers = new Map();
        for (const [k, v] of Object.entries(ott)) self._openTabTrackers.set(Number(k), v);
      }
      const awt = data[this._AWT_KEY];
      if (Array.isArray(awt)) {
        if (!self._audioWatchedTabs) self._audioWatchedTabs = new Set();
        for (const key of awt) {
          if (typeof key === 'string' && key) self._audioWatchedTabs.add(key);
        }
      }
      const pd = data[this._PD_KEY];
      if (pd && typeof pd === 'object') {
        if (!self._pendingDownloads) self._pendingDownloads = new Map();
        for (const [k, v] of Object.entries(pd)) {
          const id = Number(k);
          if (Number.isFinite(id) && v && typeof v === 'object') {
            self._pendingDownloads.set(id, v);
          }
        }
      }
    } catch (_) { /* session storage unavailable */ }
    finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
  },
  _persist(key: any, source: any) {
    if (!chrome?.storage?.session) return;
    let value;
    if (source instanceof Map) value = Object.fromEntries(source);
    else if (source instanceof Set) value = [...source];
    else value = source ?? null;
    chrome.storage.session.set({ [key]: value }).catch(() => {});
  },
  persistNotifCallbacks() { this._persist(this._NC_KEY, self._notifCallbacks); },
  persistOpenTabTrackers() { this._persist(this._OTT_KEY, self._openTabTrackers); },
  persistAudioWatchedTabs() { this._persist(this._AWT_KEY, self._audioWatchedTabs); },
  persistPendingDownloads() { this._persist(this._PD_KEY, self._pendingDownloads); },
};
self.SessionState = SessionState;

// ============================================================================
// Userscript Parser
// ============================================================================

function isPlainObject(value: any) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: any) {
  return Array.isArray(value) && value.every(entry => typeof entry === 'string');
}

function isHeaderConditionArray(value: any) {
  if (!Array.isArray(value)) return false;
  return value.every(entry => {
    if (!isPlainObject(entry)) return false;
    if (typeof entry.header !== 'string' || !entry.header.trim()) return false;
    if (entry.values != null && !isStringArray(entry.values)) return false;
    if (entry.excludedValues != null && !isStringArray(entry.excludedValues)) return false;
    return true;
  });
}

function isHeaderMutationMap(value: any) {
  if (!isPlainObject(value)) return false;
  return Object.entries(value).every(([name, headerValue]) => (
    !!name.trim() && (headerValue === null || typeof headerValue === 'string')
  ));
}

function isRedirectTarget(value: any) {
  if (typeof value === 'string') return value.length > 0;
  if (!isPlainObject(value)) return false;
  return typeof value.url === 'string' || typeof value.regexSubstitution === 'string';
}

function isValidWebRequestAction(action: any) {
  if (typeof action === 'string') return action.length > 0;
  if (!isPlainObject(action)) return false;
  if (typeof action.cancel === 'boolean') return true;
  if (action.redirect != null && isRedirectTarget(action.redirect)) return true;
  if (action.setRequestHeaders != null && isHeaderMutationMap(action.setRequestHeaders)) return true;
  if (action.setResponseHeaders != null && isHeaderMutationMap(action.setResponseHeaders)) return true;
  return false;
}

function isValidWebRequestSelector(selector: any) {
  if (selector == null || typeof selector === 'string') return true;
  if (!isPlainObject(selector)) return false;
  if (selector.include != null && !isStringArray(selector.include)) return false;
  if (selector.exclude != null && !isStringArray(selector.exclude)) return false;
  if (selector.responseHeaders != null && !isHeaderConditionArray(selector.responseHeaders)) return false;
  if (selector.excludedResponseHeaders != null && !isHeaderConditionArray(selector.excludedResponseHeaders)) return false;
  return true;
}

function parseAntifeatureDirective(value: any, locale: any = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\S+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;

  return {
    type: String(match[1] || '').toLowerCase(),
    description: String(match[2] || '').trim(),
    locale
  };
}

function parseBooleanDirective(value: any) {
  if (!value) return true;
  const normalized = String(value).trim().toLowerCase();
  return !['0', 'false', 'no', 'off', 'disabled'].includes(normalized);
}

// ScriptCat-compatible curated bundles. Keep this parser deliberately small:
// the bundle header is metadata only, while every member is parsed and
// installed through the normal userscript trust path below.
function parseUserSubscribe(code: any, baseUrl: any = '') {
  const match = String(code || '').match(/\/\/\s*==UserSubscribe==([\s\S]*?)\/\/\s*==\/UserSubscribe==/);
  if (!match) return { error: 'No UserSubscribe metadata block found.' };
  if (baseUrl) {
    try {
      if (new URL(baseUrl).protocol !== 'https:') return { error: 'Subscription sources must use https' };
    } catch (_) {
      return { error: 'Invalid subscription source URL' };
    }
  }
  const meta: any = {
    name: 'Script subscription',
    description: '',
    version: '1.0.0',
    author: '',
    connect: [],
    scriptUrl: [],
    metaBlock: match[0]
  };
  const seenUrls = new Set();
  for (const line of (match[1] || '').split('\n')) {
    const directive = line.match(/\/\/\s*@([\w-]+)(?:\s+(.*))?/);
    if (!directive) continue;
    const key = (directive[1] || '').trim();
    const value = (directive[2] || '').trim();
    if (['name', 'description', 'version', 'author'].includes(key)) {
      meta[key] = value;
      continue;
    }
    if (key === 'connect') {
      if (value) meta.connect.push(...value.split(',').map(part => part.trim()).filter(Boolean));
      continue;
    }
    if (key !== 'scriptUrl' && key !== 'script-url') continue;
    if (!value) continue;
    let resolved;
    try { resolved = new URL(value, baseUrl || undefined); } catch (_) {
      return { error: `Invalid subscription script URL: ${value}` };
    }
    if (resolved.protocol !== 'https:') return { error: 'Subscription script URLs must use https' };
    resolved.hash = '';
    const url = resolved.href;
    if (!seenUrls.has(url)) {
      seenUrls.add(url);
      meta.scriptUrl.push(url);
    }
  }
  if (meta.scriptUrl.length === 0) return { error: 'Subscription must declare at least one @scriptUrl' };
  return { meta, code, metaBlock: match[0] };
}

/**
 * Parse a userscript's metadata block and extract all supported directives.
 * @param {string} code - The full userscript source code
 * @returns {{ meta?: Object, code?: string, metaBlock?: string, error?: string }} Parsed result or error
 */
function parseUserscript(code: any) {
  if (typeof code !== 'string') return { error: 'Script source must be a string.' };
  const metaBlockMatch: any = code.match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/);
  if (!metaBlockMatch) {
    return { error: 'No metadata block found. Scripts must include ==UserScript== header.' };
  }

  const meta: any = {
    name: 'Unnamed Script',
    namespace: 'scriptvault',
    version: '1.0.0',
    description: '',
    author: '',
    match: [],
    include: [],
    exclude: [],
    excludeMatch: [],
    // Phase 39.11 — TM #2784 top-level origin gates.
    matchTop: [],
    excludeTop: [],
    grant: [],
    require: [],
    requireProvenance: [],
    requireIdentity: [],
    requireProvenanceByUrl: Object.create(null),
    requireIdentityByUrl: Object.create(null),
    resource: Object.create(null),
    'run-at': 'document-idle',
    noframes: false,
    icon: '',
    icon64: '',
    homepage: '',
    homepageURL: '',
    website: '',
    source: '',
    updateURL: '',
    downloadURL: '',
    supportURL: '',
    connect: [],
    antifeature: [],
    unwrap: false,
    'inject-into': 'auto',
    module: '',
    sandbox: '',
    tag: [],
    'run-in': '',
    'top-level-await': false,
    license: '',
    copyright: '',
    contributionURL: '',
    compatible: [],
    incompatible: [],
    webRequest: null,
    config: [],
    priority: 0,
    weight: 0,
    background: false,
    isolationCookie: false,
    crontab: ''
  };

  const metaBlock = metaBlockMatch[1];
  const lines = metaBlock.split('\n');

  for (const line of lines) {
    const match: any = line.match(/\/\/\s*@(\S+)(?:\s+(.*))?/);
    if (!match) continue;

    const key = match[1].trim();
    const value = (match[2] || '').trim();

    switch (key) {
      case 'name':
      case 'namespace':
      case 'version':
      case 'description':
      case 'author':
      case 'icon':
      case 'icon64':
      case 'homepage':
      case 'homepageURL':
      case 'website':
      case 'source':
      case 'updateURL':
      case 'downloadURL':
      case 'supportURL':
      case 'run-at':
      case 'inject-into':
      case 'module':
      case 'sandbox':
      case 'run-in':
      case 'license':
      case 'copyright':
      case 'contributionURL':
      case 'crontab':
        meta[key] = value;
        break;
      case 'match':
      case 'include':
      case 'exclude':
      case 'exclude-match':
      case 'excludeMatch':
      case 'grant':
      case 'require':
      case 'require-provenance':
      case 'requireProvenance':
      case 'require-identity':
      case 'requireIdentity':
      case 'connect':
      case 'tag':
      case 'compatible':
      case 'incompatible':
      // Phase 39.11 — TM #2784 top-level-origin gates. Patterns are matched
      // against window.top.location.href at runtime (in the wrapper). Same
      // array-directive shape as @match/@exclude so the parser, dedup, and
      // splittable-comma conveniences carry over.
      case 'match-top':
      case 'matchTop':
      case 'exclude-top':
      case 'excludeTop':
        const arrayKey = key === 'exclude-match' ? 'excludeMatch'
          : key === 'match-top' ? 'matchTop'
          : key === 'exclude-top' ? 'excludeTop'
          : key === 'require-provenance' ? 'requireProvenance'
          : key === 'require-identity' ? 'requireIdentity'
          : key;
        if (!meta[arrayKey]) meta[arrayKey] = [];
        if (value) {
          // Phase 36.6 — comma-separated convenience syntax for URL pattern
          // directives. Commas are not valid in match patterns per Chrome's
          // match syntax, so we can split safely. `tag` keeps raw values so
          // multi-word tags like `// @tag my util` stay intact.
          const splittable =
            arrayKey === 'match' ||
            arrayKey === 'include' ||
            arrayKey === 'exclude' ||
            arrayKey === 'excludeMatch' ||
            arrayKey === 'matchTop' ||
            arrayKey === 'excludeTop' ||
            arrayKey === 'requireProvenance' ||
            arrayKey === 'requireIdentity' ||
            arrayKey === 'connect';
          if (splittable && value.includes(',')) {
            for (const part of value.split(',')) {
              const trimmed = part.trim();
              if (trimmed) meta[arrayKey].push(trimmed);
            }
          } else {
            meta[arrayKey].push(value);
          }
        }
        break;
      case 'antifeature': {
        const parsedAntifeature: any = parseAntifeatureDirective(value);
        if (parsedAntifeature) meta.antifeature.push(parsedAntifeature);
        break;
      }
      case 'resource':
        const resourceMatch: any = value.match(/^(\S+)\s+(.+)$/);
        if (resourceMatch) {
          meta.resource[resourceMatch[1]] = resourceMatch[2];
        }
        break;
      case 'noframes':
        meta.noframes = true;
        break;
      case 'unwrap':
        meta.unwrap = true;
        break;
      case 'nodownload':
        meta.nodownload = true;
        break;
      case 'delay':
        meta.delay = Math.max(0, parseInt(value, 10) || 0);
        break;
      case 'top-level-await':
        meta['top-level-await'] = true;
        break;
      case 'background':
        meta.background = true;
        break;
      case 'isolationCookie':
      case 'isolation-cookie':
      case 'cookieIsolation':
      case 'cookie-isolation':
        meta.isolationCookie = parseBooleanDirective(value);
        break;
      case 'priority':
        meta.priority = parseInt(value, 10) || 0;
        break;
      case 'weight': {
        // Phase 11.7 — Userscripts (Safari) `@weight 1..999`. Integer
        // injection priority where higher = earlier within the same
        // `@run-at`. Clamp to the documented range so an `@weight 99999`
        // typo can't dominate the sort.
        const w = parseInt(value, 10);
        if (Number.isFinite(w)) meta.weight = Math.max(1, Math.min(999, w));
        break;
      }
      case 'webRequest':
        try {
          // @webRequest accepts either a single rule object or an array of
          // rules. Normalize to array, then drop entries that don't match
          // the documented shape so the DNR rule builder downstream never
          // receives malformed input. Mirrors src/background/parser.ts.
          const raw = JSON.parse(value);
          const candidates = Array.isArray(raw) ? raw : [raw];
          const validated = [];
          for (const entry of candidates) {
            if (!entry || typeof entry !== 'object') continue;
            const action = entry.action;
            const selector = entry.selector;
            if (!isValidWebRequestAction(action)) continue;
            if (!isValidWebRequestSelector(selector)) continue;
            validated.push(entry);
          }
          meta.webRequest = validated.length > 0 ? validated : null;
        } catch (e) {}
        break;
      case 'var': {
        const parsedConfig: any = typeof ScriptConfig !== 'undefined' && ScriptConfig.parseDirective
          ? ScriptConfig.parseDirective(value)
          : null;
        if (parsedConfig) meta.config.push(parsedConfig);
        break;
      }
      default:
        // Handle localized metadata like @name:ja or @name:zh-Hans
        if (key.includes(':')) {
          const colonIdx = key.indexOf(':');
          const baseKey = key.slice(0, colonIdx);
          const locale = key.slice(colonIdx + 1);
          // SECURITY: reject prototype-pollution keys. A malicious script
          // with `// @name:__proto__ EVIL` would otherwise reach
          // `meta.localized["__proto__"]["name"] = "EVIL"` — the bracket
          // accessor returns Object.prototype, and the subsequent
          // `.name = ...` mutates it directly. That contaminates every
          // object in the SW context (e.g. `{}.name === "EVIL"`),
          // corrupting all downstream code that reads `.name`/`.constructor`/
          // `.toString` etc. via inheritance.
          const POLLUTED = ['__proto__', 'constructor', 'prototype'];
          if (baseKey && locale
              && !POLLUTED.includes(baseKey)
              && !POLLUTED.includes(locale)) {
            if (baseKey === 'antifeature') {
              const parsedAntifeature: any = parseAntifeatureDirective(value, locale);
              if (parsedAntifeature) meta.antifeature.push(parsedAntifeature);
            } else {
              if (!meta.localized) meta.localized = Object.create(null);
              if (!Object.hasOwn(meta.localized, locale)) {
                meta.localized[locale] = Object.create(null);
              }
              meta.localized[locale][baseKey] = value;
            }
          }
        }
    }
  }

  // Default grant if none specified
  if (meta.grant.length === 0) {
    meta.grant = ['none'];
  }
  meta.esm = meta.module === '1' || meta['inject-into'] === 'module';
  attachRequireMetadataMaps(meta);

  return { meta, code, metaBlock: metaBlockMatch[0] };
}

function parseRequireMetadataBinding(value: any, requireUrls: any) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const requireUrl = [...requireUrls]
    .filter(url => typeof url === 'string' && url.length > 0)
    .sort((a, b) => b.length - a.length)
    .find(url => raw.startsWith(url) && /\s/.test(raw.charAt(url.length)));
  if (!requireUrl) return null;

  const mappedValue = raw.slice(requireUrl.length).trim();
  return mappedValue ? { requireUrl, value: mappedValue } : null;
}

function buildRequireMetadataMap(values: any, requireUrls: any) {
  const map = Object.create(null);
  if (!Array.isArray(values) || !Array.isArray(requireUrls)) return map;

  for (const value of values) {
    const binding = parseRequireMetadataBinding(value, requireUrls);
    if (binding) map[binding.requireUrl] = binding.value;
  }
  return map;
}

function attachRequireMetadataMaps(meta: any) {
  meta.requireProvenanceByUrl = buildRequireMetadataMap(meta.requireProvenance, meta.require);
  meta.requireIdentityByUrl = buildRequireMetadataMap(meta.requireIdentity, meta.require);
  return meta;
}

// ============================================================================
// URL Matching
// ============================================================================

// ============================================================================
// Update System
// ============================================================================

function _receiptArray(value: any) {
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string' && item.length > 0);
  return typeof value === 'string' && value.length > 0 ? [value] : [];
}

function _receiptStringMap(value: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, mapValue]) => (
    typeof key === 'string'
    && key.length > 0
    && typeof mapValue === 'string'
    && mapValue.length > 0
  )));
}

function _receiptMetadataValueForUrl(map: any, values: any, url: any, index: any) {
  if (Object.hasOwn(map, url)) return map[url] || '';
  if (Object.keys(map).length > 0) return '';
  return values[index] || '';
}

function _receiptHost(url: any) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

const _TRUST_RECEIPT_SOURCE_KINDS = new Set(['remote', 'local-editor', 'local-file', 'local-import']);

function _receiptSourceKind(value: any) {
  const kind = typeof value === 'string' ? value.trim() : '';
  return _TRUST_RECEIPT_SOURCE_KINDS.has(kind) ? kind : '';
}

function _receiptSourceLabel(value: any) {
  const label = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return label ? label.slice(0, 80) : '';
}

function _isLocalReceiptSourceKind(kind: any) {
  return typeof kind === 'string' && kind.startsWith('local-');
}

const _localSaveReceiptCoalescing = new Map();

function _localSaveCoalesceKey(scriptId: any, value: any) {
  const key = typeof value === 'string' ? value.trim().slice(0, 120) : '';
  return scriptId && key ? `${scriptId}\n${key}` : '';
}

function _localSaveCoalesceWindowMs(value: any) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.min(Math.max(Math.trunc(numeric), 1000), 5 * 60 * 1000);
}

function _clearLocalSaveCoalescingForScript(scriptId: any) {
  if (!scriptId) return;
  for (const [key, state] of _localSaveReceiptCoalescing.entries()) {
    if (state?.scriptId === scriptId) {
      _localSaveReceiptCoalescing.delete(key);
    }
  }
}

function _sweepExpiredLocalSaveCoalescing(now: any = Date.now()) {
  const sweepAt = Number(now);
  const effectiveNow = Number.isFinite(sweepAt) ? sweepAt : Date.now();
  for (const [key, state] of _localSaveReceiptCoalescing.entries()) {
    const expiresAt = Number(state?.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= effectiveNow) {
      _localSaveReceiptCoalescing.delete(key);
    }
  }
}

function _getScriptOperationLocks() {
  if (!self._toggleLocks) self._toggleLocks = new Map();
  return self._toggleLocks;
}

async function _runExclusiveScriptOperation(scriptId: any, operation: any) {
  if (!scriptId) return await operation();
  const locks = _getScriptOperationLocks();
  const previous = locks.get(scriptId) || Promise.resolve();
  let operationPromise: any;
  operationPromise = previous
    .catch(() => {})
    .then(operation)
    .finally(() => {
      if (locks.get(scriptId) === operationPromise) {
        locks.delete(scriptId);
      }
    });
  locks.set(scriptId, operationPromise);
  return await operationPromise;
}

// Trash is stored as one chrome.storage.local array, so per-script locks do
// not protect it from a delete/restore/sync/prune operation for another ID.
// Every read-modify-write must pass through this queue or a later writer can
// silently discard an entry committed by an earlier writer.
let _trashMutationChain = Promise.resolve();

// Keep recovery useful without allowing complete script snapshots to consume
// the extension's whole storage quota. The byte limit is measured against the
// exact UTF-8 JSON payload written to chrome.storage.local.
const MAX_TRASH_ENTRIES = 100;
const MAX_TRASH_BYTES = 6 * 1024 * 1024;
const TRASH_EVICTION_NOTICE_KEY = 'trashEvictionNotice';
const MAX_TRASH_EVICTION_NOTICES = 50;
const MAX_TRASH_EVICTION_SUMMARIES = 50;

function _trashSerializedBytes(value: any) {
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== 'string') return Number.POSITIVE_INFINITY;
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(serialized).byteLength;
    return serialized.length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function _trashTimestamp(entry: any) {
  const timestamp = Number(entry?.trashedAt);
  return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : 0;
}

function _trashEvictionSummary(entry: any) {
  const meta = entry?.meta || entry?.metadata || {};
  return {
    id: typeof entry?.id === 'string' ? entry.id.slice(0, 160) : '',
    name: typeof meta?.name === 'string' ? meta.name.slice(0, 200) : '',
    trashedAt: _trashTimestamp(entry)
  };
}

function _restoreConflictSnapshot(script: any) {
  const meta = script?.meta || script?.metadata || {};
  const id = typeof script?.id === 'string' ? script.id.slice(0, 160) : '';
  const name = typeof meta?.name === 'string' && meta.name.trim()
    ? meta.name.trim().slice(0, 200)
    : id || 'Untitled script';
  const version = typeof meta?.version === 'string' ? meta.version.trim().slice(0, 80) : '';
  const updatedAt = Number(script?.updatedAt);
  return Number.isFinite(updatedAt) && updatedAt > 0
    ? { id, name, version, updatedAt }
    : { id, name, version };
}

function _enforceTrashBudget(trash: any) {
  const records = (Array.isArray(trash) ? trash : []).map((entry: any, index: number) => ({
    entry,
    index,
    bytes: _trashSerializedBytes(entry)
  }));
  const evicted: any[] = [];
  let evictedCount = 0;
  let serializedBytes = _trashSerializedBytes(records.map(record => record.entry));
  const candidates = records.slice().sort((a, b) => _trashTimestamp(a.entry) - _trashTimestamp(b.entry) || a.index - b.index);

  while (records.length > MAX_TRASH_ENTRIES || serializedBytes > MAX_TRASH_BYTES) {
    const candidate = candidates.shift();
    if (!candidate) break;
    const index = records.indexOf(candidate);
    if (index === -1) continue;
    records.splice(index, 1);
    evictedCount += 1;
    if (evicted.length < MAX_TRASH_EVICTION_SUMMARIES) evicted.push(_trashEvictionSummary(candidate.entry));
    if (Number.isFinite(serializedBytes) && Number.isFinite(candidate.bytes)) {
      serializedBytes = Math.max(2, serializedBytes - candidate.bytes - (records.length > 0 ? 1 : 0));
    } else {
      serializedBytes = _trashSerializedBytes(records.map(record => record.entry));
    }
  }

  return {
    trash: records.map(record => record.entry),
    evicted,
    evictedCount,
    serializedBytes
  };
}

async function _recordTrashEvictionNotice(evicted: any[], evictedCount = evicted.length) {
  if (!evictedCount) return;
  try {
    const data = await chrome.storage.local.get(TRASH_EVICTION_NOTICE_KEY);
    const notices = Array.isArray(data?.[TRASH_EVICTION_NOTICE_KEY])
      ? data[TRASH_EVICTION_NOTICE_KEY].filter((notice: any) => notice && typeof notice === 'object')
      : [];
    notices.push({
      at: Date.now(),
      count: evictedCount,
      entries: (Array.isArray(evicted) ? evicted : []).slice(0, MAX_TRASH_EVICTION_SUMMARIES)
    });
    await chrome.storage.local.set({
      [TRASH_EVICTION_NOTICE_KEY]: notices.slice(-MAX_TRASH_EVICTION_NOTICES)
    });
  } catch (e: any) {
    debugWarn('[ScriptVault] Failed to persist trash eviction notice:', e?.message || e);
  }
}

async function _consumeTrashEvictionNotices() {
  try {
    const data = await chrome.storage.local.get(TRASH_EVICTION_NOTICE_KEY);
    const notices = Array.isArray(data?.[TRASH_EVICTION_NOTICE_KEY])
      ? data[TRASH_EVICTION_NOTICE_KEY].filter((notice: any) => notice && typeof notice === 'object')
      : [];
    if (notices.length > 0) await chrome.storage.local.remove(TRASH_EVICTION_NOTICE_KEY);
    return notices;
  } catch (e: any) {
    debugWarn('[ScriptVault] Failed to read trash eviction notice:', e?.message || e);
    return [];
  }
}

function _runExclusiveTrashMutation(operation: any) {
  const previous = _trashMutationChain;
  let operationPromise: any;
  operationPromise = previous
    .catch(() => {})
    .then(operation);
  _trashMutationChain = operationPromise.then(() => undefined, () => undefined);
  return operationPromise;
}

function notifyEasyCloudScriptSaved(scriptId: any) {
  if (!scriptId) return;
  try {
    if (typeof EasyCloudSync !== 'undefined' && typeof EasyCloudSync.notifyScriptSaved === 'function') {
      EasyCloudSync.notifyScriptSaved(scriptId);
    }
  } catch (e: any) {
    debugLog('EasyCloud save notification failed:', e?.message || e);
  }
}

function notifyEasyCloudScriptDeleted(scriptId: any) {
  if (!scriptId) return;
  try {
    if (typeof EasyCloudSync !== 'undefined' && typeof EasyCloudSync.notifyScriptDeleted === 'function') {
      EasyCloudSync.notifyScriptDeleted(scriptId);
    }
  } catch (e: any) {
    debugLog('EasyCloud delete notification failed:', e?.message || e);
  }
}

function _receiptLineCount(code: any) {
  if (!code) return 0;
  return code.split(/\r\n|\r|\n/).length;
}

function _receiptLineDiff(previousCode: any, nextCode: any) {
  const previousLines = previousCode ? previousCode.split(/\r\n|\r|\n/) : [];
  const nextLines = nextCode ? nextCode.split(/\r\n|\r|\n/) : [];
  const previousCounts = new Map();
  for (const line of previousLines) {
    previousCounts.set(line, (previousCounts.get(line) || 0) + 1);
  }
  let unchangedLines = 0;
  for (const line of nextLines) {
    const count = previousCounts.get(line) || 0;
    if (count > 0) {
      unchangedLines++;
      if (count === 1) previousCounts.delete(line);
      else previousCounts.set(line, count - 1);
    }
  }
  return {
    previousLines: previousLines.length,
    nextLines: nextLines.length,
    addedLines: Math.max(0, nextLines.length - unchangedLines),
    removedLines: Math.max(0, previousLines.length - unchangedLines)
  };
}

function _receiptDiffList(previous: any, next: any) {
  const previousSet = new Set(previous);
  const nextSet = new Set(next);
  return {
    added: next.filter((value: any) => !previousSet.has(value)),
    removed: previous.filter((value: any) => !nextSet.has(value)),
    unchanged: next.filter((value: any) => previousSet.has(value))
  };
}

function _knownDependencySnapshots(previousScript: any) {
  const map = new Map();
  const deps = previousScript?.trustReceipt?.dependencies?.require || [];
  for (const dep of deps) {
    if (dep?.url) map.set(dep.url, dep);
  }
  return map;
}

function _receiptErrorMessage(error: any) {
  return error?.message || (typeof error === 'string' ? error : 'Dependency body unavailable');
}

function _receiptUnavailableProvenanceError(bundleUrl: any = '', identity: any = '', body: any = undefined, fetchProvenanceBundle: any = null) {
  if (!bundleUrl) return 'Missing @require-provenance declaration';
  if (!identity) return 'Missing @require-identity declaration';
  if (typeof body !== 'string') return 'Dependency body unavailable for provenance verification';
  if (typeof fetchProvenanceBundle !== 'function') return 'Provenance bundle fetcher unavailable';
  return 'Provenance verification unavailable';
}

async function _receiptDependencyProvenance(bundleUrl: any = '', identity: any = '', body: any = undefined, fetchProvenanceBundle: any = null) {
  if (!bundleUrl && !identity) return undefined;
  const base = {
    bundleUrl,
    identity,
    status: bundleUrl && identity
      ? 'declared'
      : bundleUrl
        ? 'missing-identity'
        : 'missing-bundle',
    verification: 'verification-unavailable'
  };
  if (!bundleUrl || !identity || typeof body !== 'string' || typeof fetchProvenanceBundle !== 'function') {
    return { ...base, error: _receiptUnavailableProvenanceError(bundleUrl, identity, body, fetchProvenanceBundle) };
  }
  if (!self.SigstoreBundleVerifier?.verifyMessageSignature && typeof SigstoreBundleVerifier === 'undefined') {
    return { ...base, verification: 'signature-failed', error: 'Sigstore verifier unavailable' };
  }

  try {
    const bundle = await fetchProvenanceBundle(bundleUrl);
    if (typeof bundle !== 'string' || bundle.length === 0) {
      return { ...base, verification: 'bundle-unavailable', error: 'Provenance bundle unavailable' };
    }
    const verifier = self.SigstoreBundleVerifier || SigstoreBundleVerifier;
    const result = await verifier.verifyMessageSignature({ bundle, artifact: body, expectedIdentity: identity });
    return {
      ...base,
      verification: result.success
        ? 'signature-verified'
        : result.verification === 'unsupported-bundle'
          ? 'unsupported-bundle'
          : result.verification === 'root-verification-failed'
            ? 'root-verification-failed'
          : 'signature-failed',
      error: result.error,
      certificateIdentity: result.certificateIdentity,
      certificateIssuer: result.certificateIssuer,
      certificateNotBefore: result.certificateNotBefore,
      certificateNotAfter: result.certificateNotAfter,
      digestVerified: result.digestVerified,
      signatureVerified: result.signatureVerified,
      rootVerified: result.rootVerified
    };
  } catch (error) {
    return { ...base, verification: 'signature-failed', error: _receiptErrorMessage(error) };
  }
}

function _isVerifiedRequireProvenance(provenance: any) {
  return provenance?.verification === 'signature-verified' && provenance?.rootVerified === 'verified';
}

function _requireProvenancePreviewEntry(index: any, url: any, provenance: any) {
  return {
    index,
    url,
    bundleUrl: provenance?.bundleUrl || '',
    identity: provenance?.identity || '',
    status: provenance?.status || 'not-declared',
    verification: provenance?.verification || 'not-declared',
    error: provenance?.error || '',
    certificateIdentity: provenance?.certificateIdentity || '',
    certificateIssuer: provenance?.certificateIssuer || '',
    certificateNotBefore: provenance?.certificateNotBefore || '',
    certificateNotAfter: provenance?.certificateNotAfter || '',
    digestVerified: provenance?.digestVerified === true,
    signatureVerified: provenance?.signatureVerified === true,
    rootVerified: provenance?.rootVerified || ''
  };
}

function _summarizeRequireProvenancePreview(entries: any) {
  const counts = {
    total: entries.length,
    declared: 0,
    verified: 0,
    missing: 0,
    failed: 0,
    notDeclared: 0
  };

  for (const entry of entries) {
    if (entry.status === 'not-declared') {
      counts.notDeclared += 1;
      continue;
    }
    counts.declared += 1;
    if (_isVerifiedRequireProvenance(entry)) {
      counts.verified += 1;
    } else if (
      entry.status !== 'declared' ||
      ['verification-unavailable', 'signature-failed', 'root-verification-failed', 'bundle-unavailable', 'unsupported-bundle'].includes(entry.verification)
    ) {
      counts.failed += 1;
    } else {
      counts.missing += 1;
    }
  }

  let status = 'not-declared';
  if (counts.total === 0) status = 'no-requires';
  else if (counts.failed > 0 || counts.missing > 0) status = 'review-required';
  else if (counts.declared > 0 && counts.verified === counts.declared && counts.notDeclared === 0) status = 'verified';
  else if (counts.declared > 0 && counts.verified === counts.declared) status = 'partial';

  return { status, counts };
}

function _getRequireProvenanceFailure(receipt: any = {}) {
  const deps = receipt?.dependencies?.require || [];
  for (const dep of deps) {
    const provenance = dep?.provenance;
    if (!provenance) continue;
    if (_isVerifiedRequireProvenance(provenance)) continue;

    const reason = provenance.error
      || (provenance.status === 'missing-identity' ? 'missing @require-identity'
        : provenance.status === 'missing-bundle' ? 'missing @require-provenance'
        : provenance.verification === 'bundle-unavailable' ? 'bundle unavailable'
        : provenance.verification === 'unsupported-bundle' ? 'unsupported Sigstore bundle'
        : provenance.verification === 'root-verification-failed' ? 'Fulcio root verification failed'
        : provenance.verification === 'signature-failed' ? 'signature verification failed'
        : provenance.verification === 'verification-unavailable' ? 'verification unavailable'
        : 'verification incomplete');

    return {
      url: dep.url || '',
      provenance,
      message: `@require provenance verification failed for ${dep.url || 'dependency'}: ${reason}`
    };
  }
  return null;
}

async function previewRequireProvenance(data: any = {}) {
  const meta = data.meta && typeof data.meta === 'object' ? data.meta : {};
  const requireUrls = _receiptArray(data.requires || data.require || meta.require);
  const bundleUrls = _receiptArray(data.requireProvenance || meta.requireProvenance);
  const identities = _receiptArray(data.requireIdentity || meta.requireIdentity);
  const bundleByUrl = _receiptStringMap(data.requireProvenanceByUrl || meta.requireProvenanceByUrl);
  const identityByUrl = _receiptStringMap(data.requireIdentityByUrl || meta.requireIdentityByUrl);
  const entries = [];

  for (let index = 0; index < requireUrls.length; index += 1) {
    const url = requireUrls[index];
    const bundleUrl = _receiptMetadataValueForUrl(bundleByUrl, bundleUrls, url, index);
    const identity = _receiptMetadataValueForUrl(identityByUrl, identities, url, index);
    let provenance = null;

    if (!bundleUrl && !identity) {
      provenance = { bundleUrl: '', identity: '', status: 'not-declared', verification: 'not-declared' };
    } else if (!bundleUrl || !identity) {
      provenance = await _receiptDependencyProvenance(bundleUrl, identity, '', null);
    } else {
      try {
        const body: any = await fetchRequireScript(url, { allowUnpinned: true });
        if (typeof body !== 'string' || body.length === 0) {
          provenance = {
            bundleUrl,
            identity,
            status: 'declared',
            verification: 'signature-failed',
            error: 'Dependency body unavailable'
          };
        } else {
          provenance = await _receiptDependencyProvenance(bundleUrl, identity, body, fetchProvenanceBundle);
        }
      } catch (error) {
        provenance = {
          bundleUrl,
          identity,
          status: 'declared',
          verification: 'signature-failed',
          error: _receiptErrorMessage(error)
        };
      }
    }

    entries.push(_requireProvenancePreviewEntry(index, url, provenance));
  }

  const summary = _summarizeRequireProvenancePreview(entries);
  return {
    success: true,
    status: summary.status,
    counts: summary.counts,
    entries
  };
}

async function _snapshotDependency(url: any, fetchDependencyBody: any, known: any, bundleUrl: any = '', identity: any = '', fetchProvenanceBundle: any = null) {
  const withProvenance = async (dependency: any, body: any = '') => {
    const provenance = await _receiptDependencyProvenance(bundleUrl, identity, body, fetchProvenanceBundle);
    return provenance ? { ...dependency, provenance } : dependency;
  };
  if (known?.sha256) return withProvenance(known);
  if (typeof fetchDependencyBody !== 'function') return withProvenance(known || { url });
  try {
    const body = await fetchDependencyBody(url);
    if (typeof body !== 'string') return withProvenance({ url, error: 'Dependency body unavailable' });
    return withProvenance({
      url,
      sha256: await _sha256Hex(body),
      bytes: new TextEncoder().encode(body).length
    }, body);
  } catch (error) {
    return withProvenance({ url, error: _receiptErrorMessage(error) });
  }
}

async function _snapshotDependencies(urls: any, fetchDependencyBody: any, known: any, bundleUrls: any = [], identities: any = [], fetchProvenanceBundle: any = null, bundleByUrl: any = {}, identityByUrl: any = {}) {
  const snapshots = [];
  for (const [index, url] of urls.entries()) {
    snapshots.push(await _snapshotDependency(
      url,
      fetchDependencyBody,
      known.get(url),
      _receiptMetadataValueForUrl(bundleByUrl, bundleUrls, url, index),
      _receiptMetadataValueForUrl(identityByUrl, identities, url, index),
      fetchProvenanceBundle
    ));
  }
  return snapshots;
}

function _receiptDependencyChanges(previous: any, next: any) {
  const previousMap = new Map(previous.map((dep: any) => [dep.url, dep]));
  const nextMap = new Map(next.map((dep: any) => [dep.url, dep]));
  const urls = [...previous.map((dep: any) => dep.url), ...next.map((dep: any) => dep.url).filter((url: any) => !previousMap.has(url))];
  return urls.map(url => {
    const before: any = previousMap.get(url);
    const after: any = nextMap.get(url);
    let change = 'unverified';
    if (!before && after) change = 'added';
    else if (before && !after) change = 'removed';
    else if (before?.sha256 && after?.sha256) change = before.sha256 === after.sha256 ? 'unchanged' : 'changed';
    return {
      url,
      change,
      previousSha256: before?.sha256,
      nextSha256: after?.sha256,
      previousBytes: before?.bytes,
      nextBytes: after?.bytes,
      previousError: before?.error,
      nextError: after?.error
    };
  });
}

function _shortReceiptHash(value: any = '') {
  return value ? `${String(value).slice(0, 12)}...` : 'unavailable';
}

function _getRequireTofuSriFailure(receipt: any = {}) {
  const changes = receipt?.dependencyChanges?.require || [];
  for (const change of changes) {
    if (!change?.url || hasVerifiableRequireIntegrity(change.url)) continue;
    const hadTrustedHash = typeof change.previousSha256 === 'string' && change.previousSha256.length > 0;
    if (!hadTrustedHash) continue;

    const nextHash = typeof change.nextSha256 === 'string' && change.nextSha256.length > 0
      ? change.nextSha256
      : '';
    const changedHash = change.change === 'changed'
      && !!nextHash
      && nextHash !== change.previousSha256;
    const unverifiable = ['changed', 'unverified'].includes(change.change)
      && (!nextHash || !!change.nextError);
    if (!changedHash && !unverifiable) continue;

    const reason = changedHash
      ? `hash changed from ${_shortReceiptHash(change.previousSha256)} to ${_shortReceiptHash(nextHash)}`
      : `previously trusted hash ${_shortReceiptHash(change.previousSha256)} could not be reverified`;
    return {
      url: change.url,
      change,
      message: `@require TOFU integrity blocked for ${change.url}: ${reason}. Pin the dependency with #sha256= or provide verified @require-provenance before updating.`
    };
  }
  return null;
}

async function fetchRequireScriptForTrustReceipt(url: any) {
  return fetchRequireScript(url, { bypassCache: true, cacheResult: false, allowUnpinned: true });
}

async function _sha256Hex(text: any) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text || ''));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function createScriptTrustReceipt({ operation, code, meta, sourceUrl = '', previousScript = null, rollbackIndex = -1, sourceKind = '', sourceLabel = '', suppressMetadataSourceFallback = false, fetchDependencyBody = null, fetchProvenanceBundle = null, optionalPermissions = null, optionalHostPermissions = null }: any) {
  const normalizedSourceKind = _receiptSourceKind(sourceKind);
  const normalizedSourceLabel = _receiptSourceLabel(sourceLabel);
  const shouldSuppressMetadataSourceFallback = suppressMetadataSourceFallback === true || _isLocalReceiptSourceKind(normalizedSourceKind);
  const installUrl = sourceUrl || (shouldSuppressMetadataSourceFallback ? '' : meta.source || meta.downloadURL || meta.updateURL || '');
  const installHost = installUrl ? _receiptHost(installUrl) : (_isLocalReceiptSourceKind(normalizedSourceKind) ? 'local' : '');
  const previousCode = previousScript?.code || '';
  const nextHash = await _sha256Hex(code);
  const previousHash = previousScript ? await _sha256Hex(previousCode) : '';
  const requireUrls = _receiptArray(meta.require);
  const requireProvenance: any = _receiptArray(meta.requireProvenance);
  const requireIdentity: any = _receiptArray(meta.requireIdentity);
  const requireProvenanceByUrl = _receiptStringMap(meta.requireProvenanceByUrl);
  const requireIdentityByUrl = _receiptStringMap(meta.requireIdentityByUrl);
  const previousRequireUrls = _receiptArray(previousScript?.meta?.require);
  const previousRequireProvenance: any = _receiptArray(previousScript?.meta?.requireProvenance);
  const previousRequireIdentity: any = _receiptArray(previousScript?.meta?.requireIdentity);
  const previousRequireProvenanceByUrl = _receiptStringMap(previousScript?.meta?.requireProvenanceByUrl);
  const previousRequireIdentityByUrl = _receiptStringMap(previousScript?.meta?.requireIdentityByUrl);
  const previousRequireSnapshots = await _snapshotDependencies(previousRequireUrls, fetchDependencyBody, _knownDependencySnapshots(previousScript), previousRequireProvenance, previousRequireIdentity, fetchProvenanceBundle, previousRequireProvenanceByUrl, previousRequireIdentityByUrl);
  const requireSnapshots = await _snapshotDependencies(requireUrls, fetchDependencyBody, new Map(), requireProvenance, requireIdentity, fetchProvenanceBundle, requireProvenanceByUrl, requireIdentityByUrl);
  const resources = meta.resource && typeof meta.resource === 'object'
    ? Object.entries(meta.resource)
        .filter(([, url]) => typeof url === 'string' && url.length > 0)
        .map(([name, url]) => ({ name, url }))
    : [];

  return {
    schemaVersion: 1,
    operation,
    createdAt: Date.now(),
    source: {
      installUrl,
      installHost,
      updateUrl: meta.updateURL || '',
      downloadUrl: meta.downloadURL || '',
      homepageUrl: meta.homepage || meta.homepageURL || meta.website || '',
      sourceKind: normalizedSourceKind || undefined,
      sourceLabel: normalizedSourceLabel || undefined
    },
    hashes: {
      sha256: nextHash,
      previousSha256: previousScript ? previousHash : undefined
    },
    grants: _receiptArray(meta.grant),
    hostScope: {
      match: _receiptArray(meta.match),
      include: _receiptArray(meta.include),
      exclude: _receiptArray(meta.exclude),
      excludeMatch: _receiptArray(meta.excludeMatch),
      connect: _receiptArray(meta.connect)
    },
    dependencies: {
      require: requireSnapshots,
      resource: resources,
      requireCount: requireUrls.length,
      resourceCount: resources.length
    },
    dependencyChanges: {
      require: _receiptDependencyChanges(previousRequireSnapshots, requireSnapshots)
    },
    permissionChanges: {
      grant: _receiptDiffList(_receiptArray(previousScript?.meta?.grant), _receiptArray(meta.grant)),
      connect: _receiptDiffList(_receiptArray(previousScript?.meta?.connect), _receiptArray(meta.connect)),
      match: _receiptDiffList(_receiptArray(previousScript?.meta?.match), _receiptArray(meta.match))
    },
    // Optional Chrome permissions the install page requested for grants like
    // GM_cookie / GM_setClipboard. `null` means the install path didn't
    // surface a prompt (older receipts, ScriptVault-internal saves, etc.).
    optionalPermissions: optionalPermissions && typeof optionalPermissions === 'object'
      ? {
          requested: Array.isArray(optionalPermissions.requested) ? optionalPermissions.requested.slice() : [],
          granted: Array.isArray(optionalPermissions.granted) ? optionalPermissions.granted.slice() : [],
          denied: Array.isArray(optionalPermissions.denied) ? optionalPermissions.denied.slice() : [],
          unavailable: Array.isArray(optionalPermissions.unavailable) ? optionalPermissions.unavailable.slice() : []
        }
      : null,
    optionalHostPermissions: optionalHostPermissions && typeof optionalHostPermissions === 'object'
      ? {
          requested: Array.isArray(optionalHostPermissions.requested) ? optionalHostPermissions.requested.slice() : [],
          granted: Array.isArray(optionalHostPermissions.granted) ? optionalHostPermissions.granted.slice() : [],
          denied: Array.isArray(optionalHostPermissions.denied) ? optionalHostPermissions.denied.slice() : [],
          unavailable: Array.isArray(optionalHostPermissions.unavailable) ? optionalHostPermissions.unavailable.slice() : []
        }
      : null,
    diff: {
      previousVersion: previousScript?.meta?.version || '',
      nextVersion: meta.version || '',
      previousHash,
      nextHash,
      ..._receiptLineDiff(previousCode, code)
    },
    rollback: previousScript
      ? {
          available: true,
          action: 'rollbackScript',
          scriptId: previousScript.id,
          version: previousScript.meta?.version || '',
          updatedAt: previousScript.updatedAt || null,
          historyIndex: Number.isInteger(rollbackIndex) && rollbackIndex >= 0 ? rollbackIndex : null
        }
      : {
          available: false,
          action: 'rollbackScript',
          scriptId: '',
          version: '',
          updatedAt: null,
          historyIndex: null
        },
    lineCount: _receiptLineCount(code)
  };
}

const UpdateSystem: any = {
  // Phase 6.1 — exponential backoff bookkeeping. Per-script failure count
  // doubles the wait between retries (1m, 2m, 4m, …) up to a 24h cap so a
  // dead update URL doesn't consume bandwidth on every periodic alarm.
  // Successful checks (200 or 304) clear the count.
  _BACKOFF_BASE_MS: 60 * 1000,         // 1 minute
  _BACKOFF_MAX_MS: 24 * 60 * 60 * 1000, // 24 hours
  _MAX_BACKOFF_EXP: 10,                 // 2^10 * 1m = ~17 hours; capped by _BACKOFF_MAX_MS
  _FETCH_TIMEOUT_MS: 15 * 1000,
  _MAX_UPDATE_BYTES: 5 * 1024 * 1024,
  _PENDING_UPDATES_KEY: 'pendingUpdates',
  _MAX_PENDING_UPDATES: 50,
  // Total serialized footprint bound for the single pendingUpdates storage key.
  // The count cap alone does not bound size — each entry carries the full new
  // code plus trust-receipt/diff/risk-delta blobs — so bound service-worker
  // memory and storage write cost even when unlimitedStorage is enabled.
  _MAX_PENDING_TOTAL_BYTES: 8 * 1024 * 1024,
  _pendingUpdates: null,
  // Queue and alarm handlers share this service worker, so every mutation
  // must re-read and publish one complete snapshot before the next begins.
  _pendingUpdatesMutation: Promise.resolve(),

  /** Compute the next-check timestamp for a failure-count value. */
  _nextRetryAt(failures: any) {
    const exp = Math.min(this._MAX_BACKOFF_EXP, Math.max(0, failures - 1));
    const wait = Math.min(this._BACKOFF_MAX_MS, this._BACKOFF_BASE_MS * (2 ** exp));
    return Date.now() + wait;
  },

  async fetchUpdateCandidate(updateUrl: any, fetchOptions: any = {}, intent: any = 'scheduled-update') {
    // Pre-flight: refuse update URLs that point at internal/loopback/link-local
    // hosts. Userscript update URLs are stored from prior installs, so this
    // catches both adversarial @updateURL metadata and rebinds that turned a
    // public host into an internal one between checks.
    const preCheck = InternalHostGuard.classifyFetchUrl(updateUrl, ['http:', 'https:']);
    if (!preCheck.ok) {
      throw new Error('Update URL rejected: ' + preCheck.message);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this._FETCH_TIMEOUT_MS);

    try {
      // Freshness is decided by the shared policy, not by the browser's HTTP
      // cache: a cached body could otherwise answer an update check and hide a
      // newly published version. Conditional intents contribute the stored
      // validators; explicit ones deliberately send none so a body always
      // comes back.
      const { headers: callerHeaders, etag, lastModified, ...restInit } = fetchOptions || {};
      const init = FetchFreshness.buildFreshnessInit(intent, {
        etag,
        lastModified,
        headers: callerHeaders,
        init: { ...restInit, signal: controller.signal }
      });
      const response = await fetch(updateUrl, init);

      if (response.status === 304 || !response.ok) {
        return { response, code: '' };
      }

      // Post-flight: catch redirect targets that resolved to an internal host
      // even though the original update URL was external.
      const postCheck = InternalHostGuard.classifyResponseUrl(response, ['http:', 'https:']);
      if (!postCheck.ok) {
        throw new Error('Update URL redirected to ' + postCheck.message);
      }

      // Stream-bounded read: a hostile update server can omit/lie about
      // Content-Length and serve an unbounded body; _fetchTextBounded
      // cancels the stream the moment the running byte total exceeds the cap.
      const code = await _fetchTextBounded(response, this._MAX_UPDATE_BYTES, 'Update');

      return { response, code };
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        throw new Error(`Update fetch timed out after ${Math.round(this._FETCH_TIMEOUT_MS / 1000)} seconds`);
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  },

  /**
   * Persist a classified update failure on the script.
   *
   * The backoff ring exists to stop hammering a dead update URL. A host-level
   * failure (challenge page, HTTP error, TLS/DNS) is not evidence the script is
   * broken, so it is recorded for the UI but deliberately does NOT advance the
   * ring — otherwise a Cloudflare challenge or an expired certificate silently
   * escalates every affected script to a 24-hour cooldown and updates stop.
   * A body that IS a userscript but will not parse does count.
   */
  async _recordUpdateHostFailure(script: any, failure: any, updateUrl: any) {
    if (!script) return;
    const kind = failure?.kind || 'unknown';
    const message = failure?.message || 'Update check failed';
    script._updateLastFailure = {
      kind,
      message,
      host: failure?.host || '',
      url: updateUrl || '',
      at: Date.now()
    };
    if (failure?.hostLevel === false) {
      script._updateFailureCount = (script._updateFailureCount || 0) + 1;
      script._updateNextCheck = this._nextRetryAt(script._updateFailureCount);
    }
    try { await ScriptStorage.set(script.id, script); } catch (_) { /* best effort */ }
    try {
      if (typeof ErrorLog !== 'undefined' && typeof ErrorLog.log === 'function') {
        await ErrorLog.log({
          scriptId: script.id,
          scriptName: script.meta?.name || script.id,
          error: message,
          source: 'update-check',
          context: kind
        });
      }
    } catch (_) { /* best effort */ }
  },

  async checkForUpdates(scriptId: any = null) {
    // A manual single-script check (caller passed scriptId) bypasses backoff —
    // user explicitly asked, so honor it and let them see fresh failure
    // surface immediately.
    const isManualSingle = !!scriptId;
    const scripts = scriptId
      ? [await ScriptStorage.get(scriptId)].filter(Boolean)
      : await ScriptStorage.getAll();

    const updates = [];
    const now = Date.now();

    for (const script of scripts) {
      if (script.meta.nodownload) continue; // @nodownload prevents auto-updates
      if (!isManualSingle && script.settings?.userModified) continue;
      if (!script.meta.updateURL && !script.meta.downloadURL) continue;

      // Skip scripts in backoff cooldown (auto-update path only).
      if (!isManualSingle && script._updateNextCheck && script._updateNextCheck > now) {
        continue;
      }

      try {
        const updateUrl = script.meta.updateURL || script.meta.downloadURL;

        // A user-triggered single-script check is an explicit refresh: it sends
        // no validators, so the server always returns a body and the user can
        // never be told "up to date" on the strength of a stale cache entry.
        // The periodic sweep stays conditional and treats 304 as success.
        const intent = isManualSingle ? 'manual-update' : 'scheduled-update';
        const { response, code: newCode } = await this.fetchUpdateCandidate(updateUrl, {
          etag: script._httpEtag,
          lastModified: script._httpLastModified
        }, intent);

        // 304 Not Modified — counts as success; clear any backoff state.
        if (response.status === 304) {
          if (script._updateFailureCount || script._updateNextCheck) {
            script._updateFailureCount = 0;
            script._updateNextCheck = 0;
            await ScriptStorage.set(script.id, script);
          }
          continue;
        }
        if (!response.ok) {
          // Non-2xx is a HOST failure: it says nothing about the installed
          // script, so it is reported but must not drive that script's backoff
          // ring toward silence. Only a genuinely bad body counts against it.
          const failure = RemoteResponseClassifier.classifyRemoteResponse({
            url: updateUrl,
            status: response.status,
            contentType: response.headers?.get?.('content-type'),
            body: newCode,
            label: 'Update'
          });
          await this._recordUpdateHostFailure(script, failure, updateUrl);
          continue;
        }

        // Store HTTP validators for the next scheduled check + clear backoff.
        const validators = FetchFreshness.readResponseValidators(intent, response);
        const hadBackoff = script._updateFailureCount || script._updateNextCheck;
        if (validators) {
          script._httpEtag = validators.etag;
          script._httpLastModified = validators.lastModified;
        }
        if (hadBackoff) {
          script._updateFailureCount = 0;
          script._updateNextCheck = 0;
        }
        if (validators || hadBackoff) {
          await ScriptStorage.set(script.id, script);
        }

        // A 2xx body is not automatically a userscript. Greasy Fork — the
        // dominant update host — has served Cloudflare challenge pages
        // (greasyfork#1553) and expired-certificate error pages (#1561); that
        // HTML used to reach parseUserscript and surface as a generic
        // "Parse failed", telling the user their SCRIPT was broken rather than
        // the host, while quietly driving the backoff ring toward silence.
        const parsed: any = parseUserscript(newCode);
        const bodyFailure = RemoteResponseClassifier.classifyRemoteResponse({
          url: updateUrl,
          status: response.status,
          contentType: response.headers?.get?.('content-type'),
          body: newCode,
          parseError: parsed?.error,
          label: 'Update'
        });
        if (bodyFailure) {
          await this._recordUpdateHostFailure(script, bodyFailure, updateUrl);
          continue;
        }
        if (parsed.error) continue;

        if (this.compareVersions(parsed.meta.version, script.meta.version) > 0) {
          updates.push({
            id: script.id,
            name: script.meta.name,
            currentVersion: script.meta.version,
            newVersion: parsed.meta.version,
            code: newCode,
            sourceUrl: updateUrl
          });
        }
      } catch (e) {
        console.error('[ScriptVault] Update check failed for:', script.meta.name, e);
        // Transport failure — also about the host, not the script.
        const updateUrl = script.meta.updateURL || script.meta.downloadURL;
        const failure = RemoteResponseClassifier.classifyFetchError(updateUrl, e, 'Update');
        await this._recordUpdateHostFailure(script, failure, updateUrl);
      }
    }

    return updates;
  },
  
  compareVersions(v1: any, v2: any) {
    // Strip pre-release suffix (e.g. "1.2.0-beta.1" → "1.2.0") before numeric comparison.
    // A version with a pre-release suffix is treated as less than the same version without one.
    const preRelease1 = v1.includes('-');
    const preRelease2 = v2.includes('-');
    const clean1 = (typeof v1 === 'string' ? v1 : String(v1)).replace(/-.*$/, '');
    const clean2 = (typeof v2 === 'string' ? v2 : String(v2)).replace(/-.*$/, '');
    const parts1 = clean1.split('.').map(n => parseInt(n, 10) || 0);
    const parts2 = clean2.split('.').map(n => parseInt(n, 10) || 0);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    // Numeric parts are equal — a pre-release is less than a release of the same version
    if (preRelease1 && !preRelease2) return -1;
    if (!preRelease1 && preRelease2) return 1;
    // Both have pre-release suffixes: compare lexicographically by dot-separated identifiers
    if (preRelease1 && preRelease2) {
      const pre1 = v1.replace(/^[^-]*-/, '').split('.');
      const pre2 = v2.replace(/^[^-]*-/, '').split('.');
      for (let i = 0; i < Math.max(pre1.length, pre2.length); i++) {
        const hasA = i < pre1.length;
        const hasB = i < pre2.length;
        if (!hasA && hasB) return -1;
        if (hasA && !hasB) return 1;

        const a = pre1[i] ?? '';
        const b = pre2[i] ?? '';
        const aNum = /^\d+$/.test(a) ? parseInt(a, 10) : NaN;
        const bNum = /^\d+$/.test(b) ? parseInt(b, 10) : NaN;
        if (!isNaN(aNum) && !isNaN(bNum)) {
          if (aNum > bNum) return 1;
          if (aNum < bNum) return -1;
        } else if (!isNaN(aNum)) {
          return -1;
        } else if (!isNaN(bNum)) {
          return 1;
        } else {
          if (a > b) return 1;
          if (a < b) return -1;
        }
      }
    }
    return 0;
  },

  async applyUpdate(scriptId: any, newCode: any, { force = false, sourceUrl = '', fetchDependencyBody = null, fetchProvenanceBundle: fetchProvenanceBundleOption = null }: any = {}) {
    // Serialize with saveScript/toggleScript/deleteScript/rollback on the same
    // script. Auto-update runs on a chrome.alarms tick and shares the service
    // worker with user actions; without this lock an update captured before a
    // concurrent delete would write the script back (resurrecting it and
    // re-registering it), or re-enable a script the user just disabled. Reading
    // the script INSIDE the lock means a delete that lands first yields null.
    return await _runExclusiveScriptOperation(scriptId, async () => {
    const script = await ScriptStorage.get(scriptId);
    if (!script) return { error: 'Script not found' };
    // Don't auto-update scripts the user has locally edited (unless force=true from forceUpdate)
    if (!force && script.settings?.userModified) return { skipped: true, reason: 'user-modified' };

    let parsed: any = parseUserscript(newCode);
    if (parsed.error) return parsed;
    const updateSettings = await SettingsManager.get();
    const bundleResult = await ESMUserscriptBundler.bundleIfNeeded(newCode, parsed.meta, updateSettings, { sourceUrl });
    if (bundleResult.bundled) {
      newCode = bundleResult.code;
      parsed = parseUserscript(newCode);
      if (parsed.error) return parsed;
      parsed.meta.esmBundle = {
        entryUrl: bundleResult.entryUrl,
        imports: bundleResult.imports,
        bundledAt: Date.now(),
        sourceMap: bundleResult.sourceMap
      };
    }
    const previousScript = {
      ...script,
      meta: { ...script.meta },
      code: script.code,
      updatedAt: script.updatedAt || Date.now()
    };

    // Store previous version for rollback (keep last 5)
    const versionHistory = Array.isArray(script.versionHistory) ? [...script.versionHistory] : [];
    const historyEntry: any = {
      version: script.meta.version,
      code: script.code,
      updatedAt: script.updatedAt || Date.now()
    };
    versionHistory.push(historyEntry);
    // Trim to last 5 versions
    if (versionHistory.length > 5) {
      versionHistory.splice(0, versionHistory.length - 5);
    }
    const rollbackIndex = versionHistory.indexOf(historyEntry);
    const trustReceipt = await createScriptTrustReceipt({
      operation: force ? 'manual-update' : 'auto-update',
      code: newCode,
      meta: parsed.meta,
      sourceUrl: sourceUrl || script.meta.downloadURL || script.meta.updateURL,
      previousScript,
      rollbackIndex,
      fetchDependencyBody: fetchDependencyBody || fetchRequireScriptForTrustReceipt,
      fetchProvenanceBundle: fetchProvenanceBundleOption || fetchProvenanceBundle
    });
    const tofuSriFailure = _getRequireTofuSriFailure(trustReceipt);
    if (tofuSriFailure) {
      return { error: tofuSriFailure.message };
    }
    const provenanceFailure = _getRequireProvenanceFailure(trustReceipt);
    if (provenanceFailure) {
      return { error: provenanceFailure.message };
    }
    // Always re-run the 31-detector AST risk-delta at the apply choke point, not
    // only in the pending-update queue builder. This guarantees that every code
    // path that lands new code — including forceUpdateScript and the applyUpdate
    // message action — produces and records the risk analysis, so a
    // same-author/same-registry update that introduces a new sensitive sink can
    // never be applied with no risk evidence at all. force still overrides the
    // auto-apply gate (the user chose to update), but the delta is recorded.
    const updateRiskDelta = await this._computeUpdateRiskDelta(previousScript.code, newCode);
    historyEntry.trustReceipt = previousScript.trustReceipt || await createScriptTrustReceipt({
      operation: 'rollback-point',
      code: previousScript.code,
      meta: previousScript.meta,
      sourceUrl: previousScript.trustReceipt?.source?.installUrl || previousScript.meta.downloadURL || previousScript.meta.updateURL
    });

    script.code = newCode;
    script.meta = parsed.meta;
    script.updatedAt = Date.now();
    script.trustReceipt = trustReceipt;
    script.versionHistory = versionHistory;
    // Record the risk-delta evidence on the script so the dashboard/audit can
    // surface a "this update introduced new high-risk patterns" signal even for
    // force/direct applies that bypassed the pending-update review queue.
    if (updateRiskDelta) {
      script.settings = { ...(script.settings || {}), lastUpdateRiskDelta: updateRiskDelta };
    }

    // Re-classify the install source. If the update came from a different
    // registry than the install, flag it for the dashboard banner.
    const updateSourceUrl = sourceUrl || parsed.meta.downloadURL || parsed.meta.updateURL || '';
    const updatedSource = classifyInstallSource(updateSourceUrl);
    if (script.installSource?.id && updatedSource.id !== 'local'
        && script.installSource.id !== updatedSource.id) {
      script.settings = { ...(script.settings || {}), sourceIdentityChanged: true };
      script.previousInstallSource = script.installSource;
      script.installSource = updatedSource;
    } else if (!script.installSource && updatedSource.id !== 'local') {
      script.installSource = updatedSource;
    }

    // Re-register FIRST so we can verify the new code works before persisting
    try {
      await unregisterScript(scriptId);
      if (script.enabled !== false) {
        await registerScript(script);
      }
    } catch (regError: any) {
      console.error(`[ScriptVault] Failed to re-register ${script.meta.name} after update:`, regError);
      // Registration failed — still save the updated code (user can manually fix)
      // but mark the failure so the UI can show it
      script.settings = script.settings || {};
      script.settings._registrationError = regError.message || 'Registration failed after update';
    }

    try {
      await ensurePersistentStorageForScriptWrite('script-update', newCode);

      // Persist to storage after registration attempt. If this fails, restore
      // the previous registration before surfacing the error so running code
      // cannot diverge from the last durable script version.
      await ScriptStorage.set(scriptId, script);
    } catch (persistError: any) {
      console.error(`[ScriptVault] Failed to persist update for ${scriptId}; restoring previous registration:`, persistError);
      try {
        await unregisterScript(scriptId);
        if (previousScript.enabled !== false) await registerScript(previousScript);
      } catch (restoreError: any) {
        console.error(`[ScriptVault] Failed to restore previous registration for ${scriptId}:`, restoreError);
      }
      return { error: persistError?.message || String(persistError) };
    }
    notifyEasyCloudScriptSaved(scriptId);

    // Phase 12.10 — applyUpdate no longer fires a per-script OS notification.
    // Instead, the autoUpdate caller aggregates successful updates into a
    // single summary notification (or none, when notifyOnUpdate is off), and
    // pushes them onto the recent-updates ring so the dashboard can surface
    // an in-app banner. Manual single-script updates (popup "Check for
    // Update", dashboard force-update) get their feedback inline via the
    // returned { success, script } payload.
    return { success: true, script, riskDelta: updateRiskDelta };
    });
  },

  // Phase 12.10 — recently-applied updates ring buffer surfaced to the
  // dashboard via the `getRecentUpdates` background message. Capped at 20.
  _recentUpdates: [],

  async _loadPendingUpdates({ fresh = false } = {}) {
    if (!fresh && Array.isArray(this._pendingUpdates)) return this._pendingUpdates;
    const data = await chrome.storage.local.get(this._PENDING_UPDATES_KEY);
    this._pendingUpdates = Array.isArray(data[this._PENDING_UPDATES_KEY])
      ? data[this._PENDING_UPDATES_KEY].filter((item: any) => item && item.id && typeof item.code === 'string')
      : [];
    return this._pendingUpdates;
  },

  async _mutatePendingUpdates(this: any, mutator: any) {
    const execute = async () => {
      // The in-memory snapshot may predate a mutation that just committed.
      const existing = await this._loadPendingUpdates({ fresh: true });
      const mutation = await mutator(existing.slice());
      const pendingUpdates = await this._savePendingUpdates(mutation.next);
      return {
        ...(mutation.result || {}),
        pendingUpdates
      };
    };

    const previous = this._pendingUpdatesMutation || Promise.resolve();
    const operation = previous.catch(() => undefined).then(execute);
    // Keep later mutations usable after a failed storage write while preserving
    // the rejection for the operation that encountered it.
    this._pendingUpdatesMutation = operation.catch(() => undefined);
    return await operation;
  },

  async _savePendingUpdates(this: any, list: any = this._pendingUpdates) {
    const normalized = (Array.isArray(list) ? list : [])
      .filter(item => item && item.id && typeof item.code === 'string')
      .slice(0, this._MAX_PENDING_UPDATES);
    // Bound the total serialized footprint, not just the entry count. Drop from
    // the same (tail) end the count cap uses until the store fits the budget.
    let evicted = 0;
    while (normalized.length > 1) {
      let bytes;
      try {
        const serialized = JSON.stringify(normalized);
        bytes = new TextEncoder().encode(serialized).byteLength;
      } catch { break; }
      if (bytes <= this._MAX_PENDING_TOTAL_BYTES) break;
      normalized.pop();
      evicted++;
    }
    if (evicted > 0) {
      console.warn(`[ScriptVault] pendingUpdates exceeded ${this._MAX_PENDING_TOTAL_BYTES} bytes; dropped ${evicted} queued update(s) to stay within the bounded storage budget.`);
    }
    await chrome.storage.local.set({ [this._PENDING_UPDATES_KEY]: normalized });
    this._pendingUpdates = normalized;
    return normalized.slice();
  },

  _hasAddedPermission(permissionChanges: any = {}) {
    const changes: any = permissionChanges || {};
    return ['grant', 'connect', 'match'].some(key => {
      const group = changes[key] || {};
      return Array.isArray(group.added) && group.added.length > 0;
    });
  },

  _hasRiskyDependencyChange(dependencyChanges: any = {}) {
    const requireChanges = dependencyChanges.require || [];
    return requireChanges.some((change: any) =>
      ['added', 'changed', 'unverified'].includes(change.change)
      || change.nextError
    );
  },

  _hasProvenanceReviewFlag(receipt: any = {}) {
    const deps = receipt.dependencies?.require || [];
    return deps.some((dep: any) => {
      const provenance = dep?.provenance;
      if (!provenance) return false;
      if (provenance.status && provenance.status !== 'declared') return true;
      return ['verification-unavailable', 'signature-failed', 'root-verification-failed', 'bundle-unavailable', 'unsupported-bundle']
        .includes(provenance.verification || '');
    });
  },

  _metadataIdentityReviewReasons(previousMeta: any = null, nextMeta: any = null) {
    const reasons = [];
    for (const field of ['author', 'namespace']) {
      const previous = typeof previousMeta?.[field] === 'string'
        ? previousMeta[field].trim().replace(/[\r\n\t]+/g, ' ')
        : '';
      const next = typeof nextMeta?.[field] === 'string'
        ? nextMeta[field].trim().replace(/[\r\n\t]+/g, ' ')
        : '';
      if (!previous && !next) continue;
      if (previous === next) continue;
      reasons.push(`Changes @${field} (${previous || '(none)'} -> ${next || '(none)'})`);
    }
    return reasons;
  },

  _getUpdateReviewReasons(receipt: any, sourceIdentityChanged: any, riskDelta: any = null, previousMeta: any = null, nextMeta: any = null) {
    const reasons = [];
    if (this._hasAddedPermission(receipt.permissionChanges)) {
      reasons.push('Adds permissions or host scope');
    }
    if (_getRequireTofuSriFailure(receipt)) {
      reasons.push('Changes previously trusted unpinned @require bytes');
    } else if (this._hasRiskyDependencyChange(receipt.dependencyChanges)) {
      reasons.push('Changes external dependencies');
    }
    if (this._hasProvenanceReviewFlag(receipt)) {
      reasons.push('Fails @require provenance verification');
    }
    if (sourceIdentityChanged) {
      reasons.push('Changes install source');
    }
    reasons.push(...this._metadataIdentityReviewReasons(previousMeta, nextMeta));
    if (riskDelta && riskDelta.hasNewRiskySinks) {
      const cats = Array.isArray(riskDelta.categories) && riskDelta.categories.length
        ? riskDelta.categories.join(', ')
        : 'code';
      reasons.push(`Introduces new high-risk code patterns (${cats})`);
    }
    return reasons;
  },

  // Re-run the AST risk analysis on the incoming update body and diff it against
  // the currently installed version. A same-author/same-registry account
  // takeover (the dominant real-world userscript compromise) passes the trust,
  // permission, and provenance gates untouched, so we independently flag any NEW
  // high-risk sink the update introduces and route it to manual review. Analysis
  // failure is deliberately non-blocking: the permission/dependency/provenance
  // gates still apply, and a flaky offscreen analyzer must not freeze every
  // auto-update. Returns null when no delta signal is available.
  async _computeUpdateRiskDelta(previousCode: any, nextCode: any) {
    const SENSITIVE = new Set(['execution', 'network', 'data', 'hijack', 'mining', 'obfuscation']);
    try {
      if (typeof ScriptAnalyzer === 'undefined' || typeof ScriptAnalyzer.analyzeAsync !== 'function') {
        return null;
      }
      const prevSource = typeof previousCode === 'string' ? previousCode : '';
      const nextSource = typeof nextCode === 'string' ? nextCode : '';
      const [prev, next] = await Promise.all([
        ScriptAnalyzer.analyzeAsync(prevSource),
        ScriptAnalyzer.analyzeAsync(nextSource)
      ]);
      if (!next || next.parseError) return null;
      const prevIds = new Set(Array.isArray(prev?.findings) ? prev.findings.map((f: any) => f && f.id) : []);
      const introduced = (Array.isArray(next.findings) ? next.findings : [])
        .filter((f: any) => f && !prevIds.has(f.id) && SENSITIVE.has(f.category))
        .map((f: any) => ({ id: f.id, label: f.label, category: f.category, risk: f.risk }));
      const categories = [...new Set(introduced.map((f: any) => f.category))];
      const previousRisk = Number(prev?.totalRisk) || 0;
      const nextRisk = Number(next.totalRisk) || 0;
      return {
        hasNewRiskySinks: introduced.length > 0,
        introduced,
        categories,
        previousRisk,
        nextRisk,
        riskScoreDelta: nextRisk - previousRisk,
        previousLevel: prev?.riskLevel || 'unknown',
        nextLevel: next.riskLevel || 'unknown'
      };
    } catch (e) {
      console.error('[ScriptVault] Update risk-delta analysis failed:', e);
      return null;
    }
  },

  async _buildPendingUpdate(update: any, source: any = 'manual-check') {
    if (!update?.id || typeof update.code !== 'string') return null;
    const script = await ScriptStorage.get(update.id);
    if (!script) return null;
    const parsed: any = parseUserscript(update.code);
    if (parsed.error) return null;

    const sourceUrl = update.sourceUrl || parsed.meta.downloadURL || parsed.meta.updateURL || '';
    const nextSource = classifyInstallSource(sourceUrl);
    const previousSource = script.installSource || classifyInstallSource(script.meta?.downloadURL || script.meta?.updateURL || '');
    const sourceIdentityChanged = !!previousSource?.id
      && previousSource.id !== 'local'
      && nextSource.id !== 'local'
      && previousSource.id !== nextSource.id;
    const receipt = await createScriptTrustReceipt({
      operation: 'pending-update',
      code: update.code,
      meta: parsed.meta,
      sourceUrl,
      previousScript: script,
      fetchDependencyBody: fetchRequireScriptForTrustReceipt,
      fetchProvenanceBundle
    });
    const riskDelta = await this._computeUpdateRiskDelta(script.code, update.code);
    const reviewReasons = this._getUpdateReviewReasons(receipt, sourceIdentityChanged, riskDelta, script.meta, parsed.meta);
    const now = Date.now();

    return {
      kind: 'update',
      riskDelta,
      id: update.id,
      name: script.meta?.name || update.name || update.id,
      currentVersion: script.meta?.version || update.currentVersion || '',
      newVersion: parsed.meta.version || update.newVersion || '',
      code: update.code,
      sourceUrl,
      source,
      queuedAt: now,
      checkedAt: now,
      safeToApply: reviewReasons.length === 0,
      reviewReasons,
      sourceIdentityChanged,
      installSource: nextSource,
      previousInstallSource: previousSource,
      trustReceipt: receipt,
      dependencyChanges: receipt.dependencyChanges || { require: [] },
      permissionChanges: receipt.permissionChanges || null,
      diff: receipt.diff || null,
      sourceInfo: receipt.source || null,
      rollback: {
        ...(receipt.rollback || {}),
        available: Array.isArray(script.versionHistory) && script.versionHistory.length > 0,
        historyIndex: Array.isArray(script.versionHistory) && script.versionHistory.length > 0
          ? script.versionHistory.length - 1
          : null
      }
    };
  },

  async _buildPendingSubscriptionInstall(update: any, source: any = 'subscription') {
    if (!update?.id || typeof update.code !== 'string') return null;
    const parsed: any = parseUserscript(update.code);
    if (parsed.error) return null;

    const sourceUrl = update.sourceUrl || parsed.meta.downloadURL || parsed.meta.updateURL || '';
    const receipt = await createScriptTrustReceipt({
      operation: 'subscription-install',
      code: update.code,
      meta: parsed.meta,
      sourceUrl,
      fetchDependencyBody: fetchRequireScriptForTrustReceipt,
      fetchProvenanceBundle
    });
    const now = Date.now();

    return {
      kind: 'subscription-install',
      id: update.id,
      name: parsed.meta.name || update.name || update.id,
      currentVersion: 'new',
      newVersion: parsed.meta.version || update.newVersion || '',
      code: update.code,
      sourceUrl,
      source,
      queuedAt: now,
      checkedAt: now,
      safeToApply: false,
      reviewReasons: ['New script from subscription'],
      sourceIdentityChanged: false,
      subscriptionId: update.subscriptionId || '',
      subscriptionName: update.subscriptionName || '',
      installSource: classifyInstallSource(sourceUrl),
      previousInstallSource: null,
      trustReceipt: receipt,
      dependencyChanges: receipt.dependencyChanges || { require: [] },
      permissionChanges: receipt.permissionChanges || null,
      diff: receipt.diff || null,
      sourceInfo: receipt.source || null,
      rollback: {
        available: false,
        action: 'rollbackScript',
        scriptId: '',
        version: '',
        updatedAt: null,
        historyIndex: null
      }
    };
  },

  async queueUpdates(updates: any = [], { source = 'manual-check' }: any = {}) {
    const incoming = Array.isArray(updates) ? updates : [];
    const mutation = await this._mutatePendingUpdates(async (existing: any[]) => {
      const existingById = new Map<string, any>(existing.map((item: any) => [item.id, item] as [string, any]));
      const incomingIds = new Set(incoming.map(update => update?.id).filter(Boolean));
      const retained = existing.filter((item: any) => !incomingIds.has(item.id));
      const queued = [];
      const refreshed = [];

      for (const update of incoming) {
        try {
          const pending = await this._buildPendingUpdate(update, source);
          if (!pending) continue;
          const previous = existingById.get(pending.id);
          if (previous && previous.kind === pending.kind && previous.newVersion === pending.newVersion) {
            // Keep the original queue timestamp for an unchanged version. The
            // periodic check still refreshes the receipt/code, but auto-update
            // can distinguish a new queue entry from the same pending update.
            pending.queuedAt = Number.isFinite(previous.queuedAt) ? previous.queuedAt : pending.queuedAt;
            refreshed.push(pending);
          } else {
            queued.push(pending);
          }
        } catch (error: any) {
          console.warn('[ScriptVault] Failed to queue update:', update?.name || update?.id, error?.message || error);
        }
      }

      return { next: [...queued, ...refreshed, ...retained], result: { queued: queued.length } };
    });
    const pendingUpdates = mutation.pendingUpdates;
    return {
      success: true,
      queued: mutation.queued,
      pendingUpdates,
      safeCount: pendingUpdates.filter((item: any) => item.safeToApply).length,
      reviewCount: pendingUpdates.filter((item: any) => !item.safeToApply).length
    };
  },

  async queueSubscriptionInstalls(installs: any = [], { source = 'subscription' }: any = {}) {
    const incoming = Array.isArray(installs) ? installs : [];
    const mutation = await this._mutatePendingUpdates(async (existing: any[]) => {
      const incomingIds = new Set(incoming.map(update => update?.id).filter(Boolean));
      const retained = existing.filter((item: any) => !incomingIds.has(item.id));
      const queued = [];

      for (const install of incoming) {
        try {
          const pending = await this._buildPendingSubscriptionInstall(install, source);
          if (pending) queued.push(pending);
        } catch (error: any) {
          console.warn('[ScriptVault] Failed to queue subscription script:', install?.name || install?.id, error?.message || error);
        }
      }

      return { next: [...queued, ...retained], result: { queued: queued.length } };
    });
    const pendingUpdates = mutation.pendingUpdates;
    return {
      success: true,
      queued: mutation.queued,
      pendingUpdates,
      safeCount: pendingUpdates.filter((item: any) => item.safeToApply).length,
      reviewCount: pendingUpdates.filter((item: any) => !item.safeToApply).length
    };
  },

  async queueSubscriptionRemovals(removals: any = [], { source = 'subscription' }: any = {}) {
    const incoming = Array.isArray(removals) ? removals : [];
    const mutation = await this._mutatePendingUpdates(async (existing: any[]) => {
      const incomingIds = new Set(incoming.map(update => update?.id).filter(Boolean));
      const retained = existing.filter((item: any) => !incomingIds.has(item.id));
      const queued = incoming
        .filter(item => item?.id && item?.scriptId)
        .map(item => ({
          kind: 'subscription-remove',
          id: item.id,
          scriptId: item.scriptId,
          name: item.name || item.scriptId,
          currentVersion: '',
          newVersion: '',
          code: '',
          sourceUrl: item.sourceUrl || '',
          source,
          queuedAt: Date.now(),
          checkedAt: Date.now(),
          safeToApply: false,
          reviewReasons: ['Removed from subscription; review uninstall'],
          sourceIdentityChanged: false,
          subscriptionId: item.subscriptionId || '',
          subscriptionName: item.subscriptionName || '',
          diff: { previousLines: 0, nextLines: 0, addedLines: 0, removedLines: 0 }
        }));
      return { next: [...queued, ...retained], result: { queued: queued.length } };
    });
    const pendingUpdates = mutation.pendingUpdates;
    return {
      success: true,
      queued: mutation.queued,
      pendingUpdates,
      safeCount: pendingUpdates.filter((item: any) => item.safeToApply).length,
      reviewCount: pendingUpdates.filter((item: any) => !item.safeToApply).length
    };
  },

  async getPendingUpdates() {
    await (this._pendingUpdatesMutation || Promise.resolve());
    return (await this._loadPendingUpdates()).slice();
  },

  async clearPendingUpdates(scriptId: any = null) {
    const mutation = await this._mutatePendingUpdates(async (existing: any[]) => {
      if (!scriptId) return { next: [], result: { cleared: 'all' } };
      const next = existing.filter((item: any) => item.id !== scriptId);
      return { next, result: { cleared: existing.length - next.length } };
    });
    return { success: true, ...mutation };
  },

  _recordRecentUpdates(entries: any) {
    const successful = (Array.isArray(entries) ? entries : []).filter(Boolean);
    if (successful.length === 0) return;
    this._recentUpdates = [...successful, ...this._recentUpdates].slice(0, 20);
  },

  async applyPendingUpdate(scriptId: any, { force = false }: any = {}) {
    await (this._pendingUpdatesMutation || Promise.resolve());
    const pendingUpdates: any = await this._loadPendingUpdates();
    const item = pendingUpdates.find((update: any) => update.id === scriptId);
    if (!item) return { error: 'Pending update not found' };

    if (item.kind === 'subscription-remove') {
      const targetId = item.scriptId || item.id;
      const existing = await ScriptStorage.get(targetId);
      if (existing) {
        await unregisterScript(existing.id);
        if (typeof ScriptStorage.delete === 'function') await ScriptStorage.delete(existing.id);
      }
      await this.clearPendingUpdates(scriptId);
      return { success: true, script: existing || { id: targetId } };
    }

    if (item.kind === 'subscription-install') {
      const result = await installFromCode(item.code, {
        sourceUrl: item.sourceUrl || '',
        operation: 'subscription-install'
      });
      if (result?.success) {
        await this.clearPendingUpdates(scriptId);
        this._recordRecentUpdates([{
          id: item.id,
          name: item.name,
          previousVersion: 'new',
          newVersion: item.newVersion,
          dependencyChanges: result.script?.trustReceipt?.dependencyChanges || item.dependencyChanges || { require: [] },
          permissionChanges: result.script?.trustReceipt?.permissionChanges || item.permissionChanges || null,
          appliedAt: Date.now()
        }]);
      }
      return result;
    }

    const result = await this.applyUpdate(scriptId, item.code, { force, sourceUrl: item.sourceUrl || '' });
    if (result?.success) {
      await this.clearPendingUpdates(scriptId);
      this._recordRecentUpdates([{
        id: item.id,
        name: item.name,
        previousVersion: item.currentVersion,
        newVersion: item.newVersion,
        dependencyChanges: result.script?.trustReceipt?.dependencyChanges || item.dependencyChanges || { require: [] },
        permissionChanges: result.script?.trustReceipt?.permissionChanges || item.permissionChanges || null,
        appliedAt: Date.now()
      }]);
    }
    return result;
  },

  async applySafePendingUpdates(scriptIds: any = null) {
    const idSet = Array.isArray(scriptIds) && scriptIds.length > 0 ? new Set(scriptIds) : null;
    await (this._pendingUpdatesMutation || Promise.resolve());
    const pendingUpdates: any = await this._loadPendingUpdates();
    const candidates = pendingUpdates.filter((item: any) => item.safeToApply && (!idSet || idSet.has(item.id)));
    const results = [];

    for (const item of candidates) {
      try {
        results.push({
          id: item.id,
          result: await this.applyPendingUpdate(item.id, { force: false })
        });
      } catch (error: any) {
        results.push({ id: item.id, result: { error: error?.message || 'Update failed' } });
      }
    }

    const applied = results.filter(entry => entry.result?.success).length;
    const skipped = results.filter(entry => entry.result?.skipped).length;
    const failed = results.filter(entry => entry.result?.error).length;
    return {
      success: true,
      applied,
      skipped,
      failed,
      results,
      pendingUpdates: await this.getPendingUpdates()
    };
  },

  async autoUpdate() {
    const settings = await SettingsManager.get();
    if (!settings.autoUpdate) return;

    const updates: any = await this.checkForUpdates();
    const queueResult = await this.queueUpdates(updates, { source: 'auto-check' });
    let applyResult = null;
    if (settings.autoUpdateMode === 'apply-safe') {
      applyResult = await this.applySafePendingUpdates(updates.map((update: any) => update.id));
    }

    const pendingAfter = applyResult?.pendingUpdates || queueResult.pendingUpdates;
    const reviewCount = pendingAfter.filter((item: any) => updates.some((update: any) => update.id === item.id)).length;
    const appliedCount = applyResult?.applied || 0;
    if ((queueResult.queued > 0 || appliedCount > 0) && settings.notifyOnUpdate) {
      const title = appliedCount > 0
        ? `${appliedCount} safe update${appliedCount === 1 ? '' : 's'} applied`
        : `${queueResult.queued} update${queueResult.queued === 1 ? '' : 's'} ready`;
      const messageParts = [];
      if (reviewCount > 0) messageParts.push(`${reviewCount} waiting in the Updates queue`);
      if (appliedCount > 0) messageParts.push(`${appliedCount} installed`);
      const message = messageParts.join(', ') || 'Open ScriptVault to review updates';
      try {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'images/icon128.png',
          title,
          message
        });
      } catch (_e) { /* notifications may be disabled; non-fatal */ }
      if (reviewCount > 0) {
        tryOpenPopup('pending-updates').catch(() => {});
      }
    }

    await SettingsManager.set('lastUpdateCheck', Date.now());
  },

  /** Return the most recent successful auto-updates (newest first). */
  getRecentUpdates() {
    return this._recentUpdates.slice();
  },

  /** Clear the recent-updates ring (called when the dashboard banner is dismissed). */
  clearRecentUpdates() {
    this._recentUpdates = [];
  }
};

const LOCAL_HEALTH_SCHEMA = 'scriptvault-local-health/v1';
const LOCAL_HEALTH_STALE_REMOTE_MS = 180 * 24 * 60 * 60 * 1000;
const LOCAL_HEALTH_SLOW_SCRIPT_MS = 200;
const LOCAL_HEALTH_STORAGE_WARNING_PERCENT = 85;
const LOCAL_HEALTH_STORAGE_CRITICAL_PERCENT = 95;
const LOCAL_HEALTH_CALLBACK_WARNING_PERCENT = 80;
const LOCAL_WORKSPACE_REFRESH_STALE_MS = 30 * 24 * 60 * 60 * 1000;
const GM_VALUE_SYNC_SCHEMA = 'scriptvault-gm-value-sync/v1';
const GM_VALUE_SYNC_RETRY_HISTORY_SCHEMA = 'scriptvault-gm-value-sync-retry-history/v1';
const GM_VALUE_SYNC_RETRY_RESOLUTION_SCHEMA = 'scriptvault-gm-value-sync-retry-resolution/v1';
const GM_VALUE_SYNC_RETRY_RESOLUTION_HISTORY_SCHEMA = 'scriptvault-gm-value-sync-retry-resolution-history/v1';
const GM_VALUE_SYNC_RETRY_HISTORY_LIMIT = 5;
const GM_VALUE_SYNC_RETRY_HISTORY_RETENTION_DAYS = 7;
const GM_VALUE_SYNC_RETRY_HISTORY_RETENTION_MS = GM_VALUE_SYNC_RETRY_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const GM_VALUE_SYNC_MAX_SCRIPT_BYTES = 64 * 1024;
const GM_VALUE_SYNC_MAX_KEYS = 128;
const GM_VALUE_SYNC_MAX_KEY_BYTES = 256;
const REGISTRATION_SWEEP_SCHEMA = 'scriptvault-registration-sweep/v1';
const BACKGROUND_RUNNER_ALLOWED_GRANTS = new Set([
  'none',
  'GM_getValue',
  'GM_setValue',
  'GM_deleteValue',
  'GM_listValues',
  'GM_addValueChangeListener',
  'GM_removeValueChangeListener',
  'GM_xmlhttpRequest',
  'GM_notification',
  'GM_info',
  'GM_log'
]);
const BACKGROUND_RUNNER_GRANT_ALIASES: any = {
  'GM.getValue': 'GM_getValue',
  'GM.setValue': 'GM_setValue',
  'GM.deleteValue': 'GM_deleteValue',
  'GM.listValues': 'GM_listValues',
  'GM.addValueChangeListener': 'GM_addValueChangeListener',
  'GM.removeValueChangeListener': 'GM_removeValueChangeListener',
  'GM.xmlHttpRequest': 'GM_xmlhttpRequest',
  'GM.notification': 'GM_notification',
  'GM.info': 'GM_info',
  'GM.log': 'GM_log'
};
const DEFAULT_BACKGROUND_RUNNER_BUDGET = {
  timeoutMs: 30_000,
  maxConcurrentPerScript: 1,
  maxQueuedRunsPerScript: 3
};

function _localHealthRoundPercent(value: any) {
  return Math.round(value * 10) / 10;
}

function _localHealthSanitizeError(error: any) {
  return error?.message || String(error || 'unknown error');
}

function _localHealthCount(record: any, key: any) {
  const safeKey = key || 'unknown';
  record[safeKey] = (record[safeKey] || 0) + 1;
}

function _lastSyncResultCount(value: any) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function sanitizeValueBundleSyncForLastResult(valueBundleSync: any) {
  if (!valueBundleSync || typeof valueBundleSync !== 'object') return null;
  const applied = _lastSyncResultCount(valueBundleSync.applied);
  const preserved = _lastSyncResultCount(valueBundleSync.preserved);
  const failures = _lastSyncResultCount(valueBundleSync.failures);
  const writeFailureRetryReady = Math.min(
    _lastSyncResultCount(valueBundleSync.writeFailureRetryReady),
    failures,
    preserved
  );
  return {
    applied,
    preserved,
    conflictBlocked: _lastSyncResultCount(valueBundleSync.conflictBlocked),
    conflictsDetected: _lastSyncResultCount(valueBundleSync.conflictsDetected),
    losersRetained: _lastSyncResultCount(valueBundleSync.losersRetained),
    skippedUnavailable: _lastSyncResultCount(valueBundleSync.skippedUnavailable),
    failures,
    writeFailureRetryReady
  };
}

function _gmValueSyncRetryAgeMinutes(timestamp: any) {
  const numeric = Number(timestamp);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.floor(Math.max(0, Date.now() - numeric) / 60000);
}

function _gmValueSyncRetryAgeBucket(ageMinutes: any) {
  if (ageMinutes == null) return 'unknown';
  if (!Number.isFinite(Number(ageMinutes))) return 'unknown';
  if (ageMinutes < 15) return 'fresh';
  if (ageMinutes < 6 * 60) return 'recent';
  if (ageMinutes < 24 * 60) return 'stale';
  return 'old';
}

function buildLastSyncResultRecord(result: any = {}) {
  const valueBundleSync = sanitizeValueBundleSyncForLastResult(result?.valueBundleSync);
  return {
    timestamp: Date.now(),
    ok: !!(result?.success || result?.skipped),
    skipped: !!result?.skipped,
    error: result?.error || null,
    ...(valueBundleSync ? { valueBundleSync } : {})
  };
}

function sanitizeGmValueSyncRetryHistoryEntry(entry: any) {
  if (!entry || typeof entry !== 'object') return null;
  const timestamp = Number.isFinite(Number(entry.timestamp)) ? Math.max(0, Math.floor(Number(entry.timestamp))) : null;
  if (!timestamp) return null;
  const failures = _lastSyncResultCount(entry.failures);
  const preserved = _lastSyncResultCount(entry.preserved);
  const writeFailureRetryReady = Math.min(
    _lastSyncResultCount(entry.writeFailureRetryReady),
    failures,
    preserved
  );
  if (failures <= 0 && writeFailureRetryReady <= 0) return null;
  return {
    schema: GM_VALUE_SYNC_RETRY_HISTORY_SCHEMA,
    timestamp,
    status: writeFailureRetryReady > 0 ? 'retry-ready' : 'failed-no-retry',
    failures,
    preserved,
    writeFailureRetryReady
  };
}

function buildGmValueSyncRetryHistoryEntry(record: any = {}) {
  const valueBundleSync = sanitizeValueBundleSyncForLastResult(record.valueBundleSync);
  if (!valueBundleSync) return null;
  return sanitizeGmValueSyncRetryHistoryEntry({
    timestamp: record.timestamp,
    failures: valueBundleSync.failures,
    preserved: valueBundleSync.preserved,
    writeFailureRetryReady: valueBundleSync.writeFailureRetryReady
  });
}

function _gmValueSyncRetryHistoryCutoff(now: any = Date.now()) {
  const numeric = Number(now);
  const safeNow = Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : Date.now();
  return Math.max(0, safeNow - GM_VALUE_SYNC_RETRY_HISTORY_RETENTION_MS);
}

function _isGmValueSyncRetryHistoryEntryStale(entry: any, now: any = Date.now()) {
  const timestamp = Number(entry?.timestamp);
  return Number.isFinite(timestamp) && timestamp > 0 && timestamp < _gmValueSyncRetryHistoryCutoff(now);
}

function sanitizeGmValueSyncRetryHistoryEntries(history: any, options: any = {}) {
  if (!Array.isArray(history)) return [];
  const includeStale = options.includeStale === true;
  const now = Number.isFinite(Number(options.now)) ? Math.max(0, Math.floor(Number(options.now))) : Date.now();
  const limit = options.limit === false ? Number.MAX_SAFE_INTEGER : GM_VALUE_SYNC_RETRY_HISTORY_LIMIT;
  return history
    .map(sanitizeGmValueSyncRetryHistoryEntry)
    .filter(Boolean)
    .filter((entry: any) => includeStale || !_isGmValueSyncRetryHistoryEntryStale(entry, now))
    .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, limit);
}

function updateGmValueSyncRetryHistory(history: any, record: any) {
  const entries = sanitizeGmValueSyncRetryHistoryEntries(history);
  const entry = buildGmValueSyncRetryHistoryEntry(record);
  if (entry) entries.unshift(entry);
  return entries
    .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, GM_VALUE_SYNC_RETRY_HISTORY_LIMIT);
}

function buildGmValueSyncRetryResolutionRecord(history: any, record: any = {}) {
  if (!record?.ok) return null;
  const valueBundleSync = sanitizeValueBundleSyncForLastResult(record.valueBundleSync);
  if (!valueBundleSync || valueBundleSync.applied <= 0 || valueBundleSync.failures > 0 || valueBundleSync.writeFailureRetryReady > 0) return null;
  const entries = sanitizeGmValueSyncRetryHistoryEntries(history, { limit: false });
  const retryReadyEntries = entries.filter((entry: any) => entry.status === 'retry-ready');
  if (retryReadyEntries.length === 0) return null;
  const priorRetryReadyWrites = retryReadyEntries.reduce(
    (sum: number, entry: any) => sum + (entry?.writeFailureRetryReady || 0),
    0
  );
  const timestamp = Number.isFinite(Number(record.timestamp)) ? Math.max(0, Math.floor(Number(record.timestamp))) : null;
  if (!timestamp || priorRetryReadyWrites <= 0) return null;
  let latestRetryTimestamp = retryReadyEntries[0]?.timestamp || null;
  if (latestRetryTimestamp != null && latestRetryTimestamp > timestamp) latestRetryTimestamp = timestamp;
  return {
    schema: GM_VALUE_SYNC_RETRY_RESOLUTION_SCHEMA,
    timestamp,
    applied: valueBundleSync.applied,
    priorRetryReadyEntries: retryReadyEntries.length,
    priorRetryReadyWrites,
    latestRetryTimestamp,
    privacy: {
      includesValues: false,
      includesValueKeys: false,
      includesScriptIds: false,
      includesScriptNames: false,
      includesUrls: false,
      includesFileHandles: false,
      includesLocalPaths: false
    }
  };
}

function shouldRemoveGmValueSyncRetryResolutionRecord(record: any) {
  if (!record || typeof record !== 'object' || record.schema !== GM_VALUE_SYNC_RETRY_RESOLUTION_SCHEMA) return true;
  const timestamp = Number(record.timestamp);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return true;
  return _isGmValueSyncRetryHistoryEntryStale({ timestamp });
}

function sanitizeGmValueSyncRetryResolutionHistoryEntry(entry: any) {
  if (!entry || typeof entry !== 'object' || entry.schema !== GM_VALUE_SYNC_RETRY_RESOLUTION_SCHEMA) return null;
  const timestamp = Number.isFinite(Number(entry.timestamp)) ? Math.max(0, Math.floor(Number(entry.timestamp))) : null;
  const applied = _lastSyncResultCount(entry.applied);
  if (!timestamp || applied <= 0) return null;
  const priorRetryReadyEntries = _lastSyncResultCount(entry.priorRetryReadyEntries);
  const priorRetryReadyWrites = _lastSyncResultCount(entry.priorRetryReadyWrites);
  if (priorRetryReadyEntries <= 0 || priorRetryReadyWrites <= 0) return null;
  let latestRetryTimestamp = Number.isFinite(Number(entry.latestRetryTimestamp)) ? Math.max(0, Math.floor(Number(entry.latestRetryTimestamp))) : null;
  if (latestRetryTimestamp != null && latestRetryTimestamp > timestamp) latestRetryTimestamp = timestamp;
  return {
    schema: GM_VALUE_SYNC_RETRY_RESOLUTION_SCHEMA,
    timestamp,
    applied,
    priorRetryReadyEntries,
    priorRetryReadyWrites,
    latestRetryTimestamp
  };
}

function sanitizeGmValueSyncRetryResolutionHistoryEntries(history: any, options: any = {}) {
  if (!Array.isArray(history)) return [];
  const includeStale = options.includeStale === true;
  const now = Number.isFinite(Number(options.now)) ? Math.max(0, Math.floor(Number(options.now))) : Date.now();
  const limit = options.limit === false ? Number.MAX_SAFE_INTEGER : GM_VALUE_SYNC_RETRY_HISTORY_LIMIT;
  return history
    .map(sanitizeGmValueSyncRetryResolutionHistoryEntry)
    .filter(Boolean)
    .filter((entry: any) => includeStale || !_isGmValueSyncRetryHistoryEntryStale(entry, now))
    .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, limit);
}

function updateGmValueSyncRetryResolutionHistory(history: any, record: any) {
  const entries = sanitizeGmValueSyncRetryResolutionHistoryEntries(history);
  const entry = sanitizeGmValueSyncRetryResolutionHistoryEntry(record);
  if (entry) entries.unshift(entry);
  return entries
    .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, GM_VALUE_SYNC_RETRY_HISTORY_LIMIT);
}

async function persistLastSyncResult(result: any = {}) {
  try {
    const lastSyncResult = buildLastSyncResultRecord(result);
    let data: any = {};
    try {
      data = await chrome.storage.local.get(['gmValueSyncRetryHistory', 'gmValueSyncRetryResolution', 'gmValueSyncRetryResolutionHistory']);
    } catch (_) {}
    const gmValueSyncRetryResolution = buildGmValueSyncRetryResolutionRecord(data?.gmValueSyncRetryHistory, lastSyncResult);
    const removeStaleRetryResolution = !gmValueSyncRetryResolution && shouldRemoveGmValueSyncRetryResolutionRecord(data?.gmValueSyncRetryResolution);
    const gmValueSyncRetryHistory = updateGmValueSyncRetryHistory(data?.gmValueSyncRetryHistory, lastSyncResult);
    const gmValueSyncRetryResolutionHistory = updateGmValueSyncRetryResolutionHistory(data?.gmValueSyncRetryResolutionHistory, gmValueSyncRetryResolution);
    await chrome.storage.local.set({
      lastSyncResult,
      gmValueSyncRetryHistory,
      gmValueSyncRetryResolutionHistory,
      ...(gmValueSyncRetryResolution ? { gmValueSyncRetryResolution } : {})
    });
    if (removeStaleRetryResolution) {
      try {
        await chrome.storage.local.remove('gmValueSyncRetryResolution');
      } catch (_) {}
    }
  } catch (_e) { /* non-critical */ }
}

let _lastRegistrationSweep: any = {
  schema: REGISTRATION_SWEEP_SCHEMA,
  generatedAt: null,
  status: 'not-run',
  mode: 'none',
  forceReregister: false,
  userScriptsAvailable: null,
  setupState: 'unknown',
  enabledScripts: 0,
  alreadyRegisteredScripts: 0,
  registeredScripts: 0,
  skippedScripts: 0,
  staleUnregisteredScripts: 0,
  failedScripts: 0,
  staleUnregisterFailures: 0,
  requirePreloadCount: 0
};

function recordRegistrationSweep(summary: any = {}) {
  _lastRegistrationSweep = {
    schema: REGISTRATION_SWEEP_SCHEMA,
    generatedAt: new Date().toISOString(),
    status: summary.status || 'unknown',
    mode: summary.mode || 'unknown',
    forceReregister: summary.forceReregister === true,
    userScriptsAvailable: typeof summary.userScriptsAvailable === 'boolean' ? summary.userScriptsAvailable : null,
    setupState: summary.setupState || 'unknown',
    enabledScripts: Math.max(0, Number(summary.enabledScripts) || 0),
    alreadyRegisteredScripts: Math.max(0, Number(summary.alreadyRegisteredScripts) || 0),
    registeredScripts: Math.max(0, Number(summary.registeredScripts) || 0),
    skippedScripts: Math.max(0, Number(summary.skippedScripts) || 0),
    staleUnregisteredScripts: Math.max(0, Number(summary.staleUnregisteredScripts) || 0),
    failedScripts: Math.max(0, Number(summary.failedScripts) || 0),
    staleUnregisterFailures: Math.max(0, Number(summary.staleUnregisterFailures) || 0),
    requirePreloadCount: Math.max(0, Number(summary.requirePreloadCount) || 0)
  };
  return _lastRegistrationSweep;
}

function normalizeBackgroundGrant(grant: any) {
  const trimmed = String(grant || '').trim();
  return BACKGROUND_RUNNER_GRANT_ALIASES[trimmed] || trimmed;
}

function getUnsupportedBackgroundGrants(meta: any) {
  const grants = Array.isArray(meta?.grant) ? meta.grant : [];
  const unsupported = new Set();
  for (const grant of grants) {
    const normalized = normalizeBackgroundGrant(grant);
    if (!normalized || BACKGROUND_RUNNER_ALLOWED_GRANTS.has(normalized)) continue;
    unsupported.add(normalized);
  }
  return [...unsupported].sort();
}

function getBackgroundRunnerTriggers(meta: any) {
  return typeof meta?.crontab === 'string' && meta.crontab.trim() ? ['crontab'] : [];
}

function normalizeBackgroundRunnerBudget() {
  return { ...DEFAULT_BACKGROUND_RUNNER_BUDGET };
}

function planBackgroundScript(script: any, settings: any = {}) {
  const meta = script?.meta || null;
  const triggers = getBackgroundRunnerTriggers(meta);
  const unsupportedGrants = getUnsupportedBackgroundGrants(meta);
  if (!meta?.background) return { status: 'not-background', reason: 'Script does not declare @background.', triggers, unsupportedGrants };
  if (script?.enabled === false) return { status: 'script-disabled', reason: 'Script is disabled.', triggers, unsupportedGrants };
  if (!settings.experimentalBackgroundScripts) return { status: 'gate-disabled', reason: 'experimentalBackgroundScripts is disabled.', triggers, unsupportedGrants };
  if (unsupportedGrants.length > 0) return { status: 'unsupported-grants', reason: 'Script requests GM grants that are not available in DOM-less background context.', triggers, unsupportedGrants };
  if (triggers.length === 0) return { status: 'missing-trigger', reason: 'Background script has no supported automatic trigger.', triggers, unsupportedGrants };
  return { status: 'ready', reason: 'Background script is eligible for the DOM-less runner.', triggers, unsupportedGrants };
}

function getBackgroundWrapperDryRunSupport(script: any) {
  if (!script?.meta?.background) return { supported: false, reason: 'Background wrapper requires @background metadata.' };
  if (Array.isArray(script.meta.require) && script.meta.require.length > 0) {
    return { supported: false, reason: 'Background wrapper does not support @require dependencies yet.' };
  }
  const unsupportedGrants = getUnsupportedBackgroundGrants(script.meta);
  if (unsupportedGrants.length > 0) {
    return { supported: false, reason: `Background wrapper does not support grants: ${unsupportedGrants.join(', ')}` };
  }
  return { supported: true, reason: 'Background wrapper payload can be assembled.' };
}

function buildBackgroundRunnerDryRun(script: any, settings: any = {}) {
  const plan = planBackgroundScript(script, settings);
  const wrapper = getBackgroundWrapperDryRunSupport(script);
  const payloadReady = plan.status === 'ready' && wrapper.supported;
  return {
    scriptId: script?.id || '',
    status: payloadReady ? 'ready' : (plan.status === 'ready' ? 'wrapper-unsupported' : plan.status),
    reason: payloadReady ? 'Background runner payload can be prepared; execution remains disabled.' : (plan.status === 'ready' ? wrapper.reason : plan.reason),
    executionEnabled: false,
    plan: {
      status: plan.status,
      reason: plan.reason,
      enabled: plan.status === 'ready',
      triggers: plan.triggers,
      unsupportedGrants: plan.unsupportedGrants,
      budget: normalizeBackgroundRunnerBudget()
    },
    wrapper,
    payload: {
      wouldBuild: payloadReady,
      includesCode: false,
      source: 'scriptvault-background-runner'
    }
  };
}

async function buildLocalHealthStorageSummary() {
  if (typeof navigator === 'undefined' || !navigator.storage || typeof navigator.storage.estimate !== 'function') {
    return {
      available: false,
      usageBytes: 0,
      quotaBytes: 0,
      usagePercent: 0,
      usageFormatted: '0 B',
      quotaFormatted: '0 B',
      level: 'unavailable'
    };
  }

  try {
    const estimate = await navigator.storage.estimate();
    const usageBytes = Math.max(0, Number(estimate?.usage || 0));
    const quotaBytes = Math.max(0, Number(estimate?.quota || 0));
    const usagePercent = quotaBytes > 0 ? _localHealthRoundPercent((usageBytes / quotaBytes) * 100) : 0;
    const level = usagePercent >= LOCAL_HEALTH_STORAGE_CRITICAL_PERCENT
      ? 'critical'
      : usagePercent >= LOCAL_HEALTH_STORAGE_WARNING_PERCENT
        ? 'warning'
        : 'ok';

    return {
      available: true,
      usageBytes,
      quotaBytes,
      usagePercent,
      usageFormatted: formatBytes(usageBytes),
      quotaFormatted: formatBytes(quotaBytes),
      level
    };
  } catch (error) {
    return {
      available: false,
      usageBytes: 0,
      quotaBytes: 0,
      usagePercent: 0,
      usageFormatted: '0 B',
      quotaFormatted: '0 B',
      level: 'error',
      error: _localHealthSanitizeError(error)
    };
  }
}

function buildLocalHealthScriptSummary(scripts: any = [], settings: any = {}) {
  const now = Date.now();
  const unsupportedBackgroundGrantNames = new Set();
  const summary: any = {
    total: scripts.length,
    enabled: 0,
    disabled: 0,
    registrationErrors: 0,
    scriptsWithExecutionErrors: 0,
    slowScripts: 0,
    staleRemoteScripts: 0,
    sourceIdentityChanged: 0,
    userModified: 0,
    syncLocked: 0,
    managedScripts: 0,
    backgroundScripts: {
      total: 0,
      dormant: 0,
      eligible: 0,
      gateDisabled: 0,
      missingTrigger: 0,
      unsupportedGrants: 0,
      scriptDisabled: 0,
      unsupportedGrantNames: []
    },
    slowScriptThresholdMs: LOCAL_HEALTH_SLOW_SCRIPT_MS,
    staleRemoteThresholdDays: Math.round(LOCAL_HEALTH_STALE_REMOTE_MS / (24 * 60 * 60 * 1000))
  };

  for (const script of scripts) {
    if (script?.enabled === false) summary.disabled++;
    else summary.enabled++;

    if (script?.settings?._registrationError) summary.registrationErrors++;
    if ((script?.stats?.errors || 0) > 0) summary.scriptsWithExecutionErrors++;
    if ((script?.stats?.avgTime || 0) >= LOCAL_HEALTH_SLOW_SCRIPT_MS) summary.slowScripts++;
    if (script?.settings?.sourceIdentityChanged) summary.sourceIdentityChanged++;
    if (script?.settings?.userModified) summary.userModified++;
    if (script?.settings?.syncLock) summary.syncLocked++;
    if (script?.settings?.managed) summary.managedScripts++;

    if (script?.meta?.background) {
      const plan = planBackgroundScript(script, settings);
      summary.backgroundScripts.total++;
      summary.backgroundScripts.dormant++;
      if (plan.status === 'ready') summary.backgroundScripts.eligible++;
      if (plan.status === 'gate-disabled') summary.backgroundScripts.gateDisabled++;
      if (plan.status === 'missing-trigger') summary.backgroundScripts.missingTrigger++;
      if (plan.status === 'unsupported-grants') summary.backgroundScripts.unsupportedGrants++;
      if (plan.status === 'script-disabled') summary.backgroundScripts.scriptDisabled++;
      for (const grant of plan.unsupportedGrants || []) unsupportedBackgroundGrantNames.add(grant);
    }

    const hasRemoteUpdateSource = !!(script?.meta?.updateURL || script?.meta?.downloadURL);
    if (hasRemoteUpdateSource && script?.updatedAt && now - script.updatedAt >= LOCAL_HEALTH_STALE_REMOTE_MS) {
      summary.staleRemoteScripts++;
    }
  }

  summary.backgroundScripts.unsupportedGrantNames = [...unsupportedBackgroundGrantNames].sort();
  return summary;
}

function createEmptyGmValueSyncHealthSummary(overrides: any = {}) {
  return {
    schema: GM_VALUE_SYNC_SCHEMA,
    available: true,
    providerWritesEnabled: true,
    optInScripts: 0,
    readyBundles: 0,
    emptyBundles: 0,
    scriptsWithWarnings: 0,
    valueReadFailures: 0,
    totalKeys: 0,
    totalBytes: 0,
    maxScriptBytes: GM_VALUE_SYNC_MAX_SCRIPT_BYTES,
    maxKeys: GM_VALUE_SYNC_MAX_KEYS,
    maxKeyBytes: GM_VALUE_SYNC_MAX_KEY_BYTES,
    lastResult: null,
    retryResolution: null,
    retryResolutionHistory: {
      schema: GM_VALUE_SYNC_RETRY_RESOLUTION_HISTORY_SCHEMA,
      limit: GM_VALUE_SYNC_RETRY_HISTORY_LIMIT,
      retentionDays: GM_VALUE_SYNC_RETRY_HISTORY_RETENTION_DAYS,
      entries: 0,
      totalApplied: 0,
      totalPriorRetryReadyEntries: 0,
      totalPriorRetryReadyWrites: 0,
      staleEntriesPruned: 0,
      latestTimestamp: null,
      oldestTimestamp: null,
      privacy: {
        includesValues: false,
        includesValueKeys: false,
        includesScriptIds: false,
        includesScriptNames: false,
        includesUrls: false,
        includesFileHandles: false,
        includesLocalPaths: false
      }
    },
    retryHistory: {
      schema: GM_VALUE_SYNC_RETRY_HISTORY_SCHEMA,
      limit: GM_VALUE_SYNC_RETRY_HISTORY_LIMIT,
      retentionDays: GM_VALUE_SYNC_RETRY_HISTORY_RETENTION_DAYS,
      entries: 0,
      retryReadyEntries: 0,
      failedNoRetryEntries: 0,
      staleEntriesPruned: 0,
      totalWriteFailureRetryReady: 0,
      latestTimestamp: null,
      oldestTimestamp: null,
      privacy: {
        includesValues: false,
        includesValueKeys: false,
        includesScriptIds: false,
        includesScriptNames: false,
        includesUrls: false,
        includesFileHandles: false,
        includesLocalPaths: false
      }
    },
    warningCounts: {},
    privacy: {
      includesValues: false,
      includesValueKeys: false,
      includesScriptIds: false,
      includesScriptNames: false,
      includesUrls: false,
      includesFileHandles: false,
      includesLocalPaths: false
    },
    ...overrides
  };
}

function _gmValueSyncByteLength(value: any) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function _gmValueSyncNormalizeTimestamp(value: any) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined;
  return Math.floor(timestamp);
}

function _gmValueSyncSetMetadataKey(record: any, key: any, value: any) {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true
  });
}

function _gmValueSyncNormalizeKeyMetadataEntry(value: any) {
  const timestamp = value && typeof value === 'object'
    ? _gmValueSyncNormalizeTimestamp(value.updatedAt)
    : _gmValueSyncNormalizeTimestamp(value);
  return timestamp ? { updatedAt: timestamp } : undefined;
}

function _gmValueSyncCountWarning(record: any, id: any) {
  _localHealthCount(record, id || 'unknown');
}

function shouldSyncScriptValuesForSync(script: any) {
  return script?.settings?.syncValues === true;
}

function buildGmValueSyncBundleForSync(script: any, values: any, options: any = {}) {
  const warningCounts = {};
  if (!script?.id) {
    return { included: false, reason: 'missing-script', bundle: null, warningCounts };
  }
  if (!shouldSyncScriptValuesForSync(script)) {
    return { included: false, reason: 'not-opted-in', bundle: null, warningCounts };
  }

  const sourceValues = values && typeof values === 'object' && !Array.isArray(values) ? values : {};
  const lastValueUpdatedAt = _gmValueSyncNormalizeTimestamp(options.lastValueUpdatedAt);
  const sourceKeyMetadata = options.keyMetadata && typeof options.keyMetadata === 'object' && !Array.isArray(options.keyMetadata)
    ? options.keyMetadata
    : {};
  const bundle: any = {
    schema: GM_VALUE_SYNC_SCHEMA,
    scriptId: script.id,
    keyCount: 0,
    bytes: 0,
    values: {},
    ...(lastValueUpdatedAt ? { lastValueUpdatedAt } : {})
  };

  for (const [rawKey, rawValue] of Object.entries(sourceValues).sort(([a], [b]) => a.localeCompare(b))) {
    const key = String(rawKey);
    if (bundle.keyCount >= GM_VALUE_SYNC_MAX_KEYS) {
      _gmValueSyncCountWarning(warningCounts, 'maxKeysExceeded');
      break;
    }
    if (_gmValueSyncByteLength(key) > GM_VALUE_SYNC_MAX_KEY_BYTES) {
      _gmValueSyncCountWarning(warningCounts, 'keyTooLarge');
      continue;
    }

    let cloned;
    try {
      const json = JSON.stringify(rawValue);
      if (json === undefined) {
        _gmValueSyncCountWarning(warningCounts, 'valueNotJsonSerializable');
        continue;
      }
      cloned = JSON.parse(json);
    } catch (_) {
      _gmValueSyncCountWarning(warningCounts, 'valueNotJsonSerializable');
      continue;
    }

    const nextValues = { ...bundle.values, [key]: cloned };
    const nextKeyMetadata = { ...(bundle.keyMetadata || {}) };
    const keyMetadataEntry = _gmValueSyncNormalizeKeyMetadataEntry(sourceKeyMetadata[key]);
    if (keyMetadataEntry) _gmValueSyncSetMetadataKey(nextKeyMetadata, key, keyMetadataEntry);
    const nextBundle = {
      ...bundle,
      keyCount: Object.keys(nextValues).length,
      bytes: 0,
      values: nextValues,
      ...(Object.keys(nextKeyMetadata).length > 0 ? { keyMetadata: nextKeyMetadata } : {})
    };
    const nextBytes = _gmValueSyncByteLength(nextBundle);
    if (nextBytes > GM_VALUE_SYNC_MAX_SCRIPT_BYTES) {
      _gmValueSyncCountWarning(warningCounts, 'scriptValueCapExceeded');
      continue;
    }

    bundle.values = nextValues;
    bundle.keyCount = nextBundle.keyCount;
    if (nextBundle.keyMetadata) bundle.keyMetadata = nextBundle.keyMetadata;
    bundle.bytes = nextBytes;
  }

  if (bundle.keyCount === 0) {
    return { included: true, reason: 'empty', bundle, warningCounts };
  }
  return { included: true, reason: 'included', bundle, warningCounts };
}

function buildGmValueSyncReadinessForValues(scriptId: any, values: any) {
  const result = buildGmValueSyncBundleForSync({ id: scriptId, settings: { syncValues: true } }, values);
  return {
    reason: result.reason,
    keyCount: result.bundle?.keyCount || 0,
    bytes: result.bundle?.bytes || 0,
    warningCounts: result.warningCounts
  };
}

async function buildValueBundlesForScripts(scripts: any = []) {
  const valueBundles: any = {};
  let optIns = 0;
  let warnings = 0;
  if (typeof ScriptValues === 'undefined' || typeof ScriptValues?.getAll !== 'function') {
    const hasOptIns = scripts.some((script: any) => shouldSyncScriptValuesForSync(script));
    if (hasOptIns) throw new Error('GM value storage is unavailable for opted-in value sync');
    return { valueBundles, optIns, warnings };
  }

  for (const script of scripts) {
    if (!shouldSyncScriptValuesForSync(script)) continue;
    optIns++;
    const values = await ScriptValues.getAll(script.id);
    const metadata = typeof ScriptValues.getAllMetadata === 'function'
      ? await ScriptValues.getAllMetadata(script.id)
      : null;
    const keyMetadata = typeof ScriptValues.getAllKeyMetadata === 'function'
      ? await ScriptValues.getAllKeyMetadata(script.id)
      : null;
    const result = buildGmValueSyncBundleForSync(script, values, {
      lastValueUpdatedAt: metadata?.lastUpdatedAt ?? null,
      keyMetadata
    });
    warnings += (Object.values(result.warningCounts) as any[])
      .reduce((sum, count) => sum + (Number(count) || 0), 0);
    if (result.bundle) valueBundles[script.id] = result.bundle;
  }

  return { valueBundles, optIns, warnings };
}

function sanitizeGmValueSyncLastResultForHealth(record: any) {
  if (!record || typeof record !== 'object') return null;
  const valueBundleSync = sanitizeValueBundleSyncForLastResult(record.valueBundleSync);
  const timestamp = Number.isFinite(Number(record.timestamp)) ? Math.max(0, Math.floor(Number(record.timestamp))) : null;
  const writeFailureRetryReady = valueBundleSync?.writeFailureRetryReady || 0;
  const retryAgeMinutes = writeFailureRetryReady > 0 ? _gmValueSyncRetryAgeMinutes(timestamp) : null;
  return {
    schema: 'scriptvault-gm-value-sync-result/v1',
    timestamp,
    ok: record.ok === true,
    skipped: record.skipped === true,
    hasError: !!record.error,
    applied: valueBundleSync?.applied || 0,
    preserved: valueBundleSync?.preserved || 0,
    conflictBlocked: valueBundleSync?.conflictBlocked || 0,
    conflictsDetected: valueBundleSync?.conflictsDetected || 0,
    losersRetained: valueBundleSync?.losersRetained || 0,
    skippedUnavailable: valueBundleSync?.skippedUnavailable || 0,
    failures: valueBundleSync?.failures || 0,
    writeFailureRetryReady,
    retryAgeMinutes,
    retryAgeBucket: writeFailureRetryReady > 0 ? _gmValueSyncRetryAgeBucket(retryAgeMinutes) : 'none'
  };
}

async function readGmValueSyncLastResultForHealth() {
  try {
    const data = await chrome.storage.local.get('lastSyncResult');
    return sanitizeGmValueSyncLastResultForHealth(data?.lastSyncResult);
  } catch (_) {
    return null;
  }
}

function sanitizeGmValueSyncRetryResolutionForHealth(record: any) {
  if (!record || typeof record !== 'object' || record.schema !== GM_VALUE_SYNC_RETRY_RESOLUTION_SCHEMA) return null;
  const timestamp = Number.isFinite(Number(record.timestamp)) ? Math.max(0, Math.floor(Number(record.timestamp))) : null;
  if (!timestamp || _isGmValueSyncRetryHistoryEntryStale({ timestamp })) return null;
  const applied = _lastSyncResultCount(record.applied);
  if (applied <= 0) return null;
  const priorRetryReadyEntries = _lastSyncResultCount(record.priorRetryReadyEntries);
  const priorRetryReadyWrites = _lastSyncResultCount(record.priorRetryReadyWrites);
  if (priorRetryReadyEntries <= 0 || priorRetryReadyWrites <= 0) return null;
  let latestRetryTimestamp = Number.isFinite(Number(record.latestRetryTimestamp)) ? Math.max(0, Math.floor(Number(record.latestRetryTimestamp))) : null;
  if (latestRetryTimestamp != null && latestRetryTimestamp > timestamp) latestRetryTimestamp = timestamp;
  const resolutionAgeMinutes = _gmValueSyncRetryAgeMinutes(timestamp);
  return {
    schema: GM_VALUE_SYNC_RETRY_RESOLUTION_SCHEMA,
    timestamp,
    applied,
    priorRetryReadyEntries,
    priorRetryReadyWrites,
    latestRetryTimestamp,
    resolutionAgeMinutes,
    resolutionAgeBucket: _gmValueSyncRetryAgeBucket(resolutionAgeMinutes),
    privacy: {
      includesValues: false,
      includesValueKeys: false,
      includesScriptIds: false,
      includesScriptNames: false,
      includesUrls: false,
      includesFileHandles: false,
      includesLocalPaths: false
    }
  };
}

async function readGmValueSyncRetryResolutionForHealth() {
  try {
    const data = await chrome.storage.local.get('gmValueSyncRetryResolution');
    return sanitizeGmValueSyncRetryResolutionForHealth(data?.gmValueSyncRetryResolution);
  } catch (_) {
    return null;
  }
}

function summarizeGmValueSyncRetryResolutionHistoryForHealth(history: any) {
  const now = Date.now();
  const allEntries = sanitizeGmValueSyncRetryResolutionHistoryEntries(history, { includeStale: true, limit: false, now });
  const staleEntriesPruned = allEntries.filter(entry => _isGmValueSyncRetryHistoryEntryStale(entry, now)).length;
  const entries: any = allEntries
    .filter(entry => !_isGmValueSyncRetryHistoryEntryStale(entry, now))
    .slice(0, GM_VALUE_SYNC_RETRY_HISTORY_LIMIT);
  return {
    schema: GM_VALUE_SYNC_RETRY_RESOLUTION_HISTORY_SCHEMA,
    limit: GM_VALUE_SYNC_RETRY_HISTORY_LIMIT,
    retentionDays: GM_VALUE_SYNC_RETRY_HISTORY_RETENTION_DAYS,
    entries: entries.length,
    totalApplied: entries.reduce((sum: any, entry: any) => sum + entry.applied, 0),
    totalPriorRetryReadyEntries: entries.reduce((sum: any, entry: any) => sum + entry.priorRetryReadyEntries, 0),
    totalPriorRetryReadyWrites: entries.reduce((sum: any, entry: any) => sum + entry.priorRetryReadyWrites, 0),
    staleEntriesPruned,
    latestTimestamp: entries[0]?.timestamp || null,
    oldestTimestamp: entries.length ? entries[entries.length - 1].timestamp : null,
    privacy: {
      includesValues: false,
      includesValueKeys: false,
      includesScriptIds: false,
      includesScriptNames: false,
      includesUrls: false,
      includesFileHandles: false,
      includesLocalPaths: false
    }
  };
}

async function readGmValueSyncRetryResolutionHistoryForHealth() {
  try {
    const data = await chrome.storage.local.get('gmValueSyncRetryResolutionHistory');
    return summarizeGmValueSyncRetryResolutionHistoryForHealth(data?.gmValueSyncRetryResolutionHistory);
  } catch (_) {
    return summarizeGmValueSyncRetryResolutionHistoryForHealth([]);
  }
}

function summarizeGmValueSyncRetryHistoryForHealth(history: any) {
  const now = Date.now();
  const allEntries = sanitizeGmValueSyncRetryHistoryEntries(history, { includeStale: true, limit: false, now });
  const staleEntriesPruned = allEntries.filter(entry => _isGmValueSyncRetryHistoryEntryStale(entry, now)).length;
  const entries: any = allEntries
    .filter(entry => !_isGmValueSyncRetryHistoryEntryStale(entry, now))
    .slice(0, GM_VALUE_SYNC_RETRY_HISTORY_LIMIT);
  let retryReadyEntries = 0;
  let failedNoRetryEntries = 0;
  let totalWriteFailureRetryReady = 0;
  for (const entry of entries) {
    if (entry.status === 'retry-ready') retryReadyEntries++;
    if (entry.status === 'failed-no-retry') failedNoRetryEntries++;
    totalWriteFailureRetryReady += entry.writeFailureRetryReady;
  }
  return {
    schema: GM_VALUE_SYNC_RETRY_HISTORY_SCHEMA,
    limit: GM_VALUE_SYNC_RETRY_HISTORY_LIMIT,
    retentionDays: GM_VALUE_SYNC_RETRY_HISTORY_RETENTION_DAYS,
    entries: entries.length,
    retryReadyEntries,
    failedNoRetryEntries,
    staleEntriesPruned,
    totalWriteFailureRetryReady,
    latestTimestamp: entries[0]?.timestamp || null,
    oldestTimestamp: entries.length ? entries[entries.length - 1].timestamp : null,
    privacy: {
      includesValues: false,
      includesValueKeys: false,
      includesScriptIds: false,
      includesScriptNames: false,
      includesUrls: false,
      includesFileHandles: false,
      includesLocalPaths: false
    }
  };
}

async function readGmValueSyncRetryHistoryForHealth() {
  try {
    const data = await chrome.storage.local.get('gmValueSyncRetryHistory');
    return summarizeGmValueSyncRetryHistoryForHealth(data?.gmValueSyncRetryHistory);
  } catch (_) {
    return summarizeGmValueSyncRetryHistoryForHealth([]);
  }
}

async function buildGmValueSyncHealthSummary(scripts: any = []) {
  const summary: any = createEmptyGmValueSyncHealthSummary({
    available: typeof ScriptValues !== 'undefined' && typeof ScriptValues?.getAll === 'function'
  });
  summary.lastResult = await readGmValueSyncLastResultForHealth();
  summary.retryResolution = await readGmValueSyncRetryResolutionForHealth();
  summary.retryResolutionHistory = await readGmValueSyncRetryResolutionHistoryForHealth();
  summary.retryHistory = await readGmValueSyncRetryHistoryForHealth();
  if (!summary.available) return summary;

  for (const script of scripts) {
    if (script?.settings?.syncValues !== true) continue;
    summary.optInScripts++;
    let values;
    try {
      values = await ScriptValues.getAll(script.id);
    } catch (_) {
      summary.valueReadFailures++;
      _gmValueSyncCountWarning(summary.warningCounts, 'valueReadFailed');
      continue;
    }

    const readiness = buildGmValueSyncReadinessForValues(script.id, values);
    if (readiness.reason === 'included') summary.readyBundles++;
    else summary.emptyBundles++;
    summary.totalKeys += readiness.keyCount;
    summary.totalBytes += readiness.bytes;

    const warningTotal: any = (Object.values(readiness.warningCounts) as any[])
      .reduce((sum, count) => sum + (Number(count) || 0), 0);
    if (warningTotal > 0) summary.scriptsWithWarnings++;
    for (const [id, count] of Object.entries(readiness.warningCounts)) {
      summary.warningCounts[id] = (summary.warningCounts[id] || 0) + (Number(count) || 0);
    }
  }

  return summary;
}

async function buildManagedPolicyHealthSummary(scripts: any = []) {
  const managed = chrome.storage?.managed;
  const summary: any = {
    available: !!managed,
    accessLevelControlAvailable: typeof managed?.setAccessLevel === 'function',
    policyReadStatus: managed ? 'not-configured' : 'unsupported',
    configuredEntries: 0,
    configuredUrlEntries: 0,
    configuredInlineEntries: 0,
    configuredInvalidEntries: 0,
    configuredIntegrityEntries: 0,
    configuredSignatureEntries: 0,
    configuredUnverifiedEntries: 0,
    cleanupEnabled: false,
    installedManagedScripts: scripts.filter((script: any) => script?.settings?.managed).length,
    lastRun: null
  };
  if (!managed) return summary;

  let policy;
  try {
    policy = await managed.get(MANAGED_SCRIPT_POLICY_KEYS);
  } catch (_) {
    return {
      ...summary,
      policyReadStatus: 'unavailable',
      lastRun: await readManagedPolicyRunSummary()
    };
  }

  const hasManagedScriptsKey = hasManagedScriptPolicyKey(policy, 'managedScripts');
  const hasCleanupKey = hasManagedScriptPolicyKey(policy, 'managedScriptsCleanup');
  const items = Array.isArray(policy?.managedScripts) ? policy.managedScripts : [];
  summary.policyReadStatus = hasManagedScriptsKey || hasCleanupKey ? 'readable' : 'not-configured';
  summary.cleanupEnabled = policy?.managedScriptsCleanup === true;
  summary.configuredEntries = items.length;
  if (summary.policyReadStatus !== 'not-configured') {
    summary.lastRun = await readManagedPolicyRunSummary();
  }
  if (hasManagedScriptsKey && !Array.isArray(policy?.managedScripts)) {
    summary.configuredInvalidEntries++;
  }

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      summary.configuredInvalidEntries++;
    } else if (typeof item.url === 'string' && item.url.trim()) {
      summary.configuredUrlEntries++;
    } else if (typeof item.code === 'string' && item.code) {
      summary.configuredInlineEntries++;
    } else {
      summary.configuredInvalidEntries++;
    }
    if (typeof item?.integrity === 'string' && item.integrity.trim()) summary.configuredIntegrityEntries++;
    if (item?.signature && typeof item.signature === 'object' && !Array.isArray(item.signature)) summary.configuredSignatureEntries++;
    if (!(typeof item?.integrity === 'string' && item.integrity.trim()) && !(item?.signature && typeof item.signature === 'object' && !Array.isArray(item.signature))) {
      summary.configuredUnverifiedEntries++;
    }
  }

  return summary;
}

function buildLocalHealthCallbackSummary() {
  const capSummary = (size: any, cap: any) => {
    const percentOfCap = cap > 0 ? _localHealthRoundPercent((size / cap) * 100) : 0;
    return {
      size,
      cap,
      percentOfCap,
      level: percentOfCap >= 100
        ? 'critical'
        : percentOfCap >= LOCAL_HEALTH_CALLBACK_WARNING_PERCENT
          ? 'warning'
          : 'ok'
    };
  };

  return {
    notificationCallbacks: capSummary(self._notifCallbacks?.size || 0, 500),
    openTabTrackers: capSummary(self._openTabTrackers?.size || 0, 1000),
    audioWatchedTabs: {
      size: self._audioWatchedTabs?.size || 0,
      level: 'ok'
    }
  };
}

function audioWatchKeysForTab(tabId: any): string[] {
  const watched = self._audioWatchedTabs;
  if (!(watched instanceof Set)) return [];
  const scriptIds: string[] = [];
  for (const key of watched) {
    if (typeof key !== 'string') continue;
    const separator = key.lastIndexOf(':');
    if (separator <= 0 || Number(key.slice(separator + 1)) !== tabId) continue;
    scriptIds.push(key.slice(0, separator));
  }
  return scriptIds;
}

function removeAudioWatchKeysForTab(tabId: any): boolean {
  const watched = self._audioWatchedTabs;
  if (!(watched instanceof Set)) return false;
  let changed = false;
  for (const key of [...watched]) {
    if (typeof key === 'string') {
      const separator = key.lastIndexOf(':');
      if (separator <= 0 || Number(key.slice(separator + 1)) !== tabId) continue;
    } else if (key !== tabId) {
      continue;
    }
    watched.delete(key);
    changed = true;
  }
  return changed;
}

function normalizeLocalWorkspacePermissionState(state: any) {
  const value = String(state || '').trim();
  return ['granted', 'prompt', 'denied'].includes(value) ? value : 'unknown';
}

function normalizeLocalWorkspaceStatusKind(binding: any) {
  const kind = String(binding?.lastErrorKind || binding?.lastStatusKind || '').trim();
  switch (kind) {
    case 'bound':
    case 'applied':
    case 'unchanged':
    case 'review-cancelled':
    case 'changes-pending':
    case 'conflict':
    case 'synced':
    case 'scan-failed':
    case 'permission-denied':
    case 'file-missing':
    case 'handle-missing':
    case 'too-large':
    case 'parse-failed':
    case 'read-failed':
    case 'apply-failed':
    case 'load-failed':
    case 'cancelled':
      return kind;
    default:
      return binding?.lastRefreshAt ? 'checked' : 'not-refreshed';
  }
}

function buildLocalWorkspaceHealthSummary(bindings: any = []) {
  const now = Date.now();
  const scriptIds = new Set();
  const permissionStates = { granted: 0, prompt: 0, denied: 0, unknown: 0 };
  const refreshStatuses = {};
  const errorStates = {};
  let refreshedBindings = 0;
  let neverRefreshed = 0;
  let staleRefreshes = 0;
  let mostRecentRefreshAgeDays = null;
  let oldestRefreshAgeDays = null;

  for (const binding of bindings) {
    if (binding?.scriptId) scriptIds.add(binding.scriptId);
    _localHealthCount(permissionStates, normalizeLocalWorkspacePermissionState(binding?.permissionState));
    const statusKind = normalizeLocalWorkspaceStatusKind(binding);
    _localHealthCount(refreshStatuses, statusKind);
    if (binding?.lastErrorKind) _localHealthCount(errorStates, statusKind);

    if (binding?.lastRefreshAt) {
      refreshedBindings++;
      const ageMs = Math.max(0, now - Number(binding.lastRefreshAt || 0));
      const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
      mostRecentRefreshAgeDays = mostRecentRefreshAgeDays == null ? ageDays : Math.min(mostRecentRefreshAgeDays, ageDays);
      oldestRefreshAgeDays = oldestRefreshAgeDays == null ? ageDays : Math.max(oldestRefreshAgeDays, ageDays);
      if (ageMs >= LOCAL_WORKSPACE_REFRESH_STALE_MS) staleRefreshes++;
    } else {
      neverRefreshed++;
    }
  }

  return {
    available: true,
    totalBindings: bindings.length,
    boundScripts: scriptIds.size,
    permissionStates,
    refreshStatuses,
    errorStates,
    refreshedBindings,
    neverRefreshed,
    staleRefreshes,
    staleRefreshThresholdDays: Math.round(LOCAL_WORKSPACE_REFRESH_STALE_MS / (24 * 60 * 60 * 1000)),
    mostRecentRefreshAgeDays,
    oldestRefreshAgeDays
  };
}

async function buildLocalWorkspaceHealthSummaryFromStore() {
  if (typeof LocalWorkspaceBindings === 'undefined' || typeof LocalWorkspaceBindings.list !== 'function') {
    return {
      available: false,
      totalBindings: 0,
      boundScripts: 0,
      permissionStates: { granted: 0, prompt: 0, denied: 0, unknown: 0 },
      refreshStatuses: {},
      errorStates: {},
      refreshedBindings: 0,
      neverRefreshed: 0,
      staleRefreshes: 0,
      staleRefreshThresholdDays: Math.round(LOCAL_WORKSPACE_REFRESH_STALE_MS / (24 * 60 * 60 * 1000)),
      mostRecentRefreshAgeDays: null,
      oldestRefreshAgeDays: null
    };
  }
  return buildLocalWorkspaceHealthSummary(await LocalWorkspaceBindings.list());
}

function buildLocalHealthWarningList({ runtime, storage, scripts, updates, callbacks, localWorkspace, managedPolicy, gmValueSync, collectionErrors }: any) {
  const warnings: any = [];
  const push = (id: any, level: any, message: any) => warnings.push({ id, level, message });

  if (runtime?.setupRequired) {
    push('userScriptsSetup', 'warning', runtime.setupMessage || 'UserScripts API setup requires attention');
  }
  if (storage?.level === 'warning' || storage?.level === 'critical') {
    push('storagePressure', storage.level, `Extension storage is ${storage.usagePercent}% full`);
  }
  if (scripts?.registrationErrors > 0) {
    push('registrationErrors', 'warning', `${scripts.registrationErrors} script registration error${scripts.registrationErrors === 1 ? '' : 's'} recorded`);
  }
  if (_lastRegistrationSweep?.failedScripts > 0) {
    push('registrationSweepFailures', 'warning', `${_lastRegistrationSweep.failedScripts} script registration${_lastRegistrationSweep.failedScripts === 1 ? '' : 's'} failed in the last sweep`);
  }
  if (_lastRegistrationSweep?.status === 'unavailable') {
    push('registrationSweepUnavailable', 'warning', 'The last registration sweep could not run because userScripts is unavailable');
  }
  if (scripts?.scriptsWithExecutionErrors > 0) {
    push('executionErrors', 'warning', `${scripts.scriptsWithExecutionErrors} script${scripts.scriptsWithExecutionErrors === 1 ? '' : 's'} have recorded execution errors`);
  }
  if (scripts?.slowScripts > 0) {
    push('slowScripts', 'warning', `${scripts.slowScripts} script${scripts.slowScripts === 1 ? '' : 's'} average at least ${scripts.slowScriptThresholdMs}ms per run`);
  }
  if (scripts?.staleRemoteScripts > 0) {
    push('staleRemoteScripts', 'info', `${scripts.staleRemoteScripts} remote-backed script${scripts.staleRemoteScripts === 1 ? '' : 's'} have not been updated in ${scripts.staleRemoteThresholdDays}+ days`);
  }
  if (scripts?.sourceIdentityChanged > 0) {
    push('sourceIdentityChanged', 'warning', `${scripts.sourceIdentityChanged} script${scripts.sourceIdentityChanged === 1 ? '' : 's'} changed install source identity`);
  }
  if (scripts?.backgroundScripts?.dormant > 0) {
    push('backgroundScriptsDormant', 'info', `${scripts.backgroundScripts.dormant} background script${scripts.backgroundScripts.dormant === 1 ? '' : 's'} dormant pending the DOM-less runner`);
  }
  if (updates?.reviewPendingUpdates > 0) {
    push('pendingUpdateReview', 'info', `${updates.reviewPendingUpdates} queued update${updates.reviewPendingUpdates === 1 ? '' : 's'} need review`);
  }
  if (localWorkspace?.permissionStates?.denied > 0) {
    push('localWorkspacePermissionDenied', 'warning', `${localWorkspace.permissionStates.denied} local workspace binding${localWorkspace.permissionStates.denied === 1 ? '' : 's'} need file permission`);
  }
  const localWorkspaceErrorCount: any = (Object.values(localWorkspace?.errorStates || {}) as any[])
    .reduce((sum, count) => sum + (Number(count) || 0), 0);
  if (localWorkspaceErrorCount > 0) {
    push('localWorkspaceRefreshErrors', 'warning', `${localWorkspaceErrorCount} local workspace binding${localWorkspaceErrorCount === 1 ? '' : 's'} have refresh errors`);
  }
  if (localWorkspace?.staleRefreshes > 0) {
    push('localWorkspaceStaleRefreshes', 'info', `${localWorkspace.staleRefreshes} local workspace binding${localWorkspace.staleRefreshes === 1 ? '' : 's'} have not been refreshed in ${localWorkspace.staleRefreshThresholdDays}+ days`);
  }
  if (managedPolicy?.configuredInvalidEntries > 0) {
    push('managedPolicyInvalidEntries', 'warning', `${managedPolicy.configuredInvalidEntries} managed policy entr${managedPolicy.configuredInvalidEntries === 1 ? 'y is' : 'ies are'} not installable`);
  }
  if (managedPolicy?.configuredUnverifiedEntries > 0) {
    push('managedPolicyUnverifiedEntries', 'warning', `${managedPolicy.configuredUnverifiedEntries} managed policy entr${managedPolicy.configuredUnverifiedEntries === 1 ? 'y is' : 'ies are'} missing an integrity pin or trusted signature`);
  }
  if (managedPolicy?.configuredEntries > 0 && managedPolicy?.installedManagedScripts === 0) {
    push('managedPolicyNotApplied', 'warning', `${managedPolicy.configuredEntries} managed policy entr${managedPolicy.configuredEntries === 1 ? 'y has' : 'ies have'} not produced an installed managed script yet`);
  }
  const managedPolicyRunFailures = (managedPolicy?.lastRun?.failedEntries || 0) + (managedPolicy?.lastRun?.pruneFailedScripts || 0);
  if (managedPolicyRunFailures > 0) {
    push('managedPolicyRunFailures', 'warning', `${managedPolicyRunFailures} managed policy operation${managedPolicyRunFailures === 1 ? '' : 's'} failed during the last apply run`);
  }
  if (managedPolicy?.lastRun?.skippedInvalidEntries > 0) {
    push('managedPolicyRunSkippedEntries', 'warning', `${managedPolicy.lastRun.skippedInvalidEntries} managed policy entr${managedPolicy.lastRun.skippedInvalidEntries === 1 ? 'y was' : 'ies were'} skipped during the last apply run`);
  }
  if (gmValueSync?.optInScripts > 0 && gmValueSync?.providerWritesEnabled === false) {
    push('gmValueSyncProviderWritesPending', 'info', `${gmValueSync.optInScripts} script${gmValueSync.optInScripts === 1 ? '' : 's'} opted into GM value sync; provider value writes are not enabled yet`);
  }
  if (gmValueSync?.scriptsWithWarnings > 0) {
    push('gmValueSyncBundleWarnings', 'warning', `${gmValueSync.scriptsWithWarnings} GM value sync opt-in script${gmValueSync.scriptsWithWarnings === 1 ? '' : 's'} have values excluded by sync caps or JSON validation`);
  }
  if (gmValueSync?.valueReadFailures > 0) {
    push('gmValueSyncValueReadFailures', 'warning', `${gmValueSync.valueReadFailures} GM value sync opt-in script${gmValueSync.valueReadFailures === 1 ? '' : 's'} could not be inspected for sync readiness`);
  }
  if (gmValueSync?.lastResult?.writeFailureRetryReady > 0) {
    push('gmValueSyncWriteRetryReady', 'warning', `${gmValueSync.lastResult.writeFailureRetryReady} GM value sync preserved write${gmValueSync.lastResult.writeFailureRetryReady === 1 ? '' : 's'} ready to retry`);
  }
  for (const [id, block] of Object.entries(callbacks || {}) as Array<[string, any]>) {
    if (block?.level === 'warning' || block?.level === 'critical') {
      push(id, block.level, `${id} is at ${block.percentOfCap}% of its cap`);
    }
  }
  for (const entry of collectionErrors || []) {
    push(entry.id, 'warning', entry.message);
  }

  return warnings;
}

async function buildLocalHealthReport() {
  const collectionErrors = [];
  const [runtimeResult, scriptsResult, settingsResult, pendingResult, recentResult, storageResult, localWorkspaceResult] = await Promise.allSettled([
    probeUserScriptsAvailability(),
    ScriptStorage.getAll(),
    SettingsManager.get(),
    UpdateSystem.getPendingUpdates(),
    Promise.resolve(UpdateSystem.getRecentUpdates()),
    buildLocalHealthStorageSummary(),
    buildLocalWorkspaceHealthSummaryFromStore()
  ]);

  const runtime: any = runtimeResult.status === 'fulfilled'
    ? runtimeResult.value
    : buildUserScriptsStatus({
        userScriptsAvailable: false,
        chromeVersion: _getChromeVersion(),
        probeError: _localHealthSanitizeError(runtimeResult.reason)
      });
  if (runtimeResult.status === 'rejected') {
    collectionErrors.push({ id: 'runtimeProbeFailed', message: 'Runtime setup probe failed' });
  }

  const healthSettings = settingsResult.status === 'fulfilled'
    ? settingsResult.value
    : { experimentalBackgroundScripts: false };
  if (settingsResult.status === 'rejected') {
    collectionErrors.push({ id: 'settingsSummaryFailed', message: 'Settings health summary failed' });
  }

  const scripts = scriptsResult.status === 'fulfilled' && Array.isArray(scriptsResult.value)
    ? buildLocalHealthScriptSummary(scriptsResult.value, healthSettings)
    : buildLocalHealthScriptSummary([], healthSettings);
  const scriptList: any = scriptsResult.status === 'fulfilled' && Array.isArray(scriptsResult.value)
    ? scriptsResult.value
    : [];
  if (scriptsResult.status === 'rejected') {
    collectionErrors.push({ id: 'scriptSummaryFailed', message: 'Script inventory health summary failed' });
  }

  const pendingUpdates = pendingResult.status === 'fulfilled' && Array.isArray(pendingResult.value)
    ? pendingResult.value
    : [];
  if (pendingResult.status === 'rejected') {
    collectionErrors.push({ id: 'pendingUpdatesFailed', message: 'Pending update queue health summary failed' });
  }
  const recentUpdates = recentResult.status === 'fulfilled' && Array.isArray(recentResult.value)
    ? recentResult.value
    : [];
  const updates = {
    pendingUpdates: pendingUpdates.length,
    safePendingUpdates: pendingUpdates.filter(item => item?.safeToApply).length,
    reviewPendingUpdates: pendingUpdates.filter(item => !item?.safeToApply).length,
    recentUpdates: recentUpdates.length,
    pendingCap: UpdateSystem._MAX_PENDING_UPDATES
  };

  const storage = storageResult.status === 'fulfilled'
    ? storageResult.value
    : {
        available: false,
        usageBytes: 0,
        quotaBytes: 0,
        usagePercent: 0,
        usageFormatted: '0 B',
        quotaFormatted: '0 B',
        level: 'error',
        error: _localHealthSanitizeError(storageResult.reason)
      };
  if (storageResult.status === 'rejected') {
    collectionErrors.push({ id: 'storageEstimateFailed', message: 'Storage estimate health summary failed' });
  }

  const localWorkspace = localWorkspaceResult.status === 'fulfilled'
    ? localWorkspaceResult.value
    : { ...buildLocalWorkspaceHealthSummary([]), available: false };
  if (localWorkspaceResult.status === 'rejected') {
    collectionErrors.push({ id: 'localWorkspaceSummaryFailed', message: 'Local workspace health summary failed' });
  }

  let managedPolicy = null;
  try {
    managedPolicy = await buildManagedPolicyHealthSummary(scriptList);
  } catch (_) {
    managedPolicy = {
      available: false,
      accessLevelControlAvailable: false,
      policyReadStatus: 'error',
      configuredEntries: 0,
      configuredUrlEntries: 0,
      configuredInlineEntries: 0,
      configuredInvalidEntries: 0,
      configuredIntegrityEntries: 0,
      configuredSignatureEntries: 0,
      configuredUnverifiedEntries: 0,
      cleanupEnabled: false,
      installedManagedScripts: scripts.managedScripts,
      lastRun: null
    };
    collectionErrors.push({ id: 'managedPolicySummaryFailed', message: 'Managed policy health summary failed' });
  }

  let gmValueSync = null;
  try {
    gmValueSync = await buildGmValueSyncHealthSummary(scriptList);
  } catch (_) {
    gmValueSync = createEmptyGmValueSyncHealthSummary({ available: false });
    collectionErrors.push({ id: 'gmValueSyncSummaryFailed', message: 'GM value sync readiness summary failed' });
  }

  const callbacks = buildLocalHealthCallbackSummary();
  const warnings = buildLocalHealthWarningList({ runtime, storage, scripts, updates, callbacks, localWorkspace, managedPolicy, gmValueSync, collectionErrors });

  return {
    schema: LOCAL_HEALTH_SCHEMA,
    generatedAt: new Date().toISOString(),
    privacy: {
      localOnly: true,
      includesScriptSource: false,
      includesScriptNames: false,
      includesUrls: false,
      includesFileHandles: false,
      includesLocalPaths: false,
      includesExternalBeacons: false
    },
    runtime: {
      userScriptsAvailable: !!runtime.userScriptsAvailable,
      userScriptsApiAvailable: !!runtime.userScriptsApiAvailable,
      userScriptsUpdateAvailable: !!runtime.userScriptsUpdateAvailable,
      setupRequired: !!runtime.setupRequired,
      setupState: runtime.setupState,
      setupTitle: runtime.setupTitle,
      setupAction: runtime.setupAction,
      setupMessage: runtime.setupMessage,
      chromeVersion: runtime.chromeVersion,
      apiProbeError: runtime.apiProbeError || ''
    },
    storage,
    registration: _lastRegistrationSweep,
    scripts,
    managedPolicy,
    gmValueSync,
    localWorkspace,
    updates,
    callbacks,
    warnings
  };
}

// ============================================================================
// Script Subscriptions
// ============================================================================

const MAX_SCRIPT_SIZE = 5 * 1024 * 1024; // 5MB limit
function _scriptSourceByteLength(code: any) {
  return typeof code === 'string' ? new TextEncoder().encode(code).byteLength : 0;
}
const SUBSCRIPTION_REFRESH_ALARM = 'subscriptionRefresh';
const DEFAULT_SUBSCRIPTION_REFRESH_INTERVAL_HOURS = 24;

function rewriteSubscriptionMemberConnect(code: any, connect: any[] = []) {
  const source = String(code || '');
  const block = source.match(/(\/\/\s*==UserScript==)([\s\S]*?)(\/\/\s*==\/UserScript==)/);
  if (!block) return source;
  const body = (block[2] || '')
    .split(/\r?\n/)
    .filter((line: string) => !/^\s*\/\/\s*@connect(?:\s|$)/i.test(line))
    .join('\n')
    .replace(/^\n+|\n+$/g, '');
  const connectLines = (Array.isArray(connect) ? connect : [])
    .map((item: any) => String(item || '').trim())
    .filter(Boolean)
    .map((item: string) => `// @connect ${item}`);
  const nextBody = [body, ...connectLines].filter(Boolean).join('\n');
  return source.replace(block[0], `${block[1]}\n${nextBody}\n${block[3]}`);
}

function subscriptionMemberIdentity(meta: any = {}) {
  return `${String(meta.name || '').trim()}\n${String(meta.namespace || '').trim()}`;
}

const SubscriptionSystem = {
  _FETCH_TIMEOUT_MS: 15 * 1000,
  _MAX_FEED_BYTES: 512 * 1024,
  _MAX_SCRIPT_BYTES: MAX_SCRIPT_SIZE,
  _MAX_SCRIPTS_PER_REFRESH: 50,

  async prepareBundle(code: any, sourceUrl: any = '') {
    const parsedBundle: any = parseUserSubscribe(code, sourceUrl);
    if (parsedBundle?.error) return { success: false, error: parsedBundle.error };
    const bundleMeta = parsedBundle.meta || {};
    const installed = await ScriptStorage.getAll();
    const installedByIdentity = new Map<string, any>(installed.map((script: any) => [subscriptionMemberIdentity(script.meta), script] as [string, any]));
    const members = [];
    const errors = [];
    for (const url of bundleMeta.scriptUrl || []) {
      try {
        const memberCode = await this.fetchScript(url);
        const parsed = parseUserscript(memberCode);
        if (parsed.error) throw new Error(parsed.error);
        const originalConnect = Array.isArray(parsed.meta?.connect) ? [...parsed.meta.connect] : [];
        const effectiveConnect = typeof ScriptSubscriptions?.constrainConnectPatterns === 'function'
          ? ScriptSubscriptions.constrainConnectPatterns(originalConnect, bundleMeta.connect)
          : originalConnect;
        const effectiveCode = rewriteSubscriptionMemberConnect(memberCode, effectiveConnect);
        const effectiveParsed = parseUserscript(effectiveCode);
        if (effectiveParsed.error) throw new Error(effectiveParsed.error);
        const existing = installedByIdentity.get(subscriptionMemberIdentity(effectiveParsed.meta));
        const analysis = await analyzeSyncedScriptCode(effectiveCode);
        members.push({
          url,
          code: effectiveCode,
          name: effectiveParsed.meta.name || url,
          namespace: effectiveParsed.meta.namespace || '',
          version: effectiveParsed.meta.version || '',
          description: effectiveParsed.meta.description || '',
          grants: Array.isArray(effectiveParsed.meta.grant) ? [...effectiveParsed.meta.grant] : [],
          originalConnect,
          effectiveConnect,
          riskLevel: analysis?.riskLevel || 'unknown',
          totalRisk: Number(analysis?.totalRisk) || 0,
          findings: Array.isArray(analysis?.findings) ? analysis.findings.slice(0, 20) : [],
          existingId: existing?.id || '',
        });
      } catch (error: any) {
        errors.push(`${url}: ${error?.message || String(error)}`);
      }
    }
    return {
      success: errors.length === 0,
      error: errors.length ? 'One or more subscription members could not be reviewed' : undefined,
      kind: 'subscription',
      name: bundleMeta.name || 'Script subscription',
      description: bundleMeta.description || '',
      version: bundleMeta.version || '',
      author: bundleMeta.author || '',
      connect: Array.isArray(bundleMeta.connect) ? [...bundleMeta.connect] : [],
      sourceUrl: sourceUrl || '',
      members,
      errors,
    };
  },

  async installBundle(code: any, sourceUrl: any = '') {
    const preview = await this.prepareBundle(code, sourceUrl);
    if (!preview.success || !Array.isArray(preview.members) || preview.members.length === 0) {
      return { success: false, error: preview.error || 'Subscription has no installable members', preview };
    }
    const installed = [];
    for (const member of preview.members) {
      const result: any = await installFromCode(member.code, {
        sourceUrl: member.url,
        operation: 'subscription-install',
      });
      if (!result?.success) {
        return { success: false, error: result?.error || `Failed to install ${member.name}`, installed, preview };
      }
      const current = await ScriptStorage.get(result.script?.id);
      if (current) {
        current.settings = {
          ...(current.settings || {}),
          subscriptionId: preview.sourceUrl || sourceUrl,
          subscriptionName: preview.name,
          subscriptionMemberUrl: member.url,
          subscriptionConnect: preview.connect,
          subscriptionOriginalConnect: member.originalConnect,
        };
        await ScriptStorage.set(current.id, current);
      }
      installed.push({ id: result.script?.id || '', name: member.name, url: member.url });
    }
    let subscription: any = null;
    try {
      const bundle = {
        sourceUrl: sourceUrl || preview.sourceUrl,
        name: preview.name,
        description: preview.description,
        version: preview.version,
        author: preview.author,
        connect: preview.connect,
        scripts: preview.members.map((member: any) => ({ url: member.url, name: member.name, namespace: member.namespace, version: member.version })),
        metaBlock: '',
        code: String(code || ''),
        parsedAt: Date.now(),
      };
      subscription = await ScriptSubscriptions.upsertBundle(bundle);
      await setupAlarms().catch(() => {});
      } catch (_) {
      // Installing the reviewed members is durable even if subscription index
      // storage is temporarily unavailable; the next refresh can repair it.
    }
    // The subscription record owns the stable id used by refresh/removal
    // reconciliation. Retag the freshly installed members after the record is
    // persisted so future refreshes can propose uninstalling removed members.
    if (subscription?.id) {
      for (const entry of installed) {
        if (!entry?.id) continue;
        const current = await ScriptStorage.get(entry.id);
        if (!current) continue;
        current.settings = {
          ...(current.settings || {}),
          subscriptionId: subscription.id,
        };
        await ScriptStorage.set(current.id, current);
      }
    }
    return { success: true, subscription, installed, preview };
  },

  async fetchText(url: any, label: any, maxBytes: any, options: any = {}) {
    InternalHostGuard.assertExternalFetchUrl(url, label, ['http:', 'https:']);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this._FETCH_TIMEOUT_MS);
    try {
      // Feed and feed-script reads go through the same freshness policy as
      // update checks: never answered from the shared HTTP cache, conditional
      // only for the alarm-driven sweep.
      const intent = options.intent || 'manual-feed';
      const response = await fetch(url, FetchFreshness.buildFreshnessInit(intent, {
        etag: options.etag,
        lastModified: options.lastModified,
        init: { signal: controller.signal }
      }));
      if (response.status === 304) {
        // Conditional feed pull with an unchanged body — the caller keeps the
        // feed it already has rather than reparsing an empty response.
        return { notModified: true, text: '', response };
      }
      if (!response.ok) {
        throw new Error(`${label} fetch failed with HTTP ${response.status}`);
      }
      const postCheck = InternalHostGuard.classifyResponseUrl(response, ['http:', 'https:']);
      if (!postCheck.ok) {
        throw new Error(`${label} redirected to ${postCheck.message}`);
      }
      const text = await _fetchTextBounded(response, maxBytes, label);
      return { notModified: false, text, response };
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error(`${label} fetch timed out after ${Math.round(this._FETCH_TIMEOUT_MS / 1000)} seconds`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async fetchFeed(url: any, options: any = {}) {
    const feedUrl = ScriptSubscriptions.normalizeFeedUrl(url);
    const intent = options.intent || 'manual-feed';
    const result = await this.fetchText(feedUrl, 'Subscription feed', this._MAX_FEED_BYTES, {
      intent,
      etag: options.etag,
      lastModified: options.lastModified
    });
    if (result.notModified) {
      return { notModified: true, sourceUrl: feedUrl, validators: null };
    }
    const feed = ScriptSubscriptions.parseFeed(result.text, feedUrl);
    return {
      ...feed,
      notModified: false,
      validators: FetchFreshness.readResponseValidators(intent, result.response)
    };
  },

  async fetchBundle(url: any, options: any = {}) {
    const bundleUrl = ScriptSubscriptions.normalizeHttpsUrl(url);
    const intent = options.intent || 'manual-feed';
    const result = await this.fetchText(bundleUrl, 'Subscription bundle', this._MAX_FEED_BYTES, {
      intent,
      etag: options.etag,
      lastModified: options.lastModified
    });
    if (result.notModified) return { notModified: true, sourceUrl: bundleUrl, validators: null };
    const parsed = parseUserSubscribe(result.text, bundleUrl);
    if (parsed.error) throw new Error(parsed.error);
    return {
      ...parsed,
      notModified: false,
      validators: FetchFreshness.readResponseValidators(intent, result.response)
    };
  },

  async fetchSubscriptionSource(url: any, options: any = {}) {
    const sourceUrl = ScriptSubscriptions.normalizeFeedUrl(url);
    const intent = options.intent || 'manual-feed';
    const result = await this.fetchText(sourceUrl, 'Subscription source', this._MAX_FEED_BYTES, {
      intent,
      etag: options.etag,
      lastModified: options.lastModified
    });
    if (result.notModified) return { notModified: true, sourceUrl, validators: null, kind: options.kind || 'feed' };
    const validators = FetchFreshness.readResponseValidators(intent, result.response);
    if (result.text.includes('==UserSubscribe==')) {
      const bundle = parseUserSubscribe(result.text, sourceUrl);
      if (bundle.error) throw new Error(bundle.error);
      return { ...bundle, kind: 'bundle', notModified: false, validators };
    }
    const feed = ScriptSubscriptions.parseFeed(result.text, sourceUrl);
    return { ...feed, kind: 'feed', notModified: false, validators };
  },

  async fetchScript(url: any) {
    const scriptUrl = ScriptSubscriptions.normalizeFeedUrl(url);
    // A feed-listed script body is always read in full: a 304 would leave
    // nothing to install, so this intent never sends validators.
    const result = await this.fetchText(scriptUrl, 'Subscription script', this._MAX_SCRIPT_BYTES, {
      intent: 'feed-script'
    });
    return result.text;
  },

  hashString(input: any) {
    let hash = 2166136261;
    const text = String(input || '');
    for (let i = 0; i < text.length; i++) {
      hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
    }
    return hash.toString(36);
  },

  scriptIdentity(meta: any = {}) {
    const name = meta.name || '';
    if (!name) return '';
    return `${name}\n${meta.namespace || ''}`;
  },

  collectScriptSourceUrls(script: any) {
    return [
      script?.meta?.downloadURL,
      script?.meta?.updateURL,
      script?.trustReceipt?.source?.downloadUrl,
      script?.trustReceipt?.source?.updateUrl,
      script?.trustReceipt?.source?.installUrl,
      script?.installSource?.url
    ].filter(Boolean);
  },

  async buildBundleCandidates(subscription: any, members: any[] = []) {
    const installedScripts = await ScriptStorage.getAll();
    const byIdentity = new Map<string, any>(installedScripts.map((script: any) => [subscriptionMemberIdentity(script.meta), script] as [string, any]));
    const byMemberUrl = new Map<string, any>(installedScripts
      .filter((script: any) => script?.settings?.subscriptionMemberUrl)
      .map((script: any) => [script.settings.subscriptionMemberUrl, script] as [string, any]));
    const pending = await UpdateSystem.getPendingUpdates();
    const pendingIds = new Set(pending.map((item: any) => item.id));
    const installs = [];
    const updates = [];
    let skipped = 0;
    for (const member of Array.isArray(members) ? members.slice(0, this._MAX_SCRIPTS_PER_REFRESH) : []) {
      const existing = byMemberUrl.get(member.url) || byIdentity.get(`${member.name}\n${member.namespace || ''}`);
      if (!member?.code || !member?.url) {
        skipped++;
        continue;
      }
      if (!existing) {
        const id = `subscription_${subscription.id}_${this.hashString(member.url)}`;
        if (pendingIds.has(id)) {
          skipped++;
          continue;
        }
        installs.push({
          id,
          code: member.code,
          sourceUrl: member.url,
          name: member.name,
          newVersion: member.version,
          subscriptionId: subscription.id,
          subscriptionName: subscription.name
        });
        continue;
      }
      if (existing.code !== member.code && existing.id && !pendingIds.has(existing.id)) {
        updates.push({
          id: existing.id,
          code: member.code,
          sourceUrl: member.url,
          name: member.name,
          currentVersion: existing.meta?.version || '',
          newVersion: member.version
        });
      } else {
        skipped++;
      }
    }
    return { installs, updates, skipped };
  },

  async buildInstallCandidates(subscription: any, scripts: any = []) {
    const installedScripts = await ScriptStorage.getAll();
    const installedIdentities = new Set();
    const installedSources = new Set();
    installedScripts.forEach((script: any) => {
      const identity = this.scriptIdentity(script?.meta || {});
      if (identity) installedIdentities.add(identity);
      this.collectScriptSourceUrls(script).forEach(url => installedSources.add(url));
    });

    const pending = await UpdateSystem.getPendingUpdates();
    const pendingSources = new Set(pending.map((item: any) => item.sourceUrl).filter(Boolean));
    const pendingIdentities = new Set(pending.map((item: any) => item.kind === 'subscription-install' ? `${item.name || ''}\n` : '').filter(Boolean));
    const installs = [];
    const errors = [];
    let skipped = 0;

    for (const item of (Array.isArray(scripts) ? scripts : []).slice(0, this._MAX_SCRIPTS_PER_REFRESH)) {
      if (!item?.url) {
        skipped++;
        continue;
      }
      if (installedSources.has(item.url) || pendingSources.has(item.url)) {
        skipped++;
        continue;
      }
      const hintedIdentity = item.name ? `${item.name}\n${item.namespace || ''}` : '';
      if (hintedIdentity && (installedIdentities.has(hintedIdentity) || pendingIdentities.has(hintedIdentity))) {
        skipped++;
        continue;
      }

      try {
        const code = await this.fetchScript(item.url);
        const parsed = parseUserscript(code);
        if (parsed.error) {
          errors.push(`${item.url}: ${parsed.error}`);
          skipped++;
          continue;
        }
        const identity = this.scriptIdentity(parsed.meta || {});
        if (identity && (installedIdentities.has(identity) || pendingIdentities.has(identity))) {
          skipped++;
          continue;
        }
        if (identity) pendingIdentities.add(identity);
        pendingSources.add(item.url);
        installs.push({
          id: `subscription_${subscription.id}_${this.hashString(item.url || identity)}`,
          code,
          sourceUrl: item.url,
          name: parsed.meta?.name || item.name || item.url,
          newVersion: parsed.meta?.version || item.version || '',
          subscriptionId: subscription.id,
          subscriptionName: subscription.name
        });
      } catch (error: any) {
        errors.push(`${item.url}: ${error?.message || error}`);
        skipped++;
      }
    }

    return { installs, skipped, errors };
  },

  async list() {
    return {
      success: true,
      subscriptions: await ScriptSubscriptions.list()
    };
  },

  async addSubscription(url: any, name: any = '') {
    if (!url) return { success: false, error: 'Subscription URL is required' };
    try {
      // Adding a feed is an explicit action — read it unconditionally.
      const source = await this.fetchSubscriptionSource(url, { intent: 'manual-feed' });
      let subscription;
      if (source.kind === 'bundle') {
        const preview = await this.prepareBundle(source.code, source.sourceUrl);
        if (!preview.success) return { success: false, error: preview.error || 'Subscription review failed', preview };
        const reviewedMembers = Array.isArray(preview.members) ? preview.members : [];
        const existingSubscription = await ScriptSubscriptions.get(source.sourceUrl);
        subscription = existingSubscription || await ScriptSubscriptions.upsertBundle({
          sourceUrl: source.sourceUrl,
          name: source.name,
          description: source.description,
          version: source.version,
          author: source.author,
          connect: source.connect,
          scripts: reviewedMembers.map((member: any) => ({ url: member.url, name: member.name, namespace: member.namespace, version: member.version })),
          metaBlock: source.metaBlock,
          code: source.code,
          parsedAt: source.parsedAt
        }, { name, validators: source.validators });
        const result = await this.refreshSubscription(subscription.id, { bundle: source, subscription });
        if (result?.success) {
          await setupAlarms().catch(() => {});
        }
        return result;
      } else {
        subscription = await ScriptSubscriptions.upsertFromFeed(source.sourceUrl, source, {
          name,
          validators: source.validators
        });
        const feed = source;
        const result = await this.refreshSubscription(subscription.id, { feed, subscription });
        if (result?.success) {
          await setupAlarms().catch(() => {});
        }
        return result;
      }
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  },

  async refreshSubscription(id: any, options: any = {}) {
    if (!id) return { success: false, error: 'Subscription id is required' };
    try {
      let subscription = options.subscription || await ScriptSubscriptions.get(id);
      if (!subscription) return { success: false, error: 'Subscription not found' };
      if (subscription.kind === 'bundle' || options.bundle) {
        let bundle = options.bundle || null;
        if (!bundle) {
          const intent = options.intent || 'manual-feed';
          bundle = await this.fetchSubscriptionSource(subscription.url, {
            intent,
            etag: subscription.httpEtag,
            lastModified: subscription.httpLastModified,
            kind: 'bundle'
          });
          if (bundle.notModified) {
            const unchanged = await ScriptSubscriptions.markRefreshResult(subscription.id, {
              queued: 0,
              skipped: 0,
              errors: [],
              notModified: true
            });
            return { success: true, subscription: unchanged || subscription, notModified: true, queued: 0, skipped: 0, errors: [] };
          }
        }
        const preview = await this.prepareBundle(bundle.code, bundle.sourceUrl || subscription.url);
        if (!preview.success) {
          const failed = await ScriptSubscriptions.markRefreshResult(subscription.id, { queued: 0, skipped: 0, errors: preview.errors || [preview.error || 'Subscription review failed'] });
          return { success: false, error: preview.error || 'Subscription review failed', subscription: failed || subscription, errors: preview.errors || [] };
        }
        const reviewedMembers = Array.isArray(preview.members) ? preview.members : [];
        const candidates = await this.buildBundleCandidates(subscription, reviewedMembers);
        const installQueue = await UpdateSystem.queueSubscriptionInstalls(candidates.installs, {
          source: `subscription:${subscription.id}`
        });
        const updateQueue = await UpdateSystem.queueUpdates(candidates.updates, {
          source: `subscription:${subscription.id}`
        });
        const previousUrls = new Set((Array.isArray(subscription.scripts) ? subscription.scripts : []).map((item: any) => item?.url).filter(Boolean));
        const nextUrls = new Set(reviewedMembers.map((item: any) => item.url));
        const installedMembers = await ScriptStorage.getAll();
        const removals = installedMembers
          .filter((script: any) => script?.settings?.subscriptionId === subscription.id
            && script?.settings?.subscriptionMemberUrl
            && previousUrls.has(script.settings.subscriptionMemberUrl)
            && !nextUrls.has(script.settings.subscriptionMemberUrl))
          .map((script: any) => ({
            id: `subscription_remove_${subscription.id}_${this.hashString(script.id)}`,
            scriptId: script.id,
            name: script.meta?.name || script.id,
            sourceUrl: subscription.url,
            subscriptionId: subscription.id,
            subscriptionName: subscription.name
          }));
        const removalQueue = await UpdateSystem.queueSubscriptionRemovals(removals, {
          source: `subscription:${subscription.id}`
        });
        const updated = await ScriptSubscriptions.upsertBundle({
          sourceUrl: bundle.sourceUrl || subscription.url,
          name: preview.name,
          description: preview.description,
          version: preview.version,
          author: preview.author,
          connect: preview.connect,
          scripts: reviewedMembers.map((member: any) => ({ url: member.url, name: member.name, namespace: member.namespace, version: member.version })),
          metaBlock: bundle.metaBlock || '',
          code: bundle.code,
          parsedAt: bundle.parsedAt || Date.now()
        }, { name: subscription.name, validators: bundle.validators });
        const queued = (installQueue.queued || 0) + (updateQueue.queued || 0) + (removalQueue.queued || 0);
        const skipped = (candidates.skipped || 0);
        const resultErrors = [...(preview.errors || [])];
        const refreshed = await ScriptSubscriptions.markRefreshResult(updated.id, {
          queued,
          skipped,
          errors: resultErrors
        });
        return {
          success: true,
          subscription: refreshed || updated,
          queued,
          skipped,
          errors: resultErrors,
          pendingUpdates: await UpdateSystem.getPendingUpdates()
        };
      }
      let feed = options.feed || null;
      if (!feed) {
        // Only the alarm-driven sweep sends validators; a hand-triggered
        // refresh always re-reads the feed body.
        const intent = options.intent || 'manual-feed';
        feed = await this.fetchFeed(subscription.url, {
          intent,
          etag: subscription.httpEtag,
          lastModified: subscription.httpLastModified
        });
        if (feed.notModified) {
          // Feed unchanged since the last read — record the check without
          // reparsing, and keep the cached item list as the queue input.
          const unchanged = await ScriptSubscriptions.markRefreshResult(subscription.id, {
            queued: 0,
            skipped: 0,
            errors: [],
            notModified: true
          });
          return {
            success: true,
            subscription: unchanged || subscription,
            notModified: true,
            queued: 0,
            skipped: 0,
            errors: []
          };
        }
        subscription = await ScriptSubscriptions.upsertFromFeed(subscription.url, feed, {
          name: subscription.name,
          enabled: subscription.enabled,
          validators: feed.validators
        });
      }

      const { installs, skipped, errors } = await this.buildInstallCandidates(subscription, feed.scripts);
      const queueResult = await UpdateSystem.queueSubscriptionInstalls(installs, {
        source: `subscription:${subscription.id}`
      });
      const updated = await ScriptSubscriptions.markRefreshResult(subscription.id, {
        queued: queueResult.queued,
        skipped,
        errors
      });

      return {
        success: true,
        subscription: updated || subscription,
        queued: queueResult.queued,
        skipped,
        errors,
        pendingUpdates: queueResult.pendingUpdates
      };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  },

  async refreshSubscriptions(options: any = {}) {
    const subscriptions = await ScriptSubscriptions.list();
    const results = [];
    let queued = 0;
    let skipped = 0;
    const errors = [];
    // The alarm sweep is the only conditional feed reader.
    const intent = options.intent || 'scheduled-feed';

    for (const subscription of subscriptions.filter((item: any) => item.enabled !== false)) {
      const result = await this.refreshSubscription(subscription.id, { intent });
      results.push(result);
      if (result?.success) {
        queued += result.queued || 0;
        skipped += result.skipped || 0;
        errors.push(...(result.errors || []));
      } else if (result?.error) {
        errors.push(`${subscription.name}: ${result.error}`);
      }
    }

    return {
      success: true,
      queued,
      skipped,
      errors,
      results,
      subscriptions: await ScriptSubscriptions.list(),
      pendingUpdates: await UpdateSystem.getPendingUpdates()
    };
  },

  async removeSubscription(id: any) {
    if (!id) return { success: false, error: 'Subscription id is required' };
    const removed = await ScriptSubscriptions.remove(id);
    if (removed) {
      await setupAlarms().catch(() => {});
    }
    return {
      success: true,
      removed,
      subscriptions: await ScriptSubscriptions.list()
    };
  }
};

// ============================================================================
// Cloud Sync
// ============================================================================

function getSyncCredentialStore() {
  try {
    return CloudSyncProviders?._credentialStore || null;
  } catch (_) {
    return null;
  }
}

async function getEffectiveSyncSettings(settings: any) {
  const store = getSyncCredentialStore();
  if (store && typeof store.resolveSettings === 'function') {
    return await store.resolveSettings(settings);
  }
  return settings;
}

async function persistSyncSettingsUpdate(update: any, baseSettings: any) {
  const store = getSyncCredentialStore();
  if (store && typeof store.persistSettingsUpdate === 'function') {
    return await store.persistSettingsUpdate(update, baseSettings);
  }
  return await SettingsManager.set(update);
}

async function clearSyncSessionCredentials() {
  const store = getSyncCredentialStore();
  if (store && typeof store.clearSessionCredentials === 'function') {
    await store.clearSessionCredentials();
  }
}

// CloudSync orchestration is generated from src/background/cloud-sync.ts and loaded before this core bridge.
async function buildSyncProviderHealth(providerName: any) {
  if (!providerName || providerName === 'none') {
    return {
      success: true,
      provider: 'none',
      providerLabel: 'Not configured',
      connected: false,
      status: 'not_configured',
      lastSync: null,
      canRevoke: false,
      canManualSync: false,
      canDryRun: false,
      storageDisclosure: null
    };
  }

  const provider = CloudSyncProviders[providerName];
  if (!provider) return { success: false, connected: false, error: `Unknown provider: ${providerName}` };

  const settings = await getEffectiveSyncSettings(await SettingsManager.get());
  let status: any = {};
  try {
    if (typeof provider.getStatus === 'function') {
      status = await provider.getStatus(settings);
    } else if (typeof provider.test === 'function') {
      const test = await provider.test(settings);
      status = {
        connected: test?.success === true || test?.ok === true,
        error: test?.error || test?.message || null
      };
    }
  } catch (e: any) {
    status = { connected: false, error: e?.message || String(e) };
  }

  let storageDisclosure = null;
  try {
    storageDisclosure = typeof provider.getStorageDisclosure === 'function'
      ? provider.getStorageDisclosure(settings)
      : null;
  } catch (_e) {
    storageDisclosure = null;
  }

  const connected = status?.connected === true || status?.success === true || status?.ok === true;
  return {
    success: true,
    provider: providerName,
    providerLabel: provider.name || providerName,
    connected,
    status: status?.status || (connected ? 'ok' : 'not_connected'),
    error: status?.error || null,
    user: status?.user || null,
    endpointHost: status?.endpointHost || null,
    lastSync: status?.lastSync || settings.lastSync || null,
    canRevoke: typeof provider.disconnect === 'function',
    canManualSync: provider.supportsManualSync !== false && typeof provider.upload === 'function',
    canDryRun: provider.supportsDryRun !== false && typeof provider.download === 'function',
    storageDisclosure
  };
}

// ============================================================================
// Import/Export
// ============================================================================

const ARCHIVE_MAX_SCRIPT_BYTES = 5 * 1024 * 1024;
const ARCHIVE_MAX_COMPRESSED_BYTES = 20 * 1024 * 1024;
const ARCHIVE_MAX_ENTRIES = 300;
const ARCHIVE_MAX_TOTAL_UNCOMPRESSED_BYTES = 60 * 1024 * 1024;
const ARCHIVE_MAX_ENTRY_BYTES = 10 * 1024 * 1024;
const ARCHIVE_MAX_JSON_ENTRY_BYTES = 5 * 1024 * 1024;
const ARCHIVE_MAX_OPTIONS_BYTES = 512 * 1024;
const ARCHIVE_MAX_COMPRESSION_RATIO = 100;

function archiveIntakeError(message: any) {
  return new Error(`Backup archive rejected: ${message}`);
}

function formatArchiveBytes(bytes: any) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

function normalizeArchiveEntryName(name: any) {
  return typeof name === 'string' ? name.replace(/\\/g, '/').trim() : '';
}

function archiveEntryLimit(name: any) {
  if (name.endsWith('.user.js') || (!name.includes('/') && name.endsWith('.js'))) {
    return ARCHIVE_MAX_SCRIPT_BYTES;
  }
  if (name.endsWith('.options.json') || name === 'global-settings.metadata.json') {
    return ARCHIVE_MAX_OPTIONS_BYTES;
  }
  if (
    name.endsWith('.storage.json') ||
    name === 'global-settings.json' ||
    name === 'folders.json' ||
    name === 'workspaces.json'
  ) {
    return ARCHIVE_MAX_JSON_ENTRY_BYTES;
  }
  return ARCHIVE_MAX_ENTRY_BYTES;
}

function validateArchiveEntryMeta(rawEntry: any, state: any) {
  const name = normalizeArchiveEntryName(rawEntry.name);
  if (!name) throw archiveIntakeError('entry name is missing.');
  if (name.startsWith('/') || name.includes('../') || name.includes('/..')) {
    throw archiveIntakeError(`entry ${name} uses an unsafe path.`);
  }
  if (/\.(zip|xpi|crx)$/i.test(name)) {
    throw archiveIntakeError(`nested archive entry ${name} is not allowed.`);
  }
  state.entries++;
  if (state.entries > ARCHIVE_MAX_ENTRIES) {
    throw archiveIntakeError(`too many files (${state.entries}). Maximum is ${ARCHIVE_MAX_ENTRIES}.`);
  }
  const compressedBytes = Number(rawEntry.size ?? 0);
  const uncompressedBytes = Number(rawEntry.originalSize ?? compressedBytes);
  if (!Number.isFinite(compressedBytes) || compressedBytes < 0) {
    throw archiveIntakeError(`entry ${name} has an invalid compressed size.`);
  }
  if (!Number.isFinite(uncompressedBytes) || uncompressedBytes < 0) {
    throw archiveIntakeError(`entry ${name} has an invalid uncompressed size.`);
  }
  const entryLimit = archiveEntryLimit(name);
  if (uncompressedBytes > entryLimit) {
    throw archiveIntakeError(`${name} is too large (${formatArchiveBytes(uncompressedBytes)}). Maximum is ${formatArchiveBytes(entryLimit)}.`);
  }
  state.totalUncompressedBytes += uncompressedBytes;
  if (state.totalUncompressedBytes > ARCHIVE_MAX_TOTAL_UNCOMPRESSED_BYTES) {
    throw archiveIntakeError(`expanded data exceeds ${formatArchiveBytes(ARCHIVE_MAX_TOTAL_UNCOMPRESSED_BYTES)}.`);
  }
  if (
    Number.isFinite(compressedBytes) &&
    compressedBytes > 0 &&
    uncompressedBytes / compressedBytes > ARCHIVE_MAX_COMPRESSION_RATIO
  ) {
    throw archiveIntakeError(`${name} compression ratio is too high.`);
  }
  return true;
}

function archiveInputToBytes(input: any) {
  let zipBytes;
  if (typeof input === 'string') {
    const maxBase64Length = Math.ceil((ARCHIVE_MAX_COMPRESSED_BYTES * 4) / 3) + 8;
    if (input.length > maxBase64Length) {
      throw archiveIntakeError(`compressed payload exceeds ${formatArchiveBytes(ARCHIVE_MAX_COMPRESSED_BYTES)}.`);
    }
    const binaryString = atob(input);
    zipBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      zipBytes[i] = binaryString.charCodeAt(i);
    }
  } else if (input instanceof ArrayBuffer) {
    zipBytes = new Uint8Array(input);
  } else if (input instanceof Uint8Array) {
    zipBytes = input;
  } else {
    throw archiveIntakeError('compressed payload must be base64 or bytes.');
  }
  if (zipBytes.byteLength > ARCHIVE_MAX_COMPRESSED_BYTES) {
    throw archiveIntakeError(`compressed payload exceeds ${formatArchiveBytes(ARCHIVE_MAX_COMPRESSED_BYTES)}.`);
  }
  return zipBytes;
}

function validateUnzippedArchive(files: any) {
  const state = { entries: 0, totalUncompressedBytes: 0 };
  for (const [name, data] of Object.entries(files) as Array<[string, any]>) {
    validateArchiveEntryMeta({
      name,
      size: data.byteLength,
      originalSize: data.byteLength,
      compression: 0
    }, state);
  }
}

function unzipArchiveBounded(input: any) {
  const zipBytes = archiveInputToBytes(input);
  const state = { entries: 0, totalUncompressedBytes: 0 };
  const files = fflate.unzipSync(zipBytes, {
    filter(file: any) {
      return validateArchiveEntryMeta(file, state);
    }
  });
  validateUnzippedArchive(files);
  return files;
}

function archiveEntryBytes(files: any, name: any, maxBytes: any = archiveEntryLimit(name)) {
  const data = files[name];
  if (!data) return undefined;
  if (data.byteLength > maxBytes) {
    throw archiveIntakeError(`${name} is too large (${formatArchiveBytes(data.byteLength)}). Maximum is ${formatArchiveBytes(maxBytes)}.`);
  }
  return data;
}

function archiveEntryText(files: any, name: any, maxBytes: any = archiveEntryLimit(name)) {
  const data = archiveEntryBytes(files, name, maxBytes);
  if (!data) throw archiveIntakeError(`${name} is missing.`);
  return fflate.strFromU8(data);
}

function parseArchiveJson(files: any, name: any, maxBytes: any = archiveEntryLimit(name)) {
  return JSON.parse(archiveEntryText(files, name, maxBytes));
}

const RESERVED_IMPORT_VALUE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function isImportValueMap(value: any) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeImportedValueMap(value: any) {
  if (!isImportValueMap(value)) return {};
  const hasDataEnvelope = Object.prototype.hasOwnProperty.call(value, 'data');
  const candidate = hasDataEnvelope ? value.data : value;
  if (!isImportValueMap(candidate)) return {};

  const sanitized: any = {};
  for (const [key, entryValue] of Object.entries(candidate)) {
    if (RESERVED_IMPORT_VALUE_KEYS.has(key)) continue;
    sanitized[key] = entryValue;
  }
  return sanitized;
}

function utf8ByteLength(value: any) {
  return new TextEncoder().encode(value).byteLength;
}

function validateJsonImportBudget(data: any) {
  const scripts = Array.isArray(data.scripts) ? data.scripts : [];
  if (scripts.length > ARCHIVE_MAX_ENTRIES) {
    return {
      error: `JSON import has too many scripts (${scripts.length}). Maximum is ${ARCHIVE_MAX_ENTRIES}.`
    };
  }
  let totalBytes = 0;
  for (const script of scripts) {
    const code = typeof script?.code === 'string' ? script.code : '';
    const bytes = utf8ByteLength(code);
    if (bytes > ARCHIVE_MAX_SCRIPT_BYTES) {
      return {
        error: `Script ${script?.id || '<unknown>'} is too large (${formatArchiveBytes(bytes)}). Maximum is ${formatArchiveBytes(ARCHIVE_MAX_SCRIPT_BYTES)}.`
      };
    }
    totalBytes += bytes;
    if (totalBytes > ARCHIVE_MAX_TOTAL_UNCOMPRESSED_BYTES) {
      return {
        error: `JSON import exceeds ${formatArchiveBytes(ARCHIVE_MAX_TOTAL_UNCOMPRESSED_BYTES)}.`
      };
    }
  }
  return null;
}

// Portable settings are an untrusted input boundary. Keep this policy aligned
// with src/config/settings-schema.json: only visible settings and explicitly
// opted-in credential fields may cross the boundary. Runtime/internal state is
// intentionally absent, so a backup cannot seed stale caches or trust stores.
const SETTINGS_IMPORT_TYPE_KEYS = {
  string: new Set([
    'allowCommunication', 'allowCookies', 'allowHttpHeaders', 'allowLocalFiles',
    'autoUpdateMode', 'badgeColor', 'badgeInfo', 'blacklistSource',
    'blacklistedPages', 'checkConnect', 'configMode', 'contentScriptAPI',
    'customCss', 'defaultTabTypes', 'downloadMode', 'downloadWhitelist',
    'dropboxClientId', 'dropboxRefreshToken', 'dropboxToken', 'editorKeyMap',
    'editorTheme', 'googleClientId', 'googleDriveRefreshToken', 'googleDriveToken',
    'highlightMatches', 'includeMode', 'incognitoStorage', 'indentWith',
    'keyMapping', 'language', 'layout', 'lintMaxSize', 'linterConfig',
    'loggingLevel', 'manualBlacklist', 'modifyCSP', 'onedriveClientId',
    'onedriveRefreshToken', 'onedriveToken', 'pageFilterMode', 's3AccessKeyId',
    's3Bucket', 's3Endpoint', 's3ObjectKey', 's3Region', 's3SecretKey',
    'sandboxMode', 'scriptOrder', 'searchIntegration', 'sri', 'statsUrlRetention',
    'strictMode', 'syncEncryptionPassphrase', 'syncProvider', 'gmValueSyncConflictPolicy', 'tabMode', 'theme',
    'topLevelAwait', 'trashMode', 'webdavPassword', 'webdavUrl', 'webdavUsername',
    'whitelistedPages',
  ]),
  number: new Set([
    'blockSeverity', 'checkInterval', 'dashboardVirtualizationThreshold',
    'editorFontSize', 'editorTabSize', 'externalsInterval', 'indentWidth',
    'notifyHideAfter', 'popupColumns', 'subscriptionRefreshInterval',
    'syncEncryptionKdfIterations', 'syncInterval', 'tabSize', 'updateInterval',
    'xhrTimeout',
  ]),
  boolean: new Set([
    'allowHighPrivilegeScriptApis', 'allowInternalSyncEndpoints', 'allowInternalXhr',
    'autoReload', 'autoSave', 'autoUpdate', 'badgeErrorStates', 'contextMenuCommands',
    'contextMenuRunAt', 'debugMode', 'editorAutoCloseBrackets', 'editorAutoComplete',
    'editorHighlightActiveLine', 'editorLineWrapping', 'editorMatchBrackets',
    'editorShowInvisibles', 'enableContextMenu', 'enableEditor', 'enableTags',
    'enabled', 'experimentalESMUserscripts', 'hideDisabledPopup',
    'highlightTrailingWhitespace', 'injectIntoFrames', 'lintOnType', 'noSaveConfirm',
    'notifyOnError', 'notifyOnInstall', 'notifyOnUpdate', 'onDeviceAiEnabled',
    'reindent', 's3PathStyle', 'scopedHostPermissions', 'showBadge', 'showFixedSource',
    'subscriptionAutoRefresh', 'syncCredentialsSessionOnly', 'syncEnabled',
    'syncEncryptionEnabled', 'syncHoldExecutionUntilFirstSync', 'trimWhitespace',
    'updateDisabled', 'wordWrap',
  ]),
  array: new Set(['blacklist', 'deniedHosts']),
  object: new Set(['findScriptsSources', 'trustedSigningKeys']),
};

const SETTINGS_IMPORT_SECURITY_KEYS = new Set([
  'allowInternalXhr',
  'allowInternalSyncEndpoints',
  'allowHighPrivilegeScriptApis',
  'trustedSigningKeys',
  'deniedHosts',
  'blacklist',
  'scopedHostPermissions',
]);

const SETTINGS_CREDENTIAL_KEYS = [
  'googleClientId',
  'webdavUsername',
  'webdavPassword',
  'googleDriveToken',
  'googleDriveRefreshToken',
  'dropboxClientId',
  'dropboxToken',
  'dropboxRefreshToken',
  'onedriveClientId',
  'onedriveToken',
  'onedriveRefreshToken',
  'syncEncryptionPassphrase',
  's3AccessKeyId',
  's3SecretKey',
  'trustedSigningKeys',
];

function getSettingsImportType(key: any) {
  for (const [type, keys] of Object.entries(SETTINGS_IMPORT_TYPE_KEYS)) {
    if (keys.has(key)) return type;
  }
  return null;
}

function isSettingsImportValue(value: any, type: any) {
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

const LOCAL_WORKSPACE_SCRIPT_SETTING_KEYS = [
  'localWorkspace',
  'localWorkspaceBinding',
  'localWorkspaceBindingId',
  'localWorkspaceBindings',
  'localProject',
  'localProjectId',
  'localProjectManifest',
  'localProjectBindingId',
  'localFileHandle',
  'localFilePath',
  'relativePath',
  'projectPath',
  'absolutePath'
];

function cloneSettingsForTransfer(value: any) {
  if (!value || typeof value !== 'object') return {};
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (_e) {
      /* fall through */
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_e) {
    return { ...value };
  }
}

function redactLocalWorkspaceScriptSettings(settings: any) {
  const sanitized = cloneSettingsForTransfer(settings);
  const redactedLocalWorkspaceSettingKeys = [];
  for (const key of LOCAL_WORKSPACE_SCRIPT_SETTING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(sanitized, key)) {
      delete sanitized[key];
      redactedLocalWorkspaceSettingKeys.push(key);
    }
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'localLibraries') && typeof LocalLibraries !== 'undefined') {
    sanitized.localLibraries = LocalLibraries.normalizeLocalLibrarySnapshots(sanitized.localLibraries);
  }
  return {
    settings: sanitized,
    redactedLocalWorkspaceSettingKeys
  };
}

function redactSettingsCredentials(settings: any, options: any = {}) {
  const includeCredentials = options.includeCredentials === true;
  const sanitized = cloneSettingsForTransfer(settings);
  const redactedSettingsCredentialKeys = [];
  if (!includeCredentials) {
    for (const key of SETTINGS_CREDENTIAL_KEYS) {
      if (Object.prototype.hasOwnProperty.call(sanitized, key)) {
        delete sanitized[key];
        redactedSettingsCredentialKeys.push(key);
      }
    }
  }
  return {
    settings: sanitized,
    settingsCredentialsIncluded: includeCredentials,
    redactedSettingsCredentialKeys
  };
}

function prepareSettingsForPortableImport(settings: any, options: any = {}) {
  const allowCredentials = options.allowCredentials === true;
  const candidate = cloneSettingsForTransfer(settings);
  const sanitized: Record<string, any> = {};
  const skippedSettingsCredentialKeys = [];
  const skippedSettingsSecurityKeys = [];
  const skippedSettingsUnknownKeys = [];
  const skippedSettingsTypeKeys = [];
  for (const [key, value] of Object.entries(candidate)) {
    const expectedType = getSettingsImportType(key);
    if (!expectedType) {
      skippedSettingsUnknownKeys.push(key);
      continue;
    }
    if (SETTINGS_IMPORT_SECURITY_KEYS.has(key)) {
      skippedSettingsSecurityKeys.push(key);
      continue;
    }
    if (SETTINGS_CREDENTIAL_KEYS.includes(key) && !allowCredentials) {
      skippedSettingsCredentialKeys.push(key);
      continue;
    }
    if (!isSettingsImportValue(value, expectedType)) {
      skippedSettingsTypeKeys.push(key);
      continue;
    }
    sanitized[key] = value;
  }
  return {
    settings: sanitized,
    settingsCredentialsImported: allowCredentials,
    skippedSettingsCredentialKeys,
    skippedSettingsSecurityKeys,
    skippedSettingsUnknownKeys,
    skippedSettingsTypeKeys
  };
}

async function readPortableLocalState(key: any) {
  if (typeof chrome === 'undefined' || !chrome?.storage?.local?.get) return undefined;
  const data = await chrome.storage.local.get(key);
  return data?.[key];
}

async function writePortableLocalState(key: any, value: any) {
  if (typeof chrome === 'undefined' || !chrome?.storage?.local?.set) {
    throw new Error('chrome.storage.local unavailable');
  }
  await chrome.storage.local.set({ [key]: value });
}

function resetPortableLocalStateCaches(key: any) {
  if (key === 'scriptFolders' && typeof FolderStorage !== 'undefined' && FolderStorage) {
    FolderStorage.cache = null;
  }
  if (key === 'workspaces' && typeof WorkspaceManager !== 'undefined' && WorkspaceManager) {
    WorkspaceManager._cache = null;
    WorkspaceManager._initPromise = null;
  }
}

async function exportAllScripts(options: any = {}) {
  const {
    includeSettings = true,
    includeStorage = false,
    includeSettingsCredentials = false
  } = options;
  const scripts = await ScriptStorage.getAll();
  const settingsExport: any = includeSettings
    ? redactSettingsCredentials(await SettingsManager.get(), {
        includeCredentials: includeSettingsCredentials
      })
    : null;
  const foldersExport = includeSettings ? await readPortableLocalState('scriptFolders') : undefined;
  const workspacesExport = includeSettings ? await readPortableLocalState('workspaces') : undefined;

  const exportedScripts = await Promise.all(scripts.map(async (s: any) => {
    const entry: any = {
      id: s.id,
      code: s.code,
      enabled: s.enabled,
      position: s.position,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt
    };
    if (includeSettings && s.settings && typeof s.settings === 'object') {
      const localWorkspaceRedaction = redactLocalWorkspaceScriptSettings(s.settings);
      entry.settings = localWorkspaceRedaction.settings;
      if (localWorkspaceRedaction.redactedLocalWorkspaceSettingKeys.length > 0) {
        entry.redactedLocalWorkspaceSettingKeys = localWorkspaceRedaction.redactedLocalWorkspaceSettingKeys;
      }
    }
    if (s.versionHistory && s.versionHistory.length > 0) {
      entry.versionHistory = s.versionHistory;
    }
    if (includeStorage) {
      const values = await ScriptValues.getAll(s.id);
      if (values && Object.keys(values).length > 0) {
        entry.storage = values;
      }
    }
    return entry;
  }));
  
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    ...(includeSettings ? {
      settings: settingsExport.settings,
      settingsCredentialsIncluded: settingsExport.settingsCredentialsIncluded,
      redactedSettingsCredentialKeys: settingsExport.redactedSettingsCredentialKeys
    } : {}),
    ...(includeSettings && foldersExport !== undefined ? {
      folders: foldersExport,
      foldersIncluded: true
    } : {}),
    ...(includeSettings && workspacesExport !== undefined ? {
      workspaces: workspacesExport,
      workspacesIncluded: true
    } : {}),
    storageIncluded: includeStorage,
    scripts: exportedScripts
  };
}

async function ensurePersistentStorageForScriptWrite(reason: any, code: any = '') {
  try {
    if (typeof QuotaManager === 'undefined' || typeof QuotaManager.ensurePersistentStorageForWrite !== 'function') {
      return null;
    }
    const bytes = typeof code === 'string'
      ? new TextEncoder().encode(code).length
      : 0;
    return await QuotaManager.ensurePersistentStorageForWrite({ reason, bytes });
  } catch (error: any) {
    console.warn('[ScriptVault] Persistent storage request failed:', error?.message || error);
    return null;
  }
}

// Phase 39.31 — WECG #935 pre-emptive string clamping. Chrome's
// chrome.notifications.create() silently truncates `title` past ~100 chars
// and `message` past ~300 chars; chrome.contextMenus.create() truncates
// `title` past ~75 chars with ellipsis. WECG #935 proposes formalizing
// these limits, after which silent truncation may become an explicit error.
// Clamp at the source so a future spec change can't break us.
const SV_NOTIF_TITLE_MAX = 96;     // Chrome notification title cap
const SV_NOTIF_MESSAGE_MAX = 280;  // Chrome notification message cap
const SV_CONTEXT_MENU_TITLE_MAX = 64; // visible context-menu label
function _clampString(s: any, max: any) {
  if (typeof s !== 'string') return s;
  if (s.length <= max) return s;
  // Use a single ellipsis char so we land exactly on `max`.
  return s.slice(0, max - 1) + '\u2026';
}

// Phase 39.22 — bound any await chain that could deadlock on a CSP-strict /
// hung remote target (VM #2513). Rejects with a labelled timeout error after
// `ms` milliseconds; the caller is responsible for treating the rejection as
// a soft failure (Promise.allSettled, .catch, etc.).
function _withTimeout(promise: any, ms: any, label: any) {
  let timer: any;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms);
  });
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    timeout
  ]);
}

const GM_DOWNLOAD_TIMEOUT_ALARM_PREFIX = 'gm_download_timeout_';
const GM_DOWNLOAD_SAFETY_ALARM_PREFIX = 'gm_download_safety_';
const GM_DOWNLOAD_TRACKING_TTL_MS = 5 * 60 * 1000;
const GM_DOWNLOAD_PENDING_CAP = 500;
const GM_DOWNLOAD_FETCH_MAX_BYTES = 50 * 1024 * 1024;

function metadataFlagEnabled(value: any) {
  if (value === true) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return !!normalized && !['0', 'false', 'no', 'off', 'disabled'].includes(normalized);
}

function scriptHasIsolatedCookieJar(script: any) {
  if (!script || typeof script !== 'object') return false;
  const meta = script.meta && typeof script.meta === 'object' ? script.meta : {};
  const settings = script.settings && typeof script.settings === 'object' ? script.settings : {};
  return metadataFlagEnabled(settings.isolationCookie)
    || metadataFlagEnabled(meta.isolationCookie)
    || metadataFlagEnabled(meta['isolation-cookie'])
    || metadataFlagEnabled(meta.cookieIsolation)
    || metadataFlagEnabled(meta['cookie-isolation']);
}

function stableCookieIsolationLabel(source: any) {
  const normalized = String(source || '').trim() || 'anonymous';
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const suffix = normalized
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28)
    .replace(/-+$/g, '');
  const hashPart = (hash >>> 0).toString(36);
  return suffix ? `sv-${hashPart}-${suffix}` : `sv-${hashPart}`;
}

function resolveScriptCookieIsolationPartitionKey(script: any, fallbackScriptId: any = '') {
  if (!scriptHasIsolatedCookieJar(script)) return { partitionKey: null };
  const scriptId = String(script?.id || fallbackScriptId || '').trim();
  if (!scriptId) return { error: 'isolated cookie jar requires a script id' };
  return {
    partitionKey: {
      topLevelSite: `https://${stableCookieIsolationLabel(scriptId)}.scriptvault.invalid`,
      hasCrossSiteAncestor: false
    },
    isolatedCookie: true
  };
}

function hasCookieRoutingOptions(data: any = {}) {
  return data.partitionKey !== undefined
    || data.cookiePartition !== undefined
    || data.cookieStoreId !== undefined
    || data.cookieStore !== undefined;
}

function normalizeNetworkCookieRouting(data: any = {}, apiName: any = 'GM_xmlhttpRequest', context: any = {}) {
  const hasExplicitCookieRouting = hasCookieRoutingOptions(data);
  if (!hasExplicitCookieRouting) {
    const isolated = resolveScriptCookieIsolationPartitionKey(context.script, context.scriptId || data.scriptId);
    if (isolated.error) return { error: isolated.error };
    if (!isolated.partitionKey) return { applies: false };
    if (data.anonymous === true) {
      return { error: apiName + ' cookie routing cannot be combined with anonymous requests' };
    }
    return {
      applies: true,
      partitionKey: isolated.partitionKey,
      storeId: '',
      isolatedCookie: true
    };
  }
  if (data.anonymous === true) {
    return { error: apiName + ' cookie routing cannot be combined with anonymous requests' };
  }

  const hasPartitionKey = Object.prototype.hasOwnProperty.call(data, 'partitionKey');
  const hasCookiePartition = Object.prototype.hasOwnProperty.call(data, 'cookiePartition');
  if (hasPartitionKey && hasCookiePartition) {
    const partitionJson = JSON.stringify(data.partitionKey ?? null);
    const aliasJson = JSON.stringify(data.cookiePartition ?? null);
    if (partitionJson !== aliasJson) {
      return { error: apiName + ' partitionKey and cookiePartition must match when both are provided' };
    }
  }

  const partitionInput = hasPartitionKey ? data.partitionKey : data.cookiePartition;
  const partition = normalizeCookiePartitionKey(partitionInput);
  if (partition.error) return { error: partition.error };

  const rawStoreId = data.cookieStoreId ?? data.cookieStore;
  let storeId = '';
  if (rawStoreId != null && rawStoreId !== '') {
    if (typeof rawStoreId !== 'string') return { error: apiName + ' cookieStoreId must be a string' };
    storeId = rawStoreId.trim();
    if (!storeId) return { error: apiName + ' cookieStoreId must not be empty' };
  }

  return {
    applies: true,
    partitionKey: partition.partitionKey,
    storeId
  };
}

function cookieHeaderFromCookies(cookies: any = []) {
  return [...cookies]
    .filter((cookie) => cookie && typeof cookie.name === 'string' && cookie.name && !/[;\r\n=]/.test(cookie.name))
    .sort((a, b) => String(b.path || '').length - String(a.path || '').length)
    .map((cookie) => cookie.name + '=' + (cookie.value ?? ''))
    .join('; ');
}

async function prepareCookieRoutingForFetch(data: any = {}, apiName: any = 'GM_xmlhttpRequest', context: any = {}) {
  const routing = normalizeNetworkCookieRouting(data, apiName, context);
  if (routing.error || !routing.applies) return routing;
  if (!isHttpCookieUrl(data.url)) return { error: apiName + ' cookie routing requires an http(s) URL' };
  if (!chrome.cookies || typeof chrome.cookies.getAll !== 'function') {
    return { error: apiName + ' cookie routing requires the optional cookies permission' };
  }

  const details: any = { url: data.url };
  if (routing.partitionKey) details.partitionKey = routing.partitionKey;
  if (routing.storeId) details.storeId = routing.storeId;

  try {
    const cookies: any = await chrome.cookies.getAll(details);
    return {
      applies: true,
      cookieHeader: cookieHeaderFromCookies(cookies),
      partitionKey: routing.partitionKey,
      storeId: routing.storeId
    };
  } catch (e: any) {
    return { error: apiName + ' cookie routing failed: ' + (e?.message || e) };
  }
}

let _cookieRoutingRuleSeq = 0;
const _cookieRoutingLocks = new Map();
function nextCookieRoutingRuleId() {
  _cookieRoutingRuleSeq = (_cookieRoutingRuleSeq + 1) % 100000;
  return 1500000000 + _cookieRoutingRuleSeq;
}

function exactDnrRegexForUrl(url: any) {
  const regex = '^' + String(url).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&') + '$';
  if (regex.length > 1900) {
    return { error: 'cookie-routed request URL is too long for an exact DNR guard' };
  }
  return { regex };
}

async function withCookieRoutingUrlLock(lockKey: any, task: any) {
  const prior = _cookieRoutingLocks.get(lockKey) || Promise.resolve();
  let release: any = () => {};
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const current = prior.catch(() => {}).then(() => gate);
  _cookieRoutingLocks.set(lockKey, current);

  await prior.catch(() => {});
  try {
    return await task();
  } finally {
    release();
    if (_cookieRoutingLocks.get(lockKey) === current) {
      _cookieRoutingLocks.delete(lockKey);
    }
  }
}

async function withCookieHeaderSessionRule(url: any, cookieHeader: any, fetcher: any) {
  if (!cookieHeader) return fetcher();
  if (!chrome.declarativeNetRequest || typeof chrome.declarativeNetRequest.updateSessionRules !== 'function') {
    throw new Error('Cookie-routed requests require declarativeNetRequest session rules');
  }
  const regex = exactDnrRegexForUrl(url);
  if (regex.error) throw new Error(regex.error);
  const ruleId = nextCookieRoutingRuleId();
  // GM cookie-routed fetches run from the service worker, so Chrome assigns
  // them TAB_ID_NONE (-1). Restricting the session rule to that origin keeps a
  // page XHR to the same URL from receiving the extension's cookie header.
  const tabIdNone = Number.isInteger(chrome.tabs?.TAB_ID_NONE) ? chrome.tabs.TAB_ID_NONE : -1;
  const rule: any = {
    id: ruleId,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [{ header: 'Cookie', operation: 'set', value: cookieHeader }]
    },
    condition: {
      regexFilter: regex.regex,
      isUrlFilterCaseSensitive: true,
      resourceTypes: ['xmlhttprequest'],
      tabIds: [tabIdNone]
    }
  };

  return await withCookieRoutingUrlLock(regex.regex, async () => {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId],
      addRules: [rule]
    });
    try {
      return await fetcher();
    } finally {
      try {
        await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
      } catch (e: any) {
        console.warn('[ScriptVault] Failed to remove cookie-routing DNR session rule:', e?.message || e);
      }
    }
  });
}

function downloadNeedsFetchBridge(data: any = {}) {
  const headers = data.headers && typeof data.headers === 'object' ? data.headers : null;
  const hasHeaders = !!headers && Object.keys(headers).some((key) => headers[key] != null);
  return hasHeaders
    || data.anonymous === true
    || data.noCache === true
    || data.nocache === true
    || data.redirect === 'follow'
    || data.redirect === 'error'
    || data.redirect === 'manual';
}

function _downloadNameFromUrl(url: any) {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') return '';
    const last = parsed.pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : '';
  } catch (_) {
    const clean: any = url.split(/[?#]/)[0];
    return clean.split('/').filter(Boolean).pop() || '';
  }
}

function normalizeDownloadFilename(name: any, url: any, sourceName: any) {
  if (typeof name === 'string' && name.trim()) return name.trim();
  if (typeof sourceName === 'string' && sourceName.trim()) return sourceName.trim();
  const fromUrl = _downloadNameFromUrl(url);
  return fromUrl || 'download';
}

function _bytesToBase64(bytes: any) {
  let binary = '';
  const chunk = 32768;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

function _safeDownloadMimeType(mimeType: any) {
  const value = typeof mimeType === 'string' ? mimeType.trim() : '';
  return /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(?:\s*;\s*[A-Za-z0-9!#$&^_.+-]+=[A-Za-z0-9!#$&^_.+-]+)*$/.test(value)
    ? value
    : 'application/octet-stream';
}

function downloadBytesToDataUrl(bytes: any, mimeType: any) {
  return `data:${_safeDownloadMimeType(mimeType)};base64,${_bytesToBase64(bytes)}`;
}

async function responseToDownloadDataUrl(response: any) {
  // Bounded during the read: the old declared-length pre-check plus a post-hoc
  // arrayBuffer() size check had already buffered a chunked multi-GB body by the
  // time it could refuse it.
  let bytes;
  try {
    bytes = await _readResponseBytesBounded(response, GM_DOWNLOAD_FETCH_MAX_BYTES, 'Download');
  } catch (e: any) {
    const detail = e?.message || String(e);
    throw new Error(`${detail} (limit applies when headers/anonymous mode requires a fetch bridge.)`);
  }
  return downloadBytesToDataUrl(bytes, response.headers?.get?.('content-type') || 'application/octet-stream');
}

function _normalizeDownloadId(downloadId: any) {
  const id = Number(downloadId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function _getPendingDownloads() {
  if (!self._pendingDownloads) self._pendingDownloads = new Map();
  return self._pendingDownloads;
}

function _persistPendingDownloads() {
  SessionState.persistPendingDownloads();
}

function _clearPendingDownloadTimer(downloadId: any) {
  const id = _normalizeDownloadId(downloadId);
  if (id == null || !self._pendingDownloadTimers) return;
  const timerId = self._pendingDownloadTimers.get(id);
  if (timerId) clearTimeout(timerId);
  self._pendingDownloadTimers.delete(id);
}

function _clearPendingDownloadAlarms(downloadId: any) {
  const id = _normalizeDownloadId(downloadId);
  if (id == null || !chrome?.alarms?.clear) return;
  chrome.alarms.clear(`${GM_DOWNLOAD_TIMEOUT_ALARM_PREFIX}${id}`).catch(() => {});
  chrome.alarms.clear(`${GM_DOWNLOAD_SAFETY_ALARM_PREFIX}${id}`).catch(() => {});
}

function cleanupPendingDownload(downloadId: any, { clearAlarms = true }: any = {}) {
  const id = _normalizeDownloadId(downloadId);
  if (id == null) return;
  _getPendingDownloads().delete(id);
  _clearPendingDownloadTimer(id);
  if (clearAlarms) _clearPendingDownloadAlarms(id);
  _persistPendingDownloads();
}

function _downloadAlarmWhen(timestamp: any) {
  const value = Number(timestamp || 0);
  return Number.isFinite(value) && value > Date.now() ? value : Date.now() + 1;
}

function _schedulePendingDownloadAlarms(downloadId: any, tracker: any) {
  if (!chrome?.alarms?.create) return;
  if (tracker.timeoutAt) {
    chrome.alarms.create(`${GM_DOWNLOAD_TIMEOUT_ALARM_PREFIX}${downloadId}`, {
      when: _downloadAlarmWhen(tracker.timeoutAt)
    });
  }
  if (tracker.expiresAt) {
    chrome.alarms.create(`${GM_DOWNLOAD_SAFETY_ALARM_PREFIX}${downloadId}`, {
      when: _downloadAlarmWhen(tracker.expiresAt)
    });
  }
}

function _schedulePendingDownloadTimer(downloadId: any, tracker: any) {
  if (!tracker.timeoutAt) return;
  const delay = Math.max(0, Number(tracker.timeoutAt) - Date.now());
  if (!self._pendingDownloadTimers) self._pendingDownloadTimers = new Map();
  _clearPendingDownloadTimer(downloadId);
  const timerId = setTimeout(() => {
    handlePendingDownloadTimeoutAlarm(downloadId).catch(() => {});
  }, delay);
  self._pendingDownloadTimers.set(downloadId, timerId);
}

function trackPendingDownload(downloadId: any, tracker: any = {}) {
  const id = _normalizeDownloadId(downloadId);
  const tabId = Number(tracker.tabId);
  if (id == null || !Number.isFinite(tabId)) return null;
  const pending = _getPendingDownloads();
  while (pending.size >= GM_DOWNLOAD_PENDING_CAP) {
    const oldest = pending.keys().next().value;
    if (oldest === undefined) break;
    cleanupPendingDownload(oldest);
  }
  const now = Date.now();
  const timeoutMs = Number(tracker.timeoutMs || 0);
  const entry = {
    tabId,
    scriptId: String(tracker.scriptId || ''),
    url: String(tracker.url || ''),
    createdAt: now,
    expiresAt: now + GM_DOWNLOAD_TRACKING_TTL_MS,
    timeoutAt: Number.isFinite(timeoutMs) && timeoutMs > 0 ? now + timeoutMs : 0
  };
  pending.set(id, entry);
  _schedulePendingDownloadAlarms(id, entry);
  _schedulePendingDownloadTimer(id, entry);
  _persistPendingDownloads();
  return entry;
}

function sendPendingDownloadEvent(downloadId: any, tracker: any, type: any, eventData: any = {}) {
  const id = _normalizeDownloadId(downloadId);
  const tabId = Number(tracker?.tabId);
  if (id == null || !Number.isFinite(tabId) || !tracker?.scriptId) return;
  const data = { downloadId: id, scriptId: tracker.scriptId, type, ...eventData };
  if (sendUserScriptEvent(tabId, 'downloadEvent', data)) return;
  Promise.resolve(chrome.tabs.sendMessage(tabId, {
    action: 'downloadEvent',
    data,
  })).catch(() => {});
}

function handlePendingDownloadDelta(delta: any = {}) {
  const id = _normalizeDownloadId(delta.id);
  if (id == null) return;
  const tracker = _getPendingDownloads().get(id);
  if (!tracker) return;
  if (delta.state) {
    if (delta.state.current === 'complete') {
      sendPendingDownloadEvent(id, tracker, 'load', { url: tracker.url || '' });
      cleanupPendingDownload(id);
      return;
    }
    if (delta.state.current === 'interrupted') {
      sendPendingDownloadEvent(id, tracker, 'error', { error: delta.error?.current || 'Download interrupted' });
      cleanupPendingDownload(id);
      return;
    }
  }
  if (delta.bytesReceived) {
    sendPendingDownloadEvent(id, tracker, 'progress', {
      loaded: delta.bytesReceived.current,
      total: delta.totalBytes?.current || 0
    });
  }
}

async function handlePendingDownloadTimeoutAlarm(downloadId: any) {
  const id = _normalizeDownloadId(downloadId);
  if (id == null) return;
  const tracker = _getPendingDownloads().get(id);
  if (!tracker) return;
  try { await chrome.downloads.cancel(id); } catch (_) {}
  sendPendingDownloadEvent(id, tracker, 'timeout');
  cleanupPendingDownload(id);
}

async function reconcilePendingDownload(downloadId: any, tracker: any, now: any = Date.now()) {
  const id = _normalizeDownloadId(downloadId);
  if (id == null || !tracker) return;
  if (tracker.timeoutAt && Number(tracker.timeoutAt) <= now) {
    await handlePendingDownloadTimeoutAlarm(id);
    return;
  }
  if (tracker.expiresAt && Number(tracker.expiresAt) <= now) {
    cleanupPendingDownload(id);
    return;
  }
  _schedulePendingDownloadAlarms(id, tracker);
  _schedulePendingDownloadTimer(id, tracker);
  if (!chrome?.downloads?.search) return;
  let items = [];
  try {
    items = await chrome.downloads.search({ id });
  } catch (_) {
    return;
  }
  const item = Array.isArray(items) ? items[0] : null;
  if (!item) {
    cleanupPendingDownload(id);
    return;
  }
  if (item.state === 'complete') {
    sendPendingDownloadEvent(id, tracker, 'load', { url: tracker.url || item.url || '' });
    cleanupPendingDownload(id);
  } else if (item.state === 'interrupted') {
    sendPendingDownloadEvent(id, tracker, 'error', { error: item.error || 'Download interrupted' });
    cleanupPendingDownload(id);
  } else if (typeof item.bytesReceived === 'number') {
    sendPendingDownloadEvent(id, tracker, 'progress', {
      loaded: item.bytesReceived,
      total: item.totalBytes || 0
    });
  }
}

async function reconcilePendingDownloads(reason: any = 'startup') {
  const pending = _getPendingDownloads();
  if (!pending.size) return;
  const now = Date.now();
  for (const [downloadId, tracker] of [...pending.entries()]) {
    await reconcilePendingDownload(downloadId, tracker, now);
  }
}

// Stream-read a fetch Response body up to `maxBytes`, throwing if exceeded.
//
// The naive pattern `await response.text(); if (text.length > N) throw` buffers
// the *full* body into memory before checking — a malicious server that omits
// or lies about Content-Length can OOM the service worker (DoS) before the
// size check ever fires. content-length is a hint, not a guarantee.
//
// This helper reads the body in chunks and aborts the moment the running
// byte total exceeds the cap. The caller's AbortSignal (if any) is still
// honored via the response's own underlying reader.
//
// Returns the decoded text on success; throws `Error("<label> too large …")`
// if the body exceeds `maxBytes`. Falls back to a buffered `response.text()`
// only when `response.body` is unreadable (e.g. some test mocks return a
// Response without a stream).
async function _fetchTextBounded(response: any, maxBytes: any, label: any) {
  if (!response || typeof response.text !== 'function') {
    throw new Error(`${label}: invalid response`);
  }
  // content-length check first — it's still useful as a cheap pre-flight when
  // the server is honest.
  const declaredLen = parseInt(response.headers?.get?.('content-length') || '0', 10);
  if (Number.isFinite(declaredLen) && declaredLen > maxBytes) {
    throw new Error(`${label} too large (${formatBytes(declaredLen)}). Maximum is ${formatBytes(maxBytes)}.`);
  }

  const body = response.body;
  if (!body || typeof body.getReader !== 'function') {
    // No stream available (test mock, opaque response). Fall through to the
    // buffered path but still cap defensively.
    const text = await response.text();
    const bytes = typeof text === 'string' ? new TextEncoder().encode(text).byteLength : 0;
    if (bytes > maxBytes) {
      throw new Error(`${label} too large (${formatBytes(bytes)}). Maximum is ${formatBytes(maxBytes)}.`);
    }
    return text;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const chunks = [];
  let bytesRead = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        // Cancel the underlying stream so the server stops sending. Defensive
        // try/catch — `cancel()` rejects on already-cancelled streams.
        try { await reader.cancel(); } catch (_e) { /* ignore */ }
        throw new Error(`${label} too large (${formatBytes(bytesRead)}+). Maximum is ${formatBytes(maxBytes)}.`);
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch (_e) { /* already released */ }
  }
  // Decode in a single pass to handle multi-byte UTF-8 sequences that span
  // chunk boundaries. `stream: false` flushes any pending state.
  // Concatenate chunks into one Uint8Array for the final decode.
  const total = new Uint8Array(bytesRead);
  let offset = 0;
  for (const c of chunks) {
    total.set(c, offset);
    offset += c.byteLength;
  }
  return decoder.decode(total);
}

/**
 * Read a response body as BYTES with the cap tripping during the read.
 *
 * Byte sibling of `_fetchTextBounded`. `Content-Length` is a hint a hostile host
 * can omit or lie about, so `await response.arrayBuffer()` followed by a size
 * check has already buffered the whole body by the time it can refuse — which is
 * how a chunked multi-GB reply could OOM-kill the service worker, taking
 * registration, sync and update checks with it, on every retry.
 */
async function _readResponseBytesBounded(response: any, maxBytes: any, label: any) {
  if (!response) throw new Error(`${label}: invalid response`);

  const declaredLen = parseInt(response.headers?.get?.('content-length') || '0', 10);
  if (Number.isFinite(declaredLen) && declaredLen > maxBytes) {
    throw new Error(`${label} too large (${formatBytes(declaredLen)}). Maximum is ${formatBytes(maxBytes)}.`);
  }

  const body = response.body;
  if (!body || typeof body.getReader !== 'function') {
    // Nothing to stream (synthetic or already-buffered response): buffer, then
    // refuse. Still better than trusting the declared length alone.
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) {
      throw new Error(`${label} too large (${formatBytes(buffer.byteLength)}). Maximum is ${formatBytes(maxBytes)}.`);
    }
    return new Uint8Array(buffer);
  }

  const reader = body.getReader();
  const chunks = [];
  let bytesRead = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        try { await reader.cancel(); } catch (_e) { /* ignore */ }
        throw new Error(`${label} too large (${formatBytes(bytesRead)}+). Maximum is ${formatBytes(maxBytes)}.`);
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch (_e) { /* already released */ }
  }

  const total = new Uint8Array(bytesRead);
  let offset = 0;
  for (const c of chunks) {
    total.set(c, offset);
    offset += c.byteLength;
  }
  return total;
}

// chrome.cookies.* only accepts http(s) URLs. Front-validate to give scripts a
// clear error instead of leaking the raw Chrome exception, and to reject
// chrome-extension://, javascript:, data:, blob:, file: payloads up-front.
function isHttpCookieUrl(url: any) {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeCookiePartitionKey(value: any) {
  if (value == null) return { partitionKey: null };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'partitionKey must be an object' };
  }
  const partitionKey: any = {};
  if (Object.prototype.hasOwnProperty.call(value, 'topLevelSite') && value.topLevelSite != null && value.topLevelSite !== '') {
    if (typeof value.topLevelSite !== 'string' || !isHttpCookieUrl(value.topLevelSite)) {
      return { error: 'partitionKey.topLevelSite must be http(s)://' };
    }
    partitionKey.topLevelSite = new URL(value.topLevelSite).origin;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'hasCrossSiteAncestor')) {
    if (typeof value.hasCrossSiteAncestor !== 'boolean') {
      return { error: 'partitionKey.hasCrossSiteAncestor must be boolean' };
    }
    partitionKey.hasCrossSiteAncestor = value.hasCrossSiteAncestor;
  }
  return { partitionKey };
}

const RESERVED_IMPORT_SCRIPT_IDS = new Set(['__proto__', 'prototype', 'constructor']);
function isSafeImportedScriptId(id: any) {
  return (
    typeof id === 'string' &&
    /^script_[A-Za-z0-9._:-]{1,160}$/.test(id) &&
    !RESERVED_IMPORT_SCRIPT_IDS.has(id)
  );
}

function allocateImportedScriptId(preferredId: any, usedScriptIds: any) {
  if (isSafeImportedScriptId(preferredId) && !usedScriptIds.has(preferredId)) {
    return preferredId;
  }
  let nextId;
  do {
    nextId = generateId();
  } while (usedScriptIds.has(nextId));
  return nextId;
}

function finiteBackupNumber(value: any) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function applyImportedScriptTrust(settings: any, archiveEnabled: any, options: any = {}) {
  const nextSettings = settings && typeof settings === 'object' ? { ...settings } : {};
  delete nextSettings._importQuarantine;
  delete nextSettings._importTrust;
  if (archiveEnabled === false) {
    return { enabled: false, settings: nextSettings, disposition: 'preserved-disabled' };
  }
  if (options.trustImportedScripts === true) {
    nextSettings._importTrust = {
      source: options.source || 'import',
      sourceLabel: options.sourceLabel || '',
      reviewedAt: Date.now(),
      archiveEnabled: true
    };
    return { enabled: true, settings: nextSettings, disposition: 'trusted-enabled' };
  }
  nextSettings._importQuarantine = {
    source: options.source || 'import',
    sourceLabel: options.sourceLabel || '',
    importedAt: Date.now(),
    archiveEnabled: true
  };
  return { enabled: false, settings: nextSettings, disposition: 'quarantined' };
}

function recordImportedScriptTrustReview(settings: any) {
  if (!settings?._importQuarantine) return settings || {};
  const quarantine = settings._importQuarantine;
  const nextSettings = { ...settings };
  delete nextSettings._importQuarantine;
  nextSettings._importTrust = {
    source: quarantine.source || 'import',
    sourceLabel: quarantine.sourceLabel || '',
    reviewedAt: Date.now(),
    archiveEnabled: quarantine.archiveEnabled !== false
  };
  return nextSettings;
}

function isScriptEligibleForRegistration(script: any) {
  return !!script && script.enabled !== false && !script.settings?._importQuarantine;
}

function countImportTrustDisposition(results: any, disposition: any) {
  if (disposition === 'quarantined') {
    results.quarantinedScripts = (results.quarantinedScripts || 0) + 1;
  } else if (disposition === 'preserved-disabled') {
    results.preservedDisabledScripts = (results.preservedDisabledScripts || 0) + 1;
  } else if (disposition === 'trusted-enabled') {
    results.trustedEnabledScripts = (results.trustedEnabledScripts || 0) + 1;
  }
}

const IMPORT_RUN_AT_VALUES = new Set([
  'default', 'document-start', 'document-body', 'document-end', 'document-idle', 'context-menu'
]);
const IMPORT_INJECT_INTO_VALUES = new Set(['auto', 'page', 'content']);
const IMPORT_SETTING_ALIASES: any = {
  runAt: ['runAt', 'run-at', 'run_at'],
  injectInto: ['injectInto', 'inject-into', 'inject_into'],
  frameMode: ['frameMode', 'frame-mode', 'frame_mode'],
  autoUpdate: ['autoUpdate', 'shouldUpdate', 'should-update'],
  notifyUpdates: ['notifyUpdates', 'notify-updates'],
  notifyErrors: ['notifyErrors', 'notify-errors'],
  useOriginalMatches: ['useOriginalMatches', 'use-original-matches', 'merge_matches', 'mergeMatches'],
  useOriginalIncludes: ['useOriginalIncludes', 'use-original-includes', 'merge_includes', 'mergeIncludes'],
  useOriginalExcludes: ['useOriginalExcludes', 'use-original-excludes', 'merge_excludes', 'mergeExcludes'],
  userMatches: ['userMatches', 'user_matches', 'customMatches', 'use_matches'],
  userIncludes: ['userIncludes', 'user_includes', 'customIncludes', 'use_includes'],
  userExcludes: ['userExcludes', 'user_excludes', 'customExcludes', 'use_excludes'],
};
const IMPORT_RECOGNIZED_SETTING_KEYS = new Set([
  'enabled', 'position', 'id', 'scriptId', 'createdAt', 'updatedAt', 'schemaVersion',
  'runAt', 'run-at', 'run_at', 'injectInto', 'inject-into', 'inject_into',
  'frameMode', 'frame-mode', 'frame_mode', 'autoUpdate', 'shouldUpdate', 'should-update',
  'notifyUpdates', 'notify-updates', 'notifyErrors', 'notify-errors', 'noframes',
  'useOriginalMatches', 'use-original-matches', 'merge_matches', 'mergeMatches',
  'useOriginalIncludes', 'use-original-includes', 'merge_includes', 'mergeIncludes',
  'useOriginalExcludes', 'use-original-excludes', 'merge_excludes', 'mergeExcludes',
  'userMatches', 'user_matches', 'customMatches', 'use_matches',
  'userIncludes', 'user_includes', 'customIncludes', 'use_includes',
  'userExcludes', 'user_excludes', 'customExcludes', 'use_excludes',
  'config', 'custom', 'options', 'settings', 'storage', 'userConfig', 'values', 'vars',
  'override', 'overrides', 'scriptVault', 'meta', 'props', 'code', 'source', 'content',
]);

function isImportRecord(value: any) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function collectImportSettingRecords(sources: any[]) {
  const records: any[] = [];
  const visited = new Set<any>();
  let visitedObjects = 0;
  const visit = (value: any, label: string, depth: number) => {
    if (!isImportRecord(value) || depth > 3 || visitedObjects >= 64 || visited.has(value)) return;
    visited.add(value);
    visitedObjects++;
    records.push({ value, label });
    for (const key of ['config', 'settings', 'options', 'custom', 'override', 'overrides']) {
      if (isImportRecord(value[key])) visit(value[key], key, depth + 1);
    }
  };
  for (const source of sources) {
    if (source && isImportRecord(source.value)) visit(source.value, source.label || 'source', 0);
    else visit(source, 'source', 0);
  }
  return records;
}

function findImportSetting(records: any[], aliases: string[]) {
  for (const record of records) {
    for (const key of aliases) {
      if (Object.prototype.hasOwnProperty.call(record.value, key)) {
        return { found: true, key, value: record.value[key], label: record.label };
      }
    }
  }
  return { found: false, key: '', value: undefined, label: '' };
}

function importPatternList(value: any, label: string, warnings: string[]) {
  if (typeof value === 'boolean' && /^use_/.test(label)) return null;
  if (typeof value === 'string') value = [value];
  if (!Array.isArray(value)) {
    warnings.push(`${label} must be an array or string`);
    return null;
  }
  const result: string[] = [];
  for (const entry of value.slice(0, 200)) {
    if (typeof entry !== 'string' || !entry.trim() || entry.length > 2048) {
      warnings.push(`${label} contains an invalid pattern`);
      continue;
    }
    result.push(entry.trim());
  }
  if (value.length > 200) warnings.push(`${label} contains more than 200 patterns; extras were ignored`);
  return result;
}

function fallbackImportedConfigValues(meta: any, sources: any[]) {
  const variables = Array.isArray(meta?.config) ? meta.config : [];
  const names = new Set(variables
    .filter((variable: any) => variable && typeof variable.name === 'string')
    .map((variable: any) => variable.name)
    .filter((name: string) => name && !['__proto__', 'constructor', 'prototype'].includes(name)));
  const raw: any = {};
  const matchedKeys = new Set<string>();
  const invalidKeys = new Set<string>();
  const rejectedKeys = new Set<string>();
  const visited = new Set<any>();
  let visitedObjects = 0;
  const visit = (value: any, depth: number) => {
    if (!isImportRecord(value) || depth > 3 || visitedObjects >= 64 || visited.has(value)) return;
    visited.add(value);
    visitedObjects++;
    for (const [key, entryValue] of Object.entries(value).slice(0, 512)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) {
        rejectedKeys.add(key);
      } else if (names.has(key)) {
        if ((typeof entryValue === 'string' && entryValue.length <= 256)
          || (typeof entryValue === 'number' && Number.isFinite(entryValue))
          || typeof entryValue === 'boolean') {
          raw[key] = entryValue;
          matchedKeys.add(key);
          invalidKeys.delete(key);
        } else if (!Object.prototype.hasOwnProperty.call(raw, key)) {
          invalidKeys.add(key);
        }
      } else if (depth < 3 && ['config', 'custom', 'options', 'settings', 'storage', 'userConfig', 'values', 'vars'].includes(key)) {
        visit(entryValue, depth + 1);
      }
    }
  };
  sources.forEach((source: any) => visit(source, 0));
  const values: any = {};
  for (const key of matchedKeys) values[key] = raw[key];
  return { values, matchedKeys: [...matchedKeys], invalidKeys: [...invalidKeys], rejectedKeys: [...rejectedKeys] };
}

function mapImportedScriptSettings(meta: any, sources: any[]) {
  const records = collectImportSettingRecords(sources);
  const settings: any = {};
  const warnings: string[] = [];
  const unmappedKeys = new Set<string>();
  const variableNames = new Set((Array.isArray(meta?.config) ? meta.config : [])
    .map((variable: any) => variable?.name)
    .filter((name: any) => typeof name === 'string'));

  const mapBoolean = (settingKey: string, aliases: string[]) => {
    const field = findImportSetting(records, aliases);
    if (!field.found) return;
    if (typeof field.value !== 'boolean') {
      warnings.push(`${field.key} must be a boolean`);
      unmappedKeys.add(field.key);
      return;
    }
    settings[settingKey] = field.value;
  };
  const mapString = (settingKey: string, aliases: string[], allowed: Set<string>) => {
    const field = findImportSetting(records, aliases);
    if (!field.found) return;
    if (typeof field.value !== 'string' || !allowed.has(field.value)) {
      warnings.push(`${field.key} has an unsupported value`);
      unmappedKeys.add(field.key);
      return;
    }
    settings[settingKey] = field.value;
  };
  const mapPatterns = (settingKey: string, aliases: string[]) => {
    const field = findImportSetting(records, aliases);
    if (!field.found) return;
    if (typeof field.value === 'boolean' && /^use_/.test(field.key)) return;
    const patterns = importPatternList(field.value, field.key, warnings);
    if (patterns) settings[settingKey] = patterns;
    else unmappedKeys.add(field.key);
  };

  mapString('runAt', IMPORT_SETTING_ALIASES.runAt, IMPORT_RUN_AT_VALUES);
  mapString('injectInto', IMPORT_SETTING_ALIASES.injectInto, IMPORT_INJECT_INTO_VALUES);
  mapString('frameMode', IMPORT_SETTING_ALIASES.frameMode, new Set(['default', 'top', 'all']));
  mapBoolean('autoUpdate', IMPORT_SETTING_ALIASES.autoUpdate);
  mapBoolean('notifyUpdates', IMPORT_SETTING_ALIASES.notifyUpdates);
  mapBoolean('notifyErrors', IMPORT_SETTING_ALIASES.notifyErrors);
  mapBoolean('useOriginalMatches', IMPORT_SETTING_ALIASES.useOriginalMatches);
  mapBoolean('useOriginalIncludes', IMPORT_SETTING_ALIASES.useOriginalIncludes);
  mapBoolean('useOriginalExcludes', IMPORT_SETTING_ALIASES.useOriginalExcludes);
  mapPatterns('userMatches', IMPORT_SETTING_ALIASES.userMatches);
  mapPatterns('userIncludes', IMPORT_SETTING_ALIASES.userIncludes);
  mapPatterns('userExcludes', IMPORT_SETTING_ALIASES.userExcludes);

  const noframes = findImportSetting(records, ['noframes']);
  if (noframes.found) {
    if (typeof noframes.value === 'boolean') {
      if (noframes.value && !Object.prototype.hasOwnProperty.call(settings, 'frameMode')) settings.frameMode = 'top';
    } else {
      warnings.push('noframes must be a boolean');
      unmappedKeys.add(noframes.key);
    }
  }

  const configSources = sources.map((source: any) => source && isImportRecord(source.value) ? source.value : source);
  const configResult = typeof ScriptConfig !== 'undefined' && typeof ScriptConfig?.importValues === 'function'
    ? ScriptConfig.importValues(Array.isArray(meta?.config) ? meta.config : [], configSources)
    : fallbackImportedConfigValues(meta, configSources);
  if (configResult.matchedKeys.length > 0) settings.userConfig = configResult.values;
  for (const key of configResult.invalidKeys) {
    warnings.push(`${key} has an invalid @var value`);
    unmappedKeys.add(key);
  }
  if (configResult.rejectedKeys.length > 0) {
    warnings.push(`prototype-polluting config keys rejected: ${configResult.rejectedKeys.join(', ')}`);
  }

  for (const record of records) {
    if (!['config', 'settings', 'custom', 'options', 'override', 'overrides'].includes(record.label)) continue;
    for (const key of Object.keys(record.value)) {
      if (IMPORT_RECOGNIZED_SETTING_KEYS.has(key) || variableNames.has(key)) continue;
      unmappedKeys.add(key);
    }
  }

  return { settings, warnings, unmappedKeys: [...unmappedKeys].sort() };
}

function addImportDiagnostics(results: any, name: string, mapped: any) {
  if (!Array.isArray(results.warnings)) results.warnings = [];
  if (!Array.isArray(results.unmappedSettings)) results.unmappedSettings = [];
  for (const warning of mapped.warnings || []) {
    if (results.warnings.length < 200) results.warnings.push({ name, warning });
  }
  if (mapped.unmappedKeys?.length && results.unmappedSettings.length < 200) {
    results.unmappedSettings.push({ name, keys: mapped.unmappedKeys.slice(0, 100) });
  }
}

function addImportStorageDiagnostics(results: any, name: string, values: any, sourcePresent: boolean) {
  if (!sourcePresent) return;
  if (!isImportRecord(values)) {
    addImportDiagnostics(results, name, {
      warnings: ['stored values were present but were not an object and were ignored'],
      unmappedKeys: ['storage'],
    });
    return;
  }
  if (Object.keys(values).length > 0) results.storageImported = (results.storageImported || 0) + 1;
}

async function importScripts(data: any, options: any = {}) {
  const {
    overwrite = false,
    importSettings = false,
    importStorage = false,
    importSettingsCredentials = false,
    recordReceipt = true,
    sourceLabel = '',
    trustImportedScripts = false
  } = options;
  const results: any = {
    imported: 0,
    skipped: 0,
    errors: [],
    settingsImported: false,
    settingsCredentialsImported: false,
    skippedSettingsCredentialKeys: [],
    skippedSettingsSecurityKeys: [],
    skippedSettingsUnknownKeys: [],
    skippedSettingsTypeKeys: [],
    storageImported: 0,
    restoredFolders: false,
    restoredWorkspaces: false,
    replacedScripts: [],
    quarantinedScripts: 0,
    preservedDisabledScripts: 0,
    trustedEnabledScripts: 0
  };

  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.scripts)) {
    return { error: 'Invalid import format' };
  }
  const budgetError = validateJsonImportBudget(data);
  if (budgetError) return budgetError;

  // Cache existing count once to avoid O(n²) getAll() inside the loop
  const allExistingScripts = await ScriptStorage.getAll();
  const usedScriptIds = new Set(allExistingScripts.map((script: any) => script.id));
  let _importPosition = allExistingScripts.length;
  // Capture pre-import snapshot for receipt + rollback. Only the scripts and
  // values that will actually be replaced need to be retained, but it's
  // cheaper to snapshot once up-front than to look each one up later.
  const replacedSnapshots = [];
  const valuesSnapshots: any = {};

  // An import's undo snapshot is built AS scripts are replaced, so unlike a
  // restore it cannot be written complete before the first write. Journal the
  // operation instead: an MV3 worker dying mid-loop then leaves evidence that
  // the library is half-written rather than nothing at all.
  const mutationJournalId = typeof BackupScheduler !== 'undefined' && typeof BackupScheduler?.beginLibraryMutation === 'function'
    ? await BackupScheduler.beginLibraryMutation('import-json', sourceLabel || 'JSON import').catch(() => null)
    : null;

  for (const script of data.scripts) {
    const rawScriptId = script && typeof script === 'object' ? script.id : undefined;
    const requestedScriptId = isSafeImportedScriptId(rawScriptId) ? rawScriptId : '';
    const errorName = requestedScriptId || (typeof rawScriptId === 'string' ? rawScriptId : '<unknown>');
    try {
      if (!script || typeof script.code !== 'string') {
        results.errors.push({ name: errorName, error: 'Invalid script entry' });
        continue;
      }

      const parsed = parseUserscript(script.code);
      if (parsed.error) {
        results.errors.push({ name: errorName, error: parsed.error });
        continue;
      }

      const existing = requestedScriptId ? await ScriptStorage.get(requestedScriptId) : null;
      if (existing && !overwrite) {
        results.skipped++;
        continue;
      }

      const scriptId = existing?.id && isSafeImportedScriptId(existing.id)
        ? existing.id
        : allocateImportedScriptId(requestedScriptId, usedScriptIds);
      usedScriptIds.add(scriptId);

      const nextSettings = importSettings && script.settings && typeof script.settings === 'object'
        ? { ...script.settings }
        : { ...(existing?.settings || {}) };
      if (importSettings && Object.prototype.hasOwnProperty.call(nextSettings, 'localLibraries')) {
        nextSettings.localLibraries = typeof LocalLibraries !== 'undefined' && typeof LocalLibraries.verifyLocalLibrarySnapshots === 'function'
          ? await LocalLibraries.verifyLocalLibrarySnapshots(nextSettings.localLibraries)
          : [];
      }
      const trustState = applyImportedScriptTrust(nextSettings, script.enabled !== false, {
        trustImportedScripts,
        source: 'import-json',
        sourceLabel: sourceLabel || 'JSON import'
      });
      countImportTrustDisposition(results, trustState.disposition);

      const importEntry: any = {
        id: scriptId,
        code: script.code,
        meta: parsed.meta,
        enabled: trustState.enabled,
        settings: trustState.settings,
        position: Number.isFinite(script.position) ? script.position : (existing?.position ?? _importPosition++),
        // On overwrite, keep the original install date rather than resetting it
        // to now when the incoming entry has no createdAt (backup restores and
        // JSON re-imports otherwise lose the true creation time).
        createdAt: Number.isFinite(script.createdAt) ? script.createdAt : (existing?.createdAt ?? Date.now()),
        updatedAt: Number.isFinite(script.updatedAt) ? script.updatedAt : Date.now()
      };

      // Snapshot the prior script for both versionHistory and the receipt
      // rollback path before the overwrite happens.
      if (existing) {
        const priorClone = structuredClone(existing);
        replacedSnapshots.push(priorClone);
        try {
          const priorValues = await ScriptValues.getAll(scriptId);
          if (priorValues && Object.keys(priorValues).length > 0) {
            valuesSnapshots[scriptId] = structuredClone(priorValues);
          }
        } catch (_) { /* values snapshot is best effort */ }

        const inheritedHistory = Array.isArray(existing.versionHistory)
          ? [...existing.versionHistory]
          : [];
        inheritedHistory.push({
          version: existing.meta?.version || '',
          code: existing.code || '',
          updatedAt: existing.updatedAt || Date.now(),
          source: 'import',
          sourceLabel: sourceLabel || 'import'
        });
        if (inheritedHistory.length > 5) inheritedHistory.splice(0, inheritedHistory.length - 5);
        importEntry.versionHistory = inheritedHistory;
        results.replacedScripts.push({
          id: scriptId,
          name: existing.meta?.name || scriptId,
          priorVersion: existing.meta?.version || ''
        });
      } else if (script.versionHistory && Array.isArray(script.versionHistory)) {
        importEntry.versionHistory = script.versionHistory;
      }
      await ensurePersistentStorageForScriptWrite('script-import', importEntry.code);
      await ScriptStorage.set(scriptId, importEntry);
      if (importStorage) {
        const storedValues = script.storage && typeof script.storage === 'object' ? script.storage : {};
        if (Object.keys(storedValues).length > 0) {
          await ScriptValues.deleteAll(scriptId);
          await ScriptValues.setAll(scriptId, storedValues);
          results.storageImported++;
        } else if (existing) {
          await ScriptValues.deleteAll(scriptId);
        }
      }
      results.imported++;
    } catch (e: any) {
      results.errors.push({ name: errorName, error: e.message });
    }
  }
  
  // Import settings if present
  if (data.settings && importSettings) {
    const settingsImport = prepareSettingsForPortableImport(data.settings, {
      allowCredentials: importSettingsCredentials === true && data.settingsCredentialsIncluded === true
    });
    await SettingsManager.set(settingsImport.settings);
    results.settingsImported = true;
    results.settingsCredentialsImported = settingsImport.settingsCredentialsImported;
    results.skippedSettingsCredentialKeys = settingsImport.skippedSettingsCredentialKeys;
    results.skippedSettingsSecurityKeys = settingsImport.skippedSettingsSecurityKeys;
    results.skippedSettingsUnknownKeys = settingsImport.skippedSettingsUnknownKeys;
    results.skippedSettingsTypeKeys = settingsImport.skippedSettingsTypeKeys;
  }

  if (importSettings && Object.prototype.hasOwnProperty.call(data, 'folders')) {
    try {
      await writePortableLocalState('scriptFolders', data.folders);
      resetPortableLocalStateCaches('scriptFolders');
      results.restoredFolders = true;
    } catch (e: any) {
      results.errors.push({ name: 'folders', error: e.message });
    }
  }

  if (importSettings && Object.prototype.hasOwnProperty.call(data, 'workspaces')) {
    try {
      await writePortableLocalState('workspaces', data.workspaces);
      resetPortableLocalStateCaches('workspaces');
      results.restoredWorkspaces = true;
    } catch (e: any) {
      results.errors.push({ name: 'workspaces', error: e.message });
    }
  }

  // Re-register all scripts after import
  await registerAllScripts(true);
  await updateBadge();

  // Persist an import receipt so the user can roll back when overwrite=true
  // replaced existing scripts.
  if (recordReceipt && typeof BackupScheduler !== 'undefined' && replacedSnapshots.length > 0) {
    try {
      const scriptIdsBefore = allExistingScripts
        .map((script: any) => script.id)
        .filter((id: any) => typeof id === 'string');
      let scriptIdsAfter = [];
      try {
        const after = await ScriptStorage.getAll();
        scriptIdsAfter = after.map((script: any) => script.id).filter((id: any) => typeof id === 'string');
      } catch (_) {}
      const beforeIdSet = new Set(scriptIdsBefore);
      const addedScriptIds = scriptIdsAfter.filter((id: any) => !beforeIdSet.has(id));
      const receiptMeta = await BackupScheduler.recordReceipt({
        type: 'import',
        source: 'import-json',
        sourceLabel: sourceLabel || 'JSON import (overwrite)',
        result: {
          imported: results.imported,
          skipped: results.skipped,
          replacedScripts: results.replacedScripts.length,
          quarantinedScripts: results.quarantinedScripts,
          preservedDisabledScripts: results.preservedDisabledScripts,
          trustedEnabledScripts: results.trustedEnabledScripts,
          errors: results.errors.slice()
        },
        snapshot: {
          scriptsBefore: replacedSnapshots,
          valuesBefore: valuesSnapshots,
          scriptIdsBefore,
          addedScriptIds
        }
      });
      if (receiptMeta) results.receiptId = receiptMeta.id;
    } catch (e) {
      console.warn('[ScriptVault] importScripts failed to persist receipt:', e);
    }
  }

  // Closed only once every write has landed, so a surviving entry means the run
  // did not reach here.
  if (mutationJournalId && typeof BackupScheduler !== 'undefined' && typeof BackupScheduler?.endLibraryMutation === 'function') {
    await BackupScheduler.endLibraryMutation(mutationJournalId).catch(() => {});
  }

  return results;
}

// Export to ZIP (Tampermonkey-compatible format)
async function exportToZip(options: any = {}) {
  const { includeStorage = true } = options;
  const scripts = await ScriptStorage.getAll();
  const files: any = {}; // fflate uses { filename: Uint8Array } format
  const usedNames = new Set();

  for (const script of scripts) {
    // Create safe filename, deduplicating collisions
    let safeName = (script.meta.name || 'unnamed')
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100);

    if (usedNames.has(safeName)) {
      let counter = 2;
      while (usedNames.has(`${safeName}_${counter}`)) counter++;
      safeName = `${safeName}_${counter}`;
    }
    usedNames.add(safeName);

    // Add the userscript file
    files[`${safeName}.user.js`] = fflate.strToU8(script.code);
    
    // Add options.json (Tampermonkey format)
    const scriptOptions = {
      scriptId: script.id,
      settings: {
        enabled: script.enabled,
        'run-at': script.meta['run-at'] || 'document-idle',
        override: {
          use_includes: [],
          use_matches: [],
          use_excludes: [],
          use_connects: [],
          merge_includes: true,
          merge_matches: true,
          merge_excludes: true,
          merge_connects: true
        }
      },
      meta: {
        name: script.meta.name,
        namespace: script.meta.namespace || '',
        version: script.meta.version || '1.0',
        description: script.meta.description || '',
        author: script.meta.author || '',
        match: script.meta.match || [],
        include: script.meta.include || [],
        exclude: script.meta.exclude || [],
        grant: script.meta.grant || [],
        require: script.meta.require || [],
        resource: script.meta.resource || {}
      },
      scriptVault: {
        schemaVersion: 1,
        createdAt: finiteBackupNumber(script.createdAt),
        updatedAt: finiteBackupNumber(script.updatedAt),
        position: finiteBackupNumber(script.position)
      }
    };
    files[`${safeName}.options.json`] = fflate.strToU8(JSON.stringify(scriptOptions, null, 2));
    
    // Add storage.json if script has stored values
    const values = includeStorage ? await ScriptValues.getAll(script.id) : null;
    if (values && Object.keys(values).length > 0) {
      const storage = { data: values };
      files[`${safeName}.storage.json`] = fflate.strToU8(JSON.stringify(storage, null, 2));
    }
  }
  
  // Generate zip as Uint8Array then convert to base64 in chunks (avoid stack overflow)
  const zipData = fflate.zipSync(files, { level: 6 });
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < zipData.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, zipData.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);
  return { zipData: base64, filename: `scriptvault-archive-${new Date().toISOString().replace(/[:.]/g, '-')}.zip` };
}

// Import from ZIP (supports Tampermonkey and other formats)
async function importFromZip(zipData: any, options: any = {}) {
  const results: any = {
    imported: 0,
    skipped: 0,
    errors: [],
    warnings: [],
    unmappedSettings: [],
    storageImported: 0,
    replacedScripts: [],
    quarantinedScripts: 0,
    preservedDisabledScripts: 0,
    trustedEnabledScripts: 0
  };
  const recordReceipt = options.recordReceipt !== false;
  const sourceLabel = typeof options.sourceLabel === 'string' && options.sourceLabel.trim()
    ? options.sourceLabel.trim().slice(0, 512)
    : 'ZIP import (overwrite)';
  const trustImportedScripts = options.trustImportedScripts === true;
  // Pre-import snapshot for replaced scripts so the import is reversible.
  const replacedSnapshots = [];
  const valuesSnapshots: any = {};
  // See importScripts: the snapshot accumulates during the loop, so the journal
  // is what marks the library as mid-write.
  const mutationJournalId = typeof BackupScheduler !== 'undefined' && typeof BackupScheduler?.beginLibraryMutation === 'function'
    ? await BackupScheduler.beginLibraryMutation('import-zip', sourceLabel).catch(() => null)
    : null;

  try {
    const unzipped = unzipArchiveBounded(zipData);
    const fileNames = Object.keys(unzipped);

    // Find all .user.js files
    const userScripts = fileNames.filter(name => name.endsWith('.user.js'));
    const allExistingScripts = await ScriptStorage.getAll();
    const usedScriptIds = new Set(allExistingScripts.map((script: any) => script.id));
    // Starting position for newly-imported scripts (avoids O(n²) getAll() per script)
    let _importPosition = allExistingScripts.length;

    for (const filename of userScripts) {
      try {
        const code = archiveEntryText(unzipped, filename, ARCHIVE_MAX_SCRIPT_BYTES);

        // Validate it's a userscript
        if (!code.includes('==UserScript==')) {
          results.errors.push({ name: filename, error: 'Not a valid userscript' });
          continue;
        }

        const parsed: any = parseUserscript(code);
        if (parsed.error) {
          results.errors.push({ name: filename, error: parsed.error });
          continue;
        }

        // Look for associated options and storage files
        const baseName = filename.replace('.user.js', '');
        const optionsFileData = unzipped[`${baseName}.options.json`];
        const storageFileData = unzipped[`${baseName}.storage.json`];
        
        let enabled = true;
        let storedValues = {};
        let preferredScriptId = '';
        let importedCreatedAt = null;
        let importedUpdatedAt = null;
        let importedPosition = null;
        let optionsData: any = null;
        let importedSettings: any = {};
        
        // Parse options file if exists
        if (optionsFileData) {
          try {
            optionsData = parseArchiveJson(unzipped, `${baseName}.options.json`, ARCHIVE_MAX_OPTIONS_BYTES);
            enabled = optionsData.settings?.enabled !== false;
            preferredScriptId = isSafeImportedScriptId(optionsData.scriptId) ? optionsData.scriptId : '';
            const scriptVault = optionsData.scriptVault && typeof optionsData.scriptVault === 'object'
              ? optionsData.scriptVault
              : {};
            importedCreatedAt = finiteBackupNumber(scriptVault.createdAt ?? optionsData.createdAt);
            importedUpdatedAt = finiteBackupNumber(scriptVault.updatedAt ?? optionsData.updatedAt);
            importedPosition = finiteBackupNumber(scriptVault.position ?? optionsData.position);
          } catch (e) {
            console.warn('Failed to parse options file:', e);
            addImportDiagnostics(results, filename, {
              warnings: ['options metadata could not be parsed and was ignored'],
              unmappedKeys: ['options'],
            });
          }
        }
        
        // Parse storage file if exists
        if (storageFileData) {
          try {
            storedValues = sanitizeImportedValueMap(parseArchiveJson(
              unzipped,
              `${baseName}.storage.json`,
              ARCHIVE_MAX_JSON_ENTRY_BYTES
            ));
            addImportStorageDiagnostics(results, filename, storedValues, true);
          } catch (e) {
            console.warn('Failed to parse storage file:', e);
            addImportDiagnostics(results, filename, {
              warnings: ['stored values could not be parsed and were ignored'],
              unmappedKeys: ['storage'],
            });
          }
        }

        const isScriptVaultArchive = optionsData?.scriptVault?.schemaVersion === 1;
        const settingSources = optionsData
          ? (isScriptVaultArchive
            ? [{ value: optionsData.scriptVault?.settings || {}, label: 'scriptVault' }]
            : [{ value: optionsData, label: 'options' }])
          : [];
        const mapped = mapImportedScriptSettings(parsed.meta, [
          ...settingSources,
          { value: storedValues, label: 'storage' },
        ]);
        importedSettings = mapped.settings;
        addImportDiagnostics(results, filename, mapped);

        // Prefer ScriptVault's stable scriptId metadata when present. Name or
        // namespace can change over time, but backup restore should still
        // update the same script record.
        const existingById = preferredScriptId
          ? allExistingScripts.find((s: any) => s.id === preferredScriptId)
          : null;
        const existing = existingById || allExistingScripts.find((s: any) =>
          s.meta.name === parsed.meta.name &&
          (s.meta.namespace === parsed.meta.namespace || (!s.meta.namespace && !parsed.meta.namespace))
        );

        if (existing && !options.overwrite) {
          results.skipped++;
          continue;
        }

        // Create or update script
        let scriptId;
        if (existing?.id && isSafeImportedScriptId(existing.id)) {
          scriptId = existing.id;
        } else {
          scriptId = allocateImportedScriptId(preferredScriptId, usedScriptIds);
        }
        usedScriptIds.add(scriptId);
        const now = Date.now();
        // Base the trust/quarantine state on the existing script's settings so a
        // backup restore (or ZIP re-import) over an installed script preserves
        // its per-script settings — userIncludes/userMatches/userExcludes, notes,
        // tags, pinned, runAt override, syncValues — instead of wiping them.
        const nextImportedSettings: any = {
          ...(existing?.settings || {}),
          ...importedSettings,
        };
        if (existing?.settings?.userConfig && importedSettings.userConfig) {
          nextImportedSettings.userConfig = {
            ...existing.settings.userConfig,
            ...importedSettings.userConfig,
          };
        }
        const trustState = applyImportedScriptTrust(nextImportedSettings, enabled, {
          trustImportedScripts,
          source: 'import-zip',
          sourceLabel
        });
        countImportTrustDisposition(results, trustState.disposition);
        const script: any = {
          id: scriptId,
          code: code,
          meta: parsed.meta,
          enabled: trustState.enabled,
          position: existing?.position ?? (importedPosition ?? _importPosition++),
          createdAt: finiteBackupNumber(existing?.createdAt) ?? importedCreatedAt ?? now,
          updatedAt: importedUpdatedAt ?? now
        };
        if (Object.keys(trustState.settings).length > 0) {
          script.settings = trustState.settings;
        }

        // Snapshot before overwrite — feeds both versionHistory and the
        // restore receipt rollback path.
        if (existing) {
          const priorClone = structuredClone(existing);
          replacedSnapshots.push(priorClone);
          try {
            const priorValues = await ScriptValues.getAll(scriptId);
            if (priorValues && Object.keys(priorValues).length > 0) {
              valuesSnapshots[scriptId] = structuredClone(priorValues);
            }
          } catch (_) {}

          const inheritedHistory = Array.isArray(existing.versionHistory)
            ? [...existing.versionHistory]
            : [];
          inheritedHistory.push({
            version: existing.meta?.version || '',
            code: existing.code || '',
            updatedAt: existing.updatedAt || Date.now(),
            source: 'import',
            sourceLabel
          });
          if (inheritedHistory.length > 5) inheritedHistory.splice(0, inheritedHistory.length - 5);
          script.versionHistory = inheritedHistory;
          results.replacedScripts.push({
            id: scriptId,
            name: existing.meta?.name || scriptId,
            priorVersion: existing.meta?.version || ''
          });
        }

        await ensurePersistentStorageForScriptWrite(existing ? 'zip-import-update' : 'zip-import', script.code);
        await ScriptStorage.set(scriptId, script);

        // Import stored values
        if (Object.keys(storedValues).length > 0) {
          await ScriptValues.setAll(scriptId, storedValues);
        }

        results.imported++;
      } catch (e: any) {
        results.errors.push({ name: filename, error: e.message });
      }
    }
    
    // If no .user.js files found, try importing raw JS files
    if (userScripts.length === 0) {
      const jsFiles = fileNames.filter(name => 
        name.endsWith('.js') && !name.includes('/')
      );
      
      for (const filename of jsFiles) {
        try {
          const code = archiveEntryText(unzipped, filename, ARCHIVE_MAX_SCRIPT_BYTES);
          if (!code.includes('==UserScript==')) continue;
          
          const parsed = parseUserscript(code);
          if (parsed.error) continue;
          
          const scriptId = generateId();
          const trustState = applyImportedScriptTrust({}, true, {
            trustImportedScripts,
            source: 'import-zip-raw',
            sourceLabel
          });
          countImportTrustDisposition(results, trustState.disposition);
          const script: any = {
            id: scriptId,
            code: code,
            meta: parsed.meta,
            enabled: trustState.enabled,
            position: _importPosition++,
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          if (Object.keys(trustState.settings).length > 0) {
            script.settings = trustState.settings;
          }
          await ensurePersistentStorageForScriptWrite('zip-import', code);
          await ScriptStorage.set(scriptId, script);
          results.imported++;
        } catch (e: any) {
          results.errors.push({ name: filename, error: e.message });
        }
      }
    }
    
    await updateBadge();

    // Re-register all scripts after import
    await registerAllScripts(true);

    // Persist an import receipt if the import actually replaced existing
    // scripts. Backup-restore goes through restoreBackup which records its
    // own receipt; only standalone ZIP imports need their own receipt here.
    if (recordReceipt && typeof BackupScheduler !== 'undefined' && replacedSnapshots.length > 0) {
      try {
        const scriptIdsBefore = allExistingScripts
          .map((script: any) => script.id)
          .filter((id: any) => typeof id === 'string');
        let scriptIdsAfter = [];
        try {
          const after = await ScriptStorage.getAll();
          scriptIdsAfter = after.map((script: any) => script.id).filter((id: any) => typeof id === 'string');
        } catch (_) {}
        const beforeIdSet = new Set(scriptIdsBefore);
        const addedScriptIds = scriptIdsAfter.filter((id: any) => !beforeIdSet.has(id));
        const receiptMeta = await BackupScheduler.recordReceipt({
          type: 'import',
          source: 'import-zip',
          sourceLabel,
          result: {
            imported: results.imported,
            skipped: results.skipped,
            replacedScripts: results.replacedScripts.length,
            quarantinedScripts: results.quarantinedScripts,
            preservedDisabledScripts: results.preservedDisabledScripts,
            trustedEnabledScripts: results.trustedEnabledScripts,
            errors: results.errors.slice()
          },
          snapshot: {
            scriptsBefore: replacedSnapshots,
            valuesBefore: valuesSnapshots,
            scriptIdsBefore,
            addedScriptIds
          }
        });
        if (receiptMeta) results.receiptId = receiptMeta.id;
      } catch (e) {
        console.warn('[ScriptVault] importFromZip failed to persist receipt:', e);
      }
    }

    return results;
  } catch (e: any) {
    console.error('[ScriptVault] importFromZip error:', e);
    return { ...results, error: e.message };
  } finally {
    // A thrown import is a FINISHED attempt, not an interrupted one — the caller
    // gets the error. Only a process that never returns leaves the entry behind.
    if (mutationJournalId && typeof BackupScheduler !== 'undefined' && typeof BackupScheduler?.endLibraryMutation === 'function') {
      await BackupScheduler.endLibraryMutation(mutationJournalId).catch(() => {});
    }
  }
}

function splitVendorUserscriptText(text: any) {
  return String(text || '')
    .split(/\n\s*\n(?=\/\/\s*==UserScript==)/)
    .map(part => part.trim())
    .filter(part => part.includes('==UserScript==') && part.includes('==/UserScript=='))
    .map(code => ({ code, archiveEnabled: true, sourceName: '' }));
}

function parseVendorBackupCandidates(vendor: any, text: any) {
  if (vendor === 'tampermonkey') return splitVendorUserscriptText(text);
  if (vendor === 'violentmonkey') {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed?.scripts)) {
        return parsed.scripts.map((script: any) => ({
          code: script?.code || script?.custom?.code || '',
          archiveEnabled: script?.config?.enabled !== false,
          sourceName: script?.props?.name || '',
          settings: script?.config || {},
          custom: script?.custom || {},
          values: script?.values || script?.storage || script?.config?.values || {},
          raw: script,
        }));
      }
    } catch (_) { /* Text exports use the shared userscript-block parser. */ }
    return splitVendorUserscriptText(text);
  }
  if (vendor === 'greasemonkey') {
    const parsed = JSON.parse(text);
    const scripts = Array.isArray(parsed) ? parsed : parsed?.scripts;
    if (!Array.isArray(scripts)) throw new Error('Backup does not contain a scripts array');
    return scripts.map(script => ({
      code: script?.source || script?.code || script?.content || '',
      archiveEnabled: script?.enabled !== false,
      sourceName: script?.name || '',
      settings: script?.settings || script?.config || {},
      custom: script?.custom || {},
      values: script?.values || script?.storage || {},
      raw: script,
    }));
  }
  throw new Error('Unsupported vendor backup type');
}

async function importVendorBackup(vendor: any, text: any, options: any = {}) {
  const labels: any = {
    tampermonkey: 'Tampermonkey backup',
    violentmonkey: 'Violentmonkey backup',
    greasemonkey: 'Greasemonkey backup'
  };
  const results: any = {
    imported: 0,
    skipped: 0,
    errors: [],
    warnings: [],
    unmappedSettings: [],
    storageImported: 0,
    quarantinedScripts: 0,
    preservedDisabledScripts: 0,
    trustedEnabledScripts: 0
  };
  const sourceLabel = typeof options.sourceLabel === 'string' && options.sourceLabel.trim()
    ? options.sourceLabel.trim()
    : labels[vendor] || 'Vendor backup';
  if (typeof text !== 'string' || !text.trim()) return { ...results, error: 'Backup file is empty' };
  const totalBytes = utf8ByteLength(text);
  if (totalBytes > ARCHIVE_MAX_TOTAL_UNCOMPRESSED_BYTES) {
    return { ...results, error: `Backup exceeds ${formatArchiveBytes(ARCHIVE_MAX_TOTAL_UNCOMPRESSED_BYTES)}.` };
  }

  let candidates;
  try {
    candidates = parseVendorBackupCandidates(vendor, text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ...results, error: `Invalid ${sourceLabel} format: ${message}` };
  }
  if (candidates.length > ARCHIVE_MAX_ENTRIES) {
    return { ...results, error: `Backup has too many scripts (${candidates.length}). Maximum is ${ARCHIVE_MAX_ENTRIES}.` };
  }
  if (candidates.length === 0) {
    return { ...results, error: 'No valid userscripts found in backup file' };
  }

  const existingScripts = await ScriptStorage.getAll();
  const byIdentity = new Map(existingScripts.map((script: any) => [
    `${script.meta?.name || ''}\u0000${script.meta?.namespace || ''}`,
    script
  ]));
  let nextPosition = existingScripts.length;

  for (const candidate of candidates) {
    const code = typeof candidate.code === 'string' ? candidate.code : '';
    const sourceName = typeof candidate.sourceName === 'string' && candidate.sourceName
      ? candidate.sourceName
      : '<unknown>';
    if (!code) {
      results.skipped++;
      continue;
    }
    const codeBytes = utf8ByteLength(code);
    if (codeBytes > ARCHIVE_MAX_SCRIPT_BYTES) {
      results.errors.push({
        name: sourceName,
        error: `Script is too large (${formatArchiveBytes(codeBytes)}). Maximum is ${formatArchiveBytes(ARCHIVE_MAX_SCRIPT_BYTES)}.`
      });
      continue;
    }
    try {
      const parsed: any = parseUserscript(code);
      if (parsed.error) {
        results.errors.push({ name: sourceName, error: parsed.error });
        continue;
      }
      const identity = `${parsed.meta.name || ''}\u0000${parsed.meta.namespace || ''}`;
      const existing: any = byIdentity.get(identity);
      if (existing && !options.overwrite) {
        results.skipped++;
        continue;
      }
      const id = existing?.id || generateId();
      const mapped = mapImportedScriptSettings(parsed.meta, [
        { value: candidate.settings, label: 'settings' },
        { value: candidate.custom, label: 'custom' },
        { value: candidate.raw, label: 'candidate' },
        { value: candidate.values, label: 'storage' },
      ]);
      addImportDiagnostics(results, sourceName, mapped);
      const importedValues = sanitizeImportedValueMap(candidate.values);
      addImportStorageDiagnostics(results, sourceName, importedValues, candidate.values !== undefined);
      const nextImportedSettings: any = {
        ...(existing?.settings || {}),
        ...mapped.settings,
      };
      if (existing?.settings?.userConfig && mapped.settings.userConfig) {
        nextImportedSettings.userConfig = {
          ...existing.settings.userConfig,
          ...mapped.settings.userConfig,
        };
      }
      const trustState = applyImportedScriptTrust(nextImportedSettings, candidate.archiveEnabled !== false, {
        trustImportedScripts: options.trustImportedScripts === true,
        source: `import-${vendor}`,
        sourceLabel
      });
      countImportTrustDisposition(results, trustState.disposition);
      const now = Date.now();
      const importedScript = {
        id,
        code,
        meta: parsed.meta,
        enabled: trustState.enabled,
        settings: trustState.settings,
        position: existing?.position ?? nextPosition++,
        createdAt: existing?.createdAt || now,
        updatedAt: now
      };
      await ensurePersistentStorageForScriptWrite(existing ? `${vendor}-import-update` : `${vendor}-import`, code);
      await ScriptStorage.set(id, importedScript);
      if (Object.keys(importedValues).length > 0) await ScriptValues.setAll(id, importedValues);
      byIdentity.set(identity, importedScript);
      results.imported++;
    } catch (error) {
      results.errors.push({
        name: sourceName,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Imported records have their final trust state before registration runs.
  // Quarantined and archive-disabled scripts therefore cannot become live.
  await registerAllScripts(true);
  await updateBadge();
  return results;
}

async function importSingleScript(code: any) {
  if (_scriptSourceByteLength(code) > MAX_SCRIPT_SIZE) {
    return { error: `Script exceeds ${formatBytes(MAX_SCRIPT_SIZE)} size limit` };
  }
  const parsed = parseUserscript(code);
  if (parsed.error) return { error: parsed.error };

  const id = generateId();
  const script = {
    id,
    code,
    meta: parsed.meta,
    enabled: true,
    position: (await ScriptStorage.getAll()).length,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  await ScriptStorage.set(id, script);
  await registerScript(script);
  await updateBadge();
  notifyEasyCloudScriptSaved(id);
  return { success: true, script: { ...script, metadata: script.meta } };
}

async function forceUpdateScript(scriptId: any) {
  const script = await ScriptStorage.get(scriptId);
  if (!script) return { error: 'Script not found' };
  const downloadUrl = script.meta.downloadURL || script.meta.updateURL;
  if (!downloadUrl) return { error: 'No download URL configured' };
  try {
    const { response, code: newCode } = await UpdateSystem.fetchUpdateCandidate(downloadUrl, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
    });
    if (!response.ok) return { error: `HTTP ${response.status}` };
    const parsed = parseUserscript(newCode);
    if (parsed.error) return parsed;
    return await UpdateSystem.applyUpdate(scriptId, newCode, { force: true, sourceUrl: downloadUrl });
  } catch (error: any) {
    return { error: error?.message || String(error) };
  }
}

async function getScriptVersionHistory(scriptId: any) {
  const script = await ScriptStorage.get(scriptId);
  return { history: script?.versionHistory || [] };
}

async function rollbackScriptVersion(scriptId: any, index: any) {
  return await _runExclusiveScriptOperation(scriptId, async () => {
    const script = await ScriptStorage.get(scriptId);
    if (!script) return { error: 'Script not found' };
    if (!script.versionHistory || script.versionHistory.length === 0) {
      return { error: 'No version history available' };
    }
    const targetIndex = index !== undefined ? index : script.versionHistory.length - 1;
    const target = script.versionHistory[targetIndex];
    if (!target) return { error: 'Version not found' };

    const parsed = parseUserscript(target.code);
    if (parsed.error) return parsed;

    script.versionHistory.push({
      version: script.meta.version,
      code: script.code,
      updatedAt: script.updatedAt || Date.now()
    });
    script.versionHistory.splice(targetIndex, 1);
    if (script.versionHistory.length > 5) {
      script.versionHistory = script.versionHistory.slice(-5);
    }

    script.code = target.code;
    script.meta = parsed.meta;
    script.updatedAt = Date.now();

    await ScriptStorage.set(scriptId, script);
    await reregisterScript(script);
    notifyEasyCloudScriptSaved(scriptId);
    return { success: true, script: { ...script, metadata: script.meta } };
  });
}

async function runCloudSyncAction() {
  const result = await CloudSync.sync();
  await maybeRegisterScriptsAfterSuccessfulSync(result);
  await persistLastSyncResult(result);
  return result;
}

async function testCloudSyncProvider(providerOverride: any) {
  const settings = await getEffectiveSyncSettings(await SettingsManager.get());
  const providerName = providerOverride || settings.syncProvider;
  const provider = CloudSync.providers[providerName];
  if (!provider) return { ok: false, error: `Unknown provider: ${providerName}` };
  try {
    const raw = await provider.test(settings);
    if (typeof raw === 'boolean') return { ok: raw };
    if (raw && typeof raw === 'object') {
      const ok = raw.success === true || raw.ok === true;
      const error = raw.error || raw.message || null;
      const hint = !ok ? (
        error?.toLowerCase().includes('401') ? 'Authentication failed — re-connect the account.' :
        error?.toLowerCase().includes('403') ? 'Server rejected the credentials — check the user has write access.' :
        error?.toLowerCase().includes('404') ? 'Endpoint not found — verify the URL.' :
        error?.toLowerCase().includes('network') ? 'Network error — check connectivity and CORS.' :
        null
      ) : null;
      return hint ? { ok, error, hint } : { ok, error };
    }
    return { ok: false, error: 'Provider returned no status' };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function connectCloudSyncProvider(providerName: any) {
  const provider = CloudSyncProviders[providerName];
  if (!provider) return { success: false, error: 'Unknown provider' };

  try {
    const settings = await getEffectiveSyncSettings(await SettingsManager.get());
    const result = await provider.connect(settings);
    if (result.success) {
      const updates: any = {};
      if (providerName === 'googledrive') {
        updates.googleDriveConnected = true;
        updates.googleDriveUser = result.user;
      } else if (providerName === 'dropbox') {
        updates.dropboxToken = result.token;
        updates.dropboxRefreshToken = result.refreshToken || '';
        if (result.user) updates.dropboxUser = result.user;
        const status = await provider.getStatus({ dropboxToken: result.token });
        if (status.user) updates.dropboxUser = status.user;
      }
      updates.syncProvider = providerName;
      await persistSyncSettingsUpdate(updates, settings);
    }
    return result;
  } catch (error: any) {
    return { success: false, error: error?.message || String(error) };
  }
}

async function disconnectCloudSyncProvider(providerName: any) {
  const provider = CloudSyncProviders[providerName];
  if (!provider) return { success: false, error: 'Unknown provider' };

  try {
    const settings = await getEffectiveSyncSettings(await SettingsManager.get());
    await provider.disconnect(settings);
    const updates: any = { syncProvider: 'none' };
    if (providerName === 'googledrive') {
      updates.googleDriveConnected = false;
      updates.googleDriveUser = null;
    } else if (providerName === 'dropbox') {
      updates.dropboxToken = '';
      updates.dropboxRefreshToken = '';
      updates.dropboxUser = null;
    } else if (providerName === 'onedrive') {
      updates.onedriveToken = '';
      updates.onedriveRefreshToken = '';
      updates.onedriveConnected = false;
      updates.onedriveUser = null;
    } else if (providerName === 'webdav') {
      updates.webdavUrl = '';
      updates.webdavUsername = '';
      updates.webdavPassword = '';
    }
    updates.syncEnabled = false;
    await persistSyncSettingsUpdate(updates, settings);
    await clearSyncSessionCredentials();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || String(error) };
  }
}

async function getCloudSyncProviderStatus(providerName: any) {
  const provider = CloudSyncProviders[providerName];
  if (!provider) return { connected: false };
  const settings = await getEffectiveSyncSettings(await SettingsManager.get());
  return provider.getStatus ? await provider.getStatus(settings) : { connected: false };
}

async function exportCloudSyncBackup(providerName: any, options: any) {
  const provider = CloudSyncProviders[providerName];
  if (!provider) return { success: false, error: 'Unknown provider: ' + providerName };
  try {
    const exportData = await exportAllScripts(options);
    const settings = await getEffectiveSyncSettings(await SettingsManager.get());
    const uploadData = await prepareSyncEnvelopeForRemoteUpload(exportData, settings);
    await provider.upload(uploadData, settings);
    return {
      success: true,
      exported: exportData.scripts?.length || 0,
      settingsIncluded: options.includeSettings,
      settingsCredentialsIncluded: exportData.settingsCredentialsIncluded === true,
      redactedSettingsCredentialKeys: exportData.redactedSettingsCredentialKeys || [],
      storageIncluded: options.includeStorage
    };
  } catch (error: any) {
    return { success: false, error: error?.message || String(error) };
  }
}

async function importCloudSyncBackup(providerName: any, options: any) {
  const provider = CloudSyncProviders[providerName];
  if (!provider) return { success: false, error: 'Unknown provider: ' + providerName };
  try {
    const settings = await getEffectiveSyncSettings(await SettingsManager.get());
    const remoteData = await provider.download(settings);
    if (!remoteData) return { success: false, error: 'No backup found on ' + providerName };
    const importData = await readSyncEnvelopeFromRemote(remoteData, settings);
    if (!importData) return { success: false, error: 'No backup found on ' + providerName };
    const result: any = await importScripts(importData, {
      overwrite: true,
      ...options
    });
    return { success: !result.error, ...result };
  } catch (error: any) {
    return { success: false, error: error?.message || String(error) };
  }
}

async function getCloudSyncStatus(providerName: any) {
  const provider = CloudSyncProviders[providerName];
  if (!provider) return { connected: false };
  try {
    const settings = await getEffectiveSyncSettings(await SettingsManager.get());
    return provider.getStatus ? await provider.getStatus(settings) : { connected: false };
  } catch (error: any) {
    return { connected: false, error: error?.message || String(error) };
  }
}

async function switchScriptProfile(profileId: any) {
  const { profiles = [] } = await chrome.storage.local.get('profiles');
  const profile = profiles.find((candidate: any) => candidate.id === profileId);
  if (!profile) return { error: 'Profile not found' };
  const scripts = await ScriptStorage.getAll();
  const updates = [];
  for (const script of scripts) {
    const profileEnabled = profile.scriptStates?.[script.id] ?? script.enabled;
    const enabled = script.settings?._importQuarantine ? false : profileEnabled;
    if (script.enabled !== enabled) {
      updates.push(ScriptStorage.set(script.id, { ...script, enabled }));
    }
  }
  if (updates.length) await Promise.all(updates);
  await chrome.storage.local.set({ activeProfileId: profileId });
  await registerAllScripts(true);
  await updateBadge();
  return { success: true };
}

async function saveScriptProfile(profile: any) {
  const { profiles = [] } = await chrome.storage.local.get('profiles');
  const index = profiles.findIndex((candidate: any) => candidate.id === profile.id);
  if (index >= 0) profiles[index] = profile;
  else profiles.push(profile);
  await chrome.storage.local.set({ profiles });
  return { success: true };
}

async function deleteScriptProfile(profileId: any) {
  const profileData = await chrome.storage.local.get(['profiles', 'activeProfileId']);
  const profiles = (profileData.profiles || []).filter((profile: any) => profile.id !== profileId);
  const updates: any = { profiles };
  if (profileData.activeProfileId === profileId) updates.activeProfileId = null;
  await chrome.storage.local.set(updates);
  return { success: true };
}

async function saveScriptCollection(collection: any) {
  const { scriptCollections = [] } = await chrome.storage.local.get('scriptCollections');
  const index = scriptCollections.findIndex((candidate: any) => candidate.id === collection.id);
  if (index >= 0) scriptCollections[index] = collection;
  else scriptCollections.push(collection);
  await chrome.storage.local.set({ scriptCollections });
  return { success: true };
}

async function deleteScriptCollection(collectionId: any) {
  const { scriptCollections = [] } = await chrome.storage.local.get('scriptCollections');
  await chrome.storage.local.set({
    scriptCollections: scriptCollections.filter((collection: any) => collection.id !== collectionId)
  });
  return { success: true };
}

async function applyGlobalSettingsUpdate(changed: any) {
  const oldSettings = await getEffectiveSyncSettings(await SettingsManager.get());
  const result = await persistSyncSettingsUpdate(changed, oldSettings);
  if ('enabled' in changed && changed.enabled !== oldSettings.enabled) {
    await registerAllScripts(true);
  }
  if ('checkInterval' in changed || 'autoUpdate' in changed ||
      'syncEnabled' in changed || 'syncProvider' in changed || 'syncInterval' in changed ||
      'subscriptionAutoRefresh' in changed || 'subscriptionRefreshInterval' in changed) {
    await setupAlarms();
  }
  if ('syncEncryptionEnabled' in changed && changed.syncEncryptionEnabled === false) {
    await SettingsManager.set('syncEncryptionEstablished', false);
  }
  if ('badgeColor' in changed || 'badgeInfo' in changed || 'showBadge' in changed) {
    await updateBadge();
  }
  if ('enableContextMenu' in changed) {
    await setupContextMenus();
  }
  if ('pageFilterMode' in changed || 'whitelistedPages' in changed ||
      'scopedHostPermissions' in changed || 'blacklistedPages' in changed || 'deniedHosts' in changed) {
    await registerAllScripts(true);
  }
  return result;
}

async function updatePerScriptSettings(scriptId: any, changedSettings: any) {
  if (!scriptId) return { error: 'No script ID provided' };
  return await _runExclusiveScriptOperation(scriptId, async () => {
    const script = await ScriptStorage.get(scriptId);
    if (!script) return { error: 'Script not found' };

    const oldSettings = script.settings || {};
    const settingsUpdate = { ...changedSettings };
    if (Object.prototype.hasOwnProperty.call(settingsUpdate, 'localLibraries') && typeof LocalLibraries !== 'undefined') {
      settingsUpdate.localLibraries = LocalLibraries.normalizeLocalLibrarySnapshots(settingsUpdate.localLibraries);
    }
    const oldEnabled = script.enabled;
    script.settings = { ...oldSettings, ...settingsUpdate };
    script.updatedAt = Date.now();

    if ('enabled' in settingsUpdate) {
      script.enabled = !!settingsUpdate.enabled;
      if (script.enabled && script.settings?._importQuarantine) {
        script.settings = recordImportedScriptTrustReview(script.settings);
      }
    }

    await ScriptStorage.set(scriptId, script);
    notifyEasyCloudScriptSaved(scriptId);

    if ('enabled' in settingsUpdate && script.enabled !== oldEnabled) {
      if (script.enabled) await reregisterScript(script);
      else await unregisterScript(scriptId);
      await updateBadge();
      try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (tab.url && doesScriptMatchUrl(script, tab.url)) {
            chrome.tabs.reload(tab.id).catch(() => {});
          }
        }
      } catch (_) {}
      return { success: true };
    }

    const executionKeys = [
      'runAt', 'injectInto', 'useOriginalMatches', 'useOriginalIncludes',
      'useOriginalExcludes', 'userMatches', 'userIncludes', 'userExcludes',
      'frameMode', 'userConfig', 'localLibraries'
    ];
    const needsReregister = executionKeys.some(key =>
      key in settingsUpdate && JSON.stringify(oldSettings[key]) !== JSON.stringify(settingsUpdate[key])
    );
    if (needsReregister && script.enabled !== false) await reregisterScript(script);
    return { success: true };
  });
}

async function resetPerScriptSettings(scriptId: any) {
  const script = await ScriptStorage.get(scriptId);
  if (!script) return { error: 'Script not found' };
  const executionKeys = [
    'runAt', 'frameMode', 'userMatches', 'userIncludes', 'userExcludes',
    'useOriginalMatches', 'useOriginalIncludes', 'useOriginalExcludes',
    'injectInto', 'userConfig', 'localLibraries'
  ];
  const hadExecutionSettings = script.settings && Object.keys(script.settings)
    .some(key => executionKeys.includes(key));
  if (Array.isArray(script.settings?.localLibraries) && typeof LocalWorkspaceBindings !== 'undefined') {
    const bindings = await LocalWorkspaceBindings.getByScript(scriptId).catch(() => []);
    await Promise.all(bindings
      .filter((binding: any) => binding.bindingKind === 'library')
      .map((binding: any) => LocalWorkspaceBindings.delete(binding.bindingId).catch(() => {})));
  }
  script.settings = {};
  await ScriptStorage.set(scriptId, script);
  if (hadExecutionSettings && script.enabled) await reregisterScript(script);
  return { success: true };
}

// ============================================================================
// Message Handlers
// ============================================================================

// Browser document/frame ids are intentionally kept in memory only. They are
// diagnostic context for the current service-worker lifetime, not durable user
// data. The bounded store keeps earlier-document events distinct after a
// same-tab navigation so DevTools and status surfaces do not imply that stale
// frame activity belongs to the page currently visible in the tab.
const executionDiagnosticsStore = ExecutionDiagnostics.createExecutionDiagnosticsStore();
// Outcome continuity is a separate, privacy-safe journal. Session storage
// survives MV3 worker restarts without entering sync/export data, while the
// journal module enforces count, age, per-tab, and serialized-byte caps before
// anything reaches the browser storage API.
const executionDiagnosticsJournal = ExecutionDiagnostics.createExecutionDiagnosticsJournal();
const executionJournalStorage: any = chrome.storage?.session &&
  typeof chrome.storage.session.get === 'function' &&
  typeof chrome.storage.session.set === 'function'
  ? chrome.storage.session
  : null;
const executionDiagnosticsJournalPersistence = executionJournalStorage
  ? ExecutionDiagnostics.createExecutionDiagnosticsJournalPersistence(executionDiagnosticsJournal, executionJournalStorage)
  : null;

function getExecutionDiagnosticsSnapshot(tabId: any) {
  const numericTabId = Number(tabId);
  const snapshot = executionDiagnosticsStore.snapshot(numericTabId);
  snapshot.journal = executionDiagnosticsJournal.snapshot(numericTabId);
  return snapshot;
}

function recordExecutionDiagnostic(sender: any, event: any) {
  const snapshot = executionDiagnosticsStore.record(sender, event);
  if (event?.type === 'run' || event?.type === 'error') {
    executionDiagnosticsJournal.record(sender, event);
    executionDiagnosticsJournalPersistence?.schedule().catch(() => {});
  }
  return snapshot;
}

const executionTelemetryHandler = ExecutionTelemetry.createExecutionTelemetryHandler({
  getScript: (scriptId: any) => ScriptStorage.get(scriptId),
  recordDiagnostic: (sender: any, event: any) => recordExecutionDiagnostic(sender, event),
  scheduleStatsSave: () => _debouncedStatsSave(),
  triggerAfterScript: (scriptId: any, context: any) => triggerChainsForAfterScript(scriptId, context),
  addNetworkLog: (entry: any) => NetworkLog.add(entry),
  getStatsUrlRetention: () => (SettingsManager.cache && SettingsManager.cache.statsUrlRetention) || 'origin',
  retainStatsUrl: (url: any, mode: any) => _retainStatsUrl(url, mode),
  logExecutionError: (entry: any) => typeof ErrorLog !== 'undefined' ? ErrorLog.log(entry) : undefined,
  onTriggerError: (error: any) => console.error('[ScriptVault] After-script chain trigger error:', error)
});
const backgroundActionRegistry = MessageRouter.createBackgroundActionRegistry();
backgroundActionRegistry.registerHandlers(ImportActionHandler.createImportActionHandlers({
  importScript: (code: any) => importSingleScript(code),
  importAll: (data: any, options: any) => importScripts(data, options),
  importVendorBackup: (vendor: any, text: any, options: any) => importVendorBackup(vendor, text, options),
  importFromZip: (zipData: any, options: any) => importFromZip(zipData, options || {})
}));
backgroundActionRegistry.registerHandlers(TelemetryActionHandler.createTelemetryActionHandlers({
  handleBridgeTelemetry: (data: any, sender: any) => executionTelemetryHandler.handleBridgeTelemetry(data, sender),
  handleTrustedTelemetry: (action: any, data: any, sender: any) => executionTelemetryHandler.handleTrustedTelemetry(action, data, sender)
}));
backgroundActionRegistry.registerHandlers(UpdateActionHandler.createUpdateActionHandlers({
  checkUpdates: (scriptId: any) => UpdateSystem.checkForUpdates(scriptId),
  queueUpdates: async (scriptId: any, updates: any, source: any) => {
    const candidates: any = Array.isArray(updates)
      ? updates
      : await UpdateSystem.checkForUpdates(scriptId || null);
    return await UpdateSystem.queueUpdates(candidates, { source });
  },
  getPendingUpdates: () => UpdateSystem.getPendingUpdates(),
  clearPendingUpdates: (scriptId: any) => UpdateSystem.clearPendingUpdates(scriptId || null),
  applyPendingUpdate: (scriptId: any, force: any) => UpdateSystem.applyPendingUpdate(scriptId, { force }),
  applySafePendingUpdates: (scriptIds: any) => UpdateSystem.applySafePendingUpdates(scriptIds || null),
  getRecentUpdates: () => UpdateSystem.getRecentUpdates(),
  clearRecentUpdates: () => UpdateSystem.clearRecentUpdates(),
  forceUpdate: (scriptId: any) => forceUpdateScript(scriptId),
  applyUpdate: (scriptId: any, code: any, sourceUrl: any) => UpdateSystem.applyUpdate(scriptId, code, { sourceUrl }),
  getVersionHistory: (scriptId: any) => getScriptVersionHistory(scriptId),
  rollbackScript: (scriptId: any, index: any) => rollbackScriptVersion(scriptId, index),
  getSubscriptions: () => SubscriptionSystem.list(),
  addSubscription: (url: any, name: any) => SubscriptionSystem.addSubscription(url, name),
  // Both arrive from a dashboard button, so they are explicit refreshes.
  refreshSubscription: (id: any) => SubscriptionSystem.refreshSubscription(id, { intent: 'manual-feed' }),
  refreshSubscriptions: () => SubscriptionSystem.refreshSubscriptions({ intent: 'manual-feed' }),
  removeSubscription: (id: any) => SubscriptionSystem.removeSubscription(id)
}));
backgroundActionRegistry.registerHandlers(SyncActionHandler.createSyncActionHandlers({
  sync: () => runCloudSyncAction(),
  test: (provider: any) => testCloudSyncProvider(provider),
  getLastResult: async () => (await chrome.storage.local.get('lastSyncResult'))?.lastSyncResult || null,
  health: async (provider: any) => {
    const settings = await getEffectiveSyncSettings(await SettingsManager.get());
    return await buildSyncProviderHealth(provider || settings.syncProvider);
  },
  preview: (provider: any) => CloudSync.preview(provider),
  connect: (provider: any) => connectCloudSyncProvider(provider),
  disconnect: (provider: any) => disconnectCloudSyncProvider(provider),
  status: (provider: any) => getCloudSyncProviderStatus(provider),
  export: (provider: any, options: any) => exportCloudSyncBackup(provider, options),
  import: (provider: any, options: any) => importCloudSyncBackup(provider, options),
  cloudStatus: (provider: any) => getCloudSyncStatus(provider),
  easyCloudConnect: () => typeof EasyCloudSync !== 'undefined'
    ? EasyCloudSync.connect()
    : Promise.resolve({ error: 'EasyCloudSync not available' }),
  easyCloudDisconnect: () => typeof EasyCloudSync !== 'undefined'
    ? EasyCloudSync.disconnect()
    : Promise.resolve({ error: 'EasyCloudSync not available' }),
  easyCloudSync: () => typeof EasyCloudSync !== 'undefined'
    ? EasyCloudSync.sync()
    : Promise.resolve({ error: 'EasyCloudSync not available' }),
  easyCloudStatus: () => typeof EasyCloudSync !== 'undefined'
    ? EasyCloudSync.getStatus()
    : Promise.resolve({ connected: false })
}));
backgroundActionRegistry.registerHandlers(BackupActionHandler.createBackupActionHandlers({
  create: (reason: any) => typeof BackupScheduler !== 'undefined'
    ? BackupScheduler.createBackup(reason)
    : Promise.resolve({ error: 'BackupScheduler not available' }),
  list: () => typeof BackupScheduler !== 'undefined'
    ? BackupScheduler.getBackups()
    : Promise.resolve({ backups: [] }),
  restore: async (backupId: any, options: any) => {
    if (typeof BackupScheduler === 'undefined') return { error: 'BackupScheduler not available' };
    const result = await BackupScheduler.restoreBackup(backupId, options);
    if (result?.success) {
      try { await registerAllScripts(true); } catch (_) {}
      try { await updateBadge(); } catch (_) {}
    }
    return result;
  },
  verify: (backupId: any) => typeof BackupScheduler !== 'undefined'
    ? BackupScheduler.verifyBackup(backupId, { parseUserscript })
    : Promise.resolve({ error: 'BackupScheduler not available' }),
  listReceipts: async () => ({
    receipts: typeof BackupScheduler !== 'undefined' ? await BackupScheduler.listReceipts() : []
  }),
  getReceipt: async (receiptId: any) => ({
    receipt: typeof BackupScheduler !== 'undefined' ? await BackupScheduler.getReceipt(receiptId) : null
  }),
  rollback: async (receiptId: any, options: any) => {
    if (typeof BackupScheduler === 'undefined') return { error: 'BackupScheduler not available' };
    const result = await BackupScheduler.rollbackRestoreReceipt(receiptId, options);
    if (result?.success) {
      try { await registerAllScripts(true); } catch (_) {}
      try { await updateBadge(); } catch (_) {}
    }
    return result;
  },
  clearReceipts: () => typeof BackupScheduler !== 'undefined'
    ? BackupScheduler.clearReceipts()
    : Promise.resolve({ success: false, error: 'BackupScheduler not available' }),
  delete: (backupId: any) => typeof BackupScheduler !== 'undefined'
    ? BackupScheduler.deleteBackup(backupId)
    : Promise.resolve({ error: 'BackupScheduler not available' }),
  import: (zipData: any) => typeof BackupScheduler !== 'undefined'
    ? BackupScheduler.importBackup(zipData)
    : Promise.resolve({ error: 'BackupScheduler not available' }),
  export: (backupId: any) => typeof BackupScheduler !== 'undefined'
    ? BackupScheduler.exportBackup(backupId)
    : Promise.resolve({ error: 'BackupScheduler not available' }),
  inspect: (backupId: any) => typeof BackupScheduler !== 'undefined'
    ? BackupScheduler.inspectBackup(backupId)
    : Promise.resolve({ error: 'BackupScheduler not available' }),
  getSettings: () => typeof BackupScheduler !== 'undefined' ? BackupScheduler.getSettings() : {},
  setSettings: async (settings: any) => {
    if (typeof BackupScheduler === 'undefined') return { error: 'BackupScheduler not available' };
    const savedSettings = await BackupScheduler.setSettings(settings);
    return { success: true, settings: savedSettings };
  }
}));
backgroundActionRegistry.registerHandlers(OrganizationActionHandler.createOrganizationActionHandlers({
  getProfiles: async () => {
    const profileData = await chrome.storage.local.get(['profiles', 'activeProfileId']);
    return { profiles: profileData.profiles || [], activeProfileId: profileData.activeProfileId || null };
  },
  switchProfile: (profileId: any) => switchScriptProfile(profileId),
  saveProfile: (profile: any) => saveScriptProfile(profile),
  deleteProfile: (profileId: any) => deleteScriptProfile(profileId),
  getCollections: async () => {
    const { scriptCollections = [] } = await chrome.storage.local.get('scriptCollections');
    return { collections: scriptCollections };
  },
  saveCollection: (collection: any) => saveScriptCollection(collection),
  deleteCollection: (collectionId: any) => deleteScriptCollection(collectionId),
  getWorkspaces: () => WorkspaceManager.getAll(),
  createWorkspace: async (name: any) => {
    const workspace = await WorkspaceManager.create(name);
    return { success: true, workspace };
  },
  saveWorkspace: async (id: any) => {
    const workspace = await WorkspaceManager.save(id);
    return workspace ? { success: true, workspace } : { error: 'Workspace not found' };
  },
  activateWorkspace: (id: any) => WorkspaceManager.activate(id),
  updateWorkspace: async (id: any, updates: any) => {
    const workspace = await WorkspaceManager.update(id, updates);
    return workspace ? { success: true, workspace } : { error: 'Workspace not found' };
  },
  deleteWorkspace: async (id: any) => {
    const workspace = await WorkspaceManager.delete(id);
    return workspace ? { success: true, workspace } : { error: 'Workspace not found' };
  },
  getFolders: async () => ({ folders: await FolderStorage.getAll() }),
  createFolder: async (name: any, color: any) => ({
    success: true,
    folder: await FolderStorage.create(name, color)
  }),
  updateFolder: async (id: any, updates: any) => ({
    success: true,
    folder: await FolderStorage.update(id, updates)
  }),
  deleteFolder: async (id: any) => {
    await FolderStorage.delete(id);
    return { success: true };
  },
  addScriptToFolder: async (folderId: any, scriptId: any) => {
    await FolderStorage.addScript(folderId, scriptId);
    return { success: true };
  },
  removeScriptFromFolder: async (folderId: any, scriptId: any) => {
    await FolderStorage.removeScript(folderId, scriptId);
    return { success: true };
  },
  moveScriptToFolder: async (scriptId: any, fromFolderId: any, toFolderId: any) => {
    await FolderStorage.moveScript(scriptId, fromFolderId, toFolderId);
    return { success: true };
  }
}));
backgroundActionRegistry.registerHandlers(SettingsActionHandler.createSettingsActionHandlers({
  getSettings: async () => ({
    settings: await getEffectiveSyncSettings(await SettingsManager.get())
  }),
  getExtensionStatus: async () => {
    let status: any = await probeUserScriptsAvailability();
    if (status.userScriptsAvailable) status = await configureUserScriptsWorld(status);
    status.fileSchemeAccess = await probeFileSchemeAccess();
    return status;
  },
  getLocalHealthReport: () => buildLocalHealthReport(),
  prepareBackgroundRunnerDryRun: async (scriptId: any) => {
    const script = await ScriptStorage.get(scriptId);
    if (!script) return { error: 'Script not found' };
    return buildBackgroundRunnerDryRun(script, await SettingsManager.get());
  },
  repairRuntimeState: async () => {
    try {
      const status = await configureUserScriptsWorld();
      await setupContextMenus();
      if (status.userScriptsAvailable) await registerAllScripts(true);
      await updateBadge();
      await setupAlarms();
      return { success: true, ...status };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Runtime repair failed' };
    }
  },
  getSetting: (key: any) => SettingsManager.get(key),
  setSettings: (settings: any) => applyGlobalSettingsUpdate(settings),
  resetSettings: () => SettingsManager.reset(),
  getScriptSettings: async (scriptId: any) => {
    const script = await ScriptStorage.get(scriptId);
    return script ? { settings: script.settings || {} } : { error: 'Script not found' };
  },
  setScriptSettings: (scriptId: any, settings: any) => updatePerScriptSettings(scriptId, settings),
  resetScriptSettings: (scriptId: any) => resetPerScriptSettings(scriptId)
}));
backgroundActionRegistry.registerHandlers(SecurityActionHandler.createSecurityActionHandlers({
  getPublicKey: async () => ({ publicKey: await ScriptSigning.getPublicKeyJwk() }),
  sign: (code: any) => ScriptSigning.signAndEmbedInCode(code),
  verify: (code: any) => ScriptSigning.verifyCodeSignature(code),
  verifyRaw: (code: any, signatureInfo: any) => ScriptSigning.verifyScript(code, signatureInfo),
  trustKey: (publicKey: any, name: any) => ScriptSigning.trustKey(publicKey, name),
  untrustKey: (publicKey: any) => ScriptSigning.untrustKey(publicKey),
  getTrustedKeys: async () => ({ keys: await ScriptSigning.getTrustedKeys() }),
  generateKeypair: () => ScriptSigning.generateAndStoreKeypair(),
  getTrustedOrigins: () => typeof PublicAPI !== 'undefined'
    ? { origins: PublicAPI.getTrustedOrigins() }
    : { origins: [] },
  setTrustedOrigins: async (origins: any) => {
    if (typeof PublicAPI === 'undefined') return { error: 'Public API controls unavailable' };
    await PublicAPI.setTrustedOrigins(origins);
    return { success: true, origins: PublicAPI.getTrustedOrigins() };
  },
  getTrustedExtensionIds: () => typeof PublicAPI !== 'undefined'
    ? { extensionIds: PublicAPI.getTrustedExtensionIds() }
    : { extensionIds: [] },
  setTrustedExtensionIds: async (extensionIds: any) => {
    if (typeof PublicAPI === 'undefined') return { error: 'Public API controls unavailable' };
    await PublicAPI.setTrustedExtensionIds(extensionIds);
    return { success: true, extensionIds: PublicAPI.getTrustedExtensionIds() };
  },
  getLocalMcpBridgeConfig: () => typeof PublicAPI !== 'undefined'
    ? { config: PublicAPI.getLocalMcpBridgeConfig() }
    : { config: { enabled: false, origins: [], hasToken: false, tokenHint: '', capabilities: [] } },
  setLocalMcpBridgeConfig: async (config: any) => {
    if (typeof PublicAPI === 'undefined') return { error: 'Public API controls unavailable' };
    return { success: true, config: await PublicAPI.setLocalMcpBridgeConfig(config) };
  },
  getPermissions: () => typeof PublicAPI !== 'undefined'
    ? { permissions: PublicAPI.getPermissions() }
    : { permissions: {} },
  getAuditLog: (limit: any) => typeof PublicAPI !== 'undefined'
    ? { entries: PublicAPI.getAuditLog(limit) }
    : { entries: [] },
  clearAuditLog: async () => {
    if (typeof PublicAPI === 'undefined') return { error: 'Public API controls unavailable' };
    await PublicAPI.clearAuditLog();
    return { success: true };
  },
  handleWebMessage: async (origin: any, message: any) => {
    if (typeof PublicAPI === 'undefined' || !origin) return { response: null };
    return {
      response: await PublicAPI.handleWebMessagePayload(
        message && typeof message === 'object' ? message : null,
        origin
      )
    };
  }
}));
backgroundActionRegistry.registerHandlers(ScriptActionHandler.createScriptActionHandlers({
  getScripts: async () => {
    const scripts = await ScriptStorage.getAll();
    return { scripts: scripts.map((script: any) => ({ ...script, metadata: script.meta })) };
  },
  getHostPermissionStatus: async (message: any, sender: any) => {
    const remembered = getRememberedRuntimeHostPermissionTarget();
    const url = message.url || message.currentUrl || sender?.tab?.url || remembered?.url || '';
    const status: any = await getRuntimeHostPermissionStatus(url);
    if (remembered && remembered.url === url) {
      status.tabId = remembered.tabId;
      status.tabTitle = remembered.title;
    }
    return status;
  },
  queueHostAccessRequest: async (message: any, sender: any) => {
    const remembered = getRememberedRuntimeHostPermissionTarget();
    return await queueRuntimeHostAccessRequest(
      message.url || message.currentUrl || sender?.tab?.url || remembered?.url || '',
      typeof message.tabId === 'number' ? message.tabId : sender?.tab?.id || remembered?.tabId,
      message.documentId
    );
  },
  getScript: async (id: any) => {
    const script = await ScriptStorage.get(id);
    return script ? { ...script, metadata: script.meta } : null;
  },
  saveScript: async (message: any) => {
    let code = message.code;
    const codeBytes = _scriptSourceByteLength(code);
    if (codeBytes > MAX_SCRIPT_SIZE) {
      return { error: `Script too large (${formatBytes(codeBytes)}). Maximum is ${formatBytes(MAX_SCRIPT_SIZE)}.` };
    }
    let parsed = parseUserscript(code);
    if (parsed.error) return { error: parsed.error };
    const receiptOptions = message.trust && typeof message.trust === 'object' ? message.trust : null;
    const saveSettings = await SettingsManager.get();
    let bundleResult;
    try {
      bundleResult = await ESMUserscriptBundler.bundleIfNeeded(code, parsed.meta, saveSettings, {
        sourceUrl: receiptOptions?.sourceUrl || parsed.meta.downloadURL || parsed.meta.updateURL || ''
      });
    } catch (error: any) {
      return { error: error?.message || String(error) };
    }
    if (bundleResult.bundled) {
      code = bundleResult.code;
      const bundledBytes = _scriptSourceByteLength(code);
      if (bundledBytes > MAX_SCRIPT_SIZE) {
        return { error: `Script too large (${formatBytes(bundledBytes)}). Maximum is ${formatBytes(MAX_SCRIPT_SIZE)}.` };
      }
      parsed = parseUserscript(code);
      if (parsed.error) return { error: parsed.error };
      parsed.meta.esmBundle = {
        entryUrl: bundleResult.entryUrl,
        imports: bundleResult.imports,
        bundledAt: Date.now(),
        sourceMap: bundleResult.sourceMap
      };
    }

    const id = message.id || message.scriptId || generateId();
    const publicApiOptions = message.publicApi && typeof message.publicApi === 'object'
      ? message.publicApi
      : null;
    return await _runExclusiveScriptOperation(id, async () => {
      const existing = await ScriptStorage.get(id);
      if (publicApiOptions?.requireExisting && !existing) {
        return { error: 'Script not found', scriptId: id };
      }

      if (!Array.isArray(parsed.meta.match) || parsed.meta.match.length === 0) {
        const requestedFallbacks = publicApiOptions?.preserveExistingMatches
          ? existing?.meta?.match
          : publicApiOptions?.fallbackMatches;
        const fallbackMatches = Array.isArray(requestedFallbacks)
          ? requestedFallbacks
              .filter((match: any) => typeof match === 'string' && match.trim())
              .map((match: string) => match.trim())
              .slice(0, 100)
          : [];
        if (fallbackMatches.length > 0) parsed.meta.match = fallbackMatches;
      }

      const scriptSettings = { ...(existing?.settings || {}) };
      delete scriptSettings.mergeConflict;
      if (message.markModified) scriptSettings.userModified = true;
      if (message.settings && typeof message.settings === 'object' && 'allowBroadHostAccess' in message.settings) {
        scriptSettings.allowBroadHostAccess = message.settings.allowBroadHostAccess === true;
      }
      if (!existing && publicApiOptions?.review === 'quarantine') {
        const source = typeof publicApiOptions.source === 'string' && publicApiOptions.source.trim()
          ? publicApiOptions.source.trim().slice(0, 80)
          : 'public-api';
        const sourceLabel = typeof publicApiOptions.sourceLabel === 'string'
          ? publicApiOptions.sourceLabel.trim().replace(/\s+/g, ' ').slice(0, 80)
          : '';
        scriptSettings._importQuarantine = {
          source,
          sourceLabel,
          importedAt: Date.now(),
          archiveEnabled: true,
        };
      }
      const shouldRecordReceipt = !!receiptOptions?.recordReceipt
        || !!receiptOptions?.operation
        || !!receiptOptions?.sourceUrl
        || !!receiptOptions?.sourceKind
        || !!receiptOptions?.sourceLabel
        || receiptOptions?.suppressMetadataSourceFallback === true;
      let previousScript = existing && existing.code !== code
        ? {
            ...existing,
            meta: { ...existing.meta },
            code: existing.code,
            updatedAt: existing.updatedAt || Date.now()
          }
        : null;
      const versionHistory = Array.isArray(existing?.versionHistory) ? [...existing.versionHistory] : [];
      let historyEntry: any = null;
      let rollbackIndex = -1;
      const now = Date.now();
      _sweepExpiredLocalSaveCoalescing(now);
      const coalesceStorageKey = _localSaveCoalesceKey(id, receiptOptions?.coalesceKey);
      const coalesceWindowMs = _localSaveCoalesceWindowMs(receiptOptions?.coalesceWindowMs);
      const canCoalesceLocalSave = !!previousScript
        && !!coalesceStorageKey
        && coalesceWindowMs > 0
        && receiptOptions?.operation === 'local-save'
        && receiptOptions?.sourceKind === 'local-editor';
      if (shouldRecordReceipt && !canCoalesceLocalSave) _clearLocalSaveCoalescingForScript(id);
      let coalescedHistoryEntry = null;
      if (shouldRecordReceipt && canCoalesceLocalSave) {
        const coalesceState = _localSaveReceiptCoalescing.get(coalesceStorageKey);
        const candidate = coalesceState?.scriptId === id && coalesceState.expiresAt >= now
          ? versionHistory[coalesceState.rollbackIndex]
          : null;
        if (candidate && typeof candidate.code === 'string') {
          const parsedPrevious = parseUserscript(candidate.code);
          coalescedHistoryEntry = candidate;
          rollbackIndex = coalesceState.rollbackIndex;
          previousScript = {
            ...existing,
            code: candidate.code,
            meta: parsedPrevious?.error ? { ...existing.meta } : { ...parsedPrevious.meta },
            updatedAt: candidate.updatedAt || existing.updatedAt || now,
            trustReceipt: candidate.trustReceipt || existing.trustReceipt
          };
          coalesceState.expiresAt = now + coalesceWindowMs;
          coalesceState.updatedAt = now;
        } else {
          _localSaveReceiptCoalescing.delete(coalesceStorageKey);
        }
      }
      if (shouldRecordReceipt && previousScript && !coalescedHistoryEntry) {
        historyEntry = {
          version: existing.meta.version,
          code: existing.code,
          updatedAt: existing.updatedAt || Date.now()
        };
        versionHistory.push(historyEntry);
        if (versionHistory.length > 5) versionHistory.splice(0, versionHistory.length - 5);
        rollbackIndex = versionHistory.indexOf(historyEntry);
        if (canCoalesceLocalSave && rollbackIndex >= 0) {
          _localSaveReceiptCoalescing.set(coalesceStorageKey, {
            scriptId: id,
            rollbackIndex,
            expiresAt: now + coalesceWindowMs,
            updatedAt: now
          });
        }
      }
      const trustReceipt = shouldRecordReceipt
        ? await createScriptTrustReceipt({
            operation: receiptOptions?.operation || (existing ? 'update' : 'install'),
            code,
            meta: parsed.meta,
            sourceUrl: receiptOptions?.sourceUrl || '',
            sourceKind: receiptOptions?.sourceKind || '',
            sourceLabel: receiptOptions?.sourceLabel || '',
            suppressMetadataSourceFallback: receiptOptions?.suppressMetadataSourceFallback === true,
            previousScript,
            rollbackIndex,
            fetchDependencyBody: fetchRequireScriptForTrustReceipt,
            fetchProvenanceBundle,
            optionalPermissions: receiptOptions?.optionalPermissions || null,
            optionalHostPermissions: receiptOptions?.optionalHostPermissions || null
          })
        : existing?.trustReceipt;
      const tofuSriFailure = shouldRecordReceipt ? _getRequireTofuSriFailure(trustReceipt) : null;
      if (tofuSriFailure) return { error: tofuSriFailure.message };
      const provenanceFailure = shouldRecordReceipt ? _getRequireProvenanceFailure(trustReceipt) : null;
      if (provenanceFailure) return { error: provenanceFailure.message };
      if (historyEntry && previousScript && !coalescedHistoryEntry) {
        historyEntry.trustReceipt = previousScript.trustReceipt || await createScriptTrustReceipt({
          operation: 'rollback-point',
          code: previousScript.code,
          meta: previousScript.meta,
          sourceUrl: previousScript.trustReceipt?.source?.installUrl || previousScript.meta.downloadURL || previousScript.meta.updateURL
        });
      }

      const script = {
        ...existing,
        id,
        code,
        meta: parsed.meta,
        enabled: message.enabled !== undefined ? message.enabled : (existing?.enabled ?? true),
        settings: scriptSettings,
        position: existing?.position ?? (await ScriptStorage.getAll()).length,
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now(),
        trustReceipt
      };
      if (versionHistory.length > 0) script.versionHistory = versionHistory;

      await ensurePersistentStorageForScriptWrite(existing ? 'script-save' : 'script-create', script.code);
      await ScriptStorage.set(id, script);
      await updateBadge();
      notifyEasyCloudScriptSaved(id);
      await reregisterScript(script);

      try {
        const liveReloadData = await chrome.storage.local.get('liveReloadScripts');
        if (liveReloadData.liveReloadScripts?.[id]) {
          const allTabs = await chrome.tabs.query({});
          for (const tab of allTabs) {
            if (tab.url && doesScriptMatchUrl(script, tab.url)) {
              try { chrome.tabs.reload(tab.id).catch(() => {}); } catch {}
            }
          }
        } else {
          await autoReloadMatchingTabs(script);
        }
      } catch {
        await autoReloadMatchingTabs(script);
      }

      const settings = await SettingsManager.get();
      if (!existing && settings.notifyOnInstall) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'images/icon128.png',
          title: 'Script Installed',
          message: `${script.meta.name} v${script.meta.version}`
        });
      }
      return { success: true, scriptId: id, created: !existing, script: { ...script, metadata: script.meta } };
    });
  },
  createScript: async (code: any) => {
    const codeBytes = _scriptSourceByteLength(code);
    if (codeBytes > MAX_SCRIPT_SIZE) {
      return { error: `Script too large (${formatBytes(codeBytes)}). Maximum is ${formatBytes(MAX_SCRIPT_SIZE)}.` };
    }
    const parsed = parseUserscript(code);
    if (parsed.error) return { error: parsed.error };

    const id = generateId();
    const script: any = {
      id,
      code,
      meta: parsed.meta,
      enabled: true,
      position: (await ScriptStorage.getAll()).length,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await ensurePersistentStorageForScriptWrite('script-create', script.code);
    await ScriptStorage.set(id, script);
    await updateBadge();
    notifyEasyCloudScriptSaved(id);
    await registerScript(script);

    const settings = await SettingsManager.get();
    if (settings.notifyOnInstall) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'images/icon128.png',
        title: 'Script Created',
        message: `${script.meta.name} v${script.meta.version}`
      });
    }
    return { success: true, scriptId: id, script: { ...script, metadata: script.meta } };
  },
  deleteScript: async (scriptId: any) => {
    if (!scriptId) return { error: 'No script ID provided' };
    return await _runExclusiveScriptOperation(scriptId, async () => {
      const script = await ScriptStorage.get(scriptId);
      if (!script) return { error: 'Script not found' };
      const settings = await SettingsManager.get();
      const trashMode = settings.trashMode || '30';
      let trashEvicted: any[] = [];
      let trashEvictedCount = 0;
      if (trashMode !== 'disabled') {
        await _runExclusiveTrashMutation(async () => {
          const trashData = await chrome.storage.local.get('trash');
          const trash = Array.isArray(trashData.trash) ? trashData.trash.slice() : [];
          trash.push({ ...script, trashedAt: Date.now() });
          const budgeted = _enforceTrashBudget(trash);
          trashEvicted = budgeted.evicted;
          trashEvictedCount = budgeted.evictedCount;
          await chrome.storage.local.set({ trash: budgeted.trash });
        });
      }

      await unregisterScript(scriptId);
      await ScriptStorage.delete(scriptId);
      try {
        const commandData = await chrome.storage.session.get('menuCommands');
        if (commandData?.menuCommands?.[scriptId]) {
          delete commandData.menuCommands[scriptId];
          await chrome.storage.session.set(commandData);
        }
      } catch {}

      const tombstoneData = await chrome.storage.local.get('syncTombstones');
      const tombstones = tombstoneData.syncTombstones || {};
      tombstones[scriptId] = Date.now();
      await chrome.storage.local.set({ syncTombstones: tombstones });
      await updateBadge();
      notifyEasyCloudScriptDeleted(scriptId);
      return {
        success: true,
        scriptId,
        scriptName: script.meta?.name || scriptId,
        trashEvicted,
        trashEvictedCount
      };
    });
  },
  getTrash: async () => {
    const settings = await SettingsManager.get();
    const trashMode = settings.trashMode || '30';
    const maxAge = trashMode === '1'
      ? 86400000
      : trashMode === '7'
        ? 604800000
        : trashMode === '30'
          ? 2592000000
          : 0;
    const valid = await _runExclusiveTrashMutation(async () => {
      const trashData = await chrome.storage.local.get('trash');
      const trash = Array.isArray(trashData.trash) ? trashData.trash.slice() : [];
      const now = Date.now();
      const next = maxAge > 0 ? trash.filter((script: any) => now - script.trashedAt < maxAge) : trash;
      const budgeted = _enforceTrashBudget(next);
      const notices = await _consumeTrashEvictionNotices();
      const pendingEvicted = notices.flatMap((notice: any) => Array.isArray(notice.entries) ? notice.entries : []);
      const pendingEvictedCount = notices.reduce((total: number, notice: any) => {
        const count = Number(notice.count);
        return total + (Number.isFinite(count) && count > 0 ? count : 0);
      }, 0);
      if (next.length !== trash.length || budgeted.evictedCount > 0) {
        await chrome.storage.local.set({ trash: budgeted.trash });
      }
      return {
        trash: budgeted.trash,
        evicted: [...budgeted.evicted, ...pendingEvicted].slice(0, MAX_TRASH_EVICTION_SUMMARIES),
        evictedCount: budgeted.evictedCount + pendingEvictedCount
      };
    });
    return valid;
  },
  restoreFromTrash: async (scriptId: any, replaceExisting = false) => {
    if (!scriptId) return { error: 'Missing script ID' };
    return await _runExclusiveScriptOperation(scriptId, async () => {
      return await _runExclusiveTrashMutation(async () => {
        const trashData = await chrome.storage.local.get('trash');
        const trash = Array.isArray(trashData.trash) ? trashData.trash.slice() : [];
        const index = trash.findIndex((script: any) => script.id === scriptId);
        if (index === -1) return { error: 'Not found in trash' };

        const script = { ...trash[index] };
        if (!script.code || typeof script.code !== 'string') {
          return { error: 'Corrupt trash entry: missing code' };
        }
        const parsed = parseUserscript(script.code);
        if (parsed.error) return { error: 'Corrupt trash entry: ' + parsed.error };
        script.meta = parsed.meta;
        delete script.trashedAt;
        const restoreResult = await ScriptStorage.restore(script, replaceExisting === true);
        if (restoreResult.collision) {
          return {
            error: 'An active script already uses this ID.',
            code: 'RESTORE_COLLISION',
            current: _restoreConflictSnapshot(restoreResult.existing),
            trashed: _restoreConflictSnapshot(script)
          };
        }
        const tombstoneData = await chrome.storage.local.get('syncTombstones');
        const tombstones = tombstoneData.syncTombstones || {};
        if (tombstones[scriptId]) {
          delete tombstones[scriptId];
          await chrome.storage.local.set({ syncTombstones: tombstones });
        }
        trash.splice(index, 1);
        await chrome.storage.local.set({ trash });
        if (script.enabled !== false) await registerScript(script);
        await updateBadge();
        notifyEasyCloudScriptSaved(script.id);
        return { success: true };
      });
    });
  },
  emptyTrash: async () => {
    await _runExclusiveTrashMutation(async () => {
      await chrome.storage.local.set({ trash: [] });
    });
    return { success: true };
  },
  rescheduleScript: async (scriptId: any) => {
    if (!scriptId) return { error: 'Missing scriptId' };
    const script = await ScriptStorage.get(scriptId);
    const schedule = await getScheduleForScript(scriptId);
    await chrome.alarms.clear(SCHEDULE_ALARM_PREFIX + scriptId).catch(() => {});
    if (schedule && schedule.type === 'interval') {
      const periodMinutes = schedule.intervalUnit === 'hours'
        ? (schedule.interval || 1) * 60
        : (schedule.interval || 1);
      await chrome.alarms.create(SCHEDULE_ALARM_PREFIX + scriptId, {
        delayInMinutes: periodMinutes,
        periodInMinutes: periodMinutes
      }).catch(() => {});
    } else if (schedule && schedule.type === 'oneTime' && schedule.oneTime) {
      const when = new Date(schedule.oneTime).getTime();
      if (when > Date.now()) {
        await chrome.alarms.create(SCHEDULE_ALARM_PREFIX + scriptId, { when }).catch(() => {});
      }
    }
    if (script && script.enabled !== false) await reregisterScript(script);
    return { success: true };
  },
  restart: () => {
    chrome.runtime.reload();
    return { success: true };
  },
  permanentlyDelete: async (scriptId: any) => {
    await _runExclusiveTrashMutation(async () => {
      const trashData = await chrome.storage.local.get('trash');
      const trash = Array.isArray(trashData.trash) ? trashData.trash.slice() : [];
      await chrome.storage.local.set({ trash: trash.filter((script: any) => script.id !== scriptId) });
    });
    return { success: true };
  },
  toggleScript: async (message: any) => {
    const scriptId = message.id || message.scriptId;
    return await _runExclusiveScriptOperation(scriptId, async () => {
      const script = await ScriptStorage.get(scriptId);
      if (!script) return { error: 'Script not found' };

      script.enabled = message.enabled !== undefined ? !!message.enabled : !script.enabled;
      if (script.enabled && script.settings?._importQuarantine) {
        script.settings = recordImportedScriptTrustReview(script.settings);
      }
      script.updatedAt = Date.now();
      await ScriptStorage.set(scriptId, script);
      await reregisterScript(script);
      await updateBadge();
      notifyEasyCloudScriptSaved(scriptId);

      try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (tab.url && doesScriptMatchUrl(script, tab.url)) {
            chrome.tabs.reload(tab.id).catch(() => {});
          }
        }
      } catch (error: any) {
        debugLog('Toggle reload failed:', error.message);
      }
      return { success: true, script: { id: script.id, enabled: script.enabled } };
    }).catch(error => {
      debugLog('Toggle error:', error);
      return { error: error?.message || 'Failed to update script' };
    });
  },
  duplicateScript: async (id: any) => {
    const newScript = await ScriptStorage.duplicate(id);
    if (!newScript) return { error: 'Script not found' };
    if (newScript.enabled !== false) await registerScript(newScript);
    await updateBadge();
    notifyEasyCloudScriptSaved(newScript.id);
    return { success: true, script: { ...newScript, metadata: newScript.meta } };
  },
  searchScripts: async (query: any) => {
    const scripts = await ScriptStorage.search(query);
    return { scripts: scripts.map((script: any) => ({ ...script, metadata: script.meta })) };
  },
  reorderScripts: async (orderedIds: any) => {
    await ScriptStorage.reorder(orderedIds);
    return { success: true };
  }
}));

// Public API and Local MCP writes must use the same serialized mutation
// handlers as dashboard/background callers. Keep this surface deliberately
// narrow: callers can request only the existing save/toggle actions, while the
// core handler retains ownership of locking, receipt creation, quarantine, and
// runtime registration.
const publicScriptMutationService = Object.freeze({
  saveScript: async (message: any) => {
    const routed = await backgroundActionRegistry.dispatch(
      { ...(message || {}), action: 'saveScript' },
      { id: 'scriptvault-public-api' },
    );
    return routed.handled ? routed.response : { error: 'Core save handler unavailable' };
  },
  toggleScript: async (message: any) => {
    const routed = await backgroundActionRegistry.dispatch(
      { ...(message || {}), action: 'toggleScript' },
      { id: 'scriptvault-public-api' },
    );
    return routed.handled ? routed.response : { error: 'Core toggle handler unavailable' };
  },
});
Object.defineProperty(globalThis, '__svScriptMutationService', {
  configurable: false,
  enumerable: false,
  writable: false,
  value: publicScriptMutationService,
});

backgroundActionRegistry.registerHandlers(DataActionHandler.createDataActionHandlers({
  prefetchResources: async (resources: any) => {
    await ResourceCache.prefetchResources(resources);
    return { success: true };
  },
  getAllScriptsValues: async () => {
    const scripts = await ScriptStorage.getAll();
    const valueResults = await Promise.all(scripts.map((script: any) => ScriptValues.getAll(script.id)));
    const allValues: any = {};
    scripts.forEach((script: any, index: any) => {
      const values = valueResults[index];
      if (values && Object.keys(values).length > 0) {
        allValues[script.id] = {
          scriptName: script.meta?.name || 'Unknown Script',
          values
        };
      }
    });
    return { allValues };
  },
  setScriptValue: async (scriptId: any, key: any, value: any) => {
    await ScriptValues.set(scriptId, key, value);
    return { success: true };
  },
  clearScriptStorage: async (scriptId: any) => {
    await ScriptValues.deleteAll(scriptId);
    return { success: true };
  },
  renameScriptValue: async (scriptId: any, oldKey: any, newKey: any) => {
    if (!scriptId || !oldKey || !newKey || oldKey === newKey) {
      return { error: 'Invalid rename parameters' };
    }
    const current = await ScriptValues.get(scriptId, oldKey);
    if (current === undefined) return { error: 'Key not found' };
    const existingNew = await ScriptValues.get(scriptId, newKey);
    if (existingNew !== undefined) return { error: `Key "${newKey}" already exists` };
    await ScriptValues.set(scriptId, newKey, current);
    await ScriptValues.delete(scriptId, oldKey);
    return { success: true };
  },
  exportAll: (options: any) => exportAllScripts(options),
  getStorageUsage: () => typeof QuotaManager !== 'undefined'
    ? QuotaManager.getUsage()
    : Promise.resolve({ bytesUsed: 0, quota: 10485760, percentage: 0, level: 'ok' }),
  getStorageBreakdown: () => typeof QuotaManager !== 'undefined'
    ? QuotaManager.getBreakdown()
    : Promise.resolve({}),
  cleanupStorage: (options: any) => typeof QuotaManager !== 'undefined'
    ? QuotaManager.cleanup(options)
    : Promise.resolve({ freedBytes: 0, actions: [] }),
  getGistSettings: async () => {
    const gistData = await chrome.storage.local.get('gistSettings');
    return gistData.gistSettings || {};
  },
  saveGistSettings: async (settings: any) => {
    await chrome.storage.local.set({ gistSettings: settings });
    return { success: true };
  },
  exportZip: (options: any) => exportToZip(options)
}));
function formatUserScriptExecuteDiagnostic(error: any): string {
  const diagnostics = Array.isArray(error?.diagnostics)
    ? error.diagnostics
    : (Array.isArray(error?.details?.diagnostics) ? error.details.diagnostics : []);
  const diagnostic: any = diagnostics[0] || error?.diagnostic || error;
  const hasLocation = diagnostics.length > 0 ||
    Number.isFinite(Number(diagnostic?.line ?? diagnostic?.lineNumber ?? error?.lineNumber)) ||
    Number.isFinite(Number(diagnostic?.column ?? diagnostic?.columnNumber ?? error?.columnNumber));
  if (!hasLocation) return '';
  const message = String(diagnostic?.message || error?.message || 'Script syntax error').trim();
  const line = Number(diagnostic?.line ?? diagnostic?.lineNumber ?? error?.lineNumber);
  const column = Number(diagnostic?.column ?? diagnostic?.columnNumber ?? error?.columnNumber);
  const location = Number.isFinite(line) && line > 0
    ? ` (line ${line}${Number.isFinite(column) && column > 0 ? `, column ${column}` : ''})`
    : '';
  return `${message}${location}`;
}

backgroundActionRegistry.registerHandlers(RuntimeActionHandler.createRuntimeActionHandlers({
  installFromUrl: (url: any) => installFromUrl(url),
  installFromCode: (code: any, sourceUrl: any, operation: any) => installFromCode(code, { sourceUrl, operation }),
  prepareSubscriptionInstall: (code: any, sourceUrl: any) => SubscriptionSystem.prepareBundle(code, sourceUrl),
  applySubscriptionInstall: (code: any, sourceUrl: any) => SubscriptionSystem.installBundle(code, sourceUrl),
  fetchScriptPreview: (url: any) => fetchScriptPreview(url),
  probeInstallDependency: (url: any) => probeInstallDependency(url),
  verifyRequireProvenancePreview: (message: any) => previewRequireProvenance(message),
  fetchResource: (url: any) => ResourceCache.fetchResource(url),
  getScriptsForUrl: async (url: any) => {
    const settings = await SettingsManager.get();
    if (isUrlBlockedByGlobalSettings(url, settings)) return [];
    const matchSet = await getMatchSet();
    const filtered = matchSet.getMatching(url)
      .sort((first: any, second: any) => (first.position || 0) - (second.position || 0));
    return filtered.map(({ code, ...rest }: any) => ({ ...rest, metadata: rest.meta }));
  },
  diagnoseScripts: async (url: any, tabId: any) => {
    const settings = await SettingsManager.get();
    const userScriptsAvailable = !!chrome.userScripts;
    const globallyEnabled = settings.enabled !== false;
    const globalBlock = url ? getUrlBlockReason(url, settings) : null;
    const urlBlocked = globalBlock !== null;

    let registeredIds = new Set();
    try {
      if (chrome.userScripts && typeof chrome.userScripts.getScripts === 'function') {
        const registrations = await chrome.userScripts.getScripts();
        registeredIds = new Set((registrations || []).map(registration => registration.id));
      }
    } catch (_) {}

    const allScripts = await ScriptStorage.getAll();
    const scripts = allScripts.map((script: any) => {
      const enabled = script.enabled !== false;
      const matchInfo = url ? explainScriptUrlMatch(script, url) : { matched: false, state: 'not-matched' };
      const matches = matchInfo.matched;
      const registered = registeredIds.has(script.id);
      const registrationError = script.settings?._registrationError || null;
      const effectiveRunAt = script.settings?.runAt && script.settings.runAt !== 'default'
        ? script.settings.runAt
        : script.meta?.['run-at'];
      const isContextMenu = effectiveRunAt === 'context-menu';
      const isCrontab = !!script.meta?.crontab;
      const isBackground = !!script.meta?.background;
      const quarantined = !!script.settings?._importQuarantine;
      const framePolicy = diagnosticFramePolicy(script);

      let status;
      let reasonCode;
      const reasonParams: any = {};
      if (quarantined) {
        status = 'quarantined'; reasonCode = 'quarantined';
      } else if (!enabled) {
        status = matches ? 'matched-disabled' : 'disabled'; reasonCode = 'disabled';
      } else if (isContextMenu) {
        status = 'on-demand'; reasonCode = 'context-menu';
      } else if (isCrontab) {
        status = 'scheduled'; reasonCode = 'scheduled';
      } else if (isBackground) {
        status = 'background'; reasonCode = 'background';
      } else if (!matches) {
        status = matchInfo.state === 'excluded' ? 'excluded' : 'no-match';
        reasonCode = matchInfo.state === 'excluded' ? 'excluded' : 'no-match';
        if (matchInfo.directive) reasonParams.directive = matchInfo.directive;
        if (matchInfo.pattern) reasonParams.pattern = matchInfo.pattern;
      } else if (urlBlocked) {
        status = 'blocked'; reasonCode = globalBlock?.code || 'global-blacklist';
        if (globalBlock?.host) reasonParams.host = globalBlock.host;
        if (globalBlock?.pattern) reasonParams.pattern = globalBlock.pattern;
      } else if (!userScriptsAvailable) {
        status = 'blocked'; reasonCode = 'user-scripts-unavailable';
      } else if (!globallyEnabled) {
        status = 'paused'; reasonCode = 'paused';
      } else if (registrationError) {
        status = 'error'; reasonCode = 'registration-error'; reasonParams.error = String(registrationError);
      } else if (!registered) {
        status = 'not-registered'; reasonCode = 'not-registered';
      } else {
        status = 'running'; reasonCode = 'running';
      }
      if (matchInfo.directive) reasonParams.matchDirective = matchInfo.directive;
      if (matchInfo.pattern) reasonParams.matchPattern = matchInfo.pattern;
      return {
        id: script.id,
        name: script.meta?.name || script.id,
        status,
        reasonCode,
        reasonParams,
        reason: diagnosticReasonText(reasonCode, reasonParams),
        matches,
        matchState: matchInfo.state,
        matchDirective: matchInfo.directive || null,
        matchPattern: matchInfo.pattern || null,
        framePolicy,
        enabled,
        registered
      };
    }).sort((first: any, second: any) => first.name.localeCompare(second.name));

    const executionDiagnostics = getExecutionDiagnosticsSnapshot(Number(tabId));
    return { url, userScriptsAvailable, globallyEnabled, urlBlocked, executionDiagnostics, scripts };
  },
  updateBadgeForTab: async (tabId: any, url: any) => {
    if (tabId && url) await updateBadgeForTab(tabId, url);
    return { success: true };
  },

  runScriptNow: async (message: any) => {
    const scriptId = message.scriptId || message.id;
    if (!scriptId) return { success: false, error: 'Missing scriptId' };
    try {
      const script = await ScriptStorage.get(scriptId);
      if (!script) return { success: false, error: 'Script not found' };
      if (script.settings?._importQuarantine) {
        return { success: false, error: 'Review and enable this quarantined import before running it' };
      }

      let targetTabId = message.tabId;
      if (typeof targetTabId !== 'number') {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        targetTabId = activeTab?.id;
      }
      if (typeof targetTabId !== 'number') return { success: false, error: 'No target tab' };

      const requireList = Array.isArray(script.meta?.require)
        ? script.meta.require
        : (script.meta?.require ? [script.meta.require] : []);
      const requireScripts: any = [];
      for (const url of requireList) {
        try {
          const code = await fetchRequireScript(url);
          if (code) requireScripts.push({ url, code });
        } catch (_) {}
      }

      let storedValues = {};
      try { storedValues = await ScriptValues.getAll(script.id) || {}; } catch (_) {}
      const scriptAuthToken = await UserScriptMessagePolicy.getScriptAuthToken(script.id);
      const wrappedCode = buildWrappedScript(
        script,
        requireScripts,
        storedValues,
        [],
        [],
        '',
        scriptAuthToken
      );
      const wantsDocumentStart = script?.meta?.['run-at'] === 'document-start';

      let userScriptsDiagnostic = '';
      if (typeof chrome.userScripts?.execute === 'function') {
        // Per-script world — see ensureExecutionWorldId. Without it this shared
        // the default USER_SCRIPT world with every other on-demand injection.
        const execWorldId = await ensureExecutionWorldId(script?.id);
        try {
          await chrome.userScripts.execute({
            target: { tabId: targetTabId },
            js: [{ code: wrappedCode }],
            world: 'USER_SCRIPT',
            ...(execWorldId ? { worldId: execWorldId } : {}),
            ...(wantsDocumentStart ? { injectImmediately: true } : {})
          });
          return { success: true, mode: 'userScripts.execute' };
        } catch (error: any) {
          userScriptsDiagnostic = formatUserScriptExecuteDiagnostic(error);
          debugLog('userScripts.execute failed, falling back:', error?.message);
        }
      }

      const injectInto = script.meta?.['inject-into'] || 'auto';
      const sandbox = script.meta?.sandbox || '';
      const wantsPageContext = injectInto === 'page' || sandbox === 'raw';
      if (!wantsPageContext) {
        return {
          success: false,
          error: userScriptsDiagnostic || 'chrome.userScripts.execute is unavailable and this script does not declare @inject-into page — MAIN-world fallback is not allowed to avoid silently downgrading USER_SCRIPT isolation. Update Chrome to 135+ or set @inject-into page if page context is intended.'
        };
      }
      try {
        await chrome.scripting.executeScript({
          target: { tabId: targetTabId },
          world: 'MAIN',
          func: ((code: any) => {
            try { (0, eval)(code); } catch (error) { console.error('[ScriptVault Run Now]', error); }
          }) as any,
          args: [wrappedCode],
          ...(wantsDocumentStart ? { injectImmediately: true } : {})
        });
        return { success: true, mode: 'scripting.executeScript' };
      } catch (error: any) {
        const fallbackError = error?.message || 'Run failed';
        return { success: false, error: userScriptsDiagnostic ? `${userScriptsDiagnostic}; ${fallbackError}` : fallbackError };
      }
    } catch (error: any) {
      console.error('[ScriptVault] runScriptNow error:', error);
      return { success: false, error: error?.message || 'Run failed' };
    }
  },
  rescheduleChains: async () => {
    await setupChainAlarms();
    await notifyChainDomTriggersChanged();
    return { success: true };
  },
  runChainNow: (chainId: any, reason: any, tabId: any) => executeChainById(chainId, { reason, tabId }),
  getChainDomEventTriggers: async () => ({
    success: true,
    eventTypes: await getChainDomEventTypes()
  }),
  chainDomEvent: async (eventType: any, url: any, sender: any) => {
    if (!eventType) return { success: false, error: 'Missing eventType', triggered: 0 };
    // Ignore the caller-supplied url entirely and use the browser-supplied
    // frame URL. chainDomEvent is reachable from any userscript with no script
    // identity, and this value is the sole input to the chain's pattern filter.
    // Chain steps then run through runScriptNow with a synthetic extension
    // sender, which does not re-check that the script matches the tab — so a
    // script matching evil.example could pass url:'https://bank.example/' and
    // force a bank-scoped chain to execute in its own tab.
    const effectiveUrl = sender?.url || sender?.tab?.url || '';
    if (!effectiveUrl) return { success: false, error: 'Missing tab context', triggered: 0 };
    const tabId = typeof sender?.tab?.id === 'number' ? sender.tab.id : undefined;
    const triggered = await triggerChainsForDomEvent(eventType, effectiveUrl, tabId);
    return { success: true, triggered };
  },
  previewUserStyle: (code: any, tabId: any, values: any, colorScheme: any) => typeof UserStylesEngine !== 'undefined'
    ? UserStylesEngine.previewDraft(String(code || ''), { tabId, values, colorScheme })
    : Promise.resolve({ success: false, error: 'UserCSS tools unavailable' }),
  clearUserStylePreview: (tabId: any) => typeof UserStylesEngine !== 'undefined'
    ? UserStylesEngine.clearDraftPreview({ tabId })
    : Promise.resolve({ success: true, cleared: 0 }),
  getUserStyles: async () => {
    if (typeof UserStylesEngine === 'undefined') return { success: false, styles: [], error: 'UserCSS tools unavailable' };
    await UserStylesEngine.init();
    const styles = UserStylesEngine.getStyles();
    const list = Object.values(styles).map((s: any) => {
      const vars = UserStylesEngine.getVariables(s.id) || [];
      const values: Record<string, any> = {};
      for (const v of vars) values[v.name] = v.current;
      return {
        id: s.id,
        name: s.meta?.name || s.id,
        enabled: s.enabled !== false,
        match: Array.isArray(s.match) ? s.match : [],
        description: s.meta?.description || '',
        namespace: s.meta?.namespace || '',
        version: s.meta?.version || '',
        homepage: s.meta?.homepageURL || s.meta?.homepage || '',
        rawCode: s.rawCode || '',
        css: s.css || '',
        variables: vars,
        values,
        installDate: s.installDate,
        updateDate: s.updateDate,
      };
    });
    return { success: true, styles: list };
  },
  installUserStyle: async (code: any, enabled: any) => {
    if (typeof UserStylesEngine === 'undefined') return { success: false, error: 'UserCSS tools unavailable' };
    const parsed: any = UserStylesEngine.parseUserCSS(String(code || ''));
    if (parsed.error) return { success: false, error: parsed.error };
    try {
      const id = await UserStylesEngine.registerStyle({
        meta: parsed.meta,
        variables: parsed.variables,
        css: parsed.css,
        rawCode: String(code || ''),
        match: parsed.match,
        enabled: enabled !== false,
      });
      const response: any = { success: true, id, name: parsed.meta?.name || id };
      if (parsed.warning) response.warning = parsed.warning;
      return response;
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  },
  toggleUserStyle: async (id: any, enabled: any) => {
    if (typeof UserStylesEngine === 'undefined') return { success: false, error: 'UserCSS tools unavailable' };
    try { await UserStylesEngine.toggleStyle(String(id), enabled !== false); return { success: true, id: String(id) }; }
    catch (e: any) { return { success: false, error: e?.message || String(e) }; }
  },
  deleteUserStyle: async (id: any) => {
    if (typeof UserStylesEngine === 'undefined') return { success: false, error: 'UserCSS tools unavailable' };
    try { await UserStylesEngine.unregisterStyle(String(id)); return { success: true, id: String(id) }; }
    catch (e: any) { return { success: false, error: e?.message || String(e) }; }
  },
  updateUserStyleCode: async (id: any, code: any) => {
    if (typeof UserStylesEngine === 'undefined') return { success: false, error: 'UserCSS tools unavailable' };
    try { await UserStylesEngine.updateCSS(String(id), String(code || '')); return { success: true, id: String(id) }; }
    catch (e: any) { return { success: false, error: e?.message || String(e) }; }
  },
  setUserStyleVariables: async (id: any, values: any) => {
    if (typeof UserStylesEngine === 'undefined') return { success: false, error: 'UserCSS tools unavailable' };
    try { await UserStylesEngine.setVariables(String(id), values || {}); return { success: true, id: String(id) }; }
    catch (e: any) { return { success: false, error: e?.message || String(e) }; }
  },
  getExtensionInfo: () => ({
    name: 'ScriptVault',
    version: chrome.runtime.getManifest().version,
    scriptHandler: 'ScriptVault',
    scriptMetaStr: null
  }),
  openDashboard: async (message: any) => {
    const dashboardUrl = chrome.runtime.getURL('pages/dashboard.html');
    const scriptParam = message.scriptId ? `#script_${encodeURIComponent(message.scriptId)}` : '';
    const newParam = message.newScript ? '#new_script' : '';
    const tabParam = message.tab ? `#tab=${encodeURIComponent(message.tab)}` : '';
    await chrome.tabs.create({ url: dashboardUrl + (scriptParam || newParam || tabParam) });
    return { success: true };
  },
  factoryReset: async () => {
    const allScripts = await ScriptStorage.getAll();
    for (const script of allScripts) await unregisterScript(script.id);
    await ScriptStorage.clear();
    if (typeof BackupsDAO !== 'undefined' && BackupsDAO.clear) await BackupsDAO.clear();
    await chrome.storage.local.clear();
    if (chrome.storage.session?.clear) await chrome.storage.session.clear();
    executionDiagnosticsJournal.clear();
    await SettingsManager.reset();
    if (chrome.declarativeNetRequest?.getDynamicRules) {
      const dynamicRules = await chrome.declarativeNetRequest.getDynamicRules();
      if (dynamicRules.length) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: dynamicRules.map(rule => rule.id)
        });
      }
    }
    if (chrome.declarativeNetRequest?.getSessionRules) {
      const sessionRules = await chrome.declarativeNetRequest.getSessionRules();
      if (sessionRules.length) {
        await chrome.declarativeNetRequest.updateSessionRules({
          removeRuleIds: sessionRules.map(rule => rule.id)
        });
      }
    }
    await chrome.alarms.clearAll();
    if (typeof FolderStorage !== 'undefined' && FolderStorage.cache) FolderStorage.cache = null;
    await updateBadge();
    return { success: true };
  }
}));
backgroundActionRegistry.registerHandlers(DiagnosticsActionHandler.createDiagnosticsActionHandlers({
  reportCspFailure: async (url: any, scriptId: any, directive: any) => {
    const cspData = await chrome.storage.local.get('cspReports');
    let reports = cspData.cspReports || [];
    reports.push({ url, scriptId, directive, timestamp: Date.now() });
    if (reports.length > 510) reports = reports.slice(-500);
    await chrome.storage.local.set({ cspReports: reports });
    return { success: true };
  },
  getCspReports: async () => {
    const cspData = await chrome.storage.local.get('cspReports');
    return { reports: cspData.cspReports || [] };
  },
  getNetworkLog: (filters: any) => NetworkLog.getAll(filters),
  getNetworkLogStats: () => NetworkLog.getStats(),
  clearNetworkLog: (scriptId: any) => {
    NetworkLog.clear(scriptId);
    return { success: true };
  },
  analyzeScript: (code: any) => ScriptAnalyzer.analyzeAsync(code),
  getOnDeviceAiStatus: async () => {
    const settings = await SettingsManager.get();
    if (typeof OnDeviceAI === 'undefined' || typeof OnDeviceAI.getStatus !== 'function') {
      return {
        enabled: settings?.onDeviceAiEnabled === true,
        localOnly: true,
        provider: 'chrome-prompt-api',
        available: false,
        availability: 'module-missing',
        downloadable: false,
        downloading: false,
        reason: 'On-device AI module is unavailable.'
      };
    }
    return await OnDeviceAI.getStatus(settings);
  },
  runOnDeviceAi: async (input: any) => {
    const settings = await SettingsManager.get();
    if (typeof OnDeviceAI === 'undefined' || typeof OnDeviceAI.runPrompt !== 'function') {
      return { success: false, error: 'On-device AI module is unavailable.' };
    }
    return await OnDeviceAI.runPrompt(settings, input);
  },
  getScriptStats: async (scriptId: any) => {
    if (scriptId) {
      const script = await ScriptStorage.get(scriptId);
      return { stats: script?.stats || null };
    }
    const scripts = await ScriptStorage.getAll();
    const allStats: any = {};
    for (const script of scripts) {
      if (script.stats) allStats[script.id] = script.stats;
    }
    return { allStats };
  },
  getExecutionDiagnostics: (tabId: any) => getExecutionDiagnosticsSnapshot(tabId),
  resetScriptStats: async (scriptId: any) => {
    const script = await ScriptStorage.get(scriptId);
    if (script) {
      script.stats = { runs: 0, totalTime: 0, avgTime: 0, lastRun: 0, errors: 0 };
      await ScriptStorage.set(scriptId, script);
    }
    return { success: true };
  },
  reportDocumentReady: (url: any, sender: any, reportedDocumentId: any) => {
    recordExecutionDiagnostic(sender, {
      type: 'document-ready',
      url: url || sender?.tab?.url || ''
    });
    const documentId = _normalizeUserStylesDocumentId(sender?.documentId || reportedDocumentId);
    if (
      documentId
      && _isFirefoxRuntime()
      && !sender?.userScriptId
      && sender?.frameId === 0
      && typeof sender?.tab?.id === 'number'
      && typeof UserStylesEngine !== 'undefined'
    ) {
      UserStylesEngine.onDocumentCommitted(sender.tab.id, url || sender?.tab?.url, documentId)
        .catch((error: any) => console.error('[ScriptVault] UserCSS document identity handoff failed:', error));
    }
    return { success: true };
  },
  npmResolve: (spec: any) => typeof NpmResolver !== 'undefined'
    ? NpmResolver.resolve(spec)
    : Promise.resolve({ error: 'NpmResolver not available' }),
  npmResolveAll: (requires: any) => typeof NpmResolver !== 'undefined'
    ? NpmResolver.resolveAll(requires)
    : Promise.resolve({ error: 'NpmResolver not available' }),
  logError: async (entry: any) => {
    if (typeof ErrorLog === 'undefined') return { error: 'ErrorLog not available' };
    await ErrorLog.log(entry);
    return { success: true };
  },
  getErrorLog: (filters: any) => typeof ErrorLog !== 'undefined'
    ? ErrorLog.getAll(filters)
    : Promise.resolve({ log: [] }),
  getErrorLogGrouped: () => typeof ErrorLog !== 'undefined'
    ? ErrorLog.getGrouped()
    : Promise.resolve({ groups: [] }),
  exportErrorLog: async (format: any) => {
    if (typeof ErrorLog === 'undefined') return { error: 'ErrorLog not available' };
    if (format === 'csv') return { data: await ErrorLog.exportCSV() };
    if (format === 'text') return { data: await ErrorLog.exportText() };
    return { data: await ErrorLog.exportJSON() };
  },
  clearErrorLog: async () => {
    if (typeof ErrorLog === 'undefined') return { error: 'ErrorLog not available' };
    await ErrorLog.clear();
    return { success: true };
  },
  getNotificationPrefs: () => typeof NotificationSystem !== 'undefined'
    ? NotificationSystem.getPreferences()
    : Promise.resolve({}),
  setNotificationPrefs: async (prefs: any) => {
    if (typeof NotificationSystem === 'undefined') return { error: 'NotificationSystem not available' };
    await NotificationSystem.setPreferences(prefs);
    return { success: true };
  },
  generateDigest: () => typeof NotificationSystem !== 'undefined'
    ? NotificationSystem.generateDigest()
    : Promise.resolve({ error: 'NotificationSystem not available' }),
  captureScriptConsole: async (scriptId: any, capturedEntries: any) => {
    const key = `console_${scriptId}`;
    const existing = await chrome.storage.session.get(key);
    const entries = existing[key] || [];
    entries.push(...capturedEntries.slice(-200));
    await chrome.storage.session.set({ [key]: entries.slice(-200) });
    return { success: true };
  },
  getScriptConsole: async (scriptId: any) => {
    const consoleData = await chrome.storage.session.get(`console_${scriptId}`);
    return { entries: consoleData[`console_${scriptId}`] || [] };
  },
  clearScriptConsole: async (scriptId: any) => {
    await chrome.storage.session.remove(`console_${scriptId}`);
    return { success: true };
  },
  setLiveReload: async (scriptId: any, enabled: any) => {
    const { liveReloadScripts = {} } = await chrome.storage.local.get('liveReloadScripts');
    if (enabled) liveReloadScripts[scriptId] = true;
    else delete liveReloadScripts[scriptId];
    await chrome.storage.local.set({ liveReloadScripts });
    return { success: true };
  },
  getLiveReloadScripts: async () => {
    const { liveReloadScripts = {} } = await chrome.storage.local.get('liveReloadScripts');
    return { scripts: liveReloadScripts };
  }
}));
backgroundActionRegistry.registerHandlers(MessageRouter.createBackgroundDomainHandlers(
  GMValuesHandler.GM_VALUES_ACTIONS,
  ({ action, message, sender }: any) => GMValuesHandler.handleGMValuesMessage(action, message, sender)
));
backgroundActionRegistry.registerHandlers(MessageRouter.createBackgroundDomainHandlers(
  GMAudioHandler.GM_AUDIO_ACTIONS,
  ({ action, message, sender }: any) => GMAudioHandler.handleGMAudioMessage(action, message, sender)
));
backgroundActionRegistry.registerHandlers(MessageRouter.createBackgroundDomainHandlers(
  GMMenuHandler.GM_MENU_ACTIONS,
  ({ action, message, sender }: any) => GMMenuHandler.handleGMMenuMessage(action, message, sender)
));
backgroundActionRegistry.registerHandlers(MessageRouter.createBackgroundDomainHandlers(
  GMTabsHandler.GM_TABS_ACTIONS,
  ({ action, message, sender }: any) => GMTabsHandler.handleGMTabsMessage(action, message, sender)
));
backgroundActionRegistry.registerHandlers(MessageRouter.createBackgroundDomainHandlers(
  GMNotificationHandler.GM_NOTIFICATION_ACTIONS,
  ({ action, message, sender }: any) => GMNotificationHandler.handleGMNotificationMessage(action, message, sender)
));
backgroundActionRegistry.registerHandlers(MessageRouter.createBackgroundDomainHandlers(
  GMResourceHandler.GM_RESOURCE_ACTIONS,
  ({ action, message, sender }: any) => GMResourceHandler.handleGMResourceMessage(action, message, sender)
));
backgroundActionRegistry.registerHandlers(MessageRouter.createBackgroundDomainHandlers(
  GMWebRequestHandler.GM_WEBREQUEST_ACTIONS,
  ({ action, message, sender }: any) => GMWebRequestHandler.handleGMWebRequestMessage(action, message, sender)
));
backgroundActionRegistry.registerHandlers(MessageRouter.createBackgroundDomainHandlers(
  GMCookieHandler.GM_COOKIE_ACTIONS,
  ({ action, message, sender }: any) => GMCookieHandler.handleGMCookieMessage(action, message, sender)
));
backgroundActionRegistry.registerHandlers(MessageRouter.createBackgroundDomainHandlers(
  GMNetworkHandler.GM_NETWORK_ACTIONS,
  ({ action, message, sender }: any) => GMNetworkHandler.handleGMNetworkMessage(action, message, sender)
));

// USER_SCRIPT world message listener (for GM_* APIs)
// This is SEPARATE from onMessage and required for messaging: true to work
//
// Security: userscripts are semi-trusted code. Restrict this path to the
// action set the GM_* wrapper actually needs. Without this allowlist a
// malicious userscript could invoke privileged dashboard actions like
// factoryReset, deleteScript, importScripts, or setSettings.
function isUserScriptAllowedAction(action: any) {
  return UserScriptMessagePolicy.isUserScriptAllowedAction(action);
}

// True when the dedicated user-script messaging API is available (Chrome 131+).
// On older runtimes the wrapper's chrome.runtime.sendMessage calls fall back to
// onMessage, so the same allowlist must gate tab-origin messages there.
const USER_SCRIPT_MESSAGING_AVAILABLE = typeof chrome !== 'undefined'
  && !!(chrome.runtime && chrome.runtime.onUserScriptMessage);

// Network callbacks must not travel through the page-visible content-script
// bridge. A page can observe every window.postMessage event before a wrapper
// checks scriptId, so keep the routing metadata on an authenticated runtime
// Port whose sender is a specific user script.
const USER_SCRIPT_EVENT_PORT_NAME = 'ScriptVault:privileged-events:v1';
const _userScriptEventPorts = new Map<string, Set<any>>();

function _removeUserScriptEventPort(scriptId: string, port: any) {
  const ports = _userScriptEventPorts.get(scriptId);
  if (!ports) return;
  ports.delete(port);
  if (ports.size === 0) _userScriptEventPorts.delete(scriptId);
}

function _registerUserScriptEventPort(scriptId: string, port: any, onDisconnect: () => void) {
  if (!scriptId || !port) return;
  let ports = _userScriptEventPorts.get(scriptId);
  if (!ports) {
    ports = new Set();
    _userScriptEventPorts.set(scriptId, ports);
  }
  ports.add(port);
  try {
    port.postMessage({
      channel: `ScriptVault_${chrome.runtime.id}`,
      direction: 'to-userscript',
      type: 'ready',
      scriptId,
    });
  } catch (_) {
    _removeUserScriptEventPort(scriptId, port);
    try { onDisconnect(); } catch (_) {}
  }
}

function _createUserScriptEventMessage(action: string, data: any) {
  const eventData = data && typeof data === 'object' && !Array.isArray(data) ? { ...data } : {};
  const scriptId = typeof eventData.scriptId === 'string' ? eventData.scriptId : '';
  const channel = `ScriptVault_${chrome.runtime.id}`;
  if (action === 'valueChanged') {
    const hasValue = eventData.hasValue === true;
    return {
      channel,
      direction: 'to-userscript',
      type: 'valueChanged',
      scriptId,
      key: eventData.key,
      remote: eventData.remote !== false,
      hasValue,
      ...(hasValue ? { newValue: eventData.newValue } : {}),
    };
  }
  if (action === 'xhrEvent') {
    return {
      channel,
      direction: 'to-userscript',
      type: 'xhrEvent',
      requestId: eventData.requestId,
      scriptId,
      eventType: eventData.type,
      data: eventData,
    };
  }
  if (action === 'webSocketEvent') {
    return {
      channel,
      direction: 'to-userscript',
      type: 'webSocketEvent',
      requestId: eventData.requestId,
      scriptId,
      eventType: eventData.type,
      data: eventData,
    };
  }
  if (action === 'downloadEvent') {
    return {
      channel,
      direction: 'to-userscript',
      type: 'downloadEvent',
      scriptId,
      downloadId: eventData.downloadId,
      eventType: eventData.type,
      data: eventData,
    };
  }
  if (action === 'audioStateChanged') {
    return {
      channel,
      direction: 'to-userscript',
      type: 'audioStateChanged',
      data: eventData,
    };
  }
  return null;
}

function sendUserScriptEvent(tabId: any, action: string, data: any = {}) {
  const message = _createUserScriptEventMessage(action, data);
  const scriptId = typeof data?.scriptId === 'string' ? data.scriptId : '';
  let delivered = false;
  const ports = scriptId ? _userScriptEventPorts.get(scriptId) : undefined;
  if (ports) {
    for (const port of [...ports]) {
      const portTabId = Number(port?.sender?.tab?.id);
      if (!Number.isFinite(portTabId) || portTabId !== Number(tabId)) continue;
      try {
        port.postMessage(message);
        delivered = true;
      } catch (_) {
        _removeUserScriptEventPort(scriptId, port);
      }
    }
  }
  return delivered;
}

(globalThis as any).__svSendUserScriptEvent = sendUserScriptEvent;

function _listenForUserScriptEventPort(port: any) {
  if (!port || port.name !== USER_SCRIPT_EVENT_PORT_NAME) return;
  let registeredScriptId = '';
  let authenticating = false;
  const onDisconnect = () => {
    if (registeredScriptId) _removeUserScriptEventPort(registeredScriptId, port);
  };
  try { port.onDisconnect?.addListener(onDisconnect); } catch (_) {}

  const reject = () => {
    try { port.disconnect?.(); } catch (_) {}
  };
  const register = (scriptId: string) => {
    if (registeredScriptId || !scriptId) return;
    registeredScriptId = scriptId;
    _registerUserScriptEventPort(scriptId, port, onDisconnect);
  };

  try {
    port.onMessage?.addListener((message: any) => {
      if (registeredScriptId || authenticating) return;
      if (!message || message.type !== 'subscribe' || typeof message.scriptId !== 'string' || !message.scriptId) {
        reject();
        return;
      }
      const scriptId = message.scriptId;
      const senderScriptId = typeof port.sender?.userScriptId === 'string'
        ? port.sender.userScriptId
        : '';
      if (senderScriptId) {
        if (senderScriptId !== scriptId) reject();
        else register(scriptId);
        return;
      }

      authenticating = true;
      UserScriptMessagePolicy.authenticateUserScriptSender({
        action: 'GM_getValue',
        data: {
          scriptId,
          scriptAuthToken: message.scriptAuthToken,
        },
      }, port.sender || {})
        .then(() => register(scriptId))
        .catch(() => reject())
        .finally(() => { authenticating = false; });
    });
  } catch (_) {
    reject();
  }
}

try { chrome.runtime.onUserScriptConnect?.addListener(_listenForUserScriptEventPort); } catch (_) {}
// A few older Chromium/Firefox builds expose the user-script messaging
// methods but deliver connect() through the generic event. The same handshake
// and token check keeps this compatibility path authenticated.
try { chrome.runtime.onConnect?.addListener(_listenForUserScriptEventPort); } catch (_) {}

// Decide whether a chrome.runtime.onMessage sender represents a trusted
// extension surface (popup, dashboard, install page, sidebar) versus a tab
// context (content script or — on Chrome <131 — a user script falling back to
// onMessage). Extension surfaces may call any handleMessage action; tab
// contexts are restricted to the user-script allowlist.
function isExtensionSurfaceSender(sender: any) {
  return UserScriptMessagePolicy.isExtensionSurfaceSender(sender, chrome.runtime?.id);
}

// Regular message listener (content scripts, popup, dashboard).
//
// Tab-origin messages are gated by isUserScriptAllowedAction so that, when the
// dedicated user-script channel is unavailable (Chrome <131 / Firefox without
// onUserScriptMessage), the same allowlist still applies. Extension surfaces
// (popup, dashboard, install page) keep full access.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const extensionSurfaceSender = isExtensionSurfaceSender(sender);
  if (!extensionSurfaceSender) {
    if (!message || !isUserScriptAllowedAction(message.action)) {
      sendResponse({ error: 'Action not permitted from non-extension context' });
      return false;
    }
  }
  const authenticatedSender = extensionSurfaceSender
    ? Promise.resolve(sender)
    : UserScriptMessagePolicy.authenticateUserScriptSender(message, sender);
  authenticatedSender
    .then(async (verifiedSender: any) => {
      const denied = await checkGmActionGrant(message.action, verifiedSender);
      if (denied) return denied;
      return handleMessage(message, verifiedSender);
    })
    .then(sendResponse)
    .catch((e: any) => {
      console.error('[ScriptVault] Unhandled message error:', e);
      sendResponse({ error: e.message });
    });
  return true;
});

const normalizeConnectHost = ConnectPolicy.normalizeConnectHost;
const hostMatchesConnectPattern = ConnectPolicy.hostMatchesConnectPattern;
const getScriptHostScopeInfo = ConnectPolicy.getScriptHostScopeInfo;
const isScriptHostScopeAllowed = ConnectPolicy.isScriptHostScopeAllowed;
const evaluateConnectPolicy = ConnectPolicy.evaluateConnectPolicy;
const evaluateScriptHostScopePolicy = ConnectPolicy.evaluateScriptHostScopePolicy;
const shouldAllowInternalXhr = ConnectPolicy.shouldAllowInternalXhr;

function internalXhrError(prefix: any, guardResult: any) {
  const reason = guardResult?.reason || 'internal-host';
  return `${prefix}: internal host (${reason})`;
}

const GM_WEBSOCKET_MAX_MESSAGE_BYTES = 1024 * 1024;

function getGMWebSocketMap() {
  if (!self._gmWebSockets) self._gmWebSockets = new Map();
  return self._gmWebSockets;
}

function scriptHasGrant(script: any, names: any) {
  const grants = Array.isArray(script?.meta?.grant) ? script.meta.grant : [];
  if (grants.includes('*')) return true;
  return names.some((name: any) => grants.includes(name));
}

/**
 * Enforce `@grant` at the privileged boundary.
 *
 * The wrapper's own `hasGrant()` runs in the USER_SCRIPT world alongside the
 * untrusted body, with `chrome` unshadowed — so a script can bypass the wrapper
 * and message the background directly. Without this gate a `@grant none` script
 * could still drive the value store, tabs, downloads, notifications, menu
 * commands and cookies, making the install-time permission disclosure a
 * description of the wrapper rather than of enforced capability.
 *
 * Returns an error object to send back, or null when the request may proceed.
 * Only requests carrying a resolved `userScriptId` are gated: extension surfaces
 * (dashboard, popup, install page) are trusted callers with no `@grant` of their
 * own.
 */
async function checkGmActionGrant(action: any, sender: any) {
  const scriptId = sender?.userScriptId;
  if (!scriptId) return null;
  if (typeof action !== 'string') return null;
  if (!action.startsWith('GM_') && !action.startsWith('GM.')) return null;

  let script: any = null;
  try {
    script = await ScriptStorage.get(scriptId);
  } catch (e: any) {
    // A storage failure must not silently grant the capability.
    debugWarn('[ScriptVault] Grant check could not load script:', e?.message || e);
    return { error: GMGrantPolicy.grantDeniedError(action) };
  }
  if (!script) {
    // The token authenticated, but the script is gone (uninstalled mid-flight).
    return { error: GMGrantPolicy.grantDeniedError(action) };
  }
  if (GMGrantPolicy.isActionGrantedForScript(action, script)) return null;
  return { error: GMGrantPolicy.grantDeniedError(action) };
}

function normalizeGMWebSocketUrl(rawUrl: any) {
  const parsed = new URL(String(rawUrl || ''));
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error('GM_webSocket requires a ws: or wss: URL');
  }
  return parsed.href;
}

function normalizeGMWebSocketProtocols(value: any) {
  if (value == null || value === '') return undefined;
  const protocols = Array.isArray(value) ? value : [value];
  const seen = new Set();
  const normalized = [];
  for (const protocol of protocols) {
    const token = String(protocol || '').trim();
    if (!token) continue;
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(token)) {
      throw new Error('GM_webSocket protocol contains invalid characters');
    }
    const key = token.toLowerCase();
    if (seen.has(key)) {
      throw new Error('GM_webSocket protocol list contains duplicates');
    }
    seen.add(key);
    normalized.push(token);
  }
  return normalized.length > 0 ? normalized : undefined;
}

function estimateGMWebSocketPayloadBytes(payload: any) {
  if (payload == null) return 0;
  if (typeof payload === 'string') return new TextEncoder().encode(payload).byteLength;
  if (payload instanceof ArrayBuffer) return payload.byteLength;
  if (ArrayBuffer.isView(payload)) return payload.byteLength;
  if (payload instanceof Blob) return payload.size;
  if (payload && typeof payload === 'object' && payload.__sv_base64__) {
    return Math.floor(String(payload.data || '').length * 3 / 4);
  }
  return new TextEncoder().encode(String(payload)).byteLength;
}

function decodeGMWebSocketPayload(payload: any) {
  if (payload && typeof payload === 'object' && payload.__sv_base64__) {
    const binary = atob(String(payload.data || ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
  return typeof payload === 'string' ? payload : String(payload ?? '');
}

async function encodeGMWebSocketPayload(payload: any) {
  if (typeof payload === 'string') return payload;
  let buffer = null;
  if (payload instanceof ArrayBuffer) {
    buffer = payload;
  } else if (ArrayBuffer.isView(payload)) {
    buffer = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
  } else if (payload instanceof Blob) {
    buffer = await payload.arrayBuffer();
  }
  if (!buffer) return String(payload ?? '');

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return { __sv_base64__: true, data: btoa(binary) };
}

function normalizeGMWebSocketCloseCode(code: any) {
  if (code === undefined || code === null || code === '') return undefined;
  const value = Number(code);
  if (!Number.isInteger(value)) return undefined;
  if (value === 1000 || (value >= 3000 && value <= 4999)) return value;
  return undefined;
}

function normalizeGMWebSocketCloseReason(reason: any) {
  if (reason === undefined || reason === null) return undefined;
  const text = String(reason);
  const encoder = new TextEncoder();
  if (encoder.encode(text).byteLength <= 123) return text;
  let out = '';
  for (const char of text) {
    if (encoder.encode(out + char).byteLength > 123) break;
    out += char;
  }
  return out;
}

function sendGMWebSocketEvent(record: any, type: any, eventData: any = {}) {
  if (!record || typeof record.tabId !== 'number') return;
  let bridgeEventData = eventData;
  if (type === 'message') {
    const eventId = 'ws_evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
    record._eventQueue = Array.isArray(record._eventQueue) ? record._eventQueue : [];
    record._eventQueue.push({ id: eventId, type, data: eventData });
    if (record._eventQueue.length > 100) record._eventQueue.splice(0, record._eventQueue.length - 100);
    bridgeEventData = { eventId };
  }
  const data = {
    requestId: record.requestId,
    scriptId: record.scriptId,
    type,
    ...bridgeEventData
  };
  if (sendUserScriptEvent(record.tabId, 'webSocketEvent', data)) return;
  try {
    Promise.resolve(chrome.tabs.sendMessage(record.tabId, {
      action: 'webSocketEvent',
      data,
    })).catch(() => {});
  } catch (_) {
    // Tab may be gone.
  }
}

function closeGMWebSocketsForTab(tabId: any, code: any = 1001, reason: any = 'Tab closed') {
  const sockets = getGMWebSocketMap();
  for (const [requestId, record] of sockets) {
    if (record.tabId !== tabId) continue;
    sockets.delete(requestId);
    try { record.socket?.close?.(code, reason); } catch (_) {}
  }
}

function resolveCookiePolicyTarget(data: any, sender: any) {
  if (data?.url) return String(data.url);
  if (data?.domain) {
    const domain = String(data.domain).trim().replace(/^\./, '');
    if (domain) return `https://${domain}/`;
  }
  const senderUrl = sender?.url || sender?.tab?.url || '';
  return isHttpCookieUrl(senderUrl) ? senderUrl : '';
}

function runtimeHostPermissionPatternForUrl(url: any) {
  if (typeof HostPermissionPatterns !== 'undefined'
      && typeof HostPermissionPatterns.runtimeHostPermissionPatternForUrl === 'function') {
    return HostPermissionPatterns.runtimeHostPermissionPatternForUrl(url);
  }

  try {
    const parsed = new URL(String(url || ''));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { supported: false, pattern: '', origin: '', scheme: '', host: '', reason: 'unsupported-scheme' };
    }
    let host = parsed.hostname.toLowerCase();
    if (host.includes(':') && !host.startsWith('[')) host = `[${host}]`;
    if (!host) return { supported: false, pattern: '', origin: '', scheme: '', host: '', reason: 'missing-host' };
    return {
      supported: true,
      pattern: `${parsed.protocol}//${host}/*`,
      origin: parsed.origin,
      scheme: parsed.protocol.slice(0, -1),
      host,
      reason: ''
    };
  } catch (_) {
    return { supported: false, pattern: '', origin: '', scheme: '', host: '', reason: 'invalid-url' };
  }
}

function deriveOptionalHostPermissionPlan(meta: any, options: any = {}) {
  if (typeof HostPermissionPatterns !== 'undefined'
      && typeof HostPermissionPatterns.deriveOptionalHostPermissionPlan === 'function') {
    return HostPermissionPatterns.deriveOptionalHostPermissionPlan(meta, options);
  }
  return { origins: [], broadOrigins: [], unsupported: [], requiresBroadHostAccess: false };
}

function shouldEnforceScopedHostPermissions(settings: any) {
  if (settings?.scopedHostPermissions === false) return false;
  if (/Firefox\//.test(navigator?.userAgent || '')) return false;
  return typeof chrome?.permissions?.contains === 'function';
}

async function ensureScopedHostPermissionsForScript(script: any, settings: any) {
  if (!shouldEnforceScopedHostPermissions(settings)) return;
  const allowBroad = script?.settings?.allowBroadHostAccess === true;
  const plan = deriveOptionalHostPermissionPlan(script?.meta || {}, { allowBroad });
  if (plan.requiresBroadHostAccess && !allowBroad) {
    await chrome.userScripts.unregister({ ids: [script.id] }).catch(() => {});
    throw new Error('Broad host access requires explicit per-script opt-in before registration');
  }
  if (!Array.isArray(plan.origins) || plan.origins.length === 0) return;
  let granted = false;
  try {
    granted = await chrome.permissions.contains({ origins: plan.origins });
  } catch (_) {
    granted = false;
  }
  if (!granted) {
    await chrome.userScripts.unregister({ ids: [script.id] }).catch(() => {});
    const sample = plan.origins.slice(0, 3).join(', ');
    const suffix = plan.origins.length > 3 ? `, +${plan.origins.length - 3} more` : '';
    throw new Error(`Browser host access not granted for ${sample}${suffix}`);
  }
}

function getHostPermissionRequestMethod() {
  if (typeof chrome?.permissions?.addHostAccessRequest === 'function') return 'addHostAccessRequest';
  if (typeof chrome?.permissions?.request === 'function') return 'permissions.request';
  return 'manual';
}

function getHostPermissionBrowserLabel() {
  const ua = navigator?.userAgent || '';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Edg\//.test(ua)) return 'edge';
  if (/(Chrome|Chromium)\//.test(ua)) return 'chromium';
  return 'unknown';
}

function rememberRuntimeHostPermissionTarget(tab: any) {
  const url = tab?.url || '';
  const patternInfo = runtimeHostPermissionPatternForUrl(url);
  if (!patternInfo.supported || typeof tab?.id !== 'number') return;
  self._lastRuntimeHostPermissionTarget = {
    tabId: tab.id,
    url,
    title: tab.title || '',
    host: patternInfo.host,
    updatedAt: Date.now()
  };
}

function getRememberedRuntimeHostPermissionTarget() {
  const target = self._lastRuntimeHostPermissionTarget;
  if (!target?.url || !runtimeHostPermissionPatternForUrl(target.url).supported) return null;
  return target;
}

function summarizeBlockedHostScript(script: any) {
  return {
    id: script.id || '',
    name: script.meta?.name || script.metadata?.name || script.id || 'Unnamed script',
    enabled: script.enabled !== false
  };
}

async function getRuntimeHostPermissionStatus(url: any) {
  const patternInfo = runtimeHostPermissionPatternForUrl(url);
  const requestMethod = getHostPermissionRequestMethod();
  const browser = getHostPermissionBrowserLabel();
  const status: any = {
    success: true,
    supported: patternInfo.supported,
    url: String(url || ''),
    origin: patternInfo.origin,
    pattern: patternInfo.pattern,
    scheme: patternInfo.scheme,
    host: patternInfo.host,
    reason: patternInfo.reason,
    browser,
    requestMethod,
    granted: patternInfo.supported ? null : true,
    needsHostAccess: false,
    blockedCount: 0,
    blockedScripts: [],
    message: ''
  };

  if (!patternInfo.supported) {
    status.message = patternInfo.reason === 'unsupported-scheme'
      ? 'Browser host access can only be requested for http and https pages.'
      : 'Current tab URL is not available for host access diagnostics.';
    return status;
  }

  const settings = await SettingsManager.get();
  if (isUrlBlockedByGlobalSettings(url, settings)) {
    status.granted = true;
    status.message = 'This site is blocked by ScriptVault page filters.';
    return status;
  }

  let scripts = [];
  try {
    const matchSet = await getMatchSet();
    scripts = matchSet.getMatching(url);
  } catch (_) {
    scripts = (await ScriptStorage.getAll()).filter((script: any) => doesScriptMatchUrl(script, url));
  }

  const enabledScripts = scripts
    .filter((script: any) => script.enabled !== false)
    .sort((a: any, b: any) => (a.position || 0) - (b.position || 0));

  if (typeof chrome?.permissions?.contains === 'function') {
    try {
      status.granted = await chrome.permissions.contains({ origins: [patternInfo.pattern] });
    } catch (error: any) {
      status.granted = null;
      status.reason = 'permission-probe-failed';
      status.message = error?.message || 'Host permission probe failed.';
    }
  }

  if (status.granted === false && enabledScripts.length > 0) {
    status.needsHostAccess = true;
    status.blockedCount = enabledScripts.length;
    status.blockedScripts = enabledScripts.slice(0, 12).map(summarizeBlockedHostScript);
    const first = status.blockedScripts[0]?.name || 'matching script';
    status.message = enabledScripts.length === 1
      ? `${first} is blocked until this site is granted to ScriptVault.`
      : `${enabledScripts.length} enabled scripts are blocked until this site is granted to ScriptVault.`;
  } else if (status.granted === false) {
    status.message = 'ScriptVault does not currently have browser host access for this site.';
  } else if (status.granted === true) {
    status.message = enabledScripts.length
      ? `Browser host access is granted for ${patternInfo.host}.`
      : `Browser host access is granted for ${patternInfo.host}; no enabled scripts match this page.`;
  } else if (!status.message) {
    status.message = 'Host permission state could not be confirmed.';
  }

  return status;
}

async function queueRuntimeHostAccessRequest(url: any, tabId: any, documentId: any) {
  const patternInfo = runtimeHostPermissionPatternForUrl(url);
  if (!patternInfo.supported) {
    return { success: false, error: 'Current tab does not support browser host access requests.', ...patternInfo };
  }
  if (typeof chrome?.permissions?.addHostAccessRequest !== 'function') {
    return {
      success: false,
      error: 'Chrome host access request surface is unavailable.',
      requestMethod: getHostPermissionRequestMethod(),
      ...patternInfo
    };
  }

  const request: any = { pattern: patternInfo.pattern };
  if (typeof tabId === 'number') {
    request.tabId = tabId;
  } else if (documentId) {
    request.documentId = String(documentId);
  } else {
    return {
      success: false,
      error: 'A tab id or document id is required to show a host access request.',
      requestMethod: 'addHostAccessRequest',
      ...patternInfo
    };
  }

  await chrome.permissions.addHostAccessRequest(request);
  const status = await getRuntimeHostPermissionStatus(url);
  return {
    ...status,
    success: true,
    requested: true,
    requestMethod: 'addHostAccessRequest',
    message: `Site access request added for ${patternInfo.host}. Approve it from the browser Extensions menu.`
  };
}

function hasRuntimeHostPermissionOrigins(permissions: any) {
  return Array.isArray(permissions?.origins) && permissions.origins.length > 0;
}

async function notifyRuntimeHostPermissionChanged(changeType: any, permissions: any) {
  if (!hasRuntimeHostPermissionOrigins(permissions)) return;
  try { await registerAllScripts(true); } catch (_) {}
  try { await updateBadge(); } catch (_) {}
  try {
    chrome.runtime.sendMessage({
      action: 'runtimeHostPermissionsChanged',
      changeType,
      origins: permissions.origins
    }).catch(() => {});
  } catch (_) {}
}

if (chrome.runtime.onUserScriptMessage) {
  chrome.runtime.onUserScriptMessage.addListener((message, sender, sendResponse) => {
    if (!message || !isUserScriptAllowedAction(message.action)) {
      sendResponse({ error: 'Action not permitted from user script' });
      return false;
    }
    UserScriptMessagePolicy.authenticateUserScriptSender(message, sender)
      .then(async (verifiedSender: any) => {
        const denied = await checkGmActionGrant(message.action, verifiedSender);
        if (denied) return denied;
        return handleMessage(message, verifiedSender);
      })
      .then(sendResponse)
      .catch((e: any) => {
        console.error('[ScriptVault] Unhandled user script message error:', e);
        sendResponse({ error: e.message });
      });
    return true;
  });
  debugLog('User script message listener registered');
}

async function handleMessage(message: any, sender: any) {
  // Wait for SW init (SettingsManager/ScriptStorage) to finish before handling
  // any message. Without this, fast popup/dashboard opens after wake can hit
  // handlers with uninitialised state and return empty results or throw.
  try { await ensureInitialized(); } catch (e) { /* init failure is logged in init() */ }
  const { action } = message;
  if (typeof MessageRouter !== 'undefined' && !MessageRouter.isKnownBackgroundAction(action)) {
    return { error: 'Unknown action: ' + action };
  }
  try {
    const routed = await backgroundActionRegistry.dispatch(message, sender);
    return routed.handled ? routed.response : { error: 'Unknown action: ' + action };
  } catch (e: any) {
    console.error('[ScriptVault] Message handler error:', e);
    // Log to error system if available
    if (typeof ErrorLog !== 'undefined') {
      try { ErrorLog.log({ timestamp: Date.now(), error: e.message, stack: e.stack, context: 'handleMessage', action: action }); } catch {}
    }
    return { error: e.message };
  }
}

// ============================================================================
// Auto-reload matching tabs
// ============================================================================

// Debounced auto-reload to prevent mass tab reloads on rapid saves
let _autoReloadTimer: any = null;
let _autoReloadScriptsMap = new Map(); // scriptId → script (deduplicates rapid saves)

async function autoReloadMatchingTabs(script: any) {
  const settings = await SettingsManager.get();
  if (!settings.autoReload) return;

  _autoReloadScriptsMap.set(script.id, script);
  if (_autoReloadTimer) clearTimeout(_autoReloadTimer);

  _autoReloadTimer = setTimeout(async () => {
    const scripts = [..._autoReloadScriptsMap.values()];
    _autoReloadScriptsMap.clear();
    _autoReloadTimer = null;

    try {
      const tabs = await chrome.tabs.query({});
      const reloaded = new Set();
      for (const tab of tabs) {
        if (reloaded.has(tab.id)) continue;
        if (tab.url && scripts.some(s => doesScriptMatchUrl(s, tab.url))) {
          chrome.tabs.reload(tab.id).catch(() => {});
          reloaded.add(tab.id);
        }
      }
    } catch (e) {
      console.error('[ScriptVault] Auto-reload failed:', e);
    }
  }, 500);
}

// ============================================================================
// Badge Management
// ============================================================================

// chrome.action.* rejects if the target tab was closed between query and
// update ("No tab with id N"). These rejections surface as unhandled
// promises in the SW error log. All badge writes are fire-and-forget by
// design (a vanished tab is a non-event, not an error), so wrap once
// instead of sprinkling `.catch(() => {})` on every call.
function _setBadgeText(opts: any) {
  try {
    chrome.action.setBadgeText(opts).catch(() => {});
  } catch (_e) { /* synchronous throws (rare) — ignore */ }
}
function _setBadgeBackgroundColor(opts: any) {
  try {
    chrome.action.setBadgeBackgroundColor(opts).catch(() => {});
  } catch (_e) { /* see above */ }
}

// ============================================================================
// Cloud-sync runtime hooks
//
// CloudSync (modules/cloud-sync.js) loads before this bridge and reaches these
// through globalThis at call time. Top-level `function` declarations in a
// classic script become global properties, which is what makes that work.
// ============================================================================

/**
 * Move a script to trash honouring the user's `trashMode`, for a delete driven
 * by something other than the user pressing Delete — currently a remote sync
 * tombstone, which used to hard-delete and so could destroy a library
 * unrecoverably from a backend an attacker could write to.
 *
 * Returns true when a trash record was written. `trashMode: 'disabled'` means
 * the user opted out of trash entirely, so false is a correct outcome there.
 */
async function trashScriptForSync(script: any, reason: any = 'sync') {
  if (!script?.id) return false;
  try {
    const settings = await SettingsManager.get();
    if ((settings.trashMode || '30') === 'disabled') return false;
    return await _runExclusiveTrashMutation(async () => {
      const trashData = await chrome.storage.local.get('trash');
      const trash = Array.isArray(trashData.trash) ? trashData.trash.slice() : [];
      // Don't stack duplicates if the same tombstone arrives on two syncs.
      if (trash.some((entry: any) => entry?.id === script.id)) return true;
      trash.push({ ...script, trashedAt: Date.now(), trashedBy: reason });
      const budgeted = _enforceTrashBudget(trash);
      await chrome.storage.local.set({ trash: budgeted.trash });
      if (budgeted.evictedCount > 0) await _recordTrashEvictionNotice(budgeted.evicted, budgeted.evictedCount);
      return true;
    });
  } catch (e: any) {
    debugWarn('[ScriptVault] Failed to trash script for sync:', script.id, e?.message || e);
    return false;
  }
}

/** Analyze a synced-in body, or null when no analyzer is reachable. */
async function analyzeSyncedScriptCode(code: any) {
  if (typeof ScriptAnalyzer === 'undefined') return null;
  if (typeof ScriptAnalyzer.analyzeAsync === 'function') {
    return await ScriptAnalyzer.analyzeAsync(code);
  }
  if (typeof ScriptAnalyzer.analyze === 'function') {
    return ScriptAnalyzer.analyze(code);
  }
  return null;
}

/**
 * Tell the user a synced-in script was held back for review. Deliberately
 * unconditional on the update/error notification toggles: this is a security
 * decision the user has to know about, not a routine update notice.
 */
async function notifySyncedScriptReview(details: any) {
  const reasons = Array.isArray(details?.reasons) ? details.reasons : [];
  const detail = reasons.length ? reasons.join('; ') : 'needs review';
  const trust = details?.plaintextRemote
    ? ' Sync encryption is off, so the remote copy is unauthenticated.'
    : '';
  try {
    await chrome.notifications.create(`sync-review-${details?.scriptId || 'unknown'}`, {
      type: 'basic',
      iconUrl: 'images/icon128.png',
      title: 'Synced script held for review',
      message: `${details?.name || 'A script'} arrived disabled: ${detail}.${trust}`
    });
  } catch (e: any) {
    debugWarn('[ScriptVault] Could not notify synced-script review:', e?.message || e);
  }
  try {
    if (typeof EventLog !== 'undefined' && typeof EventLog.log === 'function') {
      await EventLog.log({
        category: 'sync',
        severity: 'warning',
        action: 'sync-script-quarantined',
        detail: `risk=${details?.riskLevel || 'unknown'}; ${detail}${trust}`,
        scriptId: details?.scriptId || null,
        scriptName: details?.name || null,
      });
    }
  } catch (e: any) {
    debugWarn('[ScriptVault] Could not log synced-script review:', e?.message || e);
  }
}

async function updateBadge(tabId: any = null) {
  const settings = await SettingsManager.get();

  if (!settings.showBadge || settings.enabled === false) {
    _setBadgeText({ text: '', tabId: tabId || undefined });
    return;
  }

  if (tabId) {
    // Update a specific tab
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab && tab.url) {
        await updateBadgeForTab(tabId, tab.url, settings);
      }
    } catch (e) {
      _setBadgeText({ text: '', tabId });
    }
    return;
  }

  // No specific tab — update all tabs in parallel
  try {
    const [tabs, scripts] = await Promise.all([
      chrome.tabs.query({}),
      ScriptStorage.getAll()
    ]);
    await Promise.allSettled(
      tabs.filter(t => t.id && t.url).map(t => updateBadgeForTab(t.id, t.url, settings, scripts))
    );
  } catch (e) {
    _setBadgeText({ text: '' });
  }
}

function isBadgeRunnableScript(script: any) {
  if (!isScriptEligibleForRegistration(script)) return false;
  if (script.meta?.background || script.settings?._registrationError) return false;
  const settingsRunAt = script.settings?.runAt;
  const effectiveRunAt = typeof settingsRunAt === 'string' && settingsRunAt !== 'default'
    ? settingsRunAt
    : script.meta?.['run-at'];
  return effectiveRunAt !== 'context-menu';
}

// Update badge for a specific tab based on its URL.
// Accepts optional pre-fetched settings/scripts to avoid redundant cache reads when
// called from updateBadge() in a loop over many tabs.
async function updateBadgeForTab(tabId: any, url: any, settings: any = null, scripts: any = null) {
  if (!settings) settings = await SettingsManager.get();

  if (!settings.showBadge || settings.enabled === false) {
    _setBadgeText({ text: '', tabId });
    return;
  }

  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
    _setBadgeText({ text: '', tabId });
    return;
  }

  try {
    // Check global page filter
    if (isUrlBlockedByGlobalSettings(url, settings)) {
      _setBadgeText({ text: '', tabId });
      return;
    }

    if (!scripts) scripts = await ScriptStorage.getAll();
    const matchingScripts = scripts.filter((script: any) => isBadgeRunnableScript(script) && doesScriptMatchUrl(script, url));

    const badgeInfo = settings.badgeInfo || 'running';
    let badgeText = '';
    if (badgeInfo === 'running') {
      badgeText = matchingScripts.length > 0 ? String(matchingScripts.length) : '';
    } else if (badgeInfo === 'total') {
      const allEnabled = scripts.filter((s: any) => s.enabled).length;
      badgeText = allEnabled > 0 ? String(allEnabled) : '';
    }
    // badgeInfo === 'none' leaves badgeText empty
    _setBadgeText({ text: badgeText, tabId });
    _setBadgeBackgroundColor({ color: settings.badgeColor || '#22c55e', tabId });
  } catch (e) {
    console.error('[ScriptVault] Failed to update badge:', e);
  }
}

// Return the first global page-filter rule that blocks `url`. Keeping the
// filter layer and rule in the response lets the popup explain a blocked
// script without reimplementing settings semantics in the UI.
function getUrlBlockReason(url: any, globalSettings: any) {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    const denied = globalSettings.deniedHosts;
    if (denied && Array.isArray(denied)) {
      for (const host of denied) {
        if (host && (urlObj.hostname === host || urlObj.hostname.endsWith('.' + host))) {
          return { code: 'global-denied-host', host };
        }
      }
    }
    const mode = globalSettings.pageFilterMode || 'blacklist';
    if (mode === 'whitelist') {
      const whitelist = (globalSettings.whitelistedPages || '').split('\n').map((s: any) => s.trim()).filter(Boolean);
      if (whitelist.length > 0 && !whitelist.some((p: any) => matchIncludePattern(p, url, urlObj))) {
        return { code: 'global-whitelist' };
      }
    } else if (mode === 'blacklist') {
      const blacklist = (globalSettings.blacklistedPages || '').split('\n').map((s: any) => s.trim()).filter(Boolean);
      const pattern = blacklist.find((p: any) => matchIncludePattern(p, url, urlObj));
      if (pattern) return { code: 'global-blacklist', pattern };
    }
  } catch (e) {}
  return null;
}

function isUrlBlockedByGlobalSettings(url: any, globalSettings: any) {
  return getUrlBlockReason(url, globalSettings) !== null;
}

// Explain the same positive/exclusion rule order used by doesScriptMatchUrl.
// This is intentionally kept in the background bundle (rather than relying
// on the typed test mirror) because background.core.js is the shipped runtime.
function explainScriptUrlMatch(script: any, url: any) {
  const meta = script?.meta || {};
  const settings = script?.settings || {};
  try {
    const urlObj = new URL(url);
    const list = (value: any) => Array.isArray(value) ? value : (value ? [value] : []);
    const effectiveMatches: any[] = [];
    const effectiveIncludes: any[] = [];
    const effectiveExcludes: any[] = [];
    if (settings.useOriginalMatches !== false) effectiveMatches.push(...list(meta.match));
    effectiveMatches.push(...list(settings.userMatches));
    if (settings.useOriginalIncludes !== false) effectiveIncludes.push(...list(meta.include));
    effectiveIncludes.push(...list(settings.userIncludes));
    if (settings.useOriginalExcludes !== false) effectiveExcludes.push(...list(meta.exclude));
    effectiveExcludes.push(...list(settings.userExcludes));

    for (const pattern of effectiveExcludes) {
      if (matchIncludePattern(pattern, url, urlObj)) {
        return { matched: false, state: 'excluded', directive: '@exclude', pattern };
      }
    }
    for (const pattern of list(meta.excludeMatch)) {
      if (matchPattern(pattern, url, urlObj)) {
        return { matched: false, state: 'excluded', directive: '@exclude-match', pattern };
      }
    }
    for (const pattern of effectiveMatches) {
      if (matchPattern(pattern, url, urlObj)) {
        return { matched: true, state: 'matched', directive: '@match', pattern };
      }
    }
    for (const pattern of effectiveIncludes) {
      if (matchIncludePattern(pattern, url, urlObj)) {
        return { matched: true, state: 'matched', directive: '@include', pattern };
      }
    }
  } catch (e) {}
  return { matched: false, state: 'not-matched' };
}

function diagnosticFramePolicy(script: any) {
  const frameMode = script?.settings?.frameMode;
  if (frameMode === 'top' || (frameMode !== 'all' && script?.meta?.noframes)) return 'top';
  return 'all';
}

function diagnosticReasonText(code: any, params: any = {}) {
  switch (code) {
    case 'running': return 'Matches the page and is registered.';
    case 'disabled': return 'Script is turned off.';
    case 'quarantined': return 'Quarantined import — review it before enabling.';
    case 'excluded': return `Excluded by ${params.directive || '@exclude'} ${params.pattern || ''}.`.trim();
    case 'no-match': return 'No @match/@include pattern matches this page.';
    case 'global-denied-host': return `Blocked by the denied host ${params.host || ''}.`.trim();
    case 'global-whitelist': return 'Blocked by the global allowlist: no rule matches this page.';
    case 'global-blacklist': return `Blocked by global block rule ${params.pattern || ''}.`.trim();
    case 'context-menu': return 'Runs from the right-click menu, not on page load.';
    case 'scheduled': return 'Runs on its @crontab schedule, not on page load.';
    case 'background': return '@background script — runs without a page.';
    case 'user-scripts-unavailable': return 'User scripts are turned off for this extension.';
    case 'paused': return 'ScriptVault is paused.';
    case 'registration-error': return `Registration failed: ${params.error || 'unknown error'}`;
    case 'not-registered': return 'Not currently registered.';
    default: return 'Script did not run on this page.';
  }
}

// Check if a script matches a URL (with URL override support)
function doesScriptMatchUrl(script: any, url: any) {
  const meta = script.meta || {};
  const settings = script.settings || {};

  try {
    const urlObj = new URL(url);

    // Build effective patterns based on settings
    let effectiveMatches = [];
    let effectiveIncludes = [];
    let effectiveExcludes = [];
    
    // Original @match patterns (if enabled)
    if (settings.useOriginalMatches !== false) {
      const origMatches = Array.isArray(meta.match) ? meta.match : (meta.match ? [meta.match] : []);
      effectiveMatches.push(...origMatches);
    }
    
    // User @match patterns
    if (settings.userMatches && settings.userMatches.length > 0) {
      effectiveMatches.push(...settings.userMatches);
    }
    
    // Original @include patterns (if enabled)
    if (settings.useOriginalIncludes !== false) {
      const origIncludes = Array.isArray(meta.include) ? meta.include : (meta.include ? [meta.include] : []);
      effectiveIncludes.push(...origIncludes);
    }
    
    // User @include patterns
    if (settings.userIncludes && settings.userIncludes.length > 0) {
      effectiveIncludes.push(...settings.userIncludes);
    }
    
    // Original @exclude patterns (if enabled)
    if (settings.useOriginalExcludes !== false) {
      const origExcludes = Array.isArray(meta.exclude) ? meta.exclude : (meta.exclude ? [meta.exclude] : []);
      effectiveExcludes.push(...origExcludes);
    }
    
    // User @exclude patterns
    if (settings.userExcludes && settings.userExcludes.length > 0) {
      effectiveExcludes.push(...settings.userExcludes);
    }
    
    // Also check @exclude-match (stored as excludeMatch by parser)
    const excludeMatchPatterns = Array.isArray(meta.excludeMatch) ? meta.excludeMatch :
                          (meta.excludeMatch ? [meta.excludeMatch] : []);
    
    // First check if URL matches any exclude pattern
    for (const pattern of effectiveExcludes) {
      if (matchIncludePattern(pattern, url, urlObj)) return false;
    }
    for (const pattern of excludeMatchPatterns) {
      if (matchPattern(pattern, url, urlObj)) return false;
    }
    
    // Then check if URL matches any include/match pattern
    for (const pattern of effectiveMatches) {
      if (matchPattern(pattern, url, urlObj)) return true;
    }
    for (const pattern of effectiveIncludes) {
      if (matchIncludePattern(pattern, url, urlObj)) return true;
    }
    
    return false;
  } catch (e) {
    return false;
  }
}

// Match a @match pattern against a URL
function matchPattern(pattern: any, url: any, urlObj: any) {
  if (!pattern) return false;
  if (pattern === '<all_urls>') return true;
  if (pattern === '*') return true;
  
  try {
    // Parse the pattern
    const patternMatch = pattern.match(/^(\*|https?|file|ftp):\/\/([^/]+)(\/.*)$/);
    if (!patternMatch) return false;
    
    const [, scheme, rawHost, path] = patternMatch;
    const host = rawHost.toLowerCase();
    const urlScheme = urlObj.protocol.slice(0, -1);
    
    // Check scheme
    // Chrome's `*` match-pattern scheme is only the HTTP(S) pair. Keep
    // @include's broader wildcard semantics in matchIncludePattern.
    if (scheme === '*' && urlScheme !== 'http' && urlScheme !== 'https') {
      return false;
    }
    if (scheme !== '*' && scheme !== urlScheme) {
      return false;
    }
    
    // Check host (use urlObj.host when pattern includes port, urlObj.hostname otherwise)
    if (host !== '*') {
      const hasPort = host.includes(':');
      const urlHost = (hasPort ? urlObj.host : urlObj.hostname).toLowerCase();
      if (host.startsWith('*.')) {
        const baseDomain = host.slice(2);
        if (hasPort) {
          // For *.example.com:8080, compare host (includes port) against baseDomain
          if (urlHost !== baseDomain && !urlHost.endsWith('.' + baseDomain)) {
            return false;
          }
        } else {
          // For *.example.com, compare hostname only
          if (urlObj.hostname !== baseDomain && !urlObj.hostname.endsWith('.' + baseDomain)) {
            return false;
          }
        }
      } else if (host !== urlHost) {
        return false;
      }
    }
    
    // Check path (convert glob to regex). Collapse consecutive `*` first so a
    // crafted @match like `/****…****a` can't produce `(.*){N}` — catastrophic
    // backtracking that freezes the SW per evaluated URL (matches matchIncludePattern).
    const pathRegex = new RegExp('^' + path.replace(/\*+/g, '*').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    if (!pathRegex.test(urlObj.pathname + urlObj.search)) {
      return false;
    }
    
    return true;
  } catch (e) {
    return false;
  }
}

// Match an @include pattern (glob-style or regex)
function matchIncludePattern(pattern: any, url: any, urlObj: any) {
  if (!pattern) return false;
  if (pattern === '*') return true;

  try {
    // Handle regex patterns: /regex/ or /regex/flags
    if (isRegexPattern(pattern)) {
      const re = parseRegexPattern(pattern);
      return re ? re.test(url) : false;
    }

    // Convert glob to regex — collapse consecutive wildcards to prevent ReDoS
    let regex = pattern
      .replace(/\*{2,}/g, '*')                // Collapse consecutive * to single
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape special chars
      .replace(/\*/g, '.*')                   // * -> .*
      .replace(/\?/g, '.');                   // ? -> .

    // Handle scheme wildcards
    regex = regex.replace(/^(\\\*):\/\//, '(https?|file|ftp)://');

    const re = new RegExp('^' + regex + '$', 'i');
    return re.test(url);
  } catch (e) {
    return false;
  }
}

// ============================================================================
// MatchSet — precompiled host index (Phase 4.2)
//
// `getScriptsForUrl` and the badge/tab-reload paths previously walked every
// script and every pattern on every URL. With 200+ scripts that's hundreds
// of regex tests per popup open. MatchSet precomputes a hostname → script
// index so the candidate set drops to scripts whose patterns could possibly
// match before the slow per-pattern check runs.
//
// See `src/background/url-matcher.ts` for the typed mirror; logic must
// stay aligned.
// ============================================================================

function _extractHostHint(pattern: any, kind: any) {
  if (!pattern) return null;
  if (pattern === '*' || pattern === '<all_urls>') return null;
  if ((kind === 'include' || kind === 'exclude') && isRegexPattern(pattern)) return null;

  const m = pattern.match(/^(?:\*|https?|file|ftp):\/\/([^/]+)/);
  if (!m) return null;
  const host = m[1];
  if (!host || host === '*') return null;
  const noPort = host.replace(/:\d+$/, '');
  if (noPort.startsWith('*.')) return noPort.slice(2).toLowerCase();
  if (noPort.includes('*')) return null;
  return noPort.toLowerCase();
}

function _getEffectivePatterns(script: any) {
  const meta = script.meta || {};
  const settings = script.settings || {};
  const out: any = [];
  const pushAll = (arr: any, kind: any) => {
    if (!arr) return;
    const list = Array.isArray(arr) ? arr : [arr];
    for (const p of list) {
      if (typeof p === 'string' && p) out.push({ pattern: p, kind });
    }
  };
  if (settings.useOriginalMatches !== false) pushAll(meta.match, 'match');
  pushAll(settings.userMatches, 'match');
  if (settings.useOriginalIncludes !== false) pushAll(meta.include, 'include');
  pushAll(settings.userIncludes, 'include');
  pushAll(meta.excludeMatch, 'excludeMatch');
  return out;
}

class MatchSet {
  universal: any[];
  byHost: Map<string, any[]>;
  size: number;

  constructor(scripts: any) {
    this.universal = [];
    this.byHost = new Map();
    this.size = scripts.length;

    for (const script of scripts) {
      if (!script || !script.id) continue;
      const patterns = _getEffectivePatterns(script);
      const positive = patterns.filter((p: any) => p.kind === 'match' || p.kind === 'include');
      if (positive.length === 0) continue;

      let allUniversal = false;
      const hosts = new Set<string>();
      for (const p of positive) {
        if (p.pattern === '*' || p.pattern === '<all_urls>') {
          allUniversal = true;
          break;
        }
        const hint = _extractHostHint(p.pattern, p.kind);
        if (hint == null) {
          allUniversal = true;
          break;
        }
        hosts.add(hint);
      }

      if (allUniversal) {
        this.universal.push(script);
      } else {
        for (const host of hosts) {
          let bucket = this.byHost.get(host);
          if (!bucket) {
            bucket = [];
            this.byHost.set(host, bucket);
          }
          bucket.push(script);
        }
      }
    }
  }

  /**
   * Return scripts whose @match/@include patterns *could* match `url`.
   * The result is a superset — callers must run `doesScriptMatchUrl` for
   * the authoritative answer.
   */
  getCandidates(url: any) {
    let hostname;
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      return this.universal.slice();
    }

    const seen = new Set();
    const out = [];
    for (const s of this.universal) {
      if (!seen.has(s)) { seen.add(s); out.push(s); }
    }

    let cursor = hostname;
    while (cursor) {
      const bucket = this.byHost.get(cursor);
      if (bucket) {
        for (const s of bucket) {
          if (!seen.has(s)) { seen.add(s); out.push(s); }
        }
      }
      const dot = cursor.indexOf('.');
      if (dot < 0) break;
      cursor = cursor.slice(dot + 1);
    }
    return out;
  }

  /**
   * Return scripts that actually match `url` after running candidates
   * through `doesScriptMatchUrl`.
   */
  getMatching(url: any) {
    return this.getCandidates(url).filter((s: any) => doesScriptMatchUrl(s, url));
  }
}

// Cached MatchSet — invalidated whenever the script set changes.
let _matchSetCache: any = null;
let _matchSetCacheVersion = 0;

function invalidateMatchSet() {
  _matchSetCache = null;
  _matchSetCacheVersion++;
}

if (typeof setScriptChangeListener === 'function') {
  setScriptChangeListener(invalidateMatchSet);
}

async function getMatchSet() {
  if (_matchSetCache) return _matchSetCache;
  const scripts = await ScriptStorage.getAll();
  _matchSetCache = new MatchSet(scripts);
  return _matchSetCache;
}

// ============================================================================
// Context Menu
// ============================================================================

async function setupContextMenus() {
  await chrome.contextMenus.removeAll();
  const settings = await SettingsManager.get();
  if (settings.enableContextMenu === false) return;

  chrome.contextMenus.create({
    id: 'scriptvault-new',
    title: 'Create script for this site',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'scriptvault-dashboard',
    title: 'Open ScriptVault Dashboard',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'scriptvault-toggle',
    title: 'Toggle all scripts',
    contexts: ['page']
  });

  // v2.0: Install from link — right-click a .user.js link to install
  chrome.contextMenus.create({
    id: 'scriptvault-install-link',
    title: 'Install userscript from link',
    contexts: ['link'],
    targetUrlPatterns: ['*://*/*.user.js', '*://*/*.user.js?*']
  });

  // Add context menu entries for @run-at context-menu scripts
  const scripts = await ScriptStorage.getAll();
  const contextScripts = scripts.filter((s: any) => s.enabled !== false && s.meta && s.meta['run-at'] === 'context-menu');
  if (contextScripts.length > 0) {
    chrome.contextMenus.create({
      id: 'scriptvault-separator',
      type: 'separator',
      contexts: ['page', 'selection', 'link', 'image']
    });
    for (const script of contextScripts) {
      chrome.contextMenus.create({
        id: `scriptvault-ctx-${script.id}`,
        // Phase 39.31 — pre-emptive clamp; Chrome visually ellipsises long
        // context-menu titles but the spec proposal may make oversize titles
        // an error in the future.
        title: _clampString(script.meta.name || script.id, SV_CONTEXT_MENU_TITLE_MAX),
        contexts: ['page', 'selection', 'link', 'image']
      });
    }
  }
}

async function openFirstRunSetupIfNeeded(details: any = {}) {
  if (details?.reason !== 'install') return;
  try {
    const status = await probeUserScriptsAvailability();
    if (status?.userScriptsAvailable === true) return;
    const url = chrome.runtime.getURL('pages/onboarding.html');
    await chrome.tabs.create({ url });
  } catch (error: any) {
    console.warn('[ScriptVault] First-run setup tab could not open:', error?.message || String(error));
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await openFirstRunSetupIfNeeded(details);
  setupContextMenus();

  // v2.0: Initialize backup scheduler (needs alarm registration on install)
  if (typeof BackupScheduler !== 'undefined') {
    try { await BackupScheduler.init(); } catch (e) { console.error('[ScriptVault] BackupScheduler init error:', e); }
  }

  // v2.0: Schedule notification digest (needs alarm registration on install)
  if (typeof NotificationSystem !== 'undefined') {
    try { await NotificationSystem.scheduleDigest(); } catch (e) { console.error('[ScriptVault] Digest schedule error:', e); }
  }

  // v2.0: Register public API listeners
  if (typeof PublicAPI !== 'undefined') {
    try { PublicAPI.init(); } catch (e) { console.error('[ScriptVault] PublicAPI init error:', e); }
  }

  // Note: Migration.run() is called in the main init() function, not here,
  // to avoid running it twice on install (onInstalled + init both fire).
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case 'scriptvault-new': {
      if (!tab?.url) break;
      try {
        const url = new URL(tab.url);
        chrome.tabs.create({
          url: `pages/dashboard.html?new=1&host=${encodeURIComponent(url.hostname)}`
        });
      } catch { chrome.tabs.create({ url: 'pages/dashboard.html?new=1' }); }
      break;
    }
    case 'scriptvault-dashboard':
      chrome.tabs.create({ url: 'pages/dashboard.html' });
      break;
    case 'scriptvault-toggle': {
      const settings = await SettingsManager.get();
      await SettingsManager.set('enabled', !settings.enabled);
      await registerAllScripts(true);
      await updateBadge();
      break;
    }
    case 'scriptvault-install-link': {
      // v2.0: Install userscript from a right-clicked .user.js link
      const linkUrl = info.linkUrl;
      if (linkUrl) {
        try {
          InternalHostGuard.assertExternalFetchUrl(linkUrl, 'Script source', ['http:', 'https:']);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 20000);
          let code;
          try {
            const response = await fetch(linkUrl, FetchFreshness.buildFreshnessInit('install', {
              init: { signal: controller.signal }
            }));
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const postCheck = InternalHostGuard.classifyResponseUrl(response, ['http:', 'https:']);
            if (!postCheck.ok) {
              throw new Error('Script source redirected to ' + postCheck.message);
            }
            code = await _fetchTextBounded(response, MAX_SCRIPT_SIZE, 'Script');
          } finally {
            // Keep the deadline alive through the response body. A server that
            // sends headers and then stalls must not pin the worker.
            clearTimeout(timeoutId);
          }
          if (code.includes('==UserScript==')) {
            const storageKey = _createPendingInstallStorageKey('context-menu');
            await _storePendingInstall(storageKey, { code, url: linkUrl });
            chrome.tabs.create({ url: _pendingInstallPageUrl(storageKey) });
          } else {
            chrome.notifications.create({
              type: 'basic', iconUrl: 'images/icon128.png',
              title: 'Not a Userscript',
              message: 'The linked file does not contain a valid ==UserScript== block.'
            });
          }
        } catch (e: any) {
          const message = e?.name === 'AbortError'
            ? 'Request timed out after 20 seconds'
            : e?.message || String(e);
          chrome.notifications.create({
            type: 'basic', iconUrl: 'images/icon128.png',
            title: 'Install Failed',
            message: `Could not fetch script: ${message}`
          });
        }
      }
      break;
    }
    default: {
      // Handle @run-at context-menu script execution
      if (info.menuItemId && typeof info.menuItemId === 'string' && info.menuItemId.startsWith('scriptvault-ctx-')) {
        const scriptId = info.menuItemId.replace('scriptvault-ctx-', '');
        const script = await ScriptStorage.get(scriptId);
        if (script && tab?.id) {
          try {
            // Build wrapped script with GM API support (same as auto-registered scripts)
            const meta = script.meta;
            const requires = Array.isArray(meta.require) ? meta.require : (meta.require ? [meta.require] : []);
            const requireScripts: any = [];
            for (const url of requires) {
              try {
                const code = await fetchRequireScript(url);
                if (code) requireScripts.push({ url, code });
              } catch (e) {}
            }
            const storedValues = await ScriptValues.getAll(script.id) || {};
            const scriptAuthToken = await UserScriptMessagePolicy.getScriptAuthToken(script.id);
            const wrappedCode = buildWrappedScript(script, requireScripts, storedValues, [], [], '', scriptAuthToken);
            // Execute in the USER_SCRIPT world like every other injection
            // path (page-load registration, @crontab, runScriptNow). The
            // MAIN-world fallback stays gated behind an explicit
            // @inject-into page / @sandbox raw declaration.
            const ctxInjectInto = meta['inject-into'] || 'auto';
            const ctxSandbox = meta.sandbox || '';
            const ctxWantsPage = (ctxInjectInto === 'page' || ctxSandbox === 'raw');
            await executeWrappedScriptInTab(tab.id, wrappedCode, ctxWantsPage, script?.id);
            // Feedback notification
            const settings = await SettingsManager.get();
            if (settings.notifyOnError !== false) {
              chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: 'Script Executed',
                message: `${script.meta.name} ran via context menu`
              });
            }
          } catch (e: any) {
            console.error(`[ScriptVault] Context-menu script execution failed:`, e);
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'images/icon128.png',
              title: 'Script Failed',
              message: `${script.meta.name}: ${e.message || 'Unknown error'}`
            });
          }
        }
      }
      break;
    }
  }
});

// ============================================================================
// Keyboard Shortcuts
// ============================================================================

chrome.commands.onCommand.addListener(async (command) => {
  try { await ensureInitialized(); } catch (_) { /* logged in init() */ }
  switch (command) {
    case 'open_dashboard':
      chrome.tabs.create({ url: 'pages/dashboard.html' });
      break;
    case 'toggle_scripts': {
      const settings = await SettingsManager.get();
      await SettingsManager.set('enabled', !settings.enabled);
      await registerAllScripts(true);
      await updateBadge();

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'images/icon128.png',
        title: 'ScriptVault',
        message: settings.enabled ? 'Scripts disabled' : 'Scripts enabled'
      });
      break;
    }
  }
});

// ============================================================================
// Phase 39.29 — Omnibox keyword "sv"
// ============================================================================
// Type `sv ` in the address bar, then a fragment of any installed script's
// name or @tag. Suggestions surface inline; Enter opens the script in the
// dashboard editor. Chrome 149+ stabilized the Omnibox API for MV3 SW
// contexts (previously the listeners required a DOM-backed page).
//
// Suggestion budget: Chrome shows at most ~6 suggestions; we cap our matches
// at 8 to leave room for default-suggestion render slop. Matching is a simple
// case-insensitive substring across name + namespace + tags — Phase 12.2's
// fuzzy index isn't wired through to the SW yet.

if (chrome.omnibox?.onInputChanged) {
  chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
    try { await ensureInitialized(); } catch (_) { /* logged in init() */ }
    const query = (text || '').trim().toLowerCase();
    if (!query) {
      suggest([]);
      return;
    }
    try {
      const scripts = await ScriptStorage.getAll();
      const matches = [];
      for (const s of scripts) {
        const name = (s.meta?.name || '').toLowerCase();
        const ns = (s.meta?.namespace || '').toLowerCase();
        const tags = Array.isArray(s.meta?.tag) ? s.meta.tag.map((t: any) => String(t).toLowerCase()) : [];
        if (name.includes(query) || ns.includes(query) || tags.some((t: any) => t.includes(query))) {
          matches.push(s);
          if (matches.length >= 8) break;
        }
      }
      suggest(matches.map(s => ({
        // `content` is the value that becomes the URL bar text on Enter; we
        // encode the script ID so onInputEntered can dispatch without a
        // second lookup.
        content: `id:${s.id}`,
        // `description` is HTML-allowed but limited — clamp the script name
        // through the same WECG #935 string-length guard used for context-
        // menu titles.
        description: `<match>${_clampString((s.meta?.name || s.id), SV_CONTEXT_MENU_TITLE_MAX)}</match>` +
          (s.meta?.version ? ` <dim>v${escapeOmnibox(s.meta.version)}</dim>` : '') +
          (s.enabled === false ? ' <dim>(disabled)</dim>' : '')
      })));
    } catch (e: any) {
      console.warn('[ScriptVault] Omnibox onInputChanged failed:', e?.message || e);
      suggest([]);
    }
  });

  chrome.omnibox.onInputEntered.addListener(async (text, _disposition) => {
    try { await ensureInitialized(); } catch (_) { /* logged in init() */ }
    let scriptId = null;
    const m: any = (text || '').match(/^id:(.+)$/);
    if (m) {
      scriptId = m[1].trim();
    } else {
      // User typed a query and hit Enter without picking a suggestion — open
      // the dashboard with the search pre-filled.
      chrome.tabs.create({ url: `pages/dashboard.html?search=${encodeURIComponent(text || '')}` });
      return;
    }
    chrome.tabs.create({ url: `pages/dashboard.html#script/${encodeURIComponent(scriptId)}` });
  });
}

// Minimal HTML-entity escape for omnibox description strings. The omnibox
// renderer accepts a small XML subset (<match>, <dim>, <url>); content
// outside those tags must be escaped or Chrome silently drops the suggestion.
function escapeOmnibox(s: any) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============================================================================
// Alarms (Auto-update & Sync)
// ============================================================================

// Stats save coalescing — chrome.alarms instead of setTimeout so the debounce
// survives MV3 service-worker termination. Minimum delayInMinutes is 0.5 in
// production (Chrome enforces a 30s floor for non-development extensions); in
// dev builds the smaller value below applies.
const STATS_SAVE_ALARM = 'statsSave';
const AUTO_SYNC_ALARM = 'autoSync';
const SYNC_RATE_LIMIT_BACKOFF_STORAGE_KEY = 'syncRateLimitBackoffUntil';
const SYNC_RATE_LIMIT_BACKOFF_MAX_MS = 6 * 60 * 60 * 1000;

function _syncAlarmPeriodMinutes(settings: any = {}) {
  const syncMs = Number(settings.syncInterval || 3600000);
  return Math.max(1, syncMs / 60000);
}

async function _scheduleAutoSyncRateLimitBackoff(retryAfterMs: any) {
  const delayMs = Math.min(
    SYNC_RATE_LIMIT_BACKOFF_MAX_MS,
    Math.max(1000, Number(retryAfterMs) || 60000),
  );
  const when = Date.now() + delayMs;
  try { await chrome.storage.local.set({ [SYNC_RATE_LIMIT_BACKOFF_STORAGE_KEY]: when }); } catch (_) {}
  try { await Promise.resolve(chrome.alarms.clear(AUTO_SYNC_ALARM)); } catch (_) {}
  try { await Promise.resolve(chrome.alarms.create(AUTO_SYNC_ALARM, { when })); } catch (_) {}
}

async function _restoreAutoSyncAlarm(settings: any = {}) {
  if (settings.syncEnabled && settings.syncProvider !== 'none') {
    try {
      await Promise.resolve(chrome.alarms.create(AUTO_SYNC_ALARM, {
        periodInMinutes: _syncAlarmPeriodMinutes(settings),
      }));
    } catch (_) {}
  }
}

// Apply the user's execution-stats URL retention setting before a lastUrl is
// stored. 'full' keeps the whole URL when explicitly selected, 'origin' keeps
// only the scheme+host, and 'none' stores nothing. This keeps potentially
// sensitive browsing history out of local stats in a zero-telemetry product.
function _retainStatsUrl(url: any, mode: any) {
  if (!url || typeof url !== 'string') return '';
  if (mode === 'none') return '';
  if (mode !== 'full') {
    try { return new URL(url).origin; } catch (_) { return ''; }
  }
  return url;
}

function _debouncedStatsSave() {
  // delayInMinutes 0.1 = 6s in unpacked dev; production extensions clamp to 30s.
  // ScriptStorage.save is idempotent, so creating the alarm repeatedly while
  // pending only resets the timer — that's the intended debounce.
  try {
    chrome.alarms.create(STATS_SAVE_ALARM, { delayInMinutes: 0.1 });
  } catch (_) { /* alarms unavailable (e.g. SW shutting down) — drop the write */ }
}

let _backgroundTaskRunning = false;
let _backgroundTaskToken = 0;

async function tryOpenPopup(reason: any) {
  if (typeof chrome.action?.openPopup !== 'function') return;
  try {
    if (chrome.storage.session?.set) {
      await chrome.storage.session.set({ sv_popup_open_reason: reason });
    }
    await chrome.action.openPopup();
  } catch (_) {
    // Chrome requires a user gesture; Firefox 150+ allows this from alarms.
    // Swallow the error — the notification already informed the user.
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  // Cold-start: an alarm can wake the SW before init() finishes. Wait for it
  // so handlers below see a fully-initialised ScriptStorage / SettingsManager.
  try { await ensureInitialized(); } catch (_) { /* logged in init() */ }

  // Stats save (coalesces rapid reportExecTime/Error writes)
  if (alarm.name === STATS_SAVE_ALARM) {
    try { await ScriptStorage.save(); } catch (_) { /* non-critical */ }
    return;
  }

  // Handle notification auto-close alarms
  if (alarm.name.startsWith('notif_clear_')) {
    const notifId = alarm.name.slice('notif_clear_'.length);
    chrome.notifications.clear(notifId).catch(() => {});
    if (self._notifCallbacks) {
      self._notifCallbacks.delete(notifId);
      SessionState.persistNotifCallbacks();
    }
    return;
  }

  // Handle notification context cleanup alarms
  if (alarm.name.startsWith('notifCtx_clean_')) {
    const notifId = alarm.name.slice('notifCtx_clean_'.length);
    chrome.storage.local.remove(`notifCtx_${notifId}`).catch(() => {});
    return;
  }

  if (alarm.name.startsWith(GM_DOWNLOAD_TIMEOUT_ALARM_PREFIX)) {
    const downloadId = alarm.name.slice(GM_DOWNLOAD_TIMEOUT_ALARM_PREFIX.length);
    await handlePendingDownloadTimeoutAlarm(downloadId);
    return;
  }

  if (alarm.name.startsWith(GM_DOWNLOAD_SAFETY_ALARM_PREFIX)) {
    const downloadId = alarm.name.slice(GM_DOWNLOAD_SAFETY_ALARM_PREFIX.length);
    cleanupPendingDownload(downloadId, { clearAlarms: false });
    return;
  }

  if (alarm.name.startsWith('sv_task_safety_')) {
    _backgroundTaskRunning = false;
    return;
  }

  // Handle @crontab script execution alarms (independent of the update/sync mutex)
  if (alarm.name.startsWith('crontab_')) {
    const scriptId = alarm.name.slice('crontab_'.length);
    handleCrontabAlarm(scriptId).catch(e => console.error('[ScriptVault] Crontab alarm error:', e));
    return;
  }

  // Handle dashboard-scheduler interval/oneTime alarms
  if (alarm.name.startsWith(SCHEDULE_ALARM_PREFIX)) {
    const scriptId = alarm.name.slice(SCHEDULE_ALARM_PREFIX.length);
    handleScheduleAlarm(scriptId).catch(e => console.error('[ScriptVault] Schedule alarm error:', e));
    return;
  }

  if (alarm.name.startsWith(CHAIN_ALARM_PREFIX)) {
    const chainId = alarm.name.slice(CHAIN_ALARM_PREFIX.length);
    executeChainById(chainId, { reason: 'schedule' }).catch(e => console.error('[ScriptVault] Chain alarm error:', e));
    return;
  }

  // Delegate to NotificationSystem for weekly-digest + internal context alarms.
  // Without this dispatch the `scriptvault-weekly-digest` alarm would fire into
  // nothing (the branches below only handle autoUpdate/autoSync), so the digest
  // notification — which users explicitly opt into via prefs.digest — would
  // silently never generate.
  if (typeof NotificationSystem !== 'undefined' && typeof NotificationSystem.handleAlarm === 'function') {
    try {
      const handled = await NotificationSystem.handleAlarm(alarm);
      if (handled) return;
    } catch (e) {
      console.error('[ScriptVault] NotificationSystem alarm error:', e);
    }
  }

  // Mutual exclusion — don't run update and sync concurrently
  if (_backgroundTaskRunning) {
    debugLog('Skipping alarm', alarm.name, '- another task is running');
    return;
  }
  _backgroundTaskRunning = true;
  // Safety timeout: release mutex after 5 minutes even if the task hangs.
  // Each task gets a unique token so the late-finishing task can tell whether
  // the safety timer has already released the mutex for the next task — if so,
  // the stale finally block must NOT clobber the new task's `true` flag.
  const myToken = ++_backgroundTaskToken;
  const safetyAlarmName = `sv_task_safety_${myToken}`;
  chrome.alarms.create(safetyAlarmName, { delayInMinutes: 5 });
  try {
    if (alarm.name === 'autoUpdate') {
      await UpdateSystem.autoUpdate();
    } else if (alarm.name === 'autoSync') {
      const backoffData: Record<string, any> = await chrome.storage.local
        .get(SYNC_RATE_LIMIT_BACKOFF_STORAGE_KEY)
        .catch(() => ({} as Record<string, any>));
      const backoffUntil = Number(backoffData?.[SYNC_RATE_LIMIT_BACKOFF_STORAGE_KEY] || 0);
      if (backoffUntil > Date.now()) {
        await _scheduleAutoSyncRateLimitBackoff(backoffUntil - Date.now());
        return;
      }
      if (backoffUntil > 0) {
        await chrome.storage.local.remove(SYNC_RATE_LIMIT_BACKOFF_STORAGE_KEY).catch(() => {});
      }
      const result = await CloudSync.sync();
      // Persist the scheduled result too. Only the manual path used to record
      // it, so getLastSyncResult and the sync cockpit reported the last MANUAL
      // sync: a background sync failing every cycle (expired refresh token,
      // quota, endpoint down) produced nothing but a console.error while the
      // UI still showed the last successful manual run.
      await persistLastSyncResult(result);
      await maybeRegisterScriptsAfterSuccessfulSync(result);
      if (result?.rateLimited === true) {
        await _scheduleAutoSyncRateLimitBackoff(result.retryAfterMs);
      } else {
        await _restoreAutoSyncAlarm(await SettingsManager.get());
      }
    } else if (alarm.name === SUBSCRIPTION_REFRESH_ALARM) {
      await SubscriptionSystem.refreshSubscriptions();
    }
  } catch (e) {
    console.error('[ScriptVault] Alarm handler error:', e);
  } finally {
    chrome.alarms.clear(safetyAlarmName).catch(() => {});
    if (_backgroundTaskToken === myToken) _backgroundTaskRunning = false;
  }
});

// ============================================================================
// @crontab Support
// ============================================================================

const CRON_MONTH_NAMES = Object.freeze({
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
});
const CRON_DOW_NAMES = Object.freeze({
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6
});
const CRON_MAX_SEARCH_MINUTES = 366 * 24 * 60 * 5;
const CRONTAB_ONCE_FIRED_STORAGE_KEY = 'sv_crontab_once_fired';

function normalizeCrontabExpression(expr: any) {
  return String(expr || '').trim().replace(/\s+/g, ' ');
}

function parseCrontabDirective(expr: any) {
  if (!expr || typeof expr !== 'string') return { ok: false, error: 'missing expression' };
  const normalized = normalizeCrontabExpression(expr);
  if (!normalized) return { ok: false, error: 'missing expression' };
  const onceMatch = normalized.match(/^once\(([\s\S]+)\)$/i);
  if (onceMatch) {
    const inner = normalizeCrontabExpression(onceMatch[1]);
    if (!inner) return { ok: false, error: 'missing once() expression' };
    return { ok: true, once: true, expression: inner };
  }
  if (/^once\s*\(/i.test(normalized)) {
    return { ok: false, error: 'invalid once() expression wrapper' };
  }
  return { ok: true, once: false, expression: normalized };
}

function normalizeCronFieldValue(value: any, names: any, allowSevenAsSunday: any = false) {
  const token = String(value || '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(names || {}, token)) return names[token];
  if (!/^\d+$/.test(token)) return null;
  const parsed = parseInt(token, 10);
  return parsed;
}

function parseCronField(field: any, min: any, max: any, options: any = {}) {
  const names = options.names || {};
  const allowSevenAsSunday = !!options.allowSevenAsSunday;
  const text = String(field || '').trim().toLowerCase();
  const values = new Set<number>();
  if (!text) return { ok: false, error: 'empty field' };

  const addValue = (value: any) => {
    const normalized = allowSevenAsSunday && value === 7 ? 0 : value;
    if (!Number.isInteger(normalized) || normalized < min || normalized > max) return false;
    values.add(normalized);
    return true;
  };

  for (const part of text.split(',')) {
    if (!part) return { ok: false, error: `empty list item in "${field}"` };
    const [rangePart, stepPart] = part.split('/');
    if (!rangePart) return { ok: false, error: `invalid range in "${part}"` };
    if (part.split('/').length > 2) return { ok: false, error: `invalid step in "${part}"` };
    const step = stepPart == null ? 1 : parseInt(stepPart, 10);
    if (!Number.isInteger(step) || step < 1) return { ok: false, error: `invalid step in "${part}"` };

    let start;
    let end;
    if (rangePart === '*') {
      start = min;
      end = max;
    } else if (rangePart.includes('-')) {
      const [rawStart, rawEnd] = rangePart.split('-');
      if (!rawStart || !rawEnd || rangePart.split('-').length !== 2) {
        return { ok: false, error: `invalid range in "${part}"` };
      }
      start = normalizeCronFieldValue(rawStart, names, allowSevenAsSunday);
      end = normalizeCronFieldValue(rawEnd, names, allowSevenAsSunday);
    } else {
      start = normalizeCronFieldValue(rangePart, names, allowSevenAsSunday);
      end = start;
    }

    if (start == null || end == null) return { ok: false, error: `invalid value in "${part}"` };
    if (start < min || start > max || end < min || end > max || start > end) {
      return { ok: false, error: `out-of-range value in "${part}"` };
    }
    for (let value = start; value <= end; value += step) {
      if (!addValue(value)) return { ok: false, error: `out-of-range value in "${part}"` };
    }
  }

  if (!values.size) return { ok: false, error: `no values in "${field}"` };
  return {
    ok: true,
    any: text === '*',
    values: [...values].sort((a, b) => a - b)
  };
}

function parseCronExpression(expr: any) {
  const directive: any = parseCrontabDirective(expr);
  if (!directive.ok) return directive;
  const parts = directive.expression.split(/\s+/);
  if (parts.length !== 5) return { ok: false, error: 'expected 5 fields: minute hour day-of-month month day-of-week' };
  const [minute, hour, dom, month, dow] = parts;
  const parsed = {
    minute: parseCronField(minute, 0, 59),
    hour: parseCronField(hour, 0, 23),
    dom: parseCronField(dom, 1, 31),
    month: parseCronField(month, 1, 12, { names: CRON_MONTH_NAMES }),
    dow: parseCronField(dow, 0, 7, { names: CRON_DOW_NAMES, allowSevenAsSunday: true })
  };
  for (const [field, result] of Object.entries(parsed)) {
    if (!result.ok) return { ok: false, error: `${field}: ${result.error}` };
  }
  return { ok: true, schedule: parsed, once: directive.once, expression: directive.expression };
}

function cronMatchesDate(schedule: any, date: any) {
  if (!schedule || !(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dom = date.getDate();
  const month = date.getMonth() + 1;
  const dow = date.getDay();
  if (!schedule.minute.values.includes(minute)) return false;
  if (!schedule.hour.values.includes(hour)) return false;
  if (!schedule.month.values.includes(month)) return false;

  const domMatches = schedule.dom.values.includes(dom);
  const dowMatches = schedule.dow.values.includes(dow);
  if (schedule.dom.any && schedule.dow.any) return true;
  if (schedule.dom.any) return dowMatches;
  if (schedule.dow.any) return domMatches;
  return domMatches || dowMatches;
}

function nextCronFire(expr: any, from: any = new Date()) {
  const parsed: any = parseCronExpression(expr);
  if (!parsed.ok) return parsed;
  const candidate = new Date(from.getTime());
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);
  for (let i = 0; i < CRON_MAX_SEARCH_MINUTES; i++) {
    if (cronMatchesDate(parsed.schedule, candidate)) {
      return { ok: true, when: candidate.getTime(), date: new Date(candidate.getTime()), once: parsed.once, expression: parsed.expression };
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
  }
  return { ok: false, error: 'no matching fire time within 5 years' };
}

function getCrontabAlarmName(scriptId: any) {
  return 'crontab_' + scriptId;
}

function getCrontabOnceMarker(script: any) {
  const directive = parseCrontabDirective(script?.meta?.crontab);
  if (!directive.ok || !directive.once || !script?.id) return '';
  return `${script.id}:${directive.expression.toLowerCase()}`;
}

async function getCrontabOnceFiredMap() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local?.get) return {};
  try {
    const data = await chrome.storage.local.get(CRONTAB_ONCE_FIRED_STORAGE_KEY);
    const map = data?.[CRONTAB_ONCE_FIRED_STORAGE_KEY];
    return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  } catch (_) {
    return {};
  }
}

async function setCrontabOnceFiredMap(map: any) {
  if (typeof chrome === 'undefined' || !chrome.storage?.local?.set) return;
  await chrome.storage.local.set({ [CRONTAB_ONCE_FIRED_STORAGE_KEY]: map });
}

async function hasCrontabOnceFired(script: any) {
  const marker = getCrontabOnceMarker(script);
  if (!marker) return false;
  const map = await getCrontabOnceFiredMap();
  return !!map[marker];
}

async function markCrontabOnceFired(script: any, firedAt: any = Date.now()) {
  const marker = getCrontabOnceMarker(script);
  if (!marker) return;
  const map = await getCrontabOnceFiredMap();
  map[marker] = {
    firedAt,
    expression: parseCrontabDirective(script?.meta?.crontab).expression
  };
  await setCrontabOnceFiredMap(map);
}

async function clearCrontabOnceMarkersForScript(scriptId: any) {
  if (!scriptId) return;
  const map = await getCrontabOnceFiredMap();
  const prefix = `${scriptId}:`;
  let changed = false;
  for (const key of Object.keys(map)) {
    if (key.startsWith(prefix)) {
      delete map[key];
      changed = true;
    }
  }
  if (changed) await setCrontabOnceFiredMap(map);
}

async function scheduleCrontabAlarm(script: any, from: any = new Date()) {
  const alarmName = getCrontabAlarmName(script.id);
  const next: any = nextCronFire(script.meta?.crontab, from);
  if (!next.ok) {
    debugLog(`Invalid @crontab for ${script.meta?.name || script.id}: ${next.error}`);
    return next;
  }
  if (next.once && await hasCrontabOnceFired(script)) {
    await chrome.alarms.clear(alarmName).catch(() => {});
    debugLog(`Skipped one-time @crontab already fired: ${script.meta?.name || script.id}`);
    return { ...next, skipped: true, reason: 'already fired' };
  }
  chrome.alarms.create(alarmName, { when: next.when });
  debugLog(`Registered @crontab: ${script.meta?.name || script.id} next ${next.date.toISOString()}`);
  return next;
}

/**
 * Configure a per-script USER_SCRIPT world and return its id, or '' when the
 * engine has no worldId support.
 *
 * registerScript isolates every script in its own world, but the on-demand
 * injection paths (Run on This Tab, chains, @crontab, context-menu scripts)
 * called execute() with no worldId, so they all landed in the single default
 * world. Each wrapped body embeds that script's scriptAuthToken and sends it
 * through the global chrome.runtime.sendMessage, so a script reaching the
 * shared world first could shadow sendMessage and harvest a co-resident
 * script's token — which authenticateUserScriptSender accepts as proof of
 * identity, giving access to that script's GM values, @connect allowlist, and
 * cookie host scope.
 */
async function ensureExecutionWorldId(scriptId: any): Promise<string> {
  if (!scriptId) return '';
  if (!await _ensureUserScriptWorldIdSupport()) return '';
  const worldId = _userScriptWorldIdFor(scriptId);
  if (!worldId) return '';
  try {
    await chrome.userScripts.configureWorld({
      worldId,
      csp: "script-src 'self' 'unsafe-inline' 'unsafe-eval' *",
      messaging: true
    });
    return worldId;
  } catch (e: any) {
    // The engine claimed support and then refused this world. Sharing the
    // default world is a real isolation loss, so say so rather than degrading
    // silently — see _recordWorldIsolationLoss.
    debugWarn('[ScriptVault] On-demand world config failed for', scriptId, e?.message || e);
    return '';
  }
}

async function executeWrappedScriptInTab(tabId: any, wrappedCode: any, wantsPageContext: any, scriptId: any = undefined) {
  if (typeof chrome.userScripts?.execute === 'function') {
    const worldId = await ensureExecutionWorldId(scriptId);
    try {
      await chrome.userScripts.execute({
        target: { tabId },
        js: [{ code: wrappedCode }],
        world: 'USER_SCRIPT',
        ...(worldId ? { worldId } : {})
      });
      return 'userScripts.execute';
    } catch (e: any) {
      debugLog('userScripts.execute failed, falling back:', e?.message);
    }
  }

  if (!wantsPageContext) {
    throw new Error('chrome.userScripts.execute is unavailable and this script does not declare @inject-into page — MAIN-world fallback blocked to preserve USER_SCRIPT isolation');
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: ((code: any) => {
      try { (0, eval)(code); } catch (err) { console.error('[ScriptVault]', err); }
    }) as any,
    args: [wrappedCode]
  });
  return 'scripting.executeScript';
}

/** Execute a @crontab script in all currently-open matching tabs. */
async function handleCrontabAlarm(scriptId: any) {
  const script = await ScriptStorage.get(scriptId);
  if (!script || !script.enabled || !script.meta?.crontab) {
    chrome.alarms.clear(getCrontabAlarmName(scriptId)).catch(() => {});
    return;
  }

  const cronPlan = parseCronExpression(script.meta.crontab);
  if (cronPlan.ok && cronPlan.once) {
    await chrome.alarms.clear(getCrontabAlarmName(scriptId)).catch(() => {});
    await markCrontabOnceFired(script);
  } else {
    await scheduleCrontabAlarm(script);
  }

  const meta = script.meta;
  const hasMatches = (meta.match && meta.match.length > 0) || (meta.include && meta.include.length > 0);
  if (!hasMatches) {
    debugLog(`@crontab script ${meta.name} has no @match patterns, skipping`);
    return;
  }

  // Fetch @require scripts
  const requireScripts: any = [];
  const requires = Array.isArray(meta.require) ? meta.require : (meta.require ? [meta.require] : []);
  for (const url of requires) {
    try {
      const code = await fetchRequireScript(url);
      if (code) requireScripts.push({ url, code });
    } catch (e) {}
  }

  const storedValues = await ScriptValues.getAll(script.id) || {};
  // Extract regex @include/@exclude patterns for runtime URL guard in wrapper
  const regexIncludes: any = [];
  const regexExcludes = [];
  for (const inc of (meta.include || [])) {
    if (/^\/.*\/$|^\/.*\/[gimsuy]+$/.test(inc)) regexIncludes.push(inc);
  }
  for (const exc of (meta.exclude || [])) {
    if (/^\/.*\/$|^\/.*\/[gimsuy]+$/.test(exc)) regexExcludes.push(exc);
  }
  const scriptAuthToken = await UserScriptMessagePolicy.getScriptAuthToken(script.id);
  const wrappedCode = buildWrappedScript(script, requireScripts, storedValues, regexIncludes, regexExcludes, '', scriptAuthToken);
  const crontabInjectInto = meta['inject-into'] || 'auto';
  const crontabSandbox = meta.sandbox || '';
  const crontabWantsPage = (crontabInjectInto === 'page' || crontabSandbox === 'raw');

  const tabs = await chrome.tabs.query({ status: 'complete' });
  for (const tab of tabs) {
    if (!tab.url || !tab.id) continue;
    if (!doesScriptMatchUrl(script, tab.url)) continue;
    try {
      const mode = await executeWrappedScriptInTab(tab.id, wrappedCode, crontabWantsPage, script?.id);
      debugLog(`@crontab ${meta.name}: executed in tab ${tab.id} via ${mode}`);
    } catch (e: any) {
      debugLog(`@crontab ${meta.name}: failed in tab ${tab.id}: ${e.message}`);
    }
  }
}

/** Create/refresh chrome alarms for all enabled @crontab scripts. */
async function setupCrontabAlarms() {
  const scripts = await ScriptStorage.getAll();
  for (const script of scripts) {
    const alarmName = getCrontabAlarmName(script.id);
    await chrome.alarms.clear(alarmName).catch(() => {});
    if (script.enabled && script.meta?.crontab) {
      await scheduleCrontabAlarm(script);
    }
  }
}

// ============================================================================
// Dashboard Script Scheduler enforcement (sv_schedules / sv_sched_ alarms)
// ============================================================================
// The dashboard scheduler (pages/dashboard-scheduler.js) stores per-script
// schedules under chrome.storage.local['sv_schedules'] and creates
// `sv_sched_<id>` alarms for interval/oneTime schedules. This is the missing
// background half: it fires those alarms (interval/oneTime) and injects a
// runtime guard so time/day/dateRange schedules only execute inside their
// window. interval/oneTime schedules skip page-load registration entirely and
// run only on the alarm — the same model as @crontab.

const SCHEDULE_STORAGE_KEY = 'sv_schedules';
const SCHEDULE_ALARM_PREFIX = 'sv_sched_';
const SCHEDULE_ALARM_TYPES = new Set(['interval', 'oneTime']);
const SCHEDULE_GUARD_TYPES = new Set(['time', 'day', 'dateRange']);

async function getScheduleMap() {
  try {
    const data = await chrome.storage.local.get(SCHEDULE_STORAGE_KEY);
    const map = data[SCHEDULE_STORAGE_KEY];
    return (map && typeof map === 'object') ? map : {};
  } catch (_) {
    return {};
  }
}

async function getScheduleForScript(scriptId: any) {
  const map = await getScheduleMap();
  const sched = map[scriptId];
  return (sched && typeof sched === 'object' && sched.enabled) ? sched : null;
}

/**
 * Build the schedule guard function definition injected into a wrapped script.
 * Defines `__svScheduleOk()` returning whether the script may run right now.
 * Uses LOCAL date components (not toISOString/UTC) so date-range boundaries
 * match the user's calendar day.
 */
function buildScheduleGuardFn(sched: any) {
  const s = JSON.stringify(sched);
  return `function __svScheduleOk(){try{var __s=${s};if(!__s||!__s.enabled)return true;`
    + `var n=new Date();var day=n.getDay();var mins=n.getHours()*60+n.getMinutes();`
    + `var ymd=n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');`
    + `function __t(t){if(!t)return 0;var p=String(t).split(':');return (parseInt(p[0],10)||0)*60+(parseInt(p[1],10)||0);}`
    + `switch(__s.type){`
    + `case 'time':{if(__s.days&&__s.days.length>0&&__s.days.indexOf(day)===-1)return false;var a=__t(__s.timeStart),b=__t(__s.timeEnd);if(a<=b)return mins>=a&&mins<=b;return mins>=a||mins<=b;}`
    + `case 'day':return !!(__s.days&&__s.days.indexOf(day)!==-1);`
    + `case 'dateRange':{if(__s.dateStart&&ymd<__s.dateStart)return false;if(__s.dateEnd&&ymd>__s.dateEnd)return false;return true;}`
    + `default:return true;}}catch(e){return true;}}`;
}

/** Execute a scheduled script on all currently-open matching tabs. */
async function handleScheduleAlarm(scriptId: any) {
  const sched = await getScheduleForScript(scriptId);
  const script = await ScriptStorage.get(scriptId);
  if (!script || !script.enabled || !sched || !SCHEDULE_ALARM_TYPES.has(sched.type)) {
    await chrome.alarms.clear(SCHEDULE_ALARM_PREFIX + scriptId).catch(() => {});
    return;
  }

  const meta = script.meta;
  const hasMatches = (meta.match && meta.match.length > 0) || (meta.include && meta.include.length > 0);
  if (hasMatches) {
    const requireScripts: any = [];
    const requires = Array.isArray(meta.require) ? meta.require : (meta.require ? [meta.require] : []);
    for (const url of requires) {
      try { const code = await fetchRequireScript(url); if (code) requireScripts.push({ url, code }); } catch (_e) {}
    }
    const storedValues = await ScriptValues.getAll(script.id) || {};
    const regexIncludes: any = [];
    const regexExcludes = [];
    for (const inc of (meta.include || [])) { if (/^\/.*\/$|^\/.*\/[gimsuy]+$/.test(inc)) regexIncludes.push(inc); }
    for (const exc of (meta.exclude || [])) { if (/^\/.*\/$|^\/.*\/[gimsuy]+$/.test(exc)) regexExcludes.push(exc); }
    const scriptAuthToken = await UserScriptMessagePolicy.getScriptAuthToken(script.id);
    const wrappedCode = buildWrappedScript(script, requireScripts, storedValues, regexIncludes, regexExcludes, '', scriptAuthToken);
    const injectInto = meta['inject-into'] || 'auto';
    const wantsPage = (injectInto === 'page' || (meta.sandbox || '') === 'raw');
    const tabs = await chrome.tabs.query({ status: 'complete' });
    for (const tab of tabs) {
      if (!tab.url || !tab.id) continue;
      if (!doesScriptMatchUrl(script, tab.url)) continue;
      try {
        const mode = await executeWrappedScriptInTab(tab.id, wrappedCode, wantsPage, script?.id);
        debugLog(`sv_sched ${meta.name}: executed in tab ${tab.id} via ${mode}`);
      } catch (e: any) {
        debugLog(`sv_sched ${meta.name}: failed in tab ${tab.id}: ${e.message}`);
      }
    }
  }

  // One-time schedules disable themselves after firing (matches the preview
  // copy "run once … then disable") and drop their alarm.
  if (sched.type === 'oneTime') {
    try {
      const map = await getScheduleMap();
      if (map[scriptId]) {
        map[scriptId] = { ...map[scriptId], enabled: false };
        await chrome.storage.local.set({ [SCHEDULE_STORAGE_KEY]: map });
      }
    } catch (_e) {}
    await chrome.alarms.clear(SCHEDULE_ALARM_PREFIX + scriptId).catch(() => {});
  }
}

/** Create/refresh chrome alarms for enabled interval/oneTime schedules. */
async function setupScheduleAlarms() {
  const existing = await chrome.alarms.getAll().catch(() => []);
  for (const alarm of existing) {
    if (alarm.name.startsWith(SCHEDULE_ALARM_PREFIX)) {
      await chrome.alarms.clear(alarm.name).catch(() => {});
    }
  }
  const map = await getScheduleMap();
  for (const [scriptId, sched] of Object.entries(map) as Array<[string, any]>) {
    if (!sched || !sched.enabled) continue;
    const name = SCHEDULE_ALARM_PREFIX + scriptId;
    if (sched.type === 'interval') {
      const periodMinutes = sched.intervalUnit === 'hours'
        ? (sched.interval || 1) * 60
        : (sched.interval || 1);
      await chrome.alarms.create(name, { delayInMinutes: periodMinutes, periodInMinutes: periodMinutes });
    } else if (sched.type === 'oneTime' && sched.oneTime) {
      const when = new Date(sched.oneTime).getTime();
      if (when > Date.now()) await chrome.alarms.create(name, { when });
    }
  }
}

// ============================================================================
// Dashboard chain trigger engine (sv_chains / sv_chain_ alarms)
// ============================================================================

const CHAIN_STORAGE_KEY = 'sv_chains';
const CHAIN_LOG_KEY = 'sv_chain_logs';
const CHAIN_ALARM_PREFIX = 'sv_chain_';
const CHAIN_MAX_LOG_ENTRIES = 500;
const CHAIN_MAX_DELAY_MS = 10000;
const CHAIN_DOM_EVENT_LIMIT = 20;
const _runningChainIds = new Set();

async function getChainMap() {
  try {
    const data = await chrome.storage.local.get(CHAIN_STORAGE_KEY);
    const map = data[CHAIN_STORAGE_KEY];
    return (map && typeof map === 'object') ? map : {};
  } catch (_) {
    return {};
  }
}

function normalizeChainEntry(id: any, chain: any) {
  if (!chain || typeof chain !== 'object') return null;
  return { ...chain, id: chain.id || id };
}

async function getChainById(chainId: any) {
  const map = await getChainMap();
  return normalizeChainEntry(chainId, map[chainId]);
}

function getRunnableChains(map: any) {
  return Object.entries(map)
    .map(([id, chain]) => normalizeChainEntry(id, chain))
    .filter(chain => chain && chain.enabled !== false && Array.isArray(chain.steps) && chain.steps.length > 0);
}

function splitChainTriggerValues(value: any) {
  return String(value || '')
    .split(/[\n,]+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function chainTriggerType(chain: any) {
  return chain?.trigger?.type || 'manual';
}

function chainTriggerValue(chain: any) {
  return String(chain?.trigger?.value || '').trim();
}

function chainTriggerPatternMatches(pattern: any, url: any) {
  if (!pattern || !url) return false;
  try {
    const urlObj = new URL(url);
    return matchPattern(pattern, url, urlObj) || matchIncludePattern(pattern, url, urlObj);
  } catch (_) {
    return false;
  }
}

function chainMatchesUrlTrigger(chain: any, url: any) {
  if (chainTriggerType(chain) !== 'url') return false;
  const patterns = splitChainTriggerValues(chainTriggerValue(chain));
  return patterns.some(pattern => chainTriggerPatternMatches(pattern, url));
}

function parseChainDomEventTrigger(value: any) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const [eventType, ...patterns] = raw.split(/\s+/);
  if (!/^[A-Za-z][\w:.-]{0,63}$/.test(eventType || '')) return null;
  return { eventType, patterns: patterns.filter(Boolean) };
}

function chainMatchesDomEventTrigger(chain: any, eventType: any, url: any) {
  if (chainTriggerType(chain) !== 'event') return false;
  const trigger = parseChainDomEventTrigger(chainTriggerValue(chain));
  if (!trigger || trigger.eventType !== eventType) return false;
  if (trigger.patterns.length === 0) return true;
  return trigger.patterns.some(pattern => chainTriggerPatternMatches(pattern, url));
}

function chainMatchesAfterScriptTrigger(chain: any, scriptId: any) {
  if (chainTriggerType(chain) !== 'afterScript') return false;
  return chainTriggerValue(chain) === String(scriptId || '');
}

function parseChainScheduleMinutes(value: any) {
  const minutes = Number(String(value || '').trim());
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.max(1, minutes);
}

async function addChainLog(chainId: any, level: any, message: any) {
  try {
    const data = await chrome.storage.local.get(CHAIN_LOG_KEY);
    const logs = Array.isArray(data[CHAIN_LOG_KEY]) ? data[CHAIN_LOG_KEY] : [];
    logs.push({ chainId, level, message, timestamp: Date.now() });
    await chrome.storage.local.set({ [CHAIN_LOG_KEY]: logs.slice(-CHAIN_MAX_LOG_ENTRIES) });
  } catch (_) {}
}

function chainDelay(ms: any) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function executeChainStep(step: any, tabId: any) {
  if (!step?.scriptId) {
    return { success: false, error: 'No script assigned to step' };
  }
  const message = {
    action: 'runScriptNow',
    scriptId: step.scriptId,
    ...(typeof tabId === 'number' ? { tabId } : {})
  };
  const response = await handleMessage(message, { id: chrome.runtime.id });
  if (response?.success === false || response?.error) {
    throw new Error(response.error || 'Script execution failed');
  }
  return response || { success: true };
}

async function executeChainById(chainId: any, options: any = {}) {
  const chain = await getChainById(chainId);
  if (!chain) return { success: false, error: 'Chain not found' };
  if (chain.enabled === false) return { success: false, error: 'Chain disabled' };
  if (!Array.isArray(chain.steps) || chain.steps.length === 0) return { success: false, error: 'Chain has no steps' };
  if (_runningChainIds.has(chain.id)) {
    await addChainLog(chain.id, 'warn', `Chain "${chain.name || chain.id}" is already running`);
    return { success: false, error: 'Chain already running', alreadyRunning: true };
  }

  _runningChainIds.add(chain.id);
  try {
    await addChainLog(chain.id, 'info', `Starting chain: ${chain.name || chain.id}`);
    let lastResult: any = { success: true };

    for (let i = 0; i < chain.steps.length; i++) {
      const step = chain.steps[i] || {};
      const label = step.label || `Step ${i + 1}`;

      if (i > 0) {
        if (step.condition === 'success' && !lastResult.success) {
          await addChainLog(chain.id, 'warn', `Skipping step ${i + 1} (${label}): previous step failed`);
          continue;
        }
        if (step.condition === 'failure' && lastResult.success) {
          await addChainLog(chain.id, 'warn', `Skipping step ${i + 1} (${label}): previous step succeeded`);
          continue;
        }
      }

      const delayMs = Math.min(Math.max(Number(step.delay) || 0, 0), CHAIN_MAX_DELAY_MS);
      if (delayMs > 0) {
        await addChainLog(chain.id, 'info', `Waiting ${delayMs}ms before step ${i + 1}...`);
        await chainDelay(delayMs);
      }

      await addChainLog(chain.id, 'info', `Executing step ${i + 1}: ${label}`);
      let retries = chain.errorMode === 'retry' ? 3 : 1;
      let executed = false;

      while (retries > 0 && !executed) {
        try {
          lastResult = await executeChainStep(step, options.tabId);
          executed = true;
          if (lastResult.success !== false) {
            await addChainLog(chain.id, 'success', `Step ${i + 1} completed successfully`);
          } else {
            await addChainLog(chain.id, 'error', `Step ${i + 1} failed: ${lastResult.error || 'unknown error'}`);
          }
        } catch (e: any) {
          retries--;
          lastResult = { success: false, error: e?.message || 'Script execution failed' };
          if (retries > 0 && chain.errorMode === 'retry') {
            await addChainLog(chain.id, 'warn', `Step ${i + 1} failed, retrying (${retries} left)...`);
            await chainDelay(1000);
          } else {
            await addChainLog(chain.id, 'error', `Step ${i + 1} error: ${lastResult.error}`);
            executed = true;
          }
        }
      }

      if (!lastResult.success && chain.errorMode === 'stop') {
        await addChainLog(chain.id, 'error', `Chain stopped due to error at step ${i + 1}`);
        return { success: false, stoppedAt: i, error: lastResult.error };
      }
    }

    await addChainLog(chain.id, 'success', `Chain "${chain.name || chain.id}" completed`);
    return { success: true };
  } finally {
    _runningChainIds.delete(chain.id);
  }
}

async function triggerMatchingChains(predicate: any, options: any = {}) {
  const map = await getChainMap();
  const chains = getRunnableChains(map).filter(predicate);
  let triggered = 0;
  for (const chain of chains) {
    const result = await executeChainById(chain.id, options);
    if (!result?.alreadyRunning) triggered++;
  }
  return triggered;
}

async function triggerChainsForUrl(url: any, tabId: any) {
  return await triggerMatchingChains(
    (chain: any) => chainMatchesUrlTrigger(chain, url),
    { reason: 'url', tabId, url }
  );
}

async function triggerChainsForDomEvent(eventType: any, url: any, tabId: any) {
  return await triggerMatchingChains(
    (chain: any) => chainMatchesDomEventTrigger(chain, eventType, url),
    { reason: 'event', tabId, url }
  );
}

async function triggerChainsForAfterScript(scriptId: any, options: any = {}) {
  return await triggerMatchingChains(
    (chain: any) => chainMatchesAfterScriptTrigger(chain, scriptId),
    options
  );
}

async function getChainDomEventTypes() {
  const map = await getChainMap();
  const eventTypes = [];
  const seen = new Set();
  for (const chain of getRunnableChains(map)) {
    if (chainTriggerType(chain) !== 'event') continue;
    const trigger = parseChainDomEventTrigger(chainTriggerValue(chain));
    if (!trigger || seen.has(trigger.eventType)) continue;
    seen.add(trigger.eventType);
    eventTypes.push(trigger.eventType);
    if (eventTypes.length >= CHAIN_DOM_EVENT_LIMIT) break;
  }
  return eventTypes;
}

async function notifyChainDomTriggersChanged() {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all((tabs || []).map(tab => {
      if (typeof tab.id !== 'number') return Promise.resolve();
      return chrome.tabs.sendMessage(tab.id, { action: 'chainDomTriggersChanged' }).catch(() => {});
    }));
  } catch (_) {}
}

async function setupChainAlarms() {
  const existing = await chrome.alarms.getAll().catch(() => []);
  for (const alarm of existing) {
    if (alarm.name.startsWith(CHAIN_ALARM_PREFIX)) {
      await chrome.alarms.clear(alarm.name).catch(() => {});
    }
  }

  const map = await getChainMap();
  for (const chain of getRunnableChains(map)) {
    if (chainTriggerType(chain) !== 'schedule') continue;
    const periodMinutes = parseChainScheduleMinutes(chainTriggerValue(chain));
    if (periodMinutes <= 0) continue;
    await chrome.alarms.create(CHAIN_ALARM_PREFIX + chain.id, {
      delayInMinutes: periodMinutes,
      periodInMinutes: periodMinutes
    }).catch(() => {});
  }
}

if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !(CHAIN_STORAGE_KEY in changes)) return;
    setupChainAlarms().catch(e => console.error('[ScriptVault] Chain alarm refresh error:', e));
    notifyChainDomTriggersChanged().catch(() => {});
  });
}

async function setupAlarms() {
  const settings = await SettingsManager.get();
  
  // Clear only the alarms we manage here (preserve notification/backup alarms)
  await chrome.alarms.clear('autoUpdate').catch(() => {});
  await chrome.alarms.clear(AUTO_SYNC_ALARM).catch(() => {});
  await chrome.storage.local.remove(SYNC_RATE_LIMIT_BACKOFF_STORAGE_KEY).catch(() => {});
  await chrome.alarms.clear(SUBSCRIPTION_REFRESH_ALARM).catch(() => {});
  
  // Setup auto-update alarm
  // checkInterval is hours from dashboard, updateInterval is ms legacy
  if (settings.autoUpdate) {
    const intervalMs = settings.checkInterval
      ? parseInt(settings.checkInterval) * 3600000
      : (settings.updateInterval || 86400000);
    chrome.alarms.create('autoUpdate', {
      periodInMinutes: Math.max(1, intervalMs / 60000)
    });
  }
  
  // Setup sync alarm
  if (settings.syncEnabled && settings.syncProvider !== 'none') {
    chrome.alarms.create(AUTO_SYNC_ALARM, {
      periodInMinutes: _syncAlarmPeriodMinutes(settings)
    });
  }

  if (settings.subscriptionAutoRefresh !== false) {
    const subscriptions = await ScriptSubscriptions.list().catch(() => []);
    if (subscriptions.some((subscription: any) => subscription.enabled !== false)) {
      const intervalHours = Number(settings.subscriptionRefreshInterval ?? DEFAULT_SUBSCRIPTION_REFRESH_INTERVAL_HOURS);
      const periodInMinutes = intervalHours > 0
        ? Math.max(30, intervalHours * 60)
        : 0;
      if (periodInMinutes > 0) {
        chrome.alarms.create(SUBSCRIPTION_REFRESH_ALARM, { periodInMinutes });
      }
    }
  }

  // Setup @crontab alarms for all enabled scripts
  await setupCrontabAlarms();
  // Setup dashboard-scheduler interval/oneTime alarms
  await setupScheduleAlarms();
  // Setup chain schedule triggers
  await setupChainAlarms();
}

// ============================================================================
// Tab Listeners (for badge updates)
// ============================================================================

// Update badge when tab is activated
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try { await ensureInitialized(); } catch (_) { /* logged in init() */ }
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    rememberRuntimeHostPermissionTarget(tab);
    if (tab.url) {
      await updateBadgeForTab(activeInfo.tabId, tab.url);
    }
  } catch (e) {
    // Tab might not exist
  }
});

// Update badge when tab URL changes
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  try { await ensureInitialized(); } catch (_) { /* logged in init() */ }
  if (changeInfo.url || changeInfo.status === 'complete') {
    if (tab.url) {
      rememberRuntimeHostPermissionTarget({ ...tab, id: tabId });
      await updateBadgeForTab(tabId, tab.url);
      if (changeInfo.status === 'complete') {
        triggerChainsForUrl(tab.url, tabId).catch(e => console.error('[ScriptVault] URL chain trigger error:', e));
      }
    }
  }

  // Forward audio state changes only to scripts watching this tab. Keeping
  // the script id in the event lets multiple user scripts share a tab without
  // receiving each other's state notifications.
  const audioWatchers = audioWatchKeysForTab(tabId);
  if (('audible' in changeInfo || 'mutedInfo' in changeInfo) && audioWatchers.length > 0) {
    let changed = false;
    for (const scriptId of audioWatchers) {
      const data = {
        scriptId,
        muted: tab.mutedInfo?.muted || false,
        reason: tab.mutedInfo?.reason || 'user',
        audible: tab.audible || false
      };
      if (sendUserScriptEvent(tabId, 'audioStateChanged', data)) continue;
      try {
        await chrome.tabs.sendMessage(tabId, {
          action: 'audioStateChanged',
          data
        });
      } catch (e) {
        // Tab may have been closed or the script may have been unregistered.
        if (self._audioWatchedTabs?.delete(`${scriptId}:${tabId}`)) changed = true;
      }
    }
    if (changed) SessionState.persistAudioWatchedTabs();
  }
});

if (chrome.permissions?.onAdded?.addListener) {
  chrome.permissions.onAdded.addListener((permissions) => {
    notifyRuntimeHostPermissionChanged('added', permissions).catch(() => {});
  });
}

if (chrome.permissions?.onRemoved?.addListener) {
  chrome.permissions.onRemoved.addListener((permissions) => {
    notifyRuntimeHostPermissionChanged('removed', permissions).catch(() => {});
  });
}

if (chrome.downloads?.onChanged?.addListener) {
  chrome.downloads.onChanged.addListener(async (delta) => {
    try { await ensureInitialized(); } catch (_) { /* logged in init() */ }
    handlePendingDownloadDelta(delta);
  });
}

// GM_openInTab onclose: fire callback when tracked tab closes
chrome.tabs.onRemoved.addListener(async (tabId) => {
  try { await ensureInitialized(); } catch (_) { /* logged in init() */ }
  const tracker = self._openTabTrackers?.get(tabId);
  if (tracker) {
    // Trackers are recorded for every GM_openInTab so GM_closeTab has an
    // ownership record to check, but only scripts that asked for trackClose
    // registered an onclose callback — don't message the rest.
    if (tracker.trackClose) {
      chrome.tabs.sendMessage(tracker.callerTabId, {
        action: 'openedTabClosed',
        data: { tabId, scriptId: tracker.scriptId }
      }).catch(() => {});
    }
    self._openTabTrackers.delete(tabId);
    SessionState.persistOpenTabTrackers();
  }
  // Clean up audio watch tracking for closed tabs
  if (removeAudioWatchKeysForTab(tabId)) {
    SessionState.persistAudioWatchedTabs();
  }
  closeGMWebSocketsForTab(tabId);
  executionDiagnosticsStore.clear(tabId);
  executionDiagnosticsJournalPersistence?.clear(tabId).catch(() => {});
  if (typeof UserStylesEngine !== 'undefined') {
    UserStylesEngine.onTabRemoved(tabId);
  }
});

// Persistent UserCSS injection: enabled styles are registered as persisted
function _normalizeUserStylesDocumentId(value: any): string | undefined {
  const documentId = typeof value === 'string' ? value.trim() : '';
  return documentId && documentId.length <= 256 ? documentId : undefined;
}

// document_start CSS content scripts, which applies them before the page paints.
// The module keeps an insertCSS fallback for browsers without dynamic
// registration support. Firefox document identities scope the registry and CSS
// targets to one loaded document; Chrome keeps the established tab-keyed path.
if (chrome.webNavigation?.onCommitted?.addListener) {
  chrome.webNavigation.onCommitted.addListener(async (details) => {
    if (details.frameId !== 0) return;
    if (typeof UserStylesEngine === 'undefined') return;
    if (!details.url || details.url.startsWith('chrome-extension://')) return;
    try { await ensureInitialized(); } catch (_) { /* logged in init() */ }
    const documentId = _isFirefoxRuntime() ? _normalizeUserStylesDocumentId(details.documentId) : undefined;
    UserStylesEngine.onDocumentCommitted(details.tabId, details.url, documentId)
      .catch((e: any) => console.error('[ScriptVault] UserCSS document-start registration error:', e));
  });
}

// SPA in-page navigations do NOT commit a new document, so onCommitted never
// fires and @match-scoped UserCSS would go stale (a style bleeds onto a route it
// no longer matches, or misses a route it now matches). history.pushState /
// replaceState surface as onHistoryStateUpdated and hash changes as
// onReferenceFragmentUpdated. Re-run onTabUpdated ONLY (never onTabNavigated) so
// the still-live document's injected-sheet registry is preserved and the
// re-match pass can add newly-matching and remove no-longer-matching sheets.
function _handleUserCssSpaNavigation(details: any): void {
  if (details.frameId !== 0) return;
  if (typeof UserStylesEngine === 'undefined') return;
  if (!details.url || details.url.startsWith('chrome-extension://')) return;
  const documentId = _isFirefoxRuntime() ? _normalizeUserStylesDocumentId(details.documentId) : undefined;
  ensureInitialized()
    .catch(() => { /* logged in init() */ })
    .then(() => UserStylesEngine.onTabUpdated(details.tabId, details.url, documentId))
    .catch((e: any) => console.error('[ScriptVault] UserCSS SPA re-match error:', e));
}
if (chrome.webNavigation?.onHistoryStateUpdated?.addListener) {
  chrome.webNavigation.onHistoryStateUpdated.addListener(_handleUserCssSpaNavigation);
}
if (chrome.webNavigation?.onReferenceFragmentUpdated?.addListener) {
  chrome.webNavigation.onReferenceFragmentUpdated.addListener(_handleUserCssSpaNavigation);
}

// GM_notification onclick/ondone: fire callbacks on notification interaction
chrome.notifications.onClicked.addListener(async (notifId) => {
  try { await ensureInitialized(); } catch (_) { /* logged in init() */ }
  const cb = self._notifCallbacks?.get(notifId);
  if (cb && cb.tabId >= 0 && cb.hasOnclick) {
    chrome.tabs.sendMessage(cb.tabId, {
      action: 'notificationEvent',
      data: { notifId: cb.publicId || notifId, scriptId: cb.scriptId, type: 'click' }
    }).catch(() => {});
  }
});

chrome.notifications.onClosed.addListener(async (notifId, byUser) => {
  try { await ensureInitialized(); } catch (_) { /* logged in init() */ }
  const cb = self._notifCallbacks?.get(notifId);
  if (cb && cb.tabId >= 0 && cb.hasOndone) {
    chrome.tabs.sendMessage(cb.tabId, {
      action: 'notificationEvent',
      data: { notifId: cb.publicId || notifId, scriptId: cb.scriptId, type: 'done', byUser }
    }).catch(() => {});
  }
  if (self._notifCallbacks) {
    self._notifCallbacks.delete(notifId);
    SessionState.persistNotifCallbacks();
  }
});

// Phase 11.11 — Notification button click routing.
// ScriptCat exposes `e.buttonClickIndex` on the onclick event when the user
// clicks an action button. Forward the index to the originating tab so the
// wrapper-side onbuttonclick callback can fire.
chrome.notifications.onButtonClicked.addListener(async (notifId, buttonIndex) => {
  try { await ensureInitialized(); } catch (_) { /* logged in init() */ }
  const cb = self._notifCallbacks?.get(notifId);
  if (cb && cb.tabId >= 0 && cb.hasOnbuttonclick) {
    chrome.tabs.sendMessage(cb.tabId, {
      action: 'notificationEvent',
      data: { notifId: cb.publicId || notifId, scriptId: cb.scriptId, type: 'buttonClick', buttonIndex }
    }).catch(() => {});
  }
});

// Update badge when window focus changes
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab?.id && tab.url) {
      await updateBadgeForTab(tab.id, tab.url);
    }
  } catch (e) {
    // Window might not exist
  }
});

// ============================================================================
// Userscript Installation Handler
// ============================================================================

// Intercept navigation to .user.js files
// Map<url, Promise<'install' | 'pass-through'>> dedups concurrent fetches for
// the same URL and lets later callers reuse the first fetch's result. Without
// this, opening the same .user.js in two tabs at once left the second tab on
// the raw script source (the dedup short-circuit returned before it could
// redirect to install.html).
const _pendingFetches = new Map();

const _PENDING_INSTALL_STORAGE_PREFIX = 'pendingInstall_';
const _PENDING_INSTALL_LEGACY_KEY = 'pendingInstall';
const _PENDING_INSTALL_TTL_MS = 5 * 60 * 1000;
const _PENDING_INSTALL_MAX_ENTRIES = 32;

function _pendingInstallStorageKey(requestId: any) {
  const suffix = String(requestId ?? '').trim().replace(/[^a-z0-9_-]/gi, '-').slice(0, 96);
  return suffix ? `${_PENDING_INSTALL_STORAGE_PREFIX}${suffix}` : '';
}

function _pendingInstallKeyForTab(tabId: any) {
  const numericTabId = Number(tabId);
  return Number.isInteger(numericTabId) && numericTabId >= 0
    ? _pendingInstallStorageKey(`tab-${numericTabId}`)
    : '';
}

function _createPendingInstallStorageKey(scope: any = 'request') {
  const nonce = typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return _pendingInstallStorageKey(`${scope}-${nonce}`);
}

function _pendingInstallPageUrl(storageKey: any) {
  return `${chrome.runtime.getURL('pages/install.html')}#${encodeURIComponent(storageKey)}`;
}

async function _storePendingInstall(storageKey: any, payload: any, options: any = {}) {
  const storagePrefix = options.prefix || _PENDING_INSTALL_STORAGE_PREFIX;
  const ttlMs = Number(options.ttlMs) || _PENDING_INSTALL_TTL_MS;
  const maxEntries = Number(options.maxEntries) || _PENDING_INSTALL_MAX_ENTRIES;
  const includeLegacyKey = options.includeLegacyKey !== false && storagePrefix === _PENDING_INSTALL_STORAGE_PREFIX;
  if (!storageKey?.startsWith(storagePrefix)) {
    throw new Error('Pending install storage key is invalid');
  }
  const timestamp = Number(payload?.timestamp) || Date.now();
  try {
    const stored = await chrome.storage.local.get();
    const candidates = (Object.entries(stored || {}) as Array<[string, any]>)
      .filter(([key]) => (includeLegacyKey && key === _PENDING_INSTALL_LEGACY_KEY) || key.startsWith(storagePrefix))
      .filter(([key]) => key !== storageKey);
    const expiredKeys = candidates
      .filter(([, value]) => !Number.isFinite(Number(value?.timestamp)) || timestamp - Number(value.timestamp) > ttlMs)
      .map(([key]) => key);
    const expiredSet = new Set(expiredKeys);
    const overflowKeys = candidates
      .filter(([key]) => !expiredSet.has(key))
      .sort(([, left], [, right]) => Number(right?.timestamp || 0) - Number(left?.timestamp || 0))
      .slice(Math.max(0, maxEntries - 1))
      .map(([key]) => key);
    const removableKeys = [...new Set([...expiredKeys, ...overflowKeys])];
    if (removableKeys.length) await chrome.storage.local.remove(removableKeys);
  } catch (cleanupError: any) {
    debugLog('[ScriptVault] Pending install cleanup failed:', cleanupError?.message || cleanupError);
  }
  const pendingInstall = {
    ...payload,
    kind: payload?.kind || (String(payload?.code || '').includes('==UserSubscribe==') ? 'subscription' : 'script'),
    timestamp
  };
  await chrome.storage.local.set({ [storageKey]: pendingInstall });
  return pendingInstall;
}

async function _fetchPendingUserscript(url: any) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    // Pre-flight: reject internal/loopback/link-local install URLs before any
    // network I/O.
    InternalHostGuard.assertExternalFetchUrl(url, 'Script source', ['http:', 'https:']);

    // An install must read the publisher's current body: a stale HTTP-cache hit
    // here installs an older script than the page the user is looking at.
    const response = await fetch(url, FetchFreshness.buildFreshnessInit('install', {
      init: { signal: controller.signal }
    }));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    // Post-flight: catch public URLs that redirect into internal address space.
    const postCheck = InternalHostGuard.classifyResponseUrl(response, ['http:', 'https:']);
    if (!postCheck.ok) {
      throw new Error('Script source redirected to ' + postCheck.message);
    }
    // Stream-bounded read so a hostile server can't OOM us by serving an
    // unbounded body (the previous content-length check was advisory and
    // ran AFTER `response.text()` already buffered everything).
    const code = await _fetchTextBounded(response, MAX_SCRIPT_SIZE, 'Script');
    if (!code.includes('==UserScript==') && !code.includes('==UserSubscribe==')) {
      return { action: 'pass-through' };
    }
    return {
      action: 'install',
      pendingInstall: { url, finalUrl: response.url || url, code, timestamp: Date.now() }
    };
  } catch (error: any) {
    console.error('[ScriptVault] Failed to fetch script:', error);
    return {
      action: 'install',
      pendingInstall: { url, finalUrl: '', error: error?.message || String(error), timestamp: Date.now() }
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // Only handle main frame navigation
  if (details.frameId !== 0) return;

  const url = details.url;

  // Check if this is a userscript or subscription URL.
  if (!url.match(/\.user(?:\.sub)?\.js(\?[^#]*)?(#.*)?$/i)) return;

  // Don't intercept extension pages
  if (url.startsWith('chrome-extension://')) return;

  debugLog('Intercepting userscript URL:', url);

  let pending = _pendingFetches.get(url);
  if (!pending) {
    pending = _fetchPendingUserscript(url).finally(() => {
      _pendingFetches.delete(url);
    });
    _pendingFetches.set(url, pending);
  }

  try {
    const result = await pending;
    const storageKey = _pendingInstallKeyForTab(details.tabId);
    if (result.action === 'install') {
      await _storePendingInstall(storageKey, result.pendingInstall);
      // The tab may have been closed between the fetch start and resolution;
      // chrome.tabs.update on a vanished tab rejects with an unhandled error
      // that bubbles out of this async listener. Swallow that specific case
      // (the user closed the tab — there's nothing to redirect).
      chrome.tabs.update(details.tabId, {
        url: _pendingInstallPageUrl(storageKey)
      }).catch((updateErr) => {
        debugLog('[ScriptVault] tab.update post-fetch failed (tab likely closed):', updateErr?.message || updateErr);
      });
    } else {
      // Not a userscript — let this tab's navigation continue and clear only
      // this tab's stale request without disturbing another install review.
      if (storageKey) await chrome.storage.local.remove(storageKey).catch(() => {});
    }
  } catch (e) {
    // _fetchPendingUserscript catches its own errors; any throw here means the
    // tab update or storage cleanup failed. Surface so it appears in logs.
    console.error('[ScriptVault] webNav handler error:', e);
  }
}, {
  url: [
    { urlMatches: '.*\\.user\\.js(\\?[^#]*)?(#.*)?$' },
    { urlMatches: '.*\\.user\\.sub\\.js(\\?[^#]*)?(#.*)?$' }
  ]
});

// Persistent UserCSS install interception: a navigation to a `.user.css` URL is
// fetched (bounded, internal-host-guarded), and if it is a UserStyle the tab is
// redirected into the dashboard editor pre-filled with the source so the user
// can review it and choose Install Style. Mirrors the `.user.js` interceptor but
// routes to the editor rather than the userscript install page.
const _PENDING_USERSTYLE_STORAGE_PREFIX = 'pendingUserStyle_';
const _pendingUserStyleFetches = new Map();

async function _fetchPendingUserStyle(url: any) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    InternalHostGuard.assertExternalFetchUrl(url, 'UserCSS source', ['http:', 'https:']);
    const response = await fetch(url, FetchFreshness.buildFreshnessInit('install', {
      init: { signal: controller.signal }
    }));
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const postCheck = InternalHostGuard.classifyResponseUrl(response, ['http:', 'https:']);
    if (!postCheck.ok) throw new Error('UserCSS source redirected to ' + postCheck.message);
    const code = await _fetchTextBounded(response, MAX_SCRIPT_SIZE, 'UserCSS');
    if (!/\/\*\s*==UserStyle==[\s\S]*?==\/UserStyle==\s*\*\//.test(code)) {
      return { action: 'pass-through' };
    }
    return { action: 'install', code, finalUrl: response.url || url };
  } catch (error: any) {
    console.error('[ScriptVault] Failed to fetch UserCSS:', error);
    return { action: 'pass-through' };
  } finally {
    clearTimeout(timeoutId);
  }
}

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const url = details.url;
  if (!url.match(/\.user\.css(\?[^#]*)?(#.*)?$/i)) return;
  if (url.startsWith('chrome-extension://')) return;
  try { await ensureInitialized(); } catch (_) { /* logged in init() */ }

  let pending = _pendingUserStyleFetches.get(url);
  if (!pending) {
    pending = _fetchPendingUserStyle(url).finally(() => {
      _pendingUserStyleFetches.delete(url);
    });
    _pendingUserStyleFetches.set(url, pending);
  }

  const result = await pending;
  if (result.action !== 'install') return;

  const storageKey = `${_PENDING_USERSTYLE_STORAGE_PREFIX}${details.tabId}`;
  try {
    await _storePendingInstall(storageKey, {
      url,
      finalUrl: result.finalUrl || url,
      code: result.code,
      timestamp: Date.now()
    }, {
      prefix: _PENDING_USERSTYLE_STORAGE_PREFIX,
      includeLegacyKey: false
    });
    const dashboardUrl = chrome.runtime.getURL('pages/dashboard.html') + `#usercss=${encodeURIComponent(storageKey)}`;
    chrome.tabs.update(details.tabId, { url: dashboardUrl }).catch((updateErr) => {
      debugLog('[ScriptVault] UserCSS tab.update failed (tab likely closed):', updateErr?.message || updateErr);
    });
  } catch (e) {
    console.error('[ScriptVault] UserCSS interception error:', e);
  }
}, {
  url: [
    { urlMatches: '.*\\.user\\.css(\\?[^#]*)?(#.*)?$' }
  ]
});

// Handle direct script installation from raw source code (file picker, drag/drop)
async function installFromCode(code: any, receiptOptions: any = {}) {
  try {
    if (typeof code !== 'string' || !code) {
      throw new Error('No script content provided');
    }

    const codeBytes = _scriptSourceByteLength(code);
    if (codeBytes > MAX_SCRIPT_SIZE) {
      throw new Error(`Script too large (${formatBytes(codeBytes)}). Maximum is ${formatBytes(MAX_SCRIPT_SIZE)}.`);
    }

    if (!code.includes('==UserScript==')) {
      throw new Error('Not a valid userscript');
    }

    let parsed = parseUserscript(code);
    if (parsed.error) {
      throw new Error(parsed.error);
    }
    let meta: any = parsed.meta;
    const installSettings = await SettingsManager.get();
    const bundleResult = await ESMUserscriptBundler.bundleIfNeeded(code, meta, installSettings, {
      sourceUrl: receiptOptions.sourceUrl || meta.downloadURL || meta.updateURL || ''
    });
    if (bundleResult.bundled) {
      code = bundleResult.code;
      parsed = parseUserscript(code);
      if (parsed.error) {
        throw new Error(parsed.error);
      }
      meta = parsed.meta;
      meta.esmBundle = {
        entryUrl: bundleResult.entryUrl,
        imports: bundleResult.imports,
        bundledAt: Date.now(),
        sourceMap: bundleResult.sourceMap
      };
    }
    const allScripts = await ScriptStorage.getAll();

    const existing = allScripts.find((s: any) => s.meta.name === meta.name && s.meta.namespace === meta.namespace);
    const id = existing ? existing.id : generateId();
    const previousScript = existing && existing.code !== code
      ? {
          ...existing,
          meta: { ...existing.meta },
          code: existing.code,
          updatedAt: existing.updatedAt || Date.now()
        }
      : null;
    const versionHistory = Array.isArray(existing?.versionHistory) ? [...existing.versionHistory] : [];
    let historyEntry: any = null;
    let rollbackIndex = -1;
    if (previousScript) {
      historyEntry = {
        version: existing.meta.version,
        code: existing.code,
        updatedAt: existing.updatedAt || Date.now()
      };
      versionHistory.push(historyEntry);
      if (versionHistory.length > 5) {
        versionHistory.splice(0, versionHistory.length - 5);
      }
      rollbackIndex = versionHistory.indexOf(historyEntry);
    }
    const trustReceipt = await createScriptTrustReceipt({
      operation: receiptOptions.operation || (existing ? 'update' : 'install'),
      code,
      meta,
      sourceUrl: receiptOptions.sourceUrl || '',
      previousScript,
      rollbackIndex,
      fetchDependencyBody: fetchRequireScriptForTrustReceipt,
      fetchProvenanceBundle
    });
    const tofuSriFailure = _getRequireTofuSriFailure(trustReceipt);
    if (tofuSriFailure) {
      throw new Error(tofuSriFailure.message);
    }
    const provenanceFailure = _getRequireProvenanceFailure(trustReceipt);
    if (provenanceFailure) {
      throw new Error(provenanceFailure.message);
    }
    if (historyEntry && previousScript) {
      historyEntry.trustReceipt = previousScript.trustReceipt || await createScriptTrustReceipt({
        operation: 'rollback-point',
        code: previousScript.code,
        meta: previousScript.meta,
        sourceUrl: previousScript.trustReceipt?.source?.installUrl || previousScript.meta.downloadURL || previousScript.meta.updateURL
      });
    }

    // Classify the install source (Greasy Fork / OpenUserJS / GitHub / ...)
    // so the dashboard can render a durable trust badge and so a future
    // update from a different registry surfaces as a "source changed" flag.
    const effectiveSourceUrl = receiptOptions.sourceUrl || meta.downloadURL || meta.updateURL || '';
    const installSource = classifyInstallSource(effectiveSourceUrl);
    let sourceIdentityChanged = false;
    if (existing && existing.installSource && existing.installSource.id && installSource.id !== 'local'
        && existing.installSource.id !== installSource.id) {
      sourceIdentityChanged = true;
    }

    const script = {
      ...existing,
      id,
      code,
      meta,
      enabled: existing ? existing.enabled : true,
      position: existing ? existing.position : allScripts.length,
      createdAt: existing ? existing.createdAt : Date.now(),
      updatedAt: Date.now(),
      trustReceipt,
      installSource: installSource.id === 'local' && existing?.installSource
        ? existing.installSource
        : installSource
    };
    if (sourceIdentityChanged) {
      script.settings = { ...(script.settings || existing?.settings || {}), sourceIdentityChanged: true };
      script.previousInstallSource = existing.installSource;
    }
    if (versionHistory.length > 0) script.versionHistory = versionHistory;

    await ensurePersistentStorageForScriptWrite(existing ? 'script-reinstall' : 'script-install', script.code);
    await ScriptStorage.set(id, script);
    await reregisterScript(script);
    await updateBadge();
    await autoReloadMatchingTabs(script);

    return { success: true, script };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Handle direct script installation from URL
async function installFromUrl(url: any) {
  try {
    // Reject non-http(s) schemes (file://, data:, blob:, chrome-extension://,
    // javascript:). The dashboard/popup are the only legitimate callers, but
    // defense-in-depth keeps a malformed install request from triggering a
    // fetch on an unexpected scheme.
    if (typeof url !== 'string' || !url) {
      throw new Error('No URL provided');
    }
    InternalHostGuard.assertExternalFetchUrl(url, 'Script source', ['http:', 'https:']);
    // Timeout after 30 seconds
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    let code;
    let finalUrl = url;
    try {
      const response = await fetch(url, FetchFreshness.buildFreshnessInit('install', {
        init: { signal: controller.signal }
      }));

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const postCheck = InternalHostGuard.classifyResponseUrl(response, ['http:', 'https:']);
      if (!postCheck.ok) {
        throw new Error('Script source redirected to ' + postCheck.message);
      }

      // Stream-bounded read (same protection as the webNavigation handler);
      // see _fetchTextBounded for rationale.
      finalUrl = response.url || url;
      code = await _fetchTextBounded(response, MAX_SCRIPT_SIZE, 'Script');
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error('Script download timed out after 30 seconds');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    return await installFromCode(code, { sourceUrl: finalUrl, operation: 'install' });
  } catch (error: any) {
    return { success: false, error: error?.message || String(error) };
  }
}

// Fetch source for the dashboard's inline catalog preview. This must stay in
// the background: extension pages have broad host access, so fetching a
// catalog-controlled URL in the renderer would bypass the canonical SSRF and
// redirect checks used by installation itself.
async function fetchScriptPreview(url: any) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);
  try {
    InternalHostGuard.assertExternalFetchUrl(url, 'Script preview', ['http:', 'https:']);
    // The preview is the body the user is about to install — a cached one would
    // show code that differs from what installFromUrl then downloads.
    const response = await fetch(url, FetchFreshness.buildFreshnessInit('install', {
      init: { signal: controller.signal }
    }));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const postCheck = InternalHostGuard.classifyResponseUrl(response, ['http:', 'https:']);
    if (!postCheck.ok) throw new Error('Script preview redirected to ' + postCheck.message);
    const code = await _fetchTextBounded(response, MAX_SCRIPT_SIZE, 'Script preview');
    return { success: true, code, finalUrl: response.url || url };
  } catch (error: any) {
    const message = error?.name === 'AbortError'
      ? 'Script preview timed out after 20 seconds'
      : error?.message || String(error);
    return { success: false, error: message };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Probe @require dependencies at the privileged network boundary. The install
// page still performs a cheap literal-host preflight, while this post-flight
// response check blocks redirects and DNS-rebound destinations.
async function probeInstallDependency(url: any) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  let response = null;
  try {
    InternalHostGuard.assertExternalFetchUrl(url, 'Dependency', ['http:', 'https:']);
    response = await fetch(url, { method: 'HEAD', signal: controller.signal });
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        signal: controller.signal
      });
    }
    const postCheck = InternalHostGuard.classifyResponseUrl(response, ['http:', 'https:']);
    if (!postCheck.ok) throw new Error('Dependency redirected to ' + postCheck.message);
    return {
      success: true,
      ok: response.ok,
      status: response.status,
      finalUrl: response.url || url
    };
  } catch (error: any) {
    const message = error?.name === 'AbortError'
      ? 'Dependency check timed out after 15 seconds'
      : error?.message || String(error);
    return { success: false, error: message };
  } finally {
    clearTimeout(timeoutId);
    try { await response?.body?.cancel(); } catch (_error) { /* response already closed */ }
  }
}

// ============================================================================
// Initialization
// ============================================================================

async function init() {
  await SettingsManager.init();

  // Rehydrate ephemeral runtime maps (notification callbacks, opened-tab
  // trackers, download callbacks, audio-watched tabs) from chrome.storage.session
  // so callbacks registered before the SW was killed still fire after wake.
  await SessionState.hydrate();
  if (executionDiagnosticsJournalPersistence) {
    // Diagnostics continuity is non-critical to worker readiness. A browser
    // storage backend that is slow or temporarily unavailable must not hold
    // every runtime message behind the journal read; the next diagnostics
    // request will observe the hydrated entries once this promise settles.
    executionDiagnosticsJournalPersistence.hydrate().then((result: any) => {
      if (result.error) debugWarn('[ScriptVault] Execution journal hydration unavailable:', result.error);
    }).catch(() => {});
  }
  await reconcilePendingDownloads('startup');

  // v2.0: Run migration BEFORE ScriptStorage.init() so that any migration-driven
  // rewrites of `userscripts` storage are visible to the in-memory cache. Running
  // it after ScriptStorage.init() left the cache pinned to pre-migration data,
  // causing every subsequent cached read (dashboard, registration, badge) to see
  // the old shape until the next SW cold start.
  if (typeof Migration !== 'undefined') {
    try { await Migration.run(); } catch (e) { console.error('[ScriptVault] Migration error:', e); }
  }

  await ScriptStorage.init();

  // Apply language setting to I18n
  const settings = await SettingsManager.get();
  if (settings.language && settings.language !== 'default' && settings.language !== 'auto') {
    I18n.setLocale(settings.language);
  }

  // Configure userScripts world
  await configureUserScriptsWorld();

  // Setup context menus
  await setupContextMenus();

  // Register all enabled scripts — force re-registration on extension install/update
  // (new GM_* wrappers / match patterns require rewriting all registered scripts).
  // On plain SW wake within the same extension version, skip the destructive cycle.
  let needsForceReregister = false;
  try {
    const currentVersion = chrome.runtime.getManifest().version;
    const stored = await chrome.storage.local.get('_lastRegisteredVersion');
    if (stored._lastRegisteredVersion !== currentVersion) {
      needsForceReregister = true;
      await chrome.storage.local.set({ _lastRegisteredVersion: currentVersion });
    }
  } catch (e) {
    // Unable to read version — force re-register to be safe on update
    needsForceReregister = true;
  }
  await registerAllScripts(needsForceReregister);

  await updateBadge();
  await setupAlarms();

  // Clean up stale persistent caches (require_cache_, res_cache_)
  cleanupStaleCaches();

  // v2.0: Auto-cleanup storage if above threshold
  if (typeof QuotaManager !== 'undefined') {
    try { await QuotaManager.autoCleanup(); } catch (e) { console.error('[ScriptVault] Quota cleanup error:', e); }
  }

  // v2.0: Register global error handlers for ErrorLog
  if (typeof ErrorLog !== 'undefined' && typeof ErrorLog.registerGlobalHandlers === 'function') {
    ErrorLog.registerGlobalHandlers();
  }

  // v2.0 module initializers: these register alarm/message listeners and
  // load per-module state. Previously they were only called from
  // chrome.runtime.onInstalled, which only fires at install/update — after
  // the first SW shutdown (~30s idle) the listeners were gone and modules
  // were dormant until the next extension update. Each module is
  // `_initialized`-guarded so calling them every wake is cheap and safe.
  if (typeof BackupScheduler !== 'undefined') {
    try { await BackupScheduler.init(); } catch (e) { console.error('[ScriptVault] BackupScheduler init error:', e); }
  }
  if (typeof NotificationSystem !== 'undefined' && typeof NotificationSystem.init === 'function') {
    try { await NotificationSystem.init(); } catch (e) { console.error('[ScriptVault] NotificationSystem init error:', e); }
  }
  if (typeof PublicAPI !== 'undefined') {
    try { await PublicAPI.init(); } catch (e) { console.error('[ScriptVault] PublicAPI init error:', e); }
  }
  if (typeof EasyCloudSync !== 'undefined') {
    try { await EasyCloudSync.init(); } catch (e) { console.error('[ScriptVault] EasyCloudSync init error:', e); }
  }
  // Persistent UserCSS: load installed styles and re-apply enabled ones to any
  // open matching tabs. After a service-worker restart the in-memory injection
  // registry is empty but a previously injected sheet may still persist in a
  // live document, so rehydrateOpenTabs removes any orphan before re-injecting.
  if (typeof UserStylesEngine !== 'undefined') {
    try {
      await UserStylesEngine.init();
      await UserStylesEngine.rehydrateOpenTabs();
    } catch (e) { console.error('[ScriptVault] UserStyles init error:', e); }
  }
  await restrictManagedStorageAccess();

  // Phase 39.8 — OS-policy script provisioning. Read chrome.storage.managed
  // for an array of admin-pushed userscripts; install/update each. The
  // managed-storage change listener (wired below) re-runs this on policy
  // updates so admins can roll out new scripts without re-shipping the
  // extension.
  applyManagedScripts().catch(e => {
    console.warn('[ScriptVault] Managed-script provisioning failed:', e?.message || e);
  });

  // Phase 40.10 — Reconcile DNR rule map against live DNR + ScriptStorage now
  // that both are hydrated. Catches orphan rules left behind when the SW was
  // killed mid-delete or mid-update. Fire-and-forget so a slow DNR query
  // doesn't block the rest of the wake path.
  reconcileWebRequestRuleMap().catch(e => {
    console.warn('[ScriptVault] DNR reconcile failed on init:', e?.message || e);
  });

  console.log('[ScriptVault] Service worker ready');
}

const MANAGED_SCRIPT_POLICY_KEYS = ['managedScripts', 'managedScriptsCleanup'];
const MANAGED_SCRIPT_RUN_SCHEMA = 'scriptvault-managed-policy-run/v1';
const MANAGED_SCRIPT_LAST_RUN_KEY = 'managedScriptsLastRun';

function hasManagedScriptPolicyKey(policy: any, key: any) {
  return !!policy && Object.hasOwn(policy, key);
}

function _managedScriptRunCount(value: any) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function _managedScriptRunTimestamp(value: any) {
  return typeof value === 'string' && value.length <= 40 ? value : '';
}

function buildManagedPolicyRunStatus(summary: any = {}) {
  if (summary.policyReadStatus === 'unavailable') return 'unavailable';
  const failures = (summary.failedEntries || 0) + (summary.pruneFailedScripts || 0);
  if (failures > 0 && (summary.installedEntries || 0) === 0 && (summary.prunedScripts || 0) === 0) return 'failed';
  if (failures > 0 || (summary.skippedInvalidEntries || 0) > 0) return 'partial';
  if ((summary.prunedScripts || 0) > 0 && (summary.installedEntries || 0) === 0) return 'pruned';
  if ((summary.attemptedEntries || 0) === 0 && (summary.configuredEntries || 0) === 0 && !summary.cleanupEnabled) return 'not-configured';
  if ((summary.attemptedEntries || 0) === 0) return 'skipped';
  return 'applied';
}

function createManagedPolicyRunSummary(policy: any = {}, policyReadStatus: any = 'readable') {
  const items = Array.isArray(policy?.managedScripts) ? policy.managedScripts : [];
  return {
    schema: MANAGED_SCRIPT_RUN_SCHEMA,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    status: 'not-configured',
    policyReadStatus,
    configuredEntries: items.length,
    attemptedEntries: 0,
    installedEntries: 0,
    failedEntries: 0,
    verifiedEntries: 0,
    verifiedIntegrityEntries: 0,
    verifiedSignatureEntries: 0,
    verificationFailedEntries: 0,
    skippedInvalidEntries: hasManagedScriptPolicyKey(policy, 'managedScripts') && !Array.isArray(policy?.managedScripts) ? 1 : 0,
    prunedScripts: 0,
    pruneFailedScripts: 0,
    cleanupEnabled: policy?.managedScriptsCleanup === true
  };
}

function sanitizeManagedPolicyRunSummary(summary: any = null) {
  if (!summary || summary.schema !== MANAGED_SCRIPT_RUN_SCHEMA) return null;
  const safe = {
    schema: MANAGED_SCRIPT_RUN_SCHEMA,
    startedAt: _managedScriptRunTimestamp(summary.startedAt),
    finishedAt: _managedScriptRunTimestamp(summary.finishedAt),
    status: String(summary.status || 'not-configured'),
    policyReadStatus: String(summary.policyReadStatus || 'not-configured'),
    configuredEntries: _managedScriptRunCount(summary.configuredEntries),
    attemptedEntries: _managedScriptRunCount(summary.attemptedEntries),
    installedEntries: _managedScriptRunCount(summary.installedEntries),
    failedEntries: _managedScriptRunCount(summary.failedEntries),
    verifiedEntries: _managedScriptRunCount(summary.verifiedEntries),
    verifiedIntegrityEntries: _managedScriptRunCount(summary.verifiedIntegrityEntries),
    verifiedSignatureEntries: _managedScriptRunCount(summary.verifiedSignatureEntries),
    verificationFailedEntries: _managedScriptRunCount(summary.verificationFailedEntries),
    skippedInvalidEntries: _managedScriptRunCount(summary.skippedInvalidEntries),
    prunedScripts: _managedScriptRunCount(summary.prunedScripts),
    pruneFailedScripts: _managedScriptRunCount(summary.pruneFailedScripts),
    cleanupEnabled: summary.cleanupEnabled === true
  };
  const validStatuses = new Set(['not-configured', 'applied', 'partial', 'failed', 'pruned', 'skipped', 'unavailable']);
  const validPolicyStatuses = new Set(['unsupported', 'not-configured', 'readable', 'unavailable', 'error']);
  if (!validStatuses.has(safe.status)) safe.status = buildManagedPolicyRunStatus(safe);
  if (!validPolicyStatuses.has(safe.policyReadStatus)) safe.policyReadStatus = 'not-configured';
  return safe;
}

async function recordManagedPolicyRunSummary(summary: any = {}) {
  const finished: any = {
    ...summary,
    finishedAt: new Date().toISOString(),
    status: buildManagedPolicyRunStatus(summary)
  };
  const safe = sanitizeManagedPolicyRunSummary(finished);
  if (!safe || !chrome.storage?.local) return safe;
  try {
    await chrome.storage.local.set({ [MANAGED_SCRIPT_LAST_RUN_KEY]: safe });
  } catch (_) {
    // The apply path should not fail only because diagnostics could not persist.
  }
  return safe;
}

async function readManagedPolicyRunSummary() {
  if (!chrome.storage?.local) return null;
  try {
    const stored = await chrome.storage.local.get(MANAGED_SCRIPT_LAST_RUN_KEY);
    return sanitizeManagedPolicyRunSummary(stored?.[MANAGED_SCRIPT_LAST_RUN_KEY]);
  } catch (_) {
    return null;
  }
}

async function restrictManagedStorageAccess() {
  const managed = chrome.storage?.managed;
  if (typeof managed?.setAccessLevel !== 'function') return;
  try {
    await managed.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  } catch (_) {
    // Some Chromium builds expose managed storage without setAccessLevel.
  }
}

async function getManagedScriptOriginKey(item: any) {
  if (!item || typeof item !== 'object') return null;
  if (typeof item.url === 'string' && item.url.trim()) {
    return `url:${item.url.trim()}`;
  }
  if (typeof item.code === 'string' && item.code) {
    return `code-sha256:${await _sha256Hex(item.code)}`;
  }
  return null;
}

async function verifyManagedScriptPolicyEntry(item: any, code: any) {
  const computedSha256 = await _sha256Hex(code);
  const integrity = typeof item?.integrity === 'string' ? item.integrity.trim() : '';
  const signature = item?.signature && typeof item.signature === 'object' && !Array.isArray(item.signature)
    ? item.signature
    : null;
  const diagnosticHash = `Computed SHA-256: ${computedSha256}`;
  if (!integrity && !signature) {
    return {
      ok: false,
      method: 'missing',
      error: `Managed script is unverified; add an integrity pin or trusted Ed25519 signature. ${diagnosticHash}`
    };
  }

  let integrityVerified = false;
  if (integrity) {
    const hexIntegrity = integrity.match(/^sha256[:=]([0-9a-f]{64})$/i);
    if (!hexIntegrity && !/^(sha256|sha384|sha512)[-=]/i.test(integrity)) {
      return {
        ok: false,
        method: 'integrity-failed',
        error: `Managed script integrity must use sha256- SRI or sha256:<64-hex> syntax. ${diagnosticHash}`
      };
    }
    integrityVerified = hexIntegrity
      ? hexIntegrity[1].toLowerCase() === computedSha256
      : await verifySRI(code, integrity);
    if (!integrityVerified) {
      return {
        ok: false,
        method: 'integrity-failed',
        error: `Managed script integrity mismatch. ${diagnosticHash}`
      };
    }
  }

  let signatureVerified = false;
  if (signature) {
    if (signature.algorithm && signature.algorithm !== 'Ed25519') {
      return {
        ok: false,
        method: 'signature-failed',
        error: `Managed script signature algorithm must be Ed25519. ${diagnosticHash}`
      };
    }
    if (typeof ScriptSigning?.verifyScript !== 'function') {
      return {
        ok: false,
        method: 'signature-failed',
        error: `Managed script signature verifier is unavailable. ${diagnosticHash}`
      };
    }
    const result = await ScriptSigning.verifyScript(code, signature);
    if (!result?.valid) {
      return {
        ok: false,
        method: 'signature-failed',
        error: `Managed script signature is invalid: ${result?.reason || 'verification failed'}. ${diagnosticHash}`
      };
    }
    if (!result.trusted) {
      return {
        ok: false,
        method: 'signature-untrusted',
        error: `Managed script signature key is not trusted in ScriptVault. ${diagnosticHash}`
      };
    }
    signatureVerified = true;
  }

  return {
    ok: true,
    method: integrityVerified && signatureVerified ? 'integrity+signature' : integrityVerified ? 'integrity' : 'signature'
  };
}

async function markManagedScript(result: any, originKey: any) {
  if (!result?.success || !result?.script?.id || !originKey) return null;
  const current = await ScriptStorage.get(result.script.id);
  const script = current || result.script;
  const managedScript = {
    ...script,
    settings: {
      ...(script.settings || {}),
      managed: true,
      managedOriginKey: originKey,
      managedAppliedAt: Date.now()
    }
  };
  await ScriptStorage.set(managedScript.id, managedScript);
  return managedScript;
}

// Phase 39.8 — OS-policy script provisioning (TM 5.5.0 parity).
//
// Admins push userscripts via the standard Chrome enterprise policy mechanism
// (`ExtensionSettings` JSON → `chrome.storage.managed`). The expected shape is:
//
//   chrome.storage.managed.managedScripts = [
//     { url: "https://internal.corp/foo.user.js", integrity: "sha256-..." },
//     { code: "// ==UserScript== ... ", signature: { signature, publicKey } }
//   ]
//
// Every entry is verified before it reaches installFromCode: either its fetched
// bytes match the declared SRI pin or its Ed25519 signature validates against a
// key already trusted in ScriptVault.
// Each managed script is flagged `script.settings.managed = true` and appears
// with a Managed badge in the dashboard. Managed scripts are NOT auto-deleted
// from local storage when removed from policy; admins can clear via an explicit
// `chrome.storage.managed.managedScriptsCleanup = true` toggle if needed.
async function applyManagedScripts() {
  if (!chrome.storage?.managed) return; // Not all browsers expose .managed
  let policy;
  try {
    policy = await chrome.storage.managed.get(MANAGED_SCRIPT_POLICY_KEYS);
  } catch (e) {
    await recordManagedPolicyRunSummary(createManagedPolicyRunSummary({}, 'unavailable'));
    return;
  }
  const runSummary = createManagedPolicyRunSummary(policy, 'readable');
  const items = Array.isArray(policy?.managedScripts) ? policy.managedScripts : [];
  if (items.length === 0 && !policy?.managedScriptsCleanup) {
    if (hasManagedScriptPolicyKey(policy, 'managedScripts') || hasManagedScriptPolicyKey(policy, 'managedScriptsCleanup')) {
      await recordManagedPolicyRunSummary(runSummary);
    }
    return;
  }

  const allScripts = await ScriptStorage.getAll();
  const installedByOrigin = new Map();
  for (const s of allScripts) {
    if (s?.settings?.managed && s?.settings?.managedOriginKey) {
      installedByOrigin.set(s.settings.managedOriginKey, s);
    }
  }
  const policyOriginKeys = new Set();
  const policyManagedScriptIds = new Set();

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      runSummary.skippedInvalidEntries++;
      continue;
    }
    let originKey = null;
    try {
      originKey = await getManagedScriptOriginKey(item);
    } catch (_) {
      runSummary.skippedInvalidEntries++;
      continue;
    }
    if (!originKey) {
      runSummary.skippedInvalidEntries++;
      continue;
    }
    policyOriginKeys.add(originKey);
    runSummary.attemptedEntries++;

    const url = typeof item.url === 'string' ? item.url.trim() : '';
    const inlineCode = typeof item.code === 'string' ? item.code : '';
    let sourceCode = inlineCode;
    let sourceUrl = url;
    let res = null;
    if (url) {
      try {
        const fetched = await fetchScriptPreview(url);
        if (!fetched?.success || typeof fetched.code !== 'string') throw new Error(fetched?.error || 'Managed script fetch failed');
        sourceCode = fetched.code;
        sourceUrl = fetched.finalUrl || url;
      } catch (e) {
        runSummary.failedEntries++;
        console.warn('[ScriptVault] Managed script fetch failed for a URL policy entry.');
        continue;
      }
    } else if (!sourceCode) {
      runSummary.skippedInvalidEntries++;
      continue;
    }

    try {
      const verification = await verifyManagedScriptPolicyEntry(item, sourceCode);
      if (!verification.ok) {
        runSummary.failedEntries++;
        runSummary.verificationFailedEntries++;
        console.warn('[ScriptVault] Managed policy verification failed:', verification.error);
        continue;
      }
      runSummary.verifiedEntries++;
      if (verification.method === 'integrity' || verification.method === 'integrity+signature') runSummary.verifiedIntegrityEntries++;
      if (verification.method === 'signature' || verification.method === 'integrity+signature') runSummary.verifiedSignatureEntries++;
    } catch (e) {
      runSummary.failedEntries++;
      runSummary.verificationFailedEntries++;
      console.warn('[ScriptVault] Managed policy verification failed.');
      continue;
    }

    if (url) {
      try {
        res = await installFromCode(sourceCode, { sourceUrl, operation: 'install' });
        if (res?.error) {
          runSummary.failedEntries++;
          console.warn('[ScriptVault] Managed script install failed for a URL policy entry.');
          continue;
        }
      } catch (e) {
        runSummary.failedEntries++;
        console.warn('[ScriptVault] Managed script install failed for a URL policy entry.');
        continue;
      }
    } else {
      try {
        res = await installFromCode(sourceCode, { operation: 'install' });
        if (res?.error) {
          runSummary.failedEntries++;
          console.warn('[ScriptVault] Managed script install failed for an inline policy entry.');
          continue;
        }
      } catch (e) {
        runSummary.failedEntries++;
        console.warn('[ScriptVault] Managed inline install failed for a policy entry.');
        continue;
      }
    }

    try {
      const managedScript = await markManagedScript(res, originKey);
      if (managedScript?.id) {
        policyManagedScriptIds.add(managedScript.id);
        runSummary.installedEntries++;
      } else {
        runSummary.failedEntries++;
      }
    } catch (e) {
      runSummary.failedEntries++;
      console.warn('[ScriptVault] Managed script tagging failed for a policy entry.');
    }
  }

  // Optional cleanup: remove managed scripts whose origin key is no longer in
  // the policy AND the admin opted into pruning. Without the explicit
  // `managedScriptsCleanup: true` flag, we leave orphans alone — better to keep
  // a script than silently delete one a sysadmin still wants users to have.
  if (policy?.managedScriptsCleanup === true) {
    for (const [originKey, script] of installedByOrigin.entries()) {
      if (!policyOriginKeys.has(originKey) && !policyManagedScriptIds.has(script.id)) {
        try {
          await ScriptStorage.delete(script.id);
          runSummary.prunedScripts++;
          debugLog('[ManagedScripts] Pruned a managed script no longer in policy');
        } catch (e) {
          runSummary.pruneFailedScripts++;
          console.warn('[ScriptVault] Managed prune failed for a policy-managed script.');
        }
      }
    }
  }

  await recordManagedPolicyRunSummary(runSummary);
}

// Re-run provisioning whenever the managed-storage area changes.
if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'managed') return;
    if (!('managedScripts' in changes) && !('managedScriptsCleanup' in changes)) return;
    applyManagedScripts().catch(e => {
      console.warn('[ScriptVault] Managed-storage onChanged handler failed:', e?.message || e);
    });
  });
}

// Remove expired persistent cache entries and stale trash items to prevent storage bloat.
//
// Phase 39.25 — VM #2453 @require cache invalidation on dependency update.
// In addition to age-based TTL eviction, drop require_cache_* entries whose
// URL hash is no longer referenced by any installed script. A script that
// bumps its @require from `lib@1.0.0` to `lib@1.1.0` previously kept the old
// entry until the 7-day TTL fired; now the orphan is evicted on the next
// cleanup tick.
async function cleanupStaleCaches() {
  try {
    const all = await chrome.storage.local.get();
    const now = Date.now();
    const maxRequireAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    const maxResourceAge = ResourceCache.maxAge; // 24 hours
    const keysToRemove = [];

    // Phase 39.25 — compute the live set of `require_cache_<sha256(url)>` keys
    // from every script's @require list. Anything in storage outside this set
    // is an orphan (no script references it).
    let liveRequireKeys = null;
    try {
      const scripts = await ScriptStorage.getAll();
      const urls = new Set<string>();
      for (const s of scripts || []) {
        const reqs = Array.isArray(s?.meta?.require) ? s.meta.require : [];
        for (const u of reqs) if (typeof u === 'string' && u) urls.add(u);
      }
      // The cache key is sha256(full URL including any #sri fragment) — match
      // the same hashing the fetcher uses (line 5765 region).
      liveRequireKeys = new Set();
      for (const u of urls) {
        const buf = new TextEncoder().encode(u);
        const hash = await crypto.subtle.digest('SHA-256', buf);
        const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
        liveRequireKeys.add(`require_cache_${hex}`);
      }
    } catch (e: any) {
      // If we can't enumerate live keys, fall back to age-only eviction
      // (better than nothing). Logging only — non-critical.
      debugLog('[Cache cleanup] live-key enumeration failed, falling back to age-only:', e?.message || e);
      liveRequireKeys = null;
    }

    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith('require_cache_') && value?.timestamp) {
        const expired = now - value.timestamp > maxRequireAge;
        const orphaned = liveRequireKeys !== null && !liveRequireKeys.has(key);
        if (expired || orphaned) keysToRemove.push(key);
      } else if (key.startsWith('res_cache_') && value?.timestamp) {
        if (now - value.timestamp > maxResourceAge) keysToRemove.push(key);
      }
    }

    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
      debugLog(`Cleaned up ${keysToRemove.length} stale cache entries`);
    }
  } catch (e) {
    // Non-critical, ignore errors
  }

  // Prune sync tombstones older than 30 days (they're only needed during the sync window)
  try {
    const tombstoneData = await chrome.storage.local.get('syncTombstones');
    const tombstones = tombstoneData.syncTombstones || {};
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const pruned = Object.fromEntries(
      (Object.entries(tombstones) as Array<[string, number]>).filter(([, timestamp]) => timestamp > cutoff)
    );
    if (Object.keys(pruned).length !== Object.keys(tombstones).length) {
      await chrome.storage.local.set({ syncTombstones: pruned });
    }
  } catch (e) { /* non-critical */ }

  // Prune expired trash entries based on trashMode retention setting
  try {
    const settings = await SettingsManager.get();
    const trashMode = settings.trashMode || '30';
    const maxAge = trashMode === '1'
      ? 86400000
      : trashMode === '7'
        ? 604800000
        : trashMode === '30'
          ? 2592000000
          : 0;
    await _runExclusiveTrashMutation(async () => {
      const trashData = await chrome.storage.local.get('trash');
      const trash = Array.isArray(trashData.trash) ? trashData.trash.slice() : [];
      const now = Date.now();
      const valid = maxAge > 0 ? trash.filter((s: any) => now - s.trashedAt < maxAge) : trash;
      const budgeted = _enforceTrashBudget(valid);
      const expiredCount = trash.length - valid.length;
      if (expiredCount > 0 || budgeted.evictedCount > 0) {
        await chrome.storage.local.set({ trash: budgeted.trash });
        debugLog(`Pruned ${expiredCount} expired trash entries and evicted ${budgeted.evictedCount} over-budget entries`);
      }
      if (budgeted.evictedCount > 0) {
        await _recordTrashEvictionNotice(budgeted.evicted, budgeted.evictedCount);
      }
    });
  } catch (e) {
    // Non-critical, ignore errors
  }
}

// Read the Chromium major version for user-facing diagnostics only. Capability
// decisions below must use the API surface exposed by the current browser.
function _getChromeVersion() {
  try {
    const m: any = (self.navigator?.userAgent || '').match(/(?:Chrome|Chromium)\/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  } catch (e) {
    return 0;
  }
}

function _isFirefoxRuntime() {
  try {
    // Detect Firefox by user agent only. ScriptVault installs a `browser`->
    // `chrome` alias on Chrome for MV3 compatibility (shared/utils.js), so a
    // `typeof browser !== 'undefined' && browser.runtime.id` check falsely
    // matched on Chrome — showing the Firefox setup banner and disabling
    // per-script worldId isolation on Chromium builds that expose the
    // configureWorld API. Firefox always reports
    // `Firefox/<version>` in its UA, which registration.ts already relies on.
    return /Firefox\//.test(self.navigator?.userAgent || '');
  } catch (e) {
    return false;
  }
}

function _supportsUserScriptsWorldId() {
  // Per-script worlds are no longer Chromium-only. Firefox 153 implements
  // configureWorld({ worldId }) and accepts worldId on register/update; without
  // it every script for a page shares one sandbox and only the first one runs
  // (verified against Firefox 154.0b1 — scripts 2..n were silently dead).
  //
  // On Firefox this is only the CHEAP gate: `configureWorld` shipped before
  // per-world `worldId` did, so the symbol being present proves nothing on
  // 136–152. _ensureUserScriptWorldIdSupport() below does the real capability
  // probe; a resolved probe result overrides this answer.
  if (_isFirefoxRuntime()) {
    if (typeof chrome.userScripts?.configureWorld !== 'function') return false;
    return _worldIdSupportProbe.resolved ? _worldIdSupportProbe.supported : true;
  }
  return typeof chrome.userScripts?.configureWorld === 'function';
}

// Result of the one-time Firefox capability probe. `resolved: false` means the
// probe has not run yet, in which case the symbol check above stands in.
const _worldIdSupportProbe: {
  resolved: boolean;
  supported: boolean;
  proven: boolean;
  promise: Promise<boolean> | null;
} = { resolved: false, supported: false, proven: false, promise: null };

const _WORLD_ID_PROBE_ID = 'sv-worldid-probe';

/**
 * Prove — rather than assume — that this engine honours a per-script `worldId`.
 *
 * The old check was `typeof configureWorld === 'function'`, but Firefox shipped
 * `configureWorld` BEFORE per-world `worldId`, so on 136–152 the symbol is there
 * and the code was relying on the engine throwing on the unknown property. An
 * engine that silently ignores it instead would leave every script sharing one
 * world again — the exact bug per-script worlds fixed — on the Firefox range
 * most users are on.
 *
 * So: configure a throwaway world, then read the configuration back. Only a
 * world that comes back with the id we asked for proves the property was
 * honoured. When the engine offers no way to read back, the result is recorded
 * as unproven and the optimistic answer stands (a false negative here would
 * disable isolation that may well work).
 */
async function _ensureUserScriptWorldIdSupport(): Promise<boolean> {
  if (!_isFirefoxRuntime()) return _supportsUserScriptsWorldId();
  if (_worldIdSupportProbe.resolved) return _worldIdSupportProbe.supported;
  if (_worldIdSupportProbe.promise) return _worldIdSupportProbe.promise;

  _worldIdSupportProbe.promise = (async () => {
    const api: any = chrome.userScripts;
    if (typeof api?.configureWorld !== 'function') return false;

    try {
      await api.configureWorld({
        worldId: _WORLD_ID_PROBE_ID,
        csp: "script-src 'self'",
        messaging: false
      });
    } catch (e: any) {
      // Rejected the unknown property — no worldId support. This is the good
      // failure: the engine told us.
      debugLog('[ScriptVault] worldId probe rejected by engine:', e?.message || e);
      _worldIdSupportProbe.proven = true;
      return false;
    }

    if (typeof api.getWorldConfigurations !== 'function') {
      // Nothing to read back. Stay optimistic but record that it is unproven so
      // the registration path can say so if a world then fails to take.
      _worldIdSupportProbe.proven = false;
      return true;
    }

    try {
      const worlds = await api.getWorldConfigurations();
      const honoured = Array.isArray(worlds)
        && worlds.some((world: any) => world?.worldId === _WORLD_ID_PROBE_ID);
      _worldIdSupportProbe.proven = true;
      if (!honoured) {
        // configureWorld accepted the call and dropped the property: exactly the
        // silent-shared-world case the symbol check could not see.
        debugWarn('[ScriptVault] Engine accepted worldId but did not honour it — per-script worlds unavailable');
      }
      return honoured;
    } catch (e: any) {
      debugLog('[ScriptVault] worldId probe read-back failed:', e?.message || e);
      _worldIdSupportProbe.proven = false;
      return true;
    } finally {
      // Clean the probe world up so it does not sit in the engine's world list.
      try {
        if (typeof api.resetWorldConfiguration === 'function') {
          await api.resetWorldConfiguration(_WORLD_ID_PROBE_ID);
        }
      } catch (_e) { /* best effort */ }
    }
  })().then((supported) => {
    _worldIdSupportProbe.resolved = true;
    _worldIdSupportProbe.supported = supported;
    _worldIdSupportProbe.promise = null;
    return supported;
  }).catch(() => {
    _worldIdSupportProbe.resolved = true;
    _worldIdSupportProbe.supported = false;
    _worldIdSupportProbe.promise = null;
    return false;
  });

  return _worldIdSupportProbe.promise;
}

/**
 * The world id to use for a script.
 *
 * Chrome reserves world ids beginning with `_`, and script ids come from the
 * imported file on a backup restore — so an id starting with `_` made
 * configureWorld throw and silently downgraded that script to the SHARED world.
 * Prefix those instead of losing isolation. Deterministic, so a script keeps the
 * same world across registrations.
 */
/**
 * Record that a script had to fall back to the SHARED user-script world.
 *
 * This used to be a bare `catch {}`: the script registered into the default
 * world with no warning, no `_registrationError`, and no log entry — which is
 * indistinguishable from working, and is the "scripts 2..n silently dead" state
 * per-script worlds exist to prevent. The catch is deliberately broad (world
 * count limit, reserved id, transient failure all land here), so the point is
 * observability rather than classification.
 */
async function _recordWorldIsolationLoss(script: any, reason: any) {
  const detail = reason instanceof Error ? (reason.message || String(reason)) : String(reason || 'unknown');
  const warning = `Per-script world unavailable — this script shares the default sandbox with other scripts on the page (${detail})`;
  debugWarn('[ScriptVault]', script?.meta?.name || script?.id, warning);
  try {
    if (script?.settings) {
      script.settings._registrationWarning = warning;
      await ScriptStorage.set(script.id, script);
    }
  } catch (e: any) {
    debugWarn('[ScriptVault] Could not persist world-isolation warning:', e?.message || e);
  }
  try {
    if (typeof ErrorLog !== 'undefined' && typeof ErrorLog.log === 'function') {
      await ErrorLog.log({
        scriptId: script?.id,
        scriptName: script?.meta?.name || script?.id,
        error: warning,
        source: 'registration',
        context: 'world-isolation',
      });
    }
  } catch (e: any) {
    debugWarn('[ScriptVault] Could not log world-isolation warning:', e?.message || e);
  }
}

/** Clear a previously recorded isolation warning once a world is established. */
async function _clearWorldIsolationLoss(script: any) {
  if (!script?.settings?._registrationWarning) return;
  try {
    delete script.settings._registrationWarning;
    await ScriptStorage.set(script.id, script);
  } catch (e: any) {
    debugWarn('[ScriptVault] Could not clear world-isolation warning:', e?.message || e);
  }
}

function _userScriptWorldIdFor(scriptId: any) {
  const id = typeof scriptId === 'string' ? scriptId : String(scriptId || '');
  if (!id) return '';
  return id.startsWith('_') ? `sv${id}` : id;
}

function getExtensionDetailsUrl() {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
      return `chrome://extensions/?id=${chrome.runtime.id}`;
    }
  } catch (e) {
    // Fall through to the generic extensions page.
  }
  return 'chrome://extensions';
}

function _userScriptsCapabilityFlags() {
  const api: any = typeof chrome !== 'undefined' ? chrome.userScripts : undefined;
  return {
    userScriptsApiAvailable: typeof api?.getScripts === 'function',
    userScriptsUpdateAvailable: typeof api?.update === 'function'
  };
}

function buildUserScriptsStatus({
  userScriptsAvailable,
  chromeVersion = _getChromeVersion(),
  probeError = '',
  userScriptsApiAvailable = _userScriptsCapabilityFlags().userScriptsApiAvailable,
  userScriptsUpdateAvailable = _userScriptsCapabilityFlags().userScriptsUpdateAvailable
}: any) {
  let setupState = 'available';
  let setupTitle = '';
  let setupMessage = '';
  let setupAction = '';
  let setupUrl = '';

  if (!userScriptsAvailable) {
    if (_isFirefoxRuntime()) {
      setupState = 'firefox-user-scripts-permission';
      setupTitle = 'Firefox userScripts permission required';
      setupMessage = 'Grant ScriptVault the optional Firefox userScripts permission, then refresh runtime status.';
      setupAction = 'Grant Permission';
      setupUrl = '';
    } else if (userScriptsUpdateAvailable) {
      setupState = 'allow-user-scripts-disabled';
      setupTitle = 'Allow User Scripts is off';
      setupMessage = 'Enable "Allow User Scripts" in Extension Details, then refresh.';
      setupAction = 'Open Extension Details';
      setupUrl = getExtensionDetailsUrl();
    } else if (userScriptsApiAvailable) {
      setupState = 'developer-mode-disabled';
      setupTitle = 'Developer Mode required';
      setupMessage = 'Open chrome://extensions and enable Developer Mode to run userscripts.';
      setupAction = 'Open Extensions Page';
      setupUrl = 'chrome://extensions';
    } else {
      setupState = 'unsupported-browser';
      setupTitle = 'Unsupported browser';
      setupMessage = 'ScriptVault userscripts require Chrome 120 or newer.';
      setupAction = 'Open Extensions Page';
      setupUrl = 'chrome://extensions';
    }
  }

  const status: any = {
    userScriptsAvailable,
    userScriptsApiAvailable: !!userScriptsApiAvailable,
    userScriptsUpdateAvailable: !!userScriptsUpdateAvailable,
    setupRequired: !userScriptsAvailable,
    setupMessage,
    chromeVersion,
    setupState,
    setupTitle,
    setupAction,
    setupUrl
  };
  if (probeError) {
    status.apiProbeError = String(probeError);
  }
  return status;
}

async function persistUserScriptsStatus(status: any) {
  try {
    await SettingsManager.set({
      _userScriptsAvailable: status.userScriptsAvailable,
      _chromeVersion: status.chromeVersion
    });
  } catch (e) {
    console.warn('[ScriptVault] Failed to persist userScripts status:', e);
  }
}

// True when a match/include pattern targets the file:// scheme.
function _isFileSchemePattern(pattern: any): boolean {
  const raw = String(pattern || '').trim().toLowerCase();
  return raw.startsWith('file://') || raw.startsWith('file:/*') || raw === 'file:///*';
}

async function _hasFileScopedScripts(): Promise<boolean> {
  try {
    const scripts = await ScriptStorage.getAll();
    return (Array.isArray(scripts) ? scripts : []).some((s: any) => {
      const patterns = [
        ...(Array.isArray(s?.meta?.match) ? s.meta.match : []),
        ...(Array.isArray(s?.meta?.include) ? s.meta.include : [])
      ];
      return patterns.some(_isFileSchemePattern);
    });
  } catch (e) {
    return false;
  }
}

// Firefox 153+ makes file access an explicit opt-in permission and fixes
// extension.isAllowedFileSchemeAccess() to return true once granted (it was
// previously always false). Chrome has always exposed it. Returns whether the
// API is present and whether local-file access is currently granted.
async function probeFileSchemeAccess(): Promise<{ supported: boolean; allowed: boolean; hasFileScripts: boolean }> {
  let supported = false;
  let allowed = false;
  try {
    const g: any = globalThis as any;
    const ext: any = (g.browser && g.browser.extension)
      ? g.browser.extension
      : ((typeof chrome !== 'undefined' && (chrome as any)?.extension) ? (chrome as any).extension : null);
    if (ext && typeof ext.isAllowedFileSchemeAccess === 'function') {
      supported = true;
      allowed = !!(await ext.isAllowedFileSchemeAccess());
    }
  } catch (e) {
    supported = false;
  }
  const hasFileScripts = await _hasFileScopedScripts();
  return { supported, allowed, hasFileScripts };
}

async function probeUserScriptsAvailability() {
  const chromeVersion = _getChromeVersion();
  const capabilities = _userScriptsCapabilityFlags();
  let userScriptsAvailable = false;
  let probeError = '';

  try {
    if (!capabilities.userScriptsApiAvailable) {
      probeError = 'chrome.userScripts is unavailable';
    } else {
      await chrome.userScripts.getScripts();
      userScriptsAvailable = true;
    }
  } catch (e: any) {
    probeError = e?.message || String(e || 'chrome.userScripts probe failed');
  }

  const status = buildUserScriptsStatus({
    userScriptsAvailable,
    chromeVersion,
    probeError,
    ...capabilities
  });
  await persistUserScriptsStatus(status);
  return status;
}

function logUserScriptsSetupWarning(status: any) {
  const message = status?.setupMessage || 'userScripts API not available';
  console.warn(`[ScriptVault] ${message}`);
}

// Configure the userScripts execution world
async function configureUserScriptsWorld(status: any = null) {
  const availability = status || await probeUserScriptsAvailability();
  if (!availability.userScriptsAvailable) {
    logUserScriptsSetupWarning(availability);
    return availability;
  }

  try {
    // Configure the default USER_SCRIPT world
    await chrome.userScripts.configureWorld({
      csp: "script-src 'self' 'unsafe-inline' 'unsafe-eval' *",
      messaging: true
    });

    debugLog('userScripts world configured (Chrome', availability.chromeVersion, ')');
    return availability;
  } catch (e: any) {
    console.error('[ScriptVault] Failed to configure userScripts world:', e);
    const failedStatus = buildUserScriptsStatus({
      userScriptsAvailable: false,
      chromeVersion: availability.chromeVersion,
      userScriptsApiAvailable: availability.userScriptsApiAvailable,
      userScriptsUpdateAvailable: availability.userScriptsUpdateAvailable,
      probeError: e?.message || String(e || 'chrome.userScripts.configureWorld failed')
    });
    await persistUserScriptsStatus(failedStatus);
    return failedStatus;
  }
}

function isFirstSyncRegistrationHoldConfigured(settings: any = {}) {
  const provider = settings.syncProvider || 'none';
  const lastSync = Number(settings.lastSync || 0);
  return settings.enabled !== false
    && settings.syncHoldExecutionUntilFirstSync === true
    && settings.syncEnabled === true
    && provider !== 'none'
    && !(Number.isFinite(lastSync) && lastSync > 0);
}

async function clearFirstSyncRegistrationHoldMarker() {
  try {
    await chrome.storage.local.remove(SYNC_FIRST_RUN_REGISTRATION_HOLD_STORAGE_KEY);
  } catch (_) {}
}

async function getFirstSyncRegistrationGate(settings: any = {}) {
  if (!isFirstSyncRegistrationHoldConfigured(settings)) {
    await clearFirstSyncRegistrationHoldMarker();
    return { hold: false, timedOut: false, startedAt: null, elapsedMs: 0 };
  }

  const now = Date.now();
  let startedAt = 0;
  try {
    const data = await chrome.storage.local.get(SYNC_FIRST_RUN_REGISTRATION_HOLD_STORAGE_KEY);
    startedAt = Number(data?.[SYNC_FIRST_RUN_REGISTRATION_HOLD_STORAGE_KEY] || 0);
  } catch (_) {
    startedAt = 0;
  }
  if (!Number.isFinite(startedAt) || startedAt <= 0) {
    startedAt = now;
    try {
      await chrome.storage.local.set({ [SYNC_FIRST_RUN_REGISTRATION_HOLD_STORAGE_KEY]: startedAt });
    } catch (_) {}
  }

  const elapsedMs = Math.max(0, now - startedAt);
  if (elapsedMs >= SYNC_FIRST_RUN_REGISTRATION_HOLD_MS) {
    await clearFirstSyncRegistrationHoldMarker();
    return { hold: false, timedOut: true, startedAt, elapsedMs };
  }

  return { hold: true, timedOut: false, startedAt, elapsedMs };
}

function notifyFirstSyncRegistrationTimeout() {
  console.warn('[ScriptVault] First-sync registration hold timed out; registering scripts before first sync.');
  try {
    chrome.notifications.create(SYNC_FIRST_RUN_REGISTRATION_TIMEOUT_NOTIFICATION_ID, {
      type: 'basic',
      iconUrl: 'images/icon128.png',
      title: 'ScriptVault sync wait timed out',
      message: 'Scripts are running before the first sync completed. Run Sync Now when the provider is available.'
    });
  } catch (_) {}
}

async function maybeRegisterScriptsAfterSuccessfulSync(result: any) {
  if (!result || result.success !== true) return;
  await clearFirstSyncRegistrationHoldMarker();
  const settings = await SettingsManager.get();
  if (settings.syncHoldExecutionUntilFirstSync === true) {
    await registerAllScripts(true);
  }
}

// Register all enabled scripts with the userScripts API
async function registerAllScripts(forceReregister: any = false) {
  try {
    const availability = await probeUserScriptsAvailability();
    if (!availability.userScriptsAvailable) {
      logUserScriptsSetupWarning(availability);
      recordRegistrationSweep({
        status: 'unavailable',
        mode: 'probe',
        forceReregister,
        userScriptsAvailable: false,
        setupState: availability.setupState
      });
      return;
    }

    const registrationSettings = await SettingsManager.get();
    const firstSyncGate = await getFirstSyncRegistrationGate(registrationSettings);
    if (firstSyncGate.timedOut) {
      notifyFirstSyncRegistrationTimeout();
    } else if (firstSyncGate.hold) {
      await chrome.userScripts.unregister().catch(() => {});
      recordRegistrationSweep({
        status: 'sync-first-run-held',
        mode: 'sync-hold',
        forceReregister,
        userScriptsAvailable: true,
        setupState: availability.setupState
      });
      debugLog(`Holding userscript registration until first sync completes (${Math.ceil((SYNC_FIRST_RUN_REGISTRATION_HOLD_MS - firstSyncGate.elapsedMs) / 1000)}s remaining)`);
      return;
    }

    if (!forceReregister && !await UserScriptMessagePolicy.isScriptAuthRegistrationCurrent()) {
      forceReregister = true;
      debugLog('Refreshing userscript registrations for authenticated GM messaging');
    }

    // On normal SW wake, check if scripts are already registered to avoid
    // the destructive unregister→register cycle that creates a gap where
    // scripts aren't active on page navigations.
    //
    // Round 11: Compute a diff between enabled-in-storage and currently-registered.
    // If a previous `Promise.allSettled` registration partially failed, the registered
    // set may be missing some scripts indefinitely — register just the missing subset
    // rather than short-circuiting the whole call.
    if (!forceReregister) {
      try {
        const existing = await chrome.userScripts.getScripts();
        if (existing && existing.length > 0) {
          const settings = registrationSettings;
          if (!settings.enabled) {
            debugLog(`Skipping re-registration: scripts globally disabled`);
            recordRegistrationSweep({
              status: 'global-disabled',
              mode: 'diff',
              forceReregister,
              userScriptsAvailable: true,
              setupState: availability.setupState,
              alreadyRegisteredScripts: existing.length
            });
            return;
          }
          const scripts = await ScriptStorage.getAll();
          const enabledScripts = scripts.filter(isScriptEligibleForRegistration);
          const registeredIds = new Set(existing.map(s => s.id));
          const enabledIds = new Set(enabledScripts.map((s: any) => s.id));
          const missing = enabledScripts.filter((s: any) => !registeredIds.has(s.id));
          // Stale = registered but no longer in storage OR now disabled.
          // Unregister so wake doesn't leave dead injections active until the
          // next forceReregister cycle.
          const stale = existing
            .map(s => s.id)
            .filter(id => !enabledIds.has(id));
          let staleUnregisterFailures = 0;

          if (missing.length === 0 && stale.length === 0) {
            debugLog(`Skipping re-registration: ${existing.length} scripts already registered, no diff`);
            recordRegistrationSweep({
              status: 'already-current',
              mode: 'diff',
              forceReregister,
              userScriptsAvailable: true,
              setupState: availability.setupState,
              enabledScripts: enabledScripts.length,
              alreadyRegisteredScripts: existing.length,
              skippedScripts: enabledScripts.length
            });
            return;
          }

          if (stale.length > 0) {
            debugLog(`Unregistering ${stale.length} stale script(s) on wake`);
            try {
              await chrome.userScripts.unregister({ ids: stale });
            } catch (e: any) {
              staleUnregisterFailures++;
              console.warn('[ScriptVault] Failed to unregister stale scripts:', e?.message || e);
            }
          }

          if (missing.length === 0) {
            recordRegistrationSweep({
              status: staleUnregisterFailures > 0 ? 'partial' : 'stale-cleaned',
              mode: 'diff',
              forceReregister,
              userScriptsAvailable: true,
              setupState: availability.setupState,
              enabledScripts: enabledScripts.length,
              alreadyRegisteredScripts: existing.length,
              skippedScripts: enabledScripts.length,
              staleUnregisteredScripts: stale.length,
              staleUnregisterFailures
            });
            return;
          }

          // Preload @require deps for the missing subset in parallel
          const missingRequires = new Set();
          for (const script of missing) {
            for (const req of (script.meta?.require || [])) {
              missingRequires.add(req);
            }
          }
          if (missingRequires.size > 0) {
            debugLog(`Preloading ${missingRequires.size} @require deps for ${missing.length} missing scripts`);
            // Phase 39.22 — bound each fetch so a CSP-strict / slow server can't
            // deadlock the whole wake path.
            await Promise.allSettled([...missingRequires].map(url => _withTimeout(fetchRequireScript(url), 15000, `fetchRequire:${url}`)));
          }

          debugLog(`Registering ${missing.length} missing script(s) (diff from ${existing.length} already registered)`);
          // Phase 39.22 — per-script registration timeout (VM #2513). Without
          // this, one chrome.userScripts.register() hang blocks the rest.
          const diffResults = await Promise.allSettled(missing.map((script: any) => _withTimeout(registerScript(script), 5000, `registerScript:${script.id}`)));
          const diffFailures = diffResults.filter(r => r.status === 'rejected');
          if (diffFailures.length > 0) {
            console.warn(`[ScriptVault] ${diffFailures.length} missing script(s) failed to register:`, diffFailures.map(r => r.reason?.message || r.reason));
          }
          recordRegistrationSweep({
            status: diffFailures.length > 0 || staleUnregisterFailures > 0 ? 'partial' : 'diff-registered',
            mode: 'diff',
            forceReregister,
            userScriptsAvailable: true,
            setupState: availability.setupState,
            enabledScripts: enabledScripts.length,
            alreadyRegisteredScripts: existing.length,
            registeredScripts: missing.length - diffFailures.length,
            skippedScripts: enabledScripts.length - missing.length,
            staleUnregisteredScripts: stale.length,
            failedScripts: diffFailures.length,
            staleUnregisterFailures,
            requirePreloadCount: missingRequires.size
          });
          return;
        }
      } catch (e) {
        // getScripts not available or failed — fall through to full registration
      }
    }

    // Full re-registration: unregister all, then register fresh
    await chrome.userScripts.unregister().catch(() => {});
    
    const scripts = await ScriptStorage.getAll();
    const settings = registrationSettings;
    
    if (!settings.enabled) {
      debugLog('Scripts globally disabled');
      recordRegistrationSweep({
        status: 'global-disabled',
        mode: forceReregister ? 'force' : 'full',
        forceReregister,
        userScriptsAvailable: true,
        setupState: availability.setupState
      });
      return;
    }
    
    const enabledScripts = scripts.filter(isScriptEligibleForRegistration);

    // Sort by combined @priority + @weight (higher = first), then position.
    // @priority is the legacy ScriptVault directive; @weight is the Userscripts
    // (Safari) standard (1..999). Either bumps a script earlier within the same
    // @run-at — we take the max so authors who set both don't get surprised by
    // the lower one winning.
    enabledScripts.sort((a: any, b: any) => {
      const pa = Math.max(a.meta?.priority || 0, a.meta?.weight || 0);
      const pb = Math.max(b.meta?.priority || 0, b.meta?.weight || 0);
      if (pb !== pa) return pb - pa;
      return (a.position || 0) - (b.position || 0);
    });

    debugLog(`Registering ${enabledScripts.length} scripts`);

    // v2.0: Preload all @require dependencies in parallel before registration
    // This prevents N sequential fetches during registration
    const allRequires = new Set();
    for (const script of enabledScripts) {
      for (const req of (script.meta?.require || [])) {
        allRequires.add(req);
      }
    }
    if (allRequires.size > 0) {
      debugLog(`Preloading ${allRequires.size} @require dependencies`);
      const preloadStart = Date.now();
      // Phase 39.22 — see diff-path comment above.
      await Promise.allSettled([...allRequires].map(url => _withTimeout(fetchRequireScript(url), 15000, `fetchRequire:${url}`)));
      debugLog(`Preloaded in ${Date.now() - preloadStart}ms`);
    }

    // Register all scripts in parallel — significantly faster on large script collections
    // Phase 39.22 — per-script timeout (VM #2513).
    const results = await Promise.allSettled(enabledScripts.map((script: any) => _withTimeout(registerScript(script), 5000, `registerScript:${script.id}`)));
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      console.warn(`[ScriptVault] ${failures.length} script(s) failed to register:`, failures.map(r => r.reason?.message || r.reason));
    }
    await UserScriptMessagePolicy.markScriptAuthRegistrationCurrent();
    recordRegistrationSweep({
      status: failures.length > 0 ? 'partial' : 'registered',
      mode: forceReregister ? 'force' : 'full',
      forceReregister,
      userScriptsAvailable: true,
      setupState: availability.setupState,
      enabledScripts: enabledScripts.length,
      registeredScripts: enabledScripts.length - failures.length,
      failedScripts: failures.length,
      requirePreloadCount: allRequires.size
    });
  } catch (e) {
    recordRegistrationSweep({
      status: 'error',
      mode: forceReregister ? 'force' : 'full',
      forceReregister,
      userScriptsAvailable: null,
      setupState: 'unknown'
    });
    console.error('[ScriptVault] Failed to register scripts:', e);
  }
}

/**
 * Feature-detect chrome.userScripts.update (Chrome 138+). When present, the
 * runtime can replace a single script's registration in place instead of
 * round-tripping through unregister + register, which avoids the brief
 * unregistered window where a tab navigation could miss the script.
 */
function _supportsUserScriptsUpdate() {
  return typeof chrome?.userScripts?.update === 'function';
}

/**
 * Replace a script's registration without an unregister/register flicker.
 *
 * Behavior matrix:
 *   - script.enabled === false   → unregister and return; nothing to update.
 *   - chrome.userScripts.update supported (Chrome 138+) → re-run registerScript
 *     with useUpdate so the same registration payload is swapped via update().
 *     Falls back to the full cycle on any update failure.
 *   - Older Chrome → existing unregister + register cycle.
 *
 * Callers that previously wrote `await unregisterScript(id); if
 * (script.enabled !== false) await registerScript(script);` can replace the
 * pair with `await reregisterScript(script)`.
 */
async function reregisterScript(script: any) {
  if (!chrome.userScripts || !script) return;
  if (!isScriptEligibleForRegistration(script)) {
    await unregisterScript(script.id);
    return;
  }
  if (_supportsUserScriptsUpdate()) {
    try {
      // Drop any prior @webRequest DNR rules before the update; the update
      // path doesn't call unregisterScript so the rule reconciliation has
      // to happen here. applyWebRequestRules() inside registerScript will
      // re-establish the rules for the new metadata.
      await removeWebRequestRules(script.id).catch(() => {});
      await registerScript(script, { useUpdate: true, throwOnError: true });
      return;
    } catch (e) {
      // Fall through to the full cycle. The unregister below is a safety
      // net — update failures usually leave the prior registration intact,
      // but unregistering guarantees a clean slate before re-registering.
    }
  }
  await unregisterScript(script.id);
  await registerScript(script);
}

// Register a single script
async function registerScript(script: any, { useUpdate = false, throwOnError = false }: any = {}) {
  try {
    if (!isScriptEligibleForRegistration(script)) {
      await unregisterScript(script?.id);
      return;
    }
    const meta = script.meta;
    const settings = script.settings || {};

    // @crontab scripts execute on a schedule rather than on page load.
    // Register a chrome alarm instead of a chrome.userScripts entry.
    if (meta.crontab) {
      const alarmName = getCrontabAlarmName(script.id);
      await chrome.alarms.clear(alarmName).catch(() => {});
      // Metadata may have just gained @crontab on an in-place update (the
      // Chrome 138+ update path never calls unregisterScript). Drop any prior
      // page-load registration so the script doesn't run BOTH on load and on
      // schedule.
      if (chrome.userScripts) {
        try { await chrome.userScripts.unregister({ ids: [script.id] }); } catch (_) {}
      }
      await scheduleCrontabAlarm(script);
      return;
    }

    // DOM-less @background scripts need an offscreen/service-worker runner.
    // Until that default-off runner exists, keep these scripts dormant instead
    // of registering them as normal page-load userscripts.
    if (meta.background) {
      const backgroundPlan = planBackgroundScript(script, await SettingsManager.get());
      await chrome.alarms.clear(getCrontabAlarmName(script.id)).catch(() => {});
      if (chrome.userScripts) {
        try { await chrome.userScripts.unregister({ ids: [script.id] }); } catch (_) {}
      }
      debugLog(`Skipped @background script (${backgroundPlan.status}): ${backgroundPlan.reason}`);
      return;
    }

    // Dashboard scheduler: interval/oneTime schedules run only on their
    // sv_sched_ alarm (like @crontab), so skip page-load registration to avoid
    // running BOTH on load and on schedule. time/day/dateRange schedules stay
    // page-load scripts but get a runtime guard (built below) that gates them
    // to their window.
    const scriptSchedule = await getScheduleForScript(script.id);
    if (scriptSchedule && SCHEDULE_ALARM_TYPES.has(scriptSchedule.type)) {
      if (chrome.userScripts) {
        try { await chrome.userScripts.unregister({ ids: [script.id] }); } catch (_) {}
      }
      debugLog(`Skipped page-load registration for alarm-scheduled script: ${meta.name} (${scriptSchedule.type})`);
      return;
    }

    if (!chrome.userScripts) return;
    // Not a @crontab script — clear any stale crontab alarm left over from a
    // prior version of this script's metadata (e.g. @crontab was just removed
    // on an in-place update) so it stops firing on schedule.
    await chrome.alarms.clear(getCrontabAlarmName(script.id)).catch(() => {});
    
    // Build match patterns with URL override support
    const matches = [];
    const excludeMatches: string[] = [];
    // Count how many positive patterns the script actually requested. If a user
    // scopes a script to a site whose pattern is malformed (IPv6 host, empty
    // file:// host, ported host Chrome rejects), every pattern can resolve
    // invalid — and widening to <all_urls> would run the script EVERYWHERE,
    // the opposite of the restriction. When positive patterns were requested
    // but none survived, fail closed instead of expanding scope.
    let requestedPositivePatterns = 0;
    let needsPositiveRuntimeMatchGuard = false;
    const positiveRuntimeMatchPatterns: any = [];

    // Collect regex @include/@exclude patterns for runtime filtering. Ported
    // @match patterns are widened for Chrome registration and added here as
    // exact runtime guards so localhost:3000 does not run on localhost:8080.
    const regexIncludes: any = [];
    const regexExcludes = [];

    const addPositiveMatchPattern = (pattern: any) => {
      const nativePattern = nativeMatchPatternForRegistration(pattern);
      if (!nativePattern) return false;
      matches.push(nativePattern);
      positiveRuntimeMatchPatterns.push(pattern);
      if (nativePattern !== pattern) needsPositiveRuntimeMatchGuard = true;
      return true;
    };

    const addExcludeMatchPattern = (pattern: any) => {
      const nativePattern = nativeMatchPatternForRegistration(pattern);
      if (!nativePattern) return false;
      if (nativePattern === pattern) {
        excludeMatches.push(nativePattern);
      } else {
        const runtimeRegex = matchPatternToRuntimeRegex(pattern);
        if (runtimeRegex) regexExcludes.push(runtimeRegex);
      }
      return true;
    };

    // Process @match (if enabled in settings)
    if (settings.useOriginalMatches !== false && meta.match && Array.isArray(meta.match)) {
      for (const m of meta.match) {
        if (typeof m === 'string' && m.trim()) requestedPositivePatterns++;
        if (isValidMatchPattern(m)) {
          addPositiveMatchPattern(m);
        }
      }
    }

    // Process user @match patterns
    if (settings.userMatches && Array.isArray(settings.userMatches)) {
      for (const m of settings.userMatches) {
        if (typeof m === 'string' && m.trim()) requestedPositivePatterns++;
        if (isValidMatchPattern(m)) {
          addPositiveMatchPattern(m);
        } else {
          // Try to convert glob-style to match pattern
          const converted = convertIncludeToMatch(m);
          if (converted && isValidMatchPattern(converted)) {
            addPositiveMatchPattern(converted);
          }
        }
      }
    }
    
    // Process @include (if enabled in settings)
    if (settings.useOriginalIncludes !== false && meta.include && Array.isArray(meta.include)) {
      for (const inc of meta.include) {
        if (isRegexPattern(inc)) {
          // Regex pattern - extract broad match patterns for registration, filter at runtime.
          // Deliberately NOT counted as a requestedPositivePattern: the scope is
          // enforced by the wrapper's runtime __regexIncludes guard, not by a static
          // match pattern. extractMatchPatternsFromRegex returns [] for nearly every
          // real-world regex, so counting it would trip the fail-closed check below
          // and refuse to register a perfectly valid script.
          regexIncludes.push(inc);
          const broad = extractMatchPatternsFromRegex(inc);
          if (broad.length > 0) {
            matches.push(...broad);
          }
        } else {
          if (typeof inc === 'string' && inc.trim()) requestedPositivePatterns++;
          const converted = convertIncludeToMatch(inc);
          if (converted && isValidMatchPattern(converted)) {
            addPositiveMatchPattern(converted);
          } else if (inc === '*') {
            addPositiveMatchPattern('<all_urls>');
          }
        }
      }
    }
    
    // Process user @include patterns
    if (settings.userIncludes && Array.isArray(settings.userIncludes)) {
      for (const inc of settings.userIncludes) {
        if (typeof inc === 'string' && inc.trim()) requestedPositivePatterns++;
      const converted = convertIncludeToMatch(inc);
      if (converted && isValidMatchPattern(converted)) {
          addPositiveMatchPattern(converted);
      } else if (inc === '*') {
          addPositiveMatchPattern('<all_urls>');
      }
      }
    }
    
    // Process @exclude-match (stored as excludeMatch by parser)
    if (meta.excludeMatch && Array.isArray(meta.excludeMatch)) {
      for (const m of meta.excludeMatch) {
        if (isValidMatchPattern(m)) {
          addExcludeMatchPattern(m);
        }
      }
    }
    
    // Process @exclude (if enabled) - convert to exclude matches where possible
    if (settings.useOriginalExcludes !== false && meta.exclude && Array.isArray(meta.exclude)) {
      for (const exc of meta.exclude) {
        if (isRegexPattern(exc)) {
          regexExcludes.push(exc);
          continue;
        }
        const converted = convertIncludeToMatch(exc);
        if (converted && isValidMatchPattern(converted)) {
          addExcludeMatchPattern(converted);
        }
      }
    }
    
    // Process user @exclude patterns
    if (settings.userExcludes && Array.isArray(settings.userExcludes)) {
      for (const exc of settings.userExcludes) {
        const converted = convertIncludeToMatch(exc);
        if (converted && isValidMatchPattern(converted)) {
          addExcludeMatchPattern(converted);
        }
      }
    }
    
    // Add denied hosts as exclude patterns
    const globalSettings = await SettingsManager.get();
    const deniedHosts = globalSettings.deniedHosts;
    if (deniedHosts && Array.isArray(deniedHosts)) {
      for (const host of deniedHosts) {
        // Route through addExcludeMatchPattern rather than pushing raw. The
        // Settings validator accepts `*.example.com`, a bare `*`, and
        // `host:8080`, and naive interpolation turned those into
        // `*://*.*.example.com/*`, `*://*.*/*`, and a ported pattern — none of
        // which are legal match patterns. chrome.userScripts.register rejects
        // the whole call, so one bad denied-host entry stopped EVERY script
        // from registering. The helper port-normalizes and drops anything that
        // still isn't native-legal.
        for (const pattern of deniedHostExcludePatterns(host)) {
          addExcludeMatchPattern(pattern);
        }
      }
    }
    // Add blacklisted pages as exclude patterns
    if (globalSettings.pageFilterMode === 'blacklist' && globalSettings.blacklistedPages) {
      const blacklist = globalSettings.blacklistedPages.split('\n').map((s: any) => s.trim()).filter(Boolean);
      for (const p of blacklist) {
        const converted = convertIncludeToMatch(p);
        if (converted && isValidMatchPattern(converted)) {
          addExcludeMatchPattern(converted);
        }
      }
    }

    if (needsPositiveRuntimeMatchGuard) {
      for (const pattern of positiveRuntimeMatchPatterns) {
        const runtimeRegex = matchPatternToRuntimeRegex(pattern);
        if (runtimeRegex) regexIncludes.push(runtimeRegex);
      }
    }

    // If positive patterns WERE requested but none survived, they were all
    // malformed. Fail closed — do NOT widen to <all_urls>, which would run the
    // script everywhere and defeat an explicit scope restriction. Unregister any
    // prior registration so it stops running, then surface the error.
    // A regex @include is exempt: the wrapper's runtime __regexIncludes guard
    // returns before any user code when the URL doesn't match, so registering
    // broadly does not actually widen the script's effective scope.
    if (matches.length === 0 && requestedPositivePatterns > 0 && regexIncludes.length === 0) {
      await chrome.userScripts.unregister({ ids: [script.id] }).catch(() => {});
      throw new Error('No valid match patterns — script scope could not be applied');
    }

    // If no matches at all (script defined none), use <all_urls> (some scripts use @include *)
    if (matches.length === 0) {
      matches.push('<all_urls>');
    }

    await ensureScopedHostPermissionsForScript(script, globalSettings);

    // Map run-at values (with per-script setting override)
    const runAtMap: any = {
      'document-start': 'document_start',
      'document-end': 'document_end',
      'document-idle': 'document_idle',
      'document-body': 'document_end',
      'context-menu': 'document_idle' // context-menu scripts register idle, triggered via context menu
    };

    // @run-in: filter by tab type (normal-tabs, incognito-tabs)
    const runIn = meta['run-in'] || '';
    if (runIn === 'incognito-tabs') {
      // Only run in incognito — skip registration for normal context
      // (chrome.userScripts doesn't support incognito filtering natively,
      // so we inject a runtime guard into the wrapper)
    } else if (runIn === 'normal-tabs') {
      // Only run in normal tabs — runtime guard injected
    }

    // Check for per-script runAt override
    let effectiveRunAt = meta['run-at'];
    if (settings.runAt && settings.runAt !== 'default') {
      effectiveRunAt = settings.runAt;
    }
    const isContextMenu = effectiveRunAt === 'context-menu';
    if (isContextMenu) {
      // Context-menu scripts are not auto-registered; they run on-demand via context menu click
      debugLog(`Skipping auto-register for context-menu script: ${meta.name}`);
      return;
    }
    const runAt = runAtMap[effectiveRunAt] || 'document_idle';

    // Determine execution world based on @inject-into and @sandbox
    // chrome.userScripts API only supports 'USER_SCRIPT' world, not 'MAIN'
    // For @inject-into page / @sandbox raw, we still register in USER_SCRIPT world
    // but pass a flag so the wrapper injects the user's code into the page context via <script>
    const world = 'USER_SCRIPT';
    const injectInto = meta['inject-into'] || 'auto';
    const sandbox = meta.sandbox || '';
    const injectIntoPage = (injectInto === 'page' || sandbox === 'raw');
    
    // Fetch @require dependencies
    const requireScripts: any = [];
    const requires = Array.isArray(meta.require) ? meta.require : (meta.require ? [meta.require] : []);
    
    const failedRequires = [];
    const failedRequireErrors = [];
    for (const url of requires) {
      try {
        const code = await fetchRequireScript(url);
        if (code) {
          requireScripts.push({ url, code });
        } else {
          failedRequires.push(url);
          failedRequireErrors.push({ url, message: 'empty response' });
        }
      } catch (e: any) {
        console.warn(`[ScriptVault] Failed to fetch @require ${url}:`, e.message);
        failedRequires.push(url);
        failedRequireErrors.push({ url, message: e?.message || String(e) });
      }
    }

    // Track failed @require dependencies on the script for UI notification
    if (failedRequires.length > 0) {
      script.settings = script.settings || {};
      script.settings._failedRequires = failedRequires;
      script.settings._failedRequireErrors = failedRequireErrors;
      await ScriptStorage.set(script.id, script);
      debugWarn(`${meta.name}: ${failedRequires.length} @require dependency(s) failed to load`);
    } else if (script.settings?._failedRequires || script.settings?._failedRequireErrors) {
      // Clear previous failures
      delete script.settings._failedRequires;
      delete script.settings._failedRequireErrors;
      await ScriptStorage.set(script.id, script);
    }
    
    // Pre-fetch @resource dependencies
    await ResourceCache.prefetchResources(meta.resource);

    // Pre-fetch storage values for this script
    const storedValues = await ScriptValues.getAll(script.id) || {};
    
    // Build the script code with GM API wrapper, @require scripts, and pre-loaded storage
    if (injectIntoPage) {
      debugLog(`Note: @inject-into page / @sandbox raw not fully supported in MV3, running in USER_SCRIPT world: ${meta.name}`);
    }
    // time/day/dateRange schedule → inject a runtime guard that gates the
    // script to its window (returns early on out-of-window page loads).
    const scheduleGuard = (scriptSchedule && SCHEDULE_GUARD_TYPES.has(scriptSchedule.type))
      ? buildScheduleGuardFn(scriptSchedule)
      : '';
    const scriptAuthToken = await UserScriptMessagePolicy.getScriptAuthToken(script.id);
    const wrappedCode = buildWrappedScript(script, requireScripts, storedValues, regexIncludes, regexExcludes, scheduleGuard, scriptAuthToken);

    // Per-script frame-mode override (settings.frameMode): 'top' forces top
    // frame only, 'all' forces all frames, and any other value (including
    // 'default'/undefined) falls back to the `@noframes` metadata.
    const frameMode = script.settings?.frameMode;
    let allFrames;
    if (frameMode === 'top') allFrames = false;
    else if (frameMode === 'all') allFrames = true;
    else allFrames = !meta.noframes;

    // Register the script
    const registration: any = {
      id: script.id,
      matches: matches,
      excludeMatches: excludeMatches.length > 0 ? excludeMatches : undefined,
      js: [{ code: wrappedCode }],
      runAt: runAt,
      allFrames: allFrames,
      world: world
    };

    // Chrome 133+ / Firefox 153+: configure and use a per-script worldId so
    // scripts do not collide in one shared sandbox. An engine that has no
    // support falls back to the default world — but that fallback is an
    // isolation loss, so it is recorded rather than swallowed.
    let worldConfigured = false;
    const worldIdSupported = await _ensureUserScriptWorldIdSupport();
    const desiredWorldId = _userScriptWorldIdFor(script.id);
    if (worldIdSupported && desiredWorldId) {
      try {
        await chrome.userScripts.configureWorld({
          worldId: desiredWorldId,
          csp: "script-src 'self' 'unsafe-inline' 'unsafe-eval' *",
          messaging: true
        });
        worldConfigured = true;
      } catch (e) {
        // The engine said it supports per-script worlds and then refused this
        // one (world-count limit, reserved id, transient failure). Registering
        // into the shared world is still better than not registering, but the
        // user and the diagnostics need to know it happened.
        await _recordWorldIsolationLoss(script, e);
      }
    } else if (!worldIdSupported && _isFirefoxRuntime()) {
      // A Firefox old enough to lack per-world support: one shared sandbox for
      // every script on the page. Knowable, so make it visible once.
      await _recordWorldIsolationLoss(script, 'this browser version has no per-script world support');
    }

    if (worldConfigured) {
      registration.worldId = desiredWorldId;
      await _clearWorldIsolationLoss(script);
    }

    try {
      // Chrome 138+: when reregisterScript routed us here with useUpdate, swap
      // the existing registration in place instead of failing on "already
      // registered". Chrome 131+ supports messaging in USER_SCRIPT world for
      // both register() and update(); keep the same fallback semantics.
      const payload: any = [{ ...registration, messaging: world === 'USER_SCRIPT' }];
      if (useUpdate && _supportsUserScriptsUpdate()) {
        try {
          await chrome.userScripts.update(payload);
        } catch (updateErr) {
          // update() throws on "no matching script" — fall back to register
          // so the first save after a SW restart still registers cleanly.
          await chrome.userScripts.register(payload);
        }
      } else {
        await chrome.userScripts.register(payload);
      }
    } catch (e: any) {
      if (e.message?.includes('messaging')) {
        // Fallback for older Chrome versions that don't support the messaging property
        await chrome.userScripts.register([registration]);
      } else if (registration.worldId && e.message?.includes('worldId')) {
        // configureWorld accepted worldId but register/update did not; drop the
        // per-script world rather than leaving the script unregistered — and
        // record it, because this leaves the script in the shared sandbox.
        delete registration.worldId;
        await chrome.userScripts.register([{ ...registration, messaging: world === 'USER_SCRIPT' }]);
        await _recordWorldIsolationLoss(script, e);
      } else {
        throw e;
      }
    }

    debugLog(`Registered: ${meta.name} (${requires.length} @require, ${Object.keys(storedValues).length} stored values)`);

    // Apply @webRequest declarativeNetRequest rules if defined
    if (meta.webRequest) {
      const rules = Array.isArray(meta.webRequest) ? meta.webRequest : [meta.webRequest];
      const settings = await SettingsManager.get();
      const ruleResult = await applyWebRequestRules(script.id, rules, { script, settings });
      if (!ruleResult?.success) {
        throw new Error(ruleResult?.error || 'GM_webRequest rule rejected');
      }
    }

    if (script.settings?._registrationError) {
      delete script.settings._registrationError;
      await ScriptStorage.set(script.id, script);
    }
  } catch (e: any) {
    console.error(`[ScriptVault] Failed to register ${script.meta?.name || script.id}:`, e);
    // Mark script with registration failure for UI display
    try {
      script.settings = script.settings || {};
      script.settings._registrationError = e.message || 'Registration failed';
      await ScriptStorage.set(script.id, script);
    } catch {}
    if (throwOnError) throw e;
  }
}

// Cache for @require scripts (in-memory for current session)
// Capped at 500 entries to prevent unbounded memory growth; evicts oldest entry on overflow.
const requireCache = new Map();
const REQUIRE_CACHE_MAX = 500;

function requireCacheSet(key: any, value: any) {
  if (!requireCache.has(key) && requireCache.size >= REQUIRE_CACHE_MAX) {
    requireCache.delete(requireCache.keys().next().value);
  }
  requireCache.set(key, value);
}

// Common library fallback URLs
const LIBRARY_FALLBACKS = {
  'jquery': [
    'https://code.jquery.com/jquery-3.7.1.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js',
    'https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js'
  ],
  'jquery@3': [
    'https://code.jquery.com/jquery-3.7.1.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js'
  ],
  'jquery@2': [
    'https://code.jquery.com/jquery-2.2.4.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jquery/2.2.4/jquery.min.js'
  ],
  'gm_config': [
    'https://cdn.jsdelivr.net/npm/gm_config@2024.12.1/gm_config.min.js',
    'https://cdn.jsdelivr.net/gh/sizzlemctwizzle/GM_config@master/gm_config.js',
    'https://raw.githubusercontent.com/sizzlemctwizzle/GM_config/master/gm_config.js',
    'https://greasyfork.org/scripts/1884-gm-config/code/gm_config.js',
    'https://openuserjs.org/src/libs/sizzle/GM_config.js'
  ],
  'mutation-summary': [
    'https://cdn.jsdelivr.net/npm/mutation-summary@1.0.1/dist/mutation-summary.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/mutation-summary/1.0.1/mutation-summary.min.js',
    'https://unpkg.com/mutation-summary@1.0.1/dist/mutation-summary.min.js'
  ]
};

// Find fallback URLs for a library
function getFallbackUrls(url: any) {
  if (typeof url !== 'string') return [];
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (_) {
    return [];
  }
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();

  // Only substitute a library when the URL is a known upstream distribution
  // path. A random host/path containing "jquery" (or a plugin filename on an
  // official host) must never receive jQuery core bytes.
  const isGmConfigUrl =
    (host === 'cdn.jsdelivr.net' && /\/(?:gm_config|gm-config|gm4_config)(?:[@/._-]|$)/.test(path)) ||
    (host === 'raw.githubusercontent.com' && /^\/sizzlemctwizzle\/gm_config(?:\/|$)/.test(path)) ||
    (host === 'greasyfork.org' && /^\/scripts\/1884-gm-config(?:\/|$)/.test(path)) ||
    (host === 'openuserjs.org' && path === '/src/libs/sizzle/gm_config.js');
  if (isGmConfigUrl) {
    return LIBRARY_FALLBACKS['gm_config'];
  }

  const isMutationSummaryUrl =
    (host === 'cdn.jsdelivr.net' && /\/mutation-summary(?:[@/._-]|$)/.test(path)) ||
    (host === 'cdnjs.cloudflare.com' && /^\/ajax\/libs\/mutation-summary\//.test(path)) ||
    (host === 'unpkg.com' && /^\/mutation-summary@/.test(path));
  if (isMutationSummaryUrl) {
    return LIBRARY_FALLBACKS['mutation-summary'];
  }

  const isJqueryCoreUrl =
    (host === 'code.jquery.com' && /^\/jquery(?:-(?:\d+(?:\.\d+)*))?(?:\.min)?\.js$/.test(path)) ||
    ((host === 'cdnjs.cloudflare.com' || host === 'ajax.googleapis.com') &&
      /^\/ajax\/libs\/jquery\/\d+(?:\.\d+)*\/jquery(?:\.min)?\.js$/.test(path));
  if (isJqueryCoreUrl) {
    const majorMatch = path.match(/\/jquery-(\d+)(?:\.|\/|$)/) || path.match(/\/jquery\/(\d+)(?:\.|\/|$)/);
    const major = majorMatch ? Number(majorMatch[1]) : 3;
    if (major === 1) return [];
    return major === 2 ? LIBRARY_FALLBACKS['jquery@2'] : LIBRARY_FALLBACKS['jquery@3'];
  }

  // For unpkg URLs, try jsdelivr as fallback
  if (host === 'unpkg.com') {
    const jsdelivrUrl = `https://cdn.jsdelivr.net/npm${parsed.pathname}${parsed.search}`;
    return [jsdelivrUrl];
  }

  // For rawgit/raw.githubusercontent, try jsdelivr gh
  if (host === 'raw.githubusercontent.com') {
    // Convert: https://raw.githubusercontent.com/user/repo/branch/path
    // To: https://cdn.jsdelivr.net/gh/user/repo@branch/path
    const match = url.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)/);
    if (match) {
      const [, user, repo, branch, path] = match;
      return [`https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/${path}`];
    }
  }
  
  return [];
}

// Check if a URL is known to be unfetchable (requires auth, blocked by CORS, etc.)
function isUnfetchableUrl(url: any) {
  const lowerUrl = url.toLowerCase();
  
  // Font Awesome kit URLs require authentication
  if (lowerUrl.includes('kit.fontawesome.com')) {
    return true;
  }
  
  // Google Fonts CSS (not JS, but sometimes used)
  if (lowerUrl.includes('fonts.googleapis.com')) {
    return true;
  }
  
  // URLs with authentication tokens that will fail
  if (lowerUrl.includes('?token=') || lowerUrl.includes('&token=')) {
    return true;
  }
  
  return false;
}

// Fetch a @require script with caching and fallbacks
// Verify SRI hash for fetched content
// Normalize a base64 / base64url value (with or without padding) to canonical
// padded standard base64 so SRI hashes pasted in either encoding compare equal.
function _normalizeSriBase64(value: any) {
  let s = String(value).replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  const rem = s.length % 4;
  if (rem === 2) s += '==';
  else if (rem === 3) s += '=';
  return s;
}

async function verifySRI(code: any, hashStr: any) {
  if (!hashStr) return true; // No integrity requested — nothing to verify.
  // Support formats: sha256-<base64>, sha384/512, md5-<hex>, with - or = separator.
  const match = hashStr.match(/^(sha256|sha384|sha512|md5)[-=](.+)$/i);
  if (!match) return true; // Not an SRI hash string — nothing enforceable to verify.
  const [, algo, expected] = match;
  if (!expected) return true;
  const algoMap: any = { sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' };
  const algoName = algoMap[algo.toLowerCase()];
  // MD5 (and anything SubtleCrypto can't compute) is unverifiable; treat as
  // "no enforceable integrity" rather than failing closed and breaking scripts.
  if (!algoName) {
    console.warn('[ScriptVault] SRI: hash algorithm cannot be verified with SubtleCrypto; skipping integrity check for', hashStr);
    return true;
  }
  try {
    const digest = await crypto.subtle.digest(algoName, new TextEncoder().encode(code));
    const actual = btoa(String.fromCharCode(...new Uint8Array(digest)));
    return _normalizeSriBase64(actual) === _normalizeSriBase64(expected);
  } catch (e: any) {
    // Integrity WAS requested with a verifiable algorithm but verification could
    // not complete — fail CLOSED. Accepting unverified bytes would make the SRI
    // pin a no-op and defeat protection against a compromised/MITM'd CDN.
    console.warn('[ScriptVault] SRI verification error for hash', hashStr, '—', e.message, '; rejecting require');
    return false;
  }
}

function parseRequireIntegrity(url: any) {
  // Extract SRI hash from URL fragment (e.g., url#sha256=abc123 or url#md5=abc123)
  let sriHash = null;
  let fetchUrl = url;
  const hashIdx = url.indexOf('#');
  if (hashIdx > 0) {
    const fragment = url.slice(hashIdx + 1);
    if (/^(sha256|sha384|sha512|md5)[-=]/i.test(fragment)) {
      sriHash = fragment;
      fetchUrl = url.slice(0, hashIdx);
    }
  }
  return { fetchUrl, sriHash };
}

function hasVerifiableRequireIntegrity(url: any) {
  const { sriHash } = parseRequireIntegrity(url);
  return /^(sha256|sha384|sha512)[-=]/i.test(sriHash || '');
}

function isPlainHttpUrl(url: any) {
  try {
    return new URL(url).protocol === 'http:';
  } catch (_) {
    return false;
  }
}

async function buildRequireCacheKey(url: any) {
  const data = new TextEncoder().encode(url);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `require_cache_${hex}`;
}

function isNpmRequireSpec(url: any) {
  return typeof NpmResolver !== 'undefined' &&
    typeof NpmResolver.isNpmRequire === 'function' &&
    NpmResolver.isNpmRequire(url);
}

async function fetchRequireScript(url: any, options: any = {}) {
  const bypassCache = options.bypassCache === true;
  const cacheResult = options.cacheResult !== false;

  if (isNpmRequireSpec(url)) {
    debugLog('Resolving npm @require:', url);

    if (!bypassCache && requireCache.has(url)) {
      debugLog('Using cached npm @require:', url);
      return requireCache.get(url);
    }

    let cacheKey = '';
    if (!bypassCache || cacheResult) {
      cacheKey = await buildRequireCacheKey(url);
    }

    if (!bypassCache) {
      try {
        const cached = await chrome.storage.local.get(cacheKey);
        if (cached[cacheKey]?.code) {
          const age = Date.now() - (cached[cacheKey].timestamp || 0);
          if (age < 7 * 24 * 60 * 60 * 1000) {
            debugLog('Using persistent cached npm @require:', url);
            requireCacheSet(url, cached[cacheKey].code);
            if (cached[cacheKey].url) requireCacheSet(cached[cacheKey].url, cached[cacheKey].code);
            return cached[cacheKey].code;
          }
        }
      } catch (e) {
        // Ignore cache errors
      }
    }

    if (typeof NpmResolver?.resolveWithCode !== 'function') {
      console.warn(`[ScriptVault] NPM @require resolver unavailable: ${url}`);
      return null;
    }

    try {
      const resolved = await NpmResolver.resolveWithCode(url);
      if (!resolved || typeof resolved.code !== 'string' || !resolved.url || !resolved.integrity) {
        throw new Error('NPM resolver returned an incomplete result');
      }

      const valid = await verifySRI(resolved.code, resolved.integrity);
      if (!valid) {
        throw new Error(`computed SRI verification failed for ${resolved.url}`);
      }

      if (cacheResult) {
        requireCacheSet(url, resolved.code);
        requireCacheSet(resolved.url, resolved.code);
        try {
          await chrome.storage.local.set({
            [cacheKey]: {
              code: resolved.code,
              timestamp: Date.now(),
              url: resolved.url,
              integrity: resolved.integrity,
              version: resolved.version,
              spec: url
            }
          });
        } catch (e) {
          // Ignore storage errors
        }
      }

      debugLog(`Resolved npm @require ${url} to ${resolved.url}`);
      return resolved.code;
    } catch (e: any) {
      console.warn(`[ScriptVault] Failed to resolve npm @require ${url}: ${e.message}`);
      return null;
    }
  }

  if (typeof url === 'string' && url.startsWith('npm:')) {
    console.warn(`[ScriptVault] NPM @require resolver unavailable: ${url}`);
    return null;
  }

  const { fetchUrl, sriHash } = parseRequireIntegrity(url);

  // Service-worker fetches do not receive page mixed-content protection. A
  // plaintext dependency is therefore executable network input unless its
  // bytes are pinned; review probes may still inspect it before execution.
  if (!options.allowUnpinned && isPlainHttpUrl(fetchUrl) && !hasVerifiableRequireIntegrity(url)) {
    console.warn(`[ScriptVault] Refusing unpinned http @require: ${fetchUrl}`);
    throw new Error(HTTP_REQUIRE_UNPINNED_REQUIRE_ERROR);
  }

  // SRI enforcement: the Security > Subresource Integrity setting has a
  // "require" mode that, until now, was surfaced in the UI but never enforced.
  // In "require" mode, refuse to fetch a remote @require that carries no
  // verifiable URL-fragment integrity hash. npm specs are resolved with a
  // computed SRI above and never reach here. NOTE: this gate checks only the
  // URL hash — a TOFU pin lives in the trust receipt, not the URL, so a
  // TOFU-only @require IS blocked under "require" (that is intentional: the
  // pin is not an inline hash the fetch layer can see). Probe/preview/receipt
  // callers pass allowUnpinned so install/update review can still inspect the
  // dependency — enforcement applies to execution (registration/wrapper build).
  if (!options.allowUnpinned && !hasVerifiableRequireIntegrity(url)) {
    let shouldBlockForSRIRequire = false;
    try {
      const _sriSettings = await SettingsManager.get();
      shouldBlockForSRIRequire = _sriSettings?.sri === 'require';
    } catch (_e) {
      // Settings unavailable — do not block execution.
    }
    if (shouldBlockForSRIRequire) {
      console.warn(`[ScriptVault] Refusing un-pinned @require (SRI = require): ${fetchUrl}`);
      throw new Error(SRI_REQUIRE_UNPINNED_REQUIRE_ERROR);
    }
  }

  debugLog('Fetching @require:', fetchUrl);

  // Skip URLs that are known to be unfetchable
  if (isUnfetchableUrl(fetchUrl)) {
    console.warn(`[ScriptVault] Skipping unfetchable @require: ${url}`);
    return null;
  }

  // Check in-memory cache first. Keyed on the FULL url including any
  // #sha256=... integrity fragment, not the stripped fetchUrl: two scripts can
  // @require the same base URL with different (or absent) pins, and sharing one
  // entry meant a pinned require got an unpinned require's unverified bytes
  // straight from cache, skipping verifySRI entirely. The persistent cache
  // already keys on the full url via buildRequireCacheKey.
  if (!bypassCache && requireCache.has(url)) {
    debugLog('Using cached @require:', fetchUrl);
    return requireCache.get(url);
  }
  
  // Check persistent cache in chrome.storage.local
  // Hash the URL to create a fixed-length collision-resistant cache key
  let cacheKey = '';
  if (!bypassCache || cacheResult) {
    cacheKey = await buildRequireCacheKey(url);
  }
  if (!bypassCache) {
    try {
      const cached = await chrome.storage.local.get(cacheKey);
      if (cached[cacheKey]?.code) {
        // Check if cache is less than 7 days old
        const age = Date.now() - (cached[cacheKey].timestamp || 0);
        if (age < 7 * 24 * 60 * 60 * 1000) {
          debugLog('Using persistent cached @require:', url);
          requireCacheSet(url, cached[cacheKey].code);
          return cached[cacheKey].code;
        }
      }
    } catch (e) {
      // Ignore cache errors
    }
  }
  
  // Build list of URLs to try (original + fallbacks)
  const fallbacks = getFallbackUrls(fetchUrl);
  const urlsToTry = [fetchUrl, ...fallbacks];
  debugLog(`Will try ${urlsToTry.length} URLs for:`, fetchUrl);

  for (const tryUrl of urlsToTry) {
    try {
      debugLog('Trying:', tryUrl);
      const code = await fetchWithRetry(tryUrl);
      if (code) {
        // Verify SRI hash if provided
        if (sriHash) {
          const valid = await verifySRI(code, sriHash);
          if (!valid) {
            console.warn(`[ScriptVault] SRI hash mismatch for ${tryUrl}, skipping`);
            continue;
          }
        }
        // Store in both caches unless this is an integrity probe. TOFU receipt
        // checks must not poison the active cache when they reject an update.
        if (cacheResult) {
          requireCacheSet(url, code);

          // Store in persistent cache
          try {
            await chrome.storage.local.set({
              [cacheKey]: { code, timestamp: Date.now(), url: tryUrl }
            });
          } catch (e) {
            // Ignore storage errors
          }
        }
        
        if (tryUrl !== url) {
          debugLog(`Successfully fetched ${url} from fallback:`, tryUrl);
        } else {
          debugLog('Successfully fetched:', url);
        }
        return code;
      }
    } catch (e: any) {
      console.warn(`[ScriptVault] Failed to fetch ${tryUrl}: ${e.message}`);
      // Try next URL
      continue;
    }
  }
  
  console.error(`[ScriptVault] Failed to fetch ${url} (tried ${urlsToTry.length} URLs)`);
  return null;
}

async function fetchProvenanceBundle(url: any) {
  const preCheck = InternalHostGuard.classifyFetchUrl(url, ['http:', 'https:']);
  if (!preCheck.ok) {
    throw new Error('@require-provenance URL rejected: ' + preCheck.message);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.dev.sigstore.bundle.v0.3+json, application/json, text/plain, */*',
        'Cache-Control': 'no-cache'
      },
      // Do not force mode:'cors'. Extension host permissions cover these
      // remote reads, and forcing CORS breaks valid dependency hosts that do
      // not echo the extension origin.
      credentials: 'omit',
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const postCheck = InternalHostGuard.classifyResponseUrl(response, ['http:', 'https:']);
    if (!postCheck.ok) {
      throw new Error('@require-provenance URL redirected to ' + postCheck.message);
    }

    const MAX_PROVENANCE_BUNDLE_BYTES = 256 * 1024;
    const text = await _fetchTextBounded(response, MAX_PROVENANCE_BUNDLE_BYTES, 'Provenance bundle');
    return text && text.trim().length > 0 ? text : null;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('@require-provenance fetch timed out after 10 seconds');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Fetch with retry and proper options
async function fetchWithRetry(url: any, retries: any = 2) {
  const preCheck = InternalHostGuard.classifyFetchUrl(url, ['http:', 'https:']);
  if (!preCheck.ok) {
    throw new Error('@require URL rejected: ' + preCheck.message);
  }

  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      let code;
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'text/javascript, application/javascript, text/plain, */*',
            'Cache-Control': 'no-cache'
          },
          // Do not force mode:'cors'. Extension host permissions cover these
          // remote reads, and forcing CORS breaks valid dependency hosts that do
          // not echo the extension origin.
          credentials: 'omit',
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const postCheck = InternalHostGuard.classifyResponseUrl(response, ['http:', 'https:']);
        if (!postCheck.ok) {
          throw new Error('@require URL redirected to ' + postCheck.message);
        }

        // Reject excessively large @require scripts (>5MB) to prevent memory
        // issues. Use the stream-bounded helper so a hostile CDN serving an
        // unbounded body can't OOM the SW before the size check fires.
        const MAX_REQUIRE_BYTES = 5 * 1024 * 1024;
        code = await _fetchTextBounded(response, MAX_REQUIRE_BYTES, 'Response');
      } finally {
        clearTimeout(timeoutId);
      }

      // Basic validation - should look like JavaScript
      if (code && code.length > 0) {
        return code;
      }

      throw new Error('Empty response');
    } catch (e: any) {
      if (i === retries) {
        if (e?.name === 'AbortError') {
          throw new Error('@require fetch timed out after 10 seconds');
        }
        throw e;
      }
      // Wait before retry
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  return null;
}

// Unregister a single script
// ============================================================================
// GM_webRequest — declarativeNetRequest rule management
// ============================================================================

// Maps scriptId -> array of rule IDs applied via @webRequest / GM_webRequest
// Round 11: Persisted to chrome.storage.local under `_webRequestRuleMap` so the
// map survives SW shutdown. Without persistence, once the SW is killed,
// `removeWebRequestRules` can no longer clean up rules inserted by prior SW
// generations — script deletion would leak DNR rules permanently.
const _webRequestRuleMap = new Map();
const WEB_REQUEST_RULE_ID_BASE = 1000000000;
const WEB_REQUEST_RULE_ID_MAX = 2147483647;
let _webRequestRuleMapHydrated = false;
let _webRequestRuleMapHydratingPromise: any = null;
let _webRequestRuleIdCounter = WEB_REQUEST_RULE_ID_BASE;

async function _hydrateWebRequestRuleMap() {
  if (_webRequestRuleMapHydrated) return;
  if (_webRequestRuleMapHydratingPromise) return _webRequestRuleMapHydratingPromise;
  _webRequestRuleMapHydratingPromise = (async () => {
    try {
      const result = await chrome.storage.local.get('_webRequestRuleMap');
      const stored = result?._webRequestRuleMap;
      if (stored && typeof stored === 'object') {
        for (const [scriptId, ruleIds] of Object.entries(stored)) {
          if (Array.isArray(ruleIds) && ruleIds.length > 0) {
            const normalizedRuleIds = [...new Set(ruleIds
              .map(id => Number(id))
              .filter(id => Number.isInteger(id) && id > 0))];
            if (normalizedRuleIds.length > 0) {
              _webRequestRuleMap.set(scriptId, normalizedRuleIds);
              _seedWebRequestRuleIdCounter(normalizedRuleIds);
            }
          }
        }
      }
    } catch (e: any) {
      console.warn('[ScriptVault] Failed to hydrate _webRequestRuleMap:', e?.message || e);
    } finally {
      _webRequestRuleMapHydrated = true;
      _webRequestRuleMapHydratingPromise = null;
    }
  })();
  return _webRequestRuleMapHydratingPromise;
}

async function _persistWebRequestRuleMap() {
  try {
    const obj: any = {};
    for (const [scriptId, ruleIds] of _webRequestRuleMap.entries()) {
      obj[scriptId] = ruleIds;
    }
    await chrome.storage.local.set({ _webRequestRuleMap: obj });
    return true;
  } catch (e: any) {
    console.warn('[ScriptVault] Failed to persist _webRequestRuleMap:', e?.message || e);
    return false;
  }
}

function _seedWebRequestRuleIdCounter(ruleIds: any) {
  for (const rawId of ruleIds || []) {
    const id = Number(rawId);
    if (Number.isInteger(id) && id >= WEB_REQUEST_RULE_ID_BASE && id > _webRequestRuleIdCounter) {
      _webRequestRuleIdCounter = Math.min(id, WEB_REQUEST_RULE_ID_MAX);
    }
  }
}

function _collectUsedWebRequestRuleIds(liveRules: any = []) {
  const usedRuleIds = new Set();
  for (const ruleIds of _webRequestRuleMap.values()) {
    for (const id of ruleIds || []) usedRuleIds.add(id);
  }
  for (const rule of liveRules || []) {
    if (Number.isInteger(rule?.id) && rule.id > 0) usedRuleIds.add(rule.id);
  }
  _seedWebRequestRuleIdCounter(usedRuleIds);
  return usedRuleIds;
}

// Monotonic GM_webRequest-only dynamic rule ID allocator.
function _makeRuleId(scriptId: any, index: any, usedRuleIds: any = new Set()) {
  do {
    _webRequestRuleIdCounter += 1;
    if (_webRequestRuleIdCounter > WEB_REQUEST_RULE_ID_MAX) {
      throw new Error('GM_webRequest DNR rule ID pool exhausted');
    }
  } while (usedRuleIds.has(_webRequestRuleIdCounter));
  usedRuleIds.add(_webRequestRuleIdCounter);
  return _webRequestRuleIdCounter;
}

// Translate GM_webRequest rule selector/action to declarativeNetRequest format
function _dnrUrlFiltersForRule(rule: any) {
  const sel = rule?.selector || {};
  if (typeof sel === 'string') return [sel].filter(Boolean);
  const filters: any = [];
  const pushFilter = (value: any) => {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string') filters.push(entry);
        else if (entry?.include) filters.push(entry.include);
      }
    } else if (typeof value === 'string') {
      filters.push(value);
    }
  };
  pushFilter(sel.url);
  pushFilter(sel.include);
  return filters.map((filter: any) => String(filter).trim()).filter(Boolean);
}

function _dnrExcludedRequestDomains(rule: any) {
  const sel = rule?.selector || {};
  if (!sel || typeof sel !== 'object') return [];
  const values = [];
  const pushExcluded = (value: any) => {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string') values.push(entry);
        else if (entry?.exclude) values.push(entry.exclude);
      }
    } else if (typeof value === 'string') {
      values.push(value);
    }
  };
  pushExcluded(sel.exclude);
  if (Array.isArray(sel.url)) {
    for (const entry of sel.url) {
      if (entry?.exclude) values.push(entry.exclude);
    }
  }
  return values
    .map(value => _extractDnrFilterHost(value))
    .filter(host => host && host !== '*');
}

function _normalizeDnrHeaderConditions(value: any) {
  if (!Array.isArray(value)) return [];
  const conditions = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const header = String(entry.header || '').trim();
    if (!header) continue;
    const condition: any = { header };
    if (Array.isArray(entry.values)) {
      condition.values = entry.values.map(String).filter(Boolean);
    }
    if (Array.isArray(entry.excludedValues)) {
      condition.excludedValues = entry.excludedValues.map(String).filter(Boolean);
    }
    conditions.push(condition);
  }
  return conditions;
}

function _extractDnrFilterHost(filter: any) {
  if (typeof filter !== 'string') return '';
  const raw = filter.trim();
  if (!raw) return '';
  if (raw === '*' || raw === '<all_urls>') return '*';
  if (raw.startsWith('||')) {
    const host = raw.slice(2).split(/[\/^*?#]/)[0];
    return host ? normalizeConnectHost(host) : '';
  }
  const host = _extractHostScopeHost(raw);
  if (host) return host;
  if (/^[a-z0-9.-]+(?::\d+)?$/i.test(raw)) return normalizeConnectHost(raw);
  return '';
}

function _isCspHeaderName(name: any) {
  return [
    'content-security-policy',
    'content-security-policy-report-only',
    'x-content-security-policy',
    'x-webkit-csp'
  ].includes(String(name || '').trim().toLowerCase());
}

function _ruleMutatesCspHeaders(rule: any) {
  const responseHeaders = rule?.action?.setResponseHeaders;
  if (!responseHeaders || typeof responseHeaders !== 'object') return false;
  return Object.keys(responseHeaders).some(_isCspHeaderName);
}

function _isHighPrivilegeScriptApiOverride(settings: any) {
  return settings?.allowHighPrivilegeScriptApis === true;
}

function _isCspMutationAllowed(settings: any) {
  return settings?.modifyCSP === 'yes' || _isHighPrivilegeScriptApiOverride(settings);
}

function _isDnrHostAllowedByScript(script: any, host: any) {
  if (!host) return false;
  const scopeInfo = getScriptHostScopeInfo(script);
  if (scopeInfo.universal) return true;
  if (scopeInfo.hosts.some((scopeHost: any) => hostMatchesConnectPattern(host, scopeHost))) return true;
  const connectList = Array.isArray(script?.meta?.connect) ? script.meta.connect : [];
  return connectList.some((pattern: any) => {
    if (String(pattern).trim() === '*') return true;
    const normalized = normalizeConnectHost(pattern);
    if (normalized === 'self') return scopeInfo.hosts.some((scopeHost: any) => hostMatchesConnectPattern(host, scopeHost));
    return hostMatchesConnectPattern(host, normalized);
  });
}

function _validateWebRequestRulesForScript(script: any, rules: any, settings: any = {}) {
  const ruleList = Array.isArray(rules) ? rules : [];
  const scopeInfo = getScriptHostScopeInfo(script);
  const highPrivilegeOverride = _isHighPrivilegeScriptApiOverride(settings);
  const initiatorDomains = scopeInfo.universal || highPrivilegeOverride ? [] : scopeInfo.hosts;
  if (!scopeInfo.universal && !highPrivilegeOverride && initiatorDomains.length === 0) {
    return { allowed: false, error: 'GM_webRequest requires concrete script host scope' };
  }

  for (const rule of ruleList) {
    if (_ruleMutatesCspHeaders(rule) && !_isCspMutationAllowed(settings)) {
      return { allowed: false, error: 'GM_webRequest CSP header changes require Modify CSP = yes' };
    }
    const filters = _dnrUrlFiltersForRule(rule);
    if (filters.length === 0) {
      return { allowed: false, error: 'GM_webRequest rule requires a concrete target host' };
    }
    for (const filter of filters) {
      const host = _extractDnrFilterHost(filter);
      if (!host) {
        return { allowed: false, error: 'GM_webRequest rule requires a concrete target host' };
      }
      if (host === '*' && !highPrivilegeOverride) {
        return { allowed: false, error: 'GM_webRequest wildcard target host requires high-privilege override' };
      }
      if (host !== '*' && !highPrivilegeOverride && !_isDnrHostAllowedByScript(script, host)) {
        return { allowed: false, error: `GM_webRequest target ${host} blocked by script host scope` };
      }
    }
  }

  return { allowed: true, initiatorDomains };
}

function _translateWebRequestRule(rule: any, ruleId: any, options: any = {}) {
  const dnr: any = { id: ruleId, priority: rule.priority || 1, condition: {}, action: {} };

  // Selector -> condition
  const sel = rule.selector || {};
  if (typeof sel === 'string') {
    dnr.condition.urlFilter = sel;
  } else if (sel.url) {
    const urlFilter = sel.url;
    if (Array.isArray(urlFilter)) {
      // Multiple URL patterns: pick first include (DNR only supports one urlFilter per rule)
      const incl = urlFilter.find(u => u.include);
      if (incl) dnr.condition.urlFilter = incl.include;
      const excl = urlFilter.find(u => u.exclude);
      if (excl) dnr.condition.excludedRequestDomains = [_extractDnrFilterHost(excl.exclude)].filter(Boolean);
    } else if (typeof urlFilter === 'string') {
      dnr.condition.urlFilter = urlFilter;
    }
  } else if (sel.include) {
    const includes = Array.isArray(sel.include) ? sel.include : [sel.include];
    const incl = includes.find(Boolean);
    if (incl) dnr.condition.urlFilter = incl;
  }
  const excludedRequestDomains = _dnrExcludedRequestDomains(rule);
  if (excludedRequestDomains.length > 0) {
    dnr.condition.excludedRequestDomains = excludedRequestDomains;
  }
  if (sel.tab) dnr.condition.tabIds = Array.isArray(sel.tab) ? sel.tab : [sel.tab];
  if (sel.type) dnr.condition.resourceTypes = Array.isArray(sel.type) ? sel.type : [sel.type];
  if (typeof sel !== 'string') {
    const responseHeaders = _normalizeDnrHeaderConditions(sel.responseHeaders);
    if (responseHeaders.length > 0) dnr.condition.responseHeaders = responseHeaders;
    const excludedResponseHeaders = _normalizeDnrHeaderConditions(sel.excludedResponseHeaders);
    if (excludedResponseHeaders.length > 0) dnr.condition.excludedResponseHeaders = excludedResponseHeaders;
  }
  if (Array.isArray(options.initiatorDomains) && options.initiatorDomains.length > 0) {
    dnr.condition.initiatorDomains = options.initiatorDomains;
  }

  // Action
  const act = rule.action || {};
  if (act === 'cancel' || act === 'block' || act.cancel) {
    dnr.action.type = 'block';
  } else if (act.redirect) {
    dnr.action.type = 'redirect';
    dnr.action.redirect = typeof act.redirect === 'string'
      ? { url: act.redirect }
      : { url: act.redirect.url || act.redirect.regexSubstitution || '' };
  } else if (act.setRequestHeaders) {
    dnr.action.type = 'modifyHeaders';
    dnr.action.requestHeaders = Object.entries(act.setRequestHeaders).map(([name, value]) =>
      value === null ? { header: name, operation: 'remove' } : { header: name, operation: 'set', value }
    );
  } else if (act.setResponseHeaders) {
    dnr.action.type = 'modifyHeaders';
    dnr.action.responseHeaders = Object.entries(act.setResponseHeaders).map(([name, value]) =>
      value === null ? { header: name, operation: 'remove' } : { header: name, operation: 'set', value }
    );
  } else {
    return null; // unsupported action
  }

  return dnr;
}

async function applyWebRequestRules(scriptId: any, rules: any, options: any = {}) {
  if (!chrome.declarativeNetRequest || !Array.isArray(rules) || rules.length === 0) {
    return { success: true, count: 0 };
  }
  try {
    const script = options.script || await ScriptStorage.get(scriptId);
    if (!script) return { success: false, error: 'Script context not found' };
    const settings = options.settings || await SettingsManager.get();
    const policy = _validateWebRequestRulesForScript(script, rules, settings);
    if (!policy.allowed) return { success: false, error: policy.error };

    // Round 11: Ensure map is rehydrated from storage before mutating (SW may have restarted)
    await _hydrateWebRequestRuleMap();
    // Remove any existing rules for this script first
    await removeWebRequestRules(scriptId);

    const existing: any = await chrome.declarativeNetRequest.getDynamicRules();
    const usedRuleIds = _collectUsedWebRequestRuleIds(existing);
    const dnrRules: any = [];
    const ruleIds: any = [];
    rules.forEach((rule, idx) => {
      const ruleId = _makeRuleId(scriptId, idx, usedRuleIds);
      const dnr = _translateWebRequestRule(rule, ruleId, { initiatorDomains: policy.initiatorDomains });
      if (dnr) {
        dnrRules.push(dnr);
        ruleIds.push(ruleId);
      }
    });

    if (dnrRules.length > 0) {
      // Check dynamic rule quota (Chrome limit: 30,000)
      if (existing.length + dnrRules.length > 30000) {
        console.warn(`[ScriptVault] DNR rule limit would be exceeded: ${existing.length} + ${dnrRules.length} > 30000`);
        return { success: false, error: 'DNR rule limit would be exceeded' };
      }
      await chrome.declarativeNetRequest.updateDynamicRules({ addRules: dnrRules });
      _webRequestRuleMap.set(scriptId, ruleIds);
      const persisted = await _persistWebRequestRuleMap();
      if (!persisted) {
        _webRequestRuleMap.delete(scriptId);
        try {
          await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ruleIds });
        } catch (cleanupErr: any) {
          console.warn('[ScriptVault] GM_webRequest rule rollback failed after map persist failure:', cleanupErr?.message || cleanupErr);
        }
        return { success: false, error: 'DNR rule ownership could not be persisted' };
      }
      debugLog(`[GM_webRequest] Applied ${dnrRules.length} rules for script ${scriptId}`);
    }
    return { success: true, count: dnrRules.length };
  } catch (e: any) {
    console.warn('[ScriptVault] GM_webRequest rule apply failed:', e.message);
    return { success: false, error: e?.message || 'GM_webRequest rule apply failed' };
  }
}

async function removeWebRequestRules(scriptId: any) {
  if (!chrome.declarativeNetRequest) return;
  // Round 11: Rehydrate from storage before reading — the SW may have restarted
  // since the rules were originally inserted, and without this the in-memory Map
  // would be empty and we'd silently leak the DNR rules.
  await _hydrateWebRequestRuleMap();
  const existing = _webRequestRuleMap.get(scriptId);
  if (existing && existing.length > 0) {
    let removed = false;
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing });
      removed = true;
    } catch (e: any) {
      try {
        const liveRules = await chrome.declarativeNetRequest.getDynamicRules();
        const liveRuleIds = new Set((liveRules || []).map(r => r.id));
        removed = !existing.some((id: any) => liveRuleIds.has(id));
      } catch (probeErr: any) {
        console.warn('[ScriptVault] GM_webRequest rule removal failed and live-state probe failed:', e?.message || e, probeErr?.message || probeErr);
      }
    }
    if (!removed) {
      console.warn(`[ScriptVault] GM_webRequest kept rule map for ${scriptId}; DNR removal did not complete.`);
      return;
    }
    _webRequestRuleMap.delete(scriptId);
    await _persistWebRequestRuleMap();
  }
}

// Phase 40.10 — Reconcile persisted DNR rule map against the live DNR state
// and the current ScriptStorage on SW wake. Without this, three drift modes
// silently accumulate orphans:
//   (a) A script was deleted while a previous SW was alive: its DNR rules were
//       removed correctly but the map entry might have lagged if `_persist`
//       failed mid-delete.
//   (b) The SW was killed mid-delete: the script record is gone from
//       ScriptStorage but the DNR rules and the map entry both survive.
//   (c) `updateDynamicRules` was applied by a prior SW generation but the
//       persist write failed: rules exist in DNR with no map entry to clean
//       them up later.
//
// Reconciliation is best-effort and lossy in the (c) direction: if a rule
// exists in DNR with no map entry pointing at any script, we leave it alone
// rather than risk removing a rule another extension might have inserted.
async function reconcileWebRequestRuleMap() {
  if (!chrome.declarativeNetRequest) return;
  await _hydrateWebRequestRuleMap();

  let mutated = false;
  let scripts;
  try {
    scripts = await ScriptStorage.getAll();
  } catch (e: any) {
    console.warn('[ScriptVault] DNR reconcile: ScriptStorage.getAll failed:', e?.message || e);
    return;
  }
  const scriptIds = new Set((scripts || []).map((s: any) => s.id));

  // Pass 1: find map entries whose script no longer exists; queue the DNR
  // rule IDs for removal so the live engine catches up. Keep the map entries
  // until the DNR removal succeeds, otherwise a transient DNR failure would
  // strand live rules with no stored owner to retry later.
  const toRemoveRuleIds = [];
  const orphanScriptIds = [];
  for (const [scriptId, ruleIds] of _webRequestRuleMap.entries()) {
    if (!scriptIds.has(scriptId)) {
      if (Array.isArray(ruleIds)) toRemoveRuleIds.push(...ruleIds);
      orphanScriptIds.push(scriptId);
    }
  }

  // Pass 2: drop map rule IDs that no longer exist in DNR (stale entries).
  let liveRuleIds;
  try {
    const liveRules = await chrome.declarativeNetRequest.getDynamicRules();
    liveRuleIds = new Set(liveRules.map(r => r.id));
  } catch (e: any) {
    console.warn('[ScriptVault] DNR reconcile: getDynamicRules failed:', e?.message || e);
    liveRuleIds = null;
  }
  if (liveRuleIds) {
    for (const [scriptId, ruleIds] of _webRequestRuleMap.entries()) {
      if (orphanScriptIds.includes(scriptId)) continue;
      const filtered = (ruleIds || []).filter((id: any) => liveRuleIds.has(id));
      if (filtered.length !== (ruleIds || []).length) {
        if (filtered.length === 0) _webRequestRuleMap.delete(scriptId);
        else _webRequestRuleMap.set(scriptId, filtered);
        mutated = true;
      }
    }
  }

  // Apply the queued DNR removal in one batched call, then drop the now-cleaned
  // map entries. If the DNR call fails, keep the entries for the next wake.
  if (toRemoveRuleIds.length > 0) {
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: toRemoveRuleIds });
      for (const scriptId of orphanScriptIds) {
        _webRequestRuleMap.delete(scriptId);
      }
      mutated = true;
      debugLog(`[GM_webRequest] Reconcile removed ${toRemoveRuleIds.length} orphan DNR rule(s)`);
    } catch (e: any) {
      console.warn('[ScriptVault] DNR reconcile: updateDynamicRules removal failed:', e?.message || e);
    }
  } else if (orphanScriptIds.length > 0) {
    for (const scriptId of orphanScriptIds) {
      _webRequestRuleMap.delete(scriptId);
    }
    mutated = true;
  }

  if (mutated) {
    await _persistWebRequestRuleMap();
  }
}

async function unregisterScript(scriptId: any) {
  // Clear @crontab alarm if present
  chrome.alarms.clear(getCrontabAlarmName(scriptId)).catch(() => {});
  await clearCrontabOnceMarkersForScript(scriptId);
  // Remove any @webRequest declarativeNetRequest rules
  await removeWebRequestRules(scriptId);
  try {
    if (!chrome.userScripts) return;
    await chrome.userScripts.unregister({ ids: [scriptId] });
    // Chrome 133+: reset the per-script world configuration to free resources
    if (_supportsUserScriptsWorldId()) {
      try {
        await chrome.userScripts.resetWorldConfiguration(scriptId);
      } catch (e) {
        // Chrome <133 / Firefox <153 have no resetWorldConfiguration — ignore
      }
    }
  } catch (e) {
    // Script might not be registered
  }
}

// Build wrapped script code with GM API
function buildWrappedScript(script: any, requireScripts: any = [], preloadedStorage: any = {}, regexIncludes: any = [], regexExcludes: any = [], scheduleGuard: any = '', scriptAuthToken: any = '') {
  const meta = script.meta;
  const grants = meta.grant || ['none'];
  const sourceSegments: any = [];
  const appendEmbeddedSourceSegment = (segment: any) => {
    const content = ScriptSourceMaps.neutralizeSourceDirectives(segment.content || '');
    const index = sourceSegments.push({ ...segment, content }) - 1;
    return ScriptSourceMaps.markSourceSegment(index, content);
  };
  const appendSourceSegment = (url: any, code: any) => appendEmbeddedSourceSegment({ url, content: code });
  const finalize = (code: any) => ScriptSourceMaps.finalizeWrappedSource(code, {
    scriptId: script.id,
    scriptName: meta.name,
    segments: sourceSegments
  });
  const scriptConfigValues = typeof ScriptConfig !== 'undefined' && ScriptConfig.normalizeValues
    ? ScriptConfig.normalizeValues(
      Array.isArray(meta.config) ? meta.config : [],
      script.settings?.userConfig && typeof script.settings.userConfig === 'object'
        ? script.settings.userConfig
        : {}
    )
    : {};
  
  // Build @require scripts section
  // Code runs INSIDE the main IIFE after GM APIs are available
  // No try/catch wrapper because let/const are block-scoped and wouldn't escape
  let requireCode = '';
  const localLibraryRequireScripts = typeof LocalLibraries !== 'undefined'
    ? LocalLibraries.getLocalLibraryRequireScripts(script.settings)
    : [];
  for (const [index, req] of [...requireScripts, ...localLibraryRequireScripts].entries()) {
    const safeUrl = req.url.replace(/\*\//g, '* /');
    const mappedCode = appendSourceSegment(
      ScriptSourceMaps.deterministicRequireSourceUrl(script.id, index, req.url),
      req.code
    );
    requireCode += `
// @require ${safeUrl}
${mappedCode}
`;
  }
  
  // After @require code, expose common libraries to window for cross-script access
  const libraryExports = requireCode ? `
  // Expose common @require libraries to window
  if (typeof GM_config !== 'undefined' && typeof window.GM_config === 'undefined') window.GM_config = GM_config;
  if (typeof GM_configStruct !== 'undefined' && typeof window.GM_configStruct === 'undefined') window.GM_configStruct = GM_configStruct;
  if (typeof $ !== 'undefined' && typeof window.$ === 'undefined') window.$ = $;
  if (typeof jQuery !== 'undefined' && typeof window.jQuery === 'undefined') window.jQuery = jQuery;
  if (typeof Fuse !== 'undefined' && typeof window.Fuse === 'undefined') window.Fuse = Fuse;
  if (typeof JSZip !== 'undefined' && typeof window.JSZip === 'undefined') window.JSZip = JSZip;
` : '';
  
  // Build the GM API initialization with pre-loaded storage
  // Get the extension ID at build time so it's available in the wrapper
  const extId = chrome.runtime.id;
  const runtimeMeta = meta.esmBundle?.sourceMap
    ? { ...meta, esmBundle: { ...meta.esmBundle, sourceMap: undefined } }
    : meta;
  
  const apiInit = `
(function() {
  'use strict';

  const __svGeneratedSourceUrl = __SV_GENERATED_SOURCE_URL__;
  const __svLocationSegments = __SV_RUNTIME_LOCATION_SEGMENTS__;
  function __svStackLocation(stack, source) {
    const marker = String(source || '') + ':';
    const offset = String(stack || '').indexOf(marker);
    if (offset < 0) return null;
    const match = String(stack).slice(offset + marker.length).match(/^(\\d+):(\\d+)/);
    return match ? { line: Number(match[1]), column: Number(match[2]), offset } : null;
  }
  function __svResolveErrorLocation(line, column, filename, stack) {
    // The topmost stack frame wins: pick the segment whose URL appears
    // earliest, and only when it precedes the generated URL's own frame.
    const generatedStack = __svStackLocation(stack, __svGeneratedSourceUrl);
    let best = null;
    for (const segment of __svLocationSegments) {
      const original = __svStackLocation(stack, segment[2]);
      if (original && (!best || original.offset < best.offset)) {
        best = { source: segment[2], line: original.line, column: original.column, offset: original.offset };
      }
    }
    if (best && (!generatedStack || best.offset < generatedStack.offset)) {
      return { source: best.source, line: best.line, column: best.column, generatedLine: Number(line || 0), generatedColumn: Number(column || 0) };
    }
    const generatedLine = generatedStack?.line || Number(line || 0);
    const generatedColumn = generatedStack?.column || Number(column || 0);
    const segment = __svLocationSegments.find(item => generatedLine >= item[0] && generatedLine <= item[1]);
    if (!segment) {
      return { source: filename || __svGeneratedSourceUrl, line: generatedLine || null, column: generatedColumn || null, generatedLine: generatedLine || null, generatedColumn: generatedColumn || null };
    }
    return { source: segment[2], line: segment[3] + generatedLine - segment[0], column: Math.max(1, generatedColumn || 1), generatedLine, generatedColumn: Math.max(1, generatedColumn || 1) };
  }
  
  // ============ Console Capture (v2.0) ============
  // Intercept console.log/warn/error for per-script debugging
  {
    const _origConsole = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };
    const _scriptId = ${JSON.stringify(script.id)};
    const _captureLimit = 200;
    let _captureBuffer = [];
    function _captureConsole(level, args) {
      try {
        _captureBuffer.push({ level, args: Array.from(args).map(a => { try { return typeof a === 'object' ? JSON.stringify(a).slice(0, 500) : String(a); } catch { return String(a); } }), timestamp: Date.now() });
        if (_captureBuffer.length > _captureLimit) _captureBuffer.shift();
        // Batch-send every 2 seconds
        if (!_captureConsole._timer) {
          _captureConsole._timer = setTimeout(() => {
            try { chrome.runtime.sendMessage({ action: 'scriptConsoleCapture', scriptId: _scriptId, entries: _captureBuffer.splice(0) }); } catch {}
            _captureConsole._timer = null;
          }, 2000);
        }
      } catch {}
    }
    console.log = function() { _captureConsole('log', arguments); return _origConsole.log.apply(console, arguments); };
    console.warn = function() { _captureConsole('warn', arguments); return _origConsole.warn.apply(console, arguments); };
    console.error = function() { _captureConsole('error', arguments); return _origConsole.error.apply(console, arguments); };
    console.info = function() { _captureConsole('info', arguments); return _origConsole.info.apply(console, arguments); };
    console.debug = function() { _captureConsole('debug', arguments); return _origConsole.debug.apply(console, arguments); };
  }
  // ============ End Console Capture ============

  // ============ Error Suppression ============
  // Suppress uncaught errors and unhandled rejections from userscripts
  // to prevent them from appearing on chrome://extensions error page.
  // Chrome captures any error/warn/log from USER_SCRIPT world, so we
  // must silently swallow these without any console output.
  window.addEventListener('error', function(event) {
    event.stopImmediatePropagation();
    event.preventDefault();
    // Report to error log
    try {
      const __stack = String(event.error?.stack || '').slice(0, 8000);
      const __location = __svResolveErrorLocation(event.lineno, event.colno, event.filename, __stack);
      chrome.runtime.sendMessage({ action: 'logError', entry: { scriptId: ${JSON.stringify(script.id)}, scriptName: ${JSON.stringify(meta.name)}, error: event.message || 'Unknown error', stack: __stack, url: location.href, source: __location.source, line: __location.line, col: __location.column, generatedLine: __location.generatedLine, generatedCol: __location.generatedColumn, timestamp: Date.now() } });
    } catch {}
    return true;
  }, true);
  window.addEventListener('unhandledrejection', function(event) {
    event.stopImmediatePropagation();
    event.preventDefault();
    try {
      const __stack = String(event.reason?.stack || '').slice(0, 8000);
      const __location = __svResolveErrorLocation(0, 0, '', __stack);
      chrome.runtime.sendMessage({ action: 'logError', entry: { scriptId: ${JSON.stringify(script.id)}, scriptName: ${JSON.stringify(meta.name)}, error: event.reason?.message || String(event.reason) || 'Unhandled rejection', stack: __stack, url: location.href, source: __location.source, line: __location.line, col: __location.column, generatedLine: __location.generatedLine, generatedCol: __location.generatedColumn, timestamp: Date.now() } });
    } catch {}
  }, true);
  // ============ End Error Suppression ============

  ${meta['run-in'] === 'incognito-tabs' ? `
  // ============ @run-in incognito-tabs Guard ============
  if (!chrome?.extension?.inIncognitoContext) return;
  // ============ End @run-in Guard ============
` : meta['run-in'] === 'normal-tabs' ? `
  // ============ @run-in normal-tabs Guard ============
  if (chrome?.extension?.inIncognitoContext) return;
  // ============ End @run-in Guard ============
` : ''}
  ${(() => {
    const validIncludes = regexIncludes.map((p: any) => {
      const m = p.match(/^\/(.+)\/([gimsuy]*)$/);
      return m ? `new RegExp(${JSON.stringify(m[1])}, ${JSON.stringify(m[2])})` : null;
    }).filter(Boolean);
    const validExcludes = regexExcludes.map((p: any) => {
      const m = p.match(/^\/(.+)\/([gimsuy]*)$/);
      return m ? `new RegExp(${JSON.stringify(m[1])}, ${JSON.stringify(m[2])})` : null;
    }).filter(Boolean);
    if (validIncludes.length === 0 && validExcludes.length === 0) return '';
    return `
  // ============ Regex @include/@exclude URL Guard ============
  {
    const __url = location.href;
    ${validIncludes.length > 0 ? `const __regexIncludes = [${validIncludes.join(', ')}];
    const __includeMatch = __regexIncludes.some(re => re.test(__url));
    if (!__includeMatch) return;` : ''}
    ${validExcludes.length > 0 ? `const __regexExcludes = [${validExcludes.join(', ')}];
    const __excludeMatch = __regexExcludes.some(re => re.test(__url));
    if (__excludeMatch) return;` : ''}
  }
  // ============ End URL Guard ============
`;
  })()}
  ${(() => {
    // Phase 39.11 — @match-top / @exclude-top runtime gates.
    // Patterns are matched against window.top.location.href. Cross-origin
    // top frames throw on access, so we treat opaque top as "no match" for
    // @match-top (do not run — author asked for a specific top origin we
    // can't verify) and "match" for @exclude-top (do not run — author asked
    // to keep the script away from frames whose top we can't audit).
    const matchTop = Array.isArray(meta.matchTop) ? meta.matchTop : [];
    const excludeTop = Array.isArray(meta.excludeTop) ? meta.excludeTop : [];
    if (matchTop.length === 0 && excludeTop.length === 0) return '';

    // Build a runtime matcher that handles both glob (@match-style) and
    // regex (`/.../flags`) patterns. Keep the matcher inside the wrapper
    // so it doesn't depend on the background's matchPattern helper.
    const patternsToLiteral = (arr: any) => arr.map((p: any) => {
      const m = p.match(/^\/(.+)\/([gimsuy]*)$/);
      if (m) return `{re: new RegExp(${JSON.stringify(m[1])}, ${JSON.stringify(m[2])})}`;
      return `{glob: ${JSON.stringify(p)}}`;
    }).join(', ');

    return `
  // ============ @match-top / @exclude-top Guard (Phase 39.11) ============
  {
    let __topUrl;
    try { __topUrl = window.top && window.top.location && window.top.location.href; } catch (_e) { __topUrl = null; }
    const __testTop = (pattern) => {
      if (pattern.re) return pattern.re.test(__topUrl);
      // Glob: convert @match-style to RegExp on-demand. Handles * / scheme / host / path
      // wildcards conservatively -- anchored ^...$ with .* substituted for *.
      const escaped = pattern.glob.replace(/[.+^$()|[\\]{}]/g, '\\\\$&').replace(/\\*/g, '.*').replace(/\\?/g, '.');
      try { return new RegExp('^' + escaped + '$').test(__topUrl); } catch { return false; }
    };
    ${matchTop.length > 0 ? `
    const __matchTopPatterns = [${patternsToLiteral(matchTop)}];
    if (!__topUrl) return; // Cross-origin top → cannot verify match-top → bail.
    if (!__matchTopPatterns.some(__testTop)) return;` : ''}
    ${excludeTop.length > 0 ? `
    const __excludeTopPatterns = [${patternsToLiteral(excludeTop)}];
    if (!__topUrl) return; // Cross-origin top → conservatively bail.
    if (__excludeTopPatterns.some(__testTop)) return;` : ''}
  }
  // ============ End @match-top / @exclude-top Guard ============
`;
  })()}
  const scriptId = ${JSON.stringify(script.id)};
  const scriptAuthToken = ${JSON.stringify(scriptAuthToken)};
  const meta = ${JSON.stringify(runtimeMeta)};
  const grants = ${JSON.stringify(grants)};
  const grantSet = new Set(grants);
  const __scriptConfigValues = Object.freeze(${JSON.stringify(scriptConfigValues)});
  const CAT_userConfig = Object.freeze({
    ...__scriptConfigValues,
    get(name, defaultValue) {
      return Object.prototype.hasOwnProperty.call(__scriptConfigValues, name)
        ? __scriptConfigValues[name]
        : defaultValue;
    },
    getAll() {
      return { ...__scriptConfigValues };
    }
  });
  const GM_configShim = Object.freeze({
    get(name, defaultValue) { return CAT_userConfig.get(name, defaultValue); },
    getValue(name, defaultValue) { return CAT_userConfig.get(name, defaultValue); },
    getAll() { return CAT_userConfig.getAll(); },
    set() { return false; },
    setValue() { return false; },
    save() { return false; },
    open() { return false; },
    close() { return false; },
    fields: Object.freeze({})
  });
  
  // Channel ID for communication with content script bridge
  // Extension ID is injected at build time since chrome.runtime isn't available in USER_SCRIPT world
  const CHANNEL_ID = ${JSON.stringify('ScriptVault_' + extId)};
  const USER_SCRIPT_EVENT_PORT_NAME = 'ScriptVault:privileged-events:v1';
  
  // console.log('[ScriptVault] Script initializing:', meta.name, 'Channel:', CHANNEL_ID);
  
  // Grant checking - @grant none or empty grants means NO APIs except GM_info
  const hasNone = grantSet.has('none');
  const hasGrant = (n) => {
    if (hasNone || grants.length === 0) return false;
    return grantSet.has(n) || grantSet.has('*');
  };
  
  // GM_info - always available
  const GM_info = {
    script: {
      name: meta.name || 'Unknown',
      namespace: meta.namespace || '',
      description: meta.description || '',
      version: meta.version || '1.0',
      author: meta.author || '',
      homepage: meta.homepage || meta.homepageURL || '',
      icon: meta.icon || '',
      icon64: meta.icon64 || '',
      matches: meta.match || [],
      includes: meta.include || [],
      excludes: meta.exclude || [],
      excludeMatches: meta.excludeMatch || [],
      grants: grants,
      resources: meta.resource || {},
      requires: meta.require || [],
      runAt: meta['run-at'] || 'document-idle',
      connect: meta.connect || [],
      noframes: meta.noframes || false,
      unwrap: meta.unwrap || false,
      antifeatures: meta.antifeature || [],
      tags: meta.tag || [],
      license: meta.license || '',
      updateURL: meta.updateURL || '',
      downloadURL: meta.downloadURL || '',
      supportURL: meta.supportURL || '',
      config: CAT_userConfig.getAll(),
      configVars: meta.config || [],
      // Phase 11.7 — Userscripts (Safari) injection priority.
      weight: meta.weight || 0,
      priority: meta.priority || 0,
      // Phase 38.12 -- VM v2.37.0 renamed tag to tags. Older scripts written
      // against pre-2026 Violentmonkey read the singular form; expose a getter
      // that returns the first tag for back-compat. Non-enumerable so it does
      // not pollute structured clones / JSON serialization of GM_info.script.
      get tag() { return Array.isArray(this.tags) ? this.tags[0] : undefined; }
    },
    scriptMetaStr: ${JSON.stringify(script.code.match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/)?.[0] || '')},
    scriptHandler: 'ScriptVault',
    scriptSource: 'ScriptVault',
    version: ${JSON.stringify(chrome.runtime.getManifest().version)},
    scriptWillUpdate: !!(meta.updateURL || meta.downloadURL),
    isIncognito: typeof chrome !== 'undefined' && chrome.extension ? chrome.extension.inIncognitoContext : false,
    injectInto: ${JSON.stringify(meta['inject-into'] || 'auto')},
    downloadMode: 'browser',
    platform: {
      os: navigator.userAgentData?.platform || navigator.platform || 'unknown',
      arch: navigator.userAgentData?.architecture || 'unknown',
      browserName: navigator.userAgentData?.brands?.find(b => /chrome|chromium|edge/i.test(b.brand))?.brand || 'Chrome',
      browserVersion: navigator.userAgentData?.brands?.[0]?.version || (navigator.userAgent?.match(/Chrome\\/([\\d.]+)/)?.[1]) || 'unknown',
      // Phase 11.1 — fullVersionList + mobile parity with Violentmonkey.
      fullVersionList: navigator.userAgentData?.brands?.map(b => ({ brand: b.brand, version: b.version })) || [],
      mobile: navigator.userAgentData?.mobile === true
    },
    // Phase 11.1 — Tampermonkey-compatible userAgent strings sourced from
    // the page context. Exposed so scripts have a consistent reference even
    // when tests mock navigator.userAgent.
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    userAgentData: typeof navigator !== 'undefined' && navigator.userAgentData
      ? {
          platform: navigator.userAgentData.platform,
          mobile: navigator.userAgentData.mobile,
          brands: (navigator.userAgentData.brands || []).map(b => ({ brand: b.brand, version: b.version }))
        }
      : null,
    uuid: ${JSON.stringify(script.id)}
  };

  // GM.withLock serializes work across tabs through the browser Web Locks API.
  function GM_withLock(name, callback, options) {
    if (!hasGrant('GM_withLock') && !hasGrant('GM.withLock')) {
      return Promise.reject(new Error('GM.withLock requires @grant GM_withLock'));
    }
    if (typeof callback !== 'function') {
      return Promise.reject(new TypeError('GM.withLock callback must be a function'));
    }
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks || typeof locks.request !== 'function') {
      return Promise.reject(new Error('GM.withLock is unavailable in this browser'));
    }
    const lockName = 'ScriptVault:' + scriptId + ':' + String(name);
    return locks.request(lockName, options || {}, callback);
  }

  // Storage cache - mutable so we can refresh it with fresh values from background
  // Pre-loaded values serve as fallback if background fetch fails
  let _cache = ${JSON.stringify(preloadedStorage)};
  // Keep writes made while the initial background read is in flight. The
  // service-worker snapshot may predate those writes, so it must never win the
  // merge for a locally mutated key (including an explicit deletion).
  const _cacheLocalMutations = new Set();
  let _cacheReady = false; // Track if we've fetched fresh values
  let _cacheReadyPromise = null;
  let _cacheReadyResolve = null;
  
  // XHR request tracking (like Violentmonkey's idMap)
  const _xhrRequests = new Map(); // requestId -> { details, aborted }
  let _xhrSeqId = 0;

  // Background-owned WebSocket handles. Connections live in the service
  // worker so @connect and internal-host guards are enforced before dialing.
  const _webSocketHandles = new Map(); // requestId -> { handle, details, listeners, readyState, closed }
  let _webSocketSeqId = 0;
  
  // Value change listeners (like Tampermonkey)
  const _valueChangeListeners = new Map(); // listenerId -> { key, callback }
  let _valueChangeListenerId = 0;

  // Listen for messages from content script (for menu commands, value changes, and XHR events)
  const __svNetworkBridgeListener = (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.channel !== CHANNEL_ID || msg.direction !== 'to-userscript') return;
    
    // Handle menu command execution
    if (msg.type === 'menuCommand' && msg.scriptId === scriptId) {
      const cmd = _menuCmds.get(msg.commandId);
      if (cmd?.callback) try { cmd.callback(); } catch(err) { /* silently ignore menu command errors */ }
    }
    
    // Handle value change notifications (cross-tab sync)
    if (msg.type === 'valueChanged' && msg.scriptId === scriptId) {
      const oldValue = _cache[msg.key];
      const hasPrivateValue = msg.hasValue === true;
      const newValuePromise = hasPrivateValue
        ? Promise.resolve(msg.newValue)
        : sendToBackground('GM_getValue', { scriptId, key: msg.key });
      newValuePromise.then((newValue) => {
        if (newValue === undefined) {
          delete _cache[msg.key];
        } else {
          _cache[msg.key] = newValue;
        }
        // Notify value change listeners
        _valueChangeListeners.forEach((listener) => {
          if (listener.key === msg.key || listener.key === null) {
            try {
              listener.callback(msg.key, oldValue, newValue, msg.remote !== false);
            } catch (e) {
              /* silently ignore value change listener errors */
            }
          }
        });
      }).catch(() => {});
    }
    
    // Handle XHR events
    if (msg.type === 'xhrEvent' && msg.scriptId === scriptId) {
      const request = _xhrRequests.get(msg.requestId);
      if (!request || request.aborted) return;
      
      const { details } = request;
      const eventType = msg.eventType;
      const eventData = { ...(msg.data || {}) };
      delete eventData.response;
      delete eventData.responseText;
      delete eventData.responseXML;
      delete eventData.responseHeaders;
      delete eventData.streamChunk;
      if (eventType === 'load' || eventType === 'loadend' || eventType === 'error' ||
          eventType === 'timeout' || eventType === 'abort') {
        return;
      }
      
      // Decode binary responses transferred as base64/dataURL
      let responseValue = eventData.response;
      if (responseValue && typeof responseValue === 'object' && responseValue.__sv_base64__) {
        // arraybuffer: base64 -> ArrayBuffer
        const binary = atob(responseValue.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        responseValue = bytes.buffer;
      } else if (details.responseType === 'blob' && typeof responseValue === 'string' && responseValue.startsWith('data:')) {
        // blob: data URL -> Blob
        try {
          const [header, b64] = responseValue.split(',');
          const mime = header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
          const binary = atob(b64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          responseValue = new Blob([bytes], { type: mime });
        } catch (e) {
          // Fall through with data URL string if conversion fails
        }
      }

      // Build response object matching GM_xmlhttpRequest spec
      const response = {
        readyState: eventData.readyState || 0,
        status: eventData.status || 0,
        statusText: eventData.statusText || '',
        responseHeaders: eventData.responseHeaders || '',
        response: responseValue,
        responseText: eventData.responseText || '',
        responseXML: eventData.responseXML,
        finalUrl: eventData.finalUrl || details.url,
        context: details.context,
        lengthComputable: eventData.lengthComputable,
        loaded: eventData.loaded,
        total: eventData.total
      };
      
      // Call appropriate callback
      const callbackName = 'on' + eventType;
      if (eventType.startsWith('upload.')) {
        const uploadEvent = eventType.replace('upload.', '');
        if (details.upload && details.upload['on' + uploadEvent]) {
          try {
            details.upload['on' + uploadEvent](response);
          } catch (e) {
            /* silently ignore XHR upload callback errors */
          }
        }
      } else if (details[callbackName]) {
        try {
          details[callbackName](response);
        } catch (e) {
          /* silently ignore XHR callback errors */
        }
      }
      
      // Clean up on loadend
      if (eventType === 'loadend') {
        _xhrRequests.delete(msg.requestId);
      }
    }

    // Handle GM_webSocket events
    if (msg.type === 'webSocketEvent' && msg.scriptId === scriptId) {
      const socket = _webSocketHandles.get(msg.requestId);
      if (!socket || socket.closed) return;

      const eventType = msg.eventType;
      const eventData = msg.data || {};

      function decodeMessageData(value) {
        if (value && typeof value === 'object' && value.__sv_base64__) {
          const binary = atob(value.data || '');
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          return bytes.buffer;
        }
        return value;
      }

      function dispatch(type, eventObject) {
        const handler = socket.handle && socket.handle['on' + type];
        if (typeof handler === 'function') {
          try { handler.call(socket.handle, eventObject); } catch (_e) {}
        }
        const listeners = socket.listeners[type];
        if (listeners) {
          for (const listener of Array.from(listeners)) {
            try { listener.call(socket.handle, eventObject); } catch (_e) {}
          }
        }
      }

      if (eventType === 'message' && eventData.eventId) {
        sendToBackground('GM_webSocket_takeEvent', {
          scriptId,
          requestId: msg.requestId,
          eventId: eventData.eventId
        }).then((result) => {
          if (!result || result.success !== true) return;
          const payloadEventData = result.event || {};
          dispatch('message', {
            type: 'message',
            data: decodeMessageData(payloadEventData.payload),
            origin: payloadEventData.origin || '',
            target: socket.handle,
            currentTarget: socket.handle,
          });
        }).catch(() => {});
        return;
      }

      if (eventType === 'open') {
        socket.readyState = 1;
        socket.protocol = eventData.protocol || '';
        socket.extensions = eventData.extensions || '';
        dispatch('open', { type: 'open', target: socket.handle, currentTarget: socket.handle });
      } else if (eventType === 'message') {
        dispatch('message', {
          type: 'message',
          data: decodeMessageData(eventData.payload),
          origin: eventData.origin || '',
          lastEventId: '',
          source: null,
          ports: [],
          target: socket.handle,
          currentTarget: socket.handle,
        });
      } else if (eventType === 'error') {
        dispatch('error', {
          type: 'error',
          message: eventData.error || 'WebSocket error',
          error: eventData.error || 'WebSocket error',
          target: socket.handle,
          currentTarget: socket.handle,
        });
      } else if (eventType === 'close') {
        socket.readyState = 3;
        socket.closed = true;
        dispatch('close', {
          type: 'close',
          code: eventData.code || 1006,
          reason: eventData.reason || '',
          wasClean: eventData.wasClean === true,
          target: socket.handle,
          currentTarget: socket.handle,
        });
        _webSocketHandles.delete(msg.requestId);
      }
    }
  };
  window.addEventListener('message', __svNetworkBridgeListener);
  
  // Bridge ready state tracking
  let _bridgeReady = false;
  let _bridgeReadyPromise = null;
  let _bridgeReadyResolve = null;
  
  // Wait for bridge to be ready
  function waitForBridge() {
    // Check if already ready (content script sets this global)
    if (window.__ScriptVault_BridgeReady__ || _bridgeReady) {
      _bridgeReady = true;
      return Promise.resolve();
    }
    
    // Return existing promise if already waiting
    if (_bridgeReadyPromise) return _bridgeReadyPromise;
    
    // Create promise to wait for bridge ready message
    _bridgeReadyPromise = new Promise((resolve) => {
      _bridgeReadyResolve = resolve;
      
      // Listen for bridgeReady message from content script
      function bridgeReadyHandler(event) {
        if (event.source !== window) return;
        const msg = event.data;
        if (!msg || msg.channel !== CHANNEL_ID || msg.direction !== 'to-userscript') return;
        if (msg.type === 'bridgeReady') {
          window.removeEventListener('message', bridgeReadyHandler);
          _bridgeReady = true;
          resolve();
        }
      }
      window.addEventListener('message', bridgeReadyHandler);
      
      // Also check global flag periodically (fallback)
      const checkInterval = setInterval(() => {
        if (window.__ScriptVault_BridgeReady__) {
          clearInterval(checkInterval);
          window.removeEventListener('message', bridgeReadyHandler);
          _bridgeReady = true;
          resolve();
        }
      }, 10);
      
      // Timeout after 1 second - bridge should be ready much faster
      setTimeout(() => {
        clearInterval(checkInterval);
        window.removeEventListener('message', bridgeReadyHandler);
        if (!_bridgeReady) {
          // This is normal in some contexts, proceed without warning spam
          _bridgeReady = true;
          resolve();
        }
      }, 1000);
    });
    
    return _bridgeReadyPromise;
  }
  
  function canUsePostMessageBridge(action) {
    return action === 'netlog_record' || action === 'reportExecError' || action === 'reportExecTime';
  }

  // Send message to background script.
  // Prefers chrome.runtime.sendMessage (direct, no bridge needed) when available via messaging: true.
  // The postMessage bridge is telemetry-only because page scripts can forge window messages.
  async function sendToBackground(action, data) {
    // Try direct messaging first (available when userScripts world has messaging: true)
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        const authenticatedData = data && typeof data === 'object' ? { ...data } : {};
        if (scriptAuthToken) authenticatedData.scriptAuthToken = scriptAuthToken;
        return await chrome.runtime.sendMessage({ action, data: authenticatedData });
      } catch (e) {
        // Extension context invalidated or messaging not available, fall through to bridge
      }
    }

    if (!canUsePostMessageBridge(action)) {
      return { error: 'ScriptVault requires Chrome userScripts messaging for GM API calls.' };
    }

    // Fallback: use the telemetry-only content script bridge via postMessage.
    await waitForBridge();

    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).substring(2) + Date.now().toString(36);

      // Set timeout for response
      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve(undefined);
      }, 10000);

      // Listen for response
      function handler(event) {
        if (event.source !== window) return;
        const msg = event.data;
        if (!msg || msg.channel !== CHANNEL_ID || msg.direction !== 'to-userscript') return;
        if (msg.id !== id) return;

        window.removeEventListener('message', handler);
        clearTimeout(timeout);

        if (msg.success) {
          resolve(msg.result);
        } else {
          resolve(undefined);
        }
      }

      window.addEventListener('message', handler);

      // Send to content script bridge
      window.postMessage({
        channel: CHANNEL_ID,
        direction: 'to-background',
        id: id,
        action: action,
        data: data
      }, '*');
    });
  }

  // Refresh storage cache from background
  // This ensures we have the latest values, not stale values from registration time
  async function _refreshStorageCache() {
    if (_cacheReady) return;
    
    try {
      const canReadValues = hasGrant('GM_getValue') || hasGrant('GM.getValue')
        || hasGrant('GM_getValues') || hasGrant('GM.getValues');
      if (!canReadValues) {
        _cacheReady = true;
        if (_cacheReadyResolve) _cacheReadyResolve();
        return;
      }
      const freshValues = await sendToBackground('GM_getValues', { scriptId });
      if (freshValues && typeof freshValues === 'object' && !Array.isArray(freshValues)) {
        // Merge only keys that have not been changed locally while the read was
        // pending. This preserves GM_setValue and GM_deleteValue semantics.
        for (const [key, value] of Object.entries(freshValues)) {
          if (!_cacheLocalMutations.has(key)) _cache[key] = value;
        }
      }
      _cacheReady = true;
      if (_cacheReadyResolve) _cacheReadyResolve();
    } catch (e) {
      // If refresh fails, continue with pre-loaded values
      _cacheReady = true;
      if (_cacheReadyResolve) _cacheReadyResolve();
    }
  }
  
  // Start refreshing cache immediately (don't await - let script start running)
  // Scripts can use GM_getValue immediately with pre-loaded values
  // Fresh values will be available after the async refresh completes
  _refreshStorageCache();
  
  // Synchronous GM_getValue - returns from cache (pre-loaded or refreshed)
  function GM_getValue(key, defaultValue) {
    if (!hasGrant('GM_getValue') && !hasGrant('GM.getValue')) return defaultValue;
    // hasOwnProperty, not the in-operator: _cache is a plain object literal,
    // so in is true for every Object.prototype member and
    // GM_getValue('toString', fallback) returned Function, never the default.
    if (Object.prototype.hasOwnProperty.call(_cache, key)) return _cache[key];
    return defaultValue;
  }
  
  // GM_setValue - updates cache IMMEDIATELY, persists async (like Tampermonkey/Violentmonkey)
  function GM_setValue(key, value) {
    if (!hasGrant('GM_setValue') && !hasGrant('GM.setValue')) {
      return;
    }
    // Update local cache IMMEDIATELY - this makes subsequent GM_getValue instant
    _cache[key] = value;
    _cacheLocalMutations.add(key);
    // Persist async (fire and forget) - background handles debouncing
    sendToBackground('GM_setValue', { scriptId, key, value }).catch(() => {});
    return value;
  }
  
  // GM_deleteValue
  function GM_deleteValue(key) {
    if (!hasGrant('GM_deleteValue') && !hasGrant('GM.deleteValue')) return;
    delete _cache[key];
    _cacheLocalMutations.add(key);
    sendToBackground('GM_deleteValue', { scriptId, key }).catch(() => {});
  }
  
  // GM_listValues - returns cached keys synchronously
  function GM_listValues() {
    if (!hasGrant('GM_listValues') && !hasGrant('GM.listValues')) return [];
    return Object.keys(_cache);
  }
  
  // GM_getValues - Get multiple values at once (like Violentmonkey)
  // Accepts array of keys or object with default values
  function GM_getValues(keysOrDefaults) {
    if (!hasGrant('GM_getValue') && !hasGrant('GM.getValue') && 
        !hasGrant('GM_getValues') && !hasGrant('GM.getValues')) {
      return Array.isArray(keysOrDefaults) ? {} : keysOrDefaults;
    }
    const result = {};
    if (Array.isArray(keysOrDefaults)) {
      // Array of keys - return values or undefined
      for (const key of keysOrDefaults) {
        if (Object.prototype.hasOwnProperty.call(_cache, key)) {
          result[key] = _cache[key];
        }
      }
    } else if (typeof keysOrDefaults === 'object' && keysOrDefaults !== null) {
      // Object with defaults - return values or defaults
      for (const key of Object.keys(keysOrDefaults)) {
        result[key] = Object.prototype.hasOwnProperty.call(_cache, key) ? _cache[key] : keysOrDefaults[key];
      }
    }
    return result;
  }
  
  // GM_setValues - Set multiple values at once (like Violentmonkey)
  function GM_setValues(values) {
    if (!hasGrant('GM_setValue') && !hasGrant('GM.setValue') &&
        !hasGrant('GM_setValues') && !hasGrant('GM.setValues')) {
      return;
    }
    if (typeof values !== 'object' || values === null) return;
    
    // Update local cache immediately for all values
    for (const [key, value] of Object.entries(values)) {
      _cache[key] = value;
      _cacheLocalMutations.add(key);
    }
    // Persist all values to background in one call
    sendToBackground('GM_setValues', { scriptId, values }).catch(() => {});
  }
  
  // GM_deleteValues - Delete multiple values at once (like Violentmonkey)
  function GM_deleteValues(keys) {
    if (!hasGrant('GM_deleteValue') && !hasGrant('GM.deleteValue') &&
        !hasGrant('GM_deleteValues') && !hasGrant('GM.deleteValues')) {
      return;
    }
    if (!Array.isArray(keys)) return;
    
    // Delete from local cache immediately
    for (const key of keys) {
      delete _cache[key];
      _cacheLocalMutations.add(key);
    }
    // Persist deletions to background in one call
    sendToBackground('GM_deleteValues', { scriptId, keys }).catch(() => {});
  }
  
  // Constructable-stylesheet support (Chrome always; Firefox 153+ exposes
  // ShadowRoot.adoptedStyleSheets to user scripts without wrappedJSObject).
  function _supportsConstructableSheets() {
    try {
      if (typeof CSSStyleSheet !== 'function') return false;
      const probe = new CSSStyleSheet();
      return typeof probe.replaceSync === 'function';
    } catch (e) {
      return false;
    }
  }

  // A document-level <style> cannot cross shadow boundaries. Apply the CSS as a
  // constructable stylesheet to every currently-open shadow root so GM_addStyle
  // reaches components that render into shadow DOM. Bounded DOM walk; a no-op
  // where constructable stylesheets are unavailable. Returns handles for cleanup.
  function _addStyleToOpenShadowRoots(css) {
    if (!_supportsConstructableSheets()) return [];
    let sheet;
    try {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
    } catch (e) {
      return [];
    }
    const handles = [];
    try {
      const root = document.documentElement || document;
      if (!root || typeof root.querySelectorAll !== 'function') return handles;
      const all = root.querySelectorAll('*');
      const limit = Math.min(all.length, 15000);
      for (let i = 0; i < limit; i++) {
        const sr = all[i] && all[i].shadowRoot; // only OPEN shadow roots are reachable
        const adopted = sr && sr.adoptedStyleSheets;
        if (adopted && typeof adopted[Symbol.iterator] === 'function') {
          try {
            const current = [...adopted];
            if (!current.includes(sheet)) {
              sr.adoptedStyleSheets = [...current, sheet];
              handles.push(sr);
            }
          } catch (e) { /* frozen/cross-origin shadow root */ }
        }
      }
    } catch (e) { /* DOM not walkable yet */ }
    return handles.length ? [{ sheet, roots: handles }] : [];
  }

  function _removeShadowStyleHandles(entries) {
    for (const entry of entries || []) {
      for (const sr of entry.roots || []) {
        try {
          sr.adoptedStyleSheets = [...sr.adoptedStyleSheets].filter(s => s !== entry.sheet);
        } catch (e) { /* root gone */ }
      }
    }
  }

  // GM_addStyle - inject CSS with robust DOM handling
  function GM_addStyle(css) {
    const style = document.createElement('style');
    style.textContent = css;
    // Keep a non-reversible marker for diagnostics without exposing the
    // per-install script identity to page scripts.
    style.setAttribute('data-scriptvault', '1');

    // Try to inject immediately
    function inject() {
      const target = document.head || document.documentElement || document.body;
      if (target && target.appendChild) {
        try {
          target.appendChild(style);
          return true;
        } catch (e) {
          // appendChild failed, will retry
        }
      }
      return false;
    }
    
    if (!inject()) {
      // DOM not ready - wait for it
      if (document.readyState === 'loading') {
        // Document still loading, wait for DOMContentLoaded
        document.addEventListener('DOMContentLoaded', () => inject(), { once: true });
      } else {
        // Document loaded but no valid target - use MutationObserver
        const observer = new MutationObserver(() => {
          if (inject()) {
            observer.disconnect();
          }
        });
        
        // Observe whatever root we can find
        const root = document.documentElement || document;
        if (root && root.nodeType === Node.ELEMENT_NODE) {
          observer.observe(root, { childList: true, subtree: true });
        }
        
        // Fallback timeout - try one more time after a delay
        setTimeout(() => {
          observer.disconnect();
          if (!style.parentNode) {
            inject();
          }
        }, 1000);
      }
    }

    // Also reach open shadow roots (a document <style> cannot). The returned
    // element stays the document <style> for full GM_addStyle compatibility; we
    // only extend its removal so unbinding clears the shadow-root sheets too.
    const shadowHandles = _addStyleToOpenShadowRoots(css);
    if (shadowHandles.length) {
      const origRemove = typeof style.remove === 'function' ? style.remove.bind(style) : null;
      try {
        Object.defineProperty(style, 'remove', {
          configurable: true,
          writable: true,
          value: function () {
            _removeShadowStyleHandles(shadowHandles);
            if (origRemove) return origRemove();
          }
        });
      } catch (e) { /* element sealed; document style still removable normally */ }
    }

    return style;
  }

  // GM_xmlhttpRequest - Full implementation with all events (like Violentmonkey)
  function GM_xmlhttpRequest(details, options) {
    const allowFetchGrant = options && options.allowFetchGrant === true;
    if (!hasGrant('GM_xmlhttpRequest') && !hasGrant('GM.xmlHttpRequest') &&
        !(allowFetchGrant && (hasGrant('GM_fetch') || hasGrant('GM.fetch')))) {
      if (details.onerror) details.onerror({ error: 'Permission denied', status: 0 });
      return { abort: () => {} };
    }
    
    // Generate unique request ID
    const localId = 'xhr_' + (++_xhrSeqId) + '_' + Date.now().toString(36);
    let requestId = null;
    let aborted = false;
    let currentMapKey = localId;

    // Store request details for event handling
    const requestEntry = { details, aborted: false };
    _xhrRequests.set(localId, requestEntry);

    // Control object returned to the script
    const control = {
      abort: () => {
        aborted = true;
        requestEntry.aborted = true;
        // Send abort using server ID if available, clean up both keys
        if (requestId) {
          sendToBackground('GM_xmlhttpRequest_abort', { requestId }).catch(() => {});
        }
        // Call onabort callback
        if (details.onabort) {
          try {
            details.onabort({ error: 'Aborted', status: 0 });
          } catch (e) {}
        }
        // Clean up both possible keys to avoid orphans
        _xhrRequests.delete(localId);
        if (requestId) _xhrRequests.delete(requestId);
      }
    };

    // Serialize request body to a structured-clone-safe format.
    // Blob/File/FormData cannot cross the extension messaging boundary natively.
    async function _serializeBody(d) {
      if (!d || typeof d === 'string' || d instanceof ArrayBuffer || ArrayBuffer.isView(d)) return d;
      if (d instanceof URLSearchParams) return d.toString();
      function _ab2b64(buf) {
        const bytes = new Uint8Array(buf), chunk = 8192;
        let s = '';
        for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
        return btoa(s);
      }
      if (d instanceof Blob || d instanceof File) {
        const buf = await d.arrayBuffer();
        return { __sv_blob__: true, b64: _ab2b64(buf), type: d.type, name: d instanceof File ? d.name : undefined };
      }
      if (d instanceof FormData) {
        const entries = [];
        for (const [name, val] of d.entries()) {
          if (val instanceof Blob || val instanceof File) {
            const buf = await val.arrayBuffer();
            entries.push({ name, b64: _ab2b64(buf), type: val.type, filename: val instanceof File ? val.name : 'blob' });
          } else {
            entries.push({ name, value: val });
          }
        }
        return { __sv_formdata__: true, entries };
      }
      return d;
    }

    // Start the request (async to allow body serialization)
    (async () => {
      const serializedData = await _serializeBody(details.data);
      const response = await sendToBackground('GM_xmlhttpRequest', {
        scriptId,
        method: details.method || 'GET',
        url: details.url,
        headers: details.headers,
        data: serializedData,
        timeout: details.timeout,
        responseType: details.responseType,
        overrideMimeType: details.overrideMimeType,
        user: details.user,
        password: details.password,
        context: details.context,
        anonymous: details.anonymous,
        partitionKey: details.partitionKey,
        cookiePartition: details.cookiePartition,
        cookieStoreId: details.cookieStoreId,
        cookieStore: details.cookieStore,
        // VM #2168 / TM noCache: bypass intermediate caches.
        // Accept both noCache (VM camelCase) and nocache (TM lowercase).
        noCache: details.noCache === true || details.nocache === true,
        // VM #2359: expose RequestInit.redirect so scripts can detect/block redirects.
        redirect: details.redirect,
        // Track which callbacks are registered so background knows what to send
        hasCallbacks: {
          onload: !!details.onload,
          onerror: !!details.onerror,
          onprogress: !!details.onprogress,
          onreadystatechange: !!details.onreadystatechange,
          ontimeout: !!details.ontimeout,
          onabort: !!details.onabort,
          onloadstart: !!details.onloadstart,
          onloadend: !!details.onloadend,
          upload: !!(details.upload && (
            details.upload.onprogress || 
            details.upload.onloadstart || 
            details.upload.onload || 
            details.upload.onerror
          ))
        }
      });
      if (aborted) return;

      if (!response) {
        // No response (bridge failure)
        if (details.onerror) details.onerror({ error: 'Request failed - no response', status: 0 });
        _xhrRequests.delete(currentMapKey);
      } else if (response.error) {
        // Immediate error
        if (details.onerror) details.onerror({ error: response.error, status: 0 });
        _xhrRequests.delete(currentMapKey);
      } else if (response.requestId) {
        // Re-key: add server ID entry, then remove local ID
        requestId = response.requestId;
        _xhrRequests.set(requestId, requestEntry);
        _xhrRequests.delete(localId);
        currentMapKey = requestId;
        pollXhrFinalResult();
      }
    })().catch(err => {
      if (aborted) return;
      if (details.onerror) details.onerror({ error: err.message || 'Request failed', status: 0 });
      _xhrRequests.delete(currentMapKey);
    });

    function dispatchXhrTerminal(eventType, eventData) {
      if (aborted || requestEntry.aborted) return;
      const response = eventData || { readyState: 4, status: 0 };
      if (typeof details.onreadystatechange === 'function') {
        try { details.onreadystatechange(response); } catch (e) {}
      }
      if (eventType === 'load') {
        if (typeof details.onload === 'function') {
          try { details.onload(response); } catch (e) {}
        }
      } else if (eventType === 'timeout') {
        if (typeof details.ontimeout === 'function') {
          try { details.ontimeout(response); } catch (e) {}
        }
      } else if (eventType === 'abort') {
        if (typeof details.onabort === 'function') {
          try { details.onabort(response); } catch (e) {}
        }
      } else if (typeof details.onerror === 'function') {
        try { details.onerror(response); } catch (e) {}
      }
      if (typeof details.onloadend === 'function') {
        try { details.onloadend(response); } catch (e) {}
      }
      _xhrRequests.delete(currentMapKey);
      if (requestId) _xhrRequests.delete(requestId);
    }

    // Terminal events reach the script only through this poll, so its deadline
    // IS the request effective lifetime. A fixed 600 ticks x 50 ms capped every
    // request at 30 s regardless of its own timeout, so a timeout of 60000 ms
    // completed in the background while onload/onerror/onloadend never fired and
    // the _xhrRequests entry leaked. Track wall-clock against the request own
    // timeout plus headroom for the background own bookkeeping.
    const XHR_POLL_INTERVAL_MS = 50;
    const XHR_POLL_GRACE_MS = 15000;
    const xhrPollDeadline = Date.now()
      + (Number(details.timeout) > 0 ? Number(details.timeout) : 30000)
      + XHR_POLL_GRACE_MS;

    function pollXhrFinalResult() {
      if (aborted || requestEntry.aborted || !requestId) return;
      sendToBackground('GM_xmlhttpRequest_result', { scriptId, requestId }).then((result) => {
        if (aborted || requestEntry.aborted) return;
        if (result && result.done !== true && result.unknown === true) {
          // The background no longer knows this request — a service-worker
          // restart dropped it. Polling can never succeed, so settle now instead
          // of spinning until the deadline.
          dispatchXhrTerminal('error', {
            readyState: 4,
            status: 0,
            error: 'Request was lost before it completed (the extension service worker restarted)'
          });
          return;
        }
        if (!result || result.done !== true) {
          scheduleNextXhrPoll();
          return;
        }
        dispatchXhrTerminal(result.type || 'error', result.response || { readyState: 4, status: 0, error: result.error || 'Request failed' });
      }).catch(() => {
        scheduleNextXhrPoll();
      });
    }

    function scheduleNextXhrPoll() {
      if (Date.now() < xhrPollDeadline) {
        setTimeout(pollXhrFinalResult, XHR_POLL_INTERVAL_MS);
        return;
      }
      // Past the deadline: report it rather than abandoning the request silently.
      dispatchXhrTerminal('timeout', {
        readyState: 4,
        status: 0,
        error: 'No result from the background within the request timeout'
      });
    }
    
    return control;
  }

  function _GM_xmlhttpRequestPromise(d, options) {
    let control;
    const promise = new Promise((res, rej) => {
      control = GM_xmlhttpRequest({
        ...d,
        onload: (r) => { if (d.onload) d.onload(r); res(r); },
        onerror: (e) => { if (d.onerror) d.onerror(e); rej(e.error || e); },
        ontimeout: (e) => { if (d.ontimeout) d.ontimeout(e); rej(new Error('timeout')); },
        onabort: (e) => { if (d.onabort) d.onabort(e); rej(new Error('aborted')); }
      }, options);
    });
    promise.abort = () => { if (control && typeof control.abort === 'function') control.abort(); };
    return promise;
  }

  function _normalizeWebSocketDetails(urlOrDetails, protocolsOrOptions, maybeOptions) {
    let details = {};
    if (urlOrDetails && typeof urlOrDetails === 'object' && !(urlOrDetails instanceof URL)) {
      details = { ...urlOrDetails };
    } else {
      details.url = String(urlOrDetails || '');
    }

    if (Array.isArray(protocolsOrOptions) || typeof protocolsOrOptions === 'string') {
      details.protocols = protocolsOrOptions;
    } else if (protocolsOrOptions && typeof protocolsOrOptions === 'object') {
      details = { ...details, ...protocolsOrOptions };
    }

    if (maybeOptions && typeof maybeOptions === 'object') {
      details = { ...details, ...maybeOptions };
    }

    return details;
  }

  function _dispatchLocalWebSocketError(entry, message) {
    const eventObject = {
      type: 'error',
      message,
      error: message,
      target: entry.handle,
      currentTarget: entry.handle,
    };
    if (typeof entry.handle.onerror === 'function') {
      try { entry.handle.onerror.call(entry.handle, eventObject); } catch (_e) {}
    }
    const listeners = entry.listeners.error;
    if (listeners) {
      for (const listener of Array.from(listeners)) {
        try { listener.call(entry.handle, eventObject); } catch (_e) {}
      }
    }
  }

  async function _serializeWebSocketPayload(payload) {
    if (payload == null) return '';
    if (typeof payload === 'string') return payload;
    if (typeof URLSearchParams !== 'undefined' && payload instanceof URLSearchParams) return payload.toString();

    let buffer = null;
    if (payload instanceof ArrayBuffer) {
      buffer = payload;
    } else if (ArrayBuffer.isView(payload)) {
      buffer = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
    } else if ((typeof Blob === 'function' && payload instanceof Blob)
      || (typeof File === 'function' && payload instanceof File)) {
      buffer = await payload.arrayBuffer();
    }

    if (!buffer) return String(payload);

    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    return { __sv_base64__: true, data: btoa(binary) };
  }

  function GM_webSocket(urlOrDetails, protocolsOrOptions, maybeOptions) {
    const details = _normalizeWebSocketDetails(urlOrDetails, protocolsOrOptions, maybeOptions);
    const localId = 'ws_' + (++_webSocketSeqId) + '_' + Date.now().toString(36);
    const listeners = { open: new Set(), message: new Set(), error: new Set(), close: new Set() };
    const entry = {
      requestId: null,
      details,
      listeners,
      readyState: 0,
      closed: false,
      protocol: '',
      extensions: '',
      handle: null,
    };

    const handle = {
      CONNECTING: 0,
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3,
      binaryType: details.binaryType === 'blob' ? 'blob' : 'arraybuffer',
      onopen: typeof details.onopen === 'function' ? details.onopen : null,
      onmessage: typeof details.onmessage === 'function' ? details.onmessage : null,
      onerror: typeof details.onerror === 'function' ? details.onerror : null,
      onclose: typeof details.onclose === 'function' ? details.onclose : null,
      get url() { return String(details.url || ''); },
      get readyState() { return entry.readyState; },
      get protocol() { return entry.protocol || ''; },
      get extensions() { return entry.extensions || ''; },
      addEventListener(type, listener) {
        if (listeners[type] && typeof listener === 'function') listeners[type].add(listener);
      },
      removeEventListener(type, listener) {
        if (listeners[type]) listeners[type].delete(listener);
      },
      dispatchEvent(event) {
        if (!event || !listeners[event.type]) return false;
        for (const listener of Array.from(listeners[event.type])) {
          try { listener.call(handle, event); } catch (_e) {}
        }
        return true;
      },
      send(payload) {
        if (!entry.requestId || entry.readyState !== 1 || entry.closed) {
          _dispatchLocalWebSocketError(entry, 'WebSocket is not open');
          return false;
        }
        (async () => {
          const encoded = await _serializeWebSocketPayload(payload);
          const response = await sendToBackground('GM_webSocket_send', {
            scriptId,
            requestId: entry.requestId,
            payload: encoded,
          });
          if (response && response.error) _dispatchLocalWebSocketError(entry, response.error);
        })().catch(error => _dispatchLocalWebSocketError(entry, error?.message || 'WebSocket send failed'));
        return true;
      },
      close(code, reason) {
        if (entry.closed) return;
        entry.readyState = 2;
        if (entry.requestId) {
          sendToBackground('GM_webSocket_close', {
            scriptId,
            requestId: entry.requestId,
            code,
            reason,
          }).catch(() => {});
        } else {
          entry.closed = true;
          entry.readyState = 3;
          _webSocketHandles.delete(localId);
        }
      },
      abort() {
        handle.close(1000, 'aborted');
      },
    };

    entry.handle = handle;
    _webSocketHandles.set(localId, entry);

    if (!hasGrant('GM_webSocket') && !hasGrant('GM.webSocket')) {
      entry.readyState = 3;
      entry.closed = true;
      _dispatchLocalWebSocketError(entry, 'Permission denied');
      _webSocketHandles.delete(localId);
      return handle;
    }

    sendToBackground('GM_webSocket', {
      scriptId,
      url: details.url,
      protocols: details.protocols,
      binaryType: handle.binaryType,
    }).then(response => {
      if (!response || response.error) {
        entry.readyState = 3;
        entry.closed = true;
        _dispatchLocalWebSocketError(entry, response?.error || 'WebSocket connection failed');
        _webSocketHandles.delete(localId);
        return;
      }
      if (response.requestId) {
        entry.requestId = response.requestId;
        _webSocketHandles.set(response.requestId, entry);
        _webSocketHandles.delete(localId);
      }
    }).catch(error => {
      entry.readyState = 3;
      entry.closed = true;
      _dispatchLocalWebSocketError(entry, error?.message || 'WebSocket connection failed');
      _webSocketHandles.delete(localId);
    });

    return handle;
  }

  GM_webSocket.CONNECTING = 0;
  GM_webSocket.OPEN = 1;
  GM_webSocket.CLOSING = 2;
  GM_webSocket.CLOSED = 3;

  function _gmFetchAbortError() {
    if (typeof DOMException === 'function') return new DOMException('The operation was aborted.', 'AbortError');
    const err = new Error('The operation was aborted.');
    err.name = 'AbortError';
    return err;
  }

  function _gmFetchHeadersToRecord(headers) {
    const out = {};
    if (!headers) return out;
    if (typeof Headers !== 'undefined' && headers instanceof Headers) {
      headers.forEach((value, key) => { out[key] = value; });
      return out;
    }
    if (Array.isArray(headers)) {
      for (const entry of headers) {
        if (Array.isArray(entry) && entry.length >= 2) out[String(entry[0])] = String(entry[1]);
      }
      return out;
    }
    if (typeof headers === 'object') {
      for (const key of Object.keys(headers)) {
        if (headers[key] !== undefined) out[key] = String(headers[key]);
      }
    }
    return out;
  }

  function _gmFetchParseResponseHeaders(raw) {
    const headers = typeof Headers !== 'undefined' ? new Headers() : {};
    if (!raw || typeof raw !== 'string') return headers;
    for (const line of raw.split(/\\r?\\n/)) {
      const idx = line.indexOf(':');
      if (idx <= 0) continue;
      const name = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (!name) continue;
      if (headers instanceof Headers) headers.append(name, value);
      else headers[name] = headers[name] ? headers[name] + ', ' + value : value;
    }
    return headers;
  }

  function _gmFetchBase64ToBytes(data) {
    const binary = atob(data || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function _gmFetchDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function _gmFetchSerializeBody(body) {
    if (!body || typeof body === 'string' || body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return body;
    if (typeof body.getReader === 'function') throw new Error('GM.fetch does not support streaming request bodies');
    if (body instanceof URLSearchParams) return body.toString();
    function _ab2b64(buf) {
      const bytes = new Uint8Array(buf), chunk = 8192;
      let s = '';
      for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
      return btoa(s);
    }
    if (body instanceof Blob || body instanceof File) {
      const buf = await body.arrayBuffer();
      return { __sv_blob__: true, b64: _ab2b64(buf), type: body.type, name: body instanceof File ? body.name : undefined };
    }
    if (body instanceof FormData) {
      const entries = [];
      for (const [name, val] of body.entries()) {
        if (val instanceof Blob || val instanceof File) {
          const buf = await val.arrayBuffer();
          entries.push({ name, b64: _ab2b64(buf), type: val.type, filename: val instanceof File ? val.name : 'blob' });
        } else {
          entries.push({ name, value: val });
        }
      }
      return { __sv_formdata__: true, entries };
    }
    return body;
  }

  function _gmFetchBuildResponse(meta, body, fallbackUrl) {
    const status = Number(meta && meta.status);
    const responseStatus = status >= 200 && status <= 599 ? status : 200;
    const noBodyStatus = responseStatus === 204 || responseStatus === 205 || responseStatus === 304;
    const fetchResponse = new Response(noBodyStatus ? null : body, {
      status: responseStatus,
      statusText: (meta && meta.statusText) || '',
      headers: _gmFetchParseResponseHeaders((meta && meta.responseHeaders) || '')
    });
    try {
      Object.defineProperty(fetchResponse, 'url', { value: (meta && meta.finalUrl) || fallbackUrl, configurable: true });
    } catch (e) {}
    return fetchResponse;
  }

  async function GM_fetch(input, init = {}) {
    if (!hasGrant('GM_fetch') && !hasGrant('GM.fetch') &&
        !hasGrant('GM_xmlhttpRequest') && !hasGrant('GM.xmlHttpRequest')) {
      throw new Error('GM.fetch requires @grant GM.fetch or @grant GM_xmlhttpRequest');
    }
    if (typeof Response !== 'function') {
      throw new Error('GM.fetch requires Response support in this browser context');
    }

    const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
    const fetchInit = init || {};
    const method = String(fetchInit.method || (request && request.method) || 'GET').toUpperCase();
    const url = request ? request.url : String(input);
    const requestHeaders = request ? _gmFetchHeadersToRecord(request.headers) : {};
    const initHeaders = _gmFetchHeadersToRecord(fetchInit.headers);
    const headers = { ...requestHeaders, ...initHeaders };
    const hasInitBody = Object.prototype.hasOwnProperty.call(fetchInit, 'body');
    let body = hasInitBody ? fetchInit.body : undefined;
    if (!hasInitBody && request && method !== 'GET' && method !== 'HEAD') {
      try {
        body = await request.clone().arrayBuffer();
      } catch (e) {
        body = undefined;
      }
    }

    const signal = fetchInit.signal;
    if (signal && signal.aborted) throw _gmFetchAbortError();

    const requestPayload = {
      method,
      url,
      headers,
      data: body,
      anonymous: (fetchInit.credentials || (request && request.credentials)) === 'omit',
      noCache: fetchInit.cache === 'no-store' || fetchInit.cache === 'reload' || (request && (request.cache === 'no-store' || request.cache === 'reload')),
      redirect: fetchInit.redirect || (request && request.redirect)
    };

    if (typeof ReadableStream === 'function') {
      const serializedBody = await _gmFetchSerializeBody(body);
      let requestId = null;
      let streamController = null;
      let responseSettled = false;
      let streamSettled = false;
      let abortHandler;
      let abortPending = false;

      let resolveResponse;
      let rejectResponse;
      const responsePromise = new Promise((resolve, reject) => {
        resolveResponse = resolve;
        rejectResponse = reject;
      });

      const abortRequest = () => {
        if (streamSettled) return;
        streamSettled = true;
        if (requestId) sendToBackground('GM_xmlhttpRequest_abort', { scriptId, requestId }).catch(() => {});
        else abortPending = true;
        if (!responseSettled) {
          responseSettled = true;
          rejectResponse(_gmFetchAbortError());
        }
        try { streamController?.error?.(_gmFetchAbortError()); } catch (e) {}
      };

      const bodyStream = new ReadableStream({
        start(controller) {
          streamController = controller;
        },
        cancel() {
          abortRequest();
        }
      });

      if (signal && typeof signal.addEventListener === 'function') {
        abortHandler = abortRequest;
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      const cleanupSignal = () => {
        if (signal && abortHandler && typeof signal.removeEventListener === 'function') {
          signal.removeEventListener('abort', abortHandler);
        }
      };

      const settleResponse = (meta) => {
        if (responseSettled) return;
        responseSettled = true;
        resolveResponse(_gmFetchBuildResponse(meta, bodyStream, url));
      };

      const failStream = (error) => {
        streamSettled = true;
        cleanupSignal();
        if (!responseSettled) {
          responseSettled = true;
          rejectResponse(error);
        } else {
          try { streamController?.error?.(error); } catch (e) {}
        }
      };

      const enqueueChunks = (chunks) => {
        if (!Array.isArray(chunks) || !chunks.length || streamSettled) return;
        for (const chunk of chunks) {
          const responseChunk = chunk && chunk.response;
          if (responseChunk && responseChunk.__sv_base64__) {
            streamController.enqueue(_gmFetchBase64ToBytes(responseChunk.data));
          } else if (typeof chunk.responseText === 'string') {
            streamController.enqueue(new TextEncoder().encode(chunk.responseText));
          }
        }
      };

      const started = await sendToBackground('GM_xmlhttpRequest', {
        scriptId,
        ...requestPayload,
        data: serializedBody,
        responseType: 'stream',
        streamEncoding: 'base64'
      });

      if (!started || started.error || !started.requestId) {
        cleanupSignal();
        throw new Error(started?.error || 'GM.fetch failed to start');
      }
      requestId = started.requestId;
      if (abortPending || (signal && signal.aborted)) {
        sendToBackground('GM_xmlhttpRequest_abort', { scriptId, requestId }).catch(() => {});
        return responsePromise;
      }

      // Bounded, and it stops the moment the background says it no longer knows
      // this request. The old unbounded loop polled every 25 ms forever: after an
      // MV3 service-worker restart the id was unknown and a bare {done:false} came
      // back indefinitely, so the promise never settled and a ~40 msg/s wake loop
      // kept the worker from ever idling.
      const STREAM_POLL_INTERVAL_MS = 25;
      const STREAM_POLL_GRACE_MS = 15000;
      const streamPollDeadline = Date.now()
        + (Number(requestPayload.timeout) > 0 ? Number(requestPayload.timeout) : 300000)
        + STREAM_POLL_GRACE_MS;

      (async () => {
        try {
          for (;;) {
            if (signal && signal.aborted) throw _gmFetchAbortError();
            if (Date.now() >= streamPollDeadline) {
              throw new Error('GM.fetch stream timed out waiting for the background');
            }
            const result = await sendToBackground('GM_xmlhttpRequest_result', {
              scriptId,
              requestId,
              takeStream: true
            });
            if (result?.meta) settleResponse(result.meta);
            enqueueChunks(result?.streamChunks);

            if (result && result.done !== true && result.unknown === true) {
              throw new Error('GM.fetch stream was lost before it completed (the extension service worker restarted)');
            }

            if (result?.done === true) {
              const terminalType = result.type || 'error';
              if (terminalType === 'load') {
                settleResponse(result.meta || result.response || {});
                streamSettled = true;
                cleanupSignal();
                try { streamController.close(); } catch (e) {}
              } else {
                const message = result.error || result.response?.error || 'GM.fetch request failed';
                failStream(new Error(message));
              }
              return;
            }
            await _gmFetchDelay(STREAM_POLL_INTERVAL_MS);
          }
        } catch (error) {
          failStream((signal && signal.aborted) ? _gmFetchAbortError() : error);
        }
      })();

      return responsePromise;
    }

    const xhrPromise = _GM_xmlhttpRequestPromise({
      ...requestPayload,
      responseType: 'arraybuffer',
    }, { allowFetchGrant: true });

    let abortHandler;
    if (signal && typeof signal.addEventListener === 'function') {
      abortHandler = () => {
        if (typeof xhrPromise.abort === 'function') xhrPromise.abort();
      };
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    let xhrResponse;
    try {
      xhrResponse = await xhrPromise;
    } catch (error) {
      if (signal && signal.aborted) throw _gmFetchAbortError();
      throw error;
    } finally {
      if (signal && abortHandler && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', abortHandler);
      }
    }

    if (signal && signal.aborted) throw _gmFetchAbortError();
    const status = Number(xhrResponse && xhrResponse.status);
    const responseStatus = status >= 200 && status <= 599 ? status : 200;
    const bodyValue = xhrResponse && xhrResponse.response != null
      ? xhrResponse.response
      : ((xhrResponse && xhrResponse.responseText) || '');
    const fetchResponse = new Response(bodyValue, {
      status: responseStatus,
      statusText: (xhrResponse && xhrResponse.statusText) || '',
      headers: _gmFetchParseResponseHeaders((xhrResponse && xhrResponse.responseHeaders) || '')
    });
    try {
      Object.defineProperty(fetchResponse, 'url', { value: (xhrResponse && xhrResponse.finalUrl) || url, configurable: true });
    } catch (e) {}
    return fetchResponse;
  }
  
  // GM_addValueChangeListener - Watch for value changes (like Tampermonkey)
  function GM_addValueChangeListener(key, callback) {
    if (!hasGrant('GM_addValueChangeListener') && !hasGrant('GM.addValueChangeListener')) return null;
    if (typeof callback !== 'function') return null;
    
    const listenerId = ++_valueChangeListenerId;
    _valueChangeListeners.set(listenerId, { key, callback });
    return listenerId;
  }
  
  // GM_removeValueChangeListener - Stop watching for value changes
  function GM_removeValueChangeListener(listenerId) {
    if (!hasGrant('GM_removeValueChangeListener') && !hasGrant('GM.removeValueChangeListener')) return false;
    return _valueChangeListeners.delete(listenerId);
  }
  
  // GM_setClipboard
  function GM_setClipboard(text, type) {
    if (!hasGrant('GM_setClipboard') && !hasGrant('GM.setClipboard')) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
    } else {
      fallbackCopyText(text);
    }
  }
  
  function fallbackCopyText(text) {
    const target = document.body || document.documentElement;
    if (!target) return;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
    target.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch(e) {}
    ta.remove();
  }
  
  // GM_head — convenience wrapper for HEAD requests
  function GM_head(url, callback) {
    if (!hasGrant('GM_xmlhttpRequest') && !hasGrant('GM.xmlHttpRequest')) {
      if (typeof callback === 'function') callback({ error: 'Missing @grant GM_xmlhttpRequest' });
      return;
    }
    GM_xmlhttpRequest({ method: 'HEAD', url, onload: callback, onerror: callback });
  }

  // GM_notification (with onclick, ondone, onbuttonclick, timeout, tag, silent,
  // highlight, url, plus Phase 11.11 progress + buttons + update + close).
  // Returns a control object with { close(), update(details) } so script
  // authors don't have to keep notification IDs around manually.
  // Wrapper-side LRU cap mirrors the 500-entry cap on the background side at
  // self._notifCallbacks — without this, a misbehaving script that spams
  // GM_notification and never receives click/done events can grow the Map
  // unbounded for the lifetime of the host tab.
  //
  // Phase 40.14 — Eviction counter surfaces leaks via the existing console
  // capture pipe (the wrapper already pipes console.* into the per-script
  // DevTools panel via _captureConsole). A non-zero count for any script is
  // a smell — the script is missing an ondone/onload/onclose handler.
  const _notifCallbacks = new Map();
  const _NOTIF_CALLBACKS_CAP = 500;
  let _notifCallbacksEvicted = 0;
  function GM_notification(details, ondone) {
    if (!hasGrant('GM_notification') && !hasGrant('GM.notification')) {
      return { close: () => {}, update: () => {} };
    }
    let opts;
    if (typeof details === 'string') {
      // GM_notification(text, title, image, onclick)
      opts = { text: details, title: ondone, image: arguments[2] };
      const onclickArg = arguments[3];
      if (typeof onclickArg === 'function') opts.onclick = onclickArg;
      ondone = undefined;
    } else {
      opts = details;
    }
    if (typeof ondone === 'function') opts.ondone = ondone;
    const notifTag = opts.tag || ('notif_' + Math.random().toString(36).substring(2));
    // Store callbacks; evict oldest when capped to avoid memory growth.
    if (_notifCallbacks.size >= _NOTIF_CALLBACKS_CAP) {
      const oldest = _notifCallbacks.keys().next().value;
      if (oldest !== undefined) _notifCallbacks.delete(oldest);
      _notifCallbacksEvicted += 1;
      if (_notifCallbacksEvicted === 1 || _notifCallbacksEvicted % 100 === 0) {
        console.warn('[ScriptVault] GM_notification callback cap evict — script may be missing ondone/onclick handler. Evicted so far:', _notifCallbacksEvicted);
      }
    }
    _notifCallbacks.set(notifTag, {
      onclick: opts.onclick,
      ondone: opts.ondone,
      onbuttonclick: opts.onbuttonclick
    });
    // Highlight tab instead of notification
    if (opts.highlight) {
      sendToBackground('GM_focusTab', {}).catch(() => {});
      if (opts.ondone) { try { opts.ondone(); } catch(e) {} }
      _notifCallbacks.delete(notifTag); // Clean up — no notification created
      return { close: () => {}, update: () => {} };
    }
    // Sanitize buttons[] so the background's truncate-to-2 contract stays
    // explicit at the wrapper boundary.
    const wireButtons = Array.isArray(opts.buttons)
      ? opts.buttons.slice(0, 2).map((b) => ({
          title: String(b?.title ?? ''),
          ...(typeof b?.iconUrl === 'string' ? { iconUrl: b.iconUrl } : {})
        }))
      : undefined;
    sendToBackground('GM_notification', {
      scriptId,
      title: opts.title || GM_info.script.name,
      text: opts.text || opts.body || '',
      image: opts.image,
      timeout: opts.timeout || 0,
      tag: notifTag,
      silent: opts.silent || false,
      // Tampermonkey/Violentmonkey parity — when set, Chrome pins the
      // notification until the user explicitly dismisses or acts on it.
      requireInteraction: typeof opts.requireInteraction === 'boolean' ? opts.requireInteraction : undefined,
      progress: typeof opts.progress === 'number' ? opts.progress : undefined,
      buttons: wireButtons,
      hasOnclick: !!opts.onclick,
      hasOndone: !!opts.ondone,
      hasOnbuttonclick: typeof opts.onbuttonclick === 'function'
    }).catch(() => { _notifCallbacks.delete(notifTag); });

    return {
      close: () => {
        _notifCallbacks.delete(notifTag);
        sendToBackground('GM_closeNotification', { id: notifTag }).catch(() => {});
      },
      update: (patch) => {
        if (!patch || typeof patch !== 'object') return;
        sendToBackground('GM_updateNotification', {
          id: notifTag,
          title: typeof patch.title === 'string' ? patch.title : undefined,
          text: typeof patch.text === 'string' ? patch.text
              : typeof patch.body === 'string' ? patch.body : undefined,
          image: typeof patch.image === 'string' ? patch.image : undefined,
          progress: typeof patch.progress === 'number' ? patch.progress : undefined,
          buttons: Array.isArray(patch.buttons)
            ? patch.buttons.slice(0, 2).map((b) => ({
                title: String(b?.title ?? ''),
                ...(typeof b?.iconUrl === 'string' ? { iconUrl: b.iconUrl } : {})
              }))
            : undefined,
          silent: typeof patch.silent === 'boolean' ? patch.silent : undefined,
          requireInteraction: typeof patch.requireInteraction === 'boolean' ? patch.requireInteraction : undefined
        }).catch(() => {});
      }
    };
  }

  // Phase 11.11 — Standalone GM_updateNotification / GM_closeNotification
  // for callers that hold onto the tag from a prior GM_notification(tag: ...).
  function GM_updateNotification(notificationId, details) {
    if (!hasGrant('GM_notification') && !hasGrant('GM.notification')) return;
    if (!notificationId || !details || typeof details !== 'object') return;
    sendToBackground('GM_updateNotification', {
      id: notificationId,
      title: typeof details.title === 'string' ? details.title : undefined,
      text: typeof details.text === 'string' ? details.text
          : typeof details.body === 'string' ? details.body : undefined,
      image: typeof details.image === 'string' ? details.image : undefined,
      progress: typeof details.progress === 'number' ? details.progress : undefined,
      buttons: Array.isArray(details.buttons)
        ? details.buttons.slice(0, 2).map((b) => ({
            title: String(b?.title ?? ''),
            ...(typeof b?.iconUrl === 'string' ? { iconUrl: b.iconUrl } : {})
          }))
        : undefined,
      silent: typeof details.silent === 'boolean' ? details.silent : undefined,
      requireInteraction: typeof details.requireInteraction === 'boolean' ? details.requireInteraction : undefined
    }).catch(() => {});
  }
  function GM_closeNotification(notificationId) {
    if (!hasGrant('GM_notification') && !hasGrant('GM.notification')) return;
    if (!notificationId) return;
    _notifCallbacks.delete(notificationId);
    sendToBackground('GM_closeNotification', { id: notificationId }).catch(() => {});
  }
  
  // GM_openInTab (with close(), onclose, insert, setParent, incognito)
  // Cap the handle map so a misbehaving script that never receives the
  // openedTabClosed event (background crashed, content bridge missed the
  // signal, tab killed before bridge attached) can't leak unbounded handles
  // in the USER_SCRIPT world for the lifetime of the host tab.
  // Phase 40.14 — Eviction counter (see _notifCallbacks for rationale).
  const _openedTabs = new Map();
  const _OPENED_TABS_CAP = 200;
  let _openedTabsEvicted = 0;
  function GM_openInTab(url, options) {
    if (!hasGrant('GM_openInTab') && !hasGrant('GM.openInTab')) return null;
    const opts = typeof options === 'boolean' ? { active: !options } : (options || {});
    const tabHandle = { closed: false, onclose: null, close: () => {} };

    // Phase 39.13 — TM #2669: blob: URLs are bound to the creating context's
    // blob registry. chrome.tabs.create() in the background SW cannot resolve
    // a blob URL minted by a USER_SCRIPT world. Route blob: through window.open()
    // in-context instead; that preserves the registry binding. data: and
    // about:blank also resolve here without a background round-trip.
    const isLocalOnly = typeof url === 'string' && /^(blob|data|about):/i.test(url);
    if (isLocalOnly) {
      try {
        const target = opts.active === false || opts.background ? '_blank' : '_blank';
        const features = opts.active === false ? 'noopener=yes' : '';
        const win = window.open(url, target, features);
        if (!win) {
          // Pop-up blocker engaged. Surface a clear log so the script author
          // knows GM_openInTab requires a user-gesture for blob: URLs.
          console.warn('[ScriptVault] GM_openInTab(blob:) blocked by pop-up settings — call within a user-gesture handler');
        }
      } catch (e) {
        console.warn('[ScriptVault] GM_openInTab(blob:) failed:', e?.message || e);
      }
      // window.open returns a Window we can't message-pass with; tabHandle
      // gets a no-op close() and no onclose tracking (Chrome doesn't expose
      // the new tab's id to the page).
      return tabHandle;
    }

    sendToBackground('GM_openInTab', {
      url, scriptId, trackClose: true,
      active: opts.active, insert: opts.insert,
      setParent: opts.setParent, background: opts.background
    }).then(result => {
      if (result && result.tabId) {
        if (_openedTabs.size >= _OPENED_TABS_CAP) {
          const oldest = _openedTabs.keys().next().value;
          if (oldest !== undefined) _openedTabs.delete(oldest);
          _openedTabsEvicted += 1;
          if (_openedTabsEvicted === 1 || _openedTabsEvicted % 100 === 0) {
            console.warn('[ScriptVault] GM_openInTab cap evict — script may be opening tabs without listening for openedTabClosed. Evicted so far:', _openedTabsEvicted);
          }
        }
        _openedTabs.set(result.tabId, tabHandle);
        tabHandle.close = () => {
          sendToBackground('GM_closeTab', { tabId: result.tabId }).catch(() => {});
          tabHandle.closed = true;
        };
      }
    }).catch(() => {});
    return tabHandle;
  }

  // GM_download (with onload, onerror, onprogress, ontimeout callbacks)
  // Same LRU eviction as _openedTabs — protects a long-lived tab from a script
  // that fires GM_download in a loop where the load/error/timeout event never
  // arrives (download removed from history, SW restart between request and
  // response, etc.).
  // Phase 40.14 — Eviction counter (see _notifCallbacks for rationale).
  const _downloadCallbacks = new Map();
  const _DOWNLOAD_CALLBACKS_CAP = 200;
  let _downloadCallbacksEvicted = 0;
  function _isDownloadBlobSource(value) {
    return typeof Blob !== 'undefined' && value instanceof Blob;
  }
  function _downloadNameFromUrl(url) {
    if (typeof url !== 'string' || !url) return '';
    try {
      const parsed = new URL(url, location.href);
      if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') return '';
      const last = parsed.pathname.split('/').filter(Boolean).pop();
      return last ? decodeURIComponent(last) : '';
    } catch (e) {
      return url.split(/[?#]/)[0].split('/').filter(Boolean).pop() || '';
    }
  }
  function _safeDownloadMimeType(type) {
    const value = typeof type === 'string' ? type.trim() : '';
    const slash = value.indexOf('/');
    return value
      && slash > 0
      && slash < value.length - 1
      && !value.includes(String.fromCharCode(13))
      && !value.includes(String.fromCharCode(10))
      && !value.includes(',')
      ? value
      : 'application/octet-stream';
  }
  async function _downloadBlobToDataUrl(blob) {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const chunk = 32768;
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunk));
    }
    const type = _safeDownloadMimeType(blob.type);
    return 'data:' + type + ';base64,' + btoa(binary);
  }
  async function _normalizeDownloadDetails(details, nameArg) {
    if (_isDownloadBlobSource(details)) {
      const sourceName = (typeof File !== 'undefined' && details instanceof File) ? details.name : '';
      return {
        url: await _downloadBlobToDataUrl(details),
        name: nameArg || sourceName || 'download',
        sourceName
      };
    }
    const opts = typeof details === 'string'
      ? { url: details, name: nameArg || _downloadNameFromUrl(details) }
      : { ...details };
    if (_isDownloadBlobSource(opts.url)) {
      const blob = opts.url;
      const sourceName = (typeof File !== 'undefined' && blob instanceof File) ? blob.name : '';
      opts.url = await _downloadBlobToDataUrl(blob);
      opts.sourceName = opts.sourceName || sourceName;
      opts.name = opts.name || nameArg || sourceName || 'download';
    } else if (!opts.name) {
      opts.name = nameArg || _downloadNameFromUrl(opts.url) || 'download';
    }
    return opts;
  }
  function GM_download(details) {
    if (!hasGrant('GM_download') && !hasGrant('GM.download')) return;
    const nameArg = arguments[1];
    const callbacks = {
      onload: details && typeof details === 'object' ? details.onload : undefined,
      onerror: details && typeof details === 'object' ? details.onerror : undefined,
      onprogress: details && typeof details === 'object' ? details.onprogress : undefined,
      ontimeout: details && typeof details === 'object' ? details.ontimeout : undefined
    };
    (async () => {
      const opts = await _normalizeDownloadDetails(details, nameArg);
      delete opts.onload; delete opts.onerror;
      delete opts.onprogress; delete opts.ontimeout;
      opts.scriptId = scriptId;
      opts.hasCallbacks = !!(callbacks.onload || callbacks.onerror || callbacks.onprogress || callbacks.ontimeout);
      const result = await sendToBackground('GM_download', opts);
      if (result && result.downloadId && opts.hasCallbacks) {
        if (_downloadCallbacks.size >= _DOWNLOAD_CALLBACKS_CAP) {
          const oldest = _downloadCallbacks.keys().next().value;
          if (oldest !== undefined) _downloadCallbacks.delete(oldest);
          _downloadCallbacksEvicted += 1;
          if (_downloadCallbacksEvicted === 1 || _downloadCallbacksEvicted % 100 === 0) {
            console.warn('[ScriptVault] GM_download cap evict — script may be missing onload/onerror handlers. Evicted so far:', _downloadCallbacksEvicted);
          }
        }
        _downloadCallbacks.set(result.downloadId, callbacks);
      }
      if (result && result.error) {
        if (callbacks.onerror) try { callbacks.onerror({ error: result.error }); } catch(e) {}
        if (result.downloadId) _downloadCallbacks.delete(result.downloadId);
      }
    })().catch(e => {
      if (callbacks.onerror) try { callbacks.onerror({ error: e.message || 'Download failed' }); } catch(ex) {}
    });
  }
  
  // GM_log
  function GM_log(...args) {
    console.log('[' + GM_info.script.name + ']', ...args);
  }
  
  // GM_registerMenuCommand (with extended options: id, accessKey, autoClose, title)
  const _menuCmds = new Map();
  function GM_registerMenuCommand(caption, callback, accessKeyOrOptions) {
    if (!hasGrant('GM_registerMenuCommand') && !hasGrant('GM.registerMenuCommand')) return null;
    let opts = {};
    if (typeof accessKeyOrOptions === 'string') {
      opts.accessKey = accessKeyOrOptions;
    } else if (accessKeyOrOptions && typeof accessKeyOrOptions === 'object') {
      opts = accessKeyOrOptions;
    }
    const id = opts.id || Math.random().toString(36).substring(2);
    _menuCmds.set(id, { callback, caption });
    sendToBackground('GM_registerMenuCommand', {
      scriptId, commandId: id, caption,
      accessKey: opts.accessKey || '',
      autoClose: opts.autoClose !== false,
      title: opts.title || ''
    }).catch(() => {});
    return id;
  }

  function GM_unregisterMenuCommand(id) {
    if (!hasGrant('GM_registerMenuCommand') && !hasGrant('GM.registerMenuCommand') &&
        !hasGrant('GM_unregisterMenuCommand') && !hasGrant('GM.unregisterMenuCommand')) return;
    _menuCmds.delete(id);
    sendToBackground('GM_unregisterMenuCommand', { scriptId, commandId: id }).catch(() => {});
  }

  function GM_getMenuCommands() {
    if (!hasGrant('GM_registerMenuCommand') && !hasGrant('GM.registerMenuCommand')) return [];
    return Array.from(_menuCmds.entries()).map(([id, entry]) => ({ id, name: entry.caption || id, caption: entry.caption || id }));
  }
  
  // GM_getResourceText / GM_getResourceURL
  async function GM_getResourceText(name) {
    if (!hasGrant('GM_getResourceText') && !hasGrant('GM.getResourceText')) return null;
    return await sendToBackground('GM_getResourceText', { scriptId, name });
  }
  
  async function GM_getResourceURL(name, isBlobUrl) {
    if (!hasGrant('GM_getResourceURL') && !hasGrant('GM.getResourceUrl')) return null;
    const dataUri = await sendToBackground('GM_getResourceURL', { scriptId, name });
    if (!dataUri) return null;
    // Return data URI by default, or convert to blob URL if requested
    if (isBlobUrl !== true) return dataUri;
    try {
      const resp = await fetch(dataUri);
      const blob = await resp.blob();
      return URL.createObjectURL(blob);
    } catch (e) {
      return dataUri;
    }
  }
  
  // GM_addElement
  const _urlAttrs = new Set(['href', 'src', 'action', 'formaction', 'poster', 'cite', 'background', 'xlink:href', 'data']);
  function _isUnsafeElementAttribute(name, value) {
    const lowerName = String(name || '').trim().toLowerCase();
    if (!lowerName || lowerName.startsWith('on')) return true;
    if (lowerName === 'srcdoc') return true;
    if (!_urlAttrs.has(lowerName)) return false;
    const normalizedValue = String(value ?? '').replace(/[\\u0000-\\u0020\\u007f\\ufffd]+/g, '').toLowerCase();
    return /^(javascript|vbscript|data|blob|file):/.test(normalizedValue);
  }

  function GM_addElement(parentOrTag, tagOrAttrs, attrsOrUndefined) {
    if (!hasGrant('GM_addElement') && !hasGrant('GM.addElement')) return null;
    // Phase 38.1 — VM v2.37.0 + TM 5.5.6237 contract: return null on any
    // failure (missing tag, createElement throws, missing/detached parent,
    // appendChild throws). Never throw out of GM_addElement.
    let parent, tag, attrs;
    if (typeof parentOrTag === 'string') {
      tag = parentOrTag;
      attrs = tagOrAttrs;
      parent = document.head || document.documentElement;
    } else {
      parent = parentOrTag;
      tag = tagOrAttrs;
      attrs = attrsOrUndefined;
    }
    if (typeof tag !== 'string' || !tag) return null;
    let el;
    try { el = document.createElement(tag); } catch { return null; }
    if (!el) return null;
    // Reject arrays — Object.entries(array) returns numeric-index pairs that
    // would silently create attributes like 0="value". TM/VM contract says
    // attrs is an object map, never an array.
    if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) {
      try {
        Object.entries(attrs).forEach(([k, v]) => {
          if (k === 'textContent') el.textContent = v;
          else if (k === 'innerHTML') {
            const temp = document.createElement('template');
            temp.innerHTML = v;
            temp.content.querySelectorAll('script').forEach(s => s.remove());
            temp.content.querySelectorAll('*').forEach(node => {
              for (const attr of [...node.attributes]) {
                if (_isUnsafeElementAttribute(attr.name, attr.value)) {
                  node.removeAttribute(attr.name);
                }
              }
            });
            el.innerHTML = temp.innerHTML;
          }
          else {
            if (_isUnsafeElementAttribute(k, v)) return;
            try { el.setAttribute(k, v); } catch { /* ignore invalid attribute names */ }
          }
        });
      } catch { /* attribute-application errors do not abort, but a missing
                   parent below will. */ }
    }
    if (!parent || typeof parent.appendChild !== 'function') return null;
    try { parent.appendChild(el); } catch { return null; }
    return el;
  }
  
  // GM_loadScript - Dynamically fetch and eval a script URL at runtime
  // Fetches via background service worker (bypasses CORS/CSP), evals in userscript scope
  // Masks module/define/exports to force UMD libraries to set globals on window
  const _loadedScripts = new Set();
  async function GM_loadScript(url, options = {}) {
    if (!hasGrant('GM_xmlhttpRequest') && !hasGrant('GM.xmlHttpRequest')) {
      throw new Error('GM_loadScript requires @grant GM_xmlhttpRequest');
    }
    if (!url) throw new Error('GM_loadScript: No URL provided');
    if (!options.force && _loadedScripts.has(url)) return;
    const result = await sendToBackground('GM_loadScript', { scriptId, url, timeout: options.timeout });
    if (!result || result.error) throw new Error('GM_loadScript: ' + (result?.error || 'request timed out'));
    // Temporarily mask module systems so UMD scripts create window globals
    const _savedModule = window.module;
    const _savedExports = window.exports;
    const _savedDefine = window.define;
    try {
      window.module = undefined;
      window.exports = undefined;
      window.define = undefined;
      const fn = new Function(result.code);
      fn.call(window);
    } finally {
      window.module = _savedModule;
      window.exports = _savedExports;
      window.define = _savedDefine;
    }
    _loadedScripts.add(url);
  }

  // GM_getTab / GM_saveTab / GM_getTabs (real implementations via background)
  let _tabData = {};
  function GM_getTab(callback) {
    if (!hasGrant('GM_getTab') && !hasGrant('GM.getTab')) { if (callback) callback(_tabData); return _tabData; }
    sendToBackground('GM_getTab', { scriptId }).then(data => {
      _tabData = data || {};
      if (callback) callback(_tabData);
    }).catch(() => { if (callback) callback(_tabData); });
    return _tabData;
  }
  function GM_saveTab(tab) {
    if (!hasGrant('GM_saveTab') && !hasGrant('GM.saveTab')) return;
    _tabData = tab || {};
    sendToBackground('GM_saveTab', { scriptId, data: _tabData }).catch(() => {});
  }
  function GM_getTabs(callback) {
    if (!hasGrant('GM_getTabs') && !hasGrant('GM.getTabs')) { if (callback) callback({}); return; }
    sendToBackground('GM_getTabs', { scriptId }).then(data => {
      if (callback) callback(data || {});
    }).catch(() => { if (callback) callback({}); });
  }

  function GM_focusTab() {
    if (!hasGrant('GM_focusTab') && !hasGrant('GM.focusTab') &&
        !hasGrant('GM_openInTab') && !hasGrant('GM.openInTab')) return;
    sendToBackground('GM_focusTab', {}).catch(() => {});
  }

  // unsafeWindow
  const unsafeWindow = window;
  
  // Helper to wait for cache to be ready (used by async GM.* API)
  function _waitForCache() {
    if (_cacheReady) return Promise.resolve();
    if (!_cacheReadyPromise) {
      _cacheReadyPromise = new Promise(resolve => {
        _cacheReadyResolve = resolve;
      });
    }
    return _cacheReadyPromise;
  }
  
  // GM.* Promise-based API
  // These wait for storage to be refreshed before returning, ensuring fresh values
  // GM_cookie (list, set, delete)
  const GM_cookie = {
    list: (details, callback) => {
      if (!hasGrant('GM_cookie') && !hasGrant('GM.cookie')) {
        if (callback) callback([], new Error('Permission denied'));
        return;
      }
      sendToBackground('GM_cookie_list', { ...(details || {}), scriptId }).then(r => {
        if (callback) callback(r?.cookies || [], r?.error ? new Error(r.error) : undefined);
      }).catch(e => { if (callback) callback([], e); });
    },
    set: (details, callback) => {
      if (!hasGrant('GM_cookie') && !hasGrant('GM.cookie')) {
        if (callback) callback(new Error('Permission denied'));
        return;
      }
      sendToBackground('GM_cookie_set', { ...(details || {}), scriptId }).then(r => {
        if (callback) callback(r?.error ? new Error(r.error) : undefined);
      }).catch(e => { if (callback) callback(e); });
    },
    delete: (details, callback) => {
      if (!hasGrant('GM_cookie') && !hasGrant('GM.cookie')) {
        if (callback) callback(new Error('Permission denied'));
        return;
      }
      sendToBackground('GM_cookie_delete', { ...(details || {}), scriptId }).then(r => {
        if (callback) callback(r?.error ? new Error(r.error) : undefined);
      }).catch(e => { if (callback) callback(e); });
    }
  };

  // Event listener for notification/download/tab close events from background
  // Content.js forwards these with 'type' field (not 'action') and flat structure (not nested 'data')
  const __svEventBridgeListener = function __svEventHandler(event) {
    if (event.source !== window) return;
    if (!event.data || event.data.channel !== CHANNEL_ID || event.data.direction !== 'to-userscript') return;

    // Notification events (content.js sends: type, scriptId, notifTag, eventType)
    if (event.data.type === 'notificationEvent' && event.data.scriptId === scriptId) {
      const tag = event.data.notifTag;
      const cbs = _notifCallbacks.get(tag);
      if (!cbs) return;
      if (event.data.eventType === 'click' && cbs.onclick) { try { cbs.onclick(); } catch(e) {} }
      // Phase 11.11 — buttonClick fires onbuttonclick({buttonClickIndex}).
      if (event.data.eventType === 'buttonClick' && cbs.onbuttonclick) {
        try { cbs.onbuttonclick({ buttonClickIndex: event.data.buttonIndex | 0 }); } catch(e) {}
      }
      if (event.data.eventType === 'done') {
        if (cbs.ondone) { try { cbs.ondone(); } catch(e) {} }
        _notifCallbacks.delete(tag);
      }
    }

    // Download events (content.js sends: type, scriptId, downloadId, eventType, data)
    if (event.data.type === 'downloadEvent' && event.data.scriptId === scriptId) {
      const d = event.data.data || {};
      const cbs = _downloadCallbacks.get(event.data.downloadId);
      if (!cbs) return;
      const evType = event.data.eventType;
      if (evType === 'load' && cbs.onload) { try { cbs.onload({ url: d.url }); } catch(e) {} _downloadCallbacks.delete(event.data.downloadId); }
      if (evType === 'error' && cbs.onerror) { try { cbs.onerror({ error: d.error }); } catch(e) {} _downloadCallbacks.delete(event.data.downloadId); }
      if (evType === 'progress' && cbs.onprogress) { try { cbs.onprogress({ loaded: d.loaded, total: d.total }); } catch(e) {} }
      if (evType === 'timeout' && cbs.ontimeout) { try { cbs.ontimeout(); } catch(e) {} _downloadCallbacks.delete(event.data.downloadId); }
    }

    // Tab close events (content.js sends: type, scriptId, closedTabId)
    if (event.data.type === 'openedTabClosed' && event.data.scriptId === scriptId) {
      const tabId = event.data.closedTabId;
      const handle = _openedTabs.get(tabId);
      if (handle) {
        handle.closed = true;
        if (typeof handle.onclose === 'function') { try { handle.onclose(); } catch(e) {} }
        _openedTabs.delete(tabId);
      }
    }
  };
  window.addEventListener('message', __svEventBridgeListener);

  // GM.* Promise-based API
  const GM = {
    info: GM_info,
    getValue: async (k, d) => {
      await _waitForCache();
      return GM_getValue(k, d);
    },
    setValue: (k, v) => Promise.resolve(GM_setValue(k, v)),
    deleteValue: (k) => Promise.resolve(GM_deleteValue(k)),
    listValues: async () => {
      await _waitForCache();
      return GM_listValues();
    },
    getValues: async (keys) => {
      await _waitForCache();
      return GM_getValues(keys);
    },
    setValues: (vals) => Promise.resolve(GM_setValues(vals)),
    deleteValues: (keys) => Promise.resolve(GM_deleteValues(keys)),
    addStyle: (css) => Promise.resolve(GM_addStyle(css)),
    addElement: (...args) => Promise.resolve(GM_addElement(...args)),
    xmlHttpRequest: (d) => _GM_xmlhttpRequestPromise(d),
    fetch: GM_fetch,
    notification: (d, ondone) => Promise.resolve(GM_notification(d, ondone)),
    setClipboard: (t, type) => Promise.resolve(GM_setClipboard(t, type)),
    openInTab: (u, o) => Promise.resolve(GM_openInTab(u, o)),
    focusTab: () => Promise.resolve(GM_focusTab()),
    download: (d) => Promise.resolve(GM_download(d)),
    head: (url, callback) => Promise.resolve(GM_head(url, callback)),
    log: (...args) => Promise.resolve(GM_log(...args)),
    getResourceText: (n) => GM_getResourceText(n),
    getResourceUrl: (n) => GM_getResourceURL(n),
    registerMenuCommand: (c, cb, o) => Promise.resolve(GM_registerMenuCommand(c, cb, o)),
    unregisterMenuCommand: (id) => Promise.resolve(GM_unregisterMenuCommand(id)),
    getMenuCommands: () => Promise.resolve(GM_getMenuCommands()),
    addValueChangeListener: (k, cb) => Promise.resolve(GM_addValueChangeListener(k, cb)),
    removeValueChangeListener: (id) => Promise.resolve(GM_removeValueChangeListener(id)),
    getTab: () => new Promise(r => GM_getTab(r)),
    saveTab: (t) => Promise.resolve(GM_saveTab(t)),
    getTabs: () => new Promise(r => GM_getTabs(r)),
    loadScript: (url, opts) => GM_loadScript(url, opts),
    withLock: (name, callback, options) => GM_withLock(name, callback, options),
    webSocket: (url, protocols, opts) => GM_webSocket(url, protocols, opts),
    cookies: {
      list: (d) => new Promise((res, rej) => GM_cookie.list(d, (cookies, err) => err ? rej(err) : res(cookies))),
      set: (d) => new Promise((res, rej) => GM_cookie.set(d, (err) => err ? rej(err) : res())),
      delete: (d) => new Promise((res, rej) => GM_cookie.delete(d, (err) => err ? rej(err) : res()))
    },
    cookie: {
      list: (d) => new Promise((res, rej) => GM_cookie.list(d, (cookies, err) => err ? rej(err) : res(cookies))),
      set: (d) => new Promise((res, rej) => GM_cookie.set(d, (err) => err ? rej(err) : res())),
      delete: (d) => new Promise((res, rej) => GM_cookie.delete(d, (err) => err ? rej(err) : res()))
    },
    webRequest: (rules, listener) => Promise.resolve(GM_webRequest(rules, listener)),
    get audio() {
      return {
        setMute: (details) => new Promise((resolve, reject) => GM_audio.setMute(details, err => err ? reject(err) : resolve())),
        getState: () => new Promise((resolve, reject) => GM_audio.getState((state, err) => err ? reject(err) : resolve(state))),
        addStateChangeListener: (listener) => new Promise((resolve, reject) => GM_audio.addStateChangeListener(listener, err => err ? reject(err) : resolve())),
        removeStateChangeListener: (listener) => new Promise((resolve, reject) => GM_audio.removeStateChangeListener(listener, err => err ? reject(err) : resolve()))
      };
    }
  };

  // CRITICAL: Expose all GM_* functions to window for Tampermonkey/Violentmonkey compatibility
  window.GM_info = GM_info;
  window.GM_getValue = GM_getValue;
  window.GM_setValue = GM_setValue;
  window.GM_deleteValue = GM_deleteValue;
  window.GM_listValues = GM_listValues;
  window.GM_getValues = GM_getValues;
  window.GM_setValues = GM_setValues;
  window.GM_deleteValues = GM_deleteValues;
  window.GM_addStyle = GM_addStyle;
  window.GM_xmlhttpRequest = GM_xmlhttpRequest;
  window.GM_fetch = GM_fetch;
  window.GM_head = GM_head;
  window.GM_setClipboard = GM_setClipboard;
  window.GM_notification = GM_notification;
  window.GM_updateNotification = GM_updateNotification;
  window.GM_closeNotification = GM_closeNotification;
  window.GM_openInTab = GM_openInTab;
  window.GM_download = GM_download;
  window.GM_log = GM_log;
  window.GM_registerMenuCommand = GM_registerMenuCommand;
  window.GM_unregisterMenuCommand = GM_unregisterMenuCommand;
  window.GM_getMenuCommands = GM_getMenuCommands;
  window.GM_getResourceText = GM_getResourceText;
  window.GM_getResourceURL = GM_getResourceURL;
  window.GM_addElement = GM_addElement;
  window.GM_loadScript = GM_loadScript;
  window.GM_getTab = GM_getTab;
  window.GM_saveTab = GM_saveTab;
  window.GM_getTabs = GM_getTabs;
  window.GM_addValueChangeListener = GM_addValueChangeListener;
  window.GM_removeValueChangeListener = GM_removeValueChangeListener;
  window.GM_cookie = GM_cookie;
  window.GM_focusTab = GM_focusTab;
  window.GM_withLock = GM_withLock;
  window.GM_webSocket = GM_webSocket;

  // ========== GM_webRequest (Tampermonkey-compatible, declarativeNetRequest-backed) ==========
  function GM_webRequest(rules, listener) {
    if (!hasGrant('GM_webRequest')) {
      console.warn('[ScriptVault] GM_webRequest requires @grant GM_webRequest');
      return;
    }
    const ruleArray = Array.isArray(rules) ? rules : [rules];
    sendToBackground('GM_webRequest', { scriptId, rules: ruleArray }).catch(e =>
      console.warn('[ScriptVault] GM_webRequest failed:', e.message)
    );
    // listener is called with (info, message, details) when a rule matches;
    // declarativeNetRequest doesn't support runtime callbacks, so we no-op this.
    if (typeof listener === 'function') {
      console.info('[ScriptVault] GM_webRequest: runtime listener not supported in MV3 — use @webRequest metadata for static rules');
    }
  }
  window.GM_webRequest = GM_webRequest;

  window.unsafeWindow = unsafeWindow;
  window.GM = GM;

  // ========== window.onurlchange (SPA navigation detection) ==========
  // Tampermonkey-compatible: fires when URL changes via pushState/replaceState/popstate.
  //
  // Phase 40.11 — Page-scoped monkey-patch + shared dispatcher.
  //
  // Previously every wrapper registration patched history.pushState / replaceState,
  // added popstate / hashchange listeners, and Proxied window.addEventListener /
  // removeEventListener on its own. Re-injection (script update applied while the
  // host tab is open) stacked new patches on top of the old ones; old wrap's
  // _urlChangeHandlers closures stayed reachable in the proxy chain forever.
  //
  // Now the page-level monkey-patch runs at most once per host tab, gated by
  // window.__svUrlChangeBound__ (non-enumerable, non-writable). The patch fires
  // a CustomEvent('__sv_urlchange__') on every URL change; each script's wrapper
  // attaches its own per-script listener to that event, scoped to its own
  // _urlChangeHandlers array. On the next re-injection, the page-level guard
  // short-circuits — only the per-script listener is re-attached, and the old
  // one is implicitly orphaned with the previous wrapper's closure.
  if (hasGrant('window.onurlchange')) {
    const _urlChangeHandlers = [];

    function __dispatchUrlChangeToHandlers(detail) {
      _urlChangeHandlers.forEach(fn => { try { fn(detail); } catch (e) {} });
      if (typeof window.onurlchange === 'function') {
        try { window.onurlchange(detail); } catch (e) {}
      }
    }

    // One-time page-level setup. The defineProperty guard survives the
    // wrapper-closure swap on re-injection.
    if (!window.__svUrlChangeBound__) {
      try {
        Object.defineProperty(window, '__svUrlChangeBound__', {
          value: true, writable: false, configurable: false, enumerable: false
        });
      } catch (_e) {
        // Property already locked by an earlier ScriptVault wrapper; treat as bound.
      }

      let _lastUrl = location.href;
      let _pendingUrlChangeCheck = false;
      let _lastDispatchedPair = '';
      function __emitUrlChange(newUrl, oldUrl) {
        const pair = oldUrl + '\\n' + newUrl;
        if (pair === _lastDispatchedPair) return;
        _lastDispatchedPair = pair;
        const detail = { url: newUrl, oldUrl };
        // Fan out to every wrapper that subscribed.
        window.dispatchEvent(new CustomEvent('__sv_urlchange__', { detail }));
      }
      function __checkUrlChange() {
        const newUrl = location.href;
        if (newUrl !== _lastUrl) {
          const oldUrl = _lastUrl;
          _lastUrl = newUrl;
          __emitUrlChange(newUrl, oldUrl);
        }
      }
      function __scheduleUrlChangeCheck(reason) {
        if (!_pendingUrlChangeCheck) {
          _pendingUrlChangeCheck = true;
          Promise.resolve().then(() => {
            _pendingUrlChangeCheck = false;
            __checkUrlChange();
          });
        }
        const frameCheck = () => __checkUrlChange();
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(frameCheck);
        } else {
          setTimeout(frameCheck, 0);
        }
      }

      // Phase 38.6 — Native Navigation API (Chrome 102+, our min-Chrome is
      // 130 so always present in supported Chromium builds; missing on
      // Safari and older Firefox where the polling shim below still wins).
      // The 'navigate' event fires for every SPA navigation including
      // direct location assignment, which the pushState/replaceState patch
      // misses, and runs in microtask order so the dispatch lands before
      // the next page paint. Falls through to the polling shim if the API
      // is missing (Firefox port path).
      const _nav = (typeof window !== 'undefined') ? window.navigation : undefined;
      if (_nav && typeof _nav.addEventListener === 'function') {
        try {
          _nav.addEventListener('navigate', (event) => {
            // Schedule on a microtask so location.href reflects the new URL
            // by the time __checkUrlChange reads it. The navigate event
            // fires BEFORE the document URL updates for traverse-style
            // navigations, but always before render.
            __scheduleUrlChangeCheck('navigate');
          });
        } catch (_e) { /* fall through to polling shim */ }
      }

      const _origPushState = history.pushState;
      const _origReplaceState = history.replaceState;
      history.pushState = function () {
        _origPushState.apply(this, arguments);
        __scheduleUrlChangeCheck('pushState');
      };
      history.replaceState = function () {
        _origReplaceState.apply(this, arguments);
        __scheduleUrlChangeCheck('replaceState');
      };
      window.addEventListener('popstate', () => __scheduleUrlChangeCheck('popstate'));
      window.addEventListener('hashchange', () => __scheduleUrlChangeCheck('hashchange'));
    }

    // Per-script subscription to the page-level event. Detaches itself if the
    // wrapper IIFE returns or throws (the closure becomes unreachable; the
    // function reference passed to addEventListener is its only liveness root).
    const __svUrlChangeListener = (event) => __dispatchUrlChangeToHandlers(event.detail);
    window.addEventListener('__sv_urlchange__', __svUrlChangeListener);

    // Allow adding multiple per-script handlers via the addEventListener pattern.
    // The Proxy is per-wrapper; re-injection installs a new proxy on the prior
    // (possibly-still-proxied) addEventListener. Each layer only intercepts
    // 'urlchange' and forwards everything else, so the chain stays correct.
    window.addEventListener = new Proxy(window.addEventListener, {
      apply(target, thisArg, args) {
        if (args[0] === 'urlchange') {
          if (!_urlChangeHandlers.includes(args[1])) {
            _urlChangeHandlers.push(args[1]);
          }
          return;
        }
        return Reflect.apply(target, thisArg, args);
      }
    });
    window.removeEventListener = new Proxy(window.removeEventListener, {
      apply(target, thisArg, args) {
        if (args[0] === 'urlchange') {
          const idx = _urlChangeHandlers.indexOf(args[1]);
          if (idx >= 0) _urlChangeHandlers.splice(idx, 1);
          return;
        }
        return Reflect.apply(target, thisArg, args);
      }
    });
    if (typeof window.onurlchange === 'undefined') window.onurlchange = null;
  }

  // ========== window.close / window.focus grants ==========
  if (hasGrant('window.close')) {
    // Already available in USER_SCRIPT world, but explicitly expose
    window.close = window.close.bind(window);
  }
  if (hasGrant('window.focus')) {
    window.focus = window.focus.bind(window);
  }

  // ========== GM_audio API (Tampermonkey-compatible tab mute control) ==========
  const GM_audio = {
    setMute: (details, callback) => {
      if (!hasGrant('GM_audio')) { if (callback) callback(new Error('Permission denied')); return; }
      sendToBackground('GM_audio_setMute', { mute: details?.mute ?? details, scriptId }).then(r => {
        if (callback) callback(r?.error ? new Error(r.error) : undefined);
      }).catch(e => { if (callback) callback(e); });
    },
    getState: (callback) => {
      if (!hasGrant('GM_audio')) { if (callback) callback(null, new Error('Permission denied')); return; }
      sendToBackground('GM_audio_getState', { scriptId }).then(r => {
        if (callback) callback(r, r?.error ? new Error(r.error) : undefined);
      }).catch(e => { if (callback) callback(null, e); });
    },
    _listeners: [],
    _watching: false,
    _msgHandler: null,
    addStateChangeListener: (listener, callback) => {
      if (!hasGrant('GM_audio')) { if (callback) callback(new Error('Permission denied')); return; }
      GM_audio._listeners.push(listener);
      if (!GM_audio._watching) {
        GM_audio._watching = true;
        sendToBackground('GM_audio_watchState', { scriptId });
        // Listen for audio state change events from content script bridge
        GM_audio._msgHandler = (e) => {
          if (e.source !== window || !e.data || e.data.channel !== CHANNEL_ID) return;
          if (e.data.type === 'audioStateChanged' && e.data.data?.scriptId === scriptId) {
            const state = { ...e.data.data };
            delete state.scriptId;
            for (const fn of GM_audio._listeners) {
              try { fn(state); } catch (err) { console.error('[GM_audio listener]', err); }
            }
          }
        };
        window.addEventListener('message', GM_audio._msgHandler);
      }
      if (callback) callback();
    },
    removeStateChangeListener: (listener, callback) => {
      const idx = GM_audio._listeners.indexOf(listener);
      if (idx >= 0) GM_audio._listeners.splice(idx, 1);
      if (GM_audio._listeners.length === 0 && GM_audio._watching) {
        GM_audio._watching = false;
        if (GM_audio._msgHandler) {
          window.removeEventListener('message', GM_audio._msgHandler);
          GM_audio._msgHandler = null;
        }
        sendToBackground('GM_audio_unwatchState', { scriptId });
      }
      if (callback) callback();
    }
  };
  window.GM_audio = GM_audio;

  // Privileged network/download/audio events use the authenticated user-script
  // runtime port. The page-visible bridge remains only a sanitized compatibility
  // fallback; it must never carry the request or script identity needed to route
  // these callbacks.
  function __svHandleDirectUserScriptEvent(message) {
    if (!message || message.channel !== CHANNEL_ID || message.direction !== 'to-userscript') return;
    const event = { source: window, data: message };
    try { __svNetworkBridgeListener(event); } catch (_) {}
    try { __svEventBridgeListener(event); } catch (_) {}
    try { if (GM_audio._msgHandler) GM_audio._msgHandler(event); } catch (_) {}
  }

  function __svConnectUserScriptEventPort() {
    if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.connect !== 'function') return;
    let port;
    try {
      port = chrome.runtime.connect({ name: USER_SCRIPT_EVENT_PORT_NAME });
    } catch (_) {
      return;
    }
    if (!port) return;
    const onMessage = (message) => {
      if (!message || message.type === 'ready') return;
      __svHandleDirectUserScriptEvent(message);
    };
    try { port.onMessage?.addListener(onMessage); } catch (_) {}
    try {
      port.onDisconnect?.addListener(() => {
        // The service worker can restart while the page remains alive. Reconnect
        // once after the disconnect so callbacks recover without a page reload.
        setTimeout(__svConnectUserScriptEventPort, 1000);
      });
    } catch (_) {}
    try {
      port.postMessage({ type: 'subscribe', scriptId, scriptAuthToken });
    } catch (_) {}
  }

  __svConnectUserScriptEventPort();

  // ========== DOM HELPER FUNCTIONS ==========
  // These help userscripts handle DOM timing issues gracefully
  // Use these when document.body/head might not exist yet
  
  // Wait for any element matching selector to appear in DOM
  function __waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      // Check if already exists
      const existing = document.querySelector(selector);
      if (existing) return resolve(existing);
      
      let resolved = false;
      const observer = new MutationObserver((mutations, obs) => {
        if (resolved) return;
        const el = document.querySelector(selector);
        if (el) {
          resolved = true;
          obs.disconnect();
          resolve(el);
        }
      });
      
      // Start observing - handle case where documentElement might not exist yet
      const root = document.documentElement || document;
      if (root && typeof root.nodeType !== 'undefined') {
        observer.observe(root, { childList: true, subtree: true });
      }
      
      // Timeout with final check
      setTimeout(() => {
        if (resolved) return;
        observer.disconnect();
        const el = document.querySelector(selector);
        if (el) {
          resolve(el);
        } else {
          reject(new Error('[ScriptVault] Timeout waiting for element: ' + selector));
        }
      }, timeout);
    });
  }
  
  // Wait for document.body to be available
  function __waitForBody(timeout = 10000) {
    if (document.body) return Promise.resolve(document.body);
    return __waitForElement('body', timeout);
  }
  
  // Wait for document.head to be available
  function __waitForHead(timeout = 10000) {
    if (document.head) return Promise.resolve(document.head);
    return __waitForElement('head', timeout);
  }
  
  // Safe MutationObserver that waits for target element to exist
  // Prevents "parameter 1 is not of type 'Node'" errors
  function __safeObserve(target, options, callback) {
    // Handle selector string or element
    const element = typeof target === 'string' ? document.querySelector(target) : target;
    
    // If element exists and is valid, observe immediately
    if (element && element.nodeType === Node.ELEMENT_NODE) {
      const observer = new MutationObserver(callback);
      observer.observe(element, options);
      return { observer, promise: Promise.resolve(observer) };
    }
    
    // Element doesn't exist yet - wait for it
    const selectorToWait = typeof target === 'string' ? target : 'body';
    const promise = __waitForElement(selectorToWait)
      .then(el => {
        const observer = new MutationObserver(callback);
        observer.observe(el, options);
        return observer;
      })
      .catch(() => null);
    
    return { observer: null, promise };
  }
  
  // Expose DOM helpers to window for userscripts to use
  window.__ScriptVault_waitForElement = __waitForElement;
  window.__ScriptVault_waitForBody = __waitForBody;
  window.__ScriptVault_waitForHead = __waitForHead;
  window.__ScriptVault_safeObserve = __safeObserve;

  // Also expose as shorter aliases
  window.waitForElement = __waitForElement;
  window.waitForBody = __waitForBody;
  window.waitForHead = __waitForHead;
  window.safeObserve = __safeObserve;

  // ========== Network Proxy (full capture: fetch, XHR, WebSocket, sendBeacon) ==========
  // Intercepts all network calls made by this script and logs them to the network log.
  // Logs are viewable in the DevTools panel and the dashboard Network Log.
  (function __svNetProxy() {
    const _scriptName = ${JSON.stringify(meta.name || script.id)};
    const _scriptId = ${JSON.stringify(script.id)};

    function _log(entry) {
      sendToBackground('netlog_record', { scriptId: _scriptId, scriptName: _scriptName, ...entry }).catch(() => {});
    }

    function _safeSet(target, prop, value) {
      try {
        Object.defineProperty(target, prop, { configurable: true, writable: true, value });
        return true;
      } catch (e) {
        try {
          target[prop] = value;
          return target[prop] === value;
        } catch (e2) {
          return false;
        }
      }
    }

    // ── fetch ──────────────────────────────────────────────────────────────
    const _origFetch = window.fetch;
    if (typeof _origFetch === 'function') {
      _safeSet(window, 'fetch', function __svFetch(input, init) {
        const method = (init?.method || 'GET').toUpperCase();
        const url = typeof input === 'string' ? input : input?.url || String(input);
        const t0 = performance.now();
        return _origFetch.apply(this, arguments).then(resp => {
          const duration = Math.round(performance.now() - t0);
          const cl = parseInt(resp.headers.get('content-length') || '0') || 0;
          _log({ type: 'fetch', method, url, status: resp.status, statusText: resp.statusText, duration, responseSize: cl, responseHeaders: Object.fromEntries(resp.headers.entries()) });
          return resp;
        }, err => {
          const duration = Math.round(performance.now() - t0);
          _log({ type: 'fetch', method, url, error: err?.message || String(err), duration });
          throw err;
        });
      });
    }

    // ── XMLHttpRequest ─────────────────────────────────────────────────────
    const _OrigXHR = window.XMLHttpRequest;
    if (typeof _OrigXHR === 'function') {
      const _WrappedXHR = function __svXHR() {
        const xhr = new _OrigXHR();
        let _method = 'GET', _url = '', _t0 = 0;
        const _origOpen = xhr.open.bind(xhr);
        xhr.open = function(method, url) {
          _method = (method || 'GET').toUpperCase();
          _url = String(url);
          return _origOpen.apply(this, arguments);
        };
        const _origSend = xhr.send.bind(xhr);
        xhr.send = function() {
          _t0 = performance.now();
          xhr.addEventListener('loadend', () => {
            const duration = Math.round(performance.now() - _t0);
            if (xhr.status) {
              _log({ type: 'xhr', method: _method, url: _url, status: xhr.status, statusText: xhr.statusText, duration, responseSize: (xhr.responseText || '').length });
            } else {
              _log({ type: 'xhr', method: _method, url: _url, error: 'Request failed', duration });
            }
          }, { once: true });
          return _origSend.apply(this, arguments);
        };
        return xhr;
      };
      _WrappedXHR.prototype = _OrigXHR.prototype;
      Object.assign(_WrappedXHR, {
        UNSENT: _OrigXHR.UNSENT ?? 0,
        OPENED: _OrigXHR.OPENED ?? 1,
        HEADERS_RECEIVED: _OrigXHR.HEADERS_RECEIVED ?? 2,
        LOADING: _OrigXHR.LOADING ?? 3,
        DONE: _OrigXHR.DONE ?? 4
      });
      _safeSet(window, 'XMLHttpRequest', _WrappedXHR);
    }

    // ── WebSocket ──────────────────────────────────────────────────────────
    const _OrigWS = window.WebSocket;
    if (typeof _OrigWS === 'function') {
      const _WrappedWS = function __svWebSocket(url, protocols) {
        const ws = protocols ? new _OrigWS(url, protocols) : new _OrigWS(url);
        const t0 = performance.now();
        let bytesSent = 0, bytesRecv = 0;
        ws.addEventListener('open', () => {
          _log({ type: 'websocket', method: 'WS', url: String(url), status: 101, statusText: 'Switching Protocols', duration: Math.round(performance.now() - t0) });
        });
        ws.addEventListener('message', e => { bytesRecv += (e.data?.length || 0); });
        ws.addEventListener('close', e => {
          _log({ type: 'websocket', method: 'WS_CLOSE', url: String(url), status: e.code, duration: Math.round(performance.now() - t0), responseSize: bytesRecv });
        });
        const _origSendWS = ws.send.bind(ws);
        ws.send = function(data) { bytesSent += (data?.length || 0); return _origSendWS(data); };
        return ws;
      };
      _WrappedWS.prototype = _OrigWS.prototype;
      Object.assign(_WrappedWS, {
        CONNECTING: _OrigWS.CONNECTING ?? 0,
        OPEN: _OrigWS.OPEN ?? 1,
        CLOSING: _OrigWS.CLOSING ?? 2,
        CLOSED: _OrigWS.CLOSED ?? 3
      });
      _safeSet(window, 'WebSocket', _WrappedWS);
    }

    // ── sendBeacon ─────────────────────────────────────────────────────────
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const _origBeacon = navigator.sendBeacon.bind(navigator);
      _safeSet(navigator, 'sendBeacon', function __svBeacon(url, data) {
        const result = _origBeacon(url, data);
        const size = data ? (typeof data === 'string' ? data.length : (data?.byteLength || data?.size || 0)) : 0;
        _log({ type: 'beacon', method: 'POST', url: String(url), status: result ? 200 : 0, duration: 0, responseSize: size });
        return result;
      });
    }
  })();
  // ========== End Network Proxy ==========

  // GM APIs exposed log disabled for performance
  // console.log('[ScriptVault] GM APIs exposed to window for:', meta.name);

  // ============ @require Scripts ============
  // These run after GM APIs are available on window
  const __svPreRequireGMConfig = window.GM_config;
${requireCode}
${libraryExports}
  const __svRequireGMConfig = (typeof GM_config !== 'undefined' && GM_config !== __svPreRequireGMConfig)
    ? GM_config
    : null;
  window.CAT_userConfig = CAT_userConfig;
  window.GM_config = __svRequireGMConfig || GM_configShim;
  // ============ End @require Scripts ============

  // Wait for storage to be refreshed, then execute the userscript
  // This ensures scripts see fresh values when using GM_getValue
  (async function __scriptMonkeyRunner() {
    await _waitForCache();
    const __startTime = performance.now();
    const __completionId = (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
      ? globalThis.crypto.randomUUID()
      : (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
    try {
`;

  const apiClose = `
    } catch (e) {
      // Report error to background for profiling
      const __stack = String(e?.stack || '').slice(0, 8000);
      const __location = __svResolveErrorLocation(0, 0, '', __stack);
      sendToBackground('reportExecError', { scriptId, completionId: __completionId, error: (e?.message || String(e)).slice(0, 500), stack: __stack, source: __location.source, line: __location.line, col: __location.column, generatedLine: __location.generatedLine, generatedCol: __location.generatedColumn, url: location.href }).catch(() => {});
    } finally {
      // Report execution time to background for profiling
      const __elapsed = Math.round((performance.now() - __startTime) * 100) / 100;
      sendToBackground('reportExecTime', { scriptId, completionId: __completionId, time: __elapsed, url: location.href }).catch(() => {});
    }
  })();
})();
`;

  // @top-level-await: wrap user code in async IIFE so top-level await works
  const bundledSourceSegment = ScriptSourceMaps.createBundledSourceSegment(
    script.id,
    meta.name,
    script.code,
    meta.esmBundle?.sourceMap
  );
  const mappedUserCode = bundledSourceSegment
    ? appendEmbeddedSourceSegment(bundledSourceSegment)
    : appendSourceSegment(ScriptSourceMaps.deterministicScriptSourceUrl(script.id, meta.name), script.code);
  let userCode = meta['top-level-await']
    ? `(async () => {\n${mappedUserCode}\n})();`
    : mappedUserCode;

  // @delay: postpone script execution by N milliseconds
  if (meta.delay > 0) {
    userCode = `setTimeout(() => {\n${userCode}\n}, ${meta.delay});`;
  }

  // Phase 11.2 — `// @unwrap` (Violentmonkey parity).
  // When set, emit the script body verbatim without the GM API IIFE wrapper.
  // Useful for ESM-style top-level imports/exports and scripts that
  // intentionally modify the top-level scope. GM_* APIs are NOT available
  // in this mode (no apiInit/apiClose); we log a one-line console.warn so
  // authors who set @unwrap by mistake can spot it. Console-capture and
  // error suppression are also disabled in this mode.
  if (meta.unwrap === true) {
    // JSON.stringify produces a properly-escaped double-quoted JS string.
    // Don't slice off the quotes — a name like "John's Script" contains a
    // single quote, which the previous slice-based interpolation surfaced
    // verbatim into a single-quoted host string and broke the wrapper's
    // syntax. The full JSON-quoted form is a valid JS string literal.
    const nameLit = JSON.stringify(meta.name || 'Unnamed');
    const banner = `console.warn('[ScriptVault] ' + ${nameLit} + ': @unwrap is set — GM_* APIs are unavailable.');`;
    if (scheduleGuard) {
      // @unwrap has no runner function to `return` from, so wrap the raw body
      // in a guard IIFE that only runs it inside the schedule window.
      return finalize(`${banner}\n${scheduleGuard}\n(function(){ if(!__svScheduleOk())return;\n${userCode}\n})();`);
    }
    return finalize(banner + '\n' + userCode);
  }

  // Schedule guard: prepend the guard function definition + early return so a
  // time/day/dateRange schedule gates page-load execution to its window. It
  // runs before any @delay/@top-level-await scheduling, so an out-of-window
  // load never even queues the body.
  if (scheduleGuard) {
    userCode = `${scheduleGuard}\nif(!__svScheduleOk())return;\n${userCode}`;
  }

  return finalize(apiInit + userCode + apiClose);
}

// Helper: Check if a pattern is a valid match pattern
function isValidMatchPattern(pattern: any) {
  if (!pattern) return false;
  if (pattern === '<all_urls>') return true;

  // Match pattern validation (allows ports: http://localhost:3000/*)
  const matchRegex = /^(\*|https?|file|ftp):\/\/(\*|\*\.[^/*]+|[^/*:]+(?::\d+)?)\/.*$/;
  return matchRegex.test(pattern);
}

// Turn one `deniedHosts` entry into candidate exclude match patterns.
// The Settings field documents "optional wildcard hostname", so entries can be
// `example.com`, `*.example.com`, a bare `*`, or carry a port. Only a single
// leading `*.` is legal in a match pattern host, so a `*.`-prefixed entry must
// NOT be wrapped again — `*://*.*.example.com/*` is rejected by Chrome and
// takes the whole register() call down with it.
function deniedHostExcludePatterns(rawHost: any): string[] {
  const host = typeof rawHost === 'string' ? rawHost.trim() : '';
  if (!host) return [];
  if (host === '*' || host === '<all_urls>') return ['*://*/*'];
  if (host.startsWith('*.')) return [`*://${host}/*`];
  return [`*://${host}/*`, `*://*.${host}/*`];
}

function nativeMatchPatternForRegistration(pattern: any) {
  if (!isValidMatchPattern(pattern)) return null;
  if (pattern === '<all_urls>') return pattern;
  const match = pattern.match(/^(\*|https?|file|ftp):\/\/([^/]*)(\/.*)$/);
  if (!match) return null;
  const [, scheme, host, path] = match;
  const nativeHost = host.replace(/:\d+$/, '');
  return `${scheme}://${nativeHost}${path}`;
}

function escapeRuntimeRegex(value: any) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globPathToRuntimeRegex(path: any) {
  return escapeRuntimeRegex(String(path).replace(/\*+/g, '*')).replace(/\\\*/g, '.*');
}

function matchPatternToRuntimeRegex(pattern: any) {
  if (!isValidMatchPattern(pattern)) return null;
  if (pattern === '<all_urls>') return '/^[^:]+:\\/\\//i';
  const match = pattern.match(/^(\*|https?|file|ftp):\/\/([^/]*)(\/.*)$/);
  if (!match) return null;
  const [, scheme, host, path] = match;
  const schemeRegex = scheme === '*' ? '[^:]+' : escapeRuntimeRegex(scheme);
  let hostRegex = '';
  if (host === '*') {
    hostRegex = '[^/]*';
  } else if (host.startsWith('*.')) {
    const base = escapeRuntimeRegex(host.slice(2));
    hostRegex = `(?:${base}|[^/]+\\.${base})`;
  } else {
    hostRegex = escapeRuntimeRegex(host);
  }
  const source = `^${schemeRegex}://${hostRegex}${globPathToRuntimeRegex(path)}$`;
  return `/${source.replace(/\//g, '\\/')}/i`;
}

// Check if a pattern is a regex @include (wrapped in /regex/)
function isRegexPattern(pattern: any) {
  if (!pattern || !pattern.startsWith('/') || pattern.length <= 2) return false;
  const match = pattern.match(/^\/(.+?)\/([gimsuy]*)$/);
  if (!match) return false;
  // Require at least one regex metacharacter to distinguish from plain URL paths like /path/to/file/
  return /[\\^$\[(+?{|]/.test(match[1]);
}

// Parse a regex @include pattern string into a RegExp object
function parseRegexPattern(pattern: any) {
  const match = pattern.match(/^\/(.+)\/([gimsuy]*)$/);
  if (!match) return null;
  try {
    return new RegExp(match[1], match[2]);
  } catch (e) {
    return null;
  }
}

// Extract broad match patterns from a regex to use for Chrome registration
// The actual fine-grained filtering happens at runtime in the injected wrapper
function extractMatchPatternsFromRegex(regexStr: any) {
  // Remove the /.../ wrapper and flags
  const inner = regexStr.replace(/^\//, '').replace(/\/[gimsuy]*$/, '');
  const patterns = [];

  // Strategy 1: Find domain patterns like "name\.(tld1|tld2|tld3)" or "name\.tld"
  // Handles: 1337x\.(to|st|ws|eu|se|is|gd|unblocked\.dk)
  const domainWithAlts = /([a-z0-9][-a-z0-9]*)\\\.\(([^)]+)\)/gi;
  let match: any;
  while ((match = domainWithAlts.exec(inner)) !== null) {
    const base = match[1];
    const altsRaw: any = match[2];
    // Split alternatives, handling escaped dots within them (e.g. unblocked\.dk)
    const alts = altsRaw.split('|').map((a: any) => a.replace(/\\\./g, '.'));
    for (const alt of alts) {
      // Only use clean TLD/domain alternatives (no regex metacharacters)
      if (/^[a-z0-9][-a-z0-9.]*$/i.test(alt) && alt.length >= 2 && alt.length <= 30) {
        patterns.push(`*://*.${base}.${alt}/*`);
        patterns.push(`*://${base}.${alt}/*`);
      }
    }
  }

  // Strategy 2: Find simple "domain\.tld" patterns not inside groups
  const simpleDomain = /(?:^|\/\/)(?:\([^)]*\))?([a-z0-9][-a-z0-9]*(?:\\\.)[a-z]{2,10})(?:[\\\/\$\)]|$)/gi;
  while ((match = simpleDomain.exec(inner)) !== null) {
    const domain = match[1].replace(/\\\./g, '.');
    if (/^[a-z0-9][-a-z0-9]*\.[a-z]{2,10}$/i.test(domain)) {
      patterns.push(`*://*.${domain}/*`);
      patterns.push(`*://${domain}/*`);
    }
  }

  // Deduplicate
  return [...new Set(patterns)];
}

// Helper: Convert @include glob to @match pattern
function convertIncludeToMatch(include: any) {
  if (!include) return null;
  
  // If it's already a valid match pattern, return it
  if (isValidMatchPattern(include)) return include;
  
  // Handle common patterns
  if (include === '*') return '<all_urls>';
  
  // Try to convert glob to match pattern
  // Replace ** with * and handle http/https
  let pattern = include;
  
  // Handle patterns like *://example.com/*
  if (pattern.startsWith('*://')) {
    const afterScheme = pattern.slice(4);
    if (!afterScheme.includes('/')) pattern += '/*';
    return isValidMatchPattern(pattern) ? pattern : null;
  }

  // Handle patterns like http://example.com/*
  if (pattern.match(/^https?:\/\//)) {
    if (!pattern.includes('/*') && !pattern.endsWith('/')) pattern += '/*';
    return isValidMatchPattern(pattern) ? pattern : null;
  }

  // Handle patterns like *.example.com
  if (pattern.startsWith('*.')) {
    const result = '*://' + pattern + '/*';
    return isValidMatchPattern(result) ? result : null;
  }

  // Handle patterns like example.com
  if (!pattern.includes('://') && !pattern.startsWith('/')) {
    const result = '*://' + pattern + '/*';
    return isValidMatchPattern(result) ? result : null;
  }

  return null;
}

// MV3 cold-start guard: store the init promise on self so all event listeners
// (onMessage, onAlarm, onCommand, onTab*) can await it before touching state.
// Without this, an event firing during the SW wake races init() and hits
// handlers before ScriptStorage / SettingsManager are ready.
self._initPromise = init();
function ensureInitialized() {
  if (!self._initPromise) self._initPromise = init();
  return self._initPromise;
}
self.ensureInitialized = ensureInitialized;
