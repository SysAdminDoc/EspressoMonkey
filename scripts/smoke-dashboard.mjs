import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import {
    closeBrowserWithFallback,
    removeTempProfileDir,
    settleWhatsNew,
} from './browser-smoke-utils.mjs';

const extensionPath = resolve(process.cwd());

/**
 * Focus a workbench shortcut and activate it, verifying focus actually landed
 * first. If something took focus in between (a late modal), clear it and retry
 * rather than sending Enter to whatever happens to be focused.
 */
async function activateWorkbenchShortcut(page, selector, attempts = 4) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        await settleWhatsNew(page);
        await page.focus(selector);
        const focusedId = await page.evaluate(
            (sel) => (document.activeElement === document.querySelector(sel)
                ? true
                : (document.activeElement?.id || document.activeElement?.tagName || 'unknown')),
            selector,
        );
        if (focusedId === true) {
            await page.keyboard.press('Enter');
            return;
        }
        if (attempt === attempts) {
            throw new Error(`Could not focus ${selector}: focus was held by ${focusedId}`);
        }
    }
}

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
            'Chrome executable not found. Set SCRIPT_VAULT_CHROME_PATH or PUPPETEER_EXECUTABLE_PATH to run the dashboard smoke test.'
        );
    }
    return executable;
}

function assertExtensionFiles() {
    const requiredFiles = [
        'manifest.json',
        'background.js',
        'pages/dashboard.html',
        'pages/dashboard.js',
        'content.js',
    ];
    const missing = requiredFiles.filter(file => !existsSync(join(extensionPath, file)));
    if (missing.length > 0) {
        throw new Error(`Missing extension files: ${missing.join(', ')}. Run npm run build before the smoke test.`);
    }
}

async function findExtensionId(browser) {
    const isScriptVaultTarget = target => {
        const url = target.url();
        return url.startsWith('chrome-extension://') && url.endsWith('/background.js');
    };

    const existing = browser.targets().find(isScriptVaultTarget);
    const target = existing || await browser.waitForTarget(isScriptVaultTarget, { timeout: 15000 });
    const [, extensionId] = target.url().match(/^chrome-extension:\/\/([^/]+)/) || [];
    if (!extensionId) {
        throw new Error(`Could not resolve extension id from target URL: ${target.url()}`);
    }
    return extensionId;
}

async function dashboardDebugSnapshot(page) {
    return page.evaluate(() => ({
        url: location.href,
        title: document.title,
        bodyText: document.body?.innerText?.slice(0, 500) || '',
        ids: Array.from(document.querySelectorAll('[id]')).slice(0, 20).map(node => node.id),
    }));
}

const scriptsTabSelector = '.tm-tab[data-tab="scripts"]';

assertExtensionFiles();

const executablePath = findChromeExecutable();
const userDataDir = await mkdtemp(join(tmpdir(), 'scriptvault-smoke-'));
const pageErrors = [];
let browser;

try {
    browser = await puppeteer.launch({
        executablePath,
        headless: true,
        userDataDir,
        pipe: true,
        enableExtensions: [extensionPath],
        args: [
            '--disable-dev-shm-usage',
            '--no-default-browser-check',
            '--no-first-run',
            '--no-sandbox',
        ],
    });

    const extensionId = await findExtensionId(browser);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') pageErrors.push(message.text());
    });

    await page.goto(`chrome-extension://${extensionId}/pages/dashboard.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
    });
    try {
        await page.waitForSelector('#scriptsPanel.tm-panel.active', { timeout: 15000 });
        await page.waitForSelector(scriptsTabSelector, { timeout: 15000 });
    } catch (error) {
        console.error('Dashboard smoke selector wait failed:', await dashboardDebugSnapshot(page));
        throw error;
    }

    const snapshot = await page.evaluate(() => ({
        title: document.title,
        version: chrome.runtime.getManifest().version,
        activeTab: document.querySelector('.tm-tab[data-tab="scripts"]')?.textContent?.trim(),
        selectedTab: document.querySelector('.tm-tab[data-tab="scripts"]')?.getAttribute('aria-selected'),
        hasHeader: Boolean(document.querySelector('.tm-header')),
        hasScriptsPanel: Boolean(document.querySelector('#scriptsPanel.tm-panel.active')),
        hasNewScriptButton: Boolean(document.querySelector('#btnNewScript')),
        hasSearch: Boolean(document.querySelector('#scriptSearch')),
    }));

    const failures = [];
    if (snapshot.title !== 'ScriptVault Dashboard') failures.push(`unexpected title: ${snapshot.title}`);
    if (!/^scripts$/i.test(snapshot.activeTab || '')) failures.push(`unexpected active tab: ${snapshot.activeTab}`);
    if (snapshot.selectedTab !== 'true') failures.push('installed scripts tab is not selected');
    if (!snapshot.hasHeader) failures.push('dashboard header missing');
    if (!snapshot.hasScriptsPanel) failures.push('scripts panel missing or inactive');
    if (!snapshot.hasNewScriptButton) failures.push('new script button missing');
    if (!snapshot.hasSearch) failures.push('script search missing');

    if (failures.length > 0) {
        throw new Error(`Dashboard smoke failed: ${failures.join('; ')}`);
    }

    // The What's New modal is opened from an ASYNC storage read, so it can
    // appear at any point after load — including after a one-shot check found
    // nothing — and it focuses its own Continue button when it does. Sampling
    // once and moving on let a late modal swallow the keystroke meant for a
    // workbench shortcut (observed as activeElement 'svWnDismiss' with the
    // Settings panel never activating). Settle it, then re-check per shortcut.
    await settleWhatsNew(page);

    const workbenchDestinations = [
        { target: 'signingTrustSection', tab: 'utilities', filter: 'diagnostics' },
        { target: 'runtimeHostPermissionsSection', tab: 'settings', filter: 'security' },
        { target: 'pageAccessSettingsRow', tab: 'settings', filter: 'security' },
    ];
    for (const destination of workbenchDestinations) {
        const shortcutSelector = `[data-workbench-target="${destination.target}"]`;
        await activateWorkbenchShortcut(page, shortcutSelector);
        const destinationReady = ({ target, tab, filter }) => {
            const panel = document.getElementById(`${tab}Panel`);
            const targetElement = document.getElementById(target);
            const filterButton = document.querySelector(
                tab === 'utilities'
                    ? `[data-utilities-filter="${filter}"]`
                    : `[data-settings-filter="${filter}"]`
            );
            const focusSurface = targetElement?.closest('.settings-section') || targetElement;
            return Boolean(
                panel?.classList.contains('active')
                && !panel.hidden
                && filterButton?.getAttribute('aria-pressed') === 'true'
                && document.activeElement === targetElement
                && focusSurface?.dataset.workbenchFocus === 'true'
            );
        };
        try {
            await page.waitForFunction(destinationReady, { timeout: 5000, polling: 100 }, destination);
        } catch (error) {
            const detail = await page.evaluate(({ target, tab, filter }) => {
                const shortcut = document.querySelector(`[data-workbench-target="${target}"]`);
                const panel = document.getElementById(`${tab}Panel`);
                const targetElement = document.getElementById(target);
                const filterButton = document.querySelector(
                    tab === 'utilities'
                        ? `[data-utilities-filter="${filter}"]`
                        : `[data-settings-filter="${filter}"]`
                );
                const focusSurface = targetElement?.closest('.settings-section') || targetElement;
                return {
                    shortcut: shortcut ? {
                        disabled: shortcut.disabled,
                        tabIndex: shortcut.tabIndex,
                        connected: shortcut.isConnected,
                        rect: shortcut.getBoundingClientRect().toJSON(),
                        display: getComputedStyle(shortcut).display,
                        visibility: getComputedStyle(shortcut).visibility,
                        pointerEvents: getComputedStyle(shortcut).pointerEvents,
                    } : null,
                    panelActive: panel?.classList.contains('active'),
                    panelHidden: panel?.hidden,
                    filterPressed: filterButton?.getAttribute('aria-pressed'),
                    activeElement: document.activeElement?.id,
                    focusSurface: focusSurface?.id,
                    focusState: focusSurface?.dataset.workbenchFocus,
                };
            }, destination);
            throw new Error(`Workbench shortcut ${destination.target} failed: ${JSON.stringify(detail)}`, { cause: error });
        }
    }

    // Settings redesign flow: category state is singular, search spans every
    // category without silently changing the chosen view, and Recovery links
    // into the existing backup surface instead of inventing a second flow.
    await page.evaluate(() => document.querySelector('[data-settings-filter="core"]')?.click());
    await page.waitForFunction(() => {
        const core = document.querySelector('[data-settings-filter="core"]');
        const recovery = document.querySelector('[data-settings-filter="recovery"]');
        return core?.getAttribute('aria-pressed') === 'true'
            && recovery?.getAttribute('aria-pressed') === 'false'
            && !document.querySelector('[data-settings-label="general"]')?.hidden
            && document.getElementById('recoveryActionsSection')?.hidden;
    }, { timeout: 5000, polling: 100 });

    await page.evaluate(() => {
        const input = document.getElementById('settingsQuickFilter');
        input.value = 'cookies';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => {
        const core = document.querySelector('[data-settings-filter="core"]');
        const security = document.getElementById('securitySettingsSection');
        return core?.getAttribute('aria-pressed') === 'true'
            && security?.hidden === false
            && document.getElementById('settingsFilterStatus')?.textContent.includes('cookies');
    }, { timeout: 5000, polling: 100 });

    await page.evaluate(() => {
        const input = document.getElementById('settingsQuickFilter');
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector('[data-settings-filter="recovery"]')?.click();
    });
    await page.waitForFunction(() => {
        const panel = document.getElementById('settingsPanel');
        const saveSummary = panel?.querySelector('.settings-save-summary');
        return panel?.dataset.settingsCategory === 'recovery'
            && document.querySelector('[data-settings-filter="recovery"]')?.getAttribute('aria-pressed') === 'true'
            && document.querySelector('[data-settings-filter="core"]')?.getAttribute('aria-pressed') === 'false'
            && document.getElementById('recoveryActionsSection')?.hidden === false
            && getComputedStyle(saveSummary).display === 'none';
    }, { timeout: 5000, polling: 100 });

    await page.evaluate(() => document.getElementById('btnOpenBackupRestore')?.click());
    await page.waitForFunction(() => {
        const panel = document.getElementById('utilitiesPanel');
        const backup = document.querySelector('[data-utilities-filter="backup"]');
        return panel?.classList.contains('active') && !panel.hidden
            && backup?.getAttribute('aria-pressed') === 'true';
    }, { timeout: 5000, polling: 100 });

    await page.evaluate(() => document.querySelector('.sv-rail-item[data-workbench-tab="scripts"]')?.click());
    await page.waitForFunction(() => {
        const panel = document.getElementById('scriptsPanel');
        return panel?.classList.contains('active') && !panel.hidden;
    }, { timeout: 5000, polling: 100 });
    await page.evaluate(() => document.getElementById('btnNewScript')?.click());
    try {
        await page.waitForFunction(() => {
            const overlay = document.querySelector('.editor-overlay.active');
            if (!(overlay instanceof HTMLElement) || overlay.hidden) return false;
            const rect = overlay.getBoundingClientRect();
            return getComputedStyle(overlay).display !== 'none' && rect.width > 0 && rect.height > 0;
        }, { timeout: 15000, polling: 100 });
    } catch (error) {
        const detail = await page.evaluate(() => ({
            activeElement: document.activeElement?.id || document.activeElement?.tagName,
            editor: (() => {
                const overlay = document.getElementById('editorOverlay');
                if (!overlay) return null;
                const rect = overlay.getBoundingClientRect();
                const style = getComputedStyle(overlay);
                return {
                    className: overlay.className,
                    hidden: overlay.hidden,
                    ariaHidden: overlay.getAttribute('aria-hidden'),
                    display: style.display,
                    visibility: style.visibility,
                    opacity: style.opacity,
                    width: rect.width,
                    height: rect.height,
                };
            })(),
            toasts: Array.from(document.querySelectorAll('#toastContainer .toast'))
                .map(toast => toast.textContent?.trim())
                .filter(Boolean),
            newScriptDisabled: document.getElementById('btnNewScript')?.disabled,
        }));
        throw new Error(`Editor did not open after New Script: ${JSON.stringify(detail)}`, { cause: error });
    }
    await page.evaluate(() => document.getElementById('editorTabScriptSettings')?.click());
    await page.waitForSelector('#scriptsettingsPanel:not([hidden])', { visible: true, timeout: 5000 });
    await page.evaluate(() => {
        const notes = document.getElementById('scriptNotes');
        notes.value = 'Smoke-test unsaved state';
        notes.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => {
        const status = document.getElementById('scriptSettingsSaveStatus');
        return status?.dataset.state === 'dirty' && /unsaved/i.test(status.textContent || '');
    }, { timeout: 5000, polling: 100 });

    await page.evaluate(() => {
        window.ScriptVaultDashboardUI.confirm(
            'Factory Reset ScriptVault?',
            'Delete every script and restore all settings to their defaults? This cannot be undone.',
            { confirmLabel: 'Factory Reset', tone: 'danger' }
        );
    });
    await page.waitForSelector('#modal.show', { visible: true, timeout: 5000 });
    await page.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Cancel', { timeout: 5000, polling: 100 });
    const destructiveDialog = await page.evaluate(() => ({
        labels: Array.from(document.querySelectorAll('#modalActions button')).map(button => button.textContent.trim()),
        dangerClass: document.querySelector('#modalActions .btn-danger')?.textContent.trim(),
        focusedLabel: document.activeElement?.textContent?.trim(),
        title: document.getElementById('modalTitle')?.textContent?.trim(),
    }));
    if (destructiveDialog.title !== 'Factory Reset ScriptVault?'
        || destructiveDialog.dangerClass !== 'Factory Reset'
        || destructiveDialog.focusedLabel !== 'Cancel'
        || destructiveDialog.labels.join('|') !== 'Cancel|Factory Reset') {
        throw new Error(`Destructive dialog contract failed: ${JSON.stringify(destructiveDialog)}`);
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#modal.show'), { timeout: 5000, polling: 100 });

    console.log(`Dashboard smoke passed for ScriptVault ${snapshot.version} (${extensionId}); ${workbenchDestinations.length} deep links, settings search/recovery routing, per-script dirty state, and destructive dialog focus verified.`);
    if (pageErrors.length > 0) {
        console.warn(`Dashboard smoke observed ${pageErrors.length} console/page error(s):`);
        pageErrors.slice(0, 5).forEach(error => console.warn(`- ${error}`));
    }
} finally {
    await closeBrowserWithFallback(browser, 'Dashboard smoke');
    await removeTempProfileDir(userDataDir, 'Dashboard smoke');
}
