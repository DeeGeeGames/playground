import { expect, test } from 'bun:test';
import { FLIGHT_BAND, createFlight, fly } from '../src/flight';
import { hullClearance, resolveTraffic, traffic } from '../src/ship-traffic';
import { createState, deploy, distance, recallAll, scrambleAll, step, type Point } from '../src/simulation';
import { createTrajectory, projectileHeight } from '../src/projectiles-3d';
import { FLIGHT_HEIGHT } from '../src/projection';

const quiet = function () { const state = createState(); state.status = 'running'; state.nextWave = Infinity; return state; };

test('climbs and dives remain bounded in position and total speed, including climb braking', function () {
	const point: Point = { x: 0, y: 0, z: 0 };
	const flight = createFlight(point, { x: 60, y: 0 }, 60, 1);
	for (let frame = 0; frame < 1800; frame++) {
		const before = { ...point };
		fly(point, flight, { x: 60, y: 0, z: frame < 600 ? 60 : frame < 1200 ? -60 : 0 }, 60, 3, 1 / 60);
		expect(distance(before, point)).toBeLessThanOrEqual(1 + 1e-8);
		expect(Math.abs(point.z ?? 0)).toBeLessThanOrEqual(FLIGHT_BAND);
	}
});

test('rounds miss a ship on another altitude and hit one at the same altitude', function () {
	for (const z of [0, 60]) {
		const state = quiet();
		state.enemies.push({ id: 100, kind: 'raider', x: -490, y: -300, z, hp: 45, maxHp: 45, cooldown: 999 });
		state.shots.push({ id: 101, x: -500, y: -300, z: 0, vx: 1000, vy: 0, vz: 0, life: 4, damage: 100, side: 'player', weapon: 'rail', target: 100 });
		step(state, 1 / 60);
		expect(state.enemies.length).toBe(z === 0 ? 0 : 1);
	}
});

test('stacked hulls separate when touching and pass freely with vertical clearance', function () {
	for (const z of [5, 60]) {
		const state = quiet();
		for (const [index, altitude] of [0, z].entries()) state.enemies.push({ id: 100 + index, kind: 'raider', x: -500, y: -300, z: altitude, hp: 45, maxHp: 45, cooldown: 999 });
		resolveTraffic(state);
		const hulls = traffic(state).filter(function (hull) { return hull.id !== 0; });
		const a = hulls[0]; const b = hulls[1]; if (!a || !b) throw new Error('Missing hulls');
		expect(hullClearance(a, b).gap).toBeGreaterThanOrEqual(-0.001);
		if (z === 60) expect(a.point.x).toBe(b.point.x);
	}
});

test('simulation altitude determines projectile rendering independently of target movement', function () {
	const state = quiet();
	const shot = { id: 1, x: 10, y: 20, z: 45, vx: 100, vy: 0, vz: -10, origin: { x: 0, y: 20, z: 46 }, life: 3.9, damage: 1, side: 'player', weapon: 'rail', target: undefined } as const;
	const trajectory = createTrajectory(shot, state);
	expect(projectileHeight(shot, trajectory)).toBe(FLIGHT_HEIGHT + 45);
});

test('elevated fighters return, dock, reset altitude and relaunch', function () {
	const state = quiet(); deploy(state, 'interceptor'); scrambleAll(state);
	for (let frame = 0; frame < 600; frame++) step(state, 1 / 60);
	expect(state.escorts.some(function (craft) { return Math.abs(craft.z ?? 0) > 5; })).toBe(true);
	expect(recallAll(state)).toBe(true);
	for (let frame = 0; frame < 3000; frame++) step(state, 1 / 60);
	const wing = state.wings[0]; if (!wing) throw new Error('Missing wing');
	expect(wing.phase).toBe('ready');
	for (const craft of wing.craft) { expect(craft.z).toBe(0); expect(craft.flight).toBeUndefined(); }
	expect(scrambleAll(state)).toBe(true);
	for (const craft of state.escorts) expect(craft.z).toBe(0);
});
