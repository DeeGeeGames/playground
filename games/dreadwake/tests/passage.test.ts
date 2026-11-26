import { expect, test } from 'bun:test';
import { installStarter } from '../src/arsenal';
import { createBridgeWorld } from '../src/bridge-world';
import { createPassage } from '../src/passage';
import { PASSAGE } from '../src/passage-layout';
import { createArsenalCampaign, distance, type Controls } from '../src/simulation';

const idle: Controls = { drive: 0, turn: 0, neutral: false, port: false, starboard: false, brace: false, pulse: false, torpedo: false, autoFire: false };

for (const route of ['direct', 'outer'] as const) {
	test(`a piloted ${route} crossing delivers the tender before the yard can service the cruiser`, async function () {
		const state = createPassage();
		const passage = state.passage;
		if (!passage) throw new Error('Missing crossing at launch');
		const world = await createBridgeWorld(state);
		const orders = new Set<string>();
		try {
			for (let i = 0; i < 120 * 60 && state.outcome === 'playing'; i++) {
				const target = route === 'outer' && !passage.relayOnline ? PASSAGE.relay : PASSAGE.yard;
				const coast = target === PASSAGE.yard && distance(state.player, target) < 280;
				const heading = route === 'direct' && state.enemies.length ? state.player.angle
					: Math.atan2(target.y - state.player.y, target.x - state.player.x);
				world.tick({ ...idle, heading, drive: coast ? 0 : 1, neutral: coast, autoFire: route === 'outer' && i === 0 });
				orders.add(passage.route);
			}
			expect(orders.has(route)).toBe(true);
			expect(state.kills).toBe(route === 'direct' ? 1 : 0);
			expect(passage.relayOnline).toBe(route === 'outer');
			expect(passage.tender).toMatchObject(PASSAGE.yard);
			expect(passage.yardOpen).toBe(true);
			expect(state.outcome).toBe('won');
			expect(state.player.hp).toBe(state.player.maxHp);
			expect(state.wave).toBe(1);
		} finally { await world.dispose(); }
	});
}

test('a missed fork allows recall until the tender gets home, and changing missions removes its old voyage', async function () {
	const state = createPassage();
	const passage = state.passage;
	if (!passage) throw new Error('Missing crossing at launch');
	const world = await createBridgeWorld(state);
	try {
		for (let i = 0; i < 32 * 60; i++) world.tick(idle);
		expect(passage.route).toBe('returning');
		expect(passage.yardOpen).toBe(false);
		Object.assign(state.player, PASSAGE.relay);
		world.tick(idle);
		expect(passage.route).toBe('inbound');
		const tenderBeforeExit = { ...passage.tender };
		const fresh = world.enter(createPassage());
		for (let i = 0; i < 62 * 60; i++) world.tick(idle);
		expect(fresh.outcome).toBe('lost');
		expect(fresh.passage?.route).toBe('returned');
		expect(fresh.passage?.yardOpen).toBe(false);
		expect(passage.tender).toEqual(tenderBeforeExit);
		const campaign = world.enter(createArsenalCampaign());
		installStarter(campaign, 'seeker', 0);
		world.tick(idle);
		expect(campaign.campaign?.clock?.elapsed).toBeCloseTo(1 / 60);
		expect(campaign.outcome).toBe('playing');
	} finally { await world.dispose(); }
});
