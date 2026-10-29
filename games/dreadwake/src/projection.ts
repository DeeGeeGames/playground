import type { Point } from './simulation';

export interface Camera { center: Point; scale: number; width: number; height: number }
export const project = function (point: Point, elevation = 0): Point {
	return { x: (point.x - point.y) * Math.sqrt(3) / 2, y: (point.x + point.y) / 2 - elevation };
};
export const cameraFor = function (width: number, height: number, center: Point): Camera {
	return { center: project(center), scale: Math.max(0.25, Math.min(1.4, width / 1300, (height - 130) / 740)), width, height };
};
export const worldToScreen = function (point: Point, camera: Camera, elevation = 0): Point {
	const at = project(point, elevation);
	return { x: (at.x - camera.center.x) * camera.scale + camera.width / 2,
		y: (at.y - camera.center.y) * camera.scale + camera.height * 0.45 };
};
