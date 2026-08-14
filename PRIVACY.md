# ScriptVault Privacy Policy

**Last Updated: August 14, 2026**

## Overview

ScriptVault is a userscript manager browser extension that allows users to install and run custom JavaScript scripts on websites. This privacy policy explains what data the extension accesses, how it's used, and your rights regarding that data.

## Data Collection

### What We DO NOT Collect

- **No personal information**: We do not collect names, emails, or any identifying information
- **No analytics or tracking**: We do not use Google Analytics, telemetry, or any tracking services
- **No server-side storage**: We do not operate servers that store your data
- **No developer browsing-history collection**: ScriptVault does not send browsing activity to a developer-operated service. Local per-script execution stats retain at most the page origin by default; you can choose full URL or no URL in Settings.
- **No data sales**: We never sell, rent, or share any user data with third parties

### What IS Stored Locally

Data is stored **locally on your device** using browser storage APIs:

| Data Type | Purpose | Storage Location |
|-----------|---------|------------------|
| Userscripts and execution stats | Installed code, metadata, and optional last-run URL (origin by default) | IndexedDB `scripts` store; a dedicated Storage Bucket when supported |
| Script values | Per-script `GM_setValue` data | IndexedDB `values` store; a dedicated Storage Bucket when supported |
| Backups and publication receipts | Local backup blobs and Greasy Fork handoff receipts | IndexedDB `backups`/`publicationReceipts`; a dedicated Storage Bucket when supported |
| Workspace bindings | User-approved local file handles and refresh metadata | IndexedDB `localWorkspaceBindings` |
| Extension settings and credentials | Preferences, provider configuration, and persistent credentials when selected | `chrome.storage.local` |
| Session-only credentials | Provider tokens, passwords, endpoint metadata, and encryption passphrase when session-only mode is selected | `chrome.storage.session`, cleared on browser restart |
| Cached dependencies | `@require` and `@resource` payloads required by installed scripts | Browser cache and extension local storage |

The canonical IndexedDB `scriptvault` schema v3 contains the `scripts`,
`values`, `stats`, `backups`, `localWorkspaceBindings`, and
`publicationReceipts` object stores. Supported Chromium builds partition those
stores across dedicated Storage Buckets; other builds use the same stores in
the default IndexedDB factory.

Local scripts, values, settings, or backups leave the device only through an export, sync/backup destination, discovery/publishing action, or installed-script network behavior described below.

Lowering execution URL retention from Full URL to Origin only or Do not store rewrites every persisted `stats.lastUrl` in one IndexedDB transaction. Removed path/query/fragment data is not recoverable through ScriptVault, and Do not store removes the property entirely.

## Network Requests

ScriptVault makes network requests only when necessary for its core functionality:

### 1. Userscript Installation
When you choose to install a userscript, the extension fetches the script from the source you specified (e.g., Greasy Fork, OpenUserJS, GitHub).

### 2. @require Dependencies
If a userscript includes `@require` directives, the extension fetches those JavaScript libraries from the specified URLs (commonly CDNs like cdnjs.cloudflare.com, cdn.jsdelivr.net, or code.jquery.com).

### 3. Update Checks (Optional)
If you enable automatic updates, the extension periodically checks the original source URLs for newer versions of your installed scripts.

### 4. @resource Files
If a userscript includes `@resource` directives, the extension fetches those resources from the specified URLs.

### 5. Sync and Backup Destinations
When explicitly configured, ScriptVault can transfer scripts, values, settings, and backups to WebDAV, a user-selected local folder, Google Drive / Easy Cloud, Dropbox, OneDrive, or an S3-compatible endpoint. Sync encryption is optional; when enabled, payloads are encrypted locally before upload. Credentials are excluded from normal backups by default and may be kept in session-only storage.

### 6. Discovery and Publishing
Find Scripts queries the Greasy Fork API or OpenUserJS API, and optional external search opens GitHub search. Greasy Fork publishing is a user-initiated browser handoff; GitHub Gist sharing uses `api.github.com` only after the user supplies a token and requests the operation. Library discovery can query cdnjs.

### 7. Installed-Script Network Egress
Installed userscripts can send page-derived or script-derived data to destinations allowed by their metadata and your permissions through `GM_xmlhttpRequest`, `GM.fetch`, `GM_webRequest`, WebSocket, `sendBeacon`, downloads, forms, or ordinary page APIs. ScriptVault enforces `@connect` and internal-host guards on its privileged network APIs, but it cannot determine the intent of code you choose to install. Review script code, grants, match patterns, and network destinations before enabling it.

Network requests are initiated by user actions, configured automation, or installed-script behavior; ScriptVault has no developer-operated analytics or telemetry endpoint.

## Remote Code Execution

As a userscript manager, ScriptVault executes JavaScript code from external sources. This is the core purpose of the extension. Important notes:

- **User-initiated**: Scripts only run if you explicitly install them
- **User-controlled**: You can disable, edit, or delete any script at any time
- **Pattern-matched**: Scripts only run on websites matching their declared @match/@include patterns
- **Sandboxed**: Scripts run in Chrome's USER_SCRIPT world with controlled API access

## Permissions Explained

### Permissions inventory

| Surface | Token | Why it's needed |
|---------|-------|-----------------|
| permission | `storage` | Save installed scripts, local values, folders, backups, and settings on your device. |
| permission | `tabs` | Read the active tab URL/title for matching and support user-triggered `GM_openInTab`. |
| permission | `notifications` | Show update status, script notifications, sync results, and install results. |
| permission | `contextMenus` | Add context-menu actions so you can run scripts or open ScriptVault tools from a page. |
| permission | `menus` | Firefox context-menu equivalent for run scripts and ScriptVault tools. |
| permission | `scripting` | Inject the content bridge and script injection support for installed userscripts. |
| permission | `userScripts` | Register installed userscripts in the browser `USER_SCRIPT world`. |
| permission | `webNavigation` | Observe frame navigation and document lifecycle events so scripts run at the right time. |
| permission | `unlimitedStorage` | Store larger script libraries, cached dependencies, backup history, and import/export data. |
| permission | `alarms` | Schedule update checks, scheduled sync, periodic backups, and local maintenance. |
| optional_permission | `downloads` | Support `GM_download`, script export, backup export, and report export. Requested at runtime when a script declares `@grant GM_download`. |
| permission | `declarativeNetRequest` | Apply per-script network rules and local webRequest metadata declared by userscript metadata. |
| permission | `declarativeNetRequestWithHostAccess` | Apply host-backed DNR rules only on matching sites where a user-enabled script may operate. |
| permission | `publicSuffix` | Firefox 153+ only. Look up the browser's built-in public suffix list locally so the domain badge shows the right label for multi-level TLDs (`example.co.uk`, not `co`). Reads no page content, sends no network request, and grants no site access. |
| permission | `sidePanel` | Show ScriptVault's browser side panel for quick script management. |
| permission | `offscreen` | Use an offscreen document for background export and UI-adjacent tasks that cannot run inside the service worker. |
| optional_permission | `clipboardWrite` | optional clipboard write access for user-triggered copy/export actions and script APIs. |
| optional_permission | `clipboardRead` | optional clipboard read access for user-triggered paste/import actions and script APIs. |
| optional_permission | `identity` | Optional Chrome OAuth support for cloud sync providers when you sign in. |
| optional_permission | `cookies` | optional cookie access for user-requested scripts that need site cookies. |
| optional_permission | `userScripts` | Firefox optional grant for the `USER_SCRIPT world`. |
| host_permission | `<all_urls>` | Host permission is required because userscripts can run on user-chosen sites across the web; each script is still limited by metadata and your controls. |
| content_script_match | `<all_urls>` | Content script match lets ScriptVault detect `.user.js install` pages and connect the content bridge on sites where scripts may run. |
| sandbox_page | `pages/editor-sandbox.html` | The sandboxed editor hosts Monaco so editing tools stay isolated from extension pages. |
| data_collection_required | `none` | Required data collection is none: ScriptVault does not require telemetry, accounts, analytics, or developer-operated storage. |
| data_collection_optional | `authenticationInfo` | Authentication info such as OAuth tokens is used only when you configure a cloud sync provider. |
| data_collection_optional | `technicalAndInteraction` | Technical and interaction data such as settings, support exports, and error diagnostics stays local unless you choose to export or sync it. |
| data_collection_optional | `websiteActivity` | Website activity is used locally to match installed scripts to selected pages and may leave your device only through scripts or sync/export actions you configure. |
| data_collection_optional | `websiteContent` | Website content can be accessed by installed scripts and `GM_xmlhttpRequest`/resource flows, then sent only to URLs selected by you or by installed script metadata. |

The optional **Require approval for all-site scripts** setting is a ScriptVault
registration guard. It does not revoke the required `<all_urls>` manifest host
permission or reduce the extension's installed browser access.

The reviewer-facing store copy for the same inventory is maintained in `docs/store-listing-copy.md` and checked by `npm run store-copy:check`.

## Data Sharing

ScriptVault does not sell data or send it to the developer. Data can reach third parties only through destinations you configure or code you install: local exports, source/resource/update hosts, sync and backup providers, discovery/publishing services, support artifacts you choose to share, and userscript-controlled network requests.

When sync encryption is enabled, ScriptVault encrypts sync payloads locally
before upload and decrypts them locally after download. The sync encryption
passphrase is resolved from persistent or session-only extension settings and is
treated as a credential for normal exports and backups.

## Limited Use

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements. ScriptVault uses Google API information only to provide user-configured extension functionality such as cloud sync, does not sell or transfer that information for advertising, and does not allow human access except where legally required or explicitly authorized by you for support.

## Your Rights and Control

You have complete control over your data:

- **View**: See all stored data in the extension dashboard
- **Edit**: Modify any userscript or setting
- **Delete**: Remove individual scripts or all data
- **Export**: Download your scripts as backup files
- **Disable**: Turn off any script without deleting it

To delete all extension data:
1. Go to `chrome://extensions`
2. Find ScriptVault
3. Click "Remove" to uninstall (deletes all local data)

Or use the extension's "Clear All Data" option in settings.

## Children's Privacy

ScriptVault does not knowingly collect any information from children under 13. The extension does not collect personal information from any users.

## Changes to This Policy

If we update this privacy policy, we will:
1. Update the "Last Updated" date at the top
2. Note significant changes in the extension's changelog

## Open Source

ScriptVault is open source. You can review the complete source code to verify these privacy claims:
- GitHub: [SysAdminDoc/ScriptVault](https://github.com/SysAdminDoc/ScriptVault)

## Contact

If you have questions about this privacy policy:
- GitHub Issues: [ScriptVault Issues](https://github.com/SysAdminDoc/ScriptVault/issues)

---

## Summary

**ScriptVault is a local-first userscript manager.** The developer does not collect, track, or sell your data. Data leaves the device only through destinations you configure or behavior in userscripts you install.
