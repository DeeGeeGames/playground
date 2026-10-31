import { describe, expect, test } from 'bun:test';
import { BOMBER_ATTACK, createState, deploy, ENEMIES, pulse, step, type State } from '../src/simulation';
import { bomberCue, placeBomberCue } from '../src/bomber-cue';

const setup = function (scenario?: 'drill' | 'systems') {
	const state = createState(scenario ? { scenario } : {});
	state.status = 'running'; state.nextWave = Infinity;
	state.systems.allocation = { engines: 4, weapons: 6, shields: 0 };
	state.systems.shield.charge = 0;
	state.enemies.push({ id: state.nextId++, kind: 'bomber', x: 0, y: -250, hp: 95, maxHp: 95, cooldown: 0 });
	return state;
};
const advance = function (state: State, seconds: number) { for (let i = 0; i < Math.round(seconds * 60); i++) step(state, 1 / 60); };
const bomber = function (state: State) { const enemy = state.enemies[0]; if (!enemy) throw new Error('Missing bomber'); return enemy; };
const untilShot = function (state: State) {
	for (let i = 0; i < 600; i++) { step(state, 1 / 60); if (state.shots.some(function (shot) { return shot.side === 'enemy'; })) return state.time; }
	throw new Error('Bomber did not release');
};

describe('bomber response window', function () {
	for (const scenario of [undefined, 'drill', 'systems'] as const) test(`${scenario ?? 'voyage'} prepares, releases once, then recovers`, function () {
		const state = setup(scenario); step(state, 1 / 60);
		expect(bomber(state).bomberAttack?.phase).toBe('windup');
		expect(bomberCue(state, bomber(state))?.text).toBe('ARRAY SHOT · 2.0s');
		advance(state, BOMBER_ATTACK.windup - 1 / 60); expect(state.shots).toHaveLength(0);
		step(state, 1 / 60); expect(state.shots).toHaveLength(1);
		expect(bomberCue(state, bomber(state))?.text).toBe('ARRAY · FIRED');
		expect(bomber(state).cooldown).toBe(ENEMIES.bomber.reload);
		advance(state, 0.4); expect(bomberCue(state, bomber(state))?.text).toBe('ARRAY · RECHARGING');
	});
	test('moving target is tracked, range loss cancels and returning requires full preparation', function () {
		const state = setup(); step(state, 1 / 60); advance(state, 1);
		bomber(state).x += 20; step(state, 1 / 60); expect(bomber(state).bomberAttack?.phase).toBe('windup');
		bomber(state).y = -1000; step(state, 1 / 60); expect(bomber(state).bomberAttack).toBeUndefined();
		bomber(state).x = state.ark.x; bomber(state).y = -250; step(state, 1 / 60);
		expect(bomber(state).bomberAttack).toEqual({ phase: 'windup', remaining: 2, target: undefined });
		advance(state, 1); expect(state.shots).toHaveLength(0);
	});
	test('escort loss cancels instead of transferring a ready shot to the ark', function () {
		const state = setup(); deploy(state, 'guardian'); const escort = state.escorts[0]; if (!escort) throw new Error('Missing escort');
		escort.x = 0; escort.y = -150; escort.cooldown = 100;
		step(state, 1 / 60); expect(bomber(state).bomberAttack).toEqual({ phase: 'windup', remaining: 2, target: escort.id });
		advance(state, 1); escort.hp = 0; step(state, 1 / 60);
		expect(bomber(state).bomberAttack).toBeUndefined(); expect(state.shots).toHaveLength(0);
		step(state, 1 / 60); expect(bomber(state).bomberAttack?.remaining).toBe(2);
	});
	test('a blocked firing line cancels; clearing it cannot release a stale shot', function () {
		const state = setup(); step(state, 1 / 60); advance(state, 1);
		state.systems.interdiction.field = { id: state.nextId++, world: { x: 0, y: -130 }, remaining: 10 };
		step(state, 1 / 60); expect(bomber(state).bomberAttack).toBeUndefined(); expect(state.shots).toHaveLength(0);
		state.systems.interdiction.field = undefined; step(state, 1 / 60); expect(bomber(state).bomberAttack?.remaining).toBe(2);
	});
	test('death during preparation prevents a ghost release', function () {
		const state = setup(); step(state, 1 / 60); advance(state, 1); bomber(state).hp = 0;
		advance(state, 3); expect(state.enemies).toHaveLength(0); expect(state.shots).toHaveLength(0);
	});
	test('same equipment: ignoring hits; post-release Aegis clears; early Aegis only mitigates hull', function () {
		const ignored = setup(); const release = untilShot(ignored); advance(ignored, 2);
		expect(ignored.systems.sensors.integrity).toBe(66); expect(ignored.hull).toBe(1166);
		const cleared = setup(); expect(untilShot(cleared)).toBe(release); expect(pulse(cleared)).toBe(true); advance(cleared, 2);
		expect(cleared.systems.sensors.integrity).toBe(100); expect(cleared.hull).toBe(1200);
		const early = setup(); step(early, 1 / 60); pulse(early); untilShot(early); advance(early, 2);
		// Three dimensional lead still reaches the array after an early pulse.
		expect(early.systems.sensors.integrity).toBe(66); expect(early.hull).toBeCloseTo(1193.2);
		const late = setup(); untilShot(late); advance(late, 2); pulse(late);
		expect(late.systems.sensors.integrity).toBe(66); expect(late.hull).toBe(1166);
	});
	test('eligible field blocks a released round', function () {
		const state = setup(); untilShot(state);
		state.systems.interdiction.field = { id: state.nextId++, world: { x: state.ark.x, y: -130 }, remaining: 10 };
		advance(state, 2); expect(state.systems.interdiction.blockedShots).toBe(1);
		expect(state.systems.sensors.integrity).toBe(100); expect(state.hull).toBe(1200);
	});
	for (const held of ['paused', 'unfocused', 'won', 'lost'] as const) test(`${held} freezes preparation without replay`, function () {
		const state = setup(); step(state, 1 / 60); advance(state, 1);
		if (held === 'paused') state.paused = true; else if (held === 'unfocused') state.focused = false; else state.status = held;
		const snapshot = JSON.stringify(state); advance(state, 5); expect(JSON.stringify(state)).toBe(snapshot);
		state.paused = false; state.focused = true; state.status = 'running';
		advance(state, 0.5); expect(state.shots).toHaveLength(0); advance(state, 0.5); expect(state.shots).toHaveLength(1);
		expect(createState().enemies).toHaveLength(0);
	});
	test('cues expose only living classified bombers in a running game', function () {
		const state = setup(); step(state, 1 / 60); const enemy = bomber(state);
		expect(bomberCue(state, enemy)).toBeDefined(); state.systems.sensors.integrity = 49;
		expect(bomberCue(state, enemy)).toBeUndefined(); enemy.y = -100;
		expect(bomberCue(state, enemy)).toBeDefined(); state.systems.sensors.integrity = 0;
		expect(bomberCue(state, enemy)).toBeUndefined(); state.systems.sensors.integrity = 100;
		enemy.hp = 0; expect(bomberCue(state, enemy)).toBeUndefined(); enemy.hp = 95; state.status = 'lost';
		expect(bomberCue(state, enemy)).toBeUndefined();
	});
});

test('six coincident cues remain separated in a small viewport, including screen edges', function () {
	const occupied: { x: number; y: number }[] = [];
	for (let i = 0; i < 6; i++) {
		const point = placeBomberCue({ x: 5, y: 5 }, 390, 320, occupied);
		if (!point) throw new Error('Missing cue placement');
		expect(point.x).toBeGreaterThanOrEqual(75); expect(point.y).toBeGreaterThanOrEqual(20);
		expect(occupied.every(function (other) { return Math.abs(other.y - point.y) >= 28; })).toBe(true);
		occupied.push(point);
	}
});
