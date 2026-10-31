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
- Beam costs 125 salvage, reaches 300m and deals 48 damage per second before armor at balanced weapon power. It automatically tracks one eligible target; upgrades and weapon power scale sustained damage.
- Flak handles light ships; railguns ignore armor; homing missiles deal splash
  damage. All turrets turn toward their firing solution before firing automatically
  within 120° outward arcs in Full Voyage. Flak turns at 360°/s, beams at 180°/s, missiles at 120°/s,
  and railguns at 90°/s. Projectile barrels track the lead angle; beams track the
  contact directly. Turning continues during reload and freezes with zero weapon
  power, pause, or focus loss. Upgrade to level 3
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
- Space pauses immediately outside native button activation. Escape cancels a field
  preview first, then closes the inspector, then toggles pause. Tab and native
  button activation work for the command panel. Focus loss and hidden documents pause the running voyage. Pointer/touch
  commands use the same actions. Physical touch devices are separate acceptance.

The canvas fills the viewport without browser fullscreen. Survival, route, threat,
current reactor allocation and emergency commands remain visible in one compact
command console. Systems opens mounts; the current power button opens reactor
presets and transfers. The inspector expands above the same bar on desktop and
portrait screens, with a side layout on short landscape screens. Selecting a
mount or hostile opens its details; closing preserves selection and priority.
Mounts, Reactor, Escorts and Sensors remain available as tabs. Field placement
and selected Contact details appear contextually. Detailed
content scrolls internally. Menu pauses orders and contains sound, fullscreen,
reset view, simulation speed, help, restart and mode controls. In expanded fallback
mode, use the menu's Exit fullscreen button; Escape retains game navigation.

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
plane; simulation uses world coordinates without a physics engine, gameplay ECS,
or persistence migration.

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

The camera follows the ark along the voyage’s 2.52 km route at a balanced 12 m/s.
The ark advances through world space; the orthographic camera and its orbit
center follow it. Navigation beacons, the lattice, debris and Kepler Gate keep
fixed world positions. The ark stops at the gate even if combat continues.
Pausing freezes the simulation, and replay returns to departure. Reduced motion
disables decorative star parallax and engine flicker while physical travel remains.

`bun test games/gateward/tests` exercises economy, combat, escort losses, support
systems, failure, a complete salvage-funded victory, camera-aware picking,
orbital projection, resize, model hardpoints, and shield clearance. `bun run check` validates
the whole workspace. Production preview and owner judgment establish visual and
play-feel evidence separately from deterministic tests.

## Combat flight

Armored ships and flagships intercept a flank, turn onto parallel courses and
make repeated broadside runs. They gain ground, then ease aft rather than stop
at a range boundary. Each side battery covers a 100° arc; bow/stern targets wait
for the ship to turn. Visible side barrels and shot origins share the hull's
course heading. Heavy ships cruise at up to 40m/s (armored) or 36m/s (flagship),
so they can intercept even the ark's maximum 30m/s engine allocation.

Raiders and bombers continuously circle the ark or skirmish around nearby escorts,
with local separation between hostile craft. Raiders take close pot shots;
bombers stay farther out with array-seeking rounds. Friendly interceptors maneuver
around contacts during combat. Guardians retain their screening positions, and
wing sectors, launch/return/rearm phases and rally limits still apply. Ballistic
guns lead moving targets; weapon damage, reloads, rewards and economy are unchanged.

`src/flight.ts` owns shared heading-driven steering, braking, turn limits and
broadside geometry. Every active ship, projectile, field and effect stores a world
position. The ark moves along its route; camera movement has no gameplay effect.
Guardians match the ark's forward course at their screening stations while their
guns track contacts independently. Fighters use the same steering when launching,
forming up, fighting and returning to the moving stern. Wing phases, sector
assignments and local leashes are retained.

`src/space.ts` converts explicit local offsets (mount fittings, sector positions
and rally orders) into world targets. Those anchors travel with the ark; fields,
shots and effects remain independent once placed or launched. Incoming contacts
use scheduled bearing offsets only when they enter the world. Sensors, ranges,
interception, projectile sweeps and input picking use the same world positions.

Projectile speeds are muzzle speeds relative to the firing ship. A round inherits
its source's world velocity once and records its actual world firing origin.
Ballistic rounds are unaffected by later engine changes. Guided missiles retain
their inherited launch velocity and update their guidance separately. Barrels
track the relative-velocity firing solution and must align before firing; enemy
side banks also validate that solution against their broadside arc. Swept contact
checks account for moving ships and hulls. Damage, reloads and economy are unchanged.

`tests/flight.test.ts` covers intercepts and combat maneuvers. The additional
`tests/world-movement.test.ts` covers every friendly flight phase, moving-stern
recovery, translated encounters, late world orders/deployment, inherited ballistic
velocity, fixed fields, swept hull hits and close-field braking. Camera and
trajectory tests cover translated/rotated picking and world firing origins.
Strategy comparisons below remain reproducible simulation controls; production
browser evidence and owner judgment establish visual and flight-feel acceptance.

## Escort Drill

Choose **Escort Drill** in the briefing, pause menu or result, or open
`?mode=drill`. Restart retains the selected mode. Full voyage remains the default
with 120° outward arcs, permanent escorts and a shared rally. All modes include reactor
allocation, rechargeable shields, damageable sensors and interdiction by default.
The drill requires survival, its real 1.08 km route, and clearance of all four
contacts after at least 90 seconds. Engines can delay arrival; reaching the gate
early does not skip contacts. Full voyage uses a 2.52 km route and at least 210s.

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
raiders at 52s. Healthy sensors provide direction, class, count and time until
first arrival; damaged arrays reduce warning and targeting range. Starting salvage
is 300 with no free equipment. Existing weapon,
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
| No intervention | Lost / 42s | 0 | 0 | 0 | 0 / 0 | 350 |
| Wing defense | Won / 90s | 949 | 24 | 2 | 2 / 2 | 588 |
| Guardian screen | Won / 90s | 1134 | 24 | 0 | 0 / 1 | 568 |

With moving attackers, both equipped scripts now clear all contacts. Launching
the wing preserves more hull than holding it in reserve. Guardian reassignment
also changes hull survival and escort losses with the same fitting. These orders
affect outcomes without guaranteeing that an old timing remains optimal.
These limited controls do not establish balance or enjoyable feel. The tests
repeat each run and compare identical equipment with orders held.
The unarmed baseline is a simulation control; the browser requires at least one
defense before departure.
Physical input and owner play-feel checks remain separate from simulation evidence.

## Ship systems and Systems Trial

Choose **Systems Trial** in the briefing, pause menu or result, or open
`?mode=systems`. Fit a mixed defense with 500 salvage and complete the actual
1.44 km route while resolving all required contacts **before 155 seconds**.
Balanced power takes about 120 seconds of flight; fast engines can arrive early,
but must still resolve the later contacts. A tick ending exactly at the deadline
loses. Hull destruction also loses. Time alone cannot complete the route.
These systems are active in every mode, including the default Full Voyage.
`?mode=systems` selects the short encounter schedule; it does not enable features.
There is no systems feature flag or opt-in. Mode choice changes encounters, route
length, escort control style and deadline, while reactor/shields/sensors/fields
remain available throughout.

The five fixed encounters are port raiders at 8s, starboard bombers at 26s,
port armored craft at 58s, ahead raiders at 72s and astern bombers at 98s.
Sensors still gate what the live feed reveals. The mission strip shows elapsed
time, deadline, travel ETA and arrival/clearance status. Reactor controls move
to the top of the command panel during flight. Results explain hull destruction,
missed arrival, unresolved contacts at the deadline, or successful clearance.
They record elapsed/distance/ETA, hull/shield, absorption, power changes,
contact groups/kills, sensor impairments/repairs, fields/detours and escort losses.

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

Bombers fire amber array-seeking rounds. Escort interception
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
The field keeps its absolute world position as the ark passes it, so its
position relative to the ark moves aft by actual route travel. It expires early once more than 650m astern.
Reduced motion keeps this physical movement. Friendly fire and escort movement
pass through; hostile firing lines and already flying rounds are blocked.

Hostiles choose a stable side and tangent/arc waypoints around the field, then
resume their approach once clear. **DETOUR** identifies detected craft being
redirected. A hostile targeting an escort inside the field waits at the boundary
until the target emerges or the temporary field expires. World-space detours
feed the same bounded steering as open flight, including full braking when a
new field is placed close to an approaching hull; there is no ark-drift compensation. New arrivals covered by a
field enter farther out on their original bearing, before first appearing.
Expiry clears navigation state. Intercept effects preserve the round's actual
presented trajectory while gameplay geometry remains on the 2D plane.

`bun test games/gateward/tests/interdiction.test.ts` compares the same unarmed,
stationary-ark encounter with and without a field at (300, 0). A hostile starts at
(600, 0), with no escorts. The field changes the flight path and blocks firing
through its boundary. The checks cover all four hostile classes at 0, 3, 12 and
30m/s ark speeds, verifying clearance, bounded movement, a stable detour side,
and release back to normal flight. Unobstructed craft now maneuver as well, so
these comparisons measure path differences rather than deviation from a straight
line. These deterministic checks demonstrate path shaping, not feel or balance.

### Reproduce the integrated comparisons

Run `bun games/gateward/tests/trial-strategy.ts` for complete JSON summaries, or
`bun test games/gateward/tests/systems-trial.test.ts` for repeated full-state
determinism and arrival/deadline/lifecycle assertions.

Every strategy starts with port mount **1 rail**, starboard mount **5 flak**, one
Guardian and one interceptor wing (380 of 500 salvage). The script attempts these
orders on the first fixed step at or after each time: launch port at 7s, assign
Guardian starboard at 23s, build rail on mount **8** at 45s, launch port at 54s,
assign Guardian ahead at 75s and astern at 98s if it survives. Hull repair is
attempted below 800 hull and sensor repair below 55 integrity, subject to costs
and cooldowns. Repair requirements vary with flight paths and targeting. These
are scripted controls; human input timing and physical-device feel remain separate.

The field comparison adds one ahead field at (300, 0) at 70s. The reallocation
comparison starts with weapon priority, then switches to balanced at 50s. The
other strategies retain their preset. Rounded outcomes:

| Strategy | Result / time | Distance | Kills | Hull / shield |
| --- | --- | ---: | ---: | ---: |
| Balanced | Won / 120.0s | 1440m | 30 | 1200 / 360 |
| Engine priority | Won / 107.8s | 1440m | 30 | 1000 / 0 |
| Weapon priority | Deadline / 155.0s | 930m | 30 | 1200 / 360 |
| Shield priority | Deadline / 155.0s | 930m | 30 | 1015 / 360 |
| Weapons → balanced at 50s | Won / 145.0s | 1440m | 30 | 1200 / 360 |
| Balanced + field at 70s | Won / 120.0s | 1440m | 30 | 1200 / 360 |

| Strategy | Shield absorbed | Power changes | Sensor impairments / repairs | Fields / redirected | Escort losses |
| --- | ---: | ---: | ---: | ---: | ---: |
| Balanced | 295 | 0 | 0 / 0 | 0 / 0 | 2 |
| Engine priority | 555 | 1 | 0 / 0 | 0 / 0 | 3 |
| Weapon priority | 177 | 1 | 0 / 0 | 0 / 0 | 3 |
| Shield priority | 809 | 1 | 0 / 0 | 0 / 0 | 4 |
| Weapons → balanced at 50s | 256 | 2 | 0 / 0 | 0 / 0 | 3 |
| Balanced + field at 70s | 267 | 0 | 0 / 0 | 1 / 12 | 2 |

Engine priority arrives early and resolves all contacts with less hull remaining.
Static weapon/shield priority travels too slowly; switching weapon priority back
to balanced at 50s makes the deadline with the same fitting. The field redirects
12 approaches and reduces shield damage by 28 while preserving all 30 kills.
These equipped scripts avoid sensor impairment in this sample. Focused
bomber/shield tests exercise the exact absorption, impairment and recovery rules.
Allocation changes warning and defensive opportunities rather than the scheduled clock.
These examples establish explainable behavior differences, not final balance.

Owner follow-up enables systems in every mode for rapid prototype iteration.
Assess pacing, readability, touch hardware, audio and decision feel separately.
The scripted runs do not establish final balance.

Sound effects use local Web Audio synthesis: flak reports, railgun cracks,
missile exhaust, escort fire, hull impacts, explosions, contact/clear signals,
Aegis, repairs, departure and results. Sound unlocks on the first pointer or
keyboard interaction. **Sound on/off** toggles a session-only mute; restart keeps
that choice. Pause, hidden tabs and focus loss cut active effects; resuming never
replays missed sounds. Simultaneous cues are grouped and rate/voice limited at
both simulation speeds. Audio is optional when browser playback is unavailable.

## Full Voyage directional coverage (#52)

Full Voyage uses **120° outward coverage** by owner direction. Open
`games/gateward/` and prepare as usual: there is no coverage URL flag.
Restart and returning from another mode retain the voyage default. Escort Drill
and Systems Trial keep their existing 240° arcs and escort rules.

The mount inspector identifies the mode and arc. A selected fitted mount shows
its temporary coverage outline at the upgraded range. Port mounts 1–4 protect
port; starboard mounts 5–8 protect starboard. At 120°, there are fore/aft blind
spots rather than the overlap of the earlier 240° trial. The priority and automatic
target paths share coverage eligibility; an out-of-arc priority cannot bypass it.
The selected mount and contact inspector explain when its priority is outside
range or arc. Voyage rally and permanent escorts remain unchanged.

Reproduce deterministic placement comparisons and rerun #51's spending policy:

```sh
bun games/gateward/scripts/coverage-comparison.ts
bun test games/gateward/tests/voyage-coverage.test.ts
```

The comparison script retains explicit 360° and 240° simulation controls alongside
120°; these are analysis inputs, not playable URL options. The mirrored fixture
uses Full Voyage rules with two simultaneous bomber arrivals 340m off either
flank, 30 seconds, two level-one railguns (230 salvage), and no later spending or
support orders. Port fitting uses mounts 1/4, starboard 5/8, split 1/5. This is not
a playable mode. Travel and flight remain active, so mirrored attacks can yield
asymmetric damage.

| Arc | Fitting | Attack flank | Minimum shield | Kills / hull |
| --- | --- | --- | ---: | --- |
| 360° | Any of the three | Either | 240 | 2 / 1200 |
| 240° | Port | Starboard | 137.47 | 2 / 1200 |
| 240° | Starboard | Port | 152.93 | 2 / 1200 |
| 120° | Port | Port | 240 | 2 / 1200 |
| 120° | Port | Starboard | 35.87 | 1 / 1200 |
| 120° | Starboard | Port | 93.20 | 2 / 1200 |
| 120° | Starboard | Starboard | 240 | 2 / 1200 |
| 120° | Split | Either | 240 | 2 / 1200 |

Moving equivalent firepower to the attacked flank or splitting it avoids shield
loss in this fixture. It does not establish difficulty or feel. For a production
playtest, compare two railguns on 1/4 against 1/5 and select each mount to inspect
coverage. Keep spending/support orders equal. The playable voyage retains its
original six waves.

The historical #51 spending policy wins at 360° and 240° at 210.017s with 86 kills,
1200 minimum/final hull, 100 minimum sensors, and zero impairments. Both spend
1835 salvage after the same 265-salvage opening fitting; minimum shield is 166.33
and 240 respectively. At 120°, that same policy loses at 189.333s with 69 kills,
zero final hull, zero minimum shield/sensors and one sensor impairment. It spends
1292 salvage after the same opening; it earns less and ends earlier. This is a
balance signal from one strategy. Weapon stats, economy, and attack schedules
were not rebalanced to restore its previous victory.

The owner selected 120° and removal of the flag. Physical devices and owner
acceptance of the resulting combat feel remain separate from this configuration
decision and from deterministic/browser evidence.

Verification for the 120° default: `bun run check` passed (429 tests,
typecheck, lint, build). Production Chromium checks at 1380×840, 390×844 and
844×390 covered all eight mount keys, pointer/emulated-touch panel selection,
493m upgraded range, travel, orbit/zoom, resize, pause/restart and mode defaults.
Old coverage query parameters had no effect on the voyage's 120° setting. The
pass reported zero page errors. Browser emulation does not establish physical
touch/controller behavior or owner acceptance of combat feel.

### Automatic target preferences

Eligible player focus always wins. Otherwise flak prefers classified raiders;
railguns prefer classified armored ships or flagships equally. Missiles prefer
the aim point with the most other live, detected contacts strictly within the
existing 85m splash radius. Splash neighbours may be outside the mount's firing
arc/range, but the aim point must satisfy sensors, upgraded range and coverage.
Unclassified contacts receive no class bonus. Equal scores use nearest distance,
then lowest ID; no preferred target falls back to nearest. Beam stays nearest.
Turning, power, firing and damage rules are unchanged.

Issue #53 reran #51's unchanged spending control at 60Hz (simulation evidence,
not owner acceptance of feel):

| Coverage | Before | Role preferences |
| --- | --- | --- |
| 120° | Lost at 189.33s, 69 kills | Lost at 194.93s, 75 kills |
| 240° | Won at 210.02s, 86 kills, minimum shield 240 | Won at 210.02s, 86 kills, minimum shield 170.13 |
| 360° | Won at 210.02s, 86 kills, minimum shield 166.33 | Won at 210.02s, 86 kills, minimum shield 167 |

Both 120° runs lost all hull and sensors; both wider-coverage runs retained full
hull and sensors. These results isolate acquisition; no budget or combat tuning
was changed.
