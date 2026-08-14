# Design QA — Primary Dashboard Redesign

Date: 2026-08-14
Target: ScriptVault 3.30.0 desktop extension dashboard
Primary viewport: 1280×800 at device scale factor 1
Secondary viewport: 1920×1080 at device scale factor 1

## Reference and runtime set

Each ImageGen reference was normalized from 1586×992 to the same 1280×800
comparison canvas as the corresponding runtime capture. The bitmap references
are design inputs only; the shipped interface is HTML, CSS, and JavaScript.

| Route | ImageGen reference | Runtime capture | Same-input comparison |
|---|---|---|---|
| Scripts | `assets/mockups/dashboard-redesign-2026-08-14/scripts.png` | `assets/screenshots/dashboard-dark.png` | `assets/design-qa/dashboard-redesign-2026-08-14/scripts-comparison.png` |
| Updates | `assets/mockups/dashboard-redesign-2026-08-14/updates.png` | `assets/screenshots/dashboard-updates-dark.png` | `assets/design-qa/dashboard-redesign-2026-08-14/updates-comparison.png` |
| Settings | `assets/mockups/dashboard-redesign-2026-08-14/settings.png` | `assets/screenshots/dashboard-settings-core-dark.png` | `assets/design-qa/dashboard-redesign-2026-08-14/settings-comparison.png` |
| Utilities | `assets/mockups/dashboard-redesign-2026-08-14/utilities.png` | `assets/screenshots/dashboard-utilities-dark.png` | `assets/design-qa/dashboard-redesign-2026-08-14/utilities-comparison.png` |
| Trash | `assets/mockups/dashboard-redesign-2026-08-14/trash.png` | `assets/screenshots/dashboard-trash-dark.png` | `assets/design-qa/dashboard-redesign-2026-08-14/trash-comparison.png` |
| Help | `assets/mockups/dashboard-redesign-2026-08-14/help.png` | `assets/screenshots/dashboard-help-dark.png` | `assets/design-qa/dashboard-redesign-2026-08-14/help-comparison.png` |

The six corresponding `*-wide.png` runtime captures under
`assets/screenshots/` were checked at 1920×1080 for desktop composition,
clipping, overflow, and scroll access.

## State contract

- Theme: dark graphite/emerald.
- Library: empty local vault; updates and trash empty.
- Setup state: `chrome.userScripts` unavailable in the headless extension
  profile, so the runtime shows the complete truthful compatibility message.
- Settings values follow the authoritative fresh-profile state rather than a
  decorative switch position from the generated reference.
- No mobile layout or mobile acceptance target was introduced.

## Findings and resolutions

| Priority | Finding | Resolution |
|---|---|---|
| P1 | The legacy 184 px rail and older stylesheet order overrode the selected shell. | Added `pages/dashboard-parity.css` as the final dashboard layer with the 216 px rail and shared route geometry. |
| P1 | Screenshot capture could record the shell before the library rendered. | Wait for either visible empty state or rendered rows, then clear incidental focus before capture. |
| P1 | Visually removing redundant secondary rail groups broke programmatic deep links. | Kept shortcuts callable off-canvas and out of the Tab sequence; dashboard smoke verifies all three targets. |
| P2 | Empty Scripts and Updates states were wordier and weaker than the reference hierarchy. | Tightened localized titles/descriptions and retained real create/import/check actions. |
| P2 | Settings lost explanatory copy beside core switches. | Added visible localized helper lines while preserving keys, defaults, and autosave handlers. |
| P2 | Trash lacked the reference's size column and centered recovery state. | Added computed script size and aligned the five-column table/empty state. |
| P2 | Utilities and Help retained unrelated card rhythm. | Reflowed existing controls into the selected operations and reference grids without inventing functionality. |
| P2 | The first parity layer used blur and freeform pill radii outside the product contract. | Removed backdrop blur, restored the finite radius scale, and added complete forced-colors system tokens. |

Intentional differences are not parity defects: the runtime setup banner uses
the exact detected browser capability message; version text is 3.30.0; real
controls and authoritative values replace decorative or invented details; and
existing icon assets are used instead of generating ornamental substitutes.

## Iteration record

1. Established the six-route rail, command header, content geometry, and
   graphite/emerald token treatment.
2. Refined Scripts, Updates, Settings, Utilities, Trash, and Help against the
   paired 1280×800 comparison inputs.
3. Corrected focus, finite-radius, forced-colors, and screenshot-readiness
   regressions surfaced by repository contracts.
4. Re-captured both desktop viewports, rebuilt comparisons, and re-ran browser
   interaction and visual gates.

## Verification

- `npm run build` — passed; generated runtime reports version 3.30.0.
- `npm run build:edge:stage` — passed.
- `npm run check` — passed; 255 files and 2,938 tests passed.
- `npm run test:visual` — passed; five browser visual tests across dark, light,
  Catppuccin, and OLED.
- `npm run smoke:editor` — passed; 13 controls hit-testable and Monaco
  diagnostics painted.
- `npm run smoke:dashboard` — passed; six-route shell plus deep links,
  settings/recovery, dirty state, and destructive-dialog focus verified.
- Both six-shot capture runs completed with zero external HTTP(S) requests.

No unresolved P0, P1, or P2 visual or functional findings remain for the
defined desktop states.

final result: passed
