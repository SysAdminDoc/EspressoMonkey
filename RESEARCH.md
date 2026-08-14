# Research — ScriptVault
Date: 2026-08-14 — replaces all prior research.

## Executive Summary

ScriptVault is a local-first, zero-telemetry desktop userscript and UserCSS
manager. It is not a site-specific enhancement: the manifest's broad match
coverage exists so user-installed scripts can run on their declared sites. The
public site relevant to this pass is therefore the Chrome Web Store listing,
while the extension-owned dashboard, popup, side panel, install review, editor,
and DevTools panel are the product surfaces.

The local 3.29.0 candidate is materially ahead of the public Chrome Web Store
listing. On 2026-08-13 the listing still served version 2.3.4, updated
2026-05-04, with 125 users and one 5-star rating. Its copy still says 24+ GM
APIs, CodeMirror, five sync providers including Chrome Sync, and eight
languages; the local product documents 36+ GM APIs, Monaco, six providers, and
nine languages. Publication and listing-copy refresh require maintainer action
and are blocked outside this repository pass.

The highest-value safe work was a complete desktop settings reorganization.
Global settings now have persistent Core, Workspace, Automation, Security, and
Recovery destinations; search spans categories; explicit-save controls say so;
high-risk security controls use progressive disclosure and plain-language
impact copy; recovery actions are separated from normal preferences; and
per-script settings expose a persistent save/reset bar with saved, dirty,
saving, and failure states. That complete redesigned shell is now translated
across the eight partial runtime catalogs, including RTL Hebrew and
locale-aware count forms. The screenshot harness now produces deterministic 1x
1280×800 images, can pin any supported locale for layout review, waits on DOM
state rather than a stale Puppeteer visibility handle, honors reduced motion,
and fails if an extension-owned surface requests an HTTP(S) resource.

The Chrome host-access question is now resolved for this release. A real
Chromium 151 installed-profile matrix compared shipping, a manifest-only
optional-host variant, and a strict optional-host variant. The manifest-only
variant still injected the static `<all_urls>` bridge and retained cross-origin
fetch capability even while `chrome.permissions.contains({ origins })` reported
the explicit host as withheld. The strict variant removed that bridge and did
produce a withheld profile; after real grants it passed userscript registration,
updates, `@require`, `@resource`, `@connect`, DNR, cookies, downloads, revoke,
and universal-script approval. Required `<all_urls>` therefore remains the
explicit compatibility default until the bridge is redesigned and the native
first-grant UX is accepted.

Priority order after this pass:

1. **Next / P2:** turn the six settings parity pairs into a maintained visual
   regression contract at the documented 1280×800 store viewport and a
   secondary 1920×1080 desktop viewport.
2. **Blocked / P1:** publish 3.29.0 and replace stale Chrome Web Store copy and
   screenshots after maintainer review.
3. **Blocked / P2:** redesign the static bridge and manually review Chromium's
   native first-time optional-host prompt before reconsidering a scoped default.
4. **Blocked / P2:** run authenticated provider/browser-store matrices.

## Product and Surface Map

**Core workflows**

- Install `.user.js` and `.user.css` from reviewed URLs, files, imports, or
  discovery sources; inspect permissions, provenance, dependency integrity,
  and risk before activation.
- Create, edit, lint, configure, run, update, disable, restore, and debug scripts
  in the Monaco-backed desktop workbench.
- Register scripts through `chrome.userScripts` or `browser.userScripts`, with
  document-start coverage and metadata-scoped execution behavior.
- Back up or synchronize scripts through local export and user-configured cloud
  providers; no provider is contacted until the user configures and invokes it.
- Recover through version history, trash, backup/restore, safe restart, and an
  explicitly confirmed factory reset.

**Owned desktop surfaces**

| Surface | Route/file | State exercised in this pass |
|---|---|---|
| Dashboard/workbench | `pages/dashboard.html` | scripts, updates, utilities, trash, help, all settings categories, editor, per-script settings, confirmation dialog |
| Popup | `pages/popup.html` | cold dark-state render |
| Side panel | `pages/sidepanel.html` | cold dark-state render with representative desktop URL copy |
| Install review | `pages/install.html` | cold dark-state render |
| DevTools panel | `pages/devtools-panel.html` | cold dark-state render |
| Public listing | Chrome Web Store ScriptVault listing | public desktop listing, 1440×900 viewport, no authentication required |

The extension does not consume Chrome Web Store DOM, routes, embedded data, or
private endpoints. There is therefore no external selector contract to repair.
Within the extension, stable IDs and `data-settings-*` attributes drive settings
filtering, deep links, smoke checks, and screenshots.

## Live Chrome Web Store Snapshot

Observed 2026-08-13 at:
https://chromewebstore.google.com/detail/scriptvault/jlhdbkeijcbgnonpfkfkkkhfmbeejkgh

- Public listing was reachable without an authentication handoff.
- Visible listing facts: version 2.3.4, updated 2026-05-04, 125 users, one
  5-star rating, and a 3.86 MiB package.
- The route is a Google-hosted store application, not an execution target or
  data dependency of ScriptVault. ScriptVault has no code coupled to the
  listing DOM or client router.
- No sponsored card, promoted unit, ad creative, video ad, affiliate widget,
  ad iframe, interstitial, or reserved ad shell was visible on the inspected
  listing state.
- The store application itself made Google-owned measurement/service requests,
  including Google Tag Manager and Play service logging. Those requests are
  initiated by the Chrome Web Store, are not separable by ScriptVault on a
  protected store page, and are not included in the extension's zero-telemetry
  claim.

## Advertising and Network Contract

| Surface/path | Placement or request | Classification | Result/proof |
|---|---|---|---|
| Dashboard, popup, side panel, install, DevTools | No ad slot, sponsored record, affiliate unit, ad SDK, or measurement beacon found | Extension-owned | Visual inspection plus screenshot capture reported zero HTTP(S) requests per surface |
| Dashboard settings and editor navigation | No delayed or interaction-triggered external request | Extension-owned | Cold load and category/editor interaction capture reported zero HTTP(S) requests |
| Chrome Web Store listing | No visible ad placement; Google platform measurement/service traffic present | Store-owned | No product code or permission can suppress protected-store traffic; limitation documented rather than misreported |
| Bundled userscript examples and metadata review | Strings such as advertising/tracking antifeature labels and optional ad-block templates | User content/disclosure, not a ScriptVault placement | Retained because removal would hide risk information or delete user-facing script templates |

`npm run no-telemetry:check` remains the source-level outbound-telemetry gate.
`npm run screenshots` now adds a runtime check for unexpected HTTP(S) requests
from every captured extension-owned page. User-initiated script downloads,
updates, discovery, dependencies, sync, or cloud actions are product functions,
not unsolicited advertising, and are outside the cold-surface assertion.

## Settings Page Matrix and Design Parity

All selected ImageGen references are stored under
`assets/mockups/settings-redesign-2026-08-13/`. Each was generated from the
corresponding current desktop surface and implemented with existing HTML, CSS,
JavaScript, settings keys, and design tokens rather than shipping the bitmap.

| Destination | Material states and controls | Selected mockup | Implemented/verified result |
|---|---|---|---|
| Core | mode, reload, debug, fixed source, logging, trash retention; saved/autosave state | `core.png` | singular category state, readable title/copy, existing defaults preserved |
| Workspace | theme, custom CSS, update notice, site marker, theme editor, tags, action/context menus, editor preferences | `workspace.png` | two-column desktop cards; theme editor disclosed progressively; explicit apply copy |
| Automation | discovery, update cadence, externals, userscript sync and provider policy | `automation.png` | grouped automation surface; sync action named explicitly |
| Security | runtime/sandbox, page/network permissions, integrity, host access, reputation, downloads, experimental controls | `security.png` | anchors, collapsed policy groups, inline risk impact, deep-link expansion |
| Recovery | backup/restore, safe restart, factory reset | `recovery.png` | recovery-only page, safe-data explanation, destructive action isolated and confirmed |
| Per-script settings | update, sync, execution, notifications, configuration, notes, URL overrides | `per-script.png` | sticky action/state header, dirty-state feedback, anchors, two-column cards |

The corresponding runtime screenshots are generated for Core, Workspace,
Automation, Security, Recovery, cross-category search, and per-script
saved/dirty/error states in dark, light, Catppuccin, and OLED. Capture can pin
any supported locale with `--locale=<code>`; an 80-image locale matrix on
2026-08-13 covered all eight partial catalogs at 1280×800 with zero external
requests. Side-by-side comparison at the same 16:10 desktop composition
confirmed the shell, hierarchy, navigation, content grouping, color system,
control geometry, directionality, and persistence states. Functional smoke
coverage verifies category singularity, cross-category search, recovery
routing, security deep-link focus through closed disclosures, per-script dirty
state, and destructive-dialog focus order.

## Platform and Competitive Conclusions

- Chrome's current `userScripts` documentation says the API is MV3-only and
  available from Chrome 120. Chrome versions before 138 rely on Developer Mode;
  Chrome 138+ exposes a per-extension "Allow User Scripts" toggle. Capability
  checks remain more reliable than milestone-only branching.
- Chrome recommends required permissions only for core behavior and optional
  permissions/hosts for optional features, requested with a user gesture and a
  clear explanation. ScriptVault's installed-profile matrix now supplies the
  missing runtime evidence: the static all-site content bridge defeats a
  manifest-only scoped conversion, while deleting it removes compatibility
  behavior. Required `<all_urls>` remains the reviewed default for 3.29.0.
- Tampermonkey's explicit Save requirement for sync configuration reinforces
  the new honest persistence labels. Its per-script settings and URL overrides
  validate keeping script policy adjacent to the editor rather than burying it
  in global settings.
- Violentmonkey documents third-party sync because browser sync storage is too
  small and browser-specific, and recommends export before testing builds.
  ScriptVault should keep provider-neutral backup/recovery prominent instead of
  reintroducing Chrome Sync as a source-code provider.
- The differentiator remains local-first review and recovery, not feature count:
  explain permission impact, surface save state, keep destructive recovery
  deliberate, and preserve zero unsolicited network traffic on owned pages.

## Rejected or Deferred Directions

- **Universal ad blocker:** `<all_urls>` is a userscript execution requirement,
  not permission to turn the manager into an unrelated content blocker. No
  owned ad path exists to justify DNR rules, and protected Chrome Web Store
  traffic is outside extension reach.
- **Mobile redesign:** the product and this pass target desktop browsers only.
- **Remote AI authoring:** sending script source or page content to a hosted
  model conflicts with the local-first privacy position; optional on-device
  assistance remains separate.
- **Chrome Sync source provider:** quota and browser-specific behavior are a
  poor fit for executable source, history, and encrypted bundles.
- **Credentialed background publishing:** reviewed catalog APIs do not justify
  storing account credentials; keep user-session handoffs until an official,
  reviewable write API exists.

## Current Sources

Accessed 2026-08-14:

- Chrome Web Store listing:
  https://chromewebstore.google.com/detail/scriptvault/jlhdbkeijcbgnonpfkfkkkhfmbeejkgh
- Chrome `userScripts` API:
  https://developer.chrome.com/docs/extensions/reference/api/userScripts
- Chrome permissions API:
  https://developer.chrome.com/docs/extensions/reference/api/permissions
- Chrome permission declaration guidance:
  https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- Chrome cross-origin network requests:
  https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
- Chrome match patterns:
  https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns
- Chromium extension permission internals:
  https://chromium.googlesource.com/chromium/src/+/HEAD/extensions/docs/permissions.md
- Tampermonkey documentation:
  https://www.tampermonkey.net/documentation.php?locale=en&q=content_script_api
- Tampermonkey FAQ:
  https://www.tampermonkey.net/faq.php
- Violentmonkey documentation and FAQ:
  https://violentmonkey.github.io/
  https://violentmonkey.github.io/faq/

## Open Questions

- Should the six manually reviewed ImageGen/runtime pairs become blocking pixel
  baselines, or stay review artifacts to avoid churn from browser font/rendering
  differences?
- Which public-store claims should lead the 3.29.0 listing refresh: permission
  clarity, recovery/trust, or authoring depth? Publication remains a maintainer
  decision.
