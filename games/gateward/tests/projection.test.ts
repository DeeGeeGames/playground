import { expect, test } from 'bun:test';
import { createState, type Enemy, type Mount } from '../src/simulation';
import { DECK_HEIGHT, edgeIndicator, FLIGHT_HEIGHT, mountHeight, pickEnemy, pickMount, project, resizeView, toScreen, toWorld, translateView, TURRET_HEIGHT, viewFor, type View } from '../src/projection';
import { mountWorld } from '../src/space';

const viewports = [{ width: 1152, height: 844 }, { width: 390, height: 440 }, { width: 320, height: 440 }, { width: 589, height: 620 }];
const poses = [
	{ azimuth: Math.PI / 4, elevation: Math.atan(1 / Math.SQRT2), zoom: 1 },
	{ azimuth: -Math.PI / 4, elevation: Math.PI / 4, zoom: 1.5 },
	{ azimuth: Math.PI * 3 / 4, elevation: Math.PI / 6, zoom: 0.8 },
	{ azimuth: -Math.PI * 3 / 4, elevation: 1, zoom: 1.25 },
];
const orient = function (view: View, pose: typeof poses[number]) {
	const radius = 1800;
	view.camera.position.set(radius * Math.cos(pose.elevation) * Math.cos(pose.azimuth), radius * Math.sin(pose.elevation), radius * Math.cos(pose.elevation) * Math.sin(pose.azimuth));
	view.camera.lookAt(0, 0, 0);
	view.camera.zoom = pose.zoom;
	view.camera.updateProjectionMatrix();
	view.camera.updateMatrixWorld(true);
};

const enemy = function (id: number, x: number, y: number): Enemy {
	return { id, x, y, kind: 'flagship', hp: 100, maxHp: 100, cooldown: 0 };
};

test('the default 3D camera preserves the established isometric framing', function () {
	const view = viewFor(1380, 840);
	for (const point of [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }, { x: -120, y: 65 }]) {
		for (const height of [0, DECK_HEIGHT, TURRET_HEIGHT]) {
			const expected = project(point, height);
			const at = toScreen(point, view, height);
			expect(at.x).toBeCloseTo(view.cx + expected.x);
			expect(at.y).toBeCloseTo(view.cy + expected.y);
		}
	}
	expect(project({ x: 100, y: 0 }).x).toBeCloseTo(50 * Math.sqrt(3));
	expect(project({ x: 100, y: 0 }, 40).y).toBe(10);
});

test('separate views own separate cameras and expose live zoom scale', function () {
	const a = viewFor(1380, 840);
	const b = viewFor(1380, 840);
	expect(a.camera).not.toBe(b.camera);
	a.camera.zoom = 2;
	a.camera.updateProjectionMatrix();
	expect(a.scale).toBe(2);
	expect(b.scale).toBe(1);
	expect(toScreen({ x: 100, y: 0 }, a).x - a.cx).toBeCloseTo((toScreen({ x: 100, y: 0 }, b).x - b.cx) * 2);
});

test('rally and elevated planes round-trip through rotated and zoomed cameras', function () {
	for (const { width, height } of viewports) {
		const view = viewFor(width, height);
		for (const pose of poses) {
			orient(view, pose);
			for (const point of [{ x: -96, y: -43 }, { x: 96, y: 43 }, { x: -300, y: 250 }]) {
				for (const elevation of [0, DECK_HEIGHT, TURRET_HEIGHT, FLIGHT_HEIGHT]) {
					const result = toWorld(toScreen(point, view, elevation), view, elevation);
					if (!result) throw new Error('Expected a projected plane intersection');
					expect(result.x).toBeCloseTo(point.x);
					expect(result.y).toBeCloseTo(point.y);
				}
			}
		}
	}
});

test('resize keeps the camera, orbit pose and zoom while reframing the viewport', function () {
	const view = viewFor(1152, 844);
	const pose = poses[1];
	if (!pose) throw new Error('Missing camera pose');
	orient(view, pose);
	const position = view.camera.position.clone();
	const quaternion = view.camera.quaternion.clone();
	const up = view.camera.up.clone();
	const oldRight = view.camera.right;
	const resized = resizeView(view, 390, 440);
	expect(resized.camera).toBe(view.camera);
	expect(resized.camera.position.equals(position)).toBe(true);
	expect(resized.camera.quaternion.equals(quaternion)).toBe(true);
	expect(resized.camera.up.equals(up)).toBe(true);
	expect(resized.camera.zoom).toBe(pose.zoom);
	expect(resized.camera.right).not.toBe(oldRight);
	expect(resized.scale).toBeCloseTo(390 / 890 * pose.zoom);
	expect(toScreen({ x: 0, y: 0 }, resized).x).toBeCloseTo(resized.cx);
	expect(toScreen({ x: 0, y: 0 }, resized).y).toBeCloseTo(resized.cy);
	const point = { x: -96, y: 43 };
	const result = toWorld(toScreen(point, resized, DECK_HEIGHT), resized, DECK_HEIGHT);
	if (!result) throw new Error('Expected a resized plane intersection');
	expect(result.x).toBeCloseTo(point.x);
	expect(result.y).toBeCloseTo(point.y);
});

test('every empty or equipped mount remains selectable after orbit and zoom', function () {
	const state = createState();
	for (const { width, height } of viewports) {
		const view = viewFor(width, height);
		for (const pose of poses) {
			orient(view, pose);
			for (const weapon of [undefined, 'flak', 'rail', 'missile'] as const) {
				for (const mount of state.mounts) mount.weapon = weapon;
				for (const [index, mount] of state.mounts.entries())
					expect(pickMount(toScreen(mount, view, mountHeight(mount)), view, state.mounts)).toBe(index);
			}
		}
	}
});

test('mount hit regions scale with camera zoom and retain a minimum screen radius', function () {
	const mount: Mount = { x: 0, y: 0, weapon: undefined, level: 0, cooldown: 0, aim: 0 };
	const view = viewFor(320, 440);
	view.camera.zoom = 0.5;
	view.camera.updateProjectionMatrix();
	const small = toScreen(mount, view, DECK_HEIGHT);
	expect(pickMount({ x: small.x + 10, y: small.y }, view, [mount])).toBe(0);
	expect(pickMount({ x: small.x + 12, y: small.y }, view, [mount])).toBe(-1);
	const large = viewFor(1380, 840);
	large.camera.zoom = 2;
	large.camera.updateProjectionMatrix();
	const center = toScreen(mount, large, DECK_HEIGHT);
	expect(pickMount({ x: center.x + 35, y: center.y }, large, [mount])).toBe(0);
});

test('enemy selection follows elevated hulls and uses camera distance to break center ties', function () {
	const enemies = [enemy(1, -220, 150), enemy(2, 160, -200)];
	for (const { width, height } of viewports) {
		const view = viewFor(width, height);
		for (const pose of poses) {
			orient(view, pose);
			for (const target of enemies)
				expect(pickEnemy(toScreen(target, view, FLIGHT_HEIGHT), view, enemies)?.id).toBe(target.id);
		}
	}
	const view = viewFor(1380, 840);
	const contacts = [enemy(1, -20, 0), enemy(2, 20, 0)];
	const midpoint = toScreen({ x: 0, y: 0 }, view, FLIGHT_HEIGHT);
	expect(pickEnemy(midpoint, view, contacts)?.id).toBe(2);
	view.camera.position.set(-1000, 1000, -1000);
	view.camera.lookAt(0, 0, 0);
	view.camera.updateMatrixWorld(true);
	expect(pickEnemy(toScreen({ x: 0, y: 0 }, view, FLIGHT_HEIGHT), view, contacts)?.id).toBe(1);
});

test('offscreen contacts follow the current camera and remain inside tactical bounds', function () {
	for (const { width, height } of viewports) {
		const view = viewFor(width, height);
		for (const pose of poses) {
			orient(view, pose);
			expect(edgeIndicator({ x: 0, y: 0 }, view)).toBeUndefined();
			for (const point of [{ x: 2000, y: 2000 }, { x: -2000, y: -2000 }, { x: 2000, y: -2000 }, { x: -2000, y: 2000 }]) {
				const marker = edgeIndicator(point, view);
				if (!marker) throw new Error('Missing offscreen marker');
				expect(marker.point.x).toBeGreaterThanOrEqual(17.99);
				expect(marker.point.x).toBeLessThanOrEqual(width - 17.99);
				expect(marker.point.y).toBeGreaterThanOrEqual(94.99);
				expect(marker.point.y).toBeLessThanOrEqual(height - 64.99);
				const at = toScreen(point, view, FLIGHT_HEIGHT);
				expect(marker.angle).toBeCloseTo(Math.atan2(at.y - view.cy, at.x - view.cx));
			}
		}
	}
});

test('invalid or hidden viewports and parallel picking rays fail without NaNs', function () {
	for (const [width, height] of [[0, 0], [Infinity, NaN], [-20, 440], [390, -1]] as const) {
		const view = viewFor(width, height);
		const at = toScreen({ x: 1, y: 2 }, view);
		expect(Number.isFinite(at.x) && Number.isFinite(at.y)).toBe(true);
		expect(toWorld(at, view)).toBeUndefined();
		expect(pickMount(at, view, createState().mounts)).toBe(-1);
		expect(pickEnemy(at, view, [enemy(1, 0, 0)])).toBeUndefined();
		expect(edgeIndicator({ x: 2000, y: 2000 }, view)).toBeUndefined();
		expect(view.camera.projectionMatrix.elements.every(Number.isFinite)).toBe(true);
		const restored = resizeView(view, 390, 440);
		expect(toWorld(toScreen({ x: 0, y: 0 }, restored), restored)).toBeDefined();
	}
	const view = viewFor(1152, 844);
	view.camera.position.set(1000, 0, 0);
	view.camera.lookAt(0, 0, 0);
	view.camera.updateMatrixWorld(true);
	expect(toWorld({ x: view.cx, y: view.cy }, view)).toBeUndefined();
	expect(toWorld({ x: NaN, y: 0 }, view)).toBeUndefined();
	expect(toWorld({ x: 0, y: Infinity }, view)).toBeUndefined();
	expect(edgeIndicator({ x: 0, y: 0 }, viewFor(20, 100))).toBeUndefined();
});

test('camera travel preserves orbit and zoom while picking world hardpoints after translation and hull rotation', function () {
	const state = createState(); state.ark.x = 12340; state.ark.y = -3570; state.ark.angle = 0.7;
	for (const { width, height } of viewports) for (const pose of poses) {
		const view = viewFor(width, height); orient(view, pose);
		const quaternion = view.camera.quaternion.clone(); const zoom = view.camera.zoom;
		translateView(view, { x: 0, y: 0 }, state.ark);
		expect(view.camera.quaternion.equals(quaternion)).toBe(true); expect(view.camera.zoom).toBe(zoom);
		expect(toScreen(state.ark, view).x).toBeCloseTo(view.cx); expect(toScreen(state.ark, view).y).toBeCloseTo(view.cy);
		const mounts = state.mounts.map(function (mount) { return { ...mount, ...mountWorld(state, mount) }; });
		for (const [index, mount] of mounts.entries()) {
			const screen = toScreen(mount, view, mountHeight(mount));
			expect(pickMount(screen, view, mounts)).toBe(index);
			const world = toWorld(screen, view, mountHeight(mount));
			expect(world?.x).toBeCloseTo(mount.x); expect(world?.y).toBeCloseTo(mount.y);
		}
		const resized = resizeView(view, 390, 844);
		expect(toScreen(state.ark, resized).x).toBeCloseTo(resized.cx); expect(toScreen(state.ark, resized).y).toBeCloseTo(resized.cy);
	}
});
