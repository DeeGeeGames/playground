import { expect, test } from 'bun:test';
import { InstancedMesh, LineSegments, Mesh, Scene, type BufferGeometry, type Material } from 'three';
import { createState } from '../src/simulation';
import { createWorldObjects } from '../src/world-3d';

test('world pools track live combat state and restart removes transient objects', function () {
	const scene = new Scene(); const presentation = createWorldObjects(scene); const state = createState();
	state.salvage.push({ id: 1, x: 50, y: 60, kind: 'repair', life: 40 });
	state.warnings.push({ x: 80, y: 90, kind: 'scout', life: 2 });
	state.shots.push({ x: 100, y: 120, vx: 200, vy: 100, life: 1, kind: 'cannon', target: undefined, damage: 38 });
	state.effects.push({ x: 100, y: 120, life: 0.4, size: 30, color: '#ff8866' });
	state.wrecks.push({ x: 60, y: 90, angle: 0.4, kind: 'striker' });
	state.player.heat = 80; state.beam = { x: 300, y: 400 };
	try {
		presentation.update(state, false);
		for (const name of ['salvage', 'inbound-warning', 'projectile', 'impact-effect', 'wreck']) expect(scene.getObjectByName(name)).toBeDefined();
		expect(scene.getObjectByName('laser')?.visible).toBe(true); expect(scene.getObjectByName('reactor-vent')?.visible).toBe(true);
		presentation.update(createState(), false);
		for (const name of ['salvage', 'inbound-warning', 'projectile', 'impact-effect', 'wreck']) expect(scene.getObjectByName(name)).toBeUndefined();
		expect(scene.getObjectByName('laser')?.visible).toBe(false); expect(scene.getObjectByName('reactor-vent')?.visible).toBe(false);
		expect(scene.getObjectByName('relay')).toBeDefined();
		const floor = scene.getObjectByName('industrial-apron');
		expect(floor instanceof InstancedMesh && floor.count).toBe(150);
	} finally { presentation.dispose(); }
	expect(scene.children).toHaveLength(0);
});

test('transparent world effects retain depth tests without writing depth and disposal releases each shared asset once', function () {
	const scene = new Scene(); const presentation = createWorldObjects(scene); const state = createState();
	state.effects.push({ x: 100, y: 120, life: 0.4, size: 30, color: '#ff8866' });
	presentation.update(state, false);
	const geometries = new Set<BufferGeometry>(); const materials = new Set<Material>(); const disposed = new Map<BufferGeometry | Material, number>();
	scene.traverse(function (object) {
		if (!(object instanceof Mesh) && !(object instanceof LineSegments)) return;
		geometries.add(object.geometry);
		for (const surface of Array.isArray(object.material) ? object.material : [object.material]) {
			materials.add(surface); expect(surface.depthTest).toBe(true);
			if (surface.transparent) expect(surface.depthWrite).toBe(false);
		}
	});
	for (const asset of [...geometries, ...materials]) asset.addEventListener('dispose', function () { disposed.set(asset, (disposed.get(asset) ?? 0) + 1); });
	presentation.dispose(); presentation.dispose();
	for (const asset of [...geometries, ...materials]) expect(disposed.get(asset)).toBe(1);
	presentation.update(state, false); expect(scene.children).toHaveLength(0);
});

test('reduced motion freezes decorative bobbing and vent drift while retaining combat effects', function () {
	const scene = new Scene(); const presentation = createWorldObjects(scene); const state = createState();
	state.salvage.push({ id: 1, x: 50, y: 60, kind: 'repair', life: 40 });
	state.player.heat = 80; state.time = 0.2;
	try {
		presentation.update(state, true);
		const vent = scene.getObjectByName('reactor-vent'); const salvage = scene.getObjectByName('salvage');
		const ventHeight = vent?.position.y; const salvageHeight = salvage?.children[0]?.position.y;
		state.time = 1.2; presentation.update(state, true);
		expect(vent?.position.y).toBe(ventHeight); expect(salvage?.children[0]?.position.y).toBe(salvageHeight);
		presentation.update(state, false);
		expect(vent?.position.y).not.toBe(ventHeight); expect(salvage?.children[0]?.position.y).not.toBe(salvageHeight);
	} finally { presentation.dispose(); }
});
