import { expect, test } from 'bun:test';
import { Box3, Mesh, Raycaster, Vector3 } from 'three';
import { CARRIER_BAYS, craftScale } from '../src/ship-config';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createEnemy, disposeObject } from '../src/actors-3d';

// Shipped asset contract for enemy fighter launch geometry.
test('carrier has four clear fighter-sized forward launch corridors and normalized geometry', async function () {
	const bytes = await Bun.file(new URL('../public/models/gateward-carrier.glb', import.meta.url)).arrayBuffer();
	const model = (await new GLTFLoader().parseAsync(bytes, '')).scene;
	try {
		model.updateMatrixWorld(true);
		const size = new Box3().setFromObject(model).getSize(new Vector3());
		expect(size.x).toBeGreaterThan(155);
		expect(size.x).toBeLessThan(180);
		expect(size.z).toBeGreaterThan(125);
		expect(size.z).toBeLessThan(140);
		for (let index = 1; index <= 4; index++) {
			const anchor = model.getObjectByName(`Launch_${String(index).padStart(2, '0')}`);
			if (!anchor) throw new Error('Missing carrier launch anchor');
			const center = anchor.getWorldPosition(new Vector3());
			const bay = CARRIER_BAYS[index - 1];
			if (!bay) throw new Error('Missing simulation launch anchor');
			expect(center.x).toBeCloseTo(bay.x); expect(center.z).toBeCloseTo(bay.y);
			// Sweep a 14-wide, 6-high fighter envelope from inside the bay through
			// the exit and past the other pods. Center-only rays miss wing collisions.
			for (const across of [-7, 0, 7]) {
				for (const height of [-3, 0, 3]) {
					const origin = center.clone().add(new Vector3(-30, height, across));
					const ray = new Raycaster(origin, new Vector3(1, 0, 0), 0, 200);
					expect(ray.intersectObject(model, true)).toHaveLength(0);
				}
			}
		}
		model.traverse(function (object) {
			if (!(object instanceof Mesh)) return;
			expect(object.scale.toArray()).toEqual([1, 1, 1]);
			const positions = object.geometry.getAttribute('position');
			for (let index = 0; index < positions.count; index++) {
				expect(Number.isFinite(positions.getX(index))).toBe(true);
				expect(Number.isFinite(positions.getY(index))).toBe(true);
				expect(Number.isFinite(positions.getZ(index))).toBe(true);
			}
		});
	} finally { disposeObject(model); }
});

test('enemy carriers use the shipped model at 150 percent with independent resources', async function () {
	const bytes = await Bun.file(new URL('../public/models/gateward-carrier.glb', import.meta.url)).arrayBuffer();
	const template = (await new GLTFLoader().parseAsync(bytes, '')).scene;
	const enemy = { id: 1, kind: 'carrier', x: 0, y: 0, hp: 600, maxHp: 600, cooldown: 0 } as const;
	const a = createEnemy(enemy, template); const b = createEnemy(enemy, template);
	try {
		expect(a.scale.x).toBe(craftScale('carrier'));
		expect(new Box3().setFromObject(a).getSize(new Vector3()).x).toBeGreaterThan(230);
		expect(a.getObjectByName('Launch_01')).toBeDefined();
		let otherDisposals = 0;
		b.traverse(function (object) { if (object instanceof Mesh) object.geometry.addEventListener('dispose', function () { otherDisposals++; }); });
		disposeObject(a); expect(otherDisposals).toBe(0);
	} finally { disposeObject(b); disposeObject(template); }
});
