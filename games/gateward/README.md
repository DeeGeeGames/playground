# Gateward

A self-contained, isometric capital-ship tower defense prototype. The ark follows
its route automatically; the player builds its defenses instead of piloting.

Open `games/gateward/` from the launcher. Fit the ship with the starting 300
salvage, then depart. A voyage takes about 3½ minutes at 1×, or half that at 2×.
Six directional waves culminate in a flagship. Reach Kepler Gate and destroy all
hostiles to win; losing the ark's hull ends the run.

- Select one of eight mounts using the ship, panel buttons, or keys 1–8.
- Flak handles light ships; railguns ignore armor; homing missiles deal splash
  damage. All turrets fire automatically through full arcs. Upgrade to level 3
  for damage, range, and fire rate. Selling returns 70% of the investment.
- Deploy three interceptors or one guardian. There are nine shared craft slots.
  Click empty space to rally escorts, or use R / the rally button first. Enemies
  prefer nearby escorts, allowing guardians to absorb fire. Lost units must be
  replaced. Escorts engage within a bounded area around their rally point.
- Click a hostile to set a priority for turrets and nearby escorts. Clear the
  target to return to nearest-target fire.
- Q / Aegis pulse clears incoming projectiles, pushes nearby enemies, and reduces
  hull damage by 80% for five seconds. Recharges in 32 seconds.
- E / Repair spends 80 salvage for up to 240 hull, with a 15-second cooldown.
- Kills earn salvage; the reactor produces 1.2 salvage per second. Clearing a
  wave grants 50 salvage and repairs 60 hull. Waves follow a fixed schedule, so
  slow defenses can face overlapping contacts.
- Space or Escape pauses. Tab and native button activation work for the command
  panel. Focus loss and hidden documents pause the running voyage. Pointer/touch
  commands use the same actions. Physical touch devices are separate acceptance.

Browser-independent simulation lives in `src/simulation.ts`; Canvas rendering and
DOM input are separate. `src/projection.ts` uses the published ECSpresso isometric
projection plugin helpers (`worldToIso` / `isoToWorld`) for the view and pointer
coordinates. Hulls and turrets have visual elevation; selection uses their
projected centers. Canvas draws ships back to front by world X + Y. The Pixi-only
projection/depth-sort systems are not installed. No gameplay ECS migration, saves,
external assets, audio, network, or shared runtime state.
The page uses the workspace lifecycle disposer for animation and input cleanup.

The ark's Canvas artwork in `src/ark.ts` uses a broad clipped bow, a deep undercut
gunmetal hull, straight armored broadsides, recessed warm habitation lights, and
four blocky stern drives. Long aft terraces support a wide sloped command bridge.
Armored turret housings distinguish twin-barrel flak,
long-barrel railguns, and paired missile pods. Artwork preserves the eight mount
positions, selection elevations, and combat rules; the larger hull is decorative.

The camera follows the ark along a 2.52 km route at 12 m/s. Fixed navigation
beacons, a scrolling lattice, distant debris, and layered star parallax communicate
travel. The gate reaches the ark at the end of the route; scenery and drive stop
there even if hostiles remain. Pausing freezes the journey, and replay returns to
departure. Reduced motion disables decorative parallax and engine flicker while
keeping navigation and the gate tied to route progress.

`bun test games/gateward/tests` exercises economy, combat, escort losses, support
systems, failure, and a complete salvage-funded victory. `bun run check` validates
the whole workspace. Production preview and owner judgment establish visual and
play-feel evidence separately from deterministic tests.
