import { describe, expect, test } from 'bun:test';
import { createGamepadInput, type GamepadSnapshot } from '../src/gamepad';
import { addOperationRecord, defaultSettings, parseProfile } from '../src/profile';

const pad = function (pressed: number[] = [], axes = [0, 0, 0, 0]): GamepadSnapshot {
	return { axes, buttons: Array.from({ length: 17 }, function (_, index) { return { pressed: pressed.includes(index), touched: pressed.includes(index), value: pressed.includes(index) ? 1 : 0 }; }), connected: true, index: 0, mapping: 'standard' };
};
describe('Iron Wake player preferences and input boundaries', function () {
	test('corrupt or partial storage cannot prevent deployment or introduce invalid settings', function () {
		expect(parseProfile('{broken')).toEqual({ settings: defaultSettings(), records: [], bests: [] });
		const profile = parseProfile(JSON.stringify({ settings: { master: 90, music: -5, effects: 'loud', difficulty: 'impossible', reducedMotion: 'false' }, records: [{ score: 100 }, null] }));
		expect(profile.settings.master).toBe(1); expect(profile.settings.music).toBe(0); expect(profile.settings.effects).toBe(0.85);
		expect(profile.settings.difficulty).toBe('standard'); expect(profile.settings.reducedMotion).toBe(false); expect(profile.records).toEqual([]);
	});
	test('historical difficulty records survive bounded recent history and storage reload', function () {
		let profile = addOperationRecord(parseProfile(null), { difficulty: 'standard', won: true, score: 18000, rank: 'S', kills: 39, wave: 5, time: 300, relay: 90 });
		for (let index = 0; index < 12; index++) profile = addOperationRecord(profile, { difficulty: 'standard', won: false, score: 200, rank: 'D', kills: 1, wave: 1, time: 30, relay: 0 });
		const restored = parseProfile(JSON.stringify(profile));
		expect(restored.records).toHaveLength(8); expect(restored.bests[0]?.score).toBe(18000);
	});
	test('menu buttons trigger only once until released, and disconnect clears firing and axes', function () {
		const input = createGamepadInput(); input.read([pad()], 0);
		const first = input.read([pad([9, 7], [0.5, -1, 1, 0])], 16);
		expect(first.pause).toBe(true); expect(first.cannon).toBe(true); expect(first.drive).toBe(1); expect(first.aimX).toBe(1);
		expect(input.read([pad([9, 7])], 32).pause).toBe(false);
		const lost = input.read([], 48); expect(lost.connected).toBe(false); expect(lost.cannon).toBe(false); expect(lost.drive).toBeCloseTo(0); expect(lost.turn).toBe(0);
		input.read([pad()], 64); expect(input.read([pad([9])], 80).pause).toBe(true);
	});
	test('stick drift is ignored and menu navigation repeats at a bounded rate', function () {
		const input = createGamepadInput(); const drifting = input.read([pad([], [0.12, -0.09, 0.03, -0.1])], 0);
		expect(drifting.drive).toBeCloseTo(0); expect(drifting.turn).toBe(0); expect(drifting.aimX).toBe(0); expect(drifting.navigate).toBe(0);
		expect(input.read([pad([13])], 16).navigate).toBe(1);
		expect(input.read([pad([13])], 32).navigate).toBe(0);
		expect(input.read([pad([13])], 450).navigate).toBe(1);
	});
});
