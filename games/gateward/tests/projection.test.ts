import { expect, test } from 'bun:test';
import { toWorld, viewFor } from '../src/render';

test('mount and target picking stays aligned across desktop, mobile and landscape views', function () {
	for (const [width, height] of [[1440, 1000], [390, 440], [320, 440], [844, 620]]) {
		if (width === undefined || height === undefined) throw new Error('Missing viewport dimension');
		const view = viewFor(width, height);
		for (const point of [{ x: -96, y: -43 }, { x: 96, y: 43 }, { x: -300, y: 250 }]) {
			const screen = { x: view.cx + point.x * view.scale, y: view.cy + point.y * view.scale };
			const result = toWorld(screen, view); expect(result.x).toBeCloseTo(point.x); expect(result.y).toBeCloseTo(point.y);
		}
	}
});
