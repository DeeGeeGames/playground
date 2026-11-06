import { describe, expect, test } from 'bun:test';
import { FRAMES, type FrameId } from '../src/frames';
import { TOTAL_HOSTILES } from '../src/operation';
import { angleDelta, applyRefit, chooseWeapon, createState, distance, getEnemyDefense, step, type Controls, type State } from '../src/simulation';

const idle: Controls = { drive: 0, stop: false, turn: 0, aim: { x: 900, y: 200 }, fire: [false, false, false, false], coolant: false };
const run = function (state: State, seconds: number, input = idle) {
	for (let tick = 0; tick < seconds * 60; tick++) step(state, input, 1 / 60);
};
const isolated = function (frame: FrameId) {
	const state = createState({ frame }); state.spawnIn = 3600; state.draftsEnabled = false;
	return state;
};
// Ordinary controls orbit the relay, track the nearest enemy, and limit heat.
// There is no teleportation, invulnerability, or knowledge of artillery timing.
const pilot = function (state: State, firstDraftOnly = false) {
	for (let tick = 0; tick < 60 * 600 && state.outcome === 'playing'; tick++) {
		if (state.phase === 'requisition') {
			if (firstDraftOnly) break;
			const preferred = ['stream-missiles', 'laser', 'autocannon', 'machine-gun', 'ppc', 'cluster-missiles', 'stream-rockets', 'cluster-rockets'];
			const offer = [...state.offers].sort(function (a, b) { return preferred.indexOf(a) - preferred.indexOf(b); })[0];
			if (offer) chooseWeapon(state, offer, 3);
		}
		if (state.phase === 'refit') applyRefit(state, 'arsenal');
		const p = state.player;
		const target = [...state.enemies].sort(function (a, b) { return distance(a, p) - distance(b, p); })[0];
		const radial = Math.atan2(p.y - 600, p.x - 900);
		const heading = radial + Math.PI / 2 + Math.atan((Math.hypot(p.x - 900, p.y - 600) - 300) / 160);
		step(state, { ...idle, drive: 1, turn: Math.max(-1, Math.min(1, angleDelta(p.angle, heading) * 2)), aim: target ?? idle.aim,
			fire: [Boolean(target) && p.heat < 85, Boolean(target) && p.heat < 75, Boolean(target) && p.heat < 75, Boolean(target) && p.heat < 75], coolant: p.heat > 85 }, 1 / 60);
	}
};

describe('Iron Wake frame combat', function () {
	for (const frame of FRAMES) {
		test(`${frame.name} earns a first draft using its assigned starter`, function () {
			const state = createState({ frame: frame.id, seed: 23 });
			expect(state.frame).toBe(frame.id); expect(state.loadout).toHaveLength(1);
			expect(state.loadout[0]?.weapon).toBe(frame.starter);
			pilot(state, true);
			expect(state.phase).toBe('requisition'); expect(state.outcome).toBe('playing');
			expect(state.time).toBeLessThan(90); expect(state.kills).toBeGreaterThanOrEqual(2);
			expect(state.offers).toHaveLength(3); expect(state.offers).not.toContain(frame.starter);
		});

		test(`${frame.name} completes Standard through earned drafts and refits`, function () {
			const state = createState({ frame: frame.id });
			pilot(state);
			expect(state.outcome).toBe('won'); expect(state.kills).toBe(TOTAL_HOSTILES);
			expect(state.player.hp).toBeGreaterThan(0); expect(state.relay).toBeGreaterThan(0);
			expect(state.stats.commanderDestroyed).toBe(true);
			expect(state.loadout).toHaveLength(4); expect(state.draftCount).toBe(7);
			expect(state.frame).toBe(frame.id);
		});

		test(`${frame.name} escapes siege artillery from neutral after reaction time`, function () {
			const state = isolated(frame.id);
			state.enemies.push({ id: 1, x: 850, y: 800, hp: 125, maxHp: 125, angle: Math.atan2(-20, 50), cooldown: 0, heavy: true, kind: 'siege' });
			step(state, idle, 1 / 60);
			expect(state.strikes).toHaveLength(2);
			run(state, 0.3);
			run(state, 3.3, { ...idle, drive: 1 });
			expect(state.player.hp).toBe(100); expect(state.strikes).toHaveLength(0);
		});

		test(`${frame.name} escapes both Crown patterns in eight headings after reaction time`, function () {
			for (const enraged of [false, true]) for (let direction = 0; direction < 8; direction++) {
				const state = isolated(frame.id); state.player.y = 600; state.player.angle = direction * Math.PI / 4;
				state.enemies.push({ id: 1, x: 400, y: 600, hp: enraged ? 200 : 420, maxHp: 420, angle: 0, cooldown: 0, heavy: true, kind: 'siege', commander: true });
				step(state, idle, 1 / 60);
				const enemy = state.enemies[0]; if (!enemy) throw new Error('Missing commander');
				expect(getEnemyDefense(state, enemy).enraged).toBe(enraged);
				run(state, 0.3);
				run(state, 4.7, { ...idle, drive: 1 });
				expect({ enraged, direction, integrity: state.player.hp }).toEqual({ enraged, direction, integrity: 100 });
				expect(state.strikes).toHaveLength(0); expect(getEnemyDefense(state, enemy).exposed).toBe(true);
			}
		});

		test(`${frame.name} preserves bounded integrity and frame identity through refits and salvage`, function () {
			const state = isolated(frame.id); state.player.hp = 90; state.player.heat = 90;
			state.phase = 'refit'; expect(applyRefit(state, 'cooling')).toBe(true);
			expect(state.player.hp).toBe(100); expect(state.player.heat).toBe(0); expect(state.frame).toBe(frame.id);
			state.salvage.push({ id: 1, x: state.player.x, y: state.player.y, kind: 'repair', life: 45 });
			step(state, idle, 1 / 60); expect(state.salvage).toHaveLength(1);
			state.player.hp = 92;
			step(state, idle, 1 / 60); expect(state.player.hp).toBe(100); expect(state.salvage).toHaveLength(0);
			state.player.hp = 0;
			state.salvage.push({ id: 2, x: state.player.x, y: state.player.y, kind: 'repair', life: 45 });
			step(state, idle, 1 / 60); expect(state.player.hp).toBe(0); expect(state.outcome).toBe('lost');
		});
	}

	test('skirmisher mobility, brawler protection and precision cooling change actual combat', function () {
		const warden = isolated('warden'); const kestrel = isolated('kestrel'); const maul = isolated('maul'); const longbow = isolated('longbow');
		for (const state of [warden, kestrel, maul, longbow]) {
			state.player.heat = 80;
			state.shots.push({ x: state.player.x, y: state.player.y, vx: 0, vy: 0, life: 1, kind: 'enemy', target: undefined, damage: 20 });
			run(state, 2, { ...idle, drive: 1, turn: 0.2 });
		}
		expect(kestrel.player.speed).toBeGreaterThan(warden.player.speed);
		expect(kestrel.player.angle).toBeGreaterThan(warden.player.angle);
		expect(maul.player.angle).toBeLessThan(warden.player.angle);
		expect(maul.player.hp).toBeGreaterThan(warden.player.hp);
		expect(kestrel.player.hp).toBeLessThan(warden.player.hp);
		expect(longbow.player.heat).toBeLessThan(warden.player.heat);
		expect(kestrel.player.heat).toBeGreaterThan(warden.player.heat);
		const acceleratedSpeed = kestrel.player.speed;
		run(kestrel, 0.5); expect(kestrel.player.speed).toBeGreaterThan(acceleratedSpeed);
		run(kestrel, 4, { ...idle, stop: true }); expect(kestrel.player.throttle).toBe(0); expect(Math.abs(kestrel.player.speed)).toBeLessThan(0.1);
	});
});
