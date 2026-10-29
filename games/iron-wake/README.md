# Iron Wake

An abstract top-down mech defense prototype inspired by the weight and combined
firepower of tabletop mech combat. No licensed characters or assets are used.

Defend the relay through three waves. The 80-ton mech accelerates slowly, reverses
more slowly, and turns its hull independently of a rate-limited turret. Twin
weapon silhouettes, stepping legs, cannon recoil, impact rings, and camera shake
communicate weight without detailed graphics. Terrain marks are decorative.

- Hold W/S (or up/down) to raise/lower persistent throttle, from full reverse
  to full forward. Release to keep the engine setting. X sets neutral; speed
  settles gradually with inertia. A/D (or left/right): turn hull.
- HUD shows commanded throttle and actual signed speed as percentages. Reverse
  remains slower than forward. Pause/focus loss freezes movement and preserves
  the throttle setting; a new deployment starts in neutral.
- Mouse: aim. Hold click or Space: cannon (38 damage, 0.65-second reload).
- Hold E: laser (48 damage/second, hits first target along beam).
- Q: three homing missiles (27 damage each, 4.5-second salvo reload), targeting
  the enemy closest to the aim point when fired. Holding Q repeats when ready.
- Heat is shared. At 100%, all weapons lock until cooling to 35%.
- Esc / Pause: pause. Losing window focus also pauses and clears held input.
- Touch: tap battlefield to aim, hold +/− to adjust throttle, Neutral to stop, and turn/fire buttons as needed.
- Clear a wave for 20 armor repair. Lose if mech or relay armor reaches zero.

Canvas 2D rendering and a fixed-step simulation, with no ECS or external assets.
Everything specific to this game lives here. Only the workspace lifecycle helper
is imported. No save data, network services, desktop setup, or new dependencies.

Run from the workspace root: `bun run dev`, or `bun run build` then
`bun run preview`. Open `games/iron-wake/`. Tests: `bun test games/iron-wake/tests`.
Keyboard/mouse is the intended primary prototype input; touch has functional
buttons, with hardware playability and subjective feel left to owner review.
