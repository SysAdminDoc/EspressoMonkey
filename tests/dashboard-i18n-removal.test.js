import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dashboardHtml = readFileSync(resolve(process.cwd(), 'pages/dashboard.html'), 'utf8');
const dashboardJs = readFileSync(resolve(process.cwd(), 'pages/dashboard.js'), 'utf8');
const lazyLoader = readFileSync(resolve(process.cwd(), 'pages/dashboard-lazy-loader.js'), 'utf8');
const localeDocs = readFileSync(resolve(process.cwd(), 'docs/locale-coverage.md'), 'utf8');
const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8');
const popupHtml = readFileSync(resolve(process.cwd(), 'pages/popup.html'), 'utf8');
const popupJs = readFileSync(resolve(process.cwd(), 'pages/popup.js'), 'utf8');
const sidepanelHtml = readFileSync(resolve(process.cwd(), 'pages/sidepanel.html'), 'utf8');
const sidepanelJs = readFileSync(resolve(process.cwd(), 'pages/sidepanel.js'), 'utf8');
const installHtml = readFileSync(resolve(process.cwd(), 'pages/install.html'), 'utf8');
const installJs = readFileSync(resolve(process.cwd(), 'pages/install.js'), 'utf8');
const devtoolsHtml = readFileSync(resolve(process.cwd(), 'pages/devtools.html'), 'utf8');
const devtoolsJs = readFileSync(resolve(process.cwd(), 'pages/devtools.js'), 'utf8');
const devtoolsPanelHtml = readFileSync(resolve(process.cwd(), 'pages/devtools-panel.html'), 'utf8');
const devtoolsPanelJs = readFileSync(resolve(process.cwd(), 'pages/devtools-panel.js'), 'utf8');

describe('dashboard i18n-v2 removal', () => {
  it('does not ship or eager-load the dead dashboard dictionary', () => {
    expect(existsSync(resolve(process.cwd(), 'pages/dashboard-i18n-v2.js'))).toBe(false);
    expect(dashboardHtml).not.toContain('dashboard-i18n-v2.js');
    expect(lazyLoader).not.toContain('dashboard-i18n-v2.js');
    expect(dashboardJs).not.toContain('I18nV2');
    expect(dashboardJs).not.toContain('syncDashboardModuleLanguage');
  });

  it('removes the dashboard language selector that had no translation target', () => {
    expect(dashboardHtml).not.toContain('id="settingsLanguage"');
    expect(dashboardJs).not.toContain('settingsLanguage');
  });

  it('keeps locale claims scoped to active runtime surfaces', () => {
    expect(readme).toContain('ScriptVault ships English plus 8 explicitly partial translations');
    expect(readme).toContain('untranslated runtime messages fall back to English');
    expect(localeDocs).not.toContain('dashboard-i18n-v2.js');
    expect(dashboardHtml).toContain('<script src="../modules/i18n.js"></script>');
    expect(dashboardJs).toContain('function applyDashboardI18n()');
    expect(dashboardJs).toContain('i18n.applyToDOM(document)');
  });

  it('translates the scripts table, empty state, and update queue through the active runtime dictionary', () => {
    expect(dashboardHtml).toContain('data-sort-i18n="scriptOrder"');
    expect(dashboardHtml).toContain('data-sort-i18n="scriptPerformance"');
    expect(dashboardHtml).toContain('data-i18n-aria-label="selectAllShownScriptsTable"');
    expect(dashboardHtml).toContain('data-i18n="emptyVaultTitle"');
    expect(dashboardHtml).toContain('data-i18n="updatesQueue"');
    expect(dashboardHtml).toContain('data-i18n-aria-label="updateQueueActions"');
    expect(dashboardJs).toContain("tDashboard('emptyVaultTitle'");
    expect(dashboardJs).toContain("'queuedUpdatesSummary'");
    expect(dashboardJs).toContain("button.dataset.sortLabel = label");
  });

  it('translates the settings hero, filters, and dynamic summary copy through the runtime dictionary', () => {
    expect(dashboardHtml).toContain('data-i18n="settingsPreferences"');
    expect(dashboardHtml).toContain('data-i18n-placeholder="settingsSearchPlaceholder"');
    expect(dashboardHtml).toContain('data-i18n-aria-label="settingsCategoryFilters"');
    expect(dashboardHtml).toContain('data-i18n="settingsFilterSecurity"');
    expect(dashboardJs).toContain("'settingsSectionCount'");
    expect(dashboardJs).toContain('getDashboardPluralMessage');
    expect(dashboardJs).toContain("'settingsAdvancedShownCount'");
    expect(dashboardJs).toContain("'settingsShowingFilterMode'");
    expect(dashboardJs).toContain('function getSettingsFilterLabel(filter)');
  });

  it('translates first-run setup guidance through the runtime dictionary', () => {
    expect(dashboardHtml).toContain('data-i18n="skipToMainContent"');
    expect(dashboardHtml).toContain('data-i18n="setupRequiredLabel"');
    expect(dashboardHtml).toContain('data-i18n="setupWarningIntro"');
    expect(dashboardHtml).toContain('data-i18n="setupAllowUserScriptsToggle"');
    expect(dashboardHtml).toContain('data-i18n="setupWarningMiddle"');
    expect(dashboardHtml).toContain('data-i18n="setupDeveloperMode"');
    expect(dashboardHtml).toContain('data-i18n="setupWarningEnd"');
    expect(dashboardHtml).toContain('data-i18n="setupOpenExtensionDetails"');
    expect(dashboardHtml).toContain('data-i18n="setupHowToEnable"');
    expect(dashboardHtml).toContain('data-i18n-title="setupDismissWarning"');
    expect(dashboardHtml).toContain('data-i18n-aria-label="setupDismissWarning"');
  });

  it('translates the Settings General controls and helper titles through the runtime dictionary', () => {
    expect(dashboardHtml).toContain('data-i18n="settingsConfigModeLabel"');
    expect(dashboardHtml).toContain('data-i18n-title="settingsConfigModeHelp"');
    expect(dashboardHtml).toContain('data-i18n="settingsAutoReloadPages"');
    expect(dashboardHtml).toContain('data-i18n-title="settingsAutoReloadHelp"');
    expect(dashboardHtml).toContain('data-i18n="settingsDebugScripts"');
    expect(dashboardHtml).toContain('data-i18n="settingsShowFixedSource"');
    expect(dashboardHtml).toContain('data-i18n="settingsLoggingLevelLabel"');
    expect(dashboardHtml).toContain('data-i18n="loggingWarning"');
    expect(dashboardHtml).toContain('data-i18n="settingsTrashModeLabel"');
    expect(dashboardHtml).toContain('data-i18n="trashModeThirtyDays"');
    expect(dashboardHtml).toContain('data-i18n-title="settingsTrashModeHelp"');
  });

  it('translates appearance, menu, search, update, and externals settings controls', () => {
    expect(dashboardHtml).toContain('data-i18n="settingsLayoutLabel"');
    expect(dashboardHtml).toContain('data-i18n="layoutAutoSystem"');
    expect(dashboardHtml).toContain('data-i18n-title="settingsCustomCssHelp"');
    expect(dashboardHtml).toContain('data-i18n-placeholder="settingsCustomCssPlaceholder"');
    expect(dashboardHtml).toContain('data-i18n="settingsUpdateNotificationLabel"');
    expect(dashboardHtml).toContain('data-i18n="settingsSiteMarkerRichBadge"');
    expect(dashboardHtml).toContain('data-i18n="settingsThemeEditor"');
    expect(dashboardHtml).toContain('data-i18n="settingsEnableTags"');
    expect(dashboardHtml).toContain('data-i18n="settingsActionMenu"');
    expect(dashboardHtml).toContain('data-i18n="settingsUserscriptOrderLabel"');
    expect(dashboardHtml).toContain('data-i18n="settingsBadgeInfoRunning"');
    expect(dashboardHtml).toContain('data-i18n="settingsContextMenu"');
    expect(dashboardHtml).toContain('data-i18n="settingsUserscriptSearch"');
    expect(dashboardHtml).toContain('data-i18n-title="settingsSearchIntegrationHelp"');
    expect(dashboardHtml).toContain('data-i18n="settingsUpdateDisabledScripts"');
    expect(dashboardHtml).toContain('data-i18n="intervalEvery12Hours"');
    expect(dashboardHtml).toContain('data-i18n-title="settingsExternalsHelp"');
    expect(dashboardHtml).toContain('data-i18n="settingsUpdateIntervalLabel"');
  });

  it('translates userscript sync settings, credential fields, and action controls', () => {
    expect(dashboardHtml).toContain('data-i18n="settingsUserscriptSync"');
    expect(dashboardHtml).toContain('data-i18n="settingsEnableUserscriptSync"');
    expect(dashboardHtml).toContain('data-i18n-title="settingsSyncAcrossDevicesHelp"');
    expect(dashboardHtml).toContain('data-i18n="syncProviderS3Compatible"');
    expect(dashboardHtml).toContain('data-i18n="settingsFirefoxSyncWebdavOnly"');
    expect(dashboardHtml).toContain('data-i18n-title="settingsAllowInternalSyncEndpointsHelp"');
    expect(dashboardHtml).toContain('data-i18n-title="settingsSyncCredentialsSessionOnlyHelp"');
    expect(dashboardHtml).toContain('data-i18n-aria-label="settingsSyncEncryptionPassphraseAria"');
    expect(dashboardHtml).toContain('data-i18n-placeholder="settingsS3EndpointPlaceholder"');
    expect(dashboardHtml).toContain('data-i18n-aria-label="settingsS3SecretKeyAria"');
    expect(dashboardHtml).toContain('data-i18n="settingsS3CredentialNote"');
    expect(dashboardHtml).toContain('data-i18n-placeholder="settingsWebdavUrlPlaceholder"');
    expect(dashboardHtml).toContain('data-i18n="settingsSyncTokenStorageDisclosure"');
    expect(dashboardHtml).toContain('data-i18n="syncDownloadPreview"');
    expect(dashboardHtml).toContain('data-i18n="settingsSaveSyncConfiguration"');
  });

  it('translates editor preference controls and helper text', () => {
    expect(dashboardHtml).toContain('data-i18n="settingsEnableEnhancedEditor"');
    expect(dashboardHtml).toContain('data-i18n="settingsEditorThemeLabel"');
    expect(dashboardHtml).toContain('data-i18n="settingsEditorFontSizeLabel"');
    expect(dashboardHtml).toContain('data-i18n="settingsKeyMappingLabel"');
    expect(dashboardHtml).toContain('data-i18n="settingsIndentationWidthLabel"');
    expect(dashboardHtml).toContain('data-i18n="settingsIndentWithLabel"');
    expect(dashboardHtml).toContain('data-i18n="settingsTabModeLabel"');
    expect(dashboardHtml).toContain('data-i18n="settingsHighlightMatchesLabel"');
    expect(dashboardHtml).toContain('data-i18n="settingsAutosaveOnBlur"');
    expect(dashboardHtml).toContain('data-i18n="settingsNoSaveConfirm"');
    expect(dashboardHtml).toContain('data-i18n="settingsTrimTrailingWhitespaceModifiedLines"');
    expect(dashboardHtml).toContain('data-i18n-title="settingsLintOnTypeHelp"');
    expect(dashboardHtml).toContain('data-i18n="settingsLintMaxSizeLabel"');
    expect(dashboardHtml).toContain('data-i18n-title="settingsCustomLinterConfigHelp"');
  });

  it('translates security and runtime host permission settings controls', () => {
    expect(dashboardHtml).toContain('data-i18n="settingsContentScriptApiLabel"');
    expect(dashboardHtml).toContain('data-i18n="contentScriptApiUserScripts"');
    expect(dashboardHtml).toContain('data-i18n="settingsSandboxModeLabel"');
    expect(dashboardHtml).toContain('data-i18n-title="settingsSandboxModeHelp"');
    expect(dashboardHtml).toContain('data-i18n="settingsModifyCspLabel"');
    expect(dashboardHtml).toContain('data-i18n-title="settingsModifyCspHelp"');
    expect(dashboardHtml).toContain('data-i18n="settingsStatsUrlRetentionLabel"');
    expect(dashboardHtml).toContain('data-i18n-title="settingsStatsUrlRetentionHelp"');
    expect(dashboardHtml).toContain('data-i18n="settingsAllowHighPrivilegeApis"');
    expect(dashboardHtml).toContain('data-i18n="settingsAllowCommunicationLabel"');
    expect(dashboardHtml).toContain('data-i18n="settingsSriLabel"');
    expect(dashboardHtml).toContain('data-i18n="settingsCheckConnectLabel"');
    expect(dashboardHtml).toContain('data-i18n="settingsWhitelistedPagesLabel"');
    expect(dashboardHtml).toContain('data-i18n="settingsRuntimeHostPermissions"');
    expect(dashboardHtml).toContain('data-i18n-placeholder="settingsDeniedHostsPlaceholder"');
    expect(dashboardHtml).toContain('data-i18n="grantAll"');
    expect(dashboardHtml).toContain('data-i18n="resetList"');
  });

  it('translates BlackCheck, downloads, experimental, reset, and settings empty state controls', () => {
    expect(dashboardHtml).toContain('data-i18n="settingsBlackCheck"');
    expect(dashboardHtml).toContain('data-i18n="blacklistSourceRemoteManual"');
    expect(dashboardHtml).toContain('data-i18n="manualBlacklistLabel"');
    expect(dashboardHtml).toContain('data-i18n="settingsDownloadsBeta"');
    expect(dashboardHtml).toContain('data-i18n="downloadsPermissionChecking"');
    expect(dashboardHtml).toContain('data-i18n-title="downloadsPermissionHelp"');
    expect(dashboardHtml).toContain('data-i18n="downloadModeLabel"');
    expect(dashboardHtml).toContain('data-i18n-title="downloadWhitelistHelp"');
    expect(dashboardHtml).toContain('data-i18n="settingsStrictModeLabel"');
    expect(dashboardHtml).toContain('data-i18n="settingsTopLevelAwaitLabel"');
    expect(dashboardHtml).toContain('data-i18n="restartScriptVault"');
    expect(dashboardHtml).toContain('data-i18n="factoryReset"');
    expect(dashboardHtml).toContain('data-i18n="settingsNoMatchesTitle"');
    expect(dashboardHtml).toContain('data-i18n="settingsNoMatchesDescription"');
  });

  it('translates utilities export, cloud, and backup schedule controls', () => {
    expect(dashboardHtml).toContain('data-i18n="utilitiesOperations"');
    expect(dashboardHtml).toContain('data-i18n-placeholder="utilitiesSearchPlaceholder"');
    expect(dashboardHtml).toContain('data-i18n-aria-label="utilitiesCategoryFilters"');
    expect(dashboardHtml).toContain('data-i18n="exportIncludeStorageLabel"');
    expect(dashboardHtml).toContain('data-i18n="exportCredentialsRisk"');
    expect(dashboardHtml).toContain('data-i18n="settingsSyncProviderLabel"');
    expect(dashboardHtml).toContain('data-i18n="cloudBackupToCloud"');
    expect(dashboardHtml).toContain('data-i18n="restoreFromFile"');
    expect(dashboardHtml).toContain('data-i18n="downloadZip"');
    expect(dashboardHtml).toContain('data-i18n="vaultJsonDescription"');
    expect(dashboardHtml).toContain('data-i18n="backupScheduleTitle"');
    expect(dashboardHtml).toContain('data-i18n="backupEnableAutomatic"');
    expect(dashboardHtml).toContain('data-i18n="weekdayWednesday"');
    expect(dashboardHtml).toContain('data-i18n="backupIncludeCredentialsHelp"');
    expect(dashboardHtml).toContain('data-i18n="saveBackupSchedule"');
  });

  it('translates utilities backup browser, imports, diagnostics, and support surfaces', () => {
    expect(dashboardHtml).toContain('data-i18n="backupBrowserTitle"');
    expect(dashboardHtml).toContain('data-i18n-placeholder="backupBrowserSearchPlaceholder"');
    expect(dashboardHtml).toContain('data-i18n-aria-label="backupBrowserFilters"');
    expect(dashboardHtml).toContain('data-i18n="backupBrowserSortLargest"');
    expect(dashboardHtml).toContain('data-i18n="scriptStatsTitle"');
    expect(dashboardHtml).toContain('data-i18n="tampermonkeyImportTitle"');
    expect(dashboardHtml).toContain('data-i18n-placeholder="pasteJsonPlaceholder"');
    expect(dashboardHtml).toContain('data-i18n="scriptSubscriptionsTitle"');
    expect(dashboardHtml).toContain('data-i18n="installLocalFileTitle"');
    expect(dashboardHtml).toContain('data-i18n="batchInstallTitle"');
    expect(dashboardHtml).toContain('data-i18n="workspacesTitle"');
    expect(dashboardHtml).toContain('data-i18n="standaloneExportTitle"');
    expect(dashboardHtml).toContain('data-i18n="networkRequestLogTitle"');
    expect(dashboardHtml).toContain('data-i18n="runtimeRepairTitle"');
    expect(dashboardHtml).toContain('data-i18n="supportSnapshotTitle"');
    expect(dashboardHtml).toContain('data-i18n="publicApiTrustTitle"');
    expect(dashboardHtml).toContain('data-i18n="signingTrustTitle"');
    expect(dashboardHtml).toContain('data-i18n="activityLogTitle"');
    expect(dashboardHtml).toContain('data-i18n="utilitiesNoMatchesTitle"');
    expect(dashboardJs).toContain("'utilitiesResultsForQuery'");
    expect(dashboardJs).toContain("'backupBrowserShowingQuery'");
    expect(dashboardJs).toContain("'subscriptionStatusCounts'");
  });

  it('translates trash recovery states', () => {
    expect(dashboardHtml).toContain('data-i18n="trashRecovery"');
    expect(dashboardHtml).toContain('data-i18n="trashHeroTitle"');
    expect(dashboardHtml).toContain('data-i18n-aria-label="trashOverviewAria"');
    expect(dashboardHtml).toContain('data-i18n-placeholder="trashSearchPlaceholder"');
    expect(dashboardHtml).toContain('data-i18n-aria-label="trashTimeFilters"');
    expect(dashboardHtml).toContain('data-i18n="emptyTrash"');
    expect(dashboardHtml).toContain('data-i18n="trashShowingAllStatic"');
    expect(dashboardHtml).toContain('data-i18n="trashEmptyTitle"');
    expect(dashboardJs).toContain("'trashRetentionNextPurge'");
    expect(dashboardJs).toContain("'trashResultsForQuery'");
    expect(dashboardJs).toContain("'confirmDeleteForever'");
    expect(dashboardJs).toContain("'trashUnavailableDescription'");
  });

  it('translates help panel hero, actions, shortcuts, reference, and empty states', () => {
    expect(dashboardHtml).toContain('data-i18n="helpReferenceEyebrow"');
    expect(dashboardHtml).toContain('data-i18n-placeholder="helpSearchPlaceholder"');
    expect(dashboardHtml).toContain('data-i18n-aria-label="helpCategoryFilters"');
    expect(dashboardHtml).toContain('data-i18n="helpQuickActionsTitle"');
    expect(dashboardHtml).toContain('data-i18n="helpActionCommandPaletteDescription"');
    expect(dashboardHtml).toContain('data-i18n="helpOperationalNotesTitle"');
    expect(dashboardHtml).toContain('data-i18n="helpDashboardShortcutsTitle"');
    expect(dashboardHtml).toContain('data-i18n="helpGmApiTitle"');
    expect(dashboardHtml).toContain('data-i18n="helpTrustedTypesTitle"');
    expect(dashboardHtml).toContain('data-i18n-placeholder="helpPatternTesterPlaceholder"');
    expect(dashboardHtml).toContain('data-i18n="helpEditorShortcutsTitle"');
    expect(dashboardHtml).toContain('data-i18n="shortcutFindPrevious"');
    expect(dashboardHtml).toContain('data-i18n="helpAboutDescription"');
    expect(dashboardHtml).toContain('data-i18n="helpNoMatchesTitle"');
    expect(dashboardJs).toContain("'helpLaunchCount'");
    expect(dashboardJs).toContain("'helpResultsForQuery'");
    expect(dashboardJs).toContain("'helpShowingFilter'");
  });

  it('translates editor overlay and find scripts shell controls', () => {
    expect(dashboardHtml).toContain('data-i18n="editorUserscriptEditor"');
    expect(dashboardHtml).toContain('data-i18n-title="editorSaveTitle"');
    expect(dashboardHtml).toContain('data-i18n-aria-label="editorPanelsAria"');
    expect(dashboardHtml).toContain('data-i18n="runOnTab"');
    expect(dashboardHtml).toContain('data-i18n="scriptInfoTitle"');
    expect(dashboardHtml).toContain('data-i18n="scriptStorageTitle"');
    expect(dashboardHtml).toContain('data-i18n="perScriptSettingsTitle"');
    expect(dashboardHtml).toContain('data-i18n="urlOverridesSection"');
    expect(dashboardHtml).toContain('data-i18n-placeholder="scriptNotesPlaceholder"');
    expect(dashboardHtml).toContain('data-i18n="externalResourcesTitle"');
    expect(dashboardHtml).toContain('data-i18n-placeholder="searchCdnLibrariesPlaceholder"');
    expect(dashboardHtml).toContain('data-i18n="findUserscriptsTitle"');
    expect(dashboardHtml).toContain('data-i18n-placeholder="findScriptsPlaceholder"');
    expect(dashboardHtml).toContain('data-i18n="workingEllipsis"');
    expect(dashboardJs).toContain("'editorSyncedUserscript'");
    expect(dashboardJs).toContain("'editorTargetPlural'");
    expect(dashboardJs).toContain("'runOnTabRequiresChrome'");
    expect(dashboardJs).toContain("'runOnTabOpenScript'");
    expect(dashboardJs).toContain("'clearPreview'");
    expect(dashboardJs).toContain("'userCssPreviewOpenDraft'");
    expect(dashboardJs).toContain("'previewingEllipsis'");
  });

  it('translates popup, side panel, install, and DevTools shell controls through the active runtime dictionary', () => {
    for (const html of [popupHtml, sidepanelHtml, installHtml, devtoolsHtml, devtoolsPanelHtml]) {
      expect(html).toContain('modules/i18n.js');
    }
    expect(popupHtml).toContain('data-i18n="popupFindNewScriptsEllipsis"');
    expect(popupHtml).toContain('data-i18n-aria-label="popupScriptActionsAria"');
    expect(popupJs).toContain('function applyPopupI18n()');
    expect(popupJs).toContain('formatPopupI18nFallback');
    expect(popupJs).toContain("'popupInstallUrlCopied'");
    expect(popupJs).toContain("'popupNoActiveTab'");
    expect(popupJs).toContain("'popupUpdatesQueued'");

    expect(sidepanelHtml).toContain('data-i18n="sideOnThisPage"');
    expect(sidepanelHtml).toContain('data-i18n-placeholder="sideSearchScriptsPlaceholder"');
    expect(sidepanelJs).toContain('function applySidepanelI18n()');
    expect(sidepanelJs).toContain("'sideNoMatchingScriptsForQuery'");
    expect(sidepanelJs).toContain("'sideBulkUpdatePartial'");

    expect(installHtml).toContain('data-i18n="installUserscriptTitle"');
    expect(installJs).toContain('function applyInstallI18n()');
    expect(installJs).toContain('formatInstallI18nFallback');
    expect(installJs).toContain("'installDecisionHintDefault'");
    expect(installJs).toContain("'installReviewNavStatus'");
    expect(installJs).toContain("'installSuccessTitleUpdated'");
    expect(installJs).toContain("'installButtonInstall'");

    expect(devtoolsHtml).toContain('data-i18n="devtoolsTitle"');
    expect(devtoolsJs).toContain('I18n.applyToDOM?.(document)');
    expect(devtoolsPanelHtml).toContain('data-i18n="devtoolsNetworkTab"');
    expect(devtoolsPanelHtml).toContain('data-i18n="devtoolsConsoleEmptyTitle"');
    expect(devtoolsPanelJs).toContain('function applyDevtoolsI18n()');
    expect(devtoolsPanelJs).toContain("'devtoolsNetworkSummary'");
    expect(devtoolsPanelJs).toContain("'devtoolsExportedTrace'");
  });
});
