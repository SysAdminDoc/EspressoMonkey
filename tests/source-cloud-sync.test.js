import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalGlobals = {
  crypto: globalThis.crypto,
  debugLog: globalThis.debugLog,
  parseUserscript: globalThis.parseUserscript,
  ScriptAnalyzer: globalThis.ScriptAnalyzer,
  CloudSyncProviders: globalThis.CloudSyncProviders,
  SettingsManager: globalThis.SettingsManager,
  ScriptStorage: globalThis.ScriptStorage,
  ScriptValues: globalThis.ScriptValues,
  registerScript: globalThis.registerScript,
  unregisterScript: globalThis.unregisterScript,
  updateBadge: globalThis.updateBadge,
};

async function loadFreshCloudSync(
  initialScripts,
  remoteData,
  settingsOverride = {},
  valuesByScript = {},
  metadataByScript = null,
  providersOverride = null,
  valueSyncOptions = {},
) {
  vi.resetModules();

  const scriptState = initialScripts.map((script) => structuredClone(script));
  const valueState = structuredClone(valuesByScript);
  let remoteStore = remoteData == null ? null : structuredClone(remoteData);
  const ScriptStorage = {
    getAll: vi.fn(async () => structuredClone(scriptState)),
    get: vi.fn(async (id) => scriptState.find((script) => script.id === id) ?? null),
    set: vi.fn(async (_id, script) => {
      const idx = scriptState.findIndex((entry) => entry.id === script.id);
      if (idx >= 0) {
        scriptState[idx] = structuredClone(script);
      } else {
        scriptState.push(structuredClone(script));
      }
    }),
    delete: vi.fn(async (id) => {
      const idx = scriptState.findIndex((entry) => entry.id === id);
      if (idx >= 0) {
        scriptState.splice(idx, 1);
      }
    }),
  };

  const SettingsManager = {
    get: vi.fn(async () => ({
      syncEnabled: true,
      syncProvider: 'googledrive',
      lastSync: 0,
      ...settingsOverride,
    })),
    set: vi.fn(async () => {}),
  };

  const ScriptValues = {
    getAll: vi.fn(async (scriptId) => structuredClone(valueState[scriptId] || {})),
    setAll: vi.fn(async (scriptId, values) => {
      valueState[scriptId] = structuredClone(values || {});
    }),
  };
  if (metadataByScript) {
    ScriptValues.getAllMetadata = vi.fn(async (scriptId) => structuredClone(
      metadataByScript[scriptId] || {
        valueCount: Object.keys(valueState[scriptId] || {}).length,
        lastUpdatedAt: null,
      },
    ));
    ScriptValues.getAllKeyMetadata = vi.fn(async (scriptId) => structuredClone(
      metadataByScript[scriptId]?.keyMetadata || {},
    ));
  }
  const syncValueConflicts = {};
  if (valueSyncOptions.enabled) {
    const metadataState = structuredClone(metadataByScript || {});
    ScriptValues.getAllMetadata = vi.fn(async (scriptId) => structuredClone(
      metadataState[scriptId] || {
        valueCount: Object.keys(valueState[scriptId] || {}).length,
        lastUpdatedAt: null,
      },
    ));
    ScriptValues.getAllKeyMetadata = vi.fn(async (scriptId) => structuredClone(
      metadataState[scriptId]?.keyMetadata || {},
    ));
    ScriptValues.getSyncDeviceId = vi.fn(async () => valueSyncOptions.deviceId || 'device-test');
    ScriptValues.getSyncConflicts = vi.fn(async (scriptId) => structuredClone(syncValueConflicts[scriptId] || {}));
    ScriptValues.setSyncConflicts = vi.fn(async (scriptId, conflicts) => {
      syncValueConflicts[scriptId] = structuredClone(conflicts || {});
    });
    ScriptValues.setAllWithClocks = vi.fn(async (scriptId, values, keyMetadata) => {
      valueState[scriptId] = structuredClone(values || {});
      metadataState[scriptId] = {
        valueCount: Object.keys(valueState[scriptId]).length,
        lastUpdatedAt: Math.max(...Object.values(keyMetadata || {}).map((entry) => Number(entry?.updatedAt) || 0), 0) || null,
        keyMetadata: structuredClone(keyMetadata || {}),
      };
    });
  }

  const provider = {
    name: 'Google Drive',
    supportsDryRun: true,
    download: vi.fn(async () => structuredClone(remoteStore)),
    upload: vi.fn(async (data) => {
      remoteStore = structuredClone(data);
    }),
  };

  const registerScript = vi.fn().mockResolvedValue();
  const unregisterScript = vi.fn().mockResolvedValue();
  const updateBadge = vi.fn().mockResolvedValue();

  vi.stubGlobal('debugLog', vi.fn());
  vi.stubGlobal('parseUserscript', vi.fn((code) => ({
    meta: { name: code.includes('Remote Beta') ? 'Remote Beta' : 'Script' },
    code,
    metaBlock: '',
  })));
  vi.stubGlobal('ScriptAnalyzer', { _ensureOffscreen: vi.fn().mockResolvedValue() });
  vi.stubGlobal('CloudSyncProviders', providersOverride ?? { googledrive: provider });
  vi.stubGlobal('SettingsManager', SettingsManager);
  vi.stubGlobal('ScriptStorage', ScriptStorage);
  vi.stubGlobal('ScriptValues', ScriptValues);
  vi.stubGlobal('registerScript', registerScript);
  vi.stubGlobal('unregisterScript', unregisterScript);
  vi.stubGlobal('updateBadge', updateBadge);

  const mod = await import('../src/background/cloud-sync.ts');
  return {
    CloudSync: mod.CloudSync,
    ScriptStorage,
    SettingsManager,
    ScriptValues,
    provider,
    registerScript,
    unregisterScript,
    updateBadge,
    scriptState,
    valueState,
    syncValueConflicts,
    getRemoteData: () => structuredClone(remoteStore),
  };
}

function expectCandidateMergeSummaryInvariants(summary) {
  expect(summary.remoteValueBundleMergeSimulationReadyPreviewOnly)
    .toBe(summary.remoteValueBundleCandidateMergesReady);
  expect(summary.remoteValueBundleMergeSimulationManualReview)
    .toBe(summary.remoteValueBundleCandidateMergesManualReview);
  expect(summary.remoteValueBundleMergeSimulationUnavailable)
    .toBe(summary.remoteValueBundleCandidateMergesUnavailable);
  expect(
    summary.remoteValueBundleCandidateAutoSelectedKeyTotal
      + summary.remoteValueBundleCandidateReviewKeyTotal,
  ).toBe(summary.remoteValueBundleCandidateResultKeyTotal);
  expect(
    summary.remoteValueBundleMergeSimulationReadyPreviewOnlyResultKeyTotal
      + summary.remoteValueBundleMergeSimulationManualReviewResultKeyTotal
      + summary.remoteValueBundleMergeSimulationUnavailableResultKeyTotal,
  ).toBe(summary.remoteValueBundleCandidateResultKeyTotal);
  expect(summary.remoteValueBundleMergeSimulationReadyPreviewOnlyResultKeyTotal)
    .toBe(summary.remoteValueBundleCandidateAcceptedResultKeyTotal);
}

function expectPreservedCandidateSummaryInvariants(valueBundleSync) {
  expect(
    valueBundleSync.preservedCandidateMergeReady
      + valueBundleSync.preservedCandidateMergeManualReview
      + valueBundleSync.preservedCandidateMergeUnavailable,
  ).toBe(valueBundleSync.preserved);
  expect(
    valueBundleSync.preservedCandidateAutoSelectedKeyTotal
      + valueBundleSync.preservedCandidateReviewKeyTotal,
  ).toBe(valueBundleSync.preservedCandidateResultKeyTotal);
  expect(valueBundleSync.preservedCandidateAcceptedResultKeyTotal)
    .toBeLessThanOrEqual(valueBundleSync.preservedCandidateResultKeyTotal);
  expect(valueBundleSync.preservedCandidateAcceptedResultKeyTotal)
    .toBeLessThanOrEqual(valueBundleSync.preservedCandidateAutoSelectedKeyTotal);
}

function expectUnavailablePreservedCandidateResultInvariants(valueBundleSync) {
  expect(valueBundleSync.preservedCandidateMergeUnavailable).toBeGreaterThan(0);
  expect(valueBundleSync.preservedCandidateBlockedUnavailable)
    .toBe(valueBundleSync.preservedCandidateMergeUnavailable);
  expect(valueBundleSync.preservedCandidateResultKeyTotal).toBe(0);
  expect(valueBundleSync.preservedCandidateAutoSelectedKeyTotal).toBe(0);
  expect(valueBundleSync.preservedCandidateReviewKeyTotal).toBe(0);
  expect(valueBundleSync.preservedCandidateAcceptedResultKeyTotal).toBe(0);
}

function expectReadyPreservedCandidateResultInvariants(valueBundleSync) {
  expect(valueBundleSync.preservedCandidateMergeReady).toBeGreaterThan(0);
  expect(valueBundleSync.preservedCandidateResultKeyTotal).toBeGreaterThan(0);
  expect(valueBundleSync.preservedCandidateAutoSelectedKeyTotal)
    .toBe(valueBundleSync.preservedCandidateResultKeyTotal);
  expect(valueBundleSync.preservedCandidateReviewKeyTotal).toBe(0);
  expect(valueBundleSync.preservedCandidateAcceptedResultKeyTotal)
    .toBe(valueBundleSync.preservedCandidateResultKeyTotal);
}

function expectWriteFailureRetryReadyInvariants(valueBundleSync) {
  expect(valueBundleSync.writeFailureRetryReady).toBe(valueBundleSync.failures);
  expect(valueBundleSync.writeFailureRetryReady).toBeLessThanOrEqual(valueBundleSync.preserved);
  expect(valueBundleSync.preservedCandidateMergeReady)
    .toBeGreaterThanOrEqual(valueBundleSync.writeFailureRetryReady);
}

function expectUnknownPreservedTimestampInvariants(valueBundleSync) {
  expect(valueBundleSync.preservedTimestampUnknown).toBe(valueBundleSync.preserved);
  expect(valueBundleSync.preservedRemoteNewer).toBe(0);
  expect(valueBundleSync.preservedLocalNewer).toBe(0);
  expect(valueBundleSync.preservedSameTimestamp).toBe(0);
  expect(valueBundleSync.preservedRemoteTimestampOnly).toBe(0);
  expect(valueBundleSync.preservedLocalTimestampOnly).toBe(0);
}

beforeEach(() => {
  globalThis.__resetStorageMock();
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  vi.clearAllMocks();
});

afterEach(() => {
  for (const [key, value] of Object.entries(originalGlobals)) {
    if (key === 'crypto') {
      Object.defineProperty(globalThis, 'crypto', { value, configurable: true });
    } else {
      globalThis[key] = value;
    }
  }
});

describe('source cloud sync module', () => {
  it('delegates provider-owned EasyCloud sync without download/upload double-driving', async () => {
    const easycloudProvider = {
      name: 'EasyCloud',
      supportsDryRun: false,
      sync: vi.fn(async () => ({ success: true, timestamp: 123 })),
      download: vi.fn(async () => null),
      upload: vi.fn(async () => {}),
    };
    const { CloudSync } = await loadFreshCloudSync(
      [],
      null,
      { syncProvider: 'easycloud' },
      {},
      null,
      { easycloud: easycloudProvider },
    );

    const result = await CloudSync.sync();

    expect(result).toEqual({ success: true, timestamp: 123 });
    expect(easycloudProvider.sync).toHaveBeenCalledTimes(1);
    expect(easycloudProvider.download).not.toHaveBeenCalled();
    expect(easycloudProvider.upload).not.toHaveBeenCalled();
  });

  it('returns rate-limit metadata so the alarm layer can honor Retry-After', async () => {
    const rateLimitError = Object.assign(new Error('Google Drive rate limited (403); retry after 7s'), {
      rateLimited: true,
      retryAfterMs: 7000,
      status: 403,
    });
    const provider = {
      name: 'Google Drive',
      supportsDryRun: true,
      download: vi.fn().mockRejectedValue(rateLimitError),
      upload: vi.fn(),
    };
    const { CloudSync } = await loadFreshCloudSync(
      [],
      null,
      {},
      {},
      null,
      { googledrive: provider },
    );

    await expect(CloudSync.sync()).resolves.toEqual({
      error: 'Google Drive rate limited (403); retry after 7s',
      rateLimited: true,
      retryAfterMs: 7000,
    });
  });

  it('includes syncBaseCode in first-sync upload envelopes', async () => {
    await chrome.storage.local.set({ syncTombstones: {} });

    const harness = await loadFreshCloudSync(
      [
        {
          id: 'script_base',
          code: '// ==UserScript==\n// @name Base\n// ==/UserScript==\n// local edit',
          enabled: true,
          position: 0,
          meta: { name: 'Base' },
          settings: {},
          syncBaseCode: '// ==UserScript==\n// @name Base\n// ==/UserScript==\n// base',
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      null,
    );
    const { CloudSync, getRemoteData } = harness;

    await expect(CloudSync.sync()).resolves.toEqual({ success: true });

    expect(getRemoteData().scripts).toEqual([
      expect.objectContaining({
        id: 'script_base',
        code: '// ==UserScript==\n// @name Base\n// ==/UserScript==\n// local edit',
        syncBaseCode: '// ==UserScript==\n// @name Base\n// ==/UserScript==\n// base',
      }),
    ]);
  });

  it('uploads post-merge script state and preserves the new sync base through a round trip', async () => {
    await chrome.storage.local.set({ syncTombstones: {} });

    const firstHarness = await loadFreshCloudSync(
      [
        {
          id: 'script_roundtrip',
          code: '// ==UserScript==\n// @name Round Trip\n// ==/UserScript==\n// local old',
          enabled: true,
          position: 0,
          meta: { name: 'Round Trip' },
          settings: {},
          syncBaseCode: '// ==UserScript==\n// @name Round Trip\n// ==/UserScript==\n// base',
          createdAt: 1,
          updatedAt: 10,
        },
      ],
      {
        version: 1,
        timestamp: 20,
        scripts: [
          {
            id: 'script_roundtrip',
            code: '// ==UserScript==\n// @name Round Trip\n// ==/UserScript==\n// remote merged',
            enabled: true,
            position: 0,
            settings: {},
            syncBaseCode: '// ==UserScript==\n// @name Round Trip\n// ==/UserScript==\n// base',
            updatedAt: 20,
          },
        ],
        tombstones: {},
      },
    );

    await expect(firstHarness.CloudSync.sync()).resolves.toEqual({ success: true });
    const uploadedAfterMerge = firstHarness.getRemoteData();
    expect(uploadedAfterMerge.scripts).toEqual([
      expect.objectContaining({
        id: 'script_roundtrip',
        code: '// ==UserScript==\n// @name Round Trip\n// ==/UserScript==\n// remote merged',
        syncBaseCode: '// ==UserScript==\n// @name Round Trip\n// ==/UserScript==\n// remote merged',
      }),
    ]);

    await chrome.storage.local.set({ syncTombstones: {} });
    const secondHarness = await loadFreshCloudSync([], uploadedAfterMerge);

    await expect(secondHarness.CloudSync.sync()).resolves.toEqual({ success: true });
    expect(secondHarness.scriptState).toEqual([
      expect.objectContaining({
        id: 'script_roundtrip',
        code: '// ==UserScript==\n// @name Round Trip\n// ==/UserScript==\n// remote merged',
        syncBaseCode: '// ==UserScript==\n// @name Round Trip\n// ==/UserScript==\n// remote merged',
      }),
    ]);
    expect(secondHarness.getRemoteData().scripts).toEqual([
      expect.objectContaining({
        id: 'script_roundtrip',
        syncBaseCode: '// ==UserScript==\n// @name Round Trip\n// ==/UserScript==\n// remote merged',
      }),
    ]);
  });

  it('keeps the local-only code edit when remote metadata has the newer timestamp', async () => {
    await chrome.storage.local.set({ syncTombstones: {} });

    const baseCode = '// ==UserScript==\n// @name One Side\n// ==/UserScript==\n// base';
    const localCode = '// ==UserScript==\n// @name One Side\n// ==/UserScript==\n// local code edit';
    const harness = await loadFreshCloudSync(
      [
        {
          id: 'script_one_sided',
          code: localCode,
          enabled: true,
          position: 0,
          meta: { name: 'One Side' },
          settings: { notes: 'local note' },
          syncBaseCode: baseCode,
          createdAt: 1,
          updatedAt: 10,
        },
      ],
      {
        version: 1,
        timestamp: 20,
        scripts: [
          {
            id: 'script_one_sided',
            code: baseCode,
            enabled: false,
            position: 7,
            settings: { notes: 'remote metadata' },
            syncBaseCode: baseCode,
            updatedAt: 20,
          },
        ],
        tombstones: {},
      },
    );

    await expect(harness.CloudSync.sync()).resolves.toEqual({ success: true });

    expect(harness.scriptState).toEqual([
      expect.objectContaining({
        id: 'script_one_sided',
        code: localCode,
        enabled: false,
        position: 7,
        updatedAt: 20,
        syncBaseCode: localCode,
      }),
    ]);
    expect(harness.getRemoteData().scripts).toEqual([
      expect.objectContaining({
        id: 'script_one_sided',
        code: localCode,
        enabled: false,
        position: 7,
        updatedAt: 20,
        syncBaseCode: localCode,
      }),
    ]);
  });

  it('keeps the remote-only code edit when local metadata has the newer timestamp', async () => {
    await chrome.storage.local.set({ syncTombstones: {} });

    const baseCode = '// ==UserScript==\n// @name One Side Remote\n// ==/UserScript==\n// base';
    const remoteCode = '// ==UserScript==\n// @name One Side Remote\n// ==/UserScript==\n// remote code edit';
    const harness = await loadFreshCloudSync(
      [
        {
          id: 'script_remote_code',
          code: baseCode,
          enabled: false,
          position: 9,
          meta: { name: 'One Side Remote' },
          settings: { notes: 'local metadata' },
          syncBaseCode: baseCode,
          createdAt: 1,
          updatedAt: 30,
        },
      ],
      {
        version: 1,
        timestamp: 20,
        scripts: [
          {
            id: 'script_remote_code',
            code: remoteCode,
            enabled: true,
            position: 1,
            settings: { notes: 'remote note' },
            syncBaseCode: baseCode,
            updatedAt: 20,
          },
        ],
        tombstones: {},
      },
    );

    await expect(harness.CloudSync.sync()).resolves.toEqual({ success: true });

    expect(harness.scriptState).toEqual([
      expect.objectContaining({
        id: 'script_remote_code',
        code: remoteCode,
        enabled: false,
        position: 9,
        updatedAt: 30,
        syncBaseCode: remoteCode,
      }),
    ]);
    expect(harness.getRemoteData().scripts).toEqual([
      expect.objectContaining({
        id: 'script_remote_code',
        code: remoteCode,
        enabled: false,
        position: 9,
        updatedAt: 30,
        syncBaseCode: remoteCode,
      }),
    ]);
  });

  it('does not resurrect a deleted script after local state is wiped and resynced from a remote tombstone', async () => {
    await chrome.storage.local.set({ syncTombstones: {} });

    const harness = await loadFreshCloudSync(
      [
        {
          id: 'script_alpha',
          code: '// ==UserScript==\n// @name Alpha\n// ==/UserScript==\nconsole.log("alpha");',
          enabled: true,
          position: 0,
          meta: { name: 'Alpha' },
          settings: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      null,
    );
    const { CloudSync, ScriptStorage, provider, scriptState, getRemoteData } = harness;

    await expect(CloudSync.sync()).resolves.toEqual({ success: true });
    expect(getRemoteData().scripts.map((script) => script.id)).toEqual(['script_alpha']);

    await ScriptStorage.delete('script_alpha');
    const tombstoneTimestamp = Date.now() - 1000;
    await chrome.storage.local.set({ syncTombstones: { script_alpha: tombstoneTimestamp } });
    vi.clearAllMocks();

    await expect(CloudSync.sync()).resolves.toEqual({ success: true });
    expect(scriptState).toEqual([]);
    expect(getRemoteData()).toEqual(
      expect.objectContaining({
        scripts: [],
        tombstones: { script_alpha: tombstoneTimestamp },
      }),
    );

    await chrome.storage.local.set({ syncTombstones: {} });
    vi.clearAllMocks();

    await expect(CloudSync.sync()).resolves.toEqual({ success: true });
    expect(scriptState).toEqual([]);
    expect(ScriptStorage.set).not.toHaveBeenCalledWith('script_alpha', expect.anything());
    expect(provider.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        scripts: [],
        tombstones: { script_alpha: tombstoneTimestamp },
      }),
      expect.objectContaining({ syncProvider: 'googledrive' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    await expect(chrome.storage.local.get('syncTombstones')).resolves.toEqual({
      syncTombstones: { script_alpha: tombstoneTimestamp },
    });
  });

  it('prunes stale remote tombstones before the merged round-trip upload', async () => {
    await chrome.storage.local.set({ syncTombstones: {} });
    const staleTombstone = Date.now() - (31 * 24 * 60 * 60 * 1000);
    const harness = await loadFreshCloudSync([], {
      version: 1,
      timestamp: Date.now(),
      scripts: [],
      tombstones: { stale_script: staleTombstone },
    });

    await expect(harness.CloudSync.sync()).resolves.toEqual({ success: true });

    expect(harness.getRemoteData()).toEqual(expect.objectContaining({
      scripts: [],
      tombstones: {},
    }));
    expect(harness.provider.upload).toHaveBeenCalledWith(
      expect.objectContaining({ tombstones: {} }),
      expect.objectContaining({ syncProvider: 'googledrive' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    await expect(chrome.storage.local.get('syncTombstones')).resolves.toEqual({
      syncTombstones: {},
    });
  });

  it('resurrects a restored-from-trash script whose updatedAt is newer than the remote tombstone', async () => {
    await chrome.storage.local.set({ syncTombstones: {} });

    const harness = await loadFreshCloudSync(
      [
        {
          id: 'script_alpha',
          code: '// ==UserScript==\n// @name Alpha\n// ==/UserScript==\nconsole.log("alpha");',
          enabled: true,
          position: 0,
          meta: { name: 'Alpha' },
          settings: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      null,
    );
    const { CloudSync, ScriptStorage, provider, scriptState, getRemoteData } = harness;

    // Initial sync, then delete + propagate the tombstone to remote.
    await expect(CloudSync.sync()).resolves.toEqual({ success: true });
    await ScriptStorage.delete('script_alpha');
    const tombstoneTimestamp = Date.now() - 1000;
    await chrome.storage.local.set({ syncTombstones: { script_alpha: tombstoneTimestamp } });
    await expect(CloudSync.sync()).resolves.toEqual({ success: true });
    expect(getRemoteData().tombstones).toEqual({ script_alpha: tombstoneTimestamp });

    // Restore from trash: re-save with a NEWER updatedAt and clear the local
    // tombstone (mirrors the restoreFromTrash handler). The remote still holds
    // the recent tombstone.
    await ScriptStorage.set('script_alpha', {
      id: 'script_alpha',
      code: '// ==UserScript==\n// @name Alpha\n// ==/UserScript==\nconsole.log("restored");',
      enabled: true,
      position: 0,
      meta: { name: 'Alpha' },
      settings: {},
      createdAt: 1,
      updatedAt: tombstoneTimestamp + 1000,
    });
    await chrome.storage.local.set({ syncTombstones: {} });
    vi.clearAllMocks();

    await expect(CloudSync.sync()).resolves.toEqual({ success: true });

    // The restored script survives, and the tombstone is cleared on the remote.
    expect(scriptState.map((s) => s.id)).toEqual(['script_alpha']);
    const uploaded = provider.upload.mock.calls[0][0];
    expect(uploaded.scripts.map((s) => s.id)).toEqual(['script_alpha']);
    expect(uploaded.tombstones).toEqual({});
    await expect(chrome.storage.local.get('syncTombstones')).resolves.toEqual({
      syncTombstones: {},
    });
  });

  it('deletes tombstoned local scripts and refreshes runtime registration for synced changes', async () => {
    await chrome.storage.local.set({
      syncTombstones: {},
    });

    const harness = await loadFreshCloudSync(
      [
        {
          id: 'script_alpha',
          code: '// local alpha',
          enabled: true,
          position: 0,
          meta: { name: 'Alpha' },
          settings: {},
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'script_beta',
          code: '// local beta',
          enabled: true,
          position: 1,
          meta: { name: 'Beta' },
          settings: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      {
        version: 1,
        timestamp: 10,
        scripts: [
          {
            id: 'script_beta',
            code: '// Remote Beta',
            enabled: false,
            position: 1,
            settings: {},
            updatedAt: 10,
          },
        ],
        tombstones: { script_alpha: Date.now() - 1000 },
      },
    );
    const {
      CloudSync,
      ScriptStorage,
      SettingsManager,
      provider,
      unregisterScript,
      registerScript,
      updateBadge,
      scriptState,
    } = harness;

    const result = await CloudSync.sync();

    expect(result).toEqual({ success: true });
    expect(ScriptStorage.delete).toHaveBeenCalledWith('script_alpha');
    expect(ScriptStorage.set).toHaveBeenCalledWith(
      'script_beta',
      expect.objectContaining({
        id: 'script_beta',
        code: '// Remote Beta',
        enabled: false,
        syncBaseCode: '// Remote Beta',
      }),
    );
    expect(unregisterScript).toHaveBeenCalledWith('script_alpha');
    expect(unregisterScript).toHaveBeenCalledWith('script_beta');
    expect(registerScript).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: 'script_beta' }),
    );
    expect(updateBadge).toHaveBeenCalledTimes(1);
    expect(provider.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        tombstones: { script_alpha: expect.any(Number) },
        scripts: [
          expect.objectContaining({
            id: 'script_beta',
            enabled: false,
          }),
        ],
      }),
      expect.objectContaining({ syncProvider: 'googledrive' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(SettingsManager.set).toHaveBeenCalledWith('lastSync', expect.any(Number));
    expect(scriptState).toEqual([
      expect.objectContaining({
        id: 'script_beta',
        code: '// Remote Beta',
        enabled: false,
      }),
    ]);
  });

  it('syncs only allowlisted per-script settings and keeps local-only flags local', async () => {
    await chrome.storage.local.set({
      syncTombstones: {},
    });

    const harness = await loadFreshCloudSync(
      [
        {
          id: 'script_settings',
          code: '// local settings',
          enabled: true,
          position: 0,
          meta: { name: 'Settings' },
          settings: {
            runAt: 'document-idle',
            notes: 'local note',
            syncValues: true,
            userModified: false,
            sourceIdentityChanged: true,
            _failedRequires: ['https://cdn.example.com/missing.js'],
            localWorkspaceBindingId: 'binding-local',
            localFilePath: 'C:\\Users\\dev\\secret\\local.user.js',
            localProject: { projectId: 'project-local', manifest: { relativePath: 'nested/local.user.js' } },
            localProjectId: 'project-local',
            localProjectManifest: { relativePath: 'nested/local.user.js', code: 'secret project code' },
            localProjectBindingId: 'binding-project-local',
            relativePath: 'nested/local.user.js',
            projectPath: 'C:\\Users\\dev\\secret\\project',
          },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      {
        version: 1,
        timestamp: 10,
        scripts: [
          {
            id: 'script_settings',
            code: '// Remote Settings',
            enabled: true,
            position: 0,
            settings: {
              runAt: 'document-start',
              syncValues: true,
              userMatches: ['https://example.com/*'],
              userModified: true,
              mergeConflict: true,
              _registrationError: 'remote registration failed',
            },
            updatedAt: 10,
          },
        ],
        tombstones: {},
      },
    );
    const { CloudSync, ScriptStorage, provider, scriptState, getRemoteData } = harness;

    await expect(CloudSync.sync()).resolves.toEqual({ success: true });

    expect(ScriptStorage.set).toHaveBeenCalledWith(
      'script_settings',
      expect.objectContaining({
        settings: expect.objectContaining({
          runAt: 'document-start',
          notes: 'local note',
          sourceIdentityChanged: true,
          _failedRequires: ['https://cdn.example.com/missing.js'],
          userMatches: ['https://example.com/*'],
        }),
      }),
    );
    expect(scriptState[0].settings).not.toMatchObject({
      mergeConflict: true,
      _registrationError: 'remote registration failed',
    });

    const uploaded = getRemoteData();
    expect(provider.upload).toHaveBeenCalled();
    expect(uploaded.scripts[0].settings).toEqual({
      runAt: 'document-start',
      notes: 'local note',
      syncValues: true,
      userMatches: ['https://example.com/*'],
    });
    expect(uploaded.scripts[0]).not.toHaveProperty('values');
    expect(uploaded.scripts[0]).not.toHaveProperty('storage');
    expect(JSON.stringify(uploaded)).not.toContain('binding-local');
    expect(JSON.stringify(uploaded)).not.toContain('project-local');
    expect(JSON.stringify(uploaded)).not.toContain('binding-project-local');
    expect(JSON.stringify(uploaded)).not.toContain('secret\\\\local.user.js');
    expect(JSON.stringify(uploaded)).not.toContain('nested/local.user.js');
    expect(JSON.stringify(uploaded)).not.toContain('secret project code');
    expect(JSON.stringify(uploaded)).not.toContain('secret\\\\project');
  });

  it('uploads capped GM value bundles only for opted-in scripts', async () => {
    await chrome.storage.local.set({
      syncTombstones: {},
    });

    const harness = await loadFreshCloudSync(
      [
        {
          id: 'script_values',
          code: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n',
          enabled: true,
          position: 0,
          meta: { name: 'Values' },
          settings: { syncValues: true },
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'script_local_only_values',
          code: '// ==UserScript==\n// @name Local Values\n// ==/UserScript==\n',
          enabled: true,
          position: 1,
          meta: { name: 'Local Values' },
          settings: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      null,
      {},
      {
        script_values: {
          alpha: { enabled: true },
          token: 'sync-token',
        },
        script_local_only_values: {
          token: 'local-only-token',
        },
      },
      {
        script_values: {
          valueCount: 2,
          lastUpdatedAt: 4242,
          keyMetadata: {
            alpha: { updatedAt: 4240 },
            token: { updatedAt: 4242 },
          },
        },
      },
    );
    const { CloudSync, ScriptValues, getRemoteData } = harness;

    await expect(CloudSync.sync()).resolves.toEqual({ success: true });

    const uploaded = getRemoteData();
    expect(ScriptValues.getAll).toHaveBeenCalledWith('script_values');
    expect(ScriptValues.getAll).not.toHaveBeenCalledWith('script_local_only_values');
    expect(uploaded.valueBundles).toEqual({
      script_values: expect.objectContaining({
        schema: 'scriptvault-gm-value-sync/v1',
        scriptId: 'script_values',
        keyCount: 2,
        lastValueUpdatedAt: 4242,
        keyMetadata: {
          alpha: { updatedAt: 4240 },
          token: { updatedAt: 4242 },
        },
        values: {
          alpha: { enabled: true },
          token: 'sync-token',
        },
      }),
    });
    expect(uploaded.scripts.find((script) => script.id === 'script_values')).not.toHaveProperty('values');
    expect(uploaded.scripts.find((script) => script.id === 'script_values')).not.toHaveProperty('storage');
    expect(JSON.stringify(uploaded)).not.toContain('local-only-token');
  });

  it('previews sync conflicts and direction without writing local or remote data', async () => {
    const harness = await loadFreshCloudSync(
      [
        {
          id: 'script_conflict',
          code: '// local edit',
          enabled: true,
          position: 0,
          meta: { name: 'Conflict Script' },
          settings: {},
          syncBaseCode: '// base',
          createdAt: 1,
          updatedAt: 20,
        },
        {
          id: 'script_local_only',
          code: '// local only',
          enabled: true,
          position: 1,
          meta: { name: 'Local Only' },
          settings: {},
          createdAt: 1,
          updatedAt: 5,
        },
        {
          id: 'script_local_newer',
          code: '// local newer',
          enabled: true,
          position: 2,
          meta: { name: 'Local Newer' },
          settings: {},
          syncBaseCode: '// local newer',
          createdAt: 1,
          updatedAt: 30,
        },
        {
          id: 'script_remote_newer',
          code: '// local older',
          enabled: true,
          position: 3,
          meta: { name: 'Remote Newer' },
          settings: {},
          syncBaseCode: '// local older',
          createdAt: 1,
          updatedAt: 10,
        },
      ],
      {
        version: 1,
        timestamp: 40,
        scripts: [
          {
            id: 'script_conflict',
            code: '// remote edit',
            enabled: true,
            position: 0,
            settings: {},
            updatedAt: 25,
          },
          {
            id: 'script_remote_only',
            code: '// remote only',
            enabled: true,
            position: 1,
            settings: {},
            updatedAt: 15,
          },
          {
            id: 'script_local_newer',
            code: '// remote older',
            enabled: true,
            position: 2,
            settings: {},
            updatedAt: 10,
          },
          {
            id: 'script_remote_newer',
            code: '// remote newer',
            enabled: true,
            position: 3,
            settings: {},
            updatedAt: 35,
          },
        ],
        tombstones: {},
      },
    );
    const { CloudSync, ScriptStorage, SettingsManager, provider } = harness;

    const preview = await CloudSync.preview('googledrive');

    expect(preview).toEqual(
      expect.objectContaining({
        success: true,
        dryRun: true,
        noWrites: true,
        provider: 'googledrive',
        providerLabel: 'Google Drive',
        remoteFound: true,
        summary: expect.objectContaining({
          localScripts: 4,
          remoteScripts: 4,
          localOnly: 1,
          remoteOnly: 1,
          localNewer: 1,
          remoteNewer: 1,
          conflicts: 1,
          wouldUpload: true,
          wouldDownload: true,
        }),
      }),
    );
    expect(preview.conflicts).toEqual([
      expect.objectContaining({
        id: 'script_conflict',
        name: 'Conflict Script',
        reason: 'Both local and remote changed since the last sync base',
      }),
    ]);
    expect(provider.download).toHaveBeenCalledTimes(1);
    expect(provider.upload).not.toHaveBeenCalled();
    expect(ScriptStorage.set).not.toHaveBeenCalled();
    expect(ScriptStorage.delete).not.toHaveBeenCalled();
    expect(SettingsManager.set).not.toHaveBeenCalled();
  });

  it('previews local folder provider conflicts through the shared 3-way engine', async () => {
    const remoteEnvelope = {
      version: 1,
      timestamp: 50,
      scripts: [
        {
          id: 'script_local_folder_conflict',
          code: '// remote local-folder edit',
          enabled: true,
          position: 0,
          settings: {},
          updatedAt: 50,
        },
      ],
      tombstones: {},
    };
    const localFolderProvider = {
      name: 'Local Folder',
      supportsDryRun: true,
      download: vi.fn(async () => structuredClone(remoteEnvelope)),
      upload: vi.fn(async () => {}),
    };
    const harness = await loadFreshCloudSync(
      [
        {
          id: 'script_local_folder_conflict',
          code: '// local folder edit',
          enabled: true,
          position: 0,
          meta: { name: 'Local Folder Conflict' },
          settings: {},
          syncBaseCode: '// shared base',
          createdAt: 1,
          updatedAt: 45,
        },
      ],
      null,
      { syncProvider: 'localfolder' },
      {},
      null,
      { localfolder: localFolderProvider },
    );
    const { CloudSync, ScriptStorage, SettingsManager } = harness;

    const preview = await CloudSync.preview('localfolder');

    expect(preview).toEqual(
      expect.objectContaining({
        success: true,
        dryRun: true,
        noWrites: true,
        provider: 'localfolder',
        providerLabel: 'Local Folder',
        summary: expect.objectContaining({
          localScripts: 1,
          remoteScripts: 1,
          conflicts: 1,
          wouldUpload: true,
          wouldDownload: true,
        }),
      }),
    );
    expect(preview.conflicts).toEqual([
      expect.objectContaining({
        id: 'script_local_folder_conflict',
        name: 'Local Folder Conflict',
        reason: 'Both local and remote changed since the last sync base',
      }),
    ]);
    expect(localFolderProvider.download).toHaveBeenCalledTimes(1);
    expect(localFolderProvider.upload).not.toHaveBeenCalled();
    expect(ScriptStorage.set).not.toHaveBeenCalled();
    expect(SettingsManager.set).not.toHaveBeenCalled();
  });

  it('previews GM value-bundle counts without uploading provider data', async () => {
    const harness = await loadFreshCloudSync(
      [
        {
          id: 'script_values',
          code: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n',
          enabled: true,
          position: 0,
          meta: { name: 'Values' },
          settings: { syncValues: true },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      {
        version: 1,
        timestamp: 10,
        scripts: [],
        tombstones: {},
        valueBundles: {
          remote_values: {
            schema: 'scriptvault-gm-value-sync/v1',
            scriptId: 'remote_values',
            keyCount: 1,
            bytes: 100,
            values: { remote: true },
          },
        },
      },
      {},
      {
        script_values: {
          mode: 'sync',
        },
      },
    );
    const { CloudSync, ScriptStorage, SettingsManager, provider } = harness;

    const preview = await CloudSync.preview('googledrive');

    expect(preview.summary).toEqual(
      expect.objectContaining({
        localValueOptIns: 1,
        localValueBundles: 1,
        remoteValueBundles: 1,
        remoteValueBundlesApplicable: 0,
        remoteValueBundlesApplyReady: 0,
        remoteValueBundlesConflictBlocked: 0,
        remoteValueBundlesIgnored: 1,
        remoteValueBundleWarnings: 0,
        valueBundleWarnings: 0,
        valueBundleApplyEnabled: true,
        valueBundleApplyMode: 'hlc-last-write-wins',
        wouldUploadValues: true,
        wouldApplyValues: false,
      }),
    );
    expect(provider.upload).not.toHaveBeenCalled();
    expect(ScriptStorage.set).not.toHaveBeenCalled();
    expect(harness.ScriptValues.setAll).not.toHaveBeenCalled();
    expect(SettingsManager.set).not.toHaveBeenCalled();
  });

  it('previews remote GM value bundles that pass the opt-in apply gate without writing values', async () => {
    const harness = await loadFreshCloudSync(
      [],
      {
        version: 1,
        timestamp: 10,
        scripts: [
          {
            id: 'script_remote_values',
            code: '// ==UserScript==\n// @name Remote Values\n// ==/UserScript==\n',
            enabled: true,
            position: 0,
            settings: { syncValues: true },
            updatedAt: 10,
          },
        ],
        tombstones: {},
        valueBundles: {
          script_remote_values: {
            schema: 'scriptvault-gm-value-sync/v1',
            scriptId: 'script_remote_values',
            keyCount: 1,
            bytes: 100,
            values: { theme: 'remote' },
          },
        },
      },
    );
    const { CloudSync, ScriptStorage, ScriptValues, provider } = harness;

    const preview = await CloudSync.preview('googledrive');

    expect(preview.summary).toEqual(
      expect.objectContaining({
        remoteOnly: 1,
        remoteValueBundles: 1,
        remoteValueBundlesApplicable: 1,
        remoteValueBundlesApplyReady: 1,
        remoteValueBundlesConflictBlocked: 0,
        remoteValueBundlesIgnored: 0,
        remoteValueBundleWarnings: 0,
        valueBundleApplyEnabled: true,
        valueBundleApplyMode: 'hlc-last-write-wins',
        wouldApplyValues: true,
      }),
    );
    expect(provider.upload).not.toHaveBeenCalled();
    expect(ScriptStorage.set).not.toHaveBeenCalled();
    expect(ScriptValues.setAll).not.toHaveBeenCalled();
  });

  it('previews blocked GM value-bundle merge details without identifiers or values', async () => {
    const harness = await loadFreshCloudSync(
      [
        {
          id: 'script_values',
          code: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n',
          enabled: true,
          position: 0,
          meta: { name: 'Values' },
          settings: { syncValues: true },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      {
        version: 1,
        timestamp: 10,
        scripts: [
          {
            id: 'script_values',
            code: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n',
            enabled: true,
            position: 0,
            settings: { syncValues: true },
            updatedAt: 10,
          },
        ],
        tombstones: {},
        valueBundles: {
          script_values: {
            schema: 'scriptvault-gm-value-sync/v1',
            scriptId: 'script_values',
            keyCount: 2,
            bytes: 100,
            lastValueUpdatedAt: 2000,
            keyMetadata: {
              sharedKeyName: { updatedAt: 2000 },
              remoteKeyName: { updatedAt: 2000 },
            },
            values: {
              sharedKeyName: 'remote-value-456',
              remoteKeyName: true,
            },
          },
        },
      },
      { lastSync: 1500 },
      {
        script_values: {
          sharedKeyName: 'local-value-123',
          localKeyName: true,
        },
      },
      {
        script_values: {
          valueCount: 2,
          lastUpdatedAt: 1000,
          keyMetadata: {
            sharedKeyName: { updatedAt: 1000 },
            localKeyName: { updatedAt: 900 },
          },
        },
      },
    );
    const { CloudSync, ScriptValues, provider } = harness;

    const preview = await CloudSync.preview('googledrive');

    expect(preview.summary).toEqual(
      expect.objectContaining({
        remoteValueBundlesApplicable: 1,
        remoteValueBundlesApplyReady: 1,
        remoteValueBundlesConflictBlocked: 0,
        localValueBundlesWithTimestamps: 1,
        localValueBundlesMissingTimestamps: 0,
        localValueBundlesOlderThanLastSync: 1,
        localValueBundlesNewerThanLastSync: 0,
        remoteValueBundlesWithTimestamps: 1,
        remoteValueBundlesMissingTimestamps: 0,
        remoteValueBundlesOlderThanLastSync: 0,
        remoteValueBundlesNewerThanLastSync: 1,
        remoteValueBundleCandidateMergesReady: 0,
        remoteValueBundleCandidateMergesManualReview: 0,
        remoteValueBundleCandidateMergesUnavailable: 0,
        remoteValueBundleMergeSimulationReadyPreviewOnly: 0,
        remoteValueBundleMergeSimulationManualReview: 0,
        remoteValueBundleMergeSimulationUnavailable: 0,
        remoteValueBundleMergeSimulationReadyPreviewOnlyResultKeyTotal: 0,
        remoteValueBundleMergeSimulationManualReviewResultKeyTotal: 0,
        remoteValueBundleMergeSimulationUnavailableResultKeyTotal: 0,
        remoteValueBundleCandidateMergesBlockedSameTimestamp: 0,
        remoteValueBundleCandidateMergesBlockedUnknownTimestamp: 0,
        remoteValueBundleCandidateMergesBlockedOneSidedTimestamp: 0,
        remoteValueBundleCandidateMergesBlockedUnavailable: 0,
        remoteValueBundleCandidateMergesBlockedNoCandidateKeys: 0,
        remoteValueBundleCandidateResultKeyTotal: 0,
        remoteValueBundleCandidateAutoSelectedKeyTotal: 0,
        remoteValueBundleCandidateReviewKeyTotal: 0,
        remoteValueBundleCandidateAcceptedResultKeyTotal: 0,
        wouldApplyValues: true,
      }),
    );
    expectCandidateMergeSummaryInvariants(preview.summary);
    expect(preview.valueBundleConflicts).toEqual([]);
    const serializedPreview = JSON.stringify(preview.valueBundleConflicts);
    expect(serializedPreview).not.toContain('script_values');
    expect(serializedPreview).not.toContain('Values');
    expect(serializedPreview).not.toContain('sharedKeyName');
    expect(serializedPreview).not.toContain('localKeyName');
    expect(serializedPreview).not.toContain('remoteKeyName');
    expect(serializedPreview).not.toContain('local-value-123');
    expect(serializedPreview).not.toContain('remote-value-456');
    expect(serializedPreview).not.toContain('keyMetadata');
    expect(provider.upload).not.toHaveBeenCalled();
    expect(ScriptValues.setAll).not.toHaveBeenCalled();
  });

  it('counts manual-review candidate merge reasons without exposing values or keys', async () => {
    const harness = await loadFreshCloudSync(
      [
        {
          id: 'script_values',
          code: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// local',
          enabled: true,
          position: 0,
          meta: { name: 'Values' },
          settings: { syncValues: true },
          syncBaseCode: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// local',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      {
        version: 1,
        timestamp: 20,
        scripts: [
          {
            id: 'script_values',
            code: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// remote',
            enabled: true,
            position: 0,
            settings: { syncValues: true },
            updatedAt: 20,
          },
        ],
        tombstones: {},
        valueBundles: {
          script_values: {
            schema: 'scriptvault-gm-value-sync/v1',
            scriptId: 'script_values',
            keyCount: 1,
            bytes: 80,
            values: {
              sharedKeyName: 'remote-value-456',
            },
          },
        },
      },
      {},
      {
        script_values: {
          sharedKeyName: 'local-value-123',
        },
      },
      {
        script_values: {
          valueCount: 1,
          lastUpdatedAt: 1000,
        },
      },
    );
    const { CloudSync, ScriptValues, provider } = harness;

    const preview = await CloudSync.preview('googledrive');

    expect(preview.summary).toEqual(
      expect.objectContaining({
        remoteValueBundlesConflictBlocked: 0,
        remoteValueBundlesApplyReady: 1,
        remoteValueBundleCandidateMergesReady: 0,
        remoteValueBundleCandidateMergesManualReview: 0,
        remoteValueBundleCandidateMergesUnavailable: 0,
        remoteValueBundleMergeSimulationReadyPreviewOnly: 0,
        remoteValueBundleMergeSimulationManualReview: 0,
        remoteValueBundleMergeSimulationUnavailable: 0,
        remoteValueBundleMergeSimulationReadyPreviewOnlyResultKeyTotal: 0,
        remoteValueBundleMergeSimulationManualReviewResultKeyTotal: 0,
        remoteValueBundleMergeSimulationUnavailableResultKeyTotal: 0,
        remoteValueBundleCandidateMergesBlockedUnknownTimestamp: 0,
        remoteValueBundleCandidateResultKeyTotal: 0,
        remoteValueBundleCandidateAutoSelectedKeyTotal: 0,
        remoteValueBundleCandidateReviewKeyTotal: 0,
        remoteValueBundleCandidateAcceptedResultKeyTotal: 0,
        wouldApplyValues: true,
      }),
    );
    expectCandidateMergeSummaryInvariants(preview.summary);
    expect(preview.valueBundleConflicts).toEqual([]);
    const serializedPreview = JSON.stringify(preview.valueBundleConflicts);
    expect(serializedPreview).not.toContain('script_values');
    expect(serializedPreview).not.toContain('sharedKeyName');
    expect(serializedPreview).not.toContain('local-value-123');
    expect(serializedPreview).not.toContain('remote-value-456');
    expect(provider.upload).not.toHaveBeenCalled();
    expect(ScriptValues.setAll).not.toHaveBeenCalled();
  });

  it('counts unavailable candidate merge simulations without exposing remote values or keys', async () => {
    const harness = await loadFreshCloudSync(
      [
        {
          id: 'script_values',
          code: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// local',
          enabled: true,
          position: 0,
          meta: { name: 'Values' },
          settings: {},
          syncBaseCode: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// local',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      {
        version: 1,
        timestamp: 20,
        scripts: [
          {
            id: 'script_values',
            code: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// remote',
            enabled: true,
            position: 0,
            settings: { syncValues: true },
            updatedAt: 20,
          },
        ],
        tombstones: {},
        valueBundles: {
          script_values: {
            schema: 'scriptvault-gm-value-sync/v1',
            scriptId: 'script_values',
            keyCount: 1,
            bytes: 80,
            values: {
              remoteSecretKey: 'remote-value-456',
            },
          },
        },
      },
    );
    const { CloudSync, ScriptValues, provider } = harness;

    const preview = await CloudSync.preview('googledrive');

    expect(preview.summary).toEqual(
      expect.objectContaining({
        remoteValueBundlesConflictBlocked: 1,
        remoteValueBundleCandidateMergesReady: 0,
        remoteValueBundleCandidateMergesManualReview: 0,
        remoteValueBundleCandidateMergesUnavailable: 1,
        remoteValueBundleMergeSimulationReadyPreviewOnly: 0,
        remoteValueBundleMergeSimulationManualReview: 0,
        remoteValueBundleMergeSimulationUnavailable: 1,
        remoteValueBundleMergeSimulationReadyPreviewOnlyResultKeyTotal: 0,
        remoteValueBundleMergeSimulationManualReviewResultKeyTotal: 0,
        remoteValueBundleMergeSimulationUnavailableResultKeyTotal: 0,
        remoteValueBundleCandidateMergesBlockedUnavailable: 1,
        remoteValueBundleCandidateResultKeyTotal: 0,
        remoteValueBundleCandidateAutoSelectedKeyTotal: 0,
        remoteValueBundleCandidateReviewKeyTotal: 0,
        remoteValueBundleCandidateAcceptedResultKeyTotal: 0,
      }),
    );
    expectCandidateMergeSummaryInvariants(preview.summary);
    expect(preview.valueBundleConflicts).toEqual([
      expect.objectContaining({
        reason: 'local-bundle-unavailable',
        localKeyCount: null,
        remoteKeyCount: 1,
        candidateMergePlan: 'unavailable',
        candidateRemoteKeyCount: null,
        candidateLocalKeyCount: null,
        candidateSameTimestampKeyCount: null,
        candidateManualKeyCount: null,
        candidateOneSidedTimestampKeyCount: null,
        candidateResultKeyCount: null,
        candidateAutoSelectedKeyCount: null,
        candidateReviewKeyCount: null,
        candidateMergeGate: 'unavailable',
        candidateMergeBlockReason: 'local-bundle-unavailable',
        candidateMergeSimulation: 'unavailable',
      }),
    ]);
    const serializedPreview = JSON.stringify(preview.valueBundleConflicts);
    expect(serializedPreview).not.toContain('script_values');
    expect(serializedPreview).not.toContain('remoteSecretKey');
    expect(serializedPreview).not.toContain('remote-value-456');
    expect(provider.upload).not.toHaveBeenCalled();
    expect(ScriptValues.setAll).not.toHaveBeenCalled();
  });

  it('preserves remote GM value bundles during sync when local values are non-empty', async () => {
    await chrome.storage.local.set({
      syncTombstones: {},
    });

    const harness = await loadFreshCloudSync(
      [
        {
          id: 'script_values',
          code: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// local',
          enabled: true,
          position: 0,
          meta: { name: 'Values' },
          settings: { syncValues: true },
          syncBaseCode: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// local',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      {
        version: 1,
        timestamp: 20,
        scripts: [
          {
            id: 'script_values',
            code: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// remote',
            enabled: true,
            position: 0,
            settings: { syncValues: true },
            updatedAt: 20,
          },
        ],
        tombstones: {},
        valueBundles: {
          script_values: {
            schema: 'scriptvault-gm-value-sync/v1',
            scriptId: 'script_values',
            keyCount: 1,
            bytes: 100,
            lastValueUpdatedAt: 2000,
            values: { token: 'remote-token' },
          },
        },
      },
      {},
      {
        script_values: {
          token: 'local-token',
        },
      },
      {
        script_values: {
          valueCount: 1,
          lastUpdatedAt: 1000,
        },
      },
    );
    const { CloudSync, ScriptValues, getRemoteData, scriptState } = harness;

    const result = await CloudSync.sync();
    expect(result).toEqual({
      success: true,
      valueBundleSync: expect.objectContaining({
        applied: 1,
        preserved: 0,
        conflictBlocked: 0,
        conflictsDetected: 1,
        losersRetained: 1,
        skippedNonEmpty: 0,
        skippedUserModified: 0,
        skippedUnavailable: 0,
        failures: 0,
      }),
    });

    expect(ScriptValues.setAll).toHaveBeenCalledWith('script_values', { token: 'remote-token' });
    expect(scriptState[0].code).toContain('// remote');
    expect(getRemoteData().valueBundles.script_values.values).toEqual({
      token: 'remote-token',
    });
    expect(JSON.stringify(getRemoteData())).not.toContain('local-token');
  });

  it('applies HLC winners and persists losing GM values for review', async () => {
    await chrome.storage.local.set({ syncTombstones: {} });
    const localClock = { ts: 5000, counter: 1, deviceId: 'device-local' };
    const remoteClock = { ts: 5000, counter: 2, deviceId: 'device-remote' };
    const harness = await loadFreshCloudSync(
      [{
        id: 'script_values',
        code: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// local',
        enabled: true,
        position: 0,
        meta: { name: 'Values' },
        settings: { syncValues: true },
        syncBaseCode: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// local',
        createdAt: 1,
        updatedAt: 1,
      }],
      {
        version: 1,
        timestamp: 20,
        scripts: [{
          id: 'script_values',
          code: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// remote',
          enabled: true,
          position: 0,
          settings: { syncValues: true },
          updatedAt: 20,
        }],
        tombstones: {},
        valueBundles: {
          script_values: {
            schema: 'scriptvault-gm-value-sync/v1',
            scriptId: 'script_values',
            keyCount: 1,
            bytes: 100,
            values: { token: 'remote-token' },
            keyMetadata: {
              token: { updatedAt: 1000, clock: remoteClock },
            },
          },
        },
      },
      { gmValueSyncConflictPolicy: 'hlc' },
      { script_values: { token: 'local-token' } },
      {
        script_values: {
          valueCount: 1,
          lastUpdatedAt: 5000,
          keyMetadata: {
            token: { updatedAt: 1000, clock: localClock },
          },
        },
      },
      null,
      { enabled: true, deviceId: 'device-local' },
    );
    const { CloudSync, ScriptValues, valueState, syncValueConflicts } = harness;

    const result = await CloudSync.sync();

    expect(result).toEqual(expect.objectContaining({
      success: true,
      valueBundleSync: expect.objectContaining({
        applied: 1,
        conflictBlocked: 0,
        conflictsDetected: 1,
        losersRetained: 1,
      }),
    }));
    expect(ScriptValues.setAllWithClocks).toHaveBeenCalledWith(
      'script_values',
      { token: 'remote-token' },
      { token: { updatedAt: 1000, clock: remoteClock } },
    );
    expect(valueState.script_values).toEqual({ token: 'remote-token' });
    expect(syncValueConflicts.script_values.token).toEqual([
      { value: 'local-token', clock: localClock, retainedAt: expect.any(Number) },
    ]);
  });

  it('uploads newer local GM value bundles instead of stale preserved remote bundles', async () => {
    await chrome.storage.local.set({
      syncTombstones: {},
    });

    const harness = await loadFreshCloudSync(
      [
        {
          id: 'script_values',
          code: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// local',
          enabled: true,
          position: 0,
          meta: { name: 'Values' },
          settings: { syncValues: true },
          syncBaseCode: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// local',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      {
        version: 1,
        timestamp: 20,
        scripts: [
          {
            id: 'script_values',
            code: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// remote',
            enabled: true,
            position: 0,
            settings: { syncValues: true },
            updatedAt: 20,
          },
        ],
        tombstones: {},
        valueBundles: {
          script_values: {
            schema: 'scriptvault-gm-value-sync/v1',
            scriptId: 'script_values',
            keyCount: 1,
            bytes: 100,
            lastValueUpdatedAt: 2000,
            values: { token: 'remote-token' },
          },
        },
      },
      {},
      {
        script_values: {
          token: 'local-token',
        },
      },
      {
        script_values: {
          valueCount: 1,
          lastUpdatedAt: 3000,
        },
      },
    );
    const { CloudSync, ScriptValues, getRemoteData, scriptState } = harness;

    const result = await CloudSync.sync();
    expect(result).toEqual({
      success: true,
      valueBundleSync: expect.objectContaining({
        applied: 0,
        preserved: 0,
        conflictBlocked: 0,
        conflictsDetected: 1,
        losersRetained: 1,
        skippedNonEmpty: 0,
        skippedUserModified: 0,
        skippedUnavailable: 0,
        failures: 0,
      }),
    });

    expect(ScriptValues.setAll).not.toHaveBeenCalled();
    expect(scriptState[0].code).toContain('// remote');
    expect(getRemoteData().valueBundles.script_values).toEqual(expect.objectContaining({
      schema: 'scriptvault-gm-value-sync/v1',
      scriptId: 'script_values',
      keyCount: 1,
      lastValueUpdatedAt: 3000,
      values: {
        token: 'local-token',
      },
    }));
    expect(JSON.stringify(getRemoteData())).not.toContain('remote-token');
  });

  it('reports user-modified GM value-bundle preserves separately during sync', async () => {
    await chrome.storage.local.set({
      syncTombstones: {},
    });

    const harness = await loadFreshCloudSync(
      [
        {
          id: 'script_values',
          code: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// local',
          enabled: true,
          position: 0,
          meta: { name: 'Values' },
          settings: { syncValues: true, userModified: true },
          syncBaseCode: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// local',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      {
        version: 1,
        timestamp: 20,
        scripts: [
          {
            id: 'script_values',
            code: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// remote',
            enabled: true,
            position: 0,
            settings: { syncValues: true },
            updatedAt: 20,
          },
        ],
        tombstones: {},
        valueBundles: {
          script_values: {
            schema: 'scriptvault-gm-value-sync/v1',
            scriptId: 'script_values',
            keyCount: 1,
            bytes: 100,
            lastValueUpdatedAt: 2000,
            values: { token: 'remote-token' },
          },
        },
      },
      {},
      {
        script_values: {},
      },
      {
        script_values: {
          valueCount: 0,
          lastUpdatedAt: 3000,
        },
      },
    );
    const { CloudSync, ScriptValues, getRemoteData, scriptState } = harness;

    const result = await CloudSync.sync();
    expect(result).toEqual({
      success: true,
      valueBundleSync: expect.objectContaining({
        applied: 1,
        preserved: 0,
        conflictBlocked: 0,
        conflictsDetected: 0,
        losersRetained: 0,
        skippedNonEmpty: 0,
        skippedUserModified: 0,
        skippedUnavailable: 0,
        failures: 0,
      }),
    });

    expect(ScriptValues.setAll).toHaveBeenCalledWith('script_values', { token: 'remote-token' });
    expect(scriptState[0].settings.userModified).toBe(true);
    expect(scriptState[0].code).toContain('// local');
    expect(getRemoteData().valueBundles.script_values.values).toEqual({
      token: 'remote-token',
    });
  });

  it('reports unavailable preserved candidate summaries when value storage fails during sync', async () => {
    await chrome.storage.local.set({
      syncTombstones: {},
    });

    const harness = await loadFreshCloudSync(
      [
        {
          id: 'script_values',
          code: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// local',
          enabled: true,
          position: 0,
          meta: { name: 'Values' },
          settings: {},
          syncBaseCode: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// local',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      {
        version: 1,
        timestamp: 20,
        scripts: [
          {
            id: 'script_values',
            code: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// remote',
            enabled: true,
            position: 0,
            settings: { syncValues: true },
            updatedAt: 20,
          },
        ],
        tombstones: {},
        valueBundles: {
          script_values: {
            schema: 'scriptvault-gm-value-sync/v1',
            scriptId: 'script_values',
            keyCount: 1,
            bytes: 100,
            values: { token: 'remote-token' },
          },
        },
      },
    );
    const { CloudSync, ScriptValues, getRemoteData, scriptState } = harness;
    ScriptValues.getAll.mockRejectedValueOnce(new Error('value storage unavailable'));

    const result = await CloudSync.sync();
    expect(result).toEqual({
      success: true,
      valueBundleSync: {
        applied: 0,
        preserved: 1,
        conflictBlocked: 0,
        conflictsDetected: 0,
        losersRetained: 0,
        skippedNonEmpty: 0,
        skippedUserModified: 0,
        skippedUnavailable: 0,
        failures: 1,
        preservedRemoteNewer: 0,
        preservedLocalNewer: 0,
        preservedSameTimestamp: 0,
        preservedRemoteTimestampOnly: 0,
        preservedLocalTimestampOnly: 0,
        preservedTimestampUnknown: 1,
        preservedCandidateMergeReady: 0,
        preservedCandidateMergeManualReview: 0,
        preservedCandidateMergeUnavailable: 1,
        preservedCandidateResultKeyTotal: 0,
        preservedCandidateAutoSelectedKeyTotal: 0,
        preservedCandidateReviewKeyTotal: 0,
        preservedCandidateAcceptedResultKeyTotal: 0,
        preservedCandidateBlockedSameTimestamp: 0,
        preservedCandidateBlockedUnknownTimestamp: 0,
        preservedCandidateBlockedOneSidedTimestamp: 0,
        preservedCandidateBlockedUnavailable: 1,
        preservedCandidateBlockedNoCandidateKeys: 0,
      },
    });
    expectPreservedCandidateSummaryInvariants(result.valueBundleSync);
    expectUnavailablePreservedCandidateResultInvariants(result.valueBundleSync);
    expectUnknownPreservedTimestampInvariants(result.valueBundleSync);

    expect(ScriptValues.setAll).not.toHaveBeenCalled();
    expect(scriptState[0].code).toContain('// remote');
    expect(getRemoteData().valueBundles.script_values.values).toEqual({
      token: 'remote-token',
    });
  });

  it('applies remote GM value bundles during sync when local values are empty', async () => {
    await chrome.storage.local.set({
      syncTombstones: {},
    });

    const harness = await loadFreshCloudSync(
      [
        {
          id: 'script_values',
          code: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// local',
          enabled: true,
          position: 0,
          meta: { name: 'Values' },
          settings: { syncValues: true },
          syncBaseCode: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// local',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      {
        version: 1,
        timestamp: 20,
        scripts: [
          {
            id: 'script_values',
            code: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// remote',
            enabled: true,
            position: 0,
            settings: { syncValues: true },
            updatedAt: 20,
          },
        ],
        tombstones: {},
        valueBundles: {
          script_values: {
            schema: 'scriptvault-gm-value-sync/v1',
            scriptId: 'script_values',
            keyCount: 1,
            bytes: 100,
            values: { token: 'remote-token' },
          },
        },
      },
      {},
      {
        script_values: {},
      },
    );
    const { CloudSync, ScriptValues, getRemoteData, scriptState, valueState } = harness;

    await expect(CloudSync.sync()).resolves.toEqual({
      success: true,
      valueBundleSync: {
        applied: 1,
        preserved: 0,
        conflictBlocked: 0,
        conflictsDetected: 0,
        losersRetained: 0,
        skippedNonEmpty: 0,
        skippedUserModified: 0,
        skippedUnavailable: 0,
        failures: 0,
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
        preservedCandidateBlockedNoCandidateKeys: 0,
      },
    });

    expect(ScriptValues.setAll).toHaveBeenCalledWith('script_values', { token: 'remote-token' });
    expect(valueState.script_values).toEqual({ token: 'remote-token' });
    expect(scriptState[0].code).toContain('// remote');
    expect(getRemoteData().valueBundles.script_values.values).toEqual({
      token: 'remote-token',
    });
  });

  it('preserves remote GM value bundles when empty-local value writes fail during sync', async () => {
    await chrome.storage.local.set({
      syncTombstones: {},
    });

    const harness = await loadFreshCloudSync(
      [
        {
          id: 'script_values',
          code: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// local',
          enabled: true,
          position: 0,
          meta: { name: 'Values' },
          settings: { syncValues: true },
          syncBaseCode: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// local',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      {
        version: 1,
        timestamp: 20,
        scripts: [
          {
            id: 'script_values',
            code: '// ==UserScript==\n// @name Values\n// ==/UserScript==\n// remote',
            enabled: true,
            position: 0,
            settings: { syncValues: true },
            updatedAt: 20,
          },
        ],
        tombstones: {},
        valueBundles: {
          script_values: {
            schema: 'scriptvault-gm-value-sync/v1',
            scriptId: 'script_values',
            keyCount: 1,
            bytes: 100,
            values: { token: 'remote-token' },
          },
        },
      },
      {},
      {
        script_values: {},
      },
    );
    const { CloudSync, ScriptValues, getRemoteData, provider, scriptState, valueState } = harness;
    ScriptValues.setAll.mockRejectedValueOnce(new Error('value write failed'));

    const result = await CloudSync.sync();
    expect(result).toEqual({
      success: true,
      valueBundleSync: {
        applied: 0,
        preserved: 1,
        conflictBlocked: 0,
        conflictsDetected: 0,
        losersRetained: 0,
        skippedNonEmpty: 0,
        skippedUserModified: 0,
        skippedUnavailable: 0,
        failures: 1,
        writeFailureRetryReady: 1,
        preservedRemoteNewer: 0,
        preservedLocalNewer: 0,
        preservedSameTimestamp: 0,
        preservedRemoteTimestampOnly: 0,
        preservedLocalTimestampOnly: 0,
        preservedTimestampUnknown: 1,
        preservedCandidateMergeReady: 1,
        preservedCandidateMergeManualReview: 0,
        preservedCandidateMergeUnavailable: 0,
        preservedCandidateResultKeyTotal: 1,
        preservedCandidateAutoSelectedKeyTotal: 1,
        preservedCandidateReviewKeyTotal: 0,
        preservedCandidateAcceptedResultKeyTotal: 1,
        preservedCandidateBlockedSameTimestamp: 0,
        preservedCandidateBlockedUnknownTimestamp: 0,
        preservedCandidateBlockedOneSidedTimestamp: 0,
        preservedCandidateBlockedUnavailable: 0,
        preservedCandidateBlockedNoCandidateKeys: 0,
      },
    });
    expectPreservedCandidateSummaryInvariants(result.valueBundleSync);
    expectReadyPreservedCandidateResultInvariants(result.valueBundleSync);
    expectWriteFailureRetryReadyInvariants(result.valueBundleSync);
    expectUnknownPreservedTimestampInvariants(result.valueBundleSync);

    expect(ScriptValues.setAll).toHaveBeenCalledWith('script_values', { token: 'remote-token' });
    expect(valueState.script_values).toEqual({});
    expect(scriptState[0].code).toContain('// remote');
    expect(getRemoteData().valueBundles.script_values.values).toEqual({
      token: 'remote-token',
    });

    const retryPreview = await CloudSync.preview('googledrive');
    expect(retryPreview.summary).toEqual(expect.objectContaining({
      localValueBundles: 1,
      remoteValueBundles: 1,
      remoteValueBundlesApplicable: 1,
      remoteValueBundlesApplyReady: 1,
      remoteValueBundlesConflictBlocked: 0,
      remoteValueBundlesIgnored: 0,
      remoteValueBundleWarnings: 0,
      valueBundleApplyEnabled: true,
      valueBundleApplyMode: 'hlc-last-write-wins',
      wouldApplyValues: true,
    }));
    expect(retryPreview.valueBundleConflicts).toEqual([]);
    const serializedRetryPreview = JSON.stringify(retryPreview);
    expect(serializedRetryPreview).not.toContain('script_values');
    expect(serializedRetryPreview).not.toContain('token');
    expect(serializedRetryPreview).not.toContain('remote-token');
    expect(provider.upload).toHaveBeenCalledTimes(1);
    expect(ScriptValues.setAll).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();

    const retryResult = await CloudSync.sync();
    expect(retryResult).toEqual({
      success: true,
      valueBundleSync: {
        applied: 1,
        preserved: 0,
        conflictBlocked: 0,
        conflictsDetected: 0,
        losersRetained: 0,
        skippedNonEmpty: 0,
        skippedUserModified: 0,
        skippedUnavailable: 0,
        failures: 0,
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
        preservedCandidateBlockedNoCandidateKeys: 0,
      },
    });
    expect(retryResult.valueBundleSync).not.toHaveProperty('writeFailureRetryReady');
    expect(ScriptValues.setAll).toHaveBeenCalledWith('script_values', { token: 'remote-token' });
    expect(ScriptValues.setAll).toHaveBeenCalledTimes(1);
    expect(valueState.script_values).toEqual({ token: 'remote-token' });
    expect(getRemoteData().valueBundles.script_values.values).toEqual({
      token: 'remote-token',
    });
    expect(provider.upload).toHaveBeenCalledTimes(1);
    const serializedRetryResult = JSON.stringify(retryResult);
    expect(serializedRetryResult).not.toContain('script_values');
    expect(serializedRetryResult).not.toContain('token');
    expect(serializedRetryResult).not.toContain('remote-token');
  });

  it('uploads encrypted v2 envelopes when sync encryption is enabled', async () => {
    await chrome.storage.local.set({
      syncTombstones: {},
    });

    const harness = await loadFreshCloudSync(
      [
        {
          id: 'script_secret',
          code: '// ==UserScript==\n// @name Secret\n// ==/UserScript==\nconst token = "secret-token";',
          enabled: true,
          position: 0,
          meta: { name: 'Secret' },
          settings: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      null,
      {
        syncEncryptionEnabled: true,
        syncEncryptionPassphrase: 'vault passphrase',
        syncEncryptionKdfIterations: 2,
      },
    );
    const { CloudSync, getRemoteData } = harness;

    await expect(CloudSync.sync()).resolves.toEqual({ success: true });

    const uploaded = getRemoteData();
    expect(uploaded).toEqual(
      expect.objectContaining({
        version: 2,
        encrypted: true,
        algorithm: 'AES-256-GCM',
        kdf: 'PBKDF2-SHA-256',
      }),
    );
    expect(uploaded).not.toHaveProperty('scripts');
    expect(JSON.stringify(uploaded)).not.toContain('secret-token');
  });

  it('rejects encrypted remote envelopes with a wrong passphrase before writing local data', async () => {
    await chrome.storage.local.set({
      syncTombstones: {},
    });

    const firstHarness = await loadFreshCloudSync(
      [
        {
          id: 'script_secret',
          code: '// ==UserScript==\n// @name Secret\n// ==/UserScript==\nconst token = "secret-token";',
          enabled: true,
          position: 0,
          meta: { name: 'Secret' },
          settings: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      null,
      {
        syncEncryptionEnabled: true,
        syncEncryptionPassphrase: 'correct passphrase',
        syncEncryptionKdfIterations: 2,
      },
    );
    await expect(firstHarness.CloudSync.sync()).resolves.toEqual({ success: true });

    const secondHarness = await loadFreshCloudSync(
      [],
      firstHarness.getRemoteData(),
      {
        syncEncryptionEnabled: true,
        syncEncryptionPassphrase: 'wrong passphrase',
        syncEncryptionKdfIterations: 2,
      },
    );

    await expect(secondHarness.CloudSync.sync()).resolves.toEqual({
      error: 'Unable to decrypt sync data. Check the sync encryption passphrase.',
    });
    expect(secondHarness.ScriptStorage.set).not.toHaveBeenCalled();
    expect(secondHarness.provider.upload).not.toHaveBeenCalled();
  });

  // syncBaseCode used to be written only by the apply loop, and only when a
  // remote change was actually saved. A device that merely uploaded its own
  // edits kept a stale (or null) merge ancestor, so a later sync ran diff3 with
  // the device's OWN earlier edit as the "remote" side and emitted conflict
  // markers into a script that was only ever edited on one machine.
  it('advances the local sync base to the code it just uploaded', async () => {
    await chrome.storage.local.set({ syncTombstones: {} });

    const code = '// ==UserScript==\n// @name Local Only\n// ==/UserScript==\n// v1';
    const harness = await loadFreshCloudSync(
      [
        {
          id: 'script_local_only',
          code,
          enabled: true,
          position: 0,
          meta: { name: 'Local Only' },
          settings: {},
          syncBaseCode: null,
          createdAt: 1,
          updatedAt: 5,
        },
      ],
      null,
    );
    const { CloudSync, scriptState } = harness;

    await expect(CloudSync.sync()).resolves.toEqual({ success: true });

    expect(scriptState[0].syncBaseCode).toBe(code);
  });

  it('advances the base on a local-newer upload so the next merge is not a false conflict', async () => {
    await chrome.storage.local.set({ syncTombstones: {} });

    const base = '// ==UserScript==\n// @name Drift\n// ==/UserScript==\n// shared';
    const localEdit = '// ==UserScript==\n// @name Drift\n// ==/UserScript==\n// local edit';

    const harness = await loadFreshCloudSync(
      [
        {
          id: 'script_drift',
          code: localEdit,
          enabled: true,
          position: 0,
          meta: { name: 'Drift' },
          settings: {},
          syncBaseCode: base,
          createdAt: 1,
          updatedAt: 20,
        },
      ],
      {
        version: 1,
        timestamp: 10,
        scripts: [
          {
            id: 'script_drift',
            code: base,
            enabled: true,
            position: 0,
            settings: {},
            updatedAt: 10,
            syncBaseCode: base,
          },
        ],
        tombstones: {},
      },
    );
    const { CloudSync, scriptState } = harness;

    await expect(CloudSync.sync()).resolves.toEqual({ success: true });

    // Local won and its code was uploaded, so THAT is the new common ancestor.
    // Leaving the base at `base` is what produced conflict markers on the
    // device's next edit.
    expect(scriptState[0].code).toBe(localEdit);
    expect(scriptState[0].syncBaseCode).toBe(localEdit);
  });

  it('leaves the base alone when the user edits the script during the sync', async () => {
    await chrome.storage.local.set({ syncTombstones: {} });

    const uploaded = '// ==UserScript==\n// @name Racy\n// ==/UserScript==\n// uploaded';
    const harness = await loadFreshCloudSync(
      [
        {
          id: 'script_racy',
          code: uploaded,
          enabled: true,
          position: 0,
          meta: { name: 'Racy' },
          settings: {},
          syncBaseCode: null,
          createdAt: 1,
          updatedAt: 5,
        },
      ],
      null,
    );
    const { CloudSync, provider, scriptState } = harness;

    // Simulate the user saving a new revision while the upload is in flight.
    const midSyncEdit = '// ==UserScript==\n// @name Racy\n// ==/UserScript==\n// edited mid-sync';
    const originalUpload = provider.upload;
    provider.upload = vi.fn(async (...args) => {
      scriptState[0].code = midSyncEdit;
      return originalUpload?.(...args);
    });

    await expect(CloudSync.sync()).resolves.toEqual({ success: true });

    expect(scriptState[0].code).toBe(midSyncEdit);
    // Pinning the uploaded bytes as the base here would make the user's newer
    // edit look like it was already synced.
    expect(scriptState[0].syncBaseCode).toBeNull();
  });

});
