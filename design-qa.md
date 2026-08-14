# Design QA — Primary Dashboard Redesign

Date: 2026-08-14
Target: ScriptVault 3.30.1 desktop extension dashboard
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

## Populated Scripts spacing and menu follow-up

- Source visual truth: `C:\Users\--\Desktop\2026-08-14 18_35_45-C__Users_--_repos_kick-focus_RESEARCH.md - Notepad++.png`
- Rendered implementation: `assets/screenshots/dashboard-dark-populated-spacing-fixed.png`
- Same-input comparison: `assets/design-qa/dashboard-redesign-2026-08-14/scripts-populated-spacing-comparison.png` (source left, implementation right)
- Viewport and pixels: source 1908×908 pixels; implementation 1908×908 CSS px
  at device scale factor 1 and 1908×908 pixels. The source capture does not
  encode its original device scale factor, so the comparison is normalized by
  equal output pixels and shared desktop state rather than inferred density.
- State: dark theme, 11 installed scripts, 4 active scripts, Saved views open,
  and a selected-script inspector. The implementation uses deterministic
  local-only fixture scripts; content identity is intentionally different while
  count, density, menu state, and inspector state match the supplied evidence.
- Full-view evidence: the 3816×908 comparison shows the complete toolbar,
  table, and inspector at native height in one image.
- Focused-region evidence: no separate crop was needed because the open menu,
  table header/body boundary, long-title row, and inspector actions remain
  legible at original resolution in the same-input comparison.

### Populated-state findings and fixes

| Priority | Finding | Evidence and impact | Resolution |
|---|---|---|---|
| P1 | The sticky table header was offset inside the clipping container. | The source shows a blank band between the table border and column labels, materially delaying the first row. | Restored `overflow: clip`, which preserves rounded clipping without becoming the sticky scroll root; the browser test now asserts the header and first row are flush. |
| P1 | The Saved views popup fell back to the white Windows native menu. | The open popup ignored the dark graphite surface and weakened option contrast. | Enhanced Status, Sites, and Saved views with one accessible themed listbox controller while retaining the underlying selects for state and automation compatibility. |
| P2 | Malformed or metadata-heavy titles could consume the remaining table width and hide trailing controls. | Two source rows continue beneath the inspector edge without a visible truncation boundary. | Switched the workbench table to fixed layout and constrained the name flex chain so titles end in an ellipsis before version, site, update, and action columns. |
| P2 | Inspector actions wrapped into narrow multi-line columns. | “Site access” and “Check for Update” break across two or three lines in the source. | Reflowed secondary actions into two columns with the update action spanning the row, preserving the full localized label. |
| P2 | Checkbox, Enabled, and Name headers were too tightly packed after fixed-layout enforcement. | The first fixed-layout capture put the checkbox and Enabled label in the same visual pocket. | Increased the checkbox and Enabled column tracks to 52 px and 78 px, then recaptured the same state. |

The second populated-state comparison has no actionable P0, P1, or P2
differences for the requested spacing and dropdown scope. Typography remains on
the product's existing font stack and optical weights; spacing now follows the
52 px header and bounded column tracks; colors come from the shared graphite,
emerald, border, and elevated-surface tokens; image quality is unchanged because
no raster assets were added; and app-specific copy remains localized and
unabridged.

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
the exact detected browser capability message; version text is 3.30.1; real
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
5. Compared the supplied populated/open-dropdown screenshot with an equal-pixel
   runtime capture, fixed the five P1/P2 findings above, and repeated the
   comparison after the final checkbox/status track adjustment.

## Verification

- `npm run build` — passed; generated runtime reports version 3.30.1.
- `npm run build:edge:stage` — passed.
- `npm run check` — passed; 255 files and 2,939 tests passed.
- `npm run test:visual` — passed; six browser visual tests across dark, light,
  Catppuccin, OLED, and the open Saved views state.
- `tests/e2e/dashboard-workbench.spec.js` — passed; real extension geometry,
  themed-menu selection, keyboard navigation, and filter state verified.
- `npm run smoke:editor` — passed; 13 controls hit-testable and Monaco
  diagnostics painted.
- `npm run smoke:dashboard` — passed; six-route shell plus deep links,
  settings/recovery, dirty state, and destructive-dialog focus verified.
- Both six-shot capture runs completed with zero external HTTP(S) requests.
- Populated open-menu captures at 1908×908 and 1280×800 also completed with
  zero external HTTP(S) requests.

No unresolved P0, P1, or P2 visual or functional findings remain for the
defined desktop states, including the populated library and open dropdown.

final result: passed
