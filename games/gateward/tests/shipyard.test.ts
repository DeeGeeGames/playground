import { expect, test } from 'bun:test';
import { arrangePlatform, build, constructionCostRequirement, constructPlatform, createConvoyState, FORMATION, FORMATION_SLOTS, HULLS, launchPassage, PASSAGE_SECONDS, step, type HullKind } from '../src/simulation';
import { mountWorld, worldPoint } from '../src/space';

test('each hull can be built in either ring without filling the inner ring; costs buy distinct owned mounts', function () {
	for (const hull of ['corvette', 'frigate', 'cruiser'] satisfies HullKind[]) {
		for (const slot of ['ahead', 'middle-1'] as const) {
			const state = createConvoyState();
			const existing = [...state.mounts];
			expect(constructPlatform(state, slot, hull)).toBe(true);
			const ship = state.convoy?.platforms.at(-1);
			if (!ship) throw new Error('Missing constructed ship');
			expect(ship.slot).toBe(slot);
			expect(ship.hp).toBe(HULLS[hull].hp);
			expect(state.salvage).toBe(650 - HULLS[hull].cost);
			const mounts = state.mounts.filter(function (mount) { return mount.platform === ship.id; });
			expect(mounts).toHaveLength(HULLS[hull].mounts);
			expect(new Set(mounts.map(function (mount) { return `${mount.x},${mount.y}`; })).size).toBe(mounts.length);
			expect(mounts.every(function (mount) { return !mount.weapon && mount.integrity === 100; })).toBe(true);
			for (const [index, mount] of existing.entries()) expect(state.mounts[index]).toBe(mount);
		}
	}
	expect(FORMATION.filter(function (slot) { return FORMATION_SLOTS[slot].ring === 'inner'; })).toHaveLength(6);
	expect(FORMATION.filter(function (slot) { return FORMATION_SLOTS[slot].ring === 'middle'; })).toHaveLength(8);
});

test('occupied slots, insufficient salvage, pause, lost focus, and combat reject construction atomically', function () {
	const assertRejected = function (state: ReturnType<typeof createConvoyState>, slot: 'ahead' | 'port') {
		const before = JSON.stringify(state);
		expect(constructPlatform(state, slot, 'frigate')).toBe(false);
		expect(JSON.stringify(state)).toBe(before);
	};
	const state = createConvoyState();
	assertRejected(state, 'port');
	state.salvage = HULLS.frigate.cost - 1; assertRejected(state, 'ahead');
	state.salvage = 650; state.paused = true; assertRejected(state, 'ahead');
	state.paused = false; state.focused = false; assertRejected(state, 'ahead');
	state.focused = true; build(state, 0, 'flak'); launchPassage(state); assertRejected(state, 'ahead');
});

test('new ship mounts move with their owner, take hostile hits at the new station, and restore hull-specific health', function () {
	const state = createConvoyState();
	constructPlatform(state, 'middle-1', 'cruiser');
	const ship = state.convoy?.platforms.at(-1);
	const mount = state.mounts.at(-1);
	if (!ship || !mount) throw new Error('Missing cruiser');
	const mountIndex = state.mounts.length - 1;
	expect(build(state, mountIndex, 'rail')).toBe(true);
	const origin = mountWorld(state, mount);
	expect(arrangePlatform(state, ship.id, 'middle-8')).toBe(true);
	expect(mount.weapon).toBe('rail');
	expect(mountWorld(state, mount)).not.toEqual(origin);
	launchPassage(state); state.enemies = [];
	const station = worldPoint(state, FORMATION_SLOTS[ship.slot]);
	const point = { ...station, z: mountWorld(state, mount).z ?? 0 };
	state.shots.push({ ...point, id: 10000, vx: 0, vy: 0, damage: 500, side: 'enemy', weapon: 'hostile', target: undefined, life: 2 });
	step(state, 0.05);
	expect(ship.hp).toBe(0);
	expect(mount.weapon).toBeUndefined();
	if (!state.convoy) throw new Error('Missing convoy');
	state.convoy.elapsed = PASSAGE_SECONDS;
	step(state, 0.05);
	expect(state.status).toBe('fitting');
	expect(ship.hp).toBe(HULLS.cruiser.hp);
	expect(mount.weapon).toBeUndefined();
});


test('hull purchases preserve the budget for a first weapon until a weapon is equipped', function () {
	const state = createConvoyState();
	expect(constructPlatform(state, 'middle-1', 'cruiser')).toBe(true);
	expect(state.salvage).toBe(270);
	const before = JSON.stringify(state);
	expect(constructionCostRequirement(state, 'frigate')).toBe(295);
	expect(constructPlatform(state, 'middle-2', 'frigate')).toBe(false);
	expect(JSON.stringify(state)).toBe(before);
	expect(build(state, 0, 'flak')).toBe(true);
	expect(constructionCostRequirement(state, 'corvette')).toBe(120);
	expect(constructPlatform(state, 'middle-2', 'corvette')).toBe(true);
	expect(launchPassage(state)).toBe(true);

	const exactBudget = createConvoyState(); exactBudget.salvage = 195;
	expect(constructPlatform(exactBudget, 'middle-1', 'corvette')).toBe(true);
	expect(exactBudget.salvage).toBe(75);
	expect(build(exactBudget, 0, 'flak')).toBe(true);
	expect(exactBudget.salvage).toBe(0);
	expect(launchPassage(exactBudget)).toBe(true);
});
