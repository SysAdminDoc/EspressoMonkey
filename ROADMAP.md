# ScriptVault Roadmap

Actionable work only. Historical and completed roadmap material is archived in CHANGELOG.md; blocked work is kept in Roadmap_Blocked.md.

## Actionable Items

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
