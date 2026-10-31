import { enemyClearance } from '../src/interdiction';
import { expect, test } from 'bun:test';
import { avoidTraffic, hullClearance, resolveTraffic, traffic, type Hull } from '../src/ship-traffic';
import { fly } from '../src/flight';
import { createState, deploy, scramble, step, type State } from '../src/simulation';

const quiet = function (): State {
	const state = createState(); state.status = 'running'; state.nextWave = Infinity;
	state.systems.shield.capacity = 100000; state.systems.shield.charge = 100000;
	return state;
};
const separated = function (state: State): void {
	const hulls = traffic(state);
	for (const [index, a] of hulls.entries()) for (const b of hulls.slice(index + 1)) expect(hullClearance(a, b).gap).toBeGreaterThan(-0.01);
};

test('all factions and hull sizes separate even from coincident spawn positions without damage', function () {
	for (const kind of ['raider', 'bomber', 'armored', 'flagship', 'carrier'] as const) {
		const state = quiet();
		state.enemies.push({ id: state.nextId++, kind, x: 0, y: 0, hp: 100, maxHp: 100, cooldown: 999 });
		state.escorts.push({ id: state.nextId++, kind: 'guardian', x: 0, y: 0, hp: 100, cooldown: 999, angle: 0 });
		resolveTraffic(state); separated(state);
		expect(state.ark).toEqual({ x: 0, y: 0, angle: 0, speed: 0 });
		expect(state.enemies[0]?.hp).toBe(100); expect(state.escorts[0]?.hp).toBe(100);
	}
});

test('head-on craft steer apart before contact and pass rather than deadlock', function () {
	const a: Hull = { id: 1, point: { x: -160, y: 0 }, angle: 0, velocity: { x: 50, y: 0 }, radius: 10, spine: 10 };
	const b: Hull = { id: 2, point: { x: 160, y: 0 }, angle: Math.PI, velocity: { x: -50, y: 0 }, radius: 10, spine: 10 };
	const fa = { angle: 0, speed: 50, side: 1, course: 'intercept', run: 1 } as const;
	const fb = { ...fa, angle: Math.PI };
	const flightA = { ...fa }; const flightB = { ...fb };
	let lateral = 0;
	for (let frame = 0; frame < 600; frame++) {
		const da = avoidTraffic(a, { x: 50, y: 0 }, [a, b], 50);
		const db = avoidTraffic(b, { x: -50, y: 0 }, [a, b], 50);
		fly(a.point, flightA, da, 50, 3, 1 / 60); fly(b.point, flightB, db, 50, 3, 1 / 60);
		a.angle = flightA.angle; b.angle = flightB.angle;
		a.velocity = { x: Math.cos(a.angle) * flightA.speed, y: Math.sin(a.angle) * flightA.speed };
		b.velocity = { x: Math.cos(b.angle) * flightB.speed, y: Math.sin(b.angle) * flightB.speed };
		lateral = Math.max(lateral, Math.abs(a.point.y));
		expect(hullClearance(a, b).gap).toBeGreaterThan(0);
	}
	expect(lateral).toBeGreaterThan(15); expect(a.point.x).toBeGreaterThan(b.point.x);
});

test('escort wings launch, remain solid in flight, and recover to ready', function () {
	const state = quiet(); deploy(state, 'interceptor'); const wing = state.wings[0];
	if (!wing) throw new Error('Missing wing');
	scramble(state, wing.id, 'port');
	for (let frame = 0; frame < 5400; frame++) { step(state, 1 / 60); separated(state); }
	expect(wing.phase).toBe('ready'); expect(wing.craft).toHaveLength(3); expect(state.escorts).toHaveLength(0);
});

test('moving ark and mixed traffic remain solid and deterministic; pause freezes contacts', function () {
	const state = quiet();
	for (let i = 0; i < 8; i++) state.enemies.push({ id: state.nextId++, kind: i % 2 ? 'raider' : 'armored', x: 230 + i * 45, y: i % 2 ? 100 : -150, hp: 100000, maxHp: 100000, cooldown: 999 });
	const repeat = structuredClone(state);
	for (let frame = 0; frame < 1200; frame++) { step(state, 1 / 60); step(repeat, 1 / 60); separated(state); }
	expect(state).toEqual(repeat);
	state.paused = true; const frozen = structuredClone(state); step(state, 1 / 60); expect(state).toEqual(frozen);
});


test('crowd contact preserves interdiction clearance', function () {
	const state = quiet(); state.systems.interdiction.field = { id: 999, world: { x: 0, y: 300 }, remaining: 30 };
	for (const y of [170, 159]) state.enemies.push({ id: state.nextId++, kind: 'raider', x: 0, y, hp: 100, maxHp: 100, cooldown: 999 });
	resolveTraffic(state); separated(state);
	for (const enemy of state.enemies) expect(Math.hypot(enemy.x, enemy.y - 300)).toBeGreaterThanOrEqual(enemyClearance(enemy));
});
