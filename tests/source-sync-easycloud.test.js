import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalCrypto = globalThis.crypto;
const originalFetch = globalThis.fetch;
const originalRegisterScript = globalThis.registerScript;
const originalUnregisterScript = globalThis.unregisterScript;
const originalUpdateBadge = globalThis.updateBadge;

async function loadFreshEasyCloud(initialScripts = [], settingsOverride = {}) {
  vi.resetModules();

  const scriptState = initialScripts.map((script) => structuredClone(script));
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
      syncEncryptionEnabled: false,
      syncEncryptionPassphrase: '',
      ...settingsOverride,
    })),
    set: vi.fn(async () => {}),
  };

  const registerScript = vi.fn().mockResolvedValue();
  const unregisterScript = vi.fn().mockResolvedValue();
  const updateBadge = vi.fn().mockResolvedValue();

  globalThis.registerScript = registerScript;
  globalThis.unregisterScript = unregisterScript;
  globalThis.updateBadge = updateBadge;
  globalThis.ScriptStorage = ScriptStorage;
  globalThis.SettingsManager = SettingsManager;

  vi.doMock('../src/modules/storage.ts', () => ({
    ScriptStorage,
    SettingsManager,
  }));

  const mod = await import('../src/modules/sync-easycloud.ts');
  return {
    EasyCloudSync: mod.EasyCloudSync,
    SettingsManager,
    ScriptStorage,
    scriptState,
    registerScript,
    unregisterScript,
    updateBadge,
  };
}

beforeEach(() => {
  globalThis.__resetStorageMock();
  vi.clearAllMocks();
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true });
  globalThis.fetch = originalFetch;
  globalThis.registerScript = originalRegisterScript;
  globalThis.unregisterScript = originalUnregisterScript;
  globalThis.updateBadge = originalUpdateBadge;
  Reflect.deleteProperty(globalThis, 'ScriptStorage');
  Reflect.deleteProperty(globalThis, 'SettingsManager');
  Reflect.deleteProperty(globalThis, '__scriptVaultSyncEngineLock');
});

describe('source easycloud sync module', () => {
  it('schedules debounce sync work through chrome alarms after a script save', async () => {
    const { EasyCloudSync } = await loadFreshEasyCloud();

    EasyCloudSync.notifyScriptSaved('script-1');

    expect(chrome.alarms.create).toHaveBeenCalledWith(
      'easycloud-debounce-sync',
      expect.objectContaining({
        delayInMinutes: 5000 / 60000,
      }),
    );
  });

  it('skips native sync when another sync engine holds the shared lock', async () => {
    await chrome.storage.local.set({ easycloud_connected: true });
    globalThis.__scriptVaultSyncEngineLock = {
      owner: 'cloud-sync',
      token: Symbol('cloud-sync'),
      startedAt: Date.now(),
    };
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    const { EasyCloudSync } = await loadFreshEasyCloud();

    const result = await EasyCloudSync.sync();

    expect(result).toEqual({ skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an oversized EasyCloud backup before parsing or applying it', async () => {
    await chrome.storage.local.set({
      easycloud_connected: true,
      syncTombstones: {},
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ files: [{ id: 'drive-file-id' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('{}', {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(64 * 1024 * 1024 + 1),
          },
        }),
      );
    globalThis.fetch = fetchMock;

    const { EasyCloudSync, ScriptStorage } = await loadFreshEasyCloud();
    const result = await EasyCloudSync.sync();

    expect(result.error).toMatch(/EasyCloud backup exceeds the 64 MB limit/);
    expect(ScriptStorage.set).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('runs a sync when the debounce alarm fires', async () => {
    chrome.storage.local.set({
      easycloud_connected: false,
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ files: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ files: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ files: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ files: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'drive-file-id' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    globalThis.fetch = fetchMock;

    const { EasyCloudSync, SettingsManager } = await loadFreshEasyCloud();
    await EasyCloudSync.init();
    await chrome.storage.local.set({ easycloud_connected: true });

    const alarmHandler = chrome.alarms.onAlarm.addListener.mock.calls.at(-1)?.[0];
    expect(typeof alarmHandler).toBe('function');

    alarmHandler({ name: 'easycloud-debounce-sync' });

    await vi.waitFor(() => {
      expect(chrome.identity.getAuthToken).toHaveBeenCalledWith(
        expect.objectContaining({ interactive: false }),
      );
    });
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
          }),
        }),
      );
      expect(SettingsManager.set).toHaveBeenCalledWith('lastSync', expect.any(Number));
    });
  });

  it('skips debounce work when disconnected instead of acquiring a token', async () => {
    await chrome.storage.local.set({ easycloud_connected: false });
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    const { EasyCloudSync } = await loadFreshEasyCloud();
    await EasyCloudSync.init();

    const alarmHandler = chrome.alarms.onAlarm.addListener.mock.calls.at(-1)?.[0];
    expect(typeof alarmHandler).toBe('function');
    alarmHandler({ name: 'easycloud-debounce-sync' });

    await vi.waitFor(() => {
      expect(fetchMock).not.toHaveBeenCalled();
      expect(chrome.identity.getAuthToken).not.toHaveBeenCalled();
    });
  });

  it('returns Drive quota backoff metadata instead of treating quota as an auth failure', async () => {
    await chrome.storage.local.set({ easycloud_connected: true });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        code: 403,
        errors: [{ reason: 'userRateLimitExceeded' }],
      },
    }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '5',
      },
    }));
    globalThis.fetch = fetchMock;

    const { EasyCloudSync } = await loadFreshEasyCloud();
    await expect(EasyCloudSync.sync()).resolves.toMatchObject({
      rateLimited: true,
      retryAfterMs: 5000,
      error: expect.stringContaining('rate limited (403)'),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clears pending debounce alarms on disconnect', async () => {
    const { EasyCloudSync } = await loadFreshEasyCloud();

    await EasyCloudSync.disconnect();

    expect(chrome.alarms.clear).toHaveBeenCalledWith('easycloud-periodic-sync');
    expect(chrome.alarms.clear).toHaveBeenCalledWith('easycloud-debounce-sync');
  });

  it('revokes the OAuth token via POST body, never in the revoke URL query', () => {
    // Mirrors the regular Google Drive provider fix (2026-06-04 audit): the
    // access token must not appear in the request line / URL where it can leak
    // into proxy logs or history.
    const source = readFileSync(resolve(process.cwd(), 'src/modules/sync-easycloud.ts'), 'utf8');
    const runtime = readFileSync(resolve(process.cwd(), 'modules/sync-easycloud.js'), 'utf8');
    for (const text of [source, runtime]) {
      expect(text).toContain("body: `token=${encodeURIComponent(_cachedToken)}`");
      expect(text).not.toMatch(/oauth2\/revoke\?token=/);
    }
  });

  it('removes tombstoned local scripts and refreshes runtime registration during sync', async () => {
    await chrome.storage.local.set({
      easycloud_connected: true,
      syncTombstones: {},
    });

    const tombstoneTimestamp = Date.now() - 1000;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ files: [{ id: 'drive-file-id' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            version: 1,
            timestamp: 50,
            deviceId: 'remote-device',
            scripts: [],
            tombstones: { script_alpha: tombstoneTimestamp },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'drive-file-id' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    globalThis.fetch = fetchMock;

    const harness = await loadFreshEasyCloud([
      {
        id: 'script_alpha',
        code: '// ==UserScript==\n// @name Alpha\n// ==/UserScript==',
        meta: { name: 'Alpha' },
        enabled: true,
        position: 0,
        settings: {},
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const {
      EasyCloudSync,
      ScriptStorage,
      scriptState,
      unregisterScript,
      updateBadge,
    } = harness;

    const result = await EasyCloudSync.sync();

    expect(result.success).toBe(true);
    expect(ScriptStorage.delete).toHaveBeenCalledWith('script_alpha');
    expect(unregisterScript).toHaveBeenCalledWith('script_alpha');
    expect(updateBadge).toHaveBeenCalledTimes(1);
    expect(scriptState).toEqual([]);
  });

  it('resurrects a restored-from-trash script newer than a remote tombstone (does not re-delete)', async () => {
    await chrome.storage.local.set({
      easycloud_connected: true,
      syncTombstones: {},
    });

    const tombstoneTimestamp = Date.now() - 1000;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ files: [{ id: 'drive-file-id' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            version: 1,
            timestamp: 50,
            deviceId: 'remote-device',
            scripts: [],
            tombstones: { script_alpha: tombstoneTimestamp },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'drive-file-id' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    globalThis.fetch = fetchMock;

    // Local script was restored from trash with an updatedAt NEWER than the
    // recent remote tombstone, so the restore must win.
    const harness = await loadFreshEasyCloud([
      {
        id: 'script_alpha',
        code: '// ==UserScript==\n// @name Alpha\n// ==/UserScript==',
        meta: { name: 'Alpha' },
        enabled: true,
        position: 0,
        settings: {},
        createdAt: 1,
        updatedAt: tombstoneTimestamp + 1000,
      },
    ]);
    const { EasyCloudSync, ScriptStorage, scriptState } = harness;

    const result = await EasyCloudSync.sync();

    expect(result.success).toBe(true);
    expect(ScriptStorage.delete).not.toHaveBeenCalledWith('script_alpha');
    expect(scriptState.map((s) => s.id)).toEqual(['script_alpha']);
    // The tombstone was cleared locally.
    const persisted = (await chrome.storage.local.get('syncTombstones')).syncTombstones;
    expect(persisted).toEqual({});
  });

  it('prunes stale remote tombstones before the EasyCloud round-trip upload', async () => {
    await chrome.storage.local.set({
      easycloud_connected: true,
      syncTombstones: {},
    });
    const staleTombstone = Date.now() - (31 * 24 * 60 * 60 * 1000);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ files: [{ id: 'drive-file-id' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            version: 1,
            timestamp: Date.now(),
            deviceId: 'remote-device',
            scripts: [],
            tombstones: { stale_script: staleTombstone },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'drive-file-id' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    globalThis.fetch = fetchMock;

    const { EasyCloudSync } = await loadFreshEasyCloud([]);
    await expect(EasyCloudSync.sync()).resolves.toMatchObject({ success: true });

    const uploadCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/upload/drive/v3/files/') &&
      String(url).includes('uploadType=multipart'),
    );
    expect(uploadCall).toBeTruthy();
    expect(uploadCall[1].body).toContain('"tombstones":{}');
    await expect(chrome.storage.local.get('syncTombstones')).resolves.toEqual({
      syncTombstones: {},
    });
  });

  it('keeps the local-only code edit when EasyCloud remote metadata is newer', async () => {
    await chrome.storage.local.set({
      easycloud_connected: true,
      syncTombstones: {},
    });

    const baseCode = '// ==UserScript==\n// @name Easy One Side\n// ==/UserScript==\n// base';
    const localCode = '// ==UserScript==\n// @name Easy One Side\n// ==/UserScript==\n// local code edit';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ files: [{ id: 'drive-file-id' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            version: 1,
            timestamp: 20,
            deviceId: 'remote-device',
            scripts: [
              {
                id: 'script_easy_local',
                code: baseCode,
                enabled: false,
                position: 7,
                settings: { notes: 'remote metadata' },
                syncBaseCode: baseCode,
                updatedAt: 20,
              },
            ],
            tombstones: {},
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'drive-file-id' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    globalThis.fetch = fetchMock;

    const { EasyCloudSync, scriptState } = await loadFreshEasyCloud([
      {
        id: 'script_easy_local',
        code: localCode,
        meta: { name: 'Easy One Side' },
        enabled: true,
        position: 0,
        settings: { notes: 'local note' },
        syncBaseCode: baseCode,
        createdAt: 1,
        updatedAt: 10,
      },
    ]);

    const result = await EasyCloudSync.sync();

    expect(result.success).toBe(true);
    expect(scriptState).toEqual([
      expect.objectContaining({
        id: 'script_easy_local',
        code: localCode,
        enabled: false,
        position: 7,
        updatedAt: 20,
        syncBaseCode: localCode,
      }),
    ]);
  });

  it('keeps the remote-only code edit when EasyCloud local metadata is newer', async () => {
    await chrome.storage.local.set({
      easycloud_connected: true,
      syncTombstones: {},
    });

    const baseCode = '// ==UserScript==\n// @name Easy Remote Side\n// ==/UserScript==\n// base';
    const remoteCode = '// ==UserScript==\n// @name Easy Remote Side\n// ==/UserScript==\n// remote code edit';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ files: [{ id: 'drive-file-id' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            version: 1,
            timestamp: 20,
            deviceId: 'remote-device',
            scripts: [
              {
                id: 'script_easy_remote',
                code: remoteCode,
                enabled: true,
                position: 1,
                settings: { notes: 'remote note' },
                syncBaseCode: baseCode,
                updatedAt: 20,
              },
            ],
            tombstones: {},
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'drive-file-id' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    globalThis.fetch = fetchMock;

    const { EasyCloudSync, scriptState } = await loadFreshEasyCloud([
      {
        id: 'script_easy_remote',
        code: baseCode,
        meta: { name: 'Easy Remote Side' },
        enabled: false,
        position: 9,
        settings: { notes: 'local metadata' },
        syncBaseCode: baseCode,
        createdAt: 1,
        updatedAt: 30,
      },
    ]);

    const result = await EasyCloudSync.sync();

    expect(result.success).toBe(true);
    expect(scriptState).toEqual([
      expect.objectContaining({
        id: 'script_easy_remote',
        code: remoteCode,
        enabled: false,
        position: 9,
        updatedAt: 30,
        syncBaseCode: remoteCode,
      }),
    ]);
  });

  it('uploads only sync-safe per-script settings to EasyCloud', async () => {
    await chrome.storage.local.set({
      easycloud_connected: true,
      syncTombstones: {},
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ files: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ files: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'drive-file-id' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    globalThis.fetch = fetchMock;

    const { EasyCloudSync } = await loadFreshEasyCloud([
      {
        id: 'script_settings',
        code: '// ==UserScript==\n// @name Settings\n// ==/UserScript==',
        meta: { name: 'Settings' },
        enabled: true,
        position: 0,
        settings: {
          runAt: 'document-start',
          notes: 'portable note',
          syncValues: true,
          userModified: true,
          mergeConflict: true,
          _registrationError: 'local registration failed',
          localWorkspaceBindingId: 'binding-local',
          localFilePath: 'C:\\Users\\dev\\secret\\local.user.js',
        },
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    const result = await EasyCloudSync.sync();
    const uploadCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/upload/drive/v3/files?uploadType=multipart'),
    );

    expect(result.success).toBe(true);
    expect(uploadCall).toBeTruthy();
    const body = uploadCall[1].body;
    expect(body).toContain('"runAt":"document-start"');
    expect(body).toContain('"notes":"portable note"');
    expect(body).toContain('"syncValues":true');
    expect(body).not.toContain('"values"');
    expect(body).not.toContain('"storage"');
    expect(body).not.toContain('userModified');
    expect(body).not.toContain('mergeConflict');
    expect(body).not.toContain('_registrationError');
    expect(body).not.toContain('binding-local');
    expect(body).not.toContain('secret\\\\local.user.js');
  });

  it('marks sync encryption established after reading an encrypted EasyCloud envelope', async () => {
    await chrome.storage.local.set({
      easycloud_connected: true,
      syncTombstones: {},
    });

    const { SyncCrypto } = await import('../src/modules/sync-crypto.ts');
    const remoteEnvelope = await SyncCrypto.prepareSyncEnvelopeForUpload(
      {
        version: 1,
        timestamp: 20,
        scripts: [
          {
            id: 'script_remote',
            code: '// ==UserScript==\n// @name Remote\n// ==/UserScript==\n// encrypted remote',
            enabled: true,
            position: 0,
            settings: {},
            updatedAt: 20,
            syncBaseCode: null,
          },
        ],
        tombstones: {},
      },
      {
        syncEncryptionEnabled: true,
        syncEncryptionPassphrase: 'easycloud passphrase',
        syncEncryptionKdfIterations: 2,
      },
    );

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ files: [{ id: 'drive-file-id', modifiedTime: '2026-07-08T00:00:00Z' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(remoteEnvelope),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'drive-file-id', modifiedTime: '2026-07-08T00:00:00Z' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'drive-file-id' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    globalThis.fetch = fetchMock;

    const { EasyCloudSync, SettingsManager, scriptState } = await loadFreshEasyCloud(
      [],
      {
        syncEncryptionEnabled: true,
        syncEncryptionPassphrase: 'easycloud passphrase',
        syncEncryptionKdfIterations: 2,
        syncEncryptionEstablished: false,
      },
    );

    const result = await EasyCloudSync.sync();

    expect(result.success).toBe(true);
    expect(SettingsManager.set).toHaveBeenCalledWith('syncEncryptionEstablished', true);
    expect(scriptState).toEqual([
      expect.objectContaining({
        id: 'script_remote',
        code: expect.stringContaining('// encrypted remote'),
        syncBaseCode: expect.stringContaining('// encrypted remote'),
      }),
    ]);
  });

  it('encrypts EasyCloud Drive uploads when sync encryption is enabled', async () => {
    await chrome.storage.local.set({
      easycloud_connected: true,
      syncTombstones: {},
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ files: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ files: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'drive-file-id' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    globalThis.fetch = fetchMock;

    const { EasyCloudSync, SettingsManager } = await loadFreshEasyCloud(
      [
        {
          id: 'script_secret',
          code: '// ==UserScript==\n// @name Secret\n// ==/UserScript==\nconst token = "easycloud-secret";',
          meta: { name: 'Secret' },
          enabled: true,
          position: 0,
          settings: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      {
        syncEncryptionEnabled: true,
        syncEncryptionPassphrase: 'easycloud passphrase',
        syncEncryptionKdfIterations: 2,
      },
    );

    const result = await EasyCloudSync.sync();
    const uploadCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/upload/drive/v3/files?uploadType=multipart'),
    );

    expect(result.success).toBe(true);
    expect(uploadCall).toBeTruthy();
    const body = uploadCall[1].body;
    expect(body).toContain('"encrypted":true');
    expect(body).toContain('"algorithm":"AES-256-GCM"');
    expect(body).not.toContain('easycloud-secret');
    expect(SettingsManager.set).toHaveBeenCalledWith('syncEncryptionEstablished', true);
  });
});
