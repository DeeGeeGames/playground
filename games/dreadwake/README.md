# Dread Wake · The Lyra Passage

A browser capital-ship combat demo. Keep a heavy cruiser moving through five linked
timed encounters, beginning with one chosen turret and eleven empty sockets. Weapons
acquire and fire autonomously. Salvage recovered from wrecks earns weapon choices: install another
weapon, strengthen a fitted turret, or repair the hull.

Open `games/dreadwake/` through the workspace launcher. The game is self-contained
and browser-only, without desktop or Steam packaging.

## Playing

For a first run, deploy with a Seeker in port socket P1. Its guided missiles cover
every bearing while you learn the helm. Custom fitting lets you pick any of eight
weapons and twelve sockets. The ship starts **Weapons Free**. Each direct-fire turret
covers the outward half of its fitted flank; Seekers can launch at any bearing.
Bring the right flank and range to the enemy. There is no manual target selection,
individual gun trigger, or hidden legacy armament.

| Command | Keyboard / mouse | Standard controller | Touch |
| --- | --- | --- | --- |
| Persistent throttle | Hold W / S or up / down, or drag the vertical throttle | Hold D-pad up / down | Slide the vertical throttle |
| Neutral / coast | X | D-pad left | Tap Neutral at midscale |
| Steer | Click or right-click a heading, hold A / D, or drag the rudder | Left stick horizontal | Tap a heading or drag the rudder |
| Weapons Free / Hold Fire | G | D-pad right | Fire-policy button |
| Armor lock | Hold Space | Hold LB | Hold Armor Lock |
| Aegis pulse | F | A | Aegis |
| Zoom | Mouse wheel | Right stick vertical | Pinch the battlefield |
| Pause / resume | Escape | Menu / Start | Pause |
| Menus | Tab or arrows; Enter; Escape back | D-pad / left stick; A select; B back | Tap |

Hold Fire immediately inhibits all fitted turrets, including flak interception
and pending launches. Projectiles already in flight remain live. Hold Fire and
armor lock cancel an unfinished Helios charge. Armor reduces incoming damage by
65% while limiting movement and reload speed; Aegis gives 85% protection for three
seconds. These defenses do not stack. There is no built-in point defense: fit flak
for interception, or avoid and absorb incoming fire with the helm and defenses.

Click or tap open space to give the bow a bearing. Throttle is an independent
order, so the cruiser can turn while coasting. The vertical throttle stays where
you set it. Its upper half orders ahead thrust and its lower half orders astern.
Tap Neutral to coast. The horizontal rudder gives proportional steering to port
or starboard and holds the nearest marked position on release. Manual steering
takes over from a heading order. The cruiser keeps its momentum through a turn.

Menus and drafts freeze simulation. Controller transitions require released
controls before rearming. Disconnection, focus loss and graphics interruption
pause combat. Battlefield zoom ranges from 0.5× to 2.5×; browser zoom and menu scrolling
remain available. The transit clock shows how long to survive, and the salvage
meter tracks recovered salvage toward the next weapon choice. The live battery readout
shows a fitted weapon’s coverage and firing condition, including range and flank
advice. Inspect pauses combat to show the rank, statistics and firing condition
of every installed weapon.

## The battery

| Weapon | Distinct role | Main constraint |
| --- | --- | --- |
| Seeker missiles | Guided pressure through a turn; prefers weakened hulls | Lower damage, limited flight and turning, no retarget after launch |
| Longspike rail | Predictive straight shots pierce aligned hulls | Slow traverse and a 180 m dead zone |
| Bulwark flak | Area bursts and interception of approaching volleys | Defense spends the same cooldown as offense; cannot intercept beams |
| Rattler machine gun | Sustained pursuit ramps damage to 1.8× | 380 m range; losing the target, arc or range resets the ramp |
| Spark pulse beam | Fast precise pulses against agile contacts | First-hull hits without area damage or penetration |
| Helios charge beam | Heavy shot after a visible growing charge | Slow tracking; final 0.6 seconds locks its firing direction |
| Breach torpedo | Heavy guided blast against slow hulls and clusters | Wide turns, slow flight and a 200 m dead zone |
| Ion arc | Chains nearby hulls and slows targets for heavy guns | Short initial reach; slow is capped and weaker on command ships |

All families work as starters. Flak allows no more than two consecutive defensive
bursts while a valid offensive target is available. Ion preferentially supports
nearby rail and Helios targets. Autonomous target preferences and traversal make
weapon choices affect how the ship should approach each encounter.

Each socket can reach rank III. Upgrades increase role-specific damage, cadence,
piercing, burst radius, ramp speed, charge time or chaining. The fitting screen
shows exact statistics and before/after upgrades. Duplicate weapons are allowed.
Installing over a fitted socket requires explicit confirmation and states which
weapon and rank will be lost.

See [weapon design and panel record](./docs/weapon-design.md) for the complete
approved set, numerical baseline and independent panel feedback.

## Salvage and campaign

Destroyed enemy ships leave gold salvage markers. Steer within 180 m of a
marker to recover the cache. Frigates drop 240 salvage, cruisers 550 and the
command cruiser 900. The first choice costs 180 salvage, and the cost increases
by 100 per choice, up to fourteen choices across the campaign. A choice opens
as soon as the recovered salvage covers its cost.

Each three-card draft includes an installation and an upgrade for an eligible
fitted socket when one exists, plus a flex choice. Upgrades favor an already
invested mount. One free reroll changes the offers while preserving that upgrade
opportunity. Repair restores 15% maximum hull instead of taking a weapon; skipping
is also explicit. Choosing a reward spends it once. Simulation, projectiles,
charges and momentum remain frozen throughout the choice.

Each sector ends when its combat timer expires: 60, 75, 90, 90 and 90 seconds
(6 minutes 45 seconds of combat, plus paused decisions). Destroying the opening
fleet does not end a sector. Reinforcements arrive every 12–15 seconds from ahead
of the ship, alternating sides, with at most 3–5 active enemies. Full screens skip
arrivals instead of accumulating a burst. Transit clears surviving contacts and
projectiles without awarding kills or salvage. Death on the last tick is defeat.
The final mission also ends on survival; killing its commander is optional.

Uncollected caches remain until transit. Recovered salvage carries into the
next sector. A choice funded on the last tick resolves before refit. Final
extraction takes precedence over salvage recovery and weapon choices.

The five encounters introduce flankers, missile cruisers, close brawlers and a
beam-armed command ship. Violet charge tells announce enemy beams that flak cannot
intercept. Hull damage persists. Each of the first four victories also offers one
field refit: repair 35% hull, add 15% base damage to every fitted weapon, or reduce
Aegis recharge by three seconds, down to six seconds. Upgrades do not automatically
repair the ship. There is no persistent unlock grind.

Flight school uses an isolated practice state. It teaches throttle, turning,
Hold Fire, autonomous firing, a scripted salvage choice, Helios charge and defenses.
Its temporary training loadouts and rewards never change campaign saves.

## Checkpoints and compatibility

Checkpoints remain under `dreadwake.campaign.v1`, using version 2 for timed runs.
Version 1 checkpoints retain their route and build and resume with timed missions. Validated loadout, turret ranks,
salvage, reward count and offer seed are saved together at mission launch and refit.
**Retry and Continue restore the launch build and salvage along with the mission.**
Mid-mission choices roll back; replaying a checkpoint cannot retain upgrades while
respawning the enemies that paid for them. New campaign selection leaves the old
checkpoint intact until the starter and socket are confirmed.

Existing checkpoints preserve route, hull, statistics, upgrade counts and fire
policy. They receive a compatible six-mount fit: two rails, Seeker, Helios, Breach
and Bulwark. New runs always begin with one chosen turret. Legacy untimed simulation entry
points remain available for existing callers. Invalid or unavailable storage is
reported; play and an in-memory retry remain available.

## Presentation and settings

Cel Fleet ships retain their solid armor colors, ink outlines and recessed drives.
Empty socket rings and fitted turret shapes show the build on the ship. Weapon
families use distinct trails, pulses, bursts and charge tells. Both the Three.js
battlefield and Canvas fallback use the same combat effect vocabulary. Reduced
motion retains targeting geometry and the heavy beam's visible charge and lock.

See [effects polish and panel ratings](./docs/effects-polish.md) for the drive,
trail and combat-animation review, recording and normal/reduced-motion evidence.

Settings preserve independent master/music/effects levels, screen shake, vibration
and a larger HUD under `dreadwake.preferences.v1`. Original synthesized music follows
command, combat, refit and result scenes. Browser audio may need a click or keypress;
the interface reports this explicitly. Unsupported audio degrades to silent play.

## Validation

Run `bun run check` for existing tests, strict TypeScript, lint and production build.
Validate the built game using `bun run preview`, including starter selection,
fire-policy changes, weapon drafts, placement, upgrading, queued choices, retry,
flight school and desktop/portrait/short-landscape layouts.

Simulation and browser checks establish behavior under automated inputs. They do
not establish physical controller or touch feel, rumble, speaker mix, hardware GPU
performance, human difficulty or owner acceptance of balance.

See the production captures of [first deployment](../../docs/evidence/dreadwake-helm/starter.png),
[desktop combat](../../docs/evidence/dreadwake-helm/desktop.png),
[phone combat](../../docs/evidence/dreadwake-helm/portrait.png), and
[short landscape](../../docs/evidence/dreadwake-helm/landscape.png).
