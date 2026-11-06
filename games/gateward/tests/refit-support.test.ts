import { describe, expect, test } from 'bun:test';
import { chooseRefitSupport, refitSupportReason, REFIT_SUPPORT_IDS } from '../src/refit-support';
import { build, createConvoyState, createState, launchPassage, MAX_HULL, PASSAGE_SECONDS, step, type State } from '../src/simulation';

const finishQuietPassage = function (state: State) {
	expect(launchPassage(state)).toBe(true);
	state.enemies = [];
	for (let tick = 0; tick < PASSAGE_SECONDS * 20; tick++) step(state, 0.05);
};
const refitting = function () {
	const state = createConvoyState();
	state.hull = 800;
	build(state, 0, 'rail');
	finishQuietPassage(state);
	return state;
};

describe('optional refit support', function () {
	test('support adds a single receipt without replacing existing supplies or passage outcomes', function () {
		const state = refitting();
		const report = state.convoy?.reports?.[0];
		if (!report) throw new Error('Missing passage report');
		expect(state.hull).toBe(920);
		expect(state.salvage).toBe(650 - 115 + 200);
		expect(report).toMatchObject({ hullAfter: 800, recoveryHull: 120, recoverySalvage: 200 });
		expect(chooseRefitSupport(state, 'repair')).toBe(true);
		expect(state.hull).toBe(1020);
		expect(report).toMatchObject({ hullAfter: 800, recoveryHull: 120, recoverySalvage: 200, support: { id: 'repair', hull: 100, salvage: 0, shield: 0 } });
		const before = structuredClone(state);
		for (const id of REFIT_SUPPORT_IDS) expect(chooseRefitSupport(state, id)).toBe(false);
		step(state, 0.05);
		expect(state).toEqual(before);
	});

	test('hull and shield support cap at capacity and record only the actual recovery', function () {
		const repair = refitting(); repair.hull = MAX_HULL - 25;
		expect(chooseRefitSupport(repair, 'repair')).toBe(true);
		expect(repair.hull).toBe(MAX_HULL);
		expect(repair.convoy?.reports?.[0]?.support?.hull).toBe(25);
		const shield = refitting();
		shield.systems.shield.charge = 30; shield.systems.shield.rechargeDelay = 3;
		expect(chooseRefitSupport(shield, 'shield')).toBe(true);
		expect(shield.systems.shield.charge).toBe(shield.systems.shield.capacity);
		expect(shield.systems.shield.rechargeDelay).toBe(0);
		expect(shield.convoy?.reports?.[0]?.support?.shield).toBe(shield.systems.shield.capacity - 30);
	});

	test('an ineffective recovery cannot consume the choice, and salvage grants exactly once', function () {
		const state = refitting(); state.hull = MAX_HULL; state.systems.shield.charge = state.systems.shield.capacity;
		const before = structuredClone(state);
		expect(chooseRefitSupport(state, 'repair')).toBe(false);
		expect(chooseRefitSupport(state, 'shield')).toBe(false);
		expect(state).toEqual(before);
		const salvage = state.salvage;
		expect(chooseRefitSupport(state, 'salvage')).toBe(true);
		expect(state.salvage).toBe(salvage + 80);
		expect(chooseRefitSupport(state, 'salvage')).toBe(false);
		expect(state.salvage).toBe(salvage + 80);
	});

	test('skipped support expires on launch and each subsequent refit has its own choice', function () {
		const state = refitting();
		expect(launchPassage(state)).toBe(true);
		expect(chooseRefitSupport(state, 'salvage')).toBe(false);
		state.enemies = [];
		for (let tick = 0; tick < PASSAGE_SECONDS * 20; tick++) step(state, 0.05);
		expect(chooseRefitSupport(state, 'salvage')).toBe(true);
		expect(state.convoy?.reports?.[0]?.support).toBeUndefined();
		expect(state.convoy?.reports?.[1]?.support?.id).toBe('salvage');
		finishQuietPassage(state);
		expect(state.status).toBe('won');
		expect(chooseRefitSupport(state, 'salvage')).toBe(false);
	});

	test('choices reject before passage completion, during pause or focus loss, and in legacy fixtures', function () {
		const paused = refitting(); paused.paused = true;
		const unfocused = refitting(); unfocused.focused = false;
		const unearned = createConvoyState(); unearned.wave = 1;
		for (const state of [createConvoyState(), paused, unfocused, unearned, createState()]) {
			const before = structuredClone(state);
			expect(refitSupportReason(state, 'salvage')).not.toBe('');
			expect(chooseRefitSupport(state, 'salvage')).toBe(false);
			expect(state).toEqual(before);
		}
	});
});
