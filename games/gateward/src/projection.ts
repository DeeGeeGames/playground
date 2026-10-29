import { isoToWorld, worldToIso, type IsoProjectionState } from 'ecspresso/plugins/isometric/projection';
import { distance, type Enemy, type Mount, type Point } from './simulation';

// Reuse the published isometric plugin's forward/inverse mapping in our Canvas adapter.
const iso: IsoProjectionState = { tileWidth: Math.sqrt(3), tileHeight: 1, originX: 0, originY: 0 };
export const DECK_HEIGHT = 22;
export const TURRET_HEIGHT = 40;
export const FLIGHT_HEIGHT = 36;
export interface View { width: number; height: number; scale: number; cx: number; cy: number }
export const viewFor = function (width: number, height: number): View {
	return { width, height, scale: width < 650 ? Math.min(width / 890, height / 680) : Math.min(width / 1380, height / 840), cx: width / 2, cy: height * 0.52 };
};
export const project = function (point: Point, elevation = 0): Point {
	const at = worldToIso(point.x, point.y, iso); return { x: at.x, y: at.y - elevation };
};
export const toScreen = function (point: Point, view: View, elevation = 0): Point {
	const at = project(point, elevation); return { x: view.cx + at.x * view.scale, y: view.cy + at.y * view.scale };
};
export const toWorld = function (point: Point, view: View, elevation = 0): Point {
	return isoToWorld((point.x - view.cx) / view.scale, (point.y - view.cy) / view.scale + elevation, iso);
};
export const mountHeight = function (mount: Mount): number { return mount.weapon ? TURRET_HEIGHT : DECK_HEIGHT; };
export const pickMount = function (point: Point, view: View, mounts: readonly Mount[]): number {
	const candidates = mounts.map(function (mount, index) { return { index, d: distance(point, toScreen(mount, view, mountHeight(mount))) }; });
	return candidates.filter(function (candidate) { return candidate.d <= Math.max(11, 23 * view.scale); })
		.sort(function (a, b) { return a.d - b.d; })[0]?.index ?? -1;
};
export const pickEnemy = function (point: Point, view: View, enemies: readonly Enemy[]): Enemy | undefined {
	return enemies.map(function (enemy) {
		return { enemy, d: distance(point, toScreen(enemy, view, FLIGHT_HEIGHT)), radius: Math.max(14, (enemy.kind === 'flagship' ? 62 : enemy.kind === 'armored' ? 33 : 27) * view.scale) };
	}).filter(function (candidate) { return candidate.d <= candidate.radius; })
		.sort(function (a, b) { return a.d - b.d || b.enemy.x + b.enemy.y - a.enemy.x - a.enemy.y; })[0]?.enemy;
};
export const depth = function (point: Point): number { return point.x + point.y; };
export const edgeIndicator = function (point: Point, view: View): { point: Point; angle: number } | undefined {
	const at = toScreen(point, view, FLIGHT_HEIGHT); const left = 18; const right = view.width - 18; const top = 95; const bottom = view.height - 65;
	if (at.x >= left && at.x <= right && at.y >= top && at.y <= bottom) return undefined;
	const dx = at.x - view.cx; const dy = at.y - view.cy;
	const fx = dx > 0 ? (right - view.cx) / dx : dx < 0 ? (left - view.cx) / dx : Infinity;
	const fy = dy > 0 ? (bottom - view.cy) / dy : dy < 0 ? (top - view.cy) / dy : Infinity;
	const fraction = Math.min(fx, fy);
	return { point: { x: view.cx + dx * fraction, y: view.cy + dy * fraction }, angle: Math.atan2(dy, dx) };
};
