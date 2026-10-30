import { expect, test } from 'bun:test';
import { edgeMarker } from '../src/overlay';

test('edge markers remain clear of the HUD across desktop, phone and short landscape layouts', function () {
	for (const [width = 1, height = 1] of [[1440, 900], [390, 844], [844, 390], [480, 260]]) {
		for (const point of [{ x: -1000, y: -1000 }, { x: 3000, y: -1000 }, { x: -1000, y: 3000 }, { x: 3000, y: 3000 }, { x: width / 2, y: -1000 }, { x: width / 2, y: 3000 }]) {
			const marker = edgeMarker(point, width, height); if (!marker) throw new Error('Missing offscreen indicator');
			expect(marker.point.x).toBeGreaterThanOrEqual(45); expect(marker.point.x).toBeLessThanOrEqual(width - 45);
			expect(marker.point.y).toBeGreaterThanOrEqual(80); expect(marker.point.y).toBeLessThanOrEqual(height - 130);
			expect(Number.isFinite(marker.angle)).toBe(true);
		}
		expect(edgeMarker({ x: width / 2, y: 100 }, width, height)).toBeUndefined();
	}
});
