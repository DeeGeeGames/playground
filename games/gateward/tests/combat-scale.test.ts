import { Vector3 } from 'three';
import { expect, test } from 'bun:test';
import { MIN_CAMERA_ZOOM } from '../src/combat-scale';
import { coverageStation } from '../src/escort-coverage';
import { resizeView, toScreen, toWorld, viewFor } from '../src/projection';
import { contactIntel } from '../src/sensors';
import { build, covered, createState, deploy, placeInterdiction, setAllocation, step } from '../src/simulation';
import { mountWorld, worldPoint } from '../src/space';

test('expanded battle space keeps hulls fixed while escorts and fields clear the ship', function () {
	const state = createState();
	expect(state.mounts[0]).toMatchObject({ x: -96, y: -43 });
	deploy(state, 'guardian');
	const escort = state.escorts[0]; if (!escort) throw new Error('Missing guardian');
	expect(coverageStation(state, escort.id, 'port')).toEqual({ x: 0, y: -920 });
	state.status = 'running';
	expect(placeInterdiction(state, { x: 1200, y: 0 })).toBe(true);
	expect(state.systems.interdiction.field?.world).toEqual({ x: 1200, y: 0 });
});

test('expanded weapon reach remains bounded independently of sensor detection', function () {
	const state = createState(); build(state, 0, 'rail');
	const mount = state.mounts[0]; if (!mount) throw new Error('Missing railgun');
	const origin = mountWorld(state, mount);
	const inside = { x: origin.x, y: origin.y - 1760, z: origin.z ?? 0 };
	expect(covered(state, mount, inside)).toBe(true);
	expect(covered(state, mount, { ...inside, y: inside.y - 1 })).toBe(false);
	expect(contactIntel(state, { x: 7000, y: 0 })).toBe('detected');
	expect(contactIntel(state, { x: 8001, y: 0 })).toBe('unseen');
});

test('faster engines retain route duration and integrated motion', function () {
	const state = createState(); state.status = 'running'; state.nextWave = Infinity;
	setAllocation(state, { engines: 4, weapons: 4, shields: 2 });
	for (let frame = 0; frame < 600; frame++) step(state, 1 / 60);
	expect(state.ark.x).toBeCloseTo(480);
	expect(state.systems.distanceTraveled / state.systems.routeLength).toBeCloseTo(10 / 210);
});

test('homing missiles retain the faster launch speed on subsequent updates', function () {
	const state = createState(); state.status = 'running'; state.nextWave = Infinity;
	setAllocation(state, { engines: 0, weapons: 10, shields: 0 });
	build(state, 0, 'missile');
	const mount = state.mounts[0]; if (!mount) throw new Error('Missing missile mount');
	const enemy = { id: state.nextId++, kind: 'armored' as const, ...worldPoint(state, { x: mount.x, y: -1000 }), hp: 10000, maxHp: 10000, cooldown: 999 };
	state.enemies.push(enemy);
	step(state, 1 / 60);
	const shot = state.shots.find(function (item) { return item.weapon === 'missile'; });
	if (!shot) throw new Error('Missile did not fire across the expanded combat space');
	for (let frame = 0; frame < 10; frame++) {
		step(state, 1 / 60);
		expect(Math.hypot(shot.vx, shot.vy, shot.vz ?? 0)).toBeCloseTo(1200);
	}
});

test('maximum zoom out spans four times the old width and survives resize with valid picking', function () {
	let view = viewFor(1440, 900);
	view.camera.zoom = 0.65; view.camera.updateProjectionMatrix();
	const center = toScreen({ x: 0, y: 0 }, view);
	const before = toScreen({ x: 1200, y: 0 }, view);
	view.camera.zoom = MIN_CAMERA_ZOOM; view.camera.updateProjectionMatrix();
	const after = toScreen({ x: 1200, y: 0 }, view);
	expect(before.x - center.x).toBeCloseTo((after.x - center.x) * 4);
	view = resizeView(view, 390, 844);
	expect(view.camera.zoom).toBe(MIN_CAMERA_ZOOM);
	const point = { x: 2800, y: -1800 };
	const recovered = toWorld(toScreen(point, view), view);
	expect(recovered?.x).toBeCloseTo(point.x); expect(recovered?.y).toBeCloseTo(point.y);
});

test('portrait low orbit keeps the visible detection volume between camera clipping planes', function () {
	const view = viewFor(390, 844); const camera = view.camera;
	const distance = camera.position.length(); const polar = Math.PI / 2 - 0.35;
	camera.position.set(Math.sin(polar) * distance / Math.sqrt(2), Math.cos(polar) * distance, Math.sin(polar) * distance / Math.sqrt(2));
	camera.lookAt(0, 0, 0); camera.zoom = MIN_CAMERA_ZOOM;
	camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
	const point = new Vector3(3700, 130, 6700).project(camera);
	expect(Math.abs(point.x)).toBeLessThan(1); expect(Math.abs(point.y)).toBeLessThan(1);
	expect(point.z).toBeGreaterThan(-1); expect(point.z).toBeLessThan(1);
});
