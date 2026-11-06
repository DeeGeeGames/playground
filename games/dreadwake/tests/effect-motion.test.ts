import { createShipModels } from '../src/ship-model';
import { describe, expect, test } from 'bun:test';
import { createDriveAnimator, muzzlePoint, projectilePoint, projectileVelocity, sampleTrail, type TrailPoint } from '../src/effect-motion';
import { createArsenalCampaign, step } from '../src/simulation';
import { installStarter } from '../src/arsenal';

describe('effect attachment and observed trails', function () {
	test('all hulls assemble after adding luminous apertures and rounded plumes', function () {
		const models = createShipModels();
		try { for (const model of Object.values(models.prototypes)) expect(model.getObjectByName('exhaust')?.children.length).toBe(2); }
		finally { models.dispose(); }
	});
	test('neutral eases engine power and paused renders do not advance it', function () {
		const state = createArsenalCampaign(); const animate = createDriveAnimator(); state.player.throttle = 1;
		const powered = animate(state.player, state, true); state.player.throttle = 0; state.time += 1 / 60;
		const coasting = animate(state.player, state, true);
		expect(powered - coasting).toBeLessThan(3); expect(coasting).toBeGreaterThan(10);
		expect(animate(state.player, state, true)).toBe(coasting);
		state.time += 1; expect(animate(state.player, state, true)).toBeCloseTo(10, 1);
	});
	test('hostile visual launch starts at its gun and smoothly joins the unchanged collision path', function () {
		const shell = { x: 0, y: 0, vx: 200, vy: 0, life: 4, damage: 1, hostile: true,
			launch: { point: { x: 20, y: 30 }, time: 0, elevation: 24, offset: { x: 20, y: 30 } } };
		expect(projectilePoint(shell, 0)).toEqual(shell.launch.point);
		expect(projectileVelocity(shell, 0)).toEqual({ x: 200, y: 0 });
		expect(projectileVelocity(shell, 0.2)).toEqual({ x: 125, y: -112.5 });
		expect(projectileVelocity(shell, 0.4)).toEqual({ x: 200, y: 0 });
		shell.x = 40; expect(projectilePoint(shell, 0.2)).toEqual({ x: 50, y: 15 });
		shell.x = 80; expect(projectilePoint(shell, 0.4)).toEqual({ x: 80, y: 0 });
		expect(shell.x).toBe(80); expect(shell.y).toBe(0);
	});
	test('a new projectile never invents a tail behind its first observation', function () {
		expect(sampleTrail([], { x: 23, y: 0 }, 1, 0.095)).toEqual([{ x: 23, y: 0, time: 1 }]);
	});
	test('a turning projectile retains only its travelled segments', function () {
		let points: TrailPoint[] = [{ x: 0, y: 0, time: 0 }];
		points = sampleTrail(points, { x: 10, y: 0 }, 0.05, 0.2);
		points = sampleTrail(points, { x: 10, y: 10 }, 0.1, 0.2);
		expect(points.map(function ({ x, y }) { return [x, y]; })).toEqual([[0, 0], [10, 0], [10, 10]]);
		expect(sampleTrail(points, { x: 999, y: 999 }, 0.1, 0.2)).toEqual(points);
	});
	test('trail duration and endpoint agree at 30, 60 and 120 frames per second', function () {
		for (const fps of [30, 60, 120]) {
			let points: TrailPoint[] = [];
			for (let frame = 0; frame <= fps; frame++) points = sampleTrail(points, { x: frame / fps * 200, y: 0 }, frame / fps, 0.25);
			expect(points[0]?.x).toBeCloseTo(150); expect(points.at(-1)?.x).toBeCloseTo(200);
		}
	});
	test('time resets, suspended views and teleports discard disconnected history', function () {
		const points = [{ x: 0, y: 0, time: 1 }];
		for (const [x, time] of [[20, 0], [20, 2], [2000, 1.1]] as const) {
			expect(sampleTrail(points, { x, y: 0 }, time, 0.3)).toEqual([{ x, y: 0, time }]);
		}
	});
	test('muzzles rotate with their socket and extend to their visible barrel tip', function () {
		const state = createArsenalCampaign(); const ship = state.player;
		ship.x = 100; ship.y = 200; ship.angle = Math.PI / 2;
		const muzzle = muzzlePoint(ship, 0, 'rail', Math.PI);
		expect(muzzle.x).toBeCloseTo(100 + 36.45 - 25); expect(muzzle.y).toBeCloseTo(264); expect(muzzle.elevation).toBe(30);
	});
	test('firing records presentation origins without moving gameplay colliders', function () {
		const state = createArsenalCampaign(); installStarter(state, 'rail', 0);
		state.player.x = 0; state.player.y = 0; state.player.angle = 0;
		const enemy = state.enemies[0]; if (!enemy) throw new Error('Missing encounter');
		state.enemies = [enemy]; enemy.x = 64; enemy.y = -500; enemy.vx = 0; enemy.vy = 0; enemy.cooldown = 99;
		const mount = state.arsenal?.mounts[0]; if (!mount) throw new Error('Missing mount');
		mount.heading = -Math.PI / 2;
		step(state, { drive: 0, turn: 0, neutral: false, port: false, starboard: false, brace: false, pulse: false, torpedo: false, autoFire: false }, 1 / 60);
		const shell = state.shells.find(function (entry) { return entry.weaponId === 'rail'; });
		expect(shell?.launch?.point.y).toBeCloseTo(-61.45, 1);
		expect(shell?.y).toBeGreaterThan(-61.45);
		expect(state.effects.find(function (entry) { return entry.kind === 'muzzle'; })?.source).toMatchObject({ slot: 0 });
	});
});
