import { expect, test } from 'bun:test';
import { applyDraft, awardSalvage, createArsenal, draftCost, installStarter, prepareDraft, rerollDraft, resolveDraft } from '../src/arsenal';
import { captureCampaign, restoreCampaign } from '../src/campaign-save';
import { createArsenalCampaign, createCampaignState, step, type Controls } from '../src/simulation';

const idle: Controls = { drive: 0, turn: 0, neutral: false, port: false, starboard: false, brace: false, pulse: false, torpedo: false, autoFire: false };
const fitted = function () {
	const state = createArsenalCampaign(); state.arsenal = createArsenal(417);
	expect(installStarter(state, 'rail', 1)).toBe(true);
	return state;
};

test('empty ship cannot fight and exactly one explicitly placed starter is installed', function () {
	const state = createArsenalCampaign();
	step(state, { ...idle, port: true, torpedo: true, beam: true, missile: true, drive: 1 }, 1);
	expect(state.time).toBe(0); expect(state.shells).toHaveLength(0);
	expect(installStarter(state, 'spark', 12)).toBe(false);
	expect(installStarter(state, 'spark', 6)).toBe(true);
	expect(installStarter(state, 'seeker', 2)).toBe(false);
	expect(state.arsenal?.mounts.filter(Boolean)).toHaveLength(1);
	expect(state.arsenal?.mounts[6]?.weapon).toBe('spark');
});

test('damage reward overflow queues frozen drafts and invalid choices cannot consume them', function () {
	const state = fitted(); const arsenal = state.arsenal; if (!arsenal) throw new Error('Missing arsenal');
	state.player.vx = 42;
	state.shells.push({ x: 0, y: 0, vx: 10, vy: 0, life: 4, hostile: true, damage: 20 });
	awardSalvage(state, draftCost(0) + draftCost(1) + 17); prepareDraft(state);
	expect(arsenal.pending).toBe(2); expect(arsenal.salvage).toBe(17);
	const before = structuredClone(state);
	step(state, { ...idle, autoFire: true, drive: 1 }, 1 / 60);
	expect(state.player).toEqual(before.player); expect(state.shells).toEqual(before.shells); expect(state.time).toBe(before.time);
	expect(applyDraft(state, -1)).toBe(false); expect(applyDraft(state, 0, 99)).toBe(false);
	expect(arsenal.pending).toBe(2);
	expect(resolveDraft(state, 'skip')).toBe(true); expect(arsenal.pending).toBe(1);
	state.player.hp = 1390;
	expect(resolveDraft(state, 'repair')).toBe(true); expect(state.player.hp).toBe(1400);
	expect(resolveDraft(state, 'repair')).toBe(false); expect(arsenal.pending).toBe(0);
	expect(arsenal.rewards).toBe(2); expect(arsenal.salvage).toBe(17);
});

test('reroll preserves the invested upgrade and future offers are deterministic after retry', function () {
	const state = fitted(); const snapshot = captureCampaign(state);
	expect(snapshot).toBeDefined(); const retry = restoreCampaign(snapshot);
	if (!retry) throw new Error('Missing retry');
	for (const run of [state, retry]) { awardSalvage(run, 180); prepareDraft(run); }
	expect(state.arsenal?.offers).toEqual(retry.arsenal?.offers);
	const arsenal = state.arsenal; if (!arsenal) throw new Error('Missing arsenal');
	const upgrade = arsenal.offers.find(function (offer) { return offer.kind === 'upgrade'; });
	if (!upgrade) throw new Error('Missing guaranteed upgrade');
	const installs = arsenal.offers.filter(function (offer) { return offer.kind === 'install'; });
	expect(rerollDraft(state)).toBe(true);
	expect(arsenal.offers).toContainEqual(upgrade);
	expect(arsenal.offers.filter(function (offer) { return offer.kind === 'install'; })).not.toEqual(installs);
	expect(rerollDraft(state)).toBe(false); expect(arsenal.pending).toBe(1); expect(arsenal.rewards).toBe(1);
	const at = arsenal.offers.findIndex(function (offer) { return offer.kind === 'upgrade'; });
	expect(applyDraft(state, at)).toBe(true); expect(arsenal.mounts[1]?.rank).toBe(2);
	expect(applyDraft(state, at)).toBe(false);
});

test('installation requires a socket and replaces only that socket at rank I', function () {
	const state = fitted(); const arsenal = state.arsenal; if (!arsenal) throw new Error('Missing arsenal');
	awardSalvage(state, 180); prepareDraft(state);
	const at = arsenal.offers.findIndex(function (offer) { return offer.kind === 'install'; });
	const offer = arsenal.offers[at]; if (!offer) throw new Error('Missing install');
	expect(applyDraft(state, at)).toBe(false); expect(arsenal.pending).toBe(1);
	expect(applyDraft(state, at, 8)).toBe(true);
	expect(arsenal.mounts[1]?.weapon).toBe('rail'); expect(arsenal.mounts[8]?.weapon).toBe(offer.weapon);
	expect(arsenal.mounts[8]?.rank).toBe(1);
});

test('checkpoint retry rolls back draft investments, salvage and RNG atomically', function () {
	const state = fitted(); const launch = captureCampaign(state);
	awardSalvage(state, 180); prepareDraft(state);
	expect(captureCampaign(state)).toBeUndefined();
	const at = state.arsenal?.offers.findIndex(function (offer) { return offer.kind === 'upgrade'; }) ?? -1;
	expect(applyDraft(state, at)).toBe(true); expect(state.arsenal?.mounts[1]?.rank).toBe(2);
	const restored = restoreCampaign(launch);
	expect(restored?.arsenal?.mounts[1]?.rank).toBe(1);
	expect(restored?.arsenal?.rewards).toBe(0); expect(restored?.arsenal?.salvage).toBe(0);
	expect(restored?.arsenal?.seed).toBe(417);
	expect(restored?.enemies.map(function (enemy) { return { x: enemy.x, y: enemy.y, hp: enemy.hp }; }))
		.toEqual(createArsenalCampaign().enemies.map(function (enemy) { return { x: enemy.x, y: enemy.y, hp: enemy.hp }; }));
});

test('legacy saves migrate without losing route, hull, statistics or refit investments', function () {
	const legacy = captureCampaign(createCampaignState());
	const restored = restoreCampaign({ ...legacy, wave: 3, kills: 5, hull: 551, rails: 1, capacitor: 1, automatic: false });
	expect(restored?.wave).toBe(3); expect(restored?.player.hp).toBe(551);
	expect(restored?.campaign?.upgrades).toEqual({ rails: 1, capacitor: 1 });
	expect(restored?.fireControl.automatic).toBe(false);
	expect(restored?.arsenal?.mounts.filter(Boolean)).toHaveLength(6);
	expect(restored?.arsenal?.legacy).toBe(true);
	const roundtrip = restored && captureCampaign(restored);
	expect(roundtrip && restoreCampaign(roundtrip)?.arsenal?.mounts.filter(Boolean)).toHaveLength(6);
});

test('untrusted loadouts cannot inject unknown weapons, impossible ranks or reward progress', function () {
	const base = captureCampaign(fitted()); if (!base?.arsenal) throw new Error('Missing snapshot');
	for (const arsenal of [
		{ ...base.arsenal, mounts: [] }, { ...base.arsenal, seed: Infinity }, { ...base.arsenal, rewards: 15 },
		{ ...base.arsenal, salvage: 180 }, { ...base.arsenal, mounts: base.arsenal.mounts.map(function () { return { weapon: 'rail', rank: 3 }; }) },
		{ ...base.arsenal, mounts: base.arsenal.mounts.map(function (mount) { return mount ? { weapon: 'unknown', rank: 1 } : null; }) },
		{ ...base.arsenal, mounts: base.arsenal.mounts.map(function (mount) { return mount ? { weapon: 'rail', rank: 4 } : null; }) },
	]) expect(restoreCampaign({ ...base, arsenal })).toBeUndefined();
});
