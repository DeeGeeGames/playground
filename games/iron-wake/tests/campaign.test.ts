import { describe, expect, test } from 'bun:test';
import { abandonContract, acceptContract, canAcceptContract, createCampaign, getContracts, parseCampaign, settleContract, travelTo, type Campaign } from '../src/campaign';
import type { Contract, MissionKind } from '../src/campaign-types';

const posted = function (campaign: Campaign, kind: MissionKind = 'defend'): Contract {
	const contract = getContracts(campaign).find(function (entry) { return entry.kind === kind; });
	if (!contract) throw new Error(`Missing ${kind} contract`);
	return contract;
};
const roundTrip = function (campaign: Campaign) { return parseCampaign(JSON.stringify(campaign)); };

describe('Iron Wake campaign transactions and recovery', function () {
	test('boards are reproducible, contain each mission type, and advance after travel', function () {
		const campaign = createCampaign(317);
		const contracts = getContracts(campaign);
		expect(contracts).toEqual(getContracts(createCampaign(317)));
		expect(new Set(contracts.map(function (entry) { return entry.kind; }))).toEqual(new Set(['defend', 'demolition', 'assassination', 'clearance']));
		expect(contracts.every(function (entry) { return entry.employer !== entry.opponent && canAcceptContract(campaign, entry); })).toBe(true);
		const otherWorld = getContracts(campaign, 'borealis');
		expect(canAcceptContract(campaign, otherWorld[0] ?? posted(campaign))).toBe(false);
		expect(travelTo(campaign, 'meridian')).toBe(campaign);
		const returned = travelTo(travelTo(campaign, 'borealis'), 'meridian');
		expect(returned.credits).toBe(0);
		expect(returned.day).toBe(3);
		expect(getContracts(returned).map(function (entry) { return entry.seed; })).not.toEqual(contracts.map(function (entry) { return entry.seed; }));
		expect(acceptContract(returned, posted(campaign).id)).toBe(returned);
		expect(roundTrip(returned)).toEqual(returned);
	});

	test('acceptance charges the opponent once, freezes postings, and locks travel until settlement', function () {
		const campaign = createCampaign(41);
		const before = JSON.stringify(campaign);
		const contract = posted(campaign);
		const accepted = acceptContract(campaign, contract.id);
		expect(accepted.active).toEqual(contract);
		expect(accepted.reputation[contract.opponent]).toBe(-contract.hostility);
		expect(accepted.reputation[contract.employer]).toBe(0);
		expect(accepted.credits).toBe(0);
		expect(getContracts(accepted)).toEqual(getContracts(campaign));
		expect(JSON.stringify(campaign)).toBe(before);
		expect(acceptContract(accepted, contract.id)).toBe(accepted);
		expect(acceptContract(accepted, posted(campaign, 'clearance').id)).toBe(accepted);
		expect(travelTo(accepted, 'cinder')).toBe(accepted);
		const restored = roundTrip(accepted);
		expect(restored).toEqual(accepted);
		expect(acceptContract(restored, contract.id)).toBe(restored);
	});

	test('a successful extraction pays and grants favor exactly once, including across reload', function () {
		const campaign = createCampaign(7);
		const contract = posted(campaign, 'demolition');
		const accepted = roundTrip(acceptContract(campaign, contract.id));
		const settled = settleContract(accepted, true);
		expect(settled.active).toBeUndefined();
		expect(settled.reputation[contract.employer]).toBe(contract.favor);
		expect(settled.reputation[contract.opponent]).toBe(-contract.hostility);
		expect(settled.credits).toBe(contract.reward);
		expect(settled.completed).toBe(1);
		expect(settled.failed).toBe(0);
		expect(settled.lastResult).toEqual({ contract, won: true, aborted: false, payout: contract.reward, favor: contract.favor, day: 2 });
		const restored = roundTrip(settled);
		expect(restored).toEqual(settled);
		expect(settleContract(restored, true)).toBe(restored);
		expect(abandonContract(restored)).toBe(restored);
		expect(acceptContract(restored, contract.id)).toBe(restored);
		expect(getContracts(settled).some(function (entry) { return entry.id === contract.id; })).toBe(false);
	});

	test('failure and abandonment preserve the acceptance penalty without paying success rewards', function () {
		for (const abort of [false, true]) {
			const campaign = createCampaign(99);
			const contract = posted(campaign, 'assassination');
			const accepted = acceptContract(campaign, contract.id);
			const failed = abort ? abandonContract(accepted) : settleContract(accepted, false);
			expect(failed.active).toBeUndefined();
			expect(failed.credits).toBe(0);
			expect(failed.reputation).toEqual(accepted.reputation);
			expect(failed.completed).toBe(0);
			expect(failed.failed).toBe(1);
			expect(failed.lastResult?.aborted).toBe(abort);
			expect(failed.lastResult?.payout).toBe(0);
			expect(failed.lastResult?.favor).toBe(0);
			expect(roundTrip(failed)).toEqual(failed);
			expect(travelTo(failed, 'borealis').planetId).toBe('borealis');
		}
	});

	test('reputation changes payout and gates high-tier work without removing recovery contracts', function () {
		const campaign = createCampaign(123);
		const hostile: Campaign = { ...campaign, day: 3, boardRevision: 2, completed: 2, reputation: { freeholds: -100, combine: -100, accord: -100 }, boardReputation: { freeholds: -100, combine: -100, accord: -100 } };
		const friendly: Campaign = { ...hostile, reputation: { freeholds: 100, combine: 100, accord: 100 }, boardReputation: { freeholds: 100, combine: 100, accord: 100 } };
		const offers = getContracts(hostile);
		expect(offers.filter(function (entry) { return canAcceptContract(hostile, entry); })).toHaveLength(2);
		for (const contract of offers.filter(function (entry) { return entry.tier > 1; })) expect(acceptContract(hostile, contract.id)).toBe(hostile);
		expect(getContracts(friendly).every(function (entry) { return canAcceptContract(friendly, entry); })).toBe(true);
		expect(posted(friendly).reward).toBeGreaterThan(posted(hostile).reward);
		const accepted = acceptContract(hostile, posted(hostile).id);
		expect(roundTrip(accepted)).toEqual(accepted);
		expect(accepted.reputation[posted(hostile).opponent]).toBe(-100);
		const alliedAccepted = acceptContract(friendly, posted(friendly).id);
		const alliedSettled = settleContract(alliedAccepted, true);
		expect(alliedSettled.reputation[posted(friendly).employer]).toBe(100);
		expect(alliedSettled.lastResult?.favor).toBe(0);
		expect(roundTrip(alliedSettled)).toEqual(alliedSettled);
	});

	test('corrupt storage cannot restore half-paid acceptance or fabricated contract rewards', function () {
		const campaign = createCampaign(123);
		const accepted = acceptContract(campaign, posted(campaign).id);
		const contract = accepted.active;
		if (!contract) throw new Error('Acceptance failed');
		const malformed: unknown[] = [
			undefined, [], null, { ...campaign, version: 2 }, { ...campaign, credits: -1 }, { ...campaign, completed: 0.5 },
			{ ...campaign, reputation: { freeholds: 0, combine: 0, accord: 101 } },
			{ ...accepted, reputation: campaign.reputation },
			{ ...accepted, active: { ...contract, reward: contract.reward + 100 } },
			{ ...accepted, active: { ...contract, seed: contract.seed + 1 } },
			{ ...accepted, active: { ...contract, planetId: 'cinder' } },
			{ ...accepted, active: { ...contract, opponent: contract.employer } },
			{ ...accepted, active: { ...contract, briefing: '<script>untrusted contract</script>' } },
			{ ...campaign, lastResult: { contract, won: false, aborted: true, payout: 100, favor: 0, day: 2 } },
		];
		for (const value of malformed) {
			const restored = parseCampaign(JSON.stringify(value) ?? null);
			expect(restored.active).toBeUndefined();
			expect(restored.credits).toBe(0);
			expect(restored.reputation).toEqual({ freeholds: 0, combine: 0, accord: 0 });
			expect(restored.day).toBe(1);
		}
		expect(parseCampaign('{broken').active).toBeUndefined();
		expect(parseCampaign(null).planetId).toBe('meridian');
	});
});
