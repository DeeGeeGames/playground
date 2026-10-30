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
- Flak handles light ships; railguns ignore armor; homing missiles deal splash
  damage. All turrets fire automatically through full arcs. Upgrade to level 3
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
- Space or Escape pauses. Tab and native button activation work for the command
  panel. Focus loss and hidden documents pause the running voyage. Pointer/touch
  commands use the same actions. Physical touch devices are separate acceptance.

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
plane; no physics, gameplay ECS, persistence, or shared-world migration.

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

To rebuild the source and runtime asset with Blender on your PATH:

```sh
blender --background --factory-startup --python games/gateward/tools/build-ark.py -- --gateward-export /tmp/gateward-asset
cp /tmp/gateward-asset/gateward-ark.blend games/gateward/assets/gateward-ark.blend
bunx @gltf-transform/cli@4.5.1 dedup /tmp/gateward-asset/gateward-ark.glb /tmp/gateward-asset/dedup.glb
bunx @gltf-transform/cli@4.5.1 prune /tmp/gateward-asset/dedup.glb games/gateward/public/models/gateward-ark.glb
```

The camera follows the ark along a 2.52 km route at 12 m/s. Fixed navigation
beacons, a scrolling lattice, distant debris, and layered star parallax communicate
travel. The gate reaches the ark at the end of the route; scenery and drive stop
there even if hostiles remain. Pausing freezes the journey, and replay returns to
departure. Reduced motion disables decorative parallax and engine flicker while
keeping navigation and the gate tied to route progress.

`bun test games/gateward/tests` exercises economy, combat, escort losses, support
systems, failure, a complete salvage-funded victory, camera-aware picking,
orbital projection, resize, model hardpoints, and shield clearance. `bun run check` validates
the whole workspace. Production preview and owner judgment establish visual and
play-feel evidence separately from deterministic tests.
