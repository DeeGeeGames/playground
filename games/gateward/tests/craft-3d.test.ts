import { expect, test } from 'bun:test';
import { Box3, Group, Material, Mesh, Raycaster, Vector3 } from 'three';
import { createEnemy, createEscort, disposeObject } from '../src/actors-3d';
import type { EnemyKind, EscortKind } from '../src/simulation';

const hostile = function (kind: EnemyKind): Group {
	return createEnemy({ id: 1, kind, x: 0, y: 0, hp: 100, maxHp: 100, cooldown: 0 });
};
const escort = function (kind: EscortKind): Group {
	return createEscort({ id: 2, kind, x: 0, y: 0, hp: 100, cooldown: 0, angle: 0 });
};
const fixtures = [
	{ name: 'interceptor', create: function () { return escort('interceptor'); }, length: 30, beam: 20 },
	{ name: 'guardian', create: function () { return escort('guardian'); }, length: 58, beam: 21 },
	{ name: 'raider', create: function () { return hostile('raider'); }, length: 35, beam: 24 },
	{ name: 'bomber', create: function () { return hostile('bomber'); }, length: 53, beam: 30 },
	{ name: 'armored', create: function () { return hostile('armored'); }, length: 70, beam: 31 },
	{ name: 'flagship', create: function () { return hostile('flagship'); }, length: 115, beam: 76 },
];

test.each(fixtures)('$name keeps its tactical scale, closed hull and independently disposable buffers', function (fixture) {
	const model = fixture.create(); const other = fixture.create();
	let disposed = false;
	try {
		model.updateMatrixWorld(true);
		const size = new Box3().setFromObject(model).getSize(new Vector3());
		expect(size.x).toBeLessThan(fixture.length);
		expect(size.z).toBeLessThan(fixture.beam);
		// Outside rays must hit solid hull surfaces from above, below, bow, stern
		// and either side. Reversed loft/cap winding would break orbit picking.
		for (const direction of [new Vector3(1, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, -1, 0), new Vector3(0, 0, 1), new Vector3(0, 0, -1)]) {
			const ray = new Raycaster(direction.clone().multiplyScalar(200), direction.clone().negate());
			expect(ray.intersectObject(model, true).length).toBeGreaterThan(0);
		}
		let disposals = 0; let otherDisposals = 0; let resources = 0;
		const materials = new Set<Material>();
		model.traverse(function (object) {
			if (!(object instanceof Mesh)) return;
			resources++;
			object.geometry.addEventListener('dispose', function () { disposals++; });
			for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
		});
		for (const material of materials) { resources++; material.addEventListener('dispose', function () { disposals++; }); }
		other.traverse(function (object) {
			if (!(object instanceof Mesh)) return;
			object.geometry.addEventListener('dispose', function () { otherDisposals++; });
			for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.addEventListener('dispose', function () { otherDisposals++; });
		});
		disposeObject(model);
		disposed = true;
		expect(resources).toBeGreaterThan(0);
		expect(disposals).toBe(resources);
		expect(otherDisposals).toBe(0);
	} finally { if (!disposed) disposeObject(model); disposeObject(other); }
});

test('interceptor and bomber drives remain visible past their swept stern armor', function () {
	for (const { model, height, across, offset, beamScale } of [
		{ model: escort('interceptor'), height: -0.2, across: 2.4, offset: 0.5, beamScale: 1 },
		{ model: hostile('bomber'), height: -0.5, across: 10, offset: 0.7, beamScale: 0.7 },
	]) {
		try {
			model.updateMatrixWorld(true);
			for (const side of [-1, 1]) {
				const ray = new Raycaster(new Vector3(-200, height, side * (across + offset) * beamScale), new Vector3(1, 0, 0));
				expect(ray.intersectObject(model, true)[0]?.object.name).toBe('drive');
			}
		} finally { disposeObject(model); }
	}
});
