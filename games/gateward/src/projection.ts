import { OrthographicCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { distance, type Enemy, type Mount, type Point } from './simulation';

export const DECK_HEIGHT = 22;
export const TURRET_HEIGHT = 40;
export const FLIGHT_HEIGHT = 130;

export interface View {
	readonly width: number;
	readonly height: number;
	readonly scale: number;
	readonly cx: number;
	readonly cy: number;
	readonly camera: OrthographicCamera;
}

const dimension = function (value: number): number { return Number.isFinite(value) && value > 0 ? value : 0; };
const finitePoint = function (point: Point): boolean { return Number.isFinite(point.x) && Number.isFinite(point.y); };
const usable = function (view: View): boolean { return view.width > 0 && view.height > 0; };
const baseScale = function (width: number, height: number): number {
	return width < 650 ? Math.min(width / 890, height / 680) : Math.min(width / 1380, height / 840);
};

const fitCamera = function (camera: OrthographicCamera, width: number, height: number): View {
	const w = dimension(width);
	const h = dimension(height);
	const scale = baseScale(w, h);
	const pixelsPerUnit = (scale || 1) * Math.sqrt(1.5);
	const frustumWidth = (w || 1) / pixelsPerUnit;
	const frustumHeight = (h || 1) / pixelsPerUnit;
	camera.left = -frustumWidth / 2;
	camera.right = frustumWidth / 2;
	camera.top = frustumHeight / 2;
	camera.bottom = -frustumHeight / 2;
	// Keep the original tactical center slightly below the canvas midpoint.
	camera.setViewOffset(w || 1, h || 1, 0, -h * 0.02, w || 1, h || 1);
	camera.updateProjectionMatrix();
	camera.updateMatrixWorld(true);
	return { width: w, height: h, get scale() { return scale * camera.zoom; }, cx: w / 2, cy: h * 0.52, camera };
};

export const viewFor = function (width: number, height: number): View {
	const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 12000);
	camera.position.set(1000, 1000, 1000);
	camera.lookAt(0, 0, 0);
	return fitCamera(camera, width, height);
};

// Resizing changes only the frustum. OrbitControls owns camera orientation and zoom.
export const resizeView = function (view: View, width: number, height: number): View {
	return fitCamera(view.camera, width, height);
};

// Default-camera reference coordinates for static artwork and legacy comparisons.
// Active screen placement must use toScreen(), which follows the live camera.
export const project = function (point: Point, elevation = 0): Point {
	return { x: (point.x - point.y) * Math.sqrt(3) / 2, y: (point.x + point.y) / 2 - elevation };
};

export const toScreen = function (point: Point, view: View, elevation = 0): Point {
	if (!usable(view)) return { x: view.cx, y: view.cy };
	if (!finitePoint(point) || !Number.isFinite(elevation)) return { x: Infinity, y: Infinity };
	view.camera.updateMatrixWorld(true);
	const at = new Vector3(point.x, elevation, point.y).project(view.camera);
	return { x: (at.x + 1) / 2 * view.width, y: (1 - at.y) / 2 * view.height };
};

export const toWorld = function (point: Point, view: View, elevation = 0): Point | undefined {
	if (!usable(view) || !finitePoint(point) || !Number.isFinite(elevation)) return undefined;
	view.camera.updateMatrixWorld(true);
	const raycaster = new Raycaster();
	raycaster.setFromCamera(new Vector2(point.x / view.width * 2 - 1, 1 - point.y / view.height * 2), view.camera);
	if (Math.abs(raycaster.ray.direction.y) < 0.000001) return undefined;
	const at = raycaster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -elevation), new Vector3());
	return at && Number.isFinite(at.x) && Number.isFinite(at.z) ? { x: at.x, y: at.z } : undefined;
};

export const mountHeight = function (mount: Mount): number { return mount.weapon ? TURRET_HEIGHT : DECK_HEIGHT; };
const cameraDistance = function (point: Point, view: View, elevation: number): number {
	return view.camera.position.distanceToSquared(new Vector3(point.x, elevation, point.y));
};
const nearestScreenCenter = function (a: { d: number; cameraDistance: number }, b: { d: number; cameraDistance: number }): number {
	const separation = a.d - b.d;
	return Math.abs(separation) > 0.000001 ? separation : a.cameraDistance - b.cameraDistance;
};

export const pickMount = function (point: Point, view: View, mounts: readonly Mount[]): number {
	if (!usable(view) || !finitePoint(point)) return -1;
	const candidates = mounts.map(function (mount, index) {
		const height = mountHeight(mount);
		return { index, d: distance(point, toScreen(mount, view, height)), cameraDistance: cameraDistance(mount, view, height) };
	});
	return candidates.filter(function (candidate) { return candidate.d <= Math.max(11, 23 * view.scale); })
		.sort(nearestScreenCenter)[0]?.index ?? -1;
};

export const pickEnemy = function (point: Point, view: View, enemies: readonly Enemy[]): Enemy | undefined {
	if (!usable(view) || !finitePoint(point)) return undefined;
	return enemies.map(function (enemy) {
		return {
			enemy,
			d: distance(point, toScreen(enemy, view, FLIGHT_HEIGHT)),
			radius: Math.max(14, (enemy.kind === 'flagship' ? 62 : enemy.kind === 'armored' ? 33 : 27) * view.scale),
			cameraDistance: cameraDistance(enemy, view, FLIGHT_HEIGHT),
		};
	}).filter(function (candidate) { return candidate.d <= candidate.radius; })
		.sort(nearestScreenCenter)[0]?.enemy;
};

export const depth = function (point: Point): number { return point.x + point.y; };

export const edgeIndicator = function (point: Point, view: View): { point: Point; angle: number } | undefined {
	if (!usable(view)) return undefined;
	const at = toScreen(point, view, FLIGHT_HEIGHT);
	if (!finitePoint(at)) return undefined;
	const left = 18;
	const right = view.width - 18;
	const top = 95;
	const bottom = view.height - 65;
	if (left >= right || top >= bottom) return undefined;
	if (at.x >= left && at.x <= right && at.y >= top && at.y <= bottom) return undefined;
	const center = { x: Math.max(left, Math.min(right, view.cx)), y: Math.max(top, Math.min(bottom, view.cy)) };
	const dx = at.x - center.x;
	const dy = at.y - center.y;
	const fx = dx > 0 ? (right - center.x) / dx : dx < 0 ? (left - center.x) / dx : Infinity;
	const fy = dy > 0 ? (bottom - center.y) / dy : dy < 0 ? (top - center.y) / dy : Infinity;
	const fraction = Math.min(fx, fy);
	return { point: { x: center.x + dx * fraction, y: center.y + dy * fraction }, angle: Math.atan2(dy, dx) };
};
