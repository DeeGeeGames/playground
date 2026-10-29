# Dreadwake · Capital Combat Alpha 01

An isometric starship combat game about committing a heavy cruiser to a slow turn,
keeping two broadside arrays working, and timing defenses against incoming volleys.
Break eight hostile ships across three contacts in the Lyra Passage.

Open `games/dreadwake/` through the launcher. The alpha replaces the original deck-like
placeholders with closed pressure hulls, split prows, separate drive nacelles,
armored rail arrays, maneuvering jets, and distinct enemy silhouettes. The setting
uses a cached procedural nebula and gas giant, parallax stars, unpowered wrecks,
projectile trails, impact sparks, and expanding explosion fronts. All art and sound
are created in code, with no external assets or network services.

| Action | Keyboard / pointer | Touch |
| --- | --- | --- |
| Adjust persistent throttle | Hold W/S or up/down | Hold +/− |
| Set neutral; coast to a stop | X | Neutral |
| Turn | Hold A/D or left/right | Hold turn arrows |
| Port / starboard broadside | Hold Q/E | Hold either array; simultaneous touches supported |
| Armor lock | Hold Space | Hold Armor lock |
| Aegis shield pulse | Tap F | Tap Aegis pulse |
| Designate priority target | Click a hostile; R cycles | Tap a hostile |
| Clear priority target | Click empty space, Clear, or cycle past the last target | Tap empty space |
| Pause / controls | Escape | Pause |
| Mute / unmute | Sound button | Sound button |

## Combat and handling

Throttle stays set after release, including reverse (limited to 35%). Full thrust
is 86 world units/second. The drive takes several seconds to answer; velocity lags
behind heading through a turn. Turn rate builds to 13.8 degrees/second over two
seconds and unwinds gradually. Neutral changes the engine order without cancelling
momentum. The HUD reports signed forward speed separately from commanded throttle.

Each array fires six 58-damage rounds, 0.14 seconds apart, and reloads independently
in 7.5 seconds. Guns acquire within 690 units and 30 degrees either side of the beam.
They lead target motion but cannot fire forward or aft. Designating a target makes
it the preferred solution only while it is inside that array's arc; otherwise the
nearest valid hostile is selected. A committed salvo retains its target even if
you change priority; if the target dies, the remaining guns fire abeam. You can fire
without a solution and miss. Holding an array repeats when ready.

Armor lock reduces incoming damage by 65%, lowers drive and turn rate, slows reload
to 45%, and prevents new salvos. Committed salvos finish. Aegis is a separate active
choice: 85% damage reduction for three seconds, with an 18-second cooldown from
activation, and no movement or weapon penalty. Hold does not automatically retrigger
Aegis; release and press again once charged. The stronger protection applies when
both defenses are active; reductions do not stack. Both protect against projectile
and hull-contact damage. The capacitor and button show remaining uptime or cooldown.

Red enemy tells commit a predicted firing solution for 1.8 seconds before launching.
Change course to dodge or time a defense to absorb the volley. Frigates orbit faster;
the final cruiser has more hull and heavier fire. Close hull contact pushes ships
apart and damages both. The radar and edge indicators reveal distant contacts.

Defeat eight ships over three contacts (2 / 3 / 3). There are six seconds to reposition
between contacts; advancing restores 20% hull. Lose at zero hull. The after-action
screen reports kills, time, salvos, and damage prevented by both defenses. Restart
resets the encounter, designation, and capacitor. There is no time limit, persistence,
ammo inventory, equipment progression, or collision with decorative debris.

## Runtime and validation

Simulation runs at 60 Hz independently of Canvas rendering; oriented swept collisions
resolve the nearest hull first. Responsive DOM controls keep the center clear in
portrait and compact landscape layouts, including 667×375. Reduced motion suppresses
camera shake. Focus loss and tab hiding pause simulation, silence audio, and clear
held inputs while preserving throttle. The lifecycle disposer releases listeners,
audio nodes, and animation. Only the workspace lifecycle helper is shared; no new
dependency or ECS change is involved.

Layered synthesized Web Audio provides engine/sub-drive hum, rail discharge, filtered
impact/explosion noise, shield activation and hits, incoming alerts, contact changes,
and capacitor-ready cues. It unlocks on a gesture, supports mute, silences on pause,
and degrades to a playable silent game if unavailable. A compressor limits overlapping
combat peaks. Browser measurements verify signal and silence; physical speakers and
subjective mix quality require separate listening.

From the workspace root, run `bun run check`, then `bun run preview`. Deterministic
checks cover handling, swept hits, independent salvos, a viable full-engagement
strategy, shield timing/hold behavior/non-stacking/contact protection, priority
fallback/committed targets/cycling, and projected picking at multiple viewports.
Production Playwright checks exercise keyboard and simulated multi-touch input,
audio output/mute/pause, focus loss, terminal/restart flows, and responsive layouts.
Physical touch hardware and owner acceptance of gameplay feel remain separate.
