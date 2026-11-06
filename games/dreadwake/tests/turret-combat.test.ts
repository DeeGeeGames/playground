import { describe, expect, test } from 'bun:test';
import { draftCost, installStarter } from '../src/arsenal';
import { angleDelta, chooseRefit, createArsenalCampaign, distance, step, type Controls, type Enemy, type State } from '../src/simulation';
import { updateTurretProjectiles, updateTurrets } from '../src/turret-combat';
import { createMount, WEAPON_IDS, weaponStats, type WeaponId, type WeaponRank } from '../src/weapons';

const idle: Controls = { drive: 0, turn: 0, neutral: false, port: false, starboard: false, brace: false, pulse: false, torpedo: false, autoFire: false };
const fixture = function (weapon: WeaponId, rank: WeaponRank = 1) {
	const state = createArsenalCampaign(); const arsenal = state.arsenal; const target = state.enemies[0];
	if (!arsenal || !target) throw new Error('Missing fitted campaign fixture');
	state.player.angle = 0;
	const mount = createMount(2, weapon, rank, 0); arsenal.mounts[2] = mount;
	Object.assign(target, { x: 14, y: -330, angle: 0, vx: 0, vy: 0, hp: 1000, maxHp: 1000, cooldown: 1000, width: 40, length: 40 });
	state.enemies = [target];
	return { state, arsenal, mount, target };
};
const advanceWeapons = function (state: State, seconds: number) {
	for (let frame = 0; frame < Math.round(seconds * 60); frame++) {
		updateTurrets(state, 1 / 60); updateTurretProjectiles(state, 1 / 60);
		state.shells = state.shells.filter(function (shell) { return shell.life > 0; });
	}
};
const earnedSalvage = function (state: State) {
	const arsenal = state.arsenal; if (!arsenal) return 0;
	return arsenal.salvage + Array.from({ length: arsenal.rewards }, function (_, index) { return draftCost(index); }).reduce(function (total, cost) { return total + cost; }, 0);
};
const another = function (target: Enemy, id: number, x: number, y: number): Enemy { return { ...target, id, x, y }; };

describe('fitted fire policy and commitment', function () {
	test('an empty ship freezes; legacy manual inputs and built-in point defense cannot bypass Hold Fire', function () {
		const state = createArsenalCampaign(); const initial = structuredClone(state);
		step(state, { ...idle, drive: 1, port: true, torpedo: true, missile: true, beam: true }, 1 / 60);
		expect(state.time).toBe(initial.time); expect(state.enemies).toEqual(initial.enemies); expect(state.shells).toHaveLength(0);
		expect(installStarter(state, 'seeker', 0)).toBe(true);
		state.fireControl.automatic = false;
		state.shells.push({ x: -180, y: 0, vx: 200, vy: 0, life: 3, damage: 20, hostile: true });
		step(state, { ...idle, port: true, starboard: true, torpedo: true, missile: true, beam: true }, 1 / 60);
		expect(state.shells.filter(function (shell) { return !shell.hostile; })).toHaveLength(0);
		expect(state.stats.interceptions).toBe(0); expect(state.batteries.port.remaining).toBe(0);
	});
	test('Hold Fire cancels a missile ripple immediately while its launched round remains committed', function () {
		const { state, mount, target } = fixture('seeker');
		updateTurrets(state, 1 / 60);
		expect(state.shells).toHaveLength(1); expect(mount.burstRemaining).toBe(2);
		const launched = state.shells[0]; if (!launched) throw new Error('Expected launched missile');
		state.fireControl.automatic = false; advanceWeapons(state, 0.25);
		expect(mount.burstRemaining).toBe(0); expect(state.shells).toHaveLength(1);
		expect(launched.guidance?.target).toBe(target.id); expect(mount.status).toBe('HOLD FIRE');
		const heading = Math.atan2(launched.vy, launched.vx);
		target.hp = 0; state.enemies.push(another(target, 8, launched.x + 100, launched.y + 100));
		updateTurretProjectiles(state, 1 / 60);
		expect(Math.atan2(launched.vy, launched.vx)).toBeCloseTo(heading, 8);
		expect(launched.guidance?.target).toBe(target.id);
	});
	test('Helios visibly charges, locks a world direction, and allows a target to dodge the committed shot', function () {
		const { state, mount, target } = fixture('helios');
		advanceWeapons(state, 1.45);
		expect(mount.locked).toBe(true); expect(mount.charge).toBeGreaterThan(1.3); expect(target.hp).toBe(1000);
		const lock = mount.lockHeading;
		target.x += 160; state.player.angle += 0.15;
		advanceWeapons(state, 0.65);
		expect(target.hp).toBe(1000); expect(mount.lockHeading).toBe(lock); expect(mount.fired).toBe(1);
		expect(state.beams.some(function (trace) { return trace.weaponId === 'helios'; })).toBe(true);
	});
	test('Hold Fire, armor lock and loss of a pre-lock target cancel Helios without a deferred discharge', function () {
		for (const cancel of ['hold', 'armor', 'range'] as const) {
			const { state, mount, target } = fixture('helios');
			advanceWeapons(state, 0.8); expect(mount.charge).toBeGreaterThan(0);
			if (cancel === 'hold') state.fireControl.automatic = false;
			else if (cancel === 'armor') state.player.braced = true;
			else target.y = -2000;
			advanceWeapons(state, 1.5);
			expect(mount.charge).toBe(0); expect(mount.locked).toBe(false); expect(mount.fired).toBe(0); expect(target.hp).toBe(1000);
		}
	});
	test('hemisphere and dead-zone constraints cannot be bypassed by automatic acquisition', function () {
		for (const weapon of ['rail', 'torpedo'] as const) {
			const { state, mount, target } = fixture(weapon);
			target.y = -100; advanceWeapons(state, 1); expect(mount.status).toBe('TOO CLOSE'); expect(mount.fired).toBe(0);
			target.y = 330; advanceWeapons(state, 1); expect(mount.status).toBe('OUT OF ARC'); expect(mount.fired).toBe(0);
		}
		const { state, mount, target } = fixture('seeker');
		target.y = 330; advanceWeapons(state, 2.5); expect(mount.fired).toBeGreaterThan(0);
	});
});

describe('weapon role and damage guarantees', function () {
	test('a fast rail pierces in hull order only once per hull and credits actual damage rather than overkill', function () {
		const { state, target } = fixture('rail', 3);
		target.y = -250; target.hp = 100;
		const second = another(target, 2, 14, -420); second.hp = 1000;
		const third = another(target, 3, 14, -600); third.hp = 1000;
		state.enemies = [third, second, target];
		advanceWeapons(state, 1.3);
		expect(target.hp).toBe(0); expect(second.hp).toBeCloseTo(1000 - 330 * 0.65, 6);
		expect(third.hp).toBeCloseTo(1000 - 330 * 0.65 ** 2, 6);
		expect(state.stats.hits).toBe(3); expect(earnedSalvage(state)).toBeCloseTo(100 + 330 * 0.65 + 330 * 0.65 ** 2, 6);
	});
	test('Breach applies full direct damage once and reduced splash to neighboring hulls', function () {
		const { state, target } = fixture('torpedo');
		const neighbor = another(target, 2, 80, -330); state.enemies.push(neighbor);
		advanceWeapons(state, 2);
		expect(target.hp).toBe(760); expect(neighbor.hp).toBe(868);
		expect(earnedSalvage(state)).toBe(372);
	});
	test('flak shares its reload between interception and offense and cannot indefinitely starve its anti-ship shot', function () {
		const { state, mount, target } = fixture('flak');
		target.y = -400;
		for (let volley = 0; volley < 3; volley++) {
			state.shells.push({ x: 14, y: -180, vx: 0, vy: 200, life: 4, hostile: true, damage: 20 },
				{ x: 18, y: -184, vx: 0, vy: 200, life: 4, hostile: true, damage: 20 });
			mount.reload = 0;
			updateTurrets(state, 1 / 60);
			expect(mount.reload).toBe(weaponStats('flak', 1).reload);
			for (let frame = 0; frame < 40; frame++) updateTurretProjectiles(state, 1 / 60);
			if (volley < 2) { expect(target.hp).toBe(1000); expect(mount.defensiveBursts).toBe(volley + 1); }
		}
		expect(state.stats.interceptions).toBe(4); expect(target.hp).toBe(955); expect(mount.defensiveBursts).toBe(0);
		expect(earnedSalvage(state)).toBe(45);
	});
	test('Spark is stopped by the first hull even when its fastest chosen contact lies behind it', function () {
		const { state, mount, target } = fixture('spark');
		const fast = another(target, 2, 14, -530); fast.vx = 70; state.enemies.push(fast);
		updateTurrets(state, 1 / 60);
		expect(mount.target).toBe(fast.id); expect(target.hp).toBe(960); expect(fast.hp).toBe(1000);
	});
	test('Rattler contact ramps but a lost arc or fire-policy change resets its advantage', function () {
		const { state, mount, target } = fixture('rattler');
		advanceWeapons(state, 2.2); expect(mount.ramp).toBe(2);
		target.y = 330; updateTurrets(state, 1 / 60); expect(mount.ramp).toBe(0);
		target.y = -330; advanceWeapons(state, 0.5); expect(mount.ramp).toBeGreaterThan(0); expect(mount.ramp).toBeLessThan(1);
		state.fireControl.automatic = false; updateTurrets(state, 1 / 60); expect(mount.ramp).toBe(0);
	});
	test('Ion cooperates with heavy-gun targeting, visits each hull once and caps slow without delaying firing clocks', function () {
		const { state, arsenal, mount, target } = fixture('ion', 3);
		target.y = -260;
		const second = another(target, 2, 100, -300); const third = another(target, 3, 200, -340); const command = another(target, 4, 240, -420); command.command = true;
		state.enemies = [target, second, third, command]; arsenal.rewards = 14;
		const heavy = createMount(3, 'helios', 1, 0); heavy.target = second.id; heavy.reload = 20; arsenal.mounts[3] = heavy;
		mount.heading = Math.atan2(second.y + 36.45, second.x - 14);
		updateTurrets(state, 1 / 60);
		expect(mount.target).toBe(second.id); expect(state.stats.hits).toBe(4);
		expect(second.hp).toBe(935); expect(target.hp).toBe(961);
		expect(third.hp).toBeCloseTo(1000 - 65 * 0.6 ** 2, 6); expect(command.hp).toBeCloseTo(1000 - 65 * 0.6 ** 3, 6);
		mount.reload = 0; updateTurrets(state, 1 / 60);
		expect(target.slowFactor).toBe(0.2); expect(command.slowFactor).toBe(0.1); expect(target.slowRemaining).toBe(1.6);
		const cooldown = target.cooldown; step(state, idle, 1 / 60);
		expect(target.cooldown).toBeCloseTo(cooldown - 1 / 60, 6);
		expect(Math.hypot(target.vx, target.vy)).toBeCloseTo(48 * 0.8, 6);
	});
	test('training damage does not generate campaign drafts', function () {
		const { state, target } = fixture('spark'); target.training = true;
		advanceWeapons(state, 4); expect(target.hp).toBeLessThan(800); expect(earnedSalvage(state)).toBe(0);
	});
});

test('every starter can earn its first draft through normal helm input without a collision exploit', function () {
	for (const weapon of WEAPON_IDS) {
		const state = createArsenalCampaign(); expect(installStarter(state, weapon, 2)).toBe(true);
		const desiredRange = weapon === 'rattler' ? 270 : weapon === 'ion' ? 300 : weapon === 'flak' ? 360 : weapon === 'torpedo' ? 450 : 550;
		let closest = Number.POSITIVE_INFINITY;
		for (let frame = 0; frame < 60 * 65 && (state.arsenal?.pending ?? 0) === 0 && state.outcome === 'playing'; frame++) {
			const target = state.enemies.filter(function (enemy) { return enemy.hp > 0; }).sort(function (a, b) { return Math.hypot(a.x - state.player.x, a.y - state.player.y) - Math.hypot(b.x - state.player.x, b.y - state.player.y); })[0];
			if (!target) break;
			const range = Math.hypot(target.x - state.player.x, target.y - state.player.y); closest = Math.min(closest, range);
			const bearing = Math.atan2(target.y - state.player.y, target.x - state.player.x);
			const heading = bearing + Math.PI / 2 - Math.max(-0.8, Math.min(0.8, (range - desiredRange) / 200));
			step(state, { ...idle, heading: angleDelta(0, heading), drive: state.player.throttle < 0.65 ? 1 : 0, pulse: state.shield.cooldown === 0 }, 1 / 60);
		}
		expect({ weapon, reward: (state.arsenal?.pending ?? 0) > 0 }).toEqual({ weapon, reward: true });
		expect(state.outcome).toBe('playing'); expect(state.player.hp).toBeGreaterThan(0); expect(closest).toBeGreaterThan(120);
	}
});

test('a clearing reward freezes combat, but final timed extraction never opens an unusable draft', function () {
	for (const wave of [1, 5]) {
		const { state, arsenal, mount, target } = fixture('helios');
		if (wave === 5 && state.campaign?.clock) state.campaign.clock.elapsed = 90 - 1 / 120;
		state.wave = wave; target.hp = 200; mount.charge = 1.99; mount.locked = true; mount.lockHeading = -Math.PI / 2;
		step(state, idle, 1 / 60);
		expect(state.enemies).toHaveLength(0);
		if (wave === 1) {
			expect(arsenal.pending).toBe(1); expect(arsenal.offers).toHaveLength(3);
			const time = state.time; const speed = state.player.vx;
			step(state, { ...idle, drive: 1 }, 1 / 60);
			expect(state.time).toBe(time); expect(state.player.vx).toBe(speed); expect(state.campaign?.phase).toBe('combat');
		} else {
			expect(arsenal.pending).toBe(0); expect(arsenal.offers).toHaveLength(0);
			for (let frame = 0; frame < 365; frame++) step(state, idle, 1 / 60);
			expect(state.outcome).toBe('won');
		}
	}
});

test('later encounters provide reachable grouped hulls for the short-range area weapon roles', function () {
	const state = createArsenalCampaign(); expect(installStarter(state, 'ion', 2)).toBe(true);
	const campaign = state.campaign; if (!campaign) throw new Error('Missing campaign');
	for (let wave = 2; wave <= 5; wave++) {
		state.enemies = []; campaign.phase = 'refit';
		expect(chooseRefit(state, 'repair')).toBe(true);
		const near = state.enemies.filter(function (enemy) { return distance(state.player, enemy) <= weaponStats('flak', 1).range; });
		expect(near.some(function (enemy) {
			return near.some(function (other) { return other.id !== enemy.id && distance(enemy, other) <= weaponStats('ion', 1).linkRange; });
		})).toBe(true);
	}
});
