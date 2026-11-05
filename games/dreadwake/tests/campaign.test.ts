import { expect, test } from 'bun:test';
import { CAMPAIGN_MISSIONS, MAX_HULL, chooseRefit, createCampaignState, step, type Controls, type State } from '../src/simulation';

const idle: Controls = { drive: 0, turn: 0, neutral: false, port: false, starboard: false, brace: false, pulse: false, torpedo: false, autoFire: false };
const clearMission = function (state: State) {
	for (const enemy of state.enemies) enemy.hp = 0;
	for (let frame = 0; frame < 365; frame++) step(state, idle, 1 / 60);
};

test('refit freezes combat, retains hull damage, and accepts exactly one upgrade', function () {
	const state = createCampaignState();
	state.player.hp = MAX_HULL / 2;
	expect(chooseRefit(state, 'repair')).toBe(false);
	clearMission(state);
	expect(state.campaign?.phase).toBe('refit');
	expect(state.player.hp).toBe(MAX_HULL / 2);
	const time = state.time;
	step(state, { ...idle, port: true, drive: 1 }, 1);
	expect(state.time).toBe(time);
	expect(state.stats.salvos).toBe(0);
	expect(chooseRefit(state, 'rails')).toBe(true);
	expect(state.player.hp).toBe(MAX_HULL / 2);
	expect(state.campaign?.upgrades.rails).toBe(1);
	expect(chooseRefit(state, 'rails')).toBe(false);
	expect(state.wave).toBe(2);
});

test('repairs cap at maximum hull and final victory has no extra refit', function () {
	const state = createCampaignState();
	for (let mission = 1; mission <= CAMPAIGN_MISSIONS.length; mission++) {
		state.player.hp = MAX_HULL - 10;
		clearMission(state);
		if (mission < CAMPAIGN_MISSIONS.length) {
			expect(state.outcome).toBe('playing');
			expect(chooseRefit(state, 'repair')).toBe(true);
			expect(state.player.hp).toBe(MAX_HULL);
		} else {
			expect(state.outcome).toBe('won');
			expect(chooseRefit(state, 'repair')).toBe(false);
		}
	}
	expect(state.campaign?.completedMissions).toBe(CAMPAIGN_MISSIONS.length);
	expect(state.kills).toBe(CAMPAIGN_MISSIONS.reduce(function (total, mission) { return total + mission.enemies.length; }, 0));
});
