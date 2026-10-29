import { describe, expect, test } from 'bun:test';
import { ARC, MAX_HULL, RELOAD, angleDelta, clamp, createState, cycleTarget, designateTarget, distance, hitFraction, inArc, sideAngle, step, targetFor, type Controls, type State } from '../src/simulation';

const idle: Controls = { drive: 0, turn: 0, neutral: false, port: false, starboard: false, brace: false, pulse: false, torpedo: false, autoFire: false };
const advance = function (state: State, seconds: number, input: Partial<Controls> = {}) {
	for (let i = 0; i < Math.round(seconds * 60); i++) step(state, { ...idle, ...input }, 1 / 60);
};
const quietState = function () {
	const state = createState();
	for (const enemy of state.enemies) { enemy.x = 20000 + enemy.id * 500; enemy.y = 20000; enemy.cooldown = 10000; }
	return state;
};

describe('capital ship handling', function () {
	test('throttle persists, accelerates gradually, and neutral preserves momentum', function () {
		const state = quietState(); advance(state, 2, { drive: 1 });
		expect(state.player.throttle).toBeCloseTo(0.9, 5);
		const speed = Math.hypot(state.player.vx, state.player.vy);
		expect(speed).toBeGreaterThan(5); expect(speed).toBeLessThan(30);
		advance(state, 3); expect(state.player.throttle).toBeCloseTo(0.9, 5);
		const beforeNeutral = Math.hypot(state.player.vx, state.player.vy);
		advance(state, 1 / 60, { neutral: true });
		expect(state.player.throttle).toBe(0);
		expect(Math.hypot(state.player.vx, state.player.vy)).toBeGreaterThan(beforeNeutral * 0.99);
		advance(state, 8); expect(Math.hypot(state.player.vx, state.player.vy)).toBeLessThan(beforeNeutral * 0.2);
	});
	test('rudder builds over two seconds and needs time to reverse', function () {
		const state = quietState(); const start = state.player.angle;
		advance(state, 0.5, { turn: 1 }); expect(state.player.yaw).toBeCloseTo(0.06, 5);
		expect(angleDelta(start, state.player.angle)).toBeLessThan(0.02);
		advance(state, 1.5, { turn: 1 }); expect(state.player.yaw).toBeCloseTo(0.24, 5);
		advance(state, 1, { turn: -1 }); expect(state.player.yaw).toBeGreaterThan(0.11);
		const before = state.player.angle; advance(state, 0.5);
		expect(angleDelta(before, state.player.angle)).toBeGreaterThan(0.03);
	});
	test('a turn changes the bow before it changes the velocity', function () {
		const state = quietState(); advance(state, 8, { drive: 1 }); advance(state, 3, { turn: 1 });
		const direction = Math.atan2(state.player.vy, state.player.vx);
		expect(Math.abs(angleDelta(direction, state.player.angle))).toBeGreaterThan(0.25);
	});
	test('reverse is capped and continues astern when released', function () {
		const state = quietState(); advance(state, 3, { drive: -1 });
		expect(state.player.throttle).toBe(-0.35); advance(state, 6);
		expect(state.player.vy).toBeGreaterThan(20); expect(state.player.throttle).toBe(-0.35);
	});
});

describe('broadside batteries', function () {
	test('starting targets are on opposite sides; the bow cannot acquire a target', function () {
		const state = createState(); expect(targetFor(state, 'port')).toBeDefined(); expect(targetFor(state, 'starboard')).toBeDefined();
		const p = state.player; const forward = { x: p.x + Math.cos(p.angle) * 400, y: p.y + Math.sin(p.angle) * 400 };
		expect(inArc(p, forward, 'port')).toBe(false); expect(inArc(p, forward, 'starboard')).toBe(false);
	});
	test('guns fire sequentially, impart recoil, and reload independently', function () {
		const state = quietState(); advance(state, 1 / 60, { port: true });
		expect(state.shells).toHaveLength(1); expect(state.batteries.port.remaining).toBe(5);
		expect(state.batteries.port.reload).toBe(RELOAD); expect(state.batteries.starboard.reload).toBe(0);
		expect(Math.hypot(state.player.vx, state.player.vy)).toBeGreaterThan(1);
		advance(state, 0.8); expect(state.shells).toHaveLength(6); expect(state.batteries.port.remaining).toBe(0);
		advance(state, 1 / 60, { port: true, starboard: true });
		expect(state.stats.salvos).toBe(2); expect(state.batteries.starboard.remaining).toBe(5);
	});
	test('a target crossing the bow cannot drag guns out of their side arc', function () {
		const state = createState(); const target = targetFor(state, 'port'); if (!target) throw new Error('Missing starting port target');
		advance(state, 1 / 60, { port: true }); target.x = state.player.x; target.y = state.player.y - 400; advance(state, 0.8);
		for (const shell of state.shells.filter(function (shot) { return !shot.hostile; })) {
			expect(Math.abs(angleDelta(sideAngle(state.player, 'port'), Math.atan2(shell.vy, shell.vx)))).toBeLessThanOrEqual(ARC + 0.0001);
		}
	});
	test('a well-aligned broadside destroys a frigate', function () {
		const state = createState(); advance(state, 3, { port: true });
		expect(state.kills).toBeGreaterThanOrEqual(1); expect(state.stats.hits).toBeGreaterThanOrEqual(5);
	});
	test('brace prevents new salvos, slows reload, and keeps a committed salvo firing', function () {
		const state = quietState(); advance(state, 0.1, { port: true }); const before = state.batteries.port.reload;
		advance(state, 1, { brace: true, port: true, starboard: true });
		expect(state.stats.salvos).toBe(1); expect(state.batteries.port.remaining).toBe(0);
		expect(before - state.batteries.port.reload).toBeCloseTo(0.45, 4);
	});
});

describe('combat and encounter lifecycle', function () {
	test('swept collision respects an oriented long hull and rejects misses', function () {
		const p = createState().player;
		expect(hitFraction({ x: -200, y: 0 }, { x: 200, y: 0 }, p)).toBeGreaterThan(0.35);
		expect(hitFraction({ x: -200, y: 120 }, { x: 200, y: 120 }, p)).toBeUndefined();
		expect(hitFraction(p, p, p)).toBe(0);
	});
	test('brace reduces an incoming hit by 65 percent', function () {
		const run = function (brace: boolean) {
			const state = quietState(); state.shells.push({ x: -40, y: 0, vx: 600, vy: 0, hostile: true, damage: 100, life: 1 });
			advance(state, 0.1, { brace }); return state;
		};
		expect(run(false).player.hp).toBe(MAX_HULL - 100);
		const braced = run(true); expect(braced.player.hp).toBe(MAX_HULL - 35); expect(braced.stats.damageBlocked).toBe(65);
	});
	test('enemy firing solutions lock during the tell', function () {
		const state = createState(); const enemy = state.enemies[0]; if (!enemy) throw new Error('Missing enemy');
		enemy.cooldown = 0; advance(state, 1 / 60); const aim = { ...enemy.aim }; expect(enemy.warning).toBeGreaterThan(1.7);
		advance(state, 1, { drive: 1, turn: 1 }); expect(enemy.aim).toEqual(aim);
		advance(state, 1); expect(state.shells.some(function (shell) { return shell.hostile; })).toBe(true);
	});
	test('a shell stops at the nearest hull, independently of enemy array order', function () {
		const state = createState(); const near = state.enemies[1]; const far = state.enemies[0]; if (!near || !far) throw new Error('Missing enemies');
		near.x = 150; near.y = 0; near.angle = 0; far.x = 300; far.y = 0; far.angle = 0;
		state.shells.push({ x: 0, y: 0, vx: 20000, vy: 0, hostile: false, damage: 58, life: 1 });
		step(state, idle, 1 / 30); expect(near.hp).toBe(near.maxHp - 58); expect(far.hp).toBe(far.maxHp);
	});
	test('contact transitions repair hull and final contact yields victory', function () {
		const state = createState(); state.player.hp = 500;
		for (let wave = 1; wave <= 3; wave++) { for (const enemy of state.enemies) enemy.hp = 0; advance(state, 6.1); }
		expect(state.outcome).toBe('won'); expect(state.kills).toBe(8); expect(state.player.hp).toBe(1060);
	});
	test('defeat takes precedence over contact completion and freezes the simulation', function () {
		const state = createState(); state.player.hp = 0; state.enemies = []; state.intermission = 6;
		step(state, idle, 1 / 60); expect(state.outcome).toBe('lost'); const time = state.time;
		advance(state, 10, { drive: 1, port: true }); expect(state.time).toBe(time); expect(state.stats.salvos).toBe(0);
	});
	test('a control-only helmsman can complete all three contacts', function () {
		const state = createState();
		for (let tick = 0; tick < 60 * 240 && state.outcome === 'playing'; tick++) {
			const p = state.player; const target = [...state.enemies].sort(function (a, b) { return distance(p, a) - distance(p, b); })[0];
			const bearing = target ? Math.atan2(target.y - p.y, target.x - p.x) : p.angle;
			const port = angleDelta(sideAngle(p, 'port'), bearing); const starboard = angleDelta(sideAngle(p, 'starboard'), bearing);
			const error = Math.abs(port) < Math.abs(starboard) ? port : starboard;
			step(state, { ...idle, drive: p.throttle < 0.22 ? 1 : 0, turn: target ? clamp(error * 1.8 - p.yaw * 2, -1, 1) : 0,
				port: !!targetFor(state, 'port'), starboard: !!targetFor(state, 'starboard'),
				brace: state.shells.some(function (shell) { return shell.hostile && distance(shell, p) < 160; }) }, 1 / 60);
		}
		expect(state.outcome).toBe('won'); expect(state.kills).toBe(8); expect(state.stats.salvos).toBeGreaterThanOrEqual(8);
	});
});

describe('alpha shield and fire control', function () {
	test('shield absorbs 85 percent without stacking with armor lock or blocking salvos', function () {
		const state = quietState();
		state.shells.push({ x: -40, y: 0, vx: 600, vy: 0, hostile: true, damage: 100, life: 1 });
		step(state, { ...idle, pulse: true, brace: true }, 1 / 60);
		expect(state.player.hp).toBe(MAX_HULL - 15); expect(state.stats.damageBlocked).toBe(85);
		expect(state.events).toContain('shield'); expect(state.events).toContain('shield-hit');
		advance(state, 0.1, { port: true });
		expect(state.stats.salvos).toBe(1); expect(state.shield.active).toBeGreaterThan(2.8);
	});
	test('shield expires and requires a fresh press after cooldown, including a held key', function () {
		const state = quietState(); step(state, { ...idle, pulse: true }, 1 / 60);
		advance(state, 19, { pulse: true });
		expect(state.shield.active).toBe(0); expect(state.shield.cooldown).toBe(0);
		state.shells.push({ x: -40, y: 0, vx: 600, vy: 0, hostile: true, damage: 100, life: 1 });
		step(state, { ...idle, pulse: true }, 1 / 60); expect(state.player.hp).toBe(MAX_HULL - 100);
		step(state, idle, 1 / 60); step(state, { ...idle, pulse: true }, 1 / 60);
		expect(state.shield.active).toBe(3); expect(state.shield.cooldown).toBe(18);
		const reset = createState(); expect(reset.shield.cooldown).toBe(0); expect(reset.priorityTarget).toBeUndefined();
	});
	test('shield also protects hull contact, with no drive or reload penalty', function () {
		const run = function (pulse: boolean) {
			const state = createState(); const enemy = state.enemies[0]; if (!enemy) throw new Error('Missing frigate');
			enemy.x = 0; enemy.y = 0; enemy.cooldown = 100;
			step(state, { ...idle, pulse, drive: 1, port: true }, 1 / 60); return state;
		};
		const normal = run(false); const shielded = run(true);
		expect(MAX_HULL - shielded.player.hp).toBeCloseTo((MAX_HULL - normal.player.hp) * 0.15, 8);
		expect(shielded.player.throttle).toBe(normal.player.throttle);
		expect(shielded.batteries.port.reload).toBe(normal.batteries.port.reload);
	});
	test('priority wins within its arc and falls back outside it; committed salvos keep their target', function () {
		const state = createState(); const near = state.enemies[0]; const far = state.enemies[1];
		if (!near || !far) throw new Error('Missing frigates');
		near.x = -300; near.y = 0; far.x = -500; far.y = 0;
		expect(targetFor(state, 'port')?.id).toBe(near.id);
		designateTarget(state, far.id); expect(targetFor(state, 'port')?.id).toBe(far.id);
		step(state, { ...idle, port: true }, 1 / 60); designateTarget(state, near.id);
		expect(state.batteries.port.target).toBe(far.id);
		designateTarget(state, far.id); far.x = 400; expect(targetFor(state, 'port')?.id).toBe(near.id);
		far.hp = 0; step(state, idle, 1 / 60); expect(state.priorityTarget).toBeUndefined();
		designateTarget(state, 999); expect(state.priorityTarget).toBeUndefined();
	});
	test('target cycling is deterministic, includes automatic mode, and ignores dead contacts', function () {
		const state = createState(); const first = state.enemies[0]; const second = state.enemies[1];
		if (!first || !second) throw new Error('Missing frigates');
		state.enemies.reverse(); cycleTarget(state); expect(state.priorityTarget).toBe(first.id);
		cycleTarget(state); expect(state.priorityTarget).toBe(second.id);
		cycleTarget(state); expect(state.priorityTarget).toBeUndefined();
		first.hp = 0; cycleTarget(state); expect(state.priorityTarget).toBe(second.id);
	});
});

test('heading orders take the shortest turn and settle despite existing yaw and armor lock', function () {
	for (const brace of [false, true]) {
		const state = quietState(); state.player.angle = Math.PI - 0.1; state.player.yaw = -0.1;
		const heading = -Math.PI + 0.4;
		advance(state, 1, { heading, brace });
		expect(state.player.yaw).toBeGreaterThan(0);
		advance(state, 25, { heading, brace });
		expect(Math.abs(angleDelta(state.player.angle, heading))).toBeLessThan(0.001);
		expect(Math.abs(state.player.yaw)).toBeLessThan(0.001);
		expect(state.player.throttle).toBe(0);
	}
});
