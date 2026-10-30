import { describe, expect, test } from 'bun:test';
import { broadsideMuzzle } from '../src/flight';
import { createState, deploy, ENEMIES, setAllocation, step, type Enemy, type EnemyKind, type State } from '../src/simulation';

const quiet = function (): State {
	const state = createState(); state.status = 'running'; state.nextWave = Infinity;
	state.systems.shield.capacity = 100000; state.systems.shield.charge = 100000;
	return state;
};
const hostile = function (state: State, kind: EnemyKind, x: number, y: number): Enemy {
	const enemy: Enemy = { id: state.nextId++, kind, x, y, hp: 100000, maxHp: 100000, cooldown: 0 };
	state.enemies.push(enemy); return enemy;
};
const advance = function (state: State, seconds: number): void { for (let i = 0; i < Math.round(seconds * 60); i++) step(state, 1 / 60); };

describe('capital ship courses and batteries', function () {
	for (const kind of ['armored', 'flagship'] as const) for (const start of [{ x: 520, y: 0 }, { x: -520, y: 0 }, { x: 0, y: -460 }, { x: 0, y: 460 }]) {
		test(`${kind} intercepts from (${start.x}, ${start.y}), then travels parallel while firing broadsides`, function () {
			const state = quiet(); const enemy = hostile(state, kind, start.x, start.y);
			advance(state, 45);
			expect(enemy.flight?.course).toBe('broadside');
			const before = { x: enemy.x, y: enemy.y }; const charge = state.systems.shield.charge;
			let travel = 0;
			for (let frame = 0; frame < 480; frame++) { const x = enemy.x; step(state, 1 / 60); travel += Math.abs(enemy.x - x); }
			expect(travel).toBeGreaterThan(35);
			expect(Math.abs(enemy.y - before.y)).toBeLessThan(20);
			expect(Math.cos(enemy.flight?.angle ?? Math.PI)).toBeGreaterThan(0.98);
			expect(state.systems.shield.charge).toBeLessThan(charge);
			expect(Math.abs(enemy.y)).toBeGreaterThan(100);
		});
	}
	test('side banks fire from the presented hull edge and reject bow/stern targets', function () {
		const state = quiet(); const enemy = hostile(state, 'armored', 0, -160);
		enemy.flight = { angle: 0, speed: 20, side: -1, course: 'broadside', run: 1 };
		expect(broadsideMuzzle(enemy, { x: 0, y: 0 })).toEqual({ x: -10, y: -140 });
		expect(broadsideMuzzle(enemy, { x: 0, y: -300 })).toEqual({ x: -10, y: -180 });
		expect(broadsideMuzzle(enemy, { x: 200, y: -160 })).toBeUndefined();
		expect(broadsideMuzzle(enemy, { x: -200, y: -160 })).toBeUndefined();
		step(state, 1 / 60); const shot = state.shots.find(function (shot) { return shot.side === 'enemy'; });
		if (!shot) throw new Error('Missing broadside');
		const dx = shot.x - shot.vx / 60 - enemy.x; const dy = shot.y - shot.vy / 60 - enemy.y;
		const angle = enemy.flight.angle;
		expect(-Math.sin(angle) * dx + Math.cos(angle) * dy).toBeCloseTo(20);
	});
	test('leading a crossing escort cannot turn a broadside into a bow shot', function () {
		const state = quiet(); const enemy = hostile(state, 'armored', 0, -160);
		enemy.flight = { angle: 0, speed: 20, side: -1, course: 'broadside', run: 1 };
		state.escorts.push({ id: state.nextId++, kind: 'guardian', x: 90, y: -80, hp: 100000, cooldown: 999, angle: 0 });
		state.rally = { x: 400, y: -80 };
		step(state, 1 / 60);
		const shot = state.shots.find(function (shot) { return shot.side === 'enemy'; });
		if (!shot) throw new Error('Missing fallback broadside');
		// The escort's current bearing is in arc, but its predicted interception
		// point is ahead of the bank. The ark remains a legal broadside target.
		expect(shot.target).toBeUndefined();
		const direction = Math.atan2(shot.vy, shot.vx) - enemy.flight.angle;
		expect(Math.abs(Math.cos(direction))).toBeLessThanOrEqual(Math.sin(50 * Math.PI / 180));
	});
	for (const engines of [0, 10]) test(`world speed stays bounded through engine changes and gate arrival (${engines} engines)`, function () {
		const state = quiet(); const enemy = hostile(state, 'flagship', -300, -400);
		for (let frame = 0; frame < 3600; frame++) {
			if (frame === 600) setAllocation(state, { engines, weapons: 10 - engines, shields: 0 });
			if (frame === 1800) state.systems.distanceTraveled = state.systems.routeLength;
			const before = { x: enemy.x, y: enemy.y, distance: state.systems.distanceTraveled };
			step(state, 1 / 60);
			const worldX = enemy.x - before.x + state.systems.distanceTraveled - before.distance;
			expect(Math.hypot(worldX, enemy.y - before.y)).toBeLessThanOrEqual(ENEMIES.flagship.speed / 60 + 1e-8);
		}
		const before = { x: enemy.x, y: enemy.y }; advance(state, 5);
		expect(Math.hypot(enemy.x - before.x, enemy.y - before.y)).toBeGreaterThan(20);
	});
});

describe('fighter skirmishing', function () {
	for (const kind of ['raider', 'bomber'] as const) test(`${kind} keeps moving around the ark and takes repeated pot shots`, function () {
		const state = quiet(); const enemy = hostile(state, kind, 400, -100);
		advance(state, 20); const before = { x: enemy.x, y: enemy.y }; const charge = state.systems.shield.charge;
		const quadrants = new Set<string>();
		for (let i = 0; i < 4800; i++) { step(state, 1 / 60); quadrants.add(`${Math.sign(enemy.x)},${Math.sign(enemy.y)}`); }
		expect(quadrants.size).toBe(4); expect(state.systems.shield.charge).toBeLessThan(charge - 50);
		expect(Math.hypot(enemy.x - before.x, enemy.y - before.y)).toBeGreaterThan(30);
	});
	test('hostile and deployed interceptors maneuver, exchange fire, and resume ark attacks after escorts disappear', function () {
		const state = quiet(); deploy(state, 'interceptor'); state.rally = { x: 0, y: -180 };
		for (const escort of state.escorts) { escort.hp = 100000; escort.x = 0; escort.y = -150; }
		const enemy = hostile(state, 'raider', 60, -220); const before = structuredClone(state.escorts);
		let hostileShots = 0; let friendlyShots = 0;
		for (let frame = 0; frame < 600; frame++) {
			const nextId = state.nextId; step(state, 1 / 60);
			for (const shot of state.shots.filter(function (shot) { return shot.id >= nextId; })) {
				if (shot.side === 'enemy' && shot.target !== undefined) hostileShots++;
				if (shot.side === 'player') friendlyShots++;
			}
		}
		expect(hostileShots).toBeGreaterThan(2); expect(friendlyShots).toBeGreaterThan(5);
		expect(enemy.hp).toBeLessThan(100000);
		expect(state.escorts.some(function (craft, index) { const start = before[index]; return start && Math.hypot(craft.x - start.x, craft.y - start.y) > 30; })).toBe(true);
		state.escorts = []; const charge = state.systems.shield.charge; advance(state, 20);
		expect(state.systems.shield.charge).toBeLessThan(charge);
	});
	test('courses repeat deterministically and pause, focus loss and results freeze all flight state', function () {
		const state = quiet(); hostile(state, 'raider', 350, -100); hostile(state, 'armored', -500, 100);
		advance(state, 5); const repeat = structuredClone(state); advance(state, 20); advance(repeat, 20); expect(repeat).toEqual(state);
		for (const restriction of ['paused', 'unfocused', 'won', 'lost'] as const) {
			const frozen = structuredClone(state);
			if (restriction === 'paused') frozen.paused = true; else if (restriction === 'unfocused') frozen.focused = false; else frozen.status = restriction;
			const snapshot = structuredClone(frozen); advance(frozen, 3); expect(frozen).toEqual(snapshot);
		}
	});
});
