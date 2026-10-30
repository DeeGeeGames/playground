import { expect, test } from 'bun:test';
import { BufferGeometry, Material, Mesh } from 'three';
import { createTurret, disposeObject } from '../src/actors-3d';
import { createState } from '../src/simulation';

// Turrets share primitive geometry and materials internally. The lifecycle must
// release each GPU resource once, including resources on hidden weapon variants.
test('a turret releases shared and hidden resources exactly once', function () {
	const mount = createState().mounts[0];
	if (!mount) throw new Error('Missing fixture mount');
	const turret = createTurret(mount);
	const geometryDisposals = new Map<BufferGeometry, number>();
	const materialDisposals = new Map<Material, number>();
	turret.root.traverse(function (object) {
		if (!(object instanceof Mesh)) return;
		if (!geometryDisposals.has(object.geometry)) {
			geometryDisposals.set(object.geometry, 0);
			object.geometry.addEventListener('dispose', function () { geometryDisposals.set(object.geometry, (geometryDisposals.get(object.geometry) ?? 0) + 1); });
		}
		const materials: Material[] = Array.isArray(object.material) ? object.material : [object.material];
		for (const material of materials) if (!materialDisposals.has(material)) {
			materialDisposals.set(material, 0);
			material.addEventListener('dispose', function () { materialDisposals.set(material, (materialDisposals.get(material) ?? 0) + 1); });
		}
	});
	expect(geometryDisposals.size).toBeGreaterThan(0);
	expect(materialDisposals.size).toBeGreaterThan(0);
	disposeObject(turret.root);
	for (const count of geometryDisposals.values()) expect(count).toBe(1);
	for (const count of materialDisposals.values()) expect(count).toBe(1);
});
