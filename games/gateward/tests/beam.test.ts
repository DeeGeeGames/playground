import { tactical } from '../src/combat-scale';
import { expect, test } from 'bun:test';
import { mountWorld } from '../src/space';
import { build, createState, sell, step, upgrade } from '../src/simulation';
import { createTrajectory } from '../src/projectiles-3d';
import { FLIGHT_HEIGHT, TURRET_HEIGHT } from '../src/projection';

const fixture = function () {
	const state = createState();
	build(state, 0, 'beam'); state.status = 'running'; state.nextWave = Infinity;
	state.enemies.push({ id: 999, kind: 'armored', x: -96, y: -200, hp: 1000, maxHp: 1000, cooldown: 999 });
	return state;
};

test('beam applies immediate sustained armor-reduced damage without projectile travel', function () {
	const state = fixture();
	step(state, 1 / 60);
	expect(state.enemies[0]?.hp).toBeCloseTo(1000 - 48 * 0.48 / 60);
	const beam = state.shots.find(function (shot) { return shot.weapon === 'beam'; });
	if (!beam) throw new Error('Missing beam');
	const track = createTrajectory(beam, state);
	const mount = state.mounts[0]; if (!mount) throw new Error('Missing mount');
	expect(track.from).toEqual(mountWorld(state, mount));
	expect(track.startHeight).toBeCloseTo(TURRET_HEIGHT); expect(track.endHeight).toBe(FLIGHT_HEIGHT);
	for (let i = 1; i < 60; i++) step(state, 1 / 60);
	expect(state.enemies[0]?.hp).toBeCloseTo(1000 - 48 * 0.48);
	expect(state.shots.filter(function (shot) { return shot.weapon === 'beam'; })).toHaveLength(1);
});

test('beam stops on range loss, zero weapon power and sale; pause freezes damage', function () {
	for (const stop of ['range', 'power', 'sale'] as const) {
		const state = fixture(); step(state, 1 / 60);
		const enemy = state.enemies[0]; if (!enemy) throw new Error('Missing enemy');
		const hp = enemy.hp;
		state.paused = true; step(state, 1 / 60); expect(enemy.hp).toBe(hp); state.paused = false;
		if (stop === 'range') enemy.y = -tactical(900);
		if (stop === 'power') state.systems.allocation = { engines: 5, weapons: 0, shields: 5 };
		if (stop === 'sale') expect(sell(state, 0)).toBe(true);
		step(state, 1 / 60); expect(enemy.hp).toBe(hp);
		expect(state.shots.some(function (shot) { return shot.weapon === 'beam'; })).toBe(false);
	}
});

test('beam supports existing upgrade and refund economy', function () {
	const state = fixture(); state.salvage = 1000;
	expect(upgrade(state, 0)).toBe(true); step(state, 1 / 60);
	expect(state.enemies[0]?.hp).toBeCloseTo(1000 - 48 * 0.48 * 1.55 * 1.12 / 60);
	expect(sell(state, 0)).toBe(true); expect(state.salvage).toBeCloseTo(1057.02);
});
