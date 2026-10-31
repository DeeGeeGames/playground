import { expect, test } from 'bun:test';
import { InstancedMesh, LineSegments, Matrix4, Points, Scene, Vector3 } from 'three';
import { createBackdrop, rockAt } from '../src/backdrop';
import { MIN_CAMERA_ZOOM } from '../src/combat-scale';
import { offsetView, toWorld, viewFor } from '../src/projection';
import { createState } from '../src/simulation';

for (const [width, height] of [[1440, 900], [390, 844]] as const) test(`backdrop covers ${width}x${height} at both zoom limits and low orbits`, function () {
	const state = createState(); state.routeOrigin = { x: 2300, y: -900 };
	const scene = new Scene(); const update = createBackdrop(scene);
	const view = viewFor(width, height); const camera = view.camera; const distance = camera.position.length();
	for (const zoom of [2, 1, MIN_CAMERA_ZOOM]) for (const angle of [0, Math.PI / 3, Math.PI]) {
		camera.position.set(Math.cos(angle) * distance * Math.cos(0.35), distance * Math.sin(0.35), Math.sin(angle) * distance * Math.cos(0.35));
		camera.lookAt(0, 0, 0); camera.zoom = zoom; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
		offsetView(view, height * 0.25); update(state, view, false); scene.updateMatrixWorld(true);
		const grid = scene.children.find(function (child) { return child instanceof LineSegments; });
		if (!(grid instanceof LineSegments)) throw new Error('Missing grid');
		grid.geometry.computeBoundingBox(); const bounds = grid.geometry.boundingBox;
		if (!bounds) throw new Error('Missing grid bounds');
		for (const point of [{ x: 0, y: 0 }, { x: width, y: height }]) {
			const world = toWorld(point, view, -105); if (!world) throw new Error('Missing footprint');
			expect(world.x - state.routeOrigin.x).toBeGreaterThan(bounds.min.x);
			expect(world.x - state.routeOrigin.x).toBeLessThan(bounds.max.x);
			expect(world.y - state.routeOrigin.y).toBeGreaterThan(bounds.min.z);
			expect(world.y - state.routeOrigin.y).toBeLessThan(bounds.max.z);
		}
		const rocks = scene.children.find(function (child) { return child instanceof InstancedMesh; });
		if (!(rocks instanceof InstancedMesh)) throw new Error('Missing asteroids');
		expect(rocks.count).toBeGreaterThan(0); expect(rocks.count).toBeLessThan(3000);
		for (const stars of scene.children.filter(function (child) { return child instanceof Points; })) {
			const positions = stars.geometry.getAttribute('position');
			const projected = Array.from({ length: positions.count }, function (_, index) { return new Vector3().fromBufferAttribute(positions, index).applyMatrix4(stars.matrixWorld).project(camera); });
			for (const point of projected) { expect(point.z).toBeGreaterThan(-1); expect(point.z).toBeLessThan(1); }
			// Each viewport quadrant remains populated after zoom/orbit/overlay changes.
			for (const x of [-1, 1]) for (const y of [-1, 1]) expect(projected.some(function (point) { return point.x * x > 0 && point.x * x < 1 && point.y * y > 0 && point.y * y < 1; })).toBe(true);
		}
	}
});

test('asteroid cells stay anchored and backdrop updates leave simulation untouched', function () {
	const state = createState(); const before = structuredClone(state);
	const scene = new Scene(); const update = createBackdrop(scene); const view = viewFor(1440, 900);
	const rock = rockAt(-3, 7);
	update(state, view, false);
	view.camera.zoom = MIN_CAMERA_ZOOM; view.camera.updateProjectionMatrix(); update(state, view, true);
	expect(rockAt(-3, 7)).toEqual(rock); expect(state).toEqual(before);
	const stars = scene.children.find(function (child) { return child instanceof Points; });
	if (!(stars instanceof Points)) throw new Error('Missing stars');
	const positions = Array.from(stars.geometry.getAttribute('position').array);
	state.systems.distanceTraveled = 1000; update(state, view, true);
	expect(Array.from(stars.geometry.getAttribute('position').array)).toEqual(positions);
});

for (const [width, height] of [[1440, 900], [390, 844]] as const) test(`asteroids remain visible at normal, medium and widest zoom in ${width}x${height}`, function () {
	const scene = new Scene(); const update = createBackdrop(scene); const view = viewFor(width, height); const state = createState();
	let closePositions: string[] = [];
	for (const zoom of [1, 0.5, MIN_CAMERA_ZOOM]) {
		view.camera.zoom = zoom; view.camera.updateProjectionMatrix(); update(state, view, false);
		const rocks = scene.children.find(function (child) { return child instanceof InstancedMesh; });
		if (!(rocks instanceof InstancedMesh)) throw new Error('Missing asteroids');
		const positions = Array.from({ length: rocks.count }, function (_, index) { const matrix = new Matrix4(); rocks.getMatrixAt(index, matrix); return { position: new Vector3().setFromMatrixPosition(matrix), visible: matrix.determinant() > 0 }; });
		const visible = positions.filter(function (item) { const point = item.position.clone().project(view.camera); return item.visible && Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && Math.abs(point.z) < 1; });
		expect(visible.length).toBeGreaterThan(5);
		const keys = positions.map(function (item) { return item.position.toArray().join('/'); });
		if (zoom === 1) closePositions = keys;
		else for (const key of closePositions) expect(keys).toContain(key);
	}
});
