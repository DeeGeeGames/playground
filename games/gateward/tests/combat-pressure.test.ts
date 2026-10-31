import { expect, test } from 'bun:test';
import { runSpendingControl } from '../scripts/combat-pressure';

test('issue 51 spending control records the impact-location combat baseline', function () {
	const result = runSpendingControl();
	expect(result.status).toBe('won');
	expect(result.time).toBeCloseTo(210 + 1 / 60, 5);
	expect(result.kills).toBe(86);
	expect(result.minimumHull).toBe(1200);
	expect(result.finalHull).toBe(1200);
	expect(result.minimumSensors).toBe(100);
	expect(result.impairments).toBe(0);
	// Shields do take damage; a hull-only report would conceal that pressure.
	expect(result.minimumShield).toBeCloseTo(173, 5);
	expect(result.purchases[0]).toMatchObject({ mount: 0, action: 'upgrade', cost: 60 });
	expect(result.purchases[0]?.time).toBeCloseTo(21, 5);
	expect(result.purchases.filter(function (purchase) { return purchase.action === 'upgrade'; })).toHaveLength(13);
});
