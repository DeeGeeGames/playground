# Gateward play-screen UX reference

Approved direction: option 2 (contextual inspector) plus option 3's four direct reactor presets. The GitHub issue is the implementation specification. These files are reference artifacts, not game code.

## Start here

- `desktop.html`: consolidated 1440 × 900 reference.
- `portrait.html`: consolidated 390 × 844 reference.
- `landscape.html`: consolidated 844 × 390 reference.
- For each layout, `*-combat.png` shows the inspector closed, `*-inspector.png` shows an empty mount selected, and `*-fitting.png` shows fitting and departure on the same screen.
- `source-bundle.zip`: self-contained HTML, SVG, original explorations and this README. Download and extract, then open HTML locally; no server, package install or external assets required.
- `scene-reference.svg` is an illustrative background used by the mockups. Retain the real game renderer and models; do not ship this SVG as replacement game art.
- `exploration-*` files preserve the earlier options for rationale only. The consolidated references and issue take precedence.

## How to inspect

Open a consolidated HTML file at its named viewport size. These are fixed-size design references, deliberately not a production responsive implementation. The two mobile HTML files represent the same game state in different orientations. They are not connected simulations.

Click mount 3, Ship systems, Menu, or the close control. Direct reactor presets and purchase commands display demonstration feedback; they do not mutate game state. The initial panel shows an empty mount. For fitting, open the developer console and run `document.querySelector('[data-fitting]').click()`; the normal game implementation must expose fitting through its existing lifecycle, not a debug control.

Use the original exploratory HTML for its visible fitting toggle and paired views. All controls not fully simulated here must still be implemented from the issue's control inventory and existing game behavior. Values are illustrative, not balancing requirements. The demo's Menu, Escape behavior and feedback are not production input semantics; follow the issue.

## Visual constants

- World background: #080f1b; panel gradient: #152c3aee → #0c1b29f5; border: #395360.
- Primary text: #deeaef; secondary text: #a5b9c6; active/preset fill: #94dfc9; active text: #0c252c.
- Hull: #c6d6ae; energy shield: #73c3e9; warning: #e9b77b.
- Panel radius: 8px; control radius: 6px; control gap: 6–8px; panel padding: 12–16px.
- Main text 13–16px; compact secondary labels 11–12px. All primary touch targets at least 44 × 44 CSS pixels before any preview scaling.
- Preserve text labels and numeric values; do not communicate readiness, damage, selection or target classification only through color.

## Evidence limits

PNG files are Chromium screenshots of HTML design mockups at 1 CSS pixel per image pixel, not screenshots of implemented gameplay. `preview-checks.json` records the three sizes, states, minimum control dimensions and absence of script errors. Panels were opened/closed and the fitting state rendered. There is no physical-phone, browser-toolbar, rotation or gameplay acceptance evidence here. Follow the issue's validation matrix against the real production preview.

Reference source baseline: DeeGeeGames/playground commit ac738ab1d56ce03c3d1e760ab937b107ecebd191. No runtime files changed to create this package.
