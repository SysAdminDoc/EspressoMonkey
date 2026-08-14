#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildOptionalHostPrototype } from './check-host-permission-prototype.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..');
const OPTIONAL_HOST_PATTERNS = ['http://*/*', 'https://*/*'];
const FIXTURE_HOSTS = Object.freeze({
  run: 'run.scriptvault.test',
  dependency: 'deps.scriptvault.test',
  update: 'updates.scriptvault.test',
  api: 'api.scriptvault.test',
  dnr: 'dnr.scriptvault.test',
  download: 'downloads.scriptvault.test',
  denied: 'denied.scriptvault.test',
});
const PACKAGE_ENTRIES = [
  'background.js',
  'content.js',
  'offscreen.html',
  'offscreen.js',
  'shared',
  'modules/i18n.js',
  'modules/script-config.js',
  'modules/user-scripts-setup.js',
  'pages',
  'images/icon16.png',
  'images/icon32.png',
  'images/icon48.png',
  'images/icon128.png',
  'lib/codemirror',
  'lib/monaco-esm',
  'lib/acorn.min.js',
  'lib/diff.min.js',
  'lib/fflate.js',
  'lib/scriptvault.d.ts',
  'managed-storage-schema.json',
  '_locales',
];

function parseArgs(argv = process.argv.slice(2)) {
  const options = { check: false, json: false, report: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') options.check = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--report') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--report requires a path');
      options.report = value;
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function strictOptionalManifest(sourceManifest) {
  const manifest = buildOptionalHostPrototype(sourceManifest);
  delete manifest.__scriptvault_prototype;
  delete manifest.content_scripts;
  return manifest;
}

function retainedBridgeManifest(sourceManifest) {
  const manifest = buildOptionalHostPrototype(sourceManifest);
  delete manifest.__scriptvault_prototype;
  return manifest;
}

async function stageExtension(kind = 'shipping') {
  const root = await mkdtemp(join(tmpdir(), `scriptvault-host-${kind}-`));
  const sourceManifest = JSON.parse(await readFile(join(PROJECT_ROOT, 'manifest.json'), 'utf8'));
  const manifest = kind === 'strict-optional'
    ? strictOptionalManifest(sourceManifest)
    : kind === 'retained-bridge'
      ? retainedBridgeManifest(sourceManifest)
      : structuredClone(sourceManifest);

  for (const entry of PACKAGE_ENTRIES) {
    const source = join(PROJECT_ROOT, entry);
    if (!existsSync(source)) throw new Error(`Missing ${entry}; run npm run build first.`);
    const target = join(root, entry);
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, { recursive: true });
  }
  await writeManifest(root, manifest);
  return { root, manifest };
}

async function writeManifest(root, manifest) {
  await writeFile(join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function findExtensionId(context) {
  const existing = context.serviceWorkers().find(worker => worker.url().startsWith('chrome-extension://'));
  const worker = existing || await context.waitForEvent('serviceworker', {
    predicate: candidate => candidate.url().startsWith('chrome-extension://'),
    timeout: 15_000,
  });
  const match = worker.url().match(/^chrome-extension:\/\/([^/]+)\//);
  if (!match) throw new Error(`Could not resolve extension id from ${worker.url()}`);
  return match[1];
}

function browserArgs(extensionRoot) {
  const mappings = Object.values(FIXTURE_HOSTS)
    .map(host => `MAP ${host} 127.0.0.1`)
    .join(',');
  return [
    `--disable-extensions-except=${extensionRoot}`,
    `--load-extension=${extensionRoot}`,
    `--host-resolver-rules=${mappings}`,
    '--disable-dev-shm-usage',
    '--no-default-browser-check',
    '--no-first-run',
    '--no-sandbox',
  ];
}

async function launchProfile(staged, userDataDir) {
  const downloadsPath = join(userDataDir, 'matrix-downloads');
  await mkdir(downloadsPath, { recursive: true });
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: process.env.SCRIPT_VAULT_PLAYWRIGHT_CHANNEL || 'chromium',
    headless: true,
    acceptDownloads: true,
    downloadsPath,
    args: browserArgs(staged.root),
  });
  const extensionId = await findExtensionId(context);
  return {
    context,
    extensionId,
    browserVersion: context.browser()?.version() || 'unknown',
    url: path => `chrome-extension://${extensionId}/${path.replace(/^\/+/, '')}`,
  };
}

async function openExtensionPage(app, path = 'pages/dashboard.html') {
  const page = await app.context.newPage();
  await page.goto(app.url(path), { waitUntil: 'domcontentloaded', timeout: 20_000 });
  return page;
}

async function permissionSnapshot(page, origins = [], permissions = []) {
  return page.evaluate(async ({ requestedOrigins, requestedPermissions }) => ({
    all: await chrome.permissions.getAll(),
    origins: Object.fromEntries(await Promise.all(requestedOrigins.map(async origin => [
      origin,
      await chrome.permissions.contains({ origins: [origin] }),
    ]))),
    permissions: Object.fromEntries(await Promise.all(requestedPermissions.map(async permission => [
      permission,
      await chrome.permissions.contains({ permissions: [permission] }),
    ]))),
  }), { requestedOrigins: origins, requestedPermissions: permissions });
}

async function extensionFetch(page, url) {
  return page.evaluate(async target => {
    try {
      const response = await fetch(target, { cache: 'no-store' });
      return { ok: response.ok, status: response.status, body: await response.text() };
    } catch (error) {
      return { ok: false, status: 0, error: error?.message || String(error) };
    }
  }, url);
}

async function bridgeProbe(context, url) {
  const page = await context.newPage();
  await page.addInitScript(() => {
    globalThis.__scriptVaultHostMatrixBridge = false;
    window.addEventListener('message', event => {
      if (event.source === window && event.data?.type === 'bridgeReady') {
        globalThis.__scriptVaultHostMatrixBridge = true;
      }
    });
  });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.waitForFunction(() => globalThis.__scriptVaultHostMatrixBridge === true, null, { timeout: 1_500 })
      .catch(() => undefined);
    return await page.evaluate(() => globalThis.__scriptVaultHostMatrixBridge === true);
  } finally {
    await page.close().catch(() => {});
  }
}

async function requestFromClick(page, request) {
  await page.evaluate(({ permissions, origins }) => {
    document.getElementById('__hostMatrixRequest')?.remove();
    const button = document.createElement('button');
    button.id = '__hostMatrixRequest';
    button.textContent = 'Grant matrix permission';
    globalThis.__hostMatrixRequestResult = { state: 'pending' };
    button.addEventListener('click', async () => {
      try {
        const granted = await chrome.permissions.request({
          ...(permissions?.length ? { permissions } : {}),
          ...(origins?.length ? { origins } : {}),
        });
        globalThis.__hostMatrixRequestResult = { state: 'settled', granted };
      } catch (error) {
        globalThis.__hostMatrixRequestResult = {
          state: 'settled',
          granted: false,
          error: error?.message || String(error),
        };
      }
    }, { once: true });
    document.body.append(button);
  }, request);
  await page.locator('#__hostMatrixRequest').click({ force: true });
  await page.waitForFunction(() => globalThis.__hostMatrixRequestResult?.state === 'settled', null, { timeout: 5_000 });
  return page.evaluate(() => globalThis.__hostMatrixRequestResult);
}

async function ensureUserScriptsEnabled(app) {
  const page = await app.context.newPage();
  try {
    await page.goto(`chrome://extensions/?id=${app.extensionId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    });
    const findToggle = () => page.evaluateHandle(() => {
      const findControl = root => {
        const direct = root.querySelector?.('#itemAllowUserScripts');
        if (direct) return direct;
        const row = root.querySelector?.('#allow-user-scripts');
        if (row) {
          return row.shadowRoot?.querySelector('#crToggle, cr-toggle')
            || row.querySelector?.('#crToggle, cr-toggle')
            || row;
        }
        for (const element of root.querySelectorAll?.('*') || []) {
          if (!element.shadowRoot) continue;
          const nested = findControl(element.shadowRoot);
          if (nested) return nested;
        }
        return null;
      };
      return findControl(document);
    });

    let toggle = null;
    const deadline = Date.now() + 10_000;
    while (!toggle && Date.now() < deadline) {
      const handle = await findToggle();
      toggle = handle.asElement();
      if (!toggle) {
        await handle.dispose();
        await page.waitForTimeout(150);
      }
    }
    if (!toggle) return { present: false, enabledBefore: null, enabledAfter: null };

    const enabledBefore = await toggle.evaluate(element => element.checked === true);
    if (!enabledBefore) {
      await toggle.click();
      await page.waitForFunction(() => {
        const visit = root => {
          const direct = root.querySelector?.('#itemAllowUserScripts');
          if (direct) return direct;
          const row = root.querySelector?.('#allow-user-scripts');
          if (row) return row.shadowRoot?.querySelector('#crToggle, cr-toggle') || row.querySelector?.('#crToggle, cr-toggle') || row;
          for (const element of root.querySelectorAll?.('*') || []) {
            if (!element.shadowRoot) continue;
            const nested = visit(element.shadowRoot);
            if (nested) return nested;
          }
          return null;
        };
        return visit(document)?.checked === true;
      }, null, { timeout: 10_000 });
    }
    return {
      present: true,
      enabledBefore,
      enabledAfter: await toggle.evaluate(element => element.checked === true),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

function manifestShape(manifest) {
  return {
    hostPermissions: manifest.host_permissions || [],
    optionalHostPermissions: manifest.optional_host_permissions || [],
    contentScriptMatches: (manifest.content_scripts || []).flatMap(entry => entry.matches || []),
  };
}

function saveSummary(result) {
  return {
    success: result?.success === true,
    scriptId: result?.scriptId || '',
    created: result?.created ?? null,
    error: result?.error || '',
  };
}

function createFixtureServer() {
  const requests = [];
  const requireBody = "globalThis.__svHostMatrixRequire = 'require-ok';\n";
  const server = createServer((request, response) => {
    const host = String(request.headers.host || '').split(':')[0];
    const url = new URL(request.url || '/', `http://${host || 'fixture.invalid'}`);
    requests.push({
      host,
      path: url.pathname,
      method: request.method || 'GET',
      matrixHeader: request.headers['x-scriptvault-matrix'] || '',
    });
    response.setHeader('Cache-Control', 'no-store');

    if (url.pathname !== '/host-gate') {
      response.setHeader('Access-Control-Allow-Origin', '*');
    }

    if (url.pathname === '/require.js') {
      response.setHeader('Content-Type', 'application/javascript');
      response.end(requireBody);
      return;
    }
    if (url.pathname === '/resource.txt') {
      response.setHeader('Content-Type', 'text/plain');
      response.end('resource-ok');
      return;
    }
    if (url.pathname === '/update.user.js') {
      response.setHeader('Content-Type', 'application/javascript');
      response.end([
        '// ==UserScript==',
        '// @name ScriptVault host matrix',
        '// @namespace scriptvault-host-matrix',
        '// @version 2.0.0',
        `// @match http://${FIXTURE_HOSTS.run}/*`,
        '// @grant none',
        '// ==/UserScript==',
        "document.documentElement.dataset.svHostMatrixVersion = '2.0.0';",
        '',
      ].join('\n'));
      return;
    }
    if (url.pathname === '/download.txt') {
      response.setHeader('Content-Type', 'text/plain');
      response.setHeader('Content-Disposition', 'attachment; filename="scriptvault-host-matrix.txt"');
      response.end('download-ok');
      return;
    }
    if (url.pathname === '/api' || url.pathname === '/dnr') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ ok: true, host, matrixHeader: request.headers['x-scriptvault-matrix'] || '' }));
      return;
    }
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><html><head><title>ScriptVault host matrix</title></head><body>matrix</body></html>');
  });

  return {
    requests,
    requireBody,
    async start() {
      await new Promise((resolveStart, rejectStart) => {
        server.once('error', rejectStart);
        server.listen(0, '127.0.0.1', () => {
          server.off('error', rejectStart);
          resolveStart();
        });
      });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Fixture server did not expose a TCP port');
      return address.port;
    },
    async close() {
      await new Promise(resolveClose => server.close(() => resolveClose()));
    },
  };
}

function fixtureUrls(port) {
  const url = (host, path = '/') => `http://${host}:${port}${path}`;
  const pattern = host => `http://${host}/*`;
  return {
    run: url(FIXTURE_HOSTS.run, '/run'),
    gate: url(FIXTURE_HOSTS.run, '/host-gate'),
    dependency: url(FIXTURE_HOSTS.dependency, '/require.js'),
    resource: url(FIXTURE_HOSTS.dependency, '/resource.txt'),
    update: url(FIXTURE_HOSTS.update, '/update.user.js'),
    api: url(FIXTURE_HOSTS.api, '/api'),
    dnr: url(FIXTURE_HOSTS.dnr, '/dnr'),
    download: url(FIXTURE_HOSTS.download, '/download.txt'),
    denied: url(FIXTURE_HOSTS.denied, '/host-gate'),
    patterns: Object.fromEntries(Object.entries(FIXTURE_HOSTS).map(([key, host]) => [key, pattern(host)])),
  };
}

async function runFreshScenario(kind, urls) {
  const staged = await stageExtension(kind);
  const userDataDir = await mkdtemp(join(tmpdir(), `scriptvault-host-profile-${kind}-`));
  let app;
  try {
    app = await launchProfile(staged, userDataDir);
    const page = await openExtensionPage(app);
    const permissions = await permissionSnapshot(page, [urls.patterns.run]);
    const fetch = await extensionFetch(page, urls.gate);
    const contentBridge = await bridgeProbe(app.context, urls.run);
    return {
      kind,
      browserVersion: app.browserVersion,
      manifest: manifestShape(staged.manifest),
      permissions,
      extensionFetch: fetch,
      contentBridge,
    };
  } finally {
    await app?.context.close().catch(() => {});
    await rm(userDataDir, { recursive: true, force: true });
    await rm(staged.root, { recursive: true, force: true });
  }
}

async function runGrantLifecycle(urls) {
  const staged = await stageExtension('strict-optional');
  const userDataDir = await mkdtemp(join(tmpdir(), 'scriptvault-host-profile-lifecycle-'));
  let app;
  try {
    const bootstrapManifest = structuredClone(staged.manifest);
    bootstrapManifest.host_permissions = [urls.patterns.run];
    await writeManifest(staged.root, bootstrapManifest);

    app = await launchProfile(staged, userDataDir);
    let page = await openExtensionPage(app, 'offscreen.html');
    const bootstrap = await permissionSnapshot(page, [urls.patterns.run]);
    await app.context.close();
    app = null;

    await writeManifest(staged.root, staged.manifest);
    app = await launchProfile(staged, userDataDir);
    page = await openExtensionPage(app, 'offscreen.html');
    const persistedGrant = await permissionSnapshot(page, [urls.patterns.run]);
    const fetchWithGrant = await extensionFetch(page, urls.gate);
    const confirmedFromGesture = await requestFromClick(page, { origins: [urls.patterns.run] });
    const removed = await page.evaluate(pattern => chrome.permissions.remove({ origins: [pattern] }), urls.patterns.run);
    const afterRemove = await permissionSnapshot(page, [urls.patterns.run]);
    const fetchAfterRemove = await extensionFetch(page, urls.gate);
    return {
      bootstrap,
      persistedGrant,
      fetchWithGrant,
      confirmedFromGesture,
      removed,
      afterRemove,
      fetchAfterRemove,
      firstGrantPromptAutomation: 'not-automated: Chromium exposes this as a native permission prompt',
    };
  } finally {
    await app?.context.close().catch(() => {});
    await rm(userDataDir, { recursive: true, force: true });
    await rm(staged.root, { recursive: true, force: true });
  }
}

function buildNarrowUserscript(urls, requireBody) {
  const requireHash = createHash('sha256').update(requireBody).digest('base64');
  const resultAttribute = 'data-sv-host-matrix';
  const metadata = [
    '// ==UserScript==',
    '// @name ScriptVault host matrix',
    '// @namespace scriptvault-host-matrix',
    '// @version 1.0.0',
    `// @match http://${FIXTURE_HOSTS.run}/*`,
    `// @updateURL ${urls.update}`,
    `// @downloadURL ${urls.update}`,
    `// @require ${urls.dependency}#sha256=${requireHash}`,
    `// @resource matrix ${urls.resource}`,
    `// @connect ${FIXTURE_HOSTS.api}`,
    `// @connect ${FIXTURE_HOSTS.dnr}`,
    `// @connect ${FIXTURE_HOSTS.download}`,
    '// @grant GM_xmlhttpRequest',
    '// @grant GM_getResourceText',
    '// @grant GM_cookie',
    '// @grant GM_download',
    '// @grant GM_webRequest',
    `// @webRequest {"selector":{"url":"||${FIXTURE_HOSTS.dnr}"},"action":{"setRequestHeaders":{"X-ScriptVault-Matrix":"dnr-ok"}}}`,
    '// ==/UserScript==',
  ];
  const body = `
(async () => {
  const result = { complete: false, require: globalThis.__svHostMatrixRequire || '' };
  const publish = () => document.documentElement.setAttribute(${JSON.stringify(resultAttribute)}, JSON.stringify(result));
  try { result.resource = await GM.getResourceText('matrix'); } catch (error) { result.resourceError = error?.message || String(error); }
  try {
    const response = await GM.xmlHttpRequest({ url: ${JSON.stringify(urls.api)}, responseType: 'json' });
    result.connect = response.status === 200 && response.response?.ok === true;
  } catch (error) { result.connectError = error?.message || String(error); }
  try {
    await GM.cookie.set({ url: ${JSON.stringify(urls.run)}, name: 'sv_host_matrix', value: 'cookie-ok' });
    const cookies = await GM.cookie.list({ url: ${JSON.stringify(urls.run)}, name: 'sv_host_matrix' });
    result.cookie = cookies.some(cookie => cookie.name === 'sv_host_matrix' && cookie.value === 'cookie-ok');
  } catch (error) { result.cookieError = error?.message || String(error); }
  try {
    const response = await fetch(${JSON.stringify(urls.dnr)}, { cache: 'no-store' });
    const payload = await response.json();
    result.dnr = response.ok && payload.matrixHeader === 'dnr-ok';
  } catch (error) { result.dnrError = error?.message || String(error); }
  result.download = await new Promise(resolve => {
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value); } };
    GM_download({
      url: ${JSON.stringify(urls.download)},
      name: 'scriptvault-host-matrix.txt',
      saveAs: false,
      onload: () => finish('complete'),
      onerror: error => finish('error:' + (error?.error || 'unknown')),
      ontimeout: () => finish('timeout')
    });
    setTimeout(() => finish('callback-timeout'), 10000);
  });
  result.complete = true;
  publish();
})().catch(error => {
  document.documentElement.setAttribute(${JSON.stringify(resultAttribute)}, JSON.stringify({ complete: true, fatal: error?.message || String(error) }));
});
`;
  return `${metadata.join('\n')}\n${body}\n`;
}

async function getRegisteredScript(page, id) {
  return page.evaluate(async scriptId => {
    const registrations = await chrome.userScripts.getScripts({ ids: [scriptId] });
    return registrations.map(registration => ({
      id: registration.id,
      matches: registration.matches,
      runAt: registration.runAt,
      world: registration.world,
    }));
  }, id);
}

async function runProductMatrix(urls, fixture) {
  const staged = await stageExtension('strict-optional');
  const userDataDir = await mkdtemp(join(tmpdir(), 'scriptvault-host-profile-product-'));
  const hostPatterns = [
    urls.patterns.run,
    urls.patterns.dependency,
    urls.patterns.update,
    urls.patterns.api,
    `https://${FIXTURE_HOSTS.api}/*`,
    urls.patterns.dnr,
    `https://${FIXTURE_HOSTS.dnr}/*`,
    urls.patterns.download,
    `https://${FIXTURE_HOSTS.download}/*`,
  ];
  let app;
  try {
    const bootstrapManifest = structuredClone(staged.manifest);
    bootstrapManifest.host_permissions = hostPatterns;
    bootstrapManifest.permissions = unique([...(bootstrapManifest.permissions || []), 'cookies', 'downloads']);
    bootstrapManifest.optional_permissions = (bootstrapManifest.optional_permissions || [])
      .filter(permission => permission !== 'cookies' && permission !== 'downloads');
    await writeManifest(staged.root, bootstrapManifest);

    app = await launchProfile(staged, userDataDir);
    const userScriptsToggle = await ensureUserScriptsEnabled(app);
    const bootstrapPage = await openExtensionPage(app);
    const bootstrapPermissions = await permissionSnapshot(bootstrapPage, hostPatterns, ['cookies', 'downloads']);
    await app.context.close();
    app = null;

    await writeManifest(staged.root, staged.manifest);
    app = await launchProfile(staged, userDataDir);
    const page = await openExtensionPage(app);
    const optionalPermissions = await permissionSnapshot(page, hostPatterns, ['cookies', 'downloads']);
    const deniedPermission = await permissionSnapshot(page, [urls.patterns.denied]);
    const deniedFetch = await extensionFetch(page, urls.denied);
    const status = await page.evaluate(() => chrome.runtime.sendMessage({ action: 'getExtensionStatus' }));
    await page.evaluate(() => chrome.runtime.sendMessage({
      action: 'setSettings',
      settings: {
        scopedHostPermissions: true,
        allowCookies: 'all',
        notifyOnInstall: false,
      },
    }));

    const scriptId = 'scriptvault-host-matrix-narrow';
    const code = buildNarrowUserscript(urls, fixture.requireBody);
    const save = await page.evaluate(({ id, source }) => chrome.runtime.sendMessage({
      action: 'saveScript',
      id,
      code: source,
      enabled: true,
    }), { id: scriptId, source: code });
    const stored = await page.evaluate(id => chrome.runtime.sendMessage({ action: 'getScript', id }), scriptId);
    const registration = await getRegisteredScript(page, scriptId);

    const runPage = await app.context.newPage();
    const runtimeDiagnostics = [];
    runPage.on('console', message => runtimeDiagnostics.push(`console:${message.type()}:${message.text()}`));
    runPage.on('pageerror', error => runtimeDiagnostics.push(`pageerror:${error.message}`));
    await runPage.goto(urls.run, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    const executionCompleted = await runPage.waitForFunction(() => {
      const raw = document.documentElement.getAttribute('data-sv-host-matrix');
      if (!raw) return false;
      try { return JSON.parse(raw).complete === true; } catch { return false; }
    }, null, { timeout: 20_000 }).then(() => true).catch(error => {
      runtimeDiagnostics.push(`wait:${error.message}`);
      return false;
    });
    const execution = await runPage.evaluate(() => {
      const raw = document.documentElement.getAttribute('data-sv-host-matrix');
      if (!raw) return { complete: false, missingResult: true };
      try { return JSON.parse(raw); } catch (error) { return { complete: false, raw, parseError: error?.message || String(error) }; }
    });

    const updates = await page.evaluate(id => chrome.runtime.sendMessage({ action: 'checkUpdates', scriptId: id }), scriptId);
    const dynamicRules = await page.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).map(rule => ({
      id: rule.id,
      action: rule.action,
      condition: rule.condition,
    })));
    const downloads = await page.evaluate(() => chrome.downloads.search({ filenameRegex: 'scriptvault-host-matrix\\.txt$' }));
    const requestCounts = Object.fromEntries(Object.values(FIXTURE_HOSTS).map(host => [
      host,
      fixture.requests.filter(request => request.host === host).length,
    ]));

    return {
      userScriptsToggle,
      bootstrapPermissions,
      optionalPermissions,
      deniedPermission,
      deniedFetch,
      userScriptsStatus: {
        available: status?.userScriptsAvailable ?? null,
        setupState: status?.setupState || null,
      },
      save: saveSummary(save),
      storedRegistrationError: stored?.settings?._registrationError || '',
      registration,
      execution,
      executionCompleted,
      runtimeDiagnostics,
      updates: Array.isArray(updates) ? updates.map(update => ({
        id: update.id,
        currentVersion: update.currentVersion,
        newVersion: update.newVersion,
        sourceUrl: update.sourceUrl,
      })) : updates,
      dynamicRules,
      downloads: downloads.map(download => ({
        filename: download.filename,
        state: download.state,
        url: download.url,
      })),
      requestCounts,
      dnrRequests: fixture.requests.filter(request => request.host === FIXTURE_HOSTS.dnr),
    };
  } finally {
    await app?.context.close().catch(() => {});
    await rm(userDataDir, { recursive: true, force: true });
    await rm(staged.root, { recursive: true, force: true });
  }
}

function buildBroadUserscript() {
  return [
    '// ==UserScript==',
    '// @name ScriptVault broad host matrix',
    '// @namespace scriptvault-host-matrix',
    '// @version 1.0.0',
    '// @match <all_urls>',
    '// @grant none',
    '// ==/UserScript==',
    "document.documentElement.dataset.svBroadHostMatrix = 'approved';",
    '',
  ].join('\n');
}

async function runBroadScriptMatrix(urls) {
  const staged = await stageExtension('strict-optional');
  const userDataDir = await mkdtemp(join(tmpdir(), 'scriptvault-host-profile-broad-'));
  let app;
  try {
    const bootstrapManifest = structuredClone(staged.manifest);
    bootstrapManifest.host_permissions = OPTIONAL_HOST_PATTERNS;
    await writeManifest(staged.root, bootstrapManifest);

    app = await launchProfile(staged, userDataDir);
    const userScriptsToggle = await ensureUserScriptsEnabled(app);
    await app.context.close();
    app = null;

    await writeManifest(staged.root, staged.manifest);
    app = await launchProfile(staged, userDataDir);
    const page = await openExtensionPage(app);
    await page.evaluate(() => chrome.runtime.sendMessage({
      action: 'setSettings',
      settings: { scopedHostPermissions: true, notifyOnInstall: false },
    }));
    const broadPermissions = await permissionSnapshot(page, OPTIONAL_HOST_PATTERNS);
    const scriptId = 'scriptvault-host-matrix-broad';
    const code = buildBroadUserscript();
    const blockedSave = await page.evaluate(({ id, source }) => chrome.runtime.sendMessage({
      action: 'saveScript', id, code: source, enabled: true, settings: { allowBroadHostAccess: false },
    }), { id: scriptId, source: code });
    const blockedScript = await page.evaluate(id => chrome.runtime.sendMessage({ action: 'getScript', id }), scriptId);
    const blockedRegistration = await getRegisteredScript(page, scriptId);

    const approvedSave = await page.evaluate(({ id, source }) => chrome.runtime.sendMessage({
      action: 'saveScript', id, code: source, enabled: true, settings: { allowBroadHostAccess: true },
    }), { id: scriptId, source: code });
    const approvedScript = await page.evaluate(id => chrome.runtime.sendMessage({ action: 'getScript', id }), scriptId);
    const approvedRegistration = await getRegisteredScript(page, scriptId);
    const runPage = await app.context.newPage();
    await runPage.goto(urls.run, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await runPage.waitForFunction(() => document.documentElement.dataset.svBroadHostMatrix === 'approved', null, { timeout: 10_000 });
    const executed = await runPage.evaluate(() => document.documentElement.dataset.svBroadHostMatrix || '');
    return {
      userScriptsToggle,
      broadPermissions,
      blockedSave: saveSummary(blockedSave),
      blockedRegistration,
      blockedError: blockedScript?.settings?._registrationError || '',
      approvedSave: saveSummary(approvedSave),
      approvedError: approvedScript?.settings?._registrationError || '',
      approvedRegistration,
      executed,
    };
  } finally {
    await app?.context.close().catch(() => {});
    await rm(userDataDir, { recursive: true, force: true });
    await rm(staged.root, { recursive: true, force: true });
  }
}

function evaluateChecks(report) {
  const byKind = Object.fromEntries(report.freshInstall.map(scenario => [scenario.kind, scenario]));
  const checks = [];
  const add = (id, passed, detail) => checks.push({ id, status: passed ? 'passed' : 'failed', detail });

  add('shipping-required-host-access',
    byKind.shipping.manifest.hostPermissions.includes('<all_urls>')
      && byKind.shipping.permissions.origins[report.urls.patterns.run] === true
      && byKind.shipping.extensionFetch.ok === true,
    'Shipping grants required <all_urls> and can fetch a page host on a fresh profile.');
  add('shipping-static-bridge', byKind.shipping.contentBridge === true,
    'Shipping injects the .user.js/content bridge on the fixture site.');
  add('retained-bridge-is-not-scoped',
    byKind['retained-bridge'].permissions.origins[report.urls.patterns.run] === false
      && byKind['retained-bridge'].extensionFetch.ok === true
      && byKind['retained-bridge'].contentBridge === true,
    'Moving only host_permissions makes contains() report withheld while the static bridge still supplies broad scriptable and fetch access.');
  add('strict-optional-fresh-install-withheld',
    byKind['strict-optional'].permissions.origins[report.urls.patterns.run] === false
      && byKind['strict-optional'].extensionFetch.ok === false
      && byKind['strict-optional'].contentBridge === false,
    'The strict prototype starts with no site access and no static all-site bridge.');
  add('per-origin-grant-and-revoke',
    report.grantLifecycle.bootstrap.origins[report.urls.patterns.run] === true
      && report.grantLifecycle.persistedGrant.origins[report.urls.patterns.run] === true
      && report.grantLifecycle.confirmedFromGesture.granted === true
      && report.grantLifecycle.removed === true
      && report.grantLifecycle.afterRemove.origins[report.urls.patterns.run] === false
      && report.grantLifecycle.fetchAfterRemove.ok === false,
    'An installed profile preserves a reviewed origin grant, confirms it from a gesture, and revokes it cleanly.');

  const product = report.product;
  add('per-origin-deny',
    product.deniedPermission.origins[report.urls.patterns.denied] === false
      && product.deniedFetch.ok === false,
    'An ungranted origin remains denied while neighboring declared origins are active.');
  add('userscript-registration',
    product.userScriptsToggle.enabledAfter === true
      && product.userScriptsStatus.available === true
      && product.save?.success === true
      && product.storedRegistrationError === ''
      && product.registration.length === 1,
    'A narrow script registers through ScriptVault in the strict optional profile.');
  add('require-resource-connect',
    product.execution.require === 'require-ok'
      && product.execution.resource === 'resource-ok'
      && product.execution.connect === true
      && product.requestCounts[FIXTURE_HOSTS.dependency] > 0
      && product.requestCounts[FIXTURE_HOSTS.api] > 0,
    '@require, @resource, and @connect-backed GM.xmlHttpRequest complete on granted hosts.');
  add('update-url',
    Array.isArray(product.updates)
      && product.updates.some(update => update.id === 'scriptvault-host-matrix-narrow' && update.newVersion === '2.0.0'),
    'The granted @updateURL returns a newer userscript candidate.');
  add('dnr',
    product.execution.dnr === true
      && product.dynamicRules.length > 0
      && product.dnrRequests.some(request => request.matrixHeader === 'dnr-ok'),
    'The script DNR rule is installed and modifies a request from its run host.');
  add('cookies', product.execution.cookie === true,
    'GM.cookie can set and read a cookie after the optional cookies permission persists into the prototype.');
  add('downloads',
    product.execution.download === 'complete'
      && product.requestCounts[FIXTURE_HOSTS.download] > 0,
    'GM_download fetches the granted host and reports browser download completion.');

  const broad = report.broadScript;
  add('all-urls-script-approval',
    broad.broadPermissions.origins['http://*/*'] === true
      && broad.broadPermissions.origins['https://*/*'] === true
      && broad.blockedSave?.success === true
      && broad.blockedRegistration.length === 0
      && broad.blockedError.includes('Broad host access requires explicit per-script opt-in')
      && broad.approvedSave?.success === true
      && broad.approvedError === ''
      && broad.approvedRegistration.length === 1
      && broad.executed === 'approved',
    'A universal script stays unregistered until its per-script broad-access approval is enabled.');

  return checks;
}

function publicReport(report) {
  const { urls, ...rest } = report;
  return {
    ...rest,
    fixture: {
      hosts: FIXTURE_HOSTS,
      originPatterns: urls.patterns,
    },
  };
}

async function runMatrix() {
  const fixture = createFixtureServer();
  const port = await fixture.start();
  const urls = fixtureUrls(port);
  try {
    const freshInstall = [];
    for (const kind of ['shipping', 'retained-bridge', 'strict-optional']) {
      freshInstall.push(await runFreshScenario(kind, urls));
    }
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      decision: 'retain-required-all-urls',
      rationale: 'The retained static content bridge remains a broad scriptable host, while removing it drops compatibility behavior. Keep the current required-host default until the bridge is redesigned and a first-grant UI can be validated interactively.',
      urls,
      freshInstall,
      grantLifecycle: await runGrantLifecycle(urls),
      product: await runProductMatrix(urls, fixture),
      broadScript: await runBroadScriptMatrix(urls),
      checks: [],
      status: 'running',
    };
    report.checks = evaluateChecks(report);
    report.status = report.checks.every(check => check.status === 'passed') ? 'passed' : 'failed';
    return publicReport(report);
  } finally {
    await fixture.close();
  }
}

async function main() {
  const options = parseArgs();
  const report = await runMatrix();
  if (options.report) {
    const reportPath = resolve(PROJECT_ROOT, options.report);
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(`[host-permission-matrix] report: ${reportPath}\n`);
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    for (const check of report.checks) {
      process.stdout.write(`[host-permission-matrix] ${check.status.toUpperCase()} ${check.id}: ${check.detail}\n`);
    }
    process.stdout.write(`[host-permission-matrix] ${report.status.toUpperCase()} (${report.checks.length} checks)\n`);
  }
  if (options.check && report.status !== 'passed') process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`[host-permission-matrix] ${error.stack || error.message || error}`);
    process.exitCode = 2;
  });
}

export {
  evaluateChecks,
  fixtureUrls,
  parseArgs,
  strictOptionalManifest,
};
