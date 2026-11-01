import { tactical } from '../src/combat-scale';
import { describe, expect, test } from 'bun:test';
import { worldPoint } from '../src/space';
import { circleHit, enemyClearance, fieldBlocks, fieldRelative, INTERDICTION_CONFIG } from '../src/interdiction';
import { createState, deploy, ENEMIES, interdictionReason, placeInterdiction, step, type Enemy, type EnemyKind, type State } from '../src/simulation';

const systemsFor = function (state: State) { if (!state.systems) throw new Error('Expected systems'); return state.systems; };
const quiet = function (engines = 0) {
	const state = createState(); state.status = 'running'; state.nextWave = Infinity;
	systemsFor(state).allocation = { engines, weapons: 10 - engines, shields: 0 };
	return state;
};
const advance = function (state: State, seconds: number, dt = 1 / 60) { for (let frame = 0; frame < Math.round(seconds / dt); frame++) step(state, dt); };
const hostile = function (state: State, kind: EnemyKind = 'raider', x = 600, y = 0): Enemy {
	const enemy: Enemy = { id: state.nextId++, kind, x: tactical(x), y: tactical(y), hp: 10000, maxHp: 10000, cooldown: 0 };
	state.enemies.push(enemy); return enemy;
};

describe('interdiction placement and lifecycle', function () {
	test('cost, capacity and rapid commands are atomic; placement input is copied', function () {
		const state = quiet(); const before = state.salvage; const point = { x: tactical(300), y: 0 };
		expect(placeInterdiction(state, point)).toBe(true); point.x = 0;
		for (let i = 0; i < 20; i++) expect(placeInterdiction(state, { x: 0, y: tactical(250) })).toBe(false);
		expect(state.salvage).toBe(before - INTERDICTION_CONFIG.cost);
		expect(systemsFor(state).interdiction).toMatchObject({ placements: 1, cooldown: 40, field: { world: { x: tactical(300), y: 0 }, remaining: 30 } });
		expect(systemsFor(createState()).interdiction).toEqual({ field: undefined, cooldown: 0, placements: 0, redirected: 0, blockedShots: 0 });
	});
	test('invalid finite/bounded points and circle-versus-ark overlap spend nothing', function () {
		const state = quiet();
		for (const point of [{ x: NaN, y: 0 }, { x: tactical(300), y: Infinity }, { x: tactical(451), y: 0 }, { x: -tactical(51), y: tactical(250) }, { x: 0, y: 0 }, { x: 145 + INTERDICTION_CONFIG.radius + INTERDICTION_CONFIG.minArkClearance, y: 0 }, { x: 0, y: 40 + INTERDICTION_CONFIG.radius + INTERDICTION_CONFIG.minArkClearance }, { x: 200, y: 140 }]) {
			const snapshot = JSON.stringify(state); expect(interdictionReason(state, point)).not.toBe(''); expect(placeInterdiction(state, point)).toBe(false); expect(JSON.stringify(state)).toBe(snapshot);
		}
		for (const point of [{ x: 146 + INTERDICTION_CONFIG.radius + INTERDICTION_CONFIG.minArkClearance, y: 0 }, { x: 0, y: 41 + INTERDICTION_CONFIG.radius + INTERDICTION_CONFIG.minArkClearance }, { x: -tactical(50), y: -tactical(250) }, { x: tactical(450), y: 0 }]) expect(interdictionReason(state, point)).toBe('');
		hostile(state, 'flagship', 300, 0); expect(placeInterdiction(state, { x: tactical(300), y: 0 })).toBe(false);
		state.enemies = []; state.salvage = 89; expect(placeInterdiction(state, { x: tactical(300), y: 0 })).toBe(false);
		expect(placeInterdiction(createState(), { x: tactical(300), y: 0 })).toBe(false);
	});
	for (const restriction of ['fitting', 'paused', 'unfocused', 'won', 'lost'] as const) test(`${restriction} rejects commands and freezes state`, function () {
		const state = quiet(); placeInterdiction(state, { x: tactical(300), y: 0 }); hostile(state); step(state, 0.05);
		if (restriction === 'paused') state.paused = true;
		else if (restriction === 'unfocused') state.focused = false;
		else state.status = restriction;
		const snapshot = JSON.stringify(state);
		expect(placeInterdiction(state, { x: tactical(300), y: 0 })).toBe(false); step(state, 0.05); expect(JSON.stringify(state)).toBe(snapshot);
	});
	for (const engines of [0, 1, 4, 10]) test(`${engines * tactical(1.5)}m/s preserves world anchoring under normal and doubled fixed steps`, function () {
		const state = quiet(engines); const systems = systemsFor(state); systems.distanceTraveled = 77; state.ark.x = 77;
		expect(placeInterdiction(state, worldPoint(state, { x: tactical(300), y: 0 }))).toBe(true); hostile(state);
		const twice = structuredClone(state);
		advance(state, 5); for (let frame = 0; frame < 150; frame++) { step(twice, 1 / 60); step(twice, 1 / 60); }
		expect(twice).toEqual(state); expect(systems.interdiction.field?.world).toEqual({ x: 77 + tactical(300), y: 0 });
		expect(fieldRelative(state)?.x).toBeCloseTo(tactical(300) - engines * tactical(1.5) * 5);
		state.paused = true; const frozen = JSON.stringify(state); advance(state, 3); expect(JSON.stringify(state)).toBe(frozen);
	});
	test('expiry clears all navigation and permits redeployment only after cooldown', function () {
		const state = quiet(); placeInterdiction(state, { x: tactical(300), y: 0 }); const enemy = hostile(state); step(state, 0.05);
		expect(enemy.detour).toBeDefined(); const field = systemsFor(state).interdiction.field; if (!field) throw new Error('Expected field');
		field.remaining = 0.02; const before = { x: enemy.x, y: enemy.y }; step(state, 0.05);
		expect(systemsFor(state).interdiction.field).toBeUndefined(); expect(enemy.detour).toBeUndefined(); expect(enemy.interdictionSide).toBeUndefined();
		expect(Math.hypot(enemy.x - before.x, enemy.y - before.y)).toBeLessThanOrEqual(tactical(2.5) + 1e-8);
		expect(placeInterdiction(state, { x: 0, y: tactical(250) })).toBe(false);
		advance(state, 40); expect(placeInterdiction(state, { x: 0, y: tactical(250) })).toBe(true); expect(systemsFor(state).interdiction.placements).toBe(2);
	});
	test('slower high-power ark keeps a side field until its lifetime', function () {
		const state = quiet(10); placeInterdiction(state, { x: -tactical(50), y: tactical(250) }); advance(state, 20.1);
		expect(systemsFor(state).interdiction.field).toBeDefined();
		advance(state, 10); expect(systemsFor(state).interdiction.field).toBeUndefined();
		expect(systemsFor(state).interdiction.cooldown).toBeGreaterThan(9);
	});
	test('new arrivals covered by a field enter farther out on their original bearing', function () {
		const state = quiet(); placeInterdiction(state, { x: 0, y: tactical(450) }); state.arrivals.push({ at: 0, kind: 'raider', x: 0, y: tactical(520) }); step(state, 0.05);
		const enemy = state.enemies[0]; if (!enemy) throw new Error('Missing arrival');
		expect(enemy.y).toBeGreaterThan(tactical(450) + INTERDICTION_CONFIG.radius); expect(Math.hypot(enemy.x, enemy.y - tactical(450))).toBeGreaterThan(INTERDICTION_CONFIG.radius);
	});
});

describe('field geometry and hostile fire', function () {
	test('segments include tangent, inside start, zero length and first entry without extending past endpoints', function () {
		const center = { x: 0, y: 0 };
		expect(circleHit({ x: -200, y: 0 }, { x: 200, y: 0 }, center, 110)).toEqual({ x: -110, y: 0 });
		expect(circleHit({ x: -200, y: 110 }, { x: 200, y: 110 }, center, 110)).toEqual({ x: 0, y: 110 });
		expect(circleHit({ x: -200, y: 110.01 }, { x: 200, y: 110.01 }, center, 110)).toBeUndefined();
		expect(circleHit(center, center, center, 110)).toEqual(center);
		expect(circleHit({ x: 200, y: 0 }, { x: 200, y: 0 }, center, 110)).toBeUndefined();
		expect(circleHit({ x: -200, y: 0 }, { x: -150, y: 0 }, center, 110)).toBeUndefined();
	});
	test('a bomber already at firing range maneuvers instead of parking or firing through the field', function () {
		const state = quiet(); placeInterdiction(state, { x: tactical(265), y: 0 }); const enemy = hostile(state, 'bomber', 400, 30);
		step(state, 0.05); expect(enemy.detour).toBeDefined(); expect(state.shots).toHaveLength(0); expect(enemy.y).not.toBe(tactical(30));
		let fired = false;
		for (let frame = 0; frame < 900; frame++) {
			const id = state.nextId; step(state, 1 / 60);
			for (const shot of state.shots.filter(function (shot) { return shot.id >= id && shot.side === 'enemy'; })) {
				fired = true; expect(fieldBlocks(state, shot.origin ?? enemy, { x: shot.x + shot.vx, y: shot.y + shot.vy })).toBe(false);
			}
		}
		expect(fired).toBe(true); expect(enemy.detour).toBeUndefined();
	});
	test('flying hostile rounds are consumed once with boundary FX; friendly rounds and hull are untouched', function () {
		const state = quiet(); placeInterdiction(state, { x: tactical(300), y: 0 });
		state.shots.push({ id: state.nextId++, x: tactical(450), y: 0, vx: -tactical(5000), vy: 0, damage: 99, side: 'enemy', weapon: 'hostile', target: undefined, life: 4 });
		state.shots.push({ id: state.nextId++, x: tactical(100), y: 0, vx: tactical(5000), vy: 0, damage: 99, side: 'player', weapon: 'rail', target: undefined, life: 4 });
		step(state, 0.05); expect(state.shots).toHaveLength(1); expect(state.shots[0]?.side).toBe('player');
		expect(state.effects.some(function (effect) { return effect.color === '#d7bf89' && effect.x === tactical(300) + INTERDICTION_CONFIG.radius && effect.radius === 20; })).toBe(true);
		expect(systemsFor(state).interdiction.blockedShots).toBe(1); expect(state.hull).toBe(1200); expect(state.kills).toBe(0);
		step(state, 0.05); expect(systemsFor(state).interdiction.blockedShots).toBe(1);
	});
	test('guardian and interceptor movement through the field is unaffected', function () {
		for (const kind of ['guardian', 'interceptor'] as const) {
			const direct = quiet(); direct.salvage = 1000; deploy(direct, kind); direct.rally = { x: tactical(420), y: 0 };
			const shaped = structuredClone(direct); placeInterdiction(shaped, { x: tactical(300), y: 0 });
			advance(direct, 8); advance(shaped, 8); expect(shaped.escorts).toEqual(direct.escorts);
		}
	});
	test('ark travel does not sweep a fixed world field across stationary rounds', function () {
		const state = quiet(10); placeInterdiction(state, { x: tactical(300), y: 0 });
		for (const side of ['enemy', 'player'] as const) state.shots.push({ id: state.nextId++, x: tactical(189.5), y: 0, vx: 0, vy: 0, damage: 5, side, weapon: side === 'enemy' ? 'hostile' : 'rail', target: undefined, life: 4 });
		step(state, 0.05); expect(state.shots.map(function (shot) { return shot.side; })).toEqual(['enemy', 'player']); expect(systemsFor(state).interdiction.blockedShots).toBe(0);
		expect(state.shots.every(function (shot) { return shot.x === tactical(189.5) && shot.y === 0; })).toBe(true);
		expect(systemsFor(state).interdiction.field?.world).toEqual({ x: tactical(300), y: 0 });
	});
});

describe('deterministic approach shaping', function () {
	for (const kind of ['raider', 'bomber'] as const) test(`${kind} takes a different approach and rejoins while the field is active`, function () {
		const direct = quiet(); const shaped = quiet(); placeInterdiction(shaped, { x: tactical(300), y: 0 });
		const plainEnemy = hostile(direct, kind); const enemy = hostile(shaped, kind); const hp = enemy.hp;
		advance(direct, 15); advance(shaped, 15);
		expect(Math.hypot(enemy.x - plainEnemy.x, enemy.y - plainEnemy.y)).toBeGreaterThan(60); expect(enemy.detour).toBeUndefined();
		expect(systemsFor(shaped).interdiction.field).toBeDefined(); expect(systemsFor(shaped).interdiction.redirected).toBe(1); expect(enemy.hp).toBe(hp); expect(shaped.kills).toBe(0);
	});
	for (const kind of ['raider', 'bomber', 'armored', 'flagship'] as const) for (const engines of [0, 1, 4, 10]) test(`${kind} at ${engines * tactical(1.5)}m/s maintains clearance, stable side and bounded movement`, function () {
		const state = quiet(engines); placeInterdiction(state, { x: tactical(300), y: 0 }); const enemy = hostile(state, kind);
		const speed = ENEMIES[kind].speed; let side: -1 | 1 | undefined;
		for (let frame = 0; frame < 1800; frame++) {
			const before = { x: enemy.x, y: enemy.y }; step(state, 1 / 60);
			expect(Math.hypot(enemy.x - before.x, enemy.y - before.y)).toBeLessThanOrEqual(speed / 60 + 1e-8);
			const center = systemsFor(state).interdiction.field?.world;
			if (center) expect(Math.hypot(enemy.x - center.x, enemy.y - center.y)).toBeGreaterThan(enemyClearance(enemy) - 12 - 1e-6);
			if (enemy.detour) { side ??= enemy.detour.side; expect(enemy.detour.side).toBe(side); }
		}
		expect(side).toBeDefined(); expect(enemy.detour).toBeUndefined(); expect(systemsFor(state).interdiction.redirected).toBe(1);
	});
	test('moving escort targets retain the chosen side and release when a clear target returns', function () {
		const state = quiet(); placeInterdiction(state, { x: tactical(300), y: 0 }); const enemy = hostile(state, 'raider', 450, 0); step(state, 0.05);
		const side = enemy.detour?.side; expect(side).toBeDefined();
		state.escorts.push({ id: state.nextId++, kind: 'guardian', x: tactical(300), y: tactical(10), hp: 100000, cooldown: 9999, angle: 0 });
		const escort = state.escorts[0]; if (!escort) throw new Error('Missing escort');
		for (let frame = 0; frame < 120; frame++) { escort.x = tactical(300); escort.y = frame % 2 ? -tactical(15) : tactical(15); state.rally = { x: tactical(300), y: escort.y }; step(state, 1 / 60); expect(enemy.detour?.side).toBe(side); }
		state.escorts = []; const before = { x: enemy.x, y: enemy.y }; advance(state, 15); expect(enemy.detour).toBeUndefined(); expect(Math.hypot(enemy.x - before.x, enemy.y - before.y)).toBeGreaterThan(50);
	});
	test('an escort inside the field cannot cause an infinite orbit and expiry releases the attacker', function () {
		const state = quiet(); placeInterdiction(state, { x: tactical(300), y: 0 }); const enemy = hostile(state, 'raider', 450, 0);
		state.escorts.push({ id: state.nextId++, kind: 'guardian', x: tactical(300), y: 0, hp: 100000, cooldown: 9999, angle: 0 });
		const escort = state.escorts[0]; if (!escort) throw new Error('Missing escort');
		state.rally = { x: tactical(255), y: 0 };
		for (let frame = 0; frame < 1500; frame++) { escort.x = tactical(300); escort.y = 0; step(state, 1 / 60); }
		expect(enemy.detour).toBeDefined(); const before = { x: enemy.x, y: enemy.y };
		for (let frame = 0; frame < 120; frame++) { escort.x = tactical(300); escort.y = 0; step(state, 1 / 60); }
		// Thrusters settle with sub-decimeter drift rather than snapping to rest.
		expect(Math.hypot(enemy.x - before.x, enemy.y - before.y)).toBeLessThan(0.05); expect(state.shots).toHaveLength(0);
		advance(state, 3.1); expect(enemy.detour).toBeUndefined(); expect(enemy.x).not.toBe(before.x); expect(systemsFor(state).interdiction.field).toBeUndefined();
	});

});
