import { expect, test } from 'bun:test';
import { awardSalvage, installStarter, resolveDraft } from '../src/arsenal';
import { captureCampaign, restoreCampaign } from '../src/campaign-save';
import { MISSION_PACING } from '../src/pacing';
import { chooseRefit, createArsenalCampaign, step, type Controls } from '../src/simulation';

const idle: Controls = { drive: 0, turn: 0, neutral: false, port: false, starboard: false, brace: false, pulse: false, torpedo: false, autoFire: false };
const fitted = function () {
	const state = createArsenalCampaign(); installStarter(state, 'rail', 1);
	state.fireControl.automatic = false;
	return state;
};

test('empty screens do not end missions; arrivals are bounded and extraction removes live threats', function () {
	const state = fitted(); const clock = state.campaign?.clock;
	if (!clock) throw new Error('Missing clock');
	state.enemies = [];
	for (let i = 0; i < 600; i++) step(state, idle, 1 / 60);
	expect(state.campaign?.phase).toBe('combat');
	clock.elapsed = 12; step(state, idle, 1 / 60);
	expect(state.enemies).toHaveLength(1);
	for (let i = 2; i <= 4; i++) { clock.elapsed = i * 12; step(state, idle, 1 / 60); }
	expect(state.enemies).toHaveLength(MISSION_PACING[0].activeLimit);
	clock.elapsed = 60 - 1 / 120;
	step(state, idle, 1 / 60);
	expect(state.campaign?.phase).toBe('refit'); expect(state.kills).toBe(0);
	expect(state.enemies).toEqual([]); expect(state.shells).toEqual([]);
	const checkpoint = captureCampaign(state);
	expect(checkpoint?.version).toBe(2);
	const restored = restoreCampaign(checkpoint);
	expect(restored?.campaign?.phase).toBe('refit');
	expect(chooseRefit(state, 'repair')).toBe(true);
	expect(state.campaign?.clock?.elapsed).toBe(0);
	expect(state.campaign?.clock?.salvageEarned).toBe(0);
});

test('sector salvage is finite and banked choices survive refit, launch and retry', function () {
	const state = fitted(); const launch = captureCampaign(state); const clock = state.campaign?.clock;
	if (!clock) throw new Error('Missing clock');
	clock.elapsed = 60 - 1 / 120;
	awardSalvage(state, 100000);
	awardSalvage(state, 100000);
	expect(clock.salvageEarned).toBe(720);
	step(state, idle, 1 / 60);
	expect(state.arsenal?.rewards).toBe(1);
	expect(resolveDraft(state, 'skip')).toBe(true);
	step(state, idle, 1 / 60);
	expect(state.campaign?.phase).toBe('refit');
	const refit = restoreCampaign(captureCampaign(state));
	if (!refit) throw new Error('Missing refit');
	expect(refit.arsenal?.salvage).toBe(540);
	expect(chooseRefit(refit, 'repair')).toBe(true);
	const next = restoreCampaign(captureCampaign(refit)); const nextClock = next?.campaign?.clock;
	if (!next || !nextClock) throw new Error('Missing next launch');
	step(next, idle, 1 / 60);
	expect(next.arsenal?.pending).toBe(0);
	nextClock.elapsed = nextClock.nextDraftAt - 1 / 120;
	step(next, idle, 1 / 60);
	expect(next.arsenal?.pending).toBe(1);
	expect(next.arsenal?.salvage).toBe(260);
	const restored = restoreCampaign(launch);
	expect(restored?.campaign?.clock?.salvageEarned).toBe(0);
	expect(restored?.arsenal?.rewards).toBe(0);
});

test('last-frame drafts resolve before refit and lethal damage wins over extraction', function () {
	for (const lethal of [false, true]) {
		const state = fitted(); const clock = state.campaign?.clock;
		if (!clock) throw new Error('Missing clock');
		clock.elapsed = 60 - 1 / 120;
		if (lethal) state.player.hp = 0;
		else { awardSalvage(state, 180); }
		step(state, idle, 1 / 60);
		if (lethal) expect(state.outcome).toBe('lost');
		else {
			expect(state.campaign?.phase).toBe('combat');
			resolveDraft(state, 'skip'); step(state, idle, 1 / 60);
			expect(state.campaign?.phase).toBe('refit');
		}
	}
});
