import { describe, expect, test } from 'bun:test';
import { arrangePlatform, build, covered, createConvoyState, invested, launchPassage, PASSAGES, PASSAGE_SECONDS, sell, setAllocation, step, subsystemAt, transferPower, upgrade } from '../src/simulation';
import { mountWorld, worldPoint } from '../src/space';

const advance = function (state: ReturnType<typeof createConvoyState>, seconds: number) {
	for (let tick = 0; tick < Math.ceil(seconds * 20); tick++) step(state, 0.05);
};

describe('convoy build and passage lifecycle', function () {
	test('ark impacts never select remote platform equipment', function () {
		const state = createConvoyState(); build(state, 8, 'rail');
		expect(subsystemAt(state, { x: -20, y: -40 })).toBeUndefined();
	});
	test('heavy defenses stay at their world stations as the convoy passes', function () {
		const state = createConvoyState(); build(state, 0, 'flak'); launchPassage(state);
		const battery = state.enemies.find(function (enemy) { return enemy.kind === 'armored'; });
		if (!battery) throw new Error('Missing battery');
		const start = { x: battery.x, y: battery.y };
		advance(state, 20);
		expect(Math.hypot(battery.x - start.x, battery.y - start.y)).toBeLessThan(1);
		expect(state.ark.x).toBeGreaterThan(start.x);
	});

	test('build phase freezes every simulation resource and does not spawn the next encounter', function () {
		const state = createConvoyState();
		const before = JSON.stringify(state);
		advance(state, 90);
		expect(JSON.stringify(state)).toBe(before);
		expect(launchPassage(state)).toBe(false);
	});
	test('full refunds include upgrades and swapping slots preserves ownership and gun investments', function () {
		const state = createConvoyState();
		expect(build(state, 8, 'rail')).toBe(true);
		expect(upgrade(state, 8)).toBe(true);
		const gun = state.mounts[8];
		if (!gun) throw new Error('Missing platform mount');
		const cost = invested(gun);
		expect(state.salvage).toBe(650 - cost);
		expect(arrangePlatform(state, 0, 'astern')).toBe(true);
		expect(state.convoy?.platforms.map(function (platform) { return platform.slot; })).toEqual(['astern', 'port']);
		expect(gun.platform).toBe(0);
		expect(gun.weapon).toBe('rail');
		expect(sell(state, 8)).toBe(true);
		expect(state.salvage).toBe(650);
		expect(sell(state, 8)).toBe(false);
	});
	test('formation changes real firing origin and arc, rather than only presentation', function () {
		const state = createConvoyState(); build(state, 8, 'rail');
		const gun = state.mounts[8]; if (!gun) throw new Error('Missing mount');
		const target = worldPoint(state, { x: 0, y: -1500 });
		const origin = mountWorld(state, gun);
		expect(covered(state, gun, target)).toBe(true);
		arrangePlatform(state, 0, 'starboard');
		expect(mountWorld(state, gun)).not.toEqual(origin);
		expect(covered(state, gun, target)).toBe(false);
	});
	test('combat rejects fitting and formation changes; focus and pause suspend travel', function () {
		const state = createConvoyState(); build(state, 8, 'rail'); launchPassage(state);
		expect(build(state, 9, 'beam')).toBe(false);
		expect(sell(state, 8)).toBe(false);
		expect(upgrade(state, 8)).toBe(false);
		expect(arrangePlatform(state, 0, 'ahead')).toBe(false);
		expect(launchPassage(state)).toBe(false);
		state.paused = true; advance(state, 2); expect(state.time).toBe(0);
		state.paused = false; state.focused = false; advance(state, 2); expect(state.time).toBe(0);
	});
	test('reserved cruise power and disabled engines cannot stall progression; survivors cannot strand refitting or arrival', function () {
		const state = createConvoyState(); build(state, 0, 'flak');
		expect(setAllocation(state, { engines: 0, weapons: 8, shields: 2 })).toBe(false);
		expect(transferPower(state, 'engines', 'weapons')).toBe(false);
		expect(transferPower(state, 'shields', 'weapons')).toBe(true);
		state.systems.engines.integrity = 0;
		for (let passage = 0; passage < PASSAGES.length; passage++) {
			expect(launchPassage(state)).toBe(true);
			state.enemies = [{ id: 9999, kind: 'carrier', hp: 600, maxHp: 600, cooldown: 100, x: -100000, y: 100000 }];
			const salvage = state.salvage;
			advance(state, PASSAGE_SECONDS);
			expect(state.status).toBe(passage === PASSAGES.length - 1 ? 'won' : 'fitting');
			expect(state.enemies).toHaveLength(0);
			expect(state.arrivals).toHaveLength(0);
			expect(state.salvage).toBe(salvage + (passage < 2 ? 200 : 0));
			const before = JSON.stringify(state); advance(state, 20); expect(JSON.stringify(state)).toBe(before);
		}
		expect(state.resultReason).toBe('arrival');
	});
	test('platform fires automatically and hostile fire destroys its guns without refund', function () {
		const state = createConvoyState(); build(state, 8, 'beam'); launchPassage(state);
		state.enemies = [{ id: 999, kind: 'armored', hp: 260, maxHp: 260, cooldown: 100, ...worldPoint(state, { x: 0, y: -1500 }) }];
		advance(state, 1);
		expect(state.enemies[0]?.hp).toBeLessThan(260);
		const platform = state.convoy?.platforms[0]; const gun = state.mounts[8];
		if (!platform || !gun) throw new Error('Missing platform');
		const point = mountWorld(state, gun);
		state.shots.push({ ...point, id: 1000, vx: 0, vy: 0, damage: 300, side: 'enemy', weapon: 'hostile', target: undefined, life: 2 });
		step(state, 0.05);
		expect(platform.hp).toBe(0);
		expect(gun.weapon).toBeUndefined();
		const salvage = state.salvage;
		expect(sell(state, 8)).toBe(false);
		expect(state.salvage).toBe(salvage);
		state.enemies = []; advance(state, PASSAGE_SECONDS);
		expect(platform.hp).toBe(240);
		expect(gun.weapon).toBeUndefined();
	});
	test('hull destruction wins precedence over a passage exit and restart creates fresh blank platforms', function () {
		const state = createConvoyState(); build(state, 0, 'rail'); launchPassage(state);
		if (state.convoy) state.convoy.elapsed = PASSAGE_SECONDS;
		state.hull = 0; step(state, 0.05);
		expect(state.status).toBe('lost'); expect(state.resultReason).toBe('hull');
		const fresh = createConvoyState(); expect(fresh.wave).toBe(0); expect(fresh.status).toBe('fitting');
		expect(fresh.mounts.every(function (mount) { return mount.weapon === undefined; })).toBe(true);
		expect(fresh.salvage).toBe(650);
	});
});
