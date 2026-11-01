import { describe, expect, test } from 'bun:test';
import { COVERAGE_SECTORS, coveragePlan, coverageReadiness, coverageStation, pointSector } from '../src/escort-coverage';
import { balanceCoverage, createState, deploy, replaceFighters, scrambleAll, setCoveragePriority, step, type State } from '../src/simulation';
import { worldPoint } from '../src/space';

const quiet = function (experimental = false) { const state = createState({ experimental }); state.salvage = 2000; state.nextWave = Infinity; return state; };
const advance = function (state: State, seconds: number) { for (let i = 0; i < Math.round(seconds * 60); i++) step(state, 1 / 60); };

describe('coarse escort coverage', function () {
	test('All locks other orders without losing saved priorities; releasing restores allocation', function () {
		const state = quiet(); deploy(state, 'interceptor'); deploy(state, 'interceptor');
		setCoveragePriority(state, 'port', 'high'); setCoveragePriority(state, 'ahead', 'off'); setCoveragePriority(state, 'astern', 'low');
		const before = structuredClone(state.coverage.priorities); const plan = [...coveragePlan(state)];
		expect(setCoveragePriority(state, 'starboard', 'all')).toBe(true);
		expect([...coveragePlan(state).values()]).toEqual(Array(2).fill('starboard'));
		expect(state.coverage.priorities).toEqual(before);
		const snapshot = JSON.stringify(state);
		expect(setCoveragePriority(state, 'port', 'all')).toBe(false); expect(setCoveragePriority(state, 'ahead', 'high')).toBe(false); expect(balanceCoverage(state)).toBe(false);
		expect(JSON.stringify(state)).toBe(snapshot);
		expect(setCoveragePriority(state, 'starboard', 'normal')).toBe(true);
		expect(state.coverage.priorities).toEqual(before); expect([...coveragePlan(state).values()].sort()).toEqual(plan.map(function (entry) { return entry[1]; }).sort());
	});
	test('Balanced restores all four Normal priorities; zero coverage holds without firing', function () {
		const state = quiet(); deploy(state, 'interceptor');
		for (const sector of COVERAGE_SECTORS) setCoveragePriority(state, sector, 'off');
		expect([...coveragePlan(state).values()]).toEqual([undefined]);
		state.status = 'running'; const craft = state.wings[0]?.craft[0]; if (!craft) throw new Error('Missing escort');
		state.enemies.push({ id: 900, x: craft.x, y: craft.y - 20, hp: 1000, maxHp: 1000, kind: 'raider', cooldown: 99 }); step(state, 1 / 60);
		expect(state.shots.filter(function (shot) { return shot.side === 'player'; })).toHaveLength(0);
		expect(balanceCoverage(state)).toBe(true); expect(Object.values(state.coverage.priorities)).toEqual(['normal', 'normal', 'normal', 'normal']);
	});
	test('allocations are deterministic, role-specific and stable through quiet ticks', function () {
		const state = quiet(); deploy(state, 'interceptor'); deploy(state, 'interceptor'); deploy(state, 'guardian'); deploy(state, 'guardian');
		const before = [...coveragePlan(state)]; state.status = 'running'; scrambleAll(state); advance(state, 3);
		expect([...coveragePlan(state)]).toEqual(before);
		expect(new Set(state.escorts.filter(function (craft) { return craft.kind === 'guardian'; }).map(function (craft) { return craft.sector; })).size).toBe(2);
		setCoveragePriority(state, 'port', 'all');
		expect(state.escorts.every(function (craft) { return craft.sector === 'port'; })).toBe(true);
		expect(new Set(state.escorts.map(function (craft) { return JSON.stringify(coverageStation(state, craft.id, craft.sector)); })).size).toBe(8);
	});
	test('sectors and screening follow a translated, rotated ship; off-side priorities do not pull escorts away', function () {
		const state = quiet(); state.ark = { x: 1400, y: -800, angle: Math.PI / 2, speed: 0 };
		for (const [point, sector] of [[{ x: 300, y: 0 }, 'ahead'], [{ x: -300, y: 0 }, 'astern'], [{ x: 0, y: -300 }, 'port'], [{ x: 0, y: 300 }, 'starboard']] as const) expect(pointSector(state, worldPoint(state, point))).toBe(sector);
		deploy(state, 'guardian'); setCoveragePriority(state, 'port', 'all'); state.status = 'running'; advance(state, 16);
		expect(coverageReadiness(state, 'port').onStation).toBe(1);
		state.enemies.push({ id: 900, ...worldPoint(state, { x: 0, y: 260 }), hp: 1000, maxHp: 1000, kind: 'armored', cooldown: 99 }); state.priority = 900;
		advance(state, .2); expect(state.shots.filter(function (shot) { return shot.side === 'player'; })).toHaveLength(0);
	});
	test('scrambled wings automatically launch intact, return, rearm and launch again without free replacement', function () {
		const state = quiet(true); deploy(state, 'interceptor'); const wing = state.wings[0]; if (!wing) throw new Error('Missing wing');
		setCoveragePriority(state, 'port', 'all'); state.status = 'running'; scrambleAll(state); step(state, 1 / 60);
		expect(wing.phase).toBe('launching'); expect(state.escorts).toHaveLength(3); expect(state.launches).toBe(1);
		expect(coverageReadiness(state, 'port').unavailable).toBe(3);
		advance(state, 40); expect(state.launches).toBeGreaterThan(1);
		const lost = wing.craft[0]; if (!lost) throw new Error('Missing fighter'); lost.hp = 0;
		const launchesBeforeLoss = state.launches;
		advance(state, 45); expect(state.launches).toBeGreaterThan(launchesBeforeLoss); expect(wing.craft).toHaveLength(2);
		for (let tick = 0; tick < 3600 && wing.phase !== 'rearming'; tick++) step(state, 1 / 60);
		expect(wing.phase).toBe('rearming'); const timer = wing.timer;
		const before = state.salvage; expect(replaceFighters(state, wing.id)).toBe(true); expect(state.salvage).toBe(before - 30);
		expect(wing.timer).toBe(timer); expect(wing.craft).toHaveLength(3);
		advance(state, timer + .1); expect(wing.phase).toBe('launching');
	});
	for (const restriction of ['paused', 'unfocused', 'won', 'lost'] as const) test(`${restriction} rejects coverage changes and freezes assignments`, function () {
		const state = quiet(); deploy(state, 'guardian'); state.status = 'running';
		if (restriction === 'paused') state.paused = true; else if (restriction === 'unfocused') state.focused = false; else state.status = restriction;
		const snapshot = JSON.stringify(state); expect(setCoveragePriority(state, 'ahead', 'all')).toBe(false); expect(balanceCoverage(state)).toBe(false); advance(state, 1); expect(JSON.stringify(state)).toBe(snapshot);
	});
});
