import { expect, test } from 'bun:test';
import { enemyVisibility } from '../src/enemy-visibility';
import { canAcquire, contactIntel, sensorRanges } from '../src/sensors';
import { createState } from '../src/simulation';

test('enemy models and markers render to twice the sensor cutoffs without extending gameplay intel', function () {
	for (const integrity of [100, 25, 0]) {
		const state = createState(); state.ark = { x: 1500, y: -300, angle: 1, speed: 0 };
		state.systems.sensors.integrity = integrity;
		const ranges = sensorRanges(state);
		const point = function (range: number) { return { x: state.ark.x, y: state.ark.y + range }; };
		if (integrity > 0) {
			expect(enemyVisibility(state, point(ranges.classification * 2))).toBe('model');
			expect(enemyVisibility(state, point(ranges.classification * 2 + 1))).toBe('marker');
			expect(contactIntel(state, point(ranges.classification * 1.5))).toBe('detected');
		}
		expect(enemyVisibility(state, point(ranges.detection * 2))).toBe('marker');
		expect(enemyVisibility(state, point(ranges.detection * 2 + 1))).toBe('hidden');
		expect(canAcquire(state, point(ranges.detection * 1.5))).toBe(false);
	}
});
