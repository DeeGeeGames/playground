import { expect, test } from 'bun:test';
import { build, createConvoyState, createState, launchPassage, PASSAGE_SECONDS, setAllocation, step, type State } from '../src/simulation';
import { mountWorld, worldPoint } from '../src/space';

const advance = function (state: State, ticks: number) {
	for (let tick = 0; tick < ticks; tick++) step(state, 1 / 60);
};
const finishPassage = function (state: State) {
	if (!state.convoy) throw new Error('Expected convoy');
	state.enemies = [];
	state.convoy.elapsed = PASSAGE_SECONDS - 1 / 60;
	step(state, 1 / 60);
};

test('passage feedback distinguishes actual shots from loaded guns without a firing arc', function () {
	const state = createConvoyState();
	build(state, 0, 'flak'); build(state, 4, 'flak');
	expect(launchPassage(state)).toBe(true);
	const point = worldPoint(state, { x: -96, y: -400 });
	state.enemies = [{ ...point, station: point, id: 999, kind: 'armored', hp: 10000, maxHp: 10000, cooldown: 999 }];
	const fired = new Set<number>();
	for (let tick = 0; tick < 60; tick++) {
		step(state, 1 / 60);
		for (const shot of state.shots) if (shot.side === 'player' && shot.weapon === 'flak') fired.add(shot.id);
	}
	const active = state.convoy?.departure?.weaponActivity?.find(function (entry) { return entry.mount === 0; });
	const idle = state.convoy?.departure?.weaponActivity?.find(function (entry) { return entry.mount === 4; });
	if (!active || !idle) throw new Error('Missing fitted weapon feedback');
	expect(fired.size).toBeGreaterThan(0);
	expect(active).toEqual({ mount: 0, weapon: 'flak', shots: fired.size, beamSeconds: 0 });
	expect(idle).toEqual({ mount: 4, weapon: 'flak', shots: 0, beamSeconds: 0 });
	finishPassage(state);
	const report = state.convoy?.reports?.[0];
	expect(report?.weaponActivity).toEqual([active, idle]);
	expect(launchPassage(state)).toBe(true);
	expect(state.convoy?.departure?.weaponActivity?.every(function (entry) { return entry.shots === 0 && entry.beamSeconds === 0; })).toBe(true);
	expect(report?.weaponActivity?.[0]?.shots).toBe(fired.size);
});

test('beam feedback measures actual active simulation seconds and freezes without aim, power or focus', function () {
	const state = createConvoyState();
	build(state, 8, 'beam'); launchPassage(state);
	const point = worldPoint(state, { x: 0, y: -1500 });
	state.enemies = [{ ...point, station: point, id: 999, kind: 'armored', hp: 10000, maxHp: 10000, cooldown: 999 }];
	advance(state, 60);
	const activity = state.convoy?.departure?.weaponActivity?.[0];
	expect(activity?.beamSeconds).toBeCloseTo(1);
	expect(activity?.shots).toBe(0);
	state.paused = true; advance(state, 30); state.paused = false;
	state.focused = false; advance(state, 30); state.focused = true;
	expect(activity?.beamSeconds).toBeCloseTo(1);
	expect(setAllocation(state, { engines: 4, weapons: 0, shields: 6 })).toBe(true);
	advance(state, 30);
	expect(activity?.beamSeconds).toBeCloseTo(1);
	expect(setAllocation(state, { engines: 4, weapons: 4, shields: 2 })).toBe(true);
	const enemy = state.enemies[0]; if (!enemy) throw new Error('Missing target');
	enemy.y = 1500; enemy.station = { x: enemy.x, y: enemy.y };
	advance(state, 30);
	expect(activity?.beamSeconds).toBeCloseTo(1);
	finishPassage(state);
	expect(state.convoy?.reports?.[0]?.weaponActivity?.[0]?.beamSeconds).toBeCloseTo(1);
});

test('destroyed platform weapons retain their activity in reports and disappear from the next departure', function () {
	const state = createConvoyState();
	build(state, 8, 'beam'); build(state, 0, 'flak'); launchPassage(state);
	state.enemies = [{ ...worldPoint(state, { x: 0, y: -1500 }), id: 999, kind: 'armored', hp: 10000, maxHp: 10000, cooldown: 999 }];
	advance(state, 30);
	const mount = state.mounts[8]; if (!mount) throw new Error('Missing platform mount');
	const point = mountWorld(state, mount);
	state.shots.push({ ...point, id: 1000, vx: 0, vy: 0, damage: 300, side: 'enemy', weapon: 'hostile', target: undefined, life: 2 });
	step(state, 1 / 60);
	expect(mount.weapon).toBeUndefined();
	const departureActivity = state.convoy?.departure?.weaponActivity?.find(function (entry) { return entry.mount === 8; });
	if (!departureActivity) throw new Error('Missing departure feedback');
	expect(departureActivity.beamSeconds).toBeGreaterThan(0);
	finishPassage(state);
	const report = state.convoy?.reports?.[0];
	expect(report?.weaponsLost).toBe(1);
	expect(report?.weaponActivity?.find(function (entry) { return entry.mount === 8; })).toEqual({ ...departureActivity, platform: 0, weapon: 'beam' });
	const firedFor = departureActivity.beamSeconds;
	departureActivity.beamSeconds = 0;
	expect(report?.weaponActivity?.find(function (entry) { return entry.mount === 8; })?.beamSeconds).toBe(firedFor);
	expect(launchPassage(state)).toBe(true);
	expect(state.convoy?.departure?.weaponActivity?.some(function (entry) { return entry.mount === 8; })).toBe(false);
});

test('legacy firing still works without creating convoy activity records', function () {
	const state = createState();
	build(state, 0, 'beam'); state.status = 'running'; state.nextWave = Infinity;
	state.enemies = [{ id: 999, kind: 'armored', x: -96, y: -200, hp: 1000, maxHp: 1000, cooldown: 999 }];
	advance(state, 60);
	expect(state.enemies[0]?.hp).toBeCloseTo(1000 - 48 * 0.48);
	expect(state.convoy).toBeUndefined();
});
