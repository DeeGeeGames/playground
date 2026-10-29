import { describe, expect, test } from 'bun:test';
import { DEFENSE_RELOAD, MAX_HULL, TORPEDO_RELOAD, angleDelta, clamp, createState, designateTarget, distance, localPoint, sideAngle, step, torpedoTargetFor, type Controls, type Enemy, type State } from '../src/simulation';

const idle: Controls = { drive: 0, turn: 0, neutral: false, port: false, starboard: false, brace: false, pulse: false, torpedo: false, autoFire: false };
const advance = function (state: State, seconds: number, input: Partial<Controls> = {}) {
	for (let tick = 0; tick < Math.round(seconds * 60); tick++) step(state, { ...idle, ...input }, 1 / 60);
};
const encounter = function () {
	const state = createState();
	for (const enemy of state.enemies) { enemy.x = 20000 + enemy.id * 500; enemy.y = 20000; enemy.cooldown = 10000; }
	const target = state.enemies[0]; if (!target) throw new Error('Missing test target');
	return { state, target };
};
const position = function (state: State, target: Enemy, forward: number, across = 0) {
	Object.assign(target, localPoint(state.player, forward, across));
};

describe('broadside crew orders', function () {
	test('manual is the default; holding the toggle changes orders only once', function () {
		const state = createState(); advance(state, 0.1);
		expect(state.stats.salvos).toBe(0); expect(state.fireControl.automatic).toBe(false);
		advance(state, 0.1, { autoFire: true });
		expect(state.fireControl.automatic).toBe(true); expect(state.stats.salvos).toBe(2);
		advance(state, 0.1); advance(state, 0.1, { autoFire: true });
		expect(state.fireControl.automatic).toBe(false);
		advance(state, 8); expect(state.batteries.port.remaining).toBe(0); expect(state.stats.salvos).toBe(2);
	});
	test('auto crews hold fire without a solution and while armor is locked; manual orders still work', function () {
		const { state, target } = encounter();
		advance(state, 0.1, { autoFire: true }); expect(state.stats.salvos).toBe(0);
		position(state, target, 0, -420); advance(state, 0.1, { brace: true });
		expect(state.stats.salvos).toBe(0);
		advance(state, 1 / 60); expect(state.stats.salvos).toBe(1); expect(state.batteries.port.target).toBe(target.id);
		advance(state, 1 / 60, { starboard: true }); expect(state.stats.salvos).toBe(2);
	});
	test('auto crews, deliberate torpedoes and helm orders can clear all three contacts together', function () {
		const state = createState();
		for (let tick = 0; tick < 60 * 240 && state.outcome === 'playing'; tick++) {
			const p = state.player;
			const target = [...state.enemies].sort(function (a, b) { return distance(p, a) - distance(p, b); })[0];
			const bearing = target ? Math.atan2(target.y - p.y, target.x - p.x) : p.angle;
			const port = angleDelta(sideAngle(p, 'port'), bearing); const starboard = angleDelta(sideAngle(p, 'starboard'), bearing);
			const error = Math.abs(port) < Math.abs(starboard) ? port : starboard;
			step(state, { ...idle, autoFire: tick === 0, torpedo: tick % 2 === 0 && Boolean(torpedoTargetFor(state)),
				drive: p.throttle < 0.22 ? 1 : 0, turn: target ? clamp(error * 1.8 - p.yaw * 2, -1, 1) : 0,
				brace: state.shells.some(function (shell) { return shell.hostile && distance(shell, p) < 160; }) }, 1 / 60);
		}
		expect(state.outcome).toBe('won'); expect(state.kills).toBe(8); expect(state.fireControl.automatic).toBe(true);
		expect(state.stats.salvos).toBeGreaterThan(0); expect(state.stats.torpedoSalvos).toBeGreaterThan(0); expect(state.stats.interceptions).toBeGreaterThan(0);
	});
});

describe('bow torpedoes', function () {
	test('acquisition respects bow arc and range, priority, fallback, and deterministic nearest order', function () {
		const state = createState(); const first = state.enemies[0]; const second = state.enemies[1];
		if (!first || !second) throw new Error('Missing test targets');
		position(state, first, 400); position(state, second, 650);
		designateTarget(state, second.id); expect(torpedoTargetFor(state)?.id).toBe(second.id);
		position(state, second, -400); expect(torpedoTargetFor(state)?.id).toBe(first.id);
		position(state, first, 1001); expect(torpedoTargetFor(state)).toBeUndefined();
		position(state, first, 100, 300); expect(torpedoTargetFor(state)).toBeUndefined();
		position(state, first, 400); position(state, second, 400); designateTarget(state, undefined); state.enemies.reverse();
		expect(torpedoTargetFor(state)?.id).toBe(first.id);
	});
	test('a failed launch spends no reload and requires a new press once a bow lock appears', function () {
		const { state, target } = encounter(); advance(state, 0.1, { torpedo: true });
		expect(state.torpedoes.reload).toBe(0); expect(state.stats.torpedoSalvos).toBe(0);
		position(state, target, 500); advance(state, 0.1, { torpedo: true }); expect(state.stats.torpedoSalvos).toBe(0);
		advance(state, 1 / 60); advance(state, 1 / 60, { torpedo: true });
		expect(state.torpedoes.reload).toBe(TORPEDO_RELOAD); expect(state.torpedoes.remaining).toBe(2);
		expect(state.shells.filter(function (shell) { return shell.guidance; })).toHaveLength(1);
	});
	test('three rounds ripple at a committed target independently of broadsides and finish under armor lock', function () {
		const { state, target } = encounter(); const other = state.enemies[1]; if (!other) throw new Error('Missing other target');
		position(state, target, 600); position(state, other, 700, 80); designateTarget(state, target.id);
		advance(state, 1 / 60, { torpedo: true, port: true }); designateTarget(state, other.id);
		advance(state, 0.1, { torpedo: true }); expect(state.torpedoes.remaining).toBe(2);
		advance(state, 0.4, { brace: true, torpedo: true });
		const torpedoes = state.shells.filter(function (shell) { return shell.guidance; });
		expect(torpedoes).toHaveLength(3); expect(torpedoes.every(function (shell) { return shell.guidance?.target === target.id; })).toBe(true);
		expect(state.stats.salvos).toBe(1); expect(state.stats.torpedoSalvos).toBe(1);
		advance(state, 18, { torpedo: true }); expect(state.stats.torpedoSalvos).toBe(1);
		position(state, other, 600); advance(state, 1 / 60); advance(state, 1 / 60, { torpedo: true });
		expect(state.stats.torpedoSalvos).toBe(2);
	});
	test('armor lock blocks new torpedoes and slows their reload; shield pulse has no penalty', function () {
		const { state, target } = encounter(); position(state, target, 500);
		advance(state, 0.1, { brace: true, torpedo: true }); expect(state.stats.torpedoSalvos).toBe(0);
		advance(state, 1 / 60); advance(state, 1 / 60, { pulse: true, torpedo: true });
		expect(state.stats.torpedoSalvos).toBe(1); const before = state.torpedoes.reload;
		advance(state, 1, { brace: true }); expect(before - state.torpedoes.reload).toBeCloseTo(0.45, 5);
	});
	test('homing rounds damage a moving frigate without needing a broadside solution', function () {
		const { state, target } = encounter(); position(state, target, 500); const start = target.hp;
		advance(state, 4, { torpedo: true });
		expect(target.hp).toBe(start - 216); expect(state.stats.hits).toBe(3); expect(state.stats.salvos).toBe(0);
	});
	test('guidance has a limited turn rate and never switches to another target after a kill', function () {
		const { state, target } = encounter(); position(state, target, 700);
		state.shells.push({ x: 0, y: -200, vx: 220, vy: 0, life: 6, hostile: false, damage: 72, guidance: { target: target.id } });
		advance(state, 1 / 60); const shot = state.shells[0]; if (!shot) throw new Error('Missing torpedo');
		expect(Math.abs(angleDelta(0, Math.atan2(shot.vy, shot.vx)))).toBeCloseTo(0.8 / 60, 6);
		target.hp = 0; const velocity = { x: shot.vx, y: shot.vy }; advance(state, 0.5);
		expect(shot.vx).toBe(velocity.x); expect(shot.vy).toBe(velocity.y);
	});
	test('guided shells still resolve the nearest swept hull and expire without damage', function () {
		const state = createState(); const near = state.enemies[1]; const far = state.enemies[0]; if (!near || !far) throw new Error('Missing targets');
		near.x = 150; near.y = 0; near.angle = 0; far.x = 300; far.y = 0; far.angle = 0;
		state.shells.push({ x: 0, y: 0, vx: 20000, vy: 0, hostile: false, damage: 72, life: 1, guidance: { target: undefined } });
		step(state, idle, 1 / 30); expect(near.hp).toBe(near.maxHp - 72); expect(far.hp).toBe(far.maxHp);
		state.shells.push({ ...near, vx: 0, vy: 0, hostile: false, damage: 72, life: 0, guidance: { target: far.id } });
		step(state, idle, 1 / 60); expect(near.hp).toBe(near.maxHp - 72);
	});
});

describe('automatic point defense', function () {
	test('predicts hits from cruiser-relative velocity, including movement toward and away from a round', function () {
		const run = function (vx: number) {
			const { state } = encounter(); state.player.vx = vx;
			state.shells.push({ x: -235, y: 0, vx: 150, vy: 0, life: 2, hostile: true, damage: 26 });
			advance(state, 1 / 60); return state.stats.interceptions;
		};
		expect(run(0)).toBe(1); expect(run(80)).toBe(0); expect(run(-80)).toBe(1);
	});
	test('prioritizes imminent hull hits over array order, receding rounds and harmless flybys', function () {
		const { state } = encounter();
		state.shells.push(
			{ x: -180, y: 0, vx: 240, vy: 0, life: 2, hostile: true, damage: 26 },
			{ x: -80, y: 0, vx: -240, vy: 0, life: 2, hostile: true, damage: 26 },
			{ x: -100, y: 150, vx: 240, vy: 0, life: 2, hostile: true, damage: 26 },
			{ x: 0, y: -140, vx: 0, vy: 240, life: 2, hostile: true, damage: 26 },
		);
		advance(state, 1 / 60);
		expect(state.stats.interceptions).toBe(1); expect(state.pointDefense.reload).toBe(DEFENSE_RELOAD);
		expect(state.pointDefense.traces[0]?.to).toEqual({ x: 0, y: -140 }); expect(state.shells).toHaveLength(3);
		expect(state.events).toContain('intercept'); expect(state.player.hp).toBe(MAX_HULL);
	});
	test('limited cadence thins a volley but leaves meaningful damage, including under armor lock', function () {
		const { state } = encounter();
		for (let index = 0; index < 5; index++) state.shells.push({ x: -160, y: index - 2, vx: 240, vy: 0, life: 2, hostile: true, damage: 26 });
		advance(state, 0.8, { brace: true });
		expect(state.stats.interceptions).toBe(2); expect(state.player.hp).toBeCloseTo(MAX_HULL - 3 * 26 * 0.35, 5);
		expect(state.pointDefense.traces).toHaveLength(0);
	});
	test('ignores rounds outside range, friendly rounds and expired incoming rounds', function () {
		const { state } = encounter();
		state.shells.push(
			{ x: -250, y: 0, vx: 240, vy: 0, life: 2, hostile: true, damage: 26 },
			{ x: -150, y: 0, vx: 240, vy: 0, life: 2, hostile: false, damage: 58 },
			{ x: -100, y: 0, vx: 240, vy: 0, life: 0, hostile: true, damage: 26 },
		);
		advance(state, 1 / 60); expect(state.stats.interceptions).toBe(0); expect(state.player.hp).toBe(MAX_HULL);
	});
	test('restart and terminal states reset or freeze every weapon system', function () {
		const { state, target } = encounter(); position(state, target, 500);
		advance(state, 1 / 60, { torpedo: true, autoFire: true }); state.player.hp = 0; advance(state, 1 / 60);
		const time = state.time; const reload = state.torpedoes.reload;
		advance(state, 20, { torpedo: true, autoFire: true }); expect(state.time).toBe(time); expect(state.torpedoes.reload).toBe(reload);
		const fresh = createState(); expect(fresh.torpedoes.reload).toBe(0); expect(fresh.fireControl.automatic).toBe(false);
		expect(fresh.stats.interceptions).toBe(0); expect(fresh.pointDefense.traces).toHaveLength(0);
	});
});
