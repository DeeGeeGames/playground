import { expect, test } from 'bun:test';
import { fieldRelative } from '../src/interdiction';
import { FLIGHT_HEIGHT, resizeView, toScreen, toWorld, translateView, viewFor } from '../src/projection';
import { createState, placeInterdiction, setAllocation, step } from '../src/simulation';
import { createTrajectory, effectHeight, projectileHeight } from '../src/projectiles-3d';

test('placement ray and field ring share the flight plane after orbit and resize', function () {
	const point = { x: 300, y: -100 };
	for (const [width, height] of [[1440, 900], [390, 844]] as const) {
		let view = viewFor(width, height);
		view.camera.position.set(-900, 1100, 700); view.camera.lookAt(0, 0, 0);
		view = resizeView(view, width, height);
		const screen = toScreen(point, view, FLIGHT_HEIGHT);
		const placed = toWorld(screen, view, FLIGHT_HEIGHT);
		expect(placed?.x).toBeCloseTo(point.x); expect(placed?.y).toBeCloseTo(point.y);
		// Picking the ground plane would place the preview far from the clicked ring.
		const ground = toWorld(screen, view);
		expect(Math.hypot((ground?.x ?? Infinity) - point.x, (ground?.y ?? Infinity) - point.y)).toBeGreaterThan(50);
	}
});

test('a fixed world buoy moves aft in the projected view at actual engine speed', function () {
	for (const engines of [0, 1, 4, 10]) {
		const state = createState({ scenario: 'drill' }); state.status = 'running'; state.nextWave = Infinity;
		setAllocation(state, { engines, weapons: 10 - engines, shields: 0 });
		expect(placeInterdiction(state, { x: 300, y: 0 })).toBe(true);
		const view = viewFor(1440, 900); const field = state.systems.interdiction.field; if (!field) throw new Error('Missing field');
		const world = { ...field.world }; const arkBefore = { ...state.ark };
		const projectedBefore = toScreen(field.world, view, FLIGHT_HEIGHT);
		for (let frame = 0; frame < 120; frame++) step(state, 1 / 60);
		const after = fieldRelative(state); if (!after) throw new Error('Missing field');
		expect(after.x).toBeCloseTo(300 - engines * 3 * 2); expect(after.y).toBe(0);
		expect(field.world).toEqual(world); translateView(view, arkBefore, state.ark);
		const projectedAfter = toScreen(field.world, view, FLIGHT_HEIGHT);
		const expected = toScreen({ x: 300 - engines * 6, y: 0 }, viewFor(1440, 900), FLIGHT_HEIGHT);
		expect(projectedAfter.x).toBeCloseTo(expected.x); expect(projectedAfter.y).toBeCloseTo(expected.y);
		if (engines === 0) expect(projectedAfter).toEqual(projectedBefore);
		else expect(projectedAfter.x).toBeLessThan(projectedBefore.x);
	}
});

test('interdiction absorption meets an already flying hull-bound round at its rendered height', function () {
	const state = createState(); state.status = 'running'; state.nextWave = Infinity;
	setAllocation(state, { engines: 0, weapons: 10, shields: 0 });
	const shot = { id: state.nextId++, x: 415, y: 0, vx: -235, vy: 0, damage: 10, side: 'enemy' as const, weapon: 'hostile' as const, target: undefined, life: 4 - (600 - 415) / 235 };
	const trajectory = createTrajectory(shot, state); state.shots.push(shot);
	expect(placeInterdiction(state, { x: 300, y: 0 })).toBe(true); step(state, 0.05);
	const impact = state.effects.find(function (effect) { return effect.sourceShot?.id === shot.id; });
	if (!impact) throw new Error('Missing interdiction impact');
	const height = effectHeight(impact, state);
	expect(impact.x).toBeCloseTo(410); expect(height).toBeCloseTo(84.9010989);
	expect(height).toBeCloseTo(projectileHeight(impact, trajectory)); expect(state.shots).toHaveLength(0);
	const view = viewFor(1440, 900);
	expect(toScreen(impact, view, height)).toEqual(toScreen(impact, view, projectileHeight(impact, trajectory)));
});
