import { expect, test } from 'bun:test';
import { enemyClearance } from '../src/interdiction';
import { contactIntel, SENSOR_CONFIG } from '../src/sensors';
import { APPROACH, build, contactWarning, covered, createState, distance, mountTarget, setAllocation, setPriority, step, type Enemy, type State } from '../src/simulation';

const startApproach = function (engines: number): { state: State; enemy: Enemy } {
	const state = createState({ scenario: 'drill' });
	setAllocation(state, { engines, weapons: 10 - engines, shields: 0 });
	state.status = 'running'; step(state, 1 / 60);
	const enemy = state.enemies[0];
	if (!enemy) throw new Error('Expected first real approach');
	state.nextWave = Infinity; state.arrivals = []; state.enemies = [enemy];
	return { state, enemy };
};

test('real approaches spawn outside detection and never reveal scheduled composition', function () {
	const state = createState({ scenario: 'systems' });
	expect(contactWarning(state)).toBe('Scanning for contacts');
	state.status = 'running'; step(state, 1 / 60);
	expect(state.enemies.length).toBeGreaterThan(0);
	for (const enemy of state.enemies) {
		expect(distance(state.ark, enemy)).toBeGreaterThan(SENSOR_CONFIG.healthyDetectionRange);
		expect(distance(state.ark, enemy)).toBeLessThanOrEqual(APPROACH.spawnRange + 1);
		expect(contactIntel(state, enemy)).toBe('unseen');
		expect(setPriority(state, enemy.id)).toBe(false);
	}
	expect(contactWarning(state)).toBe('Scanning for contacts');
});

for (const engines of [0, 4, 10]) test(`real approach with ${engines} engine power crosses both sensor bands continuously`, function () {
	const { state, enemy } = startApproach(engines);
	let detection: number | undefined; let shortEntry: number | undefined; let classified: number | undefined;
	for (let frame = 0; frame < 4800 && classified === undefined; frame++) {
		const before = { x: enemy.x, y: enemy.y };
		step(state, 1 / 60);
		expect(distance(before, enemy)).toBeLessThanOrEqual(APPROACH.cruiseSpeed / 60 + 1e-8);
		const intel = contactIntel(state, enemy);
		if (detection === undefined && intel !== 'unseen') detection = state.time;
		if (shortEntry === undefined && distance(state.ark, enemy) <= SENSOR_CONFIG.shortRange) shortEntry = state.time;
		if (intel === 'classified') classified = state.time;
		if (intel === 'detected') expect(contactWarning(state)).toBe('PORT · unclassified contact');
	}
	if (detection === undefined || shortEntry === undefined || classified === undefined) throw new Error('Approach never crossed all sensor boundaries');
	expect(detection).toBeLessThan(shortEntry); expect(shortEntry).toBeLessThan(classified);
	expect(shortEntry - detection).toBeGreaterThan(20);
	expect(shortEntry - detection).toBeLessThan(40);
	expect(classified).toBeLessThan(70);
	expect(enemy.approaching).toBe(false);
});

test('long-range priority cannot extend a weapon range or firing arc', function () {
	const { state, enemy } = startApproach(4);
	state.salvage = 1000; build(state, 0, 'rail');
	for (let frame = 0; frame < 1200 && contactIntel(state, enemy) === 'unseen'; frame++) step(state, 1 / 60);
	expect(contactIntel(state, enemy)).toBe('detected');
	expect(setPriority(state, enemy.id)).toBe(true);
	const mount = state.mounts[0]; if (!mount) throw new Error('Missing mount');
	expect(covered(state, mount, enemy)).toBe(false); expect(mountTarget(state, mount)).toBeUndefined();
	step(state, 1 / 60);
	expect(state.shots.filter(function (shot) { return shot.side === 'player'; })).toHaveLength(0);
});

test('an approach remains world anchored and pause freezes both motion and scheduled arrivals', function () {
	const { state, enemy } = startApproach(4);
	const before = { x: enemy.x, y: enemy.y };
	state.ark.x += 1000; step(state, 1 / 60);
	expect(distance(before, enemy)).toBeLessThanOrEqual(APPROACH.cruiseSpeed / 60 + 1e-8);
	state.paused = true;
	const paused = structuredClone(state);
	for (let frame = 0; frame < 120; frame++) step(state, 1 / 60);
	expect(state).toEqual(paused);
});

// A deployed field can drift astern while remaining active. Cruise steering must
// honor it before the contact crosses the short-range boundary.
test('cruising contacts respect an active field astern', function () {
	const state = createState(); state.nextWave = Infinity;
	setAllocation(state, { engines: 0, weapons: 10, shields: 0 }); state.status = 'running';
	state.systems.interdiction.field = { id: 500, world: { x: -640, y: 0 }, remaining: 10 };
	const enemy: Enemy = { id: state.nextId++, approaching: true, x: -800, y: 0, kind: 'raider', hp: 45, maxHp: 45, cooldown: 99 };
	state.enemies = [enemy];
	for (let frame = 0; frame < 180; frame++) {
		step(state, 1 / 60);
		expect(distance(enemy, { x: -640, y: 0 })).toBeGreaterThanOrEqual(enemyClearance(enemy));
	}
	expect(state.systems.interdiction.redirected).toBe(1);
});
