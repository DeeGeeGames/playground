import { tactical } from '../src/combat-scale';
import { describe, expect, test } from 'bun:test';
import { assignRepair, build, createState, MAX_HULL, sell, step, subsystemAimPoint, subsystemAt, upgrade, type State } from '../src/simulation';
import { conditionMultiplier, effectiveOutputs } from '../src/systems';
import { journeyFor } from '../src/journey';
import { worldPoint } from '../src/space';

const quiet = function () {
	const state = createState(); state.status = 'running'; state.nextWave = Infinity; state.salvage = 10000;
	return state;
};
const advance = function (state: State, seconds: number) { for (let i = 0; i < Math.round(seconds * 20); i++) step(state, 0.05); };
const mountAt = function (state: State, index: number) { const mount = state.mounts[index]; if (!mount) throw new Error('Missing mount'); return mount; };
const penetratingShot = function (state: State, target: string, damage: number, from?: { x: number; y: number }) {
	const aim = subsystemAimPoint(state, target); if (!aim) throw new Error('Invalid subsystem fixture');
	const origin = from ?? worldPoint(state, { x: target === 'engines' ? -155 : target === 'sensors' ? 155 : target.startsWith('mount:') ? mountAt(state, Number(target.slice(6))).x : 0, y: target === 'engines' || target === 'sensors' ? 0 : target.startsWith('mount:') ? Math.sign(mountAt(state, Number(target.slice(6))).y) * 50 : -50 });
	// Relative aim plus actual ark velocity hits a translated, rotated surface.
	// Cross the surface slightly instead of ending on its floating-point boundary.
	state.shots.push({ id: state.nextId++, ...origin, vx: (aim.x - origin.x) * 1.01 / 0.05 + Math.cos(state.ark.angle) * effectiveOutputs(state.systems).speed, vy: (aim.y - origin.y) * 1.01 / 0.05 + Math.sin(state.ark.angle) * effectiveOutputs(state.systems).speed, damage, side: 'enemy', weapon: 'hostile', target: undefined, life: 3 });
};

describe('surface subsystem impacts', function () {
	for (const target of ['engines', 'sensors', 'generator', 'mount:0', 'mount:7']) test(`${target} is reachable on a moving rotated ark`, function () {
		const state = quiet(); build(state, 0, 'rail'); build(state, 7, 'flak');
		state.ark.x = 1234; state.ark.y = -567; state.ark.angle = 0.9; state.systems.shield.charge = 0;
		penetratingShot(state, target, 60); step(state, 0.05);
		expect(state.hull).toBe(MAX_HULL - 60);
		const expected = { engines: 100, sensors: 100, generator: 100, 'mount:0': 100, 'mount:7': 100, [target]: 40 };
		expect(state.systems.engines.integrity).toBe(expected.engines);
		expect(state.systems.sensors.integrity).toBe(expected.sensors);
		expect(state.systems.generator.integrity).toBe(expected.generator);
		expect(mountAt(state, 0).integrity).toBe(expected['mount:0']); expect(mountAt(state, 7).integrity).toBe(expected['mount:7']);
		step(state, 0.05); expect(state.hull).toBe(MAX_HULL - 60);
	});
	test('gaps and interior hit points are hull-only; inclusive boundaries and cap overlap are deterministic', function () {
		const state = quiet(); build(state, 0, 'rail');
		expect(subsystemAt(state, { x: -96, y: -40 })).toBe('mount:0');
		expect(subsystemAt(state, { x: -84, y: -40 })).toBe('mount:0');
		expect(subsystemAt(state, { x: -83.99, y: -40 })).toBeUndefined();
		expect(subsystemAt(state, { x: 0, y: 0 })).toBeUndefined();
		expect(subsystemAt(state, { x: -145, y: -40 })).toBe('engines');
		expect(subsystemAt(state, { x: 145, y: 40 })).toBe('sensors');
		expect(subsystemAt(state, { x: 12, y: -40 })).toBe('generator');
		expect(subsystemAimPoint(state, 'mount:1')).toBeUndefined(); expect(subsystemAimPoint(state, 'mount:bogus')).toBeUndefined();
	});
	test('full absorption blocks local damage; overflow alone damages equipment despite Aegis hull mitigation', function () {
		const state = quiet(); state.systems.shield.charge = 100;
		penetratingShot(state, 'generator', 40); step(state, 0.05); expect(state.systems.generator.integrity).toBe(100);
		state.systems.shield.charge = 20; state.aegisRemaining = 2;
		penetratingShot(state, 'generator', 50); step(state, 0.05);
		expect(state.systems.generator.integrity).toBe(70); expect(state.hull).toBe(MAX_HULL - 6);
		expect(state.systems.shield.capacity).toBe(360); expect(state.systems.shield.charge).toBe(0);
	});
	test('enemy subsystem target resolves the live mount aim through ordinary projectile flight', function () {
		const state = quiet(); build(state, 0, 'rail'); build(state, 1, 'rail');
		mountAt(state, 0).cooldown = mountAt(state, 1).cooldown = 100;
		state.systems.shield.charge = 0; state.systems.allocation = { engines: 0, weapons: 10, shields: 0 };
		state.enemies.push({ id: state.nextId++, kind: 'raider', x: -96, y: -130, z: -65, hp: 100, maxHp: 100, cooldown: 0, subsystemTarget: 'mount:0' });
		advance(state, 0.5);
		expect(mountAt(state, 0).integrity).toBe(93); expect(mountAt(state, 1).integrity).toBe(100); expect(state.hull).toBe(MAX_HULL - 7);
	});
	test('declared target does not replace actual first impact and invalid targets do not create an aim point', function () {
		const state = quiet(); state.systems.shield.charge = 0;
		// A bow aim approached from astern crosses the engine cap first.
		penetratingShot(state, 'sensors', 25, worldPoint(state, { x: -200, y: 0 })); step(state, 0.05);
		expect(state.systems.engines.integrity).toBe(75); expect(state.systems.sensors.integrity).toBe(100);
	});
});

describe('condition changes output independently of power', function () {
	test('thresholds and actual engine speed/ETA agree with simulation', function () {
		expect([100, 50, 49, 0].map(conditionMultiplier)).toEqual([1, 1, 0.5, 0]);
		const state = quiet(); state.systems.engines.integrity = 49;
		expect(journeyFor(state).eta).toBe(840); step(state, 0.05); expect(state.ark.speed).toBeCloseTo(tactical(3));
		state.systems.engines.integrity = 0; step(state, 0.05); expect(state.ark.speed).toBe(0); expect(journeyFor(state).eta).toBe(Infinity);
	});
	test('generator impairment/offline only alters recharge; repairs never directly create charge', function () {
		for (const [integrity, rate] of [[100, 8], [49, 4], [0, 0]] as const) {
			const state = quiet(); state.systems.generator.integrity = integrity; state.systems.shield.charge = 50;
			expect(effectiveOutputs(state.systems).shieldRecharge).toBe(rate); advance(state, 1);
			expect(state.systems.shield.charge).toBeCloseTo(50 + rate); expect(state.systems.shield.capacity).toBe(360);
		}
		const state = quiet(); state.systems.generator.integrity = 0; state.systems.shield.charge = 50; state.systems.allocation.shields = 0;
		assignRepair(state, 'generator', 4); advance(state, 4); expect(state.systems.generator.integrity).toBeCloseTo(64); expect(state.systems.shield.charge).toBe(50);
	});
	test('one offline mount stops while another fires and impaired reload progresses at half rate', function () {
		const state = quiet(); build(state, 0, 'rail'); build(state, 1, 'rail');
		const first = mountAt(state, 0); const second = mountAt(state, 1); first.integrity = 0;
		state.enemies.push({ id: state.nextId++, kind: 'armored', x: -32, y: -150, hp: 10000, maxHp: 10000, cooldown: 100 });
		first.aim = second.aim = -Math.PI / 2; step(state, 0.05);
		expect(first.cooldown).toBe(0); expect(second.cooldown).toBeGreaterThan(0);
		first.integrity = 49; first.cooldown = second.cooldown = 1; step(state, 0.05);
		expect(first.cooldown).toBeCloseTo(0.975); expect(second.cooldown).toBeCloseTo(0.95);
	});
});

describe('bounded shared reusable crews', function () {
	test('concentration and splitting preserve progress while respecting shared capacity', function () {
		const state = quiet(); state.hull = 600; state.systems.engines.integrity = 0;
		expect(assignRepair(state, 'hull', 2)).toBe(true); expect(assignRepair(state, 'engines', 2)).toBe(true);
		expect(assignRepair(state, 'sensors', 1)).toBe(false); expect(assignRepair(state, 'engines', 3)).toBe(false);
		advance(state, 1); expect(state.hull).toBeCloseTo(624); expect(state.systems.engines.integrity).toBeCloseTo(8);
		expect(assignRepair(state, 'hull', 0)).toBe(true); expect(assignRepair(state, 'engines', 4)).toBe(true);
		advance(state, 1); expect(state.hull).toBeCloseTo(624); expect(state.systems.engines.integrity).toBeCloseTo(24);
	});
	test('sale releases crews; rebuy and upgrades preserve integrity; completion releases once', function () {
		const state = quiet(); build(state, 0, 'flak'); const mount = mountAt(state, 0); mount.integrity = 20;
		assignRepair(state, 'mount:0', 4); expect(upgrade(state, 0)).toBe(true); expect(mount.integrity).toBe(20);
		expect(sell(state, 0)).toBe(true); expect(state.repairs['mount:0']).toBeUndefined(); expect(subsystemAimPoint(state, 'mount:0')).toBeUndefined();
		expect(build(state, 0, 'rail')).toBe(true); expect(mount.integrity).toBe(20);
		assignRepair(state, 'mount:0', 4); advance(state, 6); expect(mount.integrity).toBe(100); expect(state.repairs).toEqual({});
		expect(assignRepair(state, 'mount:0', 1)).toBe(false); expect(assignRepair(state, 'invalid', 1)).toBe(false); expect(assignRepair(state, 'hull', NaN)).toBe(false);
	});
	test('sector-clear hull restoration releases a completed hull assignment immediately', function () {
		const state = quiet(); state.hull = MAX_HULL - 10; state.wave = 1;
		expect(assignRepair(state, 'hull', 2)).toBe(true); step(state, 0.05);
		expect(state.hull).toBe(MAX_HULL); expect(state.repairs['hull']).toBeUndefined();
		expect(state.message).toContain('Sector secured');
	});
	test('lost hull never revives and restarting creates no stale assignment', function () {
		const state = quiet(); state.hull = 1; assignRepair(state, 'hull', 4); state.hull = 0;
		step(state, 0.05); expect(state.hull).toBe(0); expect(state.status).toBe('lost');
		expect(assignRepair(state, 'hull', 1)).toBe(false); expect(createState().repairs).toEqual({});
	});
});
