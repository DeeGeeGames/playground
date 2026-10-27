# Browser experiments

- This is a browser-only workspace for disposable prototypes. Keep games easy
  to extract into their own repositories; do not add desktop or Steam setup.
- Each game lives under `games/<slug>/` with an `index.html` and owns its world,
  rules, styles, assets, and tests. Add launcher links in `src/catalog.ts`.
- Build tooling discovers game pages. Adding a game must not require changing
  package scripts, build entry lists, server routes, or CI.
- Keep reusable helpers in `shared/` and import them explicitly. Do not create
  a shared singleton ECS world or force physics/rendering choices on all games.
- Use the ECSpresso skill for ECS changes. Prefer published plugin APIs and
  preserve the ported Power Up behavior unless a task explicitly changes it.
- Use strict TypeScript without `any`, non-null assertions, or unchecked casts.
  Prefer function expressions and tabs. Preserve unrelated edits.
- Run `bun run check` for delivery and validate browser-visible behavior in a
  production preview. Report simulated input separately from hardware checks.
- Use relative asset and navigation URLs. Namespace persisted data per game.
- Release task-created processes and browser tabs; preserve user-owned tabs.
- Deliver changes by PR. Never bypass branch protection or merge a head whose
  required checks have not succeeded. Keep publishing on protected `master`.
