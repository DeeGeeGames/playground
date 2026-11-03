# Gateward

Gateward is a browser-only reverse tower defense prototype: build a convoy,
launch it through a defense, watch the build work, then refit. Open
`games/gateward/` from the launcher. Query parameters do not choose a mode.
The browser uses `createConvoyState`; `createState` remains the isolated legacy
combat/scenario fixture entry point for existing machinery and tests.

## Passage rules

Start with **650 salvage**, a 1200-hull ark and two blank turret platforms.
Scout the next passage in the Fit drawer, choose weapons and formation, then
press **Launch passage**. At least one fitted gun is required. Building freezes
all simulation time, travel, income, repairs, recharge and cooldowns. No enemies
spawn until explicit launch.

There are three **45-second** combat passages:

1. Port battery: one armored ship to port and three pursuing aft fighters.
2. Crossfire: two starboard armored ships and two port bombers.
3. Gate approach: a heavy flagship ahead, two aft fighters and a starboard bomber.

Heavy defenders hold world positions while fighters and bombers intercept the convoy.
The convoy automatically travels the 5.76 km route at a fixed cruise speed
(about 42.67 m/s). Four reactor units are reserved for cruise and cannot be transferred; engine damage cannot stall it. The remaining six units can be split between weapons and shields. Weapons,
shields and subsystem damage retain their existing combat effects. Passage
completion depends on surviving the bounded travel period, not killing every
hostile. Survivors and projectiles are left behind at the exit. The next defense
never deploys during fitting. The final passage wins on arrival; zero hull loses,
including when destruction coincides with an exit.

After the first two passages, gain **200 salvage and 120 hull** (capped at 1200).
All mounts, engine, sensors and generator regain full integrity; platform chassis
recover to full hull for free. Destroyed platform weapons remain lost. Existing
shield charge and cooldowns carry over and freeze during fitting. No passive
salvage or kill-all bonus applies; kills still earn existing enemy salvage rewards.
Restart creates a fresh build, budget, platforms and passage sequence.

## Fitting and formation

The ark retains eight mounts: port 1–4 and starboard 5–8. Each platform has two
mounts: **P1 uses 9–10; P2 uses 11–12**. Select any mount in the Fit drawer or on
the battlefield. Fit flak (75), rail (115), beam (125) or missile (135); upgrade
twice with the existing 80% / 120% base-price upgrade costs. Selling during
fitting refunds **100% of the weapon and upgrades**. Fitting, selling, upgrading
and formation changes are rejected during combat, pause and loss of focus.

Choose each platform's Fore, Aft, Port or Starboard formation in Fit. Slots hold
one platform each; choosing an occupied slot **swaps the occupants**, preserving
their identities, weapons and upgrades. The platforms follow fixed ark-relative
stations automatically: fore/aft 1120 m, port/starboard 920 m. Their guns face
outward from that station with **120° arcs**, while ark guns face their flank.
Real origins, range, target eligibility and arcs use these positions. Select a
gun to see coverage; the selected platform chassis is highlighted. Guns turn
before firing. Rail ignores armor, flak favors fighters, missiles provide splash,
and beams deal sustained instant damage reduced by armor.

Each platform has **240 hull**, no shield and no combat repair. Hostiles may aim
at a platform closer than the ark; nearby escorts retain their existing targeting
precedence. Incoming rounds collide with platform chassis. At zero hull its two
guns are destroyed without refund and stop firing; the chassis recovers at the
next build phase but replacement weapons cost salvage. A port rail platform and
aft flak platform are one plausible first build; ark flank guns and other weapon
choices remain useful. Balance and feel are provisional.

## Controls and secondary systems

Mouse/touch: use Fit to select mounts, buy/sell/upgrade, choose formation and
launch. Left-drag, right-drag or touch-drag orbits; wheel or pinch zooms. Reset view restores
the camera. Keyboard: Tab/Shift-Tab and Enter operate every build and formation
control; 1–8 select ark mounts. All twelve mounts have accessible named buttons.
Space pauses; Escape cancels placement, closes the drawer, then pauses.
T opens radar; C opens escort coverage; Q activates Aegis; E assigns/releases a
hull repair crew; S does the same for sensors; I opens interdiction placement.

Standard controller: Y opens/closes the last drawer (Fit initially); bumpers
switch drawers; D-pad up/down moves focus; left/right changes a formation or
other selected dropdown; A activates; B returns; Start pauses. Close Fit with B
before navigating to Launch in the main command controls. Slots can also be
changed by A on their dropdown. A newly connected/refocused pad must release
held buttons before issuing commands.

Escorts, radar coverage, reactor transfers, shields, repair crews, priority
selection, Aegis and interdiction remain optional tools in their existing drawers.
The core convoy automatically travels and fires without these orders. Four crews
can repair ark hull/equipment during combat; they cannot repair platform hull.
Pause, hidden document and focus loss suspend combat; restart and results keep
the existing lifecycle behavior. Sound, fullscreen and 2× speed remain in Menu.

## Validation and assumptions

Simulation remains browser independent; Three.js and DOM display state and send
orders. The convoy uses existing procedural turret visuals and simple procedural
chassis, without new external assets. Legacy combat fixtures retain their original
rules so existing subsystem and weapon regression tests remain meaningful.

Run `bun install --frozen-lockfile`, then `bun run check`. Convoy tests protect
phase freezing, explicit launch, progression with surviving enemies and zero
engine power, purchasing/refunds, formation ownership/coverage, automatic fire,
platform loss/recovery and defeat precedence. Browser journeys and simulated
controller input do not establish physical controller/touch feel, hardware
performance, speaker output, balance or owner acceptance.
