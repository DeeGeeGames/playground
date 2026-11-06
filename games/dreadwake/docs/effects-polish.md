# Effects polish and panel review

Engine plumes now originate at visible, illuminated drive apertures and ease through
power changes. Projectile trails retain observed world-space positions and draw as
one tapered ribbon, replacing backward velocity projections and overlapping bright
segments. Weapon effects attach to barrel tips and share camera shake with the hull.
Rounded flashes, curved ion arcs, staggered explosion clouds and eased shield ripples
replace the former repeated star shapes.

The Cel Fleet hull art, colors, controls, damage, targeting, ranges, collision paths,
campaign and save format remain intact. Optional launch metadata affects presentation
only. Enemy collision rays still start at hull centers; their visible launch blends
from a side gun onto that unchanged path over 0.4 seconds. The rendered projectile
head, orientation and trail use the same blended path.

## Review method

Three independent agents reviewed motion, art direction, and rendering correctness.
They inspected source and timed browser sequences, discussed findings directly, and
rated every updated category on a 1–10 scale. No reviewer was instructed to inflate a
score. All three ultimately rated every category 9/10.

Each contact-sheet tile contains the actual WebGL renderer on the left and the actual
Canvas fallback on the right. The controlled fixture runs the game's weapon simulation
at 60 Hz and draws each intervening step; labelled captures expose onset, travel,
turning, impact and expiration. Normal and reduced-motion variants were reviewed.
These are sampled browser reviews, not human continuous-playback or hardware acceptance.

[Animation recording](../../../docs/evidence/dreadwake-effects/effects-overview.mp4)
shows the final renderers in the same controlled fixture. It includes drive transitions,
guided turns, Helios, destruction, shields, hostile missiles and hostile beams.

## Iterations

1. The initial code audit found invented full-length tails at birth, separate straight
   tails over guided paths, rigid cone/triangle exhaust, camera-shake disagreement,
   socket-center flashes, center-of-hull impacts and universal spiked bursts.
2. The first visual review rated several categories 8: neutral shortened exhaust
   instantly, translucent round-capped trail segments produced bright beads, and
   destruction settled into a uniform red orb. The panel also requested denser rapid
   fire/expiration samples, moving muzzles and an actual flak interception.
3. Exponential drive response, a single tapered ribbon and staggered drifting blast
   lobes raised those categories to 9. Dense frames established Rattler cadence,
   guided turns, Ion/shield expiration and two actual flak interceptions. Reviewers
   agreed that remaining separated bright dots were distinct missile heads.
4. Hostile launches received actual side-gun anchors and a continuous visual offset;
   a final review corrected missile-body orientation to match its path tangent.
   Corrected hostile rail, missile and beam sequences plus reduced-motion captures
   resolved the remaining muzzle category. All three reviewers then reported no
   remaining material issue and awarded 9 to every category.

A mesh-attribute mismatch found during browser validation was repaired before panel
captures. Regression coverage now constructs every hull family as well as checking
trail birth/turn/reset timing, 30/60/120 Hz duration, paused history, muzzle transforms,
neutral easing, and hostile visual-path position/orientation.

## Final panel scores and feedback

| Effect | Motion reviewer | Art reviewer | Rendering reviewer |
| --- | --- | --- | --- |
| Engines | 9 — Neutral/reverse settle smoothly | 9 — Soft taper retains aperture attachment | 9 — Stable origins and renderer behavior |
| Seeker trails | 9 — Curves retain travelled history | 9 — Fine segment beads removed | 9 — No false backward extensions |
| Breach trails | 9 — Heavier wake follows broad turns | 9 — Restrained taper | 9 — Bounded launch and stable fading |
| Rail | 9 — Clean growth and fast decay | 9 — Readable directional streak | 9 — No streak through the firing hull |
| Rattler | 9 — Dense samples establish cadence | 9 — Compact rounds remain readable | 9 — Short traces remain coherent |
| Flak projectile | 9 — Travel connects clearly to burst | 9 — Appropriate visual weight | 9 — Projectile and detonation agree |
| Muzzle flashes | 9 — Moving sources remain attached | 9 — Player and hostile emitters read clearly | 9 — Continuous hostile launch path |
| Spark beam | 9 — Smooth pulse onset/decay | 9 — Precise, controlled glow | 9 — Aligned origins and endpoints |
| Helios charge/lock | 9 — Coherent anticipation | 9 — Clear firing commitment | 9 — Charge stays on the emitter |
| Helios beam | 9 — Heavy core contracts naturally | 9 — Strong but restrained hierarchy | 9 — Beam and impact remain aligned |
| Ion arcs/slow fade | 9 — Curves and expiration stay fluid | 9 — Electrical identity retained | 9 — Smooth links, clean status fade |
| Impacts | 9 — Brief core and sparks settle | 9 — Soft bursts preserve hit readability | 9 — Contact positions/heights agree |
| Destruction | 9 — Lobes dissipate separately | 9 — No persistent uniform orb | 9 — No residual geometry |
| Area bursts | 9 — Eased front, readable boundary | 9 — Restrained interior motion | 9 — Correct projected world radius |
| Interceptions | 9 — Arrival/burst/dissipation connect | 9 — Actual defense sequence reads clearly | 9 — Intercepted rounds disappear correctly |
| Shield activation/hits/expiration | 9 — Smooth entry and expiration | 9 — Localized, restrained ripples | 9 — Attached geometry and consistent envelope |

## Evidence and validation

Representative timed sheets:
[engines](../../../docs/evidence/dreadwake-effects/engines.jpg),
[Seeker turns](../../../docs/evidence/dreadwake-effects/seeker-turns.jpg),
[Breach turns](../../../docs/evidence/dreadwake-effects/torpedo-turns.jpg),
[moving muzzles](../../../docs/evidence/dreadwake-effects/moving-muzzles.jpg),
[hostile missiles](../../../docs/evidence/dreadwake-effects/hostile-missile.jpg),
[Helios](../../../docs/evidence/dreadwake-effects/helios.jpg),
[destruction](../../../docs/evidence/dreadwake-effects/bursts.jpg),
[interceptions](../../../docs/evidence/dreadwake-effects/interception.jpg),
[shield expiration](../../../docs/evidence/dreadwake-effects/shield.jpg).
All category and reduced-motion sheets are in the same directory.

`bun run check` passes: 297 tests, strict TypeScript, lint and production build.
An independent final source review found no remaining material issue. The main
production game was exercised through starter fitting, autonomous fire and earned
salvage, steering/throttle, neutral, Aegis, pause/resume and zoom. Its paused effects
canvas remained unchanged. Desktop, portrait and short-landscape captures had no
captured runtime errors or horizontal overflow.

[Desktop](../../../docs/evidence/dreadwake-effects/desktop-combat.png),
[portrait](../../../docs/evidence/dreadwake-effects/phone-combat.png),
[short landscape](../../../docs/evidence/dreadwake-effects/landscape-combat.png),
[validation record](../../../docs/evidence/dreadwake-effects/validation.json).

Physical controller/touch feel, speaker mix, hardware GPU performance and owner
acceptance were not established by these simulated-input and browser checks.
