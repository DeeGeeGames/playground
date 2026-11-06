# Dread Wake · The Lyra Passage

A browser capital-ship combat demo. Commit a heavy cruiser to slow turns, bring its
flanks to bear, and combine independent rail broadsides with bow torpedoes, a beam
lance, and all-aspect guided missiles. Survive five linked encounters; hull damage
carries forward, and each victory buys one repair or permanent upgrade.

Open `games/dreadwake/` through the workspace launcher. The game stays self-contained
and browser-only; it does not include Steam or desktop packaging.

## Playing

Flight school is a safe seven-step introduction covering handling, all four weapon
systems, and both defenses. It never reads or replaces your campaign checkpoint.
The campaign starts with a patrol, then introduces flankers, missile cruisers,
close-range brawlers, and a beam-armed command ship. Red firing tells announce
projectiles; violet tells announce a lance that point defense cannot intercept.

| Command | Keyboard / mouse | Standard controller |
| --- | --- | --- |
| Persistent throttle | W / S, or up / down | D-pad up / down |
| Neutral / coast | X | D-pad left |
| Steer | A / D; right-click orders a heading | Left stick horizontal |
| Port / starboard rail array | Hold Q / E | Hold LT / RT |
| Automatic broadside crews | G | D-pad right |
| Heavy bow torpedoes | T | Y |
| Beam lance | Hold C | Hold RB |
| Guided missiles | V | X |
| Armor lock | Hold Space | Hold LB |
| Aegis pulse | F | A |
| Priority target | Click a hostile; R cycles | B cycles, including auto acquisition |
| Zoom | Mouse wheel | Right stick vertical |
| Pause / resume | Escape | Menu / Start |
| Menu navigation | Tab or arrows; Enter; Escape back | D-pad / left stick; A select; B back |

Wheel up zooms in and wheel down zooms out, from 0.5× to 2.5×, while keeping
the cruiser centered. Menus keep their normal scrolling, and Ctrl/Command +
wheel remains available for browser zoom.

Touch has simultaneous on-screen helm, weapons and defense controls. Standard
Gamepad API mappings are supported. Buttons change prompts with the active input.
Disconnecting pauses combat; reconnecting requires an explicit resume. Menu, refit,
and launch transitions require the controller to return to neutral before arming.
Optional dual-rumble is used only where the browser/controller supports it.

## Weapon and defense decisions

- Each rail array commits six rounds, leads a target within its side arc, and reloads
  independently in 7.5 seconds. Auto crews fire only with a valid solution; manual
  firing can waste a salvo. Committed shots retain their designated target.
- Torpedoes ripple three heavy homing rounds from a broad bow cone, with a 14-second
  reload. They cannot acquire behind the ship.
- The beam lance sustains a narrow bow ray for up to 2.4 seconds. It hits the first
  hull along its line, recharges while released, and overheats for 10 seconds after
  a full burn. Holding a firing solution matters.
- Missiles launch four lighter homing rounds at any bearing within 1,200 m, with a
  12-second reload. Their separate rack lets them pressure contacts during a turn.
- Automatic point defense intercepts approaching projectiles, including hostile
  missiles. It cannot intercept a beam.
- Armor lock reduces damage by 65%, slows handling/reloads, and prevents new salvos
  and beam fire. Aegis gives 85% protection for three seconds without that penalty,
  followed by an 18-second base recharge. The defenses do not stack.

Campaign-only enemies have more hull than the legacy three-wave skirmish to account
for the expanded arsenal. Repairs restore 35% maximum hull. Rail calibration adds
15% base broadside damage; capacitor upgrades reduce Aegis recharge by three seconds.
There is no automatic repair. Refit selection is explicit and combat stays frozen.

## Presentation and settings

The battlefield uses Three.js with an orthographic camera matched to targeting and
heading projection. Layered armored hulls, gun housings, drive glow, hull scars,
shield volumes, wrecks and debris sit under a Canvas annotation layer for targeting,
weapon trails, beams, warning tells and offscreen contacts. A Canvas compatibility
renderer retains combat feedback when WebGL cannot initialize.

The interface includes a title scene, route chart, concise combat strip, pause
reference, refit selection, results and checkpoint retry. Large HUD, screen shake,
controller vibration, and independent master/music/effects levels persist under
`dreadwake.preferences.v1`. Device reduced-motion preferences suppress shake.
Original synthesized music changes between command, combat, refit and results;
rail impacts, torpedoes, missiles, the sustained beam and defenses have separate cues.

Browser autoplay rules may require one real click or keypress before sound can
start. The interface reports this as **Enable audio · click or key**. Gamepad input
alone cannot override browser policy. Unsupported audio degrades to silent play.

## Checkpoints and compatibility

Campaign checkpoints retain the existing `dreadwake.campaign.v1` schema and validate
untrusted storage. They are written at mission launch and refit. Continue restarts
a mid-battle mission from its launch checkpoint; it does not save individual shots.
Defeat preserves that checkpoint for retry. Victory clears it. New campaigns require
confirmation before replacing an existing run. Storage failures are reported while
play and an in-memory retry remain available. Flight school leaves saves untouched.

`createState()` preserves the original skirmish for existing callers;
`createCampaignState()` initializes the revised campaign. Beam and missile control
fields are optional for existing simulation callers. Simulation runs at a fixed
60 Hz independently of rendering. Gamepad polling is separate from rendering and
queues discrete actions. Blur/hiding pauses and clears input. Cleanup releases
listeners, polling, animation, GPU objects, annotation canvas and audio scheduling.

## Validation

Run `bun run check`, then validate the built game using `bun run preview`.
Meaningful regression checks cover weapon acquisition, first-hull beam blocking,
heat/cooldown, missile commitment/guidance/interception, shields, campaign/refits,
save validation, projected picking, and controller transition/input safety.

Production browser journeys cover controller-operated flight school, campaign,
pause/settings, reconnect, refit/deploy, save isolation and responsive layouts.
Audio probes establish independent channel output and pause/mute silence.
Simulated input, software-rendered timing, and signal measurements do not establish
physical controller feel, rumble, TV readability, speaker mix, human difficulty,
commercial acceptance, or Steam-client behavior.
