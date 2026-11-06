import { describe, expect, test } from 'bun:test';
import { applyDoctrine, doctrineReason, DOCTRINE_IDS, DOCTRINES } from '../src/doctrines';
import { arrangePlatform, build, createConvoyState, createState, invested, launchPassage, sell, type State } from '../src/simulation';

describe('starting convoy doctrines', function () {
	for (const id of DOCTRINE_IDS) test(`${id} spends normal weapon costs and retains full refitting refunds`, function () {
		const state = createConvoyState();
		expect(doctrineReason(state, id)).toBe('');
		expect(applyDoctrine(state, id)).toBe(true);
		expect(state.convoy?.doctrine).toBe(id);
		expect(state.salvage).toBe(650 - DOCTRINES[id].cost);
		expect(state.mounts.reduce(function (total, mount) { return total + invested(mount); }, 0)).toBe(DOCTRINES[id].cost);
		expect(state.convoy?.platforms).toHaveLength(2);
		const fitted = structuredClone(state);
		expect(launchPassage(fitted)).toBe(true);
		for (const [index, mount] of state.mounts.entries()) if (mount.weapon) expect(sell(state, index)).toBe(true);
		expect(state.salvage).toBe(650);
		expect(applyDoctrine(state, id)).toBe(false);
	});

	test('partial staged fitting failures leave all original equipment and funds untouched', function () {
		const state = createConvoyState();
		const mount = state.mounts[8];
		if (!mount) throw new Error('Missing platform mount');
		mount.platform = 99;
		const before = structuredClone(state);
		// Two ark purchases would succeed before the invalid platform is reached.
		expect(applyDoctrine(state, 'balanced')).toBe(false);
		expect(state).toEqual(before);
	});

	test('custom edits remain protected even after purchases or formation changes are undone', function () {
		const bought = createConvoyState();
		build(bought, 0, 'flak'); sell(bought, 0);
		const moved = createConvoyState();
		arrangePlatform(moved, 0, 'starboard'); arrangePlatform(moved, 0, 'port');
		for (const state of [bought, moved]) {
			const before = structuredClone(state);
			expect(doctrineReason(state, 'balanced')).toContain('customized');
			expect(applyDoctrine(state, 'balanced')).toBe(false);
			expect(state).toEqual(before);
		}
	});

	test('pause, focus, phase, insufficient funds and legacy fixtures reject without mutations', function () {
		const paused = createConvoyState(); paused.paused = true;
		const unfocused = createConvoyState(); unfocused.focused = false;
		const poor = createConvoyState(); poor.salvage = 100;
		const running = createConvoyState(); build(running, 0, 'rail'); launchPassage(running);
		const later = createConvoyState(); later.wave = 1;
		const states: State[] = [paused, unfocused, poor, running, later, createState()];
		for (const state of states) {
			const before = structuredClone(state);
			expect(doctrineReason(state, 'balanced')).not.toBe('');
			expect(applyDoctrine(state, 'balanced')).toBe(false);
			expect(state).toEqual(before);
		}
	});
});
