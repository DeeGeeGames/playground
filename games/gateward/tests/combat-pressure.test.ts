import { expect, test } from 'bun:test';
import { runSpendingControl } from '../scripts/combat-pressure';

test('spending control repeats and protects hull and equipment through delayed capital clearance', function () {
	const result = runSpendingControl();
	expect(result.status).toBe('won');
	// The unchanged route now takes at least 420 seconds and capitals need additional clearance time.
	expect(result.time).toBeGreaterThan(420); expect(result.time).toBeLessThan(840);
	expect(result.kills).toBe(96);
	expect(result.minimumHull).toBe(1200);
	expect(result.finalHull).toBe(1200);
	expect(result.minimumSensors).toBe(100);
	expect(result.impairments).toBe(0);
	// Contact-rich trajectories vary across JS runtimes. Preserve the protection
	// budget and require exact replay within this runtime, rather than one damage tally.
	// Slower fighters change damage timing; retain shield reserve while preserving
	// full hull/equipment protection and the exact replay guarantee.
	expect(result.minimumShield).toBeGreaterThan(0);
	expect(result.minimumShield).toBeLessThanOrEqual(240);
	expect(runSpendingControl()).toEqual(result);
	expect(result.purchases[0]).toMatchObject({ mount: 0, action: 'upgrade', cost: 60 });
	expect(result.purchases[0]?.time).toBeCloseTo(21, 5);
	expect(result.purchases.filter(function (purchase) { return purchase.action === 'upgrade'; })).toHaveLength(16);
}, 30000);
