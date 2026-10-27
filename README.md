# DeeGee Games experiments

A browser workbench for small game ideas. Each experiment owns its code, assets,
styles, tests, and ECS world. Ideas worth keeping can move into their own repository.

Play at **https://experiments.deegeegames.com**.

## Start

Install Bun **1.3.14**, then run:

```sh
bun install --frozen-lockfile
bun run dev
```

Open the URL printed by the server. The launcher links to
`/games/power-up/`. Use `PORT=3001 bun run dev` to choose another port.

## Add an idea

```sh
cp -R templates/basic games/my-idea
```

1. Change the title in `games/my-idea/index.html` and start editing
   `games/my-idea/src/main.ts`. The template already has an ECSpresso world,
   Pixi rendering, input, timers, tweens, coroutines, and cleanup.
2. Add an entry to `src/catalog.ts` with `href: './games/my-idea/'`.
3. Open that link. No package, server, workflow, or build configuration changes
   are needed. Refresh the page to rebuild, including newly added folders.

The template stays outside the game catalog and production build. Each game
page has its own JavaScript bundle and styles; the launcher does not boot any
game. Use normal links for navigation. Game screen transitions remain owned
by ECSpresso inside that game's world.

## Available setup

- Bun, strict TypeScript, ESLint, tests, development and production servers.
- ECSpresso **0.24.1**, including its input, assets, screens, scripting,
  spatial, physics, collision, health, and rendering plugins.
- PixiJS **8.22.0** for 2D rendering. Other games may use Canvas instead.
- `lit-html` for DOM menus and HUDs; Howler for browser audio.
- `shared/lifecycle.ts` for page and hot-reload cleanup. A game initializer
  returns its disposer and must clean up a partial startup before throwing.
- `shared/input.ts` releases a game's bound keyboard keys when focus is lost.

Install only project-wide dependencies at the root. Choose physics, timing,
rendering, and screen behavior per game; there is no shared singleton world or
fixed set of game rules. The starter is a convenience, not a required engine.

Keep game-specific modules and assets under their game folder. Import assets
with relative URLs so Bun can bundle them. For files loaded at runtime, put
them in the game's `public/` folder: `public/audio/example.ogg` is served as
`./audio/example.ogg` beside that game's page. Root `public/` works likewise.
Avoid URLs beginning with `/`: relative
links work both on the custom domain and under a GitHub Pages repository path.

If adding saves, namespace keys with the game slug (for example,
`experiments:my-idea:v1:settings`) and validate stored data. Audio must start
after a player gesture. Input listeners, tickers, observers, audio, and graphics
must be released by the game's disposer. Cached pages retain their world for
browser Back; uncached navigation and hot reload dispose it.

## Validate

```sh
bun run check       # lint, tests, typecheck, production build
bun run preview     # serve dist/ after building
bun test games/power-up/tests
```

For visible changes, exercise the production preview as well as deterministic
tests. Keyboard, simulated gamepad, browser touch emulation, physical devices,
and subjective feel are separate evidence.

Power Up retains its gameplay sandbox, combat test fixtures, touch controls,
fullscreen control, and simulation tests. Its snapshot provenance is in
`games/power-up/PORT.md`. The original repository remains independent.

## Publishing

GitHub Actions deploys `dist/` to GitHub Pages on pushes to `master`, after
`bun run check`. Pull requests require tests, typechecking, build, and lint
checks. `CNAME` records the custom hostname and is included in the artifact.

GitHub Pages uses Actions publishing with custom domain
`experiments.deegeegames.com`. Namecheap DNS uses a CNAME with host
`experiments` and target `deegeegames.github.io`. HTTPS is managed by GitHub.
No wildcard DNS, service worker, analytics, desktop packaging, or Steam setup
is part of this workspace.

To graduate a game, copy its folder and tests into a new repository, take any
explicit imports from `shared/`, and copy the root tooling and dependency
configuration it needs. There is no launcher runtime required to run a game.
