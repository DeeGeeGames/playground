# Dreadwake · Capital Combat Alpha 01

An isometric starship combat game about committing a heavy cruiser to a slow turn,
coordinating rail broadsides, bow torpedoes, and point defense while timing defenses
against incoming volleys.
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
| Turn | Right-click to set heading; A/D or left/right cancels it | Hold turn arrows |
| Port / starboard broadside | Hold Q/E | Hold either array; simultaneous touches supported |
| Toggle both broadside crews: manual / auto | Tap G | Tap Broadside crews |
| Bow torpedo salvo | Tap T | Tap Bow torpedoes |
| Point defense | Always automatic | Always automatic |
| Armor lock | Hold Space | Hold Armor lock |
| Aegis shield pulse | Tap F | Tap Aegis pulse |
| Designate priority target | Click a hostile; R cycles | Tap a hostile |
| Clear priority target | Click empty space, Clear, or cycle past the last target | Tap empty space |
| Zoom in / out | Mouse wheel up / down over the battlefield | — |
| Pause / controls | Escape | Pause |
| Mute / unmute | Sound button | Sound button |

## Combat and handling

Throttle stays set after release, including reverse (limited to 35%). Full thrust
is 86 world units/second. The drive takes several seconds to answer; velocity lags
behind heading through a turn. Right-click heading orders retain the selected bearing until manual steering, pause, or restart. Turn rate builds to 13.8 degrees/second over two
seconds and unwinds gradually. A cyan dashed line and arrow show the ordered bearing while the order is active. Right-clicking also works over hostiles without changing the priority target. Left-clicking only selects or clears targets. Neutral changes the engine order without cancelling
momentum. The HUD reports signed forward speed separately from commanded throttle.

Each array fires six 58-damage rounds, 0.14 seconds apart, and reloads independently
in 7.5 seconds. Guns acquire within 690 units and 30 degrees either side of the beam.
They lead target motion but cannot fire forward or aft. Designating a target makes
it the preferred solution only while it is inside that array's arc; otherwise the
nearest valid hostile is selected. A committed salvo retains its target even if
you change priority; if the target dies, the remaining guns fire abeam. You can fire
without a solution and miss. Holding an array repeats when ready.

Broadside crews start in manual mode. Tap G or the crew button to order **both**
arrays to fire automatically whenever ready with a valid side solution. Each array
still chooses and reloads independently. Q/E still commit manual salvos, including
without a solution. Returning to manual prevents new automatic salvos; committed
salvos finish. Crew orders survive pause and contact changes, and reset on restart.

Bow torpedoes are a separate **manual** commitment: tap T to ripple three 72-damage
rounds at 0.22-second intervals, with a 14-second reload. Launch requires a live
hostile within 1,000 units and 60 degrees either side of the bow. Priority wins
inside this cone; otherwise the nearest valid hostile is used. Gold solution rings
and the torpedo panel show the current bow lock. The salvo keeps its initial target;
changing designation never redirects it. Rounds travel at 220 units/second, turn at
most 0.8 radians/second, expire after six seconds, and continue straight if their
target dies. They hit the nearest swept hull, so another hostile can intercept them.
Holding T does not repeat or queue a launch, including if the initial press had no
solution. Release and press again. These rounds can pressure a contact ahead of you
while the heavy side arrays reload, but a frigate survives one full torpedo salvo.

Point defense is **always automatic**. It intercepts one threatening hostile round
every 0.38 seconds within 240 units, prioritizing the earliest predicted hull hit
using relative motion. It ignores friendly rounds, expired rounds, flybys, and
rounds already inside the hull. Thin white tracers and sparks show interceptions;
the desktop panel and after-action screen count them. Its limited cadence thins
volleys while leaving evasion, armor lock, and Aegis useful. It remains active under
armor lock. There is no weapon selection cycle: all three systems operate together.

Armor lock reduces incoming damage by 65%, lowers drive and turn rate, slows reload
to 45%, and prevents new broadsides and torpedo salvos. Committed salvos finish.
Aegis is a separate active choice: 85% damage reduction for three seconds, with an 18-second cooldown from
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
screen reports kills, time, broadside and torpedo salvos, intercepted rounds, and
damage prevented by armor and shields. Restart resets the encounter, designation, and capacitor. There is no time limit, persistence,
ammo inventory, equipment progression, or collision with decorative debris.

## Runtime and validation

Simulation runs at 60 Hz independently of Canvas rendering; oriented swept collisions
resolve the nearest hull first. Responsive DOM controls keep the center clear in
portrait and compact landscape layouts, including 667×375. Reduced motion suppresses
camera shake. Focus loss and tab hiding pause simulation, silence audio, and clear
held inputs while preserving throttle. The lifecycle disposer releases listeners,
audio nodes, and animation. Only the workspace lifecycle helper is shared; no new
dependency or ECS change is involved.

Mouse wheel zoom stays centered on the cruiser, from 0.5× to 2.5× the responsive
default view. It preserves target picking and resets on restart. Zoom only responds
over the battlefield during play; Ctrl/Command-wheel retains browser zoom. Firing
arcs remain part of weapon acquisition, with solution rings and array-panel feedback
instead of cone overlays.

Layered synthesized Web Audio provides engine/sub-drive hum, rail discharge, filtered
impact/explosion noise, torpedo exhaust, point-defense bursts, shield activation
and hits, incoming alerts, contact changes,
and capacitor-ready cues. It unlocks on a gesture, supports mute, silences on pause,
and degrades to a playable silent game if unavailable. A compressor limits overlapping
combat peaks. Browser measurements verify signal and silence; physical speakers and
subjective mix quality require separate listening.

From the workspace root, run `bun run check`, then `bun run preview`. Deterministic
checks cover handling, swept hits, independent salvos, a viable full-engagement
strategy, shield timing/hold behavior/non-stacking/contact protection, priority
fallback/committed targets/cycling, auto-crew orders, torpedo locks/guidance/hold
behavior, threat prediction and interception limits, and projected picking at
multiple viewports.
Production Playwright checks exercise keyboard and simulated multi-touch input,
audio output/mute/pause, focus loss, terminal/restart flows, and responsive layouts.
Physical touch hardware and owner acceptance of gameplay feel remain separate.
