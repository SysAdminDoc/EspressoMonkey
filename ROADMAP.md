# ScriptVault Roadmap

Actionable work only. Historical and completed roadmap material is archived in CHANGELOG.md; blocked work is kept in Roadmap_Blocked.md.

## Actionable Items

### P2 — Automate primary-route visual-difference thresholds

- **Problem:** Six ImageGen/runtime pairs for Scripts, Updates, Settings,
  Utilities, Trash, and Help were reviewed manually at 1280×800; later CSS or
  browser rendering changes can regress hierarchy, clipping, or selected-route
  styling without breaking DOM tests.
- **Hook:** `scripts/capture-store-screenshots.mjs`, the six references under
  `assets/mockups/dashboard-redesign-2026-08-14/`, the same-input comparisons
  under `assets/design-qa/dashboard-redesign-2026-08-14/`, and the existing
  visual-test configuration.
- **Done when:** the existing deterministic 1x captures at 1280×800 and
  1920×1080 compare stable masks/regions with reviewed thresholds, emit a
  useful diff on failure, and retain the zero-external-request assertion.
- **Effort/risk:** M; browser font/antialiasing variance must not create a flaky
  blocking gate.
