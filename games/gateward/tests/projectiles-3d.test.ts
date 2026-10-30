import { expect, test } from 'bun:test';
import { createTrajectory, projectileHeight } from '../src/projectiles-3d';
import { createState, step, type Enemy, type Shot } from '../src/simulation';
import { DECK_HEIGHT, FLIGHT_HEIGHT, TURRET_HEIGHT } from '../src/projection';

const enemy: Enemy = { id: 1, kind: 'raider', x: -450, y: -43, hp: 45, maxHp: 45, cooldown: 1 };
const shot: Shot = { id: 1, side: 'player', weapon: 'rail', x: -96, y: -43, vx: -1000, vy: 0, damage: 1, target: 1, life: 4 };

test('turret trails join their firing height to the raised flight layer', function () {
	const state = createState(); const mount = state.mounts[0]; if (!mount) throw new Error('Missing mount');
	mount.weapon = 'rail'; state.enemies.push({ ...enemy });
	const trajectory = createTrajectory(shot, state);
	expect(projectileHeight(trajectory.from, trajectory)).toBe(TURRET_HEIGHT);
	expect(projectileHeight(trajectory.to, trajectory)).toBe(FLIGHT_HEIGHT);
	expect(projectileHeight({ x: (trajectory.from.x + trajectory.to.x) / 2, y: -43 }, trajectory)).toBeCloseTo((TURRET_HEIGHT + FLIGHT_HEIGHT) / 2);
	expect(projectileHeight({ x: trajectory.from.x + 20, y: -43 }, trajectory)).toBe(TURRET_HEIGHT);
	expect(projectileHeight({ x: trajectory.to.x - 20, y: -43 }, trajectory)).toBe(FLIGHT_HEIGHT);
});

test('hostile rounds descend to the hull or stay at escort altitude', function () {
	const state = createState(); state.enemies.push({ ...enemy });
	const hostile: Shot = { ...shot, side: 'enemy', weapon: 'hostile', x: enemy.x, y: enemy.y, vx: 235, vy: 9, target: undefined };
	const hullTrack = createTrajectory(hostile, state);
	expect(projectileHeight(hullTrack.from, hullTrack)).toBe(FLIGHT_HEIGHT);
	expect(projectileHeight(hullTrack.to, hullTrack)).toBe(DECK_HEIGHT);
	state.escorts.push({ id: 7, kind: 'guardian', x: -150, y: 0, hp: 100, cooldown: 0, angle: 0 });
	const escortTrack = createTrajectory({ ...hostile, target: 7 }, state);
	expect(projectileHeight(escortTrack.from, escortTrack)).toBe(FLIGHT_HEIGHT);
	expect(projectileHeight(escortTrack.to, escortTrack)).toBe(FLIGHT_HEIGHT);
});

test('advanced rail rounds retain their actual firing pad at double speed', function () {
	const state = createState();
	for (const mount of state.mounts) mount.weapon = 'rail';
	state.enemies.push({ ...enemy, x: 300 });
	for (const age of [2 / 60, 0.2]) {
		const advanced = { ...shot, x: -96 + 1100 * age, vx: 1100, life: 4 - age };
		const trajectory = createTrajectory(advanced, state);
		expect(trajectory.from.x).toBeCloseTo(-96);
		expect(trajectory.from.y).toBe(-43);
		expect(projectileHeight(advanced, trajectory)).toBeGreaterThan(TURRET_HEIGHT);
	}
});

test('incoming rounds reach deck height at the first hull collision boundary', function () {
	const state = createState();
	const hostile: Shot = { ...shot, side: 'enemy', weapon: 'hostile', x: -195, y: 0, vx: 235, vy: 0, target: undefined };
	const trajectory = createTrajectory(hostile, state);
	const impact = { x: -145, y: 0 };
	state.status = 'running';
	state.shots.push({ ...hostile, x: impact.x - 1 });
	expect(trajectory.to).toEqual(impact);
	expect(projectileHeight(impact, trajectory)).toBe(DECK_HEIGHT);
	// Crossing this boundary is also where the unchanged simulation impacts.
	step(state, 1 / 60);
	expect(state.shots).toHaveLength(0);
	expect(state.effects.some(function (effect) { return effect.radius === 22; })).toBe(true);
});
