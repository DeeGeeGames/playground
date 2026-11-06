# Dread Wake: fitted batteries

## Scope

Keep the heavy cruiser, inertia, persistent throttle, steering, five encounters,
armor lock and Aegis. New runs select one weapon and one of the twelve existing
turret positions. All other sockets start empty. Weapons acquire, track and fire
autonomously; the only combat weapon command is **Weapons Free / Hold Fire**.
There is no player-selected priority target. Keyboard G, controller D-pad right,
and one touch button toggle the policy. New deployments begin Weapons Free.

Hold Fire stops every fitted turret, including interceptions and pending launches.
Already launched projectiles remain live. Hold Fire and armor lock cancel an
unfinished Helios charge. Arsenal runs have no invisible legacy guns, missile
racks, bow beam, torpedoes or built-in point defense. Armor and Aegis remain manual
defensive tools; their current protection and handling costs remain.

## Mounts and acquisition

Preserve six physical sockets per side. Direct-fire weapons and torpedoes cover
the outward 180-degree hemisphere; seekers can launch at any bearing. Show port,
starboard, bow, coverage and occupied sockets when selecting a mount. Defaults
are helpful, but installation/replacement requires an explicit confirmed socket.
Combat shows a compact battery summary, not twelve large firing panels.

All acquisition is deterministic with stable ID tie breaks. Rattler keeps its
valid target; Spark selects the fastest accessible contact; rail favors a line
containing another hull, then a slow heavy target; Helios keeps its target for the
whole charge. Seekers prefer the lowest-health reachable hull and commit each
warhead, with finite lifetime and limited turn rate. Torpedoes favor heavy, slow
hulls. Ion prefers the reachable target being tracked by Helios/rail, then chain
opportunities. Flak predicts actual approaching hull impacts before intercepting.
At most two consecutive defensive bursts may delay a valid offensive flak shot.
No retargeting of already launched guided rounds after the designated hull dies.

Each mount reports HOLD FIRE, ARMOR LOCK, OUT OF ARC, TOO CLOSE, TRACKING,
RELOADING, CHARGING, LOCKED or FIRING as appropriate. Empty slots report EMPTY.

## Weapon set, revision 2

All eight families are available as starters and throughout the run. Ranks are
local to a socket. Duplicate weapons are allowed. Rank II/III increases roughly
match the marginal benefit of another rank-I turret while concentrating power
and specializing a flank. Numbers below are the implementation baseline; measured
balance repairs may adjust values while preserving these roles and tradeoffs.

| Weapon | Rank I / II / III | Role and constraint |
| --- | --- | --- |
| Seeker missiles | 3×36 / 4×54 / 5×68 damage; 3.6 / 3.2 / 3.0 s reload | 1,150 m, 360° pursuit. About 30/68/113 nominal DPS, below positioned guns. Finite 4 s flight, limited 1.6 rad/s turning, no retarget. Rank III distributes excess shots across reachable contacts. |
| Longspike rail | 150 / 240 / 330 damage; 3.0 / 2.7 / 2.4 s reload; pierce 2 / 2 / 3 hulls | 180–1,100 m. Slow 0.7 rad/s tracking, predictive fast straight shot. Line damage retains 65% per pierced hull and hits each hull once. |
| Bulwark flak | 45 / 75 / 100 damage; 1.0 / 0.9 / 0.8 s reload; blast 95 / 125 / 155 m | 500 m anti-cluster battery. Timed burst damages ships and removes up to 2 / 3 / 5 hostile rounds in its blast. Defense spends the same reload; cannot intercept beams. Two defensive bursts maximum before a valid anti-ship shot. |
| Rattler machine gun | 6 / 10 / 13 damage every 0.12 / 0.11 / 0.10 s | 380 m, fast 4 rad/s tracking. Same-target contact ramps damage from 1× to 1.8× over 2.0 / 1.6 / 1.2 s. Loss of range, arc, target or fire policy resets ramp. Close pursuit has higher sustained DPS than Spark. |
| Spark pulse beam | 40 / 66 / 84 damage every 0.65 / 0.60 / 0.48 s | 650 m, rapid 5 rad/s tracking. Crisp first-hull pulses favor fast flankers and brief exposures. No ramp, penetration, splash or interception. |
| Helios charge beam | 400 / 660 / 920 damage; charge 2.0 / 1.8 / 1.6 s, then recharge 4.0 / 3.6 / 3.2 s | 950 m, slow 0.65 rad/s tracking. Last 0.6 s locks a world-space direction, with a visible growing charge and fixed ray. First hull absorbs the shot. A lost pre-lock solution cancels; post-lock aim never follows a dodging target. |
| Breach torpedo | 240 / 400 / 570 damage; 4.0 / 3.6 / 3.2 s reload; splash 120 / 155 / 190 m | 200–850 m, outward launch, 210 m/s and 0.55 rad/s turning. A direct hit applies full damage once; other hulls in blast take 55%. Slow, committed capital-ship/cluster hunter. |
| Ion arc | 30 / 48 / 65 damage; 0.70 / 0.60 / 0.55 s reload; 1 / 2 / 3 additional links | 420 m initial range, 250 / 280 / 310 m links. Each jump retains 60% damage. 20% speed/turn slow for 1.6 s, refreshed without stacking; command ships only 10%. No slow of warning/cooldown clocks. All hulls hit once per discharge. |

Every weapon works without a partner: especially flak receives offensive windows,
Ion has primary damage, and short-range starters can catch the initial patrol.
No shared heat, ammunition tax or hidden diminishing-return rule penalizes mixing.
Positioning, range, traverse, target preference and commitment supply the costs.

## Progression

Actual enemy HP removed by fitted weapons awards salvage once, including over-time
and area hits, excluding overkill, training, ramming and interceptions. There are
at most fourteen rewards. Incremental costs are `180 + 100 × rewardsAlreadyEarned`:
180, 280, 380, ..., 1,480; total 11,620. Initial patrol hull is 360 per ship so it
provides two rewards; the remaining encounters retain a useful late-game HP pool.
The full campaign supplies approximately 13,760 damage salvage, leaving roughly
2,140 HP after the final threshold. Timed missions now bound salvage to these original per-sector budgets. Never open a draft after final timed extraction. Earlier last-tick rewards still resolve before refit. Destroying the roster does not end a timed sector.

Crossing a threshold queues a fully paused three-card draft, including incoming
shots, timers and momentum. Resolve queued drafts before a mission transition;
never double-charge or discard excess progress. Each draft guarantees an install
and an upgrade for an installed, nonmaxed socket where valid, plus a flex choice.
The upgrade prefers the most-invested eligible mount. One free reroll changes the
install/flex choices while preserving the upgrade guarantee. A repair alternative
is always available (15% max hull, capped); an explicit skip remains possible at
full hull. Repair and skip each consume one queued reward; reroll consumes no extra reward or salvage. No forced replacement, and replacement clearly shows the lost rank.
The draft reveals exact current/next stats and supports pointer, keyboard,
controller and touch without held-input carryover.

Mission refits remain a separate repair / calibration / Aegis-capacitor decision.
The former rail calibration applies +15% base damage to every fitted family.
No persistent unlock grind is added.

## Encounters and readability

Preserve the five routes and enemy roles. After the first patrol, author reachable
screen pairs, crossing approaches and close brawler pairs for splash, chaining and
piercing; keep dispersed agile flankers as the counter. Clustering must be available
within realistic turret ranges rather than requiring an accidental alignment.
Ion and the heavy guns can cooperate against the same reachable target at 200–420 m.

Distinct shapes communicate the families: short MG tracers, long straight rail
streaks, expanding flak bursts, curling seekers, thick slow torpedoes, crisp Spark
pulses, segmented Ion chains and an amber Helios charge/fixed ray. Hostile lances
remain violet. Reduced motion retains charge amount, lock line and hit geometry.
Empty sockets remain visible; fitted turret bodies/emitter shapes and recoil match
their family. Sounds distinguish the firing rhythms without continuous loud loops.

## Persistence and acceptance

Keep mission-launch/refit checkpoints. Loadout, ranks, salvage, reward count and
offer RNG seed are captured together only at those boundaries. Retrying restores
the launch build and salvage together with the encounter, preventing replay farming.
Say this explicitly in the save UI. Legacy checkpoints preserve route, hull,
statistics, upgrade counts and fire policy, and receive a declared six-mount
legacy-equivalent fit (two rails, missile, heavy beam, torpedo and flak); no save
is silently dropped. Keep legacy simulation entry points usable by existing callers.

High-value checks cover immediate fire-policy enforcement; charge lock/cancel;
missile commitment; piercing/area damage credited exactly once; bounded flak
offense; slow cap and cooperation; frozen/queued drafts; invalid/repeated choices;
checkpoint rollback and corrupt saves; and starter access to its first draft using
ordinary helm/defense inputs with no collision exploit. Exercise build archetypes
and enemy formations, then production browser journeys across desktop, portrait
phone and short landscape. Browser automation is separate from physical controller,
touch, speaker mix and owner acceptance of balance/feel.

## Panel record

Revision 1: tactical depth **7.5/10**, progression **7.5/10**, readability **8/10**.
Required repairs: narrower arcs; numerical breadth/depth parity; limited missiles;
stable autonomous targeting; guaranteed flak offense; viable solo starters;
encounter geometry for area weapons; literal Hold Fire; compact socket UI; and
atomic loadout/salvage checkpoint rollback. Revision 2 above incorporates these.

Revision 2: tactical depth **9/10**, progression **9/10**, readability **9/10**.
All three approved the complete set for implementation with no remaining blocking
design revisions. Their acceptance conditions remain solo-starter progression,
breadth/depth viability, reachable cluster opportunities, exact Helios commitment,
safe reward consumption, and usable touch/controller draft screens. The scores
judge the design, not measured balance or owner acceptance.
