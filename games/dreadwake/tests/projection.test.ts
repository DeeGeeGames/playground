import { expect, test } from 'bun:test';
import { createState } from '../src/simulation';
import { cameraFor, pickShip, project, worldToScreen } from '../src/projection';

test('world axes project to symmetric isometric diagonals', function () {
	const x = project({ x: 100, y: 0 }); const y = project({ x: 0, y: 100 });
	expect(x.x).toBeCloseTo(-y.x); expect(x.y).toBe(y.y); expect(x.y).toBe(50);
	expect(project({ x: 0, y: 0 }, 40).y).toBe(-40);
});
test('camera follows the ship and reserves space for helm controls', function () {
	const center = { x: 1600, y: -500 }; const camera = cameraFor(1280, 800, center);
	expect(worldToScreen(center, camera)).toEqual({ x: 640, y: 360 });
	expect(cameraFor(390, 844, center).scale).toBeLessThan(camera.scale);
});

test('target picking follows projected ships at portrait and desktop sizes', function () {
	const ships = createState().enemies;
	const ship = ships[0]; if (!ship) throw new Error('Missing frigate');
	for (const [width, height] of [[390, 844], [1440, 900], [844, 390]]) {
		if (!width || !height) throw new Error('Missing viewport dimension');
		const camera = cameraFor(width, height, { x: 200, y: -500 });
		const at = worldToScreen(ship, camera, 20);
		expect(pickShip(at, camera, ships)?.id).toBe(ship.id);
		expect(pickShip({ x: at.x + 500, y: at.y + 500 }, camera, ships)).toBeUndefined();
		expect(pickShip(at, camera, [])).toBeUndefined();
	}
});
