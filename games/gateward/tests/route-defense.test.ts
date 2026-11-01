import { expect, test } from 'bun:test';
import { ENCOUNTER_SPAWN, spawnArrivals } from '../src/route-defense';
import { build, createState, distance, setAllocation, step, type State } from '../src/simulation';
import { systemsResultMessage } from '../src/trial-summary';

const advance = function (state: State, seconds: number): void {
	for (let tick = 0; tick < seconds * 20; tick++) step(state, 0.05);
};

test('spawn points wait outside activation range and route progress deploys later groups', function () {
	const state = createState(); setAllocation(state, { engines: 0, weapons: 4, shields: 6 });
	state.status = 'running'; step(state, 0.05);
	expect(state.wave).toBe(1); expect(state.enemies).toHaveLength(2);
	const positions = state.enemies.map(function (enemy) { return { x: enemy.x, y: enemy.y }; });
	advance(state, 20);
	expect(state.wave).toBe(1);
	for (const [index, enemy] of state.enemies.entries()) {
		expect(enemy.spawn?.activated).toBe(false);
		expect(enemy.x).toBeCloseTo(positions[index]?.x ?? NaN);
		expect(enemy.y).toBeCloseTo(positions[index]?.y ?? NaN);
		expect(enemy.hangar?.launched).toBe(0);
	}
	state.systems.distanceTraveled = state.nextWave; state.ark.x = state.nextWave;
	step(state, 0.05); expect(state.wave).toBe(2);
	state.paused = true; const paused = structuredClone(state); advance(state, 3); expect(state).toEqual(paused);
});

test('each route spawn is twice its previous distance from the ark, including translated routes', function () {
	const state = createState(); state.wave = 2; state.routeOrigin = { x: 5000, y: 7000 }; state.ark.x = 5320; state.ark.y = 7030;
	for (const [i, arrival] of spawnArrivals(state, 5).entries()) {
		const original = { x: 5000 + state.systems.routeLength * 2 / 6 + (i % 3 - 1) * 100, y: 7000 + (i % 2 === 0 ? -1 : 1) * (400 + i % 3 * 100) };
		expect(distance(state.ark, arrival)).toBeCloseTo(distance(state.ark, original) * 2);
		expect(arrival.spawn?.point).toEqual({ x: arrival.x, y: arrival.y });
	}
});

test('translated routes preserve both flanks and launched fighters inherit activation independently', function () {
	const state = createState(); state.routeOrigin = { x: 5000, y: 7000 }; state.ark.x = 5000; state.ark.y = 7000;
	state.status = 'running'; step(state, 0.05); state.nextWave = Infinity;
	expect(state.enemies.filter(function (enemy) { return enemy.kind === 'carrier'; })).toHaveLength(2);
	const carrier = state.enemies[0]; if (!carrier?.spawn) throw new Error('Missing carrier');
	state.ark.x = carrier.spawn.point.x; state.systems.distanceTraveled = carrier.spawn.distance;
	advance(state, 2);
	const fighter = state.enemies.find(function (enemy) { return enemy.launchedBy === carrier.id; });
	expect(fighter?.spawn).toEqual(carrier.spawn);
	expect(fighter?.spawn).not.toBe(carrier.spawn);
	expect(fighter?.spawn?.activated).toBe(true);
});

test('activation follows the enemy position, persists beyond its spawn, and enables carrier launches', function () {
	const state = createState(); state.status = 'running'; step(state, 0.05); state.nextWave = Infinity;
	setAllocation(state, { engines: 0, weapons: 4, shields: 6 });
	const carrier = state.enemies[0]; if (!carrier?.spawn || !carrier.hangar) throw new Error('Missing carrier');
	// Move the ship away from the recorded origin to distinguish live proximity.
	carrier.x += 4000;
	state.ark.x = carrier.x; state.ark.y = carrier.y + ENCOUNTER_SPAWN.activationRange - 1;
	step(state, 0.05); expect(carrier.spawn.activated).toBe(true);
	advance(state, 2); expect(carrier.hangar.launched).toBeGreaterThan(0);
	const before = { x: carrier.x, y: carrier.y };
	state.ark.x += 5000; state.systems.distanceTraveled = carrier.spawn.distance + 2000;
	advance(state, 4);
	expect(carrier.spawn.activated).toBe(true);
	expect(distance(carrier, before)).toBeGreaterThan(1);
	expect(distance(carrier, carrier.spawn.point)).toBeGreaterThan(1000);
});

test('a damaging shot activates an enemy outside proximity range without allowing out-of-range fire', function () {
	const state = createState(); state.status = 'running'; step(state, 0.05); state.nextWave = Infinity;
	setAllocation(state, { engines: 0, weapons: 4, shields: 6 });
	const enemy = state.enemies[0]; if (!enemy?.spawn) throw new Error('Missing enemy');
	expect(distance(state.ark, enemy)).toBeGreaterThan(ENCOUNTER_SPAWN.activationRange);
	state.shots.push({ id: state.nextId++, x: enemy.x, y: enemy.y, vx: 0, vy: 0, damage: 1, side: 'player', weapon: 'rail', target: enemy.id, life: 1 });
	step(state, 0.05); expect(enemy.spawn.activated).toBe(true); expect(enemy.hp).toBeLessThan(enemy.maxHp);
	state.ark.x -= 5000; advance(state, 2);
	expect(enemy.spawn.activated).toBe(true); expect(enemy.hangar?.launched).toBe(0);
	expect(state.shots.filter(function (shot) { return shot.side === 'enemy'; })).toHaveLength(0);
});

test('arrival wins with pending and surviving contacts, freezes results, and same-tick hull loss still wins precedence', function () {
	for (const destroyed of [false, true]) {
		const state = createState(); build(state, 0, 'flak'); state.status = 'running';
		state.systems.distanceTraveled = state.systems.routeLength; state.ark.x = state.systems.routeLength;
		state.enemies.push({ id: state.nextId++, kind: 'flagship', x: state.ark.x - 500, y: 500, hp: 2400, maxHp: 2400, cooldown: 999 });
		state.arrivals.push({ at: 500, kind: 'bomber', x: 500, y: 0 });
		if (destroyed) {
			state.hull = 1; state.systems.shield.charge = 0;
			state.shots.push({ id: state.nextId++, x: state.ark.x, y: state.ark.y, vx: 0, vy: 0, damage: 10, side: 'enemy', weapon: 'hostile', target: undefined, life: 1 });
		}
		step(state, 0.05); expect<State['status']>(state.status).toBe(destroyed ? 'lost' : 'won');
		expect(state.resultReason).toBe(destroyed ? 'hull' : 'arrival');
		if (!destroyed) expect(systemsResultMessage(state)).toContain('surviving hostiles');
		const ended = structuredClone(state); advance(state, 1); expect(state).toEqual(ended);
	}
});

test('all five distance-triggered lines retain trial compositions without a flagship finale', function () {
	const state = createState(); setAllocation(state, { engines: 0, weapons: 4, shields: 6 }); state.status = 'running';
	const expected = [{ kind: 'raider', count: 8 }, { kind: 'bomber', count: 6 }, { kind: 'armored', count: 3 }, { kind: 'raider', count: 10 }, { kind: 'bomber', count: 3 }];
	for (const [index, encounter] of expected.entries()) {
		state.systems.distanceTraveled = state.nextWave; state.ark.x = state.nextWave;
		step(state, 0.05); expect(state.wave).toBe(index + 1);
		const station = state.systems.routeLength * (index + 1) / 6;
		const line = state.enemies.filter(function (enemy) { return enemy.spawn?.distance === station; });
		const count = line.filter(function (enemy) { return enemy.kind === encounter.kind; }).length + (encounter.kind === 'raider' ? line.reduce(function (sum, enemy) { return sum + (enemy.hangar?.remaining ?? 0); }, 0) : 0);
		expect(count).toBe(encounter.count);
		expect(line.every(function (enemy) { return enemy.x > state.ark.x && enemy.kind !== 'flagship'; })).toBe(true);
	}
	expect(state.nextWave).toBe(Infinity); expect(state.enemies.some(function (enemy) { return enemy.kind === 'flagship'; })).toBe(false);
});
