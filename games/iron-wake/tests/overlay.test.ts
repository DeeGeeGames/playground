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

// The projected southwest contact used to disappear beneath the frame instruments.
test('offscreen threat markers stop before actual cockpit rectangles, including touch controls', function () {
	const cockpit = [{ left: 28, right: 260, top: 644, bottom: 875 }, { left: 1032, right: 1412, top: 700, bottom: 875 }];
	const southwest = edgeMarker({ x: -449, y: 1162 }, 1440, 900, cockpit);
	if (!southwest) throw new Error('Missing southwest threat');
	expect(southwest.point.x >= 278 || southwest.point.y <= 612).toBe(true);
	const touch = edgeMarker({ x: -500, y: 1600 }, 390, 844, [{ left: 14, right: 158, top: 490, bottom: 828 }]);
	if (!touch) throw new Error('Missing touch threat');
	expect(touch.point.x >= 176 || touch.point.y <= 458).toBe(true);
});

test('a narrow touch cockpit cannot hide a threat when it overlaps the usual ray origin', function () {
	const panels = [{ left: 14, right: 144, top: 250, bottom: 448 }];
	for (const point of [{ x: -500, y: 1600 }, { x: 160, y: 568 * 0.52 }]) {
		const marker = edgeMarker(point, 320, 568, panels);
		if (!marker) throw new Error('Missing threat beside touch cockpit');
		expect(Number.isFinite(marker.point.x) && Number.isFinite(marker.point.y)).toBe(true);
		expect(marker.point.x >= 162 || marker.point.y <= 218).toBe(true);
	}
});
