import { expect, test } from 'bun:test';
import { createState } from '../src/simulation';
import { cameraFor, pickShip, project, worldToScreen, zoomForWheel } from '../src/projection';

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

test('wheel zoom supports both directions and stops at readable limits', function () {
	const zoom = zoomForWheel(1, { deltaY: -120, deltaMode: 0 }, 900);
	expect(zoom).toBeGreaterThan(1);
	expect(zoomForWheel(zoom, { deltaY: 120, deltaMode: 0 }, 900)).toBeCloseTo(1);
	expect(zoomForWheel(1, { deltaY: 0, deltaMode: 0 }, 900)).toBe(1);
	expect(zoomForWheel(1, { deltaY: -100000, deltaMode: 0 }, 900)).toBe(2.5);
	expect(zoomForWheel(1, { deltaY: 100000, deltaMode: 0 }, 900)).toBe(0.5);
});

test('wheel zoom normalizes pixel, line and page scrolling', function () {
	const pixels = zoomForWheel(1, { deltaY: -80, deltaMode: 0 }, 800);
	expect(zoomForWheel(1, { deltaY: -5, deltaMode: 1 }, 800)).toBeCloseTo(pixels);
	expect(zoomForWheel(1, { deltaY: -0.1, deltaMode: 2 }, 800)).toBeCloseTo(pixels);
});

test('zoom scales the view while keeping the cruiser centered', function () {
	const center = { x: 1600, y: -500 };
	const base = cameraFor(1280, 800, center);
	for (const zoom of [0.5, 1, 2.5]) {
		const camera = cameraFor(1280, 800, center, zoom);
		expect(camera.scale).toBeCloseTo(base.scale * zoom);
		expect(worldToScreen(center, camera)).toEqual({ x: 640, y: 360 });
	}
});

test('target picking follows projected ships at each zoom and viewport', function () {
	const ships = createState().enemies;
	const ship = ships[0]; if (!ship) throw new Error('Missing frigate');
	for (const [width, height] of [[390, 844], [1440, 900], [844, 390]]) {
		if (!width || !height) throw new Error('Missing viewport dimension');
		for (const zoom of [0.5, 1, 2.5]) {
			const camera = cameraFor(width, height, { x: 200, y: -500 }, zoom);
			const at = worldToScreen(ship, camera, 20);
			expect(pickShip(at, camera, ships)?.id).toBe(ship.id);
			expect(pickShip({ x: at.x + 500, y: at.y + 500 }, camera, ships)).toBeUndefined();
			expect(pickShip(at, camera, [])).toBeUndefined();
		}
	}
});
