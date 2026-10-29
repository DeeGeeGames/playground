import type { Point, Ship } from './simulation';

export interface Camera { center: Point; scale: number; width: number; height: number }
export const project = function (point: Point, elevation = 0): Point {
	return { x: (point.x - point.y) * Math.sqrt(3) / 2, y: (point.x + point.y) / 2 - elevation };
};
export const cameraFor = function (width: number, height: number, center: Point): Camera {
	return { center: project(center), scale: Math.max(0.34, Math.min(1.4, width / 1200, (height - 130) / 700)), width, height };
};
export const worldToScreen = function (point: Point, camera: Camera, elevation = 0): Point {
	const at = project(point, elevation);
	return { x: (at.x - camera.center.x) * camera.scale + camera.width / 2,
		y: (at.y - camera.center.y) * camera.scale + camera.height * 0.45 };
};

// Picking uses the same projected hull center and scale as the renderer.
export const pickShip = function <T extends Ship>(point: Point, camera: Camera, ships: readonly T[]): T | undefined {
	return ships.map(function (ship) {
		const at = worldToScreen(ship, camera, 20);
		return { ship, distance: Math.hypot(point.x - at.x, point.y - at.y) };
	}).filter(function (candidate) { return candidate.distance <= Math.max(22, candidate.ship.length * camera.scale * 0.55); })
		.sort(function (a, b) { return a.distance - b.distance || a.ship.id - b.ship.id; })[0]?.ship;
};
