import { expect, test } from 'bun:test';
import { createState } from '../src/simulation';
import { cameraFor, screenToWorld, worldToScreen } from '../src/projection';

test('isometric picking round-trips at multiple viewports and camera positions', function () {
	for (const [width, height] of [[1440, 900], [390, 844], [844, 390]]) {
		if (!width || !height) throw new Error('Invalid test viewport');
		const state = createState();
		for (const location of [{ x: 900, y: 780 }, { x: 40, y: 1100 }]) {
			state.player.x = location.x; state.player.y = location.y;
			const camera = cameraFor(width, height, state);
			for (const point of [{ x: 0, y: 0 }, { x: 1800, y: 1200 }, location]) {
				for (const z of [0, 45]) {
					const result = screenToWorld(worldToScreen(point, camera, z), camera, z);
					expect(result.x).toBeCloseTo(point.x, 8); expect(result.y).toBeCloseTo(point.y, 8);
				}
			}
		}
	}
});
