# Gateward

Gateward is a browser-only capital-ship defense prototype. The ark follows its
course automatically; the player fits weapons, assigns escorts and manages ship
systems to break through the enemies between departure and Kepler Gate.

There is one game, **Systems Trial**. Open `games/gateward/` from the launcher,
fit the ship with **500 salvage**, then depart. Legacy `?mode=` query parameters
are ignored; they do not select alternate rules or encounters.

Reach the end of the **5.76 km route alive** to win. Surviving hostiles may remain
behind the ark. There is no deadline, minimum combat duration, requirement to
clear every contact, or flagship finale. Losing all hull ends the run. Restart
returns to fitting with the original budget, systems and route progress.

## Route defenses

Five defensive lines occupy fixed stations along the route:

| Line | Complement |
| --- | --- |
| 1 | 8 raiders |
| 2 | 6 bombers |
| 3 | 3 armored ships |
| 4 | 10 raiders |
| 5 | 3 bombers |

Raiders begin aboard enemy carriers, with each line's finite fighter complement
split between the two flanks. Carrier hulls are additional targets. Destroying a
carrier prevents its remaining fighters from launching; fighters already airborne
retain their line's orders.

Distance traveled triggers deployment, rather than elapsed time. Each line
enters when the ark is within 1600m of its station. Heavy ships hold world
positions across the route, while fighters and bombers intercept locally within
1300m of their station. Once the ark is more than 960m past a line, its survivors
disengage permanently and return to their stations. Stopping the engines delays
later lines but does not freeze enemies or incoming fire.

Kills earn salvage, and the reactor produces 1.2 salvage per simulation second.
Destroying all deployed hostiles with no pending arrivals grants the existing
clearance bonus of 50 salvage and 60 hull repair. Passing a line or leaving
survivors behind grants no kill salvage or clearance repair.

## Weapons and escorts

The ark has eight mounts: port 1–4 and starboard 5–8. Every turret uses a **120°
outward firing arc**, leaving fore and aft blind spots. Select a fitted mount to
see its actual range and coverage. Priority targeting cannot bypass sensor,
range or arc requirements. Guns must turn onto their firing solution before
firing, including after a target change.

- Flak provides rapid fire and prefers classified raiders.
- Railguns ignore armor and prefer classified armored ships.
- Missiles seek detected clusters and apply splash damage on impact.
- Beams sustain instant damage against an eligible target; armor reduces it.

Eligible player focus overrides automatic preferences. Otherwise eligible targets
use weapon preference, then nearest distance and lowest ID. Upgrade a weapon to
level 3 for damage, range and firing speed. Selling returns 70% of its investment.
Zero weapon power stops turret reload progress, turning and firing; changing
power grants neither instant reload nor damage.

An interceptor wing costs 85 salvage and contains three fighters. A guardian
costs 105. Both share nine craft slots. Fighters start docked. **Scramble all
fighters** enables recurring sorties according to coverage priorities; **Recall
all fighters** brings airborne wings home and holds them docked until scrambled
again. Changing coverage does not release that hold.

A wing cycles through 2 seconds launching, 18 seconds on sortie, physical return
to the moving stern, 10 seconds rearming, then ready. Only sortie fighters fire.
Survivors retain damage. Lost fighters do not regenerate; replacements cost 30
salvage each and are available while docked or rearming. Lost guardians require
buying new craft.

**Cover** assigns Fore, Aft, Port and Starboard priorities: Off, Low, Normal,
High or All. All commits every available escort to one sector until released;
Balanced restores Normal on every side. Wings stay together, and guardians and
fighters allocate independently. Escorts choose their own screening and local
intercept positions, then return to their stations. The older shared rally
control is removed. Nearby escorts can draw hostile fire away from the ark.

## Reactor, shields and repairs

Allocate ten integer reactor units among engines, weapons and shields. Start at
4/4/2; choose a preset or transfer one unit between named systems. Fitting allows
planning. Pause, focus loss and ended runs hold simulation and reject orders.

| Preset | Engines / weapons / shields | Healthy speed | Undamaged route time at 1× |
| --- | --- | --- | --- |
| Balanced | 4 / 4 / 2 | 24 m/s | 240 seconds |
| Engine priority | 6 / 2 / 2 | 36 m/s | 160 seconds |
| Weapon priority | 2 / 6 / 2 | 12 m/s | 480 seconds |
| Shield priority | 2 / 2 / 6 | 12 m/s | 480 seconds |

Each engine unit supplies 6 m/s. Ten engine units yield 60 m/s and a 96-second
healthy route, while leaving no reactor power for ark weapons or shield recharge.
Weapon power supplies 0.25× turret cadence per unit, up to 2.5×. Shield power
supplies 4 HP/s of recharge per unit. These figures describe travel and output,
not strategy or balance acceptance. The 2× setting advances simulation faster.

The energy shield starts with 240 of 360 HP. It absorbs incoming damage before
hull and recharges after three seconds without an ark hit. **Aegis / Q** is a
separate emergency action: it clears hostile rounds, pushes nearby enemies and
reduces hull damage by 80% for five seconds, with a 32-second cooldown. It does
not refill the energy shield.

Penetrating rounds damage equipment at their hull impact location. Engines,
sensors, the shield generator and each fitted mount can be impaired below 50
integrity or offline at zero. Impaired engines and guns operate at half output;
impaired generators recharge at half rate. An offline generator stops recharge,
but existing shield charge still protects the ark.

Four reusable repair crews are shared by hull and equipment. Each assigned crew
repairs 12 hull HP or 4 equipment integrity per simulation second. Repairs cost
no salvage. Power-drawer controls split or concentrate crews; **E** toggles one
hull crew and **S** toggles one sensor crew. Reassignment retains repair progress,
and reaching full integrity releases crews. Repairs freeze with the simulation
and cannot revive the ark. Selling or upgrading a gun does not repair its mount.

## Sensors and interdiction

**T / Radar** opens a heading-up tactical screen. Long range covers 8 km and short
range 2800m; both sensor bands remain active in either view. Healthy sensors
classify contacts within 2560m. Below 50 integrity, detection falls to 4000m and
classification to 920m. Offline sensors retain 800m local automatic defense with
no classification. Sensor repair uses the shared free crews.

Unclassified contacts appear as coarse amber groups without exact class, count
or hull information. Only real detected actors generate warnings. Lost tracks
retain their last observed world position and age, expire after eight simulation
seconds and cannot be targeted. Visibility and radar do not extend weapon range
or firing arcs. Missiles lose guidance outside acquisition range and can recover
it if acquisition returns; independent escort self-defense continues.

Classified bombers display a two-second **ARRAY SHOT** preparation cue before
release, followed by FIRED and RECHARGING. Destroy the bomber, intercept its
rounds with escorts, or block them with a field. Shield absorption protects
against penetrating equipment damage; Aegis can clear already flying rounds.

**Interdiction / I** previews a world-anchored field after departure. Choose
Ahead, Port or Starboard, tap/click the battlefield to aim, or use arrow keys
while the canvas is focused. Enter or Place field confirms; Escape cancels. A tap
updates the preview without placing it. Green marks a valid position and red an
invalid one; orbit drags, pinches and cancelled pointers cannot confirm placement.

One field costs 90 salvage, has a 440m radius, lasts 30 simulation seconds and has
a 40-second cooldown. It must clear the ark and hostiles, begin ahead or beside
the ark, and stay within 1800m placement range. It blocks hostile firing lines
and already flying rounds; friendly fire and escorts pass through. Hostiles use
bounded detours around it, with detected redirected ships labeled DETOUR. The
field remains at its world position as the ark passes, and expires early when
more than 2600m astern. Pause, focus loss, restart and results cancel placement.

## Controls and presentation

- Keys **1–8**, mount pads or Fit-drawer buttons select a weapon mount.
- Click/tap a detected hostile to mark priority; clear the target to resume
  automatic weapon preferences. Empty-space taps no longer issue rally orders.
- **C** toggles Cover. Edge tabs open one drawer for coverage, weapons, power,
  escorts or sensors; drawers scroll on short screens and do not pause combat.
- **T** toggles radar; **R** also opens it. Escape returns from radar, otherwise
  cancels field placement, closes a drawer, then toggles pause.
- **Space** pauses outside native button activation. Focus loss and a hidden
  document pause play. Tab and native keyboard activation remain available.
- Right-drag or touch-drag orbits the camera; the wheel or a pinch zooms. Reset
  view and restart restore the original tactical camera, which follows the ark.
- Standard controller: Y toggles the last drawer, bumpers switch tabs, D-pad
  moves focus or changes a selected value, A activates, B returns and Start pauses.
  Held buttons are ignored after connection or focus restoration until released.
- Sound on/off toggles session mute. Web Audio effects unlock after interaction;
  pause, hidden tabs and focus loss cut active voices without replaying missed cues.

The canvas preserves the playfield while HUD, direct emergency actions and edge
drawers expose ship controls. Navigation landmarks and the gate are world-fixed;
the camera does not change simulation positions. Reduced motion disables
nonessential visual motion while retaining physical travel and combat feedback.

## Implementation and assets

`src/simulation.ts` owns browser-independent fixed-step gameplay. Encounter
composition lives in `src/scenarios.ts`, route defense geometry in
`src/route-defense.ts`, and reactor/shield rules in `src/systems.ts`.
`src/flight.ts`, `src/ship-traffic.ts` and `src/space.ts` handle bounded ship
steering, solid traffic, world positions and explicit ship-local offsets. Active
ships, shots, effects and fields store world positions independently of camera
motion. Projectile origins, inherited firing velocity, swept hits and visible
weapon mounts share the same geometry.

Three.js rendering lives in `src/presentation.ts` with camera-aware picking in
`src/projection.ts`. It owns camera controls, models, lighting and bounded effects;
DOM code owns accessible input and status. Lost graphics contexts pause play.
Shutdown disposes controls, geometry, materials, shadow buffers, labels and the
WebGL context. No desktop packaging, gameplay ECS, physics engine or shared
singleton world is required.

The runtime ark model is `public/models/gateward-ark.glb`; its editable source is
`assets/gateward-ark.blend`. It has eight fitted mount positions and no external
textures. Rebuild with Blender on PATH:

```sh
blender --background --factory-startup --python games/gateward/tools/build-ark.py -- --gateward-export /tmp/gateward-asset
cp /tmp/gateward-asset/gateward-ark.blend games/gateward/assets/gateward-ark.blend
bunx @gltf-transform/cli@4.5.1 dedup /tmp/gateward-asset/gateward-ark.glb /tmp/gateward-asset/dedup.glb
bunx @gltf-transform/cli@4.5.1 prune /tmp/gateward-asset/dedup.glb games/gateward/public/models/gateward-ark.glb
```

The active enemy carrier uses `public/models/gateward-carrier.glb`, with editable
source `assets/gateward-carrier.blend`. Four external hangar pods attach to a
command spine; the hull has no main battery and launches a finite fighter
complement. The GLB faces +X with Y up; Launch_01 through Launch_04 mark bay exits.
Runtime launch geometry and collision envelopes are centralized in
`src/ship-config.ts`. Rebuild its source and GLB with:

```sh
blender --background --factory-startup --python games/gateward/tools/build-carrier.py -- /tmp/gateward-carrier
```

Copy the generated blend and GLB to their asset/runtime directories. Preview
cameras and lighting remain in the blend, outside the GLB. Other craft are built
by `src/craft-3d.ts`; raiders and interceptors use half scale and other craft use
1.5× scale relative to their source hulls, while the ark keeps its scale.

`src/combat-scale.ts` centralizes the 4× tactical distance and linear speed
multiplier. Hull dimensions, hit envelopes and angular rates are separate. The
camera can zoom out to 0.1625. Decorative asteroid cells, debris, grid and star
layers follow the visible camera footprint and do not affect combat or sensors.

## Validation

Run `bun test games/gateward/tests` for focused simulation, combat, input-model,
projection and geometry checks. `bun run check` runs the whole workspace's tests,
typechecking, lint and production build. Use a production preview to exercise
fitting, departure, defensive lines, power/repair/escort orders, pause, focus loss,
arrival with survivors, restart and responsive layouts.

Deterministic tests establish repeatable behavior, and browser automation can
exercise simulated pointer, touch, keyboard and controller input. Neither proves
physical-device performance, touch/controller feel, speaker output or owner
acceptance of difficulty and pacing. Record current delivery evidence separately;
old mode-comparison snapshots are not acceptance for this single ruleset.
