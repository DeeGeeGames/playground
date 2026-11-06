# Gateward

Gateward is a browser-only reverse tower defense demo: build a convoy,
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

The default **Kepler** operation has three **45-second** combat passages:

1. Port battery: one armored ship and three fighters entering ahead.
2. Crossfire: two starboard armored ships and three port bombers.
3. Gate approach: a flagship, armored escort, four bombers and two fighters.

Defenders enter in forward formations; capital ships maneuver into attack positions while fighters and bombers intercept the convoy.
The convoy automatically travels the 5.76 km route at a fixed cruise speed
(about 42.67 m/s). Four reactor units are reserved for cruise and cannot be transferred; engine damage cannot stall it. The remaining six units can be split between weapons and shields. Weapons,
shields and subsystem damage retain their existing combat effects. Passage
completion depends on surviving the bounded travel period, not killing every
hostile. Survivors and projectiles are left behind at the exit. The next defense
never deploys during fitting. The final passage wins on arrival; zero hull loses,
including when destruction coincides with an exit.

After each non-final passage, gain **200 salvage and 120 hull** (capped at 1200).
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

Choose a position on the six-slot inner or eight-slot middle ring in Fit. Slots hold
one platform each; choosing an occupied slot **swaps the occupants**, preserving
their identities, weapons and upgrades. The platforms follow fixed ark-relative
stations automatically. Inner and middle rings offer different coverage and exposure. Their guns face
outward from that station with **120° arcs**, while ark guns face their flank.
Real origins, range, target eligibility and arcs use these positions. Select a
gun to see coverage; the selected platform chassis is highlighted. Guns turn
before firing. Rail ignores armor, flak favors fighters, missiles provide splash,
and beams deal sustained instant damage reduced by armor.

Starting frigates have **240 hull**; additional corvettes, frigates and cruisers have
160, 240 and 400 hull, and one, two and four mounts respectively. New hulls cost
120, 220 and 380 salvage before weapons. Platforms have no shield or combat repair. Hostiles may aim
at a platform closer than the ark; nearby escorts retain their existing targeting
precedence. Incoming rounds collide with platform chassis. At zero hull all its
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
orders. The convoy uses procedural turret visuals and distinct convoy
spacecraft, without new external assets. Legacy combat fixtures retain their original
rules so existing subsystem and weapon regression tests remain meaningful.

Run `bun install --frozen-lockfile`, then `bun run check`. Convoy tests protect
phase freezing, explicit launch, progression with surviving enemies and zero
engine power, purchasing/refunds, formation ownership/coverage, automatic fire,
platform loss/recovery and defeat precedence. Browser journeys and simulated
controller input do not establish physical controller/touch feel, hardware
performance, speaker output, balance or owner acceptance.

## Passage debriefs

The Fit drawer opens on preparation and after each surviving passage. A persistent
report records ark hull before and after combat, destroyed hostiles, combat salvage,
disabled platforms and lost weapons before automatic recovery occurs. Refit supply
and actual hull recovery are listed separately. Combat salvage counts kill rewards,
independent of spending on escorts during a passage. The final screen retains each
passage report, with optional ship-system statistics under an expandable section.

## Operations and local records

Choose an operation before preparing the convoy. Kepler has three passages over
5.76 km; Long Wake has five over 9.60 km, alternating fighter screens, armored
columns and bomber corridors; Iron Crossing has six over 11.52 km and ends with
two flagships. Every operation starts with the same budget and blank fleet.
Cruise speed, 45-second combat passages and refit rules remain consistent.

All operations are available immediately. Successful crossings and best surviving
ark hull are stored per operation on the current device using the
`gateward.operation.v1.*` namespace. These are completion records, not mid-run
saves. Missing, corrupt or unavailable storage does not prevent play. Retry keeps
the chosen operation; the results screen also returns to operation selection.

## Demo presentation and first crossing

The operation screen offers three optional **starting doctrines**, purchased from
that operation's normal 650 salvage budget: Balanced screen (505), Iron broadside
(610), and Forward spearhead (590). Custom starts with the original blank convoy.
A doctrine is only applied to an untouched initial fitting state; it cannot
silently replace a customized build. Every purchased weapon retains normal full
refit refunds. Scouting diagrams show the authored approach and threat counts,
while readiness and route markers connect fitting to the next engagement.

Each surviving nonfinal passage also offers **one optional support package**:
up to 100 additional ark hull, 80 additional salvage, or a full shield recharge.
This is in addition to the existing 200 salvage/120 hull refit supplies. A choice
is available only during that refit and expires on launch. Full hull/shields
cannot consume a repair/recharge choice. Reports record the actual additional
supplies separately. Encounter timings, arrival victory and existing operation
records remain unchanged.

The demo adds detailed convoy hull silhouettes, a procedural planetary backdrop,
phase-specific presentation, and an original adaptive Web Audio score. Music and
effects have separate levels in Menu; mute and reduced-motion preferences persist
under `gateward.preferences.v1`. Browser audio begins only after user input and
stops on pause, focus loss, hidden document, or teardown. Sound settings remain
usable if storage or audio is unavailable. No third-party music/assets are added.

Additional controls: **F** toggles fitting; **L** launches a fitted convoy. Standard
controllers use the **right stick** to orbit, **RT/LT** to zoom, and D-pad left/right
to adjust selected volume sliders. Camera input is disabled inside menus, radar,
inspectors and contextual actions; sticks/triggers must return to neutral before
camera control resumes. Mouse orbit remains available on the exposed battlefield
beside a drawer. Restart and returning to operation selection from pause require
a second activation, with an explicit warning that the current operation is lost.

This remains a browser demo. There is no Steam integration or desktop package.
Automated simulation and browser checks do not establish controller hardware
feel, speaker balance, subjective balance, or sustained performance on target PCs.

Passage reports also retain **weapon activity** for every gun fitted at departure,
including weapons later destroyed. Projectile weapons report actual shots fired;
beams report seconds firing. Idle guns are called out so the player can inspect
range, firing arc and platform position. These are engagement measurements, not
damage or kill attribution. The default Forward spearhead doctrine brings the
opening guns into action early; Balanced, Broadside and Custom remain available.
