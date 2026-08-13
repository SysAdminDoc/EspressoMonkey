# ScriptVault Roadmap

Actionable work only. Historical and completed roadmap material is archived in CHANGELOG.md; blocked work is kept in Roadmap_Blocked.md.

## Actionable Items

### P1 — Complete settings redesign localization

- **Problem:** The 53 new category, persistence, security, recovery, and
  per-script state strings are complete in English but fall back to English in
  the eight partial locale catalogs.
- **Hook:** `src/locales/en.json`, generated locale catalogs, and the existing
  `locale:generate` / `locale:check:gate` pipeline.
- **Done when:** each supported locale translates the new keys without reducing
  the coverage ratchet; all generated runtime catalogs are refreshed; category,
  search, save/error, security-impact, and recovery copy is checked in all four
  themes.
- **Effort/risk:** M; translation quality is the primary risk, with no settings
  schema or permission change.

### P2 — Resolve the Chrome scoped-host default with a release matrix

- **Problem:** Chrome ships required `<all_urls>` for compatibility while the
  repository also contains an optional-host prototype and opt-in scoped-host
  runtime. The prototype report and shipping policy must not imply opposite
  defaults.
- **Hook:** `scripts/check-host-permission-prototype.mjs`,
  `settingsScopedHostPermissions`, `chrome.permissions`, and the install/update/
  dependency/GM cookie/download smoke surfaces.
- **Done when:** a real installed-profile matrix covers fresh install, withheld
  access, per-origin grant/deny/revoke, `<all_urls>` scripts, update URLs,
  `@require`/`@resource`, `@connect`, DNR, cookies, and downloads; the manifest,
  prototype report, privacy/store copy, and tests then agree on one default.
- **Effort/risk:** L; high store-warning and runtime-breakage risk, so do not
  change the manifest from static analysis alone.

### P2 — Automate desktop settings visual parity

- **Problem:** Six ImageGen/runtime pairs were reviewed manually at 1280×800;
  later CSS or browser rendering changes can regress hierarchy, disclosure
  state, clipping, or selected-category styling without breaking DOM tests.
- **Hook:** `scripts/capture-store-screenshots.mjs`, the six references under
  `assets/mockups/settings-redesign-2026-08-13/`, and the existing visual-test
  configuration.
- **Done when:** deterministic 1x captures cover 1280×800 and 1920×1080 desktop
  viewports, compare stable masks/regions with reviewed thresholds, emit a
  useful diff on failure, and retain the zero-external-request assertion.
- **Effort/risk:** M; browser font/antialiasing variance must not create a flaky
  blocking gate.
