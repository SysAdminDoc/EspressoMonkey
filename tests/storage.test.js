import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { ReadableStream as NodeReadableStream, TransformStream as NodeTransformStream } from 'node:stream/web';

globalThis.ReadableStream = NodeReadableStream;
globalThis.TransformStream = NodeTransformStream;
globalThis.CompressionStream = class CompressionStream {
  constructor(format) {
    if (format !== 'gzip') throw new Error('Only gzip is supported in tests');
    const chunks = [];
    return new TransformStream({
      transform(chunk, controller) {
        void controller;
        chunks.push(Buffer.from(chunk));
      },
      flush(controller) {
        controller.enqueue(new Uint8Array(gzipSync(Buffer.concat(chunks))));
      },
    });
  }
};

globalThis.DecompressionStream = class DecompressionStream {
  constructor(format) {
    if (format !== 'gzip') throw new Error('Only gzip is supported in tests');
    const chunks = [];
    return new TransformStream({
      transform(chunk, controller) {
        void controller;
        chunks.push(Buffer.from(chunk));
      },
      flush(controller) {
        controller.enqueue(new Uint8Array(gunzipSync(Buffer.concat(chunks))));
      },
    });
  }
};

// storage.js is generated as a script-mode runtime artifact, so tests eval it
// in the same global shape background.js uses rather than importing it as ESM.
const storageCode = readFileSync(resolve(__dirname, '../modules/storage.js'), 'utf8');

const _storageBody = storageCode + `
  return {
    SettingsManager,
    ScriptStorage,
    LocalWorkspaceBindings,
    ScriptValues,
    BackupsDAO,
    FolderStorage,
    TabStorage,
    _openTabTrackers,
    setScriptChangeListener
  };
`;
let _storageResult;
try { const vm = require('node:vm'); _storageResult = vm.compileFunction(_storageBody, ['chrome', 'console'], { filename: resolve(__dirname, '../modules/storage.js') })(globalThis.chrome, console); } catch { _storageResult = new Function('chrome', 'console', _storageBody)(globalThis.chrome, console); }

const {
  SettingsManager,
  ScriptStorage,
  LocalWorkspaceBindings,
  ScriptValues,
  BackupsDAO,
  FolderStorage,
  TabStorage,
  _openTabTrackers,
  setScriptChangeListener,
} = _storageResult;

function resetRuntimeCaches() {
  SettingsManager.cache = null;
  ScriptStorage.cache = null;
  ScriptValues.cache = Object.create(null);
  ScriptValues.listeners.clear();
  ScriptValues._initPromises?.clear?.();
  for (const pending of ScriptValues.pendingNotifications.values()) {
    clearTimeout(pending.timeout);
  }
  ScriptValues.pendingNotifications.clear();
  FolderStorage.cache = null;
  TabStorage.data.clear();
  _openTabTrackers.clear();
  setScriptChangeListener(null);
}

beforeEach(() => {
  globalThis.__resetStorageMock();
  resetRuntimeCaches();
  vi.clearAllMocks();
  vi.useRealTimers();
});

afterEach(() => {
  resetRuntimeCaches();
  vi.useRealTimers();
});

function makeScript(id = 'test1', overrides = {}) {
  return {
    id,
    code: '// test',
    meta: { name: 'Test Script', namespace: 'tests', version: '1.0' },
    enabled: true,
    position: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function idbRequest(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    req.onsuccess = () => resolvePromise(req.result);
    req.onerror = () => rejectPromise(req.error || new Error('IndexedDB request failed'));
  });
}

function idbTransactionDone(tx) {
  return new Promise((resolvePromise, rejectPromise) => {
    tx.oncomplete = () => resolvePromise();
    tx.onerror = () => rejectPromise(tx.error || new Error('IndexedDB transaction failed'));
    tx.onabort = () => rejectPromise(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

async function openRawScriptDb() {
  return idbRequest(indexedDB.open('scriptvault'));
}

async function getRawScriptRecord(id) {
  const db = await openRawScriptDb();
  try {
    const tx = db.transaction('scripts', 'readonly');
    return await idbRequest(tx.objectStore('scripts').get(id));
  } finally {
    db.close();
  }
}

async function putRawScriptRecord(record) {
  const db = await openRawScriptDb();
  try {
    const tx = db.transaction('scripts', 'readwrite');
    tx.objectStore('scripts').put(record);
    await idbTransactionDone(tx);
  } finally {
    db.close();
  }
}

describe('generated storage artifact', () => {
  it('is generated from the TypeScript storage source', () => {
    expect(storageCode).toContain('Generated from src/modules/storage.ts');
    expect(storageCode).toContain('const StorageModule = (() => {');
    expect(storageCode).toContain('const SettingsManager = StorageModule.SettingsManager;');
    expect(storageCode).toContain('const ScriptStorage = StorageModule.ScriptStorage;');
    expect(storageCode).toContain('const LocalWorkspaceBindings = StorageModule.LocalWorkspaceBindings;');
    expect(storageCode).toContain('const BackupsDAO = StorageModule.BackupsDAO;');
  });

  it('does not register duplicate notification click/close listeners', () => {
    expect(storageCode).not.toContain('chrome.notifications.onClicked.addListener');
    expect(storageCode).not.toContain('chrome.notifications.onClosed.addListener');
  });
});

describe('SettingsManager', () => {
  it('initializes with shared defaults when no settings are stored', async () => {
    const settings = await SettingsManager.get();

    expect(settings.enabled).toBe(true);
    expect(settings.theme).toBe('dark');
    expect(settings.autoUpdate).toBe(true);
    expect(settings.layout).toBe('dark');
    expect(settings.trashMode).toBe('30');
    expect(settings.experimentalESMUserscripts).toBe(false);
    expect(settings.dashboardVirtualizationThreshold).toBe(500);
    expect(settings.allowInternalXhr).toBe(false);
    expect(settings.allowInternalSyncEndpoints).toBe(false);
    expect(settings.allowHighPrivilegeScriptApis).toBe(false);
    expect(settings.modifyCSP).toBe('auto');
    expect(settings.statsUrlRetention).toBe('origin');
  });

  it('migrates legacy full URLs to origins in IndexedDB and cache', async () => {
    await ScriptStorage.set('alpha', makeScript('alpha', {
      stats: { runs: 1, totalTime: 2, avgTime: 2, lastRun: 3, errors: 0, lastUrl: 'https://example.test/private?q=secret#token' },
    }));
    await chrome.storage.local.set({ settings: { statsUrlRetention: 'full' } });

    const settings = await SettingsManager.get();

    expect(settings.statsUrlRetention).toBe('origin');
    expect((await getRawScriptRecord('alpha')).stats.lastUrl).toBe('https://example.test');
    expect((await ScriptStorage.get('alpha')).stats.lastUrl).toBe('https://example.test');
    const migrationState = await chrome.storage.local.get([
      '_statsUrlRetentionOriginDefaultV1',
      '_statsUrlRetentionRewritePending',
    ]);
    expect(migrationState._statsUrlRetentionOriginDefaultV1).toBe(true);
    expect(migrationState._statsUrlRetentionRewritePending).toBeUndefined();
  });

  it('irreversibly deletes stored URLs when retention moves to none', async () => {
    await SettingsManager.get();
    await SettingsManager.set('statsUrlRetention', 'full');
    await ScriptStorage.set('alpha', makeScript('alpha', {
      stats: { runs: 1, totalTime: 2, avgTime: 2, lastRun: 3, errors: 0, lastUrl: 'https://example.test/private?q=secret' },
    }));

    await SettingsManager.set('statsUrlRetention', 'none');

    expect((await getRawScriptRecord('alpha')).stats).not.toHaveProperty('lastUrl');
    expect((await ScriptStorage.get('alpha')).stats).not.toHaveProperty('lastUrl');
    ScriptStorage.invalidateCache();
    expect((await ScriptStorage.get('alpha')).stats).not.toHaveProperty('lastUrl');
  });

  it('aborts every URL rewrite on IDB failure and retries from its durable marker', async () => {
    await SettingsManager.get();
    await SettingsManager.set('statsUrlRetention', 'full');
    for (const id of ['alpha', 'beta']) {
      await ScriptStorage.set(id, makeScript(id, {
        stats: { runs: 1, totalTime: 2, avgTime: 2, lastRun: 3, errors: 0, lastUrl: `https://${id}.test/private?secret=1` },
      }));
    }

    const originalPut = IDBObjectStore.prototype.put;
    let rewritePuts = 0;
    const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (...args) {
      rewritePuts += 1;
      if (rewritePuts === 2) throw new Error('simulated rewrite failure');
      return originalPut.apply(this, args);
    });
    await expect(SettingsManager.set('statsUrlRetention', 'none')).rejects.toThrow('simulated rewrite failure');
    putSpy.mockRestore();

    expect((await getRawScriptRecord('alpha')).stats.lastUrl).toContain('/private');
    expect((await getRawScriptRecord('beta')).stats.lastUrl).toContain('/private');
    expect((await chrome.storage.local.get('settings')).settings.statsUrlRetention).toBe('none');
    expect((await chrome.storage.local.get('_statsUrlRetentionRewritePending'))._statsUrlRetentionRewritePending).toBe('none');

    SettingsManager.cache = null;
    await SettingsManager.get();
    expect((await getRawScriptRecord('alpha')).stats).not.toHaveProperty('lastUrl');
    expect((await getRawScriptRecord('beta')).stats).not.toHaveProperty('lastUrl');
    expect((await chrome.storage.local.get('_statsUrlRetentionRewritePending'))._statsUrlRetentionRewritePending).toBeUndefined();
  });

  it('merges stored settings with defaults', async () => {
    await chrome.storage.local.set({ settings: { theme: 'oled', customKey: 'test' } });

    const settings = await SettingsManager.get();

    expect(settings.theme).toBe('oled');
    expect(settings.customKey).toBe('test');
    expect(settings.enabled).toBe(true);
  });

  it('returns isolated full and keyed settings snapshots', async () => {
    const settings = await SettingsManager.get();
    settings.deniedHosts.push('mutated.example');
    settings.trustedSigningKeys.demo = { name: 'Demo', addedAt: 1 };

    expect((await SettingsManager.get()).deniedHosts).toEqual([]);
    expect((await SettingsManager.get()).trustedSigningKeys).toEqual({});

    const deniedHosts = await SettingsManager.get('deniedHosts');
    deniedHosts.push('blocked.example');
    expect(await SettingsManager.get('deniedHosts')).toEqual([]);
  });

  it('sets single and bulk values, cloning caller-owned objects', async () => {
    const deniedHosts = ['blocked.example'];

    await SettingsManager.set('theme', 'catppuccin');
    await SettingsManager.set({ debugMode: true, deniedHosts });
    deniedHosts.push('caller-mutated');

    expect(await SettingsManager.get('theme')).toBe('catppuccin');
    expect(await SettingsManager.get('debugMode')).toBe(true);
    expect(await SettingsManager.get('deniedHosts')).toEqual(['blocked.example']);
  });

  it('serializes concurrent set() calls so neither writer clobbers the other', async () => {
    // Regression: two set() calls that each snapshot the cache at call time and
    // then await storage would lose the first writer's change. The serialized
    // write chain must let both survive in cache AND persisted storage.
    await SettingsManager.set({ googleDriveToken: '', theme: 'dark' });
    await Promise.all([
      SettingsManager.set('googleDriveToken', 'refreshed-token'),
      SettingsManager.set('lastSync', 123456),
    ]);
    expect(await SettingsManager.get('googleDriveToken')).toBe('refreshed-token');
    expect(await SettingsManager.get('lastSync')).toBe(123456);
    // The theme set before the race is untouched by either writer.
    expect(await SettingsManager.get('theme')).toBe('dark');
    // Persisted storage reflects both concurrent writes, not just the last one.
    const persisted = (await chrome.storage.local.get('settings')).settings;
    expect(persisted.googleDriveToken).toBe('refreshed-token');
    expect(persisted.lastSync).toBe(123456);
  });

  it('rolls back cache on failed set/reset persistence', async () => {
    await SettingsManager.set({ theme: 'oled', debugMode: false });

    chrome.storage.local.set.mockRejectedValueOnce(new Error('QUOTA'));
    await expect(SettingsManager.set({ theme: 'light', debugMode: true })).rejects.toThrow('QUOTA');
    expect(await SettingsManager.get('theme')).toBe('oled');
    expect(await SettingsManager.get('debugMode')).toBe(false);

    chrome.storage.local.set.mockRejectedValueOnce(new Error('QUOTA'));
    await expect(SettingsManager.reset()).rejects.toThrow('QUOTA');
    expect(await SettingsManager.get('theme')).toBe('oled');
  });

  it('reset() restores fresh nested defaults', async () => {
    await SettingsManager.set({ theme: 'oled', deniedHosts: ['blocked.example'] });
    const reset = await SettingsManager.reset();
    reset.deniedHosts.push('mutated.example');

    expect(await SettingsManager.get('theme')).toBe('dark');
    expect(await SettingsManager.get('deniedHosts')).toEqual([]);
  });

  it('serializes reset() behind an in-flight set() write', async () => {
    const originalSet = chrome.storage.local.set.getMockImplementation();
    let releaseSetWrite;
    chrome.storage.local.set.mockImplementationOnce((items) => new Promise((resolve) => {
      releaseSetWrite = () => {
        Promise.resolve(originalSet(items)).then(resolve);
      };
    }));

    const setPromise = SettingsManager.set('googleDriveToken', 'late-token');
    await vi.waitFor(() => expect(releaseSetWrite).toBeTypeOf('function'));
    const resetPromise = SettingsManager.reset();

    releaseSetWrite();
    await Promise.all([setPromise, resetPromise]);

    expect(await SettingsManager.get('googleDriveToken')).toBe('');
    const persisted = (await chrome.storage.local.get('settings')).settings;
    expect(persisted.googleDriveToken).toBe('');
  });

  it('serializes concurrent cold-start callers', async () => {
    await Promise.all([
      SettingsManager.init(),
      SettingsManager.init(),
      SettingsManager.init(),
      SettingsManager.init(),
      SettingsManager.init(),
    ]);

    expect(chrome.storage.local.get).toHaveBeenCalledTimes(1);
  });
});

describe('ScriptStorage', () => {
  it('initializes empty when no scripts are stored', async () => {
    await expect(ScriptStorage.getAll()).resolves.toEqual([]);
  });

  it('migrates legacy chrome.storage scripts and values into IndexedDB', async () => {
    const alpha = makeScript('alpha', { code: 'const a = "legacy";' });
    await chrome.storage.local.set({
      userscripts: { alpha },
      values_alpha: { count: 7, nested: { ok: true } },
    });

    expect(await ScriptStorage.get('alpha')).toEqual(alpha);
    expect(await ScriptValues.get('alpha', 'count', 0)).toBe(7);
    expect(await ScriptValues.get('alpha', 'nested', null)).toEqual({ ok: true });

    const legacy = await chrome.storage.local.get(['userscripts', 'values_alpha', '_storageSchema', '_v2LegacyTombstone']);
    expect(legacy.userscripts.alpha).toEqual(alpha);
    expect(legacy.values_alpha).toEqual({ count: 7, nested: { ok: true } });
    expect(legacy._storageSchema).toBe(3);
    expect(legacy._v2LegacyTombstone.scriptsMigrated).toBe(1);
    expect(legacy._v2LegacyTombstone.valuesMigrated).toBe(2);
  });

  it('does not clobber v3 GM values when a v3 migration is retried', async () => {
    const alpha = makeScript('alpha', { code: 'const a = "legacy";' });
    await chrome.storage.local.set({
      userscripts: { alpha },
      values_alpha: { count: 7, nested: { ok: true } },
    });

    expect(await ScriptValues.get('alpha', 'count', 0)).toBe(7);
    await ScriptValues.set('alpha', 'count', 42);
    await ScriptValues.set('alpha', 'v3Only', 'fresh');
    await chrome.storage.local.set({ _storageSchema: 0 });
    resetRuntimeCaches();

    expect(await ScriptValues.get('alpha', 'count', 0)).toBe(42);
    expect(await ScriptValues.get('alpha', 'nested', null)).toEqual({ ok: true });
    expect(await ScriptValues.get('alpha', 'v3Only', null)).toBe('fresh');
    const retry = await chrome.storage.local.get('_v2LegacyTombstone');
    expect(retry._v2LegacyTombstone.valuesMigrated).toBe(0);
  });

  it('stores, retrieves, searches, duplicates, and reorders scripts', async () => {
    const alpha = makeScript('alpha', { meta: { name: 'Alpha', namespace: 'tests', version: '1.0' } });
    const beta = makeScript('beta', {
      position: 1,
      meta: { name: 'Beta', namespace: 'tests', version: '1.0', description: 'Second script' },
    });

    await ScriptStorage.set(alpha.id, alpha);
    await ScriptStorage.set(beta.id, beta);

    expect(await ScriptStorage.get('missing')).toBeNull();
    expect(await ScriptStorage.getAll()).toHaveLength(2);
    expect((await ScriptStorage.search('beta')).map((script) => script.id)).toEqual(['beta']);
    expect((await ScriptStorage.getByNamespace('tests')).map((script) => script.id).sort()).toEqual(['alpha', 'beta']);

    await ScriptStorage.reorder(['beta', 'alpha']);
    expect((await ScriptStorage.get('beta')).position).toBe(0);
    expect((await ScriptStorage.get('alpha')).position).toBe(1);

    const copy = await ScriptStorage.duplicate('alpha');
    expect(copy.id).not.toBe('alpha');
    expect(copy.meta.name).toBe('Alpha (Copy)');
  });

  it('returns script copies so caller mutations cannot drift the cache', async () => {
    const alpha = makeScript('alpha', {
      code: '// saved',
      meta: { name: 'Alpha', namespace: 'tests', version: '1.0' },
      settings: { userModified: false },
    });

    const stored = await ScriptStorage.set(alpha.id, alpha);
    alpha.code = '// mutated after set';
    alpha.meta.name = 'Mutated input';
    stored.code = '// mutated returned set';
    stored.meta.name = 'Mutated set return';

    expect(await ScriptStorage.get('alpha')).toMatchObject({
      code: '// saved',
      meta: expect.objectContaining({ name: 'Alpha' }),
    });

    const fetched = await ScriptStorage.get('alpha');
    fetched.code = '// mutated fetched';
    fetched.meta.name = 'Mutated fetched';

    const all = await ScriptStorage.getAll();
    all[0].enabled = false;
    all[0].settings.userModified = true;

    const searched = await ScriptStorage.search('alpha');
    searched[0].code = '// mutated search';

    const namespaced = await ScriptStorage.getByNamespace('tests');
    namespaced[0].meta.name = 'Mutated namespace';

    expect(await ScriptStorage.get('alpha')).toMatchObject({
      code: '// saved',
      enabled: true,
      meta: expect.objectContaining({ name: 'Alpha' }),
      settings: expect.objectContaining({ userModified: false }),
    });
  });

  it('compresses large script bodies in IndexedDB and reads them transparently', async () => {
    const code = [
      '// ==UserScript==',
      '// @name Large Compressible',
      '// ==/UserScript==',
      `const payload = "${'x'.repeat(70 * 1024)}";`,
      'console.log(payload.length);',
    ].join('\n');
    const script = makeScript('large-compressed', { code });

    await ScriptStorage.set(script.id, script);

    const raw = await getRawScriptRecord(script.id);
    expect(raw.codeCompressed).toBe(true);
    expect(raw.code).toBeUndefined();
    expect(raw.codeGzip?.byteLength).toBeGreaterThan(0);
    expect(raw.codeByteSize).toBe(new TextEncoder().encode(code).byteLength);

    await expect(ScriptStorage.get(script.id)).resolves.toMatchObject({ code });
    ScriptStorage.invalidateCache();
    await expect(ScriptStorage.get(script.id)).resolves.toMatchObject({ code });
    expect((await ScriptStorage.getAll()).find((entry) => entry.id === script.id)?.code).toBe(code);
  });

  it('stores small script bodies raw and reads existing uncompressed rows unchanged', async () => {
    const small = makeScript('small-raw', { code: 'console.log("small");' });
    await ScriptStorage.set(small.id, small);

    const rawSmall = await getRawScriptRecord(small.id);
    expect(rawSmall.code).toBe(small.code);
    expect(rawSmall.codeCompressed).not.toBe(true);
    expect(rawSmall.codeGzip).toBeUndefined();

    await ScriptStorage.init();
    const legacyRaw = makeScript('legacy-raw', {
      code: 'console.log("legacy raw");\n'.repeat(3000),
    });
    await putRawScriptRecord(legacyRaw);
    ScriptStorage.invalidateCache();

    expect(await ScriptStorage.get(legacyRaw.id)).toEqual(legacyRaw);
  });

  it('deletes scripts and their value bags atomically through IndexedDB', async () => {
    const script = makeScript('alpha');

    await ScriptStorage.set(script.id, script);
    await ScriptValues.set(script.id, 'draft', true);
    await LocalWorkspaceBindings.put({
      bindingId: 'binding_alpha',
      scriptId: script.id,
      handle: { kind: 'file', name: 'alpha.user.js' },
      displayName: 'alpha.user.js',
      permissionState: 'granted',
      createdAt: 1,
      updatedAt: 1,
    });
    await ScriptStorage.delete(script.id);

    expect(await ScriptStorage.get(script.id)).toBeNull();
    expect(await ScriptValues.get(script.id, 'draft', false)).toBe(false);
    expect(await LocalWorkspaceBindings.getByScript(script.id)).toEqual([]);
  });

  it('clear() removes scripts and all stored values', async () => {
    await ScriptStorage.set('alpha', makeScript('alpha'));
    await ScriptStorage.set('beta', makeScript('beta'));
    await ScriptValues.set('alpha', 'draft', true);
    await ScriptValues.set('beta', 'count', 2);
    await LocalWorkspaceBindings.put({
      bindingId: 'binding_alpha',
      scriptId: 'alpha',
      handle: { kind: 'file', name: 'alpha.user.js' },
      displayName: 'alpha.user.js',
      createdAt: 1,
      updatedAt: 1,
    });

    await ScriptStorage.clear();

    expect(await ScriptStorage.getAll()).toEqual([]);
    expect(await ScriptValues.get('alpha', 'draft', false)).toBe(false);
    expect(await ScriptValues.get('beta', 'count', 0)).toBe(0);
    expect(await LocalWorkspaceBindings.list()).toEqual([]);
  });

  it('notifies the MatchSet hook after script mutations', async () => {
    const listener = vi.fn();
    setScriptChangeListener(listener);

    await ScriptStorage.set('alpha', makeScript('alpha'));
    await ScriptStorage.delete('alpha');
    await ScriptStorage.set('beta', makeScript('beta'));
    await ScriptStorage.clear();

    expect(listener).toHaveBeenCalledTimes(4);

    setScriptChangeListener(null);
    await ScriptStorage.set('gamma', makeScript('gamma'));
    expect(listener).toHaveBeenCalledTimes(4);
  });
});

describe('LocalWorkspaceBindings', () => {
  it('stores handles locally while returning display-safe summaries', async () => {
    const handle = { kind: 'file', name: 'alpha.user.js', absolutePath: 'C:\\Users\\dev\\secret\\alpha.user.js' };

    const summary = await LocalWorkspaceBindings.put({
      bindingId: 'binding_alpha',
      scriptId: 'alpha',
      handle,
      displayName: 'alpha.user.js',
      lastKnownSha256: 'a'.repeat(64),
      lastKnownSize: 128,
      lastKnownModified: 1700000000000,
      permissionState: 'prompt',
      createdAt: 1,
      updatedAt: 1,
      lastRefreshAt: null,
      lastErrorKind: 'permission-prompt',
      lastStatusKind: 'bound',
    });

    expect(summary).toMatchObject({
      bindingId: 'binding_alpha',
      scriptId: 'alpha',
      displayName: 'alpha.user.js',
      lastKnownSize: 128,
      permissionState: 'prompt',
      lastStatusKind: 'bound',
    });
    expect(summary).not.toHaveProperty('handle');
    expect(summary).not.toHaveProperty('absolutePath');
    expect(await LocalWorkspaceBindings.getHandle('binding_alpha')).toEqual(handle);

    const byScript = await LocalWorkspaceBindings.getByScript('alpha');
    expect(byScript).toHaveLength(1);
    expect(byScript[0]).not.toHaveProperty('handle');
  });

  it('deletes local bindings independently from script records', async () => {
    await ScriptStorage.set('alpha', makeScript('alpha'));
    await LocalWorkspaceBindings.put({
      bindingId: 'binding_alpha',
      scriptId: 'alpha',
      handle: { kind: 'file', name: 'alpha.user.js' },
      displayName: 'alpha.user.js',
      createdAt: 1,
      updatedAt: 1,
    });

    await LocalWorkspaceBindings.delete('binding_alpha');

    expect(await LocalWorkspaceBindings.get('binding_alpha')).toBeNull();
    expect(await ScriptStorage.get('alpha')).toMatchObject({ id: 'alpha' });
  });
});

describe('ScriptValues', () => {
  it('stores, lists, reads, and deletes values', async () => {
    await ScriptValues.set('s1', 'count', 1);
    await ScriptValues.setAll('s1', { count: 2, name: 'Alpha' });

    expect(await ScriptValues.get('s1', 'count', 0)).toBe(2);
    expect((await ScriptValues.list('s1')).sort()).toEqual(['count', 'name']);
    expect(await ScriptValues.getAll('s1')).toEqual({ count: 2, name: 'Alpha' });

    await ScriptValues.deleteMultiple('s1', ['name', 'missing']);
    expect(await ScriptValues.getAll('s1')).toEqual({ count: 2 });

    await ScriptValues.delete('s1', 'count');
    expect(await ScriptValues.get('s1', 'count', 'DEFAULT')).toBe('DEFAULT');

    await ScriptValues.set('s1', 'draft', true);
    await ScriptValues.deleteAll('s1');
    expect(await ScriptValues.get('s1', 'draft', false)).toBe(false);
  });

  it('tracks aggregate value metadata for future sync bundles', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      await ScriptValues.set('s1', 'count', 1);
      nowSpy.mockReturnValue(2000);
      await ScriptValues.setAll('s1', { count: 2, name: 'Alpha' });

      const aggregate = await ScriptValues.getAllMetadata('s1');
      expect(aggregate.valueCount).toBe(2);
      expect(aggregate.lastUpdatedAt).toBeGreaterThanOrEqual(2000);
      const keyMetadata = await ScriptValues.getAllKeyMetadata('s1');
      expect(keyMetadata).toEqual({
        count: expect.objectContaining({
          updatedAt: aggregate.lastUpdatedAt,
          clock: {
            ts: aggregate.lastUpdatedAt,
            counter: expect.any(Number),
            deviceId: expect.any(String),
          },
        }),
        name: expect.objectContaining({
          updatedAt: aggregate.lastUpdatedAt,
          clock: {
            ts: aggregate.lastUpdatedAt,
            counter: expect.any(Number),
            deviceId: expect.any(String),
          },
        }),
      });
      expect(keyMetadata.count.clock).toEqual(keyMetadata.name.clock);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('isolates object values at set/get/getAll boundaries', async () => {
    const value = { nested: { items: ['saved'] } };
    const returned = await ScriptValues.set('s1', 'prefs', value);
    value.nested.items.push('caller-mutated');
    returned.nested.items.push('return-mutated');

    const firstRead = await ScriptValues.get('s1', 'prefs', null);
    expect(firstRead).toEqual({ nested: { items: ['saved'] } });

    firstRead.nested.items.push('read-mutated');
    expect(await ScriptValues.get('s1', 'prefs', null)).toEqual({ nested: { items: ['saved'] } });

    const all = await ScriptValues.getAll('s1');
    all.prefs.nested.items.push('getAll-mutated');
    expect(await ScriptValues.get('s1', 'prefs', null)).toEqual({ nested: { items: ['saved'] } });
  });

  it('stores prototype-shaped names and script IDs as data keys', async () => {
    await ScriptValues.setAll('s1', {
      __proto__: { polluted: true },
      constructor: 'ctor-value',
      prototype: 'prototype-value',
    });
    await ScriptValues.set('s1', '__proto__', { polluted: false });

    expect(await ScriptValues.get('s1', '__proto__', null)).toEqual({ polluted: false });
    expect(await ScriptValues.get('s1', 'constructor', null)).toBe('ctor-value');
    expect(Object.getPrototypeOf(ScriptValues.cache.s1)).toBeNull();
    expect(Object.hasOwn(ScriptValues.cache.s1, '__proto__')).toBe(true);

    await ScriptValues.set('__proto__', 'draft', true);
    expect(Object.hasOwn(ScriptValues.cache, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(ScriptValues.cache.__proto__)).toBeNull();
    expect(await ScriptValues.get('__proto__', 'draft', false)).toBe(true);
  });

  it('emits debounced local and tab value-change notifications', async () => {
    const changes = [];
    ScriptValues.addListener('s1', 'listener', (...args) => changes.push(args));
    chrome.tabs.query.mockResolvedValue([{ id: 10 }, { id: 11 }]);

    await ScriptValues.set('s1', 'count', 1, 10);
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(changes).toEqual([['count', undefined, 1, false]]);
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(10, {
      action: 'valueChanged',
      data: { scriptId: 's1', key: 'count', oldValue: undefined, newValue: 1, remote: false },
    });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(11, {
      action: 'valueChanged',
      data: { scriptId: 's1', key: 'count', oldValue: undefined, newValue: 1, remote: true },
    });
  });

  it('prefers the authenticated user-script event dispatcher over the page bridge', async () => {
    const sendDirectEvent = vi.fn().mockReturnValue(true);
    globalThis.__svSendUserScriptEvent = sendDirectEvent;
    chrome.tabs.query.mockResolvedValue([{ id: 10 }]);

    try {
      await ScriptValues.set('s1', 'count', 1, 10);
      await new Promise((resolve) => setTimeout(resolve, 150));
    } finally {
      delete globalThis.__svSendUserScriptEvent;
    }

    expect(sendDirectEvent).toHaveBeenCalledWith(10, 'valueChanged', {
      scriptId: 's1',
      key: 'count',
      newValue: 1,
      hasValue: true,
      remote: false,
    });
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('reports UTF-8 storage size', async () => {
    await ScriptValues.setAll('s1', { ascii: 'abc', unicode: '✓' });

    expect(await ScriptValues.getStorageSize('s1')).toBe(new TextEncoder().encode(JSON.stringify({
      ascii: 'abc',
      unicode: '✓',
    })).length);
  });
});

describe('FolderStorage and TabStorage', () => {
  it('creates, updates, deletes, and moves folder membership', async () => {
    const folder = await FolderStorage.create('Pinned', '#ff0000');

    expect(folder.name).toBe('Pinned');
    expect(folder.scriptIds).toEqual([]);

    await FolderStorage.addScript(folder.id, 'script1');
    await FolderStorage.addScript(folder.id, 'script1');
    expect(FolderStorage.getFolderForScript('script1').id).toBe(folder.id);
    expect(FolderStorage.getFolderForScript('script1').scriptIds).toEqual(['script1']);

    await FolderStorage.update(folder.id, { name: 'Updated', collapsed: true });
    expect(FolderStorage.getFolderForScript('script1').name).toBe('Updated');
    expect(FolderStorage.getFolderForScript('script1').collapsed).toBe(true);

    const second = await FolderStorage.create('Second');
    await FolderStorage.moveScript('script1', folder.id, second.id);
    expect(FolderStorage.getFolderForScript('script1').id).toBe(second.id);

    await FolderStorage.removeScript(second.id, 'script1');
    expect(FolderStorage.getFolderForScript('script1')).toBeNull();

    await FolderStorage.delete(folder.id);
    expect((await FolderStorage.getAll()).some((item) => item.id === folder.id)).toBe(false);
  });

  it('rolls folder cache back on failed persistence', async () => {
    chrome.storage.local.set.mockRejectedValueOnce(new Error('QUOTA'));
    await expect(FolderStorage.create('Unsaved')).rejects.toThrow('QUOTA');
    expect(await FolderStorage.getAll()).toEqual([]);

    const folder = await FolderStorage.create('Original', '#111111');

    chrome.storage.local.set.mockRejectedValueOnce(new Error('QUOTA'));
    await expect(FolderStorage.update(folder.id, { name: 'Changed', color: '#222222' })).rejects.toThrow('QUOTA');
    expect((await FolderStorage.getAll())[0]).toMatchObject({ name: 'Original', color: '#111111' });

    chrome.storage.local.set.mockRejectedValueOnce(new Error('QUOTA'));
    await expect(FolderStorage.addScript(folder.id, 'script1')).rejects.toThrow('QUOTA');
    expect(FolderStorage.getFolderForScript('script1')).toBeNull();

    chrome.storage.local.set.mockRejectedValueOnce(new Error('QUOTA'));
    await expect(FolderStorage.delete(folder.id)).rejects.toThrow('QUOTA');
    expect((await FolderStorage.getAll()).map((item) => item.id)).toEqual([folder.id]);
  });

  it('stores transient per-tab data in memory', () => {
    TabStorage.set(7, { open: true });
    TabStorage.set(8, { open: false });

    expect(TabStorage.get(7)).toEqual({ open: true });
    expect(TabStorage.getAll()).toEqual({ 7: { open: true }, 8: { open: false } });

    TabStorage.delete(7);
    expect(TabStorage.get(7)).toEqual({});
  });
});
