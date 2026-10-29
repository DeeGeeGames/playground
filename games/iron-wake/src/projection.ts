import type { Point, State } from './simulation';

const ISO_X = Math.sqrt(3) / 2;
export interface Camera extends Point { scale: number; width: number; height: number }
export const project = function (point: Point, elevation = 0): Point {
	return { x: (point.x - point.y) * ISO_X, y: (point.x + point.y) * 0.5 - elevation };
};
export const cameraFor = function (width: number, height: number, state: State): Camera {
	return { ...project(state.player), scale: Math.max(0.6, Math.min(1.25, width / 1100, height / 740)), width, height };
};
export const worldToScreen = function (point: Point, camera: Camera, elevation = 0): Point {
	const at = project(point, elevation);
	return { x: (at.x - camera.x) * camera.scale + camera.width / 2, y: (at.y - camera.y) * camera.scale + camera.height * 0.52 };
};
export const screenToWorld = function (point: Point, camera: Camera, elevation = 0): Point {
	const x = ((point.x - camera.width / 2) / camera.scale + camera.x) / ISO_X;
	const y = ((point.y - camera.height * 0.52) / camera.scale + camera.y + elevation) * 2;
	return { x: (x + y) / 2, y: (y - x) / 2 };
};
