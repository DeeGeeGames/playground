import { describe, expect, test } from 'bun:test';
import { angleDelta, createState, distance, ENEMY_STATS, step, type Controls, type EnemyKind, type State } from '../src/simulation';
const idle: Controls = { drive: 0, stop: false, turn: 0, aim: { x: 900, y: 200 }, cannon: false, laser: false, missile: false, coolant: false };
const run = function (state: State, seconds: number, input = idle) { for (let i = 0; i < seconds * 60; i++) step(state, input, 1 / 60); };
const target = function (state: State, x = 900, y = 580) { state.enemies.push({ id: state.nextId++, x, y, angle: 0, cooldown: 100, hp: 100, maxHp: 100, heavy: false, kind: 'striker' }); };
describe('Iron Wake combat', function () {
	test('heavy drive accelerates gradually and turning uses the shortest angle', function () {
		const state = createState(); run(state, 0.1, { ...idle, drive: 1 });
		expect(state.player.speed).toBeGreaterThan(0); expect(state.player.speed).toBeLessThan(20);
		expect(Math.abs(angleDelta(Math.PI - 0.1, -Math.PI + 0.1) - 0.2)).toBeLessThan(0.001);
	});
	test('throttle persists after release and clamps in both directions', function () {
		const state = createState(); run(state, 1, { ...idle, drive: 1 });
		expect(state.player.throttle).toBeCloseTo(0.75);
		const speed = state.player.speed; run(state, 0.5);
		expect(state.player.throttle).toBeCloseTo(0.75); expect(state.player.speed).toBeGreaterThan(speed);
		run(state, 2, { ...idle, drive: 1 }); expect(state.player.throttle).toBe(1);
		run(state, 4, { ...idle, drive: -1 }); expect(state.player.throttle).toBe(-1);
		run(state, 2); expect(state.player.speed).toBeLessThan(-40); expect(state.player.speed).toBeGreaterThanOrEqual(-48);
	});
	test('neutral stops engine demand immediately while momentum decays', function () {
		const state = createState(); run(state, 1.5, { ...idle, drive: 1 });
		const speed = state.player.speed;
		step(state, { ...idle, stop: true, drive: 1 }, 1 / 60);
		expect(state.player.throttle).toBe(0); expect(state.player.speed).toBeGreaterThan(0); expect(state.player.speed).toBeLessThan(speed);
		run(state, 4); expect(state.player.throttle).toBe(0); expect(Math.abs(state.player.speed)).toBeLessThan(0.2);
		expect(createState().player.throttle).toBe(0);
	});
	test('cannon shell damages a target and has a reload interval', function () {
		const state = createState(); target(state); run(state, 0.4, { ...idle, cannon: true });
		expect(state.enemies[0]?.hp).toBe(62); expect(state.cannonIn).toBeGreaterThan(0);
	});
	test('laser hits the nearest target and overheats under sustained fire', function () {
		const state = createState(); target(state); target(state, 900, 500);
		run(state, 0.2, { ...idle, laser: true });
		expect(state.enemies[0]?.hp).toBeLessThan(100); expect(state.enemies[1]?.hp).toBe(100);
		run(state, 3.5, { ...idle, laser: true }); expect(state.player.overheated).toBe(true);
		const heat = state.player.heat; run(state, 0.2, { ...idle, cannon: true });
		expect(state.cannonIn).toBe(0); expect(state.player.heat).toBeLessThan(heat);
		run(state, 6); expect(state.player.overheated).toBe(false);
	});
	test('missiles lock closest to aim and salvo cannot spam', function () {
		const state = createState(); target(state); target(state, 1000, 550);
		step(state, { ...idle, missile: true, aim: { x: 1000, y: 550 } }, 1 / 60);
		expect(state.shots).toHaveLength(3); expect(state.shots.every(function (shot) { return shot.target === 2; })).toBe(true);
		step(state, { ...idle, missile: true }, 1 / 60); expect(state.shots).toHaveLength(3);
	});
	test('relay destruction loses and terminal states freeze', function () {
		const state = createState(); state.relay = 0; step(state, idle, 1 / 60);
		expect(state.outcome).toBe('lost'); const time = state.time; run(state, 1); expect(state.time).toBe(time);
	});
	test('clear waves repair armor and final wave wins', function () {
		const state = createState(); state.player.hp = 50; state.spawned = 5; run(state, 4.1);
		expect(state.wave).toBe(2); expect(state.player.hp).toBe(70);
		state.wave = 3; state.spawned = 9; state.enemies = []; state.shots = []; state.intermission = 0; run(state, 4.1);
		expect(state.outcome).toBe('won');
	});
	test('ignoring the assault eventually loses the relay', function () {
		const state = createState(); run(state, 160); expect(state.outcome).toBe('lost');
	});
	test('spawn warnings precede units and block wave completion', function () {
		const state = createState(); state.spawned = 4; state.spawnIn = 0;
		step(state, idle, 1 / 60);
		expect(state.warnings).toHaveLength(1); expect(state.enemies).toHaveLength(0); expect(state.intermission).toBe(0);
		run(state, 1.8); expect(state.enemies).toHaveLength(0);
		run(state, 0.3); expect(state.warnings).toHaveLength(0); expect(state.enemies).toHaveLength(1);
	});
	test('enemy roles have different movement speeds, engagement ranges and durability', function () {
		const positions = new Map<EnemyKind, number>();
		for (const kind of ['scout', 'striker', 'siege'] satisfies EnemyKind[]) {
			const state = createState(); state.spawnIn = 100;
			state.enemies.push({ id: 1, x: 100, y: 600, hp: ENEMY_STATS[kind].hp, maxHp: ENEMY_STATS[kind].hp, angle: 0, cooldown: 0, heavy: kind === 'siege', kind });
			run(state, 1); positions.set(kind, state.enemies[0]?.x ?? 0);
		}
		expect(positions.get('scout') ?? 0).toBeGreaterThan(positions.get('striker') ?? 0);
		expect(positions.get('striker') ?? 0).toBeGreaterThan(positions.get('siege') ?? 0);
		expect(ENEMY_STATS.siege.hp).toBeGreaterThan(ENEMY_STATS.striker.hp);
		expect(ENEMY_STATS.siege.range).toBeGreaterThan(ENEMY_STATS.striker.range);
		expect(ENEMY_STATS.striker.range).toBeGreaterThan(ENEMY_STATS.scout.range);
	});
	test('coolant is edge-triggered, bounded and clears a cooled lockout', function () {
		const state = createState(); state.player.heat = 90; state.player.overheated = true;
		step(state, { ...idle, coolant: true }, 1 / 60);
		expect(state.player.heat).toBeLessThan(35); expect(state.player.overheated).toBe(false);
		expect(state.coolantCharges).toBe(1); expect(state.events).toContain('coolant');
		state.player.heat = 90; run(state, 0.2, { ...idle, coolant: true }); expect(state.coolantCharges).toBe(1);
		step(state, idle, 1 / 60); step(state, { ...idle, coolant: true }, 1 / 60); expect(state.coolantCharges).toBe(0);
		step(state, idle, 1 / 60); step(state, { ...idle, coolant: true }, 1 / 60); expect(state.coolantCharges).toBe(0);
	});
	test('salvage repairs and resupplies by proximity, without wasting full supplies', function () {
		const state = createState(); state.player.hp = 90; state.coolantCharges = 2;
		state.salvage.push({ id: 1, x: state.player.x, y: state.player.y, kind: 'repair', life: 45 }, { id: 2, x: state.player.x, y: state.player.y, kind: 'coolant', life: 45 });
		step(state, idle, 1 / 60); expect(state.player.hp).toBe(100); expect(state.coolantCharges).toBe(3); expect(state.salvage).toHaveLength(0);
		state.salvage.push({ id: 3, x: state.player.x, y: state.player.y, kind: 'repair', life: 45 });
		step(state, idle, 1 / 60); expect(state.salvage).toHaveLength(1);
		state.player.hp = 0;
		step(state, idle, 1 / 60); expect(state.outcome).toBe('lost'); expect(state.player.hp).toBe(0);
	});
	test('kills leave wrecks and deterministic salvage, and events do not replay after terminal state', function () {
		const state = createState(); target(state); target(state, 1200, 300);
		for (const enemy of state.enemies) enemy.hp = 0;
		step(state, idle, 1 / 60); expect(state.kills).toBe(2); expect(state.wrecks).toHaveLength(2); expect(state.salvage[0]?.kind).toBe('repair');
		expect(state.events).toContain('explosion');
		state.relay = 0; step(state, idle, 1 / 60); expect(state.events).toContain('defeat');
		step(state, idle, 1 / 60); expect(state.events).toHaveLength(0);
	});
	test('cannon uses the nearest swept hit and does not propel a neutral mech backward', function () {
		const state = createState(); state.spawnIn = 100;
		target(state, 900, 580); target(state, 900, 590);
		state.shots.push({ x: 900, y: 650, vx: 0, vy: -4000, life: 1, kind: 'cannon', target: undefined, damage: 38 });
		step(state, { ...idle, cannon: true }, 0.04);
		expect(state.enemies[0]?.hp).toBe(100); expect(state.enemies[1]?.hp).toBe(62); expect(state.player.speed).toBe(0);
	});
	test('a simple aim-and-manage-heat strategy can clear all three waves', function () {
		const state = createState();
		for (let tick = 0; tick < 60 * 180 && state.outcome === 'playing'; tick++) {
			const target = [...state.enemies].sort(function (a, b) { return distance(a, state.player) - distance(b, state.player); })[0];
			step(state, { ...idle, aim: target ?? idle.aim, cannon: Boolean(target), laser: Boolean(target) && state.player.heat < 75, missile: Boolean(target), coolant: state.player.heat > 85 }, 1 / 60);
		}
		expect(state.outcome).toBe('won'); expect(state.kills).toBe(21); expect(state.relay).toBeGreaterThan(0);
	});

});
