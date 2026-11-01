import { tactical } from '../src/combat-scale';
import { describe, expect, test } from 'bun:test';
import { worldPoint } from '../src/space';
import { build, createState, deploy, setAllocation, step, transferPower, WEAPONS, type State } from '../src/simulation';
import { POWER_PRESETS, powerOutputs, type SystemsState } from '../src/systems';

const systemsFor = function (state: State): SystemsState {
	if (!state.systems) throw new Error('Expected systems');
	return state.systems;
};
const quiet = function () {
	const state = createState();
	state.status = 'running'; state.nextWave = Infinity;
	return state;
};
const advance = function (state: State, frames: number) { for (let i = 0; i < frames; i++) step(state, 0.05); };
const armed = function () {
	const state = quiet(); build(state, 0, 'rail');
	state.enemies.push({ id: state.nextId++, kind: 'armored', x: -96, y: -tactical(200), hp: 100000, maxHp: 100000, cooldown: 999 });
	return state;
};

describe('conserved reactor orders', function () {
	test('presets, rapid transfers, rejected orders and reset preserve ten independent integer units', function () {
		const state = createState(); const systems = systemsFor(state);
		expect(systems.allocation).toEqual(POWER_PRESETS.balanced);
		for (let i = 0; i < 200; i++) {
			expect(transferPower(state, 'engines', 'weapons')).toBe(true);
			expect(transferPower(state, 'weapons', 'engines')).toBe(true);
			expect(Object.values(systems.allocation).reduce(function (a, b) { return a + b; }, 0)).toBe(10);
		}
		for (const preset of Object.values(POWER_PRESETS)) setAllocation(state, preset);
		const snapshot = JSON.stringify(state);
		for (const engines of [-1, 0.5, NaN, Infinity, -Infinity, 100]) {
			expect(setAllocation(state, { engines, weapons: 4, shields: 6 - engines })).toBe(false);
			expect(JSON.stringify(state)).toBe(snapshot);
		}
		expect(setAllocation(state, { engines: 4, weapons: 4, shields: 4 })).toBe(false);
		expect(setAllocation(state, systems.allocation)).toBe(false);
		expect(transferPower(state, 'engines', 'engines')).toBe(false);
		expect(JSON.stringify(state)).toBe(snapshot);
		const fresh = systemsFor(createState());
		expect(fresh.allocation).toEqual(POWER_PRESETS.balanced); expect(fresh.powerChanges).toBe(0); expect(fresh.distanceTraveled).toBe(0);
		expect(setAllocation(createState(), POWER_PRESETS.engines)).toBe(true);
	});
	for (const restriction of ['paused', 'unfocused', 'won', 'lost'] as const) test(`${restriction} rejects changes without any state mutation`, function () {
		const state = quiet();
		if (restriction === 'paused') state.paused = true;
		else if (restriction === 'unfocused') state.focused = false;
		else state.status = restriction;
		const snapshot = JSON.stringify(state);
		expect(setAllocation(state, POWER_PRESETS.engines)).toBe(false);
		expect(transferPower(state, 'shields', 'weapons')).toBe(false);
		step(state, 0.05); expect(JSON.stringify(state)).toBe(snapshot);
	});
	test('accepted allocation is copied and counts once without granting charge or cooldown', function () {
		const state = armed(); const systems = systemsFor(state); const mount = state.mounts[0]; if (!mount) throw new Error('Missing mount');
		mount.cooldown = 1.5; systems.shield.charge = 20; systems.shield.rechargeDelay = 2;
		const allocation = { engines: 2, weapons: 2, shields: 6 };
		expect(setAllocation(state, allocation)).toBe(true); allocation.shields = 100;
		expect(systems.allocation).toEqual(POWER_PRESETS.shields); expect(systems.powerChanges).toBe(1);
		expect(mount.cooldown).toBe(1.5); expect(systems.shield.charge).toBe(20); expect(systems.shield.rechargeDelay).toBe(2);
	});
});

describe('powered cadence and shields', function () {
	test('mid-reload changes apply to remaining work, zero freezes it and restoration cannot burst', function () {
		const state = armed(); const mount = state.mounts[0]; if (!mount) throw new Error('Missing mount');
		mount.cooldown = 1;
		advance(state, 4); expect(mount.cooldown).toBeCloseTo(0.8);
		setAllocation(state, { engines: 0, weapons: 10, shields: 0 });
		advance(state, 4); expect(mount.cooldown).toBeCloseTo(0.3);
		setAllocation(state, { engines: 10, weapons: 0, shields: 0 });
		advance(state, 100); expect(mount.cooldown).toBeCloseTo(0.3); expect(state.shots).toHaveLength(0);
		setAllocation(state, { engines: 0, weapons: 10, shields: 0 });
		advance(state, 2); expect(mount.cooldown).toBeCloseTo(0.05);
		// Isolate reload timing from the new aim delay after engine power changes.
		const enemy = state.enemies[0]; if (!enemy) throw new Error('Missing enemy');
		Object.assign(enemy, worldPoint(state, { x: mount.x, y: -tactical(200) })); delete enemy.flight; mount.aim = -Math.PI / 2;
		step(state, 0.05); expect(mount.cooldown).toBe(WEAPONS.rail.reload); expect(state.shots).toHaveLength(1);
		const fired = state.nextId; step(state, 0.05); expect(state.nextId).toBe(fired); expect(mount.cooldown).toBeCloseTo(2.075);
	});
	test('idle cooldown clamps to zero and zero weapons suppresses ready guns', function () {
		const state = quiet(); build(state, 0, 'rail'); advance(state, 100);
		expect(state.mounts.every(function (mount) { return mount.cooldown === 0; })).toBe(true);
		setAllocation(state, { engines: 10, weapons: 0, shields: 0 });
		state.enemies.push({ id: state.nextId++, kind: 'armored', x: -96, y: -tactical(200), hp: 10000, maxHp: 10000, cooldown: 999 });
		advance(state, 5); expect(state.shots).toHaveLength(0);
		// Keep restoration independent of travel-induced barrel realignment.
		const enemy = state.enemies[0]; const mount = state.mounts[0]; if (!enemy || !mount) throw new Error('Missing target fixture');
		Object.assign(enemy, worldPoint(state, { x: mount.x, y: -tactical(200) })); delete enemy.flight; mount.aim = -Math.PI / 2;
		setAllocation(state, POWER_PRESETS.balanced); step(state, 0.05); expect(state.shots).toHaveLength(1);
	});
	test('guardian and fighter cadence and damage stay independent of ark weapon power at the same engine speed', function () {
		for (const kind of ['guardian', 'interceptor'] as const) {
			const low = createState(); low.status = 'running'; low.nextWave = Infinity; deploy(low, kind);
			low.enemies.push({ id: low.nextId++, kind: 'armored', x: -100, y: -130, hp: 100000, maxHp: 100000, cooldown: 999 });
			const high = structuredClone(low);
			// A stationary ark keeps this cadence check independent of outrunning the slow target.
			setAllocation(low, { engines: 0, weapons: 0, shields: 10 }); setAllocation(high, { engines: 0, weapons: 6, shields: 4 });
			// Allow heavy hulls to finish their slower turn before comparing fire.
			advance(low, 600); advance(high, 600);
			expect(low.escorts).toEqual(high.escorts); expect(low.enemies).toEqual(high.enemies); expect(low.shots).toEqual(high.shots); expect(low.nextId).toBeGreaterThan(5);
		}
	});
	test('zero shield power recovers no charge; restored power respects delay and capacity', function () {
		const state = quiet(); const shield = systemsFor(state).shield;
		shield.charge = 10; shield.rechargeDelay = 0.5;
		setAllocation(state, { engines: 6, weapons: 4, shields: 0 }); advance(state, 20); expect(shield.charge).toBe(10);
		shield.rechargeDelay = 0.5; setAllocation(state, POWER_PRESETS.shields); advance(state, 20); expect(shield.charge).toBeCloseTo(22);
		advance(state, 400); expect(shield.charge).toBe(shield.capacity);
		expect(powerOutputs({ engines: 0, weapons: 10, shields: 0 })).toEqual({ speed: 0, weaponRate: 2.5, shieldRecharge: 0 });
	});
});

describe('distance-based completion', function () {
	for (const engines of [0, 1, 2]) test(`${engines} engines cannot win from elapsed time`, function () {
		const state = quiet(); const systems = systemsFor(state);
		setAllocation(state, { engines, weapons: 10 - engines, shields: 0 }); advance(state, 4000);
		expect(state.time).toBeGreaterThan(155); expect(state.status).toBe('running');
		expect(systems.distanceTraveled).toBeCloseTo(state.time * engines * tactical(1.5)); expect(systems.distanceTraveled).toBeLessThan(systems.routeLength);
	});
	test('arrival clamps distance and wins without combat clearance or a minimum duration', function () {
		const state = quiet(); const systems = systemsFor(state);
		expect(systems.routeLength).toBe(tactical(1440));
		state.arrivals.push({ at: 999, kind: 'raider', x: 600, y: 0 });
		setAllocation(state, { engines: 10, weapons: 0, shields: 0 }); advance(state, 2000);
		expect(systems.distanceTraveled).toBe(tactical(1440)); expect<State['status']>(state.status).toBe('won');
		expect(state.time).toBeLessThan(120); expect(state.arrivals).toHaveLength(1);
	});
});
