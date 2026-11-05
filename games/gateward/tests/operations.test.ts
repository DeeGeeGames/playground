import { expect, test } from 'bun:test';
import { OPERATION_IDS } from '../src/operations';
import { build, createConvoyState, createState, launchPassage, operationFor, passagesFor, PASSAGES, PASSAGE_SECONDS, ROUTE_LENGTH, step } from '../src/simulation';
import { journeyFor } from '../src/journey';
import { systemsSummary } from '../src/trial-summary';

for (const id of OPERATION_IDS) {
	test(`${id} keeps passage speed, refits and reports through its own final arrival`, function () {
		const state = createConvoyState(id);
		const passages = passagesFor(state);
		expect(operationFor(state).name).toBeTruthy();
		expect(state.systems.routeLength).toBeCloseTo(ROUTE_LENGTH / PASSAGES.length * passages.length);
		expect(journeyFor(state).eta).toBeCloseTo(passages.length * PASSAGE_SECONDS);
		expect(systemsSummary(state).totalContacts).toBe(passages.length);
		build(state, 0, 'rail');
		for (const [index, passage] of passages.entries()) {
			expect(launchPassage(state)).toBe(true);
			expect(state.enemies.map(function (enemy) { return enemy.kind; })).toEqual(passage.threats.map(function (threat) { return threat.kind; }));
			expect(journeyFor(state).speed).toBeCloseTo(ROUTE_LENGTH / (PASSAGES.length * PASSAGE_SECONDS));
			// Isolate route timing and refit transitions from combat balance.
			state.enemies = [];
			for (let tick = 0; tick < PASSAGE_SECONDS * 20; tick++) step(state, 0.05);
			expect(state.status).toBe(index === passages.length - 1 ? 'won' : 'fitting');
			expect(state.convoy?.reports).toHaveLength(index + 1);
			expect(state.convoy?.reports?.[index]?.name).toBe(passage.name);
			expect(state.convoy?.reports?.[index]?.recoverySalvage).toBe(index === passages.length - 1 ? 0 : 200);
		}
		expect(state.systems.distanceTraveled).toBe(state.systems.routeLength);
		expect(state.time).toBeCloseTo(passages.length * PASSAGE_SECONDS);
		expect(journeyFor(state).eta).toBe(0);
		expect(launchPassage(state)).toBe(false);
	});
}

test('default convoy retains Kepler while legacy scenarios keep their original route', function () {
	const state = createConvoyState();
	expect(passagesFor(state)).toBe(PASSAGES);
	expect(state.systems.routeLength).toBe(ROUTE_LENGTH);
	const legacy = createState();
	expect(legacy.convoy).toBeUndefined();
	expect(legacy.systems.routeLength).toBe(ROUTE_LENGTH);
});
