# Power Up source

Ported from https://github.com/david0178418/power-up at commit
`27759b6a53596cab640bba5472dfbc9142a30e60`.

Simulation, rendering, controls, fixtures, and tests retain their original
behavior. The entrypoint uses workspace lifecycle and keyboard-reset helpers, and the page adds
a link back to the experiment launcher. This is an independent snapshot; further
changes here do not update the source repository.

Run from the workspace root: `bun run dev`, then open `/games/power-up/`.
Run this game's tests with `bun test games/power-up/tests`.
