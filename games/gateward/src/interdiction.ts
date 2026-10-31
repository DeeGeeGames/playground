import type { Enemy, Point, State } from './simulation';
import { localPoint } from './space';

export const INTERDICTION_CONFIG = {
	cost: 90, radius: 110, lifetime: 30, cooldown: 40, maxRange: 450,
	minArkClearance: 8, minRelativeX: -50, leftBehind: 650,
} as const;
export interface InterdictionField { id: number; world: Point; remaining: number }
export interface Detour { fieldId: number; waypoint: Point; side: -1 | 1 }

export const fieldRelative = function (state: State): Point | undefined {
	const field = state.systems.interdiction.field;
	return field ? localPoint(state, field.world) : undefined;
};

// Tangency counts as blocked. Return the first hit so the absorption effect sits on the boundary.
export const circleHit = function (from: Point, to: Point, center: Point, radius: number): Point | undefined {
	const x = from.x - center.x; const y = from.y - center.y;
	const dx = to.x - from.x; const dy = to.y - from.y;
	const c = x * x + y * y - radius * radius;
	if (c <= 0) return { ...from };
	const a = dx * dx + dy * dy;
	if (a === 0) return undefined;
	const b = x * dx + y * dy; const discriminant = b * b - a * c;
	if (discriminant < -1e-8) return undefined;
	const t = (-b - Math.sqrt(Math.max(0, discriminant))) / a;
	return t >= 0 && t <= 1 ? { x: from.x + dx * t, y: from.y + dy * t } : undefined;
};
export const fieldBlocks = function (state: State, from: Point, to: Point): boolean {
	const center = state.systems.interdiction.field?.world;
	return center !== undefined && circleHit(from, to, center, INTERDICTION_CONFIG.radius) !== undefined;
};
export const enemyClearance = function (enemy: Pick<Enemy, 'kind'>): number {
	return INTERDICTION_CONFIG.radius + (enemy.kind === 'flagship' ? 38 : enemy.kind === 'armored' ? 23 : 15) + 12;
};
// Encounters enter on their established bearing. A field at the edge of placement
// range can cover that entry point, so begin the new ship farther out on the same ray.
export const arrivalOutsideField = function (state: State, point: Point, kind: Enemy['kind']): Point {
	const center = state.systems.interdiction.field?.world; const radius = enemyClearance({ kind });
	if (!center || Math.hypot(point.x - center.x, point.y - center.y) > radius) return point;
	const x = point.x - state.ark.x; const y = point.y - state.ark.y;
	const length = Math.hypot(x, y);
	if (length === 0) return { x: center.x + radius + 1, y: center.y };
	const dx = x / length; const dy = y / length;
	const along = (center.x - state.ark.x) * dx + (center.y - state.ark.y) * dy;
	const across = (center.x - state.ark.x) * dy - (center.y - state.ark.y) * dx;
	const outside = Math.max(length, along + Math.sqrt(Math.max(0, radius * radius - across * across)) + 1);
	return { x: state.ark.x + dx * outside, y: state.ark.y + dy * outside };
};

// Navigation supplies world waypoints to the same steering used in open space.
// Allow room to brake and turn before the physical field boundary.
export const navigateField = function (state: State, enemy: Enemy, destination: Point, speed: number, dt: number): Point | undefined {
	const systems = state.systems; const field = systems.interdiction.field; const center = field?.world;
	if (!field || !center) { delete enemy.detour; delete enemy.interdictionSide; return undefined; }
	const turnRate = enemy.kind === 'armored' || enemy.kind === 'flagship' ? 0.7 : 3;
	const radius = enemyClearance(enemy) + speed / turnRate;
	const blocked = circleHit(enemy, destination, center, radius - 8) !== undefined;
	if (!blocked) { delete enemy.detour; return undefined; }
	if (!enemy.detour || enemy.detour.fieldId !== field.id) {
		const cross = (enemy.x - center.x) * (destination.y - center.y) - (enemy.y - center.y) * (destination.x - center.x);
		const remembered = enemy.interdictionSide?.fieldId === field.id ? enemy.interdictionSide : undefined;
		const side: -1 | 1 = remembered?.side ?? (Math.abs(cross) < 1e-6 ? enemy.id % 2 === 0 ? 1 : -1 : cross > 0 ? 1 : -1);
		const angle = Math.atan2(enemy.y - center.y, enemy.x - center.x);
		const distance = Math.hypot(enemy.x - center.x, enemy.y - center.y);
		const tangent = angle + side * Math.acos(Math.min(1, radius / Math.max(radius, distance)));
		enemy.detour = { fieldId: field.id, side, waypoint: { x: field.world.x + Math.cos(tangent) * radius, y: field.world.y + Math.sin(tangent) * radius } };
		if (!remembered) systems.interdiction.redirected++;
		enemy.interdictionSide = { fieldId: field.id, side };
	}
	const detour = enemy.detour;
	let waypoint = detour.waypoint;
	// A target inside the field cannot be engaged. Wait at the boundary until it emerges;
	// repeatedly circling an unreachable escort would otherwise create an infinite orbit.
	const targetInside = Math.hypot(destination.x - center.x, destination.y - center.y) <= INTERDICTION_CONFIG.radius;
	if (Math.hypot(enemy.x - waypoint.x, enemy.y - waypoint.y) <= Math.max(8, speed * dt + 0.1) && !targetInside) {
		const angle = Math.atan2(waypoint.y - center.y, waypoint.x - center.x) + detour.side * 0.25;
		detour.waypoint = { x: field.world.x + Math.cos(angle) * radius, y: field.world.y + Math.sin(angle) * radius };
		waypoint = detour.waypoint;
	}
	return waypoint;
};

export const advanceInterdiction = function (state: State, dt: number) {
	const interdiction = state.systems.interdiction;
	interdiction.cooldown = Math.max(0, interdiction.cooldown - dt);
	const field = interdiction.field;
	if (!field) return;
	field.remaining = Math.max(0, field.remaining - dt);
	const relative = fieldRelative(state);
	if (field.remaining > 1e-8 && relative && relative.x >= -INTERDICTION_CONFIG.leftBehind) return;
	interdiction.field = undefined;
	for (const enemy of state.enemies) { delete enemy.detour; delete enemy.interdictionSide; }
};
