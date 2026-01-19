# EspressoMonkey Privacy Policy

**Last Updated: January 19, 2026**

## Overview

EspressoMonkey is a userscript manager browser extension that allows users to install and run custom JavaScript scripts on websites. This privacy policy explains what data the extension accesses, how it's used, and your rights regarding that data.

## Data Collection

### What We DO NOT Collect

- **No personal information**: We do not collect names, emails, or any identifying information
- **No analytics or tracking**: We do not use Google Analytics, telemetry, or any tracking services
- **No server-side storage**: We do not operate servers that store your data
- **No browsing history**: We do not record or transmit your browsing activity
- **No data sales**: We never sell, rent, or share any user data with third parties

### What IS Stored Locally

All data is stored **locally on your device** using Chrome's built-in storage APIs:

| Data Type | Purpose | Storage Location |
|-----------|---------|------------------|
| Userscripts | Scripts you install for execution on websites | Local Chrome storage |
| Script settings | Per-script configuration (GM_setValue data) | Local Chrome storage |
| Extension settings | Your preferences (theme, update intervals, etc.) | Local Chrome storage |
| Cached @require files | JavaScript libraries required by your scripts | Local Chrome storage |

**This data never leaves your device** unless you explicitly use the export feature.

## Network Requests

EspressoMonkey makes network requests only when necessary for its core functionality:

### 1. Userscript Installation
When you choose to install a userscript, the extension fetches the script from the source you specified (e.g., Greasy Fork, OpenUserJS, GitHub).

### 2. @require Dependencies
If a userscript includes `@require` directives, the extension fetches those JavaScript libraries from the specified URLs (commonly CDNs like cdnjs.cloudflare.com, cdn.jsdelivr.net, or code.jquery.com).

### 3. Update Checks (Optional)
If you enable automatic updates, the extension periodically checks the original source URLs for newer versions of your installed scripts.

### 4. @resource Files
If a userscript includes `@resource` directives, the extension fetches those resources from the specified URLs.

**All network requests are initiated by user action** (installing a script) or user-configured settings (enabling auto-updates).

## Remote Code Execution

As a userscript manager, EspressoMonkey executes JavaScript code from external sources. This is the core purpose of the extension. Important notes:

- **User-initiated**: Scripts only run if you explicitly install them
- **User-controlled**: You can disable, edit, or delete any script at any time
- **Pattern-matched**: Scripts only run on websites matching their declared @match/@include patterns
- **Sandboxed**: Scripts run in Chrome's USER_SCRIPT world with controlled API access

## Permissions Explained

| Permission | Why It's Needed |
|------------|-----------------|
| `storage` | Save your userscripts and settings locally |
| `unlimitedStorage` | Store multiple scripts and cached dependencies |
| `userScripts` | Register and execute userscripts on web pages |
| `scripting` | Inject the content script bridge for API communication |
| `tabs` | Match scripts to URLs, support GM_openInTab |
| `webNavigation` | Inject scripts at correct document lifecycle stages |
| `alarms` | Schedule update checks and sync operations |
| `downloads` | Support GM_download API for userscripts |
| `<all_urls>` | Allow userscripts to run on any site you choose |

## Data Sharing

We do not share any data with third parties. Period.

The only way your data leaves your device is:
1. When you manually export scripts (creates a local file)
2. When network requests are made to fetch scripts/resources you requested

## Your Rights and Control

You have complete control over your data:

- **View**: See all stored data in the extension dashboard
- **Edit**: Modify any userscript or setting
- **Delete**: Remove individual scripts or all data
- **Export**: Download your scripts as backup files
- **Disable**: Turn off any script without deleting it

To delete all extension data:
1. Go to `chrome://extensions`
2. Find EspressoMonkey
3. Click "Remove" to uninstall (deletes all local data)

Or use the extension's "Clear All Data" option in settings.

## Children's Privacy

EspressoMonkey does not knowingly collect any information from children under 13. The extension does not collect personal information from any users.

## Changes to This Policy

If we update this privacy policy, we will:
1. Update the "Last Updated" date at the top
2. Note significant changes in the extension's changelog

## Open Source

EspressoMonkey is open source. You can review the complete source code to verify these privacy claims:
- GitHub: [Your GitHub Repository URL]

## Contact

If you have questions about this privacy policy:
- GitHub Issues: [Your GitHub Issues URL]
- Email: [Your contact email - optional]

---

## Summary

**EspressoMonkey is a privacy-respecting userscript manager.** We don't collect your data, we don't track you, and we don't sell anything. All your data stays on your device under your control.
