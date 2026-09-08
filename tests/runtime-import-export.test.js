import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  normalizeLocalLibrarySnapshots,
  verifyLocalLibrarySnapshots,
} from '../src/background/local-libraries.ts';
import { ScriptConfig } from '../src/modules/script-config.ts';

const backgroundCoreCode = readFileSync(resolve(process.cwd(), 'background.core.js'), 'utf8');
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function makeFakeFflate() {
  return {
    strToU8(str) {
      return encoder.encode(str);
    },
    strFromU8(data) {
      return decoder.decode(data);
    },
    zipSync(files) {
      const serialized = Object.fromEntries(
        Object.entries(files).map(([name, bytes]) => [name, Array.from(bytes)]),
      );
      return encoder.encode(JSON.stringify(serialized));
    },
    unzipSync(data, opts = {}) {
      const parsed = JSON.parse(decoder.decode(data));
      const files = {};
      for (const [name, rawEntry] of Object.entries(parsed)) {
        const bytes = Array.isArray(rawEntry) ? rawEntry : rawEntry.bytes || [];
        const dataBytes = Uint8Array.from(bytes);
        const meta = {
          name,
          size: Array.isArray(rawEntry) ? dataBytes.byteLength : rawEntry.size ?? dataBytes.byteLength,
          originalSize: Array.isArray(rawEntry) ? dataBytes.byteLength : rawEntry.originalSize ?? dataBytes.byteLength,
          compression: Array.isArray(rawEntry) ? 0 : rawEntry.compression ?? 0,
        };
        if (opts.filter && opts.filter(meta) === false) continue;
        files[name] = dataBytes;
      }
      return files;
    },
  };
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function fakeZipBytes(entries) {
  return encoder.encode(JSON.stringify(entries));
}

function textEntry(text, meta = {}) {
  return {
    bytes: Array.from(encoder.encode(text)),
    ...meta,
  };
}

function userscriptText(name = 'Bounded Script') {
  return [
    '// ==UserScript==',
    `// @name ${name}`,
    '// @namespace scriptvault/bounded',
    '// @version 1.0.0',
    '// @match https://example.com/*',
    '// ==/UserScript==',
    'console.log("bounded");',
  ].join('\n');
}

function makeScript(id, name) {
  return {
    id,
    code: [
      '// ==UserScript==',
      `// @name ${name}`,
      `// @namespace scriptvault/${id}`,
      '// @version 1.0.0',
      '// @match https://example.com/*',
      '// ==/UserScript==',
      `console.log('${name}');`,
    ].join('\n'),
    enabled: false,
    position: 0,
    createdAt: 1,
    updatedAt: 2,
    meta: {
      name,
      namespace: `scriptvault/${id}`,
      version: '1.0.0',
      description: `${name} script`,
      author: 'QA',
      match: ['https://example.com/*'],
      include: [],
      exclude: [],
      grant: ['none'],
      require: [],
      resource: {},
      'run-at': 'document-idle',
    },
  };
}

function cloneValue(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function extractRuntimeImportExportCode() {
  const parserStart = backgroundCoreCode.indexOf('function parseUserscript');
  const parserEnd = backgroundCoreCode.indexOf('// URL Matching', parserStart);
  const importStart = backgroundCoreCode.indexOf('const ARCHIVE_MAX_SCRIPT_BYTES');
  const importEnd = backgroundCoreCode.indexOf('// Message Handlers', importStart);

  if ([parserStart, parserEnd, importStart, importEnd].some(index => index === -1)) {
    throw new Error('Unable to extract runtime import/export code from background.core.js');
  }

  return `${backgroundCoreCode.slice(parserStart, parserEnd)}\n${backgroundCoreCode.slice(importStart, importEnd)}`;
}

function createRuntimeHarness(existingScripts = [], storedValuesByScript = {}, settings = { enabled: true }, storageLocalState = {}, runtimeConsole = console) {
  const fakeFflate = makeFakeFflate();
  let generatedIdCounter = 1;
  const scriptCache = new Map(existingScripts.map(script => [script.id, structuredClone(script)]));
  const valueCache = new Map(
    Object.entries(storedValuesByScript).map(([id, values]) => [id, structuredClone(values)]),
  );
  const chromeStorage = structuredClone(storageLocalState);

  const ScriptStorage = {
    getAll: vi.fn(async () => Array.from(scriptCache.values()).map(script => structuredClone(script))),
    get: vi.fn(async id => structuredClone(scriptCache.get(id) || null)),
    set: vi.fn(async (id, script) => {
      scriptCache.set(id, structuredClone(script));
      return script;
    }),
  };
  const ScriptValues = {
    getAll: vi.fn(async id => structuredClone(valueCache.get(id) || {})),
    setAll: vi.fn(async (id, values) => {
      valueCache.set(id, structuredClone(values));
    }),
    deleteAll: vi.fn(async (id) => {
      valueCache.delete(id);
    }),
  };
  const SettingsManager = {
    get: vi.fn(async () => structuredClone(settings)),
    set: vi.fn(),
  };
  const chrome = {
    storage: {
      local: {
        get: vi.fn(async (keys) => {
          if (typeof keys === 'string') return { [keys]: cloneValue(chromeStorage[keys]) };
          if (Array.isArray(keys)) {
            return Object.fromEntries(keys.map(key => [key, cloneValue(chromeStorage[key])]));
          }
          if (keys && typeof keys === 'object') {
            return Object.fromEntries(
              Object.entries(keys).map(([key, fallback]) => [
                key,
                Object.prototype.hasOwnProperty.call(chromeStorage, key)
                  ? cloneValue(chromeStorage[key])
                  : cloneValue(fallback),
              ]),
            );
          }
          return cloneValue(chromeStorage);
        }),
        set: vi.fn(async (entries) => {
          Object.entries(entries || {}).forEach(([key, value]) => {
            chromeStorage[key] = cloneValue(value);
          });
        }),
      },
    },
  };
  globalThis.chrome = chrome;
  const registerAllScripts = vi.fn().mockResolvedValue();
  const updateBadge = vi.fn().mockResolvedValue();
  const generateId = vi.fn(() => `generated_script_${generatedIdCounter++}`);

  const _body = `${extractRuntimeImportExportCode()}; return { exportAllScripts, exportToZip, importFromZip, importScripts, importVendorBackup, recordImportedScriptTrustReview };`;
  let fn;
  try { const vm = require('node:vm'); fn = vm.compileFunction(_body, ['fflate', 'ScriptStorage', 'ScriptValues', 'SettingsManager', 'registerAllScripts', 'updateBadge', 'generateId', 'chrome', 'LocalLibraries', 'ScriptConfig', 'console'], { filename: resolve(process.cwd(), 'background.core.js') }); } catch { fn = new Function('fflate', 'ScriptStorage', 'ScriptValues', 'SettingsManager', 'registerAllScripts', 'updateBadge', 'generateId', 'chrome', 'LocalLibraries', 'ScriptConfig', 'console', _body); }

  return {
    ...fn(
      fakeFflate,
      ScriptStorage,
      ScriptValues,
      SettingsManager,
      registerAllScripts,
      updateBadge,
      generateId,
      chrome,
      { normalizeLocalLibrarySnapshots, verifyLocalLibrarySnapshots },
      ScriptConfig,
      runtimeConsole,
    ),
    fakeFflate,
    generateId,
    ScriptStorage,
    ScriptValues,
    SettingsManager,
    registerAllScripts,
    updateBadge,
    chrome,
    chromeStorage,
    scriptCache,
    valueCache,
  };
}

describe('vendor backup import trust boundary', () => {
  it('quarantines enabled Tampermonkey text imports before registration', async () => {
    const harness = createRuntimeHarness();

    const result = await harness.importVendorBackup('tampermonkey', userscriptText('TM Import'), {
      overwrite: true,
      sourceLabel: 'TM fixture',
    });

    expect(result).toMatchObject({
      imported: 1,
      quarantinedScripts: 1,
      preservedDisabledScripts: 0,
      trustedEnabledScripts: 0,
    });
    const imported = Array.from(harness.scriptCache.values())[0];
    expect(imported).toMatchObject({
      enabled: false,
      settings: {
        _importQuarantine: {
          source: 'import-tampermonkey',
          sourceLabel: 'TM fixture',
          archiveEnabled: true,
        },
      },
    });
    expect(harness.registerAllScripts).toHaveBeenCalledTimes(1);
    expect(harness.ScriptStorage.set.mock.invocationCallOrder[0])
      .toBeLessThan(harness.registerAllScripts.mock.invocationCallOrder[0]);
  });

  it('preserves disabled VM scripts and quarantines enabled VM scripts', async () => {
    const harness = createRuntimeHarness();
    const enabledCode = userscriptText('VM Enabled');
    const disabledCode = userscriptText('VM Disabled').replace(
      'scriptvault/bounded',
      'scriptvault/disabled',
    );

    const result = await harness.importVendorBackup('violentmonkey', JSON.stringify({
      scripts: [
        { props: { name: 'VM Enabled' }, config: { enabled: true }, code: enabledCode },
        { props: { name: 'VM Disabled' }, config: { enabled: false }, code: disabledCode },
      ],
    }));

    expect(result).toMatchObject({
      imported: 2,
      quarantinedScripts: 1,
      preservedDisabledScripts: 1,
      trustedEnabledScripts: 0,
    });
    const scripts = Array.from(harness.scriptCache.values());
    expect(scripts.find(script => script.meta.name === 'VM Enabled')).toMatchObject({
      enabled: false,
      settings: { _importQuarantine: expect.any(Object) },
    });
    expect(scripts.find(script => script.meta.name === 'VM Disabled')).toMatchObject({
      enabled: false,
      settings: {},
    });
  });

  it('records an explicit reviewed trust decision for vendor imports', async () => {
    const harness = createRuntimeHarness();

    const result = await harness.importVendorBackup('greasemonkey', JSON.stringify([{
      name: 'GM Trusted',
      enabled: true,
      source: userscriptText('GM Trusted'),
    }]), {
      trustImportedScripts: true,
      sourceLabel: 'Reviewed GM fixture',
    });

    expect(result).toMatchObject({
      imported: 1,
      quarantinedScripts: 0,
      preservedDisabledScripts: 0,
      trustedEnabledScripts: 1,
    });
    const imported = Array.from(harness.scriptCache.values())[0];
    expect(imported).toMatchObject({
      enabled: true,
      settings: {
        _importTrust: {
          source: 'import-greasemonkey',
          sourceLabel: 'Reviewed GM fixture',
          archiveEnabled: true,
          reviewedAt: expect.any(Number),
        },
      },
    });
    expect(imported.settings).not.toHaveProperty('_importQuarantine');
  });

  it('turns a manual enable review into a durable trust record', () => {
    const harness = createRuntimeHarness();
    const reviewed = harness.recordImportedScriptTrustReview({
      notes: 'keep',
      _importQuarantine: {
        source: 'import-tampermonkey',
        sourceLabel: 'TM fixture',
        importedAt: 1,
        archiveEnabled: true,
      },
    });

    expect(reviewed).toMatchObject({
      notes: 'keep',
      _importTrust: {
        source: 'import-tampermonkey',
        sourceLabel: 'TM fixture',
        reviewedAt: expect.any(Number),
        archiveEnabled: true,
      },
    });
    expect(reviewed).not.toHaveProperty('_importQuarantine');
  });

  it('preserves existing settings while quarantining overwritten vendor code', async () => {
    const existing = makeScript('script_existing', 'Existing Script');
    existing.enabled = true;
    existing.settings = { notes: 'keep me', pinned: true };
    const harness = createRuntimeHarness([existing]);
    const replacement = userscriptText('Existing Script').replace(
      'scriptvault/bounded',
      'scriptvault/script_existing',
    );

    const result = await harness.importVendorBackup('tampermonkey', replacement, { overwrite: true });

    expect(result).toMatchObject({ imported: 1, quarantinedScripts: 1 });
    expect(harness.scriptCache.get('script_existing')).toMatchObject({
      id: 'script_existing',
      enabled: false,
      settings: {
        notes: 'keep me',
        pinned: true,
        _importQuarantine: expect.any(Object),
      },
    });
  });

  it('maps VM per-script state and reports unsupported or prototype-polluting fields', async () => {
    const harness = createRuntimeHarness();
    const code = userscriptText('VM Configured').replace(
      '// @match https://example.com/*',
      [
        '// @match https://example.com/*',
        '// @var text theme "Theme" "light"',
      ].join('\n'),
    );
    const custom = JSON.parse('{"theme":"dark","__proto__":{"polluted":true}}');
    const result = await harness.importVendorBackup('violentmonkey', JSON.stringify({
      scripts: [{
        props: { name: 'VM Configured' },
        config: {
          enabled: true,
          runAt: 'document-start',
          userIncludes: ['https://example.com/custom/*'],
          userExcludes: ['https://example.com/custom/private/*'],
          userMatches: ['https://example.com/custom-match/*'],
          userConfig: { theme: 'dark' },
          unsupportedSetting: true,
        },
        custom,
        values: { remembered: 'yes' },
        code,
      }],
    }), { overwrite: true });

    const imported = Array.from(harness.scriptCache.values())[0];
    expect(result).toMatchObject({
      imported: 1,
      quarantinedScripts: 1,
      storageImported: 1,
      unmappedSettings: [expect.objectContaining({ keys: expect.arrayContaining(['unsupportedSetting']) })],
    });
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ warning: expect.stringContaining('prototype-polluting config keys rejected') }),
    ]));
    expect(imported).toMatchObject({
      enabled: false,
      settings: {
        runAt: 'document-start',
        userIncludes: ['https://example.com/custom/*'],
        userExcludes: ['https://example.com/custom/private/*'],
        userMatches: ['https://example.com/custom-match/*'],
        userConfig: { theme: 'dark' },
        _importQuarantine: expect.any(Object),
      },
    });
    expect(harness.valueCache.get(imported.id)).toEqual({ remembered: 'yes' });
    expect({}.polluted).toBeUndefined();
  });
});

describe('runtime import/export archive identity', () => {
  it('redacts credential-bearing settings from JSON exports unless explicitly included', async () => {
    const script = makeScript('script_exported', 'Exported Script');
    const harness = createRuntimeHarness(
      [script],
      {},
      {
        enabled: true,
        theme: 'dark',
        webdavPassword: 'secret',
        googleDriveToken: 'oauth-access',
        s3SecretKey: 's3-secret',
      },
    );

    const redacted = await harness.exportAllScripts({ includeSettings: true });
    expect(redacted.settings).toMatchObject({ enabled: true, theme: 'dark' });
    expect(redacted.settings).not.toHaveProperty('webdavPassword');
    expect(redacted.settings).not.toHaveProperty('googleDriveToken');
    expect(redacted.settings).not.toHaveProperty('s3SecretKey');
    expect(redacted.settingsCredentialsIncluded).toBe(false);
    expect(redacted.redactedSettingsCredentialKeys).toEqual(
      expect.arrayContaining(['webdavPassword', 'googleDriveToken', 's3SecretKey']),
    );

    const included = await harness.exportAllScripts({
      includeSettings: true,
      includeSettingsCredentials: true,
    });
    expect(included.settingsCredentialsIncluded).toBe(true);
    expect(included.settings).toMatchObject({
      webdavPassword: 'secret',
      googleDriveToken: 'oauth-access',
      s3SecretKey: 's3-secret',
    });
  });

  it('redacts future local workspace binding metadata from script settings exports', async () => {
    const script = makeScript('script_local_workspace', 'Local Workspace Script');
    script.settings = {
      notes: 'portable note',
      localWorkspaceBindingId: 'binding-secret',
      localWorkspace: { displayName: 'local.user.js', handle: { name: 'local.user.js' } },
      localFilePath: 'C:\\Users\\dev\\secret\\local.user.js',
      absolutePath: 'C:\\Users\\dev\\secret\\local.user.js',
      localProject: {
        projectId: 'project-secret',
        manifest: { relativePath: 'nested/secret.user.js', code: 'window.secret = true;' },
        handle: { name: 'secret-project' },
      },
      localProjectId: 'project-secret',
      localProjectManifest: { relativePath: 'nested/secret.user.js', code: 'window.secret = true;' },
      localProjectBindingId: 'binding-project-secret',
      relativePath: 'nested/secret.user.js',
      projectPath: 'C:\\Users\\dev\\secret\\project',
    };
    const harness = createRuntimeHarness([script]);

    const exported = await harness.exportAllScripts({ includeSettings: true });

    expect(exported.scripts[0].settings).toEqual({ notes: 'portable note' });
    expect(exported.scripts[0].redactedLocalWorkspaceSettingKeys).toEqual(expect.arrayContaining([
      'localWorkspaceBindingId',
      'localWorkspace',
      'localFilePath',
      'absolutePath',
      'localProject',
      'localProjectId',
      'localProjectManifest',
      'localProjectBindingId',
      'relativePath',
      'projectPath',
    ]));
    expect(JSON.stringify(exported)).not.toContain('binding-secret');
    expect(JSON.stringify(exported)).not.toContain('project-secret');
    expect(JSON.stringify(exported)).not.toContain('binding-project-secret');
    expect(JSON.stringify(exported)).not.toContain('secret\\\\local.user.js');
    expect(JSON.stringify(exported)).not.toContain('nested/secret.user.js');
    expect(JSON.stringify(exported)).not.toContain('secret\\\\project');
    expect(JSON.stringify(exported)).not.toContain('handle');
  });

  it('rejects imported local library snapshots whose digest does not match the code', async () => {
    const script = makeScript('script_local_library', 'Local Library Script');
    script.settings = {
      notes: 'portable note',
      localLibraries: [{
        id: 'local-library-helpers-1234',
        name: 'C:\\Users\\dev\\private\\helpers.js',
        code: 'globalThis.helpersReady = true;',
        sha256: 'a'.repeat(64),
        bytes: 9999,
        reviewedAt: 1_700_000_000_000,
        bindingId: 'binding-private',
        absolutePath: 'C:\\Users\\dev\\private\\helpers.js',
        handle: { name: 'helpers.js' },
      }],
    };
    const harness = createRuntimeHarness([script]);

    const exported = await harness.exportAllScripts({ includeSettings: true });
    expect(exported.scripts[0].settings.localLibraries).toEqual([{
      id: 'local-library-helpers-1234',
      name: 'helpers.js',
      code: 'globalThis.helpersReady = true;',
      sha256: 'a'.repeat(64),
      bytes: encoder.encode('globalThis.helpersReady = true;').byteLength,
      reviewedAt: 1_700_000_000_000,
    }]);
    expect(JSON.stringify(exported)).not.toContain('binding-private');
    expect(JSON.stringify(exported)).not.toContain('private\\\\helpers.js');
    expect(JSON.stringify(exported)).not.toContain('handle');

    const restoreHarness = createRuntimeHarness();
    const result = await restoreHarness.importScripts(exported, {
      importSettings: true,
      trustImportedScripts: true,
    });

    expect(result.errors).toEqual([]);
    expect(Array.from(restoreHarness.scriptCache.values())[0].settings.localLibraries)
      .toEqual([]);
  });

  it('round-trips JSON vault exports with stored values, folders, and workspaces', async () => {
    const script = makeScript('script_full_json', 'Full JSON Script');
    script.settings = { notes: 'portable note' };
    const folders = [{ id: 'folder_json', name: 'Pinned', scriptIds: ['script_full_json'] }];
    const workspaces = [{ id: 'workspace_json', name: 'Daily', scriptIds: ['script_full_json'] }];
    const harness = createRuntimeHarness(
      [script],
      { script_full_json: { draft: true, count: 2 } },
      { enabled: true, theme: 'dark' },
      { scriptFolders: folders, workspaces },
    );

    const exported = await harness.exportAllScripts({
      includeSettings: true,
      includeStorage: true,
    });

    expect(exported.storageIncluded).toBe(true);
    expect(exported.scripts[0].storage).toEqual({ draft: true, count: 2 });
    expect(exported.folders).toEqual(folders);
    expect(exported.workspaces).toEqual(workspaces);
    expect(exported.foldersIncluded).toBe(true);
    expect(exported.workspacesIncluded).toBe(true);

    const restoreHarness = createRuntimeHarness([], {}, { enabled: true, theme: 'light' });
    const result = await restoreHarness.importScripts(exported, {
      overwrite: true,
      importSettings: true,
      importStorage: true,
      trustImportedScripts: true,
    });

    expect(result.errors).toEqual([]);
    expect(result).toMatchObject({
      imported: 1,
      storageImported: 1,
      settingsImported: true,
      restoredFolders: true,
      restoredWorkspaces: true,
    });
    expect(restoreHarness.valueCache.get('script_full_json')).toEqual({ draft: true, count: 2 });
    expect(restoreHarness.chromeStorage.scriptFolders).toEqual(folders);
    expect(restoreHarness.chromeStorage.workspaces).toEqual(workspaces);
    expect(restoreHarness.SettingsManager.set).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'dark' }),
    );
  });

  it('restores JSON settings credentials only when archive metadata and import option both opt in', async () => {
    const harness = createRuntimeHarness();
    const data = {
      scripts: [],
      settings: {
        theme: 'light',
        webdavPassword: 'archive-secret',
        s3SecretKey: 'archive-s3-secret',
      },
      settingsCredentialsIncluded: true,
    };

    const guarded = await harness.importScripts(data, { importSettings: true });
    expect(guarded.settingsCredentialsImported).toBe(false);
    expect(guarded.skippedSettingsCredentialKeys).toEqual(
      expect.arrayContaining(['webdavPassword', 's3SecretKey']),
    );
    expect(harness.SettingsManager.set).toHaveBeenLastCalledWith(
      expect.not.objectContaining({
        webdavPassword: expect.anything(),
        s3SecretKey: expect.anything(),
      }),
    );

    const restored = await harness.importScripts(data, {
      importSettings: true,
      importSettingsCredentials: true,
    });
    expect(restored.settingsCredentialsImported).toBe(true);
    expect(harness.SettingsManager.set).toHaveBeenLastCalledWith(
      expect.objectContaining({
        webdavPassword: 'archive-secret',
        s3SecretKey: 'archive-s3-secret',
      }),
    );
  });

  it('drops unknown, malformed, and security-sensitive settings during JSON import', async () => {
    const harness = createRuntimeHarness();
    const data = {
      scripts: [],
      settings: {
        theme: 'light',
        enabled: 'yes',
        allowInternalXhr: true,
        allowInternalSyncEndpoints: true,
        allowHighPrivilegeScriptApis: true,
        scopedHostPermissions: true,
        trustedSigningKeys: { attacker: { name: 'Attacker', addedAt: 1 } },
        deniedHosts: ['*.example.com'],
        blacklist: ['https://blocked.example/*'],
        unknownSetting: 'ignored',
      },
      settingsCredentialsIncluded: true,
    };

    const result = await harness.importScripts(data, {
      importSettings: true,
      importSettingsCredentials: true,
    });

    expect(result).toMatchObject({
      settingsImported: true,
      skippedSettingsSecurityKeys: expect.arrayContaining([
        'allowInternalXhr',
        'allowInternalSyncEndpoints',
        'allowHighPrivilegeScriptApis',
        'scopedHostPermissions',
        'trustedSigningKeys',
        'deniedHosts',
        'blacklist',
      ]),
      skippedSettingsUnknownKeys: ['unknownSetting'],
      skippedSettingsTypeKeys: ['enabled'],
    });
    expect(harness.SettingsManager.set).toHaveBeenLastCalledWith({ theme: 'light' });
  });

  it('writes stable script IDs into runtime ZIP metadata', async () => {
    const script = makeScript('script_exported', 'Exported Script');
    const harness = createRuntimeHarness([script], { script_exported: { draft: true } });

    const exported = await harness.exportToZip();
    const files = harness.fakeFflate.unzipSync(base64ToBytes(exported.zipData));
    const options = JSON.parse(harness.fakeFflate.strFromU8(files['Exported Script.options.json']));

    expect(options.scriptId).toBe('script_exported');
    expect(options.scriptVault).toEqual({
      schemaVersion: 1,
      createdAt: 1,
      updatedAt: 2,
      position: 0,
    });
  });

  it('preserves ScriptVault ZIP script IDs when no existing script owns the name', async () => {
    const harness = createRuntimeHarness();
    const zipBytes = harness.fakeFflate.zipSync({
      'Preserved.user.js': harness.fakeFflate.strToU8([
        '// ==UserScript==',
        '// @name Preserved Script',
        '// @namespace scriptvault/preserved',
        '// @version 1.0.0',
        '// @match https://example.com/*',
        '// ==/UserScript==',
        'console.log("preserved");',
      ].join('\n')),
      'Preserved.options.json': harness.fakeFflate.strToU8(JSON.stringify({
        scriptId: 'script_preserved',
        settings: { enabled: false },
        scriptVault: {
          schemaVersion: 1,
          createdAt: 1700000000000,
          updatedAt: 1700000004321,
          position: 7,
        },
      })),
      'Preserved.storage.json': harness.fakeFflate.strToU8(JSON.stringify({ data: { draft: true } })),
    });

    const result = await harness.importFromZip(bytesToBase64(zipBytes), { overwrite: true });

    expect(result).toMatchObject({ imported: 1, skipped: 0 });
    expect(harness.ScriptStorage.set).toHaveBeenCalledWith(
      'script_preserved',
      expect.objectContaining({
        id: 'script_preserved',
        enabled: false,
        createdAt: 1700000000000,
        updatedAt: 1700000004321,
        position: 7,
      }),
    );
    expect(harness.ScriptValues.setAll).toHaveBeenCalledWith('script_preserved', { draft: true });
    expect(harness.generateId).not.toHaveBeenCalled();
  });

  it('sanitizes ZIP storage value maps before importing script values', async () => {
    const harness = createRuntimeHarness();
    const zipBytes = harness.fakeFflate.zipSync({
      'Values.user.js': harness.fakeFflate.strToU8(userscriptText('Value Import Script')),
      'Values.options.json': harness.fakeFflate.strToU8(JSON.stringify({
        scriptId: 'script_values',
        settings: { enabled: false },
      })),
      'Values.storage.json': harness.fakeFflate.strToU8(
        '{"data":{"draft":true,"__proto__":{"polluted":true},"constructor":"ctor","prototype":"proto"}}',
      ),
    });

    const result = await harness.importFromZip(bytesToBase64(zipBytes), { overwrite: true });

    expect(result).toMatchObject({ imported: 1, skipped: 0 });
    expect(harness.ScriptValues.setAll).toHaveBeenCalledTimes(1);
    const [, importedValues] = harness.ScriptValues.setAll.mock.calls[0];
    expect(importedValues).toEqual({ draft: true });
    expect(Object.hasOwn(importedValues, '__proto__')).toBe(false);
    expect(Object.hasOwn(importedValues, 'constructor')).toBe(false);
    expect(Object.hasOwn(importedValues, 'prototype')).toBe(false);
    expect({}.polluted).toBeUndefined();

    const invalidHarness = createRuntimeHarness();
    const invalidZipBytes = invalidHarness.fakeFflate.zipSync({
      'Invalid Values.user.js': invalidHarness.fakeFflate.strToU8(userscriptText('Invalid Value Import')),
      'Invalid Values.storage.json': invalidHarness.fakeFflate.strToU8(
        '{"data":["not","a","value","map"],"legacy":true}',
      ),
    });

    const invalidResult = await invalidHarness.importFromZip(
      bytesToBase64(invalidZipBytes),
      { overwrite: true },
    );

    expect(invalidResult).toMatchObject({ imported: 1, skipped: 0 });
    expect(invalidHarness.ScriptValues.setAll).not.toHaveBeenCalled();
  });

  it('preserves existing per-script settings when a ZIP backup restore overwrites an installed script', async () => {
    // Regression: BackupScheduler.restoreBackup routes through importFromZip
    // with overwrite:true; the ZIP path used an empty settings base, wiping
    // userMatches/notes/pinned of the currently-installed script.
    const existing = {
      ...makeScript('script_preserved', 'Preserved Script'),
      settings: { notes: 'keep me', pinned: true, userMatches: ['https://kept.example/*'] },
    };
    const harness = createRuntimeHarness([existing]);
    const zipBytes = harness.fakeFflate.zipSync({
      'Preserved.user.js': harness.fakeFflate.strToU8([
        '// ==UserScript==',
        '// @name Preserved Script',
        '// @namespace scriptvault/preserved',
        '// @version 2.0.0',
        '// @match https://example.com/*',
        '// ==/UserScript==',
        'console.log("restored");',
      ].join('\n')),
      'Preserved.options.json': harness.fakeFflate.strToU8(JSON.stringify({
        scriptId: 'script_preserved',
        scriptVault: { schemaVersion: 1, createdAt: 1, updatedAt: 2, position: 0 },
      })),
    });

    const result = await harness.importFromZip(bytesToBase64(zipBytes), { overwrite: true });
    expect(result).toMatchObject({ imported: 1 });
    const setCall = harness.ScriptStorage.set.mock.calls.find(([id]) => id === 'script_preserved');
    expect(setCall).toBeTruthy();
    expect(setCall[1].settings).toMatchObject({ notes: 'keep me', pinned: true });
    expect(setCall[1].settings.userMatches).toEqual(['https://kept.example/*']);
  });

  it('quarantines archive-enabled ZIP imports while preserving ScriptVault IDs', async () => {
    const existing = makeScript('script_preserved', 'Renamed Local Script');
    const harness = createRuntimeHarness([existing]);
    const zipBytes = harness.fakeFflate.zipSync({
      'Preserved.user.js': harness.fakeFflate.strToU8([
        '// ==UserScript==',
        '// @name Preserved Script',
        '// @namespace scriptvault/preserved',
        '// @version 1.0.0',
        '// @match https://example.com/*',
        '// ==/UserScript==',
        'console.log("preserved");',
      ].join('\n')),
      'Preserved.options.json': harness.fakeFflate.strToU8(JSON.stringify({
        scriptId: 'script_preserved',
        settings: { enabled: true },
      })),
    });

    const result = await harness.importFromZip(bytesToBase64(zipBytes), { overwrite: true });

    expect(result).toMatchObject({ imported: 1, skipped: 0, quarantinedScripts: 1 });
    expect(harness.ScriptStorage.set).toHaveBeenCalledWith(
      'script_preserved',
      expect.objectContaining({
        id: 'script_preserved',
        enabled: false,
        meta: expect.objectContaining({ name: 'Preserved Script' }),
        settings: expect.objectContaining({
          _importQuarantine: expect.objectContaining({
            source: 'import-zip',
          }),
        }),
      }),
    );
    expect(harness.generateId).not.toHaveBeenCalled();
  });

  it('preserves archive-enabled ZIP imports only with a trusted override', async () => {
    const existing = makeScript('script_preserved', 'Renamed Local Script');
    const harness = createRuntimeHarness([existing]);
    const zipBytes = harness.fakeFflate.zipSync({
      'Preserved.user.js': harness.fakeFflate.strToU8([
        '// ==UserScript==',
        '// @name Preserved Script',
        '// @namespace scriptvault/preserved',
        '// @version 1.0.0',
        '// @match https://example.com/*',
        '// ==/UserScript==',
        'console.log("preserved");',
      ].join('\n')),
      'Preserved.options.json': harness.fakeFflate.strToU8(JSON.stringify({
        scriptId: 'script_preserved',
        settings: { enabled: true },
      })),
    });

    const result = await harness.importFromZip(bytesToBase64(zipBytes), {
      overwrite: true,
      trustImportedScripts: true,
    });

    expect(result).toMatchObject({ imported: 1, skipped: 0, trustedEnabledScripts: 1 });
    expect(harness.ScriptStorage.set).toHaveBeenCalledWith(
      'script_preserved',
      expect.objectContaining({
        id: 'script_preserved',
        enabled: true,
        meta: expect.objectContaining({ name: 'Preserved Script' }),
      }),
    );
  });

  it('generates safe IDs for unsafe JSON import script IDs', async () => {
    const harness = createRuntimeHarness();

    const result = await harness.importScripts({
      scripts: [{
        id: '__proto__',
        code: [
          '// ==UserScript==',
          '// @name Unsafe ID Script',
          '// @namespace scriptvault/unsafe-json-id',
          '// @version 1.0.0',
          '// @match https://example.com/*',
          '// ==/UserScript==',
          'console.log("unsafe");',
        ].join('\n'),
        enabled: true,
      }],
    }, { overwrite: true });

    expect(result).toMatchObject({ imported: 1, skipped: 0 });
    expect(harness.ScriptStorage.set).toHaveBeenCalledWith(
      'generated_script_1',
      expect.objectContaining({
        id: 'generated_script_1',
        meta: expect.objectContaining({ name: 'Unsafe ID Script' }),
      }),
    );
    expect(harness.ScriptStorage.get).not.toHaveBeenCalledWith('__proto__');
    expect(harness.generateId).toHaveBeenCalledTimes(1);
  });

  it('preserves existing per-script settings and version history when overwriting on import', async () => {
    // Regression: a JSON re-import (or backup restore) over an installed script
    // used to wipe userIncludes/notes/tags/pinned and versionHistory because
    // the new record only carried quarantine state.
    const existing = {
      id: 'script_keep',
      code: '// old code',
      enabled: true,
      meta: { name: 'Keep Me' },
      settings: { notes: 'my notes', pinned: true, userMatches: ['https://kept.example/*'] },
      versionHistory: [{ version: '0.9.0', code: '// v0.9' }],
      createdAt: 111,
    };
    const harness = createRuntimeHarness([existing]);

    const result = await harness.importScripts({
      scripts: [{
        id: 'script_keep',
        code: [
          '// ==UserScript==',
          '// @name Keep Me',
          '// @namespace scriptvault/keep',
          '// @version 1.0.0',
          '// @match https://example.com/*',
          '// ==/UserScript==',
          'console.log("new");',
        ].join('\n'),
        enabled: true,
      }],
    }, { overwrite: true });

    expect(result).toMatchObject({ imported: 1 });
    const setCall = harness.ScriptStorage.set.mock.calls.find(([id]) => id === 'script_keep');
    expect(setCall).toBeTruthy();
    const written = setCall[1];
    expect(written.settings).toMatchObject({ notes: 'my notes', pinned: true });
    expect(written.settings.userMatches).toEqual(['https://kept.example/*']);
    // The prior version-history entry must survive the overwrite (the import
    // may additionally append the incoming version).
    expect(written.versionHistory).toContainEqual({ version: '0.9.0', code: '// v0.9' });
    expect(written.createdAt).toBe(111);
  });

  it('rejects oversized JSON imports before storage or parser work', async () => {
    const harness = createRuntimeHarness();

    const result = await harness.importScripts({
      scripts: [{
        id: 'script_too_large',
        code: 'x'.repeat(5 * 1024 * 1024 + 1),
      }],
    }, { overwrite: true });

    expect(result.error).toMatch(/too large/);
    expect(harness.ScriptStorage.getAll).not.toHaveBeenCalled();
  });

  it('rejects unsafe ZIP intake before importing scripts', async () => {
    const cases = [
      {
        name: 'nested archive',
        entries: {
          'payload.zip': textEntry('nested'),
        },
        error: /nested archive entry payload\.zip/,
      },
      {
        name: 'excessive file count',
        entries: Object.fromEntries(
          Array.from({ length: 301 }, (_, index) => [`file-${index}.txt`, textEntry('x')]),
        ),
        error: /too many files/,
      },
      {
        name: 'oversized script',
        entries: {
          'Huge.user.js': textEntry(userscriptText('Huge'), {
            size: 1024,
            originalSize: 5 * 1024 * 1024 + 1,
          }),
        },
        error: /Huge\.user\.js is too large/,
      },
      {
        name: 'high expansion ratio',
        entries: {
          'Compressed.user.js': textEntry(userscriptText('Compressed'), {
            size: 1,
            originalSize: 1024,
          }),
        },
        error: /compression ratio is too high/,
      },
    ];

    for (const testCase of cases) {
      const harness = createRuntimeHarness();
      const result = await harness.importFromZip(bytesToBase64(fakeZipBytes(testCase.entries)), {
        overwrite: true,
      });

      expect(result.error, testCase.name).toMatch(testCase.error);
      expect(harness.ScriptStorage.set, testCase.name).not.toHaveBeenCalled();
    }
  });

  it('rejects generated path and size mutations at the archive boundary', async () => {
    let seed = 0x5eed1234;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    const mutations = Array.from({ length: 18 }, (_, index) => {
      switch (next() % 6) {
        case 0:
          return { name: `../escape-${index}.user.js`, meta: {} };
        case 1:
          return { name: `folder/../escape-${index}.json`, meta: {} };
        case 2:
          return { name: `nested-${index}.${index % 2 ? 'ZIP' : 'xpi'}`, meta: {} };
        case 3:
          return { name: `negative-${index}.user.js`, meta: { size: -1 } };
        case 4:
          return { name: `nan-${index}.user.js`, meta: { size: 'not-a-number' } };
        default:
          return { name: `huge-${index}.options.json`, meta: { originalSize: 512 * 1024 + 1 } };
      }
    });

    const quietConsole = Object.create(console);
    quietConsole.error = vi.fn();
    for (const [index, mutation] of mutations.entries()) {
      const harness = createRuntimeHarness([], {}, { enabled: true }, {}, quietConsole);
      const entries = {
        [mutation.name]: textEntry(userscriptText(`Mutation ${index}`), mutation.meta),
      };
      const result = await harness.importFromZip(bytesToBase64(fakeZipBytes(entries)), {
        overwrite: true,
      });

      expect(result.error, `mutation ${index}: ${mutation.name}`).toMatch(/Backup archive rejected/);
      expect(harness.ScriptStorage.set, mutation.name).not.toHaveBeenCalled();
    }
  });
});
