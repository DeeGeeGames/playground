import { OrthographicCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { Point, State } from './simulation';

export const viewScale = function (width: number, height: number) { return Math.max(0.6, Math.min(1.25, width / 1100, height / 740)); };

// Three uses (ground X, elevation, ground Y). This basis reproduces the
// existing Canvas projection, including its elevation and 52% ground anchor.
export const alignCamera = function (camera: OrthographicCamera, width: number, height: number, state: State) {
	const scale = viewScale(width, height) * Math.sqrt(3 / 2);
	camera.left = -width / (2 * scale); camera.right = width / (2 * scale);
	camera.top = height * 0.52 / scale; camera.bottom = -height * 0.48 / scale;
	camera.position.set(state.player.x + 1000, 1000, state.player.y + 1000);
	camera.lookAt(state.player.x, 0, state.player.y);
	camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
};

export const toScreen = function (point: Point, camera: OrthographicCamera, width: number, height: number, elevation = 0): Point {
	const at = new Vector3(point.x, elevation, point.y).project(camera);
	return { x: (at.x + 1) * width / 2, y: (1 - at.y) * height / 2 };
};

export const toGround = function (point: Point, camera: OrthographicCamera, width: number, height: number): Point | undefined {
	if (width <= 0 || height <= 0) return undefined;
	const ray = new Raycaster(); ray.setFromCamera(new Vector2(point.x / width * 2 - 1, 1 - point.y / height * 2), camera);
	const at = ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), new Vector3());
	return at ? { x: at.x, y: at.z } : undefined;
};
