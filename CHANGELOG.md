# Changelog

All notable changes to ScriptVault will be documented in this file.

## [v3.30.1] — One coherent desktop workbench (2026-08-14)

- Bumped every authoritative and visible version surface to 3.30.1 so a
  manually reloaded unpacked installation is immediately distinguishable.
- Removed the populated Scripts table's false header spacer, constrained long
  or malformed titles to their column, and reflowed narrow inspector actions.
- Replaced the Windows-native Status, Sites, and Saved views popups with one
  dark/light themed, keyboard-accessible listbox treatment while retaining the
  underlying select state for compatibility and automation.
- Reimagined and implemented all six primary dashboard destinations—Scripts,
  Updates, Settings, Utilities, Trash, and Help—from a coherent set of
  ImageGen desktop references while preserving the existing controls, routes,
  settings keys, persistence behavior, and local-first product semantics.
- Unified the product shell around a 216 px navigation rail, compact command
  header, restrained graphite/emerald surfaces, consistent hairlines and
  radii, and desktop-first information density across 1280×800 and 1920×1080.
- Clarified empty-library and current-update states, added visible explanatory
  copy to core settings toggles, surfaced script size in Trash, and made the
  local-only default explicit in the persistent rail footer.
- Reworked Utilities into scannable backup, cloud-sync, restore/import, and
  schedule regions; reorganized Help into quick actions, shortcuts, usage
  notes, and API-reference columns without inventing unsupported operations.
- Extended deterministic screenshot capture with explicit desktop viewport
  and output-suffix arguments, a script-library readiness wait, and removal of
  incidental focus before capture. The harness still fails on unsolicited
  external HTTP(S) requests.
- Added same-viewport mockup/runtime comparison artifacts and refreshed the
  dark, light, Catppuccin, and OLED browser visual-regression baselines for the
  new shell.

### Included from the unreleased v3.29.0 candidate — Settings clarity, recovery, and deterministic evidence (2026-08-14)

- Reorganized the complete desktop settings surface into persistent Core,
  Workspace, Automation, Security, and Recovery destinations while keeping
  search global and preserving every existing key, default, and handler.
- Made settings persistence honest: most controls report autosave state,
  explicit actions are named Apply/Save, and per-script settings keep Save,
  Reset, and Saved/Unsaved/Saving/Failure feedback visible in the editor header.
- Translated the redesigned settings shell across German, Spanish, French,
  Hebrew, Japanese, Portuguese, Russian, and Chinese; raised every locale
  coverage ratchet and added locale-aware screenshot capture for visual QA.
  Settings categories now use stable markup-backed group IDs, so translated
  section labels cannot collapse Workspace, Automation, Security, or Recovery
  content into Core.
- Grouped security policy by runtime, page/network access, and integrity; added
  plain-language risk impact; and made disclosure-aware deep links expand and
  focus the requested control for keyboard users.
- Added a recovery-only workflow that routes to the existing backup/restore
  surface, distinguishes a data-preserving restart from factory reset, and
  isolates the destructive action behind a named confirmation dialog.
- Added six ImageGen-led desktop settings references and browser-checked the
  corresponding Core, Workspace, Automation, Security, Recovery, and per-script
  views at the documented 1280×800 store composition.
- Repaired screenshot capture races around the asynchronous What's New modal,
  editor overlay visibility, renderer-owned timers, device-pixel ratio, and
  frozen category transitions; targeted `--only` captures and settings states
  now make visual iteration reproducible. Category, cross-category search, and
  per-script saved/dirty/error captures cover dark, light, Catppuccin, and OLED.
- Repaired the editor smoke to wait on Monaco's semantic marker state, force a
  real paint before checking warning decorations, report page errors on failure,
  and treat Run as optional only when capability policy actually hides it.
- Added a runtime zero-external-request assertion to captured extension-owned
  pages, so the dashboard, popup, side panel, install review, and DevTools
  surfaces fail evidence generation if they request unsolicited HTTP(S)
  resources.
- Reconciled the Firefox lint ceiling with the complete web-ext 10.6.0
  inventory: 59 reviewed compatibility/security warnings, with any new code,
  file, or count increase still failing the release gate.
- Refreshed product research and actionable/blocked roadmaps against the public
  Chrome Web Store listing, current Chrome userScripts/permission guidance, and
  current Tampermonkey and Violentmonkey settings/recovery patterns.
- Added a fail-closed Chromium installed-profile host-permission matrix covering
  fresh/withheld access, persisted grants and revoke, narrow and universal
  userscript registration, update URLs, `@require`/`@resource`, `@connect`, DNR,
  cookies, and downloads. The evidence keeps required `<all_urls>` as the
  compatibility default because the static all-site content bridge makes a
  manifest-only optional-host conversion misleading.
- Fixed real `@webRequest` registration in the generated runtime by keeping its
  high-privilege policy helper in the raw core's scope, and cleared stale
  registration errors after a later registration succeeds.
- Corrected the Security setting and install-review copy so the opt-in control
  is described as an all-site script registration guard, not as a way to revoke
  the extension's required browser host access; removed stale web-accessible
  install-page claims from privacy/store inventory and made that drift fail the
  local and release gates.

## [v3.28.0] — Capability-aware runtime, safer migration & release trust (2026-08-11)

- Replaced remaining Chromium milestone capability gates with feature probes for
  userscript setup, per-script worlds, in-place registration updates, and
  one-shot execution; the generated browser support matrix now records the
  upcoming two-week Chrome cadence and explicit M130 support floor.
- Added a blocking `npm audit signatures --min-release-age=0` release-trust
  check and refreshed the developer pin to Node 24.18.1/npm 11.16.0 while
  retaining the AMO-compatible engine floor. The two currently unfixable
  `image-size` parser advisories are documented as a temporary audit exception
  reachable only through Firefox lint tooling.
- Imported competitor per-script state for enabled/disabled status, run-at and
  injection overrides, custom URL patterns, declared `@var`/GM_config values,
  and stored values, with bounded unmapped-setting diagnostics and quarantine
  preserved across VM/GM/ZIP restore paths.
- Added editor and dashboard warnings for unrecognized userscript metadata
  keys, localized-key normalization, nearest-key suggestions, and explicit
  `@scriptvault-ignore` suppression for intentional custom directives.
- Made locale coverage reports use the complete English runtime key set with
  explicit percentages and ratchets, and display localized `@name`/
  `@description` metadata in dashboard and popup script lists.
- Added grant-gated `GM.withLock` and `GM_withLock` userscript APIs backed by
  Web Locks, with per-script cross-tab namespacing, abort-signal forwarding,
  generated TypeScript declarations, and editor grant completion.
- Added a headless real-navigation install gate covering valid review/install,
  malformed pass-through, oversized download rejection, and downgrade review.
- Shipped the GM WebSocket userscript client and added a source-mirror drift
  gate; WebSocket behavior now tests the generated background wrapper rather
  than only the unshipped TypeScript mirror.
- Enabled bidirectional GM value sync with per-key HLC last-write-wins,
  bounded TTL conflict retention, passive dashboard conflict counts, and
  per-device `hlc`/local/remote resolution policy across CloudSync and
  EasyCloud.
- Added a hash-pinned, local-only real-world userscript compatibility corpus
  with Greasemonkey storage, Better xCloud, and Vite Plugin Monkey Worker
  fixtures; the headless gate records GM calls and fails closed on execution
  or Worker regressions without contacting target sites.
- Added reviewable local folder projects for `.user.js` and `.user.css` files,
  with stable path-to-script mapping, restart reconnection, bounded scan/watch
  updates, explicit add/rename/delete/change/conflict decisions, and redacted
  project metadata outside local storage.
- Added a deterministic, bounded trust-boundary fuzz corpus for metadata,
  JSON/ZIP imports, public API/MCP and page bridge messages, and network
  errors/timeouts; failures report their boundary and seed.
- Scoped Firefox UserCSS injection state and `scripting` targets to each
  document identity, with a focused headless smoke for initial, SPA, and reload
  documents; host match patterns now accept development-server ports.
- Refreshed Playwright, chrome-types, jsdom, and puppeteer-core dev
  tooling; E2E retries now run in isolated workers and the workbench smoke uses
  Playwright's WebStorage API for view-state persistence.
- Persisted a bounded, redacted execution journal across service-worker
  restarts, surfaced latest age/stale outcomes in diagnostics surfaces, and
  sanitized journal trace exports.
- Awaited and serialized dashboard view transitions before applying workbench
  filters and deep-link focus, with bounded abort recovery for headless and
  backgrounded renderers.
- Persisted bounded dashboard telemetry until the lazy heatmap and gamification
  modules initialize, then replayed it once without duplicate activity.
- Made ActivityHeatmap normalize malformed records per day and retain valid
  history with a bounded diagnostic marker.
- Added rolling retention, per-day script/name limits, and a UTF-8 storage byte
  budget to ActivityHeatmap.
- Serialized ActivityHeatmap writes, retained in-memory increments after quota
  failures, and added a non-blocking retry status to the dashboard.
- Indexed dependency-graph relationship candidates by shared metadata keys,
  preserving exact edge details while avoiding unrelated script-pair scans.
- Deferred force-directed layouts above 1,200 scripts and replaced them with an
  exact relationship-count summary so large libraries keep the dashboard
  responsive.
- Added a keyboard-accessible dependency-graph script list with per-node
  relationship summaries, editor actions, focusable canvas controls, and
  synchronized visual selection.
- Bounded the editor smoke harness to 90 seconds, standardized its wait
  diagnostics, and reports the active stage/URL while cleaning up timed-out
  browser profiles.
- Added an isolated Chromium extension-update E2E gate that verifies enabled,
  disabled, stale, and failed user-script registrations plus local health
  evidence; Firefox coverage is explicitly capability-gated.
- Serialized subscription feed, bundle, removal, and refresh-result writes
  through a fresh-read queue so concurrent dashboard and alarm mutations keep
  unrelated records and validator/error state intact.
- Serialized pending-update, subscription, and clear mutations through a
  fresh-read promise chain so overlapping manual, alarm, and review actions
  cannot drop queued entries or resurrect cleared updates.
- Added a document-start ordering proof that races userscripts against page
  inline scripts in Chromium and Firefox sideload smoke coverage, including a
  service-worker restart in the Chromium E2E.
- Made script reordering a single IndexedDB position transaction with
  permutation validation and rollback-safe cache publication.
- Replaced Public API audit payloads with allowlisted metadata, UTF-8 byte and
  count budgets, deterministic oldest-first eviction, and URL/token/body
  redaction with hashes and bounded error codes.
- Serialized all trash read-modify-write paths, including local delete,
  restore, permanent-delete, empty/prune, and sync tombstone writes.
- Bounded Trash retention to 100 entries and 6 MiB of UTF-8 serialized data,
  evicting the oldest recovery records deterministically and surfacing the
  unavailable items in the dashboard.
- Added an atomic IndexedDB collision check to Trash restore, with a
  current-versus-trashed comparison and explicit replacement confirmation.
- Routed Public API list, status, presence, and install positioning through
  the authoritative IndexedDB-backed ScriptStorage instead of the retired
  `userscripts` storage blob.
- Made DevTools HAR and trace exports privacy-safe by removing URL credentials,
  query/hash data, sensitive headers, and raw document URLs/errors while
  preserving diagnostic status, timing, and origin context.
- Routed external API, Local MCP, and trusted web installs through the core
  serialized save/toggle pipeline so version history, trust receipts, review
  quarantine, and runtime registration stay consistent across callers.
- Enforced the public 5 MiB script limit using serialized UTF-8 bytes at
  external API and Local MCP boundaries.
- Rejected unsafe public-install and webhook redirect hops before contacting
  internal or non-HTTPS targets, while preserving safe public redirects.
- Routed privileged XHR, WebSocket, download, and audio events through an
  authenticated user-script port, with an identifier-free page bridge fallback.
- Delivered GM value-change payloads over the authenticated user-script port,
  preserving raw values for listener callbacks and keeping the page bridge
  value-redacted.
- Reduced the Monaco ESM surface to the editor plus JavaScript/TypeScript/CSS
  contributions, dropped the unused HTML/JSON workers, and opened UserCSS
  drafts in a CSS model with live language switching.
- Added a headless service-worker cold-start gate covering empty and seeded
  1,000-script profiles, with p50/p99 JSON reports and release-preflight
  enforcement.
- Added a compact per-source health rail to Find Scripts, distinguishing a
  healthy empty catalog from browser challenges, HTTP refusals, and unreachable
  hosts with actionable classifier messages.
- Added a compact first-run setup tab that probes live `userScripts` access,
  deep-links to the browser's extension details when setup is required, and
  stays closed on extension updates.
- Reimagined every dashboard destination with a compact six-route workbench,
  dense update/trash tables, focused settings/utilities grids, restrained
  empty states, and matching dark/light/Catppuccin/OLED visual baselines.
- Remapped Monaco's pre-vendored DOMPurify import to the audited project
  dependency and added a built-artifact version-floor gate, so vulnerable
  sanitizer bytes cannot hide behind a clean lockfile audit.
- Required enterprise-managed scripts to carry a verifiable integrity pin or
  trusted Ed25519 signature before installation, with aggregate verification
  outcomes in the local health report.
- Added the `build-for-amo` source-review command, aligned the declared engine
  floor with the AMO reviewer baseline, and kept the secure developer pin
  separate from reviewer compatibility.
- Registered enabled UserCSS at `document_start` with persisted dynamic CSS
  content scripts, while retaining the immediate `insertCSS` fallback for
  already-open tabs and browsers without registration support.
- Added byte-level provenance rows for every shipped CodeMirror, Monaco,
  DOMPurify, Acorn, diff, and fflate asset, and marked those artifact-backed
  components in the CycloneDX SBOM.
- Routed userscript updates that change the declared `@author` or `@namespace`
  to manual review with a compact old-to-new identity reason.
- Expanded the accessibility sweep to forced-colors, 320px reflow, and WCAG
  text-spacing overrides, with stylesheet-driven coverage and compact workbench
  fallbacks for high-contrast borders, selected rows, and icon controls; the
  light install surface now keeps muted copy above the normal-text contrast floor.
- Enforced Trusted Types on Chrome and Firefox extension pages, migrated the
  final template entity decoder off a raw HTML sink, and surfaced blocked
  extension renders in the dashboard activity log.
- Made popup run diagnostics explain the exact matching or exclusion rule,
  global page-filter layer, frame policy, quarantine marker, and localized
  execution status for every installed script.
- Extended UserCSS injection into open shadow roots with a bounded,
  mutation-observed style registry that follows later roots and cleans up on
  route changes, edits, disable, and deletion.
- Added HTTPS-only `==UserSubscribe==` bundle reviews with per-member metadata,
  risk summaries, scope-limited `@connect`, and explicit uninstall proposals
  when a bundle removes a member.
- Added a bounded local-file metadata polling fallback with explicit watcher
  health when FileSystemObserver is unavailable or reports an unknown/error
  state; only the active editor polls and changes still go through review.
- Added a locale surface ratchet that inventories dashboard, popup, and side
  panel keys and runs deterministic pseudo-locale/RTL checks across editor
  labels, accessible names, overflow, and control order.
- Made the browser-support matrix and release-preflight documentation derive
  their version/date from the current manifest and release inputs, with the
  README gate rejecting stale matrix or artifact references.
- Corrected pending-update eviction to measure serialized UTF-8 bytes and bound
  service-worker/storage write cost independently of the userscript count cap.
- Raised the light-theme accessibility skip-link foreground to the existing
  primary-text token so its focused state clears the 4.5:1 normal-text target.
- Hardened backup restore and storage hydration so malformed folder/workspace
  payloads are rejected before mutation and stale caches fall back safely.
- Hardened JSON and ZIP settings intake with a schema-derived key/type allowlist;
  unknown, malformed, credential, and security-posture keys are reported and
  kept out of SettingsManager unless credentials are explicitly opted in.
- Recomputed SHA-256 digests for local-library snapshots at JSON import time so
  code carrying a false provenance hash is dropped before it can be wrapped.
- Restricted @require CDN fallbacks to recognized upstream paths and parsed
  jQuery major versions, so plugin-like URLs cannot silently receive jQuery
  core bytes.
- Refused unpinned plaintext HTTP @require and GM_loadScript execution while
  preserving review probes; pinned HTTP loads verify their declared digest.
- Preserved XMLHttpRequest's standard static ready-state constants on the
  network-auditing wrapper (`DONE`, `OPENED`, and peers).
- Protected the userscript GM-value cache from an in-flight refresh overwriting
  local `GM_setValue`/`GM_deleteValue` mutations.
- Namespaced userscript notification tags per script and failed closed for
  unowned or unknown update/close requests.
- Scoped cookie-routing DNR session rules to extension-originated requests and
  made their exact URL filters case-sensitive.
- Kept install interception active for `.user.js` and `.user.css` URLs that
  carry query strings or fragments.
- Recorded the resolved URL for redirected installs so trust receipts and the
  review surface identify the host that served the script, with a redirect
  warning when it differs from the requested source.
- Kept the original queued timestamp and suppressed repeat notifications when
  a validator-less update endpoint returns the same pending version again.
- Skipped user-modified scripts during scheduled update sweeps while retaining
  explicit single-script checks for reviewing an available upstream version.
- Routed dashboard/editor saves through the ESM bundler gate, preserving bundle
  metadata and returning a bounded refusal when experimental ESM is disabled.
- Restored the previous userscript registration when update persistence fails,
  preventing the running version from diverging from durable storage.
- Added TTL/count-bounded storage and same-URL fetch deduplication to pending
  UserCSS handoffs, preventing abandoned editor payloads from accumulating.
- Gated EasyCloud's debounce and periodic sync entry points on the durable
  connected flag so a stale alarm cannot resurrect uploads after disconnect.
- Cleared Google Drive, Dropbox, and OneDrive credentials after definitive
  400/401 refresh-token rejection while preserving them through transient
  refresh-service failures, so revoked accounts surface a reconnect state.
- Added bounded 429/Retry-After handling for every cloud provider, classified
  Google Drive quota 403s before token refresh, and paused the periodic sync
  alarm until the provider's retry window expires.
- Clamped configured sync-encryption PBKDF2 iterations to the same bounded
  range used by decryption, preventing over-cap settings from creating
  undecryptable envelopes.
- Pruned sync tombstones older than 30 days after local and remote merges so
  stale deletions do not return on the next round-trip or inflate payloads.
- Aligned `@match` wildcard schemes with Chrome's HTTP(S)-only behavior and
  normalized match hosts case-insensitively for accurate page matching.
- Excluded background, context-menu, quarantined, and failed-registration
  scripts from the per-page running badge count.
- Ignored inherited `Object.prototype` names in UserCSS metadata instead of
  persisting directives such as `@toString` or `@constructor`.
- Bound menu-command execution to the authenticated script owner and serialized
  menu-command storage mutations to prevent cross-script dispatch and lost updates.
- Scoped GM_audio watch state and notifications by script and tab so one script
  can stop listening without silencing another script in the same tab.
- Guarded userscript callback events against cross-frame messages and replaced
  the raw DOM script-id marker with a non-reversible diagnostic marker.
- Restricted offscreen analysis to same-extension callers and bounded parser
  inputs before AST, merge, diff, or ESM work begins.
- Preserved dashboard background-call rejection details in the audited rollback,
  save, update, install, and update-check error toasts.
- Replaced CSP reporter dead-end extension samples with supported userscript
  guidance for `GM_xmlhttpRequest`, `GM_addElement`, `@grant`, `@connect`, and
  `@inject-into`.
- Updated the debugger Live Reload empty state to direct users to open the
  debugger from a script editor instead of exposing an internal API call.
- Added a compact dependency-graph empty state that explains how to populate
  the canvas when no scripts are installed.
- Preserved browser-reported one-shot userscript syntax diagnostics, including
  line and column locations, while retaining the older generic fallback path.

## [v3.27.0] — Recoverable restores, real isolation & honest errors (2026-08-08)

- **A broken update host was reported as a broken script, and quietly silenced
  updates.** Greasy Fork — the dominant update host — has served Cloudflare
  challenge pages and expired-certificate errors; that HTML reached
  `parseUserscript` and surfaced as a generic “Parse failed”, so users were told
  their script was broken rather than the host. Worse, the exponential-backoff
  ring treated a host outage exactly like a corrupt body, so repeated challenges
  escalated every affected script toward a 24-hour cooldown and updates stopped.
  Failures are now classified — host-challenge, transport (TLS/DNS/timeout),
  http-status, not-a-userscript, and genuine parse-error — each with a message
  naming the host and saying whether the installed script is implicated. Only a
  real parse error advances that script’s retry ring; host-level failures are
  recorded and logged without pushing it toward silence.

- **The debugger named every script by its internal UUID.** The console and
  variables selectors, the live-reload row labels and their toggle accessible
  names all rendered the raw `script_<uuid>`, so picking between
  `script_3f6a1c2e-…` entries made the debugger unusable past one script and a
  screen reader read out a UUID. It now takes a name resolver from the dashboard,
  which already holds the metadata, and keeps the id as the option value and
  `title` so it stays discoverable. Falls back to the id when the resolver is
  absent, returns nothing, or throws — so a log from a since-deleted script is
  still identifiable.

- **A custom or extra-preset theme applied to the dashboard only.** The Theme
  Editor stores its extra presets (nord/dracula/solarized/…) and user-built themes
  as CSS-variable overrides under `sv_active_custom_theme`, deliberately leaving
  `settings.layout` on a built-in so the base palette still resolves — but only
  the dashboard read that key. The popup, side panel, install review and DevTools
  panel each read `settings.layout` alone and rendered the base built-in, so one
  product looked like two. A shared `pages/theme-apply.js` now owns both halves
  for every surface, and re-applies live when the editor writes a new theme. It
  also replaces the `auto` / `prefers-color-scheme` resolution that was
  duplicated in five page scripts.
- **Deleting a custom theme took one mis-click and could not be undone.** The
  trigger was a 16×16 CSS-px “x” revealed on hover — below the repo-enforced
  24×24 minimum (WCAG 2.2 SC 2.5.8) and unreachable by touch — and it deleted
  immediately, unlike every other delete in the dashboard. A custom theme is 21+
  hand-picked tokens with no undo. It now confirms through the same danger-tone
  modal as chains and profiles, and the control is 24×24, always rendered, and
  fades up on hover or focus.

- **`release:check:public` was unpassable by construction.** The public gate
  rejected any unsigned tag outright, honouring its accepted-unsigned allowlist
  only when the public flag was off — while this project ships unsigned on
  purpose. The gate therefore failed silently for v3.21.0, v3.22.0 and v3.25.0,
  which makes it exactly as uninformative as one that always passes, and the
  allowlist needed hand-editing on every release. The policy is now declared in
  code (`RELEASE_SIGNING_POLICY`): an unsigned tag is reported as a warning in
  every gate and never fails one, a signature that exists but does not verify
  still fails, and a new release needs no allowlist edit. The tests name the
  policy instead of pinning the old accident.

- **The Firefox per-script-world probe tested for a symbol, not for the
  capability.** `supportsUserScriptsWorldId()` returned
  `typeof configureWorld === 'function'`, but Firefox shipped `configureWorld`
  *before* per-world `worldId` — so on 136–152 the check was true and the code
  relied on the engine throwing on the unknown property. An engine that instead
  accepted the call and silently dropped the property would leave every script on
  a page sharing one sandbox again, which is the bug per-script worlds fixed, on
  the Firefox range most users are on. A real capability probe now configures a
  throwaway world and reads it back: only a world that returns carrying the id we
  asked for counts as support. The probe runs once per session, cleans up after
  itself, and falls back to the shared world only when absence is proven.
- **Losing per-script isolation was silent.** If `configureWorld` threw, or
  `register`/`update` rejected the `worldId`, the script registered into the
  SHARED world with no warning, no `_registrationError` and no log entry — which
  is indistinguishable from working. Both fallbacks now record a
  `_registrationWarning` on the script and an error-log entry naming the
  consequence in plain terms, and the warning clears once a world is established.
- **A script id starting with `_` silently cost that script its isolated world.**
  Chrome reserves world ids beginning with `_`, and restored-backup script ids
  come straight from the archive, so `configureWorld` threw and the script dropped
  to the shared sandbox. World ids are now derived from the script id with that
  prefix escaped, deterministically, so the world stays stable per script.

- **An interrupted restore left mixed data and no way back.** `restoreBackup`
  snapshotted the pre-restore state in memory, ran the whole mutation chain
  (import → N database writes → settings → folders → workspaces), and wrote its
  receipt only at the very end. An MV3 service worker can be torn down at any
  `await`, so a restore killed part-way left the library half-restored with an
  empty receipts ledger — no undo at all, which is the exact failure the receipts
  feature exists to cover. The receipt is now written **before the first
  mutation**, marked `pending`, and finalized afterwards; a receipt still pending
  on a later start is reported once and stays offered for rollback until taken.
  A restore whose mutation phase errored keeps its snapshot even when no counter
  moved, because "nothing counted" is not "nothing happened".
- The JSON and ZIP import paths build their undo snapshot *as* scripts are
  replaced, so they cannot write a complete receipt up front. They now bracket
  their writes with a library-mutation journal instead, so an import killed
  mid-loop leaves evidence the library is half-written rather than nothing at all.

## [v3.26.0] — Enforced permissions, reviewed sync & honest freshness (2026-08-08)

- **Any `GM_xmlhttpRequest` longer than 30 s silently never called back, and a
  `GM.fetch` stream polled forever after a service-worker restart.** Terminal
  events (`onload` / `onerror` / `onloadend`) reach a script only through the
  wrapper's result poll, and that poll was capped at a fixed 600 ticks × 50 ms —
  so a request with `timeout: 60000`, or any slow transfer, completed in the
  background while the script's callbacks never fired and the request entry
  leaked. The poll now runs against the request's own timeout plus headroom, and
  reports a timeout instead of abandoning the request. Separately, the `GM.fetch`
  stream loop was unbounded and the background answered a bare `{done:false}` for
  a request id it no longer knew — after an MV3 restart that meant an unsettleable
  promise plus a ~40 msg/s loop keeping the worker awake. The background now
  answers `unknown: true` for any id it cannot serve (identically for a
  never-existed id and another script's, so ids cannot be probed), and both the
  XHR poll and the stream loop stop and report on it. The stream loop also has a
  wall-clock deadline.

- **`GM_xmlhttpRequest` buffered the entire response before enforcing its 50 MB
  cap on every response type except `stream`.** The only pre-read bound was
  `Content-Length`, which a hostile host reachable under `@connect` can omit or
  lie about; `text`/`json` called `response.text()` unbounded, and
  `arraybuffer`/`blob` checked the size only *after* `arrayBuffer()`/`blob()` had
  already buffered it. A chunked multi-GB reply could therefore OOM-kill the
  service worker — taking registration, cloud sync and update checks down with it
  — on every retry. All four paths now bound during the read (`text`/`json`
  through the existing bounded text reader, `arraybuffer`/`blob` through a new
  byte-bounded reader that cancels the stream the moment the cap trips), and the
  download fetch-bridge data URL path was converted the same way. The declared
  length is kept as a cheap early refusal.

- **Switching a profile left the Scripts table showing the old toggle states, and
  claimed success even when every toggle failed.** `_applyProfile` toggled scripts
  through the background and then refreshed only the profile chip — the table was
  never reloaded, and there was no storage-change listener, so every row toggle
  kept the pre-switch state until a manual reload. The URL-rule auto-switcher
  fires from `tabs.onActivated`/`onUpdated` while the dashboard is open, so the
  table could desync at any moment. Separately, `_setScriptEnabled` swallowed
  rejections and ignored `{error}` responses and `_getAllScripts` returned `[]` on
  failure, so a switch against an unreachable background still persisted
  `_activeProfileId` and rendered the profile as active. The apply now reloads the
  table when it toggled anything, collects per-script failures, and on any failure
  shows an error and leaves the active profile pointing at the state the library
  actually has.

- **A tampered remote sync blob installed executing scripts with no review, and
  hard-deleted local ones past trash.** With encryption off — the default — the
  remote envelope is unauthenticated JSON, so anyone able to write the user's own
  backend (a shared WebDAV, a leaked S3 key, a compromised Dropbox or Google
  account) chose what arrived. Synced-in bodies were gated only by
  `parseUserscript` — no analyzer, no review, no notification — then registered
  and run on every device; remote tombstones drove a `ScriptStorage.delete` that
  bypassed trash entirely, making library destruction unrecoverable.
  Synced-in bodies now go through the analyzer, and against a local copy any
  medium-or-worse risk or newly-arrived capability (`GM_cookie`,
  `GM_xmlhttpRequest`, `GM_download`, `GM_webRequest`, `GM_webSocket`, `*`, or a
  match pattern widened to every site) lands the script **disabled** with the
  existing `_importQuarantine` marker — which already keeps it out of every
  registration sweep and blocks the on-demand run path — plus a notification and
  an event-log entry. Setting up a new device is not punished for this: a first
  arrival has nothing to compare against, so only an outright high-risk body is
  held. An analyzer that cannot run counts as a reason to review, not as clean.
  Tombstone deletions now write a trash record first, honouring `trashMode`.

- **The page-facing Public API and Local MCP bridge had been dead since v3.18.0.**
  `content.js` relays page messages under `publicApi_handleWebMessage`, which is
  not `GM_`-prefixed and was missing from the user-script action allowlist, so
  every relayed message came back `Action not permitted from non-extension
  context` — killing `scriptvault:getScripts` / `isInstalled` / `install` and all
  four `scriptvault:mcp:*` handlers. The allowlist entry is added, and in the same
  change the requesting origin is now derived from the message **sender** instead
  of a payload field: a tab on any origin could otherwise have claimed
  `origin: 'https://trusted.example'` and passed the trusted-origin check for
  `scriptvault:mcp:writeScript`. Non-web senders (extension pages, `file:`,
  sandboxed frames with a null origin) resolve to no origin and are refused.

- **`@grant` was advisory: the privileged background enforced it for almost no
  GM handler.** `hasGrant()` lives in the injected wrapper, which runs in the same
  USER_SCRIPT world as the untrusted script body with `chrome` unshadowed — so a
  script can skip the wrapper and message the background directly. The background
  checked grants for exactly two actions (`GM_webRequest`, `GM_webSocket`), which
  meant a script the install review presented as `@grant none` could still drive
  `GM_setValue`/`GM_getValue`, `GM_openInTab`, `GM_closeTab`, `GM_notification`,
  `GM_download`, `GM_registerMenuCommand`, `GM_cookie_*` and `GM_xmlhttpRequest`.
  The permission disclosure described the wrapper, not enforced capability. A new
  `GMGrantPolicy` (`src/background/gm-grant-policy.ts`) maps every GM action the
  router accepts to the grants that authorize it — mirroring the wrapper's own
  checks so nothing that worked through the wrapper is newly rejected — and both
  user-script message listeners now consult it before dispatch. Unclassified GM
  actions, a missing script, and a failed grant lookup all fail closed, and a test
  derives the expected scope from the router so a new action cannot slip through
  unclassified.

- **Dismissing the What's New dialog dropped keyboard focus to nowhere.** The
  overlay was removed without handing focus back, so `document.activeElement`
  fell to `<body>` and a keyboard user lost their place. Because the dialog opens
  from an async storage read it can appear after focus has already moved into the
  page, making the loss arbitrary. Dismissal now restores focus to whatever held
  it before the dialog opened, falling back to the workbench rail's selected tab
  and then the Scripts panel. The dashboard smoke no longer assumes the dialog
  has settled either: it verifies focus actually landed on each workbench
  shortcut before sending Enter, and re-checks for a late dialog per shortcut.

- **A persistent UserCSS sheet could bleed onto every route of an SPA with
  nothing able to remove it.** When a client-side route change made a style stop
  matching, `onTabUpdated` deleted the per-tab registry entry whether or not
  `chrome.scripting.removeCSS` had actually succeeded. That registry is the only
  record of an injected sheet, so a removal that failed against a still-live
  document left the stylesheet applied and forgotten — permanently, for that
  document. The entry is now dropped only when removal succeeds or the error
  proves the tab/frame is gone; otherwise the next navigation event retries.
- **Rapid SPA navigations could leave the wrong styles applied.** The per-tab
  re-entrancy guard *discarded* every event that arrived while an injection pass
  was in flight, so a router firing several `pushState` calls in a row could end
  on a route whose styles were never re-evaluated. Events are now coalesced: the
  newest URL is queued and drained by a flat loop once the current pass settles.

- **A stale HTTP-cache hit could install an older script than the page showed,
  and "check for updates" could answer without reaching the server.** Only the
  scheduled update check managed freshness; every other remote read of userscript
  content — the intercepted `.user.js`/`.user.css` navigation, right-click
  install-from-link, install-from-URL, the catalog preview, and both subscription
  feed and feed-script pulls — called bare `fetch(url)` and inherited the shared
  HTTP cache. A new `FetchFreshness` policy (`src/background/fetch-freshness.ts`)
  is now the single decision point: every intent sets `cache: 'no-store'`, so the
  browser cache can neither answer nor absorb these reads, and only the two
  scheduled intents send stored `If-None-Match`/`If-Modified-Since` validators.
  A user-triggered single-script check is now an explicit refresh that sends no
  validators, so it can never report "up to date" off a cached body. Subscriptions
  persist feed validators (rejecting any value that could split a request) plus a
  `sourceFetchedAt` age that a `304` no longer resets, and a `304` feed pull is
  recorded as a check without reparsing the body.

## [v3.25.0] — Release integrity, supply chain & Firefox reproducibility (2026-08-06)

- **The Firefox package built differently on different machines.**
  `pages/install.html` and `pages/dashboard-standalone.js` carried CRLF line
  endings in the working tree while git stored LF, so a local build copied CRLF
  into the package while a build from the source archive produced LF — different
  bytes from identical sources. Git could not show it: with `* text=auto eol=lf`
  the index is already LF, so `git diff` stays clean. Both files are normalized,
  and a new test reads `git ls-files --eol` so a CRLF packaged file fails the
  suite instead of silently making the build machine-dependent. Verified: the
  Firefox package now rebuilds byte-identically — all 67 entries — from the
  submitted source ZIP alone in a clean Ubuntu 22.04 / Node 24.19 environment.
  This matters now because AMO builds submitted extensions from source and
  compares the result.

- **Dependencies published in the last week can no longer be pulled in.**
  `.npmrc` already refused to run dependency install scripts; it now also
  refuses to resolve any version published less than 7 days ago. That closes the
  other half of the same attack — a compromised maintainer account publishing a
  malicious version that lands in a lockfile within hours, which is what the
  keyv/cacheable compromise of 2026-08-04 did. Verified that `npm ci` is
  unaffected, since it installs exactly what the lockfile already pins; an AMO
  reviewer rebuilding from source runs that path. Both supply-chain settings are
  now asserted by `npm run toolchain:check`, so deleting either fails the build
  instead of quietly removing a control.

- **The README comparison table was making a false claim about a competitor.**
  It said Violentmonkey had Manifest V3 only in "Beta/test builds"; Violentmonkey
  shipped MV3 stable in v2.43.0 on 2026-07-14. Nothing could catch it, because
  the README gate validates ScriptVault's own claims against ScriptVault's own
  source and this repo holds no source of truth for what another project does.
  The table is rebuilt from verified releases and open issues, cites its evidence
  per row, and drops every row that could not be confirmed rather than asserting
  it. It now carries the date it was last checked, and `npm run readme:check`
  fails once that date passes 180 days. Being MV3-native is no longer a
  differentiator, and the section says so.

- **Removed a build mode that would have corrupted the extension if anyone ran
  it.** `npm run build:prod` wrote a *minified* bundle over the repo-root
  `background.js` — the tracked file that `chrome://extensions` loads as the
  unpacked extension and that a large part of the test suite reads by symbol
  name. Nothing invoked it, yet the generated README support matrix told readers
  the Chrome package was built with it. ScriptVault deliberately ships a readable
  bundle: it keeps store review fast, and AMO now rebuilds submissions from
  source and compares the result, so every packaging path must produce the same
  bytes as a plain build. The mode is gone, the docs now name the command that
  actually runs, and a test keeps `--prod` from reappearing. Shipped output is
  byte-identical.

- **Firefox: domain badges are correct for multi-level TLDs again.** A site on
  `example.co.uk` was labelled `co`. The accurate lookup had been implemented and
  then deleted as dead code, because a probe found `browser.publicSuffix`
  missing in Firefox 154 — but that API is gated behind a `"publicSuffix"`
  permission the Firefox manifest never declared, so it is `undefined` until you
  ask for it. Re-probed in the same Firefox build with the permission declared,
  it returns `example.co.uk`. The permission is now declared (Firefox only —
  Chrome has no equivalent API), the lookup is feature-detected, and Firefox
  140-152 and Chrome keep the previous heuristic. The permission is a local,
  read-only lookup against the browser's own public suffix list: no network
  access, no site access, no page content.

- **Fixed: three released versions had never been tagged or published.** v3.23.0,
  v3.23.1 and v3.24.0 were changelogged and merged while the newest git tag and
  GitHub release both stayed at v3.22.0, so four months of security fixes reached
  no user. All three are now tagged at the commit that carried their manifest
  version and published. A new `release:tags:check` gate runs as part of
  `npm run check` and fails when a changelogged version has no tag: exactly one
  version may be untagged — the one in flight in `manifest.json` — and every
  older one must be tagged or recorded as a historical gap. The gate immediately
  found four further untagged v2 releases, now recorded.

- **Security: the dependency floor gate was authorising a vulnerable DOMPurify.**
  The `overrides` pin sat at exactly 3.4.11 — the top of GHSA-c2j3-45gr-mqc4's
  affected range — while the floor that exists to prevent that was still set to
  an older advisory's 3.3.2, so the check reported "ok" and the high-severity
  audit could not see a low-severity finding. DOMPurify now resolves at 3.4.13,
  and the gate was hardened at the root cause: every floor must name the
  advisory it came from, and the `overrides` pins are checked directly rather
  than only after `npm install` has already written them into the lockfile.

## [v3.24.0] — Execution, Sync & Permission Hardening (2026-08-06)

- **Fixed: a failing background sync looked healthy.** Only manual syncs
  recorded their outcome, so the sync panel kept showing the last successful
  manual run while a scheduled sync failed every cycle behind it.
- **Fixed: a failed undo could not be retried.** Rolling back a restore marked
  the receipt as spent even when the rollback itself errored, so a transient
  storage failure permanently consumed the undo while its snapshot was still
  intact. Only a successful rollback marks the receipt now.
- **Fixed: fresh installs silently got daily 3 AM automatic backups.** The
  first-run migration wrote a backup-scheduler configuration in a shape the
  scheduler does not read, which discarded the intended weekly schedule and
  overrode the off-by-default the scheduler sets for itself. Backup defaults are
  now owned solely by the scheduler.

- **Accessibility: named the unlabelled Settings and Theme Editor controls.**
  Eight multi-line policy fields — including the denied-hosts, blacklist, and
  download-whitelist lists — announced as "edit text, blank" to a screen reader
  because their visible caption was never programmatically associated, and the
  21 generated theme colour pickers all announced as an anonymous "color
  picker". Every one now carries an accessible name.
- **Accessibility: the side panel Toggle All button met only 22px.** It and the
  header icon buttons now render at 28px, clearing the WCAG 2.2 minimum target
  size for a control that enables or disables every script on the page.
- **Fixed: the sidebar showed a hardcoded version four releases out of date.**
  The navigation rail read "v3.20.0" because nothing ever updated the literal;
  it is now populated from the manifest like the other version strings.

- **Security: on-demand script runs are isolated per script again.** "Run on
  This Tab", script chains, `@crontab`, and context-menu scripts injected into
  the single shared USER_SCRIPT world instead of the per-script world normal
  registration uses. Because each injected script carries its own messaging
  token, one script sharing that world could impersonate another and reach its
  stored values, `@connect` allowlist, and cookie scope. Uninstalling a script
  also never released its world — the cleanup call passed the wrong argument
  shape and the error was swallowed as an old-browser fallback.
- **Security: script chains can no longer be triggered for another site.** The
  chain DOM-event handler trusted a page-supplied URL when deciding which chains
  matched, so a script running on one site could make a chain scoped to a
  different site execute in its tab. The URL now comes from the browser.

- **Security: userscripts can no longer close arbitrary tabs or read each
  other's tab state.** `GM_closeTab` accepted any numeric tab id with no
  ownership check, so a script could walk the (small, sequential) id space and
  close every tab in the browser. It now only closes the script's own tab or one
  it opened itself. `GM_getTab`/`GM_saveTab` shared a single bag per tab, letting
  any script on a page read and overwrite another's state, and `GM_getTabs`
  returned every open tab's data to any caller; all three are now scoped to the
  calling script, matching Tampermonkey and Violentmonkey.

- **Removed a domain-badge feature that never actually ran, and withdrew the
  claim.** v3.23.0 advertised accurate multi-level-TLD roots on Firefox 153+ via
  `browser.publicSuffix`. That namespace does not exist in any shipping Firefox,
  so the branch was unreachable and every user kept the old heuristic — while
  the test suite passed against a hand-written mock of the missing API. The dead
  code is gone, the What's New and CHANGELOG claims are withdrawn, and
  `getDomainRoot` now has one shared implementation instead of three
  byte-identical copies across the dashboard, popup, and side panel. The
  multi-level-TLD limitation is documented rather than papered over.

- **Fixed: cloud sync produced conflict markers in scripts edited on only one
  device.** A device recorded a new merge base only when it applied someone
  else's change, never when it uploaded its own, so it kept merging against a
  stale ancestor and eventually treated its own earlier edit as a competing
  remote change — writing `<<<<<<< LOCAL` markers into working code. Where no
  base had ever been recorded, genuine concurrent edits silently degraded to
  last-write-wins with no conflict flag. Both the standard and Easy Cloud
  engines now record the uploaded code as the new base, skipping any script the
  user changed while the upload was in flight.

- **Security: `@connect` is now re-checked after HTTP redirects.**
  `GM_xmlhttpRequest`, `GM_download`, and `GM_loadScript` validated the
  requested URL but not the one the redirect chain actually landed on. Because
  requests carry the user's cookies and the extension holds broad host access, a
  host a script was allowed to reach could bounce it to one it was not — a
  credentialed cross-origin read whose body was returned to the script. A
  redirect that leaves the allowlist is now rejected and the response discarded.

- **Fixed: re-installing a script without `@namespace` created a duplicate
  instead of updating it.** The install review's metadata parser defaulted the
  name and namespace differently from the background parser that stores the
  script, so the "already installed?" lookup never matched. Clicking a script's
  install link again — the normal way userscripts are updated — added a second
  copy that also registered, so the script ran twice on every page, and the
  review showed "Install" instead of detecting a downgrade.
- **Fixed: comma-separated `@match` bypassed the broad host access prompt.** The
  background parser splits `@match`/`@connect` on commas but the install review
  did not, so `@match https://a.example/*,*://*/*` registered for every site
  while the review page saw one narrow pattern — skipping both the mandatory
  broad-access approval and the all-sites warning. A parity test now pins the
  two parsers together.

- **Fixed: a wildcard entry in Denied Hosts stopped every script from
  registering.** Settings accepts `*.example.com`, a bare `*`, and `host:port`,
  but registration interpolated those straight into match patterns, producing
  illegal values like `*://*.*.example.com/*`. Chrome rejects the whole
  `userScripts.register` call, and because Denied Hosts is a global setting the
  failure hit every enabled script at once. Denied hosts now go through the same
  validation and port-normalization as blacklisted pages.

- **Fixed: scripts scoped only by a regex `@include` refused to register.** The
  fail-closed guard that rejects all-malformed match patterns counted a regex
  `@include` as a positive pattern that had to survive registration — but
  `extractMatchPatternsFromRegex` returns nothing for nearly every real-world
  regex, so ordinary Tampermonkey/Violentmonkey scripts using
  `/^https?:\/\/[^\/]+\/watch/` and friends were unregistered with "No valid
  match patterns" and never ran. Regex includes are now exempt: the wrapper's
  runtime URL guard already returns before any user code when the URL doesn't
  match, so registering broadly does not widen the script's real scope.

- **Fixed: a wildcard-stuffed `@match` in a `.user.css` could freeze the
  extension.** The UserCSS matcher expanded each `*` into its own `.*` group, so
  a crafted stylesheet produced catastrophic backtracking — a 12-wildcard
  pattern took ~78 seconds per evaluated URL, and the matcher runs for every
  installed style on every navigation, blocking script registration, GM
  messaging, and the badge along with it. Consecutive wildcards are now
  collapsed before compiling, matching the guard the userscript matcher has
  carried since v2.0.4. Previewing an unsaved draft hit the same path.

- **Security: restored the blocking high-severity dependency-audit gate.**
  `npm audit --omit=optional --audit-level=high` exits 0 again. Bumped the
  Vitest family to 4.1.10 (browser-mode arbitrary file read/exec,
  GHSA-p63j-vcc4-9vmv) and the `web-ext` → `fx-runner` override to 1.6.0, which
  ships the fixed `shell-quote` 1.10.0 (GHSA-395f-4hp3-45gv). `undici` and
  `adm-zip` moved to patched releases in the same pass. All five packages now
  carry floors in `scripts/check-cve-floors.mjs` so a lockfile regression
  cannot silently reintroduce them.

## [v3.23.1] — Firefox Script Isolation Fix (2026-08-02)

- **Fixed: on Firefox, only the first userscript matching a page actually ran.**
  Per-script `worldId` isolation was gated off for Firefox, so every script
  registered for a page shared one USER_SCRIPT sandbox and scripts 2..n were
  silently dead — no error, no badge, nothing in the error log. Firefox 153
  implements `configureWorld({ worldId })` and accepts `worldId` on
  register/update, so the gate is now a feature probe instead of a
  user-agent exclusion. Engines without support still fall back to the shared
  world, and a `worldId`-rejecting register now retries without the field
  rather than leaving the script unregistered. Verified against Firefox
  154.0b1: two matching scripts, both now execute (previously one).

- **Added: real-browser SPA navigation verification to the Firefox smoke.** A
  new scenario installs a `@grant window.onurlchange` script against a
  client-side-routing page and drives `history.pushState`,
  `navigation.navigate()`, and a hash change **from the page world**. Because
  the wrapper's history patch is world-local, this proves the Navigation API
  path reaches across worlds — the half of the contract the jsdom test cannot
  cover. The page also asserts that *two* matching userscripts execute on it —
  the coverage gap that let the world-isolation bug ship, since the smoke had
  only ever proved a single `@grant none` script ran. Confirmed to fail with a
  named diagnostic when the isolation is reverted.

- **Fixed: the Firefox sideload smoke could not start on geckodriver 0.37+**,
  which rejects `-remote-allow-system-access` via capabilities; the privilege
  is now granted through the driver's `--allow-system-access` flag. The
  container-identity assertion also no longer fails on Firefox 154, which
  ships `privacy.userContext.enabled` defaulted on — it now checks whether the
  pref carries a *user-set* value, which is the only thing a sideload could
  have caused.

## [v3.23.0] — Security & Reliability Hardening (2026-07-22)

- **Upgraded Monaco editor 0.55.1 → 0.56.0.** The 0.56 bundle ships DOMPurify
  3.4.5 natively, closing CVE-2026-0540 (mXSS) at the source rather than relying
  on the repository's `dompurify` override. The ESM size budgets were raised to
  the new bundle's measured footprint (~1.3% larger); editor smoke and the
  Monaco package/ESM contract checks pass.

- **GM_addStyle reaches Shadow DOM (Firefox 153+ / Chrome).** A document-level
  `<style>` cannot cross shadow boundaries. `GM_addStyle` now also applies the
  CSS as a constructable stylesheet to every currently-open shadow root, so
  styles reach web components. The return value stays the document `<style>`
  element for compatibility, and its removal clears the shadow-root sheets too.
  Feature-detected — a no-op where constructable stylesheets are unavailable.
- **File:// script setup guidance (Firefox 153+).** When an installed script
  matches `file://` pages but the browser's local-file access permission is off
  (an explicit opt-in on Firefox 153+, fixed `isAllowedFileSchemeAccess()`), the
  dashboard now surfaces a distinct notice explaining how to enable it, instead
  of the script silently failing to run on local files.

- **GM_addStyle reaches Shadow DOM (Firefox 153+ / Chrome).** A document-level
  `<style>` cannot cross shadow boundaries. `GM_addStyle` now also applies the
  CSS as a constructable stylesheet to every currently-open shadow root, so
  styles reach web components. The return value stays the document `<style>`
  element for compatibility, and its removal clears the shadow-root sheets too.
  Feature-detected — a no-op where constructable stylesheets are unavailable.
- **File:// script setup guidance (Firefox 153+).** When an installed script
  matches `file://` pages but the browser's local-file access permission is off
  (an explicit opt-in on Firefox 153+, fixed `isAllowedFileSchemeAccess()`), the
  dashboard now surfaces a distinct notice explaining how to enable it, instead
  of the script silently failing to run on local files.

- ~~**Accurate domain-badge roots on Firefox 153+.**~~ **WITHDRAWN — this never
  worked.** The entry claimed the domain badge used a synchronous
  `browser.publicSuffix` API to resolve multi-level TLDs (example.co.uk showing
  "EX" instead of "CO"). No such namespace exists in any shipping Firefox
  (probed absent in 154.0b1), so the branch was unreachable and every user kept
  the heuristic result. The dead code was removed in a later release; the
  multi-level-TLD limitation is real and still open.

- **UserCSS honors the `@preprocessor` field.** `default`/`uso` styles already
  had their `/*[[var]]*/` and `var(--name)` tokens substituted; a
  `@preprocessor less` or `@preprocessor stylus` style now surfaces a clear
  "unsupported preprocessor" warning on install (its Less/Stylus syntax needs a
  compiler ScriptVault does not bundle) instead of silently injecting raw,
  uncompiled source.

- **Persistent UserCSS now re-matches on SPA navigations.** Styles were only
  re-evaluated on full document commits (`webNavigation.onCommitted`), so a
  client-side route change (history pushState/replaceState or a hash change)
  left a style bleeding onto a route it no longer matches, or failed to apply on
  a route it now matches. ScriptVault now listens for `onHistoryStateUpdated`
  and `onReferenceFragmentUpdated` and re-runs the match pass, adding
  newly-matching sheets and removing no-longer-matching ones without a reload.

- **Update security: the AST risk-delta is now recorded at the apply choke
  point.** Previously the 31-detector risk-delta ran only in the pending-update
  queue builder, so a forced or direct `applyUpdate` produced no risk analysis.
  `applyUpdate` now always re-runs the risk-delta, returns it, and stores it on
  the script (`settings.lastUpdateRiskDelta`), guaranteeing every code path that
  lands new code has recorded risk evidence. (force still overrides the
  auto-apply gate — the delta is recorded, not blocked.)

- **CWS Limited-Use zero-telemetry gate.** A new `no-telemetry:check` (wired into
  `npm run check`) fails the build if a third-party analytics/telemetry SDK
  enters the dependency tree, if any runtime dependency is declared, or if
  telemetry-SDK invocation syntax appears in first-party runtime source. It does
  not flag tracker-blocking userscript templates or the analyzer/netlog code
  that detects and observes tracking. Backs the existing PRIVACY.md Limited-Use
  disclosure ahead of Chrome Web Store enforcement (2026-08-01).

- **CI gate against CVE-fix regressions.** A new `cve-floors:check` (wired into
  `npm run check`) scans every resolved `package-lock.json` position and fails
  the build if `dompurify` drops below 3.3.2 (CVE-2026-0540) or `vitest` below
  4.1.0 (CVE-2026-47429), catching transitive copies (e.g. monaco's bundled
  DOMPurify), not just the top-level dependency.

- **Hardened GM cookie scope against script-id spoofing.** When a cookie
  request carries an authenticated `userScriptId`, a mismatched caller-supplied
  `scriptId` is now rejected with a "Script context mismatch" error, so a
  userscript can no longer name a different script to have that script's
  host-scope policy evaluated.
- **Bounded the pending-updates store footprint.** The `pendingUpdates` storage
  key was capped by entry count (50) but not by size; it now also enforces an
  8 MB total-serialized budget, evicting excess queued entries with a warning so
  the store stays under the `chrome.storage.local` quota.
- **Security: the AST risk analyzer now parses modern JavaScript.** Both the
  offscreen and inline Acorn parse paths were pinned to `ecmaVersion: 2022`, so
  a userscript using ES2023–2025 syntax (notably `using`/`await using` explicit
  resource management) threw on parse and silently degraded to the weaker regex
  fallback, evading the 31-detector AST scan. All parse sites now use
  `ecmaVersion: 'latest'`, so modern-syntax scripts are fully AST-analyzed.

## [v3.22.0] — Persistent UserCSS install and management (2026-07-16)

- **Persistent UserCSS styles.** ScriptVault now installs and manages persistent
  `.user.css` userstyles that inject on matching pages. Navigate to a `.user.css`
  URL for a review-and-install prompt, or use **Install Style** on a UserCSS
  draft in the editor. A **Manage UserStyles** surface (command palette) lists
  installed styles with enable/disable, edit, and delete. Styles inject early on
  each navigation (no flash), never stack duplicate sheets, clean up when a tab
  closes, and re-apply across service-worker restarts.

## [v3.21.0] — Security, disclosure, and reliability hardening (2026-07-16)

- **Fixed a console error when opening the editor.** The schedule-icon injector
  matched a delete button nested in a row's overflow menu and tried to insert
  before it, throwing a DOM `NotFoundError` (the reference node was not a direct
  child of the action row). The lookup is now scoped to a direct-child delete
  button, falling back to appending the icon.
- **Sanitized page-controlled "new script from this page" template tokens.** The
  active tab's title and favicon URL are stripped of control characters (CR/LF
  included) and length-clamped before being substituted into a generated
  userscript, so a crafted multi-line `document.title` cannot inject extra
  metadata directive lines into the new script.
- **Hardened the build chain against npm lifecycle-script worms.** Dependency
  install scripts are now disabled by default (`.npmrc` `ignore-scripts=true`),
  closing the install-time payload vector used by 2026 npm supply-chain worms.
  The build still works because ScriptVault has zero runtime dependencies and
  esbuild's binary resolves from its platform optional dependency.
- **Pinned the manifest permission surface with a build-time drift gate.** A new
  `permissions:check` (wired into `npm run check`) fails the build if any
  manifest declares a permission or host outside the reviewed allowlist, so a
  release can never silently widen permissions or host access — a defense against
  ownership-transfer / permission-creep supply-chain attacks. Host access stays
  pinned to `<all_urls>` and is never widened beyond it.
- **Fixed UserCSS live-preview leaks.** Closing or navigating away from the
  dashboard while a UserCSS preview is active now clears the injected preview
  CSS from the target page (via `pagehide`), and switching the active target tab
  during a preview no longer orphans the previous tab's injected sheet.
- **Re-scan update bodies for newly introduced high-risk code.** When an update
  is queued, ScriptVault re-runs the AST risk analyzer on the incoming code and
  diffs it against the installed version. An update that introduces new
  high-risk sinks (network, execution, data, hijack, mining, obfuscation) not
  present before is flagged with an "Introduces new high-risk code patterns"
  review reason and routed to the manual update-review inbox instead of
  auto-applying — closing the same-author/same-registry account-takeover
  propagation vector that the permission/provenance gates do not catch.
- **Added a coordinated security-disclosure policy.** A new `SECURITY.md`
  documents supported versions, private reporting channels (GitHub private
  vulnerability reporting + email), and the disclosure window; the README links
  it. GitHub private vulnerability reporting is enabled on the repository.
- **Bumped the `esbuild` build-tool floor to `^0.28.1`** to clear
  GHSA-g7r4-m6w7-qqqr (Windows dev-server path traversal).

- **Preserved authored script bytes and delivered mapped uncaught errors.**
  Source-directive hardening now retains CRLF and ignores directive/marker
  lookalikes inside multiline template literals while still removing executable
  source overrides. Window errors and unhandled rejections now travel through
  the authenticated `reportExecError` telemetry path with mapped locations.
- **Hardened automatic UserCSS theming and bounded sync parsing.** Dual light/dark
  UserCSS values now use an OS-driven `prefers-color-scheme` override even when
  the target page does not declare `color-scheme`. Cloud sync JSON downloads
  fail closed when a response adapter cannot expose a bounded readable stream,
  eliminating the production escape hatch to unbounded `response.json()`.
- **Localized the tool-first workbench and workflow status layer.** Command,
  filter, saved-view, inspector, sync-health, popup diagnostic, import-review,
  settings-save, and utilities-diagnostic copy now resolves through the unified
  generated locale catalog. Dynamic controller states accept a translator,
  inspector icons survive DOM localization, and the editor toggle no longer
  points at a nonexistent locale key.
- **Deep audit hardening (2026-07-15).** Six-agent audit over the workbench
  redesign, typed action dispatch, recent security commits, the UserCSS engine
  and language service, workflow controllers, and secondary surfaces. Fixed:
  UserCSS variable substitution no longer expands `$`-replacement patterns from
  values into the surrounding stylesheet, `var(--name, fallback)` resolves
  fallbacks with nested parentheses, label-less `@var` number/checkbox
  directives coerce correctly, select/text values round-trip, text values are
  screened for CSS-structure injection, and draft previews are serialized so
  overlapping refreshes cannot orphan injected CSS. Script source-map
  finalization uses function replacements (a `@require` URL with `$'`/`$&` no
  longer breaks the wrapped script), and error attribution picks the topmost
  stack frame. Execution-URL retention now also governs the error log and the
  diagnostics panel, matching the documented privacy promise. The workbench
  topbar health indicator, column-visibility dialog, inspector accessibility,
  row-action keyboard handling, site filter, and localized breadcrumb are
  repaired; the diagnostics controller distinguishes empty from unavailable and
  the settings controller no longer falsely rolls back on a live-apply failure.
  Popup light-theme theming, the install-page Enter guard, What's New copy, and
  the accessibility e2e theme gate are fixed, and the table container scrolls
  horizontally so far-right controls stay reachable. The `.test.ts` workflow
  controller suite (previously never executed by the vitest glob) now runs.
- **Reimagined the dashboard as a focused script operations workbench.** A
  persistent command bar, compact three-metric summary, site and saved-view
  filters, progressive row-action menus, and keyboard-navigable inspector
  views reduce visual noise while preserving every script workflow. Larger
  working type, rhythmic spacing, plain status marks, grouped controls, and
  separator-led surfaces replace the previous stack of outlined cards and
  pills. A tool-first density pass removes duplicated page heroes, puts sticky
  search and action bars first, and compresses settings, utilities, recovery,
  update, and help sections without shrinking control text. Responsive table
  actions, an intentional empty inspector, four-theme visual baselines, and a
  real-extension interaction test cover the new shell.
- **Completed advanced UserCSS configuration and live preview.** HSL, OKLCH,
  and OKLab colors now validate in the generated runtime; color aliases can
  share a linked palette; light/dark defaults render through the selected
  preview scheme; and the dashboard can live-preview then write configured
  values back to the draft. Export/re-import preserves advanced metadata and
  current values across Chrome and Firefox fixtures.
- **Extracted dashboard workflow controllers behind typed, testable boundaries.**
  Tampermonkey import review, per-setting serialized persistence, and utilities
  diagnostics now use generated TypeScript controllers with thin DOM adapters,
  explicit loading/empty/failure/recovery states, retry controls, and headless
  real-extension coverage while retaining the existing dashboard globals.
- **Unified the credential-free release preflight.** One command now runs 12
  source, test, audit, locale, privacy, headless browser, packaging, and parity
  gates; builds only the requested-version Chrome ZIP in an isolated artifact
  root; and emits timestamped JSON results with per-check logs and SHA-256
  evidence. Credentialed CWS status, public release parity, and store review
  remain explicitly separated as external checks.
- **Gated active documentation against canonical project facts.** The local
  validation derives toolchain and browser versions, promoted-runtime counts,
  IndexedDB stores, and local-only delivery policy from manifests, lock data,
  source maps, and storage code. Stale versions, deleted workflow claims,
  brittle source line counts, and the outdated Violentmonkey MV2-only claim
  were corrected; `npm run check` now fails on future drift.
- **Adopted TypeScript 7 as the primary compiler.** Development and release
  typechecking now pin TypeScript 7.0.2, while the generated-runtime AST
  transform is isolated on a documented TypeScript 6.0.3 compatibility alias
  until its byte-for-byte output contract can migrate safely. Clean install,
  production build, runtime drift, unit, and headless release suites cover the
  split toolchain.
- **Unified runtime and manifest localization behind generated catalogs.** One
  canonical source per locale now emits typed runtime data, shipped
  `modules/i18n.js`, and `_locales` messages with deterministic drift checks.
  English is labeled complete; the other eight locales are honestly labeled
  partial with non-regressing translated-message baselines instead of counting
  English copies as translations. Extension pages now set `lang` and `dir`,
  Hebrew renders RTL, and live count labels use CLDR plural categories through
  `Intl.PluralRules`, including Russian and Japanese forms.
- **Release-gated real extension accessibility against WCAG 2.2 AA.** Headless
  Chromium now scans the dashboard, popup, side panel, install review, and
  DevTools panel across dark, light, Catppuccin, and OLED themes at compact and
  large viewports. The gate also exercises empty/loading/error/dialog states,
  keyboard focus trapping and restoration, unobscured focus, visible focus
  indicators, and 24px targets with an explicit reviewed-exception contract.
  The pass fixed invalid tab state, initial list semantics, theme contrast,
  undersized controls, compact table clipping, and sticky chrome that could
  cover focused controls.
- **Mapped runtime failures to original userscript sources.** Every registered
  wrapper now carries a deterministic local source identity and inline Source
  Map v3 data across `@require`, top-level-await, delay, unwrap, and bundled ESM
  module offsets. Error telemetry persists original and generated coordinates,
  and debugger links open editable userscript lines while labeling dependency
  failures without misdirecting the editor. Hostile source directives are
  neutralized before registration.
- **Removed the background core's blanket type-check suppression.** Strict
  TypeScript now checks the full concatenated core; classic-script globals are
  isolated in an explicit declaration boundary and legacy dynamic parameters
  are annotated instead of hiding the entire runtime from the compiler.
- **Completed typed background action routing.** Install review, resource
  loading, URL diagnostics, one-shot execution, chains, UserCSS preview,
  dashboard launch, and privacy-complete factory reset now use generated
  domain contracts; the 227-action legacy switch has been removed.
- **Typed data and Easy Cloud dispatch.** Script values, resource prefetch,
  export, quota cleanup, Gist settings, and Easy Cloud lifecycle operations now
  use generated contracts with explicit defaults and unavailable-module
  fallbacks.
- **Typed script lifecycle dispatch.** Script reads, saves, creation, deletion,
  trash recovery, enable/disable, duplication, ordering, host-access recovery,
  and schedule refresh now share one generated action/response contract while
  preserving per-script locks, trust receipts, registrations, and tombstones.
- **Typed diagnostics and observability dispatch.** CSP reports, network logs,
  static analysis, local AI, execution statistics, error logs, notifications,
  script consoles, NPM resolution, and live reload now share one generated
  action/response contract instead of duplicated background switch cases.
- **Typed signing and Public API security dispatch.** Key trust, signature
  verification, trusted callers, local MCP bridge configuration, permissions,
  audit logs, and web messages now share a generated fail-closed contract.
- **Typed global and per-script settings dispatch.** Settings changes now flow
  through a generated contract while preserving registration, alarm, badge,
  context-menu, import-review, and local-library cleanup side effects.
- **Typed organizational action dispatch.** Profiles, collections, workspaces,
  and folders now use one generated contract, and workspace/folder mutation
  responses consistently include the documented success discriminant.
- **Typed the backup and recovery boundary.** Backup creation, inspection,
  restore receipts, rollback, and settings now share one generated contract;
  successful restore and rollback paths still re-register scripts and badges.
- **Typed cloud-sync dispatch without weakening import trust.** Manual sync,
  provider lifecycle, dry-run, health, and remote import/export actions now
  share a generated contract that keeps credentials and imported-script trust
  explicitly opt-in.
- **Typed update and subscription dispatch end to end.** Pending-update,
  forced-update, rollback, version-history, and subscription messages now use
  one generated action/response contract instead of duplicated switch cases.
- **Introduced typed background action dispatch.** Import trust, execution
  telemetry, and all promoted GM API domains now route through generated typed
  domain-handler registries with duplicate and unknown registrations rejected;
  the remaining legacy domains stay on the audited fallback while migration
  continues.
- **Made the service-worker rehydration smoke test the real MV3 lifecycle.**
  The headless release gate now terminates only the extension worker through
  Chromium's debugging protocol instead of unloading the entire extension.
- **Made trust-boundary tests executable and coverage-gated.** Generated
  wrapper, sender-policy, archive, update-queue, sync, and migration contracts
  now exercise runtime behavior with deterministic malformed inputs; the pass
  also rejects mismatched Chrome sender IDs, invalid archive sizes, corrupt
  migration records, and unsafe recovered update-queue state.
- **Operationalized Chrome and AMO rollback.** Store status now runs a real
  previous-public/current/rollback recovery drill and reports per-channel
  readiness, rollout and pending-submission consequences; the incident
  playbook chooses store rollback versus a reviewed roll-forward explicitly.
- **Made release userscript smokes fail closed.** The shared headless fixture
  now enables Chromium's shadow-DOM Allow User Scripts control, labels
  capability and release reports separately, and turns missing execution/OPFS
  support into evidence-bearing release failures; all 14 release E2Es execute.
- **Made execution URL retention privacy-preserving and irreversible.** New
  installs retain origins by default; existing full URLs migrate to origins;
  stricter settings atomically rewrite IndexedDB records, delete URLs in None
  mode, and resume interrupted scrubs from a durable cold-start marker.
- **Quarantined every vendor backup by default.** Tampermonkey/ScriptCat,
  Violentmonkey, and Greasemonkey imports now share one bounded trust pipeline,
  preserve archive-disabled state, retain local settings on overwrite, record
  reviewed trust decisions, and cannot register or run while quarantined.
- **Separated untrusted page telemetry from execution completion.** Public
  bridge events are now schema- and rate-bounded diagnostics with no script
  attribution, while stats, network attribution, and `afterScript` chains
  require authenticated userscript identity and idempotent completion IDs.
- **Closed privileged catalog-fetch gaps.** Script previews and install
  dependency probes now run through background actions with internal-host and
  redirect checks, strict timeouts, bounded response reads, and limited probe
  concurrency instead of fetching catalog-controlled URLs from extension UI.
- **Hardened GitHub Gist integration.** API and raw-file requests are restricted
  to official GitHub HTTPS hosts, time out cleanly, and reject oversized API or
  userscript responses before they can exhaust the dashboard renderer.
- **Made Factory Reset complete and truthful.** Reset now clears every local and
  session storage key, integration credential, signing key, backup/receipt,
  orphaned network rule, and alarm before restoring defaults; the dashboard
  explains the full scope and restarts ScriptVault to discard in-memory state.
- **Improved remote-flow recovery.** Context-menu installs, catalog searches,
  library lookup, and curated collection resolution now fail with bounded,
  actionable timeout behavior rather than hanging indefinitely.
- **Hardened sync and script-size boundaries.** Every cloud-provider response is
  now size-bounded before JSON parsing, S3 uses the same abortable timeout path
  as the other providers, and the 5 MB userscript limit is enforced in UTF-8
  bytes so multi-byte source cannot bypass storage safeguards.
- **Kept compact navigation accessible.** Every dashboard destination retains
  a localized accessible name when the narrow layout hides its visible label,
  with browser-verified and automated regression coverage.
- **Closed slow-response lifecycle gaps.** Install, context-menu, dependency,
  provenance, standard cloud-sync, and EasyCloud requests now keep their
  deadlines active through response-body reads; EasyCloud also rejects
  oversized backup, metadata, and error payloads before parsing them.

## [v3.20.0] — Premium interaction and theme polish (2026-07-14)

- **Unified the product around one deliberate visual system.** Every shipped
  surface and injected module now uses the same finite radius scale, semantic
  foreground tokens, focus treatment, elevation, and motion rules. Automated
  checks prevent pill geometry, out-of-scale corners, raw white foregrounds,
  and below-AA semantic color pairs from returning.
- **Made the editor truly theme-aware.** The default editor follows the active
  dark, light, Catppuccin, or OLED interface theme from its loading shell
  through Monaco startup, while named editor themes keep their intended
  palettes. Theme changes are propagated into an already-open editor.
- **Improved workbench orientation and recovery.** Trust rail destinations now
  open the exact setting or diagnostic control, focus it, and highlight it;
  DevTools releases its theme listener cleanly; compact surfaces no longer
  expose raw localization keys.
- **Clarified consequential decisions.** Confirmation dialogs use specific
  action labels and severity treatment across delete, reset, rollback, restore,
  import, disconnect, trust, workspace, profile, template, chain, and
  collection flows. Destructive dialogs put initial keyboard focus on Cancel.
- **Expanded rendered release evidence.** The DPI-aware screenshot matrix now
  captures 48 dashboard, editor, compact, install, DevTools, and confirmation
  views across all four themes. Live smoke coverage verifies deep-link routing,
  dialog labels, safe focus, Escape recovery, and full-screen editor controls.

## [v3.19.2] — Restore broad install-time host access (2026-07-13)

- **Userscripts run on install again (Chromium).** Reverted the Chrome/Edge
  manifest from `optional_host_permissions` back to
  `host_permissions: ["<all_urls>"]`, so the extension is granted full site
  access at install instead of surfacing "Site Access Needed" per origin. This
  matches the Firefox build, which always shipped broad host access.
- **All-site script approval is now opt-in.** The legacy
  `scopedHostPermissions` key (an internal registration gate) defaults to
  `false`. Enabling it requires explicit approval before universal scripts
  register; it does not revoke the extension's required all-site host access.
- Fixes broad-match scripts (`@match *://*/*`, `@match <all_urls>`) being
  unregistered until manually approved per script.

## [v3.19.1] — Premium workbench parity pass (2026-07-09)

- **Brought the shipped dashboard closer to the new premium concept.** The
  visible navigation rail is now the real keyboard tablist, workspace metrics
  report honest local/sync state, secondary destinations route to focused
  controls, and compact layouts preserve the primary workflow.
- **Deepened every dashboard destination.** Updates, Settings, Utilities,
  Trash, and Help now share the same deliberate hero, surface, state, and
  recovery hierarchy as the Scripts workbench.
- **Hardened settings autosave.** Writes for the same setting are serialized,
  failures restore the previous control value, and the persistent save summary
  communicates progress without repetitive success toasts.
- **Finished compact-surface states.** Popup controls have state-specific
  accessible names, the side panel collapses empty library chrome, install
  review announces loading, DevTools adapts to narrow panes, and a recoverable
  basic editor state replaces silent Monaco failures.
- **Expanded rendered evidence.** The four-theme screenshot matrix now covers
  every dashboard destination plus editor, popup, side panel, install review,
  and DevTools, with cached-theme bootstrap and final-paint waits preventing
  mixed-theme captures.

## [v3.19.0] — Professional workbench redesign (2026-07-09)

- **Recomposed the Scripts workspace around the primary workflow.** A clear
  page title and action group, four live vault-health metrics, a focused
  search/filter command bar, stronger row selection, and a contextual
  trust/access inspector now match the new high-fidelity dashboard concept.
- **Established a shared premium surface system.** Dark mode now uses a calmer
  graphite/emerald palette; light mode has stronger text and boundary contrast;
  shared sunken, raised, elevated, semantic, shadow, and motion tokens keep all
  four themes coherent.
- **Aligned every compact and diagnostic surface.** Popup branding, side-panel
  sections, install review/error containment, and DevTools diagnostics now use
  the same hierarchy, focus states, borders, and interaction timing as the
  dashboard and editor.
- **Expanded visual regression coverage from one theme to four.** Browser-mode
  baselines now pin dark, light, Catppuccin, and OLED dashboard layouts.
- **Strengthened rendered QA.** The screenshot workflow now captures dashboard,
  popup, side panel, install review, and DevTools; it dismisses the release
  modal before dashboard capture and waits for final layout paints. Dashboard
  and editor smoke tests were updated for the new workbench hierarchy.
- **Refined UX copy and states.** The main workspace now says exactly what it
  supports, Import is consistently labeled, the setup warning is less dominant,
  and empty/error surfaces provide clear recovery actions.

## [v3.18.2] — Deep audit hardening pass 2 (2026-07-09)

- **Security: revoke EasyCloud OAuth token via POST body, not URL query.**
  `EasyCloudSync.disconnect()` sent the live Google access token as a GET query
  parameter, where it can leak into request lines, proxy logs, and history. It
  now revokes via a POST form body, matching the regular Google Drive provider's
  fix.
- **Security: bind GM_xmlhttpRequest_abort to the owning script.** The abort
  handler aborted any request by its enumerable requestId without checking the
  caller, letting one script cancel another's in-flight network requests. It now
  enforces `request.scriptId === ownedScriptId`, matching the result handler.
- **Security: factory reset now erases backup blobs and publication receipts.**
  `ScriptStorage.clear()` only wiped the scripts partition, so a factory reset
  left fully-restorable script code / GM values (and possibly credentials) in
  the IndexedDB backups store. `BackupsDAO.clear()` now clears both the backups
  and publicationReceipts stores, and `autoBackups` metadata is removed too.
- **Fix: storage usage is measured origin-wide.** `QuotaManager.getUsage()`
  derived bytes-used from `chrome.storage.local` (which post-v3 holds only
  settings/caches) while dividing by the origin-wide quota, so the automatic
  cleanup level gate never fired. It now uses `navigator.storage.estimate()`
  usage, falling back to `chrome.storage.local` when unavailable.
- **Fix: activity heatmap no longer clips the newest days.** Sunday-alignment
  can push the 52-week window to 53 partial columns; the canvas is now sized to
  the real column count so the most recent 1-6 days render on-grid.
- **Fix: Gist import guards a missing `files` map** and shows "No .user.js
  files found" instead of a raw TypeError on malformed Gist payloads.
- **Fix: collection reinstall** surfaces a clear "no source URL to reinstall
  from" message instead of a cryptic Greasy Fork ID error for local-only
  entries.
- Completed the trust-receipt provenance rename (`not-yet-implemented` →
  `verification-unavailable`) across types, update-checker, and install/dashboard
  review states, with rebuilt runtime.

## [v3.18.1] — Deep audit hardening pass (2026-07-09)

- **Security: bind reportExecTime/Error to sender identity.** The
  `reportExecTime` and `reportExecError` message handlers now use
  `sender.userScriptId` instead of trusting the caller-supplied
  `data.scriptId`, preventing cross-script chain triggers and stats
  corruption via forged messages. `data.time` is validated as finite
  before mutating stats.
- **Fix: trust-receipt provenance path.** `withProvenance` now passes
  `undefined` (not `''`) when no dependency body is available, so
  `buildDependencyProvenance` correctly returns `verification-unavailable`
  instead of falling through to the JSON signature verifier.
- **Fix: install page keydown listener leak.** `renderInstallUI()` now
  aborts the previous keydown listener via AbortController before
  registering a new one, preventing listener accumulation on broad-host
  toggle re-renders.
- **Fix: popup copyUrl scope.** The Copy URL dropdown handler now
  resolves scripts from both `pageScripts` and `allScripts`, matching the
  pattern used by `configureScriptDropdown`.
- **Fix: saveScriptSettings/resetScriptSettings error swallowing.** Both
  now check the background response for `{ error }` before optimistically
  updating local state.
- **Fix: whatsnew changelog HTML escaping.** All CHANGELOG field
  interpolations in the What's New modal are now escaped via
  `escapeHtml()` to prevent markup injection from future entries.
- **Fix: scheduler slider midnight wrap.** Time slider drag clamp
  changed from 1440 to 1425 so the slider cannot silently wrap to 00:00.
- **Theme: workbench shell accent tints are now token-based.** All 20+
  hardcoded `rgba(53,208,127,...)` and `rgba(69,200,255,...)` accent
  tints in the workbench shell CSS now use `color-mix()` with
  `--sv-accent` / `--sv-accent-2`, and catppuccin/OLED token overrides
  are added so the workbench renders with correct palette colors in all
  four themes.
- **Theme: sidepanel timing badges and toggle.** Defined `--timing-*`
  and `--toggle-off-*` tokens across all four themes so these controls
  no longer fall back to dark-only hardcoded colors.
- **Theme: dashboard toggle dot.** `.toggle-slider::before` now uses
  `var(--toggle-dot)` instead of hardcoded `#fff`.
- **Theme: popup confirming state contrast.** Added light-theme override
  for `.danger.confirming` to use dark red text instead of pale pink.

## [v3.18.0] — Release hardening audit (2026-07-09)

- **Encrypted manual cloud sync transfers.** Manual Easy Cloud export/import now
  uses the same encrypted sync envelope helpers as scheduled sync, and imports
  mark encryption established after a valid encrypted envelope is read.
- **Public API page transport is reachable through the content-script bridge.**
  Trusted web-page and Local MCP messages are relayed to the background Public
  API handler with origin/token checks, while response echoes are ignored to
  avoid message loops.
- **Bounded network/runtime state.** GM_xmlhttpRequest now caps active requests
  globally and per script; the TypeScript resource-loader mirror caps the
  in-memory @require cache like the runtime worker.
- **Release packaging and smoke tests are stricter.** Chrome Web Store publish
  packaging uses explicit assets instead of copying all of `lib/`, Firefox
  smoke tests refuse stale ZIPs, and installed Firefox package version is
  checked against `package.json`.
- **Browser support evidence is failure-aware.** The generated support matrix
  now distinguishes failed, stale, unreadable, missing, and passed Edge sideload
  smoke evidence instead of flattening every non-passing artifact to "no current
  evidence."
- **Dashboard reliability polish.** Collection deletes use the dashboard modal
  confirmation flow, repeated command-palette opens refocus the existing modal,
  sidepanel launch buttons fall back cleanly, DevTools filtered clear preserves
  captured data, and large inline diffs switch by matrix size instead of line
  count.
- **Smoke cleanup is harder to wedge.** Dashboard/editor/browser capture smokes
  now share crash-aware cleanup helpers so interrupted launches do not leave
  browser processes or temp profiles behind, and the Edge sideload smoke now
  has a top-level timeout with temporary-profile process cleanup.

## [v3.17.0] — Trust enforcement, sync data-safety, and backup slimming (2026-07-02)

### Added
- **Sync can hold userscript execution until first sync completes.** A new
  opt-in sync setting prevents userscript registration on fresh devices until
  the first successful sync, then releases automatically; a 90 second timeout
  warns and falls back to normal registration.
- **Bound local files can auto-refresh through File System Observer.** Browsers
  with `FileSystemObserver` watch granted local file handles, debounce external
  edits, and route them through the existing review/apply gate; unsupported
  browsers keep the manual Refresh File flow.
- **Local MCP bridge prototype is guarded in Trust Center.** The bridge is
  disabled by default, accepts only configured loopback origins with a bearer
  token, and limits the first capability set to script list/read/write actions.
- **`@crontab once(...)` schedules now fire one time.** One-time crontab
  metadata schedules the next matching alarm, records a local fired marker, and
  refuses to re-arm that same expression after it runs.
- **Local-folder sync can round-trip scripts and GM values through a selected
  browser folder.** The dashboard stores a File System Access directory handle,
  writes `scriptvault-backup.json`, and reuses the existing 3-way sync merge and
  preview engine.
- **Per-script isolated cookie jars can be enabled with `@isolationCookie`.**
  Opted-in scripts use a deterministic CHIPS partition for `GM_cookie`,
  `GM_xmlhttpRequest`, and `GM_download` cookie routing unless they pass an
  explicit partition.
- **GM.fetch now streams through a Fetch-shaped response.** Granted scripts can
  read `res.body.getReader()` chunks under the existing `@connect` and
  internal-host guards, with a buffered XHR fallback where streaming is absent.
- **On-device AI assistance is opt-in and local-only.** Settings now gate Chrome
  Prompt API install summaries plus editor Explain/Draft buttons, with all model
  prompts routed through the background and no remote AI transport path.

### Fixed
- **Dashboard view switches now use reduced-motion-safe same-document View Transitions.**
  Script-list/editor entry and dashboard/editor tab switches fade the active
  work surface when supported, fall back instantly under reduced motion or
  unsupported browsers, and keep editor smoke hit-testing aligned with the live
  DOM after the entry transition settles.
- **Firefox sideload smoke now waits out the What's New overlay.** The harness
  watches the asynchronous dashboard overlay before clicking setup controls, so
  Firefox permission smoke checks are no longer blocked by the release notes
  dialog.
- **Firefox packaging now guards against forced container identity enablement.**
  The Firefox manifest and generated package tests forbid `contextualIdentities`,
  and the sideload smoke verifies `privacy.userContext.enabled` stays false in a
  fresh profile after ScriptVault installs.
- **Snippet insertion now preserves placeholder navigation.** Custom snippets
  can use `$1`, `$2`, `${1:name}`, `$0`, and `$CURSOR$` markers; inserted
  snippets select the first placeholder, move through later fields, adjust after
  edited placeholder text, and land on the final cursor marker.
- **Dynamic dashboard controls are easier to operate with assistive tech.**
  Card-view action menus now expose menuitem roles and arrow-key navigation,
  while script-chain cards and pipeline steps use labeled lists, action groups,
  and native move up/down buttons alongside drag-and-drop.
- **Cookie-routed GM network requests no longer risk DNR header clobbering.**
  `GM_xmlhttpRequest` and `GM_download` cookie-routing rules now run
  concurrently for different URLs while serializing exact same-URL requests
  so overlapping Cookie header rules cannot affect each other.
- **Remote result descriptions now use native HTML sanitization when
  available.** Find Scripts and cdnjs library descriptions render through
  `Element.setHTML()` on supporting browsers, with the previous escaped
  fragment path kept as the fallback.
- **Advanced Linter fix previews now collapse unchanged hunks.** The preview
  keeps nearby context, renders gap separators, and Fix All continues past five
  mutations while re-linting after each applied fix.
- **External Public API installs now enter review safely.** External and trusted
  web-page install requests store scripts disabled with import-quarantine
  metadata and no longer fill missing `@match` directives with universal access.
- **SRI require enforcement is aligned across source copies.** The
  `resource-loader` extraction target now reads the Security SRI setting like
  the live background path, while install/update trust-receipt probes remain
  allowed to inspect unpinned dependencies for review.
- **SRI Require now reports blocked unpinned dependencies clearly.** Unpinned
  remote `@require` dependencies blocked by Require mode store a distinct
  `blocked: unpinned @require under SRI Require` failure instead of the generic
  `empty response` message.
- **Update extraction applies script updates serially.** The `update-checker`
  source module now mirrors the live per-script update lock so concurrent update
  applications preserve intermediate version history.
- **Popup site restriction preserves custom match lists.** "Only on This Site"
  now appends the current host pattern to existing user `@match` overrides
  instead of replacing curated per-script scope lists.
- **Ported match patterns no longer break native registration.** Existing
  port-specific `@match` entries register with portless Chrome patterns plus an
  exact runtime URL guard, while the dashboard rejects new ported match inputs.
- **Scheduler modals no longer close over a freshly reopened dialog.** The close
  timeout now captures the closing overlay and only clears scheduler modal state
  for that same element.
- **Scheduler alarm sync now preserves interval phase.** Opening the dashboard
  no longer clears and recreates unchanged `sv_sched_*` alarms, and date-range
  previews format date inputs as local calendar days.
- **Pattern Builder previews now use Chrome-style match semantics.** Wildcard
  subdomain badges match bare hosts correctly, long patterns warn instead of
  truncating mid-segment, and URL parse failures show an explicit toast.
- **CSP report cleanup and bypass toggles now fail safely.** Clear All offers an
  undo action, and bypass switches only persist ON after the DNR rule update
  succeeds.
- **Built-in collection installs now survive dashboard reloads.** Script links
  installed from curated packs persist in a dedicated local map so built-in
  rows render as installed instead of re-offering Install.
- **Chain execution logs now render only in the matching chain editor.** Running
  one chain no longer appends output into a different chain's open log panel.
- **Script sharing batch export no longer clobbers duplicate names.** ZIP
  entries now get deterministic `-2` suffixes after sanitization, and oversized
  email shares copy concise instructions instead of opening a broken mailto URL.
- **Activity heatmap stats now match rendered activity.** Error-only days count
  toward streaks, repeated init reuses one tooltip, and script filters can show
  readable script names.
- **Gist token setup now defaults new PATs to session-only storage.**
  Fine-grained tokens are accepted without a false missing-scope warning when
  GitHub omits the classic OAuth scope header.
- **Template card icons no longer render raw HTML entities.** Built-in template
  icons now use runtime Unicode values, while saved/imported legacy entity icons
  migrate once and remain escaped in card markup.
- **Sandboxed editor Escape and cursor restore now respect Monaco state.** Escape
  no longer closes the editor while find/suggest/rename widgets are active, and
  cursor position restores only for the same script id.
- **Monaco editor tabs now preserve undo stacks across tab switches.** The
  sandbox keeps one Monaco model per open script and swaps models instead of
  resetting the active model value on every editor-tab activation.
- **JSON vault exports now round-trip stored values, folders, and workspaces.**
  JSON export/import uses the existing transfer options to preserve GM values
  plus vault organization state instead of behaving like a scripts-only dump.
- **v3 storage migration retries no longer clobber newer GM values.** Legacy
  `values_*` bags now skip any value keys already present in IndexedDB when the
  migration is retried before the schema marker is stamped.
- **Backup blob storage now cleans up unreferenced IndexedDB records.** Startup
  migration sweeps blobs missing from the `autoBackups` list, and failed
  metadata writes delete the newly stored blob before returning an error.
- **Install review is no longer exposed as a web-accessible resource.** Chrome
  and Firefox manifests now open `pages/install.html` only through extension
  navigation instead of a broad `<all_urls>` WAR match.
- **Chain URL, schedule, DOM event, and after-script triggers now execute.** The
  dashboard exposes trigger-specific inputs, saves refresh background alarms and
  content listeners, and the background runs matching chains through the
  `runScriptNow` path.
- **Large script bodies now store compressed in IndexedDB.** Script records over
  the storage threshold use gzip with per-record metadata, while reads still
  return plain `script.code` and existing raw rows remain compatible.
- **Install provenance review now binds declarations to explicit dependency
  URLs.** Interleaved `@require-provenance` and `@require-identity` directives
  map to the matching `@require` URL before legacy index fallback is considered.
- **Dashboard script reorder is keyboard-accessible and respects filtered views.**
  Script rows now expose Move up/down controls, and drag or button reorders are
  persisted from the visible table order instead of the unsorted backing array.
- **Dashboard fallback and generated UI snippets now follow the active theme.**
  The Monaco fallback textarea, snippet modal/toast/floating-panel helpers, and
  template download controls no longer force dark backgrounds in light mode.
- **GM_webRequest dynamic-rule IDs no longer depend on scriptId hashes.**
  New rules use a monotonic DNR ID pool seeded from persisted and live rule
  ownership, preventing colliding scripts from overwriting each other's ranges.
- **Popup and install review dynamic text now routes through runtime i18n.**
  Popup toasts, script action labels, site-lock feedback, install review
  sections, terminal states, dependency/provenance checks, and local AI review
  copy now use shared translation keys with safe English fallbacks.
- **Dashboard now has a premium workbench shell.** The scripts view adds a
  persistent navigation rail, refined command surfaces, a responsive
  table-and-inspector layout, and selection-aware trust/access details.
- **Dashboard mockup parity is tighter.** The scripts workbench now carries the
  premium rail, command bar, update queue, inspector metadata, and fixed status
  bar through the live dashboard and visual regression fixture.
- **Chrome host permissions are now scoped and optional.** The Chrome manifest
  uses optional HTTP(S) host grants, install review requests per-script run,
  dependency, update, and `@connect` origins from the install click, and
  universal host rules require explicit broad-access approval.
- **Light-theme status labels now keep readable contrast.** Dirty/error editor
  save states, Trash eyebrow text, info tags, and script health badges now have
  light-mode-specific ink and border colors instead of dark-surface literals.
- **Open editor tabs are reachable inside the full-screen editor.** The editor
  nav mirrors open script tabs with active and unsaved state so multi-tab users
  can switch scripts without leaving the overlay.
- **Install page startup now fails visibly instead of blanking.** Theme settings
  load failures fall back to dark mode, top-level init errors render the install
  error screen, missing-UI install errors are inserted into the page, and version
  comparison handles non-string metadata safely.
- **Side panel settings startup now degrades visibly.** A failed settings fetch
  falls back to default settings and shows an inline error notice, while fatal
  init failures surface through the existing restart/error affordances.
- **Popup run diagnostics now sort nameless scripts safely.** Diagnostics rows
  use the script ID fallback before `localeCompare`, matching the renderer and
  avoiding a misleading background-service error.
- **Non-dashboard surfaces now share theme-aware overlays.** Popup, side panel,
  install, and DevTools inline styles use shared overlay tokens plus current
  theme accent/info colors instead of dark-theme white/green/blue literals.
- **Import and error toasts are less noisy and more specific.** Multi-file imports
  now produce one aggregate result toast with shared Undo, and generic
  Failed/Deleted/Empty messages in nearby flows now name the action or input.
- **Editor panel failures no longer leave stale values visible.** GM storage
  load failures now replace the value list with an inline error, and autosave
  buffers flush when switching away from a dirty editor tab.
- **Optimistic dashboard actions now reconcile with backend failures.** Pin
  changes revert and show the backend error when settings persistence fails, and
  Duplicate saves dirty editor content before duplicating the source script.
- **Update checks no longer report failures as up to date.** The noninteractive
  update path now handles `{ error }` and malformed responses before the empty
  result branch, and surfaces update-apply failures.
- **Single-script deletes now use Trash-aware copy and recovery affordances.**
  Row, card, and editor deletes no longer claim Trash-enabled deletes are
  irreversible, and successful moves to Trash include an Open Trash action.
- **Dropped ZIP imports now match the import button safety path.** Dropping a ZIP
  prompts before overwriting matching scripts, records the archive source label,
  and exposes Undo when the background returns a restore receipt.
- **Script list load failures no longer look like an empty vault.** Dashboard
  startup now records `getScripts` failures, shows a retryable "Scripts
  unavailable" empty state, and toasts the background error.
- **Plain userscript file imports now show background rejection errors.**
  Importing a `.user.js` that fails validation, quota, or metadata checks now
  reports the filename and background error instead of silently continuing.
- **Autosave follows the latest Settings toggle.** The persistent editor change
  handler now reads `state.settings.autoSave` at edit time, so restore/import/sync
  reloads that replace the settings object no longer freeze autosave on or off.
- **Editor tabs recover when scripts vanish during reloads.** Backup restore,
  rollback, sync, and bulk import reloads now prune stale editor tabs and warn
  instead of leaving dead tabs in the editor overlay.
- **Stacked dashboard modals no longer leak focus traps.** Replacing content in
  an already-open modal shell now keeps the original trap and focus target
  instead of pushing another keydown handler.
- **Gamification streaks use local calendar days consistently.** Yesterday is
  now computed from local date components instead of UTC midnight math, so daily
  streaks do not reset for users west of UTC.
- **Dashboard inline status colors use defined theme tokens.** Sync health,
  cloud status, and Greasy Fork preflight errors now use
  `--accent-primary`/`--accent-error` instead of undefined aliases.
- **Monaco word-wrap toolbar state is accurate.** The adapter now tracks
  CodeMirror-compatible editor options locally, so word-wrap toggles and active
  indicators reflect the current Monaco setting.
- **Monaco Find and Replace toolbar actions now reach the editor.** The Monaco
  adapter forwards raw action IDs through `execCommand` while preserving the
  CodeMirror command aliases used by existing editor wiring.
- **Collection share links can be imported directly.** Collection import now
  accepts the `data:application/json;base64,...` links produced by Share and
  decodes them before manifest validation.
- **Gist import and sync no longer use truncated script content.** When GitHub
  marks a `.user.js` Gist file as truncated, import and linked sync now fetch
  the file's `raw_url` before parsing or updating local script code.
- **Chain editor step edits survive row rebuilds.** Script selections and delay
  edits now sync into the in-memory step model before Add, Remove, drag reorder,
  or Save rebuilds the pipeline rows.
- **ZIP storage imports sanitize GM value maps.** Imported `.storage.json`
  payloads now accept only object-shaped value maps and strip `__proto__`,
  `constructor`, and `prototype` before writing GM values.
- **Settings reset now participates in the serialized settings write chain.**
  `SettingsManager.reset()` queues behind in-flight `set()` calls and rolls
  back through the same chain, preventing a delayed write from resurrecting
  pre-reset settings after factory reset.
- **Encrypted cloud backups preserve the extension version string.** Sync
  encryption normalization now keeps non-empty string envelope versions, so
  E2EE cloud-backup payloads retain manifest-style versions like `3.17.0`
  instead of being rewritten to sync envelope version `1`.
- **Cloud backup remote object routing no longer masquerades as a setting.**
  Providers now accept an explicit per-call `objectName` for upload/download,
  cloud backup uses that option for `scriptvault-cloud-backup.json`, the stale
  `syncFilename` pseudo-setting is gone, and S3 path-style URL selection no
  longer carries an always-false branch.
- **Storage Bucket script deletes and clears preserve the recoverable side on
  cleanup failure.** Bucketed script deletion and bulk clears now remove
  script/stat/binding rows before best-effort GM value cleanup, so a
  values-bucket failure can leave orphaned values but no longer leaves
  surviving scripts with their values lost.
- **Sync tombstone cleanup now waits for deletion propagation.** Quota cleanup
  prunes aged tombstones only after their deletion timestamp is older than the
  last successful sync, so rarely synced devices cannot resurrect deleted
  scripts after another device performs storage cleanup.
- **DevTools HAR exports preserve response MIME types case-insensitively.**
  The network export now reads `Content-Type`, `content-type`, and equivalent
  header casing before falling back to `text/plain`.
- **Sandboxed Monaco language workers now start without origin errors.** The
  editor sandbox supplies same-origin blob bootstrap workers that import the
  packaged Monaco worker files, and the editor smoke now fails if those worker
  construction errors return.
- **Script storage reads no longer expose live cache records.** `ScriptStorage`
  now clones script records at init, read, search, namespace, and set
  boundaries, and reorder persists cloned updates before touching cache, so
  caller-side mutations cannot leave cache serving unpersisted script state
  after a failed write.
- **EasyCloud sync now runs through one sync engine at a time.** Cloud Sync now
  delegates `syncProvider='easycloud'` to EasyCloud's native sync path instead
  of calling its provider `download()` and `upload()` shims, and both engines
  share a runtime sync lock so scheduled EasyCloud work cannot overlap a
  provider-backed Cloud Sync write.
- **Cloud sync uploads use remote write preconditions.** WebDAV, Google Drive,
  Dropbox, OneDrive, and S3 uploads now carry provider validators
  (`If-Match`/`If-None-Match`, Dropbox rev update/add modes, or signed S3
  conditions) so simultaneous devices cannot silently overwrite a newer remote
  sync envelope.
- **Sync timeouts now cancel provider I/O.** WebDAV, Google Drive, Dropbox,
  OneDrive, and S3 sync upload/download paths now honor the Cloud Sync abort
  signal, and Cloud Sync re-checks the signal before locked local writes so a
  timed-out sync cannot keep mutating storage after `_syncInProgress` clears.
- **Sync apply loops share the per-script operation lock.** Cloud Sync and Easy
  Cloud now acquire the same per-script lock used by save/toggle/delete before
  applying remote script writes or sync tombstone deletes, preventing a sync
  merge computed from stale state from overwriting a concurrent editor change.
- **Easy Cloud sync now reacts to real script changes.** Core script save,
  create, update, delete, restore, toggle, import, duplicate, rollback, and
  per-script settings paths now notify Easy Cloud after successful persistence,
  so debounced sync and the offline queue are driven from IndexedDB-backed
  mutations instead of the obsolete `userscripts` storage key.
- **Easy Cloud establishes the E2EE downgrade latch.** Easy Cloud now marks
  sync encryption as established after successfully reading or uploading an
  encrypted envelope, matching Cloud Sync's plaintext-downgrade protection.
- **Cloud sync preserves newer local GM value bundles.** When remote value
  bundles are skipped because local values already exist, upload now keeps a
  non-empty local bundle if its `lastValueUpdatedAt` is newer than the remote
  bundle instead of pinning the cloud copy to stale remote values.
- **Update confirmation View diff now stays open.** The update confirmation
  loop now waits for the version diff modal to close before re-asking whether
  to install, so the diff view is no longer overwritten in the same tick.
- **Sync no longer lets metadata-only changes overwrite one-sided code edits.**
  Cloud Sync and Easy Cloud now compare each side against the recorded
  `syncBaseCode` before falling back to timestamp freshness, so a newer toggle,
  position, or settings-only change on one device cannot revert the only code
  edit from another device.
- **Easy Cloud sync received the merge fixes.** The Easy Cloud provider now has
  the same protections as the WebDAV/Drive/etc. sync path: a restored-from-trash
  script newer than its tombstone is no longer re-deleted, clean 3-way merges
  are no longer discarded when the local timestamp wins, the 3-way base uses the
  local device's ancestor (not the remote's), and tombstone removals persist
  locally instead of only tombstone additions.
- **Cloud backup no longer clobbers the sync envelope.** The scheduled cloud
  backup and cloud sync both wrote to `scriptvault-backup.json`, so each
  overwrote the other and the next sync download read a backup envelope (and,
  under E2EE, hard-failed on the plaintext). Cloud backups now upload to a
  distinct `scriptvault-cloud-backup.json` on every provider, and the backup
  envelope is encrypted with the sync passphrase when E2EE is enabled so it
  can't leak plaintext script code/GM values to the cloud.
- **SettingsManager.set lost-update race.** Concurrent settings writes (e.g. a
  sync-end `lastSync` write racing an OAuth-token persist or a dashboard save)
  each snapshotted the cache at call time and then awaited storage, so the
  second write silently erased the first — capable of dropping a freshly
  refreshed OAuth token. Writes are now serialized through a chain so each
  derives from the previous committed state.

### Added
- **Dashboard telemetry now feeds secondary surfaces.** Dashboard actions and
  background execution data now publish into a shared event bus that updates the
  debugger console/error timeline, CSP reports, activity heatmap, achievements,
  and Gist auto-sync hooks.
- **Backup blobs are gzip-compressed.** Scheduled/manual backup ZIP blobs stored
  in IndexedDB are now transparently gzip-compressed (Compression Streams API),
  cutting the storage footprint of large backups. Reads are backward-compatible:
  pre-compression records are read as-is, new records are decompressed
  transparently.
- **"Only on This Site" one-click scope.** The popup script menu can now
  restrict a script to the current site in one click (replaces its `@match`
  with a single `*://host/*` pattern and re-registers). The dashboard's
  per-script User Matches editor now validates `@match`/`@exclude` patterns and
  rejects malformed ones instead of silently storing a pattern that never
  matches.
- **Scam / crypto-drain detection.** The static analyzer now has a `scam`
  category that flags wallet seed/private-key access, wallet-drainer keywords,
  and wallet transaction/signature requests, and raises a high-severity
  "possible credential/wallet exfiltration" finding when a script both
  references wallet secrets (or drainer operations) and sends data off-page.
  Benign wallet-adjacent scripts (reading `window.ethereum`, requesting
  accounts) are not flagged. Runs in both the AST and regex analysis paths.

### Security
- **Page-visible bridge events no longer carry GM response bodies.**
  `GM_xmlhttpRequest`, `GM_webSocket`, and GM value-change listeners now keep
  sensitive payloads on the direct extension messaging path and redact the
  `window.postMessage` bridge that is visible to the host page's MAIN world.
- **Subresource Integrity "Require" mode is now enforced.** The Security →
  Subresource Integrity setting always had a "Require" option, but it was never
  wired to anything. It now refuses to run any remote `@require`/`@resource`
  that carries no verifiable SRI hash (`#sha256=`/`sha384`/`sha512`); npm specs
  (computed SRI) and hash/TOFU-pinned requires are unaffected. The install/update
  review flags every un-pinned dependency as "unverified remote code" regardless
  of mode, so the risk is visible before install. Enforcement applies to
  execution only — install/update provenance previews still inspect the
  dependency via an `allowUnpinned` probe path.

## [v3.16.0] — Deep audit: security, data-safety, and correctness (2026-07-02)

### Security
- **GM network/resource/menu/notification handlers now bind to the authenticated
  caller.** GM_xmlhttpRequest/GM_webSocket/GM_download, GM_getResourceText/URL,
  GM_loadScript, and menu register/unregister keyed their @connect / @resource
  authorization off the caller-supplied `data.scriptId`. A userscript could forge
  another installed script's id to borrow its @connect allowlist or read its
  @resource bodies, defeating the install-time @connect disclosure. All now use
  Chrome's unspoofable `sender.userScriptId` when present (matching the GM
  value/cookie/webRequest handlers); notification update/close reject
  cross-script ids.
- **Attribute-injection XSS in dashboard modules.** The depgraph/snippets/
  templates/csp/sharing/gamification escapers used `textContent`→`innerHTML`,
  which does not escape quotes, so a `@require` value like `x" onmouseover=...`
  broke out of the dependency-graph `title=""` and ran in the privileged
  extension page. All local escapers now escape `"` and `'`.

### Fixed — data safety
- **Cloud sync permanently re-deleted restored-from-trash scripts.** The
  tombstone-resurrection guard checked `merged.scripts`, but `mergeData()` had
  already filtered every tombstoned id out of it, so the guard was dead code and
  a restored script (newer than its tombstone) was re-deleted on the next sync.
  Now looks the candidate up in the unfiltered local/remote union, drops the
  tombstone, and re-includes the script; also persists the local tombstone set
  on any change, not only growth.
- **Trash restore could lose a script on a service-worker crash** — it emptied
  the trash entry before persisting the script. Persist first now (worst case is
  a harmless idempotent duplicate).
- **Backup restore wiped per-script settings.** The ZIP import path (used by
  restore) built records from an empty settings base, discarding userMatches/
  userIncludes/userExcludes, notes, tags, pinned, runAt override, and syncValues
  of installed scripts. It now bases on the existing settings; JSON overwrite
  also preserves the original createdAt/position.

### Fixed — correctness
- **Chrome misdetected as Firefox.** `_isFirefoxRuntime()` treated the
  `browser`→`chrome` MV3-compat alias as Firefox, so Chrome showed Firefox
  userScripts setup instructions AND disabled per-script worldId isolation on
  Chrome 133+. Now detects Firefox by user agent only.
- **Editor swallowed a keystroke** after re-activating a same-content tab (the
  change-suppression latch was armed for a no-op `setValue`).
- **Editor cursor readout was frozen at "Ln 1, Col 1"** under Monaco
  (`getCursor()` returned a hardcoded stub); it now reports the real position.
- **New Script / Duplicate / New Folder** now surface the background's resolved
  `{ error }` instead of silently doing nothing.
- **Storage stat and quota bar** measure usage and quota from the same
  `navigator.storage.estimate()` (scripts live in IndexedDB), so the bar no
  longer reads ~0% and the >85% warning works.
- **Find Scripts pagination** ("Next") never appeared because it required 50
  results but pages are 25; it now tracks the real per-source page size.
- **Doubled/space-prefixed toolbar labels** from the i18n text-target map, and a
  deep link to a since-deleted script now clears the stale hash with a toast.
- **Debounced autosave** no longer writes the wrong script after a tab switch.

### Notes
- Editor undo-history methods are now explicit adapter stubs (per-tab Monaco
  undo is a roadmap item) instead of throwing and being silently swallowed.
- ~13 additional verified findings (Easy Cloud merge parity, cloud-backup
  envelope collision, SettingsManager write race, provenance-pairing, migration
  and backup-blob edge cases) are tracked in ROADMAP.md under Deep Audit Findings.

## [v3.15.1] — Editor screen repair and redesign (2026-07-02)

### Fixed
- **Editor was unusable in v3.15.0.** The full-screen overlay shipped at
  `z-index: 50` while the sticky dashboard header is `z-index: 100` — the
  inert header painted over the editor's Save/Close row and tabs, so nothing
  in the top band was visible or clickable. The overlay now stacks at 200
  (above all sticky page chrome, below modals at 300). A new
  `npm run smoke:editor` harness opens the real editor in headless Chromium,
  hit-tests all 14 controls with `document.elementFromPoint`, verifies the
  code pane share of the viewport, screenshots it, and clicks Close.
- **`hidden` editor buttons never hid.** `display: inline-flex` /
  `display: flex` author rules on editor action and toolbar buttons defeat
  the UA `[hidden]` style — Preview CSS showed on JS scripts and the
  bind-file buttons always rendered. Explicit `[hidden] { display: none; }`
  rules restore the contract.

### Changed
- **Editor nav redesigned into a single band.** Panel tabs (Code/Settings/
  Externals/Storage/Info) sit left; the editor tools are icon-only (labels
  stay in the accessibility tree, tooltips on hover) on the right. A legacy
  `dashboard.css` rule that right-aligned the tabs is gone. With the header
  row, editor chrome is now 2 slim rows; the code pane takes ~91% of the
  viewport at 1440x900.

## [v3.15.0] — Script Store removal, full-screen editor, UX pass (2026-07-02)

### Removed
- **Script Store tab removed entirely.** The multi-source discovery tab
  (`pages/dashboard-store.js`, ~2,100 lines, eagerly loaded on every dashboard
  open) is gone: tab button, panel, lazy-loader wiring, command-palette entry,
  i18n keys (`tabStore`, `loadingScriptStore` across 9 locales), and its test
  surface. Script discovery remains available through the lighter Find Scripts
  dialog (GreasyFork/OpenUserJS search from the toolbar, popup, and side
  panel), Collections, and Gist import.

### Changed
- **Full-screen script editor.** The editor overlay now covers the entire
  viewport (the dashboard header is inert behind the modal anyway), the hero
  header collapses to a slim single row (eyebrow chip and subtitle hidden;
  the metadata summary moves to the title tooltip), and the panel-tab and
  toolbar rows are tightened — the code pane gains roughly 150-200px.
- **New Script opens the editor directly.** The template-picker modal is
  removed; New Script creates a blank script and jumps straight into the
  editor. Starter templates remain in the editor's template manager.

### Fixed
- **Dashboard storage quota bar uses the real quota.** `updateStats()` divided
  usage by a hardcoded 10 MB `chrome.storage.local` cap even though the
  manifest declares `unlimitedStorage`, falsely toasting "Storage at 100%
  capacity" on installs with backup blobs present. The quota bar and warning
  now use the background QuotaManager's `navigator.storage.estimate()` quota
  via `getStorageUsage`, with 10 MB kept only as a messaging fallback.
- **Doubled navigation labels.** The dashboard tab buttons rendered their
  label twice ("Installed UserscriptsInstalled Userscripts") because the
  i18n text-target pass appended a second text node to buttons whose label
  lives in a `data-i18n` span. `setLabelPreservingDecor` now skips elements
  with a `[data-i18n]` child, and the redundant tab entries were dropped.
- **Theme switches no longer show a success toast** (theme editor apply and
  the Layout/editor-theme settings) — the visible change is the feedback.
- **Stray empty pill in the header.** The open-script-editors tab group kept
  its padded, bordered shell when no editors were open; it is now hidden
  until a tab exists.
- **RTL direction bootstrap actually runs.** Five extension pages set
  `document.documentElement.dir` from an inline script that MV3 CSP has
  always blocked (dead code + console errors on every page load). Moved to
  the external `pages/page-dir.js`; the dashboard smoke is console-clean.

## [v3.14.0] — Merge-engine restore + deep audit pass (2026-07-02)

### Fixed
- **Cloud-sync 3-way merge is functional again.** The merge engine called
  `Diff.merge(...)`, an API jsdiff removed in v7 — so every concurrent-edit
  merge threw, fell back to conflict markers, was discarded, and sync silently
  dropped to last-write-wins (defeating the merge-gate fix landed on
  2026-07-01). Reimplemented the 3-way merge on jsdiff v7 primitives
  (`structuredPatch` + `applyPatch`): remote's base-relative changes are applied
  onto the local text, non-overlapping edits merge, and overlapping edits
  surface conflict markers. Fixed in both the Chrome offscreen path
  (`offscreen.js`) and the Firefox inline path (`src/bg/analyzer.ts`, whose
  `getDiff` guard also required the removed `merge`). Added a behavioral test
  that runs the real diff bundle and asserts both sides' edits survive.
- **Backup storage-full warning restored.** `_estimateBackupSize` summed the
  `data` field, which has been stripped since v3.12 moved backup blobs to
  IndexedDB, so the 8 MB warning could never fire; it now sums the recorded
  byte `size`.
- **Dependency graph no longer repaints while idle.** The canvas animation loop
  called `render()` every frame (~60fps) even after the force layout settled,
  wasting CPU/GPU/battery whenever the graph was open; it now repaints only
  while animating or when an interaction changes the view.
- **Removed a dead debugger live-reload message.** The debugger sent a
  `type: 'ScriptDebugger'`/`reloadTabs` message with no router handler on save;
  live-reload is already handled by the background save path, so the dead
  message is removed and the toggle's `sendMessage` now swallows rejections.
- **Bounded the notification error-count map.** Scripts that errored once or
  twice and were then deleted left keys in `notifErrorCounts` forever; the map
  is now capped (below-threshold entries pruned past 500 keys).
- **Removed dead lint fix-preview code.** The `_computeDiff` "collapse
  unchanged regions" loop copied every op without eliding anything; removed
  (real hunk collapsing tracked on the roadmap).

- **Large-file diff no longer produces all-delete garbage.** The hash-based
  diff fallback used for very large scripts (LCS-guarded above ~5M line pairs)
  never resynchronized after a divergence, so one inserted line rendered every
  following line as delete+add — and fed a corrupt merge in the diff viewer. It
  now resyncs on the next matching line (dashboard-diff and dashboard-linter).
- **Standalone install-page export polish.** Replaced the exported page's fake,
  non-scannable "QR code" (an admitted hash-pattern) with a working "Copy Page
  Link" button, and made the bookmarklet minifier string/regex-safe (it now
  strips only whole-line comments instead of regex-stripping `//` and `/* */`
  sequences, which could corrupt code containing those inside strings/regex).

### Security
- **Event-log CSV export defangs formula injection.** `EventLog.exportCSV` now
  prefixes cells beginning with `= + - @` or control chars with `'` (matching
  the error-log export), so a script `@name` like `=HYPERLINK(...)` can't
  execute when the exported CSV is opened in a spreadsheet (CWE-1236).

## [v3.12.0] — Deep audit hardening pass (2026-07-01)

### Fixed
- **Table cells no longer stripped (regression from the Firefox-lint pass).**
  `safeSetHtml`/`htmlToFragment` used a bare `document.createRange()`, which
  parses in document context and silently drops `<td>`/`<tr>`/`<option>`
  fragments. This broke the DevTools network and execution tables and the
  dashboard script table. All 26 helper copies now anchor the parse range in
  the target element via `selectNodeContents`.
- **GM value isolation.** `GM_getValue`/`setValue`/`deleteValue`/`getValues`/
  `setValues`/`deleteValues` now bind to the authenticated `sender.userScriptId`
  when present, so a script can no longer read or overwrite another script's
  stored values by passing a forged `scriptId`.
- **Script chains executed nothing.** Steps sent a non-existent `executeScript`
  action and the step dropdowns read a legacy pre-IndexedDB storage key. Steps
  now run via `runScriptNow`, the list loads via `getScripts`, and failed steps
  reject so the retry error-mode engages.
- **Context-menu scripts ran in the extension ISOLATED world.** `@run-at
  context-menu` execution now goes through the shared USER_SCRIPT-world helper,
  matching page-load, `@crontab`, and run-now injection.
- **Cloud sync 3-way merge was dead-gated to last-write-wins.** The concurrent-
  edit check compared the pre-sync snapshot against `existing` (always equal),
  so genuine concurrent edits silently overwrote. The gate now compares against
  the recorded sync base and uses `existing.code` as the local merge side; a
  clean merge is saved even when the local timestamp wins.
- **Restored scripts were re-deleted by remote tombstones.** A script saved
  after its tombstone (restore-from-trash, ID-preserving import) now wins over
  the tombstone during sync.
- **Theme Editor section headers rendered blank** (`el()` `html` key went to
  `setAttribute`; corrected to `innerHTML`).
- **Collections search lost focus after each keystroke** and force-lowercased
  the field; per-row Install targeted the wrong script when entries lacked a
  Greasy Fork ID; URL-based imported entries could not install.
- **Card view Select button could not unselect** (stale build-time closure).
- **Activity heatmap and achievement streaks used UTC date keys**, zeroing the
  current streak in most timezones; both now key on the local date.
- **High-contrast mode was unreadable on the light theme** (light text on light
  background); the light theme now gets dark-on-light high-contrast tokens.
- **DevTools panel ignored the user's theme** (locked to dark) and always
  appended an ellipsis to the detail title even for short URLs.
- **Shipped `ui-floating-panel` snippet was a SyntaxError** (duplicate `const
  header`); also detaches its drag listeners on close.
- **Popup toggle-failure path threw a ReferenceError** (`updateLocalScriptState`
  was undefined in the popup), leaving the checkbox in the wrong state.
- **Store card rating was interpolated unescaped** (GitHub `stargazers_count`
  path); now escaped.
- **"Don't show again" in the What's New dialog now persists.**
- **Packaged builds omitted page-loaded modules.** `build.sh`, `build-firefox.sh`,
  and `build-edge.mjs` now ship `modules/i18n.js`, `modules/script-config.js`,
  and `modules/user-scripts-setup.js` (loaded by popup/dashboard/install/etc.);
  the Edge include list also ships `managed-storage-schema.json`.
- **Sync KDF iteration count is now capped on decrypt** so a crafted envelope
  can't stall the service worker in PBKDF2.
- Script Chains header/empty-state icon corrected from ⚾ to ⛓.

### Changed
- `tests/utils.test.js`, `versions.test.js`, and `parser.test.js` now import the
  production TypeScript sources instead of re-implementing `escapeHtml`,
  `compareVersions`, and `parseUserscript` (they had drifted).

## [v3.13.0] — Roadmap drain: scheduler, diagnostics, and hardening (2026-07-02)

### Added
- **"Why aren't my scripts running?" per-tab diagnostic.** A new popup panel
  reports, for every installed script against the current page, whether it runs
  and a plain-language reason if not — disabled, no @match, page excluded, user
  scripts turned off (Chrome 138+ toggle), ScriptVault paused, registration
  error, not registered, or a non-page run mode (context-menu/@crontab/
  @background). Turns the top userscript-manager support question into an
  inspectable answer.

### Security
- **Sync encryption downgrade guard.** Once a profile has completed an encrypted
  sync round-trip, a plaintext remote envelope is now rejected instead of loaded,
  closing a hole where an attacker with write access to the storage backend could
  replace the encrypted blob with attacker-authored plaintext scripts. The
  one-time plaintext→encrypted migration is still allowed before encryption is
  established, and disabling encryption resets the latch.

### Changed
- **Install page theme is now driven by the shared token file.** The install
  page defined its own parallel per-theme CSS variable blocks; it now aliases
  the canonical `--sv-*` tokens from `theme-tokens.css` (with `color-mix` for
  derived tints), so a theme change lives in one place instead of two.
- **Script chain editor only offers the Manual trigger.** URL Match / Schedule /
  DOM Event / After Script triggers were selectable but no engine ran them, so
  chains configured with them silently never fired. The editor now offers only
  the working Manual trigger (a trigger engine is tracked on the roadmap);
  existing chains still show their saved trigger badge.

### Fixed
- **Removed dead/misadvertised keyboard shortcuts.** The README listed a
  Ctrl+Tab "cycle tabs" shortcut that Chrome reserves (the handler never fired),
  and the dashboard's toolbar Tab-cycling queried selectors that matched no
  element. Both the dead handlers and the misleading README/help entries are
  removed.
- **Install page now parses `@require-provenance` / `@require-identity`.** The
  install review's Sigstore provenance row always showed "Not declared" because
  the page's local metadata parser dropped the hyphenated directives; it now
  maps them to the camelCase fields the preview reads, so declared provenance
  bundles are actually verified before install.
- **The "Key Mapping: Vim" setting now works.** Choosing Vim persisted the
  setting but nothing consumed it; it now enables KeyboardNav's vim keybindings
  on load and on change.
- **QR share codes are no longer corrupt for payloads of 107-271 bytes.** The
  QR encoder's version table stored per-block data codewords instead of the
  total for multi-block versions (V6-V10), truncating the bit stream and leaving
  most of the symbol blank — and it never emitted the version-information
  modules that V7+ requires. Both are fixed, so shared scripts (typically base64
  data URLs in this size range) now produce scannable codes.
- **Keyboard navigation no longer hijacks focused row controls.** Pressing
  Enter/Space/Delete (or the vim action keys) while a row's action button,
  toggle, or link had focus triggered the row-level action instead of the
  focused control; the control now activates natively, and list navigation is
  suppressed while a modal is open (WCAG 2.1.1).
- **Theme Editor "Apply Theme" now persists across reloads and no longer
  corrupts the layout setting.** Applied custom themes and the extra presets
  (Nord/Dracula/Solarized/Monokai/Gruvbox) are stored as a CSS-variable
  override that the dashboard re-applies on load, instead of reverting to the
  base theme. Only the four real layouts (dark/light/catppuccin/oled) are
  written to `settings.layout`; the extra preset keys — which have no CSS block
  and previously fell back to dark and blanked the Layout select — are no longer
  stored as layouts, and the layout setting is now validated.
- **Monaco editor Ctrl+S / Escape now work.** The editor sandbox's save/close
  keybindings posted to handlers that were out of scope (and a dead
  `[data-action="save"]` selector), so the advertised "Press Ctrl+S to save"
  did nothing. Save/close now route through the exposed dashboard UI bridge
  with the real `#btnEditorSave` / `#btnEditorClose` buttons as fallback.
- **Script scheduler now actually enforces schedules.** The dashboard scheduler
  saved schedules and created `sv_sched_` alarms, but the background never
  fired them and no guard gated execution. The background now: fires
  interval/one-time schedules on their alarm (running the script on matching
  open tabs, with one-time schedules disabling themselves after), skips
  page-load registration for interval/one-time schedules (alarm-only, like
  `@crontab`), and injects a runtime guard so time/day/date-range schedules
  only execute inside their window. Date-range comparisons now use the local
  calendar date instead of UTC. Saving a schedule reregisters the script so the
  guard/alarm applies immediately.

### 2026-07-01 - Deep engineering audit

- **Fixed resetScriptSettings not re-registering scripts.** Clearing
  execution-affecting settings (runAt, frameMode, userMatches, etc.) now
  triggers re-registration, matching the setScriptSettings behavior.
- **Fixed rollbackScript race condition.** The handler now wraps in
  `_runExclusiveScriptOperation` to prevent concurrent toggle/save
  operations from corrupting version history.
- **Fixed setScriptSettings registration gap.** Uses `reregisterScript`
  instead of the two-step unregister+register, eliminating the brief
  unregistered window on Chrome 138+ where `userScripts.update()` is
  available.
- **Added createScript size validation.** The handler now enforces the
  5 MB `MAX_SCRIPT_SIZE` limit matching saveScript and importScript.
- **Fixed switchProfile cache mutation.** Profile switches now clone
  scripts before persisting to avoid corrupting ScriptStorage cache
  when the IDB write fails.
- **Added WebSocket connection cap.** The GM_webSocket map is now
  capped at 500 entries, matching other GM API map limits.
- **Fixed Chrome build missing managed-storage-schema.json.** The
  managed storage schema for enterprise policy provisioning was
  referenced by `manifest.json` but missing from the CWS package.
- **Fixed dependency graph theme hardcoding.** Canvas rendering now
  resolves colors from CSS custom properties instead of hardcoded hex
  values, so the graph renders correctly across all four themes.
- **Fixed card view badge theme colors.** Remote and local badges now
  use theme-aware CSS variables instead of hardcoded light-blue/gray.
- **Added regex pattern length guard.** Dashboard URL pattern testing
  now rejects regex patterns longer than 1000 characters to mitigate
  ReDoS from user-authored patterns with catastrophic backtracking.
- **Fixed test mocks.** `chrome.alarms.create/clear` and
  `chrome.contextMenus.removeAll` mocks now return Promises matching
  real MV3 API behavior.

### 2026-06-28 - Patch dependency refresh

- **Refreshed routine dev-tool patch drift.** Updated Playwright Test,
  Chrome extension types, the exact-pinned Chrome Web Store upload CLI, jsdom,
  and TypeScript to the current patch releases.
- **Kept release-trust guardrails aligned.** The CWS publish-tooling gate now
  pins the reviewed `chrome-webstore-upload-cli` 4.0.1 tarball and integrity.
- **Closed the P2 dependency-drift roadmap row.**

### 2026-06-28 - Firefox AMO lint warning reduction

- **Reduced Firefox AMO lint noise from 148 reviewed warnings to 59.**
  Dashboard, popup, install, devtools, and module HTML sinks now route through
  fragment replacement helpers instead of raw `innerHTML` assignment.
- **Ratcheted the Firefox warning gate.** `npm run firefox:warnings` now fails
  above 80 reviewed warnings and records reviewer-ready rationale for the
  remaining `web-ext` warning classes.
- **Closed the P1 Firefox lint-warning roadmap row.**

### 2026-06-28 - Public release check hardening

- **Removed the GitHub CLI dependency from public release verification.**
  `npm run release:check:public` now checks the public GitHub release page,
  latest-release redirect, and Chrome ZIP download URL with `fetch` instead
  of `gh release view/list`.
- **Separated network and signing failures.** The public checker now reports
  missing assets, latest-release drift, and public network failures separately
  from local tag-signature failures; the current public failure is only the
  known unsigned legacy `v3.11.0` tag.
- **Closed the P1 public-release verification roadmap row.**

### 2026-06-28 - Local-only release gate

- **Removed the resurrected GitHub Actions workflow surface.** The checked-in
  workflow and action-pin gate are gone; `npm run check` now runs
  `local-build-policy:check`, which fails if `.github/workflows/` files return.
- **Retargeted release checks to local evidence.** CWS tooling, remote-code,
  store-status, toolchain, CRA, Firefox, and accessibility tests now assert
  package/runbook wiring instead of reading workflow YAML.
- **Aligned release documentation with local artifacts.** README support
  matrix copy now describes local Chrome, Firefox, and Edge artifact creation;
  ignored internal runbooks were updated with the same local-only release path.
- **Closed the P0 remote-CI roadmap row and the related P2 docs row.**

### 2026-06-28 - IndexedDB storage bucket partitioning

- **Partitioned persistence by storage family.** Script records/stats/local
  bindings, GM value bags, and backup blobs now route through separate
  Storage Bucket-backed IndexedDB factories when `navigator.storageBuckets`
  is available, while browsers without the API keep the legacy single-DB
  fallback.
- **Exposed backup blob persistence in the runtime bundle.** `BackupsDAO` is
  now exported from the generated storage runtime so the backup scheduler can
  use the backup partition instead of silently falling back to
  `chrome.storage.local` blob storage.
- **Extended performance and regression coverage.** Storage bucket tests pin
  bucket feature detection, fallback schema creation, delete cleanup, backup
  restore-style overwrites, and sync merge-style value writes. The large
  library harness now measures concurrent 1k-script script/value/backup write
  throughput and reported a 1.03x bucketed improvement on the final local run.
- **Closed the RD-7 roadmap row.** README and large-library performance docs
  now describe the bucketed IndexedDB behavior and fallback contract.

### 2026-06-28 - Monaco 0.55.1 upgrade

- **Upgraded the packaged Monaco ESM editor to 0.55.1.** The local ESM bundle
  now pins the top-level `lsp` and `typescript` namespace contract, uses the
  renamed `EditorAutoClosingEditStrategy` type surface, and keeps Firefox
  textarea-first packaging unchanged.
- **Added local GM API declaration loading.** The editor sandbox fetches
  packaged `lib/scriptvault.d.ts` and registers it through
  `typescript.javascriptDefaults.addExtraLib()` so GM API completions can use
  generated ScriptVault declarations without remote assets.
- **Refreshed bundle evidence and budgets.** The Monaco ESM audit now records
  27.7 MB uncompressed / 4.70 MB gzip output, raises only the reviewed
  uncompressed limits, and keeps the 5 MB gzip ceiling. Monaco's DOMPurify
  dependency is overridden to 3.4.11 so npm audit remains clean.
- **Closed the RD-11 roadmap row.** README and migration-plan docs now describe
  the declaration-backed IntelliSense path and 0.55.1 packaging constraints.

### 2026-06-28 - Roadmap blocked hygiene

- **Moved L-6 Sigstore keyless author signing to blocked.** The verifier/parser
  groundwork remains shipped, but author keyless signing needs an OIDC
  issuer/client strategy, browser auth flow, signer-identity policy, and CWS
  review copy before Fulcio/Rekor signing can be implemented safely.

### 2026-06-28 - Browser visual regression gate

- **Added a Vitest Browser Mode screenshot gate.** `npm run test:visual`
  now launches Chromium through the Playwright provider, renders a stable
  dashboard list-view shell with shipped theme/dashboard CSS, and compares it
  against a checked-in screenshot baseline.
- **Kept visual regression separate from the unit suite.** The default Vitest
  config excludes `tests/visual/**`, while a normal-suite contract test pins
  the visual command, loopback browser server binding, Chromium provider, and
  baseline coverage.
- **Closed the L-7 roadmap row.** Visual regression testing is now actionable
  through local tooling and documented in the README quality/project-structure
  sections.

### 2026-06-27 - CloudSync runtime extraction

- **Promoted CloudSync orchestration into a generated runtime module.**
  `modules/cloud-sync.js` is now generated from `src/background/cloud-sync.ts`
  and loaded before the raw core bridge. Sync download/upload calls now carry
  an abort signal through the 90-second alarm timeout path, the runtime drift
  gate tracks 41 promoted artifacts, and sync cockpit/source parity tests now
  pin the new module boundary.
- **Fixed a slow chain test harness.** The dashboard chains unit test now
  supports callback-style `chrome.runtime.sendMessage`, matching the runtime
  API and avoiding a 30-second timeout path in the full suite.
- **Closed the RD-6 extraction roadmap row.** ResponseMap coverage, the typed
  router action table, extracted GM handler dispatch, and standalone CloudSync
  orchestration are now all pinned by tests and generated artifacts.

### 2026-06-26 — GM_webSocket bridge

- **Added `GM_webSocket` for userscripts.** Connections are owned by the
  background service worker, enforce script grants, `@connect`, and
  internal-host guards before dialing, expose a WebSocket-like handle with
  send/close/abort and event listeners, and are documented in install
  permission copy plus generated TypeScript declarations.

### 2026-06-26 — Coverage threshold ratchet

- **Raised the Vitest coverage gate to the v3.12 Phase 1 thresholds.**
  Coverage now requires 45% lines, 48% functions, 32% branches, and 42%
  statements. Runtime/source parity tests now cover shipped XHR,
  script-config, subscription, and sync-crypto modules with V8-visible
  filenames, and the ts-runtime generator contract runs in Node so esbuild
  remains stable under coverage.

### 2026-06-26 — Dashboard setup i18n coverage

- **Extended runtime dashboard translations to first-run setup and Settings General controls.**
  The skip link, Chrome userScripts setup warning, setup action buttons, and
  dismiss control now use the shared `modules/i18n.js` DOM translation path.
  General, appearance, menu, search, update, externals, sync, editor, security,
  runtime-host-permission, BlackCheck, downloads, experimental, reset,
  empty-state settings, and Utilities export/cloud/backup schedule labels,
  select options, checkbox text, placeholders, aria labels, helper tooltips,
  status text, and action buttons are also wired through the same runtime
  dictionary. Utilities backup browser, import, subscription, workspace,
  diagnostics, support snapshot, Public API trust, signing trust, and activity
  log surfaces now share the same coverage. Trash recovery and Script Store
  loading states now use the same runtime dictionary path, and the Help panel
  hero, filters, quick actions, operational notes, shortcuts, reference copy,
  pattern tester, about stats, and empty state are keyed as well. The dashboard
  title, scripts toolbar filters and counters, editor overlay, editor info,
  storage, per-script settings, external resources, Find Userscripts modal,
  progress modal, and editor runtime feedback now use the shared runtime
  dictionary too. Strict locale key drift remains clean.
- **Extended the active runtime dictionary to non-dashboard extension pages.**
  Popup, side panel, install, DevTools launcher, and DevTools panel shell
  controls now load `modules/i18n.js`; popup, side-panel, and DevTools runtime
  empty states, action labels, status messages, and export feedback are keyed
  through the shared dictionary.

### 2026-06-26 — UI state polish and diagnostic feedback

- **Refined settings, side panel, and DevTools state feedback.** Dashboard
  settings now promote field labels into accessible control labels and mark
  sections with visible invalid-state treatment when a nested field fails
  validation. The side panel uses consistent SVG icon controls in the compact
  header/footer while preserving dynamic labels, and the DevTools panel now
  reports refresh/export success and failure states inline instead of only
  logging them.

### 2026-06-25 — Session-only credential storage

- **Added no-at-rest credential mode for sync providers and Gist tokens.**
  Sync provider secrets, provider metadata, sync encryption passphrases, and
  GitHub Gist PATs can now stay in `chrome.storage.session` with an in-memory
  fallback when the API is unavailable. Persistent settings are scrubbed,
  reconnect state is explicit after restart, and disconnect clears session and
  persistent copies.

### 2026-06-25 — Draft UserCSS live preview

- **Added temporary UserCSS draft preview from the dashboard editor.**
  UserStyle drafts can be previewed on the active eligible tab without saving
  or writing style storage. Preview CSS is replaced as the draft changes and
  cleared on save, disable, tab switch, close, or navigation.

### 2026-06-15 — Redacted trusted-extension evidence in support snapshots

- **Added aggregate trusted-extension evidence to support snapshots.**
  When Public API permissions are included, the snapshot now reports
  `trustedExtensionCount` and `untrustedExtensionDenials` (count +
  last-denied timestamp) without exposing raw extension IDs. Three
  test cases verify the aggregate-only evidence boundary.

### 2026-06-15 — Service worker fetch abort safety

- **Replaced the 5-minute background task safety timer with `chrome.alarms`.**
  The mutual-exclusion safety timer for auto-update/sync/subscription tasks
  previously used `setTimeout`, which is lost if the MV3 service worker
  dies within the 5-minute window. Now uses a named `chrome.alarms` alarm
  (`sv_task_safety_<token>`) that survives service worker restarts and
  releases the mutex even if the worker was killed mid-task.

### 2026-06-15 — Bookmarklet-to-userscript converter

- **Added bookmarklet import in the dashboard URL input.** Pasting a
  `javascript:` URL into the Utilities import field converts it to a
  `@run-at document-end` userscript with `@match <all_urls>` and opens it
  in the editor for review before saving. Percent-encoded and multi-statement
  bookmarklets are handled. Empty bookmarklets (`void(0)`) are rejected.
  Six test cases pin conversion, encoding, multi-statement, empty, and wiring.

### 2026-06-15 — Multi-store release artifact attestation

- **Extended CI artifact attestations to Firefox and Edge packages.** Main-branch
  pushes now attest the Firefox package ZIP, Firefox source ZIP, and Edge
  package ZIP alongside the existing Chrome ZIP and SBOM attestations.
  All 11 action references are SHA-pinned. Actions pins check passes.

### 2026-06-15 — Violentmonkey migration guide and import validation

- **Added a "Migrating from Other Managers" section to README.** Step-by-step
  migration guides for Violentmonkey, Tampermonkey, and Greasemonkey users
  with format-specific notes on what ScriptVault preserves.
- **Added `tests/vm-import.test.js`** (5 cases) with a realistic VM JSON
  export fixture covering enabled scripts, disabled scripts, and empty-code
  skip behavior. Pins the runtime handler's field access, registration, and
  badge update contract.

### 2026-06-15 — Acorn 8.17 strict parsing for analyzer

- **Updated vendored Acorn from 8.16.0 to 8.17.0.** The AST analyzer now
  uses Acorn's new `strict` parsing option for scripts containing
  `'use strict'` directives, enabling detection of sloppy-mode-only
  constructs in scripts that claim strict mode. Module fallback parsing
  remains unchanged. Vendored provenance check updated.

### 2026-06-15 — System theme auto-detection

- **Added `Auto (system)` theme option across all extension pages.** Setting
  `layout` to `auto` resolves to dark or light based on the system's
  `prefers-color-scheme` preference. Theme updates in real time when the OS
  switches between dark and light mode. Dashboard, popup, side panel, and
  install page all respect the setting. Manual theme selection (dark, light,
  catppuccin, oled) still overrides auto-detection. The theme cycle button
  now includes `Auto` as the first option.

### 2026-06-15 — EU CRA vulnerability reporting readiness

- **Documented CRA vulnerability reporting obligations in the release
  runbook.** New §10 covers the 24-hour ENISA notification, 72-hour
  vulnerability notification, and 14-day final report timelines effective
  Sep 11, 2026. References existing CycloneDX SBOM and CRA SBOM gates.
- **Added CRA timeline reference to the dependency audit policy.** The
  blocking `npm audit` gate is now documented as a CRA compliance
  prerequisite.

### 2026-06-15 — Execution realm downgrade gate

- **Blocked silent MAIN-world fallback for run-now and crontab execution.**
  When `chrome.userScripts.execute()` is unavailable (Chrome < 135 or API
  failure), `runScriptNow` and `@crontab` execution no longer silently
  fall back to `chrome.scripting.executeScript({ world: 'MAIN' })`. The
  MAIN-world path is now allowed only when the script explicitly declares
  `@inject-into page` or `@sandbox raw`. All other scripts receive a clear
  error explaining the API requirement. Two new regression tests pin the
  gate in both execution paths.

### 2026-06-15 — Firefox cloud-sync provider claim gate

- **Added Firefox sync scope footnote to the README comparison table.**
  The comparison table now notes that Firefox currently supports WebDAV and
  S3, with OAuth providers (Google Drive, Dropbox, OneDrive) deferred until
  a Firefox `identity` validation pass lands.
- **Added a CI check for Firefox sync scope drift.** `scripts/check-readme-claims.mjs`
  now fails if `manifest-firefox.json` lacks the `identity` permission but
  the README Cloud Sync row has no qualifying footnote.

### 2026-06-15 — Optional-permission inventory drift fix

- **Fixed `downloads` permission classification across all reviewer-facing
  docs.** Both `manifest.json` and `manifest-firefox.json` declare `downloads`
  as an optional permission, but `PRIVACY.md`, `docs/store-listing-copy.md`,
  `AMO-SOURCE-README.md`, and the CI permission-copy checker all classified it
  as required. Now all four files correctly say `optional_permission` with
  runtime-request language. `npm run store-copy:check` catches future
  required/optional drift automatically.

### 2026-06-15 — esbuild security update

- **Updated esbuild from ^0.27.4 to ^0.28.0.** esbuild 0.28.0 fixes a
  dev-server path-traversal vulnerability (Snyk advisory). The dev server
  is used during `npm run dev` watch mode. The extension bundle itself is
  unaffected since esbuild is a devDependency only. All build modes
  (bg-only, prod, Monaco ESM) verified clean on 0.28.1.

### 2026-06-14 — Trusted Types lint rule

- **Added a Trusted Types linter rule for MAIN-world scripts.** The editor lint
  panel now warns when an `@inject-into page` script assigns to
  `innerHTML`/`outerHTML` or calls `document.write`/`document.writeln`/
  `insertAdjacentHTML` — string sinks that throw on sites enforcing
  `require-trusted-types-for 'script'` (Trusted Types reached Baseline in 2026).
  The warning points authors to `textContent`, `append()`, or `GM_addElement()`
  and stays silent for the default USER_SCRIPT/isolated world, so there are no
  false positives on the common case. Five focused tests cover MAIN-world
  detection, each flagged sink, read/comparison exclusions, and rule
  registration.

### 2026-06-13 — Optional downloads permission + trusted extension gate

- **Added trusted extension ID management to Public API.** Extension senders
  are now denied by default for non-handshake actions (getInstalledScripts,
  toggleScript, etc.). Trusted extension IDs are managed separately from
  trusted web origins via a new dashboard textarea in Trust Center. Extension
  IDs are validated (32 lowercase letters), deduplicated, and persisted.
  Handshake actions (ping, getVersion, getAPISchema) remain open. Audit log
  records `untrusted_extension` for denied callers. Support snapshot includes
  trusted extension count. Eight new test cases cover the gate, validation,
  and bypass behavior.
- **Made downloads permission optional.** Fresh installs no longer require
  the `downloads` permission. Scripts declaring `@grant GM_download` are
  prompted at install time via the existing optional permission flow.
  GM_download checks permission at runtime and returns a clear error when
  not granted. Dashboard Downloads section shows permission status with a
  one-click grant button for recovery.
- **Hardened pattern builder regex construction.** Path segment values are
  now percent-encoded for unsafe characters, `matchUrl` properly escapes
  `*` before converting to wildcard regex, protocol wildcard handling uses
  regex replacement instead of fragile slicing, and pattern length is
  capped at 200 characters. Three new functional tests cover sanitization,
  match correctness, and length guard.

### 2026-06-11 — Cloud sync merge upload base

- **Pinned local workspace refresh in Edge.** The browser smoke now binds a
  real File System Access handle, reviews and applies a changed local
  `.user.js` file, records rollback/trust evidence, and proves the updated
  script executes after registration. Shared IndexedDB schema ownership now
  includes the dashboard v3 publication-receipts store so local applies cannot
  trip a service-worker downgrade open.
- **Formalized CRA-style SBOM validation.** Release trust artifacts now include
  CycloneDX 1.6 supplier, product purl, license, component `bom-ref`, and
  dependency graph evidence, with a CI-wired `release:trust:cra` gate.
- **Expanded Playwright E2E release coverage.** Browser tests now cover
  service-worker registration rehydration, WebDAV upload/download round-trip,
  update rollback, import quarantine review, cross-tab value changes,
  FormData XHR, and local workspace apply flows.
- **Migrated shipped UI font sizing to rem.** Dashboard, popup, side panel,
  install, and DevTools page font-size rules now follow browser text-size
  preferences, with dashboard zoom applied through the root font size and a
  source guard preventing px font-size regressions.
- **Backfilled runtime locale key parity.** `modules/i18n` now carries the full
  English key set for every shipped locale, so `locale:check:strict` fails on
  future runtime key drift instead of the existing backlog.
- **Started dashboard runtime localization.** The dashboard now loads the
  promoted runtime i18n module and translates core shell tabs, toolbar actions,
  help/new-script labels, and script search copy from the shared locale
  dictionary.
- **Expanded dashboard runtime localization.** Scripts-table headers, toolbar
  accessible labels, empty states, and the update queue now use the promoted
  runtime i18n dictionary, including `aria-label` translation support.
- **Localized the dashboard settings shell.** Settings hero copy, category
  filters, search placeholder, summary counts, and filter status text now use
  the runtime i18n dictionary.
- **Extracted user-script message policy.** The background bridge now delegates
  GM/user-script action gating and extension-surface sender checks to a
  promoted TypeScript runtime module with direct source and generated-policy
  tests.
- **Pinned typed message response coverage.** Every `BackgroundMessage`
  action literal now has a `ResponseMap` entry, with a static guard preventing
  future message actions from falling back to unreviewed response typing.
- **Preserved sync bases in upload envelopes.** Cloud sync now includes
  `syncBaseCode` in first-sync and post-merge upload data so other devices keep
  the 3-way merge base instead of falling back to timestamp-only resolution.
- **Uploaded post-merge state.** After remote merge application, upload payloads
  are rebuilt from current `ScriptStorage` state so merged code and the new base
  are propagated in the same sync round.
- **Pinned the round trip.** Source cloud-sync tests now cover first-sync base
  upload and merged-code/base preservation across a second-device sync.
- **Closed the web-ext audit finding.** The npm graph now overrides
  `web-ext`'s `fx-runner` dependency to the patched `1.5.0` release, pulling in
  `shell-quote@1.8.4` and restoring a clean high-severity audit.
- **Serialized save and toggle operations.** `saveScript` and `toggleScript`
  now share the same per-script operation lock so rapid cross-surface actions
  cannot interleave storage writes and user-script registration swaps.
- **Aligned pre-release version ordering.** Install/update comparisons now order
  SemVer pre-release identifiers consistently across the install page, update
  checker source, and generated background runtime, including numeric,
  non-numeric, and longer-identifier precedence cases.
- **Recovered download callbacks after worker restarts.** `GM_download`
  callback routing now persists pending download metadata in session storage,
  uses a single global download-change listener, reconciles terminal states on
  service-worker wake, and prunes timeout or stale tracking entries.
- **Added GM_cookie partition-key support.** `GM_cookie.list`, `set`, and
  `delete` now accept Chrome CHIPS `partitionKey` details, normalize
  `topLevelSite` to an http(s) origin, reject invalid partition shapes before
  Chrome API calls, and expose the option in generated userscript typings.
- **Expanded GM_download parity.** `GM_download` now accepts Blob/File sources,
  typed data-URL downloads, request headers, `anonymous`, `noCache`, and
  redirect options through a bounded fetch bridge while preserving existing
  `@connect` and internal-host policy checks.
- **Added partition-cookie routing for GM_xmlhttpRequest and GM_download.**
  Partition-aware XHR and download requests now validate `partitionKey` /
  `cookiePartition`, collect only matching cookies through `chrome.cookies`,
  force the fetch bridge to omit the default cookie jar, and attach the scoped
  cookie header with a temporary DNR session rule that is removed after the
  request.
- **Removed the dead anonymous-statistics setting.** The dashboard no longer
  exposes a telemetry-looking control that only persisted local state while
  the privacy policy and README promise zero telemetry.
- **Centralized the userScripts setup doctor.** Dashboard and popup setup
  warnings now use a shared state model for Chrome 138+ Allow User Scripts,
  Chrome 120-137 Developer Mode, Firefox optional `userScripts`, current-site
  host access, runtime repair, and support-snapshot evidence.
- **Hardened cross-tab value-change E2E proof.** The Playwright
  `GM_addValueChangeListener` remote-semantics test now tries the browser's
  Allow User Scripts toggle before skipping, and passes live on the installed
  Edge channel.
- **Pinned GM_xmlhttpRequest FormData parity.** A new Edge-channel Playwright
  fixture posts duplicate FormData keys and a `File` through
  `GM_xmlhttpRequest`, then verifies the local server receives ordered duplicate
  values plus filename and content type metadata.
- **Pinned Firefox textarea-first editor scope.** README and Firefox package
  tests now explicitly position Firefox v1 as textarea-first while Monaco stays
  omitted until a pruned local bundle has AMO lint proof.
- **Hardened release supply-chain gates.** CWS publish tooling now pins
  `chrome-webstore-upload-cli` to exact `4.0.0` and checks the lockfile
  integrity hash; `release:check` verifies existing release tags with
  `git tag --verify` while preserving the legacy unsigned v3.11.0 tag as a
  non-public warning; CI now runs an independently callable reproducible ZIP
  comparison after `build.sh`.
- **Completed one-shot dashboard runs.** The dashboard editor and script table
  now expose a Chromium 135+ "Run on Tab" action that targets the active or most
  recently active injectable tab, uses the existing `runScriptNow` handler, and
  keeps the message contract typed alongside the popup action.
- **Pinned the structured-clone interop blocker.** A new regression test keeps
  the Chrome manifest in JSON message-serialization mode while the external
  Public API listener remains active, preventing a Chrome 148+ structured-clone
  flip from silently breaking JSON-mode extension callers.
- **Initialized Action Menu settings from checked schema metadata.** The
  dashboard now drives the Action Menu settings section from a schema-backed
  model, aligns the badge color fallback with the checked default, and extends
  the settings-schema gate so section metadata drift fails in CI.
- **Hid unsupported local workspace controls by default.** Chromium-only local
  file binding buttons now stay hidden until File System Access support is
  detected, while Firefox and unsupported browsers keep the manual file import
  fallback visible.
- **Cleaned up failed Greasy Fork handoff forms.** The publish handoff now
  removes the hidden source-bearing prefill form immediately if browser form
  submission fails, preserving the no-stored-source boundary.

### 2026-06-05 — Microsoft Edge sideload smoke

- **Added a dedicated Edge browser smoke.** `npm run smoke:edge` now builds the
  Edge package, loads `build-edge/` into Microsoft Edge, opens dashboard and
  popup surfaces, saves/toggles a smoke userscript, verifies it runs on a local
  target page, and captures extension console/runtime errors.
- **Recorded Edge smoke evidence.** The smoke writes
  `edge-artifacts/edge-smoke-<version>.json`, and the Edge readiness report
  now points release operators to that evidence path.
- **Kept Edge support claims conservative.** The generated support matrix still
  labels Edge as a compatible package / manual Partner Center publication path
  until maintainers run the local smoke on a release machine.

### 2026-06-04 — Import and restore quarantine

- **Quarantined restored executable scripts by default.** JSON imports, ZIP
  imports, raw-JS ZIP fallback imports, selected backup restores, cloud restores,
  and full-vault restores now keep archive-enabled scripts disabled until review.
- **Added an explicit trusted restore override.** Backup review shows how many
  archive-enabled scripts will become active immediately when the user selects
  the trusted override; archived-disabled scripts stay disabled either way.
- **Recorded trust posture in restore/import results.** Receipts and toasts now
  count quarantined, preserved-disabled, and trusted-enabled scripts without
  storing script bodies or credentials in the summary.

### 2026-06-04 — Host-permission recovery prompts

- **Added current-site host access diagnostics.** The background now reports the
  active/recent site origin pattern, browser-granted state, and matching enabled
  scripts blocked by withheld site access.
- **Surfaced recovery in popup, side panel, and dashboard.** Users see the
  blocked script names and can queue Chrome `addHostAccessRequest` prompts or
  use the standard `permissions.request({ origins })` fallback from extension
  pages.
- **Gated the optional-host manifest prototype.** `npm run
  host-permissions:prototype` writes a deterministic report for moving
  `http://*/*` and `https://*/*` to `optional_host_permissions` later while the
  shipping manifests and reviewer copy remain unchanged.

### 2026-06-04 — NPM/ESM `@require` resolver wiring

- **Wired `npm:` specs into the real `@require` fetch path.**
  `fetchRequireScript()` now resolves `@require npm:<package>` through the
  promoted NpmResolver and caches the resolved package bytes under both the
  original npm spec and the final CDN URL.
- **Closed the computed-integrity TOCTOU gap.** `NpmResolver.resolveWithCode()`
  returns the exact response body used to compute SRI, so the runtime no longer
  hashes one CDN response and executes a later fetch of the same URL.
- **Applied internal-host checks to npm CDN fetches.** NPM resolver fetches now
  reject non-HTTPS URLs before network I/O and reject redirects into internal
  hosts before reading or caching bytes.

### 2026-06-04 — Remove dead dashboard i18n-v2 table

- **Removed the unused dashboard i18n-v2 dictionary.** The dashboard no longer
  eager-loads the 8-language table that had no `data-i18n` consumers.
- **Stopped advertising translated dashboard UI.** The settings language
  selector was removed, README now scopes localization to manifest/runtime
  messages, and locale docs say the dashboard is English-only until a real DOM
  translation pass exists.
- **Narrowed the locale gate to live surfaces.** `scripts/check-locales.mjs`
  now audits `_locales/` and `modules/i18n.js` instead of a deleted dashboard
  table.

### 2026-06-04 — Restore What's New for v3.x

- **Added the v3.11.0 dashboard What's New entry.** First-run dashboard visits
  after a v3.11.0 upgrade now have a real modal entry instead of silently
  marking the version as seen.
- **Made What's New freshness a checked contract.** `npm run whatsnew:check`
  evaluates the dashboard module against `manifest.json.version` and now runs
  inside `npm run check`.

### 2026-06-04 — Correct @crontab next-fire scheduling

- **Replaced the hourly fallback with real next-fire scheduling.** `@crontab`
  scripts now parse five cron fields with lists, ranges, steps, month/day
  names, and Sunday as `7`, then schedule the exact next local fire time.
- **Re-armed crontab jobs as one-shot alarms.** Crontab alarms now use
  `chrome.alarms.create({ when })` and re-compute after each fire, so complex
  expressions like `30 9 * * 1` no longer run hourly.
- **Surfaced invalid crontab metadata in the editor.** The Advanced Linter now
  flags unsupported `@crontab` expressions instead of letting them silently
  fall back.

### 2026-06-04 — Dashboard module reachability

- **Mounted the formerly unreachable dashboard modules.** Scripts, settings,
  utilities, and editor actions now initialize their lazy dashboard modules
  through concrete containers or toolbar triggers instead of discarding loaded
  module results.
- **Added a dashboard module reachability gate.** `npm run
  dashboard:modules:check` verifies triage metadata, lazy-loader and HTML
  references, and UI wiring tokens for every `pages/dashboard-*.js` module, and
  now runs inside `npm run check`.
- **Removed the profile module's hidden Alt+number switcher.** Profile
  switching stays on visible dashboard controls without registering a global
  keyboard shortcut path.

### 2026-06-04 — TOFU SRI for unpinned `@require`

- **Blocked previously trusted unpinned dependency swaps.** Trust receipts now
  fail save/update/install flows when the same unpinned `@require` URL resolves
  to different bytes than the first trusted SHA-256 snapshot, or when those
  bytes cannot be reverified.
- **Made receipt probes cache-safe.** Receipt generation fetches dependency
  bodies with a cache-bypassing, no-store mode so stale cache entries cannot
  hide a CDN change and rejected bytes cannot replace the active cache.
- **Surfaced TOFU review reasons in pending updates.** Queued updates now show
  a specific "previously trusted unpinned @require bytes" reason before apply;
  verifiable SHA-pinned URLs continue through normal SRI validation.

### 2026-06-04 — Per-script privileged host scope

- **Scoped GM network, cookie, download, and DNR primitives to script hosts.**
  `GM_xmlhttpRequest`, `GM_loadScript`, `GM_download`, `GM_cookie`, and
  `GM_webRequest` now check a script's effective run-host scope before using
  ambient extension host permissions; `@connect` explicitly widens
  network/download/DNR targets, while cookie access stays run-host scoped
  unless the advanced cross-scope override is enabled.
- **Hardened DNR rule translation and CSP stripping.** DNR rules now require a
  concrete target host, carry script initiator-domain constraints, support
  accepted `selector.include` and string `cancel` shapes without becoming
  global rules, and reject CSP header mutation unless Modify CSP is explicitly
  set to `yes` or the high-privilege override is enabled.
- **Surfaced the boundary in review/settings UI.** The install review shows a
  privileged host-scope card, `GM_webRequest` is treated as elevated browser
  access, and the dashboard exposes the cross-scope privileged API override as
  an advanced security setting.

### 2026-06-04 — Edge package evidence gate

- **Tied Edge support claims to generated artifacts.** `npm run
  build:edge:check` now writes a release-readiness report with Edge package,
  manifest-transform, manual Partner Center publication, deferred REST update,
  and no-CI-browser-smoke status; the browser support matrix reads that report.
- **Added Edge CI artifact coverage.** CI now builds and uploads
  `edge-artifacts/*`, and release docs distinguish automated package
  generation from manual initial Edge Add-ons publication.

### 2026-06-04 — Cloud sync encryption

- **Added optional client-side encryption for sync payloads.** CloudSync and
  EasyCloud can now upload v2 `AES-256-GCM` envelopes derived with
  `PBKDF2-SHA-256`, while still reading legacy plaintext v1 sync files.
- **Kept the encryption passphrase out of normal exports.** The dashboard
  exposes the sync-encryption opt-in and passphrase field, and JSON/ZIP backup
  credential redaction treats `syncEncryptionPassphrase` as a sync credential.

### 2026-06-04 — Contributor local-state guidance

- **Added a public CONTRIBUTING guide.** The guide covers setup,
  verification, release evidence commands, and generic local-only file hygiene.
- **Excluded local state from source archives.** `.gitattributes` now marks
  `.factory/` as `export-ignore`, matching the existing `.gitignore` rule and
  keeping local workflow state out of release/source-review archives.

### 2026-06-04 — README checklist regression pin

- **Pinned recent shipped-feature checklist rows.** The README claim test now
  asserts that the feature-claim checklist keeps rows for the ESM bundler,
  trust receipts, install-source badges, internal-host guard, sync cockpit, and
  dashboard virtualization.

### 2026-06-04 — CWS remote-code compliance gate

- **Added a Chrome Web Store remote-code compliance packet.**
  `docs/cws-remote-code-compliance.md` maps user-installed scripts,
  `@require`, sandboxed editor, OAuth, script-search, and sync flows to their
  allowed review buckets and states that extension pages/service worker do not
  execute remote logic directly.
- **Added a package scanner for remote-code execution patterns.**
  `npm run cws:remote-code:check` now validates docs, CI wiring, and source
  package inputs, and CI scans the generated `ScriptVault-vX.Y.Z.zip` after
  `bash build.sh` for remote script tags, remote workers, remote imports, and
  fetched-string eval/new Function patterns.

### 2026-06-04 — Plain-language readability gate

- **Added a Flesch 60+ readability gate for high-impact UI copy.**
  `scripts/check-readability.mjs` audits setup, install, and trust strings,
  reports offending IDs and source files, and now runs through CI,
  `npm run test:a11y`, and `npm run check`.
- **Rewrote dense setup and install review copy.** The dashboard/popup setup
  warnings and install trust/review states now use shorter, plain-language
  sentences while preserving the same browser/version guidance.

### 2026-06-04 — Cross-surface Help links

- **Added consistent Help entry points across extension pages.** Dashboard,
  popup, side panel, and install now expose a `[data-help]` control with the
  accessible name `Help`.
- **Deep-linked every Help action to the dashboard Help tab.** Popup and side
  panel use the existing dashboard-opening runtime route with `tab: 'help'`
  and all surfaces retain a `pages/dashboard.html#tab=help` fallback.

### 2026-06-04 — AMO vendored library provenance

- **Added reviewer-reproducible vendored library provenance.** Firefox package
  libraries now come from exact npm dev pins, with Acorn regenerated from
  `acorn@8.16.0` source and jsdiff copied from the official `diff@9.0.0`
  package file.
- **Gated AMO source-review inventory drift.** `npm run vendored:provenance`
  writes packaged bytes plus `docs/amo-vendored-libraries.md`, and
  `npm run firefox:package` now fails if versions, hashes, lockfile integrity,
  or Firefox minified-library includes drift from the reviewer inventory.

### 2026-06-04 — Firefox Android compatibility deferred

- **Removed the unverified Android AMO compatibility claim.** The Firefox
  manifest no longer declares `gecko_android`, so the package does not advertise
  Firefox for Android support before a device/emulator smoke gate exists.
- **Regenerated support docs with Android deferred.** README and
  cross-browser pipeline docs now describe Firefox for Android as deferred, not
  a manifest validation target.

### 2026-06-04 — Sync-safe script settings partition

- **Stopped syncing local-only per-script diagnostics.** CloudSync and
  EasyCloud now strip `userModified`, `mergeConflict`, failed `@require`
  markers, registration errors, and source-identity warnings from upload
  envelopes while preserving them locally.
- **Whitelisted portable per-script preferences.** Remote envelopes can still
  carry user-facing settings such as run timing, injection/frame overrides,
  URL override lists, notes, tags, pinned state, and performance budget.

### 2026-06-04 — Bounded backup archive intake

- **Rejected unsafe backup and import archives before parsing.** JSON imports,
  ZIP imports, backup import, inspect, verify, and restore now share bounded
  archive intake for compressed payload size, file count, expanded size,
  per-entry size, nested archive entries, and compression ratio.
- **Applied the 5 MB script cap to portable JSON/ZIP imports.** Oversized
  script bodies are rejected before parser, storage, or registration work, and
  backup verification reports deterministic non-secret archive errors.

### 2026-06-04 — Export and backup credential gating

- **Redacted sync credentials from portable vault settings by default.** JSON
  exports, cloud backups, and managed backup ZIPs now omit WebDAV credentials,
  OAuth tokens, and S3 access keys unless the user enables a separate credential
  opt-in.
- **Stamped backup metadata for credential restore safety.** Managed backup ZIPs
  now include `global-settings.metadata.json`, and JSON/cloud exports carry
  `settingsCredentialsIncluded` plus redacted key names so restore can prove
  whether credentials were intentionally archived.
- **Kept live credentials local on restore by default.** JSON/cloud imports and
  full backup restores preserve current credential settings unless archive
  metadata and the explicit restore checkbox both opt in.

### 2026-06-04 — Sync endpoint internal-host guard

- **Blocked WebDAV and S3 sync SSRF by default.** User-configured sync
  endpoints now run internal-host preflight checks before request and final-URL
  checks after fetch, before response bodies are read.
- **Added an explicit local/private sync endpoint opt-in.** The advanced
  `allowInternalSyncEndpoints` setting is available from Userscript Sync for
  deliberate self-hosted WebDAV, Nextcloud, MinIO, or S3-compatible endpoints on
  localhost, LAN, link-local, or private IPv6 networks.

### 2026-06-04 — Research feature plan refresh

- **Added the current research-backed feature plan.** `RESEARCH_FEATURE_PLAN.md`
  now consolidates ScriptVault's product map, feature inventory, competitive
  research, security/data-safety priorities, UX/accessibility work,
  maintainability themes, prioritized roadmap entries, quick wins, larger bets,
  non-goals, and open questions while keeping `ROADMAP.md` as the active queue.

### 2026-06-04 — GM_xmlhttpRequest internal-host guard

- **Blocked GM_xmlhttpRequest internal-host SSRF by default.** GM_xhr now runs
  the shared `InternalHostGuard` before fetching and again on the final response
  URL before reading the body, so IMDS, loopback, RFC1918, link-local, and IPv6
  internal redirects are rejected even when `@connect` is empty or `*`.
- **Preserved explicit localhost development opt-ins.** Loopback GM_xhr remains
  available when a script explicitly declares `@connect localhost`, and the new
  advanced `allowInternalXhr` setting is a global escape hatch for users who
  intentionally allow internal XHR.

### 2026-06-04 — Firefox sideload smoke and web-ext audit fix

- **Firefox Phase 1 now has an automated temporary sideload smoke.**
  `npm run smoke:firefox` packages the Firefox build, installs it temporarily
  through geckodriver, opens the dashboard and popup, and saves/toggles a smoke
  userscript through the extension message path before verifying it runs on a
  local target page. Headless Firefox permission prompts are still surfaced in
  the UI and then granted through Firefox chrome context for automation.
- **Fixed a Firefox background boot error exposed by the smoke.**
  `MAX_SCRIPT_SIZE` is initialized before `SubscriptionSystem` reads it, so the
  Firefox event-page background no longer throws during add-on startup.
- **Fixed Firefox runtime compatibility exposed by sideloading.** Native
  Windows Git Bash is preferred over WSL for Firefox packaging, Firefox `menus`
  is aliased to the shared `contextMenus` path, and own `moz-extension://`
  dashboard/popup senders are trusted for extension-page messages.
- **Added Firefox userScripts permission onboarding.** Popup and dashboard setup
  banners request the optional Firefox `userScripts` permission, then re-run the
  live runtime probe and registration repair path.
- **Validated Chrome-style backups in the Firefox build.** `npm run
  smoke:firefox` now imports JSON and ZIP backup fixtures into Firefox and
  checks stable script IDs, metadata, disabled state, GM storage, and timestamps.
  ScriptVault ZIP exports now include `scriptVault` timestamp metadata so
  `createdAt`, `updatedAt`, and position survive cross-browser restore.
- **Closed Firefox Phase 2 data-safety validation.** The Firefox smoke now
  imports a 26-script quota fixture, verifies storage usage, restarts Firefox
  with the same temporary profile, reinstalls the temporary package, confirms
  trash survived the restart, and restores the deleted script. The migration
  suite also proves the v1.x -> v2.0 migration is idempotent across repeated
  runs.
- **Validated Firefox WebDAV-only sync for v1.** The Firefox smoke now runs a
  local WebDAV fixture, saves WebDAV settings through the runtime, checks
  provider health, runs a no-write dry-run preview, performs `syncNow`, verifies
  the uploaded JSON backup, and confirms Basic Auth reached the configured
  endpoint. OAuth sync providers remain deferred because the Firefox package
  omits `identity`.
- **Validated Firefox DNR, `@require` SRI, and Ed25519 parity.** The Firefox
  smoke now adds/removes a dynamic DNR rule, verifies `@require` SRI during
  packaged-runtime registration with a pinned HTTPS dependency, and exercises
  Ed25519 key generation, signing, verification, and tamper rejection. Failed
  dependency registration now records `_failedRequireErrors`, and `@require` /
  provenance fetches no longer force `mode: 'cors'`.
- **Closed Firefox Phase 4 polish validation.** The dashboard now shows a
  Firefox/Chrome build indicator with browser version, hides unsupported
  Firefox sync/cloud providers behind a WebDAV-only gate, and the Firefox smoke
  verifies hidden provider options, popup width, and dashboard/popup dark and
  light theme tokens. Static Firefox package tests also pin command shortcuts
  and action icon dimensions.
- **Prepared AMO source review and reviewer rationale.** The source-review ZIP
  now includes `AMO-SOURCE-README.md` with reproducible Firefox build
  instructions, AMO data-collection copy, permission rationale, Firefox v1
  listing scope, and unlisted-first manual submission steps. The
  `store-copy:check` gate now requires that AMO source-review copy.
- **Cleared the high-severity `web-ext` audit path.** `web-ext` now resolves to
  the `10.3.0` line with fixed `tmp@0.2.6`, restoring the high-level npm audit
  gate.

### 2026-06-04 — Firefox Monaco fallback path

- **Firefox AMO builds now fall back to an editable textarea immediately when
  Monaco is omitted.** `editor-sandbox.html` reports missing local Monaco
  bundles to the parent, and `monaco-adapter.js` hides the iframe without
  waiting for the timeout.
- **The fallback editor now preserves dashboard editing semantics.** Pending
  code is copied into the textarea, textarea input fires the adapter change
  listeners, focus works, and `isMonaco` reports `false` while the fallback is
  active.

### 2026-06-04 — Firefox side-panel feature flag

- **Firefox no longer receives a fake `chrome.sidePanel`.**
  `dashboard-firefox-compat.js` preserves native Chromium side-panel support
  but leaves the API undefined on unsupported browsers, so dashboard
  feature-detects can hide side-panel entry points.
- **The side-panel gate is covered by executable compatibility tests.**
  `tests/dashboard-firefox-compat.test.js` evaluates the dashboard
  compatibility layer in Firefox-like and Chromium-like contexts.

### 2026-06-04 — Firefox offscreen fallback

- **Firefox no longer calls `chrome.offscreen`.** `ScriptAnalyzer` now
  feature-detects offscreen support before creating a document. Chrome keeps
  the offscreen document path, while Firefox uses inline local Acorn for AST
  analysis and ESM import parsing.
- **3-way sync merge has a Firefox fallback.** Cloud sync merge paths now route
  through `ScriptAnalyzer.mergeText()`, which uses the offscreen Diff worker on
  Chrome and inline local `lib/diff.min.js` when `chrome.offscreen` is absent.
- **Firefox packaging includes the parser libraries only.** `build-firefox.sh`
  copies `lib/acorn.min.js` and `lib/diff.min.js` without copying the full
  Monaco `lib/` tree.

### 2026-06-04 — Module-mode service worker

- **Chrome now loads the MV3 background as a module service worker.**
  `manifest.json` declares `"background.type": "module"` for the existing
  single-file `background.js` bundle, while Firefox remains on its generated
  event-page background shape.
- **Module compatibility is pinned in tests.** The new manifest gate verifies
  the Chrome floor, the Firefox transform, the absence of global
  `importScripts()` loader calls / static imports / exports in `background.js`,
  and Edge manifest preservation.

### 2026-06-04 — Require provenance install preview

- **Install review now previews `@require` provenance.** The dependency card
  shows a Sigstore provenance status, per-`@require` labels, and a
  verified-author badge when declared bundles verify against the dependency
  bytes, Fulcio root, and expected OIDC identity.
- **Opted-in provenance now fails closed on save/update.** Direct install,
  reinstall, downgrade, and update receipts use the hardened background
  `fetchRequireScript()` and `fetchProvenanceBundle()` paths; a declared
  provenance failure returns a clear install/update error before script state is
  saved.

### 2026-06-04 — Require provenance author guide

- **Added `docs/provenance-author-guide.md`.** The guide documents Cosign
  blob signing, ordered `@require-provenance` / `@require-identity`
  declarations, GitHub Actions OIDC identity shape, verification statuses,
  common failure modes, and dependency rotation.

### 2026-06-04 — Require provenance review UI

- **Pending updates now treat provenance failures as review-required.**
  Failed signatures, failed Fulcio roots, unavailable bundles, unsupported
  bundles, and incomplete declarations add a review reason instead of leaving
  the update in the safe-to-apply bucket.
- **Dashboard trust surfaces show per-dependency provenance.** Recent-update
  review modals and script trust receipts now list declared `@require`
  provenance with status, identity, certificate identity, root state, and
  verification errors.

### 2026-06-04 — Fulcio root verification for require provenance

- **Sigstore verifier now checks the certificate chain.** The verifier bundles
  the official Fulcio v1 root certificate, supports injected roots for tests,
  and verifies leaf/intermediate ECDSA certificate signatures through the
  trusted root.
- **Trust receipts now distinguish root failures.** Provenance receipts can
  record `root-verification-failed`, `rootVerified: verified|failed`, and the
  leaf certificate validity window. RFC3161/Rekor timestamp proof remains the
  later defense-in-depth phase.

### 2026-06-04 — Sigstore message-signature verifier

- **Sigstore message-signature verification now feeds trust receipts.**
  Added `src/modules/sigstore-bundle-verifier.ts` with generated
  `modules/sigstore-bundle-verifier.js`, plus a bounded
  `fetchProvenanceBundle()` path for update and pending-update receipts.
- **Receipts now record real provenance outcomes when verification can run.**
  For declared `@require-provenance` entries, receipts can now store
  `signature-verified`, `signature-failed`, `bundle-unavailable`, or
  `unsupported-bundle` alongside certificate identity, issuer, digest, and
  signature flags. Fulcio root/expiry checks are covered by the later root
  verification entry.

### 2026-06-04 — Sigstore bundle parser

- **Sigstore bundle parsing is now generated from TypeScript.**
  Added `src/modules/sigstore-bundle-parser.ts` with generated
  `modules/sigstore-bundle-parser.js` and promotion-gate coverage.
- **The parser validates Sigstore v0.3 bundle shape before verification.**
  It accepts message-signature and DSSE content, extracts certificate or
  public-key verification material, transparency-log entries, and RFC3161
  timestamps, and rejects unsupported media types or ambiguous key material.

### 2026-06-04 — Require provenance metadata foundation

- **`@require-provenance` metadata now persists.** The main userscript parser,
  public API install parser, and generated background runtime now store
  ordered `requireProvenance[]` and `requireIdentity[]` arrays.
- **Trust receipts record declaration-only provenance.** Each `@require`
  dependency can now carry its declared Sigstore bundle URL and expected OIDC
  identity with `verification: not-yet-implemented`; message-signature
  verification is covered by the later Sigstore verifier entry.

### 2026-06-04 — Local health diagnostics

- **Support snapshots now include local health diagnostics.** Added
  `getLocalHealthReport` to summarize runtime setup, storage pressure,
  pending update queues, callback-map pressure, and script health warnings.
- **Diagnostics remain local and aggregate-only.** The report explicitly
  excludes script source, script names, URLs, and external usage beacons.

### 2026-06-04 — Release store status gate

- **Release trust now includes store-status evidence.** Added
  `npm run release:store-status` to verify rollback/trust/status wiring,
  Firefox AMO lint/package artifacts, and optional credentialed CWS API v2
  `fetchStatus` results before release publication.

### 2026-06-04 — Background core TypeScript bridge promotion

- **The main background core is now generated from TypeScript.**
  `background.core.js` is produced from `src/background/core.ts` as a raw
  bridge source, preserving top-level runtime helpers while closing the final
  TS promotion gap. `ts-source:check` now reports 23 promoted entries, 0
  mirrored entries, and 0 intentionally divergent runtime files.

### 2026-06-04 — Cloud sync providers TypeScript promotion

- **Cloud sync providers runtime is now generated from TypeScript.**
  `modules/sync-providers.js` is produced from `src/modules/sync-providers.ts`,
  including WebDAV, Google Drive, Dropbox, OneDrive, and S3-compatible SigV4
  providers plus the OAuth timeout helper and `self.CloudSyncProviders`
  compatibility export.

### 2026-06-04 — EasyCloud sync TypeScript promotion

- **EasyCloud sync runtime is now generated from TypeScript.**
  `modules/sync-easycloud.js` is produced from
  `src/modules/sync-easycloud.ts`, with the source updated to rely on runtime
  storage globals while preserving alarm-backed debounce sync, Drive request
  timeouts, offline queue handling, runtime script refresh hooks, and
  chrome.identity token-cache behavior.

### 2026-06-04 — Backup scheduler TypeScript promotion

- **Backup scheduler runtime is now generated from TypeScript.**
  `modules/backup-scheduler.js` is produced from
  `src/modules/backup-scheduler.ts`, with the source updated for restore
  receipts, rollback receipts, backup verification, receipt retention caps,
  and runtime-global storage contracts.

### 2026-06-03 — Public API TypeScript promotion

- **Public API runtime is now generated from TypeScript.** `modules/public-api.js`
  is produced from `src/modules/public-api.ts`, with the source mirror updated
  for generated script IDs, permissions access, bounded web installs, and
  webhook defense-in-depth.

### 2026-06-03 — ESM bundler TypeScript promotion

- **ESM bundler runtime is now generated from TypeScript.** `bg/esm-bundler.js`
  is produced from `src/bg/esm-bundler.ts`, preserving the runtime
  `fetchRequireScript` dependency and `self.ESMUserscriptBundler` worker alias.

### 2026-06-03 — Signing runtime TypeScript promotion

- **Signing runtime is now generated from TypeScript.** `bg/signing.js` is
  produced from `src/bg/signing.ts`, preserving the null signature guard,
  trust-store own-property check, and runtime `SettingsManager` global contract.

### 2026-06-03 — Workspace manager TypeScript promotion

- **Workspace runtime is now generated from TypeScript.** `bg/workspaces.js`
  is produced from `src/bg/workspaces.ts`, reducing the remaining mirrored
  runtime surface while preserving the cold-start `_initPromise` guard.

### 2026-06-03 — Storage persistence prompt

- **Persistent storage is requested before meaningful script writes.** The
  background worker now asks `navigator.storage.persist()` once before script
  installs, saves, imports, and updates.
- **Writes remain non-blocking.** The persistence request records granted,
  denied, unsupported, or error outcomes in `chrome.storage.local` and never
  prevents the script write from continuing.

### 2026-06-03 — Script subscriptions

- **Subscription feeds can queue curated script installs.** The Utilities panel
  now accepts a JSON feed URL, stores subscribed feeds, and refreshes them on
  demand.
- **New feed members require review.** Subscription scripts land in the
  existing Updates inbox as review-only installs, so "apply safe" cannot
  auto-install new scripts.
- **Feed and script fetches use the hardened path.** Subscription fetches reuse
  the internal-host guard plus stream-bounded body reader before queueing any
  script source.

### 2026-06-03 — ESM dashboard badge

- **ESM scripts are visible in the dashboard row.** Scripts parsed from
  `@module 1`, `@inject-into module`, or stored ESM bundle metadata now show an
  `ESM` badge beside the existing source and health badges.
- **Badge styling is theme-aware.** The new badge uses the existing square
  health-badge shape in both dark and light themes.

### 2026-06-03 — Playwright E2E critical flows

- **Added Playwright E2E coverage for four critical flows.** New specs cover
  install review, update review with rollback history, backup restore plus
  restore-receipt rollback, and WebDAV sync preview/upload against a real local
  HTTP endpoint.
- **CI now runs the browser flow suite.** `npm run test:e2e` runs after the
  dashboard smoke test; CI installs Playwright Chromium explicitly while
  keeping dependency install from downloading unused browsers.
- **Install review bootstrap fixed.** The install page now relies on the shared
  `formatBytes` helper instead of redeclaring it after `shared/utils.js`, which
  previously caused a page-level SyntaxError and left the install review stuck
  on its loading state.

### 2026-06-03 — GM API ambient declarations

- **Generated TypeScript declarations for userscripts.** `scripts/generate-gm-types.mjs`
  now writes `lib/scriptvault.d.ts` with ambient GM/GM_* declarations for the
  built ScriptVault runtime, including notification handles, cookie/audio APIs,
  resource helpers, tab state, `GM_webRequest`, and `window.onurlchange`.
- **Build and package paths keep declarations current.** The background build
  regenerates the declaration file, `npm run gm-types:check` fails on drift,
  and the Chrome package include list ships `lib/scriptvault.d.ts`.
- **Typecheck coverage added.** `tests/gm-types.test.js` compiles a temporary
  TypeScript userscript against the generated declarations and verifies the CWS
  include path.

### 2026-06-03 — Sync tombstone resurrection drill

- **Added a deletion-resurrection regression drill.** The cloud-sync source
  test now covers install A, upload, delete A with a tombstone, upload the
  tombstone, wipe local state, and resync from the remote tombstone without
  resurrecting A.

### 2026-06-03 — Trash retention visibility

- **Trash policy is now explicit in the recovery panel.** The Trash tab shows a
  live retention banner that summarizes the configured cleanup policy and the
  next automatic purge time when deleted scripts are waiting.
- **Deleted script rows show purge dates.** Each recoverable row now includes a
  "Will auto-delete on ..." label derived from the current `trashMode` retention
  setting, or a no-automatic-deletion label when trash cleanup is disabled.

### 2026-06-03 — Pending update inbox queue

- **Auto-update now defaults to notify-only review.** Scheduled checks queue
  available updates instead of applying them by default. A new
  `autoUpdateMode` setting lets users opt into applying safe updates without
  review.
- **Updates tab added to the dashboard.** The queue shows pending update counts,
  safe/review buckets, source host, line-diff summary, trust receipt changes,
  install, remove, diff, and rollback actions.
- **Popup and side panel surface queued updates.** Both entry points show a
  queued-update badge/chip and open the dashboard Updates tab for review.
- **Safe bulk updates are separated from review-required updates.** Bulk update
  flows apply only safe queued updates when requested; updates that add
  permissions, change source identity, or alter external dependencies stay in
  the queue.
- **Regression coverage added.** `tests/pending-update-queue.test.js` covers
  notify-only default behavior, safe-only application, and review classification
  for permission-expanding updates. The full suite is 1127 tests.

### 2026-06-02 — Deep audit hardening pass (wave 2)

- **`@match` ReDoS fixed.** The `@match` path-glob → regex conversion did not
  collapse consecutive `*` (unlike `@include`), so a crafted pattern such as
  `*://site/****…****a` produced a catastrophically-backtracking regex that
  could freeze the service worker for ~a minute *per evaluated tab URL*. Now
  collapses runs of `*` first (semantically identical glob), in both the
  runtime and the TS matcher. Added a timing regression test.
- **Cloud token-validity probes now time out.** Google Drive / Dropbox /
  OneDrive `getValidToken()` issued a raw `fetch` with no timeout on the hot
  upload/download path; a hung probe blocked every caller indefinitely (the
  prior timeout only covered the refresh path). All three now use the existing
  15s timeout wrapper and fall through to refresh on a failed/timed-out probe.
- **`@crontab` schedule reconciliation on in-place update.** On the Chrome
  138+ `userScripts.update` path, editing a script to add `@crontab` left the
  old page-load registration in place (script ran on load *and* on schedule),
  and removing `@crontab` left a zombie alarm firing forever. Registration now
  drops the prior page-load registration when switching to crontab and clears
  any stale crontab alarm when a script is no longer scheduled.
- **`ScriptValues.deleteAll` cache/IDB race fixed.** A concurrent
  `GM_getValue`/`GM_setValue`-triggered `init()` could write pre-delete values
  back into the cache after `deleteAll` cleared it, leaving the cache serving
  deleted values while IndexedDB was empty. `deleteAll` now serializes on
  `init()` before clearing.
- **Backup retention hardening.** Restore-receipt retention was capped only by
  count (10); since each receipt snapshots every script's code + values, a few
  full-library restores could balloon `chrome.storage.local`. Added a ~5 MB byte
  budget that drops the oldest receipts (always keeping the newest). Also clamped
  `pruneOldBackups`'s `maxBackups` so a negative/NaN value can't keep the oldest
  backups or wipe them all.
- **Release hygiene.** Added `.gitattributes export-ignore` for internal
  planning/research docs so the `git archive` source ZIP shipped to add-on
  reviewers no longer carries development working notes; closed `.gitignore`
  gaps; removed stray working-notes references from two build-tooling comments.

### 2026-06-01 — Deep audit hardening pass

- **@require SRI now fails closed.** Subresource-integrity verification for
  `@require`/npm dependencies previously returned "valid" when the digest
  computation threw, silently accepting unverified bytes on a correctly-pinned
  `sha256` hash. It now rejects on any verification error. SRI hashes are also
  compared after normalizing base64url and missing padding, so a correctly
  pinned require can no longer silently fail and fall through to a fallback CDN.
- **Stored-XSS fixes.** The collection card icon and the collection editor's
  icon input interpolated an imported/shared `icon` value into HTML without
  escaping; both are now escaped. The multi-profile header indicator and
  switcher dropdown interpolated an imported profile's `color` (into a style
  attribute) and `emoji` without validation; color is now validated against a
  hex/named-color allowlist and emoji is HTML-escaped, matching the profile bar.
- **Install-page dependency probe hardened.** The `@require` reachability
  preview auto-fetched every dependency URL from untrusted userscript metadata
  before any user action, with no scheme or host check — usable to probe
  loopback/private/cloud-metadata hosts. It now only probes external `http(s)`
  URLs and marks internal or non-http(s) URLs as unverified without fetching.
- **Cross-device deletes now propagate.** Cloud sync recorded remote deletions
  but never removed the already-installed local copy, so a script deleted on
  another device kept running locally. Sync now applies remote tombstone
  deletions locally (skipping user-modified scripts), and the 3-way merge base
  handles an empty-string sync base correctly.
- **UX/robustness.** Schedule and theme-editor save/clear/error toasts were
  bound to an out-of-scope `showToast` and never appeared; they now route
  through the exposed dashboard toast. The activity heatmap clears its global
  recording hook on teardown, and the side panel's all-scripts render degrades
  instead of throwing if its list element is missing.
- Hardened the Vitest crypto mock so the signing source suite runs in all
  worker pools (was the one persistently failing case). Full suite: 1114 green.

### 2026-06-01 — Planning and research index consolidation

- Added root-level `COMPLETED.md` and `RESEARCH_REPORT.md` indexes so active
  roadmap, TODO, Firefox-port, research, and shipped-ledger files have a
  single navigation map without moving active planning inputs.

### 2026-05-24 — Support snapshot redaction preview

- The dashboard's "Export Snapshot" button used to dump script names,
  URLs, error log, recent network log, denied hosts, and the public API
  audit to a JSON file with no opt-out. Replaced the one-click export
  with a redaction-preview modal that lists 13 data categories, defaults
  the 7 sensitive ones to OFF, and shows a per-category description so
  users can see exactly what each checkbox unlocks before anything
  reaches disk.
- Runtime status and counts are always-on because the bundle is useless
  for support without them and neither contains personal data. Backup
  inventory, sync provider summary, recovery schedule, and trusted
  signing key names default to ON. Script inventory, activity log,
  error log, network log, denied hosts, public API audit, and public
  API trusted-origins/permissions default to OFF and carry a
  `sensitive` visual flag in the modal.
- The exported JSON is now schema v2 with a top-level `redactionProfile`
  block listing both `includedCategories` and `excludedCategories` so a
  reviewer can see at a glance what data was redacted versus what
  simply didn't exist.
- The builder skips the matching `chrome.runtime.sendMessage` round-trip
  for any opted-out category, so a snapshot with everything sensitive
  unticked never even fetches the error log or network log.
- Added `pages/dashboard.css` styles for `.snapshot-redaction`,
  `.snapshot-category`, and the sensitive variant; the support-section
  copy in `pages/dashboard.html` now describes the opt-in model.
- Regression coverage in `tests/support-snapshot-redaction.test.js`
  (13 cases — category inventory, sensitive/always-on/default-on
  classifications, modal flow, always-on forcing, conditional fetch
  wiring per category, schema v2 redactionProfile fields, conditional
  attachment of every snapshot block, HTML and CSS surface checks).

### 2026-05-24 — Chrome 138 chrome.userScripts.update adoption

- Added `reregisterScript(script)` plus `_supportsUserScriptsUpdate()` in
  both the runtime (`background.core.js`) and the TypeScript mirror
  (`src/background/registration.ts`). The helper feature-detects Chrome
  138's `chrome.userScripts.update` and swaps a single script's
  registration in place when available, avoiding the brief unregistered
  window where a tab navigation could miss the script. Falls back to
  the existing unregister + register cycle for Chrome 130-137.
- `registerScript` now accepts a `{ useUpdate: true }` option that routes
  the underlying `chrome.userScripts.register([...])` call through the
  new `update([...])` path when supported. On "no matching script" the
  branch falls back to `register` so the first save after a service
  worker restart still registers cleanly.
- Migrated the two highest-frequency call sites (`saveScript` and the
  `setScriptSettings` toggle path) to call `reregisterScript` instead of
  the manual unregister + register pair. Other call sites (bulk reload,
  install, factory reset) keep the explicit pair; their cadence makes
  the flicker risk small and migration is a follow-up.
- Regression coverage in `tests/reregister-script.test.js` (9 cases —
  runtime helper presence, TS mirror presence, both call-site migrations
  pinned, runtime + TS useUpdate option, branch behavior for the three
  routes: disabled / Chrome 138 enabled / older Chrome enabled).
- Rebuilt `background.js` (22,657 lines).

### 2026-05-24 — Install-time optional permission gating

- Installing a script with `@grant GM_cookie` previously left the script
  silently broken because the optional `cookies` permission declared in
  manifest.json was never requested at install. Same for `GM_setClipboard`
  and the `clipboardWrite` permission. The install page now requests the
  matching Chrome optional permission inside the install button's
  user-gesture window via `chrome.permissions.contains` + `request` before
  the save round-trips to the background worker.
- Grant tags for `GM_cookie` / `GM.cookie` / `GM_setClipboard` /
  `GM.setClipboard` get a `*` hint badge and a tooltip noting the
  follow-up Chrome prompt; the section grows a one-line caption when any
  of those grants are present so reviewers can predict the flow.
- The trust receipt schema (`src/types/script.ts`) and both the runtime
  builder (`background.core.js`) and the TS mirror
  (`src/background/trust-receipt.ts`) now persist
  `optionalPermissions: { requested, granted, denied, unavailable }` so
  users can see later which prompts they accepted. `null` for receipts
  that didn't surface a prompt (sync, internal saves, legacy entries).
- Switched `vitest.config.mjs` from the removed `poolOptions.vmThreads`
  shape to the Vitest 4 top-level `maxWorkers`/`minWorkers` keys; the
  default pool stays `vmThreads` with single-worker concurrency.
- Added `chrome.permissions.contains` + `remove` mocks to `tests/setup.js`
  so jsdom tests can exercise the new install-page flow.
- Regression coverage in `tests/install-optional-permissions.test.js`
  (11 cases — grant-to-permission map, dedup across snake_case/dot
  variants, no-op for safe-grant-only scripts, no-op for empty grant
  arrays, contains() short-circuit when already granted, denied path
  recorded, contains() rejection falls back to request, plus source-pin
  tests that handleInstall wires the result into saveScript trust data).

### 2026-05-24 — Wrapper parity wave + per-site control docs

- Added `GM_head` to the TypeScript wrapper mirror at
  `src/background/wrapper-builder.ts` so a future TS-runtime promotion
  cannot drop the convenience HEAD helper that the install page already
  advertises and the runtime already implements.
- Added `requireInteraction` passthrough across the four notification code
  paths (runtime wrapper send + update, TS wrapper send, runtime background
  create + update handlers). Scripts that need pinned notifications now
  match Tampermonkey/Violentmonkey behavior. Regression coverage in
  `tests/notification-require-interaction.test.js` (6 cases).
- Tightened the `@webRequest` parser in both runtime `background.core.js`
  and the `src/background/parser.ts` mirror to validate selector + action
  shape before handing the rule to the DNR rule builder. Malformed entries
  are dropped instead of silently propagating through to the DNR API.
  Regression coverage in `tests/parser-webrequest.test.js` (8 cases).
- Baked `pool: "vmThreads"` with single-worker concurrency into
  `vitest.config.mjs` as the default so contributors and CI no longer need
  to pass `--pool=vmThreads --maxWorkers=1` to dodge the recurring
  `@exodus/bytes` and shared-drive access-violation crashes.
- Added a "Per-Site Control" section to the README documenting the three
  independent layers (`deniedHosts`, blacklist mode, whitelist mode) that
  were already shipped but invisible in the public listing.
- Rebuilt `background.js` (22,584 lines).

### 2026-05-24 — README marketing parity with shipped runtime

- Reconciled the README marketing copy with the actual runtime: removed
  references to four modules that were deleted in v2.0.0 (AI Assistant,
  Performance Dashboard, Script Analytics, Onboarding Wizard) and rewrote
  the Smart Recommendations line to drop the "AI-powered" claim because the
  current module is heuristic only.
- Replaced the "Browser Sync" entry in the sync provider table with the
  shipped S3-compatible provider, and called out Easy Cloud + GitHub Gist
  as separate-module sync flows.
- Updated the Chrome/Tampermonkey/Violentmonkey comparison table to list
  the actual five providers instead of the legacy "Cloud Sync (4 providers)".
- Added `scripts/check-readme-claims.mjs` plus `npm run readme:check` as
  a CI gate that fails when README marketing copy resurrects deleted module
  names, claims a sync provider that is not in `CloudSyncProviders`, or
  references a `pages/dashboard-*.js` file that no longer exists. Wired
  into `.github/workflows/ci.yml` after the existing store-copy gate.
- Regression coverage in `tests/check-readme-claims.test.js` (4 cases —
  live-README pass, JSON shape, intentional deleted-module regression,
  intentional missing-module regression).

### 2026-05-24 — Dashboard search focus refinement

- Removed the double focus treatment on the installed-userscripts search field
  by excluding it from the broad accessibility-module blue outline rule.
- Kept keyboard focus visible with the polished green input ring in normal mode
  and restored the stronger blue outline only for the explicit high-contrast
  accessibility class.
- Added regressions so the accessibility layer cannot double-paint the script
  search focus state again.

### 2026-05-24 — Dashboard search field polish

- Shortened the installed-userscripts search placeholder so it no longer clips
  inside the dense toolbar while preserving the full search grammar in the
  tooltip and accessible label.
- Widened the dashboard search flex target and restored icon-safe left/right
  input padding after scaled-control CSS runs.
- Added regressions for the compact search copy and final CSS padding cascade.

### 2026-05-24 — Dashboard table header anchoring

- Fixed the installed-userscripts table header overlapping the third/fourth
  visible row by restoring `overflow: clip` on the final table-shell CSS
  cascade, preserving rounded-corner clipping without trapping sticky headers.
- Added a dashboard accessibility-surface regression so future polish layers
  cannot silently switch the script table container back to `overflow: hidden`.
- Verified the rendered dashboard geometry in headless Chrome: the header stays
  at the table top and above the first row with no page errors.

### 2026-05-24 — Bounded fetch UTF-8 fallback

- Tightened the shared bounded text reader so its non-stream fallback measures
  UTF-8 bytes instead of JavaScript string length before accepting a response.
- Updated the runtime `background.core.js` helper, TypeScript mirror, and
  rebuilt `background.js` from the corrected guard.
- Added regressions for multibyte fallback bodies in both the extracted
  runtime helper and TypeScript parity suite.

### 2026-05-24 — NPM resolver response-size hardening

- Added bounded streamed response reads to the `npm:` package resolver so CDN
  and registry responses without `Content-Length` cannot buffer beyond the
  5 MB cap before rejection.
- Regenerated the promoted `modules/npm-resolve.js` runtime artifact and
  rebuilt `background.js` from the updated TypeScript source.
- Added regressions for declared oversized responses and chunked oversized
  responses, including reader cancellation and no `response.text()` fallback.

### 2026-05-24 — Resource cache streamed-body hardening

- Replaced `@resource`/resource-cache `arrayBuffer()` reads with a bounded
  stream reader so responses without `Content-Length` are cancelled once they
  exceed the 5 MB cache cap.
- Preserved the generated runtime/TypeScript source path for `ResourceCache`
  and rebuilt `background.js` from the promoted source module.
- Added a streamed oversized-resource regression that verifies the reader is
  cancelled, `arrayBuffer()` is not called, and no oversized entry is cached.

### 2026-05-24 — Public API web-install hardening

- Hardened trusted web origins by normalizing entries to exact HTTPS origins,
  deduplicating them, rejecting wildcard/insecure/internal origins, and
  filtering legacy malformed entries on load.
- Rechecked the final response URL after web-install redirects and bounded
  chunked response reads without relying on `Content-Length`, preventing
  internal redirect fetches and oversized streamed installs from being read.
- Added Public API regressions for trusted-origin normalization, redirect
  refusal, and chunked size enforcement, plus made the content-bridge security
  suite independent from jsdom's static import path in Vitest workers.

### 2026-05-24 — Premium UX polish pass

- Added a dashboard cohesion layer for search, table focus, empty states,
  toast tones, disabled controls, and scaled-radius clamping so dense
  workspace views feel steadier across themes, density, and UI scale.
- Refined popup, side panel, and install-review feedback states with calmer
  microcopy, stronger focus/disabled affordances, better compact empty states,
  semantic toast roles, and skeleton-style loading treatment.
- Extended UX/a11y regression coverage for explicit dashboard search/empty
  semantics, toast tone contracts, cross-surface polish markers, and runtime
  radius guardrails.

### 2026-05-24 — Shared utilities TypeScript promotion

- Promoted `shared/utils.js` to a generated runtime artifact from
  `src/shared/utils.ts` using multi-global output for `escapeHtml`,
  `generateId`, `sanitizeUrl`, `classifyInstallSource`, and `formatBytes`.
- Ported `classifyInstallSource` into the TypeScript shared source so install
  and update source-trust classification is no longer JS-only.
- Added generated-runtime shared utility coverage for global bindings, URL
  sanitization, install-source classification, ID generation, and byte
  formatting.

### 2026-05-24 — I18n TypeScript promotion

- Promoted `modules/i18n.js` to a generated runtime artifact from
  `src/modules/i18n.ts`, moving another early service-worker module under the
  TypeScript authoritative-source generator.
- Updated the locale coverage extractor to accept generated CommonJS
  `var translations = ...` declarations as well as handwritten `const`
  dictionaries, keeping `npm run locale:check` compatible with generated
  runtime output.
- Added generated-runtime i18n coverage for regional locale normalization,
  placeholder substitution, and DOM translation attributes.

### 2026-05-24 — Analyzer TypeScript promotion

- Promoted `bg/analyzer.js` to a generated runtime artifact from
  `src/bg/analyzer.ts`, continuing the background-helper tranche after
  NetworkLog.
- Reconciled analyzer fallback drift before promotion: the TS source now keeps
  URL schemes intact while stripping comments and scans every long string for
  high entropy instead of only the first one.
- Added generated-runtime and source regressions for URL comment stripping and
  multi-string entropy detection, then rebuilt `background.js` from the
  generated analyzer artifact.

### 2026-05-24 — NetworkLog TypeScript promotion

- Promoted `bg/netlog.js` to a generated runtime artifact from
  `src/bg/netlog.ts`, starting the background-helper tranche of the
  TypeScript authoritative-source migration.
- Added `NetworkLog` to the TS runtime generator and promotion map so runtime
  network-log edits are now gated by `npm run ts-runtime:check` and
  `npm run ts-source:check`.
- Rebuilt `background.js` from the generated artifact and verified the
  existing runtime/source network-log behavior around newest-first reads,
  filters, stats, max-entry trimming, and targeted clears.

### 2026-05-24 — Migration TypeScript promotion

- Promoted `modules/migration.js` to a generated runtime artifact from
  `src/modules/migration.ts`, starting the sync/import tranche of the
  TypeScript authoritative-source migration.
- Extended the TS runtime generator and drift gate inventory for the
  migration module, plus added generated-runtime coverage for shape,
  quiet-hours migration, stamp idempotency, and legacy script normalization.
- Kept `Migration.CURRENT_VERSION` aligned with the current `2.3.0` runtime
  stamp so generated migration code does not downgrade existing installs'
  `sv_lastMigratedVersion` marker.

### 2026-05-24 — Storage TypeScript promotion

- Promoted `modules/storage.js` to a generated runtime artifact from
  `src/modules/storage.ts`, making the v3 IndexedDB-backed storage engine
  production-authoritative for scripts and GM value bags.
- Extended the TS runtime generator with multi-global exports so generated
  modules can expose `SettingsManager`, `ScriptStorage`, `ScriptValues`,
  `FolderStorage`, `TabStorage`, and the script-change hook expected by the
  concatenated service worker.
- Rewired MatchSet invalidation through `setScriptChangeListener`, removed
  duplicate notification click/close listener registration from the TS storage
  source, and refreshed runtime storage tests around migration, IDB deletes,
  value isolation, folder rollback, and generated-artifact shape.

### 2026-05-24 — Resource cache TypeScript promotion

- Promoted `modules/resources.js` to a generated runtime artifact from
  `src/modules/resources.ts`, continuing the storage/resource-layer
  TypeScript authoritative-source tranche.
- Reconciled ResourceCache TS drift before promotion: restored LR-002
  in-flight fetch deduplication and `chrome.storage.local.get(null)` cache-key
  enumeration behavior.
- Added source coverage for concurrent resource fetch deduplication and
  extended generator/drift coverage to eight promoted modules.

### 2026-05-24 — Internal host guard TypeScript promotion

- Promoted `modules/internal-host-guard.js` to a generated runtime artifact
  from `src/background/internal-host-guard.ts`, keeping the SSRF pre-flight
  and post-flight classifiers TypeScript-authoritative.
- Extended the TS runtime generator and drift-gate coverage to seven promoted
  modules, including the generated namespace-wrapper shape used by
  `InternalHostGuard`.
- Rebuilt `background.js` so resource, install, update, and local-script
  fetch paths consume the generated guard artifact.

### 2026-05-24 — XHR TypeScript promotion

- Promoted `modules/xhr.js` to a generated runtime artifact from
  `src/modules/xhr.ts`, starting the storage/resource-layer tranche of the
  TypeScript authoritative-source migration.
- Extended TS runtime generator and drift-gate coverage to six promoted
  modules, including `XhrManager`.
- Added source-side coverage for `XhrManager.buildFetchOptions()` cache,
  redirect, and anonymous credential translation.

### 2026-05-24 — UserStyles TypeScript promotion

- Promoted `modules/userstyles.js` to a TS-derived runtime artifact from
  `src/modules/userstyles.ts`, completing the current low-dependency module
  tranche in the TypeScript authoritative-source migration.
- Added `tests/userstyles.test.js` to exercise the generated runtime artifact
  for prior-CSS removal, scoped `@match` conversion, and full UserCSS metadata
  edit handling.
- Tightened `scripts/check-ts-source-drift.mjs` so first-time promotion commits
  are allowed when the promotion map changes from mirrored to promoted, while
  later promoted JS-only edits still fail the gate.

### 2026-05-24 — Quota manager TypeScript promotion

- Promoted `modules/quota-manager.js` to a generated runtime artifact from
  `src/modules/quota-manager.ts`, preserving the background concatenation
  contract while making the stronger TS implementation authoritative.
- Added `tests/quota-manager.test.js` to exercise the generated runtime
  artifact against object-map script breakdowns, cleanup actions, and
  aggressive critical-storage cleanup merging.
- Extended TS runtime artifact and drift-gate coverage to four promoted
  modules: ErrorLog, NotificationSystem, NpmResolver, and QuotaManager.

### 2026-05-24 — NPM resolver TypeScript promotion

- Promoted `modules/npm-resolve.js` to a TS-derived runtime artifact from
  `src/modules/npm-resolve.ts`, making the TS source authoritative for npm
  package resolution.
- Reconciled explicit `npm:pkg@latest` handling so the TS source resolves the
  current registry version before building CDN URLs, matching the runtime
  behavior.
- Extended runtime/source/generator/drift tests for three promoted modules and
  added regression coverage for explicit `@latest` resolution.

### 2026-05-24 — Notification TypeScript promotion

- Promoted `modules/notifications.js` to the same TS-derived runtime artifact
  path as ErrorLog, generated from `src/modules/notifications.ts` before
  `background.js` is built.
- Reconciled notification TS drift for fallback local click-context cleanup
  alarms and post-threshold error-count reset behavior.
- Extended TS runtime artifact checks and drift-gate expectations to cover two
  promoted modules, and added runtime/source tests for local-context cleanup
  plus error-count reset after notifications.

### 2026-05-24 — ErrorLog TypeScript promotion pilot

- Promoted `modules/error-log.js` to a generated runtime artifact from
  `src/modules/error-log.ts`, preserving the single-file background build
  while making the TypeScript source authoritative for the module.
- Added `scripts/generate-ts-runtime-modules.mjs`, `npm run
  ts-runtime:generate`, and `npm run ts-runtime:check`; CI now verifies the
  committed ErrorLog runtime artifact is in sync with its TS source.
- Reconciled the TS ErrorLog implementation with runtime debounce/flush
  behavior, including `SAVE_DEBOUNCE_MS`, `flush()`, `_save()`, cache reset
  hooks, and mutable `MAX_ENTRIES` compatibility for existing tests.
- Added `tests/ts-runtime-modules.test.js` and updated the source drift gate
  so `modules/error-log.js` is the first `promoted` TS-authoritative module.

### 2026-05-24 — TypeScript source drift gate

- Added `ts-source-promotion.json` to inventory each runtime JS surface, its
  TypeScript source counterpart, and whether it is mirrored, a promotion
  candidate, promoted, or intentionally divergent.
- Added `scripts/check-ts-source-drift.mjs` plus `npm run ts-source:check`
  and `npm run ts-source:report`; the default gate fails when promoted
  runtime JS changes without the matching TS source or generated artifact.
- Wired the TS source drift gate into CI and added
  `tests/ts-source-drift-gate.test.js` for map validation, report output,
  promoted-module violations, and candidate/divergent exemptions.

### 2026-05-24 — TypeScript authoritative-source design

- Added `docs/ts-authoritative-source-design.md`, choosing a staged
  promotion path where individual runtime JS modules are replaced by
  TS-derived runtime artifacts without changing the single-file service
  worker contract.
- Inventoried the current JS/TS split, documented known drift examples, and
  selected `modules/error-log.js` as the first pilot because it is isolated,
  already tested, and has concrete debounce/flush drift to reconcile.
- Proposed a promotion map plus drift gate that blocks future JS-only edits
  after a module is marked as TS-authoritative.

### 2026-05-24 — Per-script trust receipt diffs

- `createScriptTrustReceipt` now records `@require` body hashes, byte counts,
  and added/removed/changed/unverified dependency changes when an update is
  applied.
- Update receipts now diff `@grant`, `@connect`, and `@match` permissions
  against the previous script version, while preserving rollback-point receipt
  behavior for version history entries.
- The dashboard recent-update banner includes a `Review changes` action when
  auto-updated scripts carry dependency or permission deltas, opening a modal
  that lists each changed dependency and permission addition/removal.
- Added `tests/trust-receipt-diff.test.js` for dependency hashes, permission
  diffs, `applyUpdate` persistence, and dashboard/banner wiring.

### 2026-05-24 — Dashboard large-library virtualization

- Added `pages/dashboard-virtual-rows.js`, a small table virtualizer that
  renders only the visible script rows plus before/after spacer rows for large
  flat dashboard libraries.
- Dashboard table rendering now switches to the virtual path when
  `state.scripts.length` exceeds the tunable
  `dashboardVirtualizationThreshold` setting, while preserving the direct
  render path for smaller libraries and folder-grouped views.
- Extended `scripts/smoke-large-library.mjs` with 1k and 10k dashboard render
  p99 checks, and added `tests/dashboard-virtual-rows.test.js` for spacer
  math plus visible-window rendering.

### 2026-05-24 — Disabled ESM userscript bundler R-1

- Added the off-by-default `experimentalESMUserscripts` setting and parser
  detection for `@module 1` plus Violentmonkey's `@inject-into module`.
- Added `bg/esm-bundler.js` and `src/bg/esm-bundler.ts`. The bundler uses
  the offscreen Acorn parser to discover static imports/exports, rewrites
  imports to a local `__require(...)` module table, recursively fetches
  dependencies through the existing `fetchRequireScript` path, and rejects
  dynamic `import()` with an author-visible error.
- Install and update paths now bundle ESM scripts only when the experimental
  flag is enabled; with the default setting they reject ESM scripts without
  changing the classic userscript path.
- Added `tests/esm-bundler.test.js` and `tests/esm-csp.test.js` covering
  metadata detection, default-off gating, static import rewrite, transitive
  dependency expansion, dynamic-import rejection, and failed dependency/SRI
  fetch rejection.

### 2026-05-24 — Manifest generator implementation

- Added `scripts/generate-manifest-firefox.mjs` plus
  `manifest-firefox.transformations.json`. The Firefox profile now
  regenerates the committed `manifest-firefox.json` byte-for-byte from
  `manifest.json`, and the Edge profile produces the staged
  `build-edge/manifest.json`.
- `build-firefox.sh` now fails early on generated-manifest drift before
  packaging, while `scripts/build-edge.mjs` uses the same generator instead
  of an inline `EDGE_TRANSFORMS` object.
- Added `tests/manifest-generator.test.js` for round-trip parity,
  idempotent transformations, parseability, and Firefox/Edge schema shape.
  Refreshed the Firefox package gate to assert the generator check.

### 2026-05-24 — Quick Wins consolidation pass

- Closed every roadmap "Quick Win" bullet by either implementing it,
  pinning the existing implementation with a documented reference, or
  ticking the work as part of the active session.
- Added `docs/readme-feature-claim-checklist.md` mapping every README
  feature claim to its code entry point and regression test, so a
  maintainer can verify the README is current on each release.
- Added `docs/dependency-audit-policy.md` codifying the existing
  `npm audit --audit-level=high --omit=optional` blocking gate with an
  explicit exception process and rejection of the "advisory-only"
  alternative.

### 2026-05-24 — Userstyle compatibility baseline

- Added `tests/userstyle-compat-fixtures.test.js` (18 cases) — seven
  representative UserCSS fixtures covering every `@var` type, both
  variable substitution shapes, `@-moz-document` blocks, multi-section
  bodies, and Japanese labels/defaults.
- Documented Chrome/Firefox parity, deferred items ("advanced color
  variables"), and a manual Firefox verification checklist in
  `docs/userstyle-compat.md`.

### 2026-05-24 — S3-compatible sync provider

- Added an `s3` provider to `CloudSyncProviders` with a full AWS Signature
  v4 implementation using Web Crypto SubtleCrypto (HMAC-SHA256 + SHA-256;
  no SDK). Works against AWS S3, Cloudflare R2, MinIO, Backblaze B2, and
  any other S3-compatible endpoint.
- URL construction automatically handles virtual-host style for AWS hosts
  and path-style for everything else. `s3PathStyle: true` forces
  path-style on AWS endpoints.
- Structured `validate()` returns `{ valid, errors[] }` for per-field UI
  feedback covering endpoint URL scheme/path, region, bucket name, and
  credential presence.
- Settings UI: new "S3-compatible (AWS / R2 / MinIO / B2)" option in the
  Userscript Sync provider picker, with a six-field settings block
  (endpoint, region, bucket, access key ID, secret key, object key
  override). Saved and loaded alongside other providers.
- Added `s3*` fields to the `Settings` type, the `SyncProvider` union,
  and `src/config/settings-defaults.json`.
- Added `tests/s3-sync-provider.test.js` (21 cases — validation, URL
  construction, SigV4 signing, upload/download/test round-trip against a
  mock server, disclosure + status + disconnect).

### 2026-05-24 — ESM userscript + local-dev research

- Added `docs/esm-userscript-research.md`. Identifies the install-time
  pre-bundling shape as the only viable ESM path under MV3 (`<script
  type="module">` page injection is rejected on isolation grounds),
  documents the CSP envelope, requires reuse of existing SRI / host /
  bounded-fetch audit gates, and rejects runtime `import()` permanently.
- Local-dev mode chooses an SSE-from-localhost loop under a future
  Developer Mode panel; filesystem watchers are not viable in MV3.
- Phased migration R-1 → R-5, all gated off-by-default. Reserved
  `tests/esm-bundler.test.js` + `tests/esm-csp.test.js` as the bundler
  verification gate.

### 2026-05-24 — Microsoft Edge Add-ons package path

- Added `scripts/build-edge.mjs` that runs the standard esbuild pipeline,
  stages a Chrome-derived package under `build-edge/`, applies a small
  declarative manifest transform set (today: strip `update_url`), runs a
  missing-file audit, and produces
  `edge-artifacts/scriptvault-edge-vX.Y.Z.zip` plus a sidecar build report.
- npm scripts wired: `build:edge`, `build:edge:check`, `build:edge:stage`.
- Submission checklist + manifest-difference table + unsupported-permissions
  slot at `docs/edge-submission.md`.
- `build-edge/` and `edge-artifacts/` added to `.gitignore`.
- Added `tests/edge-build.test.js` (5 cases) verifying the staged build
  contents, manifest transform, summary JSON shape, and --check exit
  code.

### 2026-05-24 — Manifest generation design doc

- Added `docs/manifest-generation-design.md`. Measured the current Chrome
  vs Firefox manifest drift (108 diff lines across 8 sections), evaluated
  WXT vs a thin generator script vs status quo, and chose Option B
  (generator) with documented next steps. WXT was rejected because it
  conflicts with the inlined service-worker build pipeline that Chrome
  MV3 requires.

### 2026-05-24 — Locale coverage CI gate

- Added `scripts/check-locales.mjs` which audits `_locales/*/messages.json`,
  `modules/i18n.js` runtime dict, and `pages/dashboard-i18n-v2.js`
  dashboard dict for key-set parity, cross-source locale-set agreement,
  and translation-coverage shortfalls.
- Wired three npm scripts with documented severity tiers:
  `npm run locale:check` (report only),
  `npm run locale:check:gate` (fails on `_locales/` drift + cross-source
  mismatches — the manifest-shipping surfaces), and
  `npm run locale:check:strict` (also fails on inline-dict drift; opt-in
  until the runtime-dict backfill lands).
- Added `tests/check-locales-report.test.js` so the JSON contract + exit
  codes are pinned in CI.
- Documented the gate, surfaces, and follow-up backfill in
  `docs/locale-coverage.md`.

### 2026-05-24 — Install-source trust badges + source-change warning

- Added shared `classifyInstallSource(url)` helper in `shared/utils.js` that
  maps install/update URLs to known registries (Greasy Fork, Sleazy Fork
  warn-tier, OpenUserJS, GitHub Gist / raw / repo / release with release
  promoted to good-tier, GitLab, Codeberg, Bitbucket, Tampermonkey site,
  and `other` for unknown hosts). Empty input returns the `local` shape.
- `installFromCode` persists `script.installSource` on install; `applyUpdate`
  reclassifies on update and sets `settings.sourceIdentityChanged = true`
  plus `previousInstallSource` when the registry id changes.
- Dashboard script rows render a tone-coded source badge near the name
  (`script-health-badge .good`, `.neutral`, or `.alert`) and a "Source
  changed" warning badge whenever `settings.sourceIdentityChanged` is true.
- Install confirmation page's trust card surfaces a "Source registry
  changed" review row when re-installing from a different registry than
  the original install.
- New `.script-health-badge.good` and `.neutral` CSS variants reuse the
  existing 8px corner radius (never pill backdrops).

### 2026-05-24 — Dashboard search corpus widened + editor find history

- Dashboard search now matches against a single flattened corpus per
  script: name/description/author/namespace/version plus every URL pattern
  field (`match`, `include`, `exclude`, `userMatches`, `userIncludes`,
  `userExcludes`), tags (`meta.tag` + `settings.tags`), grants,
  homepage/support/update/download URLs, and ISO yyyy-mm-dd renderings of
  `stats.lastRun` and `updatedAt`. Plain substring, `code:`, regex
  (`re:` / `/.../flags`), and the invert prefixes (`!`, `not:`) all
  benefit. Corpus is memoized per-script keyed on `updatedAt`.
- Monaco find widget now persists its search history to
  `chrome.storage.local.editorFindHistory` (FIFO 20, dedup) and primes
  the widget with the most recent term when the editor opens. Sandbox
  forwards every `findController` searchString change via
  `postMessage({type:'find-search'})`; adapter records and primes via
  `prime-find`.

### 2026-05-24 — Site-scoped controls, invert search, and per-script frame mode

- Added a per-script `settings.frameMode` (`'top'` | `'all'` | `'default'`)
  that overrides `@noframes` when computing `allFrames` for
  `chrome.userScripts.register`. Honored in both runtime `background.core.js`
  and the TS mirror `src/background/registration.ts`. Added to `EXEC_KEYS`
  so a setting change re-registers the script.
- Dashboard per-script Execution panel gains a Frame mode select with the
  three documented options. Serialized in `saveScriptSettings` and
  `resetScriptSettings`.
- Dashboard search bar now recognizes `!term` and `not:term` prefixes as
  inverted matches against name/description/author/code. Honored across
  substring, `code:`, and regex (`re:` / `/.../flags`) shapes. An empty
  payload after the prefix keeps all rows, and the literal `!=` is
  preserved (not stripped as an invert).
- Popup gains a `Run only on this domain` quick-action that flips
  `pageFilterMode` to `whitelist` and adds `https://<host>/*` to
  `whitelistedPages`. Toggles back to `blacklist` on a second click and
  refreshes its label when the utilities menu opens.

### 2026-05-24 — Large-library perf harness and threshold gate

- Added `scripts/smoke-large-library.mjs`, a Node harness that generates 1k
  and 10k synthetic scripts, exercises the authoritative `MatchSet` from
  `src/background/url-matcher.ts`, and measures build / `getCandidates` /
  `getMatching` p50 + p99 / substring search / `localeCompare` sort cost.
- Added `scripts/ts-loader.mjs` so the smoke script can import the TS source
  directly via esbuild (already a dev dep) without a separate build step.
- Added `npm run smoke:large-library` (report only) and
  `npm run smoke:large-library:check` (exit 1 on threshold violation).
- Mirrored a CI-safe 1k pass in `tests/large-library-perf.test.js` so a
  regression fails the standard test suite (5 cases).
- Documented thresholds and harness shape in `docs/large-library-perf.md`.

### 2026-05-24 — Restore receipts, backup verification, and undoable imports

- Added `BackupScheduler.verifyBackup(backupId, { parseUserscript })` which
  walks every userscript in an archive, validates options/storage JSON plus
  `global-settings.json`/`folders.json`/`workspaces.json`, and reports
  per-script parse errors, missing options, structural validity, and
  install-id conflicts without mutating state. Exposed via the new
  `verifyBackup` background action and a **Verify** button in the backup
  review modal.
- `restoreBackup` now snapshots the live script + values state (plus
  settings/folders/workspaces on full restore) before mutation and persists
  a `restoreReceipts` ledger entry (FIFO cap 10). The receipt id is returned
  in the result so the dashboard restore toast can offer a 15-second
  **Undo** action.
- Added `rollbackRestore` background action that re-applies the snapshotted
  state, deletes scripts the restore added (via the receipt's
  `addedScriptIds`), and marks the receipt as rolled back so a second
  rollback responds with `alreadyRolledBack`.
- `importScripts` and `importFromZip` now snapshot every overwritten script
  into `versionHistory` (with `source: 'import'` + caller-supplied label)
  and record an import receipt with the same shape as restore receipts.
  Dashboard ZIP/JSON import toasts now surface the same **Undo** action so
  an overwriting import is reversible end-to-end.
- Added `getRestoreReceipts`, `getRestoreReceipt`, and
  `clearRestoreReceipts` actions so the dashboard can inspect or clear the
  ledger.
- Added regression coverage in `tests/backup-receipts.test.js`
  (verifyBackup, restoreBackup snapshot, rollback, retention) and
  `tests/import-snapshot.test.js` (versionHistory push + receipt recording
  for both `importScripts` and `importFromZip`).

### 2026-05-24 — Sync safety cockpit

- Added shared sync-provider health metadata for WebDAV, Google Drive,
  Dropbox, OneDrive, and EasyCloud, including last-sync reporting,
  manual-sync capability flags, dry-run support flags, and token/credential
  storage disclosure without exposing stored secret values.
- Added dashboard controls to check provider health, run a no-write dry-run
  conflict preview, and revoke or clear saved provider access from the
  Userscript Sync settings panel.
- Added a no-write `CloudSync.preview()` path that compares local and remote
  sync envelopes and reports local-only, remote-only, newer, tombstoned, and
  potential 3-way conflict counts before a real sync mutates local or remote
  data.
- Hardened WebDAV parity with status and local credential clearing, and made
  the Gist panel's token storage copy match the current `chrome.storage.local`
  model.
- Added provider, cloud-sync, and dashboard wiring coverage in
  `tests/source-sync-providers.test.js`, `tests/source-cloud-sync.test.js`,
  and `tests/sync-cockpit.test.js`.

### 2026-05-24 — Browser support matrix generator

- Added `scripts/generate-browser-support-matrix.mjs` plus
  `npm run support:matrix` / `npm run support:matrix:check` to generate the
  README and cross-browser pipeline support matrix from the Chrome and Firefox
  manifests plus the latest Firefox lint artifact.
- CI now checks the generated matrix after Chrome dashboard smoke and Firefox
  package validation, so manifest target or lint-result drift must update the
  support claims.
- Added `scripts/run-bash.mjs` and routed Firefox package scripts through it so
  Windows PowerShell can find Git Bash even when `bash` is not on `PATH`.

### 2026-05-24 — Accessibility surface pass

- Added forced-colors system-color fallbacks for dashboard, popup, side panel,
  and install surfaces so Windows High Contrast mode does not depend on
  decorative shadows, gradients, or custom color-only focus rings.
- Added skip links for popup, side panel, and install pages, and raised compact
  popup/side-panel script toggles to 24px-class touch targets.
- Expanded `npm run test:a11y` to run dashboard, popup, cross-surface UX, and
  the new `tests/accessibility-surface-pass.test.js` forced-colors/live-region
  audit.

### 2026-05-24 — CSV export formula-injection coverage

- Inventory confirmed the current CSV emitters are dashboard stats, CSP
  reports, and error-log exports; there is no current netlog CSV exporter.
- Refactored dashboard stats CSV generation through a small pure builder so the
  production formatter is directly covered by tests.
- Added `tests/csv-export-formula.test.js` covering dashboard stats and CSP
  report formula-control defanging across leading `=`, `+`, `-`, `@`, tab, and
  carriage-return payloads. Existing error-log tests continue covering the
  error-log CSV exporter.

### 2026-05-24 — Install/update trust receipts and rollback points

- Added `src/background/trust-receipt.ts` and runtime receipt helpers that
  record the latest install/update receipt on each script.
- Trust receipts now include install/update source, SHA-256 hashes, grants,
  host scope, `@require`/`@resource` dependency counts, line diff summary, and
  a concrete `rollbackScript` restore target when a previous version exists.
- Install-page saves pass the reviewed source URL and operation (`install`,
  `update`, `reinstall`, or `downgrade`) into `saveScript`; direct
  `installFromUrl`/`installFromCode` and auto/manual `applyUpdate` paths record
  receipts too.
- Update checks now carry `sourceUrl` through dashboard/popup apply-update
  calls so receipts identify the fetched update channel.
- Dashboard script info now shows the latest trust receipt summary beside the
  existing provenance and version-history rollback controls.
- Added `tests/trust-receipt.test.js` covering receipt hashes/source/scope/
  dependencies/diff fields and the update rollback-point receipt contract.

### 2026-05-24 — Shared internal-host / SSRF / redirect fetch policy

- Added `src/background/internal-host-guard.ts` and the runtime mirror
  `modules/internal-host-guard.js` as the canonical IPv4/IPv6
  loopback/private/link-local/CGNAT/unspecified/broadcast/ULA classifier.
  Handles `localhost*` aliases and both textual (`::ffff:10.0.0.1`) and
  WHATWG-normalized (`::ffff:a00:1`) IPv4-mapped IPv6 forms, plus the
  `169.254.169.254` cloud-metadata address.
- Wired pre-flight `classifyFetchUrl` / `assertExternalFetchUrl` and
  post-flight `classifyResponseUrl` (against the response's final URL) into:
  - `installFromUrl`, context-menu link install, and the `webNavigation`
    `.user.js` interceptor (script install paths).
  - `fetchWithRetry`, `fetchRequireScript`, and `GM_loadScript` (dynamic
    script/dependency loaders).
  - `ResourceCache.fetchResource` in both runtime JS and the TypeScript mirror
    (@resource fetcher).
  - `UpdateChecker.fetchUpdateCandidate` in both runtime JS and the TypeScript
    mirror (auto-update fetch).
- Updated `esbuild.config.mjs` to concatenate `modules/internal-host-guard.js`
  before `modules/resources.js` so the runtime mirror is in scope for
  every fetch path that depends on it.
- Added parity and focused end-to-end tests that compare the JS mirror and TS
  module side-by-side across every CIDR block, IPv6 form, and edge case, then
  prove install, update, @require, and @resource paths reject pre-fetch internal
  hosts and post-fetch redirect targets that resolved to private space.

### 2026-05-24 — User-script messaging gate

- Added `USER_SCRIPT_MESSAGING_AVAILABLE` feature detection for
  `chrome.runtime.onUserScriptMessage` (Chrome 131+); the dedicated listener
  remains the primary route for user-script-origin GM_* and telemetry calls.
- Hardened the shared `chrome.runtime.onMessage` listener: tab-origin senders
  (anything that does not originate from a `chrome-extension://<id>/` URL on
  this extension) are now restricted to the same user-script allowlist
  (`GM_*`, `GM.*`, `netlog_record`, `reportExecError`, `reportExecTime`). This
  closes the Chrome 130 / Firefox-without-onUserScriptMessage fallback path
  where a user script using `chrome.runtime.sendMessage` could otherwise reach
  privileged dashboard actions.
- Added six new contract tests in `tests/content-bridge-security.test.js`
  covering allow/deny for tab vs extension-surface senders, spoofed
  `chrome-extension://` origins, and listener registration on supporting and
  non-supporting runtimes.

### 2026-05-24 — Permission and store-copy drift gate

- Added `docs/store-listing-copy.md` as the reviewer-facing permission and
  privacy copy source for Chrome Web Store and AMO submissions.
- Expanded `PRIVACY.md` with a generated-checkable manifest surface inventory
  covering permissions, optional permissions, host matches, content-script
  matches, web-accessible resources, sandbox pages, and Firefox data-collection
  declarations.
- Added `npm run store-copy:check` and wired it into CI/release docs so
  manifest permission changes now fail unless privacy/store copy is updated.
- Added a README permission review section that points maintainers to the
  store-copy source and local validation command.

### 2026-05-24 — Chrome 138+ userScripts onboarding

- Centralized the runtime `chrome.userScripts.getScripts()` availability probe
  behind `getExtensionStatus`, so popup, dashboard diagnostics, support
  snapshots, repair, and registration share the same live setup state.
- Added version-aware setup state/action/url fields for Chrome 138+ **Allow
  User Scripts**, Chrome 120-137 **Developer Mode**, and unsupported browsers.
- Updated runtime repair to stop trusting stale `_userScriptsAvailable`; it
  now re-probes after the user enables the toggle and only re-registers scripts
  when the API is actually available.
- Refreshed popup/dashboard setup banners, README source-install instructions,
  and focused status tests for the Chrome 138+ transition.

### 2026-05-24 — Firefox AMO validation gate

- Added explicit AMO `browser_specific_settings.gecko.data_collection_permissions`
  and moved Firefox `userScripts` to `optional_permissions`, with Firefox
  desktop/Android minimums raised to versions that support those manifest keys.
- Added `web-ext@^10.2.0`, `npm run firefox:lint`, and
  `npm run firefox:package`; the package command emits a Firefox ZIP, AMO
  source-review ZIP, and `web-ext-lint.json` under `firefox-artifacts/`.
- Wired Firefox lint/package validation into CI and uploaded Firefox artifacts
  alongside the existing Chrome package artifacts.
- Guarded Chrome-only per-script `worldId` in both runtime JS and the
  TypeScript registration mirror so Firefox never receives the unsupported
  field.
- Omitted `lib/monaco/` from the Firefox validation package until the dedicated
  Monaco loading-path pass; the existing textarea adapter remains the fallback.

### 2026-05-24 — Release trust gate

- Added `npm run release:trust` to inspect the built Chrome ZIP, generate
  SHA-256 checksums, create a source ZIP from `git archive`, emit a
  CycloneDX 1.6 SBOM from `package-lock.json`, write SLSA-shaped provenance,
  and fail on missing/forbidden package entries.
- Added `npm run release:trust:strict` for maintainer-key signing of the
  checksum manifest with `RELEASE_SIGNING_PRIVATE_KEY_PEM` or
  `RELEASE_SIGNING_PRIVATE_KEY_PATH`.
- Wired the release trust gate into CI after `bash build.sh`, uploaded
  `release-artifacts/*` with the Chrome package, and added GitHub artifact
  attestations for the ZIP and SBOM on `main` pushes.

### 2026-05-24 — Release rollback storage drill

- Added `npm run release:rollback-drill`, a focused Vitest command that seeds
  the previous public `chrome.storage.local` script/value shape, upgrades
  through the current v3 storage migration, verifies current IndexedDB reads,
  verifies rollback-readable legacy keys, and confirms the 30-day legacy wipe
  gate.
- Wired the rollback drill into CI and the release runbook so storage migration
  regressions block release before users depend on browser rollback.
- Extended v3 migration tombstone metadata with migrated script/value counts
  and made `getMigrationStatus()` report those counts instead of returning
  zero migrated values.

### 2026-05-24 — Release runbook and CWS audit gate

- Updated `docs/release-runbook.md` so the documented release path matches the
  current manual `publish.sh` + Chrome Web Store API v2 flow instead of the
  still-pending OIDC release workflow.
- Added `npm run cws:check` to validate the installed CWS upload CLI, Node
  engine, v4-only credential model, removed flag usage, `publish.sh`,
  `cws-setup.sh`, and CI release-gate wiring without requiring store
  credentials.
- Made the CI high-severity npm audit blocking, added CWS tooling and release
  artifact parity checks to CI, and fetched tags in checkout so
  `npm run release:check` can validate the current release tag.
- Locked shell scripts to LF line endings with `.gitattributes` and corrected
  CWS setup/publish copy to avoid stale "auto-publish" wording.

### 2026-05-24 — Release artifact reconciliation

- Published the missing GitHub Release for `v3.11.0` and attached
  `ScriptVault-v3.11.0.zip` built from the `v3.11.0` tag.
- Removed the stale root `ScriptVault-firefox-v2.1.7.xpi` artifact from the
  working tree so root package artifacts no longer contradict the current
  3.11.0 manifests.
- Added `npm run release:check` / `npm run release:check:public` to verify
  package, Chrome manifest, Firefox manifest, README, changelog, local root
  artifacts, Git tag, latest GitHub release, and release asset alignment.

### 2026-05-24 — Engineering hardening pass

- Hardened GM_webRequest declarativeNetRequest cleanup so failed DNR removals
  keep their persisted owner map for retry instead of stranding live rules.
- Rolled back newly added DNR rules when `_webRequestRuleMap` persistence fails,
  avoiding ownerless rules after service-worker restarts.
- Brought the TypeScript DNR mirror up to parity with runtime persistence,
  hydration, removal, and reconciliation behavior, with regression tests for
  restart hydration, persistence rollback, removal retry, and orphan reconcile.
- Brought the TypeScript wrapper mirror up to parity with the runtime
  page-scoped `window.onurlchange` dispatcher so future wrapper builds do not
  restack history patches on script re-injection.
- Added a shared TypeScript `fetchTextBounded` helper and moved the TS install,
  update, @require/resource, and context-menu install paths off raw
  `response.text()` reads so the mirror now matches runtime bounded-fetch
  hardening.
- Added `tests/source-hardening-parity.test.js` to guard bounded TS fetches,
  empty-grant denial in the wrapper mirror, and promise-based Gist token
  storage rejection propagation.
- Updated repo working notes to remove the now-fixed DNR orphaning and
  `window.onurlchange` stacking items from the remaining-issues list.

### 2026-05-24 — Premium UI polish pass

- Normalized dashboard, popup, side panel, install review, DevTools, Script Store,
  card view, collections, profiles, snippets, templates, and keyboard overlay
  surface styling to use rectangular 4-8px radii instead of oversized pill/card
  backdrops.
- Replaced blur-heavy extension-page backdrops with solid/linear layered
  surfaces, tightened focus rings and disabled states, and added calmer loading
  skeletons to the popup and side panel.
- Improved empty/error/status copy in popup, side panel, and DevTools so failed
  background connection, unsupported pages, empty vaults, and empty request
  tables explain the next useful action instead of feeling blank.
- Refined the dashboard Find Userscripts flow with a calmer directory-search
  header, structured empty/error/loading states, source-aware result counts,
  preview-region semantics, install/reinstall label recovery, and explicit
  unavailable-preview/install feedback.
- Guarded more dashboard settings and utility actions with pending button
  states, single section-level save confirmations, and consistent failure
  feedback so repeated clicks do not create duplicate saves or ambiguous
  long-running operations.
- Replaced remaining dashboard utility "Loading..." placeholders and inline
  network-log empties with consistent ellipsis/status language and shared
  empty-state styling.
- Refined install-review terminal states with semantic success/error panels,
  clearer "no script was saved" failure recovery, private-window guidance, and
  a primary dashboard handoff after successful installs.
- Converted the CSP bypass panel to real disclosure/switch controls with
  explicit security-warning copy and keyboard-visible focus treatment.
- Added a GUI audit guard that fails when page UI CSS reintroduces oversized
  rounded backdrops or blur-heavy chrome.

### 2026-05-24 — TS-mirror drift cleanup + repo hygiene

- **Phase 39.11** TS-mirror parity. `@match-top` / `@exclude-top` (TM #2784)
  was shipped in `background.core.js` during the v3.11.0 wave but the
  typed mirror lagged. Added `matchTop` / `excludeTop` to `ScriptMeta`,
  taught the TS parser the hyphenated + camelCase forms via a new
  `ARRAY_ALIASES` map (also extends Phase 36.6 comma-split desugar to
  both keys), and ported the wrapper-side runtime guard block to
  `src/background/wrapper-builder.ts`. New `tests/match-top-39-11.test.js`
  pins 12 cases against the real TS parser + wrapper-builder.
- **Phase 39.13** TS-mirror parity. `GM_openInTab` now routes `blob:`,
  `data:`, and `about:` URLs through `window.open()` in-context in the
  TS wrapper too (was only in runtime JS). The blob registry binding
  survives because the URL never crosses into the background SW.
- **Phase 40.5** TS-mirror parity. `_notifCallbacks` (cap 500),
  `_openedTabs` (cap 200), and `_downloadCallbacks` (cap 200) in
  `src/background/wrapper-builder.ts` now each evict the oldest entry
  on cap. Prevents a misbehaving script that never receives the
  corresponding event from leaking unbounded entries in the
  USER_SCRIPT world.
- **Phase 40.14** TS-mirror parity. Eviction counters
  (`_notifCallbacksEvicted`, `_openedTabsEvicted`,
  `_downloadCallbacksEvicted`) log a one-line warning on the first
  eviction and every 100th thereafter so the DevTools panel can
  surface a "this script is leaking callbacks" hint without any
  telemetry beacon. New `tests/wrapper-gm-tabs-39-13.test.js` pins 8
  cases.
- **Phase 39.22** TS-mirror parity. The `_withTimeout` helper (VM
  #2513 — CSP-strict-page deadlock prevention) is now also in
  `src/background/registration.ts`: 15s per `@require` preload and 5s
  per `registerScript()` call inside `registerAllScripts`.
- **Repo hygiene**:
  - Removed `build-background.sh` (deprecated since the earlier local notes;
    `esbuild.config.mjs` has been the canonical builder for months).
    `build-firefox.sh` no longer falls back to the legacy bash builder.
  - Removed `pages/devtools-panel-v2.js` (orphaned — never reached by
    any caller; the active DevTools panel loads via
    `pages/devtools-panel.html` → `devtools-panel.js`). Dropped the
    dead `devtools` entry from `pages/dashboard-lazy-loader.js`
    `ON_DEMAND_MODULES`.
  - Synced `manifest-firefox.json` version 2.1.8 → 3.11.0 to stop the
    Firefox-port branch from drifting further during Phase 1 of the port.
  - Added the omnibox keyword `sv` to the README quick-start so users
    can discover the Phase 39.29 address-bar fuzzy-search affordance.
  - Added `RESEARCH_FEATURE_PLAN.md` (companion to `ROADMAP.md`)
    capturing the prioritized P0–P3 punch list (NF-1..NF-10,
    EI-1..EI-17) from a 2026-05-24 deep audit pass.
  - Added local working-note and factory-state paths to `.gitignore` as
    local-only runtime state.

tsc --noEmit clean; focused vitest runs 19/19 green (match-top-39-11 +
wrapper-gm-tabs-39-13); full-suite vitest 663/663 passing with the
known HGFS worker-spawn flake on this VM (6 worker timeouts unrelated
to the changes).

### Earlier iter-2 work (still unreleased)

- **LR-001** OAuth refresh wraps fetch in AbortController + 15s timeout. Google / Dropbox / OneDrive `refreshToken()` paths previously called `fetch()` with no signal — a slow or unresponsive network would hang every `getValidToken()` caller until the OS gave up (minutes). New `_oauthFetchWithTimeout` helper in `modules/sync-providers.js` returns null cleanly on AbortError or any network-level rejection, matching the existing null-return contract. 5 new regression cases in `tests/oauth-refresh-timeout.test.js`.
- **LR-002** ResourceCache concurrent-fetch dedup. Two scripts requesting the same `@require` URL simultaneously used to both miss the cache, both call `fetch()`, and race on `cache.set` — wasting bandwidth and producing last-write-wins on the persisted dataUri. Added `_pendingFetches: Map<url, Promise<text>>` so concurrent callers share the in-flight promise. Failed fetch clears the entry so retries aren't poisoned. 3 new regression cases in `tests/resources.test.js` (dedup, failure-recovery, cache-hit-short-circuit).
- **LR-003** AST analyzer detectors for three obfuscation patterns the literal-`eval` detector misses: indirect-eval (`(0, eval)(x)` SequenceExpression shape, invokes eval in global scope bypassing closure isolation), dynamic-property-call on globals (`window[<computed>](args)`, gated to known global receivers to avoid noise), and Function-constructor via `.apply`/`.call`/`.bind` (catches `Function.apply(null, ['return x'])` which the `new Function()` detector misses). 26 new regression cases in `tests/analyzer-ast-detectors.test.js` (positive + negative + malformed-AST + array integrity).
- **D-phase** `npm audit fix` clears 4 advisories (1 high, 3 moderate) in transitive devDependencies (basic-ftp/ip-address from puppeteer-core; postcss/ws from vitest tooling). None ship in the extension bundle.
- **CSP-RULEID** `pages/dashboard-csp.js` switches DNR rule-ID allocation from hash-mod-100K (birthday-paradox collision at ~373 hostnames in 100K pool, >99% by ~1500) to sequential allocation in a 100M-id pool, derived on load from the max stored ruleId so it survives SW restarts collision-free. Entries persist their assigned ruleId in `chrome.storage.local`. First applyBypassRule per host allocates + persists BEFORE issuing the DNR update. `_reconcileLegacyRules()` one-shot sweep cleans pre-fix hash-allocated orphan rules. Legacy `_legacyHashRuleId` retained only for migration grace on removeBypassRule. 7 new regression cases.
- **ERRLOG-PERF** `modules/error-log.js` debounces save by 200ms. Pre-fix: every `log()` call serialized the full 500-entry log (~150KB) to `chrome.storage.local`; bursty load (100 errors/sec) issued 100 storage writes/sec of largely-identical payloads. Now: `log()` schedules a save and returns; the actual `storage.local.set` fires once per debounce window. `clear()` and new public `flush()` bypass the debounce for caller-initiated immediate persistence. 3 new regression cases pin the contract.
- **WORKSPACES-INIT** `bg/workspaces.js` `_init()` now clears `_initPromise` in a try/finally on both success and failure (mirrors `modules/storage.js` init pattern). Pre-fix: the resolved promise stuck around forever; a subsequent `_cache = null` (factory reset, test isolation) found the stale promise still cached and no-op'd the next `_init()` without re-reading from storage, leaving the cache null and crashing every subsequent caller via `this._cache!.list`. 3 new regression cases.
- Tests: 45 test files, 769/769 green. `tsc --noEmit` strict clean. background.js 19,598 lines.

## [v3.11.0] — Storage & persistence rollback hardening + Phase 38 parity wave (2026-05-19)

- Added: **Phase 38.1** `GM_addElement` returns `null` (never throws) on every failure path — non-string/empty tag, `createElement` throws, falsy parent, parent without `appendChild`, or `appendChild` throws. Matches VM v2.37.0 + TM 5.5.6237 contract. Attribute-application errors no longer abort the call. Both runtime JS and TS mirror updated. 3 regression cases.
- Added: **Phase 38.2** dashboard search bar accepts regex via `re:<pattern>` (case-insensitive) or `/pattern/flags` (flags honored verbatim) prefix. `code:` prefix can be combined with regex (`code:re:fetch\(`). Invalid patterns never throw — short-circuit to no-match and surface via `aria-invalid` + tooltip. 8 regression cases pin the parser. TM 5.5.6234 parity.
- Added: **Phase 38.4** popup gains a dedicated "Context-menu scripts" section above the main list that surfaces `@run-at context-menu` scripts as one-tap launchers. Hidden when none match the active tab. 6px corner-radius count badge. TM 5.5.6234 parity.
- Added: **Phase 38.6** `window.onurlchange` subscribes to `navigation.addEventListener('navigate', ...)` as the primary detector. Catches SPA navigations that bypass pushState/replaceState (direct location assignment, library routers). pushState/replaceState/popstate/hashchange shim preserved as backstop for the Firefox port. ScriptCat v1.4 parity.
- Changed: **Phase 38.8** per-script settings panel section label `Updates` → `Update` (singular) to match VM v2.37.1 / TM split-tab convention.
- Changed: **Phase 38.9** per-script "check for updates" icon click is now check-only with a three-button confirmation modal (`View diff` / `Install update` / `Cancel`). Right-click still triggers the force-update bypass-cache path. Bulk update + popup "update" entries keep auto-installing because they have their own progress-modal confirmation. VM v2.37.1 footgun fix.
- Audited: **Phase 38.11** GM_xmlhttpRequest service-worker event-leak bug class does not translate to ScriptVault — uses AbortController + one-shot tabs.sendMessage, not persistent port.onMessage/onDisconnect subscribers. 3 regression cases pin the no-leak invariant: 1000 sequential create→remove cycles leave the table empty after auto-cleanup window; abortByScript/abortByTab remove matching requests without zombies.
- Added: **Phase 38.12** singular `tag` getter alias on `GM_info.script` (`get tag() { return Array.isArray(this.tags) ? this.tags[0] : undefined; }`) so pre-2026 scripts written against Violentmonkey's singular form keep working. VM v2.37.0 back-compat. 2 regression cases.
- Added: **Phase 38.13** multi-key rollback contract regression suite (`tests/storage.test.js`) — 7 cases pinning the cache↔persisted-state consistency invariant across `ScriptStorage.set` (update + insert), `ScriptStorage.delete` (script + values atomic restore), `ScriptStorage.clear` (all-or-nothing across multiple value bags), `ScriptValues.setAll` (batch atomicity), `FolderStorage.update` (unrelated-field preservation), `SettingsManager.set` (cache revert), and `invalidateMatchSet` suppression on rollback. The contract was already enforced by the v3.10.1 → HEAD storage-hardening commits (aca9e8c → a1e89c9); the suite locks it in.
- Storage hardening commits (folded under this release per Phase 38.13 grouping): `aca9e8c` clone storage write boundaries, `4f1e25e` isolate settings snapshots from cache, `a4c2c02` rollback settings cache on persist failure, `3b576c3` harden script value storage keys, `5d0d479` harden imported script ID handling, `d35fce7` preserve script IDs in runtime ZIP restores, `cdf17ae` harden factory reset storage cleanup, `f5f6640` rollback workspace activation state on save failure, `42e6a10` harden folder and workspace persistence rollback, `bf409f1` harden wrapper DOM and network hooks, `a1e89c9` harden userscript bridge and network fetches.
- Changed: `minimum_chrome_version` 120 → 130 (Phase 40.23). Picks up ~10 versions of cumulative security patches and aligns with the `storage.session.getKeys()` requirement.
- Tests: 42 test files, 712/712 green. `tsc --noEmit` strict clean. background.js 19,405 lines.

## [v3.10.1] — Polish polish: token-clean diff view + feature badges + button refinements

- Changed: `.feature-storage` / `.feature-xhr` / `.feature-style` / `.feature-notify` / `.feature-menu` / `.feature-unsafe` badges no longer hardcode `#22c55e33`/`#60a5fa33`/etc. — they reference `--tint-{green,blue,purple,yellow,orange,red}-soft` so the badges retint correctly in light/catppuccin themes instead of staying dark-mode-only.
- Changed: diff view (`.diff-add`, `.diff-del`, `.diff-add-count`, `.diff-del-count`, `.diff-add .diff-sign`, `.diff-del .diff-sign`) now uses `var(--accent-green)` / `var(--accent-red)` / `var(--tint-*-soft)` instead of literal hex. Light-theme diffs are readable now.
- Changed: `.toolbar-btn` got tokenised transitions, hairline border on hover, and a 0.5px press-down on `:active` for premium tactile feel. Border-radius bumped to `--r-sm`.
- Changed: `.modal-close` is now a 28×28 hit target with rounded-square hover background instead of a bare floating × — matches the rest of the icon-button system, easier to click, focusable.
- Tests: 601/601 green. CSS-only.

## [v3.10.0] — Premium UX polish (design tokens, multi-theme dashboard, refined components)

- Added: design-token layer at the top of `pages/dashboard.css` — `--hairline`, `--hairline-strong`, `--shadow-sm/md/lg`, `--overlay-scrim`, `--r-xs/sm/md/lg/pill`, `--t-fast/base/slow`, `--ease-out`, `--ease-spring`, `--focus-ring`, and per-accent `--tint-*-soft/edge` variants. Theme-aware via `[data-theme="light|catppuccin|oled"]` overrides; `color-scheme` declared so native form controls pick the right palette.
- Changed: dropped the neon-green slabs. `<th>` lost its 2px green bottom-border in favour of a hairline + uppercase 11px label; `.section-label` lost its 3px green right-bar in favour of a 1px hairline divider with refined typography. Active tabs now show a 2px accent indicator strip via `::after` rather than the old margin-overlap trick.
- Changed: table rows render as a calm hairline-shadow stack instead of hard 1px borders; selected rows get an inset 3px accent-blue rail. Empty-state typography tightened (h3 promoted to `--text-primary` / 600 weight); spinner reduced 28→24px and slowed slightly for less mechanical feel.
- Changed: toasts now have variant-tinted backgrounds + accent stripe (success / error / warning each get their own soft tint and inset 3px stripe). Modals get `backdrop-filter: blur(4px)` on the scrim, spring-eased scale-and-translate enter, and `--shadow-lg` elevation. Scrollbars are 10px transparent-track / pill-thumb that adapts to theme.
- Changed: snippet-item hover replaced its `transform: translateX(4px)` with a calmer accent-green inset stripe + 4px padding shift. Toggle switches gained an inner hairline border on OFF and a subtle knob shadow; checked transition uses spring easing.
- Added: global premium-polish layer at end-of-file — system-wide `:focus-visible` ring (2px accent-blue + 4px halo), `::selection` styling, tabular-nums on numeric columns (`.col-version`, `.col-size`, `.col-order`, `.col-updated`), and elevation on `.modal` / `.cmd-dialog`.
- Compatibility: every legacy CSS variable (`--bg-body`, `--bg-row*`, `--border-section`, `--toggle-on/off`, `--accent-*`, etc.) is preserved unchanged so the runtime theme editor (`pages/dashboard-theme-editor.js`), inline `[data-theme]` blocks in `pages/dashboard.html`, and dashboard JS modules continue to work without touch. Pure CSS pass; no HTML or JS changes.
- Tests: 601/601 green (no functional change).

## [v3.9.0] — Round 10 parser & template wins (Phases 36.4, 36.6, 36.11)

- Added: `@tag` round-trip preservation. User-assigned tags now survive script re-install and update — `getMetaArray('tag')` unions source-declared and existing tags (dedupe, first-seen order). VM v2.35.2 parity. Phase 36.4.
- Added: comma-separated convenience syntax for URL pattern arrays. `// @match a.com,b.com,c.com` now expands to three patterns at install time. Same desugaring applies to `@include`, `@exclude`, `@exclude-match`, `@connect`. `@tag` is intentionally left raw so multi-word values like `tools,utility` round-trip intact. Mirrored in `src/background/parser.ts`, `background.core.js`, and `tests/parser.test.js`. VM #2403. Phase 36.6.
- Added: `{{icon}}` template token. The blank-script template now ships with `// @icon {{icon}}` and resolves the active tab's `favIconUrl` at create-time. `{{name}}`, `{{match}}`, and `{{namespace}}` already resolved; this completes the standard set. Unresolvable directive lines are stripped to keep generated headers clean. Phase 36.11.
- Tests: 5 new regressions in `tests/parser.test.js` covering comma-split for `@match`/`@exclude-match`, single-pattern preservation, multi-word `@tag` retention, and the deliberate non-split of comma-bearing tag values. 601/601 green.

## [v3.8.0] — Install from Local File + Drag-and-Drop (Phase 12.9)

- Added: file-picker install in the dashboard Import section. Pick a `.user.js` (or `.js`) file from disk and ScriptVault parses, validates, and installs it the same way URL installs do — same 5MB ceiling, same name+namespace dedupe, same `==UserScript==` requirement.
- Added: drag-and-drop install. Drop one or more `.user.js` files anywhere on the dashboard and the page dims with a "Drop .user.js to install" overlay; on release each file is parsed and installed in sequence with a single end-of-batch toast.
- Added: new background message `installFromCode` (and `installFromCode(code)` helper exported from `src/background/install-handler.ts`). `installFromUrl` is now a thin wrapper that fetches the URL and delegates to `installFromCode`, so both paths share the same parse/dedupe/registration flow.
- Source: TM issue [#2722](https://github.com/Tampermonkey/tampermonkey/issues/2722).

## [v3.7.0] — In-app update notifications + summary OS notifications (Phase 12.10)

- Changed: `applyUpdate` no longer fires a per-script OS notification. Previously a 10-script auto-update cycle would trigger 10 OS-level "Script Updated" toasts back-to-back; now `autoUpdate` aggregates the cycle's successful updates and fires at most one summary notification (`"3 scripts updated: A v1.0 → v1.1, B v2.0 → v2.1, C v0.4 → v0.5"`).
- Added: in-app dashboard banner that lists scripts auto-updated since the last visit. Lands at the top of the Scripts tab on dashboard load. Dismiss button clears the ring on the background side so the banner stays gone next visit.
- Added: `UpdateSystem._recentUpdates` ring buffer (cap 20, newest first) plus `getRecentUpdates` / `clearRecentUpdates` background message handlers.
- Manual single-script flows (popup "Check for Update", dashboard force-update) keep their inline feedback path — they don't push onto the ring or fire a summary notification.

## [v3.6.3] — Beautify preserves cursor + scroll (Phase 7.5)

- Fixed: `beautifyCode` (editor toolbar "Beautify" button) used to slam the cursor to line 0, char 0 after every reformat. On a long file you'd lose your place every time you hit it. The cursor + vertical scroll position now stay where they were.
- Approach: capture cursor + scroll before the reformat, then map the old column to the new one — `newCh = newLeadingWS + max(0, oldCh - oldLeadingWS)` — since beautify only changes leading whitespace, the same logical line exists before/after with the same trimmed content. Cursors that sat inside the indent region snap to the start of the content on the new line.
- Falls back to the old behaviour (cursor at top) only if the editor adapter doesn't expose `getCursor()` (e.g. some Monaco-adapter edge cases on first-paint).

## [v3.6.2] — Drop fake gist token encryption (Phase 5.5)

- Removed: the AES-GCM encryption around the GitHub gist PAT was security theater. The key was derived via PBKDF2 from two string literals (`'ScriptVault-Gist-Key-v1'` + `'sv-gist-salt'`) embedded in the source — anyone with the encrypted blob and access to this file could derive the same key. Tokens now live in `chrome.storage.local` plaintext; that storage is already sandboxed by Chrome at the extension boundary, which is the actual protection.
- Migration: existing installs decrypt their stored token once (using the same legacy hardcoded inputs), re-save it under the new `gist_pat` key, and drop the legacy `gist_pat_encrypted` entry. Best-effort — if the one-shot decryption or write fails, the next dashboard load retries.
- Hardened: `clearToken()` now removes both the new and the legacy storage keys defensively, so a sign-out followed by a downgrade can't leak a token via the legacy key.
- UX: the gist setup hint now describes the storage model honestly ("Stored in `chrome.storage.local`, sandboxed by Chrome — readable only by ScriptVault") instead of claiming local encryption.

## [v3.6.1] — Webhook SSRF guard (Phase 5.5)

- Hardened: `PublicAPI.setWebhook` now rejects URLs that point at internal/loopback hosts. Previously the only validation was `https://` — a malicious web origin with capability-token access could register a webhook at `https://192.168.1.1/admin` or `https://169.254.169.254/latest/meta-data/` (cloud metadata) and exfiltrate or trigger LAN-side actions when the extension fired the webhook.
- Coverage matches the existing `_isInternalHost` SSRF guard already used by the install-from-URL flow: localhost aliases, IPv4 loopback (127/8), unspecified (0/8), RFC 1918 (10/8, 172.16/12, 192.168/16), CGNAT (100.64/10), link-local (169.254/16), broadcast, IPv6 loopback (`::1`), IPv6 link-local (`fe80::/10`), and IPv6 ULA (`fc00::/7`).
- Added: 7 new tests pinning the rejection set (localhost, RFC 1918 sweep, link-local, IPv6 loopback, IPv6 link-local, malformed URL) plus regression tests confirming public hostnames + public IPv4 still work. 596 tests pass total.
- Internal: TS mirror in `src/modules/public-api.ts` matched. The JS source got a small `isInternalWebhookUrl()` wrapper around `_isInternalHost` so the install-flow guard and the webhook guard share classification logic without duplication.

## [v3.6.0] — Update-check exponential backoff (Phase 6.1)

- Added: per-script exponential backoff in `UpdateSystem.checkForUpdates`. A network error or non-2xx response increments `script._updateFailureCount` and stamps `script._updateNextCheck = now + 2^(failures-1) * 1min`, capped at 24 hours. The auto-update path skips scripts whose cooldown hasn't elapsed; manual single-script checks (popup "Check for Update", dashboard force-update) bypass the cooldown so users see fresh failures immediately.
- Fixed: scripts with a permanently broken `updateURL` previously consumed bandwidth on every periodic alarm. The new backoff means a dead URL retries at most ~17 cooldowns/day instead of every check interval.
- Changed: a 304 Not Modified response now also clears the failure count + next-check timestamp (treating it as a successful conditional fetch). Previously 304 just `continue`'d without touching backoff state, so a script that returned 5xx once and then 304 forever would stay in a stale cooldown.
- Added: 4 tests pinning the backoff math (`_nextRetryAt`) — first-failure base interval, doubling progression, 24-hour cap, defensive zero-failures input. 589 tests pass.

The conditional `If-None-Match` / `If-Modified-Since` headers and 304 short-circuit were already implemented; this release adds the resilience layer around them so misbehaving update servers don't waste resources.

## [v3.5.0] — `@weight` injection priority (Phase 11.7)

- Added: `// @weight 1..999` directive (Userscripts/Safari standard). Higher = earlier within the same `@run-at`. Clamped to the documented range so an `@weight 99999` typo can't dominate the sort.
- Changed: `registerAllScripts` sort now uses `Math.max(meta.priority || 0, meta.weight || 0)` so authors who set both don't get surprised by the lower one winning. Existing `@priority` behavior preserved.
- Added: `GM_info.script.weight` and `GM_info.script.priority` so scripts can introspect their own injection ordering hints.
- Added: 5 parser tests covering valid range, clamp-above, clamp-below, default, non-numeric. 585 tests pass.
- Internal: TS mirrors in `src/types/script.ts` and `src/background/parser.ts` now declare the new field; the existing JS-test parser duplicate matched.

## [v3.4.0] — Run on This Tab via chrome.userScripts.execute() (Phase 11.4)

- Added: "Run on This Tab" entry in the popup script-action dropdown. Fires the script once on the active tab without registering it for future page loads — useful for quick-test workflows and for running scripts that aren't enabled or that don't match the current URL.
- Added: `runScriptNow` background message handler. Prefers `chrome.userScripts.execute()` (Chrome 135+) so the script runs in the same `USER_SCRIPT` world as a normal injection — `unsafeWindow` and the GM_* APIs behave identically. Falls back to `chrome.scripting.executeScript({ world: 'MAIN' })` on older Chrome (without GM_* APIs but the script body still runs).
- Internal: `runScriptNow` resolves `@require` dependencies via `fetchRequireScript` exactly like the context-menu run-once path so the one-shot run sees the same library set as a normal injection. Per-require fetch failures are non-fatal.

## [v3.3.0] — GM_notification: progress, buttons, update, close (Phase 11.11)

- Added: `GM_notification({ progress: 0..100 })` — shows a progress bar inside the notification (uses `chrome.notifications.type='progress'`). Useful for download or batch-job scripts.
- Added: `GM_notification({ buttons: [{title, iconUrl}, ...] })` — up to 2 action buttons (Chrome's hard cap; we silently truncate so the platform contract stays explicit). Click events fire the new `onbuttonclick` callback with `{ buttonClickIndex }` (ScriptCat semantics).
- Added: `GM_updateNotification(id, details)` — updates an existing notification by tag without closing it. Fields the caller doesn't pass are left untouched, so partial updates don't blank out the title/message.
- Added: `GM_closeNotification(id)` — programmatically dismisses a notification by tag.
- Added: `GM_notification(...)` now returns a control object `{ close(), update(patch) }` so authors don't have to track tags manually for the common case.
- Internal: new background-side message handlers `GM_updateNotification` and `GM_closeNotification` plus a `chrome.notifications.onButtonClicked` listener that routes button clicks back to the originating tab.
- Internal: `content.js` notification bridge now forwards `buttonIndex` so the wrapper can fire the right callback. Linter `KNOWN_GM_APIS` learned the two new function names.

## [v3.2.1] — @unwrap metadata tag (Phase 11.2)

- Added: `// @unwrap` directive support (Violentmonkey parity). When present, the wrapper builder emits the user code verbatim without the GM API IIFE — useful for ESM-style top-level imports/exports and scripts that intentionally modify the top-level scope. A one-line `console.warn` banner is prepended so authors who set `@unwrap` by mistake can spot it. GM_* APIs are unavailable in this mode.
- Added: install confirmation dialog now displays `unwrapped (no GM_* APIs)` in the run-timing summary so users know what they're agreeing to before installing an `@unwrap`'d script.
- Internal: TS mirror in `src/background/wrapper-builder.ts` updated to match (and now also honours `meta.delay`, which the JS source already did).

## [v3.2.0] — GM_xmlhttpRequest noCache/redirect + GM_info platform parity (Phase 11)

- Added: `GM_xmlhttpRequest({ noCache: true })` (and Tampermonkey's lowercase `nocache` alias) — sets `Cache-Control: no-cache` + `Pragma: no-cache` on the request, but only if the caller didn't already set them (case-insensitive). Closes Violentmonkey issue #2168 / Tampermonkey changelog parity.
- Added: `GM_xmlhttpRequest({ redirect: 'follow' | 'error' | 'manual' })` — forwarded directly to `RequestInit.redirect` so scripts can detect or block redirects. Invalid values are silently dropped (no breakage on typos like `redirect: true`). Closes VM #2359.
- Refactored: extracted the fetch-options translation into `XhrManager.buildFetchOptions(data)` (in `modules/xhr.js` + the TS mirror at `src/modules/xhr.ts`) so the noCache/redirect/credentials rules are unit-testable in isolation. The background `GM_xmlhttpRequest` handler now consumes this helper.
- Added: 9 new tests for `XhrManager.buildFetchOptions` covering case-insensitive Cache-Control/Pragma overrides, valid/invalid redirect values, anonymous credentials, and method default. 580 tests pass across 33 files.
- Added: `GM_info.userAgent`, `GM_info.userAgentData` (clone of `navigator.userAgentData` brands/platform/mobile), and `GM_info.platform.fullVersionList` + `GM_info.platform.mobile` — Phase 11.1 GM_info enrichment for parity with Violentmonkey.
- Hardened: `GM_info.platform.browserName` / `browserVersion` now prefer `navigator.userAgentData.brands` over the legacy `navigator.userAgent` regex, with the regex retained as a fallback for older Chrome.

## [v3.1.0] — MatchSet precompiled URL lookup + tests target production code

- Added: `MatchSet` precompiled host index (`background.core.js` + `src/background/url-matcher.ts`). Builds an `O(1)` hostname → script bucket so `getScriptsForUrl` no longer linear-scans every script's pattern list. Wildcard subdomains (`*.example.com`) are indexed under their base domain and resolved via parent-suffix walk so deep subdomains (`a.b.example.com`) still hit the bucket. Regex `@include` and patterns without a host hint fall into a universal bucket so the candidate set remains a strict superset of the true match set. Phase 4.2 of the roadmap.
- Changed: `chrome.runtime.onMessage` `getScriptsForUrl` handler now uses `MatchSet.getMatching()` instead of filtering all scripts. Cache invalidates automatically on every `ScriptStorage.set`/`delete`/`clear` via the new `invalidateMatchSet()` global hook.
- Changed: `tests/url-matcher.test.js` now imports directly from `src/background/url-matcher.ts` instead of duplicating ~190 lines of matcher logic. The previous duplicate could (and did) drift away from the real implementation; tests now test what ships.
- Added: 21 new tests covering `MatchSet` (host indexing, wildcard subdomains, universal candidates, port stripping, dedup) and `isUrlBlockedByGlobalSettings` (denied-host suffix-coincidence guard, whitelist/blacklist modes). 571 tests pass.
- Hardened: a `ReDoS` regression test in `matchIncludePattern` proves the `*+ → *` collapse keeps a 80-wildcard pathological pattern under 500 ms (without the collapse it spins for seconds).
- Internal: TS mirror in `src/modules/storage.ts` exports `setScriptChangeListener()` so future TS migration of `background.core.js` can wire the same invalidation pattern without a global.

## [v3.0.2] — Persistent runtime state + smarter wake-time registration

- Added: `SessionState` helper persists `_notifCallbacks`, `_openTabTrackers`, and `_audioWatchedTabs` to `chrome.storage.session` on every mutation, and rehydrates on `init()`. GM_notification onclick/ondone, GM_openInTab onclose, and GM_audio_watchState callbacks now survive service-worker termination instead of silently dropping after the SW idles out.
- Changed: `registerAllScripts` diff-on-wake now also unregisters stale scripts (registered but no longer enabled / no longer in storage). Previously the diff only filled in missing scripts, so deleted/disabled scripts could remain injected until the next forced re-registration.
- Hardened: `chrome.tabs.onRemoved`, `chrome.notifications.onClicked`, and `chrome.notifications.onClosed` now await `ensureInitialized()` before reading hydrated state, eliminating the race where a tab close event firing during SW wake would see an empty tracker map.

## [v3.0.1] — Service worker cold-start guard

- Fixed: `init()`'s promise is now stored on `self._initPromise` so the cold-start guard inside `handleMessage` actually awaits it. Previously the guard was a dormant `if (self._initPromise)` check that never matched because `init()` was called bare. Result: messages arriving during SW wake (popup/dashboard opens, badge update races) would hit handlers before `ScriptStorage` / `SettingsManager` had loaded.
- Added: `ensureInitialized()` helper memoising the init promise; wired into `chrome.runtime.onMessage`, `chrome.runtime.onUserScriptMessage`, `chrome.alarms.onAlarm`, `chrome.commands.onCommand`, `chrome.tabs.onActivated`, and `chrome.tabs.onUpdated` so every wake-triggering event waits for init.
- Changed: `_debouncedStatsSave()` now uses `chrome.alarms.create('statsSave', { delayInMinutes: 0.1 })` instead of `setTimeout(5000)` so the debounce survives SW termination. Stats writes that previously vanished when the SW was killed mid-debounce now coalesce into the next alarm fire.
- Internal: `chrome.alarms.onAlarm` handler routes the new `statsSave` alarm to `ScriptStorage.save()`.

## [v3.0.0] — IndexedDB storage rewrite

**BREAKING:** Major version bump. Storage backend migrated from `chrome.storage.local` (single 10 MB blob) to IndexedDB. Userscripts, GM-values, stats, and backups now live in object stores with per-record reads/writes and transactional safety. Settings and folder index stay in `chrome.storage.local`.

- New: `src/storage/` module — `idb.ts` (low-level wrapper), `transaction.ts` (multi-store helper), `script-db.ts` (schema + DAOs for scripts/values/stats/backups), `migration-v3.ts` (one-shot v2→v3 copy with 30-day legacy tombstone).
- Migration: First v3 boot reads the legacy `userscripts` blob and `values_*` keys, copies them into IDB, stamps `_storageSchema=3`, and leaves the legacy keys in place for 30 days as a downgrade safety net. After TTL the legacy keys are wiped on next boot.
- Refactored: `ScriptStorage` and `ScriptValues` (`src/modules/storage.ts`) now route through the IDB DAOs while keeping their public method surface identical — callers don't change.
- Refactored: `PublicAPI.installScript` (both extension-message and URL-install paths) and `PublicAPI.toggleScript` now persist through `ScriptStorage.set()` instead of writing the legacy `userscripts` blob directly. The legacy fallback in `toggleScript` was dropped — post-migration the IDB store is authoritative.
- Hardened: IDB connection caching tracks the active `IDBFactory` so test runners (and any future SW context that swaps factories) get a fresh connection automatically.
- Internal: `withTransaction()` waits for `oncomplete` before resolving so callers see fully-committed state on resolve, not just queued writes.
- Tests: 550 passing. Added IDB-aware rollback tests via `vi.spyOn(ScriptsDAO, 'delete')` and `vi.spyOn(ValuesDAO, 'setAll')`. `fake-indexeddb` wired into the vitest setup with a per-test `IDBFactory` reset.

## [v2.3.4]

- Fixed: Two inline `<script>` blocks violated the `extension_pages` CSP (`script-src 'self'`). `pages/dashboard.html` had a 75-line view-settings controller (zoom + density) and `pages/devtools.html` had a 9-line panel registration call — both blocked at load time, leaving the dashboard's zoom/density toolbar inert and the DevTools panel un-registered. Extracted to `pages/dashboard-viewsettings.js` and `pages/devtools.js`. The remaining inline script in `pages/editor-sandbox.html` is the Monaco bootstrap and is allowed by the sandbox CSP (`'unsafe-inline'`).
- Chore: Moved self-distribution signing keys (`scriptvault.pem`, `scriptvault-selfhost.pem`) out of the repo root to `~/.scriptvault-keys/`. Chrome's "Load unpacked" warned `This extension includes the key file ... You probably don't want to do that` because anything inside the extension dir gets bundled at build/install time. `pack-crx.mjs` already takes the key path as a positional CLI arg, so callers just pass `~/.scriptvault-keys/scriptvault-selfhost.pem` now. Both keys remain gitignored.

## [v2.3.3]

- Fixed: Setup-required warning banner stuck in the popup after the user enabled the "Allow User Scripts" toggle in `chrome://extensions`. `getExtensionStatus` was AND-ing a cached `settings._userScriptsAvailable` flag with the live `chrome.userScripts` check, so once the cache was `false` it dominated even when the API became available; nothing in the request path flipped the cache back. The handler now ignores the cache, probes the API live (presence + a `getScripts()` call to catch the post-138 "Allow User Scripts" gate), refreshes the cache to whatever the live probe returned, and runs `configureUserScriptsWorld()` opportunistically so registrations work on next save without forcing an SW reload. Symptom is now self-healing: enabling the toggle and reopening the popup clears the banner immediately.

## [v2.3.2]

- Fixed: `background.core.js` `parseCronToMinutes()` JSDoc block contained `"*/n * * * *"` — the `*/` inside the string literal terminated the block comment early, so the rest of the doc text was parsed as code. After esbuild concatenation this became a hard `SyntaxError: Unexpected token '*'` at line 14298 of `background.js`, which prevented the service worker from booting. Symptom in the field: opening the popup did nothing — Find New Scripts, Create New Script, Dashboard, Utilities, and the per-script toggles were all dead, because `chrome.runtime.sendMessage` had no live receiver and `popup.js init()` blocked on the un-timed-out `loadAllScripts()` await before `setupEventListeners()` could attach handlers. Replaced the JSDoc with line comments and rephrased the description so it never contains `*/`. Rebuilt `background.js`.

## [v2.3.1]

- Fixed: `manifest.json` referenced `icons/16.png` / `icons/32.png` / `icons/48.png` / `icons/128.png`, but the `icons/` directory was deleted in v2.3.0's branding cleanup — extensions failed to load with `Could not load icon 'icons/16.png' specified in 'icons'`. Repointed manifest, `pages/popup.html`, `modules/public-api.js`, `modules/backup-scheduler.js`, and the TypeScript mirror at `src/modules/public-api.ts` to the surviving `images/icon{16,32,48,128}.png` files. Firefox manifest was already correct.

## [v2.3.0]

- Fixed: Weekly-digest alarm (`scriptvault-weekly-digest`) was never dispatched — `chrome.alarms.onAlarm` in `background.core.js` only routed `autoUpdate`, `autoSync`, and a handful of internal names, so `NotificationSystem.handleAlarm()` was unreachable and users who enabled digest notifications got nothing. The listener now delegates unknown alarms to `NotificationSystem.handleAlarm()` first.
- Fixed: `ScriptSigning.verifyScript()` trust-store lookup used bare `trustedKeys[signatureInfo.publicKey]`, so a malicious signed script whose publicKey collided with an inherited `Object.prototype` property (e.g. `toString`, `hasOwnProperty`, `valueOf`) would resolve to the inherited function and be reported as `trusted: true`. Replaced with `Object.hasOwn()` guard in both `bg/signing.js` and the TypeScript mirror at `src/bg/signing.ts`. Two regression tests added.
- Fixed: `ScriptValues.set()` / `delete()` / `setAll()` / `deleteMultiple()` mutated the in-memory cache before awaiting persistence, with no rollback on failure. If `chrome.storage.local.set` threw (quota exceeded, transient error), callers saw the new value in-memory but storage kept the old — and a bogus change notification fired for the write that never landed. All four methods now snapshot prior state, defer notifications until after the successful write, and roll back the cache + rethrow on persist failure. Five regression tests added in `tests/storage.test.js`.
- Fixed: `ScriptStorage.clear()` had no rollback on `chrome.storage.local.set` failure — cache was wiped in-memory while storage kept the old data, drifting until SW restart. Added try/catch rollback matching the pattern used by `set()`.
- Fixed: `FolderStorage.update()` had no rollback on save failure and used `Object.assign` over the whole folder; if save threw, the folder retained partial updates. Now snapshots only the mutated fields so rollback doesn't clobber concurrent writes to unrelated properties. Regression test added.
- Hardened: `GM_addElement` attribute setter (background.core.js) now applies the same sanitization to the `attrs` object path that the `innerHTML` path already enforces — drops `on*` event handlers and rejects `javascript:` / `vbscript:` URLs regardless of attribute name (href, src, xlink:href, formaction, poster, etc.). Previously the `innerHTML` branch was sanitized but `el.setAttribute('onclick', ...)` via attrs was a free XSS for any userscript that called `GM_addElement`.
- Hardened: `pages/install.js` `renderInstallUI()` now returns early with a user-visible error if `#content` or `#install-type-badge` is missing, instead of crashing on `badge.innerHTML =` and leaving the page blank with no feedback.
- Hardened: `pages/sidepanel.js` `openInEditor()` and the dashboard-open button handlers now `.catch()` the `chrome.runtime.sendMessage()` promise — prevents `Unchecked runtime.lastError` console spam when the background service worker is in the process of waking.
- Fixed: `requireCache` in-memory Map is now capped at 500 entries (LRU eviction) to prevent unbounded service worker memory growth
- Fixed: `QuotaManager.getBreakdown()` now uses `TextEncoder` for accurate UTF-8 byte counts instead of JS string `.length` (affects non-ASCII script content)
- Fixed: `npm-resolve.js` `getPackageInfo()` wraps `JSON.parse` in try/catch — malformed npm registry responses no longer crash the resolver
- Fixed: `verifySRI()` now logs a `console.warn` for unverifiable MD5 hashes and unexpected SubtleCrypto errors instead of failing silently
- Fixed: `backup-scheduler.js` backup IDs now use `crypto.randomUUID()` for collision-proof uniqueness
- Fixed: `sidepanel.js` `$()` helper now returns `null` for missing elements; callers updated with proper null guards (previously returned detached `<div>`, masking missing-element bugs)
- Chore: Updated stale `v2.0.0` version comments in `pages/install.js`, `modules/migration.js`
- Chore: Updated `Migration.CURRENT_VERSION` to `2.3.0` so future migration steps target the right version range

## [v2.2.0]

- Fixed: `GM_addValueChangeListener` `remote` flag — listener callbacks in the tab that called `GM_setValue`/`GM_deleteValue` now correctly receive `remote: false`; all other tabs receive `remote: true` (Tampermonkey spec compliance)
- Fixed: ZIP import in popup used O(n²) string-concatenation `btoa` encoding — replaced with chunked 8 KB approach (matches the dashboard implementation)
- Chore: Removed dead 4th argument from three `showPopupEmptyState()` call sites in popup.js
- Chore: Updated stale `v2.0.0` version comments in popup.js and dashboard.js

## [v2.1.9]

- Added: `@crontab` metadata directive — schedule script execution via cron expressions (`*/5 * * * *`, `0 * * * *`, `0 0 * * *`, etc.)
- Added: `GM_info.injectInto` property — reports the script's `@inject-into` value
- Added: `$DATETIME$` template variable — auto-populates with today's ISO date when creating scripts from templates
- Added: F8 / Shift+F8 Monaco editor keybindings for linter error navigation (next/previous marker)
- Fixed: `GM_xmlhttpRequest` body serialization — `Blob`, `File`, `FormData`, and `URLSearchParams` now correctly cross the extension messaging boundary
- Fixed: `setupAlarms()` missing `SettingsManager.get()` call (was referencing undefined `settings`)

## [v2.1.8] - %Y->- (HEAD -> main, origin/main, origin/HEAD)

- Added: Add Firefox port roadmap + session log scaffolding
- v2.1.7: Fix massive editor text (fontSize percentage treated as pixels)
- v2.1.6: Fix blank Monaco editor when opening a script to edit
- v2.1.5: Center dashboard toast container at bottom
- v2.1.4: Dashboard debloat pass + light theme readability fix
- v2.1.3: Drop provenance origin badges from dashboard script rows
- v2.1.2: Fix dashboard column header rendering in middle of data rows
- v2.1.1: Fix Monaco editor never loading (sandbox CSP missing unsafe-eval)
- v2.1.0: Strip popup search, filters, and script row chrome (-613 lines)
- v2.0.9: Debloat toolbar popup (-629 lines)

## Roadmap archive — 2026-08-10 — ROADMAP.md

<details>
<summary>Original roadmap snapshot</summary>

```markdown
# ScriptVault Roadmap

> Single source of truth for planned work. Tiered by execution priority.
> Completion history lives in git history and `CHANGELOG.md`; consolidated
> research conclusions live in `RESEARCH.md`. Legacy planning passes are
> reference-only under `docs/archive/`.
>
> **Roadmap version:** Round 99 - Greasy Fork handoff cleanup hardening 2026-06-11.
> **Shipped baseline:** v3.11.0 (2026-05-19, tag pushed). `main` has additional unreleased hardening, TS promotion, Firefox validation, and release-trust commits through 2026-06-11.
> **Test suite:** 1582 Vitest cases green; `npm audit --audit-level=high --omit=optional` clean; 28/28 TS-promoted runtime entries; 0 mirrored; 0 divergent.
> **Source floor:** 400+ external URLs across Rounds 1-40. Every Now/Next item carries source IDs from the Appendix.
>
> Last researched: Round 92 - 2026-06-07.

---

## Market Context

Tampermonkey was briefly removed from CWS in July 2025 [S01] but returned and now sits at v5.5.0 with 12M users — the dominant incumbent. Violentmonkey remains MV2-only (v2.41.0, actively developed) but permanently blocked on Chrome 133+ (MV2 fully removed in Chrome 139) [S02, S03]. ScriptCat (4.5K stars) is MV3-native but niche [S04]. New entrants include Tweeks (YC W25, AI-native) and lightweight MV3 managers (OrangeMonkey, Vanilla Pudding, BareScript). Greasemonkey and FireMonkey remain Firefox-only MV2 [S05, S06].

**ScriptVault is the only MV3-native, open-source, full-featured userscript manager with zero telemetry on the Chrome Web Store.** Tampermonkey's return narrows the MV3 exclusivity window, but its closed-source and freemium model remain trust liabilities. The roadmap prioritises differentiation: ship Firefox AMO, land Edge, close GM API parity gaps, and capitalize on trust advantages (Ed25519 signing, AST analysis, update review, MIT license).

> **Correction — 2026-08-06.** The paragraph above is out of date and the
> exclusivity claim no longer holds. **Violentmonkey shipped MV3 stable in
> v2.43.0 on 2026-07-14** (first MV3 beta v2.41.2, 2026-07-07) and is at
> **v2.47.0 as of 2026-08-06**, with S3 sync, an opt-in "Alternative page mode"
> for true `document-start` timing, and Firefox CSP bypass. ScriptCat is at
> v1.4.0 stable with Firefox MV3 support, and FireMonkey revived with v3.0–v3.6
> (2026-07). The durable differentiators are now Ed25519 signing (answers the
> still-open Violentmonkey #1558), the shipped update-review triad (answers the
> still-open #1023 +37 and #500 +30), AST risk analysis, and the accessibility
> gate — not MV3 itself. See `RESEARCH.md` (2026-08-06) and the P1 item
> "Refresh the README comparison table" below.

---

## How to Read This Roadmap

| Tier | Meaning | Timeframe |
|------|---------|-----------|
| **Now** | Active queue. Ship in v3.12.0. | Days to weeks |
| **Next** | Planned for v3.13.0-v3.14.0 after Now clears. | Weeks to months |
| **Later** | Validated direction, not yet scheduled. | Months to quarters |
| **Under Consideration** | Promising but needs more research or user signal. | Unscheduled |
| **Rejected** | Evaluated and declined, with reasoning. | N/A |

Priority labels within tiers: **P0** safety/security/data-loss, **P1** core workflow gaps, **P2** polish, **P3** nice-to-have.

## Now (v3.12.0)

_(All Now-tier items are credential/compliance blocked — see `Roadmap_Blocked.md`.)_

## Next

## Deep Audit Backlog (2026-07-15)

Findings from a six-agent deep audit (workbench redesign UI, typed action
dispatch, recent security commits, UserCSS/language service, locale/controllers,
secondary surfaces). ~30 confirmed items were fixed across commits `c62c19e`
(UserCSS engine), `c02e26d` (source maps), `c13f7f8` (UserCSS UI + LSP),
`780c837` (error-log URL retention), `b419671` (workbench UI), `e230d54`
(secondary surfaces), and `259536b` (controllers + a11y gate). The items below
are lower-priority findings deferred for a later pass.



## Deep Audit Backlog (2026-07-07)

Findings from a six-agent deep audit (correctness, security, cloud-sync/storage,
background core, dashboard UX, dashboard modules, non-dashboard UI). The P0/P1
data-safety and background-hardening items were fixed in commits `17f45bf`
(sync data-safety + restrict-to-site scope expansion) and `e233c94` (update
lock + SRI @resource + scam-detector precision) — do NOT re-open those. The
items below are the remaining unfixed findings.

### Instructions for the AI working this backlog

- **Authoritative source is `src/**` (TypeScript). `background.js`,
  `background.core.js`, `modules/*.js`, and `bg/*.js` are GENERATED.** The live
  service-worker logic lives in `src/background/core.ts` (a ~13k-line bridge);
  the focused modules under `src/background/` (e.g. `registration.ts`,
  `update-checker.ts`, `resource-loader.ts`) are EXTRACTION TARGETS that are
  NOT wired into the runtime — editing them alone changes nothing at runtime.
  Grep the generated `background.js` for a symbol to confirm which copy is live
  before editing; usually you must fix BOTH `core.ts` (runtime) and the matching
  extraction module (drift-cleanliness). The `@match` ReDoS and restrict-to-site
  fixes both had to touch two copies for this reason.
- **After any `src/**` edit:** `npm run ts-runtime:generate` → `npm run build:bg`
  → `npm run typecheck` → focused `npx vitest run <files>` → then `npm run check`
  before committing. Never edit generated artifacts by hand.
- **`pages/dashboard.js` is plain JS (no build step) and is LF-pinned.** Edit
  with the Edit tool only — PowerShell `Set-Content` rewrites CRLF and breaks
  the `\n`-literal source-pin tests (`support-snapshot-redaction`). Many
  dashboard styles are duplicated between inline `pages/dashboard.html` `<style>`
  and `pages/dashboard.css` — check both.
- **Theme tokens:** the 4 themes (dark/light/catppuccin/oled) are defined in
  `pages/theme-tokens.css` and the dashboard theme blocks. Prefer semantic
  tokens over raw hex; verify every change in all four modes.
- Add a regression test for every fix (static source-pin at minimum; functional
  where a harness exists). Commit in logical batches with conventional messages;
  no AI authorship in commits.

### Background core & security

### Non-dashboard UI (popup / install / sidepanel / devtools)

## Later

## Under Consideration

- **UC-1. Safari via Native App Container** [S40, S41] — Safari lacks `userScripts` API. Requires separate Swift project. Reconsider when user demand justifies it.
- **UC-2. Script Marketplace** [S42] — ScriptVault is a manager, not a platform. GreasyFork integration serves the same need.
- **UC-3. AI-Assisted Script Editing** [S43] — Must be opt-in, local-first. Reconsider when on-device LLMs are practical.
- **UC-4. Collaborative/Team Sharing** — Small user base. Existing sync covers the 90% case.

## Rejected

- **R-1. WXT Migration** [S45] — Conflicts with concatenated service worker architecture. Revisit only if codebase moves to multi-file workers.
- **R-2. GM3 API Compatibility** [S05] — Synchronous APIs conflict with MV3 isolation. TM/VM have moved on.
- **R-3. Safari via Polyfill** [S40] — Safari lacks `userScripts` API. A polyfill cannot bridge this.
- **R-4. Chrome Sync Provider** [S46] — 100KB quota unsuitable for scripts. Seven other providers exist.
- **R-5. Built-in Ad Blocking** — uBlock Origin's domain. `@webRequest` DNR rules cover per-script blocking.

## Round 16-34 Research Log

| Cycle | Angle | Local evidence | External signal | Roadmap changes |
|---|---|---|---|---|
| 45 | Setup/onboarding reliability | `pages/dashboard.js`, `pages/popup.js`, `src/background/registration.ts`, `README.md` support matrix | Chrome 138+ per-extension Allow User Scripts; Firefox MV3 optional-only `userScripts`; user-script registrations are cleared on extension update [S48, S74] | Added N-7 setup doctor and rehydration audit |
| 46 | Developer workflow | Monaco editor, generated GM typings, install provenance, local-save receipts | Tampermonkey external-editor FAQ, Tampermonkey Editors vscode.dev extension, current user complaints about copy-save-reload loops [S77, S78, S79] | Promoted local file/watch work into X-8 |
| 47 | Distribution and publishing | Greasy Fork/OpenUserJS discovery and install provenance in dashboard/install UI | Greasy Fork documents read-only API plus prefilled update form requiring user session cookie [S76] | Added X-9 and corrected L-10 from direct API to publish handoff |
| 48 | Implementation decomposition | `pages/dashboard.js` editor save/install paths, `pages/dashboard.html` editor toolbar, `src/background/core.ts`, `docs/release-runbook.md`, trust receipt tests | Chrome File System Access user-gesture/support constraints, Greasy Fork prefill form rules, Chrome/Firefox userScripts update clearing, CWS remote-code policy [S47, S74, S75, S76, S81] | Added N-8 and expanded X-8/X-9 into implementation slices |
| 49 | Compliant background execution architecture | `src/background/background-runner*.ts`, `src/background/background-wrapper.ts`, `offscreen.js`, `scripts/check-cws-remote-code.mjs`, `docs/background-scripts-design.md`, `docs/cws-remote-code-compliance.md` | Chrome offscreen limits, remote-hosted-code sandbox guidance, ScriptCat background/cron docs [S82, S83, S84] | Expanded X-2 with sandbox-runner candidate, rejected alternatives, and prototype acceptance gates |
| 50 | SPA navigation support | `src/background/wrapper-builder.ts`, `src/background/registration.ts`, `content.js`, `tests/wrapper-dom-security.test.js`, `tests/match-top-39-11.test.js`, README/dashboard examples | Navigation API route events, same-origin scope, and extension `webNavigation` permission tradeoffs [S85, S86, S87, S88] | Expanded X-3 from feature note into implementation-ready URL-change contract and verification gates |
| 51 | Local-save trust receipts | `pages/dashboard.js`, `src/background/core.ts`, `src/background/trust-receipt.ts`, `src/types/messages.ts`, `src/types/script.ts`, `src/modules/sync-easycloud.ts`, `tests/trust-receipt*.test.js`, `tests/install-source.test.js`, `tests/support-snapshot-redaction.test.js`, `tests/reregister-script.test.js` | File System Access user-gesture/handle-storage limits and CWS user-data/privacy disclosure expectations [S75, S81, S89, S90] | Expanded N-8 with local-source override, autosave coalescing, export/sync redaction, and receipt-operation test gates |
| 52 | Developer workspace/local file binding | `pages/dashboard.js`, `pages/dashboard.html`, `pages/dashboard.css`, `src/types/script.ts`, `src/background/core.ts`, `src/background/import-export.ts`, `src/background/cloud-sync.ts`, `src/modules/sync-easycloud.ts`, `src/storage/script-db.ts`, cloud-sync/export tests | File System Access stored-handle, permission-persistence, user-gesture, secure-context, and CWS user-data disclosure constraints [S81, S89, S90, S91, S92] | Expanded X-8 with local-only binding store, permission-state UI, refresh-only first release, and export/sync redaction gates |
| 53 | Setup rehydration evidence | `src/background/core.ts`, `background.core.js`, `background.js`, `src/types/messages.ts`, `tests/local-health-report.test.js`, dashboard support snapshot export | Chrome userScripts docs, Chrome 138+ Allow User Scripts, Firefox optional-only `userScripts`, and update-time registration clearing [S47, S48, S74] | Implemented aggregate last-registration-sweep evidence in local health reports and support snapshots |
| 54 | Local-save receipt implementation | `pages/dashboard.js`, `src/background/core.ts`, `src/background/trust-receipt.ts`, `src/types/messages.ts`, `src/types/script.ts`, `tests/trust-receipt.test.js`, `tests/local-save-trust-receipt.test.js` | CWS user-data disclosure and File System Access user-gesture/stored-handle constraints [S81, S89, S91] | Shipped explicit local editor receipt payloads and metadata-fallback suppression for manual saves/autosaves |
| 55 | Autosave receipt coalescing | `pages/dashboard.js`, `src/background/core.ts`, `src/types/messages.ts`, `tests/local-save-trust-receipt.test.js`, `tests/reregister-script.test.js` | CWS local-storage disclosure plus File System Access handle permission recheck and persistent-permission behavior [S81, S89, S91] | Added ephemeral autosave coalescing keys, in-memory rollback-history reuse, and reregister/export-safety source guards |
| 56 | Local workspace binding store | `src/storage/idb.ts`, `src/storage/script-db.ts`, `src/modules/storage.ts`, `src/background/core.ts`, `modules/storage.js`, `tests/storage.test.js`, export/sync/support tests | File handles are serializable to IndexedDB; permission must be rechecked with `queryPermission()`/`requestPermission()`; local sensitive data remains disclosure-relevant [S81, S89, S91] | Added local-only binding storage plus JSON export, CloudSync, EasyCloud, and support-snapshot redaction fixtures |
| 57 | Dashboard local file binding | `pages/dashboard.html`, `pages/dashboard.js`, `tests/local-workspace-dashboard.test.js` | File picker support must be feature-detected and invoked from a user gesture; stored handles require permission-state rechecks; local sensitive data still needs clear disclosure [S81, S89, S91] | Added the feature-detected `Bind File` control, local IndexedDB handle persistence, permission summary chip, and no-save/no-code binding tests |
| 58 | Local file refresh review | `pages/dashboard.html`, `pages/dashboard.js`, `tests/local-workspace-dashboard.test.js` | Stored handles may need `requestPermission()` from a user gesture before reads; local files should be reviewed before applying executable code [S81, S89, S91] | Added `Refresh File` and `Unbind`, review-diff apply, permission reconnect/error summaries, no-change handling, and `local-file` receipt tests |
| 59 | Deep audit security | `src/background/wrapper-builder.ts`, `src/background/core.ts`, generated runtime artifacts, `tests/wrapper-dom-security.test.js`, `docs/research-deep-audit-2026-06-06.md` | Local audit found `srcdoc` bypass in `GM_addElement`; iframe `srcdoc` is raw HTML rather than a normal URL attribute | Blocked `srcdoc` for direct attrs and sanitized `innerHTML`, regenerated runtime artifacts, and pinned the bypass regression |
| 60 | Crontab execution isolation | `src/background/core.ts`, generated runtime artifacts, `tests/crontab-next-fire.test.js`, `docs/research-deep-audit-2026-06-06.md` | Local audit found scheduled scripts running through `chrome.scripting.executeScript` in `ISOLATED` world, which can expose extension APIs to userscript code | Moved scheduled execution to `chrome.userScripts.execute` in `USER_SCRIPT` world with a `MAIN`-world fallback only, removed the scheduled `new Function` path, and pinned the isolation regression |
| 61 | PublicAPI internal-host parity | `src/modules/public-api.ts`, `modules/public-api.js`, `background.js`, `tests/public-api.test.js`, `tests/source-hardening-parity.test.js` | Local audit found PublicAPI's private internal-host copy missing `.localhost`, TEST-NET, benchmarking, Class E, and IPv4-mapped IPv6 hex cases already enforced by `InternalHostGuard` | Reused the canonical `isInternalHost` guard for trusted origins, web install URLs, and webhook URLs, regenerated runtime artifacts, and pinned behavior/source parity regressions |
| 62 | S3 settings validation | `src/config/settings-schema.json`, `pages/dashboard.html`, `pages/dashboard.js`, `scripts/check-settings-schema.mjs`, `tests/dashboard-a11y.test.js` | WCAG 2.1 SC 3.3.1 error identification, MDN constraint validation, and `aria-invalid` guidance still favor field-specific text errors and custom validity [S07, S08] | Added S3 endpoint/region/bucket/object-key validation metadata, native hints, accessible error nodes, blur hooks, and focused a11y/schema coverage |
| 63 | Sync credential validation | `src/config/settings-schema.json`, `pages/dashboard.html`, `pages/dashboard.js`, `scripts/check-settings-schema.mjs`, `tests/dashboard-a11y.test.js` | WCAG 2.1 SC 3.3.1, MDN constraint validation, and MDN `aria-invalid` guidance still support custom validity plus field-specific error messages [S07, S08] | Added WebDAV, sync passphrase, and S3 credential validation metadata, error nodes, native length limits, blur hooks, and an encryption toggle guard |
| 64 | Editor select validation | `src/config/settings-schema.json`, `pages/dashboard.html`, `pages/dashboard.js`, `scripts/check-settings-schema.mjs`, `tests/dashboard-a11y.test.js` | MDN documents `HTMLSelectElement.setCustomValidity()` and option values as the select contract; WCAG error identification still requires text errors for invalid choices [S07, S08] | Added validation metadata, error nodes, and save-blocking allowed-option checks for editor font size, indentation width, and tab size |
| 65 | Interval select validation | `pages/dashboard.html`, `pages/dashboard.js`, `src/config/settings-schema.json`, `scripts/check-settings-schema.mjs`, `tests/dashboard-a11y.test.js` | MDN select option values plus `HTMLSelectElement.setCustomValidity()` support the same allowed-option validation contract [S07, S08] | Added validation metadata/error nodes for update check, notification delay, and externals intervals; preserved `0`/"Never" with nullish fallbacks and validator conversion |
| 66 | Security select validation | `pages/dashboard.html`, `pages/dashboard.js`, `src/config/settings-schema.json`, `scripts/check-settings-schema.mjs`, `tests/dashboard-a11y.test.js` | MDN select option values plus `HTMLSelectElement.setCustomValidity()` support the same allowed-option validation contract, and WCAG error identification expects text feedback for invalid choices [S07, S08] | Added validation metadata, error nodes, and save-blocking allowed-option checks for content script API, sandbox mode, CSP modification mode, and HTTP header modification mode |
| 67 | Action behavior select validation | `pages/dashboard.html`, `pages/dashboard.js`, `src/config/settings-schema.json`, `scripts/check-settings-schema.mjs`, `tests/dashboard-a11y.test.js` | MDN select option values plus `HTMLSelectElement.setCustomValidity()` support the same allowed-option validation contract, and WCAG error identification expects text feedback for invalid choices [S07, S08] | Added validation metadata, error nodes, and save-blocking allowed-option checks for default tab type, local file, cookie, communication, SRI, include, @connect, incognito, page filter, block severity, strict mode, and top-level await selects |
| 68 | Remaining select validation | `pages/dashboard.html`, `pages/dashboard.js`, `src/config/settings-schema.json`, `scripts/check-settings-schema.mjs`, `tests/dashboard-a11y.test.js` | MDN select option values plus `HTMLSelectElement.setCustomValidity()` support the same allowed-option validation contract, and WCAG error identification expects text feedback for invalid choices [S07, S08] | Added validation metadata, error nodes, and save-blocking allowed-option checks for all remaining schema-backed selects; popup columns now validates before numeric conversion |
| 69 | Custom CSS validation | `pages/dashboard.html`, `pages/dashboard.js`, `src/config/settings-schema.json`, `scripts/check-settings-schema.mjs`, `tests/dashboard-a11y.test.js` | WCAG error identification and MDN constraint validation support text errors, native length constraints, and custom validity for malformed free-form text [S07, S08] | Added validation metadata, maxlength, accessible error text, and save-blocking validation for custom CSS; whitespace is preserved while unsafe control characters and overlarge CSS are rejected |
| 70 | Settings validation acceptance gate | `scripts/check-settings-schema.mjs`, `tests/settings-schema.test.js`, `src/config/settings-schema.json`, `pages/dashboard.html`, `pages/dashboard.js` | WCAG error identification and MDN constraint validation still require user-facing errors for malformed input controls [S07, S08] | Added the durable dashboard-backed validation-metadata requirement and closed N-1 after the repository schema passed it |
| 71 | Guarded GM.fetch | `src/background/core.ts`, `src/background/wrapper-builder.ts`, `background.core.js`, `background.js`, `scripts/generate-gm-types.mjs`, `lib/scriptvault.d.ts`, `tests/gm-namespace-parity.test.js`, `tests/gm-types.test.js`, `docs/gm-namespace-parity.md` | Tampermonkey/Violentmonkey GM API parity still depends on promise-style network helpers, but ScriptVault must keep network access behind `GM_xmlhttpRequest` policy [S10, S11, S12] | Added `GM.fetch`/`GM_fetch` over the existing XHR bridge, pinned that no background `GM_fetch` action exists, and closed N-2 |
| 72 | SPA URL-change proof | `src/background/core.ts`, `src/background/wrapper-builder.ts`, generated runtime artifacts, `tests/urlchange-wrapper.test.js`, `README.md` | Navigation API route events plus history/popstate/hashchange fallbacks remain the least-permission page-level path for SPA userscript reruns [S85, S86, S87, S88] | Added a shared URL-change scheduler, microtask/frame rechecks, duplicate suppression, jsdom coverage, and README author examples for `window.onurlchange` |
| 73 | Monaco package guard | `scripts/check-monaco-package-contract.mjs`, `tests/monaco-package-contract.test.js`, `package.json`, `docs/monaco-esm-migration-plan.md` | Monaco AMD remains deprecated, but the current v3.12 packaging contract must stay local and Firefox-safe until the ESM bundle is deliberately switched [S17, S24] | Added a static gate for local AMD Chromium packaging, remote/CDN sandbox rejection, Firefox Monaco exclusion, npm-check wiring, and plan drift |
| 74 | Monaco ESM prototype | `src/editor/monaco-esm-entry.ts`, `esbuild.config.mjs`, `scripts/check-monaco-esm-prototype.mjs`, `tests/monaco-esm-build.test.js`, `docs/audit/monaco-esm-prototype-2026-06-06.json` | Monaco ESM needs a local bundled editor plus file-backed workers before the sandbox can leave AMD [S17, S24] | Added an ignored `lib/monaco-esm/` prototype build, deterministic worker outputs, font loader handling, post-build evidence checks, and size/layout evidence |
| 75 | Monaco ESM size budget | `scripts/check-monaco-esm-prototype.mjs`, `tests/monaco-esm-prototype-check.test.js`, `docs/audit/monaco-esm-prototype-2026-06-06.json`, `docs/monaco-esm-migration-plan.md` | The full JavaScript/TypeScript worker preserves userscript language features, but package growth must be explicit before switching from AMD [S17, S24] | Selected the full-worker Chromium strategy, added total/compressed/per-file budgets, recorded gzip evidence, and pinned budget regressions |
| 76 | Monaco ESM sandbox switch | `pages/editor-sandbox.html`, `esbuild.config.mjs`, `scripts/check-monaco-package-contract.mjs`, `tests/monaco-esm-plan.test.js`, `docs/cws-remote-code-compliance.md` | The sandbox can leave deprecated AMD only if it imports packaged ESM assets and keeps fallback behavior [S17, S24] | Switched the sandbox to local ESM CSS/import loading, removed AMD copy steps, rejected AMD loader regressions, and added sandbox script parsing coverage |
| 77 | Monaco ESM fallback harness | `tests/monaco-esm-sandbox-loader.test.js`, `pages/editor-sandbox.html` | Browser-profile proof can be blocked, but the loader/fallback contract still needs deterministic coverage [S17, S24] | Added a VM/DOM harness that executes the sandbox script, validates ESM path requests, `ready` posting, and missing-bundle fallback routing |
| 78 | Monaco ESM Chromium sandbox smoke | `tests/e2e/monaco-esm-sandbox.spec.js`, `tests/e2e/helpers/extension-fixture.js` | The ESM sandbox switch must run in a real Chromium extension page, not only jsdom/VM harnesses [S17, S24] | Added a Playwright extension-page smoke for the packaged sandbox ready path and routed missing-bundle fallback path |
| 79 | Monaco adapter dashboard smoke | `tests/e2e/monaco-adapter-dashboard.spec.js` | The ESM editor must persist real dashboard edits through the CodeMirror-compatible Monaco adapter [S17, S24] | Added a Playwright dashboard smoke for edit-open, adapter readiness, toolbar save, reload, and adapter value persistence |
| 80 | `browser` namespace alias | `src/shared/utils.ts`, `shared/utils.js`, `scripts/generate-ts-runtime-modules.mjs`, `pages/dashboard-firefox-compat.js`, focused tests | Chrome 148 exposes `browser`, so Chrome/Firefox code should converge without exposing extension APIs to userscript/page worlds [S25] | Added a generated extension-context alias, fixed Chromium-vs-Firefox detection when `browser.runtime` exists, and pinned wrapper boundary coverage |
| 81 | Trusted Types author docs | `README.md`, `pages/dashboard.html`, `tests/trusted-types-docs.test.js` | MAIN-world scripts on Trusted Types pages need explicit author guidance, while ScriptVault's default USER_SCRIPT path should stay documented as the safer default [S26] | Added README and Help guidance plus a static test that pins the docs and confirms no runtime policy shim was introduced |
| 82 | Subscription refresh scheduling | `src/background/core.ts`, settings defaults/schema/types, dashboard subscription controls, generated runtime artifacts, focused tests | Chrome alarms remain the MV3-safe periodic work primitive, with same-name replacement and a 30-second minimum interval in current Chrome [S93] | Added a managed subscription refresh alarm, visible auto-refresh/interval controls, feed health labels, scheduler resync on add/remove/settings changes, and static contract coverage |
| 83 | Local workspace refresh status | `pages/dashboard.js`, `src/storage/script-db.ts`, `modules/storage.js`, focused dashboard/storage tests | File System Access handles can persist in IndexedDB, but permission/read state must be visible because access can revert to prompt or fail between sessions [S81, S91, S92] | Added explicit bound/unchanged/applied/cancelled/error refresh state summaries for the editor local-file chip without exposing handles or absolute paths |
| 84 | Local workspace health evidence | `src/background/core.ts`, `pages/dashboard.js`, focused health/support tests | Support snapshots need aggregate local-workspace evidence without file handles, paths, or local names [S81, S91, S92] | Added local workspace health counts, refresh-age buckets, and support-snapshot sanitization unless script inventory is opted in |
| 85 | Local refresh acceptance hardening | `pages/dashboard.js`, `src/background/core.ts`, focused local-workspace/local-health tests | File System Access reads must reject oversized executable files before loading text, and parse/apply failures need distinct operator feedback [S81, S91, S92] | Added the 5 MB bound-file read cap, `too-large` and `parse-failed` status paths, and regression coverage for normal local apply registration |
| 86 | Greasy Fork publish preflight | `pages/dashboard.html`, `pages/dashboard.js`, `tests/greasyfork-publish-handoff.test.js` | Greasy Fork documents read-only APIs plus multipart prefilled update forms, not a credentialed write API [S76] | Added editor publish preflight, metadata validation, new/update target detection, exact code preview, copy/download fallback, and static guards against background publish endpoints |
| 87 | Greasy Fork publication receipt | `pages/dashboard.html`, `pages/dashboard.js`, `tests/greasyfork-publish-handoff.test.js` | Store-safe handoff needs a local receipt only after user-confirmed submission, without storing submitted code or account/session material [S76] | Added post-handoff confirmation, local-only publication receipt storage, Info-panel reload display, receipt trimming, and Chromium dashboard smoke coverage |
| 88 | Greasy Fork receipt history | `pages/dashboard.js`, `tests/greasyfork-publish-handoff.test.js` | Greasy Fork still documents read-only APIs plus session-cookie prefilled form POSTs, so local fallback handling must not claim a credentialed publish API [S76] | Added per-script publication receipt history display, local-only clear-history management, source/account redaction copy, focused static coverage, and Chromium extension smoke coverage |
| 89 | Greasy Fork receipt summary fallback | `pages/dashboard.js`, `tests/greasyfork-publish-handoff.test.js` | Clipboard writes are a user-initiated local action, while Greasy Fork publication still happens only through the user-reviewed prefilled form [S76, S94] | Added copyable sanitized receipt summaries for local publication history and Chromium smoke coverage that proves copied text omits source/account/session data |
| 90 | Greasy Fork receipt export fallback | `pages/dashboard.js`, `tests/greasyfork-publish-handoff.test.js` | Local Blob URLs plus anchor `download` preserve a browser-native export path for sanitized local receipt text [S76, S95, S96] | Added downloadable sanitized receipt summaries, safe receipt filenames, object URL revocation, focused static coverage, and Chromium smoke coverage for exported text redaction |
| 91 | Greasy Fork session-check polish | `pages/dashboard.js`, `tests/greasyfork-publish-handoff.test.js` | Greasy Fork publication still depends on the user's browser session, so the preflight modal should let users open Greasy Fork without posting script data [S76] | Added a user-initiated `Open Greasy Fork` modal action that opens only the base URL with noopener/noreferrer, plus focused static coverage and Chromium smoke proof |
| 92 | Enterprise policy provisioning | `manifest.json`, `managed-storage-schema.json`, `src/background/core.ts`, `pages/dashboard.js`, `docs/enterprise-policy-provisioning.md`, focused manifest/runtime tests | Chrome managed storage requires a manifest-declared schema; managed storage is read-only policy data and can be restricted to trusted contexts [S28, S97, S98] | Added schema wiring, trusted-context access narrowing, deterministic managed install tags, a dashboard Managed badge, and administrator docs |
| 93 | Enterprise policy diagnostics | `src/background/core.ts`, `src/types/messages.ts`, local health/support snapshot tests | Chrome policy deployment is normally inspected at `chrome://policy`, but ScriptVault support snapshots need only aggregate extension-side evidence [S97, S98, S99] | Added managed policy support/read/configuration/install counts and warning signals to local health without exposing policy values |
| 94 | GM value-sync support snapshot allowlist | `pages/dashboard.js`, `tests/support-snapshot-redaction.test.js` | Chrome extension diagnostics should keep privileged userscript/storage state behind extension-controlled messaging and export only support-safe aggregates [S47, S98] | Added an explicit dashboard-side allowlist for GM value-sync local-health export data, including clamped retry-ready last-result evidence and known warning IDs only |
| 95 | GM value-sync support summary polish | `pages/dashboard.js`, `tests/support-snapshot-redaction.test.js` | Support operators need pre-export visibility into aggregate local-health diagnostics while the privacy envelope keeps script/value data out of the UI and export path [S47, S98] | Cached local health during utilities refresh/export and added aggregate GM value-sync retry readiness to the support snapshot summary |
| 96 | GM value-sync retry-age diagnostics | `src/background/core.ts`, `src/types/messages.ts`, generated runtime artifacts, `pages/dashboard.js`, focused local-health/support tests | Support diagnostics should distinguish fresh retry-ready write failures from stale ones while still exporting only aggregate local-health evidence [S47, S98] | Added sanitized retry-age minutes/buckets to last-result health and support-summary output |
| 97 | GM value-sync bounded retry history | `src/background/core.ts`, `src/types/messages.ts`, generated runtime artifacts, `pages/dashboard.js`, focused local-health/support tests | Chrome storage quota guidance favors small JSON-serializable local state, and CWS user-data policy favors aggregate/anonymized operational diagnostics [S47, S98] | Added a five-entry aggregate retry-history store, local-health summary counts, support-snapshot allowlisting, and clear-all cleanup |
| 98 | GM value-sync stale retry cleanup | `src/background/core.ts`, `src/types/messages.ts`, generated runtime artifacts, `pages/dashboard.js`, focused local-health/support tests | Chrome storage APIs support extension-local JSON state, and CWS user-data guidance favors minimal aggregate diagnostics for support exports [S89, S97] | Added seven-day retry-history retention, stale-entry pruning on sync persistence, local-health retained/stale counts, and support-snapshot allowlisting |
| 99 | GM value-sync retry resolution drill | `tests/source-cloud-sync.test.js` | Empty-local-only retries should prove a transient write failure resolves on a later sync without widening stored or exported diagnostics [S89, S97] | Extended the write-failure fixture through a second sync that applies the preserved remote bundle and keeps retry result output identifier/value-free |
| 100 | GM value-sync retry-resolution health summaries | `src/background/core.ts`, `src/types/messages.ts`, generated runtime artifacts, `pages/dashboard.js`, focused local-health/support tests | Support diagnostics need aggregate proof that retry-ready failures later cleared without exporting scripts, values, account data, or provider errors [S89, S97] | Added local retry-resolution records, support-safe health/export summaries, age buckets, and clear-all cleanup for resolution evidence |
| 101 | GM value-sync retry-resolution stale cleanup | `src/background/core.ts`, generated runtime artifacts, `tests/local-health-report.test.js` | Local diagnostic records should keep the same retention boundary as support-safe history evidence [S89, S97] | Removed stale or malformed retry-resolution records during sync result persistence when no fresh resolution is written |
| 102 | GM value-sync resolution-history support evidence | `src/background/core.ts`, `src/types/messages.ts`, generated runtime artifacts, `pages/dashboard.js`, focused local-health/support tests | Support diagnostics need bounded recent recovery evidence without exporting script/value/provider details [S89, S97] | Added a five-entry aggregate retry-resolution history, local-health/support summaries, stale-count reporting, and clear-all cleanup |
| 103 | GM value-sync retry-resolution export hardening | `pages/dashboard.js`, `tests/support-snapshot-redaction.test.js` | Support exports should not overstate retry-resolution evidence from malformed local-health input [S47, S98] | Rejected malformed resolution records without prior retry-ready evidence, zeroed retained-history totals when entries sanitize to zero, and normalized history timestamp ranges |
| 104 | GM value-sync retry-resolution source invariants | `tests/local-health-report.test.js` | Retry-resolution evidence must remain tied to successful clean retries after prior retry-ready history [S89, S97] | Added source-contract coverage for resolution record gates and persistence-time stale pruning of retry-resolution history |
| 105 | GM value-sync retry-resolution support summary polish | `pages/dashboard.js`, `tests/support-snapshot-redaction.test.js` | Operators should see aggregate stale/excluded recovery evidence before exporting support snapshots [S47, S98] | Added support-card labels for historical retry-resolution applies and stale retry-resolution-history events excluded |
| 106 | GM value-sync support-summary clamp hardening | `pages/dashboard.js`, `tests/support-snapshot-redaction.test.js` | Pre-export support summaries should format only non-negative integer aggregate counts [S47, S98] | Re-clamped all displayed GM value-sync support-summary counts before formatting |
| 107 | GM value-sync retry-resolution stale-history evidence | `tests/local-health-report.test.js` | Stale retry-resolution history should stay visible only as aggregate exclusion evidence [S89, S97] | Added local-health source coverage for include-stale reads, stale exclusion counts, retained-entry filtering, typed output, and privacy flags |
| 108 | GM value-sync support-summary schema drift coverage | `tests/support-snapshot-redaction.test.js` | Pre-export summaries should read only reviewed sanitized fields, not raw local-health input [S47, S98] | Pinned the exact sanitized GM value fields read by the support summary and rejected raw local-health field access |
| 109 | GM value-sync support export schema drift coverage | `tests/support-snapshot-redaction.test.js` | Support exports should expose only reviewed aggregate diagnostic fields at every nested level [S47, S98] | Pinned the exact returned sanitizer keys for GM value sync, last-result, retry-resolution, retry-resolution-history, and retry-history exports |
| 110 | GM value-sync support privacy schema drift coverage | `tests/support-snapshot-redaction.test.js` | Support export privacy metadata should stay explicit and false for sensitive data classes [S47, S98] | Pinned the exact nested privacy keys and false values for GM value sync support exports |
| 111 | GM value-sync support warning-count schema drift coverage | `tests/support-snapshot-redaction.test.js` | Support exports should allow only reviewed GM value warning identifiers [S47, S98] | Pinned the exact warning-count allowlist and rejected raw warning-count key iteration |
| 112 | GM value-sync retry-age bucket schema drift coverage | `tests/support-snapshot-redaction.test.js` | Retry-ready and retry-resolution support exports should share reviewed age buckets [S47, S98] | Pinned the exact retry-age bucket allowlist and unknown fallback for support exports |
| 113 | GM value-sync retry-resolution cleanup guard | `tests/local-health-report.test.js` | Stale or malformed local retry-resolution records should be removed without writing null diagnostics [S89, S97] | Pinned the single-record cleanup helper and persistence-time remove path |
| 114 | GM value-sync retry-resolution history storage contract | `tests/local-health-report.test.js` | Local retry-resolution history should retain only aggregate recovery evidence [S89, S97] | Pinned the exact stored retry-resolution history entry keys and rejected privacy/raw identifier fields |
| 115 | GM value-sync support summary phrase drift coverage | `tests/support-snapshot-redaction.test.js` | Pre-export summaries should use only reviewed aggregate diagnostic wording [S47, S98] | Pinned fallback, opt-in, retry, history, stale, and capped-value summary phrases while rejecting raw identifier labels |
| 116 | GM value-sync support summary count-order coverage | `tests/support-snapshot-redaction.test.js` | Pre-export summaries should present aggregate diagnostics in reviewed order [S47, S98] | Pinned baseline, retry, resolution, history, stale, warning, and final join order |
| 117 | GM value-sync support summary warning-total coverage | `tests/support-snapshot-redaction.test.js` | Warning totals should be computed only from sanitized support-export warning counts [S47, S98] | Pinned sanitized warning-count reduction, shared count clamping, and capped/excluded aggregate wording |
| 118 | GM value-sync retry-resolution history type schema coverage | `tests/local-health-report.test.js` | Typed local-health responses should expose only reviewed aggregate retry-resolution history fields [S89, S97] | Pinned retry-resolution-history response fields, privacy keys, and raw identifier exclusions |
| 119 | GM value-sync support summary fallback-state coverage | `tests/support-snapshot-redaction.test.js` | Pre-export summaries should return reviewed fallback states before formatting counts [S47, S98] | Pinned sanitize-first unchecked/unavailable fallback order before aggregate count formatting |
| 120 | GM value-sync retry-resolution typed privacy coverage | `tests/local-health-report.test.js` | Typed local-health responses should expose only reviewed aggregate retry-resolution fields and privacy keys [S89, S97] | Pinned single retry-resolution response fields, privacy keys, and raw identifier exclusions |
| 121 | GM value-sync retry-history typed privacy coverage | `tests/local-health-report.test.js` | Typed local-health responses should expose only reviewed aggregate retry-history fields and privacy keys [S89, S97] | Pinned retry-history response fields, privacy keys, and raw identifier exclusions |
| 122 | GM value-sync typed privacy coverage | `tests/local-health-report.test.js` | Typed local-health responses should keep the top-level GM value sync diagnostic envelope reviewed [S89, S97] | Pinned top-level GM value sync response fields, privacy keys, and raw identifier exclusions |
| 123 | GM value-sync last-result typed schema coverage | `tests/local-health-report.test.js` | Typed local-health responses should keep persisted sync result diagnostics aggregate-only [S89, S97] | Pinned last-result response fields, retry-age fields, and raw identifier/privacy exclusions |
| 124 | GM value-sync support unavailable-state wording coverage | `tests/support-snapshot-redaction.test.js` | Unavailable pre-export summaries should stay generic and support-safe [S47, S98] | Pinned generic unavailable wording and rejected provider/account/credential/script/key/error detail |
| 125 | GM value-sync last-result support export clamp coverage | `tests/support-snapshot-redaction.test.js` | Support exports should not overstate retry-ready last-result evidence [S47, S98] | Pinned retry-ready clamping to sanitized failure/preserved counts and retry-age gating |
| 126 | GM value-sync support unchecked-state wording coverage | `tests/support-snapshot-redaction.test.js` | Unchecked pre-export summaries should stay generic and support-safe [S47, S98] | Pinned generic unchecked wording and rejected provider/account/credential/script/key/error detail |
| 127 | GM value-sync last-result timestamp sanitizer coverage | `pages/dashboard.js`, `tests/support-snapshot-redaction.test.js` | Support exports should normalize last-result timestamps through the reviewed helper [S47, S98] | Routed last-result timestamp export through `sanitizeSupportSnapshotTimestamp()` and pinned the shared-helper path |
| 128 | GM value-sync retry-age unknown bucket coverage | `src/background/core.ts`, `background.core.js`, `tests/local-health-report.test.js` | Retry-ready diagnostics with missing timestamps should not be labeled fresh [S47, S98] | Classified null/undefined retry ages as `unknown` and pinned the local-health last-result gating path |
| 129 | GM value-sync support nested-field coverage | `tests/support-snapshot-redaction.test.js` | Pre-export support summaries should read only reviewed nested sanitized fields [S47, S98] | Pinned nested last-result, retry-resolution, retry-resolution-history, and retry-history field allowlists |
| 130 | GM value-sync retry-history timestamp retention coverage | `tests/support-snapshot-redaction.test.js` | Support exports should not retain retry-history timestamps when retained history is empty [S47, S98] | Pinned retained-history timestamp helper use for retry and retry-resolution histories |
| 131 | GM value-sync retry-resolution timestamp range coverage | `pages/dashboard.js`, `tests/support-snapshot-redaction.test.js` | Support exports should not expose impossible retry-resolution timestamp ranges [S47, S98] | Clamped retry-resolution latest retry timestamp to the resolution timestamp before export |
| 132 | GM value-sync retry-resolution age-bucket gating | `pages/dashboard.js`, `tests/support-snapshot-redaction.test.js` | Support exports should not retain retry-resolution age buckets without age minutes [S47, S98] | Gated retry-resolution age bucket export on retained age minutes and defaulted missing evidence to `unknown` |

## Competitive Position Summary

| Capability | ScriptVault | Tampermonkey | Violentmonkey | ScriptCat |
|---|---|---|---|---|
| MV3 native | Yes | Yes | **No (dead on Chrome)** | Yes |
| Open source | MIT | **No** | MIT | GPL-3.0 |
| Chrome Web Store | **Published** | **Published (12M)** | **Blocked (MV2)** | Published |
| GM API (35+) | Yes | Yes | Yes | Yes |
| Monaco editor | **Yes** | No | Yes (MV2) | No |
| DevTools panel | **Yes** | No | No | No |
| Side panel | **Yes** | No | No | No |
| Script signing (Ed25519) | **Yes** | No | No | No |
| AST analysis (31 detectors) | **Yes** | No | No | No |
| Cloud sync providers | **7** | 6 | 4 | Built-in |
| Update diff + review inbox | **Yes** | No | **No** (most-requested) | No |
| Version rollback | **Yes** (3) | No | No | No |
| Import quarantine | **Yes** | No | No | No |
| Sigstore provenance | **Yes** | No | No | No |
| Workspaces | **Yes** | No | No | No |
| Command palette | **Yes** | No | No | No |
| Performance budgets | **Yes** | No | No | No |
| Background/cron scripts | Partial | No | No | **Yes** |
| Enterprise provisioning | **Yes** (Chrome/Edge) | **Yes** (v5.5) | No | No |
| MCP/AI integration | No | **Yes** (v5.5) | No | No |
| Firefox published | **No (AMO-ready)** | Yes | Yes | Yes |
| Edge published | **No (pkg-ready)** | Yes | No | Yes |

## Appendix: Sources

| ID | Source | URL |
|---|---|---|
| S01 | TM CWS removal (#2498) | https://github.com/Tampermonkey/tampermonkey/issues/2498 |
| S02 | VM Chrome compat (#2340) | https://github.com/violentmonkey/violentmonkey/issues/2340 |
| S03 | VM still MV2 (#2284) | https://github.com/violentmonkey/violentmonkey/issues/2284 |
| S04 | ScriptCat MV3 | https://github.com/scriptscat/scriptcat |
| S05 | Greasemonkey | https://github.com/greasemonkey/greasemonkey |
| S06 | FireMonkey | https://github.com/erosman/firemonkey |
| S07 | WCAG 2.1 SC 3.3.1 | https://www.w3.org/WAI/WCAG21/Understanding/error-identification.html |
| S08 | MDN constraint validation | https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Constraint_validation |
| S09 | Settings schema drift | Local: docs/settings-schema.md |
| S10 | TM GM API docs | https://www.tampermonkey.net/documentation.php |
| S11 | VM GM API docs | https://violentmonkey.github.io/api/gm/ |
| S12 | ScriptCat GM docs | https://docs.scriptcat.org/en/ |
| S13 | Mozilla AMO submission | https://extensionworkshop.com/documentation/publish/source-code-submission/ |
| S14 | Mozilla library usage | https://extensionworkshop.com/documentation/publish/third-party-library-usage/ |
| S15 | Mozilla policies (Aug 2025) | https://blog.mozilla.org/addons/2025/06/23/updated-add-on-policies-simplified-clarified/ |
| S16 | CWS API v2 | https://developer.chrome.com/blog/cws-api-v2 |
| S17 | Monaco AMD deprecation | https://github.com/microsoft/monaco-editor/blob/main/CHANGELOG.md |
| S18 | Edge port guide | https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension |
| S19 | Edge API v1.1 | https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api |
| S20 | ScriptCat background | https://docs.scriptcat.org/docs/change/ |
| S21 | @background research | Local: RESEARCH_FEATURE_PLAN.md |
| S22 | Navigation API Baseline | https://www.infoq.com/news/2026/05/navigation-api-browser/ |
| S23 | Navigation API MDN | https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API |
| S24 | Monaco ESM (#3908) | https://github.com/microsoft/monaco-editor/discussions/3908 |
| S25 | Chrome `browser` namespace | https://developer.chrome.com/blog/extensions-io-2026 |
| S26 | Trusted Types | https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API |
| S27 | Script subscriptions | Local: CHANGELOG.md 2026-06-03 |
| S28 | TM v5.5.0 MCP + policy | https://www.tampermonkey.net/changelog.php?locale=en |
| S29 | IDE workflow pain | https://www.codestudy.net/blog/how-can-i-develop-my-userscript-in-my-favourite-ide-and-avoid-copy-pasting-it-to-the-tampermonkey-s-editor-every-time/ |
| S30 | VM @require-local | https://github.com/violentmonkey/violentmonkey/issues/2419 |
| S31 | DNR response headers | https://developer.chrome.com/docs/extensions/whats-new |
| S32 | Firefox mobile userScripts | https://bugzilla.mozilla.org/show_bug.cgi?id=1875475 |
| S33 | Sigstore keyless | https://docs.sigstore.dev/about/overview/ |
| S34 | npm Trusted Publishing | https://blog.sigstore.dev/npm-provenance-ga/ |
| S35 | Browser Sigstore verifier | https://tinfoil.sh/blog/2025-12-18-browser-native-verification |
| S36 | Vitest 4.0 Browser Mode | https://vitest.dev/blog/vitest-4 |
| S37 | VM GM value sync (#48) | https://github.com/violentmonkey/violentmonkey/issues/48 |
| S38 | TM WebSocket (#1483) | https://github.com/Tampermonkey/tampermonkey/issues/1483 |
| S39 | VM GreasyFork publish | https://github.com/violentmonkey/violentmonkey/issues/2425 |
| S40 | Safari UserScripts | https://github.com/quoid/userscripts |
| S41 | Safari lacks userScripts | https://developer.apple.com/documentation/safariservices/safari-web-extensions |
| S42 | GreasyFork platform | https://github.com/greasyfork-org/greasyfork |
| S43 | CodeTweak AI editor | https://github.com/MrBlankCoding/CodeTweak |
| S44 | TM Firefox containers | https://github.com/Tampermonkey/tampermonkey/issues/2792 |
| S45 | WXT evaluation | Local: docs/manifest-generation-design.md |
| S46 | storage.sync quota | https://developer.chrome.com/docs/extensions/reference/api/storage |
| S47 | userScripts API | https://developer.chrome.com/docs/extensions/reference/api/userScripts |
| S48 | Chrome 138 toggle | https://developer.chrome.com/blog/chrome-userscript |
| S49 | MV2 deprecation | https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline |
| S50 | VM update diff (#500) | https://github.com/violentmonkey/violentmonkey/issues/500 |
| S51 | VM integrity (#1558) | https://github.com/violentmonkey/violentmonkey/issues/1558 |
| S52 | TM closed-source (#1515) | https://github.com/Tampermonkey/tampermonkey/issues/1515 |
| S53 | Cyberhaven attack | https://www.cyberhaven.com/engineering-blog/final-analysis-chrome-extension-security-incident |
| S54 | Trust Wallet attack | https://www.rescana.com/post/trust-wallet-chrome-extension-supply-chain-attack-7-million-cryptocurrency-theft-via-compromised-v |
| S55 | MV3 extensions study | https://arxiv.org/abs/2503.04292 |
| S56 | Arcanum USENIX 2024 | https://www.gatech.edu/news/2024/09/17/study-finds-thousands-browser-extensions-compromise-user-data |
| S57 | Signature-Based SRI | https://groups.google.com/a/chromium.org/g/blink-dev/c/QSsuBmjlnfk/m/jZA-M5VhAgAJ |
| S58 | OWASP Extension Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html |
| S59 | Mozilla secure ext guide | https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Security_best_practices |
| S60 | GH Actions hardening | https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions |
| S61 | EU CRA SBOM | https://www.darkreading.com/application-security/sboms-in-2026-some-love-some-hate-much-ambivalence |
| S62 | W3C WebExtensions CG | https://www.w3.org/community/webextensions/ |
| S63 | uBOL architecture | https://deepwiki.com/gorhill/uBlock/10.1-mv3-architecture-overview |
| S64 | Stylus MV3 | https://github.com/openstyles/stylus/discussions/1761 |
| S65 | Playwright ext testing | https://playwright.dev/docs/chrome-extensions |
| S66 | Vitest 4.1 | https://vitest.dev/blog/vitest-4-1.html |
| S67 | CWS 2025 policies | https://developer.chrome.com/blog/cws-policy-updates-2025 |
| S68 | Privacy Guides TM | https://discuss.privacyguides.net/t/does-tampermonkey-extension-affect-privacy-and-security/16728 |
| S69 | HN TM trust | https://news.ycombinator.com/item?id=35692540 |
| S70 | awesome-userscripts | https://github.com/awesome-scripts/awesome-userscripts |
| S71 | VM MV3 PR (#2399) | https://github.com/violentmonkey/violentmonkey/pull/2399 |
| S72 | Mozilla MV2 support | https://www.ghacks.net/2025/02/26/firefox-mozilla-confirms-support-for-classic-extensions-and-manifest-v3-add-ons/ |
| S73 | npm worm (Sep 2025) | https://www.sygnia.co/threat-reports-and-advisories/npm-supply-chain-attack-september-2025/ |
| S74 | MDN Firefox MV3 userScripts | https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/userScripts |
| S75 | CWS Program Policies MV3 code requirements | https://developer.chrome.com/docs/webstore/program-policies/policies |
| S76 | Greasy Fork API and prefilled updates | https://greasyfork.org/en/help/api |
| S77 | Tampermonkey external editor FAQ | https://www.tampermonkey.net/faq.php?q=Q402 |
| S78 | Tampermonkey Editors vscode.dev extension | https://chromewebstore.google.com/detail/tampermonkey-editors/lieodnapokbjkkdkhdljlllmgkmdokcm |
| S79 | Local userscript workflow pain | https://www.reddit.com/r/tampermonkey/comments/1qrbdeo/develop_userscript_in_vscode_without_manual/ |
| S80 | Chrome DNR responseHeaders reference | https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest |
| S81 | Chrome File System Access API | https://developer.chrome.com/docs/capabilities/web-apis/file-system-access |
| S82 | Chrome Offscreen API | https://developer.chrome.com/docs/extensions/reference/api/offscreen |
| S83 | Chrome remote-hosted-code guidance | https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code |
| S84 | ScriptCat background script docs | https://docs.scriptcat.org/en/docs/dev/background/ |
| S85 | Chrome Navigation API guide | https://developer.chrome.com/docs/web-platform/navigation-api |
| S86 | MDN Navigation navigate event | https://developer.mozilla.org/en-US/docs/Web/API/Navigation/navigate_event |
| S87 | Chrome webNavigation extension API | https://developer.chrome.com/docs/extensions/reference/api/webNavigation |
| S88 | MDN Navigation API overview | https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API |
| S89 | CWS User Data FAQ | https://developer.chrome.com/docs/webstore/program-policies/user-data-faq/ |
| S90 | MDN File System API overview | https://developer.mozilla.org/en-US/docs/Web/API/File_System_API |
| S91 | Chrome File System Access persistent permissions | https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api |
| S92 | MDN FileSystemFileHandle | https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle |
| S93 | Chrome alarms API | https://developer.chrome.com/docs/extensions/reference/api/alarms |
| S94 | MDN Clipboard writeText | https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText |
| S95 | MDN URL createObjectURL | https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static |
| S96 | MDN anchor download | https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a#download |
| S97 | Chrome Storage API managed area | https://developer.chrome.com/docs/extensions/reference/api/storage |
| S98 | Chrome managed storage manifest schema | https://developer.chrome.com/docs/extensions/reference/manifest/storage |
| S99 | Chrome extension policy deployment verification | https://support.google.com/chrome/a/answer/7517624 |

## Research-Driven Additions (2026-06-09)

> Items below were identified by exhaustive repo walk + 35+ external sources.
> Duplicates against existing Now/Next/Later/UC/Rejected tiers were filtered.
> Each item carries impact (1-5), effort (S/M/L/XL), and tier recommendation.

### Appendix: Research-Driven Sources

| ID | Source | URL |
|---|---|---|
| R01 | ScriptCat HN thread (2026) | https://news.ycombinator.com/item?id=45938449 |
| R02 | ScriptCat DeepWiki | https://deepwiki.com/scriptscat/scriptcat |
| R03 | Chrome IndexedDB storage buckets | https://developer.chrome.com/blog/maximum-idb-performance-with-storage-buckets |
| R04 | Chrome IndexedDB compression | https://developer.chrome.com/docs/chromium/indexeddb-storage-improvements |
| R05 | EU CRA SBOM timeline | https://www.herodevs.com/blog-posts/cra-reporting-obligations-start-september-2026 |
| R06 | Cyberhaven supply chain | https://www.cyberhaven.com/engineering-blog/final-analysis-chrome-extension-security-incident |
| R07 | Trust Wallet supply chain | https://thehackernews.com/2025/12/trust-wallet-chrome-extension-hack.html |
| R08 | Chrome SW lifecycle | https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle |
| R09 | Monaco v0.55 LSP | https://github.com/microsoft/monaco-editor/blob/main/CHANGELOG.md |
| R10 | TypeScript 6 features | https://pooyagolchian.com/blog/typescript-6-features-2026/ |
| R11 | Playwright extension testing | https://playwright.dev/docs/chrome-extensions |
| R12 | WCAG 2.2 resize text | https://www.w3.org/TR/WCAG22/ |
| R13 | Chrome ext supply chain (2026) | https://securityboulevard.com/2026/03/the-chrome-extension-backdoor-how-productivity-tools-became-enterprise-attack-vectors/ |

### Appendix: Research-Driven Sources (2026-06-12)

| ID | Source | URL |
|---|---|---|
| RD12-01 | Tampermonkey MCP server | https://github.com/Tampermonkey/tampermonkey-mcp |
| RD12-02 | VM MV3 status (dead on Chrome) | https://github.com/violentmonkey/violentmonkey/issues/2340 |
| RD12-03 | ScriptCat background scripts | https://docs.scriptcat.org/en/docs/dev/background/ |
| RD12-04 | Chrome userScripts.execute (135+) | https://developer.chrome.com/docs/extensions/reference/api/userScripts |
| RD12-05 | Chrome 138 per-extension toggle | https://developer.chrome.com/blog/chrome-userscript |
| RD12-06 | Chrome structured-clone messaging | https://developer.chrome.com/blog/structured-clone-messaging |
| RD12-07 | Ed25519 native browser support | https://blogs.igalia.com/nicolo/2025/05/21/ed25519-in-all-browsers/ |
| RD12-08 | Trust Wallet supply chain attack | https://thehackernews.com/2025/12/trust-wallet-chrome-extension-hack.html |
| RD12-09 | 36-extension compromise (2025) | https://blog.sekoia.io/targeted-supply-chain-attack-against-chrome-browser-extensions/ |
| RD12-10 | Trusted Types API baseline | https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API |
| RD12-11 | Chrome sidePanel.getLayout (140+) | https://developer.chrome.com/docs/extensions/reference/api/sidePanel |
| RD12-12 | OWASP Extension Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html |
| RD12-13 | Chrome SW lifecycle improvements | https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle |
| RD12-14 | SemVer 2.0.0 pre-release ordering | https://semver.org/#spec-item-11 |
| RD12-15 | Monaco v0.55 breaking changes | https://github.com/microsoft/monaco-editor/blob/main/CHANGELOG.md |
| RD12-16 | CWS policy updates 2025 | https://developer.chrome.com/blog/cws-policy-updates-2025 |
| RD12-17 | Firefox AMO policies (Aug 2025) | https://blog.mozilla.org/addons/2025/06/23/updated-add-on-policies-simplified-clarified/ |
| RD12-18 | MV2 deprecation timeline | https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline |

### Appendix: Research-Driven Sources (2026-06-13)

| ID | Source | URL |
|---|---|---|
| RD13-01 | Chrome 141 Signature-Based SRI | https://developer.chrome.com/release-notes/141 |
| RD13-02 | WICG Signature-Based SRI spec | https://wicg.github.io/signature-based-sri/ |
| RD13-03 | Popover API baseline | https://developer.chrome.com/blog/introducing-popover-api |
| RD13-04 | CSS Anchor Positioning baseline | https://developer.chrome.com/blog/anchor-positioning-api |
| RD13-05 | Firefox 149-152 API changes | https://blog.mozilla.org/addons/2026/04/23/webextensions-api-changes-firefox-149-152/ |
| RD13-06 | CVE-2026-0628 Gemini panel hijack | https://unit42.paloaltonetworks.com/gemini-live-in-chrome-hijacking/ |
| RD13-07 | Group-IB 2026 supply chain report | https://www.group-ib.com/blog/supply-chain-attack-groups-2026/ |
| RD13-08 | PackageGate npm zero-days | https://www.securityweek.com/packagegate-flaws-open-javascript-ecosystem-to-supply-chain-attacks/ |
| RD13-09 | Chrome 139 MV2 final removal | https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline |
| RD13-10 | Chrome I/O 2026 extensions recap | https://developer.chrome.com/blog/extensions-io-2026 |
| RD13-11 | LayerX extension security 2026 | https://go.layerxsecurity.com/browser-extension-security-report-2026 |
| RD13-12 | EU CRA draft guidance (Mar 2026) | https://digital-strategy.ec.europa.eu/en/news/commission-publishes-feedback-draft-guidance-assist-companies-applying-cyber-resilience-act |
| RD13-13 | Chrome IndexedDB Snappy compression | https://developer.chrome.com/docs/chromium/indexeddb-storage-improvements |
| RD13-14 | W3C WebExtensions WG draft charter | https://w3c.github.io/charter-drafts/2025/webextensions-wg.html |
| RD13-15 | Chrome DevTools for Agents v1 | https://developer.chrome.com/blog/devtools-for-agents-v1 |

### Appendix: Research-Driven Sources (2026-06-14)

| ID | Source | URL |
|---|---|---|
| RD14-01 | Tampermonkey changelog | https://www.tampermonkey.net/changelog.php |
| RD14-02 | Tampermonkey MCP server | https://github.com/Tampermonkey/tampermonkey-mcp |
| RD14-03 | Violentmonkey MV3 issue | https://github.com/violentmonkey/violentmonkey/issues/1934 |
| RD14-04 | ScriptCat repository | https://github.com/scriptscat/scriptcat |
| RD14-05 | ScriptCat documentation | https://docs.scriptcat.org/en/ |
| RD14-06 | Chrome userScripts API | https://developer.chrome.com/docs/extensions/reference/api/userScripts |
| RD14-07 | Chrome userScripts toggle change | https://developer.chrome.com/blog/chrome-userscript |
| RD14-08 | Chrome structured-clone messaging | https://developer.chrome.com/blog/structured-clone-messaging |
| RD14-09 | Firefox userScripts API | https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/userScripts |
| RD14-10 | Firefox WebExtensions API changes 149-152 | https://blog.mozilla.org/addons/2026/04/23/webextensions-api-changes-firefox-149-152/ |
| RD14-11 | Chrome remote-hosted-code guidance | https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code |
| RD14-12 | OWASP Browser Extension Vulnerabilities Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html |
| RD14-13 | Sekoia extension supply-chain report | https://blog.sekoia.io/targeted-supply-chain-attack-against-chrome-browser-extensions/ |
| RD14-14 | LayerX GhostPoster extension campaign | https://layerxsecurity.com/blog/browser-extensions-gone-rogue-the-full-scope-of-the-ghostposter-campaign/ |
| RD14-15 | Palant remote-code-ban bypass analysis | https://palant.info/2025/01/20/malicious-extensions-circumvent-googles-remote-code-ban/ |

## Research-Driven Additions (2026-06-15)

> Items below identified by exhaustive repo walk + 40+ external sources across
> competitors (Tampermonkey v5.5.0, Violentmonkey MV3 status, ScriptCat v1.4.0-beta.4),
> Chrome 140-148 APIs, Firefox 149-153, security landscape (NSA MCP guidance, EU CRA
> Sep 2026, Trusted Types Baseline), and dependency changelogs. Deduplicated against
> all existing tiers (Now through Rejected) and all prior RD-1..RD-14 additions.

### Appendix: Research-Driven Sources (2026-06-15)

| ID | Source | URL |
|---|---|---|
| RD15-01 | NSA MCP security guidance | https://media.defense.gov/2026/Jun/02/2003943289/-1/-1/0/CSI_MCP_SECURITY.PDF |
| RD15-02 | Trusted Types Baseline (Feb 2026) | https://web.dev/blog/baseline-digest-feb-2026 |
| RD15-03 | esbuild security advisory | https://security.snyk.io/package/npm/esbuild |
| RD15-04 | EU CRA Sep 2026 reporting | https://anchore.com/sbom/eu-cra/ |
| RD15-05 | EU CRA EOL obligations | https://www.herodevs.com/blog-posts/cra-reporting-obligations-start-september-2026 |
| RD15-06 | Violentmonkey MV3 closure | https://github.com/violentmonkey/violentmonkey/issues/1934 |
| RD15-07 | VM community MV3 PR closed | https://github.com/violentmonkey/violentmonkey/pull/2493 |
| RD15-08 | ScriptCat v1.4.0-beta.4 | https://github.com/scriptscat/scriptcat |
| RD15-09 | Acorn 8.17.0 strict mode | https://github.com/acornjs/acorn |
| RD15-10 | Chrome 148 browser namespace | https://developer.chrome.com/docs/extensions/whats-new |
| RD15-11 | Monaco v0.55 LSP namespace | https://github.com/microsoft/monaco-editor/blob/main/CHANGELOG.md |
| RD15-12 | Vitest 4.1 Browser Mode stable | https://vitest.dev/blog/vitest-4 |
| RD15-13 | CVE-2025-49596 MCP Inspector | https://github.com/advisories/GHSA-9crc-q9x8-hgqq |
| RD15-14 | Tampermonkey MCP server | https://github.com/Tampermonkey/tampermonkey-mcp |
| RD15-15 | Chrome MV2 final removal | https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline |



### Appendix: Research-Driven Sources (2026-06-20)

| ID | Source | URL |
|---|---|---|
| RD20-01 | VM MV3 death (Chrome 150 flag removal) | https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline |
| RD20-02 | VM community MV3 PR closed | https://github.com/violentmonkey/violentmonkey/pull/2493 |
| RD20-03 | VM stranded user base | https://github.com/violentmonkey/violentmonkey/issues/1934 |
| RD20-04 | Vitest coverage v8 provider | https://vitest.dev/guide/coverage |
| RD20-05 | WCAG 2.1 SC 2.1.1 keyboard | https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html |
| RD20-06 | AMO reproducible builds | https://extensionworkshop.com/documentation/publish/source-code-submission/ |
| RD20-07 | CSS logical properties | https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values |
| RD20-08 | ScriptCat export format | https://docs.scriptcat.org/en/ |
| RD20-09 | Chrome 150 release schedule | https://chromiumdash.appspot.com/schedule |
| RD20-10 | CWS screenshot requirements | https://developer.chrome.com/docs/webstore/images |
| RD20-11 | Trusted Types MDN | https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API |
| RD20-12 | NSA MCP security guidance | https://media.defense.gov/2026/Jun/02/2003943289/-1/-1/0/CSI_MCP_SECURITY.PDF |




### Appendix: Research-Driven Sources (2026-06-21)

| ID | Source | URL |
|---|---|---|
| RD21-01 | CSS logical properties MDN | https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values |
| RD21-02 | chrome.i18n API | https://developer.chrome.com/docs/extensions/reference/api/i18n |
| RD21-03 | scripts/check-readme-claims.mjs | Local: `scripts/check-readme-claims.mjs` |
| RD21-04 | WCAG 2.2 SC 2.5.8 Target Size | https://www.w3.org/TR/WCAG22/#target-size-minimum |
| RD21-05 | MCPMonkey (VM MCP fork) | https://github.com/kstrikis/mcpmonkey |
| RD21-06 | MCP spec 2026-07-28 RC | https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/ |
| RD21-07 | Firefox 153 userScripts.execute | https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/153 |
| RD21-08 | Axios npm compromise (2026) | https://www.microsoft.com/en-us/security/blog/2026/04/01/mitigating-the-axios-npm-supply-chain-compromise/ |
| RD21-09 | Red Hat npm worm (2026) | https://www.wiz.io/blog/miasma-supply-chain-attack-targeting-redhat-npm-packages |
| RD21-10 | Mastra npm scope takeover (2026) | https://www.microsoft.com/en-us/security/blog/2026/06/17/postinstall-payload-inside-mastra-npm-supply-chain-compromise/ |





### Appendix: Research-Driven Sources (2026-06-20 deep pass 2)

| ID | Source | URL |
|---|---|---|
| RD22-01 | Chrome sidePanel API (close/onOpened/onClosed) | https://developer.chrome.com/docs/extensions/reference/api/sidePanel |
| RD22-02 | Popover API Baseline | https://developer.chrome.com/blog/introducing-popover-api |
| RD22-03 | CSS Container Queries guide | https://developer.chrome.com/docs/devtools/css/container-queries |
| RD22-04 | Navigation API Baseline | https://web.dev/blog/baseline-navigation-api |
| RD22-05 | IndexedDB Snappy compression | https://developer.chrome.com/docs/chromium/indexeddb-storage-improvements |
| RD22-06 | VM MV3 death issue | https://github.com/violentmonkey/violentmonkey/issues/2340 |
| RD22-07 | VM fork proposal | https://github.com/violentmonkey/violentmonkey/issues/2341 |
| RD22-08 | TM closed-source concerns | https://github.com/Tampermonkey/tampermonkey/issues/1515 |
| RD22-09 | Privacy Guides TM discussion | https://discuss.privacyguides.net/t/does-tampermonkey-extension-affect-privacy-and-security/16728 |
| RD22-10 | OrangeMonkey Chrome Stats | https://chrome-stats.com/d/ekmeppjgajofkpiofbebgcbohbmfldaf |
| RD22-11 | Cyberhaven supply chain attack | https://www.cyberhaven.com/engineering-blog/final-analysis-chrome-extension-security-incident |
| RD22-12 | DarkSpectre/GhostPoster 8.8M users | https://thehackernews.com/2025/12/darkspectre-browser-extension-campaigns.html |
| RD22-13 | Stanley MaaS guaranteed CWS publication | https://www.bleepingcomputer.com/news/security/new-malware-service-guarantees-phishing-extensions-on-chrome-web-store/ |
| RD22-14 | LayerX Extension Security Report 2026 | https://go.layerxsecurity.com/browser-extension-security-report-2026 |
| RD22-15 | OWASP Browser Extension Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html |
| RD22-16 | Chrome DevTools for Agents v1 | https://developer.chrome.com/blog/devtools-for-agents-v1 |
| RD22-17 | TM alternatives roundup (absent) | https://rigorousthemes.com/blog/best-tampermonkey-alternatives/ |
| RD22-18 | Chrome MV2 final removal June 30 | https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline |
| RD22-19 | EU CRA reporting timeline | https://anchore.com/sbom/eu-cra/ |
| RD22-20 | NSA MCP security guidance | https://media.defense.gov/2026/Jun/02/2003943289/-1/-1/0/CSI_MCP_SECURITY.PDF |
| RD22-21 | Trusted Types on YouTube | https://developer.chrome.com/blog/trusted-types-on-youtube |
| RD22-22 | Monaco v0.55 breaking changes | https://github.com/microsoft/monaco-editor/blob/main/CHANGELOG.md |
| RD22-23 | Vitest 4.1 test tags | https://vitest.dev/blog/vitest-4-1.html |
| RD22-24 | TypeScript 6.0 announcement | https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/ |
| RD22-25 | Chrome I/O 2026 extensions recap | https://developer.chrome.com/blog/extensions-io-2026 |




### Appendix: Research-Driven Sources (2026-06-25)

| ID | Source | URL |
|---|---|---|
| RD25-01 | Chrome 148 release notes (browser namespace, structured clone) | https://developer.chrome.com/release-notes/148 |
| RD25-02 | Chrome 149 release notes (WebMCP origin trial) | https://developer.chrome.com/release-notes/149 |
| RD25-03 | Chrome I/O 2026 extensions recap | https://developer.chrome.com/blog/extensions-io-2026 |
| RD25-04 | Chrome MV2 final deprecation timeline | https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline |
| RD25-05 | Firefox 149-152 WebExtensions API changes | https://blog.mozilla.org/addons/2026/04/23/webextensions-api-changes-firefox-149-152/ |
| RD25-06 | Firefox 153 release notes | https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/153 |
| RD25-07 | CSS Anchor Positioning Baseline | https://developer.chrome.com/blog/anchor-positioning-api |
| RD25-08 | CSS Container Queries style queries Baseline (May 2026) | https://web.dev/blog/baseline-digest-may-2026 |
| RD25-09 | Popover API Baseline Widely Available | https://developer.chrome.com/blog/introducing-popover-api |
| RD25-10 | CycloneDX 1.7 (ECMA-424 2nd Ed) | https://docs.sbom.observer/release-notes/2026-03-25-cyclonedx-1.7 |
| RD25-11 | Vitest CVE-2026-47429 (arbitrary file read) | https://github.com/advisories/GHSA-5xrq-8626-4rwp |
| RD25-12 | npm audit: tmp path traversal | https://github.com/advisories/GHSA-7c78-jf6q-g5cm |
| RD25-13 | npm audit: undici TLS bypass | https://github.com/advisories/GHSA-vmh5-mc38-953g |
| RD25-14 | npm audit: vite NTLMv2 disclosure | https://github.com/advisories/GHSA-v6wh-96g9-6wx3 |
| RD25-15 | npm audit: ws memory exhaustion | https://github.com/advisories/GHSA-96hv-2xvq-fx4p |
| RD25-16 | QuickLens extension supply chain attack | https://www.rescana.com/post/quicklens-chrome-extension-supply-chain-attack-cryptocurrency-theft-and-clickfix-malware-campaign-a/ |
| RD25-17 | Ownership-transfer permission creep attack class | https://pluto.security/blog/chrome-extension-supply-chain-attacks-permission-creep/ |
| RD25-18 | CSA MCP Security Best Practices v1 | https://labs.cloudsecurityalliance.org/agentic/agentic-mcp-security-best-practices-v1/ |
| RD25-19 | MCP-38 threat taxonomy (arxiv) | https://arxiv.org/pdf/2603.18063 |
| RD25-20 | Tweeks (YC W25) AI userscript generator | https://www.tweeks.io/ |
| RD25-21 | Tampermonkey MCP server (17 GH stars) | https://github.com/Tampermonkey/tampermonkey-mcp |
| RD25-22 | Violentmonkey confirmed dead on Chrome | https://github.com/violentmonkey/violentmonkey/issues/1934 |
| RD25-23 | OrangeMonkey (2M+ users, VM fork) | https://chrome-stats.com/d/ekmeppjgajofkpiofbebgcbohbmfldaf |
| RD25-24 | Cosign v3 Sigstore bundle format | https://blog.sigstore.dev/cosign-3-0-available/ |
| RD25-25 | WCAG 2.2 SC 2.5.8 Target Size Minimum | https://www.w3.org/TR/WCAG22/#target-size-minimum |
| RD25-26 | Firefox adopted stylesheets content script access | https://bugzilla.mozilla.org/show_bug.cgi?id=1751346 |
| RD25-27 | EU CRA open-source carve-out | https://digital-strategy.ec.europa.eu/en/policies/cra-open-source |
| RD25-28 | W3C WebExtensions spec draft (June 5, 2026) | https://w3c.github.io/webextensions/specification/ |

### Appendix: Research-Driven Sources (2026-06-25 deep pass)

| ID | Source | URL |
|---|---|---|
| RD25D-01 | Tampermonkey v5.5.0 changelog | https://www.tampermonkey.net/changelog.php |
| RD25D-02 | Tampermonkey MCP server | https://github.com/Tampermonkey/tampermonkey-mcp |
| RD25D-03 | Violentmonkey MV3 death (confirmed) | https://github.com/violentmonkey/violentmonkey/issues/1934 |
| RD25D-04 | ScriptCat v1.4.0 AI Agent + MCP | https://github.com/scriptscat/scriptcat/releases/tag/v1.4.0 |
| RD25D-05 | ScriptCat documentation | https://docs.scriptcat.org/en/ |
| RD25D-06 | Tweeks (YC W25) AI userscript | https://www.tweeks.io/ |
| RD25D-07 | OrangeMonkey (2M+ users) | https://chrome-stats.com/d/ekmeppjgajofkpiofbebgcbohbmfldaf |
| RD25D-08 | Greasemonkey v4.14 | https://github.com/greasemonkey/greasemonkey |
| RD25D-09 | FireMonkey (userscript+userstyle) | https://github.com/erosman/firemonkey |
| RD25D-10 | Userscripts Safari v5.0.0-beta.23 | https://github.com/quoid/userscripts |
| RD25D-11 | Chrome MV2 final removal (Chrome 150) | https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline |
| RD25D-12 | Chrome Mutation Events deprecation | https://developer.chrome.com/blog/mutation-events-deprecation |
| RD25D-13 | Sanitizer API (setHTML) | https://web.dev/articles/sanitizer |
| RD25D-14 | Playwright Trace Viewer | https://playwright.dev/docs/trace-viewer |
| RD25D-15 | CodeMirror 6 changelog | https://codemirror.net/docs/changelog/ |
| RD25D-16 | vite-plugin-monkey (2K stars) | https://github.com/lisonge/vite-plugin-monkey |
| RD25D-17 | Chrome userScripts API | https://developer.chrome.com/docs/extensions/reference/api/userScripts |
| RD25D-18 | Chrome service worker lifecycle | https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle |
| RD25D-19 | Chrome I/O 2026 extensions recap | https://developer.chrome.com/blog/extensions-io-2026 |
| RD25D-20 | Firefox 153 release notes | https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/153 |
| RD25D-21 | OWASP Extension Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html |
| RD25D-22 | CSA MCP Security Best Practices v1 | https://labs.cloudsecurityalliance.org/agentic/agentic-mcp-security-best-practices-v1/ |
| RD25D-23 | Extension supply chain attacks (Sekoia) | https://blog.sekoia.io/targeted-supply-chain-attack-against-chrome-browser-extensions/ |
| RD25D-24 | Cyberhaven supply chain attack | https://www.cyberhaven.com/engineering-blog/final-analysis-chrome-extension-security-incident |
| RD25D-25 | Ownership-transfer permission creep | https://pluto.security/blog/chrome-extension-supply-chain-attacks-permission-creep/ |
| RD25D-26 | Requestly (HTTP interception + scripts) | https://www.requestly.com/ |
| RD25D-27 | Automa browser automation | https://www.automa.site/ |
| RD25D-28 | n8n workflow automation | https://n8n.io/ |
| RD25D-29 | awesome-userscripts | https://github.com/awesome-scripts/awesome-userscripts |
| RD25D-30 | Monaco v0.55 changelog | https://github.com/microsoft/monaco-editor/blob/main/CHANGELOG.md |

### Appendix: Research-Driven Sources (2026-06-26)

| ID | Source | URL |
|---|---|---|
| RD26-01 | ScriptCat v1.4.0 stable release | https://github.com/scriptscat/scriptcat/releases |
| RD26-02 | Chrome 150 MV2 flag removal | https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline |
| RD26-03 | Chrome 151 MV2 final lockdown | https://piunikaweb.com/2026/06/08/chrome-manifest-v2-unpacked-extensions-mac-windows/ |
| RD26-04 | Firefox 153 beta release notes | https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/153 |
| RD26-05 | 108 malicious extensions campaign (Socket) | https://techretry.com/malicious-chrome-extensions-2026/ |
| RD26-06 | DLL side-loading via Chrome enterprise policies | https://cybersecuritynews.com/malicious-chrome-extension-uses-native-messaging-host/ |
| RD26-07 | Vitest 4.1.9 / 5.0.0-beta.5 | https://github.com/vitest-dev/vitest/releases |
| RD26-08 | Monaco v0.55.1 stable / v0.56-dev | https://github.com/microsoft/monaco-editor/releases |
| RD26-09 | Vitest CVE-2026-47429 (CVSS 9.8) | https://github.com/advisories/GHSA-5xrq-8626-4rwp |
| RD26-10 | W3C WebExtensions WG draft charter | https://w3c.github.io/charter-drafts/2025/webextensions-wg.html |

## Deep Audit Findings (2026-07-02)

_Verified-but-unfixed items from the 2026-07-02 deep audit. The audit shipped fixes for GM handler auth binding, attribute-injection XSS, the Chrome-as-Firefox misdetection, editor keystroke/cursor/undo bugs, trash-restore + backup-import data loss, and the cloud-sync tombstone-resurrection data loss (see CHANGELOG v3.16.0). The items below were confirmed reachable but deferred as higher-risk or larger than an audit fix._

### P2

### P3

## Research-Driven Additions

_Added 2026-07-01. Items below are net-new from the 2026-07-01 research pass and do not duplicate the existing Now/Next/Later/N-/X-/L-/UC- items. Sources in the Research-Driven Sources (2026-07-01) appendix._

### P2

### P3

### Appendix: Research-Driven Sources (2026-07-01)

| ID | Source | URL |
|---|---|---|
| RD27-01 | Tampermonkey 5.5.0 changelog | https://www.tampermonkey.net/changelog.php |
| RD27-02 | Tampermonkey MCP server | https://github.com/Tampermonkey/tampermonkey-mcp |
| RD27-03 | ScriptCat v1.4.0 changelog (once/MCP/@early-start) | https://docs.scriptcat.org/en/docs/change/ |
| RD27-04 | Userscripts for Safari (directory store) | https://github.com/quoid/userscripts |
| RD27-05 | TM scripts silently not executing | https://github.com/Tampermonkey/tampermonkey/issues/2536 |
| RD27-06 | TM document-start injection timing | https://github.com/Tampermonkey/tampermonkey/issues/2086 |
| RD27-07 | quoid/userscripts instant injection | https://github.com/quoid/userscripts/issues/459 |
| RD27-08 | GreasyFork SPA navigation warning | https://greasyfork.org/en/discussions/development/247083 |
| RD27-09 | Chrome 138 Allow-User-Scripts toggle | https://developer.chrome.com/blog/chrome-userscript |
| RD27-10 | HTML Sanitizer API (Element.setHTML) | https://developer.mozilla.org/en-US/docs/Web/API/HTML_Sanitizer_API |
| RD27-11 | Compression Streams API (Baseline 2025-11) | https://developer.mozilla.org/en-US/docs/Web/API/Compression_Streams_API |
| RD27-12 | vite-plugin-monkey dev server HMR | https://github.com/lisonge/vite-plugin-monkey |
| RD27-13 | TM granular host-permission requests | https://github.com/Tampermonkey/tampermonkey/issues/640 |
| RD27-14 | HN Tampermonkey alternatives (privacy) | https://news.ycombinator.com/item?id=22896078 |
| RD27-15 | CSA MCP security best-practices | https://labs.cloudsecurityalliance.org/agentic/agentic-mcp-security-best-practices-v1/ |

## Research-Driven Additions (2026-07-02 research pass)

_Net-new from the 2026-07-02 pass (v3.16.0). Verified as not already implemented in code and not duplicating the Next tier, the Deep Audit Findings (2026-07-02), or the 2026-07-01 Research-Driven Additions. Cross-references: the Next-tier "editor cursor position stuck at Ln 1, Col 1" item is RESOLVED in v3.16.0 (monaco-adapter now caches the real cursor) — treat as done. One-click GreasyFork/OpenUserJS publish (VM #2425) is already covered by X-9 (publish handoff) — not re-added. UC-3 (AI-Assisted Script Editing) precondition "on-device LLMs practical" is now MET (Chrome Prompt API stable for extensions since Chrome 138) — see the P2 AI item below to promote it._

### P2

### P3

### Appendix: Research-Driven Sources (2026-07-02)

| ID | Source | URL |
|---|---|---|
| RD28-01 | TM per-script isolated cookie jars | https://github.com/Tampermonkey/tampermonkey/issues/2815 |
| RD28-02 | TM fake crypto-exploit userscripts | https://github.com/Tampermonkey/tampermonkey/issues/2783 |
| RD28-03 | TM streaming GM.fetch request | https://github.com/Tampermonkey/tampermonkey/issues/1278 |
| RD28-04 | TM MV3 GM_xhr DNR serialization | https://github.com/Tampermonkey/tampermonkey/issues/2215 |
| RD28-05 | ScriptCat AI Agent | https://github.com/scriptscat/scriptcat/pull/1324 |
| RD28-06 | ScriptCat request-scoped DNR | https://github.com/scriptscat/scriptcat/pull/1377 |
| RD28-07 | ScriptCat v1.4.0 release notes | https://github.com/scriptscat/scriptcat/releases/tag/v1.4.0 |
| RD28-08 | GreasyFork SRI enforcement request | https://github.com/JasonBarnabe/greasyfork/issues/1070 |
| RD28-09 | Chrome Prompt API (Gemini Nano) | https://developer.chrome.com/docs/ai/prompt-api |
| RD28-10 | Chrome built-in AI overview | https://developer.chrome.com/docs/ai/built-in |
| RD28-11 | VM restrict-to-current-site cluster | https://github.com/violentmonkey/violentmonkey/issues/2410 |
| RD28-12 | GreasyFork account-takeover propagation | https://github.com/JasonBarnabe/greasyfork/issues/682 |
| RD28-13 | VM local-directory sync | https://github.com/violentmonkey/violentmonkey/issues/2125 |
| RD28-14 | VM git-server sync | https://github.com/violentmonkey/violentmonkey/issues/2176 |
| RD28-15 | File System Observer API | https://developer.chrome.com/blog/file-system-observer |
| RD28-16 | VM hold-execution-until-sync | https://github.com/violentmonkey/violentmonkey/issues/2067 |
| RD28-17 | TM partitioned-cookie/CHIPS download | https://github.com/Tampermonkey/tampermonkey/issues/2419 |
| RD28-18 | TM SR-inaccessible delete controls | https://github.com/Tampermonkey/tampermonkey/issues/2813 |
| RD28-19 | TM Firefox container force-enable | https://github.com/Tampermonkey/tampermonkey/issues/2792 |
| RD28-20 | Same-document View Transitions Baseline | https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available |

## Research-Driven Additions (2026-07-09 research pass)

_Net-new from the 2026-07-09 pass. Deduped against ROADMAP.md, Roadmap_Blocked.md, RESEARCH.md, README v3.18.0, and existing RD28 sources._

### P1

### P3

### Appendix: Research-Driven Sources (2026-07-09)

| ID | Source | URL |
|---|---|---|
| RD29-01 | ScriptVault support matrix generator | `scripts/generate-browser-support-matrix.mjs` |
| RD29-02 | ScriptVault trust receipts | `src/background/trust-receipt.ts` |
| RD29-03 | ScriptVault local workspace flow | `tests/e2e/local-workspace.spec.js` |
| RD29-04 | Violentmonkey open issue list | https://github.com/violentmonkey/violentmonkey/issues |
| RD29-05 | Violentmonkey publish handoff issue | https://github.com/violentmonkey/violentmonkey/issues/2425 |
| RD29-06 | awesome-userscripts catalog list | https://github.com/awesome-scripts/awesome-userscripts |
| RD29-07 | Greasy Fork multi-catalog search script | https://greasyfork.org/en/scripts/9630-greasy-fork-search-scripts-on-other-sites-added-more-sites |
| RD29-08 | Violentmonkey external editor/local tracking | https://violentmonkey.github.io/posts/how-to-edit-scripts-with-your-favorite-editor/ |
| RD29-09 | Violentmonkey metadata block | https://violentmonkey.github.io/api/metadata-block/ |
| RD29-10 | Tampermonkey 5.5 changelog | https://www.tampermonkey.net/changelog.php |
| RD29-11 | Tampermonkey MCP server | https://github.com/Tampermonkey/tampermonkey-mcp |
| RD29-12 | ScriptCat repository | https://github.com/scriptscat/scriptcat |
| RD29-13 | ScriptCat docs | https://docs.scriptcat.org/en/ |
| RD29-14 | WXT cross-browser support | https://wxt.dev/ |
| RD29-15 | Extension.js MV3 framework | https://extension.js.org/ |
| RD29-16 | Plasmo extension framework | https://www.plasmo.com/ |
| RD29-17 | MDN cross-browser extension guide | https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Build_a_cross_browser_extension |
| RD29-18 | Firefox 153 WebExtension release notes | https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/153 |
| RD29-19 | Chrome userScripts API | https://developer.chrome.com/docs/extensions/reference/api/userScripts |
| RD29-20 | Mozilla web-ext | https://github.com/mozilla/web-ext |
| RD29-21 | CSA MCP security best practices | https://labs.cloudsecurityalliance.org/agentic/agentic-mcp-security-best-practices-v1/ |
| RD29-22 | MCP Inspector RCE CVE-2025-49596 | https://www.oligo.security/blog/critical-rce-vulnerability-in-anthropic-mcp-inspector-cve-2025-49596 |
| RD29-23 | Vitest 4.1 browser trace view | https://vitest.dev/blog/vitest-4-1.html |
| RD29-24 | File System Observer API | https://developer.chrome.com/blog/file-system-observer |
| RD29-25 | Monaco editor changelog | https://github.com/microsoft/monaco-editor/blob/main/CHANGELOG.md |

## Research-Driven Additions

### P1

### P3

## Research-Driven Additions (2026-07-16)

_Net-new from the 2026-07-16 pass (baseline v3.20.0). The prior RESEARCH.md's 10
opportunities all shipped (telemetry auth, vendor-import quarantine, URL
minimization, typed dispatch, source maps, WCAG 2.2 gate, locale/plural catalogs,
fail-closed smokes, unified release preflight, TS7). A competitive sweep confirmed
the 2026-H2 GM-API deltas competitors added — `GM_audio`, request-scoped cookie
partitioning + `anonymous` downloads, `@unwrap`, Navigation-API `onurlchange`,
`CAT_userConfig`, on-disk auto-reload (`FileSystemObserver`) — are ALREADY shipped
(verified in `wrapper-builder.ts`/`parser`/`core.ts`/`dashboard.js`), so they are
not re-added. SBOM (`check-cra-sbom.mjs`) already exists — not re-added. Items
below are verified against source and deduped against ROADMAP.md, Roadmap_Blocked.md,
CLAUDE.md audit history, and RESEARCH.md rejected ideas._

## Under Consideration (2026-07-16)

- **ScriptCat niche directives** — `CAT_fileStorage` (per-script file storage), `@storageName` (shared cross-script namespace), `@definition` (`.d.ts` editor hints), `@early-start`. Verified absent; low demand and marginal over Chrome's existing `document_start` + shipped `lib/scriptvault.d.ts`. Reconsider on user signal. Source: docs.scriptcat.org/docs/dev/meta.
- **On-device "explain this script" via Chrome Prompt API (Chrome 148 stable)** — could summarize what an installed/updating script does using the on-device model, strictly opt-in and local. Philosophy tension with any data flow; gate behind explicit per-use consent. Source: https://developer.chrome.com/docs/ai/prompt-api

## Research-Driven Additions (2026-07-22)

_Net-new from the 2026-07-22 research pass (baseline v3.22.0). Verified against
source and deduped against ROADMAP.md, Roadmap_Blocked.md, and the shipped
v3.21.0/v3.22.0 work. The prior RESEARCH.md top-10 (persistent UserCSS, esbuild
CVE bump, SECURITY.md, permission-drift gate, npm-worm hardening, template-token
sanitization, backup gzip, update-body AST re-scan) all SHIPPED — not re-added.
Firefox 153 shipped 2026-07-21, unblocking four items previously parked in
Roadmap_Blocked.md; those are re-surfaced here as actionable (P2 FF153 cluster)._

### P2

### P3

### Delta — focused re-pass (2026-07-22)

_Additional verified findings from a same-day analyzer/storage/scope re-pass. Not duplicates of the items above._

## Audit Findings — 2026-08-02

_Verified-by-observation audit pass against v3.23.1. Baseline before this pass:
`npm run check` green (227 files / 2434 tests), `npm run smoke:firefox` green,
`npm run smoke:dashboard` and `npm run smoke:editor` green, working tree clean —
no pre-existing failures. Live verification used Firefox Developer Edition
154.0b1 via geckodriver 0.37.1 and headless Chromium via the repo's
puppeteer-core. Audit-only: no source file was modified._

### Unaudited — needs a pass

_Scope not covered by the 2026-08-02 pass. Not findings; each needs its own audit._

- [ ] P3 — Unaudited: cloud sync providers end to end against live services
  Category: testing
  Where: `modules/sync-providers.js`, `src/modules/sync-providers.ts`, `modules/cloud-sync.js`
  Problem: The 2026-08-02 pass verified only the WebDAV path that `smoke:firefox` exercises against a local stub server. Google Drive, Dropbox, OneDrive, Easy Cloud, and S3 were not exercised against real endpoints, so OAuth refresh, quota, and conflict behavior on those providers is unverified by this pass.
  Evidence: The Firefox smoke's `webdav` scenario is the only provider with live coverage in the harness output.
  Fix: Audit each provider's token refresh, error mapping, and 3-way merge against a real or high-fidelity fake endpoint.
  Acceptance: Each provider has an observed pass/fail record rather than an inference from shared code.
  Confidence: Needs-repro
  Effort: L

- [ ] P3 — Unaudited: Monaco editor interaction surface and the DevTools panel in a real DevTools host
  Category: testing
  Where: `pages/editor-sandbox.html`, `pages/monaco-adapter.js`, `pages/devtools-panel.js`
  Problem: `smoke:editor` was run and passes (overlay geometry, 14 controls hit-tested, close works), but editor behaviors beyond that harness — find/replace history, undo across tab switches, Vim mode, large-file handling — were not exercised. The DevTools panel was loaded as a bare page, where `chrome.devtools.inspectedWindow` is absent; its real behavior inside an attached DevTools host is unverified.
  Evidence: The panel rendered its empty state correctly as a standalone page, which does not exercise the inspected-window code paths.
  Fix: Drive the editor through its documented interactions, and load the DevTools panel through an actual DevTools session.
  Acceptance: Both surfaces have observed coverage of their primary interactions.
  Confidence: Needs-repro
  Effort: M

- [ ] P3 — Unaudited: install/update flow driven from a real `.user.js` navigation
  Category: testing
  Where: `pages/install.js`, install interception in `src/background/core.ts`
  Problem: The install page was audited only in its no-pending-install error state, which is handled well ("No userscript was found ... Download the userscript again from its source page"). The populated review flow — permission rendering, downgrade detection, `@require` probing, trust-card provenance — was not exercised in this pass.
  Evidence: Loading `pages/install.html` directly yields the empty state by design.
  Fix: Drive a real `.user.js` navigation through interception into the review UI and audit the populated states, including a malformed and an oversized script.
  Acceptance: The populated install review has observed coverage across valid, malformed, and downgrade cases.
  Confidence: Needs-repro
  Effort: M

## Research-Driven Additions

### P0

### P1

### P2

### P3

## Audit Findings — 2026-08-06

_Deep multi-pass audit against v3.23.1. Baseline: after `npm ci`, `npm run check` is green (227 files / 2434 tests, `tsc` clean, all gates pass) — no pre-existing failures (an earlier red run was only an empty `node_modules`). `npm audit --omit=optional --audit-level=high` reports 16 vulns (10 high, 4 critical) — see the still-open P0 "Restore the blocking high-severity dependency-audit gate" above; not re-logged. Findings were traced against the SHIPPED source of truth: `src/background/core.ts` (inline, generated into `background.core.js`) and the promoted `src/modules/*.ts` / `src/background/gm-*.ts` handlers. Several `src/background/*.ts` files (`wrapper-builder.ts`, `import-export.ts`, `update-checker.ts`, `install-handler.ts`, `trust-receipt.ts`, `parser.ts`) are UNSHIPPED mirrors — mirror-only issues were dropped or folded into the mirror-drift item (last P3 below)._

### P2

### P3

- [ ] P3 — Drifted UNSHIPPED mirror modules are pinned by the test suite as if they were the product
  Category: maintainability
  Where: `src/background/wrapper-builder.ts`, `import-export.ts`, `update-checker.ts`, `install-handler.ts`, `trust-receipt.ts`, `parser.ts` (none in `ts-source-promotion.json`; live copies are inline in `core.ts`); tests `tests/gm-websocket.test.js`, `wrapper-gm-tabs-39-13.test.js`, `wrapper-dom-security.test.js`, `pending-update-queue.test.js`, `pending-install-isolation.test.js`, `trust-receipt*.test.js`, `versions.test.js` and others import the mirrors
  Problem: These files are re-exported only by the unused `src/background/index.ts` barrel and are not built. They have measurably drifted from the live `core.ts`: mirror `wrapper-builder.ts` lacks `GM_getTab/saveTab/getTabs` grant checks (live core.ts has them), defaults `GM_getResourceURL` to a never-revoked blob URL (live uses the data-URI leak fix), is missing standalone `GM_updateNotification`/`GM_closeNotification` + `buttons[]`/`onbuttonclick` + the highlight-path `_notifCallbacks` cleanup, and `meta.grant.length` throws where core uses `meta.grant || ['none']`; mirror `import-export.ts` lacks versionHistory snapshot, import receipts, per-script settings preservation, and resets `createdAt` on overwrite; mirror `update-checker.ts` lacks the backoff engine, the pending-updates byte cap, and the provenance-failure gate (but has the `userModified` skip the runtime lost). Tests importing these prove nothing about shipped behavior (the "check wired to the wrong data source" failure mode) and mislead anyone who "fixes" a bug in the mirror. `GM_webSocket` is concrete: implemented in the mirror wrapper and covered by `tests/gm-websocket.test.js`, but the shipped injected wrapper exposes no `window.GM_webSocket`/`GM.webSocket` (`grep "window.GM_webSocket" background.js` → 0), so a `@grant GM_webSocket` script gets a `ReferenceError`.
  Evidence: Verified — `ts-source-promotion.json` has no entries for these files; live-vs-mirror drift confirmed feature-by-feature (consolidates three passes' observations); `grep "window.GM_webSocket" background.js` → 0.
  Fix: For each mirror either (a) promote it — extract the live logic from `core.ts` into the module, add it to `ts-source-promotion.json` + the drift gate — or (b) delete it and repoint its tests at the generated `background.core.js` extraction. At minimum add a drift assertion between each mirror and its inline `core.ts` copy so divergence fails CI. Separately decide whether `GM_webSocket` is a shipped feature; if so expose the client in the live wrapper, else drop the mirror + test.
  Acceptance: No test imports a non-promoted `src/background/*.ts` mirror without a drift assertion against the shipped copy; `GM_webSocket` either works in a live browser or is removed from docs/tests.
  Confidence: Verified
  Effort: L

- [ ] P3 — Doc rot: CLAUDE.md lists dashboard modules that do not exist
  Category: docs
  Where: repo `CLAUDE.md` "Dashboard Modules (26 files)" lists `dashboard-i18n-v2.js` and `dashboard-recommendations.js`
  Problem: Neither file exists in `pages/` and nothing references `I18nV2`; future maintainers/agents hunt for phantom files.
  Evidence: Verified — `ls` fails for both; grep for references returns nothing.
  Fix: Remove the two entries and re-count the module list. (CLAUDE.md is AI working notes, not user-facing; safe to edit.)
  Acceptance: The module inventory lists only files that exist.
  Confidence: Verified
  Effort: S
  _2026-08-06 research pass — same item, wider scope than first recorded._ The
  same file also states version v3.19.2 (actual 3.24.0), Monaco 0.55.1 (actual
  0.56.0), vendored `acorn 8.14.1` and `diff 7.0.0` — both wrong: `lib/acorn.min.js`
  is 8.17.0 and `lib/diff.min.js` is 9.0.0, correctly recorded in
  `docs/amo-vendored-libraries.md`. Fold these into the same sweep; the vendored
  ones matter most because a stale note invites a needless "upgrade the vendored
  library" task that is already done.

### Unaudited — needs a pass

- [ ] P3 — Unaudited: live-browser drive of the populated install review, editor interactions, and DevTools panel in a real host
  Category: testing
  Where: `pages/install.js` (populated states), `pages/monaco-adapter.js`/`pages/editor-sandbox.html`, `pages/devtools-panel.js`
  Problem: This pass was static/trace + Node-timing based; the populated install review (valid/malformed/oversized/downgrade), editor find/replace/undo-across-tabs/large-file behavior, and the DevTools panel inside an attached DevTools session were not driven live. (Overlaps the prior 2026-08-02 "Unaudited" items; still open.)
  Evidence: No live-drive harness was run in this pass.
  Fix: Drive a real `.user.js` navigation into the review UI and load the DevTools panel through an attached session; drive the editor's documented interactions.
  Acceptance: Observed coverage of the populated install/editor/devtools interactions.
  Confidence: Needs-repro
  Effort: M

- [ ] P3 — Unaudited: cloud providers against live endpoints, and Stylus import
  Category: testing
  Where: `src/modules/sync-providers.ts` (Google Drive/Dropbox/OneDrive/S3 live OAuth+quota+429 bodies), `src/modules/sync-easycloud.ts`, `_convertStylusStyle`/`importStylusBackup` in `src/modules/userstyles.ts`
  Problem: Provider findings above were traced statically; real OAuth consent, token refresh, quota, and 429/403 bodies were not exercised against live services. Stylus import conversion was not audited.
  Evidence: No live endpoint or Stylus-import fixture was run in this pass.
  Fix: Audit each provider against a real/high-fidelity fake endpoint; add Stylus-import conversion fixtures.
  Acceptance: Each provider and the Stylus import path has an observed pass/fail record.
  Confidence: Needs-repro
  Effort: L

## Research-Driven Additions (2026-08-06 research pass)

_Net-new from the 2026-08-06 external research pass (baseline v3.24.0, commit
`13e63d6`). Deduped against every existing section of this file and against
`Roadmap_Blocked.md`. The prior pass's P0 (blocking high-severity dependency
audit) shipped in `68d2001` and `npm audit --omit=optional --audit-level=high`
is now clean — not re-added. The prior pass's freshness, watcher-fallback,
RTL-ratchet and version-derived-reference items remain open above and are not
duplicated. Conclusions and sources: `RESEARCH.md` (2026-08-06)._ 

### P3

- [ ] P3 — Use runtime.getDocumentId() on Firefox to key per-document injection state
  Why: The open UserCSS SPA and injection-dedup items key state per tab, which cannot distinguish a reloaded document from a live one; Firefox 153 introduced a stable per-document identifier that makes that distinction directly.
  Evidence: https://blog.mozilla.org/addons/2026/07/23/firefox-153-webextensions-api-updates/ ("Firefox 153 introduces documentId, a stable identifier for a document instance, including a new runtime.getDocumentId() method"); relates to the open items "Persistent UserCSS can orphan an injected stylesheet on an SPA route change" and "SPA navigation events are dropped, not coalesced" above — this is an enabling mechanism for those, not a replacement.
  Touches: src/modules/userstyles.ts, src/background/core.ts (onTabNavigated/onTabUpdated/rehydrateOpenTabs), generated modules/userstyles.js, tests/userstyle-injection.test.js, scripts/smoke-firefox-sideload.mjs.
  Acceptance: where available, per-document injection state is keyed by documentId rather than tab id, with the tab-id path retained for Chrome; a reload no longer reuses the previous document's registry entry; the Firefox smoke harness proves a reloaded SPA page re-injects exactly once.
  Complexity: M

- [ ] P3 — Review the Find Scripts surface against the 2026-08-01 Chrome Web Store prohibited-products update
  Why: CWS added a Malicious and Prohibited Products clause on 2026-08-01 banning circumvention of AI service safety guardrails and usage restrictions; ScriptVault's discovery panel installs arbitrary third-party scripts from Greasy Fork and OpenUserJS, and neither the listing copy nor the in-product risk copy acknowledges that class.
  Evidence: https://developer.chrome.com/blog/cws-policy-updates-2026 (Limited Use, Disclosure Requirements and the prohibited-products clause all effective 2026-08-01); pages/dashboard.js Find Scripts sources hardcode https://api.greasyfork.org/en/scripts.json and https://openuserjs.org/api/script/list; scripts/check-permission-copy.mjs and docs/store-listing-copy.md cover permissions and privacy but not prohibited-content classes; the @antifeature surface already exists as the disclosure mechanism (https://greasyfork.org/en/help/antifeatures).
  Touches: docs/store-listing-copy.md, PRIVACY.md, scripts/check-permission-copy.mjs, pages/dashboard.js Find Scripts copy, pages/install.js review copy, docs/cws-remote-code-compliance.md.
  Acceptance: the listing and in-product copy state that discovery surfaces third-party code the project does not author or endorse and that installation is the user's decision; the compliance doc records the 2026-08-01 clauses and how each is met; the store-copy gate covers the new clauses so a future policy change fails the check instead of passing silently.
  Complexity: S

- [ ] P3 — Refresh dev dependencies and adopt the test-tooling features already paid for
  Why: Several dev dependencies are behind current releases and the newer versions ship capabilities that would directly improve this repo's existing harnesses; none of these are security-driven, so they belong behind the P0 audit work.
  Evidence: current vs latest as of 2026-08-06 — @playwright/test 1.61.1 vs 1.62.1 (2026-07-30), jsdom 29.1.1 vs 30.0.1 (2026-07-29, requires Node >=24.15 which the repo's >=24.16.0 satisfies), puppeteer-core 25.2.1 vs 25.5.0, acorn 8.17.0 vs 8.18.0, chrome-types 0.1.431 vs 0.1.436; Playwright 1.61 added page.localStorage/page.sessionStorage, 1.62 added retryStrategy 'isolated' and WebP screenshots; Vitest 4 ships Playwright trace integration usable from the existing browser-mode config; acorn 8.17's strict option and using/await-using fixes matter for the AST analyzer, whose vendored copy is already 8.17.0.
  Touches: package.json, package-lock.json, playwright.config.mjs, vitest.visual.config.mjs, tests/e2e/helpers/, scripts/check-cve-floors.mjs, docs/audit/cycle-22-dependency-freshness-*.md, docs/amo-vendored-libraries.md if acorn is re-vendored.
  Acceptance: dependencies are bumped with the full gate suite green; the extension-state assertions that currently go through page.evaluate() use the WebStorage API where it is clearer; failing browser-mode tests emit a Playwright trace; retryStrategy 'isolated' is applied to the extension-load E2E specs that have historically flaked; if acorn is re-vendored, docs/amo-vendored-libraries.md hashes are regenerated in the same change.
  Complexity: S

## Research-Driven Additions (2026-08-08 research pass)

Evidence and rationale: `RESEARCH.md` (2026-08-08). New work only — anything the
2026-08-06 pass already tracks is cross-referenced in place rather than repeated.

### P0

### P1

### P2

- [ ] P2 — Unblock GM value bidirectional sync with HLC per-key last-write-wins and preserved losers
  Why: `Roadmap_Blocked.md` blocks L-8 on a merge-conflict UX decision that has now been researched and does not need a modal at all; the sanitisation infrastructure is built, `providerWritesEnabled` is false, and the feature currently has zero user-visible effect.
  Evidence: `docs/gm-value-sync-data-model.md` is 52 KB and contains no conflict-resolution decision — every conflict path is advisory (`conflictBlocked` counts at lines 78, 123, 194, 296) and `wouldApplyValues` is false. Precedent: CouchDB/PouchDB never blocks the write, picks a deterministic winner and retains every loser under `_conflicts` for the app to resolve later (https://pouchdb.com/guides/conflicts.html); Automerge chooses the winner by operation id rather than wall clock and exposes losers via `getConflicts()` (https://automerge.org/docs/reference/documents/conflicts/), which matters because clock skew across six sync providers is certain; Obsidian Sync has never shipped a manual resolver despite a decade of requests and instead writes conflicts as inspectable artifacts (https://deepwiki.com/obsidianmd/obsidian-help/2.3-synchronization-and-conflict-resolution). Yjs `Y.Map` is ruled out on record — unpredictable winner, earlier writes can overwrite later ones, and unbounded historical key retention (https://github.com/rozek/y-lwwmap). A passive badge also satisfies this project's standing no-confirmation-dialogs rule.
  Touches: src/background/cloud-sync.ts, src/modules/sync-easycloud.ts, src/background/core.ts value store, src/config/settings-defaults.json (`providerWritesEnabled`, `wouldApplyValues`, a per-device policy setting), docs/gm-value-sync-data-model.md, pages/dashboard.js script row badge, tests/gm-value-sync.test.js, Roadmap_Blocked.md (remove L-8).
  Acceptance: each value carries a hybrid logical clock `{ts, counter, deviceId}` and the winner is max-HLC with a deterministic `deviceId` tiebreak, never wall-clock comparison; losing values are retained per `(scriptId, key)` under a capped, TTL'd sidecar; `providerWritesEnabled` defaults on with no new modal and no blocking prompt; the script row shows a passive conflict count that opens the existing review surface; a per-device policy (`hlc` default, `prefer-local`, `prefer-remote`) exists; a test simulates two devices with skewed clocks and asserts the later logical write wins regardless of wall-clock order.
  Complexity: L

- [ ] P2 — Build a real-world userscript compatibility corpus and gate on it
  Why: The suite has twenty GM handler unit-test files and no fixture from a script that anyone actually runs, which is precisely the gap that let Violentmonkey ship an MV3 build that microfroze the browser on a popular script.
  Evidence: `ls tests/` shows `gm-*.test.js` x20 covering handlers in isolation and no real-script fixtures (`tests/userstyle-compat-fixtures.test.js` is the only fixture-shaped file and it is UserCSS). https://github.com/violentmonkey/violentmonkey/issues/2608 was reproduced with Image Max Url and was absent under MV2; https://github.com/violentmonkey/violentmonkey/issues/2538 (31 comments) is "v2.40.0 broke this very old script". Available corpus material: Greasemonkey's own `@run-at` conformance scripts (https://github.com/greasemonkey/greasemonkey), and heavy real-world GM API users https://github.com/hoothin/UserScripts (Pagetual, Picviewer CE+), https://github.com/XIU2/UserScript, https://github.com/redphx/better-xcloud, https://github.com/prinsss/twitter-web-exporter. `vite-plugin-monkey` v8.1.0 added dev-time Web Worker support (https://github.com/lisonge/vite-plugin-monkey/releases), so authored scripts now spawn Workers and the USER_SCRIPT world must keep that working.
  Cross-reference: complements the open item "Prove document-start actually wins the race in a real browser" (2026-08-06 pass) — that one proves injection *timing* with a synthetic page; this one proves the *GM API surface* against scripts real users run. Sharing one browser harness between them is worth doing.
  Touches: tests/fixtures/ new directory, tests/ new corpus suite, tests/e2e/ new spec, scripts/smoke-large-library.mjs or a new harness, docs/ a note recording each fixture's provenance and licence.
  Acceptance: a pinned set of real userscripts installs, registers and executes in a real browser with their GM API calls recorded; a Worker-spawning script from the vite-plugin-monkey v8 shape is included; each fixture is vendored with its source URL, commit and licence recorded; the gate fails on a GM surface regression rather than on unrelated site changes, which means the fixtures must not perform live network calls to their target sites.
  Complexity: M

### P3

- [ ] P3 — Expose a cross-tab lock to userscripts
  Why: Scripts that coordinate across tabs have no primitive for it and reimplement broken ad-hoc locking, while the extension already serialises its own writes internally.
  Evidence: `grep -rn "navigator.locks" src/` returns nothing; the internal equivalent is `_runExclusiveScriptOperation` in `src/background/core.ts`, which is not reachable from a userscript. Demand: https://github.com/violentmonkey/violentmonkey/issues/1799 (Mutex API) and https://stackoverflow.com/questions/79736631/ asking how to get atomicity at all. Web Locks has been widely available since 2024-09-14, so this is a thin wrapper rather than an implementation.
  Touches: src/background/wrapper-builder.ts and the live `buildWrappedScript` in src/background/core.ts, src/background/gm-values-handler.ts if value writes participate, scripts/generate-gm-types.mjs, lib/scriptvault.d.ts, README GM API table, tests/ new coverage. Note the standing hazard: no backticks and no `${` in comments inside `buildWrappedScript`.
  Acceptance: `GM.withLock(name, fn)` serialises across tabs for the same script, scopes the lock name per script so two scripts cannot collide, releases on throw, supports an abort signal, and is gated behind an explicit `@grant`; `npm run gm-types:check` and `node --check background.core.js` both pass.
  Complexity: S

- [ ] P3 — Warn on unrecognised metadata keys in the editor
  Why: Authors ship metadata typos that silently do nothing, and the editor already lints metadata without checking whether a key is a key at all.
  Evidence: `pages/dashboard-linter.js` has no unknown-key or unrecognised-tag diagnostic (`grep -n "unknown\|unrecognized"` returns nothing). ScriptCat shipped this in https://github.com/scriptscat/scriptcat/pull/1608. `eslint-plugin-userscripts` already encodes the rule set worth reusing — `no-invalid-metadata`, `better-use-match`, and a `userscriptVersions` setting keyed to per-manager feature levels (https://github.com/Yash-Singh1/eslint-plugin-userscripts) — so the vocabulary does not need to be invented.
  Touches: pages/dashboard-linter.js, src/editor/userscript-lsp-worker.ts, pages/editor-sandbox.html, src/locales/en.json, tests/ linter coverage.
  Acceptance: an unrecognised `@key` produces a warning naming the nearest known key; keys this product supports but competitors do not are recognised rather than flagged; localized variants (`@name:ja`) are recognised as the base key; a suppression exists for deliberate custom keys so the warning does not become noise.
  Complexity: S

- [ ] P3 — Make the locale gate measure coverage against English, and use localized script metadata
  Why: Eight of nine locales translate under 4% of the runtime strings, and the gate ratchets each locale against its own current count, so it certifies "no regression" while reading as coverage — the same shape as the other gate defects in this pass.
  Evidence: `src/locales/en.json` carries 1,914 runtime keys against ru 117 (6.1%), ja 71, he 58, zh 46, es 45, de 43, fr 43, pt 42 (2.2%); each file's `runtimeCoverageBaseline` equals its current count, which is what `scripts/check-locales.mjs` compares against. Separately, `@name:xx` / `@description:xx` localized metadata is already parsed (`src/background/core.ts:1111`, `src/background/parser.ts:420`) but the script list never uses it — the same unmet ask as https://github.com/openstyles/stylus/issues/377.
  Touches: scripts/check-locales.mjs, docs/locale-coverage.md, src/locales/*.json, pages/dashboard.js script list rendering, pages/popup.js, README internationalization section.
  Acceptance: the gate reports each locale's coverage as a percentage of the English key set and the docs publish it, so the number is visible rather than implied; the ratchet still prevents regressions; the script list and popup prefer `@name:<uiLocale>` / `@description:<uiLocale>` when present, falling back to the base key.
  Complexity: S

- [ ] P3 — Import competitor settings and per-script configuration, not only scripts
  Why: A migrant currently arrives with their scripts and none of their per-script state, which is the part that took years to accumulate and the reason people stay on the incumbent.
  Evidence: the importers cover Tampermonkey `.txt`, Violentmonkey JSON/ZIP, Greasemonkey GM4 and ScriptCat, but `src/background/import-export.ts` and the inline `importScripts` at `src/background/core.ts:5618` restore script records rather than manager settings or per-script user config. ScriptCat shipped exactly this in https://github.com/scriptscat/scriptcat/pull/1554 (backup/restore imports ScriptCat, Tampermonkey and Violentmonkey custom config and settings and repairs resources).
  Touches: src/background/import-export.ts, src/background/core.ts import path, src/modules/script-config.ts, src/modules/migration.ts, pages/dashboard.js import UI, tests/runtime-import-export.test.js, tests/import-snapshot.test.js.
  Acceptance: an import maps competitor per-script settings — enabled state, run-at override, user-supplied `@var` / GM_config values, custom includes and excludes — onto ScriptVault equivalents, reports anything it could not map rather than dropping it silently, and continues to run every imported script through the existing quarantine and review path; prototype-polluting keys in imported config are rejected as they already are on the install path.
  Complexity: M

- [ ] P3 — Unbreak `npm audit signatures` and refresh the developer security pin
  Why: The audit-signature command cannot execute under the repository's release-age policy, and the checked-in Node pin predates the July 2026 security fixes; both controls currently read as passing without proving the intended release boundary.
  Evidence: `npm audit signatures` fails with `ETARGET — No matching version found for web-ext@10.6.0 with a date before 8/1/2026` because it re-resolves from the registry and `.npmrc`'s `min-release-age=7` rejects the lockfile's own installed versions; `--min-release-age=0` succeeds (473 registry signatures, 93 attestations). Separately `.nvmrc` and `.node-version` pin 24.16.0, which predates Node 24.17.0 and 24.18.1 (11 CVEs, 3 High — https://nodejs.org/en/blog/vulnerability/july-2026-security-releases), though see the P0 AMO item first: raising `engines` makes the reviewer-image conflict worse, so pin the developer toolchain rather than the compatibility range. The DOMPurify and Vitest floor metadata is now aligned with its current advisories in `scripts/check-cve-floors.mjs`.
  Cross-reference: the open item "Refresh dev dependencies and adopt the test-tooling features already paid for" (2026-08-06 pass) covers bumping dev-dependency *versions*; this item is only about the floor values and the two controls being inert. Do not fold them together — this one is security-relevant and that one explicitly is not.
  Touches: scripts/release-trust-gate.mjs, .nvmrc, .node-version, scripts/check-toolchain-contract.mjs, docs/dependency-audit-policy.md.
  Acceptance: `npm audit signatures --min-release-age=0` runs inside `release:trust` and its failure fails the gate; the developer Node pin is a version carrying the July 2026 security fixes while `engines` stays compatible with the AMO reviewer image; the unfixable `image-size` advisories (GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq — no patched version exists, reachable only from `firefox:lint` parsing this project's own icons) are recorded as a documented exception so `npm audit` is not permanently red.
  Complexity: S

- [ ] P3 — State in the enterprise documentation that no policy can enable user scripts
  Why: An administrator following the current provisioning doc will force-install ScriptVault, watch it do nothing on every machine, and have no way to discover why — and this is the single hardest friction point in the deployment story.
  Evidence: `docs/enterprise-policy-provisioning.md` documents `managedScripts` and managed-storage access levels and never mentions the per-extension "Allow user scripts" toggle. Verified against Chromium `main`: the complete extension policy set contains no `UserScripts` policy, and `ExtensionSettings`' per-extension keys are `installation_mode`, `update_url`, `override_update_url`, `blocked_permissions`, `allowed_permissions`, `minimum_version_required`, `runtime_blocked_hosts`, `runtime_allowed_hosts`, `blocked_install_message`, `toolbar_pin`, `file_url_navigation_allowed` — admins can only *block* `userScripts`, never grant it.
  Touches: docs/enterprise-policy-provisioning.md, README enterprise section, docs/store-listing-copy.md if it implies otherwise.
  Acceptance: the doc carries a recipe using `ExtensionInstallForcelist` plus `ExtensionUnpublishedAvailability` (insurance against a listing takedown) and states explicitly that each user must flip "Allow user scripts" once per profile, with the `chrome://extensions/?id=<id>` path and what the extension shows until they do; the claim is dated so a future policy change is visibly re-checkable.
  Complexity: S

- [ ] P3 — Replace remaining browser-version gates with feature detection
  Why: Chrome moves to a two-week release cycle at M153, which halves the calendar span of any "last N milestones" assumption and makes version arithmetic decay faster than it can be maintained.
  Evidence: https://developer.chrome.com/blog/chrome-two-week-release — M153 ships 2026-09-08 and milestone gaps collapse from 28 to 14 days, ~26 stable versions per year. The repo already feature-detects in the right places (`chrome.userScripts.getScripts` probe at `src/background/core.ts:11869`, `execute()` availability branches), but `_getChromeVersion()` also drives capability decisions and `minimum_chrome_version: 130` anchors a support window whose meaning has changed.
  Touches: src/background/core.ts (`_getChromeVersion` call sites), src/modules/user-scripts-setup.ts, pages/dashboard-firefox-compat.js, manifest.json, docs/cross-browser-pipeline.md, README browser support matrix, scripts/generate-browser-support-matrix.mjs.
  Acceptance: every capability decision branches on the presence of the API rather than a version number, with version numbers retained only for user-facing setup guidance where the browser genuinely differs; the support matrix documents the two-week cadence and states the support window in milestones with its calendar equivalent; a test asserts no capability branch compares `_getChromeVersion()` against a literal.
  Complexity: S

- [ ] P3 — List ScriptVault in the ecosystem's directories
  Why: Distribution is the weakest axis in the whole project and the largest curated index in this space does not know the product exists.
  Evidence: https://github.com/awesome-scripts/awesome-userscripts (3,449 stars, last updated 2026-08-03) lists Tampermonkey, Violentmonkey, ScriptCat, OrangeMonkey and Stay under "Userscript Managers" and omits ScriptVault — along with Userscripts-for-Safari, Greasemonkey and FireMonkey, so the section is stale and a correcting PR is welcome rather than self-promotional. Greasy Fork maintains recommendation lists that took additions in 2026 (https://github.com/greasyfork-org/greasyfork/pull/1550, https://github.com/greasyfork-org/greasyfork/pull/1540).
  Touches: no repository files — this is an outbound PR plus a note in the release runbook so it is re-checked when the listing state changes.
  Acceptance: a PR is open against awesome-userscripts adding ScriptVault with an accurate one-line description and the four missing managers; the release runbook records where the product is indexed so the list does not go stale again.
  Complexity: S

- [ ] P2 — Serialize pending-update queue mutations
  Category: reliability
  Where: `src/background/core.ts:2275-2306,2531-2643`; callers `src/background/core.ts:2739,4652-4675`; `pages/dashboard.js:3861-3874`; `pages/popup.js:1861-1865`
  Problem: Pending updates, subscription installs/removals, and clear operations read and rewrite one whole-array snapshot without a mutation mutex or transaction. Manual actions, alarms, auto-checks, and subscription refreshes can overlap; the last write drops entries added or removed by another caller.
  Evidence: `_loadPendingUpdates` has no in-flight promise/lock, and each queue/clear method computes a new array then calls `_savePendingUpdates`. The listed callers run from independent UI and scheduled paths in the same service worker.
  Fix: Use a promise-chain mutation queue or keyed transactional store for every pending-update operation. Re-read inside the serialized section, apply the operation, enforce the existing byte/count bounds, and publish one committed snapshot.
  Acceptance: A delayed storage test overlaps manual queueing, automatic queueing, subscription install/removal, and clear; the resulting queue contains exactly the operations whose serialized order dictates, with no lost entry and no resurrection after clear.
  Confidence: Likely
  Effort: M

- [ ] P2 — Serialize subscription record mutations
  Category: reliability
  Where: `src/modules/subscriptions.ts:304-318,377-478`; callers `src/background/core.ts:4575-4807,10304-10306`
  Problem: `upsertFromFeed`, `upsertBundle`, `remove`, and `markRefreshResult` each read the complete subscription array and write it back without a shared lock. Manual add/remove/refresh can overlap the alarm refresh sweep, causing one subscription or its validator/error state to disappear.
  Evidence: `readAll()`/`writeAll()` wrap a whole-array storage key, and every mutation follows read-modify-write independently. The background exposes both manual message handlers and a scheduled alarm caller; existing subscription tests are sequential and do not exercise overlap.
  Fix: Make subscription mutations use a single serialized queue or keyed IDB transaction, re-read within the critical section, and preserve validator metadata and refresh error counters when another mutation commits.
  Acceptance: A delayed-storage concurrency test overlaps add, remove, feed upsert, bundle upsert, and refresh-result updates; unrelated records and the winning record's validator/error fields all survive with one deterministic final state.
  Confidence: Likely
  Effort: M

- [ ] P2 — Await dashboard view transitions before applying deep-link focus
  Category: a11y
  Where: `pages/dashboard.js:1155-1179,1273-1292,16575-16592,20134-20173`; `scripts/smoke-dashboard.mjs:235-287`
  Problem: Rail navigation starts `document.startViewTransition`, immediately clicks the panel filter, and schedules focus without awaiting the transition. The transition can abort with `InvalidStateError`; the target appears visually active but keyboard focus remains on the body, so keyboard users lose their destination and the smoke gate hangs waiting for focus.
  Evidence: Headless `npm run smoke:dashboard` failed at `signingTrustSection`. A direct headless click reproduced `Unhandled rejection: InvalidStateError: Transition was aborted because of invalid state`; after the panel became active, `document.activeElement` was still empty while the shortcut was visible and enabled.
  Fix: Make `runDashboardViewTransition` return/await a settled transition promise, serialize or cancel superseded transitions, and perform filter activation, scroll, and focus after the panel commit. Catch aborted transitions and still complete the focus destination.
  Acceptance: `npm run smoke:dashboard` completes all rail destinations; no unhandled transition rejection occurs; each deep link leaves the requested shortcut focused with the correct `aria-pressed` state in both reduced-motion and normal-motion modes.
  Confidence: Verified
  Effort: M

- [ ] P2 — Persist dashboard telemetry before the lazy Utilities modules load
  Category: correctness
  Where: `pages/dashboard-lazy-loader.js:14-39`; `pages/dashboard.js:2826-2870`
  Problem: ActivityHeatmap and Gamification are loaded only when the Utilities tab is first opened. `publishDashboardTelemetry` silently does nothing while those globals are absent, so script creation/edit/install/update activity performed before a user visits Utilities is permanently missing from the heatmap and gamification surfaces.
  Evidence: A headless dashboard profile created a script before opening Utilities; `window.ActivityHeatmap` was undefined and `chrome.storage.local.get('sv_activity_log')` remained null. Opening Utilities later loaded the module but could not reconstruct the discarded event. The telemetry function has existence checks rather than a persisted queue.
  Fix: Move a minimal activity recorder into the eager dashboard path or queue telemetry events in a bounded persisted buffer until both lazy modules initialize, then drain once with deduplication. Keep the existing rendering modules lazy.
  Acceptance: A fresh profile that creates, edits, installs, and updates scripts without ever opening Utilities shows those events when Utilities is first opened; `sv_activity_log` and gamification counters contain the events and no duplicate appears after reload.
  Confidence: Verified
  Effort: M

- [ ] P2 — Prevent the dependency graph from blocking the main thread quadratically
  Category: perf
  Where: `pages/dashboard-depgraph.js:362-451,520-589`; `pages/dashboard.js:3291-3297`; `scripts/smoke-large-library.mjs:349-350`
  Problem: Relationship analysis compares every script pair and the force-layout repulsion compares every node pair on every animation frame. The graph refresh therefore becomes unusable as a library grows even though edge lookup/rendering is optimized separately.
  Evidence: Headless measurement of `DependencyGraph.refresh` after loading the Utilities graph took about 332 ms for 1,000 scripts and 3.18 s for 3,000 scripts; the repository's large-library smoke fixtures go to 10,000. The nested pair loops remain in both analysis and simulation paths.
  Fix: Index normalized requires/matches/resources by key and generate candidate pairs from shared buckets; use a Barnes-Hut/grid approximation or cap/defer layout work for large graphs, and move bulk analysis off the UI thread where possible. Show a clear large-library summary when full visualization is deferred.
  Acceptance: A 3,000-script fixture refreshes without a multi-second main-thread block, a 10,000-script fixture remains interactive or intentionally switches to a bounded summary, and relationship counts remain equivalent to the current algorithm for a reference fixture.
  Confidence: Verified
  Effort: L

- [ ] P2 — Give dependency-graph nodes a keyboard and screen-reader equivalent
  Category: a11y
  Where: `pages/dashboard-depgraph.js:788-861,1008-1108`
  Problem: The graph is a canvas with mouse-only pan, zoom, and double-click handlers. It has no accessible name, focus target, keyboard interaction, or semantic representation of nodes/edges, so keyboard and screen-reader users cannot select a script, inspect its relationships, or open its editor.
  Evidence: The implementation attaches `mousedown`, `mousemove`, wheel, and `dblclick` listeners only; the canvas has no `role`, `tabindex`, or `aria-label`, and the rendered node/edge data is not exposed as DOM controls. The toolbar buttons do not provide an alternative for selecting individual nodes.
  Fix: Add a labeled, focusable graph region plus an accessible list/table of scripts and relationship summaries, with keyboard selection/open actions and live selection details. Keep the canvas as the visual enhancement and synchronize selection between both representations.
  Acceptance: Keyboard-only navigation can reach every graph item, select it, read its dependency/conflict summary, and open the editor; a screen reader sees the graph name and relationship count; automated accessibility coverage finds no unlabeled interactive surface.
  Confidence: Verified
  Effort: M

- [ ] P2 — Make ActivityHeatmap storage resilient to malformed records
  Category: reliability
  Where: `pages/dashboard-heatmap.js:196-220`
  Problem: Loading one malformed day value (`null`, a primitive, or a non-array `scripts` field) throws while normalizing `Object.entries(parsed)`, and the outer catch replaces the entire history with `{}`. One corrupt storage record therefore erases the visible history instead of isolating the bad day.
  Evidence: `_loadData` catches all parsing/normalization errors after entering the loop and assigns an empty data object; there is no per-entry shape check before `val.scripts` and `val.count` are read. `chrome.storage.local` is a writable trust boundary for older versions, imports, and profile corruption.
  Fix: Validate each day and field independently, skip/quarantine only malformed entries, clamp numeric counts, and preserve valid days. Record a bounded diagnostic or migration marker rather than swallowing the whole dataset.
  Acceptance: A fixture containing valid days plus malformed/null/primitive entries loads all valid days, renders without an exception, and rewrites the stored data in a normalized bounded form.
  Confidence: Verified
  Effort: S

- [ ] P2 — Bound ActivityHeatmap history and per-day script-name growth
  Category: reliability
  Where: `pages/dashboard-heatmap.js:16,196-239,249-263`
  Problem: `_data` retains every date key forever and appends script names without a storage budget, while the UI renders only `WEEKS = 52`. Long-lived profiles can grow `sv_activity_log` indefinitely and eventually hit extension storage quota even though older data is never displayed.
  Evidence: `_saveData` serializes the full object; `_recordActivity` creates date entries and adds script names; no age/count/byte pruning exists, and the only window is the rendering constant. The module is called for dashboard telemetry events, so the growth is user-reachable over time.
  Fix: Keep a documented rolling retention window (for example the displayed 52 weeks plus a small migration margin), cap script names/counts per day, prune before every write, and enforce a UTF-8 byte budget with deterministic oldest-first behavior.
  Acceptance: A fixture containing more than a year of daily activity is pruned to the documented window before persistence, the serialized value stays below the configured budget, and the 52-week view remains unchanged for retained data.
  Confidence: Verified
  Effort: M

- [ ] P2 — Serialize and surface ActivityHeatmap storage failures
  Category: reliability
  Where: `pages/dashboard-heatmap.js:222-263`; `pages/dashboard.js:2849-2852`
  Problem: Every activity event serializes the whole heatmap and fires `chrome.storage.local.set` without awaiting or chaining the promise. Rapid telemetry can complete out of order and overwrite newer counts, while quota/rejection failures become unhandled or invisible to the user.
  Evidence: `_recordActivity` calls `_saveData` for each event; `_saveData` starts a full snapshot write and returns without awaiting it or catching rejection. The dashboard publishes telemetry from multiple mutation paths, so the calls can be back-to-back during imports or bulk updates.
  Fix: Maintain one serialized/latest-snapshot write queue, coalesce bursts, prune before writing, and catch failures. Preserve pending increments in memory and expose a non-blocking “activity history unavailable” state when the byte budget cannot be written.
  Acceptance: A delayed storage mock completing writes out of order preserves every increment, a rejected write does not produce an unhandled rejection or lose the in-memory count, and the UI reports the degraded state with a retry path.
  Confidence: Needs-repro
  Effort: M

- [ ] P2 — Make the editor smoke command fail fast and clean up its browser on timeout (pre-existing baseline)
  Category: testing
  Where: `scripts/smoke-editor.mjs:105-245`; npm script `smoke:editor`
  Problem: The mandated headless editor smoke command did not produce a pass/fail result within the shell's 120-second execution window and left child browser processes requiring targeted cleanup. This makes release verification unable to distinguish a product hang from a harness hang and risks leaking automation processes in CI.
  Evidence: `npm run smoke:editor` was run against the current build with headless Chrome; it timed out after about 124 seconds without a stage result. The script's waits cover dashboard load, What's New dismissal, editor overlay, sandbox frame, Monaco, diagnostics, screenshot, and close, but there is no global deadline/reporting wrapper around the sequence.
  Fix: Add a bounded overall timeout with the current stage and URL in the failure message, ensure `browser.close()`/temporary-profile cleanup runs from a process-level `finally` even on timeout, and make each wait use a consistent diagnostic timeout. Do not hide a product failure; preserve the first failing stage.
  Acceptance: `npm run smoke:editor` always exits with a useful pass/fail result within a documented limit, leaves no matching Chrome/Node children or temporary profile, and reports the exact editor stage when a regression occurs.
  Confidence: Needs-repro
  Effort: M

## Research-Driven Additions (2026-08-10)

### P2

- [ ] P2 — Add a real extension-upgrade registration rehydration gate
  Why: The runtime has version-marker/force-reregister logic, but the existing E2E test proves only service-worker restart; a broken release can therefore pass current coverage while losing enabled user-script registrations during an actual extension update.
  Evidence: `src/background/core.ts:12024-12126,13069+` compares the manifest version and re-registers scripts, while `tests/e2e/service-worker-rehydration.spec.js:70-93` only closes/reopens the worker. Chrome and MDN document that user-script registrations are cleared on extension update and must be restored on an update install path: https://developer.chrome.com/docs/extensions/reference/api/userScripts, https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/userScripts, https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/userScripts/update
  Touches: `tests/e2e/service-worker-rehydration.spec.js` or a dedicated upgrade spec, extension fixture/profile helpers, `src/background/core.ts`, generated runtime parity checks, and Firefox smoke coverage where `userScripts` is available.
  Acceptance: An isolated Chrome update test installs version N, seeds enabled/disabled scripts and registrations, replaces the package with version N+1, and verifies every eligible script is registered exactly once, stale registrations are removed, disabled scripts remain absent, and a failed registration is surfaced in the existing health evidence; retain the separate worker-restart test and add the equivalent Firefox case or an explicit capability-gated result.
  Complexity: M

- [ ] P2 — Persist a bounded, redacted execution journal across service-worker restarts
  Why: The current live diagnostics store is bounded but intentionally lasts only for the current service-worker lifetime, so the context for a failed run disappears when MV3 suspends or restarts the worker.
  Evidence: `src/background/execution-diagnostics.ts:85-99,145-294` keeps tabs/documents/events in memory with count caps, and `src/background/core.ts:7309-7316` documents the lifetime boundary. Popup, side panel, and DevTools already consume live diagnostics; this item extends continuity rather than adding another “why did it not run?” surface. The unified uBlock Origin logger is a comparable observability model: https://github.com/gorhill/uBlock/wiki/The-logger
  Touches: `src/background/execution-diagnostics.ts`, core diagnostic message handlers, `chrome.storage.session`/bounded IndexedDB adapter, popup/sidepanel/DevTools stale-state rendering, trace export sanitizer, and diagnostics tests.
  Acceptance: After a controlled service-worker stop/start, the latest bounded execution success/failure remains visible with an age/stale indicator; journal records contain only origin or stable URL hashes plus bounded error classes, never full query strings or script source; count, per-tab, age, and serialized-byte eviction are deterministic and covered by restart, quota, and redaction tests.
  Complexity: M

- [ ] P2 — Extend single-file local binding into a reviewable folder/project manifest
  Why: ScriptVault ships a permission-aware single-file binding/watch workflow, but a selected folder cannot currently represent multiple `.user.js`/`.user.css` files, additions, renames, deletions, or project-level conflicts; external-editor workflows in ScriptCat, Safari Userscripts, and community requests show this is a concrete authoring gap.
  Evidence: `pages/dashboard.js` local workspace binding/watch code around `11774+` stores one script/file relationship, while `src/modules/sync-providers.ts:151-153,744+` writes one `scriptvault-backup.json`; there is no relative-path manifest or folder reconciliation layer. Comparable evidence: https://docs.scriptcat.org/en/docs/use/vscode/, https://github.com/quoid/userscripts, https://www.reddit.com/r/userscripts/comments/1pt9xb5, https://www.reddit.com/r/userscripts/comments/1odi87w
  Touches: `pages/dashboard.js` local workspace UI, `src/storage/script-db.ts`/binding types, folder-picker and watch adapter, import/export redaction, local health/support summaries, and focused dashboard/storage/E2E tests.
  Acceptance: A user-selected folder containing three scripts maps each relative path to a stable ScriptVault ID and reconnects after dashboard restart; external add/rename/delete/change operations appear in a review queue; conflicts show both hashes/versions and never silently overwrite executable code; unbind/revoke/permission errors are visible; handles, absolute paths, and local file contents do not enter cloud sync, support snapshots, or ordinary exports.
  Complexity: L

- [ ] P2 — Add deterministic property-based and mutation fuzz coverage for trust-boundary inputs
  Why: The repository has strong hand-written malformed fixtures but no randomized corpus for the parsers and privileged message boundaries that accept untrusted metadata, archives, JSON, structured messages, and network responses.
  Evidence: Candidate boundaries are `src/background/parser.ts`, `src/background/import-export.ts`, `src/modules/public-api.ts`, `src/background/user-script-message-policy.ts`, and `src/background/gm-network-handler.ts`; existing tests are example-based and `package.json` has no property/fuzz command. OWASP identifies malformed and semi-malformed input fuzzing as a direct way to expose parser and security failures, while userscript-malware and extension-privilege studies show these boundaries are security-relevant: https://owasp.org/www-community/Fuzzing, https://singularity.be/public/papers/monkey-in-the-browser.extended.pdf, https://www.usenix.org/system/files/usenixsecurity23-kim-young-min.pdf
  Touches: existing Vitest test suites for parser/import/bridge/network policy, deterministic generators and seed corpus under `tests/`, bounded `package.json` test script, and failure-seed documentation in test fixtures (not a new top-level document).
  Acceptance: `npm run check` runs a deterministic, time-bounded corpus that mutates metadata headers (duplicates, Unicode, controls, oversized values), ZIP/JSON imports, public-API/bridge messages, and network errors/timeouts; malformed inputs fail closed without unhandled rejection, privilege escalation, persistent partial mutation, or unbounded allocation; any discovered seed is retained as a regression fixture and the run reports its seed and boundary.
  Complexity: M
```

</details>
