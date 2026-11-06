import { describe, expect, test } from 'bun:test';
import { BEAM_COOLDOWN, BEAM_DURATION, MAX_HULL, MISSILE_RELOAD, beamTargetFor, createState, designateTarget, localPoint, missileTargetFor, step, type Controls, type State } from '../src/simulation';

const idle: Controls = { drive: 0, turn: 0, neutral: false, port: false, starboard: false, brace: false, pulse: false, torpedo: false, autoFire: false };
const advance = function (state: State, seconds: number, input: Partial<Controls> = {}) {
	for (let tick = 0; tick < Math.round(seconds * 60); tick++) step(state, { ...idle, ...input }, 1 / 60);
};
const encounter = function () {
	const state = createState(); const near = state.enemies[0]; const far = state.enemies[1];
	if (!near || !far) throw new Error('Missing test targets');
	for (const enemy of state.enemies) { enemy.training = true; enemy.hp = 2000; enemy.maxHp = 2000; enemy.angle = state.player.angle; }
	Object.assign(near, localPoint(state.player, 400, 0)); Object.assign(far, localPoint(state.player, 700, 0));
	return { state, near, far };
};

describe('beam lance', function () {
	test('sustained damage stops at the first hull even when priority points through it', function () {
		const { state, near, far } = encounter(); designateTarget(state, far.id);
		expect(beamTargetFor(state)?.id).toBe(far.id);
		advance(state, 1, { beam: true });
		expect(near.hp).toBeCloseTo(1920, 5); expect(far.hp).toBe(2000);
		expect(state.beam.charge).toBeCloseTo(BEAM_DURATION - 1, 5);
		expect(state.beams.length).toBeGreaterThan(0); expect(state.beams.every(function (beam) { return !beam.hostile; })).toBe(true);
	});
	test('a full burn overheats; armor lock blocks fire; cooling cannot be bypassed by repressing', function () {
		const { state, near } = encounter();
		advance(state, 0.5, { beam: true, brace: true }); expect(near.hp).toBe(2000); expect(state.beam.charge).toBe(BEAM_DURATION);
		advance(state, BEAM_DURATION, { beam: true }); expect(state.beam.cooldown).toBeCloseTo(BEAM_COOLDOWN, 4);
		const hull = near.hp; advance(state, 0.5); advance(state, 0.5, { beam: true });
		expect(near.hp).toBe(hull); expect(state.beam.firing).toBe(false);
		advance(state, BEAM_COOLDOWN); expect(state.beam.charge).toBe(BEAM_DURATION);
		advance(state, 0.5, { beam: true }); expect(near.hp).toBeLessThan(hull);
	});
	test('command beam bypasses interception but shields mitigate it and a course change can miss it', function () {
		const run = function (shield: boolean, miss: boolean) {
			const { state, near, far } = encounter(); far.training = true;
			near.training = false; near.weapon = 'beam'; near.beamRemaining = 0.5;
			near.x = 500; near.y = 0; near.beamHeading = miss ? -Math.PI / 2 : Math.PI;
			advance(state, 0.25, { pulse: shield }); return state;
		};
		const normal = run(false, false); const shielded = run(true, false); const missed = run(false, true);
		expect(normal.player.hp).toBeLessThan(MAX_HULL); expect(normal.stats.interceptions).toBe(0);
		expect(MAX_HULL - shielded.player.hp).toBeCloseTo((MAX_HULL - normal.player.hp) * 0.15, 5);
		expect(shielded.stats.damageBlocked).toBeGreaterThan(0); expect(missed.player.hp).toBe(MAX_HULL);
	});
});

describe('guided missile racks', function () {
	test('all-angle lock honors priority and a salvo keeps its target through a designation change', function () {
		const { state, near, far } = encounter();
		Object.assign(near, localPoint(state.player, -600, 0)); Object.assign(far, localPoint(state.player, -850, 0));
		designateTarget(state, far.id); expect(missileTargetFor(state)?.id).toBe(far.id); expect(beamTargetFor(state)).toBeUndefined();
		advance(state, 1 / 60, { missile: true }); designateTarget(state, near.id);
		advance(state, 0.5, { missile: true });
		const missiles = state.shells.filter(function (shell) { return shell.projectile === 'missile'; });
		expect(missiles).toHaveLength(4); expect(missiles.every(function (shell) { return shell.guidance?.target === far.id; })).toBe(true);
		advance(state, MISSILE_RELOAD + 1, { missile: true }); expect(state.missiles.reload).toBe(0); expect(state.missiles.remaining).toBe(0);
		advance(state, 1 / 60); advance(state, 1 / 60, { missile: true }); expect(state.missiles.reload).toBe(MISSILE_RELOAD);
	});
	test('missiles track a target behind the cruiser and expire safely if their committed target is destroyed', function () {
		const { state, near, far } = encounter();
		Object.assign(near, localPoint(state.player, -600, 0)); Object.assign(far, localPoint(state.player, 2000, 0));
		advance(state, 4, { missile: true }); expect(near.hp).toBeCloseTo(2000 - 4 * 38, 5);
		state.missiles.reload = 0; advance(state, 1 / 60); advance(state, 1 / 60, { missile: true });
		near.hp = 0; advance(state, 6); expect(far.hp).toBe(2000); expect(state.shells).toHaveLength(0);
	});
	test('hostile guided missiles bend toward the cruiser and remain interceptable', function () {
		const { state } = encounter();
		state.shells.push({ x: 190, y: 0, vx: -200, vy: 30, life: 6, damage: 32, hostile: true, projectile: 'missile', guidance: { target: 0 } });
		advance(state, 1 / 60); expect(state.stats.interceptions).toBe(1); expect(state.player.hp).toBe(MAX_HULL);
		state.pointDefense.reload = 10;
		state.shells.push({ x: 400, y: 0, vx: 0, vy: -200, life: 6, damage: 32, hostile: true, projectile: 'missile', guidance: { target: 0 } });
		advance(state, 1 / 60); expect(state.shells[0]?.vx).toBeLessThan(0);
	});
});
