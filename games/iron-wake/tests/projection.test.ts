import { expect, test } from 'bun:test';
import { OrthographicCamera } from 'three';
import { createState } from '../src/simulation';
import { alignCamera, toGround, toScreen } from '../src/projection-3d';

test('isometric picking round-trips at multiple viewports and camera positions', function () {
	for (const [width, height] of [[1440, 900], [390, 844], [844, 390]]) {
		if (!width || !height) throw new Error('Invalid test viewport');
		const state = createState();
		for (const location of [{ x: 900, y: 780 }, { x: 40, y: 1100 }]) {
			state.player.x = location.x; state.player.y = location.y;
			const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 6000); alignCamera(camera, width, height, state);
			for (const point of [{ x: 0, y: 0 }, { x: 1800, y: 1200 }, location]) {
				const result = toGround(toScreen(point, camera, width, height), camera, width, height);
				if (!result) throw new Error('Missing ground intersection');
				expect(result.x).toBeCloseTo(point.x, 8); expect(result.y).toBeCloseTo(point.y, 8);
			}
		}
	}
});

test('picking follows the active shaken projection and ignores empty viewports', function () {
	const state = createState(); const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 6000);
	alignCamera(camera, 1440, 900, state); camera.setViewOffset(1440, 900, -7, 4, 1440, 900);
	const point = { x: 980, y: 400 }; const screen = toScreen(point, camera, 1440, 900);
	const actual = toGround(screen, camera, 1440, 900); if (!actual) throw new Error('Missing ground intersection');
	expect(actual.x).toBeCloseTo(point.x, 8); expect(actual.y).toBeCloseTo(point.y, 8);
	expect(toGround(screen, camera, 0, 900)).toBeUndefined(); expect(toGround(screen, camera, 1440, 0)).toBeUndefined();
});
