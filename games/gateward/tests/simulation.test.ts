import { describe, expect, test } from 'bun:test';
import { build, createState, setCoveragePriority, assignRepair, deploy, MAX_HULL, pulse, repair, ROUTE_SECONDS, sell, step, upgrade, type State, type Weapon } from '../src/simulation';

const advance = function (state: State, seconds: number) { for (let i = 0; i < Math.ceil(seconds * 60); i++) step(state, 1 / 60); };

describe('fitting and economy', function () {
	test('fitting freezes the journey and construction cannot overspend or overwrite a weapon', function () {
		const state = createState(); advance(state, 10); expect(state.time).toBe(0); expect(state.salvage).toBe(500);
		expect(build(state, 0, 'missile')).toBe(true); expect(build(state, 0, 'flak')).toBe(false);
		expect(build(state, 1, 'missile')).toBe(true); expect(build(state, 2, 'missile')).toBe(true); expect(build(state, 3, 'missile')).toBe(false);
		expect(state.salvage).toBe(95); expect(build(state, -1, 'flak')).toBe(false);
	});
	test('upgrades cap at level three and selling returns 70% of the actual investment', function () {
		const state = createState(); state.salvage = 1000;
		build(state, 0, 'flak'); expect(upgrade(state, 0)).toBe(true); expect(upgrade(state, 0)).toBe(true); expect(upgrade(state, 0)).toBe(false);
		expect(state.salvage).toBe(775); expect(sell(state, 0)).toBe(true); expect(state.salvage).toBe(932); expect(sell(state, 0)).toBe(false);
	});
	test('escort capacity is shared by wings and guardians', function () {
		const state = createState(); state.salvage = 1000;
		for (let i = 0; i < 7; i++) expect(deploy(state, 'guardian')).toBe(true);
		expect(deploy(state, 'interceptor')).toBe(false); expect(state.escorts).toHaveLength(7);
		expect(deploy(state, 'guardian')).toBe(true); expect(deploy(state, 'guardian')).toBe(true); expect(deploy(state, 'guardian')).toBe(false);
	});
	test('repair commands assign reusable crews without instant restoration or salvage cost', function () {
		const state = createState(); expect(repair(state)).toBe(false); state.hull = 1100;
		expect(repair(state)).toBe(true); expect(state.hull).toBe(1100); expect(state.salvage).toBe(500);
		expect(state.repairs['hull']).toBe(1); expect(repair(state)).toBe(true); expect(state.repairs['hull']).toBeUndefined();
		state.status = 'running'; state.nextWave = Infinity; repair(state); advance(state, 10);
		expect(state.hull).toBe(MAX_HULL); expect(state.repairs['hull']).toBeUndefined();
	});
});

describe('combat and voyage', function () {
	test('a pulse clears enemy rounds, protects the hull, and cannot be spammed', function () {
		const state = createState(); expect(pulse(state)).toBe(false); state.status = 'running';
		state.shots.push({ id: 100, x: 0, y: 0, vx: 0, vy: 0, damage: 100, side: 'enemy', weapon: 'hostile', target: undefined, life: 3 });
		expect(pulse(state)).toBe(true); expect(state.shots).toHaveLength(0); expect(pulse(state)).toBe(false);
		state.shots.push({ id: 101, x: 0, y: 0, vx: 0, vy: 0, damage: 100, side: 'enemy', weapon: 'hostile', target: undefined, life: 3 });
		step(state, 1 / 60); expect(state.hull).toBe(MAX_HULL); expect(state.systems.shield.charge).toBe(140);
	});
	test('escorts draw fire, can be destroyed, and release bay capacity', function () {
		const state = createState(); deploy(state, 'guardian'); state.status = 'running';
		const guardian = state.escorts[0]; if (!guardian) throw new Error('Missing guardian'); guardian.x = 0; guardian.y = -100; guardian.hp = 1;
		state.enemies.push({ id: 99, x: 0, y: -190, kind: 'raider', hp: 45, maxHp: 45, cooldown: 0 });
		advance(state, 1); expect(state.escorts).toHaveLength(0); expect(state.hull).toBe(MAX_HULL);
	});
	test('a designated hostile takes priority over a closer target when in range', function () {
		const state = createState(); build(state, 0, 'rail'); state.status = 'running';
		state.enemies.push({ id: 90, x: -96, y: -200, kind: 'armored', hp: 260, maxHp: 260, cooldown: 99 });
		state.enemies.push({ id: 91, x: -96, y: -300, kind: 'armored', hp: 260, maxHp: 260, cooldown: 99 });
		state.priority = 91; step(state, 1 / 60); expect(state.shots.find(function (shot) { return shot.side === 'player'; })?.target).toBe(91);
	});
	test('escorts travel toward the commanded coverage sector during a quiet approach', function () {
		const state = createState(); state.nextWave = Infinity; deploy(state, 'guardian'); setCoveragePriority(state, 'ahead', 'all'); state.status = 'running'; state.systems.allocation = { engines: 0, weapons: 4, shields: 6 };
		advance(state, 50); expect(state.escorts.every(function (escort) { return escort.x > state.ark.x + 100; })).toBe(true);
	});
	test('railguns bypass armor while flak damage is reduced', function () {
		const hit = function (weapon: Weapon) {
			const state = createState(); state.status = 'running'; state.enemies.push({ id: 99, x: 250, y: 0, kind: 'armored', hp: 260, maxHp: 260, cooldown: 99 });
			state.shots.push({ id: 100, x: 240, y: 0, vx: 600, vy: 0, damage: 100, side: 'player', weapon, target: 99, life: 3 });
			step(state, 1 / 60); return state.enemies[0]?.hp;
		};
		expect(hit('rail')).toBe(160); expect(hit('flak')).toBe(212);
	});
	test('missiles damage nearby ships and kills pay salvage only once', function () {
		const state = createState(); state.status = 'running'; state.nextWave = Infinity;
		for (let i = 0; i < 2; i++) state.enemies.push({ id: 90 + i, x: 250 + i * 40, y: 0, kind: 'raider', hp: 45, maxHp: 45, cooldown: 99 });
		state.shots.push({ id: 100, x: 240, y: 0, vx: 300, vy: 0, damage: 52, side: 'player', weapon: 'missile', target: 90, life: 3 });
		step(state, 1 / 60); expect(state.kills).toBe(2); expect(state.enemies).toHaveLength(0); const salvage = state.salvage;
		step(state, 1 / 60); expect(state.kills).toBe(2); expect(state.salvage - salvage).toBeCloseTo(0.02);
	});
	test('an undefended ark loses and ended games reject orders and freeze', function () {
		const state = createState(); state.status = 'running'; advance(state, 840);
		expect<State['status']>(state.status).toBe('lost'); const time = state.time; advance(state, 10); expect(state.time).toBe(time);
		expect(build(state, 0, 'flak')).toBe(false); expect(deploy(state, 'guardian')).toBe(false); expect(pulse(state)).toBe(false);
	}, 15000);
	test('a mixed defense survives all five route defenses and reaches the gate', function () {
		const state = createState(); build(state, 0, 'flak'); build(state, 3, 'rail'); build(state, 4, 'flak'); state.status = 'running';
		const plan: readonly { slot: number; weapon: Weapon }[] = [{ slot: 7, weapon: 'rail' }, { slot: 1, weapon: 'missile' }, { slot: 6, weapon: 'missile' }, { slot: 2, weapon: 'flak' }, { slot: 5, weapon: 'flak' }];
		for (let second = 0; second < 840 && state.status === 'running'; second++) {
			assignRepair(state, 'hull', 4); if (state.enemies.length >= 7) pulse(state);
			for (const item of plan) build(state, item.slot, item.weapon);
			for (let i = 0; i < 8; i++) upgrade(state, i);
			advance(state, 1);
		}
		expect<State['status']>(state.status).toBe('won'); expect(state.time).toBeGreaterThanOrEqual(ROUTE_SECONDS); expect(state.wave).toBe(5); expect(state.kills).toBeGreaterThan(0); expect(state.hull).toBeGreaterThan(0);
	}, 25000);
	test('a wave-clear repair cannot revive a hull destroyed during the final exchange', function () {
		const state = createState(); state.status = 'running'; state.wave = 5; state.time = ROUTE_SECONDS; state.hull = 10; state.systems.shield.charge = 0;
		state.enemies.push({ id: 99, x: 250, y: 0, kind: 'raider', hp: 1, maxHp: 45, cooldown: 99 });
		state.shots.push({ id: 100, x: 240, y: 0, vx: 600, vy: 0, damage: 10, side: 'player', weapon: 'rail', target: 99, life: 3 });
		state.shots.push({ id: 101, x: 0, y: 0, vx: 0, vy: 0, damage: 10, side: 'enemy', weapon: 'hostile', target: undefined, life: 3 });
		step(state, 1 / 60); expect<State['status']>(state.status).toBe('lost'); expect(state.hull).toBe(0); expect(state.kills).toBe(1);
	});
	test('reaching the gate with surviving hostiles wins the voyage', function () {
		const state = createState(); state.status = 'running'; state.time = 100; state.wave = 5; state.systems.distanceTraveled = state.systems.routeLength; state.ark.x = state.systems.routeLength;
		state.enemies.push({ id: 99, x: 500, y: 0, kind: 'flagship', hp: 2400, maxHp: 2400, cooldown: 99 });
		step(state, 1 / 60); expect<State['status']>(state.status).toBe('won'); expect(state.enemies).toHaveLength(1); expect(state.time).toBeLessThan(ROUTE_SECONDS);
	});
});
