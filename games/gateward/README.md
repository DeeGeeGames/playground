# Gateward

A self-contained, 3D capital-ship tower defense prototype. The ark follows
its route automatically; the player builds its defenses instead of piloting.

Open `games/gateward/` from the launcher. Fit the ship with the starting 300
salvage, then depart. A voyage takes about 3½ minutes at 1×, or half that at 2×.
Six directional waves culminate in a flagship. Reach Kepler Gate and destroy all
hostiles to win; losing the ark's hull ends the run.

- Select one of eight mounts using a visible ship pad, panel buttons, or keys 1–8.
- Right-drag to orbit and use the wheel to zoom. On touch screens, drag to orbit
  and pinch to zoom; a tap still gives an order. Reset view and restarting restore
  the original orthographic tactical camera. The camera stays centered on the ark.
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

Browser-independent simulation lives in `src/simulation.ts`; Three.js presentation
and DOM input remain separate. `src/presentation.ts` owns the scene, orthographic
camera, OrbitControls, lights, models, visual effects, and disposal. The HTML
command panel remains accessible with keyboard controls. A transparent Canvas
layer draws screen-space numbers, health bars, navigation labels, and contact
arrows. Solid world geometry shares WebGL depth testing.

`src/projection.ts` projects and raycasts through the current camera. Mount and
hostile clicks respect visible mesh surfaces, including hull occlusion; the panel
can select a mount hidden on the far side. Pointer release issues tap/click orders;
orbit drags, pinches, cancellation, pause, and focus loss cannot leak into rally or
target orders. Lost graphics contexts pause the voyage and can be resumed after
restoration. Renderer shutdown disposes controls, geometry, materials, shadow
buffers, labels, and its WebGL context. Gameplay still runs on the original 2D
plane; no physics, gameplay ECS, persistence, or shared-world migration.

Aircraft occupy a presentation-only flight layer above the bridge. Projectile
trails join turret height to that layer; incoming fire descends to the existing
hull collision boundary. Ranges, damage, targeting, and movement stay planar.

The ark is a Blender-authored, faceted armored model with a broad chamfered prow,
segmented shoulder and belly armor, recessed warm lights, a stepped aft bridge,
and four stern drives. Dynamic turrets retain the eight original mount positions
and firing rules. The shipped model is `public/models/gateward-ark.glb`; editable
source is `assets/gateward-ark.blend`. It has about 8,800 triangles, eight materials,
and no external textures. `tools/build-ark.py` reproduces it in an isolated Blender
scene and preserves an existing user document when called from live Blender.

The two escort craft and four hostile classes use faceted, segmented steel armor,
recessed warm glazing, and housed stern drives to match the ark. Escort recognition
marks stay cyan; hostile plating retains muted rust, ochre, and plum distinctions.
`src/craft-3d.ts` builds these small models and batches details by material (at most
eight draws per craft). They keep the original tactical scale, flight layer, and
planar combat rules. Turret models are unchanged by this supporting-craft pass.

To rebuild the source and runtime asset with Blender on your PATH:

```sh
blender --background --factory-startup --python games/gateward/tools/build-ark.py -- --gateward-export /tmp/gateward-asset
cp /tmp/gateward-asset/gateward-ark.blend games/gateward/assets/gateward-ark.blend
bunx @gltf-transform/cli@4.5.1 dedup /tmp/gateward-asset/gateward-ark.glb /tmp/gateward-asset/dedup.glb
bunx @gltf-transform/cli@4.5.1 prune /tmp/gateward-asset/dedup.glb games/gateward/public/models/gateward-ark.glb
```

The camera follows the ark along a 2.52 km route at 12 m/s. Fixed navigation
beacons, a scrolling lattice, distant debris, and layered star parallax communicate
travel. The gate reaches the ark at the end of the route; scenery and drive stop
there even if hostiles remain. Pausing freezes the journey, and replay returns to
departure. Reduced motion disables decorative parallax and engine flicker while
keeping navigation and the gate tied to route progress.

`bun test games/gateward/tests` exercises economy, combat, escort losses, support
systems, failure, a complete salvage-funded victory, camera-aware picking,
orbital projection, resize, model hardpoints, and shield clearance. `bun run check` validates
the whole workspace. Production preview and owner judgment establish visual and
play-feel evidence separately from deterministic tests.

## Escort Drill (experimental)

Choose **Escort Drill** in the briefing, pause menu or result, or open
`?mode=drill`. Restart retains the selected mode. Full voyage remains the default
with its original full arcs, permanent escorts, shared rally and victory rules.
The drill ends at 90 seconds if the ark survives, even with remaining hostiles.

Drill mounts cover 240° centered outward (port −Y, starboard +Y). The selected
fitted mount shows a subtle outline at its actual upgraded range; `coverageFor`
drives both presentation and acquisition. Inclusive angle/range boundaries apply
to priority targets too. Fore/aft overlap is intentional.

Buy a three-fighter wing for 85 salvage, then use its four sector buttons to
scramble after departure. One order commits the entire wing: 2s launching, 18s
sortie, physical return to the stern, 10s rearming, ready. Only sortie craft fire.
Sector assignments stay fixed if local enemies disappear; the timed sortie ends
rather than following a disappearing target. Craft engage within 180 units of
that sector, independently of turret priority. Survivors retain damage. Lost
fighters never regenerate: replacing missing craft costs 30 each while ready.
Ready, flying and rearming craft share nine slots with guardians; losses free
slots. A completely lost wing remains a replaceable empty bay entry.

Guardians cost 105 and start assigned to port. Each has its own sector buttons
and visible ID/sector label. Port/starboard offsets are ±230 on Y; ahead/astern
are ±280 on X. Guardians travel at the existing 85 units/s, hold their assignment
between contacts, and acquire only enemies within 180 of the assigned position.
There is no shared rally in the drill. Existing nearby-escort enemy targeting
lets a screen absorb shots. Replacement guardians are paid new craft.

`src/scenarios.ts` defines the fixed encounters: eight port raiders at 10s,
four starboard bombers at 23s, three port armored craft at 49s, nine ahead
raiders at 52s. Warnings give direction, class, count and time until first
arrival. Starting salvage is 300 with no free equipment. Existing weapon,
income, clearance reward, repair and Aegis values are retained. All numbers are
provisional owner-playtest tuning. Model-level pause/focus/end guards stop
combat, timers and economy commands; DOM buttons provide keyboard/touch orders.

Reproduce the comparisons with `bun test games/gateward/tests/drill.test.ts`.
The test prints a table and repeats each run for determinism. Baseline buys
nothing. Both defenses fit port mount 1 rail and starboard mount 5 flak; wings
buy one wing and attempt port launches at 7s/42s and ahead at 75s, while guardians
buy one guardian and redirect it to starboard at 18s. Neither spends earned
salvage, repairs, pulses or upgrades. Observed outcomes:

| Strategy | Result/time | Hull | Kills | Escort losses | Launches/orders | Salvage |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| No intervention | Lost / 37s | 0 | 0 | 0 | 0 / 0 | 344 |
| Wing defense | Lost / 72s | 0 | 17 | 3 | 2 / 2 | 395 |
| Guardian screen | Won / 90s | 191 | 24 | 1 | 0 / 1 | 568 |

The port wing buys time but leaves the bomber approach exposed. Reassigning a
guardian to starboard screens that approach while the rail covers port. These
are limited scripted comparisons, not proof of balance or enjoyable feel.
Same-equipment controls isolate the orders: holding the purchased wing ready
loses at 69s with 14 kills, versus 72s and 17 kills after launching. Keeping the
guardian on port loses at 77s with 20 kills; the single starboard reassignment
survives with 24 kills. The unarmed baseline is a simulation control; the browser
requires at least one defense before departure.
Hardware touch/controller checks and owner playtesting remain separate gates.

## Systems Lab (phase 2, opt-in)

Choose **Systems Lab** in the briefing, pause menu or result, or open
`?mode=systems`. This provisional experiment uses the 90-second drill encounters
while ship systems are developed. Complete its actual 1.08 km route, resolve all
scheduled contacts, and survive at least 90 seconds to win. Engine power changes
the arrival time; elapsed time alone cannot complete the route. Full voyage and
Escort Drill retain their original rules. The later Systems Trial will have its
own encounters and an explicit deadline.

The ark starts with 240 of 360 energy shield HP. Hostile rounds hit escorts first,
then consume shield charge, then damage hull with any overflow. Default recharge
is 8 HP/s after three simulation seconds without a positive-damage ark hit. Fitting,
pause/focus loss and results freeze recharge. A depleted shield must recharge;
it never instantly restores. The blue charge bar and brief blue/amber impact
shell show energy shields; the green Aegis shell shows its separate five-second
emergency protection. Aegis still clears enemy rounds and pushes nearby enemies,
reduces only hull overflow by 80%, and never refills energy shields.

The reactor always allocates ten integer units between engines, weapons and
shields. Start at 4/4/2; choose a preset or select donor/recipient systems and
transfer one unit. Controls work with native keyboard activation, pointer and
simulated touch. Fitting permits planning; pause, focus loss and results reject
changes. Restart restores 4/4/2, charge and route progress.

| Preset | Engines / weapons / shields | Speed | Ark cadence | Recharge |
| --- | --- | --- | --- | --- |
| Balanced | 4 / 4 / 2 | 12 m/s | 1.0× | 8 HP/s |
| Engines | 6 / 2 / 2 | 18 m/s | 0.5× | 8 HP/s |
| Weapons | 2 / 6 / 2 | 6 m/s | 1.5× | 8 HP/s |
| Shields | 2 / 2 / 6 | 6 m/s | 0.5× | 24 HP/s |

Output curves are linear tuning constants: 3 m/s per engine unit, 0.25× reload
progress per weapon unit (maximum 2.5×), and 4 HP/s per shield unit. Zero engine
power stops progress while combat continues; zero weapons freezes ark reload
progress and firing; zero shields stops recharge. Reallocation never grants
instant charge or reload progress. Escort reactors and weapon damage stay
independent. The engineering panel's travel ETA excludes combat clearance.
Navigation beacons, gate position, route percentage and drive plumes share the
same actual distance/speed. Reduced motion retains physical route progress.

Sensors start at 100 integrity. At 50 or more, they detect contacts at 760m and
classify them at 640m; below 50, those ranges fall to 330m and 230m. At zero,
nearby defense still acquires contacts within 200m, with no classification.
Only classified contacts provide class/count/arrival hints. Unknown detections
show their direction and a question mark; undetected craft have no radar arrows,
labels or health readout, but their physical models remain visible. The next
scheduled approach is modeled beyond its spawn radius at that class's closing
speed so healthy sensors give advance warning. This is a tactical prototype,
not a generalized fog-of-war or line-of-sight system.

Ark turret acquisition and missile guidance respect sensor range. Missiles
already flying continue ballistically while a lock is out of range and can
resume guidance after acquisition recovers. Independent escort self-defense
continues. A stale priority lock drops as soon as damage removes acquisition.

Systems-mode bombers fire amber array-seeking rounds. Escort interception
consumes a round; shield absorption protects both hull and sensors. Overflow
damages the array by up to 35 integrity per round, proportional to the fraction
that penetrated the shield. Aegis mitigates only hull damage; its round-clearing
pulse can prevent disruption. No ordinary round or random event damages sensors.
Repair Sensors / **S** spends 70 salvage to restore 100 integrity with an
18-second cooldown, competing with hull repairs and new defenses. Sensor damage
does not heal on its own; paused, unfocused and ended runs freeze repair timers
and reject commands. Full voyage and Escort Drill retain their previous intel
and targeting rules.

Interdiction / **I** previews a single field after departure. Choose Ahead, Port
or Starboard, tap/click the battlefield to aim, or use arrow keys while the
canvas is focused (up/down ahead/astern; left/right port/starboard, 20m per press).
**Enter** or **Place field** confirms; **Esc** cancels. A tap only updates the
preview. Green marks a valid position, red an invalid one; the outer ring shows
the 450m placement range. Orbit drags, pinches and pointer cancellation never
confirm placement. Pause, focus loss, restart and result transitions discard it.

A field costs 90 salvage, has a 110m radius, lasts 30 simulation seconds and has a
40-second cooldown. Only one can be active. Its circle must clear the ark and
hostiles at deployment, stay within 450m and start ahead/beside the ark (X ≥ −50m).
The field stays at its deployment point along the route, so it drifts aft by the
ark's actual distance traveled. It expires early once more than 650m astern.
Reduced motion keeps this physical movement. Friendly fire and escort movement
pass through; hostile firing lines and already flying rounds are blocked.

Hostiles choose a stable side and tangent/arc waypoints around the field, then
resume their approach once clear. **DETOUR** identifies detected craft being
redirected. A hostile targeting an escort inside the field waits at the boundary
until the target emerges or the temporary field expires. During detours, movement
accounts for ark drift in the field's fixed frame, including slow ships passed
by fast engines; position changes remain bounded. New arrivals covered by a
field enter farther out on their original bearing, before first appearing.
Expiry clears navigation state. Intercept effects preserve the round's actual
presented trajectory while gameplay geometry remains on the 2D plane.

`bun test games/gateward/tests/interdiction.test.ts` compares the same unarmed,
stationary-ark approach with and without a field at (300, 0). A hostile starts at
(600, 0), with no escorts. The field changes its route and delays its first shot:

| Hostile | First shot without / with field | Lateral offset at 15s without / with |
| --- | --- | --- |
| Raider | 7.82s / 9.07s | 0m / 76.17m |
| Bomber | 6.67s / 10.25s | 0m / 136.32m |

Both detours rejoin before 15s while the field remains active. These deterministic
examples demonstrate path shaping and blocked engagement, not feel or balance.

Sound effects use local Web Audio synthesis: flak reports, railgun cracks,
missile exhaust, escort fire, hull impacts, explosions, contact/clear signals,
Aegis, repairs, departure and results. Sound unlocks on the first pointer or
keyboard interaction. **Sound on/off** toggles a session-only mute; restart keeps
that choice. Pause, hidden tabs and focus loss cut active effects; resuming never
replays missed sounds. Simultaneous cues are grouped and rate/voice limited at
both simulation speeds. Audio is optional when browser playback is unavailable.
