import { describe, expect, test } from 'bun:test';
import { worldPoint } from '../src/space';
import { build, contactWarning, createState, deploy, MAX_HULL, pulse, repairSensors, setPriority, step, type Enemy, type State } from '../src/simulation';
import { canAcquire, contactIntel, SENSOR_CONFIG, sensorRanges } from '../src/sensors';

const quiet = function () {
	const state = createState({ scenario: 'drill' });
	state.status = 'running'; state.nextWave = Infinity;
	return state;
};
const systemsFor = function (state: State) {
	if (!state.systems) throw new Error('Missing systems');
	return state.systems;
};
const advance = function (state: State, seconds: number) {
	for (let frame = 0; frame < Math.round(seconds / 0.05); frame++) step(state, 0.05);
};
const enemyAt = function (state: State, x: number, y = 0): Enemy {
	const enemy: Enemy = { id: state.nextId++, x, y, kind: 'bomber', hp: 95, maxHp: 95, cooldown: 99 };
	state.enemies.push(enemy); return enemy;
};
const hit = function (state: State, damage = 34, sensorDamage: number | undefined = 35) {
	state.shots.push({ id: state.nextId++, x: state.ark.x, y: state.ark.y, vx: 0, vy: 0, damage, sensorDamage, side: 'enemy', weapon: 'hostile', target: undefined, life: 3 });
};

describe('range-limited sensor intelligence', function () {
	test('healthy, impaired and offline detection and classification boundaries', function () {
		const state = quiet(); const sensors = systemsFor(state).sensors;
		for (const [integrity, detection, classification] of [[100, 760, 640], [50, 760, 640], [49, 330, 230], [0, 200, 0]]) {
			if (integrity === undefined || detection === undefined || classification === undefined) throw new Error('Missing fixture');
			sensors.integrity = integrity;
			expect(sensorRanges(state)).toEqual({ detection, classification });
			expect(canAcquire(state, { x: detection, y: 0 })).toBe(true);
			expect(contactIntel(state, { x: detection + 0.01, y: 0 })).toBe('unseen');
			expect(contactIntel(state, { x: classification, y: 0 })).toBe(integrity > 0 ? 'classified' : 'detected');
			expect(contactIntel(state, { x: classification + 0.01, y: 0 })).toBe('detected');
		}
	});
	test('detection boundaries and scheduled warnings are centered on a translated ark', function () {
		const state = quiet(); state.time = 7;
		const translated = structuredClone(state);
		translated.routeOrigin = { x: 1250, y: -550 };
		translated.ark.x = translated.routeOrigin.x; translated.ark.y = translated.routeOrigin.y;
		for (const integrity of [100, 49, 0]) {
			state.systems.sensors.integrity = integrity; translated.systems.sensors.integrity = integrity;
			expect(contactWarning(translated)).toBe(contactWarning(state));
			const range = sensorRanges(state).detection;
			for (const offset of [{ x: range, y: 0 }, { x: range + 0.01, y: 0 }, { x: 0, y: -100 }]) {
				expect(contactIntel(translated, worldPoint(translated, offset))).toBe(contactIntel(state, offset));
			}
		}
	});
	test('same bomber encounter has six seconds classified warning healthy, uncertain late warning impaired', function () {
		const state = quiet(); state.wave = 1; state.time = 17;
		expect(contactWarning(state)).toBe('STARBOARD · 4 bomber · arrival 6s');
		systemsFor(state).sensors.integrity = 49;
		expect(contactWarning(state)).toBe('Scanning for contacts');
		state.time = 23; state.nextWave = 23; step(state, 0.05);
		expect(contactWarning(state)).toBe('Scanning for contacts');
		expect(state.message).not.toContain('4 bomber');
		const enemy = state.enemies[0]; if (!enemy) throw new Error('Missing bomber');
		enemy.x = 0; enemy.y = 300;
		expect(contactWarning(state)).toBe('STARBOARD · unclassified contact');
		expect(repairSensors(state)).toBe(true);
		expect(contactWarning(state)).toContain('bomber');
	});
	test('voyage and drill both use sensors without an opt-in', function () {
		for (const state of [createState(), createState({ scenario: 'drill' })]) {
			const enemy = enemyAt(state, 10000);
			expect(contactIntel(state, enemy)).toBe('unseen');
			expect(setPriority(state, enemy.id)).toBe(false);
			expect(repairSensors(state)).toBe(false);
		}
		expect(contactWarning(createState({ scenario: 'drill' }))).toBe('Scanning for contacts');
		const voyage = createState(); voyage.time = 4; expect(contactWarning(voyage)).toContain('raider');
		voyage.systems.sensors.integrity = 0; expect(contactWarning(voyage)).toBe('Scanning for contacts');
	});
});

describe('acquisition and local defense', function () {
	test('manual locks reject hidden/dead targets and clear immediately after disruption', function () {
		const state = quiet(); const systems = systemsFor(state); systems.shield.charge = 0;
		const enemy = enemyAt(state, 400);
		expect(setPriority(state, enemy.id)).toBe(true);
		hit(state); hit(state); step(state, 0.05);
		expect(systems.sensors.integrity).toBe(30);
		expect(state.priority).toBeUndefined();
		expect(setPriority(state, enemy.id)).toBe(false);
		expect(repairSensors(state)).toBe(true);
		expect(setPriority(state, enemy.id)).toBe(true);
		expect(setPriority(state, undefined)).toBe(true);
		enemy.hp = 0; expect(setPriority(state, enemy.id)).toBe(false);
		expect(setPriority(state, NaN)).toBe(false);
	});
	test('offline turrets fire locally and missile guidance stops outside detection then recovers', function () {
		const state = quiet(); const sensors = systemsFor(state).sensors;
		build(state, 0, 'rail'); sensors.integrity = 0;
		const enemy = enemyAt(state, -96, -300); step(state, 0.05);
		expect(state.shots).toHaveLength(0);
		enemy.y = -160; step(state, 0.05);
		expect(state.shots.some(function (shot) { return shot.weapon === 'rail'; })).toBe(true);
		state.shots = []; enemy.y = -300;
		state.shots.push({ id: state.nextId++, x: 500, y: 500, vx: 100, vy: 0, damage: 1, side: 'player', weapon: 'missile', target: enemy.id, life: 4 });
		const missile = state.shots[0]; if (!missile) throw new Error('Missing missile');
		step(state, 0.05); expect(missile.vy).toBe(0);
		repairSensors(state); step(state, 0.05); expect(missile.vy).toBeLessThan(0);
	});
	test('guardian self-defense remains active outside offline ark range', function () {
		const state = quiet(); systemsFor(state).sensors.integrity = 0;
		deploy(state, 'guardian'); const guardian = state.escorts[0]; if (!guardian) throw new Error('Missing guardian');
		guardian.x = 0; guardian.y = -230; enemyAt(state, 0, -320);
		step(state, 0.05);
		expect(state.shots.some(function (shot) { return shot.weapon === 'escort'; })).toBe(true);
	});
});

describe('interceptable bomber disruption', function () {
	test('shield and escort interception prevent sensor damage; partial overflow scales it', function () {
		const state = quiet(); const systems = systemsFor(state);
		hit(state); step(state, 0.05); expect(systems.sensors.integrity).toBe(100);
		deploy(state, 'guardian'); const guardian = state.escorts[0]; if (!guardian) throw new Error('Missing guardian');
		guardian.x = 0; guardian.y = 0; systems.shield.charge = 0;
		hit(state); step(state, 0.05); expect(systems.sensors.integrity).toBe(100);
		state.escorts = []; systems.shield.charge = 17;
		hit(state); step(state, 0.05); expect(systems.sensors.integrity).toBe(82.5);
		expect(state.hull).toBe(MAX_HULL - 17);
	});
	test('Aegis only discounts hull overflow; pulse clears disruption rounds', function () {
		const state = quiet(); const systems = systemsFor(state); systems.shield.charge = 0;
		hit(state); pulse(state); step(state, 0.05); expect(systems.sensors.integrity).toBe(100);
		systems.shield.charge = 0; hit(state); step(state, 0.05);
		expect(systems.sensors.integrity).toBe(65); expect(state.hull).toBeCloseTo(MAX_HULL - 6.8);
	});
	test('damage is bounded, ordinary rounds do not disrupt, and crossings count once', function () {
		const state = quiet(); const systems = systemsFor(state); systems.shield.charge = 0;
		hit(state, 1, 0); step(state, 0.05); expect(systems.sensors.integrity).toBe(100);
		for (let i = 0; i < 5; i++) hit(state, 34, 1000);
		step(state, 0.05); expect(systems.sensors.integrity).toBe(0); expect(systems.sensors.impairments).toBe(1);
		advance(state, 2); expect(systems.sensors.integrity).toBe(0);
	});
	test('real drill bomber rounds penetrate depleted shields and sensors can be restored', function () {
		const state = createState({ scenario: 'drill' }); state.status = 'running';
		state.wave = 1; state.time = 22.95; state.nextWave = 23;
		const systems = systemsFor(state); systems.shield.charge = 0; systems.allocation = { engines: 4, weapons: 6, shields: 0 };
		for (let frame = 0; frame < 400 && systems.sensors.integrity >= 50; frame++) step(state, 0.05);
		expect(state.enemies.some(function (enemy) { return enemy.kind === 'bomber'; })).toBe(true);
		expect(systems.sensors.integrity).toBeLessThan(50); expect(systems.sensors.impairments).toBe(1);
		expect(state.hull).toBeLessThan(MAX_HULL); expect(state.message).toContain('Array-seeking round penetrated');
		expect(repairSensors(state)).toBe(true); expect(systems.sensors.integrity).toBe(100); expect(systems.sensors.repairs).toBe(1);
	});
});

describe('sensor repair commands and simulation clock', function () {
	test('repair costs exactly 70, restores full integrity, confirms and enforces cooldown', function () {
		const state = quiet(); const sensors = systemsFor(state).sensors;
		expect(repairSensors(state)).toBe(false); sensors.integrity = 0; state.salvage = 69;
		expect(repairSensors(state)).toBe(false); state.salvage = 70;
		expect(repairSensors(state)).toBe(true); expect(state.salvage).toBe(0);
		expect(sensors.integrity).toBe(100); expect(sensors.repairCooldown).toBe(SENSOR_CONFIG.repairCooldown);
		expect(state.message).toContain('Sensors restored'); sensors.integrity = 49; state.salvage = 100;
		expect(repairSensors(state)).toBe(false); advance(state, 18.05);
		expect(sensors.repairCooldown).toBe(0); expect(repairSensors(state)).toBe(true);
	});
	for (const restriction of ['paused', 'unfocused', 'won', 'lost'] as const) test(`${restriction} blocks repair and freezes cooldown`, function () {
		const state = quiet(); const sensors = systemsFor(state).sensors; sensors.integrity = 0; sensors.repairCooldown = 1;
		if (restriction === 'paused') state.paused = true;
		else if (restriction === 'unfocused') state.focused = false;
		else state.status = restriction;
		const snapshot = JSON.stringify(state); advance(state, 2); expect(JSON.stringify(state)).toBe(snapshot);
		sensors.repairCooldown = 0; expect(repairSensors(state)).toBe(false); expect(setPriority(state, undefined)).toBe(false);
	});
	test('fitting allows repair but freezes its cooldown', function () {
		const state = quiet(); state.status = 'fitting'; const sensors = systemsFor(state).sensors; sensors.integrity = 0;
		expect(repairSensors(state)).toBe(true); advance(state, 1); expect(sensors.repairCooldown).toBe(18);
	});
});
