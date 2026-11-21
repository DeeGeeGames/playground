import { expect, test } from 'bun:test';
import { installStarter, resolveDraft, SALVAGE_RECOVERY_RANGE } from '../src/arsenal';
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
});

test('destroyed ships leave salvage for the helm to recover once before transit', function () {
	const state = fitted(); const launch = captureCampaign(state); const clock = state.campaign?.clock;
	const enemy = state.enemies[0];
	if (!clock || !enemy) throw new Error('Missing mission fixture');
	enemy.x = SALVAGE_RECOVERY_RANGE + 1; enemy.y = 0; enemy.hp = 0;
	step(state, idle, 1 / 60);
	expect(state.salvageCaches).toEqual([{ x: enemy.x, y: enemy.y, amount: 240 }]);
	expect(state.arsenal?.salvage).toBe(0);
	expect(state.arsenal?.pending).toBe(0);
	state.player.x = 1;
	step(state, idle, 1 / 60);
	expect(state.salvageCaches).toHaveLength(0);
	expect(state.arsenal?.salvage).toBe(60);
	expect(state.arsenal?.pending).toBe(1);
	expect(resolveDraft(state, 'skip')).toBe(true);
	state.salvageCaches.push({ x: 800, y: 800, amount: 240 });
	clock.elapsed = 60 - 1 / 120;
	step(state, idle, 1 / 60);
	expect(state.campaign?.phase).toBe('refit');
	expect(state.salvageCaches).toHaveLength(0);
	expect(restoreCampaign(captureCampaign(state))?.arsenal?.salvage).toBe(60);
	const retry = restoreCampaign(launch);
	expect(retry?.salvageCaches).toHaveLength(0);
	expect(retry?.arsenal?.salvage).toBe(0);
	expect(retry?.arsenal?.rewards).toBe(0);
});

test('a legacy checkpoint with a funded choice restores and opens the choice in combat', function () {
	const state = fitted();
	const launch = captureCampaign(state);
	if (!launch?.arsenal) throw new Error('Missing launch checkpoint');
	const restored = restoreCampaign({ ...launch, wave: 2, arsenal: { ...launch.arsenal, salvage: 540, rewards: 1 } });
	if (!restored) throw new Error('Missing restored checkpoint');
	step(restored, idle, 1 / 60);
	expect(restored.arsenal?.pending).toBe(1);
	expect(restored.arsenal?.salvage).toBe(260);
});

test('last-frame drafts resolve before refit and lethal damage wins over extraction', function () {
	for (const lethal of [false, true]) {
		const state = fitted(); const clock = state.campaign?.clock;
		if (!clock) throw new Error('Missing clock');
		clock.elapsed = 60 - 1 / 120;
		if (lethal) state.player.hp = 0;
		else { state.salvageCaches.push({ x: state.player.x, y: state.player.y, amount: 240 }); }
		step(state, idle, 1 / 60);
		if (lethal) expect(state.outcome).toBe('lost');
		else {
			expect(state.campaign?.phase).toBe('combat');
			resolveDraft(state, 'skip'); step(state, idle, 1 / 60);
			expect(state.campaign?.phase).toBe('refit');
		}
	}
});
