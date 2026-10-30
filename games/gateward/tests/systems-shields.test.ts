import { describe, expect, test } from 'bun:test';
import { createState, deploy, MAX_HULL, pulse, step, type Shot, type State } from '../src/simulation';
import { absorbShieldDamage, SHIELD_CONFIG, type SystemsState } from '../src/systems';

const quiet = function (): State {
	const state = createState({ scenario: 'drill' });
	state.nextWave = Infinity;
	state.status = 'running';
	return state;
};
const systemsFor = function (state: State): SystemsState {
	if (!state.systems) throw new Error('Missing ship systems');
	return state.systems;
};
const advance = function (state: State, frames: number) {
	for (let frame = 0; frame < frames; frame++) step(state, 0.05);
};
const shot = function (state: State, damage: number, side: Shot['side'] = 'enemy'): Shot {
	const projectile: Shot = { id: state.nextId++, x: 0, y: 0, vx: 0, vy: 0, damage, side, weapon: side === 'enemy' ? 'hostile' : 'rail', target: undefined, life: 3 };
	state.shots.push(projectile);
	return projectile;
};

describe('shield state and damage conservation', function () {
	test('every mode owns independent systems without an opt-in', function () {
		for (const state of [createState(), createState({ scenario: 'drill' }), createState({ scenario: 'systems' })]) {
			expect(state.systems.shield.charge).toBe(240); expect(state.systems.allocation).toEqual({ engines: 4, weapons: 4, shields: 2 });
		}
		const first = systemsFor(quiet());
		const second = systemsFor(quiet());
		expect(first.shield).toEqual({ charge: 240, capacity: 360, rechargeDelay: 0, hitFlash: 0 });
		expect(first.shieldAbsorbed).toBe(0);
		first.shield.charge = 1;
		expect(second.shield.charge).toBe(SHIELD_CONFIG.initialCharge);
	});

	for (const { name, damage, charge, hull } of [
		{ name: 'full absorption', damage: 100, charge: 140, hull: MAX_HULL },
		{ name: 'partial absorption and overflow', damage: 300, charge: 0, hull: MAX_HULL - 60 },
		{ name: 'exact depletion', damage: 240, charge: 0, hull: MAX_HULL },
	]) test(name, function () {
		const state = quiet();
		const systems = systemsFor(state);
		shot(state, damage);
		step(state, 0.05);
		expect(systems.shield.charge).toBe(charge);
		expect(state.hull).toBe(hull);
		expect(systems.shieldAbsorbed + MAX_HULL - state.hull).toBe(damage);
		expect(systems.shield.rechargeDelay).toBe(SHIELD_CONFIG.rechargeDelay);
		expect(systems.shield.hitFlash).toBeGreaterThan(0);
		expect(state.shots).toHaveLength(0);
	});

	test('zero damage consumes the projectile without creating a hit or restarting recharge', function () {
		const state = quiet();
		const systems = systemsFor(state);
		systems.shield.rechargeDelay = 2;
		shot(state, 0);
		step(state, 0.05);
		expect(systems.shield.charge).toBe(240);
		expect(systems.shield.rechargeDelay).toBeCloseTo(1.95);
		expect(systems.shield.hitFlash).toBe(0);
		expect(systems.shieldAbsorbed).toBe(0);
		expect(state.hull).toBe(MAX_HULL);
		expect(state.shots).toHaveLength(0);
	});

	test('invalid damage cannot corrupt charge or count absorption', function () {
		const systems = systemsFor(quiet());
		const snapshot = JSON.stringify(systems);
		for (const damage of [-1, NaN, Infinity, -Infinity]) {
			expect(absorbShieldDamage(systems, damage)).toBe(0);
			expect(JSON.stringify(systems)).toBe(snapshot);
		}
	});

	test('simultaneous hits deplete one shared pool and cannot damage it a second time', function () {
		const state = quiet();
		const systems = systemsFor(state);
		for (let i = 0; i < 4; i++) shot(state, 100);
		step(state, 0.05);
		expect(systems.shield.charge).toBe(0);
		expect(systems.shieldAbsorbed).toBe(240);
		expect(state.hull).toBe(MAX_HULL - 160);
		expect(state.shots).toHaveLength(0);
		step(state, 0.05);
		expect(systems.shieldAbsorbed).toBe(240);
		expect(state.hull).toBe(MAX_HULL - 160);
	});

	test('an empty shield sends the entire next hit to hull without creating kills or salvage rewards', function () {
		const state = quiet();
		const systems = systemsFor(state);
		systems.shield.charge = 0;
		const salvage = state.salvage;
		shot(state, 75);
		step(state, 0.05);
		expect(systems.shield.charge).toBe(0);
		expect(systems.shieldAbsorbed).toBe(0);
		expect(state.hull).toBe(MAX_HULL - 75);
		expect(state.kills).toBe(0);
		expect(state.salvage - salvage).toBeCloseTo(0.06);
	});
});

describe('escort and friendly collision ordering', function () {
	test('escort interception consumes its whole round before shield; later simultaneous rounds can hit ark', function () {
		const state = quiet();
		const systems = systemsFor(state);
		deploy(state, 'guardian');
		const guardian = state.escorts[0];
		if (!guardian) throw new Error('Missing guardian');
		guardian.x = 0; guardian.y = 0; guardian.hp = 1;
		shot(state, 999);
		shot(state, 20);
		step(state, 0.05);
		expect(state.escorts).toHaveLength(0);
		expect(state.escortLosses).toBe(1);
		expect(systems.shield.charge).toBe(220);
		expect(systems.shieldAbsorbed).toBe(20);
		expect(state.hull).toBe(MAX_HULL);
		expect(state.shots).toHaveLength(0);
	});

	test('escort-only hits and friendly rounds through ark do not interrupt shield recharge', function () {
		const state = quiet();
		const systems = systemsFor(state);
		deploy(state, 'guardian');
		const guardian = state.escorts[0];
		if (!guardian) throw new Error('Missing guardian');
		guardian.x = 0; guardian.y = 0;
		shot(state, 10);
		const friendly = shot(state, 1000, 'player');
		step(state, 0.05);
		expect(guardian.hp).toBe(250);
		expect(systems.shield.charge).toBeCloseTo(240.4);
		expect(systems.shield.rechargeDelay).toBe(0);
		expect(systems.shield.hitFlash).toBe(0);
		expect(systems.shieldAbsorbed).toBe(0);
		expect(state.hull).toBe(MAX_HULL);
		expect(state.shots).toEqual([friendly]);
	});
});

describe('simulation-time recharge', function () {
	test('initial partial charge recovers at base rate and never exceeds capacity', function () {
		const state = quiet();
		const shield = systemsFor(state).shield;
		advance(state, 20);
		expect(shield.charge).toBeCloseTo(248);
		advance(state, 400);
		expect(shield.charge).toBe(SHIELD_CONFIG.capacity);
	});

	test('depletion waits three seconds; hull hits restart delay and flash fades independently', function () {
		const state = quiet();
		const shield = systemsFor(state).shield;
		shot(state, 240);
		step(state, 0.05);
		advance(state, 20);
		expect(shield.charge).toBe(0);
		expect(shield.rechargeDelay).toBeCloseTo(2);
		expect(shield.hitFlash).toBe(0);
		shot(state, 20);
		step(state, 0.05);
		expect(shield.rechargeDelay).toBe(3);
		expect(shield.hitFlash).toBe(0);
		advance(state, 60);
		expect(shield.charge).toBeCloseTo(0);
		advance(state, 20);
		expect(shield.charge).toBeCloseTo(8);
		expect(state.hull).toBe(MAX_HULL - 20);
	});

	test('a recharge delay ending mid-step uses only the remaining simulation time', function () {
		const state = quiet();
		const shield = systemsFor(state).shield;
		shield.charge = 0; shield.rechargeDelay = 0.02;
		step(state, 0.05);
		expect(shield.rechargeDelay).toBe(0);
		expect(shield.charge).toBeCloseTo(0.24);
		step(state, 10);
		expect(shield.charge).toBeCloseTo(0.64);
	});

	for (const restriction of ['fitting', 'paused', 'unfocused', 'won', 'lost'] as const) test(`${restriction} freezes charge, hit flash and recharge delay`, function () {
		const state = quiet();
		const shield = systemsFor(state).shield;
		shield.charge = 20; shield.rechargeDelay = 1; shield.hitFlash = 0.25;
		if (restriction === 'paused') state.paused = true;
		else if (restriction === 'unfocused') state.focused = false;
		else state.status = restriction;
		const snapshot = JSON.stringify(state);
		advance(state, 100);
		expect(JSON.stringify(state)).toBe(snapshot);
	});
});

describe('Aegis remains distinct from persistent shields', function () {
	test('pulse clears hostile rounds, damages and pushes nearby enemies without restoring shields', function () {
		const state = quiet();
		const systems = systemsFor(state);
		systems.shield.charge = 50; systems.shield.rechargeDelay = 2;
		state.enemies.push({ id: state.nextId++, x: 200, y: 0, hp: 100, maxHp: 100, kind: 'raider', cooldown: 99 });
		state.enemies.push({ id: state.nextId++, x: 400, y: 0, hp: 100, maxHp: 100, kind: 'raider', cooldown: 99 });
		shot(state, 999);
		const friendly = shot(state, 10, 'player');
		expect(pulse(state)).toBe(true);
		expect(state.shots).toEqual([friendly]);
		expect(state.enemies.map(function (enemy) { return { hp: enemy.hp, x: enemy.x }; })).toEqual([{ hp: 55, x: 275 }, { hp: 100, x: 400 }]);
		expect(state.aegisRemaining).toBe(5);
		expect(systems.shield.charge).toBe(50);
		expect(systems.shield.rechargeDelay).toBe(2);
		expect(systems.shieldAbsorbed).toBe(0);
		expect(pulse(state)).toBe(false);
	});

	test('Aegis spends the full shield hit and reduces only hull overflow by 80 percent', function () {
		const state = quiet();
		const systems = systemsFor(state);
		systems.shield.charge = 50;
		pulse(state);
		shot(state, 150);
		step(state, 0.05);
		expect(systems.shield.charge).toBe(0);
		expect(systems.shieldAbsorbed).toBe(50);
		expect(state.hull).toBe(MAX_HULL - 20);
		expect(state.aegisRemaining).toBeCloseTo(4.95);
	});

	test('Aegis does not discount absorbed damage, and expired protection does not reduce overflow', function () {
		const state = quiet();
		const systems = systemsFor(state);
		pulse(state);
		shot(state, 200);
		step(state, 0.05);
		expect(systems.shield.charge).toBe(40);
		expect(state.hull).toBe(MAX_HULL);
		state.aegisRemaining = 0.01;
		shot(state, 100);
		step(state, 0.05);
		expect(state.aegisRemaining).toBe(0);
		expect(systems.shieldAbsorbed).toBe(240);
		expect(state.hull).toBe(MAX_HULL - 60);
	});
});
