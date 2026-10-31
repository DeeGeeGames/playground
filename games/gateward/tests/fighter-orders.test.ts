import { describe, expect, test } from 'bun:test';
import { balanceCoverage, craftCount, createState, deploy, recallAll, scrambleAll, setCoveragePriority, step, type State } from '../src/simulation';

const advance = function (state: State, seconds: number) { for (let tick = 0; tick < seconds * 60; tick++) step(state, 1 / 60); };
const fleet = function (scenario?: 'drill' | 'systems') {
	const state = createState(scenario ? { scenario } : {}); state.salvage = 1000; state.nextWave = Infinity;
	deploy(state, 'interceptor'); deploy(state, 'interceptor'); deploy(state, 'guardian');
	return state;
};

describe('fleet fighter orders', function () {
	for (const scenario of [undefined, 'drill', 'systems'] as const) test(`${scenario ?? 'voyage'} starts docked and recalls all wings until explicitly scrambled`, function () {
		const state = fleet(scenario);
		expect(craftCount(state)).toBe(7); expect(scrambleAll(state)).toBe(false);
		state.status = 'running'; advance(state, 3);
		expect(state.launches).toBe(0); expect(state.escorts).toHaveLength(1);
		const guardian = state.escorts[0]; if (!guardian) throw new Error('Missing guardian');
		expect(scrambleAll(state)).toBe(true); expect(scrambleAll(state)).toBe(false);
		expect(state.escorts).toHaveLength(7); advance(state, 3);
		expect(state.wings.every(function (wing) { return wing.phase === 'sortie'; })).toBe(true);
		expect(recallAll(state)).toBe(true); expect(recallAll(state)).toBe(false);
		expect(state.wings.every(function (wing) { return wing.phase === 'returning'; })).toBe(true);
		setCoveragePriority(state, 'port', 'all'); setCoveragePriority(state, 'port', 'normal'); balanceCoverage(state);
		advance(state, 20);
		expect(state.wings.every(function (wing) { return wing.phase === 'ready'; })).toBe(true);
		expect(state.escorts).toEqual([guardian]); expect(craftCount(state)).toBe(7);
		expect(state.launches).toBe(2); expect(scrambleAll(state)).toBe(true); expect(state.launches).toBe(4);
	});
	test('recall interrupts launch without teleporting and returning craft cannot fire', function () {
		const state = fleet(); state.status = 'running'; scrambleAll(state); advance(state, .5);
		const positions = state.wings.flatMap(function (wing) { return wing.craft.map(function (craft) { return { x: craft.x, y: craft.y }; }); });
		expect(recallAll(state)).toBe(true);
		expect(state.wings.flatMap(function (wing) { return wing.craft.map(function (craft) { return { x: craft.x, y: craft.y }; }); })).toEqual(positions);
		state.escorts = state.escorts.filter(function (craft) { return craft.kind === 'interceptor'; });
		state.enemies.push({ id: 900, kind: 'raider', x: -100, y: 0, hp: 1000, maxHp: 1000, cooldown: 99 });
		advance(state, .5); expect(state.shots.filter(function (shot) { return shot.side === 'player'; })).toHaveLength(0);
	});
	for (const restriction of ['paused', 'unfocused', 'won', 'lost'] as const) test(`${restriction} rejects fleet orders without mutation`, function () {
		const state = fleet(); state.status = 'running'; scrambleAll(state);
		if (restriction === 'paused') state.paused = true; else if (restriction === 'unfocused') state.focused = false; else state.status = restriction;
		const before = JSON.stringify(state); expect(recallAll(state)).toBe(false); expect(scrambleAll(state)).toBe(false); expect(JSON.stringify(state)).toBe(before);
	});
});
