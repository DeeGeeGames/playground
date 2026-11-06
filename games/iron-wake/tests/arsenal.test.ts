import { describe, expect, test } from 'bun:test';
import { createMount, DRAFT_MILESTONES, getWeapon, WEAPONS } from '../src/arsenal';
import { angleDelta, chooseWeapon, createState, distance, step, type Controls, type State } from '../src/simulation';

const idle: Controls = { drive: 0, turn: 0, stop: false, aim: { x: 900, y: 200 }, fire: [false, false, false, false], coolant: false };
const target = function (state: State, x: number, y: number, hp = 1000) {
	const unit = { id: state.nextId++, x, y, angle: 0, cooldown: 3600, hp, maxHp: hp, kind: 'striker' as const, heavy: false };
	state.enemies.push(unit); return unit;
};
const advance = function (state: State, seconds: number, input = idle) { for (let tick = 0; tick < seconds * 60; tick++) step(state, input, 1 / 60); };

describe('Iron Wake arsenal', function () {
	test('every starting weapon can earn its first draft through the real assault', function () {
		for (const weapon of WEAPONS) {
			const state = createState({ starter: weapon.id, seed: 23 });
			expect(state.loadout).toHaveLength(1); expect(state.loadout[0]?.weapon).toBe(weapon.id);
			for (let tick = 0; tick < 60 * 90 && state.phase === 'combat' && state.outcome === 'playing'; tick++) {
				const p = state.player;
				const enemy = [...state.enemies].sort(function (a, b) { return distance(a, p) - distance(b, p); })[0];
				const radial = Math.atan2(p.y - 600, p.x - 900);
				const heading = radial + Math.PI / 2 + Math.atan((Math.hypot(p.x - 900, p.y - 600) - 300) / 160);
				step(state, { ...idle, drive: 1, turn: Math.max(-1, Math.min(1, angleDelta(p.angle, heading) * 2)), aim: enemy ?? idle.aim,
					fire: [Boolean(enemy) && p.heat < 85, false, false, false], coolant: p.heat > 90 }, 1 / 60);
			}
			expect({ weapon: weapon.id, phase: state.phase }).toEqual({ weapon: weapon.id, phase: 'requisition' });
			expect(state.kills).toBeGreaterThanOrEqual(2); expect(state.outcome).toBe('playing');
			expect(state.offers).toHaveLength(3); expect(state.offers).not.toContain(weapon.id);
		}
	});

	test('four slots fire concurrently, keep separate cooldowns, and respect the shared heat lock', function () {
		const state = createState(); state.spawnIn = 3600;
		state.loadout = [createMount('laser'), createMount('autocannon'), createMount('machine-gun'), createMount('stream-rockets')];
		target(state, 900, 600);
		step(state, { ...idle, fire: [true, true, true, true] }, 1 / 60);
		expect(state.beam).toBeDefined(); expect(state.shots.map(function (shot) { return shot.kind; }).sort()).toEqual(['bullet', 'cannon', 'rocket']);
		expect(state.loadout.every(function (mount) { return mount.firing; })).toBe(true);
		const fired = state.stats.shotsFired;
		advance(state, 0.2, { ...idle, fire: [false, true, true, true] });
		expect(state.beam).toBeUndefined(); expect(state.stats.shotsFired).toBeGreaterThan(fired);
		expect(state.events).not.toContain('cannon'); expect(state.events).not.toContain('rocket');
		state.player.overheated = true; state.player.heat = 90;
		const shots = state.stats.shotsFired;
		advance(state, 0.8, { ...idle, fire: [true, true, true, true] });
		expect(state.stats.shotsFired).toBe(shots); expect(state.beam).toBeUndefined();
		expect(state.loadout.every(function (mount) { return !mount.firing; })).toBe(true);
	});

	test('missiles steer toward the aimed target while rockets retain their launch heading', function () {
		const state = createState(); state.spawnIn = 3600;
		state.loadout = [createMount('stream-missiles'), createMount('stream-rockets')];
		const enemy = target(state, 1050, 580);
		step(state, { ...idle, aim: enemy, fire: [true, true, false, false] }, 1 / 60);
		const missile = state.shots.find(function (shot) { return shot.kind === 'missile'; });
		const rocket = state.shots.find(function (shot) { return shot.kind === 'rocket'; });
		if (!missile || !rocket) throw new Error('Missing projectiles');
		expect(missile.target).toBe(enemy.id); expect(rocket.target).toBeUndefined();
		const missileX = missile.vx; const rocketX = rocket.vx; const rocketY = rocket.vy;
		enemy.x = 1150;
		advance(state, 0.2);
		expect(missile.vx).toBeGreaterThan(missileX); expect(rocket.vx).toBe(rocketX); expect(rocket.vy).toBe(rocketY);
		state.enemies = [];
		const headingX = missile.vx; const headingY = missile.vy;
		advance(state, 0.1); expect(missile.vx).toBe(headingX); expect(missile.vy).toBe(headingY);
	});

	test('particle bolts pierce multiple targets once each without inflating projectile hit rate', function () {
		const state = createState({ starter: 'ppc' }); state.spawnIn = 3600;
		const enemies = [target(state, 900, 690), target(state, 900, 630), target(state, 900, 570)];
		step(state, { ...idle, fire: [true, false, false, false] }, 1 / 60);
		advance(state, 0.5);
		for (const enemy of enemies) expect(enemy.hp).toBe(1000 - getWeapon('ppc').damage);
		expect(state.stats.shotsFired).toBe(1); expect(state.stats.shotsHit).toBe(1);
	});

	test('cluster volleys apply area damage beyond the directly struck frame', function () {
		for (const weapon of ['cluster-rockets', 'cluster-missiles'] as const) {
			const state = createState({ starter: weapon }); state.spawnIn = 3600;
			const direct = target(state, 900, 700); const neighbor = target(state, 950, 700);
			step(state, { ...idle, aim: direct, fire: [true, false, false, false] }, 1 / 60);
			expect(state.shots).toHaveLength(getWeapon(weapon).projectiles);
			advance(state, 0.4);
			expect(direct.hp).toBeLessThan(1000); expect(neighbor.hp).toBeLessThan(1000);
			expect(state.stats.shotsHit).toBeLessThanOrEqual(state.stats.shotsFired);
		}
	});

	test('earned drafts freeze hazards and queue multi-kill rewards without duplicate mounts', function () {
		const state = createState({ seed: 83 }); state.spawnIn = 3600;
		for (let i = 0; i < 9; i++) target(state, 100 + i * 70, 100, 0);
		state.strikes.push({ id: state.nextId++, x: 900, y: 780, life: 1, duration: 2.8, radius: 62, damage: 10 });
		step(state, idle, 1 / 60); expect(state.phase).toBe('requisition');
		state.events = [];
		const before = structuredClone(state);
		advance(state, 5, { ...idle, drive: 1, fire: [true, true, true, true] });
		expect(state).toEqual(before);
		for (let draft = 0; draft < 3; draft++) {
			const offer = state.offers[0]; if (!offer) throw new Error('Missing draft');
			expect(chooseWeapon(state, offer)).toBe(true);
			expect(state.loadout).toHaveLength(draft + 2);
			expect(new Set(state.loadout.map(function (mount) { return mount.weapon; })).size).toBe(state.loadout.length);
		}
		expect(state.phase).toBe('combat'); expect(state.draftCount).toBe(3);
		expect(chooseWeapon(state, 'ppc')).toBe(false);
	});

	test('full banks require an explicit replacement and upgrades preserve slot identity with a rank cap', function () {
		const state = createState(); state.spawnIn = 3600;
		state.loadout = [createMount('autocannon'), createMount('laser'), createMount('machine-gun'), createMount('stream-missiles')];
		state.draftCount = 3; state.kills = DRAFT_MILESTONES[3] ?? 14;
		step(state, idle, 1 / 60);
		const replacement = state.offers.find(function (offer) { return !state.loadout.some(function (mount) { return mount.weapon === offer; }); });
		if (!replacement) throw new Error('Missing replacement offer');
		const before = structuredClone(state);
		expect(chooseWeapon(state, replacement)).toBe(false); expect(chooseWeapon(state, replacement, -1)).toBe(false);
		expect(chooseWeapon(state, replacement, 4)).toBe(false); expect(state).toEqual(before);
		expect(chooseWeapon(state, replacement, 2)).toBe(true); expect(state.loadout[2]?.weapon).toBe(replacement);
		const first = state.loadout[0]; if (!first) throw new Error('Missing mount');
		state.phase = 'requisition'; state.offers = [first.weapon];
		expect(chooseWeapon(state, first.weapon)).toBe(true); expect(first.level).toBe(2);
		state.phase = 'requisition'; state.offers = [first.weapon];
		expect(chooseWeapon(state, first.weapon)).toBe(true); expect(first.level).toBe(3);
		state.phase = 'requisition'; state.offers = [first.weapon];
		expect(chooseWeapon(state, first.weapon)).toBe(false); expect(first.level).toBe(3); expect(state.loadout).toHaveLength(4);
	});

	test('fatal damage takes precedence over a draft earned on the same simulation tick', function () {
		const state = createState(); state.spawnIn = 3600; state.player.hp = 1;
		target(state, 100, 100, 0); target(state, 200, 100, 0);
		state.shots.push({ x: 900, y: 780, vx: 0, vy: 0, life: 1, kind: 'enemy', target: undefined, damage: 10 });
		step(state, idle, 1 / 60);
		expect(state.kills).toBe(2); expect(state.outcome).toBe('lost'); expect(state.phase).toBe('combat');
		expect(state.offers).toEqual([]); expect(chooseWeapon(state, 'laser')).toBe(false);
	});
});
