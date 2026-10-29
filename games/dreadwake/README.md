# Dreadwake · Combat prototype 01

An isometric capital-ship prototype about planning a slow turn, keeping both
batteries working, and choosing whether to evade or absorb incoming fire.
Open `games/dreadwake/` through the launcher. Placeholder geometry is intentional.

| Action | Keyboard | On screen |
| --- | --- | --- |
| Adjust persistent throttle | Hold W/S or up/down | Hold +/− |
| Set neutral; coast to a stop | X | Neutral |
| Rudder | Hold A/D or left/right | Hold turn arrows |
| Port / starboard broadside | Hold Q/E | Hold the battery |
| Brace | Hold Space | Hold Brace |
| Pause / controls | Escape | Pause |

Throttle stays set after release, including astern (limited to 35%). Full ahead
is 86 world units/second. The drive takes several seconds to answer, and velocity
lags behind heading during turns. Rudder builds to 13.8 degrees/second over two
seconds and unwinds gradually. Neutral sets an engine order, not an instant brake.

Each battery fires six 58-damage shells, 0.14 seconds apart, with independent
7.5-second reloads. Guns acquire the nearest enemy within 690 units and 30 degrees
either side of the beam. They predict target motion but cannot fire forward or
aft. A salvo keeps its selected target; if it dies, remaining guns fire abeam.
You can fire without a solution and miss. Holding a battery repeats when ready.

Brace reduces shell damage by 65%, lowers engine power and turn rate, slows
reload to 45%, and prevents new salvos. Committed salvos finish. Red enemy tells
lock their predicted firing solution for 1.8 seconds before launching; change
course to dodge or brace to absorb. Enemy frigates orbit faster; the final cruiser
has more hull and a heavier volley. Enemy guns track the firing solution freely.
Close hull contact pushes ships apart and causes continuous damage to both.

Defeat eight ships over three contacts (2 / 3 / 3). Six seconds between contacts
allow repositioning; advancing restores 20% hull. Lose at zero hull. There is no
time limit, persistence, ammo inventory, equipment progression, obstacle collision,
or physics interaction with decorative debris. Restart resets the engagement.

Simulation runs at 60 Hz outside the renderer; oriented swept hull collisions
resolve the nearest hit. Canvas draws raised isometric placeholders, side arcs,
firing solutions, velocity dots, radar, off-screen contacts, recoil and impacts.
Procedural Web Audio starts on a gesture; mute and pause silence it. Reduced
motion disables camera shake. Focus loss pauses and clears held inputs while
preserving throttle. The lifecycle disposer releases listeners, audio and animation.
Only the workspace lifecycle helper is shared; no new dependency or ECS change.

From the workspace root, run `bun run check`, then `bun run preview`. Mechanics
tests include a control-only full-engagement strategy. Browser input emulation,
physical-device checks, speaker quality and owner acceptance of feel are separate.
