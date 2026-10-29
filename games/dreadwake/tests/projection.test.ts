import { expect, test } from 'bun:test';
import { cameraFor, project, worldToScreen } from '../src/projection';

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
