import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const installHtml = readFileSync(resolve(process.cwd(), "pages/install.html"), "utf8");
const installJs = readFileSync(resolve(process.cwd(), "pages/install.js"), "utf8");
const popupHtml = readFileSync(resolve(process.cwd(), "pages/popup.html"), "utf8");
const sidepanelHtml = readFileSync(resolve(process.cwd(), "pages/sidepanel.html"), "utf8");
const sidepanelJs = readFileSync(resolve(process.cwd(), "pages/sidepanel.js"), "utf8");
const devtoolsHtml = readFileSync(resolve(process.cwd(), "pages/devtools-panel.html"), "utf8");
const devtoolsJs = readFileSync(resolve(process.cwd(), "pages/devtools-panel.js"), "utf8");
const dashboardHtml = readFileSync(resolve(process.cwd(), "pages/dashboard.html"), "utf8");
const dashboardJs = readFileSync(resolve(process.cwd(), "pages/dashboard.js"), "utf8");
const dashboardWorkbenchCss = readFileSync(resolve(process.cwd(), "pages/dashboard-workbench.css"), "utf8");
const themeTokensCss = readFileSync(resolve(process.cwd(), "pages/theme-tokens.css"), "utf8");
const pageDirJs = readFileSync(resolve(process.cwd(), "pages/page-dir.js"), "utf8");
const monacoAdapterJs = readFileSync(resolve(process.cwd(), "pages/monaco-adapter.js"), "utf8");
const editorSandboxHtml = readFileSync(resolve(process.cwd(), "pages/editor-sandbox.html"), "utf8");

function parseHtml(source) {
  return new DOMParser().parseFromString(source, "text/html");
}

function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    const channels = hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255);
    const [r, g, b] = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function pageUiFiles(dir = resolve(process.cwd(), "pages")) {
  return readdirSync(dir).flatMap((entry) => {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) return pageUiFiles(full);
    return /\.(html|css|js)$/.test(entry) ? [full] : [];
  });
}

describe("cross-surface UX audit", () => {
  test("UI surfaces avoid oversized rounded backdrops and blur-heavy chrome", () => {
    const disallowedRadius = /border-radius:[^;]*(?:1[3-9]|2[0-9]|999)px/;
    const disallowedScaledRadius = /border-radius:\s*calc\((?:9|1[0-9])px \* var\(--ui-scale\)\)/;
    const blurBackdrop = /(?:-webkit-)?backdrop-filter:\s*blur\(/;
    const offenders = [];

    for (const file of pageUiFiles()) {
      const source = readFileSync(file, "utf8");
      if (disallowedRadius.test(source)) offenders.push(`${file}: oversized border radius`);
      if (disallowedScaledRadius.test(source)) offenders.push(`${file}: unclamped scaled border radius`);
      if (blurBackdrop.test(source)) offenders.push(`${file}: blur backdrop`);
    }

    expect(offenders).toEqual([]);
  });

  test("shared controls enforce the finite radius, focus, disabled, and reduced-motion contracts", () => {
    const forbiddenPillRadius = /border-radius:\s*(?:50%|100%|999(?:9)?px)/;
    const allowedRadiusValues = new Set([0, 4, 6, 8, 10, 12]);
    const offenders = [];
    for (const file of pageUiFiles()) {
      const source = readFileSync(file, "utf8");
      if (forbiddenPillRadius.test(source)) offenders.push(`${file}: circular or pill radius`);
      for (const declaration of source.matchAll(/border-radius:\s*([^;}\n]+)/g)) {
        const numericValues = Array.from(declaration[1].matchAll(/(\d+)px/g), match => Number(match[1]));
        if (numericValues.some(value => !allowedRadiusValues.has(value))) {
          offenders.push(`${file}: radius outside the 0/4/6/8/10/12 scale (${declaration[1].trim()})`);
        }
      }
    }

    expect(offenders).toEqual([]);
    expect(dashboardHtml).toContain(".sv-status-dot {\n            width: 9px;\n            height: 9px;\n            border-radius: var(--sv-radius-sm)");
    expect(sidepanelHtml).toContain(".sp-toggle-slider::before");
    expect(sidepanelHtml).toContain("border-radius: var(--sv-radius-control)");
    expect(sidepanelHtml).not.toContain("border-radius: 50%");
    expect(themeTokensCss).toContain("--sv-radius-sm: 4px");
    expect(themeTokensCss).toContain("--sv-radius-control: 6px");
    expect(themeTokensCss).toContain("--sv-radius-card: 10px");
    expect(themeTokensCss).toContain("--sv-radius-dialog: 12px");
    expect(themeTokensCss).toContain('[role="tab"]):focus-visible');
    expect(themeTokensCss).toContain("outline: 2px solid var(--sv-accent) !important");
    expect(themeTokensCss).toContain("cursor: not-allowed");
    expect(themeTokensCss).toContain("@media (prefers-reduced-motion: reduce)");
  });

  test("semantic accent foregrounds meet AA contrast without direct white control overrides", () => {
    const pairs = [
      ['#06130b', '#35d07f'], ['#052e16', '#16a34a'], ['#152115', '#a6e3a1'], ['#04160a', '#22c55e'],
      ['#06101e', '#60a5fa'], ['#ffffff', '#2563eb'], ['#1b0404', '#ef4444'], ['#ffffff', '#dc2626'],
      ['#1c1101', '#f59e0b'], ['#1c1101', '#d97706'],
    ];
    expect(pairs.map(([foreground, background]) => contrastRatio(foreground, background)).every(ratio => ratio >= 4.5)).toBe(true);

    const directWhiteControl = /(?:color|background):\s*#(?:fff|ffffff)(?:\s|;|$)/i;
    const offenders = pageUiFiles().filter(file => directWhiteControl.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
    expect(themeTokensCss).toContain("--sv-text-on-accent: #052e16");
    expect(themeTokensCss).toContain("--sv-text-on-info: #ffffff");
    expect(themeTokensCss).toContain("--sv-text-on-danger: #ffffff");
  });

  test("dashboard navigation and deep panels expose honest destinations and page hierarchy", () => {
    const doc = parseHtml(dashboardHtml);
    const primaryItems = Array.from(doc.querySelectorAll(".sv-rail-nav > .sv-rail-item"));
    const trustItems = Array.from(doc.querySelectorAll('.sv-rail-section[aria-label="Trust tools"] .sv-rail-subitem'));

    expect(primaryItems.map((item) => item.dataset.workbenchTab)).toEqual([
      "scripts", "updates", "settings", "utilities", "trash", "help",
    ]);
    expect(primaryItems.map((item) => item.textContent?.replace(/\s+/g, " ").trim())).not.toContain("Collections 0");
    expect(primaryItems.map((item) => item.textContent?.replace(/\s+/g, " ").trim())).not.toContain("History");
    expect(primaryItems.every((item) => item.getAttribute("role") === "tab")).toBe(true);
    expect(primaryItems.every((item) => item.hasAttribute("aria-controls"))).toBe(true);
    expect(dashboardHtml).not.toContain("ScriptVault Pro");
    expect(trustItems.map((item) => ({
      label: item.textContent?.replace(/\s+/g, " ").trim(),
      tab: item.dataset.workbenchTab,
      filter: item.dataset.workbenchFilter,
      target: item.dataset.workbenchTarget,
    }))).toEqual([
      { label: "T Trusted Sources", tab: "utilities", filter: "diagnostics", target: "signingTrustSection" },
      { label: "P Permissions", tab: "settings", filter: "security", target: "runtimeHostPermissionsSection" },
      { label: "D Domain Access", tab: "settings", filter: "security", target: "pageAccessSettingsRow" },
    ]);
    expect(doc.getElementById("signingTrustSection")?.getAttribute("role")).toBe("region");
    expect(doc.getElementById("runtimeHostPermissionsSection")?.getAttribute("role")).toBe("region");
    expect(dashboardWorkbenchCss).toContain(".tm-header {\n  display: none;");
    expect(dashboardWorkbenchCss).toContain(".settings-hero,");
    expect(dashboardWorkbenchCss).toContain("display: grid !important");
    expect(dashboardWorkbenchCss).toContain("#settingsPanel .settings-section");
    expect(dashboardWorkbenchCss).toContain("#utilitiesPanel .settings-section");
    expect(dashboardWorkbenchCss).toContain(".utilities-shell > .utilities-toolbar");
    expect(dashboardWorkbenchCss).toContain("#trashPanel .trash-surface");
    expect(dashboardJs).toContain("getActiveWorkbenchTab(nextTab)?.focus()");
    expect(dashboardJs).toContain("button.getAttribute('role') === 'tab'");
    expect(dashboardJs).toContain("function focusWorkbenchDestination(targetId)");
    expect(dashboardJs).toContain("if (!focusWorkbenchDestination(targetId)) filterButton?.focus()");
    expect(dashboardWorkbenchCss).toContain('[data-workbench-focus="true"]');
    const dashboardSmoke = readFileSync(resolve(process.cwd(), "scripts/smoke-dashboard.mjs"), "utf8");
    expect(dashboardSmoke).toContain("const workbenchDestinations = [");
    expect(dashboardSmoke).toContain("document.activeElement === targetElement");
    expect(dashboardSmoke).toContain("destructiveDialog.focusedLabel !== 'Cancel'");
  });

  test("image-guided workbench v3 keeps commands, filters, inspection, and row actions progressive", () => {
    const doc = parseHtml(dashboardHtml);
    const topbar = doc.querySelector(".sv-workbench-topbar");
    const stats = doc.querySelectorAll(".scripts-shell-stats > .scripts-shell-stat");
    const inspectorTabs = Array.from(doc.querySelectorAll("[data-inspector-tab]"));
    const inspectorViews = Array.from(doc.querySelectorAll("[data-inspector-view]"));

    expect(existsSync(resolve(process.cwd(), "assets/scriptvault-workbench-concept-v3.png"))).toBe(true);
    expect(topbar?.querySelector("#btnWorkbenchCommand")?.getAttribute("aria-keyshortcuts")).toBe("Control+K");
    expect(topbar?.querySelector("#btnNewScript")).not.toBeNull();
    expect(topbar?.querySelector("#svCommandHealth[role='status']")).not.toBeNull();
    expect(stats).toHaveLength(3);
    expect(doc.querySelectorAll("#btnNewScript")).toHaveLength(1);
    expect(doc.querySelector("#siteFilterSelect option")?.textContent).toBe("All sites");
    expect(doc.querySelector("#savedViewSelect option")?.textContent).toBe("Saved views");
    expect(doc.querySelector("#siteFilterSelect")?.getAttribute("data-i18n-aria-label")).toBe("scriptFilterSiteAria");
    expect(doc.querySelector("#savedViewSelect")?.getAttribute("data-i18n-aria-label")).toBe("scriptSavedViewAria");
    expect(doc.querySelector("#btnWorkbenchCommand span[data-i18n]")?.getAttribute("data-i18n")).toBe("workbenchCommandSearch");
    expect(doc.querySelector("#scriptInspectorPanel")?.getAttribute("data-i18n-aria-label")).toBe("inspectorAria");
    expect(doc.querySelector("#scriptInspectorEdit span[data-i18n='edit']")).not.toBeNull();
    expect(doc.querySelector("[data-i18n='disable']")).toBeNull();
    expect(doc.querySelector("#btnEditorToggleLabel")?.getAttribute("data-i18n")).toBe("disableAction");
    expect(inspectorTabs.map(tab => tab.textContent?.trim())).toEqual(["Overview", "Access", "Activity"]);
    expect(inspectorViews.map(view => view.dataset.inspectorView)).toEqual(["overview", "access", "activity"]);
    expect(inspectorViews.slice(1).every(view => view.hidden)).toBe(true);
    expect(doc.querySelector("#scriptInspectorPanel[data-state='empty'] .script-inspector-empty")).not.toBeNull();
    expect(dashboardJs).toContain("function updateSiteFilterOptions()");
    expect(dashboardJs).toContain("allOption.textContent = tDashboard('scriptFilterAllSites', 'All sites')");
    expect(dashboardJs).toContain("translate: tDashboard");
    expect(dashboardJs).toContain("tDashboard('inspectorNoScriptSelected', 'No script selected')");
    expect(dashboardJs).toContain("tDashboard('workbenchSyncReady', 'Sync ready')");
    expect(dashboardJs).toContain("const matchesSite = siteFilter === 'all'");
    expect(dashboardJs).toContain("elements.scriptInspectorViews?.forEach(view =>");
    expect(dashboardJs).toContain('popover="auto" role="menu"');
    expect(dashboardJs).toContain("rowMenu?.addEventListener('beforetoggle'");
    expect(dashboardWorkbenchCss).toContain("Workbench concept v3");
    expect(dashboardWorkbenchCss).toContain("Visual system simplification v4");
    expect(dashboardWorkbenchCss).toContain("v5 final precedence");
    expect(dashboardWorkbenchCss).toContain("#settingsEmptyState[hidden]");
    expect(dashboardWorkbenchCss).toContain("#helpPanel .help-step");
    expect(dashboardWorkbenchCss).toContain(".scripts-toolbar.has-selection .bulk-action-cluster");
    expect(dashboardWorkbenchCss).toContain(".script-health-badge::before");
    expect(dashboardWorkbenchCss).toContain(".script-inspector-view[hidden]");
    expect(dashboardWorkbenchCss).toContain('.script-inspector-panel[data-state="empty"] .script-inspector-empty');
  });

  test("settings autosave and update empty states communicate progress and recovery", () => {
    const doc = parseHtml(dashboardHtml);
    const saveStatus = doc.getElementById("settingsSaveStatus");
    const resetOption = doc.querySelector('#bulkActionSelect option[value="reset"]');

    expect(saveStatus?.getAttribute("role")).toBe("status");
    expect(saveStatus?.getAttribute("aria-live")).toBe("polite");
    expect(resetOption?.textContent).toContain("Reset Script Settings");
    expect(dashboardJs).toContain("function setSettingsSaveState(kind, message)");
    expect(dashboardJs).toContain("DashboardWorkflowControllers.createSerializedSettingsController");
    expect(dashboardJs).toContain("restoreInput: (key, value, context) => restoreSettingsInputValue");
    expect(dashboardJs).toContain("translated && translated !== key ? translated : fallback");
    expect(dashboardJs).toContain("render: saveState => setSettingsSaveState(saveState.kind, saveState.message)");
    expect(dashboardJs).toContain("if (response?.error) throw new Error(response.error)");
    const workflowControllers = readFileSync(resolve(process.cwd(), "src/pages/dashboard-workflow-controllers.ts"), "utf8");
    expect(workflowControllers).toContain("const queues = new Map<string, Promise<boolean>>()");
    expect(workflowControllers).toContain("previous.catch(() => false).then(() => saveNow(key, value, context))");
    expect(workflowControllers).toContain("Couldn’t save this setting. Your previous value is still active.");
    expect(dashboardJs).not.toContain("showToast('Setting saved', 'success')");
    expect(dashboardJs).toContain("Everything is current");
    expect(dashboardJs).toContain("data-empty-check-updates");
    expect(dashboardJs).toContain("'Sync not configured'");
    expect(dashboardHtml).toContain('id="svCommandHealthTitle" data-i18n="workbenchLocalVaultReady">Local vault ready');
  });

  test("settings redesign keeps categories, persistence, security, and recovery truthful", () => {
    const doc = parseHtml(dashboardHtml);
    const filters = Array.from(doc.querySelectorAll("#settingsCategoryFilters [data-settings-filter]"));
    const securityAnchors = Array.from(doc.querySelectorAll("#settingsSecurityAnchors [data-settings-target]"));

    expect(filters.map(button => button.dataset.settingsFilter)).toEqual([
      "all", "core", "workspace", "automation", "security", "recovery",
    ]);
    expect(filters.find(button => button.classList.contains("active"))?.dataset.settingsFilter).toBe("core");
    expect(doc.querySelector("#themeEditorContainer")?.closest("details")?.querySelector("summary")).not.toBeNull();
    expect(doc.getElementById("btnSaveAppearance")?.textContent).toContain("Apply custom CSS");
    expect(doc.getElementById("btnOpenBackupRestore")?.textContent).toContain("Open backup & restore");
    expect(doc.querySelector(".settings-danger-zone #btnFactoryReset")).not.toBeNull();
    expect(securityAnchors.map(button => button.dataset.settingsTarget)).toEqual([
      "securityRuntimeGroup", "securityPermissionsGroup", "securityIntegrityGroup",
      "runtimeHostPermissionsSection", "blackCheckSettingsSection",
      "downloadsSettingsSection", "experimentalSettingsSection",
    ]);
    expect(dashboardJs).toContain("settingsPanelFilter: 'core'");
    expect(doc.querySelector('[data-i18n="settingsThemeEditor"]')?.closest('.settings-section')?.dataset.settingsGroup).toBe('workspace');
    expect(doc.getElementById('recoveryActionsSection')?.dataset.settingsGroup).toBe('recovery');
    expect(dashboardJs).toContain("const effectiveFilter = query ? 'all' : state.settingsPanelFilter");
    expect(dashboardJs).toContain("function organizeSecuritySettingsSection()");
    expect(dashboardJs).toContain("const card = document.createElement('details')");
    expect(dashboardJs).toContain("card.open = index === 0");
    expect(dashboardJs).toContain("function organizeSupplementalSecuritySections()");
    expect(dashboardJs).toContain("section.querySelectorAll('details')");
    expect(dashboardJs).toContain("function setScriptSettingsSaveState(kind, message)");
    expect(dashboardJs).toContain("setScriptSettingsSaveState('dirty'");
    expect(doc.querySelectorAll("#btnSaveScriptSettings")).toHaveLength(1);
    expect(doc.getElementById("scriptSettingsSaveStatus")?.getAttribute("aria-live")).toBe("polite");
    expect(dashboardWorkbenchCss).toContain("#settingsPanel #settingsCategoryFilters");
    expect(dashboardWorkbenchCss).toContain("#settingsPanel .settings-policy-grid");
    expect(dashboardWorkbenchCss).toContain("#scriptsettingsPanel .script-settings-save-status[data-state=\"dirty\"]");
  });

  test("confirmation dialogs name the action and de-emphasize destructive defaults", () => {
    const chainsJs = readFileSync(resolve(process.cwd(), "pages/dashboard-chains.js"), "utf8");
    const profilesJs = readFileSync(resolve(process.cwd(), "pages/dashboard-profiles.js"), "utf8");
    const templatesJs = readFileSync(resolve(process.cwd(), "pages/dashboard-templates.js"), "utf8");

    expect(dashboardJs).toContain("function showConfirmModal(title, msg, { confirmLabel = 'Confirm', tone = 'default' } = {})");
    expect(dashboardJs).toContain("tone === 'danger' ? 'btn-danger' : 'btn-primary'");
    expect(dashboardJs).toContain("'Factory Reset ScriptVault?'");
    expect(dashboardJs).toContain("{ confirmLabel: 'Reset Everything', tone: 'danger' }");
    expect(dashboardJs).toContain("{ confirmLabel: 'Discard Changes', tone: 'danger' }");
    expect(dashboardJs).toContain("{ confirmLabel: 'Restore Full Vault' }");
    expect(dashboardJs).not.toContain("'Reset to default settings?'");
    expect(chainsJs).toContain("{ confirmLabel: 'Delete Chain', tone: 'danger' }");
    expect(profilesJs).toContain("{ confirmLabel: 'Delete Profile', tone: 'danger' }");
    expect(templatesJs).toContain("{ confirmLabel: 'Delete Template', tone: 'danger' }");
  });

  test("shared pre-paint theme cache prevents non-dark startup flashes", () => {
    expect(pageDirJs).toContain("const PAGE_THEMES = new Set(['dark', 'light', 'catppuccin', 'oled'])");
    expect(pageDirJs).toContain("localStorage.getItem('sv_theme')");
    expect(pageDirJs).toContain("new MutationObserver");
    expect(themeTokensCss).toContain("--sv-text-dim: #9399b2");
    expect(themeTokensCss).toContain("--sv-text-dim: #858585");
  });

  test("editor loading, defaults, and named presets honor the active theme", () => {
    const defaults = JSON.parse(readFileSync(resolve(process.cwd(), "src/config/settings-defaults.json"), "utf8"));
    const dashboardDoc = parseHtml(dashboardHtml);

    expect(defaults.editorTheme).toBe("default");
    expect(dashboardDoc.querySelector('#settingsEditorTheme option[value="default"]')?.textContent).toBe("Follow interface theme");
    expect(monacoAdapterJs).toContain("function resolveEditorTheme(theme)");
    expect(monacoAdapterJs).toContain("frame.addEventListener('load', sendCurrentTheme)");
    expect(dashboardJs).toContain("state.editor.setOption('theme', layout)");
    expect(editorSandboxHtml).toContain('data-theme="light"');
    expect(editorSandboxHtml).toContain("function applyDocumentTheme(theme)");
    expect(editorSandboxHtml).toContain("monaco.editor.defineTheme('sv-monokai'");
    expect(editorSandboxHtml).toContain("monaco.editor.defineTheme('sv-material-darker'");
    expect(editorSandboxHtml).toContain("monaco.editor.defineTheme('sv-ayu-dark'");
    expect(editorSandboxHtml).not.toContain("monokai: 'sv-gruvbox'");
  });

  test("screenshot evidence pins every theme after app initialization and covers the editor", () => {
    const screenshotHarness = readFileSync(resolve(process.cwd(), "scripts/capture-store-screenshots.mjs"), "utf8");

    expect(screenshotHarness).toContain("...THEMES.flatMap(theme => ['updates', 'utilities', 'trash', 'help']");
    expect(screenshotHarness).toContain("dashboard-editor-${theme}");
    expect(screenshotHarness).toContain("dashboard-confirm-${theme}");
    expect(screenshotHarness).toContain("shot.variant === 'editor'");
    expect(screenshotHarness).toContain("window._monacoEditorAdapter?.setTheme(theme)");
    expect(screenshotHarness).toContain("document.documentElement.dataset.theme === theme");
    expect(screenshotHarness).toContain("await new Promise(resolve => setTimeout(resolve, 350))");
    expect(screenshotHarness).toContain("await settleWhatsNew(page)");
    expect(screenshotHarness).not.toContain("whatsNewDismiss.click()");
    expect(screenshotHarness).toContain("protocolTimeout: 30000");
    expect(screenshotHarness).toContain("deviceScaleFactor: 1");
    expect(screenshotHarness).not.toContain("deviceScaleFactor: 2");
    expect(screenshotHarness).toContain("lastSeenVersion: chrome.runtime.getManifest().version");
    expect(screenshotHarness).toContain("selectScreenshots(screenshotArgs)");
    expect(screenshotHarness).toContain("selectCaptureLocale(screenshotArgs)");
    expect(screenshotHarness).toContain("Emulation.setLocaleOverride");
    expect(screenshotHarness).toContain("document.documentElement.dir === direction");
    expect(screenshotHarness).toContain("[shot.name, captureLocale, outputSuffix].filter(Boolean).join('-')");
    expect(screenshotHarness).toContain("selectViewportOverride(screenshotArgs)");
    expect(screenshotHarness).toContain("selectOutputSuffix(screenshotArgs)");
    expect(screenshotHarness).toContain("const SETTINGS_FILTERS = ['core', 'workspace', 'automation', 'security', 'recovery']");
    expect(screenshotHarness).toContain('...THEMES.flatMap(theme => SETTINGS_FILTERS.map(settingsFilter => ({');
    expect(screenshotHarness).toContain("settingsQuery: 'CSP'");
    expect(screenshotHarness).toContain("shot.variant === 'editor-settings'");
    expect(screenshotHarness).toContain("['saved', 'dirty', 'error'].map(scriptSettingsState => ({");
    expect(screenshotHarness).toContain("I18n.getMessage('scriptSettingsSaveFailed')");
    expect(screenshotHarness).toContain("async function clickSelector(page, selector)");
    expect(screenshotHarness).not.toContain("await page.click(");
  });

  test("settings categories use stable groups instead of translated label text", () => {
    const dashboardDoc = parseHtml(dashboardHtml);
    const sections = [...dashboardDoc.querySelectorAll('#settingsSections > .settings-section')];

    expect(sections.length).toBeGreaterThan(0);
    expect(sections.every(section => section.hasAttribute('data-settings-group'))).toBe(true);
    expect(sections.filter(section => section.dataset.settingsGroup === 'core')).toHaveLength(1);
    expect(sections.filter(section => section.dataset.settingsGroup === 'workspace')).toHaveLength(6);
    expect(sections.filter(section => section.dataset.settingsGroup === 'automation')).toHaveLength(4);
    expect(sections.filter(section => section.dataset.settingsGroup === 'security')).toHaveLength(5);
    expect(sections.filter(section => section.dataset.settingsGroup === 'recovery')).toHaveLength(1);
    expect(dashboardJs).toContain("section.dataset.settingsSearch = `${labelText} ${contentText}`");
    expect(dashboardJs).not.toContain('SETTINGS_SECTION_GROUPS');
  });

  test("install flow keeps expandable rule disclosures and live review status", () => {
    expect(installHtml).toContain(".match-list-toggle");
    expect(installHtml).toContain(".review-nav");
    expect(installHtml).toContain(".review-nav-status");
    expect(installHtml).toContain(".decision-hero");
    expect(installHtml).toContain(".install-terminal");
    expect(installHtml).toContain(".install-state-mark");
    expect(installHtml).toContain(".install-inline-mark");
    expect(installHtml).toContain(".success-next-step");
    expect(installJs).toContain("function renderExpandablePatternSection");
    expect(installJs).toContain("function setupExpandablePatternSections");
    expect(installJs).toContain("function setupReviewNav");
    expect(installJs).toContain("function getDecisionHeroState()");
    expect(installJs).toContain("function updateDecisionHero()");
    expect(installJs).toContain("function setCodePreviewExpanded(expanded, { restoreFocus = false } = {})");
    expect(installJs).toContain("function clearInstallError()");
    expect(installJs).toContain("let reviewExitGuardActive = false;");
    expect(installJs).toContain("function setReviewExitGuard(active)");
    expect(installJs).toContain("window.addEventListener('beforeunload', (event) => {");
    expect(installJs).toContain('id="reviewNav"');
    expect(installJs).toContain('id="reviewNavStatus" role="status" aria-live="polite" aria-atomic="true"');
    expect(installJs).toContain('id="analysisMount"');
    expect(installJs).toContain('id="trustMount"');
    expect(installJs).toContain('id="decisionHero" data-tone="neutral"');
    expect(installJs).toContain('id="decisionHeroCopy" role="status" aria-live="polite" aria-atomic="true"');
    expect(installJs).toContain('id="code-container" hidden aria-hidden="true"');
    expect(installJs).toContain("reviewSecurity");
    expect(installJs).toContain('id="reviewInstall"');
    expect(installJs).toContain('id="dep-status" role="status" aria-live="polite" aria-atomic="true"');
    expect(installJs).toContain('id="analysisStatus" role="status" aria-live="polite" aria-atomic="true"');
    expect(installJs).toContain("button.setAttribute('aria-current', 'location')");
    expect(installJs).toContain("event.key === 'ArrowRight'");
    expect(installJs).toContain("event.key === 'Home'");
    expect(installJs).toContain("event.key === 'End'");
    expect(installJs).toContain('rel="noopener noreferrer"');
    expect(installJs).toContain('role="alert" aria-live="assertive"');
    expect(installJs).toContain('role="status" aria-live="polite" aria-atomic="true"');
    expect(installJs).toContain('aria-labelledby="installTerminalTitle" aria-describedby="installTerminalMessage"');
    expect(installJs).toContain("No script was saved. Review the install details, then try again.");
    expect(installJs).toContain("ScriptVault saved the script locally before leaving the install review.");
    expect(installJs).toContain("Open Dashboard");
    expect(installJs).not.toContain("\\u26A0\\uFE0F");
    expect(installJs).not.toContain("\\u274C");
    expect(installJs).not.toContain("\\u2705");
    expect(installJs).toContain("if (codeContainer?.classList.contains('expanded')) {");
    expect(installJs).toContain("setCodePreviewExpanded(false, { restoreFocus: true });");
  });

  test("side panel exposes clearer search and collapse semantics", () => {
    const doc = parseHtml(sidepanelHtml);
    const searchBar = doc.querySelector('.sp-search-bar[role="search"]');
    const searchInput = doc.getElementById("spSearch");
    const clearButton = doc.getElementById("btnClearSearch");
    const searchStatus = doc.getElementById("spSearchStatus");
    const allSectionHeader = doc.getElementById("allSectionHeader");
    const allScriptList = doc.getElementById("allScriptList");

    expect(searchBar).not.toBeNull();
    expect(searchInput?.getAttribute("type")).toBe("search");
    expect(searchInput?.getAttribute("aria-describedby")).toBe("spSearchStatus");
    expect(clearButton?.getAttribute("type")).toBe("button");
    expect(searchStatus?.getAttribute("role")).toBe("status");
    expect(searchStatus?.getAttribute("aria-live")).toBe("polite");
    expect(allSectionHeader?.getAttribute("aria-controls")).toBe("allScriptList");
    expect(allSectionHeader?.getAttribute("aria-expanded")).toBe("true");
    expect(doc.getElementById("pageScriptList")?.getAttribute("role")).toBe("region");
    expect(allScriptList?.getAttribute("role")).toBe("region");
    expect(allScriptList?.getAttribute("aria-labelledby")).toBe("allSectionHeader");

    expect(sidepanelJs).toContain("function updateSearchSummary");
    expect(sidepanelJs).toContain("function setAllScriptsCollapsed");
    expect(sidepanelJs).toContain("function setButtonLabel");
    expect(sidepanelJs).toContain("async function openDashboardTarget(target = {})");
    expect(sidepanelJs).toContain("await chrome.tabs.create({ url: getDashboardFallbackUrl(data) });");
    expect(sidepanelJs).toContain("chrome.runtime.getURL(`pages/dashboard.html#script_${encodeURIComponent(data.scriptId)}`)");
    expect(sidepanelJs).toContain("chrome.runtime.getURL('pages/dashboard.html#new_script')");
    expect(sidepanelJs).not.toContain("chrome.runtime.sendMessage({ action: 'openDashboard' }).catch(() => {})");
    expect(sidepanelJs).toContain("const pendingScriptActions = new Set();");
    expect(sidepanelJs).toContain("function setScriptRowsBusy(scriptId, isBusy)");
    expect(sidepanelJs).toContain("list.setAttribute('role', 'list');");
    expect(sidepanelJs).toContain("function getScriptToggleLabel(script, enabled = script.enabled !== false)");
    expect(sidepanelJs).toContain("function focusWithinScriptList(control, selector, direction)");
    expect(sidepanelJs).toContain("function getSidepanelFocusDescriptor(control = document.activeElement)");
    expect(sidepanelJs).toContain("function resolveSidepanelFocusTarget(descriptor)");
    expect(sidepanelJs).toContain("function restoreSidepanelFocus(descriptor)");
    expect(sidepanelJs).toContain("function restoreSidepanelFallbackFocus(listName)");
    expect(sidepanelJs).toContain("input.setAttribute('aria-label', getScriptToggleLabel(script, enabled));");
    expect(sidepanelJs).toContain("detailText = isPageScript");
    expect(sidepanelJs).toContain("Available on this page");
    expect(sidepanelJs).toContain("Paused for this page");
    expect(sidepanelJs).toContain("if (pendingScriptActions.has(id)) return;");
    expect(sidepanelJs).toContain("event.key === 'ArrowDown'");
    expect(sidepanelJs).toContain("event.key === 'ArrowUp'");
    expect(sidepanelJs).toContain("event.key === 'Home'");
    expect(sidepanelJs).toContain("event.key === 'End'");
    expect(sidepanelJs).toContain("const focusDescriptor = list.contains(document.activeElement) ? getSidepanelFocusDescriptor(document.activeElement) : null;");
    expect(sidepanelJs).toContain("requestAnimationFrame(() => restoreSidepanelFocus(focusDescriptor));");
    expect(sidepanelJs).toContain("requestAnimationFrame(() => restoreSidepanelFallbackFocus('page'));");
    expect(sidepanelJs).toContain("requestAnimationFrame(() => restoreSidepanelFallbackFocus('all'));");
    expect(sidepanelJs).toContain("tSidepanel('sideNoMatchingScriptsForQuery', 'No scripts match \"{query}\".', { query: searchQuery })");
    expect(sidepanelJs).toContain("Find for ");
    expect(sidepanelHtml).toContain(".sp-context-banner");
    expect(sidepanelJs).toContain("const banner = document.createElement('button');");
    expect(sidepanelJs).toContain("banner.className = 'sp-context-banner';");
    expect(sidepanelJs).toContain("banner.setAttribute('aria-live', 'assertive');");
    expect(sidepanelJs).toContain("Extension restarted. Reconnect side panel.");
    expect(doc.querySelector("#btnHelp svg")).not.toBeNull();
    expect(doc.querySelector("#btnRefresh svg")).not.toBeNull();
    expect(doc.querySelector("#btnDashboard svg")).not.toBeNull();
    expect(doc.querySelector("#btnFindScripts svg")).not.toBeNull();
  });

  test("devtools panel uses real tab semantics and an honest filter/detail shell", () => {
    const doc = parseHtml(devtoolsHtml);
    const tablist = doc.querySelector('.toolbar-tabs[role="tablist"][aria-label="DevTools sections"]');
    const tabs = Array.from(doc.querySelectorAll('.toolbar-tabs .tab-btn[role="tab"]'));
    const filterInput = doc.getElementById("filterInput");
    const toolbarStatus = doc.getElementById("toolbarStatus");
    const status = doc.getElementById("devtoolsStatus");
    const detail = doc.getElementById("netDetail");
    const panels = Array.from(doc.querySelectorAll('.panel[role="tabpanel"]'));
    const consoleActions = Array.from(doc.querySelectorAll('#consoleEmpty .empty-action'));

    expect(tablist).not.toBeNull();
    expect(tabs.map((tab) => tab.dataset.tab)).toEqual(["network", "execution", "console"]);
    expect(filterInput?.getAttribute("type")).toBe("search");
    expect(filterInput?.getAttribute("aria-describedby")).toBe("toolbarStatus");
    expect(filterInput?.getAttribute("placeholder")).toContain("…");
    expect(toolbarStatus?.getAttribute("role")).toBe("status");
    expect(toolbarStatus?.getAttribute("aria-live")).toBe("polite");
    expect(status?.getAttribute("role")).toBe("status");
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(detail?.getAttribute("role")).toBe("region");
    expect(detail?.getAttribute("aria-hidden")).toBe("true");
    expect(detail?.hasAttribute("hidden")).toBe(true);
    expect(panels).toHaveLength(3);
    expect(consoleActions.map((button) => button.textContent?.trim())).toEqual(["Open Network", "Open Execution"]);

    expect(devtoolsJs).toContain("function setActiveTab");
    expect(devtoolsJs).toContain("function setToolbarStatus(message, tone = '')");
    expect(devtoolsJs).toContain("function setRefreshBusy");
    expect(devtoolsJs).toContain("function clearFilter({ focus = false } = {})");
    expect(devtoolsJs).toContain("function getNetworkRows()");
    expect(devtoolsJs).toContain("function renderDetailContent(entry)");
    expect(devtoolsJs).toContain("function syncNetworkRowState()");
    expect(devtoolsJs).toContain("function focusNetworkRow(target)");
    expect(devtoolsJs).toContain("function closeDetail");
    expect(devtoolsJs).toContain("function updateToolbarContext");
    expect(devtoolsJs).toContain("function updateNetworkClearButton()");
    expect(devtoolsJs).toContain("function removeColorSchemeListener()");
    expect(devtoolsJs).toContain("colorSchemeMedia.removeEventListener('change', colorSchemeChangeHandler)");
    expect(devtoolsJs).toContain("window.addEventListener('pagehide'");
    expect(devtoolsJs).toContain("renderConsoleState()");
    expect(devtoolsJs).toContain("event.key === 'ArrowRight'");
    expect(devtoolsJs).toContain("event.key === 'ArrowDown'");
    expect(devtoolsJs).toContain("event.key === 'ArrowUp'");
    expect(devtoolsJs).toContain("event.key === 'Escape'");
    expect(devtoolsJs).toContain("event.key.toLowerCase() === 'f'");
    expect(devtoolsJs).toContain("const restoreTableFocus = Boolean(activeElement?.closest?.('#netTableBody'));");
    expect(devtoolsJs).toContain("const activeInDetail = Boolean(activeElement?.closest?.('#netDetail'));");
    expect(devtoolsJs).toContain("showDetail(entry, tr, { moveFocus: true });");
    expect(devtoolsJs).toContain("$('btnCloseDetail').focus({ preventScroll: true });");
    expect(devtoolsJs).toContain("if (selectedEntry && $('netDetail').classList.contains('open')) {");
    expect(devtoolsJs).toContain("renderDetailContent(selectedEntry);");
    expect(devtoolsJs).toContain("clearButton.textContent = tDevtools('resetView', 'Reset View');");
    expect(devtoolsJs).toContain("clearButton.setAttribute('aria-label', tDevtools('devtoolsResetExecutionFilter', 'Reset execution filter'));");
    expect(devtoolsJs).toContain("tDevtools('devtoolsResetNetworkFilter', 'Reset network filter')");
    expect(devtoolsJs).toContain("if (filterText) {\n          clearFilter({ focus: true });\n          return;\n        }");
    expect(devtoolsJs).toContain("tr.setAttribute('aria-selected', String(selectedRow === entry.id));");
    expect(devtoolsJs).toContain("Console capture isn’t available here yet. Use Network or Execution for current insight.");
    expect(devtoolsJs).toContain("No requests match");
    expect(devtoolsJs).toContain("No scripts match");
    expect(devtoolsJs).toContain("tDevtools('devtoolsClearRecordedNetworkRequests', 'Clear recorded network requests')");
    expect(devtoolsJs).toContain('Reset the filter or try a script, host, or method name.');
    expect(devtoolsJs).toContain("No network or execution data to export yet.");
    expect(devtoolsJs).toContain("Diagnostics refresh failed. Showing the last available data.");
    expect(devtoolsHtml).toContain('.toolbar-btn[aria-busy="true"]');
    expect(devtoolsHtml).toContain('--bg: var(--sv-bg)');
    expect(devtoolsHtml).toContain('.exec-table-wrap[aria-busy="true"]::after');
    expect(devtoolsHtml).toContain('id="execTableWrap"');
    expect(devtoolsJs).toContain("$('execTableWrap').setAttribute('aria-busy', String(isBusy));");
  });

  test("compact and diagnostic surfaces share the workbench hierarchy", () => {
    expect(popupHtml).toContain('class="header-logo"');
    expect(popupHtml).toContain('class="header-context" id="headerContext">Scripts enabled</span>');
    expect(popupHtml).toContain('Workbench-aligned compact surface');
    expect(sidepanelHtml).toContain('Workbench-aligned side surface');
    expect(sidepanelHtml).toContain('var(--sv-surface-raised)');
    expect(installHtml).toContain('Workbench-aligned review surface');
    expect(installHtml).toContain('max-width: 760px');
    expect(devtoolsHtml).toContain('class="toolbar-logo"');
    expect(devtoolsHtml).toContain('class="toolbar-subtitle">Diagnostics</span>');
    expect(devtoolsHtml).toContain('Workbench-aligned diagnostics surface');
    expect(popupHtml).toContain('data-i18n="sideOpenDashboard">Open Dashboard</span>');
    expect(sidepanelHtml).toContain('data-i18n="sideOpenDashboard">Open Dashboard</span>');
    expect(popupHtml).not.toContain('data-i18n="cmdOpenDashboard"');
    expect(sidepanelHtml).not.toContain('data-i18n="cmdOpenDashboard"');
  });

  test("dashboard keeps the updated column on a real button control", () => {
    expect(dashboardJs).toContain('<button type="button" class="updated-link"');
    expect(dashboardJs).toContain("triggerEl.disabled = true");
    expect(dashboardJs).toContain("triggerEl.textContent = force ? 'Forcing…' : 'Checking…'");
  });
});
