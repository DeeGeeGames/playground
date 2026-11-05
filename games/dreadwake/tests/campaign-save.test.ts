import { expect, test } from 'bun:test';
import { CAMPAIGN_SAVE_KEY, captureCampaign, clearCampaign, readCampaign, restoreCampaign, writeCampaign } from '../src/campaign-save';
import { CAMPAIGN_MISSIONS, createCampaignState } from '../src/simulation';

test('checkpoint restoration rebuilds only the current fleet and retains campaign investments', function () {
	const base = captureCampaign(createCampaignState());
	for (const [index, mission] of CAMPAIGN_MISSIONS.entries()) {
		const kills = CAMPAIGN_MISSIONS.slice(0, index).reduce(function (sum, item) { return sum + item.enemies.length; }, 0);
		const state = restoreCampaign({ ...base, wave: index + 1, rails: index, kills, hull: 450, time: 120 });
		expect(state).toBeDefined();
		expect(state?.enemies.map(function (enemy) { return enemy.kind; })).toEqual([...mission.enemies]);
		expect(new Set(state?.enemies.map(function (enemy) { return enemy.id; })).size).toBe(mission.enemies.length);
		expect(state?.campaign?.upgrades.rails).toBe(index);
		expect(state?.player.hp).toBe(450);
		expect(state?.time).toBe(120);
		expect(state?.shells).toEqual([]);
	}
	const refit = restoreCampaign({ ...base, phase: 'refit', kills: 2, hull: 450 });
	const save = refit && captureCampaign(refit);
	expect(refit?.enemies).toEqual([]);
	expect(refit?.campaign?.phase).toBe('refit');
	expect(save && restoreCampaign(save)?.player.hp).toBe(450);
});

test('untrusted checkpoints reject invalid shape, impossible progress and non-finite numbers', function () {
	const base = captureCampaign(createCampaignState());
	for (const invalid of [null, [], 'save', {}, { ...base, version: 2 }, { ...base, hull: NaN },
		{ ...base, hull: 0 }, { ...base, hull: 1401 }, { ...base, time: Infinity }, { ...base, wave: 1.5 },
		{ ...base, wave: 6 }, { ...base, rails: 1 }, { ...base, kills: 1 }, { ...base, stats: {} },
		{ ...base, phase: 'won' }, { ...base, phase: 'refit', wave: 5, kills: 14 },
		{ ...base, wave: 3, kills: 5, rails: 2, capacitor: 2 }]) expect(restoreCampaign(invalid)).toBeUndefined();
});

test('storage distinguishes absent, corrupted and inaccessible saves without crashing', function () {
	const data = new Map<string, string>();
	const storage = {
		getItem: function (key: string) { return data.get(key) ?? null; },
		setItem: function (key: string, value: string) { data.set(key, value); },
		removeItem: function (key: string) { data.delete(key); },
	};
	expect(readCampaign(storage).status).toBe('empty');
	expect(writeCampaign(createCampaignState(), storage)).toBe(true);
	expect(readCampaign(storage).status).toBe('saved');
	data.set(CAMPAIGN_SAVE_KEY, '{broken');
	expect(readCampaign(storage).status).toBe('invalid');
	expect(clearCampaign(storage)).toBe(true);
	expect(readCampaign(storage).status).toBe('empty');
	const fail = function (): never { throw new Error('Storage blocked'); };
	const blocked = { getItem: fail, setItem: fail, removeItem: fail };
	expect(readCampaign(blocked).status).toBe('unavailable');
	expect(writeCampaign(createCampaignState(), blocked)).toBe(false);
	expect(clearCampaign(blocked)).toBe(false);
});
