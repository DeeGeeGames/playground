import { expect, test } from 'bun:test';
import { Box3, Mesh, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeObject } from '../src/actors-3d';

// Asset contract only: the carrier is not yet registered in combat simulation.
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
