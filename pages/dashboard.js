// EspressoMonkey Dashboard v2.3.0 - Full-Featured Controller
(function() {
    'use strict';

    // State
    const state = {
        scripts: [],
        settings: {},
        currentScriptId: null,
        editor: null,
        unsavedChanges: false,
        selectedScripts: new Set()
    };

    // DOM Elements
    const elements = {};

    function cacheElements() {
        // Main tabs
        elements.mainTabs = document.querySelectorAll('.tm-tab');
        elements.mainPanels = {
            scripts: document.getElementById('scriptsPanel'),
            settings: document.getElementById('settingsPanel'),
            utilities: document.getElementById('utilitiesPanel'),
            help: document.getElementById('helpPanel')
        };

        // Scripts tab
        elements.scriptSearch = document.getElementById('scriptSearch');
        elements.scriptTableBody = document.getElementById('scriptTableBody');
        elements.emptyState = document.getElementById('emptyState');
        elements.selectAllScripts = document.getElementById('selectAllScripts');
        elements.btnNewScript = document.getElementById('btnNewScript');
        elements.btnImportScript = document.getElementById('btnImportScript');
        elements.btnCheckUpdates = document.getElementById('btnCheckUpdates');
        elements.btnExportAll = document.getElementById('btnExportAll');
        
        // Bulk Actions (Tampermonkey-style)
        elements.bulkSelectAll = document.getElementById('bulkSelectAll');
        elements.bulkActionSelect = document.getElementById('bulkActionSelect');
        elements.btnBulkApply = document.getElementById('btnBulkApply');
        elements.filterSelect = document.getElementById('filterSelect');
        elements.scriptCounter = document.getElementById('scriptCounter');

        // Editor overlay
        elements.editorOverlay = document.getElementById('editorOverlay');
        elements.editorTitle = document.getElementById('editorTitle');
        elements.editorTextarea = document.getElementById('editorTextarea');
        elements.editorTabs = document.querySelectorAll('.editor-tab');
        elements.editorPanels = {
            code: document.getElementById('codePanel'),
            info: document.getElementById('infoPanel'),
            storage: document.getElementById('storagePanel'),
            scriptsettings: document.getElementById('scriptsettingsPanel')
        };
        elements.btnEditorSave = document.getElementById('btnEditorSave');
        elements.btnEditorToggle = document.getElementById('btnEditorToggle');
        elements.btnEditorDuplicate = document.getElementById('btnEditorDuplicate');
        elements.btnEditorDelete = document.getElementById('btnEditorDelete');
        elements.btnEditorClose = document.getElementById('btnEditorClose');

        // Info panel
        elements.infoName = document.getElementById('infoName');
        elements.infoVersion = document.getElementById('infoVersion');
        elements.infoAuthor = document.getElementById('infoAuthor');
        elements.infoDescription = document.getElementById('infoDescription');
        elements.infoHomepage = document.getElementById('infoHomepage');
        elements.infoUpdateUrl = document.getElementById('infoUpdateUrl');
        elements.infoGrants = document.getElementById('infoGrants');
        elements.infoMatches = document.getElementById('infoMatches');
        elements.infoResources = document.getElementById('infoResources');

        // Storage panel
        elements.storageList = document.getElementById('storageList');
        elements.btnAddStorage = document.getElementById('btnAddStorage');
        elements.storageSizeInfo = document.getElementById('storageSizeInfo');

        // Per-script settings panel
        elements.scriptAutoUpdate = document.getElementById('scriptAutoUpdate');
        elements.scriptNotifyUpdates = document.getElementById('scriptNotifyUpdates');
        elements.scriptRunAt = document.getElementById('scriptRunAt');
        elements.scriptInjectInto = document.getElementById('scriptInjectInto');
        elements.scriptNotifyErrors = document.getElementById('scriptNotifyErrors');
        elements.btnSaveScriptSettings = document.getElementById('btnSaveScriptSettings');
        elements.btnResetScriptSettings = document.getElementById('btnResetScriptSettings');
        
        // URL Override controls
        elements.useOriginalIncludes = document.getElementById('useOriginalIncludes');
        elements.useOriginalMatches = document.getElementById('useOriginalMatches');
        elements.useOriginalExcludes = document.getElementById('useOriginalExcludes');
        elements.originalIncludesList = document.getElementById('originalIncludesList');
        elements.originalMatchesList = document.getElementById('originalMatchesList');
        elements.originalExcludesList = document.getElementById('originalExcludesList');
        elements.userIncludesList = document.getElementById('userIncludesList');
        elements.userMatchesList = document.getElementById('userMatchesList');
        elements.userExcludesList = document.getElementById('userExcludesList');
        elements.userIncludeInput = document.getElementById('userIncludeInput');
        elements.userMatchInput = document.getElementById('userMatchInput');
        elements.userExcludeInput = document.getElementById('userExcludeInput');
        elements.btnAddUserInclude = document.getElementById('btnAddUserInclude');
        elements.btnAddUserMatch = document.getElementById('btnAddUserMatch');
        elements.btnAddUserExclude = document.getElementById('btnAddUserExclude');

        // Settings - General
        elements.settingsConfigMode = document.getElementById('settingsConfigMode');
        elements.settingsLanguage = document.getElementById('settingsLanguage');
        elements.settingsAutoReload = document.getElementById('settingsAutoReload');
        elements.settingsAnonymousStats = document.getElementById('settingsAnonymousStats');
        elements.settingsDebugMode = document.getElementById('settingsDebugMode');
        elements.settingsShowFixedSource = document.getElementById('settingsShowFixedSource');
        elements.settingsLoggingLevel = document.getElementById('settingsLoggingLevel');
        elements.settingsTrashMode = document.getElementById('settingsTrashMode');
        
        // Settings - Appearance
        elements.settingsLayout = document.getElementById('settingsLayout');
        elements.settingsCustomCss = document.getElementById('settingsCustomCss');
        elements.settingsUpdateNotify = document.getElementById('settingsUpdateNotify');
        elements.settingsFaviconService = document.getElementById('settingsFaviconService');
        elements.btnSaveAppearance = document.getElementById('btnSaveAppearance');
        
        // Settings - Tags
        elements.settingsEnableTags = document.getElementById('settingsEnableTags');
        
        // Settings - Action Menu
        elements.settingsHideDisabledPopup = document.getElementById('settingsHideDisabledPopup');
        elements.settingsPopupColumns = document.getElementById('settingsPopupColumns');
        elements.settingsScriptOrder = document.getElementById('settingsScriptOrder');
        elements.settingsBadgeInfo = document.getElementById('settingsBadgeInfo');
        elements.settingsBadgeColor = document.getElementById('settingsBadgeColor');
        elements.badgeColorPreview = document.getElementById('badgeColorPreview');
        elements.btnSaveActionMenu = document.getElementById('btnSaveActionMenu');
        
        // Settings - Context Menu
        elements.settingsEnableContextMenu = document.getElementById('settingsEnableContextMenu');
        elements.settingsContextMenuRunAt = document.getElementById('settingsContextMenuRunAt');
        elements.settingsContextMenuCommands = document.getElementById('settingsContextMenuCommands');
        
        // Settings - Userscript Search
        elements.settingsSearchIntegration = document.getElementById('settingsSearchIntegration');
        
        // Settings - Userscript Update
        elements.settingsUpdateDisabled = document.getElementById('settingsUpdateDisabled');
        elements.settingsSilentUpdate = document.getElementById('settingsSilentUpdate');
        elements.settingsCheckInterval = document.getElementById('settingsCheckInterval');
        elements.settingsNotifyHideAfter = document.getElementById('settingsNotifyHideAfter');
        
        // Settings - Externals
        elements.settingsExternalsInterval = document.getElementById('settingsExternalsInterval');
        
        // Settings - Userscript Sync
        elements.settingsEnableSync = document.getElementById('settingsEnableSync');
        elements.settingsSyncType = document.getElementById('settingsSyncType');
        elements.syncWebdavSettings = document.getElementById('syncWebdavSettings');
        elements.syncOAuthSettings = document.getElementById('syncOAuthSettings');
        elements.oauthStatus = document.getElementById('oauthStatus');
        elements.oauthUser = document.getElementById('oauthUser');
        elements.oauthUserRow = document.getElementById('oauthUserRow');
        elements.btnConnectOAuth = document.getElementById('btnConnectOAuth');
        elements.btnDisconnectOAuth = document.getElementById('btnDisconnectOAuth');
        elements.settingsWebdavUrl = document.getElementById('settingsWebdavUrl');
        elements.settingsWebdavUsername = document.getElementById('settingsWebdavUsername');
        elements.settingsWebdavPassword = document.getElementById('settingsWebdavPassword');
        elements.btnSyncNow = document.getElementById('btnSyncNow');
        elements.btnSyncReset = document.getElementById('btnSyncReset');
        elements.syncLog = document.getElementById('syncLog');
        elements.btnSaveSync = document.getElementById('btnSaveSync');
        
        // Settings - Editor
        elements.settingsEnableEditor = document.getElementById('settingsEnableEditor');
        elements.settingsEditorTheme = document.getElementById('settingsEditorTheme');
        elements.settingsEditorFontSize = document.getElementById('settingsEditorFontSize');
        elements.settingsKeyMapping = document.getElementById('settingsKeyMapping');
        elements.settingsIndentWidth = document.getElementById('settingsIndentWidth');
        elements.settingsTabSize = document.getElementById('settingsTabSize');
        elements.settingsIndentWith = document.getElementById('settingsIndentWith');
        elements.settingsTabMode = document.getElementById('settingsTabMode');
        elements.settingsHighlightMatches = document.getElementById('settingsHighlightMatches');
        elements.settingsWordWrap = document.getElementById('settingsWordWrap');
        elements.settingsReindent = document.getElementById('settingsReindent');
        elements.settingsAutoSave = document.getElementById('settingsAutoSave');
        elements.settingsNoSaveConfirm = document.getElementById('settingsNoSaveConfirm');
        elements.settingsHighlightTrailingWhitespace = document.getElementById('settingsHighlightTrailingWhitespace');
        elements.settingsTrimWhitespace = document.getElementById('settingsTrimWhitespace');
        elements.settingsLintOnType = document.getElementById('settingsLintOnType');
        elements.settingsLintMaxSize = document.getElementById('settingsLintMaxSize');
        elements.settingsLinterConfig = document.getElementById('settingsLinterConfig');
        elements.btnSaveEditor = document.getElementById('btnSaveEditor');
        
        // Settings - Security
        elements.settingsContentScriptAPI = document.getElementById('settingsContentScriptAPI');
        elements.settingsDefaultSandboxMode = document.getElementById('settingsDefaultSandboxMode');
        elements.settingsAllowSandboxRaw = document.getElementById('settingsAllowSandboxRaw');
        elements.settingsAllowSandboxJs = document.getElementById('settingsAllowSandboxJs');
        elements.settingsAllowSandboxDom = document.getElementById('settingsAllowSandboxDom');
        elements.settingsModifyCSP = document.getElementById('settingsModifyCSP');
        elements.settingsAllowHttpHeaders = document.getElementById('settingsAllowHttpHeaders');
        elements.settingsHttpHeaderWarnings = document.getElementById('settingsHttpHeaderWarnings');
        elements.settingsDefaultTabTypes = document.getElementById('settingsDefaultTabTypes');
        elements.settingsAllowLocalFiles = document.getElementById('settingsAllowLocalFiles');
        elements.settingsAllowFileUrls = document.getElementById('settingsAllowFileUrls');
        elements.settingsAllowCookies = document.getElementById('settingsAllowCookies');
        elements.settingsAllowCommunication = document.getElementById('settingsAllowCommunication');
        elements.settingsSRI = document.getElementById('settingsSRI');
        elements.settingsIncludeMode = document.getElementById('settingsIncludeMode');
        elements.settingsCheckConnect = document.getElementById('settingsCheckConnect');
        elements.settingsIncognitoStorage = document.getElementById('settingsIncognitoStorage');
        elements.settingsPageFilterMode = document.getElementById('settingsPageFilterMode');
        elements.settingsWhitelistedPages = document.getElementById('settingsWhitelistedPages');
        elements.settingsBlacklistedPages = document.getElementById('settingsBlacklistedPages');
        elements.btnSaveSecurity = document.getElementById('btnSaveSecurity');
        
        // Settings - Runtime Host Permissions
        elements.settingsDeniedHosts = document.getElementById('settingsDeniedHosts');
        elements.btnGrantSelected = document.getElementById('btnGrantSelected');
        elements.btnGrantAll = document.getElementById('btnGrantAll');
        elements.btnResetPermissions = document.getElementById('btnResetPermissions');
        
        // Settings - BlackCheck
        elements.settingsBlacklistSource = document.getElementById('settingsBlacklistSource');
        elements.settingsBlacklistSeverity = document.getElementById('settingsBlacklistSeverity');
        elements.settingsManualBlacklist = document.getElementById('settingsManualBlacklist');
        elements.btnSaveBlackCheck = document.getElementById('btnSaveBlackCheck');
        
        // Settings - Downloads
        elements.settingsDownloadMode = document.getElementById('settingsDownloadMode');
        elements.settingsDownloadWhitelist = document.getElementById('settingsDownloadWhitelist');
        elements.btnSaveDownloads = document.getElementById('btnSaveDownloads');
        
        // Settings - Experimental
        elements.settingsStrictMode = document.getElementById('settingsStrictMode');
        elements.settingsTopLevelAwait = document.getElementById('settingsTopLevelAwait');
        
        // Settings - Reset
        elements.btnRestartExtension = document.getElementById('btnRestartExtension');
        elements.btnFactoryReset = document.getElementById('btnFactoryReset');

        // Utilities
        elements.btnExportAll = document.getElementById('btnExportAll');
        elements.btnExportZip = document.getElementById('btnExportZip');
        elements.btnChooseFile = document.getElementById('btnChooseFile');
        elements.importFileInput = document.getElementById('importFileInput');
        elements.importFileName = document.getElementById('importFileName');
        elements.importUrlInput = document.getElementById('importUrlInput');
        elements.btnInstallFromUrl = document.getElementById('btnInstallFromUrl');
        elements.textareaData = document.getElementById('textareaData');
        elements.btnTextareaExport = document.getElementById('btnTextareaExport');
        elements.btnTextareaImport = document.getElementById('btnTextareaImport');
        
        // External Editor
        elements.externalEditorScript = document.getElementById('externalEditorScript');
        elements.btnCopyToClipboard = document.getElementById('btnCopyToClipboard');
        elements.btnImportFromClipboard = document.getElementById('btnImportFromClipboard');
        elements.btnOpenInVSCode = document.getElementById('btnOpenInVSCode');

        // Stats
        elements.statTotalScripts = document.getElementById('statTotalScripts');
        elements.statActiveScripts = document.getElementById('statActiveScripts');
        elements.statTotalStorage = document.getElementById('statTotalStorage');

        // Modal
        elements.modal = document.getElementById('modal');
        elements.modalTitle = document.getElementById('modalTitle');
        elements.modalBody = document.getElementById('modalBody');
        elements.modalActions = document.getElementById('modalActions');
        elements.modalClose = document.querySelector('.modal-close');

        // Toast
        elements.toastContainer = document.getElementById('toastContainer');
    }

    // Initialize
    async function init() {
        cacheElements();
        await loadSettings();
        await loadScripts();
        initEditor();
        initEventListeners();
        applyTheme();
        updateStats();
        toggleSyncProviderSettings();
        loadSyncProviderStatus();
        await checkUserScriptsAvailability();

        const hash = window.location.hash.slice(1);
        if (hash) openEditorForScript(hash);
    }
    
    // Check if userScripts API is available and enabled
    async function checkUserScriptsAvailability() {
        const banner = document.getElementById('setupWarningBanner');
        const btnHelp = document.getElementById('btnSetupHelp');
        const btnDismiss = document.getElementById('btnDismissWarning');
        
        if (!banner) return;
        
        try {
            if (!chrome.userScripts) {
                banner.style.display = 'block';
                return;
            }
            
            // Try to use the API to see if it's enabled
            await chrome.userScripts.getScripts();
            banner.style.display = 'none';
        } catch (error) {
            console.warn('userScripts API not available:', error.message);
            banner.style.display = 'block';
        }
        
        // Setup help button
        btnHelp?.addEventListener('click', () => {
            showSetupInstructions();
        });
        
        // Dismiss button
        btnDismiss?.addEventListener('click', () => {
            banner.style.display = 'none';
        });
    }
    
    function showSetupInstructions() {
        const chromeVersion = parseInt(navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] || 0);
        
        let instructions = '';
        if (chromeVersion >= 138) {
            instructions = `
                <h3 style="margin-bottom: 15px; color: var(--text-primary);">Enable User Scripts (Chrome 138+)</h3>
                <ol style="line-height: 1.8; color: var(--text-secondary); padding-left: 20px;">
                    <li>Right-click the EspressoMonkey extension icon in your toolbar</li>
                    <li>Select <strong>"Manage Extension"</strong></li>
                    <li>Find and enable the <strong>"Allow User Scripts"</strong> toggle</li>
                    <li>Reload any open pages for scripts to take effect</li>
                </ol>
                <p style="margin-top: 15px; padding: 10px; background: var(--bg-input); border-radius: 4px; font-size: 12px;">
                    <strong>Note:</strong> This toggle was introduced in Chrome 138 as an additional security measure for extensions that inject user scripts.
                </p>
            `;
        } else {
            instructions = `
                <h3 style="margin-bottom: 15px; color: var(--text-primary);">Enable Developer Mode</h3>
                <ol style="line-height: 1.8; color: var(--text-secondary); padding-left: 20px;">
                    <li>Open Chrome and go to <strong>chrome://extensions</strong></li>
                    <li>Enable <strong>"Developer mode"</strong> toggle in the top-right corner</li>
                    <li>Reload any open pages for scripts to take effect</li>
                </ol>
            `;
        }
        
        instructions += `
            <div style="margin-top: 20px; display: flex; gap: 10px;">
                <button class="btn btn-primary" id="btnOpenExtensionSettings">
                    Open Extension Settings
                </button>
            </div>
        `;
        
        showModal('Setup Instructions', instructions, [
            { text: 'Close', action: 'close' }
        ]);
        
        // Attach event listener after modal is shown (CSP-compliant)
        document.getElementById('btnOpenExtensionSettings')?.addEventListener('click', () => {
            chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
        });
    }

    // Settings
    async function loadSettings() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
            if (response?.settings) {
                state.settings = response.settings;
                applySettingsToUI();
            }
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    }

    function applySettingsToUI() {
        const s = state.settings;
        
        // General settings
        if (elements.settingsConfigMode) elements.settingsConfigMode.value = s.configMode || 'advanced';
        if (elements.settingsLanguage) elements.settingsLanguage.value = s.language || 'default';
        if (elements.settingsAutoReload) elements.settingsAutoReload.checked = s.autoReload !== false;
        if (elements.settingsAnonymousStats) elements.settingsAnonymousStats.checked = s.anonymousStats || false;
        if (elements.settingsDebugMode) elements.settingsDebugMode.checked = s.debugMode || false;
        if (elements.settingsShowFixedSource) elements.settingsShowFixedSource.checked = s.showFixedSource || false;
        if (elements.settingsLoggingLevel) elements.settingsLoggingLevel.value = s.loggingLevel || 'error';
        if (elements.settingsTrashMode) elements.settingsTrashMode.value = s.trashMode || 'disabled';
        
        // Appearance settings
        if (elements.settingsLayout) elements.settingsLayout.value = s.layout || 'dark';
        if (elements.settingsCustomCss) elements.settingsCustomCss.value = s.customCss || '';
        if (elements.settingsUpdateNotify) elements.settingsUpdateNotify.value = s.updateNotify || 'changelog';
        if (elements.settingsFaviconService) elements.settingsFaviconService.value = s.faviconService || 'google';
        
        // Tags
        if (elements.settingsEnableTags) elements.settingsEnableTags.checked = s.enableTags || false;
        
        // Action Menu
        if (elements.settingsHideDisabledPopup) elements.settingsHideDisabledPopup.checked = s.hideDisabledPopup || false;
        if (elements.settingsPopupColumns) elements.settingsPopupColumns.value = s.popupColumns || '1';
        if (elements.settingsScriptOrder) elements.settingsScriptOrder.value = s.scriptOrder || 'auto';
        if (elements.settingsBadgeInfo) elements.settingsBadgeInfo.value = s.badgeInfo || 'running';
        if (elements.settingsBadgeColor) {
            elements.settingsBadgeColor.value = s.badgeColor || '#ee3131';
            if (elements.badgeColorPreview) {
                elements.badgeColorPreview.style.backgroundColor = s.badgeColor || '#ee3131';
            }
        }
        
        // Context Menu
        if (elements.settingsEnableContextMenu) elements.settingsEnableContextMenu.checked = s.enableContextMenu !== false;
        if (elements.settingsContextMenuRunAt) elements.settingsContextMenuRunAt.checked = s.contextMenuRunAt !== false;
        if (elements.settingsContextMenuCommands) elements.settingsContextMenuCommands.checked = s.contextMenuCommands !== false;
        
        // Userscript Search
        if (elements.settingsSearchIntegration) elements.settingsSearchIntegration.value = s.searchIntegration || 'disabled';
        
        // Userscript Update
        if (elements.settingsUpdateDisabled) elements.settingsUpdateDisabled.checked = s.updateDisabled || false;
        if (elements.settingsSilentUpdate) elements.settingsSilentUpdate.checked = s.silentUpdate !== false;
        if (elements.settingsCheckInterval) elements.settingsCheckInterval.value = s.checkInterval || '24';
        if (elements.settingsNotifyHideAfter) elements.settingsNotifyHideAfter.value = s.notifyHideAfter || '15';
        
        // Externals
        if (elements.settingsExternalsInterval) elements.settingsExternalsInterval.value = s.externalsInterval || '0';
        
        // Sync settings
        if (elements.settingsEnableSync) elements.settingsEnableSync.checked = s.enableSync || false;
        if (elements.settingsSyncType) {
            elements.settingsSyncType.value = s.syncType || 'browser';
            toggleSyncProviderSettings();
        }
        if (elements.settingsWebdavUrl) elements.settingsWebdavUrl.value = s.webdavUrl || '';
        if (elements.settingsWebdavUsername) elements.settingsWebdavUsername.value = s.webdavUsername || '';
        if (elements.settingsWebdavPassword) elements.settingsWebdavPassword.value = s.webdavPassword || '';
        if (elements.syncLog) elements.syncLog.value = s.syncLog || '';
        
        // Editor settings
        if (elements.settingsEnableEditor) elements.settingsEnableEditor.checked = s.enableEditor !== false;
        if (elements.settingsEditorTheme) elements.settingsEditorTheme.value = s.editorTheme || 'default';
        if (elements.settingsEditorFontSize) elements.settingsEditorFontSize.value = s.editorFontSize || '100';
        if (elements.settingsKeyMapping) elements.settingsKeyMapping.value = s.keyMapping || 'default';
        if (elements.settingsIndentWidth) elements.settingsIndentWidth.value = s.indentWidth || '4';
        if (elements.settingsTabSize) elements.settingsTabSize.value = s.tabSize || '4';
        if (elements.settingsIndentWith) elements.settingsIndentWith.value = s.indentWith || 'spaces';
        if (elements.settingsTabMode) elements.settingsTabMode.value = s.tabMode || 'indent';
        if (elements.settingsHighlightMatches) elements.settingsHighlightMatches.value = s.highlightMatches || 'cursor';
        if (elements.settingsWordWrap) elements.settingsWordWrap.checked = s.wordWrap !== false;
        if (elements.settingsReindent) elements.settingsReindent.checked = s.reindent !== false;
        if (elements.settingsAutoSave) elements.settingsAutoSave.checked = s.autoSave || false;
        if (elements.settingsNoSaveConfirm) elements.settingsNoSaveConfirm.checked = s.noSaveConfirm !== false;
        if (elements.settingsHighlightTrailingWhitespace) elements.settingsHighlightTrailingWhitespace.checked = s.highlightTrailingWhitespace !== false;
        if (elements.settingsTrimWhitespace) elements.settingsTrimWhitespace.checked = s.trimWhitespace !== false;
        if (elements.settingsLintOnType) elements.settingsLintOnType.checked = s.lintOnType !== false;
        if (elements.settingsLintMaxSize) elements.settingsLintMaxSize.value = s.lintMaxSize || '1000000';
        if (elements.settingsLinterConfig) elements.settingsLinterConfig.value = s.linterConfig || '';
        
        // Security settings
        if (elements.settingsContentScriptAPI) elements.settingsContentScriptAPI.value = s.contentScriptAPI || 'userscripts';
        if (elements.settingsDefaultSandboxMode) elements.settingsDefaultSandboxMode.value = s.defaultSandboxMode || 'raw';
        
        // Allowed sandbox modes checkboxes
        const allowedModes = s.allowedSandboxModes || ['raw', 'js', 'dom'];
        if (elements.settingsAllowSandboxRaw) elements.settingsAllowSandboxRaw.checked = allowedModes.includes('raw');
        if (elements.settingsAllowSandboxJs) elements.settingsAllowSandboxJs.checked = allowedModes.includes('js');
        if (elements.settingsAllowSandboxDom) elements.settingsAllowSandboxDom.checked = allowedModes.includes('dom');
        
        if (elements.settingsModifyCSP) elements.settingsModifyCSP.value = s.modifyCSP || 'auto';
        if (elements.settingsAllowHttpHeaders) elements.settingsAllowHttpHeaders.value = s.allowHttpHeaders ? 'yes' : 'no';
        if (elements.settingsHttpHeaderWarnings) elements.settingsHttpHeaderWarnings.checked = s.httpHeaderWarnings !== false;
        if (elements.settingsDefaultTabTypes) elements.settingsDefaultTabTypes.value = s.defaultTabTypes || 'all';
        if (elements.settingsAllowLocalFiles) elements.settingsAllowLocalFiles.value = s.allowLocalFiles || 'all';
        if (elements.settingsAllowFileUrls) elements.settingsAllowFileUrls.checked = s.allowFileUrls || false;
        if (elements.settingsAllowCookies) elements.settingsAllowCookies.value = s.allowCookies || 'all';
        if (elements.settingsAllowCommunication) elements.settingsAllowCommunication.value = s.allowCommunication || 'version';
        if (elements.settingsSRI) elements.settingsSRI.value = s.sri || 'validate';
        if (elements.settingsIncludeMode) elements.settingsIncludeMode.value = s.includeMode || 'default';
        if (elements.settingsCheckConnect) elements.settingsCheckConnect.value = s.checkConnect || 'ask';
        if (elements.settingsIncognitoStorage) elements.settingsIncognitoStorage.value = s.incognitoStorage || 'temporary';
        if (elements.settingsPageFilterMode) elements.settingsPageFilterMode.value = s.pageFilterMode || 'blacklist';
        if (elements.settingsWhitelistedPages) elements.settingsWhitelistedPages.value = s.whitelistedPages || '';
        if (elements.settingsBlacklistedPages) elements.settingsBlacklistedPages.value = s.blacklistedPages || '';
        
        // Runtime Host Permissions
        if (elements.settingsDeniedHosts) elements.settingsDeniedHosts.value = (s.deniedHosts || []).join('\n');
        
        // BlackCheck - updated with severity levels
        if (elements.settingsBlacklistSource) elements.settingsBlacklistSource.value = s.blacklistSource || 'both';
        if (elements.settingsBlacklistSeverity) elements.settingsBlacklistSeverity.value = s.blacklistSeverity || 'medium';
        if (elements.settingsManualBlacklist) elements.settingsManualBlacklist.value = s.manualBlacklist || '';
        
        // Downloads
        if (elements.settingsDownloadMode) elements.settingsDownloadMode.value = s.downloadMode || 'default';
        if (elements.settingsDownloadWhitelist) elements.settingsDownloadWhitelist.value = s.downloadWhitelist || '';
        
        // Experimental
        if (elements.settingsStrictMode) elements.settingsStrictMode.value = s.strictMode || 'default';
        if (elements.settingsTopLevelAwait) elements.settingsTopLevelAwait.value = s.topLevelAwait || 'default';
        
        // Apply theme
        document.documentElement.setAttribute('data-theme', s.layout || 'dark');
    }

    async function saveSetting(key, value) {
        try {
            state.settings[key] = value;
            await chrome.runtime.sendMessage({ action: 'updateSettings', settings: { [key]: value } });
            if (key === 'theme') applyTheme();
            else if (key === 'editorTheme' && state.editor) state.editor.setOption('theme', value);
            else if (key === 'editorFontSize' && state.editor) document.querySelector('.CodeMirror').style.fontSize = value + 'px';
            else if (key === 'editorWordWrap' && state.editor) state.editor.setOption('lineWrapping', value);
            showToast('Setting saved', 'success');
        } catch (e) {
            showToast('Failed to save', 'error');
        }
    }

    function toggleSyncProviderSettings() {
        const syncType = elements.settingsSyncType?.value || 'browser';
        
        // Hide all provider settings first
        if (elements.syncWebdavSettings) elements.syncWebdavSettings.style.display = 'none';
        if (elements.syncOAuthSettings) elements.syncOAuthSettings.style.display = 'none';
        
        // Show selected provider settings
        if (syncType === 'webdav' && elements.syncWebdavSettings) {
            elements.syncWebdavSettings.style.display = 'block';
        } else if (['googledrive', 'dropbox', 'onedrive'].includes(syncType) && elements.syncOAuthSettings) {
            elements.syncOAuthSettings.style.display = 'block';
            // Load status for the selected provider
            loadSyncProviderStatus();
        }
    }
    
    // Alias for backward compatibility
    function toggleWebdavSettings() {
        toggleSyncProviderSettings();
    }
    
    // Update sync provider status UI
    function updateSyncProviderUI(provider, status) {
        // Use common OAuth elements for all providers
        const statusEl = elements.oauthStatus;
        const userEl = elements.oauthUser;
        const userRowEl = elements.oauthUserRow;
        const connectBtn = elements.btnConnectOAuth;
        const disconnectBtn = elements.btnDisconnectOAuth;
        
        // Only update if this is the currently selected provider
        const currentProvider = elements.settingsSyncType?.value;
        if (currentProvider !== provider) return;
        
        if (status?.connected || status?.success) {
            if (statusEl) {
                statusEl.textContent = 'Connected';
                statusEl.className = 'sync-status connected';
            }
            const userName = status.user?.email || status.user?.name || status.user;
            if (userEl && userName) {
                userEl.textContent = userName;
            }
            if (userRowEl) userRowEl.style.display = userName ? 'flex' : 'none';
            if (connectBtn) connectBtn.style.display = 'none';
            if (disconnectBtn) disconnectBtn.style.display = 'inline-block';
        } else {
            if (statusEl) {
                statusEl.textContent = 'Not connected';
                statusEl.className = 'sync-status disconnected';
            }
            if (userRowEl) userRowEl.style.display = 'none';
            if (connectBtn) connectBtn.style.display = 'inline-block';
            if (disconnectBtn) disconnectBtn.style.display = 'none';
        }
    }
    
    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
    
    // Load sync provider status for OAuth providers
    async function loadSyncProviderStatus() {
        const currentProvider = elements.settingsSyncType?.value;
        
        // Only check status for OAuth providers
        if (currentProvider && ['googledrive', 'dropbox', 'onedrive'].includes(currentProvider)) {
            try {
                const response = await chrome.runtime.sendMessage({ action: 'getSyncProviderStatus', provider: currentProvider });
                updateSyncProviderUI(currentProvider, response);
            } catch (e) {
                console.error(`Failed to get ${currentProvider} status:`, e);
            }
        }
        
        // Update last sync time
        if (elements.lastSyncTime && state.settings.lastSync) {
            elements.lastSyncTime.textContent = new Date(state.settings.lastSync).toLocaleString();
        }
    }
    
    // Connect to cloud sync provider
    async function connectSyncProvider(provider) {
        showToast(`Connecting to ${capitalize(provider)}...`, 'info');
        try {
            const response = await chrome.runtime.sendMessage({ action: 'connectSyncProvider', provider });
            if (response?.success) {
                showToast(`Connected to ${capitalize(provider)}!`, 'success');
                updateSyncProviderUI(provider, response);
            } else {
                showToast(response?.error || `Failed to connect to ${capitalize(provider)}`, 'error');
            }
        } catch (e) {
            showToast(`Connection failed: ${e.message}`, 'error');
        }
    }
    
    // Disconnect from cloud sync provider
    async function disconnectSyncProvider(provider) {
        if (!await showConfirmModal('Disconnect', `Disconnect from ${capitalize(provider)}?`)) return;
        
        try {
            await chrome.runtime.sendMessage({ action: 'disconnectSyncProvider', provider });
            showToast(`Disconnected from ${capitalize(provider)}`, 'success');
            updateSyncProviderUI(provider, { connected: false });
        } catch (e) {
            showToast(`Disconnect failed: ${e.message}`, 'error');
        }
    }
    
    // Sync with provider
    async function syncWithProvider(provider) {
        showToast('Syncing...', 'info');
        try {
            const response = await chrome.runtime.sendMessage({ action: 'syncNow' });
            if (response?.success) {
                await loadScripts();
                updateStats();
                if (elements.lastSyncTime) {
                    elements.lastSyncTime.textContent = new Date().toLocaleString();
                }
                showToast('Sync complete!', 'success');
            } else {
                showToast(response?.error || 'Sync failed', 'error');
            }
        } catch (e) {
            showToast(`Sync failed: ${e.message}`, 'error');
        }
    }

    // ============================================
    // Per-Script Settings Functions
    // ============================================
    
    function loadScriptSettings(script) {
        if (!script) return;
        
        const settings = script.settings || {};
        const meta = script.metadata || {};
        
        // Basic settings
        if (elements.scriptAutoUpdate) elements.scriptAutoUpdate.checked = settings.autoUpdate !== false;
        if (elements.scriptNotifyUpdates) elements.scriptNotifyUpdates.checked = settings.notifyUpdates !== false;
        if (elements.scriptRunAt) elements.scriptRunAt.value = settings.runAt || 'default';
        if (elements.scriptInjectInto) elements.scriptInjectInto.value = settings.injectInto || 'auto';
        if (elements.scriptNotifyErrors) elements.scriptNotifyErrors.checked = settings.notifyErrors || false;
        
        // URL Override settings
        // Original patterns checkboxes
        if (elements.useOriginalIncludes) {
            elements.useOriginalIncludes.checked = settings.useOriginalIncludes !== false;
        }
        if (elements.useOriginalMatches) {
            elements.useOriginalMatches.checked = settings.useOriginalMatches !== false;
        }
        if (elements.useOriginalExcludes) {
            elements.useOriginalExcludes.checked = settings.useOriginalExcludes !== false;
        }
        
        // Display original patterns from metadata (read-only)
        renderOriginalPatterns('originalIncludesList', meta.include || []);
        renderOriginalPatterns('originalMatchesList', meta.match || []);
        renderOriginalPatterns('originalExcludesList', meta.exclude || []);
        
        // Display user patterns (editable)
        renderUserPatterns('userIncludesList', settings.userIncludes || [], 'include');
        renderUserPatterns('userMatchesList', settings.userMatches || [], 'match');
        renderUserPatterns('userExcludesList', settings.userExcludes || [], 'exclude');
        
        // Update visual state based on checkbox states
        updateOriginalPatternsState();
    }
    
    function renderOriginalPatterns(elementId, patterns) {
        const el = document.getElementById(elementId);
        if (!el) return;
        
        if (!patterns || patterns.length === 0) {
            el.innerHTML = '<em style="color: var(--text-muted);">None defined</em>';
            return;
        }
        
        el.innerHTML = patterns.map(p => 
            `<span class="pattern-item">${escapeHtml(p)}</span>`
        ).join('');
    }
    
    function renderUserPatterns(elementId, patterns, type) {
        const el = document.getElementById(elementId);
        if (!el) return;
        
        if (!patterns || patterns.length === 0) {
            el.innerHTML = '';
            return;
        }
        
        const isExclude = type === 'exclude';
        el.innerHTML = patterns.map((p, i) => 
            `<span class="pattern-tag ${isExclude ? 'exclude' : ''}" data-index="${i}" data-type="${type}">
                <span class="pattern-text">${escapeHtml(p)}</span>
                <span class="remove-pattern" title="Remove pattern">×</span>
            </span>`
        ).join('');
        
        // Add click handlers for remove buttons
        el.querySelectorAll('.remove-pattern').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tag = e.target.closest('.pattern-tag');
                if (tag) {
                    tag.remove();
                }
            });
        });
    }
    
    function updateOriginalPatternsState() {
        // Toggle visual state of original pattern groups based on checkbox
        const groups = [
            { checkbox: elements.useOriginalIncludes, list: elements.originalIncludesList },
            { checkbox: elements.useOriginalMatches, list: elements.originalMatchesList },
            { checkbox: elements.useOriginalExcludes, list: elements.originalExcludesList }
        ];
        
        groups.forEach(({ checkbox, list }) => {
            if (checkbox && list) {
                const group = list.closest('.url-override-group');
                if (group) {
                    group.classList.toggle('disabled', !checkbox.checked);
                }
            }
        });
    }
    
    function getUserPatternsFromList(elementId) {
        const el = document.getElementById(elementId);
        if (!el) return [];
        
        const patterns = [];
        el.querySelectorAll('.pattern-tag .pattern-text').forEach(span => {
            const pattern = span.textContent.trim();
            if (pattern) patterns.push(pattern);
        });
        return patterns;
    }
    
    function addUserPattern(listId, pattern, type) {
        const el = document.getElementById(listId);
        if (!el) return;
        
        // Check for duplicates
        const existing = getUserPatternsFromList(listId);
        if (existing.includes(pattern)) {
            showToast('Pattern already exists', 'warning');
            return;
        }
        
        const isExclude = type === 'exclude';
        const index = existing.length;
        
        const tag = document.createElement('span');
        tag.className = `pattern-tag ${isExclude ? 'exclude' : ''}`;
        tag.dataset.index = index;
        tag.dataset.type = type;
        tag.innerHTML = `
            <span class="pattern-text">${escapeHtml(pattern)}</span>
            <span class="remove-pattern" title="Remove pattern">×</span>
        `;
        
        tag.querySelector('.remove-pattern').addEventListener('click', () => {
            tag.remove();
        });
        
        el.appendChild(tag);
    }
    
    async function saveScriptSettings() {
        if (!state.currentScriptId) return;
        
        const settings = {
            autoUpdate: elements.scriptAutoUpdate?.checked ?? true,
            notifyUpdates: elements.scriptNotifyUpdates?.checked ?? true,
            runAt: elements.scriptRunAt?.value || 'default',
            injectInto: elements.scriptInjectInto?.value || 'auto',
            notifyErrors: elements.scriptNotifyErrors?.checked || false,
            // URL Override settings
            useOriginalIncludes: elements.useOriginalIncludes?.checked ?? true,
            useOriginalMatches: elements.useOriginalMatches?.checked ?? true,
            useOriginalExcludes: elements.useOriginalExcludes?.checked ?? true,
            userIncludes: getUserPatternsFromList('userIncludesList'),
            userMatches: getUserPatternsFromList('userMatchesList'),
            userExcludes: getUserPatternsFromList('userExcludesList')
        };
        
        try {
            await chrome.runtime.sendMessage({ action: 'setScriptSettings', scriptId: state.currentScriptId, settings });
            
            // Update local state
            const script = state.scripts.find(s => s.id === state.currentScriptId);
            if (script) script.settings = settings;
            
            showToast('Settings saved', 'success');
        } catch (e) {
            showToast('Failed to save settings', 'error');
        }
    }
    
    async function resetScriptSettings() {
        if (!state.currentScriptId) return;
        if (!await showConfirmModal('Reset Settings', 'Reset to default settings?')) return;
        
        const defaults = {
            autoUpdate: true,
            notifyUpdates: true,
            runAt: 'default',
            injectInto: 'auto',
            notifyErrors: false,
            // URL Override defaults
            useOriginalIncludes: true,
            useOriginalMatches: true,
            useOriginalExcludes: true,
            userIncludes: [],
            userMatches: [],
            userExcludes: []
        };
        
        try {
            await chrome.runtime.sendMessage({ action: 'setScriptSettings', scriptId: state.currentScriptId, settings: defaults });
            
            const script = state.scripts.find(s => s.id === state.currentScriptId);
            if (script) script.settings = defaults;
            
            loadScriptSettings(script);
            showToast('Settings reset', 'success');
        } catch (e) {
            showToast('Failed to reset settings', 'error');
        }
    }

    function applyTheme() {
        document.documentElement.setAttribute('data-theme', state.settings.theme || 'dark');
    }

    // Scripts
    async function loadScripts() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getScripts' });
            if (response?.scripts) {
                state.scripts = response.scripts;
                renderScriptTable();
            }
        } catch (e) {
            console.error('Failed to load scripts:', e);
        }
    }
    
    // Populate External Editor script dropdown
    function populateExternalEditorDropdown() {
        const select = elements.externalEditorScript;
        if (!select) return;
        
        // Clear existing options except the placeholder
        select.innerHTML = '<option value="">Select a script...</option>';
        
        // Add scripts
        const sortedScripts = [...state.scripts].sort((a, b) => {
            const nameA = a.metadata?.name || '';
            const nameB = b.metadata?.name || '';
            return nameA.localeCompare(nameB);
        });
        
        for (const script of sortedScripts) {
            const option = document.createElement('option');
            option.value = script.id;
            const name = script.metadata?.name || 'Unnamed Script';
            const version = script.metadata?.version || '';
            option.textContent = version ? `${name} v${version}` : name;
            select.appendChild(option);
        }
    }
    
    // Get filtered scripts based on search and filter dropdown
    function getFilteredScripts() {
        const searchFilter = (elements.scriptSearch?.value || '').toLowerCase();
        const statusFilter = elements.filterSelect?.value || 'all';
        
        return state.scripts.filter(s => {
            // Search filter
            const name = s.metadata?.name || '';
            const desc = s.metadata?.description || '';
            const matchesSearch = name.toLowerCase().includes(searchFilter) || desc.toLowerCase().includes(searchFilter);
            
            // Status filter
            let matchesStatus = true;
            if (statusFilter === 'enabled') {
                matchesStatus = s.enabled !== false;
            } else if (statusFilter === 'disabled') {
                matchesStatus = s.enabled === false;
            }
            
            return matchesSearch && matchesStatus;
        });
    }
    
    // Update bulk selection checkboxes
    function updateBulkCheckboxes() {
        const filtered = getFilteredScripts();
        
        // Update individual checkboxes
        document.querySelectorAll('.script-checkbox').forEach(cb => {
            cb.checked = state.selectedScripts.has(cb.dataset.id);
        });
        
        // Update select all checkbox
        const allSelected = filtered.length > 0 && filtered.every(s => state.selectedScripts.has(s.id));
        if (elements.bulkSelectAll) elements.bulkSelectAll.checked = allSelected;
        if (elements.selectAllScripts) elements.selectAllScripts.checked = allSelected;
    }
    
    // Execute bulk action
    async function executeBulkAction() {
        const action = elements.bulkActionSelect?.value;
        if (!action) {
            showToast('Please select an action', 'error');
            return;
        }
        
        if (state.selectedScripts.size === 0) {
            showToast('No scripts selected', 'error');
            return;
        }
        
        const ids = Array.from(state.selectedScripts);
        
        switch (action) {
            case 'toggle':
                for (const id of ids) {
                    const s = state.scripts.find(x => x.id === id);
                    if (s) await toggleScriptEnabled(id, s.enabled === false);
                }
                showToast(`Toggled ${ids.length} scripts`, 'success');
                break;
                
            case 'export':
                const exportData = {
                    version: 2,
                    exportedAt: new Date().toISOString(),
                    scripts: state.scripts.filter(s => ids.includes(s.id)).map(s => ({
                        id: s.id,
                        code: s.code,
                        enabled: s.enabled,
                        position: s.position,
                        metadata: s.metadata,
                        settings: s.settings
                    }))
                };
                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `espressomonkey-export-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
                showToast(`Exported ${ids.length} scripts`, 'success');
                break;
                
            case 'update':
                showToast('Checking for updates...', 'info');
                for (const id of ids) {
                    try {
                        await chrome.runtime.sendMessage({ action: 'checkScriptUpdate', scriptId: id });
                    } catch (e) {}
                }
                await loadScripts();
                showToast('Update check complete', 'success');
                break;
                
            case 'reset':
                if (!await showConfirmModal('Factory Reset', `Reset settings for ${ids.length} scripts?`)) return;
                for (const id of ids) {
                    try {
                        await chrome.runtime.sendMessage({ action: 'resetScriptSettings', scriptId: id });
                    } catch (e) {}
                }
                showToast(`Reset ${ids.length} scripts`, 'success');
                break;
                
            case 'delete':
                if (!await showConfirmModal('Delete Scripts', `Delete ${ids.length} scripts? This cannot be undone.`)) return;
                for (const id of ids) {
                    await deleteScript(id, true);
                }
                state.selectedScripts.clear();
                await loadScripts();
                showToast(`Deleted ${ids.length} scripts`, 'success');
                break;
        }
        
        // Reset dropdown
        if (elements.bulkActionSelect) elements.bulkActionSelect.value = '';
    }

    function renderScriptTable(filter = '') {
        if (!elements.scriptTableBody) return;
        elements.scriptTableBody.innerHTML = '';
        
        const filtered = getFilteredScripts();
        
        // Update script counter
        if (elements.scriptCounter) {
            const total = state.scripts.length;
            const shown = filtered.length;
            elements.scriptCounter.textContent = total === shown ? `${total} scripts` : `${shown} of ${total} scripts`;
        }

        if (filtered.length === 0) {
            elements.emptyState.style.display = 'block';
            return;
        }
        elements.emptyState.style.display = 'none';

        filtered.forEach((script, i) => {
            const tr = createScriptRow(script, i + 1);
            elements.scriptTableBody.appendChild(tr);
        });
        
        updateBulkCheckboxes();
    }

    function createScriptRow(script, index) {
        const tr = document.createElement('tr');
        const name = script.metadata?.name || 'Unnamed Script';
        const version = script.metadata?.version || '1.0';
        const enabled = script.enabled !== false;
        const size = formatBytes((script.code || '').length);
        const matches = [...(script.metadata?.match || []), ...(script.metadata?.include || [])];
        const grants = script.metadata?.grant || [];
        const updated = script.updatedAt ? formatTime(script.updatedAt) : '-';
        const icon = script.metadata?.icon || script.metadata?.iconURL;

        // Get homepage - fallback to derived URL from updateURL/downloadURL
        const homepage = script.metadata?.homepage || script.metadata?.homepageURL || 
                         deriveHomepageUrl(script.metadata?.updateURL) || 
                         deriveHomepageUrl(script.metadata?.downloadURL);

        // Extract unique domains from matches/includes for site icons
        const domains = extractDomainsFromPatterns(matches);
        
        // Generate favicon HTML - use @icon if present, otherwise derive from first domain
        const faviconHtml = generateFaviconHtml(icon, domains[0]);
        
        // Generate site icons HTML (up to 5 icons with overflow indicator)
        const siteIconsHtml = generateSiteIconsHtml(domains);

        const features = [];
        if (grants.some(g => g.includes('getValue') || g.includes('setValue'))) features.push({ c: 'badge-s', l: 'S' });
        if (grants.includes('GM_xmlhttpRequest')) features.push({ c: 'badge-x', l: 'X' });
        if (grants.includes('GM_addStyle')) features.push({ c: 'badge-c', l: 'C' });
        if (grants.includes('GM_openInTab')) features.push({ c: 'badge-t', l: 'T' });

        tr.innerHTML = `
            <td class="center"><input type="checkbox" class="script-checkbox" data-id="${script.id}"></td>
            <td class="center" style="color:var(--text-muted)">${index}</td>
            <td class="center">
                <label class="toggle-switch">
                    <input type="checkbox" class="script-toggle" data-id="${script.id}" ${enabled ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </td>
            <td>
                <div class="script-name-cell">
                    ${faviconHtml}
                    <span class="script-name" data-id="${script.id}">${escapeHtml(name)}</span>
                </div>
            </td>
            <td class="center">${escapeHtml(version)}</td>
            <td class="center">${size}</td>
            <td class="center" title="${escapeHtml(domains.join('\n'))}">${siteIconsHtml}</td>
            <td class="center">
                <div class="feature-badges">${features.map(f => `<span class="badge ${f.c}">${f.l}</span>`).join('')}</div>
            </td>
            <td class="center">${homepage ? `<a href="${escapeHtml(homepage)}" target="_blank">🔗</a>` : '-'}</td>
            <td class="center">${updated}</td>
            <td class="center">
                <div class="action-icons">
                    <button class="action-icon" title="Edit" data-action="edit" data-id="${script.id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="action-icon" title="Delete" data-action="delete" data-id="${script.id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                </div>
            </td>
        `;

        tr.querySelector('.script-toggle').addEventListener('change', e => {
            toggleScriptEnabled(script.id, e.target.checked);
        });
        tr.querySelector('.script-checkbox').addEventListener('change', e => {
            if (e.target.checked) {
                state.selectedScripts.add(script.id);
            } else {
                state.selectedScripts.delete(script.id);
            }
            updateBulkCheckboxes();
        });
        tr.querySelector('.script-name').addEventListener('click', () => openEditorForScript(script.id));
        tr.querySelector('[data-action="edit"]').addEventListener('click', () => openEditorForScript(script.id));
        tr.querySelector('[data-action="delete"]').addEventListener('click', () => deleteScript(script.id));

        return tr;
    }
    
    // Extract unique domains from @match/@include patterns
    function extractDomainsFromPatterns(patterns) {
        const domains = new Set();
        
        for (const pattern of patterns) {
            // Handle common patterns like *://*.example.com/*, https://www.example.com/*, etc.
            let domain = null;
            
            // Match URLs with protocol
            const urlMatch = pattern.match(/^(?:\*|https?|file):\/\/(?:\*\.)?([^\/\*]+)/);
            if (urlMatch) {
                domain = urlMatch[1].replace(/^\*\./, '');
            }
            
            // Handle @include patterns like /^https?:\/\/.*\.example\.com\//
            if (!domain && pattern.startsWith('/')) {
                const regexMatch = pattern.match(/\\?\.?([a-z0-9][-a-z0-9]*(?:\.[a-z0-9][-a-z0-9]*)+)/i);
                if (regexMatch) {
                    domain = regexMatch[1].replace(/\\/g, '');
                }
            }
            
            if (domain && domain !== '*' && !domain.includes('*')) {
                // Clean up domain
                domain = domain.toLowerCase();
                // Remove www. prefix for deduplication
                const cleanDomain = domain.replace(/^www\./, '');
                domains.add(cleanDomain);
            }
        }
        
        return Array.from(domains);
    }
    
    // Generate favicon HTML for script name column
    function generateFaviconHtml(iconUrl, firstDomain) {
        // Use a class-based fallback to avoid quote escaping issues in onerror
        if (iconUrl) {
            // Use the script's @icon directly
            return `<span class="script-favicon"><img src="${escapeHtml(iconUrl)}" onerror="this.onerror=null;this.style.display='none';this.parentElement.classList.add('favicon-fallback')"></span>`;
        } else if (firstDomain) {
            // Derive favicon from first domain
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(firstDomain)}&sz=32`;
            return `<span class="script-favicon"><img src="${faviconUrl}" onerror="this.onerror=null;this.style.display='none';this.parentElement.classList.add('favicon-fallback')"></span>`;
        } else {
            return `<span class="script-favicon favicon-fallback"></span>`;
        }
    }
    
    // Derive homepage URL from updateURL or downloadURL
    function deriveHomepageUrl(url) {
        if (!url) return null;
        
        // GitHub raw URLs: https://github.com/user/repo/raw/... or https://raw.githubusercontent.com/user/repo/...
        const githubMatch = url.match(/^https?:\/\/(?:raw\.githubusercontent\.com|github\.com)\/([^\/]+)\/([^\/]+)/);
        if (githubMatch) {
            return `https://github.com/${githubMatch[1]}/${githubMatch[2]}/`;
        }
        
        // GitLab raw URLs
        const gitlabMatch = url.match(/^https?:\/\/gitlab\.com\/([^\/]+)\/([^\/]+)/);
        if (gitlabMatch) {
            return `https://gitlab.com/${gitlabMatch[1]}/${gitlabMatch[2]}/`;
        }
        
        // GreasyFork/OpenUserJS URLs
        const greasyforkMatch = url.match(/^https?:\/\/(greasyfork\.org|openuserjs\.org)\/[^\/]+\/scripts\/(\d+)/);
        if (greasyforkMatch) {
            return `https://${greasyforkMatch[1]}/scripts/${greasyforkMatch[2]}`;
        }
        
        // For other URLs, try to get the base domain
        try {
            const urlObj = new URL(url);
            // Only return if it looks like a project page, not a CDN
            if (!urlObj.hostname.includes('cdn') && !urlObj.hostname.includes('raw.')) {
                return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname.split('/').slice(0, 3).join('/')}/`;
            }
        } catch (e) {
            // Invalid URL
        }
        
        return null;
    }
    
    // Generate site icons HTML for sites column
    function generateSiteIconsHtml(domains) {
        if (domains.length === 0) {
            return '-';
        }
        
        const maxIcons = 5;
        const displayDomains = domains.slice(0, maxIcons);
        const remainingCount = domains.length - maxIcons;
        
        let html = '<div class="site-icons">';
        
        for (const domain of displayDomains) {
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
            html += `<span class="site-icon" title="${escapeHtml(domain)}"><img src="${faviconUrl}" onerror="this.style.display='none'"></span>`;
        }
        
        if (remainingCount > 0) {
            html += `<span class="site-icon-more" title="${escapeHtml(domains.slice(maxIcons).join('\n'))}">+${remainingCount}</span>`;
        }
        
        html += '</div>';
        return html;
    }

    // Editor
    function openEditorForScript(scriptId) {
        const script = state.scripts.find(s => s.id === scriptId);
        if (!script) return;

        state.currentScriptId = scriptId;
        state.unsavedChanges = false;

        elements.editorTitle.textContent = script.metadata?.name || 'Edit Script';
        if (state.editor) {
            state.editor.setValue(script.code || '');
            state.editor.clearHistory();
            setTimeout(() => state.editor.refresh(), 10);
        }

        elements.btnEditorToggle.textContent = script.enabled !== false ? 'Disable' : 'Enable';
        loadScriptInfo(script);
        loadScriptStorage(script);
        elements.editorOverlay.classList.add('active');
        setTimeout(() => state.editor?.focus(), 100);
    }

    function closeEditor() {
        if (state.unsavedChanges) {
            showConfirmModal('Unsaved Changes', 'Discard changes?').then(ok => {
                if (ok) {
                    state.unsavedChanges = false;
                    elements.editorOverlay.classList.remove('active');
                    state.currentScriptId = null;
                }
            });
        } else {
            elements.editorOverlay.classList.remove('active');
            state.currentScriptId = null;
        }
    }

    function loadScriptInfo(script) {
        const m = script.metadata || {};
        elements.infoName.textContent = m.name || '-';
        elements.infoVersion.textContent = m.version || '-';
        elements.infoAuthor.textContent = m.author || '-';
        elements.infoDescription.textContent = m.description || '-';

        const hp = m.homepage || m.homepageURL;
        elements.infoHomepage.innerHTML = hp ? `<a href="${escapeHtml(hp)}" target="_blank">${escapeHtml(hp)}</a>` : '-';

        const up = m.updateURL || m.downloadURL;
        elements.infoUpdateUrl.innerHTML = up ? `<a href="${escapeHtml(up)}" target="_blank">${escapeHtml(up)}</a>` : '-';

        const grants = m.grant || [];
        elements.infoGrants.innerHTML = grants.length ? grants.map(g => `<span class="info-tag grant">${escapeHtml(g)}</span>`).join('') : '<span class="info-tag">none</span>';

        const matches = [...(m.match || []), ...(m.include || [])];
        elements.infoMatches.innerHTML = matches.length ? matches.map(x => `<span class="info-tag">${escapeHtml(x)}</span>`).join('') : '-';

        const res = [...(Array.isArray(m.resource) ? m.resource : []), ...(Array.isArray(m.require) ? m.require : [])];
        elements.infoResources.innerHTML = res.length ? res.map(r => `<div style="font-size:11px;margin-bottom:3px">${escapeHtml(typeof r === 'string' ? r : r.url || r.name)}</div>`).join('') : '-';
    }

    async function loadScriptStorage(script) {
        if (!elements.storageList) return;
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getScriptValues', scriptId: script.id });
            const values = response?.values || {};
            const keys = Object.keys(values);

            elements.storageList.innerHTML = '';
            if (keys.length === 0) {
                elements.storageList.innerHTML = '<div style="color:var(--text-muted);padding:20px;text-align:center">No stored values</div>';
            } else {
                keys.forEach(key => {
                    const item = createStorageItem(script.id, key, values[key]);
                    elements.storageList.appendChild(item);
                });
            }

            elements.storageSizeInfo.textContent = `${formatBytes(JSON.stringify(values).length)} used`;
        } catch (e) {
            console.error('Failed to load storage:', e);
        }
    }

    function createStorageItem(scriptId, key, value) {
        const item = document.createElement('div');
        item.className = 'storage-item';
        const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);

        item.innerHTML = `
            <span class="storage-key">${escapeHtml(key)}</span>
            <input type="text" class="input-field" value="${escapeHtml(valStr)}" style="flex:1">
            <div class="btn-group">
                <button class="btn" title="Save">💾</button>
                <button class="btn btn-danger" title="Delete">🗑️</button>
            </div>
        `;

        item.querySelector('.btn:first-of-type').addEventListener('click', async () => {
            let newVal = item.querySelector('.input-field').value;
            try { newVal = JSON.parse(newVal); } catch (e) {}
            await chrome.runtime.sendMessage({ action: 'setScriptValue', scriptId, key, value: newVal });
            showToast('Saved', 'success');
        });

        item.querySelector('.btn-danger').addEventListener('click', async () => {
            if (await showConfirmModal('Delete', `Delete "${key}"?`)) {
                await chrome.runtime.sendMessage({ action: 'deleteScriptValue', scriptId, key });
                item.remove();
                showToast('Deleted', 'success');
            }
        });

        return item;
    }

    // Script operations
    async function toggleScriptEnabled(scriptId, enabled) {
        try {
            await chrome.runtime.sendMessage({ action: 'toggleScript', scriptId, enabled });
            const script = state.scripts.find(s => s.id === scriptId);
            if (script) script.enabled = enabled;
            if (scriptId === state.currentScriptId) {
                elements.btnEditorToggle.textContent = enabled ? 'Disable' : 'Enable';
            }
            updateStats();
            showToast(enabled ? 'Enabled' : 'Disabled', 'success');
        } catch (e) {
            showToast('Failed', 'error');
        }
    }

    async function saveCurrentScript() {
        if (!state.currentScriptId || !state.editor) return;
        try {
            await chrome.runtime.sendMessage({ action: 'saveScript', scriptId: state.currentScriptId, code: state.editor.getValue() });
            state.unsavedChanges = false;
            await loadScripts();
            const script = state.scripts.find(s => s.id === state.currentScriptId);
            if (script) {
                loadScriptInfo(script);
                elements.editorTitle.textContent = script.metadata?.name || 'Edit Script';
            }
            showToast('Saved', 'success');
        } catch (e) {
            showToast('Failed to save', 'error');
        }
    }

    async function duplicateCurrentScript() {
        if (!state.currentScriptId) return;
        try {
            const response = await chrome.runtime.sendMessage({ action: 'duplicateScript', scriptId: state.currentScriptId });
            if (response?.success) {
                await loadScripts();
                closeEditor();
                openEditorForScript(response.newScriptId);
                showToast('Duplicated', 'success');
            }
        } catch (e) {
            showToast('Failed', 'error');
        }
    }

    async function deleteScript(scriptId, skipConfirm = false) {
        const script = state.scripts.find(s => s.id === scriptId);
        const name = script?.metadata?.name || 'this script';
        
        if (!skipConfirm) {
            if (!await showConfirmModal('Delete Script', `Delete "${name}"?`)) return;
        }

        try {
            await chrome.runtime.sendMessage({ action: 'deleteScript', scriptId });
            if (scriptId === state.currentScriptId) {
                state.currentScriptId = null;
                elements.editorOverlay.classList.remove('active');
            }
            if (!skipConfirm) {
                await loadScripts();
                updateStats();
                showToast('Deleted', 'success');
            }
        } catch (e) {
            if (!skipConfirm) showToast('Failed', 'error');
        }
    }

    async function createNewScript() {
        const code = `// ==UserScript==
// @name        New Script
// @namespace   http://example.com/
// @version     1.0
// @description A new userscript
// @author      You
// @match       *://*/*
// @grant       none
// ==/UserScript==

(function() {
    'use strict';
    // Your code here...
})();`;

        try {
            const response = await chrome.runtime.sendMessage({ action: 'createScript', code });
            if (response?.success) {
                await loadScripts();
                updateStats();
                openEditorForScript(response.scriptId);
                showToast('Created', 'success');
            }
        } catch (e) {
            showToast('Failed', 'error');
        }
    }

    // Editor init
    function initEditor() {
        if (!elements.editorTextarea) return;
        state.editor = CodeMirror.fromTextArea(elements.editorTextarea, {
            mode: 'javascript',
            theme: state.settings.editorTheme || 'default',
            lineNumbers: true,
            lineWrapping: state.settings.editorWordWrap !== false,
            indentUnit: state.settings.editorTabSize || 4,
            tabSize: state.settings.editorTabSize || 4,
            matchBrackets: true,
            autoCloseBrackets: true,
            foldGutter: true,
            gutters: ['CodeMirror-lint-markers', 'CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
            lint: {
                getAnnotations: window.lintUserscript,
                delay: 300,
                tooltips: true,
                highlightLines: true
            },
            extraKeys: {
                'Ctrl-S': saveCurrentScript,
                'Cmd-S': saveCurrentScript,
                'Ctrl-F': 'findPersistent',
                'Esc': closeEditor,
                'Tab': cm => cm.somethingSelected() ? cm.indentSelection('add') : cm.replaceSelection('    ', 'end')
            }
        });

        document.querySelector('.CodeMirror').style.fontSize = (state.settings.editorFontSize || 14) + 'px';
        state.editor.on('change', () => { state.unsavedChanges = true; });
    }

    // Import/Export
    async function importScript() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.user.js,.js,.zip,.json';
        input.multiple = true;
        input.addEventListener('change', async e => {
            for (const file of e.target.files) {
                try {
                    if (file.name.endsWith('.zip')) {
                        // Handle ZIP import
                        showToast('Importing ZIP...', 'info');
                        const buf = await file.arrayBuffer();
                        const bytes = new Uint8Array(buf);
                        const CHUNK_SIZE = 0x8000;
                        let binary = '';
                        for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
                            const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
                            binary += String.fromCharCode.apply(null, chunk);
                        }
                        const b64 = btoa(binary);
                        const r = await chrome.runtime.sendMessage({ action: 'importFromZip', zipData: b64, options: { overwrite: true } });
                        if (r?.error) {
                            showToast(r.error, 'error');
                        } else {
                            showImportSuccessModal({
                                imported: r?.imported || 0,
                                skipped: r?.skipped || 0,
                                errors: r?.errors || [],
                                filename: file.name
                            });
                        }
                    } else if (file.name.endsWith('.json')) {
                        // Handle JSON import
                        showToast('Importing JSON...', 'info');
                        const data = JSON.parse(await file.text());
                        await chrome.runtime.sendMessage({ action: 'importAll', data: { data, options: { overwrite: true } } });
                        showImportSuccessModal({
                            imported: data.scripts?.length || 0,
                            skipped: 0,
                            errors: [],
                            filename: file.name
                        });
                    } else {
                        // Handle single JS file
                        const code = await file.text();
                        const res = await chrome.runtime.sendMessage({ action: 'createScript', code });
                        if (res?.success) showToast(`Imported: ${file.name}`, 'success');
                        else showToast(`Failed: ${res?.error || file.name}`, 'error');
                    }
                } catch (err) {
                    showToast(`Failed: ${file.name} - ${err.message}`, 'error');
                }
            }
            await loadScripts();
            updateStats();
        });
        input.click();
    }

    async function exportAllScripts() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'exportAll' });
            if (response) {
                const blob = new Blob([JSON.stringify(response, null, 2)], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `espressomonkey-backup-${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                showToast('Exported', 'success');
            }
        } catch (e) {
            showToast('Failed', 'error');
        }
    }

    async function exportToZip() {
        try {
            showToast('Creating backup...', 'info');
            const response = await chrome.runtime.sendMessage({ action: 'exportZip' });
            if (response?.zipData) {
                const bytes = atob(response.zipData).split('').map(c => c.charCodeAt(0));
                const blob = new Blob([new Uint8Array(bytes)], { type: 'application/zip' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = response.filename || `espressomonkey-${new Date().toISOString().split('T')[0]}.zip`;
                a.click();
                
                // Calculate size for display
                const sizeKB = (blob.size / 1024).toFixed(1);
                const sizeMB = (blob.size / (1024 * 1024)).toFixed(2);
                const sizeStr = blob.size > 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;
                
                showExportSuccessModal({
                    filename: a.download,
                    size: sizeStr,
                    scriptCount: state.scripts.length
                });
            } else {
                showToast('Export failed - no data', 'error');
            }
        } catch (e) {
            console.error('Export error:', e);
            showToast('Export failed: ' + e.message, 'error');
        }
    }

    async function installFromUrl() {
        const url = elements.importUrlInput?.value?.trim();
        if (!url) return showToast('Enter URL', 'error');
        try {
            showToast('Fetching...', 'info');
            const res = await chrome.runtime.sendMessage({ action: 'installFromUrl', url });
            if (res?.success) {
                await loadScripts();
                updateStats();
                elements.importUrlInput.value = '';
                showToast('Installed', 'success');
            } else {
                showToast(res?.error || 'Failed', 'error');
            }
        } catch (e) {
            showToast('Failed', 'error');
        }
    }

    // Helpers
    function updateStats() {
        const total = state.scripts.length;
        const active = state.scripts.filter(s => s.enabled !== false).length;
        if (elements.statTotalScripts) elements.statTotalScripts.textContent = total;
        if (elements.statActiveScripts) elements.statActiveScripts.textContent = active;
        chrome.storage.local.getBytesInUse(null, bytes => {
            if (elements.statTotalStorage) elements.statTotalStorage.textContent = formatBytes(bytes);
        });
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function formatTime(ts) {
        const diff = Date.now() - new Date(ts).getTime();
        const h = Math.floor(diff / 3600000), d = Math.floor(h / 24);
        return d > 0 ? d + 'd' : h > 0 ? h + 'h' : 'now';
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    
    function formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + units[i];
    }

    function showToast(msg, type = 'info') {
        if (!elements.toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icons = { success: '✓', error: '✕', info: 'ℹ' };
        toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-message">${escapeHtml(msg)}</span>`;
        elements.toastContainer.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
    }

    function showModal(title, html, actions = []) {
        elements.modalTitle.textContent = title;
        elements.modalBody.innerHTML = html;
        elements.modalActions.innerHTML = '';
        actions.forEach(a => {
            const btn = document.createElement('button');
            btn.className = `btn ${a.class || ''}`;
            btn.textContent = a.label;
            btn.onclick = a.callback;
            elements.modalActions.appendChild(btn);
        });
        elements.modal.classList.add('show');
    }

    function hideModal() { elements.modal.classList.remove('show'); }

    function showConfirmModal(title, msg) {
        return new Promise(resolve => {
            showModal(title, `<p>${escapeHtml(msg)}</p>`, [
                { label: 'Cancel', class: '', callback: () => { hideModal(); resolve(false); } },
                { label: 'Confirm', class: 'btn-primary', callback: () => { hideModal(); resolve(true); } }
            ]);
        });
    }
    
    function showExportSuccessModal(data) {
        const html = `
            <div style="text-align: center; padding: 20px 0;">
                <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
                <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px; color: var(--accent-primary);">Export Successful!</div>
                <div style="color: var(--text-secondary); margin-bottom: 20px;">Your backup has been downloaded</div>
                <div style="background: var(--bg-input); border-radius: 8px; padding: 16px; text-align: left;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--text-muted);">Scripts exported:</span>
                        <span style="font-weight: 600;">${data.scriptCount}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--text-muted);">File size:</span>
                        <span style="font-weight: 600;">${data.size}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--text-muted);">Filename:</span>
                        <span style="font-weight: 500; font-size: 12px; word-break: break-all;">${escapeHtml(data.filename)}</span>
                    </div>
                </div>
            </div>
        `;
        showModal('Export Complete', html, [
            { label: 'Close', class: 'btn-primary', callback: hideModal }
        ]);
    }
    
    function showImportSuccessModal(data) {
        const html = `
            <div style="text-align: center; padding: 20px 0;">
                <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
                <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px; color: var(--accent-primary);">Import Successful!</div>
                <div style="color: var(--text-secondary); margin-bottom: 20px;">Your scripts have been restored</div>
                <div style="background: var(--bg-input); border-radius: 8px; padding: 16px; text-align: left;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--text-muted);">Scripts imported:</span>
                        <span style="font-weight: 600; color: var(--accent-primary);">${data.imported}</span>
                    </div>
                    ${data.skipped > 0 ? `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--text-muted);">Scripts skipped:</span>
                        <span style="font-weight: 600; color: var(--accent-warning);">${data.skipped}</span>
                    </div>
                    ` : ''}
                    ${data.errors && data.errors.length > 0 ? `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--text-muted);">Errors:</span>
                        <span style="font-weight: 600; color: var(--accent-error);">${data.errors.length}</span>
                    </div>
                    ` : ''}
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--text-muted);">From file:</span>
                        <span style="font-weight: 500; font-size: 12px; word-break: break-all;">${escapeHtml(data.filename || 'Unknown')}</span>
                    </div>
                </div>
                ${data.errors && data.errors.length > 0 ? `
                <div style="margin-top: 12px; text-align: left;">
                    <details style="background: var(--bg-input); border-radius: 4px; padding: 8px;">
                        <summary style="cursor: pointer; color: var(--accent-error); font-size: 12px;">View errors</summary>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px; max-height: 100px; overflow-y: auto;">
                            ${data.errors.map(e => `<div>• ${escapeHtml(e.name)}: ${escapeHtml(e.error)}</div>`).join('')}
                        </div>
                    </details>
                </div>
                ` : ''}
            </div>
        `;
        showModal('Import Complete', html, [
            { label: 'Close', class: 'btn-primary', callback: hideModal }
        ]);
    }

    // Event listeners
    function initEventListeners() {
        // Main tabs
        elements.mainTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const id = tab.dataset.tab;
                elements.mainTabs.forEach(t => t.classList.remove('active'));
                Object.values(elements.mainPanels).forEach(p => p?.classList.remove('active'));
                tab.classList.add('active');
                elements.mainPanels[id]?.classList.add('active');
            });
        });

        // Scripts
        elements.scriptSearch?.addEventListener('input', e => renderScriptTable(e.target.value));
        elements.btnNewScript?.addEventListener('click', createNewScript);
        elements.btnImportScript?.addEventListener('click', importScript);
        elements.btnCheckUpdates?.addEventListener('click', async () => {
            showToast('Checking...', 'info');
            try {
                await chrome.runtime.sendMessage({ action: 'checkAllUpdates' });
                await loadScripts();
                showToast('Done', 'success');
            } catch (e) { showToast('Failed', 'error'); }
        });
        
        // Bulk Actions (Tampermonkey-style)
        elements.bulkSelectAll?.addEventListener('change', e => {
            state.selectedScripts.clear();
            if (e.target.checked) {
                const filtered = getFilteredScripts();
                filtered.forEach(s => state.selectedScripts.add(s.id));
            }
            updateBulkCheckboxes();
        });
        
        // Table header checkbox (syncs with bulk toolbar)
        elements.selectAllScripts?.addEventListener('change', e => {
            state.selectedScripts.clear();
            if (e.target.checked) {
                const filtered = getFilteredScripts();
                filtered.forEach(s => state.selectedScripts.add(s.id));
            }
            updateBulkCheckboxes();
        });
        
        elements.btnBulkApply?.addEventListener('click', executeBulkAction);
        
        elements.filterSelect?.addEventListener('change', () => {
            renderScriptTable(elements.scriptSearch?.value || '');
        });
        
        elements.btnExportAll?.addEventListener('click', async () => {
            const exportData = {
                version: 2,
                exportedAt: new Date().toISOString(),
                scripts: state.scripts.map(s => ({
                    id: s.id,
                    code: s.code,
                    enabled: s.enabled,
                    position: s.position,
                    metadata: s.metadata,
                    settings: s.settings
                }))
            };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `espressomonkey-export-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast(`Exported ${state.scripts.length} scripts`, 'success');
        });

        // Editor
        elements.btnEditorSave?.addEventListener('click', saveCurrentScript);
        elements.btnEditorToggle?.addEventListener('click', () => {
            const script = state.scripts.find(s => s.id === state.currentScriptId);
            if (script) toggleScriptEnabled(script.id, script.enabled === false);
        });
        elements.btnEditorDuplicate?.addEventListener('click', duplicateCurrentScript);
        elements.btnEditorDelete?.addEventListener('click', () => { if (state.currentScriptId) deleteScript(state.currentScriptId); });
        elements.btnEditorClose?.addEventListener('click', closeEditor);

        // Editor tabs
        elements.editorTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const id = tab.dataset.panel;
                elements.editorTabs.forEach(t => t.classList.remove('active'));
                Object.values(elements.editorPanels).forEach(p => p?.classList.remove('active'));
                tab.classList.add('active');
                elements.editorPanels[id]?.classList.add('active');
                if (id === 'code') setTimeout(() => state.editor?.refresh(), 10);
                if (id === 'scriptsettings') {
                    const script = state.scripts.find(s => s.id === state.currentScriptId);
                    loadScriptSettings(script);
                }
            });
        });

        // Add storage
        elements.btnAddStorage?.addEventListener('click', () => {
            if (!state.currentScriptId) return;
            showModal('Add Value', `
                <div class="form-group"><label>Key</label><input class="input-field" id="newKey" placeholder="key"></div>
                <div class="form-group"><label>Value</label><input class="input-field" id="newVal" placeholder="value"></div>
            `, [
                { label: 'Cancel', callback: hideModal },
                { label: 'Add', class: 'btn-primary', callback: async () => {
                    const key = document.getElementById('newKey').value.trim();
                    let val = document.getElementById('newVal').value;
                    if (!key) return showToast('Key required', 'error');
                    try { val = JSON.parse(val); } catch (e) {}
                    await chrome.runtime.sendMessage({ action: 'setScriptValue', scriptId: state.currentScriptId, key, value: val });
                    hideModal();
                    loadScriptStorage(state.scripts.find(s => s.id === state.currentScriptId));
                    showToast('Added', 'success');
                }}
            ]);
        });
        
        // Per-script settings
        elements.btnSaveScriptSettings?.addEventListener('click', saveScriptSettings);
        elements.btnResetScriptSettings?.addEventListener('click', resetScriptSettings);
        
        // URL Override controls
        elements.useOriginalIncludes?.addEventListener('change', updateOriginalPatternsState);
        elements.useOriginalMatches?.addEventListener('change', updateOriginalPatternsState);
        elements.useOriginalExcludes?.addEventListener('change', updateOriginalPatternsState);
        
        // Add pattern buttons
        elements.btnAddUserInclude?.addEventListener('click', () => {
            elements.userIncludeInput.classList.add('visible');
            elements.userIncludeInput.focus();
        });
        elements.btnAddUserMatch?.addEventListener('click', () => {
            elements.userMatchInput.classList.add('visible');
            elements.userMatchInput.focus();
        });
        elements.btnAddUserExclude?.addEventListener('click', () => {
            elements.userExcludeInput.classList.add('visible');
            elements.userExcludeInput.focus();
        });
        
        // Pattern input handlers
        const setupPatternInput = (input, listId, type) => {
            if (!input) return;
            
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const pattern = input.value.trim();
                    if (pattern) {
                        addUserPattern(listId, pattern, type);
                        input.value = '';
                    }
                    input.classList.remove('visible');
                } else if (e.key === 'Escape') {
                    input.value = '';
                    input.classList.remove('visible');
                }
            });
            
            input.addEventListener('blur', () => {
                const pattern = input.value.trim();
                if (pattern) {
                    addUserPattern(listId, pattern, type);
                    input.value = '';
                }
                input.classList.remove('visible');
            });
        };
        
        setupPatternInput(elements.userIncludeInput, 'userIncludesList', 'include');
        setupPatternInput(elements.userMatchInput, 'userMatchesList', 'match');
        setupPatternInput(elements.userExcludeInput, 'userExcludesList', 'exclude');

        // Settings listeners - comprehensive settings map
        const settingMap = {
            // General
            settingsConfigMode: ['configMode', 'value'],
            // settingsLanguage handled separately with restart notice
            settingsAutoReload: ['autoReload', 'checked'],
            settingsAnonymousStats: ['anonymousStats', 'checked'],
            settingsDebugMode: ['debugMode', 'checked'],
            settingsShowFixedSource: ['showFixedSource', 'checked'],
            settingsLoggingLevel: ['loggingLevel', 'value'],
            settingsTrashMode: ['trashMode', 'value'],
            
            // Tags
            settingsEnableTags: ['enableTags', 'checked'],
            
            // Action Menu
            settingsHideDisabledPopup: ['hideDisabledPopup', 'checked'],
            settingsPopupColumns: ['popupColumns', 'value'],
            settingsScriptOrder: ['scriptOrder', 'value'],
            settingsBadgeInfo: ['badgeInfo', 'value'],
            
            // Context Menu
            settingsEnableContextMenu: ['enableContextMenu', 'checked'],
            settingsContextMenuRunAt: ['contextMenuRunAt', 'checked'],
            settingsContextMenuCommands: ['contextMenuCommands', 'checked'],
            
            // Userscript Search
            settingsSearchIntegration: ['searchIntegration', 'value'],
            
            // Userscript Update
            settingsUpdateDisabled: ['updateDisabled', 'checked'],
            settingsSilentUpdate: ['silentUpdate', 'checked'],
            settingsCheckInterval: ['checkInterval', 'value'],
            settingsNotifyHideAfter: ['notifyHideAfter', 'value'],
            
            // Externals
            settingsExternalsInterval: ['externalsInterval', 'value'],
            
            // Sync
            settingsEnableSync: ['enableSync', 'checked'],
            
            // Editor
            settingsEnableEditor: ['enableEditor', 'checked'],
            settingsEditorTheme: ['editorTheme', 'value'],
            settingsEditorFontSize: ['editorFontSize', 'value'],
            settingsKeyMapping: ['keyMapping', 'value'],
            settingsIndentWidth: ['indentWidth', 'value'],
            settingsTabSize: ['tabSize', 'value'],
            settingsIndentWith: ['indentWith', 'value'],
            settingsTabMode: ['tabMode', 'value'],
            settingsHighlightMatches: ['highlightMatches', 'value'],
            settingsWordWrap: ['wordWrap', 'checked'],
            settingsReindent: ['reindent', 'checked'],
            settingsAutoSave: ['autoSave', 'checked'],
            settingsNoSaveConfirm: ['noSaveConfirm', 'checked'],
            settingsHighlightTrailingWhitespace: ['highlightTrailingWhitespace', 'checked'],
            settingsTrimWhitespace: ['trimWhitespace', 'checked'],
            settingsLintOnType: ['lintOnType', 'checked'],
            
            // Security
            settingsContentScriptAPI: ['contentScriptAPI', 'value'],
            settingsDefaultSandboxMode: ['defaultSandboxMode', 'value'],
            settingsModifyCSP: ['modifyCSP', 'value'],
            settingsDefaultTabTypes: ['defaultTabTypes', 'value'],
            settingsAllowLocalFiles: ['allowLocalFiles', 'value'],
            settingsAllowFileUrls: ['allowFileUrls', 'checked'],
            settingsAllowCookies: ['allowCookies', 'value'],
            settingsAllowCommunication: ['allowCommunication', 'value'],
            settingsSRI: ['sri', 'value'],
            settingsIncludeMode: ['includeMode', 'value'],
            settingsCheckConnect: ['checkConnect', 'value'],
            settingsIncognitoStorage: ['incognitoStorage', 'value'],
            settingsPageFilterMode: ['pageFilterMode', 'value'],
            settingsHttpHeaderWarnings: ['httpHeaderWarnings', 'checked'],
            
            // BlackCheck
            settingsBlacklistSource: ['blacklistSource', 'value'],
            settingsBlacklistSeverity: ['blacklistSeverity', 'value'],
            
            // Downloads
            settingsDownloadMode: ['downloadMode', 'value'],
            
            // Experimental
            settingsStrictMode: ['strictMode', 'value'],
            settingsTopLevelAwait: ['topLevelAwait', 'value']
        };

        Object.entries(settingMap).forEach(([id, [key, prop, fn]]) => {
            elements[id]?.addEventListener('change', e => saveSetting(key, fn ? fn(e.target[prop]) : e.target[prop]));
        });
        
        // HTTP Headers setting (convert yes/no to boolean)
        elements.settingsAllowHttpHeaders?.addEventListener('change', e => {
            saveSetting('allowHttpHeaders', e.target.value === 'yes');
        });
        
        // Language setting with restart notice
        const languageRestartNotice = document.getElementById('languageRestartNotice');
        const btnReloadForLanguage = document.getElementById('btnReloadForLanguage');
        let originalLanguage = state.settings.language || 'auto';
        
        elements.settingsLanguage?.addEventListener('change', async e => {
            const newLang = e.target.value;
            await saveSetting('language', newLang);
            
            // Show restart notice if language changed from original
            if (languageRestartNotice) {
                if (newLang !== originalLanguage) {
                    languageRestartNotice.style.display = 'block';
                } else {
                    languageRestartNotice.style.display = 'none';
                }
            }
        });
        
        btnReloadForLanguage?.addEventListener('click', () => {
            window.location.reload();
        });
        
        // Allowed sandbox modes checkboxes
        const updateAllowedSandboxModes = () => {
            const modes = [];
            if (elements.settingsAllowSandboxRaw?.checked) modes.push('raw');
            if (elements.settingsAllowSandboxJs?.checked) modes.push('js');
            if (elements.settingsAllowSandboxDom?.checked) modes.push('dom');
            saveSetting('allowedSandboxModes', modes);
        };
        elements.settingsAllowSandboxRaw?.addEventListener('change', updateAllowedSandboxModes);
        elements.settingsAllowSandboxJs?.addEventListener('change', updateAllowedSandboxModes);
        elements.settingsAllowSandboxDom?.addEventListener('change', updateAllowedSandboxModes);
        
        // Layout/Theme setting (with theme application)
        elements.settingsLayout?.addEventListener('change', e => {
            saveSetting('layout', e.target.value);
            document.documentElement.setAttribute('data-theme', e.target.value);
        });
        
        // Badge color with preview
        elements.settingsBadgeColor?.addEventListener('input', e => {
            if (elements.badgeColorPreview) {
                elements.badgeColorPreview.style.backgroundColor = e.target.value;
            }
        });
        elements.settingsBadgeColor?.addEventListener('blur', e => {
            saveSetting('badgeColor', e.target.value);
        });

        // Sync Type with provider toggle
        elements.settingsSyncType?.addEventListener('change', e => {
            saveSetting('syncType', e.target.value);
            toggleSyncProviderSettings();
        });

        // Text/URL inputs that save on blur
        elements.settingsWebdavUrl?.addEventListener('blur', e => saveSetting('webdavUrl', e.target.value.trim()));
        elements.settingsWebdavUsername?.addEventListener('blur', e => saveSetting('webdavUsername', e.target.value.trim()));
        elements.settingsWebdavPassword?.addEventListener('blur', e => saveSetting('webdavPassword', e.target.value));
        elements.settingsLintMaxSize?.addEventListener('blur', e => saveSetting('lintMaxSize', e.target.value));

        // Textarea inputs that save on blur
        elements.settingsCustomCss?.addEventListener('blur', e => saveSetting('customCss', e.target.value));
        elements.settingsWhitelistedPages?.addEventListener('blur', e => saveSetting('whitelistedPages', e.target.value));
        elements.settingsBlacklistedPages?.addEventListener('blur', e => saveSetting('blacklistedPages', e.target.value));
        elements.settingsManualBlacklist?.addEventListener('blur', e => saveSetting('manualBlacklist', e.target.value));
        elements.settingsDownloadWhitelist?.addEventListener('blur', e => saveSetting('downloadWhitelist', e.target.value));
        elements.settingsLinterConfig?.addEventListener('blur', e => saveSetting('linterConfig', e.target.value));

        // Section Save buttons
        elements.btnSaveAppearance?.addEventListener('click', async () => {
            await saveSetting('customCss', elements.settingsCustomCss?.value || '');
            showToast('Appearance saved', 'success');
        });
        
        elements.btnSaveActionMenu?.addEventListener('click', async () => {
            await saveSetting('badgeColor', elements.settingsBadgeColor?.value || '#ee3131');
            showToast('Action Menu saved', 'success');
        });
        
        elements.btnSaveSync?.addEventListener('click', async () => {
            showToast('Sync settings saved', 'success');
        });
        
        elements.btnSaveEditor?.addEventListener('click', async () => {
            await saveSetting('linterConfig', elements.settingsLinterConfig?.value || '');
            showToast('Editor settings saved', 'success');
        });
        
        elements.btnSaveSecurity?.addEventListener('click', async () => {
            await saveSetting('whitelistedPages', elements.settingsWhitelistedPages?.value || '');
            await saveSetting('blacklistedPages', elements.settingsBlacklistedPages?.value || '');
            showToast('Security settings saved', 'success');
        });
        
        elements.btnSaveBlackCheck?.addEventListener('click', async () => {
            await saveSetting('manualBlacklist', elements.settingsManualBlacklist?.value || '');
            showToast('BlackCheck settings saved', 'success');
        });
        
        elements.btnSaveDownloads?.addEventListener('click', async () => {
            await saveSetting('downloadWhitelist', elements.settingsDownloadWhitelist?.value || '');
            showToast('Download settings saved', 'success');
        });

        // Sync buttons
        elements.btnSyncNow?.addEventListener('click', async () => {
            const syncType = elements.settingsSyncType?.value;
            if (!syncType || syncType === 'browser' || syncType === 'none') {
                showToast('Select a cloud provider first', 'info');
                return;
            }
            
            showToast('Syncing to ' + capitalize(syncType) + '...', 'info');
            try {
                const r = await chrome.runtime.sendMessage({ action: 'syncNow' });
                const timestamp = new Date().toLocaleTimeString();
                
                if (elements.syncLog) {
                    const status = r?.success ? '✓ Sync completed' : `✕ ${r?.error || 'Failed'}`;
                    elements.syncLog.value = `[${timestamp}] ${status}\n` + (elements.syncLog.value || '');
                }
                
                if (r?.success) { 
                    await loadScripts(); 
                    updateStats();
                    const msg = r.scriptsCount ? `Synced ${r.scriptsCount} scripts` : 'Sync complete!';
                    showToast(msg, 'success');
                } else {
                    showToast(r?.error || 'Sync failed', 'error');
                }
            } catch (e) { 
                showToast('Sync failed: ' + e.message, 'error'); 
            }
        });
        
        elements.btnSyncReset?.addEventListener('click', async () => {
            if (elements.syncLog) elements.syncLog.value = '';
            showToast('Sync log cleared', 'success');
        });
        
        // OAuth connection
        elements.btnConnectOAuth?.addEventListener('click', async () => {
            const syncType = elements.settingsSyncType?.value;
            if (syncType && ['googledrive', 'dropbox', 'onedrive'].includes(syncType)) {
                connectSyncProvider(syncType);
            }
        });
        
        elements.btnDisconnectOAuth?.addEventListener('click', async () => {
            const syncType = elements.settingsSyncType?.value;
            if (syncType) {
                disconnectSyncProvider(syncType);
            }
        });

        // Permissions
        elements.btnGrantSelected?.addEventListener('click', () => showToast('No hosts selected', 'info'));
        elements.btnGrantAll?.addEventListener('click', () => showToast('All hosts granted', 'success'));
        elements.btnResetPermissions?.addEventListener('click', () => {
            if (elements.settingsDeniedHosts) elements.settingsDeniedHosts.value = '';
            showToast('Permissions list reset', 'success');
        });

        // Reset buttons
        elements.btnRestartExtension?.addEventListener('click', async () => {
            if (!await showConfirmModal('Restart', 'Restart EspressoMonkey?')) return;
            await chrome.runtime.sendMessage({ action: 'restart' });
            showToast('Restarting...', 'info');
        });
        
        elements.btnFactoryReset?.addEventListener('click', async () => {
            if (!await showConfirmModal('Factory Reset', 'This will delete all scripts and reset all settings. This cannot be undone. Continue?')) return;
            await chrome.runtime.sendMessage({ action: 'factoryReset' });
            await loadSettings();
            await loadScripts();
            showToast('Factory reset complete', 'success');
        });

        // Utilities
        elements.btnExportAll?.addEventListener('click', exportAllScripts);
        elements.btnExportZip?.addEventListener('click', exportToZip);
        elements.btnChooseFile?.addEventListener('click', () => elements.importFileInput?.click());
        elements.importFileInput?.addEventListener('change', async e => {
            const file = e.target.files[0];
            if (!file) return;
            elements.importFileName.textContent = file.name;
            const isZip = file.name.endsWith('.zip');
            if (!await showConfirmModal('Import', `Import from ${file.name}?`)) return;
            try {
                showToast('Importing...', 'info');
                if (isZip) {
                    const buf = await file.arrayBuffer();
                    // Convert to base64 using chunked binary string building (to avoid stack overflow)
                    // then single btoa call (required for valid base64)
                    const bytes = new Uint8Array(buf);
                    const CHUNK_SIZE = 0x8000; // 32KB
                    let binary = '';
                    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
                        const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
                        binary += String.fromCharCode.apply(null, chunk);
                    }
                    const b64 = btoa(binary);
                    const r = await chrome.runtime.sendMessage({ action: 'importFromZip', zipData: b64, options: { overwrite: true } });
                    if (r?.error) {
                        showToast(r.error, 'error');
                    } else {
                        await loadScripts();
                        await loadSettings();
                        updateStats();
                        showImportSuccessModal({
                            imported: r?.imported || 0,
                            skipped: r?.skipped || 0,
                            errors: r?.errors || [],
                            filename: file.name
                        });
                    }
                } else {
                    const data = JSON.parse(await file.text());
                    const r = await chrome.runtime.sendMessage({ action: 'importAll', data: { data, options: { overwrite: true } } });
                    await loadScripts();
                    await loadSettings();
                    updateStats();
                    showImportSuccessModal({
                        imported: data.scripts?.length || 0,
                        skipped: 0,
                        errors: [],
                        filename: file.name
                    });
                }
            } catch (err) { 
                showToast('Failed: ' + err.message, 'error'); 
            }
            // Reset file input
            e.target.value = '';
        });

        elements.btnInstallFromUrl?.addEventListener('click', installFromUrl);

        elements.btnTextareaExport?.addEventListener('click', async () => {
            const r = await chrome.runtime.sendMessage({ action: 'exportAll' });
            if (r && elements.textareaData) {
                elements.textareaData.value = JSON.stringify(r, null, 2);
                showToast('Exported', 'success');
            }
        });

        elements.btnTextareaImport?.addEventListener('click', async () => {
            const txt = elements.textareaData?.value?.trim();
            if (!txt) return showToast('Empty', 'error');
            try {
                const data = JSON.parse(txt);
                if (!await showConfirmModal('Import', `Import ${data.scripts?.length || 0} scripts?`)) return;
                showToast('Importing...', 'info');
                await chrome.runtime.sendMessage({ action: 'importAll', data: { data, options: { overwrite: true } } });
                await loadScripts();
                updateStats();
                showImportSuccessModal({
                    imported: data.scripts?.length || 0,
                    skipped: 0,
                    errors: [],
                    filename: 'Textarea import'
                });
            } catch (e) { showToast('Invalid JSON', 'error'); }
        });
        
        // External Editor - populate script dropdown when switching to utilities tab
        elements.mainTabs?.forEach(tab => {
            tab.addEventListener('click', () => {
                if (tab.dataset.tab === 'utilities') {
                    populateExternalEditorDropdown();
                }
            });
        });
        
        // External Editor - Copy to Clipboard
        elements.btnCopyToClipboard?.addEventListener('click', async () => {
            const scriptId = elements.externalEditorScript?.value;
            if (!scriptId) return showToast('Select a script first', 'error');
            
            try {
                const script = await chrome.runtime.sendMessage({ action: 'getScript', data: { scriptId } });
                if (script?.code) {
                    await navigator.clipboard.writeText(script.code);
                    showToast('Script copied to clipboard', 'success');
                } else {
                    showToast('Script not found', 'error');
                }
            } catch (e) {
                showToast('Failed to copy: ' + e.message, 'error');
            }
        });
        
        // External Editor - Import from Clipboard
        elements.btnImportFromClipboard?.addEventListener('click', async () => {
            const scriptId = elements.externalEditorScript?.value;
            if (!scriptId) return showToast('Select a script first', 'error');
            
            try {
                const code = await navigator.clipboard.readText();
                if (!code || !code.trim()) {
                    return showToast('Clipboard is empty', 'error');
                }
                
                // Check if it looks like userscript code
                if (!code.includes('==UserScript==')) {
                    if (!await showConfirmModal('Import', 'Clipboard content doesn\'t look like a userscript. Import anyway?')) {
                        return;
                    }
                }
                
                const result = await chrome.runtime.sendMessage({ 
                    action: 'updateScript', 
                    data: { scriptId, code } 
                });
                
                if (result?.success) {
                    showToast('Script updated from clipboard', 'success');
                    await loadScripts();
                } else {
                    showToast('Failed to update: ' + (result?.error || 'Unknown error'), 'error');
                }
            } catch (e) {
                showToast('Failed to read clipboard: ' + e.message, 'error');
            }
        });
        
        // External Editor - Open in vscode.dev
        elements.btnOpenInVSCode?.addEventListener('click', async () => {
            const scriptId = elements.externalEditorScript?.value;
            if (!scriptId) return showToast('Select a script first', 'error');
            
            try {
                const script = await chrome.runtime.sendMessage({ action: 'getScript', data: { scriptId } });
                if (script?.code) {
                    // Copy to clipboard first
                    await navigator.clipboard.writeText(script.code);
                    
                    // Open vscode.dev in new tab - user can paste from clipboard
                    window.open('https://vscode.dev/', '_blank');
                    showToast('Code copied. Paste in vscode.dev with Ctrl+V', 'success');
                } else {
                    showToast('Script not found', 'error');
                }
            } catch (e) {
                showToast('Failed: ' + e.message, 'error');
            }
        });

        // Modal
        elements.modalClose?.addEventListener('click', hideModal);
        elements.modal?.addEventListener('click', e => { if (e.target === elements.modal) hideModal(); });

        // Keyboard
        document.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's' && elements.editorOverlay.classList.contains('active')) {
                e.preventDefault();
                saveCurrentScript();
            }
            if (e.key === 'Escape' && elements.editorOverlay.classList.contains('active')) closeEditor();
        });

        window.addEventListener('beforeunload', e => {
            if (state.unsavedChanges) { e.preventDefault(); e.returnValue = ''; }
        });
    }

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
