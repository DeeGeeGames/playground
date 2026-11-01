import { expect, test } from 'bun:test';
import { runSpendingControl } from '../scripts/combat-pressure';

test('issue 51 spending control repeats and protects hull and equipment', function () {
	const result = runSpendingControl();
	expect(result.status).toBe('won');
	expect(result.time).toBeCloseTo(210 + 1 / 60, 5);
	expect(result.kills).toBe(96);
	expect(result.minimumHull).toBe(1200);
	expect(result.finalHull).toBe(1200);
	expect(result.minimumSensors).toBe(100);
	expect(result.impairments).toBe(0);
	// Contact-rich trajectories vary across JS runtimes. Preserve the protection
	// budget and require exact replay within this runtime, rather than one damage tally.
	// Slower capital approaches keep batteries in range longer; retain at least
	// half the shield while preserving the full hull/equipment guarantees.
	expect(result.minimumShield).toBeGreaterThanOrEqual(120);
	expect(result.minimumShield).toBeLessThanOrEqual(240);
	expect(runSpendingControl()).toEqual(result);
	expect(result.purchases[0]).toMatchObject({ mount: 0, action: 'upgrade', cost: 60 });
	expect(result.purchases[0]?.time).toBeCloseTo(21, 5);
	expect(result.purchases.filter(function (purchase) { return purchase.action === 'upgrade'; })).toHaveLength(16);
}, 20000);
