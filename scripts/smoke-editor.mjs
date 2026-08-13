// Editor-screen smoke: opens the dashboard, creates a new script (which must
// jump straight into the editor), and verifies the editor chrome is visible,
// hit-testable, and closable. Exists because a z-index regression once left
// the sticky dashboard header painted over the editor's Save/Close row —
// selector-presence checks pass in that state; only hit-testing catches it.
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { closeBrowserWithFallback, removeTempProfileDir } from './browser-smoke-utils.mjs';

const extensionPath = resolve(process.cwd());
// The editor smoke has a 90-second wall-clock budget. Override it only when
// diagnosing a slower environment with SCRIPT_VAULT_EDITOR_SMOKE_TIMEOUT_MS.
const DEFAULT_SMOKE_TIMEOUT_MS = 90000;
const configuredSmokeTimeoutMs = Number.parseInt(
    process.env.SCRIPT_VAULT_EDITOR_SMOKE_TIMEOUT_MS || String(DEFAULT_SMOKE_TIMEOUT_MS),
    10,
);
const SMOKE_TIMEOUT_MS = Number.isFinite(configuredSmokeTimeoutMs) && configuredSmokeTimeoutMs > 0
    ? configuredSmokeTimeoutMs
    : DEFAULT_SMOKE_TIMEOUT_MS;
const WAIT_TIMEOUT_MS = 15000;

function chromeCandidates() {
    const envPaths = [
        process.env.SCRIPT_VAULT_CHROME_PATH,
        process.env.PUPPETEER_EXECUTABLE_PATH,
        process.env.CHROME_PATH,
    ].filter(Boolean);

    if (process.platform === 'win32') {
        return [
            ...envPaths,
            join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
            join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
            join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
            join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
            join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        ];
    }

    if (process.platform === 'darwin') {
        return [
            ...envPaths,
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ];
    }

    return [
        ...envPaths,
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
    ];
}

function findChromeExecutable() {
    const executable = chromeCandidates().find(candidate => candidate && existsSync(candidate));
    if (!executable) {
        throw new Error(
            'Chrome executable not found. Set SCRIPT_VAULT_CHROME_PATH or PUPPETEER_EXECUTABLE_PATH to run the editor smoke test.'
        );
    }
    return executable;
}

async function findExtensionId(browser) {
    const isScriptVaultTarget = target => {
        const url = target.url();
        return url.startsWith('chrome-extension://') && url.endsWith('/background.js');
    };
    const existing = browser.targets().find(isScriptVaultTarget);
    const target = existing || await browser.waitForTarget(isScriptVaultTarget, { timeout: WAIT_TIMEOUT_MS });
    const [, extensionId] = target.url().match(/^chrome-extension:\/\/([^/]+)/) || [];
    if (!extensionId) {
        throw new Error(`Could not resolve extension id from target URL: ${target.url()}`);
    }
    return extensionId;
}

const userDataDir = await mkdtemp(join(tmpdir(), 'scriptvault-editor-smoke-'));
const pageErrors = [];
let executablePath;
let browser;
let activePage = null;
let currentStage = 'initializing';
let hardTimeout = null;
let timeoutTriggered = false;
let cleanupPromise = null;

function currentUrl() {
    try {
        return activePage?.url() || '(no page loaded)';
    } catch {
        return '(page URL unavailable)';
    }
}

async function cleanupResources() {
    if (!cleanupPromise) {
        cleanupPromise = (async () => {
            await closeBrowserWithFallback(browser, 'Editor smoke');
            await removeTempProfileDir(userDataDir, 'Editor smoke');
        })();
    }
    return cleanupPromise;
}

async function runStage(name, operation) {
    currentStage = name;
    try {
        return await operation();
    } catch (error) {
        const detail = error?.message || String(error);
        throw new Error(`${name} failed at ${currentUrl()}: ${detail}`, { cause: error });
    }
}

async function abortHungSmoke() {
    if (timeoutTriggered) return;
    timeoutTriggered = true;
    console.error(`[editor-smoke] timed out after ${SMOKE_TIMEOUT_MS}ms at stage "${currentStage}" URL "${currentUrl()}"; cleaning up the temporary profile.`);
    await cleanupResources();
    process.exit(1);
}

hardTimeout = setTimeout(() => {
    abortHungSmoke().catch(error => {
        console.error(error?.stack || error?.message || error);
        process.exit(1);
    });
}, SMOKE_TIMEOUT_MS);

try {
    executablePath = await runStage('locate Chrome executable', () => findChromeExecutable());
    browser = await runStage('launch headless Chrome', () => puppeteer.launch({
        executablePath,
        timeout: WAIT_TIMEOUT_MS,
        headless: true,
        userDataDir,
        pipe: true,
        enableExtensions: [extensionPath],
        args: [
            '--disable-dev-shm-usage',
            '--no-default-browser-check',
            '--no-first-run',
            '--no-sandbox',
            '--window-size=1440,900',
        ],
        defaultViewport: { width: 1440, height: 900 },
    }));

    const extensionId = await runStage('resolve extension id', () => findExtensionId(browser));
    const page = await runStage('create dashboard page', () => browser.newPage());
    activePage = page;
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') pageErrors.push(message.text());
    });

    await runStage('load dashboard', () => page.goto(`chrome-extension://${extensionId}/pages/dashboard.html`, {
        waitUntil: 'domcontentloaded',
        timeout: WAIT_TIMEOUT_MS,
    }));
    await runStage('wait for scripts panel', () => page.waitForSelector('#scriptsPanel.tm-panel.active', { timeout: WAIT_TIMEOUT_MS }));
    await runStage('wait for New Script control', () => page.waitForSelector('#btnNewScript', { visible: true, timeout: WAIT_TIMEOUT_MS }));

    // First open after a version bump shows the What's New modal — it renders
    // asynchronously, so wait for it briefly and dismiss it the way a user
    // would before interacting with the dashboard.
    const whatsNewDismiss = await runStage("wait for What's New dialog", () => page.waitForSelector('#svWnDismiss', { timeout: WAIT_TIMEOUT_MS }).catch(() => null));
    if (whatsNewDismiss) {
        await runStage("dismiss What's New dialog", () => page.evaluate(() => {
            const button = document.querySelector('#svWnDismiss');
            if (!button) return false;
            button.click();
            return true;
        }));
        await runStage("wait for What's New dialog to close", () => page.waitForFunction(() => !document.querySelector('.sv-wn-overlay'), { timeout: WAIT_TIMEOUT_MS }));
    }

    // New Script must open the editor directly — no template modal in between.
    await runStage('open New Script editor', () => page.evaluate(() => {
        const button = document.getElementById('btnNewScript');
        if (!button) return false;
        button.click();
        return true;
    }));
    await runStage('wait for editor overlay', () => page.waitForSelector('#editorOverlay.active', { timeout: WAIT_TIMEOUT_MS }));
    // The dashboard uses same-document View Transitions for editor entry. During
    // that short snapshot phase Chrome intentionally hit-tests the transition
    // root, so wait for the live editor DOM before asserting z-index coverage.
    await runStage('wait for editor transition to settle', () => page.waitForFunction(
        () => !document.documentElement.classList.contains('sv-vt-editor'),
        { timeout: WAIT_TIMEOUT_MS }
    ));

    // Exercise the local userscript language server through the real sandbox,
    // worker transport, Monaco model bridge, and rendered diagnostic layer.
    const editorFrame = await runStage('wait for editor sandbox frame', () => page.waitForFrame(
        frame => frame.url().includes('/pages/editor-sandbox.html'),
        { timeout: WAIT_TIMEOUT_MS }
    ));
    await runStage('wait for Monaco editor', () => editorFrame.waitForSelector('.monaco-editor', { timeout: WAIT_TIMEOUT_MS }));
    const diagnosticFixture = [
        '// ==UserScript==',
        '// @name Smoke test',
        '// @run-at eventually',
        '// @require http://example.com/helper.js',
        '// @connect *',
        '// ==/UserScript==',
    ].join('\n');
    await runStage('send diagnostic fixture to editor', () => page.evaluate(value => {
        document.getElementById('monacoFrame').contentWindow.postMessage({
            type: 'set-value',
            value,
            scriptId: 'editor-smoke-lsp',
        }, '*');
    }, diagnosticFixture));
    await runStage('wait for editor diagnostics', () => editorFrame.waitForFunction(() => {
        const monaco = window.ScriptVaultMonacoEsm?.monaco;
        return monaco?.editor?.getModelMarkers?.({}).length >= 4;
    }, { timeout: WAIT_TIMEOUT_MS }));
    // Let Chrome paint Monaco's marker decorations without continuously
    // polling the backgrounded renderer. Semantic markers can be active while
    // the decoration layer is still waiting for its next frame.
    await runStage('allow editor diagnostics to paint', () => new Promise(resolve => setTimeout(resolve, 350)));
    await runStage('capture editor smoke screenshot', () => page.screenshot({ path: join(extensionPath, 'smoke-editor.png') }));
    const diagnostics = await runStage('read editor diagnostics', () => editorFrame.evaluate(() => {
        const monaco = window.ScriptVaultMonacoEsm?.monaco;
        return {
            markerCount: monaco?.editor?.getModelMarkers?.({}).length || 0,
            renderedWarningCount: document.querySelectorAll('.squiggly-warning').length,
        };
    }));

    const geometry = await runStage('measure editor control hit-testing', () => page.evaluate(() => {
        const rect = id => {
            const el = document.getElementById(id) || document.querySelector(id);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, height: r.height, width: r.width, x: r.x + r.width / 2, y: r.y + r.height / 2 };
        };
        // Hit-test: the element rendered at a control's center must be the
        // control itself (or a descendant) — catches anything painted on top.
        const hit = id => {
            const el = document.getElementById(id);
            if (!el) return 'missing';
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return 'zero-size';
            const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return el === at || el.contains(at) ? 'ok' : `covered-by:${at ? (at.id || at.className || at.tagName) : 'none'}`;
        };
        const overlay = document.getElementById('editorOverlay').getBoundingClientRect();
        const modalOpen = Boolean(document.querySelector('.modal-overlay.active, #modalOverlay.active, .modal.active'))
            || getComputedStyle(document.getElementById('modalOverlay') || document.createElement('div')).display === 'flex';
        const wrapper = rect('editorWrapper');
        return {
            overlayTop: overlay.top,
            overlayHeight: overlay.height,
            viewport: { w: innerWidth, h: innerHeight },
            modalOpen,
            header: rect('editorTitle'),
            wrapper,
            codePaneShare: wrapper ? wrapper.height / innerHeight : 0,
            runControl: (() => {
                const button = document.getElementById('btnEditorRunNow');
                const box = button?.getBoundingClientRect();
                return {
                    hidden: button?.hidden === true,
                    visible: Boolean(box && box.width > 0 && box.height > 0),
                    hit: hit('btnEditorRunNow'),
                };
            })(),
            hits: {
                save: hit('btnEditorSave'),
                close: hit('btnEditorClose'),
                export: hit('btnEditorExport'),
                toggle: hit('btnEditorToggle'),
                duplicate: hit('btnEditorDuplicate'),
                delete: hit('btnEditorDelete'),
                tabCode: hit('editorTabCode'),
                tabSettings: hit('editorTabScriptSettings'),
                tabInfo: hit('editorTabInfo'),
                undo: hit('tbtnUndo'),
                find: hit('tbtnSearch'),
                beautify: hit('tbtnBeautify'),
                share: hit('tbtnShare'),
            },
        };
    }));

    await runStage('validate editor geometry and diagnostics', async () => {
        const failures = [];
        if (geometry.modalOpen) failures.push('a template/modal popup opened on New Script');
        if (geometry.overlayTop !== 0) failures.push(`editor overlay does not start at top of viewport (top=${geometry.overlayTop})`);
        if (Math.abs(geometry.overlayHeight - geometry.viewport.h) > 2) failures.push(`editor overlay does not fill viewport height (${geometry.overlayHeight}/${geometry.viewport.h})`);
        if (geometry.codePaneShare < 0.7) failures.push(`code pane uses only ${(geometry.codePaneShare * 100).toFixed(0)}% of viewport height (expected >= 70%)`);
        for (const [name, result] of Object.entries(geometry.hits)) {
            if (result !== 'ok') failures.push(`${name} control not clickable: ${result}`);
        }
        if (geometry.runControl.visible && geometry.runControl.hit !== 'ok') {
            failures.push(`run control not clickable: ${geometry.runControl.hit}`);
        }
        if (!geometry.runControl.visible && !geometry.runControl.hidden) {
            failures.push('run control has zero size without being capability-hidden');
        }
        if (diagnostics.renderedWarningCount < 3) {
            failures.push(`only ${diagnostics.renderedWarningCount} userscript warning decorations rendered`);
        }
        const workerErrors = pageErrors.filter(error =>
            error.includes("Failed to construct 'Worker'") ||
            error.includes('lib/monaco-esm/workers/')
        );
        if (workerErrors.length > 0) {
            failures.push(`Monaco worker errors observed: ${workerErrors.slice(0, 2).join(' | ')}`);
        }
        if (failures.length > 0) {
            throw new Error(`Editor smoke failed: ${failures.join('; ')}`);
        }
    });

    // Close must work with a plain click.
    await runStage('close editor', () => page.evaluate(() => {
        const button = document.getElementById('btnEditorClose');
        if (!button) return false;
        button.click();
        return true;
    }));
    await runStage('wait for editor to close', () => page.waitForFunction(() => !document.getElementById('editorOverlay').classList.contains('active'), { timeout: WAIT_TIMEOUT_MS }));

    console.log(`Editor smoke passed: overlay full-viewport, code pane ${(geometry.codePaneShare * 100).toFixed(0)}% of viewport, all ${Object.keys(geometry.hits).length} controls hit-testable, ${diagnostics.markerCount} userscript diagnostics active (${diagnostics.renderedWarningCount} warning decorations rendered), close works.`);
    console.log('Screenshot: smoke-editor.png');
    if (pageErrors.length > 0) {
        console.warn(`Editor smoke observed ${pageErrors.length} console/page error(s):`);
        pageErrors.slice(0, 5).forEach(error => console.warn(`- ${error}`));
    }
} catch (error) {
    if (!timeoutTriggered) {
        process.exitCode = 1;
        console.error(`[editor-smoke] ${error?.stack || error?.message || error}`);
        if (pageErrors.length > 0) {
            console.error(`[editor-smoke] observed ${pageErrors.length} console/page error(s):`);
            pageErrors.slice(0, 10).forEach(pageError => console.error(`- ${pageError}`));
        }
    }
} finally {
    if (hardTimeout) clearTimeout(hardTimeout);
    await cleanupResources();
}
