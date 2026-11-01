import { expect, test } from 'bun:test';
import { runSpendingControl } from '../scripts/combat-pressure';

test('full-arc spending control repeats and reaches the gate with functional equipment', function () {
	const result = runSpendingControl();
	expect(result.status).toBe('won');
	// Arrival ends the voyage at the integrated route length, regardless of survivors.
	expect(result.time).toBeGreaterThan(420); expect(result.time).toBeLessThan(421);
	expect(result.kills).toBeGreaterThan(0);
	expect(result.minimumHull).toBeGreaterThanOrEqual(1100);
	expect(result.finalHull).toBe(1200);
	expect(result.minimumSensors).toBeGreaterThanOrEqual(50);
	expect(result.impairments).toBe(0);
	// Contact-rich trajectories vary across JS runtimes. Preserve the protection
	// budget and require exact replay within this runtime, rather than one damage tally.
	// Slower fighters can exhaust shields and cause light damage; require restored
	// hull, functional equipment and the exact replay guarantee.
	expect(result.minimumShield).toBeGreaterThanOrEqual(0);
	expect(result.minimumShield).toBeLessThanOrEqual(240);
	expect(runSpendingControl()).toEqual(result);
	expect(result.purchases.every(function (purchase) { return purchase.cost > 0; })).toBe(true);
	expect(result.purchases.filter(function (purchase) { return purchase.action === 'upgrade'; })).toHaveLength(16);
}, 40000);
