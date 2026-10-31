import { expect, test } from 'bun:test';
import { CARRIER_BAYS, CARRIER_LAUNCH, craftScale } from '../src/ship-config';
import { createState, embarkFighters, ENEMIES, step, type Enemy, type State } from '../src/simulation';
import { enemyClearance } from '../src/interdiction';

const setup = function () {
	const state = createState(); state.status = 'running'; state.nextWave = Infinity;
	state.systems.allocation = { engines: 0, weapons: 0, shields: 10 };
	const carrier: Enemy = { id: state.nextId++, kind: 'carrier', x: 0, y: -380, hp: ENEMIES.carrier.hp, maxHp: ENEMIES.carrier.hp, cooldown: 0,
		flight: { angle: 0.7, speed: 0, side: -1, course: 'broadside', run: 1 }, hangar: { remaining: 4, launched: 0, cooldown: 0 } };
	state.enemies.push(carrier); return { state, carrier };
};
const advance = function (state: State, seconds: number) { for (let tick = 0; tick < seconds * 60; tick++) step(state, 1 / 60); };

test('wave manifests embark every raider and retain other ships', function () {
	const arrivals = embarkFighters([
		{ kind: 'raider', at: 1, x: 20, y: -2200 }, { kind: 'raider', at: 2, x: 50, y: -2200 },
		{ kind: 'raider', at: 3, x: 20, y: 2200 }, { kind: 'bomber', at: 4, x: 0, y: 2200 },
	]);
	expect(arrivals.map(function (arrival) { return arrival.kind; })).toEqual(['carrier', 'carrier', 'bomber']);
	expect(arrivals.map(function (arrival) { return arrival.fighters; })).toEqual([2, 1, undefined]);
});

test('finite complement launches from all four rotated model anchors then stops', function () {
	const { state, carrier } = setup();
	for (const bay of CARRIER_BAYS) {
		if (carrier.hangar) carrier.hangar.cooldown = 0;
		const before = state.enemies.length; step(state, 1 / 60);
		expect(state.enemies.length).toBe(before + 1);
		const fighter = state.enemies.at(-1); if (!fighter || !carrier.flight) throw new Error('Missing launch');
		const c = Math.cos(carrier.flight.angle); const s = Math.sin(carrier.flight.angle); const scale = craftScale('carrier');
		expect(fighter.x).toBeCloseTo(carrier.x + scale * (c * bay.x - s * bay.y));
		expect(fighter.y).toBeCloseTo(carrier.y + scale * (s * bay.x + c * bay.y));
		expect(fighter.launchedBy).toBe(carrier.id); expect(fighter.flight?.angle).toBe(carrier.flight.angle);
		expect(fighter.launchRemaining).toBe(CARRIER_LAUNCH.clearanceTime);
	}
	advance(state, 6); expect(state.enemies.filter(function (enemy) { return enemy.kind === 'raider'; })).toHaveLength(4);
	expect(carrier.hangar?.remaining).toBe(0);
});

test('approach retains housed fighters; destruction cancels remaining launches but keeps airborne fighters', function () {
	const { state, carrier } = setup(); carrier.y = -2000; advance(state, 1);
	expect(state.enemies).toHaveLength(1); expect(carrier.hangar?.remaining).toBe(4);
	carrier.y = -380; step(state, 1 / 60); expect(state.enemies).toHaveLength(2);
	carrier.hp = 0; advance(state, 5);
	expect(state.enemies).toHaveLength(1); expect(state.enemies[0]?.launchedBy).toBe(carrier.id);
});

test('pause and lost focus freeze hangars and departing fighters', function () {
	const { state } = setup(); step(state, 1 / 60);
	for (const paused of [true, false]) {
		state.paused = paused; state.focused = paused;
		const before = structuredClone(state); advance(state, 2); expect(state).toEqual(before);
	}
});

test('a field across a forward departure corridor holds the fighter until the path clears', function () {
	const { state, carrier } = setup(); carrier.x = 40; carrier.y = 42;
	carrier.flight = { angle: 0, speed: 0, side: 1, course: 'broadside', run: 1 };
	carrier.hangar = { remaining: 1, launched: 3, cooldown: 0 };
	state.systems.interdiction.field = { id: 99, world: { x: 300, y: 0 }, remaining: 30 };
	step(state, 1 / 60); expect(carrier.hangar.remaining).toBe(1); expect(state.enemies).toHaveLength(1);
	state.systems.interdiction.field = undefined; step(state, 1 / 60);
	expect(carrier.hangar.remaining).toBe(0); expect(state.enemies).toHaveLength(2);
});

test('a field placed during departure stops the fighter outside clearance', function () {
	const { state } = setup(); step(state, 1 / 60);
	const fighter = state.enemies.at(-1); if (!fighter || !fighter.flight) throw new Error('Missing fighter');
	const center = { x: fighter.x + Math.cos(fighter.flight.angle) * 150, y: fighter.y + Math.sin(fighter.flight.angle) * 150 };
	state.systems.interdiction.field = { id: 99, world: center, remaining: 30 };
	advance(state, 1);
	expect(Math.hypot(fighter.x - center.x, fighter.y - center.y)).toBeGreaterThanOrEqual(enemyClearance(fighter));
});
